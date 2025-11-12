const fs = require("fs");
const path = require("path");

const METRICS_DIR = path.join(__dirname, "../../metrics");
const METRICS_FILE = path.join(METRICS_DIR, "data.json");

function ensureStore() {
  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }
  if (!fs.existsSync(METRICS_FILE)) {
    fs.writeFileSync(METRICS_FILE, JSON.stringify({}, null, 2));
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(METRICS_FILE, "utf-8");
  return raw ? JSON.parse(raw) : {};
}

function writeStore(data) {
  fs.writeFileSync(METRICS_FILE, JSON.stringify(data, null, 2));
}

function recordMetric(name, value) {
  if (typeof value !== "number" || Number.isNaN(value)) return;
  const data = readStore();
  if (!Array.isArray(data[name])) {
    data[name] = [];
  }
  data[name].push({
    value,
    timestamp: Date.now(),
  });
  writeStore(data);
}

module.exports = {
  recordMetric,
  readStore,
  METRICS_FILE,
};

