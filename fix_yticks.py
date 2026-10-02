import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

old_code = "    ax_ar.set_yticks(np.arange(0, 1.05, 0.1))"
new_code = """    ar_ticks = np.arange(0, 1.05, 0.1)
    ax_ar.set_yticks(ar_ticks)
    ax_ar.set_yticklabels([f"{t:g}" if i % 2 == 0 else "" for i, t in enumerate(ar_ticks)])"""

content = content.replace(old_code, new_code)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
