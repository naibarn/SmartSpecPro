import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";

import type { DrizzleDB } from "../db";
import { getDb } from "../db";
import { enqueueTask } from "./cloudTasks";
import { refreshLibraryKnowledgeItem } from "./libraryKnowledgeBackfillService";
import { libraryIndexJobs } from "../../drizzle/schema";

const DEFAULT_LIBRARY_KNOWLEDGE_REFRESH_LIMIT = 25;
const MAX_LIBRARY_KNOWLEDGE_REFRESH_LIMIT = 200;
const KNOWLEDGE_REFRESH_RETRY_BASE_MS = 30_000;
const KNOWLEDGE_REFRESH_RETRY_CAP_MS = 15 * 60 * 1000;

function useCloudTasks(): boolean {
  return process.env.USE_CLOUD_TASKS === "true";
}

export type LibraryKnowledgeRefreshExecutionStatus =
  | "pending"
  | "processing"
  | "retry_pending"
  | "completed"
  | "failed"
  | "skipped";

export interface LibraryKnowledgeRefreshWorkerJob {
  id: number;
  tenantId: string;
  libraryItemId: number;
  jobStatus: string;
  maxAttempts: number;
  payloadJson: Record<string, unknown>;
  source: string | null;
  sourceMetadataJson: Record<string, unknown>;
  knowledgeRefreshReason: string | null;
  knowledgeRefreshStatus: LibraryKnowledgeRefreshExecutionStatus | null;
  knowledgeRefreshAttemptCount: number;
  knowledgeRefreshRequestedAt: Date | null;
}

export interface LibraryKnowledgeRefreshWorkerResult {
  processed: number;
  completed: number;
  failed: number;
  skipped: number;
  jobIds: number[];
}

export interface LibraryKnowledgeRefreshWorkerFilter {
  jobIds?: number[];
  libraryItemId?: number;
  tenantId?: string | null;
}

export interface LibraryKnowledgeRefreshWorkerRepository {
  listDueJobs(
    limit: number,
    now: Date,
    filter?: LibraryKnowledgeRefreshWorkerFilter,
  ): Promise<LibraryKnowledgeRefreshWorkerJob[]>;
  claimJobProcessing(jobId: number, now: Date): Promise<boolean>;
  markJobCompleted(jobId: number, now: Date): Promise<void>;
  markJobSkipped(jobId: number, now: Date, skippedReason: string): Promise<void>;
  markJobFailed(
    jobId: number,
    now: Date,
    errorMessage: string,
    shouldRetry: boolean,
    nextRetryAt?: Date | null,
  ): Promise<void>;
}

export interface RunLibraryKnowledgeRefreshWorkerInput extends LibraryKnowledgeRefreshWorkerFilter {
  db?: DrizzleDB | null;
  limit?: number;
  now?: Date;
}

export interface DispatchLibraryKnowledgeRefreshWorkerInput extends LibraryKnowledgeRefreshWorkerFilter {
  delaySeconds?: number;
  limit?: number;
}

export interface DispatchLibraryKnowledgeRefreshWorkerResult {
  mode: "cloud_tasks" | "inline" | "unavailable";
  taskName?: string | null;
  result?: LibraryKnowledgeRefreshWorkerResult;
}

function normalizeWorkerLimit(limit?: number): number {
  return Math.min(Math.max(limit ?? DEFAULT_LIBRARY_KNOWLEDGE_REFRESH_LIMIT, 1), MAX_LIBRARY_KNOWLEDGE_REFRESH_LIMIT);
}

function normalizeWorkerFilter(
  filter?: LibraryKnowledgeRefreshWorkerFilter,
): LibraryKnowledgeRefreshWorkerFilter | undefined {
  if (!filter) return undefined;

  const jobIds = Array.isArray(filter.jobIds)
    ? Array.from(new Set(filter.jobIds.filter((jobId) => Number.isInteger(jobId) && jobId > 0)))
    : undefined;
  const libraryItemId = Number.isInteger(filter.libraryItemId) && Number(filter.libraryItemId) > 0
    ? Number(filter.libraryItemId)
    : undefined;
  const tenantId = typeof filter.tenantId === "string" && filter.tenantId.trim().length > 0
    ? filter.tenantId.trim()
    : undefined;

  if ((!jobIds || jobIds.length === 0) && !libraryItemId && !tenantId) {
    return undefined;
  }

  return {
    ...(jobIds && jobIds.length > 0 ? { jobIds } : {}),
    ...(libraryItemId ? { libraryItemId } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
}

function buildRetryAt(now: Date, nextAttempt: number): Date {
  const exponent = Math.max(0, nextAttempt - 1);
  const delayMs = Math.min(
    KNOWLEDGE_REFRESH_RETRY_CAP_MS,
    KNOWLEDGE_REFRESH_RETRY_BASE_MS * (2 ** exponent),
  );
  return new Date(now.getTime() + delayMs);
}

export function createLibraryKnowledgeRefreshWorkerRepository(
  db: DrizzleDB,
): LibraryKnowledgeRefreshWorkerRepository {
  return {
    listDueJobs: async (limit, now, filter) => {
      const normalizedFilter = normalizeWorkerFilter(filter);
      if (normalizedFilter?.jobIds && normalizedFilter.jobIds.length === 0) {
        return [];
      }

      const where = [
        isNotNull(libraryIndexJobs.knowledgeRefreshRequestedAt),
        lte(libraryIndexJobs.knowledgeRefreshRequestedAt, now),
        inArray(libraryIndexJobs.knowledgeRefreshStatus, ["pending", "retry_pending"]),
      ];

      if (normalizedFilter?.tenantId) {
        where.push(eq(libraryIndexJobs.tenantId, normalizedFilter.tenantId));
      }
      if (normalizedFilter?.libraryItemId) {
        where.push(eq(libraryIndexJobs.libraryItemId, normalizedFilter.libraryItemId));
      }
      if (normalizedFilter?.jobIds?.length) {
        where.push(inArray(libraryIndexJobs.id, normalizedFilter.jobIds));
      }

      const rows = await db
        .select({
          id: libraryIndexJobs.id,
          tenantId: libraryIndexJobs.tenantId,
          libraryItemId: libraryIndexJobs.libraryItemId,
          jobStatus: libraryIndexJobs.status,
          maxAttempts: libraryIndexJobs.maxAttempts,
          payloadJson: libraryIndexJobs.payloadJson,
          source: libraryIndexJobs.source,
          sourceMetadataJson: libraryIndexJobs.sourceMetadataJson,
          knowledgeRefreshReason: libraryIndexJobs.knowledgeRefreshReason,
          knowledgeRefreshStatus: libraryIndexJobs.knowledgeRefreshStatus,
          knowledgeRefreshAttemptCount: libraryIndexJobs.knowledgeRefreshAttemptCount,
          knowledgeRefreshRequestedAt: libraryIndexJobs.knowledgeRefreshRequestedAt,
        })
        .from(libraryIndexJobs)
        .where(and(...where))
        .orderBy(asc(libraryIndexJobs.knowledgeRefreshRequestedAt), asc(libraryIndexJobs.id))
        .limit(limit);

      return rows.map((row) => ({
        ...row,
        payloadJson: row.payloadJson ?? {},
        source: row.source ?? null,
        sourceMetadataJson: row.sourceMetadataJson ?? {},
        knowledgeRefreshStatus:
          (row.knowledgeRefreshStatus as LibraryKnowledgeRefreshExecutionStatus | null) ?? null,
        knowledgeRefreshAttemptCount: row.knowledgeRefreshAttemptCount ?? 0,
      }));
    },
    claimJobProcessing: async (jobId, now) => {
      const claimed = await db
        .update(libraryIndexJobs)
        .set({
          knowledgeRefreshStatus: "processing",
          knowledgeRefreshCompletedAt: null,
          knowledgeRefreshError: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(libraryIndexJobs.id, jobId),
            inArray(libraryIndexJobs.knowledgeRefreshStatus, ["pending", "retry_pending"]),
          ),
        )
        .returning({ id: libraryIndexJobs.id });

      return Boolean(claimed[0]?.id);
    },
    markJobCompleted: async (jobId, now) => {
      await db
        .update(libraryIndexJobs)
        .set({
          knowledgeRefreshStatus: "completed",
          knowledgeRefreshCompletedAt: now,
          knowledgeRefreshError: null,
          updatedAt: now,
        })
        .where(eq(libraryIndexJobs.id, jobId));
    },
    markJobSkipped: async (jobId, now, skippedReason) => {
      await db
        .update(libraryIndexJobs)
        .set({
          knowledgeRefreshStatus: "skipped",
          knowledgeRefreshCompletedAt: now,
          knowledgeRefreshError: skippedReason,
          updatedAt: now,
        })
        .where(eq(libraryIndexJobs.id, jobId));
    },
    markJobFailed: async (jobId, now, errorMessage, shouldRetry, nextRetryAt) => {
      await db
        .update(libraryIndexJobs)
        .set({
          knowledgeRefreshStatus: shouldRetry ? "retry_pending" : "failed",
          knowledgeRefreshAttemptCount: sql`${libraryIndexJobs.knowledgeRefreshAttemptCount} + 1`,
          knowledgeRefreshRequestedAt: shouldRetry ? (nextRetryAt ?? now) : now,
          knowledgeRefreshCompletedAt: shouldRetry ? null : now,
          knowledgeRefreshError: errorMessage,
          updatedAt: now,
        })
        .where(eq(libraryIndexJobs.id, jobId));
    },
  };
}

export async function processLibraryKnowledgeRefreshJobs(
  repo: LibraryKnowledgeRefreshWorkerRepository,
  input?: Omit<RunLibraryKnowledgeRefreshWorkerInput, "db">,
): Promise<LibraryKnowledgeRefreshWorkerResult> {
  const now = input?.now ?? new Date();
  const limit = normalizeWorkerLimit(input?.limit);
  const filter = normalizeWorkerFilter(input);
  const jobs = await repo.listDueJobs(limit, now, filter);

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  const jobIds: number[] = [];

  for (const job of jobs) {
    const claimed = await repo.claimJobProcessing(job.id, now);
    if (!claimed) {
      continue;
    }

    try {
      const result = await refreshLibraryKnowledgeItem({
        tenantId: job.tenantId,
        libraryItemId: job.libraryItemId,
      });

      jobIds.push(job.id);
      if (result.skippedReason) {
        skipped += 1;
        await repo.markJobSkipped(job.id, now, result.skippedReason);
        continue;
      }

      completed += 1;
      await repo.markJobCompleted(job.id, now);
    } catch (error) {
      failed += 1;
      jobIds.push(job.id);
      const nextAttempt = (job.knowledgeRefreshAttemptCount ?? 0) + 1;
      const shouldRetry = nextAttempt < Math.max(job.maxAttempts, 1);
      const nextRetryAt = shouldRetry ? buildRetryAt(now, nextAttempt) : null;
      await repo.markJobFailed(
        job.id,
        now,
        error instanceof Error ? error.message : String(error),
        shouldRetry,
        nextRetryAt,
      );
    }
  }

  return {
    processed: jobIds.length,
    completed,
    failed,
    skipped,
    jobIds,
  };
}

export async function runLibraryKnowledgeRefreshWorker(
  input?: RunLibraryKnowledgeRefreshWorkerInput,
): Promise<LibraryKnowledgeRefreshWorkerResult> {
  const db = input?.db ?? await getDb();
  if (!db) {
    return {
      processed: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
      jobIds: [],
    };
  }

  const repo = createLibraryKnowledgeRefreshWorkerRepository(db);
  return processLibraryKnowledgeRefreshJobs(repo, input);
}

export async function dispatchLibraryKnowledgeRefreshWorker(
  input?: DispatchLibraryKnowledgeRefreshWorkerInput,
): Promise<DispatchLibraryKnowledgeRefreshWorkerResult> {
  const normalizedFilter = normalizeWorkerFilter(input);
  const limit = input?.limit ? normalizeWorkerLimit(input.limit) : undefined;
  const payload: Record<string, unknown> = {};

  if (limit !== undefined) {
    payload.limit = limit;
  }
  if (normalizedFilter?.jobIds?.length === 1) {
    payload.jobId = normalizedFilter.jobIds[0];
  }
  if (normalizedFilter?.libraryItemId) {
    payload.libraryItemId = normalizedFilter.libraryItemId;
  }
  if (normalizedFilter?.tenantId) {
    payload.tenantId = normalizedFilter.tenantId;
  }

  if (useCloudTasks()) {
    const taskName = await enqueueTask({
      queueName: "periodic-tasks",
      handlerPath: "/_internal/tasks/library-knowledge-refresh",
      payload,
      delaySeconds: input?.delaySeconds,
      targetService: "node",
    });

    return {
      mode: "cloud_tasks",
      taskName,
    };
  }

  return {
    mode: "inline",
    result: await runLibraryKnowledgeRefreshWorker({
      limit,
      ...(normalizedFilter?.jobIds?.length ? { jobIds: normalizedFilter.jobIds } : {}),
      ...(normalizedFilter?.libraryItemId ? { libraryItemId: normalizedFilter.libraryItemId } : {}),
      ...(normalizedFilter?.tenantId ? { tenantId: normalizedFilter.tenantId } : {}),
    }),
  };
}
