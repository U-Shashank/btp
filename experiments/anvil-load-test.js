#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const requireFromServer = createRequire(path.join(__dirname, "../server/package.json"));
const { ethers } = requireFromServer("ethers");

const {
  formatNumber,
  parseArgs,
  stats,
  toCsv,
  writeJson,
  writeText,
} = require("./lib/common");

const DEPLOYER_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const DOCTOR_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const PATIENT_KEY =
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

const PRESCRIPTION_TYPES = {
  Prescription: [
    { name: "doctor", type: "address" },
    { name: "patient", type: "address" },
    { name: "medicationDetails", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "validUntil", type: "uint256" },
  ],
};

function loadArtifact(relativePath) {
  const artifactPath = path.join(__dirname, "../contracts/out", relativePath);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return {
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
  };
}

function parseCounts(args, key, fallback) {
  const raw = args[key];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((token) => Number(token.trim()))
    .filter((value) => Number.isFinite(value) && value > 0);
}

function parseModes(args) {
  const raw = args.modes || "sequential,burst";
  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

async function deployContracts(provider) {
  const deployerBase = new ethers.Wallet(DEPLOYER_KEY, provider);
  const deployer = new ethers.NonceManager(deployerBase);
  const doctor = new ethers.Wallet(DOCTOR_KEY, provider);
  const patient = new ethers.Wallet(PATIENT_KEY, provider);

  const oracleArtifact = loadArtifact("DoctorStatusOracle.sol/DoctorStatusOracle.json");
  const registryArtifact = loadArtifact("PrescriptionRegistry.sol/PrescriptionRegistry.json");

  const oracleFactory = new ethers.ContractFactory(
    oracleArtifact.abi,
    oracleArtifact.bytecode,
    deployer
  );
  const oracle = await oracleFactory.deploy();
  await oracle.waitForDeployment();

  const addDoctorTx = await oracle.addDoctor(doctor.address);
  await addDoctorTx.wait();

  const registryFactory = new ethers.ContractFactory(
    registryArtifact.abi,
    registryArtifact.bytecode,
    deployer
  );
  const registry = await registryFactory.deploy(await oracle.getAddress());
  await registry.waitForDeployment();

  const network = await provider.getNetwork();
  return {
    provider,
    doctor,
    patient,
    registry,
    chainId: Number(network.chainId),
    registerSequence: 0,
    delegateSequence: 0,
  };
}

async function signPrescriptionAtNonce(
  env,
  details,
  validUntil,
  doctorNonce
) {
  const domain = {
    name: "PrescriptionRegistry",
    version: "1",
    chainId: env.chainId,
    verifyingContract: await env.registry.getAddress(),
  };
  const value = {
    doctor: env.doctor.address,
    patient: env.patient.address,
    medicationDetails: details,
    nonce: doctorNonce,
    validUntil,
  };

  const doctorSignature = await env.doctor.signTypedData(
    domain,
    PRESCRIPTION_TYPES,
    value
  );
  const patientSignature = await env.patient.signTypedData(
    domain,
    PRESCRIPTION_TYPES,
    value
  );

  return { doctorSignature, patientSignature };
}

function buildViewers(count, offset) {
  return Array.from({ length: count }, (_, index) =>
    ethers.getAddress(
      `0x${(BigInt(0xBEEF) + BigInt(offset + index + 1))
        .toString(16)
        .padStart(40, "0")}`
    )
  );
}

async function submitRegisterBatch(env, txCount, batchSize) {
  const baseDoctorNonce = Number(await env.registry.nonces(env.doctor.address));
  const baseTxNonce = await env.provider.getTransactionCount(env.patient.address, "pending");
  const validUntil = Math.floor(Date.now() / 1000) + 3600;
  const prepared = [];

  for (let index = 0; index < txCount; index += 1) {
    env.registerSequence += 1;
    const details = `Meds: Load Test ${env.registerSequence}`;
    const metadataURI = `ipfs://load-register-${env.registerSequence}`;
    const signatures = await signPrescriptionAtNonce(
      env,
      details,
      validUntil,
      baseDoctorNonce + index
    );

    prepared.push({
      sequence: env.registerSequence,
      operation: "registerPrescription",
      txNonce: baseTxNonce + index,
      args: [
        env.doctor.address,
        env.patient.address,
        details,
        validUntil,
        metadataURI,
        signatures.doctorSignature,
        signatures.patientSignature,
      ],
    });
  }

  return sendPreparedTransactions(
    env,
    prepared,
    batchSize,
    (item, overrides) => env.registry.connect(env.patient).registerPrescription(...item.args, overrides)
  );
}

async function submitDelegateBatch(env, txCount, batchSize) {
  const baseTxNonce = await env.provider.getTransactionCount(env.patient.address, "pending");
  const viewers = buildViewers(txCount, env.delegateSequence);
  env.delegateSequence += txCount;
  const prepared = viewers.map((viewer, index) => ({
    sequence: env.delegateSequence - txCount + index + 1,
    operation: "setDelegate",
    txNonce: baseTxNonce + index,
    args: [viewer, true],
  }));

  return sendPreparedTransactions(
    env,
    prepared,
    batchSize,
    (item, overrides) => env.registry.connect(env.patient).setDelegate(...item.args, overrides)
  );
}

async function sendPreparedTransactions(env, prepared, batchSize, submitFn) {
  const results = [];

  for (let start = 0; start < prepared.length; start += batchSize) {
    const batch = prepared.slice(start, start + batchSize);
    const pending = await Promise.all(
      batch.map(async (item) => {
        const startedAt = Date.now();
        try {
          const gasLimit =
            item.operation === "registerPrescription" ? 300000 : 100000;
          const tx = await submitFn(item, {
            nonce: item.txNonce,
            gasLimit,
          });
          const receipt = await tx.wait();
          return {
            sequence: item.sequence,
            operation: item.operation,
            latencyMs: Date.now() - startedAt,
            gasUsed: Number(receipt.gasUsed),
            blockNumber: Number(receipt.blockNumber),
            txHash: receipt.hash,
            failed: false,
          };
        } catch (error) {
          return {
            sequence: item.sequence,
            operation: item.operation,
            latencyMs: Date.now() - startedAt,
            gasUsed: null,
            blockNumber: null,
            txHash: null,
            failed: true,
            error: error.shortMessage || error.message,
          };
        }
      })
    );

    results.push(...pending);
  }

  return results;
}

function summarizeScenario({
  operation,
  mode,
  txCount,
  batchSize,
  deploymentMode,
  results,
  totalMs,
  startState,
  endState,
}) {
  const successes = results.filter((entry) => !entry.failed);
  const latencyStats = stats(successes.map((entry) => entry.latencyMs));
  const gasStats = stats(successes.map((entry) => entry.gasUsed));

  return {
    operation,
    mode,
    deployment_mode: deploymentMode,
    tx_count: txCount,
    burst_size: batchSize,
    start_state: startState,
    end_state: endState,
    total_wall_clock_ms: totalMs,
    throughput_tps: successes.length ? successes.length / (totalMs / 1000) : 0,
    avg_latency_ms: latencyStats.mean,
    median_latency_ms: latencyStats.median,
    p95_latency_ms: latencyStats.p95,
    max_latency_ms: latencyStats.max,
    avg_gas: gasStats.mean,
    median_gas: gasStats.median,
    p95_gas: gasStats.p95,
    total_gas: successes.reduce((sum, entry) => sum + entry.gasUsed, 0),
    failures: results.length - successes.length,
  };
}

async function runOperationScenario(env, operation, txCount, mode, batchSize, deploymentMode) {
  const startState = operation === "registerPrescription" ? env.registerSequence : env.delegateSequence;
  const workloadStarted = Date.now();
  const results =
    operation === "registerPrescription"
      ? await submitRegisterBatch(env, txCount, batchSize)
      : await submitDelegateBatch(env, txCount, batchSize);
  const endState = operation === "registerPrescription" ? env.registerSequence : env.delegateSequence;

  return summarizeScenario({
    operation,
    mode,
    txCount,
    batchSize,
    deploymentMode,
    results,
    totalMs: Date.now() - workloadStarted,
    startState,
    endState,
  });
}

async function runScenarios(provider, config) {
  const rows = [];

  for (const mode of config.modes) {
    const batchSize = mode === "burst" ? config.burstSize : 1;

    if (config.deploymentMode === "shared") {
      const env = await deployContracts(provider);
      for (const txCount of config.registrationCounts) {
        rows.push(
          await runOperationScenario(
            env,
            "registerPrescription",
            txCount,
            mode,
            batchSize,
            config.deploymentMode
          )
        );
      }
      for (const txCount of config.delegateCounts) {
        rows.push(
          await runOperationScenario(
            env,
            "setDelegate",
            txCount,
            mode,
            batchSize,
            config.deploymentMode
          )
        );
      }
      continue;
    }

    for (const txCount of config.registrationCounts) {
      const env = await deployContracts(provider);
      rows.push(
        await runOperationScenario(
          env,
          "registerPrescription",
          txCount,
          mode,
          batchSize,
          config.deploymentMode
        )
      );
    }

    for (const txCount of config.delegateCounts) {
      const env = await deployContracts(provider);
      rows.push(
        await runOperationScenario(
          env,
          "setDelegate",
          txCount,
          mode,
          batchSize,
          config.deploymentMode
        )
      );
    }
  }

  return rows;
}

function buildMarkdown(rows, rpcUrl, config) {
  const lines = [
    "# Anvil Blockchain Load Test Summary",
    "",
    `Generated at ${new Date().toISOString()} against \`${rpcUrl}\`.`,
    "",
    `Deployment mode: \`${config.deploymentMode}\`. Modes run: \`${config.modes.join(", ")}\`. Burst size: \`${config.burstSize}\`.`,
    "",
    "These results come from a single-node local Anvil chain. If latency remains flat, that usually means the chain is still too idealized or underloaded.",
    "",
    "| Operation | Mode | Tx count | Start state | End state | Avg latency (ms) | P95 latency (ms) | Avg gas | Throughput (tx/s) | Failures |",
    "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const row of rows) {
    lines.push(
      `| ${row.operation} | ${row.mode} | ${row.tx_count} | ${row.start_state} | ${row.end_state} | ${formatNumber(row.avg_latency_ms)} | ${formatNumber(row.p95_latency_ms)} | ${formatNumber(row.avg_gas)} | ${formatNumber(row.throughput_tps)} | ${row.failures} |`
    );
  }

  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push("- `sequential` shows quiet local-chain behavior.");
  lines.push("- `burst` is the stress mode; it is more likely to reveal queueing and rising confirmation latency.");
  lines.push("- `shared` deployment lets state size grow across workloads, so later scenarios reflect a larger on-chain history.");
  lines.push("- For stronger slowdown, run Anvil with delayed block production such as `anvil --block-time 1` and use larger burst counts.");

  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rpcUrl = args["rpc-url"] || "http://127.0.0.1:8545";
  const outputDir = path.resolve(args.outdir || path.join(__dirname, "output"));
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  provider.pollingInterval = Number(args["polling-interval"] || 200);

  try {
    await provider.getBlockNumber();
  } catch (error) {
    console.error(`Could not reach Anvil at ${rpcUrl}`);
    console.error("Start it with: cd contracts && anvil");
    process.exit(1);
  }

  const config = {
    modes: parseModes(args),
    deploymentMode: args["deployment-mode"] || "shared",
    burstSize: Number(args["burst-size"] || 10),
    registrationCounts: parseCounts(args, "register-counts", [10, 100, 500, 1000]),
    delegateCounts: parseCounts(args, "delegate-counts", [10, 100, 500]),
  };

  const rows = await runScenarios(provider, config);
  const payload = {
    generatedAt: new Date().toISOString(),
    rpcUrl,
    environment: {
      chainType: "single-node Anvil local testnet",
      note: "For visible queueing effects, prefer burst mode and delayed block production via anvil --block-time 1.",
    },
    config,
    rows,
  };

  writeJson(path.join(outputDir, "anvil-load-test.json"), payload);
  writeText(
    path.join(outputDir, "anvil-load-test.csv"),
    toCsv(
      rows.map((row) => ({
        operation: row.operation,
        mode: row.mode,
        deployment_mode: row.deployment_mode,
        tx_count: row.tx_count,
        burst_size: row.burst_size,
        start_state: row.start_state,
        end_state: row.end_state,
        total_wall_clock_ms: formatNumber(row.total_wall_clock_ms),
        throughput_tps: formatNumber(row.throughput_tps),
        avg_latency_ms: formatNumber(row.avg_latency_ms),
        median_latency_ms: formatNumber(row.median_latency_ms),
        p95_latency_ms: formatNumber(row.p95_latency_ms),
        max_latency_ms: formatNumber(row.max_latency_ms),
        avg_gas: formatNumber(row.avg_gas),
        median_gas: formatNumber(row.median_gas),
        p95_gas: formatNumber(row.p95_gas),
        total_gas: row.total_gas,
        failures: row.failures,
      })),
      [
        "operation",
        "mode",
        "deployment_mode",
        "tx_count",
        "burst_size",
        "start_state",
        "end_state",
        "total_wall_clock_ms",
        "throughput_tps",
        "avg_latency_ms",
        "median_latency_ms",
        "p95_latency_ms",
        "max_latency_ms",
        "avg_gas",
        "median_gas",
        "p95_gas",
        "total_gas",
        "failures",
      ]
    )
  );
  writeText(path.join(outputDir, "anvil-load-test.md"), buildMarkdown(rows, rpcUrl, config));

  console.log(`Anvil load test written to ${path.join(outputDir, "anvil-load-test.json")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
