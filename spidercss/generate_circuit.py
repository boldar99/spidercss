import argparse
import glob
import hashlib
import json
import multiprocessing as mp
import os
import random
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable, Sequence

os.environ["KMP_WARNINGS"] = "0"

import numpy as np
import stim

from spidercss.cat_at_origin import cat_at_origin
from spidercss.hook_errors import characterize_stabilizer_splits
from spidercss.optimize_parity_matrix import row_optimize_matrix
from spidercss.qubit_reuse import build_circuit_dag, dag_to_circuit
from spidercss.resource_targets import ReuseTarget
from spidercss.stim_utils import get_cnot_depth
from spidercss.utils import (
    FAO_hard_QECCS,
    FAO_simp_QECCS,
    NOISE_GATES,
    get_conj_M,
    get_project_root,
    load_FAO_circ,
    load_qecc,
    very_hard_QECCS,
)

CP_SAT_SEED_MODULUS = 2**31 - 1

ALL_ROUTING_HEURISTICS = (
    "joint_resource",
    "critical_path_first",
    "earliest_start_first",
    "active_spider_first",
    "sa_sequence_distance",
)

DEFAULT_ROUTING_HEURISTICS = ("active_spider_first",)


def get_spidercss_circuits_dir() -> Path:
    return get_project_root().joinpath("assets", "circuits", "SpiderCSS")


def extract_scheduled_circuit_from_json(stats: dict) -> stim.Circuit:
    """Reconstructs the noiseless scheduled Stim circuit from a simulation JSON record."""
    perfect_str = stats.get("perfect_stim", "")
    noisy_str = stats.get("noisy_circuit", "")
    if not noisy_str:
        return stim.Circuit(perfect_str)

    lines = noisy_str.splitlines()
    if "TICK" in lines:
        last_tick_idx = len(lines) - 1 - lines[::-1].index("TICK")
        body_lines = lines[:last_tick_idx]
    else:
        body_lines = lines

    clean_lines = []
    for line in body_lines:
        stripped = line.strip()
        if not stripped:
            continue
        op = stripped.split("(")[0].split()[0]
        if op in NOISE_GATES or op == "TICK":
            continue
        clean_lines.append(stripped)

    if perfect_str:
        perfect_circ = stim.Circuit(perfect_str)
        for inst in perfect_circ:
            if inst.name == "DETECTOR":
                clean_lines.append(str(inst))

    return stim.Circuit("\n".join(clean_lines))


def extract_circuits_from_simulation_results(
    results_dir: Path | str | None = None,
    output_dir: Path | str | None = None,
) -> list[Path]:
    """Extracts SpiderCSS scheduled circuits from simulation_results/*.json into assets/circuits/SpiderCSS."""
    if results_dir is None:
        results_dir = get_project_root().joinpath("simulation_results")
    else:
        results_dir = Path(results_dir)

    if output_dir is None:
        output_dir = get_spidercss_circuits_dir()
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    candidates: dict[tuple[str, str], list[tuple[int, float, dict]]] = defaultdict(list)
    for json_path in sorted(glob.glob(str(results_dir.joinpath("*.json")))):
        with open(json_path, "r") as f:
            stats = json.load(f)

        method = stats.get("method", "")
        if not method.startswith("SpiderCSS"):
            continue

        perfect_str = stats.get("perfect_stim", "")
        if "R_XX" in perfect_str:
            continue

        code = stats["code"]
        routing_heuristic = method.replace("SpiderCSS (", "").replace(")", "").strip()
        num_samples = int(stats.get("num_samples", 0) or 0)
        mtime = os.path.getmtime(json_path)
        candidates[(code, routing_heuristic)].append((num_samples, mtime, stats))

    saved_files: list[Path] = []
    for (code, routing_heuristic), records in sorted(candidates.items()):
        # Prefer the run with the most samples, breaking ties by most recent file modification time
        _, _, best_stats = max(records, key=lambda item: (item[0], item[1]))
        sched_circ = extract_scheduled_circuit_from_json(best_stats)
        out_path = output_dir.joinpath(f"{code}_{routing_heuristic}.stim")
        with open(out_path, "w") as f:
            f.write(str(sched_circ) + "\n")
        saved_files.append(out_path)
        print(f"Extracted {out_path.name} (hash={best_stats.get('circuit_hash')}, samples={best_stats.get('num_samples')})")

    return saved_files


def generate_circuits_for_code(
    code: str,
    routing_heuristics: Sequence[str] = DEFAULT_ROUTING_HEURISTICS,
    schedule_heuristic: str | None = None,
    output_dir: Path | str | None = None,
    generate_reuse_variants: bool = True,
    generate_scheduled_variants: bool = True,
    overwrite: bool = True,
) -> dict[str, Path]:
    """Synthesizes and saves SpiderCSS circuits (qubits, depth, and scheduled routing variants) for a code."""
    if output_dir is None:
        output_dir = get_spidercss_circuits_dir()
    else:
        output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    very_hard = set(very_hard_QECCS())
    if schedule_heuristic is None:
        schedule_heuristic = "greedy" if code in very_hard else "exact"

    qubits_path = output_dir.joinpath(f"{code}_qubits.stim")
    depth_path = output_dir.joinpath(f"{code}_depth.stim")
    sched_paths = {
        rh: output_dir.joinpath(f"{code}_{rh}.stim")
        for rh in routing_heuristics
    }

    need_reuse = generate_reuse_variants and (
        overwrite or not (qubits_path.exists() and depth_path.exists())
    )
    need_sched = generate_scheduled_variants and any(
        overwrite or not path.exists() for path in sched_paths.values()
    )

    saved: dict[str, Path] = {}
    if not need_reuse and not need_sched:
        print(f"[{code}] All requested circuits already exist in {output_dir}, skipping.")
        if generate_reuse_variants:
            saved["qubits"] = qubits_path
            saved["depth"] = depth_path
        if generate_scheduled_variants:
            saved.update(sched_paths)
        return saved

    seed_val = int(hashlib.sha256(code.encode()).hexdigest()[:8], 16) % CP_SAT_SEED_MODULUS
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
    matrix_rng = np.random.RandomState(seed_val)
    t = (d - 1) // 2

    print(f"[{code}] Pre-computing SpiderCSS row optimizations...")
    _, matrix_after_row_ops = row_optimize_matrix(H_x, t, max_basis_tries=10_000, rng=matrix_rng)
    print(f"[{code}] Pre-computing SpiderCSS hook error characterization...")
    hook_results = characterize_stabilizer_splits(get_conj_M(matrix_after_row_ops))

    # Maintain identical RNG stream to historical benchmark pipeline when FAO circuit exists
    try:
        fao_circ = load_FAO_circ(code)
        fao_dag = build_circuit_dag(fao_circ)
        dag_to_circuit(fao_dag, heuristic=schedule_heuristic, random_seed=seed_val)
    except Exception:
        pass

    if generate_reuse_variants:
        if overwrite or not qubits_path.exists():
            print(f"[{code}] Generating SpiderCSS Max Reuse (qubits) circuit...")
            cao_max = cat_at_origin(
                matrix_after_row_ops,
                d,
                basis=basis,
                analyze_hook_errors=True,
                _hook_results=hook_results,
                is_perfect_code=is_perfect_code,
                reuse_target=ReuseTarget.QUBITS,
            )
            with open(qubits_path, "w") as f:
                f.write(str(cao_max) + "\n")
            print(
                f"[{code} SpiderCSS] Max Reuse -> Qubits: {cao_max.num_qubits}, "
                f"Depth: {get_cnot_depth(cao_max)} (saved to {qubits_path.name})"
            )
        saved["qubits"] = qubits_path

        if overwrite or not depth_path.exists():
            print(f"[{code}] Generating SpiderCSS Min Reuse (depth) circuit...")
            cao_min = cat_at_origin(
                matrix_after_row_ops,
                d,
                basis=basis,
                analyze_hook_errors=True,
                _hook_results=hook_results,
                is_perfect_code=is_perfect_code,
                reuse_target=ReuseTarget.DEPTH,
            )
            with open(depth_path, "w") as f:
                f.write(str(cao_min) + "\n")
            print(
                f"[{code} SpiderCSS] Min Reuse -> Qubits: {cao_min.num_qubits}, "
                f"Depth: {get_cnot_depth(cao_min)} (saved to {depth_path.name})"
            )
        saved["depth"] = depth_path

    if generate_scheduled_variants:
        for routing_heuristic in routing_heuristics:
            out_path = sched_paths[routing_heuristic]
            if not overwrite and out_path.exists():
                saved[routing_heuristic] = out_path
                continue
            print(f"[{code}] Generating SpiderCSS scheduled circuit for {routing_heuristic}...")
            cao_none = cat_at_origin(
                matrix_after_row_ops,
                d,
                basis=basis,
                analyze_hook_errors=True,
                _hook_results=hook_results,
                is_perfect_code=is_perfect_code,
                reuse_target=ReuseTarget.NONE,
                routing_heuristic=routing_heuristic,
            )
            cao_dag = build_circuit_dag(cao_none)
            cao_scheduled, _ = dag_to_circuit(
                cao_dag, heuristic=schedule_heuristic, random_seed=seed_val
            )
            with open(out_path, "w") as f:
                f.write(str(cao_scheduled) + "\n")
            saved[routing_heuristic] = out_path
            print(f"[{code} SpiderCSS ({routing_heuristic})] Saved to {out_path.name}")

    return saved


def _generate_worker(args):
    (
        code,
        routing_heuristics,
        schedule_heuristic,
        output_dir,
        generate_reuse_variants,
        generate_scheduled_variants,
        overwrite,
    ) = args
    return code, generate_circuits_for_code(
        code=code,
        routing_heuristics=routing_heuristics,
        schedule_heuristic=schedule_heuristic,
        output_dir=output_dir,
        generate_reuse_variants=generate_reuse_variants,
        generate_scheduled_variants=generate_scheduled_variants,
        overwrite=overwrite,
    )


def generate_circuits(
    code_iterator: Iterable[str],
    routing_heuristics: Sequence[str] = DEFAULT_ROUTING_HEURISTICS,
    schedule_heuristic: str | None = None,
    output_dir: Path | str | None = None,
    generate_reuse_variants: bool = True,
    generate_scheduled_variants: bool = True,
    overwrite: bool = True,
    max_workers: int = 1,
) -> dict[str, dict[str, Path]]:
    codes = list(code_iterator)
    results: dict[str, dict[str, Path]] = {}

    if max_workers <= 1 or len(codes) <= 1:
        for code in codes:
            results[code] = generate_circuits_for_code(
                code=code,
                routing_heuristics=routing_heuristics,
                schedule_heuristic=schedule_heuristic,
                output_dir=output_dir,
                generate_reuse_variants=generate_reuse_variants,
                generate_scheduled_variants=generate_scheduled_variants,
                overwrite=overwrite,
            )
    else:
        tasks = [
            (
                code,
                tuple(routing_heuristics),
                schedule_heuristic,
                str(output_dir) if output_dir is not None else None,
                generate_reuse_variants,
                generate_scheduled_variants,
                overwrite,
            )
            for code in codes
        ]
        with ProcessPoolExecutor(max_workers=max_workers) as executor:
            futures = [executor.submit(_generate_worker, t) for t in tasks]
            for future in as_completed(futures):
                code, saved = future.result()
                results[code] = saved

    return results


def generate_triorthogonal_circuits(**kwargs):
    return generate_circuits(["49_1_5", "95_1_7"], **kwargs)


def generate_simple_circuits(**kwargs):
    return generate_circuits(FAO_simp_QECCS(), **kwargs)


def generate_hard_circuits(**kwargs):
    return generate_circuits(FAO_hard_QECCS(), **kwargs)


def generate_very_hard_circuits(**kwargs):
    kwargs.setdefault("schedule_heuristic", "greedy")
    return generate_circuits(very_hard_QECCS(), **kwargs)


def generate_all_circuits(**kwargs):
    all_codes = list(FAO_simp_QECCS()) + list(FAO_hard_QECCS()) + list(very_hard_QECCS())
    return generate_circuits(all_codes, **kwargs)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate or extract SpiderCSS fault-tolerant state preparation circuits."
    )
    parser.add_argument(
        "--codes",
        nargs="+",
        default=None,
        help="Specific QECC code names to generate (default: all 18 benchmark codes).",
    )
    parser.add_argument(
        "--heuristics",
        nargs="+",
        default=list(DEFAULT_ROUTING_HEURISTICS),
        help="Routing heuristics to generate scheduled no-reuse circuits for.",
    )
    parser.add_argument(
        "--all-heuristics",
        action="store_true",
        help="Generate scheduled no-reuse circuits for all 5 routing heuristics.",
    )
    parser.add_argument(
        "--extract-from-results",
        action="store_true",
        help="Extract scheduled circuits directly from simulation_results/*.json.",
    )
    parser.add_argument(
        "--reuse-only",
        action="store_true",
        help="Only generate the _qubits.stim and _depth.stim reuse circuits.",
    )
    parser.add_argument(
        "--scheduled-only",
        action="store_true",
        help="Only generate the scheduled no-reuse circuits.",
    )
    parser.add_argument(
        "--no-overwrite",
        action="store_true",
        help="Do not overwrite existing .stim circuit files.",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="Number of parallel worker processes (default: 1).",
    )
    args = parser.parse_args()

    if args.extract_from_results:
        extract_circuits_from_simulation_results()

    if not args.extract_from_results or args.reuse_only or args.scheduled_only or args.codes:
        heuristics = ALL_ROUTING_HEURISTICS if args.all_heuristics else tuple(args.heuristics)
        target_codes = (
            args.codes
            if args.codes is not None
            else list(FAO_simp_QECCS()) + list(FAO_hard_QECCS()) + list(very_hard_QECCS())
        )
        generate_circuits(
            target_codes,
            routing_heuristics=heuristics,
            generate_reuse_variants=not args.scheduled_only,
            generate_scheduled_variants=not args.reuse_only,
            overwrite=not args.no_overwrite,
            max_workers=args.workers,
        )
