/**
 * Notification Health Checks — probes for the notification subsystem.
 *
 * Three health check probes:
 * 1. PostgreSQL notification-store round-trip latency
 * 2. Admin-broadcast endpoint error rate
 * 3. SSE connection count gauge
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";

// ── Durable Notification Store Probe ────────────────────────────

export async function checkNotificationStoreHealth(): Promise<{
  healthy: boolean;
  latencyMs: number;
}> {
  const start = performance.now();
  try {
    await getDb().execute(sql`SELECT 1`);
    return { healthy: true, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { healthy: false, latencyMs: -1 };
  }
}

// ── Admin-Broadcast Error Rate Probe ────────────────────────────

const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const ERROR_RATE_THRESHOLD = 0.1; // 10%

interface RateCounter {
  total: number;
  errors: number;
  windowStart: number;
}

// Note: In-memory counter is per-worker. Multi-worker deployments will have
// independent counters. For accurate cross-worker metrics, migrate to Redis.
const broadcastCounter: RateCounter = {
  total: 0,
  errors: 0,
  windowStart: Date.now(),
};

function resetCounterIfStale(): void {
  const now = Date.now();
  if (now - broadcastCounter.windowStart > WINDOW_MS) {
    broadcastCounter.total = 0;
    broadcastCounter.errors = 0;
    broadcastCounter.windowStart = now;
  }
}

/** Call from admin-broadcast endpoint on each request. */
export function recordBroadcastRequest(success: boolean): void {
  resetCounterIfStale();
  broadcastCounter.total++;
  if (!success) broadcastCounter.errors++;
}

export async function checkAdminBroadcastHealth(): Promise<{
  healthy: boolean;
  errorRate: number;
}> {
  resetCounterIfStale();
  if (broadcastCounter.total === 0) {
    return { healthy: true, errorRate: 0 };
  }
  const errorRate = broadcastCounter.errors / broadcastCounter.total;
  return {
    healthy: errorRate <= ERROR_RATE_THRESHOLD,
    errorRate: Math.round(errorRate * 10000) / 10000,
  };
}

// ── SSE Connection Count Gauge ──────────────────────────────────

/** Import and read the activeSubscribers map size from notificationStream. */
export async function getSSEConnectionCount(): Promise<number> {
  // The notificationStream module exports activeSubscribers as a module-level Map.
  // We read its total size across all users.
  try {
    const streamModule = await import("../routes/notificationStream");
    if (typeof streamModule.getActiveSSEConnectionCount === "function") {
      return streamModule.getActiveSSEConnectionCount();
    }
    return -1; // Function not exported yet
  } catch {
    return -1;
  }
}

const SSE_ALERT_THRESHOLD = 500;

// ── Combined Health Check ───────────────────────────────────────

export interface NotificationHealthResult {
  healthy: boolean;
  probes: {
    notificationStore: { healthy: boolean; latencyMs: number };
    adminBroadcast: { healthy: boolean; errorRate: number };
    sseConnections: { count: number; healthy: boolean };
  };
}

export async function checkNotificationHealth(): Promise<NotificationHealthResult> {
  const [notificationStore, adminBroadcast, sseCount] = await Promise.all([
    checkNotificationStoreHealth(),
    checkAdminBroadcastHealth(),
    getSSEConnectionCount(),
  ]);

  const sseHealthy = sseCount < 0 || sseCount <= SSE_ALERT_THRESHOLD;

  return {
    healthy: notificationStore.healthy && adminBroadcast.healthy && sseHealthy,
    probes: {
      notificationStore,
      adminBroadcast,
      sseConnections: { count: sseCount, healthy: sseHealthy },
    },
  };
}
