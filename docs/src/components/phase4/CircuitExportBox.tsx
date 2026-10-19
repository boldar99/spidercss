import React, { useMemo, useState } from 'react';
import { Copy, Check, Download, FileCode2 } from 'lucide-react';
import type { CompiledCircuitResult } from '../../engine/types';
import {
  formatStimCircuit,
  MEASUREMENT_GATES,
  RESET_GATES,
  TWO_QUBIT_GATES,
} from '../../engine/circuitExtraction';

interface CircuitExportBoxProps {
  compiled: CompiledCircuitResult;
  codeName: string;
}

export const CircuitExportBox: React.FC<CircuitExportBoxProps> = ({
  compiled,
  codeName,
}) => {
  const [activeTab, setActiveTab] = useState<'stim' | 'qasm'>('stim');
  const [injectNoise, setInjectNoise] = useState(false);
  const [noiseRate, setNoiseRate] = useState(0.001);
  const [copied, setCopied] = useState(false);

  // Build noisy Stim string on demand when injectNoise is enabled
  const stimDisplayText = useMemo(() => {
    if (!injectNoise) return compiled.stimText;
    const noisyInsts = [];
    for (const inst of compiled.instructions) {
      if (MEASUREMENT_GATES.has(inst.name)) {
        const qTargets = inst.targets.filter((t) => t.type === 'qubit');
        if (qTargets.length > 0) {
          noisyInsts.push({
            name: inst.name === 'MX' ? 'Z_ERROR' : 'X_ERROR',
            targets: qTargets,
            args: [noiseRate],
          });
        }
        noisyInsts.push(inst);
      } else if (RESET_GATES.has(inst.name)) {
        noisyInsts.push(inst);
        const qTargets = inst.targets.filter((t) => t.type === 'qubit');
        if (qTargets.length > 0) {
          noisyInsts.push({
            name: inst.name === 'RX' ? 'Z_ERROR' : 'X_ERROR',
            targets: qTargets,
            args: [noiseRate],
          });
        }
      } else if (TWO_QUBIT_GATES.has(inst.name)) {
        noisyInsts.push(inst);
        const qTargets = inst.targets.filter((t) => t.type === 'qubit');
        if (qTargets.length === inst.targets.length && qTargets.length >= 2) {
          noisyInsts.push({
            name: 'DEPOLARIZE2',
            targets: qTargets,
            args: [noiseRate],
          });
        }
      } else {
        noisyInsts.push(inst);
      }
    }
    return formatStimCircuit(noisyInsts);
  }, [compiled, injectNoise, noiseRate]);

  const activeText =
    activeTab === 'stim' ? stimDisplayText : compiled.qasmText;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    const ext = activeTab === 'stim' ? 'stim' : 'qasm';
    const safeName = codeName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `spidercss_${safeName}_reuse_${compiled.reuseTarget}.${ext}`;
    const blob = new Blob([activeText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const lineCount = activeText.split('\n').length;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-900 text-slate-100 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Format Tabs */}
        <div className="flex items-center gap-2">
          <FileCode2 className="w-4 h-4 text-emerald-400" />
          <div className="inline-flex rounded-lg bg-slate-800 p-0.5 border border-slate-700">
            <button
              type="button"
              onClick={() => setActiveTab('stim')}
              className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
                activeTab === 'stim'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Stim (.stim)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('qasm')}
              className={`px-3 py-1 rounded-md text-xs font-mono font-semibold transition-colors cursor-pointer ${
                activeTab === 'qasm'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              OpenQASM 2.0 (.qasm)
            </button>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {lineCount} lines
          </span>
        </div>

        {/* Noise Model Injector + Copy & Download Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {activeTab === 'stim' && (
            <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700 px-2.5 py-1 rounded-lg text-xs">
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-200 font-medium">
                <input
                  type="checkbox"
                  checked={injectNoise}
                  onChange={(e) => setInjectNoise(e.target.checked)}
                  className="w-3.5 h-3.5 accent-emerald-500 rounded cursor-pointer"
                />
                <span>Inject Depolarizing Noise</span>
              </label>
              {injectNoise && (
                <select
                  value={noiseRate}
                  onChange={(e) => setNoiseRate(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-600 rounded px-1.5 py-0.5 font-mono text-[11px] text-emerald-300 cursor-pointer"
                >
                  <option value={0.0001}>p = 1e-4</option>
                  <option value={0.0005}>p = 5e-4</option>
                  <option value={0.001}>p = 1e-3</option>
                  <option value={0.003}>p = 3e-3</option>
                  <option value={0.005}>p = 5e-3</option>
                </select>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-100 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy Code
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> Download .
            {activeTab === 'stim' ? 'stim' : 'qasm'}
          </button>
        </div>
      </div>

      {/* Code Viewer */}
      <pre className="max-h-64 overflow-y-auto custom-scrollbar rounded-lg bg-slate-950/90 border border-slate-800 p-3.5 font-mono text-xs text-emerald-300 leading-relaxed">
        <code>{activeText}</code>
      </pre>
    </div>
  );
};
