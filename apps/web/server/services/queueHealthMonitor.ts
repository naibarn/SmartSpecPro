/**
 * Compatibility-shaped health view backed only by the canonical worker_jobs
 * and worker_heartbeats tables.
 */

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "../db";
import { workerHeartbeats, workerJobs } from "../../drizzle/schema";

const MONITOR_INTERVAL_MS = 60_000;
const BACKLOG_WARNING_THRESHOLD = 100;
const BACKLOG_CRITICAL_THRESHOLD = 1_000;
const LIVE_HEARTBEAT_WINDOW_MS = 120_000;

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
  activeAlerts: Array<{
    queue: string;
    label: string;
    severity: "warning" | "critical";
    type: "backlog" | "growth" | "dead_consumer" | "spike";
    message: string;
    currentLength: number;
    previousLength: number | null;
    threshold: number;
  }>;
  history: Array<{ timestamp: string; queues: Record<string, number> }>;
}

let monitorTimer: ReturnType<typeof setInterval> | null = null;
let latestStatus: QueueHealthStatus = {
  healthy: false,
  lastCheckAt: null,
  queues: [],
  activeAlerts: [],
  history: [],
};

async function refreshWorkerJobHealth(): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [jobs, workerSummary] = await Promise.all([
    db.select({ status: workerJobs.status, count: sql<number>`count(*)::int` })
      .from(workerJobs).where(
      inArray(workerJobs.status, ["queued", "retry_scheduled", "leased", "running", "waiting_external"]),
    ).groupBy(workerJobs.status),
    db.select({ count: sql<number>`count(distinct ${workerHeartbeats.workerId})::int` })
      .from(workerHeartbeats).where(and(
      gt(workerHeartbeats.createdAt, new Date(Date.now() - LIVE_HEARTBEAT_WINDOW_MS)),
      inArray(workerHeartbeats.runtimeType, ["node_job_worker", "python_job_worker"]),
      eq(workerHeartbeats.status, "online"),
    )),
  ]);

  const counts = new Map(jobs.map((job) => [job.status, Number(job.count)]));
  const backlog = (counts.get("queued") ?? 0) + (counts.get("retry_scheduled") ?? 0);
  const active = (counts.get("leased") ?? 0) + (counts.get("running") ?? 0) + (counts.get("waiting_external") ?? 0);
  const workers = Number(workerSummary[0]?.count ?? 0);
  const noWorkerForQueuedJobs = backlog > 0 && workers === 0;
  const severity = noWorkerForQueuedJobs || backlog >= BACKLOG_CRITICAL_THRESHOLD ? "critical"
    : backlog >= BACKLOG_WARNING_THRESHOLD ? "warning" : null;
  const alerts: QueueHealthStatus["activeAlerts"] = severity ? [{
    queue: "worker_jobs",
    label: "Canonical worker_jobs backlog",
    severity,
    type: noWorkerForQueuedJobs ? "dead_consumer" : "backlog",
    message: noWorkerForQueuedJobs
      ? `worker_jobs has ${backlog} queued jobs and no live worker heartbeat`
      : `worker_jobs has ${backlog} queued or retry-scheduled jobs`,
    currentLength: backlog,
    previousLength: null,
    threshold: severity === "critical" ? BACKLOG_CRITICAL_THRESHOLD : BACKLOG_WARNING_THRESHOLD,
  }] : [];
  const checkedAt = new Date();
  const rowStatus = severity === "critical" ? "critical" : severity ? "warning" : "ok";
  latestStatus = {
    healthy: !noWorkerForQueuedJobs && severity !== "critical",
    lastCheckAt: checkedAt.toISOString(),
    queues: [{
      name: "worker_jobs",
      label: "Canonical worker_jobs backlog",
      length: backlog,
      maxExpected: BACKLOG_WARNING_THRESHOLD,
      status: rowStatus,
      consecutiveGrowth: 0,
    }],
    activeAlerts: alerts,
    history: [...latestStatus.history, {
      timestamp: checkedAt.toISOString(),
      queues: { worker_jobs: backlog, active },
    }].slice(-30),
  };
}

export function startQueueHealthMonitor(): void {
  if (monitorTimer) return;
  void refreshWorkerJobHealth().catch((error) => console.error("[WorkerJobsHealth] Initial refresh failed", error));
  monitorTimer = setInterval(() => {
    void refreshWorkerJobHealth().catch((error) => console.error("[WorkerJobsHealth] Refresh failed", error));
  }, MONITOR_INTERVAL_MS);
}

export function stopQueueHealthMonitor(): void {
  if (monitorTimer) clearInterval(monitorTimer);
  monitorTimer = null;
}

export function getQueueHealthStatus(): QueueHealthStatus {
  return latestStatus;
}
