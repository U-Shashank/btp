#!/usr/bin/env node
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const commands = [
  ["node", ["experiments/generate-synthetic-data.js"]],
  ["node", ["experiments/analyze-prototype.js"]],
  ["node", ["experiments/simulate-workload.js"]],
  ["node", ["experiments/simulate-blockchain.js"]],
  ["node", ["experiments/build-literature-comparison.js"]],
];

for (const [command, args] of commands) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log("Final-review artifacts regenerated in experiments/output.");
