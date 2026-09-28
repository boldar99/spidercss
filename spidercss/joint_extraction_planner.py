"""Joint external-leg matching and resource-aware ZX traversal planning."""

from __future__ import annotations

from dataclasses import dataclass

import networkx as nx

from spidercss.spider_leg_matcher import match_edges_from_order
from spidercss.resource_targets import (
    ReuseTarget,
    normalize_reuse_target,
    resource_target_score,
)
from spidercss.zx_resource_scheduling import plan_zx_resource_order


MatchedEdge = tuple[tuple[int, int], tuple[int, int]]


@dataclass
class JointExtractionPlan:
    matched_edges: list[MatchedEdge]
    node_order: list[int]
    peak_qubits: int
    active_volume: int
    dependency_depth: int
    evaluated_matchings: int
    target: ReuseTarget


def materialize_matching(
    base_graph: nx.Graph,
    forest: nx.Graph,
    base_dag: nx.DiGraph,
    matching: list[MatchedEdge],
    z_node_mapping: dict[tuple[int, int], int],
    x_node_mapping: dict[tuple[int, int], int],
    z_digraphs: list[nx.DiGraph],
    x_digraphs: list[nx.DiGraph],
) -> tuple[nx.Graph, nx.DiGraph]:
    """Applies one local-port matching to copies of the global structures."""
    graph = base_graph.copy()
    dag = base_dag.copy()
    for (z_graph, x_graph), (z_value, x_value) in matching:
        z_node = z_node_mapping[(z_graph, z_value)]
        x_node = x_node_mapping[(x_graph, x_value)]
        graph.add_edge(z_node, x_node, edge_type="cnot")
        graph.nodes[z_node]["is_mark"] = False
        graph.nodes[x_node]["is_mark"] = False

        if forest.degree(z_node) == 1 and dag.in_degree(z_node) > 0:
            graph.nodes[z_node]["is_flag"] = True
        if forest.degree(x_node) == 1 and dag.in_degree(x_node) > 0:
            graph.nodes[x_node]["is_flag"] = True

        for predecessor, _ in z_digraphs[z_graph].in_edges(z_value):
            dag.add_edge(z_node_mapping[(z_graph, predecessor)], x_node, edge_type="cnot")
        for predecessor, _ in x_digraphs[x_graph].in_edges(x_value):
            dag.add_edge(x_node_mapping[(x_graph, predecessor)], z_node, edge_type="cnot")
    if not nx.is_directed_acyclic_graph(dag):
        raise ValueError("Port matching produced a cyclic global dependency graph.")
    return graph, dag


def _valid_adjacent_swap(
    left: tuple[int, int],
    right: tuple[int, int],
    edge_groups: dict[tuple[int, int], int],
) -> bool:
    # Edges incident on the same composite X spider must retain chunk order.
    return left[1] != right[1] or edge_groups[left] == edge_groups[right]


def plan_joint_extraction(
    initial_matching: list[MatchedEdge],
    z_candidates: list[list[int]],
    x_candidates: list[list[int]] | list[list[list[int]]],
    edge_groups: dict[tuple[int, int], int],
    base_graph: nx.Graph,
    forest: nx.Graph,
    base_dag: nx.DiGraph,
    z_node_mapping: dict[tuple[int, int], int],
    x_node_mapping: dict[tuple[int, int], int],
    z_digraphs: list[nx.DiGraph],
    x_digraphs: list[nx.DiGraph],
    max_trials: int = 64,
    target: ReuseTarget | str = ReuseTarget.QUBITS,
) -> JointExtractionPlan:
    """Polynomial local search over matching and absolute ZX node order.

    The logical external-edge order determines the local port matching.  Each
    trial rebuilds the induced dependency DAG and optimizes its weighted-cut
    traversal.  A bounded number of adjacent exchanges keeps runtime
    polynomial and deterministic.
    """

    target = normalize_reuse_target(target)

    def evaluate(edge_order: list[tuple[int, int]]):
        matching = match_edges_from_order(
            edge_order, z_candidates, x_candidates, edge_groups
        )
        graph, dag = materialize_matching(
            base_graph,
            forest,
            base_dag,
            matching,
            z_node_mapping,
            x_node_mapping,
            z_digraphs,
            x_digraphs,
        )
        resource_plan = plan_zx_resource_order(
            graph, forest, dag, heuristic="greedy", target=target
        )
        depth = nx.dag_longest_path_length(dag)
        score = resource_target_score(
            target,
            resource_plan.peak_qubits,
            depth,
            resource_plan.active_volume,
        )
        return score, matching, resource_plan, depth

    edge_order = [edge for edge, _ in initial_matching]
    best_score, best_matching, best_resource_plan, best_depth = evaluate(edge_order)
    evaluated = 1
    if len(edge_order) < 2:
        return JointExtractionPlan(
            best_matching,
            best_resource_plan.order,
            best_resource_plan.peak_qubits,
            best_resource_plan.active_volume,
            best_depth,
            evaluated,
            target,
        )

    swappable = [
        index
        for index in range(len(edge_order) - 1)
        if _valid_adjacent_swap(edge_order[index], edge_order[index + 1], edge_groups)
    ]
    if len(swappable) > max_trials:
        # Evenly sample the neighborhood rather than biasing the search toward
        # the start of large triorthogonal instances.
        selected = {
            swappable[round(i * (len(swappable) - 1) / (max_trials - 1))]
            for i in range(max_trials)
        }
        swappable = sorted(selected)

    for index in swappable:
        candidate_order = edge_order.copy()
        candidate_order[index], candidate_order[index + 1] = (
            candidate_order[index + 1],
            candidate_order[index],
        )
        score, matching, resource_plan, depth = evaluate(candidate_order)
        evaluated += 1
        if score < best_score:
            edge_order = candidate_order
            best_score = score
            best_matching = matching
            best_resource_plan = resource_plan
            best_depth = depth

    return JointExtractionPlan(
        matched_edges=best_matching,
        node_order=best_resource_plan.order,
        peak_qubits=best_resource_plan.peak_qubits,
        active_volume=best_resource_plan.active_volume,
        dependency_depth=best_depth,
        evaluated_matchings=evaluated,
        target=target,
    )
