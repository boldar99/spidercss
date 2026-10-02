import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# 1. Visually add a small gap: change hspace to 0.05
old_subplots = "fig, (ax_ar, ax_ler) = plt.subplots(2, 1, figsize=(7, 7.5), sharex=True, gridspec_kw={'height_ratios': [1, 1], 'hspace': 0.0})"
new_subplots = "fig, (ax_ar, ax_ler) = plt.subplots(2, 1, figsize=(7, 7.5), sharex=True, gridspec_kw={'height_ratios': [1, 1], 'hspace': 0.08})"
content = content.replace(old_subplots, new_subplots)

# 2. Adjust ylim for ax_ar
# We replace the commented block about AR ylim with actual limits
old_ylim = """    # Set y limits for AR to be 0 to 1
    # Actually, min/max of the data with a small padding
    ar_min = min(fao_stats[c].get("acceptance_rate", 1) for c in filtered_codes + [c for c in filtered_codes if best_stats[c].get("acceptance_rate") is not None])
    ar_min = min(ar_min, min(best_stats[c].get("acceptance_rate", 1) for c in filtered_codes))
    
    # Let matplotlib handle AR ylim, just ensure it's not going above 1 if data is tight"""

new_ylim = """    # Set y limits for AR to be 0 to 1
    # Actually, min/max of the data with a small padding
    ar_min = min(fao_stats[c].get("acceptance_rate", 1) for c in filtered_codes + [c for c in filtered_codes if best_stats[c].get("acceptance_rate") is not None])
    ar_min = min(ar_min, min(best_stats[c].get("acceptance_rate", 1) for c in filtered_codes))
    
    # Widen AR scale to fit 10^-2, and put 10^0 close to the top
    ax_ar.set_ylim(0.8e-2, 1.1)"""

content = content.replace(old_ylim, new_ylim)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
