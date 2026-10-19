import React, { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { BasisType } from '../../engine/types';
import {
  dagLongestPathLength,
  getDirectedEdges,
  topologicalGenerations,
} from '../../engine/catState';
import type { GlobalPipelineSetup } from '../../engine/spiderLegMatcher';
import {
  computeGlobalTopologyLayout,
  buildDirectedEdgePath,
} from './globalTopologyLayout';

interface GlobalDagPanelProps {
  pipeline: GlobalPipelineSetup;
  stepIndex: number;
  basis: BasisType;
}

interface DagEdgeRenderItem {
  key: string;
  source: number;
  target: number;
  edgeType: 'tree' | 'missing_link' | 'cnot';
  isActiveStep: boolean;
}

export const GlobalDagPanel: React.FC<GlobalDagPanelProps> = ({
  pipeline,
  stepIndex,
  basis,
}) => {
  const {
    baseGlobalD,
    globalRoots,
    stepSnapshots,
  } = pipeline;

  const [zoom, setZoom] = useState<number | null>(1);

  const activeSnap =
    stepIndex > 0 && stepIndex <= stepSnapshots.length
      ? stepSnapshots[stepIndex - 1]
      : null;

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';

  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';

  const rootGlobalToCol = useMemo(() => {
    const map = new Map<number, number>();
    for (const [colStr, gId] of Object.entries(globalRoots)) {
      map.set(gId, Number(colStr));
    }
    return map;
  }, [globalRoots]);

  const initialMetrics = useMemo(
    () => ({
      generations: topologicalGenerations(baseGlobalD),
      depth: dagLongestPathLength(baseGlobalD),
    }),
    [baseGlobalD]
  );

  const activeGenerations = activeSnap
    ? activeSnap.dagGenerations
    : initialMetrics.generations;
  const currentDepth = activeSnap ? activeSnap.dagDepth : initialMetrics.depth;
  const currentGenCount = activeGenerations.length;

  // Deterministic Horizontal (Left-to-Right) DAG Layout:
  // - Y coordinate: fixed horizontal swimlane tracks ordered by qubit index q_0 .. q_{N-1}
  // - X coordinate: topological generation (0, 1, 2, ...) at the current stepIndex, growing left-to-right
  const dagLayout = useMemo(() => {
    const topology = computeGlobalTopologyLayout(
      pipeline,
      activeGenerations,
      basis
    );

    const edgesToRender: DagEdgeRenderItem[] = [];
    for (const e of getDirectedEdges(baseGlobalD)) {
      const pairKey = `${e.source}->${e.target}`;
      const eType = e.edge_type === 'missing_link' ? 'missing_link' : 'tree';
      edgesToRender.push({
        key: `base-${pairKey}`,
        source: e.source,
        target: e.target,
        edgeType: eType,
        isActiveStep: false,
      });
    }

    for (let s = 0; s < stepIndex; s++) {
      const snap = stepSnapshots[s];
      if (!snap) continue;
      const isAct = s === stepIndex - 1;
      for (const ce of snap.addedDagEdges) {
        const pairKey = `${ce.source}->${ce.target}`;
        const existingIdx = edgesToRender.findIndex(
          (item) => item.source === ce.source && item.target === ce.target
        );
        if (existingIdx >= 0) {
          if (isAct) {
            edgesToRender[existingIdx] = {
              ...edgesToRender[existingIdx],
              edgeType: 'cnot',
              isActiveStep: true,
            };
          }
        } else {
          edgesToRender.push({
            key: `cnot-${s}-${pairKey}`,
            source: ce.source,
            target: ce.target,
            edgeType: 'cnot',
            isActiveStep: isAct,
          });
        }
      }
    }

    return {
      ...topology,
      edgesToRender,
    };
  }, [
    activeGenerations,
    baseGlobalD,
    basis,
    pipeline,
    stepIndex,
    stepSnapshots,
  ]);

  const cnotEdgeCount = dagLayout.edgesToRender.filter(
    (e) => e.edgeType === 'cnot'
  ).length;

  const effectiveZoom = zoom ?? 1;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-500">
            Causal Dependency DAG (Left-to-Right)
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            Global Digraph <code className="font-mono text-xs">D_global</code> (Horizontal Topological Growth)
          </h4>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
            Depth: {currentDepth} ({currentGenCount} generations)
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
        Groups are ordered by qubit index (<code className="font-mono">q_0..q_{pipeline.N - 1}</code>). Nodes sit on their horizontal swimlanes and advance rightward across topological generations (<code className="font-mono">Gen 0 → Gen {Math.max(0, currentGenCount - 1)}</code>) as external CNOTs insert dashed orange causal edges{' '}
        <code className="font-mono">P_D(u(a)) → u(b)</code> and{' '}
        <code className="font-mono">P_D(u(b)) → u(a)</code>.
      </p>

      {/* SVG Canvas (grows vertically up to 1:1 square, then scrolls) */}
      <div className="square-panel-wrapper">
        <div className="square-panel-scroll custom-scrollbar relative bg-slate-50/60 rounded-lg border border-slate-200/80">
          <svg
            viewBox={`0 0 ${dagLayout.svgWidth} ${dagLayout.svgHeight}`}
            style={
              zoom === null
                ? {
                    width: '100%',
                    minWidth: `${Math.min(680, dagLayout.svgWidth)}px`,
                    height: `${dagLayout.svgHeight}px`,
                  }
                : {
                    width: `${Math.round(dagLayout.svgWidth * zoom)}px`,
                    height: `${Math.round(dagLayout.svgHeight * zoom)}px`,
                  }
            }
            className="select-none block"
          >
            <defs>
              <marker
                id="dag-arrow-tree"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#0f172a" />
              </marker>
              <marker
                id="dag-arrow-missing"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#dc2626" />
              </marker>
              <marker
                id="dag-arrow-cnot"
                viewBox="0 0 10 10"
                refX="7"
                refY="5"
                markerWidth="5.5"
                markerHeight="5.5"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ea580c" />
              </marker>
            </defs>

            {/* 0. Horizontal Swimlane Bands for Each Cat State (ordered by qubit index) */}
            {dagLayout.swimlanes.map((lane) => {
              const isZ = lane.kind === 'Z';
              const isGreen = (basis === 'Z' && isZ) || (basis === 'X' && !isZ);
              return (
                <g key={`lane-${lane.kind}-${lane.index}-${lane.qubitCol}`}>
                  <rect
                    x={14}
                    y={lane.y}
                    width={dagLayout.svgWidth - 28}
                    height={lane.h}
                    rx={10}
                    fill={isGreen ? '#f0fdf4' : '#fff1f2'}
                    fillOpacity={0.55}
                    stroke={isGreen ? '#bbf7d0' : '#fecdd3'}
                    strokeWidth={1.1}
                  />
                  <text
                    x={26}
                    y={lane.y + lane.h / 2 + 4}
                    textAnchor="start"
                    className={`font-mono text-[10.5px] font-bold ${
                      isGreen ? 'fill-emerald-800' : 'fill-rose-800'
                    }`}
                  >
                    {lane.label}
                  </text>
                </g>
              );
            })}

            {/* 0b. Topological Generation Column Headers & Vertical Guides */}
            {Array.from({ length: dagLayout.numGens }, (_, gIdx) => {
              const gx = dagLayout.firstGenX + gIdx * dagLayout.genStepX;
              return (
                <g key={`gen-col-${gIdx}`}>
                  <line
                    x1={gx}
                    y1={32}
                    x2={gx}
                    y2={dagLayout.svgHeight - 14}
                    stroke="#cbd5e1"
                    strokeWidth={1}
                    strokeDasharray="3,4"
                    strokeOpacity={0.7}
                  />
                  <rect
                    x={gx - 28}
                    y={8}
                    width={56}
                    height={20}
                    rx={5}
                    fill="#f8fafc"
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                  <text
                    x={gx}
                    y={21.5}
                    textAnchor="middle"
                    className="font-mono text-[10px] font-semibold fill-slate-600"
                  >
                    Gen {gIdx}
                  </text>
                </g>
              );
            })}

            {/* 1. Non-active DAG edges (tree, missing_link, earlier cnot) */}
            {dagLayout.edgesToRender.map((e) => {
              if (e.isActiveStep) return null;
              const p1 = dagLayout.posMap.get(e.source);
              const p2 = dagLayout.posMap.get(e.target);
              if (!p1 || !p2) return null;

              const dPath = buildDirectedEdgePath(p1.x, p1.y, p2.x, p2.y);
              if (!dPath) return null;

              const isTree = e.edgeType === 'tree';
              const isMissing = e.edgeType === 'missing_link';
              const stroke = isTree
                ? '#0f172a'
                : isMissing
                ? '#dc2626'
                : '#ea580c';
              const marker = isTree
                ? 'url(#dag-arrow-tree)'
                : isMissing
                ? 'url(#dag-arrow-missing)'
                : 'url(#dag-arrow-cnot)';

              return (
                <path
                  key={e.key}
                  d={dPath}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isTree ? 2.2 : 1.9}
                  strokeDasharray={isTree ? undefined : '5,4'}
                  strokeOpacity={e.edgeType === 'cnot' ? 0.78 : 0.92}
                  markerEnd={marker}
                />
              );
            })}

            {/* 2. Active step's newly added orange causal edges */}
            {dagLayout.edgesToRender.map((e) => {
              if (!e.isActiveStep) return null;
              const p1 = dagLayout.posMap.get(e.source);
              const p2 = dagLayout.posMap.get(e.target);
              if (!p1 || !p2) return null;

              const dPath = buildDirectedEdgePath(p1.x, p1.y, p2.x, p2.y);
              if (!dPath) return null;

              return (
                <g key={`act-${e.key}`}>
                  <path
                    d={dPath}
                    fill="none"
                    stroke="#fed7aa"
                    strokeWidth={7.5}
                    strokeLinecap="round"
                  />
                  <path
                    d={dPath}
                    fill="none"
                    stroke="#ea580c"
                    strokeWidth={2.9}
                    strokeDasharray="5,4"
                    markerEnd="url(#dag-arrow-cnot)"
                  />
                </g>
              );
            })}

            {/* 3. Nodes of D_global */}
            {Array.from(baseGlobalD.nodes.entries()).map(([gId, nData]) => {
              const pos = dagLayout.posMap.get(gId);
              if (!pos) return null;

              const isZ = nData.compKind === 'Z';
              const fill = isZ ? rowFill : colFill;
              const stroke = isZ ? rowStroke : colStroke;
              const rootCol = rootGlobalToCol.get(gId);
              const isRoot = rootCol !== undefined;
              const isActiveTarget =
                activeSnap?.zGlobalNode === gId ||
                activeSnap?.xGlobalNode === gId;
              const isActiveParent =
                activeSnap?.zParentGlobalNodes.includes(gId) ||
                activeSnap?.xParentGlobalNodes.includes(gId);

              return (
                <g key={`dag-node-${gId}`}>
                  {isRoot && (
                    <g>
                      <rect
                        x={pos.x - 14.5}
                        y={pos.y - 14.5}
                        width={29}
                        height={29}
                        rx={5}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth={2.1}
                      />
                      <text
                        x={pos.x}
                        y={pos.y + 23.5}
                        textAnchor="middle"
                        className="font-mono text-[8.5px] font-bold fill-blue-700"
                      >
                        r_{rootCol}
                      </text>
                    </g>
                  )}

                  {isActiveTarget && (
                    <g>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={16.5}
                        fill="none"
                        stroke="#d97706"
                        strokeWidth={3}
                      />
                      <text
                        x={pos.x}
                        y={pos.y - 15.5}
                        textAnchor="middle"
                        className="font-mono text-[9px] font-bold fill-amber-800"
                      >
                        {activeSnap?.zGlobalNode === gId ? 'u(a)' : 'u(b)'}
                      </text>
                    </g>
                  )}

                  {isActiveParent && !isActiveTarget && (
                    <g>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={16}
                        fill="none"
                        stroke="#ea580c"
                        strokeWidth={2.4}
                        strokeDasharray="3,2"
                      />
                      <text
                        x={pos.x}
                        y={pos.y - 15.5}
                        textAnchor="middle"
                        className="font-mono text-[9px] font-bold fill-orange-700"
                      >
                        P_D
                      </text>
                    </g>
                  )}

                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeRadius}
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
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 bg-slate-900 inline-block"></span>
          Tree Edge (F)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 border-t-2 border-dashed border-red-600 inline-block"></span>
          Flag missing_link
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 border-t-2 border-dashed border-orange-600 inline-block"></span>
          Causal CNOT ({cnotEdgeCount})
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-dashed border-orange-600 inline-block"></span>
          Parent P_D(u)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-xs border-2 border-blue-600 inline-block"></span>
          Root r_k (Gen 0)
        </span>
      </div>
    </div>
  );
};

