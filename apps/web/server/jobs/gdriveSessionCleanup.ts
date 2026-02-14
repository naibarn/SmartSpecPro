/**
 * Google Drive Edit Session Cleanup Job
 *
 * Marks expired edit sessions as "discarded" to prevent stale locks.
 * Runs every 6 hours via BullMQ cron schedule.
 *
 * Sessions that have been expired for 7+ days are cleaned up.
 * Uses "discarded" status (existing enum value) to avoid DB migration.
 */

import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { and, eq, lt } from "drizzle-orm";

import { getDb } from "../db";
import { googleDriveEditSessions } from "../../drizzle/schema";

const QUEUE_NAME = "gdrive-session-cleanup";
const EXPIRED_BUFFER_DAYS = 7;
const MS_PER_DAY = 86_400_000;

let connection: IORedis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;

function getRedisConnection(): IORedis {
  if (!connection) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    connection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return connection;
}

function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 20 },
      },
    });
  }
  return queue;
}

export async function initializeGDriveCleanupJob(): Promise<void> {
  const q = getQueue();

  await q.upsertJobScheduler(
    "gdrive-session-cleanup-6h",
    { pattern: "0 */6 * * *" },
    {
      name: "cleanup-expired-sessions",
      data: {},
    },
  );

  worker = new Worker(
    QUEUE_NAME,
    async (_job: Job) => {
      const db = await getDb();
      if (!db) {
        console.warn("[GDrive Cleanup] DB not available, skipping");
        return;
      }

      const cutoff = new Date(Date.now() - EXPIRED_BUFFER_DAYS * MS_PER_DAY);

      const expired = await db
        .update(googleDriveEditSessions)
        .set({ status: "discarded", updatedAt: new Date() })
        .where(
          and(
            eq(googleDriveEditSessions.status, "active"),
            lt(googleDriveEditSessions.expiresAt, cutoff),
          ),
        )
        .returning({ id: googleDriveEditSessions.id });

      if (expired.length > 0) {
        console.log(
          `[GDrive Cleanup] Marked ${expired.length} expired sessions as discarded`,
        );
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(
      `[GDrive Cleanup] Job ${job?.id} failed:`,
      err.message,
    );
  });

  console.log("[GDrive Cleanup] Session cleanup job initialized (every 6h)");
}

export async function shutdownGDriveCleanupWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
  if (connection) {
    connection.disconnect();
    connection = null;
  }
}
