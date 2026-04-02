#!/usr/bin/env node
const path = require("path");

const { toCsv, writeJson, writeText } = require("./lib/common");

const papers = [
  {
    short_name: "Block MedCare (2024)",
    platform: "Ethereum + dApp",
    experiment_style: "Usability survey + functional prototype",
    metrics_reported: "Survey responses, perceived interoperability, adoption concerns",
    scaling_axis: "No node-scaling benchmark",
    conclusion_style: "Strong interest and perceived healthcare interoperability benefits, with cost/complexity concerns",
    how_to_reference: "Use as support for problem relevance and usability interest, not for performance comparison",
  },
  {
    short_name: "Chelladurai & Pandian (2021)",
    platform: "Hyperledger Fabric",
    experiment_style: "System performance evaluation",
    metrics_reported: "CPU utilization, memory usage, response time, throughput",
    scaling_axis: "General system load, not explicit validator-count graph",
    conclusion_style: "Blockchain EHR improves integrity/privacy with acceptable resource usage and response times",
    how_to_reference: "Closest match if you want to discuss response-time and throughput style experiments",
  },
  {
    short_name: "Aljaloud & Razzaq (2023)",
    platform: "Ethereum migration from legacy HMS",
    experiment_style: "Cost and query-efficiency analysis",
    metrics_reported: "Contract creation cost, transaction cost, query time",
    scaling_axis: "No explicit node-count scaling",
    conclusion_style: "Tamper-proof storage with manageable costs and improved interoperability",
    how_to_reference: "Useful when defending gas-cost and deployment-cost discussion",
  },
  {
    short_name: "Shuaib et al. (2022)",
    platform: "Hyperledger Besu with IBFT",
    experiment_style: "Comparative blockchain benchmark under load",
    metrics_reported: "Latency, throughput, failure rate",
    scaling_axis: "Yes, performance under increased load and validator participation",
    conclusion_style: "Permissioned IBFT performs better than PoW-style healthcare systems for latency and throughput",
    how_to_reference: "This is the strongest source for the nodes/load-versus-latency style benchmark",
  },
  {
    short_name: "Bhandari et al. (2023)",
    platform: "Ethereum + IPFS",
    experiment_style: "Functional deployment and gas-cost observation",
    metrics_reported: "Activity gas costs, successful testnet workflow",
    scaling_axis: "No explicit scaling benchmark",
    conclusion_style: "Reliable decentralized storage/sharing demonstrated on testnet",
    how_to_reference: "Use when discussing decentralized storage and transaction-cost evidence",
  },
  {
    short_name: "HealthChain (2024)",
    platform: "Blockchain EHR framework",
    experiment_style: "Framework comparison with reported latency/throughput/security",
    metrics_reported: "Latency, throughput, interoperability, breach reduction claims",
    scaling_axis: "Yes, framed as scalability and attack stability",
    conclusion_style: "Framework is faster, more interoperable, and more secure than selected baselines",
    how_to_reference: "Use as a feature/scalability reference, but avoid direct apples-to-apples numeric comparison",
  },
  {
    short_name: "Tahir et al. (2024)",
    platform: "Ethereum + IPFS",
    experiment_style: "Cost, response time, throughput, security analysis",
    metrics_reported: "Transaction cost, response time, throughput, vulnerability findings",
    scaling_axis: "Load-handling discussion, not a strict node-count benchmark",
    conclusion_style: "Lower cost and better response than chosen baselines with stronger auditability",
    how_to_reference: "Useful for concluding that blockchain EHR evaluation often combines performance and security framing",
  },
];

function buildMarkdown(rows) {
  const lines = [
    "# Literature Experiment Map",
    "",
    "This table converts the reviewed papers into a final-review-ready comparison focused on experiment design and conclusion style.",
    "",
    "| Paper | Experiment style | Metrics reported | Node/load scaling? | Safe use in MedLedger review |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.short_name} | ${row.experiment_style} | ${row.metrics_reported} | ${row.scaling_axis} | ${row.how_to_reference} |`
    );
  }

  lines.push("");
  lines.push("## Recommended Positioning For MedLedger");
  lines.push("");
  lines.push("- Say that prior work commonly reports latency, throughput, gas/cost, resource usage, or usability evidence.");
  lines.push("- Say that explicit node-versus-latency evidence usually comes from permissioned multi-node testbeds, not single-node local prototypes.");
  lines.push("- Position MedLedger as providing measured prototype evidence, workflow-security improvements, and simulation-based scaling discussion.");

  return `${lines.join("\n")}\n`;
}

function main() {
  const outputDir = path.join(__dirname, "output");

  writeJson(path.join(outputDir, "literature-comparison.json"), {
    generatedAt: new Date().toISOString(),
    papers,
  });

  writeText(
    path.join(outputDir, "literature-comparison.csv"),
    toCsv(papers, [
      "short_name",
      "platform",
      "experiment_style",
      "metrics_reported",
      "scaling_axis",
      "conclusion_style",
      "how_to_reference",
    ])
  );

  writeText(
    path.join(outputDir, "literature-comparison.md"),
    buildMarkdown(papers)
  );

  console.log(`Literature comparison written to ${outputDir}`);
}

main();
