import React, { useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Sparkles,
  ShieldAlert,
  Split,
  Network,
  ArrowRight,
  CheckCircle2,
  Info,
} from 'lucide-react';
import {
  $compilerStore,
  setAnalyzeHookErrors,
  setPostPhase2Branch,
  setRewriteStage,
} from '../../stores/compilerStore';
import {
  characterizeStabilizerSplits,
  computeXSpiderSplits,
  getConjM,
} from '../../engine/hookErrors';
import {
  getUndirectedEdges,
  hasUndirectedEdge,
  wellOrderedCompositeCatStateData,
  wellOrderedFtCatStateData,
} from '../../engine/catState';
import { minimumNumberOfFlags } from '../../engine/optimizeParityMatrix';
import { Math as KaTeXMath } from '../common/Math';

export const ZxRewritesView: React.FC = () => {
  const state = useStore($compilerStore);
  const {
    basis,
    d,
    validation,
    rrefSnapshot,
    rewriteStage,
    analyzeHookErrors,
  } = state;

  const matrix = rrefSnapshot.unpermutedMatrix;
  const { pivots, nonPivots, cost } = rrefSnapshot;
  const t = validation.t;

  const [selectedFaultEdgeIdx, setSelectedFaultEdgeIdx] = useState<number>(0);
  const [selectedFaultType, setSelectedFaultType] = useState<'X' | 'Z'>('X');
  const [selectedCatSpider, setSelectedCatSpider] = useState<{
    side: 'row' | 'col';
    index: number;
  }>({ side: 'row', index: 0 });

  const xT = validation.isPerfect ? Math.max(0, t - 1) : t;

  // Compute safe hook-error splits (both compiler-active and theoretical characterization)
  const hookAnalysis = useMemo(() => {
    const activeSplits = computeXSpiderSplits(matrix, d, analyzeHookErrors);
    const M_prep = getConjM(matrix);
    const theoreticalMap = characterizeStabilizerSplits(M_prep);

    const colDetails = nonPivots.map((colQubit, npIdx) => {
      const supp: number[] = [];
      for (let c = 0; c < (M_prep[npIdx]?.length ?? 0); c++) {
        if (M_prep[npIdx][c] === 1) supp.push(c);
      }
      const suppKey = supp.join(',');
      const charRes = theoreticalMap.get(suppKey);
      const unsplitDeg = supp.length;
      const unsplitFlagsAtT =
        unsplitDeg > 1 ? minimumNumberOfFlags(unsplitDeg, t) : 0;
      const unsplitFlags =
        unsplitDeg > 1 ? minimumNumberOfFlags(unsplitDeg, xT) : 0;

      const activeChunks = activeSplits.xSplits[npIdx] ?? [supp];
      const activeSizes = activeSplits.xSpiders[npIdx] ?? [unsplitDeg];

      // Theoretical best shape
      const theoShape =
        charRes?.universal?.[0] ?? charRes?.partial?.[0] ?? [unsplitDeg];

      const splitFlags =
        !validation.isPerfect && theoShape.length > 1
          ? theoShape.reduce((acc, sz, k) => {
              const effDeg =
                k === 0 || k === theoShape.length - 1 ? sz + 1 : sz + 2;
              return acc + minimumNumberOfFlags(effDeg, xT);
            }, 0)
          : unsplitFlags;

      return {
        npIdx,
        colQubit,
        support: supp,
        unsplitDeg,
        unsplitFlagsAtT,
        unsplitFlags,
        activeChunks,
        activeSizes,
        theoShape,
        splitFlags,
        hasSafeSplit: theoShape.length > 1,
        isUniversal: (charRes?.universal?.length ?? 0) > 0,
      };
    });

    const totalUnsplitColFlags = colDetails.reduce(
      (a, b) => a + b.unsplitFlagsAtT,
      0
    );
    const totalSplitColFlags = colDetails.reduce(
      (a, b) => a + b.splitFlags,
      0
    );

    return {
      activeSplits,
      colDetails,
      totalUnsplitColFlags,
      totalSplitColFlags,
      flagsSaved: Math.max(0, totalUnsplitColFlags - totalSplitColFlags),
    };
  }, [matrix, d, analyzeHookErrors, nonPivots, t, xT, validation.isPerfect]);

  // Build list of internal bipartite edges for Stage 1 fault propagation demo
  const bipartiteEdges = useMemo(() => {
    const list: Array<{
      rIdx: number;
      npIdx: number;
      pivotQubit: number;
      colQubit: number;
    }> = [];
    for (let rIdx = 0; rIdx < matrix.length; rIdx++) {
      for (let npIdx = 0; npIdx < nonPivots.length; npIdx++) {
        const colQubit = nonPivots[npIdx];
        if (matrix[rIdx]?.[colQubit] === 1) {
          list.push({
            rIdx,
            npIdx,
            pivotQubit: pivots[rIdx],
            colQubit,
          });
        }
      }
    }
    return list;
  }, [matrix, nonPivots, pivots]);

  const activeFaultEdge =
    bipartiteEdges[
      Math.min(selectedFaultEdgeIdx, Math.max(0, bipartiteEdges.length - 1))
    ] ?? null;

  // Stage 3: Precomputed Well-Ordered Cat State for the currently inspected spider
  const inspectedCatState = useMemo(() => {
    const isRow = selectedCatSpider.side === 'row';
    if (isRow) {
      const rIdx = Math.min(
        selectedCatSpider.index,
        Math.max(0, matrix.length - 1)
      );
      const deg = cost.rowWeights[rIdx] ?? 1;
      const cat = wellOrderedFtCatStateData(deg, t, true);
      return {
        label: `${basis === 'Z' ? 'Z' : 'X'}_${rIdx} (Row Spider, Pivot q_${
          pivots[rIdx]
        }, t=${t})`,
        spiderBasis: basis,
        deg,
        chunks: [deg],
        effectiveT: t,
        cat,
      };
    } else {
      const npIdx = Math.min(
        selectedCatSpider.index,
        Math.max(0, nonPivots.length - 1)
      );
      const detail = hookAnalysis.colDetails[npIdx];
      const deg = detail?.unsplitDeg ?? 2;
      const chunks =
        !validation.isPerfect && analyzeHookErrors && detail?.theoShape.length > 1
          ? detail.theoShape
          : [deg];
      const cat =
        chunks.length > 1
          ? wellOrderedCompositeCatStateData(chunks, xT)
          : wellOrderedFtCatStateData(deg, xT, true);
      const colBasis = basis === 'Z' ? 'X' : 'Z';
      return {
        label: `${colBasis}_${npIdx} (Non-Pivot Col q_${nonPivots[npIdx]}, t_X=${xT}${
          validation.isPerfect ? ' [Perfect QECC t−1]' : ''
        })`,
        spiderBasis: colBasis,
        deg,
        chunks,
        effectiveT: xT,
        cat,
      };
    }
  }, [
    selectedCatSpider,
    matrix.length,
    cost.rowWeights,
    t,
    xT,
    validation.isPerfect,
    basis,
    pivots,
    nonPivots,
    hookAnalysis.colDetails,
    analyzeHookErrors,
  ]);

  const rowFill = basis === 'Z' ? '#86efac' : '#fca5a5';
  const rowStroke = basis === 'Z' ? '#15803d' : '#b91c1c';
  const rowSym = basis === 'Z' ? 'Z' : 'X';

  const colFill = basis === 'Z' ? '#fca5a5' : '#86efac';
  const colStroke = basis === 'Z' ? '#b91c1c' : '#15803d';
  const colSym = basis === 'Z' ? 'X' : 'Z';

  return (
    <div className="rounded-2xl border-2 border-purple-200 bg-white p-5 sm:p-6 shadow-2xs">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-purple-100 text-purple-900 border border-purple-300">
              Section III.A Theory Branch
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              Fault-Equivalent ZX-Calculus Rewrites (Figure 4 of Paper)
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Step through the three fault-equivalent transformations that convert the idealized bipartite ZX-diagram into an extractable 3-ary spider network without sacrificing code distance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setPostPhase2Branch('pipeline')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-2xs cursor-pointer self-start lg:self-auto"
        >
          Switch to [Show Pipeline] (Phase 3) <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3-Stage Stepper Bar */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => setRewriteStage(1)}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            rewriteStage === 1
              ? 'bg-purple-950 text-white border-purple-950 shadow-xs'
              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider opacity-80">
              Step 1.2
            </span>
            <ShieldAlert className="w-4 h-4 opacity-80" />
          </div>
          <div className="text-sm font-bold mt-1">
            1. Unidealize Internal Edges
          </div>
          <p
            className={`text-[11px] mt-0.5 ${
              rewriteStage === 1 ? 'text-purple-200' : 'text-slate-500'
            }`}
          >
            Propositions III.3 &amp; III.4: Purple idealized → Black noisy edges
          </p>
        </button>

        <button
          type="button"
          onClick={() => setRewriteStage(2)}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            rewriteStage === 2
              ? 'bg-purple-950 text-white border-purple-950 shadow-xs'
              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider opacity-80">
              Step 1.3.1
            </span>
            <Split className="w-4 h-4 opacity-80" />
          </div>
          <div className="text-sm font-bold mt-1">
            2. Safe Hook-Error Splits
          </div>
          <p
            className={`text-[11px] mt-0.5 ${
              rewriteStage === 2 ? 'text-purple-200' : 'text-slate-500'
            }`}
          >
            Unfuse high-degree spiders along stabilizer-equivalent hook errors
          </p>
        </button>

        <button
          type="button"
          onClick={() => setRewriteStage(3)}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            rewriteStage === 3
              ? 'bg-purple-950 text-white border-purple-950 shadow-xs'
              : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase tracking-wider opacity-80">
              Step 1.3.2
            </span>
            <Network className="w-4 h-4 opacity-80" />
          </div>
          <div className="text-sm font-bold mt-1">
            3. Well-Ordered Cat Unfusion
          </div>
          <p
            className={`text-[11px] mt-0.5 ${
              rewriteStage === 3 ? 'text-purple-200' : 'text-slate-500'
            }`}
          >
            Expand high-arity spiders into 3-ary SpiderCat graphs (G, F, D)
          </p>
        </button>
      </div>

      {/* Stage 1 Content: Unidealizing Internal Bipartite Edges */}
      {rewriteStage === 1 && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 space-y-3.5">
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-purple-950">
                Proposition III.4 (Fault-Equivalent Edge Unidealization)
              </h4>
              <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">
                Because our RREF basis guarantees that every row spider{' '}
                <KaTeXMath tex={`${rowSym}_j`} /> has its own unique-one pivot boundary leg{' '}
                <KaTeXMath tex="q_{p_j}" /> and every non-pivot column spider{' '}
                <KaTeXMath tex={`${colSym}_i`} /> has its own boundary leg{' '}
                <KaTeXMath tex="q_i" />, both endpoints of every internal edge have at least one noisy boundary leg.
              </p>
              <div className="mt-3 rounded-lg bg-white border border-purple-200/80 p-3 text-xs text-slate-800">
                <div className="font-semibold text-purple-900 mb-1">
                  Why is unidealization fault-equivalent under CSS noise?
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-600 list-disc pl-4">
                  <li>
                    A single internal <strong>Z-fault</strong> (<KaTeXMath tex="Z(\pi)" />) is absorbed by the{' '}
                    <KaTeXMath tex="Z" />-spider and pushed through the{' '}
                    <KaTeXMath tex="X" />-spider onto its single boundary wire — a weight-1 boundary fault!
                  </li>
                  <li>
                    A single internal <strong>X-fault</strong> (<KaTeXMath tex="X(\pi)" />) is absorbed by the{' '}
                    <KaTeXMath tex="X" />-spider and pushed through the{' '}
                    <KaTeXMath tex="Z" />-spider onto its single pivot boundary wire — also weight 1!
                  </li>
                </ul>
              </div>
            </div>

            {/* Interactive Fault Propagation Inspector */}
            {activeFaultEdge && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold text-slate-800 mb-2">
                  Interactive Internal Fault Propagation Tester
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-xs text-slate-600">Fault Type:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedFaultType('X')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer border ${
                      selectedFaultType === 'X'
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    X(π) Fault
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedFaultType('Z')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer border ${
                      selectedFaultType === 'Z'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    Z(π) Fault
                  </button>
                </div>

                <div className="text-xs text-slate-700 bg-white rounded-lg border border-slate-200 p-3 font-mono">
                  <div>
                    Selected Edge: ({rowSym}
                    <sub>{activeFaultEdge.rIdx}</sub> ↔ {colSym}
                    <sub>{activeFaultEdge.npIdx}</sub>)
                  </div>
                  <div className="mt-1.5 text-emerald-800 font-semibold">
                    {(basis === 'Z' && selectedFaultType === 'X') ||
                    (basis === 'X' && selectedFaultType === 'Z')
                      ? `→ Commutes through ${colSym}_${activeFaultEdge.npIdx} and exits on single pivot boundary leg q_${activeFaultEdge.pivotQubit} (weight 1)!`
                      : `→ Commutes through ${rowSym}_${activeFaultEdge.rIdx} and exits on single non-pivot boundary leg q_${activeFaultEdge.colQubit} (weight 1)!`}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-700">
                Unidealized Bipartite ZX-Diagram (Click any internal edge to test fault propagation)
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-900 text-white">
                All {bipartiteEdges.length} edges unidealized (noisy)
              </span>
            </div>

            {(() => {
              const numR = matrix.length;
              const numC = nonPivots.length;
              const totalQ = numR + numC;
              const stepY =
                totalQ > 24 ? 19 : totalQ > 14 ? 25 : totalQ > 9 ? 31 : 36;
              const topP = 32;
              const gapY = stepY * 0.55;
              const svgH = Math.max(
                280,
                topP +
                  32 +
                  Math.max(0, numR - 1) * stepY +
                  gapY +
                  Math.max(0, numC) * stepY
              );
              const rightOutX = 478;

              const getRPos = (rIdx: number) => ({
                x: 90 + (numR <= 1 ? 0.5 : rIdx / (numR - 1)) * 95,
                y: topP + rIdx * stepY,
              });
              const colBaseY = topP + Math.max(1, numR) * stepY + gapY;
              const getCPos = (npIdx: number) => ({
                x: 260 + (numC <= 1 ? 0.5 : npIdx / (numC - 1)) * 105,
                y: colBaseY + npIdx * stepY,
              });

              return (
                <svg
                  viewBox={`0 0 540 ${svgH}`}
                  className="w-full h-auto bg-white rounded-lg border border-slate-200/80 select-none"
                >
                  {/* Output Boundary Wires (All exiting to the right as a ZX state) */}
                  {Array.from({ length: numR }, (_, rIdx) => {
                    const p = getRPos(rIdx);
                    const exitsPivot =
                      activeFaultEdge?.rIdx === rIdx &&
                      ((basis === 'Z' && selectedFaultType === 'X') ||
                        (basis === 'X' && selectedFaultType === 'Z'));
                    return (
                      <g key={`rw-${rIdx}`}>
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={rightOutX}
                          y2={p.y}
                          stroke={exitsPivot ? '#dc2626' : '#1e293b'}
                          strokeWidth={exitsPivot ? 3.4 : 1.8}
                        />
                        <text
                          x={rightOutX + 8}
                          y={p.y + 4}
                          textAnchor="start"
                          className="font-mono text-[10.5px] font-semibold fill-slate-700"
                        >
                          q_{pivots[rIdx]}
                        </text>
                        {exitsPivot && (
                          <circle
                            cx={rightOutX - 38}
                            cy={p.y}
                            r={8}
                            fill={
                              selectedFaultType === 'X' ? '#fca5a5' : '#86efac'
                            }
                            stroke="#dc2626"
                            strokeWidth={2}
                          />
                        )}
                      </g>
                    );
                  })}

                  {nonPivots.map((colQ, npIdx) => {
                    const p = getCPos(npIdx);
                    const exitsCol =
                      activeFaultEdge?.npIdx === npIdx &&
                      ((basis === 'Z' && selectedFaultType === 'Z') ||
                        (basis === 'X' && selectedFaultType === 'X'));
                    return (
                      <g key={`cw-${colQ}`}>
                        <line
                          x1={p.x}
                          y1={p.y}
                          x2={rightOutX}
                          y2={p.y}
                          stroke={exitsCol ? '#dc2626' : '#1e293b'}
                          strokeWidth={exitsCol ? 3.4 : 1.8}
                        />
                        <text
                          x={rightOutX + 8}
                          y={p.y + 4}
                          textAnchor="start"
                          className="font-mono text-[10.5px] font-semibold fill-slate-700"
                        >
                          q_{colQ}
                        </text>
                        {exitsCol && (
                          <circle
                            cx={rightOutX - 38}
                            cy={p.y}
                            r={8}
                            fill={
                              selectedFaultType === 'X' ? '#fca5a5' : '#86efac'
                            }
                            stroke="#dc2626"
                            strokeWidth={2}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Internal Bipartite Edges Between Diagonal 1 and Diagonal 2 */}
                  {bipartiteEdges.map((e, idx) => {
                    const p1 = getRPos(e.rIdx);
                    const p2 = getCPos(e.npIdx);
                    const isSelected =
                      activeFaultEdge &&
                      activeFaultEdge.rIdx === e.rIdx &&
                      activeFaultEdge.npIdx === e.npIdx;
                    const mx = (p1.x + p2.x) / 2;
                    const my = (p1.y + p2.y) / 2;

                    return (
                      <g
                        key={idx}
                        onClick={() => setSelectedFaultEdgeIdx(idx)}
                        className="cursor-pointer"
                      >
                        <line
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke={isSelected ? '#d97706' : '#1e293b'}
                          strokeWidth={isSelected ? 3.5 : 2}
                          strokeOpacity={isSelected ? 1 : 0.65}
                        />
                        {isSelected && (
                          <g>
                            <circle
                              cx={mx}
                              cy={my}
                              r={10}
                              fill={
                                selectedFaultType === 'X'
                                  ? '#fca5a5'
                                  : '#86efac'
                              }
                              stroke={
                                selectedFaultType === 'X'
                                  ? '#b91c1c'
                                  : '#15803d'
                              }
                              strokeWidth={2}
                            />
                            <text
                              x={mx}
                              y={my + 3.5}
                              textAnchor="middle"
                              className="font-mono text-[9px] font-bold fill-slate-900"
                            >
                              π
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Diagonal 1: Row Spiders */}
                  {Array.from({ length: numR }, (_, rIdx) => {
                    const p = getRPos(rIdx);
                    return (
                      <g key={`r-${rIdx}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={12.5}
                          fill={rowFill}
                          stroke={rowStroke}
                          strokeWidth={2}
                        />
                        <text
                          x={p.x}
                          y={p.y + 4}
                          textAnchor="middle"
                          className="font-mono text-[10px] font-bold fill-slate-900"
                        >
                          {rowSym}
                          {rIdx}
                        </text>
                      </g>
                    );
                  })}

                  {/* Diagonal 2: Non-Pivot Spiders */}
                  {nonPivots.map((colQ, npIdx) => {
                    const p = getCPos(npIdx);
                    return (
                      <g key={`c-${colQ}`}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={12.5}
                          fill={colFill}
                          stroke={colStroke}
                          strokeWidth={2}
                        />
                        <text
                          x={p.x}
                          y={p.y + 4}
                          textAnchor="middle"
                          className="font-mono text-[10px] font-bold fill-slate-900"
                        >
                          {colSym}
                          {npIdx}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              );
            })()}
          </div>
        </div>
      )}

      {/* Stage 2 Content: Safe Hook-Error Splits */}
      {rewriteStage === 2 && (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">
                  Safe Hook-Error Spider Splitting (Section III.A.3 &amp; Appendix A)
                </h4>
                {validation.isPerfect && (
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 font-semibold">
                    Perfect QECC: {colSym}-spiders unfuse at t−1 = {xT}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1">
                When a single fault on an internal split edge propagates to a multi-qubit boundary error that is equivalent (up to the state&apos;s stabilizer group) to a weight-≤1 error, we can safely split a high-degree spider into a chain of smaller spiders — saving{' '}
                <strong className="text-emerald-800">
                  {hookAnalysis.flagsSaved} flag qubit{hookAnalysis.flagsSaved === 1 ? '' : 's'}
                </strong>{' '}
                ({hookAnalysis.flagsSaved * 2} CNOTs).
              </p>
              {validation.isPerfect && (
                <p className="text-xs text-blue-800 bg-blue-50/90 border border-blue-200 rounded-lg px-3 py-1.5 mt-2">
                  <strong>Perfect QECC Optimization (<code className="font-mono">is_perfect = true</code>):</strong>{' '}
                  Only Hamming codes (e.g., Steane <code className="font-mono">[[7,1,3]]</code>, <code className="font-mono">[[15,7,3]]</code>) and the Golay code (<code className="font-mono">[[23,1,7]]</code>) are perfect QECCs. Because they saturate the sphere-packing bound, non-pivot (<KaTeXMath tex={colSym} />) spiders can be fault-equivalently unfused at distance <KaTeXMath tex={`t - 1 = ${xT}`} /> instead of <KaTeXMath tex={`t = ${t}`} />!
                </p>
              )}
            </div>

            {/* Interactive Toggle for Safe Hook-Error Splits */}
            <label className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white border border-purple-300 shadow-2xs cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={analyzeHookErrors}
                onChange={(e) => setAnalyzeHookErrors(e.target.checked)}
                className="w-4 h-4 accent-purple-700 rounded cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-900">
                Enable Safe Hook-Error Splits
              </span>
            </label>
          </div>

          <div className="overflow-x-auto custom-scrollbar rounded-xl border border-slate-200">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-3">Spider</th>
                  <th className="py-2.5 px-3">Data Qubit</th>
                  <th className="py-2.5 px-3">Dual Stabilizer Support</th>
                  <th className="py-2.5 px-3">Unsplit Degree (Flags)</th>
                  <th className="py-2.5 px-3">Safe Split Shape</th>
                  <th className="py-2.5 px-3">Classification</th>
                  <th className="py-2.5 px-3 text-right">Flags After Split</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {hookAnalysis.colDetails.map((item) => (
                  <tr key={item.colQubit} className="hover:bg-slate-50/80">
                    <td className="py-2 px-3 font-bold text-slate-900">
                      {colSym}
                      <sub>{item.npIdx}</sub>
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      q<sub>{item.colQubit}</sub>
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {'{'}
                      {item.support.map((q) => `q_${q}`).join(', ')}
                      {'}'}
                    </td>
                    <td className="py-2 px-3">
                      deg {item.unsplitDeg}{' '}
                      <span className="text-slate-400">
                        ({item.unsplitFlags} flag{item.unsplitFlags === 1 ? '' : 's'})
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      {item.hasSafeSplit ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-bold">
                          {item.unsplitDeg} → [{item.theoShape.join(' + ')}]
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          [{item.unsplitDeg}] (Unsplit)
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-sans">
                      {item.hasSafeSplit ? (
                        item.isUniversal ? (
                          <span className="text-emerald-700 font-semibold">
                            Universal Safe Split (any partition)
                          </span>
                        ) : (
                          <span className="text-amber-700 font-semibold">
                            Specific Coset Safe Split
                          </span>
                        )
                      ) : item.unsplitDeg < 4 ? (
                        <span className="text-slate-400">
                          Degree ≤ 3 (Already 3-ary)
                        </span>
                      ) : (
                        <span className="text-slate-400">
                          No weight-1 equivalent split
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-800">
                      {item.splitFlags} flag{item.splitFlags === 1 ? '' : 's'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Stage 3 Content: Well-Ordered Cat State Unfusion */}
      {rewriteStage === 3 && (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-5 space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 mb-2">
                Select Spider to Inspect Unfused Well-Ordered Cat State
              </h4>
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-500">
                  Row Spiders ({rowSym}-type):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: matrix.length }, (_, rIdx) => {
                    const deg = cost.rowWeights[rIdx] ?? 1;
                    const isSel =
                      selectedCatSpider.side === 'row' &&
                      selectedCatSpider.index === rIdx;
                    return (
                      <button
                        key={`r-${rIdx}`}
                        type="button"
                        onClick={() =>
                          setSelectedCatSpider({ side: 'row', index: rIdx })
                        }
                        className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border transition-all cursor-pointer ${
                          isSel
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {rowSym}
                        <sub>{rIdx}</sub> (deg={deg})
                      </button>
                    );
                  })}
                </div>

                <div className="text-[11px] font-semibold text-slate-500 pt-2">
                  Non-Pivot Column Spiders ({colSym}-type):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {nonPivots.map((colQ, npIdx) => {
                    const deg = (cost.colWeights[colQ] ?? 0) + 1;
                    const isSel =
                      selectedCatSpider.side === 'col' &&
                      selectedCatSpider.index === npIdx;
                    return (
                      <button
                        key={`c-${colQ}`}
                        type="button"
                        onClick={() =>
                          setSelectedCatSpider({ side: 'col', index: npIdx })
                        }
                        className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold border transition-all cursor-pointer ${
                          isSel
                            ? 'bg-rose-700 text-white border-rose-700'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {colSym}
                        <sub>{npIdx}</sub> (deg={deg})
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-slate-700 space-y-2">
              <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-emerald-700" />
                Why Well-Ordered Cat States? (Definition III.6)
              </div>
              <p className="leading-relaxed">
                By unfusing each degree-<KaTeXMath tex="w" /> spider into a precomputed{' '}
                <strong>Well-Ordered Cat State</strong>{' '}
                <KaTeXMath tex="\text{Cat}_w^t = (G, F, D)" />, every non-primary leg satisfies either the{' '}
                <strong>Direct CNOT Condition</strong> (Lemma III.7) or the{' '}
                <strong>Flag-Delegation Condition</strong> (Lemma III.8), allowing every bipartite connection to be extracted as a single CNOT gate without Bell measurements!
              </p>
              <button
                type="button"
                onClick={() => setPostPhase2Branch('pipeline')}
                className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white font-semibold hover:bg-emerald-800 transition-colors cursor-pointer"
              >
                Proceed to Algorithm 1 Pipeline (Phase 3) <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Panel: Visualization of the selected Well-Ordered Cat State (G, F, roots, mainNode) */}
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Expanded 3-Ary SpiderCat Subgraph: {inspectedCatState.label}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                  Nodes: {inspectedCatState.cat.G.nodes.size} • Spanning Tree F edges:{' '}
                  {getUndirectedEdges(inspectedCatState.cat.F).length} • Flag closure edges:{' '}
                  {getUndirectedEdges(inspectedCatState.cat.G).length -
                    getUndirectedEdges(inspectedCatState.cat.F).length}{' '}
                  • Root r₀ = {inspectedCatState.cat.roots[0]} • Primary Exit ={' '}
                  {inspectedCatState.cat.edge}
                </p>
              </div>
            </div>

            {(() => {
              const { cat, spiderBasis } = inspectedCatState;
              const nodes = Array.from(cat.G.nodes.values());
              const edges = getUndirectedEdges(cat.G);
              const rootId = cat.roots[0];
              const exitId = cat.edge;

              const sFill = spiderBasis === 'Z' ? '#86efac' : '#fca5a5';
              const sStroke = spiderBasis === 'Z' ? '#15803d' : '#b91c1c';

              // Place nodes on a clean circular / layered layout around center
              const cx = 260;
              const cy = 145;
              const radius = nodes.length <= 4 ? 70 : 95;
              const posMap = new Map<number, { x: number; y: number }>();
              nodes.forEach((n, idx) => {
                const angle =
                  -Math.PI / 2 + (2 * Math.PI * idx) / Math.max(1, nodes.length);
                posMap.set(n.id, {
                  x: cx + radius * Math.cos(angle),
                  y: cy + radius * Math.sin(angle),
                });
              });

              return (
                <svg
                  viewBox="0 0 520 290"
                  className="w-full h-auto bg-slate-50/70 rounded-lg border border-slate-100 select-none"
                >
                  {/* Edges of G: bold black for spanning tree F, orange/amber for non-tree flag edges */}
                  {edges.map((e, idx) => {
                    const p1 = posMap.get(e.source);
                    const p2 = posMap.get(e.target);
                    if (!p1 || !p2) return null;
                    const inForest = hasUndirectedEdge(
                      cat.F,
                      e.source,
                      e.target
                    );
                    return (
                      <line
                        key={idx}
                        x1={p1.x}
                        y1={p1.y}
                        x2={p2.x}
                        y2={p2.y}
                        stroke={inForest ? '#0f172a' : '#ea580c'}
                        strokeWidth={inForest ? 3.2 : 2.2}
                        strokeDasharray={inForest ? undefined : '5,4'}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map((n) => {
                    const p = posMap.get(n.id)!;
                    const isRoot = n.id === rootId;
                    const isExit = n.id === exitId;
                    return (
                      <g key={n.id}>
                        {/* Root blue square outline matching paper TikZ root_highlight */}
                        {isRoot && (
                          <rect
                            x={p.x - 19}
                            y={p.y - 19}
                            width={38}
                            height={38}
                            rx={6}
                            fill="none"
                            stroke="#2563eb"
                            strokeWidth={2.2}
                          />
                        )}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={14}
                          fill={sFill}
                          stroke={sStroke}
                          strokeWidth={2}
                        />
                        <text
                          x={p.x}
                          y={p.y + 4}
                          textAnchor="middle"
                          className="font-mono text-[11px] font-bold fill-slate-900"
                        >
                          {n.id}
                        </text>
                        {n.is_mark && (
                          <text
                            x={p.x}
                            y={p.y - 21}
                            textAnchor="middle"
                            className="font-mono text-[9.5px] font-semibold fill-slate-600"
                          >
                            {isExit ? '★ Primary Leg' : 'Port Leg'}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              );
            })()}

            <div className="mt-2.5 flex flex-wrap items-center gap-4 text-[11px] text-slate-600 font-mono">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-1 bg-slate-900 inline-block"></span>
                Spanning Forest F
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-4 h-0.5 border-t-2 border-dashed border-orange-600 inline-block"></span>
                Non-Tree Flag Edge
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-xs border-2 border-blue-600 inline-block"></span>
                Root Spider r₀
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
