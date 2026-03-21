/**
 * Notification Retention Job
 *
 * Daily BullMQ job (03:00 UTC) that cleans up old notifications
 * based on expiration, age-by-priority, and per-user row caps.
 */

import { Queue, Worker } from "bullmq";
import { sql, eq, and, lt, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { userNotifications } from "../../drizzle/schema";

// ─── Constants ───

export const RETENTION_AGE_DAYS: Record<string, number> = {
  critical: 365,
  high: 180,
  normal: 90,
  low: 30,
};

export const RETENTION_ROW_CAPS: Record<string, number | null> = {
  critical: null,
  high: 1000,
  normal: 500,
  low: 200,
};

const QUEUE_NAME = "notification-retention";

// ─── Types ───

export interface RetentionResult {
  expiredDeleted: number;
  ageDeleted: Record<string, number>;
  capDeleted: Record<string, number>;
  durationMs: number;
  errors: string[];
}

// ─── Core Logic ───

/**
 * Execute all retention cleanup strategies.
 * Each step runs independently; failure in one does not prevent others.
 */
export async function executeRetentionCleanup(): Promise<RetentionResult> {
  const startMs = Date.now();
  const db = getDb();
  const errors: string[] = [];

  let expiredDeleted = 0;
  const ageDeleted: Record<string, number> = {
    critical: 0,
    high: 0,
    normal: 0,
    low: 0,
  };
  const capDeleted: Record<string, number> = {
    high: 0,
    normal: 0,
    low: 0,
  };

  // 1. Delete expired notifications
  try {
    const result = await db
      .delete(userNotifications)
      .where(
        and(
          isNotNull(userNotifications.expiresAt),
          lt(userNotifications.expiresAt, new Date())
        )
      )
      .returning({ id: userNotifications.id });

    expiredDeleted = result.length;
  } catch (err) {
    const msg = `expired cleanup failed: ${err instanceof Error ? err.message : err}`;
    errors.push(msg);
    console.error("[RetentionJob]", msg);
  }

  // 2. Age-based cleanup by priority
  for (const [priority, maxDays] of Object.entries(RETENTION_AGE_DAYS)) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - maxDays);

      const result = await db
        .delete(userNotifications)
        .where(
          and(
            eq(userNotifications.priority, priority as any),
            lt(userNotifications.createdAt, cutoff)
          )
        )
        .returning({ id: userNotifications.id });

      ageDeleted[priority] = result.length;
    } catch (err) {
      const msg = `age cleanup for ${priority} failed: ${err instanceof Error ? err.message : err}`;
      errors.push(msg);
      console.error("[RetentionJob]", msg);
    }
  }

  // 3. Per-user row cap by priority
  for (const [priority, cap] of Object.entries(RETENTION_ROW_CAPS)) {
    if (cap === null) continue; // unlimited

    try {
      // Find users who exceed the cap for this priority
      const overflowUsers = await db.execute(sql`
        SELECT "userId", COUNT(*) as cnt
        FROM user_notifications
        WHERE priority = ${priority}
        GROUP BY "userId"
        HAVING COUNT(*) > ${cap}
      `);

      let deleted = 0;
      for (const row of overflowUsers as any[]) {
        const userId = (row as any).userId;
        const result = await db.execute(sql`
          DELETE FROM user_notifications WHERE id IN (
            SELECT id FROM user_notifications
            WHERE "userId" = ${userId} AND priority = ${priority}
            ORDER BY "createdAt" DESC OFFSET ${cap}
          )
        `);
        deleted += (result as any).rowCount ?? 0;
      }

      capDeleted[priority] = deleted;
    } catch (err) {
      const msg = `cap cleanup for ${priority} failed: ${err instanceof Error ? err.message : err}`;
      errors.push(msg);
      console.error("[RetentionJob]", msg);
    }
  }

  const durationMs = Date.now() - startMs;

  console.log("[RetentionJob] notification_retention_complete", {
    expiredDeleted,
    ageDeleted,
    capDeleted,
    durationMs,
    errors: errors.length > 0 ? errors : undefined,
  });

  return { expiredDeleted, ageDeleted, capDeleted, durationMs, errors };
}

// ─── BullMQ Registration ───

let retentionQueue: Queue | null = null;
let retentionWorker: Worker | null = null;

export async function initializeRetentionJob(): Promise<void> {
  if (retentionQueue) return;

  const { getRealtimeClient } = await import("../services/redisClients");
  const redis = getRealtimeClient();

  retentionQueue = new Queue(QUEUE_NAME, {
    connection: redis.duplicate(),
    defaultJobOptions: {
      removeOnComplete: { count: 7 },
      removeOnFail: { count: 14 },
    },
  });

  // Register daily job at 03:00 UTC
  await retentionQueue.upsertJobScheduler(
    "retention-cleanup",
    { pattern: "0 3 * * *" },
    { name: "retention-cleanup" }
  );

  retentionWorker = new Worker(
    QUEUE_NAME,
    async () => {
      await executeRetentionCleanup();
    },
    {
      connection: redis.duplicate(),
      concurrency: 1,
    }
  );

  retentionWorker.on("failed", (job, err) => {
    console.error("[RetentionJob] worker_job_failed", {
      jobId: job?.id,
      error: err.message,
      attemptsMade: job?.attemptsMade,
    });
  });
}

export async function shutdownRetentionJob(): Promise<void> {
  if (retentionWorker) {
    await retentionWorker.close();
    retentionWorker = null;
  }
  if (retentionQueue) {
    await retentionQueue.close();
    retentionQueue = null;
  }
}
