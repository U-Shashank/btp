const { env, ensurePinataConfig } = require("../config/env");

const PIN_JSON_ENDPOINT = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

function buildGatewayUrl(cid) {
  let base = env.PINATA_GATEWAY.trim();
  if (!base) return `ipfs://${cid}`;

  if (base.endsWith("/")) {
    base = base.slice(0, -1);
  }

  // Ensure /ipfs prefix exists exactly once
  if (base.toLowerCase().endsWith("/ipfs")) {
    return `${base}/${cid}`;
  }

  if (base.toLowerCase().includes("/ipfs/")) {
    return `${base}/${cid}`;
  }

  return `${base}/ipfs/${cid}`;
}

async function pinJSON(content, { name } = {}) {
  ensurePinataConfig();

  const response = await fetch(PIN_JSON_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      pinataContent: content,
      pinataMetadata: {
        name: name ?? "medledger-prescription",
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Pinata pinJSON failed (${response.status}): ${errorBody || "Unknown error"}`
    );
  }

  const data = await response.json();
  return {
    ipfsHash: data.IpfsHash,
    metadataURI: buildGatewayUrl(data.IpfsHash),
  };
}

module.exports = {
  pinJSON,
};
