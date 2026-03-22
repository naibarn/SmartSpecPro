/**
 * Queue Health Monitor
 *
 * Background service that monitors Celery/Redis queue health and raises alerts
 * when anomalies are detected. Runs every 60 seconds on the web server.
 *
 * Detects:
 * - Queue backlog (items piling up because no worker is consuming)
 * - Stuck tasks (queue length growing over consecutive checks)
 * - Dead workers (queue exists but no consumer processing items)
 * - Sudden spikes (queue length jumps significantly between checks)
 *
 * Alerts are logged to:
 * - Console (for journalctl/log aggregation)
 * - Audit JSONL log (for admin dashboard queries)
 */

import { getRedisClient } from "./redis";
import { auditLogger } from "./auditLogger";

// ── Configuration ──────────────────────────────────────────

const MONITOR_INTERVAL_MS = 60_000; // Check every 60 seconds
const QUEUE_BACKLOG_THRESHOLD = 100; // Alert if queue > 100 items
const QUEUE_CRITICAL_THRESHOLD = 1000; // Critical alert if queue > 1000 items
const QUEUE_GROWTH_RATE_THRESHOLD = 50; // Alert if queue grows by >50 items between checks
const CONSECUTIVE_GROWTH_ALERT = 3; // Alert if queue grows for 3 consecutive checks

// Queues to monitor (must match Celery queue names in celery_app.py)
const MONITORED_QUEUES = [
  { name: "celery", label: "Default (should be empty)", maxExpected: 10 },
  { name: "media", label: "Media Generation", maxExpected: 50 },
  { name: "video", label: "Video Processing", maxExpected: 20 },
  { name: "presentation_export", label: "Presentation Export", maxExpected: 10 },
  { name: "presentation_import", label: "Presentation Import", maxExpected: 10 },
  { name: "sandbox", label: "Sandbox Execution", maxExpected: 10 },
  { name: "vision", label: "Vision Analysis", maxExpected: 10 },
];

// ── Types ──────────────────────────────────────────────────

interface QueueSnapshot {
  name: string;
  length: number;
  timestamp: number;
}

interface QueueAlert {
  queue: string;
  label: string;
  severity: "warning" | "critical";
  type: "backlog" | "growth" | "dead_consumer" | "spike";
  message: string;
  currentLength: number;
  previousLength: number | null;
  threshold: number;
}

export interface QueueHealthStatus {
  healthy: boolean;
  lastCheckAt: string | null;
  queues: Array<{
    name: string;
    label: string;
    length: number;
    maxExpected: number;
    status: "ok" | "warning" | "critical";
    consecutiveGrowth: number;
  }>;
  activeAlerts: QueueAlert[];
  history: Array<{
    timestamp: string;
    queues: Record<string, number>;
  }>;
}

// ── State ──────────────────────────────────────────────────

const previousSnapshots: Map<string, QueueSnapshot[]> = new Map();
const consecutiveGrowthCounts: Map<string, number> = new Map();
const activeAlerts: QueueAlert[] = [];
const snapshotHistory: Array<{ timestamp: number; queues: Record<string, number> }> = [];
const MAX_HISTORY_LENGTH = 60; // Keep 60 checks = 1 hour of history

let monitorTimer: ReturnType<typeof setInterval> | null = null;
let lastCheckAt: string | null = null;

// ── Core Logic ─────────────────────────────────────────────

async function getQueueLengths(): Promise<Map<string, number>> {
  const redis = getRedisClient();
  const lengths = new Map<string, number>();

  for (const queue of MONITORED_QUEUES) {
    try {
      const len = await redis.llen(queue.name);
      lengths.set(queue.name, len);
    } catch {
      lengths.set(queue.name, -1); // Error reading
    }
  }
  return lengths;
}

function detectAnomalies(current: Map<string, number>): QueueAlert[] {
  const alerts: QueueAlert[] = [];
  const now = Date.now();

  for (const queue of MONITORED_QUEUES) {
    const currentLen = current.get(queue.name) ?? 0;
    if (currentLen < 0) continue; // Skip errored queues

    const prevSnapshots = previousSnapshots.get(queue.name) ?? [];
    const prevLen = prevSnapshots.length > 0 ? prevSnapshots[prevSnapshots.length - 1]!.length : null;
    const growthCount = consecutiveGrowthCounts.get(queue.name) ?? 0;

    // 1. Critical backlog
    if (currentLen > QUEUE_CRITICAL_THRESHOLD) {
      alerts.push({
        queue: queue.name,
        label: queue.label,
        severity: "critical",
        type: "backlog",
        message: `Queue "${queue.name}" has ${currentLen} items (critical threshold: ${QUEUE_CRITICAL_THRESHOLD}). Possible dead worker or runaway task producer.`,
        currentLength: currentLen,
        previousLength: prevLen,
        threshold: QUEUE_CRITICAL_THRESHOLD,
      });
    }
    // 2. Warning backlog (above per-queue max)
    else if (currentLen > queue.maxExpected && currentLen > QUEUE_BACKLOG_THRESHOLD) {
      alerts.push({
        queue: queue.name,
        label: queue.label,
        severity: "warning",
        type: "backlog",
        message: `Queue "${queue.name}" has ${currentLen} items (expected max: ${queue.maxExpected}).`,
        currentLength: currentLen,
        previousLength: prevLen,
        threshold: queue.maxExpected,
      });
    }

    // 3. Sudden spike
    if (prevLen !== null && currentLen - prevLen > QUEUE_GROWTH_RATE_THRESHOLD) {
      alerts.push({
        queue: queue.name,
        label: queue.label,
        severity: "warning",
        type: "spike",
        message: `Queue "${queue.name}" grew by ${currentLen - prevLen} items in 60s (from ${prevLen} to ${currentLen}).`,
        currentLength: currentLen,
        previousLength: prevLen,
        threshold: QUEUE_GROWTH_RATE_THRESHOLD,
      });
    }

    // 4. Consecutive growth (queue not draining)
    if (prevLen !== null && currentLen > prevLen && currentLen > 5) {
      consecutiveGrowthCounts.set(queue.name, growthCount + 1);
      if (growthCount + 1 >= CONSECUTIVE_GROWTH_ALERT) {
        alerts.push({
          queue: queue.name,
          label: queue.label,
          severity: currentLen > QUEUE_BACKLOG_THRESHOLD ? "critical" : "warning",
          type: "dead_consumer",
          message: `Queue "${queue.name}" has been growing for ${growthCount + 1} consecutive checks (${currentLen} items). No worker is consuming tasks.`,
          currentLength: currentLen,
          previousLength: prevLen,
          threshold: CONSECUTIVE_GROWTH_ALERT,
        });
      }
    } else {
      consecutiveGrowthCounts.set(queue.name, 0);
    }

    // Update history
    const snapshots = prevSnapshots.slice(-5); // Keep last 5
    snapshots.push({ name: queue.name, length: currentLen, timestamp: now });
    previousSnapshots.set(queue.name, snapshots);
  }

  return alerts;
}

async function tickQueueHealthMonitor(): Promise<void> {
  try {
    const lengths = await getQueueLengths();
    const alerts = detectAnomalies(lengths);
    const now = new Date();
    lastCheckAt = now.toISOString();

    // Update snapshot history
    const snapshot: Record<string, number> = {};
    for (const [name, len] of lengths) {
      snapshot[name] = len;
    }
    snapshotHistory.push({ timestamp: Date.now(), queues: snapshot });
    if (snapshotHistory.length > MAX_HISTORY_LENGTH) {
      snapshotHistory.splice(0, snapshotHistory.length - MAX_HISTORY_LENGTH);
    }

    // Update active alerts
    activeAlerts.length = 0;
    activeAlerts.push(...alerts);

    // Log alerts
    for (const alert of alerts) {
      const logLevel = alert.severity === "critical" ? "error" : "warn";
      console[logLevel](`[QueueHealth] ${alert.severity.toUpperCase()}: ${alert.message}`);

      auditLogger.log({
        traceId: `queue-health:${alert.queue}:${now.getTime()}`,
        timestamp: now.toISOString(),
        eventType: "error",
        userId: 0, // System event
        requestPayload: {
          queue: alert.queue,
          label: alert.label,
          severity: alert.severity,
          type: alert.type,
          currentLength: alert.currentLength,
          previousLength: alert.previousLength,
          threshold: alert.threshold,
        },
        responsePayload: {
          message: alert.message,
        },
      });
    }

    // Periodic summary log (every 5 minutes = every 5th check)
    const checkCount = snapshotHistory.length;
    if (checkCount % 5 === 0) {
      const queueSummary = MONITORED_QUEUES.map((q) => `${q.name}=${lengths.get(q.name) ?? "?"}`).join(", ");
      console.log(`[QueueHealth] Summary: ${queueSummary} | alerts=${alerts.length}`);
    }
  } catch (err) {
    console.error("[QueueHealth] Monitor tick failed:", err instanceof Error ? err.message : String(err));
  }
}

// ── Public API ─────────────────────────────────────────────

export function startQueueHealthMonitor(): void {
  if (monitorTimer) return;
  console.log(`[QueueHealth] Started (interval=${MONITOR_INTERVAL_MS}ms, queues=${MONITORED_QUEUES.length})`);
  monitorTimer = setInterval(() => {
    tickQueueHealthMonitor().catch(() => {});
  }, MONITOR_INTERVAL_MS);
  // First check after 10 seconds (let workers start up)
  setTimeout(() => { tickQueueHealthMonitor().catch(() => {}); }, 10_000);
}

export function stopQueueHealthMonitor(): void {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
    console.log("[QueueHealth] Stopped");
  }
}

export function getQueueHealthStatus(): QueueHealthStatus {
  const queues = MONITORED_QUEUES.map((q) => {
    const snapshots = previousSnapshots.get(q.name) ?? [];
    const latest = snapshots.length > 0 ? snapshots[snapshots.length - 1]! : null;
    const length = latest?.length ?? 0;
    const growth = consecutiveGrowthCounts.get(q.name) ?? 0;

    let status: "ok" | "warning" | "critical" = "ok";
    if (length > QUEUE_CRITICAL_THRESHOLD || growth >= CONSECUTIVE_GROWTH_ALERT) {
      status = "critical";
    } else if (length > q.maxExpected || length > QUEUE_BACKLOG_THRESHOLD) {
      status = "warning";
    }

    return {
      name: q.name,
      label: q.label,
      length,
      maxExpected: q.maxExpected,
      status,
      consecutiveGrowth: growth,
    };
  });

  return {
    healthy: activeAlerts.length === 0,
    lastCheckAt,
    queues,
    activeAlerts: [...activeAlerts],
    history: snapshotHistory.slice(-30).map((s) => ({
      timestamp: new Date(s.timestamp).toISOString(),
      queues: s.queues,
    })),
  };
}
