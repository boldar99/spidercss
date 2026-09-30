with open("spidercss/visualize.py", "r") as f:
    lines = f.readlines()
for i, line in enumerate(lines):
    if "labels = [" in line and 'Avg' in line:
        lines[i] = line.replace('\n', '\\n').replace(']\\n', ']\n')
with open("spidercss/visualize.py", "w") as f:
    f.writelines(lines)
