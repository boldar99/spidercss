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

def format_heuristic(h):
    if not h:
        return "$-$"
    parts = h.split("_")
    return " ".join(p.capitalize() for p in parts)

def main():
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
    print("\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}}l l l c c c c c c c}")
    print("\\toprule")
    print("\\makecell[l]{QEC Code \\\\ \\& State} & Method & \\makecell{Routing \\\\ Heuristic} & \\makecell{CNOT \\\\ Count} & \\makecell{Flag \\\\ Count} & \\makecell{Qubit Reuse \\\\ Opt.\\@ Target} & \\makecell{Sim.\\@ \\\\ Qubits} & Depth & LER & AR \\\\")
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
            # Filter out None LERs if possible
            valid_css = [r for r in css_rs if r.get("logical_error_rate") is not None]
            if valid_css:
                best_css_r = min(valid_css, key=lambda x: x["logical_error_rate"])
            else:
                best_css_r = css_rs[0]
                
        methods_to_plot = []
        if fao_r: methods_to_plot.append((fao_r, "FaO", None))
        if best_css_r:
            m_name = best_css_r["method"]
            h_str = m_name.replace("SpiderCSS (", "").replace(")", "")
            methods_to_plot.append((best_css_r, "SpiderCSS", h_str))

        num_rows = len(methods_to_plot) * 2
        if num_rows == 0:
            continue
            
        multirow_code = f"\\multirow{{{num_rows}}}{{*}}{{\\makecell[l]{{{code_state}}}}}"
        code_col = multirow_code

        for m_idx, (r, display_method, routing_h) in enumerate(methods_to_plot):
            multirow_method = f"\\multirow{{2}}{{*}}{{{display_method}}}"
            multirow_routing = f"\\multirow{{2}}{{*}}{{{format_heuristic(routing_h)}}}"
            multirow_cx = f"\\multirow{{2}}{{*}}{{{r.get('num_cx')}}}"
            multirow_flags = f"\\multirow{{2}}{{*}}{{{r.get('num_flags')}}}"
            
            ler = r.get("logical_error_rate")
            ar = r.get("acceptance_rate")
            n_samples = r.get("num_samples", 0)
            
            if ler is None:
                ler_latex = "$-$"
            else:
                n_ler = n_samples * ar
                low, high = wilson_score_interval(ler, n_ler)
                exp_to_use = math.floor(math.log10(ler)) if ler > 0 else 0
                if exp_to_use != 0:
                    low_val = low / (10**exp_to_use)
                    high_val = high / (10**exp_to_use)
                    ler_latex = f"$[{format_float(low_val, 1)}, \\,\\, {format_float(high_val, 1)}]\\! \\times\\! 10^{{{exp_to_use}}}$"
                else:
                    ler_latex = f"$[{format_float(low, 5)}, \\,\\, {format_float(high, 5)}]$"
            
            if ar is None:
                ar_latex = "$-$"
            else:
                ar_low, ar_high = wilson_score_interval(ar, n_samples)
                ar_latex = f"$[{ar_low:.4f}, \\,\\, {ar_high:.4f}]$"
                if group_p_0001:
                    ar_latex = ar_latex[:-1] + "^{*}$"
                    
            multirow_ler = f"\\multirow{{2}}{{*}}{{{ler_latex}}}"
            multirow_ar = f"\\multirow{{2}}{{*}}{{{ar_latex}}}"
            
            print(f"{code_col} & {multirow_method} & {multirow_routing} & {multirow_cx} & {multirow_flags} & sim.\\@ qubits & {r.get('num_qubits_max')} & {r.get('depth_max')} & {multirow_ler} & {multirow_ar} \\\\")
            print(f" & & & & & depth & {r.get('num_qubits_min')} & {r.get('depth_min')} & & \\\\")
            
            if m_idx < len(methods_to_plot) - 1:
                print(f"\\cmidrule{{2-10}}")
                
            code_col = ""
            
        print("\\midrule")
        
    print("\\bottomrule")
    print("\\end{tabular*}")
    print("\\end{table*}")

if __name__ == "__main__":
    main()
