# Local Setup Steps

1. **Clone & Install Dependencies**
   ```bash
   git clone <repo>
   cd repo/contracts && forge install
   cd ../server && npm install
   cd ../web && npm install
   ```

2. **Deploy the Contract**
   ```bash
   cd contracts
   forge create src/PrescriptionRegistry.sol:PrescriptionRegistry \
     --rpc-url <RPC_URL> \
     --private-key <DEPLOYER_KEY>
   ```
   Note the deployed address.

3. **Configure the Backend (`server/.env`)**
   ```
   RPC_URL=http://127.0.0.1:8545
   PRESCRIPTION_REGISTRY_ADDRESS=0x...
   PINATA_JWT=<scoped_jwt_with_pinJSON_permission>
   PINATA_GATEWAY=https://your-gateway.mypinata.cloud
   ```
   Then run `npm run dev`.

4. **Configure the Frontend (`web/.env`)**
   ```
   VITE_API_BASE_URL=http://localhost:4000/api
   VITE_RPC_URL=http://127.0.0.1:8545
   VITE_CHAIN_ID=31337
   VITE_CONTRACT_ADDRESS=0x...
   ```
   Run `npm run dev`.

5. **Workflow**
   - Doctor wallet (allow-listed) submits drafts and access requests.
   - Patient wallet finalizes drafts and grants delegates.
   - Doctors retrieve patient history via the “View Patient Prescriptions” panel once access is granted.
