/**
 * Memory embedding queue.
 *
 * Queues scoped-memory and message-chunk embedding jobs for the async worker.
 */

import { Queue, Worker } from "bullmq";
import type Redis from "ioredis";
import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { messageChunks, scopedMemories } from "../../drizzle/schema";
import { generateQueryEmbedding } from "./queryEmbeddingService";
import { getRealtimeClient } from "./redisClients";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { defaultJobExecutorRegistry } from "./jobExecutorRegistry";
import { publishLegacyBullMqJob } from "./jobLegacyTransportAdapters";

export interface EmbeddingQueueJob {
  type: "scoped_memory" | "message_chunk";
  recordId: string;
  text: string;
}

const QUEUE_NAME = "memory-embedding";
const FEATURE_186_EMBEDDING_JOB_TYPE = "embedding.generate";
const FEATURE_186_CONTRACT_VERSION = "feature-186-v1";

if (!defaultJobExecutorRegistry.has(FEATURE_186_EMBEDDING_JOB_TYPE, FEATURE_186_CONTRACT_VERSION)) {
  defaultJobExecutorRegistry.register({
    jobType: FEATURE_186_EMBEDDING_JOB_TYPE,
    executionClass: "short",
    contractVersions: new Set([FEATURE_186_CONTRACT_VERSION]),
    executor: async ({ context }) => {
      const job = context.input as unknown as EmbeddingQueueJob;
      const embedding = await generateQueryEmbedding(job.text);
      if (!embedding) return { output: { embedded: false } };
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (job.type === "scoped_memory") {
        await db.update(scopedMemories).set({ embedding }).where(eq(scopedMemories.id, job.recordId));
      } else {
        await db.update(messageChunks).set({ embedding }).where(eq(messageChunks.id, job.recordId));
      }
      return { output: { embedded: true, recordId: job.recordId } };
    },
  });
}

let queue: Queue<EmbeddingQueueJob> | null = null;
let worker: Worker<EmbeddingQueueJob> | null = null;

function getEmbeddingQueue(): Queue<EmbeddingQueueJob> {
  if (!queue) {
    const redis: Redis = getRealtimeClient();
    queue = new Queue<EmbeddingQueueJob>(QUEUE_NAME, {
      connection: redis.duplicate(),
      defaultJobOptions: {
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return queue;
}

function getEmbeddingWorker(): Worker<EmbeddingQueueJob> {
  if (!worker) {
    const redis: Redis = getRealtimeClient();
    worker = new Worker<EmbeddingQueueJob>(
      QUEUE_NAME,
      async (job) => {
        const embedding = await generateQueryEmbedding(job.data.text);
        if (!embedding) return;

        const db = await getDb();
        if (!db) return;

        if (job.data.type === "scoped_memory") {
          await db
            .update(scopedMemories)
            .set({ embedding })
            .where(eq(scopedMemories.id, job.data.recordId));
          return;
        }

        await db
          .update(messageChunks)
          .set({ embedding })
          .where(eq(messageChunks.id, job.data.recordId));
      },
      {
        connection: redis.duplicate(),
      },
    );
  }

  return worker;
}

export async function enqueueEmbedding(job: EmbeddingQueueJob): Promise<void> {
  if (process.env.FEATURE_186_HARD_CUTOVER === "true") {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const table = job.type === "scoped_memory" ? scopedMemories : messageChunks;
    const [record] = await db.select({ tenantId: table.tenantId }).from(table).where(eq(table.id, job.recordId)).limit(1);
    if (!record?.tenantId) throw new Error("Embedding record not found");
    await createControlPlaneJob({
      context: {
        tenantId: record.tenantId,
        actorType: "system",
        authorizationScope: "system:embedding",
        correlationId: `embedding:${job.type}:${job.recordId}`,
        idempotencyKey: `embedding:${job.type}:${job.recordId}`,
      },
      definition: {
        contractVersion: FEATURE_186_CONTRACT_VERSION,
        jobType: FEATURE_186_EMBEDDING_JOB_TYPE,
        executionClass: "short",
        input: job as unknown as Record<string, unknown>,
        retryPolicy: {
          maxAttempts: 3,
          baseDelayMs: 5_000,
          maxDelayMs: 60_000,
          jitter: "bounded",
          deadlineMs: 15 * 60_000,
          allowedErrorClasses: ["retryable", "TimeoutError", "AbortError", "ETIMEDOUT"],
        },
        timeoutPolicy: { softTimeoutMs: 30_000, hardTimeoutMs: 120_000 },
      },
    });
    return;
  }
  const embeddingQueue = getEmbeddingQueue();
  getEmbeddingWorker();
  await publishLegacyBullMqJob(embeddingQueue, "embed", job, {
    jobId: `${job.type}:${job.recordId}`,
  });
}

export async function closeEmbeddingQueue(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
  }
  if (queue) {
    await queue.close();
    queue = null;
  }
}
