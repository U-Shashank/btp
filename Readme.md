# MedLedger

MedLedger is a dual-signature prescription + lab registry. Doctors author drafts on-chain, patients co-sign before anything reaches the chain, and all downstream access is patient-controlled via wallet delegates.

## Stack
- **Contracts:** Foundry / Solidity (`contracts/PrescriptionRegistry.sol`)
- **Backend:** Node + Express (`server/`) for Pinata pinning + RPC reads
- **Frontend:** React + Vite + Tailwind (`web/`) with wagmi/MetaMask

## Quick Start
```bash
git clone <repo> && cd repo

# Contracts
cd contracts
forge install
forge test
forge create src/PrescriptionRegistry.sol:PrescriptionRegistry \
  --rpc-url <RPC_URL> \
  --private-key <DEPLOYER_KEY>

# Backend
cd ../server
npm install
cp .env.example .env    # fill RPC_URL, PRESCRIPTION_REGISTRY_ADDRESS, PINATA_JWT
npm run dev

# Frontend
cd ../web
npm install
cp .env.example .env    # fill VITE_* values matching backend
npm run dev             # http://localhost:5173
```

## Collecting Metrics
- Runtime metrics (draft creation time, finalization latency, gas usage, Pinata upload time, API latency) are logged automatically to `server/metrics/data.json`.
- Generate a summary table anytime with:
  ```bash
  node scripts/metrics-report.js
  ```
  (Ensure you’ve exercised the flows so metrics exist.)

## Workflow
1. **Doctor (allow-listed)**
   - Connect wallet → Draft prescription (`submitDraft` + Pinata pin)
   - Optionally send access request (delegation) to a patient
2. **Patient**
   - Review drafts → `finalizeDraft` to publish
   - Approve or reject doctor access requests (`setDelegate`)
   - View their history or share specific prescriptions
3. **Viewer**
   - Use “View Patient Prescriptions” panel; only sees entries they’re authorized for on-chain

Detailed flow/setup documentation lives in `doc/`.
