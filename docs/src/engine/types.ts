export type BasisType = 'Z' | 'X';

export type ReuseTargetType = 'None' | 'depth' | 'qubits' | 'balanced';

export type RoutingHeuristicType =
  | 'critical_path_first'
  | 'earliest_start_first'
  | 'active_spider_first'
  | 'sa_sequence_distance'
  | 'joint_resource'
  | 'joint_resource_earliest_start_first'
  | 'random';

export type BinaryMatrix = number[][];

export interface QeccPreset {
  id: string;
  codeId: string;
  category: 'FAO' | 'MQT' | 'misc';
  full_name: string;
  abbr_name: string;
  n: number;
  k: number;
  d: number;
  is_self_dual: boolean;
  H_x: BinaryMatrix;
  H_z: BinaryMatrix;
  L_x: BinaryMatrix;
  L_z: BinaryMatrix;
}

export interface CSSValidationResult {
  valid: boolean;
  n: number;
  k: number;
  d: number;
  t: number;
  rankHx: number;
  rankHz: number;
  isPerfect: boolean;
  errors: string[];
  anticommutingPairs: Array<[number, number]>;
}

export interface RrefRowOpStep {
  stepIndex: number;
  pivotRow: number;
  pivotCol: number;
  targetRow: number;
  description: string;
  matrixAfter: BinaryMatrix;
}

export interface CostBreakdown {
  totalCnots: number;
  totalFlags: number;
  rowTreeCnots: number;
  rowFlagCnots: number;
  colFlagCnots: number;
  rowWeights: number[];
  colWeights: number[];
  rowFlagsPerSpider: number[];
  colFlagsPerSpider: number[];
}

export interface RrefTrialSnapshot {
  permutation: number[];
  inversePermutation: number[];
  permutedMatrix: BinaryMatrix;
  rrefPermutedMatrix: BinaryMatrix;
  rowOpSteps: RrefRowOpStep[];
  unpermutedMatrix: BinaryMatrix;
  pivots: Record<number, number>; // row -> pivot column
  nonPivots: number[];
  cost: CostBreakdown;
}

export interface RowOptimizationResult {
  initialCost: CostBreakdown;
  bestCost: CostBreakdown;
  bestMatrix: BinaryMatrix;
  bestTrial: RrefTrialSnapshot;
  costHistory: number[];
}

export interface GraphNodeData {
  id: number;
  is_mark?: boolean;
  is_flag?: boolean;
  is_root?: boolean;
  spider_type?: BasisType;
  chunk_idx?: number;
  original_edge?: [number, number];
  compKind?: 'Z' | 'X';
  compIndex?: number;
  localId?: number;
}

export interface GraphEdgeData {
  source: number;
  target: number;
  edge_type?: 'tree' | 'missing_link' | 'cnot';
}

export interface UndirectedGraph {
  nodes: Map<number, GraphNodeData>;
  adj: Map<number, Map<number, GraphEdgeData>>;
}

export interface DirectedGraph {
  nodes: Map<number, GraphNodeData>;
  outEdges: Map<number, Map<number, GraphEdgeData>>;
  inEdges: Map<number, Map<number, GraphEdgeData>>;
}

export interface WellOrderedCatState {
  n: number;
  t: number;
  G: UndirectedGraph;
  F: UndirectedGraph;
  roots: Record<number, number>;
  D: DirectedGraph;
  edge: number; // main_node / exit node
}

export interface StabilizerSplitCharacterization {
  support: number[];
  universal: number[][];
  partial: number[][];
  splitsBySize: Record<number, number[][]>;
}

export type LogicalEdge = [number, number]; // [z_index, x_index]
export type MatchedPortPair = [number, number]; // [z_local_node, x_local_node]
export type MatchedEdge = [LogicalEdge, MatchedPortPair];

export interface Algorithm1StepSnapshot {
  stepIndex: number;
  logicalEdge: LogicalEdge;
  zSpiderIndex: number;
  xSpiderIndex: number;
  xColumnIndex: number;
  zLocalNode: number;
  xLocalNode: number;
  zGlobalNode: number;
  xGlobalNode: number;
  zParentGlobalNodes: number[];
  xParentGlobalNodes: number[];
  addedGraphEdge: [number, number];
  addedDagEdges: Array<{
    source: number;
    target: number;
    fromSide: 'Z' | 'X';
  }>;
  dagGenerations: number[][];
  dagDepth: number;
}

export interface StimTarget {
  type: 'qubit' | 'rec';
  value: number;
}

export interface StimInstruction {
  name: string;
  targets: StimTarget[];
  args: number[];
}

export interface LogicalLifetime {
  logicalQubit: number;
  birthNode: number;
  deathNode: number | null;
}

export interface ReuseTradeoffPoint {
  numQubits: number;
  cnotDepth: number;
  numReuseMerges: number;
}

export interface CompiledCircuitResult {
  instructions: StimInstruction[];
  stimText: string;
  qasmText: string;
  numQubits: number;
  numDataQubits: number;
  numFlagMeasurements: number;
  numCx: number;
  cnotDepth: number;
  circuitDepth: number;
  activeVolume: number;
  reuseTarget: ReuseTargetType;
  logicalToPhysical: Record<number, number>;
  lifetimes: LogicalLifetime[];
  tradeoffFrontier: ReuseTradeoffPoint[];
}
