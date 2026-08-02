import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { virtualAdminSensorConfig } from "../../../drizzle/schema";
import type { Sensor, SensorReading, SensorConfig } from "./types";

const sensors: Sensor[] = [];

export function registerSensor(sensor: Sensor): void {
  if (!sensors.find((s) => s.id === sensor.id)) {
    sensors.push(sensor);
  }
}

export function getSensors(): Sensor[] {
  return [...sensors];
}

export function getSensorById(id: string): Sensor | undefined {
  return sensors.find((s) => s.id === id);
}

/**
 * Safely collect a reading from a sensor with timeout and error handling.
 * Never throws — always returns a SensorReading.
 */
export async function collectSafe(
  sensor: Sensor,
  tenantId?: string,
): Promise<SensorReading> {
  const start = Date.now();
  try {
    const reading = await Promise.race([
      sensor.collect(tenantId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Sensor timeout (10s)")), 10_000),
      ),
    ]);
    return reading;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown sensor error";
    return {
      sensorId: sensor.id,
      timestamp: new Date(),
      status: "unknown",
      metrics: { latencyMs: Date.now() - start },
      message,
      tenantId,
    };
  }
}

/**
 * Load per-tenant sensor config overrides from the database.
 * Returns null if no override exists (use sensor defaults).
 */
export async function loadSensorConfig(
  tenantId: string,
  sensorId: string,
): Promise<SensorConfig | null> {
  const db = await getDb();
  if (!db) return null;

  const compoundId = `${tenantId}:${sensorId}`;
  const rows = await db
    .select()
    .from(virtualAdminSensorConfig)
    .where(eq(virtualAdminSensorConfig.id, compoundId))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    tenantId: row.tenantId,
    sensorId: row.sensorId,
    enabled: row.enabled,
    intervalMs: row.intervalMs,
    thresholdsJson: row.thresholdsJson as Record<string, unknown> | null,
    updatedAt: row.updatedAt,
  };
}

/**
 * Register all built-in sensors. Called once at Guardian startup.
 */
export async function registerAllSensors(): Promise<void> {
  const sensorModules = await Promise.all([
    import("./sensors/queueHealth"),
    import("./sensors/celeryHealth"),
    import("./sensors/errorSpike"),
    import("./sensors/llmProvider"),
    import("./sensors/creditBalance"),
    import("./sensors/diskStorage"),
    import("./sensors/dbHealth"),
    import("./sensors/certExpiry"),
    import("./sensors/apiLatency"),
    import("./sensors/mediaPipeline"),
    import("./sensors/teamEscalation"),
    import("./sensors/videoIntelligenceHealth"),
  ]);
  for (const mod of sensorModules) {
    registerSensor(mod.default);
  }
}
