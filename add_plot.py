import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Add the new function before plot_ler_vs_code
new_func = """def plot_ler_and_ar_vs_code(codes, best_stats, fao_stats, colors, plots_dir):
    filtered_codes = [
        c for c in codes
        if best_stats[c].get("logical_error_rate") is not None
        and fao_stats[c].get("logical_error_rate") is not None
        and best_stats[c].get("acceptance_rate") is not None
        and fao_stats[c].get("acceptance_rate") is not None
    ]
    
    fig, (ax_ar, ax_ler) = plt.subplots(2, 1, figsize=(7, 7.5), sharex=True, gridspec_kw={'height_ratios': [1, 1.5], 'hspace': 0.1})
    x_positions = np.arange(len(filtered_codes))
    
    for i, code in enumerate(filtered_codes):
        # LER
        fao_mid = fao_stats[code].get("logical_error_rate")
        fao_samples = fao_stats[code].get("num_samples", 0) * fao_stats[code].get("acceptance_rate", 1.0)
        fao_low, fao_high = wilson_score_interval(fao_mid, fao_samples)
        
        ax_ler.errorbar(i - 0.1, fao_mid, yerr=[[fao_mid - fao_low], [fao_high - fao_mid]], 
                     fmt='o', color=colors["Flag at Origin"], capsize=5, zorder=3,
                     label="Flag at Origin" if i == 0 else "")

        spider_ler = best_stats[code].get("logical_error_rate")
        spider_samples = best_stats[code].get("num_samples", 0) * best_stats[code].get("acceptance_rate", 1.0)
        spider_low, spider_high = wilson_score_interval(spider_ler, spider_samples)
        
        ax_ler.errorbar(i + 0.1, spider_ler, yerr=[[spider_ler - spider_low], [spider_high - spider_ler]], 
                     fmt='o', color=colors["SpiderCSS"], capsize=5, zorder=2,
                     label="SpiderCSS" if i == 0 else "")

        # AR
        fao_ar = fao_stats[code].get("acceptance_rate")
        fao_ar_samples = fao_stats[code].get("num_samples", 0)
        fao_ar_low, fao_ar_high = wilson_score_interval(fao_ar, fao_ar_samples)
        
        ax_ar.errorbar(i - 0.1, fao_ar, yerr=[[fao_ar - fao_ar_low], [fao_ar_high - fao_ar]], 
                     fmt='o', color=colors["Flag at Origin"], capsize=5, zorder=3)

        spider_ar = best_stats[code].get("acceptance_rate")
        spider_ar_samples = best_stats[code].get("num_samples", 0)
        spider_ar_low, spider_ar_high = wilson_score_interval(spider_ar, spider_ar_samples)
        
        ax_ar.errorbar(i + 0.1, spider_ar, yerr=[[spider_ar - spider_ar_low], [spider_ar_high - spider_ar]], 
                     fmt='o', color=colors["SpiderCSS"], capsize=5, zorder=2)

    ax_ler.set_yscale("log")
    
    labels = []
    for code in filtered_codes:
        n = best_stats[code].get("n")
        k = best_stats[code].get("k")
        d = best_stats[code].get("d")
        labels.append(f"[[{n},{k},{d}]]")
        
    ax_ler.set_xticks(x_positions)
    ax_ler.set_xticklabels(labels)
    ax_ler.tick_params(axis='x', bottom=False, rotation=45, labelsize=12)
    
    ax_ler.set_ylabel("Logical Error Rate")
    ax_ar.set_ylabel("Acceptance Rate")
    
    ax_ler.legend()
    
    for ax in [ax_ar, ax_ler]:
        ax.grid(True, which="both", axis="y", ls="--", alpha=0.3)
        for i in range(len(filtered_codes) - 1):
            ax.axvline(x=i + 0.5, color='gray', linestyle='-', alpha=0.5)
            
    # Set y limits for AR to be 0 to 1
    # Actually, min/max of the data with a small padding
    ar_min = min(fao_stats[c].get("acceptance_rate", 1) for c in filtered_codes + [c for c in filtered_codes if best_stats[c].get("acceptance_rate") is not None])
    ar_min = min(ar_min, min(best_stats[c].get("acceptance_rate", 1) for c in filtered_codes))
    
    # Let matplotlib handle AR ylim, just ensure it's not going above 1 if data is tight
    
    plt.tight_layout()
    plt.savefig(os.path.join(plots_dir, "ler_and_ar_vs_code.png"), dpi=300)
    plt.savefig(os.path.join(plots_dir, "ler_and_ar_vs_code.pdf"))
    plt.close()

def plot_ler_vs_code"""

content = content.replace("def plot_ler_vs_code", new_func)

# Call it in main
main_call = """
    plot_independent_histograms(codes, best_stats, fao_stats, palette, plots_dir)
    plot_ler_vs_code(codes, best_stats, fao_stats, colors, plots_dir)
    plot_ler_and_ar_vs_code(codes, best_stats, fao_stats, colors, plots_dir)
"""
content = content.replace("    plot_ler_vs_code(codes, best_stats, fao_stats, colors, plots_dir)\n", "    plot_ler_vs_code(codes, best_stats, fao_stats, colors, plots_dir)\n    plot_ler_and_ar_vs_code(codes, best_stats, fao_stats, colors, plots_dir)\n")

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
