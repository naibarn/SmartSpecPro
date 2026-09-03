import { and, inArray } from "drizzle-orm";

import { workerJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  requeueStalledWorkerJobs,
  WORKER_STALL_WATCHDOG_JOB_TYPES,
} from "../services/workerStallWatchdogService";

const WATCHDOG_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVE_WORKER_JOB_STATUSES = [
  "claimed",
  "preparing",
  "running",
  "uploading",
] as const;
let intervalId: ReturnType<typeof setInterval> | null = null;

export async function runWorkerStallWatchdogOnce(now = new Date()) {
  const db = await getDb();
  const tenants = await db
    .selectDistinct({ tenantId: workerJobs.tenantId })
    .from(workerJobs)
    .where(and(
      inArray(workerJobs.jobType, WORKER_STALL_WATCHDOG_JOB_TYPES),
      inArray(workerJobs.status, ACTIVE_WORKER_JOB_STATUSES),
    ))
    .limit(100);

  const summary = {
    tenants: tenants.length,
    inspected: 0,
    requeued: 0,
    failed: 0,
    skipped: 0,
    jobIds: [] as string[],
  };

  for (const row of tenants) {
    const result = await requeueStalledWorkerJobs({
      tenantId: row.tenantId,
      now,
      limit: 100,
    });
    summary.inspected += result.inspected;
    summary.requeued += result.requeued;
    summary.failed += result.failed;
    summary.skipped += result.skipped;
    summary.jobIds.push(...result.jobIds);
  }

  if (summary.requeued > 0 || summary.failed > 0) {
    console.warn("[WorkerStallWatchdog] recovered stalled worker jobs", summary);
  }

  return summary;
}

export async function initializeWorkerStallWatchdogJob() {
  if (intervalId) {
    return;
  }

  await runWorkerStallWatchdogOnce().catch((error) => {
    console.error("[WorkerStallWatchdog] initial run failed:", error);
  });

  intervalId = setInterval(() => {
    runWorkerStallWatchdogOnce().catch((error) => {
      console.error("[WorkerStallWatchdog] periodic run failed:", error);
    });
  }, WATCHDOG_INTERVAL_MS);
}

export function shutdownWorkerStallWatchdogJob() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
