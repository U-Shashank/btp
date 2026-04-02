# Blockchain Load Test Guide

## What This Test Is

This benchmark measures the **smart-contract layer on a local Anvil chain** using repeated real transactions. It is implemented in [anvil-load-test.js](/home/shash/btp/experiments/anvil-load-test.js).

It can now run in two traffic modes:

- `sequential`: one transaction at a time
- `burst`: multiple transactions submitted together to create contention

It can also run in two deployment modes:

- `fresh`: redeploy contracts for each workload
- `shared`: keep the same deployment and let on-chain state grow across workloads

## What This Test Is Not

It is **not**:

- a frontend/backend benchmark
- an IPFS benchmark
- a multi-node validator benchmark
- a public-chain performance claim

So present it as:

- “local blockchain load test”
- “single-node Anvil benchmark”
- “on-chain transaction benchmark”

## Recommended Way To Run It

### Baseline run

Use this to show quiet local-chain behavior:

```bash
cd /home/shash/btp/contracts
anvil
```

Then in another terminal:

```bash
cd /home/shash/btp
node experiments/anvil-load-test.js --modes sequential --deployment-mode shared --register-counts 10,100,500 --delegate-counts 10,100,500
```

### Stress run

Use this if you want latency to rise more clearly under offered load:

```bash
cd /home/shash/btp/contracts
anvil --block-time 1
```

Then in another terminal:

```bash
cd /home/shash/btp
node experiments/anvil-load-test.js --modes burst --burst-size 20 --deployment-mode shared --register-counts 100,500,1000 --delegate-counts 100,500
```

This is the more meaningful “load vs latency” setup.

## Generated Outputs

The script writes:

- `experiments/output/anvil-load-test.json`
- `experiments/output/anvil-load-test.csv`
- `experiments/output/anvil-load-test.md`

## Important Options

- `--modes sequential,burst`
- `--deployment-mode fresh|shared`
- `--burst-size 10`
- `--register-counts 10,100,500,1000`
- `--delegate-counts 10,100,500`
- `--rpc-url http://127.0.0.1:8545`

## How To Read The Results

### Latency

This is the time from **transaction submission to receipt confirmation** on local Anvil.

Interpretation:

- lower than end-to-end prototype latency is expected
- this excludes IPFS upload, UI time, wallet popup delay, and browser cryptography
- this tells you how the contract behaves on a local blockchain

### Gas

This is the blockchain execution cost of the transaction.

Interpretation:

- stable average gas means the contract logic cost is predictable
- total gas should grow roughly linearly with transaction count
- gas is mostly independent of local block timing

### Throughput

This is:

- completed transactions / total wall-clock time

Interpretation:

- useful for comparing `registerPrescription` and `setDelegate`
- useful for showing where the local chain begins to saturate

### Start State / End State

These columns matter in `shared` mode.

Interpretation:

- they show how much contract state existed before and after the workload
- later workloads in shared mode run on a larger history than early workloads

## What To Expect

### If you run immediate-mining Anvil

Latency may stay fairly flat even when transaction count rises.

That does **not** mean the test is wrong. It means:

- the chain is too idealized
- blocks are produced too quickly
- there is not enough queueing pressure

### If you run burst mode with `--block-time 1`

Latency is more likely to increase as transaction count grows because:

- more transactions compete for inclusion
- receipts wait for the next mined block
- burst traffic creates queueing

This is the setup you want if the panel expects a stronger load-vs-latency story.

## Recommended Graphs

### Graph 1: Transaction Count vs Average Latency

- x-axis: transaction count
- y-axis: average latency in ms
- separate lines for:
  - `registerPrescription sequential`
  - `registerPrescription burst`
  - `setDelegate sequential`
  - `setDelegate burst`

Conclusion:

- burst mode should reveal load sensitivity more clearly than sequential mode

### Graph 2: Transaction Count vs P95 Latency

- x-axis: transaction count
- y-axis: p95 latency in ms
- separate series by operation

Conclusion:

- tail latency is a better indicator of congestion than average latency

### Graph 3: Transaction Count vs Total Gas

- x-axis: transaction count
- y-axis: total gas

Conclusion:

- total on-chain cost grows roughly linearly with workload

### Graph 4: Operation Type vs Average Gas

- categories:
  - `registerPrescription`
  - `setDelegate`

Conclusion:

- registration is more expensive because it verifies signatures and stores prescription metadata

## Safe Conclusions You Can Draw

- “On a local Anvil blockchain, MedLedger sustained repeated real contract transactions with measurable gas, latency, and throughput.”
- “In quiet sequential mode, on-chain latency remained relatively stable across workloads.”
- “In burst mode with delayed block production, latency is expected to rise more clearly because transactions queue for confirmation.”
- “Registration remained more expensive than delegation because it performs signature verification and persistent record creation.”
- “Total gas grew approximately linearly with the number of submitted transactions.”

## Conclusions You Should Avoid

- “This proves public-chain performance.”
- “This proves multi-node blockchain scalability.”
- “This matches Polygon mainnet latency.”
- “This is the exact real-world deployment latency.”

## Best Way To Explain The Difference From Your Prototype Timings

Say:

- “The prototype workflow includes off-chain work such as encryption, backend processing, and IPFS interaction.”
- “The Anvil benchmark isolates only the blockchain transaction layer.”
- “Therefore the blockchain-only latency is lower, while the stress configuration tells us how confirmation behavior changes when local chain load increases.”
