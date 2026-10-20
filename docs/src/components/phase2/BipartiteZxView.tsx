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
  highlightedRow?: number | null;
  highlightedColQubit?: number | null;
  onHoverRow?: (rIdx: number | null) => void;
  onHoverColQubit?: (colQubit: number | null) => void;
}

export const BipartiteZxView: React.FC<BipartiteZxViewProps> = ({
  matrix,
  pivots,
  nonPivots,
  cost,
  basis,
  t,
  unidealized = false,
  highlightedRow,
  highlightedColQubit,
  onHoverRow,
  onHoverColQubit,
}) => {
  const [internalHoveredRow, setInternalHoveredRow] = useState<number | null>(null);
  const [internalHoveredColIdx, setInternalHoveredColIdx] = useState<number | null>(null);

  const numRows = matrix.length;
  const numNonPivots = nonPivots.length;
  const totalQubits = matrix[0]?.length ?? (numRows + numNonPivots);

  // Map row index to its pivot qubit, and non-pivot index to its column qubit
  const { rowToQubit, qubitToRow, colToQubit, qubitToCol } = useMemo(() => {
    const rToQ = new Map<number, number>();
    const qToR = new Map<number, number>();
    for (let rIdx = 0; rIdx < numRows; rIdx++) {
      const q = pivots[rIdx] !== undefined ? pivots[rIdx] : rIdx;
      rToQ.set(rIdx, q);
      qToR.set(q, rIdx);
    }

    const cToQ = new Map<number, number>();
    const qToC = new Map<number, number>();
    for (let npIdx = 0; npIdx < numNonPivots; npIdx++) {
      const q = nonPivots[npIdx] !== undefined ? nonPivots[npIdx] : numRows + npIdx;
      cToQ.set(npIdx, q);
      qToC.set(q, npIdx);
    }

    return { rowToQubit: rToQ, qubitToRow: qToR, colToQubit: cToQ, qubitToCol: qToC };
  }, [numRows, numNonPivots, pivots, nonPivots]);

  // Unified hovered row and column index (combining props and local hover state)
  const hoveredRow =
    highlightedRow !== undefined ? highlightedRow : internalHoveredRow;

  const hoveredColIdx = useMemo(() => {
    if (highlightedColQubit !== undefined) {
      if (highlightedColQubit === null) return null;
      return qubitToCol.get(highlightedColQubit) ?? null;
    }
    return internalHoveredColIdx;
  }, [highlightedColQubit, qubitToCol, internalHoveredColIdx]);

  const handleRowEnter = (rIdx: number) => {
    setInternalHoveredRow(rIdx);
    onHoverRow?.(rIdx);
  };

  const handleRowLeave = () => {
    setInternalHoveredRow(null);
    onHoverRow?.(null);
  };

  const handleColEnter = (npIdx: number) => {
    setInternalHoveredColIdx(npIdx);
    const colQ = colToQubit.get(npIdx);
    if (colQ !== undefined) {
      onHoverColQubit?.(colQ);
    }
  };

  const handleColLeave = () => {
    setInternalHoveredColIdx(null);
    onHoverColQubit?.(null);
  };

  // Compute SVG geometry with qubits ordered by qubit index q = 0 .. totalQubits - 1 vertically.
  // Row spiders are placed on the left column (x = rowX) at y = getY(pivotQ).
  // Non-pivot column spiders are placed on the right column (x = colX) at y = getY(colQubit).
  // All boundary wires exit horizontally to the right boundary at y = getY(q).
  const layout = useMemo(() => {
    const stepY =
      totalQubits <= 8
        ? 58
        : totalQubits <= 14
        ? 50
        : totalQubits <= 22
        ? 42
        : 36;
    const topPadding = 50;
    const bottomPadding = 44;
    const height = Math.max(
      440,
      topPadding + bottomPadding + Math.max(0, totalQubits - 1) * stepY
    );
    const width = 760;
    const rowX = 185;
    const colX = 485;
    const rightBoundaryX = 665;

    const getY = (q: number) => topPadding + q * stepY;

    const rowPos = (rIdx: number) => {
      const q = rowToQubit.get(rIdx) ?? rIdx;
      return {
        x: rowX,
        y: getY(q),
      };
    };

    const colPos = (npIdx: number) => {
      const q = colToQubit.get(npIdx) ?? numRows + npIdx;
      return {
        x: colX,
        y: getY(q),
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
      rowX,
      colX,
      rightBoundaryX,
      getY,
      rowPos,
      colPos,
      edges,
    };
  }, [matrix, numRows, numNonPivots, nonPivots, totalQubits, rowToQubit, colToQubit]);

  // Full list of qubits 0 .. totalQubits - 1 with their associated spider (row or col)
  const qubitsList = useMemo(() => {
    return Array.from({ length: totalQubits }, (_, q) => {
      if (qubitToRow.has(q)) {
        const rIdx = qubitToRow.get(q)!;
        return {
          q,
          type: 'row' as const,
          rIdx,
          npIdx: null,
          pos: layout.rowPos(rIdx),
        };
      } else if (qubitToCol.has(q)) {
        const npIdx = qubitToCol.get(q)!;
        return {
          q,
          type: 'col' as const,
          rIdx: null,
          npIdx,
          pos: layout.colPos(npIdx),
        };
      } else {
        const isRow = q < numRows;
        return {
          q,
          type: (isRow ? 'row' : 'col') as 'row' | 'col',
          rIdx: isRow ? q : null,
          npIdx: isRow ? null : q - numRows,
          pos: {
            x: isRow ? layout.rowX : layout.colX,
            y: layout.getY(q),
          },
        };
      }
    });
  }, [totalQubits, qubitToRow, qubitToCol, numRows, layout]);

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
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Bipartite ZX-State Diagram (RREF Form)
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

        <div className="square-panel-wrapper">
          <div className="square-panel-scroll custom-scrollbar rounded-lg border border-slate-100 bg-slate-50/50">
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              style={{
                width: '100%',
                minWidth: '560px',
                height: `${layout.height}px`,
              }}
              className="select-none block mx-auto"
            >
              {/* Output Boundary Wire Header */}
              <text
                x={layout.rightBoundaryX}
                y={24}
                textAnchor="middle"
                className="fill-slate-500 text-[11px] font-mono font-semibold"
              >
                Output State Legs (q_0..q_{totalQubits - 1})
              </text>

              {/* 1. Physical Output Boundary Wires ordered strictly by qubit index (q_0 .. q_{n-1}) */}
              {qubitsList.map((item) => {
                const { q, type, rIdx, npIdx, pos } = item;
                const isHovered =
                  type === 'row'
                    ? hoveredRow === rIdx
                    : hoveredColIdx === npIdx;
                const isDimmed =
                  (hoveredRow !== null || hoveredColIdx !== null) && !isHovered;

                const labelColor =
                  type === 'row'
                    ? basis === 'Z'
                      ? 'fill-emerald-900'
                      : 'fill-rose-900'
                    : basis === 'Z'
                    ? 'fill-rose-900'
                    : 'fill-emerald-900';

                return (
                  <g key={`qubit-wire-${q}`}>
                    <line
                      x1={pos.x}
                      y1={pos.y}
                      x2={layout.rightBoundaryX}
                      y2={pos.y}
                      stroke="#1e293b"
                      strokeWidth={isHovered ? 2.6 : 1.8}
                      strokeOpacity={isDimmed ? 0.25 : 0.85}
                    />
                    <circle
                      cx={layout.rightBoundaryX}
                      cy={pos.y}
                      r={3}
                      fill="#0f172a"
                      fillOpacity={isDimmed ? 0.25 : 1}
                    />
                    <text
                      x={layout.rightBoundaryX + 9}
                      y={pos.y + 3.5}
                      textAnchor="start"
                      className={`${labelColor} font-mono text-[10.5px] font-semibold`}
                      opacity={isDimmed ? 0.35 : 1}
                    >
                      q_{q}
                    </text>
                  </g>
                );
              })}

              {/* 2. Internal Bipartite Edges Connecting Row Spiders and Col Spiders */}
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

              {/* 3. Row Spiders (Pivots) */}
              {Array.from({ length: numRows }, (_, rIdx) => {
                const p = layout.rowPos(rIdx);
                const wRow = cost.rowWeights[rIdx] ?? 0;
                const isHovered = hoveredRow === rIdx;
                const isSpiderDimmed =
                  (hoveredRow !== null || hoveredColIdx !== null) && !isHovered;

                return (
                  <g
                    key={`row-node-${rIdx}`}
                    onMouseEnter={() => handleRowEnter(rIdx)}
                    onMouseLeave={() => handleRowLeave()}
                    className="cursor-pointer"
                    opacity={isSpiderDimmed ? 0.38 : 1}
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 16 : 13}
                      fill={rowFill}
                      stroke={rowStroke}
                      strokeWidth={isHovered ? 3.2 : 2}
                      style={{
                        filter: isHovered
                          ? 'drop-shadow(0 0 6px rgba(0,0,0,0.35))'
                          : undefined,
                        transition: 'all 0.15s ease',
                      }}
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

                    {/* Degree badge to the left of the spider (flags removed) */}
                    <text
                      x={p.x - 18}
                      y={p.y + 3.5}
                      textAnchor="end"
                      className="fill-slate-500 font-mono text-[9.5px]"
                    >
                      deg={wRow}
                    </text>
                  </g>
                );
              })}

              {/* 4. Non-Pivot Column Spiders */}
              {nonPivots.map((colQubit, npIdx) => {
                const p = layout.colPos(npIdx);
                const wCol = cost.colWeights[colQubit] ?? 0;
                const deg = wCol + 1;
                const isHovered = hoveredColIdx === npIdx;
                const isSpiderDimmed =
                  (hoveredRow !== null || hoveredColIdx !== null) && !isHovered;

                return (
                  <g
                    key={`col-node-${colQubit}`}
                    onMouseEnter={() => handleColEnter(npIdx)}
                    onMouseLeave={() => handleColLeave()}
                    className="cursor-pointer"
                    opacity={isSpiderDimmed ? 0.38 : 1}
                  >
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 16 : 13}
                      fill={colFill}
                      stroke={colStroke}
                      strokeWidth={isHovered ? 3.2 : 2}
                      style={{
                        filter: isHovered
                          ? 'drop-shadow(0 0 6px rgba(0,0,0,0.35))'
                          : undefined,
                        transition: 'all 0.15s ease',
                      }}
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

                    {/* Degree badge to the left of the spider (flags removed) */}
                    <text
                      x={p.x - 18}
                      y={p.y + 3.5}
                      textAnchor="end"
                      className="fill-slate-500 font-mono text-[9.5px]"
                    >
                      deg={deg}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500">
        <span>Hover over any spider to highlight its incident edges.</span>
        <span className="font-mono text-slate-600">
          State outputs: {totalQubits} right-hand boundary legs
        </span>
      </div>
    </div>
  );
};
