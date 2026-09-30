import re
import math

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

replacement = """    # Unified bounds for shared X axis
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
    ler_counts, _ = np.histogram(ler_improvements, bins=ler_bins)"""

content = re.sub(r'    # Unified bounds for shared X axis.*?ler_counts, _ = np.histogram\(ler_improvements, bins=ler_bins\)', replacement, content, flags=re.DOTALL)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
