import glob
import json
import os
import itertools
import math

from spidercss.utils import load_qecc, load_qecc_data
from spidercss.results_parser import BASELINE_DATA, wilson_score_interval, circuit_score, get_grouped_stats
def get_state(code, k):
    if code in ("49_1_5", "95_1_7"):
        return r"$\ket{\overline{+}}$"
    if k > 3:
        return f"$\\ket{{\\overline{0}}}^{{\\otimes {k}}}$"
    zeros = "0" * k
    return f"$\\ket{{\\overline{{{zeros}}}}}$"

def format_float(val, digits=1):
    return f"{val + 1e-9:.{digits}f}"

def escape_percentage(p):
    return f"{p * 100 + 1e-9:.1f}\\%"

def main():
    results_dir = "spidercss/simulation_results"
    
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
                
    # Sort by d then n
    data.sort(key=lambda x: (x["d"], x["n"], x.get("code", ""), len(x.get("strategy", ""))))
    
    grouped_data = []
    for code, group in itertools.groupby(data, key=lambda x: x.get("code", "")):
        grouped_data.append((code, list(group)))
    
    print("\\begin{table*}[ht]")
    print("\\centering")
    print("\\scriptsize")
    print("\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}}l l c c c c c c c c}")
    print("\\toprule")
    print("\\makecell[l]{QEC Code \\\\ \\& State} & Method & \\makecell{CNOT \\\\ Count} & \\makecell{Flag \\\\ Count} & \\makecell{Qubit Reuse \\\\ Opt.\\@ Target} & \\makecell{CNOT \\\\ scheduler} & \\makecell{Sim.\\@ \\\\ Qubits} & Depth & LER & AR \\\\")
    print("\\midrule")
    
    for code_raw, group in grouped_data:
        has_baseline = code_raw in BASELINE_DATA
        num_strategy_rows = len(group)
        num_rows = num_strategy_rows + (1 if has_baseline else 0)
        
        group_p_0001 = any(any(r.get("p") == 0.0001 for k in ["p", "physical_error_rate", "error_rate"]) for r in group)
        
        first_row = group[0]
        n, k, d = first_row["n"], first_row["k"], first_row["d"]
        label = first_row["label"]
        code_tex = f"$\\code{{{n}, {k}, {d}}}$"
        state = get_state(code_raw, k)
        code_state = f"{code_tex} {label} {state}" if label else f"{code_tex} {state}"
        
        cxs = first_row.get("num_cx", 0)
        flags = first_row.get("num_flags", 0)
        
        multirow_code = f"\\multirow{{{num_rows}}}{{*}}{{\\makecell[l]{{{code_state}}}}}"
        
        base_cx = BASELINE_DATA.get(code_raw, {}).get("cx", "$-$")
        base_flags = BASELINE_DATA.get(code_raw, {}).get("flags", "$-$")
        base_sim = BASELINE_DATA.get(code_raw, {}).get("sim_qubits", "$-$")
        base_depth = BASELINE_DATA.get(code_raw, {}).get("depth", "$-$")
        
        base_ler_bounds = BASELINE_DATA.get(code_raw, {}).get("ler_bounds", None)
        base_ar_bounds = BASELINE_DATA.get(code_raw, {}).get("ar_bounds", None)
        
        # Calculate best values for bolding
        best_cx = min([cxs] + ([int(base_cx)] if base_cx != "$-$" else []))
        best_flags = min([flags] + ([int(base_flags)] if base_flags != "$-$" else []))
        best_sim = min([r.get("num_sim_qubits", float('inf')) for r in group] + ([int(base_sim)] if base_sim != "$-$" else []))
        best_depth = min([r.get("depth", float('inf')) + 2 for r in group] + ([int(base_depth)] if base_depth != "$-$" else []))
        
        ler_vals = []
        if base_ler_bounds:
            ler_vals.append(((base_ler_bounds[0] + base_ler_bounds[1]) / 2) * 10**base_ler_bounds[2])
        for r in group:
            l = r.get("logical_error_rate")
            if l is not None:
                ler_vals.append(l)
        best_ler = min(ler_vals) if ler_vals else float('inf')
        
        ar_vals = []
        if base_ar_bounds:
            ar_vals.append((base_ar_bounds[0] + base_ar_bounds[1]) / 2)
        for r in group:
            a = r.get("acceptance_rate")
            if a is not None:
                ar_vals.append(a)
        best_ar = max(ar_vals) if ar_vals else float('-inf')

        def is_best(val, best_val):
            if best_val in (float('inf'), float('-inf')): return False
            if isinstance(val, (int, float)) and isinstance(best_val, (int, float)):
                if best_val == 0: return val == 0
                return abs(val - best_val) / abs(best_val) < 1e-4
            return val == best_val

        def wrap_bold(s, math=False):
            if math and s.startswith('$') and s.endswith('$'):
                return f"$\\mathbf{{{s[1:-1]}}}$"
            return f"\\textbf{{{s}}}"

        all_lers = [r.get("logical_error_rate") for r in group if r.get("logical_error_rate") and r.get("logical_error_rate") > 0]
        if base_ler_bounds:
            all_lers.append(base_ler_bounds[0] * 10**base_ler_bounds[2])
            
        if all_lers:
            min_ler = min(all_lers)
            shared_exp = math.floor(math.log10(min_ler))
        else:
            shared_exp = 0
            
        if base_ler_bounds:
            low, high, orig_exp = base_ler_bounds
            factor = 10**(orig_exp - shared_exp)
            adj_low = low * factor
            adj_high = high * factor
            base_ler = f"$[{format_float(adj_low, 1)}, \\,\\, {format_float(adj_high, 1)}]\\! \\times\\! 10^{{{shared_exp}}}$"
            base_ler_val = ((low + high) / 2) * 10**orig_exp
            if is_best(base_ler_val, best_ler): base_ler = wrap_bold(base_ler, math=True)
        else:
            base_ler = "$-$"
            
        if base_ar_bounds:
            base_ar = f"$[{base_ar_bounds[0]:.4f}, \\,\\, {base_ar_bounds[1]:.4f}]$"
            base_ar_val = (base_ar_bounds[0] + base_ar_bounds[1]) / 2
            if is_best(base_ar_val, best_ar): base_ar = wrap_bold(base_ar, math=True)
            if group_p_0001:
                base_ar = base_ar[:-1] + "^{*}$"
        else:
            base_ar = "$-$"
        
        base_cx_str = str(base_cx)
        if base_cx != "$-$" and is_best(int(base_cx), best_cx): base_cx_str = wrap_bold(base_cx_str)
        
        base_flags_str = str(base_flags)
        if base_flags != "$-$" and is_best(int(base_flags), best_flags): base_flags_str = wrap_bold(base_flags_str)
        
        base_sim_str = str(base_sim)
        if base_sim != "$-$" and is_best(int(base_sim), best_sim): base_sim_str = wrap_bold(base_sim_str)
        
        base_depth_str = str(base_depth)
        if base_depth != "$-$" and is_best(int(base_depth), best_depth): base_depth_str = wrap_bold(base_depth_str)
        
        if has_baseline:
            # Print the Flag at Origin row
            print(f"{multirow_code} & FaO & {base_cx_str} & {base_flags_str} &   &   & {base_sim_str} & {base_depth_str} & {base_ler} & {base_ar} \\\\")
            print("\\cmidrule{2-10}")
        
        cxs_str = wrap_bold(str(cxs)) if is_best(cxs, best_cx) else str(cxs)
        flags_str = wrap_bold(str(flags)) if is_best(flags, best_flags) else str(flags)

        multirow_method = f"\\multirow{{{num_strategy_rows}}}{{*}}{{SpiderCSS}}"
        multirow_cx = f"\\multirow{{{num_strategy_rows}}}{{*}}{{{cxs_str}}}"
        multirow_flags = f"\\multirow{{{num_strategy_rows}}}{{*}}{{{flags_str}}}"
        
        for i, row in enumerate(group):
            strategy = row.get("strategy", "Unknown").replace("Strategy", "")
            if strategy in ("AggressiveDepthAware", "PureAggressive"):
                strategy = r"Sim.\@ Qubit"
            elif strategy == "DepthPreserving":
                strategy = r"Depth"
            elif strategy == "VolumeOptimizingReuse":
                strategy = r"Volume"
                
            sim_qubits = row.get("num_sim_qubits", 0)
            sim_qubits_str = wrap_bold(str(sim_qubits)) if is_best(sim_qubits, best_sim) else str(sim_qubits)

            depth = row.get("depth", -2) + 2
            depth_str = wrap_bold(str(depth)) if is_best(depth, best_depth) else str(depth)
            
            n_samples = row.get("num_samples", 0)
            ler = row.get("logical_error_rate", None)
            if ler is None:
                ler_latex = "$-$"
            else:
                ar_temp = row.get("acceptance_rate", 1.0)
                n_ler = n_samples * ar_temp
                low, high = wilson_score_interval(ler, n_ler)
                
                # Determine shared exponent if we didn't calculate one globally
                exp_to_use = shared_exp if shared_exp != 0 else math.floor(math.log10(ler))
                
                if exp_to_use != 0:
                    low_val = low / (10**exp_to_use)
                    high_val = high / (10**exp_to_use)
                    ler_latex = f"$[{format_float(low_val, 1)}, \\,\\, {format_float(high_val, 1)}]\\! \\times\\! 10^{{{exp_to_use}}}$"
                else:
                    ler_latex = f"$[{format_float(low, 5)}, \\,\\, {format_float(high, 5)}]$"
                
                if is_best(ler, best_ler): ler_latex = wrap_bold(ler_latex, math=True)
                
            ar = row.get("acceptance_rate", None)
            if ar is None:
                ar_latex = "$-$"
            else:
                ar_low, ar_high = wilson_score_interval(ar, n_samples)
                ar_latex = f"$[{ar_low:.4f}, \\,\\, {ar_high:.4f}]$"
                if is_best(ar, best_ar): ar_latex = wrap_bold(ar_latex, math=True)
                if group_p_0001:
                    ar_latex = ar_latex[:-1] + "^{*}$"
            
            method_col = multirow_method if i == 0 else ""
            cx_col = multirow_cx if i == 0 else ""
            flag_col = multirow_flags if i == 0 else ""
            
            code_col = multirow_code if (i == 0 and not has_baseline) else ""
            cnot_scheduler = row.get("routing_heuristic", "")
            cnot_scheduler_dict = {
                "earliest_start_first": "Early Start",
                "active_spider_first": "Active Spider",
                "critical_path_first": r"Crit.\@ Path",
                "sa_sequence_distance": r"Seq.\@ Dist.",
            }
            cnot_scheduler_str = cnot_scheduler_dict.get(cnot_scheduler)

            print(f"{code_col} & {method_col} & {cx_col} & {flag_col} & {strategy} & {cnot_scheduler_str} & {sim_qubits_str} & {depth_str} & {ler_latex} & {ar_latex} \\\\")
            
        # Optional line between different codes for clean grouping
        print("\\midrule")
        
    print("\\bottomrule")
    print("\\end{tabular*}")
    print("\\caption{")
    print("\tResource overhead, logical error rate, and acceptance rate for different CSS QECCs.")
    print("\tColumns from left to right: QEC code and state, Method (SpiderCSS or FaO, i.e.\\@ Flag at Origin~\\cite{forlivesi2025flag}), number of CNOT gates in the circuit, number of flag measurements, optimization target of qubit reuse strategy, maximum simultaneous number of qubits necessary, circuit depth, and finally logical error rate and acceptance rates using Wilson confidence intervals of 95\\%.")
    print("\tThe logical error rates of some codes were not estimated (marked $-$) as the lookup table was too large to store in memory.")
    print("\tFor largest 4 codes, values marked with $^*$ indicate simulations performed with a physical error rate of $p=0.0001$ instead of the usual $p=0.001$.")
    print("}")
    print("\\label{tab:sim_results}")
    print("\\end{table*}")

    # Export to Excel
    # export_to_excel(data, grouped_data)

def export_to_excel(data, grouped_data, filename="simulation_results.xlsx"):
    try:
        import pandas as pd
    except ImportError:
        import sys
        print("\n% To export a real Excel file, please install pandas and openpyxl: pip install pandas openpyxl", file=sys.stderr)
        return

    if not data:
        return
        
    # Gather all unique keys from data
    keys = set()
    for row in data:
        keys.update(row.keys())
    
    # We want some columns to be first
    drop_rows = ("perfect_stim", "noisy_circuit", "num_qubits_original", "raw_acceptance_rate", "label")
    first_cols = ["code", "Method", "n", "k", "d", "routing_heuristic", "strategy", "logical_error_rate", "acceptance_rate", "num_sim_qubits", "depth", "num_cx", "num_flags"]
    other_cols = sorted([k for k in (keys - set(first_cols)) if k not in drop_rows])
    headers = first_cols + other_cols
    
    rows = []
    
    for code_raw, group in grouped_data:
        has_baseline = code_raw in BASELINE_DATA
        if has_baseline:
            base = BASELINE_DATA[code_raw]
            base_row = {h: None for h in headers}
            base_row["code"] = code_raw
            base_row["Method"] = "FaO"
            base_row["num_cx"] = base.get("cx", None)
            base_row["num_flags"] = base.get("flags", None)
            base_row["num_sim_qubits"] = int(base.get("sim_qubits")) if base.get("sim_qubits", "$-$") != "$-$" else None
            base_row["depth"] = int(base.get("depth")) if base.get("depth", "$-$") != "$-$" else None
            if base.get("ler_bounds"):
                low, high, exp = base["ler_bounds"]
                base_row["logical_error_rate"] = ((low + high) / 2) * (10**exp)
            if base.get("ar_bounds"):
                low, high = base["ar_bounds"]
                base_row["acceptance_rate"] = (low + high) / 2
                
            # inherit n, k, d from the group's first element
            if group:
                first = group[0]
                base_row["n"] = first.get("n", None)
                base_row["k"] = first.get("k", None)
                base_row["d"] = first.get("d", None)
                base_row["label"] = first.get("label", None)
            
            rows.append(base_row)
            
        for row in group:
            out_row = {}
            for h in headers:
                if h in drop_rows:

                    continue
                if h == "Method":
                    out_row[h] = "SpiderCSS"
                else:
                    out_row[h] = row.get(h, None)
            rows.append(out_row)
            
    df = pd.DataFrame(rows, columns=headers)
    
    try:
        df.to_excel(filename, index=False)
        import sys
        print(f"\n% Exported spreadsheet data to {filename}", file=sys.stderr)
    except ModuleNotFoundError:
        import sys
        print("\n% To export a real Excel file, please install openpyxl: pip install openpyxl", file=sys.stderr)

if __name__ == "__main__":
    main()
