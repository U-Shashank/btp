# Validation & Metrics

## Performance
- **Draft → Finalization Latency:** Track the time from `submitDraft` confirmation to `finalizeDraft` confirmation. Target < 2 minutes for 95th percentile; surface a warning in the UI if a draft remains pending for too long.
- **API Response Times:** Monitor `/api/requests`, `/api/patients/:addr/prescriptions`, and Pinata pinning latency. Aim for sub-500ms responses when RPC/node is local and Pinata is reachable.
- **Front-End Refresh Health:** Instrument refresh buttons (drafts/access/grants/published/patient history) to ensure each completes without retry and capture failure reasons if any.

## Security
- **Unauthorized Access Attempts:** Count 403 responses from `/api/prescriptions/:id` and `/api/patients/:addr/prescriptions`—if the rate spikes, that indicates misconfigured delegates or malicious viewers.
- **On-Chain Event Consistency:** Periodically reconcile `DraftFinalized`/`PrescriptionIssued` events with `server/data/requests.json` to catch any missed approvals.
- **Pinata Reliability:** Track pin success/failure counts and add retries or fallback storage if failures exceed a threshold.

## Additional Signals
- **Delegate Grants/Revoke Audits:** Surface a simple audit log showing when patients granted or revoked doctor delegates; useful during compliance reviews.
- **Lab Report SLA (future):** Measure the time from lab draft submission to patient approval.
