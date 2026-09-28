import matplotlib.pyplot as plt
import networkx as nx
import numpy as np
import stim

from spidercss.circuit_extraction import CatStateExtractor, StimBuilder
from spidercss.draw import draw_forest_on_graph, display_digraph
from spidercss.hook_errors import characterize_stabilizer_splits, get_exact_partial_splits
from spidercss.spider_leg_matcher import match_edges
from spidercss.utils import find_pivots_in_matrix, load_qecc, count_operations, get_conj_M
from spidercss.well_ordered_cat_state import well_ordered_ft_cat_state_data, well_ordered_composite_cat_state_data
from spidercss.optimize_parity_matrix import has_unique_ones_property, row_optimize_matrix
from spidercss.joint_extraction_planner import plan_joint_extraction, materialize_matching
from spidercss.resource_targets import ReuseTarget


def row_optimized_cat_at_origin(H: np.ndarray, d: int, basis="Z", max_basis_tries: int = 10_000,
                                analyze_hook_errors=False, is_perfect_code=False,
                                reuse_target: ReuseTarget | str = ReuseTarget.QUBITS):
    t = (d - 1) // 2
    _, matrix_after_row_ops = row_optimize_matrix(H, t, max_basis_tries)
    return cat_at_origin(
        matrix_after_row_ops, d, basis=basis, analyze_hook_errors=analyze_hook_errors,
        is_perfect_code=is_perfect_code, reuse_target=reuse_target
    )


def cat_at_origin(H: np.ndarray, d: int, draw_solutions=False, basis="Z", *,
                  analyze_hook_errors=False, _hook_results=None, is_perfect_code=False,
                  reuse_target: ReuseTarget | str = ReuseTarget.QUBITS) -> stim.Circuit:
    if not has_unique_ones_property(H):
        raise ValueError(f"H is not representing a bipartite graph state.")

    N = H.shape[1]
    t = d // 2

    pivots, rows_without_pivots = find_pivots_in_matrix(H)
    pivots_perm = [row for row, col in sorted(pivots.items(), key=lambda item: item[1])]
    non_pivots = [p for p in range(N) if p not in pivots.values()]
    assert len(rows_without_pivots) == 0

    M_prep = get_conj_M(H)
    if analyze_hook_errors:
        _hook_results = _hook_results or characterize_stabilizer_splits(M_prep)

    x_splits = []
    for j, p in enumerate(non_pivots):
        supp = tuple(np.where(M_prep[j] == 1)[0].tolist())
        if analyze_hook_errors and supp in _hook_results:
            results = _hook_results[supp]
            if results.get("universal"):
                # Pick the first universal shape
                shape = results["universal"][0]
                # Partition supp arbitrarily matching sizes, but ensure p is in the last chunk
                supp_list = list(supp)
                if p in supp_list:
                    supp_list.remove(p)
                
                part = []
                for chunk_size in shape[:-1]:
                    part.append(tuple(sorted(supp_list[:chunk_size])))
                    supp_list = supp_list[chunk_size:]
                part.append(tuple(sorted(supp_list + [p])))
                x_splits.append(list(part))
            elif results.get("partial"):
                shape = results["partial"][0]
                exact_chain = get_exact_partial_splits(supp, shape, results.get("splits_by_size", {}), required_last_element=p)
                if exact_chain:
                    x_splits.append(list(exact_chain))
                else:
                    x_splits.append([tuple(sorted(supp))])
            else:
                x_splits.append([tuple(sorted(supp))])
        else:
            x_splits.append([tuple(sorted(supp))])
    x_spiders = [list(map(len, p)) for p in x_splits]
    z_spiders = np.sum(H, axis=1)

    x_t = t - 1 if is_perfect_code else t

    z_data = [well_ordered_ft_cat_state_data(zs, t) for zs in z_spiders]
    x_data = [well_ordered_composite_cat_state_data(xs, x_t) for xs in x_spiders]
    z_graphs, x_graphs, z_trees, x_trees, z_mains, x_mains = [], [], [], [], [], []
    z_digraphs, x_digraphs = [], []
    z_candidates, x_candidates = [], []
    z_roots, x_roots = [], []
    for (G, F, roots, D, e) in z_data:
        nx.set_node_attributes(G, basis, 'spider_type')
        z_graphs.append(G)
        z_trees.append(F)
        z_roots.append(roots)
        z_digraphs.append(D)
        z_mains.append(e)

        # Flatten topological generations into prioritized 1D candidate pools
        cands = []
        for layer in nx.topological_generations(D):
            cands.extend([l for l in layer if l != e and G.nodes[l].get("is_mark", False)])
        z_candidates.append(cands)

    for j, (G, F, roots, D, e) in enumerate(x_data):
        nx.set_node_attributes(G, "X" if (basis == "Z") else "Z", 'spider_type')
        x_graphs.append(G)
        x_trees.append(F)
        x_roots.append(roots)
        x_digraphs.append(D)
        x_mains.append(e)

        ns = x_spiders[j]
        if len(ns) == 1:
            cands = [l for layer in nx.topological_generations(D) for l in layer if l != e and G.nodes[l].get("is_mark", False)]
            x_candidates.append([cands])
        else:
            spider_grouped_cands = []
            for k, sz in enumerate(ns):
                cands_k = [
                    node for layer in nx.topological_generations(D) for node in layer
                    if G.nodes[node].get("chunk_idx") == k and G.nodes[node].get("is_mark") and node != e
                ]
                req_edges = sz if k < len(ns) - 1 else sz - 1
                if len(cands_k) < req_edges:
                    cands_k = [
                        node for layer in nx.topological_generations(D) for node in layer
                        if G.nodes[node].get("chunk_idx") == k and node != e
                    ]
                spider_grouped_cands.append(cands_k)
            x_candidates.append(spider_grouped_cands)

    edge_groups = {}
    for i, r in enumerate(H):
        for j, x in enumerate(r[non_pivots]):
            if x == 1:
                pivot_q = pivots[i]
                edge_groups[(i, j)] = next(
                    k for k, piece in enumerate(x_splits[j]) if pivot_q in piece
                )

    matched_edges = match_edges(
        H, non_pivots, z_digraphs, x_digraphs, z_candidates, x_candidates,
        edge_groups=edge_groups
    )

    # Build global graphs
    z_node_mapping: dict[tuple[int, int], int] = {}
    x_node_mapping: dict[tuple[int, int], int] = {}
    global_G = nx.Graph()
    global_F = nx.Graph()
    global_roots = {}
    global_D = nx.DiGraph()
    global_primary_paths = {}
    i, j = 0, 0
    k = 0
    non_pivots_set = set(non_pivots)

    # Phase 1: Adding each individual cat state to the global graphs
    while i + j < N:
        curr_col = i + j
        is_non_pivot = curr_col in non_pivots_set

        if is_non_pivot:
            graph, trees, digraph = x_graphs[i], x_trees[i], x_digraphs[i]
            node_mapping, root, index = x_node_mapping, x_roots[i], i
        else:
            row = pivots_perm[j]
            graph, trees, digraph = z_graphs[row], z_trees[row], z_digraphs[row]
            node_mapping, root, index = z_node_mapping, z_roots[row], row
        for node, data in graph.nodes(data=True):
            node_mapping[(index, node)] = k
            global_G.add_node(k, **data)
            global_F.add_node(k)
            global_D.add_node(k)
            k += 1
        for u, v, data in graph.edges(data=True):
            u_prime = node_mapping[(index, u)]
            v_prime = node_mapping[(index, v)]
            global_G.add_edge(u_prime, v_prime, **data)
        for u, v, data in trees.edges(data=True):
            u_prime = node_mapping[(index, u)]
            v_prime = node_mapping[(index, v)]
            global_F.add_edge(u_prime, v_prime, **data)
        for u, v, data in digraph.edges(data=True):
            u_prime = node_mapping[(index, u)]
            v_prime = node_mapping[(index, v)]
            global_D.add_edge(u_prime, v_prime, **data)

        global_roots[i + j] = node_mapping[(index, root[0])]
        global_primary_paths[i + j] = nx.shortest_path(
            global_F,
            source=global_roots[i + j],
            target=node_mapping[(index, x_mains[i] if i + j in non_pivots else z_mains[pivots_perm[j]])]
        )
        if i + j in non_pivots:
            i += 1
        else:
            j += 1

    # Connect the CAT states.  The joint planner searches nearby logical-edge
    # orders, which simultaneously changes the selected ports, the induced DAG,
    # and the resource-aware absolute traversal order.
    joint_plan = plan_joint_extraction(
        initial_matching=matched_edges,
        z_candidates=z_candidates,
        x_candidates=x_candidates,
        edge_groups=edge_groups,
        base_graph=global_G,
        forest=global_F,
        base_dag=global_D,
        z_node_mapping=z_node_mapping,
        x_node_mapping=x_node_mapping,
        z_digraphs=z_digraphs,
        x_digraphs=x_digraphs,
        target=reuse_target,
    )
    matched_edges = joint_plan.matched_edges

    global_G, global_D = materialize_matching(
        global_G,
        global_F,
        global_D,
        matched_edges,
        z_node_mapping,
        x_node_mapping,
        z_digraphs,
        x_digraphs,
    )

    # Extract circuit using the global graphs
    extractor = CatStateExtractor(StimBuilder(), verbose=False)
    if draw_solutions:
        draw_forest_on_graph(global_G, global_F, figsize=(8, 8))
        plt.show()
        display_digraph(global_D, figsize=(8, 8))
        plt.show()
    circ = extractor.extract(
        global_G, global_F, global_roots, global_D, global_primary_paths,
        node_order=joint_plan.node_order
    )
    return circ


if __name__ == "__main__":
    code = "49_1_5"
    max_col_ops = 100

    print(f"Loading QECC: {code}")
    is_self_dual, H_x, H_z, L_x, L_z, d = load_qecc(code)

    # final_circ = cat_at_origin_with_verification(
    #     H_x=H_x, H_z=H_z, L_x=L_x, L_z=L_z, d=d,
    #     max_col_ops=max_col_ops, verbose=True
    # )
    basis = "X" if code in ("49_1_5", "95_1_7") else "Z"
    if basis == "X":
        H_x, H_z = H_z, H_x
        L_x, L_z = L_z, L_x

    final_circ = row_optimized_cat_at_origin(
        H=H_x, d=d, basis=basis, analyze_hook_errors=True
    )

    print("\n--- Final Fault Tolerant Verification Circuit ---")
    print(f"Total Qubits: {final_circ.num_qubits}")
    print(f"Num CX: {count_operations(final_circ)[0]}")
    print(f"Total instructions: {sum(count_operations(final_circ))}")
