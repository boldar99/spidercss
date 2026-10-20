import React, { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  Play,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Layers,
  Zap,
  Minimize2,
  Sparkles,
  Sliders,
  Compass,
} from 'lucide-react';
import {
  $compilerStore,
  setMaxBasisTries,
  setRoutingHeuristic,
  setReuseTarget,
  runBasisOptimizer,
} from '../../stores/compilerStore';
import type {
  ReuseTargetType,
  RoutingHeuristicType,
} from '../../engine/types';
import { compileFromGlobalPipeline } from '../../engine/qubitReuse';
import type { GlobalPipelineSetup } from '../../engine/spiderLegMatcher';
import { QuantumCircuitSvg } from '../phase4/QuantumCircuitSvg';
import { CircuitExportBox } from '../phase4/CircuitExportBox';
import { Phase5ContextualCard } from '../phase5/Phase5Benchmarks';
import { Math as KaTeXMath } from '../common/Math';

interface FullCompilerGuiProps {
  pipeline: GlobalPipelineSetup | null;
  error: string | null;
}

const HEURISTIC_OPTIONS: Array<{
  value: RoutingHeuristicType;
  label: string;
  tag: string;
  description: string;
}> = [
  {
    value: 'sa_sequence_distance',
    label: 'SA Sequence Distance',
    tag: 'Recommended',
    description:
      'Simulated annealing minimizing cat-state sequence span, reducing ancilla collision and depth.',
  },
  {
    value: 'critical_path_first',
    label: 'Critical Path First',
    tag: 'Depth Focus',
    description:
      'Prioritizes ports with the largest reverse distance-to-sink in the global DAG.',
  },
  {
    value: 'earliest_start_first',
    label: 'Earliest Start First',
    tag: 'Greedy',
    description:
      'Greedy selection minimizing maximum input port depth across ready edges.',
  },
  {
    value: 'active_spider_first',
    label: 'Active Spider First',
    tag: 'Min Ancillas',
    description:
      'Completes already-opened cat states first to shorten ancilla lifetimes.',
  },
  {
    value: 'joint_resource',
    label: 'Joint Resource Planner',
    tag: 'Joint Search',
    description:
      'Local swap search co-optimizing port matching, wire sharing, and peak qubits.',
  },
];

const PRESET_TRIES = [100, 500, 1000, 5000];

export const FullCompilerGui: React.FC<FullCompilerGuiProps> = ({
  pipeline,
  error,
}) => {
  const state = useStore($compilerStore);
  const {
    selectedPresetId,
    validation,
    maxBasisTries,
    routingHeuristic,
    reuseTarget,
    isOptimizingBasis,
    costHistory,
    rrefSnapshot,
    initialCost,
  } = state;

  // Precompute all 3 Qubit Reuse variants when pipeline is ready
  const reuseVariants = useMemo(() => {
    if (!pipeline) return null;
    try {
      const none = compileFromGlobalPipeline(pipeline, 'None');
      const depth = compileFromGlobalPipeline(pipeline, 'depth');
      const qubits = compileFromGlobalPipeline(pipeline, 'qubits');
      return { None: none, depth, qubits };
    } catch {
      return null;
    }
  }, [pipeline]);

  const activeCompiled = reuseVariants
    ? reuseTarget === 'None'
      ? reuseVariants.None
      : reuseTarget === 'depth'
      ? reuseVariants.depth
      : reuseVariants.qubits
    : null;

  const baselineQubits = reuseVariants?.None.numQubits ?? 0;
  const savedQubits = activeCompiled
    ? Math.max(0, baselineQubits - activeCompiled.numQubits)
    : 0;

  const codeLabel =
    selectedPresetId === 'custom'
      ? `${validation.n}_${validation.k}_${validation.d}`
      : selectedPresetId.split('/').pop() ?? 'code';

  // Convergence sparkline
  const sparkline = useMemo(() => {
    if (costHistory.length <= 1) return null;
    const w = 240;
    const h = 42;
    const padY = 5;
    const minC = Math.min(...costHistory);
    const maxC = Math.max(...costHistory);
    const range = maxC - minC || 1;

    const coords = costHistory.map((val, idx) => {
      const x = (idx / (costHistory.length - 1)) * w;
      const yPlot =
        minC === maxC
          ? h / 2
          : padY + ((maxC - val) / range) * (h - 2 * padY);
      return { x, y: yPlot };
    });

    const pts = coords.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    const first = coords[0];
    const last = coords[coords.length - 1];
    const areaPoints = `${first.x.toFixed(1)},${h - 2} ${pts.join(' ')} ${last.x.toFixed(1)},${h - 2}`;

    return {
      w,
      h,
      polyline: pts.join(' '),
      areaPoints,
      first,
      last,
      startCost: costHistory[0],
      endCost: costHistory[costHistory.length - 1],
      trialsCount: costHistory.length - 1,
    };
  }, [costHistory]);

  const cxSaved = initialCost.totalCnots - rrefSnapshot.cost.totalCnots;
  const pctSaved =
    initialCost.totalCnots > 0
      ? Math.round((cxSaved / initialCost.totalCnots) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Compiler Parameters Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-6">
        <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Compiler Configuration
              </span>
              <h3 className="text-lg font-bold text-slate-900">
                Fault-Tolerant Synthesis Controls
              </h3>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Configure Monte Carlo basis search trials (<code className="font-mono text-xs">max_basis_tries</code>) and select an edge ordering heuristic to compile the circuit.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => runBasisOptimizer(maxBasisTries)}
              disabled={isOptimizingBasis || !validation.valid}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-xs sm:text-sm font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer shrink-0"
            >
              {isOptimizingBasis ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Optimizing Basis…</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run Basis Optimizer ({maxBasisTries} trials)</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 2-Column Grid: max_basis_tries & Edge Ordering Heuristic */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Parameter 1: max_basis_tries */}
          <div className="lg:col-span-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor="gui-max-basis-tries"
                className="text-xs font-bold text-slate-800 font-mono flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5 text-emerald-700" />
                max_basis_tries
              </label>
              <span className="text-[11px] text-slate-500 font-mono">
                Current: <strong className="text-emerald-800">{maxBasisTries}</strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="gui-max-basis-tries"
                type="number"
                min={1}
                max={10000}
                step={50}
                value={maxBasisTries}
                onChange={(e) => setMaxBasisTries(Number(e.target.value))}
                className="w-28 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-sm font-bold text-slate-900 focus:border-emerald-600 focus:outline-none shadow-2xs"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {PRESET_TRIES.map((presetVal) => (
                  <button
                    key={presetVal}
                    type="button"
                    onClick={() => setMaxBasisTries(presetVal)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-medium transition-all cursor-pointer border ${
                      maxBasisTries === presetVal
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {presetVal >= 1000 ? `${presetVal / 1000}k` : presetVal}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed">
              Explores random column-permuted bases over <KaTeXMath tex="\mathbb{F}_2" /> via Gaussian elimination to find a generator basis minimizing CNOT cost while preserving the unique-ones property.
            </p>

            {/* Optimization Convergence Summary / Sparkline */}
            {sparkline ? (
              <div className="rounded-xl bg-emerald-50/70 border border-emerald-200 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="flex items-center gap-1.5 font-bold text-emerald-900">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Basis Optimized ({sparkline.trialsCount} trials)
                  </span>
                  <span className="text-emerald-800 font-bold">
                    {sparkline.startCost} → {sparkline.endCost} CX
                    {cxSaved > 0 && ` (−${cxSaved})`}
                  </span>
                </div>
                <div className="h-10 w-full overflow-hidden">
                  <svg
                    viewBox={`0 0 ${sparkline.w} ${sparkline.h}`}
                    className="w-full h-full overflow-visible"
                    preserveAspectRatio="none"
                  >
                    <polygon
                      points={sparkline.areaPoints}
                      fill="#10b981"
                      fillOpacity={0.16}
                    />
                    <polyline
                      fill="none"
                      stroke="#047857"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      points={sparkline.polyline}
                    />
                    <circle
                      cx={sparkline.first.x}
                      cy={sparkline.first.y}
                      r={3}
                      fill="#64748b"
                    />
                    <circle
                      cx={sparkline.last.x}
                      cy={sparkline.last.y}
                      r={3.5}
                      fill="#047857"
                    />
                  </svg>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono text-emerald-800/80">
                  <span>Trial 0: {sparkline.startCost} CX</span>
                  {cxSaved > 0 && <span>Saved {pctSaved}% CNOTs</span>}
                  <span>Best: {sparkline.endCost} CX</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex items-center justify-between">
                <span>Current basis cost:</span>
                <strong className="font-mono text-slate-900">
                  {rrefSnapshot.cost.totalCnots} CX / {rrefSnapshot.cost.totalFlags} Flags
                </strong>
              </div>
            )}
          </div>

          {/* Parameter 2: Edge ordering Heuristic */}
          <div className="lg:col-span-7 space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-emerald-700" />
                Edge Ordering Heuristic
              </label>
              <span className="text-[11px] font-mono text-slate-500">
                5 Alg. 1 Strategies
              </span>
            </div>

            <div className="space-y-2">
              {HEURISTIC_OPTIONS.map((opt) => {
                const isSelected = routingHeuristic === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRoutingHeuristic(opt.value)}
                    className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                      isSelected
                        ? 'bg-emerald-50/80 border-emerald-600 shadow-2xs ring-1 ring-emerald-600/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold ${
                            isSelected ? 'text-emerald-950' : 'text-slate-900'
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                            isSelected
                              ? 'bg-emerald-200/70 text-emerald-900'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {opt.tag}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 leading-tight">
                        {opt.description}
                      </p>
                    </div>

                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && (
                        <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Compiler Output: Circuit, Metrics, Qubit Reuse & Export */}
      {error ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-900 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <div className="font-bold">Compilation Paused</div>
            <div className="mt-0.5 text-amber-800">{error}</div>
          </div>
        </div>
      ) : activeCompiled && reuseVariants ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-6">
          {/* Output Header & Key Metrics Banner */}
          <div className="border-b border-slate-100 pb-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Compiled Circuit
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  Synthesized Fault-Tolerant Quantum Circuit
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Linear-time extraction from bipartite ZX-diagram via acyclic dependency graph, with post-extraction ancilla reuse.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 font-mono text-xs text-emerald-950 font-semibold flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-emerald-700" />
                <span>{activeCompiled.numQubits} Qubits</span>
                <span>•</span>
                <span>{activeCompiled.numCx} CX</span>
                <span>•</span>
                <span>Depth {activeCompiled.cnotDepth}</span>
              </div>
            </div>
          </div>

          {/* Metric Badges Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
                Simultaneous Qubits
              </div>
              <div className="text-base font-bold font-mono text-emerald-800 mt-0.5">
                {activeCompiled.numQubits}
                <span className="text-[11px] font-normal text-slate-500 ml-1">
                  ({activeCompiled.numDataQubits}d +{' '}
                  {activeCompiled.numQubits - activeCompiled.numDataQubits}a)
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
                Data Qubits (n)
              </div>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {activeCompiled.numDataQubits}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
                Flag Measurements
              </div>
              <div className="text-base font-bold font-mono text-amber-800 mt-0.5">
                {activeCompiled.numFlagMeasurements}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
                CNOT Count
              </div>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {activeCompiled.numCx}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
                CNOT Depth
              </div>
              <div className="text-base font-bold font-mono text-indigo-800 mt-0.5">
                {activeCompiled.cnotDepth}
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5">
              <div className="text-[10px] font-mono uppercase text-slate-500 font-semibold">
                Total Circuit Depth
              </div>
              <div className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {activeCompiled.circuitDepth}
              </div>
            </div>
          </div>

          {/* Qubit Reuse Mode Switcher */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
              <span className="text-xs font-bold text-slate-800">
                Post-Extraction Qubit Reuse Strategy:
              </span>
              <span className="text-[11px] font-mono text-slate-600">
                Recycled ancillas:{' '}
                <strong className="text-emerald-800">
                  {savedQubits > 0 ? `${savedQubits} flag wires saved` : 'None'}
                </strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setReuseTarget('qubits')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                  reuseTarget === 'qubits'
                    ? 'bg-emerald-900 text-white border-emerald-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Minimize2 className="w-3.5 h-3.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Minimize Qubits</div>
                    <div
                      className={`text-[10px] ${
                        reuseTarget === 'qubits'
                          ? 'text-emerald-200'
                          : 'text-slate-500'
                      }`}
                    >
                      {reuseVariants.qubits.numQubits} Qubits • Depth {reuseVariants.qubits.cnotDepth}
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReuseTarget('depth')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                  reuseTarget === 'depth'
                    ? 'bg-emerald-900 text-white border-emerald-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">Optimize Depth</div>
                    <div
                      className={`text-[10px] ${
                        reuseTarget === 'depth'
                          ? 'text-emerald-200'
                          : 'text-slate-500'
                      }`}
                    >
                      {reuseVariants.depth.numQubits} Qubits • Depth {reuseVariants.depth.cnotDepth}
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setReuseTarget('None')}
                className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                  reuseTarget === 'None'
                    ? 'bg-emerald-900 text-white border-emerald-900 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5 shrink-0" />
                  <div>
                    <div className="text-xs font-bold">No Qubit Reuse</div>
                    <div
                      className={`text-[10px] ${
                        reuseTarget === 'None'
                          ? 'text-emerald-200'
                          : 'text-slate-500'
                      }`}
                    >
                      {reuseVariants.None.numQubits} Qubits • Depth {reuseVariants.None.cnotDepth}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Circuit Visualizer */}
          <QuantumCircuitSvg compiled={activeCompiled} />

          {/* Circuit Export (.stim & .qasm) */}
          <CircuitExportBox compiled={activeCompiled} codeName={codeLabel} />
        </div>
      ) : null}

      {/* Contextual Monte Carlo Simulation Benchmarks */}
      <Phase5ContextualCard />
    </div>
  );
};
