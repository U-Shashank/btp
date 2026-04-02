# Anvil Blockchain Load Test Summary

Generated at 2026-04-01T21:14:15.402Z against `http://127.0.0.1:8545`.

Deployment mode: `shared`. Modes run: `sequential, burst`. Burst size: `3`.

These results come from a single-node local Anvil chain. If latency remains flat, that usually means the chain is still too idealized or underloaded.

| Operation | Mode | Tx count | Start state | End state | Avg latency (ms) | P95 latency (ms) | Avg gas | Throughput (tx/s) | Failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| registerPrescription | sequential | 2 | 0 | 2 | 927.50 | 1115.15 | 157070.00 | 1.05 | 0 |
| registerPrescription | sequential | 5 | 2 | 7 | 969.80 | 1150.20 | 148552.80 | 1.02 | 0 |
| setDelegate | sequential | 2 | 0 | 2 | 1127.50 | 1127.95 | 46340.00 | 0.88 | 0 |
| setDelegate | sequential | 5 | 2 | 7 | 963.20 | 1126.00 | 46340.00 | 1.03 | 0 |
| registerPrescription | burst | 2 | 0 | 2 | 720.00 | 720.00 | 157096.00 | 2.65 | 0 |
| registerPrescription | burst | 5 | 2 | 7 | 1148.20 | 1153.00 | 148543.20 | 2.14 | 0 |
| setDelegate | burst | 2 | 0 | 2 | 722.00 | 722.00 | 46340.00 | 2.72 | 0 |
| setDelegate | burst | 5 | 2 | 7 | 1135.60 | 1138.00 | 46340.00 | 2.19 | 0 |

## Interpretation

- `sequential` shows quiet local-chain behavior.
- `burst` is the stress mode; it is more likely to reveal queueing and rising confirmation latency.
- `shared` deployment lets state size grow across workloads, so later scenarios reflect a larger on-chain history.
- For stronger slowdown, run Anvil with delayed block production such as `anvil --block-time 1` and use larger burst counts.
