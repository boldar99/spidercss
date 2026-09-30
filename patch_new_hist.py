import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

new_plot_func = """def plot_independent_histograms(codes, best_stats, fao_stats, colors, plots_dir):
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
    
    # LER Histogram
    ler_min = min(ler_improvements) if ler_improvements else 0
    ler_max = max(ler_improvements) if ler_improvements else 100
    ler_bins = np.linspace(ler_min, ler_max, 21)
    
    ler_counts, _ = np.histogram(ler_improvements, bins=ler_bins)
    ax1.bar(ler_bins[:-1], ler_counts, width=np.diff(ler_bins), align='edge', 
            color=colors.get("SpiderCSS", "C1"), edgecolor='white', label='LER Improvement')
            
    ler_mean = np.mean(ler_improvements)
    max_ler_count = max(ler_counts) if len(ler_counts) > 0 else 1
    ax1.plot([ler_mean, ler_mean], [0, max_ler_count * 1.1], color='black', linestyle='--', linewidth=1.5)
    ax1.text(ler_mean + (ler_max - ler_min)*0.02, max_ler_count * 0.9, f"Avg: {ler_mean:.1f}%", color='black', va='center')
    
    ax1.set_ylabel("Number of Codes")
    ax1.set_xlabel("LER Improvement (%)")
    ax1.grid(True, linestyle='--', alpha=0.5)
    ax1.axvline(0, color='gray', linewidth=2, alpha=0.8)
    ax1.legend()
    
    # AR Histogram
    ar_min = min(ar_improvements) if ar_improvements else -5
    ar_max = max(ar_improvements) if ar_improvements else 5
    ar_bins = np.linspace(ar_min, ar_max, 21)
    
    ar_counts, _ = np.histogram(ar_improvements, bins=ar_bins)
    ax2.bar(ar_bins[:-1], ar_counts, width=np.diff(ar_bins), align='edge', 
            color=colors.get("Flag at Origin", "C0"), edgecolor='white', label='AR Improvement')
            
    ar_mean = np.mean(ar_improvements)
    max_ar_count = max(ar_counts) if len(ar_counts) > 0 else 1
    ax2.plot([ar_mean, ar_mean], [0, max_ar_count * 1.1], color='black', linestyle='--', linewidth=1.5)
    ax2.text(ar_mean + (ar_max - ar_min)*0.02, max_ar_count * 0.9, f"Avg: {ar_mean:.1f}%", color='black', va='center')
    
    ax2.set_ylabel("Number of Codes")
    ax2.set_xlabel("AR Improvement (%)")
    ax2.grid(True, linestyle='--', alpha=0.5)
    ax2.axvline(0, color='gray', linewidth=2, alpha=0.8)
    ax2.legend()
    
    for ax in [ax1, ax2]:
        from matplotlib.ticker import MaxNLocator
        ax.yaxis.set_major_locator(MaxNLocator(integer=True))
        
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_ar_independent_hist.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_ar_independent_hist.pdf"))
    plt.close()

def plot_ler_improvement_hist"""

content = content.replace("def plot_ler_improvement_hist", new_plot_func)

main_call = """    plot_mirrored_histogram(codes, best_stats, fao_stats, colors, plots_dir)
    plot_independent_histograms(codes, best_stats, fao_stats, colors, plots_dir)"""

content = content.replace("    plot_mirrored_histogram(codes, best_stats, fao_stats, colors, plots_dir)", main_call)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)

