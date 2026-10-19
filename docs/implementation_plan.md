# SpiderCSS Interactive Website — Implementation Plan

This document specifies the architecture, data pipeline, client-side compiler engine, interactive visualizations, and deployment workflow for the **SpiderCSS** companion website (`docs/`), supporting the paper *"SpiderCSS: Scalable Fault-Tolerant CSS State Preparation"*.

---

## 1. Executive Summary & Architectural Decisions

### 1.1 Tech Stack
- **Framework**: **Astro 5** (`docs/`) configured for static site generation (`output: 'static'`) and GitHub Pages deployment.
- **Interactive UI Islands**: **React 19** (`@astrojs/react`) + **TypeScript** for stateful compiler stages, playback controls, matrix editors, and synchronized diagrams.
- **State Management**: **Nanostores** (`nanostores` + `@nanostores/react`) for clean cross-component state sharing between the 5 compiler phases, mode switcher (**Step-by-Step Walkthrough** vs. **Full Compiler GUI**), and benchmark panels.
- **Diagram & Graph Rendering**: **Custom SVG + D3 / Dagre** (`d3-Selection`, `d3-Hierarchy`, `d3-Force`, `dagre`, and **Framer Motion** for smooth layout morphing). Custom SVG rendering guarantees crisp, publication-grade visuals that match the exact TikZ conventions in the paper (`figures/building-G-and-D.tikz` and `figures/full-extraction.tikz`).
- **Math & Styling**: **Tailwind CSS v4** + **KaTeX** for inline and display equations (e.g., the Eq. 8 CNOT cost formula, stabilizer generators, and propositions).

### 1.2 Pure TypeScript Client-Side Engine (Why Not Pyodide?)
GitHub Pages hosts static assets only. Every algorithm in the `spidercss/` Python library operates on small binary matrices over $\mathbb{F}_2$ and sparse graphs/DAGs with $< 500$ nodes (~1,500 lines of core logic across `css_state.py`, `optimize_parity_matrix.py`, `hook_errors.py`, `well_ordered_cat_state.py`, `spider_leg_matcher.py`, `joint_extraction_planner.py`, `zx_resource_scheduling.py`, `circuit_extraction.py`, and `qubit_reuse.py`).

Porting these modules cleanly to **pure TypeScript** (with a **Web Worker** for Monte Carlo RREF trials and Simulated Annealing edge-ordering) provides:
1. **Zero cold-start latency** (no 25 MB Pyodide + NumPy/NetworkX/Stim WASM download).
2. **Instantaneous step-by-step execution (<5 ms)** with full immutable state snapshots at every intermediate step of Gaussian elimination, ZX-rewriting, and Algorithm 1 edge addition.
3. **Clean, inspectable TypeScript source code** in `docs/src/engine/` that mirrors the Python modules 1-to-1.

### 1.3 Single-Page Academic Project Structure
The website is organized as a single-page application divided into three cohesive sections:
1. **Paper Hero & Overview**: Title, authors, abstract, key headline metrics (up to $84\%$ reduction in logical error rate, $39\%$ fewer flags, $29\%$ fewer CNOTs vs. Flag at Origin), quick links (Paper PDF, arXiv, GitHub repository), and a one-click jump into the interactive studio.
2. **Unified 5-Phase Interactive Studio**:
   - Features a persistent top-bar mode switch between:
     - **Walkthrough Mode (Guided)**: Pedagogical step-by-step narrative through Phases 1 $\to$ 5 with inline mathematical explanations, animated single-step controls (`Prev`, `Play/Pause`, `Next`, `Finish`), and a branch choice after Phase 2 between **`[Show ZX-Rewrites]`** (Section III.A theory view) and **`[Show Pipeline]`** (Section IV Algorithm 1 implementation view).
     - **Full Compiler GUI Mode (Power-User)**: Exposes all configuration knobs simultaneously (custom code input, `max_basis_tries`, optional safe hook-error splits, all 5 edge-ordering heuristics, and the 3 post-extraction qubit reuse modes) to compile and export `.stim` / `.qasm` circuits immediately.
3. **Global Benchmark Explorer**: Interactive scatter/line plots and sortable comparison tables across all 19 precomputed simulation datasets in `spidercss/simulation_results/`, reproducing and extending Figure 1, Figure 8, and Table I of the paper.

---

## 2. Directory Structure & Build Pipeline

All website source files live inside `docs/` so the root Python package remains uncluttered.

```text
docs/
├── astro.config.mjs                 # Astro config with base path & React/Tailwind integrations
├── package.json                     # Dependencies & build scripts (sync-data, dev, build, test)
├── tsconfig.json                    # Strict TypeScript configuration
├── scripts/
│   └── sync-assets.mjs              # Copies QECC JSONs, Cat State JSONs, and Simulation Results into public/data/
├── public/
│   └── data/
│       ├── qeccs/                   # Synced from ../spidercss/assets/qeccs/{FAO,MQT,misc}/*.json + index.json
│       ├── cat_states/              # Synced from ../spidercss/cat_states_data/well_ordered_state_t*_n*.json
│       └── simulation_results/      # Synced from ../spidercss/simulation_results/*.json + summary.json
├── src/
│   ├── layouts/
│   │   └── Layout.astro             # HTML shell, KaTeX CSS, academic typography, navigation header
│   ├── pages/
│   │   └── index.astro              # Single-page entry assembling Hero, Interactive Studio, and Benchmarks
│   ├── stores/
│   │   └── compilerStore.ts         # Reactive store holding current code, phase state, history snapshots, & UI mode
│   ├── engine/                      # Pure TypeScript port of the SpiderCSS compiler pipeline
│   │   ├── types.ts                 # Shared interfaces (CSSCode, ZXGraph, DagGraph, StepSnapshot, StimOp)
│   │   ├── gf2.ts                   # F_2 matrix algebra, RREF with step recording, column permutations
│   │   ├── cssState.ts              # Pauli string <-> H_x/H_z parser, commutativity check, dual swap for |+>
│   │   ├── optimizeParityMatrix.ts  # row_optimize_matrix, cnot_cost (Eq. 8), unique-ones checker
│   │   ├── hookErrors.ts            # get_conj_M, characterize_stabilizer_splits, safe spider chain splitting
│   │   ├── catState.ts              # Loads well_ordered_state_t{t}_n{n}.json -> G, F, roots, D (with missing_link)
│   │   ├── spiderLegMatcher.ts      # Algorithm 1 (SpiderLegMatcher): G_global & D_global mutation + step snapshots
│   │   ├── heuristics.ts            # Ordering heuristics: earliest_start, critical_path, active_spider, sa_seq, joint
│   │   ├── circuitExtraction.ts     # 2D grid layout (Fig. 7 a->d), Stim & OpenQASM 2.0/3.0 code generation
│   │   ├── qubitReuse.ts            # 3 post-extraction reuse modes: No Reuse, Optimize Depth, Minimize Sim Qubits
│   │   └── compiler.worker.ts       # Web Worker for Monte Carlo RREF trials & Simulated Annealing ordering
│   └── components/
│       ├── HeroSection.astro        # Title, authors, abstract, key takeaways, quick-start presets
│       ├── StudioShell.tsx          # Master container with Walkthrough vs. Full GUI mode switch & phase stepper
│       ├── phase1/
│       │   ├── Phase1CodeSpec.tsx   # Preset selector, |0> vs |+> toggle, distance d input
│       │   └── StabilizerEditor.tsx # Dual-mode editor: interactive H_x/H_z binary grid OR Pauli string textarea
│       ├── phase2/
│       │   ├── Phase2RrefOptim.tsx  # RREF step-by-step controls (Permute -> Eliminate -> Unpermute) + Monte Carlo UI
│       │   ├── MatrixStepViewer.tsx # Animated binary matrix highlighting pivot columns (unique 1s) & row weights w_j
│       │   ├── BipartiteZxView.tsx  # SVG bipartite ZX-diagram with purple idealized internal edges & black boundary legs
│       │   └── CostBreakdownCard.tsx# Live Eq. 8 CNOT & flag cost calculator compared against unoptimized H
│       ├── branch/
│       │   └──ZxRewritesView.tsx    # [Show ZX-Rewrites] 3-stage view: Unidealize -> Safe Hook Splits -> Cat Unfusion
│       ├── phase3/
│       │   ├── Phase3Algorithm1.tsx # Algorithm 1 controller (heuristic selector, manual edge clicker, playback bar)
│       │   ├── TargetZxPanel.tsx    # Target ZX-diagram highlighting added edges, active edge (a,b), and remaining edges
│       │   ├── GlobalGraphPanel.tsx # Live G_global SVG (3-ary spiders, spanning forest F, roots r_k, added CNOT edges)
│       │   └── GlobalDagPanel.tsx   # Live D_global SVG (tree edges, dashed red missing_link, dashed orange P_D(u)->v)
│       ├── phase4/
│       │   ├── Phase4Extraction.tsx # 4-stage visual morphing (Fig. 7 a->b->c->d) + Qubit Reuse 3-way selector
│       │   ├── GridZxMorphCanvas.tsx# Animated SVG transitioning G_global onto the (generation x qubit-line) 2D grid
│       │   ├── QuantumCircuitSvg.tsx# Interactive quantum circuit renderer (data lines, flag lines, CNOTs, R/RX, M/MX)
│       │   └── CircuitExportBox.tsx # Syntax-highlighted .stim and .qasm viewer with copy & download buttons
│       └── phase5/
│           ├── Phase5Benchmarks.tsx # Code-specific simulation results + global cross-code comparison dashboard
│           └── LerComparisonPlot.tsx# Log-log LER & Acceptance Rate vs. physical error rate p charts
└── tests/
    └── engineParity.test.ts         # Vitest suite verifying TS engine output matches Python spidercss outputs
```

### 2.1 Asset Synchronization (`docs/scripts/sync-assets.mjs`)
Before `npm run dev` or `npm run build`, `sync-assets.mjs` reads from the parent Python package (`../spidercss/`) and writes static JSON files into `docs/public/data/`:
1. **QECC Presets (`public/data/qeccs/index.json`)**: Aggregates all codes from `spidercss/assets/qeccs/FAO/`, `MQT/`, and `misc/` with metadata (`id`, `category`, `full_name`, `abbr_name`, `n`, `k`, `d`, `is_self_dual`, `H_x`, `H_z`).
2. **Precomputed Cat States (`public/data/cat_states/cat_states_bundle.json`)**: Bundles all `spidercss/cat_states_data/well_ordered_state_t{t}_n{n}.json` files ($t \in \{1, 2, 3\}$, $n \in [1, 18]$) into a single compact lookup table (~45 KB gzipped) so Phase 2/3 can instantiate any `WellOrderedCatState` synchronously in memory.
3. **Simulation Benchmarks (`public/data/simulation_results/`)**: Copies the 19 benchmark JSON files from `spidercss/simulation_results/*.json` (while stripping or compressing multi-megabyte raw Stim strings into on-demand fetchable files) and generates `summary.json` containing all metrics (LER, Acceptance Rate, CNOTs, Flags, Simultaneous Qubits, Depth) across physical error rates $p \in \{10^{-4}, 5\times 10^{-4}, 10^{-3}, 3\times 10^{-3}, 5\times 10^{-3}\}$.

### 2.2 GitHub Pages Deployment (`.github/workflows/deploy-pages.yml`)
A GitHub Actions workflow triggered on pushes to `main` (touching `docs/**` or `spidercss/assets/**` or `spidercss/cat_states_data/**` or `spidercss/simulation_results/**`):
1. Checks out the repository.
2. Sets up Node.js 22 and caches `docs/node_modules`.
3. Runs `npm --prefix docs ci && npm --prefix docs run build` (which runs `sync-assets.mjs` followed by `astro build`).
4. Uploads `docs/dist/` via `actions/upload-pages-artifact` and deploys via `actions/deploy-pages`.

---

## 3. Client-Side Compiler Engine Specification (`docs/src/engine/`)

Every TypeScript module in `docs/src/engine/` is designed to be a faithful, deterministic port of the corresponding Python module in `spidercss/`, augmented with **step recording** so the UI can scrub forward and backward through every sub-step.

### 3.1 `cssState.ts` $\leftrightarrow$ `spidercss/css_state.py`
- **Inputs**:
  - Target state toggle: $|\overline{0}\rangle^{\otimes k}$ (`basis = 'Z'`) or $|\overline{+}\rangle^{\otimes k}$ (`basis = 'X'`).
  - Either a pre-specified code from `qeccs/index.json` or custom user input via:
    - **Pauli Strings Mode**: Lines of `I`, `X`, `Z` strings (e.g., `IIIXXXX`, `IIZZIZZ`), parsed into binary matrices $H_x$ and $H_z$.
    - **Binary Matrices Mode**: Interactive/editable 0-1 matrices for $H_x \in \mathbb{F}_2^{r_x \times n}$ and $H_z \in \mathbb{F}_2^{r_z \times n}$.
  - Code distance $d \ge 1$, from which fault-tolerance parameter $t = \lfloor (d - 1) / 2 \rfloor$ is derived (with an optional override slider for $t \in \{1, 2, 3\}$).
- **Validation**:
  - Checks that all rows have equal length $n$.
  - Checks CSS commutativity over $\mathbb{F}_2$: $H_x H_z^T \equiv 0 \pmod 2$. If violated, highlights the exact pair of anti-commuting X and Z stabilizer rows $(i, j)$ in red.
  - Computes $k = n - \text{rank}_{\mathbb{F}_2}(H_x) - \text{rank}_{\mathbb{F}_2}(H_z)$.
- **Basis Handling**:
  - Following `CSSState.__init__` in [css_state.py](file:///Users/boldi/PycharmProjects/spidercss/spidercss/css_state.py#L46-L48), when preparing $|\overline{0}\rangle$ (`basis === 'Z'`), the active parity matrix to optimize is $M = H_x$ (and $H_{\text{dual}} = H_z$); when preparing $|\overline{+}\rangle$ (`basis === 'X'`), roles swap ($M = H_z$, $H_{\text{dual}} = H_x$, and final circuit gates/init/measurements swap $X \leftrightarrow Z$).

### 3.2 `optimizeParityMatrix.ts` $\leftrightarrow$ `spidercss/optimize_parity_matrix.py`
- **Mathematical Model**:
  Given active parity matrix $M \in \mathbb{F}_2^{r \times n}$ and fault-tolerance parameter $t$:
  - **Column-Permuted RREF Trial** (matching `row_optimize_matrix` in [optimize_parity_matrix.py](file:///Users/boldi/PycharmProjects/spidercss/spidercss/optimize_parity_matrix.py#L103-L116) and Section IV.B of the paper):
    1. **Generate Permutation**: Sample a permutation $\pi \in S_n$ of column indices (or let the user click/drag columns in Walkthrough Mode).
    2. **Permute**: Form $M_\pi = M[:, \pi]$.
    3. **Gaussian Elimination (RREF over $\mathbb{F}_2$)**: Reduce $M_\pi$ to $\text{RREF}(M_\pi)$, recording each elementary row operation $R_a \leftarrow R_a \oplus R_b$ as an inspectable sub-step. Identify the $r$ pivot columns where each row has a unique `'1'` and all other entries in those columns are `'0'`.
    4. **Un-permute**: Apply $\pi^{-1}$ to restore original column order, yielding $M' = \text{RREF}(M_\pi)[:, \pi^{-1}]$. Because column permutation preserves column-wise weight, $M'$ retains the **unique-ones property** (`has_unique_ones_property`): there is a set of $r$ pivot columns forming an embedded $I_r$ submatrix.
  - **Exact CNOT Cost Function** (matching `cnot_cost(M, t)` in [optimize_parity_matrix.py](file:///Users/boldi/PycharmProjects/spidercss/spidercss/optimize_parity_matrix.py#L12-L54) and Eq. 8 of the paper):
    $$C_{\text{total}}(M', t) = \sum_{i:\, w_i > 1} 2\,f(w_i + 1, t) \;+\; \sum_{j=1}^{r} \bigl[(w_j - 1) + 2\,f(w_j, t)\bigr]$$
    where $w_i$ is the weight of column $i$, $w_j$ is the weight of row $j$, and $f(w, t)$ is the number of flag qubits in `well_ordered_state_t{t}_n{w}.json` (`len(roots) - 1`, or `0` when $t=0$ or $w \le 3$).
  - **Bipartite ZX-Diagram Construction**:
    - Each row $j \in \{0, \dots, r-1\}$ corresponds to a $Z$-spider (green) of degree $w_j$ (for $|\overline{0}\rangle$; colors invert for $|\overline{+}\rangle$) connected directly to data boundary leg $p_j$ (its unique-one pivot column).
    - Each non-pivot column $i$ with $w_i \ge 1$ corresponds to an $X$-spider (red) of degree $w_i + 1$ connected to data boundary leg $i$ and connected via **purple idealized internal edges** to every row spider $j$ where $M'_{j,i} = 1$.

### 3.3 `hookErrors.ts` $\leftrightarrow$ `spidercss/hook_errors.py`
- Implements `get_conj_M(M')` (computing the dual parity matrix $[I \mid A^T]$ from the pivot/non-pivot decomposition of $M'$) and `characterize_stabilizer_splits(H_dual)`.
- Identifies **safe hook-error splits**: partitions of a stabilizer spider's neighbors into chunks of size $\ge 2$ whose sub-stabilizers commute with the opposite-basis stabilizers, allowing a high-degree spider of weight $w$ to be split into a chain of smaller spiders linked by internal edges before expanding into $\text{Cat}_n$ states (reducing flag overhead).
- In the UI, the user can toggle **Safe Hook-Error Splits** on/off or inspect which high-degree spiders split into smaller chains.

### 3.4 `catState.ts` $\leftrightarrow$ `spidercss/well_ordered_cat_state.py`
- Looks up `(t, n)` in `cat_states_bundle.json` and constructs a `WellOrderedCatState`:
  - `G`: Undirected graph of 3-ary spiders (`0 .. k-1`) and boundary legs (`-1 .. -n`).
  - `F`: Spanning forest of `G` (one tree per root in `roots`, where `roots[0]` is the primary/state spider and `roots[1..]` are flag spiders).
  - `D`: Causal dependency DAG over the 3-ary spiders (`0 .. k-1`), containing:
    - **Solid black directed edges**: Internal spanning-tree edges oriented away from each root $r_m$.
    - **Dashed red directed edges (`missing_link`)**: Internal cross-tree flag-ordering edges ensuring flag measurements propagate according to the well-ordered cat state definition.

### 3.5 `spiderLegMatcher.ts` & `heuristics.ts` $\leftrightarrow$ `spider_leg_matcher.py`, `joint_extraction_planner.py`, `zx_resource_scheduling.py`
- **Initialization**:
  - Creates $G_{\text{global}}$ as the disjoint union of expanded `WellOrderedCatState.G` for all $Z$-spiders ($Z_0, \dots, Z_{r-1}$) and all non-trivial $X$-spiders ($X_{c_1}, \dots$).
  - Creates $D_{\text{global}}$ as the disjoint union of their internal causal DAGs `WellOrderedCatState.D`.
- **Algorithm 1 Execution (No Backtracking)**:
  - Given an ordering of the external bipartite edges $E_{\text{ext}} = [(a_1, b_1), (a_2, b_2), \dots, (a_m, b_m)]$:
  - For each step $s = 1 \dots m$ processing external edge $(a, b)$:
    1. Find the earliest unassigned 3-ary spider $u(a) \in V(a)$ and $u(b) \in V(b)$ (ordered by topological index in their local cat state, where boundary leg $-1$ is reserved for the physical data qubit leg).
    2. Increment assigned leg counter for $u(a)$ and $u(b)$ (up to their capacity of $3 - \text{deg}_{G_{\text{local}}}(u)$).
    3. Add undirected external CNOT edge $(u(a), u(b))$ to $G_{\text{global}}$.
    4. Query parents $P_{D_{\text{global}}}(u(a))$ and $P_{D_{\text{global}}}(u(b))$ (using the parent snapshot before step 4) and add **dashed orange causal dependency edges** to $D_{\text{global}}$:
       $$\forall p \in P_{D_{\text{global}}}(u(a)): (p, u(b)) \in E(D_{\text{global}}), \qquad \forall q \in P_{D_{\text{global}}}(u(b)): (q, u(a)) \in E(D_{\text{global}})$$
    5. Record a complete `Algorithm1StepSnapshot` containing the active edge $(a, b)$, selected nodes $(u(a), u(b))$, newly added $G_{\text{global}}$ edge, newly added $D_{\text{global}}$ edges, parent nodes $P_{D_{\text{global}}}(u(a)), P_{D_{\text{global}}}(u(b))$, and current topological layers of $D_{\text{global}}$.
- **Supported Ordering Modes**:
  1. **Interactive / Manual / Random (Walkthrough Mode)**: Step through a random permutation or let the user click any remaining highlighted edge in the Target ZX-Diagram to add it next.
  2. **Named Compiler Heuristics**:
     - `earliest_start_first`: Dynamic greedy selection minimizing $\max(\text{depth}(u(a)), \text{depth}(u(b)))$.
     - `critical_path_first`: Dynamic greedy selection prioritizing nodes with largest reverse distance-to-sink (`get_node_distances_to_sink`).
     - `active_spider_first`: Prioritizes completing edges incident to already-opened cat states to minimize overlapping active ancilla lifetimes.
     - `sa_sequence_distance`: Simulated annealing over edge sequences minimizing total sequence distance between first and last operations of each cat state (executed in Web Worker).
     - `joint_resource`: Multi-start local swap optimization from `joint_extraction_planner.py`.

### 3.6 `circuitExtraction.ts` & `qubitReuse.ts` $\leftrightarrow$ `circuit_extraction.py`, `qubit_reuse.py`
- **Stage-by-Stage Extraction (Matching Figure 7 of the Paper)**:
  - **Stage 4a (Topological Grid Alignment — Fig. 7a $\to$ 7b)**: Assigns every node $v \in G_{\text{global}}$ an X-coordinate equal to its scheduled topological generation in $D_{\text{global}}$ (with greedy 1-CNOT-per-generation separation for visualization) and a Y-coordinate corresponding to its spanning-tree root $r_k$ in $F_{\text{global}}$ (data qubit lines + flag ancilla lines).
  - **Stage 4b (Identity Insertion & Unfusion — Fig. 7b $\to$ 7c)**: Inserts degree-2 identity spiders along horizontal tree wires so every vertical/diagonal CNOT edge connects nodes in the same column, and unfuses root starts into $\ket{0}/\ket{+}$ preparations and leaf ends on flag trees into $X/Z$ measurements.
  - **Stage 4c (Quantum Circuit Translation — Fig. 7c $\to$ 7d)**: Converts each vertical spider pair `(Z_node, X_node)` into a `CX control target` gate (`control = X_node`'s root qubit line, `target = Z_node`'s root qubit line), root initializations into `R` ($\ket{0}$) / `RX` ($\ket{+}$), and flag terminations into `M` / `MX`.
- **Post-Extraction 3-Way Qubit Reuse Selector**:
  Once the circuit is extracted, the user can click any of the **3 Qubit Reuse buttons** to dynamically re-route and compare circuit metrics (Peak Simultaneous Qubits, Circuit Depth, Spacetime Volume):
  1. **`No Qubit Reuse` (`ReuseTarget.NONE`)**: Every flag tree root across all cat states is assigned its own dedicated ancilla qubit wire.
  2. **`Optimize Depth` (`ReuseTarget.DEPTH` / `naive_qubit_reuse`)**: Preserves the exact gate schedule and circuit depth while immediately recycling any ancilla wire as soon as its flag measurement (`M`/`MX`) completes.
  3. **`Minimize Simultaneous Qubits` (`ReuseTarget.QUBITS` / `decross_greedy`)**: Performs local topological commutation shifts (`_try_push_left` / `_try_push_right`) to eliminate partial lifetime overlaps (`b_u < b_v < d_u < d_v`) before running greedy wire recycling, achieving the minimum possible simultaneous hardware qubits.
- **Export Formats**:
  - **Stim (`.stim`)**: Cleannoiseless circuit (`R`, `RX`, `CX`, `M`, `MX`, `DETECTOR`) plus an optional toggle to include depolarizing noise (`DEPOLARIZE1`, `DEPOLARIZE2`, `X_ERROR`, `Z_ERROR`, `TICK`) at a user-selected physical error rate $p$.
  - **OpenQASM 2.0 / 3.0 (`.qasm`)**: Standard `OPENQASM 2.0; include "qelib1.inc";` declarations (`qreg q[N]; creg flags[F];`, `reset`, `h`, `cx`, `measure`) ready for Qiskit / Cirq / hardware execution.

---

## 4. Detailed Phase-by-Phase UI & Visualization Design

### Phase 1: Code & Target State Specification
- **Preset Selector Bar**:
  - Grouped dropdown + quick-select pills for the 3 categories in `spidercss/assets/qeccs/`:
    - **Flag at Origin (FAO)**: Steane `[[7, 1, 3]]`, Reed-Muller `[[15, 1, 3]]`, Golay `[[23, 1, 7]]`, Surface codes (`[[9, 1, 3]]`, `[[25, 1, 5]]`, `[[49, 1, 7]]`), Color codes (`[[17, 1, 5]]`, `[[19, 1, 5]]`, `[[31, 1, 7]]`), and Bivariate Bicycle / QLDPC codes (`[[16, 2, 4]]` through `[[72, 12, 6]]`).
    - **MQT Bench Codes**: `[[15, 7, 3]]` Hamming, `[[17, 1, 5]]`, `[[19, 1, 5]]`.
    - **Featured High-Rate Codes (`misc`)**: Gross code `[[144, 12, 12]]`, Carbon `[[12, 2, 4]]`, Iceberg `[[16, 14, 2]]`.
  - Default on page load: **Steane `[[7, 1, 3]]`** (compact enough that every spider and wire is immediately legible in the interactive walkthrough).
- **State & Distance Controls**:
  - Segmented toggle for target logical state: **$|\overline{0}\rangle$ ($Z$-basis)** vs. **$|\overline{+}\rangle$ ($X$-basis)**.
  - Distance $d$ input (auto-populated for presets, editable for custom codes) showing derived fault tolerance $t = \lfloor(d-1)/2\rfloor$.
- **Dual-Mode Stabilizer Inspector/Editor**:
  - Tab 1: **Binary Parity Check Matrices ($H_x, H_z$)** rendered as interactive color-coded grids (click cells to toggle `0`/`1`, add/remove rows/columns).
  - Tab 2: **Pauli Stabilizer Generators** textarea (`IIIXXXX`, `IXXIIXX`, etc.) with live validation badge (`Valid CSS Code: H_x * H_z^T = 0 mod 2`, `[[n, k, d]]`).

---

### Phase 2: Bipartite ZX-Diagram & RREF Basis Optimization
- **Split-Screen Layout**:
  - **Left Panel — Parity Matrix & RREF Controls**:
    - Displays the active matrix $M$ ($H_x$ for $|\overline{0}\rangle$, $H_z$ for $|\overline{+}\rangle$).
    - **In Walkthrough Mode**: Four interactive step buttons matching the specification:
      1. **`1. (Re-)Generate Permutation`**: Shuffles column order $\pi$ with an animated column header transition.
      2. **`2. Permute Columns`**: Reorders the matrix columns according to $\pi$.
      3. **`3. Gaussian Elimination (RREF)`**: Animates row XOR operations over $\mathbb{F}_2$ and highlights the $r$ pivot columns in emerald green (the embedded identity submatrix $I_r$).
      4. **`4. Un-permute Columns`**: Restores original column indices while preserving the highlighted unique-one pivot columns.
    - **In Full GUI Mode**: Input for `max_basis_tries` (default `500`, up to `10,000` via Web Worker) + **`Run Basis Optimizer`** button, showing a live convergence sparkline of $C_{\text{total}}(M', t)$ across trials and locking in $M_{\text{best}}$.
  - **Right Panel — Bipartite ZX-Diagram & Cost Breakdown**:
    - Renders the bipartite ZX-diagram corresponding to the current RREF matrix:
      - Row nodes ($Z$-spiders, green circles) on the left/top, each with 1 black boundary wire to its pivot data qubit.
      - Non-pivot column nodes ($X$-spiders, red circles) on the right/bottom, each with 1 black boundary wire to its data qubit.
      - **Purple idealized internal edges** connecting row $j$ to non-pivot column $i$ wherever $M'_{j,i} = 1$.
    - **Live Cost Card**: Shows Eq. 8 breakdown — Row CNOTs,Row Flag CNOTs, Column Flag CNOTs, Total CNOTs, and Total Flags — comparing the current basis against the unoptimized input matrix.

---

### Post-Phase 2 Branching Bar
Directly beneath Phase 2, the user chooses between two complementary views (and can switch back and forth at any time):
- **`[Show ZX-Rewrites]` (Conceptual / Section III.A Theory View)**
- **`[Show Pipeline]` (Algorithm 1 / Section IV Implementation View)**

#### Branch A: `[Show ZX-Rewrites]` (Interactive 3-Step Theory View)
Illustrates how the idealized bipartite ZX-diagram becomes fault-tolerant via ZX-calculus rewrites (Section III.A & Figure 4 of the paper):
1. **Step 1 — Unidealize Internal Edges (Proposition 3.4)**:
   - Animates all **purple idealized internal edges** turning into **black physical edges**, accompanied by a concise callout explaining why internal faults propagate to weight-1 boundary errors under the unique-ones bipartite structure.
2. **Step 2 — Safe Hook-Error Splits (Optional Interactive Control)**:
   - Toggle button **`Apply Safe Hook-Error Splits`** (powered by `hookErrors.ts`).
   - When enabled, highlights any high-degree stabilizer spiders that admit a safe split (via `characterize_stabilizer_splits`) and animates them splitting into chains of lower-degree spiders connected by internal edges, showing the immediate reduction in required flag qubits.
3. **Step 3 — Fault-Equivalent SpiderCat Unfusion (Definition 3.1)**:
   - Animates every spider of degree $w > 3$ unfusing into its precomputed **Well-Ordered Cat State** $\text{Cat}_w^t$ composed exclusively of degree-3 spiders and flag legs ($\bra{+}$ / $\bra{0}$ post-selections).
   - Concludes with a prompt button: **`Proceed to Algorithm 1 Pipeline →`** explaining that to extract a low-depth quantum circuit without cycles, we now match which 3-ary sub-spiders connect across external edges using $G_{\text{global}}$ and $D_{\text{global}}$.

---

### Phase 3: Global Data Structures ($G_{\text{global}}, D_{\text{global}}$) & Algorithm 1
When the user enters **`[Show Pipeline]`**, Phase 3 presents a **synchronized 3-panel visualization** faithfully styled after Figure 6 (`figures/building-G-and-D.tikz`):

1. **Panel 1 — Target Bipartite ZX-Diagram (Edge Progress Tracker)**:
   - Displays the bipartite ZX-diagram with external edges color-coded by status:
     - **Solid dark**: Already added to $G_{\text{global}}$.
     - **Glowing amber pulse**: Currently selected edge $(a, b)$ being added in this step.
     - **Faded dashed gray**: Remaining edges yet to be scheduled (in Walkthrough Mode, clicking any remaining edge immediately schedules it as the next step!).
2. **Panel 2 — Global Undirected Graph $G_{\text{global}}$ (3-ary Spiders & Spanning Forest $F$)**:
   - Shows the expanded $\text{Cat}_w^t$ subgraphs for each $Z$-spider and $X$-spider.
   - **Spanning Forest $F$**: Highlighted with bold internal tree edges; each tree root $r_k$ is badged with a **blue square outline** (matching `root_highlight` in `figures/building-G-and-D.tikz`).
   - **Assigned Capacity Badges**: Each 3-ary spider displays its available external leg slots (1 or 2).
   - At each step $(a, b)$, animates the new undirected CNOT edge connecting the earliest available nodes $u(a)$ and $u(b)$.
3. **Panel 3 — Global Causal Dependency Digraph $D_{\text{global}}$ (Live DAG Mutation)**:
   - Laid out top-to-bottom by topological layer using `dagre`.
   - **Edge Legend (Matching Paper Figure 6)**:
     - **Solid black arrows ($\to$)**: Internal spanning-tree causal edges (oriented away from roots $r_k$).
     - **Dashed red arrows ($\dashrightarrow$)**: Internal `missing_link` flag-ordering edges from `well_ordered_state_t{t}_n{n}.json`.
     - **Dashed orange arrows ($\dashrightarrow$)**: External causal dependencies added in Step 4 of Algorithm 1 from $P_{D_{\text{global}}}(u(a)) \to u(b)$ and $P_{D_{\text{global}}}(u(b)) \to u(a)$.
   - During each step, highlights the parent nodes $P_{D_{\text{global}}}(u(a))$ and $P_{D_{\text{global}}}(u(b))$ and animates the new dashed orange arrows entering $u(b)$ and $u(a)$, updating the DAG depth counter in real time.

- **Phase 3 Controls**:
  - **Heuristic Selector**: Choose between `Random / Manual (Walkthrough)`, `Earliest Start First`, `Critical Path First`, `Active Spider First`, `SA Sequence Distance`, and `Joint Resource Planner`.
  - **Playback Bar**: `|<< Reset`, `< Step Back`, `Play / Pause` (with speed slider), `Step Forward >`, `>>| Complete All` + interactive timeline scrubber over all $m$ external edges.

---

### Phase 4: Circuit Extraction, 3-Option Qubit Reuse & Export
Phase 4 bridges the completed $(G_{\text{global}}, D_{\text{global}})$ structures to the executable quantum circuit, mirroring **Figure 7 (`figures/full-extraction.tikz`)**:

1. **Interactive 4-Stage Extraction Morph (Fig. 7a $\to$ 7b $\to$ 7c $\to$ 7d)**:
   - A 4-step segmented pill bar lets the user smoothly morph the visualization between:
     - **`(a) Completed G_global`**: The organic cluster layout from Phase 3.
     - **`(b) Grid-Aligned ZX`**: Spiders smoothly animate to their exact 2D grid coordinates where **X = topological generation in $D_{\text{global}}$** and **Y = root qubit wire $r_k \in F$** (horizontal wires are spanning-tree paths; vertical/diagonal wires are external CNOTs).
     - **`(c) Identity-Padded & Unfused ZX`**: Inserts identity spiders so all CNOTs become strictly vertical and unfuses root starts into $\ket{0}/\ket{+}$ states and flag leaf ends into $\bra{+}/\bra{0}$ measurements.
     - **`(d) Extracted Quantum Circuit`**: Replaces vertical spider pairs with standard quantum circuit CNOT symbols, state preparations (`|0⟩`, `|+⟩`), and flag measurements (`M_Z`, `M_X`).
2. **Post-Extraction 3-Way Qubit Reuse Bar**:
   - Directly above the circuit canvas, three prominent action buttons allow the user to apply and compare qubit reuse strategies on the extracted circuit:
     - **`1. No Qubit Reuse`** (`ReuseTarget.NONE`): Baseline wire assignment (1 wire per tree root).
     - **`2. Optimize Depth`** (`ReuseTarget.DEPTH`): Greedy wire recycling (`naive_qubit_reuse`) that reuses measured flag ancillas immediately without increasing circuit depth.
     - **`3. Minimize Simultaneous Qubits`** (`ReuseTarget.QUBITS`): Topological commutation decrossing (`decross_greedy`) + wire recycling to achieve minimum peak hardware qubits.
   - Selecting any of the 3 options immediately updates the **Quantum Circuit SVG**, **Qubit Lifetime Gantt Chart overlay**, and **Live Metric Pills** (`Total Hardware Qubits`, `Data Qubits`, `Flag Ancilla Wires`, `CNOT Count`, `Flag Measurements`, `Circuit Depth`).
3. **Export Drawer (`.stim` & `.qasm`)**:
   - Tabbed code viewer for **Stim (`.stim`)** (with optional noise model injection slider $p$) and **OpenQASM 2.0 (`.qasm`)**, with one-click **Copy to Clipboard** and **Download File** buttons.

---

### Phase 5: Simulation & Benchmark Explorer
1. **Selected Code Benchmark Card (Contextual)**:
   - When the user has selected one of the pre-specified codes that has precomputed Monte Carlo data in `spidercss/simulation_results/` (e.g., `7_1_3`, `9_1_3`, `15_1_3`, `15_7_3`, `16_2_4`, `17_1_5`, `19_1_5`, `20_2_6`, `23_1_7`, `24_2_6`, `25_1_5`, `30_4_6`), Phase 5 automatically displays:
     - **Side-by-side comparison table**: All evaluated SpiderCSS heuristics (`critical_path_first`, `earliest_start_first`, `active_spider_first`, `sa_sequence_distance`, `joint_resource`, with and without qubit reuse) vs. **Flag at Origin (FaO)** across CNOT count, Flag count, Peak Simultaneous Qubits, Depth, Logical Error Rate (LER), and Acceptance Rate (AR).
     - **Interactive Log-Log Plots**: LER vs. physical error rate $p$ and Acceptance Rate vs. $p$ with Wilson score 95% confidence interval error bars.
2. **Global Benchmark Explorer (Paper-Wide)**:
   - Allows exploring all 19 benchmarked codes from the paper, filtering by code family, toggling physical error rate $p$, and inspecting the correlation between spacetime circuit metrics and fault-tolerant logical performance (reproducing Figures 1 and 8 of the paper).

---

## 5. Visual Design System (Matching Paper TikZ Styles)

To maintain visual continuity between the paper (`spiderstate.tex`) and the website, all SVG diagrams share a unified design token palette:

| Element | Paper TikZ Style | Website SVG Style |
| :--- | :--- | :--- |
| **$Z$-Spider (Green)** | `zx_green` (`fill=green!40!white, draw=green!60!black`) | Fill `#86efac`, Stroke `#15803d` (2px), dark label text |
| **$X$-Spider (Red)** | `zx_red` (`fill=red!40!white, draw=red!60!black`) | Fill `#fca5a5`, Stroke `#b91c1c` (2px), dark label text |
| **Idealized Internal Edge** | `purple, thick` | Stroke `#9333ea` (2.5px, subtle glow in Phase 2) |
| **Noisy / Physical ZX Edge** | `black, thick` | Stroke `#1e293b` (2px) |
| **Spanning Forest $F$ Edge** | `line width=1.6pt, black` | Stroke `#0f172a` (3.2px bold) |
| **Root Spider Highlight $r_k$**| `root_highlight` (`draw=blue!60, thick, rectangle`) | Rounded blue badge outline `#2563eb` (2px) around root node |
| **$D_{\text{global}}$ Internal Flag Edge** | `missing_link` (`->, red, dashed, thick`) | Directed dashed red path `#dc2626` (`stroke-dasharray: 5,4`) |
| **$D_{\text{global}}$ External Causal Edge** | `added_edge` (`->, orange, dashed, thick`) | Directed dashed orange path `#ea580c` (`stroke-dasharray: 5,4`) |

---

## 6. Implementation Milestones & Verification Plan

### Milestone 1: Project Scaffolding & Asset Pipeline
1. Initialize Astro + React + TypeScript + Tailwind CSS + KaTeX in `docs/`.
2. Write `docs/scripts/sync-assets.mjs` to bundle `qeccs/`, `cat_states_data/`, and `simulation_results/` into `docs/public/data/`.
3. Configure `.github/workflows/deploy-pages.yml` for automated GitHub Pages deployment from `docs/dist`.

### Milestone 2: Core TypeScript Engine & Parity Tests
1. Implement `gf2.ts`, `cssState.ts`, `optimizeParityMatrix.ts`, `hookErrors.ts`, `catState.ts`, `spiderLegMatcher.ts`, `heuristics.ts`, `circuitExtraction.ts`, and `qubitReuse.ts`.
2. Create `docs/tests/engineParity.test.ts` (using Vitest) and verify:
   - `cnot_cost(M, t)` produces identical numbers to Python `spidercss.optimize_parity_matrix.cnot_cost` on Steane `[[7,1,3]]`, Reed-Muller `[[15,1,3]]`, Golay `[[23,1,7]]`, and Surface `[[9,1,3]]`.
   - `SpiderLegMatcher` produces an acyclic $D_{\text{global}}$ with the exact same node/edge counts and topological depths as Python `spidercss.spider_leg_matcher`.
   - Extracted `.stim` circuits have the exact same CNOT count, flag count, and qubit count across all 3 reuse modes (`NONE`, `DEPTH`, `QUBITS`).

### Milestone 3: Interactive Phases 1, 2 & ZX-Rewrites Branch
1. Build `Phase1CodeSpec.tsx` and `StabilizerEditor.tsx` with preset loading and live $H_x H_z^T = 0$ validation.
2. Build `Phase2RrefOptim.tsx`, `MatrixStepViewer.tsx`, and `BipartiteZxView.tsx` with both 4-step Walkthrough controls and Web-Worker Monte Carlo optimization.
3. Build `ZxRewritesView.tsx` for the `[Show ZX-Rewrites]` branch (unidealizing purple edges $\to$ interactive safe hook-error splits $\to$ cat state unfusion).

### Milestone 4: Phase 3 ($G_{\text{global}}$ & $D_{\text{global}}$) & Phase 4 (Circuit Extraction + Qubit Reuse)
1. Build the synchronized 3-panel `Phase3Algorithm1.tsx` (`TargetZxPanel`, `GlobalGraphPanel`, `GlobalDagPanel`) with manual edge clicking, heuristic selection, and timeline scrubbing.
2. Build `Phase4Extraction.tsx` featuring the 4-stage Fig. 7 morph animation, the 3-way Qubit Reuse selector (`No Qubit Reuse`, `Optimize Depth`, `Minimize Simultaneous Qubits`), interactive circuit viewer, and `.stim`/`.qasm` export.

### Milestone 5: Phase 5 Benchmarks, Polish & Build Verification
1. Build `Phase5Benchmarks.tsx` and `LerComparisonPlot.tsx` wired to the synced `simulation_results/` data.
2. Run full build (`npm --prefix docs run build`) and Vitest suite (`npm --prefix docs test`) to verify zero TypeScript or bundling errors.
