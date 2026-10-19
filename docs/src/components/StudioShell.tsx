import React, { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { BookOpen, Sliders, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  $compilerStore,
  setStudioMode,
} from '../stores/compilerStore';
import { buildGlobalPipelineAndSnapshots } from '../engine/spiderLegMatcher';
import { Phase1CodeSpec } from './phase1/Phase1CodeSpec';
import { Phase2RrefOptim } from './phase2/Phase2RrefOptim';
import { ZxRewritesView } from './branch/ZxRewritesView';
import { Phase3Algorithm1 } from './phase3/Phase3Algorithm1';
import { Phase4Extraction } from './phase4/Phase4Extraction';
import { Phase5ContextualCard } from './phase5/Phase5Benchmarks';

export const StudioShell: React.FC = () => {
  const state = useStore($compilerStore);
  const {
    mode,
    basis,
    d,
    postPhase2Branch,
    validation,
    rrefSnapshot,
    analyzeHookErrors,
    routingHeuristic,
    customEdgeOrder,
    reuseTarget,
  } = state;

  // Build synchronized GlobalPipelineSetup for Phase 3 & Phase 4
  const pipelineState = useMemo(() => {
    if (!validation.valid) {
      return {
        pipeline: null,
        error: 'Fix CSS code validation errors in Phase 1 to run Algorithm 1 & Circuit Extraction.',
      };
    }
    try {
      const pipeline = buildGlobalPipelineAndSnapshots({
        H: rrefSnapshot.unpermutedMatrix,
        d,
        basis,
        analyzeHookErrors,
        routingHeuristic,
        customEdgeOrder,
        reuseTarget,
        seed: 42,
      });
      return { pipeline, error: null };
    } catch (err) {
      return {
        pipeline: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [
    validation.valid,
    rrefSnapshot.unpermutedMatrix,
    d,
    basis,
    analyzeHookErrors,
    routingHeuristic,
    customEdgeOrder,
    reuseTarget,
  ]);

  return (
    <div className="space-y-6">
      {/* Top Studio Mode Switcher & Live Pipeline Status Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">
            Interactive 5-Phase Compiler Studio
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
            From CSS Stabilizers to Fault-Tolerant Quantum Circuits
          </h2>
        </div>

        {/* Mode Switch: Step-by-Step Walkthrough Mode vs Full Compiler GUI Mode */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setStudioMode('walkthrough')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'walkthrough'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-emerald-700" />
              Step-by-Step Walkthrough
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('gui')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                mode === 'gui'
                  ? 'bg-white text-slate-900 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-700" />
              Full Compiler GUI
            </button>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs font-mono bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-slate-600">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              [[{validation.n}, {validation.k}, {validation.d}]]
            </span>
            <span>•</span>
            <strong className="text-emerald-800">
              {rrefSnapshot.cost.totalCnots} CX / {rrefSnapshot.cost.totalFlags} Flags
            </strong>
          </div>
        </div>
      </div>

      {/* Phase 1: Code & Target State Specification */}
      <Phase1CodeSpec />

      {/* Phase 2: Bipartite ZX-Diagram & RREF Basis Optimization */}
      <Phase2RrefOptim />

      {/* Post-Phase 2 Branch: [Show ZX-Rewrites] vs [Show Pipeline] (Phase 3 & Phase 4) */}
      {postPhase2Branch === 'rewrites' ? (
        <ZxRewritesView />
      ) : pipelineState.pipeline ? (
        <>
          {/* Phase 3: Global Data Structures (G_global, D_global) & Algorithm 1 */}
          <Phase3Algorithm1 pipeline={pipelineState.pipeline} />

          {/* Phase 4: Circuit Extraction, 3-Way Qubit Reuse & Export */}
          <Phase4Extraction pipeline={pipelineState.pipeline} />

          {/* Phase 5: Contextual Monte Carlo Simulation Benchmark Card */}
          <Phase5ContextualCard />
        </>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-900 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <div className="font-bold">
              Pipeline paused until CSS matrix satisfies unique-ones RREF
            </div>
            <div className="mt-0.5 text-amber-800">{pipelineState.error}</div>
          </div>
        </div>
      )}
    </div>
  );
};


