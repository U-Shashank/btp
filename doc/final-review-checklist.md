# Final Review Checklist

## Before the Presentation

Run these commands and keep the generated outputs ready:

```bash
forge test --root contracts
node experiments/run-all.js
```

If you want the visual immutability demo:

```bash
python3 -m http.server 8080
```

Then open:

- `http://localhost:8080/experiments/blockchain-demo.html`

## Live Demo Order

1. Start with the system problem and explain why centralized EHRs fail on ownership and tamper-resistance.
2. Show MedLedger workflow: doctor signs, patient approves, blockchain stores the immutable anchor.
3. Show the measured evidence:
   - contract tests passed
   - current gas numbers
   - current latency numbers
4. Show the workload simulation table to explain what happens as record volume grows.
5. End with the blockchain demo:
   - valid chain
   - tamper block 2
   - recompute only that block
   - show downstream mismatch

## Files To Keep Open

- `doc/experiment-handbook.md`
- `doc/report-writing-guide.md`
- `experiments/output/prototype-summary.md`
- `experiments/output/workload-simulation.csv`
- `experiments/output/blockchain-simulation.json`
- `doc/evaluation.md`

## Numbers To Remember

- `37/37` smart contract tests passed
- finalize gas observed in runtime metrics: `256,532`
- delegate gas observed in runtime metrics: `46,556`
- draft creation: `13.38 s`
- finalization: `12.79 s`
- encryption mean: `4.90 s`
- API latency: `19.95 ms` mean, `5.30 ms` median

## Supported Conclusions

- MedLedger already demonstrates patient-approved publication instead of doctor-only record creation.
- The prototype stores medical payloads off-chain and anchors integrity on-chain.
- Contract behavior is tested and reproducible in the current repository.
- Gas and latency evidence exists today and can be regenerated.
- Immutability can be shown visually and with hash-chain simulation.
- Local-chain load testing can separate blockchain-layer behavior from full workflow overhead.

## Backup Plan

If the full product demo becomes unstable:

1. Show `doc/evaluation.md`.
2. Show `prototype-summary.md` and `workload-simulation.csv`.
3. Run `node experiments/simulate-blockchain.js`.
4. Use `blockchain-demo.html` as the closing visual.

This still demonstrates technical contribution, experimental thinking, and blockchain reasoning even if wallet or IPFS steps fail live.
