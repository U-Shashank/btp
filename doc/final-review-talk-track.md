# Final Review Talk Track

## 1. Problem

Traditional EHR systems are centralized, so they create a single point of failure, weak patient ownership, and limited auditability across institutions.

## 2. What MedLedger Changes

MedLedger does not let a doctor unilaterally publish a final record. The doctor prepares and signs the prescription, the patient reviews and co-signs it, and only then is the record anchored on-chain. This is the key workflow difference we want the review panel to remember.

## 3. What We Actually Implemented

- smart contracts for doctor authorization, prescription publication, and delegation
- off-chain storage using IPFS with on-chain metadata anchoring
- a backend and frontend prototype that exercises the complete workflow
- measured gas and latency logging from the actual prototype

## 4. How We Evaluated It

We used four layers of evidence:

1. contract correctness through automated tests
2. measured prototype metrics such as finalization time, gas, and API latency
3. local-chain load testing on Anvil to isolate blockchain-layer behavior
4. simulation and hash-chain demos to explain scaling and immutability

## 5. How This Relates To Prior Papers

Prior blockchain healthcare papers usually evaluate one or more of these:

- latency and throughput
- gas or deployment cost
- CPU and memory usage
- usability or adoption feedback

Some permissioned-blockchain papers also test how latency changes as nodes or load increase. Our current prototype is not a multi-node validator deployment, so we do not claim a node-versus-latency benchmark. Instead, we present measured prototype evidence, local-chain stress behavior, and controlled simulation based on those measurements.

## 6. Main Results To Say Out Loud

- `37/37` smart contract tests passed
- finalize gas observed in the integrated flow: `256,532`
- delegate gas observed in the integrated flow: `46,556`
- draft creation observed: `13.38 s`
- finalization observed: `12.79 s`
- API latency: `19.95 ms` mean and `5.30 ms` median
- blockchain-only confirmation on local Anvil is much lower because it excludes IPFS, API, and UI overhead

## 7. Immutability Explanation

The medical payload is stored off-chain, but its cryptographic identity is anchored on-chain. If anyone changes the historical content, the content hash changes, the block hash changes, and the chain linkage becomes invalid. That is why the record becomes tamper-evident.

## 8. Final Conclusion

Our contribution is not only that blockchain is used, but that patient consent is enforced before publication, access remains patient-controlled, and the resulting record becomes auditable and tamper-evident. The prototype is functional, tested, and supported by measurable evidence, while the scaling discussion is presented honestly as simulation rather than as a full distributed benchmark.
