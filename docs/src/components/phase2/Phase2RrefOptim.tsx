import React, { useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Shuffle,
  ArrowRightLeft,
  Layers,
  Undo2,
  Play,
  RotateCcw,
  GitBranch,
  Cpu,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import {
  $compilerStore,
  generateNewPermutationTrial,
  resetPermutationToIdentity,
  runBasisOptimizationSync,
  setMaxBasisTries,
  setOptimizingBasis,
  setPostPhase2Branch,
  setRrefWalkthroughStage,
} from '../../stores/compilerStore';
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
    maxBasisTries,
    costHistory,
    isOptimizingBasis,
    postPhase2Branch,
  } = state;

  const [optimRunCount, setOptimRunCount] = useState(0);
  const [highlightedRow, setHighlightedRow] = useState<number | null>(null);
  const [highlightedColQubit, setHighlightedColQubit] = useState<number | null>(null);

  const handleRunMonteCarloOptimizer = () => {
    if (isOptimizingBasis) return;
    setOptimizingBasis(true);

    // Yield one frame so the button renders "Optimizing…" before running the synchronous trials
    window.setTimeout(() => {
      runBasisOptimizationSync(maxBasisTries);
      setOptimRunCount((c) => c + 1);
    }, 25);
  };

  // Compute SVG points for costHistory convergence sparkline
  const sparkline = useMemo(() => {
    if (costHistory.length <= 1) return null;
    const w = 240;
    const h = 44;
    const padX = 6;
    const padY = 6;
    const minC = Math.min(...costHistory);
    const maxC = Math.max(...costHistory);
    const range = Math.max(1, maxC - minC);

    const coords = costHistory.map((val, idx) => {
      const x =
        padX + (idx / Math.max(1, costHistory.length - 1)) * (w - 2 * padX);
      const y =
        minC === maxC
          ? h / 2
          : padY + ((val - minC) / range) * (h - 2 * padY);
      // Higher cost = smaller y (top), lower cost = larger y (bottom)
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

  const totalRowOps = rrefSnapshot.rowOpSteps.length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs">
        {/* Phase 2 Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
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

          {/* Monte Carlo Basis Optimizer Card */}
          <div
            className={`flex flex-col gap-2 rounded-xl p-2.5 border shrink-0 w-full sm:w-auto min-w-[350px] ${
              mode === 'gui'
                ? 'bg-emerald-50/70 border-emerald-300'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-3 text-xs">
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
                step={25}
                value={maxBasisTries}
                onChange={(e) => setMaxBasisTries(Number(e.target.value))}
                className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none text-right"
              />
            </div>

            <button
              type="button"
              onClick={handleRunMonteCarloOptimizer}
              disabled={isOptimizingBasis || !validation.valid}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 transition-colors shadow-2xs cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              {isOptimizingBasis
                ? 'Optimizing…'
                : `Run Basis Optimizer (${maxBasisTries} trials)`}
            </button>

            {sparkline && (
              <div
                className="flex flex-col gap-1 bg-white px-2.5 py-1.5 rounded-lg border border-emerald-200 shadow-2xs"
                title={`Monte Carlo CNOT convergence over ${sparkline.trialsCount} random RREF trials`}
              >
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-mono text-[11px] font-bold text-emerald-800">
                    {sparkline.startCost} → {sparkline.endCost} CX ({sparkline.trialsCount} trials{optimRunCount > 0 ? `, run #${optimRunCount}` : ''})
                  </span>
                </div>
                <svg
                  width={210}
                  height={38}
                  viewBox={`0 0 ${sparkline.w} ${sparkline.h}`}
                  className="overflow-visible w-full"
                >
                  <polygon
                    points={sparkline.areaPoints}
                    fill="#10b981"
                    fillOpacity={0.14}
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
            )}
          </div>
        </div>

        {/* 4-Step RREF Procedure Controls */}
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
        </div>

        {/* Full-Width Eq. (8) Cost Breakdown Card directly after Step-by-Step RREF Procedure */}
        <div className="mt-4">
          <CostBreakdownCard
            currentCost={rrefSnapshot.cost}
            initialCost={initialCost}
            t={validation.t}
            isPerfect={validation.isPerfect}
            basis={basis}
          />
        </div>

        {/* Full-Width MatrixStepViewer followed by Full-Width BipartiteZxView */}
        <div className="mt-4 space-y-5">
          <MatrixStepViewer
            activeInputMatrix={activeInputMatrix}
            rrefSnapshot={rrefSnapshot}
            stage={rrefWalkthroughStage}
            t={validation.t}
            basis={basis}
            onCustomPermutation={(perm) => generateNewPermutationTrial(perm)}
            highlightedRow={highlightedRow}
            highlightedColQubit={highlightedColQubit}
            onHoverRow={setHighlightedRow}
            onHoverColQubit={setHighlightedColQubit}
          />

          <BipartiteZxView
            matrix={rrefSnapshot.unpermutedMatrix}
            pivots={rrefSnapshot.pivots}
            nonPivots={rrefSnapshot.nonPivots}
            cost={rrefSnapshot.cost}
            basis={basis}
            t={validation.t}
            highlightedRow={highlightedRow}
            highlightedColQubit={highlightedColQubit}
            onHoverRow={setHighlightedRow}
            onHoverColQubit={setHighlightedColQubit}
          />
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
