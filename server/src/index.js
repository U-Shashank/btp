const express = require("express");
const cors = require("cors");
const { env } = require("./config/env");
const prescriptionsRouter = require("./routes/prescriptions");
const requestsRouter = require("./routes/requests");
const patientsRouter = require("./routes/patients");
const metricsRouter = require("./routes/metrics");
const metrics = require("./utils/metrics");

const app = express();

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const diff = Number(process.hrtime.bigint() - start) / 1e6; // ms
    metrics.recordMetric(`api_latency:${req.method} ${req.path}`, diff);
  });
  next();
});

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    chainConfigured: Boolean(env.RPC_URL && env.PRESCRIPTION_REGISTRY_ADDRESS),
  });
});

app.use("/api/prescriptions", prescriptionsRouter);
app.use("/api/requests", requestsRouter);
app.use("/api/patients", patientsRouter);
app.use("/api/metrics", metricsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Unexpected error",
  });
});

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT}`);
});
