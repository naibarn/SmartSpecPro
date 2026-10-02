/**
 * Ops Anomaly Monitor
 *
 * Periodically evaluates the unified ops overview, synthesizes monitoring
 * alerts, and notifies admins for critical pre-failure signals.
 */

import { getOpsOverview, syncOpsAlerts } from "./monitoringService";

// Queue/worker control-plane failures must reach operators within a minute,
// not wait for the former five-minute sweep. syncOpsAlerts deduplicates active
// anomaly notifications, so faster polling does not mean repeated paging.
const MONITOR_INTERVAL_MS = 60_000;
const INITIAL_DELAY_MS = 20_000;

let monitorTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

async function tickOpsAnomalyMonitor(): Promise<void> {
  if (running) return;
  running = true;

  try {
    const overview = await getOpsOverview();
    const result = await syncOpsAlerts({
      includeWarnings: true,
      overview,
    });

    if (overview.summary.totalAnomalies > 0) {
      console.warn("[OpsAnomaly] summary", {
        health: overview.health,
        criticalCount: overview.summary.criticalCount,
        warningCount: overview.summary.warningCount,
        emittedAlerts: result.emittedAlerts,
        emittedNotifications: result.emittedNotifications,
        skippedAsDuplicate: result.skippedAsDuplicate,
      });
    }
  } catch (error) {
    console.error(
      "[OpsAnomaly] Monitor tick failed:",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    running = false;
  }
}

export function startOpsAnomalyMonitor(): void {
  if (monitorTimer) return;

  console.log(`[OpsAnomaly] Started (interval=${MONITOR_INTERVAL_MS}ms)`);
  monitorTimer = setInterval(() => {
    void tickOpsAnomalyMonitor();
  }, MONITOR_INTERVAL_MS);

  setTimeout(() => {
    void tickOpsAnomalyMonitor();
  }, INITIAL_DELAY_MS);
}

export function stopOpsAnomalyMonitor(): void {
  if (!monitorTimer) return;
  clearInterval(monitorTimer);
  monitorTimer = null;
  console.log("[OpsAnomaly] Stopped");
}
