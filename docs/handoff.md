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

## 3. Current Status: All Milestones (1–5) Are Complete

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
| `src/engine/types.ts` | `QeccPreset`, `CSSValidationResult`, `RrefTrialSnapshot`, `CostBreakdown`, `WellOrderedCatState`, `Algorithm1StepSnapshot`, `CompiledCircuitResult`, `SimulationRunSummary`, `SimulationCodeSummary`, `SimulationSummaryPayload`, etc. |
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

### Milestone 3 (Completed & Verified)
- **Shared Reactive Store & Math Helper**:
  - `docs/src/stores/compilerStore.ts`: Nanostores store (`$compilerStore`) holding `mode`, `selectedPresetId`, `basis`, `H_x`, `H_z`, `d`, `validation`, `rrefSnapshot`, `bestMatrix`, `rrefWalkthroughStage`, `rrefRowOpStepIndex`, `maxBasisTries`, `costHistory`, `postPhase2Branch`, `rewriteStage`, `analyzeHookErrors`, `routingHeuristic`, `customEdgeOrder`, `alg1StepIndex`, and `reuseTarget`.
  - `docs/src/components/common/Math.tsx`: Reusable KaTeX inline/display formula component.
- **Phase 1 Components (`docs/src/components/phase1/`)**:
  - `Phase1CodeSpec.tsx`: Grouped preset selector (`FAO`, `MQT`, `misc`), quick-select pills, $|\overline{0}\rangle$ vs. $|\overline{+}\rangle$ toggle, distance $d$ input, and `[[n, k, d]]` validation & `Perfect QECC (X/Z-spiders at t−1)` badge.
  - `StabilizerEditor.tsx`: Dual-mode interactive binary grid for $H_x, H_z$ (click to toggle `0`/`1`, add/remove rows & columns) and Pauli string editor (`I, X, Z`) with live $H_x H_z^T = 0 \pmod 2$ anti-commuting row pair highlighting.
- **Phase 2 Components (`docs/src/components/phase2/`)**:
  - `Phase2RrefOptim.tsx`: 4-stage interactive RREF walkthrough (`1. (Re-)Generate Permutation` $\to$ `2. Permute Columns` $\to$ `3. Gaussian Elimination` with row-op scrubber $\to$ `4. Un-permute Columns`), plus Web-Worker Monte Carlo basis optimizer (`max_basis_tries` + convergence sparkline) and post-Phase 2 branch selector (`[Show ZX-Rewrites]` vs. `[Show Pipeline]`).
  - `MatrixStepViewer.tsx`: Renders the binary parity matrix across all 4 stages with emerald highlights on the unique-one pivot columns (`pivots`), row weights $w_j$, and column weights $w_i$.
  - `BipartiteZxView.tsx`: Custom SVG rendering the bipartite ZX-diagram with green $Z$-spiders, red $X$-spiders, purple idealized internal edges (`#9333ea`), and black physical boundary wires (`#1e293b`).
  - `CostBreakdownCard.tsx`: KaTeX Eq. (8) cost breakdown plus the `is_perfect` QECC note showing the actual post-unfusion CNOT/flag count when Hamming or Golay codes unfuse non-pivot spiders at distance $t - 1$.
- **Branch View (`docs/src/components/branch/ZxRewritesView.tsx`) & `StudioShell.tsx`**:
  - 3-stage interactive `[Show ZX-Rewrites]` branch view: (1) Edge unidealization & interactive fault propagation tester, (2) Safe Hook-Error Splits toggle & `is_perfect` ($t-1$ unfusion for Hamming/Golay codes) breakdown table, and (3) Well-Ordered Cat State unfusion inspector `(G, F, D)`.
  - Mounted in `docs/src/pages/index.astro` via `StudioShell.tsx`.

---

### Milestone 4 (Completed & Verified)
- **Phase 3 Components (`docs/src/components/phase3/`)**:
  - `Phase3Algorithm1.tsx`: Heuristic selector (`critical_path_first`, `earliest_start_first`, `active_spider_first`, `sa_sequence_distance`, `joint_resource`, `random`), Safe Hook-Error Splits toggle, step callout banner, and playback controls (`|<< Reset`, `< Prev`, `Play/Pause`, `Next >`, `>>| All`, plus step slider `0 .. stepSnapshots.length` and speed selector).
  - `TargetZxPanel.tsx`: Renders the target bipartite ZX-diagram with added edges (solid dark with step number badges), active edge at `stepSnapshots[stepIndex - 1]` (glowing amber), and clickable remaining edges (dashed gray) that schedule any chosen edge next.
  - `GlobalGraphPanel.tsx`: Renders $G_{\text{global}}$ up to `stepIndex` with cat-state cluster boxes ($Z_0 \dots Z_{r-1}$ and $X_0 \dots X_{c-1}$), bold spanning forest $F$ edges (`3.2px #0f172a`), blue square root outlines (`#2563eb`), and external CNOT edges.
  - `GlobalDagPanel.tsx`: Top-to-bottom `@dagrejs/dagre` layout of $D_{\text{global}}$ up to `stepIndex` with solid black tree arrows, dashed red `missing_link` flag-ordering arrows, and dashed orange causal CNOT arrows highlighting $P_{D_{\text{global}}}(u(a)) \to u(b)$ and $P_{D_{\text{global}}}(u(b)) \to u(a)$.
- **Phase 4 Components (`docs/src/components/phase4/`)**:
  - `GridZxMorphCanvas.tsx`: Interactive 3-stage extraction morph matching Figure 7 of the paper (`(b) 2D Grid-Aligned ZX` rendering the completed $G_{\text{global}}$ from Phase 3 with spanning forest $F$, roots $r_k$, and external CNOTs $\to$ `(c) Identity-Padded & Unfused ZX` without state labels $\to$ `(d) Extracted Quantum Circuit` with red-ish $|0\rangle$/$\langle 0|$ and green-ish X measurement).
  - `Phase4Extraction.tsx`: Precomputes and compares all 3 Qubit Reuse modes (`1. No Qubit Reuse`, `2. Optimize Depth`, `3. Minimize Simultaneous Qubits`) with live metric badges (`Simultaneous Qubits`, `Data Qubits`, `Flag Measurements`, `CNOT Count`, `CNOT Depth`, `Total Circuit Depth`).
  - `QuantumCircuitSvg.tsx`: Horizontal quantum wire diagram rendering red-ish $|0\rangle$/$\langle 0|$, green-ish $|+\rangle$/$\langle +|$ (X measurement), `H` gates, vertical `CX` gates, clean top header without `c{...}` ruler labels, and toggleable ancilla reuse lifetime bands.
  - `CircuitExportBox.tsx`: Tabbed `.stim` (with optional depolarizing noise injection at rate $p$) and OpenQASM 2.0 (`.qasm`) code viewer with Copy & Download buttons.
- **Mounted in `StudioShell.tsx`**: Synchronized with Phase 1 & Phase 2 via `buildGlobalPipelineAndSnapshots`.

---

### Milestone 5 (Completed & Verified)
- **Phase 5 Components (`docs/src/components/phase5/`)**:
  - `LerComparisonPlot.tsx`: Interactive SVG plots reproducing Paper Figure 1 (Percentage Improvement Scatter Plots over Flag at Origin for LER vs. Acceptance Rate and Depth vs. Simultaneous Qubits with Reuse Strategy filter) and Paper Figure 8 (Log-scale LER & Acceptance Rate with 95% Wilson CI error bars across codes, plus √-scaled Depth vs. Simultaneous Qubits spacetime trajectories).
  - `Phase5Benchmarks.tsx`:
    - `Phase5ContextualCard` mounted inside `StudioShell.tsx` below Phase 4: Highlights the active code's evaluated heuristics vs. Flag at Origin, 95% Wilson CIs, one-click heuristic selection for Phase 3, and on-demand inspection of the benchmarked `perfect_stim` circuit from `public/data/simulation_results/by_code/{code}.json`.
    - `Phase5Benchmarks` mounted in `#benchmarks` of `docs/src/pages/index.astro`: Full Global Benchmark Explorer across all 18 benchmarked codes (95 simulation runs), including `LerComparisonPlot`, code family filters, reuse target view switcher, and sortable Table I (`sim_table.tex`) with one-click `Load ↑` into the compiler studio.

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
