"""Fault-tolerant preparation of CSS states described by logical Stim circuits."""

from __future__ import annotations

from dataclasses import dataclass

import stim

from spidercss.cat_at_origin import row_optimized_cat_at_origin
from spidercss.utils import load_qecc


__all__ = ["prepare_css_state"]


_PREPARATION_BASES = {
    "M": "Z",
    "R": "Z",
    "MX": "X",
    "RX": "X",
}


@dataclass(frozen=True)
class _LogicalOperation:
    name: str
    targets: tuple[int, ...]


def prepare_css_state(
    logical_state: stim.Circuit,
    code: str,
    *,
    method: str | None = None,
    max_basis_tries: int = 10_000,
    analyze_hook_errors: bool = True,
    routing_heuristic: str = "critical_path_first",
    is_perfect_code: bool = False,
) -> stim.Circuit:
    """Compile a logical CSS-state description into a fault-tolerant circuit.

    Each qubit in ``logical_state`` denotes one encoded block of an ``[[n, 1, d]]``
    CSS code. ``M``/``R`` prepare logical ``|0>`` and ``MX``/``RX`` prepare
    logical ``|+>``. The measurement spellings are declarative aliases: their
    measurement results do not appear in the returned circuit. ``CX`` is compiled
    into a transversal CNOT between two prepared blocks.

    The returned circuit numbers all data qubits first. Physical qubit ``p`` of
    logical block ``q`` is ``q * n + p``; preparation ancillas follow the data.

    Args:
        logical_state: A Stim circuit containing only M, MX, R, RX, and CX.
        code: Name of a code bundled in ``spidercss/qeccs``.
        method: Optional code-library name, such as ``"FAO"`` or ``"MQT"``.
        max_basis_tries: Number of row bases considered for each preparation.
        analyze_hook_errors: Whether to use safe stabilizer splits when available.
        routing_heuristic: Edge-routing heuristic passed to ``cat_at_origin``.
        is_perfect_code: Enables the existing perfect-code cat-state optimization.

    Returns:
        A Stim circuit preparing the requested encoded CSS state.

    Raises:
        ValueError: If the logical circuit is not a state-preparation program or
            the selected code does not encode exactly one logical qubit.
    """
    operations, num_logical_qubits = _parse_logical_state(logical_state)
    _, h_x, h_z, l_x, _, distance = load_qecc(code, method)

    if h_x.shape[1] != h_z.shape[1]:
        raise ValueError("H_x and H_z must act on the same number of qubits.")
    if l_x.ndim != 2 or l_x.shape[0] != 1:
        raise ValueError(
            f"prepare_css_state requires an [[n, 1, d]] code; {code!r} has "
            f"{l_x.shape[0] if l_x.ndim == 2 else 'an unknown number of'} logical qubits."
        )

    num_physical_qubits = h_x.shape[1]
    next_ancilla = num_logical_qubits * num_physical_qubits
    result = stim.Circuit()
    templates: dict[str, stim.Circuit] = {}

    for operation in operations:
        if operation.name in _PREPARATION_BASES:
            basis = _PREPARATION_BASES[operation.name]
            if basis not in templates:
                parity_matrix = h_x if basis == "Z" else h_z
                templates[basis] = row_optimized_cat_at_origin(
                    parity_matrix,
                    distance,
                    basis=basis,
                    max_basis_tries=max_basis_tries,
                    analyze_hook_errors=analyze_hook_errors,
                    routing_heuristic=routing_heuristic,
                    is_perfect_code=is_perfect_code,
                )

            template = templates[basis]
            if template.num_qubits < num_physical_qubits:
                raise RuntimeError(
                    "The block-preparation circuit has fewer qubits than the selected code."
                )

            for logical_qubit in operation.targets:
                mapping = {
                    local_qubit: (
                        logical_qubit * num_physical_qubits + local_qubit
                        if local_qubit < num_physical_qubits
                        else next_ancilla + local_qubit - num_physical_qubits
                    )
                    for local_qubit in range(template.num_qubits)
                }
                result += _remap_qubits(template, mapping)
                next_ancilla += template.num_qubits - num_physical_qubits
        else:
            physical_targets = []
            for control, target in zip(operation.targets[::2], operation.targets[1::2]):
                for physical_qubit in range(num_physical_qubits):
                    physical_targets.extend(
                        [
                            control * num_physical_qubits + physical_qubit,
                            target * num_physical_qubits + physical_qubit,
                        ]
                    )
            result.append("CX", physical_targets)

    return result


def _parse_logical_state(
    logical_state: stim.Circuit,
) -> tuple[list[_LogicalOperation], int]:
    if not isinstance(logical_state, stim.Circuit):
        raise TypeError("logical_state must be a stim.Circuit.")
    if logical_state.num_qubits == 0:
        raise ValueError("logical_state must prepare at least one logical qubit.")

    operations = []
    prepared_qubits = set()

    for instruction in logical_state:
        if not isinstance(instruction, stim.CircuitInstruction):
            raise ValueError(
                "REPEAT blocks are not allowed in a logical state description."
            )
        if instruction.name not in {*_PREPARATION_BASES, "CX"}:
            raise ValueError(
                f"Unsupported logical operation {instruction.name!r}; "
                "only M, MX, R, RX, and CX are allowed."
            )
        if instruction.gate_args_copy():
            raise ValueError(
                f"Logical operation {instruction.name!r} cannot have gate arguments."
            )

        targets = instruction.targets_copy()
        if any(
            not target.is_qubit_target or target.is_inverted_result_target
            for target in targets
        ):
            raise ValueError(
                f"Logical operation {instruction.name!r} must have plain qubit targets."
            )
        target_values = tuple(target.value for target in targets)

        if instruction.name in _PREPARATION_BASES:
            for qubit in target_values:
                if qubit in prepared_qubits:
                    raise ValueError(f"Logical qubit {qubit} is prepared more than once.")
                prepared_qubits.add(qubit)
        else:
            for control, target in zip(target_values[::2], target_values[1::2]):
                if control == target:
                    raise ValueError("A logical CX must use two distinct qubits.")
                unprepared = {control, target} - prepared_qubits
                if unprepared:
                    names = ", ".join(map(str, sorted(unprepared)))
                    raise ValueError(f"Logical CX uses unprepared qubit(s): {names}.")

        operations.append(_LogicalOperation(instruction.name, target_values))

    missing = set(range(logical_state.num_qubits)) - prepared_qubits
    if missing:
        names = ", ".join(map(str, sorted(missing)))
        raise ValueError(
            "Logical qubit indices must be dense and every qubit must be prepared; "
            f"missing: {names}."
        )

    return operations, logical_state.num_qubits


def _remap_qubits(circuit: stim.Circuit, mapping: dict[int, int]) -> stim.Circuit:
    remapped = stim.Circuit()
    for instruction in circuit:
        if isinstance(instruction, stim.CircuitRepeatBlock):
            body = _remap_qubits(instruction.body_copy(), mapping)
            remapped.append(stim.CircuitRepeatBlock(instruction.repeat_count, body))
            continue

        targets = [
            mapping[target.value] if target.is_qubit_target else target
            for target in instruction.targets_copy()
        ]
        remapped.append(instruction.name, targets, instruction.gate_args_copy())
    return remapped
