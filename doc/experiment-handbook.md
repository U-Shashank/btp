# MedLedger Experiment Handbook

## Purpose

This is the single reference document for all evaluation artifacts added to the MedLedger repository. It explains:

- what each experiment measures
- the logic behind each result
- where the generated outputs are stored
- what can be inferred safely
- what should not be claimed from that result

Use this as the main document for review preparation.

## Experiment Map

| Experiment | Script / Command | Needs live services? | Main outputs | What it measures |
| --- | --- | --- | --- | --- |
| Contract correctness baseline | `forge test --root contracts` | No | terminal output | smart-contract correctness |
| Contract gas baseline | `forge test --gas-report` | No | terminal output | deployment gas and per-function gas |
| Contract-only blockchain properties | `forge test --match-contract PrescriptionRegistryChainPropertiesTest -vv` | No | terminal output | authorization, access control, nonce progression, gas budgets |
| Prototype metrics summary | `node experiments/analyze-prototype.js` | No, uses existing logged metrics | `prototype-baseline.json`, `prototype-metrics.csv`, `api-route-breakdown.csv`, `prototype-summary.md` | measured app-level observations |
| Synthetic data generation | `node experiments/generate-synthetic-data.js` | No | `synthetic-dataset.json`, `synthetic-prescriptions.csv` | repeatable fake medical data |
| Workload simulation | `node experiments/simulate-workload.js` | No | `workload-simulation.json`, `workload-simulation.csv` | projected scaling from measured averages |
| Literature experiment comparison | `node experiments/build-literature-comparison.js` | No | `literature-comparison.md`, `.csv`, `.json` | how reviewed papers evaluated similar systems |
| Blockchain hash-chain simulation | `node experiments/simulate-blockchain.js` | No | `blockchain-simulation.json` | immutability and tamper propagation |
| Visual storage/integrity demo | serve `experiments/blockchain-demo.html` | Browser only | HTML page | content hash, CID change, peer storage, chain breakage |
| Local-chain load benchmark | `node experiments/anvil-load-test.js ...` | Yes, Anvil | `anvil-load-test.md`, `.csv`, `.json` | blockchain-layer gas, latency, throughput under local traffic |

## 1. Contract Correctness Baseline

### How to run

```bash
cd /home/shash/btp/contracts
forge test
```

### Logic

This verifies the smart contracts directly:

- dual-signature registration
- expiry checks
- replay protection
- doctor authorization
- delegation behavior
- metadata update restrictions

### Current meaning

If these tests pass, the on-chain rules of your design are working as implemented.

### Safe inference

- “Our blockchain logic is functionally tested.”
- “Prescription publication, doctor authorization, and delegation rules are reproducible.”

### Unsafe inference

- “The whole system is production-ready.”
- “The system is secure against every possible attack.”

## 2. Contract Gas and Chain-Property Tests

### How to run

```bash
cd /home/shash/btp/contracts
forge test --gas-report
forge test --match-contract PrescriptionRegistryChainPropertiesTest -vv
```

### Logic

These tests isolate the blockchain layer from the frontend and backend. They show:

- gas cost of deploying and calling the contracts
- gas budget of `registerPrescription`
- gas budget of `setDelegate`
- whether unauthorized actors are rejected
- whether IDs and nonces advance sequentially as records are added

### Why this matters

This is the cleanest way to talk about blockchain-specific behavior without mixing in wallet UI, API, encryption, or IPFS delay.

### Safe inference

- “Registration is the more expensive on-chain operation because it verifies signatures and stores record metadata.”
- “Delegation is cheaper because it is a simpler state update.”
- “Core blockchain behavior remains correct as records are added.”

## 3. Prototype Metrics Summary

### How to run

```bash
cd /home/shash/btp
node experiments/analyze-prototype.js
```

### Data source

- `server/metrics/data.json`
- `forge test --gas-report`

### Logic

This is a summary of measured observations from the current MedLedger prototype:

- draft creation time
- finalization time
- delegate approval time
- encryption and decryption time
- API latency
- gas from integrated runs

### Output files

- [prototype-baseline.json](/home/shash/btp/experiments/output/prototype-baseline.json)
- [prototype-metrics.csv](/home/shash/btp/experiments/output/prototype-metrics.csv)
- [api-route-breakdown.csv](/home/shash/btp/experiments/output/api-route-breakdown.csv)
- [prototype-summary.md](/home/shash/btp/experiments/output/prototype-summary.md)

### Logic behind the numbers

These values come from the system as it was run locally. They are not simulated. They are also not large-sample distributed benchmarks.

### Safe inference

- “The prototype has measurable execution cost and latency.”
- “Full workflow latency is dominated by off-chain work such as encryption, HTTP, and IPFS.”

### Unsafe inference

- “This is the final production latency.”
- “This proves public-chain scalability.”

## 4. Synthetic Dataset

### How to run

```bash
cd /home/shash/btp
node experiments/generate-synthetic-data.js
```

### Logic

This creates realistic but fake medical records so the project can be demonstrated without privacy risk.

The dataset contains:

- patients
- doctors
- prescriptions
- diagnosis summaries
- payload hashes
- CID-like identifiers

### Output files

- [synthetic-dataset.json](/home/shash/btp/experiments/output/synthetic-dataset.json)
- [synthetic-prescriptions.csv](/home/shash/btp/experiments/output/synthetic-prescriptions.csv)

### Safe inference

- “We can demonstrate the system at scale without exposing real patient data.”

## 5. Workload Simulation

### How to run

```bash
cd /home/shash/btp
node experiments/simulate-workload.js
```

### Logic

This experiment is a projection, not a benchmark.

It takes measured averages from the prototype and scales them by workload size.

The basic formulas are:

```text
cumulative draft time = prescription count × average draft creation time
cumulative finalization time = prescription count × average finalization time
cumulative delegate time = delegate approvals × average delegate time
estimated total gas = (prescriptions × average finalize gas) + (delegates × average delegate gas)
```

### Why this is useful

It answers:

- what happens if prescription count increases
- how total gas grows with transaction volume
- how off-chain storage grows with record count

### Output files

- [workload-simulation.json](/home/shash/btp/experiments/output/workload-simulation.json)
- [workload-simulation.csv](/home/shash/btp/experiments/output/workload-simulation.csv)

### Safe inference

- “Total on-chain cost grows approximately linearly with the number of finalized prescriptions.”
- “Simulation-based scaling suggests that off-chain storage is the better place for growing medical payload volume.”

### Unsafe inference

- “This is a real throughput test.”
- “This proves distributed performance.”

## 6. Literature Experiment Comparison

### How to run

```bash
cd /home/shash/btp
node experiments/build-literature-comparison.js
```

### Logic

This is not a performance experiment. It is a research framing tool.

It maps each reviewed paper to:

- experiment style
- metrics reported
- whether it really did node/load scaling
- how it should be cited safely in your review

### Output files

- [literature-comparison.md](/home/shash/btp/experiments/output/literature-comparison.md)
- [literature-comparison.csv](/home/shash/btp/experiments/output/literature-comparison.csv)
- [literature-comparison.json](/home/shash/btp/experiments/output/literature-comparison.json)

### Safe inference

- “Prior work evaluated blockchain healthcare systems using latency, throughput, gas, resource usage, and usability evidence.”
- “Explicit node-versus-latency claims usually come from multi-node permissioned deployments, not from single-node local prototypes.”

## 7. Blockchain Hash-Chain Simulation

### How to run

```bash
cd /home/shash/btp
node experiments/simulate-blockchain.js
```

### Logic

This experiment uses a simplified chain model:

```text
dataHash = H(record payload)
blockHash = H(index || timestamp || previousHash || dataHash || cid)
```

If historical data changes:

- the data hash changes
- the block hash changes
- downstream blocks no longer match the previous hash they were anchored to

### Output file

- [blockchain-simulation.json](/home/shash/btp/experiments/output/blockchain-simulation.json)

### Safe inference

- “Blockchain anchoring makes record tampering detectable.”
- “Rehashing a changed historical block does not repair the entire chain because later blocks still reference the old hash.”

## 8. Visual Storage and Integrity Demo

### How to run

```bash
cd /home/shash/btp
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/experiments/blockchain-demo.html`

### Logic

This demo combines three concepts:

1. medical record content changes cause the content hash to change
2. IPFS CID changes when content changes
3. blockchain block validity fails if historical anchored content is modified

It also shows the peer-to-peer storage idea: multiple peers may pin the same CID, but if content changes, a new CID must be distributed.

### Safe inference

- “IPFS is content addressed.”
- “A changed record becomes a new object with a new CID.”
- “The blockchain anchor tied to the old CID no longer matches the changed content.”

## 9. Local Blockchain Load Benchmark

### Baseline run

```bash
cd /home/shash/btp/contracts
anvil
```

Then:

```bash
cd /home/shash/btp
node experiments/anvil-load-test.js --modes sequential --deployment-mode shared --register-counts 10,100,500 --delegate-counts 10,100,500
```

### Stress run

```bash
cd /home/shash/btp/contracts
anvil --block-time 1
```

Then:

```bash
cd /home/shash/btp
node experiments/anvil-load-test.js --modes burst --burst-size 20 --deployment-mode shared --register-counts 100,500,1000 --delegate-counts 100,500 --polling-interval 200
```

### Logic

This is a local-chain benchmark using real transactions.

It measures:

- transaction confirmation latency
- gas used
- total gas
- throughput
- failure count
- state growth during shared deployments

### Important interpretation

- `sequential` mode shows quiet local-chain behavior
- `burst` mode is the stress mode
- `shared` mode lets contract state accumulate over time
- `fresh` mode isolates each workload from previous state

### Output files

- [anvil-load-test.md](/home/shash/btp/experiments/output/anvil-load-test.md)
- [anvil-load-test.csv](/home/shash/btp/experiments/output/anvil-load-test.csv)
- [anvil-load-test.json](/home/shash/btp/experiments/output/anvil-load-test.json)

### Logic behind latency changes

Latency should remain fairly flat on a very idealized chain with immediate mining.

If you want latency to rise meaningfully with load, create queueing:

- use `burst` mode
- use larger workloads
- use `anvil --block-time 1`

This creates a backlog of pending transactions and makes confirmation delay more visible.

### Safe inference

- “On a single-node local chain, MedLedger sustains repeated transactions with measurable gas and latency.”
- “Under burst traffic and delayed block production, confirmation behavior becomes load-sensitive.”
- “Gas remains relatively stable per operation, while latency reflects queueing conditions.”

### Unsafe inference

- “This proves Polygon mainnet performance.”
- “This proves multi-node scalability.”

## How to Convert Results Into Graphs

### Best graphs from the current package

1. operation vs average gas
2. transaction count vs total gas
3. transaction count vs average latency
4. transaction count vs p95 latency
5. prototype workflow step vs average time
6. literature comparison table by experiment style

### Most useful CSV files

- [prototype-metrics.csv](/home/shash/btp/experiments/output/prototype-metrics.csv)
- [api-route-breakdown.csv](/home/shash/btp/experiments/output/api-route-breakdown.csv)
- [workload-simulation.csv](/home/shash/btp/experiments/output/workload-simulation.csv)
- [anvil-load-test.csv](/home/shash/btp/experiments/output/anvil-load-test.csv)
- [literature-comparison.csv](/home/shash/btp/experiments/output/literature-comparison.csv)

## Final Safe Summary

Use this sentence pattern in the report:

- “From contract-only tests, we verified the correctness and gas behavior of the blockchain layer.”
- “From prototype logs, we measured the end-to-end workflow overhead of the implemented system.”
- “From workload simulation, we projected how cost and time scale with increasing prescription volume.”
- “From local-chain load tests, we observed how on-chain confirmation behavior changes under quiet and burst traffic.”
- “From the hash-chain and CID demonstration, we showed why post-publication tampering becomes detectable.”
