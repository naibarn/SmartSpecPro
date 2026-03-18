import fs from "node:fs";
import path from "node:path";
import type { Sensor, SensorReading } from "../types";

const AUDIT_LOG_DIR = path.resolve("logs/audit");

const errorSpikeSensor: Sensor = {
  id: "error_spike",
  name: "Error Spike Detection",
  defaultIntervalMs: 300_000,
  category: "cross_system",

  async collect(): Promise<SensorReading> {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const logPath = path.join(AUDIT_LOG_DIR, `audit-${today}.jsonl`);

      if (!fs.existsSync(logPath)) {
        return {
          sensorId: "error_spike",
          timestamp: new Date(),
          status: "healthy",
          metrics: { errorsLast5Min: 0, baselineRate: 0, ratio: 0 },
          message: "No audit log for today yet",
        };
      }

      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.trim().split("\n").slice(-1000);
      const now = Date.now();
      const fiveMin = 5 * 60 * 1000;
      const sixtyMin = 60 * 60 * 1000;

      let errorsLast5Min = 0;
      let errorsLast60Min = 0;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          const ts = new Date(entry.timestamp || entry.ts).getTime();
          const isError =
            entry.eventType?.includes("error") ||
            entry.error ||
            entry.level === "error";

          if (isError) {
            if (now - ts <= fiveMin) errorsLast5Min++;
            if (now - ts <= sixtyMin) errorsLast60Min++;
          }
        } catch {
          // Skip unparseable lines
        }
      }

      const baselineRate = errorsLast60Min / 12; // per 5-min window
      const ratio = baselineRate > 0 ? errorsLast5Min / baselineRate : 0;

      let status: SensorReading["status"] = "healthy";
      if (ratio > 10) status = "critical";
      else if (ratio > 3) status = "degraded";

      return {
        sensorId: "error_spike",
        timestamp: new Date(),
        status,
        metrics: {
          errorsLast5Min,
          baselineRate: Math.round(baselineRate * 100) / 100,
          ratio: Math.round(ratio * 100) / 100,
        },
        message:
          status === "critical"
            ? `Error spike: ${errorsLast5Min} errors in 5min (${ratio.toFixed(1)}x baseline)`
            : status === "degraded"
              ? `Elevated errors: ${errorsLast5Min} in 5min (${ratio.toFixed(1)}x baseline)`
              : `Normal error rate: ${errorsLast5Min} in 5min`,
      };
    } catch (err) {
      return {
        sensorId: "error_spike",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Error spike check failed",
      };
    }
  },
};

export default errorSpikeSensor;
