import React, { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { BookOpen, Sliders, AlertTriangle } from 'lucide-react';
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
import { FullCompilerGui } from './gui/FullCompilerGui';

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
      {/* Top Studio Mode Switcher */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-5">
        <div className="border-b border-slate-100 pb-4">
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-bold">
            Interactive 5-Phase Compiler Studio
          </span>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
            From CSS Stabilizers to Fault-Tolerant Quantum Circuits
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Choose how you want to interact with SpiderCSS: explore the step-by-step theoretical walkthrough or synthesize circuits directly with the full compiler.
          </p>
        </div>

        {/* Large Mode Switcher Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <button
            type="button"
            onClick={() => setStudioMode('walkthrough')}
            className={`p-4 sm:p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-4 ${
              mode === 'walkthrough'
                ? 'bg-emerald-50/70 border-emerald-600 shadow-md ring-2 ring-emerald-500/20'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
            }`}
          >
            <div
              className={`p-3 rounded-xl shrink-0 transition-colors ${
                mode === 'walkthrough'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <BookOpen className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-base sm:text-lg font-bold text-slate-900">
                Step-by-Step Walkthrough
              </span>
              <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
                Explore the paper's theory across all 5 phases: bipartite ZX diagrams, column permutations, Gaussian elimination, and DAG graph alignment.
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setStudioMode('gui')}
            className={`p-4 sm:p-5 rounded-2xl border-2 text-left transition-all cursor-pointer flex items-start gap-4 ${
              mode === 'gui'
                ? 'bg-emerald-50/70 border-emerald-600 shadow-md ring-2 ring-emerald-500/20'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70'
            }`}
          >
            <div
              className={`p-3 rounded-xl shrink-0 transition-colors ${
                mode === 'gui'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <Sliders className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-base sm:text-lg font-bold text-slate-900">
                Full Compiler GUI
              </span>
              <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
                Direct state synthesis interface: specify your code, set <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">max_basis_tries</code> and edge ordering heuristic to compile and export circuits immediately.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* Phase 1: Code & Target State Specification (Quick Presets hidden in GUI mode) */}
      <Phase1CodeSpec />

      {/* Mode View: Walkthrough 5-Phase Pipeline vs Full Compiler GUI */}
      {mode === 'gui' ? (
        <FullCompilerGui
          pipeline={pipelineState.pipeline}
          error={pipelineState.error}
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};


