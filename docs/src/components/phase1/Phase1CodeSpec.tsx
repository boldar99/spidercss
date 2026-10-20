import React, { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { CheckCircle2, AlertCircle, Sparkles, ShieldCheck } from 'lucide-react';
import {
  $compilerStore,
  QECC_PRESETS,
  selectPreset,
  setCodeDistance,
  setTargetBasis,
  updateCustomMatrices,
} from '../../stores/compilerStore';
import type { QeccPreset } from '../../engine/types';
import { StabilizerEditor } from './StabilizerEditor';
import { Math as KaTeXMath, LogicalKet } from '../common/Math';

const QUICK_PICKS: Array<{ id: string; label: string; tag: string }> = [
  { id: 'FAO/7_1_3', label: 'Steane [[7, 1, 3]]', tag: 'Default' },
  { id: 'FAO/9_1_3', label: 'Rot. Surface [[9, 1, 3]]', tag: 'Surface' },
  { id: 'MQT/12_2_4', label: '[[12, 2, 4]] Carbon', tag: 'k=2' },
  { id: 'MQT/15_1_3', label: '[[15, 1, 3]] Reed-Muller', tag: '3D' },
  { id: 'MQT/15_7_3', label: '[[15, 7, 3]] Hamming', tag: 'High Rate' },
  { id: 'FAO/17_1_5', label: 'Color Code [[17, 1, 5]]', tag: 'd=5' },
  { id: 'FAO/20_2_6', label: 'Self-Dual [[20, 2, 6]]', tag: 'd=6' },
  { id: 'FAO/23_1_7', label: 'Golay [[23, 1, 7]]', tag: 'd=7' },
];

function formatPresetOptionLabel(p: QeccPreset): string {
  const codeBracket = `[[${p.n}, ${p.k}, ${p.d}]]`;
  const cleanName = (p.full_name || p.abbr_name || p.codeId)
    .replace(/\\@/g, '')
    .trim();
  if (!cleanName || cleanName === codeBracket) {
    return `${codeBracket} (${p.codeId})`;
  }
  return `${codeBracket} — ${cleanName}`;
}

export const Phase1CodeSpec: React.FC = () => {
  const state = useStore($compilerStore);
  const { selectedPresetId, basis, d, H_x, H_z, validation, mode } = state;

  const groupedPresets = useMemo(() => {
    const groups: Record<'FAO' | 'MQT' | 'misc', QeccPreset[]> = {
      FAO: [],
      MQT: [],
      misc: [],
    };
    for (const p of QECC_PRESETS) {
      groups[p.category]?.push(p);
    }
    return groups;
  }, []);

  const activePreset = useMemo(
    () => QECC_PRESETS.find((p) => p.id === selectedPresetId),
    [selectedPresetId]
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs">
      {/* Phase 1 Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Phase 1
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              CSS Code &amp; Target Logical State Specification
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Select from {QECC_PRESETS.length} benchmarked CSS codes or define custom{' '}
            <KaTeXMath tex="H_X, H_Z" /> parity-check matrices / Pauli strings, target basis (
            <LogicalKet basis="Z" k={validation.k} /> or{' '}
            <LogicalKet basis="X" k={validation.k} />
            ), and distance <KaTeXMath tex="d" />.
          </p>
        </div>

        {/* Live [[n, k, d]] Validation Badge */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-mono ${
              validation.valid
                ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                : 'bg-rose-50 border-rose-300 text-rose-900'
            }`}
          >
            {validation.valid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <div>
              <div className="font-bold text-sm">
                [[{validation.n}, {validation.k}, {validation.d}]]
                {activePreset?.full_name ? (
                  <span className="ml-1.5 font-sans font-medium text-xs text-slate-600">
                    {activePreset.full_name.replace(/\\@/g, '')}
                  </span>
                ) : selectedPresetId === 'custom' ? (
                  <span className="ml-1.5 font-sans font-medium text-xs text-amber-700">
                    Custom Code
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-slate-600 flex items-center gap-2 mt-0.5">
                <span>
                  rank(H<sub>X</sub>)={validation.rankHx}
                </span>
                <span>•</span>
                <span>
                  rank(H<sub>Z</sub>)={validation.rankHz}
                </span>
                <span>•</span>
                <span className="font-semibold text-emerald-800">
                  t={validation.t} faults
                </span>
              </div>
            </div>
          </div>

          {validation.isPerfect && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs font-medium"
              title="Perfect QECC (Hamming / Golay code): saturates the sphere-packing bound, enabling non-pivot spiders to be unfused at fault-tolerance distance t − 1."
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
              Perfect QECC (X-spiders at t−1 = {Math.max(0, validation.t - 1)})
            </span>
          )}
        </div>
      </div>

      {/* Main Controls Row: Preset Dropdown, Logical Basis Toggle, Distance Input */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
        {/* Preset Selector Dropdown */}
        <div className="md:col-span-6">
          <label
            htmlFor="qecc-preset-select"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            QECC Code Preset ({QECC_PRESETS.length} Preloaded Codes)
          </label>
          <select
            id="qecc-preset-select"
            value={selectedPresetId}
            onChange={(e) => {
              if (e.target.value !== 'custom') {
                selectPreset(e.target.value);
              }
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-900 shadow-2xs focus:border-emerald-600 focus:outline-none"
          >
            {selectedPresetId === 'custom' && (
              <option value="custom">
                Custom User-Edited Code [[{validation.n}, {validation.k},{' '}
                {validation.d}]]
              </option>
            )}
            <optgroup label="Flag at Origin (FAO) Benchmark Suite">
              {groupedPresets.FAO.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPresetOptionLabel(p)}
                </option>
              ))}
            </optgroup>
            <optgroup label="MQT Bench QECC Suite">
              {groupedPresets.MQT.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPresetOptionLabel(p)}
                </option>
              ))}
            </optgroup>
            <optgroup label="QLDPC, High-Rate & Additional Codes (misc)">
              {groupedPresets.misc.map((p) => (
                <option key={p.id} value={p.id}>
                  {formatPresetOptionLabel(p)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Target State |0̄⟩ vs |+̄⟩ Toggle */}
        <div className="md:col-span-3">
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Target Logical State
          </label>
          <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setTargetBasis('Z')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                basis === 'Z'
                  ? 'bg-white text-emerald-900 shadow-2xs border border-emerald-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <LogicalKet basis="Z" k={validation.k} />
              <span className="text-[10px] font-mono text-slate-400">(Z)</span>
            </button>
            <button
              type="button"
              onClick={() => setTargetBasis('X')}
              className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                basis === 'X'
                  ? 'bg-white text-rose-900 shadow-2xs border border-rose-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-rose-500"></span>
              <LogicalKet basis="X" k={validation.k} />
              <span className="text-[10px] font-mono text-slate-400">(X)</span>
            </button>
          </div>
        </div>

        {/* Code Distance d & Fault Tolerance t */}
        <div className="md:col-span-3">
          <label
            htmlFor="code-distance-input"
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            Distance <KaTeXMath tex="d" /> &amp; Faults{' '}
            <KaTeXMath tex="t = \lfloor d / 2 \rfloor" />
          </label>
          <div className="flex items-center gap-2">
            <input
              id="code-distance-input"
              type="number"
              min={1}
              max={15}
              value={d}
              onChange={(e) => setCodeDistance(Number(e.target.value))}
              className="w-20 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-mono font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
            />
            <div className="flex-1 rounded-xl bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-mono text-slate-700 flex items-center justify-between">
              <span>FT Level:</span>
              <strong className="text-emerald-700">t = {validation.t}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Quick-Select Pills for Featured Codes (Walkthrough Mode Only) */}
      {mode !== 'gui' && (
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 mr-1">
            <Sparkles className="w-3 h-3 text-emerald-600" />
            Quick Presets:
          </span>
          {QUICK_PICKS.map((item) => {
            const isSelected = selectedPresetId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => selectPreset(item.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-emerald-700 text-white border-emerald-700 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span>{item.label}</span>
                <span
                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${
                    isSelected
                      ? 'bg-emerald-800 text-emerald-100'
                      : 'bg-white text-slate-500 border border-slate-200/80'
                  }`}
                >
                  {item.tag}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Dual-Mode Stabilizer Matrix / Pauli String Editor */}
      <StabilizerEditor
        H_x={H_x}
        H_z={H_z}
        basis={basis}
        validation={validation}
        onUpdateMatrices={(nextHx, nextHz) =>
          updateCustomMatrices(nextHx, nextHz, true)
        }
      />
    </div>
  );
};
