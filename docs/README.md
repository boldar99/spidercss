# SpiderCSS Interactive Studio & Benchmark Explorer

The official interactive companion website and visual compiler for **SpiderCSS: Scalable Fault-Tolerant CSS State Preparation**.

This project provides an interactive in-browser compiler, educational walkthrough, and benchmark analysis studio. It compiles arbitrary CSS error-correcting codes into fault-tolerant stabilizer measurement circuits using well-ordered cat states and the SpiderCSS joint graph synthesis algorithm.

The static website is deployed to GitHub Pages at **[https://boldar99.github.io/spidercss/](https://boldar99.github.io/spidercss/)**.

---

## Features

### 1. Dual Compiler Modes
- **Step-by-Step Walkthrough Mode**: A pedagogical 5-phase journey explaining the theoretical foundations, matrix row operations, ZX-calculus rewrites, Algorithm 1 joint graph synthesis, and circuit extraction.
- **Full Compiler GUI Mode**: A streamlined single-screen synthesis dashboard for power users. Configure code parameters, pick routing heuristics, choose qubit reuse strategies, and extract circuits in one click.

### 2. 5-Phase Compilation Pipeline
- **Phase 1: CSS Code & State Specification**:
  - 51 pre-loaded benchmarked QECC presets across `FAO`, `MQT`, and `misc` families (Steane $[[7,1,3]]$, Surface $[[9,1,3]]$, Shor $[[9,1,3]]$, Color codes, Gross codes, etc.).
  - Target logical state selection: $|\overline{0}\rangle$ ($Z$-basis) or $|\overline{+}\rangle$ ($X$-basis).
  - Dual-mode interactive stabilizer editor: binary matrix grid ($H_X, H_Z$) and Pauli string format (`IIIXXXX`, `IIZZIZZ`, ...).
  - Real-time CSS commutativity validation ($H_X H_Z^T = 0 \pmod 2$) and distance $d$ / fault-tolerance $t = \lfloor(d-1)/2\rfloor$ calculation.
  - Automatic detection of "perfect" codes (Hamming, Golay) with non-pivot spider unfusion at distance $t - 1$.
- **Phase 2: Parity Matrix RREF & Basis Optimization**:
  - 4-stage interactive Gaussian elimination walkthrough:
    1. *(Re-)Generate Column Permutation* $\to$
    2. *Permute Columns* $\to$
    3. *Gaussian Elimination* (with step-by-step row operation scrubber) $\to$
    4. *Un-permute Columns*.
  - Monte Carlo basis optimizer with customizable `max_basis_tries` and real-time convergence sparkline.
  - Interactive bipartite ZX-diagram with green $Z$-spiders, red $X$-spiders, purple idealized internal edges, and black physical boundary wires.
  - Formulaic CNOT and ancilla cost breakdown (matching Paper Eq. 8).
- **Theory Branch: ZX-Rewrites View**:
  - Edge unidealization and interactive fault propagation simulator.
  - Safe Hook-Error Splits inspector and breakdown table.
  - Well-Ordered Cat State unfusion inspector with $(G, F, D)$ topologies.
- **Phase 3: Algorithm 1 Joint Graph & DAG Synthesis**:
  - Step-by-step synchronized visualization of Algorithm 1:
    - **Target Bipartite ZX Panel**: Tracks added, active, and pending edges; click any edge to schedule it next.
    - **Global Graph $G_{\text{global}}$ Panel**: Renders 3-ary cat-state clusters, bold spanning forest $F$, blue root nodes $r_k$, and external CNOT edges.
    - **Global Causal DAG $D_{\text{global}}$ Panel**: Top-to-bottom topological layout displaying solid black tree edges, dashed red `missing_link` flag ordering edges, and dashed orange causal CNOT dependency edges.
  - Routing heuristic selector (`Critical Path First`, `Earliest Start First`, `Active Spider First`, `SA Sequence Distance`, `Joint Resource`, `Random`).
  - Full playback scrubber (Reset, Step Back, Play/Pause, Step Forward, Fast-Forward, Speed Selector).
- **Phase 4: Circuit Extraction & 3-Way Qubit Reuse**:
  - 3-stage visual morph matching Paper Figure 7:
    - `(b)` 2D Grid-Aligned ZX diagram $\to$
    - `(c)` Identity-Padded & Unfused ZX diagram $\to$
    - `(d)` Extracted Quantum Circuit.
  - 3 Qubit Reuse optimization strategies:
    - `1. No Qubit Reuse`: Uses all ancillas simultaneously (minimum temporal dependency).
    - `2. Optimize Depth`: Eagerly reuses ancillas to minimize total circuit depth.
    - `3. Minimize Simultaneous Qubits`: Maximizes qubit recycling to minimize peak physical qubit footprint.
  - High-resolution SVG quantum circuit diagram with toggleable ancilla reuse lifetime bands.
  - Circuit export to **Stim** (`.stim`, with optional depolarizing noise injection at error rate $p$) and **OpenQASM 2.0** (`.qasm`).
- **Phase 5: Global Benchmark Explorer**:
  - Contextual benchmark card inside the studio comparing the current code against Flag-at-Origin (FaO).
  - Global Explorer analyzing **18 benchmarked codes across 95 simulation runs**.
  - Interactive SVG scatter plots reproducing Paper Figures 1 and 8:
    - Percentage Improvement scatter plots over FaO (LER vs. Acceptance Rate, Depth vs. Simultaneous Qubits).
    - Log-scale LER and Acceptance Rate curves with Wilson 95% confidence intervals.
    - Spacetime trajectories ($\sqrt{\text{depth}}$ vs. $\sqrt{\text{qubits}}$).
  - Interactive Table I with column sorting, code family filtering, and one-click `Load ↑` into the Studio.

---

## Tech Stack

| Layer | Technology | Description |
| :--- | :--- | :--- |
| **Framework** | [Astro 5](https://astro.build/) | Static site generator with island architecture |
| **UI Components** | [React 19](https://react.dev/) + TypeScript | Client-side reactive interactive components (`client:load`) |
| **Styling** | [Tailwind CSS v4](https://tailwindcss.com/) | CSS-first configuration (`@import "tailwindcss";`) with custom TikZ color tokens |
| **State Management** | [Nanostores](https://github.com/nanostores/nanostores) | Fast, framework-agnostic reactive state (`$compilerStore`) |
| **Graph & Layouts** | [D3](https://d3js.org/) & [@dagrejs/dagre](https://github.com/dagrejs/dagre) | Directed acyclic graph layout and custom SVG rendering |
| **Animations** | [Framer Motion](https://www.framer.com/motion/) | Smooth layout transitions and playback controls |
| **Math Rendering** | [KaTeX](https://katex.org/) | Formula formatting for stabilizer and cost equations |
| **Icons** | [Lucide React](https://lucide.dev/) | Clean, accessible iconography |
| **Web Worker** | Web Workers API | Off-main-thread Monte Carlo basis search (`compiler.worker.ts`) |
| **Testing** | [Vitest](https://vitest.dev/) | Automated unit tests ensuring parity between TypeScript engine and Python library |

---

## Architecture

```
docs/
├── public/                     # Static public assets
│   ├── data/                   # JSON data synced from spidercss Python package
│   │   ├── qeccs/              # Raw QECC code JSONs (FAO, MQT, misc)
│   │   ├── cat_states/         # Precomputed well-ordered cat state JSONs
│   │   └── simulation_results/ # Monte Carlo decoding benchmark runs
│   └── favicon.svg
├── scripts/
│   └── sync-assets.mjs         # Build script extracting and bundling data from spidercss
├── src/
│   ├── components/             # React UI components
│   │   ├── branch/             # ZX-rewrites theory branch view (Phase 2 branch)
│   │   ├── common/             # KaTeX math wrappers & common UI elements
│   │   ├── gui/                # Full Compiler GUI mode components
│   │   ├── phase1/             # Phase 1: Code spec & stabilizer editor
│   │   ├── phase2/             # Phase 2: RREF walkthrough, cost card & bipartite ZX view
│   │   ├── phase3/             # Phase 3: Algorithm 1 panels (Target ZX, G_global, D_global)
│   │   ├── phase4/             # Phase 4: Extraction morph, quantum circuit SVG & export
│   │   ├── phase5/             # Phase 5: Benchmark explorer & LER comparison plots
│   │   ├── HeroSection.astro   # Paper hero banner & metric badges
│   │   └── StudioShell.tsx     # Top-level coordinator toggling Walkthrough vs GUI
│   ├── engine/                 # Pure TypeScript compilation engine (in-browser parity with Python)
│   │   ├── catState.ts         # Well-ordered cat state retrieval & DAG extraction
│   │   ├── circuitExtraction.ts# Quantum circuit extraction & Stim/QASM builders
│   │   ├── compiler.worker.ts  # Web Worker for Monte Carlo basis optimization
│   │   ├── cssState.ts         # CSS code validation, Pauli string parsing & perfect codes
│   │   ├── gf2.ts              # Linear algebra over GF(2): RREF, null space, linear solver
│   │   ├── heuristics.ts       # Algorithm 1 edge routing heuristics
│   │   ├── hookErrors.ts       # Safe hook-error splits & stabilizer splits
│   │   ├── optimizeParityMatrix.ts # Row optimization, CNOT cost calculation & unique-ones
│   │   ├── qubitReuse.ts       # 3-way qubit reuse scheduling (None, depth, qubits)
│   │   ├── spiderLegMatcher.ts # Algorithm 1 joint graph & DAG synthesis pipeline
│   │   └── types.ts            # Core TypeScript interfaces & domain types
│   ├── generated/              # Auto-generated bundles from sync-assets.mjs
│   │   ├── catStatesBundle.json
│   │   ├── qeccsIndex.json
│   │   └── simulationSummary.json
│   ├── layouts/
│   │   └── Layout.astro        # Base HTML layout, metadata & fonts
│   ├── pages/
│   │   └── index.astro         # Single-page application root
│   ├── stores/
│   │   └── compilerStore.ts    # Nanostores reactive application state
│   └── styles/
│       └── global.css          # Tailwind CSS v4 entrypoint & TikZ color variables
├── tests/
│   └── engineParity.test.ts    # Vitest parity test suite (TS engine vs Python spidercss)
├── astro.config.mjs            # Astro configuration with React & Tailwind integrations
├── package.json
└── tsconfig.json
```

---

## Development & Usage

All commands can be run from the `docs/` directory (or from the repository root using `npm --prefix docs <command>`).

### Prerequisites
- [Node.js](https://nodejs.org/) v18+ (Node.js v20+ recommended)
- `npm`

### Installation
```bash
# From docs directory:
npm install

# Or from repository root:
npm --prefix docs install
```

### Common Commands

```bash
# 1. Synchronize data assets from ../spidercss into public/data and src/generated
npm run sync-data

# 2. Start the local Astro development server (runs sync-data automatically)
npm run dev

# 3. Run the Vitest engine parity test suite
npm test

# 4. Build static production site into docs/dist/ (runs sync-data automatically)
npm run build

# 5. Preview the production build locally
npm run preview
```

---

## Client-Side TypeScript Engine & Parity Guarantee

A core design principle of SpiderCSS Docs is that **all compilation, optimization, and visualization occurs 100% in the user's browser**. No backend server or Python runtime is required during user interaction.

The `docs/src/engine/` directory is a TypeScript port of the core `spidercss` Python package:

| Python Module (`spidercss/`) | TypeScript Module (`docs/src/engine/`) | Functionality |
| :--- | :--- | :--- |
| `css_state.py` | `cssState.ts` | CSS commutativity, Pauli strings, perfect code checks |
| `optimize_parity_matrix.py` | `optimizeParityMatrix.ts`, `gf2.ts` | GF(2) RREF, basis permutation, unique-ones, Eq. 8 CNOT cost |
| `hook_errors.py` | `hookErrors.ts` | Conjugate matrices, safe hook-error splits |
| `well_ordered_cat_state.py` | `catState.ts` | 3-ary cat state topologies, traversal DAGs |
| `spider_leg_matcher.py` & `zx_resource_scheduling.py` | `spiderLegMatcher.ts`, `heuristics.ts` | Algorithm 1 joint $G_{\text{global}}$ and $D_{\text{global}}$ synthesis |
| `circuit_extraction.py` & `stim_utils.py` | `circuitExtraction.ts` | Circuit synthesis, Stim builder, OpenQASM 2.0 formatter |
| `qubit_reuse.py` & `cat_at_origin.py` | `qubitReuse.ts` | Ancilla reuse optimization (`None`, `depth`, `qubits`) |

The parity between the Python package and the TypeScript engine is continuously validated via `docs/tests/engineParity.test.ts`.

---

## Asset Synchronization (`scripts/sync-assets.mjs`)

When new QECC codes or simulation benchmark runs are added to the Python package:
1. QECC definitions are placed in `spidercss/assets/qeccs/{FAO,MQT,misc}/*.json`.
2. Simulation runs are stored in `spidercss/simulation_results/*.json`.
3. Running `npm run sync-data` scans both directories, calculates Wilson 95% score confidence intervals, formats Table I entries, copies individual files into `docs/public/data/`, and generates lightweight, typed JSON bundles in `docs/src/generated/` for zero-latency in-app loading.

---

## Developer & AI Agent Guide

- **[AGENTS.md](./AGENTS.md)**: The authoritative developer and LLM guide detailing architectural invariants, state management patterns, UI design tokens, common modification recipes, and debugging checklists.

---

## License

This project is licensed under the same terms as SpiderCSS (see `LICENSE.txt` in repository root).
