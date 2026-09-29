# Proposal for updating the paper to the new compilation pipeline

## Purpose

This document proposes how
`/Users/boldi/PycharmProjects/spiderstate-paper/spiderstate.tex` should be
revised to match the current SpiderCSS compiler.

The principal change is conceptual.  The old manuscript describes external
edge routing, temporal extraction, qubit-reuse injection, and final CNOT
scheduling as mostly separate decisions.  The implementation now uses a
resource-aware pipeline in which:

1. a deterministic seed matching assigns logical inter-spider edges to local
   CAT-state ports;
2. a bounded local search changes this matching and evaluates the induced
   global dependency DAG;
3. a weighted-cut scheduler chooses an **absolute** topological order of ZX
   nodes;
4. extraction produces a logical circuit from that absolute order;
5. an operation DAG preserves quantum-wire and measurement-record
   dependencies;
6. operation ordering and interval coloring determine safe physical-qubit
   reuse; and
7. the compiler selects a point on a measured qubit--depth tradeoff path.

This is best presented as a **coordinated resource-aware compiler**, rather
than as several independently chosen routing and reuse heuristics.  It is not
yet one globally exact optimization over every matching, order, and physical
allocation variable.  The paper should preserve this distinction.

The main theoretical message should be:

> SpiderCSS admits an end-to-end polynomial-time compilation mode.  Its
> combinatorial choices are handled by deterministic bounded local search and
> list scheduling, while physical-qubit allocation is solved exactly in
> polynomial time once an operation order is fixed.  Optional exponential
> dynamic-programming and CP-SAT backends can improve or certify small
> instances, but they are not required for scalable compilation.

This claim is stronger and more precise than saying that the complete joint
optimization problem is polynomial.  The latter is not established and is
unlikely to be true.

---

## 1. What is obsolete in the current manuscript

The following parts of `spiderstate.tex` no longer describe the implementation.

### 1.1 The four routing heuristics

The subsection **Ordering external edges between spiders** currently lists:

- `earliest_start_first`;
- `active_spider_first`;
- `critical_path_first`; and
- `sa_sequence_distance`.

These choices have been removed from the public CAT-at-origin API.  The
compiler now always uses the joint-resource route.  The four-heuristic list
should be replaced by the deterministic critical-path seed, bounded adjacent
exchange search, and resource-aware absolute ZX ordering described below.

### 1.2 Extraction by topological generations

The subsection **Temporal Circuit Extraction** says that extraction traverses
topological generations.  The extractor now accepts an absolute topological
order.  This is important: two nodes may be incomparable in the DAG but should
not necessarily be treated as simultaneous.  An absolute order can close a
qubit lifetime before another lifetime opens, reducing peak width and active
volume.

Topological generations remain a valid schedule, but they should be described
only as a baseline or earlier implementation.

### 1.3 Independent qubit-reuse injection

The old experimental method selected a routing heuristic, injected reuse
edges using a separate reuse strategy, and then called an exact DAG-to-circuit
scheduler.  That description should be removed.  In the new implementation,
reuse is derived from logical-wire lifetime intervals after ordering.  It is
not an independent graph mutation.

### 1.4 Claims about the evaluated optimizer

The benchmark currently calls the CP-SAT operation-order backend with a fixed
deterministic work budget.  CP-SAT is an anytime exact solver: an `OPTIMAL`
status is a certificate, while `FEASIBLE` is only the best incumbent found
within the budget.  The benchmarked configuration must therefore not be
described as a polynomial-time exact algorithm.

The paper can establish a polynomial-time compiler by specifying the greedy
operation-order backend as the scalable algorithm.  The solver-assisted
benchmark configuration should then be presented separately as an optional
enhancement using the same mathematical model.

---

## 2. Proposed mathematical model

### 2.1 Dependency and resource graphs play different roles

Let

\[
D=(V,A)
\]

be the global extraction dependency DAG.  An arc in \(A\) means that one ZX
node must be processed before another.  It does **not** necessarily represent
a physical qubit.  Let

\[
\pi:V\longrightarrow\{0,\ldots,|V|-1\}
\]

be an absolute topological order, so

\[
(u,v)\in A\implies \pi(u)<\pi(v).
\]

The extracted resources are represented separately:

- every oriented spanning-forest edge \((u,v)\) gives an interval
  \([\pi(u),\pi(v))\);
- every non-tree flag edge \(\{u,v\}\) gives an interval
  \([\min(\pi(u),\pi(v)),\max(\pi(u),\pi(v)))\); and
- every output node \(u\) gives an interval \([\pi(u),|V|)\).

A `missing_link` arc has zero resource weight as a causal arc.  The physical
flag represented by its endpoints is nevertheless a unit resource interval.
This distinction prevents the cut calculation from undercounting flags.

For the cut after position \(t\), let \(L_\pi(t)\) be the number of resource
intervals crossing the cut.  Define

\[
W(\pi)=\max_t L_\pi(t),
\qquad
A(\pi)=\sum_t L_\pi(t).
\]

Here \(W\) is peak simultaneous width and \(A\) is active-qubit volume.  The
latter distinguishes two orders with equal peak width by favoring shorter
lifetimes.

### 2.2 Proposed weighted-cut proposition

The paper should add a proposition of the following form.

> **Proposition (cut characterization of extraction width).**  Fix the
> expanded ZX graph, spanning forest, dependency DAG, and an absolute
> topological extraction order \(\pi\).  Under the SpiderCSS extraction rules,
> the number of live logical qubit resources after processing the first \(t\)
> nodes is \(L_\pi(t)\).  Consequently, the peak logical width of this
> extraction is \(W(\pi)\), and its active-qubit volume is \(A(\pi)\).

The proof is a direct bijection.  A tree resource is born at its parent and
consumed at its child; a flag is born at its first endpoint and measured at its
second; and an output remains live to the horizon.  Each resource is live
exactly when its interval crosses the current cut.

This proposition formalizes the intuition in the original proposal that tree
edges have weight one while causal `missing_link`, `cnot`, and reuse arcs have
weight zero.  The paper should explicitly account for the flag interval
associated with a missing link, rather than assigning zero cost to the
physical flag itself.

### 2.3 Absolute-order optimization

The ideal ZX-order problem is

\[
\min_{\pi\in\operatorname{Top}(D)}
\bigl(W(\pi),A(\pi)\bigr)
\]

in lexicographic order, or a target-dependent scalarization involving depth.
The implementation provides:

- a polynomial weighted-cut list scheduler;
- an exact ideal dynamic program for at most 22 nodes; and
- an optional CP-SAT formulation.

The paper should not assert that minimizing \(W(\pi)\) over all topological
orders is polynomial.  It is closely related to vertex-separation/pathwidth
and precedence-constrained register-allocation problems.  A hardness citation
or a separate reduction would be required for a formal NP-hardness statement.

### 2.4 Operation DAG and logical lifetimes

After ZX extraction, let

\[
D_{\mathrm{op}}=(O,A_{\mathrm{op}})
\]

be the operation DAG.  Its arcs include:

- the original order of operations on every logical qubit; and
- dependencies from every measurement to each detector, observable, or
  classically controlled operation that reads its record.

For a topological order \(\sigma\) of \(D_{\mathrm{op}}\), logical qubit \(q\)
has interval

\[
I_q=[b_q,d_q),
\]

where \(b_q\) is its first operation and \(d_q\) is one position after its
terminal measurement.  Output data qubits have \(d_q=|O|\).

Two logical qubits may share one physical qubit if and only if their intervals
are disjoint.  Therefore physical allocation for fixed \(\sigma\) is interval
graph coloring.

### 2.5 Proposed fixed-order allocation theorem

This is the strongest exact polynomial-time result in the new pipeline and
should be stated prominently.

> **Theorem (optimal reuse for a fixed order).**  For a fixed topological
> operation order \(\sigma\), the minimum number of physical qubits required
> by any valid measurement-to-reset reuse assignment equals
> \[
> \omega(\sigma)=\max_t |\{q:t\in I_q\}|.
> \]
> A left-edge interval-coloring algorithm constructs an allocation using
> exactly \(\omega(\sigma)\) physical qubits in
> \(O(Q\log Q)\) time, where \(Q\) is the number of logical lifetimes.

The proof uses the standard equality between clique number and chromatic
number for interval graphs.  The overlap at any cut is a lower bound because
all live intervals need distinct physical qubits.  The left-edge scan attains
that bound.

Thus the implementation is not merely applying a reuse heuristic after an
order is fixed: it solves the fixed-order minimum-width allocation problem
exactly in polynomial time.

### 2.6 Preservation of circuit semantics and fault tolerance

The manuscript should add a correctness statement for reordering and reuse.

> **Proposition (safe schedule and reuse transformation).**  Suppose
> \(\sigma\) is a topological order of \(D_{\mathrm{op}}\), and physical qubits
> are shared only by pairwise disjoint logical lifetimes.  Re-emitting the
> operations in order \(\sigma\), remapping all measurement-record references,
> and resetting a reused physical qubit at the birth of each new lifetime
> preserves the circuit's logical semantics and detector relations.
> Under the same reset and local stochastic noise assumptions used for the
> original preparations, it also preserves the established fault-tolerance
> argument.

The proof should separate three facts:

1. topological reordering exchanges only operations not related by a required
   quantum or classical dependency;
2. interval coloring never aliases simultaneously live logical systems; and
3. reset separates consecutive lifetimes on one physical wire.

This avoids having to treat `reuse_qubit` as a new physical quantum gate.  A
reuse link is an allocation relation between a terminal measurement and a
later reset, not a new fault-propagating operation.

---

## 3. The polynomial-time compiler

### 3.1 Algorithm to present in the main text

The main paper should specify the following scalable version.

```text
POLYNOMIAL-RESOURCE-COMPILE(H, d, target)
    M <- bounded stochastic basis search(H)
    components <- instantiate precomputed CAT components(M, d)
    (G, F, D) <- form their disjoint global structures

    order_0 <- deterministic critical-path order of logical inter-spider edges
    best <- EVALUATE(order_0)
    for at most B valid adjacent exchanges of order_0:
        candidate <- EVALUATE(exchanged order)
        best <- target-dependent minimum(best, candidate)

    C_logical <- extract using best absolute ZX-node order
    D_op <- build operation dependency DAG(C_logical)
    sigma <- register-pressure-aware list schedule(D_op)
    minimum_allocation <- left-edge interval coloring(sigma)
    frontier <- bounded reuse-chain prefix construction(sigma,
                                                        minimum_allocation)
    return target-dependent circuit from frontier
```

`EVALUATE` rematches the earliest available local ports, materializes the
induced CNOT dependencies, rejects cycles, applies weighted-cut list
scheduling, and scores the resulting order.

The current implementation uses \(B\le 64\).  More generally, the theorem only
requires \(B\) to be polynomially bounded in the expanded instance size.

### 3.2 List-scheduling rule

At the ZX level, maintain the ready set of nodes whose predecessors have all
been processed.  For each ready node \(v\), compute the change

\[
\Delta(v)=
\#\text{tree resources opened}
-\#\text{tree resources closed}
+\#\text{outputs opened}
+\Delta_{\mathrm{flag}}(v).
\]

The qubit-priority scheduler selects the ready node minimizing the tuple

\[
\left(
\max(W_{\mathrm{so\ far}},L+\Delta(v)),
L+\Delta(v),
\Delta(v),
-h(v),
\operatorname{id}(v)
\right),
\]

where \(L\) is the current number of live resources and \(h(v)\) is the
remaining DAG height.  The final node identifier is a deterministic tie
breaker.

For the depth target, critical-path height is placed first in the comparison
tuple.  This remains a heuristic: it favors short critical paths but is not a
proof of globally minimum circuit depth.

At the operation level, the analogous list scheduler prioritizes projected
peak live lifetimes, number of lifetimes remaining after the operation,
lifetimes closed by the operation, remaining DAG height, and node identifier.

### 3.3 Complexity theorem

Use separate symbols for the input code and the expanded compiler instance:

- \(n\): number of code qubits;
- \(N=|V|\): number of nodes in the expanded ZX graph;
- \(A=|A|\): number of ZX precedence arcs;
- \(M=|O|\): number of emitted circuit operations;
- \(Q\): number of logical qubit lifetimes;
- \(C\): number of inter-spider connections;
- \(K\): number of sampled parity-matrix bases; and
- \(B\): number of matching-neighborhood trials.

A suitable theorem is:

> **Theorem (polynomial-time compilation).**  Assume the required
> fault-tolerant CAT components are available in the offline library, and let
> \(K\) and \(B\) be polynomially bounded.  The greedy SpiderCSS pipeline
> returns a valid resource-aware preparation circuit in time polynomial in
> \(n,N,A,M,Q,C,K,B\).  For bounded-degree expanded ZX graphs, the direct
> implementation runs within
> \[
> O\!\left(Kn^3 + BN^2 + M^2 + Q(M+Q)\right)
> \]
> up to lower-order graph construction and sorting terms.

Proof outline:

1. Each sampled RREF costs at most \(O(n^3)\), giving \(O(Kn^3)\).
2. Port assignment, DAG materialization, acyclicity testing, and longest-path
   evaluation are polynomial.  The current ready-set scan gives at most
   \(O(N^2)\) per bounded-degree ZX schedule, repeated at most \(B+1\) times.
3. Extraction visits a polynomial-size graph and emits \(M\) operations.
4. Building the operation DAG is polynomial; the direct ready-set list
   scheduler takes at most \(O(M^2)\).
5. Fixed-order interval coloring costs \(O(Q\log Q)\).
6. There are at most \(Q-1\) candidate reuse-chain links.  Constructing and
   measuring all prefix allocations costs polynomial time, bounded coarsely by
   \(O(Q(M+Q))\).

This is an **output-sensitive** claim: it is polynomial in the size of the
expanded CAT-state instance.  The paper should not silently identify \(N\) or
\(M\) with the original code length if the expansion family has not been shown
to have polynomial size.

### 3.4 What “polynomial optimization” means here

The current methods fall into three different categories and should not be
conflated:

| Subproblem | Current method | Formal status |
|---|---|---|
| Basis choice | \(K\) sampled column permutations and GF(2) RREF | Polynomial-time bounded heuristic; no global optimum guarantee |
| External-leg matching | Deterministic seed plus at most 64 adjacent exchanges | Polynomial-time local-search heuristic |
| ZX absolute ordering | Weighted-cut list scheduling | Polynomial-time heuristic |
| Operation ordering | Greedy list scheduling, or optional CP-SAT | Greedy mode is polynomial; CP-SAT has no polynomial worst-case guarantee |
| Allocation for a fixed order | Left-edge interval coloring | Polynomial-time **exact optimum** |
| Reuse tradeoff path | Ordered prefixes of minimum-color chains | Polynomial-time heuristic subset of the full Pareto frontier |
| Small exact ordering | Ideal/subset dynamic program | Exponential, approximately \(O(2^M M)\) |
| Global matching/order/allocation | Not solved exactly | Combinatorial open optimization problem |

It is accurate to call the first, second, third, and frontier procedures
**polynomial-time optimization heuristics**.  It is not accurate to call them
polynomial-time exact optimization algorithms.  Interval coloring is the
notable exact polynomial exception.

### 3.5 Offline CAT generation

The main complexity theorem should be conditional on an available component
library, matching the paper's offline/online separation.

The current MDSF construction is also a bounded heuristic: it starts from a
greedy forest and performs a finite simulated-annealing schedule.  Each
mutation and feasibility check is polynomial in the component graph size, so
with a fixed or polynomially bounded number of annealing steps it terminates in
polynomial time.  It may fail to find the globally minimum-diameter forest and
does not make the underlying exact MDSF problem easy.

Similarly, the compact affine-space characterization of strictly safe hook
errors can be computed by linear algebra in polynomial time, as already
discussed in the appendix.  If the implementation explicitly enumerates all
members of a high-dimensional affine space or all partial split chains, that
enumeration can be exponential.  The paper should either:

- retain the compact representation and give a polynomial selection
  procedure; or
- state a bounded-dimension or offline-precomputation assumption for the
  enumeration used in practice.

This caveat is necessary if the paper wants an unconditional end-to-end
polynomial claim including component and hook-split generation.

---

## 4. Qubit--depth targets

The old reuse-strategy names should be replaced with three resource targets.

### 4.1 `qubits`

Choose minimum simultaneous qubits first.  At the operation-allocation stage,
this uses the optimal interval coloring for the selected order.  CNOT depth is
reported as a secondary metric.

### 4.2 `depth`

At ZX ordering, prioritize critical-path height.  At allocation, start from
the no-reuse circuit and accept as much reuse as is available without losing
the best measured depth on the constructed path.

This should be called **depth-priority**, not “globally minimum depth.”  The
operation order is not jointly reoptimized over every physical allocation.

### 4.3 `balanced`

At final allocation, score the measured frontier using

\[
J_{3:1}(W,D)=
3\frac{W-W_{\min}}{W_{\max}-W_{\min}}
+\frac{D-D_{\min}}{D_{\max}-D_{\min}},
\]

with a unit denominator when a range is zero.  This gives simultaneous qubits
three times the normalized weight of depth.  It captures the intended policy:
one fewer qubit is important, but not at arbitrarily large depth cost.

During matching search, the current implementation uses \(W D\) as a proxy
because the final allocation frontier is not yet available.  The paper should
say this explicitly.  It should not imply that one identical scalar objective
is currently optimized at every compilation level.

### 4.4 Reuse-frontier construction

For a fixed operation order:

1. construct the no-reuse mapping and compute its CNOT depth;
2. compute minimum-width interval-color chains;
3. evaluate each possible adjacent chain merge in isolation;
4. order merges by incremental CNOT-depth cost and idle gap;
5. evaluate every prefix directly from its mapped CNOT sequence;
6. discard dominated \((W,D)\) points.

No candidate Stim circuits need to be materialized: the ASAP CNOT-depth
recurrence is computed directly from the ordered CNOT pairs and the candidate
logical-to-physical mapping.  Only the selected allocation is emitted as a
Stim circuit.  This retains the same candidate path while avoiding a large
compiler-dependent circuit-construction overhead.

This produces a useful polynomial-size path between no reuse and maximum
reuse.  It is not the complete Pareto frontier, because arbitrary subsets and
alternative interval colorings are not enumerated.  In the paper, call it a
**measured tradeoff path** or **candidate frontier**, unless a later algorithm
proves completeness.

---

## 5. Exact and anytime variants

The optional exact formulation uses one integer position variable per event,
all-different and precedence constraints, one interval per logical lifetime,
and a cumulative-capacity variable.  Its lexicographic objective is encoded as

\[
\min\; W(A_{\max}+1)+A,
\]

where \(A_{\max}\) is a valid upper bound on active volume.  This makes peak
width the strict primary objective and active volume the secondary objective.

The paper should distinguish:

- `OPTIMAL`: CP-SAT proved the optimum of the stated fixed-matching ordering
  model;
- `FEASIBLE`: a valid incumbent was found, without an optimality proof;
- `OPTIMAL_DP`: the small ideal-DP oracle proved the optimum; and
- heuristic fallback: OR-Tools was unavailable or the solve did not return an
  incumbent.

The ideal dynamic program stores one state per downward-closed subset (order
ideal) of the DAG.  Its worst-case state count is exponential, bounded by
\(2^M\).  It is useful as a small-instance oracle for validating the greedy
algorithm, not as the scalability argument.

The CP-SAT benchmark is reproducible because it uses one worker, an explicit
seed, disabled randomized search, and a deterministic-time limit.  This
ensures repeatable incumbents on the same software stack; it does not convert
CP-SAT into a polynomial-time exact method.

---

## 6. Proposed restructuring of the paper

### 6.1 Introduction

Replace the paragraph saying that “scheduling heuristics balance circuit depth
against qubit reuse” with a more specific contribution statement:

> We formulate extraction width as a weighted cut of an absolutely ordered ZX
> dependency DAG and formulate physical reuse as interval coloring of logical
> wire lifetimes.  This yields a deterministic polynomial-time compiler based
> on bounded matching search and list scheduling, together with an exact
> polynomial allocation algorithm for any fixed order.  Optional solver
> backends improve or certify small ordering instances.

Add the following contributions to the introduction:

1. weighted-cut characterization of live extraction resources;
2. absolute-order extraction rather than generation-layer extraction;
3. exact interval-coloring characterization of fixed-order reuse;
4. a polynomial-time end-to-end heuristic compiler; and
5. target-controlled qubit--depth tradeoffs.

### 6.2 Fault-Equivalent Circuit Extraction

Keep the CNOT-count optimality results and well-ordered CAT construction.
After the well-ordering subsection, introduce the dependency/resource
separation and the weighted-cut proposition.  Make clear that the new
scheduler changes only causally unconstrained traversal choices, not the
fault-equivalent graph rewrites or minimum-CNOT structural result.

### 6.3 The Compilation Pipeline

Recommended subsection structure:

1. **Offline CAT-component generation** — largely retained, with the bounded
   heuristic caveat.
2. **Reproducible bounded basis search** — retain the stochastic-search
   algorithm, state its \(O(Kn^3)\) bound, and mention the fixed seed.
3. **Global graph instantiation** — retain.
4. **Joint port matching and absolute ZX ordering** — replace the four old
   heuristics.
5. **Weighted-cut resource objective** — definitions of \(W\) and \(A\),
   proposition, and list scheduler.
6. **Absolute-order circuit extraction** — update the generation-based text.
7. **Operation scheduling and interval allocation** — operation DAG,
   measurement-record dependencies, allocation theorem, and correctness.
8. **Qubit--depth tradeoff targets** — `qubits`, `balanced`, and `depth`.
9. **Complexity and optional exact backends** — polynomial theorem followed by
   DP/CP-SAT distinction.

### 6.4 Simulation Results

The methods paragraph should say that every code is compiled under the three
targets using:

- the same optimized parity matrix search and code-derived seed;
- fixed `joint_resource` matching/extraction;
- the same hook-split analysis;
- target-specific absolute ordering and allocation; and
- either the named greedy polynomial backend or the named CP-SAT anytime
  backend.

Every result row should report:

- target (`qubits`, `balanced`, or `depth`);
- CNOT count;
- simultaneous qubits;
- CNOT depth;
- active-qubit volume;
- acceptance and logical error rates;
- solver status and objective bound when applicable;
- deterministic circuit seed; and
- circuit hash.

If the final paper's headline claim is polynomial scalability, at least one
table or appendix comparison should run the greedy operation-order backend.
Otherwise the reader cannot tell whether the reported performance belongs to
the polynomial compiler or the optional solver-assisted variant.

The old statement that aggressive reuse has “no clear winner” should be
replaced by a target-based analysis.  Plot the measured candidate frontier and
show where the three targets lie.  For `49_1_5`, include the successful
joint-resource result and compare it directly with Flag at Origin under the
same noise model.  Treat `95_1_7` only after its run has completed.

### 6.5 Conclusion

The conclusion should claim:

- fault tolerance and minimum CNOT count come from the structural ZX/CAT
  construction;
- resource-aware scheduling does not alter those guarantees;
- a polynomial-time compilation path exists;
- fixed-order qubit reuse is solved optimally;
- global joint resource optimality is not claimed; and
- exact/anytime backends provide validation and potentially better schedules
  on tractable instances.

---

## 7. Figures and algorithms to add

### Figure A: revised compilation flow

```text
CSS stabilizers
      |
      v
bounded GF(2) basis search
      |
      v
well-ordered CAT components
      |
      v
joint port matching + weighted-cut ZX order
      |
      v
absolute-order fault-equivalent extraction
      |
      v
operation DAG + lifetime intervals
      |
      v
interval coloring + measured reuse path
      |
      v
qubits / balanced / depth circuit
```

The figure should visually separate correctness-preserving transformations
from target-dependent resource optimization.

### Figure B: cut width

Show a small dependency DAG with an absolute order, tree-resource intervals,
a flag interval, an output-to-horizon interval, and the maximum weighted cut.
This makes the peak-width theorem much easier to understand.

### Figure C: interval coloring and reuse

Show logical lifetimes as horizontal intervals.  Color non-overlapping
intervals with the same physical-qubit color and draw the corresponding
measurement-to-reset reuse link.

### Figure D: measured tradeoff path

Plot simultaneous qubits against CNOT depth.  Mark the no-reuse endpoint,
minimum-width endpoint, nondominated prefix candidates, and the three selected
targets.  Do not label this the complete Pareto frontier unless completeness
is later established.

### Algorithms

Add pseudocode for:

1. bounded joint matching and ZX-order search;
2. weighted-cut ready-list scheduling;
3. left-edge physical allocation; and
4. reuse-chain candidate-path construction.

The existing stochastic basis-search pseudocode can remain with an explicit
seed and complexity statement.

---

## 8. Claims checklist

### Claims supported by the current implementation

- The compiler can run entirely with polynomial-time heuristic schedulers.
- Joint matching search is deterministically bounded.
- The ZX scheduler and operation list scheduler are polynomial.
- For a fixed operation order, minimum physical width is computed exactly in
  polynomial time.
- The extracted circuit preserves quantum and measurement-record dependencies.
- Three deterministic resource targets are available.
- Optional exact DP and CP-SAT ordering backends use the same resource model.
- Circuit generation is reproducible for a fixed code, target, seed, and
  software stack.

### Claims that require qualification

- “Jointly optimized” should mean coordinated optimization across stages, not
  one global optimum.
- “Exact” applies only when DP/CP-SAT reports an optimal certificate, and only
  for its fixed model and matching.
- “Minimum qubits” means minimum for the selected operation order unless the
  order itself was proven globally optimal.
- “Minimum depth” should be replaced by depth-priority or minimum on the
  measured candidate path.
- “Pareto frontier” should be called a candidate frontier or tradeoff path.
- Polynomial complexity should be stated in the expanded instance size and,
  for the online theorem, conditional on available CAT components.

### Claims not established

- Global polynomial-time optimization over basis, CAT decomposition, port
  matching, topological order, reuse, and CNOT depth.
- A polynomial-time exact solution of the topological weighted-cut problem.
- Global completeness of the current qubit--depth frontier.
- An approximation ratio for the greedy schedules.
- Global optimality of the balanced target.

---

## 9. Recommended validation before making the polynomial claim prominent

1. Add a benchmark switch that runs the greedy operation scheduler, then
   compare its width, depth, and runtime against CP-SAT on all codes.
2. Use the exact ideal-DP backend on small instances to report greedy optimality
   gaps for \(W\) and \(A\).
3. Record compiler runtime and expanded instance sizes \((N,A,M,Q)\), not only
   code distance.
4. Verify every emitted circuit has the same detector behavior before and
   after scheduling/reuse on small exhaustive instances.
5. Report how often CP-SAT returns `OPTIMAL` versus `FEASIBLE`.
6. Show that repeated compilations produce identical circuit hashes.
7. For the offline story, state whether safe-split enumeration is bounded in
   the evaluated families or replace it with a compact polynomial selection
   routine.

These experiments would support two separate conclusions:

- **scalability:** the greedy compiler has polynomial construction cost and
  remains practical as expanded instances grow; and
- **solution quality:** exact small-instance oracles and anytime CP-SAT show how
  close the polynomial schedules are to the optimum of the restricted model.

That separation gives the paper a cleaner and more defensible complexity
story than treating one solver-assisted pipeline as both exact and scalable.
