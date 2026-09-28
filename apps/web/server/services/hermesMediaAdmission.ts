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
 * tests — inject a `vi.fn()` fake). The sliding-window and daily-quota
 * counters are conceptually Redis-backed (the default implementation uses
 * the shared cache Redis client, mirroring
 * `server/middleware/distributedRateLimit.ts`'s sorted-set sliding-window
 * approach) but are ALSO fully injectable so tests never touch real Redis.
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

/** Redis key shape for the per-connection daily job quota counter — the
 *  SAME counter section-12 increments on job completion; this module only
 *  ever READS it (never increments). Exported for section-12 reuse. */
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
 * Small counter-store seam so unit tests never need a real DB or a real
 * Redis — every method here is independently fakeable with `vi.fn()`.
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

/**
 * FIX 1a (code review, BLOCKER): the sliding window used to be a
 * check-then-act pair of round-trips (ZCARD, then ZADD) — two concurrent
 * callers could both read a count under the limit before either wrote,
 * admitting more than `limit` submissions in the same window. A single Lua
 * script makes prune → count → (conditionally) write ONE atomic round-trip
 * (Redis executes scripts single-threaded — no other command can interleave
 * mid-script), closing that race. Uses server-side `TIME` (not a
 * client-supplied timestamp) so concurrent invocations naturally get
 * distinct, monotonic-enough scores/members without a shared clock.
 */
const SLIDING_WINDOW_ADMIT_SCRIPT = `
local key = KEYS[1]
local windowSeconds = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local amount = tonumber(ARGV[3])

local time = redis.call('TIME')
local nowSeconds = tonumber(time[1]) + (tonumber(time[2]) / 1000000)
local windowStart = nowSeconds - windowSeconds

redis.call('ZREMRANGEBYSCORE', key, 0, windowStart)
local count = redis.call('ZCARD', key)

if count + amount > limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retryAfter = windowSeconds
  if oldest[2] then
    retryAfter = math.ceil(tonumber(oldest[2]) + windowSeconds - nowSeconds)
    if retryAfter < 1 then retryAfter = 1 end
  end
  return {0, retryAfter}
end

for i = 1, amount do
  redis.call('ZADD', key, nowSeconds, tostring(nowSeconds) .. ':' .. tostring(i) .. ':' .. tostring(math.random(1, 2147483647)))
end
redis.call('EXPIRE', key, windowSeconds + 60)
return {1, 0}
`;

async function redisCheckAndIncrementSlidingWindow(
  key: string,
  windowSeconds: number,
  limit: number,
  amount: number,
): Promise<HermesSlidingWindowCheckResult> {
  try {
    const { getCacheClient } = await import("./redisClients");
    const redis = getCacheClient();

    const result = (await redis.eval(
      SLIDING_WINDOW_ADMIT_SCRIPT,
      1,
      key,
      windowSeconds,
      limit,
      amount,
    )) as [number, number];

    const [admitted, retryAfter] = result;
    if (admitted === 1) {
      return { allowed: true };
    }
    return { allowed: false, retryAfterSeconds: Math.max(1, retryAfter) };
  } catch {
    // Fail closed (mirrors `distributedRateLimit.ts`'s `checkRateLimit`) — a
    // Redis outage must never silently bypass the submission rate limiter.
    return { allowed: false, retryAfterSeconds: 30 };
  }
}

async function redisGetDailyQuotaUsage(connectionId: string, dateKey: string): Promise<number> {
  try {
    const { getCacheClient } = await import("./redisClients");
    const redis = getCacheClient();
    const raw = await redis.get(buildHermesQuotaKey(connectionId, dateKey));
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    // Deliberately fail OPEN here (usage "unknown" = 0): failing closed would
    // block every submission on a Redis blip even for connections with no
    // quota configured. running=1 + the submission windows above still gate
    // abuse; this counter is a secondary, admin-configured guard.
    return 0;
  }
}

export const defaultHermesAdmissionCounters: HermesAdmissionCounters = {
  countRunningForConnection: dbCountRunningForConnection,
  countQueuedForUser: dbCountQueuedForUser,
  countQueuedForTenantSharedPool: dbCountQueuedForTenantSharedPool,
  checkAndIncrementSlidingWindow: redisCheckAndIncrementSlidingWindow,
  getDailyQuotaUsage: redisGetDailyQuotaUsage,
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
