/**
 * Cloud Tasks Metrics Service
 *
 * Queries Cloud Tasks queue metrics via the Admin API.
 * Used by the admin dashboard to replace BullMQ queue introspection.
 *
 * In development mode (when Cloud Tasks client is unavailable),
 * returns stub metrics.
 */

import { getDb } from "../db";
import { cloudTaskEvents } from "../../drizzle/schema";
import { eq, sql } from "drizzle-orm";

const CLOUD_TASKS_QUEUES = [
  "media-jobs",
  "video-jobs-short",
  "video-jobs-long",
  "workflow-tasks",
  "polling-tasks",
  "periodic-tasks",
] as const;

export interface CloudTasksQueueMetrics {
  queueName: string;
  taskCount: number;
  oldestTaskAge: number | null;
  dispatchRate: number;
}

// Singleton client to avoid creating gRPC channels per call
let _metricsClient: any = null;
async function getMetricsClient() {
  if (!_metricsClient) {
    const { CloudTasksClient } = await import("@google-cloud/tasks");
    _metricsClient = new CloudTasksClient();
  }
  return _metricsClient;
}

/**
 * Get metrics for a single Cloud Tasks queue.
 * Note: taskCount is capped at 100 (API pageSize limit). For accurate counts
 * on high-traffic queues, pagination would be needed.
 */
export async function getQueueMetrics(queueName: string): Promise<CloudTasksQueueMetrics> {
  try {
    const client = await getMetricsClient();
    const projectId = process.env.GCP_PROJECT_ID;
    const region = process.env.GCP_REGION;

    if (!projectId || !region) {
      return { queueName, taskCount: 0, oldestTaskAge: null, dispatchRate: 0 };
    }

    const parent = client.queuePath(projectId, region, queueName);

    // List tasks to get count and oldest age
    const [tasks] = await client.listTasks({ parent, pageSize: 100 });
    const taskCount = tasks.length;

    let oldestTaskAge: number | null = null;
    if (tasks.length > 0 && tasks[0].createTime) {
      const createTime = typeof tasks[0].createTime === "object" && "seconds" in tasks[0].createTime
        ? Number(tasks[0].createTime.seconds) * 1000
        : new Date(tasks[0].createTime as string).getTime();
      oldestTaskAge = Math.floor((Date.now() - createTime) / 1000);
    }

    // Get queue stats for dispatch rate
    const [queue] = await client.getQueue({ name: parent });
    const dispatchRate = queue.rateLimits?.maxDispatchesPerSecond ?? 0;

    return { queueName, taskCount, oldestTaskAge, dispatchRate };
  } catch {
    // Cloud Tasks not available (dev mode) — return zeros
    return { queueName, taskCount: 0, oldestTaskAge: null, dispatchRate: 0 };
  }
}

/**
 * Get metrics for all configured Cloud Tasks queues.
 */
export async function getAllQueueMetrics(): Promise<CloudTasksQueueMetrics[]> {
  const results = await Promise.all(
    CLOUD_TASKS_QUEUES.map((name) => getQueueMetrics(name))
  );
  return results;
}

/**
 * Count dead letter entries from the cloud_task_events table.
 */
export async function getDeadLetterCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(cloudTaskEvents)
    .where(eq(cloudTaskEvents.status, "dead_letter"));

  return result?.count ?? 0;
}

/**
 * Get failed task events from the cloud_task_events table.
 */
export async function getFailedTaskEvents(limit = 20): Promise<any[]> {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(cloudTaskEvents)
    .where(
      sql`${cloudTaskEvents.status} IN ('failed', 'dead_letter')`
    )
    .orderBy(sql`${cloudTaskEvents.createdAt} DESC`)
    .limit(limit);
}
