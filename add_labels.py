import re
with open("spidercss/visualize.py", "r") as f:
    content = f.read()

# In plot_improvement_scatter_depth_sim_qubits, we should extract the code points and annotate them
# just like in plot_improvement_scatter_ler_ar

to_replace = """        if pair_min and pair_max:
            connected_pairs.append((pair_min, pair_max))"""

replacement = """        if pair_min and pair_max:
            connected_pairs.append((pair_min, pair_max))
            
            n = css.get("n", best_stats[code].get("n") if isinstance(best_stats[code], dict) else None)
            k = css.get("k", best_stats[code].get("k") if isinstance(best_stats[code], dict) else None)
            d = css.get("d", best_stats[code].get("d") if isinstance(best_stats[code], dict) else None)
            
            # Use max reuse for labels as default or average between min and max?
            # Let's just store max reuse for labeling
            if not hasattr(plot_improvement_scatter_depth_sim_qubits, "code_points"):
                plot_improvement_scatter_depth_sim_qubits.code_points = {}
            plot_improvement_scatter_depth_sim_qubits.code_points[code] = {
                "label": f"[[{n}, {k}, {d}]]",
                "d_imp_min": pair_min[0],
                "q_imp_min": pair_min[1],
                "d_imp_max": pair_max[0],
                "q_imp_max": pair_max[1],
            }"""

if to_replace in content:
    content = content.replace(to_replace, replacement)
else:
    print("Could not find insertion point 1")

to_replace_2 = """        base_marker = mlines.Line2D([], [], color='black', marker='P', linestyle='None', markersize=12, label='Flag at Origin Baseline')
        plt.legend(loc='upper left', handles=[min_dots, max_dots, avg_marker, base_marker], fontsize=10)
        averages_x = [avg_d_min, avg_d_max]
        averages_y = [avg_q_min, avg_q_max]"""

replacement_2 = """        base_marker = mlines.Line2D([], [], color='black', marker='P', linestyle='None', markersize=12, label='Flag at Origin Baseline')
        plt.legend(loc='upper left', handles=[min_dots, max_dots, avg_marker, base_marker], fontsize=10)
        averages_x = [avg_d_min, avg_d_max]
        averages_y = [avg_q_min, avg_q_max]

        # Label codes
        if hasattr(plot_improvement_scatter_depth_sim_qubits, "code_points"):
            labeled_codes = {
                "95_1_7": {"offset": (7, 5), "ha": "left", "va": "center"},
                "47_1_11": {"offset": (-7, 5), "ha": "right", "va": "center"},
                "7_1_3": {"offset": (-2, 5), "ha": "right", "va": "bottom"},
                "49_1_5": {"offset": (-0, 6), "ha": "right", "va": "bottom"},
                "49_1_7": {"offset": (7, 5), "ha": "left", "va": "center"},
            }
            for c, cfg in labeled_codes.items():
                if c in plot_improvement_scatter_depth_sim_qubits.code_points:
                    pt = plot_improvement_scatter_depth_sim_qubits.code_points[c]
                    # annotate max reuse point
                    ax.annotate(
                        pt["label"],
                        xy=(pt["d_imp_max"], pt["q_imp_max"]),
                        xytext=cfg["offset"],
                        textcoords="offset points",
                        fontsize=9.5,
                        ha=cfg["ha"],
                        va=cfg["va"],
                        zorder=6,
                    )
"""
if to_replace_2 in content:
    content = content.replace(to_replace_2, replacement_2)
else:
    print("Could not find insertion point 2")

with open("spidercss/visualize.py", "w") as f:
    f.write(content)
