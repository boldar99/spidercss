import React, { useMemo, useState } from 'react';
import type { BasisType, BinaryMatrix, CostBreakdown } from '../../engine/types';
import { Math as KaTeXMath } from '../common/Math';

interface BipartiteZxViewProps {
  matrix: BinaryMatrix;
  pivots: Record<number, number>;
  nonPivots: number[];
  cost: CostBreakdown;
  basis: BasisType;
  t: number;
  unidealized?: boolean;
}

export const BipartiteZxView: React.FC<BipartiteZxViewProps> = ({
  matrix,
  pivots,
  nonPivots,
  cost,
  basis,
  t,
  unidealized = false,
}) => {
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const [hoveredColIdx, setHoveredColIdx] = useState<number | null>(null);

  const numRows = matrix.length;
  const numNonPivots = nonPivots.length;
  const totalQubits = numRows + numNonPivots;

  // Compute SVG geometry for two parallel diagonal lines of spiders spanning the same horizontal space,
  // with all boundary wires exiting to the right (ZX state)
  const layout = useMemo(() => {
    const totalTracks = Math.max(2, totalQubits);
    const stepY =
      totalTracks > 28 ? 20 : totalTracks > 18 ? 25 : totalTracks > 10 ? 32 : 38;
    const topPadding = 46;
    const bottomPadding = 34;
    const groupGapY = Math.max(40, stepY * 1.25);
    const height = Math.max(
      290,
      topPadding +
        bottomPadding +
        Math.max(0, numRows - 1) * stepY +
        groupGapY +
        Math.max(0, numNonPivots) * stepY
    );
    const width = 560;
    const rightBoundaryX = 486;

    // Both diagonals span the exact same horizontal space [diagStartX, diagEndX]
    const diagStartX = 115;
    const diagEndX = 365;

    // Diagonal Line 1: Row Spiders (upper diagonal)
    const rowPos = (rIdx: number) => {
      const frac = numRows <= 1 ? 0.5 : rIdx / (numRows - 1);
      return {
        x: diagStartX + frac * (diagEndX - diagStartX),
        y: topPadding + rIdx * stepY,
      };
    };

    // Diagonal Line 2: Non-Pivot Column Spiders (lower diagonal, same horizontal span)
    const colBaseY = topPadding + Math.max(0, numRows - 1) * stepY + groupGapY;
    const colPos = (npIdx: number) => {
      const frac = numNonPivots <= 1 ? 0.5 : npIdx / (numNonPivots - 1);
      return {
        x: diagStartX + frac * (diagEndX - diagStartX),
        y: colBaseY + npIdx * stepY,
      };
    };

    const edges: Array<{
      rIdx: number;
      npIdx: number;
      colQubit: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }> = [];

    for (let rIdx = 0; rIdx < numRows; rIdx++) {
      const p1 = rowPos(rIdx);
      for (let npIdx = 0; npIdx < numNonPivots; npIdx++) {
        const colQubit = nonPivots[npIdx];
        if (matrix[rIdx]?.[colQubit] === 1) {
          const p2 = colPos(npIdx);
          edges.push({
            rIdx,
            npIdx,
            colQubit,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
          });
        }
      }
    }

    return {
      width,
      height,
      rightBoundaryX,
      colBaseY,
      diagStartX,
      diagEndX,
      rowPos,
      colPos,
      edges,
    };
  }, [matrix, numRows, numNonPivots, nonPivots, totalQubits]);

  // Colors follow basis: for |0̄⟩ (basis='Z'), row spiders are Z (green) and col spiders are X (red).
  // For |+̄⟩ (basis='X'), roles interchange per Definition II.7 of the paper.
  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';
  const rowText = basis === 'Z' ? '#064e3b' : '#7f1d1d';
  const rowSym = basis === 'Z' ? 'Z' : 'X';

  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';
  const colText = basis === 'Z' ? '#7f1d1d' : '#064e3b';
  const colSym = basis === 'Z' ? 'X' : 'Z';

  const internalEdgeStroke = unidealized ? '#1e293b' : '#9333ea';

  const firstRowPt = numRows > 0 ? layout.rowPos(0) : null;
  const lastRowPt = numRows > 1 ? layout.rowPos(numRows - 1) : null;
  const firstColPt = numNonPivots > 0 ? layout.colPos(0) : null;
  const lastColPt =
    numNonPivots > 1 ? layout.colPos(numNonPivots - 1) : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs h-full flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Bipartite ZX-State Diagram ({basis === 'Z' ? 'X-RREF' : 'Z-RREF'} Normal Form)
            </h4>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {numRows} row spiders (<KaTeXMath tex={`${rowSym}_j`} />) •{' '}
              {numNonPivots} non-pivot spiders (<KaTeXMath tex={`${colSym}_i`} />) •{' '}
              all {totalQubits} output legs on the right •{' '}
              <strong className={unidealized ? 'text-slate-900' : 'text-purple-700'}>
                {layout.edges.length} {unidealized ? 'physical' : 'idealized'} internal edges
              </strong>
            </p>
          </div>

          {/* Mini Legend */}
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <span className="inline-flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-full inline-block border-2"
                style={{ backgroundColor: '#86efac', borderColor: '#15803d' }}
              />
              Z-spider
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-full inline-block border-2"
                style={{ backgroundColor: '#fca5a5', borderColor: '#b91c1c' }}
              />
              X-spider
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="w-4 h-0.5 inline-block"
                style={{ backgroundColor: internalEdgeStroke }}
              />
              {unidealized ? 'Noisy Edge' : 'Idealized Edge'}
            </span>
          </div>
        </div>

        <div className="w-full overflow-x-auto custom-scrollbar rounded-lg border border-slate-100 bg-slate-50/50">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            className="w-full h-auto max-h-[500px] select-none"
          >
            {/* Headers */}
            <text
              x={layout.diagStartX}
              y={22}
              textAnchor="start"
              className="fill-slate-700 text-[11px] font-sans font-semibold"
            >
              Row {rowSym}-Spiders (deg w_j)
            </text>
            <text
              x={layout.diagStartX}
              y={layout.colBaseY - 18}
              textAnchor="start"
              className="fill-slate-700 text-[11px] font-sans font-semibold"
            >
              Col {colSym}-Spiders (deg w_i+1)
            </text>
            <text
              x={layout.rightBoundaryX}
              y={22}
              textAnchor="middle"
              className="fill-slate-500 text-[10px] font-mono font-semibold"
            >
              Output State Legs (q_0..q_{totalQubits - 1})
            </text>

            {/* Subtle Diagonal Axis Guides */}
            {firstRowPt && lastRowPt && (
              <line
                x1={firstRowPt.x}
                y1={firstRowPt.y}
                x2={lastRowPt.x}
                y2={lastRowPt.y}
                stroke="#cbd5e1"
                strokeWidth={1.2}
                strokeDasharray="3,3"
              />
            )}
            {firstColPt && lastColPt && (
              <line
                x1={firstColPt.x}
                y1={firstColPt.y}
                x2={lastColPt.x}
                y2={lastColPt.y}
                stroke="#cbd5e1"
                strokeWidth={1.2}
                strokeDasharray="3,3"
              />
            )}

            {/* 1. Physical Black Output Boundary Wires (All exiting to the right as a ZX state) */}
            {Array.from({ length: numRows }, (_, rIdx) => {
              const p = layout.rowPos(rIdx);
              const pivotQ = pivots[rIdx];
              const isHovered = hoveredRow === rIdx;
              const isDimmed =
                (hoveredRow !== null || hoveredColIdx !== null) && !isHovered;

              return (
                <g key={`row-wire-${rIdx}`}>
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={layout.rightBoundaryX}
                    y2={p.y}
                    stroke="#1e293b"
                    strokeWidth={isHovered ? 2.6 : 1.8}
                    strokeOpacity={isDimmed ? 0.25 : 0.85}
                  />
                  <circle
                    cx={layout.rightBoundaryX}
                    cy={p.y}
                    r={3}
                    fill="#0f172a"
                    fillOpacity={isDimmed ? 0.25 : 1}
                  />
                  <text
                    x={layout.rightBoundaryX + 9}
                    y={p.y + 3.5}
                    textAnchor="start"
                    className="fill-emerald-900 font-mono text-[10.5px] font-semibold"
                    opacity={isDimmed ? 0.35 : 1}
                  >
                    {pivotQ !== undefined ? `q_${pivotQ}` : '—'}
                  </text>
                </g>
              );
            })}

            {nonPivots.map((colQubit, npIdx) => {
              const p = layout.colPos(npIdx);
              const isHovered = hoveredColIdx === npIdx;
              const isDimmed =
                (hoveredRow !== null || hoveredColIdx !== null) && !isHovered;

              return (
                <g key={`col-wire-${colQubit}`}>
                  <line
                    x1={p.x}
                    y1={p.y}
                    x2={layout.rightBoundaryX}
                    y2={p.y}
                    stroke="#1e293b"
                    strokeWidth={isHovered ? 2.6 : 1.8}
                    strokeOpacity={isDimmed ? 0.25 : 0.85}
                  />
                  <circle
                    cx={layout.rightBoundaryX}
                    cy={p.y}
                    r={3}
                    fill="#0f172a"
                    fillOpacity={isDimmed ? 0.25 : 1}
                  />
                  <text
                    x={layout.rightBoundaryX + 9}
                    y={p.y + 3.5}
                    textAnchor="start"
                    className="fill-rose-900 font-mono text-[10.5px] font-semibold"
                    opacity={isDimmed ? 0.35 : 1}
                  >
                    q_{colQubit}
                  </text>
                </g>
              );
            })}

            {/* 2. Internal Bipartite Edges Connecting the Two Diagonal Lines */}
            {layout.edges.map((e, idx) => {
              const isHighlighted =
                hoveredRow === e.rIdx || hoveredColIdx === e.npIdx;
              const isDimmed =
                (hoveredRow !== null || hoveredColIdx !== null) &&
                !isHighlighted;

              return (
                <line
                  key={`edge-${idx}`}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  stroke={internalEdgeStroke}
                  strokeWidth={isHighlighted ? 3.2 : 2.1}
                  strokeOpacity={isDimmed ? 0.16 : isHighlighted ? 1 : 0.78}
                  className="transition-all duration-150"
                />
              );
            })}

            {/* 3. Diagonal Line 1: Row Spiders */}
            {Array.from({ length: numRows }, (_, rIdx) => {
              const p = layout.rowPos(rIdx);
              const wRow = cost.rowWeights[rIdx] ?? 0;
              const fRow = cost.rowFlagsPerSpider[rIdx] ?? 0;
              const isHovered = hoveredRow === rIdx;

              return (
                <g
                  key={`row-node-${rIdx}`}
                  onMouseEnter={() => setHoveredRow(rIdx)}
                  onMouseLeave={() => setHoveredRow(null)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 15 : 13}
                    fill={rowFill}
                    stroke={rowStroke}
                    strokeWidth={isHovered ? 2.8 : 2}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fill={rowText}
                    className="font-mono text-[10.5px] font-bold"
                  >
                    {rowSym}
                    {rIdx}
                  </text>

                  {/* Degree & Flag badge to the left of the diagonal */}
                  <text
                    x={p.x - 18}
                    y={p.y + 3.5}
                    textAnchor="end"
                    className="fill-slate-500 font-mono text-[9.5px]"
                  >
                    deg={wRow}
                    {fRow > 0 ? ` (${fRow}f)` : ''}
                  </text>
                </g>
              );
            })}

            {/* 4. Diagonal Line 2: Non-Pivot Column Spiders */}
            {nonPivots.map((colQubit, npIdx) => {
              const p = layout.colPos(npIdx);
              const wCol = cost.colWeights[colQubit] ?? 0;
              const deg = wCol + 1;
              const fCol = cost.colFlagsPerSpider[colQubit] ?? 0;
              const isHovered = hoveredColIdx === npIdx;

              return (
                <g
                  key={`col-node-${colQubit}`}
                  onMouseEnter={() => setHoveredColIdx(npIdx)}
                  onMouseLeave={() => setHoveredColIdx(null)}
                  className="cursor-pointer"
                >
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={isHovered ? 15 : 13}
                    fill={colFill}
                    stroke={colStroke}
                    strokeWidth={isHovered ? 2.8 : 2}
                  />
                  <text
                    x={p.x}
                    y={p.y + 4}
                    textAnchor="middle"
                    fill={colText}
                    className="font-mono text-[10.5px] font-bold"
                  >
                    {colSym}
                    {npIdx}
                  </text>

                  {/* Degree & Flag badge */}
                  <text
                    x={p.x - 18}
                    y={p.y + 3.5}
                    textAnchor="end"
                    className="fill-slate-500 font-mono text-[9.5px]"
                  >
                    deg={deg}
                    {fCol > 0 ? ` (${fCol}f)` : ''}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Hover over any spider on the two diagonals to highlight its incident edges and{' '}
          <KaTeXMath tex="t={}" />
          {t} flags.
        </span>
        <span className="font-mono text-slate-600">
          State outputs: {totalQubits} right-hand boundary legs
        </span>
      </div>
    </div>
  );
};
