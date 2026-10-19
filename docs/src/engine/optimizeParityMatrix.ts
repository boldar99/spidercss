import type {
  BinaryMatrix,
  CostBreakdown,
  RowOptimizationResult,
  RrefTrialSnapshot,
} from './types';
import { cloneMatrix, rrefGF2, SeededRng } from './gf2';

/**
 * Matches `density_lower_bound(t)` in `spidercss/optimize_parity_matrix.py`.
 */
export function densityLowerBound(t: number): number {
  if (t <= 1) {
    return Number.POSITIVE_INFINITY;
  }
  const cPlus = Math.ceil((t + 3) / 2);
  const fPlus = Math.floor((t + 3) / 2);
  const cMinus = Math.ceil((t - 3) / 2);
  const fMinus = Math.floor((t - 3) / 2);

  const num = cPlus * fPlus;
  const den = num + cMinus * fPlus + fMinus * cPlus;
  return num / den;
}

/**
 * Matches `minimum_E_and_V(n, t)` in `spidercss/optimize_parity_matrix.py`.
 */
export function minimumEAndV(n: number, t: number): [number, number] {
  const density = densityLowerBound(t);
  const eNec = Math.ceil(n / density);
  const remainder = ((eNec % 3) + 3) % 3;
  const adjustment = (3 - remainder) % 3;
  const eFinal = eNec + adjustment;
  const vFinal = Math.floor((2 * eFinal) / 3);
  return [eFinal, vFinal];
}

/**
 * Matches `minimum_number_of_flags(n, t)` in `spidercss/optimize_parity_matrix.py`.
 */
export function minimumNumberOfFlags(n: number, t: number): number {
  if (n <= 3 || t <= 0) return 0;
  const tAlt = Math.floor(n / 2) - 1;
  const effT = Math.min(t, tAlt);
  if (effT <= 0) return 0;
  const [E, N] = minimumEAndV(n, effT);
  return Math.ceil(E - N + 2) - 1;
}

/**
 * Matches `minimum_number_of_cnots(n, t)` in `spidercss/optimize_parity_matrix.py`.
 */
export function minimumNumberOfCnots(n: number, t: number): number {
  return n - 1 + 2 * minimumNumberOfFlags(n, t);
}

/**
 * Computes the exact CNOT cost (Eq. 8 of paper) and full breakdown by rows & columns.
 * Matches `cnot_cost(M, t)` and `ancilla_cost(M, t)` in `spidercss/optimize_parity_matrix.py`.
 */
export function detailedCostBreakdown(
  M: BinaryMatrix,
  t: number
): CostBreakdown {
  const rows = M.length;
  const cols = rows > 0 ? M[0].length : 0;

  const rowWeights = new Array<number>(rows).fill(0);
  const colWeights = new Array<number>(cols).fill(0);

  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (M[i][j] === 1) {
        rowWeights[i]++;
        colWeights[j]++;
      }
    }
  }

  let rowTreeCnots = 0;
  let rowFlagCnots = 0;
  let colFlagCnots = 0;
  let totalFlags = 0;

  const rowFlagsPerSpider: number[] = [];
  const colFlagsPerSpider: number[] = [];

  for (let j = 0; j < cols; j++) {
    const wCol = colWeights[j];
    const flags = wCol > 1 ? minimumNumberOfFlags(wCol + 1, t) : 0;
    colFlagsPerSpider.push(flags);
    colFlagCnots += 2 * flags;
    totalFlags += flags;
  }

  for (let i = 0; i < rows; i++) {
    const wRow = rowWeights[i];
    const flags = minimumNumberOfFlags(wRow, t);
    rowFlagsPerSpider.push(flags);
    rowTreeCnots += Math.max(0, wRow - 1);
    rowFlagCnots += 2 * flags;
    totalFlags += flags;
  }

  return {
    totalCnots: rowTreeCnots + rowFlagCnots + colFlagCnots,
    totalFlags,
    rowTreeCnots,
    rowFlagCnots,
    colFlagCnots,
    rowWeights,
    colWeights,
    rowFlagsPerSpider,
    colFlagsPerSpider,
  };
}

export function cnotCost(M: BinaryMatrix, t: number): number {
  return detailedCostBreakdown(M, t).totalCnots;
}

export function ancillaCost(M: BinaryMatrix, t: number): number {
  return detailedCostBreakdown(M, t).totalFlags;
}

/**
 * Checks if each row of M has a '1' that is the unique '1' in its column.
 * Matches `has_unique_ones_property(M)` in `spidercss/optimize_parity_matrix.py`.
 */
export function hasUniqueOnesProperty(M: BinaryMatrix): boolean {
  const rows = M.length;
  if (rows === 0) return false;
  const cols = M[0].length;

  const colSums = new Array<number>(cols).fill(0);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (M[i][j] === 1) colSums[j]++;
    }
  }

  const foundRows = new Set<number>();
  for (let j = 0; j < cols; j++) {
    if (colSums[j] === 1) {
      for (let i = 0; i < rows; i++) {
        if (M[i][j] === 1) {
          foundRows.add(i);
          break;
        }
      }
    }
  }
  return foundRows.size === rows;
}

/**
 * Matches `find_pivots_in_matrix(parity_matrix)` in `spidercss/utils.py`.
 */
export function findPivotsInMatrix(M: BinaryMatrix): {
  pivots: Record<number, number>;
  rowsWithoutPivots: number[];
  nonPivots: number[];
} {
  const r = M.length;
  const c = r > 0 ? M[0].length : 0;
  const colSums = new Array<number>(c).fill(0);
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      if (M[i][j] === 1) colSums[j]++;
    }
  }

  const pivots: Record<number, number> = {};
  const rowsWithoutPivots: number[] = [];

  for (let i = 0; i < r; i++) {
    let found = false;
    for (let j = 0; j < c; j++) {
      if (M[i][j] === 1 && colSums[j] === 1) {
        pivots[i] = j;
        found = true;
        break;
      }
    }
    if (!found) {
      rowsWithoutPivots.push(i);
    }
  }

  const pivotColSet = new Set(Object.values(pivots));
  const nonPivots: number[] = [];
  for (let j = 0; j < c; j++) {
    if (!pivotColSet.has(j)) nonPivots.push(j);
  }

  return { pivots, rowsWithoutPivots, nonPivots };
}

/**
 * Executes a single column-permuted RREF trial and captures all 4 walkthrough stages:
 * 1. Permutation pi
 * 2. Permuted matrix M[:, pi]
 * 3. Gaussian elimination RREF(M[:, pi]) with row-op steps
 * 4. Un-permuted matrix RREF(M[:, pi])[:, pi^-1]
 */
export function performSingleRrefTrial(
  M: BinaryMatrix,
  t: number,
  permutation: number[],
  recordSteps = true
): RrefTrialSnapshot {
  const c = permutation.length;
  const permutedMatrix = M.map((row) => permutation.map((colIdx) => row[colIdx]));

  const { rref, rank, steps } = rrefGF2(permutedMatrix, recordSteps);
  const rrefNonZero = rref.slice(0, rank);

  const inversePermutation = new Array<number>(c);
  for (let i = 0; i < c; i++) {
    inversePermutation[permutation[i]] = i;
  }

  const unpermutedMatrix = rrefNonZero.map((row) =>
    inversePermutation.map((permIdx) => row[permIdx])
  );

  const { pivots, nonPivots } = findPivotsInMatrix(unpermutedMatrix);
  const cost = detailedCostBreakdown(unpermutedMatrix, t);

  return {
    permutation: [...permutation],
    inversePermutation,
    permutedMatrix,
    rrefPermutedMatrix: rrefNonZero,
    rowOpSteps: steps,
    unpermutedMatrix,
    pivots,
    nonPivots,
    cost,
  };
}

/**
 * Matches `row_optimize_matrix` in `spidercss/optimize_parity_matrix.py`.
 */
export function rowOptimizeMatrix(
  M: BinaryMatrix,
  t: number,
  maxBasisTries = 500,
  seed = 42
): RowOptimizationResult {
  const c = M[0]?.length ?? 0;
  const rng = new SeededRng(seed);

  const identityPerm = Array.from({ length: c }, (_, i) => i);
  const identityTrial = performSingleRrefTrial(M, t, identityPerm, true);
  const initialCost = hasUniqueOnesProperty(M)
    ? detailedCostBreakdown(M, t)
    : identityTrial.cost;

  let bestMatrix: BinaryMatrix = hasUniqueOnesProperty(M)
    ? cloneMatrix(M)
    : identityTrial.unpermutedMatrix;
  let bestCost: CostBreakdown = hasUniqueOnesProperty(M)
    ? initialCost
    : identityTrial.cost;
  let bestPerm: number[] = [...identityPerm];

  const colsArr = Array.from({ length: c }, (_, i) => i);
  const costHistory: number[] = [initialCost.totalCnots];
  let foundRandomEqualOrBetter = false;

  for (let trial = 0; trial < maxBasisTries; trial++) {
    rng.shuffle(colsArr);
    const permuted = M.map((row) => colsArr.map((colIdx) => row[colIdx]));
    const { rref, rank } = rrefGF2(permuted, false);
    const rrefK = rref.slice(0, rank);

    const invCols = new Array<number>(c);
    for (let i = 0; i < c; i++) {
      invCols[colsArr[i]] = i;
    }

    const mNew = rrefK.map((row) => invCols.map((permIdx) => row[permIdx]));
    const trialCost = detailedCostBreakdown(mNew, t);

    if (
      trialCost.totalCnots < bestCost.totalCnots ||
      (!foundRandomEqualOrBetter &&
        trialCost.totalCnots <= bestCost.totalCnots)
    ) {
      bestCost = trialCost;
      bestMatrix = mNew;
      bestPerm = [...colsArr];
      foundRandomEqualOrBetter = true;
    }
    costHistory.push(bestCost.totalCnots);
  }

  const bestTrial = performSingleRrefTrial(M, t, bestPerm, true);

  return {
    initialCost,
    bestCost,
    bestMatrix,
    bestTrial,
    costHistory,
  };
}
