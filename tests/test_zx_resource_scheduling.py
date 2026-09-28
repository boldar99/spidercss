import inspect

import networkx as nx

from spidercss.cat_at_origin import cat_at_origin, row_optimized_cat_at_origin
from spidercss.zx_resource_scheduling import plan_zx_resource_order


def _flagged_branch_problem():
    graph = nx.Graph()
    graph.add_nodes_from(
        [
            (0, {"is_mark": False}),
            (1, {"is_mark": True}),
            (2, {"is_mark": True}),
        ]
    )
    graph.add_edges_from([(0, 1), (0, 2), (1, 2)])
    forest = nx.Graph()
    forest.add_nodes_from(graph.nodes(data=True))
    forest.add_edges_from([(0, 1), (0, 2)])
    dag = nx.DiGraph()
    dag.add_nodes_from(graph.nodes(data=True))
    dag.add_edge(0, 1, edge_type="tree")
    dag.add_edge(0, 2, edge_type="tree")
    dag.add_edge(1, 2, edge_type="missing_link")
    return graph, forest, dag


def test_zx_resource_cut_counts_tree_outputs_and_live_flag():
    graph, forest, dag = _flagged_branch_problem()
    plan = plan_zx_resource_order(graph, forest, dag, heuristic="greedy")

    assert plan.order == [0, 1, 2]
    assert plan.peak_qubits == 3
    assert plan.active_volume == 7


def test_small_exact_zx_order_matches_greedy_optimum():
    graph, forest, dag = _flagged_branch_problem()
    greedy = plan_zx_resource_order(graph, forest, dag, heuristic="greedy")
    exact = plan_zx_resource_order(graph, forest, dag, heuristic="exact")

    assert exact.solver_status in {"OPTIMAL", "OPTIMAL_DP"}
    assert exact.peak_qubits == greedy.peak_qubits == 3
    assert exact.active_volume == greedy.active_volume


def test_cat_at_origin_uses_fixed_joint_routing_api():
    assert "routing_heuristic" not in inspect.signature(cat_at_origin).parameters
    assert "routing_heuristic" not in inspect.signature(
        row_optimized_cat_at_origin
    ).parameters
