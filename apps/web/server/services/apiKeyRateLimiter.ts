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
 * Rate limit middleware wrapper for Express.
 * Reads auth context from req.auth.
 */
export function rateLimitMiddleware() {
  return async (req: any, res: any, next: any) => {
    if (req.auth?.mode !== "api_key") return next();

    const result = await checkRateLimit(
      req.auth.apiKeyId,
      req.auth.tenantId,
      (req as any).auth?.rateLimit ?? 60,
    );

    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }

    if (!result.allowed) {
      res.setHeader("Retry-After", String(result.retryAfterSeconds));
      return res.status(429).json({
        error: {
          code: "rate_limit_exceeded",
          message: "Rate limit exceeded. Try again later.",
          type: "rate_limit_error",
        },
      });
    }

    // Enforce per-key daily credit cap (if configured)
    const creditCheck = await checkDailyCreditLimit(
      req.auth.apiKeyId,
      req.auth.creditLimit ?? null,
    );
    if (!creditCheck.allowed) {
      res.setHeader("Retry-After", String(creditCheck.retryAfterSeconds ?? 3600));
      return res.status(429).json({
        error: {
          code: "daily_credit_limit_exceeded",
          message: "Daily credit limit for this API key has been reached.",
          type: "rate_limit_error",
        },
      });
    }

    next();
  };
}
