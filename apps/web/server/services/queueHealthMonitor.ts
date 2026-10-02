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
    db.select({ runtimeType: workerJobs.runtimeType, status: workerJobs.status, count: sql<number>`count(*)::int` })
      .from(workerJobs).where(
      inArray(workerJobs.status, ["queued", "retry_scheduled", "leased", "running", "waiting_external"]),
    ).groupBy(workerJobs.runtimeType, workerJobs.status),
    db.select({ runtimeType: workerHeartbeats.runtimeType, count: sql<number>`count(distinct ${workerHeartbeats.workerId})::int` })
      .from(workerHeartbeats).where(and(
      gt(workerHeartbeats.createdAt, new Date(Date.now() - LIVE_HEARTBEAT_WINDOW_MS)),
      inArray(workerHeartbeats.runtimeType, ["node_job_worker", "python_job_worker"]),
      eq(workerHeartbeats.status, "online"),
    )).groupBy(workerHeartbeats.runtimeType),
  ]);

  const countsByRuntime = new Map<string, Map<string, number>>();
  for (const job of jobs) {
    const counts = countsByRuntime.get(job.runtimeType) ?? new Map<string, number>();
    counts.set(job.status, Number(job.count));
    countsByRuntime.set(job.runtimeType, counts);
  }
  const workersByRuntime = new Map<string, number>();
  for (const worker of workerSummary) workersByRuntime.set(worker.runtimeType, Number(worker.count));
  const backlogByRuntime = new Map<string, number>();
  for (const [runtimeType, counts] of countsByRuntime) {
    backlogByRuntime.set(runtimeType, (counts.get("queued") ?? 0) + (counts.get("retry_scheduled") ?? 0));
  }
  const backlog = [...backlogByRuntime.values()].reduce((sum, count) => sum + count, 0);
  const active = [...countsByRuntime.values()].reduce((sum, counts) =>
    sum + (counts.get("leased") ?? 0) + (counts.get("running") ?? 0) + (counts.get("waiting_external") ?? 0), 0);
  const pythonBacklog = backlogByRuntime.get("python_job_worker") ?? 0;
  const pythonWorkerCount = workersByRuntime.get("python_job_worker") ?? 0;
  const totalWorkerCount = [...workersByRuntime.values()].reduce((sum, count) => sum + count, 0);
  const pythonConsumerMissing = pythonBacklog > 0 && pythonWorkerCount === 0;
  const noWorkerForQueuedJobs = pythonConsumerMissing || (backlog > 0 && totalWorkerCount === 0);
  const severity = noWorkerForQueuedJobs || backlog >= BACKLOG_CRITICAL_THRESHOLD ? "critical"
    : backlog >= BACKLOG_WARNING_THRESHOLD ? "warning" : null;
  const alerts: QueueHealthStatus["activeAlerts"] = pythonConsumerMissing
    ? [{
      queue: "worker_jobs:python_job_worker",
      label: "Canonical Python worker backlog",
      severity: "critical" as const,
      type: "dead_consumer" as const,
      message: `worker_jobs has ${pythonBacklog} queued Python jobs and no live Python worker heartbeat`,
      currentLength: pythonBacklog,
      previousLength: null,
      threshold: 1,
    }]
    : severity ? [{
    queue: "worker_jobs",
    label: "Canonical worker_jobs backlog",
    severity,
    type: noWorkerForQueuedJobs ? "dead_consumer" : "backlog",
    message: `worker_jobs has ${backlog} queued or retry-scheduled jobs`,
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
