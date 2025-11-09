const dotenv = require("dotenv");

dotenv.config();

function parseOptionalString(val) {
  if (typeof val !== "string") return undefined;
  const trimmed = val.trim();
  return trimmed === "" ? undefined : trimmed;
}

const env = {
  PORT: (() => {
    const raw = process.env.PORT;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 4000;
  })(),
  RPC_URL: parseOptionalString(process.env.RPC_URL),
  PRESCRIPTION_REGISTRY_ADDRESS: parseOptionalString(
    process.env.PRESCRIPTION_REGISTRY_ADDRESS
  ),
  PINATA_JWT: parseOptionalString(process.env.PINATA_JWT),
  PINATA_GATEWAY:
    parseOptionalString(process.env.PINATA_GATEWAY) ??
    "https://gateway.pinata.cloud/ipfs/",
};

// Temporary log of env variables (remove later)
console.log("env:", env);

function ensureChainConfig() {
  const missing = [];
  if (!env.RPC_URL) missing.push("RPC_URL");
  if (!env.PRESCRIPTION_REGISTRY_ADDRESS)
    missing.push("PRESCRIPTION_REGISTRY_ADDRESS");

  if (missing.length) {
    throw new Error(`Missing blockchain config: ${missing.join(", ")}`);
  }
}

function ensurePinataConfig() {
  if (!env.PINATA_JWT) {
    throw new Error("Missing PINATA_JWT");
  }
}

module.exports = {
  env,
  ensureChainConfig,
  ensurePinataConfig,
};
