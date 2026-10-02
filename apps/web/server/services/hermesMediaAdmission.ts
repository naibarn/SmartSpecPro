/**
 * Feature 135 — Hermes Grok media worker: admission control (spec §9,
 * §13.7). The single gate every `hermes_media_*` submission passes through
 * BEFORE a `worker_jobs` row is ever inserted (`hermesMediaScheduler.ts`
 * calls `checkHermesMediaAdmission` as step 4 of its 9-step flow).
 *
 * Check order (cheapest → most specific), each mapping to its own spec
 * §13.7 code:
 *   1. per-connection running=1                       → HERMES_CONNECTION_BUSY
 *   2. queued-per-user / tenant shared-pool queued cap → HERMES_QUEUE_FULL
 *   3. sliding submission windows (user / tenant)      → HERMES_RATE_LIMITED
 *   4. per-connection dailyJobQuota                    → HERMES_QUOTA_EXHAUSTED
 *
 * Running/queued counts are read from real `worker_jobs` rows via the
 * injectable `HermesAdmissionCounters` repo seam (no DB required in unit
 * tests — inject a `vi.fn()` fake). Sliding-window and daily-quota counters
 * use the shared PostgreSQL rate-limit store and remain injectable.
 *
 * `batchSize` (portrait candidate batches, spec §9) is added to the
 * queued/window counts as a single admit-all-or-none decision for THIS call
 * — every check below evaluates `currentCount + batchSize` against the cap
 * rather than incrementing one candidate at a time.
 *
 * Namespace note: this is the `hermesMedia`/`hermes_media` namespace — see
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "../db";
import { hermesProviderConnections, workerJobs, type HermesProviderConnection } from "../../drizzle/schema";
import { HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE } from "../../shared/workerRuntime";
import type { HermesMediaErrorCode, HermesMediaOperation } from "../../shared/hermesMedia";
import { getHermesWorkerSettings, type HermesWorkerSettings } from "./hermesWorkerSettings";

// ────────────────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────────────────

export type HermesAdmissionResult =
  | { ok: true }
  | { ok: false; code: HermesMediaErrorCode; retryAfterSeconds?: number };

/** The subset of `HermesWorkerSettings` the limit-coherence validator and
 *  the admission check both care about — kept separate from the full
 *  settings shape so `validateHermesLimitCoherence` can be called with just
 *  the fields being written (the settings write path validates one key at
 *  a time). */
export interface HermesAdmissionLimits {
  maxRunningPerConnection: number;
  maxQueuedPerUser: number;
  maxQueuedPerTenantSharedPool: number;
  submitWindowPerUser: number;
  submitWindowPerTenant: number;
}

/** The largest single-call admission batch the product ships (the portrait
 *  candidate batch, spec §9) — `validateHermesLimitCoherence` rejects any
 *  `maxQueuedPerUser` configuration below this floor, since a smaller cap
 *  would make that batch permanently un-admittable. */
export const HERMES_MAX_ADMISSION_BATCH_SIZE = 4;

/**
 * Called by the settings write path (`server/routers/systemSettings.ts`'s
 * `updateSetting` mutation, section-01 cache-clear hook site) whenever
 * `hermes_max_queued_per_user` is written. Rejects a configuration that
 * would make the max admission batch size permanently un-admittable.
 */
export function validateHermesLimitCoherence(
  limits: HermesAdmissionLimits,
): { ok: boolean; reason?: string } {
  if (!Number.isFinite(limits.maxQueuedPerUser) || limits.maxQueuedPerUser < HERMES_MAX_ADMISSION_BATCH_SIZE) {
    return {
      ok: false,
      reason:
        `hermes_max_queued_per_user must be at least ${HERMES_MAX_ADMISSION_BATCH_SIZE} `
        + `(the maximum single-call admission batch size, e.g. a portrait candidate batch)`,
    };
  }
  return { ok: true };
}

/** Legacy key shape retained for compatibility with existing callers/tests.
 *  Active quota reads and increments use PostgreSQL rate_limit_events. */
export function buildHermesQuotaKey(connectionId: string, dateKey: string): string {
  return `hermes:quota:${connectionId}:${dateKey}`;
}

function todayDateKey(now: Date): string {
  return now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// ────────────────────────────────────────────────────────────────────────
// Injectable counter store
// ────────────────────────────────────────────────────────────────────────

export interface HermesSlidingWindowCheckResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Small counter-store seam so unit tests can inject deterministic counters —
 * every method here is independently fakeable with `vi.fn()`.
 */
export interface HermesAdmissionCounters {
  /** Jobs on this connection that are currently claimed/running/uploading
   *  etc (i.e. actively occupying the connection) — the "running=1" gate. */
  countRunningForConnection(connectionId: string): Promise<number>;
  /** Currently queued `hermes_media_*` jobs for this user, across all
   *  connections. */
  countQueuedForUser(userId: number): Promise<number>;
  /** Currently queued `hermes_media_*` jobs across every `server_shared`
   *  connection in this tenant. */
  countQueuedForTenantSharedPool(tenantId: string): Promise<number>;
  /**
   * Atomically checks whether admitting `amount` more submission events for
   * `key` within the trailing `windowSeconds` would exceed `limit`: if not,
   * records `amount` events and resolves `{ allowed: true }`; if it would,
   * records nothing and resolves `{ allowed: false, retryAfterSeconds }`.
   */
  checkAndIncrementSlidingWindow(
    key: string,
    windowSeconds: number,
    limit: number,
    amount: number,
  ): Promise<HermesSlidingWindowCheckResult>;
  /** Reads (never increments — section-12 increments this on completion)
   *  the connection's daily quota usage for the given `YYYY-MM-DD` key. */
  getDailyQuotaUsage(connectionId: string, dateKey: string): Promise<number>;
}

const HERMES_MEDIA_JOB_TYPES = [HERMES_MEDIA_IMAGE_JOB_TYPE, HERMES_MEDIA_VIDEO_JOB_TYPE] as const;

/** Non-`queued`, non-terminal statuses — a job in any of these is actively
 *  occupying its connection (the "running=1" gate counts all of them, not
 *  literally only `status === "running"`). */
const ACTIVE_CONNECTION_STATUSES = [
  "claimed",
  "preparing",
  "running",
  "uploading",
  "publishing",
  "indexing",
] as const;

async function dbCountRunningForConnection(connectionId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workerJobs)
    .where(
      and(
        inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
        inArray(workerJobs.status, [...ACTIVE_CONNECTION_STATUSES]),
        sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${connectionId}`,
      ),
    );
  return row?.count ?? 0;
}

/**
 * FIX 2 (code review, MAJOR): a queued row's "weight" against the cap is its
 * `inputJson.settings.outputCount` (portrait/batch outputs), defaulting to 1
 * when absent — NOT a flat 1-per-row. Without this, an existing outputCount:4
 * row counted as 1 while an incoming outputCount:4 request's `batchSize`
 * counted as 4 against the SAME cap, letting the queue overshoot the
 * configured cap by up to ~2.5x. Summing this JSONB path in SQL keeps
 * existing rows and the incoming request on the same unit scale.
 */
const QUEUED_WEIGHT_SQL = sql<number>`COALESCE(SUM(COALESCE((${workerJobs.inputJson}->'settings'->>'outputCount')::int, 1)), 0)::int`;

async function dbCountQueuedForUser(userId: number): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ weight: QUEUED_WEIGHT_SQL })
    .from(workerJobs)
    .where(
      and(
        inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
        eq(workerJobs.status, "queued"),
        eq(workerJobs.requestedByUserId, userId),
      ),
    );
  return row?.weight ?? 0;
}

async function dbCountQueuedForTenantSharedPool(tenantId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ weight: QUEUED_WEIGHT_SQL })
    .from(workerJobs)
    .innerJoin(
      hermesProviderConnections,
      sql`(${workerJobs.capabilityRequirementsJson}->>'connectionId') = ${hermesProviderConnections.id}`,
    )
    .where(
      and(
        eq(workerJobs.tenantId, tenantId),
        inArray(workerJobs.jobType, [...HERMES_MEDIA_JOB_TYPES]),
        eq(workerJobs.status, "queued"),
        eq(hermesProviderConnections.scope, "server_shared"),
      ),
    );
  return row?.weight ?? 0;
}

async function postgresCheckAndIncrementSlidingWindow(
  key: string,
  windowSeconds: number,
  limit: number,
  amount: number,
): Promise<HermesSlidingWindowCheckResult> {
  try {
    const { consumeSlidingWindow } = await import("./postgresRateLimitStore");
    const result = await consumeSlidingWindow(
      "hermes-media-submit",
      key,
      limit,
      windowSeconds,
      amount,
    );
    return { allowed: result.allowed, retryAfterSeconds: result.retryAfterSeconds ?? undefined };
  } catch {
    // Fail closed: unavailable shared state must never bypass admission.
    return { allowed: false, retryAfterSeconds: 30 };
  }
}

async function postgresGetDailyQuotaUsage(connectionId: string, dateKey: string): Promise<number> {
  const { readUsageSince } = await import("./postgresRateLimitStore");
  const since = new Date(`${dateKey}T00:00:00.000Z`);
  if (!Number.isFinite(since.getTime())) throw new Error("HERMES_QUOTA_DATE_INVALID");
  return readUsageSince("hermes-media-daily-quota", connectionId, since);
}

export const defaultHermesAdmissionCounters: HermesAdmissionCounters = {
  countRunningForConnection: dbCountRunningForConnection,
  countQueuedForUser: dbCountQueuedForUser,
  countQueuedForTenantSharedPool: dbCountQueuedForTenantSharedPool,
  checkAndIncrementSlidingWindow: postgresCheckAndIncrementSlidingWindow,
  getDailyQuotaUsage: postgresGetDailyQuotaUsage,
};

// ────────────────────────────────────────────────────────────────────────
// checkHermesMediaAdmission
// ────────────────────────────────────────────────────────────────────────

export interface HermesAdmissionParams {
  tenantId: string;
  userId: number;
  connection: HermesProviderConnection;
  operation: HermesMediaOperation;
  /** Portrait candidate batches submit >1 job in a single admission call —
   *  every count below is checked as `current + batchSize` (admit all or
   *  none). Defaults to 1. */
  batchSize?: number;
}

export interface HermesAdmissionDeps {
  getSettings?: () => Promise<HermesWorkerSettings>;
  counters?: HermesAdmissionCounters;
  now?: () => Date;
}

export async function checkHermesMediaAdmission(
  params: HermesAdmissionParams,
  deps: HermesAdmissionDeps = {},
): Promise<HermesAdmissionResult> {
  const getSettings = deps.getSettings ?? getHermesWorkerSettings;
  const counters = deps.counters ?? defaultHermesAdmissionCounters;
  const now = deps.now ?? (() => new Date());

  const settings = await getSettings();
  const batchSize = Math.max(1, Math.trunc(params.batchSize ?? 1));
  const isPrivateWorker = params.connection.scope === "private_worker";
  const isSharedPool = params.connection.scope === "server_shared";

  // 1. Per-connection running=1 (control-plane protection — applies to
  // every scope, including private workers).
  const runningCount = await counters.countRunningForConnection(params.connection.id);
  if (runningCount >= settings.maxRunningPerConnection) {
    return { ok: false, code: "HERMES_CONNECTION_BUSY" };
  }

  // 2a. Queued-per-user cap (applies regardless of scope).
  const queuedForUser = await counters.countQueuedForUser(params.userId);
  if (queuedForUser + batchSize > settings.maxQueuedPerUser) {
    return { ok: false, code: "HERMES_QUEUE_FULL" };
  }

  // 2b. Tenant shared-pool queued cap — server_shared only; private/personal
  // connections never contend for the shared pool's capacity.
  if (isSharedPool) {
    const queuedForTenantSharedPool = await counters.countQueuedForTenantSharedPool(params.tenantId);
    if (queuedForTenantSharedPool + batchSize > settings.maxQueuedPerTenantSharedPool) {
      return { ok: false, code: "HERMES_QUEUE_FULL" };
    }
  }

  // 3a. Per-user sliding submission window (applies regardless of scope —
  // private workers keep this limiter per spec §9).
  const userWindow = await counters.checkAndIncrementSlidingWindow(
    `hermes:submit:user:${params.userId}`,
    600,
    settings.submitWindowPerUser,
    batchSize,
  );
  if (!userWindow.allowed) {
    return {
      ok: false,
      code: "HERMES_RATE_LIMITED",
      retryAfterSeconds: Math.max(1, userWindow.retryAfterSeconds ?? 60),
    };
  }

  // 3b. Tenant-wide sliding submission window — exempt for private workers
  // (spec §9: "private workers exempt from the tenant shared-pool caps").
  if (!isPrivateWorker) {
    const tenantWindow = await counters.checkAndIncrementSlidingWindow(
      `hermes:submit:tenant:${params.tenantId}`,
      600,
      settings.submitWindowPerTenant,
      batchSize,
    );
    if (!tenantWindow.allowed) {
      return {
        ok: false,
        code: "HERMES_RATE_LIMITED",
        retryAfterSeconds: Math.max(1, tenantWindow.retryAfterSeconds ?? 60),
      };
    }
  }

  // 4. Per-connection dailyJobQuota — null/undefined means unlimited.
  if (typeof params.connection.dailyJobQuota === "number") {
    const usage = await counters.getDailyQuotaUsage(params.connection.id, todayDateKey(now()));
    if (usage + batchSize > params.connection.dailyJobQuota) {
      return { ok: false, code: "HERMES_QUOTA_EXHAUSTED" };
    }
  }

  return { ok: true };
}
