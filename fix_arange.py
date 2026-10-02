import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

content = content.replace("np.arange(0, 1.1, 0.1)", "np.arange(0, 1.05, 0.1)")

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
