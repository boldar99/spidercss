import React, { useMemo, useState } from 'react';
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

  // Pack instructions into visual columns
  const layout = useMemo(() => {
    const singleOps: PlacedSingleOp[] = [];
    const cnotOps: PlacedCnotOp[] = [];
    const nextFreeCol = new Map<number, number>();
    const activeCycleIdx = new Map<number, number>();
    const openStartCol = new Map<number, number>();
    const spans: WireLifetimeSpan[] = [];

    for (const inst of instructions) {
      if (SPECIAL_GATES.has(inst.name)) continue;

      if (RESET_GATES.has(inst.name)) {
        for (const t of inst.targets) {
          if (t.type !== 'qubit') continue;
          const q = t.value;
          const col = nextFreeCol.get(q) ?? 0;
          const cyc = activeCycleIdx.get(q) ?? 0;
          singleOps.push({
            kind: 'reset',
            opName: inst.name,
            qubit: q,
            col,
            cycleIdx: cyc,
          });
          openStartCol.set(q, col);
          nextFreeCol.set(q, col + 1);
        }
      } else if (inst.name === 'H') {
        for (const t of inst.targets) {
          if (t.type !== 'qubit') continue;
          const q = t.value;
          const col = nextFreeCol.get(q) ?? 0;
          const cyc = activeCycleIdx.get(q) ?? 0;
          singleOps.push({
            kind: 'h',
            opName: 'H',
            qubit: q,
            col,
            cycleIdx: cyc,
          });
          nextFreeCol.set(q, col + 1);
        }
      } else if (TWO_QUBIT_GATES.has(inst.name)) {
        for (let i = 0; i < inst.targets.length; i += 2) {
          const c = inst.targets[i];
          const t = inst.targets[i + 1];
          // Skip classical feedback CX rec[...] q for main unitary wire rendering
          if (!c || !t || c.type !== 'qubit' || t.type !== 'qubit') continue;
          const minQ = Math.min(c.value, t.value);
          const maxQ = Math.max(c.value, t.value);
          let col = 0;
          for (let w = minQ; w <= maxQ; w++) {
            col = Math.max(col, nextFreeCol.get(w) ?? 0);
          }
          cnotOps.push({
            control: c.value,
            target: t.value,
            col,
          });
          for (let w = minQ; w <= maxQ; w++) {
            nextFreeCol.set(w, col + 1);
          }
        }
      } else if (MEASUREMENT_GATES.has(inst.name)) {
        for (const t of inst.targets) {
          if (t.type !== 'qubit') continue;
          const q = t.value;
          const col = nextFreeCol.get(q) ?? 0;
          const cyc = activeCycleIdx.get(q) ?? 0;
          singleOps.push({
            kind: 'meas',
            opName: inst.name,
            qubit: q,
            col,
            cycleIdx: cyc,
          });
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
          nextFreeCol.set(q, col + 1);
        }
      }
    }

    const totalCols = Math.max(
      2,
      ...Array.from(nextFreeCol.values()),
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

    const wireSpacing = numQubits <= 10 ? 34 : numQubits <= 18 ? 28 : 24;
    const colSpacing = totalCols <= 18 ? 34 : totalCols <= 32 ? 28 : 24;
    const leftPad = 126;
    const rightPad = 56;
    const topPad = 32;
    const bottomPad = 28;

    const svgWidth = Math.max(660, leftPad + (totalCols + 1) * colSpacing + rightPad);
    const svgHeight = Math.max(
      220,
      topPad + Math.max(1, numQubits - 1) * wireSpacing + bottomPad
    );

    const getWireY = (q: number) => topPad + q * wireSpacing;
    const getColX = (col: number) => leftPad + (col + 0.5) * colSpacing;

    return {
      singleOps,
      cnotOps,
      spans,
      totalCols,
      svgWidth,
      svgHeight,
      leftPad,
      getWireY,
      getColX,
    };
  }, [instructions, numQubits, numDataQubits]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      {/* Header & Lifetime Band Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            Compiled Quantum Circuit Diagram ({compiled.numQubits} Physical Qubits, {compiled.numCx} CNOTs, Depth {compiled.cnotDepth})
          </h4>
          <p className="text-[11px] text-slate-500">
            Data wires <code className="font-mono">q_0..q_{numDataQubits - 1}</code> persist to the output boundary; flag wires <code className="font-mono">q_{numDataQubits}..q_{numQubits - 1}</code> are measured and recycled when Qubit Reuse is enabled.
          </p>
        </div>

        <label className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={showLifetimeBands}
            onChange={(e) => setShowLifetimeBands(e.target.checked)}
            className="w-3.5 h-3.5 accent-emerald-700 rounded cursor-pointer"
          />
          <span>Highlight Ancilla Reuse Lifetimes</span>
        </label>
      </div>

      {/* Scrollable SVG Circuit Canvas */}
      <div className="bg-slate-50/50 rounded-xl border border-slate-200/80 overflow-x-auto custom-scrollbar p-2">
        <svg
          viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
          className="w-full min-w-[640px] h-auto select-none"
        >
          {/* 1. Background Wire Tracks & Labels */}
          {Array.from({ length: numQubits }, (_, q) => {
            const y = layout.getWireY(q);
            const isData = q < numDataQubits;
            const reuseCount = reuseCountsByWire.get(q) ?? 1;
            const rightEnd = layout.getColX(layout.totalCols);

            return (
              <g key={`track-${q}`}>
                {/* Left Qubit Label */}
                <text
                  x={12}
                  y={y + 4}
                  className={`font-mono text-[10px] font-bold ${
                    isData ? 'fill-emerald-800' : 'fill-amber-900'
                  }`}
                >
                  {isData ? `q_${q} (Data)` : `q_${q} (Flag)`}
                </text>

                {!isData && reuseCount > 1 && (
                  <g>
                    <rect
                      x={78}
                      y={y - 7.5}
                      width={34}
                      height={15}
                      rx={4}
                      fill="#fef3c7"
                      stroke="#f59e0b"
                      strokeWidth={1}
                    />
                    <text
                      x={95}
                      y={y + 3}
                      textAnchor="middle"
                      className="font-mono text-[8.5px] font-bold fill-amber-900"
                    >
                      ×{reuseCount}
                    </text>
                  </g>
                )}

                {/* Faint dashed guide across full width */}
                <line
                  x1={layout.leftPad - 8}
                  y1={y}
                  x2={rightEnd}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeWidth={1.3}
                  strokeDasharray={isData ? undefined : '4,4'}
                />

                {/* Right Output Label for Data Qubits */}
                {isData && (
                  <text
                    x={rightEnd + 8}
                    y={y + 4}
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
            const cycStyle = CYCLE_COLORS[sp.cycleIdx % CYCLE_COLORS.length];

            return (
              <g key={`span-${idx}`}>
                {showLifetimeBands && !sp.isData && (
                  <rect
                    x={x1 - 12}
                    y={y - 11}
                    width={Math.max(24, x2 - x1 + 24)}
                    height={22}
                    rx={6}
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

            return (
              <g key={`cx-${idx}`}>
                <line
                  x1={x}
                  y1={yCtrl}
                  x2={x}
                  y2={yTarg}
                  stroke="#0f172a"
                  strokeWidth={2}
                />
                <circle cx={x} cy={yCtrl} r={4.5} fill="#0f172a" />
                <circle
                  cx={x}
                  cy={yTarg}
                  r={8}
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth={1.9}
                />
                <line
                  x1={x - 8}
                  y1={yTarg}
                  x2={x + 8}
                  y2={yTarg}
                  stroke="#0f172a"
                  strokeWidth={1.7}
                />
                <line
                  x1={x}
                  y1={yTarg - 8}
                  x2={x}
                  y2={yTarg + 8}
                  stroke="#0f172a"
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
                    fill={isPlus ? '#ecfdf5' : '#ffffff'}
                    stroke={isPlus ? '#059669' : '#334155'}
                    strokeWidth={1.6}
                  />
                  <text
                    x={x}
                    y={y + 3.5}
                    textAnchor="middle"
                    className="font-mono text-[9px] font-bold fill-slate-900"
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
                  fill="#fffbeb"
                  stroke="#d97706"
                  strokeWidth={1.6}
                />
                <path
                  d={`M ${x - 6.5} ${y + 3.5} A 6.5 6.5 0 0 1 ${x + 6.5} ${
                    y + 3.5
                  }`}
                  fill="none"
                  stroke="#92400e"
                  strokeWidth={1.3}
                />
                <line
                  x1={x}
                  y1={y + 3.5}
                  x2={x + 4}
                  y2={y - 4.5}
                  stroke="#92400e"
                  strokeWidth={1.4}
                />
                <text
                  x={x + 7}
                  y={y + 7.5}
                  textAnchor="end"
                  className="font-mono text-[6.5px] font-bold fill-amber-900"
                >
                  {isMx ? 'X' : 'Z'}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
