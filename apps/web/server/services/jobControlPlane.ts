import { createHash, randomUUID } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import {
  workerJobAttempts,
  workerJobEvents,
  workerJobOutbox,
  workerJobSettlements,
  workerJobs,
  type WorkerJob,
} from "../../drizzle/schema";
import {
  canonicalizeJobDefinition,
  computeJobDefinitionHash,
  redactJobPayload,
  validateJobDefinition,
  normalizeIdempotencyKey,
  validateBoundedPayload,
} from "./jobCanonicalization";
import {
  JobControlPlaneError,
  type ClassifiedJobError,
  type JobDefinition,
  type JobRef,
  type JobResult,
  type LeaseContext,
  type ProgressUpdate,
} from "./jobControlPlaneTypes";

const DEFAULT_LEASE_DURATION_MS: Record<string, number> = {
  short: 90_000,
  long: 180_000,
  external: 60_000,
  cpu: 120_000,
  gpu: 180_000,
  scheduled: 60_000,
};

export function leaseDurationMs(executionClass: string): number {
  const configured = Number(process.env[`FEATURE_186_LEASE_${executionClass.toUpperCase()}_MS`]);
  if (Number.isFinite(configured) && configured >= 10_000 && configured <= 15 * 60_000) return configured;
  return DEFAULT_LEASE_DURATION_MS[executionClass] ?? DEFAULT_LEASE_DURATION_MS.short;
}
export type TxRepo = {
  findJob(jobId: string): Promise<WorkerJob | null>;
  findByIdempotency(tenantId: string, idempotencyKey: string): Promise<WorkerJob | null>;
  findAttempt(jobId: string, attempt: number): Promise<{ id: string; leaseGeneration: number } | null>;
  findEventByIdempotency(jobId: string, key: string): Promise<{ eventType: string } | null>;
  insertJob(values: Record<string, unknown>): Promise<WorkerJob | null>;
  updateJob(input: {
    jobId: string;
    expectedStatus: string;
    expectedTenantId?: string;
    expectedRequestedByUserId?: number;
    expectedAttempt?: number;
    expectedLeaseHash?: string;
    expectedFencingVersion?: number;
    values: Record<string, unknown>;
  }): Promise<WorkerJob | null>;
  insertAttempt(values: Record<string, unknown>): Promise<void>;
  updateAttempt(input: { attemptId: string; values: Record<string, unknown> }): Promise<void>;
  insertSettlement(values: Record<string, unknown>): Promise<void>;
  insertEvent(input: {
    workerJobId: string;
    eventType: string;
    attemptId?: string;
    payloadJson?: Record<string, unknown>;
    eventIdempotencyKey: string;
  }): Promise<void>;
  insertOutbox(values: Record<string, unknown>): Promise<void>;
  findOutboxForAttempt(jobId: string, attemptId?: string): Promise<{ id: string; publishedAt: Date | null; cancelledAt: Date | null; quarantinedAt: Date | null } | null>;
  resetOutbox(input: { id: string; nextAttemptAt: Date }): Promise<void>;
  cancelUnpublishedOutbox(input: { jobId: string; reason: string; cancelledAt: Date }): Promise<void>;
};

export type JobControlPlaneRepository = {
  transaction<T>(work: (repo: TxRepo) => Promise<T>): Promise<T>;
};

function leaseHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function nowPlus(ms: number, now = new Date()): Date {
  return new Date(now.getTime() + ms);
}

function buildDefaultRepository(): JobControlPlaneRepository {
  return {
    async transaction(work) {
      getDb();
      return db.transaction(async tx => {
        const query = tx as any;
        const repo: TxRepo = {
          async findJob(jobId) {
            const [row] = await query.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
            return row ?? null;
          },
          async findByIdempotency(tenantId, idempotencyKey) {
            const [row] = await query
              .select()
              .from(workerJobs)
              .where(and(
                eq(workerJobs.tenantId, tenantId),
                eq(workerJobs.idempotencyKey, idempotencyKey),
              ))
              .limit(1);
            return row ?? null;
          },
          async findAttempt(jobId, attempt) {
            const [row] = await query.select({ id: workerJobAttempts.id, leaseGeneration: workerJobAttempts.leaseGeneration })
              .from(workerJobAttempts)
              .where(and(eq(workerJobAttempts.workerJobId, jobId), eq(workerJobAttempts.attempt, attempt)))
              .limit(1);
            return row ?? null;
          },
          async findEventByIdempotency(jobId, key) {
            const [row] = await query.select({ eventType: workerJobEvents.eventType })
              .from(workerJobEvents)
              .where(and(eq(workerJobEvents.workerJobId, jobId), eq(workerJobEvents.eventIdempotencyKey, key)))
              .limit(1);
            return row ?? null;
          },
          async insertJob(values) {
            const [row] = await query.insert(workerJobs).values(values).returning();
            return row ?? null;
          },
          async updateJob(input) {
            const conditions = [
              eq(workerJobs.id, input.jobId),
              eq(workerJobs.status, input.expectedStatus as any),
            ];
            if (input.expectedTenantId !== undefined) conditions.push(eq(workerJobs.tenantId, input.expectedTenantId));
            if (input.expectedRequestedByUserId !== undefined) conditions.push(eq(workerJobs.requestedByUserId, input.expectedRequestedByUserId));
            if (input.expectedAttempt !== undefined) conditions.push(eq(workerJobs.attempt, input.expectedAttempt));
            if (input.expectedLeaseHash !== undefined) conditions.push(eq(workerJobs.leaseOwnerToken, input.expectedLeaseHash));
            if (input.expectedFencingVersion !== undefined) conditions.push(eq(workerJobs.fencingVersion, input.expectedFencingVersion));
            const [row] = await query.update(workerJobs).set(input.values).where(and(...conditions)).returning();
            return row ?? null;
          },
          async insertAttempt(values) {
            await query.insert(workerJobAttempts).values(values);
          },
          async updateAttempt({ attemptId, values }) {
            await query.update(workerJobAttempts).set(values).where(eq(workerJobAttempts.id, attemptId));
          },
          async insertSettlement(values) {
            await query.insert(workerJobSettlements).values(values).onConflictDoNothing();
          },
          async insertEvent(input) {
            await appendJobEvent(query, input);
          },
          async insertOutbox(values) {
            await query.insert(workerJobOutbox).values(values);
          },
          async findOutboxForAttempt(jobId, attemptId) {
            const conditions = [eq(workerJobOutbox.workerJobId, jobId)];
            if (attemptId) conditions.push(eq(workerJobOutbox.attemptId, attemptId));
            const [row] = await query.select({
              id: workerJobOutbox.id,
              publishedAt: workerJobOutbox.publishedAt,
              cancelledAt: workerJobOutbox.cancelledAt,
              quarantinedAt: workerJobOutbox.quarantinedAt,
            }).from(workerJobOutbox).where(and(...conditions)).orderBy(sql`${workerJobOutbox.createdAt} DESC`).limit(1);
            return row ?? null;
          },
          async resetOutbox({ id, nextAttemptAt }) {
            await query.update(workerJobOutbox).set({
              nextAttemptAt,
              cancelledAt: null,
              quarantinedAt: null,
              failedReason: null,
              operatorReviewReason: null,
              publisherLeaseTokenHash: null,
              publisherLeaseExpiresAt: null,
              updatedAt: nextAttemptAt,
            }).where(eq(workerJobOutbox.id, id));
          },
          async cancelUnpublishedOutbox({ jobId, reason, cancelledAt }) {
            await query.update(workerJobOutbox).set({
              cancelledAt,
              failedReason: reason,
              operatorReviewReason: null,
              publisherLeaseTokenHash: null,
              publisherLeaseExpiresAt: null,
              updatedAt: cancelledAt,
            }).where(and(
              eq(workerJobOutbox.workerJobId, jobId),
              isNull(workerJobOutbox.publishedAt),
              isNull(workerJobOutbox.cancelledAt),
            ));
          },
        };
        return work(repo);
      });
    },
  };
}

export const defaultJobControlPlaneRepository = buildDefaultRepository();

export async function appendJobEvent(
  query: any,
  input: {
    workerJobId: string;
    eventType: string;
    attemptId?: string;
    payloadJson?: Record<string, unknown>;
    eventIdempotencyKey: string;
  },
): Promise<void> {
  await query.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.workerJobId}))`);
  const sequenceRows = await query.execute(sql`
    SELECT COALESCE(MAX("eventSequence"), 0) + 1 AS "nextSequence"
    FROM "worker_job_events"
    WHERE "workerJobId" = ${input.workerJobId}
  `);
  const eventSequence = Number(sequenceRows[0]?.nextSequence ?? 1);
  await query.insert(workerJobEvents).values({
    workerJobId: input.workerJobId,
    eventType: input.eventType,
    eventSequence,
    attemptId: input.attemptId ?? null,
    eventIdempotencyKey: input.eventIdempotencyKey,
    payloadJson: redactJobPayload(input.payloadJson ?? {}) as Record<string, unknown>,
  }).onConflictDoNothing();
}

export type CreateJobOptions = {
  runtimeType?: string;
  workerId?: string | null;
  requestedBySystemComponent?: string | null;
};

export type JobMutationScope = {
  tenantId: string;
  requestedByUserId?: number;
};

export type JobControlPlane = ReturnType<typeof createJobControlPlane>;

export function createJobControlPlane(repository: JobControlPlaneRepository = defaultJobControlPlaneRepository) {
  return {
    async getContext(jobId: string) {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job) return null;
        return {
          jobId: job.id,
          tenantId: job.tenantId,
          jobType: job.jobType,
          executionClass: job.executionClass,
          contractVersion: job.contractVersion,
          input: job.inputJson ?? {},
          instructions: job.instructionsJson ?? {},
          requiredCapabilities: job.capabilityRequirementsJson ?? {},
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          timeoutSeconds: job.timeoutSeconds,
          timeoutPolicy: job.timeoutPolicyJson ?? { softTimeoutMs: 0, hardTimeoutMs: job.timeoutSeconds * 1000 },
          statusReason: job.statusReason,
        };
      });
    },

    async create(definition: JobDefinition, options: CreateJobOptions = {}): Promise<JobRef> {
      const normalizedDefinition = definition.idempotencyKey
        ? { ...definition, idempotencyKey: normalizeIdempotencyKey(definition.idempotencyKey) }
        : definition;
      validateJobDefinition(normalizedDefinition);
      const definitionHash = computeJobDefinitionHash(normalizedDefinition);
      const createOnce = () => repository.transaction(async repo => {
        if (normalizedDefinition.idempotencyKey) {
          const existing = await repo.findByIdempotency(normalizedDefinition.tenantId, normalizedDefinition.idempotencyKey);
          if (existing) {
            if (existing.definitionHash !== definitionHash) {
              throw new JobControlPlaneError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for another job definition");
            }
            return { jobId: existing.id, created: false };
          }
        }

        const jobId = randomUUID();
        const row = await repo.insertJob({
          id: jobId,
          tenantId: normalizedDefinition.tenantId,
          requestedByUserId: normalizedDefinition.requestedByUserId ?? null,
          requestedBySystemComponent: options.requestedBySystemComponent ?? null,
          workerId: options.workerId ?? null,
          runtimeType: options.runtimeType ?? "external_runtime",
          jobType: normalizedDefinition.jobType,
          executionClass: normalizedDefinition.executionClass,
          contractVersion: normalizedDefinition.contractVersion,
          status: "queued",
          priority: normalizedDefinition.priority ?? 0,
          capabilityRequirementsJson: normalizedDefinition.requiredCapabilities ?? {},
          inputJson: normalizedDefinition.input,
          retryPolicyJson: normalizedDefinition.retryPolicy,
          timeoutPolicyJson: normalizedDefinition.timeoutPolicy,
          timeoutSeconds: Math.ceil(normalizedDefinition.timeoutPolicy.hardTimeoutMs / 1000),
          idempotencyKey: normalizedDefinition.idempotencyKey ?? null,
          definitionHash,
          attempt: 1,
          maxAttempts: normalizedDefinition.retryPolicy.maxAttempts,
          progressJson: {},
          fencingVersion: 0,
          operatorReviewRequired: false,
        });
        if (!row) {
          if (normalizedDefinition.idempotencyKey) {
            const winner = await repo.findByIdempotency(normalizedDefinition.tenantId, normalizedDefinition.idempotencyKey);
            if (winner?.definitionHash === definitionHash) return { jobId: winner.id, created: false };
          }
          throw new JobControlPlaneError("IDEMPOTENCY_CONFLICT", "Job creation lost an idempotency race");
        }

        await repo.insertEvent({ workerJobId: row.id, eventType: "CREATED", eventIdempotencyKey: `created:${row.id}` });
        await repo.insertEvent({ workerJobId: row.id, eventType: "QUEUED", eventIdempotencyKey: `queued:${row.id}` });
        await repo.insertEvent({ workerJobId: row.id, eventType: "DISPATCH_REQUESTED", eventIdempotencyKey: `dispatch-requested:${row.id}:1`, payloadJson: { attempt: 1 } });
        await repo.insertOutbox({
          workerJobId: row.id,
          envelopeVersion: normalizedDefinition.contractVersion,
          envelopeJson: {
            jobId: row.id,
            businessAttempt: 1,
            contractVersion: normalizedDefinition.contractVersion,
            dedupeKey: `job:${row.id}:attempt:1`,
          },
          dedupeKey: `job:${row.id}:attempt:1`,
          nextAttemptAt: new Date(),
        });
        return { jobId: row.id, created: true };
      });
      try {
        return await createOnce();
      } catch (error) {
        if (!normalizedDefinition.idempotencyKey || (error as { code?: string })?.code !== "23505") throw error;
        return repository.transaction(async repo => {
          const winner = await repo.findByIdempotency(normalizedDefinition.tenantId, normalizedDefinition.idempotencyKey!);
          if (!winner) throw error;
          if (winner.definitionHash !== definitionHash) throw new JobControlPlaneError("IDEMPOTENCY_CONFLICT", "Idempotency key was already used for another job definition");
          return { jobId: winner.id, created: false };
        });
      }
    },

    async claim(input: { jobId: string; runnerId: string; adapter: string }): Promise<LeaseContext | null> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(input.jobId);
        if (!job || job.status !== "queued") return null;
        if (job.attempt > job.maxAttempts) return null;
        const existingAttempt = await repo.findAttempt(job.id, job.attempt);
        const attemptId = existingAttempt?.id ?? randomUUID();
        const token = randomUUID();
        const fencingVersion = Math.max(job.fencingVersion + 1, existingAttempt?.leaseGeneration ?? 0);
        const expiresAt = nowPlus(leaseDurationMs(job.executionClass));
        const claimed = await repo.updateJob({
          jobId: job.id,
          expectedStatus: "queued",
          expectedAttempt: job.attempt,
          expectedFencingVersion: job.fencingVersion,
          values: {
            status: "leased",
            leaseOwnerToken: leaseHash(token),
            leaseExpiresAt: expiresAt,
            heartbeatAt: new Date(),
            fencingVersion,
            statusReason: `claimed:${input.adapter}`,
          },
        });
        if (!claimed) return null;
        if (existingAttempt) {
          await repo.updateAttempt({ attemptId, values: {
            leaseGeneration: fencingVersion,
            runnerId: input.runnerId,
            leaseTokenHash: leaseHash(token),
            leaseExpiresAt: expiresAt,
          }});
        } else {
          await repo.insertAttempt({
            id: attemptId,
            workerJobId: job.id,
            attempt: job.attempt,
            leaseGeneration: fencingVersion,
            runnerId: input.runnerId,
            leaseTokenHash: leaseHash(token),
            leaseExpiresAt: expiresAt,
          });
        }
        await repo.insertEvent({
          workerJobId: job.id,
          eventType: "LEASE_ACQUIRED",
          attemptId,
          eventIdempotencyKey: `lease:${attemptId}`,
          payloadJson: { runnerId: input.runnerId, adapter: input.adapter, fencingVersion },
        });
        return { jobId: job.id, attemptId, leaseToken: token, fencingVersion, expiresAt: expiresAt.toISOString() };
      });
    },

    async start(lease: LeaseContext): Promise<void> {
      await guardedLeaseUpdate(repository, lease, "leased", "running", "STARTED", {}, { startedAt: new Date() });
    },

    async heartbeat(lease: LeaseContext): Promise<void> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        await assertLeaseAttempt(repo, lease, job);
        const now = new Date();
        const timeoutPolicy = (job?.timeoutPolicyJson ?? {}) as Record<string, unknown>;
        const hardTimeoutMs = Number.isFinite(Number(timeoutPolicy.hardTimeoutMs)) && Number(timeoutPolicy.hardTimeoutMs) > 0
          ? Number(timeoutPolicy.hardTimeoutMs)
          : (job ? job.timeoutSeconds * 1000 : 0);
        const executionStartedAt = job?.startedAt ?? job?.createdAt;
        if (!job || job.status !== "running" || !executionStartedAt || now.getTime() >= executionStartedAt.getTime() + hardTimeoutMs) {
          if (job?.status === "running") {
            const expired = await repo.updateJob({
              jobId: lease.jobId,
              expectedStatus: "running",
              expectedAttempt: job.attempt,
              expectedLeaseHash: leaseHash(lease.leaseToken),
              expectedFencingVersion: lease.fencingVersion,
              values: { status: "expired", statusReason: "hard_timeout", leaseOwnerToken: null, leaseExpiresAt: null, finishedAt: now },
            });
            if (expired) {
              await repo.cancelUnpublishedOutbox({ jobId: lease.jobId, reason: "expired:hard_timeout", cancelledAt: now });
              await repo.updateAttempt({ attemptId: lease.attemptId, values: { finishedAt: now, terminalClass: "expired", recoveryReason: "hard_timeout" } });
              await repo.insertEvent({ workerJobId: lease.jobId, eventType: "TIMEOUT", attemptId: lease.attemptId, eventIdempotencyKey: `timeout:${lease.attemptId}`, payloadJson: { kind: "hard" } });
              await repo.insertEvent({ workerJobId: lease.jobId, eventType: "EXPIRED", attemptId: lease.attemptId, eventIdempotencyKey: `expired:${lease.attemptId}`, payloadJson: { reason: "hard_timeout" } });
            }
          }
          throw new JobControlPlaneError("JOB_TIMEOUT", "Job hard deadline has elapsed");
        }
        const hardDeadlineAt = new Date(executionStartedAt.getTime() + hardTimeoutMs);
        const requestedLeaseExpiry = nowPlus(leaseDurationMs(job.executionClass), now);
        const leaseExpiresAt = new Date(Math.min(requestedLeaseExpiry.getTime(), hardDeadlineAt.getTime()));
        const updated = await repo.updateJob({
          jobId: lease.jobId,
          expectedStatus: "running",
          expectedAttempt: job.attempt,
          expectedLeaseHash: leaseHash(lease.leaseToken),
          expectedFencingVersion: lease.fencingVersion,
          values: { heartbeatAt: now, leaseExpiresAt },
        });
        if (!updated) throw new JobControlPlaneError("JOB_LEASE_STALE", "Job lease is no longer active");
        await repo.insertEvent({ workerJobId: lease.jobId, eventType: "HEARTBEAT", attemptId: lease.attemptId, eventIdempotencyKey: `heartbeat:${lease.attemptId}:${now.toISOString()}`, payloadJson: {} });
      });
    },

    async progress(lease: LeaseContext, update: ProgressUpdate): Promise<void> {
      if (!Number.isFinite(update.progress) || update.progress < 0 || update.progress > 100 || !update.stage || update.stage.length > 100 || (update.message?.length ?? 0) > 500) {
        throw new JobControlPlaneError("JOB_PROGRESS_INVALID", "Progress must be between 0 and 100 with a stage");
      }
      validateBoundedPayload(update.measured ?? {}, "progress.measured");
      await repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        await assertLeaseAttempt(repo, lease, job);
        const previous = job?.progressJson as Record<string, unknown> | undefined;
        const sameStage = previous?.stage === update.stage;
        if (sameStage && typeof previous?.progress === "number" && update.progress < previous.progress) {
          throw new JobControlPlaneError("JOB_PROGRESS_REGRESSION", "Progress cannot move backward within a stage");
        }
        const updated = await repo.updateJob({
          jobId: lease.jobId,
          expectedStatus: "running",
          expectedAttempt: job?.attempt,
          expectedLeaseHash: leaseHash(lease.leaseToken),
          expectedFencingVersion: lease.fencingVersion,
          values: { progressJson: update },
        });
        if (!updated) throw new JobControlPlaneError("JOB_LEASE_STALE", "Job lease is no longer active");
        await repo.insertEvent({ workerJobId: lease.jobId, eventType: "PROGRESS", attemptId: lease.attemptId, eventIdempotencyKey: `progress:${lease.attemptId}:${update.stage}:${update.progress}`, payloadJson: update });
      });
    },

    async waitForExternal(lease: LeaseContext, input: { operationKey: string; providerReference?: string; resumeAfter: string }): Promise<void> {
      if (!input.operationKey || input.operationKey.length > 200 || (input.providerReference?.length ?? 0) > 255 || Number.isNaN(Date.parse(input.resumeAfter))) throw new JobControlPlaneError("JOB_EXTERNAL_WAIT_INVALID", "External wait metadata is invalid");
      await guardedLeaseUpdate(repository, lease, "running", "waiting_external", "WAITING_EXTERNAL", input, {
        leaseOwnerToken: null,
        leaseExpiresAt: null,
        heartbeatAt: new Date(),
        progressJson: { externalWait: input },
      });
    },

    async resumeExternal(jobId: string, runnerId: string, adapter: string): Promise<boolean> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "waiting_external") return false;
        const resumeKey = `external-resumed:${jobId}:${job.attempt}`;
        if (await repo.findEventByIdempotency(jobId, resumeKey)) return true;
        const updated = await repo.updateJob({ jobId, expectedStatus: "waiting_external", expectedAttempt: job.attempt, values: { status: "queued", statusReason: `external_resumed:${adapter}` } });
        if (!updated) return false;
        const attempt = await repo.findAttempt(jobId, job.attempt);
        await repo.insertEvent({ workerJobId: jobId, eventType: "RECOVERED", attemptId: attempt?.id, eventIdempotencyKey: resumeKey, payloadJson: { runnerId, adapter } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "DISPATCH_REQUESTED", attemptId: attempt?.id, eventIdempotencyKey: `dispatch-requested:external-resume:${jobId}:${job.attempt}`, payloadJson: { attempt: job.attempt, reason: "external_resumed" } });
        await repo.insertOutbox({
          workerJobId: jobId,
          attemptId: attempt?.id,
          envelopeVersion: job.contractVersion,
          envelopeJson: { jobId, businessAttempt: job.attempt, attemptId: attempt?.id, reason: "external_resumed" },
          dedupeKey: `job:${jobId}:attempt:${job.attempt}:external-resume`,
          nextAttemptAt: new Date(),
        });
        return true;
      });
    },

    async complete(lease: LeaseContext, result: JobResult): Promise<void> {
      if (result.resultRef && result.resultRef.length > 2000) throw new JobControlPlaneError("JOB_RESULT_INVALID", "Result reference is too large");
      validateBoundedPayload(result.output ?? {}, "result.output");
      await guardedLeaseUpdate(repository, lease, "running", "succeeded", "COMPLETED", result, {
        resultRef: result.resultRef ?? null,
        outputJson: result.output ?? {},
        leaseOwnerToken: null,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      }, { settlementKey: `result:${lease.jobId}:${lease.attemptId}`, settlementType: "result" });
    },

    async fail(lease: LeaseContext, error: ClassifiedJobError): Promise<void> {
      if (!error.code || error.code.length > 100 || !error.message || error.message.length > 2000) throw new JobControlPlaneError("JOB_ERROR_INVALID", "Classified error is invalid");
      await repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        await assertLeaseAttempt(repo, lease, job);
        if (!job || job.status !== "running") {
          throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Job is no longer running");
        }
        const policy = (job.retryPolicyJson ?? {}) as Record<string, unknown>;
        const allowedErrors = Array.isArray(policy.allowedErrorClasses) ? policy.allowedErrorClasses.filter((item): item is string => typeof item === "string") : [];
        const now = new Date();
        const withinDeadline = !Number.isFinite(Number(policy.deadlineMs)) || now.getTime() < job.createdAt.getTime() + Number(policy.deadlineMs);
        const allowed = allowedErrors.length === 0 || allowedErrors.includes(error.code) || allowedErrors.includes(error.class);
        const shouldRetry = error.class === "retryable" && allowed && withinDeadline && job.attempt < job.maxAttempts;
        const nextStatus = shouldRetry ? "retry_scheduled" : "failed";
        const nextAttempt = shouldRetry ? job.attempt + 1 : job.attempt;
        const nextAttemptId = shouldRetry ? randomUUID() : undefined;
        const baseDelayMs = Number.isFinite(Number(policy.baseDelayMs)) && Number(policy.baseDelayMs) >= 0 ? Number(policy.baseDelayMs) : 60_000;
        const maxDelayMs = Number.isFinite(Number(policy.maxDelayMs)) && Number(policy.maxDelayMs) >= baseDelayMs ? Number(policy.maxDelayMs) : 900_000;
        const jitter = policy.jitter === "bounded" || policy.jitter === "recorded" ? policy.jitter : "none";
        const retryDelayMs = calculateRetryDelay(job.attempt, baseDelayMs, maxDelayMs, jitter, job.id);
        const nextRetryAt = shouldRetry ? nowPlus(retryDelayMs, now) : null;
        const updated = await repo.updateJob({
          jobId: job.id,
          expectedStatus: "running",
          expectedAttempt: job.attempt,
          expectedLeaseHash: leaseHash(lease.leaseToken),
          expectedFencingVersion: lease.fencingVersion,
          values: {
            status: nextStatus,
            attempt: nextAttempt,
            statusReason: error.code,
            failureReason: error.message.slice(0, 2000),
            nextRetryAt,
            operatorReviewRequired: error.class === "unknown" || error.operatorReviewRequired === true,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            finishedAt: nextStatus === "failed" ? new Date() : null,
          },
        });
        if (!updated) throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Lease is stale");
        await repo.updateAttempt({ attemptId: lease.attemptId, values: {
          finishedAt: new Date(),
          terminalClass: nextStatus === "failed" ? error.class : "retryable",
          recoveryReason: error.code,
        }});
        if (!shouldRetry) {
          await repo.cancelUnpublishedOutbox({ jobId: job.id, reason: `failed:${error.code}`, cancelledAt: now });
        }
        if (shouldRetry && nextAttemptId) {
          await repo.insertAttempt({
            id: nextAttemptId,
            workerJobId: job.id,
            attempt: nextAttempt,
            leaseGeneration: 0,
            recoveryReason: error.code,
          });
          await repo.insertEvent({
            workerJobId: job.id,
            eventType: "DISPATCH_REQUESTED",
            attemptId: nextAttemptId,
            eventIdempotencyKey: `dispatch-requested:${job.id}:${nextAttempt}`,
            payloadJson: { attempt: nextAttempt, reason: error.code },
          });
          await repo.insertOutbox({
            workerJobId: job.id,
            attemptId: nextAttemptId,
            envelopeVersion: job.contractVersion,
            envelopeJson: { jobId: job.id, businessAttempt: nextAttempt, attemptId: nextAttemptId },
            dedupeKey: `job:${job.id}:attempt:${nextAttempt}`,
            nextAttemptAt: nextRetryAt,
          });
        }
        await repo.insertEvent({
          workerJobId: job.id,
          eventType: nextStatus === "retry_scheduled" ? "RETRY_SCHEDULED" : "FAILED",
          attemptId: lease.attemptId,
          eventIdempotencyKey: `failure:${lease.attemptId}:${error.code}`,
          payloadJson: { code: error.code, class: error.class, nextAttempt: shouldRetry ? nextAttempt : undefined, retryDelayMs: shouldRetry ? retryDelayMs : undefined, jitter: shouldRetry ? jitter : undefined, operatorReviewRequired: error.operatorReviewRequired ?? false },
        });
      });
    },

    async requestSoftTimeout(jobId: string, now = new Date()): Promise<"requested" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "running" || !job.startedAt) return "ignored";
        const policy = (job.timeoutPolicyJson ?? {}) as Record<string, unknown>;
        const softTimeoutMs = Number(policy.softTimeoutMs);
        if (!Number.isFinite(softTimeoutMs) || softTimeoutMs <= 0 || now.getTime() < job.startedAt.getTime() + softTimeoutMs) return "ignored";
        const eventKey = `soft-timeout:${job.id}:${job.attempt}`;
        if (await repo.findEventByIdempotency(job.id, eventKey)) return "requested";
        const updated = await repo.updateJob({
          jobId: job.id,
          expectedStatus: "running",
          expectedAttempt: job.attempt,
          values: { statusReason: "soft_timeout_requested" },
        });
        if (!updated) return "ignored";
        await repo.insertEvent({
          workerJobId: job.id,
          eventType: "TIMEOUT",
          attemptId: (await repo.findAttempt(job.id, job.attempt))?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: { kind: "soft", requestedAt: now.toISOString(), cooperative: true },
        });
        return "requested";
      });
    },

    async requestCancel(jobId: string, reason = "cancelled_by_request", actionId?: string, actorId?: number, scope?: JobMutationScope): Promise<void> {
      await repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        const keyPrefix = actionId ? `operator:${actionId}` : `cancel:${jobId}:${job?.attempt ?? 0}`;
        if (await repo.findEventByIdempotency(jobId, `${keyPrefix}:requested`)) return;
        if (!job || ["succeeded", "failed", "cancelled", "expired"].includes(job.status)) {
          throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Job cannot be cancelled in its current state");
        }
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedTenantId: scope?.tenantId,
          expectedRequestedByUserId: scope?.requestedByUserId,
          expectedAttempt: job.attempt,
          values: { statusReason: `cancel_requested:${reason}`, leaseOwnerToken: null, leaseExpiresAt: null },
        });
        if (!updated) throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Job changed while requesting cancellation");
        if (actionId) await repo.insertEvent({ workerJobId: jobId, eventType: "OPERATOR_ACTION", eventIdempotencyKey: `${keyPrefix}:action`, payloadJson: { action: "cancel", reason, actorId, targetAttempt: job.attempt, targetStatus: job.status } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "CANCEL_REQUESTED", attemptId: (await repo.findAttempt(jobId, job.attempt))?.id, eventIdempotencyKey: `${keyPrefix}:requested`, payloadJson: { reason, actionId, actorId } });
      });
    },

    async finalizeCancel(jobId: string, reason = "cancelled_by_request", actionId?: string, actorId?: number, scope?: JobMutationScope): Promise<void> {
      await repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status === "cancelled") return;
        if (["succeeded", "failed", "expired"].includes(job.status)) throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Job cannot be cancelled in its current state");
        const keyPrefix = actionId ? `operator:${actionId}` : `cancel:${jobId}:${job.attempt}`;
        const updated = await repo.updateJob({ jobId, expectedStatus: job.status, expectedTenantId: scope?.tenantId, expectedRequestedByUserId: scope?.requestedByUserId, expectedAttempt: job.attempt, values: { status: "cancelled", statusReason: reason, leaseOwnerToken: null, leaseExpiresAt: null, finishedAt: new Date() } });
        if (!updated) throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Job changed while finalizing cancellation");
        await repo.cancelUnpublishedOutbox({ jobId, reason: `cancelled:${reason}`, cancelledAt: new Date() });
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt) await repo.updateAttempt({ attemptId: currentAttempt.id, values: { finishedAt: new Date(), terminalClass: "cancelled", recoveryReason: reason } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "CANCELLED", attemptId: currentAttempt?.id, eventIdempotencyKey: `${keyPrefix}:cancelled`, payloadJson: { reason, actionId, actorId } });
      });
    },

    async reconcileCancellationRequest(jobId: string): Promise<"finalized" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status === "cancelled") return "ignored";
        if (!job.statusReason?.startsWith("cancel_requested:")) return "ignored";
        if (["succeeded", "failed", "expired"].includes(job.status)) return "ignored";
        const reason = job.statusReason.slice("cancel_requested:".length).slice(0, 2000) || "cancelled_by_request";
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedAttempt: job.attempt,
          values: { status: "cancelled", statusReason: reason, leaseOwnerToken: null, leaseExpiresAt: null, finishedAt: new Date() },
        });
        if (!updated) return "ignored";
        await repo.cancelUnpublishedOutbox({ jobId, reason: `cancelled:${reason}`, cancelledAt: new Date() });
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt) await repo.updateAttempt({ attemptId: currentAttempt.id, values: { finishedAt: new Date(), terminalClass: "cancelled", recoveryReason: reason } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "CANCELLED", attemptId: currentAttempt?.id, eventIdempotencyKey: `cancel:${jobId}:${job.attempt}:cancelled`, payloadJson: { reason, recovered: true } });
        return "finalized";
      });
    },

    async cancel(jobId: string, reason = "cancelled_by_request", actionId?: string, actorId?: number, scope?: JobMutationScope): Promise<void> {
      await this.requestCancel(jobId, reason, actionId, actorId, scope);
      await this.finalizeCancel(jobId, reason, actionId, actorId, scope);
    },

    async makeRetryDue(jobId: string, actionId?: string, actorId?: number, reason = "retry_due"): Promise<boolean> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "retry_scheduled") return false;
        if (job.operatorReviewRequired && !actionId) return false;
        if (job.statusReason?.startsWith("cancel_requested:")) return false;
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        const existingOutbox = await repo.findOutboxForAttempt(jobId, currentAttempt?.id);
        const updated = await repo.updateJob({ jobId, expectedStatus: "retry_scheduled", expectedAttempt: job.attempt, values: { status: "queued", nextRetryAt: null, operatorReviewRequired: false } });
        if (!updated) return false;
        if (existingOutbox && !existingOutbox.publishedAt) {
          await repo.resetOutbox({ id: existingOutbox.id, nextAttemptAt: new Date() });
        } else if (!existingOutbox) {
          await repo.insertEvent({ workerJobId: jobId, eventType: "DISPATCH_REQUESTED", attemptId: currentAttempt?.id, eventIdempotencyKey: `dispatch-requested:${jobId}:${job.attempt}:requeue`, payloadJson: { attempt: job.attempt, reason: actionId ? "operator_requeue" : "retry_due" } });
          await repo.insertOutbox({
            workerJobId: jobId,
            attemptId: currentAttempt?.id,
            envelopeVersion: job.contractVersion,
            envelopeJson: { jobId, businessAttempt: job.attempt, attemptId: currentAttempt?.id, reason: actionId ? "operator_requeue" : "retry_due" },
            dedupeKey: `job:${jobId}:attempt:${job.attempt}`,
            nextAttemptAt: new Date(),
          });
        }
        if (actionId) await repo.insertEvent({ workerJobId: jobId, eventType: "OPERATOR_ACTION", eventIdempotencyKey: `operator:${actionId}:action`, payloadJson: { action: "requeue", reason: reason.slice(0, 500), actorId, targetAttempt: job.attempt, targetStatus: job.status } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "RECOVERED", eventIdempotencyKey: actionId ? `operator:${actionId}:requeue` : `retry-due:${jobId}:${job.attempt}`, payloadJson: { attempt: job.attempt, actionId, reason: reason.slice(0, 500) } });
        return true;
      });
    },

    async forceFail(jobId: string, reason: string, actionId: string, actorId?: number): Promise<void> {
      await repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (await repo.findEventByIdempotency(jobId, `operator:${actionId}:failed`)) return;
        if (!job || ["succeeded", "failed", "cancelled", "expired"].includes(job.status)) throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Job cannot be force-failed in its current state");
        const updated = await repo.updateJob({ jobId, expectedStatus: job.status, expectedAttempt: job.attempt, values: { status: "failed", statusReason: "operator_force_fail", failureReason: reason.slice(0, 2000), operatorReviewRequired: true, leaseOwnerToken: null, leaseExpiresAt: null, finishedAt: new Date() } });
        if (!updated) throw new JobControlPlaneError("JOB_STATE_CONFLICT", "Job changed while force-failing");
        await repo.cancelUnpublishedOutbox({ jobId, reason: "failed:operator_force_fail", cancelledAt: new Date() });
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt) await repo.updateAttempt({ attemptId: currentAttempt.id, values: { finishedAt: new Date(), terminalClass: "operator", recoveryReason: reason.slice(0, 500) } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "OPERATOR_ACTION", attemptId: currentAttempt?.id, eventIdempotencyKey: `operator:${actionId}:action`, payloadJson: { action: "force_fail", reason, actorId, targetAttempt: job.attempt, targetStatus: job.status } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "FAILED", attemptId: currentAttempt?.id, eventIdempotencyKey: `operator:${actionId}:failed`, payloadJson: { code: "OPERATOR_FORCE_FAIL", operatorReviewRequired: true } });
      });
    },

    async failExternalWait(jobId: string, reason: string, operatorReviewRequired = true, now = new Date()): Promise<"failed" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "waiting_external") return "ignored";
        const updated = await repo.updateJob({ jobId, expectedStatus: "waiting_external", expectedAttempt: job.attempt, values: { status: "failed", statusReason: "external_wait_timeout", failureReason: reason.slice(0, 2000), operatorReviewRequired, finishedAt: now } });
        if (!updated) return "ignored";
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt) await repo.updateAttempt({ attemptId: currentAttempt.id, values: { finishedAt: now, terminalClass: "failed", recoveryReason: reason.slice(0, 500) } });
        await repo.cancelUnpublishedOutbox({ jobId, reason: "failed:external_wait_timeout", cancelledAt: now });
        await repo.insertEvent({ workerJobId: jobId, eventType: "TIMEOUT", attemptId: currentAttempt?.id, eventIdempotencyKey: `external-timeout:${jobId}:${job.attempt}`, payloadJson: { reason } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "FAILED", attemptId: currentAttempt?.id, eventIdempotencyKey: `external-failed:${jobId}:${job.attempt}`, payloadJson: { code: "EXTERNAL_WAIT_TIMEOUT", operatorReviewRequired } });
        return "failed";
      });
    },

    async expireDeadline(jobId: string, now = new Date()): Promise<"expired" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || ["succeeded", "failed", "cancelled", "expired"].includes(job.status)) return "ignored";
        const policy = (job.retryPolicyJson ?? {}) as Record<string, unknown>;
        const configuredDeadline = Number(policy.deadlineMs);
        const deadlineMs = Number.isFinite(configuredDeadline) && configuredDeadline > 0 ? configuredDeadline : job.timeoutSeconds * 1000;
        if (now.getTime() < job.createdAt.getTime() + deadlineMs) return "ignored";
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedAttempt: job.attempt,
          values: { status: "expired", statusReason: "job_deadline", nextRetryAt: null, leaseOwnerToken: null, leaseExpiresAt: null, finishedAt: now },
        });
        if (!updated) return "ignored";
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt) await repo.updateAttempt({ attemptId: currentAttempt.id, values: { finishedAt: now, terminalClass: "expired", recoveryReason: "job_deadline" } });
        await repo.cancelUnpublishedOutbox({ jobId, reason: "expired:job_deadline", cancelledAt: now });
        await repo.insertEvent({ workerJobId: jobId, eventType: "TIMEOUT", attemptId: currentAttempt?.id, eventIdempotencyKey: `deadline-timeout:${jobId}:${job.attempt}`, payloadJson: { kind: "deadline" } });
        await repo.insertEvent({ workerJobId: jobId, eventType: "EXPIRED", attemptId: currentAttempt?.id, eventIdempotencyKey: `deadline-expired:${jobId}:${job.attempt}`, payloadJson: { reason: "job_deadline" } });
        return "expired";
      });
    },

    async recoverExpiredLease(jobId: string, now = new Date()): Promise<"recovered" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || !["running", "waiting_external"].includes(job.status) || !job.leaseExpiresAt || job.leaseExpiresAt > now) return "ignored";
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        const policy = (job.retryPolicyJson ?? {}) as Record<string, unknown>;
        const withinDeadline = !Number.isFinite(Number(policy.deadlineMs)) || now.getTime() < job.createdAt.getTime() + Number(policy.deadlineMs);
        const shouldRetry = withinDeadline && job.attempt < job.maxAttempts;
        const nextAttempt = shouldRetry ? job.attempt + 1 : job.attempt;
        const nextAttemptId = shouldRetry ? randomUUID() : undefined;
        const nextStatus = shouldRetry ? "retry_scheduled" : "expired";
        const baseDelayMs = Number.isFinite(Number(policy.baseDelayMs)) && Number(policy.baseDelayMs) >= 0 ? Number(policy.baseDelayMs) : 1000;
        const maxDelayMs = Number.isFinite(Number(policy.maxDelayMs)) && Number(policy.maxDelayMs) >= baseDelayMs ? Number(policy.maxDelayMs) : 900000;
        const jitter = policy.jitter === "bounded" || policy.jitter === "recorded" ? policy.jitter : "none";
        const retryDelay = calculateRetryDelay(job.attempt, baseDelayMs, maxDelayMs, jitter, job.id);
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedAttempt: job.attempt,
          expectedFencingVersion: job.fencingVersion,
          values: {
            status: nextStatus,
            attempt: nextAttempt,
            nextRetryAt: shouldRetry ? nowPlus(retryDelay, now) : null,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            heartbeatAt: now,
            finishedAt: shouldRetry ? null : now,
            statusReason: "lease_expired",
          },
        });
        if (!updated) return "ignored";
        if (currentAttempt) await repo.updateAttempt({ attemptId: currentAttempt.id, values: { finishedAt: now, terminalClass: nextStatus === "expired" ? "expired" : "retryable", recoveryReason: "lease_expired" } });
        if (nextStatus === "expired") await repo.cancelUnpublishedOutbox({ jobId, reason: "expired:lease_expired", cancelledAt: now });
        await repo.insertEvent({ workerJobId: jobId, eventType: "LEASE_EXPIRED", eventIdempotencyKey: `lease-expired:${jobId}:${job.fencingVersion}`, payloadJson: { attempt: job.attempt, priorStatus: job.status } });
        if (shouldRetry && nextAttemptId) {
          await repo.insertAttempt({ id: nextAttemptId, workerJobId: jobId, attempt: nextAttempt, leaseGeneration: 0, recoveryReason: "lease_expired" });
          await repo.insertEvent({
            workerJobId: jobId,
            eventType: "DISPATCH_REQUESTED",
            attemptId: nextAttemptId,
            eventIdempotencyKey: `dispatch-requested:${jobId}:${nextAttempt}`,
            payloadJson: { attempt: nextAttempt, reason: "lease_expired" },
          });
          await repo.insertOutbox({ workerJobId: jobId, attemptId: nextAttemptId, envelopeVersion: job.contractVersion, envelopeJson: { jobId, businessAttempt: nextAttempt, attemptId: nextAttemptId }, dedupeKey: `job:${jobId}:attempt:${nextAttempt}`, nextAttemptAt: nowPlus(retryDelay, now) });
        }
        await repo.insertEvent({ workerJobId: jobId, eventType: "RECOVERED", eventIdempotencyKey: `recovered:${jobId}:${job.fencingVersion}`, payloadJson: { nextStatus, nextAttempt, retryDelayMs: shouldRetry ? retryDelay : undefined, jitter: shouldRetry ? jitter : undefined } });
        return "recovered";
      });
    },

    async assertActive(lease: LeaseContext): Promise<void> {
      await repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        const attempt = job ? await repo.findAttempt(job.id, job.attempt) : null;
        if (!job || !attempt || attempt.id !== lease.attemptId || attempt.leaseGeneration !== lease.fencingVersion || job.status !== "running" || job.leaseOwnerToken !== leaseHash(lease.leaseToken) || job.fencingVersion !== lease.fencingVersion) {
          throw new JobControlPlaneError("JOB_LEASE_STALE", "Job lease is no longer active");
        }
      });
    },
  };
}

async function guardedLeaseUpdate(
  repository: JobControlPlaneRepository,
  lease: LeaseContext,
  expectedStatus: string,
  nextStatus: string,
  eventType: string,
  payload: Record<string, unknown>,
  values: Record<string, unknown> = {},
  settlement?: { settlementKey: string; settlementType: string },
): Promise<void> {
  await repository.transaction(async repo => {
    const job = await repo.findJob(lease.jobId);
    await assertLeaseAttempt(repo, lease, job);
    const updated = await repo.updateJob({
      jobId: lease.jobId,
      expectedStatus,
      expectedLeaseHash: leaseHash(lease.leaseToken),
      expectedFencingVersion: lease.fencingVersion,
      values: { ...values, status: nextStatus },
    });
    if (!updated) throw new JobControlPlaneError("JOB_LEASE_STALE", "Job lease is no longer active");
    if (settlement) await repo.insertSettlement({ workerJobId: lease.jobId, attemptId: lease.attemptId, settlementKey: settlement.settlementKey, settlementType: settlement.settlementType, payloadJson: payload });
    if (eventType === "STARTED") {
      await repo.updateAttempt({ attemptId: lease.attemptId, values: { startedAt: new Date(), leaseExpiresAt: values.leaseExpiresAt ?? null } });
    } else if (eventType === "COMPLETED") {
      await repo.updateAttempt({ attemptId: lease.attemptId, values: { finishedAt: new Date(), terminalClass: "succeeded" } });
    }
    await repo.insertEvent({
      workerJobId: lease.jobId,
      eventType,
      attemptId: lease.attemptId,
      eventIdempotencyKey: `${eventType.toLowerCase()}:${lease.attemptId}:${JSON.stringify(payload)}`,
      payloadJson: payload,
    });
  });
}

async function assertLeaseAttempt(
  repo: TxRepo,
  lease: LeaseContext,
  job: WorkerJob | null,
): Promise<void> {
  if (!job) throw new JobControlPlaneError("JOB_LEASE_STALE", "Job lease is no longer active");
  const attempt = await repo.findAttempt(job.id, job.attempt);
  if (!attempt || attempt.id !== lease.attemptId || attempt.leaseGeneration !== lease.fencingVersion) {
    throw new JobControlPlaneError("JOB_LEASE_STALE", "Job attempt lease is no longer active");
  }
}

export function isRetryableError(error: unknown): boolean {
  const code = error instanceof Error ? error.name : "";
  return ["TimeoutError", "AbortError", "ECONNRESET", "ETIMEDOUT"].includes(code);
}

export function calculateRetryDelay(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 900_000,
  jitter: "none" | "bounded" | "recorded" = "none",
  seed = "",
): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || !Number.isFinite(baseDelayMs) || baseDelayMs < 0 || !Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) {
    throw new JobControlPlaneError("RETRY_POLICY_INVALID", "Retry delay policy is invalid");
  }
  if (jitter !== "none" && jitter !== "bounded" && jitter !== "recorded") throw new JobControlPlaneError("RETRY_POLICY_INVALID", "Retry jitter policy is invalid");
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  if (jitter === "none" || exponential === 0) return exponential;
  const digest = createHash("sha256").update(`${seed}:${attempt}`, "utf8").digest();
  const fraction = digest.readUInt32BE(0) / 0xffffffff;
  return Math.min(maxDelayMs, Math.round(exponential * (1 + fraction * 0.25)));
}

export { canonicalizeJobDefinition, computeJobDefinitionHash, redactJobPayload, validateJobDefinition, normalizeIdempotencyKey };
