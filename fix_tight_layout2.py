import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

content = content.replace("fig.tight_layout()", "plt.tight_layout()")

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
