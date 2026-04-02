#!/usr/bin/env node
const path = require("path");
const { execSync } = require("child_process");

const {
  formatNumber,
  parseArgs,
  readJson,
  stats,
  toCsv,
  writeJson,
  writeText,
} = require("./lib/common");

function cellsFromLine(line) {
  return line
    .split("|")
    .map((cell) => cell.trim())
    .filter(Boolean);
}

function parseGasReport(rawOutput) {
  const contracts = {};
  let currentContract = null;
  let expectDeploymentValues = false;
  let readingFunctions = false;

  for (const line of rawOutput.split(/\r?\n/)) {
    const cells = cellsFromLine(line);
    if (!cells.length) continue;

    if (cells.length === 1 && cells[0].endsWith(" Contract")) {
      currentContract = cells[0].replace(/ Contract$/, "");
      contracts[currentContract] = { functions: {} };
      expectDeploymentValues = false;
      readingFunctions = false;
      continue;
    }

    if (!currentContract) continue;

    if (cells[0] === "Deployment Cost") {
      expectDeploymentValues = true;
      continue;
    }

    if (expectDeploymentValues && /^\d+$/.test(cells[0]) && /^\d+$/.test(cells[1])) {
      contracts[currentContract].deploymentCost = Number(cells[0]);
      contracts[currentContract].deploymentSize = Number(cells[1]);
      expectDeploymentValues = false;
      continue;
    }

    if (cells[0] === "Function Name") {
      readingFunctions = true;
      continue;
    }

    if (
      readingFunctions &&
      cells.length >= 6 &&
      /^\d+$/.test(cells[1]) &&
      /^\d+$/.test(cells[2])
    ) {
      contracts[currentContract].functions[cells[0]] = {
        min: Number(cells[1]),
        avg: Number(cells[2]),
        median: Number(cells[3]),
        max: Number(cells[4]),
        calls: Number(cells[5]),
      };
    }
  }

  return contracts;
}

function metricEntries(metrics, key) {
  return Array.isArray(metrics[key]) ? metrics[key].map((entry) => entry.value) : [];
}

function collectSummary(metrics) {
  const apiKeys = Object.keys(metrics).filter((key) => key.startsWith("api_latency:"));
  const selected = [
    ["encryption_ms", "Encryption time", "ms"],
    ["decryption_ms", "Decryption time", "ms"],
    ["draft_creation_ms", "Draft creation", "ms"],
    ["finalization_ms", "Finalization", "ms"],
    ["delegate_ms", "Delegate approval", "ms"],
    ["pinata_upload_ms", "Pinata upload", "ms"],
    ["gas_finalize", "Finalize gas", "gas"],
    ["gas_delegate", "Delegate gas", "gas"],
  ];

  const metricSummary = {};
  for (const [key, label, unit] of selected) {
    metricSummary[key] = {
      label,
      unit,
      ...stats(metricEntries(metrics, key)),
    };
  }

  metricSummary.api_latency_overall = {
    label: "API latency overall",
    unit: "ms",
    ...stats(apiKeys.flatMap((key) => metricEntries(metrics, key))),
  };

  const apiRoutes = apiKeys
    .map((key) => ({
      route: key.replace("api_latency:", ""),
      ...stats(metricEntries(metrics, key)),
    }))
    .sort((left, right) => left.route.localeCompare(right.route));

  return { metricSummary, apiRoutes };
}

function buildMarkdown(summary, gasContracts) {
  const rows = [
    summary.metricSummary.draft_creation_ms,
    summary.metricSummary.finalization_ms,
    summary.metricSummary.delegate_ms,
    summary.metricSummary.pinata_upload_ms,
    summary.metricSummary.encryption_ms,
    summary.metricSummary.decryption_ms,
    summary.metricSummary.api_latency_overall,
    summary.metricSummary.gas_finalize,
    summary.metricSummary.gas_delegate,
  ].filter((entry) => entry.count > 0);

  const lines = [
    "# Prototype Baseline Summary",
    "",
    `Generated at ${new Date().toISOString()}.`,
    "",
    "| Metric | Samples | Mean | Median | P95 | Max |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.label} (${row.unit}) | ${row.count} | ${formatNumber(row.mean)} | ${formatNumber(row.median)} | ${formatNumber(row.p95)} | ${formatNumber(row.max)} |`
    );
  }

  if (gasContracts["src/PrescriptionRegistry.sol:PrescriptionRegistry"]) {
    const contract = gasContracts["src/PrescriptionRegistry.sol:PrescriptionRegistry"];
    lines.push("");
    lines.push("## Forge Gas Report");
    lines.push("");
    lines.push(
      `- Deployment cost: ${contract.deploymentCost} gas for ${contract.deploymentSize} bytes`
    );
    for (const functionName of ["registerPrescription", "updatePrescriptionMetadata", "getPrescription"]) {
      const details = contract.functions[functionName];
      if (!details) continue;
      lines.push(
        `- ${functionName}: avg ${details.avg} gas, median ${details.median} gas, max ${details.max} gas`
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputDir = path.resolve(args.outdir || path.join(__dirname, "output"));
  const metricsPath = path.resolve(args.metrics || path.join(__dirname, "../server/metrics/data.json"));
  const contractsDir = path.resolve(args.contracts || path.join(__dirname, "../contracts"));

  const metrics = readJson(metricsPath);
  const summary = collectSummary(metrics);

  let gasRaw = "";
  let gasContracts = {};
  if (!args["skip-gas"]) {
    gasRaw = execSync("forge test --gas-report", {
      cwd: contractsDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    gasContracts = parseGasReport(gasRaw);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    metricsPath,
    contractsDir,
    metricSummary: summary.metricSummary,
    apiRoutes: summary.apiRoutes,
    gasReport: gasContracts,
  };

  writeJson(path.join(outputDir, "prototype-baseline.json"), payload);

  const metricRows = Object.entries(summary.metricSummary).map(([key, value]) => ({
    key,
    label: value.label,
    unit: value.unit,
    count: value.count,
    min: formatNumber(value.min),
    mean: formatNumber(value.mean),
    median: formatNumber(value.median),
    p95: formatNumber(value.p95),
    max: formatNumber(value.max),
  }));
  writeText(
    path.join(outputDir, "prototype-metrics.csv"),
    toCsv(metricRows, ["key", "label", "unit", "count", "min", "mean", "median", "p95", "max"])
  );

  const routeRows = summary.apiRoutes.map((route) => ({
    route: route.route,
    count: route.count,
    mean_ms: formatNumber(route.mean),
    median_ms: formatNumber(route.median),
    p95_ms: formatNumber(route.p95),
    max_ms: formatNumber(route.max),
  }));
  writeText(
    path.join(outputDir, "api-route-breakdown.csv"),
    toCsv(routeRows, ["route", "count", "mean_ms", "median_ms", "p95_ms", "max_ms"])
  );

  writeText(path.join(outputDir, "prototype-summary.md"), buildMarkdown(summary, gasContracts));

  console.log(`Prototype baseline written to ${path.join(outputDir, "prototype-baseline.json")}`);
  console.log(`Metric CSV written to ${path.join(outputDir, "prototype-metrics.csv")}`);
  if (!args["skip-gas"]) {
    console.log("Forge gas report parsed successfully.");
  }
}

main();
