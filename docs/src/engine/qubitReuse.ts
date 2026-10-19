import type {
  BasisType,
  BinaryMatrix,
  CompiledCircuitResult,
  DirectedGraph,
  LogicalLifetime,
  ReuseTargetType,
  ReuseTradeoffPoint,
  RoutingHeuristicType,
  StimInstruction,
  StimTarget,
} from './types';
import {
  addDirectedEdge,
  addDirectedNode,
  createDirectedGraph,
  getAncestors,
  getInDegree,
  getSuccessors,
  isDirectedAcyclicGraph,
  topologicalSort,
} from './catState';
import {
  CatStateExtractor,
  countCircuitMetrics,
  formatQasmCircuit,
  formatStimCircuit,
  getCircuitDepth,
  getCnotDepth,
  MEASUREMENT_GATES,
  RESET_GATES,
  TWO_QUBIT_GATES,
} from './circuitExtraction';
import { resourceTargetScore } from './heuristics';
import { buildGlobalPipelineAndSnapshots } from './spiderLegMatcher';

const TRAILING_ANNOTATIONS = new Set([
  'DETECTOR',
  'OBSERVABLE_INCLUDE',
  'SHIFT_COORDS',
  'QUBIT_COORDS',
]);

interface EventNodeData {
  opName: string;
  targets: number[];
  rawTargets: StimTarget[];
  recordIds: number[];
  gateArgs: number[];
  measurementIds: number[];
}

interface EventProblem {
  dag: DirectedGraph;
  nodeData: Map<number, EventNodeData>;
  annotations: EventNodeData[];
  lifetimes: LogicalLifetime[];
}

export function explodeInstructions(
  instructions: StimInstruction[]
): StimInstruction[] {
  const atomized: StimInstruction[] = [];
  for (const op of instructions) {
    if (TWO_QUBIT_GATES.has(op.name)) {
      for (let k = 0; k < op.targets.length; k += 2) {
        atomized.push({
          name: op.name === 'CNOT' ? 'CX' : op.name,
          targets: op.targets.slice(k, k + 2),
          args: [...op.args],
        });
      }
    } else if (TRAILING_ANNOTATIONS.has(op.name) || op.name === 'TICK') {
      atomized.push({
        name: op.name,
        targets: [...op.targets],
        args: [...op.args],
      });
    } else {
      for (const t of op.targets) {
        atomized.push({
          name: op.name,
          targets: [t],
          args: [...op.args],
        });
      }
    }
  }
  return atomized;
}

/**
 * Matches `build_resource_event_dag` in `spidercss/resource_scheduling.py`.
 */
export function buildResourceEventDag(
  instructions: StimInstruction[],
  nData: number
): EventProblem {
  const dag = createDirectedGraph();
  const nodeData = new Map<number, EventNodeData>();
  const annotations: EventNodeData[] = [];
  const lastOnQubit = new Map<number, number>();
  const measurementNode = new Map<number, number>();
  let measurementCount = 0;
  let nextNode = 0;

  for (const op of explodeInstructions(instructions)) {
    if (op.name === 'TICK') continue;

    const rawTargets = [...op.targets];
    const qubits = rawTargets
      .filter((t) => t.type === 'qubit')
      .map((t) => t.value);
    const recordIds = rawTargets
      .filter((t) => t.type === 'rec')
      .map((t) => measurementCount + t.value);
    const gateArgs = [...op.args];

    const data: EventNodeData = {
      opName: op.name,
      targets: qubits,
      rawTargets,
      recordIds,
      gateArgs,
      measurementIds: [],
    };

    if (TRAILING_ANNOTATIONS.has(op.name)) {
      annotations.push(data);
      continue;
    }

    if (MEASUREMENT_GATES.has(op.name)) {
      data.measurementIds = Array.from(
        { length: qubits.length },
        (_, idx) => measurementCount + idx
      );
    }

    addDirectedNode(dag, nextNode, { id: nextNode });
    nodeData.set(nextNode, data);

    const dependencies = new Set<number>();
    for (const q of qubits) {
      if (lastOnQubit.has(q)) {
        dependencies.add(lastOnQubit.get(q)!);
      }
      lastOnQubit.set(q, nextNode);
    }
    for (const recId of recordIds) {
      const mNode = measurementNode.get(recId);
      if (mNode === undefined) {
        throw new Error(
          `Operation ${op.name} refers to unavailable measurement record ${recId}.`
        );
      }
      dependencies.add(mNode);
    }
    for (const pred of dependencies) {
      addDirectedEdge(dag, pred, nextNode);
    }

    for (const mId of data.measurementIds) {
      measurementNode.set(mId, nextNode);
    }
    measurementCount += data.measurementIds.length;
    nextNode++;
  }

  if (!isDirectedAcyclicGraph(dag)) {
    throw new Error('Circuit dependency graph is cyclic.');
  }

  const topoOrder = topologicalSort(dag);
  const firstNode = new Map<number, number>();
  const lastMeasurement = new Map<number, number>();

  for (const node of topoOrder) {
    const nd = nodeData.get(node)!;
    for (const q of nd.targets) {
      if (!firstNode.has(q)) firstNode.set(q, node);
      if (MEASUREMENT_GATES.has(nd.opName)) {
        lastMeasurement.set(q, node);
      }
    }
  }

  const sortedQubits = Array.from(firstNode.keys()).sort((a, b) => a - b);
  const lifetimes: LogicalLifetime[] = sortedQubits.map((q) => ({
    logicalQubit: q,
    birthNode: firstNode.get(q)!,
    deathNode: q < nData ? null : (lastMeasurement.get(q) ?? null),
  }));

  return { dag, nodeData, annotations, lifetimes };
}

function lifetimePositions(
  lifetimes: LogicalLifetime[],
  order: number[]
): Map<number, [number, number]> {
  const position = new Map<number, number>();
  order.forEach((node, idx) => position.set(node, idx));
  const horizon = order.length;
  const intervals = new Map<number, [number, number]>();

  for (const lt of lifetimes) {
    const start = position.get(lt.birthNode)!;
    const end =
      lt.deathNode === null ? horizon : position.get(lt.deathNode)! + 1;
    intervals.set(lt.logicalQubit, [start, end]);
  }
  return intervals;
}

function scheduleMetrics(
  lifetimes: LogicalLifetime[],
  order: number[]
): { peak: number; activeVolume: number } {
  const intervals = lifetimePositions(lifetimes, order);
  const deltas = new Map<number, number>();
  let activeVolume = 0;

  for (const [start, end] of intervals.values()) {
    deltas.set(start, (deltas.get(start) ?? 0) + 1);
    deltas.set(end, (deltas.get(end) ?? 0) - 1);
    activeVolume += end - start;
  }

  let active = 0;
  let peak = 0;
  for (let pos = 0; pos < order.length; pos++) {
    active += deltas.get(pos) ?? 0;
    if (active > peak) peak = active;
  }
  return { peak, activeVolume };
}

/**
 * Matches `decross_greedy_resource_order` in `spidercss/resource_scheduling.py`.
 */
export function decrossGreedyResourceOrder(
  problem: EventProblem
): number[] {
  const { dag, nodeData, lifetimes } = problem;
  const cone = new Map<number, Set<number>>();
  const inputsInCone = new Map<number, Set<number>>();
  const birthToQubit = new Map<number, number>();
  for (const lt of lifetimes) {
    birthToQubit.set(lt.birthNode, lt.logicalQubit);
  }

  for (const lt of lifetimes) {
    let c: Set<number>;
    if (lt.deathNode !== null) {
      c = getAncestors(dag, lt.deathNode);
      c.add(lt.deathNode);
    } else {
      c = new Set<number>();
      for (const [node, data] of nodeData.entries()) {
        if (data.targets.includes(lt.logicalQubit)) {
          c.add(node);
          for (const anc of getAncestors(dag, node)) {
            c.add(anc);
          }
        }
      }
    }
    cone.set(lt.logicalQubit, c);
    const inCone = new Set<number>();
    for (const n of c) {
      if (birthToQubit.has(n)) inCone.add(n);
    }
    inputsInCone.set(lt.logicalQubit, inCone);
  }

  const orderedLifetimes: number[] = [];
  const remainingLifetimes = new Set<number>(
    lifetimes.map((lt) => lt.logicalQubit)
  );
  const scheduledInputs = new Set<number>();

  while (remainingLifetimes.size > 0) {
    const sortedRem = Array.from(remainingLifetimes).sort((a, b) => a - b);
    let bestQ = sortedRem[0];
    let bestNewInputs = Number.POSITIVE_INFINITY;

    for (const q of sortedRem) {
      let newInputs = 0;
      for (const n of inputsInCone.get(q)!) {
        if (!scheduledInputs.has(n)) newInputs++;
      }
      if (newInputs < bestNewInputs) {
        bestNewInputs = newInputs;
        bestQ = q;
      }
    }

    orderedLifetimes.push(bestQ);
    for (const n of inputsInCone.get(bestQ)!) {
      scheduledInputs.add(n);
    }
    remainingLifetimes.delete(bestQ);
  }

  const order: number[] = [];
  const scheduledNodes = new Set<number>();
  const inDegree = new Map<number, number>();
  const readyNodes = new Set<number>();

  for (const node of dag.nodes.keys()) {
    const deg = getInDegree(dag, node);
    inDegree.set(node, deg);
    if (deg === 0) readyNodes.add(node);
  }

  for (const q of orderedLifetimes) {
    const c = cone.get(q)!;
    const unscheduledInC = new Set<number>();
    for (const n of c) {
      if (!scheduledNodes.has(n)) unscheduledInC.add(n);
    }

    while (unscheduledInC.size > 0) {
      let bestNode = -1;
      for (const n of readyNodes) {
        if (unscheduledInC.has(n) && (bestNode === -1 || n < bestNode)) {
          bestNode = n;
        }
      }
      if (bestNode === -1) {
        throw new Error('Cycle or missing dependency in causal cone scheduling.');
      }

      readyNodes.delete(bestNode);
      unscheduledInC.delete(bestNode);
      scheduledNodes.add(bestNode);
      order.push(bestNode);

      for (const succ of getSuccessors(dag, bestNode)) {
        const nextDeg = inDegree.get(succ)! - 1;
        inDegree.set(succ, nextDeg);
        if (nextDeg === 0) readyNodes.add(succ);
      }
    }
  }

  while (readyNodes.size > 0) {
    const bestNode = Math.min(...Array.from(readyNodes));
    readyNodes.delete(bestNode);
    scheduledNodes.add(bestNode);
    order.push(bestNode);

    for (const succ of getSuccessors(dag, bestNode)) {
      const nextDeg = inDegree.get(succ)! - 1;
      inDegree.set(succ, nextDeg);
      if (nextDeg === 0) readyNodes.add(succ);
    }
  }

  return order;
}

/**
 * Optimally colors the fixed lifetime intervals using a left-edge scan.
 * Matches `allocate_interval_qubits` in `spidercss/resource_scheduling.py`.
 */
export function allocateIntervalQubits(
  lifetimes: LogicalLifetime[],
  order: number[],
  nData: number
): { logicalToPhysical: Record<number, number>; numColors: number } {
  const intervals = lifetimePositions(lifetimes, order);
  const ordered = Array.from(intervals.entries())
    .map(([q, [start, end]]) => ({ start, end, q }))
    .sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      if (a.end !== b.end) return a.end - b.end;
      return a.q - b.q;
    });

  const active: Array<{ end: number; color: number }> = [];
  const available: number[] = [];
  const logicalToColor = new Map<number, number>();
  let nextColor = 0;

  for (const { start, end, q } of ordered) {
    active.sort((a, b) => a.end - b.end || a.color - b.color);
    while (active.length > 0 && active[0].end <= start) {
      const released = active.shift()!;
      available.push(released.color);
    }
    available.sort((a, b) => a - b);

    let color: number;
    if (available.length > 0) {
      color = available.shift()!;
    } else {
      color = nextColor;
      nextColor++;
    }
    logicalToColor.set(q, color);
    active.push({ end, color });
  }

  const colorToPhysical = new Map<number, number>();
  for (let q = 0; q < nData; q++) {
    const color = logicalToColor.get(q);
    if (color === undefined) {
      throw new Error(`Missing output data qubit ${q} from scheduled circuit.`);
    }
    colorToPhysical.set(color, q);
  }

  let nextAncilla = nData;
  for (let color = 0; color < nextColor; color++) {
    if (!colorToPhysical.has(color)) {
      colorToPhysical.set(color, nextAncilla);
      nextAncilla++;
    }
  }

  const logicalToPhysical: Record<number, number> = {};
  for (const [logical, color] of logicalToColor.entries()) {
    logicalToPhysical[logical] = colorToPhysical.get(color)!;
  }

  return { logicalToPhysical, numColors: nextColor };
}

function mappingFromMergeLinks(
  lifetimes: LogicalLifetime[],
  nData: number,
  mergeLinks: Array<[number, number]>
): { mapping: Record<number, number>; width: number } {
  const logicalQubits = lifetimes.map((lt) => lt.logicalQubit);
  const parent = new Map<number, number>();
  for (const q of logicalQubits) parent.set(q, q);

  const find = (q: number): number => {
    let cur = q;
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!;
      parent.set(cur, parent.get(p)!);
      cur = parent.get(cur)!;
    }
    return cur;
  };

  for (const [first, second] of mergeLinks) {
    const r1 = find(first);
    const r2 = find(second);
    if (r1 !== r2) parent.set(r2, r1);
  }

  const components = new Map<number, number[]>();
  for (const q of logicalQubits) {
    const r = find(q);
    if (!components.has(r)) components.set(r, []);
    components.get(r)!.push(q);
  }

  const componentToPhysical = new Map<number, number>();
  for (const [root, comp] of components.entries()) {
    const dataQubits = comp.filter((q) => q < nData);
    if (dataQubits.length > 0) {
      componentToPhysical.set(root, dataQubits[0]);
    }
  }

  const sortedComps = Array.from(components.entries()).sort(
    (a, b) => Math.min(...a[1]) - Math.min(...b[1])
  );
  let nextAncilla = nData;
  for (const [root] of sortedComps) {
    if (!componentToPhysical.has(root)) {
      componentToPhysical.set(root, nextAncilla);
      nextAncilla++;
    }
  }

  const mapping: Record<number, number> = {};
  for (const q of logicalQubits) {
    mapping[q] = componentToPhysical.get(find(q))!;
  }
  return { mapping, width: components.size };
}

function reuseChainLinks(
  lifetimes: LogicalLifetime[],
  order: number[],
  minimumMapping: Record<number, number>
): Array<{ gap: number; previous: number; following: number }> {
  const intervals = lifetimePositions(lifetimes, order);
  const chains = new Map<number, number[]>();

  for (const [logicalStr, physical] of Object.entries(minimumMapping)) {
    const logical = Number(logicalStr);
    if (!chains.has(physical)) chains.set(physical, []);
    chains.get(physical)!.push(logical);
  }

  const links: Array<{ gap: number; previous: number; following: number }> = [];
  for (const chain of chains.values()) {
    chain.sort((a, b) => {
      const ia = intervals.get(a)!;
      const ib = intervals.get(b)!;
      return ia[0] - ib[0] || ia[1] - ib[1];
    });
    for (let i = 0; i < chain.length - 1; i++) {
      const prev = chain[i];
      const next = chain[i + 1];
      const gap = intervals.get(next)![0] - intervals.get(prev)![1];
      links.push({ gap, previous: prev, following: next });
    }
  }
  return links;
}

function cnotDepthForMapping(
  problem: EventProblem,
  order: number[],
  logicalToPhysical: Record<number, number>
): number {
  const nextFreeLayer = new Map<number, number>();
  let maxLayer = -1;

  for (const node of order) {
    const data = problem.nodeData.get(node)!;
    if (!TWO_QUBIT_GATES.has(data.opName)) continue;
    if (
      data.rawTargets.length !== 2 ||
      !data.rawTargets.every((t) => t.type === 'qubit')
    ) {
      continue;
    }
    const first = logicalToPhysical[data.targets[0]];
    const second = logicalToPhysical[data.targets[1]];
    const layer = Math.max(
      nextFreeLayer.get(first) ?? 0,
      nextFreeLayer.get(second) ?? 0
    );
    nextFreeLayer.set(first, layer + 1);
    nextFreeLayer.set(second, layer + 1);
    if (layer > maxLayer) maxLayer = layer;
  }

  return maxLayer + 1;
}

function buildReuseFrontier(
  problem: EventProblem,
  order: number[],
  lifetimes: LogicalLifetime[],
  nData: number,
  minimumMapping: Record<number, number>
): {
  candidates: ReuseTradeoffPoint[];
  orderedLinks: Array<[number, number]>;
} {
  const { mapping: noReuseMapping, width: noReuseWidth } =
    mappingFromMergeLinks(lifetimes, nData, []);
  const baselineDepth = cnotDepthForMapping(problem, order, noReuseMapping);
  const candidates: ReuseTradeoffPoint[] = [
    {
      numQubits: noReuseWidth,
      cnotDepth: baselineDepth,
      numReuseMerges: 0,
    },
  ];

  const measuredLinks: Array<{
    depthDelta: number;
    gap: number;
    previous: number;
    following: number;
  }> = [];

  for (const { gap, previous, following } of reuseChainLinks(
    lifetimes,
    order,
    minimumMapping
  )) {
    const { mapping } = mappingFromMergeLinks(lifetimes, nData, [
      [previous, following],
    ]);
    const depth = cnotDepthForMapping(problem, order, mapping);
    measuredLinks.push({
      depthDelta: depth - baselineDepth,
      gap,
      previous,
      following,
    });
  }

  measuredLinks.sort(
    (a, b) =>
      a.depthDelta - b.depthDelta ||
      a.gap - b.gap ||
      a.previous - b.previous ||
      a.following - b.following
  );

  const selectedLinks: Array<[number, number]> = [];
  for (const { previous, following } of measuredLinks) {
    selectedLinks.push([previous, following]);
    const { mapping, width } = mappingFromMergeLinks(
      lifetimes,
      nData,
      selectedLinks
    );
    candidates.push({
      numQubits: width,
      cnotDepth: cnotDepthForMapping(problem, order, mapping),
      numReuseMerges: selectedLinks.length,
    });
  }

  return {
    candidates,
    orderedLinks: measuredLinks.map((m) => [m.previous, m.following]),
  };
}

function remapTargets(
  rawTargets: StimTarget[],
  recordIds: number[],
  logicalToPhysical: Record<number, number>,
  oldToNewMeasurement: Map<number, number>,
  nextMeasurement: number
): StimTarget[] {
  let recCursor = 0;
  return rawTargets.map((target) => {
    if (target.type === 'qubit') {
      return {
        type: 'qubit',
        value: logicalToPhysical[target.value] ?? target.value,
      };
    }
    const originalId = recordIds[recCursor++];
    const newMeas = oldToNewMeasurement.get(originalId);
    if (newMeas === undefined) {
      throw new Error(
        `Measurement record ${originalId} has not been scheduled yet.`
      );
    }
    return {
      type: 'rec',
      value: newMeas - nextMeasurement,
    };
  });
}

function emitScheduledCircuit(
  problem: EventProblem,
  order: number[],
  logicalToPhysical: Record<number, number>
): StimInstruction[] {
  const instructions: StimInstruction[] = [];
  const oldToNewMeasurement = new Map<number, number>();
  let nextMeasurement = 0;

  for (const node of order) {
    const data = problem.nodeData.get(node)!;
    const targets = remapTargets(
      data.rawTargets,
      data.recordIds,
      logicalToPhysical,
      oldToNewMeasurement,
      nextMeasurement
    );
    instructions.push({
      name: data.opName,
      targets,
      args: [...data.gateArgs],
    });
    for (const origId of data.measurementIds) {
      oldToNewMeasurement.set(origId, nextMeasurement);
      nextMeasurement++;
    }
  }

  for (const data of problem.annotations) {
    const targets = remapTargets(
      data.rawTargets,
      data.recordIds,
      logicalToPhysical,
      oldToNewMeasurement,
      nextMeasurement
    );
    instructions.push({
      name: data.opName,
      targets,
      args: [...data.gateArgs],
    });
  }

  return instructions;
}

/**
 * Matches `plan_resource_aware_reuse` in `spidercss/resource_scheduling.py`.
 */
export function planResourceAwareReuse(
  baseInstructions: StimInstruction[],
  nData: number,
  heuristic: 'naive' | 'decross_greedy' = 'decross_greedy',
  target: ReuseTargetType = 'qubits'
): CompiledCircuitResult {
  const problem = buildResourceEventDag(baseInstructions, nData);
  const order =
    heuristic === 'naive'
      ? Array.from({ length: problem.dag.nodes.size }, (_, i) => i)
      : decrossGreedyResourceOrder(problem);

  const { activeVolume } = scheduleMetrics(problem.lifetimes, order);
  const { logicalToPhysical: minimumMapping, numColors: minimumQubits } =
    allocateIntervalQubits(problem.lifetimes, order, nData);

  let selectedMapping: Record<number, number>;
  let selectedCandidate: ReuseTradeoffPoint;
  let candidates: ReuseTradeoffPoint[];

  if (target === 'None') {
    const noReuseMap: Record<number, number> = {};
    let nextAncilla = nData;
    for (let q = 0; q < problem.lifetimes.length; q++) {
      if (q < nData) {
        noReuseMap[q] = q;
      } else {
        noReuseMap[q] = nextAncilla;
        nextAncilla++;
      }
    }
    const cnotDepth = cnotDepthForMapping(problem, order, noReuseMap);
    selectedCandidate = {
      numQubits: problem.lifetimes.length,
      cnotDepth,
      numReuseMerges: 0,
    };
    candidates = [selectedCandidate];
    selectedMapping = noReuseMap;
  } else if (target === 'qubits') {
    selectedMapping = minimumMapping;
    const cnotDepth = cnotDepthForMapping(problem, order, selectedMapping);
    selectedCandidate = {
      numQubits: minimumQubits,
      cnotDepth,
      numReuseMerges: problem.lifetimes.length - minimumQubits,
    };
    candidates = [selectedCandidate];
  } else {
    const frontier = buildReuseFrontier(
      problem,
      order,
      problem.lifetimes,
      nData,
      minimumMapping
    );
    candidates = frontier.candidates;

    let bestCand = candidates[0];
    let bestScore = resourceTargetScore(
      target,
      bestCand.numQubits,
      bestCand.cnotDepth,
      activeVolume
    );
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i];
      const s = resourceTargetScore(
        target,
        c.numQubits,
        c.cnotDepth,
        activeVolume
      );
      let isBetter = false;
      for (let k = 0; k < s.length; k++) {
        if (s[k] !== bestScore[k]) {
          isBetter = s[k] < bestScore[k];
          break;
        }
      }
      if (isBetter) {
        bestCand = c;
        bestScore = s;
      }
    }

    selectedCandidate = bestCand;
    const { mapping } = mappingFromMergeLinks(
      problem.lifetimes,
      nData,
      frontier.orderedLinks.slice(0, selectedCandidate.numReuseMerges)
    );
    selectedMapping = mapping;
  }

  const scheduledInstructions = emitScheduledCircuit(
    problem,
    order,
    selectedMapping
  );
  const { numCx, numMeasurements } = countCircuitMetrics(scheduledInstructions);
  const cnotDepth = getCnotDepth(scheduledInstructions);
  const circuitDepth = getCircuitDepth(scheduledInstructions);
  const stimText = formatStimCircuit(scheduledInstructions);
  const qasmText = formatQasmCircuit(
    scheduledInstructions,
    selectedCandidate.numQubits,
    numMeasurements
  );

  return {
    instructions: scheduledInstructions,
    stimText,
    qasmText,
    numQubits: selectedCandidate.numQubits,
    numDataQubits: nData,
    numFlagMeasurements: numMeasurements,
    numCx,
    cnotDepth,
    circuitDepth,
    activeVolume,
    reuseTarget: target,
    logicalToPhysical: selectedMapping,
    lifetimes: problem.lifetimes,
    tradeoffFrontier: candidates,
  };
}

/**
 * End-to-end compilation matching `cat_at_origin` in `spidercss/cat_at_origin.py`.
 * Supports switching between the 3 post-extraction Qubit Reuse options:
 * - `'None'` (No Qubit Reuse)
 * - `'depth'` (Optimize Depth)
 * - `'qubits'` (Minimize Simultaneous Qubits)
 */
export function compileFromGlobalPipeline(
  pipeline: ReturnType<typeof buildGlobalPipelineAndSnapshots>,
  reuseTarget: ReuseTargetType = 'None'
): CompiledCircuitResult {
  const extractor = new CatStateExtractor();
  const baseInstructions = extractor.extract(
    pipeline.finalG,
    pipeline.globalF,
    pipeline.globalRoots,
    pipeline.finalD,
    pipeline.globalPrimaryPaths,
    pipeline.nodeOrder
  );

  if (reuseTarget === 'None') {
    return planResourceAwareReuse(baseInstructions, pipeline.N, 'naive', 'None');
  }
  if (reuseTarget === 'depth') {
    return planResourceAwareReuse(
      baseInstructions,
      pipeline.N,
      'naive',
      'qubits'
    );
  }
  return planResourceAwareReuse(
    baseInstructions,
    pipeline.N,
    'decross_greedy',
    'qubits'
  );
}

export function catAtOrigin(params: {
  H: BinaryMatrix;
  d: number;
  basis?: BasisType;
  analyzeHookErrors?: boolean;
  reuseTarget?: ReuseTargetType;
  routingHeuristic?: RoutingHeuristicType;
  seed?: number;
}): CompiledCircuitResult {
  const {
    H,
    d,
    basis = 'Z',
    analyzeHookErrors = false,
    reuseTarget = 'None',
    routingHeuristic = 'sa_sequence_distance',
    seed = 42,
  } = params;

  const pipeline = buildGlobalPipelineAndSnapshots({
    H,
    d,
    basis,
    analyzeHookErrors,
    routingHeuristic,
    reuseTarget,
    seed,
  });

  return compileFromGlobalPipeline(pipeline, reuseTarget);
}
