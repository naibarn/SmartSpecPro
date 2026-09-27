/**
 * PostgreSQL-backed per-API-key request quotas.
 *
 * These are exact hard request quotas, not edge abuse throttles and not credit
 * accounting. A transaction-scoped advisory lock serializes admission for one
 * API key across all Web instances. Redis remains in use by separate soft
 * abuse throttles until their own G3 cutover.
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db";
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

type QuotaWindow = "hourly" | "daily" | "weekly" | "monthly";
type QuotaEvent = { window: QuotaWindow; count: number; limit: number };

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

interface WindowConfig {
  window: QuotaWindow;
  limit: number;
  periodKey: string;
  ttlSeconds: number;
  retryAfterSeconds: number;
}

// ---------------------------------------------------------------------------
// Time window helpers (keep existing UTC bucket contracts)
// ---------------------------------------------------------------------------

function currentHourBucket(now: Date): string {
  return String(Math.floor(now.getTime() / 3_600_000));
}

function currentDayBucket(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function currentWeekBucket(now: Date): string {
  const jan1 = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86_400_000);
  const week = Math.ceil((dayOfYear + jan1.getUTCDay() + 1) / 7);
  return `${now.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function currentMonthBucket(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function secondsUntilNextHour(now: Date): number {
  return 3600 - (Math.floor(now.getTime() / 1000) % 3600);
}

function secondsUntilMidnightUTC(now: Date): number {
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  );
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

function secondsUntilNextWeek(now: Date): number {
  const day = now.getUTCDay() || 7;
  const daysToMonday = 8 - day;
  const nextMonday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + daysToMonday
    )
  );
  return Math.ceil((nextMonday.getTime() - now.getTime()) / 1000);
}

function secondsUntilNextMonth(now: Date): number {
  const firstOfNext = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  );
  return Math.ceil((firstOfNext.getTime() - now.getTime()) / 1000);
}

function getConfiguredWindows(quota: QuotaConfig, now: Date): WindowConfig[] {
  const windows: WindowConfig[] = [];
  if (quota.quotaHourly != null) {
    windows.push({
      window: "hourly",
      limit: quota.quotaHourly,
      periodKey: currentHourBucket(now),
      ttlSeconds: 7200,
      retryAfterSeconds: secondsUntilNextHour(now),
    });
  }
  if (quota.quotaDaily != null) {
    windows.push({
      window: "daily",
      limit: quota.quotaDaily,
      periodKey: currentDayBucket(now),
      ttlSeconds: 172800,
      retryAfterSeconds: secondsUntilMidnightUTC(now),
    });
  }
  if (quota.quotaWeekly != null) {
    windows.push({
      window: "weekly",
      limit: quota.quotaWeekly,
      periodKey: currentWeekBucket(now),
      ttlSeconds: 691200,
      retryAfterSeconds: secondsUntilNextWeek(now),
    });
  }
  if (quota.quotaMonthly != null) {
    windows.push({
      window: "monthly",
      limit: quota.quotaMonthly,
      periodKey: currentMonthBucket(now),
      ttlSeconds: 2764800,
      retryAfterSeconds: secondsUntilNextMonth(now),
    });
  }
  return windows;
}

function buildHeaders(
  windows: WindowConfig[],
  counts: Map<QuotaWindow, number>,
  now: Date
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const entry of windows) {
    const count = counts.get(entry.window) ?? 0;
    const label = entry.window[0].toUpperCase() + entry.window.slice(1);
    headers[`X-Quota-${label}-Limit`] = String(entry.limit);
    headers[`X-Quota-${label}-Remaining`] = String(
      Math.max(0, entry.limit - count)
    );
    if (entry.window === "hourly") {
      headers["X-Quota-Hourly-Reset"] = String(
        (Math.floor(now.getTime() / 3_600_000) + 1) * 3600
      );
    }
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Expired counter cleanup
// ---------------------------------------------------------------------------

let cleanupAfter = 0;
let cleanupInFlight: Promise<void> | null = null;
let quotaChecksSinceCleanup = 0;

async function cleanupExpiredCounters(): Promise<void> {
  if (cleanupInFlight) return cleanupInFlight;
  if (Date.now() < cleanupAfter) return;
  cleanupAfter = Date.now() + 60 * 60 * 1000;

  cleanupInFlight = (async () => {
    const db = await getDb();
    await db.execute(sql`
      WITH expired AS (
        SELECT ctid
        FROM api_key_quota_counters
        WHERE "expiresAt" < now()
        ORDER BY "expiresAt"
        LIMIT 500
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM api_key_quota_counters AS counters
      USING expired
      WHERE counters.ctid = expired.ctid
    `);
  })().finally(() => {
    cleanupInFlight = null;
  });

  return cleanupInFlight;
}

// ---------------------------------------------------------------------------
// Core: atomically increment configured quotas and enforce all windows
// ---------------------------------------------------------------------------

/**
 * Atomically increments every configured request quota and applies the same
 * INCR-then-check rule as the Redis implementation: the first request beyond
 * any limit is rejected, and all configured window counts still advance.
 */
export async function checkAndIncrementQuota(
  apiKeyId: string,
  tenantId: string,
  quota: QuotaConfig,
  // Test seam for deterministic window-boundary integration probes.
  now = new Date()
): Promise<QuotaCheckResult> {
  const windows = getConfiguredWindows(quota, now);
  if (windows.length === 0) return { allowed: true, headers: {} };

  const db = await getDb();
  const reservation = await db.transaction(async tx => {
    // Bound lock waits so one hot key cannot hold pool connections indefinitely.
    await tx.execute(sql`SET LOCAL lock_timeout = '2s'`);
    await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
    // Hash collision only serializes unrelated keys; it cannot merge their data.
    await tx.execute(sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${apiKeyId}, 0))
    `);

    const counts = new Map<QuotaWindow, number>();
    const warnings: QuotaEvent[] = [];
    for (const entry of windows) {
      const result = await tx.execute(sql`
        INSERT INTO api_key_quota_counters
          ("tenantId", "apiKeyId", "window", "periodKey", "requestCount", "expiresAt", "updatedAt")
        VALUES (
          ${tenantId}, ${apiKeyId}, ${entry.window}, ${entry.periodKey}, 1,
          now() + (${entry.ttlSeconds} * interval '1 second'), now()
        )
        ON CONFLICT ("apiKeyId", "window", "periodKey")
        DO UPDATE SET
          "requestCount" = api_key_quota_counters."requestCount" + 1,
          "expiresAt" = EXCLUDED."expiresAt",
          "updatedAt" = now()
        WHERE api_key_quota_counters."tenantId" = EXCLUDED."tenantId"
        RETURNING "requestCount"
      `);
      const count = Number(
        getRows<{ requestCount: number | string }>(result)[0]?.requestCount
      );
      if (!Number.isInteger(count) || count < 1) {
        throw new Error(
          "PostgreSQL quota counter did not return a valid count"
        );
      }
      counts.set(entry.window, count);

      if (count * 100 >= entry.limit * 80 && count < entry.limit) {
        const warningResult = await tx.execute(sql`
          UPDATE api_key_quota_counters
          SET "warnedAt" = now()
          WHERE "apiKeyId" = ${apiKeyId}
            AND "window" = ${entry.window}
            AND "periodKey" = ${entry.periodKey}
            AND "warnedAt" IS NULL
          RETURNING "requestCount"
        `);
        if (getRows(warningResult).length > 0) {
          warnings.push({ window: entry.window, count, limit: entry.limit });
        }
      }
    }

    return { counts, warnings };
  });

  // Cleanup is bounded, best-effort maintenance; quota admission remains
  // fail-closed if the counter transaction itself fails.
  quotaChecksSinceCleanup += 1;
  if (quotaChecksSinceCleanup >= 1000) {
    quotaChecksSinceCleanup = 0;
    void cleanupExpiredCounters().catch(() => {});
  }

  for (const warning of reservation.warnings) {
    void emitPublicApiEvent(tenantId, "quota.warning", {
      api_key_id: apiKeyId,
      window: warning.window,
      usage_pct: Math.round((warning.count / warning.limit) * 100),
      remaining: warning.limit - warning.count,
      limit: warning.limit,
    }).catch(() => {});
  }

  const headers = buildHeaders(windows, reservation.counts, now);
  for (const entry of windows) {
    const count = reservation.counts.get(entry.window) ?? 0;
    if (count > entry.limit) {
      return {
        allowed: false,
        blockedWindow: entry.window,
        headers,
        retryAfterSeconds: entry.retryAfterSeconds,
      };
    }
  }

  return { allowed: true, headers };
}
