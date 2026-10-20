import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import type { BasisType } from '../../engine/types';
import {
  CatStateExtractor,
  MEASUREMENT_GATES,
  RESET_GATES,
  TWO_QUBIT_GATES,
} from '../../engine/circuitExtraction';
import {
  getUndirectedEdges,
  hasUndirectedEdge,
  topologicalGenerations,
} from '../../engine/catState';
import type { GlobalPipelineSetup } from '../../engine/spiderLegMatcher';
import {
  computeGlobalTopologyLayout,
  buildUndirectedEdgePath,
} from '../phase3/globalTopologyLayout';
import { Math as KaTeXMath } from '../common/Math';

export type MorphStage = 'b' | 'c' | 'd';

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
    id: 'b',
    shortTitle: '(b) 2D Grid-Aligned ZX',
    figureLabel: 'Fig. 7(b)',
    subtitle: 'Spiders positioned by causal generation in D_global & tree wire in F',
    description:
      '2D grid-aligned ZX diagram: each spider is placed at its causal topological generation from D_global and tree wire from F, showing spanning forest F (bold), roots r_k (blue boxes), and external CNOTs (blue).',
  },
  {
    id: 'c',
    shortTitle: '(c) Identity-Padded & Unfused ZX',
    figureLabel: 'Fig. 7(c)',
    subtitle: 'Vertical Z–X CNOT columns + unfused degree-1 boundary spiders',
    description:
      'Internal and external CNOT edges are aligned into vertical Z–X spider pairs on qubit tracks, root starts unfuse into degree-1 spiders, and flag ends unfuse into post-selection spiders.',
  },
  {
    id: 'd',
    shortTitle: '(d) Extracted Quantum Circuit',
    figureLabel: 'Fig. 7(d)',
    subtitle: 'Direct translation of vertical Z–X spider pairs into CX gates',
    description:
      'Every vertical (Z-spider, X-spider) pair becomes a CNOT gate (control • on the Z-spider wire, target ⊕ on the X-spider wire), degree-1 starts become |0⟩ (red) / |+⟩ (green) resets, and flag ends become meters.',
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
    finalG,
    globalF,
    globalRoots,
    finalD,
    globalPrimaryPaths,
    nodeOrder,
  } = pipeline;

  // Run CatStateExtractor to get exact wire assignments and column operations for stages (c) and (d)
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

    // Pack CNOT and Reset/Measurement operations into ASAP circuit columns for stages (c) and (d)
    const initBasisByWire = new Map<number, 'R' | 'RX'>();
    const measBasisByWire = new Map<number, 'M' | 'MX'>();
    const cnotColumns: Array<{
      colIndex: number;
      control: number;
      target: number;
    }> = [];

    const wireLastCol = new Map<number, number>();
    const colOccupiedIntervals = new Map<number, Array<[number, number]>>();
    const canPlaceInterval = (col: number, minQ: number, maxQ: number) => {
      const list = colOccupiedIntervals.get(col);
      if (!list) return true;
      for (const [a, b] of list) {
        if (Math.max(a, minQ) <= Math.min(b, maxQ)) {
          return false;
        }
      }
      return true;
    };

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
            let col = Math.max(
              (wireLastCol.get(c.value) ?? -1) + 1,
              (wireLastCol.get(t.value) ?? -1) + 1
            );
            while (!canPlaceInterval(col, minQ, maxQ)) {
              col++;
            }
            cnotColumns.push({
              colIndex: col,
              control: c.value,
              target: t.value,
            });
            const list = colOccupiedIntervals.get(col) ?? [];
            list.push([minQ, maxQ]);
            colOccupiedIntervals.set(col, list);
            wireLastCol.set(c.value, col);
            wireLastCol.set(t.value, col);
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
    const colSpacing = numCnotCols <= 16 ? 40 : 34;
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

    return {
      totalWires,
      svgWidth,
      svgHeight,
      leftWireStart,
      rightWireEnd,
      getWireY,
      getColX,
      cnotColumns,
      initBasisByWire,
      measBasisByWire,
      wireSpan,
    };
  }, [
    N,
    finalG,
    globalF,
    globalRoots,
    finalD,
    globalPrimaryPaths,
    nodeOrder,
  ]);

  // Stage (b): Spiders positioned according to the final complete G_global
  const completedGenerations = useMemo(() => {
    const lastSnap = pipeline.stepSnapshots[pipeline.stepSnapshots.length - 1];
    return lastSnap
      ? lastSnap.dagGenerations
      : topologicalGenerations(pipeline.finalD);
  }, [pipeline]);

  const globalLayout = useMemo(() => {
    return computeGlobalTopologyLayout(pipeline, completedGenerations, basis);
  }, [pipeline, completedGenerations, basis]);

  const internalEdges = useMemo(
    () => getUndirectedEdges(pipeline.baseGlobalG),
    [pipeline.baseGlobalG]
  );

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';
  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';

  const currentMeta =
    STAGE_META.find((m) => m.id === stage) ?? STAGE_META[STAGE_META.length - 1];
  const stageIdx = STAGE_META.findIndex((m) => m.id === stage);

  const activeSvgWidth =
    stage === 'b' ? globalLayout.svgWidth : extractionData.svgWidth;
  const activeSvgHeight =
    stage === 'b' ? globalLayout.svgHeight : extractionData.svgHeight;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3.5">
      {/* 3-Stage Morph Selector Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              Interactive 3-Stage Circuit Extraction Morph (Figure 7 of Paper)
            </span>
          </div>
          <p className="text-[11px] text-slate-600 mt-0.5">
            Step through <KaTeXMath tex="\text{(b)} \to \text{(c)} \to \text{(d)}" /> to see how <KaTeXMath tex="(G_{\text{global}}, F, D_{\text{global}})" /> is aligned onto qubit wires and translated into CNOT gates.
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

      {/* 3 Stage Pill Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
          viewBox={`0 0 ${activeSvgWidth} ${activeSvgHeight}`}
          className="w-full min-w-[640px] h-auto select-none"
        >
          {/* STAGE (b): 2D Grid-Aligned ZX (Using Spider Positions from Final Complete G_global) */}
          {stage === 'b' && (
            <g>
              {/* 1. Data Qubit Horizontal Wire Guide Lines */}
              {Array.from({ length: N }, (_, q) => {
                const rootNodeId = globalRoots[q];
                const rootPos = globalLayout.posMap.get(rootNodeId);
                const y = rootPos ? rootPos.y : 38 + q * 34;
                const rightX = globalLayout.rightBoundaryX;

                return (
                  <g key={`b-wire-guide-${q}`}>
                    {/* Wire label on left */}
                    <text
                      x={16}
                      y={y + 4}
                      className="font-mono text-[10px] font-bold fill-emerald-800"
                    >
                      q_{q} (r_{q})
                    </text>

                    {/* Faint full-row track */}
                    <line
                      x1={78}
                      y1={y}
                      x2={rightX}
                      y2={y}
                      stroke="#f1f5f9"
                      strokeWidth={1.5}
                    />

                    {/* Active data wire line from root to output boundary */}
                    <line
                      x1={rootPos ? rootPos.x : 78}
                      y1={y}
                      x2={rightX}
                      y2={y}
                      stroke="#0f172a"
                      strokeWidth={2}
                    />

                    {/* Right boundary terminal circle & label */}
                    <circle cx={rightX} cy={y} r={3} fill="#0f172a" />
                    <text
                      x={rightX + 8}
                      y={y + 4}
                      className="font-mono text-[10px] font-bold fill-slate-700"
                    >
                      q_{q}
                    </text>
                  </g>
                );
              })}

              {/* 2. Internal Edges of baseGlobalG (Bold for Spanning Forest F, Dashed for cycle closures) */}
              {internalEdges.map((e, idx) => {
                const p1 = globalLayout.posMap.get(e.source);
                const p2 = globalLayout.posMap.get(e.target);
                if (!p1 || !p2) return null;
                const inForest = hasUndirectedEdge(globalF, e.source, e.target);
                const dPath = buildUndirectedEdgePath(p1.x, p1.y, p2.x, p2.y);
                if (!dPath) return null;

                return (
                  <path
                    key={`b-int-${idx}`}
                    d={dPath}
                    fill="none"
                    stroke={inForest ? '#0f172a' : '#64748b'}
                    strokeWidth={inForest ? 3 : 1.8}
                    strokeDasharray={inForest ? undefined : '4,3'}
                  />
                );
              })}

              {/* 3. External CNOT Edges from Algorithm 1 */}
              {pipeline.stepSnapshots.map((snap) => {
                const pZ = globalLayout.posMap.get(snap.zGlobalNode);
                const pX = globalLayout.posMap.get(snap.xGlobalNode);
                if (!pZ || !pX) return null;
                const dPath = buildUndirectedEdgePath(pZ.x, pZ.y, pX.x, pX.y);
                if (!dPath) return null;

                return (
                  <path
                    key={`b-cnot-${snap.stepIndex}`}
                    d={dPath}
                    fill="none"
                    stroke="#0369a1"
                    strokeWidth={2.4}
                    strokeOpacity={0.85}
                  />
                );
              })}

              {/* 4. Spider Nodes & Root Highlights */}
              {Array.from(globalLayout.posMap.entries()).map(([gId, pos]) => {
                const isZ = pos.compKind === 'Z';
                const fill = isZ ? rowFill : colFill;
                const stroke = isZ ? rowStroke : colStroke;

                return (
                  <g key={`b-node-${gId}`}>
                    {/* Root node blue square highlight */}
                    {pos.isRoot && (
                      <g>
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
                        <text
                          x={pos.x}
                          y={pos.y + 22}
                          textAnchor="middle"
                          fontSize={9}
                          className="font-mono font-bold fill-blue-700"
                        >
                          r_{pos.rootTreeCol}
                        </text>
                      </g>
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
                      fontSize={9}
                      className="font-mono font-bold fill-slate-900"
                    >
                      {gId}
                    </text>
                  </g>
                );
              })}
            </g>
          )}

          {/* Wire guide lines for Stages (c) and (d) */}
          {(stage === 'c' || stage === 'd') &&
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
                    strokeWidth={2}
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

          {/* STAGE (c): Identity-Padded & Unfused ZX on the 2D Grid */}
          {stage === 'c' && (
            <g>
              {/* 1. Degree-1 Unfused Initialization Spiders at Left of Each Wire (No |+⟩ / |0⟩ text labels) */}
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

              {/* 3. Degree-1 Post-Selection Spiders at Right End of Flag Wires (No ⟨+| / ⟨0| text labels) */}
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
                      fill={isPlus ? '#ecfdf5' : '#fff1f2'}
                      stroke={isPlus ? '#059669' : '#dc2626'}
                      strokeWidth={1.6}
                    />
                    <text
                      x={span.startX}
                      y={y + 3.5}
                      textAnchor="middle"
                      className={`font-mono text-[9.5px] font-bold ${
                        isPlus ? 'fill-emerald-950' : 'fill-rose-950'
                      }`}
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
                      fill={isMx ? '#ecfdf5' : '#fff1f2'}
                      stroke={isMx ? '#059669' : '#dc2626'}
                      strokeWidth={1.6}
                    />
                    {/* Meter arc & needle */}
                    <path
                      d={`M ${span.endX - 7} ${y + 4} A 7 7 0 0 1 ${
                        span.endX + 7
                      } ${y + 4}`}
                      fill="none"
                      stroke={isMx ? '#047857' : '#991b1b'}
                      strokeWidth={1.4}
                    />
                    <line
                      x1={span.endX}
                      y1={y + 4}
                      x2={span.endX + 4.5}
                      y2={y - 4.5}
                      stroke={isMx ? '#047857' : '#991b1b'}
                      strokeWidth={1.5}
                    />
                    <text
                      x={span.endX + 7.5}
                      y={y + 8}
                      textAnchor="end"
                      className={`font-mono text-[6.5px] font-bold ${
                        isMx ? 'fill-emerald-900' : 'fill-rose-900'
                      }`}
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

      {/* Dynamic Legend based on active Stage */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600">
        {stage === 'b' ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-300 border border-emerald-700 inline-block"></span>
              Z-Spider
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-300 border border-rose-700 inline-block"></span>
              X-Spider
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs border-2 border-blue-600 inline-block"></span>
              Root r_k
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-slate-900 inline-block"></span>
              Spanning Forest F
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t-2 border-dashed border-slate-500 inline-block"></span>
              Non-Tree Closure
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-sky-700 inline-block"></span>
              External CNOT Edge
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-slate-900 inline-block"></span>
              Data Qubit Wire (q_0..q_{N - 1})
            </span>
          </>
        ) : stage === 'c' ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-300 border border-emerald-700 inline-block"></span>
              Z-Spider (Control •)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-rose-300 border border-rose-700 inline-block"></span>
              X-Spider (Target ⊕)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-slate-900 inline-block"></span>
              Vertical CNOT Column
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block"></span>
              Degree-1 Boundary Spider
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-50 border border-rose-600 text-rose-900 font-bold inline-block">
                |0⟩
              </span>
              |0⟩ Reset (X-basis)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 border border-emerald-600 text-emerald-900 font-bold inline-block">
                |+⟩
              </span>
              |+⟩ Reset (Z-basis)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-flex items-center gap-0.5 font-bold text-slate-800">
                <span className="w-2 h-2 rounded-full bg-slate-900"></span>—
                <span className="w-2.5 h-2.5 rounded-full border border-slate-900 flex items-center justify-center text-[7px]">
                  +
                </span>
              </span>
              CX Gate
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-50 border border-emerald-600 text-emerald-900 font-bold inline-block">
                X
              </span>
              X Measurement (green)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-50 border border-rose-600 text-rose-900 font-bold inline-block">
                Z
              </span>
              Z / Flag Measurement (red)
            </span>
          </>
        )}
      </div>
    </div>
  );
};
