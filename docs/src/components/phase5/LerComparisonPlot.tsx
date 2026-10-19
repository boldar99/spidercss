import React, { useMemo, useState } from 'react';
import { TrendingDown, Sparkles, Crosshair } from 'lucide-react';
import type { SimulationCodeSummary } from '../../engine/types';

interface LerComparisonPlotProps {
  codes: SimulationCodeSummary[];
  selectedCodeId: string | null;
  onSelectCode: (codeId: string) => void;
}

type PlotTab = 'fig1_improvements' | 'fig8_absolute';
type ReuseFilter = 'both' | 'depth' | 'qubits';

interface LerArPoint {
  code: string;
  label: string;
  shortName: string;
  lerImp: number;
  arImp: number;
  faoLer: number;
  spiderLer: number;
  faoAr: number;
  spiderAr: number;
}

interface DepthQubitsPoint {
  code: string;
  label: string;
  shortName: string;
  dImpMin: number;
  qImpMin: number;
  dImpMax: number;
  qImpMax: number;
  faoDepthMin: number;
  spiderDepthMin: number;
  faoQubitsMin: number;
  spiderQubitsMin: number;
  faoDepthMax: number;
  spiderDepthMax: number;
  faoQubitsMax: number;
  spiderQubitsMax: number;
}

export const LerComparisonPlot: React.FC<LerComparisonPlotProps> = ({
  codes,
  selectedCodeId,
  onSelectCode,
}) => {
  const [activeTab, setActiveTab] = useState<PlotTab>('fig1_improvements');
  const [reuseFilter, setReuseFilter] = useState<ReuseFilter>('both');
  const [hoveredCode, setHoveredCode] = useState<string | null>(null);

  // 1. Compute Figure 1a points: LER & AR % improvements over FaO
  const lerArData = useMemo(() => {
    const points: LerArPoint[] = [];
    for (const c of codes) {
      const f = c.fao;
      const b = c.best_spidercss;
      if (
        f &&
        b &&
        f.logical_error_rate &&
        f.logical_error_rate > 0 &&
        b.logical_error_rate &&
        b.logical_error_rate > 0 &&
        f.acceptance_rate !== null &&
        b.acceptance_rate !== null
      ) {
        const lerImp =
          (100 * (f.logical_error_rate - b.logical_error_rate)) /
          f.logical_error_rate;
        const arImp =
          (100 * (b.acceptance_rate - f.acceptance_rate)) / f.acceptance_rate;
        points.push({
          code: c.code,
          label: `[[${c.n}, ${c.k}, ${c.d}]]`,
          shortName: (c.label || c.full_name || '').replace(/\\@/g, '').trim(),
          lerImp,
          arImp,
          faoLer: f.logical_error_rate,
          spiderLer: b.logical_error_rate,
          faoAr: f.acceptance_rate,
          spiderAr: b.acceptance_rate,
        });
      }
    }
    const avgLer =
      points.length > 0
        ? points.reduce((acc, p) => acc + p.lerImp, 0) / points.length
        : 0;
    const avgAr =
      points.length > 0
        ? points.reduce((acc, p) => acc + p.arImp, 0) / points.length
        : 0;
    return { points, avgLer, avgAr };
  }, [codes]);

  // 2. Compute Figure 1b & 8b points: Depth & Simultaneous Qubits
  const depthQubitsData = useMemo(() => {
    const points: DepthQubitsPoint[] = [];
    for (const c of codes) {
      const f = c.fao;
      const b = c.best_spidercss;
      if (
        f &&
        b &&
        f.depth_min &&
        b.depth_min &&
        f.num_qubits_min &&
        b.num_qubits_min &&
        f.depth_max &&
        b.depth_max &&
        f.num_qubits_max &&
        b.num_qubits_max
      ) {
        points.push({
          code: c.code,
          label: `[[${c.n}, ${c.k}, ${c.d}]]`,
          shortName: (c.label || c.full_name || '').replace(/\\@/g, '').trim(),
          dImpMin: (100 * (f.depth_min - b.depth_min)) / f.depth_min,
          qImpMin:
            (100 * (f.num_qubits_min - b.num_qubits_min)) / f.num_qubits_min,
          dImpMax: (100 * (f.depth_max - b.depth_max)) / f.depth_max,
          qImpMax:
            (100 * (f.num_qubits_max - b.num_qubits_max)) / f.num_qubits_max,
          faoDepthMin: f.depth_min,
          spiderDepthMin: b.depth_min,
          faoQubitsMin: f.num_qubits_min,
          spiderQubitsMin: b.num_qubits_min,
          faoDepthMax: f.depth_max,
          spiderDepthMax: b.depth_max,
          faoQubitsMax: f.num_qubits_max,
          spiderQubitsMax: b.num_qubits_max,
        });
      }
    }
    const n = points.length || 1;
    return {
      points,
      avgDMin: points.reduce((s, p) => s + p.dImpMin, 0) / n,
      avgQMin: points.reduce((s, p) => s + p.qImpMin, 0) / n,
      avgDMax: points.reduce((s, p) => s + p.dImpMax, 0) / n,
      avgQMax: points.reduce((s, p) => s + p.qImpMax, 0) / n,
    };
  }, [codes]);

  // 3. Codes with both LER and AR for Figure 8a (log-LER + AR error bar plot)
  const fig8Codes = useMemo(
    () =>
      codes.filter(
        (c) =>
          c.fao?.logical_error_rate != null &&
          c.best_spidercss?.logical_error_rate != null &&
          c.fao?.acceptance_rate != null &&
          c.best_spidercss?.acceptance_rate != null
      ),
    [codes]
  );

  const activeFocusCode = hoveredCode ?? selectedCodeId;

  // Coordinate helpers for Figure 1a: X in [-100, 100], Y in [-15, 50]
  const fig1W = 520;
  const fig1H = 340;
  const padL = 52;
  const padR = 24;
  const padT = 22;
  const padB = 44;
  const plotW = fig1W - padL - padR;
  const plotH = fig1H - padT - padB;

  const xScale1a = (val: number) =>
    padL + ((val - -100) / (100 - -100)) * plotW;
  const yScale1a = (val: number) =>
    padT + plotH - ((val - -15) / (50 - -15)) * plotH;

  // Coordinate helpers for Figure 1b: X in [-30, 100], Y in [-20, 50]
  const xScale1b = (val: number) =>
    padL + ((val - -30) / (100 - -30)) * plotW;
  const yScale1b = (val: number) =>
    padT + plotH - ((val - -20) / (50 - -20)) * plotH;

  // Coordinate helpers for Figure 8b (sqrt scale): X in [0, 900], Y in [0, 500]
  const xScale8b = (val: number) =>
    padL + (Math.sqrt(Math.max(0, val)) / Math.sqrt(900)) * plotW;
  const yScale8b = (val: number) =>
    padT + plotH - (Math.sqrt(Math.max(0, val)) / Math.sqrt(500)) * plotH;

  // Star path generator
  const starPoints = (cx: number, cy: number, outerR = 7, innerR = 3.2) => {
    const pts: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (Math.PI / 5) * i - Math.PI / 2;
      pts.push(
        `${(cx + r * Math.cos(angle)).toFixed(1)},${(
          cy +
          r * Math.sin(angle)
        ).toFixed(1)}`
      );
    }
    return pts.join(' ');
  };

  const labeledCodes1a = new Set([
    '47_1_11',
    '49_1_7',
    '49_1_5',
    '7_1_3',
    '95_1_7',
    '9_1_3',
    '20_2_6',
  ]);

  const labeledCodes1b = new Set([
    '95_1_7',
    '47_1_11',
    '7_1_3',
    '49_1_5',
    '49_1_7',
    '81_1_9',
  ]);

  return (
    <div className="space-y-4">
      {/* Top Sub-Navigation between Paper Figure 1 and Paper Figure 8 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('fig1_improvements')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'fig1_improvements'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Paper Fig. 1: % Improvement over Flag at Origin
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('fig8_absolute')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === 'fig8_absolute'
                ? 'bg-emerald-800 text-white shadow-2xs'
                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Paper Fig. 8: Log-LER, Acceptance Rate &amp; Spacetime Trajectories
          </button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-mono">
          <Crosshair className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
          <span>Click any point to inspect code &amp; heuristics</span>
        </div>
      </div>

      {activeTab === 'fig1_improvements' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Panel 1a: LER vs AR % Improvement */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-emerald-700">
                  Figure 1(a) • Noise Performance
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  Logical Error Rate vs. Acceptance Rate Improvement (%)
                </h4>
              </div>
              <div className="text-right font-mono text-[11px] bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg text-emerald-900 shrink-0">
                <div>Avg LER: +{lerArData.avgLer.toFixed(1)}%</div>
                <div>Avg AR: +{lerArData.avgAr.toFixed(1)}%</div>
              </div>
            </div>

            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${fig1W} ${fig1H}`}
                className="w-full h-auto select-none"
              >
                {/* Top-right win-win quadrant shading */}
                <rect
                  x={xScale1a(0)}
                  y={yScale1a(50)}
                  width={xScale1a(100) - xScale1a(0)}
                  height={yScale1a(0) - yScale1a(50)}
                  fill="#10b981"
                  fillOpacity={0.07}
                />
                <text
                  x={xScale1a(96)}
                  y={yScale1a(46)}
                  textAnchor="end"
                  className="fill-emerald-800/70 text-[9px] font-mono font-semibold"
                >
                  Outperforms FaO on both LER &amp; AR
                </text>

                {/* Grid lines */}
                {[-100, -50, 0, 50, 100].map((xt) => (
                  <g key={`xgrid-${xt}`}>
                    <line
                      x1={xScale1a(xt)}
                      y1={padT}
                      x2={xScale1a(xt)}
                      y2={padT + plotH}
                      stroke={xt === 0 ? '#64748b' : '#e2e8f0'}
                      strokeWidth={xt === 0 ? 1.3 : 1}
                      strokeDasharray={xt === 0 ? '4,3' : '2,2'}
                    />
                    <text
                      x={xScale1a(xt)}
                      y={padT + plotH + 15}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {xt}%
                    </text>
                  </g>
                ))}

                {[-10, 0, 10, 20, 30, 40, 50].map((yt) => (
                  <g key={`ygrid-${yt}`}>
                    <line
                      x1={padL}
                      y1={yScale1a(yt)}
                      x2={padL + plotW}
                      y2={yScale1a(yt)}
                      stroke={yt === 0 ? '#64748b' : '#e2e8f0'}
                      strokeWidth={yt === 0 ? 1.3 : 1}
                      strokeDasharray={yt === 0 ? '4,3' : '2,2'}
                    />
                    <text
                      x={padL - 7}
                      y={yScale1a(yt) + 3}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {yt}%
                    </text>
                  </g>
                ))}

                {/* Mean reference lines */}
                <line
                  x1={xScale1a(lerArData.avgLer)}
                  y1={padT}
                  x2={xScale1a(lerArData.avgLer)}
                  y2={padT + plotH}
                  stroke="#d97706"
                  strokeWidth={1.3}
                  strokeDasharray="2,3"
                />
                <line
                  x1={padL}
                  y1={yScale1a(lerArData.avgAr)}
                  x2={padL + plotW}
                  y2={yScale1a(lerArData.avgAr)}
                  stroke="#d97706"
                  strokeWidth={1.3}
                  strokeDasharray="2,3"
                />

                {/* FaO Baseline Cross at (0,0) */}
                <g transform={`translate(${xScale1a(0)}, ${yScale1a(0)})`}>
                  <path
                    d="M -6 0 L 6 0 M 0 -6 L 0 6"
                    stroke="#0f172a"
                    strokeWidth={2.8}
                  />
                </g>

                {/* Mean Star Marker */}
                <polygon
                  points={starPoints(
                    xScale1a(lerArData.avgLer),
                    yScale1a(lerArData.avgAr),
                    8.5,
                    3.8
                  )}
                  fill="#d97706"
                  stroke="#ffffff"
                  strokeWidth={1}
                />

                {/* Code Data Points */}
                {lerArData.points.map((pt) => {
                  const cx = xScale1a(Math.max(-100, Math.min(100, pt.lerImp)));
                  const cy = yScale1a(Math.max(-15, Math.min(50, pt.arImp)));
                  const isActive = activeFocusCode === pt.code;
                  const showLabel =
                    isActive || labeledCodes1a.has(pt.code);
                  return (
                    <g
                      key={pt.code}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredCode(pt.code)}
                      onMouseLeave={() => setHoveredCode(null)}
                      onClick={() => onSelectCode(pt.code)}
                    >
                      {isActive && (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={10}
                          fill="none"
                          stroke="#059669"
                          strokeWidth={2}
                        />
                      )}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isActive ? 6 : 4.8}
                        fill={isActive ? '#059669' : '#ea580c'}
                        stroke="#ffffff"
                        strokeWidth={1.4}
                      />
                      {showLabel && (
                        <text
                          x={cx + (pt.lerImp > 65 ? -7 : 7)}
                          y={cy - 6}
                          textAnchor={pt.lerImp > 65 ? 'end' : 'start'}
                          className={`text-[9.5px] font-mono ${
                            isActive
                              ? 'fill-emerald-900 font-bold'
                              : 'fill-slate-700 font-medium'
                          }`}
                        >
                          {pt.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Axis Titles */}
                <text
                  x={padL + plotW / 2}
                  y={fig1H - 6}
                  textAnchor="middle"
                  className="fill-slate-700 text-[11px] font-semibold"
                >
                  Improvement to Logical Error Rate (%) →
                </text>
                <text
                  x={14}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  transform={`rotate(-90, 14, ${padT + plotH / 2})`}
                  className="fill-slate-700 text-[11px] font-semibold"
                >
                  Improvement to Acceptance Rate (%) →
                </text>
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block" />
                  Benchmarked CSS Code
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-amber-600 font-bold">★</span>
                  Mean (+{lerArData.avgLer.toFixed(1)}% LER, +
                  {lerArData.avgAr.toFixed(1)}% AR)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="font-mono font-bold text-slate-900">+</span>
                  FaO Baseline (0%, 0%)
                </span>
              </div>
            </div>
          </div>

          {/* Panel 1b: Circuit Depth vs Simultaneous Qubits % Improvement */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-emerald-700">
                  Figure 1(b) • Spacetime Footprint
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  Circuit Depth vs. Simultaneous Qubits Improvement (%)
                </h4>
              </div>

              {/* Filter toggle for Reuse Strategy */}
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 self-start">
                {(
                  [
                    { id: 'both', label: 'Both' },
                    { id: 'depth', label: '▲ Depth Opt.' },
                    { id: 'qubits', label: '■ Qubits Opt.' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setReuseFilter(opt.id)}
                    className={`px-2 py-1 rounded-md text-[10px] font-mono font-semibold cursor-pointer transition-colors ${
                      reuseFilter === opt.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${fig1W} ${fig1H}`}
                className="w-full h-auto select-none"
              >
                {/* Top-right win-win quadrant shading */}
                <rect
                  x={xScale1b(0)}
                  y={yScale1b(50)}
                  width={xScale1b(100) - xScale1b(0)}
                  height={yScale1b(0) - yScale1b(50)}
                  fill="#10b981"
                  fillOpacity={0.07}
                />
                <text
                  x={xScale1b(97)}
                  y={yScale1b(46)}
                  textAnchor="end"
                  className="fill-emerald-800/70 text-[9px] font-mono font-semibold"
                >
                  Shallower Depth &amp; Fewer Sim. Qubits
                </text>

                {/* Grid lines */}
                {[-25, 0, 25, 50, 75, 100].map((xt) => (
                  <g key={`xgrid1b-${xt}`}>
                    <line
                      x1={xScale1b(xt)}
                      y1={padT}
                      x2={xScale1b(xt)}
                      y2={padT + plotH}
                      stroke={xt === 0 ? '#64748b' : '#e2e8f0'}
                      strokeWidth={xt === 0 ? 1.3 : 1}
                      strokeDasharray={xt === 0 ? '4,3' : '2,2'}
                    />
                    <text
                      x={xScale1b(xt)}
                      y={padT + plotH + 15}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {xt}%
                    </text>
                  </g>
                ))}

                {[-20, -10, 0, 10, 20, 30, 40, 50].map((yt) => (
                  <g key={`ygrid1b-${yt}`}>
                    <line
                      x1={padL}
                      y1={yScale1b(yt)}
                      x2={padL + plotW}
                      y2={yScale1b(yt)}
                      stroke={yt === 0 ? '#64748b' : '#e2e8f0'}
                      strokeWidth={yt === 0 ? 1.3 : 1}
                      strokeDasharray={yt === 0 ? '4,3' : '2,2'}
                    />
                    <text
                      x={padL - 7}
                      y={yScale1b(yt) + 3}
                      textAnchor="end"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {yt}%
                    </text>
                  </g>
                ))}

                {/* Mean lines & stars */}
                {(reuseFilter === 'both' || reuseFilter === 'depth') && (
                  <>
                    <line
                      x1={xScale1b(depthQubitsData.avgDMin)}
                      y1={padT}
                      x2={xScale1b(depthQubitsData.avgDMin)}
                      y2={padT + plotH}
                      stroke="#0284c7"
                      strokeWidth={1.2}
                      strokeDasharray="2,3"
                    />
                    <line
                      x1={padL}
                      y1={yScale1b(depthQubitsData.avgQMin)}
                      x2={padL + plotW}
                      y2={yScale1b(depthQubitsData.avgQMin)}
                      stroke="#0284c7"
                      strokeWidth={1.2}
                      strokeDasharray="2,3"
                    />
                    <polygon
                      points={starPoints(
                        xScale1b(depthQubitsData.avgDMin),
                        yScale1b(depthQubitsData.avgQMin),
                        8.5,
                        3.8
                      )}
                      fill="#0284c7"
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  </>
                )}

                {(reuseFilter === 'both' || reuseFilter === 'qubits') && (
                  <>
                    <line
                      x1={xScale1b(depthQubitsData.avgDMax)}
                      y1={padT}
                      x2={xScale1b(depthQubitsData.avgDMax)}
                      y2={padT + plotH}
                      stroke="#ea580c"
                      strokeWidth={1.2}
                      strokeDasharray="4,3"
                    />
                    <line
                      x1={padL}
                      y1={yScale1b(depthQubitsData.avgQMax)}
                      x2={padL + plotW}
                      y2={yScale1b(depthQubitsData.avgQMax)}
                      stroke="#ea580c"
                      strokeWidth={1.2}
                      strokeDasharray="4,3"
                    />
                    <polygon
                      points={starPoints(
                        xScale1b(depthQubitsData.avgDMax),
                        yScale1b(depthQubitsData.avgQMax),
                        8.5,
                        3.8
                      )}
                      fill="#ea580c"
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  </>
                )}

                {/* FaO Baseline Cross at (0,0) */}
                <g transform={`translate(${xScale1b(0)}, ${yScale1b(0)})`}>
                  <path
                    d="M -6 0 L 6 0 M 0 -6 L 0 6"
                    stroke="#0f172a"
                    strokeWidth={2.8}
                  />
                </g>

                {/* Points for each code */}
                {depthQubitsData.points.map((pt) => {
                  const isActive = activeFocusCode === pt.code;
                  const xMin = xScale1b(pt.dImpMin);
                  const yMin = yScale1b(pt.qImpMin);
                  const xMax = xScale1b(pt.dImpMax);
                  const yMax = yScale1b(pt.qImpMax);
                  const showLabel =
                    isActive || labeledCodes1b.has(pt.code);

                  return (
                    <g
                      key={pt.code}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredCode(pt.code)}
                      onMouseLeave={() => setHoveredCode(null)}
                      onClick={() => onSelectCode(pt.code)}
                    >
                      {reuseFilter === 'both' && isActive && (
                        <line
                          x1={xMin}
                          y1={yMin}
                          x2={xMax}
                          y2={yMax}
                          stroke="#059669"
                          strokeWidth={1.5}
                          strokeDasharray="3,2"
                        />
                      )}

                      {/* Depth-optimizing triangle (▲) */}
                      {(reuseFilter === 'both' || reuseFilter === 'depth') && (
                        <polygon
                          points={`${xMin},${yMin - 5.5} ${xMin - 5},${
                            yMin + 4.5
                          } ${xMin + 5},${yMin + 4.5}`}
                          fill={isActive ? '#059669' : '#0284c7'}
                          stroke="#ffffff"
                          strokeWidth={1.3}
                        />
                      )}

                      {/* Footprint-optimizing square (■) */}
                      {(reuseFilter === 'both' || reuseFilter === 'qubits') && (
                        <rect
                          x={xMax - 4.5}
                          y={yMax - 4.5}
                          width={9}
                          height={9}
                          fill={isActive ? '#059669' : '#ea580c'}
                          stroke="#ffffff"
                          strokeWidth={1.3}
                        />
                      )}

                      {showLabel && (
                        <text
                          x={
                            (reuseFilter === 'depth' ? xMin : xMax) +
                            ((reuseFilter === 'depth'
                              ? pt.dImpMin
                              : pt.dImpMax) > 70
                              ? -7
                              : 7)
                          }
                          y={(reuseFilter === 'depth' ? yMin : yMax) - 6}
                          textAnchor={
                            (reuseFilter === 'depth'
                              ? pt.dImpMin
                              : pt.dImpMax) > 70
                              ? 'end'
                              : 'start'
                          }
                          className={`text-[9.5px] font-mono ${
                            isActive
                              ? 'fill-emerald-900 font-bold'
                              : 'fill-slate-700 font-medium'
                          }`}
                        >
                          {pt.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Axis Titles */}
                <text
                  x={padL + plotW / 2}
                  y={fig1H - 6}
                  textAnchor="middle"
                  className="fill-slate-700 text-[11px] font-semibold"
                >
                  Improvement to Circuit Depth (%) →
                </text>
                <text
                  x={14}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  transform={`rotate(-90, 14, ${padT + plotH / 2})`}
                  className="fill-slate-700 text-[11px] font-semibold"
                >
                  Improvement to Sim. Qubits (%) →
                </text>
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-sky-600 font-bold">▲</span>
                  Depth Opt. (Avg +{depthQubitsData.avgDMin.toFixed(1)}% D, +
                  {depthQubitsData.avgQMin.toFixed(1)}% Q)
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-orange-600 font-bold">■</span>
                  Footprint Opt. (Avg +{depthQubitsData.avgDMax.toFixed(1)}% D, +
                  {depthQubitsData.avgQMax.toFixed(1)}% Q)
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Paper Figure 8: Log-Scale LER + AR with 95% Wilson CI & Spacetime Trajectory Scatter */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Panel 8a: Acceptance Rate & Log-Scale LER across codes */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-emerald-700">
                  Figure 8(a) • 95% Wilson Confidence Intervals
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  Acceptance Rate (Top) &amp; Log-Scale LER (Bottom) vs. Code
                </h4>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                p = 10⁻³
              </span>
            </div>

            <div className="relative w-full overflow-x-auto">
              {(() => {
                const w = 520;
                const h = 360;
                const lPad = 56;
                const rPad = 18;
                const tPad = 16;
                const midGap = 18;
                const bPad = 58;
                const innerW = w - lPad - rPad;
                const panelH = (h - tPad - bPad - midGap) / 2;
                const topY0 = tPad;
                const botY0 = tPad + panelH + midGap;
                const nCodes = fig8Codes.length || 1;
                const colStep = innerW / nCodes;

                // AR scale: 0 to 1.02
                const yAr = (ar: number) =>
                  topY0 + panelH - (Math.max(0, Math.min(1.02, ar)) / 1.02) * panelH;

                // LER log10 scale: 10^-8.5 to 10^-3.2
                const logMin = -8.5;
                const logMax = -3.2;
                const yLer = (ler: number) => {
                  const lg = Math.log10(Math.max(1e-9, ler));
                  const clamped = Math.max(logMin, Math.min(logMax, lg));
                  return (
                    botY0 +
                    panelH -
                    ((clamped - logMin) / (logMax - logMin)) * panelH
                  );
                };

                return (
                  <svg
                    viewBox={`0 0 ${w} ${h}`}
                    className="w-full h-auto select-none"
                  >
                    {/* Top Panel: Acceptance Rate grid */}
                    {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map((tick) => (
                      <g key={`ar-tick-${tick}`}>
                        <line
                          x1={lPad}
                          y1={yAr(tick)}
                          x2={lPad + innerW}
                          y2={yAr(tick)}
                          stroke="#e2e8f0"
                          strokeDasharray="2,2"
                        />
                        <text
                          x={lPad - 6}
                          y={yAr(tick) + 3}
                          textAnchor="end"
                          className="fill-slate-500 text-[9.5px] font-mono"
                        >
                          {tick.toFixed(1)}
                        </text>
                      </g>
                    ))}

                    {/* Bottom Panel: Log10 LER grid */}
                    {[-8, -7, -6, -5, -4].map((exp) => {
                      const val = Math.pow(10, exp);
                      return (
                        <g key={`ler-tick-${exp}`}>
                          <line
                            x1={lPad}
                            y1={yLer(val)}
                            x2={lPad + innerW}
                            y2={yLer(val)}
                            stroke="#e2e8f0"
                            strokeDasharray="2,2"
                          />
                          <text
                            x={lPad - 6}
                            y={yLer(val) + 3}
                            textAnchor="end"
                            className="fill-slate-500 text-[9.5px] font-mono"
                          >
                            10^{exp}
                          </text>
                        </g>
                      );
                    })}

                    {/* Borders */}
                    <rect
                      x={lPad}
                      y={topY0}
                      width={innerW}
                      height={panelH}
                      fill="none"
                      stroke="#cbd5e1"
                    />
                    <rect
                      x={lPad}
                      y={botY0}
                      width={innerW}
                      height={panelH}
                      fill="none"
                      stroke="#cbd5e1"
                    />

                    {/* Columns for each code */}
                    {fig8Codes.map((c, idx) => {
                      const cx = lPad + (idx + 0.5) * colStep;
                      const isActive = activeFocusCode === c.code;
                      const f = c.fao!;
                      const b = c.best_spidercss!;
                      const fX = cx - 4;
                      const bX = cx + 4;

                      return (
                        <g
                          key={c.code}
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredCode(c.code)}
                          onMouseLeave={() => setHoveredCode(null)}
                          onClick={() => onSelectCode(c.code)}
                        >
                          {isActive && (
                            <>
                              <rect
                                x={lPad + idx * colStep}
                                y={topY0}
                                width={colStep}
                                height={panelH}
                                fill="#10b981"
                                fillOpacity={0.08}
                              />
                              <rect
                                x={lPad + idx * colStep}
                                y={botY0}
                                width={colStep}
                                height={panelH}
                                fill="#10b981"
                                fillOpacity={0.08}
                              />
                            </>
                          )}
                          {idx < fig8Codes.length - 1 && (
                            <>
                              <line
                                x1={lPad + (idx + 1) * colStep}
                                y1={topY0}
                                x2={lPad + (idx + 1) * colStep}
                                y2={topY0 + panelH}
                                stroke="#f1f5f9"
                              />
                              <line
                                x1={lPad + (idx + 1) * colStep}
                                y1={botY0}
                                x2={lPad + (idx + 1) * colStep}
                                y2={botY0 + panelH}
                                stroke="#f1f5f9"
                              />
                            </>
                          )}

                          {/* Top: AR Points */}
                          <circle
                            cx={fX}
                            cy={yAr(f.acceptance_rate!)}
                            r={3.6}
                            fill="#0d9488"
                          />
                          <circle
                            cx={bX}
                            cy={yAr(b.acceptance_rate!)}
                            r={3.6}
                            fill="#ea580c"
                          />

                          {/* Bottom: LER Error Bars & Points */}
                          {f.ler_ci_low && f.ler_ci_high && (
                            <line
                              x1={fX}
                              y1={yLer(f.ler_ci_low)}
                              x2={fX}
                              y2={yLer(f.ler_ci_high)}
                              stroke="#0d9488"
                              strokeWidth={1.5}
                            />
                          )}
                          <circle
                            cx={fX}
                            cy={yLer(f.logical_error_rate!)}
                            r={3.6}
                            fill="#0d9488"
                          />

                          {b.ler_ci_low && b.ler_ci_high && (
                            <line
                              x1={bX}
                              y1={yLer(b.ler_ci_low)}
                              x2={bX}
                              y2={yLer(b.ler_ci_high)}
                              stroke="#ea580c"
                              strokeWidth={1.5}
                            />
                          )}
                          <circle
                            cx={bX}
                            cy={yLer(b.logical_error_rate!)}
                            r={3.6}
                            fill="#ea580c"
                          />

                          {/* Rotated X label */}
                          <text
                            x={cx}
                            y={botY0 + panelH + 12}
                            textAnchor="end"
                            transform={`rotate(-40, ${cx}, ${
                              botY0 + panelH + 12
                            })`}
                            className={`text-[9.5px] font-mono ${
                              isActive
                                ? 'fill-emerald-800 font-bold'
                                : 'fill-slate-600'
                            }`}
                          >
                            [[{c.n},{c.k},{c.d}]]
                          </text>
                        </g>
                      );
                    })}

                    {/* Y Axis Labels */}
                    <text
                      x={13}
                      y={topY0 + panelH / 2}
                      textAnchor="middle"
                      transform={`rotate(-90, 13, ${topY0 + panelH / 2})`}
                      className="fill-slate-700 text-[10.5px] font-semibold"
                    >
                      Acceptance Rate
                    </text>
                    <text
                      x={13}
                      y={botY0 + panelH / 2}
                      textAnchor="middle"
                      transform={`rotate(-90, 13, ${botY0 + panelH / 2})`}
                      className="fill-slate-700 text-[10.5px] font-semibold"
                    >
                      Logical Error Rate
                    </text>
                  </svg>
                );
              })()}
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block" />
                SpiderCSS (Best Heuristic, 95% Wilson CI)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
                Flag at Origin (FaO, 95% Wilson CI)
              </span>
            </div>
          </div>

          {/* Panel 8b: Circuit Depth vs Simultaneous Qubits (Sqrt-scale trajectories) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-emerald-700">
                  Figure 8(b) • Spacetime Resource Trajectories
                </span>
                <h4 className="text-sm font-bold text-slate-900">
                  Circuit Depth vs. Simultaneous Qubits (Lower-Left is Better)
                </h4>
              </div>
              <span className="text-[10px] font-mono text-slate-500">
                √-scaled axes
              </span>
            </div>

            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${fig1W} ${fig1H}`}
                className="w-full h-auto select-none"
              >
                {[0, 10, 50, 100, 200, 400, 600, 900].map((xt) => (
                  <g key={`x8b-${xt}`}>
                    <line
                      x1={xScale8b(xt)}
                      y1={padT}
                      x2={xScale8b(xt)}
                      y2={padT + plotH}
                      stroke="#e2e8f0"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={xScale8b(xt)}
                      y={padT + plotH + 15}
                      textAnchor="middle"
                      className="fill-slate-500 text-[9.5px] font-mono"
                    >
                      {xt}
                    </text>
                  </g>
                ))}

                {[0, 10, 50, 100, 200, 300, 500].map((yt) => (
                  <g key={`y8b-${yt}`}>
                    <line
                      x1={padL}
                      y1={yScale8b(yt)}
                      x2={padL + plotW}
                      y2={yScale8b(yt)}
                      stroke="#e2e8f0"
                      strokeDasharray="2,2"
                    />
                    <text
                      x={padL - 6}
                      y={yScale8b(yt) + 3}
                      textAnchor="end"
                      className="fill-slate-500 text-[9.5px] font-mono"
                    >
                      {yt}
                    </text>
                  </g>
                ))}

                {depthQubitsData.points.map((pt) => {
                  const isActive = activeFocusCode === pt.code;
                  const fxMin = xScale8b(pt.faoDepthMin);
                  const fyMin = yScale8b(pt.faoQubitsMin);
                  const sxMin = xScale8b(pt.spiderDepthMin);
                  const syMin = yScale8b(pt.spiderQubitsMin);

                  const fxMax = xScale8b(pt.faoDepthMax);
                  const fyMax = yScale8b(pt.faoQubitsMax);
                  const sxMax = xScale8b(pt.spiderDepthMax);
                  const syMax = yScale8b(pt.spiderQubitsMax);

                  return (
                    <g
                      key={pt.code}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredCode(pt.code)}
                      onMouseLeave={() => setHoveredCode(null)}
                      onClick={() => onSelectCode(pt.code)}
                    >
                      {/* Connecting lines FaO -> SpiderCSS */}
                      <line
                        x1={fxMin}
                        y1={fyMin}
                        x2={sxMin}
                        y2={syMin}
                        stroke={isActive ? '#059669' : '#94a3b8'}
                        strokeWidth={isActive ? 2 : 1.1}
                        strokeOpacity={isActive ? 0.95 : 0.45}
                      />
                      <line
                        x1={fxMax}
                        y1={fyMax}
                        x2={sxMax}
                        y2={syMax}
                        stroke={isActive ? '#059669' : '#94a3b8'}
                        strokeWidth={isActive ? 2 : 1.1}
                        strokeOpacity={isActive ? 0.95 : 0.45}
                      />

                      {/* Triangles: Depth-optimizing */}
                      <polygon
                        points={`${fxMin},${fyMin - 4.5} ${fxMin - 4},${
                          fyMin + 3.5
                        } ${fxMin + 4},${fyMin + 3.5}`}
                        fill="#0d9488"
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                      <polygon
                        points={`${sxMin},${syMin - 4.5} ${sxMin - 4},${
                          syMin + 3.5
                        } ${sxMin + 4},${syMin + 3.5}`}
                        fill="#ea580c"
                        stroke="#ffffff"
                        strokeWidth={1}
                      />

                      {/* Squares: Footprint-optimizing */}
                      <rect
                        x={fxMax - 3.8}
                        y={fyMax - 3.8}
                        width={7.6}
                        height={7.6}
                        fill="#0d9488"
                        stroke="#ffffff"
                        strokeWidth={1}
                      />
                      <rect
                        x={sxMax - 3.8}
                        y={syMax - 3.8}
                        width={7.6}
                        height={7.6}
                        fill="#ea580c"
                        stroke="#ffffff"
                        strokeWidth={1}
                      />

                      {(isActive ||
                        pt.code === '49_1_7' ||
                        pt.code === '49_1_5' ||
                        pt.code === '47_1_11') && (
                        <text
                          x={sxMax + 6}
                          y={syMax - 4}
                          className={`text-[9.5px] font-mono ${
                            isActive
                              ? 'fill-emerald-900 font-bold'
                              : 'fill-slate-700'
                          }`}
                        >
                          {pt.label}
                        </text>
                      )}
                    </g>
                  );
                })}

                {/* Axis Titles */}
                <text
                  x={padL + plotW / 2}
                  y={fig1H - 6}
                  textAnchor="middle"
                  className="fill-slate-700 text-[11px] font-semibold"
                >
                  Circuit Depth (√-scale)
                </text>
                <text
                  x={14}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  transform={`rotate(-90, 14, ${padT + plotH / 2})`}
                  className="fill-slate-700 text-[11px] font-semibold"
                >
                  Simultaneous Qubits (√-scale)
                </text>
              </svg>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-600 inline-block" />
                SpiderCSS
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block" />
                Flag at Origin (FaO)
              </span>
              <span className="inline-flex items-center gap-1">
                <strong>▲</strong> Depth-optimizing reuse
              </span>
              <span className="inline-flex items-center gap-1">
                <strong>■</strong> Footprint-optimizing reuse
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
