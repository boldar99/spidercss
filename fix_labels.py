import re
with open("spidercss/visualize.py", "r") as f:
    content = f.read()

content = content.replace("'Depth-optimizing (Depth Opt.)'", "'Depth-optimizing'")
content = content.replace("'Footprint-optimizing (Sim Qubit Opt.)'", "'Footprint-optimizing'")

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
