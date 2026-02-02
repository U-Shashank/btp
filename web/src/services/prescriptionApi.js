import { appConfig } from "../config";

async function request(path, options = {}) {
  let res;
  try {
    const url = `${appConfig.apiBaseUrl}${path}`;
    console.log(`🌐 API Request: ${options.method || 'GET'} ${url}`);
    
    const finalHeaders = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    
    console.log('  📨 Headers being sent:', finalHeaders);
    console.log('  📨 x-sender in final headers:', finalHeaders['x-sender']);
    
    res = await fetch(url, {
      headers: finalHeaders,
      ...options,
    });
    
    console.log(`✅ API Response: ${res.status} ${res.statusText}`);
  } catch (error) {
    console.error('❌ API Request Failed:', error);
    const message =
      error?.message?.includes("Network") || error?.message?.includes("Failed to fetch")
        ? "Network error while contacting the API. Please ensure the server is running and try again."
        : error.message;
    throw new Error(message || "Network request failed");
  }

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    console.error('❌ API Error Response:', errorBody);
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
  console.log('📤 createPrescriptionRequest called');
  console.log('  sender value:', sender);
  console.log('  sender type:', typeof sender);
  console.log('  sender truthy:', !!sender);
  
  const headers = {
    "Content-Type": "application/json",
    ...(sender && { "x-sender": sender }),
  };
  
  console.log('  Final headers object:', headers);
  console.log('  x-sender present:', 'x-sender' in headers);
  console.log('  x-sender value:', headers['x-sender']);
  
  return request("/requests", {
    method: "POST",
    headers: headers,
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
    headers: {
      "Content-Type": "application/json",
      ...(sender && { "x-sender": sender }),
    },
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
    headers: {
      "Content-Type": "application/json",
      ...(sender && { "x-sender": sender }),
    },
    body: JSON.stringify(payload),
  });
}

export async function fetchPrescription({ prescriptionId, viewerAddress }) {
  return request(`/prescriptions/${prescriptionId}`, {
    headers: {
      ...(viewerAddress && { "x-viewer": viewerAddress }),
    },
  });
}

export async function fetchPatientPrescriptions({ patientAddress, viewerAddress }) {
  return request(`/patients/${patientAddress}/prescriptions`, {
    headers: {
      ...(viewerAddress && { "x-viewer": viewerAddress }),
    },
  });
}

/**
 * Fetches an encrypted bundle from IPFS gateway with retry logic
 * @param {string} metadataURI - IPFS gateway URL (e.g., https://gateway.pinata.cloud/ipfs/QmXXX)
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} retryDelay - Delay between retries in ms (default: 1000)
 * @returns {Promise<Object>} Encrypted bundle object
 */
export async function fetchIPFSBundle(metadataURI, maxRetries = 3, retryDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch(metadataURI, { 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const bundle = await response.json();
      
      // Validate bundle structure
      if (!bundle.version || !bundle.encryptedPayload || !bundle.recipients) {
        throw new Error('Invalid bundle structure');
      }
      
      return bundle;
    } catch (error) {
      lastError = error;
      const isTimeout = error.name === 'AbortError';
      const isNetworkError = error.message.includes('Failed to fetch') || error.message.includes('Network');
      
      // Don't retry on validation errors
      if (error.message.includes('Invalid bundle structure')) {
        throw new Error(`IPFS bundle validation failed: ${error.message}`);
      }
      
      // Retry on timeouts and network errors
      if ((isTimeout || isNetworkError) && attempt < maxRetries) {
        console.warn(`IPFS fetch attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${retryDelay}ms...`, error.message);
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1))); // Exponential backoff
        continue;
      }
      
      // For other errors or final attempt, throw immediately
      if (attempt === maxRetries) {
        throw new Error(`IPFS fetch failed after ${maxRetries + 1} attempts: ${error.message}`);
      }
    }
  }
  
  throw new Error(`IPFS fetch failed: ${lastError?.message || 'Unknown error'}`);
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
