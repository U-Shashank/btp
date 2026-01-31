import { appConfig } from "../config";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      ...options,
    });
  } catch (error) {
    const message =
      error?.message?.includes("Network") || error?.message?.includes("Failed to fetch")
        ? "Network error while contacting the API. Please ensure the server is running and try again."
        : error.message;
    throw new Error(message || "Network request failed");
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    throw new Error(errorBody.message || "Request failed");
  }
  return res.json();
}

export async function createPrescriptionRequest({
  patientAddress,
  payload,
  encryptedPayload,   // New: Support encrypted payloads
  medicationDetails,  // New: Plaintext string for co-signing
  doctorSignature,    // New
  nonce,              // New
  validUntil,         // New
  sender,
}) {
  return request("/requests", {
    method: "POST",

    headers: sender
      ? { "Content-Type": "application/json", "x-sender": sender }
      : undefined,
    body: JSON.stringify({
      kind: "prescription",
      patientAddress,
      payload: encryptedPayload || payload, // Send encrypted if available, else plaintext
      encryptedPayload, // Explicitly include encrypted payload
      medicationDetails, // Medication string for EIP-712 signing
      doctorSignature,
      nonce: nonce.toString(),
      validUntil: validUntil.toString(),
    }),
  });
}

export async function createAccessRequest({ patientAddress, reason, sender }) {
  return request("/requests", {
    method: "POST",
    headers: sender
      ? { "Content-Type": "application/json", "x-sender": sender }
      : undefined,
    body: JSON.stringify({ kind: "access", patientAddress, reason }),
  });
}

export async function fetchRequests({ address, role }) {
  const params = new URLSearchParams({ address });
  if (role) {
    params.set("role", role);
  }
  return request(`/requests?${params.toString()}`);
}

export async function completeRequest({ requestId, sender, payload }) {
  return request(`/requests/${requestId}/approve`, {
    method: "POST",
    headers: sender
      ? { "Content-Type": "application/json", "x-sender": sender }
      : undefined,
    body: JSON.stringify(payload),
  });
}

export async function fetchPrescription({ prescriptionId, viewerAddress }) {
  return request(`/prescriptions/${prescriptionId}`, {
    headers: viewerAddress ? { "x-viewer": viewerAddress } : undefined,
  });
}

export async function fetchPatientPrescriptions({ patientAddress, viewerAddress }) {
  return request(`/patients/${patientAddress}/prescriptions`, {
    headers: viewerAddress ? { "x-viewer": viewerAddress } : undefined,
  });
}

/**
 * Fetches an encrypted bundle from IPFS gateway
 * @param {string} metadataURI - IPFS gateway URL (e.g., https://gateway.pinata.cloud/ipfs/QmXXX)
 * @returns {Promise<Object>} Encrypted bundle object
 */
export async function fetchIPFSBundle(metadataURI) {
  try {
    const response = await fetch(metadataURI);
    if (!response.ok) {
      throw new Error(`Failed to fetch IPFS bundle: ${response.status} ${response.statusText}`);
    }
    const bundle = await response.json();
    return bundle;
  } catch (error) {
    throw new Error(`Error fetching IPFS bundle: ${error.message}`);
  }
}

/**
 * Pins an updated encrypted bundle to IPFS via backend
 * @param {Object} bundle - Updated encrypted bundle
 * @returns {Promise<{ipfsHash: string, metadataURI: string}>} New IPFS hash and URI
 */
export async function pinUpdatedBundle(bundle) {
  return request("/ipfs/update", {
    method: "POST",
    body: JSON.stringify({ bundle }),
  });
}
