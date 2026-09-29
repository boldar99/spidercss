import os
import sys
import math
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd
import numpy as np

# Make sure we can import from spidercss even if run from inside the spidercss dir
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from spidercss.results_parser import (
    get_best_spidercss_per_code,
    get_best_circuits,
    BASELINE_DATA,
    wilson_score_interval
)

def _get_fao_ler(code):
    bounds = BASELINE_DATA[code]["ler_bounds"]
    return ((bounds[0] + bounds[1]) / 2) * (10 ** bounds[2])

def _get_fao_ar(code):
    bounds = BASELINE_DATA[code]["ar_bounds"]
    return (bounds[0] + bounds[1]) / 2

def main():
    plots_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "plots")
    os.makedirs(plots_dir, exist_ok=True)
    
    # Palette definition
    palette = sns.color_palette("colorblind", n_colors=4)
    method_colors = {
        "Flag at Origin": palette[2],
        "SpiderCSS": palette[3],
    }
    
    # Get all the best circuits (for each strategy/code)
    best_circuits = get_best_circuits()
    best_spider_stats = get_best_spidercss_per_code()
    
    # Filter only to codes that exist in BASELINE_DATA
    codes_to_plot = [c for c in best_spider_stats if c in BASELINE_DATA]
    
    # Sort codes appropriately (e.g. by distance d then n)
    codes_to_plot.sort(key=lambda c: (best_spider_stats[c].get("d", 0), best_spider_stats[c].get("n", 0)))
    
    plot_ler_histogram(codes_to_plot, best_spider_stats, method_colors, plots_dir)
    plot_mirrored_histogram(codes_to_plot, best_spider_stats, method_colors, plots_dir)
    plot_ler_vs_code(codes_to_plot, best_spider_stats, method_colors, plots_dir)
    plot_depth_sim_qubits_scatter(codes_to_plot, best_circuits, method_colors, plots_dir)

def plot_ler_histogram(codes, best_stats, colors, plots_dir):
    improvements = []
    for code in codes:
        fao_ler = _get_fao_ler(code)
        spider_ler = best_stats[code].get("logical_error_rate")
        if spider_ler and spider_ler > 0:
            imp_pct = 100 * (fao_ler - spider_ler) / fao_ler
            improvements.append(imp_pct)
            
    plt.figure(figsize=(6, 4))
    sns.histplot(improvements, bins=10, color=colors["SpiderCSS"], kde=False)
    plt.axvline(np.mean(improvements), color='black', linestyle='dashed', linewidth=1.5, label='Mean Improvement')
    
    plt.xlabel("LER Improvement (%)")
    plt.ylabel("Number of Codes")
    plt.legend()
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_improvement_hist.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_improvement_hist.pdf"))
    plt.close()

def plot_mirrored_histogram(codes, best_stats, colors, plots_dir):
    ler_improvements = []
    ar_improvements = []
    
    for code in codes:
        fao_ler = _get_fao_ler(code)
        spider_ler = best_stats[code].get("logical_error_rate")
        
        fao_ar = _get_fao_ar(code)
        spider_ar = best_stats[code].get("acceptance_rate")
        
        if spider_ler and spider_ler > 0:
            ler_imp_pct = 100 * (fao_ler - spider_ler) / fao_ler
            ler_improvements.append(ler_imp_pct)
            
        if spider_ar is not None:
            ar_imp_pct = 100 * (spider_ar - fao_ar) / fao_ar
            ar_improvements.append(ar_imp_pct)
            
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 6))
    
    import numpy as np
    
    # LER Histogram (Top)
    ler_min = min(ler_improvements) if ler_improvements else 0
    ler_max = max(ler_improvements) if ler_improvements else 100
    ler_bins = np.linspace(ler_min, ler_max, 21) # 20 blocks
    
    ler_counts, _ = np.histogram(ler_improvements, bins=ler_bins)
    ax1.bar(ler_bins[:-1], ler_counts, width=np.diff(ler_bins), align='edge', 
            color=colors.get("SpiderCSS", "C1"), edgecolor='white', label='LER Improvement')
    
    ler_mean = np.mean(ler_improvements)
    max_ler_count = max(ler_counts) if len(ler_counts) > 0 else 1
    ax1.plot([ler_mean, ler_mean], [0, max_ler_count], color='black', linestyle='--', linewidth=1.5)
    
    ax1.set_ylabel("Number of Codes")
    ax1.set_xlabel("LER Improvement (%)")
    ax1.legend()
    
    # AR Histogram (Bottom)
    ar_min = min(ar_improvements) if ar_improvements else -5
    ar_max = max(ar_improvements) if ar_improvements else 5
    ar_bins = np.linspace(ar_min, ar_max, 21) # 20 blocks
    
    ar_counts, _ = np.histogram(ar_improvements, bins=ar_bins)
    
    # We plot positive values and invert the Y axis to make it grow down
    ax2.bar(ar_bins[:-1], ar_counts, width=np.diff(ar_bins), align='edge', 
            color=colors.get("Flag at Origin", "C0"), edgecolor='white', label='AR Improvement')
            
    ar_mean = np.mean(ar_improvements)
    max_ar_count = max(ar_counts) if len(ar_counts) > 0 else 1
    ax2.plot([ar_mean, ar_mean], [0, max_ar_count], color='black', linestyle='--', linewidth=1.5)
    
    ax2.invert_yaxis()
    ax2.set_ylabel("Number of Codes")
    ax2.set_xlabel("AR Improvement (%)")
    from matplotlib.ticker import FormatStrFormatter
    ax2.xaxis.set_major_formatter(FormatStrFormatter('%.1f'))
    ax2.legend()
    
    # Ensure y-axis has integer ticks
    for ax in [ax1, ax2]:
        from matplotlib.ticker import MaxNLocator
        ax.yaxis.set_major_locator(MaxNLocator(integer=True))
    
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_ar_mirrored_hist.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_ar_mirrored_hist.pdf"))
    plt.close()




def plot_ler_vs_code(codes, best_stats, colors, plots_dir):
    plt.figure(figsize=(10, 5))
    
    x_positions = np.arange(len(codes))
    
    for i, code in enumerate(codes):
        # Plot FaO
        fao_bounds = BASELINE_DATA[code]["ler_bounds"]
        fao_low = fao_bounds[0] * (10 ** fao_bounds[2])
        fao_high = fao_bounds[1] * (10 ** fao_bounds[2])
        fao_mid = _get_fao_ler(code)
        
        # Plot SpiderCSS
        spider_ler = best_stats[code].get("logical_error_rate")
        spider_samples = best_stats[code].get("num_samples", 0) * best_stats[code].get("acceptance_rate", 1.0)
        spider_low, spider_high = wilson_score_interval(spider_ler, spider_samples)
        
        # Offset FaO by -0.1 and SpiderCSS by +0.1
        plt.errorbar(i - 0.1, fao_mid, yerr=[[fao_mid - fao_low], [fao_high - fao_mid]], 
                     fmt='o', color=colors["Flag at Origin"], capsize=5, zorder=3,
                     label="Flag at Origin" if i == 0 else "")
                     
        plt.errorbar(i + 0.1, spider_ler, yerr=[[spider_ler - spider_low], [spider_high - spider_ler]], 
                     fmt='o', color=colors["SpiderCSS"], capsize=5, zorder=2,
                     label="SpiderCSS" if i == 0 else "")

    plt.yscale("log")
    
    # Format labels
    labels = []
    for code in codes:
        n = best_stats[code].get("n")
        k = best_stats[code].get("k")
        d = best_stats[code].get("d")
        labels.append(f"[[{n},{k},{d}]]")
        
    plt.xticks(x_positions, labels)
    plt.tick_params(axis='x', bottom=False)  # Remove x-axis tick marks
    plt.ylabel("Logical Error Rate")
    plt.legend()
    
    # Adding horizontal grid lines
    plt.grid(True, which="both", axis="y", ls="--", alpha=0.3)
    
    # Adding separating lines between codes
    for i in range(len(codes) - 1):
        plt.axvline(x=i + 0.5, color='gray', linestyle='-', alpha=0.5)
        
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_vs_code.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_vs_code.pdf"))
    plt.close()



def plot_depth_sim_qubits_scatter(codes, best_circuits, colors, plots_dir):
    plt.figure(figsize=(7, 6))
    
    import matplotlib.lines as mlines
    
    for code in codes:
        # FaO coordinates
        fao_depth = int(BASELINE_DATA[code].get("depth", 0))
        fao_sim = int(BASELINE_DATA[code].get("sim_qubits", 0))
        
        # SpiderCSS optimized for depth -> 'DepthPreservingStrategy'
        # SpiderCSS optimized for sim qubits -> 'PureAggressiveStrategy'
        depth_opt = [c for c in best_circuits if c["code"] == code and c.get("strategy") == "DepthPreservingStrategy"]
        sim_opt = [c for c in best_circuits if c["code"] == code and c.get("strategy") == "PureAggressiveStrategy"]
        
        # In case there's no data for a strategy, fallback to the other
        if not depth_opt and sim_opt:
            depth_opt = sim_opt
        elif not sim_opt and depth_opt:
            sim_opt = depth_opt
            
        if not depth_opt and not sim_opt:
            continue
            
        d_opt_depth = depth_opt[0].get("depth", -2) + 2
        d_opt_sim = depth_opt[0].get("num_sim_qubits", 0)
        
        s_opt_depth = sim_opt[0].get("depth", -2) + 2
        s_opt_sim = sim_opt[0].get("num_sim_qubits", 0)
        
        # Draw lines from FaO to SpiderCSS dots
        plt.plot([fao_depth, d_opt_depth], [fao_sim, d_opt_sim], color='gray', alpha=0.4, zorder=1)
        plt.plot([fao_depth, s_opt_depth], [fao_sim, s_opt_sim], color='gray', alpha=0.4, zorder=1)
        
        # Draw dots
        plt.scatter(fao_depth, fao_sim, color=colors["Flag at Origin"], zorder=2, s=50)
        plt.scatter(d_opt_depth, d_opt_sim, color=colors["SpiderCSS"], zorder=2, s=50, marker='^')
        plt.scatter(s_opt_depth, s_opt_sim, color=colors["SpiderCSS"], zorder=2, s=50, marker='s')

    plt.xlabel("Circuit Depth")
    plt.ylabel("Simultaneous Qubits")
    plt.grid(True, ls="--", alpha=0.5)
    
    # Custom legends
    fao_marker = mlines.Line2D([], [], color=colors["Flag at Origin"], marker='o', linestyle='None', markersize=8, label='Flag at Origin')
    spider_depth_marker = mlines.Line2D([], [], color=colors["SpiderCSS"], marker='^', linestyle='None', markersize=8, label='SpiderCSS (Depth Opt.)')
    spider_sim_marker = mlines.Line2D([], [], color=colors["SpiderCSS"], marker='s', linestyle='None', markersize=8, label='SpiderCSS (Sim Qubit Opt.)')
    
    plt.legend(handles=[fao_marker, spider_depth_marker, spider_sim_marker])
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "depth_sim_qubits_scatter.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "depth_sim_qubits_scatter.pdf"))
    plt.close()

if __name__ == "__main__":
    main()
