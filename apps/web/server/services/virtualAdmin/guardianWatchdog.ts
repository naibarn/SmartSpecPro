import { eq, sql } from "drizzle-orm";
import { getDb } from "../../db";
import { virtualAdminIncidents } from "../../../drizzle/schema";
import { getSensors } from "./sensorRegistry";

export interface GuardianHealthStatus {
  running: boolean;
  upSince: string | null;
  sensorCount: number;
  stuckSensors: string[];
  memoryUsageMB: number;
  memoryOk: boolean;
  openIncidentCount: number;
  lastCheckAt: string | null;
}

let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let lastCheckAt: Date | null = null;
let upSince: Date | null = null;

// Track last poll timestamps keyed by sensor ID
const lastPollTimestamps = new Map<string, number>();

export function recordSensorPoll(sensorId: string): void {
  lastPollTimestamps.set(sensorId, Date.now());
}

export function getLastPollTimestamps(): ReadonlyMap<string, number> {
  return lastPollTimestamps;
}

export function startWatchdog(): void {
  upSince = new Date();
  watchdogTimer = setInterval(checkHealth, 60_000); // Every 60s
}

export function stopWatchdog(): void {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
  upSince = null;
  lastPollTimestamps.clear();
}

function checkHealth(): void {
  lastCheckAt = new Date();
  const now = Date.now();

  // Check for stuck sensors (no poll in 3x their default interval)
  const sensors = getSensors();
  const stuckSensors: string[] = [];
  for (const sensor of sensors) {
    const lastPoll = lastPollTimestamps.get(sensor.id);
    if (lastPoll && now - lastPoll > sensor.defaultIntervalMs * 3) {
      stuckSensors.push(sensor.id);
      console.warn(
        `[Watchdog] Sensor ${sensor.id} stuck — last poll ${Math.round((now - lastPoll) / 60_000)}min ago`,
      );
    }
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  if (memMB > 200) {
    console.warn(`[Watchdog] High memory usage: ${memMB}MB`);
  }
}

export async function getHealthStatus(): Promise<GuardianHealthStatus> {
  const sensors = getSensors();
  const now = Date.now();

  const stuckSensors: string[] = [];
  for (const sensor of sensors) {
    const lastPoll = lastPollTimestamps.get(sensor.id);
    if (lastPoll && now - lastPoll > sensor.defaultIntervalMs * 3) {
      stuckSensors.push(sensor.id);
    }
  }

  const memUsage = process.memoryUsage();
  const memMB = Math.round(memUsage.heapUsed / 1024 / 1024);

  // Count open incidents — non-critical, ignore errors
  let openIncidentCount = 0;
  try {
    const db = await getDb();
    if (db) {
      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(virtualAdminIncidents)
        .where(eq(virtualAdminIncidents.status, "open"));
      openIncidentCount = Number(result[0]?.count ?? 0);
    }
  } catch {
    // non-critical — leave count at 0
  }

  return {
    running: watchdogTimer !== null,
    upSince: upSince?.toISOString() ?? null,
    sensorCount: sensors.length,
    stuckSensors,
    memoryUsageMB: memMB,
    memoryOk: memMB <= 200,
    openIncidentCount,
    lastCheckAt: lastCheckAt?.toISOString() ?? null,
  };
}
