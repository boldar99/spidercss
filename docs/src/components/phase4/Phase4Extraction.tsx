import React, { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { Layers, Zap, Cpu, Minimize2 } from 'lucide-react';
import {
  $compilerStore,
  setExtractionMorphStage,
  setReuseTarget,
} from '../../stores/compilerStore';
import type { ReuseTargetType } from '../../engine/types';
import { compileFromGlobalPipeline } from '../../engine/qubitReuse';
import type { GlobalPipelineSetup } from '../../engine/spiderLegMatcher';
import { GridZxMorphCanvas } from './GridZxMorphCanvas';
import { QuantumCircuitSvg } from './QuantumCircuitSvg';
import { CircuitExportBox } from './CircuitExportBox';

interface Phase4ExtractionProps {
  pipeline: GlobalPipelineSetup;
}

export const Phase4Extraction: React.FC<Phase4ExtractionProps> = ({
  pipeline,
}) => {
  const state = useStore($compilerStore);
  const {
    selectedPresetId,
    basis,
    validation,
    extractionMorphStage,
    reuseTarget,
  } = state;

  // Precompute all 3 Qubit Reuse variants for instant switching & side-by-side comparison
  const reuseVariants = useMemo(() => {
    const none = compileFromGlobalPipeline(pipeline, 'None');
    const depth = compileFromGlobalPipeline(pipeline, 'depth');
    const qubits = compileFromGlobalPipeline(pipeline, 'qubits');
    return {
      None: none,
      depth,
      qubits,
    };
  }, [pipeline]);

  const activeCompiled =
    reuseTarget === 'None'
      ? reuseVariants.None
      : reuseTarget === 'depth'
      ? reuseVariants.depth
      : reuseVariants.qubits;

  const baselineQubits = reuseVariants.None.numQubits;
  const savedQubits = Math.max(0, baselineQubits - activeCompiled.numQubits);

  const reuseOptions: Array<{
    target: ReuseTargetType;
    numberLabel: string;
    title: string;
    subtitle: string;
    icon: React.ReactNode;
    metrics: typeof activeCompiled;
  }> = [
    {
      target: 'None',
      numberLabel: '1',
      title: 'No Qubit Reuse',
      subtitle: 'Dedicated ancilla wire per flag tree (reuseTarget = None)',
      icon: <Layers className="w-4 h-4" />,
      metrics: reuseVariants.None,
    },
    {
      target: 'depth',
      numberLabel: '2',
      title: 'Optimize Depth',
      subtitle: 'Greedy wire recycling preserving circuit depth (naive_reuse)',
      icon: <Zap className="w-4 h-4" />,
      metrics: reuseVariants.depth,
    },
    {
      target: 'qubits',
      numberLabel: '3',
      title: 'Minimize Simultaneous Qubits',
      subtitle: 'Causal cone decrossing + interval coloring (decross_greedy)',
      icon: <Minimize2 className="w-4 h-4" />,
      metrics: reuseVariants.qubits,
    },
  ];

  const codeLabel =
    selectedPresetId === 'custom'
      ? `${validation.n}_${validation.k}_${validation.d}`
      : selectedPresetId.split('/').pop() ?? 'code';

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-2xs space-y-5">
      {/* Phase 4 Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Phase 4 • Circuit Extraction &amp; Qubit Reuse
            </span>
            <h3 className="text-lg font-bold text-slate-900">
              Topological Grid Alignment &amp; Post-Extraction Qubit Reuse
            </h3>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Because <code className="font-mono">D_global</code> is guaranteed acyclic and every port satisfies Lemma III.7 or Lemma III.8, <code className="font-mono">CatStateExtractor</code> extracts a CNOT circuit in linear time, followed by interval-coloring qubit reuse.
          </p>
        </div>

        {/* High-level summary badge */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 font-mono text-xs text-emerald-950 font-semibold flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-emerald-700" />
            <span>
              {activeCompiled.numQubits} Qubits ({savedQubits > 0 ? `−${savedQubits} via reuse` : 'no reuse'})
            </span>
            <span>•</span>
            <span>{activeCompiled.numCx} CX</span>
            <span>•</span>
            <span>Depth {activeCompiled.cnotDepth}</span>
          </div>
        </div>
      </div>

      {/* 1. 3-Stage Extraction Morph Canvas (Matching Paper Figure 7) */}
      <GridZxMorphCanvas
        pipeline={pipeline}
        basis={basis}
        stage={extractionMorphStage}
        onSelectStage={(s) => setExtractionMorphStage(s)}
      />

      {/* 2. 3-Way Qubit Reuse Selector Bar */}
      <div className="rounded-xl border-2 border-emerald-600/25 bg-gradient-to-r from-emerald-50/60 via-white to-slate-50 p-4 space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-emerald-800">
              Post-Extraction Qubit Reuse Mode
            </span>
            <h4 className="text-sm font-bold text-slate-900">
              Select Qubit Reuse Strategy (Switch Dynamically Above Circuit)
            </h4>
          </div>
          <span className="text-xs text-slate-600 font-mono">
            Ancilla merges:{' '}
            <strong className="text-emerald-800">
              {baselineQubits - activeCompiled.numQubits} flag wires recycled
            </strong>
          </span>
        </div>

        {/* 3 Prominent Qubit Reuse Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {reuseOptions.map((opt) => {
            const isSelected = reuseTarget === opt.target;
            return (
              <button
                key={opt.target}
                type="button"
                onClick={() => setReuseTarget(opt.target)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  isSelected
                    ? 'bg-emerald-900 text-white border-emerald-900 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/30'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                      <span
                        className={`w-5 h-5 rounded-md font-mono text-[11px] inline-flex items-center justify-center font-bold ${
                          isSelected
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {opt.numberLabel}
                      </span>
                      {opt.title}
                    </span>
                    {opt.icon}
                  </div>
                  <p
                    className={`text-[11px] mt-1 ${
                      isSelected ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    {opt.subtitle}
                  </p>
                </div>

                <div
                  className={`pt-2 border-t flex items-center justify-between font-mono text-[11px] font-bold ${
                    isSelected
                      ? 'border-emerald-700/80 text-emerald-200'
                      : 'border-slate-100 text-slate-700'
                  }`}
                >
                  <span>{opt.metrics.numQubits} Sim. Qubits</span>
                  <span>•</span>
                  <span>CX Depth {opt.metrics.cnotDepth}</span>
                  <span>•</span>
                  <span>Vol {opt.metrics.activeVolume}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Live Metric Badges Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-1">
          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              Simultaneous Qubits
            </div>
            <div className="text-base font-bold font-mono text-emerald-800">
              {activeCompiled.numQubits}
              <span className="text-[11px] font-normal text-slate-500 ml-1">
                ({activeCompiled.numDataQubits}d +{' '}
                {activeCompiled.numQubits - activeCompiled.numDataQubits}a)
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              Data Qubits (n)
            </div>
            <div className="text-base font-bold font-mono text-slate-900">
              {activeCompiled.numDataQubits}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              Flag Measurements
            </div>
            <div className="text-base font-bold font-mono text-amber-800">
              {activeCompiled.numFlagMeasurements}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              CNOT Count
            </div>
            <div className="text-base font-bold font-mono text-slate-900">
              {activeCompiled.numCx}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              CNOT Depth
            </div>
            <div className="text-base font-bold font-mono text-indigo-800">
              {activeCompiled.cnotDepth}
            </div>
          </div>

          <div className="rounded-lg bg-white border border-slate-200 px-3 py-2">
            <div className="text-[10px] font-mono uppercase text-slate-500">
              Total Circuit Depth
            </div>
            <div className="text-base font-bold font-mono text-slate-900">
              {activeCompiled.circuitDepth}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Interactive Quantum Circuit Diagram */}
      <QuantumCircuitSvg compiled={activeCompiled} />

      {/* 4. Export Box (.stim & .qasm) */}
      <CircuitExportBox compiled={activeCompiled} codeName={codeLabel} />
    </div>
  );
};
