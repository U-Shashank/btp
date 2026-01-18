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
  doctorSignature, // New
  nonce,           // New
  validUntil,      // New
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
      payload,
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
