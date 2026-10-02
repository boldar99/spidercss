import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Replace "Min Reuse" with "Depth-optimizing"
# Replace "Max Reuse" with "Footprint-optimizing"
content = content.replace('"Min Reuse"', '"Depth-optimizing"')
content = content.replace('"Max Reuse"', '"Footprint-optimizing"')
content = content.replace("'Min Reuse", "'Depth-optimizing")
content = content.replace("'Max Reuse", "'Footprint-optimizing")

# Replace "Flag at origin" with "Flag at Origin"
content = content.replace('"Flag at origin"', '"Flag at Origin"')
content = content.replace("'Flag at origin'", "'Flag at Origin'")
content = content.replace("'Flag at origin Baseline'", "'Flag at Origin Baseline'")
# Wait, "Flag at origin" would already match the baseline if replaced safely.

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
