import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Remove bottom=False from ax_ler.tick_params
content = content.replace("ax_ler.tick_params(axis='x', bottom=False, rotation=45, labelsize=12)", "ax_ler.tick_params(axis='x', bottom=True, rotation=45, labelsize=12)")

# Add ax_ar.tick_params(axis='x', bottom=False) to remove ticks from the top plot's bottom spine
# We can insert it right after the ax_ler.tick_params line
old_lines = "    ax_ler.tick_params(axis='x', bottom=True, rotation=45, labelsize=12)"
new_lines = "    ax_ler.tick_params(axis='x', bottom=True, rotation=45, labelsize=12)\n    ax_ar.tick_params(axis='x', bottom=False)"
content = content.replace(old_lines, new_lines)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Fix in plot_ler_vs_code as well
content = content.replace("plt.tick_params(axis='x', bottom=False, rotation=45, labelsize=12)", "plt.tick_params(axis='x', bottom=True, rotation=45, labelsize=12)")

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
