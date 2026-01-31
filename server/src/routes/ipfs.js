const express = require("express");
const { pinJSON } = require("../services/pinataService");

const router = express.Router();

/**
 * Updates an encrypted bundle on IPFS
 * Used for re-encryption when adding new recipients (e.g., delegates)
 * POST /api/ipfs/update
 * Body: { bundle: <encrypted bundle object> }
 */
router.post("/update", async (req, res, next) => {
  try {
    const { bundle } = req.body;
    
    if (!bundle || typeof bundle !== "object") {
      const error = new Error("Missing or invalid bundle");
      error.status = 400;
      throw error;
    }
    
    // Validate bundle structure
    if (!bundle.version || !bundle.encryptedPayload || !bundle.recipients) {
      const error = new Error("Invalid encrypted bundle structure");
      error.status = 400;
      throw error;
    }
    
    // Pin the updated bundle to IPFS
    const result = await pinJSON(bundle, {
      name: `updated-prescription-${bundle.metadata?.prescriptionId || Date.now()}`,
    });
    
    res.json({
      ipfsHash: result.ipfsHash,
      metadataURI: result.metadataURI,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
