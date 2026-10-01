import glob
import json
import os
import itertools
import math

from spidercss.utils import load_qecc_data
from spidercss.results_parser import wilson_score_interval

def get_state(code, k):
    if code in ("49_1_5", "95_1_7"):
        return r"$\ket{\overline{+}}$"
    if k > 3:
        return f"$\\ket{{\\overline{0}}}^{{\\otimes {k}}}$"
    zeros = "0" * k
    return f"$\\ket{{\\overline{{{zeros}}}}}$"

def format_float(val, digits=1):
    return f"{val + 1e-9:.{digits}f}"

HEURISTIC_ABBR = {
    "active_spider_first": "Active Spider",
    "critical_path_first": "Crit. Path",
    "earliest_start_first": "Earliest Start",
    "joint_resource": "Joint Resource",
    "sa_sequence_distance": "SA Seq. Dist.",
    "joint_resource_earliest_start_first": "Joint Res. ESF",
}

def format_heuristic(h):
    if not h:
        return ""
    h_clean = h.strip().lower().replace(" ", "_")
    if h_clean in HEURISTIC_ABBR:
        return HEURISTIC_ABBR[h_clean]
    parts = h_clean.split("_")
    return " ".join(p.capitalize() for p in parts)

def make_bold(val):
    if val is None or val == "$-$":
        return "$-$"
    s = str(val)
    if "$" in s:
        return f"\\textbf{{\\boldmath {s}}}"
    return f"\\textbf{{{s}}}"

def main():
    results_dir = os.path.join(os.path.dirname(__file__), "simulation_results")
    if not os.path.exists(results_dir):
        results_dir = "simulation_results"
    json_files = glob.glob(os.path.join(results_dir, "*.json"))
    
    data = []
    for f in json_files:
        with open(f, 'r') as file:
            try:
                stats = json.load(file)
                code_raw = stats.get("code")
                code_data = load_qecc_data(code_raw, "FAO")
            except Exception:
                code_data = load_qecc_data(code_raw)
            stats["n"] = code_data["n"]
            stats["k"] = code_data["k"]
            stats["d"] = code_data["d"]
            stats["label"] = code_data.get("abbr_name", "")
            data.append(stats)
                
    data.sort(key=lambda x: (x["d"], x["n"], x.get("code", ""), x.get("method", "")))
    
    grouped_data = []
    for code, group in itertools.groupby(data, key=lambda x: x.get("code", "")):
        grouped_data.append((code, list(group)))
    
    print("\\begin{table*}[ht]")
    print("\\centering")
    print("\\scriptsize")
    print("\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}}l l c c c c c c c}")
    print("\\toprule")
    print("\\makecell[l]{QEC Code \\\\ \\& State} & Method & \\makecell{CNOT \\\\ Count} & \\makecell{Flag \\\\ Count} & \\makecell{Qubit Reuse \\\\ Opt.\\@ Target} & \\makecell{Sim.\\@ \\\\ Qubits} & Depth & LER & AR \\\\")
    print("\\midrule")
    
    for code_raw, group in grouped_data:
        first_row = group[0]
        n, k, d = first_row["n"], first_row["k"], first_row["d"]
        label = first_row["label"]
        code_tex = f"$\\code{{{n}, {k}, {d}}}$"
        state = get_state(code_raw, k)
        code_state = f"{code_tex} {label} {state}" if label else f"{code_tex} {state}"
        
        group_p_0001 = any(r.get("p") == 0.0001 for r in group)
        
        # Extract FaO
        fao_r = next((r for r in group if r["method"] == "FaO"), None)
        
        # Extract best SpiderCSS
        css_rs = [r for r in group if r["method"].startswith("SpiderCSS")]
        best_css_r = None
        if css_rs:
            valid_css = [r for r in css_rs if r.get("logical_error_rate") is not None and r.get("num_qubits_max", 0) > 0]
            if not valid_css:
                valid_css = [r for r in css_rs if r.get("logical_error_rate") is not None]
            if valid_css:
                best_css_r = min(valid_css, key=lambda x: x["logical_error_rate"])
            else:
                best_css_r = css_rs[0]
                
        methods_to_plot = []
        if fao_r:
            methods_to_plot.append((fao_r, "Flag at Origin", None))
        if best_css_r:
            m_name = best_css_r["method"]
            h_str = m_name.replace("SpiderCSS (", "").replace(")", "").strip()
            h_abbr = format_heuristic(h_str)
            display_m = f"SpiderCSS ({h_abbr})" if h_abbr else "SpiderCSS"
            methods_to_plot.append((best_css_r, display_m, h_str))

        num_rows = len(methods_to_plot) * 2
        if num_rows == 0:
            continue
            
        # Determine best values among methods_to_plot for this code
        int_metrics = ["num_cx", "num_flags", "num_qubits_max", "depth_max", "num_qubits_min", "depth_min"]
        best_int = {}
        for m in int_metrics:
            vals = [r.get(m) for r, _, _ in methods_to_plot if r.get(m) is not None]
            if len(vals) > 1 and not all(v == vals[0] for v in vals):
                best_int[m] = min(vals)

        # Determine exponent from the best (lowest) LER for this code
        valid_lers = [r.get("logical_error_rate") for r, _, _ in methods_to_plot if r.get("logical_error_rate") is not None]
        min_ler = min(valid_lers) if valid_lers else None
        exp_to_use = math.floor(math.log10(min_ler)) if min_ler and min_ler > 0 else 0

        # Formatted LER & AR for each method
        ler_latex_list = []
        ar_latex_list = []
        for r, _, _ in methods_to_plot:
            ler = r.get("logical_error_rate")
            ar = r.get("acceptance_rate")
            n_samples = r.get("num_samples", 0)

            if ler is None:
                ler_latex = "$-$"
            else:
                n_ler = n_samples * ar
                low, high = wilson_score_interval(ler, n_ler)
                if exp_to_use != 0:
                    low_val = low / (10**exp_to_use)
                    high_val = high / (10**exp_to_use)
                    ler_latex = f"$[{format_float(low_val, 1)}, \\,\\, {format_float(high_val, 1)}]\\! \\times\\! 10^{{{exp_to_use}}}$"
                else:
                    ler_latex = f"$[{format_float(low, 5)}, \\,\\, {format_float(high, 5)}]$"
            ler_latex_list.append(ler_latex)

            if ar is None:
                ar_latex = "$-$"
            else:
                ar_low, ar_high = wilson_score_interval(ar, n_samples)
                ar_latex = f"$[{ar_low:.4f}, \\,\\, {ar_high:.4f}]$"
                if group_p_0001:
                    ar_latex = ar_latex[:-1] + "^{*}$"
            ar_latex_list.append(ar_latex)

        best_ler = None
        if len(valid_lers) > 1 and not all(v == valid_lers[0] for v in valid_lers):
            if not all(l == ler_latex_list[0] for l in ler_latex_list):
                best_ler = min_ler

        ar_vals = [r.get("acceptance_rate") for r, _, _ in methods_to_plot if r.get("acceptance_rate") is not None]
        best_ar = None
        if len(ar_vals) > 1 and not all(v == ar_vals[0] for v in ar_vals):
            if not all(a == ar_latex_list[0] for a in ar_latex_list):
                best_ar = max(ar_vals)

        multirow_code = f"\\multirow{{{num_rows}}}{{*}}{{\\makecell[l]{{{code_state}}}}}"
        code_col = multirow_code

        for m_idx, (r, display_method, routing_h) in enumerate(methods_to_plot):
            cx_val = r.get("num_cx")
            cx_str = make_bold(cx_val) if cx_val is not None and cx_val == best_int.get("num_cx") else ("$-$" if cx_val is None else str(cx_val))

            flags_val = r.get("num_flags")
            flags_str = make_bold(flags_val) if flags_val is not None and flags_val == best_int.get("num_flags") else ("$-$" if flags_val is None else str(flags_val))

            q_max = r.get("num_qubits_max")
            q_max_str = make_bold(q_max) if q_max is not None and q_max == best_int.get("num_qubits_max") else ("$-$" if q_max is None else str(q_max))

            d_max = r.get("depth_max")
            d_max_str = make_bold(d_max) if d_max is not None and d_max == best_int.get("depth_max") else ("$-$" if d_max is None else str(d_max))

            q_min = r.get("num_qubits_min")
            q_min_str = make_bold(q_min) if q_min is not None and q_min == best_int.get("num_qubits_min") else ("$-$" if q_min is None else str(q_min))

            d_min = r.get("depth_min")
            d_min_str = make_bold(d_min) if d_min is not None and d_min == best_int.get("depth_min") else ("$-$" if d_min is None else str(d_min))

            ler_val = r.get("logical_error_rate")
            ler_str = ler_latex_list[m_idx]
            if ler_val is not None and ler_val == best_ler:
                ler_str = make_bold(ler_str)

            ar_val = r.get("acceptance_rate")
            ar_str = ar_latex_list[m_idx]
            if ar_val is not None and ar_val == best_ar:
                ar_str = make_bold(ar_str)

            multirow_method = f"\\multirow{{2}}{{*}}{{{display_method}}}"
            multirow_cx = f"\\multirow{{2}}{{*}}{{{cx_str}}}"
            multirow_flags = f"\\multirow{{2}}{{*}}{{{flags_str}}}"
            multirow_ler = f"\\multirow{{2}}{{*}}{{{ler_str}}}"
            multirow_ar = f"\\multirow{{2}}{{*}}{{{ar_str}}}"
            
            print(f"{code_col} & {multirow_method} & {multirow_cx} & {multirow_flags} & sim.\\@ qubits & {q_max_str} & {d_max_str} & {multirow_ler} & {multirow_ar} \\\\")
            print(f" & & & & depth & {q_min_str} & {d_min_str} & & \\\\")
            
            if m_idx < len(methods_to_plot) - 1:
                print(f"\\cmidrule{{2-9}}")
                
            code_col = ""
            
        print("\\midrule")
        
    print("\\bottomrule")
    print("\\end{tabular*}")
    print("\\caption{")
    print("\tResource overhead, logical error rate, and acceptance rate for different CSS QECCs.")
    print("\tColumns from left to right: QEC code and state, Method (CSSCat or FaO, i.e.\\@ Flag at Origin~\\cite{forlivesi2025flag}), number of CNOT gates in the circuit, number of flag measurements, optimization target of qubit reuse strategy, maximum simultaneous number of qubits necessary, circuit depth, and finally logical error rate and acceptance rates using Wilson confidence intervals of 95\\%.")
    print("\tThe logical error rates of some codes were not estimated (marked $-$) as the lookup table was too large to store in memory.")
    print("\tFor largest 4 codes, values marked with $^*$ indicate simulations performed with a physical error rate of $p=0.0001$ instead of the usual $p=0.001$.")
    print("}")
    print("\\label{tab:sim_results}")
    print("\\end{table*}")

if __name__ == "__main__":
    main()
