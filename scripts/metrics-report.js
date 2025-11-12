#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const metricsPath = path.join(__dirname, "../server/metrics/data.json");

function loadMetrics() {
  if (!fs.existsSync(metricsPath)) {
    console.error("No metrics file found at", metricsPath);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
}

function average(values) {
  if (!values || !values.length) return null;
  return values.reduce((sum, entry) => sum + entry.value, 0) / values.length;
}

function formatMs(ms) {
  if (ms == null) return "n/a";
  if (ms > 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms.toFixed(0)} ms`;
}

function formatGas(units) {
  if (units == null) return "n/a";
  return `${Math.round(units).toLocaleString()} units`;
}

function main() {
  const metrics = loadMetrics();
  const draftAvg = average(metrics.draft_creation_ms);
  const finalizeAvg = average(metrics.finalization_ms);
  const apiAvg = average(
    Object.entries(metrics)
      .filter(([key]) => key.startsWith("api_latency:"))
      .flatMap(([, arr]) => arr)
  );
  const gasFinalize = average(metrics.gas_finalize);
  const pinataAvg = average(metrics.pinata_upload_ms);

  const rows = [
    ["Average Draft Creation Time", formatMs(draftAvg)],
    ["Finalization Time (on-chain)", formatMs(finalizeAvg)],
    ["API Latency (overall)", formatMs(apiAvg)],
    ["Gas Usage (finalize)", formatGas(gasFinalize)],
    ["Pinata Upload Latency", formatMs(pinataAvg)],
  ];

  console.log("\nMeasured Performance Metrics\n");
  console.table(rows.map(([Metric, Result]) => ({ Metric, Result })));
}

main();

