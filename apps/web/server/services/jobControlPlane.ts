import { createHash, randomUUID } from "node:crypto";

import { and, eq, isNull, or, sql } from "drizzle-orm";

import { db, getDb } from "../db";
import {
  workerJobAttempts,
  workerJobActions,
  workerJobCallbacks,
  workerJobEvents,
  workerJobOutbox,
  workerJobScheduleOccurrences,
  workerJobSettlements,
  workerJobDispatches,
  workerJobProviderReservations,
  workerJobs,
  tenantIdentityActions,
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
  assertCanonicalJobTransition,
  assertCanonicalLeaseFence,
  type ClassifiedJobError,
  type JobDefinition,
  type JobRef,
  type JobResult,
  type LeaseContext,
  type ExternalWait,
  type ProgressUpdate,
  type AuthenticatedJobCallback,
} from "./jobControlPlaneTypes";
import { CONTENT_PROTECTION_RUNTIME_TYPE } from "../../shared/contentProtectionWorker";

const DEFAULT_LEASE_DURATION_MS: Record<string, number> = {
  short: 90_000,
  long: 180_000,
  external: 60_000,
  cpu: 120_000,
  gpu: 180_000,
  scheduled: 60_000,
};

export function leaseDurationMs(executionClass: string): number {
  const configured = Number(
    process.env[`FEATURE_186_LEASE_${executionClass.toUpperCase()}_MS`]
  );
  if (
    Number.isFinite(configured) &&
    configured >= 10_000 &&
    configured <= 15 * 60_000
  )
    return configured;
  return (
    DEFAULT_LEASE_DURATION_MS[executionClass] ?? DEFAULT_LEASE_DURATION_MS.short
  );
}
export type TxRepo = {
  findJob(jobId: string): Promise<WorkerJob | null>;
  findByIdempotency(
    tenantId: string,
    idempotencyKey: string
  ): Promise<WorkerJob | null>;
  /** Serialize admission decisions so per-tenant/class limits are atomic. */
  lockAdmission?(tenantId: string, executionClass: string): Promise<void>;
  countActiveJobs?(input: {
    tenantId: string;
    executionClass: string;
  }): Promise<number>;
  countActiveJobsGlobal?(executionClass: string): Promise<number>;
  /** Prevent new user-owned work while a tenant transfer owns the source fence. */
  assertNoActiveTenantTransfer?(input: {
    tenantId: string;
    userId: number;
  }): Promise<void>;
  findScheduleOccurrence?(input: {
    tenantId: string;
    scheduleId: string;
    occurrenceKey: string;
  }): Promise<{ workerJobId: string; definitionHash: string } | null>;
  findAttempt(
    jobId: string,
    attempt: number
  ): Promise<{ id: string; leaseGeneration: number } | null>;
  findAttemptDetails?(
    jobId: string,
    attempt: number
  ): Promise<{
    id: string;
    leaseGeneration: number;
    runnerId: string | null;
  } | null>;
  markDispatchConsumed?(input: {
    jobId: string;
    attemptId?: string;
    adapter: string;
    consumedAt: Date;
  }): Promise<void>;
  findEventByIdempotency(
    jobId: string,
    key: string
  ): Promise<{ eventType: string } | null>;
  findAction(actionId: string): Promise<{
    workerJobId: string;
    command: string;
    reason: string;
    outcomeJson: Record<string, unknown>;
  } | null>;
  insertAction(values: Record<string, unknown>): Promise<void>;
  updateAction(
    actionId: string,
    values: Record<string, unknown>
  ): Promise<void>;
  findCallback(input: {
    adapterNamespace: string;
    providerEventId?: string;
    replayKey?: string;
  }): Promise<{ disposition: string } | null>;
  insertCallback(values: Record<string, unknown>): Promise<boolean>;
  insertJob(values: Record<string, unknown>): Promise<WorkerJob | null>;
  updateJob(input: {
    jobId: string;
    expectedStatus: string;
    expectedTenantId?: string;
    expectedRequestedByUserId?: number;
    expectedAttempt?: number;
    expectedLeaseHash?: string;
    expectedFencingVersion?: number;
    /** Only controlled, audited recovery commands may reopen a terminal job. */
    allowTerminalRecovery?: boolean;
    values: Record<string, unknown>;
  }): Promise<WorkerJob | null>;
  insertAttempt(values: Record<string, unknown>): Promise<void>;
  updateAttempt(input: {
    attemptId: string;
    values: Record<string, unknown>;
  }): Promise<void>;
  insertSettlement(values: Record<string, unknown>): Promise<void>;
  insertEvent(input: {
    workerJobId: string;
    eventType: string;
    attemptId?: string;
    payloadJson?: Record<string, unknown>;
    eventIdempotencyKey: string;
  }): Promise<void>;
  insertOutbox(values: Record<string, unknown>): Promise<void>;
  insertScheduleOccurrence?(values: Record<string, unknown>): Promise<boolean>;
  findOutboxForAttempt(
    jobId: string,
    attemptId?: string
  ): Promise<{
    id: string;
    publishedAt: Date | null;
    cancelledAt: Date | null;
    quarantinedAt: Date | null;
    operatorReviewReason?: string | null;
  } | null>;
  resetOutbox(input: { id: string; nextAttemptAt: Date }): Promise<void>;
  cancelUnpublishedOutbox(input: {
    jobId: string;
    reason: string;
    cancelledAt: Date;
  }): Promise<void>;
  /** Fences provider-poller settlement against a newer poller lease. */
  assertProviderPollLease?(input: {
    operationKey: string;
    pollerLeaseTokenHash: string;
  }): Promise<boolean>;
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

/** Event keys are persisted in varchar(200). Hash variable-sized inputs while
 * retaining a stable, collision-resistant idempotency identity. */
function boundedEventKey(
  prefix: string,
  ...parts: Array<string | number | undefined>
): string {
  const raw = [prefix, ...parts.map(value => String(value ?? ""))].join(":");
  if (raw.length <= 200) return raw;
  const digest = createHash("sha256").update(raw, "utf8").digest("hex");
  return `${prefix.slice(0, 120)}:sha256:${digest}`.slice(0, 200);
}

/** Action IDs are persisted and embedded in lifecycle-event idempotency keys. */
function validateActionId(actionId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(actionId)) {
    throw new JobControlPlaneError(
      "JOB_ACTION_INVALID",
      "Action identifier is invalid"
    );
  }
}

const KNOWN_JOB_ADAPTERS = new Set([
  "postgres-pull",
  "postgres-direct",
  "bullmq",
  "celery",
  "cloudflare",
  "cloudflare-queues",
  "cloudflare-workflows",
  "cloudflare-containers",
  "cloudflare-worker-app",
]);

function assertClaimAdapterCompatible(
  runtimeType: string | null | undefined,
  adapter: string
): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(adapter)) {
    throw new JobControlPlaneError(
      "JOB_ADAPTER_INVALID",
      "Job adapter identity is invalid"
    );
  }
  // Unit repositories use a synthetic adapter; production claims must use a
  // server-registered transport identity so a caller cannot self-select a
  // runtime by sending an arbitrary adapter string.
  if (!KNOWN_JOB_ADAPTERS.has(adapter)) {
    if (process.env.NODE_ENV === "test" && adapter === "test") return;
    throw new JobControlPlaneError(
      "JOB_ADAPTER_INVALID",
      "Job adapter is not registered"
    );
  }
  if (!runtimeType) return;
  const allowed =
    runtimeType === "python_job_worker"
      ? new Set([
          "postgres-pull",
          "cloudflare",
          "cloudflare-queues",
          "cloudflare-workflows",
          "cloudflare-containers",
          "cloudflare-worker-app",
        ])
      : runtimeType === "node_job_worker" || runtimeType === "external_runtime"
        ? new Set([
            "postgres-pull",
            "postgres-direct",
            "bullmq",
            "cloudflare",
            "cloudflare-queues",
            "cloudflare-workflows",
            "cloudflare-containers",
            "cloudflare-worker-app",
          ])
        : null;
  if (allowed && !allowed.has(adapter)) {
    throw new JobControlPlaneError(
      "JOB_ADAPTER_RUNTIME_MISMATCH",
      "Adapter is not permitted for the job runtime"
    );
  }
}

export function canonicalizeStoredStatus(status: string): string {
  switch (status) {
    case "claimed":
      return "leased";
    case "preparing":
    case "uploading":
    case "publishing":
    case "indexing":
      return "running";
    case "completed":
      return "succeeded";
    case "canceled":
      return "cancelled";
    default:
      return status;
  }
}

export function compatibilityStatus(status: string): string {
  switch (canonicalizeStoredStatus(status)) {
    case "leased":
      return "claimed";
    case "running":
    case "waiting_external":
      return "running";
    case "retry_scheduled":
      return "queued";
    case "succeeded":
      return "completed";
    case "cancelled":
      return "canceled";
    case "pending":
      return "queued";
    default:
      return canonicalizeStoredStatus(status);
  }
}

type JobDependencyCheck =
  | { state: "ready" }
  | { state: "waiting" }
  | { state: "failed"; reason: string };

function readJobDependencyIds(
  inputJson: unknown
): { ids: string[]; invalid: false } | { ids: []; invalid: true } {
  if (!inputJson || typeof inputJson !== "object" || Array.isArray(inputJson)) {
    return { ids: [], invalid: true };
  }
  const orchestration = (inputJson as Record<string, unknown>).orchestration;
  if (orchestration === undefined) return { ids: [], invalid: false };
  if (
    !orchestration ||
    typeof orchestration !== "object" ||
    Array.isArray(orchestration)
  ) {
    return { ids: [], invalid: true };
  }
  const rawIds = (orchestration as Record<string, unknown>).dependsOnJobIds;
  if (rawIds === undefined) return { ids: [], invalid: false };
  if (!Array.isArray(rawIds)) return { ids: [], invalid: true };
  const ids = rawIds.map(value =>
    typeof value === "string" ? value.trim() : ""
  );
  if (ids.some(id => !/^[a-zA-Z0-9_-]{1,36}$/.test(id))) {
    return { ids: [], invalid: true };
  }
  return { ids: Array.from(new Set(ids)), invalid: false };
}

async function checkJobDependencies(
  repo: TxRepo,
  job: WorkerJob
): Promise<JobDependencyCheck> {
  const parsed = readJobDependencyIds(job.inputJson);
  if (parsed.invalid)
    return { state: "failed", reason: "dependency_contract_invalid" };
  if (parsed.ids.length === 0) return { state: "ready" };
  if (parsed.ids.includes(job.id))
    return { state: "failed", reason: "dependency_cycle" };

  const dependencies = await Promise.all(
    parsed.ids.map(dependencyId => repo.findJob(dependencyId))
  );
  if (dependencies.some(dependency => !dependency)) {
    return { state: "failed", reason: "dependency_missing" };
  }
  if (
    dependencies.some(dependency => {
      const status = canonicalizeStoredStatus(dependency!.status);
      return ["failed", "cancelled", "expired"].includes(status);
    })
  ) {
    return { state: "failed", reason: "dependency_failed" };
  }
  return dependencies.every(
    dependency => canonicalizeStoredStatus(dependency!.status) === "succeeded"
  )
    ? { state: "ready" }
    : { state: "waiting" };
}

/**
 * Error text is operational metadata, not a log sink. Keep it useful for
 * operators while preventing credentials and control characters from
 * entering the canonical row, event payloads, or admin API.
 */
export function sanitizeJobErrorMessage(
  value: string,
  maxLength = 2000,
  fallback = "unknown_error"
): string {
  const sanitized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/(bearer\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(
      /((?:authorization|api[_-]?key|token|password|secret|credential)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]"
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return sanitized || fallback;
}

/**
 * Canonical result references must point to durable managed data or a stable
 * domain reference. Expiring/signed URLs and credential-bearing references
 * cannot be used as job identity or durable result state.
 */
export function normalizeResultReference(
  value: string | undefined
): string | null {
  if (value === undefined) return null;
  const reference = value.trim();
  if (
    !reference ||
    reference.length > 2000 ||
    /[\u0000-\u001f\u007f\s]/.test(reference)
  ) {
    throw new JobControlPlaneError(
      "JOB_RESULT_INVALID",
      "Result reference is invalid"
    );
  }
  if (
    /^(?:data|javascript|file):/i.test(reference) ||
    /(?:authorization|api[_-]?key|token|password|secret|credential)\s*=/i.test(
      reference
    )
  ) {
    throw new JobControlPlaneError(
      "JOB_RESULT_INVALID",
      "Result reference is not a durable managed reference"
    );
  }
  try {
    const url = new URL(reference);
    if (url.username || url.password || url.search || url.hash) {
      throw new JobControlPlaneError(
        "JOB_RESULT_INVALID",
        "Signed or credential-bearing result URLs are not allowed"
      );
    }
    if (
      reference.includes("://") &&
      !["http:", "https:"].includes(url.protocol)
    ) {
      throw new JobControlPlaneError(
        "JOB_RESULT_INVALID",
        "Result reference scheme is invalid"
      );
    }
  } catch (error) {
    if (error instanceof JobControlPlaneError) throw error;
    // Opaque managed references such as artifact:123 are valid. URL syntax
    // errors only matter for values that clearly advertise a URL scheme.
    if (
      /^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference) &&
      !/^[A-Za-z][A-Za-z0-9+.-]*:\S+$/.test(reference)
    ) {
      throw new JobControlPlaneError(
        "JOB_RESULT_INVALID",
        "Result reference is invalid"
      );
    }
  }
  return reference;
}

function isRetryableTransactionError(error: unknown): boolean {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "40001" || code === "40P01" || code === "55P03";
}

function transactionRetryCount(): number {
  const configured = Number(process.env.FEATURE_186_DB_TX_RETRIES ?? 3);
  return Number.isInteger(configured)
    ? Math.max(1, Math.min(configured, 5))
    : 3;
}

async function retryDelay(attempt: number): Promise<void> {
  await new Promise(resolve =>
    setTimeout(resolve, Math.min(250, 10 * 2 ** attempt))
  );
}

function buildDefaultRepository(): JobControlPlaneRepository {
  return {
    async transaction(work) {
      getDb();
      const maxAttempts = transactionRetryCount();
      for (
        let transactionAttempt = 0;
        transactionAttempt < maxAttempts;
        transactionAttempt += 1
      ) {
        try {
          return await db.transaction(async tx => {
            const query = tx as any;
            const repo: TxRepo = {
              async findJob(jobId) {
                const [row] = await query
                  .select()
                  .from(workerJobs)
                  .where(eq(workerJobs.id, jobId))
                  .limit(1);
                return row ?? null;
              },
              async findByIdempotency(tenantId, idempotencyKey) {
                const [row] = await query
                  .select()
                  .from(workerJobs)
                  .where(
                    and(
                      eq(workerJobs.tenantId, tenantId),
                      eq(workerJobs.idempotencyKey, idempotencyKey)
                    )
                  )
                  .limit(1);
                return row ?? null;
              },
              async lockAdmission(tenantId, executionClass) {
                // The global class lock is acquired before the tenant lock in
                // every transaction. This keeps both limits race-free without
                // introducing an opposing lock order between callers.
                await query.execute(
                  sql`SELECT pg_advisory_xact_lock(hashtextextended(${`feature-186-admission:global:${executionClass}`}, 0))`
                );
                await query.execute(
                  sql`SELECT pg_advisory_xact_lock(hashtextextended(${`feature-186-admission:tenant:${tenantId}:${executionClass}`}, 0))`
                );
              },
              async countActiveJobs({ tenantId, executionClass }) {
                const rows = await query.execute(sql`
              SELECT COUNT(*)::int AS "count"
              FROM "worker_jobs"
              WHERE "tenantId" = ${tenantId}
                AND "executionClass" = ${executionClass}
                AND "status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing')
            `);
                return Number(rows[0]?.count ?? 0);
              },
              async countActiveJobsGlobal(executionClass) {
                const rows = await query.execute(sql`
              SELECT COUNT(*)::int AS "count"
              FROM "worker_jobs"
              WHERE "executionClass" = ${executionClass}
                AND "status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing')
            `);
                return Number(rows[0]?.count ?? 0);
              },
              async assertNoActiveTenantTransfer({ tenantId, userId }) {
                // Approval locks this same source-user row before it creates the
                // transfer plan. Taking the row lock here closes the race where a
                // new user-owned job could pass the plan check immediately before
                // approval commits its fence.
                await query.execute(
                  sql`SELECT 1 FROM "users" WHERE "id" = ${userId} FOR UPDATE`
                );
                const rows = await query.execute(sql`
              SELECT 1
              FROM "tenant_data_transfer_plans" p
              INNER JOIN "worker_jobs" j ON j."id" = p."operationId"
              WHERE p."tenantId" = ${tenantId}
                AND p."sourceUserId" = ${userId}
                AND j."status" NOT IN ('succeeded', 'failed', 'cancelled', 'canceled', 'expired')
              LIMIT 1
            `);
                if (rows.length > 0) {
                  throw new JobControlPlaneError(
                    "TRANSFER_IN_PROGRESS",
                    "User has an active tenant transfer"
                  );
                }
                const identityFence = await query
                  .select({ id: tenantIdentityActions.id })
                  .from(tenantIdentityActions)
                  .where(
                    and(
                      eq(tenantIdentityActions.userId, userId),
                      sql`"sourceTenantId" = ${tenantId}`,
                      sql`"phase" IN ('pending', 'open', 'fenced', 'executing', 'paused')`
                    )
                  )
                  .limit(1);
                if (identityFence.length > 0) {
                  throw new JobControlPlaneError(
                    "TRANSFER_IN_PROGRESS",
                    "User has an active tenant identity move"
                  );
                }
              },
              async findScheduleOccurrence({
                tenantId,
                scheduleId,
                occurrenceKey,
              }) {
                const [row] = await query
                  .select({
                    workerJobId: workerJobScheduleOccurrences.workerJobId,
                    definitionHash: workerJobScheduleOccurrences.definitionHash,
                  })
                  .from(workerJobScheduleOccurrences)
                  .where(
                    and(
                      eq(workerJobScheduleOccurrences.tenantId, tenantId),
                      eq(workerJobScheduleOccurrences.scheduleId, scheduleId),
                      eq(
                        workerJobScheduleOccurrences.occurrenceKey,
                        occurrenceKey
                      )
                    )
                  )
                  .limit(1);
                return row ?? null;
              },
              async findAttempt(jobId, attempt) {
                const [row] = await query
                  .select({
                    id: workerJobAttempts.id,
                    leaseGeneration: workerJobAttempts.leaseGeneration,
                  })
                  .from(workerJobAttempts)
                  .where(
                    and(
                      eq(workerJobAttempts.workerJobId, jobId),
                      eq(workerJobAttempts.attempt, attempt)
                    )
                  )
                  .limit(1);
                return row ?? null;
              },
              async findAttemptDetails(jobId, attempt) {
                const [row] = await query
                  .select({
                    id: workerJobAttempts.id,
                    leaseGeneration: workerJobAttempts.leaseGeneration,
                    runnerId: workerJobAttempts.runnerId,
                  })
                  .from(workerJobAttempts)
                  .where(
                    and(
                      eq(workerJobAttempts.workerJobId, jobId),
                      eq(workerJobAttempts.attempt, attempt)
                    )
                  )
                  .limit(1);
                return row ?? null;
              },
              async markDispatchConsumed({
                jobId,
                attemptId,
                adapter,
                consumedAt,
              }) {
                const conditions = [
                  eq(workerJobDispatches.workerJobId, jobId),
                  eq(workerJobDispatches.adapter, adapter),
                  isNull(workerJobDispatches.consumedAt),
                ];
                if (attemptId) {
                  conditions.push(
                    or(
                      eq(workerJobDispatches.attemptId, attemptId),
                      isNull(workerJobDispatches.attemptId)
                    ) as any
                  );
                }
                await query
                  .update(workerJobDispatches)
                  .set({
                    consumedAt,
                    publicationStatus: "consumed",
                  })
                  .where(and(...conditions));
              },
              async findEventByIdempotency(jobId, key) {
                const [row] = await query
                  .select({ eventType: workerJobEvents.eventType })
                  .from(workerJobEvents)
                  .where(
                    and(
                      eq(workerJobEvents.workerJobId, jobId),
                      eq(workerJobEvents.eventIdempotencyKey, key)
                    )
                  )
                  .limit(1);
                return row ?? null;
              },
              async findAction(actionId) {
                const [row] = await query
                  .select({
                    workerJobId: workerJobActions.workerJobId,
                    command: workerJobActions.command,
                    reason: workerJobActions.reason,
                    outcomeJson: workerJobActions.outcomeJson,
                  })
                  .from(workerJobActions)
                  .where(eq(workerJobActions.actionId, actionId))
                  .limit(1);
                return row ?? null;
              },
              async insertAction(values) {
                await query
                  .insert(workerJobActions)
                  .values(values)
                  .onConflictDoNothing();
              },
              async updateAction(actionId, values) {
                await query
                  .update(workerJobActions)
                  .set(values)
                  .where(eq(workerJobActions.actionId, actionId));
              },
              async findCallback(input) {
                const predicates = [
                  eq(
                    workerJobCallbacks.adapterNamespace,
                    input.adapterNamespace
                  ),
                ];
                if (input.providerEventId)
                  predicates.push(
                    eq(
                      workerJobCallbacks.providerEventId,
                      input.providerEventId
                    )
                  );
                else if (input.replayKey)
                  predicates.push(
                    eq(workerJobCallbacks.replayKey, input.replayKey)
                  );
                else return null;
                const [row] = await query
                  .select({ disposition: workerJobCallbacks.disposition })
                  .from(workerJobCallbacks)
                  .where(and(...predicates))
                  .limit(1);
                return row ?? null;
              },
              async insertCallback(values) {
                const rows = await query
                  .insert(workerJobCallbacks)
                  .values(values)
                  .onConflictDoNothing()
                  .returning({ id: workerJobCallbacks.id });
                return rows.length > 0;
              },
              async insertJob(values) {
                const [row] = await query
                  .insert(workerJobs)
                  .values(values)
                  .returning();
                return row ?? null;
              },
              async updateJob(input) {
                const requestedStatus = input.values.status;
                if (typeof requestedStatus === "string") {
                  // Keep the transition invariant at the repository boundary so
                  // non-lease recovery/operator paths cannot bypass the shared
                  // lifecycle table. The sole exception is an explicit,
                  // action-audited terminal recovery command; ordinary callers
                  // still cannot reopen failed jobs.
                  const terminalRecovery =
                    input.allowTerminalRecovery === true &&
                    canonicalizeStoredStatus(input.expectedStatus) ===
                      "failed" &&
                    canonicalizeStoredStatus(requestedStatus) === "queued";
                  if (!terminalRecovery) {
                    assertCanonicalJobTransition(
                      canonicalizeStoredStatus(input.expectedStatus),
                      canonicalizeStoredStatus(requestedStatus)
                    );
                  }
                }
                const conditions = [
                  eq(workerJobs.id, input.jobId),
                  eq(workerJobs.status, input.expectedStatus as any),
                ];
                if (input.expectedTenantId !== undefined)
                  conditions.push(
                    eq(workerJobs.tenantId, input.expectedTenantId)
                  );
                if (input.expectedRequestedByUserId !== undefined)
                  conditions.push(
                    eq(
                      workerJobs.requestedByUserId,
                      input.expectedRequestedByUserId
                    )
                  );
                if (input.expectedAttempt !== undefined)
                  conditions.push(
                    eq(workerJobs.attempt, input.expectedAttempt)
                  );
                if (input.expectedLeaseHash !== undefined)
                  conditions.push(
                    eq(workerJobs.leaseOwnerToken, input.expectedLeaseHash)
                  );
                if (input.expectedFencingVersion !== undefined)
                  conditions.push(
                    eq(workerJobs.fencingVersion, input.expectedFencingVersion)
                  );
                const [row] = await query
                  .update(workerJobs)
                  .set(input.values)
                  .where(and(...conditions))
                  .returning();
                return row ?? null;
              },
              async insertAttempt(values) {
                await query.insert(workerJobAttempts).values(values);
              },
              async updateAttempt({ attemptId, values }) {
                await query
                  .update(workerJobAttempts)
                  .set(values)
                  .where(eq(workerJobAttempts.id, attemptId));
              },
              async insertSettlement(values) {
                await query
                  .insert(workerJobSettlements)
                  .values(values)
                  .onConflictDoNothing();
              },
              async insertEvent(input) {
                await appendJobEvent(query, input);
              },
              async insertOutbox(values) {
                await query.insert(workerJobOutbox).values(values);
              },
              async insertScheduleOccurrence(values) {
                const rows = await query
                  .insert(workerJobScheduleOccurrences)
                  .values(values)
                  .onConflictDoNothing()
                  .returning({ id: workerJobScheduleOccurrences.id });
                return rows.length > 0;
              },
              async findOutboxForAttempt(jobId, attemptId) {
                const conditions = [eq(workerJobOutbox.workerJobId, jobId)];
                if (attemptId)
                  conditions.push(eq(workerJobOutbox.attemptId, attemptId));
                const [row] = await query
                  .select({
                    id: workerJobOutbox.id,
                    publishedAt: workerJobOutbox.publishedAt,
                    cancelledAt: workerJobOutbox.cancelledAt,
                    quarantinedAt: workerJobOutbox.quarantinedAt,
                    operatorReviewReason: workerJobOutbox.operatorReviewReason,
                  })
                  .from(workerJobOutbox)
                  .where(and(...conditions))
                  .orderBy(sql`${workerJobOutbox.createdAt} DESC`)
                  .limit(1);
                return row ?? null;
              },
              async resetOutbox({ id, nextAttemptAt }) {
                await query
                  .update(workerJobOutbox)
                  .set({
                    nextAttemptAt,
                    cancelledAt: null,
                    quarantinedAt: null,
                    failedReason: null,
                    operatorReviewReason: null,
                    publisherLeaseTokenHash: null,
                    publisherLeaseExpiresAt: null,
                    updatedAt: nextAttemptAt,
                  })
                  .where(eq(workerJobOutbox.id, id));
              },
              async cancelUnpublishedOutbox({ jobId, reason, cancelledAt }) {
                await query
                  .update(workerJobOutbox)
                  .set({
                    cancelledAt,
                    failedReason: reason,
                    operatorReviewReason: null,
                    publisherLeaseTokenHash: null,
                    publisherLeaseExpiresAt: null,
                    updatedAt: cancelledAt,
                  })
                  .where(
                    and(
                      eq(workerJobOutbox.workerJobId, jobId),
                      isNull(workerJobOutbox.publishedAt),
                      isNull(workerJobOutbox.cancelledAt)
                    )
                  );
              },
              async assertProviderPollLease({
                operationKey,
                pollerLeaseTokenHash,
              }) {
                const rows = await query.execute(sql`
              SELECT 1
              FROM "worker_job_provider_reservations"
              WHERE "operationKey" = ${operationKey}
                AND "reservationStatus" = 'reserved'
                AND "pollerLeaseTokenHash" = ${pollerLeaseTokenHash}
              FOR UPDATE
            `);
                return rows.length > 0;
              },
            };
            return work(repo);
          });
        } catch (error) {
          if (
            !isRetryableTransactionError(error) ||
            transactionAttempt + 1 >= maxAttempts
          )
            throw error;
          await retryDelay(transactionAttempt);
        }
      }
      throw new Error("FEATURE_186_TRANSACTION_RETRY_EXHAUSTED");
    },
  };
}

export const defaultJobControlPlaneRepository = buildDefaultRepository();

function omitUndefinedEventValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefinedEventValues);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .map(([key, child]) => [key, omitUndefinedEventValues(child)])
  );
}

export async function appendJobEvent(
  query: any,
  input: {
    workerJobId: string;
    eventType: string;
    attemptId?: string;
    payloadJson?: Record<string, unknown>;
    eventIdempotencyKey: string;
  }
): Promise<void> {
  if (
    !input.eventType ||
    input.eventType.length > 100 ||
    !input.eventIdempotencyKey ||
    input.eventIdempotencyKey.length > 200
  ) {
    throw new JobControlPlaneError(
      "JOB_EVENT_INVALID",
      "Lifecycle event identity is invalid"
    );
  }
  const safePayload = omitUndefinedEventValues(
    input.payloadJson ?? {}
  ) as Record<string, unknown>;
  validateBoundedPayload(safePayload, "event.payload");
  await query.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${input.workerJobId}))`
  );
  const existingRows = await query.execute(sql`
    SELECT "eventType"
    FROM "worker_job_events"
    WHERE "workerJobId" = ${input.workerJobId}
      AND "eventIdempotencyKey" = ${input.eventIdempotencyKey}
    LIMIT 1
  `);
  const existingEventType = existingRows[0]?.eventType;
  if (existingEventType) {
    if (existingEventType !== input.eventType) {
      throw new JobControlPlaneError(
        "JOB_EVENT_IDEMPOTENCY_CONFLICT",
        "Event key was already used for another event type"
      );
    }
    return;
  }
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
    payloadJson: redactJobPayload(safePayload) as Record<string, unknown>,
  });
}

/**
 * Transaction port for feature-owned workflows that must create a canonical
 * job atomically with their own plan/checkpoint records. The caller supplies
 * the existing transaction; this port still owns canonical job defaults,
 * definition hashing, initial lifecycle events, and the dispatch outbox.
 */
export async function createCanonicalJobInTransaction(input: {
  query: any;
  definition: JobDefinition;
  options?: CreateJobOptions;
  createdPayload?: Record<string, unknown>;
  queuedPayload?: Record<string, unknown>;
  /**
   * Transfer approval preflights admission before taking its source-user
   * fence. This preserves the repository-wide global/class -> tenant -> user
   * lock order; all other callers use the default in-port check.
   */
  admissionAlreadyChecked?: boolean;
}): Promise<JobRef> {
  const normalizedDefinition =
    input.definition.idempotencyKey !== undefined
      ? {
          ...input.definition,
          idempotencyKey: normalizeIdempotencyKey(
            input.definition.idempotencyKey
          ),
        }
      : input.definition;
  validateJobDefinition(normalizedDefinition);
  const definitionHash = computeJobDefinitionHash(normalizedDefinition);
  const jobId = input.options?.canonicalJobId ?? randomUUID();
  if (!/^[a-zA-Z0-9_-]{1,36}$/.test(jobId)) {
    throw new JobControlPlaneError(
      "JOB_ID_INVALID",
      "Canonical job ID is invalid"
    );
  }
  const [collision] = await input.query
    .select({ id: workerJobs.id })
    .from(workerJobs)
    .where(eq(workerJobs.id, jobId))
    .limit(1);
  if (collision)
    throw new JobControlPlaneError(
      "JOB_ID_CONFLICT",
      "Canonical job ID is already bound to another job"
    );

  if (!input.admissionAlreadyChecked) {
    await enforceCanonicalJobAdmissionInTransaction(input.query, {
      tenantId: normalizedDefinition.tenantId,
      executionClass: normalizedDefinition.executionClass,
      admissionMode: input.options?.admissionMode,
    });
  }
  if (normalizedDefinition.requestedByUserId !== undefined) {
    await assertNoActiveTenantTransferInTransaction(input.query, {
      tenantId: normalizedDefinition.tenantId,
      userId: normalizedDefinition.requestedByUserId,
    });
  }

  const now = new Date();
  const [row] = await input.query
    .insert(workerJobs)
    .values({
      id: jobId,
      tenantId: normalizedDefinition.tenantId,
      requestedByUserId: normalizedDefinition.requestedByUserId ?? null,
      requestedBySystemComponent:
        input.options?.requestedBySystemComponent ?? null,
      workerId: input.options?.workerId ?? null,
      runtimeType: input.options?.runtimeType ?? "node_job_worker",
      jobType: normalizedDefinition.jobType,
      executionClass: normalizedDefinition.executionClass,
      contractVersion: normalizedDefinition.contractVersion,
      status: "queued",
      priority: normalizedDefinition.priority ?? 0,
      capabilityRequirementsJson:
        normalizedDefinition.requiredCapabilities ?? {},
      inputJson: normalizedDefinition.input,
      retryPolicyJson: normalizedDefinition.retryPolicy,
      timeoutPolicyJson: normalizedDefinition.timeoutPolicy,
      timeoutSeconds: Math.ceil(
        normalizedDefinition.timeoutPolicy.hardTimeoutMs / 1000
      ),
      idempotencyKey: normalizedDefinition.idempotencyKey ?? null,
      definitionHash,
      attempt: 1,
      maxAttempts: normalizedDefinition.retryPolicy.maxAttempts,
      progressJson: {},
      fencingVersion: 0,
      operatorReviewRequired: false,
      createdAt: now,
    })
    .returning({ id: workerJobs.id });
  if (!row)
    throw new JobControlPlaneError(
      "JOB_CREATE_FAILED",
      "Canonical job could not be created"
    );

  await appendJobEvent(input.query, {
    workerJobId: row.id,
    eventType: "CREATED",
    eventIdempotencyKey: `created:${row.id}`,
    payloadJson: input.createdPayload,
  });
  await appendJobEvent(input.query, {
    workerJobId: row.id,
    eventType: "QUEUED",
    eventIdempotencyKey: `queued:${row.id}`,
    payloadJson: input.queuedPayload,
  });
  await appendJobEvent(input.query, {
    workerJobId: row.id,
    eventType: "DISPATCH_REQUESTED",
    eventIdempotencyKey: `dispatch-requested:${row.id}:1`,
    payloadJson: { attempt: 1 },
  });
  await input.query.insert(workerJobOutbox).values({
    workerJobId: row.id,
    envelopeVersion: normalizedDefinition.contractVersion,
    envelopeJson: {
      jobId: row.id,
      businessAttempt: 1,
      contractVersion: normalizedDefinition.contractVersion,
      dedupeKey: `job:${row.id}:attempt:1`,
    },
    dedupeKey: `job:${row.id}:attempt:1`,
    nextAttemptAt: now,
  });
  return { jobId: row.id, created: true };
}

/**
 * Feature-specific transaction port for cancelling a queued job while another
 * control-plane operation owns the surrounding PostgreSQL transaction. This
 * keeps transfer approval from reimplementing lifecycle cancellation or
 * mutating worker_jobs directly. It intentionally accepts only queueable
 * states; active work must be handled by the ordinary fenced cancel command.
 */
export async function cancelQueuedJobInTransaction(input: {
  query: any;
  jobId: string;
  reason: string;
  actionId: string;
  actorId?: number;
  scope?: JobMutationScope;
}): Promise<"cancelled" | "ignored"> {
  validateActionId(input.actionId);
  const safeReason = sanitizeJobErrorMessage(
    input.reason,
    2000,
    "cancelled_by_request"
  );
  const [job] = await input.query
    .select()
    .from(workerJobs)
    .where(eq(workerJobs.id, input.jobId))
    .for("update")
    .limit(1);
  assertJobMutationScope(job ?? null, input.scope);
  if (!job)
    throw new JobControlPlaneError("JOB_NOT_FOUND", "Job was not found");
  if (job.status === "cancelled") return "ignored";
  if (["succeeded", "failed", "expired"].includes(job.status)) {
    throw new JobControlPlaneError(
      "JOB_STATE_CONFLICT",
      "Job cannot be cancelled in its current state"
    );
  }
  if (!["pending", "queued", "retry_scheduled"].includes(job.status)) {
    throw new JobControlPlaneError(
      "ACTIVE_JOB_BLOCKED",
      "Active canonical work must finish before it can be cancelled"
    );
  }

  const [existing] = await input.query
    .select()
    .from(workerJobActions)
    .where(eq(workerJobActions.actionId, input.actionId))
    .limit(1);
  if (
    existing &&
    (existing.workerJobId !== job.id ||
      existing.command !== "cancel" ||
      existing.reason !== safeReason.slice(0, 500))
  ) {
    throw new JobControlPlaneError(
      "IDEMPOTENCY_CONFLICT",
      "Action key was already used for another command or target"
    );
  }
  if (
    existing &&
    (existing.outcomeJson as Record<string, unknown>)?.accepted === true
  )
    return "ignored";
  if (!existing) {
    await input.query
      .insert(workerJobActions)
      .values({
        id: randomUUID(),
        actionId: input.actionId,
        workerJobId: job.id,
        command: "cancel",
        actorId: input.actorId ?? null,
        reason: safeReason.slice(0, 500),
        expectedStatus: job.status,
        expectedAttempt: job.attempt,
        expectedFencingVersion: job.fencingVersion,
        authorizationScope:
          input.scope?.authorizationScope ?? "feature-189-transfer",
        outcomeJson: {},
      })
      .onConflictDoNothing();
  }
  const [winner] = await input.query
    .select()
    .from(workerJobActions)
    .where(eq(workerJobActions.actionId, input.actionId))
    .limit(1);
  if (
    !winner ||
    winner.workerJobId !== job.id ||
    winner.command !== "cancel" ||
    winner.reason !== safeReason.slice(0, 500)
  ) {
    throw new JobControlPlaneError(
      "IDEMPOTENCY_CONFLICT",
      "Action key was already used for another command or target"
    );
  }

  const now = new Date();
  const updated = await input.query
    .update(workerJobs)
    .set({
      status: "cancelled",
      statusReason: safeReason,
      leaseOwnerToken: null,
      leaseExpiresAt: null,
      finishedAt: now,
    })
    .where(
      and(
        eq(workerJobs.id, job.id),
        eq(workerJobs.status, job.status),
        eq(workerJobs.attempt, job.attempt),
        eq(workerJobs.fencingVersion, job.fencingVersion)
      )
    )
    .returning({ id: workerJobs.id });
  if (updated.length === 0)
    throw new JobControlPlaneError(
      "JOB_STATE_CONFLICT",
      "Job changed while cancelling"
    );
  await input.query
    .update(workerJobOutbox)
    .set({
      cancelledAt: now,
      failedReason: `cancelled:${safeReason}`,
      publisherLeaseTokenHash: null,
      publisherLeaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(workerJobOutbox.workerJobId, job.id),
        isNull(workerJobOutbox.publishedAt),
        isNull(workerJobOutbox.cancelledAt)
      )
    );
  const [attempt] = await input.query
    .select({ id: workerJobAttempts.id })
    .from(workerJobAttempts)
    .where(
      and(
        eq(workerJobAttempts.workerJobId, job.id),
        eq(workerJobAttempts.attempt, job.attempt)
      )
    )
    .limit(1);
  if (attempt)
    await input.query
      .update(workerJobAttempts)
      .set({
        finishedAt: now,
        terminalClass: "cancelled",
        recoveryReason: safeReason.slice(0, 500),
      })
      .where(eq(workerJobAttempts.id, attempt.id));
  const keyPrefix = `operator:${input.actionId}`;
  await appendJobEvent(input.query, {
    workerJobId: job.id,
    eventType: "OPERATOR_ACTION",
    attemptId: attempt?.id,
    eventIdempotencyKey: `${keyPrefix}:action`,
    payloadJson: {
      action: "cancel",
      reason: safeReason.slice(0, 500),
      actorId: input.actorId,
      targetAttempt: job.attempt,
      targetStatus: job.status,
    },
  });
  await appendJobEvent(input.query, {
    workerJobId: job.id,
    eventType: "CANCEL_REQUESTED",
    attemptId: attempt?.id,
    eventIdempotencyKey: `${keyPrefix}:requested`,
    payloadJson: {
      reason: safeReason.slice(0, 500),
      actionId: input.actionId,
      actorId: input.actorId,
    },
  });
  await appendJobEvent(input.query, {
    workerJobId: job.id,
    eventType: "CANCELLED",
    attemptId: attempt?.id,
    eventIdempotencyKey: `${keyPrefix}:cancelled`,
    payloadJson: {
      reason: safeReason.slice(0, 500),
      actionId: input.actionId,
      actorId: input.actorId,
    },
  });
  await input.query
    .update(workerJobActions)
    .set({
      outcomeJson: { accepted: true, phase: "cancelled", jobId: job.id },
      effectiveAt: now,
    })
    .where(eq(workerJobActions.id, winner.id));
  return "cancelled";
}

/**
 * Feature-specific transaction port for resuming a transfer that was
 * deliberately paused behind an operator-review gate. The caller owns the
 * surrounding transaction/action record; this port owns the canonical job
 * transition, outbox settlement, and lifecycle evidence.
 */
export async function resumeReviewGatedJobInTransaction(input: {
  query: any;
  jobId: string;
  reason: string;
  actionId: string;
  expectedJobType?: string;
  scope?: JobMutationScope;
}): Promise<{ jobId: string; attempt: number; created: boolean }> {
  validateActionId(input.actionId);
  const safeReason = sanitizeJobErrorMessage(
    input.reason,
    500,
    "authorized_resume"
  );
  const [job] = await input.query
    .select()
    .from(workerJobs)
    .where(eq(workerJobs.id, input.jobId))
    .for("update")
    .limit(1);
  assertJobMutationScope(job ?? null, input.scope);
  if (!job)
    throw new JobControlPlaneError("JOB_NOT_FOUND", "Job was not found");
  if (input.expectedJobType && job.jobType !== input.expectedJobType) {
    throw new JobControlPlaneError(
      "JOB_STATE_CONFLICT",
      "Job type cannot be resumed by this command"
    );
  }
  if (job.status !== "retry_scheduled" || !job.operatorReviewRequired) {
    throw new JobControlPlaneError(
      "OPERATOR_REVIEW_REQUIRED",
      "Only a review-gated retry-scheduled job can be resumed"
    );
  }

  const now = new Date();
  const updated = await input.query
    .update(workerJobs)
    .set({
      status: "queued",
      nextRetryAt: null,
      operatorReviewRequired: false,
      operatorReviewReason: null,
      statusReason: `resumed:${input.actionId}`,
    })
    .where(
      and(
        eq(workerJobs.id, job.id),
        eq(workerJobs.status, "retry_scheduled"),
        eq(workerJobs.attempt, job.attempt),
        eq(workerJobs.fencingVersion, job.fencingVersion)
      )
    )
    .returning({ id: workerJobs.id });
  if (updated.length === 0)
    throw new JobControlPlaneError(
      "JOB_STATE_CONFLICT",
      "Job changed while resuming"
    );

  const [pendingOutbox] = await input.query
    .select({ id: workerJobOutbox.id })
    .from(workerJobOutbox)
    .where(
      and(
        eq(workerJobOutbox.workerJobId, job.id),
        isNull(workerJobOutbox.publishedAt),
        isNull(workerJobOutbox.cancelledAt)
      )
    )
    .orderBy(sql`${workerJobOutbox.createdAt} DESC`)
    .limit(1);
  if (pendingOutbox) {
    await input.query
      .update(workerJobOutbox)
      .set({
        nextAttemptAt: now,
        failedReason: null,
        operatorReviewReason: null,
        quarantinedAt: null,
        publisherLeaseTokenHash: null,
        publisherLeaseExpiresAt: null,
        updatedAt: now,
      })
      .where(eq(workerJobOutbox.id, pendingOutbox.id));
  } else {
    await input.query
      .insert(workerJobOutbox)
      .values({
        workerJobId: job.id,
        envelopeVersion: job.contractVersion,
        envelopeJson: {
          jobId: job.id,
          businessAttempt: job.attempt,
          contractVersion: job.contractVersion,
          reason: "authorized_resume",
          actionId: input.actionId,
        },
        dedupeKey: `job:${job.id}:attempt:${job.attempt}:resume:${input.actionId}`,
        nextAttemptAt: now,
      })
      .onConflictDoNothing();
  }

  const [attempt] = await input.query
    .select({ id: workerJobAttempts.id })
    .from(workerJobAttempts)
    .where(
      and(
        eq(workerJobAttempts.workerJobId, job.id),
        eq(workerJobAttempts.attempt, job.attempt)
      )
    )
    .limit(1);
  await appendJobEvent(input.query, {
    workerJobId: job.id,
    eventType: "RECOVERED",
    attemptId: attempt?.id,
    eventIdempotencyKey: `authorized-resume:${input.actionId}`,
    payloadJson: { actionId: input.actionId, reason: safeReason },
  });
  await appendJobEvent(input.query, {
    workerJobId: job.id,
    eventType: "DISPATCH_REQUESTED",
    attemptId: attempt?.id,
    eventIdempotencyKey: `dispatch-requested:authorized-resume:${input.actionId}`,
    payloadJson: {
      attempt: job.attempt,
      reason: safeReason,
      actionId: input.actionId,
    },
  });
  return { jobId: job.id, attempt: job.attempt, created: true };
}

async function prepareOperatorAction(
  repo: TxRepo,
  input: {
    actionId: string;
    jobId: string;
    command: "cancel" | "requeue" | "recover_checkpoint" | "force_fail";
    reason: string;
    actorId?: number;
    authorizationScope?: string;
    job: WorkerJob;
  }
): Promise<boolean> {
  validateActionId(input.actionId);
  const normalizedReason = sanitizeJobErrorMessage(
    input.reason,
    500,
    "unspecified"
  );
  const existing = await repo.findAction(input.actionId);
  if (existing) {
    if (
      existing.workerJobId !== input.jobId ||
      existing.command !== input.command ||
      existing.reason !== normalizedReason
    ) {
      throw new JobControlPlaneError(
        "IDEMPOTENCY_CONFLICT",
        "Action key was already used for another command or target"
      );
    }
    return false;
  }
  await repo.insertAction({
    id: randomUUID(),
    actionId: input.actionId,
    workerJobId: input.jobId,
    command: input.command,
    actorId: input.actorId ?? null,
    reason: normalizedReason,
    expectedStatus: input.job.status,
    expectedAttempt: input.job.attempt,
    expectedFencingVersion: input.job.fencingVersion,
    authorizationScope:
      input.authorizationScope ?? "job-control-plane.internal",
    outcomeJson: {},
  });
  // A concurrent transaction may have won the unique action key race.
  const inserted = await repo.findAction(input.actionId);
  if (
    inserted &&
    (inserted.workerJobId !== input.jobId ||
      inserted.command !== input.command ||
      inserted.reason !== normalizedReason)
  ) {
    throw new JobControlPlaneError(
      "IDEMPOTENCY_CONFLICT",
      "Action key was already used for another command or target"
    );
  }
  return true;
}

async function finishOperatorAction(
  repo: TxRepo,
  actionId: string,
  outcome: Record<string, unknown>
): Promise<void> {
  validateActionId(actionId);
  await repo.updateAction(actionId, {
    outcomeJson: redactJobPayload(outcome) as Record<string, unknown>,
    effectiveAt: new Date(),
  });
}

export type RecordJobCallbackResult = {
  disposition: "accepted" | "rejected" | "duplicate";
  callbackIdempotencyKey: string;
  originalDisposition?: "accepted" | "rejected";
};

function callbackReplayWindowMs(): number {
  const configured = Number(
    process.env.FEATURE_186_CALLBACK_REPLAY_WINDOW_SECONDS
  );
  const seconds = Number.isFinite(configured)
    ? Math.max(30, Math.min(configured, 86_400))
    : 900;
  return seconds * 1000;
}

/**
 * Persist callback evidence after the adapter has authenticated the request.
 * This function deliberately only records/reconciles evidence; it never
 * claims or completes a job from provider input.
 */
export async function recordAuthenticatedJobCallback(
  input: AuthenticatedJobCallback,
  repository: JobControlPlaneRepository = defaultJobControlPlaneRepository
): Promise<RecordJobCallbackResult> {
  if (!input.signatureVerified)
    throw new JobControlPlaneError(
      "CALLBACK_REJECTED",
      "Callback signature was not verified"
    );
  if (!input.adapterNamespace || input.adapterNamespace.length > 120)
    throw new JobControlPlaneError(
      "CALLBACK_INVALID",
      "Callback adapter namespace is invalid"
    );
  const providerEventId = input.providerEventId?.trim() || undefined;
  const replayKey = input.replayKey?.trim() || undefined;
  const callbackKey = providerEventId || replayKey;
  if (
    !callbackKey ||
    (providerEventId && replayKey) ||
    callbackKey.length > 255
  )
    throw new JobControlPlaneError(
      "CALLBACK_INVALID",
      "Callback requires exactly one bounded provider event or replay key"
    );
  const occurredAt = new Date(input.occurredAt);
  if (!Number.isFinite(occurredAt.getTime()))
    throw new JobControlPlaneError(
      "CALLBACK_INVALID",
      "Callback timestamp is invalid"
    );
  const ageMs = Date.now() - occurredAt.getTime();
  const clockSkewMs = 5 * 60 * 1000;
  if (ageMs > callbackReplayWindowMs() || ageMs < -clockSkewMs) {
    throw new JobControlPlaneError(
      "CALLBACK_REPLAY_WINDOW",
      "Callback timestamp is outside the accepted replay window"
    );
  }
  validateBoundedPayload(input.payload, "callback.payload");

  return repository.transaction(async repo => {
    const duplicate = await repo.findCallback({
      adapterNamespace: input.adapterNamespace,
      ...(providerEventId ? { providerEventId } : { replayKey }),
    });
    if (duplicate)
      return {
        disposition: "duplicate",
        originalDisposition:
          duplicate.disposition === "accepted" ||
          duplicate.disposition === "rejected"
            ? duplicate.disposition
            : undefined,
        callbackIdempotencyKey: `${input.adapterNamespace}:${callbackKey}`,
      };

    const job = input.jobId ? await repo.findJob(input.jobId) : null;
    const correlated = Boolean(
      job && (!input.tenantId || job.tenantId === input.tenantId)
    );
    const disposition = correlated ? "accepted" : "rejected";
    const inserted = await repo.insertCallback({
      id: randomUUID(),
      adapterNamespace: input.adapterNamespace,
      providerEventId: providerEventId ?? null,
      replayKey: replayKey ?? null,
      tenantId: correlated ? (job?.tenantId ?? null) : (input.tenantId ?? null),
      workerJobId: correlated ? (job?.id ?? null) : null,
      signatureVerified: true,
      disposition,
      payloadJson: redactJobPayload(input.payload) as Record<string, unknown>,
      occurredAt,
      observedAt: new Date(),
    });
    if (!inserted) {
      const raced = await repo.findCallback({
        adapterNamespace: input.adapterNamespace,
        ...(providerEventId ? { providerEventId } : { replayKey }),
      });
      return {
        disposition: "duplicate",
        originalDisposition:
          raced?.disposition === "accepted" || raced?.disposition === "rejected"
            ? raced.disposition
            : undefined,
        callbackIdempotencyKey: `${input.adapterNamespace}:${callbackKey}`,
      };
    }
    if (job && correlated) {
      await repo.insertEvent({
        workerJobId: job.id,
        eventType:
          disposition === "accepted"
            ? "CALLBACK_ACCEPTED"
            : "CALLBACK_REJECTED",
        eventIdempotencyKey: boundedEventKey(
          "callback",
          input.adapterNamespace,
          callbackKey
        ),
        payloadJson: { adapterNamespace: input.adapterNamespace, disposition },
      });
    }
    return {
      disposition,
      callbackIdempotencyKey: `${input.adapterNamespace}:${callbackKey}`,
    };
  });
}

export type CreateJobOptions = {
  runtimeType?: string;
  workerId?: string | null;
  requestedBySystemComponent?: string | null;
  /** Provider-backed work is accepted durably before a provider slot exists. */
  admissionMode?: "strict" | "durable_queue";
  /**
   * Internal migration hook for domain job records that already have a
   * durable UUID. It is never accepted from the public gateway payload.
   */
  canonicalJobId?: string;
};

export type JobMutationScope = {
  tenantId: string;
  requestedByUserId?: number;
  authorizationScope?: string;
};

const DEFAULT_ADMISSION_LIMITS: Record<
  string,
  { perTenant: number; global: number }
> = {
  short: { perTenant: 8, global: 64 },
  long: { perTenant: 4, global: 32 },
  external: { perTenant: 4, global: 16 },
  cpu: { perTenant: 2, global: 16 },
  gpu: { perTenant: 1, global: 8 },
  scheduled: { perTenant: 2, global: 16 },
};

function admissionLimit(
  executionClass: string,
  scope: "perTenant" | "global"
): number {
  const envName = `FEATURE_186_MAX_CONCURRENT_${scope === "perTenant" ? "PER_TENANT" : "GLOBAL"}_${executionClass.toUpperCase()}`;
  const configured = Number(process.env[envName]);
  if (Number.isInteger(configured) && configured > 0 && configured <= 100_000)
    return configured;
  return (
    DEFAULT_ADMISSION_LIMITS[executionClass]?.[scope] ??
    DEFAULT_ADMISSION_LIMITS.short[scope]
  );
}

async function enforceAdmission(
  repo: TxRepo,
  input: {
    tenantId: string;
    executionClass: string;
    admissionMode?: CreateJobOptions["admissionMode"];
  }
): Promise<void> {
  if (input.admissionMode === "durable_queue") return;
  // Test repositories can omit the database-specific admission methods. The
  // production repository always supplies them, so this remains a contract
  // seam rather than an in-memory source of truth.
  if (
    !repo.lockAdmission ||
    !repo.countActiveJobs ||
    !repo.countActiveJobsGlobal
  )
    return;
  await repo.lockAdmission(input.tenantId, input.executionClass);
  const tenantCount = await repo.countActiveJobs(input);
  const globalCount = await repo.countActiveJobsGlobal(input.executionClass);
  const tenantLimit = admissionLimit(input.executionClass, "perTenant");
  const globalLimit = admissionLimit(input.executionClass, "global");
  if (tenantCount >= tenantLimit || globalCount >= globalLimit) {
    throw new JobControlPlaneError(
      "JOB_ADMISSION_BACKPRESSURE",
      "Job admission capacity is temporarily exhausted",
      {
        executionClass: input.executionClass,
        tenantActive: tenantCount,
        tenantLimit,
        globalActive: globalCount,
        globalLimit,
      }
    );
  }
}

/**
 * The transaction-port variant of admission control. Feature-owned workflows
 * such as tenant transfer approval receive a raw Drizzle transaction rather
 * than the repository facade, so they must use the same database locks and
 * limits as the public create path.
 */
export async function enforceCanonicalJobAdmissionInTransaction(
  query: any,
  input: {
    tenantId: string;
    executionClass: string;
    admissionMode?: CreateJobOptions["admissionMode"];
  }
): Promise<void> {
  if (input.admissionMode === "durable_queue") return;
  await query.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`feature-186-admission:global:${input.executionClass}`}, 0))`
  );
  await query.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`feature-186-admission:tenant:${input.tenantId}:${input.executionClass}`}, 0))`
  );
  const tenantRows = await query.execute(sql`
    SELECT COUNT(*)::int AS "count"
    FROM "worker_jobs"
    WHERE "tenantId" = ${input.tenantId}
      AND "executionClass" = ${input.executionClass}
      AND "status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing')
  `);
  const globalRows = await query.execute(sql`
    SELECT COUNT(*)::int AS "count"
    FROM "worker_jobs"
    WHERE "executionClass" = ${input.executionClass}
      AND "status" IN ('pending', 'queued', 'leased', 'claimed', 'preparing', 'running', 'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing')
  `);
  const tenantActive = Number(tenantRows[0]?.count ?? 0);
  const globalActive = Number(globalRows[0]?.count ?? 0);
  const tenantLimit = admissionLimit(input.executionClass, "perTenant");
  const globalLimit = admissionLimit(input.executionClass, "global");
  if (tenantActive >= tenantLimit || globalActive >= globalLimit) {
    throw new JobControlPlaneError(
      "JOB_ADMISSION_BACKPRESSURE",
      "Job admission capacity is temporarily exhausted",
      {
        executionClass: input.executionClass,
        tenantActive,
        tenantLimit,
        globalActive,
        globalLimit,
      }
    );
  }
}

/**
 * Preserve the same source-user transfer fence when a feature-owned workflow
 * creates a job inside its own transaction. The row lock is intentionally
 * acquired after admission locks; normal Job Control Plane creates use the
 * same order through the repository implementation.
 */
async function assertNoActiveTenantTransferInTransaction(
  query: any,
  input: { tenantId: string; userId: number }
): Promise<void> {
  await query.execute(
    sql`SELECT 1 FROM "users" WHERE "id" = ${input.userId} FOR UPDATE`
  );
  const rows = await query.execute(sql`
    SELECT 1
    FROM "tenant_data_transfer_plans" p
    INNER JOIN "worker_jobs" j ON j."id" = p."operationId"
    WHERE p."tenantId" = ${input.tenantId}
      AND p."sourceUserId" = ${input.userId}
      AND j."status" NOT IN ('succeeded', 'failed', 'cancelled', 'canceled', 'expired')
    LIMIT 1
  `);
  if (rows.length > 0) {
    throw new JobControlPlaneError(
      "TRANSFER_IN_PROGRESS",
      "User has an active tenant transfer"
    );
  }
}

function assertJobMutationScope(
  job: WorkerJob | null,
  scope?: JobMutationScope
): void {
  if (!scope || !job) return;
  if (job.tenantId !== scope.tenantId) {
    throw new JobControlPlaneError(
      "JOB_NOT_FOUND",
      "Job is outside the authorized tenant scope"
    );
  }
  if (
    scope.requestedByUserId !== undefined &&
    job.requestedByUserId !== scope.requestedByUserId
  ) {
    throw new JobControlPlaneError(
      "JOB_NOT_FOUND",
      "Job is outside the authorized actor scope"
    );
  }
}

export type JobControlPlane = ReturnType<typeof createJobControlPlane>;

export type ComputerUseApprovalRequestInput = {
  tenantId: string;
  operationKey: string;
  approvalRequestId: string;
  runnerId: string;
  runnerSessionId: string;
  capabilitySnapshotId: string;
  capabilitySnapshotRevision: string;
  currentCommandId: string;
  actionId: string;
  semanticState: Record<string, unknown>;
};

export type ComputerUseApprovalDecisionInput = {
  jobId: string;
  tenantId: string;
  operationKey: string;
  approvalRequestId: string;
  decision: "approved" | "rejected";
  runnerId: string;
  adapter: string;
  actionId: string;
  runnerSessionId: string;
  fencingVersion: number;
  approverId: number;
};

export function createJobControlPlane(
  repository: JobControlPlaneRepository = defaultJobControlPlaneRepository
) {
  return {
    async getContext(jobId: string, scope?: JobMutationScope) {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job) return null;
        assertJobMutationScope(job, scope);
        return {
          jobId: job.id,
          tenantId: job.tenantId,
          requestedByUserId: job.requestedByUserId,
          jobType: job.jobType,
          executionClass: job.executionClass,
          contractVersion: job.contractVersion,
          input: job.inputJson ?? {},
          instructions: job.instructionsJson ?? {},
          requiredCapabilities: job.capabilityRequirementsJson ?? {},
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          timeoutSeconds: job.timeoutSeconds,
          timeoutPolicy: job.timeoutPolicyJson ?? {
            softTimeoutMs: 0,
            hardTimeoutMs: job.timeoutSeconds * 1000,
          },
          statusReason: job.statusReason,
        };
      });
    },

    /**
     * Return a bounded, transport-independent status snapshot. The raw lease
     * token and durable input are deliberately excluded; transport adapters
     * are reported by the caller from the dispatch ledger.
     */
    async getStatus(jobId: string, scope?: JobMutationScope) {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job) return null;
        assertJobMutationScope(job, scope);
        const attemptDetails = await repo.findAttemptDetails?.(
          job.id,
          job.attempt
        );
        const now = new Date();
        const canonicalStatus = canonicalizeStoredStatus(job.status);
        const hasLease = Boolean(
          job.leaseExpiresAt && job.leaseExpiresAt.getTime() > now.getTime()
        );
        const stale = Boolean(
          job.leaseExpiresAt &&
          job.leaseExpiresAt.getTime() <= now.getTime() &&
          ["leased", "running", "waiting_external"].includes(canonicalStatus)
        );
        return {
          jobId: job.id,
          tenantId: job.tenantId,
          jobType: job.jobType,
          executionClass: job.executionClass,
          contractVersion: job.contractVersion,
          status: canonicalStatus,
          compatibilityStatus: compatibilityStatus(job.status),
          attempt: job.attempt,
          maxAttempts: job.maxAttempts,
          nextRetryAt: job.nextRetryAt?.toISOString() ?? null,
          lease: {
            active: hasLease,
            stale,
            heartbeatAt: job.heartbeatAt?.toISOString() ?? null,
            expiresAt: job.leaseExpiresAt?.toISOString() ?? null,
            fencingVersion: job.fencingVersion,
            runnerId: attemptDetails?.runnerId ?? null,
          },
          operatorReviewRequired: job.operatorReviewRequired,
          operatorReviewReason: job.operatorReviewReason?.slice(0, 500) ?? null,
          errorCode: job.errorCode ?? null,
          errorMessage:
            (job.errorMessage ?? job.failureReason ?? job.statusReason)
              ? sanitizeJobErrorMessage(
                  job.errorMessage ??
                    job.failureReason ??
                    job.statusReason ??
                    "unknown_error"
                )
              : null,
          progress: redactJobPayload(job.progressJson ?? {}) as Record<
            string,
            unknown
          >,
          output: job.outputJson
            ? (redactJobPayload(job.outputJson) as Record<string, unknown>)
            : null,
          // Result references may be URLs for compatibility consumers. Apply
          // the same protected-reference redaction as payload/output fields;
          // status APIs must never turn a signed URL into durable API output.
          resultRef: job.resultRef ? redactJobPayload(job.resultRef) : null,
          terminal: ["succeeded", "failed", "cancelled", "expired"].includes(
            canonicalStatus
          ),
        };
      });
    },

    /**
     * Persist the reconciler's evidence-backed decision without changing the
     * lifecycle state. The event key is stable per attempt and reason, so a
     * periodic sweep can safely repeat the observation.
     */
    async recordReconciliation(input: {
      jobId: string;
      action: string;
      reasonCode: string;
      explanation: string;
      evidence?: Record<string, unknown>;
    }): Promise<"recorded" | "ignored"> {
      const action = sanitizeJobErrorMessage(input.action, 80, "inspect");
      const reasonCode = sanitizeJobErrorMessage(
        input.reasonCode,
        120,
        "unknown"
      );
      const explanation = sanitizeJobErrorMessage(
        input.explanation,
        500,
        "No reconciliation explanation"
      );
      if (input.evidence)
        validateBoundedPayload(input.evidence, "reconciliation.evidence");
      return repository.transaction(async repo => {
        const job = await repo.findJob(input.jobId);
        if (!job) return "ignored";
        await repo.insertEvent({
          workerJobId: job.id,
          eventType: "RECONCILED",
          attemptId: (await repo.findAttempt(job.id, job.attempt))?.id,
          eventIdempotencyKey: boundedEventKey(
            "reconcile",
            job.id,
            job.attempt,
            action,
            reasonCode
          ),
          payloadJson: {
            action,
            reasonCode,
            explanation,
            evidence: input.evidence ?? {},
          },
        });
        return "recorded";
      });
    },

    /**
     * Reject an envelope that cannot be executed without claiming a lease.
     * This is intentionally a terminal, operator-visible outcome so an
     * unsupported message cannot loop forever in the transport.
     */
    async rejectUnsupportedDelivery(input: {
      jobId: string;
      reason: string;
      contractVersion?: string;
    }): Promise<boolean> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(input.jobId);
        if (
          !job ||
          ["succeeded", "failed", "cancelled", "expired"].includes(job.status)
        )
          return false;
        const safeReason = sanitizeJobErrorMessage(
          input.reason,
          500,
          "unsupported_delivery"
        );
        const updated = await repo.updateJob({
          jobId: job.id,
          expectedStatus: job.status,
          expectedAttempt: job.attempt,
          values: {
            status: "failed",
            statusReason: `unsupported_delivery:${safeReason}`,
            errorCode: "UNSUPPORTED_JOB_CONTRACT",
            errorMessage: safeReason,
            operatorReviewRequired: true,
            operatorReviewReason: safeReason,
            finishedAt: new Date(),
          },
        });
        if (!updated) return false;
        await repo.insertEvent({
          workerJobId: job.id,
          eventType: "FAILED",
          eventIdempotencyKey: `unsupported-delivery:${job.id}:${job.attempt}:${input.contractVersion ?? "unknown"}`,
          payloadJson: {
            reason: safeReason,
            contractVersion: input.contractVersion ?? "unknown",
            source: "consumer",
          },
        });
        return true;
      });
    },

    async create(
      definition: JobDefinition,
      options: CreateJobOptions = {}
    ): Promise<JobRef> {
      const normalizedDefinition =
        definition.idempotencyKey !== undefined
          ? {
              ...definition,
              idempotencyKey: normalizeIdempotencyKey(
                definition.idempotencyKey
              ),
            }
          : definition;
      validateJobDefinition(normalizedDefinition);
      const definitionHash = computeJobDefinitionHash(normalizedDefinition);
      const createOnce = () =>
        repository.transaction(async repo => {
          if (normalizedDefinition.schedule && repo.findScheduleOccurrence) {
            const existingOccurrence = await repo.findScheduleOccurrence({
              tenantId: normalizedDefinition.tenantId,
              scheduleId: normalizedDefinition.schedule.scheduleId,
              occurrenceKey: normalizedDefinition.schedule.occurrenceKey,
            });
            if (existingOccurrence) {
              if (existingOccurrence.definitionHash !== definitionHash) {
                throw new JobControlPlaneError(
                  "IDEMPOTENCY_CONFLICT",
                  "Schedule occurrence was already used for another job definition"
                );
              }
              return { jobId: existingOccurrence.workerJobId, created: false };
            }
          }
          if (normalizedDefinition.idempotencyKey) {
            const existing = await repo.findByIdempotency(
              normalizedDefinition.tenantId,
              normalizedDefinition.idempotencyKey
            );
            if (existing) {
              if (existing.definitionHash !== definitionHash) {
                throw new JobControlPlaneError(
                  "IDEMPOTENCY_CONFLICT",
                  "Idempotency key was already used for another job definition"
                );
              }
              return { jobId: existing.id, created: false };
            }
          }

          const jobId = options.canonicalJobId ?? randomUUID();
          if (!/^[a-zA-Z0-9_-]{1,36}$/.test(jobId)) {
            throw new JobControlPlaneError(
              "JOB_ID_INVALID",
              "Canonical job ID is invalid"
            );
          }
          const canonicalIdCollision = await repo.findJob(jobId);
          if (canonicalIdCollision) {
            throw new JobControlPlaneError(
              "JOB_ID_CONFLICT",
              "Canonical job ID is already bound to another job"
            );
          }
          await enforceAdmission(repo, {
            tenantId: normalizedDefinition.tenantId,
            executionClass: normalizedDefinition.executionClass,
            admissionMode: options.admissionMode,
          });
          if (
            normalizedDefinition.requestedByUserId !== undefined &&
            repo.assertNoActiveTenantTransfer
          ) {
            await repo.assertNoActiveTenantTransfer({
              tenantId: normalizedDefinition.tenantId,
              userId: normalizedDefinition.requestedByUserId,
            });
          }
          const row = await repo.insertJob({
            id: jobId,
            tenantId: normalizedDefinition.tenantId,
            requestedByUserId: normalizedDefinition.requestedByUserId ?? null,
            requestedBySystemComponent:
              options.requestedBySystemComponent ?? null,
            workerId: options.workerId ?? null,
            runtimeType: options.runtimeType ?? "node_job_worker",
            jobType: normalizedDefinition.jobType,
            executionClass: normalizedDefinition.executionClass,
            contractVersion: normalizedDefinition.contractVersion,
            status: "queued",
            priority: normalizedDefinition.priority ?? 0,
            capabilityRequirementsJson:
              normalizedDefinition.requiredCapabilities ?? {},
            inputJson: normalizedDefinition.input,
            retryPolicyJson: normalizedDefinition.retryPolicy,
            timeoutPolicyJson: normalizedDefinition.timeoutPolicy,
            timeoutSeconds: Math.ceil(
              normalizedDefinition.timeoutPolicy.hardTimeoutMs / 1000
            ),
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
              const winner = await repo.findByIdempotency(
                normalizedDefinition.tenantId,
                normalizedDefinition.idempotencyKey
              );
              if (winner?.definitionHash === definitionHash)
                return { jobId: winner.id, created: false };
            }
            throw new JobControlPlaneError(
              "IDEMPOTENCY_CONFLICT",
              "Job creation lost an idempotency race"
            );
          }

          await repo.insertEvent({
            workerJobId: row.id,
            eventType: "CREATED",
            eventIdempotencyKey: `created:${row.id}`,
          });
          await repo.insertEvent({
            workerJobId: row.id,
            eventType: "QUEUED",
            eventIdempotencyKey: `queued:${row.id}`,
          });
          await repo.insertEvent({
            workerJobId: row.id,
            eventType: "DISPATCH_REQUESTED",
            eventIdempotencyKey: `dispatch-requested:${row.id}:1`,
            payloadJson: { attempt: 1 },
          });
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
          if (normalizedDefinition.schedule) {
            if (
              !repo.insertScheduleOccurrence ||
              !repo.findScheduleOccurrence
            ) {
              throw new JobControlPlaneError(
                "SCHEDULE_PERSISTENCE_UNAVAILABLE",
                "Scheduled job persistence is not available"
              );
            }
            const insertedOccurrence = await repo.insertScheduleOccurrence({
              tenantId: normalizedDefinition.tenantId,
              scheduleId: normalizedDefinition.schedule.scheduleId,
              occurrenceKey: normalizedDefinition.schedule.occurrenceKey,
              scheduleVersion: normalizedDefinition.schedule.scheduleVersion,
              timezone: normalizedDefinition.schedule.timezone,
              definitionHash,
              workerJobId: row.id,
            });
            if (!insertedOccurrence) {
              throw new JobControlPlaneError(
                "SCHEDULE_OCCURRENCE_RACE",
                "Schedule occurrence was created concurrently"
              );
            }
          }
          return { jobId: row.id, created: true };
        });
      try {
        return await createOnce();
      } catch (error) {
        if (
          (error as { code?: string })?.code === "SCHEDULE_OCCURRENCE_RACE" &&
          normalizedDefinition.schedule &&
          repository
        ) {
          return repository.transaction(async repo => {
            const winner = await repo.findScheduleOccurrence?.({
              tenantId: normalizedDefinition.tenantId,
              scheduleId: normalizedDefinition.schedule!.scheduleId,
              occurrenceKey: normalizedDefinition.schedule!.occurrenceKey,
            });
            if (!winner) throw error;
            if (winner.definitionHash !== definitionHash)
              throw new JobControlPlaneError(
                "IDEMPOTENCY_CONFLICT",
                "Schedule occurrence was already used for another job definition"
              );
            return { jobId: winner.workerJobId, created: false };
          });
        }
        if (
          !normalizedDefinition.idempotencyKey ||
          (error as { code?: string })?.code !== "23505"
        )
          throw error;
        return repository.transaction(async repo => {
          const winner = await repo.findByIdempotency(
            normalizedDefinition.tenantId,
            normalizedDefinition.idempotencyKey!
          );
          if (!winner) throw error;
          if (winner.definitionHash !== definitionHash)
            throw new JobControlPlaneError(
              "IDEMPOTENCY_CONFLICT",
              "Idempotency key was already used for another job definition"
            );
          return { jobId: winner.id, created: false };
        });
      }
    },

    async claim(input: {
      jobId: string;
      runnerId: string;
      adapter: string;
      attemptId?: string;
    }): Promise<LeaseContext | null> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(input.jobId);
        if (!job || job.status !== "queued") return null;
        assertClaimAdapterCompatible(job.runtimeType, input.adapter);
        const dependencyCheck = await checkJobDependencies(repo, job);
        if (dependencyCheck.state === "waiting") return null;
        if (dependencyCheck.state === "failed") {
          const updated = await repo.updateJob({
            jobId: job.id,
            expectedStatus: job.status,
            expectedAttempt: job.attempt,
            expectedFencingVersion: job.fencingVersion,
            values: {
              status: "failed",
              statusReason: dependencyCheck.reason,
              errorCode: "JOB_DEPENDENCY_BLOCKED",
              errorMessage:
                "A prerequisite Job could not complete successfully",
              operatorReviewRequired: true,
              operatorReviewReason: dependencyCheck.reason,
              finishedAt: new Date(),
            },
          });
          if (updated) {
            await repo.cancelUnpublishedOutbox({
              jobId: job.id,
              reason: dependencyCheck.reason,
              cancelledAt: new Date(),
            });
            await repo.insertEvent({
              workerJobId: job.id,
              eventType: "FAILED",
              eventIdempotencyKey: `dependency-failed:${job.id}:${job.attempt}:${dependencyCheck.reason}`,
              payloadJson: { reason: dependencyCheck.reason },
            });
          }
          return null;
        }
        if (job.attempt > job.maxAttempts) return null;
        const existingAttempt = await repo.findAttempt(job.id, job.attempt);
        if (
          input.attemptId &&
          (!existingAttempt || existingAttempt.id !== input.attemptId)
        )
          return null;
        const attemptId = existingAttempt?.id ?? randomUUID();
        const token = randomUUID();
        const fencingVersion = Math.max(
          job.fencingVersion + 1,
          existingAttempt?.leaseGeneration ?? 0
        );
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
          await repo.updateAttempt({
            attemptId,
            values: {
              leaseGeneration: fencingVersion,
              runnerId: input.runnerId,
              leaseTokenHash: leaseHash(token),
              leaseExpiresAt: expiresAt,
            },
          });
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
        await repo.markDispatchConsumed?.({
          jobId: job.id,
          attemptId,
          adapter: input.adapter,
          consumedAt: new Date(),
        });
        await repo.insertEvent({
          workerJobId: job.id,
          eventType: "LEASE_ACQUIRED",
          attemptId,
          eventIdempotencyKey: `lease:${attemptId}`,
          payloadJson: {
            runnerId: input.runnerId,
            adapter: input.adapter,
            fencingVersion,
          },
        });
        return {
          jobId: job.id,
          attemptId,
          leaseToken: token,
          fencingVersion,
          expiresAt: expiresAt.toISOString(),
        };
      });
    },

    /**
     * Hold a queued job before a resumable domain pause is acknowledged.
     * This closes the gap between a domain pause request and an outbox
     * publisher/consumer racing to start the next execution.
     */
    async holdQueued(
      jobId: string,
      operationKey: string,
      reason = "paused_by_domain"
    ): Promise<boolean> {
      if (!operationKey.trim() || operationKey.length > 200) {
        throw new JobControlPlaneError(
          "JOB_EXTERNAL_WAIT_INVALID",
          "External operation key is invalid"
        );
      }
      const safeReason = sanitizeJobErrorMessage(
        reason,
        500,
        "paused_by_domain"
      );
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job) return false;
        if (job.status === "waiting_external") {
          const progress =
            job.progressJson &&
            typeof job.progressJson === "object" &&
            !Array.isArray(job.progressJson)
              ? (job.progressJson as {
                  externalWait?: { operationKey?: unknown };
                })
              : undefined;
          // An already-held external wait belongs to exactly one provider
          // operation. Do not let a late/duplicate submission attach a
          // different provider reference to the same canonical job.
          return progress?.externalWait?.operationKey === operationKey;
        }
        // A retry can already be scheduled when the domain pause arrives.
        // Holding it here prevents the due-retry reconciler from publishing
        // another attempt while the resumable domain operation is paused.
        if (job.status !== "queued" && job.status !== "retry_scheduled")
          return false;
        const previousProgress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const now = new Date();
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedAttempt: job.attempt,
          values: {
            status: "waiting_external",
            statusReason: safeReason,
            progressJson: {
              ...previousProgress,
              externalWait: {
                operationKey,
                reason: safeReason,
                resumeAfter: "9999-12-31T00:00:00.000Z",
              },
            },
            updatedAt: now,
          },
        });
        if (!updated) return false;
        await repo.cancelUnpublishedOutbox({
          jobId,
          reason: safeReason,
          cancelledAt: now,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "WAITING_EXTERNAL",
          eventIdempotencyKey: boundedEventKey(
            "queued-hold",
            jobId,
            job.attempt,
            job.status,
            operationKey
          ),
          payloadJson: {
            reason: safeReason,
            operationKey,
            source: "domain_pause",
          },
        });
        return true;
      });
    },

    /**
     * Fail closed when an external provider submission is ambiguous. This is
     * intentionally separate from worker-lease failure: the provider call may
     * already be running, so automatic retry would risk a paid duplicate.
     */
    async markProviderSubmissionReview(
      jobId: string,
      operationKey: string,
      reason: string,
      now = new Date()
    ): Promise<boolean> {
      if (!operationKey.trim() || operationKey.length > 200) {
        throw new JobControlPlaneError(
          "JOB_EXTERNAL_WAIT_INVALID",
          "Provider operation key is invalid"
        );
      }
      const safeReason = sanitizeJobErrorMessage(
        reason,
        500,
        "provider_submission_ambiguous"
      );
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job) return false;
        if (job.status === "failed" && job.operatorReviewRequired) return true;
        if (job.status !== "queued") return false;
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "queued",
          expectedAttempt: job.attempt,
          values: {
            status: "failed",
            statusReason: "provider_submission_ambiguous",
            errorCode: "PROVIDER_SUBMISSION_AMBIGUOUS",
            errorMessage: safeReason,
            operatorReviewRequired: true,
            operatorReviewReason: safeReason,
            finishedAt: now,
          },
        });
        if (!updated) return false;
        await repo.cancelUnpublishedOutbox({
          jobId,
          reason: "provider_submission_ambiguous",
          cancelledAt: now,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "FAILED",
          eventIdempotencyKey: `provider-review:${operationKey}`,
          payloadJson: {
            code: "PROVIDER_SUBMISSION_AMBIGUOUS",
            operationKey,
            operatorReviewRequired: true,
          },
        });
        return true;
      });
    },

    async start(lease: LeaseContext): Promise<void> {
      await guardedLeaseUpdate(
        repository,
        lease,
        "leased",
        "running",
        "STARTED",
        {},
        { startedAt: new Date() }
      );
    },

    async heartbeat(lease: LeaseContext): Promise<void> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        await assertLeaseAttempt(repo, lease, job);
        const now = new Date();
        const timeoutPolicy = (job?.timeoutPolicyJson ?? {}) as Record<
          string,
          unknown
        >;
        const hardTimeoutMs =
          Number.isFinite(Number(timeoutPolicy.hardTimeoutMs)) &&
          Number(timeoutPolicy.hardTimeoutMs) > 0
            ? Number(timeoutPolicy.hardTimeoutMs)
            : job
              ? job.timeoutSeconds * 1000
              : 0;
        const executionStartedAt = job?.startedAt ?? job?.createdAt;
        if (
          !job ||
          job.status !== "running" ||
          !executionStartedAt ||
          now.getTime() >= executionStartedAt.getTime() + hardTimeoutMs
        ) {
          if (job?.status === "running") {
            const expired = await repo.updateJob({
              jobId: lease.jobId,
              expectedStatus: "running",
              expectedAttempt: job.attempt,
              expectedLeaseHash: leaseHash(lease.leaseToken),
              expectedFencingVersion: lease.fencingVersion,
              values: {
                status: "expired",
                statusReason: "hard_timeout",
                errorCode: "JOB_TIMEOUT",
                errorMessage: "Job hard deadline has elapsed",
                leaseOwnerToken: null,
                leaseExpiresAt: null,
                finishedAt: now,
              },
            });
            if (expired) {
              await repo.cancelUnpublishedOutbox({
                jobId: lease.jobId,
                reason: "expired:hard_timeout",
                cancelledAt: now,
              });
              await repo.updateAttempt({
                attemptId: lease.attemptId,
                values: {
                  finishedAt: now,
                  terminalClass: "expired",
                  recoveryReason: "hard_timeout",
                },
              });
              await repo.insertEvent({
                workerJobId: lease.jobId,
                eventType: "TIMEOUT",
                attemptId: lease.attemptId,
                eventIdempotencyKey: `timeout:${lease.attemptId}`,
                payloadJson: { kind: "hard" },
              });
              await repo.insertEvent({
                workerJobId: lease.jobId,
                eventType: "EXPIRED",
                attemptId: lease.attemptId,
                eventIdempotencyKey: `expired:${lease.attemptId}`,
                payloadJson: { reason: "hard_timeout" },
              });
            }
          }
          throw new JobControlPlaneError(
            "JOB_TIMEOUT",
            "Job hard deadline has elapsed"
          );
        }
        const hardDeadlineAt = new Date(
          executionStartedAt.getTime() + hardTimeoutMs
        );
        const requestedLeaseExpiry = nowPlus(
          leaseDurationMs(job.executionClass),
          now
        );
        const leaseExpiresAt = new Date(
          Math.min(requestedLeaseExpiry.getTime(), hardDeadlineAt.getTime())
        );
        const updated = await repo.updateJob({
          jobId: lease.jobId,
          expectedStatus: "running",
          expectedAttempt: job.attempt,
          expectedLeaseHash: leaseHash(lease.leaseToken),
          expectedFencingVersion: lease.fencingVersion,
          values: { heartbeatAt: now, leaseExpiresAt },
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_LEASE_STALE",
            "Job lease is no longer active"
          );
        await repo.insertEvent({
          workerJobId: lease.jobId,
          eventType: "HEARTBEAT",
          attemptId: lease.attemptId,
          eventIdempotencyKey: `heartbeat:${lease.attemptId}:${now.toISOString()}`,
          payloadJson: {},
        });
      });
    },

    async progress(lease: LeaseContext, update: ProgressUpdate): Promise<void> {
      if (
        !Number.isFinite(update.progress) ||
        update.progress < 0 ||
        update.progress > 100 ||
        !update.stage ||
        update.stage.length > 100 ||
        (update.message?.length ?? 0) > 500
      ) {
        throw new JobControlPlaneError(
          "JOB_PROGRESS_INVALID",
          "Progress must be between 0 and 100 with a stage"
        );
      }
      validateBoundedPayload(update.measured ?? {}, "progress.measured");
      await repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        await assertLeaseAttempt(repo, lease, job);
        const previous = job?.progressJson as
          Record<string, unknown> | undefined;
        const sameStage = previous?.stage === update.stage;
        if (
          sameStage &&
          typeof previous?.progress === "number" &&
          update.progress < previous.progress
        ) {
          throw new JobControlPlaneError(
            "JOB_PROGRESS_REGRESSION",
            "Progress cannot move backward within a stage"
          );
        }
        const updated = await repo.updateJob({
          jobId: lease.jobId,
          expectedStatus: "running",
          expectedAttempt: job?.attempt,
          expectedLeaseHash: leaseHash(lease.leaseToken),
          expectedFencingVersion: lease.fencingVersion,
          values: { progressJson: update },
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_LEASE_STALE",
            "Job lease is no longer active"
          );
        await repo.insertEvent({
          workerJobId: lease.jobId,
          eventType: "PROGRESS",
          attemptId: lease.attemptId,
          eventIdempotencyKey: `progress:${lease.attemptId}:${update.stage}:${update.progress}`,
          payloadJson: update,
        });
      });
    },

    /**
     * Compatibility bridge for Python task families that still expose a
     * domain-specific status payload. It is lease-fenced and stores the
     * bounded payload only as a progress projection; it never becomes a
     * second lifecycle state machine.
     */
    async reportLegacyStatus(
      lease: LeaseContext,
      legacyStatus: Record<string, unknown>
    ): Promise<void> {
      validateBoundedPayload(legacyStatus, "legacyStatus");
      const rawProgress = Number(legacyStatus.progress);
      const progress = Number.isFinite(rawProgress)
        ? Math.max(
            0,
            Math.min(100, rawProgress <= 1 ? rawProgress * 100 : rawProgress)
          )
        : String(legacyStatus.status ?? "").toLowerCase() === "completed"
          ? 100
          : 0;
      const stageValue =
        legacyStatus.phase ??
        legacyStatus.stage ??
        legacyStatus.status ??
        "running";
      const stage = String(stageValue).trim().slice(0, 100) || "running";
      const message =
        typeof legacyStatus.message === "string"
          ? legacyStatus.message.slice(0, 500)
          : undefined;
      const safeLegacyStatus = redactJobPayload(legacyStatus) as Record<
        string,
        unknown
      >;
      const eventDigest = createHash("sha256")
        .update(JSON.stringify(safeLegacyStatus), "utf8")
        .digest("hex")
        .slice(0, 32);
      await repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        await assertLeaseAttempt(repo, lease, job);
        const updated = await repo.updateJob({
          jobId: lease.jobId,
          expectedStatus: "running",
          expectedAttempt: job?.attempt,
          expectedLeaseHash: leaseHash(lease.leaseToken),
          expectedFencingVersion: lease.fencingVersion,
          values: {
            progressJson: {
              progress,
              stage,
              ...(message ? { message } : {}),
              legacyStatus: safeLegacyStatus,
            },
          },
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_LEASE_STALE",
            "Job lease is no longer active"
          );
        await repo.insertEvent({
          workerJobId: lease.jobId,
          eventType: "PROGRESS",
          attemptId: lease.attemptId,
          eventIdempotencyKey: `legacy-progress:${lease.attemptId}:${eventDigest}`,
          payloadJson: { progress, stage, ...(message ? { message } : {}) },
        });
      });
    },

    async waitForExternal(
      lease: LeaseContext,
      input: ExternalWait
    ): Promise<void> {
      if (
        !input.operationKey ||
        input.operationKey.length > 200 ||
        (input.providerReference?.length ?? 0) > 255 ||
        Number.isNaN(Date.parse(input.resumeAfter))
      )
        throw new JobControlPlaneError(
          "JOB_EXTERNAL_WAIT_INVALID",
          "External wait metadata is invalid"
        );
      const providerReference = input.providerReference?.trim() || undefined;
      const normalizedProviderReference = providerReference
        ? normalizeResultReference(providerReference)
        : null;
      if (
        normalizedProviderReference &&
        normalizedProviderReference.length > 255
      )
        throw new JobControlPlaneError(
          "JOB_EXTERNAL_WAIT_INVALID",
          "External provider reference is invalid"
        );
      if (input.metadata !== undefined)
        validateBoundedPayload(input.metadata, "externalWait.metadata");
      // The bounded payload validator rejects undefined object values. Keep
      // optional provider metadata absent when no provider reference exists;
      // otherwise a deferred/unknown executor failure can fail a second time
      // while trying to release its lease.
      const safeExternalWait = {
        operationKey: input.operationKey,
        resumeAfter: input.resumeAfter,
        ...(normalizedProviderReference
          ? { providerReference: normalizedProviderReference }
          : {}),
        ...(input.metadata
          ? {
              metadata: redactJobPayload(input.metadata) as Record<
                string,
                unknown
              >,
            }
          : {}),
      };
      await repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        await assertLeaseAttempt(repo, lease, job);
        const previousProgress =
          job?.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const updated = await repo.updateJob({
          jobId: lease.jobId,
          expectedStatus: "running",
          expectedAttempt: job?.attempt,
          expectedLeaseHash: leaseHash(lease.leaseToken),
          expectedFencingVersion: lease.fencingVersion,
          values: {
            status: "waiting_external",
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            heartbeatAt: new Date(),
            // Preserve the last domain-specific projection (for example an
            // awaiting_answers continuation) while the execution lease is
            // released. Otherwise a status reader loses its resumable state.
            progressJson: {
              ...previousProgress,
              externalWait: safeExternalWait,
            },
          },
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_LEASE_STALE",
            "Job lease is no longer active"
          );
        await repo.insertEvent({
          workerJobId: lease.jobId,
          eventType: "WAITING_EXTERNAL",
          attemptId: lease.attemptId,
          eventIdempotencyKey: boundedEventKey(
            "waiting-external",
            lease.attemptId,
            input.operationKey
          ),
          payloadJson: safeExternalWait,
        });
      });
    },

    async resumeExternal(
      jobId: string,
      runnerId: string,
      adapter: string,
      inputJson?: Record<string, unknown>,
      resumeKey = "default",
      advanceAttempt = false
    ): Promise<boolean> {
      if (inputJson !== undefined)
        validateBoundedPayload(inputJson, "externalResume.input");
      const normalizedResumeKey = resumeKey.trim();
      if (!normalizedResumeKey || normalizedResumeKey.length > 255) {
        throw new JobControlPlaneError(
          "JOB_EXTERNAL_RESUME_INVALID",
          "External resume key is invalid"
        );
      }
      const resumeDigest = createHash("sha256")
        .update(normalizedResumeKey, "utf8")
        .digest("hex")
        .slice(0, 32);
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        const progress =
          job?.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as {
                externalWait?: { operationKey?: unknown };
              })
            : undefined;
        const operationKey =
          typeof progress?.externalWait?.operationKey === "string"
            ? progress.externalWait.operationKey
            : "unknown";
        const operationDigest = createHash("sha256")
          .update(operationKey, "utf8")
          .digest("hex")
          .slice(0, 32);
        const eventKey = `external-resumed:${jobId}:${operationDigest}:${resumeDigest}`;
        if (await repo.findEventByIdempotency(jobId, eventKey)) return true;
        if (!job || job.status !== "waiting_external") return false;
        const previousAttemptNumber = job.attempt;
        const nextAttempt = advanceAttempt
          ? previousAttemptNumber + 1
          : previousAttemptNumber;
        if (nextAttempt > job.maxAttempts) return false;
        const previousProgress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "waiting_external",
          expectedAttempt: job.attempt,
          values: {
            status: "queued",
            ...(advanceAttempt ? { attempt: nextAttempt } : {}),
            statusReason: `external_resumed:${adapter}`,
            ...(inputJson ? { inputJson } : {}),
            progressJson: {
              ...previousProgress,
              progress: 0,
              stage: "resuming",
              legacyStatus: { status: "queued", message: "Resuming execution" },
            },
          },
        });
        if (!updated) return false;
        const previousAttempt = await repo.findAttempt(
          jobId,
          previousAttemptNumber
        );
        const nextAttemptId = advanceAttempt
          ? randomUUID()
          : previousAttempt?.id;
        if (advanceAttempt && previousAttempt) {
          await repo.updateAttempt({
            attemptId: previousAttempt.id,
            values: {
              finishedAt: new Date(),
              terminalClass: "retryable",
              recoveryReason: "external_resume_retry",
            },
          });
        }
        if (advanceAttempt && nextAttemptId) {
          await repo.insertAttempt({
            id: nextAttemptId,
            workerJobId: jobId,
            attempt: nextAttempt,
            leaseGeneration: 0,
            recoveryReason: "external_resume_retry",
          });
        }
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "RECOVERED",
          attemptId: previousAttempt?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: {
            runnerId,
            adapter,
            resumeKey: resumeDigest,
            previousAttempt: previousAttemptNumber,
            nextAttempt,
          },
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "DISPATCH_REQUESTED",
          attemptId: nextAttemptId,
          eventIdempotencyKey: `dispatch-requested:external-resume:${jobId}:${nextAttempt}:${resumeDigest}`,
          payloadJson: {
            attempt: nextAttempt,
            reason: "external_resumed",
            previousAttempt: advanceAttempt ? previousAttemptNumber : undefined,
          },
        });
        await repo.insertOutbox({
          workerJobId: jobId,
          attemptId: nextAttemptId,
          envelopeVersion: job.contractVersion,
          envelopeJson: {
            jobId,
            businessAttempt: nextAttempt,
            contractVersion: job.contractVersion,
            ...(nextAttemptId ? { attemptId: nextAttemptId } : {}),
            reason: "external_resumed",
            resumeKey: resumeDigest,
          },
          dedupeKey: `job:${jobId}:attempt:${nextAttempt}:external-resume:${resumeDigest}`,
          nextAttemptAt: new Date(),
        });
        return true;
      });
    },

    async complete(lease: LeaseContext, result: JobResult): Promise<void> {
      const resultRef = normalizeResultReference(result.resultRef);
      validateBoundedPayload(result.output ?? {}, "result.output");
      const safeResult = {
        ...result,
        resultRef: resultRef ?? undefined,
        output: redactJobPayload(result.output ?? {}) as Record<
          string,
          unknown
        >,
      };
      await guardedLeaseUpdate(
        repository,
        lease,
        "running",
        "succeeded",
        "COMPLETED",
        safeResult,
        {
          resultRef,
          outputJson: safeResult.output,
          leaseOwnerToken: null,
          leaseExpiresAt: null,
          finishedAt: new Date(),
        },
        {
          settlementKey: `result:${lease.jobId}:${lease.attemptId}`,
          settlementType: "result",
        }
      );
    },

    async fail(lease: LeaseContext, error: ClassifiedJobError): Promise<void> {
      if (
        !error.code ||
        error.code.length > 100 ||
        !error.message ||
        error.message.length > 2000
      )
        throw new JobControlPlaneError(
          "JOB_ERROR_INVALID",
          "Classified error is invalid"
        );
      const safeMessage = sanitizeJobErrorMessage(error.message);
      await repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        await assertLeaseAttempt(repo, lease, job);
        if (!job || job.status !== "running") {
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job is no longer running"
          );
        }
        const policy = (job.retryPolicyJson ?? {}) as Record<string, unknown>;
        const allowedErrors = Array.isArray(policy.allowedErrorClasses)
          ? policy.allowedErrorClasses.filter(
              (item): item is string => typeof item === "string"
            )
          : [];
        const now = new Date();
        const withinDeadline =
          !Number.isFinite(Number(policy.deadlineMs)) ||
          now.getTime() < job.createdAt.getTime() + Number(policy.deadlineMs);
        const allowed =
          allowedErrors.length === 0 ||
          allowedErrors.includes(error.code) ||
          allowedErrors.includes(error.class);
        const shouldRetry =
          error.class === "retryable" &&
          allowed &&
          withinDeadline &&
          job.attempt < job.maxAttempts;
        const nextStatus = shouldRetry ? "retry_scheduled" : "failed";
        const nextAttempt = shouldRetry ? job.attempt + 1 : job.attempt;
        const nextAttemptId = shouldRetry ? randomUUID() : undefined;
        const baseDelayMs =
          Number.isFinite(Number(policy.baseDelayMs)) &&
          Number(policy.baseDelayMs) >= 0
            ? Number(policy.baseDelayMs)
            : 60_000;
        const maxDelayMs =
          Number.isFinite(Number(policy.maxDelayMs)) &&
          Number(policy.maxDelayMs) >= baseDelayMs
            ? Number(policy.maxDelayMs)
            : 900_000;
        const jitter =
          policy.jitter === "bounded" || policy.jitter === "recorded"
            ? policy.jitter
            : "none";
        const retryDelayMs = calculateRetryDelay(
          job.attempt,
          baseDelayMs,
          maxDelayMs,
          jitter,
          job.id
        );
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
            failureReason: safeMessage,
            errorCode: error.code,
            errorMessage: safeMessage,
            nextRetryAt,
            operatorReviewRequired:
              error.class === "unknown" ||
              error.operatorReviewRequired === true,
            operatorReviewReason:
              error.class === "unknown" || error.operatorReviewRequired === true
                ? sanitizeJobErrorMessage(error.message, 500)
                : null,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            finishedAt: nextStatus === "failed" ? new Date() : null,
          },
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Lease is stale"
          );
        const safeMetadata = error.metadata
          ? (redactJobPayload(error.metadata) as Record<string, unknown>)
          : undefined;
        await repo.updateAttempt({
          attemptId: lease.attemptId,
          values: {
            finishedAt: new Date(),
            terminalClass: nextStatus === "failed" ? error.class : "retryable",
            recoveryReason: error.code,
          },
        });
        if (!shouldRetry) {
          await repo.cancelUnpublishedOutbox({
            jobId: job.id,
            reason: `failed:${error.code}`,
            cancelledAt: now,
          });
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
            envelopeJson: {
              jobId: job.id,
              businessAttempt: nextAttempt,
              contractVersion: job.contractVersion,
              attemptId: nextAttemptId,
            },
            dedupeKey: `job:${job.id}:attempt:${nextAttempt}`,
            nextAttemptAt: nextRetryAt,
          });
        }
        await repo.insertEvent({
          workerJobId: job.id,
          eventType:
            nextStatus === "retry_scheduled" ? "RETRY_SCHEDULED" : "FAILED",
          attemptId: lease.attemptId,
          eventIdempotencyKey: `failure:${lease.attemptId}:${error.code}`,
          payloadJson: {
            code: error.code,
            class: error.class,
            nextAttempt: shouldRetry ? nextAttempt : undefined,
            retryDelayMs: shouldRetry ? retryDelayMs : undefined,
            jitter: shouldRetry ? jitter : undefined,
            operatorReviewRequired: error.operatorReviewRequired ?? false,
            ...(safeMetadata && Object.keys(safeMetadata).length > 0
              ? { metadata: safeMetadata }
              : {}),
          },
        });
      });
    },

    async requestSoftTimeout(
      jobId: string,
      now = new Date()
    ): Promise<"requested" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "running" || !job.startedAt)
          return "ignored";
        const policy = (job.timeoutPolicyJson ?? {}) as Record<string, unknown>;
        const softTimeoutMs = Number(policy.softTimeoutMs);
        if (
          !Number.isFinite(softTimeoutMs) ||
          softTimeoutMs <= 0 ||
          now.getTime() < job.startedAt.getTime() + softTimeoutMs
        )
          return "ignored";
        const eventKey = `soft-timeout:${job.id}:${job.attempt}`;
        if (await repo.findEventByIdempotency(job.id, eventKey))
          return "requested";
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
          payloadJson: {
            kind: "soft",
            requestedAt: now.toISOString(),
            cooperative: true,
          },
        });
        return "requested";
      });
    },

    async requestCancel(
      jobId: string,
      reason = "cancelled_by_request",
      actionId?: string,
      actorId?: number,
      scope?: JobMutationScope
    ): Promise<void> {
      if (actionId !== undefined) validateActionId(actionId);
      const safeReason = sanitizeJobErrorMessage(
        reason,
        2000,
        "cancelled_by_request"
      );
      await repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        assertJobMutationScope(job, scope);
        const keyPrefix = actionId
          ? `operator:${actionId}`
          : `cancel:${jobId}:${job?.attempt ?? 0}`;
        if (actionId && job) {
          const existingAction = await repo.findAction(actionId);
          if (
            existingAction &&
            (existingAction.workerJobId !== jobId ||
              existingAction.command !== "cancel" ||
              existingAction.reason !== safeReason.slice(0, 500))
          ) {
            throw new JobControlPlaneError(
              "IDEMPOTENCY_CONFLICT",
              "Action key was already used for another command or target"
            );
          }
          if (existingAction) return;
        }
        if (await repo.findEventByIdempotency(jobId, `${keyPrefix}:requested`))
          return;
        if (
          !job ||
          ["succeeded", "failed", "cancelled", "expired"].includes(job.status)
        ) {
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job cannot be cancelled in its current state"
          );
        }
        if (
          actionId &&
          !(await prepareOperatorAction(repo, {
            actionId,
            jobId,
            command: "cancel",
            reason: safeReason,
            actorId,
            authorizationScope: scope?.authorizationScope,
            job,
          }))
        )
          return;
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedTenantId: scope?.tenantId,
          expectedRequestedByUserId: scope?.requestedByUserId,
          expectedAttempt: job.attempt,
          values: {
            statusReason: `cancel_requested:${safeReason}`,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
          },
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job changed while requesting cancellation"
          );
        if (actionId)
          await repo.insertEvent({
            workerJobId: jobId,
            eventType: "OPERATOR_ACTION",
            eventIdempotencyKey: `${keyPrefix}:action`,
            payloadJson: {
              action: "cancel",
              reason: safeReason.slice(0, 500),
              actorId,
              targetAttempt: job.attempt,
              targetStatus: job.status,
            },
          });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "CANCEL_REQUESTED",
          attemptId: (await repo.findAttempt(jobId, job.attempt))?.id,
          eventIdempotencyKey: `${keyPrefix}:requested`,
          payloadJson: { reason: safeReason.slice(0, 500), actionId, actorId },
        });
        if (actionId)
          await finishOperatorAction(repo, actionId, {
            accepted: true,
            phase: "requested",
            jobId,
          });
      });
    },

    async finalizeCancel(
      jobId: string,
      reason = "cancelled_by_request",
      actionId?: string,
      actorId?: number,
      scope?: JobMutationScope
    ): Promise<void> {
      if (actionId !== undefined) validateActionId(actionId);
      const safeReason = sanitizeJobErrorMessage(
        reason,
        2000,
        "cancelled_by_request"
      );
      await repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job) return;
        assertJobMutationScope(job, scope);
        if (job.status === "cancelled") {
          if (actionId)
            await finishOperatorAction(repo, actionId, {
              accepted: true,
              phase: "cancelled",
              jobId,
            });
          return;
        }
        if (["succeeded", "failed", "expired"].includes(job.status))
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job cannot be cancelled in its current state"
          );
        const keyPrefix = actionId
          ? `operator:${actionId}`
          : `cancel:${jobId}:${job.attempt}`;
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedTenantId: scope?.tenantId,
          expectedRequestedByUserId: scope?.requestedByUserId,
          expectedAttempt: job.attempt,
          values: {
            status: "cancelled",
            statusReason: safeReason,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
          },
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job changed while finalizing cancellation"
          );
        await repo.cancelUnpublishedOutbox({
          jobId,
          reason: `cancelled:${safeReason}`,
          cancelledAt: new Date(),
        });
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt)
          await repo.updateAttempt({
            attemptId: currentAttempt.id,
            values: {
              finishedAt: new Date(),
              terminalClass: "cancelled",
              recoveryReason: safeReason.slice(0, 500),
            },
          });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "CANCELLED",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `${keyPrefix}:cancelled`,
          payloadJson: { reason: safeReason.slice(0, 500), actionId, actorId },
        });
      });
    },

    async reconcileCancellationRequest(
      jobId: string
    ): Promise<"finalized" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status === "cancelled") return "ignored";
        if (!job.statusReason?.startsWith("cancel_requested:"))
          return "ignored";
        if (["succeeded", "failed", "expired"].includes(job.status))
          return "ignored";
        const reason =
          job.statusReason.slice("cancel_requested:".length).slice(0, 2000) ||
          "cancelled_by_request";
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedAttempt: job.attempt,
          values: {
            status: "cancelled",
            statusReason: reason,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
          },
        });
        if (!updated) return "ignored";
        await repo.cancelUnpublishedOutbox({
          jobId,
          reason: `cancelled:${reason}`,
          cancelledAt: new Date(),
        });
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt)
          await repo.updateAttempt({
            attemptId: currentAttempt.id,
            values: {
              finishedAt: new Date(),
              terminalClass: "cancelled",
              recoveryReason: reason,
            },
          });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "CANCELLED",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `cancel:${jobId}:${job.attempt}:cancelled`,
          payloadJson: { reason, recovered: true },
        });
        return "finalized";
      });
    },

    async cancel(
      jobId: string,
      reason = "cancelled_by_request",
      actionId?: string,
      actorId?: number,
      scope?: JobMutationScope
    ): Promise<void> {
      try {
        await this.requestCancel(jobId, reason, actionId, actorId, scope);
      } catch (error) {
        if (
          !(error instanceof JobControlPlaneError) ||
          error.code !== "JOB_STATE_CONFLICT"
        )
          throw error;
        const current = await this.getStatus(jobId, scope);
        // Another actor may have completed/cancelled the job between the
        // caller's read and this command. Cancellation is idempotent at the
        // control-plane boundary; a terminal winner is already the desired
        // outcome and must not become a user-visible failure.
        if (
          !current ||
          ["succeeded", "failed", "cancelled", "expired"].includes(
            current.status
          )
        )
          return;
        if (current.statusReason?.startsWith("cancel_requested:")) {
          await this.reconcileCancellationRequest(jobId);
          return;
        }
        throw error;
      }
      try {
        await this.finalizeCancel(jobId, reason, actionId, actorId, scope);
      } catch (error) {
        if (
          !(error instanceof JobControlPlaneError) ||
          error.code !== "JOB_STATE_CONFLICT"
        )
          throw error;
        const current = await this.getStatus(jobId, scope);
        if (
          !current ||
          ["succeeded", "failed", "cancelled", "expired"].includes(
            current.status
          )
        )
          return;
        if (current.statusReason?.startsWith("cancel_requested:")) {
          await this.reconcileCancellationRequest(jobId);
          return;
        }
        throw error;
      }
    },

    async makeRetryDue(
      jobId: string,
      actionId?: string,
      actorId?: number,
      reason = "retry_due",
      scope?: JobMutationScope
    ): Promise<boolean> {
      if (actionId !== undefined) validateActionId(actionId);
      const safeReason = sanitizeJobErrorMessage(reason, 2000, "retry_due");
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        const existingAction = actionId
          ? await repo.findAction(actionId)
          : null;
        if (existingAction) {
          if (
            existingAction.workerJobId !== jobId ||
            existingAction.command !== "requeue" ||
            existingAction.reason !== safeReason.slice(0, 500)
          ) {
            throw new JobControlPlaneError(
              "IDEMPOTENCY_CONFLICT",
              "Action key was already used for another command or target"
            );
          }
          assertJobMutationScope(job, scope);
          return true;
        }
        assertJobMutationScope(job, scope);
        const currentAttempt = job
          ? await repo.findAttempt(jobId, job.attempt)
          : null;
        const existingOutbox = job
          ? await repo.findOutboxForAttempt(jobId, currentAttempt?.id)
          : null;
        const isQuarantinedDispatchRecovery =
          job?.status === "queued" &&
          job.operatorReviewRequired &&
          Boolean(actionId) &&
          existingOutbox?.quarantinedAt !== null &&
          existingOutbox?.quarantinedAt !== undefined &&
          existingOutbox.operatorReviewReason ===
            "adapter_contract_unsupported";
        if (
          !job ||
          (job.status !== "retry_scheduled" && !isQuarantinedDispatchRecovery)
        )
          return false;
        if (
          actionId &&
          !(await prepareOperatorAction(repo, {
            actionId,
            jobId,
            command: "requeue",
            reason: safeReason,
            actorId,
            authorizationScope: scope?.authorizationScope,
            job,
          }))
        )
          return true;
        if (job.operatorReviewRequired && !actionId) return false;
        if (job.statusReason?.startsWith("cancel_requested:")) return false;
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedTenantId: scope?.tenantId,
          expectedRequestedByUserId: scope?.requestedByUserId,
          expectedAttempt: job.attempt,
          values: {
            ...(job.status === "retry_scheduled"
              ? { status: "queued" }
              : {
                  statusReason: "operator_requeue:adapter_contract_unsupported",
                }),
            ...(job.jobType === "content_protection.protect"
              ? { runtimeType: CONTENT_PROTECTION_RUNTIME_TYPE }
              : {}),
            nextRetryAt: null,
            operatorReviewRequired: false,
            operatorReviewReason: null,
          },
        });
        if (!updated) return false;
        if (existingOutbox && !existingOutbox.publishedAt) {
          await repo.resetOutbox({
            id: existingOutbox.id,
            nextAttemptAt: new Date(),
          });
        } else if (!existingOutbox) {
          await repo.insertEvent({
            workerJobId: jobId,
            eventType: "DISPATCH_REQUESTED",
            attemptId: currentAttempt?.id,
            eventIdempotencyKey: `dispatch-requested:${jobId}:${job.attempt}:requeue`,
            payloadJson: {
              attempt: job.attempt,
              reason: actionId ? "operator_requeue" : "retry_due",
            },
          });
          await repo.insertOutbox({
            workerJobId: jobId,
            attemptId: currentAttempt?.id,
            envelopeVersion: job.contractVersion,
            envelopeJson: {
              jobId,
              businessAttempt: job.attempt,
              contractVersion: job.contractVersion,
              attemptId: currentAttempt?.id,
              reason: actionId ? "operator_requeue" : "retry_due",
            },
            dedupeKey: `job:${jobId}:attempt:${job.attempt}`,
            nextAttemptAt: new Date(),
          });
        }
        if (actionId)
          await repo.insertEvent({
            workerJobId: jobId,
            eventType: "OPERATOR_ACTION",
            eventIdempotencyKey: `operator:${actionId}:action`,
            payloadJson: {
              action: "requeue",
              reason: safeReason.slice(0, 500),
              actorId,
              targetAttempt: job.attempt,
              targetStatus: job.status,
            },
          });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "RECOVERED",
          eventIdempotencyKey: actionId
            ? `operator:${actionId}:requeue`
            : `retry-due:${jobId}:${job.attempt}`,
          payloadJson: {
            attempt: job.attempt,
            actionId,
            reason: safeReason.slice(0, 500),
          },
        });
        if (actionId)
          await finishOperatorAction(repo, actionId, {
            accepted: true,
            phase: "requeued",
            jobId,
          });
        return true;
      });
    },

    /**
     * Recover a checkpoint-bearing domain job after an evidence-backed
     * failure. This is deliberately narrower than `makeRetryDue`: it is the
     * only ordinary API that may reopen a terminal failed row, and it always
     * creates exactly one new business attempt plus one durable outbox intent
     * on the same canonical job.
     */
    async recoverCheckpoint(
      jobId: string,
      actionId: string,
      reason: string,
      evidence: { checkpointDigest: string; completedEpisodeCount?: number },
      actorId?: number,
      scope?: JobMutationScope
    ): Promise<boolean> {
      if (!actionId || !reason.trim() || reason.length > 500) {
        throw new JobControlPlaneError(
          "JOB_ACTION_INVALID",
          "Checkpoint recovery action is invalid"
        );
      }
      validateActionId(actionId);
      if (!/^[a-f0-9]{32,64}$/i.test(evidence.checkpointDigest)) {
        throw new JobControlPlaneError(
          "JOB_RECOVERY_EVIDENCE_INVALID",
          "Checkpoint recovery evidence is invalid"
        );
      }
      const safeReason = sanitizeJobErrorMessage(
        reason,
        500,
        "checkpoint_recovery"
      );
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        const normalizedReason = safeReason;
        const existingAction = await repo.findAction(actionId);
        if (existingAction) {
          if (
            existingAction.workerJobId !== jobId ||
            existingAction.command !== "recover_checkpoint" ||
            existingAction.reason !== normalizedReason
          ) {
            throw new JobControlPlaneError(
              "IDEMPOTENCY_CONFLICT",
              "Action key was already used for another command or target"
            );
          }
          assertJobMutationScope(job, scope);
          return true;
        }
        assertJobMutationScope(job, scope);
        if (
          !job ||
          job.jobType !== "vertical_drama.story" ||
          job.status !== "failed"
        )
          return false;
        if (!job.operatorReviewRequired) return false;
        if (job.attempt >= job.maxAttempts) return false;

        if (
          !(await prepareOperatorAction(repo, {
            actionId,
            jobId,
            command: "recover_checkpoint",
            reason: normalizedReason,
            actorId,
            authorizationScope: scope?.authorizationScope,
            job,
          }))
        )
          return true;

        const nextAttempt = job.attempt + 1;
        const nextAttemptId = randomUUID();
        const now = new Date();
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "failed",
          expectedTenantId: scope?.tenantId,
          expectedRequestedByUserId: scope?.requestedByUserId,
          expectedAttempt: job.attempt,
          values: {
            status: "queued",
            attempt: nextAttempt,
            nextRetryAt: null,
            statusReason: "checkpoint_recovery",
            operatorReviewRequired: false,
            operatorReviewReason: null,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            startedAt: null,
            finishedAt: null,
          },
          allowTerminalRecovery: true,
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job changed while recovering checkpoint"
          );

        const previousAttempt = await repo.findAttempt(jobId, job.attempt);
        if (previousAttempt) {
          await repo.updateAttempt({
            attemptId: previousAttempt.id,
            values: {
              finishedAt: now,
              terminalClass: "recovered",
              recoveryReason: normalizedReason,
            },
          });
        }
        await repo.insertAttempt({
          id: nextAttemptId,
          workerJobId: jobId,
          attempt: nextAttempt,
          leaseGeneration: 0,
          recoveryReason: normalizedReason,
        });
        const payload = {
          action: "recover_checkpoint",
          reason: normalizedReason,
          actorId,
          targetAttempt: job.attempt,
          nextAttempt,
          checkpointDigest: evidence.checkpointDigest,
          ...(evidence.completedEpisodeCount !== undefined
            ? { completedEpisodeCount: evidence.completedEpisodeCount }
            : {}),
        };
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "OPERATOR_ACTION",
          attemptId: previousAttempt?.id,
          eventIdempotencyKey: `operator:${actionId}:action`,
          payloadJson: payload,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "RECOVERED",
          attemptId: nextAttemptId,
          eventIdempotencyKey: `operator:${actionId}:recovered`,
          payloadJson: payload,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "DISPATCH_REQUESTED",
          attemptId: nextAttemptId,
          eventIdempotencyKey: `dispatch-requested:${jobId}:${nextAttempt}:checkpoint-recovery`,
          payloadJson: { attempt: nextAttempt, reason: "checkpoint_recovery" },
        });
        await repo.insertOutbox({
          workerJobId: jobId,
          attemptId: nextAttemptId,
          envelopeVersion: job.contractVersion,
          envelopeJson: {
            jobId,
            businessAttempt: nextAttempt,
            attemptId: nextAttemptId,
            contractVersion: job.contractVersion,
            reason: "checkpoint_recovery",
          },
          dedupeKey: `job:${jobId}:attempt:${nextAttempt}:checkpoint-recovery`,
          nextAttemptAt: now,
        });
        await finishOperatorAction(repo, actionId, {
          accepted: true,
          phase: "checkpoint_recovered",
          jobId,
          attempt: nextAttempt,
          evidence: { checkpointDigest: evidence.checkpointDigest },
        });
        return true;
      });
    },

    /**
     * Recover a terminal job without creating a replacement canonical job.
     * Normal callers require the operator-review gate; the only unreviewed
     * exception is the exact, user-scoped fixed Remotion pre-submission
     * runtime regression encoded in `knownRuntime`. The action key and the
     * new attempt/outbox are committed in the same transaction so a repeated
     * repair request cannot double-dispatch.
     */
    async recoverReviewGatedJob(
      jobId: string,
      actionId: string,
      reason: string,
      evidence: {
        disposition: "pre_submission_failure" | "provider_operation_resolved";
        operationKey?: string;
        knownRuntime?: "remotion_revision_id" | "content_protection_provider";
      },
      actorId?: number,
      scope?: JobMutationScope
    ): Promise<boolean> {
      validateActionId(actionId);
      if (!reason.trim() || reason.length > 500) {
        throw new JobControlPlaneError(
          "JOB_RECOVERY_EVIDENCE_INVALID",
          "Review recovery reason is invalid"
        );
      }
      if (
        !evidence ||
        !evidence.disposition ||
        (evidence.operationKey !== undefined &&
          (evidence.operationKey.length === 0 ||
            evidence.operationKey.length > 200)) ||
        (evidence.knownRuntime !== undefined &&
          evidence.knownRuntime !== "remotion_revision_id" &&
          evidence.knownRuntime !== "content_protection_provider")
      ) {
        throw new JobControlPlaneError(
          "JOB_RECOVERY_EVIDENCE_INVALID",
          "Review recovery evidence is invalid"
        );
      }
      const safeReason = sanitizeJobErrorMessage(
        reason,
        500,
        "operator_review_recovery"
      );
      const actionReason = `${safeReason}:${evidence.disposition}${evidence.knownRuntime ? `:${evidence.knownRuntime}` : ""}`;
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        const existingAction = await repo.findAction(actionId);
        if (existingAction) {
          if (
            existingAction.workerJobId !== jobId ||
            existingAction.command !== "recover_review" ||
            existingAction.reason !== actionReason
          ) {
            throw new JobControlPlaneError(
              "IDEMPOTENCY_CONFLICT",
              "Action key was already used for another command or target"
            );
          }
          assertJobMutationScope(job, scope);
          return true;
        }
        assertJobMutationScope(job, scope);
        const failureText = job
          ? [
              job.errorCode,
              job.errorMessage,
              job.failureReason,
              job.statusReason,
            ]
              .filter((value): value is string => typeof value === "string")
              .join(" ")
          : "";
        const knownRemotionRevisionFailure =
          evidence.knownRuntime === "remotion_revision_id" &&
          evidence.disposition === "pre_submission_failure" &&
          scope?.authorizationScope === "worker_jobs.user_retry" &&
          job?.jobType === "remotion_render_video" &&
          failureText.includes("revisionId is not defined");
        const knownProtectionProviderFailure =
          evidence.knownRuntime === "content_protection_provider" &&
          evidence.disposition === "provider_operation_resolved" &&
          scope?.authorizationScope === "worker_jobs.user_retry" &&
          job?.jobType === "content_protection.protect" &&
          ["failed", "expired"].includes(job?.status ?? "") &&
          [
            "PROTECTION_PROVIDER_CAPABILITY_UNAVAILABLE",
            "JOB_DEADLINE_EXPIRED",
            "JOB_TIMEOUT",
            "Job deadline has elapsed",
            "Job hard deadline has elapsed",
          ].some(marker => failureText.includes(marker));
        if (
          !job ||
          !["failed", "expired"].includes(job.status) ||
          (!job.operatorReviewRequired &&
            !knownRemotionRevisionFailure &&
            !knownProtectionProviderFailure) ||
          job.attempt >= job.maxAttempts
        )
          return false;

        if (
          !(await prepareOperatorAction(repo, {
            actionId,
            jobId,
            command: "recover_review",
            reason: actionReason,
            actorId,
            authorizationScope: scope?.authorizationScope,
            job,
          }))
        )
          return true;

        const previousAttempt = await repo.findAttempt(jobId, job.attempt);
        const nextAttempt = job.attempt + 1;
        const nextAttemptId = randomUUID();
        const now = new Date();
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedTenantId: scope?.tenantId,
          expectedRequestedByUserId: scope?.requestedByUserId,
          expectedAttempt: job.attempt,
          values: {
            status: "queued",
            ...(job.jobType === "content_protection.protect"
              ? { runtimeType: CONTENT_PROTECTION_RUNTIME_TYPE }
              : {}),
            attempt: nextAttempt,
            nextRetryAt: null,
            statusReason: "operator_review_recovery",
            errorCode: null,
            errorMessage: null,
            failureReason: null,
            operatorReviewRequired: false,
            operatorReviewReason: null,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            heartbeatAt: null,
            startedAt: null,
            finishedAt: null,
          },
          allowTerminalRecovery: true,
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job changed while recovering operator review"
          );

        if (previousAttempt) {
          await repo.updateAttempt({
            attemptId: previousAttempt.id,
            values: {
              finishedAt: now,
              terminalClass: "recovered",
              recoveryReason: safeReason,
            },
          });
        }
        await repo.insertAttempt({
          id: nextAttemptId,
          workerJobId: jobId,
          attempt: nextAttempt,
          leaseGeneration: 0,
          recoveryReason: safeReason,
        });
        const payload = {
          action: "recover_review",
          reason: safeReason,
          actorId,
          targetAttempt: job.attempt,
          nextAttempt,
          previousErrorCode: job.errorCode ?? null,
          recoveryDisposition: evidence.disposition,
          ...(evidence.knownRuntime
            ? { knownRuntime: evidence.knownRuntime }
            : {}),
          ...(evidence.operationKey
            ? { operationKey: evidence.operationKey }
            : {}),
        };
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "OPERATOR_ACTION",
          attemptId: previousAttempt?.id,
          eventIdempotencyKey: `operator:${actionId}:action`,
          payloadJson: payload,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "RECOVERED",
          attemptId: nextAttemptId,
          eventIdempotencyKey: `operator:${actionId}:recovered`,
          payloadJson: payload,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "DISPATCH_REQUESTED",
          attemptId: nextAttemptId,
          eventIdempotencyKey: `dispatch-requested:${jobId}:${nextAttempt}:review-recovery`,
          payloadJson: {
            attempt: nextAttempt,
            reason: "operator_review_recovery",
          },
        });
        await repo.insertOutbox({
          workerJobId: jobId,
          attemptId: nextAttemptId,
          envelopeVersion: job.contractVersion,
          envelopeJson: {
            jobId,
            businessAttempt: nextAttempt,
            attemptId: nextAttemptId,
            contractVersion: job.contractVersion,
            reason: "operator_review_recovery",
          },
          dedupeKey: `job:${jobId}:attempt:${nextAttempt}:review-recovery`,
          nextAttemptAt: now,
        });
        await finishOperatorAction(repo, actionId, {
          accepted: true,
          phase: "review_recovered",
          jobId,
          attempt: nextAttempt,
          evidence: { disposition: evidence.disposition },
        });
        return true;
      });
    },

    async forceFail(
      jobId: string,
      reason: string,
      actionId: string,
      actorId?: number,
      scope?: JobMutationScope
    ): Promise<void> {
      validateActionId(actionId);
      const safeReason = sanitizeJobErrorMessage(
        reason,
        2000,
        "operator_force_fail"
      );
      await repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        assertJobMutationScope(job, scope);
        const existingAction = await repo.findAction(actionId);
        if (existingAction) {
          if (
            existingAction.workerJobId !== jobId ||
            existingAction.command !== "force_fail" ||
            existingAction.reason !== safeReason.slice(0, 500)
          ) {
            throw new JobControlPlaneError(
              "IDEMPOTENCY_CONFLICT",
              "Action key was already used for another command or target"
            );
          }
          return;
        }
        if (
          !job ||
          ["succeeded", "failed", "cancelled", "expired"].includes(job.status)
        )
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job cannot be force-failed in its current state"
          );
        if (
          await repo.findEventByIdempotency(
            jobId,
            `operator:${actionId}:failed`
          )
        )
          return;
        if (
          !(await prepareOperatorAction(repo, {
            actionId,
            jobId,
            command: "force_fail",
            reason: safeReason,
            actorId,
            authorizationScope: scope?.authorizationScope,
            job,
          }))
        )
          return;
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedTenantId: scope?.tenantId,
          expectedRequestedByUserId: scope?.requestedByUserId,
          expectedAttempt: job.attempt,
          values: {
            status: "failed",
            statusReason: "operator_force_fail",
            failureReason: safeReason,
            errorCode: "OPERATOR_FORCE_FAIL",
            errorMessage: safeReason,
            operatorReviewRequired: true,
            operatorReviewReason: safeReason.slice(0, 500),
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
          },
        });
        if (!updated)
          throw new JobControlPlaneError(
            "JOB_STATE_CONFLICT",
            "Job changed while force-failing"
          );
        await repo.cancelUnpublishedOutbox({
          jobId,
          reason: "failed:operator_force_fail",
          cancelledAt: new Date(),
        });
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt)
          await repo.updateAttempt({
            attemptId: currentAttempt.id,
            values: {
              finishedAt: new Date(),
              terminalClass: "operator",
              recoveryReason: safeReason.slice(0, 500),
            },
          });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "OPERATOR_ACTION",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `operator:${actionId}:action`,
          payloadJson: {
            action: "force_fail",
            reason: safeReason.slice(0, 500),
            actorId,
            targetAttempt: job.attempt,
            targetStatus: job.status,
          },
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "FAILED",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `operator:${actionId}:failed`,
          payloadJson: {
            code: "OPERATOR_FORCE_FAIL",
            operatorReviewRequired: true,
          },
        });
        await finishOperatorAction(repo, actionId, {
          accepted: true,
          phase: "force_failed",
          jobId,
        });
      });
    },

    async failExternalWait(
      jobId: string,
      reason: string,
      operatorReviewRequired = true,
      now = new Date(),
      operationKey?: string,
      pollerLeaseTokenHash?: string
    ): Promise<"failed" | "ignored"> {
      const safeReason = sanitizeJobErrorMessage(
        reason,
        2000,
        "external_wait_timeout"
      );
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "waiting_external") return "ignored";
        if (operationKey) {
          const externalWait =
            job.progressJson &&
            typeof job.progressJson === "object" &&
            !Array.isArray(job.progressJson)
              ? (
                  job.progressJson as {
                    externalWait?: { operationKey?: string };
                  }
                ).externalWait
              : undefined;
          if (externalWait?.operationKey !== operationKey) return "ignored";
        }
        if (
          operationKey &&
          pollerLeaseTokenHash &&
          repo.assertProviderPollLease &&
          !(await repo.assertProviderPollLease({
            operationKey,
            pollerLeaseTokenHash,
          }))
        )
          return "ignored";
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "waiting_external",
          expectedAttempt: job.attempt,
          values: {
            status: "failed",
            statusReason: "external_wait_timeout",
            failureReason: safeReason,
            errorCode: "EXTERNAL_WAIT_TIMEOUT",
            errorMessage: safeReason,
            operatorReviewRequired,
            finishedAt: now,
          },
        });
        if (!updated) return "ignored";
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt)
          await repo.updateAttempt({
            attemptId: currentAttempt.id,
            values: {
              finishedAt: now,
              terminalClass: "failed",
              recoveryReason: safeReason.slice(0, 500),
            },
          });
        await repo.cancelUnpublishedOutbox({
          jobId,
          reason: "failed:external_wait_timeout",
          cancelledAt: now,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "TIMEOUT",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `external-timeout:${jobId}:${job.attempt}`,
          payloadJson: { reason: safeReason.slice(0, 500) },
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "FAILED",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `external-failed:${jobId}:${job.attempt}`,
          payloadJson: {
            code: "EXTERNAL_WAIT_TIMEOUT",
            operatorReviewRequired,
          },
        });
        return "failed";
      });
    },

    /** Normalize a shared Runner receipt into the canonical job event ledger.
     * Runner never receives a database handle; terminal settlement is performed
     * by this control-plane boundary after the receipt has been fenced to the
     * exact external operation key. */
    async recordRunnerReceipt(input: {
      jobId: string;
      commandId: string;
      eventId: string;
      eventType: string;
      sequence: number;
      runnerId: string;
      runnerSessionId: string;
      tenantId: string;
      payload?: Record<string, unknown>;
    }): Promise<"recorded" | "duplicate" | "late" | "ignored"> {
      if (
        !input.jobId.trim() ||
        !input.commandId.trim() ||
        !input.eventId.trim() ||
        !input.runnerId.trim() ||
        !input.runnerSessionId.trim()
      )
        return "ignored";
      if (!Number.isSafeInteger(input.sequence) || input.sequence < 1)
        return "ignored";
      if (input.payload)
        validateBoundedPayload(input.payload, "runner.receipt.payload");
      return repository.transaction(async repo => {
        const job = await repo.findJob(input.jobId);
        if (!job) return "ignored";
        const progress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as {
                externalWait?: {
                  operationKey?: unknown;
                  metadata?: Record<string, unknown>;
                };
              })
            : {};
        if (job.tenantId !== input.tenantId) return "ignored";
        const operationKey = progress.externalWait?.operationKey;
        const currentCommandId = progress.externalWait?.metadata?.commandId;
        if (
          typeof operationKey !== "string" ||
          (typeof currentCommandId === "string"
            ? currentCommandId !== input.commandId
            : operationKey !== `runner-command:${input.commandId}`)
        ) {
          return ["succeeded", "failed", "cancelled", "expired"].includes(
            job.status
          )
            ? "late"
            : "ignored";
        }
        const metadata = progress.externalWait.metadata ?? {};
        if (
          (typeof metadata.runnerId === "string" &&
            metadata.runnerId !== input.runnerId) ||
          (typeof metadata.runnerSessionId === "string" &&
            metadata.runnerSessionId !== input.runnerSessionId) ||
          (typeof metadata.commandId === "string" &&
            metadata.commandId !== input.commandId)
        )
          return "ignored";
        if (metadata.executionKind === "external_agent_task") {
          const receiptAttempt = input.payload?.attempt;
          const receiptLeaseId = input.payload?.leaseId;
          const receiptFence = input.payload?.fenceVersion;
          if (
            !Number.isSafeInteger(receiptAttempt) ||
            receiptAttempt !== job.attempt ||
            typeof metadata.leaseId !== "string" ||
            receiptLeaseId !== metadata.leaseId ||
            !Number.isSafeInteger(receiptFence) ||
            receiptFence !== metadata.fenceVersion
          )
            return "ignored";
        }
        const eventType = `RUNNER_${input.eventType}`.slice(0, 100);
        const eventKey =
          `runner-receipt:${input.commandId}:${input.eventId}`.slice(0, 200);
        if (await repo.findEventByIdempotency(input.jobId, eventKey))
          return "duplicate";
        await repo.insertEvent({
          workerJobId: input.jobId,
          eventType,
          attemptId: (await repo.findAttempt(input.jobId, job.attempt))?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: {
            commandId: input.commandId,
            eventId: input.eventId,
            sequence: input.sequence,
            runnerId: input.runnerId,
            runnerSessionId: input.runnerSessionId,
            ...(input.payload ?? {}),
          },
        });
        return "recorded";
      });
    },

    /** Advance one semantic Computer Use job to the next command on the same
     * external-wait seam. The operation key remains stable; only the current
     * fenced command identity and semantic lineage projection advance. */
    async advanceComputerUseRunnerStage(
      jobId: string,
      operationKey: string,
      input: {
        currentCommandId: string;
        nextCommandId: string;
        nextStage: string;
        metadata?: Record<string, unknown>;
      },
      now = new Date()
    ): Promise<boolean> {
      if (
        !jobId.trim() ||
        !operationKey.trim() ||
        !input.currentCommandId.trim() ||
        !input.nextCommandId.trim() ||
        !input.nextStage.trim()
      )
        return false;
      if (input.metadata)
        validateBoundedPayload(
          input.metadata,
          "computerUse.runnerStage.metadata"
        );
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "waiting_external") return false;
        const progress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const externalWait =
          progress.externalWait && typeof progress.externalWait === "object"
            ? (progress.externalWait as Record<string, unknown>)
            : {};
        const metadata =
          externalWait.metadata &&
          typeof externalWait.metadata === "object" &&
          !Array.isArray(externalWait.metadata)
            ? (externalWait.metadata as Record<string, unknown>)
            : {};
        if (
          externalWait.operationKey !== operationKey ||
          metadata.commandId !== input.currentCommandId
        )
          return false;
        const eventKey = `runner-stage:${jobId}:${job.attempt}:${input.nextCommandId}`;
        if (await repo.findEventByIdempotency(jobId, eventKey)) return true;
        const nextMetadata = {
          ...metadata,
          ...(input.metadata ?? {}),
          commandId: input.nextCommandId,
          commandStage: input.nextStage,
        };
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "waiting_external",
          expectedAttempt: job.attempt,
          values: {
            statusReason: `runner_${input.nextStage}`.slice(0, 100),
            progressJson: {
              ...progress,
              externalWait: {
                ...externalWait,
                metadata: redactJobPayload(nextMetadata) as Record<
                  string,
                  unknown
                >,
              },
            },
            updatedAt: now,
          },
        });
        if (!updated) return false;
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "RUNNER_STAGE_ADVANCED",
          attemptId: (await repo.findAttempt(jobId, job.attempt))?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: {
            operationKey,
            previousCommandId: input.currentCommandId,
            commandId: input.nextCommandId,
            stage: input.nextStage,
            ...(input.metadata ?? {}),
          },
        });
        return true;
      });
    },

    /**
     * Project an existing Approval Service request onto the canonical
     * computer-use external wait. This deliberately does not add a lifecycle
     * status: `waiting_external` remains the only durable worker state while
     * the bounded approval projection explains why the lease is released.
     */
    async requestComputerUseApproval(
      jobId: string,
      input: ComputerUseApprovalRequestInput,
      now = new Date()
    ): Promise<"requested" | "duplicate" | "ignored"> {
      if (
        !jobId.trim() ||
        !input.tenantId.trim() ||
        !input.operationKey.trim() ||
        !input.approvalRequestId.trim() ||
        !input.runnerId.trim() ||
        !input.runnerSessionId.trim() ||
        !input.capabilitySnapshotId.trim() ||
        !input.capabilitySnapshotRevision.trim() ||
        !input.currentCommandId.trim() ||
        !input.actionId.trim()
      )
        return "ignored";
      validateBoundedPayload(
        input.semanticState,
        "computerUse.approval.semanticState"
      );
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (
          !job ||
          job.tenantId !== input.tenantId ||
          job.status !== "waiting_external"
        )
          return "ignored";
        const progress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const externalWait =
          progress.externalWait &&
          typeof progress.externalWait === "object" &&
          !Array.isArray(progress.externalWait)
            ? (progress.externalWait as Record<string, unknown>)
            : {};
        const metadata =
          externalWait.metadata &&
          typeof externalWait.metadata === "object" &&
          !Array.isArray(externalWait.metadata)
            ? (externalWait.metadata as Record<string, unknown>)
            : {};
        if (
          externalWait.operationKey !== input.operationKey ||
          metadata.commandId !== input.currentCommandId
        )
          return "ignored";
        if (
          metadata.runnerId !== input.runnerId ||
          metadata.runnerSessionId !== input.runnerSessionId ||
          metadata.capabilitySnapshotId !== input.capabilitySnapshotId ||
          metadata.capabilitySnapshotRevision !==
            input.capabilitySnapshotRevision
        )
          return "ignored";
        const existing =
          metadata.approval &&
          typeof metadata.approval === "object" &&
          !Array.isArray(metadata.approval)
            ? (metadata.approval as Record<string, unknown>)
            : null;
        if (existing) {
          return existing.requestId === input.approvalRequestId &&
            existing.state === "pending"
            ? "duplicate"
            : "ignored";
        }
        const eventKey =
          `computer-use-approval-requested:${jobId}:${input.approvalRequestId}`.slice(
            0,
            200
          );
        if (await repo.findEventByIdempotency(jobId, eventKey))
          return "duplicate";
        const approval = {
          state: "pending",
          requestId: input.approvalRequestId,
          actionId: input.actionId,
          commandId: input.currentCommandId,
          runnerId: input.runnerId,
          runnerSessionId: input.runnerSessionId,
          capabilitySnapshotId: input.capabilitySnapshotId,
          capabilitySnapshotRevision: input.capabilitySnapshotRevision,
          fencingVersion: job.fencingVersion,
          operationKey: input.operationKey,
          requestedAt: now.toISOString(),
          semanticState: input.semanticState,
        };
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "waiting_external",
          expectedTenantId: input.tenantId,
          expectedAttempt: job.attempt,
          values: {
            statusReason: "waiting_approval",
            progressJson: {
              ...progress,
              externalWait: {
                ...externalWait,
                metadata: redactJobPayload({ ...metadata, approval }) as Record<
                  string,
                  unknown
                >,
              },
            },
            updatedAt: now,
          },
        });
        if (!updated) return "ignored";
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "WAITING_APPROVAL",
          attemptId: (await repo.findAttempt(jobId, job.attempt))?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: {
            operationKey: input.operationKey,
            approvalRequestId: input.approvalRequestId,
            actionId: input.actionId,
            commandId: input.currentCommandId,
            runnerId: input.runnerId,
            runnerSessionId: input.runnerSessionId,
            capabilitySnapshotId: input.capabilitySnapshotId,
            capabilitySnapshotRevision: input.capabilitySnapshotRevision,
            fencingVersion: job.fencingVersion,
            requestedAt: now.toISOString(),
          },
        });
        return "requested";
      });
    },

    /**
     * Apply one Approval Service decision to the same Feature 195 job. The
     * transaction fences request/job/session/action/generation and makes the
     * approve path enqueue exactly one continuation or closes the job without
     * any Runner dispatch on rejection.
     */
    async resolveComputerUseApproval(
      input: ComputerUseApprovalDecisionInput,
      now = new Date()
    ): Promise<"resumed" | "failed" | "duplicate" | "ignored"> {
      if (
        !input.jobId.trim() ||
        !input.tenantId.trim() ||
        !input.operationKey.trim() ||
        !input.approvalRequestId.trim() ||
        !input.runnerId.trim() ||
        !input.adapter.trim() ||
        !input.actionId.trim() ||
        !input.runnerSessionId.trim() ||
        !Number.isSafeInteger(input.fencingVersion) ||
        !Number.isSafeInteger(input.approverId)
      )
        return "ignored";
      return repository.transaction(async repo => {
        const job = await repo.findJob(input.jobId);
        if (!job || job.tenantId !== input.tenantId) return "ignored";
        const eventKey =
          `computer-use-approval-resolved:${input.jobId}:${input.approvalRequestId}:${input.decision}`.slice(
            0,
            200
          );
        if (await repo.findEventByIdempotency(input.jobId, eventKey))
          return "duplicate";
        if (job.status !== "waiting_external") return "ignored";
        const progress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const externalWait =
          progress.externalWait &&
          typeof progress.externalWait === "object" &&
          !Array.isArray(progress.externalWait)
            ? (progress.externalWait as Record<string, unknown>)
            : {};
        const metadata =
          externalWait.metadata &&
          typeof externalWait.metadata === "object" &&
          !Array.isArray(externalWait.metadata)
            ? (externalWait.metadata as Record<string, unknown>)
            : {};
        const approval =
          metadata.approval &&
          typeof metadata.approval === "object" &&
          !Array.isArray(metadata.approval)
            ? (metadata.approval as Record<string, unknown>)
            : null;
        if (
          externalWait.operationKey !== input.operationKey ||
          !approval ||
          approval.state !== "pending" ||
          approval.requestId !== input.approvalRequestId ||
          approval.actionId !== input.actionId ||
          approval.runnerId !== input.runnerId ||
          approval.runnerSessionId !== input.runnerSessionId ||
          approval.fencingVersion !== input.fencingVersion ||
          job.fencingVersion !== input.fencingVersion
        )
          return "ignored";
        const attempt = await repo.findAttempt(input.jobId, job.attempt);
        const resolvedApproval = {
          ...approval,
          state: input.decision,
          approverId: input.approverId,
          resolvedAt: now.toISOString(),
        };
        if (input.decision === "rejected") {
          const updated = await repo.updateJob({
            jobId: input.jobId,
            expectedStatus: "waiting_external",
            expectedTenantId: input.tenantId,
            expectedAttempt: job.attempt,
            values: {
              status: "failed",
              statusReason: "approval_rejected",
              failureReason: "APPROVAL_DENIED",
              errorCode: "APPROVAL_DENIED",
              errorMessage: "The certified browser action was rejected",
              operatorReviewRequired: false,
              finishedAt: now,
              updatedAt: now,
              progressJson: {
                ...progress,
                externalWait: {
                  ...externalWait,
                  metadata: redactJobPayload({
                    ...metadata,
                    approval: resolvedApproval,
                  }) as Record<string, unknown>,
                },
              },
            },
          });
          if (!updated) return "ignored";
          await repo.insertEvent({
            workerJobId: input.jobId,
            eventType: "APPROVAL_RESOLVED",
            attemptId: attempt?.id,
            eventIdempotencyKey: eventKey,
            payloadJson: {
              approvalRequestId: input.approvalRequestId,
              decision: input.decision,
              actionId: input.actionId,
              approverId: input.approverId,
              resolvedAt: now.toISOString(),
            },
          });
          await repo.insertEvent({
            workerJobId: input.jobId,
            eventType: "APPROVAL_REJECTED",
            attemptId: attempt?.id,
            eventIdempotencyKey:
              `computer-use-approval-rejected:${input.jobId}:${input.approvalRequestId}`.slice(
                0,
                200
              ),
            payloadJson: {
              approvalRequestId: input.approvalRequestId,
              actionId: input.actionId,
              reason: "APPROVAL_DENIED",
            },
          });
          await repo.insertEvent({
            workerJobId: input.jobId,
            eventType: "FAILED",
            attemptId: attempt?.id,
            eventIdempotencyKey:
              `computer-use-approval-failed:${input.jobId}:${input.approvalRequestId}`.slice(
                0,
                200
              ),
            payloadJson: {
              code: "APPROVAL_DENIED",
              operatorReviewRequired: false,
            },
          });
          return "failed";
        }

        const originalInput =
          job.inputJson &&
          typeof job.inputJson === "object" &&
          !Array.isArray(job.inputJson)
            ? (job.inputJson as Record<string, unknown>)
            : {};
        const originalPayload =
          originalInput.payload &&
          typeof originalInput.payload === "object" &&
          !Array.isArray(originalInput.payload)
            ? (originalInput.payload as Record<string, unknown>)
            : {};
        const continuation = {
          approvalRequestId: input.approvalRequestId,
          actionId: input.actionId,
          runnerId: input.runnerId,
          runnerSessionId: input.runnerSessionId,
          capabilitySnapshotId: approval.capabilitySnapshotId,
          capabilitySnapshotRevision: approval.capabilitySnapshotRevision,
          fencingVersion: input.fencingVersion,
          semanticState: approval.semanticState,
        };
        const resumedInput = {
          ...originalInput,
          payload: { ...originalPayload, approvalContinuation: continuation },
        };
        validateBoundedPayload(
          resumedInput,
          "computerUse.approval.resumeInput"
        );
        const resumeDigest = createHash("sha256")
          .update(input.approvalRequestId, "utf8")
          .digest("hex")
          .slice(0, 32);
        const updated = await repo.updateJob({
          jobId: input.jobId,
          expectedStatus: "waiting_external",
          expectedTenantId: input.tenantId,
          expectedAttempt: job.attempt,
          values: {
            status: "queued",
            statusReason: "approval_approved",
            inputJson: resumedInput,
            progressJson: {
              ...progress,
              approvalContinuation: continuation,
              externalWait: {
                ...externalWait,
                metadata: redactJobPayload({
                  ...metadata,
                  approval: resolvedApproval,
                }) as Record<string, unknown>,
              },
            },
            updatedAt: now,
          },
        });
        if (!updated) return "ignored";
        await repo.insertEvent({
          workerJobId: input.jobId,
          eventType: "APPROVAL_RESOLVED",
          attemptId: attempt?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: {
            approvalRequestId: input.approvalRequestId,
            decision: input.decision,
            actionId: input.actionId,
            approverId: input.approverId,
            resolvedAt: now.toISOString(),
          },
        });
        await repo.insertEvent({
          workerJobId: input.jobId,
          eventType: "APPROVAL_APPROVED",
          attemptId: attempt?.id,
          eventIdempotencyKey:
            `computer-use-approval-approved:${input.jobId}:${input.approvalRequestId}`.slice(
              0,
              200
            ),
          payloadJson: {
            approvalRequestId: input.approvalRequestId,
            actionId: input.actionId,
          },
        });
        await repo.insertEvent({
          workerJobId: input.jobId,
          eventType: "RECOVERED",
          attemptId: attempt?.id,
          eventIdempotencyKey: `external-resumed:${input.jobId}:approval:${resumeDigest}`,
          payloadJson: {
            runnerId: input.runnerId,
            adapter: input.adapter,
            resumeKey: resumeDigest,
            previousAttempt: job.attempt,
            nextAttempt: job.attempt,
          },
        });
        await repo.insertEvent({
          workerJobId: input.jobId,
          eventType: "DISPATCH_REQUESTED",
          attemptId: attempt?.id,
          eventIdempotencyKey: `dispatch-requested:approval:${input.jobId}:${job.attempt}:${resumeDigest}`,
          payloadJson: {
            attempt: job.attempt,
            reason: "approval_approved",
            approvalRequestId: input.approvalRequestId,
          },
        });
        await repo.insertOutbox({
          workerJobId: input.jobId,
          attemptId: attempt?.id,
          envelopeVersion: job.contractVersion,
          envelopeJson: {
            jobId: input.jobId,
            businessAttempt: job.attempt,
            ...(attempt?.id ? { attemptId: attempt.id } : {}),
            reason: "approval_approved",
            resumeKey: resumeDigest,
          },
          dedupeKey: `job:${input.jobId}:attempt:${job.attempt}:approval-resume:${resumeDigest}`,
          nextAttemptAt: now,
        });
        return "resumed";
      });
    },

    async recordComputerUseSemanticStage(
      jobId: string,
      operationKey: string,
      stage: string,
      payload: Record<string, unknown> = {},
      now = new Date()
    ): Promise<boolean> {
      if (!jobId.trim() || !operationKey.trim() || !stage.trim()) return false;
      validateBoundedPayload(payload, "computerUse.semanticStage.payload");
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (
          !job ||
          ["succeeded", "failed", "cancelled", "expired"].includes(job.status)
        )
          return false;
        const progress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as {
                externalWait?: { operationKey?: unknown };
              })
            : {};
        if (progress.externalWait?.operationKey !== operationKey) return false;
        const digest = createHash("sha256")
          .update(JSON.stringify(payload), "utf8")
          .digest("hex")
          .slice(0, 32);
        const eventKey = `computer-use-stage:${jobId}:${job.attempt}:${stage}:${digest}`;
        if (await repo.findEventByIdempotency(jobId, eventKey)) return true;
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: stage.slice(0, 100),
          attemptId: (await repo.findAttempt(jobId, job.attempt))?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: {
            operationKey,
            stage,
            recordedAt: now.toISOString(),
            ...payload,
          },
        });
        return true;
      });
    },

    /** Keep a Computer Use job in the existing external-wait state while the
     * Spec 208 independent verifier evaluates the post-action evidence. */
    async markComputerUseVerificationPending(
      jobId: string,
      operationKey: string,
      metadata: Record<string, unknown> = {},
      now = new Date()
    ): Promise<boolean> {
      if (!jobId.trim() || !operationKey.trim()) return false;
      validateBoundedPayload(metadata, "computerUse.verification.metadata");
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "waiting_external") return false;
        const progress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const externalWait = progress.externalWait as
          { operationKey?: unknown } | undefined;
        if (externalWait?.operationKey !== operationKey) return false;
        const eventKey = `verification-waiting:${jobId}:${job.attempt}`;
        if (await repo.findEventByIdempotency(jobId, eventKey)) return true;
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "waiting_external",
          expectedAttempt: job.attempt,
          values: {
            statusReason: "waiting_verification",
            progressJson: {
              ...progress,
              computerUseVerification: {
                state: "waiting",
                operationKey,
                markedAt: now.toISOString(),
                ...metadata,
              },
            },
            updatedAt: now,
          },
        });
        if (!updated) return false;
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "WAITING_VERIFICATION",
          attemptId: (await repo.findAttempt(jobId, job.attempt))?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: { operationKey, ...metadata },
        });
        return true;
      });
    },

    async startComputerUseVerification(
      jobId: string,
      operationKey: string,
      verificationId: string,
      now = new Date()
    ): Promise<boolean> {
      if (!jobId.trim() || !operationKey.trim() || !verificationId.trim())
        return false;
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job || job.status !== "waiting_external") return false;
        const progress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const externalWait = progress.externalWait as
          { operationKey?: unknown } | undefined;
        if (externalWait?.operationKey !== operationKey) return false;
        const eventKey = `verification-started:${jobId}:${job.attempt}:${verificationId}`;
        if (await repo.findEventByIdempotency(jobId, eventKey)) return true;
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "waiting_external",
          expectedAttempt: job.attempt,
          values: {
            statusReason: "verification_started",
            progressJson: {
              ...progress,
              computerUseVerification: {
                ...((progress.computerUseVerification as
                  Record<string, unknown> | undefined) ?? {}),
                state: "started",
                operationKey,
                verificationId,
                startedAt: now.toISOString(),
              },
            },
            updatedAt: now,
          },
        });
        if (!updated) return false;
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "VERIFICATION_STARTED",
          attemptId: (await repo.findAttempt(jobId, job.attempt))?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: { operationKey, verificationId },
        });
        return true;
      });
    },

    async completeComputerUseVerification(
      jobId: string,
      operationKey: string,
      input: {
        verificationId: string;
        result: "PASS" | "FAIL" | "REOBSERVE" | "INCONCLUSIVE";
        reasonCode: string;
        verificationEvidenceRef: string;
      },
      now = new Date()
    ): Promise<"succeeded" | "waiting" | "ignored"> {
      if (
        !jobId.trim() ||
        !operationKey.trim() ||
        !input.verificationId.trim() ||
        !input.reasonCode.trim() ||
        !input.verificationEvidenceRef.trim()
      )
        return "ignored";
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job) return "ignored";
        if (job.status === "succeeded") return "succeeded";
        if (job.status !== "waiting_external") return "ignored";
        const progress =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as Record<string, unknown>)
            : {};
        const externalWait = progress.externalWait as
          { operationKey?: unknown } | undefined;
        if (externalWait?.operationKey !== operationKey) return "ignored";
        const eventKey = `verification-completed:${jobId}:${input.verificationId}`;
        if (await repo.findEventByIdempotency(jobId, eventKey))
          return "waiting";
        const attempt = await repo.findAttempt(jobId, job.attempt);
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "VERIFICATION_COMPLETED",
          attemptId: attempt?.id,
          eventIdempotencyKey: eventKey,
          payloadJson: {
            operationKey,
            verificationId: input.verificationId,
            result: input.result,
            reasonCode: input.reasonCode.slice(0, 200),
            verificationEvidenceRef: input.verificationEvidenceRef.slice(
              0,
              255
            ),
          },
        });
        const verificationProgress = {
          ...progress,
          computerUseVerification: {
            ...((progress.computerUseVerification as
              Record<string, unknown> | undefined) ?? {}),
            state:
              input.result === "PASS"
                ? "completed"
                : input.result.toLowerCase(),
            operationKey,
            verificationId: input.verificationId,
            result: input.result,
            reasonCode: input.reasonCode.slice(0, 200),
            verificationEvidenceRef: input.verificationEvidenceRef.slice(
              0,
              255
            ),
            completedAt: now.toISOString(),
          },
        };
        if (input.result !== "PASS") {
          await repo.updateJob({
            jobId,
            expectedStatus: "waiting_external",
            expectedAttempt: job.attempt,
            values: {
              statusReason: `verification_${input.result.toLowerCase()}`,
              progressJson: verificationProgress,
              updatedAt: now,
            },
          });
          return "waiting";
        }
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "waiting_external",
          expectedAttempt: job.attempt,
          values: {
            status: "succeeded",
            statusReason: "verified",
            resultRef: input.verificationEvidenceRef.slice(0, 255),
            errorCode: null,
            errorMessage: null,
            progressJson: verificationProgress,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            finishedAt: now,
            updatedAt: now,
          },
        });
        if (!updated) return "ignored";
        if (attempt)
          await repo.updateAttempt({
            attemptId: attempt.id,
            values: {
              finishedAt: now,
              terminalClass: "succeeded",
              recoveryReason: "independent_verification_passed",
            },
          });
        await repo.cancelUnpublishedOutbox({
          jobId,
          reason: "verified:computer_use",
          cancelledAt: now,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "COMPLETED",
          attemptId: attempt?.id,
          eventIdempotencyKey: `computer-use-verified:${jobId}:${input.verificationId}`,
          payloadJson: {
            operationKey,
            verificationId: input.verificationId,
            verificationEvidenceRef: input.verificationEvidenceRef,
            source: "spec208-independent-verifier",
          },
        });
        return "succeeded";
      });
    },

    /** Guarded terminal settlement for a provider poller that reacquired the
     * external operation by its durable operation key. No worker lease is
     * required because the waiting state deliberately released it. */
    async completeExternal(
      jobId: string,
      resultRef: string,
      operationKey: string,
      now = new Date(),
      pollerLeaseTokenHash?: string
    ): Promise<boolean> {
      const safeResultRef = normalizeResultReference(resultRef);
      if (
        !safeResultRef ||
        safeResultRef.length > 255 ||
        !operationKey.trim() ||
        operationKey.length > 200
      )
        return false;
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (!job) return false;
        const externalWait =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as { externalWait?: { operationKey?: string } })
                .externalWait
            : undefined;
        if (externalWait?.operationKey !== operationKey) return false;
        if (
          pollerLeaseTokenHash &&
          repo.assertProviderPollLease &&
          !(await repo.assertProviderPollLease({
            operationKey,
            pollerLeaseTokenHash,
          }))
        )
          return false;
        if (job.status === "succeeded") return true;
        if (job.status !== "waiting_external") return false;
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: "waiting_external",
          expectedAttempt: job.attempt,
          values: {
            status: "succeeded",
            statusReason: "provider_completed",
            resultRef: safeResultRef,
            errorCode: null,
            errorMessage: null,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            finishedAt: now,
          },
        });
        if (!updated) return false;
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt)
          await repo.updateAttempt({
            attemptId: currentAttempt.id,
            values: {
              finishedAt: now,
              terminalClass: "succeeded",
              recoveryReason: "provider_poll_completed",
            },
          });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "COMPLETED",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `provider-completed:${operationKey}`,
          payloadJson: {
            operationKey,
            resultRef: safeResultRef,
            source: "provider-poller",
          },
        });
        return true;
      });
    },

    async expireDeadline(
      jobId: string,
      now = new Date()
    ): Promise<"expired" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (
          !job ||
          ["succeeded", "failed", "cancelled", "expired"].includes(job.status)
        )
          return "ignored";
        const externalWait =
          job.progressJson &&
          typeof job.progressJson === "object" &&
          !Array.isArray(job.progressJson)
            ? (job.progressJson as { externalWait?: { operationKey?: string } })
                .externalWait
            : undefined;
        // User-paused storyboard runs are resumable and must not become
        // terminal merely because the user left the page for a while.
        if (
          job.status === "waiting_external" &&
          externalWait?.operationKey?.startsWith("storyboard.pause:")
        )
          return "ignored";
        const policy = (job.retryPolicyJson ?? {}) as Record<string, unknown>;
        const configuredDeadline = Number(policy.deadlineMs);
        const deadlineMs =
          Number.isFinite(configuredDeadline) && configuredDeadline > 0
            ? configuredDeadline
            : job.timeoutSeconds * 1000;
        if (now.getTime() < job.createdAt.getTime() + deadlineMs)
          return "ignored";
        const updated = await repo.updateJob({
          jobId,
          expectedStatus: job.status,
          expectedAttempt: job.attempt,
          values: {
            status: "expired",
            statusReason: "job_deadline",
            errorCode: "JOB_DEADLINE_EXPIRED",
            errorMessage: "Job deadline has elapsed",
            nextRetryAt: null,
            leaseOwnerToken: null,
            leaseExpiresAt: null,
            finishedAt: now,
          },
        });
        if (!updated) return "ignored";
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        if (currentAttempt)
          await repo.updateAttempt({
            attemptId: currentAttempt.id,
            values: {
              finishedAt: now,
              terminalClass: "expired",
              recoveryReason: "job_deadline",
            },
          });
        await repo.cancelUnpublishedOutbox({
          jobId,
          reason: "expired:job_deadline",
          cancelledAt: now,
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "TIMEOUT",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `deadline-timeout:${jobId}:${job.attempt}`,
          payloadJson: { kind: "deadline" },
        });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "EXPIRED",
          attemptId: currentAttempt?.id,
          eventIdempotencyKey: `deadline-expired:${jobId}:${job.attempt}`,
          payloadJson: { reason: "job_deadline" },
        });
        return "expired";
      });
    },

    async recoverExpiredLease(
      jobId: string,
      now = new Date()
    ): Promise<"recovered" | "ignored"> {
      return repository.transaction(async repo => {
        const job = await repo.findJob(jobId);
        if (
          !job ||
          !["leased", "running", "waiting_external"].includes(job.status) ||
          !job.leaseExpiresAt ||
          job.leaseExpiresAt > now
        )
          return "ignored";
        const currentAttempt = await repo.findAttempt(jobId, job.attempt);
        const policy = (job.retryPolicyJson ?? {}) as Record<string, unknown>;
        const withinDeadline =
          !Number.isFinite(Number(policy.deadlineMs)) ||
          now.getTime() < job.createdAt.getTime() + Number(policy.deadlineMs);
        const shouldRetry = withinDeadline && job.attempt < job.maxAttempts;
        const nextAttempt = shouldRetry ? job.attempt + 1 : job.attempt;
        const nextAttemptId = shouldRetry ? randomUUID() : undefined;
        const nextStatus = shouldRetry ? "retry_scheduled" : "expired";
        const baseDelayMs =
          Number.isFinite(Number(policy.baseDelayMs)) &&
          Number(policy.baseDelayMs) >= 0
            ? Number(policy.baseDelayMs)
            : 1000;
        const maxDelayMs =
          Number.isFinite(Number(policy.maxDelayMs)) &&
          Number(policy.maxDelayMs) >= baseDelayMs
            ? Number(policy.maxDelayMs)
            : 900000;
        const jitter =
          policy.jitter === "bounded" || policy.jitter === "recorded"
            ? policy.jitter
            : "none";
        const retryDelay = calculateRetryDelay(
          job.attempt,
          baseDelayMs,
          maxDelayMs,
          jitter,
          job.id
        );
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
            errorCode: shouldRetry ? "LEASE_EXPIRED_RETRYING" : "LEASE_EXPIRED",
            errorMessage:
              "Execution lease expired before the attempt completed",
          },
        });
        if (!updated) return "ignored";
        if (currentAttempt)
          await repo.updateAttempt({
            attemptId: currentAttempt.id,
            values: {
              finishedAt: now,
              terminalClass: nextStatus === "expired" ? "expired" : "retryable",
              recoveryReason: "lease_expired",
            },
          });
        if (nextStatus === "expired")
          await repo.cancelUnpublishedOutbox({
            jobId,
            reason: "expired:lease_expired",
            cancelledAt: now,
          });
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "LEASE_EXPIRED",
          eventIdempotencyKey: `lease-expired:${jobId}:${job.fencingVersion}`,
          payloadJson: { attempt: job.attempt, priorStatus: job.status },
        });
        if (shouldRetry && nextAttemptId) {
          await repo.insertAttempt({
            id: nextAttemptId,
            workerJobId: jobId,
            attempt: nextAttempt,
            leaseGeneration: 0,
            recoveryReason: "lease_expired",
          });
          await repo.insertEvent({
            workerJobId: jobId,
            eventType: "DISPATCH_REQUESTED",
            attemptId: nextAttemptId,
            eventIdempotencyKey: `dispatch-requested:${jobId}:${nextAttempt}`,
            payloadJson: { attempt: nextAttempt, reason: "lease_expired" },
          });
          await repo.insertOutbox({
            workerJobId: jobId,
            attemptId: nextAttemptId,
            envelopeVersion: job.contractVersion,
            envelopeJson: {
              jobId,
              businessAttempt: nextAttempt,
              contractVersion: job.contractVersion,
              attemptId: nextAttemptId,
            },
            dedupeKey: `job:${jobId}:attempt:${nextAttempt}`,
            nextAttemptAt: nowPlus(retryDelay, now),
          });
        }
        await repo.insertEvent({
          workerJobId: jobId,
          eventType: "RECOVERED",
          eventIdempotencyKey: `recovered:${jobId}:${job.fencingVersion}`,
          payloadJson: {
            nextStatus,
            nextAttempt,
            retryDelayMs: shouldRetry ? retryDelay : undefined,
            jitter: shouldRetry ? jitter : undefined,
          },
        });
        return "recovered";
      });
    },

    async assertActive(lease: LeaseContext): Promise<void> {
      await repository.transaction(async repo => {
        const job = await repo.findJob(lease.jobId);
        const attempt = job
          ? await repo.findAttempt(job.id, job.attempt)
          : null;
        if (
          !job ||
          !attempt ||
          attempt.id !== lease.attemptId ||
          attempt.leaseGeneration !== lease.fencingVersion ||
          job.status !== "running" ||
          job.leaseOwnerToken !== leaseHash(lease.leaseToken) ||
          job.fencingVersion !== lease.fencingVersion
        ) {
          throw new JobControlPlaneError(
            "JOB_LEASE_STALE",
            "Job lease is no longer active"
          );
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
  settlement?: { settlementKey: string; settlementType: string }
): Promise<void> {
  assertCanonicalJobTransition(expectedStatus, nextStatus);
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
    if (!updated)
      throw new JobControlPlaneError(
        "JOB_LEASE_STALE",
        "Job lease is no longer active"
      );
    if (settlement) {
      await repo.insertSettlement({
        workerJobId: lease.jobId,
        attemptId: lease.attemptId,
        settlementKey: settlement.settlementKey,
        settlementType: settlement.settlementType,
        payloadJson: redactJobPayload(payload) as Record<string, unknown>,
      });
      await repo.insertEvent({
        workerJobId: lease.jobId,
        eventType: "SETTLEMENT_RECORDED",
        attemptId: lease.attemptId,
        eventIdempotencyKey: `settlement:${settlement.settlementKey}`,
        payloadJson: {
          settlementType: settlement.settlementType,
          settlementKey: settlement.settlementKey,
        },
      });
    }
    if (eventType === "STARTED") {
      await repo.updateAttempt({
        attemptId: lease.attemptId,
        values: {
          startedAt: new Date(),
          leaseExpiresAt: values.leaseExpiresAt ?? null,
        },
      });
    } else if (eventType === "COMPLETED") {
      await repo.updateAttempt({
        attemptId: lease.attemptId,
        values: { finishedAt: new Date(), terminalClass: "succeeded" },
      });
    }
    await repo.insertEvent({
      workerJobId: lease.jobId,
      eventType,
      attemptId: lease.attemptId,
      eventIdempotencyKey: boundedEventKey(
        eventType.toLowerCase(),
        lease.attemptId,
        createHash("sha256")
          .update(JSON.stringify(payload), "utf8")
          .digest("hex")
      ),
      payloadJson: payload,
    });
  });
}

async function assertLeaseAttempt(
  repo: TxRepo,
  lease: LeaseContext,
  job: WorkerJob | null
): Promise<void> {
  if (!job)
    throw new JobControlPlaneError(
      "JOB_LEASE_STALE",
      "Job lease is no longer active"
    );
  const attempt = await repo.findAttempt(job.id, job.attempt);
  if (!attempt)
    throw new JobControlPlaneError(
      "JOB_LEASE_STALE",
      "Job attempt lease is no longer active"
    );
  assertCanonicalLeaseFence({
    expectedAttemptId: lease.attemptId,
    actualAttemptId: attempt.id,
    expectedFencingVersion: lease.fencingVersion,
    actualFencingVersion: attempt.leaseGeneration,
  });
}

export function isRetryableError(error: unknown): boolean {
  if (
    error &&
    typeof error === "object" &&
    "class" in error &&
    (error as { class?: unknown }).class === "retryable"
  )
    return true;
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  } | null;
  const code = String(candidate?.code ?? candidate?.name ?? "").toUpperCase();
  const status = Number(candidate?.statusCode ?? candidate?.status);
  return (
    [
      "TIMEOUTERROR",
      "ABORTERROR",
      "ECONNRESET",
      "ETIMEDOUT",
      "EAI_AGAIN",
      "ECONNREFUSED",
      "ENETUNREACH",
      "EHOSTUNREACH",
      "UNAVAILABLE",
      "TEMPORARY_UNAVAILABLE",
      "RETRYABLE",
    ].includes(code) ||
    /^HTTP_?(408|429|502|503|504)$/.test(code) ||
    status === 408 ||
    status === 429 ||
    (Number.isInteger(status) && status >= 500 && status <= 599)
  );
}

/**
 * Convert executor failures into the three control-plane classes. A
 * non-retryable error is not automatically permanent: provider ambiguity,
 * malformed runtime errors, and missing evidence must remain operator-review
 * failures instead of being silently treated as safe business failures.
 */
export function classifyJobError(
  error: unknown
): "retryable" | "permanent" | "unknown" {
  if (error && typeof error === "object" && "class" in error) {
    const explicitClass = (error as { class?: unknown }).class;
    if (
      explicitClass === "retryable" ||
      explicitClass === "permanent" ||
      explicitClass === "unknown"
    )
      return explicitClass;
  }
  if (isRetryableError(error)) return "retryable";
  const candidate = error as {
    code?: unknown;
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
  } | null;
  const code = String(candidate?.code ?? candidate?.name ?? "").toUpperCase();
  const status = Number(candidate?.statusCode ?? candidate?.status);
  if (
    (Number.isInteger(status) &&
      status >= 400 &&
      status <= 499 &&
      status !== 408 &&
      status !== 429) ||
    [
      "INVALID_INPUT",
      "INVALID_REQUEST",
      "INVALID_CREDENTIAL",
      "PERMISSION_DENIED",
      "FORBIDDEN",
      "UNAUTHORIZED",
      "INSUFFICIENT_CREDIT",
      "POLICY_REJECTED",
      "UNSUPPORTED_FORMAT",
      "UNSUPPORTED_JOB_CONTRACT",
      "JOB_EXECUTOR_UNREGISTERED",
      "JOB_CONTEXT_INVALID",
      "AUTOMATION_DOMAIN_FAILURE",
    ].includes(code) ||
    (/^HTTP_?4\d{2}$/.test(code) && !/^HTTP_?(408|429)$/.test(code))
  ) {
    return "permanent";
  }
  return "unknown";
}

export function calculateRetryDelay(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 900_000,
  jitter: "none" | "bounded" | "recorded" = "none",
  seed = ""
): number {
  if (
    !Number.isSafeInteger(attempt) ||
    attempt < 1 ||
    !Number.isFinite(baseDelayMs) ||
    baseDelayMs < 0 ||
    !Number.isFinite(maxDelayMs) ||
    maxDelayMs < baseDelayMs
  ) {
    throw new JobControlPlaneError(
      "RETRY_POLICY_INVALID",
      "Retry delay policy is invalid"
    );
  }
  if (jitter !== "none" && jitter !== "bounded" && jitter !== "recorded")
    throw new JobControlPlaneError(
      "RETRY_POLICY_INVALID",
      "Retry jitter policy is invalid"
    );
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
  if (jitter === "none" || exponential === 0) return exponential;
  const digest = createHash("sha256")
    .update(`${seed}:${attempt}`, "utf8")
    .digest();
  const fraction = digest.readUInt32BE(0) / 0xffffffff;
  return Math.min(maxDelayMs, Math.round(exponential * (1 + fraction * 0.25)));
}

export {
  canonicalizeJobDefinition,
  computeJobDefinitionHash,
  redactJobPayload,
  validateJobDefinition,
  normalizeIdempotencyKey,
};
