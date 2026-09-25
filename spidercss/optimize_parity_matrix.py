import galois
from pprint import pprint

import numpy as np
import random
from functools import lru_cache
import warnings
import math

from spidercss.utils import load_qecc


def density_lower_bound(t):
    with warnings.catch_warnings(action="ignore"):
        return np.where(t == 1, np.inf,
                        (np.ceil((t + 3) / 2) * np.floor((t + 3) / 2)) /
                        (np.ceil((t + 3) / 2) * np.floor((t + 3) / 2) +
                         np.ceil((t - 3) / 2) * np.floor((t + 3) / 2) +
                         np.floor((t - 3) / 2) * np.ceil((t + 3) / 2))
                        )


def minimum_E_and_V(n, t):
    density = density_lower_bound(t)
    E_nec = np.ceil(n / density).astype(int)
    remainder = E_nec % 3
    adjustment = (3 - remainder) % 3
    E_final = E_nec + adjustment
    V_final = (2 * E_final) // 3
    return E_final, V_final


@lru_cache
def minimum_number_of_flags(n, t):
    t_alt = np.floor(n / 2) - 1
    t = np.where(t < t_alt, t, t_alt)
    E, N = minimum_E_and_V(n, t)
    return (np.ceil(E - N + 2).astype(int) - 1).tolist()


def minimum_number_of_cnots(n, t):
    return n - 1 + 2 * minimum_number_of_flags(n, t)


def cnot_cost(M: np.ndarray, t: int) -> int:
    row_sums = np.sum(M, axis=1)
    column_sums = np.sum(M, axis=0)
    cost = 0
    for n in column_sums:
        if n > 1:
            cost += 2 * minimum_number_of_flags(n + 1, t)
    for n in row_sums:
        cost += n - 1 + 2 * minimum_number_of_flags(n, t)
    return cost


def ancilla_cost(M: np.ndarray, t: int) -> int:
    row_sums = np.sum(M, axis=1)
    column_sums = np.sum(M, axis=0)
    cost = 0
    for n in column_sums:
        if n > 1:
            cost += minimum_number_of_flags(n + 1, t)
    for n in row_sums:
        cost += minimum_number_of_flags(n, t)
    return cost


# --- OPTIMIZATION FUNCTIONS ---
def has_unique_ones_property(M: np.ndarray) -> bool:
    """Checks if each row has a '1' that is the unique '1' in its column."""
    col_sums = np.sum(M, axis=0)
    cols_with_one = np.where(col_sums == 1)[0]
    if len(cols_with_one) < M.shape[0]: return False
    found_rows = np.unique(np.argmax(M[:, cols_with_one], axis=0))
    return len(found_rows) == M.shape[0]


def row_optimize_matrix(M: np.ndarray, t: int, max_basis_tries: int = 1_000) -> tuple[float, np.ndarray]:
    r, c = M.shape
    
    GF2 = galois.GF(2)
    A = GF2(M).row_reduce()
    k = np.sum(np.any(A, axis=1))

    # --- PHASE 1: Row Operations (Find best basis) ---
    best_row_op_M = None
    best_row_op_cost = float('inf')
    if has_unique_ones_property(M):
        best_row_op_M = M
        best_row_op_cost = cnot_cost(M, t)

    cols_arr = np.arange(c)

    for _ in range(max_basis_tries):
        np.random.shuffle(cols_arr)
        
        A_perm = GF2(M[:, cols_arr]).row_reduce()
        A_k_perm = np.array(A_perm[:k])
        
        inv_cols = np.empty_like(cols_arr)
        inv_cols[cols_arr] = np.arange(c)
        M_new = A_k_perm[:, inv_cols]

        cost = cnot_cost(M_new, t)
        if cost < best_row_op_cost:
            best_row_op_cost = cost
            best_row_op_M = M_new.copy()

    if best_row_op_M is None:
        raise ValueError("Could not find any valid matrix representation.")

    matrix_after_row_ops = best_row_op_M.copy()
    return best_row_op_cost, matrix_after_row_ops


# Example Execution
if __name__ == "__main__":
    is_self_dual, H_z, H_x, L_x, L_z, d = load_qecc("49_1_7")
    t = d // 2

    # We want H_reduce_X to reduce X faults, so it must be X-type stabilizers.
    # We want H_reduce_Z to reduce Z faults, so it must be Z-type stabilizers.
    H_reduce_X = H_x
    H_reduce_Z = H_z

    _, row_M = row_optimize_matrix(H_x, t=t, max_basis_tries=10_000)
    # row_M = pivot_optimize_parity_matrix(H_x, t=t, max_basis_tries=100_000)


    print(f"Original matrix:")
    print(f"Original CNOT cost (t={t}): {cnot_cost(H_x, t)}")
    print("np.array([")
    for row in H_x:
        print("  [", end="")
        for r in row[:-1]:
            print(f"{r}, ", end="")
        print(f"{row[-1]}],")
    print("])")
    print()

    print(f"After Row Operations:")
    print(f"CNOT cost (t={t}): {cnot_cost(row_M, t)}")
    print("np.array([")
    for row in row_M:
        print("  [", end="")
        for r in row[:-1]:
            print(f"{r}, ", end="")
        print(f"{row[-1]}],")
    print("])")

    # print(f"After Row & Column Operations:")
    # print(f"Column Operations Applied (target, source): {col_ops}")
    # print(f"CNOT cost (t={t}): {cnot_cost(final_M, t)}")
    # print("np.array([")
    # for row in final_M:
    #     print("  [", end="")
    #     for r in row[:-1]:
    #         print(f"{r}, ", end="")
    #     print(f"{row[-1]}],")
    # print("])")
