import React, { useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { BasisType } from '../../engine/types';
import {
  dagLongestPathLength,
  getDirectedEdges,
  getUndirectedDegree,
  getUndirectedEdges,
  hasUndirectedEdge,
  topologicalGenerations,
} from '../../engine/catState';
import type { GlobalPipelineSetup } from '../../engine/spiderLegMatcher';
import {
  computeGlobalTopologyLayout,
  buildDirectedEdgePath,
  buildUndirectedEdgePath,
  NODE_RADIUS,
} from './globalTopologyLayout';

interface GlobalGraphPanelProps {
  pipeline: GlobalPipelineSetup;
  stepIndex: number;
  basis: BasisType;
  initialViewMode?: 'G' | 'D';
}

interface DagEdgeRenderItem {
  key: string;
  source: number;
  target: number;
  edgeType: 'tree' | 'missing_link' | 'cnot';
  isActiveStep: boolean;
}

export const GlobalGraphPanel: React.FC<GlobalGraphPanelProps> = ({
  pipeline,
  stepIndex,
  basis,
  initialViewMode = 'G',
}) => {
  const {
    baseGlobalG,
    baseGlobalD,
    globalF,
    globalRoots,
    stepSnapshots,
  } = pipeline;

  const [viewMode, setViewMode] = useState<'G' | 'D'>(initialViewMode);
  // Zoom state is maintained at card level so switching between G and D preserves zoom!
  const [zoom, setZoom] = useState<number | null>(1);

  const activeSnap =
    stepIndex > 0 && stepIndex <= stepSnapshots.length
      ? stepSnapshots[stepIndex - 1]
      : null;

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';

  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';

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

  // The global graph G_global exactly copies the positions of the digraph D_global.
  // As external CNOT edges are added, dagGenerations updates and spiders move rightward.
  const layout = useMemo(() => {
    return computeGlobalTopologyLayout(pipeline, activeGenerations, basis);
  }, [pipeline, activeGenerations, basis]);

  // Directed edges for D_global view
  const dagEdgesToRender = useMemo(() => {
    if (viewMode !== 'D') return [];
    const edges: DagEdgeRenderItem[] = [];
    for (const e of getDirectedEdges(baseGlobalD)) {
      const pairKey = `${e.source}->${e.target}`;
      const eType = e.edge_type === 'missing_link' ? 'missing_link' : 'tree';
      edges.push({
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
        const existingIdx = edges.findIndex(
          (item) => item.source === ce.source && item.target === ce.target
        );
        if (existingIdx >= 0) {
          if (isAct) {
            edges[existingIdx] = {
              ...edges[existingIdx],
              edgeType: 'cnot',
              isActiveStep: true,
            };
          }
        } else {
          edges.push({
            key: `cnot-${s}-${pairKey}`,
            source: ce.source,
            target: ce.target,
            edgeType: 'cnot',
            isActiveStep: isAct,
          });
        }
      }
    }
    return edges;
  }, [viewMode, baseGlobalD, stepIndex, stepSnapshots]);

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
      {/* Header with integrated "Select Global Structure View", dual metrics badges, and zoom controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
        <div className="space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-500">
            Panel 2 • Global Structure Network
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            {viewMode === 'G' ? (
              <>
                Global Graph <code className="font-mono text-xs">G_global</code> &amp; Spanning Forest <code className="font-mono text-xs">F</code>
              </>
            ) : (
              <>
                Global Digraph <code className="font-mono text-xs">D_global</code> (Horizontal Topological Growth)
              </>
            )}
          </h4>
        </div>

        {/* View Switcher, Both Metrics Badges, and Zoom Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Integrated Select Global Structure View Pills */}
          <div
            role="radiogroup"
            aria-label="Select Global Structure View"
            className="inline-flex items-center p-0.5 rounded-lg border border-slate-200 bg-slate-100 text-xs font-semibold"
          >
            <button
              type="button"
              onClick={() => setViewMode('G')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'G'
                  ? 'bg-white text-emerald-950 shadow-2xs font-bold border border-emerald-400'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  viewMode === 'G' ? 'bg-emerald-600' : 'bg-slate-400'
                }`}
              />
              <span>Global Graph (G_global &amp; F)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('D')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'D'
                  ? 'bg-white text-amber-950 shadow-2xs font-bold border border-amber-400'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  viewMode === 'D' ? 'bg-amber-600' : 'bg-slate-400'
                }`}
              />
              <span>Digraph (D_global)</span>
            </button>
          </div>

          {/* Dual Metrics Badges: Spiders/Roots AND Depth/Generations displayed together! */}
          <div className="flex items-center gap-1.5">
            <span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-blue-50 text-blue-800 border border-blue-200">
              {baseGlobalG.nodes.size} spiders • {Object.keys(globalRoots).length} roots
            </span>
            <span className="px-2.5 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
              Depth: {currentDepth} ({currentGenCount} generations)
            </span>
          </div>

          {/* Zoom Controls (Zoom does NOT change when toggling viewMode) */}
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

      {/* Dynamic View Context Description */}
      <p className="text-[11px] text-slate-500 mb-2.5">
        {viewMode === 'G' ? (
          <>
            Spiders copy the horizontal topological positions from <code className="font-mono">D_global</code>, updating with each added edge. All ports exit to the right boundary as output qubits <code className="font-mono">q_0..q_{pipeline.N - 1}</code> (quantum state preparation). Bold edges form spanning forest <code className="font-mono">F</code> from roots <code className="font-mono">r_k</code> (blue boxes).
          </>
        ) : (
          <>
            Groups are ordered by qubit index (<code className="font-mono">q_0..q_{pipeline.N - 1}</code>). Nodes sit on their horizontal swimlanes and advance rightward across topological generations (<code className="font-mono">Gen 0 → Gen {Math.max(0, currentGenCount - 1)}</code>) as external CNOTs insert causal dependency edges{' '}
            <code className="font-mono">P_D(u(a)) → u(b)</code> and{' '}
            <code className="font-mono">P_D(u(b)) → u(a)</code>.
          </>
        )}
      </p>

      {/* SVG Canvas (grows vertically up to 1:1 square, then scrolls) */}
      <div className="square-panel-wrapper">
        <div className="square-panel-scroll custom-scrollbar relative bg-slate-50/60 rounded-lg border border-slate-200/80">
          <svg
            viewBox={`0 0 ${layout.svgWidth} ${layout.svgHeight}`}
            preserveAspectRatio="xMidYMin meet"
            style={
              zoom === null
                ? {
                    width: '100%',
                    maxWidth: `${layout.svgWidth}px`,
                    height: 'auto',
                    display: 'block',
                  }
                : {
                    width: `${Math.round(layout.svgWidth * zoom)}px`,
                    height: `${Math.round(layout.svgHeight * zoom)}px`,
                    display: 'block',
                  }
            }
            className="select-none block mx-auto"
          >
            <defs>
              <marker
                id="global-arrow-tree"
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
                id="global-arrow-missing"
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
                id="global-arrow-cnot"
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
            {layout.swimlanes.map((lane) => {
              const isZ = lane.kind === 'Z';
              const isGreen = (basis === 'Z' && isZ) || (basis === 'X' && !isZ);
              return (
                <g key={`lane-${lane.kind}-${lane.index}-${lane.qubitCol}`}>
                  <rect
                    x={14}
                    y={lane.y}
                    width={layout.svgWidth - 28}
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
            {Array.from({ length: layout.numGens }, (_, gIdx) => {
              const gx = layout.firstGenX + gIdx * layout.genStepX;
              return (
                <g key={`gen-col-${gIdx}`}>
                  <line
                    x1={gx}
                    y1={26}
                    x2={gx}
                    y2={layout.svgHeight - 8}
                    stroke="#cbd5e1"
                    strokeWidth={1}
                    strokeDasharray="3,4"
                    strokeOpacity={0.7}
                  />
                  <rect
                    x={gx - 28}
                    y={5}
                    width={56}
                    height={18}
                    rx={5}
                    fill="#f8fafc"
                    stroke="#e2e8f0"
                    strokeWidth={1}
                  />
                  <text
                    x={gx}
                    y={17.5}
                    textAnchor="middle"
                    className="font-mono text-[9.5px] font-semibold fill-slate-600"
                  >
                    Gen {gIdx}
                  </text>
                </g>
              );
            })}

            {/* VIEW MODE G: Undirected ZX Graph & Output Boundary Wires */}
            {viewMode === 'G' && (
              <>
                {/* Physical Data Qubit Output Wires (all ports exit to the right boundary - state not map) */}
                <text
                  x={layout.rightBoundaryX}
                  y={18}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9.5px] font-mono font-semibold"
                >
                  Output Qubits
                </text>
                <line
                  x1={layout.rightBoundaryX}
                  y1={26}
                  x2={layout.rightBoundaryX}
                  y2={layout.svgHeight - 8}
                  stroke="#94a3b8"
                  strokeWidth={1}
                  strokeDasharray="2,3"
                />

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
                        strokeWidth={1.9}
                        strokeOpacity={0.85}
                      />
                      <circle
                        cx={layout.rightBoundaryX}
                        cy={pos.y}
                        r={3.2}
                        fill="#0f172a"
                      />
                      <text
                        x={layout.rightBoundaryX + 8}
                        y={pos.y + 3.5}
                        textAnchor="start"
                        className="font-mono text-[10.5px] font-bold fill-slate-800"
                      >
                        q_{pos.dataQubitCol}
                      </text>
                    </g>
                  );
                })}

                {/* Internal Edges of baseGlobalG (bold for Spanning Forest F, dashed for non-tree cycle closure) */}
                {internalEdges.map((e, idx) => {
                  const p1 = layout.posMap.get(e.source);
                  const p2 = layout.posMap.get(e.target);
                  if (!p1 || !p2) return null;
                  const inForest = hasUndirectedEdge(globalF, e.source, e.target);
                  const dPath = buildUndirectedEdgePath(p1.x, p1.y, p2.x, p2.y);
                  if (!dPath) return null;

                  return (
                    <path
                      key={`int-${idx}`}
                      d={dPath}
                      fill="none"
                      stroke={inForest ? '#0f172a' : '#64748b'}
                      strokeWidth={inForest ? 3.2 : 1.9}
                      strokeDasharray={inForest ? undefined : '4,3'}
                    />
                  );
                })}

                {/* Added External CNOT Edges up to stepIndex - 1 */}
                {stepSnapshots.slice(0, Math.max(0, stepIndex - 1)).map((snap) => {
                  const pZ = layout.posMap.get(snap.zGlobalNode);
                  const pX = layout.posMap.get(snap.xGlobalNode);
                  if (!pZ || !pX) return null;
                  const dPath = buildUndirectedEdgePath(pZ.x, pZ.y, pX.x, pX.y);
                  if (!dPath) return null;

                  return (
                    <path
                      key={`cnot-${snap.stepIndex}`}
                      d={dPath}
                      fill="none"
                      stroke="#0369a1"
                      strokeWidth={2.1}
                      strokeOpacity={0.78}
                    />
                  );
                })}

                {/* Active Step External CNOT Edge (stepIndex - 1) */}
                {activeSnap &&
                  (() => {
                    const pZ = layout.posMap.get(activeSnap.zGlobalNode);
                    const pX = layout.posMap.get(activeSnap.xGlobalNode);
                    if (!pZ || !pX) return null;
                    const dPath = buildUndirectedEdgePath(pZ.x, pZ.y, pX.x, pX.y);
                    if (!dPath) return null;

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
              </>
            )}

            {/* VIEW MODE D: Directed Causal DAG Edges */}
            {viewMode === 'D' && (
              <>
                {/* Non-active DAG edges (tree, missing_link, earlier cnot) */}
                {dagEdgesToRender.map((e) => {
                  if (e.isActiveStep) return null;
                  const p1 = layout.posMap.get(e.source);
                  const p2 = layout.posMap.get(e.target);
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
                    ? 'url(#global-arrow-tree)'
                    : isMissing
                    ? 'url(#global-arrow-missing)'
                    : 'url(#global-arrow-cnot)';

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

                {/* Active step's newly added orange causal edges */}
                {dagEdgesToRender.map((e) => {
                  if (!e.isActiveStep) return null;
                  const p1 = layout.posMap.get(e.source);
                  const p2 = layout.posMap.get(e.target);
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
                        markerEnd="url(#global-arrow-cnot)"
                      />
                    </g>
                  );
                })}
              </>
            )}

            {/* 5. 3-Ary Spider Nodes & Root Highlights (Shared across both views) */}
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
                  {/* Root node blue square highlight */}
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
                    <g>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={16.5}
                        fill="none"
                        stroke="#ea580c"
                        strokeWidth={3}
                      />
                      {viewMode === 'D' && (
                        <text
                          x={pos.x}
                          y={pos.y - 15.5}
                          textAnchor="middle"
                          className="font-mono text-[9px] font-bold fill-amber-800"
                        >
                          {activeSnap?.zGlobalNode === gId ? 'u(a)' : 'u(b)'}
                        </text>
                      )}
                    </g>
                  )}

                  {/* Active step causal parent ring */}
                  {isActiveParent && !isActiveEndpoint && (
                    <g>
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r={15.5}
                        fill="none"
                        stroke={viewMode === 'D' ? '#ea580c' : '#9333ea'}
                        strokeWidth={2}
                        strokeDasharray="3,2"
                      />
                      {viewMode === 'D' && (
                        <text
                          x={pos.x}
                          y={pos.y - 15.5}
                          textAnchor="middle"
                          className="font-mono text-[9px] font-bold fill-orange-700"
                        >
                          P_D
                        </text>
                      )}
                    </g>
                  )}

                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={NODE_RADIUS}
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

      {/* Legend based on active viewMode */}
      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-600">
        {viewMode === 'G' ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-1 bg-slate-900 inline-block"></span>
              Spanning Forest F
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 border-t-2 border-dashed border-slate-500 inline-block"></span>
              Non-Tree Closure
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
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 h-0.5 bg-slate-700 inline-block"></span>
              Output Qubit Wires
            </span>
          </>
        ) : (
          <>
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
              Causal CNOT
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-dashed border-orange-600 inline-block"></span>
              Parent P_D(u)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs border-2 border-blue-600 inline-block"></span>
              Root r_k (Gen 0)
            </span>
          </>
        )}
      </div>
    </div>
  );
};
