const { ethers } = require("ethers");
const { env, ensureChainConfig } = require("../config/env");

const PRESCRIPTION_REGISTRY_ABI = [
  "function getPrescription(uint256 prescriptionId) view returns (tuple(address doctor, address patient, string metadataURI, uint256 createdAt))",
  "function canView(uint256 prescriptionId, address viewer) view returns (bool)"
];

let contractSingleton;

function getContract() {
  if (!contractSingleton) {
    ensureChainConfig();
    const provider = new ethers.JsonRpcProvider(env.RPC_URL);
    contractSingleton = new ethers.Contract(
      env.PRESCRIPTION_REGISTRY_ADDRESS,
      PRESCRIPTION_REGISTRY_ABI,
      provider
    );
  }
  return contractSingleton;
}

async function fetchPrescription({ prescriptionId, viewerAddress }) {
  const contract = getContract();
  try {
    const record = await contract.getPrescription.staticCall(prescriptionId, {
      from: viewerAddress,
    });
    return {
      allowed: true,
      prescription: {
        doctor: record.doctor,
        patient: record.patient,
        metadataURI: record.metadataURI,
        createdAt: Number(record.createdAt)
      }
    };
  } catch (error) {
    if (error.shortMessage?.includes("UnauthorizedViewer")) {
      return { allowed: false };
    }
    throw error;
  }
}

async function canView({ prescriptionId, viewerAddress }) {
  const contract = getContract();
  return contract.canView(prescriptionId, viewerAddress);
}

module.exports = {
  fetchPrescription,
  canView
};
