/**
 * Memory embedding queue.
 *
 * Queues scoped-memory and message-chunk embedding jobs for the async worker.
 */

import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { messageChunks, scopedMemories } from "../../drizzle/schema";
import { generateQueryEmbedding } from "./queryEmbeddingService";
import { createControlPlaneJob } from "./jobControlPlaneGateway";
import { defaultJobExecutorRegistry } from "./jobExecutorRegistry";

export interface EmbeddingQueueJob {
  type: "scoped_memory" | "message_chunk";
  recordId: string;
  text: string;
}

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

export async function enqueueEmbedding(job: EmbeddingQueueJob): Promise<void> {
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
}

export async function closeEmbeddingQueue(): Promise<void> {
  // Worker lifecycle is managed by the canonical worker_jobs runtime.
}
