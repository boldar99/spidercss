"""Shared objectives for joint ZX scheduling and physical-qubit reuse."""

from __future__ import annotations

from enum import Enum


class ReuseTarget(str, Enum):
    """The resource trade-off selected by the joint preparation pipeline."""

    QUBITS = "qubits"
    DEPTH = "depth"
    BALANCED = "balanced"


def normalize_reuse_target(target: ReuseTarget | str) -> ReuseTarget:
    try:
        return target if isinstance(target, ReuseTarget) else ReuseTarget(target)
    except ValueError as error:
        choices = ", ".join(item.value for item in ReuseTarget)
        raise ValueError(f"Unknown reuse target {target!r}; expected one of: {choices}.") from error


def resource_target_score(
    target: ReuseTarget | str,
    qubits: int,
    depth: int,
    active_volume: int = 0,
) -> tuple[int, ...]:
    """Returns the fixed comparison key for a resource/depth trade-off.

    ``balanced`` uses rectangular spacetime volume as a local-search proxy.
    Final physical allocation uses :func:`balanced_frontier_score`, which can
    normalize the complete measured frontier.
    """
    target = normalize_reuse_target(target)
    if target is ReuseTarget.QUBITS:
        return qubits, depth, active_volume
    if target is ReuseTarget.DEPTH:
        return depth, qubits, active_volume
    return qubits * depth, qubits, depth, active_volume


def balanced_frontier_score(
    qubits: int,
    depth: int,
    *,
    minimum_qubits: int,
    maximum_qubits: int,
    minimum_depth: int,
    maximum_depth: int,
) -> tuple[int, int, int]:
    """Scores a measured frontier with 75% width and 25% depth emphasis.

    Both axes are normalized to their observed ranges.  The integer expression
    below is the common-denominator form of
    ``3 * normalized_qubits + normalized_depth``.
    """
    qubit_range = max(1, maximum_qubits - minimum_qubits)
    depth_range = max(1, maximum_depth - minimum_depth)
    score = (
        3 * (qubits - minimum_qubits) * depth_range
        + (depth - minimum_depth) * qubit_range
    )
    return score, qubits, depth
