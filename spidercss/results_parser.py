import glob
import json
import os
import math
from typing import Dict, List, Tuple

from spidercss.utils import load_qecc_data

DEFAULT_RESULTS_DIR = os.path.join(os.path.dirname(__file__), "simulation_results")

def wilson_score_interval(p, n, z=1.95996):
    if n <= 0:
        return p, p
    denominator = 1 + z**2/n
    center = p + z**2 / (2*n)
    spread = z * math.sqrt(p*(1-p)/n + z**2 / (4*n**2))
    return (center - spread) / denominator, (center + spread) / denominator

def get_grouped_stats(results_dir: str = DEFAULT_RESULTS_DIR) -> Dict[str, List[Dict]]:
    """Loads all JSON files and groups them by code."""
    json_files = glob.glob(os.path.join(results_dir, "*.json"))
    grouped_stats = {}
    for f in json_files:
        with open(f, 'r') as file:
            try:
                stats = json.load(file)
                code_raw = stats.get("code")
                if not code_raw:
                    continue
                code_data = load_qecc_data(code_raw)
                stats["n"] = code_data["n"]
                stats["k"] = code_data["k"]
                stats["d"] = code_data["d"]
                stats["label"] = code_data.get("abbr_name", "")
                grouped_stats.setdefault(code_raw, []).append(stats)
            except Exception:
                continue
    return grouped_stats

def get_best_spidercss_per_code(results_dir: str = DEFAULT_RESULTS_DIR) -> Dict[str, Dict]:
    """Finds the absolute best SpiderCSS result for each code (based on LER)."""
    grouped = get_grouped_stats(results_dir)
    best_per_code = {}
    for code, group in grouped.items():
        css_rs = [r for r in group if r.get("method", "").startswith("CSSCat")]
        if not css_rs:
            continue
        valid_css = [r for r in css_rs if r.get("logical_error_rate") is not None]
        if valid_css:
            best_per_code[code] = min(valid_css, key=lambda x: x["logical_error_rate"])
        else:
            best_per_code[code] = css_rs[0]
    return best_per_code

def get_fao_per_code(results_dir: str = DEFAULT_RESULTS_DIR) -> Dict[str, Dict]:
    """Finds the FaO result for each code."""
    grouped = get_grouped_stats(results_dir)
    fao_per_code = {}
    for code, group in grouped.items():
        fao_rs = [r for r in group if r.get("method", "") == "FaO"]
        if fao_rs:
            fao_per_code[code] = fao_rs[0]
    return fao_per_code
