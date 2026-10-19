import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Grid, Terminal, Plus, Minus, Copy, Check } from 'lucide-react';
import type { BasisType, BinaryMatrix, CSSValidationResult } from '../../engine/types';
import { matricesToPauliStrings, parsePauliStrings } from '../../engine/cssState';
import { cloneMatrix } from '../../engine/gf2';
import { Math as KaTeXMath, LogicalKet } from '../common/Math';

interface StabilizerEditorProps {
  H_x: BinaryMatrix;
  H_z: BinaryMatrix;
  basis: BasisType;
  validation: CSSValidationResult;
  onUpdateMatrices: (H_x: BinaryMatrix, H_z: BinaryMatrix) => void;
}

export const StabilizerEditor: React.FC<StabilizerEditorProps> = ({
  H_x,
  H_z,
  basis,
  validation,
  onUpdateMatrices,
}) => {
  const [editorTab, setEditorTab] = useState<'matrix' | 'pauli'>('matrix');
  const [pauliText, setPauliText] = useState<string>('');
  const [pauliError, setPauliError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const generatedPauli = useMemo(
    () => matricesToPauliStrings(H_x, H_z),
    [H_x, H_z]
  );

  // Sync textarea when matrices change externally
  useEffect(() => {
    setPauliText(generatedPauli.combinedText);
    setPauliError(null);
  }, [generatedPauli.combinedText]);

  const anticommutingXRows = useMemo(() => {
    const s = new Set<number>();
    for (const [rx] of validation.anticommutingPairs) s.add(rx);
    return s;
  }, [validation.anticommutingPairs]);

  const anticommutingZRows = useMemo(() => {
    const s = new Set<number>();
    for (const [, rz] of validation.anticommutingPairs) s.add(rz);
    return s;
  }, [validation.anticommutingPairs]);

  const n = H_x[0]?.length ?? 0;

  const handleToggleCell = (
    which: 'X' | 'Z',
    rowIdx: number,
    colIdx: number
  ) => {
    if (which === 'X') {
      const nextHx = cloneMatrix(H_x);
      nextHx[rowIdx][colIdx] = nextHx[rowIdx][colIdx] === 1 ? 0 : 1;
      onUpdateMatrices(nextHx, H_z);
    } else {
      const nextHz = cloneMatrix(H_z);
      nextHz[rowIdx][colIdx] = nextHz[rowIdx][colIdx] === 1 ? 0 : 1;
      onUpdateMatrices(H_x, nextHz);
    }
  };

  const handleAddRow = (which: 'X' | 'Z') => {
    const cols = Math.max(1, n);
    const newRow = new Array<number>(cols).fill(0);
    if (which === 'X') {
      onUpdateMatrices([...cloneMatrix(H_x), newRow], H_z);
    } else {
      onUpdateMatrices(H_x, [...cloneMatrix(H_z), newRow]);
    }
  };

  const handleRemoveRow = (which: 'X' | 'Z') => {
    if (which === 'X' && H_x.length > 1) {
      onUpdateMatrices(H_x.slice(0, -1), H_z);
    } else if (which === 'Z' && H_z.length > 1) {
      onUpdateMatrices(H_x, H_z.slice(0, -1));
    }
  };

  const handleAddColumn = () => {
    if (n >= 144) return;
    const nextHx = H_x.map((row) => [...row, 0]);
    const nextHz = H_z.map((row) => [...row, 0]);
    onUpdateMatrices(nextHx, nextHz);
  };

  const handleRemoveColumn = () => {
    if (n <= 2) return;
    const nextHx = H_x.map((row) => row.slice(0, -1));
    const nextHz = H_z.map((row) => row.slice(0, -1));
    onUpdateMatrices(nextHx, nextHz);
  };

  const handlePauliTextChange = (value: string) => {
    setPauliText(value);
    const parsed = parsePauliStrings(value);
    if (parsed.error) {
      setPauliError(parsed.error);
    } else if (parsed.H_x.length === 0 || parsed.H_z.length === 0) {
      setPauliError('Include at least one X-type and one Z-type stabilizer generator.');
    } else {
      setPauliError(null);
      onUpdateMatrices(parsed.H_x, parsed.H_z);
    }
  };

  const handleCopyPauli = () => {
    navigator.clipboard.writeText(generatedPauli.combinedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const isLargeMatrix = n > 28;

  const renderBinaryGrid = (
    matrix: BinaryMatrix,
    which: 'X' | 'Z',
    isActiveBasisMatrix: boolean,
    anticommutingRows: Set<number>
  ) => {
    const rows = matrix.length;
    const cols = matrix[0]?.length ?? 0;

    return (
      <div
        className={`rounded-xl border p-4 transition-colors ${
          isActiveBasisMatrix
            ? 'border-emerald-300 bg-emerald-50/25 shadow-2xs'
            : 'border-slate-200 bg-slate-50/50'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-mono font-bold ${
                which === 'X'
                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}
            >
              <KaTeXMath tex={which === 'X' ? 'H_X' : 'H_Z'} />
            </span>
            <span className="text-xs font-medium text-slate-700">
              {which === 'X' ? 'X-Stabilizer Parity Matrix' : 'Z-Stabilizer Parity Matrix'}
            </span>
            <span className="text-xs font-mono text-slate-400">
              ({rows} × {cols})
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isActiveBasisMatrix && (
              <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                Active M for <LogicalKet basis={basis} k={validation.k} />
              </span>
            )}
            <button
              type="button"
              onClick={() => handleAddRow(which)}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title={`Add row to H_${which}`}
            >
              <Plus className="w-3 h-3" /> Row
            </button>
            <button
              type="button"
              onClick={() => handleRemoveRow(which)}
              disabled={rows <= 1}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
              title={`Remove last row from H_${which}`}
            >
              <Minus className="w-3 h-3" /> Row
            </button>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar pb-1">
          <table className="border-collapse font-mono text-xs select-none">
            <thead>
              <tr>
                <th className="pr-2 py-1 text-left text-[10px] text-slate-400 font-normal">
                  gen
                </th>
                {Array.from({ length: cols }, (_, cIdx) => (
                  <th
                    key={cIdx}
                    className="px-0.5 py-1 text-center text-[10px] text-slate-400 font-normal min-w-[22px]"
                  >
                    q<sub>{cIdx}</sub>
                  </th>
                ))}
                <th className="pl-2 py-1 text-right text-[10px] text-slate-400 font-normal">
                  wt
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, rIdx) => {
                const isAnticomm = anticommutingRows.has(rIdx);
                const rowWeight = row.reduce((acc, v) => acc + v, 0);
                return (
                  <tr
                    key={rIdx}
                    className={
                      isAnticomm
                        ? 'bg-rose-100/70'
                        : 'hover:bg-white/60 transition-colors'
                    }
                  >
                    <td className="pr-2 py-0.5 text-[11px] text-slate-500 whitespace-nowrap">
                      <span
                        className={
                          isAnticomm ? 'text-rose-700 font-bold' : undefined
                        }
                      >
                        S<sub>{which},{rIdx}</sub>
                      </span>
                    </td>
                    {row.map((bit, cIdx) => (
                      <td key={cIdx} className="p-0.5">
                        <button
                          type="button"
                          onClick={() => handleToggleCell(which, rIdx, cIdx)}
                          className={`w-6 h-6 rounded text-xs font-mono font-semibold flex items-center justify-center transition-all cursor-pointer ${
                            bit === 1
                              ? which === 'X'
                                ? 'bg-rose-600 text-white shadow-2xs hover:bg-rose-700'
                                : 'bg-emerald-700 text-white shadow-2xs hover:bg-emerald-800'
                              : 'bg-white border border-slate-200/90 text-slate-300 hover:border-slate-300 hover:text-slate-500'
                          }`}
                          title={`Toggle H_${which}[${rIdx}, ${cIdx}] (currently ${bit})`}
                        >
                          {bit}
                        </button>
                      </td>
                    ))}
                    <td className="pl-2 py-0.5 text-right text-[11px] font-semibold text-slate-600">
                      {rowWeight}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="mt-5">
      {/* Sub-navigation bar between Binary Matrices and Pauli Strings */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="inline-flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
          <button
            type="button"
            onClick={() => setEditorTab('matrix')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              editorTab === 'matrix'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Grid className="w-3.5 h-3.5 text-emerald-700" />
            Binary Matrices (<KaTeXMath tex="H_X, H_Z" />)
          </button>
          <button
            type="button"
            onClick={() => setEditorTab('pauli')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              editorTab === 'pauli'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-700" />
            Pauli Stabilizer Strings (I, X, Z)
          </button>
        </div>

        {editorTab === 'matrix' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">
              Click any cell to toggle <code className="font-mono bg-slate-100 px-1 rounded">0/1</code>
            </span>
            <button
              type="button"
              onClick={handleAddColumn}
              disabled={n >= 144}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Qubit (n={n})
            </button>
            <button
              type="button"
              onClick={handleRemoveColumn}
              disabled={n <= 2}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <Minus className="w-3 h-3" /> Qubit
            </button>
          </div>
        )}
      </div>

      {/* Commutativity / Validation Banner */}
      {!validation.valid || validation.anticommutingPairs.length > 0 ? (
        <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50/90 p-3.5 flex items-start gap-3 text-xs text-rose-900">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              CSS Commutativity Check Failed (<KaTeXMath tex="H_X H_Z^T \neq 0 \pmod 2" />)
            </div>
            <ul className="mt-1 space-y-0.5 text-rose-800">
              {validation.errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
            {validation.anticommutingPairs.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {validation.anticommutingPairs.slice(0, 8).map(([rx, rz], idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center px-2 py-0.5 rounded bg-rose-200/80 text-rose-900 font-mono text-[11px] font-semibold"
                  >
                    ⟨S_X,{rx} , S_Z,{rz}⟩ = 1 (anti-commutes)
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {editorTab === 'matrix' ? (
        <div
          className={`grid grid-cols-1 ${
            isLargeMatrix ? '' : 'lg:grid-cols-2'
          } gap-4`}
        >
          {renderBinaryGrid(
            H_x,
            'X',
            basis === 'Z',
            anticommutingXRows
          )}
          {renderBinaryGrid(
            H_z,
            'Z',
            basis === 'X',
            anticommutingZRows
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-700">
                Stabilizer Generators (one Pauli string per line, pure X or pure Z)
              </label>
              <button
                type="button"
                onClick={handleCopyPauli}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
            <textarea
              value={pauliText}
              onChange={(e) => handlePauliTextChange(e.target.value)}
              rows={Math.min(14, Math.max(6, H_x.length + H_z.length + 1))}
              spellCheck={false}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed text-slate-900 focus:border-emerald-600 focus:outline-none custom-scrollbar"
              placeholder={'IIIXXXX\nIXXIIXX\nXIXIXIX\nIIIZZII\n...'}
            />
            {pauliError && (
              <div className="mt-2 text-xs text-rose-600 font-medium flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{pauliError}</span>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-800 mb-2">
                Parsed CSS Stabilizer Tableau ({H_x.length} X-gens, {H_z.length} Z-gens)
              </div>
              <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                {generatedPauli.xStrings.map((s, idx) => (
                  <div
                    key={`x-${idx}`}
                    className={`flex items-center justify-between px-2.5 py-1 rounded-md font-mono text-xs border ${
                      anticommutingXRows.has(idx)
                        ? 'bg-rose-50 border-rose-300 text-rose-900'
                        : 'bg-rose-50/40 border-rose-200/70 text-rose-900'
                    }`}
                  >
                    <span className="text-[10px] text-rose-600 font-semibold mr-2">
                      S<sub>X,{idx}</sub>
                    </span>
                    <span className="tracking-widest truncate">
                      {Array.from(s).map((ch, cIdx) => (
                        <span
                          key={cIdx}
                          className={
                            ch === 'X'
                              ? 'font-bold text-rose-700'
                              : 'text-slate-300'
                          }
                        >
                          {ch}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
                {generatedPauli.zStrings.map((s, idx) => (
                  <div
                    key={`z-${idx}`}
                    className={`flex items-center justify-between px-2.5 py-1 rounded-md font-mono text-xs border ${
                      anticommutingZRows.has(idx)
                        ? 'bg-rose-50 border-rose-300 text-rose-900'
                        : 'bg-emerald-50/40 border-emerald-200/70 text-emerald-900'
                    }`}
                  >
                    <span className="text-[10px] text-emerald-700 font-semibold mr-2">
                      S<sub>Z,{idx}</sub>
                    </span>
                    <span className="tracking-widest truncate">
                      {Array.from(s).map((ch, cIdx) => (
                        <span
                          key={cIdx}
                          className={
                            ch === 'Z'
                              ? 'font-bold text-emerald-700'
                              : 'text-slate-300'
                          }
                        >
                          {ch}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Preparing{' '}
                <strong className="text-slate-800">
                  <LogicalKet basis={basis} k={validation.k} />
                </strong>{' '}
                optimizes{' '}
                <strong className="text-slate-800">
                  <KaTeXMath tex={basis === 'Z' ? 'H_X' : 'H_Z'} />
                </strong>
              </span>
              <span className="font-mono">
                t = ⌊(d−1)/2⌋ = {validation.t}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
