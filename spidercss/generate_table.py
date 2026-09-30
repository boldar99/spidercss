import glob
import json
import os
import itertools
import math

from spidercss.utils import load_qecc_data

def get_state(code, k):
    if code in ("49_1_5", "95_1_7"):
        return r"$\ket{\overline{+}}$"
    if k > 3:
        return f"$\\ket{{\\overline{0}}}^{{\\otimes {k}}}$"
    zeros = "0" * k
    return f"$\\ket{{\\overline{{{zeros}}}}}$"

def format_float(val, digits=1):
    return f"{val + 1e-9:.{digits}f}"

def wilson_score_interval(p, n, z=1.95996):
    if n <= 0:
        return p, p
    denominator = 1 + z**2/n
    center = p + z**2 / (2*n)
    spread = z * math.sqrt(p*(1-p)/n + z**2 / (4*n**2))
    return (center - spread) / denominator, (center + spread) / denominator

def main():
    results_dir = "simulation_results"
    json_files = glob.glob(os.path.join(results_dir, "*.json"))
    
    data = []
    for f in json_files:
        with open(f, 'r') as file:
            try:
                stats = json.load(file)
                code_raw = stats.get("code")
                method = stats.get("method")
                
                code_data = load_qecc_data(code_raw)
                stats["n"] = code_data["n"]
                stats["k"] = code_data["k"]
                stats["d"] = code_data["d"]
                stats["label"] = code_data.get("abbr_name", "")
                data.append(stats)
            except Exception:
                continue
                
    # Sort by d then n
    data.sort(key=lambda x: (x["d"], x["n"], x.get("code", ""), x.get("method", "")))
    
    grouped_data = []
    for code, group in itertools.groupby(data, key=lambda x: x.get("code", "")):
        grouped_data.append((code, list(group)))
    
    print("\\begin{table*}[ht]")
    print("\\centering")
    print("\\scriptsize")
    print("\\begin{tabular*}{\\textwidth}{@{\\extracolsep{\\fill}}l l c c c c c c c c}")
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
        
        methods_data = {}
        for r in group:
            methods_data[r["method"]] = r

        # Output the rows (2 methods * 2 targets = 4 rows per code)
        num_rows = len(methods_data) * 2
        multirow_code = f"\\multirow{{{num_rows}}}{{*}}{{\\makecell[l]{{{code_state}}}}}"
        
        code_col = multirow_code

        from spidercss.cat_at_origin import BENCHMARK_ROUTING_HEURISTICS
        method_names = ["FaO"] + [f"CSSCat ({h})" for h in BENCHMARK_ROUTING_HEURISTICS]
        for m_idx, m_name in enumerate(method_names):
            if m_name not in methods_data:
                continue
            r = methods_data[m_name]
            multirow_method = f"\\multirow{{2}}{{*}}{{{m_name}}}"
            multirow_cx = f"\\multirow{{2}}{{*}}{{{r.get('num_cx')}}}"
            multirow_flags = f"\\multirow{{2}}{{*}}{{{r.get('num_flags')}}}"
            
            ler = r.get("logical_error_rate")
            ar = r.get("acceptance_rate")
            n_samples = r.get("num_samples", 0)
            
            # Format LER and AR
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
            
            print(f"{code_col} & {multirow_method} & {multirow_cx} & {multirow_flags} & Sim.\\@ Qubits & {r.get('num_qubits_max')} & {r.get('depth_max')} & {multirow_ler} & {multirow_ar} \\\\")
            print(f" & & & & Depth & {r.get('num_qubits_min')} & {r.get('depth_min')} & & \\\\")
            
            if m_idx == 0:
                print(f"\\cmidrule{{2-9}}")
                
            code_col = ""
            
        print("\\midrule")
        
    print("\\bottomrule")
    print("\\end{tabular*}")
    print("\\end{table*}")

if __name__ == "__main__":
    main()
