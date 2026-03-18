import { getSensors, collectSafe, loadSensorConfig } from "./sensorRegistry";
import { evaluateReading, initCooldownMap } from "./ruleEngine";
import { registerAllSensors } from "./sensorRegistry";
import { expireStaleApprovals } from "./actuatorRegistry";
import { ensureSystemUser } from "./systemUser";
import { setNotifier } from "./ruleEngine";
import { dispatchNotification } from "./notifier";
import {
  startWatchdog,
  stopWatchdog,
  recordSensorPoll,
  getHealthStatus,
  getLastPollTimestamps,
} from "./guardianWatchdog";
import { getDb } from "../../db";
import { tenants } from "../../../drizzle/schema";
import type { Sensor } from "./types";

// Import actuator registrations (side-effect imports)
import "./actuators/autoFixActions";
import "./actuators/approvalActions";
import "./actuators/notifyActions";

let isRunning = false;
let sensorTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
let approvalExpiryTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the System Guardian lifecycle.
 * Initializes system user, registers sensors, loads cooldowns, and starts polling.
 */
export async function startGuardian(): Promise<void> {
  if (process.env.VIRTUAL_ADMIN_ENABLED === "false") {
    console.log("[Guardian] Disabled via VIRTUAL_ADMIN_ENABLED=false");
    return;
  }

  if (isRunning) {
    console.log("[Guardian] Already running, skipping start");
    return;
  }

  console.log("[Guardian] Starting System Guardian...");

  try {
    // Phase 1: Initialize
    await ensureSystemUser();
    await registerAllSensors();
    await initCooldownMap();

    // Wire notifier to rule engine
    setNotifier(async (incidentId, severity, channels, tenantId) => {
      await dispatchNotification({
        tenantId,
        incidentId,
        severity: severity as any,
        title: `Incident #${incidentId}`,
        message: `Severity: ${severity}`,
        ruleId: "unknown",
        sensorId: "unknown",
      });
    });

    // Phase 2: Schedule sensors with stagger
    const sensors = getSensors();
    let staggerMs = 0;

    for (const sensor of sensors) {
      const delay = staggerMs;
      staggerMs += 2000; // 2s stagger between sensors

      setTimeout(() => {
        scheduleSensor(sensor);
      }, delay);
    }

    // Phase 3: Approval expiry check every 5 minutes
    approvalExpiryTimer = setInterval(async () => {
      try {
        await expireStaleApprovals();
      } catch (err) {
        console.error("[Guardian] Approval expiry check failed:", err);
      }
    }, 5 * 60 * 1000);

    // Phase 4: Watchdog self-monitor every 60 seconds
    startWatchdog();

    isRunning = true;
    console.log(`[Guardian] Started with ${sensors.length} sensors`);
  } catch (err) {
    console.error("[Guardian] Failed to start:", err);
  }
}

function scheduleSensor(sensor: Sensor): void {
  const intervalMs = sensor.defaultIntervalMs;

  async function poll() {
    try {
      if (sensor.category === "per_tenant") {
        // Poll per active tenant
        const db = await getDb();
        if (db) {
          const activeTenants = await db
            .select({ id: tenants.id })
            .from(tenants)
            .limit(100);
          for (const tenant of activeTenants) {
            const reading = await collectSafe(sensor, tenant.id);
            recordSensorPoll(sensor.id);
            await evaluateReading(reading);
          }
        }
      } else {
        // System-wide or cross-system
        const reading = await collectSafe(sensor);
        recordSensorPoll(sensor.id);
        await evaluateReading(reading);
      }
    } catch (err) {
      console.error(`[Guardian] Sensor ${sensor.id} poll error:`, err);
    }
  }

  // Initial poll
  poll();

  // Recurring poll
  const timer = setInterval(poll, intervalMs);
  sensorTimers.set(sensor.id, timer);
}

/**
 * Stop the System Guardian gracefully.
 */
export function stopGuardian(): void {
  if (!isRunning) return;

  console.log("[Guardian] Stopping...");

  for (const [id, timer] of sensorTimers) {
    clearInterval(timer);
  }
  sensorTimers.clear();

  if (approvalExpiryTimer) {
    clearInterval(approvalExpiryTimer);
    approvalExpiryTimer = null;
  }

  stopWatchdog();

  isRunning = false;
  console.log("[Guardian] Stopped");
}

export function isGuardianRunning(): boolean {
  return isRunning;
}

/**
 * Synchronous health check — legacy shape, safe for callers that don't await.
 * Returns last-known poll timestamps from the watchdog module.
 */
export function getGuardianHealth(): {
  running: boolean;
  sensorCount: number;
  lastPollTimes: Record<string, string>;
} {
  const lastPolls: Record<string, string> = {};
  for (const [id, ts] of getLastPollTimestamps()) {
    lastPolls[id] = new Date(ts).toISOString();
  }
  return {
    running: isRunning,
    sensorCount: getSensors().length,
    lastPollTimes: lastPolls,
  };
}

/**
 * Full async health status — includes stuck sensor detection, memory usage,
 * and open incident count. Delegates to the watchdog module.
 */
export async function getGuardianHealthFull() {
  return getHealthStatus();
}

// Handle SIGTERM for graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Guardian] SIGTERM received, shutting down...");
  stopGuardian();
});
