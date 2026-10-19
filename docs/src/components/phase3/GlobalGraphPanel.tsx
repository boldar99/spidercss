import React, { useMemo } from 'react';
import type { BasisType } from '../../engine/types';
import {
  getUndirectedDegree,
  getUndirectedEdges,
  hasUndirectedEdge,
  topologicalGenerations,
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

  // Compute deterministic cluster layout for Z cat states (upper diagonal) and X cat states (lower diagonal)
  // spanning the same horizontal space, with all physical data-qubit wires exiting to the right (state diagram)
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

    // Helper to position nodes inside one CatState cluster box (layers always flow left-to-right toward the right state boundary)
    const placeCluster = (
      kind: 'Z' | 'X',
      compIdx: number,
      state: (typeof zStates)[number],
      mapping: Map<string, number>,
      qubitCol: number,
      boxX: number,
      boxY: number,
      boxW: number,
      boxH: number
    ) => {
      const gens = topologicalGenerations(state.D);
      const numLayers = Math.max(1, gens.length);
      const padX = 28;
      const padY = 24;
      const innerW = Math.max(20, boxW - 2 * padX);
      const innerH = Math.max(20, boxH - 2 * padY);

      gens.forEach((layer, lIdx) => {
        const fracX =
          numLayers === 1 ? 0.5 : lIdx / Math.max(1, numLayers - 1);
        const x = boxX + padX + fracX * innerW;

        layer.forEach((localId, nIdx) => {
          const fracY =
            layer.length === 1
              ? 0.5
              : nIdx / Math.max(1, layer.length - 1);
          let y = boxY + padY + fracY * innerH;
          if (
            state.G.nodes.size >= 4 &&
            layer.length === 1 &&
            lIdx > 0 &&
            lIdx < numLayers - 1
          ) {
            y += lIdx % 2 === 1 ? -14 : 14;
          }

          const globalId = mapping.get(nodeMapKey(compIdx, localId))!;
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
        });
      });
    };

    const clusterW = 160;
    const diagStartX = 28;
    const diagEndX = 280;
    const rightBoundaryX = 485;
    const svgWidth = 545;
    const gapY = 12;

    // Diagonal 1 (Upper Band): Row Z Cat States
    let cursorY = 20;
    zStates.forEach((st, i) => {
      const nCount = st.G.nodes.size;
      const h = nCount <= 2 ? 62 : nCount <= 4 ? 86 : 108;
      const qCol = pivots[i];
      const frac = zStates.length <= 1 ? 0.5 : i / (zStates.length - 1);
      const boxX = diagStartX + frac * (diagEndX - diagStartX);

      clusterBoxes.push({
        kind: 'Z',
        index: i,
        label: `${rowSym}_${i} (q_${qCol})`,
        qubitCol: qCol,
        x: boxX,
        y: cursorY,
        w: clusterW,
        h,
      });
      placeCluster('Z', i, st, zNodeMapping, qCol, boxX, cursorY, clusterW, h);
      cursorY += h + gapY;
    });

    // Gap between Upper Diagonal (Row Cat States) and Lower Diagonal (Col Cat States)
    cursorY += 16;

    // Diagonal 2 (Lower Band, same horizontal span): Non-Pivot Col X Cat States
    xStates.forEach((st, j) => {
      const nCount = st.G.nodes.size;
      const h = nCount <= 2 ? 62 : nCount <= 4 ? 86 : 108;
      const qCol = nonPivots[j];
      const frac = xStates.length <= 1 ? 0.5 : j / (xStates.length - 1);
      const boxX = diagStartX + frac * (diagEndX - diagStartX);

      clusterBoxes.push({
        kind: 'X',
        index: j,
        label: `${colSym}_${j} (q_${qCol})`,
        qubitCol: qCol,
        x: boxX,
        y: cursorY,
        w: clusterW,
        h,
      });
      placeCluster('X', j, st, xNodeMapping, qCol, boxX, cursorY, clusterW, h);
      cursorY += h + gapY;
    });

    const totalHeight = Math.max(280, cursorY + 14);

    return {
      posMap,
      clusterBoxes,
      rightBoundaryX,
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

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-500">
            Panel 2 • 3-Ary Spider State Network
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            Global Graph <code className="font-mono text-xs">G_global</code> &amp; Spanning Forest <code className="font-mono text-xs">F</code>
          </h4>
        </div>
        <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          {baseGlobalG.nodes.size} spiders • {Object.keys(globalRoots).length} roots
        </span>
      </div>

      <p className="text-[11px] text-slate-500 mb-2.5">
        Each spider is unfused into a 3-ary <code className="font-mono">Cat_w^t</code> subgraph with its physical output leg exiting on the right. Bold edges form spanning forest <code className="font-mono">F</code> from roots <code className="font-mono">r_k</code> (blue boxes).
      </p>

      {/* SVG Canvas (block overflow container so top is never clipped) */}
      <div className="relative flex-1 bg-slate-50/60 rounded-lg border border-slate-200/80 overflow-auto max-h-[500px] custom-scrollbar">
        <svg
          viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
          className="w-full h-auto select-none block"
        >
          {/* 1. Cat State Cluster Bounding Boxes */}
          {layout.clusterBoxes.map((box) => (
            <g key={`${box.kind}-${box.index}`}>
              <rect
                x={box.x}
                y={box.y}
                width={box.w}
                height={box.h}
                rx={10}
                fill={box.kind === 'Z' ? '#f0fdf4' : '#fff1f2'}
                fillOpacity={0.6}
                stroke={box.kind === 'Z' ? '#bbf7d0' : '#fecdd3'}
                strokeWidth={1.2}
              />
              <text
                x={box.x + 8}
                y={box.y + 13}
                textAnchor="start"
                className="font-mono text-[9.5px] font-bold fill-slate-600"
              >
                {box.label}
              </text>
            </g>
          ))}

          {/* 2. Physical Data Qubit Boundary Wires from Primary Exit Spiders (All exiting to the right as a ZX state) */}
          {Array.from(layout.posMap.entries()).map(([gId, pos]) => {
            if (!pos.isPrimaryExit) return null;

            return (
              <g key={`exit-${gId}`}>
                <line
                  x1={pos.x}
                  y1={pos.y}
                  x2={layout.rightBoundaryX}
                  y2={pos.y}
                  stroke="#334155"
                  strokeWidth={1.8}
                  strokeOpacity={0.8}
                />
                <circle
                  cx={layout.rightBoundaryX}
                  cy={pos.y}
                  r={2.8}
                  fill="#0f172a"
                />
                <text
                  x={layout.rightBoundaryX + 7}
                  y={pos.y + 3.5}
                  textAnchor="start"
                  className="font-mono text-[9.5px] font-semibold fill-slate-700"
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

            return (
              <line
                key={`int-${idx}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={inForest ? '#0f172a' : '#64748b'}
                strokeWidth={inForest ? 3.2 : 1.8}
                strokeDasharray={inForest ? undefined : '4,3'}
              />
            );
          })}

          {/* 4. Added External CNOT Edges up to stepIndex - 1 */}
          {stepSnapshots.slice(0, Math.max(0, stepIndex - 1)).map((snap) => {
            const pZ = layout.posMap.get(snap.zGlobalNode);
            const pX = layout.posMap.get(snap.xGlobalNode);
            if (!pZ || !pX) return null;
            const midY = (pZ.y + pX.y) / 2;
            const dPath = `M ${pZ.x} ${pZ.y} C ${pZ.x} ${midY}, ${pX.x} ${midY}, ${pX.x} ${pX.y}`;

            return (
              <path
                key={`cnot-${snap.stepIndex}`}
                d={dPath}
                fill="none"
                stroke="#0369a1"
                strokeWidth={2}
                strokeOpacity={0.72}
              />
            );
          })}

          {/* 5. Active Step External CNOT Edge (stepIndex - 1) */}
          {activeSnap && (() => {
            const pZ = layout.posMap.get(activeSnap.zGlobalNode);
            const pX = layout.posMap.get(activeSnap.xGlobalNode);
            if (!pZ || !pX) return null;
            const midY = (pZ.y + pX.y) / 2;
            const dPath = `M ${pZ.x} ${pZ.y} C ${pZ.x} ${midY}, ${pX.x} ${midY}, ${pX.x} ${pX.y}`;

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
                      y={pos.y + 23}
                      textAnchor="middle"
                      className="font-mono text-[8.5px] font-bold fill-blue-700"
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
                  r={10.5}
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
