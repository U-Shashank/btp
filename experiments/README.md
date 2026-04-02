# Experiments and Final-Review Assets

This directory adds a final-review evidence package without changing the MedLedger application code.

## Contents

- `generate-synthetic-data.js`: creates realistic synthetic patients, doctors, and prescriptions for demos and charts
- `analyze-prototype.js`: summarizes measured metrics from `server/metrics/data.json` and parses `forge test --gas-report`
- `simulate-workload.js`: turns measured averages into workload-scale simulation tables
- `simulate-blockchain.js`: demonstrates hash chaining and tamper detection in a terminal-friendly format
- `build-literature-comparison.js`: turns the reviewed papers into a comparison table focused on experiment style and conclusion style
- `anvil-load-test.js`: runs a local-chain benchmark against Anvil using repeated real smart-contract transactions
- `blockchain-demo.html`: self-contained visual demo for presentations

## Suggested Run Order

```bash
node experiments/run-all.js
```

Generated artifacts are written to `experiments/output/`.

Primary documentation:

- `/home/shash/btp/doc/experiment-handbook.md`
- `/home/shash/btp/doc/report-writing-guide.md`

If you want to run each stage independently:

```bash
node experiments/generate-synthetic-data.js
node experiments/analyze-prototype.js
node experiments/simulate-workload.js
node experiments/simulate-blockchain.js
```

## Presentation Use

- Use `prototype-summary.md` and `prototype-metrics.csv` for the results slide
- Use `workload-simulation.csv` for conclusion and scale discussion
- Use `literature-comparison.md` for the “how prior work evaluated similar systems” slide
- Use `blockchain-simulation.json` or `blockchain-demo.html` for the immutability explanation
- Use `anvil-load-test.csv` for transaction-count-versus-latency/gas graphs

Serve the HTML demo over localhost:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/experiments/blockchain-demo.html`.
