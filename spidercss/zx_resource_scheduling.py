"""Resource-aware absolute ordering for expanded ZX extraction graphs."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import networkx as nx

from spidercss.resource_targets import ReuseTarget, normalize_reuse_target


@dataclass
class ZXResourceOrderPlan:
    order: list[int]
    peak_qubits: int
    active_volume: int
    solver_status: str
    objective_bound: float | None = None


@dataclass(frozen=True)
class _ZXResources:
    tree_arcs: tuple[tuple[int, int], ...]
    flag_edges: tuple[tuple[int, int], ...]
    output_nodes: tuple[int, ...]


def _build_resources(graph: nx.Graph, forest: nx.Graph, dag: nx.DiGraph) -> _ZXResources:
    tree_arcs = tuple(
        (u, v)
        for u, v, data in dag.edges(data=True)
        if data.get("edge_type") == "tree" and forest.has_edge(u, v)
    )
    represented_tree_edges = {tuple(sorted(edge)) for edge in tree_arcs}
    missing_tree_edges = {
        tuple(sorted(edge)) for edge in forest.edges
    } - represented_tree_edges
    if missing_tree_edges:
        raise ValueError(f"Forest edges are missing traversal orientations: {missing_tree_edges}")

    flag_edges = tuple(
        tuple(sorted((u, v)))
        for u, v, data in graph.edges(data=True)
        if not forest.has_edge(u, v) and data.get("edge_type") != "cnot"
    )
    output_nodes = tuple(
        node for node, data in graph.nodes(data=True) if data.get("is_mark", False)
    )
    return _ZXResources(tree_arcs, flag_edges, output_nodes)


def _cut_metrics(order: list[int], resources: _ZXResources) -> tuple[int, int]:
    position = {node: index for index, node in enumerate(order)}
    horizon = len(order)
    deltas: dict[int, int] = {}
    area = 0

    for u, v in resources.tree_arcs:
        start, end = position[u], position[v]
        deltas[start] = deltas.get(start, 0) + 1
        deltas[end] = deltas.get(end, 0) - 1
        area += end - start
    for u, v in resources.flag_edges:
        start, end = sorted((position[u], position[v]))
        deltas[start] = deltas.get(start, 0) + 1
        deltas[end] = deltas.get(end, 0) - 1
        area += end - start
    for node in resources.output_nodes:
        start = position[node]
        deltas[start] = deltas.get(start, 0) + 1
        deltas[horizon] = deltas.get(horizon, 0) - 1
        area += horizon - start

    active = 0
    peak = 0
    for index in range(horizon):
        active += deltas.get(index, 0)
        peak = max(peak, active)
    return peak, area


def greedy_zx_resource_order(
    graph: nx.Graph,
    forest: nx.Graph,
    dag: nx.DiGraph,
    target: ReuseTarget | str = ReuseTarget.QUBITS,
) -> list[int]:
    """Polynomial weighted-cut list scheduler over ready ZX nodes."""
    target = normalize_reuse_target(target)
    resources = _build_resources(graph, forest, dag)
    indegree = dict(dag.in_degree())
    ready = {node for node, degree in indegree.items() if degree == 0}
    processed: set[int] = set()
    order: list[int] = []
    active = 0
    peak = 0

    height = {node: 0 for node in dag.nodes}
    for node in reversed(list(nx.topological_sort(dag))):
        successors = list(dag.successors(node))
        if successors:
            height[node] = 1 + max(height[successor] for successor in successors)

    tree_in: dict[int, int] = {}
    tree_out: dict[int, int] = {}
    flag_neighbors: dict[int, set[int]] = {}
    for u, v in resources.tree_arcs:
        tree_out[u] = tree_out.get(u, 0) + 1
        tree_in[v] = tree_in.get(v, 0) + 1
    for u, v in resources.flag_edges:
        flag_neighbors.setdefault(u, set()).add(v)
        flag_neighbors.setdefault(v, set()).add(u)
    outputs = set(resources.output_nodes)

    def delta(node: int) -> int:
        change = tree_out.get(node, 0) - tree_in.get(node, 0)
        change += int(node in outputs)
        for neighbor in flag_neighbors.get(node, set()):
            change += -1 if neighbor in processed else 1
        return change

    while ready:
        def score(node: int):
            after = active + delta(node)
            if target is ReuseTarget.DEPTH:
                return (
                    -height[node],
                    max(peak, after),
                    after,
                    delta(node),
                    node,
                )
            return (
                max(peak, after),
                after,
                delta(node),
                -height[node],
                node,
            )

        node = min(ready, key=score)
        ready.remove(node)
        active += delta(node)
        if active < 0:
            raise AssertionError("ZX resource frontier became negative.")
        peak = max(peak, active)
        processed.add(node)
        order.append(node)
        for successor in dag.successors(node):
            indegree[successor] -= 1
            if indegree[successor] == 0:
                ready.add(successor)

    if len(order) != len(dag):
        raise ValueError("Unable to construct a complete ZX topological order.")
    return order


def exact_zx_resource_order_dp(
    graph: nx.Graph, forest: nx.Graph, dag: nx.DiGraph
) -> list[int]:
    """Exact ideal-DP solver for small ZX dependency graphs."""
    resources = _build_resources(graph, forest, dag)
    nodes = list(nx.topological_sort(dag))
    count = len(nodes)
    if count > 22:
        raise ValueError("The exact ZX ideal-DP backend is limited to 22 nodes.")
    index = {node: i for i, node in enumerate(nodes)}
    predecessor_masks = []
    for node in nodes:
        mask = 0
        for predecessor in dag.predecessors(node):
            mask |= 1 << index[predecessor]
        predecessor_masks.append(mask)

    tree_indices = tuple((index[u], index[v]) for u, v in resources.tree_arcs)
    flag_indices = tuple((index[u], index[v]) for u, v in resources.flag_edges)
    output_indices = tuple(index[node] for node in resources.output_nodes)
    full_mask = (1 << count) - 1

    @lru_cache(maxsize=None)
    def cut(mask: int) -> int:
        value = sum(
            bool(mask & (1 << u)) and not bool(mask & (1 << v))
            for u, v in tree_indices
        )
        value += sum(
            bool(mask & (1 << u)) != bool(mask & (1 << v))
            for u, v in flag_indices
        )
        value += sum(bool(mask & (1 << node)) for node in output_indices)
        return value

    choice: dict[int, int] = {}

    @lru_cache(maxsize=None)
    def solve(mask: int) -> tuple[int, int]:
        if mask == full_mask:
            return 0, 0
        best = (count + len(flag_indices) + 1, (count + 1) ** 2)
        best_index = -1
        for node_index in range(count):
            bit = 1 << node_index
            if mask & bit or predecessor_masks[node_index] & ~mask:
                continue
            next_mask = mask | bit
            current_cut = cut(next_mask)
            child_peak, child_area = solve(next_mask)
            candidate = (max(current_cut, child_peak), current_cut + child_area)
            if candidate < best:
                best = candidate
                best_index = node_index
        if best_index < 0:
            raise ValueError("No schedulable ZX node found.")
        choice[mask] = best_index
        return best

    solve(0)
    mask = 0
    order = []
    while mask != full_mask:
        node_index = choice[mask]
        order.append(nodes[node_index])
        mask |= 1 << node_index
    return order


def exact_zx_resource_order(
    graph: nx.Graph,
    forest: nx.Graph,
    dag: nx.DiGraph,
    max_time_seconds: float = 15.0,
    random_seed: int = 0,
) -> tuple[list[int], str, float | None]:
    try:
        from ortools.sat.python import cp_model
    except ImportError as error:
        if len(dag) <= 22:
            return exact_zx_resource_order_dp(graph, forest, dag), "OPTIMAL_DP", None
        return (
            greedy_zx_resource_order(graph, forest, dag),
            "ORTOOLS_UNAVAILABLE_HEURISTIC",
            None,
        )

    resources = _build_resources(graph, forest, dag)
    nodes = list(dag.nodes)
    count = len(nodes)
    if count < 2:
        return nodes, "OPTIMAL", 0.0

    model = cp_model.CpModel()
    position = {node: model.NewIntVar(0, count - 1, f"position_{node}") for node in nodes}
    model.AddAllDifferent(position.values())
    for before, after in dag.edges:
        model.Add(position[before] < position[after])

    intervals = []
    sizes = []

    def add_interval(start, end, name: str):
        size = model.NewIntVar(1, count, f"size_{name}")
        model.Add(size == end - start)
        intervals.append(model.NewIntervalVar(start, size, end, f"interval_{name}"))
        sizes.append(size)

    for edge_index, (u, v) in enumerate(resources.tree_arcs):
        add_interval(position[u], position[v], f"tree_{edge_index}")
    for edge_index, (u, v) in enumerate(resources.flag_edges):
        start = model.NewIntVar(0, count - 1, f"flag_start_{edge_index}")
        end = model.NewIntVar(1, count - 1, f"flag_end_{edge_index}")
        model.AddMinEquality(start, [position[u], position[v]])
        model.AddMaxEquality(end, [position[u], position[v]])
        add_interval(start, end, f"flag_{edge_index}")
    for output_index, node in enumerate(resources.output_nodes):
        end = model.NewConstant(count)
        add_interval(position[node], end, f"output_{output_index}")

    capacity = model.NewIntVar(1, max(1, len(intervals)), "peak_qubits")
    if intervals:
        model.AddCumulative(intervals, [1] * len(intervals), capacity)
    area_limit = max(1, len(intervals) * count)
    model.Minimize(capacity * (area_limit + 1) + sum(sizes))

    hint = greedy_zx_resource_order(graph, forest, dag)
    for order_index, node in enumerate(hint):
        model.AddHint(position[node], order_index)

    solver = cp_model.CpSolver()
    # A wall-clock cutoff makes the selected incumbent machine-load
    # dependent.  Deterministic time, one worker, and a fixed seed preserve
    # repeatability even when the solve stops with FEASIBLE rather than
    # OPTIMAL status.
    solver.parameters.max_deterministic_time = max_time_seconds
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = int(random_seed) % (2**31 - 1)
    solver.parameters.randomize_search = False
    status_code = solver.Solve(model)
    status = solver.StatusName(status_code)
    if status_code not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return hint, status, None
    order = sorted(nodes, key=lambda node: solver.Value(position[node]))
    return order, status, solver.BestObjectiveBound()


def plan_zx_resource_order(
    graph: nx.Graph,
    forest: nx.Graph,
    dag: nx.DiGraph,
    heuristic: str = "greedy",
    max_time_seconds: float = 15.0,
    target: ReuseTarget | str = ReuseTarget.QUBITS,
    random_seed: int = 0,
) -> ZXResourceOrderPlan:
    target = normalize_reuse_target(target)
    if heuristic == "greedy":
        order = greedy_zx_resource_order(graph, forest, dag, target=target)
        status = "HEURISTIC"
        bound = None
    elif heuristic == "exact":
        order, status, bound = exact_zx_resource_order(
            graph,
            forest,
            dag,
            max_time_seconds=max_time_seconds,
            random_seed=random_seed,
        )
    else:
        raise ValueError(f"Unknown ZX resource-ordering heuristic: {heuristic}")
    peak, area = _cut_metrics(order, _build_resources(graph, forest, dag))
    return ZXResourceOrderPlan(order, peak, area, status, bound)
