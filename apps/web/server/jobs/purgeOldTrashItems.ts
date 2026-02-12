/**
 * Trash Auto-Purge Background Job
 *
 * Permanently deletes library items that have been in trash for 90+ days.
 * Runs daily at 2 AM via BullMQ cron schedule.
 *
 * Deletion cascade uses shared cascadeDeleteLibraryItem() helper.
 * Storage and vector DB cleanup are not yet implemented (storageDelete does not exist).
 */

import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { and, isNotNull, lt } from "drizzle-orm";

import { getDb } from "../db";
import { libraryItems } from "../../drizzle/schema";
import { auditLogger } from "../services/auditLogger";
import { cascadeDeleteLibraryItem } from "../services/libraryService";

const QUEUE_NAME = "trash-auto-purge";
const TRASH_RETENTION_DAYS = 90;
const MS_PER_DAY = 86_400_000;
const BATCH_SIZE = 100;

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
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return queue;
}

/**
 * Execute the trash purge job. Finds all items older than TRASH_RETENTION_DAYS
 * in the trash and permanently deletes them in batches.
 */
export async function executeTrashPurge(): Promise<{ purgedCount: number; totalFound: number; errors: number }> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available for trash purge");
  }

  const cutoffDate = new Date(Date.now() - TRASH_RETENTION_DAYS * MS_PER_DAY);

  let totalFound = 0;
  let purgedCount = 0;
  let errors = 0;

  // Process in batches to avoid unbounded memory consumption
  let hasMore = true;
  while (hasMore) {
    const batch = await db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(
        and(
          isNotNull(libraryItems.deletedAt),
          lt(libraryItems.deletedAt, cutoffDate),
        ),
      )
      .limit(BATCH_SIZE);

    totalFound += batch.length;
    hasMore = batch.length === BATCH_SIZE;

    for (const item of batch) {
      try {
        await db.transaction(async (tx) => {
          await cascadeDeleteLibraryItem(tx, item.id);
        });
        purgedCount++;
      } catch (error) {
        errors++;
        console.error(`[trash-purge] Failed to purge item ${item.id}:`, error instanceof Error ? error.message : error);
      }
    }
  }

  return { purgedCount, totalFound, errors };
}

/**
 * Schedule the daily trash purge job at 2 AM.
 * Safe to call multiple times — upsertJobScheduler is idempotent.
 */
export async function initializeTrashPurgeJob(): Promise<void> {
  const q = getQueue();

  await q.upsertJobScheduler(
    "trash-auto-purge-daily",
    { pattern: "0 2 * * *" },
    {
      name: "purge-old-trash",
      data: {},
    },
  );

  // Create worker
  worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const startTime = Date.now();
      console.log(`[trash-purge] Starting job ${job.id}`);

      const result = await executeTrashPurge();

      const executionTimeMs = Date.now() - startTime;
      console.log(`[trash-purge] Completed: ${result.purgedCount}/${result.totalFound} purged, ${result.errors} errors (${executionTimeMs}ms)`);

      auditLogger.log({
        eventType: "library_mutation",
        userId: null,
        endpoint: "jobs.purgeOldTrashItems",
        requestType: "job",
        requestPayload: {
          cutoffDays: TRASH_RETENTION_DAYS,
        },
        responsePayload: {
          ...result,
          executionTimeMs,
        },
      });

      return result;
    },
    {
      connection: getRedisConnection(),
      concurrency: 1,
    },
  );

  worker.on("failed", (job, err) => {
    console.error(`[trash-purge] Job ${job?.id} failed:`, err.message);
  });

  console.log("[trash-purge] Trash auto-purge job scheduled (daily at 2 AM)");
}

/**
 * Gracefully shut down the worker and close connections.
 */
export async function shutdownTrashPurgeWorker(): Promise<void> {
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
