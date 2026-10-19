import type {
  BasisType,
  DirectedGraph,
  StimInstruction,
  StimTarget,
  UndirectedGraph,
} from './types';
import {
  ed,
  getUndirectedDegree,
  getUndirectedNeighbors,
  hasUndirectedEdge,
  topologicalGenerations,
} from './catState';

export const TWO_QUBIT_GATES = new Set([
  'CX',
  'CNOT',
  'CZ',
  'SWAP',
  'CY',
  'XCZ',
  'YCX',
]);
export const Z_MEASUREMENTS = new Set(['MR', 'M', 'MZ']);
export const X_MEASUREMENTS = new Set(['MX']);
export const MEASUREMENT_GATES = new Set([
  'M',
  'MX',
  'MY',
  'MZ',
  'MR',
  'MRX',
  'MRY',
]);
export const RESET_GATES = new Set(['R', 'RX', 'RY', 'MR', 'MRX', 'MRY']);
export const SPECIAL_GATES = new Set([
  'DETECTOR',
  'OBSERVABLE_INCLUDE',
  'SHIFT_COORDS',
  'QUBIT_COORDS',
  'TICK',
]);

export function edKey(u: number, v: number): string {
  const [a, b] = ed(u, v);
  return `${a}:${b}`;
}

export class StimCircuitBuilder {
  public instructions: StimInstruction[] = [];
  public measCount = 0;

  addH(q: number): void {
    this.instructions.push({
      name: 'H',
      targets: [{ type: 'qubit', value: q }],
      args: [],
    });
  }

  addCnot(c: number, t: number): void {
    this.instructions.push({
      name: 'CNOT',
      targets: [
        { type: 'qubit', value: c },
        { type: 'qubit', value: t },
      ],
      args: [],
    });
  }

  initAncilla(q: number, basis: BasisType): void {
    this.instructions.push({
      name: basis === 'X' ? 'RX' : 'R',
      targets: [{ type: 'qubit', value: q }],
      args: [],
    });
  }

  postSelect(q: number, basis: BasisType): number {
    this.instructions.push({
      name: basis === 'X' ? 'MX' : 'M',
      targets: [{ type: 'qubit', value: q }],
      args: [],
    });
    const idx = this.measCount;
    this.measCount += 1;
    return idx;
  }

  addFeedbackX(measIdx: number, targetQubit: number): void {
    const offset = measIdx - this.measCount;
    this.instructions.push({
      name: 'CX',
      targets: [
        { type: 'rec', value: offset },
        { type: 'qubit', value: targetQubit },
      ],
      args: [],
    });
  }

  addDetector(...measIndices: number[]): void {
    const targets: StimTarget[] = measIndices.map((mIdx) => ({
      type: 'rec',
      value: mIdx - this.measCount,
    }));
    this.instructions.push({
      name: 'DETECTOR',
      targets,
      args: [],
    });
  }

  tick(): void {
    this.instructions.push({
      name: 'TICK',
      targets: [],
      args: [],
    });
  }

  getInstructions(): StimInstruction[] {
    return this.instructions;
  }
}

/**
 * Exact port of `CatStateExtractor` from `spidercss/circuit_extraction.py`.
 */
export class CatStateExtractor {
  private builder: StimCircuitBuilder;
  public nodeToQubit = new Map<number, number>();
  public edgeToFlagQubit = new Map<string, number>();
  public flagSpiderTypes = new Map<number, BasisType>();
  public treeToQubits = new Map<number, Set<number>>();
  public nodeToTree = new Map<number, number>();
  public linkMeasurements = new Map<string, number[]>();
  public flagMeasurements: Array<[number, number, number]> = [];
  public depths = new Map<number, number>();
  public branchMarkValues = new Map<number, number>();
  public dataFlags: number[] = [];

  private queue: Array<[number, number, number]> = [];
  private processedCnots = new Set<string>();
  private primaryPaths = new Map<number, number[]>();
  private nodeOrder: Array<number | 'TICK'> = [];
  private nextDataIdx = 0;
  private nextFlagIdx = 0;

  constructor(builder?: StimCircuitBuilder) {
    this.builder = builder ?? new StimCircuitBuilder();
  }

  private getNewDataQubit(): number {
    const q = this.nextDataIdx;
    this.nextDataIdx += 1;
    return q;
  }

  private getNewFlagQubit(): number {
    const q = this.nextFlagIdx;
    this.nextFlagIdx += 1;
    return q;
  }

  private computeDepth(
    node: number,
    parent: number | null,
    F: UndirectedGraph
  ): number {
    const children = getUndirectedNeighbors(F, node).filter(
      (nbr) => nbr !== parent
    );
    if (children.length === 0) {
      this.depths.set(node, 0);
      return 0;
    }
    let minD = Number.POSITIVE_INFINITY;
    for (const child of children) {
      const childDepth = this.computeDepth(child, node, F);
      minD = Math.min(minD, 1 + childDepth);
    }
    this.depths.set(node, minD);
    return minD;
  }

  private computeBranchMarkingValues(
    node: number,
    parent: number | null,
    G: UndirectedGraph,
    F: UndirectedGraph
  ): number {
    const children = getUndirectedNeighbors(F, node).filter(
      (nbr) => nbr !== parent
    );
    let childrenMarkValue = 0;
    for (const child of children) {
      childrenMarkValue += this.computeBranchMarkingValues(child, node, G, F);
    }
    const markValue = G.nodes.get(node)?.is_mark ? 1 : 0;
    const total = childrenMarkValue + markValue;
    this.branchMarkValues.set(node, total);
    return total;
  }

  extract(
    G: UndirectedGraph,
    F: UndirectedGraph,
    roots: Record<number, number>,
    dependencyGraph: DirectedGraph | null = null,
    primaryPaths: Record<number, number[]> | null = null,
    nodeOrder: number[] | null = null
  ): StimInstruction[] {
    let N = 0;
    for (const nData of G.nodes.values()) {
      if (nData.is_mark) N++;
    }

    this.nextDataIdx = 0;
    this.nextFlagIdx = N;

    if (nodeOrder !== null) {
      this.nodeOrder = [...nodeOrder];
    } else if (dependencyGraph !== null) {
      const gens = topologicalGenerations(dependencyGraph);
      this.nodeOrder = [];
      for (const gen of gens) {
        this.nodeOrder.push(...gen, 'TICK');
      }
    } else {
      this.nodeOrder = [];
    }

    const sortedRootEntries = Object.entries(roots)
      .map(([k, v]) => [Number(k), v] as [number, number])
      .sort((a, b) => a[0] - b[0]);

    for (const [, root] of sortedRootEntries) {
      this.computeDepth(root, null, F);
      this.computeBranchMarkingValues(root, null, G, F);
    }

    this.primaryPaths.clear();
    if (primaryPaths !== null) {
      for (const [treeIdStr, ls] of Object.entries(primaryPaths)) {
        this.primaryPaths.set(Number(treeIdStr), ls.slice(1));
      }
    }

    this.growTreeBfs(sortedRootEntries, G, F);
    this.generateDetectors();
    this.generateFeedback();

    return this.builder.getInstructions();
  }

  private initRoots(
    G: UndirectedGraph,
    sortedRootEntries: Array<[number, number]>
  ): void {
    for (const [treeId, rootNode] of sortedRootEntries) {
      const rootQubit = this.getNewDataQubit();
      const spiderType: BasisType = G.nodes.get(rootNode)?.spider_type ?? 'Z';
      this.builder.initAncilla(rootQubit, spiderType === 'Z' ? 'X' : 'Z');

      this.nodeToQubit.set(rootNode, rootQubit);
      if (!this.treeToQubits.has(treeId)) {
        this.treeToQubits.set(treeId, new Set());
      }
      this.treeToQubits.get(treeId)!.add(rootQubit);
      this.nodeToTree.set(rootNode, treeId);

      this.queue.push([treeId, rootNode, rootQubit]);
    }
  }

  private popNextFromQueue(): [number, number, number] {
    let popIndex = 0;
    if (this.nodeOrder.length > 0) {
      let nodeToProcess = this.nodeOrder.shift()!;
      while (nodeToProcess === 'TICK' && this.nodeOrder.length > 0) {
        this.builder.tick();
        nodeToProcess = this.nodeOrder.shift()!;
      }
      if (nodeToProcess !== 'TICK') {
        const idx = this.queue.findIndex(([, n]) => n === nodeToProcess);
        if (idx >= 0) {
          popIndex = idx;
        }
      }
    }
    const [treeId, node, currentQubit] = this.queue.splice(popIndex, 1)[0];
    return [currentQubit, node, treeId];
  }

  private splitPrimarySecondaries(
    children: number[]
  ): [number, number[]] {
    if (this.primaryPaths.size > 0) {
      for (const path of this.primaryPaths.values()) {
        if (path.length > 0 && children.includes(path[0])) {
          const primary = path.shift()!;
          const secondaries = children.filter((c) => c !== primary);
          return [primary, secondaries];
        }
      }
    }
    const sorted = [...children].sort(
      (a, b) => (this.depths.get(a) ?? 0) - (this.depths.get(b) ?? 0)
    );
    const primary = sorted[sorted.length - 1];
    const secondaries = sorted.slice(0, sorted.length - 1);
    return [primary, secondaries];
  }

  private growTreeBfs(
    sortedRootEntries: Array<[number, number]>,
    G: UndirectedGraph,
    F: UndirectedGraph
  ): void {
    this.initRoots(G, sortedRootEntries);
    this.builder.tick();

    while (this.queue.length > 0) {
      const [currentQubit, node, treeId] = this.popNextFromQueue();
      this.nodeToTree.set(node, treeId);

      const treeChildren = getUndirectedNeighbors(F, node).filter(
        (n) => !this.nodeToQubit.has(n)
      );
      const nonTreeChildren = getUndirectedNeighbors(G, node).filter(
        (n) => !hasUndirectedEdge(F, node, n)
      );
      const nodeData = G.nodes.get(node);
      const isMark = Boolean(nodeData?.is_mark);
      const isFlagNode = Boolean(nodeData?.is_flag);

      for (const child of nonTreeChildren) {
        const edgeKeyStr = edKey(node, child);
        const edgeData = G.adj.get(node)?.get(child);
        const isCnotEdge = edgeData?.edge_type === 'cnot';

        if (isCnotEdge) {
          this.processCnotEdge(G, node, child, edgeKeyStr);
        } else if (this.edgeToFlagQubit.has(edgeKeyStr)) {
          this.closeFlag(G, node, child, edgeKeyStr);
        } else if (isFlagNode) {
          this.takeRoleOfFlag(G, node, edgeKeyStr);
        } else {
          this.initializeFlag(G, F, node, child);
        }
      }

      if (isFlagNode) {
        continue;
      }

      if (treeChildren.length === 0) {
        continue;
      }

      if (isMark) {
        this.spawnMarkCnot(G, node);
      }

      const [primary, secondaries] =
        this.splitPrimarySecondaries(treeChildren);

      for (const child of secondaries) {
        this.processBranching(G, node, child);
      }

      for (const child of secondaries) {
        this.queue.push([treeId, child, this.nodeToQubit.get(child)!]);
      }
      this.queue.push([treeId, primary, currentQubit]);

      this.nodeToTree.set(primary, treeId);
      this.nodeToQubit.set(primary, currentQubit);
      this.treeToQubits.get(treeId)!.add(currentQubit);
    }
  }

  private initializeFlag(
    G: UndirectedGraph,
    F: UndirectedGraph,
    node: number,
    child: number
  ): void {
    const currentQubit = this.nodeToQubit.get(node)!;
    const spiderType: BasisType = G.nodes.get(node)?.spider_type ?? 'Z';
    const treeId = this.nodeToTree.get(node)!;

    const flagQubit = this.getNewFlagQubit();
    const [c, n] =
      spiderType === 'Z'
        ? [currentQubit, flagQubit]
        : [flagQubit, currentQubit];
    this.builder.initAncilla(flagQubit, spiderType);
    this.builder.addCnot(c, n);
    this.flagSpiderTypes.set(flagQubit, spiderType);

    let current: number = child;
    let previous: number = node;

    while (current !== undefined && getUndirectedDegree(F, current) === 0) {
      const newQ = this.getNewDataQubit();
      const markSpiderType: BasisType =
        G.nodes.get(current)?.spider_type ?? 'Z';

      this.builder.initAncilla(newQ, markSpiderType);
      const [cMark, nMark] =
        spiderType === 'Z' ? [flagQubit, newQ] : [newQ, flagQubit];
      this.builder.addCnot(cMark, nMark);

      this.treeToQubits.get(treeId)!.add(newQ);
      this.nodeToTree.set(current, treeId);

      const neighbors = getUndirectedNeighbors(G, current).filter(
        (nbr) => nbr !== previous
      );
      if (neighbors.length === 0) break;
      previous = current;
      current = neighbors[0];
    }

    const finalEdgeKey = edKey(previous, current);
    this.edgeToFlagQubit.set(finalEdgeKey, flagQubit);
    this.treeToQubits.get(treeId)!.add(flagQubit);
  }

  private processBranching(
    G: UndirectedGraph,
    node: number,
    child: number
  ): void {
    const currentQubit = this.nodeToQubit.get(node)!;
    const spiderType: BasisType = G.nodes.get(node)?.spider_type ?? 'Z';
    const treeId = this.nodeToTree.get(node)!;

    const newQ =
      (this.branchMarkValues.get(child) ?? 0) > 0
        ? this.getNewDataQubit()
        : this.getNewFlagQubit();

    this.builder.initAncilla(newQ, spiderType);
    const [c, n] =
      spiderType === 'Z' ? [currentQubit, newQ] : [newQ, currentQubit];
    this.builder.addCnot(c, n);

    this.nodeToQubit.set(child, newQ);
    this.treeToQubits.get(treeId)!.add(newQ);
    this.nodeToTree.set(child, treeId);
  }

  private spawnMarkCnot(G: UndirectedGraph, node: number): void {
    const currentQubit = this.nodeToQubit.get(node)!;
    const spiderType: BasisType = G.nodes.get(node)?.spider_type ?? 'Z';
    const treeId = this.nodeToTree.get(node)!;

    const newQ = this.getNewDataQubit();
    this.builder.initAncilla(newQ, spiderType);
    const [c, n] =
      spiderType === 'Z' ? [currentQubit, newQ] : [newQ, currentQubit];
    this.builder.addCnot(c, n);
    this.treeToQubits.get(treeId)!.add(newQ);
  }

  private processCnotEdge(
    G: UndirectedGraph,
    currentNode: number,
    otherNode: number,
    edgeKeyStr: string
  ): void {
    if (this.processedCnots.has(edgeKeyStr)) return;
    const currentQubit = this.nodeToQubit.get(currentNode)!;
    const otherQubit = this.nodeToQubit.get(otherNode)!;
    const currentSpiderType: BasisType =
      G.nodes.get(currentNode)?.spider_type ?? 'Z';

    const [c, n] =
      currentSpiderType === 'Z'
        ? [currentQubit, otherQubit]
        : [otherQubit, currentQubit];
    this.builder.addCnot(c, n);
    this.processedCnots.add(edgeKeyStr);
  }

  private takeRoleOfFlag(
    G: UndirectedGraph,
    node: number,
    edgeKeyStr: string
  ): void {
    const currentQubit = this.nodeToQubit.get(node)!;
    const spiderType: BasisType = G.nodes.get(node)?.spider_type ?? 'Z';
    this.edgeToFlagQubit.set(edgeKeyStr, currentQubit);
    this.flagSpiderTypes.set(currentQubit, spiderType);
    this.dataFlags.push(currentQubit);
  }

  private closeFlag(
    _G: UndirectedGraph,
    currentNode: number,
    otherNode: number,
    edgeKeyStr: string
  ): void {
    const currentQubit = this.nodeToQubit.get(currentNode)!;
    const flagQubit = this.edgeToFlagQubit.get(edgeKeyStr)!;
    const flagSpiderType = this.flagSpiderTypes.get(flagQubit) ?? 'Z';

    const [c, n] =
      flagSpiderType === 'Z'
        ? [currentQubit, flagQubit]
        : [flagQubit, currentQubit];
    this.builder.addCnot(c, n);
    const mIdx = this.builder.postSelect(flagQubit, flagSpiderType);
    this.flagMeasurements.push([currentNode, otherNode, mIdx]);
  }

  private generateDetectors(): void {
    for (const [currentNode, otherNode, mIdx] of this.flagMeasurements) {
      const t1 = this.nodeToTree.get(currentNode)!;
      const t2 = this.nodeToTree.get(otherNode)!;
      if (t1 === t2) {
        this.builder.addDetector(mIdx);
      } else {
        const k = edKey(t1, t2);
        if (!this.linkMeasurements.has(k)) this.linkMeasurements.set(k, []);
        this.linkMeasurements.get(k)!.push(mIdx);
      }
    }

    for (const indices of this.linkMeasurements.values()) {
      for (let i = 0; i < indices.length - 1; i++) {
        this.builder.addDetector(indices[i], indices[i + 1]);
      }
    }
  }

  private generateFeedback(): void {
    if (this.linkMeasurements.size === 0) return;
    // Build meta graph over trees
    const adj = new Map<number, Map<number, number>>();
    for (const [k, idxs] of this.linkMeasurements.entries()) {
      const [uStr, vStr] = k.split(':');
      const u = Number(uStr);
      const v = Number(vStr);
      if (!adj.has(u)) adj.set(u, new Map());
      if (!adj.has(v)) adj.set(v, new Map());
      adj.get(u)!.set(v, idxs[0]);
      adj.get(v)!.set(u, idxs[0]);
    }
    const nodes = Array.from(adj.keys()).sort((a, b) => a - b);
    if (nodes.length === 0) return;
    const root = nodes[0];
    const preds = new Map<number, number>();
    const visited = new Set<number>([root]);
    const queue: number[] = [root];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const nbr of adj.get(cur)?.keys() ?? []) {
        if (!visited.has(nbr)) {
          visited.add(nbr);
          preds.set(nbr, cur);
          queue.push(nbr);
        }
      }
    }

    for (const t of nodes) {
      if (t === root || !preds.has(t)) continue;
      const pathMs: number[] = [];
      let cur = t;
      while (cur !== root) {
        const p = preds.get(cur)!;
        pathMs.push(adj.get(p)!.get(cur)!);
        cur = p;
      }
      for (const m of pathMs) {
        for (const q of this.treeToQubits.get(t) ?? []) {
          this.builder.addFeedbackX(m, q);
        }
      }
    }
  }
}

/**
 * Computes ASAP two-qubit CNOT depth matching `get_cnot_depth` in `spidercss/stim_utils.py`.
 */
export function getCnotDepth(instructions: StimInstruction[]): number {
  const nextFreeLayer = new Map<number, number>();
  let maxLayer = -1;

  for (const op of instructions) {
    if (!TWO_QUBIT_GATES.has(op.name)) continue;
    for (let i = 0; i < op.targets.length; i += 2) {
      const t1 = op.targets[i];
      const t2 = op.targets[i + 1];
      if (!t1 || !t2 || t1.type !== 'qubit' || t2.type !== 'qubit') continue;
      const q1 = t1.value;
      const q2 = t2.value;
      const layer = Math.max(
        nextFreeLayer.get(q1) ?? 0,
        nextFreeLayer.get(q2) ?? 0
      );
      nextFreeLayer.set(q1, layer + 1);
      nextFreeLayer.set(q2, layer + 1);
      if (layer > maxLayer) maxLayer = layer;
    }
  }

  return maxLayer + 1;
}

/**
 * Computes total circuit depth (including resets and measurements) matching `get_circuit_depth`.
 */
export function getCircuitDepth(instructions: StimInstruction[]): number {
  const nextFreeLayer = new Map<number, number>();
  let maxLayer = -1;

  for (const op of instructions) {
    if (SPECIAL_GATES.has(op.name)) continue;
    if (TWO_QUBIT_GATES.has(op.name)) {
      for (let i = 0; i < op.targets.length; i += 2) {
        const t1 = op.targets[i];
        const t2 = op.targets[i + 1];
        if (!t1 || !t2 || t1.type !== 'qubit' || t2.type !== 'qubit') continue;
        const l = Math.max(
          nextFreeLayer.get(t1.value) ?? 0,
          nextFreeLayer.get(t2.value) ?? 0
        );
        nextFreeLayer.set(t1.value, l + 1);
        nextFreeLayer.set(t2.value, l + 1);
        if (l > maxLayer) maxLayer = l;
      }
    } else {
      for (const t of op.targets) {
        if (t.type !== 'qubit') continue;
        const l = nextFreeLayer.get(t.value) ?? 0;
        nextFreeLayer.set(t.value, l + 1);
        if (l > maxLayer) maxLayer = l;
      }
    }
  }

  return maxLayer + 1;
}

export function countCircuitMetrics(instructions: StimInstruction[]): {
  numQubits: number;
  numCx: number;
  numMeasurements: number;
} {
  let maxQubit = -1;
  let numCx = 0;
  let numMeasurements = 0;

  for (const op of instructions) {
    for (const t of op.targets) {
      if (t.type === 'qubit' && t.value > maxQubit) {
        maxQubit = t.value;
      }
    }
    if (TWO_QUBIT_GATES.has(op.name)) {
      for (let i = 0; i < op.targets.length; i += 2) {
        const t1 = op.targets[i];
        const t2 = op.targets[i + 1];
        if (t1?.type === 'qubit' && t2?.type === 'qubit') {
          numCx += 1;
        }
      }
    } else if (MEASUREMENT_GATES.has(op.name)) {
      numMeasurements += op.targets.filter((t) => t.type === 'qubit').length;
    }
  }

  return {
    numQubits: maxQubit + 1,
    numCx,
    numMeasurements,
  };
}

/**
 * Formats a list of `StimInstruction`s into canonical `.stim` text.
 */
export function formatStimCircuit(instructions: StimInstruction[]): string {
  const lines: string[] = [];
  for (const inst of instructions) {
    const argsPart =
      inst.args.length > 0 ? `(${inst.args.join(', ')})` : '';
    const targetsPart = inst.targets
      .map((t) => (t.type === 'rec' ? `rec[${t.value}]` : `${t.value}`))
      .join(' ');
    lines.push(
      targetsPart.length > 0
        ? `${inst.name}${argsPart} ${targetsPart}`
        : `${inst.name}${argsPart}`
    );
  }
  return lines.join('\n');
}

/**
 * Formats a list of `StimInstruction`s into OpenQASM 2.0 text.
 */
export function formatQasmCircuit(
  instructions: StimInstruction[],
  numQubits: number,
  numMeasurements: number
): string {
  const lines: string[] = [
    'OPENQASM 2.0;',
    'include "qelib1.inc";',
    `qreg q[${Math.max(1, numQubits)}];`,
  ];
  if (numMeasurements > 0) {
    lines.push(`creg flag[${numMeasurements}];`);
  }
  lines.push('');

  let measIdx = 0;
  for (const inst of instructions) {
    if (inst.name === 'TICK' || SPECIAL_GATES.has(inst.name)) continue;

    if (inst.name === 'R') {
      for (const t of inst.targets) {
        if (t.type === 'qubit') lines.push(`reset q[${t.value}];`);
      }
    } else if (inst.name === 'RX') {
      for (const t of inst.targets) {
        if (t.type === 'qubit') {
          lines.push(`reset q[${t.value}];`);
          lines.push(`h q[${t.value}];`);
        }
      }
    } else if (inst.name === 'H') {
      for (const t of inst.targets) {
        if (t.type === 'qubit') lines.push(`h q[${t.value}];`);
      }
    } else if (inst.name === 'CNOT' || inst.name === 'CX') {
      for (let i = 0; i < inst.targets.length; i += 2) {
        const c = inst.targets[i];
        const t = inst.targets[i + 1];
        if (c?.type === 'qubit' && t?.type === 'qubit') {
          lines.push(`cx q[${c.value}], q[${t.value}];`);
        }
      }
    } else if (inst.name === 'M' || inst.name === 'MZ') {
      for (const t of inst.targets) {
        if (t.type === 'qubit') {
          lines.push(`measure q[${t.value}] -> flag[${measIdx}];`);
          measIdx++;
        }
      }
    } else if (inst.name === 'MX') {
      for (const t of inst.targets) {
        if (t.type === 'qubit') {
          lines.push(`h q[${t.value}];`);
          lines.push(`measure q[${t.value}] -> flag[${measIdx}];`);
          measIdx++;
        }
      }
    }
  }

  return lines.join('\n');
}
