const { pinJSON } = require("./pinataService");
const store = require("./requestStore");

async function createDoctorRequest({
  doctorAddress,
  patientAddress,
  kind,
  payload,
  reason,
  draftId,
  draftTxHash,
}) {
  let metadataURI;
  let ipfsHash;
  let storedPayload = payload;

  if (kind === "prescription") {
    if (!payload) {
      const err = new Error("Missing prescription payload");
      err.status = 400;
      throw err;
    }
    if (!draftId || typeof draftId !== "number") {
      const err = new Error("Missing on-chain draft id");
      err.status = 400;
      throw err;
    }
    const pinPayload = {
      doctor: doctorAddress,
      patient: patientAddress,
      payload,
      createdAt: new Date().toISOString(),
    };
    const pinResult = await pinJSON(pinPayload, {
      name: `prescription-${patientAddress}-${Date.now()}`,
    });
    metadataURI = pinResult.metadataURI;
    ipfsHash = pinResult.ipfsHash;
  } else if (kind === "access") {
    storedPayload = { reason };
  } else {
    const err = new Error("Unsupported request kind");
    err.status = 400;
    throw err;
  }

  const record = await store.createRequest({
    doctorAddress,
    patientAddress,
    kind,
    draftId,
    draftTxHash,
    ipfsHash,
    metadataURI,
    payload: storedPayload,
  });

  return record;
}

async function listRequests({ role, address }) {
  const normalized = address.toLowerCase();
  const requests = await store.listRequests();

  return requests.filter((req) => {
    if (role === "doctor") {
      return req.doctorAddress.toLowerCase() === normalized;
    }
    if (role === "patient") {
      return req.patientAddress.toLowerCase() === normalized;
    }
    // default: return all matching either role
    return (
      req.doctorAddress.toLowerCase() === normalized ||
      req.patientAddress.toLowerCase() === normalized
    );
  });
}

async function listRecordedPrescriptionsByPatient(patientAddress) {
  const normalized = patientAddress.toLowerCase();
  const requests = await store.listRequests();
  return requests.filter(
    (req) => req.status === "recorded" && req.patientAddress.toLowerCase() === normalized
  );
}

async function completeRequest({ requestId, patientAddress, chainData }) {
  const request = await store.getRequest(requestId);
  if (!request) {
    const error = new Error("Request not found");
    error.status = 404;
    throw error;
  }

  if (request.patientAddress.toLowerCase() !== patientAddress.toLowerCase()) {
    const error = new Error("Only the target patient can approve this request");
    error.status = 403;
    throw error;
  }

  if (request.status === "recorded" || request.status === "granted") {
    return request;
  }

  if (request.kind === "prescription") {
    if (
      !chainData ||
      typeof chainData.prescriptionId !== "number" ||
      !chainData.transactionHash
    ) {
      const error = new Error("Missing chain metadata for prescription");
      error.status = 400;
      throw error;
    }

    return store.updateRequest(requestId, {
      status: "recorded",
      prescriptionId: chainData.prescriptionId,
      transactionHash: chainData.transactionHash,
      recordedAt: new Date().toISOString(),
    });
  }

  if (request.kind === "access") {
    if (!chainData || !chainData.transactionHash) {
      const error = new Error("Missing transaction hash for access request");
      error.status = 400;
      throw error;
    }
    return store.updateRequest(requestId, {
      status: "granted",
      transactionHash: chainData.transactionHash,
      recordedAt: new Date().toISOString(),
    });
  }

  const error = new Error("Unsupported request kind");
  error.status = 400;
  throw error;
}

module.exports = {
  createDoctorRequest,
  listRequests,
  completeRequest,
  listRecordedPrescriptionsByPatient,
};
