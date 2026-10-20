import type { BasisType, BinaryMatrix, CSSValidationResult } from './types';
import { cloneMatrix, multiplyGF2, nChooseK, rankGF2, transposeGF2 } from './gf2';

/**
 * Determines if a parity-check matrix H with distance d defines a classical
 * perfect code over GF(2). Matches `is_perfect_code` in `spidercss/utils.py`.
 */
export function isPerfectCode(H: BinaryMatrix, d: number): boolean {
  if (!Number.isInteger(d) || d < 1 || d % 2 === 0) {
    return false;
  }
  const m = H.length;
  if (m === 0) return false;
  const n = H[0].length;
  const t = Math.floor((d - 1) / 2);

  let sphereVolume = 0;
  for (let j = 0; j <= t; j++) {
    sphereVolume += nChooseK(n, j);
  }
  // Check 2^m === sphereVolume (safe up to m <= 52)
  if (m > 50 || sphereVolume !== Math.pow(2, m)) {
    return false;
  }
  return rankGF2(H) === m;
}

/**
 * Validates H_x and H_z parity-check matrices and computes CSS code parameters.
 * Matches `CSSState._validate_css_code` in `spidercss/css_state.py`.
 */
export function validateCSSCode(
  H_x: BinaryMatrix,
  H_z: BinaryMatrix,
  d = 3,
  basis: BasisType = 'Z'
): CSSValidationResult {
  const errors: string[] = [];
  const anticommutingPairs: Array<[number, number]> = [];

  if (H_x.length === 0 || H_z.length === 0) {
    return {
      valid: false,
      n: 0,
      k: 0,
      d,
      t: Math.floor(d / 2),
      rankHx: 0,
      rankHz: 0,
      isPerfect: false,
      errors: ['Both H_x and H_z must have at least one stabilizer row.'],
      anticommutingPairs,
    };
  }

  const n = H_x[0].length;
  if (n === 0) {
    errors.push('Number of physical qubits n must be >= 1.');
  }

  for (let i = 0; i < H_x.length; i++) {
    if (H_x[i].length !== n) {
      errors.push(`H_x row ${i} has length ${H_x[i].length}, expected ${n}.`);
    }
  }
  for (let j = 0; j < H_z.length; j++) {
    if (H_z[j].length !== n) {
      errors.push(`H_z row ${j} has length ${H_z[j].length}, expected ${n}.`);
    }
  }

  if (errors.length === 0) {
    const product = multiplyGF2(H_x, transposeGF2(H_z));
    for (let i = 0; i < product.length; i++) {
      for (let j = 0; j < product[i].length; j++) {
        if (product[i][j] !== 0) {
          anticommutingPairs.push([i, j]);
        }
      }
    }
    if (anticommutingPairs.length > 0) {
      const sample = anticommutingPairs
        .slice(0, 4)
        .map(([rx, rz]) => `(X_${rx}, Z_${rz})`)
        .join(', ');
      errors.push(
        `Invalid CSS code: H_x and H_z do not commute over GF(2) at pairs ${sample}${
          anticommutingPairs.length > 4 ? '...' : ''
        }.`
      );
    }
  }

  const rankHx = errors.length === 0 ? rankGF2(H_x) : 0;
  const rankHz = errors.length === 0 ? rankGF2(H_z) : 0;
  const k = Math.max(0, n - rankHx - rankHz);
  const t = Math.max(0, Math.floor(d / 2));
  const activeMatrix = basis === 'X' ? H_z : H_x;
  const isPerfect = errors.length === 0 && isPerfectCode(activeMatrix, d);

  return {
    valid: errors.length === 0,
    n,
    k,
    d,
    t,
    rankHx,
    rankHz,
    isPerfect,
    errors,
    anticommutingPairs,
  };
}

/**
 * Converts H_x and H_z binary matrices into human-readable Pauli strings
 * (e.g. "IIIXXXX", "IIZZIZZ").
 */
export function matricesToPauliStrings(
  H_x: BinaryMatrix,
  H_z: BinaryMatrix
): { xStrings: string[]; zStrings: string[]; combinedText: string } {
  const xStrings = H_x.map((row) =>
    row.map((bit) => (bit === 1 ? 'X' : 'I')).join('')
  );
  const zStrings = H_z.map((row) =>
    row.map((bit) => (bit === 1 ? 'Z' : 'I')).join('')
  );
  return {
    xStrings,
    zStrings,
    combinedText: [...xStrings, ...zStrings].join('\n'),
  };
}

/**
 * Parses a block of Pauli strings (containing I, X, Z) into H_x and H_z binary matrices.
 * Pure X strings become rows of H_x; pure Z strings become rows of H_z.
 */
export function parsePauliStrings(text: string): {
  H_x: BinaryMatrix;
  H_z: BinaryMatrix;
  error?: string;
} {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase().replace(/\s+/g, ''))
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (lines.length === 0) {
    return { H_x: [], H_z: [], error: 'Enter at least one X and one Z Pauli string.' };
  }

  const n = lines[0].length;
  const H_x: BinaryMatrix = [];
  const H_z: BinaryMatrix = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length !== n) {
      return {
        H_x: [],
        H_z: [],
        error: `Line ${i + 1} has length ${line.length}, but line 1 has length ${n}.`,
      };
    }
    if (!/^[IXZ]+$/.test(line)) {
      return {
        H_x: [],
        H_z: [],
        error: `Line ${i + 1} contains invalid characters (only I, X, Z allowed).`,
      };
    }
    const hasX = line.includes('X');
    const hasZ = line.includes('Z');
    if (hasX && hasZ) {
      return {
        H_x: [],
        H_z: [],
        error: `Line ${i + 1} mixes X and Z in the same generator (CSS generators must be purely X-type or Z-type).`,
      };
    }
    if (hasX) {
      H_x.push(Array.from(line, (ch) => (ch === 'X' ? 1 : 0)));
    } else if (hasZ) {
      H_z.push(Array.from(line, (ch) => (ch === 'Z' ? 1 : 0)));
    }
  }

  return { H_x, H_z };
}

/**
 * Returns the active parity matrix M to optimize for the given target logical state basis:
 * - For |0̄⟩ (basis = 'Z'), we optimize H_x (and H_dual = H_z).
 * - For |+̄⟩ (basis = 'X'), we optimize H_z (and H_dual = H_x).
 * Matches `CSSState.__init__` in `spidercss/css_state.py`.
 */
export function getActiveMatricesForBasis(
  H_x: BinaryMatrix,
  H_z: BinaryMatrix,
  basis: BasisType
): { activeM: BinaryMatrix; dualM: BinaryMatrix } {
  if (basis === 'X') {
    return {
      activeM: cloneMatrix(H_z),
      dualM: cloneMatrix(H_x),
    };
  }
  return {
    activeM: cloneMatrix(H_x),
    dualM: cloneMatrix(H_z),
  };
}
