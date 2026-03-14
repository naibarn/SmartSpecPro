/**
 * Per-API-key request quota enforcement.
 *
 * Supports four independent time windows: hourly, daily, weekly, monthly.
 * Each window is tracked as a Redis counter with an appropriate TTL.
 * A quota.warning event is emitted (once per window period) when usage reaches 80%.
 */

import { getRedisClient } from "./redis";
import { emitPublicApiEvent } from "./webhookDeliveryService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QuotaConfig {
  quotaHourly?: number | null;
  quotaDaily?: number | null;
  quotaWeekly?: number | null;
  quotaMonthly?: number | null;
}

export interface QuotaCheckResult {
  allowed: boolean;
  blockedWindow?: "hourly" | "daily" | "weekly" | "monthly";
  headers: Record<string, string>;
  retryAfterSeconds?: number;
}

// ---------------------------------------------------------------------------
// Time window helpers
// ---------------------------------------------------------------------------

function currentHourBucket(): string {
  return String(Math.floor(Date.now() / 3_600_000));
}

function currentDayBucket(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function currentWeekBucket(): string {
  const now = new Date();
  const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86_400_000);
  const week = Math.ceil((dayOfYear + jan1.getUTCDay() + 1) / 7);
  return `${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function currentMonthBucket(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

function secondsUntilNextHour(): number {
  return 3600 - (Math.floor(Date.now() / 1000) % 3600);
}

function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

function secondsUntilNextWeek(): number {
  const now = new Date();
  const day = now.getUTCDay() || 7; // Mon=1 … Sun=7
  const daysToMonday = 8 - day;
  const nextMonday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysToMonday),
  );
  return Math.ceil((nextMonday.getTime() - now.getTime()) / 1000);
}

function secondsUntilNextMonth(): number {
  const now = new Date();
  const firstOfNext = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return Math.ceil((firstOfNext.getTime() - now.getTime()) / 1000);
}

// ---------------------------------------------------------------------------
// Core: check + increment
// ---------------------------------------------------------------------------

/**
 * Atomically increment all configured quota counters and enforce limits.
 *
 * Uses INCR-then-check (same pattern as the RPM rate limiter). Counter is
 * incremented before checking, so the request that crosses the limit is the
 * first to be rejected — no under-counting.
 */
export async function checkAndIncrementQuota(
  apiKeyId: string,
  tenantId: string,
  quota: QuotaConfig,
): Promise<QuotaCheckResult> {
  const hasAny =
    quota.quotaHourly != null ||
    quota.quotaDaily != null ||
    quota.quotaWeekly != null ||
    quota.quotaMonthly != null;

  if (!hasAny) {
    return { allowed: true, headers: {} };
  }

  const redis = getRedisClient();
  const prefix = `quota:apikey:${apiKeyId}`;
  const hKey = `${prefix}:h:${currentHourBucket()}`;
  const dKey = `${prefix}:d:${currentDayBucket()}`;
  const wKey = `${prefix}:w:${currentWeekBucket()}`;
  const mKey = `${prefix}:m:${currentMonthBucket()}`;

  // INCR all relevant counters in a pipeline
  const incrPipeline = redis.pipeline();
  if (quota.quotaHourly != null) incrPipeline.incr(hKey);
  if (quota.quotaDaily != null) incrPipeline.incr(dKey);
  if (quota.quotaWeekly != null) incrPipeline.incr(wKey);
  if (quota.quotaMonthly != null) incrPipeline.incr(mKey);
  const results = await incrPipeline.exec();

  // Set TTLs on first request of each window
  const ttlPipeline = redis.pipeline();
  let idx = 0;
  if (quota.quotaHourly != null) {
    if ((results?.[idx]?.[1] as number) === 1) ttlPipeline.expire(hKey, 7_200); // 2h
    idx++;
  }
  if (quota.quotaDaily != null) {
    if ((results?.[idx]?.[1] as number) === 1) ttlPipeline.expire(dKey, 172_800); // 2d
    idx++;
  }
  if (quota.quotaWeekly != null) {
    if ((results?.[idx]?.[1] as number) === 1) ttlPipeline.expire(wKey, 691_200); // 8d
    idx++;
  }
  if (quota.quotaMonthly != null) {
    if ((results?.[idx]?.[1] as number) === 1) ttlPipeline.expire(mKey, 2_764_800); // 32d
  }
  ttlPipeline.exec().catch(() => {});

  // Extract counts
  idx = 0;
  const hCount = quota.quotaHourly != null ? ((results?.[idx++]?.[1] as number) ?? 1) : 0;
  const dCount = quota.quotaDaily != null ? ((results?.[idx++]?.[1] as number) ?? 1) : 0;
  const wCount = quota.quotaWeekly != null ? ((results?.[idx++]?.[1] as number) ?? 1) : 0;
  const mCount = quota.quotaMonthly != null ? ((results?.[idx++]?.[1] as number) ?? 1) : 0;

  // Build response headers
  const headers: Record<string, string> = {};
  if (quota.quotaHourly != null) {
    headers["X-Quota-Hourly-Limit"] = String(quota.quotaHourly);
    headers["X-Quota-Hourly-Remaining"] = String(Math.max(0, quota.quotaHourly - hCount));
    headers["X-Quota-Hourly-Reset"] = String(
      (Math.floor(Date.now() / 3_600_000) + 1) * 3600,
    );
  }
  if (quota.quotaDaily != null) {
    headers["X-Quota-Daily-Limit"] = String(quota.quotaDaily);
    headers["X-Quota-Daily-Remaining"] = String(Math.max(0, quota.quotaDaily - dCount));
  }
  if (quota.quotaWeekly != null) {
    headers["X-Quota-Weekly-Limit"] = String(quota.quotaWeekly);
    headers["X-Quota-Weekly-Remaining"] = String(Math.max(0, quota.quotaWeekly - wCount));
  }
  if (quota.quotaMonthly != null) {
    headers["X-Quota-Monthly-Limit"] = String(quota.quotaMonthly);
    headers["X-Quota-Monthly-Remaining"] = String(Math.max(0, quota.quotaMonthly - mCount));
  }

  // Check blocks (first violated window wins)
  if (quota.quotaHourly != null && hCount > quota.quotaHourly) {
    return {
      allowed: false,
      blockedWindow: "hourly",
      headers,
      retryAfterSeconds: secondsUntilNextHour(),
    };
  }
  if (quota.quotaDaily != null && dCount > quota.quotaDaily) {
    return {
      allowed: false,
      blockedWindow: "daily",
      headers,
      retryAfterSeconds: secondsUntilMidnightUTC(),
    };
  }
  if (quota.quotaWeekly != null && wCount > quota.quotaWeekly) {
    return {
      allowed: false,
      blockedWindow: "weekly",
      headers,
      retryAfterSeconds: secondsUntilNextWeek(),
    };
  }
  if (quota.quotaMonthly != null && mCount > quota.quotaMonthly) {
    return {
      allowed: false,
      blockedWindow: "monthly",
      headers,
      retryAfterSeconds: secondsUntilNextMonth(),
    };
  }

  // Emit 80% warning events (fire-and-forget, deduplicated per window)
  maybeEmitQuotaWarning(apiKeyId, tenantId, quota, hCount, dCount, wCount, mCount).catch(
    () => {},
  );

  return { allowed: true, headers };
}

// ---------------------------------------------------------------------------
// 80% warning emission (deduplicated via Redis NX flag)
// ---------------------------------------------------------------------------

async function maybeEmitQuotaWarning(
  apiKeyId: string,
  tenantId: string,
  quota: QuotaConfig,
  hCount: number,
  dCount: number,
  wCount: number,
  mCount: number,
): Promise<void> {
  const redis = getRedisClient();

  const windows: Array<{
    key: string;
    ttlSeconds: number;
    window: string;
    count: number;
    limit: number;
  }> = [];

  if (quota.quotaHourly != null) {
    windows.push({
      key: `quota:warn:${apiKeyId}:h:${currentHourBucket()}`,
      ttlSeconds: 7_200,
      window: "hourly",
      count: hCount,
      limit: quota.quotaHourly,
    });
  }
  if (quota.quotaDaily != null) {
    windows.push({
      key: `quota:warn:${apiKeyId}:d:${currentDayBucket()}`,
      ttlSeconds: 172_800,
      window: "daily",
      count: dCount,
      limit: quota.quotaDaily,
    });
  }
  if (quota.quotaWeekly != null) {
    windows.push({
      key: `quota:warn:${apiKeyId}:w:${currentWeekBucket()}`,
      ttlSeconds: 691_200,
      window: "weekly",
      count: wCount,
      limit: quota.quotaWeekly,
    });
  }
  if (quota.quotaMonthly != null) {
    windows.push({
      key: `quota:warn:${apiKeyId}:m:${currentMonthBucket()}`,
      ttlSeconds: 2_764_800,
      window: "monthly",
      count: mCount,
      limit: quota.quotaMonthly,
    });
  }

  for (const w of windows) {
    const usagePct = w.count / w.limit;
    if (usagePct < 0.8 || usagePct >= 1.0) continue; // Only 80–99%

    // NX ensures we emit at most once per window period
    const set = await redis.set(w.key, "1", "EX", w.ttlSeconds, "NX");
    if (!set) continue; // Already warned this period

    emitPublicApiEvent(tenantId, "quota.warning", {
      api_key_id: apiKeyId,
      window: w.window,
      usage_pct: Math.round(usagePct * 100),
      remaining: w.limit - w.count,
      limit: w.limit,
    }).catch(() => {});
  }
}
