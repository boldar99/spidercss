import React, { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  SkipBack,
  ChevronLeft,
  Play,
  Pause,
  ChevronRight,
  SkipForward,
  Split,
  RotateCcw,
  GitBranch,
  CheckCircle2,
} from 'lucide-react';
import {
  $compilerStore,
  setAlg1StepIndex,
  setAnalyzeHookErrors,
  setCustomEdgeOrder,
  setPostPhase2Branch,
  setRoutingHeuristic,
} from '../../stores/compilerStore';
import type { LogicalEdge, RoutingHeuristicType } from '../../engine/types';
import { edgeKey } from '../../engine/heuristics';
import type { GlobalPipelineSetup } from '../../engine/spiderLegMatcher';
import { TargetZxPanel } from './TargetZxPanel';
import { GlobalGraphPanel } from './GlobalGraphPanel';
import { GlobalDagPanel } from './GlobalDagPanel';
import { Math as KaTeXMath } from '../common/Math';

interface Phase3Algorithm1Props {
  pipeline: GlobalPipelineSetup;
}

const HEURISTIC_OPTIONS: Array<{
  value: RoutingHeuristicType;
  label: string;
  shortDesc: string;
}> = [
  {
    value: 'critical_path_first',
    label: 'Critical Path First',
    shortDesc: 'Prioritizes ports with largest reverse distance-to-sink in D',
  },
  {
    value: 'earliest_start_first',
    label: 'Earliest Start First',
    shortDesc: 'Greedy selection minimizing max(depth(u(a)), depth(u(b)))',
  },
  {
    value: 'active_spider_first',
    label: 'Active Spider First',
    shortDesc: 'Completes already-opened cat states first to shorten ancilla lifetimes',
  },
  {
    value: 'sa_sequence_distance',
    label: 'SA Sequence Distance',
    shortDesc: 'Simulated annealing minimizing cat-state sequence span',
  },
  {
    value: 'joint_resource',
    label: 'Joint Resource Planner',
    shortDesc: 'Local swap search co-optimizing port matching & peak qubits',
  },
  {
    value: 'random',
    label: 'Random / Manual Order',
    shortDesc: 'Seeded random order (click any dashed edge in Panel 1 to override)',
  },
];

export const Phase3Algorithm1: React.FC<Phase3Algorithm1Props> = ({
  pipeline,
}) => {
  const state = useStore($compilerStore);
  const {
    basis,
    validation,
    analyzeHookErrors,
    routingHeuristic,
    customEdgeOrder,
    alg1StepIndex,
  } = state;

  const totalSteps = pipeline.stepSnapshots.length;
  const clampedStep = Math.max(0, Math.min(totalSteps, alg1StepIndex));
  const activeSnap =
    clampedStep > 0 ? pipeline.stepSnapshots[clampedStep - 1] : null;

  const [isPlaying, setIsPlaying] = useState(false);
  const [playIntervalMs, setPlayIntervalMs] = useState(550);

  // Stop playback when reaching the end
  useEffect(() => {
    if (!isPlaying) return;
    if (clampedStep >= totalSteps) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setAlg1StepIndex(clampedStep + 1);
    }, playIntervalMs);
    return () => window.clearTimeout(timer);
  }, [isPlaying, clampedStep, totalSteps, playIntervalMs]);

  const handleTogglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
    } else {
      if (clampedStep >= totalSteps) {
        setAlg1StepIndex(1);
      }
      setIsPlaying(true);
    }
  };

  // Handle manual edge selection in Panel 1 (TargetZxPanel)
  const handleSelectRemainingEdge = (
    clickedEdge: LogicalEdge,
    clickedIdx: number
  ) => {
    setIsPlaying(false);
    if (clickedIdx < clampedStep) {
      setAlg1StepIndex(clickedIdx + 1);
      return;
    }

    const currentOrder = pipeline.stepSnapshots.map((s) => s.logicalEdge);
    const prefix = currentOrder.slice(0, clampedStep);
    const remaining = currentOrder.slice(clampedStep);

    const targetGroup = pipeline.edgeGroups.get(edgeKey(clickedEdge)) ?? 0;
    const prereqs: LogicalEdge[] = [];
    const others: LogicalEdge[] = [];

    for (const e of remaining) {
      if (e[0] === clickedEdge[0] && e[1] === clickedEdge[1]) {
        continue;
      }
      if (
        e[1] === clickedEdge[1] &&
        (pipeline.edgeGroups.get(edgeKey(e)) ?? 0) < targetGroup
      ) {
        prereqs.push(e);
      } else {
        others.push(e);
      }
    }

    const nextOrder: LogicalEdge[] = [
      ...prefix,
      ...prereqs,
      clickedEdge,
      ...others,
    ];
    setCustomEdgeOrder(nextOrder);
    setAlg1StepIndex(clampedStep + prereqs.length + 1);
  };

  const rowSym = basis === 'Z' ? 'Z' : 'X';
  const colSym = basis === 'Z' ? 'X' : 'Z';

  const activeHeuristicMeta =
    HEURISTIC_OPTIONS.find((h) => h.value === routingHeuristic) ??
    HEURISTIC_OPTIONS[0];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-5">
      {/* Phase 3 Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Phase 3 • Algorithm 1
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              Global Port Matching (<code className="font-mono text-sm">G_global</code>, <code className="font-mono text-sm">D_global</code>) Without Backtracking
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Each external bipartite edge <KaTeXMath tex="(a, b)" /> is matched to the earliest unassigned 3-ary ports{' '}
            <KaTeXMath tex="u(a) \in V(a)" /> and <KaTeXMath tex="u(b) \in V(b)" />, adding CNOT edge{' '}
            <KaTeXMath tex="(u(a), u(b))" /> to <KaTeXMath tex="G_{\text{global}}" /> and causal dependencies{' '}
            <KaTeXMath tex="P_{D_{\text{global}}}(u(a)) \to u(b)" />,{' '}
            <KaTeXMath tex="P_{D_{\text{global}}}(u(b)) \to u(a)" /> to <KaTeXMath tex="D_{\text{global}}" />.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPostPhase2Branch('rewrites')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-purple-200 bg-purple-50/70 text-purple-900 text-xs font-semibold hover:bg-purple-100 transition-colors cursor-pointer self-start lg:self-auto shrink-0"
        >
          <GitBranch className="w-3.5 h-3.5" />
          Inspect [Show ZX-Rewrites]
        </button>
      </div>

      {/* Controls Bar: Heuristic Selector + Safe Hook-Error Splits Toggle + Playback Controls */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 items-center rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
        {/* Heuristic Selector & Safe Hook Splits Toggle */}
        <div className="xl:col-span-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
            <label
              htmlFor="phase3-heuristic-select"
              className="text-xs font-semibold text-slate-700"
            >
              Edge Ordering Heuristic:
            </label>
            <select
              id="phase3-heuristic-select"
              value={routingHeuristic}
              onChange={(e) => {
                setIsPlaying(false);
                setRoutingHeuristic(e.target.value as RoutingHeuristicType);
              }}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none cursor-pointer"
            >
              {HEURISTIC_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {customEdgeOrder && (
            <button
              type="button"
              onClick={() => setCustomEdgeOrder(undefined)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-semibold hover:bg-amber-200 cursor-pointer"
              title="Reset manual edge order back to the selected heuristic"
            >
              <RotateCcw className="w-3 h-3" /> Reset Manual Order
            </button>
          )}

          {/* Optional Safe Hook-Error Splits Toggle */}
          <label
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-800 cursor-pointer hover:border-purple-300"
            title="Unfuse high-degree non-pivot spiders along safe hook-error splits before expanding into Well-Ordered Cat States"
          >
            <input
              type="checkbox"
              checked={analyzeHookErrors}
              onChange={(e) => {
                setIsPlaying(false);
                setAnalyzeHookErrors(e.target.checked);
              }}
              className="w-3.5 h-3.5 accent-purple-700 rounded cursor-pointer"
            />
            <Split className="w-3.5 h-3.5 text-purple-700" />
            <span>Safe Hook-Error Splits</span>
          </label>
        </div>

        {/* Playback Controls */}
        <div className="xl:col-span-6 flex flex-wrap items-center justify-between sm:justify-end gap-2">
          <div className="inline-flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setAlg1StepIndex(0);
              }}
              disabled={clampedStep === 0}
              title="Reset to Step 0 (Initial Disjoint Cat States)"
              className="p-1.5 rounded-lg text-slate-700 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setAlg1StepIndex(clampedStep - 1);
              }}
              disabled={clampedStep === 0}
              title="Previous Edge Step"
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              type="button"
              onClick={handleTogglePlay}
              className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                isPlaying
                  ? 'bg-amber-600 text-white'
                  : 'bg-emerald-700 text-white hover:bg-emerald-800'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5" /> Pause
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" /> Play
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setAlg1StepIndex(clampedStep + 1);
              }}
              disabled={clampedStep >= totalSteps}
              title="Next Edge Step"
              className="inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-35 cursor-pointer"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setAlg1StepIndex(totalSteps);
              }}
              disabled={clampedStep >= totalSteps}
              title="Complete All Edges"
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-35 cursor-pointer"
            >
              All <SkipForward className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Step Scrubber Slider */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={totalSteps}
              value={clampedStep}
              onChange={(e) => {
                setIsPlaying(false);
                setAlg1StepIndex(Number(e.target.value));
              }}
              className="w-28 sm:w-36 accent-emerald-700 cursor-pointer"
            />
            <select
              value={playIntervalMs}
              onChange={(e) => setPlayIntervalMs(Number(e.target.value))}
              title="Playback speed"
              className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-mono text-slate-600 cursor-pointer"
            >
              <option value={850}>0.7x</option>
              <option value={550}>1.0x</option>
              <option value={240}>2.0x</option>
            </select>
          </div>
        </div>
      </div>

      {/* Step Status Callout Bar */}
      <div
        className={`rounded-xl border p-3.5 text-xs transition-colors ${
          activeSnap
            ? 'border-amber-200 bg-amber-50/50'
            : 'border-slate-200 bg-slate-50/60'
        }`}
      >
        {activeSnap ? (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-amber-600 text-white font-mono font-bold text-[11px]">
                  Step {clampedStep} / {totalSteps}
                </span>
                <span className="font-bold text-slate-900">
                  Matching Bipartite Edge ({rowSym}
                  <sub>{activeSnap.zSpiderIndex}</sub>, {colSym}
                  <sub>{activeSnap.xSpiderIndex}</sub>)
                </span>
                <span className="font-mono text-slate-600">
                  → Selected Earliest 3-Ary Ports:{' '}
                  <strong className="text-emerald-800">
                    u({rowSym}
                    <sub>{activeSnap.zSpiderIndex}</sub>) = {activeSnap.zGlobalNode}
                  </strong>{' '}
                  &amp;{' '}
                  <strong className="text-rose-800">
                    u({colSym}
                    <sub>{activeSnap.xSpiderIndex}</sub>) = {activeSnap.xGlobalNode}
                  </strong>
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span>
                  1. Added to <code className="font-bold">G_global</code>: undirected CNOT{' '}
                  <strong className="text-orange-700">
                    ({activeSnap.zGlobalNode}, {activeSnap.xGlobalNode})
                  </strong>
                </span>
                <span>
                  2. Parents:{' '}
                  <code>
                    P_D({activeSnap.zGlobalNode}) = [
                    {activeSnap.zParentGlobalNodes.join(', ') || '∅'}]
                  </code>
                  ,{' '}
                  <code>
                    P_D({activeSnap.xGlobalNode}) = [
                    {activeSnap.xParentGlobalNodes.join(', ') || '∅'}]
                  </code>
                </span>
                <span>
                  3. Added to <code className="font-bold">D_global</code>:{' '}
                  <strong className="text-orange-700">
                    {activeSnap.addedDagEdges.length > 0
                      ? activeSnap.addedDagEdges
                          .map((e) => `${e.source} → ${e.target}`)
                          .join(', ')
                      : 'none (both endpoints are roots)'}
                  </strong>
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-emerald-200 text-emerald-800 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Acyclic DAG • Depth {activeSnap.dagDepth}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="px-2 py-0.5 rounded bg-slate-800 text-white font-mono font-bold text-[11px] mr-2">
                Step 0 / {totalSteps} (Initial State)
              </span>
              <span className="font-semibold text-slate-800">
                Disjoint Union of Well-Ordered Cat States (Before Adding External CNOT Edges)
              </span>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Heuristic selected: <strong>{activeHeuristicMeta.label}</strong> ({activeHeuristicMeta.shortDesc}). Click{' '}
                <strong>Next &gt;</strong>, <strong>Play</strong>, or click any dashed edge in Panel 1 to step through Algorithm 1.
              </p>
            </div>
            {validation.isPerfect && (
              <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 font-mono text-[11px] font-semibold shrink-0">
                Perfect QECC: {colSym}-spiders unfused at t−1
              </span>
            )}
          </div>
        )}
      </div>

      {/* Synchronized 3-Panel Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        <div className="lg:col-span-3">
          <TargetZxPanel
            pipeline={pipeline}
            stepIndex={clampedStep}
            basis={basis}
            onSelectRemainingEdge={handleSelectRemainingEdge}
            onJumpToStep={(step) => {
              setIsPlaying(false);
              setAlg1StepIndex(step);
            }}
          />
        </div>

        <div className="lg:col-span-5">
          <GlobalGraphPanel
            pipeline={pipeline}
            stepIndex={clampedStep}
            basis={basis}
          />
        </div>

        <div className="lg:col-span-4">
          <GlobalDagPanel
            pipeline={pipeline}
            stepIndex={clampedStep}
            basis={basis}
          />
        </div>
      </div>
    </div>
  );
};
