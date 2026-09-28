/**
 * Feature 135 — Hermes Grok media worker: connection-control job
 * enqueue-and-track + the 60s terminal-state sweep.
 *
 * Owns:
 *  - `enqueueHermesConnectionControlJob` — inserts one of the three control
 *    job types (`hermes_connection_authorize` / `_probe` / `_disconnect`),
 *    reusing section-03's `buildAuthorizeJobInsert` / `buildProbeJobInsert`
 *    / `buildDisconnectJobInsert` verbatim (no duplicated insert-shaping
 *    logic). Enforces the "max 1 concurrent control job per connection"
 *    rule and NEVER calls any admission/rate-limit function — control jobs
 *    are exempt from the media-generation rate limiter (spec §10).
 *  - `settleHermesConnectionJob` / `runHermesConnectionSettlementTick` /
 *    `startHermesConnectionJobSweep` / `stopHermesConnectionJobSweep` — a
 *    60s sweep of terminal-but-unsettled `worker_jobs` rows so a job that
 *    nobody polls (e.g. the user closed the tab mid-authorize) still
 *    settles its connection row. Settlement for the three control job
 *    types is NOT reimplemented here — it calls section-03's
 *    `settleHermesConnectionFromControlJob` seam directly (the single
 *    source of truth for that mapping). This module ADDS the
 *    `hermes_media_*` terminal-job connection-status side effect
 *    (`onTerminalHermesMediaJob`, extended by section 06 for fee
 *    reconciliation) and the `hermes_connection_settled` idempotency
 *    marker shared by both job families.
 *
 * Namespace note: this is the `hermesMedia`/`hermes_media` namespace — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import { and, desc, eq, inArray, notExists, notInArray, sql } from "drizzle-orm";

import { debugError } from "../_core/logger";
import { getDb } from "../db";
import {
  workerJobEvents,
  workerJobs,
  type HermesProviderConnection,
  type InsertHermesProviderConnection,
  type InsertWorkerJob,
  type Worker,
  type WorkerJob,
} from "../../drizzle/schema";
import {
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
  workerJobStatusValues,
} from "../../shared/workerRuntime";
import { HERMES_CONNECTION_SETTLED_EVENT_TYPE } from "../../shared/hermesMedia";
import {
  buildAuthorizeJobInsert,
  buildDisconnectJobInsert,
  buildProbeJobInsert,
  defaultHermesConnectionRepo,
  settleHermesConnectionFromControlJob,
  type HermesConnectionRepo,
} from "./hermesConnectionService";
import { reconcileHermesMediaJobFee } from "./hermesMediaAdapter";
import { billingEnvelopeFromMetadata } from "./workerBillingService";
import {
  auditHermesConnectionEntitlementRestricted,
  auditHermesConnectionReauthRequired,
  recordHermesUsage,
} from "./hermesMediaObservability";
import type { HermesMediaJobContract } from "../../shared/hermesMedia";

// ────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────

/** Above the (section-05) media-job default priority (0) — control jobs
 *  should jump the media queue on the same worker (spec §10). */
export const HERMES_CONTROL_JOB_PRIORITY = 50;

const HERMES_CONNECTION_CONTROL_JOB_TYPES: ReadonlySet<string> = new Set([
  HERMES_CONNECTION_AUTH_JOB_TYPE,
  HERMES_CONNECTION_PROBE_JOB_TYPE,
  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
]);

const HERMES_MEDIA_JOB_TYPES: ReadonlySet<string> = new Set([
  HERMES_MEDIA_IMAGE_JOB_TYPE,
  HERMES_MEDIA_VIDEO_JOB_TYPE,
]);

const ALL_HERMES_JOB_TYPES = [...HERMES_CONNECTION_CONTROL_JOB_TYPES, ...HERMES_MEDIA_JOB_TYPES];

type WorkerJobStatusValue = (typeof workerJobStatusValues)[number];

const TERMINAL_FAILURE_STATUSES: ReadonlySet<string> = new Set(["failed", "canceled", "expired"]);
/** Single source of truth for "terminal" `worker_jobs.status` values — both
 *  `findNonTerminalControlJobForConnection` (NOT IN) and
 *  `listTerminalUnsettledHermesJobs` (IN) interpolate from this ONE set
 *  instead of each hand-maintaining their own literal SQL list. */
const TERMINAL_STATUSES: ReadonlySet<WorkerJobStatusValue> = new Set([
  "completed",
  "failed",
  "canceled",
  "expired",
]);

const SWEEP_INTERVAL_MS = 60_000;

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export interface HermesConnectionJobsRepo {
  findJobById(jobId: string): Promise<WorkerJob | null>;
  findNonTerminalControlJobForConnection(params: { connectionId: string; tenantId: string }): Promise<WorkerJob | null>;
  findWorkerById(params: { tenantId: string; workerId: string }): Promise<Worker | null>;
  insertJob(values: InsertWorkerJob): Promise<WorkerJob>;
  listTimedOutControlJobs(now: Date): Promise<WorkerJob[]>;
  expireTimedOutControlJob(params: { jobId: string; now: Date }): Promise<WorkerJob | null>;
  listTerminalUnsettledHermesJobs(): Promise<WorkerJob[]>;
  appendJobEvent(params: { jobId: string; eventType: string; payloadJson: Record<string, unknown> }): Promise<void>;
  updateConnectionRow(params: {
    tenantId?: string;
    connectionId: string;
    values: Partial<InsertHermesProviderConnection>;
  }): Promise<HermesProviderConnection>;
  findConnectionById(params: { tenantId?: string; connectionId: string }): Promise<HermesProviderConnection | null>;
}

export type HermesControlJobType =
  | typeof HERMES_CONNECTION_AUTH_JOB_TYPE
  | typeof HERMES_CONNECTION_PROBE_JOB_TYPE
  | typeof HERMES_CONNECTION_DISCONNECT_JOB_TYPE;

// ────────────────────────────────────────────────────────────────────────
// Default (DB-backed) repo
// ────────────────────────────────────────────────────────────────────────

export const defaultHermesConnectionJobsRepo: HermesConnectionJobsRepo = {
  async findJobById(jobId) {
    const db = getDb();
    const [row] = await db.select().from(workerJobs).where(eq(workerJobs.id, jobId)).limit(1);
    return row ?? null;
  },

  async findNonTerminalControlJobForConnection({ connectionId, tenantId }) {
    const db = getDb();
    const [row] = await db
      .select()
      .from(workerJobs)
      .where(and(
        eq(workerJobs.tenantId, tenantId),
        inArray(workerJobs.jobType, [...HERMES_CONNECTION_CONTROL_JOB_TYPES]),
        sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
        notInArray(workerJobs.status, [...TERMINAL_STATUSES]),
      ))
      .orderBy(desc(workerJobs.createdAt))
      .limit(1);
    return row ?? null;
  },

  async findWorkerById({ tenantId, workerId }) {
    return defaultHermesConnectionRepo.findWorkerById({ tenantId, workerId });
  },

  async insertJob(values) {
    const db = getDb();
    const [row] = await db.insert(workerJobs).values(values).returning();
    return row;
  },

  async listTimedOutControlJobs(now) {
    const db = getDb();
    return db
      .select()
      .from(workerJobs)
      .where(and(
        inArray(workerJobs.jobType, [...HERMES_CONNECTION_CONTROL_JOB_TYPES]),
        notInArray(workerJobs.status, [...TERMINAL_STATUSES]),
        sql`coalesce(${workerJobs.startedAt}, ${workerJobs.createdAt})
          + (${workerJobs.timeoutSeconds} * interval '1 second') <= ${now.toISOString()}::timestamptz`,
      ))
      .orderBy(workerJobs.startedAt)
      .limit(100);
  },

  async expireTimedOutControlJob({ jobId, now }) {
    const db = getDb();
    const [row] = await db
      .update(workerJobs)
      .set({
        status: "expired",
        statusReason: "Hermes connection control job exceeded its hard timeout",
        failureReason: "authorization_timeout",
        finishedAt: now,
        leaseOwnerToken: null,
        leaseExpiresAt: null,
      })
      .where(and(
        eq(workerJobs.id, jobId),
        inArray(workerJobs.jobType, [...HERMES_CONNECTION_CONTROL_JOB_TYPES]),
        notInArray(workerJobs.status, [...TERMINAL_STATUSES]),
      ))
      .returning();
    return row ?? null;
  },

  async listTerminalUnsettledHermesJobs() {
    const db = getDb();
    return db
      .select()
      .from(workerJobs)
      .where(and(
        inArray(workerJobs.jobType, ALL_HERMES_JOB_TYPES),
        inArray(workerJobs.status, [...TERMINAL_STATUSES]),
        notExists(
          db
            .select({ id: workerJobEvents.id })
            .from(workerJobEvents)
            .where(and(
              eq(workerJobEvents.workerJobId, workerJobs.id),
              eq(workerJobEvents.eventType, HERMES_CONNECTION_SETTLED_EVENT_TYPE),
            )),
        ),
      ));
  },

  async appendJobEvent({ jobId, eventType, payloadJson }) {
    const db = getDb();
    await db.insert(workerJobEvents).values({ workerJobId: jobId, eventType, payloadJson });
  },

  async updateConnectionRow({ tenantId, connectionId, values }) {
    return defaultHermesConnectionRepo.updateConnection({ tenantId, connectionId, values });
  },

  async findConnectionById({ tenantId, connectionId }) {
    return defaultHermesConnectionRepo.findConnectionById({ tenantId, connectionId });
  },
};

// ────────────────────────────────────────────────────────────────────────
// Enqueue
// ────────────────────────────────────────────────────────────────────────

function buildInsertForJobType(
  jobType: HermesControlJobType,
  params: {
    tenantId: string;
    connectionId: string;
    workerId: string;
    runtimeType: Worker["runtimeType"];
    requestedByUserId: number | null;
    profileReference: string;
  },
): InsertWorkerJob {
  if (jobType === HERMES_CONNECTION_AUTH_JOB_TYPE) return buildAuthorizeJobInsert(params);
  if (jobType === HERMES_CONNECTION_PROBE_JOB_TYPE) return buildProbeJobInsert(params);
  return buildDisconnectJobInsert(params);
}

/** `{ maxAttempts: 2 }` for probe (idempotent to re-run); authorize/
 *  disconnect get `{ maxAttempts: 1 }` — device codes are single-use and a
 *  logout/profile-removal re-run risks a confusing double-logout. */
function retryPolicyForJobType(jobType: HermesControlJobType): Record<string, unknown> {
  return jobType === HERMES_CONNECTION_PROBE_JOB_TYPE ? { maxAttempts: 2 } : { maxAttempts: 1 };
}

/** The unique index backing the `${jobType}:${connectionId}` idempotency
 *  key (`drizzle/schema.ts`'s `worker_jobs_tenant_idempotency_key_unique`). */
const WORKER_JOBS_IDEMPOTENCY_UNIQUE_CONSTRAINT = "worker_jobs_tenant_idempotency_key_unique";

/** True only for an actual Postgres unique-violation (SQLSTATE 23505) on
 *  the idempotency-key index — anything else (connection drop, syntax
 *  error, a totally unrelated constraint) must propagate to the caller
 *  instead of being silently reinterpreted as "someone else already
 *  enqueued this". Checks `.cause` too: drizzle-orm wraps the real postgres
 *  error (carrying `.code`/`.constraint`) inside `.cause`, so a caught
 *  error's own top-level `.code`/`.constraint` are undefined for a Drizzle
 *  query error. */
function isHermesJobIdempotencyKeyConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const cause = (error as { cause?: unknown }).cause;
  const causeRecord =
    cause && typeof cause === "object" ? (cause as Record<string, unknown>) : undefined;
  const code = (error as { code?: unknown }).code ?? causeRecord?.code;
  if (code === "23505") return true;
  const constraint = (error as { constraint?: unknown }).constraint ?? causeRecord?.constraint;
  if (typeof constraint === "string" && constraint.includes(WORKER_JOBS_IDEMPOTENCY_UNIQUE_CONSTRAINT)) return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.includes(WORKER_JOBS_IDEMPOTENCY_UNIQUE_CONSTRAINT);
}

/**
 * Enqueues one of the three connection-control job types. Reuses section-
 * 03's insert builders verbatim (capabilityRequirementsJson, inputJson,
 * timeoutSeconds are ALL theirs) and layers on this section's queue-
 * priority / retry-policy / idempotency-key concerns.
 *
 * Concurrency guard: a non-terminal control job already in flight for this
 * connection (any of the three types) short-circuits to `{ created: false,
 * job: existing }` — a terminal prior job never blocks. The
 * `${jobType}:${connectionId}` idempotency key is a second line of defense
 * against a race between two concurrent enqueue calls; a unique-conflict
 * insert re-reads and returns the row the winner created instead of
 * throwing.
 *
 * NEVER calls any admission/rate-limit function — control jobs are exempt
 * from the media-generation rate limiter (spec §10).
 */
export async function enqueueHermesConnectionControlJob(
  params: {
    jobType: HermesControlJobType;
    tenantId: string;
    requestedByUserId: number | null;
    connection: HermesProviderConnection;
    workerId: string;
  },
  deps: { repo?: HermesConnectionJobsRepo } = {},
): Promise<{ created: boolean; job: WorkerJob }> {
  const repo = deps.repo ?? defaultHermesConnectionJobsRepo;

  // Defense-in-depth (mirrors `onTerminalHermesMediaJob`'s guard): never let
  // a mismatched/forged `connection` argument enqueue a job against a
  // different tenant than the one the caller claims to be acting for.
  if (params.connection.tenantId !== params.tenantId) {
    throw new Error(
      `hermesConnectionJobs: connection ${params.connection.id} does not belong to tenant ${params.tenantId}`,
    );
  }

  const existing = await repo.findNonTerminalControlJobForConnection({
    connectionId: params.connection.id,
    tenantId: params.tenantId,
  });
  if (existing) return { created: false, job: existing };

  const worker = await repo.findWorkerById({ tenantId: params.tenantId, workerId: params.workerId });
  if (!worker) {
    throw new Error(`hermesConnectionJobs: worker ${params.workerId} not found for tenant ${params.tenantId}`);
  }

  const baseInsert = buildInsertForJobType(params.jobType, {
    tenantId: params.tenantId,
    connectionId: params.connection.id,
    workerId: params.workerId,
    runtimeType: worker.runtimeType,
    requestedByUserId: params.requestedByUserId,
    profileReference: params.connection.profileReference,
  });

  const insertValues: InsertWorkerJob = {
    ...baseInsert,
    statusReason: "hermes_connection_jobs",
    priority: HERMES_CONTROL_JOB_PRIORITY,
    retryPolicyJson: retryPolicyForJobType(params.jobType),
    idempotencyKey: `${params.jobType}:${params.connection.id}`,
  };

  try {
    const job = await repo.insertJob(insertValues);
    return { created: true, job };
  } catch (error) {
    // Only reinterpret an ACTUAL idempotency-key unique-violation as the
    // race — anything else (a dropped connection, an unrelated constraint,
    // a genuine bug) must propagate instead of being masked as "no-op,
    // someone else already enqueued this".
    if (!isHermesJobIdempotencyKeyConflict(error)) throw error;
    const raced = await repo.findNonTerminalControlJobForConnection({
      connectionId: params.connection.id,
      tenantId: params.tenantId,
    });
    if (raced) return { created: false, job: raced };
    throw error;
  }
}

// ────────────────────────────────────────────────────────────────────────
// Settlement
// ────────────────────────────────────────────────────────────────────────

function isTerminalStatus(status: string): boolean {
  return (TERMINAL_STATUSES as ReadonlySet<string>).has(status);
}

function extractConnectionId(job: Pick<WorkerJob, "capabilityRequirementsJson" | "inputJson">): string | null {
  const fromCapabilities = (job.capabilityRequirementsJson as Record<string, unknown> | null | undefined)?.connectionId;
  if (typeof fromCapabilities === "string" && fromCapabilities.length > 0) return fromCapabilities;
  const fromInput = (job.inputJson as Record<string, unknown> | null | undefined)?.connectionId;
  if (typeof fromInput === "string" && fromInput.length > 0) return fromInput;
  return null;
}

/** Classifies a terminal `hermes_media_*` job's `failureReason` for the
 *  connection-status side effect only (fee reconciliation is section 06).
 *  Constants-first (the section-04 vocabulary), substring fallback for
 *  anything else — mirrors `hermesConnectionService.ts`'s classifiers. */
function classifyMediaJobFailureForConnectionEffect(
  failureReason: string | null | undefined,
): "reauth_required" | "entitlement_restricted" | "other" {
  const reason = failureReason ?? "";
  if (reason === "entitlement_restricted") return "entitlement_restricted";
  if (reason === "reauth_required" || reason === "oauth_session_expired" || reason === "oauth_denied") {
    return "reauth_required";
  }
  const lower = reason.toLowerCase();
  if (lower.includes("403") || lower.includes("entitlement") || lower.includes("forbidden")) {
    return "entitlement_restricted";
  }
  if (
    lower.includes("reauth")
    || lower.includes("unauthorized")
    || lower.includes("invalid_grant")
    || lower.includes("revoked")
    || lower.includes("oauth session")
    || lower.includes("access token")
    || lower.includes("token expired")
  ) {
    return "reauth_required";
  }
  return "other";
}

/**
 * Named hook (section 06 extends it for fee reconciliation) — for now,
 * only applies the connection-status side effect for a terminal
 * `hermes_media_*` job with an auth-classified or 403-classified
 * `failureReason`: `reauth_required` / `entitlement_restricted`
 * respectively. A successful media job, or a failure classified `"other"`,
 * has no connection-status side effect here (a single failed media job is
 * not necessarily an auth/entitlement problem).
 */
export async function onTerminalHermesMediaJob(
  job: WorkerJob,
  deps: { repo?: HermesConnectionJobsRepo } = {},
): Promise<void> {
  const repo = deps.repo ?? defaultHermesConnectionJobsRepo;

  // Feature 135 section 06 — fee reconciliation runs for ANY terminal
  // hermes_media_* status (completed or failure alike), unlike the
  // connection-status side effect below which only cares about
  // auth/entitlement failures. Shares ONE implementation with
  // `reconcileTaskCredits`'s hermes branch (`server/routers/media.ts`) via
  // `reconcileHermesMediaJobFee` — this is the callee for a job that
  // reaches a terminal state via lease expiry and is never observed by a
  // polling client (the sweep's `listTerminalUnsettledHermesJobs` driver).
  // Redis idempotency (`credit:reconciled:<taskId>`) makes this safe even
  // if the generic per-event worker billing reconciliation already ran for
  // the same job's reservation.
  if ((TERMINAL_STATUSES as ReadonlySet<string>).has(job.status)) {
    const billing = billingEnvelopeFromMetadata(
      (job.instructionsJson as Record<string, unknown> | null | undefined)?.workerBilling,
    );
    // Raw status, unmapped — `reconcileHermesMediaJobFee` classifies
    // completed vs. failed/canceled/expired itself (and no-ops on anything
    // non-terminal as a defense-in-depth guard).
    try {
      await reconcileHermesMediaJobFee({ taskId: `hermes_${job.id}`, status: job.status, billing });
    } catch (error) {
      debugError("hermesConnectionJobs", `Failed to reconcile hermes media fee for job ${job.id}`, error);
    }

    // Feature 135 section 12 — usage row + quota bump. `onTerminalHermesMediaJob`
    // runs from two call sites now: (1) `workerRuntime.ts`'s
    // artifacts/complete dispatch, immediately after finalize, which ALSO
    // appends the `hermes_connection_settled` marker via
    // `settleHermesConnectionJob` (code review fix) — so a job that
    // completes through the normal path is excluded from
    // `listTerminalUnsettledHermesJobs` on the very next sweep tick; (2) the
    // 60s sweep itself, now a genuine backstop for whatever call site (1)
    // never got to (a crash between finalize and settlement, or a true
    // lease-expiry completion no poll/callback ever observes). Both call
    // sites are safe to run for the SAME job: `recordHermesUsage` is a
    // no-op for anything but `status === "completed"`, and is
    // Redis-idempotent (plus a durable `worker_job_events` marker check —
    // see `hermesMediaObservability.ts`) against being invoked twice for
    // the same job id.
    try {
      await recordHermesUsage({
        job,
        contract: (job.inputJson ?? {}) as Pick<HermesMediaJobContract, "settings">,
        feeCreditsKept: job.status === "completed" ? (billing?.reservedCredits ?? 0) : 0,
      });
    } catch (error) {
      debugError("hermesConnectionJobs", `Failed to record hermes usage for job ${job.id}`, error);
    }
  }

  if (!TERMINAL_FAILURE_STATUSES.has(job.status)) return;

  const connectionId = extractConnectionId(job);
  if (!connectionId) return;

  const connection = await repo.findConnectionById({ tenantId: job.tenantId, connectionId });
  if (!connection) return;
  // Defense-in-depth (section-03 review carry-forward item B): never let a
  // corrupted/forged job row drive a cross-tenant connection mutation.
  if (connection.tenantId !== job.tenantId) return;

  const classification = classifyMediaJobFailureForConnectionEffect(job.failureReason);
  if (classification === "entitlement_restricted") {
    await repo.updateConnectionRow({
      tenantId: job.tenantId,
      connectionId,
      values: {
        status: "entitlement_restricted",
        entitlementStatus: "restricted",
        metadataJson: { ...(connection.metadataJson ?? {}), lastError: "HERMES_ENTITLEMENT_RESTRICTED" },
      },
    });
    auditHermesConnectionEntitlementRestricted({
      userId: connection.ownerUserId,
      tenantId: job.tenantId,
      connectionId,
      scope: connection.scope,
    });
    return;
  }
  if (classification === "reauth_required") {
    await repo.updateConnectionRow({
      tenantId: job.tenantId,
      connectionId,
      values: {
        status: "reauth_required",
        metadataJson: { ...(connection.metadataJson ?? {}), lastError: "HERMES_REAUTH_REQUIRED" },
      },
    });
    // Code review FIX 4 — same rule as the probe-failure branch in
    // `hermesConnectionService.ts`: a media job failing with an
    // auth-invalidation reason is a real connection-health signal, not
    // just "one job failed" — it must be audited.
    auditHermesConnectionReauthRequired({
      userId: connection.ownerUserId,
      tenantId: job.tenantId,
      connectionId,
      scope: connection.scope,
    });
  }
}

/** Only `findConnectionById`/`updateConnection` are ever invoked by
 *  `settleHermesConnectionFromControlJob` — a deliberate partial-repo cast
 *  so this module never re-implements `HermesConnectionRepo`'s full DB
 *  surface (findConnections/insertConnection/etc). */
function toConnectionServiceRepo(repo: HermesConnectionJobsRepo): HermesConnectionRepo {
  return {
    findConnectionById: (params: { tenantId?: string; connectionId: string }) => repo.findConnectionById(params),
    updateConnection: (params: {
      tenantId?: string;
      connectionId: string;
      values: Partial<InsertHermesProviderConnection>;
    }) => repo.updateConnectionRow(params),
  } as unknown as HermesConnectionRepo;
}

/**
 * Settles ONE terminal job (idempotent — a job that already carries the
 * `hermes_connection_settled` event is skipped by
 * `listTerminalUnsettledHermesJobs`, and re-running this function against
 * an already-settled connection row is itself a no-op via
 * `settleHermesConnectionFromControlJob`'s own row-state guards). Also
 * exported for `getConnectStatus`'s lazy settle and the completion hook.
 */
export async function settleHermesConnectionJob(
  job: WorkerJob,
  deps: { repo?: HermesConnectionJobsRepo; now?: () => Date } = {},
): Promise<{ settled: boolean }> {
  const repo = deps.repo ?? defaultHermesConnectionJobsRepo;
  const now = deps.now ?? (() => new Date());

  if (!isTerminalStatus(job.status)) return { settled: false };

  const connectionId = extractConnectionId(job);
  if (!connectionId) return { settled: false };

  if (HERMES_CONNECTION_CONTROL_JOB_TYPES.has(job.jobType)) {
    await settleHermesConnectionFromControlJob(
      {
        connectionId,
        job: {
          tenantId: job.tenantId,
          jobType: job.jobType,
          status: job.status,
          failureReason: job.failureReason ?? undefined,
          outputJson: job.outputJson ?? undefined,
        },
      },
      { repo: toConnectionServiceRepo(repo), now },
    );
  } else if (HERMES_MEDIA_JOB_TYPES.has(job.jobType)) {
    await onTerminalHermesMediaJob(job, { repo });
  } else {
    return { settled: false };
  }

  await repo.appendJobEvent({ jobId: job.id, eventType: HERMES_CONNECTION_SETTLED_EVENT_TYPE, payloadJson: {} });
  return { settled: true };
}

// ────────────────────────────────────────────────────────────────────────
// 60s sweep
// ────────────────────────────────────────────────────────────────────────

/** One sweep pass: settle every terminal-but-unsettled hermes job. A repo
 *  error on ONE job never aborts the rest. Pure/testable — no timers. */
export async function runHermesConnectionSettlementTick(
  deps: { repo?: HermesConnectionJobsRepo; now?: () => Date } = {},
): Promise<void> {
  const repo = deps.repo ?? defaultHermesConnectionJobsRepo;
  const now = deps.now ?? (() => new Date());
  const tickNow = now();

  try {
    const timedOutJobs = await repo.listTimedOutControlJobs(tickNow);
    for (const timedOutJob of timedOutJobs) {
      try {
        const expiredJob = await repo.expireTimedOutControlJob({
          jobId: timedOutJob.id,
          now: tickNow,
        });
        if (expiredJob) {
          await settleHermesConnectionJob(expiredJob, { repo, now: () => tickNow });
        }
      } catch (error) {
        debugError("hermesConnectionJobs", `Failed to expire hermes job ${timedOutJob.id}`, error);
      }
    }
  } catch (error) {
    debugError("hermesConnectionJobs", "Failed to list timed-out hermes jobs", error);
  }

  let jobs: WorkerJob[];
  try {
    jobs = await repo.listTerminalUnsettledHermesJobs();
  } catch (error) {
    debugError("hermesConnectionJobs", "Failed to list terminal unsettled hermes jobs", error);
    return;
  }

  for (const job of jobs) {
    try {
      await settleHermesConnectionJob(job, { repo, now });
    } catch (error) {
      debugError("hermesConnectionJobs", `Failed to settle hermes job ${job.id}`, error);
      // Continue with the rest — one bad job must not abort the sweep.
    }
  }
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepStopped = true;

function scheduleNextSweep(delayMs: number): void {
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    void runHermesConnectionSettlementTick()
      .catch((error) => {
        debugError("hermesConnectionJobs", "Unexpected error in hermes connection settlement tick", error);
      })
      .finally(() => {
        if (!sweepStopped) scheduleNextSweep(SWEEP_INTERVAL_MS);
      });
  }, Math.max(0, delayMs));
  sweepTimer.unref?.();
}

/** Starts the 60s interval sweep (idempotent — a second call while already
 *  running is a no-op). The first tick runs on the next event-loop turn. */
export function startHermesConnectionJobSweep(): void {
  if (sweepTimer) return;
  sweepStopped = false;
  scheduleNextSweep(0);
}

/** Stops scheduling NEW ticks. Any tick already in flight is allowed to
 *  finish naturally. Idempotent. */
export function stopHermesConnectionJobSweep(): void {
  sweepStopped = true;
  if (sweepTimer) {
    clearTimeout(sweepTimer);
    sweepTimer = null;
  }
}
