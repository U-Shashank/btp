const express = require("express");
const router = express.Router();
const metrics = require("../utils/metrics");

router.post("/", (req, res) => {
  const { type, value } = req.body || {};
  if (typeof type !== "string" || typeof value !== "number" || Number.isNaN(value)) {
    return res.status(400).json({ message: "type (string) and value (number) are required" });
  }
  metrics.recordMetric(type, value);
  return res.status(201).json({ status: "ok" });
});

module.exports = router;

