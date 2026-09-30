import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Replace in plot_mirrored_histogram
mirrored_search = r"""    ler_mean = np.mean\(ler_improvements\)
    max_ler_count = max\(ler_counts\) if len\(ler_counts\) > 0 else 1
    ax1.plot\(\[ler_mean, ler_mean\], \[0, max_ler_count \* 1.1\], color='black', linestyle='--', linewidth=1.5\)
    ax1.text\(ler_mean \+ 1, max_ler_count \* 0.9, f"Avg: \{ler_mean:.1f\}%", color='black', va='center'\)
    
    ax1.set_ylabel\("Number of Codes"\)
    ax1.legend\(\)
    
    # AR Histogram \(Bottom\)
    ar_counts, _ = np.histogram\(ar_improvements, bins=ar_bins\)
    
    ax2.bar\(ar_bins\[:-1\], ar_counts, width=np.diff\(ar_bins\), align='edge', 
            color=colors.get\("Flag at Origin", "C0"\), edgecolor='white', label='AR Improvement'\)
            
    ar_mean = np.mean\(ar_improvements\)
    max_ar_count = max\(ar_counts\) if len\(ar_counts\) > 0 else 1
    ax2.plot\(\[ar_mean, ar_mean\], \[0, max_ar_count \* 1.1\], color='black', linestyle='--', linewidth=1.5\)
    # Put text below the line since Y axis is inverted
    ax2.text\(ar_mean \+ 1, max_ar_count \* 0.9, f"Avg: \{ar_mean:.1f\}%", color='black', va='center'\)
    
    ax2.invert_yaxis\(\)
    ax2.set_ylabel\("Number of Codes"\)
    ax2.set_xlabel\("Improvement \(%\)"\)
    ax2.legend\(\)
    
    for ax in \[ax1, ax2\]:"""

mirrored_replace = """    ler_mean = np.mean(ler_improvements)
    ax1.axvline(ler_mean, color='black', linestyle='--', linewidth=1.5)
    
    ax1.set_ylabel("Number of Codes")
    ax1.legend()
    
    # AR Histogram (Bottom)
    ar_counts, _ = np.histogram(ar_improvements, bins=ar_bins)
    
    ax2.bar(ar_bins[:-1], ar_counts, width=np.diff(ar_bins), align='edge', 
            color=colors.get("Flag at Origin", "C0"), edgecolor='white', label='AR Improvement')
            
    ar_mean = np.mean(ar_improvements)
    ax2.axvline(ar_mean, color='black', linestyle='--', linewidth=1.5)
    
    ax2.invert_yaxis()
    ax2.set_ylabel("Number of Codes")
    ax2.set_xlabel("Improvement (%)")
    ax2.legend()
    
    # Add ticks for averages on the bottom axis
    fig.canvas.draw()
    current_ticks = list(ax2.get_xticks())
    new_ticks = current_ticks + [ler_mean, ar_mean]
    ax2.set_xticks(new_ticks)
    
    labels = []
    for t in new_ticks[:-2]:
        labels.append(f"{t:g}")
    labels.append(f"LER Avg\\n{ler_mean:.1f}%")
    labels.append(f"AR Avg\\n{ar_mean:.1f}%")
    ax2.set_xticklabels(labels)
    
    for ax in [ax1, ax2]:"""

content = re.sub(mirrored_search, mirrored_replace, content, flags=re.DOTALL)


# Replace in plot_independent_histograms
indep_search = r"""    ler_mean = np.mean\(ler_improvements\)
    max_ler_count = max\(ler_counts\) if len\(ler_counts\) > 0 else 1
    ax1.plot\(\[ler_mean, ler_mean\], \[0, max_ler_count \* 1.1\], color='black', linestyle='--', linewidth=1.5\)
    ax1.text\(ler_mean \+ \(ler_b_max - ler_b_min\)\*0.02, max_ler_count \* 0.9, f"Avg: \{ler_mean:.1f\}%", color='black', va='center'\)
    
    ax1.set_ylabel\("Number of Codes"\)
    ax1.set_xlabel\("LER Improvement \(%\)"\)
    ax1.grid\(True, linestyle='--', alpha=0.5\)
    ax1.axvline\(0, color='gray', linewidth=2, alpha=0.8\)
    ax1.legend\(\)
    
    # AR Histogram
    raw_ar_min = min\(ar_improvements\) if ar_improvements else 0
    ar_min = min\(0, raw_ar_min\) # Start at 0 if possible, or lower if negatives exist
    ar_max = max\(ar_improvements\) if ar_improvements else 5
    
    # Find nice step for ~20 bins
    target_ar_bins = 20
    raw_ar_step = \(ar_max - ar_min\) / target_ar_bins if ar_max > ar_min else 1
    nice_ar_steps = \[0.1, 0.2, 0.25, 0.5, 1.0, 2.0, 5.0\]
    ar_step = nice_ar_steps\[-1\]
    for s in nice_ar_steps:
        if s >= raw_ar_step:
            ar_step = s
            break
            
    ar_b_min = math.floor\(ar_min / ar_step\) \* ar_step
    ar_b_max = math.ceil\(ar_max / ar_step\) \* ar_step
    ar_bins = np.arange\(ar_b_min, ar_b_max \+ ar_step, ar_step\)
    
    ar_counts, _ = np.histogram\(ar_improvements, bins=ar_bins\)
    ax2.bar\(ar_bins\[:-1\], ar_counts, width=np.diff\(ar_bins\), align='edge', 
            color=colors.get\("Flag at Origin", "C0"\), edgecolor='white', label='AR Improvement'\)
            
    ar_mean = np.mean\(ar_improvements\)
    max_ar_count = max\(ar_counts\) if len\(ar_counts\) > 0 else 1
    ax2.plot\(\[ar_mean, ar_mean\], \[0, max_ar_count \* 1.1\], color='black', linestyle='--', linewidth=1.5\)
    ax2.text\(ar_mean \+ \(ar_b_max - ar_b_min\)\*0.02, max_ar_count \* 0.9, f"Avg: \{ar_mean:.1f\}%", color='black', va='center'\)
    
    ax2.set_ylabel\("Number of Codes"\)
    ax2.set_xlabel\("AR Improvement \(%\)"\)
    ax2.grid\(True, linestyle='--', alpha=0.5\)
    ax2.axvline\(0, color='gray', linewidth=2, alpha=0.8\)
    ax2.legend\(\)"""

indep_replace = """    ler_mean = np.mean(ler_improvements)
    ax1.axvline(ler_mean, color='black', linestyle='--', linewidth=1.5)
    
    ax1.set_ylabel("Number of Codes")
    ax1.set_xlabel("LER Improvement (%)")
    ax1.grid(True, linestyle='--', alpha=0.5)
    ax1.axvline(0, color='gray', linewidth=2, alpha=0.8)
    ax1.legend()
    
    # Add tick for LER mean
    fig.canvas.draw()
    current_ticks = list(ax1.get_xticks())
    new_ticks = current_ticks + [ler_mean]
    ax1.set_xticks(new_ticks)
    labels = [f"{t:g}" for t in current_ticks] + [f"Avg\\n{ler_mean:.1f}%"]
    ax1.set_xticklabels(labels)
    
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
            color=colors.get("Flag at Origin", "C0"), edgecolor='white', label='AR Improvement')
            
    ar_mean = np.mean(ar_improvements)
    ax2.axvline(ar_mean, color='black', linestyle='--', linewidth=1.5)
    
    ax2.set_ylabel("Number of Codes")
    ax2.set_xlabel("AR Improvement (%)")
    ax2.grid(True, linestyle='--', alpha=0.5)
    ax2.axvline(0, color='gray', linewidth=2, alpha=0.8)
    ax2.legend()
    
    # Add tick for AR mean
    fig.canvas.draw()
    current_ticks = list(ax2.get_xticks())
    new_ticks = current_ticks + [ar_mean]
    ax2.set_xticks(new_ticks)
    labels = [f"{t:g}" for t in current_ticks] + [f"Avg\\n{ar_mean:.1f}%"]
    ax2.set_xticklabels(labels)"""

content = re.sub(indep_search, indep_replace, content, flags=re.DOTALL)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
