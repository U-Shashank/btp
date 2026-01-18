const { randomUUID } = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const STORE_PATH = path.join(__dirname, "../../data/requests.json");

async function ensureStoreFile() {
  try {
    await fs.access(STORE_PATH);
  } catch (err) {
    if (err.code === "ENOENT") {
      await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
      await fs.writeFile(STORE_PATH, "[]", "utf-8");
    } else {
      throw err;
    }
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(STORE_PATH, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

async function writeStore(requests) {
  await fs.writeFile(STORE_PATH, JSON.stringify(requests, null, 2));
}

async function listRequests() {
  return readStore();
}

async function getRequest(id) {
  const requests = await readStore();
  return requests.find((req) => req.id === id);
}

async function createRequest(data) {
  const requests = await readStore();
  const now = new Date().toISOString();
  const entry = {
    id: randomUUID(),
    status: "pending", // All new off-chain drafts start as pending
    createdAt: now,
    updatedAt: now,
    ...data,
  };
  requests.push(entry);
  await writeStore(requests);
  return entry;
}

async function updateRequest(id, updates) {
  const requests = await readStore();
  const index = requests.findIndex((req) => req.id === id);
  if (index === -1) {
    return null;
  }
  const now = new Date().toISOString();
  requests[index] = {
    ...requests[index],
    ...updates,
    updatedAt: now,
  };
  await writeStore(requests);
  return requests[index];
}

module.exports = {
  listRequests,
  getRequest,
  createRequest,
  updateRequest,
};
