import { atom } from 'nanostores';
import qeccsIndexRaw from '../generated/qeccsIndex.json';
import type {
  BasisType,
  BinaryMatrix,
  CostBreakdown,
  CSSValidationResult,
  LogicalEdge,
  QeccPreset,
  ReuseTargetType,
  RowOptimizationResult,
  RoutingHeuristicType,
  RrefTrialSnapshot,
} from '../engine/types';
import { cloneMatrix, SeededRng } from '../engine/gf2';
import {
  getActiveMatricesForBasis,
  validateCSSCode,
} from '../engine/cssState';
import {
  detailedCostBreakdown,
  hasUniqueOnesProperty,
  performSingleRrefTrial,
  rowOptimizeMatrix,
} from '../engine/optimizeParityMatrix';

export const QECC_PRESETS: QeccPreset[] = qeccsIndexRaw as unknown as QeccPreset[];

export type StudioMode = 'walkthrough' | 'gui';
export type PostPhase2Branch = 'rewrites' | 'pipeline';
export type RrefWalkthroughStage = 1 | 2 | 3 | 4;

export interface CompilerStoreState {
  mode: StudioMode;
  selectedPresetId: string; // e.g. 'FAO/7_1_3' or 'custom'
  basis: BasisType; // 'Z' (|0̄⟩) or 'X' (|+̄⟩)
  H_x: BinaryMatrix;
  H_z: BinaryMatrix;
  d: number;
  validation: CSSValidationResult;

  // Phase 2: RREF & Basis Optimization
  activeInputMatrix: BinaryMatrix;
  initialCost: CostBreakdown;
  rrefSnapshot: RrefTrialSnapshot;
  bestMatrix: BinaryMatrix;
  rrefWalkthroughStage: RrefWalkthroughStage;
  rrefRowOpStepIndex: number;
  permutationSeed: number;
  maxBasisTries: number;
  costHistory: number[];
  isOptimizingBasis: boolean;

  // Post-Phase 2 Branch
  postPhase2Branch: PostPhase2Branch;
  rewriteStage: 1 | 2 | 3;

  // Phase 3: Algorithm 1 & Hook Errors
  analyzeHookErrors: boolean;
  routingHeuristic: RoutingHeuristicType;
  customEdgeOrder: LogicalEdge[] | undefined;
  alg1StepIndex: number;

  // Phase 4: Extraction & 3-Way Qubit Reuse
  extractionMorphStage: 'a' | 'b' | 'c' | 'd';
  reuseTarget: ReuseTargetType;
}

function buildPhase2StateForCode(
  H_x: BinaryMatrix,
  H_z: BinaryMatrix,
  d: number,
  basis: BasisType
): {
  validation: CSSValidationResult;
  activeInputMatrix: BinaryMatrix;
  initialCost: CostBreakdown;
  rrefSnapshot: RrefTrialSnapshot;
  bestMatrix: BinaryMatrix;
  costHistory: number[];
} {
  const validation = validateCSSCode(H_x, H_z, d);
  const { activeM } = getActiveMatricesForBasis(H_x, H_z, basis);
  const cols = activeM[0]?.length ?? 0;
  const identityPerm = Array.from({ length: cols }, (_, i) => i);

  const identityTrial = performSingleRrefTrial(
    activeM,
    validation.t,
    identityPerm,
    true
  );

  const initialCost = hasUniqueOnesProperty(activeM)
    ? detailedCostBreakdown(activeM, validation.t)
    : identityTrial.cost;

  // If the input matrix already has the unique-ones property and lower or equal cost,
  // still provide identityTrial for the 4-stage RREF inspector while keeping bestMatrix
  const bestMatrix = identityTrial.unpermutedMatrix;

  return {
    validation,
    activeInputMatrix: activeM,
    initialCost,
    rrefSnapshot: identityTrial,
    bestMatrix,
    costHistory: [identityTrial.cost.totalCnots],
  };
}

const defaultPreset =
  QECC_PRESETS.find((p) => p.id === 'FAO/7_1_3') ?? QECC_PRESETS[0];

const initialPhase2 = buildPhase2StateForCode(
  defaultPreset.H_x,
  defaultPreset.H_z,
  defaultPreset.d,
  'Z'
);

export const $compilerStore = atom<CompilerStoreState>({
  mode: 'walkthrough',
  selectedPresetId: defaultPreset.id,
  basis: 'Z',
  H_x: cloneMatrix(defaultPreset.H_x),
  H_z: cloneMatrix(defaultPreset.H_z),
  d: defaultPreset.d,
  ...initialPhase2,
  rrefWalkthroughStage: 4,
  rrefRowOpStepIndex: initialPhase2.rrefSnapshot.rowOpSteps.length,
  permutationSeed: 101,
  maxBasisTries: 100,
  isOptimizingBasis: false,
  postPhase2Branch: 'pipeline',
  rewriteStage: 1,
  analyzeHookErrors: false,
  routingHeuristic: 'sa_sequence_distance',
  customEdgeOrder: undefined,
  alg1StepIndex: 0,
  extractionMorphStage: 'd',
  reuseTarget: 'qubits',
});

export function setStudioMode(mode: StudioMode): void {
  const cur = $compilerStore.get();
  $compilerStore.set({ ...cur, mode });
}

export function selectPreset(presetId: string): void {
  const preset = QECC_PRESETS.find((p) => p.id === presetId);
  if (!preset) return;
  const cur = $compilerStore.get();
  const H_x = cloneMatrix(preset.H_x);
  const H_z = cloneMatrix(preset.H_z);
  const d = preset.d;
  const phase2 = buildPhase2StateForCode(H_x, H_z, d, cur.basis);

  $compilerStore.set({
    ...cur,
    selectedPresetId: preset.id,
    H_x,
    H_z,
    d,
    ...phase2,
    rrefWalkthroughStage: 4,
    rrefRowOpStepIndex: phase2.rrefSnapshot.rowOpSteps.length,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

export function setTargetBasis(basis: BasisType): void {
  const cur = $compilerStore.get();
  if (cur.basis === basis) return;
  const phase2 = buildPhase2StateForCode(cur.H_x, cur.H_z, cur.d, basis);
  $compilerStore.set({
    ...cur,
    basis,
    ...phase2,
    rrefWalkthroughStage: 4,
    rrefRowOpStepIndex: phase2.rrefSnapshot.rowOpSteps.length,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

export function setCodeDistance(d: number): void {
  const cur = $compilerStore.get();
  const safeD = Math.max(1, Math.min(31, Math.round(d) || 1));
  const phase2 = buildPhase2StateForCode(
    cur.H_x,
    cur.H_z,
    safeD,
    cur.basis
  );
  $compilerStore.set({
    ...cur,
    d: safeD,
    ...phase2,
    rrefWalkthroughStage: 4,
    rrefRowOpStepIndex: phase2.rrefSnapshot.rowOpSteps.length,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

export function updateCustomMatrices(
  H_x: BinaryMatrix,
  H_z: BinaryMatrix,
  markCustom = true
): void {
  const cur = $compilerStore.get();
  const nextHx = cloneMatrix(H_x);
  const nextHz = cloneMatrix(H_z);
  const phase2 = buildPhase2StateForCode(nextHx, nextHz, cur.d, cur.basis);
  $compilerStore.set({
    ...cur,
    selectedPresetId: markCustom ? 'custom' : cur.selectedPresetId,
    H_x: nextHx,
    H_z: nextHz,
    ...phase2,
    rrefWalkthroughStage: 4,
    rrefRowOpStepIndex: phase2.rrefSnapshot.rowOpSteps.length,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

/**
 * Walkthrough Step 1: (Re-)Generate a column permutation pi and compute its RREF trial.
 */
export function generateNewPermutationTrial(customPerm?: number[]): void {
  const cur = $compilerStore.get();
  const cols = cur.activeInputMatrix[0]?.length ?? 0;
  if (cols === 0) return;

  let perm: number[];
  const nextSeed = cur.permutationSeed + 1;
  if (customPerm && customPerm.length === cols) {
    perm = [...customPerm];
  } else {
    perm = Array.from({ length: cols }, (_, i) => i);
    const rng = new SeededRng(nextSeed);
    rng.shuffle(perm);
  }

  const snapshot = performSingleRrefTrial(
    cur.activeInputMatrix,
    cur.validation.t,
    perm,
    true
  );

  $compilerStore.set({
    ...cur,
    permutationSeed: nextSeed,
    rrefSnapshot: snapshot,
    bestMatrix: snapshot.unpermutedMatrix,
    rrefWalkthroughStage: 1,
    rrefRowOpStepIndex: snapshot.rowOpSteps.length,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

export function resetPermutationToIdentity(): void {
  const cur = $compilerStore.get();
  const cols = cur.activeInputMatrix[0]?.length ?? 0;
  if (cols === 0) return;
  const identityPerm = Array.from({ length: cols }, (_, i) => i);
  const snapshot = performSingleRrefTrial(
    cur.activeInputMatrix,
    cur.validation.t,
    identityPerm,
    true
  );
  $compilerStore.set({
    ...cur,
    rrefSnapshot: snapshot,
    bestMatrix: snapshot.unpermutedMatrix,
    rrefWalkthroughStage: 4,
    rrefRowOpStepIndex: snapshot.rowOpSteps.length,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

export function setRrefWalkthroughStage(stage: RrefWalkthroughStage): void {
  const cur = $compilerStore.get();
  $compilerStore.set({
    ...cur,
    rrefWalkthroughStage: stage,
    rrefRowOpStepIndex:
      stage === 3
        ? cur.rrefSnapshot.rowOpSteps.length
        : cur.rrefRowOpStepIndex,
  });
}

export function setRrefRowOpStepIndex(index: number): void {
  const cur = $compilerStore.get();
  const maxIdx = cur.rrefSnapshot.rowOpSteps.length;
  const clamped = Math.max(0, Math.min(maxIdx, index));
  $compilerStore.set({
    ...cur,
    rrefWalkthroughStage: 3,
    rrefRowOpStepIndex: clamped,
  });
}

export function setMaxBasisTries(maxBasisTries: number): void {
  const cur = $compilerStore.get();
  const clamped = Math.max(1, Math.min(10000, Math.round(maxBasisTries) || 100));
  $compilerStore.set({ ...cur, maxBasisTries: clamped });
}

export function setOptimizingBasis(isOptimizingBasis: boolean): void {
  const cur = $compilerStore.get();
  $compilerStore.set({ ...cur, isOptimizingBasis });
}

export function applyRowOptimizationResult(result: RowOptimizationResult): void {
  const cur = $compilerStore.get();
  $compilerStore.set({
    ...cur,
    permutationSeed: cur.permutationSeed + 1,
    initialCost: result.initialCost,
    rrefSnapshot: result.bestTrial,
    bestMatrix: result.bestMatrix,
    costHistory: result.costHistory,
    rrefWalkthroughStage: 4,
    rrefRowOpStepIndex: result.bestTrial.rowOpSteps.length,
    isOptimizingBasis: false,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

export function runBasisOptimizationSync(
  maxTries?: number,
  seed?: number
): RowOptimizationResult {
  const cur = $compilerStore.get();
  const tries = maxTries ?? cur.maxBasisTries;
  const useSeed = seed ?? cur.permutationSeed + 1;
  const result = rowOptimizeMatrix(
    cur.activeInputMatrix,
    cur.validation.t,
    tries,
    useSeed
  );
  applyRowOptimizationResult(result);
  return result;
}

export function setPostPhase2Branch(postPhase2Branch: PostPhase2Branch): void {
  const cur = $compilerStore.get();
  $compilerStore.set({ ...cur, postPhase2Branch });
}

export function setRewriteStage(rewriteStage: 1 | 2 | 3): void {
  const cur = $compilerStore.get();
  $compilerStore.set({ ...cur, rewriteStage });
}

export function setAnalyzeHookErrors(analyzeHookErrors: boolean): void {
  const cur = $compilerStore.get();
  $compilerStore.set({
    ...cur,
    analyzeHookErrors,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

export function setRoutingHeuristic(
  routingHeuristic: RoutingHeuristicType
): void {
  const cur = $compilerStore.get();
  $compilerStore.set({
    ...cur,
    routingHeuristic,
    customEdgeOrder: undefined,
    alg1StepIndex: 0,
  });
}

export function setCustomEdgeOrder(
  customEdgeOrder: LogicalEdge[] | undefined
): void {
  const cur = $compilerStore.get();
  $compilerStore.set({ ...cur, customEdgeOrder });
}

export function setAlg1StepIndex(alg1StepIndex: number): void {
  const cur = $compilerStore.get();
  $compilerStore.set({ ...cur, alg1StepIndex: Math.max(0, alg1StepIndex) });
}

export function setExtractionMorphStage(
  extractionMorphStage: 'a' | 'b' | 'c' | 'd'
): void {
  const cur = $compilerStore.get();
  $compilerStore.set({ ...cur, extractionMorphStage });
}

export function setReuseTarget(reuseTarget: ReuseTargetType): void {
  const cur = $compilerStore.get();
  $compilerStore.set({ ...cur, reuseTarget });
}
