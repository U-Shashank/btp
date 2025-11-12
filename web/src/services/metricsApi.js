import { appConfig } from "../config";

export async function logMetric(type, value) {
  if (typeof type !== "string" || typeof value !== "number" || Number.isNaN(value)) {
    return;
  }
  try {
    await fetch(`${appConfig.apiBaseUrl}/metrics`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ type, value }),
    });
  } catch {
    // Swallow metric errors; don't impact UX
  }
}

