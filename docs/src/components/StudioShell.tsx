import React from 'react';
import { useStore } from '@nanostores/react';
import { BookOpen, Sliders, CheckCircle2 } from 'lucide-react';
import {
  $compilerStore,
  setPostPhase2Branch,
  setStudioMode,
} from '../stores/compilerStore';
import { Phase1CodeSpec } from './phase1/Phase1CodeSpec';
import { Phase2RrefOptim } from './phase2/Phase2RrefOptim';
import { ZxRewritesView } from './branch/ZxRewritesView';

export const StudioShell: React.FC = () => {
  const state = useStore($compilerStore);
  const { mode, postPhase2Branch, validation, rrefSnapshot } = state;

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

      {/* Post-Phase 2 Branch: [Show ZX-Rewrites] vs [Show Pipeline] */}
      {postPhase2Branch === 'rewrites' ? (
        <ZxRewritesView />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Phase 3 &amp; Phase 4 Pipeline Active
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-1">
                Ready for Algorithm 1 (<code className="font-mono text-xs">G_global, D_global</code>) &amp; Circuit Extraction
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Current RREF basis locked in with{' '}
                <strong>{rrefSnapshot.cost.totalCnots} CNOTs</strong> and{' '}
                <strong>{rrefSnapshot.cost.totalFlags} flag qubits</strong>. You can also inspect the theoretical ZX-rewrites at any time.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPostPhase2Branch('rewrites')}
              className="px-3.5 py-2 rounded-xl border border-purple-300 bg-purple-50 text-purple-900 text-xs font-semibold hover:bg-purple-100 transition-colors cursor-pointer self-start sm:self-auto"
            >
              Inspect [Show ZX-Rewrites]
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
