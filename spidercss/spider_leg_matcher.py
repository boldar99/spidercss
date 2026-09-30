"""Deterministic seed matching for the joint extraction planner."""

import networkx as nx
import numpy as np
import random
import math


def get_node_distances_to_sink(
    digraphs: list[nx.DiGraph],
) -> list[dict[int, int]]:
    distances = []
    for digraph in digraphs:
        node_distances = {}
        if digraph:
            for layer_index, layer in enumerate(
                nx.topological_generations(digraph.reverse())
            ):
                for node in layer:
                    node_distances[node] = layer_index
        distances.append(node_distances)
    return distances


def _initial_edge_order(
    edge_list: list[tuple[int, int]],
    edge_groups: dict[tuple[int, int], int],
    z_distances: list[list[int]],
    x_distances: list[list[int]],
) -> list[tuple[int, int]]:
    """Builds the deterministic critical-path seed used by joint search."""
    edges_by_x: dict[int, list[tuple[int, int]]] = {}
    for edge in edge_list:
        edges_by_x.setdefault(edge[1], []).append(edge)
    for edges in edges_by_x.values():
        edges.sort(key=lambda edge: edge_groups[edge])

    x_pointers = {x_index: 0 for x_index in edges_by_x}
    z_pointers = {z_index: 0 for z_index in range(len(z_distances))}
    active_x = list(edges_by_x)
    z_depth: dict[int, int] = {}
    x_depth: dict[int, int] = {}
    order = []

    while active_x:
        def score(x_index: int) -> tuple[int, int, int]:
            edge = edges_by_x[x_index][x_pointers[x_index]]
            z_index = edge[0]
            earliest = max(z_depth.get(z_index, 0), x_depth.get(x_index, 0))
            remaining_z = (
                z_distances[z_index][z_pointers[z_index]]
                if z_pointers[z_index] < len(z_distances[z_index])
                else 0
            )
            remaining_x = (
                x_distances[x_index][x_pointers[x_index]]
                if x_pointers[x_index] < len(x_distances[x_index])
                else 0
            )
            criticality = -(earliest + max(remaining_z, remaining_x))
            starts = int(z_pointers[z_index] == 0) + int(x_pointers[x_index] == 0)
            finishes = int(z_pointers[z_index] == len(z_distances[z_index]) - 1)
            finishes += int(x_pointers[x_index] == len(x_distances[x_index]) - 1)
            return criticality, starts - finishes, earliest

        x_index = min(active_x, key=score)
        edge = edges_by_x[x_index][x_pointers[x_index]]
        z_index = edge[0]
        order.append(edge)

        next_depth = max(z_depth.get(z_index, 0), x_depth.get(x_index, 0)) + 1
        z_depth[z_index] = next_depth
        x_depth[x_index] = next_depth
        z_pointers[z_index] += 1
        x_pointers[x_index] += 1
        if x_pointers[x_index] == len(edges_by_x[x_index]):
            active_x.remove(x_index)

    return order


import random
import math

def sequence_distance_cost(order: list[tuple[int, int]]) -> float:
    if not order:
        return 0.0
    
    last_seen = {}
    distances = []
    
    for idx, (i, j) in enumerate(order):
        if i in last_seen:
            distances.append(idx - last_seen[i])
        last_seen[i] = idx
        
    if not distances:
        return 0.0
    return sum(distances) / len(distances)

def _earliest_start_first_order(
    edge_list: list[tuple[int, int]],
    edge_groups: dict[tuple[int, int], int],
    z_distances: list[list[int]],
    x_distances: list[list[int]],
) -> list[tuple[int, int]]:
    edges_by_x: dict[int, list[tuple[int, int]]] = {}
    for edge in edge_list:
        edges_by_x.setdefault(edge[1], []).append(edge)
    for edges in edges_by_x.values():
        edges.sort(key=lambda edge: edge_groups[edge])
        
    x_pointers = {x_index: 0 for x_index in edges_by_x}
    z_pointers = {z_index: 0 for z_index in range(len(z_distances))}
    active_x = list(edges_by_x.keys())
    
    z_depth: dict[int, int] = {}
    x_depth: dict[int, int] = {}
    order = []
    
    while active_x:
        # Avoid deterministic bias by shuffling
        random.shuffle(active_x)
        
        def score(x_index: int) -> tuple[int, int]:
            edge = edges_by_x[x_index][x_pointers[x_index]]
            z_index = edge[0]
            earliest = max(z_depth.get(z_index, 0), x_depth.get(x_index, 0))
            remaining_z = (
                z_distances[z_index][z_pointers[z_index]]
                if z_pointers[z_index] < len(z_distances[z_index])
                else 0
            )
            remaining_x = (
                x_distances[x_index][x_pointers[x_index]]
                if x_pointers[x_index] < len(x_distances[x_index])
                else 0
            )
            return earliest, -(remaining_z + remaining_x)
            
        x_index = min(active_x, key=score)
        edge = edges_by_x[x_index][x_pointers[x_index]]
        z_index = edge[0]
        order.append(edge)
        
        next_depth = max(z_depth.get(z_index, 0), x_depth.get(x_index, 0)) + 1
        z_depth[z_index] = next_depth
        x_depth[x_index] = next_depth
        z_pointers[z_index] += 1
        x_pointers[x_index] += 1
        if x_pointers[x_index] == len(edges_by_x[x_index]):
            active_x.remove(x_index)
            
    return order

def _active_spider_first_order(
    edge_list: list[tuple[int, int]],
    edge_groups: dict[tuple[int, int], int],
    z_distances: list[list[int]],
    x_distances: list[list[int]],
) -> list[tuple[int, int]]:
    edges_by_x: dict[int, list[tuple[int, int]]] = {}
    rem_z: dict[int, int] = {}
    rem_x: dict[int, int] = {}
    for edge in edge_list:
        edges_by_x.setdefault(edge[1], []).append(edge)
        rem_z[edge[0]] = rem_z.get(edge[0], 0) + 1
        rem_x[edge[1]] = rem_x.get(edge[1], 0) + 1
        
    for edges in edges_by_x.values():
        edges.sort(key=lambda edge: edge_groups[edge])
        
    x_pointers = {x_index: 0 for x_index in edges_by_x}
    z_pointers = {z_index: 0 for z_index in range(len(z_distances))}
    active_x = list(edges_by_x.keys())
    
    active_z_set = set()
    active_x_set = set()
    
    order = []
    
    while active_x:
        random.shuffle(active_x)
        
        def score(x_index: int) -> tuple[int, int]:
            edge = edges_by_x[x_index][x_pointers[x_index]]
            z_index = edge[0]
            new_activations = (0 if z_index in active_z_set else 1) + (0 if x_index in active_x_set else 1)
            remaining_z = (
                z_distances[z_index][z_pointers[z_index]]
                if z_pointers[z_index] < len(z_distances[z_index])
                else 0
            )
            remaining_x = (
                x_distances[x_index][x_pointers[x_index]]
                if x_pointers[x_index] < len(x_distances[x_index])
                else 0
            )
            return new_activations, remaining_z + remaining_x
            
        x_index = min(active_x, key=score)
        edge = edges_by_x[x_index][x_pointers[x_index]]
        z_index = edge[0]
        order.append(edge)
        
        active_z_set.add(z_index)
        active_x_set.add(x_index)
        
        rem_z[z_index] -= 1
        rem_x[x_index] -= 1
        
        if rem_z[z_index] == 0:
            active_z_set.remove(z_index)
        if rem_x[x_index] == 0:
            active_x_set.remove(x_index)
            
        z_pointers[z_index] += 1
        x_pointers[x_index] += 1
        if x_pointers[x_index] == len(edges_by_x[x_index]):
            active_x.remove(x_index)
            
    return order

def _sa_sequence_distance_order(
    edge_list: list[tuple[int, int]],
    edge_groups: dict[tuple[int, int], int],
    z_distances: list[list[int]],
    x_distances: list[list[int]],
    num_iterations: int = 10_000,
) -> list[tuple[int, int]]:
    current_order = _earliest_start_first_order(edge_list, edge_groups, z_distances, x_distances)
    current_cost = sequence_distance_cost(current_order)
    best_order = current_order.copy()
    best_cost = current_cost
    
    T_start = 10.0
    T_end = 0.01
    
    for step in range(num_iterations):
        T = T_start * (T_end / T_start) ** (step / max(1, num_iterations - 1))
        
        if len(current_order) < 2:
            break
            
        idx = random.randrange(len(current_order) - 1)
        e1 = current_order[idx]
        e2 = current_order[idx + 1]
        
        if e1[1] == e2[1]:
            if edge_groups[e1] != edge_groups[e2]:
                continue
                
        current_order[idx], current_order[idx + 1] = current_order[idx + 1], current_order[idx]
        
        new_cost = sequence_distance_cost(current_order)
        delta = new_cost - current_cost
        
        if delta < 0 or random.random() < math.exp(-delta / T):
            current_cost = new_cost
            if current_cost < best_cost:
                best_cost = current_cost
                best_order = current_order.copy()
        else:
            current_order[idx], current_order[idx + 1] = current_order[idx + 1], current_order[idx]
            
    return best_order


def match_edges(
    parity_matrix: np.ndarray,
    non_pivots: list[int],
    z_digraphs: list[nx.DiGraph],
    x_digraphs: list[nx.DiGraph],
    z_candidates: list[list[int]],
    x_candidates: list[list[int]] | list[list[list[int]]],
    edge_groups: dict[tuple[int, int], int],
    routing_heuristic: str = "sa_sequence_distance",
) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    """Constructs the fixed deterministic seed for joint matching/order search."""
    edge_list = [
        (z_index, x_index)
        for z_index, row in enumerate(parity_matrix)
        for x_index, value in enumerate(row[non_pivots])
        if value == 1
    ]

    z_node_distances = get_node_distances_to_sink(z_digraphs)
    x_node_distances = get_node_distances_to_sink(x_digraphs)
    z_cnot_distances = [
        [z_node_distances[index].get(node, 0) for node in candidates]
        for index, candidates in enumerate(z_candidates)
    ]
    x_cnot_distances = []
    for index, candidate_groups in enumerate(x_candidates):
        if candidate_groups and isinstance(candidate_groups[0], list):
            nodes = [node for group in candidate_groups for node in group]
        else:
            nodes = candidate_groups
        x_cnot_distances.append(
            [x_node_distances[index].get(node, 0) for node in nodes]
        )

    if routing_heuristic == "earliest_start_first":
        edge_order = _earliest_start_first_order(
            edge_list, edge_groups, z_cnot_distances, x_cnot_distances
        )
    elif routing_heuristic == "active_spider_first":
        edge_order = _active_spider_first_order(
            edge_list, edge_groups, z_cnot_distances, x_cnot_distances
        )
    elif routing_heuristic == "sa_sequence_distance":
        edge_order = _sa_sequence_distance_order(
            edge_list, edge_groups, z_cnot_distances, x_cnot_distances
        )
    elif routing_heuristic == "critical_path_first":
        edge_order = _initial_edge_order(
            edge_list, edge_groups, z_cnot_distances, x_cnot_distances
        )
    else:
        raise ValueError(f"Unknown routing heuristic: {routing_heuristic}")
    matching = match_edges_from_order(
        edge_order, z_candidates, x_candidates, edge_groups
    )

    last_group_seen: dict[int, int] = {}
    for edge, _ in matching:
        x_index = edge[1]
        group = edge_groups[edge]
        if group < last_group_seen.get(x_index, group):
            raise AssertionError(
                f"Composite spider {x_index} group order is not chronological."
            )
        last_group_seen[x_index] = group
    return matching


def match_edges_from_order(
    edge_order: list[tuple[int, int]],
    z_candidates: list[list[int]],
    x_candidates: list[list[int]] | list[list[list[int]]],
    edge_groups: dict[tuple[int, int], int],
) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    """Assigns the earliest available local ports for an absolute edge order."""
    z_pools = [list(pool) for pool in z_candidates]
    if x_candidates and x_candidates[0] and isinstance(x_candidates[0][0], list):
        x_pools = [
            [list(group) for group in spider_groups]
            for spider_groups in x_candidates
        ]
    else:
        x_pools = [[list(pool)] for pool in x_candidates]

    matching = []
    for edge in edge_order:
        z_index, x_index = edge
        group = edge_groups[edge]
        if not z_pools[z_index] or not x_pools[x_index][group]:
            raise ValueError(
                f"Insufficient candidate ports while matching logical edge {edge}."
            )
        matching.append(
            (edge, (z_pools[z_index].pop(0), x_pools[x_index][group].pop(0)))
        )
    return matching
