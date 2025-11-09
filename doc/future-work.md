# Future Work

## Privacy & Security

- **Oracle-Gated Releases:** Integrate a decentralized oracle (e.g., Chainlink) to get verify doctors
- **Zero-Knowledge Proofs:** Layer ZK proofs so a doctor or pharmacy can verify that a prescription meets certain criteria (e.g., dosage range, expiration date) without exposing the full payload. This can be used for compliance audits or privacy-preserving insurance claims.
- **Encrypted Storage:** Today the metadata URI points to plain JSON. We plan to store AES/GPG-encrypted blobs with patient-held keys, so IPFS/Pinata only hosts ciphertext. Front-end will handle decryption via the connected wallet.

## Lab Reports

- **Lab Onboarding:** Reuse the doctor workflow (submit draft → Pinata pin → patient approval) for labs to upload results. Labs become another allow-listed role with their own dashboard.
- **Multi-Signature Results:** Require lab signatures before the patient is prompted to countersign and publish the lab result on-chain.

## Ecosystem Integrations

- **Notification Layer:** Add webhooks/Push (e.g., EPNS) so patients/doctors are notified when drafts, access requests, or lab results arrive—today it’s manual refresh.
- **Analytics/Insights:** Aggregate anonymized metrics (with opt-in) to give health systems visibility into how often prescriptions are issued, finalized, and shared, without leaking individual data.
