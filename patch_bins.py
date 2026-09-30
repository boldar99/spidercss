import re
import math
import numpy as np

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

replacement = """    # LER Histogram
    ler_min = min(ler_improvements) if ler_improvements else 0
    ler_max = max(ler_improvements) if ler_improvements else 100
    
    # 0 falls between two bins, step of 10 gives ~20 bins for range of 200
    ler_step = 10
    ler_b_min = math.floor(ler_min / ler_step) * ler_step
    ler_b_max = math.ceil(ler_max / ler_step) * ler_step
    ler_bins = np.arange(ler_b_min, ler_b_max + ler_step, ler_step)
    
    ler_counts, _ = np.histogram(ler_improvements, bins=ler_bins)
    ax1.bar(ler_bins[:-1], ler_counts, width=np.diff(ler_bins), align='edge', 
            color=colors.get("SpiderCSS", "C1"), edgecolor='white', label='LER Improvement')
            
    ler_mean = np.mean(ler_improvements)
    max_ler_count = max(ler_counts) if len(ler_counts) > 0 else 1
    ax1.plot([ler_mean, ler_mean], [0, max_ler_count * 1.1], color='black', linestyle='--', linewidth=1.5)
    ax1.text(ler_mean + (ler_b_max - ler_b_min)*0.02, max_ler_count * 0.9, f"Avg: {ler_mean:.1f}%", color='black', va='center')
    
    ax1.set_ylabel("Number of Codes")
    ax1.set_xlabel("LER Improvement (%)")
    ax1.grid(True, linestyle='--', alpha=0.5)
    ax1.axvline(0, color='gray', linewidth=2, alpha=0.8)
    ax1.legend()
    
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
    max_ar_count = max(ar_counts) if len(ar_counts) > 0 else 1
    ax2.plot([ar_mean, ar_mean], [0, max_ar_count * 1.1], color='black', linestyle='--', linewidth=1.5)
    ax2.text(ar_mean + (ar_b_max - ar_b_min)*0.02, max_ar_count * 0.9, f"Avg: {ar_mean:.1f}%", color='black', va='center')"""

content = re.sub(r'    # LER Histogram.*?ax2\.text\(ar_mean \+ \(ar_max - ar_min\)\*0\.02, max_ar_count \* 0\.9, f"Avg: \{ar_mean:\.1f\}%", color=\'black\', va=\'center\'\)', replacement, content, flags=re.DOTALL)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
