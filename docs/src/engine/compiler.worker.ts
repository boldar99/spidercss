import type {
  BasisType,
  BinaryMatrix,
  ReuseTargetType,
  RowOptimizationResult,
  RoutingHeuristicType,
} from './types';
import { rowOptimizeMatrix } from './optimizeParityMatrix';
import { catAtOrigin } from './qubitReuse';

export type CompilerWorkerRequest =
  | {
      type: 'OPTIMIZE_MATRIX';
      requestId: string;
      M: BinaryMatrix;
      t: number;
      maxBasisTries: number;
      seed?: number;
    }
  | {
      type: 'COMPILE_CIRCUIT';
      requestId: string;
      H: BinaryMatrix;
      d: number;
      basis: BasisType;
      analyzeHookErrors: boolean;
      reuseTarget: ReuseTargetType;
      routingHeuristic: RoutingHeuristicType;
      seed?: number;
    };

export type CompilerWorkerResponse =
  | {
      type: 'OPTIMIZE_MATRIX_RESULT';
      requestId: string;
      result: RowOptimizationResult;
    }
  | {
      type: 'COMPILE_CIRCUIT_RESULT';
      requestId: string;
      result: ReturnType<typeof catAtOrigin>;
    }
  | {
      type: 'ERROR';
      requestId: string;
      message: string;
    };

self.onmessage = (event: MessageEvent<CompilerWorkerRequest>) => {
  const msg = event.data;
  try {
    if (msg.type === 'OPTIMIZE_MATRIX') {
      const result = rowOptimizeMatrix(
        msg.M,
        msg.t,
        msg.maxBasisTries,
        msg.seed ?? 42
      );
      const response: CompilerWorkerResponse = {
        type: 'OPTIMIZE_MATRIX_RESULT',
        requestId: msg.requestId,
        result,
      };
      self.postMessage(response);
    } else if (msg.type === 'COMPILE_CIRCUIT') {
      const result = catAtOrigin({
        H: msg.H,
        d: msg.d,
        basis: msg.basis,
        analyzeHookErrors: msg.analyzeHookErrors,
        reuseTarget: msg.reuseTarget,
        routingHeuristic: msg.routingHeuristic,
        seed: msg.seed ?? 42,
      });
      const response: CompilerWorkerResponse = {
        type: 'COMPILE_CIRCUIT_RESULT',
        requestId: msg.requestId,
        result,
      };
      self.postMessage(response);
    }
  } catch (err) {
    const response: CompilerWorkerResponse = {
      type: 'ERROR',
      requestId: msg.requestId,
      message: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
