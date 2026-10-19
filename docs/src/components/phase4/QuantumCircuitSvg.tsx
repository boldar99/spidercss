import React, { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { CompiledCircuitResult } from '../../engine/types';
import {
  MEASUREMENT_GATES,
  RESET_GATES,
  SPECIAL_GATES,
  TWO_QUBIT_GATES,
} from '../../engine/circuitExtraction';

interface QuantumCircuitSvgProps {
  compiled: CompiledCircuitResult;
}

interface PlacedSingleOp {
  kind: 'reset' | 'h' | 'meas';
  opName: string;
  qubit: number;
  col: number;
  cycleIdx: number;
}

interface PlacedCnotOp {
  control: number;
  target: number;
  col: number;
}

interface WireLifetimeSpan {
  qubit: number;
  cycleIdx: number;
  startCol: number;
  endCol: number;
  isData: boolean;
}

const CYCLE_COLORS = [
  { fill: '#fef3c7', stroke: '#f59e0b' },
  { fill: '#f3e8ff', stroke: '#9333ea' },
  { fill: '#e0f2fe', stroke: '#0284c7' },
  { fill: '#fce7f3', stroke: '#db2777' },
  { fill: '#dcfce7', stroke: '#16a34a' },
];

export const QuantumCircuitSvg: React.FC<QuantumCircuitSvgProps> = ({
  compiled,
}) => {
  const [showLifetimeBands, setShowLifetimeBands] = useState(true);
  const [userZoom, setUserZoom] = useState<number | 'fit' | null>(null);
  const [hoveredQubit, setHoveredQubit] = useState<number | null>(null);

  const { instructions, numQubits, numDataQubits, logicalToPhysical } =
    compiled;

  // Count how many logical qubits map to each physical wire
  const reuseCountsByWire = useMemo(() => {
    const counts = new Map<number, number>();
    for (const phys of Object.values(logicalToPhysical)) {
      counts.set(phys, (counts.get(phys) ?? 0) + 1);
    }
    return counts;
  }, [logicalToPhysical]);

  // Pack instructions into visual columns without blocking intermediate wires across future columns
  const layout = useMemo(() => {
    const singleOps: PlacedSingleOp[] = [];
    const cnotOps: PlacedCnotOp[] = [];
    const wireLastCol = new Map<number, number>();
    const activeCycleIdx = new Map<number, number>();
    const openStartCol = new Map<number, number>();
    const pendingResets = new Map<
      number,
      { opName: string; cycleIdx: number; earliestCol: number }
    >();
    const colOccupiedIntervals = new Map<number, Array<[number, number]>>();
    const spans: WireLifetimeSpan[] = [];

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

    const occupyInterval = (col: number, minQ: number, maxQ: number) => {
      const list = colOccupiedIntervals.get(col) ?? [];
      list.push([minQ, maxQ]);
      colOccupiedIntervals.set(col, list);
    };

    const findResetColBefore = (
      q: number,
      earliestCol: number,
      beforeCol: number
    ): number | null => {
      for (let c = beforeCol - 1; c >= earliestCol; c--) {
        if (canPlaceInterval(c, q, q)) {
          return c;
        }
      }
      return null;
    };

    const flushPendingReset = (q: number, beforeCol: number) => {
      const pr = pendingResets.get(q);
      if (!pr) return;
      pendingResets.delete(q);
      const rCol =
        findResetColBefore(q, pr.earliestCol, beforeCol) ?? pr.earliestCol;
      singleOps.push({
        kind: 'reset',
        opName: pr.opName,
        qubit: q,
        col: rCol,
        cycleIdx: pr.cycleIdx,
      });
      occupyInterval(rCol, q, q);
      openStartCol.set(q, rCol);
      wireLastCol.set(q, Math.max(wireLastCol.get(q) ?? -1, rCol));
    };

    for (const inst of instructions) {
      if (SPECIAL_GATES.has(inst.name)) continue;

      if (RESET_GATES.has(inst.name)) {
        for (const t of inst.targets) {
          if (t.type !== 'qubit') continue;
          const q = t.value;
          const earliestCol = (wireLastCol.get(q) ?? -1) + 1;
          const cyc = activeCycleIdx.get(q) ?? 0;
          pendingResets.set(q, {
            opName: inst.name,
            cycleIdx: cyc,
            earliestCol,
          });
        }
      } else if (inst.name === 'H') {
        for (const t of inst.targets) {
          if (t.type !== 'qubit') continue;
          const q = t.value;
          const pr = pendingResets.get(q);
          let col = pr
            ? pr.earliestCol + 1
            : (wireLastCol.get(q) ?? -1) + 1;
          while (
            !canPlaceInterval(col, q, q) ||
            (pr && findResetColBefore(q, pr.earliestCol, col) === null)
          ) {
            col++;
          }
          flushPendingReset(q, col);
          const cyc = activeCycleIdx.get(q) ?? 0;
          singleOps.push({
            kind: 'h',
            opName: 'H',
            qubit: q,
            col,
            cycleIdx: cyc,
          });
          occupyInterval(col, q, q);
          wireLastCol.set(q, col);
        }
      } else if (TWO_QUBIT_GATES.has(inst.name)) {
        for (let i = 0; i < inst.targets.length; i += 2) {
          const c = inst.targets[i];
          const t = inst.targets[i + 1];
          // Skip classical feedback CX rec[...] q for main unitary wire rendering
          if (!c || !t || c.type !== 'qubit' || t.type !== 'qubit') continue;
          const qC = c.value;
          const qT = t.value;
          const minQ = Math.min(qC, qT);
          const maxQ = Math.max(qC, qT);

          const prC = pendingResets.get(qC);
          const prT = pendingResets.get(qT);
          const minColC = prC
            ? prC.earliestCol + 1
            : (wireLastCol.get(qC) ?? -1) + 1;
          const minColT = prT
            ? prT.earliestCol + 1
            : (wireLastCol.get(qT) ?? -1) + 1;

          let col = Math.max(minColC, minColT);
          while (
            !canPlaceInterval(col, minQ, maxQ) ||
            (prC && findResetColBefore(qC, prC.earliestCol, col) === null) ||
            (prT && findResetColBefore(qT, prT.earliestCol, col) === null)
          ) {
            col++;
          }

          flushPendingReset(qC, col);
          flushPendingReset(qT, col);

          cnotOps.push({
            control: qC,
            target: qT,
            col,
          });
          occupyInterval(col, minQ, maxQ);
          // Only advance the control and target wires, NOT intermediate wires!
          wireLastCol.set(qC, col);
          wireLastCol.set(qT, col);
        }
      } else if (MEASUREMENT_GATES.has(inst.name)) {
        for (const t of inst.targets) {
          if (t.type !== 'qubit') continue;
          const q = t.value;
          const pr = pendingResets.get(q);
          let col = pr
            ? pr.earliestCol + 1
            : (wireLastCol.get(q) ?? -1) + 1;
          while (
            !canPlaceInterval(col, q, q) ||
            (pr && findResetColBefore(q, pr.earliestCol, col) === null)
          ) {
            col++;
          }
          flushPendingReset(q, col);
          const cyc = activeCycleIdx.get(q) ?? 0;
          singleOps.push({
            kind: 'meas',
            opName: inst.name,
            qubit: q,
            col,
            cycleIdx: cyc,
          });
          occupyInterval(col, q, q);
          const startCol = openStartCol.get(q) ?? 0;
          spans.push({
            qubit: q,
            cycleIdx: cyc,
            startCol,
            endCol: col,
            isData: q < numDataQubits,
          });
          openStartCol.delete(q);
          activeCycleIdx.set(q, cyc + 1);
          wireLastCol.set(q, col);
        }
      }
    }

    // Flush any remaining pending resets (e.g. idle data wires)
    for (const [q, pr] of Array.from(pendingResets.entries())) {
      flushPendingReset(q, pr.earliestCol + 1);
    }

    const totalCols = Math.max(
      2,
      ...Array.from(wireLastCol.values()).map((c) => c + 1),
      ...cnotOps.map((c) => c.col + 1)
    );

    // Close remaining open spans (data qubits)
    for (let q = 0; q < numQubits; q++) {
      if (openStartCol.has(q)) {
        spans.push({
          qubit: q,
          cycleIdx: activeCycleIdx.get(q) ?? 0,
          startCol: openStartCol.get(q)!,
          endCol: totalCols,
          isData: q < numDataQubits,
        });
      }
    }

    const wireSpacing = numQubits <= 12 ? 34 : numQubits <= 24 ? 30 : 27;
    const colSpacing = totalCols <= 20 ? 34 : 32;
    const leftPad = 20;
    const rightPad = 48;
    const topPad = 22;
    const bottomPad = 24;

    const circuitWidth = Math.max(
      560,
      leftPad + (totalCols + 1) * colSpacing + rightPad
    );
    const svgHeight = Math.max(
      240,
      topPad + Math.max(1, numQubits - 1) * wireSpacing + bottomPad
    );

    const getWireY = (q: number) => topPad + q * wireSpacing;
    const getColX = (col: number) => leftPad + (col + 0.5) * colSpacing;

    return {
      singleOps,
      cnotOps,
      spans,
      totalCols,
      wireSpacing,
      circuitWidth,
      svgHeight,
      leftPad,
      topPad,
      getWireY,
      getColX,
    };
  }, [instructions, numQubits, numDataQubits]);

  const gutterWidth = 124;

  // For wide circuits or large codes (like 31_1_7), default to 100% native scale so gates are crisp;
  // for compact circuits, default to 'fit'.
  const isLargeCircuit = layout.circuitWidth > 900 || numQubits > 16;
  const effectiveZoomMode =
    userZoom !== null ? userZoom : isLargeCircuit ? 1 : 'fit';
  const numericZoom = effectiveZoomMode === 'fit' ? 1 : effectiveZoomMode;
  const scaledHeight =
    effectiveZoomMode === 'fit'
      ? layout.svgHeight
      : Math.round(layout.svgHeight * numericZoom);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      {/* Header, Lifetime Band Toggle & Zoom Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            Compiled Quantum Circuit Diagram ({compiled.numQubits} Physical Qubits, {compiled.numCx} CNOTs, Depth {compiled.cnotDepth})
          </h4>
          <p className="text-[11px] text-slate-500">
            Data wires <code className="font-mono">q_0..q_{numDataQubits - 1}</code> persist to the output boundary; flag wires <code className="font-mono">q_{numDataQubits}..q_{numQubits - 1}</code> are measured and recycled when Qubit Reuse is enabled.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showLifetimeBands}
              onChange={(e) => setShowLifetimeBands(e.target.checked)}
              className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
            />
            <span>Highlight Ancilla Reuse Lifetimes</span>
          </label>

          {/* Zoom / Fit Controls */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-mono">
            <button
              type="button"
              onClick={() =>
                setUserZoom(
                  Math.max(0.4, Number((numericZoom - 0.2).toFixed(2)))
                )
              }
              title="Zoom Out"
              className="p-1 rounded hover:bg-white text-slate-700 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setUserZoom(1)}
              title="Reset to 100% scale"
              className="px-1.5 py-0.5 rounded hover:bg-white text-slate-700 cursor-pointer"
            >
              {effectiveZoomMode === 'fit'
                ? 'Fit'
                : `${Math.round(numericZoom * 100)}%`}
            </button>
            <button
              type="button"
              onClick={() =>
                setUserZoom(
                  Math.min(2.5, Number((numericZoom + 0.2).toFixed(2)))
                )
              }
              title="Zoom In"
              className="p-1 rounded hover:bg-white text-slate-700 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                setUserZoom(effectiveZoomMode === 'fit' ? 1 : 'fit')
              }
              title="Toggle Fit to Width vs 100% Scrollable"
              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border cursor-pointer ${
                effectiveZoomMode === 'fit'
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Maximize2 className="w-3 h-3" /> Fit
            </button>
          </div>
        </div>
      </div>

      {/* Scrollable Container with Sticky Left Gutter */}
      <div className="square-panel-wrapper">
        <div className="square-panel-scroll custom-scrollbar bg-slate-50/50 rounded-xl border border-slate-200/80 p-0 relative">
          <div
            className="flex relative"
            style={{
              width:
                effectiveZoomMode === 'fit'
                  ? '100%'
                  : `${gutterWidth + Math.round(layout.circuitWidth * numericZoom)}px`,
              minWidth: `${gutterWidth + 480}px`,
            }}
          >
            {/* 1. Sticky Left Gutter for Qubit Labels (always visible while scrolling horizontally!) */}
            <div
              className="sticky left-0 z-20 bg-white/95 border-r border-slate-200 backdrop-blur-xs shrink-0 select-none shadow-2xs"
              style={{
                width: `${gutterWidth}px`,
                height: `${scaledHeight}px`,
              }}
            >
              <svg
                width={gutterWidth}
                height={scaledHeight}
                viewBox={`0 0 ${gutterWidth} ${layout.svgHeight}`}
                className="block"
              >
                {/* Header label */}
                <text
                  x={12}
                  y={18}
                  className="font-mono text-[9px] font-bold fill-slate-400 uppercase tracking-wider"
                >
                  Wire / Qubit
                </text>

                {/* Qubit wire labels */}
                {Array.from({ length: numQubits }, (_, q) => {
                  const y = layout.getWireY(q);
                  const isData = q < numDataQubits;
                  const reuseCount = reuseCountsByWire.get(q) ?? 1;
                  const isHovered = hoveredQubit === q;

                  return (
                    <g
                      key={`lbl-${q}`}
                      onMouseEnter={() => setHoveredQubit(q)}
                      onMouseLeave={() => setHoveredQubit(null)}
                      className="cursor-pointer"
                    >
                      {isHovered && (
                        <rect
                          x={0}
                          y={y - layout.wireSpacing / 2}
                          width={gutterWidth}
                          height={layout.wireSpacing}
                          fill="#ecfdf5"
                        />
                      )}
                      <circle
                        cx={14}
                        cy={y}
                        r={3}
                        fill={isData ? '#059669' : '#64748b'}
                      />
                      <text
                        x={23}
                        y={y + 3.5}
                        className={`font-mono text-[10.5px] font-semibold ${
                          isData ? 'fill-emerald-800 font-bold' : 'fill-slate-700'
                        }`}
                      >
                        {isData ? `data[${q}]` : `anc[${q - numDataQubits}]`}
                      </text>
                      {reuseCount > 1 && (
                        <text
                          x={gutterWidth - 8}
                          y={y + 3.5}
                          textAnchor="end"
                          className="font-mono text-[8.5px] font-bold fill-purple-700"
                        >
                          ×{reuseCount}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* 2. Scrollable Circuit Canvas */}
            <div
              className="shrink-0"
              style={{
                width:
                  effectiveZoomMode === 'fit'
                    ? `calc(100% - ${gutterWidth}px)`
                    : `${Math.round(layout.circuitWidth * numericZoom)}px`,
                height: `${scaledHeight}px`,
              }}
            >
              <svg
                width={
                  effectiveZoomMode === 'fit'
                    ? '100%'
                    : Math.round(layout.circuitWidth * numericZoom)
                }
                height={scaledHeight}
                viewBox={`0 0 ${layout.circuitWidth} ${layout.svgHeight}`}
                className="select-none block"
              >
                {/* 1. Background Wire Tracks & Highlight Hover Bands */}
                {Array.from({ length: numQubits }, (_, q) => {
                  const y = layout.getWireY(q);
                  const isData = q < numDataQubits;
                  const isHovered = hoveredQubit === q;
                  const rightEnd = layout.circuitWidth - 36;

                  return (
                    <g
                      key={`track-${q}`}
                      onMouseEnter={() => setHoveredQubit(q)}
                      onMouseLeave={() => setHoveredQubit(null)}
                    >
                      {isHovered && (
                        <rect
                          x={0}
                          y={y - layout.wireSpacing / 2}
                          width={layout.circuitWidth}
                          height={layout.wireSpacing}
                          fill="#ecfdf5"
                          fillOpacity={0.7}
                        />
                      )}

                      {/* Horizontal Wire Line */}
                      <line
                        x1={layout.leftPad - 8}
                        y1={y}
                        x2={rightEnd}
                        y2={y}
                        stroke={isHovered ? '#059669' : '#cbd5e1'}
                        strokeWidth={isHovered ? 1.8 : isData ? 1.4 : 1.1}
                        strokeDasharray={isData ? undefined : '4,4'}
                      />

                      {/* Right Output Label for Data Qubits */}
                      {isData && (
                        <text
                          x={rightEnd + 8}
                          y={y + 3.5}
                          className="font-mono text-[10px] font-bold fill-emerald-800"
                        >
                          q_{q}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* 2. Active Lifetime Bands & Solid Active Wire Segments */}
                {layout.spans.map((sp, idx) => {
                  const y = layout.getWireY(sp.qubit);
                  const x1 = layout.getColX(sp.startCol);
                  const x2 = layout.getColX(sp.endCol);
                  const cycStyle =
                    CYCLE_COLORS[sp.cycleIdx % CYCLE_COLORS.length];

                  return (
                    <g key={`span-${idx}`}>
                      {showLifetimeBands && !sp.isData && (
                        <rect
                          x={x1 - 10}
                          y={y - 10}
                          width={Math.max(20, x2 - x1 + 20)}
                          height={20}
                          rx={5}
                          fill={cycStyle.fill}
                          stroke={cycStyle.stroke}
                          strokeWidth={1}
                          strokeOpacity={0.6}
                          fillOpacity={0.65}
                        />
                      )}
                      <line
                        x1={x1}
                        y1={y}
                        x2={x2}
                        y2={y}
                        stroke={sp.isData ? '#0f172a' : '#334155'}
                        strokeWidth={2}
                      />
                    </g>
                  );
                })}

                {/* 3. CNOT Gates */}
                {layout.cnotOps.map((cnot, idx) => {
                  const x = layout.getColX(cnot.col);
                  const yCtrl = layout.getWireY(cnot.control);
                  const yTarg = layout.getWireY(cnot.target);
                  const isHovered =
                    hoveredQubit === cnot.control ||
                    hoveredQubit === cnot.target;

                  return (
                    <g
                      key={`cx-${idx}`}
                      onMouseEnter={() => setHoveredQubit(cnot.control)}
                      onMouseLeave={() => setHoveredQubit(null)}
                      className="cursor-pointer"
                    >
                      <line
                        x1={x}
                        y1={yCtrl}
                        x2={x}
                        y2={yTarg}
                        stroke={isHovered ? '#059669' : '#0f172a'}
                        strokeWidth={isHovered ? 2.6 : 2}
                      />
                      <circle
                        cx={x}
                        cy={yCtrl}
                        r={4.5}
                        fill={isHovered ? '#059669' : '#0f172a'}
                      />
                      <circle
                        cx={x}
                        cy={yTarg}
                        r={7.5}
                        fill="#ffffff"
                        stroke={isHovered ? '#059669' : '#0f172a'}
                        strokeWidth={1.9}
                      />
                      <line
                        x1={x - 7.5}
                        y1={yTarg}
                        x2={x + 7.5}
                        y2={yTarg}
                        stroke={isHovered ? '#059669' : '#0f172a'}
                        strokeWidth={1.7}
                      />
                      <line
                        x1={x}
                        y1={yTarg - 7.5}
                        x2={x}
                        y2={yTarg + 7.5}
                        stroke={isHovered ? '#059669' : '#0f172a'}
                        strokeWidth={1.7}
                      />
                    </g>
                  );
                })}

                {/* 4. Single-Qubit Resets (R/RX), Hadamards (H), and Measurements (M/MX) */}
                {layout.singleOps.map((op, idx) => {
                  const x = layout.getColX(op.col);
                  const y = layout.getWireY(op.qubit);

                  if (op.kind === 'reset') {
                    const isPlus = op.opName === 'RX';
                    return (
                      <g key={`sq-${idx}`}>
                        <rect
                          x={x - 10.5}
                          y={y - 9}
                          width={21}
                          height={18}
                          rx={4}
                          fill={isPlus ? '#ecfdf5' : '#fff1f2'}
                          stroke={isPlus ? '#059669' : '#dc2626'}
                          strokeWidth={1.6}
                        />
                        <text
                          x={x}
                          y={y + 3.5}
                          textAnchor="middle"
                          className={`font-mono text-[9px] font-bold ${
                            isPlus ? 'fill-emerald-950' : 'fill-rose-950'
                          }`}
                        >
                          {isPlus ? '|+⟩' : '|0⟩'}
                        </text>
                      </g>
                    );
                  }

                  if (op.kind === 'h') {
                    return (
                      <g key={`sq-${idx}`}>
                        <rect
                          x={x - 9}
                          y={y - 9}
                          width={18}
                          height={18}
                          rx={3}
                          fill="#eff6ff"
                          stroke="#2563eb"
                          strokeWidth={1.6}
                        />
                        <text
                          x={x}
                          y={y + 3.5}
                          textAnchor="middle"
                          className="font-mono text-[9.5px] font-bold fill-blue-900"
                        >
                          H
                        </text>
                      </g>
                    );
                  }

                  const isMx = op.opName === 'MX';
                  return (
                    <g key={`sq-${idx}`}>
                      <rect
                        x={x - 11.5}
                        y={y - 9.5}
                        width={23}
                        height={19}
                        rx={4}
                        fill={isMx ? '#ecfdf5' : '#fff1f2'}
                        stroke={isMx ? '#059669' : '#dc2626'}
                        strokeWidth={1.6}
                      />
                      <path
                        d={`M ${x - 6.5} ${y + 3.5} A 6.5 6.5 0 0 1 ${x + 6.5} ${
                          y + 3.5
                        }`}
                        fill="none"
                        stroke={isMx ? '#047857' : '#991b1b'}
                        strokeWidth={1.3}
                      />
                      <line
                        x1={x}
                        y1={y + 3.5}
                        x2={x + 4}
                        y2={y - 4.5}
                        stroke={isMx ? '#047857' : '#991b1b'}
                        strokeWidth={1.4}
                      />
                      <text
                        x={x + 7}
                        y={y + 7.5}
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
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
