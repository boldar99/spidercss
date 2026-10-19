import React, { useMemo, useState } from 'react';
import type {
  BasisType,
  BinaryMatrix,
  RrefTrialSnapshot,
} from '../../engine/types';
import type { RrefWalkthroughStage } from '../../stores/compilerStore';
import { detailedCostBreakdown, findPivotsInMatrix } from '../../engine/optimizeParityMatrix';
import { Math as KaTeXMath } from '../common/Math';

interface MatrixStepViewerProps {
  activeInputMatrix: BinaryMatrix;
  rrefSnapshot: RrefTrialSnapshot;
  stage: RrefWalkthroughStage;
  t: number;
  basis: BasisType;
  onCustomPermutation?: (perm: number[]) => void;
}

export const MatrixStepViewer: React.FC<MatrixStepViewerProps> = ({
  activeInputMatrix,
  rrefSnapshot,
  stage,
  t,
  basis,
  onCustomPermutation,
}) => {
  const [selectedSwapCol, setSelectedSwapCol] = useState<number | null>(null);

  const {
    permutation,
    permutedMatrix,
    rrefPermutedMatrix,
    rowOpSteps,
    unpermutedMatrix,
  } = rrefSnapshot;

  // Determine the displayed matrix, column qubit labels, and highlighted pivots based on stage
  const displayData = useMemo(() => {
    const cols = activeInputMatrix[0]?.length ?? 0;
    const identityCols = Array.from({ length: cols }, (_, i) => i);

    if (stage === 1) {
      const { pivots } = findPivotsInMatrix(activeInputMatrix);
      const cost = detailedCostBreakdown(activeInputMatrix, t);
      return {
        matrix: activeInputMatrix,
        colLabels: identityCols,
        pivots,
        cost,
        stageLabel: 'Input Parity Matrix M (with Permutation π)',
      };
    }

    if (stage === 2) {
      const { pivots } = findPivotsInMatrix(permutedMatrix);
      const cost = detailedCostBreakdown(permutedMatrix, t);
      return {
        matrix: permutedMatrix,
        colLabels: permutation,
        pivots,
        cost,
        stageLabel: 'Column-Permuted Matrix M[:, π]',
      };
    }

    if (stage === 3) {
      const { pivots } = findPivotsInMatrix(rrefPermutedMatrix);
      const cost = detailedCostBreakdown(rrefPermutedMatrix, t);
      return {
        matrix: rrefPermutedMatrix,
        colLabels: permutation,
        pivots,
        cost,
        stageLabel: `Gaussian Elimination RREF(M[:, π]) (${rowOpSteps.length} row XORs applied)`,
      };
    }

    // Stage 4: Un-permuted RREF matrix M'
    return {
      matrix: unpermutedMatrix,
      colLabels: identityCols,
      pivots: rrefSnapshot.pivots,
      cost: rrefSnapshot.cost,
      stageLabel: "Un-Permuted RREF Basis M' = RREF(M[:, π])[:, π⁻¹]",
    };
  }, [
    activeInputMatrix,
    permutedMatrix,
    permutation,
    rrefPermutedMatrix,
    rowOpSteps.length,
    unpermutedMatrix,
    rrefSnapshot,
    stage,
    t,
  ]);

  const { matrix, colLabels, pivots, cost, stageLabel } = displayData;

  const pivotColToRow = useMemo(() => {
    const map = new Map<number, number>();
    for (const [rStr, cIdx] of Object.entries(pivots)) {
      map.set(cIdx, Number(rStr));
    }
    return map;
  }, [pivots]);

  const handleColHeaderClick = (colPos: number) => {
    if (!onCustomPermutation) return;
    if (selectedSwapCol === null) {
      setSelectedSwapCol(colPos);
    } else if (selectedSwapCol === colPos) {
      setSelectedSwapCol(null);
    } else {
      const nextPerm = [...permutation];
      const tmp = nextPerm[selectedSwapCol];
      nextPerm[selectedSwapCol] = nextPerm[colPos];
      nextPerm[colPos] = tmp;
      setSelectedSwapCol(null);
      onCustomPermutation(nextPerm);
    }
  };

  const rows = matrix.length;
  const cols = matrix[0]?.length ?? 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold bg-slate-900 text-white">
            Stage {stage}/4
          </span>
          <span className="text-xs font-semibold text-slate-800">
            {stageLabel}
          </span>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-mono">
          <span className="inline-flex items-center gap-1.5 text-emerald-800 bg-emerald-100/80 border border-emerald-300 px-2 py-0.5 rounded-md font-semibold">
            <span className="w-2 h-2 rounded-xs bg-emerald-600"></span>
            Pivot Cols ({pivotColToRow.size}/{rows})
          </span>
          <span className="text-slate-500">
            Active: <strong className="text-slate-800">{basis === 'Z' ? 'H_X' : 'H_Z'}</strong>
          </span>
        </div>
      </div>

      {/* Permutation banner in Stage 1 & 2 */}
      <div className="mb-3 rounded-lg bg-white border border-slate-200/90 px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-slate-500 font-sans font-medium">
            Column Permutation <KaTeXMath tex="\pi" />:
          </span>
          <span className="text-slate-400">[</span>
          {permutation.slice(0, 48).map((qIdx, pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => handleColHeaderClick(pos)}
              className={`px-1.5 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
                selectedSwapCol === pos
                  ? 'bg-amber-500 text-white font-bold'
                  : qIdx !== pos
                  ? 'bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold hover:bg-indigo-100'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
              title="Click two positions in π to swap their columns"
            >
              q<sub>{qIdx}</sub>
            </button>
          ))}
          {permutation.length > 48 && (
            <span className="text-slate-400">… ({permutation.length} cols)</span>
          )}
          <span className="text-slate-400">]</span>
        </div>
        <span className="text-[11px] font-sans text-slate-400">
          {selectedSwapCol !== null
            ? `Click another column to swap with position ${selectedSwapCol}`
            : 'Click any two π entries to swap columns'}
        </span>
      </div>

      {/* Matrix Table with Pivot Highlights, Row Weights w_j, and Column Weights w_i */}
      <div className="overflow-x-auto custom-scrollbar pb-1">
        <table className="border-collapse font-mono text-xs w-full">
          <thead>
            <tr className="border-b border-slate-200/80 text-[10px] text-slate-500">
              <th className="py-1.5 pr-2 text-left font-normal">Row</th>
              {colLabels.map((qIdx, cIdx) => {
                const isPivotCol = pivotColToRow.has(cIdx);
                return (
                  <th
                    key={cIdx}
                    className={`px-1 py-1.5 text-center font-semibold min-w-[24px] rounded-t ${
                      isPivotCol
                        ? 'bg-emerald-100/70 text-emerald-900'
                        : 'text-slate-500'
                    }`}
                  >
                    <div>
                      q<sub>{qIdx}</sub>
                    </div>
                    {stage === 2 || stage === 3 ? (
                      <div className="text-[9px] text-slate-400 font-normal">
                        π[{cIdx}]
                      </div>
                    ) : null}
                  </th>
                );
              })}
              <th className="pl-2.5 py-1.5 text-right font-semibold text-slate-600 whitespace-nowrap">
                <KaTeXMath tex="w_j" />
              </th>
              <th className="pl-2 py-1.5 text-right font-semibold text-emerald-800 whitespace-nowrap">
                <KaTeXMath tex="f(w_j,t)" />
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {matrix.map((row, rIdx) => {
              const wRow = cost.rowWeights[rIdx] ?? 0;
              const fRow = cost.rowFlagsPerSpider[rIdx] ?? 0;
              const pivotColForThisRow = pivots[rIdx];

              return (
                <tr
                  key={rIdx}
                  className="transition-colors hover:bg-white/80"
                >
                  <td className="py-1 pr-2 text-[11px] whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <span
                        className={`font-semibold ${
                          basis === 'Z' ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        {basis === 'Z' ? 'Z' : 'X'}
                        <sub>{rIdx}</sub>
                      </span>
                      {pivotColForThisRow !== undefined && (
                        <span className="text-[10px] text-emerald-600">
                          (q<sub>{colLabels[pivotColForThisRow]}</sub>)
                        </span>
                      )}
                    </div>
                  </td>

                  {row.map((bit, cIdx) => {
                    const isPivotCol = pivotColToRow.has(cIdx);
                    const isUniquePivotOne =
                      pivots[rIdx] === cIdx && bit === 1;

                    return (
                      <td
                        key={cIdx}
                        className={`p-0.5 text-center ${
                          isPivotCol ? 'bg-emerald-50/60' : ''
                        }`}
                      >
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded text-xs font-semibold transition-all ${
                            isUniquePivotOne
                              ? 'bg-emerald-600 text-white shadow-2xs ring-2 ring-emerald-300 font-bold'
                              : bit === 1
                              ? 'bg-purple-100 text-purple-900 border border-purple-300 font-bold'
                              : 'text-slate-300'
                          }`}
                          title={
                            isUniquePivotOne
                              ? `Unique-one pivot at row ${rIdx}, column q_${colLabels[cIdx]}`
                              : bit === 1
                              ? `Non-pivot internal connection (row ${rIdx}, col q_${colLabels[cIdx]})`
                              : '0'
                          }
                        >
                          {bit}
                        </span>
                      </td>
                    );
                  })}

                  <td className="pl-2.5 py-1 text-right font-semibold text-slate-700">
                    {wRow}
                  </td>
                  <td className="pl-2 py-1 text-right font-semibold text-emerald-700">
                    {fRow > 0 ? `+${fRow}` : '0'}
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* Column Weights w_i and Column Flags f(w_i + 1, t) Footer */}
          <tfoot>
            <tr className="border-t-2 border-slate-200 text-[11px] bg-white/70">
              <td className="py-1.5 pr-2 font-semibold text-slate-600 whitespace-nowrap">
                Col <KaTeXMath tex="w_i" />
              </td>
              {Array.from({ length: cols }, (_, cIdx) => {
                const wCol = cost.colWeights[cIdx] ?? 0;
                const isPivotCol = pivotColToRow.has(cIdx);
                return (
                  <td
                    key={cIdx}
                    className={`py-1.5 px-1 text-center font-semibold ${
                      isPivotCol
                        ? 'text-emerald-700 bg-emerald-50/60'
                        : 'text-rose-800'
                    }`}
                  >
                    {wCol}
                  </td>
                );
              })}
              <td className="pl-2.5 py-1.5 text-right text-slate-400">—</td>
              <td className="pl-2 py-1.5 text-right text-slate-400">—</td>
            </tr>
            <tr className="border-t border-slate-100 text-[10px] bg-white/70">
              <td className="py-1 pr-2 font-semibold text-rose-800 whitespace-nowrap">
                <KaTeXMath tex="f(w_i{+}1,t)" />
              </td>
              {Array.from({ length: cols }, (_, cIdx) => {
                const fCol = cost.colFlagsPerSpider[cIdx] ?? 0;
                const isPivotCol = pivotColToRow.has(cIdx);
                return (
                  <td
                    key={cIdx}
                    className={`py-1 px-1 text-center font-semibold ${
                      isPivotCol
                        ? 'text-slate-300 bg-emerald-50/40'
                        : fCol > 0
                        ? 'text-rose-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {isPivotCol ? '·' : fCol > 0 ? `+${fCol}` : '0'}
                  </td>
                );
              })}
              <td
                colSpan={2}
                className="pl-2 py-1 text-right font-semibold text-slate-700 whitespace-nowrap"
              >
                Flags: {cost.totalFlags}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Legend under matrix */}
      <div className="mt-3 pt-2.5 border-t border-slate-200/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-600 inline-block"></span>
            Unique-1 Pivot (Boundary wire to row spider)
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-purple-100 border border-purple-300 inline-block"></span>
            Non-Pivot 1 (Idealized bipartite edge)
          </span>
        </div>
      </div>
    </div>
  );
};
