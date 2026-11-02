import React, { useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  ArrowLeft,
  ArrowRight,
  GitBranch,
} from 'lucide-react';
import * as d3 from 'd3';
import { solveLinearSystemGF2, transposeGF2 } from '../../engine/gf2';
import { computeXSpiderSplits, getConjM } from '../../engine/hookErrors';
import {
  getUndirectedEdges,
  getUndirectedNeighbors,
  wellOrderedFtCatStateData,
} from '../../engine/catState';
import {
  $compilerStore,
  setAnalyzeHookErrors,
  setPostPhase2Branch,
} from '../../stores/compilerStore';
import { Math as MathTex } from '../common/Math';

interface BipartiteEdgeItem {
  key: string;
  rowIdx: number;
  npIdx: number;
  pivotCol: number;
  nonPivotCol: number;
}

interface CatSubgraphNode {
  localId: number;
  x: number;
  y: number;
  isMark: boolean;
}

interface CatSubgraphData {
  nodes: Map<number, CatSubgraphNode>;
  internalEdges: Array<{ u: number; v: number }>;
  portNodeIds: number[];
}

type StageId = 'idealized' | 'noisy' | 'hook-splits' | 'cat-unfused';

interface RewriteStepSpec {
  leftStage: StageId;
  rightStage: StageId;
  leftTitle: string;
  rightTitle: string;
  eqSub?: string;
}

/**
 * Computes a clean, untangled 2D layout for an unrooted SpiderCat graph `G` (for m >= 4 legs):
 * - For t = 1 (or m <= 5), `G` is a simple m-cycle: we walk the cycle in order around a regular m-gon.
 * - For t >= 2 and m >= 6, `G` has `m` marked boundary ports (degree 2 in G) and `k` unmarked internal
 *   degree-3 hubs: we run a deterministic two-stage concentric d3-force layout that orders the marked
 *   ports around the outer polygon of radius `outerR` and relaxes the unmarked degree-3 hubs symmetrically
 *   inside an inner radius `innerR`.
 * - Finally, the layout is rigidly rotated and positioned so that:
 *   1. If the spider has an output boundary wire at `y = anchorY`, its assigned port sits at `y = anchorY`
 *      so the horizontal output wire remains strictly horizontal.
 *   2. The remaining `m - 1` external legs are matched in cyclic angular order around the cluster center
 *      to the remaining `m - 1` marked boundary ports, preventing external wires from crossing over the cluster.
 */
function buildSpiderCatLayout(
  m: number,
  t: number,
  baseX: number,
  anchorY: number,
  isRowSpider: boolean,
  hasOutputWire: boolean,
  otherLegTargets: Array<{ x: number; y: number }>
): {
  nodes: Map<number, CatSubgraphNode>;
  internalEdges: Array<{ u: number; v: number }>;
  outputPortId: number | null;
  otherLegPortIds: number[];
} {
  const state = wellOrderedFtCatStateData(m, t, false);
  const allNodeIds = Array.from(state.G.nodes.keys());
  const internalEdges = getUndirectedEdges(state.G).map((e) => ({
    u: e.source,
    v: e.target,
  }));

  const markedIds = allNodeIds.filter(
    (id) => state.G.nodes.get(id)?.is_mark ?? false
  );
  const unmarkedIds = allNodeIds.filter(
    (id) => !(state.G.nodes.get(id)?.is_mark ?? false)
  );

  const outerR = m <= 4 ? 17.5 : m <= 6 ? 20.5 : 23;
  const innerR = outerR * 0.44;

  // Step 1: Find cyclic order of `markedIds` around the outer ring, and canonical (ux, uy) for all nodes
  let orderedMarkedIds: number[] = [];
  const canonicalPos = new Map<number, { x: number; y: number }>();

  if (unmarkedIds.length === 0) {
    // Simple cycle of length m: walk the cycle in adjacency order so 0 internal crossings occur
    const startId = markedIds[0] ?? allNodeIds[0];
    const visited = new Set<number>([startId]);
    orderedMarkedIds.push(startId);
    let curr = startId;
    while (orderedMarkedIds.length < markedIds.length) {
      const nbrs = getUndirectedNeighbors(state.G, curr);
      const next = nbrs.find((v) => !visited.has(v));
      if (next === undefined) break;
      visited.add(next);
      orderedMarkedIds.push(next);
      curr = next;
    }
    for (const id of markedIds) {
      if (!visited.has(id)) orderedMarkedIds.push(id);
    }
    orderedMarkedIds.forEach((id, idx) => {
      const ang = (2 * Math.PI * idx) / orderedMarkedIds.length;
      canonicalPos.set(id, {
        x: Math.cos(ang) * outerR,
        y: Math.sin(ang) * outerR,
      });
    });
  } else {
    // General SpiderCat graph (t >= 2, m >= 6) with internal degree-3 hubs
    interface SimNode extends d3.SimulationNodeDatum {
      id: number;
      isMark: boolean;
      x: number;
      y: number;
      fx?: number;
      fy?: number;
    }
    const simNodes: SimNode[] = allNodeIds.map((id, idx) => {
      const isMark = state.G.nodes.get(id)?.is_mark ?? false;
      const r0 = isMark ? outerR : innerR;
      const ang = (2 * Math.PI * idx) / allNodeIds.length;
      return {
        id,
        isMark,
        x: Math.cos(ang) * r0,
        y: Math.sin(ang) * r0,
      };
    });
    const simLinks = internalEdges.map((e) => ({
      source: e.u,
      target: e.v,
    }));

    const sim1 = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, { source: number; target: number }>(simLinks)
          .id((d) => d.id)
          .distance(14)
          .strength(1.2)
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(-55))
      .force(
        'radial',
        d3
          .forceRadial<SimNode>((d) => (d.isMark ? outerR : innerR), 0, 0)
          .strength(1.8)
      )
      .stop();

    for (let i = 0; i < 240; i++) sim1.tick();

    const sortedMarked = simNodes
      .filter((d) => d.isMark)
      .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x));

    orderedMarkedIds = sortedMarked.map((d) => d.id);
    sortedMarked.forEach((n, idx) => {
      const ang = (2 * Math.PI * idx) / sortedMarked.length;
      n.fx = Math.cos(ang) * outerR;
      n.fy = Math.sin(ang) * outerR;
      n.x = n.fx;
      n.y = n.fy;
    });

    const sim2 = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        d3
          .forceLink<SimNode, { source: number; target: number }>(simLinks)
          .id((d) => d.id)
          .distance(10)
          .strength(1.5)
      )
      .force('charge', d3.forceManyBody<SimNode>().strength(-25))
      .force(
        'radial',
        d3
          .forceRadial<SimNode>((d) => (d.isMark ? outerR : innerR), 0, 0)
          .strength(2.2)
      )
      .force('collide', d3.forceCollide<SimNode>(7.2))
      .stop();

    for (let i = 0; i < 180; i++) sim2.tick();

    for (const n of simNodes) {
      canonicalPos.set(n.id, { x: n.x, y: n.y });
    }
  }

  // Step 2: Determine cluster orientation angle `theta0` and center `(cx, cy)`
  // so that port 0 sits at `y = anchorY` (keeping the output wire strictly horizontal!)
  let theta0 = 0;
  if (isRowSpider) {
    const avgDy =
      otherLegTargets.length > 0
        ? otherLegTargets.reduce((acc, p) => acc + (p.y - anchorY), 0) /
          otherLegTargets.length
        : 0;
    const minDy =
      otherLegTargets.length > 0
        ? Math.min(...otherLegTargets.map((p) => p.y - anchorY))
        : 0;
    const maxDy =
      otherLegTargets.length > 0
        ? Math.max(...otherLegTargets.map((p) => p.y - anchorY))
        : 0;

    if (minDy >= -4 && avgDy > 10) {
      theta0 = -Math.PI / 3;
    } else if (maxDy <= 4 && avgDy < -10) {
      theta0 = Math.PI / 3;
    } else {
      theta0 = -Math.PI / 5;
    }
  } else {
    theta0 = 0;
  }

  const cos0 = Math.cos(theta0);
  const sin0 = Math.sin(theta0);

  const cx = isRowSpider ? baseX - outerR * cos0 * 0.35 : baseX;
  const cy = anchorY - outerR * sin0;

  const nodes = new Map<number, CatSubgraphNode>();
  for (const [id, p] of canonicalPos.entries()) {
    const rx = p.x * cos0 - p.y * sin0;
    const ry = p.x * sin0 + p.y * cos0;
    nodes.set(id, {
      localId: id,
      x: cx + rx,
      y: cy + ry,
      isMark: state.G.nodes.get(id)?.is_mark ?? false,
    });
  }

  // Step 3: Assign ports in cyclic angular order around `(cx, cy)`
  const outputPortId = hasOutputWire ? (orderedMarkedIds[0] ?? null) : null;
  const remainingPorts = hasOutputWire
    ? orderedMarkedIds.slice(1)
    : orderedMarkedIds.slice();

  const ccwDeltaFromTheta0 = (ang: number) => {
    let d = (ang - theta0) % (2 * Math.PI);
    if (d <= 1e-6) d += 2 * Math.PI;
    return d;
  };

  const indexedTargets = otherLegTargets.map((target, idx) => ({
    idx,
    ccw: ccwDeltaFromTheta0(Math.atan2(target.y - cy, target.x - cx)),
  }));
  indexedTargets.sort((a, b) => a.ccw - b.ccw);

  const otherLegPortIds = new Array<number>(otherLegTargets.length);
  indexedTargets.forEach((item, rank) => {
    otherLegPortIds[item.idx] =
      remainingPorts[rank % Math.max(1, remainingPorts.length)] ??
      orderedMarkedIds[0] ??
      0;
  });

  return {
    nodes,
    internalEdges,
    outputPortId,
    otherLegPortIds,
  };
}

/**
 * Authentic LaTeX \FaultEq (\newcommand{\FaultEq}{\mathrel{\widehat{=}}}) rendered via KaTeX.
 */
const FaultEqSymbol: React.FC<{ sub?: string; className?: string }> = ({
  sub,
  className = '',
}) => (
  <div className={`inline-flex items-center justify-center select-none ${className}`}>
    <MathTex
      tex={
        sub
          ? `\\underset{\\text{${sub}}}{\\mathrel{\\widehat{=}}}`
          : '\\mathrel{\\widehat{=}}'
      }
      className="text-xl sm:text-2xl text-slate-800"
    />
  </div>
);

export const ZxRewritesView: React.FC = () => {
  const state = useStore($compilerStore);
  const {
    basis,
    d,
    validation,
    rrefSnapshot,
    analyzeHookErrors: useHookSplits,
  } = state;
  const prepMatrix = rrefSnapshot.unpermutedMatrix;
  const pivots = rrefSnapshot.pivots;

  const numRows = prepMatrix.length;
  const n = validation.n;
  const t = validation.t;

  const pivotCols = useMemo(
    () => new Set(Object.values(pivots)),
    [pivots]
  );

  const nonPivots = useMemo(() => {
    const cols: number[] = [];
    for (let c = 0; c < n; c++) {
      if (!pivotCols.has(c)) cols.push(c);
    }
    return cols;
  }, [n, pivotCols]);

  // All bipartite internal edges between row spiders and non-pivot column spiders
  const bipartiteEdges = useMemo<BipartiteEdgeItem[]>(() => {
    const items: BipartiteEdgeItem[] = [];
    for (let r = 0; r < numRows; r++) {
      const pCol = pivots[r];
      if (pCol === undefined) continue;
      nonPivots.forEach((npCol, npIdx) => {
        if (prepMatrix[r]?.[npCol] === 1) {
          items.push({
            key: `r${r}-np${npIdx}`,
            rowIdx: r,
            npIdx,
            pivotCol: pCol,
            nonPivotCol: npCol,
          });
        }
      });
    }
    return items;
  }, [numRows, pivots, nonPivots, prepMatrix]);

  // Safe hook-error split analysis via computeXSpiderSplits & getConjM
  const hookAnalysis = useMemo(
    () => computeXSpiderSplits(prepMatrix, d, useHookSplits),
    [prepMatrix, d, useHookSplits]
  );

  const conjM = useMemo(() => getConjM(prepMatrix), [prepMatrix]);

  const safeSplits = useMemo(() => {
    const items: Array<{
      npIdx: number;
      chunkIdx: number;
      leftSupport: number[];
      equivalentSingleQubit: number | null;
      stabilizerNpIndices: number[];
    }> = [];
    if (!useHookSplits) return items;

    const conjMT = transposeGF2(conjM);

    hookAnalysis.xSplits.forEach((chunks, npIdx) => {
      if (chunks.length <= 1) return;
      const prefixSupport: number[] = [];
      for (let cIdx = 0; cIdx < chunks.length - 1; cIdx++) {
        prefixSupport.push(...chunks[cIdx]);
        const leftSupport = [...prefixSupport].sort((a, b) => a - b);

        const vA = new Array<number>(n).fill(0);
        for (const q of leftSupport) vA[q] ^= 1;

        let foundQ: number | null = null;
        let foundSol: number[] = [];

        for (let q = 0; q < n; q++) {
          const rhs = vA.slice();
          rhs[q] ^= 1;
          const sol = solveLinearSystemGF2(conjMT, rhs);
          if (sol !== null) {
            foundQ = q;
            foundSol = sol;
            break;
          }
        }

        const stabilizerNpIndices: number[] = [];
        foundSol.forEach((bit, j) => {
          if (bit === 1) stabilizerNpIndices.push(j);
        });

        items.push({
          npIdx,
          chunkIdx: cIdx,
          leftSupport,
          equivalentSingleQubit: foundQ,
          stabilizerNpIndices,
        });
      }
    });

    return items;
  }, [useHookSplits, hookAnalysis, conjM, n]);

  // Dynamic rewrite steps: 3 steps when Safe Hook Splits is enabled on d=3, 2 steps when unselected
  const activeRewriteSteps = useMemo<RewriteStepSpec[]>(() => {
    if (useHookSplits && d === 3) {
      return [
        {
          leftStage: 'idealized',
          rightStage: 'noisy',
          leftTitle: 'Idealized bipartite diagram',
          rightTitle: 'Replace idealized edges with noisy edges',
          eqSub: 'CSS',
        },
        {
          leftStage: 'noisy',
          rightStage: 'hook-splits',
          leftTitle: 'Replace idealized edges with noisy edges',
          rightTitle: 'Unfuse along safe hook errors',
        },
        {
          leftStage: 'hook-splits',
          rightStage: 'cat-unfused',
          leftTitle: 'Unfuse along safe hook errors',
          rightTitle: 'Fault-equivalently unfuse high-degree spiders',
        },
      ];
    }
    return [
      {
        leftStage: 'idealized',
        rightStage: 'noisy',
        leftTitle: 'Idealized bipartite diagram',
        rightTitle: 'Replace idealized edges with noisy edges',
        eqSub: 'CSS',
      },
      {
        leftStage: 'noisy',
        rightStage: 'cat-unfused',
        leftTitle: 'Replace idealized edges with noisy edges',
        rightTitle: 'Fault-equivalently unfuse high-degree spiders',
      },
    ];
  }, [useHookSplits, d]);

  const [rewriteStep, setRewriteStep] = useState<number>(0);
  const safeRewriteStep = Math.min(
    rewriteStep,
    Math.max(0, activeRewriteSteps.length - 1)
  );
  const currentStepSpec = activeRewriteSteps[safeRewriteStep];

  // Interactive fault propagation state (starts with NO edge selected)
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [faultBasis, setFaultBasis] = useState<'X' | 'Z'>(
    basis === 'Z' ? 'X' : 'Z'
  );
  const [selectedHookKey, setSelectedHookKey] = useState<string | null>(null);

  const effectiveEdgeKey = useMemo(() => {
    if (
      selectedEdgeKey &&
      bipartiteEdges.some((e) => e.key === selectedEdgeKey)
    ) {
      return selectedEdgeKey;
    }
    return null;
  }, [selectedEdgeKey, bipartiteEdges]);

  const activeEdge = useMemo(
    () => bipartiteEdges.find((e) => e.key === effectiveEdgeKey) ?? null,
    [bipartiteEdges, effectiveEdgeKey]
  );

  const effectiveHookKey = useMemo(() => {
    if (!useHookSplits || safeSplits.length === 0) return null;
    if (
      selectedHookKey &&
      safeSplits.some(
        (s) => `${s.npIdx}-${s.chunkIdx}` === selectedHookKey
      )
    ) {
      return selectedHookKey;
    }
    return null;
  }, [useHookSplits, safeSplits, selectedHookKey]);

  const activeHookSplit = useMemo(
    () =>
      safeSplits.find(
        (s) => `${s.npIdx}-${s.chunkIdx}` === effectiveHookKey
      ) ?? null,
    [safeSplits, effectiveHookKey]
  );

  // Spider colors and basis symbols
  const rowSym: 'Z' | 'X' = basis === 'Z' ? 'Z' : 'X';
  const colSym: 'Z' | 'X' = basis === 'Z' ? 'X' : 'Z';

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';
  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';

  // Previous Z (green) and X (red) colors for fault badges and solid propagation lines
  const faultFill = faultBasis === 'X' ? '#fca5a5' : '#86efac';
  const faultStroke = faultBasis === 'X' ? '#b91c1c' : '#15803d';

  // On the safe hook split edge, a hook error is a `rowSym` phase flip (Z in Z-basis, X in X-basis)
  const hookFaultFill = rowSym === 'X' ? '#fca5a5' : '#86efac';
  const hookFaultStroke = rowSym === 'X' ? '#b91c1c' : '#15803d';

  // Correct fault propagation direction on unidealized internal edge:
  // X errors go to X spiders' boundary wire; Z errors go to Z spiders' boundary wire.
  const unidealizedPropagatedQubit = useMemo<number | null>(() => {
    if (!activeEdge) return null;
    if (faultBasis === rowSym) {
      return activeEdge.pivotCol;
    }
    return activeEdge.nonPivotCol;
  }, [activeEdge, faultBasis, rowSym]);

  // Compute the copy / fusion / copy path on the bipartite graph between the selected safe hook split edge
  // and its single equivalent output wire q*
  const hookPropagationPath = useMemo(() => {
    const empty = {
      equivalentWire: null as number | null,
      activeEdgeKeys: new Set<string>(),
      activeRowIndices: new Set<number>(),
      activeNpIndices: new Set<number>(),
    };
    if (!activeHookSplit || activeHookSplit.equivalentSingleQubit === null) {
      return empty;
    }

    const qStar = activeHookSplit.equivalentSingleQubit;
    const colToNpIdx = new Map<number, number>();
    nonPivots.forEach((col, idx) => colToNpIdx.set(col, idx));

    const pivotColToRow = new Map<number, number>();
    for (let r = 0; r < numRows; r++) {
      if (pivots[r] !== undefined) {
        pivotColToRow.set(pivots[r], r);
      }
    }

    const activeEdgeKeys = new Set<string>();
    const activeRowIndices = new Set<number>();
    const activeNpIndices = new Set<number>([activeHookSplit.npIdx]);

    for (const pCol of activeHookSplit.leftSupport) {
      const rIdx = pivotColToRow.get(pCol);
      if (rIdx !== undefined) {
        activeRowIndices.add(rIdx);
        activeEdgeKeys.add(`r${rIdx}-np${activeHookSplit.npIdx}`);
      }
    }

    for (const stabNpIdx of activeHookSplit.stabilizerNpIndices) {
      activeNpIndices.add(stabNpIdx);
      const npCol = nonPivots[stabNpIdx];
      if (npCol === undefined) continue;
      for (let r = 0; r < numRows; r++) {
        if (prepMatrix[r]?.[npCol] === 1) {
          activeRowIndices.add(r);
          const edgeKey = `r${r}-np${stabNpIdx}`;
          if (activeEdgeKeys.has(edgeKey)) {
            activeEdgeKeys.delete(edgeKey);
          } else {
            activeEdgeKeys.add(edgeKey);
          }
        }
      }
    }

    const qStarNpIdx = colToNpIdx.get(qStar);
    if (qStarNpIdx !== undefined) {
      activeNpIndices.add(qStarNpIdx);
    }
    const qStarRowIdx = pivotColToRow.get(qStar);
    if (qStarRowIdx !== undefined) {
      activeRowIndices.add(qStarRowIdx);
    }

    return {
      equivalentWire: qStar,
      activeEdgeKeys,
      activeRowIndices,
      activeNpIndices,
    };
  }, [activeHookSplit, numRows, prepMatrix, nonPivots, pivots]);

  // Non-pivot chunk decomposition for stage 3 ("Unfuse along safe hook errors") and stage 4 ("cat-unfused")
  const npChunkGroups = useMemo(() => {
    return nonPivots.map((npCol, npIdx) => {
      const connectedRows: number[] = [];
      for (let r = 0; r < numRows; r++) {
        if (prepMatrix[r]?.[npCol] === 1) {
          connectedRows.push(r);
        }
      }
      const chunks = hookAnalysis.xSpiders[npIdx] ?? [connectedRows.length + 1];
      const rowChunks: number[][] = [];
      let cursor = 0;
      chunks.forEach((cSize, cIdx) => {
        const numIncidentRows = cIdx === chunks.length - 1 ? cSize - 1 : cSize;
        rowChunks.push(connectedRows.slice(cursor, cursor + numIncidentRows));
        cursor += numIncidentRows;
      });
      return {
        npIdx,
        npCol,
        chunks,
        rowChunks,
      };
    });
  }, [nonPivots, numRows, prepMatrix, hookAnalysis]);

  // Renders a single ZX diagram stage with identical viewBox & vertical geometry across all 4 stages
  const renderDiagramPanel = (stage: StageId) => {
    const stepY = n <= 8 ? 58 : n <= 12 ? 48 : 40;
    const padTop = 38;
    const padBottom = 34;
    const width = 415;
    const height = padTop + Math.max(0, n - 1) * stepY + padBottom;

    const rowX = 88;
    const colX = 276;
    const wireEndX = 370;

    const yForQubit = (q: number) => padTop + q * stepY;

    const isIdealized = stage === 'idealized';
    const isNoisy = stage === 'noisy';
    const isHookStage = stage === 'hook-splits';
    const isCatStage = stage === 'cat-unfused';

    const getChunkX = (npIdx: number, chunkIdx: number, totalChunks: number) => {
      if (totalChunks <= 1 || (!isHookStage && !isCatStage)) return colX;
      const spacing = isCatStage ? 44 : 40;
      const offsetFromRight = (totalChunks - 1 - chunkIdx) * spacing;
      return colX - offsetFromRight;
    };

    const rowCatClusters = new Map<number, CatSubgraphData>();
    const npChunkCatClusters = new Map<string, CatSubgraphData>();
    const edgePortCoords = new Map<
      string,
      { x1: number; y1: number; x2: number; y2: number }
    >();
    const rowBoundaryPort = new Map<number, { x: number; y: number }>();
    const npBoundaryPort = new Map<number, { x: number; y: number }>();
    const splitEdgeCoords = new Map<
      string,
      { x1: number; y1: number; x2: number; y2: number }
    >();

    if (isCatStage) {
      for (let r = 0; r < numRows; r++) {
        const pCol = pivots[r];
        if (pCol === undefined) continue;
        const incEdges = bipartiteEdges.filter((e) => e.rowIdx === r);
        const totalLegs = incEdges.length + 1;
        const ry = yForQubit(pCol);

        if (totalLegs <= 3) {
          rowBoundaryPort.set(r, { x: rowX, y: ry });
          incEdges.forEach((e) => {
            edgePortCoords.set(e.key, {
              x1: rowX,
              y1: ry,
              x2: colX,
              y2: yForQubit(e.nonPivotCol),
            });
          });
        } else {
          const otherTargets = incEdges.map((e) => ({
            x: colX,
            y: yForQubit(e.nonPivotCol),
          }));
          const catLayout = buildSpiderCatLayout(
            totalLegs,
            t,
            rowX,
            ry,
            true,
            true,
            otherTargets
          );
          rowCatClusters.set(r, {
            nodes: catLayout.nodes,
            internalEdges: catLayout.internalEdges,
            portNodeIds: [
              ...(catLayout.outputPortId !== null
                ? [catLayout.outputPortId]
                : []),
              ...catLayout.otherLegPortIds,
            ],
          });

          const outNode =
            catLayout.outputPortId !== null
              ? catLayout.nodes.get(catLayout.outputPortId)
              : undefined;
          rowBoundaryPort.set(
            r,
            outNode ? { x: outNode.x, y: outNode.y } : { x: rowX, y: ry }
          );

          incEdges.forEach((e, idx) => {
            const pId = catLayout.otherLegPortIds[idx];
            const pNode =
              pId !== undefined ? catLayout.nodes.get(pId) : undefined;
            edgePortCoords.set(e.key, {
              x1: pNode ? pNode.x : rowX,
              y1: pNode ? pNode.y : ry,
              x2: colX,
              y2: yForQubit(e.nonPivotCol),
            });
          });
        }
      }

      npChunkGroups.forEach((grp) => {
        const ny = yForQubit(grp.npCol);
        const numChunks = isCatStage && useHookSplits ? grp.rowChunks.length : 1;
        const activeRowChunks =
          numChunks > 1
            ? grp.rowChunks
            : [grp.rowChunks.flat()];

        const chunkRightSplitPort: Array<{ x: number; y: number }> = [];
        const chunkLeftSplitPort: Array<{ x: number; y: number }> = [];

        activeRowChunks.forEach((rList, cIdx) => {
          const cx = getChunkX(grp.npIdx, cIdx, numChunks);
          const hasLeftSplit = cIdx > 0;
          const hasRightSplit = cIdx < numChunks - 1;
          const hasOutWire = cIdx === numChunks - 1;
          const totalChunkLegs =
            rList.length +
            (hasLeftSplit ? 1 : 0) +
            (hasRightSplit ? 1 : 0) +
            (hasOutWire ? 1 : 0);

          if (totalChunkLegs <= 3) {
            chunkLeftSplitPort[cIdx] = { x: cx, y: ny };
            chunkRightSplitPort[cIdx] = { x: cx, y: ny };
            if (hasOutWire) {
              npBoundaryPort.set(grp.npIdx, { x: cx, y: ny });
            }
            rList.forEach((r) => {
              const key = `r${r}-np${grp.npIdx}`;
              const prev = edgePortCoords.get(key);
              if (prev) {
                edgePortCoords.set(key, {
                  ...prev,
                  x2: cx,
                  y2: ny,
                });
              }
            });
          } else {
            const otherTargets: Array<{ x: number; y: number }> = rList.map(
              (r) => ({
                x: rowX,
                y: yForQubit(pivots[r] ?? 0),
              })
            );
            if (hasLeftSplit) {
              otherTargets.push({
                x: getChunkX(grp.npIdx, cIdx - 1, numChunks),
                y: ny,
              });
            }

            const catLayout = buildSpiderCatLayout(
              totalChunkLegs,
              t,
              cx,
              ny,
              false,
              true,
              otherTargets
            );

            npChunkCatClusters.set(`${grp.npIdx}-${cIdx}`, {
              nodes: catLayout.nodes,
              internalEdges: catLayout.internalEdges,
              portNodeIds: [
                ...(catLayout.outputPortId !== null
                  ? [catLayout.outputPortId]
                  : []),
                ...catLayout.otherLegPortIds,
              ],
            });

            const rightHorizNode =
              catLayout.outputPortId !== null
                ? catLayout.nodes.get(catLayout.outputPortId)
                : undefined;
            const rightPt = rightHorizNode
              ? { x: rightHorizNode.x, y: rightHorizNode.y }
              : { x: cx, y: ny };

            chunkRightSplitPort[cIdx] = rightPt;
            if (hasOutWire) {
              npBoundaryPort.set(grp.npIdx, rightPt);
            }

            rList.forEach((r, idx) => {
              const pId = catLayout.otherLegPortIds[idx];
              const pNode =
                pId !== undefined ? catLayout.nodes.get(pId) : undefined;
              const key = `r${r}-np${grp.npIdx}`;
              const prev = edgePortCoords.get(key);
              if (prev) {
                edgePortCoords.set(key, {
                  ...prev,
                  x2: pNode ? pNode.x : cx,
                  y2: pNode ? pNode.y : ny,
                });
              }
            });

            if (hasLeftSplit) {
              const leftPortId =
                catLayout.otherLegPortIds[otherTargets.length - 1];
              const leftNode =
                leftPortId !== undefined
                  ? catLayout.nodes.get(leftPortId)
                  : undefined;
              chunkLeftSplitPort[cIdx] = leftNode
                ? { x: leftNode.x, y: leftNode.y }
                : { x: cx, y: ny };
            } else {
              chunkLeftSplitPort[cIdx] = { x: cx, y: ny };
            }
          }
        });

        for (let cIdx = 0; cIdx < numChunks - 1; cIdx++) {
          const pLeft = chunkRightSplitPort[cIdx];
          const pRight = chunkLeftSplitPort[cIdx + 1];
          if (pLeft && pRight) {
            splitEdgeCoords.set(`${grp.npIdx}-${cIdx}`, {
              x1: pLeft.x,
              y1: pLeft.y,
              x2: pRight.x,
              y2: pRight.y,
            });
          }
        }
      });
    }

    const rMain = n <= 8 ? 8.5 : 7.5;
    const rCat = 5.2;

    return (
      <div className="flex flex-col items-center flex-1 min-w-[290px]">
        <span className="text-xs sm:text-sm font-semibold text-slate-700 mb-2 text-center">
          {stage === 'idealized' && 'Idealized bipartite diagram'}
          {stage === 'noisy' && 'Replace idealized edges with noisy edges'}
          {stage === 'hook-splits' && 'Unfuse along safe hook errors'}
          {stage === 'cat-unfused' &&
            'Fault-equivalently unfuse high-degree spiders'}
        </span>

        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto max-h-[580px] select-none overflow-visible"
        >
          {/* 1. Horizontal Output Wires (one per physical qubit q_0..q_{n-1}) */}
          {Array.from({ length: numRows }, (_, r) => {
            const pCol = pivots[r];
            if (pCol === undefined) return null;
            const y = yForQubit(pCol);
            const startPt = isCatStage
              ? (rowBoundaryPort.get(r) ?? { x: rowX, y })
              : { x: rowX, y };

            const hasUnidealizedFault =
              isNoisy && unidealizedPropagatedQubit === pCol;
            const hasHookSingleFault =
              isHookStage && hookPropagationPath.equivalentWire === pCol;
            const isHighlightedWire = hasUnidealizedFault || hasHookSingleFault;

            const wireStrokeColor = hasUnidealizedFault
              ? faultStroke
              : hookFaultStroke;
            const badgeFillColor = hasUnidealizedFault
              ? faultFill
              : hookFaultFill;

            const faultX = wireEndX - 22;

            return (
              <g key={`out-row-${r}`}>
                <line
                  x1={startPt.x}
                  y1={startPt.y}
                  x2={wireEndX}
                  y2={y}
                  stroke="#334155"
                  strokeWidth={1.75}
                />
                {isHighlightedWire && (
                  <line
                    x1={startPt.x}
                    y1={startPt.y}
                    x2={faultX}
                    y2={y}
                    stroke={wireStrokeColor}
                    strokeWidth={3}
                  />
                )}
                <text
                  x={wireEndX + 8}
                  y={y + 4}
                  fontSize={10.5}
                  className={`font-mono ${
                    isHighlightedWire
                      ? 'fill-slate-900 font-bold'
                      : 'fill-slate-500 font-medium'
                  }`}
                >
                  q_{pCol}
                </text>
                {isHighlightedWire && (
                  <g>
                    <circle
                      cx={faultX}
                      cy={startPt.y}
                      r={7.8}
                      fill={badgeFillColor}
                      stroke={wireStrokeColor}
                      strokeWidth={1.8}
                    />
                    <text
                      x={faultX}
                      y={startPt.y + 3.2}
                      textAnchor="middle"
                      fontSize={9}
                      className="font-mono font-bold fill-slate-900 pointer-events-none"
                    >
                      π
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {nonPivots.map((npCol, npIdx) => {
            const y = yForQubit(npCol);
            const startPt = isCatStage
              ? (npBoundaryPort.get(npIdx) ?? { x: colX, y })
              : { x: colX, y };

            const hasUnidealizedFault =
              isNoisy && unidealizedPropagatedQubit === npCol;
            const hasHookSingleFault =
              isHookStage && hookPropagationPath.equivalentWire === npCol;
            const isHighlightedWire = hasUnidealizedFault || hasHookSingleFault;

            const wireStrokeColor = hasUnidealizedFault
              ? faultStroke
              : hookFaultStroke;
            const badgeFillColor = hasUnidealizedFault
              ? faultFill
              : hookFaultFill;

            const faultX = wireEndX - 22;

            return (
              <g key={`out-np-${npIdx}`}>
                <line
                  x1={startPt.x}
                  y1={startPt.y}
                  x2={wireEndX}
                  y2={y}
                  stroke="#334155"
                  strokeWidth={1.75}
                />
                {isHighlightedWire && (
                  <line
                    x1={startPt.x}
                    y1={startPt.y}
                    x2={faultX}
                    y2={y}
                    stroke={wireStrokeColor}
                    strokeWidth={3}
                  />
                )}
                <text
                  x={wireEndX + 8}
                  y={y + 4}
                  fontSize={10.5}
                  className={`font-mono ${
                    isHighlightedWire
                      ? 'fill-slate-900 font-bold'
                      : 'fill-slate-500 font-medium'
                  }`}
                >
                  q_{npCol}
                </text>
                {isHighlightedWire && (
                  <g>
                    <circle
                      cx={faultX}
                      cy={startPt.y}
                      r={7.8}
                      fill={badgeFillColor}
                      stroke={wireStrokeColor}
                      strokeWidth={1.8}
                    />
                    <text
                      x={faultX}
                      y={startPt.y + 3.2}
                      textAnchor="middle"
                      fontSize={9}
                      className="font-mono font-bold fill-slate-900 pointer-events-none"
                    >
                      π
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* 2. Internal Bipartite Edges */}
          {bipartiteEdges.map((e) => {
            const ry = yForQubit(e.pivotCol);
            const ny = yForQubit(e.nonPivotCol);

            let x1 = rowX;
            let y1 = ry;
            let x2 = colX;
            let y2 = ny;

            if (isHookStage) {
              const grp = npChunkGroups[e.npIdx];
              if (grp && grp.rowChunks.length > 1) {
                const cIdx = grp.rowChunks.findIndex((rList) =>
                  rList.includes(e.rowIdx)
                );
                if (cIdx >= 0) {
                  x2 = getChunkX(e.npIdx, cIdx, grp.rowChunks.length);
                }
              }
            } else if (isCatStage) {
              const coords = edgePortCoords.get(e.key);
              if (coords) {
                x1 = coords.x1;
                y1 = coords.y1;
                x2 = coords.x2;
                y2 = coords.y2;
              }
            }

            const isActiveUnidealized =
              isNoisy && activeEdge?.key === e.key;
            const isHookPath =
              isHookStage && hookPropagationPath.activeEdgeKeys.has(e.key);

            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;

            const goesToRowSpider = faultBasis === rowSym;
            const targetX = goesToRowSpider ? x1 : x2;
            const targetY = goesToRowSpider ? y1 : y2;

            return (
              <g
                key={`${stage}-${e.key}`}
                onClick={
                  isNoisy
                    ? () =>
                        setSelectedEdgeKey((prev) =>
                          prev === e.key ? null : e.key
                        )
                    : undefined
                }
                className={isNoisy ? 'cursor-pointer group' : ''}
              >
                {isNoisy && (
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="transparent"
                    strokeWidth={12}
                  />
                )}
                {/* Base edge */}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={
                    isHookPath
                      ? hookFaultStroke
                      : isIdealized
                      ? '#9333ea'
                      : isActiveUnidealized
                      ? '#64748b'
                      : '#334155'
                  }
                  strokeWidth={isHookPath ? 2.8 : 1.75}
                  className={
                    isNoisy ? 'group-hover:stroke-amber-600 transition-colors' : ''
                  }
                />
                {/* Solid colored half-edge starting from the error (mx, my) to the target spider */}
                {isActiveUnidealized && (
                  <>
                    <line
                      x1={mx}
                      y1={my}
                      x2={targetX}
                      y2={targetY}
                      stroke={faultStroke}
                      strokeWidth={3}
                    />
                    <g>
                      <circle
                        cx={mx}
                        cy={my}
                        r={7.5}
                        fill={faultFill}
                        stroke={faultStroke}
                        strokeWidth={1.8}
                      />
                      <text
                        x={mx}
                        y={my + 3.2}
                        textAnchor="middle"
                        fontSize={9}
                        className="font-mono font-bold fill-slate-900 pointer-events-none"
                      >
                        π
                      </text>
                    </g>
                  </>
                )}
              </g>
            );
          })}

          {/* 3. Safe Hook-Error Split Edges (in 'hook-splits' and 'cat-unfused' stages) */}
          {(isHookStage || (isCatStage && useHookSplits)) &&
            npChunkGroups.map((grp) => {
              const numChunks = grp.rowChunks.length;
              if (numChunks <= 1) return null;
              const ny = yForQubit(grp.npCol);

              return Array.from({ length: numChunks - 1 }, (_, cIdx) => {
                const splitKey = `${grp.npIdx}-${cIdx}`;
                const isActiveSplit =
                  isHookStage &&
                  activeHookSplit?.npIdx === grp.npIdx &&
                  activeHookSplit?.chunkIdx === cIdx;

                let x1 = getChunkX(grp.npIdx, cIdx, numChunks);
                let y1 = ny;
                let x2 = getChunkX(grp.npIdx, cIdx + 1, numChunks);
                let y2 = ny;

                if (isCatStage) {
                  const sc = splitEdgeCoords.get(splitKey);
                  if (sc) {
                    x1 = sc.x1;
                    y1 = sc.y1;
                    x2 = sc.x2;
                    y2 = sc.y2;
                  }
                }

                const mx = (x1 + x2) / 2;
                const my = (y1 + y2) / 2;

                return (
                  <g
                    key={`split-${stage}-${splitKey}`}
                    onClick={
                      isHookStage
                        ? () =>
                            setSelectedHookKey((prev) =>
                              prev === splitKey ? null : splitKey
                            )
                        : undefined
                    }
                    className={isHookStage ? 'cursor-pointer group' : ''}
                  >
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={14}
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isActiveSplit ? '#64748b' : '#334155'}
                      strokeWidth={2}
                      className={
                        isHookStage
                          ? 'group-hover:stroke-amber-600 transition-colors'
                          : ''
                      }
                    />
                    {/* Solid colored half-edge starting from the split-edge error (mx, my) to left chunk (x1, y1) */}
                    {isActiveSplit && (
                      <>
                        <line
                          x1={mx}
                          y1={my}
                          x2={x1}
                          y2={y1}
                          stroke={hookFaultStroke}
                          strokeWidth={3}
                        />
                        <g>
                          <circle
                            cx={mx}
                            cy={my}
                            r={7.5}
                            fill={hookFaultFill}
                            stroke={hookFaultStroke}
                            strokeWidth={1.8}
                          />
                          <text
                            x={mx}
                            y={my + 3.2}
                            textAnchor="middle"
                            fontSize={9}
                            className="font-mono font-bold fill-slate-900 pointer-events-none"
                          >
                            π
                          </text>
                        </g>
                      </>
                    )}
                  </g>
                );
              });
            })}

          {/* 4. Spiders / Unfused SpiderCat Subgraphs */}
          {!isCatStage ? (
            <>
              {/* Row Spiders */}
              {Array.from({ length: numRows }, (_, r) => {
                const pCol = pivots[r];
                if (pCol === undefined) return null;
                const y = yForQubit(pCol);

                return (
                  <circle
                    key={`row-node-${r}`}
                    cx={rowX}
                    cy={y}
                    r={rMain}
                    fill={rowFill}
                    stroke={rowStroke}
                    strokeWidth={1.8}
                  />
                );
              })}

              {/* Non-Pivot Column Spiders (or split chunks in stage 3) */}
              {npChunkGroups.map((grp) => {
                const y = yForQubit(grp.npCol);
                const numChunks = isHookStage ? grp.rowChunks.length : 1;

                return Array.from({ length: numChunks }, (_, cIdx) => {
                  const cx = getChunkX(grp.npIdx, cIdx, numChunks);
                  return (
                    <circle
                      key={`np-node-${grp.npIdx}-${cIdx}`}
                      cx={cx}
                      cy={y}
                      r={rMain}
                      fill={colFill}
                      stroke={colStroke}
                      strokeWidth={1.8}
                    />
                  );
                });
              })}
            </>
          ) : (
            <>
              {/* Stage 4: Row spiders (single node if deg <= 3, SpiderCat subgraph if deg >= 4) */}
              {Array.from({ length: numRows }, (_, r) => {
                const pCol = pivots[r];
                if (pCol === undefined) return null;
                const cluster = rowCatClusters.get(r);
                if (!cluster) {
                  const y = yForQubit(pCol);
                  return (
                    <circle
                      key={`cat-row-single-${r}`}
                      cx={rowX}
                      cy={y}
                      r={rMain}
                      fill={rowFill}
                      stroke={rowStroke}
                      strokeWidth={1.8}
                    />
                  );
                }
                return (
                  <g key={`cat-row-${r}`}>
                    {cluster.internalEdges.map((ie, idx) => {
                      const u = cluster.nodes.get(ie.u);
                      const v = cluster.nodes.get(ie.v);
                      if (!u || !v) return null;
                      return (
                        <line
                          key={`ie-r-${r}-${idx}`}
                          x1={u.x}
                          y1={u.y}
                          x2={v.x}
                          y2={v.y}
                          stroke="#334155"
                          strokeWidth={1.6}
                        />
                      );
                    })}
                    {Array.from(cluster.nodes.values()).map((nNode) => (
                      <circle
                        key={`cn-r-${r}-${nNode.localId}`}
                        cx={nNode.x}
                        cy={nNode.y}
                        r={rCat}
                        fill={rowFill}
                        stroke={rowStroke}
                        strokeWidth={1.45}
                      />
                    ))}
                  </g>
                );
              })}

              {/* Stage 4: Non-pivot spiders/chunks (single node if deg <= 3, SpiderCat subgraph if deg >= 4) */}
              {npChunkGroups.map((grp) => {
                const y = yForQubit(grp.npCol);
                const numChunks = useHookSplits ? grp.rowChunks.length : 1;

                return Array.from({ length: numChunks }, (_, cIdx) => {
                  const key = `${grp.npIdx}-${cIdx}`;
                  const cluster = npChunkCatClusters.get(key);
                  if (!cluster) {
                    const cx = getChunkX(grp.npIdx, cIdx, numChunks);
                    return (
                      <circle
                        key={`cat-np-single-${key}`}
                        cx={cx}
                        cy={y}
                        r={rMain}
                        fill={colFill}
                        stroke={colStroke}
                        strokeWidth={1.8}
                      />
                    );
                  }
                  return (
                    <g key={`cat-np-${key}`}>
                      {cluster.internalEdges.map((ie, idx) => {
                        const u = cluster.nodes.get(ie.u);
                        const v = cluster.nodes.get(ie.v);
                        if (!u || !v) return null;
                        return (
                          <line
                            key={`ie-np-${key}-${idx}`}
                            x1={u.x}
                            y1={u.y}
                            x2={v.x}
                            y2={v.y}
                            stroke="#334155"
                            strokeWidth={1.6}
                          />
                        );
                      })}
                      {Array.from(cluster.nodes.values()).map((nNode) => (
                        <circle
                          key={`cn-np-${key}-${nNode.localId}`}
                          cx={nNode.x}
                          cy={nNode.y}
                          r={rCat}
                          fill={colFill}
                          stroke={colStroke}
                          strokeWidth={1.45}
                        />
                      ))}
                    </g>
                  );
                });
              })}
            </>
          )}
        </svg>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs">
        {/* Header with Right-Aligned 2-Line Controls */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-purple-700 font-semibold mb-1">
              <GitBranch className="w-3.5 h-3.5" />
              <span>Phase 2B • Fault-Equivalent ZX-Rewrites</span>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900">
              Fault-Equivalent ZX-Rewrites ([[{n}, {validation.k}, {d}]])
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any internal edge in the noisy diagram or any split edge in the safe hook-error diagram to see fault propagation.
            </p>
          </div>

          {/* Right-aligned two-line Fault & Safe Hook Splits controls */}
          <div className="flex flex-col items-end gap-2 ml-auto">
            <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
              <span className="px-2 text-slate-500 font-mono text-[11px]">
                Fault:
              </span>
              <button
                type="button"
                onClick={() => setFaultBasis('X')}
                className={`px-2.5 py-1 rounded-md font-mono font-semibold transition-all cursor-pointer ${
                  faultBasis === 'X'
                    ? 'bg-rose-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                X(π)
              </button>
              <button
                type="button"
                onClick={() => setFaultBasis('Z')}
                className={`px-2.5 py-1 rounded-md font-mono font-semibold transition-all cursor-pointer ${
                  faultBasis === 'Z'
                    ? 'bg-emerald-700 text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                Z(π)
              </button>
            </div>

            {d === 3 && (
              <label className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useHookSplits}
                  onChange={(e) => setAnalyzeHookErrors(e.target.checked)}
                  className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                />
                <span>Safe Hook Splits ({safeSplits.length})</span>
              </label>
            )}
          </div>
        </div>

        {/* Stepper Navigation Bar with Tactile Pushable Buttons & Animated Title */}
        <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 mb-4 rounded-xl bg-slate-50 border border-slate-200/90">
          <button
            type="button"
            disabled={safeRewriteStep === 0}
            onClick={() =>
              setRewriteStep(Math.max(0, safeRewriteStep - 1))
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:translate-y-0.5 text-white border-b-2 border-purple-800 shadow-sm hover:shadow disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-300 disabled:shadow-none disabled:pointer-events-none text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Prev Rewrite</span>
          </button>

          <div
            key={`${safeRewriteStep}-${activeRewriteSteps.length}`}
            className="flex items-center gap-2.5 text-center animate-fade-in"
          >
            <span className="px-2.5 py-0.5 rounded-md bg-purple-100 text-purple-900 font-mono text-xs font-bold border border-purple-200">
              Step {safeRewriteStep + 1} / {activeRewriteSteps.length}
            </span>
            <span className="text-xs sm:text-sm font-semibold text-slate-800 flex items-center gap-2">
              <span>{currentStepSpec.leftTitle}</span>
              <MathTex
                tex={
                  currentStepSpec.eqSub
                    ? `\\underset{\\text{${currentStepSpec.eqSub}}}{\\mathrel{\\widehat{=}}}`
                    : '\\mathrel{\\widehat{=}}'
                }
                className="text-base text-slate-700"
              />
              <span>{currentStepSpec.rightTitle}</span>
            </span>
          </div>

          <button
            type="button"
            disabled={safeRewriteStep >= activeRewriteSteps.length - 1}
            onClick={() =>
              setRewriteStep(
                Math.min(activeRewriteSteps.length - 1, safeRewriteStep + 1)
              )
            }
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 active:translate-y-0.5 text-white border-b-2 border-purple-800 shadow-sm hover:shadow disabled:bg-slate-200 disabled:text-slate-400 disabled:border-slate-300 disabled:shadow-none disabled:pointer-events-none text-xs sm:text-sm font-bold transition-all cursor-pointer"
          >
            <span>Next Rewrite</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {/* Two Side-by-Side ZX Diagrams with KaTeX \FaultEq Between Them */}
        <div
          key={`pair-${safeRewriteStep}-${activeRewriteSteps.length}`}
          className="flex flex-col md:flex-row items-center justify-center gap-4 py-2 transition-all duration-300"
        >
          {renderDiagramPanel(currentStepSpec.leftStage)}
          <FaultEqSymbol
            sub={currentStepSpec.eqSub}
            className="my-2 md:my-0 shrink-0 px-2"
          />
          {renderDiagramPanel(currentStepSpec.rightStage)}
        </div>

        {/* Bottom Right-Aligned "Show Pipeline" Action Button */}
        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={() => setPostPhase2Branch('pipeline')}
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:translate-y-0.5 border-b-2 border-emerald-800 text-white text-sm font-bold shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <span>Show Pipeline</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
