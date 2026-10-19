import React, { useMemo, useRef } from 'react';
import { useStore } from '@nanostores/react';
import {
  Shuffle,
  ArrowRightLeft,
  Layers,
  Undo2,
  Play,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Cpu,
  Sparkles,
} from 'lucide-react';
import {
  $compilerStore,
  applyRowOptimizationResult,
  generateNewPermutationTrial,
  resetPermutationToIdentity,
  runBasisOptimizationSync,
  setMaxBasisTries,
  setOptimizingBasis,
  setPostPhase2Branch,
  setRrefRowOpStepIndex,
  setRrefWalkthroughStage,
} from '../../stores/compilerStore';
import type {
  CompilerWorkerRequest,
  CompilerWorkerResponse,
} from '../../engine/compiler.worker';
import { MatrixStepViewer } from './MatrixStepViewer';
import { BipartiteZxView } from './BipartiteZxView';
import { CostBreakdownCard } from './CostBreakdownCard';
import { Math as KaTeXMath } from '../common/Math';

export const Phase2RrefOptim: React.FC = () => {
  const state = useStore($compilerStore);
  const {
    mode,
    basis,
    validation,
    activeInputMatrix,
    initialCost,
    rrefSnapshot,
    rrefWalkthroughStage,
    rrefRowOpStepIndex,
    maxBasisTries,
    costHistory,
    isOptimizingBasis,
    postPhase2Branch,
  } = state;

  const workerRef = useRef<Worker | null>(null);

  const handleRunMonteCarloOptimizer = () => {
    if (isOptimizingBasis) return;
    setOptimizingBasis(true);

    try {
      if (typeof Worker !== 'undefined') {
        if (!workerRef.current) {
          workerRef.current = new Worker(
            new URL('../../engine/compiler.worker.ts', import.meta.url),
            { type: 'module' }
          );
        }
        const worker = workerRef.current;
        const reqId = `opt-${Date.now()}`;
        worker.onmessage = (ev: MessageEvent<CompilerWorkerResponse>) => {
          if (
            ev.data.type === 'OPTIMIZE_MATRIX_RESULT' &&
            ev.data.requestId === reqId
          ) {
            applyRowOptimizationResult(ev.data.result);
          } else if (ev.data.type === 'ERROR' && ev.data.requestId === reqId) {
            runBasisOptimizationSync(maxBasisTries);
          }
        };
        const req: CompilerWorkerRequest = {
          type: 'OPTIMIZE_MATRIX',
          requestId: reqId,
          M: activeInputMatrix,
          t: validation.t,
          maxBasisTries,
          seed: state.permutationSeed + 1,
        };
        worker.postMessage(req);
      } else {
        runBasisOptimizationSync(maxBasisTries);
      }
    } catch {
      runBasisOptimizationSync(maxBasisTries);
    }
  };

  // Compute SVG points for costHistory convergence sparkline
  const sparkline = useMemo(() => {
    if (costHistory.length <= 1) return null;
    const w = 240;
    const h = 44;
    const pad = 4;
    const minC = Math.min(...costHistory);
    const maxC = Math.max(...costHistory);
    const range = Math.max(1, maxC - minC);

    const pts = costHistory.map((val, idx) => {
      const x =
        pad + (idx / Math.max(1, costHistory.length - 1)) * (w - 2 * pad);
      const y = h - pad - ((maxC - val) / range) * (h - 2 * pad);
      // Wait: higher cost should be higher up (smaller y), lower cost should be lower down (larger y)
      const yCorrect = pad + ((maxC - val) / range) * (h - 2 * pad);
      return `${x.toFixed(1)},${yCorrect.toFixed(1)}`;
    });

    return {
      w,
      h,
      polyline: pts.join(' '),
      startCost: costHistory[0],
      endCost: costHistory[costHistory.length - 1],
    };
  }, [costHistory]);

  const totalRowOps = rrefSnapshot.rowOpSteps.length;
  const currentRowOp =
    rrefRowOpStepIndex > 0 && rrefRowOpStepIndex <= totalRowOps
      ? rrefSnapshot.rowOpSteps[rrefRowOpStepIndex - 1]
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs">
        {/* Phase 2 Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Phase 2
              </span>
              <h3 className="text-lg font-bold text-slate-900">
                Bipartite ZX-Diagram &amp; Column-Permuted RREF Basis Optimization
              </h3>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Different stabilizer generator bases yield different bipartite ZX-diagrams. Column-permuted Gaussian elimination over{' '}
              <KaTeXMath tex="\mathbb{F}_2" /> embeds an identity submatrix{' '}
              <KaTeXMath tex="I_r" /> into the pivot columns (guaranteeing the unique-ones property) while minimizing Eq. (8) CNOT cost.
            </p>
          </div>

          {/* Monte Carlo Basis Optimizer Bar (Prominent in GUI Mode, available in both) */}
          <div
            className={`flex flex-wrap items-center gap-2.5 rounded-xl p-2.5 border ${
              mode === 'gui'
                ? 'bg-emerald-50/70 border-emerald-300'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-1.5 text-xs">
              <label
                htmlFor="max-basis-tries-input"
                className="font-mono font-semibold text-slate-700"
              >
                max_basis_tries:
              </label>
              <input
                id="max-basis-tries-input"
                type="number"
                min={1}
                max={10000}
                step={50}
                value={maxBasisTries}
                onChange={(e) => setMaxBasisTries(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={handleRunMonteCarloOptimizer}
              disabled={isOptimizingBasis || !validation.valid}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {isOptimizingBasis
                ? 'Optimizing…'
                : `Run Basis Optimizer (${maxBasisTries} trials)`}
            </button>

            {sparkline && (
              <div
                className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-slate-200"
                title={`Monte Carlo CNOT convergence over ${
                  costHistory.length - 1
                } random RREF trials`}
              >
                <svg
                  width={90}
                  height={24}
                  viewBox={`0 0 ${sparkline.w} ${sparkline.h}`}
                  className="overflow-visible"
                >
                  <polyline
                    fill="none"
                    stroke="#047857"
                    strokeWidth="3"
                    points={sparkline.polyline}
                  />
                </svg>
                <span className="font-mono text-[11px] font-bold text-emerald-800">
                  {sparkline.startCost} → {sparkline.endCost} CX
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4-Step Interactive RREF Walkthrough Controls */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Step-by-Step RREF Procedure (Single Trial Inspector):
            </span>
            <button
              type="button"
              onClick={() => resetPermutationToIdentity()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" /> Reset to Identity π
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => generateNewPermutationTrial()}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                rrefWalkthroughStage === 1
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-mono text-xs font-bold ${
                  rrefWalkthroughStage === 1
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <Shuffle className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold">
                  1. (Re-)Generate Permutation
                </div>
                <div
                  className={`text-[11px] ${
                    rrefWalkthroughStage === 1
                      ? 'text-slate-300'
                      : 'text-slate-500'
                  }`}
                >
                  Sample random column order π ∈ Sₙ
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRrefWalkthroughStage(2)}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                rrefWalkthroughStage === 2
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-mono text-xs font-bold ${
                  rrefWalkthroughStage === 2
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold">2. Permute Columns</div>
                <div
                  className={`text-[11px] ${
                    rrefWalkthroughStage === 2
                      ? 'text-slate-300'
                      : 'text-slate-500'
                  }`}
                >
                  Reorder matrix columns M[:, π]
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRrefWalkthroughStage(3)}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                rrefWalkthroughStage === 3
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-mono text-xs font-bold ${
                  rrefWalkthroughStage === 3
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold">
                  3. Gaussian Elimination
                </div>
                <div
                  className={`text-[11px] ${
                    rrefWalkthroughStage === 3
                      ? 'text-slate-300'
                      : 'text-slate-500'
                  }`}
                >
                  RREF over GF(2) ({totalRowOps} row ops)
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setRrefWalkthroughStage(4)}
              className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                rrefWalkthroughStage === 4
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 font-mono text-xs font-bold ${
                  rrefWalkthroughStage === 4
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </div>
              <div>
                <div className="text-xs font-bold">4. Un-permute Columns</div>
                <div
                  className={`text-[11px] ${
                    rrefWalkthroughStage === 4
                      ? 'text-slate-300'
                      : 'text-slate-500'
                  }`}
                >
                  Restore qubit order RREF(M[:, π])[:, π⁻¹]
                </div>
              </div>
            </button>
          </div>

          {/* Sub-step scrubber when in Stage 3 (Gaussian Elimination) */}
          {rrefWalkthroughStage === 3 && (
            <div className="mt-3 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRrefRowOpStepIndex(rrefRowOpStepIndex - 1)}
                  disabled={rrefRowOpStepIndex <= 0}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev Row XOR
                </button>
                <input
                  type="range"
                  min={0}
                  max={totalRowOps}
                  value={rrefRowOpStepIndex}
                  onChange={(e) =>
                    setRrefRowOpStepIndex(Number(e.target.value))
                  }
                  className="w-36 sm:w-52 accent-emerald-700 cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => setRrefRowOpStepIndex(rrefRowOpStepIndex + 1)}
                  disabled={rrefRowOpStepIndex >= totalRowOps}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 font-medium hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                >
                  Next Row XOR <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="font-mono text-xs text-slate-700">
                {currentRowOp ? (
                  <span>
                    Op {rrefRowOpStepIndex}/{totalRowOps}:{' '}
                    <strong className="text-amber-800">
                      {currentRowOp.description}
                    </strong>
                  </span>
                ) : rrefRowOpStepIndex === 0 ? (
                  <span>Before row elimination (0/{totalRowOps} ops)</span>
                ) : (
                  <span className="text-emerald-800 font-semibold">
                    All {totalRowOps} row XOR operations complete
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Split-Screen Content: Left = MatrixStepViewer + CostBreakdownCard, Right = BipartiteZxView */}
        <div className="mt-5 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-6 space-y-4">
            <MatrixStepViewer
              activeInputMatrix={activeInputMatrix}
              rrefSnapshot={rrefSnapshot}
              stage={rrefWalkthroughStage}
              rowOpStepIndex={rrefRowOpStepIndex}
              t={validation.t}
              basis={basis}
              onCustomPermutation={(perm) => generateNewPermutationTrial(perm)}
            />
            <CostBreakdownCard
              currentCost={rrefSnapshot.cost}
              initialCost={initialCost}
              t={validation.t}
              isPerfect={validation.isPerfect}
            />
          </div>

          <div className="xl:col-span-6">
            <BipartiteZxView
              matrix={rrefSnapshot.unpermutedMatrix}
              pivots={rrefSnapshot.pivots}
              nonPivots={rrefSnapshot.nonPivots}
              cost={rrefSnapshot.cost}
              basis={basis}
              t={validation.t}
            />
          </div>
        </div>
      </div>

      {/* Post-Phase 2 Branching Selector Bar: (a) [Show ZX-Rewrites] vs (b) [Show Pipeline] */}
      <div className="rounded-2xl border-2 border-emerald-600/30 bg-gradient-to-r from-emerald-50/70 via-white to-slate-50 p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider font-bold text-emerald-800">
              Post-Phase 2 Exploration Branch
            </div>
            <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
              How would you like to proceed from the idealized bipartite ZX-diagram?
            </h4>
            <p className="text-xs text-slate-600 mt-0.5">
              Explore the theoretical fault-equivalent ZX-calculus rewrites (Section III.A) or jump directly into the Algorithm 1 compiler pipeline (Section IV).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setPostPhase2Branch('rewrites')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer ${
                postPhase2Branch === 'rewrites'
                  ? 'bg-purple-700 text-white border-purple-700 shadow-sm'
                  : 'bg-white text-slate-800 border-slate-300 hover:bg-purple-50 hover:border-purple-300'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              [Show ZX-Rewrites] (Theory)
            </button>

            <button
              type="button"
              onClick={() => setPostPhase2Branch('pipeline')}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition-all cursor-pointer ${
                postPhase2Branch === 'pipeline'
                  ? 'bg-emerald-700 text-white border-emerald-700 shadow-sm'
                  : 'bg-white text-slate-800 border-slate-300 hover:bg-emerald-50 hover:border-emerald-300'
              }`}
            >
              <Cpu className="w-4 h-4" />
              [Show Pipeline] (Phase 3 &amp; 4)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
