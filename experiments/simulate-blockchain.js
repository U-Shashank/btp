#!/usr/bin/env node
const path = require("path");

const {
  numberArg,
  parseArgs,
  readJson,
  sha256,
  writeJson,
} = require("./lib/common");

function buildPayloads(count, datasetPath) {
  if (datasetPath) {
    const dataset = readJson(datasetPath);
    return (dataset.prescriptions || []).slice(0, count).map((entry) => ({
      prescriptionId: entry.id,
      patientId: entry.patientId,
      doctorId: entry.doctorId,
      diagnosis: entry.diagnosis,
      ipfsCid: entry.ipfsCid,
      payloadHash: entry.payloadHash,
    }));
  }

  return Array.from({ length: count }, (_, index) => ({
    prescriptionId: `RX-${String(index + 1).padStart(4, "0")}`,
    patientId: `PT-${String(index + 1).padStart(3, "0")}`,
    doctorId: `DR-${String((index % 4) + 1).padStart(3, "0")}`,
    diagnosis: ["Flu", "Hypertension", "Migraine", "Asthma"][index % 4],
    ipfsCid: `bafy${sha256(`sample-${index}`).slice(0, 28)}`,
    payloadHash: sha256(`payload-${index}`),
  }));
}

function buildBlock(index, previousHash, payload) {
  const dataHash = sha256(JSON.stringify(payload));
  const timestamp = new Date(Date.UTC(2026, 3, 1, 10, index, 0)).toISOString();
  const blockHash = sha256(`${index}|${timestamp}|${previousHash}|${dataHash}|${payload.ipfsCid}`);

  return {
    index,
    timestamp,
    previousHash,
    dataHash,
    blockHash,
    payload,
  };
}

function buildChain(payloads) {
  const blocks = [];
  let previousHash = "GENESIS";
  payloads.forEach((payload, index) => {
    const block = buildBlock(index + 1, previousHash, payload);
    blocks.push(block);
    previousHash = block.blockHash;
  });
  return blocks;
}

function validateChain(blocks) {
  let previousBlockValid = true;
  return blocks.map((block, index) => {
    const expectedPreviousHash = index === 0 ? "GENESIS" : blocks[index - 1].blockHash;
    const expectedDataHash = sha256(JSON.stringify(block.payload));
    const expectedBlockHash = sha256(
      `${block.index}|${block.timestamp}|${block.previousHash}|${expectedDataHash}|${block.payload.ipfsCid}`
    );
    const localValid =
      block.previousHash === expectedPreviousHash &&
      block.dataHash === expectedDataHash &&
      block.blockHash === expectedBlockHash;
    const valid = previousBlockValid && localValid;
    previousBlockValid = valid;

    return {
      index: block.index,
      previousHashOk: block.previousHash === expectedPreviousHash,
      dataHashOk: block.dataHash === expectedDataHash,
      blockHashOk: block.blockHash === expectedBlockHash,
      valid,
    };
  });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const count = numberArg(args, "records", 5);
  const tamperIndex = numberArg(args, "tamper", 2) - 1;
  const outputDir = path.resolve(args.outdir || path.join(__dirname, "output"));
  const datasetPath = args.dataset ? path.resolve(args.dataset) : null;

  const originalChain = buildChain(buildPayloads(count, datasetPath));
  const originalValidation = validateChain(originalChain);

  const tamperedChain = clone(originalChain);
  tamperedChain[tamperIndex].payload.diagnosis = "Tampered diagnosis";
  const tamperedValidation = validateChain(tamperedChain);

  const rewrittenSingleBlock = clone(tamperedChain);
  rewrittenSingleBlock[tamperIndex].dataHash = sha256(
    JSON.stringify(rewrittenSingleBlock[tamperIndex].payload)
  );
  rewrittenSingleBlock[tamperIndex].blockHash = sha256(
    `${rewrittenSingleBlock[tamperIndex].index}|${rewrittenSingleBlock[tamperIndex].timestamp}|${rewrittenSingleBlock[tamperIndex].previousHash}|${rewrittenSingleBlock[tamperIndex].dataHash}|${rewrittenSingleBlock[tamperIndex].payload.ipfsCid}`
  );
  const rewrittenValidation = validateChain(rewrittenSingleBlock);

  const payload = {
    generatedAt: new Date().toISOString(),
    datasetPath,
    originalChain,
    scenarios: {
      original: {
        valid: originalValidation.every((entry) => entry.valid),
        validation: originalValidation,
      },
      tamperedDataOnly: {
        tamperedBlock: tamperIndex + 1,
        valid: tamperedValidation.every((entry) => entry.valid),
        validation: tamperedValidation,
      },
      tamperedAndRehashedSingleBlock: {
        tamperedBlock: tamperIndex + 1,
        valid: rewrittenValidation.every((entry) => entry.valid),
        validation: rewrittenValidation,
      },
    },
  };

  writeJson(path.join(outputDir, "blockchain-simulation.json"), payload);

  console.log("Blockchain simulation results");
  console.table(
    [
      {
        scenario: "Original chain",
        valid: payload.scenarios.original.valid,
        failingBlocks: payload.scenarios.original.validation.filter((entry) => !entry.valid).length,
      },
      {
        scenario: "Tampered data only",
        valid: payload.scenarios.tamperedDataOnly.valid,
        failingBlocks: payload.scenarios.tamperedDataOnly.validation.filter((entry) => !entry.valid).length,
      },
      {
        scenario: "Tampered + single rehash",
        valid: payload.scenarios.tamperedAndRehashedSingleBlock.valid,
        failingBlocks: payload.scenarios.tamperedAndRehashedSingleBlock.validation.filter((entry) => !entry.valid).length,
      },
    ]
  );
}

main();
