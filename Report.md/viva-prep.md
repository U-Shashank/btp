# Viva Prep: MedLedger Final Report and PPT

This note is written as if you are starting from zero. It explains:

- what the project is
- what exact problem it solves
- how the system works end to end
- what was implemented
- what experiments were done
- what the formulas mean
- how this work compares to prior papers
- novelty, limitations, and likely panel questions

## 1. One-Line Summary

This project proposes and implements a blockchain-based prescription record system where:

- the doctor creates a prescription draft
- the patient reviews it and must co-sign it
- only then is the record anchored on-chain
- the actual record content stays off-chain on IPFS
- the content is encrypted
- access is controlled by smart contracts

The central idea is patient-sovereign, tamper-evident, auditable prescription management.

## 2. What Problem Are We Solving?

Traditional hospital EHR systems have 3 major issues:

1. Data silos
Different hospitals and clinics keep separate records, so patient history does not move easily across providers.

2. Centralized risk
If one central server is attacked, misconfigured, or goes down, a large amount of medical data is affected.

3. Weak patient control
Patients usually cannot directly control, verify, or revoke who can access their records.

This project tries to solve those issues using blockchain, smart contracts, off-chain encrypted storage, and patient-controlled access.

## 3. Exact Scope of This Project

This is not a full hospital ERP or full EHR platform. It is mainly a prescription-record prototype.

What is in scope:

- doctor creates prescription draft
- patient reviews and approves
- on-chain prescription registration
- off-chain encrypted storage on IPFS
- doctor authorization through an oracle contract
- patient delegation of access
- re-encryption when a new delegate is added
- evaluation using tests, measurements, simulation, and benchmarking

What is out of scope:

- hospital-wide production deployment
- HIPAA/GDPR certification
- emergency override access
- full FHIR / HL7 integration
- multi-validator live blockchain benchmark
- support for large binary records like DICOM imaging

## 4. Core Idea of the Architecture

The architecture has 4 major layers:

1. Application layer
- React frontend
- different dashboards for doctor, patient, delegate, admin
- MetaMask used for wallet authentication and signing

2. Backend services layer
- Node.js / Express backend
- stores pending requests
- talks to Pinata / IPFS
- serves metadata to authorized users

3. Smart contract layer
- `PrescriptionRegistry.sol`
- `DoctorStatusOracle.sol`
- stores access control and on-chain record anchors

4. Storage layer
- IPFS via Pinata
- stores encrypted bundles off-chain
- blockchain stores only the CID / metadata pointer

## 5. Why Off-Chain Storage Is Used

Medical records should not be stored directly on-chain because:

- blockchain storage is expensive
- blockchain data is public and permanent
- large payloads are inefficient on-chain

So the design is hybrid:

- payload stays off-chain on IPFS
- only the content identifier and control state go on-chain

This keeps the chain lightweight while preserving integrity.

## 6. Main Smart Contracts

### 6.1 `PrescriptionRegistry.sol`

This is the main operational contract.

It does 5 important things:

1. `registerPrescription(...)`
- final publication function
- checks doctor is active
- checks patient address is valid
- checks signature expiry
- verifies doctor signature and patient signature
- stores `metadataURI`
- emits `PrescriptionIssued`

2. `setDelegate(address viewer, bool allowed)`
- patient grants or revokes access for another wallet

3. `canView(uint256 id, address viewer)`
- returns whether a given viewer can access a prescription
- doctor, patient, and approved delegate are allowed

4. `updatePrescriptionMetadata(uint256 id, string newURI)`
- used after re-encryption
- updates on-chain pointer to the new IPFS bundle
- only the patient can call it

5. `getPrescription(uint256 id)`
- returns prescription metadata only to an authorized caller

### 6.2 `DoctorStatusOracle.sol`

This contract manages doctor authorization.

It lets the admin:

- add a doctor
- suspend or reactivate a doctor
- check if a doctor is active

Why it matters:

- the system does not trust the backend to decide who is a valid doctor
- doctor authorization is enforced on-chain

## 7. End-to-End Workflow

### Step 1: Admin whitelists the doctor

The admin adds the doctor wallet to `DoctorStatusOracle`.

### Step 2: Doctor creates a prescription draft

The doctor:

- fills prescription details
- signs the structured EIP-712 payload
- browser encrypts the payload
- encrypted bundle is uploaded to IPFS
- backend stores a pending request

At this point, the prescription is not yet final on-chain.

### Step 3: Patient reviews the draft

The patient opens the pending request and:

- fetches the encrypted bundle
- decrypts it locally
- reviews the actual prescription data

### Step 4: Patient co-signs

If the patient agrees:

- patient signs the same EIP-712 payload
- `registerPrescription()` is submitted on-chain

### Step 5: Smart contract verifies everything

The contract verifies:

- doctor is active
- both signatures are valid
- nonce is fresh
- signature is not expired

If all checks pass, the record is finalized on-chain.

### Step 6: Delegate access

If the patient later wants to give access to a specialist or another doctor:

- patient calls `setDelegate()`
- frontend re-encrypts the bundle for the new recipient
- updated bundle gets a new CID
- patient updates the on-chain CID via `updatePrescriptionMetadata()`

## 8. Security Model

The report describes 5 defense layers.

### Layer 1: Blockchain layer

- Polygon PoS provides immutable ledger behavior
- creates auditable history

### Layer 2: Smart contract layer

- on-chain role enforcement
- nonce-based replay protection
- doctor authorization through oracle

### Layer 3: Cryptography layer

- AES-256-GCM encryption
- SHA-256 based key derivation
- ECDSA signatures via EIP-712

### Layer 4: Storage layer

- IPFS content addressing
- CID changes when content changes
- tampering becomes detectable

### Layer 5: Application layer

- HTTPS
- schema validation
- browser-side encryption

The idea is defense in depth. No single mechanism is the only line of defense.

## 9. Encryption Explained Simply

The system uses multi-recipient encryption.

### Important terms

- DEK = Data Encryption Key
- KEK = Key Encryption Key

### How it works

1. A fresh random DEK is created for one prescription.
2. The actual prescription payload is encrypted using that DEK.
3. For each authorized recipient, a KEK is derived.
4. The DEK is encrypted separately for each recipient using their KEK.
5. The bundle stored on IPFS contains:
- encrypted payload
- encrypted DEKs for each recipient
- IV and auth tags
- metadata

### Why this is useful

The same prescription can be opened independently by:

- doctor
- patient
- delegate

without re-encrypting the main payload every time someone reads it.

## 10. EIP-712 Dual Signature Explained

EIP-712 is a standard for signing structured data instead of opaque hashes.

Why it is important:

- MetaMask shows labeled, human-readable fields
- patient can see what they are signing
- safer than blind signing

In this system:

- doctor signs prescription intent
- patient signs approval for the same structured payload
- only after both signatures exist is the prescription written on-chain

This is stronger than a normal blockchain EHR that lets a doctor publish unilaterally.

## 11. All Key Formulas and What They Mean

### 11.1 Signature-based KEK derivation

From the report:

`KEK = SHA256(signature_EIP712)`

Meaning:

- user signs an EIP-712 message
- the signature is hashed
- that hash becomes the encryption key material

Why useful:

- key is derived when needed
- private key never leaves wallet
- key does not need to be stored on a server

### 11.2 Address-based KEK derivation

From the report:

`KEK = SHA256(walletAddress || prescriptionId)`

Meaning:

- concatenate wallet address and prescription identifier
- hash them
- use the result as the recipient key

Why useful:

- deterministic
- can derive a key for a delegate later
- no central key store needed

### 11.3 Payload encryption

`(ciphertext, iv, authTag) <- AES-GCM_DEK(plaintext)`

Meaning:

- plaintext is encrypted with the DEK using AES-256-GCM
- output includes ciphertext, initialization vector, and authentication tag

### 11.4 Encrypting the DEK for recipient `r`

`encryptedDEK_r <- AES-GCM_KEK_r(DEK)`

Meaning:

- every authorized user gets their own wrapped copy of the data key

### 11.5 Integrity / hash chain formulas

`dataHash = H(encryptedBundle)`

`cid ≈ H(encryptedBundle)`

`blockHash = H(index || timestamp || previousHash || dataHash || metadataURI)`

Meaning:

- if encrypted content changes, its hash changes
- then the CID changes
- if the old CID remains on-chain, mismatch is visible
- if a block is modified, its hash changes
- then the next block’s `previousHash` link breaks

### 11.6 Throughput formula

`throughput = successfulTransactions / totalWallClockTime`

Meaning:

- how many successful blockchain transactions complete per second

### 11.7 Workload projection formulas

`cumulativeDraftTime ≈ prescriptionCount × averageDraftCreationTime`

`cumulativeFinalizeTime ≈ prescriptionCount × averageFinalizationTime`

`estimatedTotalGas ≈ (prescriptionCount × averageRegisterGas) + (delegateCount × averageDelegateGas)`

Meaning:

- these are projections, not production guarantees
- they estimate scaling by multiplying measured averages

## 12. What Experiments Were Done?

The evaluation is based on 5 pillars.

### 12.1 Smart contract correctness tests

Evidence:

- 37 / 37 Foundry tests passed

What was checked:

- invalid signatures rejected
- unauthorized viewers blocked
- inactive doctors rejected
- replay attempts fail
- metadata update restricted to patient

Why important:

- proves the core contract logic behaves correctly

### 12.2 Prototype measured performance

The report gives integrated application-level metrics:

- Draft creation: 13.38 s
- Finalization: 12.79 s
- Delegate approval: 7.99 s
- Pinata upload: 1.28 s
- Encryption: 4.90 s
- Decryption: 14 ms
- API latency mean: 19.95 ms
- `registerPrescription` gas: 256,532
- `setDelegate` gas: 46,556

What this means:

- user-facing latency is dominated by signing, encryption, and IPFS
- backend API itself is not the main bottleneck

### 12.3 Local blockchain benchmark on Anvil

The report includes a contract-only benchmark with sequential and burst traffic.

Representative numbers in the report:

- `registerPrescription` sequential: 969.8 ms, 148552.8 gas, 1.02 tx/s
- `registerPrescription` burst: 1148.2 ms, 148543.2 gas, 2.14 tx/s
- `setDelegate` sequential: 963.2 ms, 46340 gas, 1.03 tx/s
- `setDelegate` burst: 1135.6 ms, 46340 gas, 2.19 tx/s

How to explain the interesting result:

- burst mode has higher per-transaction latency
- but higher total throughput
- because multiple transactions sit in the mempool together and get processed more efficiently as a batch

Important limitation:

- this is only a single-node local benchmark
- not a real multi-validator public-chain benchmark

### 12.4 Synthetic dataset generation

The project generated a deterministic synthetic dataset.

According to the report:

- 30 patients
- 8 doctors
- 120 prescriptions
- 109 approved
- 11 pending
- 24 with delegate additions

Why this matters:

- makes experiments repeatable
- gives realistic fake healthcare data
- supports downstream simulations

### 12.5 Blockchain tamper simulation

Goal:

- show why blockchain is tamper-evident

Scenarios tested:

1. Original chain
- valid

2. Tampered data only
- invalidates block 2 onward

3. Tampered block plus rehashing just that block
- still invalid because next block points to old hash

Meaning:

- changing a historical record breaks chain consistency

### 12.6 Workload projection

This estimates cumulative cost under scaled usage.

Report scenarios:

- Pilot review demo: 25 prescriptions
- Department rollout: 100 prescriptions
- Hospital scale simulation: 500 prescriptions

The report concludes growth is approximately linear because:

- one finalized prescription maps to one register transaction
- payload stays off-chain
- only metadata is anchored on-chain

## 13. What Is the Contribution / Novelty?

This is the most important viva section.

The report’s novelty is not “blockchain for healthcare” alone. That already exists.

The novelty is the combination of these features in one working prototype:

1. Patient-approved publication
- a doctor alone cannot finalize the prescription
- patient co-signature is mandatory

2. Encrypted-first off-chain storage
- actual data stays encrypted off-chain
- chain stores only the anchor

3. On-chain doctor authorization
- doctor validity is checked by `DoctorStatusOracle`
- not just by backend trust

4. Automatic re-encryption for new delegates
- when patient grants access later, old records can be updated for the new recipient

5. Reproducible multi-part evaluation
- not only a prototype demo
- also includes tests, benchmark, simulation, and literature-positioning

The strongest safe novelty statement is:

"Our work combines protocol-level patient co-signature, oracle-based doctor authorization, encrypted off-chain storage, and delegate re-encryption within one working Polygon/IPFS prototype, supported by reproducible evaluation artifacts."

## 14. How Does It Compare to Other Papers?

### MedRec (2016)

Good for:

- early blockchain healthcare concept
- access control and auditability

Gap:

- no protocol-level patient co-signature

### Chelladurai and Pandian (2021)

Good for:

- strongest performance-style evidence
- response time, throughput, CPU, memory

Gap relative to this work:

- permissioned Hyperledger model
- no recipient refresh / re-encryption workflow

### Shuaib et al. (2022)

Good for:

- strong load and latency benchmark
- multi-node style evidence

Gap:

- no patient co-signature publication workflow

### HealthChain (2024)

Good for:

- framework and scalability positioning

Gap:

- more framework-level
- limited implementation detail
- not the same exact workflow combination

### Safe comparison sentence for viva

"Prior work often demonstrates either access control, performance benchmarking, or framework design. Our system’s distinct contribution is combining patient co-signature, encrypted off-chain storage, oracle-based doctor authorization, and delegated re-encryption in one implemented prototype."

## 15. Main Strengths

If the panel asks for strengths, say:

1. Practical architecture
- puts only lightweight metadata on-chain

2. Patient consent is cryptographically enforced
- not just a UI checkbox

3. Better trust model than backend-only systems
- doctor verification and access rules are on-chain

4. Good defense-in-depth security story
- blockchain + smart contracts + encryption + IPFS + HTTPS

5. Honest evaluation
- separates prototype timing, contract-only benchmark, and simulation

## 16. Main Limitations

Be open here. Panels usually like honest limits.

1. Single-node evaluation
- local Anvil is not a live multi-validator chain

2. Not full zero-knowledge backend
- some plaintext-compatible paths still exist
- safest wording is "encrypted-first", not "zero-knowledge"

3. File-based backend store
- `requests.json` is not production-grade

4. No emergency access
- clinically important gap

5. Not compliance certified
- no formal HIPAA/GDPR audit

6. Limited data types
- mainly JSON prescription records
- not large imaging files like DICOM

7. Re-encryption cost is linear
- delegation over many historical prescriptions is slow

## 17. Best Way to Defend the Evaluation

If the panel says "your benchmark is weak", the correct answer is not to overclaim.

Say this:

"Yes, the blockchain benchmark is intentionally presented as a single-node local-chain result. We do not claim it is equivalent to a public multi-validator deployment. Its purpose is to isolate smart-contract cost from frontend signing, encryption, and IPFS overhead. For larger-scale claims, we use workload projection and clearly label it as simulation."

That is a strong and honest answer.

## 18. Possible Confusion You Should Handle Carefully

There are a few places where project docs and report wording are not perfectly identical.

Most important presentation-safe position:

- the workflow definitely uses EIP-712 for doctor and patient approval signatures
- the encryption system uses hybrid key derivation across recipients
- the system supports multi-recipient encrypted access and later delegate addition

If asked very deeply about exact implementation details of per-recipient KEK derivation, stay close to the final report wording unless the panel is reading source code live.

## 19. Slide-by-Slide Viva Narrative

Use this if you must explain the PPT in order.

### Literature survey and identified gap

Message:

- previous papers prove blockchain EHR is useful
- but none combine all the features we implemented together

### Why decentralize health records

Message:

- central systems are siloed, vulnerable, and patient-unfriendly
- decentralization improves auditability, resilience, and patient control

### Definition and scope

Message:

- we focus specifically on prescription records
- not the entire hospital information system

### Proposed architecture

Message:

- frontend handles signing and encryption
- backend manages request queue and IPFS orchestration
- contracts enforce access control
- IPFS stores encrypted bundles

### End-to-end encryption

Message:

- payload encrypted once with DEK
- DEK wrapped for each recipient using KEK
- supports doctor, patient, and delegate access

### Workflow part 1 and 2

Message:

- draft stays off-chain first
- patient reviews locally
- final blockchain write happens only after patient co-signature

### Implementation summary

Message:

- two contracts
- React frontend
- Express backend
- Pinata/IPFS
- MetaMask / Wagmi

### Measured prototype results

Message:

- real end-to-end workflow measured
- off-chain work dominates latency

### Blockchain-only benchmark

Message:

- isolates contract-layer performance
- not same as end-to-end latency

### Workload projection

Message:

- scaled estimate from measured averages
- linear growth because metadata is on-chain and payload is off-chain

### Security and correctness evidence

Message:

- tests passed
- replay resisted
- unauthorized access denied
- doctor suspension enforced
- tampering detectable

### Limitations

Message:

- this is a strong research prototype, not a production hospital deployment

### Conclusion

Message:

- the project is valuable because it proves the workflow is implementable, measurable, and defensible

## 20. Short Panel Questions with Good Answers

### Q1. Why blockchain at all? Why not just use a secure database?

A:
A secure database can store records, but it still depends on a central authority for trust, auditability, and access control. Our goal is to move trust enforcement into smart contracts so that record publication, authorization, and audit history are not controlled by one institution alone.

### Q2. Why use IPFS instead of storing everything on-chain?

A:
Medical payloads are too large and too sensitive for direct on-chain storage. IPFS gives content-addressed storage, while the blockchain stores only the CID and access-control state. This keeps costs manageable and preserves tamper evidence.

### Q3. What is the role of Polygon?

A:
Polygon is the EVM-compatible Layer-2 blockchain used to run the contracts. It gives much lower cost and faster finality than Ethereum mainnet while keeping the same smart-contract model.

### Q4. Why is dual signature important?

A:
It enforces patient consent at the protocol level. A doctor cannot unilaterally finalize a prescription on-chain. The patient must review and co-sign the same structured data.

### Q5. What exactly is novel in your work?

A:
The novelty is the combination of protocol-level patient co-signature, encrypted off-chain record storage, oracle-based doctor authorization, and delegate re-encryption in one implemented and evaluated prototype.

### Q6. Is your system fully decentralized?

A:
Not completely. Blockchain state and access control are decentralized, but the current prototype still uses Pinata for managed IPFS pinning and a backend request queue. So it is decentralized in trust-critical parts, but not fully free of service dependencies.

### Q7. What if IPFS data is modified?

A:
The CID changes because IPFS is content-addressed. Also, AES-GCM authentication fails if ciphertext is tampered with. So tampering is detectable at both storage and cryptographic levels.

### Q8. How do you prevent replay attacks?

A:
The EIP-712 payload includes a nonce and expiry time. The contract tracks doctor nonces. Once a signature is used, replaying it with the wrong nonce causes verification failure.

### Q9. Why use EIP-712 instead of simple message signing?

A:
EIP-712 shows human-readable structured fields in MetaMask. This reduces phishing and blind signing risk and gives the patient clearer visibility into what they are approving.

### Q10. Why do you need `DoctorStatusOracle`?

A:
Without it, doctor verification would happen only off-chain, which is weaker. The oracle moves doctor authorization into an auditable smart contract that can be updated by the admin.

### Q11. What are the main bottlenecks?

A:
The major bottlenecks are wallet interaction, encryption, IPFS upload, and re-encryption during delegation. The backend API is relatively fast compared to those steps.

### Q12. Why is burst throughput higher even though latency is also higher?

A:
Because throughput depends on total wall-clock completion time for the batch, not just individual transaction delay. In burst mode, transactions queue together and are cleared more efficiently, so total batch time improves even though some transactions wait longer.

### Q13. Are the benchmark results comparable to other papers?

A:
Only partially. Other papers often use different chains, permissioned setups, or multi-node validator networks. Our comparison is strongest at the level of features, workflow, and experiment style, not raw one-to-one latency numbers.

### Q14. Is the backend able to read plaintext prescriptions?

A:
In the intended main workflow, encryption and decryption happen in the browser and the backend mainly handles encrypted bundles and metadata. However, the prototype still retains some plaintext-compatible paths, so we describe it as encrypted-first rather than strict zero-knowledge.

### Q15. What happens when a new delegate is added?

A:
The patient grants access on-chain, then the frontend fetches old encrypted bundles, adds a wrapped key for the new recipient, uploads the updated bundle to IPFS, and updates the on-chain CID.

### Q16. What is the biggest limitation for real clinical use?

A:
The lack of emergency access override is the biggest functional limitation, because in real healthcare an unconscious patient may not be able to approve access when it is urgently needed.

### Q17. Why is `updatePrescriptionMetadata()` needed?

A:
Because when a new delegate is added, the encrypted bundle changes and therefore the CID changes. The blockchain must update its pointer to the new CID while preserving the original prescription identity.

### Q18. Why not simply share the DEK directly?

A:
Direct sharing would create unsafe key management and weaker isolation. Encrypting the DEK separately for each recipient gives controlled multi-recipient access and better compartmentalization.

### Q19. Does the patient pay gas?

A:
In the current workflow, the patient submits the final on-chain registration transaction, so yes, the patient pays the gas for finalization.

### Q20. If the admin controls doctor approval, is that still decentralized?

A:
It introduces a trust anchor, but the difference is that the approval history is on-chain and auditable. So the system is not trustless in that part, but it is more transparent and accountable than an invisible backend-only approval process.

## 21. Tougher Panel Questions

### Q21. Why did you choose a public EVM chain model instead of Hyperledger Fabric?

A:
Hyperledger gives stronger controlled enterprise performance, but it is permissioned and reintroduces consortium trust. We wanted a patient-sovereign model with public-chain semantics and EVM compatibility, so Polygon was a better fit for this project’s goals.

### Q22. Your workload projection is linear. Why should we trust it?

A:
We should trust it only as a bounded projection from measured averages, not as proof of production scalability. The report explicitly states that it does not model real validator contention or public-network variability.

### Q23. If old encrypted bundles stay on IPFS, does revocation really work?

A:
Revocation prevents future authorized retrieval through the current on-chain pointer and access checks, but historical copies may still exist if someone already possessed an older CID and the ability to decrypt it. That is a general challenge with distributed immutable storage and should be acknowledged honestly.

### Q24. Why is there still a backend if this is blockchain-based?

A:
Because the backend handles off-chain workflow orchestration, request queues, and Pinata integration. Blockchain alone is not a full application backend. The important point is that trust-critical authorization and final publication are moved on-chain.

### Q25. Could this support full EHR later?

A:
Yes in architecture, but not immediately in implementation. The current design is prescription-centric. Extending to lab reports, imaging, interoperability standards, and emergency workflows would require major additional work.

## 22. Best 2-Minute Viva Answer

If the panel says "Explain your project briefly", say:

"Our project is a blockchain-based prescription record system designed to give patients stronger control over how prescriptions are published and shared. The doctor first creates a prescription draft, but it is not written on-chain immediately. The patient must review the prescription and co-sign the same EIP-712 structured payload. Only then does the smart contract register the prescription on Polygon. The actual medical payload is stored off-chain on IPFS in encrypted form, while the blockchain stores only the CID and access-control state. We also added an on-chain doctor authorization contract and a delegation workflow where patients can later grant access to another provider and re-encrypt old records for them. The evaluation includes smart-contract tests, measured prototype timings, a local blockchain benchmark, workload projection, and a tamper simulation. The main contribution is combining patient co-signature, encrypted off-chain storage, doctor authorization, and delegated re-encryption in one working prototype."

## 23. Best 30-Second Conclusion

"This project shows that a patient-approved, blockchain-anchored prescription workflow is technically feasible. Its strongest contribution is not just using blockchain, but combining patient co-signature, encrypted off-chain storage, smart-contract access control, and reproducible evaluation in one prototype. At the same time, we clearly acknowledge the current limits: local-chain testing, no compliance certification, and no emergency access path yet."
