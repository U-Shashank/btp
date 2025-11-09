const express = require("express");
const requestService = require("../services/requestService");
const prescriptionService = require("../services/prescriptionService");

const router = express.Router();

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

router.get("/:patient/prescriptions", async (req, res, next) => {
  try {
    const patientAddress = req.params.patient;
    if (!addressRegex.test(patientAddress)) {
      return res.status(400).json({ message: "Invalid patient address" });
    }
    const viewerAddress = req.headers["x-viewer"];
    if (!viewerAddress || typeof viewerAddress !== "string" || !addressRegex.test(viewerAddress)) {
      return res.status(400).json({ message: "Missing or invalid viewer address" });
    }

    const recorded = await requestService.listRecordedPrescriptionsByPatient(patientAddress);

    const normalizedViewer = viewerAddress.toLowerCase();
    const allowed = [];
    for (const entry of recorded) {
      let canView = false;
      if (
        normalizedViewer === entry.patientAddress.toLowerCase() ||
        normalizedViewer === entry.doctorAddress.toLowerCase()
      ) {
        canView = true;
      } else if (entry.prescriptionId) {
        canView = await prescriptionService.canView({
          prescriptionId: entry.prescriptionId,
          viewerAddress,
        });
      }

      if (canView) {
        allowed.push({
          id: entry.id,
          prescriptionId: entry.prescriptionId,
          metadataURI: entry.metadataURI,
          payload: entry.payload,
          doctorAddress: entry.doctorAddress,
          patientAddress: entry.patientAddress,
          recordedAt: entry.recordedAt,
          transactionHash: entry.transactionHash,
        });
      }
    }

    res.json(allowed);
  } catch (error) {
    next(error);
  }
});

module.exports = router;

