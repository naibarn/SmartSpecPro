/**
 * Compatibility-shaped queue metrics backed by the canonical PostgreSQL job
 * ledger. The old Google queue inspection API is intentionally gone.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { workerJobOutbox, workerJobs } from "../../drizzle/schema";

export interface CloudTasksQueueMetrics {
  queueName: string;
  taskCount: number;
  oldestTaskAge: number | null;
  dispatchRate: number;
}

export async function getQueueMetrics(queueName = "cloudflare-canonical"): Promise<CloudTasksQueueMetrics> {
  const db = await getDb();
  if (!db) return { queueName, taskCount: 0, oldestTaskAge: null, dispatchRate: 0 };

  const [row] = await db
    .select({
      taskCount: sql<number>`count(*)::int`,
      oldestCreatedAt: sql<Date | null>`min(${workerJobs.createdAt})`,
    })
    .from(workerJobs)
    .innerJoin(workerJobOutbox, eq(workerJobOutbox.workerJobId, workerJobs.id))
    .where(and(
      eq(workerJobs.status, "queued"),
      isNull(workerJobOutbox.publishedAt),
      isNull(workerJobOutbox.cancelledAt),
      isNull(workerJobOutbox.quarantinedAt),
    ));

  const oldestTaskAge = row?.oldestCreatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(row.oldestCreatedAt).getTime()) / 1000))
    : null;
  return {
    queueName: "cloudflare-canonical",
    taskCount: row?.taskCount ?? 0,
    oldestTaskAge,
    dispatchRate: 0,
  };
}

export async function getAllQueueMetrics(): Promise<CloudTasksQueueMetrics[]> {
  return [await getQueueMetrics()];
}

/** Historical dead-letter rows are not a live runtime queue. */
export async function getDeadLetterCount(): Promise<number> {
  return 0;
}

export async function getFailedTaskEvents(_limit = 20): Promise<never[]> {
  return [];
}
