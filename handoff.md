# Joint ZX extraction, scheduling, and qubit reuse handoff

## Purpose

This repository implements the state-preparation construction described in
`/Users/boldi/PycharmProjects/spiderstate-paper/spiderstate.tex`.

The work summarized here replaces the former sequence

1. choose a CAT-state edge-routing heuristic;
2. inject qubit-reuse edges using an independent reuse strategy;
3. schedule the resulting operation DAG;

with one fixed joint-resource extraction path.  The new path coordinates
external-leg matching, an absolute ZX-node order, operation ordering, and
physical-qubit allocation.  It also exposes explicit resource targets for
minimum qubits, minimum depth, and a width-heavy compromise between them.

The original motivation was that independently selected routing and reuse
heuristics produced inconsistent winners.  A locally good choice in the first
stage could remove the freedom needed by the second stage, so combinations of
heuristics behaved almost randomly across codes.

## Experimental result motivating the current direction

The joint-resource path beat Flag at Origin for `49_1_5` in the reported run:

- logical error rate: `3.9168e-05`;
- acceptance rate: `0.6099`;
- physical CNOTs: `60`;
- simultaneous qubits: `87`;
- flags: `105`;
- CNOT depth: `114`;
- expected circuit volume: `16260`.

This was one of the two triorthogonal codes for which the earlier pipeline was
worse than Flag at Origin.  No final `95_1_7` result had been reported at the
time of this handoff.

## Theoretical model

### 1. Separate precedence from resources

Let `D = (V, A)` be the extraction dependency DAG and let

```text
pi: V -> {0, ..., |V|-1}
```

be an absolute topological order.  DAG arcs express causal precedence, but not
every causal arc represents a live qubit.  The resource model therefore uses
separate unit-weight intervals:

- a directed tree arc `(u, v)` is live on `[pi(u), pi(v))`;
- a non-tree flag edge `{u, v}` is live on
  `[min(pi(u), pi(v)), max(pi(u), pi(v)))`;
- an output node `u` is live on `[pi(u), |V|)`.

For a cut after position `t`, define `L_pi(t)` as the number of resource
intervals crossing that cut.  Then

```text
W(pi) = max_t L_pi(t)
```

is the peak number of simultaneously live logical resources.  The active
lifetime volume is

```text
A(pi) = sum_t L_pi(t).
```

An important subtlety is that a `missing_link` dependency arc has zero
resource weight, but the physical flag initialized at one endpoint and
measured at the other is a distinct unit-weight resource interval.  Assigning
zero weight to both objects undercounts the extracted circuit.

### 2. Absolute order matters

The old extractor consumed topological generations.  Nodes in one generation
were effectively treated as simultaneous even when a finer absolute order
could close one lifetime before opening another.  The extractor now accepts a
complete absolute topological order.  This exposes the ordering freedom needed
to minimize peak live qubits and shorten lifetimes.

### 3. Reuse is interval coloring

After extraction, each logical wire has a lifetime from its first operation to
its measurement.  Output data wires instead live to the common horizon.

For a fixed operation order, assigning physical qubits is interval-graph
coloring.  The left-edge scan is optimal for interval graphs and uses exactly
the maximum number of overlapping intervals.  Consecutive logical intervals
assigned the same color are precisely a measurement-to-reset reuse chain.

This means reuse does not need to be injected as an independent greedy graph
mutation.  It can be derived from the selected order, and its minimum width is
known exactly for that order.

### 4. Width and depth form a Pareto problem

Minimum interval coloring can increase CNOT depth because otherwise unrelated
logical lifetimes are placed on the same physical wire.  Conversely, assigning
every logical lifetime its own physical qubit gives a depth lower bound for the
fixed extracted circuit.

The implementation constructs a deterministic path between these endpoints:

1. start with no physical reuse;
2. obtain the maximum-reuse chains from the minimum interval coloring;
3. score each possible adjacent chain merge by its measured one-link CNOT-depth
   cost and the idle gap between the lifetimes;
4. apply merges in that order;
5. evaluate every prefix directly from its mapped CNOT sequence;
6. remove dominated `(qubits, depth)` points.

Candidate evaluation does not construct Stim circuits.  The compiler applies
the ASAP CNOT-depth recurrence directly to each logical-to-physical mapping,
stores only compact resource metrics, and emits a Stim circuit once for the
selected allocation.  This avoids the severe `stim.Circuit.append` bottleneck
that previously appeared on large depth-target instances.

This is a polynomial heuristic for producing a useful reuse frontier.  It is
not an enumeration of every possible interval coloring.

### 5. Resource targets

The fixed pipeline exposes `ReuseTarget` rather than a routing-heuristic
selector:

- `qubits`: minimum physical qubits first, then CNOT depth.  This is the
  original joint-resource behavior and remains the default for LER
  reproducibility.
- `depth`: minimum measured CNOT depth first, then the greatest amount of reuse
  available at that same depth.
- `balanced`: choose from the measured frontier using 75% normalized qubit
  width and 25% normalized CNOT depth.

For a complete measured frontier, the balanced comparison is equivalent to

```text
3 * normalized_qubits + normalized_depth.
```

The common-denominator integer form is used in code, avoiding floating-point
tie instability.  The 75/25 choice reflects the requirement that simultaneous
qubits matter more than depth, while allowing an extra qubit when it buys a
substantial depth reduction.

During external-leg local search there is not yet a complete physical frontier,
so `qubits * dependency_depth` is used as the balanced proxy.  Final physical
allocation always uses emitted-circuit CNOT depth and the normalized frontier.

### 6. Complexity and exact backends

The main joint heuristic is polynomial:

- deterministic critical-path seed matching;
- bounded adjacent-exchange search over logical external-edge order;
- weighted-cut list scheduling over ready ZX nodes;
- operation-level list scheduling;
- interval coloring and a linear-size reuse-frontier path.

Two exact order backends are present:

- a subset/ideal dynamic program for DAGs of at most 22 nodes;
- a CP-SAT model for larger DAGs when OR-Tools is installed.

The CP-SAT model has one all-different position per event, all precedence
constraints, one interval per lifetime, and a cumulative constraint whose
capacity is the peak width.  Its current objective minimizes peak width
lexicographically before active volume.

Exact external-leg matching is still combinatorial.  A globally exact joint
solver would need assignment variables for local ports, conditional precedence
arcs, event positions, and physical resource intervals in one model, or it
would need to enumerate every valid matching and solve the order problem for
each one.

## Implementation overview

### `spidercss/resource_targets.py`

Defines:

- `ReuseTarget.QUBITS`;
- `ReuseTarget.DEPTH`;
- `ReuseTarget.BALANCED`;
- target validation;
- local-search target scores;
- the normalized 75/25 balanced-frontier score.

`ReuseTarget` is re-exported from `spidercss.__init__`.

### `spidercss/zx_resource_scheduling.py`

Implements the weighted-cut resource model on the expanded ZX graph:

- identifies directed tree intervals, undirected live-flag intervals, and
  output-to-horizon intervals;
- computes peak width and active volume for an absolute order;
- provides the polynomial list scheduler;
- provides the small exact dynamic program and CP-SAT order backend.

The depth target prioritizes critical-path height before projected frontier
width.  The qubit and balanced extraction paths retain the width-aware list
schedule; balanced matching is additionally scored by width/depth product.

### `spidercss/joint_extraction_planner.py`

Jointly searches over external-leg matching and absolute ZX order:

- rematches local ports from a logical-edge order;
- materializes the corresponding CNOT edges and cross-CAT precedence arcs;
- rejects cyclic induced DAGs;
- orders the resulting ZX graph;
- scores candidates according to the selected reuse target;
- performs a deterministic, bounded adjacent-swap local search.

The search currently considers at most 64 adjacent exchanges, sampled evenly
for large instances.

### `spidercss/spider_leg_matcher.py`

Legacy selectable routing objectives were removed.  The file now provides only:

- a deterministic critical-path seed order;
- earliest-available local-port assignment for an absolute logical-edge order.

The removed code included the old earliest-start, active-spider,
critical-path-selector, sequence-distance, simulated-annealing, and randomized
tie-breaking paths.

### `spidercss/circuit_extraction.py`

`CatStateExtractor.extract` now accepts `node_order`.  It validates that the
order contains every dependency node exactly once and that every DAG edge is
forward in the supplied order.

### `spidercss/resource_scheduling.py`

Implements operation-level scheduling and physical allocation:

- atomizes Stim operations;
- preserves per-wire and measurement-record dependencies;
- reconstructs detector, observable, and feedback record offsets after
  measurement reordering;
- detects logical lifetimes;
- provides greedy, dynamic-programming, and CP-SAT event ordering;
- performs optimal minimum-width interval coloring;
- constructs the measured reuse frontier for depth and balanced targets
  without emitting candidate Stim circuits;
- emits the selected physical circuit.

`ResourceSchedulePlan` includes:

- `circuit`;
- `logical_to_physical`;
- `peak_qubits`;
- `cnot_depth`;
- `active_volume`;
- `target`;
- order-solver and allocation status;
- `tradeoff_frontier`.

### `spidercss/cat_at_origin.py`

`cat_at_origin` and `row_optimized_cat_at_origin` always use the joint routing
algorithm.  There is no routing-heuristic parameter.  They accept only the
resource objective:

```python
circuit = cat_at_origin(H, d, reuse_target="balanced")
```

The same target is passed into joint matching and absolute ZX ordering.

### `spidercss/css_state.py`

The global and transversal CSS-state preparation APIs forward `reuse_target`
to CAT-at-origin preparation.

### `spidercss/benchmark.py`

The benchmark now has a single joint-resource strategy and accepts
`reuse_targets`.  By default it runs all three targets in the order `qubits`,
`balanced`, `depth`:

```python
stats = benchmark_CAO_state_prep(
    "49_1_5",
    True,
)
```

Pass `reuse_targets="balanced"` or a list/tuple of targets to run a subset.
The code decoder is retained across targets, and every target is generated
from the same deterministic row-basis seed.

Each JSON result records:

- selected reuse target;
- simultaneous qubits and CNOT depth;
- active lifetime volume;
- order-solver status;
- reuse-allocation status;
- the measured nondominated reuse frontier.

The historical result field `"routing_heuristic": "joint_resource"` is kept
only so existing result tables remain readable.

The benchmark also now:

- simulates the parallel CNOT schedule whose depth it reports instead of
  globally serializing every CNOT;
- excludes classical-feedback `CX rec[...] q` operations from physical CNOT
  depth and count;
- correctly counts multiple physical CNOT pairs grouped into one Stim
  instruction.

## Public API examples

### Preserve the current minimum-qubit/LER-oriented behavior

```python
from spidercss import ReuseTarget
from spidercss.cat_at_origin import cat_at_origin
from spidercss.resource_scheduling import plan_resource_aware_reuse

logical_circuit = cat_at_origin(
    H,
    d,
    reuse_target=ReuseTarget.QUBITS,
)
plan = plan_resource_aware_reuse(
    logical_circuit,
    n_data,
    target=ReuseTarget.QUBITS,
)
```

### Find the lowest-depth allocation for the fixed extracted circuit

```python
logical_circuit = cat_at_origin(H, d, reuse_target="depth")
plan = plan_resource_aware_reuse(
    logical_circuit,
    n_data,
    target="depth",
)
```

The selected allocation uses as much reuse as possible without increasing the
minimum depth found on the constructed frontier.

### Select the width-heavy compromise

```python
logical_circuit = cat_at_origin(H, d, reuse_target="balanced")
plan = plan_resource_aware_reuse(
    logical_circuit,
    n_data,
    target="balanced",
)

print(plan.peak_qubits, plan.cnot_depth)
for point in plan.tradeoff_frontier:
    print(point.num_qubits, point.cnot_depth)
```

## Validation

At the time of this handoff:

- all `23` repository tests pass;
- Python compilation succeeds;
- measurement-record remapping is tested with reordered measurements,
  feedback, and detectors;
- interval coloring is checked against weighted-cut width;
- the exact small-DAG dynamic program is checked against the greedy result;
- the public CAT-at-origin API is checked to ensure selectable routing
  heuristics were removed;
- the three reuse targets are tested on a circuit where maximum reuse changes
  `(qubits, depth)` from `(4, 1)` to `(3, 2)`.

An illustrative `49_1_5` structural smoke test with 1,000 row-basis tries and
the greedy operation-order backend produced a frontier spanning approximately

```text
(96 qubits, depth 110) ... (151 qubits, depth 28).
```

The width-heavy balanced target selected `(97, 104)`: one extra qubit bought
six CNOT layers.  These values are diagnostic only and are not directly
comparable to the full 10,000-basis benchmark or its LER results.

## Important limitations

1. **Depth is not globally exact.**  The depth target reaches the no-reuse
   depth lower bound for the fixed extracted circuit and keeps depth-free reuse,
   but external-leg matching remains a bounded local search.
2. **The reuse frontier is a path, not the complete Pareto set.**  It orders
   candidate merges by isolated depth cost and gap, then evaluates prefixes.
   A different subset of merges may contain additional nondominated points.
3. **The balanced weight is empirical.**  The 75/25 normalized score is a
   reasonable width-heavy default, not a noise-model-derived optimum.
4. **LER is not an optimizer objective.**  Width, depth, and active volume are
   structural proxies.  Flag placement, error propagation, and acceptance rate
   can make two structurally similar circuits have different LER.
5. **CP-SAT may return `FEASIBLE`.**  A time-limited result is not a proof of
   optimality.  Solver status is recorded in every benchmark result.
6. **OR-Tools is optional at runtime.**  It is declared as a project dependency,
   but when it is unavailable large instances explicitly fall back to the
   polynomial heuristic.  Small instances use the exact ideal-DP oracle.

## Reproducibility

Circuit construction now uses one stable, code-derived signed 32-bit seed for
Python, NumPy, and CP-SAT.  The row-basis search receives its own local NumPy
random state, so unrelated random draws cannot perturb it.  Both exact CP-SAT
ordering backends use one worker, disable randomized search, and stop on a
deterministic-time budget instead of a wall-clock budget.  This last change is
important: a wall-clock cutoff could return different `FEASIBLE` incumbents on
two runs even when Python and NumPy had identical seeds.  The seed is recorded
as `circuit_seed` in each benchmark JSON result.

The argument is still named `max_time_seconds` for API compatibility, but for
the CP-SAT backends its value is now used as a deterministic-time limit.  It is
therefore a reproducible work budget, not a strict wall-clock deadline.

## Recommended next work

1. Run all three targets for `49_1_5` and `95_1_7` with identical row basis,
   hook analysis, noise model, sample count, and random seed.
2. Plot LER, acceptance rate, and expected circuit volume against every
   recorded `(qubits, depth)` frontier point.
3. Calibrate the balanced weight from those results instead of assuming 75/25.
4. Improve the frontier builder from a single merge-prefix path to a small beam
   search over merge subsets.  This should recover more nondominated points
   without exponential enumeration.
5. Rerank a small structural Pareto set using inexpensive low-shot LER
   estimates, then spend the full simulation budget only on the finalists.
6. If exactness is required for small codes, enumerate all valid port matchings
   and solve each induced ordering problem with the ideal-DP/CP-SAT backend.
7. For a fully integrated exact formulation, add conditional port-assignment
   and reuse variables to CP-SAT rather than optimizing a fixed matching first.

## Repository hygiene

Simulation outputs under `spidercss/simulation_results/` are user-generated
experimental data and were intentionally left untouched.  Do not delete or
rewrite them while continuing implementation work.
