# Healthcare Record Flow (Updated)

## 1. Doctor Prescribes → Pinata
1. Doctor authenticates in the dApp via MetaMask (wagmi) and fills the “Doctor Workspace” form. The contract ships with a small hard-coded allowlist, so only those wallets can submit drafts.
2. The UI first calls `submitDraft(patient)` on the registry, producing a `draftId`, and then calls `POST /api/requests` with the metadata payload, the new `draftId`, and the draft transaction hash.
3. The Express server validates the payload, pins it to Pinata using the configured JWT, and stores the resulting CID + metadata alongside the `draftId` in `server/data/requests.json`.
4. Each request is marked `pending` until the matching patient finalizes it on-chain.

## 2. Patient Approval Queue
1. Patients open the “Requests” tab and fetch their queue via `GET /api/requests?address=<wallet>`.
2. Cards show doctor/patient addresses, timestamps, and a link to the pinned IPFS payload; manual refresh matches the requirement (no push notifications yet).
3. When a patient selects “Sign & Publish,” the frontend triggers `POST /api/requests/:id/approve` with their wallet header.

## 3. Relayer Anchors On-Chain
1. When a patient clicks “Sign & Publish,” the UI calls `finalizeDraft(draftId, metadataURI)` directly from their wallet.
2. The contract finalizes the draft, mints the immutable prescription, and emits `DraftFinalized`/`PrescriptionIssued` events.
3. The UI then notifies the backend via `POST /api/requests/:id/approve` so the queue reflects the recorded prescription ID + tx hash.

## 4. Doctor Access Requests (Global Delegation)
1. Doctors can also hit `POST /api/requests` with `kind: "access"` plus a reason (no Pinata step).
2. Patients approve from the UI, which calls `setDelegate(doctor, true)` directly on the registry from the patient wallet.
3. Delegations are stored on-chain in `patientDelegates`, and the UI surfaces “Active Doctor Grants” for visibility. The backend is only informed after the on-chain tx succeeds.

## 5. Retrieval
1. Any viewer (doctor, patient, or approved delegate) hits `GET /api/prescriptions/:id` and includes their wallet in the `x-viewer` header for a one-off lookup.
2. Doctors (or patients) can fetch the entire history via `GET /api/patients/:address/prescriptions`; the backend filters recorded entries to only those the viewer can read on-chain.
3. Future: attach encrypted payload stores/IPFS downloads + audit trails.

## 6. Future Lab Reports
1. Labs will reuse the request queue: pin result → await patient approval → relayer anchors.
2. Patients countersign before labs share with other parties, ensuring parity with prescriptions.

## 7. Deferred Zero-Knowledge Upgrade
- Still reserved for later: ability to prove prescription validity/details via ZK without revealing the raw payload.

---

## Current Implementation Snapshot

### Smart Contracts (`contracts/`)
- `PrescriptionRegistry.sol` no longer relies on a relayer. Allow-listed doctors call `submitDraft(patient)`, while patients execute `finalizeDraft(draftId, metadataURI)` to mint immutable records.
- `patientDelegates` + `setDelegate(viewer, allowed)` let patients approve/revoke blanket doctor access themselves.
- Forge tests cover doctor gating, draft lifecycle, delegations, and unauthorized viewer protection (`forge test`).

### Backend API (`server/`)
- `POST /api/requests` — still supports `prescription` (now requires the on-chain `draftId` + tx hash) and `access` (reason only). Pinning happens only for prescription payloads.
- `GET /api/requests` — doctor/patient fetch their queue (pending + completed).
- `POST /api/requests/:id/approve` — now simply records the chain metadata (tx hash + prescriptionId) after the patient finishes the on-chain transaction.
- `GET /api/prescriptions/:id` — read-only metadata retrieval; caller identity comes from the `x-viewer` header and must already be authorized on-chain.
- `GET /api/patients/:address/prescriptions` — lists all recorded prescriptions for that patient, filtered so only viewers who pass the on-chain `canView` check receive entries.
- `services/pinataService` talks to Pinata, `requestStore` keeps JSON state, and `requestService` orchestrates queue → chain.

### Frontend dApp (`web/`)
- Tailwind-powered UI renders distinct dashboards for doctors vs. patients.
- Doctor view: composes prescriptions, calls `submitDraft` via wagmi, and then stores the draft metadata off-chain.
- Patient view: lists drafts + access requests, invokes `finalizeDraft` / `setDelegate` directly from their wallet, then notifies the backend.
- The “View Patient Prescriptions” panel accepts a patient wallet (or auto-fills for the patient) and fetches every prescription the connected wallet is allowed to see—no manual prescription IDs required.
- wagmi + MetaMask provide wallet gating and `x-sender` headers for API calls; manual refresh keeps state in sync.

### Next Steps
1. Replace trust-in-header with EIP-712 signatures so both doctor and patient prove intent server-side.
2. Swap the JSON file store for a database + notification mechanism (email, push, or on-chain event listener).
3. Attach encrypted payload storage (DB or IPFS) plus lab-report schema, then stream on-chain events into a cache for quicker dApp loads.
