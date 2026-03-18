import type { Sensor, SensorReading } from "../types";

async function pingEndpoint(url: string): Promise<number> {
  const start = Date.now();
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Date.now() - start;
}

const apiLatencySensor: Sensor = {
  id: "api_latency",
  name: "API Latency",
  defaultIntervalMs: 300_000,
  category: "system",

  async collect(): Promise<SensorReading> {
    let webLatencyMs = -1;
    let pythonLatencyMs = -1;
    const errors: string[] = [];

    try {
      webLatencyMs = await pingEndpoint("http://localhost:3000/api/health");
    } catch (err) {
      errors.push(`web: ${err instanceof Error ? err.message : "failed"}`);
    }

    try {
      pythonLatencyMs = await pingEndpoint("http://localhost:8000/api/health");
    } catch (err) {
      errors.push(`python: ${err instanceof Error ? err.message : "failed"}`);
    }

    const maxLatency = Math.max(webLatencyMs, pythonLatencyMs);
    let status: SensorReading["status"] = "healthy";
    if (errors.length === 2 || maxLatency > 15_000) status = "critical";
    else if (errors.length === 1 || maxLatency > 5_000) status = "degraded";

    return {
      sensorId: "api_latency",
      timestamp: new Date(),
      status,
      metrics: { webLatencyMs, pythonLatencyMs },
      message:
        errors.length > 0
          ? `API errors: ${errors.join("; ")}`
          : `Web: ${webLatencyMs}ms, Python: ${pythonLatencyMs}ms`,
    };
  },
};

export default apiLatencySensor;
