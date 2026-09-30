import os
import matplotlib.pyplot as plt
import numpy as np

from spidercss.results_parser import (
    wilson_score_interval,
    get_best_spidercss_per_code,
    get_grouped_stats,
    get_fao_per_code
)

plt.rcParams.update({
    "text.usetex": False,
    "font.family": "serif",
    "font.serif": ["Times"],
    "font.size": 12,
    "axes.labelsize": 14,
    "axes.titlesize": 16,
    "legend.fontsize": 12,
    "xtick.labelsize": 12,
    "ytick.labelsize": 12,
    "lines.linewidth": 1.5,
})


def main():
    plots_dir = os.path.join(os.path.dirname(__file__), "..", "plots")
    os.makedirs(plots_dir, exist_ok=True)

    best_stats = get_best_spidercss_per_code()
    grouped_stats = get_grouped_stats()
    
    # Sort codes by distance, then n
    fao_stats = get_fao_per_code()
    codes = [c for c in best_stats.keys() if c in fao_stats]
    codes.sort(key=lambda c: (best_stats[c]["d"], best_stats[c]["n"], c))

    if not codes:
        print("No simulation results found for plotting.")
        return

    colors = {
        "SpiderCSS": "#D55E00",      # Vermillion
        "Flag at Origin": "#0072B2"  # Blue
    }

    plot_ler_improvement_hist(codes, best_stats, fao_stats, colors, plots_dir)
    plot_mirrored_histogram(codes, best_stats, fao_stats, colors, plots_dir)
    plot_ler_vs_code(codes, best_stats, fao_stats, colors, plots_dir)
    plot_depth_sim_qubits_scatter(codes, grouped_stats, fao_stats, colors, plots_dir)
    print(f"Plots saved to {plots_dir}")

def plot_ler_improvement_hist(codes, best_stats, fao_stats, colors, plots_dir):
    improvements = []
    for code in codes:
        fao_ler = fao_stats[code].get("logical_error_rate")
        spider_ler = best_stats[code].get("logical_error_rate")
        if spider_ler and spider_ler > 0 and fao_ler and fao_ler > 0:
            imp_pct = 100 * (fao_ler - spider_ler) / fao_ler
            improvements.append(imp_pct)
            
    if not improvements:
        return
        
    plt.figure(figsize=(8, 5))
    min_imp = min(improvements)
    max_imp = max(improvements)
    bins = np.linspace(min_imp, max_imp, 21)
    
    counts, _, patches = plt.hist(improvements, bins=bins, 
                                  color=colors.get("SpiderCSS", "C1"), edgecolor='white')
                                  
    mean_imp = np.mean(improvements)
    plt.axvline(mean_imp, color='black', linestyle='--', linewidth=1.5, 
                label=f'Mean: {mean_imp:.1f}%')
                
    plt.xlabel(r"LER Improvement (%)")
    plt.ylabel("Number of Codes")
    plt.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_improvement_hist.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_improvement_hist.pdf"))
    plt.close()

def plot_mirrored_histogram(codes, best_stats, fao_stats, colors, plots_dir):
    ler_improvements = []
    ar_improvements = []
    
    for code in codes:
        fao_ler = fao_stats[code].get("logical_error_rate")
        spider_ler = best_stats[code].get("logical_error_rate")
        
        fao_ar = fao_stats[code].get("acceptance_rate")
        spider_ar = best_stats[code].get("acceptance_rate")
        
        if spider_ler and spider_ler > 0 and fao_ler and fao_ler > 0:
            ler_imp_pct = 100 * (fao_ler - spider_ler) / fao_ler
            ler_improvements.append(ler_imp_pct)
            
        if spider_ar is not None and fao_ar is not None:
            ar_imp_pct = 100 * (spider_ar - fao_ar) / fao_ar
            ar_improvements.append(ar_imp_pct)
            
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 6))
    
    # LER Histogram (Top)
    ler_min = min(ler_improvements) if ler_improvements else 0
    ler_max = max(ler_improvements) if ler_improvements else 100
    ler_bins = np.linspace(ler_min, ler_max, 21)
    
    ler_counts, _ = np.histogram(ler_improvements, bins=ler_bins)
    ax1.bar(ler_bins[:-1], ler_counts, width=np.diff(ler_bins), align='edge', 
            color=colors.get("SpiderCSS", "C1"), edgecolor='white', label='LER Improvement')
    
    ler_mean = np.mean(ler_improvements)
    max_ler_count = max(ler_counts) if len(ler_counts) > 0 else 1
    ax1.plot([ler_mean, ler_mean], [0, max_ler_count], color='black', linestyle='--', linewidth=1.5)
    
    ax1.set_ylabel("Number of Codes")
    ax1.set_xlabel(r"LER Improvement (%)")
    ax1.legend()
    
    # AR Histogram (Bottom)
    ar_min = min(ar_improvements) if ar_improvements else -5
    ar_max = max(ar_improvements) if ar_improvements else 5
    ar_bins = np.linspace(ar_min, ar_max, 21)
    
    ar_counts, _ = np.histogram(ar_improvements, bins=ar_bins)
    
    ax2.bar(ar_bins[:-1], ar_counts, width=np.diff(ar_bins), align='edge', 
            color=colors.get("Flag at Origin", "C0"), edgecolor='white', label='AR Improvement')
            
    ar_mean = np.mean(ar_improvements)
    max_ar_count = max(ar_counts) if len(ar_counts) > 0 else 1
    ax2.plot([ar_mean, ar_mean], [0, max_ar_count], color='black', linestyle='--', linewidth=1.5)
    
    ax2.invert_yaxis()
    ax2.set_ylabel("Number of Codes")
    ax2.set_xlabel(r"AR Improvement (%)")
    from matplotlib.ticker import FormatStrFormatter
    ax2.xaxis.set_major_formatter(FormatStrFormatter('%.1f'))
    ax2.legend()
    
    for ax in [ax1, ax2]:
        from matplotlib.ticker import MaxNLocator
        ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_ar_mirrored_hist.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_ar_mirrored_hist.pdf"))
    plt.close()

def plot_ler_vs_code(codes, best_stats, fao_stats, colors, plots_dir):
    # Only use codes that have LER numbers
    filtered_codes = [
        c for c in codes
        if best_stats[c].get("logical_error_rate") is not None
        and fao_stats[c].get("logical_error_rate") is not None
    ]
    
    plt.figure(figsize=(10, 5))
    x_positions = np.arange(len(filtered_codes))
    
    for i, code in enumerate(filtered_codes):
        fao_mid = fao_stats[code].get("logical_error_rate")
        fao_samples = fao_stats[code].get("num_samples", 0) * fao_stats[code].get("acceptance_rate", 1.0)
        if fao_mid is not None:
            fao_low, fao_high = wilson_score_interval(fao_mid, fao_samples)
        else:
            fao_low, fao_high = 0, 0
        if fao_mid is not None:
            plt.errorbar(i - 0.1, fao_mid, yerr=[[fao_mid - fao_low], [fao_high - fao_mid]], 
                         fmt='o', color=colors["Flag at Origin"], capsize=5, zorder=3,
                         label="Flag at Origin" if i == 0 else "")

        spider_ler = best_stats[code].get("logical_error_rate")
        if spider_ler is not None:
            spider_samples = best_stats[code].get("num_samples", 0) * best_stats[code].get("acceptance_rate", 1.0)
            spider_low, spider_high = wilson_score_interval(spider_ler, spider_samples)
            plt.errorbar(i + 0.1, spider_ler, yerr=[[spider_ler - spider_low], [spider_high - spider_ler]], 
                         fmt='o', color=colors["SpiderCSS"], capsize=5, zorder=2,
                         label="SpiderCSS" if i == 0 else "")

    plt.yscale("log")
    
    labels = []
    for code in filtered_codes:
        n = best_stats[code].get("n")
        k = best_stats[code].get("k")
        d = best_stats[code].get("d")
        labels.append(f"[[{n},{k},{d}]]")
        
    plt.xticks(x_positions, labels)
    plt.tick_params(axis='x', bottom=False)
    plt.ylabel("Logical Error Rate")
    plt.legend()
    plt.grid(True, which="both", axis="y", ls="--", alpha=0.3)
    for i in range(len(filtered_codes) - 1):
        plt.axvline(x=i + 0.5, color='gray', linestyle='-', alpha=0.5)
        
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_vs_code.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_vs_code.pdf"))
    plt.close()

def plot_depth_sim_qubits_scatter(codes, grouped_stats, fao_stats, colors, plots_dir):
    plt.figure(figsize=(7, 6))
    import matplotlib.lines as mlines
    
    for code in codes:
        fao_depth_max = fao_stats[code].get("depth_max", 0)
        fao_sim_max = fao_stats[code].get("num_qubits_max", 0)
        
        fao_depth_min = fao_stats[code].get("depth_min", 0)
        fao_sim_min = fao_stats[code].get("num_qubits_min", 0)
        
        # In new benchmark format, we can find the best CSSCat for this code
        # and it has both max and min reuse inside the json
        css_rs = [r for r in grouped_stats[code] if r.get("method", "").startswith("CSSCat")]
        if not css_rs:
            continue
        
        valid_css = [r for r in css_rs if r.get("logical_error_rate") is not None]
        best_css = min(valid_css, key=lambda x: x["logical_error_rate"]) if valid_css else css_rs[0]
        
        spider_depth_min = best_css.get("depth_min", -2)
        spider_sim_min = best_css.get("num_qubits_min", 0)
        
        spider_depth_max = best_css.get("depth_max", -2)
        spider_sim_max = best_css.get("num_qubits_max", 0)
        
        # Connect min_reuse pair
        plt.plot([fao_depth_min, spider_depth_min], [fao_sim_min, spider_sim_min], color='gray', alpha=0.4, zorder=1)
        # Connect max_reuse pair
        plt.plot([fao_depth_max, spider_depth_max], [fao_sim_max, spider_sim_max], color='gray', alpha=0.4, zorder=1)
        
        # Scatter min_reuse (triangles)
        plt.scatter(fao_depth_min, fao_sim_min, color=colors["Flag at Origin"], zorder=2, s=50, marker='^')
        plt.scatter(spider_depth_min, spider_sim_min, color=colors["SpiderCSS"], zorder=2, s=50, marker='^')
        
        # Scatter max_reuse (squares)
        plt.scatter(fao_depth_max, fao_sim_max, color=colors["Flag at Origin"], zorder=2, s=50, marker='s')
        plt.scatter(spider_depth_max, spider_sim_max, color=colors["SpiderCSS"], zorder=2, s=50, marker='s')

    plt.xscale("function", functions=(lambda x: x**0.5, lambda x: x**2))
    plt.yscale("function", functions=(lambda x: x**0.5, lambda x: x**2))
    
    plt.xlabel("Circuit Depth")
    plt.ylabel("Simultaneous Qubits")
    plt.grid(True, which="both", ls="--", alpha=0.5)
    
    # Legend setup
    fao_marker = mlines.Line2D([], [], color=colors["Flag at Origin"], marker='o', linestyle='None', markersize=8, label='Flag at Origin')
    spider_marker = mlines.Line2D([], [], color=colors["SpiderCSS"], marker='o', linestyle='None', markersize=8, label='SpiderCSS')
    
    min_reuse_marker = mlines.Line2D([], [], color='gray', marker='^', linestyle='None', markersize=8, label='Min Reuse (Depth Opt.)')
    max_reuse_marker = mlines.Line2D([], [], color='gray', marker='s', linestyle='None', markersize=8, label='Max Reuse (Sim Qubit Opt.)')
    
    plt.legend(handles=[fao_marker, spider_marker, min_reuse_marker, max_reuse_marker])
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "depth_sim_qubits_scatter.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "depth_sim_qubits_scatter.pdf"))
    plt.close()

if __name__ == "__main__":
    main()
