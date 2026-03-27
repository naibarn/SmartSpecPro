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

export interface EmbeddingQueueJob {
  type: "scoped_memory" | "message_chunk";
  recordId: string;
  text: string;
}

const QUEUE_NAME = "memory-embedding";

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
  const embeddingQueue = getEmbeddingQueue();
  getEmbeddingWorker();
  await embeddingQueue.add("embed", job, {
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
