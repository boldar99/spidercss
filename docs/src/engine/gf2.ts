import type { BinaryMatrix, RrefRowOpStep } from './types';

/**
 * Deterministic PRNG (Mulberry32) so randomized basis search and SA heuristics
 * are reproducible across runs and tests.
 */
export class SeededRng {
  private state: number;

  constructor(seed = 42) {
    this.state = seed >>> 0;
  }

  nextFloat(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}

export function cloneMatrix(M: BinaryMatrix): BinaryMatrix {
  return M.map((row) => row.map((v) => v & 1));
}

export function zerosMatrix(rows: number, cols: number): BinaryMatrix {
  return Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
}

export function transposeGF2(M: BinaryMatrix): BinaryMatrix {
  if (M.length === 0) return [];
  const rows = M.length;
  const cols = M[0].length;
  const T = zerosMatrix(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      T[j][i] = M[i][j] & 1;
    }
  }
  return T;
}

export function multiplyGF2(A: BinaryMatrix, B: BinaryMatrix): BinaryMatrix {
  const m = A.length;
  if (m === 0) return [];
  const k = A[0].length;
  const n = B[0]?.length ?? 0;
  const C = zerosMatrix(m, n);
  for (let i = 0; i < m; i++) {
    for (let p = 0; p < k; p++) {
      if ((A[i][p] & 1) === 0) continue;
      for (let j = 0; j < n; j++) {
        C[i][j] ^= B[p][j] & 1;
      }
    }
  }
  return C;
}

export function multiplyVecMatrixGF2(vec: number[], M: BinaryMatrix): number[] {
  const rows = M.length;
  if (rows === 0) return [];
  const cols = M[0].length;
  const out = new Array<number>(cols).fill(0);
  for (let i = 0; i < rows; i++) {
    if ((vec[i] & 1) === 0) continue;
    for (let j = 0; j < cols; j++) {
      out[j] ^= M[i][j] & 1;
    }
  }
  return out;
}

/**
 * Gauss-Jordan Reduced Row Echelon Form (RREF) over GF(2).
 * Matches `galois.GF(2)(M).row_reduce()`.
 */
export function rrefGF2(
  M: BinaryMatrix,
  recordSteps = false
): {
  rref: BinaryMatrix;
  rank: number;
  pivotCols: number[];
  steps: RrefRowOpStep[];
} {
  const A = cloneMatrix(M);
  const rows = A.length;
  const cols = rows > 0 ? A[0].length : 0;
  const pivotCols: number[] = [];
  const steps: RrefRowOpStep[] = [];

  let pivotRow = 0;
  for (let col = 0; col < cols && pivotRow < rows; col++) {
    let sel = -1;
    for (let r = pivotRow; r < rows; r++) {
      if (A[r][col] === 1) {
        sel = r;
        break;
      }
    }
    if (sel === -1) continue;

    if (sel !== pivotRow) {
      const tmp = A[pivotRow];
      A[pivotRow] = A[sel];
      A[sel] = tmp;
      if (recordSteps) {
        steps.push({
          stepIndex: steps.length,
          pivotRow,
          pivotCol: col,
          targetRow: sel,
          description: `Swap R_${pivotRow} <-> R_${sel} for pivot in column ${col}`,
          matrixAfter: cloneMatrix(A),
        });
      }
    }

    for (let r = 0; r < rows; r++) {
      if (r !== pivotRow && A[r][col] === 1) {
        for (let c = col; c < cols; c++) {
          A[r][c] ^= A[pivotRow][c];
        }
        if (recordSteps) {
          steps.push({
            stepIndex: steps.length,
            pivotRow,
            pivotCol: col,
            targetRow: r,
            description: `R_${r} <- R_${r} XOR R_${pivotRow} (clear col ${col})`,
            matrixAfter: cloneMatrix(A),
          });
        }
      }
    }

    pivotCols.push(col);
    pivotRow++;
  }

  return {
    rref: A,
    rank: pivotCols.length,
    pivotCols,
    steps,
  };
}

export function rankGF2(M: BinaryMatrix): number {
  return rrefGF2(M, false).rank;
}

/**
 * Computes a basis for the right null space { x in GF(2)^cols : M * x = 0 } in RREF.
 * Matches `galois.GF(2)(M).null_space()`.
 */
export function nullSpaceGF2(M: BinaryMatrix): BinaryMatrix {
  if (M.length === 0) return [];
  const cols = M[0].length;
  const { rref, pivotCols } = rrefGF2(M, false);
  const pivotSet = new Set(pivotCols);
  const freeCols: number[] = [];
  for (let c = 0; c < cols; c++) {
    if (!pivotSet.has(c)) freeCols.push(c);
  }

  const basis: BinaryMatrix = [];
  for (const freeCol of freeCols) {
    const vec = new Array<number>(cols).fill(0);
    vec[freeCol] = 1;
    for (let r = 0; r < pivotCols.length; r++) {
      const pCol = pivotCols[r];
      if (rref[r][freeCol] === 1) {
        vec[pCol] = 1;
      }
    }
    basis.push(vec);
  }

  if (basis.length === 0) return [];
  const { rref: reducedBasis, rank } = rrefGF2(basis, false);
  return reducedBasis.slice(0, rank);
}

/**
 * Solves A * x = b over GF(2) using augmented RREF.
 * Matches lines 54-69 of `spidercss/hook_errors.py`.
 */
export function solveLinearSystemGF2(
  A: BinaryMatrix,
  b: number[]
): number[] | null {
  const rows = A.length;
  const cols = rows > 0 ? A[0].length : 0;
  const aug: BinaryMatrix = A.map((row, i) => [...row, b[i] & 1]);
  const { rref } = rrefGF2(aug, false);

  for (let i = 0; i < rows; i++) {
    let rowNonZero = false;
    for (let j = 0; j < cols; j++) {
      if (rref[i][j] !== 0) {
        rowNonZero = true;
        break;
      }
    }
    if (!rowNonZero && rref[i][cols] !== 0) {
      return null; // Inconsistent system
    }
  }

  const x = new Array<number>(cols).fill(0);
  for (let i = 0; i < rows; i++) {
    let firstNonZero = -1;
    for (let j = 0; j < cols; j++) {
      if (rref[i][j] !== 0) {
        firstNonZero = j;
        break;
      }
    }
    if (firstNonZero !== -1) {
      x[firstNonZero] = rref[i][cols];
    }
  }
  return x;
}

export function nChooseK(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const m = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= m; i++) {
    res = Math.round((res * (n - m + i)) / i);
  }
  return res;
}
