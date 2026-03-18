import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { Sensor, SensorReading } from "../types";

const execFileAsync = promisify(execFile);
const MEDIA_STORAGE_PATH = path.resolve("../../python-backend/media_storage");
const WARNING_BYTES = 10 * 1024 * 1024 * 1024; // 10GB
const CRITICAL_BYTES = 50 * 1024 * 1024 * 1024; // 50GB

const diskStorageSensor: Sensor = {
  id: "disk_storage",
  name: "Disk Storage",
  defaultIntervalMs: 3_600_000,
  category: "cross_system",

  async collect(): Promise<SensorReading> {
    try {
      const { stdout } = await execFileAsync("du", ["-sb", MEDIA_STORAGE_PATH]);
      const usedBytes = parseInt(stdout.split("\t")[0], 10);

      const { stdout: dfOut } = await execFileAsync("df", ["-B1", MEDIA_STORAGE_PATH]);
      const dfLines = dfOut.trim().split("\n");
      const dfParts = dfLines[1]?.split(/\s+/) || [];
      const availableBytes = parseInt(dfParts[3] || "0", 10);
      const totalBytes = parseInt(dfParts[1] || "1", 10);
      const usedPercent = Math.round((usedBytes / totalBytes) * 100);

      let status: SensorReading["status"] = "healthy";
      if (usedBytes >= CRITICAL_BYTES) status = "critical";
      else if (usedBytes >= WARNING_BYTES) status = "degraded";

      return {
        sensorId: "disk_storage",
        timestamp: new Date(),
        status,
        metrics: {
          usedBytes,
          availableBytes,
          usedPercent,
        },
        message: `Storage: ${(usedBytes / 1024 / 1024 / 1024).toFixed(1)}GB used, ${(availableBytes / 1024 / 1024 / 1024).toFixed(1)}GB available`,
      };
    } catch (err) {
      return {
        sensorId: "disk_storage",
        timestamp: new Date(),
        status: "unknown",
        metrics: {},
        message: err instanceof Error ? err.message : "Disk check failed",
      };
    }
  },
};

export default diskStorageSensor;
