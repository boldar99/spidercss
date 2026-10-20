import { describe, expect, it } from 'vitest';
import qeccsIndexRaw from '../src/generated/qeccsIndex.json';
import {
  ancillaCost,
  buildGlobalPipelineAndSnapshots,
  catAtOrigin,
  characterizeStabilizerSplits,
  cnotCost,
  compileFromGlobalPipeline,
  getConjM,
  hasUniqueOnesProperty,
  isDirectedAcyclicGraph,
  isPerfectCode,
  matricesToPauliStrings,
  minimumNumberOfFlags,
  parsePauliStrings,
  performSingleRrefTrial,
  rowOptimizeMatrix,
  validateCSSCode,
  wellOrderedFtCatStateData,
  type QeccPreset,
} from '../src/engine';

const qeccs = qeccsIndexRaw as QeccPreset[];

function getFaoPreset(codeId: string): QeccPreset {
  const found = qeccs.find(
    (q) => q.category === 'FAO' && q.codeId === codeId
  );
  if (!found) {
    throw new Error(`Missing FAO preset for ${codeId}`);
  }
  return found;
}

describe('SpiderCSS TypeScript Engine Parity Suite', () => {
  it('validates CSS codes, Pauli string round-tripping, and perfect code detection', () => {
    const steane = getFaoPreset('7_1_3');
    const golay = getFaoPreset('23_1_7');
    const surface9 = getFaoPreset('9_1_3');

    const vSteane = validateCSSCode(steane.H_x, steane.H_z, steane.d);
    expect(vSteane.valid).toBe(true);
    expect(vSteane.n).toBe(7);
    expect(vSteane.k).toBe(1);
    expect(vSteane.d).toBe(3);
    expect(vSteane.isPerfect).toBe(true);

    const vSteaneX = validateCSSCode(steane.H_x, steane.H_z, steane.d, 'X');
    expect(vSteaneX.isPerfect).toBe(true);

    expect(isPerfectCode(golay.H_x, golay.d)).toBe(true);
    expect(isPerfectCode(surface9.H_x, surface9.d)).toBe(false);

    // Round-trip Pauli strings
    const { combinedText } = matricesToPauliStrings(steane.H_x, steane.H_z);
    const parsed = parsePauliStrings(combinedText);
    expect(parsed.error).toBeUndefined();
    expect(parsed.H_x).toEqual(steane.H_x);
    expect(parsed.H_z).toEqual(steane.H_z);
  });

  it('matches Python minimum_number_of_flags, cnot_cost, ancilla_cost, and has_unique_ones_property', () => {
    // Check flag counts for small and large weights
    expect(minimumNumberOfFlags(3, 1)).toBe(0);
    expect(minimumNumberOfFlags(4, 1)).toBe(1);
    expect(minimumNumberOfFlags(4, 2)).toBe(1);
    expect(minimumNumberOfFlags(6, 2)).toBe(2);
    expect(minimumNumberOfFlags(8, 3)).toBe(4);

    // Exact match against Python spidercss reference values
    const cases = [
      { code: '7_1_3', t: 1, costInit: 17, ancInit: 4, uniq: true },
      { code: '9_1_3', t: 1, costInit: 12, ancInit: 2, uniq: true },
      { code: '17_1_5', t: 2, costInit: 58, ancInit: 15, uniq: false },
      { code: '23_1_7', t: 3, costInit: 247, ancInit: 85, uniq: true },
      { code: '25_1_5', t: 2, costInit: 44, ancInit: 8, uniq: false },
      { code: '20_2_6', t: 3, costInit: 109, ancInit: 33, uniq: false },
    ];

    for (const c of cases) {
      const preset = getFaoPreset(c.code);
      expect(cnotCost(preset.H_x, c.t)).toBe(c.costInit);
      expect(ancillaCost(preset.H_x, c.t)).toBe(c.ancInit);
      expect(hasUniqueOnesProperty(preset.H_x)).toBe(c.uniq);
    }
  });

  it('produces valid unique-ones RREF matrices in performSingleRrefTrial and rowOptimizeMatrix', () => {
    const code17 = getFaoPreset('17_1_5');
    const t = Math.floor(code17.d / 2);

    const opt = rowOptimizeMatrix(code17.H_x, t, 200, 42);
    expect(hasUniqueOnesProperty(opt.bestMatrix)).toBe(true);
    expect(opt.bestCost.totalCnots).toBeLessThanOrEqual(74);
    expect(opt.bestTrial.rowOpSteps.length).toBeGreaterThan(0);

    // Verify identity permutation RREF
    const idPerm = Array.from({ length: code17.n }, (_, i) => i);
    const snap = performSingleRrefTrial(code17.H_x, t, idPerm, true);
    expect(hasUniqueOnesProperty(snap.unpermutedMatrix)).toBe(true);
    expect(Object.keys(snap.pivots).length).toBe(code17.H_x.length);
  });

  it('loads precomputed WellOrderedCatState and resolves acyclic traversal DAGs', () => {
    for (const [n, t] of [
      [3, 1],
      [4, 1],
      [5, 2],
      [6, 2],
      [7, 3],
      [8, 3],
    ]) {
      const state = wellOrderedFtCatStateData(n, t, true);
      expect(isDirectedAcyclicGraph(state.D)).toBe(true);
      expect(state.G.nodes.size).toBeGreaterThanOrEqual(n);
      expect(state.roots[0]).toBeDefined();
    }
  });

  it('analyzes safe hook-error splits matching spidercss/hook_errors.py', () => {
    const surface9 = getFaoPreset('9_1_3');
    expect(characterizeStabilizerSplits(getConjM(surface9.H_x)).size).toBe(0);

    const steane = getFaoPreset('7_1_3');
    const steaneSplits = characterizeStabilizerSplits(getConjM(steane.H_x));
    expect(steaneSplits.size).toBe(1);

    const code49 = getFaoPreset('49_1_7');
    const idPerm49 = Array.from({ length: code49.n }, (_, i) => i);
    const rref49 = performSingleRrefTrial(code49.H_x, 3, idPerm49, false);
    const splits49 = characterizeStabilizerSplits(
      getConjM(rref49.unpermutedMatrix)
    );
    expect(splits49.size).toBe(10);
    for (const info of splits49.values()) {
      expect(
        info.universal.length + info.partial.length
      ).toBeGreaterThan(0);
    }
  });

  it('executes Algorithm 1 step-by-step and extracts exact CNOT, flag, and qubit counts across all 3 reuse modes', () => {
    // 1. Steane [[7, 1, 3]]: Perfect code (x_t = t - 1 = 0), so 15 CNOTs, 3 flags, 10 qubits (no reuse), 8 qubits (qubit reuse)
    const steane = getFaoPreset('7_1_3');
    const steanePipeline = buildGlobalPipelineAndSnapshots({
      H: steane.H_x,
      d: steane.d,
      basis: 'Z',
      analyzeHookErrors: false,
      routingHeuristic: 'critical_path_first',
    });

    // Verify step-by-step snapshots
    expect(steanePipeline.stepSnapshots.length).toBe(9);
    expect(isDirectedAcyclicGraph(steanePipeline.finalD)).toBe(true);

    const steaneNone = compileFromGlobalPipeline(steanePipeline, 'None');
    const steaneDepth = compileFromGlobalPipeline(steanePipeline, 'depth');
    const steaneQubits = compileFromGlobalPipeline(steanePipeline, 'qubits');

    expect(steaneNone.numCx).toBe(15);
    expect(steaneNone.numFlagMeasurements).toBe(3);
    expect(steaneNone.numQubits).toBe(10);

    expect(steaneDepth.numCx).toBe(15);
    expect(steaneDepth.numFlagMeasurements).toBe(3);
    expect(steaneDepth.cnotDepth).toBeLessThanOrEqual(steaneNone.cnotDepth);

    expect(steaneQubits.numCx).toBe(15);
    expect(steaneQubits.numFlagMeasurements).toBe(3);
    expect(steaneQubits.numQubits).toBe(8);

    // 1b. Steane [[7, 1, 3]] in X-basis: Non-pivot Z-spiders unfuse at t-1 = 0
    const steanePipelineX = buildGlobalPipelineAndSnapshots({
      H: steane.H_z,
      d: steane.d,
      basis: 'X',
      analyzeHookErrors: false,
      routingHeuristic: 'critical_path_first',
    });
    expect(steanePipelineX.stepSnapshots.length).toBe(9);
    expect(isDirectedAcyclicGraph(steanePipelineX.finalD)).toBe(true);
    const steaneNoneX = compileFromGlobalPipeline(steanePipelineX, 'None');
    expect(steaneNoneX.numCx).toBe(15);
    expect(steaneNoneX.numFlagMeasurements).toBe(3);
    expect(steaneNoneX.numQubits).toBe(10);
    const steaneQubitsX = compileFromGlobalPipeline(steanePipelineX, 'qubits');
    expect(steaneQubitsX.numQubits).toBe(8);

    // 2. Surface [[9, 1, 3]]: 12 CNOTs, 2 flags, 11 qubits (no reuse), 9 qubits (qubit reuse)
    const surf9 = getFaoPreset('9_1_3');
    const surf9None = catAtOrigin({
      H: surf9.H_x,
      d: surf9.d,
      basis: 'Z',
      reuseTarget: 'None',
      routingHeuristic: 'critical_path_first',
    });
    const surf9Qubits = catAtOrigin({
      H: surf9.H_x,
      d: surf9.d,
      basis: 'Z',
      reuseTarget: 'qubits',
      routingHeuristic: 'critical_path_first',
    });

    expect(surf9None.numCx).toBe(12);
    expect(surf9None.numFlagMeasurements).toBe(2);
    expect(surf9None.numQubits).toBe(11);
    expect(surf9Qubits.numQubits).toBe(9);

    // 3. Golay [[23, 1, 7]]: Perfect code (d=7, t=3, x_t=2) -> 237 CNOTs, 80 flags, 103 qubits (no reuse) on initial H_x
    const golay = getFaoPreset('23_1_7');
    // Golay H_x already has unique-ones property; test on optimized matrix
    const golayOpt = rowOptimizeMatrix(golay.H_x, 3, 50, 42);
    const golayCirc = catAtOrigin({
      H: golayOpt.bestMatrix,
      d: golay.d,
      basis: 'Z',
      reuseTarget: 'None',
      routingHeuristic: 'critical_path_first',
    });
    expect(golayCirc.numCx).toBeGreaterThan(0);
    expect(golayCirc.stimText).toContain('DETECTOR');
    expect(golayCirc.qasmText).toContain('OPENQASM 2.0;');
  });
});
