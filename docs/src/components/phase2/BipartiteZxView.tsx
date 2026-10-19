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

  // Compute SVG geometry
  const layout = useMemo(() => {
    const maxNodes = Math.max(numRows, numNonPivots, 1);
    const verticalSpacing = maxNodes > 18 ? 34 : maxNodes > 10 ? 42 : 54;
    const topPadding = 44;
    const bottomPadding = 36;
    const height = Math.max(260, topPadding + bottomPadding + (maxNodes - 1) * verticalSpacing);
    const width = 560;

    const leftBoundaryX = 64;
    const leftSpiderX = 165;
    const rightSpiderX = 395;
    const rightBoundaryX = 496;

    const rowSpan = (numRows - 1) * verticalSpacing;
    const colSpan = (numNonPivots - 1) * verticalSpacing;
    const centerY = (topPadding + (height - bottomPadding)) / 2;

    const rowY = (rIdx: number) =>
      numRows <= 1 ? centerY : centerY - rowSpan / 2 + rIdx * verticalSpacing;
    const colY = (npIdx: number) =>
      numNonPivots <= 1
        ? centerY
        : centerY - colSpan / 2 + npIdx * verticalSpacing;

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
      for (let npIdx = 0; npIdx < numNonPivots; npIdx++) {
        const colQubit = nonPivots[npIdx];
        if (matrix[rIdx]?.[colQubit] === 1) {
          edges.push({
            rIdx,
            npIdx,
            colQubit,
            x1: leftSpiderX,
            y1: rowY(rIdx),
            x2: rightSpiderX,
            y2: colY(npIdx),
          });
        }
      }
    }

    return {
      width,
      height,
      leftBoundaryX,
      leftSpiderX,
      rightSpiderX,
      rightBoundaryX,
      rowY,
      colY,
      edges,
    };
  }, [matrix, numRows, numNonPivots, nonPivots]);

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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Bipartite ZX-Diagram ({basis === 'Z' ? 'X-RREF' : 'Z-RREF'} Normal Form)
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {numRows} row spiders (<KaTeXMath tex={`${rowSym}_j`} />) with pivot boundary wires •{' '}
            {numNonPivots} non-pivot spiders (<KaTeXMath tex={`${colSym}_i`} />) •{' '}
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
          className="w-full h-auto max-h-[460px] select-none"
        >
          {/* Column headers inside SVG */}
          <text
            x={layout.leftBoundaryX}
            y={22}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-mono"
          >
            Pivot Qubits
          </text>
          <text
            x={layout.leftSpiderX}
            y={22}
            textAnchor="middle"
            className="fill-slate-700 text-[11px] font-sans font-semibold"
          >
            Row {rowSym}-Spiders (deg w_j)
          </text>
          <text
            x={layout.rightSpiderX}
            y={22}
            textAnchor="middle"
            className="fill-slate-700 text-[11px] font-sans font-semibold"
          >
            Col {colSym}-Spiders (deg w_i+1)
          </text>
          <text
            x={layout.rightBoundaryX}
            y={22}
            textAnchor="middle"
            className="fill-slate-400 text-[10px] font-mono"
          >
            Non-Pivot Qubits
          </text>

          {/* Internal Bipartite Edges */}
          {layout.edges.map((e, idx) => {
            const isHighlighted =
              hoveredRow === e.rIdx || hoveredColIdx === e.npIdx;
            const isDimmed =
              (hoveredRow !== null || hoveredColIdx !== null) && !isHighlighted;
            const midX = (e.x1 + e.x2) / 2;
            const dPath = `M ${e.x1} ${e.y1} C ${midX} ${e.y1}, ${midX} ${e.y2}, ${e.x2} ${e.y2}`;

            return (
              <path
                key={idx}
                d={dPath}
                fill="none"
                stroke={internalEdgeStroke}
                strokeWidth={isHighlighted ? 3.4 : 2.3}
                strokeOpacity={isDimmed ? 0.18 : isHighlighted ? 1 : 0.78}
                className="transition-all duration-150"
              />
            );
          })}

          {/* Left side: Row Spiders + Physical Black Boundary Wires to Pivot Qubits */}
          {Array.from({ length: numRows }, (_, rIdx) => {
            const cy = layout.rowY(rIdx);
            const pivotQ = pivots[rIdx];
            const wRow = cost.rowWeights[rIdx] ?? 0;
            const fRow = cost.rowFlagsPerSpider[rIdx] ?? 0;
            const isHovered = hoveredRow === rIdx;

            return (
              <g
                key={`row-${rIdx}`}
                onMouseEnter={() => setHoveredRow(rIdx)}
                onMouseLeave={() => setHoveredRow(null)}
                className="cursor-pointer"
              >
                {/* Physical black boundary wire to pivot qubit p_j */}
                <line
                  x1={layout.leftBoundaryX}
                  y1={cy}
                  x2={layout.leftSpiderX}
                  y2={cy}
                  stroke="#1e293b"
                  strokeWidth={isHovered ? 2.8 : 2}
                />
                {/* Boundary output terminal dot */}
                <circle
                  cx={layout.leftBoundaryX}
                  cy={cy}
                  r={3.5}
                  fill="#0f172a"
                />
                <text
                  x={layout.leftBoundaryX - 10}
                  y={cy + 4}
                  textAnchor="end"
                  className="fill-slate-700 font-mono text-[11px] font-semibold"
                >
                  {pivotQ !== undefined ? `q_${pivotQ}` : '—'}
                </text>

                {/* Row Spider Circle */}
                <circle
                  cx={layout.leftSpiderX}
                  cy={cy}
                  r={isHovered ? 16 : 14}
                  fill={rowFill}
                  stroke={rowStroke}
                  strokeWidth={isHovered ? 2.8 : 2}
                />
                <text
                  x={layout.leftSpiderX}
                  y={cy + 4}
                  textAnchor="middle"
                  fill={rowText}
                  className="font-mono text-[11px] font-bold"
                >
                  {rowSym}
                  {rIdx}
                </text>

                {/* Degree & Flag badge */}
                <text
                  x={layout.leftSpiderX - 20}
                  y={cy - 10}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[9.5px]"
                >
                  deg={wRow}
                  {fRow > 0 ? ` (${fRow}f)` : ''}
                </text>
              </g>
            );
          })}

          {/* Right side: Non-Pivot Column Spiders + Physical Black Boundary Wires */}
          {nonPivots.map((colQubit, npIdx) => {
            const cy = layout.colY(npIdx);
            const wCol = cost.colWeights[colQubit] ?? 0;
            const deg = wCol + 1;
            const fCol = cost.colFlagsPerSpider[colQubit] ?? 0;
            const isHovered = hoveredColIdx === npIdx;

            return (
              <g
                key={`col-${colQubit}`}
                onMouseEnter={() => setHoveredColIdx(npIdx)}
                onMouseLeave={() => setHoveredColIdx(null)}
                className="cursor-pointer"
              >
                {/* Physical black boundary wire to non-pivot qubit i */}
                <line
                  x1={layout.rightSpiderX}
                  y1={cy}
                  x2={layout.rightBoundaryX}
                  y2={cy}
                  stroke="#1e293b"
                  strokeWidth={isHovered ? 2.8 : 2}
                />
                <circle
                  cx={layout.rightBoundaryX}
                  cy={cy}
                  r={3.5}
                  fill="#0f172a"
                />
                <text
                  x={layout.rightBoundaryX + 10}
                  y={cy + 4}
                  textAnchor="start"
                  className="fill-slate-700 font-mono text-[11px] font-semibold"
                >
                  q_{colQubit}
                </text>

                {/* Column Spider Circle */}
                <circle
                  cx={layout.rightSpiderX}
                  cy={cy}
                  r={isHovered ? 16 : 14}
                  fill={colFill}
                  stroke={colStroke}
                  strokeWidth={isHovered ? 2.8 : 2}
                />
                <text
                  x={layout.rightSpiderX}
                  y={cy + 4}
                  textAnchor="middle"
                  fill={colText}
                  className="font-mono text-[11px] font-bold"
                >
                  {colSym}
                  {npIdx}
                </text>

                {/* Degree & Flag badge */}
                <text
                  x={layout.rightSpiderX + 20}
                  y={cy - 10}
                  textAnchor="start"
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

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Hover over any spider to inspect its incident bipartite edges and required{' '}
          <KaTeXMath tex="t={}" />
          {t} flags.
        </span>
        <span className="font-mono text-slate-600">
          Boundary legs: {numRows + numNonPivots} data qubits
        </span>
      </div>
    </div>
  );
};
