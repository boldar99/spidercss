import React, { useMemo } from 'react';
import dagre from '@dagrejs/dagre';
import type { BasisType } from '../../engine/types';
import {
  dagLongestPathLength,
  getDirectedEdges,
  topologicalGenerations,
} from '../../engine/catState';
import type { GlobalPipelineSetup } from '../../engine/spiderLegMatcher';

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
  const { baseGlobalD, globalRoots, stepSnapshots } = pipeline;
  const activeSnap =
    stepIndex > 0 && stepIndex <= stepSnapshots.length
      ? stepSnapshots[stepIndex - 1]
      : null;

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';
  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';

  const rootSet = useMemo(
    () => new Set<number>(Object.values(globalRoots)),
    [globalRoots]
  );

  const initialMetrics = useMemo(
    () => ({
      generations: topologicalGenerations(baseGlobalD),
      depth: dagLongestPathLength(baseGlobalD),
    }),
    [baseGlobalD]
  );

  const currentDepth = activeSnap ? activeSnap.dagDepth : initialMetrics.depth;
  const currentGenCount = activeSnap
    ? activeSnap.dagGenerations.length
    : initialMetrics.generations.length;

  // Build Dagre top-to-bottom layout for D_global at stepIndex
  const dagLayout = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'TB',
      nodesep: 20,
      ranksep: 42,
      marginx: 24,
      marginy: 24,
    });
    g.setDefaultEdgeLabel(() => ({}));

    for (const [nodeId] of baseGlobalD.nodes.entries()) {
      g.setNode(String(nodeId), { width: 24, height: 24 });
    }

    const edgesToRender: DagEdgeRenderItem[] = [];
    const seenPairs = new Set<string>();

    for (const e of getDirectedEdges(baseGlobalD)) {
      const pairKey = `${e.source}->${e.target}`;
      seenPairs.add(pairKey);
      const eType = e.edge_type === 'missing_link' ? 'missing_link' : 'tree';
      g.setEdge(String(e.source), String(e.target), {
        weight: eType === 'tree' ? 3 : 1,
      });
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
        g.setEdge(String(ce.source), String(ce.target), { weight: 1 });
        // If an earlier edge already existed between source and target, update its active highlight if current step
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
          seenPairs.add(pairKey);
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

    dagre.layout(g);

    const posMap = new Map<number, { x: number; y: number }>();
    let maxX = 320;
    let maxY = 240;

    for (const [nodeId] of baseGlobalD.nodes.entries()) {
      const nd = g.node(String(nodeId));
      if (nd) {
        posMap.set(nodeId, { x: nd.x, y: nd.y });
        if (nd.x + 30 > maxX) maxX = nd.x + 30;
        if (nd.y + 30 > maxY) maxY = nd.y + 30;
      }
    }

    return {
      posMap,
      edgesToRender,
      svgWidth: Math.max(360, maxX),
      svgHeight: Math.max(260, maxY),
    };
  }, [baseGlobalD, stepIndex, stepSnapshots]);

  const nodeRadius = 11;

  // Shorten arrow endpoint to stop cleanly at target circle boundary
  const computeArrowCoords = (
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-3) return { sx: x1, sy: y1, tx: x2, ty: y2 };
    const startPad = nodeRadius + 1;
    const endPad = nodeRadius + 4;
    return {
      sx: x1 + (dx / len) * startPad,
      sy: y1 + (dy / len) * startPad,
      tx: x2 - (dx / len) * endPad,
      ty: y2 - (dy / len) * endPad,
    };
  };

  const cnotEdgeCount = dagLayout.edgesToRender.filter(
    (e) => e.edgeType === 'cnot'
  ).length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-slate-500">
            Panel 3 • Causal Dependency DAG
          </span>
          <h4 className="text-xs sm:text-sm font-bold text-slate-900">
            Global Digraph <code className="font-mono text-xs">D_global</code> (Top-to-Bottom)
          </h4>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded-md font-mono text-[11px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
            Depth: {currentDepth} ({currentGenCount} layers)
          </span>
        </div>
      </div>

      <p className="text-[11px] text-slate-500 mb-2.5">
        Adding external CNOT <code className="font-mono">(u(a), u(b))</code> inserts dashed orange causal edges{' '}
        <code className="font-mono">P_D(u(a)) → u(b)</code> and{' '}
        <code className="font-mono">P_D(u(b)) → u(a)</code>.
      </p>

      {/* SVG Canvas */}
      <div className="relative flex-1 flex items-center justify-center bg-slate-50/60 rounded-lg border border-slate-200/80 overflow-auto max-h-[440px] custom-scrollbar">
        <svg
          viewBox={`0 0 ${dagLayout.svgWidth} ${dagLayout.svgHeight}`}
          className="w-full h-auto select-none"
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

          {/* 1. Non-active DAG edges (tree, missing_link, earlier cnot) */}
          {dagLayout.edgesToRender.map((e) => {
            if (e.isActiveStep) return null;
            const p1 = dagLayout.posMap.get(e.source);
            const p2 = dagLayout.posMap.get(e.target);
            if (!p1 || !p2) return null;

            const { sx, sy, tx, ty } = computeArrowCoords(
              p1.x,
              p1.y,
              p2.x,
              p2.y
            );

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
              <line
                key={e.key}
                x1={sx}
                y1={sy}
                x2={tx}
                y2={ty}
                stroke={stroke}
                strokeWidth={isTree ? 2 : 1.8}
                strokeDasharray={isTree ? undefined : '5,4'}
                strokeOpacity={e.edgeType === 'cnot' ? 0.72 : 0.9}
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

            const { sx, sy, tx, ty } = computeArrowCoords(
              p1.x,
              p1.y,
              p2.x,
              p2.y
            );

            return (
              <g key={`act-${e.key}`}>
                <line
                  x1={sx}
                  y1={sy}
                  x2={tx}
                  y2={ty}
                  stroke="#fed7aa"
                  strokeWidth={7}
                  strokeLinecap="round"
                />
                <line
                  x1={sx}
                  y1={sy}
                  x2={tx}
                  y2={ty}
                  stroke="#ea580c"
                  strokeWidth={2.8}
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
            const isRoot = rootSet.has(gId);
            const isActiveTarget =
              activeSnap?.zGlobalNode === gId ||
              activeSnap?.xGlobalNode === gId;
            const isActiveParent =
              activeSnap?.zParentGlobalNodes.includes(gId) ||
              activeSnap?.xParentGlobalNodes.includes(gId);

            return (
              <g key={`dag-node-${gId}`}>
                {isRoot && (
                  <rect
                    x={pos.x - 14.5}
                    y={pos.y - 14.5}
                    width={29}
                    height={29}
                    rx={5}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={2}
                  />
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
                      y={pos.y - 15}
                      textAnchor="middle"
                      className="font-mono text-[8.5px] font-bold fill-amber-800"
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
                      y={pos.y - 15}
                      textAnchor="middle"
                      className="font-mono text-[8.5px] font-bold fill-orange-700"
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
      </div>
    </div>
  );
};
