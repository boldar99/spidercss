import type {
  DirectedGraph,
  GraphEdgeData,
  GraphNodeData,
  UndirectedGraph,
  WellOrderedCatState,
} from './types';
import catStatesBundleRaw from '../generated/catStatesBundle.json';

interface SerializedNodeLinkGraph {
  directed: boolean;
  nodes: Array<{ id: number; is_mark?: boolean; is_flag?: boolean; is_root?: boolean }>;
  links: Array<{
    source: number;
    target: number;
    edge_type?: 'tree' | 'missing_link' | 'cnot';
  }>;
}

interface SerializedCatState {
  n: number;
  t: number;
  G: SerializedNodeLinkGraph;
  F: SerializedNodeLinkGraph;
  roots: Record<string, number>;
  D: SerializedNodeLinkGraph;
  edge: number;
}

const catStatesBundle = catStatesBundleRaw as unknown as Record<
  string,
  SerializedCatState
>;

export function ed(u: number, v: number): [number, number] {
  return u < v ? [u, v] : [v, u];
}

export function createUndirectedGraph(): UndirectedGraph {
  return {
    nodes: new Map<number, GraphNodeData>(),
    adj: new Map<number, Map<number, GraphEdgeData>>(),
  };
}

export function cloneUndirectedGraph(G: UndirectedGraph): UndirectedGraph {
  const next = createUndirectedGraph();
  for (const [id, data] of G.nodes.entries()) {
    next.nodes.set(id, { ...data });
    next.adj.set(id, new Map<number, GraphEdgeData>());
  }
  for (const [u, nbrs] of G.adj.entries()) {
    const uMap = next.adj.get(u)!;
    for (const [v, eData] of nbrs.entries()) {
      uMap.set(v, { ...eData });
    }
  }
  return next;
}

export function addUndirectedNode(
  G: UndirectedGraph,
  id: number,
  data: Partial<GraphNodeData> = {}
): void {
  const existing = G.nodes.get(id);
  G.nodes.set(id, { ...existing, ...data, id });
  if (!G.adj.has(id)) {
    G.adj.set(id, new Map<number, GraphEdgeData>());
  }
}

export function addUndirectedEdge(
  G: UndirectedGraph,
  u: number,
  v: number,
  data: Partial<GraphEdgeData> = {}
): void {
  if (!G.nodes.has(u)) addUndirectedNode(G, u);
  if (!G.nodes.has(v)) addUndirectedNode(G, v);
  const edgeObj: GraphEdgeData = {
    ...data,
    source: Math.min(u, v),
    target: Math.max(u, v),
  };
  G.adj.get(u)!.set(v, edgeObj);
  G.adj.get(v)!.set(u, edgeObj);
}

export function removeUndirectedEdge(
  G: UndirectedGraph,
  u: number,
  v: number
): void {
  G.adj.get(u)?.delete(v);
  G.adj.get(v)?.delete(u);
}

export function hasUndirectedEdge(
  G: UndirectedGraph,
  u: number,
  v: number
): boolean {
  return G.adj.get(u)?.has(v) ?? false;
}

export function getUndirectedNeighbors(
  G: UndirectedGraph,
  u: number
): number[] {
  return Array.from(G.adj.get(u)?.keys() ?? []);
}

export function getUndirectedDegree(G: UndirectedGraph, u: number): number {
  return G.adj.get(u)?.size ?? 0;
}

export function getUndirectedEdges(G: UndirectedGraph): GraphEdgeData[] {
  const edges: GraphEdgeData[] = [];
  for (const [u, nbrs] of G.adj.entries()) {
    for (const [v, eData] of nbrs.entries()) {
      if (u < v) {
        edges.push(eData);
      }
    }
  }
  return edges;
}

export function connectedComponents(G: UndirectedGraph): number[][] {
  const visited = new Set<number>();
  const comps: number[][] = [];
  for (const node of G.nodes.keys()) {
    if (visited.has(node)) continue;
    const comp: number[] = [];
    const queue: number[] = [node];
    visited.add(node);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const nbr of getUndirectedNeighbors(G, cur)) {
        if (!visited.has(nbr)) {
          visited.add(nbr);
          queue.push(nbr);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

export function subgraphUndirected(
  G: UndirectedGraph,
  nodeSubset: Iterable<number>
): UndirectedGraph {
  const subSet = new Set(nodeSubset);
  const sub = createUndirectedGraph();
  for (const u of subSet) {
    const data = G.nodes.get(u);
    if (data) addUndirectedNode(sub, u, { ...data });
  }
  for (const u of subSet) {
    const nbrs = G.adj.get(u);
    if (!nbrs) continue;
    for (const [v, eData] of nbrs.entries()) {
      if (u < v && subSet.has(v)) {
        addUndirectedEdge(sub, u, v, { ...eData });
      }
    }
  }
  return sub;
}

export function bfsDistancesUndirected(
  G: UndirectedGraph,
  source: number
): Map<number, number> {
  const dist = new Map<number, number>();
  dist.set(source, 0);
  const queue: number[] = [source];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    const d = dist.get(cur)!;
    for (const nbr of getUndirectedNeighbors(G, cur)) {
      if (!dist.has(nbr)) {
        dist.set(nbr, d + 1);
        queue.push(nbr);
      }
    }
  }
  return dist;
}

export function shortestPathUndirected(
  G: UndirectedGraph,
  source: number,
  target: number
): number[] {
  if (source === target) return [source];
  const prev = new Map<number, number>();
  const visited = new Set<number>([source]);
  const queue: number[] = [source];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nbr of getUndirectedNeighbors(G, cur)) {
      if (!visited.has(nbr)) {
        visited.add(nbr);
        prev.set(nbr, cur);
        if (nbr === target) {
          const path: number[] = [target];
          let step = target;
          while (step !== source) {
            step = prev.get(step)!;
            path.push(step);
          }
          path.reverse();
          return path;
        }
        queue.push(nbr);
      }
    }
  }
  throw new Error(`No path between ${source} and ${target}`);
}

export function eccentricityUndirected(
  G: UndirectedGraph,
  node: number
): number {
  const dists = bfsDistancesUndirected(G, node);
  let maxD = 0;
  for (const d of dists.values()) {
    if (d > maxD) maxD = d;
  }
  return maxD;
}

export function centerUndirected(G: UndirectedGraph): number[] {
  let minEcc = Number.POSITIVE_INFINITY;
  const eccByNode = new Map<number, number>();
  for (const u of G.nodes.keys()) {
    const ecc = eccentricityUndirected(G, u);
    eccByNode.set(u, ecc);
    if (ecc < minEcc) minEcc = ecc;
  }
  const centers: number[] = [];
  for (const [u, ecc] of eccByNode.entries()) {
    if (ecc === minEcc) centers.push(u);
  }
  return centers;
}

/**
 * Directed graph utilities
 */
export function createDirectedGraph(): DirectedGraph {
  return {
    nodes: new Map<number, GraphNodeData>(),
    outEdges: new Map<number, Map<number, GraphEdgeData>>(),
    inEdges: new Map<number, Map<number, GraphEdgeData>>(),
  };
}

export function cloneDirectedGraph(D: DirectedGraph): DirectedGraph {
  const next = createDirectedGraph();
  for (const [id, data] of D.nodes.entries()) {
    next.nodes.set(id, { ...data });
    next.outEdges.set(id, new Map<number, GraphEdgeData>());
    next.inEdges.set(id, new Map<number, GraphEdgeData>());
  }
  for (const [u, outs] of D.outEdges.entries()) {
    for (const [v, eData] of outs.entries()) {
      const cloned = { ...eData };
      next.outEdges.get(u)!.set(v, cloned);
      next.inEdges.get(v)!.set(u, cloned);
    }
  }
  return next;
}

export function addDirectedNode(
  D: DirectedGraph,
  id: number,
  data: Partial<GraphNodeData> = {}
): void {
  const existing = D.nodes.get(id);
  D.nodes.set(id, { ...existing, ...data, id });
  if (!D.outEdges.has(id)) D.outEdges.set(id, new Map());
  if (!D.inEdges.has(id)) D.inEdges.set(id, new Map());
}

export function addDirectedEdge(
  D: DirectedGraph,
  u: number,
  v: number,
  data: Partial<GraphEdgeData> = {}
): void {
  if (!D.nodes.has(u)) addDirectedNode(D, u);
  if (!D.nodes.has(v)) addDirectedNode(D, v);
  const edgeObj: GraphEdgeData = {
    ...data,
    source: u,
    target: v,
  };
  D.outEdges.get(u)!.set(v, edgeObj);
  D.inEdges.get(v)!.set(u, edgeObj);
}

export function removeDirectedEdge(
  D: DirectedGraph,
  u: number,
  v: number
): void {
  D.outEdges.get(u)?.delete(v);
  D.inEdges.get(v)?.delete(u);
}

export function getSuccessors(D: DirectedGraph, u: number): number[] {
  return Array.from(D.outEdges.get(u)?.keys() ?? []);
}

export function getPredecessors(D: DirectedGraph, u: number): number[] {
  return Array.from(D.inEdges.get(u)?.keys() ?? []);
}

export function getInDegree(D: DirectedGraph, u: number): number {
  return D.inEdges.get(u)?.size ?? 0;
}

export function getOutDegree(D: DirectedGraph, u: number): number {
  return D.outEdges.get(u)?.size ?? 0;
}

export function getDirectedEdges(D: DirectedGraph): GraphEdgeData[] {
  const edges: GraphEdgeData[] = [];
  for (const outs of D.outEdges.values()) {
    for (const eData of outs.values()) {
      edges.push(eData);
    }
  }
  return edges;
}

export function reverseDirectedGraph(D: DirectedGraph): DirectedGraph {
  const rev = createDirectedGraph();
  for (const [id, data] of D.nodes.entries()) {
    addDirectedNode(rev, id, { ...data });
  }
  for (const e of getDirectedEdges(D)) {
    addDirectedEdge(rev, e.target, e.source, {
      ...e,
      source: e.target,
      target: e.source,
    });
  }
  return rev;
}

/**
 * Matches `nx.topological_generations(D)`.
 * Throws if D contains a cycle.
 */
export function topologicalGenerations(D: DirectedGraph): number[][] {
  const inDeg = new Map<number, number>();
  let currentLayer: number[] = [];

  for (const u of D.nodes.keys()) {
    const d = getInDegree(D, u);
    inDeg.set(u, d);
    if (d === 0) currentLayer.push(u);
  }

  const generations: number[][] = [];
  let visitedCount = 0;

  while (currentLayer.length > 0) {
    generations.push(currentLayer);
    visitedCount += currentLayer.length;
    const nextLayer: number[] = [];
    for (const u of currentLayer) {
      for (const v of getSuccessors(D, u)) {
        const nextD = inDeg.get(v)! - 1;
        inDeg.set(v, nextD);
        if (nextD === 0) {
          nextLayer.push(v);
        }
      }
    }
    currentLayer = nextLayer;
  }

  if (visitedCount !== D.nodes.size) {
    throw new Error('Directed graph contains a cycle.');
  }

  return generations;
}

export function isDirectedAcyclicGraph(D: DirectedGraph): boolean {
  try {
    topologicalGenerations(D);
    return true;
  } catch {
    return false;
  }
}

export function topologicalSort(D: DirectedGraph): number[] {
  return topologicalGenerations(D).flat();
}

export function dagLongestPathLength(D: DirectedGraph): number {
  if (D.nodes.size === 0) return 0;
  const order = topologicalSort(D);
  const dist = new Map<number, number>();
  let maxLen = 0;
  for (const u of order) {
    let bestPred = -1;
    for (const p of getPredecessors(D, u)) {
      const pd = dist.get(p) ?? 0;
      if (pd > bestPred) bestPred = pd;
    }
    const d = bestPred + 1;
    dist.set(u, d);
    if (d > maxLen) maxLen = d;
  }
  return maxLen;
}

export function getAncestors(D: DirectedGraph, node: number): Set<number> {
  const anc = new Set<number>();
  const queue: number[] = [...getPredecessors(D, node)];
  for (const p of queue) anc.add(p);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const p of getPredecessors(D, cur)) {
      if (!anc.has(p)) {
        anc.add(p);
        queue.push(p);
      }
    }
  }
  return anc;
}

export function getDescendants(D: DirectedGraph, node: number): Set<number> {
  const desc = new Set<number>();
  const queue: number[] = [...getSuccessors(D, node)];
  for (const s of queue) desc.add(s);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const s of getSuccessors(D, cur)) {
      if (!desc.has(s)) {
        desc.add(s);
        queue.push(s);
      }
    }
  }
  return desc;
}

/**
 * Matches `find_min_height_root_edges` in `spidercat/spanning_tree.py`.
 */
export function findMinHeightRootEdges(
  forest: UndirectedGraph
): Record<number, [number, number] | null> {
  const idealEdges: Record<number, [number, number] | null> = {};
  for (const comp of connectedComponents(forest)) {
    const tree = subgraphUndirected(forest, comp);
    const edges = getUndirectedEdges(tree);
    if (edges.length === 0) continue;

    let bestEdge: [number, number] | null = null;
    let minEcc = Number.POSITIVE_INFINITY;

    for (const e of edges) {
      const u = e.source;
      const v = e.target;
      const treeWithoutEdge = cloneUndirectedGraph(tree);
      removeUndirectedEdge(treeWithoutEdge, u, v);

      const distU = bfsDistancesUndirected(treeWithoutEdge, u);
      const compU = Array.from(distU.keys());
      const distV = bfsDistancesUndirected(treeWithoutEdge, v);
      const compV = Array.from(distV.keys());

      const eccU =
        compU.length > 1
          ? eccentricityUndirected(subgraphUndirected(treeWithoutEdge, compU), u)
          : 0;
      const eccV =
        compV.length > 1
          ? eccentricityUndirected(subgraphUndirected(treeWithoutEdge, compV), v)
          : 0;

      const ecc = Math.max(eccU, eccV) + 1;
      if (ecc < minEcc) {
        minEcc = ecc;
        bestEdge = [u, v];
      }
    }

    const treeId = Math.min(...comp);
    idealEdges[treeId] = bestEdge;
  }
  return idealEdges;
}

/**
 * Matches `find_min_height_degree_k_roots` in `spidercat/spanning_tree.py`.
 */
export function findMinHeightDegreeKRoots(
  graph: UndirectedGraph,
  degree = 3
): Record<number, number> {
  const idealRoots: Record<number, number> = {};
  for (const comp of connectedComponents(graph)) {
    const sub = subgraphUndirected(graph, comp);
    const centers = centerUndirected(sub);
    const degKCenters = centers.filter(
      (node) => getUndirectedDegree(sub, node) === degree
    );

    let bestRoot: number | null = null;
    if (degKCenters.length > 0) {
      bestRoot = Math.min(...degKCenters);
    } else {
      const bestCenter = Math.min(...centers);
      const queue: number[] = [bestCenter];
      const visited = new Set<number>([bestCenter]);
      while (queue.length > 0) {
        const cur = queue.shift()!;
        if (getUndirectedDegree(sub, cur) === degree) {
          bestRoot = cur;
          break;
        }
        for (const nbr of getUndirectedNeighbors(sub, cur)) {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        }
      }
      if (bestRoot === null) {
        bestRoot = bestCenter;
      }
    }

    const compId = Math.min(...comp);
    idealRoots[compId] = bestRoot;
  }
  return idealRoots;
}

/**
 * Matches `build_traversal_digraph(G, F, root)` in `spidercss/circuit_extraction.py`.
 */
export function buildTraversalDigraph(
  G: UndirectedGraph,
  F: UndirectedGraph,
  root: number
): DirectedGraph {
  const D = createDirectedGraph();
  for (const [id, data] of G.nodes.entries()) {
    addDirectedNode(D, id, { ...data });
  }

  const queue: number[] = [root];
  const visited = new Set<number>([root]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of getUndirectedNeighbors(F, current)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
        addDirectedEdge(D, current, neighbor, { edge_type: 'tree' });
      }
    }

    if (getUndirectedDegree(F, current) === 1 && current !== root) {
      const missingNeighbors = getUndirectedNeighbors(G, current).filter(
        (n) => !hasUndirectedEdge(F, current, n)
      );
      for (const t of missingNeighbors) {
        addDirectedEdge(D, current, t, { edge_type: 'missing_link' });
      }
    }
  }

  return D;
}

/**
 * Matches `resolve_dag_by_removing_missing_link` in `spidercss/circuit_extraction.py`.
 */
export function resolveDagByRemovingMissingLink(diGraph: DirectedGraph): {
  isPossible: boolean;
  validEdges: Array<[number, number]>;
  resolvedDag: DirectedGraph | null;
} {
  if (isDirectedAcyclicGraph(diGraph)) {
    return {
      isPossible: true,
      validEdges: [],
      resolvedDag: cloneDirectedGraph(diGraph),
    };
  }

  const validEdgesToRemove: Array<[number, number]> = [];
  let resolvedDag: DirectedGraph | null = null;

  const missingLinks = getDirectedEdges(diGraph).filter(
    (e) => e.edge_type === 'missing_link'
  );

  for (const e of missingLinks) {
    const testDag = cloneDirectedGraph(diGraph);
    removeDirectedEdge(testDag, e.source, e.target);
    if (isDirectedAcyclicGraph(testDag)) {
      validEdgesToRemove.push([e.source, e.target]);
      if (resolvedDag === null) {
        resolvedDag = testDag;
      }
    }
  }

  return {
    isPossible: validEdgesToRemove.length > 0,
    validEdges: validEdgesToRemove,
    resolvedDag,
  };
}

function buildAndResolveDependencyDag(
  graph: UndirectedGraph,
  forest: UndirectedGraph,
  root: number,
  fallbackNode: number | null = null
): { dependencyDag: DirectedGraph; mainNode: number } {
  const traversalDigraph = buildTraversalDigraph(graph, forest, root);
  const { validEdges, resolvedDag } =
    resolveDagByRemovingMissingLink(traversalDigraph);

  if (!resolvedDag || !isDirectedAcyclicGraph(resolvedDag)) {
    throw new Error(
      'Failed to resolve dependency graph into a directed acyclic graph (DAG).'
    );
  }

  let mainNode: number;
  if (validEdges.length > 0) {
    mainNode = validEdges[0][0];
  } else if (fallbackNode !== null) {
    mainNode = fallbackNode;
  } else {
    const sinkNodes = Array.from(resolvedDag.nodes.keys()).filter(
      (x) => getOutDegree(resolvedDag, x) === 0
    );
    if (sinkNodes.length === 0) {
      throw new Error('No cycle closure edge found and no sink node available.');
    }
    mainNode = sinkNodes[0];
  }

  return { dependencyDag: resolvedDag, mainNode };
}

/**
 * Analytical base cases matching `build_base_chain_graph`, `build_base_t1_graph`,
 * and `build_base_n6_graph` in `spidercss/well_ordered_cat_state.py`.
 */
export function buildBaseChainGraph(
  n: number,
  rooted = false
): { graph: UndirectedGraph; forest: UndirectedGraph; root: number } {
  const graph = createUndirectedGraph();
  const rootedOffset = rooted ? 1 : 0;
  if (rooted) {
    addUndirectedNode(graph, 0, { is_mark: false });
  }
  for (let i = rootedOffset; i < n + rootedOffset; i++) {
    addUndirectedNode(graph, i, { is_mark: true });
  }
  for (let i = 0; i < n - 1 + rootedOffset; i++) {
    addUndirectedEdge(graph, i, i + 1);
  }
  return {
    graph,
    forest: cloneUndirectedGraph(graph),
    root: 0,
  };
}

export function buildBaseT1Graph(
  n: number,
  rooted = false
): { graph: UndirectedGraph; forest: UndirectedGraph; root: number } {
  const graph = createUndirectedGraph();
  let forest: UndirectedGraph;
  if (rooted) {
    addUndirectedNode(graph, 0, { is_mark: false });
    for (let i = 2; i < 2 + n; i++) {
      addUndirectedNode(graph, i, { is_mark: true });
    }
    addUndirectedEdge(graph, 0, 2);
    addUndirectedEdge(graph, 0, 3);
    for (let i = 0; i < n - 2; i++) {
      addUndirectedEdge(graph, 2 + i, 4 + i);
    }
    addUndirectedEdge(graph, n, n + 1);
    forest = cloneUndirectedGraph(graph);
    removeUndirectedEdge(forest, n + 1, n);
  } else {
    for (let i = 0; i < n; i++) {
      addUndirectedNode(graph, i, { is_mark: true });
    }
    for (let i = 0; i < n; i++) {
      addUndirectedEdge(graph, i, (i + 1) % n);
    }
    forest = cloneUndirectedGraph(graph);
    const mid = Math.floor(n / 2);
    removeUndirectedEdge(forest, mid, mid + 1);
  }
  return { graph, forest, root: 0 };
}

export function buildBaseN6Graph(
  rooted = false
): { graph: UndirectedGraph; forest: UndirectedGraph; root: number } {
  const graph = createUndirectedGraph();
  addUndirectedNode(graph, 0);
  addUndirectedNode(graph, 1);
  for (let i = 2; i < 8; i++) {
    addUndirectedNode(graph, i, { is_mark: true });
  }
  for (let i = 0; i < 3; i++) {
    addUndirectedEdge(graph, 0, i + 2);
    addUndirectedEdge(graph, 1, i + 5);
    addUndirectedEdge(graph, i + 2, i + 5);
  }
  const forest = cloneUndirectedGraph(graph);
  removeUndirectedEdge(forest, 0, 4);
  removeUndirectedEdge(forest, 1, 5);

  if (rooted) {
    const newNode = 8;
    const u = 0;
    const v = 3;
    for (const g of [graph, forest]) {
      addUndirectedNode(g, newNode, { is_mark: false });
      removeUndirectedEdge(g, u, v);
      addUndirectedEdge(g, u, newNode);
      addUndirectedEdge(g, v, newNode);
    }
    return { graph, forest, root: newNode };
  }

  return { graph, forest, root: 0 };
}

function deserializeCatState(raw: SerializedCatState): WellOrderedCatState {
  const G = createUndirectedGraph();
  for (const n of raw.G.nodes) {
    addUndirectedNode(G, n.id, { ...n });
  }
  for (const e of raw.G.links) {
    addUndirectedEdge(G, e.source, e.target, { ...e });
  }

  const F = createUndirectedGraph();
  for (const n of raw.F.nodes) {
    addUndirectedNode(F, n.id, { ...n });
  }
  for (const e of raw.F.links) {
    addUndirectedEdge(F, e.source, e.target, { ...e });
  }

  const D = createDirectedGraph();
  for (const n of raw.D.nodes) {
    addDirectedNode(D, n.id, { ...n });
  }
  for (const e of raw.D.links) {
    addDirectedEdge(D, e.source, e.target, { ...e });
  }

  const roots: Record<number, number> = {};
  for (const [k, v] of Object.entries(raw.roots)) {
    roots[Number(k)] = v;
  }

  return {
    n: raw.n,
    t: raw.t,
    G,
    F,
    roots,
    D,
    edge: raw.edge,
  };
}

/**
 * Loads or constructs well-ordered fault-tolerant cat state graph data structures.
 * Matches `well_ordered_ft_cat_state_data(n, t, rooted)` in `spidercss/well_ordered_cat_state.py`.
 */
export function wellOrderedFtCatStateData(
  n: number,
  t: number,
  rooted = true
): WellOrderedCatState {
  const shouldUseCache = !(n <= 5 || (t <= 1 && !rooted));
  if (shouldUseCache) {
    const key = `t${t}_n${n}`;
    const raw = catStatesBundle[key];
    if (raw) {
      const state = deserializeCatState(raw);
      if (rooted) {
        const rootNode = state.roots[0];
        const isMark = state.G.nodes.get(rootNode)?.is_mark ?? false;
        const deg = getUndirectedDegree(state.F, rootNode);
        if (isMark || deg === 3) {
          const rootEdges = findMinHeightRootEdges(state.F);
          const insertions: Array<{
            compId: number;
            edge: [number, number];
            newNode: number;
          }> = [];
          const maxNodeId = Math.max(...Array.from(state.G.nodes.keys()));
          for (const [compIdStr, edge] of Object.entries(rootEdges)) {
            if (edge !== null) {
              insertions.push({
                compId: Number(compIdStr),
                edge,
                newNode: maxNodeId + 1 + insertions.length,
              });
            }
          }
          for (const { compId, edge, newNode } of insertions) {
            const [u, v] = edge;
            removeUndirectedEdge(state.G, u, v);
            addUndirectedNode(state.G, newNode, { is_mark: false });
            addUndirectedEdge(state.G, u, newNode);
            addUndirectedEdge(state.G, v, newNode);

            removeUndirectedEdge(state.F, u, v);
            addUndirectedNode(state.F, newNode, { is_mark: false });
            addUndirectedEdge(state.F, u, newNode);
            addUndirectedEdge(state.F, v, newNode);

            state.roots[compId] = newNode;
          }
          const { dependencyDag, mainNode } = buildAndResolveDependencyDag(
            state.G,
            state.F,
            state.roots[0],
            null
          );
          state.D = dependencyDag;
          state.edge = mainNode;
        }
      }
      return state;
    }
  }

  // Analytical base cases (n <= 3 or t == 0, t == 1 or n <= 5, n == 6)
  let graph: UndirectedGraph;
  let forest: UndirectedGraph;
  let root: number;
  let fallbackNode: number | null = null;

  if (n <= 3 || t <= 0) {
    const res = buildBaseChainGraph(n, rooted);
    graph = res.graph;
    forest = res.forest;
    root = res.root;
    fallbackNode = n - 1 + (rooted ? 1 : 0);
  } else if (t === 1 || n <= 5) {
    const res = buildBaseT1Graph(n, rooted);
    graph = res.graph;
    forest = res.forest;
    root = res.root;
    fallbackNode = n + (rooted ? 1 : 0);
  } else if (n === 6) {
    const res = buildBaseN6Graph(rooted);
    graph = res.graph;
    forest = res.forest;
    root = res.root;
    fallbackNode = 0;
  } else {
    // Fallback to highest available t <= requested t in bundle
    for (let fallbackT = t; fallbackT >= 1; fallbackT--) {
      const raw = catStatesBundle[`t${fallbackT}_n${n}`];
      if (raw) {
        return deserializeCatState(raw);
      }
    }
    const res = buildBaseT1Graph(n, rooted);
    graph = res.graph;
    forest = res.forest;
    root = res.root;
    fallbackNode = n + (rooted ? 1 : 0);
  }

  const roots = { 0: root };
  const { dependencyDag, mainNode } = buildAndResolveDependencyDag(
    graph,
    forest,
    root,
    fallbackNode
  );

  return {
    n,
    t,
    G: graph,
    F: forest,
    roots,
    D: dependencyDag,
    edge: mainNode,
  };
}

/**
 * Builds a well-ordered composite cat state for an ordered list of component sizes `ns`.
 * Matches `well_ordered_composite_cat_state_data(ns, t)` in `spidercss/well_ordered_cat_state.py`.
 */
export function wellOrderedCompositeCatStateData(
  ns: number[],
  t: number
): WellOrderedCatState {
  if (ns.length === 0) {
    throw new Error('ns cannot be empty');
  }
  if (ns.length === 1) {
    return wellOrderedFtCatStateData(ns[0], t, true);
  }

  const numChunks = ns.length;
  const compositeGraph = createUndirectedGraph();
  const compositeForest = createUndirectedGraph();
  const compositeDag = createDirectedGraph();

  let nodeOffset = 0;
  let prevIsT0 = false;
  let prevExit: number | null = null;
  let globalRoot: number | null = null;

  for (let k = 0; k < numChunks; k++) {
    const nLogical = ns[k];
    let chunkSize =
      k === 0 || k === numChunks - 1 ? nLogical + 1 : nLogical + 2;
    const currentIsT0 = chunkSize <= 3 || t <= 0;
    if (currentIsT0) {
      chunkSize = nLogical;
    }

    const chunkState = wellOrderedFtCatStateData(chunkSize, t, k === 0);
    let rootK: number;
    let exitK: number;
    let dagK = chunkState.D;

    if (k === 0 || currentIsT0) {
      rootK = chunkState.roots[0];
      exitK = chunkState.edge;
    } else {
      const deg2Roots = findMinHeightDegreeKRoots(chunkState.G, 2);
      rootK = Object.values(deg2Roots)[0];
      const resolved = buildAndResolveDependencyDag(
        chunkState.G,
        chunkState.F,
        rootK,
        null
      );
      dagK = resolved.dependencyDag;
      exitK = resolved.mainNode;
    }

    const oldNodes = Array.from(chunkState.G.nodes.keys());
    const nodeMap = new Map<number, number>();
    oldNodes.forEach((oldNode, idx) => {
      nodeMap.set(oldNode, nodeOffset + idx);
    });

    for (const [oldId, nData] of chunkState.G.nodes.entries()) {
      const newId = nodeMap.get(oldId)!;
      addUndirectedNode(compositeGraph, newId, {
        ...nData,
        id: newId,
        chunk_idx: k,
      });
      addUndirectedNode(compositeForest, newId, {
        ...nData,
        id: newId,
        chunk_idx: k,
      });
      addDirectedNode(compositeDag, newId, {
        ...nData,
        id: newId,
        chunk_idx: k,
      });
    }

    for (const e of getUndirectedEdges(chunkState.G)) {
      addUndirectedEdge(
        compositeGraph,
        nodeMap.get(e.source)!,
        nodeMap.get(e.target)!,
        { ...e }
      );
    }
    for (const e of getUndirectedEdges(chunkState.F)) {
      addUndirectedEdge(
        compositeForest,
        nodeMap.get(e.source)!,
        nodeMap.get(e.target)!,
        { ...e }
      );
    }
    for (const e of getDirectedEdges(dagK)) {
      addDirectedEdge(
        compositeDag,
        nodeMap.get(e.source)!,
        nodeMap.get(e.target)!,
        { ...e }
      );
    }

    const mappedRoot = nodeMap.get(rootK)!;
    const mappedExit = nodeMap.get(exitK)!;

    if (k === 0) {
      globalRoot = mappedRoot;
    } else {
      if (prevExit === null) {
        throw new Error('prevExit is unexpectedly null');
      }
      if (!prevIsT0) {
        const prevNode = compositeGraph.nodes.get(prevExit);
        if (prevNode) prevNode.is_mark = false;
      }
      if (!currentIsT0) {
        const curRootNode = compositeGraph.nodes.get(mappedRoot);
        if (curRootNode) curRootNode.is_mark = false;
      }
      addUndirectedEdge(compositeGraph, prevExit, mappedRoot);
      addUndirectedEdge(compositeForest, prevExit, mappedRoot);
      addDirectedEdge(compositeDag, prevExit, mappedRoot, { edge_type: 'tree' });
    }

    prevIsT0 = currentIsT0;
    prevExit = mappedExit;
    nodeOffset += oldNodes.length;
  }

  return {
    n: ns.reduce((a, b) => a + b, 0),
    t,
    G: compositeGraph,
    F: compositeForest,
    roots: { 0: globalRoot! },
    D: compositeDag,
    edge: prevExit!,
  };
}

export interface CatTreeGridLayout {
  numCols: number;
  numRows: number;
  coords: Map<number, { col: number; row: number }>;
  rootId: number;
  exitId: number;
}

/**
 * Computes a deterministic 2D grid layout (col, row) for a WellOrderedCatState
 * matching Figure 6 (`building-G-and-D.tikz`) of the paper:
 * - Row 0 holds the primary path in F from the root `r_k` (col 0) to `state.edge` (rightmost col).
 * - Each flag branch in F splits onto its own horizontal row (`row = 1, 2, ...`) with `col` increasing left-to-right.
 */
export function computeCatStateTreeLayout(
  state: WellOrderedCatState
): CatTreeGridLayout {
  const rootId = Object.values(state.roots)[0] ?? 0;
  const exitId = state.edge;
  const primarySet = new Set<number>(
    state.F.nodes.has(rootId) && state.F.nodes.has(exitId)
      ? shortestPathUndirected(state.F, rootId, exitId)
      : [rootId]
  );

  const childrenMap = new Map<number, number[]>();
  const subtreeSize = new Map<number, number>();
  const visited = new Set<number>();

  const buildTree = (u: number): number => {
    visited.add(u);
    const ch: number[] = [];
    let size = 1;
    for (const v of getUndirectedNeighbors(state.F, u)) {
      if (!visited.has(v)) {
        ch.push(v);
        size += buildTree(v);
      }
    }
    ch.sort((a, b) => {
      const aPrim = primarySet.has(a) ? 1 : 0;
      const bPrim = primarySet.has(b) ? 1 : 0;
      if (aPrim !== bPrim) return bPrim - aPrim;
      const sa = subtreeSize.get(a) ?? 1;
      const sb = subtreeSize.get(b) ?? 1;
      if (sa !== sb) return sb - sa;
      return a - b;
    });
    childrenMap.set(u, ch);
    subtreeSize.set(u, size);
    return size;
  };

  if (state.F.nodes.has(rootId)) {
    buildTree(rootId);
  }

  const coords = new Map<number, { col: number; row: number }>();
  let nextRow = 1;
  let maxCol = 0;

  const assignCoords = (u: number, col: number, row: number) => {
    coords.set(u, { col, row });
    if (col > maxCol) maxCol = col;
    const ch = childrenMap.get(u) ?? [];
    ch.forEach((v, idx) => {
      if (idx === 0) {
        assignCoords(v, col + 1, row);
      } else {
        const branchRow = nextRow++;
        assignCoords(v, col + 1, branchRow);
      }
    });
  };

  if (state.F.nodes.has(rootId)) {
    assignCoords(rootId, 0, 0);
  }

  for (const nodeId of state.G.nodes.keys()) {
    if (!coords.has(nodeId)) {
      const r = nextRow++;
      coords.set(nodeId, { col: 0, row: r });
    }
  }

  return {
    numCols: maxCol + 1,
    numRows: Math.max(1, nextRow),
    coords,
    rootId,
    exitId,
  };
}

