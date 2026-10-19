import type { BinaryMatrix, StabilizerSplitCharacterization } from './types';
import {
  multiplyGF2,
  multiplyVecMatrixGF2,
  nChooseK,
  nullSpaceGF2,
  rrefGF2,
  solveLinearSystemGF2,
  transposeGF2,
  zerosMatrix,
} from './gf2';
import { isPerfectCode } from './cssState';
import { findPivotsInMatrix } from './optimizeParityMatrix';

/**
 * Computes the dual parity matrix [I | A^T] from an RREF-like matrix M with unique ones.
 * Matches `get_conj_M(M)` in `spidercss/utils.py`.
 */
export function getConjM(M: BinaryMatrix): BinaryMatrix {
  const rows = M.length;
  const cols = rows > 0 ? M[0].length : 0;
  const conjM = zerosMatrix(Math.max(0, cols - rows), cols);
  const { pivots } = findPivotsInMatrix(M);

  const indices: number[] = [];
  for (let r = 0; r < rows; r++) {
    if (pivots[r] !== undefined) {
      indices.push(pivots[r]);
    }
  }
  const indicesSet = new Set(indices);

  let stabI = 0;
  for (let col = 0; col < cols; col++) {
    if (indicesSet.has(col)) continue;
    const s: number[] = [col];
    for (let row = 0; row < rows; row++) {
      if (M[row][col] === 1 && indices[row] !== undefined) {
        s.push(indices[row]);
      }
    }
    s.sort((a, b) => a - b);
    for (const pos of s) {
      conjM[stabI][pos] = 1;
    }
    stabI++;
  }

  return conjM;
}

function getAllCombinations(arr: number[], r: number): number[][] {
  if (r === 0) return [[]];
  if (r > arr.length) return [];
  const result: number[][] = [];
  function helper(start: number, current: number[]) {
    if (current.length === r) {
      result.push([...current]);
      return;
    }
    for (let i = start; i <= arr.length - (r - current.length); i++) {
      current.push(arr[i]);
      helper(i + 1, current);
      current.pop();
    }
  }
  helper(0, []);
  return result;
}

/**
 * Generates the exact set of safe splits in polynomial scaling time using
 * affine coset geometry (V_0 + R) on the sub-support G.
 * Matches `generate_safe_splits_poly(support, M_prep)` in `spidercss/hook_errors.py`.
 */
export function generateSafeSplitsPoly(
  support: number[],
  M_prep: BinaryMatrix
): number[][] {
  const n = M_prep[0]?.length ?? 0;
  const supportSet = new Set(support);
  const I: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!supportSet.has(i)) I.push(i);
  }
  const G = [...support];

  if (I.length === 0) {
    const allSplits: number[][] = [];
    for (let r = 0; r <= G.length; r++) {
      allSplits.push(...getAllCombinations(G, r));
    }
    return allSplits;
  }

  const M_I = M_prep.map((row) => I.map((colIdx) => row[colIdx]));
  const M_G = M_prep.map((row) => G.map((colIdx) => row[colIdx]));

  const nullBasisI = nullSpaceGF2(transposeGF2(M_I));
  let V_basis: BinaryMatrix = [];
  if (nullBasisI.length > 0) {
    const rawV = multiplyGF2(nullBasisI, M_G);
    const { rref, rank } = rrefGF2(rawV, false);
    V_basis = rref.slice(0, rank);
  }

  const R: number[][] = [new Array<number>(G.length).fill(0)];
  for (let i = 0; i < G.length; i++) {
    const e = new Array<number>(G.length).fill(0);
    e[i] = 1;
    R.push(e);
  }

  const M_I_T = transposeGF2(M_I);
  for (let q = 0; q < I.length; q++) {
    const e_q_I = new Array<number>(I.length).fill(0);
    e_q_I[q] = 1;
    const xPart = solveLinearSystemGF2(M_I_T, e_q_I);
    if (xPart !== null) {
      const baseSolG = multiplyVecMatrixGF2(xPart, M_G);
      R.push(baseSolG);
    }
  }

  let V_0: number[][] = [new Array<number>(G.length).fill(0)];
  for (const row of V_basis) {
    // Guard against combinatorial blowup if V_basis has very high dimension
    if (V_0.length >= 4096) break;
    const nextV0: number[][] = [];
    for (const v of V_0) {
      nextV0.push(v);
      nextV0.push(v.map((val, idx) => (val ^ row[idx]) & 1));
    }
    V_0 = nextV0;
  }

  const seen = new Set<string>();
  const safeSplits: number[][] = [];
  for (const r of R) {
    for (const v of V_0) {
      const split: number[] = [];
      for (let i = 0; i < G.length; i++) {
        if (((r[i] ^ v[i]) & 1) === 1) {
          split.push(G[i]);
        }
      }
      split.sort((a, b) => a - b);
      const key = split.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        safeSplits.push(split);
      }
    }
  }

  return safeSplits;
}

function comparePartitionsDesc(a: number[], b: number[]): number {
  const minA = Math.min(...a);
  const minB = Math.min(...b);
  if (minA !== minB) return minB - minA;
  if (a.length !== b.length) return a.length - b.length; // -len(p) descending -> smaller length first
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return b[i] - a[i];
  }
  return 0;
}

/**
 * Evaluates all stabilizers in Mz_prep and classifies their optimal safe partition shapes.
 * Matches `characterize_stabilizer_splits(Mz_prep)` in `spidercss/hook_errors.py`.
 */
export function characterizeStabilizerSplits(
  Mz_prep: BinaryMatrix
): Map<string, StabilizerSplitCharacterization> {
  const results = new Map<string, StabilizerSplitCharacterization>();
  const nQubits = Mz_prep[0]?.length ?? 0;

  for (const gen of Mz_prep) {
    const support: number[] = [];
    for (let i = 0; i < gen.length; i++) {
      if (gen[i] === 1) support.push(i);
    }
    const N = support.length;
    if (N < 4) continue;

    const supportKey = support.join(',');
    const supportSet = new Set(support);
    const I: number[] = [];
    for (let i = 0; i < nQubits; i++) {
      if (!supportSet.has(i)) I.push(i);
    }

    if (I.length === 0) {
      function getAllParts(
        n: number,
        currentPrefix: number,
        currentPartition: number[]
      ): number[][] {
        if (currentPrefix === n) return [currentPartition];
        const res: number[][] = [];
        for (let size = 2; size <= n - currentPrefix; size++) {
          res.push(
            ...getAllParts(n, currentPrefix + size, [...currentPartition, size])
          );
        }
        return res;
      }
      const univ = getAllParts(N, 0, []).filter((p) => p.length > 1);
      univ.sort(comparePartitionsDesc);
      if (univ.length > 0) {
        results.set(supportKey, {
          support,
          universal: univ,
          partial: [],
          splitsBySize: {},
        });
      }
      continue;
    }

    const safeSplits = generateSafeSplitsPoly(support, Mz_prep);
    const splitsBySize: Record<number, number[][]> = {};
    for (const s of safeSplits) {
      const L = s.length;
      if (L >= 2 && L <= N - 2) {
        if (!splitsBySize[L]) splitsBySize[L] = [];
        splitsBySize[L].push(s);
      }
    }

    const universalSizes = new Set<number>();
    for (const [sizeStr, splits] of Object.entries(splitsBySize)) {
      const L = Number(sizeStr);
      splits.sort((a, b) => {
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
          if (a[i] !== b[i]) return a[i] - b[i];
        }
        return a.length - b.length;
      });
      if (splits.length === nChooseK(N, L)) {
        universalSizes.add(L);
      }
    }

    function getPartitionsFromSizes(
      n: number,
      currentPrefix: number,
      currentPartition: number[],
      validSizes: Set<number>
    ): number[][] {
      if (currentPrefix === n) return [currentPartition];
      const res: number[][] = [];
      for (let size = 2; size <= n - currentPrefix; size++) {
        const nextPrefix = currentPrefix + size;
        if (validSizes.has(nextPrefix) || nextPrefix === n) {
          res.push(
            ...getPartitionsFromSizes(
              n,
              nextPrefix,
              [...currentPartition, size],
              validSizes
            )
          );
        }
      }
      return res;
    }

    const univParts = getPartitionsFromSizes(N, 0, [], universalSizes);
    const nonTrivialUniv = univParts.filter((p) => p.length > 1);
    nonTrivialUniv.sort(comparePartitionsDesc);

    const memo = new Map<string, number[][]>();
    const sizeKeys = Object.keys(splitsBySize)
      .map(Number)
      .sort((a, b) => a - b);

    function isSubset(sub: number[], sup: number[]): boolean {
      const supSet = new Set(sup);
      return sub.every((x) => supSet.has(x));
    }

    function dfs(currentSplit: number[], currentSize: number): number[][] {
      if (currentSize === N) return [[]];
      const key = currentSplit.join(',');
      const cached = memo.get(key);
      if (cached) return cached;

      const validSuffixes: number[][] = [];
      if (N - currentSize >= 2) {
        validSuffixes.push([N - currentSize]);
      }

      for (const L of sizeKeys) {
        if (L - currentSize >= 2) {
          for (const nextSplit of splitsBySize[L]) {
            if (isSubset(currentSplit, nextSplit)) {
              const suffixes = dfs(nextSplit, L);
              for (const suf of suffixes) {
                validSuffixes.push([L - currentSize, ...suf]);
              }
            }
          }
        }
      }

      const uniqueSuf: number[][] = [];
      const seen = new Set<string>();
      for (const suf of validSuffixes) {
        const k = suf.join(',');
        if (!seen.has(k)) {
          seen.add(k);
          uniqueSuf.push(suf);
        }
      }
      memo.set(key, uniqueSuf);
      return uniqueSuf;
    }

    const existParts = dfs([], 0);
    const univKeySet = new Set(nonTrivialUniv.map((p) => p.join(',')));
    const nonTrivialExist = existParts.filter(
      (p) => p.length > 1 && !univKeySet.has(p.join(','))
    );
    nonTrivialExist.sort(comparePartitionsDesc);

    if (nonTrivialUniv.length > 0 || nonTrivialExist.length > 0) {
      results.set(supportKey, {
        support,
        universal: nonTrivialUniv,
        partial: nonTrivialExist,
        splitsBySize,
      });
    }
  }

  return results;
}

/**
 * Reconstructs an exact valid chain of subsets for a partially safe partition shape.
 * Matches `get_exact_partial_splits` in `spidercss/hook_errors.py`.
 */
export function getExactPartialSplits(
  support: number[],
  shape: number[],
  splitsBySize: Record<number, number[][]>,
  requiredLastElement?: number
): number[][] | null {
  const N = support.length;
  const prefixSizes: number[] = [];
  let current = 0;
  for (let i = 0; i < shape.length - 1; i++) {
    current += shape[i];
    prefixSizes.push(current);
  }
  prefixSizes.push(N);

  function backtrack(
    prefixIdx: number,
    currentSplit: Set<number>
  ): number[][][] {
    if (prefixIdx === prefixSizes.length) return [[]];
    const L = prefixSizes[prefixIdx];
    if (L === N) {
      const rem = support.filter((x) => !currentSplit.has(x)).sort((a, b) => a - b);
      return [[rem]];
    }

    const validChains: number[][][] = [];
    for (const nextSplitArr of splitsBySize[L] ?? []) {
      const nextSplitSet = new Set(nextSplitArr);
      let isSub = true;
      for (const item of currentSplit) {
        if (!nextSplitSet.has(item)) {
          isSub = false;
          break;
        }
      }
      if (isSub) {
        const chunk = nextSplitArr
          .filter((x) => !currentSplit.has(x))
          .sort((a, b) => a - b);
        const suffixes = backtrack(prefixIdx + 1, nextSplitSet);
        for (const suf of suffixes) {
          validChains.push([chunk, ...suf]);
        }
      }
    }
    return validChains;
  }

  const chains = backtrack(0, new Set());
  if (requiredLastElement !== undefined) {
    const validChains = chains.filter((chain) =>
      chain[chain.length - 1].includes(requiredLastElement)
    );
    return validChains.length > 0 ? validChains[0] : null;
  }
  return chains.length > 0 ? chains[0] : null;
}

/**
 * Computes X-spider splits and chunk sizes for `cat_at_origin`.
 * Matches lines 44-84 of `spidercss/cat_at_origin.py`.
 */
export function computeXSpiderSplits(
  H: BinaryMatrix,
  d: number,
  analyzeHookErrors: boolean
): {
  xSplits: number[][][];
  xSpiders: number[][];
  zSpiders: number[];
  isPerfect: boolean;
  hookResults: Map<string, StabilizerSplitCharacterization>;
} {
  const { nonPivots } = findPivotsInMatrix(H);
  const isPerfect = isPerfectCode(H, d);
  const shouldAnalyze = analyzeHookErrors && !isPerfect;

  const M_prep = getConjM(H);
  const hookResults = shouldAnalyze
    ? characterizeStabilizerSplits(M_prep)
    : new Map<string, StabilizerSplitCharacterization>();

  const xSplits: number[][][] = [];
  for (let j = 0; j < nonPivots.length; j++) {
    const p = nonPivots[j];
    const supp: number[] = [];
    for (let col = 0; col < (M_prep[j]?.length ?? 0); col++) {
      if (M_prep[j][col] === 1) supp.push(col);
    }
    const suppKey = supp.join(',');
    const charResult = hookResults.get(suppKey);

    if (shouldAnalyze && charResult) {
      if (charResult.universal.length > 0) {
        const shape = charResult.universal[0];
        const suppList = supp.filter((q) => q !== p);
        const part: number[][] = [];
        let cursor = 0;
        for (let k = 0; k < shape.length - 1; k++) {
          const chunkSize = shape[k];
          const chunk = suppList
            .slice(cursor, cursor + chunkSize)
            .sort((a, b) => a - b);
          part.push(chunk);
          cursor += chunkSize;
        }
        const lastChunk = [...suppList.slice(cursor), p].sort((a, b) => a - b);
        part.push(lastChunk);
        xSplits.push(part);
      } else if (charResult.partial.length > 0) {
        const shape = charResult.partial[0];
        const exactChain = getExactPartialSplits(
          supp,
          shape,
          charResult.splitsBySize,
          p
        );
        if (exactChain) {
          xSplits.push(exactChain);
        } else {
          xSplits.push([[...supp].sort((a, b) => a - b)]);
        }
      } else {
        xSplits.push([[...supp].sort((a, b) => a - b)]);
      }
    } else {
      xSplits.push([[...supp].sort((a, b) => a - b)]);
    }
  }

  const xSpiders = xSplits.map((part) => part.map((chunk) => chunk.length));
  const zSpiders = H.map((row) => row.reduce((acc, v) => acc + v, 0));

  return {
    xSplits,
    xSpiders,
    zSpiders,
    isPerfect,
    hookResults,
  };
}
