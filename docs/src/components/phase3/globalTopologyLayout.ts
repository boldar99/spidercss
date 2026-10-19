import type { BasisType } from '../../engine/types';
import {
  computeCatStateTreeLayout,
  dagLongestPathLength,
  topologicalGenerations,
  type CatTreeGridLayout,
} from '../../engine/catState';
import {
  nodeMapKey,
  type GlobalPipelineSetup,
} from '../../engine/spiderLegMatcher';

export interface GlobalSwimlane {
  kind: 'Z' | 'X';
  index: number;
  qubitCol: number;
  label: string;
  y: number;
  h: number;
}

export interface GlobalNodeLayoutPosition {
  x: number;
  y: number;
  gen: number;
  compKind: 'Z' | 'X';
  compIndex: number;
  localId: number;
  isRoot: boolean;
  rootTreeCol: number | null;
  isPrimaryExit: boolean;
  dataQubitCol: number;
}

export interface GlobalTopologyLayout {
  posMap: Map<number, GlobalNodeLayoutPosition>;
  swimlanes: GlobalSwimlane[];
  firstGenX: number;
  genStepX: number;
  numGens: number;
  rightBoundaryX: number;
  svgWidth: number;
  svgHeight: number;
}

export const NODE_RADIUS = 11.5;

/**
 * Computes deterministic horizontal DAG-based coordinates for nodes in G_global and D_global.
 * - Swimlanes are ordered by qubit index (q = 0 .. N-1), not spider index.
 * - Spiders in G_global copy their exact (x, y) coordinates from D_global's topological generations.
 * - Nodes advance horizontally rightward as external causal CNOT edges are added.
 */
export function computeGlobalTopologyLayout(
  pipeline: GlobalPipelineSetup,
  activeGenerations: number[][],
  basis: BasisType
): GlobalTopologyLayout {
  const {
    N,
    pivots,
    nonPivots,
    zStates,
    xStates,
    zNodeMapping,
    xNodeMapping,
    baseGlobalD,
    globalRoots,
    globalPrimaryPaths,
  } = pipeline;

  const rowSym = basis === 'Z' ? 'Z' : 'X';
  const colSym = basis === 'Z' ? 'X' : 'Z';

  // 1. Group mapping: order groups by qubit index (0 .. N-1)
  const pivotQubitToRow = new Map<number, number>();
  for (const [rStr, qCol] of Object.entries(pivots)) {
    pivotQubitToRow.set(Number(qCol), Number(rStr));
  }

  const nonPivotQubitToCol = new Map<number, number>();
  nonPivots.forEach((qCol, j) => {
    nonPivotQubitToCol.set(qCol, j);
  });

  interface GroupMeta {
    qubitCol: number;
    kind: 'Z' | 'X';
    spiderIdx: number;
    state: (typeof zStates)[0];
    mapping: Map<string, number>;
    label: string;
  }

  const orderedGroups: GroupMeta[] = [];
  for (let q = 0; q < N; q++) {
    if (pivotQubitToRow.has(q)) {
      const rowIdx = pivotQubitToRow.get(q)!;
      orderedGroups.push({
        qubitCol: q,
        kind: 'Z',
        spiderIdx: rowIdx,
        state: zStates[rowIdx],
        mapping: zNodeMapping,
        label: `${rowSym}_${rowIdx} (q_${q})`,
      });
    } else if (nonPivotQubitToCol.has(q)) {
      const colIdx = nonPivotQubitToCol.get(q)!;
      orderedGroups.push({
        qubitCol: q,
        kind: 'X',
        spiderIdx: colIdx,
        state: xStates[colIdx],
        mapping: xNodeMapping,
        label: `${colSym}_${colIdx} (q_${q})`,
      });
    }
  }

  // 2. Swimlane geometry
  const firstGenX = 142;
  const genStepX = 96;
  const rowStepY = 46;
  const bandPadTop = 18;
  const bandPadBottom = 18;
  const bandGapY = 8;
  const topHeaderH = 34;

  const yTrackOfNode = new Map<number, number>();
  const swimlanes: GlobalSwimlane[] = [];
  let cursorY = topHeaderH;

  orderedGroups.forEach((grp) => {
    const treeGrid: CatTreeGridLayout = computeCatStateTreeLayout(grp.state);
    const bandH =
      bandPadTop +
      Math.max(0, treeGrid.numRows - 1) * rowStepY +
      bandPadBottom;

    swimlanes.push({
      kind: grp.kind,
      index: grp.spiderIdx,
      qubitCol: grp.qubitCol,
      label: grp.label,
      y: cursorY,
      h: bandH,
    });

    for (const [localId, cell] of treeGrid.coords.entries()) {
      const gId = grp.mapping.get(nodeMapKey(grp.spiderIdx, localId));
      if (gId !== undefined) {
        yTrackOfNode.set(gId, cursorY + bandPadTop + cell.row * rowStepY);
      }
    }
    cursorY += bandH + bandGapY;
  });

  // 3. Node topological generation & position mapping
  const genOfNode = new Map<number, number>();
  activeGenerations.forEach((layer, genIdx) => {
    for (const gId of layer) {
      genOfNode.set(gId, genIdx);
    }
  });

  const rootGlobalToCol = new Map<number, number>();
  for (const [colStr, gId] of Object.entries(globalRoots)) {
    rootGlobalToCol.set(gId, Number(colStr));
  }

  const exitGlobalToCol = new Map<number, number>();
  for (const [colStr, path] of Object.entries(globalPrimaryPaths)) {
    if (path && path.length > 0) {
      exitGlobalToCol.set(path[path.length - 1], Number(colStr));
    }
  }

  const posMap = new Map<number, GlobalNodeLayoutPosition>();
  for (const [nodeId, nData] of baseGlobalD.nodes.entries()) {
    const gen = genOfNode.get(nodeId) ?? 0;
    const x = firstGenX + gen * genStepX;
    const y = yTrackOfNode.get(nodeId) ?? topHeaderH + 24;
    const isRoot = rootGlobalToCol.has(nodeId);
    const rootTreeCol = rootGlobalToCol.get(nodeId) ?? null;
    const isPrimaryExit = exitGlobalToCol.has(nodeId);
    const dataQubitCol = isPrimaryExit
      ? exitGlobalToCol.get(nodeId)!
      : (rootTreeCol ?? 0);

    posMap.set(nodeId, {
      x,
      y,
      gen,
      compKind: nData.compKind as 'Z' | 'X',
      compIndex: nData.compIndex as number,
      localId: nData.localId as number,
      isRoot,
      rootTreeCol,
      isPrimaryExit,
      dataQubitCol,
    });
  }

  const numGens = Math.max(1, activeGenerations.length);
  const lastGenX = firstGenX + Math.max(0, numGens - 1) * genStepX;
  const rightBoundaryX = lastGenX + 80;
  const svgWidth = Math.max(680, rightBoundaryX + 65);
  // Snug vertical fit: end just after the last swimlane (cursorY already has the bandGapY)
  const svgHeight = cursorY + 8;

  return {
    posMap,
    swimlanes,
    firstGenX,
    genStepX,
    numGens,
    rightBoundaryX,
    svgWidth,
    svgHeight,
  };
}

/**
 * Builds an SVG path string for a directed arrow between two nodes.
 */
export function buildDirectedEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  nodeRadius = 11.5
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return '';

  const startPad = nodeRadius + 1.5;
  const endPad = nodeRadius + 4.5;

  // Same horizontal track: crisp straight arrow
  if (Math.abs(dy) < 2) {
    const dirX = dx >= 0 ? 1 : -1;
    const sx = x1 + dirX * startPad;
    const tx = x2 - dirX * endPad;
    return `M ${sx} ${y1} L ${tx} ${y2}`;
  }

  // Cross-track edge: smooth cubic Bezier curve with shortened endpoints
  const ux = dx / len;
  const uy = dy / len;
  const sx = x1 + ux * startPad;
  const sy = y1 + uy * startPad;
  const tx = x2 - ux * endPad;
  const ty = y2 - uy * endPad;
  const midX = (sx + tx) / 2;
  return `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx} ${ty}`;
}

/**
 * Builds an SVG path string for an undirected edge between two nodes.
 */
export function buildUndirectedEdgePath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const dx = x2 - x1;
  const dy = y2 - y1;

  // Same horizontal track: crisp straight line
  if (Math.abs(dy) < 2) {
    return `M ${x1} ${y1} L ${x2} ${y2}`;
  }

  // Near-vertical edge (same topological generation): slight curved arc to prevent overlapping vertical guides
  if (Math.abs(dx) < 8) {
    const midY = (y1 + y2) / 2;
    const bowX = Math.max(x1, x2) + 24;
    return `M ${x1} ${y1} Q ${bowX} ${midY} ${x2} ${y2}`;
  }

  // Cross-track / cross-generation edge: smooth cubic Bezier
  const midX = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
}
