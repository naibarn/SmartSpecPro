import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "./redis";

const TENANT_RPM_LIMIT = 600;

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  headers: Record<string, string>;
  retryAfterSeconds?: number;
}

interface DailyCreditResult {
  allowed: boolean;
  remaining?: number;
  retryAfterSeconds?: number;
}

export interface CreditQuotaConfig {
  /** Legacy daily credit cap kept for existing API keys. */
  creditLimit?: number | null;
  creditQuota5h?: number | null;
  creditQuotaDaily?: number | null;
  creditQuotaWeekly?: number | null;
}

export interface CreditQuotaCheckResult {
  allowed: boolean;
  blockedWindow?: "5h" | "1d" | "7d";
  retryAfterSeconds?: number;
  headers: Record<string, string>;
}

function secondsUntilNextMinute(): number {
  return 60 - (Math.floor(Date.now() / 1000) % 60);
}

function secondsUntilMidnightUTC(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function fiveHourBucket(): number {
  return Math.floor(Date.now() / (5 * 60 * 60 * 1000));
}

function sevenDayBucket(): number {
  return Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
}

function secondsUntilFiveHourBucketReset(): number {
  const windowSeconds = 5 * 60 * 60;
  return windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
}

function secondsUntilSevenDayBucketReset(): number {
  const windowSeconds = 7 * 24 * 60 * 60;
  return windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
}

function quotaKey(apiKeyId: string, window: "5h" | "1d" | "7d"): string {
  if (window === "5h") return `creditquota:apikey:${apiKeyId}:5h:${fiveHourBucket()}`;
  if (window === "7d") return `creditquota:apikey:${apiKeyId}:7d:${sevenDayBucket()}`;
  return `creditquota:apikey:${apiKeyId}:1d:${todayUTC()}`;
}

function quotaTtl(window: "5h" | "1d" | "7d"): number {
  if (window === "5h") return 6 * 60 * 60;
  if (window === "7d") return 8 * 24 * 60 * 60;
  return 2 * 24 * 60 * 60;
}

/**
 * Sliding-window rate limiter using Redis INCR with minute-granularity buckets.
 */
export async function checkRateLimit(
  apiKeyId: string,
  tenantId: string,
  keyRateLimit: number = 60,
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  const minuteTs = Math.floor(Date.now() / 60000);
  const resetTimestamp = (minuteTs + 1) * 60;

  const keyBucket = `ratelimit:apikey:${apiKeyId}:${minuteTs}`;
  const tenantBucket = `ratelimit:tenant:api:${tenantId}:${minuteTs}`;

  // INCR both counters
  const [keyCount, tenantCount] = await Promise.all([
    redis.incr(keyBucket),
    redis.incr(tenantBucket),
  ]);

  // Set TTL on first request in this window
  if (keyCount === 1) redis.expire(keyBucket, 120).catch(() => {});
  if (tenantCount === 1) redis.expire(tenantBucket, 120).catch(() => {});

  const keyRemaining = Math.max(0, keyRateLimit - keyCount);
  const tenantRemaining = Math.max(0, TENANT_RPM_LIMIT - tenantCount);
  const remaining = Math.min(keyRemaining, tenantRemaining);

  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(keyRateLimit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(resetTimestamp),
  };

  if (keyCount > keyRateLimit || tenantCount > TENANT_RPM_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      headers,
      retryAfterSeconds: secondsUntilNextMinute(),
    };
  }

  return { allowed: true, remaining, headers };
}

/**
 * Check whether a key has exceeded its daily credit limit.
 */
export async function checkDailyCreditLimit(
  apiKeyId: string,
  creditLimit: number | null,
): Promise<DailyCreditResult> {
  if (creditLimit === null || creditLimit === undefined) {
    return { allowed: true };
  }

  const redis = getRedisClient();
  const key = `creditlimit:apikey:${apiKeyId}:${todayUTC()}`;
  const raw = await redis.get(key);
  const accumulated = raw ? parseInt(raw, 10) : 0;

  if (accumulated >= creditLimit) {
    return {
      allowed: false,
      retryAfterSeconds: secondsUntilMidnightUTC(),
    };
  }

  return { allowed: true, remaining: creditLimit - accumulated };
}

/**
 * Increment daily credit counter for a key.
 */
export async function incrementDailyCredits(
  apiKeyId: string,
  amount: number,
): Promise<void> {
  const redis = getRedisClient();
  const key = `creditlimit:apikey:${apiKeyId}:${todayUTC()}`;
  await redis.incrby(key, amount);

  // Auto-expire at midnight UTC + 1 day
  const midnightTomorrow = new Date();
  midnightTomorrow.setUTCHours(0, 0, 0, 0);
  midnightTomorrow.setUTCDate(midnightTomorrow.getUTCDate() + 1);
  redis.expireat(key, Math.floor(midnightTomorrow.getTime() / 1000)).catch(() => {});
}

/**
 * Read all configured credit windows before an expensive public/MCP request.
 * This is intentionally a separate budget from request-count quotas: a
 * client can make many harmless discovery calls without being able to spend
 * unlimited generation/render credits.
 */
export async function checkCreditQuotas(
  apiKeyId: string,
  config: CreditQuotaConfig,
): Promise<CreditQuotaCheckResult> {
  const dailyLimit = [config.creditLimit, config.creditQuotaDaily]
    .filter((value): value is number => value != null)
    .reduce<number | null>((min, value) => min == null ? value : Math.min(min, value), null);
  const limits: Array<{ window: "5h" | "1d" | "7d"; limit: number | null }> = [
    { window: "5h", limit: config.creditQuota5h ?? null },
    { window: "1d", limit: dailyLimit },
    { window: "7d", limit: config.creditQuotaWeekly ?? null },
  ];
  const configured = limits.filter((entry): entry is { window: "5h" | "1d" | "7d"; limit: number } => entry.limit != null);
  if (configured.length === 0) return { allowed: true, headers: {} };

  const redis = getRedisClient();
  const values = await Promise.all(configured.map(async ({ window }) => {
    const raw = await redis.get(quotaKey(apiKeyId, window));
    return { window, used: raw ? Math.max(0, Number.parseInt(raw, 10) || 0) : 0 };
  }));
  const headers: Record<string, string> = {};
  for (const { window, limit } of configured) {
    const used = values.find((value) => value.window === window)?.used ?? 0;
    const label = window === "5h" ? "5h" : window === "1d" ? "1d" : "7d";
    headers[`X-Credit-Quota-${label}-Limit`] = String(limit);
    headers[`X-Credit-Quota-${label}-Used`] = String(used);
    headers[`X-Credit-Quota-${label}-Remaining`] = String(Math.max(0, limit - used));
  }

  for (const { window, limit } of configured) {
    const used = values.find((value) => value.window === window)?.used ?? 0;
    if (used >= limit) {
      return {
        allowed: false,
        blockedWindow: window,
        retryAfterSeconds: window === "5h"
          ? secondsUntilFiveHourBucketReset()
          : window === "7d"
            ? secondsUntilSevenDayBucketReset()
            : secondsUntilMidnightUTC(),
        headers,
      };
    }
  }
  return { allowed: true, headers };
}

/** Record actual credits reported by the completed route/MCP tool call. */
export async function incrementCreditQuotas(
  apiKeyId: string,
  amount: number,
  config: CreditQuotaConfig,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const dailyConfigured = config.creditLimit != null || config.creditQuotaDaily != null;
  const windows: Array<"5h" | "1d" | "7d"> = [
    ...(config.creditQuota5h != null ? ["5h" as const] : []),
    ...(dailyConfigured ? ["1d" as const] : []),
    ...(config.creditQuotaWeekly != null ? ["7d" as const] : []),
  ];
  if (windows.length === 0) return;

  const redis = getRedisClient();
  const pipeline = redis.pipeline();
  for (const window of windows) {
    pipeline.incrby(quotaKey(apiKeyId, window), Math.ceil(amount));
  }
  const results = await pipeline.exec();
  const ttlPipeline = redis.pipeline();
  windows.forEach((window, index) => {
    if ((results?.[index]?.[1] as number) === Math.ceil(amount)) {
      ttlPipeline.expire(quotaKey(apiKeyId, window), quotaTtl(window));
    }
  });
  await ttlPipeline.exec();
}

/**
 * Rate limit middleware wrapper for Express.
 * Reads auth context from req.auth.
 */
export function rateLimitMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.auth?.mode !== "api_key") return next();

    const result = await checkRateLimit(
      req.auth.apiKeyId,
      req.auth.tenantId,
      req.auth.rateLimit ?? 60,
    );

    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }

    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      res.setHeader("X-Api-Error-Code", "rate_limit_exceeded");
      return res.status(429).json({
        error: {
          code: "rate_limit_exceeded",
          message: "Rate limit exceeded. Try again later.",
          type: "rate_limit_error",
        },
      });
    }

    // Preserve the original daily counter for legacy REST keys. Dedicated MCP
    // keys use the independent multi-window credit budget below.
    let creditCheck: CreditQuotaCheckResult | (DailyCreditResult & { headers: Record<string, string> });
    try {
      creditCheck = req.auth.keyPurpose === "mcp_cli"
        ? await checkCreditQuotas(req.auth.apiKeyId, {
            creditLimit: req.auth.creditLimit ?? null,
            creditQuota5h: req.auth.creditQuota5h ?? null,
            creditQuotaDaily: req.auth.creditQuotaDaily ?? null,
            creditQuotaWeekly: req.auth.creditQuotaWeekly ?? null,
          })
        : {
            ...(await checkDailyCreditLimit(req.auth.apiKeyId, req.auth.creditLimit ?? null)),
            headers: {},
          };
    } catch {
      // A configured MCP budget must fail closed when its Redis enforcement
      // state is unavailable; never turn an outage into an unmetered bypass.
      if (req.auth.keyPurpose === "mcp_cli") {
        res.setHeader("Retry-After", "30");
        res.setHeader("X-Api-Error-Code", "credit_quota_unavailable");
        return res.status(503).json({
          error: {
            code: "quota_unavailable",
            message: "Credit quota enforcement is temporarily unavailable. Try again shortly.",
            type: "service_unavailable",
          },
        });
      }
      throw new Error("Legacy API credit quota check failed");
    }
    for (const [key, value] of Object.entries(creditCheck.headers)) {
      res.setHeader(key, value);
    }
    if (!creditCheck.allowed) {
      const blockedWindow = "blockedWindow" in creditCheck && creditCheck.blockedWindow
        ? creditCheck.blockedWindow
        : "1d";
      res.setHeader("Retry-After", String(creditCheck.retryAfterSeconds ?? 3600));
      res.setHeader("X-Api-Error-Code", "credit_quota_exceeded");
      return res.status(429).json({
        error: {
          code: "quota_exceeded",
          message: `Credit quota (${blockedWindow}) for this API key has been reached.`,
          type: "billing_error",
        },
      });
    }

    next();
  };
}
