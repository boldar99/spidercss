import React, { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { BasisType } from '../../engine/types';
import {
  computeCatStateTreeLayout,
  getUndirectedDegree,
  getUndirectedEdges,
  hasUndirectedEdge,
} from '../../engine/catState';
import {
  nodeMapKey,
  type GlobalPipelineSetup,
} from '../../engine/spiderLegMatcher';

interface GlobalGraphPanelProps {
  pipeline: GlobalPipelineSetup;
  stepIndex: number;
  basis: BasisType;
}

interface NodePosition {
  x: number;
  y: number;
  compKind: 'Z' | 'X';
  compIndex: number;
  localId: number;
  isRoot: boolean;
  rootTreeCol: number | null;
  isPrimaryExit: boolean;
  dataQubitCol: number;
}

export const GlobalGraphPanel: React.FC<GlobalGraphPanelProps> = ({
  pipeline,
  stepIndex,
  basis,
}) => {
  const {
    pivots,
    nonPivots,
    zStates,
    xStates,
    zNodeMapping,
    xNodeMapping,
    baseGlobalG,
    globalF,
    globalRoots,
    globalPrimaryPaths,
    stepSnapshots,
  } = pipeline;

  const [zoom, setZoom] = useState<number | null>(null);

  const activeSnap =
    stepIndex > 0 && stepIndex <= stepSnapshots.length
      ? stepSnapshots[stepIndex - 1]
      : null;

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';
  const rowSym = basis === 'Z' ? 'Z' : 'X';

  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';
  const colSym = basis === 'Z' ? 'X' : 'Z';

  // Compute deterministic tree-branch cluster layout matching Figure 6 (building-G-and-D.tikz):
  // Z cat states on the left (upper band), X cat states on the right (lower band),
  // with all physical data-qubit wires exiting horizontally to the right boundary.
  const layout = useMemo(() => {
    const posMap = new Map<number, NodePosition>();
    const clusterBoxes: Array<{
      kind: 'Z' | 'X';
      index: number;
      label: string;
      qubitCol: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }> = [];

    const rootGlobalToCol = new Map<number, number>();
    for (const [colStr, gId] of Object.entries(globalRoots)) {
      rootGlobalToCol.set(gId, Number(colStr));
    }

    const exitGlobalToCol = new Map<number, number>();
    for (const [colStr, path] of Object.entries(globalPrimaryPaths)) {
      if (path.length > 0) {
        exitGlobalToCol.set(path[path.length - 1], Number(colStr));
      }
    }

    const colStepX = 58;
    const rowStepY = 48;
    const padLeft = 36;
    const padRight = 36;
    const padTop = 38;
    const padBottom = 34;
    const gapY = 16;

    const zLayouts = zStates.map((st) => computeCatStateTreeLayout(st));
    const xLayouts = xStates.map((st) => computeCatStateTreeLayout(st));

    const placeCluster = (
      kind: 'Z' | 'X',
      compIdx: number,
      treeGrid: ReturnType<typeof computeCatStateTreeLayout>,
      mapping: Map<string, number>,
      qubitCol: number,
      boxX: number,
      boxY: number
    ) => {
      for (const [localId, cell] of treeGrid.coords.entries()) {
        const globalId = mapping.get(nodeMapKey(compIdx, localId));
        if (globalId === undefined) continue;
        const x = boxX + padLeft + cell.col * colStepX;
        const y = boxY + padTop + cell.row * rowStepY;
        posMap.set(globalId, {
          x,
          y,
          compKind: kind,
          compIndex: compIdx,
          localId,
          isRoot: rootGlobalToCol.has(globalId),
          rootTreeCol: rootGlobalToCol.get(globalId) ?? null,
          isPrimaryExit: exitGlobalToCol.has(globalId),
          dataQubitCol: qubitCol,
        });
      }
    };

    const leftBoundaryX = 32;
    const leftColX = 76;
    let cursorY_Z = 28;
    let maxZRightX = leftColX + 130;

    // Left Column: Row Cat States (Z for |0̄⟩, X for |+̄⟩)
    zStates.forEach((_, i) => {
      const treeGrid = zLayouts[i];
      const boxW = Math.max(
        110,
        padLeft + Math.max(0, treeGrid.numCols - 1) * colStepX + padRight
      );
      const boxH =
        padTop + Math.max(0, treeGrid.numRows - 1) * rowStepY + padBottom;
      const qCol = pivots[i];

      clusterBoxes.push({
        kind: 'Z',
        index: i,
        label: `${rowSym}_${i} (q_${qCol})`,
        qubitCol: qCol,
        x: leftColX,
        y: cursorY_Z,
        w: boxW,
        h: boxH,
      });
      placeCluster('Z', i, treeGrid, zNodeMapping, qCol, leftColX, cursorY_Z);
      if (leftColX + boxW > maxZRightX) {
        maxZRightX = leftColX + boxW;
      }
      cursorY_Z += boxH + gapY;
    });

    // Central CNOT routing channel separates Left Column (Z) and Right Column (X) side-by-side
    const rightColX = maxZRightX + 175;
    let cursorY_X = 28;
    let maxXRightX = rightColX + 130;

    // Right Column: Non-Pivot Column Cat States (X for |0̄⟩, Z for |+̄⟩)
    xStates.forEach((_, j) => {
      const treeGrid = xLayouts[j];
      const boxW = Math.max(
        110,
        padLeft + Math.max(0, treeGrid.numCols - 1) * colStepX + padRight
      );
      const boxH =
        padTop + Math.max(0, treeGrid.numRows - 1) * rowStepY + padBottom;
      const qCol = nonPivots[j];

      clusterBoxes.push({
        kind: 'X',
        index: j,
        label: `${colSym}_${j} (q_${qCol})`,
        qubitCol: qCol,
        x: rightColX,
        y: cursorY_X,
        w: boxW,
        h: boxH,
      });
      placeCluster('X', j, treeGrid, xNodeMapping, qCol, rightColX, cursorY_X);
      if (rightColX + boxW > maxXRightX) {
        maxXRightX = rightColX + boxW;
      }
      cursorY_X += boxH + gapY;
    });

    const rightBoundaryX = maxXRightX + 44;
    const svgWidth = Math.max(760, rightBoundaryX + 54);
    const totalHeight = Math.max(
      460,
      Math.max(cursorY_Z, cursorY_X) + 24
    );

    return {
      posMap,
      clusterBoxes,
      leftBoundaryX,
      rightBoundaryX,
      rowStepY,
      svgWidth,
      svgHeight: totalHeight,
    };
  }, [
    zStates,
    xStates,
    pivots,
    nonPivots,
    zNodeMapping,
    xNodeMapping,
    globalRoots,
    globalPrimaryPaths,
    rowSym,
    colSym,
  ]);

  // Track which nodes have had ports consumed or become flag nodes up to stepIndex
  const nodeStatusAtStep = useMemo(() => {
    const consumedCount = new Map<number, number>();
    const flagNodes = new Set<number>();

    for (let s = 0; s < stepIndex; s++) {
      const snap = stepSnapshots[s];
      if (!snap) continue;
      consumedCount.set(
        snap.zGlobalNode,
        (consumedCount.get(snap.zGlobalNode) ?? 0) + 1
      );
      consumedCount.set(
        snap.xGlobalNode,
        (consumedCount.get(snap.xGlobalNode) ?? 0) + 1
      );
      if (getUndirectedDegree(globalF, snap.zGlobalNode) === 1) {
        flagNodes.add(snap.zGlobalNode);
      }
      if (getUndirectedDegree(globalF, snap.xGlobalNode) === 1) {
        flagNodes.add(snap.xGlobalNode);
      }
    }

    return { consumedCount, flagNodes };
  }, [stepIndex, stepSnapshots, globalF]);

  const internalEdges = useMemo(
    () => getUndirectedEdges(baseGlobalG),
    [baseGlobalG]
  );

  const effectiveZoom = zoom ?? 1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-500">
            3-Ary Spider State Network
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            Global Graph <code className="font-mono text-xs">G_global</code> &amp; Spanning Forest <code className="font-mono text-xs">F</code>
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
            {baseGlobalG.nodes.size} spiders • {Object.keys(globalRoots).length} roots
          </span>

          {/* Zoom Controls */}
          <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-mono">
            <button
              type="button"
              onClick={() =>
                setZoom((z) =>
                  Math.max(0.4, Number(((z ?? 1) - 0.2).toFixed(2)))
                )
              }
              title="Zoom Out"
              className="p-1 rounded hover:bg-white text-slate-700 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Reset to 100% scale"
              className="px-1.5 py-0.5 rounded hover:bg-white text-slate-700 cursor-pointer"
            >
              {zoom === null ? 'Fit' : `${Math.round(effectiveZoom * 100)}%`}
            </button>
            <button
              type="button"
              onClick={() =>
                setZoom((z) =>
                  Math.min(2.5, Number(((z ?? 1) + 0.2).toFixed(2)))
                )
              }
              title="Zoom In"
              className="p-1 rounded hover:bg-white text-slate-700 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            {zoom !== null && (
              <button
                type="button"
                onClick={() => setZoom(null)}
                title="Fit to panel width"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <Maximize2 className="w-3 h-3" /> Fit
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mb-2.5">
        Each spider is unfused into a 3-ary cat-state subgraph. Pivot data qubits exit to the left; non-pivot data qubits exit to the right. Matched external CNOT edges span the central routing channel. Bold edges form spanning forest <code className="font-mono">F</code> from roots <code className="font-mono">r_k</code> (blue boxes).
      </p>

      {/* SVG Canvas (grows vertically up to 1:1 square, then scrolls) */}
      <div className="square-panel-wrapper">
        <div className="square-panel-scroll custom-scrollbar relative bg-slate-50/60 rounded-lg border border-slate-200/80">
          <svg
            viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
            style={
              zoom === null
                ? {
                    width: '100%',
                    minWidth: `${Math.min(680, layout.svgWidth)}px`,
                    height: `${layout.svgHeight}px`,
                  }
                : {
                    width: `${Math.round(layout.svgWidth * zoom)}px`,
                    height: `${Math.round(layout.svgHeight * zoom)}px`,
                  }
            }
            className="select-none block mx-auto"
          >
            {/* 1. Cat State Cluster Bounding Boxes */}
            {layout.clusterBoxes.map((box) => (
              <g key={`${box.kind}-${box.index}`}>
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  rx={12}
                  fill={box.kind === 'Z' ? '#f0fdf4' : '#fff1f2'}
                  fillOpacity={0.68}
                  stroke={box.kind === 'Z' ? '#86efac' : '#fda4af'}
                  strokeWidth={1.4}
                />
                <text
                  x={box.x + 12}
                  y={box.y + 16}
                  textAnchor="start"
                  className="font-mono text-[10.5px] font-bold fill-slate-700"
                >
                  {box.label}
                </text>
              </g>
            ))}

            {/* 2. Physical Data Qubit Boundary Wires from Primary Exit Spiders (Pivot qubits on left, non-pivot on right) */}
            {Array.from(layout.posMap.entries()).map(([gId, pos]) => {
              if (!pos.isPrimaryExit) return null;
              const isZ = pos.compKind === 'Z';
              const boundaryX = isZ
                ? layout.leftBoundaryX
                : layout.rightBoundaryX;

              return (
                <g key={`exit-${gId}`}>
                  <line
                    x1={pos.x}
                    y1={pos.y}
                    x2={boundaryX}
                    y2={pos.y}
                    stroke="#334155"
                    strokeWidth={1.9}
                    strokeOpacity={0.85}
                  />
                  <circle
                    cx={boundaryX}
                    cy={pos.y}
                    r={3.2}
                    fill="#0f172a"
                  />
                  <text
                    x={isZ ? boundaryX - 8 : boundaryX + 8}
                    y={pos.y + 3.5}
                    textAnchor={isZ ? 'end' : 'start'}
                    className={`font-mono text-[10.5px] font-bold ${
                      isZ ? 'fill-emerald-800' : 'fill-rose-800'
                    }`}
                  >
                    q_{pos.dataQubitCol}
                  </text>
                </g>
              );
            })}

            {/* 3. Internal Edges of baseGlobalG (bold for Spanning Forest F, dashed for non-tree flag closure) */}
            {internalEdges.map((e, idx) => {
              const p1 = layout.posMap.get(e.source);
              const p2 = layout.posMap.get(e.target);
              if (!p1 || !p2) return null;
              const inForest = hasUndirectedEdge(globalF, e.source, e.target);

              if (
                !inForest &&
                Math.abs(p1.x - p2.x) < 2 &&
                Math.abs(p1.y - p2.y) > layout.rowStepY * 1.2
              ) {
                const midY = (p1.y + p2.y) / 2;
                const dCurve = `M ${p1.x} ${p1.y} Q ${p1.x + 24} ${midY} ${p2.x} ${p2.y}`;
                return (
                  <path
                    key={`int-${idx}`}
                    d={dCurve}
                    fill="none"
                    stroke="#64748b"
                    strokeWidth={1.9}
                    strokeDasharray="4,3"
                  />
                );
              }

              return (
                <line
                  key={`int-${idx}`}
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={inForest ? '#0f172a' : '#64748b'}
                  strokeWidth={inForest ? 3.2 : 1.9}
                  strokeDasharray={inForest ? undefined : '4,3'}
                />
              );
            })}

            {/* 4. Added External CNOT Edges up to stepIndex - 1 */}
            {stepSnapshots.slice(0, Math.max(0, stepIndex - 1)).map((snap) => {
              const pZ = layout.posMap.get(snap.zGlobalNode);
              const pX = layout.posMap.get(snap.xGlobalNode);
              if (!pZ || !pX) return null;
              const midX = (pZ.x + pX.x) / 2;
              const dPath = `M ${pZ.x} ${pZ.y} C ${midX} ${pZ.y}, ${midX} ${pX.y}, ${pX.x} ${pX.y}`;

              return (
                <path
                  key={`cnot-${snap.stepIndex}`}
                  d={dPath}
                  fill="none"
                  stroke="#0369a1"
                  strokeWidth={2.1}
                  strokeOpacity={0.75}
                />
              );
            })}

            {/* 5. Active Step External CNOT Edge (stepIndex - 1) */}
            {activeSnap &&
              (() => {
                const pZ = layout.posMap.get(activeSnap.zGlobalNode);
                const pX = layout.posMap.get(activeSnap.xGlobalNode);
                if (!pZ || !pX) return null;
                const midX = (pZ.x + pX.x) / 2;
                const dPath = `M ${pZ.x} ${pZ.y} C ${midX} ${pZ.y}, ${midX} ${pX.y}, ${pX.x} ${pX.y}`;

                return (
                  <g key="active-cnot-edge">
                    <path
                      d={dPath}
                      fill="none"
                      stroke="#fed7aa"
                      strokeWidth={8}
                      strokeLinecap="round"
                    />
                    <path
                      d={dPath}
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth={3.2}
                      strokeLinecap="round"
                    />
                  </g>
                );
              })()}

            {/* 6. 3-Ary Spider Nodes & Root Highlights */}
            {Array.from(layout.posMap.entries()).map(([gId, pos]) => {
              const isZ = pos.compKind === 'Z';
              const fill = isZ ? rowFill : colFill;
              const stroke = isZ ? rowStroke : colStroke;
              const isActiveEndpoint =
                activeSnap?.zGlobalNode === gId ||
                activeSnap?.xGlobalNode === gId;
              const isActiveParent =
                activeSnap?.zParentGlobalNodes.includes(gId) ||
                activeSnap?.xParentGlobalNodes.includes(gId);
              const isFlag = nodeStatusAtStep.flagNodes.has(gId);

              return (
                <g key={`node-${gId}`}>
                  {/* Root node blue square highlight (matching TikZ root_highlight) */}
                  {pos.isRoot && (
                    <g>
                      <rect
                        x={pos.x - 14.5}
                        y={pos.y - 14.5}
                        width={29}
                        height={29}
                        rx={5}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={2.2}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + 24}
                        textAnchor="middle"
                        className="font-mono text-[9px] font-bold fill-blue-700"
                      >
                        r_{pos.rootTreeCol}
                      </text>
                    </g>
                  )}

                  {/* Active step endpoint glow */}
                  {isActiveEndpoint && (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={16.5}
                      fill="none"
                      stroke="#ea580c"
                      strokeWidth={3}
                    />
                  )}

                  {/* Active step causal parent ring */}
                  {isActiveParent && !isActiveEndpoint && (
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={15.5}
                      fill="none"
                      stroke="#9333ea"
                      strokeWidth={2}
                      strokeDasharray="3,2"
                    />
                  )}

                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={11}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={2}
                  />
                  <text
                    x={pos.x}
                    y={pos.y + 3.5}
                    textAnchor="middle"
                    className="font-mono text-[9.5px] font-bold fill-slate-900"
                  >
                    {gId}
                  </text>

                  {isFlag && !pos.isRoot && (
                    <title>Node {gId}: Flag measurement endpoint</title>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-1 bg-slate-900 inline-block"></span>
          Spanning Forest F
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs border-2 border-blue-600 inline-block"></span>
          Root r_k
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 bg-sky-700 inline-block"></span>
          Added CNOT
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-1 bg-orange-600 inline-block"></span>
          Active (u(a), u(b))
        </span>
      </div>
    </div>
  );
};

