import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "../db";
import { workerJobEvents, workerJobs } from "../../drizzle/schema";
import type { WorkerJobStatus } from "../../shared/workerRuntime";
import { auditLogger } from "./auditLogger";
import { isPlainObject, sanitizeWorkerPayload } from "./workerPayloadSanitizer";

export const WORKER_USER_REASSIGN_THRESHOLD_MS = 15 * 60 * 1000;
export const WORKER_HARD_STALL_THRESHOLD_MS = 30 * 60 * 1000;
export const WORKER_REASSIGN_GRACE_MS = 90 * 1000;
export const WORKER_MAX_AUTOMATIC_ATTEMPTS = 3;

const REASSIGNABLE_STATUSES: WorkerJobStatus[] = [
  "claimed",
  "preparing",
  "running",
  "uploading",
];

type WorkerJobRecord = Record<string, any>;
type ReassignActor = "user" | "admin" | "watchdog";

export interface WorkerReassignAuth {
  tenantId: string;
  userId: number;
  isAdmin?: boolean;
}

export interface WorkerStallWatchdogRepository {
  getJobById(tenantId: string, jobId: string): Promise<WorkerJobRecord | null>;
  listWatchdogCandidates(input: {
    tenantId: string;
    now: Date;
    limit: number;
  }): Promise<WorkerJobRecord[]>;
  updateJob(jobId: string, values: Record<string, any>): Promise<WorkerJobRecord>;
  insertJobEvent(workerJobId: string, eventType: string, payloadJson: Record<string, unknown>): Promise<Record<string, any>>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function readIsoMs(value: unknown): number | null {
  if (typeof value !== "string" && !(value instanceof Date)) {
    return null;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function readAssignedAtMs(job: WorkerJobRecord): number | null {
  const output = asRecord(job.outputJson);
  return readIsoMs(output.assignedAt)
    ?? readIsoMs(output.assignmentLeaseExpiresAt)
    ?? readIsoMs(job.startedAt)
    ?? readIsoMs(job.createdAt);
}

function readPreviousAssignments(job: WorkerJobRecord): Record<string, unknown>[] {
  const output = asRecord(job.outputJson);
  return Array.isArray(output.previousAssignments)
    ? output.previousAssignments
      .map((entry) => asRecord(entry))
      .filter((entry) => Object.keys(entry).length > 0)
    : [];
}

function buildAssignmentSnapshot(job: WorkerJobRecord, now: Date, actor: ReassignActor, reason: string): Record<string, unknown> {
  const output = asRecord(job.outputJson);
  return {
    assignmentAttempt: typeof output.assignmentAttempt === "string" ? output.assignmentAttempt : null,
    assignmentWorkerId: typeof output.assignmentWorkerId === "string" ? output.assignmentWorkerId : job.workerId ?? null,
    assignmentStatus: typeof output.assignmentStatus === "string" ? output.assignmentStatus : null,
    assignedAt: typeof output.assignedAt === "string" ? output.assignedAt : null,
    leaseExpiresAt: job.leaseExpiresAt instanceof Date
      ? job.leaseExpiresAt.toISOString()
      : typeof job.leaseExpiresAt === "string"
        ? job.leaseExpiresAt
        : null,
    previousStatus: job.status,
    actor,
    reason,
    requeuedAt: now.toISOString(),
  };
}

function buildRequeuedOutputJson(
  job: WorkerJobRecord,
  input: { now: Date; actor: ReassignActor; reason: string; terminal?: boolean },
): Record<string, unknown> {
  const output = asRecord(job.outputJson);
  const previousAssignments = [
    ...readPreviousAssignments(job),
    buildAssignmentSnapshot(job, input.now, input.actor, input.reason),
  ];
  const nextOutput: Record<string, unknown> = {
    ...output,
    previousAssignments,
    assignmentAttempt: null,
    assignmentWorkerId: null,
    assignmentLeaseExpiresAt: null,
    assignmentStatus: input.terminal ? "operator_required" : "requeued",
    reassignmentReason: input.reason,
    reassignmentActor: input.actor,
    reassignedAt: input.now.toISOString(),
  };
  return sanitizeWorkerPayload(nextOutput) as Record<string, unknown>;
}

function ensureJobOwnedByActor(job: WorkerJobRecord, auth: WorkerReassignAuth) {
  if (job.tenantId !== auth.tenantId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Worker job not found" });
  }
  if (!auth.isAdmin && job.requestedByUserId !== auth.userId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Worker job not found" });
  }
}

function ensureReassignableStatus(job: WorkerJobRecord) {
  if (!REASSIGNABLE_STATUSES.includes(job.status)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This job is not currently assigned to a worker.",
    });
  }
}

function computeElapsedMs(job: WorkerJobRecord, now: Date): number {
  const assignedAtMs = readAssignedAtMs(job);
  return assignedAtMs == null ? 0 : Math.max(0, now.getTime() - assignedAtMs);
}

export const defaultWorkerStallWatchdogRepo: WorkerStallWatchdogRepository = {
  async getJobById(tenantId, jobId) {
    const [job] = await db
      .select()
      .from(workerJobs)
      .where(and(eq(workerJobs.tenantId, tenantId), eq(workerJobs.id, jobId)))
      .limit(1);
    return job ?? null;
  },

  async listWatchdogCandidates(input) {
    return db
      .select()
      .from(workerJobs)
      .where(and(
        eq(workerJobs.tenantId, input.tenantId),
        eq(workerJobs.jobType, "hyperframes_final_composite"),
        inArray(workerJobs.status, REASSIGNABLE_STATUSES),
      ))
      .limit(input.limit);
  },

  async updateJob(jobId, values) {
    const [job] = await db
      .update(workerJobs)
      .set(values)
      .where(eq(workerJobs.id, jobId))
      .returning();
    if (!job) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Worker job not found" });
    }
    return job;
  },

  async insertJobEvent(workerJobId, eventType, payloadJson) {
    const [event] = await db
      .insert(workerJobEvents)
      .values({
        workerJobId,
        eventType,
        payloadJson,
      })
      .returning();
    return event;
  },
};

export function getWorkerReassignEligibility(
  job: WorkerJobRecord,
  now: Date = new Date(),
): {
  eligible: boolean;
  elapsedMs: number;
  remainingMs: number;
  thresholdMs: number;
} {
  const elapsedMs = computeElapsedMs(job, now);
  return {
    eligible: elapsedMs >= WORKER_USER_REASSIGN_THRESHOLD_MS
      && REASSIGNABLE_STATUSES.includes(job.status),
    elapsedMs,
    remainingMs: Math.max(0, WORKER_USER_REASSIGN_THRESHOLD_MS - elapsedMs),
    thresholdMs: WORKER_USER_REASSIGN_THRESHOLD_MS,
  };
}

async function requeueWorkerJobAttempt(input: {
  job: WorkerJobRecord;
  actor: ReassignActor;
  reason: string;
  now: Date;
  repo: WorkerStallWatchdogRepository;
  terminal?: boolean;
}): Promise<WorkerJobRecord> {
  const outputJson = buildRequeuedOutputJson(input.job, input);
  const values = input.terminal
    ? {
      status: "failed",
      statusReason: "Worker attempt stalled repeatedly; operator review required",
      workerId: null,
      leaseOwnerToken: null,
      leaseExpiresAt: null,
      outputJson,
      failureReason: input.reason,
      finishedAt: input.now,
    }
    : {
      status: "queued",
      statusReason: input.actor === "watchdog"
        ? "Worker attempt exceeded watchdog threshold and was requeued"
        : "Worker reassignment requested",
      workerId: null,
      leaseOwnerToken: null,
      leaseExpiresAt: null,
      outputJson,
      startedAt: null,
    };

  const updated = await input.repo.updateJob(input.job.id, values);
  await input.repo.insertJobEvent(input.job.id, input.terminal ? "job.failed" : "job.requeued", {
    reason: input.reason,
    actor: input.actor,
    previousWorkerId: input.job.workerId ?? null,
    previousAssignmentAttempt: asRecord(input.job.outputJson).assignmentAttempt ?? null,
    requeuedAt: input.now.toISOString(),
    terminal: input.terminal === true,
  });
  auditLogger.log({
    eventType: input.terminal ? "worker_job_watchdog_dead_letter" : "worker_job_requeued",
    userId: input.job.requestedByUserId ?? null,
    metadata: {
      tenantId: input.job.tenantId,
      jobId: input.job.id,
      workerId: input.job.workerId ?? null,
      jobType: input.job.jobType,
      actor: input.actor,
      reason: input.reason,
    },
  });
  return updated;
}

export async function requestWorkerJobReassignment(
  input: {
    auth: WorkerReassignAuth;
    jobId: string;
    reason?: string;
    now?: Date;
  },
  deps: { repo?: WorkerStallWatchdogRepository } = {},
): Promise<{
  requeued: true;
  jobId: string;
  previousWorkerId: string | null;
  elapsedMs: number;
}> {
  const repo = deps.repo ?? defaultWorkerStallWatchdogRepo;
  const now = input.now ?? new Date();
  const job = await repo.getJobById(input.auth.tenantId, input.jobId);
  if (!job) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Worker job not found" });
  }
  ensureJobOwnedByActor(job, input.auth);
  ensureReassignableStatus(job);

  const eligibility = getWorkerReassignEligibility(job, now);
  if (!eligibility.eligible && !input.auth.isAdmin) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "You can request another worker after this job has been assigned for at least 15 minutes.",
    });
  }

  await requeueWorkerJobAttempt({
    job,
    repo,
    now,
    actor: input.auth.isAdmin ? "admin" : "user",
    reason: input.reason?.trim() || "user_requested_reassignment",
  });

  return {
    requeued: true,
    jobId: job.id,
    previousWorkerId: job.workerId ?? null,
    elapsedMs: eligibility.elapsedMs,
  };
}

export async function requeueStalledWorkerJobs(
  input: {
    tenantId: string;
    now?: Date;
    limit?: number;
    maxAutomaticAttempts?: number;
  },
  deps: { repo?: WorkerStallWatchdogRepository } = {},
): Promise<{
  inspected: number;
  requeued: number;
  failed: number;
  skipped: number;
  jobIds: string[];
}> {
  const repo = deps.repo ?? defaultWorkerStallWatchdogRepo;
  const now = input.now ?? new Date();
  const maxAutomaticAttempts = input.maxAutomaticAttempts ?? WORKER_MAX_AUTOMATIC_ATTEMPTS;
  const candidates = await repo.listWatchdogCandidates({
    tenantId: input.tenantId,
    now,
    limit: input.limit ?? 50,
  });

  let requeued = 0;
  let failed = 0;
  let skipped = 0;
  const jobIds: string[] = [];

  for (const job of candidates) {
    const elapsedMs = computeElapsedMs(job, now);
    if (elapsedMs < WORKER_HARD_STALL_THRESHOLD_MS) {
      skipped += 1;
      continue;
    }
    const previousAttemptCount = readPreviousAssignments(job).length;
    const terminal = previousAttemptCount + 1 >= maxAutomaticAttempts;
    await requeueWorkerJobAttempt({
      job,
      repo,
      now,
      actor: "watchdog",
      reason: "worker_attempt_exceeded_30_min_watchdog",
      terminal,
    });
    if (terminal) {
      failed += 1;
    } else {
      requeued += 1;
    }
    jobIds.push(job.id);
  }

  return {
    inspected: candidates.length,
    requeued,
    failed,
    skipped,
    jobIds,
  };
}
