import os
import math
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np

class RoundCentered(mpatches.BoxStyle.Round):
    def __init__(self, pad=0.28, y_shift=0.09, rounding_size=None):
        super().__init__(pad=pad, rounding_size=rounding_size)
        self.y_shift = y_shift

    def __call__(self, x0, y0, width, height, mutation_size):
        shift = mutation_size * self.y_shift
        return super().__call__(x0, y0 + shift, width, height, mutation_size)

mpatches.BoxStyle._style_list['round_centered'] = RoundCentered

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

    import seaborn as sns
    palette = sns.color_palette("colorblind", n_colors=4)
    colors = {
        "Flag at Origin": palette[2],
        "SpiderCSS": palette[3],
    }

    plot_mirrored_histogram(codes, best_stats, fao_stats, palette, plots_dir)
    plot_independent_histograms(codes, best_stats, fao_stats, palette, plots_dir)
    plot_ler_vs_code(codes, best_stats, fao_stats, colors, plots_dir)
    plot_depth_sim_qubits_scatter(codes, grouped_stats, fao_stats, colors, plots_dir)
    print(f"Plots saved to {plots_dir}")

def plot_independent_histograms(codes, best_stats, fao_stats, colors, plots_dir):
    ler_improvements = []
    ar_improvements = []
    font = {
        # 'family': 'serif',
        # 'color': 'darkred',
        # 'weight': 'normal',
        'size': 10,
    }
    
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
    
    # LER Histogram
    ler_min = min(ler_improvements) if ler_improvements else 0
    ler_max = max(ler_improvements) if ler_improvements else 100
    
    # 0 falls between two bins, step of 10 gives ~20 bins for range of 200
    ler_step = 10
    ler_b_min = math.floor(ler_min / ler_step) * ler_step
    ler_b_max = math.ceil(ler_max / ler_step) * ler_step
    ler_bins = np.arange(ler_b_min, ler_b_max + ler_step, ler_step)

    ler_counts, _ = np.histogram(ler_improvements, bins=ler_bins)
    ax1.bar(ler_bins[:-1], ler_counts, width=np.diff(ler_bins), align='edge', 
            color=colors[0], edgecolor='white', label='LER Improvement')
            
    ler_mean = np.mean(ler_improvements)
    ax1.axvline(ler_mean, color='black', linestyle='--', linewidth=1.5)
    
    ax1.set_ylabel("Number of Codes")
    ax1.set_xlabel("Improvement to Logical Error Rate")
    ax1.grid(True, linestyle='--', alpha=0.5)
    ax1.axvline(0, color='gray', linewidth=2, alpha=0.8)
    ax1.legend()
    
    # Add tick for LER mean
    fig.canvas.draw()
    current_ticks = list(ax1.get_xticks())[1:-1]
    new_ticks = current_ticks + [ler_mean]
    ax1.set_xticks(new_ticks)
    labels = [f"{t:g}%" for t in current_ticks] + [f"{ler_mean:.1f}%"]
    ax1.set_xticklabels(labels)
    ax1.tick_params(axis='x', labelsize=10)
    
    # AR Histogram
    raw_ar_min = min(ar_improvements) if ar_improvements else 0
    ar_min = min(0, raw_ar_min) # Start at 0 if possible, or lower if negatives exist
    ar_max = max(ar_improvements) if ar_improvements else 5
    
    # Find nice step for ~20 bins
    target_ar_bins = 20
    raw_ar_step = (ar_max - ar_min) / target_ar_bins if ar_max > ar_min else 1
    nice_ar_steps = [0.1, 0.2, 0.25, 0.5, 1.0, 2.0, 5.0]
    ar_step = nice_ar_steps[-1]
    for s in nice_ar_steps:
        if s >= raw_ar_step:
            ar_step = s
            break
            
    ar_b_min = math.floor(ar_min / ar_step) * ar_step
    ar_b_max = math.ceil(ar_max / ar_step) * ar_step
    ar_bins = np.arange(ar_b_min, ar_b_max + ar_step, ar_step)
    
    ar_counts, _ = np.histogram(ar_improvements, bins=ar_bins)
    ax2.bar(ar_bins[:-1], ar_counts, width=np.diff(ar_bins), align='edge', 
            color=colors[1], edgecolor='white', label='AR Improvement')
            
    ar_mean = np.mean(ar_improvements)
    ax2.axvline(ar_mean, color='black', linestyle='--', linewidth=1.5)
    
    ax2.set_ylabel("Number of Codes")
    ax2.set_xlabel("Improvement to Acceptance Rate")
    ax2.grid(True, linestyle='--', alpha=0.5)
    ax2.axvline(0, color='gray', linewidth=2, alpha=0.8)
    ax2.legend()
    
    # Add tick for AR mean
    fig.canvas.draw()
    current_ticks = list(ax2.get_xticks())[1:-1]
    new_ticks = current_ticks + [ar_mean]
    ax2.set_xticks(new_ticks)
    labels = [f"{t:g}%" for t in current_ticks] + [f"{ar_mean:.1f}%"]
    ax2.set_xticklabels(labels)
    ax2.tick_params(axis='x', rotation=30., labelsize=9)
    
    for ax in [ax1, ax2]:
        from matplotlib.ticker import MaxNLocator
        ax.yaxis.set_major_locator(MaxNLocator(integer=True))
        
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_ar_independent_hist.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_ar_independent_hist.pdf"))
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
            
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 6), sharex=True, gridspec_kw={'hspace': 0})
    
    import numpy as np
    
    # Unified bounds for shared X axis
    all_data = ler_improvements + ar_improvements
    global_min = min(all_data) if all_data else -10
    global_max = max(all_data) if all_data else 100
    
    # We want ~20 bins for LER, and ~40 bins for AR.
    # To ensure 0 is a boundary, we choose a fixed step like 10
    # Range is ~200, so step=10 gives ~20 bins.
    ler_step = 10
    ar_step = 5
    
    # Round to nearest multiple of ler_step to ensure 0 is on a boundary
    b_min = math.floor(global_min / ler_step) * ler_step
    b_max = math.ceil(global_max / ler_step) * ler_step
    
    import numpy as np
    ler_bins = np.arange(b_min, b_max + ler_step, ler_step)
    ar_bins = np.arange(b_min, b_max + ar_step, ar_step)
    
    # LER Histogram (Top)
    ler_counts, _ = np.histogram(ler_improvements, bins=ler_bins)
    ax1.bar(ler_bins[:-1], ler_counts, width=np.diff(ler_bins), align='edge', 
            color=colors[0], edgecolor='white', label='LER Improvement')
    
    ler_mean = np.mean(ler_improvements)
    max_ler_count = max(ler_counts) if len(ler_counts) > 0 else 1
    ax1.plot([ler_mean, ler_mean], [0, max_ler_count * 1.1], color='black', linestyle='--', linewidth=1.5)
    ax1.text(ler_mean + 1, max_ler_count * 0.9, f"Avg: {ler_mean:.1f}%", color='black', va='center')
    
    ax1.set_ylabel("Number of Codes")
    ax1.legend()
    
    # AR Histogram (Bottom)
    ar_counts, _ = np.histogram(ar_improvements, bins=ar_bins)
    
    ax2.bar(ar_bins[:-1], ar_counts, width=np.diff(ar_bins), align='edge', 
            color=colors[1], edgecolor='white', label='AR Improvement')
            
    ar_mean = np.mean(ar_improvements)
    max_ar_count = max(ar_counts) if len(ar_counts) > 0 else 1
    ax2.plot([ar_mean, ar_mean], [0, max_ar_count * 1.1], color='black', linestyle='--', linewidth=1.5)
    ax2.text(ar_mean + 1, max_ar_count * 0.9, f"Avg: {ar_mean:.1f}%", color='black', va='center')
    
    ax2.invert_yaxis()
    ax2.set_ylabel("Number of Codes")
    ax2.set_xlabel("Improvement (%)")
    ax2.legend()
    
    for ax in [ax1, ax2]:
        from matplotlib.ticker import MaxNLocator
        ax.yaxis.set_major_locator(MaxNLocator(integer=True))
        ax.grid(True, linestyle='--', alpha=0.5)
        # Highlight 0
        ax.axvline(0, color='gray', linewidth=2, alpha=0.8)
    
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
        plt.scatter(fao_depth_min, fao_sim_min, color=colors["Flag at Origin"], zorder=2, s=50, marker='^', alpha=0.8)
        plt.scatter(spider_depth_min, spider_sim_min, color=colors["SpiderCSS"], zorder=2, s=50, marker='^', alpha=0.8)
        
        # Scatter max_reuse (squares)
        plt.scatter(fao_depth_max, fao_sim_max, color=colors["Flag at Origin"], zorder=2, s=50, marker='s', alpha=0.8)
        plt.scatter(spider_depth_max, spider_sim_max, color=colors["SpiderCSS"], zorder=2, s=50, marker='s', alpha=0.8)




    plt.xscale("function", functions=(lambda x: x**0.5, lambda x: x**2))
    plt.yscale("function", functions=(lambda x: x**0.5, lambda x: x**2))
    
    ticks = [0,5,10,20,30,40,50,75,100,150,200,250,300,400,500,600,700,800,900]
    ax = plt.gca()
    ax.set_xticks(ticks)
    ax.set_yticks([t for t in ticks if t <= 500])
    ax.set_xlim(0, 900)
    ax.set_ylim(0, 500)
    ax.tick_params(axis='x', rotation=45, labelsize=9)
    ax.tick_params(axis='y', labelsize=9)
    
    plt.xlabel("Circuit Depth")
    plt.ylabel("Simultaneous Qubits")
    plt.grid(True, which="both", ls="--", alpha=0.5)
    
    # Legend setup
    fao_marker = mlines.Line2D([], [], color=colors["Flag at Origin"], marker='o', linestyle='None', markersize=8, label='Flag at Origin')
    spider_marker = mlines.Line2D([], [], color=colors["SpiderCSS"], marker='o', linestyle='None', markersize=8, label='SpiderCSS')
    
    min_reuse_marker = mlines.Line2D([], [], color='gray', marker='^', linestyle='None', markersize=8, label='Min Reuse (Depth Opt.)')
    max_reuse_marker = mlines.Line2D([], [], color='gray', marker='s', linestyle='None', markersize=8, label='Max Reuse (Sim Qubit Opt.)')
    
    plt.legend(handles=[fao_marker, spider_marker, min_reuse_marker, max_reuse_marker], loc='lower right', framealpha=1.0, facecolor='white', edgecolor='#cccccc')
    plt.tight_layout()
    plt.gcf().canvas.draw()

    # Styled labels with badges and straight dual arrows
    bbox_props = dict(boxstyle="round_centered,pad=0.28,y_shift=0.05", facecolor="white", edgecolor="#999999", lw=0.8, alpha=1.0)
    arrow_kw = dict(arrowstyle="->", color="#333333", lw=1.1)

    label_configs = [
        {
            "text": "[[49, 1, 7]]",
            "pos": (120, 120),
            "tri": (43 + 2, 134),
            "sq": (129, 65 + 2),
        },
        {
            "text": "[[49, 1, 5]]",
            "pos": (200, 170),
            "tri": (56 + 2, 154),
            "sq": (195, 89 + 3),
        },
        {
            "text": "[[47, 1, 11]]",
            "pos": (550, 380),
            "tri": (289 + 6, 435),
            "sq": (635, 185 + 5),
        },
    ]

    for cfg in label_configs:
        t = ax.text(cfg["pos"][0], cfg["pos"][1], cfg["text"],
                    ha="center", va="center", fontsize=9.5, bbox=bbox_props, zorder=5)
        cfg["text_obj"] = t

    plt.gcf().canvas.draw()
    inv = ax.transData.inverted()

    for cfg in label_configs:
        t = cfg["text_obj"]
        disp_bbox = t._bbox_patch.get_window_extent()
        mid_bottom = inv.transform(((disp_bbox.x0 + disp_bbox.x1) / 2, disp_bbox.y0))
        mid_left = inv.transform((disp_bbox.x0, (disp_bbox.y0 + disp_bbox.y1) / 2))
        
        # Arrow to triangle from mid_left
        ax.annotate("", xy=cfg["tri"], xytext=mid_left,
                    arrowprops=arrow_kw, zorder=4)
        # Arrow to square from mid_bottom
        ax.annotate("", xy=cfg["sq"], xytext=mid_bottom,
                    arrowprops=arrow_kw, zorder=4)

    plt.savefig(os.path.join(plots_dir, "depth_sim_qubits_scatter.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "depth_sim_qubits_scatter.pdf"))
    plt.close()

if __name__ == "__main__":
    main()
