# Anvil Blockchain Load Test Summary

Generated at 2026-04-07T16:48:02.350Z against `http://127.0.0.1:8545`.

Deployment mode: `shared`. Modes run: `burst`. Burst size: `20`.

These results come from a single-node local Anvil chain. If latency remains flat, that usually means the chain is still too idealized or underloaded.

| Operation | Mode | Tx count | Start state | End state | Avg latency (ms) | P95 latency (ms) | Avg gas | Throughput (tx/s) | Failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| registerPrescription | burst | 100 | 0 | 100 | 183.52 | 454.00 | 148739.28 | 94.70 | 0 |
| registerPrescription | burst | 500 | 100 | 600 | 110.64 | 121.00 | 148593.10 | 154.04 | 0 |
| registerPrescription | burst | 1000 | 600 | 1600 | 110.59 | 122.00 | 148607.60 | 155.57 | 0 |
| setDelegate | burst | 100 | 0 | 100 | 95.34 | 106.00 | 46339.88 | 204.50 | 0 |
| setDelegate | burst | 500 | 100 | 600 | 92.93 | 107.00 | 46339.95 | 213.58 | 0 |

## Interpretation

- `sequential` shows quiet local-chain behavior.
- `burst` is the stress mode; it is more likely to reveal queueing and rising confirmation latency.
- `shared` deployment lets state size grow across workloads, so later scenarios reflect a larger on-chain history.
- For stronger slowdown, run Anvil with delayed block production such as `anvil --block-time 1` and use larger burst counts.
