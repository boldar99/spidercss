import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# 1. Remove ax_ar.set_yscale("log")
content = content.replace('    ax_ler.set_yscale("log")\n    ax_ar.set_yscale("log")', '    ax_ler.set_yscale("log")')

# 2. Change ylim for ax_ar and add yticks
old_ylim = "    ax_ar.set_ylim(0.8e-2, 1.1)"
new_ylim = "    ax_ar.set_ylim(0, 1.02)\n    ax_ar.set_yticks(np.arange(0, 1.1, 0.1))"
content = content.replace(old_ylim, new_ylim)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
