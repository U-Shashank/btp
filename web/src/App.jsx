import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useConnect,
  useDisconnect,
  useReadContract,
  useWriteContract,
  usePublicClient,
  useSignTypedData,
  useWalletClient,
} from "wagmi";
import { decodeEventLog } from "viem";
import {
  completeRequest,
  createAccessRequest,
  createPrescriptionRequest,
  fetchPatientPrescriptions,
  fetchRequests,
  fetchIPFSBundle,
  pinUpdatedBundle,
} from "./services/prescriptionApi";
import { logMetric } from "./services/metricsApi";
import { appConfig } from "./config";
import { PRESCRIPTION_REGISTRY_ABI } from "./lib/abi";
import DOCTOR_ORACLE_ABI from "./lib/DoctorStatusOracleABI.json";
import {
  encryptPrescription,
  isEncrypted,
  addRecipientToBundle,
} from "./lib/encryption";
import { useDecryption } from "./hooks/useDecryption";

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

function DecryptButton({ onClick, isLoading, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`
        group relative inline-flex items-center gap-2 
        rounded-lg bg-gradient-to-r from-indigo-500 to-purple-600
        px-4 py-2 text-sm font-semibold text-white shadow-md
        transition-all duration-200 ease-in-out
        hover:from-indigo-600 hover:to-purple-700 hover:shadow-lg hover:-translate-y-0.5
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
        active:translate-y-0 active:shadow-md
        disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-md
        ${className}
      `}
    >
      {isLoading ? (
        <>
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Decrypting...</span>
        </>
      ) : (
        <>
          <svg
            className="h-4 w-4 transition-transform group-hover:scale-110"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
            />
          </svg>
          <span>Decrypt to View</span>
        </>
      )}
    </button>
  );
}

function App() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, status: connectStatus } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  // Decryption hook for managing encrypted prescriptions
  const {
    decrypt,
    getCached,
    isLoading: isDecrypting,
    getError: getDecryptionError,
    clearCache,
  } = useDecryption();

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
  const [reencryptionProgress, setReencryptionProgress] = useState({
    total: 0,
    current: 0,
    inProgress: false,
  });
  const [batchDecrypting, setBatchDecrypting] = useState(false);

  const primaryConnector = connectors[0];
  const normalizedAddress = address?.toLowerCase();

  // Batch decryption helper
  const batchDecrypt = useCallback(
    async (items, getItemId, getItemPayload) => {
      setBatchDecrypting(true);
      let successCount = 0;
      let failCount = 0;

      try {
        for (const item of items) {
          const itemId = getItemId(item);
          const payload = getItemPayload(item);

          if (isEncrypted(payload) && !getCached(itemId)) {
            try {
              await decrypt(itemId, payload);
              successCount++;
            } catch (error) {
              console.error(`Failed to decrypt ${itemId}:`, error);
              failCount++;
            }
          }
        }

        if (failCount > 0) {
          setFeedback({
            type: "warning",
            message: `Decrypted ${successCount} items. ${failCount} failed.`,
          });
        }
      } finally {
        setBatchDecrypting(false);
      }
    },
    [decrypt, getCached, isEncrypted],
  );

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

  const { data: doctorNonce } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: PRESCRIPTION_REGISTRY_ABI,
    functionName: "nonces",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address && isDoctor),
    },
  });

  const requireWallet = () => {
    if (!isConnected || !address) {
      setFeedback({
        type: "error",
        message: "Connect your wallet before performing actions.",
      });
      return false;
    }
    if (!CONTRACT_ADDRESS) {
      setFeedback({
        type: "error",
        message: "Contract address missing in config.",
      });
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
    [medications],
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
            (req) =>
              req.kind === "prescription" &&
              (req.status === "pending" || req.status === "approved"),
          ),
        );
        setPublishedPrescriptions(
          data.filter(
            (req) => req.kind === "prescription" && req.status === "recorded",
          ),
        );
        setPendingAccessRequests(
          data.filter(
            (req) => req.kind === "access" && req.status === "pending",
          ),
        );
        setGrantedAccess(
          data.filter(
            (req) => req.kind === "access" && req.status === "granted",
          ),
        );
      } catch (error) {
        setFeedback({ type: "error", message: error.message });
      } finally {
        setRequestsLoading((prev) => ({ ...prev, [key]: false }));
      }
    },
    [address, isDoctor],
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
      if (log.address.toLowerCase() !== CONTRACT_ADDRESS?.toLowerCase())
        continue;
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
      setFeedback({
        type: "error",
        message: "Only allow-listed doctors can submit drafts.",
      });
      return;
    }
    if (
      prescriptionForm.patientAddress.toLowerCase() ===
      CONTRACT_ADDRESS.toLowerCase()
    ) {
      setFeedback({
        type: "error",
        message:
          "Invalid Patient Address: You entered the contract address. Please enter the patient's wallet address.",
      });
      return;
    }

    try {
      setPrescriptionSubmitting(true);
      const draftStart = performance.now();

      // Check if doctor is active in the oracle (if oracle is configured)
      if (appConfig.oracleAddress) {
        try {
          const isActive = await publicClient.readContract({
            address: appConfig.oracleAddress,
            abi: DOCTOR_ORACLE_ABI,
            functionName: "isDoctorActive",
            args: [address],
          });

          if (!isActive) {
            setFeedback({
              type: "error",
              message: "Cannot create prescription: Your doctor account is currently suspended. Please contact the administrator.",
            });
            setPrescriptionSubmitting(false);
            return;
          }
        } catch (error) {
          console.warn("Could not check doctor status from oracle:", error);
          // Continue anyway - blockchain will enforce the check
        }
      }

      // New: Doctor signs off-chain via EIP-712
      const medicationDetails = cleanMedications
        .map((m) => `${m.name} (${m.dosage}, ${m.schedule})`)
        .join("; ");

      if (doctorNonce === undefined) {
        throw new Error("Unable to fetch doctor nonce. Try again.");
      }
      const nonce = doctorNonce; // Current nonce from contract
      const validUntil = Math.floor(Date.now() / 1000) + 3600 * 24; // 24 hours

      const doctorSignature = await signTypedDataAsync({
        domain: {
          name: "PrescriptionRegistry",
          version: "1",
          chainId: appConfig.chainId,
          verifyingContract: CONTRACT_ADDRESS,
        },
        types: {
          Prescription: [
            { name: "doctor", type: "address" },
            { name: "patient", type: "address" },
            { name: "medicationDetails", type: "string" },
            { name: "nonce", type: "uint256" },
            { name: "validUntil", type: "uint256" },
          ],
        },
        primaryType: "Prescription",
        message: {
          doctor: address,
          patient: prescriptionForm.patientAddress,
          medicationDetails,
          nonce: BigInt(nonce),
          validUntil: BigInt(validUntil),
        },
      });

      // Encrypt payload before sending to API
      const encryptionStart = performance.now();
      const encryptedBundle = await encryptPrescription(
        {
          title: prescriptionForm.title,
          summary: prescriptionForm.summary,
          notes: prescriptionForm.notes,
          medications: cleanMedications,
          medicationDetails, // Include the hashed string for verification
        },
        address, // doctor
        prescriptionForm.patientAddress, // patient
        walletClient,
        appConfig.chainId,
        CONTRACT_ADDRESS,
      );
      const encryptionTime = performance.now() - encryptionStart;
      logMetric("encryption_ms", encryptionTime);

      // Send encrypted payload to API (Off-chain storage)
      console.log('🏥 About to call createPrescriptionRequest');
      console.log('  Doctor address (sender):', address);
      console.log('  Patient address:', prescriptionForm.patientAddress);
      console.log('  Address defined:', !!address);
      console.log('  Address type:', typeof address);
      
      await createPrescriptionRequest({
        patientAddress: prescriptionForm.patientAddress,
        encryptedPayload: encryptedBundle,
        medicationDetails, // Send plaintext medication string for co-signing
        doctorSignature,
        nonce: Number(nonce),
        validUntil,
        sender: address,
      });
      
      console.log('✅ createPrescriptionRequest completed');
      
      await loadRequests("drafts");
      logMetric("draft_creation_ms", performance.now() - draftStart);

      setFeedback({
        type: "success",
        message: `Draft created off-chain. Awaiting patient signature.`,
      });
      setPrescriptionForm({
        patientAddress: "",
        title: "",
        summary: "",
        notes: "",
      });
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
      setFeedback({
        type: "success",
        message: "Access request sent to patient.",
      });
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

      // 1. Patient Co-Signs (EIP-712)
      // The patient must sign the EXACT same data the doctor signed
      // Use the stored medicationDetails from the request
      const medicationDetails =
        request.medicationDetails ||
        request.payload?.medications
          ?.map((m) => `${m.name} (${m.dosage}, ${m.schedule})`)
          .join("; ") ||
        "No medications listed";

      const patientSignature = await signTypedDataAsync({
        domain: {
          name: "PrescriptionRegistry",
          version: "1",
          chainId: appConfig.chainId,
          verifyingContract: CONTRACT_ADDRESS,
        },
        types: {
          Prescription: [
            { name: "doctor", type: "address" },
            { name: "patient", type: "address" },
            { name: "medicationDetails", type: "string" },
            { name: "nonce", type: "uint256" },
            { name: "validUntil", type: "uint256" },
          ],
        },
        primaryType: "Prescription",
        message: {
          doctor: request.doctorAddress,
          patient: request.patientAddress,
          medicationDetails,
          nonce: BigInt(request.nonce),
          validUntil: BigInt(request.validUntil),
        },
      });

      // 2. Submit Dual-Signed Transaction
      // This is the "Settlement" transaction. Patient pays gas (Option 1).
      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "registerPrescription",
        args: [
          request.doctorAddress,
          request.patientAddress,
          medicationDetails,
          BigInt(request.validUntil),
          request.metadataURI,
          request.doctorSignature,
          patientSignature,
        ],
      });
      const { eventArgs, receipt } = await waitForReceiptAndDecode(
        txHash,
        "PrescriptionIssued",
      );
      if (!eventArgs) {
        throw new Error("Unable to decode PrescriptionIssued event");
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

      // Step 1: Grant delegate access on-chain
      const txHash = await writeContractAsync({
        address: CONTRACT_ADDRESS,
        abi: PRESCRIPTION_REGISTRY_ABI,
        functionName: "setDelegate",
        args: [request.doctorAddress, true],
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

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

      setFeedback({
        type: "success",
        message: "Doctor granted full access. Re-encrypting prescriptions...",
      });

      // Step 2: Re-encrypt all patient's prescriptions with delegate's key
      try {
        const reencryptStart = performance.now();
        const prescriptions = await fetchPatientPrescriptions({
          patientAddress: address,
          viewerAddress: address,
        });

        // Filter only encrypted prescriptions that need re-encryption
        const encryptedPrescriptions = prescriptions.filter(
          (p) => p.metadataURI && isEncrypted(p),
        );

        if (encryptedPrescriptions.length === 0) {
          setFeedback({
            type: "success",
            message:
              "Doctor granted full access. No encrypted prescriptions to update.",
          });
          return;
        }

        setReencryptionProgress({
          total: encryptedPrescriptions.length,
          current: 0,
          inProgress: true,
        });

        let successCount = 0;
        let failureCount = 0;
        const failures = []; // Track detailed failure information

        // Process each prescription
        for (let i = 0; i < encryptedPrescriptions.length; i++) {
          const prescription = encryptedPrescriptions[i];

          try {
            // Fetch encrypted bundle from IPFS
            const bundle = await fetchIPFSBundle(prescription.metadataURI);

            // Decrypt to get plaintext payload (patient has access)
            const decryptedPayload = await decrypt(
              bundle,
              address,
              walletClient,
              appConfig.chainId,
              CONTRACT_ADDRESS,
            );

            // Add delegate as recipient
            const updatedBundle = await addRecipientToBundle(
              bundle,
              request.doctorAddress,
              decryptedPayload,
              walletClient,
              appConfig.chainId,
              CONTRACT_ADDRESS,
            );

            // Pin updated bundle to IPFS
            const { metadataURI: newMetadataURI } =
              await pinUpdatedBundle(updatedBundle);

            // Update on-chain metadata
            await writeContractAsync({
              address: CONTRACT_ADDRESS,
              abi: PRESCRIPTION_REGISTRY_ABI,
              functionName: "updatePrescriptionMetadata",
              args: [BigInt(prescription.prescriptionId), newMetadataURI],
            });

            successCount++;
            logMetric("reencryption_success", 1);
          } catch (error) {
            console.error(
              `Failed to re-encrypt prescription ${prescription.prescriptionId}:`,
              error,
            );
            failureCount++;

            // Categorize error for better user feedback
            let errorCategory = "unknown";
            if (error.message.includes("IPFS")) {
              errorCategory = "IPFS fetch";
            } else if (error.message.includes("decrypt")) {
              errorCategory = "decryption";
            } else if (error.message.includes("User rejected")) {
              errorCategory = "user rejected";
            } else if (error.message.includes("updatePrescriptionMetadata")) {
              errorCategory = "blockchain update";
            }

            failures.push({
              prescriptionId: prescription.prescriptionId,
              error: error.message,
              category: errorCategory,
            });

            logMetric("reencryption_failure", 1);
          }

          // Update progress
          setReencryptionProgress({
            total: encryptedPrescriptions.length,
            current: i + 1,
            inProgress: i + 1 < encryptedPrescriptions.length,
          });
        }

        const reencryptionTime = performance.now() - reencryptStart;
        logMetric("reencryption_ms", reencryptionTime);
        logMetric("reencryption_count", successCount);

        // Final feedback message
        if (failureCount === 0) {
          setFeedback({
            type: "success",
            message: `Doctor granted full access. Successfully re-encrypted ${successCount} prescription${successCount !== 1 ? "s" : ""}.`,
          });
        } else {
          // Group failures by category
          const failuresByCategory = failures.reduce((acc, f) => {
            acc[f.category] = (acc[f.category] || 0) + 1;
            return acc;
          }, {});

          const categorySummary = Object.entries(failuresByCategory)
            .map(([cat, count]) => `${count} ${cat}`)
            .join(", ");

          const failedIds = failures
            .map((f) => `#${f.prescriptionId}`)
            .join(", ");

          setFeedback({
            type: "warning",
            message: `Doctor granted access. Re-encrypted ${successCount}/${encryptedPrescriptions.length} prescriptions. Failures: ${categorySummary}. IDs: ${failedIds}`,
          });

          // Log detailed failures to console for debugging
          console.error("Re-encryption failures:", failures);
        }
      } catch (error) {
        console.error("Re-encryption error:", error);
        setFeedback({
          type: "warning",
          message: `Doctor granted access, but re-encryption failed: ${error.message}`,
        });
      } finally {
        setReencryptionProgress({
          total: 0,
          current: 0,
          inProgress: false,
        });
      }
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
    [address],
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
      prev.map((med, i) => (i === index ? { ...med, [field]: value } : med)),
    );
  };

  const addMedicationRow = () =>
    setMedications((prev) => [...prev, blankMedication()]);
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
              Doctors register drafts on-chain, patients co-sign to publish, and
              access requests stay under patient control.
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
                        setPrescriptionForm((prev) => ({
                          ...prev,
                          patientAddress: e.target.value,
                        }))
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
                        setPrescriptionForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
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
                      setPrescriptionForm((prev) => ({
                        ...prev,
                        summary: e.target.value,
                      }))
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
                      setPrescriptionForm((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Observations, instructions, warnings…"
                  />
                </label>
                <div className="rounded-2xl border border-dashed border-slate-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-700">
                      Medications
                    </p>
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
                            onChange={(e) =>
                              updateMedicationField(
                                index,
                                field,
                                e.target.value,
                              )
                            }
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
                  {prescriptionSubmitting
                    ? "Submitting on-chain…"
                    : "Submit Draft"}
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
                      setAccessRequestForm((prev) => ({
                        ...prev,
                        patientAddress: e.target.value,
                      }))
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
                      setAccessRequestForm((prev) => ({
                        ...prev,
                        reason: e.target.value,
                      }))
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
                <div className="flex gap-2">
                  {pendingDrafts.some(
                    (req) => isEncrypted(req.payload) && !getCached(req.id),
                  ) && (
                    <button
                      type="button"
                      onClick={() =>
                        batchDecrypt(
                          pendingDrafts,
                          (req) => req.id,
                          (req) => req.payload,
                        )
                      }
                      className="text-xs font-semibold text-purple-600 hover:text-purple-700 disabled:opacity-60"
                      disabled={
                        batchDecrypting ||
                        pendingDrafts.some((req) => isDecrypting(req.id))
                      }
                    >
                      {batchDecrypting ||
                      pendingDrafts.some((req) => isDecrypting(req.id))
                        ? "Decrypting..."
                        : "Decrypt All"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => loadRequests("drafts")}
                    className="text-xs font-semibold text-indigo-600 disabled:opacity-60"
                    disabled={requestsLoading.drafts}
                  >
                    {requestsLoading.drafts ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>
              {pendingDrafts.length ? (
                <div className="space-y-4">
                  {pendingDrafts.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-2xl border border-slate-200 p-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-900">
                            Draft ·{" "}
                            {isEncrypted(req.payload)
                              ? "🔒 Encrypted Prescription"
                              : (req.payload?.title ?? "Untitled rx")}
                          </p>
                          <p className="text-xs text-slate-500">
                            Doctor {shorten(req.doctorAddress)} ·{" "}
                            {new Date(req.createdAt).toLocaleString()}
                          </p>
                          {isEncrypted(req.payload) && !getCached(req.id) && (
                            <DecryptButton
                              onClick={() => decrypt(req.id, req.payload)}
                              isLoading={isDecrypting(req.id)}
                              className="mt-3"
                            />
                          )}
                          {getCached(req.id) && (
                            <div className="mt-3 space-y-2 rounded-lg bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 p-4">
                              <div className="flex items-start gap-2">
                                <svg
                                  className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                <div className="flex-1 text-sm text-slate-700">
                                  <p className="font-semibold text-slate-900">
                                    {getCached(req.id).title || "Untitled"}
                                  </p>
                                  {getCached(req.id).summary && (
                                    <p className="mt-1 text-slate-600">
                                      {getCached(req.id).summary}
                                    </p>
                                  )}
                                  {getCached(req.id).notes && (
                                    <p className="mt-1 text-xs text-slate-500">
                                      <span className="font-medium">
                                        Notes:
                                      </span>{" "}
                                      {getCached(req.id).notes}
                                    </p>
                                  )}
                                  {getCached(req.id).medications &&
                                    getCached(req.id).medications.length >
                                      0 && (
                                      <div className="mt-2">
                                        <p className="text-xs font-medium text-slate-700">
                                          Medications:
                                        </p>
                                        <ul className="mt-1 space-y-1">
                                          {getCached(req.id).medications.map(
                                            (med, i) => (
                                              <li
                                                key={i}
                                                className="text-xs text-slate-600 flex items-start gap-1"
                                              >
                                                <span className="text-green-600 mt-0.5">
                                                  •
                                                </span>
                                                <span>
                                                  {med.name} - {med.dosage},{" "}
                                                  {med.schedule}
                                                </span>
                                              </li>
                                            ),
                                          )}
                                        </ul>
                                      </div>
                                    )}
                                </div>
                              </div>
                            </div>
                          )}
                          {getDecryptionError(req.id) && (
                            <p className="mt-1 text-xs text-rose-600">
                              Decryption failed: {getDecryptionError(req.id)}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleFinalizeDraft(req)}
                          disabled={approvalLoading}
                          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow hover:bg-emerald-600 disabled:opacity-50"
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
                <p className="text-sm text-slate-500">
                  No drafts waiting on you.
                </p>
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
                      {reencryptionProgress.inProgress && (
                        <div className="mt-2 text-xs text-indigo-600">
                          Re-encrypting prescriptions...{" "}
                          {reencryptionProgress.current}/
                          {reencryptionProgress.total}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No pending access requests.
                </p>
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
                    <div
                      key={req.id}
                      className="rounded-2xl border border-slate-100 p-4"
                    >
                      <p className="text-sm font-semibold text-slate-900">
                        Doctor {shorten(req.doctorAddress)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Granted {new Date(req.updatedAt).toLocaleString()}
                      </p>
                      {req.payload?.reason && (
                        <p className="mt-1 text-xs text-slate-500">
                          {req.payload.reason}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No doctors currently have blanket access. Approve requests
                  above when you’re ready.
                </p>
              )}
            </Section>

            <Section
              title="Published Prescriptions"
              description="Prescriptions you have already co-signed and anchored on-chain."
            >
              <div className="mb-4 flex justify-between text-sm text-slate-500">
                <span>{publishedPrescriptions.length} recorded entries</span>
                <div className="flex gap-2">
                  {publishedPrescriptions.some(
                    (req) => isEncrypted(req.payload) && !getCached(req.id),
                  ) && (
                    <button
                      type="button"
                      onClick={() =>
                        batchDecrypt(
                          publishedPrescriptions,
                          (req) => req.id,
                          (req) => req.payload,
                        )
                      }
                      className="text-xs font-semibold text-purple-600 hover:text-purple-700 disabled:opacity-60"
                      disabled={
                        batchDecrypting ||
                        publishedPrescriptions.some((req) =>
                          isDecrypting(req.id),
                        )
                      }
                    >
                      {batchDecrypting ||
                      publishedPrescriptions.some((req) => isDecrypting(req.id))
                        ? "Decrypting..."
                        : "Decrypt All"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => loadRequests("published")}
                    disabled={requestsLoading.published}
                    className="text-xs font-semibold text-indigo-600 disabled:opacity-60"
                  >
                    {requestsLoading.published ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              </div>
              {publishedPrescriptions.length ? (
                <div className="space-y-3">
                  {publishedPrescriptions.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-2xl border border-slate-100 p-4 text-sm text-slate-600"
                    >
                      <p className="font-semibold text-slate-900">
                        #{req.prescriptionId} ·{" "}
                        {isEncrypted(req.payload)
                          ? getCached(req.id)?.title ||
                            "🔒 Encrypted Prescription"
                          : (req.payload?.title ?? "Untitled rx")}
                      </p>
                      <p className="text-xs text-slate-500">
                        Doctor {shorten(req.doctorAddress)} ·{" "}
                        {new Date(
                          req.recordedAt || req.updatedAt,
                        ).toLocaleString()}
                      </p>
                      {isEncrypted(req.payload) && !getCached(req.id) && (
                        <DecryptButton
                          onClick={() => decrypt(req.id, req.payload)}
                          isLoading={isDecrypting(req.id)}
                          className="mt-3"
                        />
                      )}
                      {getCached(req.id) && (
                        <div className="mt-3 space-y-2 rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 p-4">
                          <div className="flex items-start gap-2">
                            <svg
                              className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <div className="flex-1 text-sm text-slate-700">
                              <p className="font-semibold text-slate-900">
                                {getCached(req.id).title || "Untitled"}
                              </p>
                              {getCached(req.id).summary && (
                                <p className="mt-1 text-slate-600">
                                  {getCached(req.id).summary}
                                </p>
                              )}
                              {getCached(req.id).notes && (
                                <p className="mt-1 text-xs text-slate-500">
                                  <span className="font-medium">Notes:</span>{" "}
                                  {getCached(req.id).notes}
                                </p>
                              )}
                              {getCached(req.id).medications &&
                                getCached(req.id).medications.length > 0 && (
                                  <div className="mt-2">
                                    <p className="text-xs font-medium text-slate-700">
                                      Medications:
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                      {getCached(req.id).medications.map(
                                        (med, i) => (
                                          <li
                                            key={i}
                                            className="text-xs text-slate-600 flex items-start gap-1"
                                          >
                                            <span className="text-blue-600 mt-0.5">
                                              •
                                            </span>
                                            <span>
                                              {med.name} - {med.dosage},{" "}
                                              {med.schedule}
                                            </span>
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      )}
                      {getDecryptionError(req.id) && (
                        <p className="mt-1 text-xs text-rose-600">
                          {getDecryptionError(req.id)}
                        </p>
                      )}
                      <br />
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
          <form
            className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={handlePatientLookup}
          >
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
            <div className="flex gap-2">
              {patientRecords.some(
                (record) =>
                  isEncrypted(record.payload) &&
                  !getCached(`record-${record.prescriptionId}`),
              ) && (
                <button
                  type="button"
                  onClick={() =>
                    batchDecrypt(
                      patientRecords,
                      (record) => `record-${record.prescriptionId}`,
                      (record) => record.payload,
                    )
                  }
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 disabled:opacity-60"
                  disabled={
                    batchDecrypting ||
                    patientRecords.some((record) =>
                      isDecrypting(`record-${record.prescriptionId}`),
                    )
                  }
                >
                  {batchDecrypting ||
                  patientRecords.some((record) =>
                    isDecrypting(`record-${record.prescriptionId}`),
                  )
                    ? "Decrypting..."
                    : "Decrypt All"}
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  patientLookupAddress &&
                  loadPatientRecords(isPatient ? address : patientLookupAddress)
                }
                disabled={
                  patientLookupLoading || !(patientLookupAddress || isPatient)
                }
                className="text-xs font-semibold text-indigo-600 disabled:opacity-60"
              >
                {patientLookupLoading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
          {patientRecords.length ? (
            <div className="mt-4 space-y-3">
              {patientRecords.map((record) => (
                <div
                  key={`${record.prescriptionId}-${record.transactionHash}`}
                  className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-700"
                >
                  <p className="font-semibold text-slate-900">
                    #{record.prescriptionId} ·{" "}
                    {isEncrypted(record.payload)
                      ? getCached(`record-${record.prescriptionId}`)?.title ||
                        "🔒 Encrypted Prescription"
                      : (record.payload?.title ?? "Untitled rx")}
                  </p>
                  <p className="text-xs text-slate-500">
                    Doctor {shorten(record.doctorAddress)} ·{" "}
                    {record.recordedAt
                      ? new Date(record.recordedAt).toLocaleString()
                      : "Pending"}
                  </p>
                  {isEncrypted(record.payload) &&
                    !getCached(`record-${record.prescriptionId}`) && (
                      <DecryptButton
                        onClick={() =>
                          decrypt(
                            `record-${record.prescriptionId}`,
                            record.payload,
                          )
                        }
                        isLoading={isDecrypting(
                          `record-${record.prescriptionId}`,
                        )}
                        className="mt-3"
                      />
                    )}
                  {getCached(`record-${record.prescriptionId}`) && (
                    <div className="mt-3 space-y-2 rounded-lg bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 p-4">
                      <div className="flex items-start gap-2">
                        <svg
                          className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div className="flex-1 text-sm text-slate-700">
                          <p className="font-semibold text-slate-900">
                            {getCached(`record-${record.prescriptionId}`)
                              .title || "Untitled"}
                          </p>
                          {getCached(`record-${record.prescriptionId}`)
                            .summary && (
                            <p className="mt-1 text-slate-600">
                              {
                                getCached(`record-${record.prescriptionId}`)
                                  .summary
                              }
                            </p>
                          )}
                          {getCached(`record-${record.prescriptionId}`)
                            .notes && (
                            <p className="mt-1 text-xs text-slate-500">
                              <span className="font-medium">Notes:</span>{" "}
                              {
                                getCached(`record-${record.prescriptionId}`)
                                  .notes
                              }
                            </p>
                          )}
                          {getCached(`record-${record.prescriptionId}`)
                            .medications &&
                            getCached(`record-${record.prescriptionId}`)
                              .medications.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-slate-700">
                                  Medications:
                                </p>
                                <ul className="mt-1 space-y-1">
                                  {getCached(
                                    `record-${record.prescriptionId}`,
                                  ).medications.map((med, i) => (
                                    <li
                                      key={i}
                                      className="text-xs text-slate-600 flex items-start gap-1"
                                    >
                                      <span className="text-purple-600 mt-0.5">
                                        •
                                      </span>
                                      <span>
                                        {med.name} - {med.dosage},{" "}
                                        {med.schedule}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                        </div>
                      </div>
                    </div>
                  )}
                  {getDecryptionError(`record-${record.prescriptionId}`) && (
                    <p className="mt-1 text-xs text-rose-600">
                      {getDecryptionError(`record-${record.prescriptionId}`)}
                    </p>
                  )}
                  {record.metadataURI && (
                    <p className="mt-1">
                      <span className="font-semibold text-slate-900">
                        Metadata:
                      </span>{" "}
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
