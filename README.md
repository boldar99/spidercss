# SpiderCSS

SpiderCSS is a package for generating, analyzing, and benchmarking well-ordered fault-tolerant cat states and quantum error correction (QEC) codes, specifically focusing on CSS codes. It provides tools for circuit extraction, graph data management, and decoding.

## Features

- **Cat State Synthesis:** Generate and manage fault-tolerant Greenberger-Horne-Zeilinger (GHZ) / cat states.
- **Circuit Extraction:** Extraction algorithms to build traversal directed acyclic graphs (DAG) that guarantee well-ordered dependency schedules.
- **QEC Codes:** A repository of various pre-computed QEC CSS codes in JSON format (e.g., MQT, FAO, and misc).
- **Benchmarking:** Tools to benchmark decoder performance using tools like `tesseract-decoder` and `stim`.

## Installation

You can install `spidercss` via pip using the included `pyproject.toml`.

```bash
git clone https://github.com/boldar99/spidercss.git
cd spidercss
pip install -e .
```

Please check the `notebooks` directory for more examples and interactive tutorials.

## License

This project is licensed under the terms of the LICENSE.txt file.
