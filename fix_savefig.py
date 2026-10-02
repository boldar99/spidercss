import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Replace plt.tight_layout() with fig.tight_layout() 
content = content.replace("plt.tight_layout()", "fig.tight_layout()")

# Add bbox_inches='tight' to savefig
content = content.replace("plt.savefig(os.path.join(plots_dir, \"ler_and_ar_vs_code.png\"), dpi=300)", "plt.savefig(os.path.join(plots_dir, \"ler_and_ar_vs_code.png\"), dpi=300, bbox_inches='tight')")
content = content.replace("plt.savefig(os.path.join(plots_dir, \"ler_and_ar_vs_code.pdf\"))", "plt.savefig(os.path.join(plots_dir, \"ler_and_ar_vs_code.pdf\"), bbox_inches='tight')")

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
