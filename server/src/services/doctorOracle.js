const { ethers } = require("ethers");
const { env } = require("../config/env");

// DoctorStatusOracle ABI - minimal interface needed for backend
const DOCTOR_ORACLE_ABI = [
  "function admin() view returns (address)",
  "function addDoctor(address doctor) external",
  "function toggleDoctorStatus(address doctor) external",
  "function isDoctorActive(address doctor) view returns (bool)",
  "function getDoctorInfo(address doctor) view returns (tuple(bool active, uint256 lastUpdated))",
  "function getAllDoctors() view returns (address[])",
  "function getDoctorCount() view returns (uint256)",
  "event DoctorAdded(address indexed doctor, uint256 timestamp)",
  "event DoctorStatusToggled(address indexed doctor, bool active, uint256 timestamp)"
];

/**
 * Get oracle contract instance
 * @returns {ethers.Contract} Oracle contract instance
 */
function getOracleContract() {
  if (!env.DOCTOR_ORACLE_ADDRESS) {
    throw new Error("DOCTOR_ORACLE_ADDRESS not configured in environment");
  }

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  return new ethers.Contract(env.DOCTOR_ORACLE_ADDRESS, DOCTOR_ORACLE_ABI, provider);
}

/**
 * Get oracle contract instance with signer for write operations
 * @returns {ethers.Contract} Oracle contract instance with signer
 */
function getOracleContractWithSigner() {
  if (!env.ADMIN_PRIVATE_KEY) {
    throw new Error("ADMIN_PRIVATE_KEY not configured - required for admin operations");
  }

  const provider = new ethers.JsonRpcProvider(env.RPC_URL);
  const wallet = new ethers.Wallet(env.ADMIN_PRIVATE_KEY, provider);
  return new ethers.Contract(env.DOCTOR_ORACLE_ADDRESS, DOCTOR_ORACLE_ABI, wallet);
}

/**
 * Check if a doctor is currently active
 * @param {string} doctorAddress - Doctor's Ethereum address
 * @returns {Promise<boolean>} True if doctor is active
 */
async function isDoctorActive(doctorAddress) {
  const contract = getOracleContract();
  return await contract.isDoctorActive(doctorAddress);
}

/**
 * Get detailed information about a doctor
 * @param {string} doctorAddress - Doctor's Ethereum address
 * @returns {Promise<{active: boolean, lastUpdated: bigint}>} Doctor info
 */
async function getDoctorInfo(doctorAddress) {
  const contract = getOracleContract();
  const info = await contract.getDoctorInfo(doctorAddress);
  return {
    active: info.active,
    lastUpdated: info.lastUpdated.toString(),
  };
}

/**
 * Get oracle admin address
 * @returns {Promise<string>} Admin address
 */
async function getOracleAdmin() {
  const contract = getOracleContract();
  return await contract.admin();
}

/**
 * Get all doctor addresses from the oracle
 * @returns {Promise<string[]>} Array of doctor addresses
 */
async function getAllDoctors() {
  const contract = getOracleContract();
  return await contract.getAllDoctors();
}

/**
 * Get total doctor count
 * @returns {Promise<number>} Total number of doctors
 */
async function getDoctorCount() {
  const contract = getOracleContract();
  const count = await contract.getDoctorCount();
  return Number(count);
}

/**
 * Add a new doctor to the oracle (admin only)
 * @param {string} doctorAddress - Doctor's Ethereum address
 * @returns {Promise<{txHash: string, doctorAddress: string}>} Transaction result
 */
async function addDoctor(doctorAddress) {
  const contract = getOracleContractWithSigner();
  
  // Validate address
  if (!ethers.isAddress(doctorAddress)) {
    throw new Error("Invalid Ethereum address");
  }

  const tx = await contract.addDoctor(doctorAddress);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    doctorAddress,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Toggle doctor's active status (admin only)
 * @param {string} doctorAddress - Doctor's Ethereum address
 * @returns {Promise<{txHash: string, doctorAddress: string, newStatus: boolean}>} Transaction result
 */
async function toggleDoctorStatus(doctorAddress) {
  const contract = getOracleContractWithSigner();

  // Get current status before toggle
  const currentInfo = await getDoctorInfo(doctorAddress);
  
  const tx = await contract.toggleDoctorStatus(doctorAddress);
  const receipt = await tx.wait();

  return {
    txHash: receipt.hash,
    doctorAddress,
    previousStatus: currentInfo.active,
    newStatus: !currentInfo.active,
    blockNumber: receipt.blockNumber,
  };
}

/**
 * Listen for oracle events (for real-time updates)
 * @param {Function} onDoctorAdded - Callback for DoctorAdded events
 * @param {Function} onDoctorStatusToggled - Callback for DoctorStatusToggled events
 */
function subscribeToOracleEvents(onDoctorAdded, onDoctorStatusToggled) {
  const contract = getOracleContract();

  if (onDoctorAdded) {
    contract.on("DoctorAdded", (doctor, timestamp, event) => {
      onDoctorAdded({
        doctor,
        timestamp: timestamp.toString(),
        transactionHash: event.log.transactionHash,
      });
    });
  }

  if (onDoctorStatusToggled) {
    contract.on("DoctorStatusToggled", (doctor, active, timestamp, event) => {
      onDoctorStatusToggled({
        doctor,
        active,
        timestamp: timestamp.toString(),
        transactionHash: event.log.transactionHash,
      });
    });
  }
}

module.exports = {
  isDoctorActive,
  getDoctorInfo,
  getOracleAdmin,
  getAllDoctors,
  getDoctorCount,
  addDoctor,
  toggleDoctorStatus,
  subscribeToOracleEvents,
  DOCTOR_ORACLE_ABI,
};
