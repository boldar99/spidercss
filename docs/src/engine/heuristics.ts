import type {
  DirectedGraph,
  LogicalEdge,
  ReuseTargetType,
  RoutingHeuristicType,
  UndirectedGraph,
} from './types';
import {
  getDirectedEdges,
  getInDegree,
  getSuccessors,
   getUndirectedEdges,
  hasUndirectedEdge,
  reverseDirectedGraph,
  topologicalGenerations,
  topologicalSort,
} from './catState';
import { SeededRng } from './gf2';

export function edgeKey(edge: LogicalEdge): string {
  return `${edge[0]}:${edge[1]}`;
}

/**
 * Matches `get_node_distances_to_sink` in `spidercss/spider_leg_matcher.py`.
 */
export function getNodeDistancesToSink(
  digraphs: DirectedGraph[]
): Array<Map<number, number>> {
  return digraphs.map((digraph) => {
    const nodeDistances = new Map<number, number>();
    if (digraph.nodes.size > 0) {
      const rev = reverseDirectedGraph(digraph);
      const gens = topologicalGenerations(rev);
      gens.forEach((layer, layerIndex) => {
        for (const node of layer) {
          nodeDistances.set(node, layerIndex);
        }
      });
    }
    return nodeDistances;
  });
}

function compareTuples(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/**
 * Critical-path seed matching `_initial_edge_order` in `spidercss/spider_leg_matcher.py`.
 */
export function criticalPathFirstOrder(
  edgeList: LogicalEdge[],
  edgeGroups: Map<string, number>,
  zDistances: number[][],
  xDistances: number[][]
): LogicalEdge[] {
  const edgesByX = new Map<number, LogicalEdge[]>();
  for (const edge of edgeList) {
    const xIdx = edge[1];
    if (!edgesByX.has(xIdx)) edgesByX.set(xIdx, []);
    edgesByX.get(xIdx)!.push(edge);
  }
  for (const edges of edgesByX.values()) {
    edges.sort(
      (a, b) => (edgeGroups.get(edgeKey(a)) ?? 0) - (edgeGroups.get(edgeKey(b)) ?? 0)
    );
  }

  const xPointers = new Map<number, number>();
  for (const xIdx of edgesByX.keys()) xPointers.set(xIdx, 0);
  const zPointers = new Map<number, number>();
  for (let zIdx = 0; zIdx < zDistances.length; zIdx++) zPointers.set(zIdx, 0);

  const activeX = Array.from(edgesByX.keys());
  const zDepth = new Map<number, number>();
  const xDepth = new Map<number, number>();
  const order: LogicalEdge[] = [];

  while (activeX.length > 0) {
    const score = (xIndex: number): number[] => {
      const ptrX = xPointers.get(xIndex)!;
      const edge = edgesByX.get(xIndex)![ptrX];
      const zIndex = edge[0];
      const ptrZ = zPointers.get(zIndex)!;

      const earliest = Math.max(zDepth.get(zIndex) ?? 0, xDepth.get(xIndex) ?? 0);
      const remainingZ =
        ptrZ < zDistances[zIndex].length ? zDistances[zIndex][ptrZ] : 0;
      const remainingX =
        ptrX < xDistances[xIndex].length ? xDistances[xIndex][ptrX] : 0;
      const criticality = -(earliest + Math.max(remainingZ, remainingX));
      const starts = (ptrZ === 0 ? 1 : 0) + (ptrX === 0 ? 1 : 0);
      const finishes =
        (ptrZ === zDistances[zIndex].length - 1 ? 1 : 0) +
        (ptrX === xDistances[xIndex].length - 1 ? 1 : 0);

      return [criticality, starts - finishes, earliest];
    };

    let bestX = activeX[0];
    let bestScore = score(bestX);
    for (let i = 1; i < activeX.length; i++) {
      const candX = activeX[i];
      const candScore = score(candX);
      if (compareTuples(candScore, bestScore) < 0) {
        bestX = candX;
        bestScore = candScore;
      }
    }

    const ptrX = xPointers.get(bestX)!;
    const edge = edgesByX.get(bestX)![ptrX];
    const zIndex = edge[0];
    order.push(edge);

    const nextDepth =
      Math.max(zDepth.get(zIndex) ?? 0, xDepth.get(bestX) ?? 0) + 1;
    zDepth.set(zIndex, nextDepth);
    xDepth.set(bestX, nextDepth);
    zPointers.set(zIndex, (zPointers.get(zIndex) ?? 0) + 1);
    xPointers.set(bestX, ptrX + 1);

    if (ptrX + 1 === edgesByX.get(bestX)!.length) {
      const idx = activeX.indexOf(bestX);
      if (idx >= 0) activeX.splice(idx, 1);
    }
  }

  return order;
}

/**
 * Matches `_earliest_start_first_order` in `spidercss/spider_leg_matcher.py`.
 */
export function earliestStartFirstOrder(
  edgeList: LogicalEdge[],
  edgeGroups: Map<string, number>,
  zDistances: number[][],
  xDistances: number[][],
  seed = 42
): LogicalEdge[] {
  const rng = new SeededRng(seed);
  const edgesByX = new Map<number, LogicalEdge[]>();
  for (const edge of edgeList) {
    const xIdx = edge[1];
    if (!edgesByX.has(xIdx)) edgesByX.set(xIdx, []);
    edgesByX.get(xIdx)!.push(edge);
  }
  for (const edges of edgesByX.values()) {
    edges.sort(
      (a, b) => (edgeGroups.get(edgeKey(a)) ?? 0) - (edgeGroups.get(edgeKey(b)) ?? 0)
    );
  }

  const xPointers = new Map<number, number>();
  for (const xIdx of edgesByX.keys()) xPointers.set(xIdx, 0);
  const zPointers = new Map<number, number>();
  for (let zIdx = 0; zIdx < zDistances.length; zIdx++) zPointers.set(zIdx, 0);

  const activeX = Array.from(edgesByX.keys());
  const zDepth = new Map<number, number>();
  const xDepth = new Map<number, number>();
  const order: LogicalEdge[] = [];

  while (activeX.length > 0) {
    rng.shuffle(activeX);

    const score = (xIndex: number): number[] => {
      const ptrX = xPointers.get(xIndex)!;
      const edge = edgesByX.get(xIndex)![ptrX];
      const zIndex = edge[0];
      const ptrZ = zPointers.get(zIndex)!;

      const earliest = Math.max(zDepth.get(zIndex) ?? 0, xDepth.get(xIndex) ?? 0);
      const remainingZ =
        ptrZ < zDistances[zIndex].length ? zDistances[zIndex][ptrZ] : 0;
      const remainingX =
        ptrX < xDistances[xIndex].length ? xDistances[xIndex][ptrX] : 0;
      return [earliest, -(remainingZ + remainingX)];
    };

    let bestX = activeX[0];
    let bestScore = score(bestX);
    for (let i = 1; i < activeX.length; i++) {
      const candX = activeX[i];
      const candScore = score(candX);
      if (compareTuples(candScore, bestScore) < 0) {
        bestX = candX;
        bestScore = candScore;
      }
    }

    const ptrX = xPointers.get(bestX)!;
    const edge = edgesByX.get(bestX)![ptrX];
    const zIndex = edge[0];
    order.push(edge);

    const nextDepth =
      Math.max(zDepth.get(zIndex) ?? 0, xDepth.get(bestX) ?? 0) + 1;
    zDepth.set(zIndex, nextDepth);
    xDepth.set(bestX, nextDepth);
    zPointers.set(zIndex, (zPointers.get(zIndex) ?? 0) + 1);
    xPointers.set(bestX, ptrX + 1);

    if (ptrX + 1 === edgesByX.get(bestX)!.length) {
      const idx = activeX.indexOf(bestX);
      if (idx >= 0) activeX.splice(idx, 1);
    }
  }

  return order;
}

/**
 * Matches `_active_spider_first_order` in `spidercss/spider_leg_matcher.py`.
 */
export function activeSpiderFirstOrder(
  edgeList: LogicalEdge[],
  edgeGroups: Map<string, number>,
  zDistances: number[][],
  xDistances: number[][],
  seed = 42
): LogicalEdge[] {
  const rng = new SeededRng(seed);
  const edgesByX = new Map<number, LogicalEdge[]>();
  const remZ = new Map<number, number>();
  const remX = new Map<number, number>();

  for (const edge of edgeList) {
    const [zIdx, xIdx] = edge;
    if (!edgesByX.has(xIdx)) edgesByX.set(xIdx, []);
    edgesByX.get(xIdx)!.push(edge);
    remZ.set(zIdx, (remZ.get(zIdx) ?? 0) + 1);
    remX.set(xIdx, (remX.get(xIdx) ?? 0) + 1);
  }

  for (const edges of edgesByX.values()) {
    edges.sort(
      (a, b) => (edgeGroups.get(edgeKey(a)) ?? 0) - (edgeGroups.get(edgeKey(b)) ?? 0)
    );
  }

  const xPointers = new Map<number, number>();
  for (const xIdx of edgesByX.keys()) xPointers.set(xIdx, 0);
  const zPointers = new Map<number, number>();
  for (let zIdx = 0; zIdx < zDistances.length; zIdx++) zPointers.set(zIdx, 0);

  const activeX = Array.from(edgesByX.keys());
  const activeZSet = new Set<number>();
  const activeXSet = new Set<number>();
  const order: LogicalEdge[] = [];

  while (activeX.length > 0) {
    rng.shuffle(activeX);

    const score = (xIndex: number): number[] => {
      const ptrX = xPointers.get(xIndex)!;
      const edge = edgesByX.get(xIndex)![ptrX];
      const zIndex = edge[0];
      const ptrZ = zPointers.get(zIndex)!;

      const newActivations =
        (activeZSet.has(zIndex) ? 0 : 1) + (activeXSet.has(xIndex) ? 0 : 1);
      const remainingZ =
        ptrZ < zDistances[zIndex].length ? zDistances[zIndex][ptrZ] : 0;
      const remainingX =
        ptrX < xDistances[xIndex].length ? xDistances[xIndex][ptrX] : 0;
      return [newActivations, remainingZ + remainingX];
    };

    let bestX = activeX[0];
    let bestScore = score(bestX);
    for (let i = 1; i < activeX.length; i++) {
      const candX = activeX[i];
      const candScore = score(candX);
      if (compareTuples(candScore, bestScore) < 0) {
        bestX = candX;
        bestScore = candScore;
      }
    }

    const ptrX = xPointers.get(bestX)!;
    const edge = edgesByX.get(bestX)![ptrX];
    const zIndex = edge[0];
    order.push(edge);

    activeZSet.add(zIndex);
    activeXSet.add(bestX);

    remZ.set(zIndex, remZ.get(zIndex)! - 1);
    remX.set(bestX, remX.get(bestX)! - 1);

    if (remZ.get(zIndex) === 0) activeZSet.delete(zIndex);
    if (remX.get(bestX) === 0) activeXSet.delete(bestX);

    zPointers.set(zIndex, (zPointers.get(zIndex) ?? 0) + 1);
    xPointers.set(bestX, ptrX + 1);
    if (ptrX + 1 === edgesByX.get(bestX)!.length) {
      const idx = activeX.indexOf(bestX);
      if (idx >= 0) activeX.splice(idx, 1);
    }
  }

  return order;
}

export function sequenceDistanceCost(order: LogicalEdge[]): number {
  if (order.length === 0) return 0;
  const lastSeen = new Map<number, number>();
  const distances: number[] = [];

  for (let idx = 0; idx < order.length; idx++) {
    const i = order[idx][0];
    if (lastSeen.has(i)) {
      distances.push(idx - lastSeen.get(i)!);
    }
    lastSeen.set(i, idx);
  }
  if (distances.length === 0) return 0;
  return distances.reduce((a, b) => a + b, 0) / distances.length;
}

/**
 * Matches `_sa_sequence_distance_order` in `spidercss/spider_leg_matcher.py`.
 */
export function saSequenceDistanceOrder(
  edgeList: LogicalEdge[],
  edgeGroups: Map<string, number>,
  zDistances: number[][],
  xDistances: number[][],
  numIterations = 10000,
  seed = 42
): LogicalEdge[] {
  const rng = new SeededRng(seed);
  const currentOrder = earliestStartFirstOrder(
    edgeList,
    edgeGroups,
    zDistances,
    xDistances,
    seed
  );
  let currentCost = sequenceDistanceCost(currentOrder);
  let bestOrder = currentOrder.map((e) => [...e] as LogicalEdge);
  let bestCost = currentCost;

  const tStart = 10.0;
  const tEnd = 0.01;

  for (let step = 0; step < numIterations; step++) {
    if (currentOrder.length < 2) break;
    const T =
      tStart * Math.pow(tEnd / tStart, step / Math.max(1, numIterations - 1));
    const idx = rng.nextInt(currentOrder.length - 1);
    const e1 = currentOrder[idx];
    const e2 = currentOrder[idx + 1];

    if (e1[1] === e2[1]) {
      if ((edgeGroups.get(edgeKey(e1)) ?? 0) !== (edgeGroups.get(edgeKey(e2)) ?? 0)) {
        continue;
      }
    }

    currentOrder[idx] = e2;
    currentOrder[idx + 1] = e1;

    const newCost = sequenceDistanceCost(currentOrder);
    const delta = newCost - currentCost;

    if (delta < 0 || rng.nextFloat() < Math.exp(-delta / T)) {
      currentCost = newCost;
      if (currentCost < bestCost) {
        bestCost = currentCost;
        bestOrder = currentOrder.map((e) => [...e] as LogicalEdge);
      }
    } else {
      currentOrder[idx] = e1;
      currentOrder[idx + 1] = e2;
    }
  }

  return bestOrder;
}

/**
 * Random valid edge order respecting chunk chronology on composite X-spiders.
 */
export function randomEdgeOrder(
  edgeList: LogicalEdge[],
  edgeGroups: Map<string, number>,
  seed = 42
): LogicalEdge[] {
  const rng = new SeededRng(seed);
  const edgesByX = new Map<number, LogicalEdge[]>();
  for (const edge of edgeList) {
    const xIdx = edge[1];
    if (!edgesByX.has(xIdx)) edgesByX.set(xIdx, []);
    edgesByX.get(xIdx)!.push(edge);
  }
  for (const edges of edgesByX.values()) {
    rng.shuffle(edges);
    edges.sort(
      (a, b) => (edgeGroups.get(edgeKey(a)) ?? 0) - (edgeGroups.get(edgeKey(b)) ?? 0)
    );
  }

  const xPointers = new Map<number, number>();
  for (const xIdx of edgesByX.keys()) xPointers.set(xIdx, 0);
  const activeX = Array.from(edgesByX.keys());
  const order: LogicalEdge[] = [];

  while (activeX.length > 0) {
    const pickIdx = rng.nextInt(activeX.length);
    const xIndex = activeX[pickIdx];
    const ptr = xPointers.get(xIndex)!;
    order.push(edgesByX.get(xIndex)![ptr]);
    if (ptr + 1 === edgesByX.get(xIndex)!.length) {
      activeX.splice(pickIdx, 1);
    } else {
      xPointers.set(xIndex, ptr + 1);
    }
  }
  return order;
}

/**
 * Matches `greedy_zx_resource_order` and `plan_zx_resource_order` in
 * `spidercss/zx_resource_scheduling.py`.
 */
export interface ZxResourceOrderPlan {
  order: number[];
  peakQubits: number;
  activeVolume: number;
}

function buildZxResources(
  graph: UndirectedGraph,
  forest: UndirectedGraph,
  dag: DirectedGraph
) {
  const treeArcs: Array<[number, number]> = [];
  for (const e of getDirectedEdges(dag)) {
    if (e.edge_type === 'tree' && hasUndirectedEdge(forest, e.source, e.target)) {
      treeArcs.push([e.source, e.target]);
    }
  }

  const flagEdges: Array<[number, number]> = [];
  for (const e of getUndirectedEdges(graph)) {
    if (!hasUndirectedEdge(forest, e.source, e.target) && e.edge_type !== 'cnot') {
      flagEdges.push([Math.min(e.source, e.target), Math.max(e.source, e.target)]);
    }
  }

  const outputNodes: number[] = [];
  for (const [node, data] of graph.nodes.entries()) {
    if (data.is_mark) outputNodes.push(node);
  }

  return { treeArcs, flagEdges, outputNodes };
}

function computeZxCutMetrics(
  order: number[],
  resources: ReturnType<typeof buildZxResources>
): { peak: number; area: number } {
  const position = new Map<number, number>();
  order.forEach((n, idx) => position.set(n, idx));
  const horizon = order.length;
  const deltas = new Map<number, number>();
  let area = 0;

  for (const [u, v] of resources.treeArcs) {
    const start = position.get(u)!;
    const end = position.get(v)!;
    deltas.set(start, (deltas.get(start) ?? 0) + 1);
    deltas.set(end, (deltas.get(end) ?? 0) - 1);
    area += end - start;
  }
  for (const [u, v] of resources.flagEdges) {
    const pu = position.get(u)!;
    const pv = position.get(v)!;
    const start = Math.min(pu, pv);
    const end = Math.max(pu, pv);
    deltas.set(start, (deltas.get(start) ?? 0) + 1);
    deltas.set(end, (deltas.get(end) ?? 0) - 1);
    area += end - start;
  }
  for (const node of resources.outputNodes) {
    const start = position.get(node)!;
    deltas.set(start, (deltas.get(start) ?? 0) + 1);
    deltas.set(horizon, (deltas.get(horizon) ?? 0) - 1);
    area += horizon - start;
  }

  let active = 0;
  let peak = 0;
  for (let i = 0; i < horizon; i++) {
    active += deltas.get(i) ?? 0;
    if (active > peak) peak = active;
  }
  return { peak, area };
}

export function planZxResourceOrder(
  graph: UndirectedGraph,
  forest: UndirectedGraph,
  dag: DirectedGraph,
  target: ReuseTargetType = 'qubits'
): ZxResourceOrderPlan {
  const resources = buildZxResources(graph, forest, dag);
  const indegree = new Map<number, number>();
  const ready = new Set<number>();

  for (const node of dag.nodes.keys()) {
    const deg = getInDegree(dag, node);
    indegree.set(node, deg);
    if (deg === 0) ready.add(node);
  }

  const height = new Map<number, number>();
  const topo = topologicalSort(dag);
  for (let i = topo.length - 1; i >= 0; i--) {
    const node = topo[i];
    const succs = getSuccessors(dag, node);
    if (succs.length === 0) {
      height.set(node, 0);
    } else {
      let maxH = 0;
      for (const s of succs) {
        const hs = height.get(s) ?? 0;
        if (hs > maxH) maxH = hs;
      }
      height.set(node, 1 + maxH);
    }
  }

  const treeIn = new Map<number, number>();
  const treeOut = new Map<number, number>();
  const flagNeighbors = new Map<number, Set<number>>();

  for (const [u, v] of resources.treeArcs) {
    treeOut.set(u, (treeOut.get(u) ?? 0) + 1);
    treeIn.set(v, (treeIn.get(v) ?? 0) + 1);
  }
  for (const [u, v] of resources.flagEdges) {
    if (!flagNeighbors.has(u)) flagNeighbors.set(u, new Set());
    if (!flagNeighbors.has(v)) flagNeighbors.set(v, new Set());
    flagNeighbors.get(u)!.add(v);
    flagNeighbors.get(v)!.add(u);
  }
  const outputs = new Set<number>(resources.outputNodes);
  const processed = new Set<number>();
  const order: number[] = [];
  let active = 0;
  let peak = 0;

  const delta = (node: number): number => {
    let change = (treeOut.get(node) ?? 0) - (treeIn.get(node) ?? 0);
    if (outputs.has(node)) change += 1;
    for (const nbr of flagNeighbors.get(node) ?? []) {
      change += processed.has(nbr) ? -1 : 1;
    }
    return change;
  };

  while (ready.size > 0) {
    const score = (node: number): number[] => {
      const d = delta(node);
      const after = active + d;
      const h = height.get(node) ?? 0;
      if (target === 'depth') {
        return [-h, Math.max(peak, after), after, d, node];
      }
      return [Math.max(peak, after), after, d, -h, node];
    };

    let bestNode = -1;
    let bestScore: number[] | null = null;
    for (const cand of ready) {
      const s = score(cand);
      if (bestScore === null || compareTuples(s, bestScore) < 0) {
        bestNode = cand;
        bestScore = s;
      }
    }

    ready.delete(bestNode);
    active += delta(bestNode);
    if (active > peak) peak = active;
    processed.add(bestNode);
    order.push(bestNode);

    for (const succ of getSuccessors(dag, bestNode)) {
      const nextDeg = indegree.get(succ)! - 1;
      indegree.set(succ, nextDeg);
      if (nextDeg === 0) ready.add(succ);
    }
  }

  const { peak: finalPeak, area } = computeZxCutMetrics(order, resources);
  return {
    order,
    peakQubits: finalPeak,
    activeVolume: area,
  };
}

export function resourceTargetScore(
  target: ReuseTargetType,
  qubits: number,
  depth: number,
  activeVolume = 0
): number[] {
  if (target === 'qubits') {
    return [qubits, depth, activeVolume];
  }
  if (target === 'depth' || target === 'None') {
    return [depth, qubits, activeVolume];
  }
  return [qubits * depth, qubits, depth, activeVolume];
}
