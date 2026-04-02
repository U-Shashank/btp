# MedLedger Evaluation Package

For the complete and current experiment reference, use [experiment-handbook.md](/home/shash/btp/doc/experiment-handbook.md). For report-writing structure and required figures, use [report-writing-guide.md](/home/shash/btp/doc/report-writing-guide.md).

## Objective

This evaluation package is designed for the final review on April 1, 2026. It converts the current MedLedger prototype into a presentation-ready evidence set with four layers:

1. measured prototype data from the running codebase
2. contract-only and local-chain blockchain measurements
3. workload-scale simulation based on those measured values
4. an explicit blockchain immutability demonstration for non-technical reviewers

The intent is to support defensible claims without overstating performance or pretending that simulated workloads are the same as production benchmarks.

## Methodology

### Measured sources from this repository

- Contract correctness from `forge test`
- Runtime metrics already logged in `server/metrics/data.json`
- Function-level gas and deployment data from `forge test --gas-report`

### Added standalone artifacts

- Synthetic dataset generator for repeatable demos
- Metrics summarizer for chart-ready CSV and JSON outputs
- Local-chain load benchmark for repeated real transactions on Anvil
- Workload simulator that scales measured averages into review-friendly scenarios
- Blockchain chain simulator and a self-contained HTML visualizer

## Current Baseline Snapshot

The current repository state already supports a functional baseline:

- Contract tests: `37/37` passed
- Finalization gas observed in integrated runtime metrics: `256,532` gas
- Delegate approval gas observed in integrated runtime metrics: `46,556` gas
- `registerPrescription` function gas from Foundry gas report: average `126,373`, median `165,516`
- `PrescriptionRegistry` deployment cost from Foundry gas report: `2,093,278` gas
- `DoctorStatusOracle` deployment cost from Foundry gas report: `677,036` gas

Current runtime averages from `server/metrics/data.json`:

| Metric | Current observed value | Sample count | Notes |
| --- | ---: | ---: | --- |
| Draft creation time | 13.38 s | 1 | Integrated prototype run |
| Finalization time | 12.79 s | 1 | Integrated prototype run |
| Delegate approval time | 7.99 s | 1 | Integrated prototype run |
| Pinata upload latency | 1.28 s | 2 | Mean over logged uploads |
| Encryption time | 4.90 s | 16 | Off-chain cryptography step |
| Decryption time | 14 ms | 3 | Wallet-side decrypt measurements |
| Overall API latency | 19.95 ms mean / 5.30 ms median | 229 | Includes one large outlier at 1420.61 ms |

Important interpretation:

- Runtime metrics are integrated prototype observations, not large-sample benchmarks.
- Foundry gas report is contract-level and should be presented separately from runtime transaction gas.
- The new experiment scripts are meant to make this evidence reproducible and easier to explain.

## How To Use the New Outputs

### 1. Measured results

Run:

```bash
node experiments/analyze-prototype.js
```

This produces:

- `experiments/output/prototype-baseline.json`
- `experiments/output/prototype-metrics.csv`
- `experiments/output/api-route-breakdown.csv`
- `experiments/output/prototype-summary.md`

Use these directly for:

- the performance table slide
- the methodology slide
- the “what is actually measured” section of the viva

### 2. Scaled simulation

Run:

```bash
node experiments/generate-synthetic-data.js
node experiments/simulate-workload.js
```

This produces workload-scale estimates for three named scenarios:

- Pilot review demo
- Department rollout
- Hospital scale simulation

Current generated simulation values:

| Scenario | Prescriptions | Delegate approvals | Estimated gas | Cumulative draft time | Cumulative finalization time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Pilot review demo | 25 | 5 | 6,646,080 | 334.50 s | 319.75 s |
| Department rollout | 100 | 20 | 26,584,320 | 1,338.00 s | 1,279.00 s |
| Hospital scale simulation | 500 | 100 | 132,921,600 | 6,690.00 s | 6,395.00 s |

Use this for claims such as:

- one on-chain transaction per finalized prescription
- linear off-chain storage growth by payload volume
- expected gas growth with more finalized prescriptions and delegate approvals

Present these as simulation outputs derived from measured prototype averages.
For presentation, state clearly that the current synthetic dataset models text prescription payloads only; PDF scans and imaging files would increase off-chain storage significantly.

### 3. Blockchain immutability explanation

Run:

```bash
node experiments/simulate-blockchain.js
```

Or serve:

```bash
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/experiments/blockchain-demo.html`

Use this to explain:

- why a CID changes when medical content changes
- why a historical block edit breaks the chain
- why blockchain does not keep the entire prescription payload on-chain

Current simulation output shows:

- original chain validates successfully
- changing block 2 data without recomputing hashes invalidates block 2 and all following blocks
- recomputing only block 2 still invalidates downstream blocks because their `previousHash` links become stale

### 4. Literature experiment comparison

Run:

```bash
node experiments/build-literature-comparison.js
```

This produces:

- `experiments/output/literature-comparison.md`
- `experiments/output/literature-comparison.csv`
- `experiments/output/literature-comparison.json`

Use this when the panel asks how similar papers evaluated their systems, especially if they bring up latency-versus-nodes or throughput-versus-load style results.

### 5. Local blockchain load test

Run with Anvil started:

```bash
node experiments/anvil-load-test.js --modes sequential --deployment-mode shared
```

This produces:

- `experiments/output/anvil-load-test.md`
- `experiments/output/anvil-load-test.csv`
- `experiments/output/anvil-load-test.json`

Current local-chain benchmark snapshot from immediate-mining Anvil:

| Operation | Tx count | Avg latency | Avg gas | Throughput |
| --- | ---: | ---: | ---: | ---: |
| `registerPrescription` | 10 | 118.30 ms | 150,191 | 6.65 tx/s |
| `registerPrescription` | 100 | 112.28 ms | 148,681 | 7.03 tx/s |
| `setDelegate` | 10 | 105.50 ms | 46,556 | 8.22 tx/s |
| `setDelegate` | 50 | 99.82 ms | 46,554 | 9.05 tx/s |

How to present this:

- this is a **single-node local Anvil blockchain benchmark**
- it measures smart-contract transaction cost and confirmation time directly
- it should be compared with your app-level timings only to show that off-chain work dominates the full workflow
- if latency stays flat, rerun in burst mode with `anvil --block-time 1` to create queueing and expose load sensitivity

## Framing Against the Reviewed Literature

Use the comparison conservatively. The reviewed papers and MedLedger do not use identical environments or testbeds, so the strongest and safest comparison is by capability and workflow design.

Defensible MedLedger claims:

- supports dual-signature prescription finalization, which directly addresses the patient-consent gap identified in the review documents
- stores medical payloads off-chain with cryptographic anchoring on-chain
- includes doctor authorization through an oracle-style allow-list contract
- demonstrates replay protection and event-based auditability in tested smart contracts
- provides a concrete immutability demonstration and measured gas/latency evidence from the actual prototype

Claims to avoid:

- “better than Paper X” on raw latency or throughput unless the workload, chain, and infrastructure are matched
- “production-ready security” without external audit, key-management study, and real deployment evidence

## Recommended Final-Review Slide Inputs

### Performance Table

Include:

- tests passed
- draft creation time
- finalization time
- delegate approval time
- finalize gas
- delegate gas
- contract deployment cost

### Literature Comparison Table

Columns:

- System
- Dual-signature approval
- Off-chain payload storage
- Patient-controlled delegation
- Doctor authorization source
- Measured prototype evidence available

### Immutability Figure

Sequence:

1. prescription JSON is encrypted
2. encrypted bundle is pinned to IPFS and receives a CID
3. CID and verified metadata are anchored on-chain
4. later payload edits change the hash and break validation

## Limitations To State Explicitly

- current runtime metrics are limited in sample count
- live backend and wallet interactions still depend on local demo conditions
- the workload model is a simulation, not a load-tested distributed deployment
- the system focuses on prescriptions and access control, not full hospital interoperability standards

Stating these clearly strengthens the credibility of the review.
