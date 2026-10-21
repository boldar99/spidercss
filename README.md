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

Clone the repository and install `spidercss` into your Python virtual environment:

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
├── cat_at_origin.py            # Primary entrypoint: end-to-end cat-at-origin state synthesis
├── css_state.py                # Multi-block logical CSS state compiler (prepare_css_state)
├── well_ordered_cat_state.py   # Fault-tolerant cat-state topologies with hook-error bounds
├── joint_extraction_planner.py # Algorithm 1 joint graph synthesis & bipartite scheduling
├── spider_leg_matcher.py       # Bipartite matching & causal dependency resolution
├── circuit_extraction.py       # Circuit extraction engine (CatStateExtractor & StimBuilder)
├── qubit_reuse.py              # Qubit reuse models & schedule compaction algorithms
├── resource_scheduling.py      # Heuristic & ILP schedulers (decross_greedy, min_qubits, etc.)
├── resource_targets.py         # ReuseTarget definitions (NONE, DEPTH, QUBITS, BALANCED)
├── optimize_parity_matrix.py   # Parity check matrix Gaussian elimination & basis optimizer
├── hook_errors.py              # Safe stabilizer split analysis & fault-propagation tracking
├── stim_utils.py               # Stim circuit utilities, CNOT depth, and gate layer calculation
├── benchmark.py                # Monte Carlo threshold simulations (Stim & Sinter pipelines)
├── lut_decoder.py              # Fast lookup-table decoder for distance-3 and distance-5 codes
├── visualize.py / draw.py      # Graph, DAG, and circuit diagram visualizers
└── assets/qeccs/               # Library of pre-computed CSS codes (FAO, MQT, and miscellaneous families)
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
