/**
 * Feature 135 — Hermes Grok media worker: observability + hardening
 * (section 12).
 *
 * One thin module: typed audit-emit helpers for every hermes lifecycle
 * event (connection connect/authorize/disconnect/revoke/entitlement-
 * restricted, media-job submit/admission-rejected/usage-recorded), plus
 * `recordHermesUsage` — the single completion-time hook that writes one
 * `provider_usage_log` row and bumps the section-05 daily quota counter for
 * a completed `hermes_media_*` job.
 *
 * Hard rule (spec §16, locked in by `hermesTokenLeakGuard.test.ts`): every
 * helper here logs IDS ONLY — jobId/connectionId/tenantId/userId/traceId/
 * error codes. NEVER a prompt, a reference URL, a device code, or more than
 * 4 characters of any token. `sanitizePayload` is not a license to log
 * secrets — none of these helpers accept a payload shape that could carry
 * one in the first place.
 *
 * Namespace note: this is the `hermesMedia` / `hermes_media` namespace — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import { and, eq } from "drizzle-orm";

import { getDb } from "../db";
import { llmProviders, providerUsageLog, workerJobEvents } from "../../drizzle/schema";
import { buildHermesQuotaKey } from "./hermesMediaAdmission";
import type { HermesConnectionScope } from "./hermesConnectionService";
import {
  HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE,
  type HermesMediaErrorCode,
  type HermesMediaJobContract,
} from "../../shared/hermesMedia";
import { auditLogger } from "./auditLogger";
import { debugError } from "../_core/logger";

// ────────────────────────────────────────────────────────────────────────
// Audit helpers — connection lifecycle
// ────────────────────────────────────────────────────────────────────────

export interface AuditHermesConnectionLifecycleParams {
  traceId?: string;
  userId: number | null;
  tenantId: string;
  connectionId: string;
  scope?: HermesConnectionScope;
}

export function auditHermesConnectStarted(params: AuditHermesConnectionLifecycleParams): void {
  auditLogger.log({
    eventType: "hermes_connection_connect_started",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      ...(params.scope ? { scope: params.scope } : {}),
    },
  });
}

export function auditHermesConnectionAuthorized(params: AuditHermesConnectionLifecycleParams): void {
  auditLogger.log({
    eventType: "hermes_connection_authorized",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      ...(params.scope ? { scope: params.scope } : {}),
    },
  });
}

export function auditHermesConnectionDisconnected(params: AuditHermesConnectionLifecycleParams): void {
  auditLogger.log({
    eventType: "hermes_connection_disconnected",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      ...(params.scope ? { scope: params.scope } : {}),
    },
  });
}

export function auditHermesConnectionRevoked(params: AuditHermesConnectionLifecycleParams): void {
  auditLogger.log({
    eventType: "hermes_connection_revoked",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      ...(params.scope ? { scope: params.scope } : {}),
    },
  });
}

export function auditHermesConnectionEntitlementRestricted(params: AuditHermesConnectionLifecycleParams): void {
  auditLogger.log({
    eventType: "hermes_connection_entitlement_restricted",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      ...(params.scope ? { scope: params.scope } : {}),
    },
  });
}

/**
 * Code review FIX 4 — the actual most-common provider-side revocation
 * signal (an auth/session-invalidation failure classified `reauth_required`
 * on the authorize job, the probe job, or a `hermes_media_*` job) mutates
 * the connection's status but previously emitted NO audit event at all,
 * despite `hermes_connection_revoked` existing for the (rarer) admin-forced
 * disable path. An admin debugging "why did this connection stop working"
 * found nothing for the most common cause. Emitted at all three
 * `reauth_required`-classification call sites.
 */
export function auditHermesConnectionReauthRequired(params: AuditHermesConnectionLifecycleParams): void {
  auditLogger.log({
    eventType: "hermes_connection_reauth_required",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      connectionId: params.connectionId,
      ...(params.scope ? { scope: params.scope } : {}),
    },
  });
}

// ────────────────────────────────────────────────────────────────────────
// Audit helpers — media job submit / admission rejection / usage recorded
// ────────────────────────────────────────────────────────────────────────

export interface AuditHermesSubmitParams {
  traceId: string;
  userId: number;
  tenantId: string;
  jobId: string;
  jobType: string;
  connectionId: string;
  scope: HermesConnectionScope;
  operation: string;
  batchSize?: number;
}

/** Metadata is ids/enums only — NEVER the prompt text or reference URLs. */
export function auditHermesSubmit(params: AuditHermesSubmitParams): void {
  auditLogger.log({
    eventType: "hermes_media_job_submitted",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      jobId: params.jobId,
      jobType: params.jobType,
      connectionId: params.connectionId,
      scope: params.scope,
      operation: params.operation,
      ...(params.batchSize !== undefined ? { batchSize: params.batchSize } : {}),
    },
  });
}

export interface AuditHermesAdmissionRejectedParams {
  traceId: string;
  userId: number;
  tenantId: string;
  connectionId?: string;
  code: HermesMediaErrorCode;
  retryAfterSeconds?: number;
}

export function auditHermesAdmissionRejected(params: AuditHermesAdmissionRejectedParams): void {
  auditLogger.log({
    eventType: "hermes_media_admission_rejected",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      ...(params.connectionId ? { connectionId: params.connectionId } : {}),
      code: params.code,
      ...(params.retryAfterSeconds !== undefined ? { retryAfterSeconds: params.retryAfterSeconds } : {}),
    },
  });
}

export interface AuditHermesUsageRecordedParams {
  traceId?: string;
  userId: number | null;
  tenantId: string;
  jobId: string;
  connectionId: string;
  providerId: number;
  modelUsed: string;
  creditsCharged: number;
}

export function auditHermesUsageRecorded(params: AuditHermesUsageRecordedParams): void {
  auditLogger.log({
    eventType: "hermes_media_usage_recorded",
    userId: params.userId,
    traceId: params.traceId,
    metadata: {
      tenantId: params.tenantId,
      jobId: params.jobId,
      connectionId: params.connectionId,
      providerId: params.providerId,
      modelUsed: params.modelUsed,
      creditsCharged: params.creditsCharged,
    },
  });
}

// ────────────────────────────────────────────────────────────────────────
// xai-hermes provider row resolution (find-or-create, cached)
// ────────────────────────────────────────────────────────────────────────

const HERMES_USAGE_PROVIDER_NAME = "xai-hermes";
const HERMES_USAGE_PROVIDER_DISPLAY_NAME = "xAI Hermes (provider account)";

export interface HermesUsageRepo {
  findProviderIdByName(providerName: string): Promise<number | null>;
  insertProviderRow(values: { providerName: string; displayName: string }): Promise<{ id: number }>;
  insertUsageLogRow(values: Record<string, unknown>): Promise<void>;
  /** Durable (DB-level) idempotency backstop, independent of Redis — see
   *  `HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE`'s doc comment
   *  (`shared/hermesMedia.ts`) and `recordHermesUsage`'s. */
  hasUsageRecordedMarker(jobId: string): Promise<boolean>;
  insertUsageRecordedMarker(jobId: string): Promise<void>;
}

export const defaultHermesUsageRepo: HermesUsageRepo = {
  async findProviderIdByName(providerName) {
    const db = getDb();
    const [row] = await db
      .select({ id: llmProviders.id })
      .from(llmProviders)
      .where(eq(llmProviders.providerName, providerName))
      .limit(1);
    return row?.id ?? null;
  },

  async insertProviderRow(values) {
    const db = getDb();
    // Row created disabled / no API key — this provider row exists ONLY so
    // `provider_usage_log.providerId` (NOT NULL, schema.ts) has a target; it
    // must never become routable/enabled for real LLM traffic.
    const [row] = await db
      .insert(llmProviders)
      .values({
        providerName: values.providerName,
        displayName: values.displayName,
        hasApiKey: false,
        isEnabled: false,
      } as any)
      .returning({ id: llmProviders.id });
    return row;
  },

  async insertUsageLogRow(values) {
    const db = getDb();
    await db.insert(providerUsageLog).values(values as any);
  },

  async hasUsageRecordedMarker(jobId) {
    const db = getDb();
    const [row] = await db
      .select({ id: workerJobEvents.id })
      .from(workerJobEvents)
      .where(and(
        eq(workerJobEvents.workerJobId, jobId),
        eq(workerJobEvents.eventType, HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE),
      ))
      .limit(1);
    return Boolean(row);
  },

  async insertUsageRecordedMarker(jobId) {
    const db = getDb();
    await db.insert(workerJobEvents).values({
      workerJobId: jobId,
      eventType: HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE,
      payloadJson: {},
    });
  },
};

let cachedHermesUsageProviderId: number | null = null;

/** Find-or-create the `xai-hermes` `llm_providers` row id, module-level
 *  cached so repeated completions never re-query/re-insert. */
export async function resolveHermesUsageProviderId(repo: HermesUsageRepo = defaultHermesUsageRepo): Promise<number> {
  if (cachedHermesUsageProviderId !== null) return cachedHermesUsageProviderId;

  const existing = await repo.findProviderIdByName(HERMES_USAGE_PROVIDER_NAME);
  if (existing !== null) {
    cachedHermesUsageProviderId = existing;
    return existing;
  }

  const inserted = await repo.insertProviderRow({
    providerName: HERMES_USAGE_PROVIDER_NAME,
    displayName: HERMES_USAGE_PROVIDER_DISPLAY_NAME,
  });
  cachedHermesUsageProviderId = inserted.id;
  return inserted.id;
}

/** Test-only — resets the module-level provider-id cache between test cases. */
export function __resetHermesUsageProviderIdCacheForTests(): void {
  cachedHermesUsageProviderId = null;
}

// ────────────────────────────────────────────────────────────────────────
// Usage + quota counter store (Redis-backed by default, fully injectable)
// ────────────────────────────────────────────────────────────────────────

const HERMES_USAGE_IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 3600; // ~7d
const HERMES_QUOTA_COUNTER_TTL_SECONDS = 48 * 3600; // 48h

export interface HermesUsageCounterStore {
  /** Atomic "mark as recorded if not already recorded" (SET NX semantics) —
   *  resolves `true` the FIRST time a given jobId is marked (proceed),
   *  `false` on every subsequent call for the same jobId (already recorded
   *  — idempotent no-op). This is what makes double invocation (poll path +
   *  sweep path) write exactly one usage row and one quota increment. */
  markUsageRecordedIfNew(jobId: string): Promise<boolean>;
  /** Atomically increments the section-05 daily quota counter
   *  (`buildHermesQuotaKey`) and refreshes its expiry. */
  incrementDailyQuota(connectionId: string, dateKey: string): Promise<void>;
}

async function redisMarkUsageRecordedIfNew(jobId: string): Promise<boolean> {
  try {
    const { getCacheClient } = await import("./redisClients");
    const redis = getCacheClient();
    const result = await redis.set(
      `hermes:usage:recorded:${jobId}`,
      "1",
      "EX",
      HERMES_USAGE_IDEMPOTENCY_TTL_SECONDS,
      "NX",
    );
    return result === "OK";
  } catch (error) {
    // Fail-open: a Redis outage must never silently drop a completed job's
    // usage row forever — recording it (possibly a second time, later
    // reconciled) is a lesser evil than losing it. This mirrors the
    // "usage-recording failure must not un-complete the job" rule (§4.2).
    debugError("hermesMediaObservability", "Failed to check hermes usage idempotency marker", error);
    return true;
  }
}

async function redisIncrementDailyQuota(connectionId: string, dateKey: string): Promise<void> {
  const { getCacheClient } = await import("./redisClients");
  const redis = getCacheClient();
  const key = buildHermesQuotaKey(connectionId, dateKey);
  await redis.incr(key);
  await redis.expire(key, HERMES_QUOTA_COUNTER_TTL_SECONDS);
}

export const defaultHermesUsageCounterStore: HermesUsageCounterStore = {
  markUsageRecordedIfNew: redisMarkUsageRecordedIfNew,
  incrementDailyQuota: redisIncrementDailyQuota,
};

// ────────────────────────────────────────────────────────────────────────
// recordHermesUsage
// ────────────────────────────────────────────────────────────────────────

export interface RecordHermesUsageJob {
  id: string;
  tenantId: string;
  requestedByUserId: number | null;
  status: string;
  capabilityRequirementsJson?: Record<string, unknown> | null;
  instructionsJson?: Record<string, unknown> | null;
}

export interface RecordHermesUsageParams {
  /** A completed `hermes_media_*` job row (or the subset of fields needed
   *  here) — non-completed statuses are a guaranteed no-op (§3.2). */
  job: RecordHermesUsageJob;
  /** Only `settings.model` is read (never the prompt/references). */
  contract: Pick<HermesMediaJobContract, "settings">;
  /** The platform fee actually kept (0 for personal/private connections,
   *  or a shared-pool job with no fee configured). */
  feeCreditsKept: number;
}

export interface RecordHermesUsageDeps {
  repo?: HermesUsageRepo;
  counters?: HermesUsageCounterStore;
  now?: () => Date;
}

function readConnectionIdFromJob(job: RecordHermesUsageJob): string | null {
  const fromCapabilities = job.capabilityRequirementsJson?.connectionId;
  if (typeof fromCapabilities === "string" && fromCapabilities.length > 0) return fromCapabilities;
  return null;
}

function readTraceIdFromJob(job: RecordHermesUsageJob): string | undefined {
  const traceId = job.instructionsJson?.traceId;
  return typeof traceId === "string" && traceId.length > 0 ? traceId : undefined;
}

/**
 * The single completion-time hook (§4.2): writes exactly one
 * `provider_usage_log` row for a completed `hermes_media_*` job and bumps
 * the section-05 daily quota counter.
 *
 * Called from TWO sites, both expected to run for the SAME job under
 * normal conditions (code review fix — this is by design, not a rare
 * corner case): (1) `workerRuntime.ts`'s artifacts/complete dispatch,
 * immediately after `finalizeHermesMediaArtifact` succeeds — which ALSO
 * appends the `hermes_connection_settled` marker via
 * `settleHermesConnectionJob`, so this job is excluded from
 * `listTerminalUnsettledHermesJobs` on the sweep's next tick; and (2) the
 * section-04/06 terminal-state sweep's `onTerminalHermesMediaJob`, now a
 * genuine backstop for whatever call site (1) never reached (a crash
 * between finalize and settlement, or a true lease-expiry completion no
 * poll/callback path ever observes) rather than the routine, every-job,
 * up-to-60s-window re-processing it was before that fix.
 *
 * Idempotency is TWO independent, layered gates (neither backed by a new
 * migration/unique constraint):
 *   1. Redis `hermes:usage:recorded:<jobId>` (SET NX) — fast path; fails
 *      OPEN (treats an error as "proceed") on a Redis outage, per the
 *      "must not silently drop a completed job's usage forever" rule.
 *   2. A durable `worker_job_events` row of type
 *      `HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE`, checked BEFORE inserting
 *      the `provider_usage_log` row — independent of Redis, so a Redis
 *      outage during the window between the two call sites above degrades
 *      to "usage delayed" rather than "usage duplicated". This is a
 *      check-then-insert, not an atomic `ON CONFLICT` (no unique index
 *      backs `(workerJobId, eventType)` — adding one would need a
 *      migration), so it does not fully close a true simultaneous race
 *      between the two call sites; it closes the practical, routine case.
 *
 * Never throws — a usage-recording failure is logged + audited, but must
 * never un-complete the job (§4.2).
 */
export async function recordHermesUsage(
  params: RecordHermesUsageParams,
  deps: RecordHermesUsageDeps = {},
): Promise<void> {
  if (params.job.status !== "completed") return;

  const repo = deps.repo ?? defaultHermesUsageRepo;
  const counters = deps.counters ?? defaultHermesUsageCounterStore;
  const now = deps.now ?? (() => new Date());

  const connectionId = readConnectionIdFromJob(params.job);
  const traceId = readTraceIdFromJob(params.job);
  const modelUsed = params.contract.settings?.model ?? "unknown";
  const creditsCharged = Math.max(0, Math.trunc(params.feeCreditsKept));

  try {
    // Durable gate FIRST — independent of Redis, so it still catches a
    // genuine repeat even when the Redis fast-path below fails open (e.g.
    // a Redis outage during the completion-callback <-> sweep window).
    const alreadyRecordedInDb = await repo.hasUsageRecordedMarker(params.job.id);
    if (alreadyRecordedInDb) return;

    const isNew = await counters.markUsageRecordedIfNew(params.job.id);
    if (!isNew) return;

    const providerId = await resolveHermesUsageProviderId(repo);

    await repo.insertUsageLogRow({
      userId: params.job.requestedByUserId,
      providerId,
      modelUsed,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: "0",
      creditsCharged,
      statusCode: 200,
      requestType: "hermes_media",
      traceId: traceId ?? null,
    });
    await repo.insertUsageRecordedMarker(params.job.id);

    if (connectionId) {
      const dateKey = now().toISOString().slice(0, 10);
      await counters.incrementDailyQuota(connectionId, dateKey);
    }

    auditHermesUsageRecorded({
      traceId,
      userId: params.job.requestedByUserId,
      tenantId: params.job.tenantId,
      jobId: params.job.id,
      connectionId: connectionId ?? "",
      providerId,
      modelUsed,
      creditsCharged,
    });
  } catch (error) {
    debugError("hermesMediaObservability", `Failed to record hermes usage for job ${params.job.id}`, error);
    auditLogger.log({
      eventType: "error",
      userId: params.job.requestedByUserId,
      traceId,
      metadata: {
        tenantId: params.job.tenantId,
        jobId: params.job.id,
        context: "hermes_media_usage_recording_failed",
      },
    });
  }
}
