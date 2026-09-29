import glob
import json
import os
import math
from typing import Dict, List, Tuple

from spidercss.utils import load_qecc_data

DEFAULT_RESULTS_DIR = os.path.join(os.path.dirname(__file__), "simulation_results")

BASELINE_DATA = {
    "7_1_3": {"cx": 15, "flags": 3, "sim_qubits": "8", "depth": "10", "ler_bounds": (2.7, 2.9, -5), "ar_bounds": (0.9783, 0.9784)},
    "9_1_3": {"cx": 26, "flags": 9, "sim_qubits": "12", "depth": "9", "ler_bounds": (2.4, 2.6, -5), "ar_bounds": (0.9715, 0.9716)},
    "17_1_5": {"cx": 74, "flags": 21, "sim_qubits": "23", "depth": "25", "ler_bounds": (7.7, 18.2, -7), "ar_bounds": (0.8945, 0.8948)},
    "25_1_5": {"cx": 92, "flags": 28, "sim_qubits": "32", "depth": "23", "ler_bounds": (6.7, 24.2, -7), "ar_bounds": (0.8980, 0.8984)},
    "49_1_5": {"cx": 361, "flags": 105, "sim_qubits": "95", "depth": "59", "ler_bounds": (4.2, 4.7, -5), "ar_bounds": (0.5840, 0.5850)},
    "20_2_6": {"cx": 145, "flags": 47, "sim_qubits": "36", "depth": "54", "ler_bounds": (2.3, 9.7, -8), "ar_bounds": (0.8234, 0.8235)},
    "23_1_7": {"cx": 237, "flags": 80, "sim_qubits": "44", "depth": "33", "ler_bounds": (1.8, 3.1, -7), "ar_bounds": (0.7095, 0.7099)},
    "31_1_7": {"cx": 211, "flags": 69, "sim_qubits": "55", "depth": "58", "ler_bounds": (2.1, 5.4, -7), "ar_bounds": (0.7500, 0.7510)},
    "49_1_7": {"cx": 262, "flags": 85, "sim_qubits": "64", "depth": "46", "ler_bounds": (1.2, 4.4, -7), "ar_bounds": (0.7020, 0.7030)},
    "95_1_7": {"cx": 1175, "flags": 380, "sim_qubits": "258", "depth": "389", "ler_bounds": (4.4, 6.3, -5), "ar_bounds": (0.2400, 0.2410)},
    "49_1_9": {"cx": 408, "flags": 136, "sim_qubits": "93", "depth": "123", "ler_bounds": (1.1, 5.8, -7), "ar_bounds": (0.5310, 0.5320)},
    "81_1_9": {"cx": 614, "flags": 206, "sim_qubits": "141", "depth": "129", "ler_bounds": (2.0, 11.0, -7), "ar_bounds": (0.3550, 0.3560)},
    "47_1_11": {"cx": 1033, "flags": 388, "sim_qubits": "186", "depth": "292", "ler_bounds": (3.6, 17.0, -7), "ar_bounds": (0.1220, 0.1230)},
    "71_1_11": {"cx": 829, "flags": 268, "sim_qubits": "177", "depth": "282", "ler_bounds": (4.4, 29.0, -8), "ar_bounds": (0.2140, 0.2150)},
}

def wilson_score_interval(p, n, z=1.95996):
    if n <= 0:
        return p, p
    denominator = 1 + z**2/n
    center = p + z**2 / (2*n)
    spread = z * math.sqrt(p*(1-p)/n + z**2 / (4*n**2))
    return (center - spread) / denominator, (center + spread) / denominator

def circuit_score(stats):
    ler = stats.get("logical_error_rate")
    qubits = stats.get("num_sim_qubits", float('inf'))
    depth = stats.get("depth", float('inf'))
    if ler is not None and ler > 0:
        # Saving 1 qubit roughly offsets a 5% worse LER
        # Saving 1 depth roughly offsets a 0.5% worse LER
        return math.log(ler) + 0.05 * qubits + 0.005 * depth
    else:
        return qubits + 0.005 * depth

def get_grouped_stats(results_dir: str = DEFAULT_RESULTS_DIR) -> Dict[Tuple[str, str], List[Dict]]:
    """Loads all JSON files and groups them by (code, strategy)."""
    json_files = glob.glob(os.path.join(results_dir, "*.json"))
    grouped_stats = {}
    for f in json_files:
        with open(f, 'r') as file:
            try:
                stats = json.load(file)
                code_raw = stats.get("code")
                strat = stats.get("strategy")
                if not code_raw or not strat:
                    continue
                grouped_stats.setdefault((code_raw, strat), []).append(stats)
            except Exception:
                continue
    return grouped_stats

def get_best_circuits(results_dir: str = DEFAULT_RESULTS_DIR) -> List[Dict]:
    """Returns a list of best stats for each (code, strategy) combination."""
    grouped_stats = get_grouped_stats(results_dir)
    data = []
    for (code_raw, strat), group in grouped_stats.items():
        best_stats = min(group, key=circuit_score)
        try:
            code_data = load_qecc_data(code_raw, "FAO" if code_raw in BASELINE_DATA else None)
            best_stats["n"] = code_data["n"]
            best_stats["k"] = code_data["k"]
            best_stats["d"] = code_data["d"]
            best_stats["label"] = code_data.get("abbr_name", "")
            data.append(best_stats)
        except Exception:
            continue
    return data

def get_best_spidercss_per_code(results_dir: str = DEFAULT_RESULTS_DIR) -> Dict[str, Dict]:
    """Finds the absolute best SpiderCSS result for each code."""
    data = get_best_circuits(results_dir)
    best_per_code = {}
    for item in data:
        code_raw = item["code"]
        if code_raw not in best_per_code:
            best_per_code[code_raw] = item
        else:
            if circuit_score(item) < circuit_score(best_per_code[code_raw]):
                best_per_code[code_raw] = item
    return best_per_code
