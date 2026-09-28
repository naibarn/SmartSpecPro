import { and, desc, eq, inArray } from "drizzle-orm";
import { workerJobs } from "../../drizzle/schema";
import { getDb } from "../db";

export const CANONICAL_PROMPT_JOB_ACTIVE_STATUSES = [
  "pending",
  "queued",
  "leased",
  "claimed",
  "preparing",
  "running",
  "waiting_external",
  "retry_scheduled",
  "uploading",
  "publishing",
  "indexing",
] as const;

export type CanonicalPromptJobSnapshot = {
  jobId: string;
  jobType: string;
  status: "queued" | "running" | "succeeded" | "failed";
  canonicalStatus: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

type CanonicalWorkerRow = typeof workerJobs.$inferSelect;

function localStatus(status: string): CanonicalPromptJobSnapshot["status"] {
  if (status === "succeeded") return "succeeded";
  if (["failed", "cancelled", "canceled", "expired"].includes(status)) {
    return "failed";
  }
  if (status === "queued" || status === "pending" || status === "retry_scheduled") {
    return "queued";
  }
  return "running";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rowSnapshot(row: CanonicalWorkerRow): CanonicalPromptJobSnapshot {
  const updatedAt = row.finishedAt ?? row.heartbeatAt ?? row.startedAt ?? row.createdAt;
  return {
    jobId: row.id,
    jobType: row.jobType,
    status: localStatus(row.status),
    canonicalStatus: row.status,
    input: asRecord(row.inputJson),
    output: row.outputJson ? asRecord(row.outputJson) : null,
    error: row.errorMessage ?? row.failureReason ?? row.statusReason ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function ownerWhere(input: {
  tenantId: string;
  userId: number;
  jobType: string;
}) {
  return and(
    eq(workerJobs.tenantId, input.tenantId),
    eq(workerJobs.requestedByUserId, input.userId),
    eq(workerJobs.jobType, input.jobType),
  );
}

export async function readCanonicalPromptJob(input: {
  jobId: string;
  tenantId: string;
  userId: number;
  jobType: string;
}): Promise<CanonicalPromptJobSnapshot | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(workerJobs)
    .where(and(eq(workerJobs.id, input.jobId), ownerWhere(input)))
    .limit(1);
  return rows[0] ? rowSnapshot(rows[0]) : null;
}

export async function findCanonicalPromptJobByIdempotencyKey(input: {
  tenantId: string;
  userId: number;
  jobType: string;
  idempotencyKey: string;
}): Promise<CanonicalPromptJobSnapshot | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(workerJobs)
    .where(
      and(
        ownerWhere(input),
        eq(workerJobs.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  return rows[0] ? rowSnapshot(rows[0]) : null;
}

export async function listCanonicalPromptJobs(input: {
  tenantId: string;
  userId: number;
  jobType: string;
  activeOnly?: boolean;
}): Promise<CanonicalPromptJobSnapshot[]> {
  const db = await getDb();
  const filters = [ownerWhere(input)];
  if (input.activeOnly) {
    filters.push(inArray(workerJobs.status, [...CANONICAL_PROMPT_JOB_ACTIVE_STATUSES]));
  }
  const rows = await db
    .select()
    .from(workerJobs)
    .where(and(...filters))
    .orderBy(desc(workerJobs.createdAt));
  return rows.map(rowSnapshot);
}
