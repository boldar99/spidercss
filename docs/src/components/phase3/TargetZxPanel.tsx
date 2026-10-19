import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { BasisType, LogicalEdge } from '../../engine/types';
import type { GlobalPipelineSetup } from '../../engine/spiderLegMatcher';

interface TargetZxPanelProps {
  pipeline: GlobalPipelineSetup;
  stepIndex: number;
  basis: BasisType;
  onSelectRemainingEdge: (edge: LogicalEdge, currentIdx: number) => void;
  onJumpToStep: (step: number) => void;
}

export const TargetZxPanel: React.FC<TargetZxPanelProps> = ({
  pipeline,
  stepIndex,
  basis,
  onSelectRemainingEdge,
  onJumpToStep,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const { pivots, nonPivots, zSpiders, xSpiders, stepSnapshots } = pipeline;
  const numRows = zSpiders.length;
  const numNonPivots = nonPivots.length;
  const totalQubits = numRows + numNonPivots;
  const totalSteps = stepSnapshots.length;
  const activeSnap =
    stepIndex > 0 && stepIndex <= totalSteps
      ? stepSnapshots[stepIndex - 1]
      : null;

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';
  const rowSym = basis === 'Z' ? 'Z' : 'X';

  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';
  const colSym = basis === 'Z' ? 'X' : 'Z';

  // Two vertical bipartite columns of spiders (Row spiders on left/top band, Col spiders on right/bottom band),
  // with all boundary legs going horizontally to the right (ZX state)
  const stepY =
    totalQubits <= 8
      ? 58
      : totalQubits <= 14
      ? 50
      : totalQubits <= 22
      ? 42
      : 36;
  const topPad = 54;
  const bottomPad = 48;
  const groupGapY = totalQubits <= 8 ? 64 : 52;
  const svgHeight = Math.max(
    480,
    topPad +
      bottomPad +
      Math.max(0, numRows - 1) * stepY +
      groupGapY +
      Math.max(0, numNonPivots - 1) * stepY
  );
  const svgWidth = 760;
  const rowX = 185;
  const colX = 485;
  const rightBoundaryX = 665;

  const getRowPos = (rIdx: number) => ({
    x: rowX,
    y: topPad + rIdx * stepY,
  });

  const colBaseY = topPad + Math.max(0, numRows - 1) * stepY + groupGapY;
  const getColPos = (npIdx: number) => ({
    x: colX,
    y: colBaseY + npIdx * stepY,
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-500">
            Panel 1 • Edge Schedule
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            Target Bipartite ZX-State
          </h4>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Click any <span className="font-semibold text-slate-700">dashed remaining edge</span> to schedule it next, or click an added edge to inspect that step.
          </span>
          <span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-slate-100 text-slate-800 border border-slate-200">
            {stepIndex} / {totalSteps} edges
          </span>
          <button
            type="button"
            onClick={() => setIsCollapsed((prev) => !prev)}
            aria-expanded={!isCollapsed}
            title={
              isCollapsed
                ? 'Expand Target Bipartite ZX-State graph view'
                : 'Collapse Target Bipartite ZX-State graph view'
            }
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            {isCollapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                <span>Show Graph</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                <span>Collapse Graph</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* SVG Bipartite State Diagram (collapsible) */}
      {!isCollapsed && (
        <div className="square-panel-wrapper">
          <div className="square-panel-scroll custom-scrollbar relative bg-slate-50/60 rounded-lg border border-slate-200/80">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              style={{
                width: '100%',
                minWidth: '560px',
                height: `${svgHeight}px`,
              }}
              className="select-none block"
            >
            {/* Column Headers */}
            <text
              x={rowX}
              y={22}
              textAnchor="middle"
              fontSize={11}
              className="fill-slate-700 font-sans font-semibold"
            >
              Row {rowSym}-Spiders
            </text>
            <text
              x={colX}
              y={colBaseY - 20}
              textAnchor="middle"
              fontSize={11}
              className="fill-slate-700 font-sans font-semibold"
            >
              Col {colSym}-Spiders
            </text>
            <text
              x={rightBoundaryX}
              y={22}
              textAnchor="middle"
              fontSize={10.5}
              className="fill-slate-500 font-mono font-semibold"
            >
              Output Legs (q_0..q_{totalQubits - 1})
            </text>

            {/* Output boundary wires (all exiting to the right) */}
          {Array.from({ length: numRows }, (_, rIdx) => {
            const p = getRowPos(rIdx);
            const pivotQ = pivots[rIdx];
            return (
              <g key={`rw-${rIdx}`}>
                <line
                  x1={p.x}
                  y1={p.y}
                  x2={rightBoundaryX}
                  y2={p.y}
                  stroke="#cbd5e1"
                  strokeWidth={1.6}
                />
                <circle
                  cx={rightBoundaryX}
                  cy={p.y}
                  r={2.5}
                  fill="#0f172a"
                />
                <text
                  x={rightBoundaryX + 7}
                  y={p.y + 3.5}
                  textAnchor="start"
                  fontSize={9.5}
                  className="font-mono font-semibold fill-slate-700"
                >
                  q_{pivotQ}
                </text>
              </g>
            );
          })}

          {nonPivots.map((colQ, npIdx) => {
            const p = getColPos(npIdx);
            return (
              <g key={`cw-${colQ}`}>
                <line
                  x1={p.x}
                  y1={p.y}
                  x2={rightBoundaryX}
                  y2={p.y}
                  stroke="#cbd5e1"
                  strokeWidth={1.6}
                />
                <circle
                  cx={rightBoundaryX}
                  cy={p.y}
                  r={2.5}
                  fill="#0f172a"
                />
                <text
                  x={rightBoundaryX + 7}
                  y={p.y + 3.5}
                  textAnchor="start"
                  fontSize={9.5}
                  className="font-mono font-semibold fill-slate-700"
                >
                  q_{colQ}
                </text>
              </g>
            );
          })}

          {/* 1. Remaining Edges */}
          {stepSnapshots.map((snap, idx) => {
            if (idx < stepIndex) return null;
            const p1 = getRowPos(snap.zSpiderIndex);
            const p2 = getColPos(snap.xSpiderIndex);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;

            return (
              <g
                key={`rem-${snap.zSpiderIndex}-${snap.xSpiderIndex}`}
                onClick={() => onSelectRemainingEdge(snap.logicalEdge, idx)}
                className="cursor-pointer group"
              >
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="transparent"
                  strokeWidth={12}
                />
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#94a3b8"
                  strokeWidth={1.9}
                  strokeDasharray="5,4"
                  className="group-hover:stroke-amber-500 group-hover:stroke-[2.8px] transition-all"
                />
                <title>
                  Click to schedule ({rowSym}_{snap.zSpiderIndex}, {colSym}_
                  {snap.xSpiderIndex}) as Step {stepIndex + 1}
                </title>
                <circle
                  cx={mx}
                  cy={my}
                  r={7}
                  fill="#f8fafc"
                  stroke="#cbd5e1"
                  strokeWidth={1}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </g>
            );
          })}

          {/* 2. Already Added Edges (idx < stepIndex - 1) */}
          {stepSnapshots.map((snap, idx) => {
            if (idx >= stepIndex - 1) return null;
            const p1 = getRowPos(snap.zSpiderIndex);
            const p2 = getColPos(snap.xSpiderIndex);
            const tPos = 0.35 + (idx % 5) * 0.08;
            const bx = p1.x + (p2.x - p1.x) * tPos;
            const by = p1.y + (p2.y - p1.y) * tPos;

            return (
              <g
                key={`added-${snap.zSpiderIndex}-${snap.xSpiderIndex}`}
                onClick={() => onJumpToStep(idx + 1)}
                className="cursor-pointer group"
              >
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="transparent"
                  strokeWidth={10}
                />
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke="#0f172a"
                  strokeWidth={2.2}
                  strokeOpacity={0.82}
                  className="group-hover:stroke-emerald-600 transition-colors"
                />
                <circle
                  cx={bx}
                  cy={by}
                  r={7.5}
                  fill="#0f172a"
                  stroke="#ffffff"
                  strokeWidth={1.2}
                />
                <text
                  x={bx}
                  y={by + 3}
                  textAnchor="middle"
                  fontSize={8.5}
                  className="font-mono font-bold fill-white"
                >
                  {idx + 1}
                </text>
              </g>
            );
          })}

          {/* 3. Active Edge (idx === stepIndex - 1) */}
          {activeSnap &&
            (() => {
              const p1 = getRowPos(activeSnap.zSpiderIndex);
              const p2 = getColPos(activeSnap.xSpiderIndex);
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;

              return (
                <g key="active-edge">
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#fde68a"
                    strokeWidth={8.5}
                    strokeLinecap="round"
                  />
                  <line
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="#d97706"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                  />
                  <rect
                    x={mx - 14}
                    y={my - 9}
                    width={28}
                    height={18}
                    rx={5}
                    fill="#d97706"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                  <text
                    x={mx}
                    y={my + 3.5}
                    textAnchor="middle"
                    fontSize={9.5}
                    className="font-mono font-bold fill-white"
                  >
                    #{stepIndex}
                  </text>
                </g>
              );
            })()}

          {/* 4. Diagonal Line 1: Row Spiders */}
          {Array.from({ length: numRows }, (_, rIdx) => {
            const p = getRowPos(rIdx);
            const isActiveRow = activeSnap?.zSpiderIndex === rIdx;

            return (
              <g key={`row-${rIdx}`}>
                {isActiveRow && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={16.5}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={3}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12}
                  fill={rowFill}
                  stroke={rowStroke}
                  strokeWidth={2}
                />
                <text
                  x={p.x}
                  y={p.y + 3.5}
                  textAnchor="middle"
                  fontSize={9.5}
                  className="font-mono font-bold fill-slate-900"
                >
                  {rowSym}
                  {rIdx}
                </text>
              </g>
            );
          })}

          {/* 5. Diagonal Line 2: Non-Pivot Column Spiders */}
          {nonPivots.map((colQ, npIdx) => {
            const p = getColPos(npIdx);
            const isActiveCol = activeSnap?.xSpiderIndex === npIdx;
            const chunks = xSpiders[npIdx] ?? [];
            const isSplit = chunks.length > 1;

            return (
              <g key={`col-${colQ}`}>
                {isActiveCol && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={16.5}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth={3}
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12}
                  fill={colFill}
                  stroke={colStroke}
                  strokeWidth={2}
                />
                <text
                  x={p.x}
                  y={p.y + 3.5}
                  textAnchor="middle"
                  fontSize={9.5}
                  className="font-mono font-bold fill-slate-900"
                >
                  {colSym}
                  {npIdx}
                </text>
                {isSplit && (
                  <text
                    x={p.x}
                    y={p.y - 14}
                    textAnchor="middle"
                    fontSize={8.5}
                    className="font-mono font-bold fill-purple-800"
                  >
                    [{chunks.join('+')}]
                  </text>
                )}
              </g>
            );
          })}
          </svg>
        </div>
      </div>
      )}

      {/* Legend & Quick Edge Sequence Pills */}
      <div className={isCollapsed ? 'pt-1 space-y-2' : 'mt-2.5 space-y-2'}>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-slate-900 inline-block"></span>
            Added ({Math.max(0, stepIndex - 1)})
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-1 bg-amber-600 rounded-xs inline-block"></span>
            Active (a, b)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 border-t-2 border-dashed border-slate-400 inline-block"></span>
            Remaining ({Math.max(0, totalSteps - stepIndex)})
          </span>
        </div>

        {/* Scrollable Edge Sequence Strip */}
        <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar pb-1 pt-0.5">
          {stepSnapshots.map((snap, idx) => {
            const isAdded = idx < stepIndex - 1;
            const isCurrent = idx === stepIndex - 1;
            return (
              <button
                key={`pill-${idx}`}
                type="button"
                onClick={() => {
                  if (idx < stepIndex) {
                    onJumpToStep(idx + 1);
                  } else {
                    onSelectRemainingEdge(snap.logicalEdge, idx);
                  }
                }}
                title={
                  idx < stepIndex
                    ? `Jump to Step ${idx + 1}`
                    : `Schedule (${rowSym}_${snap.zSpiderIndex}, ${colSym}_${snap.xSpiderIndex}) next`
                }
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono shrink-0 border transition-all cursor-pointer ${
                  isCurrent
                    ? 'bg-amber-600 text-white border-amber-700 font-bold shadow-2xs'
                    : isAdded
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-amber-400 hover:bg-amber-50/50'
                }`}
              >
                {idx + 1}:({rowSym}
                {snap.zSpiderIndex},{colSym}
                {snap.xSpiderIndex})
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
