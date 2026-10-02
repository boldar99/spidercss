import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Replace height_ratios and hspace
old_subplots = "fig, (ax_ar, ax_ler) = plt.subplots(2, 1, figsize=(7, 7.5), sharex=True, gridspec_kw={'height_ratios': [1, 1.5], 'hspace': 0.1})"
new_subplots = "fig, (ax_ar, ax_ler) = plt.subplots(2, 1, figsize=(7, 7.5), sharex=True, gridspec_kw={'height_ratios': [1, 1], 'hspace': 0.0})"
content = content.replace(old_subplots, new_subplots)

# Add logarithmic scale for AR
old_yscale = "ax_ler.set_yscale(\"log\")"
new_yscale = "ax_ler.set_yscale(\"log\")\n    ax_ar.set_yscale(\"log\")"
content = content.replace(old_yscale, new_yscale)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
