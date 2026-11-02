# SpiderCSS: Scalable Fault-Tolerant CSS State Preparation

SpiderCSS is a Python package and interactive visual compiler for synthesizing, analyzing, and benchmarking well-ordered fault-tolerant cat states and quantum error correction (QEC) codes, with a primary focus on CSS codes. It provides algorithms for joint causal graph synthesis, dependency scheduling, qubit-reuse-aware circuit extraction, and decoder benchmarking.

For theoretical foundations and benchmark evaluations, see our paper:  
📄 **[SpiderCSS: Scalable Fault-Tolerant CSS State Preparation (arXiv:2610.03714)](https://arxiv.org/abs/2610.03714)**

---

## 🌐 **[https://boldar99.github.io/spidercss](https://boldar99.github.io/spidercss)** 🌐
*Check out the interactive web studio to explore fault-tolerant CSS state synthesis, graph rewrites, and benchmark results directly in your browser without any installation.*

---

## ⚡ Quickstart

### Installation

SpiderCSS requires **Python $\ge 3.10$**.
Clone the repository and install the pinned dependencies into your virtual or Conda environment:

```bash
git clone https://github.com/boldar99/spidercss.git
cd spidercss
pip install -e .
```

### Basic Example: Synthesizing a CSS Code State

Synthesize a fault-tolerant preparation circuit for the Steane $[[7, 1, 3]]$ code with active qubit reuse:

```python
from spidercss.utils import load_qecc
from spidercss.cat_at_origin import cat_at_origin
from spidercss.resource_targets import ReuseTarget

# Load pre-computed Steane [[7, 1, 3]] code
is_self_dual, H_x, H_z, L_x, L_z, d = load_qecc("7_1_3")

# Synthesize circuit optimizing for minimum simultaneous qubits
circuit = cat_at_origin(
    H_x,
    d,
    basis="Z",
    reuse_target=ReuseTarget.QUBITS,
    analyze_hook_errors=True,
)

print(f"Synthesized circuit: {circuit.num_qubits} qubits, {len(circuit)} instruction blocks.")
```

### Multi-Block Logical State Preparation

Prepare an encoded logical Bell pair across two blocks of the $[[7, 1, 3]]$ code:

```python
import stim
from spidercss.css_state import prepare_css_state
from spidercss.resource_targets import ReuseTarget

# Define the logical program: prepare |+> on block 0, |0> on block 1, then apply logical CNOT
logical_bell = stim.Circuit("""
    RX 0
    R 1
    CX 0 1
""")

# Compile into a fault-tolerant physical circuit
bell_circuit = prepare_css_state(
    logical_bell,
    code="7_1_3",
    strategy="global",              # Joint preparation of both code blocks
    reuse_target=ReuseTarget.QUBITS,
)

print(f"Logical Bell circuit synthesized with {bell_circuit.num_qubits} physical qubits.")
```

---

## 📊 Reproducing Paper Results (Table I, Figures & FT Verification)

All pre-synthesized circuits (`spidercss/assets/circuits/SpiderCSS/` and `spidercss/assets/circuits/FAO/`) and Monte Carlo simulation outputs (`spidercss/simulation_results/`) are deposited in the repository.
Circuit generation, Monte Carlo benchmarking, fault-tolerance verification, and table/plot generation are decoupled so you can either regenerate Table I instantaneously from deposited data or run the full pipeline end-to-end.

### 1. Instant Reproduction from Deposited Data (< 5 seconds)

Regenerate the exact LaTeX source for **Table I** and the paper figures in `spidercss/plots/` directly from `spidercss/simulation_results/`:

```bash
# Print the LaTeX source for Table I
python -m spidercss.generate_table

# Regenerate benchmark comparison plots in spidercss/plots/
python -m spidercss.visualize
```

### 2. Exact Fault-Tolerance Verification (~20 seconds)

Verify the fault tolerance ($t = \lfloor d / 2 \rfloor$) of the SpiderCSS state preparation circuits from Table I:

```bash
# Verify all best Table I circuits up to n = 31 qubits (7_1_3 through 31_1_7)
python -m spidercss.fault_tolerance_verification --max_qubits 31

# Or verify specific codes (including X-basis |+> states such as 49_1_5)
python -m spidercss.fault_tolerance_verification --codes 7_1_3 9_1_3 17_1_5 49_1_5
```

### 3. Pre-Generating Deposited Circuits (`generate_circuit.py`)

All three circuit variants per code are deposited in `spidercss/assets/circuits/SpiderCSS/` and `spidercss/assets/circuits/FAO/`:
- `{code}_qubits.stim`: Maximum qubit reuse (`ReuseTarget.QUBITS`, minimizing simultaneous physical qubits).
- `{code}_depth.stim`: Minimum qubit reuse (`ReuseTarget.DEPTH`, minimizing CNOT depth).
- `{code}_{routing_heuristic}.stim` (SpiderCSS) and `{code}_scheduled.stim` (FAO): Scheduled no-reuse circuits used for Monte Carlo logical error rate (LER) and acceptance rate (AR) simulations.

To re-synthesize the circuits from the code parity-check matrices in `spidercss/assets/qeccs/` (using deterministic per-code SHA-256 seeds `int(sha256(code)[:8], 16) % (2**31 - 1)`):

```bash
# Generate circuits for specific codes (e.g. distance 3 and 5 codes; ~10 seconds)
python -m spidercss.generate_circuit --codes 7_1_3 9_1_3 17_1_5 25_1_5

# Generate all 18 benchmark codes across all 5 routing heuristics (~10–15 minutes with 4 workers)
python -m spidercss.generate_circuit --all-heuristics --workers 4

# Or extract the exact scheduled circuits directly from simulation_results/*.json (< 5 seconds)
python -m spidercss.generate_circuit --extract-from-results
```

### 4. Running Monte Carlo Benchmarks (`benchmark.py`)

`spidercss/benchmark.py` loads the pre-generated `.stim` circuits directly from `spidercss/assets/circuits/` (requiring zero circuit synthesis or CP-SAT scheduling at benchmark time) and caches shot counts in `spidercss/simulation_results/{code}_{circuit_hash}.csv`:

```bash
# Benchmark specific codes (hits cached CSV results immediately if requested samples <= cached samples)
python -m spidercss.benchmark --codes 7_1_3 17_1_5 144_12_12

# Run a quick fresh simulation override with custom sample count and error rate (~5 seconds)
python -m spidercss.benchmark --codes 7_1_3 9_1_3 --samples 1000000 --p 0.001

# Benchmark all deposited routing heuristics for selected codes
python -m spidercss.benchmark --codes 17_1_5 25_1_5 --all-heuristics
```

### 5. Running the Test Suite

```bash
python -m unittest discover -s tests
```

---

## 📓 Interactive Notebook Tutorials & Demos

Interactive tutorials and research workflows are located in the [`notebooks/`](notebooks) directory:

| Notebook | Focus & Description | Key Concepts Demonstrated |
| :--- | :--- | :--- |
| **[`cat_at_origin.ipynb`](notebooks/cat_at_origin.ipynb)** | **End-to-End CSS State Preparation**<br>The primary workflow for compiling a CSS code into a fault-tolerant state preparation circuit. | • Parity matrix loading (`load_qecc`)<br>• `cat_at_origin()` synthesis<br>• Safe stabilizer splits & hook-error analysis<br>• Timeline circuit diagrams<br>• Qubit reuse planning (`plan_resource_aware_reuse`) |
| **[`bell_states.ipynb`](notebooks/bell_states.ipynb)** | **Fault-Tolerant Bell State Preparation**<br>Synthesize encoded logical Bell pairs across CSS codes (Steane $[[7,1,3]]$, $[[17,1,5]]$, etc.). | • `prepare_css_state()` high-level API<br>• Comparison: **Global Joint Synthesis** vs. **Local Transversal CNOTs**<br>• Stim simulation & post-selected state verification |
| **[`test_split_cat.ipynb`](notebooks/test_split_cat.ipynb)** | **Well-Ordered Cat State Topologies**<br>Low-level construction and inspection of composite cat states. | • `well_ordered_composite_cat_state_data()`<br>• Forest decomposition & root selection<br>• Causal dependency DAG creation<br>• `CatStateExtractor` extraction |
| **[`circ_to_dag.ipynb`](notebooks/circ_to_dag.ipynb)** | **Stim Circuit to Dependency DAG**<br>Transforming raw quantum circuits into DAG representations. | • Converting Stim operations into NetworkX DAGs<br>• Dependency analysis & topological visualization |

---

## 🗺️ Codebase Navigation Guide

If you are exploring the source code or building upon SpiderCSS, here is a map of the key modules and their responsibilities:

```
spidercss/
├── cat_at_origin.py                  # Primary entrypoint: end-to-end cat-at-origin state synthesis
├── css_state.py                      # Multi-block logical CSS state compiler (prepare_css_state)
├── well_ordered_cat_state.py         # Fault-tolerant cat-state topologies with hook-error bounds
├── joint_extraction_planner.py       # Algorithm 1 joint graph synthesis & bipartite scheduling
├── spider_leg_matcher.py             # Bipartite matching & causal dependency resolution
├── circuit_extraction.py             # Circuit extraction engine (CatStateExtractor & StimBuilder)
├── qubit_reuse.py                    # Qubit reuse models & schedule compaction algorithms
├── resource_scheduling.py            # Heuristic & ILP schedulers (decross_greedy, min_qubits, etc.)
├── resource_targets.py               # ReuseTarget definitions (NONE, DEPTH, QUBITS, BALANCED)
├── optimize_parity_matrix.py         # Parity check matrix Gaussian elimination & basis optimizer
├── hook_errors.py                    # Safe stabilizer split analysis & fault-propagation tracking
├── stim_utils.py                     # Stim circuit utilities, CNOT depth, and gate layer calculation
├── generate_circuit.py               # Synthesizes and deposits SpiderCSS & FAO circuits (.stim)
├── benchmark.py                      # Monte Carlo threshold & LER/AR simulations from deposited circuits
├── fault_tolerance_verification.py   # Exact combinatorial & ILP fault-tolerance verification (verify_ftsp)
├── generate_table.py                 # Generates the LaTeX source for Table I from simulation_results/
├── visualize.py                      # Parses simulation_results/ and renders paper figures to plots/
├── lut_decoder.py                    # Fast lookup-table decoder for code-capacity syndrome decoding
├── draw.py                           # Graph, DAG, and circuit diagram visualizers
├── assets/circuits/                  # Deposited .stim circuits for SpiderCSS and Flag at Origin (FAO)
├── assets/qeccs/                     # Library of pre-computed CSS codes (FAO, MQT, and miscellaneous families)
└── simulation_results/               # Deposited Monte Carlo simulation JSON summaries and CSV shot caches
```

---

## 📂 Repository Structure

- [`spidercss/`](spidercss) — Core Python library (state synthesis, graph matcher, circuit extraction, decoders, assets).
- [`notebooks/`](notebooks) — Jupyter notebooks demonstrating research workflows, tutorials, and figures.
- [`tests/`](tests) — Python test suite (`pytest`).
- [`docs/`](docs) — Interactive companion website.

---

## 📜 Citation & License

If you use SpiderCSS in your research, please cite our paper ([arXiv:2610.03714](https://arxiv.org/abs/2610.03714)):

```bibtex
@misc{poor2026spidercssscalablefaulttolerantcss,
  title={SpiderCSS: Scalable Fault-Tolerant CSS State Preparation}, 
  author={Po{\'o}r, Boldizs{\'a}r and Andrey Boris Khesin and Sarah Meng Li and Benjamin Rodatz and John van de Wetering and Richie Yeung},
  year={2026},
  eprint={2610.03714},
  archivePrefix={arXiv},
  primaryClass={quant-ph},
  url={https://arxiv.org/abs/2610.03714},
}
```

This project is licensed under the Apache 2.0 License. See [LICENSE.txt](LICENSE.txt) for details.
