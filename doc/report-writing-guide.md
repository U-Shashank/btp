# MedLedger Report Writing Guide

## Goal

This guide is for writing a strong final-year project report around the MedLedger prototype, experiments, simulations, and conclusions.

The report should make four things clear:

1. what problem exists in current medical record systems
2. what MedLedger contributes technically
3. how the contribution was implemented and evaluated
4. what remains limited, especially in blockchain, regulation, and deployment realism

## Recommended Report Structure

## 1. Abstract

Include:

- healthcare data management problem
- blockchain + IPFS + patient approval idea
- dual-signature novelty
- what was implemented
- what was evaluated
- one-line conclusion

Good closing sentence style:

- “The prototype demonstrates patient-approved publication, tamper-evident storage, measurable on-chain cost, and simulation-based scaling behavior.”

## 2. Introduction

Cover:

- centralized EHR weaknesses
- patient ownership problem
- interoperability problem
- privacy and tamper-resistance motivation
- why blockchain is considered

## 3. Problem Statement

State clearly:

- doctor should not publish a final record unilaterally
- patient consent should be explicit
- medical data should not be fully exposed on-chain
- access should remain auditable and patient-controlled
- storage should remain tamper-evident

## 4. Literature Review

Use the reviewed papers for:

- experiment styles used in prior work
- common claims: latency, throughput, gas, security, usability
- gaps your project addresses

Use:

- [literature-comparison.md](/home/shash/btp/experiments/output/literature-comparison.md)

### Important comparison rule

Do not claim:

- “better than X paper” numerically

Unless the environment, load, chain, and methodology match.

## 5. Proposed System

Explain the MedLedger architecture:

- smart contracts
- backend
- IPFS storage
- frontend
- wallet-based approval flow

### Diagrams that should be present

1. System architecture diagram
2. End-to-end workflow / sequence diagram
3. Access-control diagram
4. Storage-integrity diagram
5. Optional contract interaction diagram

## 6. Implementation Details

Cover:

- `PrescriptionRegistry.sol`
- `DoctorStatusOracle.sol`
- EIP-712 signature workflow
- delegation logic
- off-chain storage model
- metrics logging

### Include at least one formula or technical expression

Useful examples:

```text
dataHash = H(record payload)
blockHash = H(index || timestamp || previousHash || dataHash || cid)
throughput = successful transactions / total wall-clock time
estimated total gas ≈ (prescription count × finalize gas) + (delegate count × delegate gas)
```

## 7. Novelty Section

Strong novelty points for MedLedger:

- dual-signature prescription publication
- patient-controlled final commit
- doctor authorization through an oracle-style registry
- off-chain medical payload with on-chain integrity anchor
- combined prototype + simulation + blockchain-only benchmark package

Do not overstate novelty as “first ever.” Say:

- “A distinguishing feature of MedLedger is…”
- “Compared with the reviewed systems, our prototype emphasizes…”

## 8. Experimental Setup

Split this into subsections:

- contract correctness and gas
- prototype measurements
- synthetic data and workload simulation
- local blockchain load test
- immutability demonstration

## 9. Results Section

### Graphs that should definitely be included

1. Prototype workflow timing chart
2. Average gas by operation
3. Transaction count vs total gas
4. Transaction count vs average latency
5. Transaction count vs p95 latency
6. Workload-simulation chart

### Tables that should be included

1. Literature comparison table
2. Contract test summary table
3. Current measured metrics table
4. Load-test summary table

## 10. Discussion Section

Good discussion points:

- why blockchain-only latency is lower than full workflow latency
- why registration costs more gas than delegation
- why off-chain storage is necessary for medical payloads
- why burst traffic matters more than quiet sequential traffic for load testing
- why simulation is still useful even when it is not a full distributed benchmark

## 11. Limitations of Blockchain

This section should definitely be present.

Include:

- public-chain latency and gas volatility
- scalability limits
- metadata leakage risk even if payload is off-chain
- key management burden
- emergency-access complexity
- immutability conflicts with correction and deletion requirements
- availability depends on continued IPFS pinning / replication
- regulatory uncertainty

## 12. HIPAA / GDPR / Regulatory Discussion

### What to say carefully

- The prototype is not claimed as HIPAA-compliant or GDPR-compliant in production form
- It is designed with privacy-preserving direction in mind
- It reduces direct on-chain exposure by keeping medical payloads off-chain
- Access control and auditability support accountability goals

### Specific issues to mention

1. HIPAA
2. GDPR
3. right to erasure vs immutability
4. metadata persistence
5. operational compliance beyond code

### Safe report phrasing

- “The architecture moves in the direction of privacy-preserving healthcare systems, but production compliance would require substantial legal, organizational, and infrastructure validation beyond this prototype.”

## 13. How the Experiments Helped

Suggested wording:

- contract tests proved that the blockchain rules are implemented correctly
- prototype metrics showed where time is spent in the full workflow
- local-chain load tests isolated on-chain behavior from frontend/backend overhead
- workload simulation helped estimate scaling trend without needing a full distributed deployment
- the hash/CID demo made immutability and content addressing easy to explain visually

## 14. Example Concept Explanations With Numbers

### Example 1: Why CID changes

If record A is:

```json
{"medicine":"Amoxicillin","dose":"500 mg"}
```

and record B changes to:

```json
{"medicine":"Amoxicillin","dose":"250 mg"}
```

then:

- content hash changes
- CID changes
- the blockchain anchor tied to the old CID is no longer a match for the new content

### Example 2: Why total gas grows

If one finalization uses about `256,532` gas, then:

```text
10 prescriptions ≈ 2,565,320 gas
100 prescriptions ≈ 25,653,200 gas
```

### Example 3: Why full workflow time is higher

If blockchain-only confirmation is around hundreds of milliseconds on local Anvil, but full prototype finalization is around seconds, then the difference is explained by:

- signature UI
- backend/API work
- encryption/decryption
- IPFS interaction

## 15. Good Conclusion Structure

Your conclusion should answer:

1. Did we solve the stated problem better than a centralized prototype would?
2. What did we actually implement?
3. What evidence supports the implementation?
4. What remains out of scope?

Suggested conclusion structure:

- MedLedger enforces patient-approved publication rather than doctor-only record creation
- it stores medical payloads off-chain and anchors integrity on-chain
- tests and measurements show reproducible blockchain and prototype behavior
- simulations and load tests provide scaling insight under stated assumptions
- compliance, real multi-node deployment, and public-network benchmarking remain future work

## 16. Appendices Worth Including

- contract test summary
- gas report excerpt
- experiment commands
- output file map
- extra graphs not used in the main body

## Final Advice

Use these phrases:

- “measured from our prototype”
- “derived from local-chain benchmark”
- “inferred from simulation based on measured values”
- “illustrated through a hash-chain / CID demonstration”

Avoid these phrases:

- “proved fully scalable”
- “proved compliance”
- “faster than prior work” without matched methodology
- “real-world blockchain performance” from Anvil-only data
