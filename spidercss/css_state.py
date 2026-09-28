"""Fault-tolerant preparation of CSS states described by logical Stim circuits."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import numpy as np
import stim

from spidercss.cat_at_origin import row_optimized_cat_at_origin
from spidercss.resource_targets import ReuseTarget
from spidercss.utils import load_qecc


__all__ = [
    "encoded_css_stabilizers",
    "prepare_css_state",
    "prepare_css_state_transversally",
]


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


def encoded_css_stabilizers(
    logical_state: stim.Circuit,
    code: str,
    *,
    method: str | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Lift a logical CSS stabilizer state into physical X and Z stabilizers.

    Block-local code stabilizers are lifted with ``I_m (x) H``, while each
    logical-state stabilizer is lifted by replacing its X or Z on a block with
    the corresponding logical operator of the code.
    """
    operations, num_logical_qubits = _parse_logical_state(logical_state)
    h_x, h_z, l_x, l_z, _ = _load_single_logical_code(code, method)
    logical_h_x, logical_h_z = _logical_css_stabilizers(
        operations, num_logical_qubits
    )
    return _lift_css_stabilizers(
        logical_h_x,
        logical_h_z,
        h_x,
        h_z,
        l_x,
        l_z,
        num_logical_qubits,
    )


def prepare_css_state(
    logical_state: stim.Circuit,
    code: str,
    *,
    method: str | None = None,
    max_basis_tries: int = 10_000,
    analyze_hook_errors: bool = True,
    is_perfect_code: bool = False,
    reuse_target: ReuseTarget | str = ReuseTarget.QUBITS,
    preparation_basis: str = "Z",
    strategy: Literal["global", "local"] = "global",
) -> stim.Circuit:
    """Prepare an encoded CSS state using a global or local construction.

    Each qubit in ``logical_state`` denotes one encoded block of an ``[[n, 1, d]]``
    CSS code. ``M``/``R`` prepare logical ``|0>`` and ``MX``/``RX`` prepare
    logical ``|+>``. The measurement spellings are declarative aliases: their
    measurement results do not appear in the returned circuit. With the global
    strategy, the logical stabilizers are encoded and synthesized as one larger
    cat-at-origin state. With the local strategy, each code block is prepared
    separately before logical CNOTs are applied transversally. Physical qubit
    ``p`` of logical block ``q`` is ``q * n + p``.

    Args:
        logical_state: A Stim circuit containing only M, MX, R, RX, and CX.
        code: Name of a code bundled in ``spidercss/qeccs``.
        method: Optional code-library name, such as ``"FAO"`` or ``"MQT"``.
        max_basis_tries: Number of row bases considered for each preparation.
        analyze_hook_errors: Whether to use safe stabilizer splits when available.
        is_perfect_code: Enables the existing perfect-code cat-state optimization.
        reuse_target: Optimize for ``"qubits"``, ``"depth"``, or ``"balanced"``.
        preparation_basis: ``"Z"`` synthesizes from the encoded X stabilizers;
            ``"X"`` synthesizes from the encoded Z stabilizers. Used only by
            the global strategy.
        strategy: ``"global"`` for one joint preparation or ``"local"`` for
            separate block preparations followed by transversal logical CNOTs.

    Returns:
        A Stim circuit preparing the requested encoded CSS state.

    Raises:
        ValueError: If the logical circuit is not a state-preparation program or
            the strategy is invalid, or the selected code does not encode exactly
            one logical qubit.
    """
    if strategy == "local":
        return prepare_css_state_transversally(
            logical_state,
            code,
            method=method,
            max_basis_tries=max_basis_tries,
            analyze_hook_errors=analyze_hook_errors,
            is_perfect_code=is_perfect_code,
            reuse_target=reuse_target,
        )
    if strategy != "global":
        raise ValueError("strategy must be either 'global' or 'local'.")

    operations, num_logical_qubits = _parse_logical_state(logical_state)
    h_x, h_z, l_x, l_z, distance = _load_single_logical_code(code, method)
    logical_h_x, logical_h_z = _logical_css_stabilizers(
        operations, num_logical_qubits
    )
    encoded_h_x, encoded_h_z = _lift_css_stabilizers(
        logical_h_x,
        logical_h_z,
        h_x,
        h_z,
        l_x,
        l_z,
        num_logical_qubits,
    )

    if preparation_basis == "Z":
        parity_matrix = encoded_h_x
    elif preparation_basis == "X":
        parity_matrix = encoded_h_z
    else:
        raise ValueError("preparation_basis must be either 'Z' or 'X'.")

    return row_optimized_cat_at_origin(
        parity_matrix,
        distance,
        basis=preparation_basis,
        max_basis_tries=max_basis_tries,
        analyze_hook_errors=analyze_hook_errors,
        is_perfect_code=is_perfect_code,
        reuse_target=reuse_target,
    )


def prepare_css_state_transversally(
    logical_state: stim.Circuit,
    code: str,
    *,
    method: str | None = None,
    max_basis_tries: int = 10_000,
    analyze_hook_errors: bool = True,
    is_perfect_code: bool = False,
    reuse_target: ReuseTarget | str = ReuseTarget.QUBITS,
) -> stim.Circuit:
    """Prepare separate code blocks and apply each logical CX transversally."""
    operations, num_logical_qubits = _parse_logical_state(logical_state)
    h_x, h_z, _, _, distance = _load_single_logical_code(code, method)

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
                    is_perfect_code=is_perfect_code,
                    reuse_target=reuse_target,
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


def _load_single_logical_code(
    code: str, method: str | None
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int]:
    _, h_x, h_z, l_x, l_z, distance = load_qecc(code, method)

    if h_x.ndim != 2 or h_z.ndim != 2 or h_x.shape[1] != h_z.shape[1]:
        raise ValueError("H_x and H_z must be matrices on the same number of qubits.")
    if (
        l_x.ndim != 2
        or l_z.ndim != 2
        or l_x.shape[0] != 1
        or l_z.shape[0] != 1
    ):
        num_logical_qubits = l_x.shape[0] if l_x.ndim == 2 else "unknown"
        raise ValueError(
            f"CSS state preparation requires an [[n, 1, d]] code; {code!r} has "
            f"{num_logical_qubits} logical qubits."
        )
    if l_x.shape[1] != h_x.shape[1] or l_z.shape[1] != h_x.shape[1]:
        raise ValueError("Logical operators and stabilizers must have equal width.")

    return h_x, h_z, l_x, l_z, distance


def _logical_css_stabilizers(
    operations: list[_LogicalOperation], num_logical_qubits: int
) -> tuple[np.ndarray, np.ndarray]:
    deterministic_state = stim.Circuit()
    for operation in operations:
        if operation.name in _PREPARATION_BASES:
            reset = "R" if _PREPARATION_BASES[operation.name] == "Z" else "RX"
            deterministic_state.append(reset, operation.targets)
        else:
            deterministic_state.append("CX", operation.targets)

    simulator = stim.TableauSimulator()
    simulator.do(deterministic_state)

    x_stabilizers = []
    z_stabilizers = []
    for stabilizer in simulator.canonical_stabilizers():
        x_support, z_support = stabilizer.to_numpy()
        has_x = bool(np.any(x_support))
        has_z = bool(np.any(z_support))
        if has_x and has_z:
            raise ValueError(
                "The logical circuit did not produce a CSS stabilizer state."
            )
        if stabilizer.sign != 1:
            raise ValueError(
                "The logical circuit produced a negative stabilizer; only the "
                "+1 CSS state is supported."
            )
        (x_stabilizers if has_x else z_stabilizers).append(
            (x_support if has_x else z_support).astype(np.int8)
        )

    logical_h_x = np.array(x_stabilizers, dtype=np.int8).reshape(
        -1, num_logical_qubits
    )
    logical_h_z = np.array(z_stabilizers, dtype=np.int8).reshape(
        -1, num_logical_qubits
    )
    return logical_h_x, logical_h_z


def _lift_css_stabilizers(
    logical_h_x: np.ndarray,
    logical_h_z: np.ndarray,
    h_x: np.ndarray,
    h_z: np.ndarray,
    l_x: np.ndarray,
    l_z: np.ndarray,
    num_logical_qubits: int,
) -> tuple[np.ndarray, np.ndarray]:
    block_identity = np.eye(num_logical_qubits, dtype=np.int8)
    encoded_h_x = np.vstack(
        [
            np.kron(block_identity, h_x),
            np.kron(logical_h_x, l_x),
        ]
    ).astype(np.int8)
    encoded_h_z = np.vstack(
        [
            np.kron(block_identity, h_z),
            np.kron(logical_h_z, l_z),
        ]
    ).astype(np.int8)

    if np.any(encoded_h_x @ encoded_h_z.T % 2):
        raise ValueError("The lifted X and Z stabilizers do not commute.")
    return encoded_h_x, encoded_h_z


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
