import { getSensors, collectSafe, loadSensorConfig } from "./sensorRegistry";
import { evaluateReading, initCooldownMap } from "./ruleEngine";
import { registerAllSensors } from "./sensorRegistry";
import { expireStaleApprovals } from "./actuatorRegistry";
import { ensureSystemUser } from "./systemUser";
import { setNotifier } from "./ruleEngine";
import { dispatchNotification } from "./notifier";
import type { Sensor } from "./types";

// Import actuator registrations (side-effect imports)
import "./actuators/autoFixActions";
import "./actuators/approvalActions";

let isRunning = false;
let sensorTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
let approvalExpiryTimer: ReturnType<typeof setInterval> | null = null;
let watchdogTimer: ReturnType<typeof setInterval> | null = null;
let lastPollTimestamps: Map<string, number> = new Map();

/**
 * Start the System Guardian lifecycle.
 * Initializes system user, registers sensors, loads cooldowns, and starts polling.
 */
export async function startGuardian(): Promise<void> {
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
    watchdogTimer = setInterval(() => {
      watchdogCheck();
    }, 60_000);

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
      const reading = await collectSafe(sensor);
      lastPollTimestamps.set(sensor.id, Date.now());
      await evaluateReading(reading);

      // For per-tenant sensors, also poll per active tenant
      // (skipped for MVP — would need tenant list)
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

function watchdogCheck(): void {
  const now = Date.now();
  const staleThreshold = 10 * 60 * 1000; // 10 minutes

  for (const [sensorId, lastPoll] of lastPollTimestamps) {
    if (now - lastPoll > staleThreshold) {
      console.warn(`[Guardian] Watchdog: sensor ${sensorId} has not polled for ${Math.round((now - lastPoll) / 60000)}min`);
    }
  }
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

  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }

  lastPollTimestamps.clear();
  isRunning = false;
  console.log("[Guardian] Stopped");
}

export function isGuardianRunning(): boolean {
  return isRunning;
}

/**
 * Health check endpoint data for the guardian.
 */
export function getGuardianHealth(): {
  running: boolean;
  sensorCount: number;
  lastPollTimes: Record<string, string>;
} {
  const lastPolls: Record<string, string> = {};
  for (const [id, ts] of lastPollTimestamps) {
    lastPolls[id] = new Date(ts).toISOString();
  }

  return {
    running: isRunning,
    sensorCount: getSensors().length,
    lastPollTimes: lastPolls,
  };
}

// Handle SIGTERM for graceful shutdown
process.on("SIGTERM", () => {
  console.log("[Guardian] SIGTERM received, shutting down...");
  stopGuardian();
});
