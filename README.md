# SpiderCSS: Scalable Fault-Tolerant CSS State Preparation

SpiderCSS is a Python package and interactive visual compiler for synthesizing, analyzing, and benchmarking well-ordered fault-tolerant cat states and quantum error correction (QEC) codes, with a primary focus on CSS codes. It provides algorithms for joint causal graph synthesis, dependency scheduling, qubit-reuse-aware circuit extraction, and decoder benchmarking.

---

## Interactive Companion Website & Studio

SpiderCSS includes a full-featured, in-browser interactive companion website in `docs/`:

- **Live Site**: **[https://boldar99.github.io/spidercss/](https://boldar99.github.io/spidercss/)**
- **5-Phase Walkthrough Studio**: Step-by-step visual exploration of CSS code specification, RREF basis optimization, ZX-rewrites theory, Algorithm 1 joint graph synthesis, and circuit extraction.
- **Full Compiler GUI**: Synthesize fault-tolerant state preparation circuits directly from stabilizers in seconds.
- **Qubit Reuse Engine**: Compare `No Qubit Reuse`, `Optimize Depth`, and `Minimize Simultaneous Qubits` strategies.
- **Global Benchmark Explorer**: Interactive scatter plots and metrics reproducing Paper Figures 1 and 8 across 18 CSS codes and 95 simulation runs.
- **Circuit Export**: Download or copy `.stim` circuits (with depolarizing noise injection) and OpenQASM 2.0 (`.qasm`).

To run the interactive website locally:
```bash
cd docs
npm install
npm run dev
```
See [docs/README.md](file:///Users/boldi/PycharmProjects/spidercss/docs/README.md) for full documentation on the website and TypeScript engine.

---

## Python Package Features

- **Cat State Synthesis:** Generate and manage fault-tolerant Greenberger-Horne-Zeilinger (GHZ) / cat states with bounded hook-error propagation.
- **Algorithm 1 Joint Graph Synthesis:** Incremental construction of the global undirected graph $G_{\text{global}}$ and causal dependency DAG $D_{\text{global}}$ guaranteeing deadlock-free scheduling without backtracking.
- **Qubit-Reuse-Aware Extraction:** Extract quantum circuits optimizing for either circuit depth or active physical qubit count.
- **QEC Code Library:** Extensive collection of pre-computed CSS codes across FAO, MQT, and miscellaneous families in `spidercss/assets/qeccs/`.
- **Benchmarking & Simulation:** Monte Carlo simulation pipelines interfacing with `stim`, `sinter`, and `tesseract-decoder`.

---

## Installation

### Python Package
Install `spidercss` into your virtual environment:

```bash
git clone https://github.com/boldar99/spidercss.git
cd spidercss
pip install -e .
```

Interactive tutorials and Jupyter notebooks are available in the [`notebooks/`](file:///Users/boldi/PycharmProjects/spidercss/notebooks) directory.

### Interactive Website (`docs/`)
```bash
npm --prefix docs install
npm --prefix docs run dev
```

---

## Repository Structure

- [`spidercss/`](file:///Users/boldi/PycharmProjects/spidercss/spidercss) — Core Python library (state synthesis, graph matcher, circuit extraction, decoders, assets).
- [`docs/`](file:///Users/boldi/PycharmProjects/spidercss/docs) — Interactive companion website (Astro 5, React 19, pure TypeScript compiler engine, Tailwind v4).
- [`notebooks/`](file:///Users/boldi/PycharmProjects/spidercss/notebooks) — Jupyter notebooks demonstrating research workflows and figures.
- [`tests/`](file:///Users/boldi/PycharmProjects/spidercss/tests) — Python test suite (`pytest`).
- [`docs/tests/`](file:///Users/boldi/PycharmProjects/spidercss/docs/tests) — TypeScript engine parity test suite (`vitest`).

---

## Developer & AI Agent Guides

- **Website Development & LLM Guide**: [docs/AGENTS.md](file:///Users/boldi/PycharmProjects/spidercss/docs/AGENTS.md)
- **Root AI Agent Guide**: [AGENTS.md](file:///Users/boldi/PycharmProjects/spidercss/AGENTS.md)

---

## License

This project is licensed under the terms of the [LICENSE.txt](file:///Users/boldi/PycharmProjects/spidercss/LICENSE.txt) file.
