const express = require("express");
const service = require("../services/prescriptionService");

const router = express.Router();

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

router.get("/:id", async (req, res, next) => {
  try {
    const prescriptionId = Number(req.params.id);
    if (!Number.isInteger(prescriptionId) || prescriptionId <= 0) {
      return res.status(400).json({ message: "Invalid prescription id" });
    }
    const viewerAddress = req.headers["x-viewer"];
    if (!viewerAddress || typeof viewerAddress !== "string" || !addressRegex.test(viewerAddress)) {
      return res.status(400).json({ message: "Missing or invalid viewer address" });
    }
    const result = await service.fetchPrescription({ prescriptionId, viewerAddress });
    if (!result.allowed) {
      return res.status(403).json({ message: "Viewer not authorized" });
    }
    res.json(result.prescription);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
