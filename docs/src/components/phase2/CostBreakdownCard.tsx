import React from 'react';
import { TrendingDown, Calculator, ShieldCheck } from 'lucide-react';
import type { BasisType, CostBreakdown } from '../../engine/types';
import { minimumNumberOfFlags } from '../../engine/optimizeParityMatrix';
import { Math as KaTeXMath } from '../common/Math';

interface CostBreakdownCardProps {
  currentCost: CostBreakdown;
  initialCost: CostBreakdown;
  t: number;
  isPerfect?: boolean;
  basis?: BasisType;
}

export const CostBreakdownCard: React.FC<CostBreakdownCardProps> = ({
  currentCost,
  initialCost,
  t,
  isPerfect = false,
  basis = 'Z',
}) => {
  const cnotDiff = currentCost.totalCnots - initialCost.totalCnots;
  const flagDiff = currentCost.totalFlags - initialCost.totalFlags;
  const cnotPct =
    initialCost.totalCnots > 0
      ? ((cnotDiff / initialCost.totalCnots) * 100).toFixed(1)
      : '0.0';

  // When isPerfect is true (Hamming / Golay codes), non-pivot spiders are unfused at t - 1
  const xT = isPerfect ? Math.max(0, t - 1) : t;
  const perfectColFlags = isPerfect
    ? currentCost.colWeights.reduce(
        (acc, wCol) =>
          acc + (wCol > 1 ? minimumNumberOfFlags(wCol + 1, xT) : 0),
        0
      )
    : currentCost.colFlagCnots / 2;
  const rowFlags = currentCost.rowFlagCnots / 2;
  const perfectTotalFlags = rowFlags + perfectColFlags;
  const perfectTotalCnots =
    currentCost.rowTreeCnots +
    currentCost.rowFlagCnots +
    2 * perfectColFlags;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-emerald-700" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Eq. (8) Fault-Tolerant CNOT &amp; Flag Cost Model
          </h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700 font-semibold">
            t = ⌊d / 2⌋ = {t}
          </span>
        </div>
      </div>

      {/* Full-width layout: Formula on top / left, 5 metric cards below / right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        {/* KaTeX Eq. 8 Display */}
        <div className="lg:col-span-7 rounded-xl bg-white border border-slate-200/90 px-4 py-3 flex items-center justify-center overflow-x-auto">
          <KaTeXMath
            display
            tex="C_{\text{total}}(M', t) = \underbrace{\sum_{i:\, w_i > 1} 2\,f(w_i + 1, t)}_{\text{Col Flag CNOTs}} \;+\; \underbrace{\sum_{j=1}^{r} (w_j - 1)}_{\text{Row Fan-Out CNOTs}} \;+\; \underbrace{\sum_{j=1}^{r} 2\,f(w_j, t)}_{\text{Row Flag CNOTs}}"
          />
        </div>

        {/* Breakdown Grid */}
        <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-5 gap-2 text-xs">
          <div className="rounded-xl bg-white border border-slate-200 p-2.5 flex flex-col justify-between">
            <div className="text-[10px] font-medium text-slate-500">Row Fan-Out</div>
            <div className="font-mono text-base font-bold text-slate-900 my-0.5">
              {currentCost.rowTreeCnots}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Σ(w_j − 1)
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-2.5 flex flex-col justify-between">
            <div className="text-[10px] font-medium text-slate-500">Row Flag CX</div>
            <div className="font-mono text-base font-bold text-emerald-800 my-0.5">
              {currentCost.rowFlagCnots}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Σ 2f(w_j, t)
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-2.5 flex flex-col justify-between">
            <div className="text-[10px] font-medium text-slate-500">Col Flag CX</div>
            <div className="font-mono text-base font-bold text-rose-800 my-0.5">
              {currentCost.colFlagCnots}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Σ 2f(w_i+1, t)
            </div>
          </div>

          <div className="rounded-xl bg-emerald-50/90 border border-emerald-300 p-2.5 flex flex-col justify-between">
            <div className="text-[10px] font-semibold text-emerald-900">
              Eq. (8) CNOTs
            </div>
            <div className="flex items-baseline gap-1 my-0.5">
              <span className="font-mono text-lg font-bold text-emerald-950">
                {currentCost.totalCnots}
              </span>
              {cnotDiff < 0 && (
                <span className="inline-flex items-center text-[10px] font-mono font-bold text-emerald-700">
                  <TrendingDown className="w-3 h-3 mr-0.5" />
                  {cnotDiff} ({cnotPct}%)
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-emerald-800/80">
              Init: {initialCost.totalCnots} CX
            </div>
          </div>

          <div className="rounded-xl bg-white border border-slate-200 p-2.5 flex flex-col justify-between">
            <div className="text-[10px] font-semibold text-slate-700">
              Eq. (8) Flags
            </div>
            <div className="flex items-baseline gap-1 my-0.5">
              <span className="font-mono text-lg font-bold text-slate-900">
                {currentCost.totalFlags}
              </span>
              {flagDiff < 0 && (
                <span className="text-[10px] font-mono font-bold text-emerald-700">
                  ({flagDiff})
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Init: {initialCost.totalFlags} flags
            </div>
          </div>
        </div>
      </div>

      {isPerfect && (
        <div className="mt-2.5 rounded-lg bg-blue-50/90 border border-blue-200 px-3 py-2 text-[11px] text-blue-900 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              <strong>Perfect QECC (<code className="font-mono">is_perfect</code>):</strong>{' '}
              Col ({basis === 'X' ? 'Z' : 'X'}) spiders unfuse at <KaTeXMath tex={`t-1=${xT}`} /> instead of{' '}
              <KaTeXMath tex={`t=${t}`} />
            </span>
          </span>
          <span className="font-mono font-bold text-blue-950 shrink-0">
            Actual Circuit: {perfectTotalCnots} CNOTs, {perfectTotalFlags} Flags
          </span>
        </div>
      )}
    </div>
  );
};
