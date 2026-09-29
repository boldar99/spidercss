"""Resource-aware operation scheduling and optimal qubit reuse.

This module treats every logical qubit in an unreused circuit as a lifetime
interval.  It first chooses a topological ordering of the circuit operations,
then colors the resulting interval graph optimally.  The coloring is the
physical-qubit allocation; consecutive intervals on one color are precisely
the measurement-to-reset reuse chain.

The exact backend optimizes peak live qubits and then total live-qubit area.
The greedy backend is polynomial and uses register-pressure-aware list
scheduling.  Both preserve the per-wire and measurement-record dependencies
of the input Stim circuit.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from heapq import heappop, heappush
from typing import Iterable

import networkx as nx
import stim

from spidercss.resource_targets import (
    ReuseTarget,
    balanced_frontier_score,
    normalize_reuse_target,
    resource_target_score,
)
from spidercss.stim_utils import TWO_QUBIT_GATES, explode_circuit, get_cnot_depth


MEASUREMENT_GATES = {"M", "MX", "MY", "MZ", "MR", "MRX", "MRY"}
RESET_GATES = {"R", "RX", "RY", "MR", "MRX", "MRY"}
TRAILING_ANNOTATIONS = {
    "DETECTOR",
    "OBSERVABLE_INCLUDE",
    "SHIFT_COORDS",
    "QUBIT_COORDS",
}


@dataclass(frozen=True)
class LogicalLifetime:
    logical_qubit: int
    birth_node: int
    death_node: int | None


@dataclass
class ResourceSchedulePlan:
    circuit: stim.Circuit
    order: list[int]
    logical_to_physical: dict[int, int]
    lifetimes: list[LogicalLifetime]
    peak_qubits: int
    cnot_depth: int
    active_volume: int
    target: ReuseTarget
    solver_status: str
    allocation_status: str
    tradeoff_frontier: list["ReuseTradeoffPoint"]
    objective_bound: float | None = None


@dataclass(frozen=True)
class ReuseTradeoffPoint:
    num_qubits: int
    cnot_depth: int
    num_reuse_merges: int


@dataclass
class _AllocationCandidate:
    num_qubits: int
    cnot_depth: int
    num_reuse_merges: int


@dataclass
class _EventProblem:
    dag: nx.DiGraph
    annotations: list[dict]
    lifetimes: list[LogicalLifetime]


def _record_id_for_target(measurement_count: int, target: stim.GateTarget) -> int:
    # Stim record target values are negative offsets from the number of
    # measurements that have occurred immediately before this operation.
    return measurement_count + target.value


def build_resource_event_dag(circuit: stim.Circuit, n_data: int) -> _EventProblem:
    """Builds an operation DAG retaining qubit and measurement dependencies."""
    dag = nx.DiGraph()
    annotations: list[dict] = []
    last_on_qubit: dict[int, int] = {}
    measurement_node: dict[int, int] = {}
    measurement_count = 0
    next_node = 0

    for operation in explode_circuit(circuit):
        name = operation.name
        if name == "TICK":
            # TICK is a schedule annotation.  This planner constructs a new
            # schedule, so retaining old ticks would introduce empty events.
            continue

        raw_targets = tuple(operation.targets_copy())
        qubits = tuple(t.value for t in raw_targets if t.is_qubit_target)
        record_ids = tuple(
            _record_id_for_target(measurement_count, t)
            for t in raw_targets
            if t.is_measurement_record_target
        )
        gate_args = tuple(operation.gate_args_copy())

        data = {
            "op_name": name,
            "targets": qubits,
            "raw_targets": raw_targets,
            "record_ids": record_ids,
            "gate_args": gate_args,
            "measurement_ids": (),
        }

        if name in TRAILING_ANNOTATIONS:
            annotations.append(data)
            continue

        measurement_ids: tuple[int, ...] = ()
        if name in MEASUREMENT_GATES:
            measurement_ids = tuple(range(measurement_count, measurement_count + len(qubits)))
            data["measurement_ids"] = measurement_ids

        dag.add_node(next_node, **data)

        dependencies = set()
        for q in qubits:
            if q in last_on_qubit:
                dependencies.add(last_on_qubit[q])
            last_on_qubit[q] = next_node
        for record_id in record_ids:
            if record_id not in measurement_node:
                raise ValueError(
                    f"Operation {name} refers to unavailable measurement record {record_id}."
                )
            dependencies.add(measurement_node[record_id])
        for predecessor in dependencies:
            dag.add_edge(predecessor, next_node)

        for measurement_id in measurement_ids:
            measurement_node[measurement_id] = next_node
        measurement_count += len(measurement_ids)
        next_node += 1

    if not nx.is_directed_acyclic_graph(dag):
        raise ValueError("Circuit dependency graph is cyclic.")

    topological_order = list(nx.topological_sort(dag))
    first_node: dict[int, int] = {}
    last_measurement: dict[int, int] = {}
    reset_count: dict[int, int] = {}
    for node in topological_order:
        node_data = dag.nodes[node]
        for q in node_data["targets"]:
            first_node.setdefault(q, node)
            if node_data["op_name"] in RESET_GATES:
                reset_count[q] = reset_count.get(q, 0) + 1
            if node_data["op_name"] in MEASUREMENT_GATES:
                last_measurement[q] = node

    # Input circuits produced by CatStateExtractor contain one lifecycle per
    # logical qubit.  Multiple resets would require splitting a logical label
    # into multiple intervals, which is deliberately rejected instead of being
    # silently mis-optimized.
    repeated_resets = sorted(q for q, count in reset_count.items() if count > 1)
    if repeated_resets:
        raise ValueError(f"Logical qubits already contain multiple lifecycles: {repeated_resets}")

    lifetimes = []
    for q, birth_node in sorted(first_node.items()):
        death_node = None if q < n_data else last_measurement.get(q)
        lifetimes.append(LogicalLifetime(q, birth_node, death_node))

    return _EventProblem(dag=dag, annotations=annotations, lifetimes=lifetimes)


def _lifetime_positions(
    lifetimes: Iterable[LogicalLifetime], order: list[int]
) -> dict[int, tuple[int, int]]:
    position = {node: index for index, node in enumerate(order)}
    horizon = len(order)
    intervals = {}
    for lifetime in lifetimes:
        start = position[lifetime.birth_node]
        end = horizon if lifetime.death_node is None else position[lifetime.death_node] + 1
        if end <= start:
            raise ValueError(f"Invalid lifetime for logical qubit {lifetime.logical_qubit}.")
        intervals[lifetime.logical_qubit] = (start, end)
    return intervals


def _schedule_metrics(
    lifetimes: Iterable[LogicalLifetime], order: list[int]
) -> tuple[int, int]:
    intervals = _lifetime_positions(lifetimes, order)
    deltas: dict[int, int] = {}
    active_volume = 0
    for start, end in intervals.values():
        deltas[start] = deltas.get(start, 0) + 1
        deltas[end] = deltas.get(end, 0) - 1
        active_volume += end - start

    active = 0
    peak = 0
    for position in range(len(order)):
        active += deltas.get(position, 0)
        peak = max(peak, active)
    return peak, active_volume


def greedy_resource_order(dag: nx.DiGraph, lifetimes: list[LogicalLifetime]) -> list[int]:
    """Polynomial register-pressure-aware topological list scheduling."""
    indegree = dict(dag.in_degree())
    ready = {node for node, degree in indegree.items() if degree == 0}

    height = {node: 0 for node in dag.nodes}
    for node in reversed(list(nx.topological_sort(dag))):
        successors = list(dag.successors(node))
        if successors:
            height[node] = 1 + max(height[successor] for successor in successors)

    births_at: dict[int, set[int]] = {}
    deaths_at: dict[int, set[int]] = {}
    for lifetime in lifetimes:
        births_at.setdefault(lifetime.birth_node, set()).add(lifetime.logical_qubit)
        if lifetime.death_node is not None:
            deaths_at.setdefault(lifetime.death_node, set()).add(lifetime.logical_qubit)

    active: set[int] = set()
    peak = 0
    order: list[int] = []
    while ready:
        def score(node: int):
            during = active | births_at.get(node, set())
            after = during - deaths_at.get(node, set())
            return (
                max(peak, len(during)),
                len(after),
                -len(deaths_at.get(node, set())),
                -height[node],
                node,
            )

        node = min(ready, key=score)
        ready.remove(node)
        active |= births_at.get(node, set())
        peak = max(peak, len(active))
        active -= deaths_at.get(node, set())
        order.append(node)

        for successor in dag.successors(node):
            indegree[successor] -= 1
            if indegree[successor] == 0:
                ready.add(successor)

    if len(order) != len(dag):
        raise ValueError("Unable to produce a complete topological schedule.")
    return order


def exact_resource_order(
    dag: nx.DiGraph,
    lifetimes: list[LogicalLifetime],
    max_time_seconds: float = 15.0,
    random_seed: int = 0,
) -> tuple[list[int], str, float | None]:
    """Minimizes peak live qubits, then live-qubit area, using CP-SAT.

    ``max_time_seconds`` is retained as the public budget parameter, but is
    applied as CP-SAT's deterministic-time limit.  A wall-clock cutoff can
    stop the solver at a different incumbent on otherwise identical runs.
    Single-worker search plus an explicit seed makes a FEASIBLE result as
    reproducible as an OPTIMAL one.
    """
    try:
        from ortools.sat.python import cp_model
    except ImportError as error:
        if len(dag) <= 22:
            order = exact_resource_order_dp(dag, lifetimes)
            return order, "OPTIMAL_DP", None
        return greedy_resource_order(dag, lifetimes), "ORTOOLS_UNAVAILABLE_HEURISTIC", None

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
    for lifetime in lifetimes:
        start = position[lifetime.birth_node]
        end = model.NewIntVar(1, count, f"end_q{lifetime.logical_qubit}")
        if lifetime.death_node is None:
            model.Add(end == count)
        else:
            model.Add(end == position[lifetime.death_node] + 1)
        size = model.NewIntVar(1, count, f"size_q{lifetime.logical_qubit}")
        model.Add(size == end - start)
        intervals.append(
            model.NewIntervalVar(start, size, end, f"lifetime_q{lifetime.logical_qubit}")
        )
        sizes.append(size)

    capacity = model.NewIntVar(1, max(1, len(lifetimes)), "peak_live_qubits")
    if intervals:
        model.AddCumulative(intervals, [1] * len(intervals), capacity)

    # The multiplier makes peak width the strict primary objective.  The
    # maximum possible sum of interval sizes is len(lifetimes) * count.
    area_limit = max(1, len(lifetimes) * count)
    model.Minimize(capacity * (area_limit + 1) + sum(sizes))

    hint = greedy_resource_order(dag, lifetimes)
    for index, node in enumerate(hint):
        model.AddHint(position[node], index)

    solver = cp_model.CpSolver()
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


def exact_resource_order_dp(
    dag: nx.DiGraph, lifetimes: list[LogicalLifetime]
) -> list[int]:
    """Exact exponential ideal-DP oracle for small event DAGs."""
    nodes = list(nx.topological_sort(dag))
    count = len(nodes)
    if count > 22:
        raise ValueError("The ideal-DP backend is limited to 22 events.")
    node_index = {node: index for index, node in enumerate(nodes)}
    predecessor_masks = []
    for node in nodes:
        mask = 0
        for predecessor in dag.predecessors(node):
            mask |= 1 << node_index[predecessor]
        predecessor_masks.append(mask)

    births_at = [0] * count
    deaths_at = [0] * count
    lifetime_indices = []
    for lifetime in lifetimes:
        birth_index = node_index[lifetime.birth_node]
        death_index = None if lifetime.death_node is None else node_index[lifetime.death_node]
        births_at[birth_index] += 1
        if death_index is not None:
            deaths_at[death_index] += 1
        lifetime_indices.append((birth_index, death_index))

    full_mask = (1 << count) - 1

    def active_after(mask: int) -> int:
        active = 0
        for birth_index, death_index in lifetime_indices:
            if not (mask & (1 << birth_index)):
                continue
            if death_index is None or not (mask & (1 << death_index)):
                active += 1
        return active

    choice: dict[int, int] = {}

    @lru_cache(maxsize=None)
    def solve(mask: int) -> tuple[int, int]:
        if mask == full_mask:
            return 0, 0
        active = active_after(mask)
        best = (count + 1, count * max(1, len(lifetimes)) + 1)
        best_index = -1
        for index in range(count):
            bit = 1 << index
            if mask & bit or predecessor_masks[index] & ~mask:
                continue
            during = active + births_at[index]
            child_peak, child_area = solve(mask | bit)
            candidate = (max(during, child_peak), during + child_area)
            if candidate < best:
                best = candidate
                best_index = index
        if best_index < 0:
            raise ValueError("No schedulable event found in an acyclic DAG.")
        choice[mask] = best_index
        return best

    solve(0)
    order = []
    mask = 0
    while mask != full_mask:
        index = choice[mask]
        order.append(nodes[index])
        mask |= 1 << index
    return order


def allocate_interval_qubits(
    lifetimes: list[LogicalLifetime], order: list[int], n_data: int
) -> tuple[dict[int, int], int]:
    """Optimally colors the fixed lifetime intervals using a left-edge scan."""
    intervals = _lifetime_positions(lifetimes, order)
    ordered = sorted(
        ((start, end, q) for q, (start, end) in intervals.items()),
        key=lambda item: (item[0], item[1], item[2]),
    )

    active: list[tuple[int, int]] = []  # (end, color)
    available: list[int] = []
    logical_to_color: dict[int, int] = {}
    next_color = 0
    for start, end, logical_qubit in ordered:
        while active and active[0][0] <= start:
            _, released_color = heappop(active)
            heappush(available, released_color)
        if available:
            color = heappop(available)
        else:
            color = next_color
            next_color += 1
        logical_to_color[logical_qubit] = color
        heappush(active, (end, color))

    # Every output data qubit lives until the common horizon, so each occupies
    # a distinct color.  Rename those colors back to the stable data IDs used
    # by the rest of the state-preparation pipeline.
    color_to_physical: dict[int, int] = {}
    for q in range(n_data):
        if q not in logical_to_color:
            raise ValueError(f"Missing output data qubit {q} from scheduled circuit.")
        color = logical_to_color[q]
        if color in color_to_physical:
            raise ValueError("Two output data qubits were assigned the same physical color.")
        color_to_physical[color] = q

    next_ancilla = n_data
    for color in range(next_color):
        if color not in color_to_physical:
            color_to_physical[color] = next_ancilla
            next_ancilla += 1

    logical_to_physical = {
        logical: color_to_physical[color]
        for logical, color in logical_to_color.items()
    }
    return logical_to_physical, next_color


def _mapping_from_merge_links(
    lifetimes: list[LogicalLifetime],
    n_data: int,
    merge_links: list[tuple[int, int]],
) -> tuple[dict[int, int], int]:
    """Builds a stable physical mapping from selected non-overlapping merges."""
    logical_qubits = [lifetime.logical_qubit for lifetime in lifetimes]
    parent = {qubit: qubit for qubit in logical_qubits}

    def find(qubit: int) -> int:
        while parent[qubit] != qubit:
            parent[qubit] = parent[parent[qubit]]
            qubit = parent[qubit]
        return qubit

    def union(first: int, second: int) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root != second_root:
            parent[second_root] = first_root

    for first, second in merge_links:
        union(first, second)

    components: dict[int, list[int]] = {}
    for qubit in logical_qubits:
        components.setdefault(find(qubit), []).append(qubit)

    component_to_physical: dict[int, int] = {}
    for root, component in components.items():
        data_qubits = [qubit for qubit in component if qubit < n_data]
        if len(data_qubits) > 1:
            raise AssertionError("A reuse component contains two output data qubits.")
        if data_qubits:
            component_to_physical[root] = data_qubits[0]

    next_ancilla = n_data
    for root, component in sorted(components.items(), key=lambda item: min(item[1])):
        if root not in component_to_physical:
            component_to_physical[root] = next_ancilla
            next_ancilla += 1

    mapping = {
        qubit: component_to_physical[find(qubit)]
        for qubit in logical_qubits
    }
    return mapping, len(components)


def _reuse_chain_links(
    lifetimes: list[LogicalLifetime],
    order: list[int],
    minimum_mapping: dict[int, int],
) -> list[tuple[int, int, int]]:
    """Returns ``(gap, previous, next)`` links from the minimum coloring."""
    intervals = _lifetime_positions(lifetimes, order)
    chains: dict[int, list[int]] = {}
    for logical_qubit, physical_qubit in minimum_mapping.items():
        chains.setdefault(physical_qubit, []).append(logical_qubit)

    links = []
    for chain in chains.values():
        chain.sort(key=lambda qubit: intervals[qubit])
        for previous, following in zip(chain, chain[1:]):
            gap = intervals[following][0] - intervals[previous][1]
            if gap < 0:
                raise AssertionError("Minimum-color reuse intervals overlap.")
            links.append((gap, previous, following))
    return links


def _pareto_points(candidates: list[_AllocationCandidate]) -> list[ReuseTradeoffPoint]:
    best_depth_by_width: dict[int, tuple[int, int]] = {}
    for candidate in candidates:
        current = best_depth_by_width.get(candidate.num_qubits)
        value = (candidate.cnot_depth, candidate.num_reuse_merges)
        if current is None or value < current:
            best_depth_by_width[candidate.num_qubits] = value

    points = []
    best_depth = float("inf")
    for width in sorted(best_depth_by_width):
        depth, merges = best_depth_by_width[width]
        if depth < best_depth:
            points.append(ReuseTradeoffPoint(width, depth, merges))
            best_depth = depth
    return points


def _cnot_depth_for_mapping(
    problem: _EventProblem,
    order: list[int],
    logical_to_physical: dict[int, int],
) -> int:
    """Computes mapped ASAP CNOT depth without constructing a Stim circuit.

    This is the same recurrence as :func:`get_cnot_depth`, applied directly to
    the already atomized event DAG.  Frontier construction calls it many times;
    rebuilding a complete ``stim.Circuit`` for every candidate made large
    depth-target compilations spend hours in ``stim.Circuit.append``.
    """
    next_free_layer: dict[int, int] = {}
    max_layer = -1
    for node in order:
        data = problem.dag.nodes[node]
        if data["op_name"] not in TWO_QUBIT_GATES:
            continue

        raw_targets = data["raw_targets"]
        if len(raw_targets) != 2 or not all(
            target.is_qubit_target for target in raw_targets
        ):
            # Classical feedback such as CX rec[-1] q is not a physical
            # two-qubit gate and therefore occupies no CNOT layer.
            continue

        logical_first, logical_second = data["targets"]
        first = logical_to_physical[logical_first]
        second = logical_to_physical[logical_second]
        if first == second:
            raise ValueError(
                "A reuse allocation mapped both operands of a two-qubit gate "
                "to the same physical qubit."
            )
        layer = max(
            next_free_layer.get(first, 0),
            next_free_layer.get(second, 0),
        )
        next_free_layer[first] = layer + 1
        next_free_layer[second] = layer + 1
        max_layer = max(max_layer, layer)
    return max_layer + 1


def _build_reuse_frontier(
    problem: _EventProblem,
    order: list[int],
    lifetimes: list[LogicalLifetime],
    n_data: int,
    minimum_mapping: dict[int, int],
) -> tuple[list[_AllocationCandidate], list[tuple[int, int]]]:
    """Builds a deterministic no-reuse to maximum-reuse candidate path.

    Reuse links are ordered by their measured one-link CNOT-depth cost and then
    by idle gap.  Every prefix is measured directly from its mapped CNOTs,
    without emitting a Stim circuit.  Consequently the
    frontier always contains the no-reuse depth lower bound and the globally
    minimum interval coloring, plus useful intermediate allocations.
    """
    no_reuse_mapping, no_reuse_width = _mapping_from_merge_links(
        lifetimes, n_data, []
    )
    baseline_depth = _cnot_depth_for_mapping(problem, order, no_reuse_mapping)
    candidates = [
        _AllocationCandidate(
            no_reuse_width, baseline_depth, num_reuse_merges=0
        )
    ]

    measured_links = []
    for gap, previous, following in _reuse_chain_links(
        lifetimes, order, minimum_mapping
    ):
        mapping, _ = _mapping_from_merge_links(
            lifetimes, n_data, [(previous, following)]
        )
        depth = _cnot_depth_for_mapping(problem, order, mapping)
        measured_links.append(
            (depth - baseline_depth, gap, previous, following)
        )
    measured_links.sort()

    selected_links: list[tuple[int, int]] = []
    for _, _, previous, following in measured_links:
        selected_links.append((previous, following))
        mapping, width = _mapping_from_merge_links(
            lifetimes, n_data, selected_links
        )
        candidates.append(
            _AllocationCandidate(
                width,
                _cnot_depth_for_mapping(problem, order, mapping),
                num_reuse_merges=len(selected_links),
            )
        )
    ordered_links = [
        (previous, following)
        for _, _, previous, following in measured_links
    ]
    return candidates, ordered_links


def _remap_targets(
    raw_targets: tuple[stim.GateTarget, ...],
    record_ids: tuple[int, ...],
    logical_to_physical: dict[int, int],
    old_to_new_measurement: dict[int, int],
    next_measurement: int,
) -> list[stim.GateTarget | int]:
    remapped: list[stim.GateTarget | int] = []
    record_iterator = iter(record_ids)
    for target in raw_targets:
        if target.is_qubit_target:
            remapped.append(logical_to_physical[target.value])
        elif target.is_measurement_record_target:
            original_id = next(record_iterator)
            if original_id not in old_to_new_measurement:
                raise ValueError(f"Measurement record {original_id} has not been scheduled yet.")
            remapped.append(stim.target_rec(old_to_new_measurement[original_id] - next_measurement))
        else:
            remapped.append(target)
    return remapped


def emit_scheduled_circuit(
    problem: _EventProblem,
    order: list[int],
    logical_to_physical: dict[int, int],
) -> stim.Circuit:
    circuit = stim.Circuit()
    old_to_new_measurement: dict[int, int] = {}
    next_measurement = 0

    for node in order:
        data = problem.dag.nodes[node]
        targets = _remap_targets(
            data["raw_targets"],
            data["record_ids"],
            logical_to_physical,
            old_to_new_measurement,
            next_measurement,
        )
        circuit.append(data["op_name"], targets, data["gate_args"])
        for original_id in data["measurement_ids"]:
            old_to_new_measurement[original_id] = next_measurement
            next_measurement += 1

    # Detector and observable annotations do not participate in quantum
    # scheduling.  Emitting them after all quantum operations is conventional
    # and lets their record references be reconstructed exactly.
    for data in problem.annotations:
        targets = _remap_targets(
            data["raw_targets"],
            data["record_ids"],
            logical_to_physical,
            old_to_new_measurement,
            next_measurement,
        )
        circuit.append(data["op_name"], targets, data["gate_args"])
    return circuit


def plan_resource_aware_reuse(
    circuit: stim.Circuit,
    n_data: int,
    heuristic: str = "exact",
    max_time_seconds: float = 15.0,
    target: ReuseTarget | str = ReuseTarget.QUBITS,
    random_seed: int = 0,
) -> ResourceSchedulePlan:
    """Jointly chooses operation order and reuse for the requested target."""
    target = normalize_reuse_target(target)
    problem = build_resource_event_dag(circuit, n_data)
    if heuristic == "greedy":
        order = greedy_resource_order(problem.dag, problem.lifetimes)
        solver_status = "HEURISTIC"
        objective_bound = None
    elif heuristic == "exact":
        order, solver_status, objective_bound = exact_resource_order(
            problem.dag,
            problem.lifetimes,
            max_time_seconds=max_time_seconds,
            random_seed=random_seed,
        )
    else:
        raise ValueError(f"Unknown resource scheduling heuristic: {heuristic}")

    minimum_peak, active_volume = _schedule_metrics(problem.lifetimes, order)
    minimum_mapping, minimum_qubits = allocate_interval_qubits(
        problem.lifetimes, order, n_data
    )
    if minimum_qubits != minimum_peak:
        raise AssertionError(
            f"Interval coloring used {minimum_qubits} qubits but cut width is {minimum_peak}."
        )

    if target is ReuseTarget.QUBITS:
        selected_mapping = minimum_mapping
        cnot_depth = _cnot_depth_for_mapping(problem, order, selected_mapping)
        selected = _AllocationCandidate(
            minimum_qubits,
            cnot_depth,
            num_reuse_merges=len(problem.lifetimes) - minimum_qubits,
        )
        candidates = [selected]
        allocation_status = "OPTIMAL_INTERVAL_COLORING"
    else:
        candidates, ordered_links = _build_reuse_frontier(
            problem,
            order,
            problem.lifetimes,
            n_data,
            minimum_mapping,
        )
        if target is ReuseTarget.BALANCED:
            minimum_qubits = min(candidate.num_qubits for candidate in candidates)
            maximum_qubits = max(candidate.num_qubits for candidate in candidates)
            minimum_depth = min(candidate.cnot_depth for candidate in candidates)
            maximum_depth = max(candidate.cnot_depth for candidate in candidates)
            selected = min(
                candidates,
                key=lambda candidate: balanced_frontier_score(
                    candidate.num_qubits,
                    candidate.cnot_depth,
                    minimum_qubits=minimum_qubits,
                    maximum_qubits=maximum_qubits,
                    minimum_depth=minimum_depth,
                    maximum_depth=maximum_depth,
                ),
            )
        else:
            selected = min(
                candidates,
                key=lambda candidate: resource_target_score(
                    target,
                    candidate.num_qubits,
                    candidate.cnot_depth,
                    active_volume,
                ),
            )
        selected_mapping, selected_width = _mapping_from_merge_links(
            problem.lifetimes,
            n_data,
            ordered_links[:selected.num_reuse_merges],
        )
        if selected_width != selected.num_qubits:
            raise AssertionError(
                "Selected reuse candidate width changed while rebuilding its mapping."
            )
        cnot_depth = selected.cnot_depth
        allocation_status = "GREEDY_REUSE_FRONTIER"

    # Candidate evaluation above is purely arithmetic.  Construct the Stim
    # circuit only once, after the target has selected its allocation.
    scheduled_circuit = emit_scheduled_circuit(problem, order, selected_mapping)
    if get_cnot_depth(scheduled_circuit) != cnot_depth:
        raise AssertionError(
            "Direct mapped CNOT-depth evaluation disagrees with emitted Stim circuit."
        )

    return ResourceSchedulePlan(
        circuit=scheduled_circuit,
        order=order,
        logical_to_physical=selected_mapping,
        lifetimes=problem.lifetimes,
        peak_qubits=selected.num_qubits,
        cnot_depth=cnot_depth,
        active_volume=active_volume,
        target=target,
        solver_status=solver_status,
        allocation_status=allocation_status,
        tradeoff_frontier=_pareto_points(candidates),
        objective_bound=objective_bound,
    )
