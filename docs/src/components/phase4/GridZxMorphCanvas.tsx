import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { BasisType } from '../../engine/types';
import {
  CatStateExtractor,
  edKey,
  MEASUREMENT_GATES,
  RESET_GATES,
  TWO_QUBIT_GATES,
} from '../../engine/circuitExtraction';
import {
  getUndirectedEdges,
  hasUndirectedEdge,
  topologicalGenerations,
} from '../../engine/catState';
import {
  nodeMapKey,
  type GlobalPipelineSetup,
} from '../../engine/spiderLegMatcher';
import { Math as KaTeXMath } from '../common/Math';

export type MorphStage = 'a' | 'b' | 'c' | 'd';

interface GridZxMorphCanvasProps {
  pipeline: GlobalPipelineSetup;
  basis: BasisType;
  stage: MorphStage;
  onSelectStage: (stage: MorphStage) => void;
}

const STAGE_META: Array<{
  id: MorphStage;
  shortTitle: string;
  figureLabel: string;
  subtitle: string;
  description: string;
}> = [
  {
    id: 'a',
    shortTitle: '(a) Completed G_global',
    figureLabel: 'Fig. 7(a)',
    subtitle: '3-ary ZX graph with spanning forest F & roots r_k',
    description:
      'After Algorithm 1 completes, G_global is a 3-ary ZX-diagram equipped with spanning forest F (bold edges), root nodes r_k (blue boxes), and acyclic causal DAG D_global.',
  },
  {
    id: 'b',
    shortTitle: '(b) 2D Grid-Aligned ZX',
    figureLabel: 'Fig. 7(b)',
    subtitle: 'X = topological generation in D_global, Y = tree wire in F',
    description:
      'Each spanning tree path in F becomes a horizontal qubit wire (data wires q_0..q_{n-1} + flag ancilla wires f_k), and each spider is placed at its causal generation X in D_global.',
  },
  {
    id: 'c',
    shortTitle: '(c) Identity-Padded & Unfused ZX',
    figureLabel: 'Fig. 7(c)',
    subtitle: 'Vertical Z–X CNOT columns + unfused |0⟩/|+⟩ starts & ⟨0|/⟨+| ends',
    description:
      'Internal and external CNOT edges are aligned into vertical Z–X spider pairs, root starts unfuse into degree-1 |0⟩ (red) or |+⟩ (green) spiders, and flag ends unfuse into post-selection spiders.',
  },
  {
    id: 'd',
    shortTitle: '(d) Extracted Quantum Circuit',
    figureLabel: 'Fig. 7(d)',
    subtitle: 'Direct translation of vertical Z–X spider pairs into CX gates',
    description:
      'Every vertical (Z-spider, X-spider) pair becomes a CNOT gate (control • on the Z-spider wire, target ⊕ on the X-spider wire), degree-1 starts become |0⟩/|+⟩ resets, and flag ends become meters.',
  },
];

export const GridZxMorphCanvas: React.FC<GridZxMorphCanvasProps> = ({
  pipeline,
  basis,
  stage,
  onSelectStage,
}) => {
  const {
    N,
    pivots,
    nonPivots,
    zStates,
    xStates,
    zNodeMapping,
    xNodeMapping,
    finalG,
    globalF,
    globalRoots,
    finalD,
    globalPrimaryPaths,
    nodeOrder,
  } = pipeline;

  // Run CatStateExtractor to get exact wire assignments and column operations for stages (b), (c), (d)
  const extractionData = useMemo(() => {
    const extractor = new CatStateExtractor();
    const rawInstructions = extractor.extract(
      finalG,
      globalF,
      globalRoots,
      finalD,
      globalPrimaryPaths,
      nodeOrder
    );

    // 1. Stage (a) organic cluster positions
    const stageAPos = new Map<number, { x: number; y: number }>();
    const placeClusterNodes = (
      kind: 'Z' | 'X',
      compIdx: number,
      st: (typeof zStates)[number],
      mapping: Map<string, number>,
      boxX: number,
      boxY: number,
      boxW: number,
      boxH: number
    ) => {
      const gens = topologicalGenerations(st.D);
      const numL = Math.max(1, gens.length);
      gens.forEach((layer, lIdx) => {
        const fx = numL === 1 ? 0.5 : lIdx / Math.max(1, numL - 1);
        const x =
          kind === 'Z'
            ? boxX + 24 + fx * (boxW - 48)
            : boxX + boxW - 24 - fx * (boxW - 48);
        layer.forEach((localId, nIdx) => {
          const fy =
            layer.length === 1 ? 0.5 : nIdx / Math.max(1, layer.length - 1);
          let y = boxY + 18 + fy * (boxH - 36);
          if (st.G.nodes.size >= 4 && layer.length === 1 && lIdx > 0 && lIdx < numL - 1) {
            y += lIdx % 2 === 1 ? -11 : 11;
          }
          const gId = mapping.get(nodeMapKey(compIdx, localId))!;
          stageAPos.set(gId, { x, y });
        });
      });
    };

    // Pack stage (a) into the same SVG coordinate space
    const zCount = Math.max(1, zStates.length);
    const xCount = Math.max(1, xStates.length);

    // Determine total wires from rawInstructions
    let maxWire = N - 1;
    for (const op of rawInstructions) {
      for (const t of op.targets) {
        if (t.type === 'qubit' && t.value > maxWire) maxWire = t.value;
      }
    }
    const totalWires = Math.max(N, maxWire + 1);
    const wireSpacing = totalWires <= 10 ? 34 : totalWires <= 18 ? 26 : 22;
    const topMargin = 38;
    const bottomMargin = 34;
    const svgHeight = Math.max(
      270,
      topMargin + Math.max(1, totalWires - 1) * wireSpacing + bottomMargin
    );

    const zBoxH = Math.max(46, (svgHeight - 36) / zCount - 8);
    zStates.forEach((st, i) => {
      const by = 18 + i * (zBoxH + 8);
      placeClusterNodes('Z', i, st, zNodeMapping, 70, by, 180, zBoxH);
    });

    const xBoxH = Math.max(42, (svgHeight - 36) / xCount - 8);
    xStates.forEach((st, j) => {
      const by = 18 + j * (xBoxH + 8);
      placeClusterNodes('X', j, st, xNodeMapping, 470, by, 180, xBoxH);
    });

    // 2. Stage (b) 2D Grid positions: X = topological generation in finalD, Y = assigned wire
    const gensD = topologicalGenerations(finalD);
    const nodeGen = new Map<number, number>();
    gensD.forEach((layer, gIdx) => {
      layer.forEach((nId) => nodeGen.set(nId, gIdx));
    });

    // Pack CNOT and Reset/Measurement operations into ASAP circuit columns for stages (c) and (d)
    const initBasisByWire = new Map<number, 'R' | 'RX'>();
    const measBasisByWire = new Map<number, 'M' | 'MX'>();
    const cnotColumns: Array<{
      colIndex: number;
      control: number;
      target: number;
    }> = [];

    const nextFreeCol = new Map<number, number>();
    for (const op of rawInstructions) {
      if (RESET_GATES.has(op.name)) {
        for (const t of op.targets) {
          if (t.type === 'qubit' && !initBasisByWire.has(t.value)) {
            initBasisByWire.set(t.value, op.name === 'RX' ? 'RX' : 'R');
          }
        }
      } else if (TWO_QUBIT_GATES.has(op.name)) {
        for (let k = 0; k < op.targets.length; k += 2) {
          const c = op.targets[k];
          const t = op.targets[k + 1];
          if (c?.type === 'qubit' && t?.type === 'qubit') {
            const minQ = Math.min(c.value, t.value);
            const maxQ = Math.max(c.value, t.value);
            let col = 0;
            // Ensure vertical CNOT lines in the same column don't overlap visually
            for (let q = minQ; q <= maxQ; q++) {
              col = Math.max(col, nextFreeCol.get(q) ?? 0);
            }
            cnotColumns.push({
              colIndex: col,
              control: c.value,
              target: t.value,
            });
            for (let q = minQ; q <= maxQ; q++) {
              nextFreeCol.set(q, col + 1);
            }
          }
        }
      } else if (MEASUREMENT_GATES.has(op.name)) {
        for (const t of op.targets) {
          if (t.type === 'qubit') {
            measBasisByWire.set(t.value, op.name === 'MX' ? 'MX' : 'M');
          }
        }
      }
    }

    const numCnotCols = Math.max(
      1,
      ...cnotColumns.map((c) => c.colIndex + 1)
    );
    const leftWireStart = 115;
    const colSpacing = Math.max(30, Math.min(48, 520 / Math.max(1, numCnotCols)));
    const rightWireEnd = leftWireStart + numCnotCols * colSpacing + 55;
    const svgWidth = Math.max(720, rightWireEnd + 65);

    const getWireY = (wireIdx: number) => topMargin + wireIdx * wireSpacing;
    const getColX = (colIdx: number) => leftWireStart + (colIdx + 0.5) * colSpacing;

    // Compute wire active span [firstCol, lastCol] for flag wires vs data wires
    const wireSpan = new Map<
      number,
      { startX: number; endX: number; firstCol: number; lastCol: number }
    >();
    for (let w = 0; w < totalWires; w++) {
      const matchingCols = cnotColumns
        .filter((c) => c.control === w || c.target === w)
        .map((c) => c.colIndex);
      const firstCol = matchingCols.length > 0 ? Math.min(...matchingCols) : 0;
      const lastCol =
        matchingCols.length > 0 ? Math.max(...matchingCols) : numCnotCols - 1;
      const startX =
        w < N ? leftWireStart - 22 : Math.max(leftWireStart - 16, getColX(firstCol) - 24);
      const endX =
        w < N ? rightWireEnd : Math.min(rightWireEnd - 12, getColX(lastCol) + 26);
      wireSpan.set(w, { startX, endX, firstCol, lastCol });
    }

    // Stage (b) positions for each node in finalG
    const stageBPos = new Map<number, { x: number; y: number; wire: number }>();
    const numGenB = Math.max(1, gensD.length);
    for (const [gId] of finalG.nodes.entries()) {
      const assignedWire = extractor.nodeToQubit.get(gId) ?? 0;
      const genIdx = nodeGen.get(gId) ?? 0;
      const gx =
        leftWireStart +
        (genIdx / Math.max(1, numGenB - 1)) * (rightWireEnd - leftWireStart - 45);
      const gy = getWireY(assignedWire);
      stageBPos.set(gId, { x: gx, y: gy, wire: assignedWire });
    }

    // Also include virtual flag closure nodes for Stage (b) on non-tree flag edges
    const flagClosureSegments: Array<{
      flagWire: number;
      u: number;
      v: number;
      x1: number;
      x2: number;
      yFlag: number;
      yU: number;
      yV: number;
      spiderType: BasisType;
    }> = [];

    for (const e of getUndirectedEdges(finalG)) {
      if (e.edge_type === 'cnot') continue;
      if (hasUndirectedEdge(globalF, e.source, e.target)) continue;
      const k = edKey(e.source, e.target);
      const flagWire = extractor.edgeToFlagQubit.get(k);
      if (flagWire !== undefined) {
        const pu = stageBPos.get(e.source);
        const pv = stageBPos.get(e.target);
        if (pu && pv) {
          const leftP = pu.x <= pv.x ? pu : pv;
          const rightP = pu.x <= pv.x ? pv : pu;
          flagClosureSegments.push({
            flagWire,
            u: e.source,
            v: e.target,
            x1: leftP.x,
            x2: rightP.x,
            yFlag: getWireY(flagWire),
            yU: leftP.y,
            yV: rightP.y,
            spiderType: extractor.flagSpiderTypes.get(flagWire) ?? basis,
          });
        }
      }
    }

    return {
      totalWires,
      svgWidth,
      svgHeight,
      leftWireStart,
      rightWireEnd,
      getWireY,
      getColX,
      stageAPos,
      stageBPos,
      flagClosureSegments,
      cnotColumns,
      initBasisByWire,
      measBasisByWire,
      wireSpan,
    };
  }, [
    N,
    pivots,
    nonPivots,
    zStates,
    xStates,
    zNodeMapping,
    xNodeMapping,
    finalG,
    globalF,
    globalRoots,
    finalD,
    globalPrimaryPaths,
    nodeOrder,
    basis,
  ]);

  const rootSet = useMemo(
    () => new Set<number>(Object.values(globalRoots)),
    [globalRoots]
  );

  const rootGlobalToCol = useMemo(() => {
    const m = new Map<number, number>();
    for (const [colStr, gId] of Object.entries(globalRoots)) {
      m.set(gId, Number(colStr));
    }
    return m;
  }, [globalRoots]);

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';
  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';

  const currentMeta =
    STAGE_META.find((m) => m.id === stage) ?? STAGE_META[3];
  const stageIdx = STAGE_META.findIndex((m) => m.id === stage);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3.5">
      {/* 4-Stage Morph Selector Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              Interactive 4-Stage Circuit Extraction Morph (Figure 7 of Paper)
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Step through <KaTeXMath tex="\text{(a)} \to \text{(b)} \to \text{(c)} \to \text{(d)}" /> to see how <KaTeXMath tex="(G_{\text{global}}, F, D_{\text{global}})" /> is aligned onto qubit wires and translated into CNOT gates.
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              onSelectStage(STAGE_META[Math.max(0, stageIdx - 1)].id)
            }
            disabled={stageIdx <= 0}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Prev Stage
          </button>
          <button
            type="button"
            onClick={() =>
              onSelectStage(
                STAGE_META[Math.min(STAGE_META.length - 1, stageIdx + 1)].id
              )
            }
            disabled={stageIdx >= STAGE_META.length - 1}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
          >
            Next Stage <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 4 Stage Pill Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {STAGE_META.map((item) => {
          const isActive = item.id === stage;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectStage(item.id)}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{item.shortTitle}</span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                    isActive
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.figureLabel}
                </span>
              </div>
              <div
                className={`text-[10.5px] mt-0.5 line-clamp-1 ${
                  isActive ? 'text-slate-300' : 'text-slate-500'
                }`}
              >
                {item.subtitle}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Stage Description Callout */}
      <div className="rounded-lg bg-white border border-slate-200/90 px-3.5 py-2.5 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <strong className="text-slate-900">{currentMeta.shortTitle}:</strong>{' '}
          {currentMeta.description}
        </div>
        <span className="font-mono text-[11px] text-slate-500 shrink-0">
          {N} data wires + {extractionData.totalWires - N} flag wires
        </span>
      </div>

      {/* SVG Canvas */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto custom-scrollbar p-2">
        <svg
          viewBox={`0 0 ${extractionData.svgWidth} ${extractionData.svgHeight}`}
          className="w-full min-w-[640px] h-auto select-none"
        >
          {/* Wire guide lines for Stages (b), (c), (d) */}
          {(stage === 'b' || stage === 'c' || stage === 'd') &&
            Array.from({ length: extractionData.totalWires }, (_, w) => {
              const y = extractionData.getWireY(w);
              const isData = w < N;
              const span = extractionData.wireSpan.get(w)!;

              return (
                <g key={`wire-guide-${w}`}>
                  {/* Wire label on left */}
                  <text
                    x={16}
                    y={y + 4}
                    className={`font-mono text-[10px] font-bold ${
                      isData ? 'fill-emerald-800' : 'fill-amber-800'
                    }`}
                  >
                    {isData ? `q_${w} (r_${w})` : `flag_${w - N}`}
                  </text>

                  {/* Faint full-row track */}
                  <line
                    x1={78}
                    y1={y}
                    x2={extractionData.rightWireEnd}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth={1.5}
                  />

                  {/* Active wire line */}
                  <line
                    x1={span.startX}
                    y1={y}
                    x2={span.endX}
                    y2={y}
                    stroke={isData ? '#0f172a' : '#475569'}
                    strokeWidth={stage === 'b' ? 2.4 : 2}
                    strokeDasharray={
                      stage === 'b' && !isData ? '4,3' : undefined
                    }
                  />

                  {/* Right data boundary label */}
                  {isData && (
                    <text
                      x={extractionData.rightWireEnd + 8}
                      y={y + 4}
                      className="font-mono text-[10px] font-bold fill-slate-700"
                    >
                      q_{w}
                    </text>
                  )}
                </g>
              );
            })}

          {/* STAGE (a) and STAGE (b): Render G_global nodes & edges at their respective coordinates */}
          {(stage === 'a' || stage === 'b') && (
            <g>
              {/* Edges of finalG */}
              {getUndirectedEdges(finalG).map((e, idx) => {
                const posMap =
                  stage === 'a'
                    ? extractionData.stageAPos
                    : extractionData.stageBPos;
                const p1 = posMap.get(e.source);
                const p2 = posMap.get(e.target);
                if (!p1 || !p2) return null;

                const inForest = hasUndirectedEdge(
                  globalF,
                  e.source,
                  e.target
                );
                const isCnot = e.edge_type === 'cnot';

                return (
                  <line
                    key={`ab-edge-${idx}`}
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke={
                      inForest
                        ? '#0f172a'
                        : isCnot
                        ? '#0369a1'
                        : '#ea580c'
                    }
                    strokeWidth={inForest ? 3 : 2}
                    strokeDasharray={inForest ? undefined : isCnot ? undefined : '4,3'}
                    className="transition-all duration-500"
                  />
                );
              })}

              {/* Flag closure virtual segments in Stage (b) */}
              {stage === 'b' &&
                extractionData.flagClosureSegments.map((seg, idx) => {
                  const sFill =
                    seg.spiderType === 'Z' ? '#86efac' : '#fca5a5';
                  const sStroke =
                    seg.spiderType === 'Z' ? '#15803d' : '#b91c1c';
                  return (
                    <g key={`flag-seg-${idx}`}>
                      <line
                        x1={seg.x1}
                        y1={seg.yU}
                        x2={seg.x1}
                        y2={seg.yFlag}
                        stroke="#ea580c"
                        strokeWidth={2}
                      />
                      <line
                        x1={seg.x1}
                        y1={seg.yFlag}
                        x2={seg.x2}
                        y2={seg.yFlag}
                        stroke="#0f172a"
                        strokeWidth={2.5}
                      />
                      <line
                        x1={seg.x2}
                        y1={seg.yV}
                        x2={seg.x2}
                        y2={seg.yFlag}
                        stroke="#ea580c"
                        strokeWidth={2}
                      />
                      <circle
                        cx={seg.x1}
                        cy={seg.yFlag}
                        r={8}
                        fill={sFill}
                        stroke={sStroke}
                        strokeWidth={1.8}
                      />
                      <circle
                        cx={seg.x2}
                        cy={seg.yFlag}
                        r={8}
                        fill={sFill}
                        stroke={sStroke}
                        strokeWidth={1.8}
                      />
                    </g>
                  );
                })}

              {/* Nodes of finalG */}
              {Array.from(finalG.nodes.entries()).map(([gId, nData]) => {
                const pos =
                  stage === 'a'
                    ? extractionData.stageAPos.get(gId)
                    : extractionData.stageBPos.get(gId);
                if (!pos) return null;

                const isZ = nData.compKind === 'Z';
                const fill = isZ ? rowFill : colFill;
                const stroke = isZ ? rowStroke : colStroke;
                const isRoot = rootSet.has(gId);
                const rootCol = rootGlobalToCol.get(gId);

                return (
                  <g
                    key={`ab-node-${gId}`}
                    className="transition-all duration-500"
                  >
                    {isRoot && (
                      <rect
                        x={pos.x - 13.5}
                        y={pos.y - 13.5}
                        width={27}
                        height={27}
                        rx={5}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={2.2}
                      />
                    )}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={10}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 3.5}
                      textAnchor="middle"
                      className="font-mono text-[9px] font-bold fill-slate-900"
                    >
                      {isRoot && rootCol !== undefined ? `r${rootCol}` : gId}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* STAGE (c): Identity-Padded & Unfused ZX on the 2D Grid */}
          {stage === 'c' && (
            <g>
              {/* 1. Degree-1 Unfused Initialization Spiders at Left of Each Wire */}
              {Array.from({ length: extractionData.totalWires }, (_, w) => {
                const y = extractionData.getWireY(w);
                const span = extractionData.wireSpan.get(w)!;
                const initOp = extractionData.initBasisByWire.get(w) ?? 'R';
                // In ZX-calculus: |+⟩ (RX) is a degree-1 Z (green) spider; |0⟩ (R) is a degree-1 X (red) spider
                const isPlus = initOp === 'RX';
                const fill = isPlus ? '#86efac' : '#fca5a5';
                const stroke = isPlus ? '#15803d' : '#b91c1c';

                return (
                  <g key={`c-init-${w}`}>
                    <circle
                      cx={span.startX}
                      cy={y}
                      r={8.5}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                    <text
                      x={span.startX}
                      y={y - 11}
                      textAnchor="middle"
                      className="font-mono text-[8.5px] font-semibold fill-slate-600"
                    >
                      {isPlus ? '|+⟩' : '|0⟩'}
                    </text>
                  </g>
                );
              })}

              {/* 2. Vertical Z–X Spider Pairs for Every CNOT Column */}
              {extractionData.cnotColumns.map((cnot, idx) => {
                const x = extractionData.getColX(cnot.colIndex);
                const yCtrl = extractionData.getWireY(cnot.control);
                const yTarg = extractionData.getWireY(cnot.target);

                return (
                  <g key={`c-cnot-${idx}`}>
                    <line
                      x1={x}
                      y1={yCtrl}
                      x2={x}
                      y2={yTarg}
                      stroke="#0f172a"
                      strokeWidth={2.2}
                    />
                    {/* Control is a Z-spider (green) */}
                    <circle
                      cx={x}
                      cy={yCtrl}
                      r={8.5}
                      fill="#86efac"
                      stroke="#15803d"
                      strokeWidth={2}
                    />
                    {/* Target is an X-spider (red) */}
                    <circle
                      cx={x}
                      cy={yTarg}
                      r={8.5}
                      fill="#fca5a5"
                      stroke="#b91c1c"
                      strokeWidth={2}
                    />
                  </g>
                );
              })}

              {/* 3. Degree-1 Post-Selection Spiders at Right End of Flag Wires */}
              {Array.from({ length: extractionData.totalWires }, (_, w) => {
                if (w < N) return null;
                const y = extractionData.getWireY(w);
                const span = extractionData.wireSpan.get(w)!;
                const measOp = extractionData.measBasisByWire.get(w) ?? 'M';
                // MX (<+|) is a degree-1 Z (green) spider; M (<0|) is a degree-1 X (red) spider
                const isMx = measOp === 'MX';
                const fill = isMx ? '#86efac' : '#fca5a5';
                const stroke = isMx ? '#15803d' : '#b91c1c';

                return (
                  <g key={`c-meas-${w}`}>
                    <circle
                      cx={span.endX}
                      cy={y}
                      r={8.5}
                      fill={fill}
                      stroke={stroke}
                      strokeWidth={2}
                    />
                    <text
                      x={span.endX}
                      y={y - 11}
                      textAnchor="middle"
                      className="font-mono text-[8.5px] font-semibold fill-slate-600"
                    >
                      {isMx ? '⟨+|' : '⟨0|'}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* STAGE (d): Extracted Quantum Circuit at the Exact Same Coordinates */}
          {stage === 'd' && (
            <g>
              {/* 1. State Preparation Boxes at Left of Each Wire */}
              {Array.from({ length: extractionData.totalWires }, (_, w) => {
                const y = extractionData.getWireY(w);
                const span = extractionData.wireSpan.get(w)!;
                const initOp = extractionData.initBasisByWire.get(w) ?? 'R';
                const isPlus = initOp === 'RX';

                return (
                  <g key={`d-init-${w}`}>
                    <rect
                      x={span.startX - 11}
                      y={y - 9.5}
                      width={22}
                      height={19}
                      rx={4}
                      fill={isPlus ? '#ecfdf5' : '#f8fafc'}
                      stroke={isPlus ? '#059669' : '#334155'}
                      strokeWidth={1.6}
                    />
                    <text
                      x={span.startX}
                      y={y + 3.5}
                      textAnchor="middle"
                      className="font-mono text-[9.5px] font-bold fill-slate-900"
                    >
                      {isPlus ? '|+⟩' : '|0⟩'}
                    </text>
                  </g>
                );
              })}

              {/* 2. Standard Quantum CNOT Gates (• control, ⊕ target) */}
              {extractionData.cnotColumns.map((cnot, idx) => {
                const x = extractionData.getColX(cnot.colIndex);
                const yCtrl = extractionData.getWireY(cnot.control);
                const yTarg = extractionData.getWireY(cnot.target);

                return (
                  <g key={`d-cnot-${idx}`}>
                    <line
                      x1={x}
                      y1={yCtrl}
                      x2={x}
                      y2={yTarg}
                      stroke="#0f172a"
                      strokeWidth={2}
                    />
                    {/* Control Dot • */}
                    <circle cx={x} cy={yCtrl} r={4.8} fill="#0f172a" />
                    {/* Target ⊕ */}
                    <circle
                      cx={x}
                      cy={yTarg}
                      r={8.5}
                      fill="#ffffff"
                      stroke="#0f172a"
                      strokeWidth={2}
                    />
                    <line
                      x1={x - 8.5}
                      y1={yTarg}
                      x2={x + 8.5}
                      y2={yTarg}
                      stroke="#0f172a"
                      strokeWidth={1.8}
                    />
                    <line
                      x1={x}
                      y1={yTarg - 8.5}
                      x2={x}
                      y2={yTarg + 8.5}
                      stroke="#0f172a"
                      strokeWidth={1.8}
                    />
                  </g>
                );
              })}

              {/* 3. Flag Post-Selection Measurement Meters at Right of Flag Wires */}
              {Array.from({ length: extractionData.totalWires }, (_, w) => {
                if (w < N) return null;
                const y = extractionData.getWireY(w);
                const span = extractionData.wireSpan.get(w)!;
                const measOp = extractionData.measBasisByWire.get(w) ?? 'M';
                const isMx = measOp === 'MX';

                return (
                  <g key={`d-meas-${w}`}>
                    <rect
                      x={span.endX - 12}
                      y={y - 10}
                      width={24}
                      height={20}
                      rx={4}
                      fill="#fffbeb"
                      stroke="#d97706"
                      strokeWidth={1.6}
                    />
                    {/* Meter arc & needle */}
                    <path
                      d={`M ${span.endX - 7} ${y + 4} A 7 7 0 0 1 ${
                        span.endX + 7
                      } ${y + 4}`}
                      fill="none"
                      stroke="#92400e"
                      strokeWidth={1.4}
                    />
                    <line
                      x1={span.endX}
                      y1={y + 4}
                      x2={span.endX + 4.5}
                      y2={y - 4.5}
                      stroke="#92400e"
                      strokeWidth={1.5}
                    />
                    <text
                      x={span.endX + 7.5}
                      y={y + 8}
                      textAnchor="end"
                      className="font-mono text-[6.5px] font-bold fill-amber-900"
                    >
                      {isMx ? 'X' : 'Z'}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
