import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { decodeEventLog } from "viem";
import {
  completeRequest,
  createAccessRequest,
  createPrescriptionRequest,
  fetchPatientPrescriptions,
  fetchRequests,
} from "./services/prescriptionApi";
import { logMetric } from "./services/metricsApi";
import { appConfig } from "./config";
import { PRESCRIPTION_REGISTRY_ABI } from "./lib/abi";

const blankMedication = () => ({ name: "", dosage: "", schedule: "" });
const shorten = (addr) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;
const CONTRACT_ADDRESS = appConfig.contractAddress;

function Section({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm shadow-slate-200/70">
      <div className="mb-4 space-y-1">
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const [prescriptionForm, setPrescriptionForm] = useState({
    patientAddress: "",
    title: "",
    summary: "",
    notes: "",
  });
  const [medications, setMedications] = useState([blankMedication()]);
  const [accessRequestForm, setAccessRequestForm] = useState({
    patientAddress: "",
    reason: "",
  });
  const [patientLookupAddress, setPatientLookupAddress] = useState("");
  const [patientRecords, setPatientRecords] = useState([]);

  const [requestsLoading, setRequestsLoading] = useState({});
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false);
  const [accessRequestSubmitting, setAccessRequestSubmitting] = useState(false);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [patientLookupLoading, setPatientLookupLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const primaryConnector = connectors[0];
  const normalizedAddress = address?.toLowerCase();

  const { data: doctorFlag } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PRESCRIPTION_REGISTRY_ABI,
    functionName: "isDoctor",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && CONTRACT_ADDRESS),
    },
  });

  const role = useMemo(() => {
    if (!normalizedAddress) return "guest";
    return doctorFlag ? "doctor" : "patient";
  }, [normalizedAddress, doctorFlag]);

  const isDoctor = role === "doctor";
  const isPatient = role === "patient";

  const requireWallet = () => {
    if (!isConnected || !address) {
      setFeedback({ type: "error", message: "Connect your wallet before performing actions." });
      return false;
    }
    if (!CONTRACT_ADDRESS) {
      setFeedback({ type: "error", message: "Contract address missing in config." });
      return false;
    }
    return true;
  };

  const cleanMedications = useMemo(
    () =>
      medications
        .map((med) => ({
          name: med.name.trim(),
          dosage: med.dosage.trim(),
          schedule: med.schedule.trim(),
        }))
        .filter((med) => med.name || med.dosage || med.schedule),
    [medications]
  );

  const [pendingDrafts, setPendingDrafts] = useState([]);
  const [publishedPrescriptions, setPublishedPrescriptions] = useState([]);
  const [pendingAccessRequests, setPendingAccessRequests] = useState([]);
  const [grantedAccess, setGrantedAccess] = useState([]);

  const loadRequests = useCallback(
    async (section) => {
      if (!address) {
        setPendingDrafts([]);
        setPublishedPrescriptions([]);
        setPendingAccessRequests([]);
        setGrantedAccess([]);
        return;
      }
      const key = section || "global";
      try {
        setRequestsLoading((prev) => ({ ...prev, [key]: true }));
        const data = await fetchRequests({
          address,
          role: isDoctor ? "doctor" : "patient",
        });
        setPendingDrafts(
          data.filter(
            (req) => req.kind === "prescription" && (req.status === "pending" || req.status === "approved")
          )
        );
        setPublishedPrescriptions(
          data.filter((req) => req.kind === "prescription" && req.status === "recorded")
        );
        setPendingAccessRequests(
          data.filter((req) => req.kind === "access" && req.status === "pending")
        );
        setGrantedAccess(data.filter((req) => req.kind === "access" && req.status === "granted"));
      } catch (error) {
        setFeedback({ type: "error", message: error.message });
      } finally {
        setRequestsLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [address, isDoctor]
  );

  useEffect(() => {
    loadRequests("global");
  }, [loadRequests]);

  useEffect(() => {
    setFeedback(null);
    setPatientRecords([]);
    setRequestsLoading({});
    if (!isPatient) {
      setPatientLookupAddress("");
    }
  }, [normalizedAddress, isPatient]);

  const waitForReceiptAndDecode = async (hash, eventName) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    let eventArgs = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== CONTRACT_ADDRESS?.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: PRESCRIPTION_REGISTRY_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === eventName) {
          eventArgs = decoded.args;
          break;
        }
      } catch {
        // ignore logs we cannot decode
      }
    }
    return { eventArgs, receipt };
  };

  const handleCreatePrescription = async (event) => {
    event.preventDefault();
    setFeedback(null);
    if (!requireWallet()) return;
    if (!isDoctor) {
      setFeedback({ type: "error", message: "Only allow-listed doctors can submit drafts." });
      return;
    }

    try {
      setPrescriptionSubmitting(true);
      const draftStart = performance.now();
      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "submitDraft",
        args: [prescriptionForm.patientAddress],
      });

      const { eventArgs } = await waitForReceiptAndDecode(txHash, "DraftCreated");
      if (!eventArgs) {
        throw new Error("Unable to read draft event");
      }
      const draftId = Number(eventArgs.draftId);

      await createPrescriptionRequest({
        patientAddress: prescriptionForm.patientAddress,
        payload: {
          title: prescriptionForm.title,
          summary: prescriptionForm.summary,
          notes: prescriptionForm.notes,
          medications: cleanMedications,
        },
        draftId,
        draftTxHash: txHash,
        sender: address,
      });
      await loadRequests("drafts");
      logMetric("draft_creation_ms", performance.now() - draftStart);

      setFeedback({
        type: "success",
        message: `Draft #${draftId} saved. Awaiting patient signature.`,
      });
      setPrescriptionForm({ patientAddress: "", title: "", summary: "", notes: "" });
      setMedications([blankMedication()]);
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setPrescriptionSubmitting(false);
    }
  };

  const handleAccessRequest = async (event) => {
    event.preventDefault();
    setFeedback(null);
    if (!requireWallet()) return;
    try {
      setAccessRequestSubmitting(true);
      await createAccessRequest({
        patientAddress: accessRequestForm.patientAddress,
        reason: accessRequestForm.reason,
        sender: address,
      });
      await loadRequests("accessPending");
      setFeedback({ type: "success", message: "Access request sent to patient." });
      setAccessRequestForm({ patientAddress: "", reason: "" });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setAccessRequestSubmitting(false);
    }
  };

  const handleFinalizeDraft = async (request) => {
    if (!requireWallet()) return;
    try {
      setApprovalLoading(true);
      const finalizeStart = performance.now();
      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "finalizeDraft",
        args: [BigInt(request.draftId), request.metadataURI],
      });
      const { eventArgs, receipt } = await waitForReceiptAndDecode(txHash, "DraftFinalized");
      if (!eventArgs) {
        throw new Error("Unable to decode DraftFinalized event");
      }
      const prescriptionId = Number(eventArgs.prescriptionId);

      await completeRequest({
        requestId: request.id,
        sender: address,
        payload: {
          transactionHash: txHash,
          prescriptionId,
        },
      });
      await loadRequests("published");
      logMetric("finalization_ms", performance.now() - finalizeStart);
      if (receipt?.gasUsed) {
        logMetric("gas_finalize", Number(receipt.gasUsed));
      }
      setFeedback({
        type: "success",
        message: `Prescription #${prescriptionId} recorded on-chain.`,
      });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setApprovalLoading(false);
    }
  };

  const handleApproveAccess = async (request) => {
    if (!requireWallet()) return;
    try {
      setApprovalLoading(true);
      const delegateStart = performance.now();
      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "setDelegate",
        args: [request.doctorAddress, true],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      await completeRequest({
        requestId: request.id,
        sender: address,
        payload: { transactionHash: txHash },
      });
      await loadRequests("grants");
      logMetric("delegate_ms", performance.now() - delegateStart);
      if (receipt?.gasUsed) {
        logMetric("gas_delegate", Number(receipt.gasUsed));
      }

      setFeedback({ type: "success", message: "Doctor granted full access." });
    } catch (error) {
      setFeedback({ type: "error", message: error.message });
    } finally {
      setApprovalLoading(false);
    }
  };

  const loadPatientRecords = useCallback(
    async (patientAddr) => {
      if (!address) return;
      try {
        setPatientLookupLoading(true);
        const data = await fetchPatientPrescriptions({
          patientAddress: patientAddr,
          viewerAddress: address,
        });
        setPatientRecords(data);
      } catch (error) {
        setFeedback({ type: "error", message: error.message });
      } finally {
        setPatientLookupLoading(false);
      }
    },
    [address]
  );

  useEffect(() => {
    if (isPatient && address) {
      setPatientLookupAddress(address);
      loadPatientRecords(address);
    }
  }, [isPatient, address, loadPatientRecords]);

  const handlePatientLookup = async (event) => {
    event.preventDefault();
    if (!requireWallet()) return;
    const target = (isPatient ? address : patientLookupAddress).trim();
    if (!target || target.length !== 42 || !target.startsWith("0x")) {
      setFeedback({ type: "error", message: "Enter a valid patient address." });
      return;
    }
    setPatientLookupAddress(target);
    await loadPatientRecords(target);
  };

  const updateMedicationField = (index, field, value) => {
    setMedications((prev) =>
      prev.map((med, i) => (i === index ? { ...med, [field]: value } : med))
    );
  };

  const addMedicationRow = () => setMedications((prev) => [...prev, blankMedication()]);
  const removeMedicationRow = (index) =>
    setMedications((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm shadow-slate-200/80 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-indigo-500">
              MedLedger
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Dual-signature prescription + access portal
            </h1>
            <p className="text-sm text-slate-500">
              Doctors register drafts on-chain, patients co-sign to publish, and access requests stay
              under patient control.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isConnected && (
              <span className="rounded-full bg-indigo-50 px-4 py-1 text-sm font-medium text-indigo-700">
                {role === "doctor" ? "Doctor" : "Patient"}
              </span>
            )}
            {isConnected ? (
              <>
                <span className="rounded-full bg-slate-100 px-4 py-1 text-sm font-medium text-slate-700">
                  {shorten(address)}
                </span>
                <button
                  type="button"
                  onClick={() => disconnect()}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => connect({ connector: primaryConnector })}
                disabled={!primaryConnector || connectStatus === "pending"}
                className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {connectStatus === "pending" ? "Connecting…" : "Connect Wallet"}
              </button>
            )}
          </div>
        </header>

        {feedback && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              feedback.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
          >
            {feedback.message}
          </div>
        )}

        {isDoctor && (
          <>
            <Section
              title="Draft Prescription"
              description="1) Submit on-chain draft via contract, 2) Pin payload to IPFS until the patient signs."
            >
              <form className="space-y-4" onSubmit={handleCreatePrescription}>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
                    Patient Address
                    <input
                      type="text"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-base text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      value={prescriptionForm.patientAddress}
                      onChange={(e) =>
                        setPrescriptionForm((prev) => ({ ...prev, patientAddress: e.target.value }))
                      }
                      placeholder="0x..."
                      required
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
                    Title
                    <input
                      type="text"
                      className="rounded-xl border border-slate-200 px-3 py-2"
                      value={prescriptionForm.title}
                      onChange={(e) =>
                        setPrescriptionForm((prev) => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="Acute migraine therapy"
                      required
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
                  Summary
                  <input
                    type="text"
                    className="rounded-xl border border-slate-200 px-3 py-2"
                    value={prescriptionForm.summary}
                    onChange={(e) =>
                      setPrescriptionForm((prev) => ({ ...prev, summary: e.target.value }))
                    }
                    placeholder="Short background for the patient"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
                  Notes
                  <textarea
                    rows={3}
                    className="rounded-xl border border-slate-200 px-3 py-2"
                    value={prescriptionForm.notes}
                    onChange={(e) =>
                      setPrescriptionForm((prev) => ({ ...prev, notes: e.target.value }))
                    }
                    placeholder="Observations, instructions, warnings…"
                  />
                </label>
                <div className="rounded-2xl border border-dashed border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">Medications</p>
                    <button
                      type="button"
                      onClick={addMedicationRow}
                      className="text-sm font-semibold text-indigo-600"
                    >
                      + Add
                    </button>
                  </div>
                  <div className="space-y-3">
                    {medications.map((med, index) => (
                      <div
                        className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
                        key={`med-${index}`}
                      >
                        {["name", "dosage", "schedule"].map((field) => (
                          <input
                            key={field}
                            type="text"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                            placeholder={
                              field === "name"
                                ? "Medication"
                                : field === "dosage"
                                ? "Dosage"
                                : "Schedule"
                            }
                            value={med[field]}
                            onChange={(e) => updateMedicationField(index, field, e.target.value)}
                          />
                        ))}
                        {medications.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeMedicationRow(index)}
                            className="text-sm font-medium text-rose-600"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={prescriptionSubmitting}
                  className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                >
                  {prescriptionSubmitting ? "Submitting on-chain…" : "Submit Draft"}
                </button>
              </form>
            </Section>

            <Section
              title="Request Patient Record Access"
              description="Ask the patient for a blanket approval to view all of their records."
            >
              <form className="space-y-4" onSubmit={handleAccessRequest}>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
                  Patient Address
                  <input
                    type="text"
                    className="rounded-xl border border-slate-200 px-3 py-2"
                    value={accessRequestForm.patientAddress}
                    onChange={(e) =>
                      setAccessRequestForm((prev) => ({ ...prev, patientAddress: e.target.value }))
                    }
                    placeholder="0x..."
                    required
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
                  Reason
                  <textarea
                    rows={3}
                    className="rounded-xl border border-slate-200 px-3 py-2"
                    value={accessRequestForm.reason}
                    onChange={(e) =>
                      setAccessRequestForm((prev) => ({ ...prev, reason: e.target.value }))
                    }
                    placeholder="Provide clinical context for the patient"
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={accessRequestSubmitting}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
                >
                  {accessRequestSubmitting ? "Sending…" : "Send Access Request"}
                </button>
              </form>
            </Section>
          </>
        )}

        {isPatient && (
          <>
            <Section
              title="Pending Prescription Drafts"
              description="These drafts already have a doctor signature. Review the payload and co-sign to publish."
            >
              <div className="mb-4 flex justify-between text-sm text-slate-500">
                <span>{pendingDrafts.length} awaiting signature</span>
                <button
                  type="button"
                  onClick={() => loadRequests("drafts")}
                  className="text-xs font-semibold text-indigo-600 disabled:opacity-60"
                  disabled={requestsLoading.drafts}
                >
                  {requestsLoading.drafts ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {pendingDrafts.length ? (
                <div className="space-y-4">
                  {pendingDrafts.map((req) => (
                    <div key={req.id} className="rounded-2xl border border-slate-200 p-4 shadow-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            Draft #{req.draftId} · {req.payload?.title ?? "Untitled rx"}
                          </p>
                          <p className="text-xs text-slate-500">
                            Doctor {shorten(req.doctorAddress)} ·{" "}
                            {new Date(req.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleFinalizeDraft(req)}
                          disabled={approvalLoading}
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow"
                        >
                          {approvalLoading ? "Publishing…" : "Sign & Publish"}
                        </button>
                      </div>
                      {req.metadataURI && (
                        <a
                          href={req.metadataURI}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center text-xs font-semibold text-indigo-600"
                        >
                          View IPFS payload →
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No drafts waiting on you.</p>
              )}
            </Section>

            <Section
              title="Doctor Access Requests"
              description="Grant or deny blanket access for doctors requesting your records."
            >
              <div className="mb-4 flex justify-between text-sm text-slate-500">
                <span>{pendingAccessRequests.length} awaiting approval</span>
                <button
                  type="button"
                  onClick={() => loadRequests("accessPending")}
                  disabled={requestsLoading.accessPending}
                  className="text-xs font-semibold text-indigo-600 disabled:opacity-60"
                >
                  {requestsLoading.accessPending ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {pendingAccessRequests.length ? (
                <div className="space-y-4">
                  {pendingAccessRequests.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-2xl border border-amber-100 bg-amber-50 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-amber-900">
                            Doctor {shorten(req.doctorAddress)}
                          </p>
                          <p className="text-xs text-amber-700">
                            {req.payload?.reason || "No reason provided"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApproveAccess(req)}
                          disabled={approvalLoading}
                          className="rounded-full bg-amber-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow"
                        >
                          {approvalLoading ? "Approving…" : "Approve access"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No pending access requests.</p>
              )}
            </Section>

            <Section
              title="Active Doctor Grants"
              description="Doctors who currently have blanket access to your records."
            >
              <div className="mb-4 flex justify-between text-sm text-slate-500">
                <span>{grantedAccess.length} doctor(s) currently allowed</span>
                <button
                  type="button"
                  onClick={() => loadRequests("grants")}
                  disabled={requestsLoading.grants}
                  className="text-xs font-semibold text-indigo-600 disabled:opacity-60"
                >
                  {requestsLoading.grants ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {grantedAccess.length ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {grantedAccess.map((req) => (
                    <div key={req.id} className="rounded-2xl border border-slate-100 p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        Doctor {shorten(req.doctorAddress)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Granted {new Date(req.updatedAt).toLocaleString()}
                      </p>
                      {req.payload?.reason && (
                        <p className="mt-1 text-xs text-slate-500">{req.payload.reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No doctors currently have blanket access. Approve requests above when you’re ready.
                </p>
              )}
            </Section>

            <Section
              title="Published Prescriptions"
              description="Prescriptions you have already co-signed and anchored on-chain."
            >
              <div className="mb-4 flex justify-between text-sm text-slate-500">
                <span>{publishedPrescriptions.length} recorded entries</span>
                <button
                  type="button"
                  onClick={() => loadRequests("published")}
                  disabled={requestsLoading.published}
                  className="text-xs font-semibold text-indigo-600 disabled:opacity-60"
                >
                  {requestsLoading.published ? "Refreshing…" : "Refresh"}
                </button>
              </div>
              {publishedPrescriptions.length ? (
                <div className="space-y-3">
                  {publishedPrescriptions.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-2xl border border-slate-100 p-4 text-sm text-slate-600"
                    >
                      <p className="font-semibold text-slate-900">
                        #{req.prescriptionId} · {req.payload?.title ?? "Untitled rx"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Doctor {shorten(req.doctorAddress)} ·{" "}
                        {new Date(req.recordedAt || req.updatedAt).toLocaleString()}
                      </p>
                      {req.metadataURI && (
                        <a
                          href={req.metadataURI}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex text-xs font-semibold text-indigo-600"
                        >
                          View metadata
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Nothing recorded yet.</p>
              )}
            </Section>

          </>
        )}

        <Section
          title="View Patient Prescriptions"
          description="Enter a patient wallet to list every prescription you are authorized to view."
        >
          <form className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handlePatientLookup}>
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Patient Address
              <input
                type="text"
                className="rounded-xl border border-slate-200 px-3 py-2"
                value={patientLookupAddress}
                onChange={(e) => setPatientLookupAddress(e.target.value)}
                placeholder="0x..."
                disabled={isPatient}
                required
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={patientLookupLoading}
                className="w-full rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {patientLookupLoading ? "Loading…" : "Load Prescriptions"}
              </button>
            </div>
          </form>
          <div className="mt-4 flex justify-between text-sm text-slate-500">
            <span>
              {patientRecords.length
                ? `${patientRecords.length} prescription(s) loaded`
                : "No prescriptions loaded yet"}
            </span>
            <button
              type="button"
              onClick={() =>
                patientLookupAddress && loadPatientRecords(isPatient ? address : patientLookupAddress)
              }
              disabled={patientLookupLoading || !(patientLookupAddress || isPatient)}
              className="text-xs font-semibold text-indigo-600 disabled:opacity-60"
            >
              {patientLookupLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {patientRecords.length ? (
            <div className="mt-4 space-y-3">
              {patientRecords.map((record) => (
                <div
                  key={`${record.prescriptionId}-${record.transactionHash}`}
                  className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700"
                >
                  <p className="font-semibold text-slate-900">
                    #{record.prescriptionId} · {record.payload?.title ?? "Untitled rx"}
                  </p>
                  <p className="text-xs text-slate-500">
                    Doctor {shorten(record.doctorAddress)} ·{" "}
                    {record.recordedAt ? new Date(record.recordedAt).toLocaleString() : "Pending"}
                  </p>
                  {record.metadataURI && (
                    <p className="mt-1">
                      <span className="font-semibold text-slate-900">Metadata:</span>{" "}
                      <a
                        href={record.metadataURI}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-600"
                      >
                        {record.metadataURI}
                      </a>
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              {patientLookupLoading
                ? "Loading records…"
                : "No prescriptions found or you do not have access."}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}

export default App;
