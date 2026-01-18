const express = require("express");
const requestService = require("../services/requestService");

const router = express.Router();

const addressRegex = /^0x[a-fA-F0-9]{40}$/;
const txHashRegex = /^0x[a-fA-F0-9]{64}$/;

function getSender(req) {
  const sender = req.headers["x-sender"];
  if (!sender || typeof sender !== "string") {
    const error = new Error("Missing x-sender header");
    error.status = 400;
    throw error;
  }
  if (!addressRegex.test(sender)) {
    const error = new Error("Invalid x-sender address");
    error.status = 400;
    throw error;
  }
  return sender.toLowerCase();
}

function assertAddress(value, field) {
  if (typeof value !== "string" || !addressRegex.test(value)) {
    const err = new Error(`Invalid ${field}`);
    err.status = 400;
    throw err;
  }
}

function assertPayloadFields(payload) {
  if (!payload || typeof payload !== "object") {
    const err = new Error("Missing payload");
    err.status = 400;
    throw err;
  }
  if (typeof payload.title !== "string" || !payload.title.trim()) {
    const err = new Error("Payload title is required");
    err.status = 400;
    throw err;
  }
}

function assertTxHash(value, field) {
  if (typeof value !== "string" || !txHashRegex.test(value)) {
    const err = new Error(`Invalid ${field}`);
    err.status = 400;
    throw err;
  }
}

router.post("/", async (req, res, next) => {
  try {
    console.log("Incoming request payload:", req.body);
    const doctorAddress = getSender(req);
    const body = req.body || {};
    if (body.kind !== "prescription" && body.kind !== "access") {
      throw Object.assign(
        new Error("Request kind must be 'prescription' or 'access'"),
        {
          status: 400,
        }
      );
    }
    assertAddress(body.patientAddress, "patientAddress");

    if (body.kind === "prescription") {
      assertPayloadFields(body.payload);
      // New: Validate doctor signature fields
      if (typeof body.doctorSignature !== "string" || !body.doctorSignature.startsWith("0x")) {
         const err = new Error("Missing or invalid doctorSignature");
         err.status = 400;
         throw err;
      }
      if (typeof body.nonce !== "string" && typeof body.nonce !== "number") {
         const err = new Error("Missing nonce");
         err.status = 400;
         throw err;
      }
       if (typeof body.validUntil !== "string" && typeof body.validUntil !== "number") {
         const err = new Error("Missing validUntil");
         err.status = 400;
         throw err;
      }
    } else if (typeof body.reason !== "string" || !body.reason.trim()) {
      const err = new Error("Reason is required for access requests");
      err.status = 400;
      throw err;
    }

    const request = await requestService.createDoctorRequest({
      doctorAddress,
      patientAddress: body.patientAddress,
      kind: body.kind,
      payload: body.kind === "prescription" ? body.payload : undefined,
      reason: body.kind === "access" ? body.reason : undefined,
      doctorSignature: body.kind === "prescription" ? body.doctorSignature : undefined,
      nonce: body.kind === "prescription" ? body.nonce : undefined,
      validUntil: body.kind === "prescription" ? body.validUntil : undefined,
    });
    res.status(201).json(request);
  } catch (error) {
    next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const address = req.query.address;
    assertAddress(address, "address");
    const role =
      req.query.role === "doctor" || req.query.role === "patient"
        ? req.query.role
        : undefined;

    const requests = await requestService.listRequests({ address, role });
    res.json(requests);
  } catch (error) {
    next(error);
  }
});

router.post("/:id/approve", async (req, res, next) => {
  try {
    const patientAddress = getSender(req);
    const requestId = req.params.id;
    const chainData = req.body;
    if (!chainData || typeof chainData !== "object") {
      throw Object.assign(new Error("Missing chain metadata"), { status: 400 });
    }
    assertTxHash(chainData.transactionHash, "transactionHash");
    if (
      chainData.prescriptionId !== undefined &&
      (typeof chainData.prescriptionId !== "number" ||
        chainData.prescriptionId <= 0)
    ) {
      throw Object.assign(new Error("Invalid prescriptionId"), { status: 400 });
    }

    const updated = await requestService.completeRequest({
      requestId,
      patientAddress,
      chainData,
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
