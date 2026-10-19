import type {
  Algorithm1StepSnapshot,
  BasisType,
  BinaryMatrix,
  DirectedGraph,
  LogicalEdge,
  MatchedEdge,
  ReuseTargetType,
  RoutingHeuristicType,
  UndirectedGraph,
  WellOrderedCatState,
} from './types';
import {
  addDirectedEdge,
  addDirectedNode,
  addUndirectedEdge,
  addUndirectedNode,
  cloneDirectedGraph,
  cloneUndirectedGraph,
  createDirectedGraph,
  createUndirectedGraph,
  dagLongestPathLength,
  getDirectedEdges,
  getInDegree,
  getPredecessors,
  getUndirectedDegree,
  getUndirectedEdges,
  isDirectedAcyclicGraph,
  shortestPathUndirected,
  topologicalGenerations,
  wellOrderedCompositeCatStateData,
  wellOrderedFtCatStateData,
} from './catState';
import { computeXSpiderSplits } from './hookErrors';
import { findPivotsInMatrix, hasUniqueOnesProperty } from './optimizeParityMatrix';
import {
  activeSpiderFirstOrder,
  criticalPathFirstOrder,
  earliestStartFirstOrder,
  edgeKey,
  getNodeDistancesToSink,
  planZxResourceOrder,
  randomEdgeOrder,
  resourceTargetScore,
  saSequenceDistanceOrder,
} from './heuristics';

/**
 * Assigns the earliest available local ports for an absolute edge order.
 * Matches `match_edges_from_order` in `spidercss/spider_leg_matcher.py`.
 */
export function matchEdgesFromOrder(
  edgeOrder: LogicalEdge[],
  zCandidates: number[][],
  xCandidates: number[][][],
  edgeGroups: Map<string, number>
): MatchedEdge[] {
  const zPools = zCandidates.map((pool) => [...pool]);
  const xPools = xCandidates.map((spiderGroups) =>
    spiderGroups.map((group) => [...group])
  );

  const matching: MatchedEdge[] = [];
  for (const edge of edgeOrder) {
    const [zIndex, xIndex] = edge;
    const group = edgeGroups.get(edgeKey(edge)) ?? 0;
    if (
      !zPools[zIndex] ||
      zPools[zIndex].length === 0 ||
      !xPools[xIndex]?.[group] ||
      xPools[xIndex][group].length === 0
    ) {
      throw new Error(
        `Insufficient candidate ports while matching logical edge (${zIndex}, ${xIndex}).`
      );
    }
    const zPort = zPools[zIndex].shift()!;
    const xPort = xPools[xIndex][group].shift()!;
    matching.push([edge, [zPort, xPort]]);
  }

  return matching;
}

/**
 * Matches `match_edges` in `spidercss/spider_leg_matcher.py`.
 */
export function matchEdges(
  parityMatrix: BinaryMatrix,
  nonPivots: number[],
  zDigraphs: DirectedGraph[],
  xDigraphs: DirectedGraph[],
  zCandidates: number[][],
  xCandidates: number[][][],
  edgeGroups: Map<string, number>,
  routingHeuristic: RoutingHeuristicType = 'sa_sequence_distance',
  seed = 42
): MatchedEdge[] {
  const edgeList: LogicalEdge[] = [];
  for (let zIndex = 0; zIndex < parityMatrix.length; zIndex++) {
    const row = parityMatrix[zIndex];
    for (let xIndex = 0; xIndex < nonPivots.length; xIndex++) {
      const col = nonPivots[xIndex];
      if (row[col] === 1) {
        edgeList.push([zIndex, xIndex]);
      }
    }
  }

  const zNodeDistances = getNodeDistancesToSink(zDigraphs);
  const xNodeDistances = getNodeDistancesToSink(xDigraphs);

  const zCnotDistances = zCandidates.map((candidates, index) =>
    candidates.map((node) => zNodeDistances[index].get(node) ?? 0)
  );
  const xCnotDistances = xCandidates.map((candidateGroups, index) => {
    const nodes = candidateGroups.flat();
    return nodes.map((node) => xNodeDistances[index].get(node) ?? 0);
  });

  let edgeOrder: LogicalEdge[];
  if (routingHeuristic === 'earliest_start_first') {
    edgeOrder = earliestStartFirstOrder(
      edgeList,
      edgeGroups,
      zCnotDistances,
      xCnotDistances,
      seed
    );
  } else if (routingHeuristic === 'active_spider_first') {
    edgeOrder = activeSpiderFirstOrder(
      edgeList,
      edgeGroups,
      zCnotDistances,
      xCnotDistances,
      seed
    );
  } else if (routingHeuristic === 'sa_sequence_distance') {
    edgeOrder = saSequenceDistanceOrder(
      edgeList,
      edgeGroups,
      zCnotDistances,
      xCnotDistances,
      10000,
      seed
    );
  } else if (routingHeuristic === 'critical_path_first') {
    edgeOrder = criticalPathFirstOrder(
      edgeList,
      edgeGroups,
      zCnotDistances,
      xCnotDistances
    );
  } else if (routingHeuristic === 'random') {
    edgeOrder = randomEdgeOrder(edgeList, edgeGroups, seed);
  } else {
    throw new Error(`Unknown routing heuristic: ${routingHeuristic}`);
  }

  const matching = matchEdgesFromOrder(
    edgeOrder,
    zCandidates,
    xCandidates,
    edgeGroups
  );

  // Verify chronological group order for composite X spiders
  const lastGroupSeen = new Map<number, number>();
  for (const [edge] of matching) {
    const xIndex = edge[1];
    const group = edgeGroups.get(edgeKey(edge)) ?? 0;
    const prev = lastGroupSeen.get(xIndex) ?? group;
    if (group < prev) {
      throw new Error(
        `Composite spider ${xIndex} group order is not chronological.`
      );
    }
    lastGroupSeen.set(xIndex, group);
  }

  return matching;
}

export function nodeMapKey(compIdx: number, localNode: number): string {
  return `${compIdx}:${localNode}`;
}

/**
 * Applies one local-port matching to copies of the global structures.
 * Matches `materialize_matching` in `spidercss/joint_extraction_planner.py`.
 */
export function materializeMatching(
  baseGraph: UndirectedGraph,
  forest: UndirectedGraph,
  baseDag: DirectedGraph,
  matching: MatchedEdge[],
  zNodeMapping: Map<string, number>,
  xNodeMapping: Map<string, number>,
  zDigraphs: DirectedGraph[],
  xDigraphs: DirectedGraph[]
): { graph: UndirectedGraph; dag: DirectedGraph } {
  const graph = cloneUndirectedGraph(baseGraph);
  const dag = cloneDirectedGraph(baseDag);

  for (const [[zGraph, xGraph], [zValue, xValue]] of matching) {
    const zNode = zNodeMapping.get(nodeMapKey(zGraph, zValue))!;
    const xNode = xNodeMapping.get(nodeMapKey(xGraph, xValue))!;

    addUndirectedEdge(graph, zNode, xNode, { edge_type: 'cnot' });
    graph.nodes.get(zNode)!.is_mark = false;
    graph.nodes.get(xNode)!.is_mark = false;

    if (getUndirectedDegree(forest, zNode) === 1 && getInDegree(dag, zNode) > 0) {
      graph.nodes.get(zNode)!.is_flag = true;
    }
    if (getUndirectedDegree(forest, xNode) === 1 && getInDegree(dag, xNode) > 0) {
      graph.nodes.get(xNode)!.is_flag = true;
    }

    for (const pred of getPredecessors(zDigraphs[zGraph], zValue)) {
      const predGlobal = zNodeMapping.get(nodeMapKey(zGraph, pred))!;
      addDirectedEdge(dag, predGlobal, xNode, { edge_type: 'cnot' });
    }
    for (const pred of getPredecessors(xDigraphs[xGraph], xValue)) {
      const predGlobal = xNodeMapping.get(nodeMapKey(xGraph, pred))!;
      addDirectedEdge(dag, predGlobal, zNode, { edge_type: 'cnot' });
    }
  }

  if (!isDirectedAcyclicGraph(dag)) {
    throw new Error('Port matching produced a cyclic global dependency graph.');
  }

  return { graph, dag };
}

function validAdjacentSwap(
  left: LogicalEdge,
  right: LogicalEdge,
  edgeGroups: Map<string, number>
): boolean {
  return (
    left[1] !== right[1] ||
    (edgeGroups.get(edgeKey(left)) ?? 0) === (edgeGroups.get(edgeKey(right)) ?? 0)
  );
}

function compareScoreArrays(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

/**
 * Polynomial local search over matching and absolute ZX node order.
 * Matches `plan_joint_extraction` in `spidercss/joint_extraction_planner.py`.
 */
export function planJointExtraction(params: {
  initialMatching: MatchedEdge[];
  zCandidates: number[][];
  xCandidates: number[][][];
  edgeGroups: Map<string, number>;
  baseGraph: UndirectedGraph;
  forest: UndirectedGraph;
  baseDag: DirectedGraph;
  zNodeMapping: Map<string, number>;
  xNodeMapping: Map<string, number>;
  zDigraphs: DirectedGraph[];
  xDigraphs: DirectedGraph[];
  maxTrials?: number;
  target?: ReuseTargetType;
}): {
  matchedEdges: MatchedEdge[];
  nodeOrder: number[];
  peakQubits: number;
  activeVolume: number;
  dependencyDepth: number;
  evaluatedMatchings: number;
} {
  const {
    initialMatching,
    zCandidates,
    xCandidates,
    edgeGroups,
    baseGraph,
    forest,
    baseDag,
    zNodeMapping,
    xNodeMapping,
    zDigraphs,
    xDigraphs,
    maxTrials = 64,
    target = 'qubits',
  } = params;

  const evaluate = (edgeOrder: LogicalEdge[]) => {
    const matching = matchEdgesFromOrder(
      edgeOrder,
      zCandidates,
      xCandidates,
      edgeGroups
    );
    const { graph, dag } = materializeMatching(
      baseGraph,
      forest,
      baseDag,
      matching,
      zNodeMapping,
      xNodeMapping,
      zDigraphs,
      xDigraphs
    );
    const resourcePlan = planZxResourceOrder(graph, forest, dag, target);
    const depth = dagLongestPathLength(dag);
    const score = resourceTargetScore(
      target,
      resourcePlan.peakQubits,
      depth,
      resourcePlan.activeVolume
    );
    return { score, matching, resourcePlan, depth };
  };

  let edgeOrder = initialMatching.map(([edge]) => edge);
  let best = evaluate(edgeOrder);
  let evaluated = 1;

  if (edgeOrder.length < 2 || maxTrials <= 0) {
    return {
      matchedEdges: best.matching,
      nodeOrder: best.resourcePlan.order,
      peakQubits: best.resourcePlan.peakQubits,
      activeVolume: best.resourcePlan.activeVolume,
      dependencyDepth: best.depth,
      evaluatedMatchings: evaluated,
    };
  }

  let swappable: number[] = [];
  for (let i = 0; i < edgeOrder.length - 1; i++) {
    if (validAdjacentSwap(edgeOrder[i], edgeOrder[i + 1], edgeGroups)) {
      swappable.push(i);
    }
  }

  if (swappable.length > maxTrials) {
    const selected = new Set<number>();
    for (let i = 0; i < maxTrials; i++) {
      const idx = Math.round(
        (i * (swappable.length - 1)) / Math.max(1, maxTrials - 1)
      );
      selected.add(swappable[idx]);
    }
    swappable = Array.from(selected).sort((a, b) => a - b);
  }

  for (const index of swappable) {
    const candidateOrder = [...edgeOrder];
    const tmp = candidateOrder[index];
    candidateOrder[index] = candidateOrder[index + 1];
    candidateOrder[index + 1] = tmp;

    const cand = evaluate(candidateOrder);
    evaluated++;
    if (compareScoreArrays(cand.score, best.score) < 0) {
      edgeOrder = candidateOrder;
      best = cand;
    }
  }

  return {
    matchedEdges: best.matching,
    nodeOrder: best.resourcePlan.order,
    peakQubits: best.resourcePlan.peakQubits,
    activeVolume: best.resourcePlan.activeVolume,
    dependencyDepth: best.depth,
    evaluatedMatchings: evaluated,
  };
}

export interface GlobalPipelineSetup {
  N: number;
  t: number;
  pivots: Record<number, number>;
  pivotsPerm: number[];
  nonPivots: number[];
  xSplits: number[][][];
  xSpiders: number[][];
  zSpiders: number[];
  zStates: WellOrderedCatState[];
  xStates: WellOrderedCatState[];
  zCandidates: number[][];
  xCandidates: number[][][];
  edgeGroups: Map<string, number>;
  zNodeMapping: Map<string, number>;
  xNodeMapping: Map<string, number>;
  baseGlobalG: UndirectedGraph;
  globalF: UndirectedGraph;
  globalRoots: Record<number, number>;
  baseGlobalD: DirectedGraph;
  globalPrimaryPaths: Record<number, number[]>;
  matchedEdges: MatchedEdge[];
  finalG: UndirectedGraph;
  finalD: DirectedGraph;
  nodeOrder: number[];
  stepSnapshots: Algorithm1StepSnapshot[];
}

/**
 * Builds the global data structures (G_global, F_global, D_global) and runs
 * Algorithm 1 step-by-step, recording full snapshots for Phase 3 visualization.
 * Matches `cat_at_origin` in `spidercss/cat_at_origin.py`.
 */
export function buildGlobalPipelineAndSnapshots(params: {
  H: BinaryMatrix;
  d: number;
  basis?: BasisType;
  analyzeHookErrors?: boolean;
  routingHeuristic?: RoutingHeuristicType;
  customEdgeOrder?: LogicalEdge[];
  reuseTarget?: ReuseTargetType;
  seed?: number;
}): GlobalPipelineSetup {
  const {
    H,
    d,
    basis = 'Z',
    analyzeHookErrors = false,
    routingHeuristic = 'sa_sequence_distance',
    customEdgeOrder,
    reuseTarget = 'None',
    seed = 42,
  } = params;

  if (!hasUniqueOnesProperty(H)) {
    throw new Error('H does not satisfy the unique-ones property.');
  }

  const N = H[0].length;
  const t = Math.floor(d / 2);

  const { pivots, rowsWithoutPivots, nonPivots } = findPivotsInMatrix(H);
  if (rowsWithoutPivots.length > 0) {
    throw new Error('Some rows of H do not have a valid unique-one pivot.');
  }

  const pivotsPerm = Object.entries(pivots)
    .sort((a, b) => a[1] - b[1])
    .map(([rowStr]) => Number(rowStr));

  const { xSplits, xSpiders, zSpiders, isPerfect } = computeXSpiderSplits(
    H,
    d,
    analyzeHookErrors
  );

  const xT = isPerfect ? Math.max(0, t - 1) : t;

  const zStates = zSpiders.map((zs) => wellOrderedFtCatStateData(zs, t, true));
  const xStates = xSpiders.map((xs) => wellOrderedCompositeCatStateData(xs, xT));

  const zGraphs: UndirectedGraph[] = [];
  const xGraphs: UndirectedGraph[] = [];
  const zTrees: UndirectedGraph[] = [];
  const xTrees: UndirectedGraph[] = [];
  const zDigraphs: DirectedGraph[] = [];
  const xDigraphs: DirectedGraph[] = [];
  const zRoots: Array<Record<number, number>> = [];
  const xRoots: Array<Record<number, number>> = [];
  const zMains: number[] = [];
  const xMains: number[] = [];
  const zCandidates: number[][] = [];
  const xCandidates: number[][][] = [];

  for (let i = 0; i < zStates.length; i++) {
    const state = zStates[i];
    const G = cloneUndirectedGraph(state.G);
    for (const nData of G.nodes.values()) {
      nData.spider_type = basis;
      nData.compKind = 'Z';
      nData.compIndex = i;
      nData.localId = nData.id;
    }
    zGraphs.push(G);
    zTrees.push(state.F);
    zRoots.push(state.roots);
    zDigraphs.push(state.D);
    zMains.push(state.edge);

    const cands: number[] = [];
    for (const layer of topologicalGenerations(state.D)) {
      for (const l of layer) {
        if (l !== state.edge && G.nodes.get(l)?.is_mark) {
          cands.push(l);
        }
      }
    }
    zCandidates.push(cands);
  }

  const xSpiderBasis: BasisType = basis === 'Z' ? 'X' : 'Z';
  for (let j = 0; j < xStates.length; j++) {
    const state = xStates[j];
    const G = cloneUndirectedGraph(state.G);
    for (const nData of G.nodes.values()) {
      nData.spider_type = xSpiderBasis;
      nData.compKind = 'X';
      nData.compIndex = j;
      nData.localId = nData.id;
    }
    xGraphs.push(G);
    xTrees.push(state.F);
    xRoots.push(state.roots);
    xDigraphs.push(state.D);
    xMains.push(state.edge);

    const ns = xSpiders[j];
    const gens = topologicalGenerations(state.D);
    if (ns.length === 1) {
      const cands: number[] = [];
      for (const layer of gens) {
        for (const l of layer) {
          if (l !== state.edge && G.nodes.get(l)?.is_mark) {
            cands.push(l);
          }
        }
      }
      xCandidates.push([cands]);
    } else {
      const spiderGroupedCands: number[][] = [];
      for (let k = 0; k < ns.length; k++) {
        const sz = ns[k];
        let candsK: number[] = [];
        for (const layer of gens) {
          for (const node of layer) {
            const nd = G.nodes.get(node);
            if (nd?.chunk_idx === k && nd?.is_mark && node !== state.edge) {
              candsK.push(node);
            }
          }
        }
        const reqEdges = k < ns.length - 1 ? sz : sz - 1;
        if (candsK.length < reqEdges) {
          candsK = [];
          for (const layer of gens) {
            for (const node of layer) {
              const nd = G.nodes.get(node);
              if (nd?.chunk_idx === k && node !== state.edge) {
                candsK.push(node);
              }
            }
          }
        }
        spiderGroupedCands.push(candsK);
      }
      xCandidates.push(spiderGroupedCands);
    }
  }

  const edgeGroups = new Map<string, number>();
  for (let i = 0; i < H.length; i++) {
    const r = H[i];
    for (let j = 0; j < nonPivots.length; j++) {
      const col = nonPivots[j];
      if (r[col] === 1) {
        const pivotQ = pivots[i];
        const groupIdx = xSplits[j].findIndex((piece) => piece.includes(pivotQ));
        edgeGroups.set(edgeKey([i, j]), Math.max(0, groupIdx));
      }
    }
  }

  let seedHeuristic: RoutingHeuristicType = routingHeuristic;
  let maxTrials = 0;
  if (routingHeuristic === 'joint_resource') {
    seedHeuristic = 'critical_path_first';
    maxTrials = 64;
  } else if (routingHeuristic === 'joint_resource_earliest_start_first') {
    seedHeuristic = 'earliest_start_first';
    maxTrials = 64;
  }

  const initialMatchedEdges = customEdgeOrder
    ? matchEdgesFromOrder(customEdgeOrder, zCandidates, xCandidates, edgeGroups)
    : matchEdges(
        H,
        nonPivots,
        zDigraphs,
        xDigraphs,
        zCandidates,
        xCandidates,
        edgeGroups,
        seedHeuristic,
        seed
      );

  // Build global disjoint graphs G_global, F_global, D_global
  const zNodeMapping = new Map<string, number>();
  const xNodeMapping = new Map<string, number>();
  const baseGlobalG = createUndirectedGraph();
  const globalF = createUndirectedGraph();
  const globalRoots: Record<number, number> = {};
  const baseGlobalD = createDirectedGraph();
  const globalPrimaryPaths: Record<number, number[]> = {};

  let iIdx = 0;
  let jIdx = 0;
  let kGlobal = 0;
  const nonPivotsSet = new Set(nonPivots);

  while (iIdx + jIdx < N) {
    const currCol = iIdx + jIdx;
    const isNonPivot = nonPivotsSet.has(currCol);

    const graph = isNonPivot ? xGraphs[iIdx] : zGraphs[pivotsPerm[jIdx]];
    const trees = isNonPivot ? xTrees[iIdx] : zTrees[pivotsPerm[jIdx]];
    const digraph = isNonPivot ? xDigraphs[iIdx] : zDigraphs[pivotsPerm[jIdx]];
    const nodeMapping = isNonPivot ? xNodeMapping : zNodeMapping;
    const root = isNonPivot ? xRoots[iIdx] : zRoots[pivotsPerm[jIdx]];
    const index = isNonPivot ? iIdx : pivotsPerm[jIdx];

    for (const [node, data] of graph.nodes.entries()) {
      nodeMapping.set(nodeMapKey(index, node), kGlobal);
      addUndirectedNode(baseGlobalG, kGlobal, { ...data, id: kGlobal });
      addUndirectedNode(globalF, kGlobal, { ...data, id: kGlobal });
      addDirectedNode(baseGlobalD, kGlobal, { ...data, id: kGlobal });
      kGlobal++;
    }

    for (const e of getUndirectedEdges(graph)) {
      const uPrime = nodeMapping.get(nodeMapKey(index, e.source))!;
      const vPrime = nodeMapping.get(nodeMapKey(index, e.target))!;
      addUndirectedEdge(baseGlobalG, uPrime, vPrime, { ...e });
    }
    for (const e of getUndirectedEdges(trees)) {
      const uPrime = nodeMapping.get(nodeMapKey(index, e.source))!;
      const vPrime = nodeMapping.get(nodeMapKey(index, e.target))!;
      addUndirectedEdge(globalF, uPrime, vPrime, { ...e });
    }
    for (const e of getDirectedEdges(digraph)) {
      const uPrime = nodeMapping.get(nodeMapKey(index, e.source))!;
      const vPrime = nodeMapping.get(nodeMapKey(index, e.target))!;
      addDirectedEdge(baseGlobalD, uPrime, vPrime, { ...e });
    }

    globalRoots[currCol] = nodeMapping.get(nodeMapKey(index, root[0]))!;
    const targetLocal = isNonPivot
      ? xMains[iIdx]
      : zMains[pivotsPerm[jIdx]];
    const targetGlobal = nodeMapping.get(nodeMapKey(index, targetLocal))!;
    globalPrimaryPaths[currCol] = shortestPathUndirected(
      globalF,
      globalRoots[currCol],
      targetGlobal
    );

    if (isNonPivot) {
      iIdx++;
    } else {
      jIdx++;
    }
  }

  const jointPlan = planJointExtraction({
    initialMatching: initialMatchedEdges,
    zCandidates,
    xCandidates,
    edgeGroups,
    baseGraph: baseGlobalG,
    forest: globalF,
    baseDag: baseGlobalD,
    zNodeMapping,
    xNodeMapping,
    zDigraphs,
    xDigraphs,
    maxTrials: customEdgeOrder ? 0 : maxTrials,
    target: reuseTarget,
  });

  const finalMatchedEdges = jointPlan.matchedEdges;

  // Record step-by-step snapshots of Algorithm 1
  const runningG = cloneUndirectedGraph(baseGlobalG);
  const runningD = cloneDirectedGraph(baseGlobalD);
  const stepSnapshots: Algorithm1StepSnapshot[] = [];

  for (let stepIdx = 0; stepIdx < finalMatchedEdges.length; stepIdx++) {
    const [[zGraph, xGraph], [zValue, xValue]] = finalMatchedEdges[stepIdx];
    const zGlobalNode = zNodeMapping.get(nodeMapKey(zGraph, zValue))!;
    const xGlobalNode = xNodeMapping.get(nodeMapKey(xGraph, xValue))!;

    addUndirectedEdge(runningG, zGlobalNode, xGlobalNode, {
      edge_type: 'cnot',
    });
    runningG.nodes.get(zGlobalNode)!.is_mark = false;
    runningG.nodes.get(xGlobalNode)!.is_mark = false;

    if (
      getUndirectedDegree(globalF, zGlobalNode) === 1 &&
      getInDegree(runningD, zGlobalNode) > 0
    ) {
      runningG.nodes.get(zGlobalNode)!.is_flag = true;
    }
    if (
      getUndirectedDegree(globalF, xGlobalNode) === 1 &&
      getInDegree(runningD, xGlobalNode) > 0
    ) {
      runningG.nodes.get(xGlobalNode)!.is_flag = true;
    }

    const zParentGlobalNodes: number[] = [];
    const xParentGlobalNodes: number[] = [];
    const addedDagEdges: Algorithm1StepSnapshot['addedDagEdges'] = [];

    for (const pred of getPredecessors(zDigraphs[zGraph], zValue)) {
      const predGlobal = zNodeMapping.get(nodeMapKey(zGraph, pred))!;
      zParentGlobalNodes.push(predGlobal);
      addDirectedEdge(runningD, predGlobal, xGlobalNode, {
        edge_type: 'cnot',
      });
      addedDagEdges.push({
        source: predGlobal,
        target: xGlobalNode,
        fromSide: 'Z',
      });
    }
    for (const pred of getPredecessors(xDigraphs[xGraph], xValue)) {
      const predGlobal = xNodeMapping.get(nodeMapKey(xGraph, pred))!;
      xParentGlobalNodes.push(predGlobal);
      addDirectedEdge(runningD, predGlobal, zGlobalNode, {
        edge_type: 'cnot',
      });
      addedDagEdges.push({
        source: predGlobal,
        target: zGlobalNode,
        fromSide: 'X',
      });
    }

    const dagGenerations = topologicalGenerations(runningD);
    const dagDepth = dagLongestPathLength(runningD);

    stepSnapshots.push({
      stepIndex: stepIdx,
      logicalEdge: [zGraph, xGraph],
      zSpiderIndex: zGraph,
      xSpiderIndex: xGraph,
      xColumnIndex: nonPivots[xGraph],
      zLocalNode: zValue,
      xLocalNode: xValue,
      zGlobalNode,
      xGlobalNode,
      zParentGlobalNodes,
      xParentGlobalNodes,
      addedGraphEdge: [zGlobalNode, xGlobalNode],
      addedDagEdges,
      dagGenerations,
      dagDepth,
    });
  }

  return {
    N,
    t,
    pivots,
    pivotsPerm,
    nonPivots,
    xSplits,
    xSpiders,
    zSpiders,
    zStates,
    xStates,
    zCandidates,
    xCandidates,
    edgeGroups,
    zNodeMapping,
    xNodeMapping,
    baseGlobalG,
    globalF,
    globalRoots,
    baseGlobalD,
    globalPrimaryPaths,
    matchedEdges: finalMatchedEdges,
    finalG: runningG,
    finalD: runningD,
    nodeOrder: jointPlan.nodeOrder,
    stepSnapshots,
  };
}
