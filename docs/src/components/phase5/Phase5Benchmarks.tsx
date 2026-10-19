import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  Award,
  Check,
  Code2,
  Copy,
  Filter,
  Table2,
} from 'lucide-react';
import simulationSummaryRaw from '../../generated/simulationSummary.json';
import {
  $compilerStore,
  QECC_PRESETS,
  selectPreset,
  setRoutingHeuristic,
  setTargetBasis,
} from '../../stores/compilerStore';
import type {
  RoutingHeuristicType,
  SimulationCodeSummary,
  SimulationRunSummary,
  SimulationSummaryPayload,
} from '../../engine/types';
import { LerComparisonPlot } from './LerComparisonPlot';
import { LogicalKet } from '../common/Math';

const SIMULATION_SUMMARY =
  simulationSummaryRaw as unknown as SimulationSummaryPayload;

const HEURISTIC_LABELS: Record<string, string> = {
  FaO: 'Flag at Origin (FaO)',
  active_spider_first: 'SpiderCSS (Active Spider)',
  critical_path_first: 'SpiderCSS (Crit. Path)',
  earliest_start_first: 'SpiderCSS (Earliest Start)',
  joint_resource: 'SpiderCSS (Seq. Dist. / Joint)',
  sa_sequence_distance: 'SpiderCSS (Seq. Dist. SA)',
};

const VALID_ROUTING_HEURISTICS = new Set<RoutingHeuristicType>([
  'critical_path_first',
  'earliest_start_first',
  'active_spider_first',
  'sa_sequence_distance',
  'joint_resource',
]);

function formatHeuristicName(h: string | null | undefined): string {
  if (!h) return '—';
  return HEURISTIC_LABELS[h] ?? h;
}

function formatHeuristicShort(h: string | null | undefined): string {
  if (!h) return '—';
  switch (h) {
    case 'FaO':
      return 'Flag at Origin';
    case 'active_spider_first':
      return 'Active Spider';
    case 'critical_path_first':
      return 'Crit. Path';
    case 'earliest_start_first':
      return 'Earliest Start';
    case 'joint_resource':
      return 'Seq. Dist. (Joint)';
    case 'sa_sequence_distance':
      return 'Seq. Dist. (SA)';
    default:
      return h;
  }
}

function cleanLabel(label: string): string {
  return (label || '').replace(/\\@/g, '').trim();
}

function formatStateLabel(basis: 'Z' | 'X', k: number): React.ReactNode {
  return <LogicalKet basis={basis} k={k} />;
}

function formatLerInterval(
  run: SimulationRunSummary | null | undefined,
  sharedExp?: number
): string {
  if (
    !run ||
    run.logical_error_rate === null ||
    run.ler_ci_low === null ||
    run.ler_ci_high === null
  ) {
    return '—';
  }
  const exp =
    sharedExp ??
    (run.logical_error_rate > 0
      ? Math.floor(Math.log10(run.logical_error_rate))
      : 0);
  const scale = Math.pow(10, exp);
  const low = (run.ler_ci_low / scale).toFixed(1);
  const high = (run.ler_ci_high / scale).toFixed(1);
  return `[${low}, ${high}] × 10^${exp}`;
}

function formatArInterval(
  run: SimulationRunSummary | null | undefined
): string {
  if (
    !run ||
    run.acceptance_rate === null ||
    run.ar_ci_low === null ||
    run.ar_ci_high === null
  ) {
    return '—';
  }
  const star = run.p === 0.0001 ? '*' : '';
  return `[${run.ar_ci_low.toFixed(4)}, ${run.ar_ci_high.toFixed(4)}]${star}`;
}

function pctReduction(
  baseline: number | null | undefined,
  candidate: number | null | undefined
): number | null {
  if (
    baseline === null ||
    baseline === undefined ||
    baseline <= 0 ||
    candidate === null ||
    candidate === undefined
  ) {
    return null;
  }
  return (100 * (baseline - candidate)) / baseline;
}

function pctGain(
  baseline: number | null | undefined,
  candidate: number | null | undefined
): number | null {
  if (
    baseline === null ||
    baseline === undefined ||
    baseline <= 0 ||
    candidate === null ||
    candidate === undefined
  ) {
    return null;
  }
  return (100 * (candidate - baseline)) / baseline;
}

/**
 * Deduplicate runs for a code so each heuristic appears once (preferring the canonical sample size / best LER),
 * while allowing optional toggle to view all raw runs.
 */
function getDeduplicatedRuns(
  codeEntry: SimulationCodeSummary
): SimulationRunSummary[] {
  const targetSamples = codeEntry.best_spidercss?.num_samples;
  const byHeuristic = new Map<string, SimulationRunSummary>();

  for (const r of codeEntry.runs) {
    const key = r.method === 'FaO' ? 'FaO' : r.heuristic;
    const prev = byHeuristic.get(key);
    if (!prev) {
      byHeuristic.set(key, r);
      continue;
    }
    // Prefer matching canonical sample count of best_spidercss, then lower LER
    const rMatchesSamples = targetSamples && r.num_samples === targetSamples;
    const prevMatchesSamples =
      targetSamples && prev.num_samples === targetSamples;
    if (rMatchesSamples && !prevMatchesSamples) {
      byHeuristic.set(key, r);
    } else if (
      rMatchesSamples === prevMatchesSamples &&
      r.logical_error_rate !== null &&
      (prev.logical_error_rate === null ||
        r.logical_error_rate < prev.logical_error_rate)
    ) {
      byHeuristic.set(key, r);
    }
  }

  const list = Array.from(byHeuristic.values());
  list.sort((a, b) => {
    if (a.method === 'FaO') return -1;
    if (b.method === 'FaO') return 1;
    if (a.logical_error_rate !== null && b.logical_error_rate !== null) {
      return a.logical_error_rate - b.logical_error_rate;
    }
    return a.heuristic.localeCompare(b.heuristic);
  });
  return list;
}

function loadBenchmarkCodeInStudio(
  codeEntry: SimulationCodeSummary,
  heuristic?: string,
  scrollToStudio = false
): void {
  const match =
    QECC_PRESETS.find((p) => p.id === `FAO/${codeEntry.code}`) ??
    QECC_PRESETS.find((p) => p.codeId === codeEntry.code);
  if (match) {
    selectPreset(match.id);
    setTargetBasis(codeEntry.target_basis);
    const hToUse = heuristic ?? codeEntry.best_spidercss?.heuristic;
    if (hToUse && VALID_ROUTING_HEURISTICS.has(hToUse as RoutingHeuristicType)) {
      setRoutingHeuristic(hToUse as RoutingHeuristicType);
    }
    if (scrollToStudio && typeof window !== 'undefined') {
      const el = document.getElementById('studio');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

/**
 * Contextual Phase 5 Card mounted inside StudioShell directly below Phase 4.
 */
export const Phase5ContextualCard: React.FC = () => {
  const state = useStore($compilerStore);
  const { selectedPresetId, routingHeuristic, validation } = state;

  const activeCodeId = useMemo(() => {
    if (selectedPresetId !== 'custom') {
      return selectedPresetId.split('/').pop() ?? '';
    }
    return `${validation.n}_${validation.k}_${validation.d}`;
  }, [selectedPresetId, validation.n, validation.k, validation.d]);

  const codeSummary = useMemo(
    () =>
      SIMULATION_SUMMARY.codes.find((c) => c.code === activeCodeId) ?? null,
    [activeCodeId]
  );

  const [showAllDuplicateRuns, setShowAllDuplicateRuns] = useState(false);
  const [fetchedStimRuns, setFetchedStimRuns] = useState<
    SimulationRunSummary[] | null
  >(null);
  const [selectedStimHash, setSelectedStimHash] = useState<string | null>(null);
  const [loadingStim, setLoadingStim] = useState(false);
  const [copiedStim, setCopiedStim] = useState(false);

  useEffect(() => {
    setFetchedStimRuns(null);
    setSelectedStimHash(null);
  }, [activeCodeId]);

  const handleFetchBenchmarkStim = async (circuitHash?: string | null) => {
    if (!codeSummary) return;
    if (fetchedStimRuns) {
      setSelectedStimHash(
        circuitHash ??
          codeSummary.best_spidercss?.circuit_hash ??
          fetchedStimRuns[0]?.circuit_hash ??
          null
      );
      return;
    }
    try {
      setLoadingStim(true);
      const baseUrl = import.meta.env.BASE_URL || '/';
      const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
      const res = await fetch(
        `${normalizedBase}data/simulation_results/by_code/${codeSummary.code}.json`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SimulationRunSummary[];
      setFetchedStimRuns(data);
      setSelectedStimHash(
        circuitHash ??
          codeSummary.best_spidercss?.circuit_hash ??
          data[0]?.circuit_hash ??
          null
      );
    } catch {
      setFetchedStimRuns([]);
    } finally {
      setLoadingStim(false);
    }
  };

  if (!codeSummary) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                Phase 5 • Monte Carlo Benchmark Data
              </span>
              <h3 className="text-base font-bold text-slate-900">
                No Precomputed Stim Monte Carlo Dataset for [[{validation.n},{' '}
                {validation.k}, {validation.d}]]
              </h3>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Phase 4 above synthesizes and exports the fault-tolerant circuit for your current code in real time. Select any of the{' '}
              <strong>{SIMULATION_SUMMARY.total_codes} benchmarked codes</strong>{' '}
              below to view precomputed 10⁸–10⁹ shot Stim Monte Carlo logical error rates and Flag at Origin comparisons:
            </p>
          </div>
          <a
            href="#benchmarks"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors self-start shrink-0"
          >
            Open Global Benchmark Explorer ↓
          </a>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {SIMULATION_SUMMARY.codes.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => loadBenchmarkCodeInStudio(c)}
              className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-900 border border-slate-200 hover:border-emerald-300 transition-colors cursor-pointer"
            >
              [[{c.n}, {c.k}, {c.d}]] {cleanLabel(c.label)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const fao = codeSummary.fao;
  const best = codeSummary.best_spidercss;
  const displayedRuns = showAllDuplicateRuns
    ? codeSummary.runs
    : getDeduplicatedRuns(codeSummary);

  const validLers = displayedRuns
    .map((r) => r.logical_error_rate)
    .filter((v): v is number => v !== null && v > 0);
  const sharedExp =
    validLers.length > 0
      ? Math.floor(Math.log10(Math.min(...validLers)))
      : undefined;
  const maxLerInCode =
    validLers.length > 0 ? Math.max(...validLers) : undefined;

  const lerImp = pctReduction(
    fao?.logical_error_rate,
    best?.logical_error_rate
  );
  const arImp = pctGain(fao?.acceptance_rate, best?.acceptance_rate);
  const cxImp = pctReduction(fao?.num_cx, best?.num_cx);
  const depthMinImp = pctReduction(fao?.depth_min, best?.depth_min);
  const qubitsMinImp = pctReduction(fao?.num_qubits_min, best?.num_qubits_min);

  const activeStimRun = fetchedStimRuns?.find(
    (r) =>
      r.circuit_hash === selectedStimHash ||
      (!selectedStimHash && r.method === best?.method)
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-5">
      {/* Phase 5 Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Phase 5 • Monte Carlo Benchmark Verification
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              [[{codeSummary.n}, {codeSummary.k}, {codeSummary.d}]]{' '}
              {cleanLabel(codeSummary.full_name || codeSummary.label)} —{' '}
              {formatStateLabel(codeSummary.target_basis, codeSummary.k)}{' '}
              Simulation Results
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Circuit-level depolarizing noise (
            <code className="font-mono">
              p = {best?.p ?? 0.001}
            </code>
            ,{' '}
            <code className="font-mono">
              {(best?.num_samples ?? 0).toExponential(1)}
            </code>{' '}
            Stim shots per heuristic) comparing{' '}
            <strong>SpiderCSS</strong> against{' '}
            <strong>Flag at Origin (FaO)</strong> with 95% Wilson confidence intervals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {best?.heuristic &&
            VALID_ROUTING_HEURISTICS.has(
              best.heuristic as RoutingHeuristicType
            ) && (
              <button
                type="button"
                onClick={() =>
                  setRoutingHeuristic(best.heuristic as RoutingHeuristicType)
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  routingHeuristic === best.heuristic
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-emerald-700 border-emerald-700 text-white hover:bg-emerald-800'
                }`}
              >
                <Award className="w-3.5 h-3.5" />
                {routingHeuristic === best.heuristic
                  ? `Active Heuristic: ${formatHeuristicShort(best.heuristic)}`
                  : `Use Best Heuristic (${formatHeuristicShort(
                      best.heuristic
                    )})`}
              </button>
            )}
          <a
            href="#benchmarks"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors"
          >
            All {SIMULATION_SUMMARY.total_codes} Codes ↓
          </a>
        </div>
      </div>

      {/* Headline Comparison Metrics vs Flag at Origin */}
      {fao && best ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              Logical Error Rate (LER)
            </div>
            <div className="text-sm font-bold font-mono text-emerald-800 mt-1">
              {formatLerInterval(best, sharedExp)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              FaO: {formatLerInterval(fao, sharedExp)}
              {lerImp !== null && (
                <span
                  className={`ml-1.5 font-semibold ${
                    lerImp >= 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  ({lerImp >= 0 ? `−${lerImp.toFixed(1)}%` : `+${Math.abs(lerImp).toFixed(1)}%`})
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              Acceptance Rate (AR)
            </div>
            <div className="text-sm font-bold font-mono text-slate-900 mt-1">
              {best.acceptance_rate !== null
                ? `${(best.acceptance_rate * 100).toFixed(2)}%`
                : '—'}
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              FaO:{' '}
              {fao.acceptance_rate !== null
                ? `${(fao.acceptance_rate * 100).toFixed(2)}%`
                : '—'}
              {arImp !== null && (
                <span
                  className={`ml-1.5 font-semibold ${
                    arImp >= 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  ({arImp >= 0 ? `+${arImp.toFixed(1)}%` : `${arImp.toFixed(1)}%`})
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              CNOTs / Flag Ancillas
            </div>
            <div className="text-sm font-bold font-mono text-slate-900 mt-1">
              {best.num_cx} CX • {best.num_flags} Flags
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              FaO: {fao.num_cx} CX • {fao.num_flags} Flags
              {cxImp !== null && cxImp > 0 && (
                <span className="ml-1.5 font-semibold text-emerald-700">
                  (−{cxImp.toFixed(1)}% CX)
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              Min Circuit Depth (Depth-Opt)
            </div>
            <div className="text-sm font-bold font-mono text-indigo-800 mt-1">
              Depth {best.depth_min} ({best.num_qubits_min} Q)
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              FaO: Depth {fao.depth_min} ({fao.num_qubits_min} Q)
              {depthMinImp !== null && (
                <span className="ml-1.5 font-semibold text-emerald-700">
                  (−{depthMinImp.toFixed(1)}% D)
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-200/90 p-3.5">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              Min Sim. Qubits (Qubits-Opt)
            </div>
            <div className="text-sm font-bold font-mono text-emerald-800 mt-1">
              {best.num_qubits_max} Qubits (D={best.depth_max})
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              FaO: {fao.num_qubits_max} Qubits (D={fao.depth_max})
              {qubitsMinImp !== null && (
                <span className="ml-1.5 font-semibold text-emerald-700">
                  (−{qubitsMinImp.toFixed(1)}% Q)
                </span>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Per-Heuristic Comparison Table for Active Code */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-mono uppercase tracking-wider text-slate-500 font-bold">
            Evaluated Heuristics vs. Flag at Origin for [[{codeSummary.n},{' '}
            {codeSummary.k}, {codeSummary.d}]]
          </h4>
          <div className="flex items-center gap-2">
            {codeSummary.runs.length > displayedRuns.length && (
              <button
                type="button"
                onClick={() => setShowAllDuplicateRuns((v) => !v)}
                className="text-[11px] font-mono text-slate-600 hover:text-slate-900 underline cursor-pointer"
              >
                {showAllDuplicateRuns
                  ? 'Show canonical runs only'
                  : `Show all ${codeSummary.runs.length} recorded runs`}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleFetchBenchmarkStim(best?.circuit_hash)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors cursor-pointer"
            >
              <Code2 className="w-3.5 h-3.5 text-emerald-700" />
              {loadingStim
                ? 'Loading .stim...'
                : fetchedStimRuns
                ? 'Hide/Switch Benchmark .stim'
                : 'Inspect Benchmark .stim Circuit'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-mono text-[11px]">
                <th className="py-2.5 px-3">Method / Heuristic</th>
                <th className="py-2.5 px-2.5 text-right">CNOTs</th>
                <th className="py-2.5 px-2.5 text-right">Flags</th>
                <th className="py-2.5 px-2.5 text-right">
                  Sim. Qubits Opt (Q / D)
                </th>
                <th className="py-2.5 px-2.5 text-right">
                  Depth Opt (Q / D)
                </th>
                <th className="py-2.5 px-3 text-right">
                  Logical Error Rate (95% CI)
                </th>
                <th className="py-2.5 px-3 text-right">
                  Acceptance Rate (95% CI)
                </th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {displayedRuns.map((run) => {
                const isFaO = run.method === 'FaO';
                const isBestSpider =
                  best &&
                  run.file === best.file;
                const isCurrentHeuristic =
                  !isFaO && run.heuristic === routingHeuristic;
                const lerBarPct =
                  run.logical_error_rate && maxLerInCode
                    ? Math.max(
                        6,
                        Math.min(
                          100,
                          (run.logical_error_rate / maxLerInCode) * 100
                        )
                      )
                    : 0;

                return (
                  <tr
                    key={run.file}
                    className={`${
                      isBestSpider
                        ? 'bg-emerald-50/50 hover:bg-emerald-50/80'
                        : isFaO
                        ? 'bg-slate-50/60 hover:bg-slate-100/60'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`font-semibold ${
                            isFaO ? 'text-teal-800' : 'text-slate-900'
                          }`}
                        >
                          {formatHeuristicName(
                            isFaO ? 'FaO' : run.heuristic
                          )}
                        </span>
                        {isBestSpider && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Best LER
                          </span>
                        )}
                        {isCurrentHeuristic && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-100 text-amber-900 border border-amber-300">
                            Active in Phase 3
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-semibold text-slate-900">
                      {run.num_cx ?? '—'}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-slate-700">
                      {run.num_flags ?? '—'}
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-slate-800">
                      <span className="font-semibold">
                        {run.num_qubits_max ?? '—'}
                      </span>{' '}
                      <span className="text-slate-400">/</span>{' '}
                      <span>{run.depth_max ?? '—'}</span>
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-slate-800">
                      <span>{run.num_qubits_min ?? '—'}</span>{' '}
                      <span className="text-slate-400">/</span>{' '}
                      <span className="font-semibold text-indigo-800">
                        {run.depth_min ?? '—'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={
                            isBestSpider
                              ? 'font-bold text-emerald-800'
                              : 'text-slate-800'
                          }
                        >
                          {formatLerInterval(run, sharedExp)}
                        </span>
                        {lerBarPct > 0 && (
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                isFaO
                                  ? 'bg-teal-500'
                                  : isBestSpider
                                  ? 'bg-emerald-600'
                                  : 'bg-orange-500'
                              }`}
                              style={{ width: `${lerBarPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-800">
                      {formatArInterval(run)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <div className="inline-flex items-center gap-1">
                        {!isFaO &&
                          VALID_ROUTING_HEURISTICS.has(
                            run.heuristic as RoutingHeuristicType
                          ) && (
                            <button
                              type="button"
                              onClick={() =>
                                setRoutingHeuristic(
                                  run.heuristic as RoutingHeuristicType
                                )
                              }
                              className="px-2 py-1 rounded-md text-[11px] font-semibold bg-white border border-slate-200 hover:border-emerald-400 text-slate-700 hover:text-emerald-800 cursor-pointer"
                            >
                              Use in Phase 3
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() =>
                            handleFetchBenchmarkStim(run.circuit_hash)
                          }
                          className="px-2 py-1 rounded-md text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          title="Inspect noiseless Stim circuit from paper benchmark"
                        >
                          .stim
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* On-Demand Benchmark Stim Circuit Drawer */}
      {fetchedStimRuns && (
        <div className="rounded-xl border border-slate-800 bg-slate-950 text-slate-100 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold text-emerald-400">
                Benchmarked Paper Circuit (perfect_stim)
              </span>
              <select
                aria-label="Select benchmark run circuit"
                value={activeStimRun?.circuit_hash ?? ''}
                onChange={(e) => setSelectedStimHash(e.target.value)}
                className="rounded-lg bg-slate-900 border border-slate-700 px-2.5 py-1 text-xs font-mono text-slate-200"
              >
                {fetchedStimRuns.map((r) => (
                  <option key={r.file} value={r.circuit_hash ?? ''}>
                    {r.method} — {r.num_cx} CX, {r.num_flags} Flags (hash:{' '}
                    {r.circuit_hash?.slice(0, 8)})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              {activeStimRun?.perfect_stim && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      activeStimRun.perfect_stim ?? ''
                    );
                    setCopiedStim(true);
                    setTimeout(() => setCopiedStim(false), 1800);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 cursor-pointer"
                >
                  {copiedStim ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy .stim
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setFetchedStimRuns(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
          <pre className="max-h-56 overflow-y-auto rounded-lg bg-slate-900/90 p-3 text-[11px] font-mono text-emerald-200/90 leading-relaxed custom-scrollbar">
            {activeStimRun?.perfect_stim ||
              'No perfect_stim string recorded for this run.'}
          </pre>
        </div>
      )}
    </div>
  );
};

type CodeFamilyFilter =
  | 'all'
  | 'surface'
  | 'color'
  | 'self_dual'
  | 'triorthogonal'
  | 'high_rate';

type TableSortField =
  | 'd'
  | 'n'
  | 'cx'
  | 'flags'
  | 'depth_min'
  | 'qubits_max'
  | 'ler'
  | 'ar';

/**
 * Global Benchmark Explorer mounted in #benchmarks of index.astro.
 * Reproduces Paper Figure 1, Figure 8, and Table I across all 18 benchmarked CSS codes.
 */
export const Phase5Benchmarks: React.FC = () => {
  const state = useStore($compilerStore);
  const studioCodeId = useMemo(() => {
    if (state.selectedPresetId !== 'custom') {
      return state.selectedPresetId.split('/').pop() ?? '7_1_3';
    }
    return `${state.validation.n}_${state.validation.k}_${state.validation.d}`;
  }, [
    state.selectedPresetId,
    state.validation.n,
    state.validation.k,
    state.validation.d,
  ]);

  const [selectedCodeId, setSelectedCodeId] = useState<string>('25_1_5');
  const [familyFilter, setFamilyFilter] = useState<CodeFamilyFilter>('all');
  const [sortField, setSortField] = useState<TableSortField>('d');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [reuseRowFilter, setReuseRowFilter] = useState<
    'both' | 'qubits' | 'depth'
  >('both');

  // Sync selectedCodeId when studio preset changes to a benchmarked code
  useEffect(() => {
    if (SIMULATION_SUMMARY.codes.some((c) => c.code === studioCodeId)) {
      setSelectedCodeId(studioCodeId);
    }
  }, [studioCodeId]);

  const filteredAndSortedCodes = useMemo(() => {
    const matchesFamily = (c: SimulationCodeSummary): boolean => {
      const lbl = (c.label + ' ' + c.full_name).toLowerCase();
      switch (familyFilter) {
        case 'surface':
          return lbl.includes('surface');
        case 'color':
          return lbl.includes('color') || lbl.includes('colour');
        case 'self_dual':
          return (
            lbl.includes('steane') ||
            lbl.includes('golay') ||
            lbl.includes('self-dual')
          );
        case 'triorthogonal':
          return lbl.includes('triorthogonal');
        case 'high_rate':
          return (
            lbl.includes('gross') ||
            lbl.includes('2bga') ||
            c.k >= 2
          );
        default:
          return true;
      }
    };

    const list = SIMULATION_SUMMARY.codes.filter(matchesFamily);
    list.sort((a, b) => {
      const getVal = (c: SimulationCodeSummary): number => {
        const best = c.best_spidercss;
        switch (sortField) {
          case 'd':
            return c.d * 1000 + c.n;
          case 'n':
            return c.n * 100 + c.d;
          case 'cx':
            return best?.num_cx ?? 999999;
          case 'flags':
            return best?.num_flags ?? 999999;
          case 'depth_min':
            return best?.depth_min ?? 999999;
          case 'qubits_max':
            return best?.num_qubits_max ?? 999999;
          case 'ler':
            return best?.logical_error_rate ?? 999999;
          case 'ar':
            return best?.acceptance_rate ?? -1;
        }
      };
      const diff = getVal(a) - getVal(b);
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [familyFilter, sortField, sortAsc]);

  const handleSortClick = (field: TableSortField) => {
    if (sortField === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortField(field);
      setSortAsc(field !== 'ar');
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-2xs space-y-7">
      {/* Global Explorer Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <span className="text-xs font-mono uppercase tracking-wider text-emerald-700 font-semibold">
            Section V • Global Benchmark Explorer (arXiv:2610.03714)
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
            SpiderCSS vs. Flag at Origin Across {SIMULATION_SUMMARY.total_codes}{' '}
            Benchmarked CSS Codes
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl">
            Interactive reproduction of <strong>Figure 1</strong>,{' '}
            <strong>Figure 8</strong>, and <strong>Table I</strong> from the
            paper across {SIMULATION_SUMMARY.total_runs} Stim Monte Carlo
            simulation runs (distances <code className="font-mono">d = 3</code>{' '}
            to <code className="font-mono">15</code>, up to{' '}
            <code className="font-mono">n = 144</code> physical qubits).
          </p>
        </div>

        {/* Summary Aggregate Stat Pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
          <div className="rounded-xl bg-emerald-50/90 border border-emerald-200 px-3 py-2 text-center">
            <div className="text-[10px] font-mono uppercase text-emerald-800">
              Mean LER Reduction
            </div>
            <div className="text-base font-bold font-mono text-emerald-900">
              −33.7%
            </div>
          </div>
          <div className="rounded-xl bg-emerald-50/90 border border-emerald-200 px-3 py-2 text-center">
            <div className="text-[10px] font-mono uppercase text-emerald-800">
              Mean AR Increase
            </div>
            <div className="text-base font-bold font-mono text-emerald-900">
              +9.5%
            </div>
          </div>
          <div className="rounded-xl bg-sky-50/90 border border-sky-200 px-3 py-2 text-center">
            <div className="text-[10px] font-mono uppercase text-sky-800">
              Depth Reduction
            </div>
            <div className="text-base font-bold font-mono text-sky-900">
              −60.3%
            </div>
          </div>
          <div className="rounded-xl bg-amber-50/90 border border-amber-200 px-3 py-2 text-center">
            <div className="text-[10px] font-mono uppercase text-amber-800">
              Sim. Qubits Saved
            </div>
            <div className="text-base font-bold font-mono text-amber-900">
              −20.2%
            </div>
          </div>
        </div>
      </div>

      {/* 1. Interactive Paper Figure 1 & Figure 8 Plots */}
      <LerComparisonPlot
        codes={SIMULATION_SUMMARY.codes}
        selectedCodeId={selectedCodeId}
        onSelectCode={(codeId) => setSelectedCodeId(codeId)}
      />

      {/* 2. Master Benchmark Table (Reproducing Paper Table I / sim_table.tex) */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Table2 className="w-4 h-4 text-emerald-700" />
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                Table I: Resource Overhead, Logical Error Rate &amp; Acceptance
                Rate Comparison
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Bold entries indicate the best result for each CSS state. Click any column header to sort, or click{' '}
              <strong>Load in Studio ↑</strong> to inspect that code in Phases 1–5.
            </p>
          </div>

          {/* Family Filter & Reuse Target View Switch */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-500 ml-1.5" />
              {(
                [
                  { id: 'all', label: 'All (18)' },
                  { id: 'surface', label: 'Surface' },
                  { id: 'color', label: 'Color' },
                  { id: 'self_dual', label: 'Steane/Golay/SD' },
                  { id: 'triorthogonal', label: 'Triorthogonal' },
                  { id: 'high_rate', label: 'k ≥ 2 / QLDPC' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFamilyFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                    familyFilter === f.id
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs">
              {(
                [
                  { id: 'both', label: 'Both Reuse Rows (Table I)' },
                  { id: 'qubits', label: 'Sim. Qubits Target' },
                  { id: 'depth', label: 'Depth Target' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setReuseRowFilter(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium transition-colors cursor-pointer ${
                    reuseRowFilter === opt.id
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table I */}
        <div className="overflow-x-auto rounded-xl border border-slate-200 custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-mono text-[11px]">
                <th
                  onClick={() => handleSortClick('d')}
                  className="py-3 px-3 cursor-pointer hover:text-slate-900 select-none"
                >
                  QEC Code &amp; State {sortField === 'd' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th className="py-3 px-3">Method</th>
                <th
                  onClick={() => handleSortClick('cx')}
                  className="py-3 px-2.5 text-right cursor-pointer hover:text-slate-900 select-none"
                >
                  CNOT Count {sortField === 'cx' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th
                  onClick={() => handleSortClick('flags')}
                  className="py-3 px-2.5 text-right cursor-pointer hover:text-slate-900 select-none"
                >
                  Flag Count {sortField === 'flags' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th className="py-3 px-2.5 text-center">
                  Qubit Reuse Target
                </th>
                <th
                  onClick={() => handleSortClick('qubits_max')}
                  className="py-3 px-2.5 text-right cursor-pointer hover:text-slate-900 select-none"
                >
                  Sim. Qubits {sortField === 'qubits_max' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th
                  onClick={() => handleSortClick('depth_min')}
                  className="py-3 px-2.5 text-right cursor-pointer hover:text-slate-900 select-none"
                >
                  Depth {sortField === 'depth_min' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th
                  onClick={() => handleSortClick('ler')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 select-none"
                >
                  LER (95% Wilson CI) {sortField === 'ler' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th
                  onClick={() => handleSortClick('ar')}
                  className="py-3 px-3 text-right cursor-pointer hover:text-slate-900 select-none"
                >
                  AR (95% Wilson CI) {sortField === 'ar' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th className="py-3 px-3 text-right">Studio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono text-xs">
              {filteredAndSortedCodes.map((c) => {
                const fao = c.fao;
                const best = c.best_spidercss;
                const methods = [
                  ...(fao
                    ? [{ run: fao, label: 'Flag at Origin', isSpider: false }]
                    : []),
                  ...(best
                    ? [
                        {
                          run: best,
                          label: `SpiderCSS (${formatHeuristicShort(
                            best.heuristic
                          )})`,
                          isSpider: true,
                        },
                      ]
                    : []),
                ];

                if (methods.length === 0) return null;

                const validLers = methods
                  .map((m) => m.run.logical_error_rate)
                  .filter((v): v is number => v !== null && v > 0);
                const sharedExp =
                  validLers.length > 0
                    ? Math.floor(Math.log10(Math.min(...validLers)))
                    : undefined;

                // Determine winners (when both FaO and SpiderCSS exist and differ)
                const winCx =
                  fao && best && fao.num_cx !== best.num_cx
                    ? Math.min(fao.num_cx ?? 999999, best.num_cx ?? 999999)
                    : null;
                const winFlags =
                  fao && best && fao.num_flags !== best.num_flags
                    ? Math.min(
                        fao.num_flags ?? 999999,
                        best.num_flags ?? 999999
                      )
                    : null;
                const winQMax =
                  fao && best && fao.num_qubits_max !== best.num_qubits_max
                    ? Math.min(
                        fao.num_qubits_max ?? 999999,
                        best.num_qubits_max ?? 999999
                      )
                    : null;
                const winDMax =
                  fao && best && fao.depth_max !== best.depth_max
                    ? Math.min(
                        fao.depth_max ?? 999999,
                        best.depth_max ?? 999999
                      )
                    : null;
                const winQMin =
                  fao && best && fao.num_qubits_min !== best.num_qubits_min
                    ? Math.min(
                        fao.num_qubits_min ?? 999999,
                        best.num_qubits_min ?? 999999
                      )
                    : null;
                const winDMin =
                  fao && best && fao.depth_min !== best.depth_min
                    ? Math.min(
                        fao.depth_min ?? 999999,
                        best.depth_min ?? 999999
                      )
                    : null;
                const winLer =
                  fao?.logical_error_rate != null &&
                  best?.logical_error_rate != null &&
                  fao.logical_error_rate !== best.logical_error_rate
                    ? Math.min(fao.logical_error_rate, best.logical_error_rate)
                    : null;
                const winAr =
                  fao?.acceptance_rate != null &&
                  best?.acceptance_rate != null &&
                  fao.acceptance_rate !== best.acceptance_rate
                    ? Math.max(fao.acceptance_rate, best.acceptance_rate)
                    : null;

                const rowsPerMethod = reuseRowFilter === 'both' ? 2 : 1;
                const totalCodeRows = methods.length * rowsPerMethod;
                const isSelected = selectedCodeId === c.code;

                return methods.map((m, mIdx) => {
                  const r = m.run;
                  const subRows =
                    reuseRowFilter === 'both'
                      ? (['qubits', 'depth'] as const)
                      : ([reuseRowFilter] as const);

                  return subRows.map((targetType, subIdx) => {
                    const isFirstCodeRow = mIdx === 0 && subIdx === 0;
                    const isFirstMethodRow = subIdx === 0;
                    const qVal =
                      targetType === 'qubits'
                        ? r.num_qubits_max
                        : r.num_qubits_min;
                    const dVal =
                      targetType === 'qubits' ? r.depth_max : r.depth_min;
                    const qWin =
                      targetType === 'qubits'
                        ? qVal !== null && qVal === winQMax
                        : qVal !== null && qVal === winQMin;
                    const dWin =
                      targetType === 'qubits'
                        ? dVal !== null && dVal === winDMax
                        : dVal !== null && dVal === winDMin;

                    return (
                      <tr
                        key={`${c.code}-${m.label}-${targetType}`}
                        onClick={() => setSelectedCodeId(c.code)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-50/40'
                            : m.isSpider
                            ? 'bg-white hover:bg-slate-50/80'
                            : 'bg-slate-50/40 hover:bg-slate-100/50'
                        } ${
                          mIdx > 0 && subIdx === 0
                            ? 'border-t border-slate-200/80'
                            : ''
                        }`}
                      >
                        {isFirstCodeRow && (
                          <td
                            rowSpan={totalCodeRows}
                            className="py-2.5 px-3 align-middle font-sans border-r border-slate-100"
                          >
                            <div className="font-bold text-slate-900">
                              [[{c.n}, {c.k}, {c.d}]]
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {cleanLabel(c.label)}{' '}
                              <span className="font-mono text-slate-700">
                                {formatStateLabel(c.target_basis, c.k)}
                              </span>
                            </div>
                          </td>
                        )}

                        {isFirstMethodRow && (
                          <td
                            rowSpan={rowsPerMethod}
                            className={`py-2 px-3 align-middle font-sans ${
                              m.isSpider
                                ? 'font-semibold text-emerald-900'
                                : 'text-slate-600'
                            }`}
                          >
                            {m.label}
                          </td>
                        )}

                        {isFirstMethodRow && (
                          <td
                            rowSpan={rowsPerMethod}
                            className={`py-2 px-2.5 text-right align-middle ${
                              r.num_cx !== null && r.num_cx === winCx
                                ? 'font-bold text-emerald-800'
                                : 'text-slate-700'
                            }`}
                          >
                            {r.num_cx ?? '—'}
                          </td>
                        )}

                        {isFirstMethodRow && (
                          <td
                            rowSpan={rowsPerMethod}
                            className={`py-2 px-2.5 text-right align-middle ${
                              r.num_flags !== null && r.num_flags === winFlags
                                ? 'font-bold text-emerald-800'
                                : 'text-slate-700'
                            }`}
                          >
                            {r.num_flags ?? '—'}
                          </td>
                        )}

                        <td className="py-1.5 px-2.5 text-center text-[11px] text-slate-500">
                          {targetType === 'qubits' ? 'sim. qubits' : 'depth'}
                        </td>

                        <td
                          className={`py-1.5 px-2.5 text-right ${
                            qWin
                              ? 'font-bold text-emerald-800'
                              : 'text-slate-700'
                          }`}
                        >
                          {qVal ?? '—'}
                        </td>

                        <td
                          className={`py-1.5 px-2.5 text-right ${
                            dWin
                              ? 'font-bold text-emerald-800'
                              : 'text-slate-700'
                          }`}
                        >
                          {dVal ?? '—'}
                        </td>

                        {isFirstMethodRow && (
                          <td
                            rowSpan={rowsPerMethod}
                            className={`py-2 px-3 text-right align-middle ${
                              r.logical_error_rate !== null &&
                              r.logical_error_rate === winLer
                                ? 'font-bold text-emerald-800'
                                : 'text-slate-700'
                            }`}
                          >
                            {formatLerInterval(r, sharedExp)}
                          </td>
                        )}

                        {isFirstMethodRow && (
                          <td
                            rowSpan={rowsPerMethod}
                            className={`py-2 px-3 text-right align-middle ${
                              r.acceptance_rate !== null &&
                              r.acceptance_rate === winAr
                                ? 'font-bold text-emerald-800'
                                : 'text-slate-700'
                            }`}
                          >
                            {formatArInterval(r)}
                          </td>
                        )}

                        {isFirstCodeRow && (
                          <td
                            rowSpan={totalCodeRows}
                            className="py-2 px-3 text-right align-middle font-sans"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                loadBenchmarkCodeInStudio(
                                  c,
                                  c.best_spidercss?.heuristic,
                                  true
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                            >
                              Load ↑
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  });
                });
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-500 font-mono">
          * Note: Logical error rates marked <code className="font-mono">—</code> were not estimated as the code-capacity syndrome lookup table exceeded memory. For the 4 largest codes (<code className="font-mono">d ≥ 12</code>), values marked with <code className="font-mono">*</code> indicate simulations performed at physical error rate <code className="font-mono">p = 0.0001</code> instead of <code className="font-mono">p = 0.001</code>.
        </p>
      </div>
    </div>
  );
};
