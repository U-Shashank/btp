# Local Development Guide

Follow these steps to run the full stack locally (contracts, backend API, and React dApp).

## 1. Prerequisites
- Node.js 18+ and npm
- Foundry toolchain (`curl -L https://foundry.paradigm.xyz | bash` then `foundryup`)
- MetaMask (or any injected wallet) in your browser

## 2. Smart Contracts
```bash
cd contracts
forge install
forge test
```
Deploy `PrescriptionRegistry.sol` to your preferred testnet (e.g., Sepolia or Anvil):
```bash
forge create src/PrescriptionRegistry.sol:PrescriptionRegistry \
  --rpc-url <RPC_URL> \
  --private-key <DEPLOYER_KEY>
```
Record the deployed address for later steps.
> Note: The contract ships with three prototype doctor wallets (Anvil defaults: `0x7099…79c8`, `0x3c44…93bc`, `0x90f7…b906`). Update the contract if you need different allow-listed doctors.

## 3. Backend API (`server/`)
1. Install dependencies:
   ```bash
   cd server
   npm install
   cp .env.example .env
   ```
2. Edit `.env` with:
   - `RPC_URL` — matching the chain you deployed to (Anvil URL for local testing)
   - `PRESCRIPTION_REGISTRY_ADDRESS` — contract address from the deploy step
   - `PINATA_JWT` — JWT from Pinata (Settings → API Keys)
   - `PINATA_GATEWAY` — optional custom gateway, defaults to `https://gateway.pinata.cloud/ipfs/`
3. Start the API:
   ```bash
   npm run dev
   ```
   The server listens on `http://localhost:4000` by default.

## 4. Frontend dApp (`web/`)
1. Install dependencies:
   ```bash
   cd web
   npm install
   cp .env.example .env
   ```
2. Update `.env` values:
   - `VITE_API_BASE_URL` — typically `http://localhost:4000/api`
   - `VITE_CONTRACT_ADDRESS`, `VITE_CHAIN_ID`, `VITE_RPC_URL` — align with your deployment
3. Run the dev server:
   ```bash
   npm run dev
   ```
   Vite serves the UI at the URL shown in the terminal (usually `http://localhost:5173`).
4. Connect MetaMask to the same chain (Anvil: chain id `31337`, RPC `http://127.0.0.1:8545`).

Tailwind CSS is wired via the first-party Vite plugin (see [`vite.config.js`](../web/vite.config.js)).

## 5. Workflow Tips
- Doctor flow: fill the “Doctor Workspace” form (Pinata-backed draft) and, if needed, send a “Request Patient Record Access”.
- Patient flow: review drafts/access requests, execute `finalizeDraft` / `setDelegate` from their wallet, then confirm the result with the backend so the queue reflects the chain tx.
- Use the “View Patient Prescriptions” panel to supply a patient wallet (auto-filled for patients) and list every prescription you’re authorized to read—no manual IDs required.
- `server/data/requests.json` is the local queue; clear/reset it if you want a fresh state.
- Re-run `forge test` after Solidity changes and restart backend/frontend after updating `.env`.
