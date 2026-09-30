from spidercss.resource_targets import ReuseTarget
BENCHMARK_REUSE_TARGETS = (
    ReuseTarget.QUBITS,
    ReuseTarget.DEPTH,
    ReuseTarget.BALANCED,
    ReuseTarget.NONE,
)

import os
import multiprocessing as mp
os.environ["KMP_WARNINGS"] = "0"
mp.set_start_method("fork", force=True)

import json
import hashlib
import random
import numpy as np
import stim
import pandas as pd
from tqdm import tqdm
import galois
from concurrent.futures import ProcessPoolExecutor, as_completed

from spidercss.hook_errors import characterize_stabilizer_splits
from spidercss.optimize_parity_matrix import row_optimize_matrix
from spidercss.cat_at_origin import cat_at_origin
from spidercss.resource_scheduling import plan_resource_aware_reuse
from spidercss.resource_targets import ReuseTarget
from spidercss.utils import load_qecc, get_conj_M, load_FAO_circ, FAO_simp_QECCS, FAO_hard_QECCS, very_hard_QECCS
from spidercss.stim_utils import make_stim_circ_noisy, get_cnot_depth
from spidercss.qubit_reuse import build_circuit_dag, dag_to_circuit
from spidercss.lut_decoder import LutDecoder

CP_SAT_SEED_MODULUS = 2**31 - 1

_ESTIMATE_LER = True
_G_CIRC_STR = None
_G_DECODER = None
_G_H_X = None
_G_L_X = None

def _simulate_batch(batch_size):
    sampler = stim.Circuit(_G_CIRC_STR).compile_sampler()
    samples = sampler.sample(batch_size)

    _GF = galois.GF(2)
    g_H_x_T = _GF(_G_H_X.T)
    g_L_x_T = _GF(_G_L_X.T)

    is_flagged = np.any(samples[:, :-_G_H_X.shape[1]], axis=1)
    num_flagged = np.sum(is_flagged)

    filtered_samples = samples[~is_flagged]
    raw_measurements = filtered_samples[:, -_G_H_X.shape[1]:]

    g_raw = _GF(raw_measurements.astype(np.int8))
    syndromes = g_raw @ g_H_x_T

    if not _ESTIMATE_LER:
        return batch_size, int(num_flagged), 0, None

    corrections, valid_mask = _G_DECODER.batch_decode_z(syndromes)

    valid_corrections = corrections[valid_mask]
    num_discarded = len(syndromes) - len(valid_corrections)

    valid_measurements = raw_measurements[valid_mask]
    corrected_measurements = valid_measurements ^ valid_corrections

    g_corrected = _GF(corrected_measurements.astype(np.int8))
    predicted_logicals = g_corrected @ g_L_x_T

    incorrect_predictions = np.any(predicted_logicals, axis=1)
    num_incorrect = np.sum(incorrect_predictions)

    return batch_size, int(num_flagged), int(num_discarded), int(num_incorrect)

def run_simulation(code, method_name, circ_with_reuse, scheduled_circ, H_x, H_z, L_z, max_weight, p, num_samples, estimate_ler, num_qubits_max, depth_max, num_qubits_min, depth_min):
    global _G_DECODER, _G_CIRC_STR, _G_H_X, _G_L_X, _ESTIMATE_LER

    n_data = H_x.shape[1]
    noisy_circ, _ = make_stim_circ_noisy(scheduled_circ, p, one_cnot_per_layer=True)
    
    basis = "X" if code in ("15_1_3", "49_1_5", "95_1_7") else "Z"
    noisy_circ.append("M" + basis, range(n_data))

    for idx, H in enumerate(H_z):
        qubit_indices = np.where(H == 1)[0]
        record_targets = [stim.target_rec(q - n_data) for q in qubit_indices]
        noisy_circ.append("DETECTOR", record_targets)
    for idx, L in enumerate(L_z):
        qubit_indices = np.where(L == 1)[0]
        record_targets = [stim.target_rec(q - n_data) for q in qubit_indices]
        noisy_circ.append("OBSERVABLE_INCLUDE", record_targets, idx)

    num_cx = 0
    for operation in circ_with_reuse.flattened():
        if operation.name not in {"CX", "CNOT"}:
            continue
        targets = operation.targets_copy()
        num_cx += sum(
            all(target.is_qubit_target for target in targets[index:index + 2])
            for index in range(0, len(targets), 2)
        )
    num_flags = circ_with_reuse.num_qubits - H_z.shape[1]
    num_qubits_original = circ_with_reuse.num_qubits

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
    _ESTIMATE_LER = estimate_ler
    _G_H_X = H_z
    _G_L_X = L_z
    
    if remaining_samples > 0:
        if _G_DECODER is None and estimate_ler:
            _G_DECODER = LutDecoder(H_z, max_decodable_weight=max_weight, verbose=True)
        batch_size = 1_000_000
        num_full_batches = remaining_samples // batch_size
        remainder = remaining_samples % batch_size
        batches = [batch_size] * num_full_batches
        if remainder > 0:
            batches.append(remainder)

        print(f"[{code} - {method_name}] Running {remaining_samples} additional samples (Total existing: {total_shots})...")

        num_cores = max(1, mp.cpu_count() - 2)
        with ProcessPoolExecutor(max_workers=num_cores) as executor:
            futures = [executor.submit(_simulate_batch, b_size) for b_size in batches]

            with tqdm(total=remaining_samples, desc=f"Simulating {code} [{method_name}]") as pbar:
                for future in as_completed(futures):
                    b_size, n_flagged, n_discarded, n_incorrect = future.result()
                    total_shots += b_size
                    total_flagged += n_flagged
                    total_discarded += n_discarded
                    total_incorrect = (total_incorrect + n_incorrect) if estimate_ler else None

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
        print(f"[{code} - {method_name}] Using {total_shots} cached samples from {csv_file}")

    AR = 1.0 - (total_flagged / total_shots) if total_shots > 0 else 0.0
    total_valid_corrections = total_shots - total_flagged - total_discarded
    total_AR = total_valid_corrections / total_shots if total_shots > 0 else None

    if estimate_ler:
        LER = total_incorrect / total_valid_corrections if total_valid_corrections > 0 else 0.0
    else:
        LER = None

    stats = {
        "code": code,
        "method": method_name,
        "p": p,
        "num_samples": total_shots,
        "total_flagged": total_flagged,
        "total_discarded": total_discarded,
        "total_incorrect": total_incorrect,
        "logical_error_rate": LER,
        "acceptance_rate": total_AR,
        "raw_acceptance_rate": AR,
        "num_cx": num_cx,
        "num_flags": num_flags,
        "num_qubits_original": num_qubits_original,
        "num_qubits_max": num_qubits_max,
        "depth_max": depth_max,
        "num_qubits_min": num_qubits_min,
        "depth_min": depth_min,
        "circuit_hash": circ_hash,
        "perfect_stim": str(circ_with_reuse),
        "noisy_circuit": circ_str,
    }

    print(f"--- Results for {method_name} ---")
    if stats['logical_error_rate'] is not None:
        print(f"Logical Error Rate = {stats['logical_error_rate']:.4e}", end=";\t ")
    if stats['acceptance_rate'] is not None:
        print(f"Acceptance Rate = {stats['acceptance_rate']:.4f}", end=";\t ")
    print(f"CXs = {stats['num_cx']}")
    print()

    json_file = f"simulation_results/{code}_{method_name}_{circ_hash}.json"
    with open(json_file, "w") as f:
        json.dump(stats, f, indent=4)

    return stats


def benchmark_state_prep(code: str, p: float, num_samples_fn, estimate_ler: bool):
    global _G_DECODER
    seed_val = (int(hashlib.sha256(code.encode()).hexdigest()[:8], 16) % CP_SAT_SEED_MODULUS)
    random.seed(seed_val)
    np.random.seed(seed_val)

    try:
        _, H_x, H_z, L_x, L_z, d = load_qecc(code, "FAO")
    except FileNotFoundError:
        _, H_x, H_z, L_x, L_z, d = load_qecc(code)

    basis = "X" if code in ("15_1_3", "49_1_5", "95_1_7") else "Z"
    if basis == "X":
        H_x, H_z = H_z, H_x
        L_x, L_z = L_z, L_x

    is_perfect_code = code in ("7_1_3", "23_1_7")
    n_data = H_x.shape[1]
    max_weight = None if bool(d % 2) else (d - 1) // 2
    num_samples = num_samples_fn(d)

    _G_DECODER = None

    # Pre-computation for SpiderCSS
    matrix_rng = np.random.RandomState(seed_val)
    t = (d - 1) // 2
    print(f"[{code}] Pre-computing SpiderCSS row optimizations...")
    _, matrix_after_row_ops = row_optimize_matrix(H_x, t, max_basis_tries=10_000, rng=matrix_rng)
    print(f"[{code}] Pre-computing SpiderCSS hook error characterization...")
    hook_results = characterize_stabilizer_splits(get_conj_M(matrix_after_row_ops))

    all_stats = []

    # ==========================
    # FAO Processing
    # ==========================
    print(f"[{code}] Generating FAO circuits...")
    try:
        fao_circ = load_FAO_circ(code)

        # 1. Max Reuse
        fao_max = plan_resource_aware_reuse(fao_circ, n_data, heuristic="decross_greedy", target=ReuseTarget.QUBITS)
        num_qubits_max_fao = fao_max.circuit.num_qubits
        depth_max_fao = get_cnot_depth(fao_max.circuit)
        print(f"[{code} FaO] Max Reuse -> Qubits: {num_qubits_max_fao}, Depth: {depth_max_fao}")

        # 2. Min Reuse
        fao_min = plan_resource_aware_reuse(fao_circ, n_data, heuristic="naive", target=ReuseTarget.QUBITS)
        num_qubits_min_fao = fao_min.circuit.num_qubits
        depth_min_fao = get_cnot_depth(fao_min.circuit)
        print(f"[{code} FaO] Min Reuse -> Qubits: {num_qubits_min_fao}, Depth: {depth_min_fao}")

        # 3. No Reuse (Exact Scheduled)
        fao_dag = build_circuit_dag(fao_circ)
        fao_scheduled, _ = dag_to_circuit(fao_dag, heuristic="alap", random_seed=seed_val)

        stats_fao = run_simulation(code, "FaO", fao_circ, fao_scheduled, H_x, H_z, L_z, max_weight, p, num_samples, estimate_ler, num_qubits_max_fao, depth_max_fao, num_qubits_min_fao, depth_min_fao)
        all_stats.append(stats_fao)
    except:
        print(f"[{code}] Generating FAO circuit failed...")

    # ==========================
    # SpiderCSS Processing
    # ==========================
    BENCHMARK_ROUTING_HEURISTICS = (
        "joint_resource",
        "critical_path_first",
        "earliest_start_first",
        "active_spider_first",
        "sa_sequence_distance",
    )
    print(f"[{code}] Generating SpiderCSS Max/Min Reuse circuits...")
    
    # 1. Max Reuse (Global optimal over all heuristics)
    cao_max = cat_at_origin(matrix_after_row_ops, d, basis=basis, analyze_hook_errors=True, _hook_results=hook_results, is_perfect_code=is_perfect_code, reuse_target=ReuseTarget.QUBITS)
    num_qubits_max_cao = cao_max.num_qubits
    depth_max_cao = get_cnot_depth(cao_max)
    print(f"[{code} SpiderCSS] Max Reuse -> Qubits: {num_qubits_max_cao}, Depth: {depth_max_cao}")

    # 2. Min Reuse (Global optimal over all heuristics)
    cao_min = cat_at_origin(matrix_after_row_ops, d, basis=basis, analyze_hook_errors=True, _hook_results=hook_results, is_perfect_code=is_perfect_code, reuse_target=ReuseTarget.DEPTH)
    num_qubits_min_cao = cao_min.num_qubits
    depth_min_cao = get_cnot_depth(cao_min)
    print(f"[{code} SpiderCSS] Min Reuse -> Qubits: {num_qubits_min_cao}, Depth: {depth_min_cao}")

    # 3. No Reuse (Exact Scheduled) - evaluated per heuristic
    for routing_heuristic in BENCHMARK_ROUTING_HEURISTICS:
        print(f"[{code}] Generating SpiderCSS LER simulation circuit for {routing_heuristic}...")
        cao_none = cat_at_origin(matrix_after_row_ops, d, basis=basis, analyze_hook_errors=True, _hook_results=hook_results, is_perfect_code=is_perfect_code, reuse_target=ReuseTarget.NONE, routing_heuristic=routing_heuristic)
        cao_dag = build_circuit_dag(cao_none)
        cao_scheduled, _ = dag_to_circuit(cao_dag, heuristic="alap", random_seed=seed_val)

        stats_cao = run_simulation(code, f"SpiderCSS ({routing_heuristic})", cao_none, cao_scheduled, H_x, H_z, L_z, max_weight, p, num_samples, estimate_ler, num_qubits_max_cao, depth_max_cao, num_qubits_min_cao, depth_min_cao)
        all_stats.append(stats_cao)

    return all_stats


def benchmark(code_iterator, p, num_samples, estimate_ler=True):
    for code in code_iterator:
        print(f"--- Benchmarking {code} ---")
        benchmark_state_prep(code, p, num_samples_fn=num_samples, estimate_ler=estimate_ler)


def benchmark_simple_codes():
    return benchmark(["7_1_3", "9_1_3", "23_1_7", "95_1_7"], 0.001, num_samples=lambda d: 100_000_000, estimate_ler=True)


def benchmark_hard_codes():
    return benchmark(FAO_hard_QECCS(), 0.001, num_samples=lambda d: 10_000_000, estimate_ler=False)


def benchmark_very_hard_codes():
    return benchmark(very_hard_QECCS(), 0.0001, num_samples=lambda d: 1_000_000, estimate_ler=False)


if __name__ == "__main__":
    benchmark_simple_codes()
    # benchmark_hard_codes()
    # benchmark_very_hard_codes()
