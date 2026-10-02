import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Add set_xlim before tight_layout
old_tail = """    ax_ar.set_ylim(0.8e-2, 1.1)
    
    plt.tight_layout()"""

new_tail = """    ax_ar.set_ylim(0.8e-2, 1.1)
    
    ax_ler.set_xlim(-0.5, len(filtered_codes) - 0.5)
    
    plt.tight_layout()"""

content = content.replace(old_tail, new_tail)

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
