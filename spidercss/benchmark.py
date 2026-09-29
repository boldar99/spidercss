import os

from spidercss.hook_errors import characterize_stabilizer_splits
from spidercss.optimize_parity_matrix import row_optimize_matrix

os.environ["KMP_WARNINGS"] = "0"
import multiprocessing as mp

mp.set_start_method("fork", force=True)
import hashlib
import pandas as pd
from concurrent.futures import ProcessPoolExecutor, as_completed
from tqdm import tqdm

import numpy as np
import stim
import galois

from spidercss.stim_utils import make_stim_circ_noisy, get_cnot_depth
from spidercss.cat_at_origin import cat_at_origin
from spidercss.resource_scheduling import plan_resource_aware_reuse
from spidercss.resource_targets import ReuseTarget, normalize_reuse_target
from spidercss.utils import load_qecc, FAO_hard_QECCS, very_hard_QECCS, get_conj_M, FAO_simp_QECCS
import json


from spidercss.lut_decoder import LutDecoder

# Globals to inherit via OS fork (Zero-Copy)
_ESTIMATE_LER: bool = True
_G_CIRC_STR: str = None
_G_DECODER: LutDecoder = None
_G_H_X: np.ndarray = None
_G_L_X: np.ndarray = None

BENCHMARK_REUSE_TARGETS = (
    ReuseTarget.QUBITS,
    # ReuseTarget.DEPTH,
)
BENCHMARK_ROUTING_HEURISTICS = (
    "joint_resource",
    "critical_path_first",
    "earliest_start_first",
    "active_spider_first",
    "sa_sequence_distance",
    "joint_resource_earliest_start_first",
)
CP_SAT_SEED_MODULUS = 2**31 - 1


def _simulate_batch(batch_size):
    # Compiling per-batch mathematically guarantees independent PRNG streams
    # and takes negligible time (~11 microseconds)
    sampler = stim.Circuit(_G_CIRC_STR).compile_sampler()
    samples = sampler.sample(batch_size)

    _GF = galois.GF(2)
    g_H_x_T = _GF(_G_H_X.T)
    g_L_x_T = _GF(_G_L_X.T)

    # Flagged shots (any 1 in the flag measurements)
    is_flagged = np.any(samples[:, :-_G_H_X.shape[1]], axis=1)
    num_flagged = np.sum(is_flagged)

    filtered_samples = samples[~is_flagged]
    raw_measurements = filtered_samples[:, -_G_H_X.shape[1]:]

    # Fast GF(2) matrix multiplication for syndromes
    g_raw = _GF(raw_measurements.astype(np.int8))
    syndromes = g_raw @ g_H_x_T

    if not _ESTIMATE_LER:
        return batch_size, int(num_flagged), 0, None

    corrections, valid_mask = _G_DECODER.batch_decode_z(syndromes)

    valid_corrections = corrections[valid_mask]
    num_discarded = len(syndromes) - len(valid_corrections)

    valid_measurements = raw_measurements[valid_mask]
    # Fast bitwise XOR using NumPy
    corrected_measurements = valid_measurements ^ valid_corrections

    # Fast GF(2) matrix multiplication for logicals
    g_corrected = _GF(corrected_measurements.astype(np.int8))
    predicted_logicals = g_corrected @ g_L_x_T

    # Incorrect if any logical observable is flipped
    incorrect_predictions = np.any(predicted_logicals, axis=1)
    num_incorrect = np.sum(incorrect_predictions)

    return batch_size, int(num_flagged), int(num_discarded), int(num_incorrect)


def _benchmark_CAO_state_prep_target(
    code: str,
    analyze_hook_errors: bool,
    p: float,
    num_samples_fn,
    estimate_ler: bool,
    reuse_target: ReuseTarget,
    routing_heuristic: str,
    reuse_decoder: bool,
    matrix_after_row_ops = None,
    hook_results = None,
):
    global _G_DECODER, _G_CIRC_STR, _G_H_X, _G_L_X, _ESTIMATE_LER
    import random
    # CP-SAT's random_seed field is a signed 32-bit integer.  Use one stable
    # code-derived seed across Python, NumPy, and CP-SAT so all circuit-building
    # stages are governed by the same reproducibility contract.
    seed_val = (
        int(hashlib.sha256(code.encode()).hexdigest()[:8], 16)
        % CP_SAT_SEED_MODULUS
    )

    try:
        _, H_x, H_z, L_x, L_z, d = load_qecc(code, "FAO")
    except FileNotFoundError:
        _, H_x, H_z, L_x, L_z, d = load_qecc(code)

    basis = "X" if code in ("15_1_3", "49_1_5", "95_1_7") else "Z"
    if basis == "X":
        print(f"State: |+> (Code {code})")
        H_x, H_z = H_z, H_x
        L_x, L_z = L_z, L_x
    else:
        print(f"State: |0> (Code {code})")
    is_perfect_code = code in ("7_1_3", "23_1_7")

    num_samples = num_samples_fn(d)
    n_data = H_x.shape[1]
    max_weight = None if bool(d % 2) else (d - 1) // 2

    # Build the LUT lazily in the main thread
    decoder = _G_DECODER if reuse_decoder else None

    _ESTIMATE_LER = estimate_ler
    if not reuse_decoder:
        _G_DECODER = None
    _G_H_X = H_z
    _G_L_X = L_z

    random.seed(seed_val)
    np.random.seed(seed_val)
    matrix_rng = np.random.RandomState(seed_val)

    if matrix_after_row_ops is None:
        t = (d - 1) // 2
        _, matrix_after_row_ops = row_optimize_matrix(
            H_x,
            t,
            max_basis_tries=10_000,
            rng=matrix_rng,
        )
    if hook_results is None and analyze_hook_errors:
        hook_results = characterize_stabilizer_splits(get_conj_M(matrix_after_row_ops))

    original_circ = cat_at_origin(
        matrix_after_row_ops, d, basis=basis,
        analyze_hook_errors=analyze_hook_errors,
        _hook_results=hook_results, is_perfect_code=is_perfect_code,
        reuse_target=reuse_target,
        routing_heuristic=routing_heuristic,
    )

    reuse_plan = plan_resource_aware_reuse(
        original_circ, n_data, heuristic="decross_greedy", max_time_seconds=15.0,
        target=reuse_target, random_seed=seed_val,
    )
    circ_with_reuse = reuse_plan.circuit

    noisy_circ, _ = make_stim_circ_noisy(circ_with_reuse, p, one_cnot_per_layer=True)

    noisy_circ.append("M" + basis, range(H_x.shape[1]))

    for i, H in enumerate(H_z):
        qubit_indices = np.where(H == 1)[0]
        record_targets = [stim.target_rec(i - H_x.shape[1]) for i in qubit_indices]
        noisy_circ.append("DETECTOR", record_targets)
    for i, L in enumerate(L_z):
        qubit_indices = np.where(L == 1)[0]
        record_targets = [stim.target_rec(i - H_x.shape[1]) for i in qubit_indices]
        noisy_circ.append("OBSERVABLE_INCLUDE", record_targets, i)

    # Compute circuit properties
    num_cx = 0
    for operation in circ_with_reuse.flattened():
        if operation.name not in {"CX", "CNOT"}:
            continue
        targets = operation.targets_copy()
        num_cx += sum(
            all(target.is_qubit_target for target in targets[index:index + 2])
            for index in range(0, len(targets), 2)
        )
    num_flags = original_circ.num_detectors
    num_qubits = original_circ.num_qubits
    depth = get_cnot_depth(circ_with_reuse)
    num_sim_qubits = reuse_plan.peak_qubits

    # Compute circuit hash and setup CSV caching
    circ_str = str(noisy_circ)
    circ_hash = hashlib.sha256(circ_str.encode()).hexdigest()[:16]

    os.makedirs("simulation_results", exist_ok=True)
    csv_file = f"simulation_results/{code}_{circ_hash}.csv"

    total_shots = 0
    total_flagged = 0
    total_discarded = 0
    total_incorrect = 0

    if os.path.exists(csv_file):
        df = pd.read_csv(csv_file)
        if not df.empty:
            total_shots = int(df['total_shots'].sum())
            total_flagged = int(df['num_flagged'].sum())
            total_discarded = int(df['num_discarded'].sum())
            total_incorrect = int(df['num_incorrect'].sum())

    remaining_samples = max(0, num_samples - total_shots)

    _G_CIRC_STR = circ_str

    if remaining_samples > 0:
        if estimate_ler and decoder is None:
            decoder = LutDecoder(H_z, max_decodable_weight=max_weight, verbose=True)
            _G_DECODER = decoder

        batch_size = 1_000_000
        num_full_batches = remaining_samples // batch_size
        remainder = remaining_samples % batch_size
        batches = [batch_size] * num_full_batches
        if remainder > 0:
            batches.append(remainder)

        print(f"Running {remaining_samples} additional samples (Total existing: {total_shots})...")

        num_cores = max(1, mp.cpu_count() - 2)
        with ProcessPoolExecutor(max_workers=num_cores) as executor:
            futures = [
                executor.submit(_simulate_batch, b_size)
                for b_size in batches
            ]

            with tqdm(
                total=remaining_samples,
                desc=f"Simulating {code} [{reuse_target.value}]",
            ) as pbar:
                for future in as_completed(futures):
                    b_size, n_flagged, n_discarded, n_incorrect = future.result()
                    total_shots += b_size
                    total_flagged += n_flagged
                    total_discarded += n_discarded
                    total_incorrect = (total_incorrect + n_incorrect) if estimate_ler else None

                    # Update CSV incrementally
                    df_new = pd.DataFrame([{
                        "total_shots": b_size,
                        "num_flagged": n_flagged,
                        "num_discarded": n_discarded,
                        "num_incorrect": n_incorrect
                    }])

                    if os.path.exists(csv_file):
                        df_new.to_csv(csv_file, mode='a', header=False, index=False)
                    else:
                        df_new.to_csv(csv_file, index=False)

                    pbar.update(b_size)
    else:
        print(f"Using {total_shots} cached samples from {csv_file}")

    # Compute final metrics
    AR = 1.0 - (total_flagged / total_shots) if total_shots > 0 else 0.0
    total_valid_corrections = total_shots - total_flagged - total_discarded
    total_AR = total_valid_corrections / total_shots if total_shots > 0 else None

    print(f"Discarded {total_discarded} uncorrectable shots.")

    if estimate_ler:
        LER = total_incorrect / total_valid_corrections if total_valid_corrections > 0 else 0.0
    else:
        LER = None

    stats = {
        "code": code,
        "reuse_target": reuse_target.value,
        "routing_heuristic": routing_heuristic,
        "circuit_seed": seed_val,
        # Retained so existing result tables remain readable.
        "analyze_hook_errors": None if hook_results == {} else analyze_hook_errors,
        "p": p,
        "num_samples": total_shots,
        "total_flagged": total_flagged,
        "total_discarded": total_discarded,
        "total_incorrect": total_incorrect,
        "logical_error_rate": LER,
        "acceptance_rate": total_AR ,
        "raw_acceptance_rate": AR,
        "num_cx": num_cx,
        "num_flags": num_flags,
        "num_qubits_original": num_qubits,
        "num_sim_qubits": num_sim_qubits,
        "depth": depth,
        "active_qubit_volume": reuse_plan.active_volume,
        "resource_solver_status": reuse_plan.solver_status,
        "reuse_allocation_status": reuse_plan.allocation_status,
        "reuse_tradeoff_frontier": [
            {
                "num_sim_qubits": point.num_qubits,
                "depth": point.cnot_depth,
                "num_reuse_merges": point.num_reuse_merges,
            }
            for point in reuse_plan.tradeoff_frontier
        ],
        "circuit_volume": int(depth * num_sim_qubits),
        "expected_circuit_volume": int(depth * num_sim_qubits / total_AR) if total_AR is not None and total_AR > 0 else 0,
        "circuit_hash": circ_hash,
        "perfect_stim": str(circ_with_reuse),
        "noisy_circuit": circ_str,
    }

    print(f"--- Results for {reuse_target.value} ---")
    if stats['logical_error_rate'] is not None:
        print(f"Logical Error Rate = {stats['logical_error_rate']:.4e}", end=";\t ")
    if stats['acceptance_rate'] is not None:
        print(f"Acceptance Rate = {stats['acceptance_rate']:.4f}", end=";\t ")
    print(f"CXs = {stats['num_cx']}", end=";\t ")
    print(f"Sim. Qubits = {stats['num_sim_qubits']}", end=";\t ")
    print(f"Flags = {stats['num_flags']}", end=";\t ")
    print(f"Depth = {stats['depth']}", end=";\t ")
    print(f"Expected Circuit Volume = {stats['expected_circuit_volume']}")
    print()

    target_suffix = "" if reuse_target is ReuseTarget.QUBITS else f"_{reuse_target.value}"
    json_file = f"simulation_results/{code}_{routing_heuristic}_{reuse_target.value}_{circ_hash}.json"
    with open(json_file, "w") as f:
        json.dump(stats, f, indent=4)

    return [stats]


def benchmark_CAO_state_prep(
    code: str,
    analyze_hook_errors: bool,
    p=0.001,
    num_samples_fn=lambda _: 100_000_000,
    estimate_ler=True,
    reuse_targets=BENCHMARK_REUSE_TARGETS,
    reuse_target: ReuseTarget | str | None = None,
    routing_heuristics=BENCHMARK_ROUTING_HEURISTICS,
):
    """Benchmarks every requested reuse target with identical random seeds."""
    global _G_DECODER
    # Backwards-compatible singular spelling from the first target API.
    if reuse_target is not None:
        reuse_targets = (reuse_target,)
    if isinstance(reuse_targets, (ReuseTarget, str)):
        reuse_targets = (reuse_targets,)
    targets = tuple(normalize_reuse_target(target) for target in reuse_targets)
    if not targets:
        raise ValueError("At least one reuse target is required.")

    # The decoder depends on the code, not on the resource target.  Retain it
    # across the three target runs just as the original multi-strategy
    # benchmark did.
    if isinstance(routing_heuristics, str):
        routing_heuristics = (routing_heuristics,)
    import hashlib
    import random
    import numpy as np
    from spidercss.utils import load_qecc, get_conj_M
    seed_val = int(hashlib.sha256(code.encode()).hexdigest()[:8], 16)
    try:
        is_self_dual, H_x, H_z, L_x, L_z, d = load_qecc(code, "FAO")
    except FileNotFoundError:
        is_self_dual, H_x, H_z, L_x, L_z, d = load_qecc(code)
    basis = "X" if code in ("15_1_3", "49_1_5", "95_1_7") else "Z"
    if basis == "X":
        H_x, H_z = H_z, H_x
        L_x, L_z = L_z, L_x

    matrix_rng = np.random.RandomState(seed_val)
    t = (d - 1) // 2
    print(f"[{code}] Pre-computing row optimizations (10_000 tries)...")
    _, matrix_after_row_ops = row_optimize_matrix(
        H_x,
        t,
        max_basis_tries=10_000,
        rng=matrix_rng,
    )
    hook_results = None
    if analyze_hook_errors:
        print(f"[{code}] Pre-computing hook error characterization...")
        hook_results = characterize_stabilizer_splits(get_conj_M(matrix_after_row_ops))

    _G_DECODER = None
    all_stats = []
    for target in targets:
        for heuristic in routing_heuristics:
            print(f"=== Reuse target: {target.value} | Heuristic: {heuristic} ===")
            all_stats.extend(
                _benchmark_CAO_state_prep_target(
                    code=code,
                    analyze_hook_errors=analyze_hook_errors,
                    p=p,
                    num_samples_fn=num_samples_fn,
                    estimate_ler=estimate_ler,
                    reuse_target=target,
                    routing_heuristic=heuristic,
                    reuse_decoder=True,
                    matrix_after_row_ops=matrix_after_row_ops,
                    hook_results=hook_results,
                )
            )
    return all_stats


def benchmark(code_iterator, analyze_hook_errors, p, num_samples, estimate_ler=True,
              reuse_targets=BENCHMARK_REUSE_TARGETS):
    for code in code_iterator:
        print(f"--- Benchmarking {code} ---")
        benchmark_CAO_state_prep(
            code, analyze_hook_errors, p, num_samples_fn=num_samples,
            estimate_ler=estimate_ler, reuse_targets=reuse_targets
        )


def benchmark_simple_codes():
    return benchmark(["49_1_5"], True, 0.001, num_samples=lambda d: 100_000_000 if d < 6 else 2_500_000_000, estimate_ler=True)


def benchmark_hard_codes():
    return benchmark(FAO_hard_QECCS(), True, 0.001, num_samples=lambda d: 10_000_000, estimate_ler=False)


def benchmark_very_hard_codes():
    return benchmark(very_hard_QECCS(), True, 0.0001, num_samples=lambda d: 1_000_000, estimate_ler=False)


if __name__ == "__main__":
    benchmark_simple_codes()
    # benchmark_hard_codes()
    # benchmark_very_hard_codes()
