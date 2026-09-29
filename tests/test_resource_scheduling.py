import networkx as nx
import stim
from unittest.mock import patch

from spidercss.resource_scheduling import (
    build_resource_event_dag,
    emit_scheduled_circuit,
    plan_resource_aware_reuse,
)
from spidercss.resource_targets import ReuseTarget
from spidercss.stim_utils import get_cnot_depth


def _reuse_example() -> stim.Circuit:
    # Logical flag qubit 2 dies before output data qubit 1 is needed.  A joint
    # schedule can therefore prepare data qubit 1 on the former flag hardware.
    return stim.Circuit(
        """
        R 0
        R 2
        CX 0 2
        M 2
        R 1
        CX 0 1
        DETECTOR rec[-1]
        """
    )


def test_greedy_scheduler_reuses_flag_as_later_data_qubit():
    plan = plan_resource_aware_reuse(_reuse_example(), n_data=2, heuristic="greedy")

    assert plan.peak_qubits == 2
    assert plan.circuit.num_qubits == 2
    assert plan.logical_to_physical[2] == plan.logical_to_physical[1] == 1
    reset_targets = [
        target
        for name, targets, _ in plan.circuit.flattened_operations()
        if name == "R"
        for target in targets
    ]
    assert reset_targets.count(1) == 2
    assert "DETECTOR rec[-1]" in str(plan.circuit)


def test_small_exact_dp_matches_optimal_width():
    greedy = plan_resource_aware_reuse(_reuse_example(), n_data=2, heuristic="greedy")
    exact = plan_resource_aware_reuse(_reuse_example(), n_data=2, heuristic="exact")

    assert exact.solver_status in {"OPTIMAL", "OPTIMAL_DP"}
    assert exact.peak_qubits == 2
    assert exact.peak_qubits <= greedy.peak_qubits
    assert exact.active_volume <= greedy.active_volume


def test_resource_order_is_topological_and_record_dependencies_are_retained():
    problem = build_resource_event_dag(_reuse_example(), n_data=2)
    plan = plan_resource_aware_reuse(_reuse_example(), n_data=2, heuristic="greedy")
    position = {node: index for index, node in enumerate(plan.order)}

    assert all(position[u] < position[v] for u, v in problem.dag.edges)
    assert nx.is_directed_acyclic_graph(problem.dag)
    # Stim validates that the remapped detector still points at a preceding
    # measurement record.
    stim.Circuit(str(plan.circuit))


def test_cnot_depth_ignores_classical_feedback():
    circuit = stim.Circuit(
        """
        R 0 1
        CX 0 1
        M 0
        CX rec[-1] 1
        """
    )
    assert get_cnot_depth(circuit) == 1


def test_measurement_reordering_preserves_feedback_and_detector_records():
    circuit = stim.Circuit(
        """
        R 0
        R 1
        X 1
        M 1
        CX rec[-1] 0
        R 2
        M 2
        M 0
        DETECTOR rec[-3] rec[-1]
        DETECTOR rec[-2]
        """
    )

    plan = plan_resource_aware_reuse(circuit, n_data=1, heuristic="greedy")
    samples = plan.circuit.compile_detector_sampler().sample(shots=10)

    assert plan.circuit.num_measurements == circuit.num_measurements
    assert plan.circuit.num_detectors == circuit.num_detectors
    assert not samples.any()


def test_reuse_targets_expose_width_depth_tradeoff():
    circuit = stim.Circuit(
        """
        R 0 1
        R 2
        CX 0 2
        M 2
        R 3
        CX 1 3
        M 3
        """
    )

    qubits = plan_resource_aware_reuse(
        circuit, n_data=2, heuristic="greedy", target="qubits"
    )
    depth = plan_resource_aware_reuse(
        circuit, n_data=2, heuristic="greedy", target="depth"
    )
    balanced = plan_resource_aware_reuse(
        circuit, n_data=2, heuristic="greedy", target="balanced"
    )

    assert qubits.target is ReuseTarget.QUBITS
    assert (qubits.peak_qubits, qubits.cnot_depth) == (3, 2)
    assert (depth.peak_qubits, depth.cnot_depth) == (4, 1)
    # The normalized balanced score emphasizes width 3:1, so on this tiny
    # two-point frontier it keeps the minimum-width allocation.
    assert (balanced.peak_qubits, balanced.cnot_depth) == (3, 2)
    assert {(point.num_qubits, point.cnot_depth) for point in depth.tradeoff_frontier} == {
        (3, 2),
        (4, 1),
    }


def test_depth_frontier_emits_only_the_selected_stim_circuit():
    circuit = stim.Circuit(
        """
        R 0 1
        R 2
        CX 0 2
        M 2
        R 3
        CX 1 3
        M 3
        """
    )

    with patch(
        "spidercss.resource_scheduling.emit_scheduled_circuit",
        wraps=emit_scheduled_circuit,
    ) as emit:
        plan = plan_resource_aware_reuse(
            circuit, n_data=2, heuristic="greedy", target="depth"
        )

    assert emit.call_count == 1
    assert plan.cnot_depth == get_cnot_depth(plan.circuit)
