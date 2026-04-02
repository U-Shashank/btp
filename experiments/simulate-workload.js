#!/usr/bin/env node
const path = require("path");

const {
  formatNumber,
  parseArgs,
  readJson,
  toCsv,
  writeJson,
  writeText,
} = require("./lib/common");

function bytesToMegabytes(bytes) {
  return bytes / (1024 * 1024);
}

function loadDataset(datasetPath) {
  if (!datasetPath) return null;
  const dataset = readJson(datasetPath);
  const prescriptions = Array.isArray(dataset.prescriptions) ? dataset.prescriptions : [];
  const averagePayloadBytes = prescriptions.length
    ? prescriptions.reduce((sum, entry) => sum + Buffer.byteLength(JSON.stringify(entry.payload)), 0) / prescriptions.length
    : 0;

  return {
    path: datasetPath,
    prescriptions: prescriptions.length,
    averagePayloadBytes,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(args.outdir || path.join(__dirname, "output"));
  const baselinePath = path.resolve(
    args.baseline || path.join(outputDir, "prototype-baseline.json")
  );
  const datasetPath = args.dataset
    ? path.resolve(args.dataset)
    : path.join(outputDir, "synthetic-dataset.json");

  const baseline = readJson(baselinePath);
  const dataset = loadDataset(datasetPath);

  const metrics = baseline.metricSummary;
  const averagePayloadBytes = dataset?.averagePayloadBytes || 1024;
  const workloads = [
    { label: "Pilot review demo", prescriptions: 25, delegates: 5 },
    { label: "Department rollout", prescriptions: 100, delegates: 20 },
    { label: "Hospital scale simulation", prescriptions: 500, delegates: 100 },
  ];

  const rows = workloads.map((workload) => {
    const prescriptionCount = workload.prescriptions;
    const delegateCount = workload.delegates;
    const cumulativeDraftSeconds = (prescriptionCount * (metrics.draft_creation_ms.mean || 0)) / 1000;
    const cumulativeFinalizeSeconds = (prescriptionCount * (metrics.finalization_ms.mean || 0)) / 1000;
    const cumulativeDelegateSeconds = (delegateCount * (metrics.delegate_ms.mean || 0)) / 1000;
    const cumulativeEncryptionSeconds = (prescriptionCount * (metrics.encryption_ms.mean || 0)) / 1000;
    const cumulativeDecryptionSeconds = (prescriptionCount * (metrics.decryption_ms.mean || 0)) / 1000;
    const cumulativeApiSeconds =
      (((prescriptionCount * 4) + (delegateCount * 2)) * (metrics.api_latency_overall.mean || 0)) / 1000;
    const gasFinalize = prescriptionCount * (metrics.gas_finalize.mean || 0);
    const gasDelegate = delegateCount * (metrics.gas_delegate.mean || 0);
    const offchainVolumeMb = bytesToMegabytes(prescriptionCount * averagePayloadBytes);

    return {
      workload: workload.label,
      prescriptions: prescriptionCount,
      delegate_approvals: delegateCount,
      cumulative_draft_seconds: formatNumber(cumulativeDraftSeconds),
      cumulative_finalize_seconds: formatNumber(cumulativeFinalizeSeconds),
      cumulative_delegate_seconds: formatNumber(cumulativeDelegateSeconds),
      cumulative_encryption_seconds: formatNumber(cumulativeEncryptionSeconds),
      cumulative_decryption_seconds: formatNumber(cumulativeDecryptionSeconds),
      cumulative_api_seconds: formatNumber(cumulativeApiSeconds),
      estimated_gas_units: Math.round(gasFinalize + gasDelegate),
      estimated_offchain_volume_mb: formatNumber(offchainVolumeMb, 3),
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    baselinePath,
    dataset,
    assumptions: {
      note: "This is a workload simulation based on prototype-measured averages, not a throughput benchmark.",
      apiCallsPerPrescription: 4,
      apiCallsPerDelegateApproval: 2,
      workloads,
    },
    rows,
  };

  writeJson(path.join(outputDir, "workload-simulation.json"), payload);
  writeText(
    path.join(outputDir, "workload-simulation.csv"),
    toCsv(rows, [
      "workload",
      "prescriptions",
      "delegate_approvals",
      "cumulative_draft_seconds",
      "cumulative_finalize_seconds",
      "cumulative_delegate_seconds",
      "cumulative_encryption_seconds",
      "cumulative_decryption_seconds",
      "cumulative_api_seconds",
      "estimated_gas_units",
      "estimated_offchain_volume_mb",
    ])
  );

  console.log(`Workload simulation written to ${path.join(outputDir, "workload-simulation.json")}`);
}

main();
