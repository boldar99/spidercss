# SpiderCSS Website — LLM Handoff Document

This document provides the complete context, design decisions, completed work (Milestones 1 & 2), and exact instructions for picking up and completing **Milestones 3, 4, and 5** of the **SpiderCSS** interactive companion website in `docs/`.

---

## 1. Key Reference Files

1. **Specification & Plan**:
   - `docs/website_specification.md` — Original user specification for the website.
   - `docs/implementation_plan.md` — Full architectural & UI implementation plan.
2. **LaTeX Paper & TikZ Figures (Visual Reference)**:
   - `/Users/boldi/PycharmProjects/spiderstate-paper/spiderstate.tex` — Full paper text (Algorithm 1 is in Section IV, Eq. 8 is CNOT cost, Fig. 4 is ZX-rewrites, Fig. 6 is $G_{\text{global}}$ & $D_{\text{global}}$, Fig. 7 is circuit extraction).
   - `/Users/boldi/PycharmProjects/spiderstate-paper/figures/building-G-and-D.tikz` — Exact TikZ node/edge styles for $G_{\text{global}}$ and $D_{\text{global}}$.
   - `/Users/boldi/PycharmProjects/spiderstate-paper/figures/full-extraction.tikz` — Exact 4-stage TikZ morph (`(a)` $\to$ `(b)` $\to$ `(c)` $\to$ `(d)`) for circuit extraction.

---

## 2. User Clarifications & Confirmed Design Decisions

During planning, the user clarified four key points:
1. **No Backtracking in Phase 3**:
   - The phrase *"and also a graph showing the backtracing"* in `docs/website_specification.md` refers to a deprecated older method. The current implementation works **without backtracking**, following Algorithm 1 of the paper.
   - Phase 3 should display the **3 synchronized panels**:
     1. **Target Bipartite ZX-Diagram** (highlighting already-added edges, the active edge $(a, b)$, and remaining edges).
     2. **Global Undirected Graph $G_{\text{global}}$** (showing the 3-ary cat state spiders, bold spanning forest $F$, blue-outlined root nodes $r_k$, and external CNOT edges added so far).
     3. **Global Causal Dependency DAG $D_{\text{global}}$** (showing solid black tree edges, dashed red `missing_link` flag-ordering edges, and dashed orange external causal edges $P_{D_{\text{global}}}(u(a)) \to u(b)$ and $P_{D_{\text{global}}}(u(b)) \to u(a)$).
2. **Single-Page Academic Project Layout**:
   - Single-page layout in `docs/src/pages/index.astro`:
     1. **Paper Hero & Abstract** (`HeroSection.astro`, already built)
     2. **Unified 5-Phase Interactive Studio** (`#studio`) with a top-level mode switch between **Step-by-Step Walkthrough Mode** and **Full Compiler GUI Mode**
     3. **Global Benchmark Explorer** (`#benchmarks`)
3. **Safe Hook-Error Splits & 3-Way Qubit Reuse**:
   - **Safe Hook-Error Splits**: Expose as an interactive, optional toggle control (both in the `[Show ZX-Rewrites]` branch view and in the Pipeline / Full GUI mode).
   - **Qubit Reuse at the End of Phase 4**: After a circuit is obtained in Phase 4, provide **3 buttons** so the user can switch between:
     - `1. No Qubit Reuse` (`reuseTarget = 'None'`)
     - `2. Optimize Depth` (`reuseTarget = 'depth'`)
     - `3. Minimize Simultaneous Qubits` (`reuseTarget = 'qubits'`)
4. **Tech Stack**:
   - **Astro 5** + **React 19** islands + **TypeScript** + **Tailwind CSS v4** + **KaTeX** + **custom SVG with D3 / `@dagrejs/dagre` / Framer Motion** + **Nanostores**.

---

## 3. Current Status: Milestones 1 & 2 Are Complete

### Milestone 1 (Completed & Verified)
- **Project Setup (`docs/`)**:
  - `docs/package.json`, `docs/astro.config.mjs`, `docs/tsconfig.json`, `docs/src/styles/global.css`.
  - `.github/workflows/deploy-pages.yml` and `.gitignore` configured for GitHub Pages deployment.
- **Asset Synchronization (`docs/scripts/sync-assets.mjs`)**:
  - Automatically runs on `predev` and `prebuild` (`npm run sync-data`).
  - Syncs **51 QECC presets** (`FAO`, `MQT`, `misc`), **593 well-ordered cat states**, and **95 simulation runs across 18 QEC codes** into `docs/public/data/` AND generates directly importable JSON bundles in `docs/src/generated/`:
    - `docs/src/generated/qeccsIndex.json` (includes `H_x, H_z, L_x, L_z` with self-dual matrices populated)
    - `docs/src/generated/catStatesBundle.json` (keyed by `"t{t}_n{n}"`)
    - `docs/src/generated/simulationSummary.json` (with Wilson 95% confidence intervals)
    - Per-code benchmark JSONs with `perfect_stim` in `docs/public/data/simulation_results/by_code/{code}.json`.
- **Page Shell**:
  - `docs/src/layouts/Layout.astro`, `docs/src/components/HeroSection.astro`, and `docs/src/pages/index.astro`.

### Milestone 2 (Completed & Verified)
All client-side compiler engine modules are implemented in `docs/src/engine/` and tested against Python `spidercss` in `docs/tests/engineParity.test.ts` (`npm --prefix docs test` passes 6/6 suites in ~90ms):

| File | Key Exported Functions / Types |
| :--- | :--- |
| `src/engine/types.ts` | `QeccPreset`, `CSSValidationResult`, `RrefTrialSnapshot`, `CostBreakdown`, `WellOrderedCatState`, `Algorithm1StepSnapshot`, `CompiledCircuitResult`, etc. |
| `src/engine/gf2.ts` | `rrefGF2(M, recordSteps)`, `nullSpaceGF2`, `solveLinearSystemGF2`, `SeededRng`, `cloneMatrix`, `multiplyGF2`, `transposeGF2` |
| `src/engine/cssState.ts` | `validateCSSCode(H_x, H_z, d)`, `matricesToPauliStrings(H_x, H_z)`, `parsePauliStrings(text)`, `getActiveMatricesForBasis(H_x, H_z, basis)`, `isPerfectCode(H, d)` |
| `src/engine/optimizeParityMatrix.ts` | `detailedCostBreakdown(M, t)`, `cnotCost(M, t)`, `ancillaCost(M, t)`, `hasUniqueOnesProperty(M)`, `findPivotsInMatrix(M)`, `performSingleRrefTrial(M, t, perm, recordSteps)`, `rowOptimizeMatrix(M, t, maxBasisTries, seed)` |
| `src/engine/hookErrors.ts` | `getConjM(M)`, `characterizeStabilizerSplits(Mz_prep)`, `computeXSpiderSplits(H, d, analyzeHookErrors)` |
| `src/engine/catState.ts` | `wellOrderedFtCatStateData(n, t, rooted)`, `wellOrderedCompositeCatStateData(ns, t)`, graph/DAG helpers (`topologicalGenerations`, `getUndirectedEdges`, `getDirectedEdges`, etc.) |
| `src/engine/heuristics.ts` | `criticalPathFirstOrder`, `earliestStartFirstOrder`, `activeSpiderFirstOrder`, `saSequenceDistanceOrder`, `randomEdgeOrder`, `planZxResourceOrder` |
| `src/engine/spiderLegMatcher.ts` | `buildGlobalPipelineAndSnapshots({ H, d, basis, analyzeHookErrors, routingHeuristic, customEdgeOrder, reuseTarget, seed })`, `matchEdges`, `materializeMatching`, `planJointExtraction` |
| `src/engine/circuitExtraction.ts` | `CatStateExtractor`, `StimCircuitBuilder`, `formatStimCircuit`, `formatQasmCircuit`, `getCnotDepth`, `getCircuitDepth`, `countCircuitMetrics` |
| `src/engine/qubitReuse.ts` | `compileFromGlobalPipeline(pipeline, reuseTarget)` (supports `'None'`, `'depth'`, `'qubits'`), `catAtOrigin(...)`, `planResourceAwareReuse(...)` |
| `src/engine/compiler.worker.ts` | Web Worker handling `OPTIMIZE_MATRIX` and `COMPILE_CIRCUIT` messages off the main thread |

---

## 4. Remaining Work: Milestones 3, 4, and 5

### Milestone 3: Shared Store + Interactive Phases 1, 2 & `[Show ZX-Rewrites]` Branch
1. **Create `docs/src/stores/compilerStore.ts`** (or top-level state inside `StudioShell.tsx`):
   - Hold:
     - `mode`: `'walkthrough' | 'gui'`
     - `selectedPresetId`: default `'FAO/7_1_3'` (Steane `[[7, 1, 3]]`)
     - `basis`: `'Z' | 'X'` (`|0̄⟩` vs `|+̄⟩`)
     - `H_x`, `H_z`, `d`
     - `rrefSnapshot`: current `RrefTrialSnapshot` & `bestMatrix` from Phase 2
     - `postPhase2Branch`: `'rewrites' | 'pipeline'`
     - `analyzeHookErrors`: `boolean` (Safe Hook-Error Splits toggle)
     - `routingHeuristic`: `RoutingHeuristicType` (default `'critical_path_first'` or `'sa_sequence_distance'`)
     - `customEdgeOrder`: `LogicalEdge[] | undefined` (when user manually clicks edges in Phase 3 Walkthrough)
     - `alg1StepIndex`: current step index `0 .. stepSnapshots.length` in Phase 3
     - `reuseTarget`: `'None' | 'depth' | 'qubits'` for the 3-way selector in Phase 4
2. **Build Phase 1 Components (`docs/src/components/phase1/`)**:
   - `Phase1CodeSpec.tsx`: Preset selector grouped by `FAO`, `MQT`, `misc` (from `src/generated/qeccsIndex.json`), `|0̄⟩` vs `|+̄⟩` toggle, distance `d` input, and `[[n, k, d]]` validation badge.
   - `StabilizerEditor.tsx`: Dual-mode editor switching between:
     - Interactive binary matrix grids for $H_x$ and $H_z$ (click cells to toggle `0`/`1`, add/remove rows/cols).
     - Pauli strings textarea (`IIIXXXX`, `IXXIIXX`, etc.) using `matricesToPauliStrings` and `parsePauliStrings`, highlighting any anti-commuting row pairs from `validateCSSCode`.
3. **Build Phase 2 Components (`docs/src/components/phase2/`)**:
   - `Phase2RrefOptim.tsx`:
     - **Walkthrough Mode**: 4 step buttons (`1. (Re-)Generate Permutation` $\to$ `2. Permute Columns` $\to$ `3. Gaussian Elimination (RREF)` with sub-step scrubber over `rowOpSteps` $\to$ `4. Un-permute Columns`).
     - **Full GUI Mode**: `max_basis_tries` input + `Run Basis Optimizer` button calling `rowOptimizeMatrix` (or `compiler.worker.ts`) and plotting `costHistory`.
   - `MatrixStepViewer.tsx`: Renders the binary matrix with emerald highlights on the unique-one pivot columns (`pivots`) and displays row weights $w_j$ and column weights $w_i$.
   - `BipartiteZxView.tsx`: Custom SVG rendering the bipartite ZX-diagram:
     - $Z$-spiders (`#86efac` fill, `#15803d` stroke) on one side, each with 1 black boundary wire to its pivot qubit $p_j$.
     - Non-pivot $X$-spiders (`#fca5a5` fill, `#b91c1c` stroke) on the other side, each with 1 black boundary wire to its data qubit $i$.
     - **Purple idealized internal edges (`#9333ea`)** between row $j$ and non-pivot column $i$ where $M'_{j,i} = 1$.
   - `CostBreakdownCard.tsx`: Renders the Eq. 8 formula (via KaTeX) and live CNOT & flag breakdown from `detailedCostBreakdown(M', t)` vs. initial cost.
4. **Build Branch View (`docs/src/components/branch/ZxRewritesView.tsx`)**:
   - Activated when user clicks **`[Show ZX-Rewrites]`** after Phase 2:
     - **Stage 1**: Unidealize internal edges (purple $\to$ black physical edges, Proposition 3.4).
     - **Stage 2**: Interactive toggle for **Safe Hook-Error Splits** (`computeXSpiderSplits`), showing which high-degree spiders split into chains of smaller spiders and how many flags are saved.
     - **Stage 3**: Unfuse high-degree spiders into 3-ary **Well-Ordered Cat States** (`wellOrderedFtCatStateData`), with a button to switch to **`[Show Pipeline]` (Phase 3)**.

---

### Milestone 4: Phase 3 ($G_{\text{global}}, D_{\text{global}}$ & Algorithm 1) & Phase 4 (Circuit Extraction + 3-Way Qubit Reuse)
1. **Build Phase 3 Components (`docs/src/components/phase3/`)**:
   - Powered by `buildGlobalPipelineAndSnapshots` in `src/engine/spiderLegMatcher.ts`.
   - `Phase3Algorithm1.tsx`: Heuristic selector (`critical_path_first`, `earliest_start_first`, `active_spider_first`, `sa_sequence_distance`, `joint_resource`, `random`), Safe Hook-Error Splits toggle, and playback controls (`|<< Reset`, `< Prev`, `Play/Pause`, `Next >`, `>>| All`, plus step slider `0 .. stepSnapshots.length`).
   - `TargetZxPanel.tsx`: Shows the target bipartite ZX-diagram with added edges (solid dark), active edge at `stepSnapshots[stepIndex - 1]` (glowing amber), and remaining edges (dashed gray; clicking a remaining edge in Walkthrough Mode appends it next).
   - `GlobalGraphPanel.tsx`: SVG visualization of $G_{\text{global}}$ up to `stepIndex`:
     - Groups nodes by their parent cat state ($Z_0 \dots Z_{r-1}$ and $X_0 \dots X_{c-1}$).
     - Draws spanning forest $F$ edges in bold (`3.2px #0f172a`), root nodes (`globalRoots`) with a blue square outline (`#2563eb`), and added CNOT edges up to `stepIndex`.
   - `GlobalDagPanel.tsx`: SVG visualization of $D_{\text{global}}$ up to `stepIndex` laid out top-to-bottom via `@dagrejs/dagre`:
     - **Solid black arrows**: `edge_type === 'tree'`.
     - **Dashed red arrows (`#dc2626`)**: `edge_type === 'missing_link'`.
     - **Dashed orange arrows (`#ea580c`)**: `edge_type === 'cnot'` added up to `stepIndex`, highlighting the active step's parent nodes `zParentGlobalNodes` and `xParentGlobalNodes` ($P_{D_{\text{global}}}(u(a)) \to u(b)$ and $P_{D_{\text{global}}}(u(b)) \to u(a)$).
2. **Build Phase 4 Components (`docs/src/components/phase4/`)**:
   - Powered by `compileFromGlobalPipeline(pipeline, reuseTarget)` in `src/engine/qubitReuse.ts`.
   - `Phase4Extraction.tsx`:
     - **4-Stage Extraction Morph (`GridZxMorphCanvas.tsx`)** matching Paper Figure 7 (`figures/full-extraction.tikz`):
       - `(a) Completed G_global` $\to$ `(b) 2D Grid-Aligned ZX` (X = topological generation in $D_{\text{global}}$, Y = qubit wire) $\to$ `(c) Identity-Padded & Unfused ZX` $\to$ `(d) Quantum Circuit`.
     - **3-Way Qubit Reuse Selector Bar**:
       - Three buttons right above the circuit viewer:
         1. **`No Qubit Reuse`** (`reuseTarget = 'None'`)
         2. **`Optimize Depth`** (`reuseTarget = 'depth'`)
         3. **`Minimize Simultaneous Qubits`** (`reuseTarget = 'qubits'`)
       - Displays live metric badges (`numQubits`, `numDataQubits`, `numFlagMeasurements`, `numCx`, `cnotDepth`, `circuitDepth`) and updates the circuit diagram immediately.
     - `QuantumCircuitSvg.tsx`: Clean horizontal quantum wire diagram rendering `R`/`RX` init boxes, vertical `CX` gates (control dot $\bullet$ and target $\oplus$), and `M`/`MX` flag measurement meters.
     - `CircuitExportBox.tsx`: Tabbed `.stim` (`compiled.stimText`) and `.qasm` (`compiled.qasmText`) code viewer with Copy & Download buttons.

---

### Milestone 5: Phase 5 Benchmarks, Final Integration & Build Verification
1. **Build Phase 5 Components (`docs/src/components/phase5/`)**:
   - Powered by `src/generated/simulationSummary.json` (and on-demand `public/data/simulation_results/by_code/{code}.json`).
   - `Phase5Benchmarks.tsx`:
     - **Contextual Code Card**: If the currently active preset in Phase 1 has benchmark data in `simulationSummary.codes`, highlights its SpiderCSS heuristics vs. Flag at Origin (FaO) across CNOTs, Flags, Simultaneous Qubits (`num_qubits_max` / `num_qubits_min`), Depth (`depth_max` / `depth_min`), Logical Error Rate (with Wilson 95% CI), and Acceptance Rate.
     - **Global Benchmark Explorer (`#benchmarks`)**: Interactive comparison across all 18 benchmarked codes, including SVG scatter plots of % improvement over FaO (reproducing Figure 1 of the paper: LER vs. Acceptance Rate improvement, and Depth vs. Simultaneous Qubits improvement) and a sortable master table (reproducing Table I of the paper).
2. **Wire `StudioShell.tsx` and `Phase5Benchmarks.tsx` into `docs/src/pages/index.astro`**.

---

## 5. Useful Commands

Run all commands from `/Users/boldi/PycharmProjects/spidercss/docs` (or use `npm --prefix docs ...` from the repo root):

```bash
# Sync data assets from ../spidercss into public/data/ and src/generated/
npm --prefix docs run sync-data

# Run the Vitest parity test suite (6/6 tests verifying TS engine vs Python)
npm --prefix docs test

# Start local Astro dev server
npm --prefix docs run dev

# Build production static site into docs/dist/
npm --prefix docs run build
```
