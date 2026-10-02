import re

with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# Remove labels from ax_ler
content = content.replace(
"""        ax_ler.errorbar(i - 0.1, fao_mid, yerr=[[fao_mid - fao_low], [fao_high - fao_mid]], 
                     fmt='o', color=colors["Flag at Origin"], capsize=5, zorder=3,
                     label="Flag at Origin" if i == 0 else "")""",
"""        ax_ler.errorbar(i - 0.1, fao_mid, yerr=[[fao_mid - fao_low], [fao_high - fao_mid]], 
                     fmt='o', color=colors["Flag at Origin"], capsize=5, zorder=3)"""
)

content = content.replace(
"""        ax_ler.errorbar(i + 0.1, spider_ler, yerr=[[spider_ler - spider_low], [spider_high - spider_ler]], 
                     fmt='o', color=colors["SpiderCSS"], capsize=5, zorder=2,
                     label="SpiderCSS" if i == 0 else "")""",
"""        ax_ler.errorbar(i + 0.1, spider_ler, yerr=[[spider_ler - spider_low], [spider_high - spider_ler]], 
                     fmt='o', color=colors["SpiderCSS"], capsize=5, zorder=2)"""
)

# Add labels to ax_ar
content = content.replace(
"""        ax_ar.errorbar(i - 0.1, fao_ar, yerr=[[fao_ar - fao_ar_low], [fao_ar_high - fao_ar]], 
                     fmt='o', color=colors["Flag at Origin"], capsize=5, zorder=3)""",
"""        ax_ar.errorbar(i - 0.1, fao_ar, yerr=[[fao_ar - fao_ar_low], [fao_ar_high - fao_ar]], 
                     fmt='o', color=colors["Flag at Origin"], capsize=5, zorder=3,
                     label="Flag at Origin" if i == 0 else "")"""
)

content = content.replace(
"""        ax_ar.errorbar(i + 0.1, spider_ar, yerr=[[spider_ar - spider_ar_low], [spider_ar_high - spider_ar]], 
                     fmt='o', color=colors["SpiderCSS"], capsize=5, zorder=2)""",
"""        ax_ar.errorbar(i + 0.1, spider_ar, yerr=[[spider_ar - spider_ar_low], [spider_ar_high - spider_ar]], 
                     fmt='o', color=colors["SpiderCSS"], capsize=5, zorder=2,
                     label="SpiderCSS" if i == 0 else "")"""
)

# Replace ax_ler.legend() with ax_ar.legend(loc='lower left')
content = content.replace("    ax_ler.legend()", "    ax_ar.legend(loc='lower left')")

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
