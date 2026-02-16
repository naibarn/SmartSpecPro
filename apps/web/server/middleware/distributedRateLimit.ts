/**
 * Redis-backed distributed rate limiter using sorted set sliding window.
 *
 * Uses the cache Redis client (Upstash in production) for distributed state.
 * Falls closed on Redis errors (rejects the request) to prevent bypass attacks.
 */

import type { Request, Response, NextFunction } from "express";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
  identifierType: "ip" | "userId";
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number | null;
}

// ─── Endpoint-specific rate limits ──────────────────────────────────────────

export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  "POST /api/auth/login": { limit: 5, windowSeconds: 60, identifierType: "ip" },
  "POST /api/auth/signup": { limit: 3, windowSeconds: 60, identifierType: "ip" },
  "POST /api/jobs": { limit: 10, windowSeconds: 60, identifierType: "userId" },
  "POST /api/generate": { limit: 5, windowSeconds: 60, identifierType: "userId" },
};

// ─── Sliding window check ───────────────────────────────────────────────────

/**
 * Check rate limit using Redis sorted set sliding window.
 *
 * Algorithm:
 * 1. ZREMRANGEBYSCORE to prune expired entries
 * 2. ZCARD to count current entries
 * 3. If count >= limit: blocked, compute retryAfter from oldest entry
 * 4. If count < limit: ZADD current timestamp, EXPIRE with window + buffer
 *
 * Fails closed on Redis errors.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    // Lazy import to avoid circular dependencies during test mocking
    const { getCacheClient } = await import("../services/redisClients");
    const redis = getCacheClient();

    const now = Date.now() / 1000; // Unix timestamp in seconds
    const windowStart = now - windowSeconds;

    // Remove expired entries
    await redis.zremrangebyscore(key, 0, windowStart);

    // Count current entries
    const currentCount = await redis.zcard(key);

    if (currentCount >= limit) {
      // Over limit — compute retry-after from oldest entry
      const oldest = await redis.zrange(key, 0, 0);
      let retryAfter = windowSeconds;
      if (oldest.length > 0) {
        const oldestTime = parseFloat(oldest[0]);
        retryAfter = Math.ceil(oldestTime + windowSeconds - now);
        if (retryAfter < 1) retryAfter = 1;
      }

      return { allowed: false, remaining: 0, retryAfter };
    }

    // Under limit — add current request
    await redis.zadd(key, now, String(now));
    await redis.expire(key, windowSeconds + 60); // Buffer to handle clock skew

    return {
      allowed: true,
      remaining: limit - currentCount - 1,
      retryAfter: null,
    };
  } catch (error) {
    // Fail closed: reject requests when Redis is unavailable to prevent bypass.
    // This is more conservative but prevents attackers from exploiting Redis downtime.
    console.error("[RateLimit] Redis error, failing closed:", (error as Error).message);
    return { allowed: false, remaining: 0, retryAfter: 30 };
  }
}

// ─── Express middleware factory ─────────────────────────────────────────────

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

/**
 * Sanitize a value for use as a Redis key component.
 * Removes characters that could cause key injection or collisions.
 */
function sanitizeKeyComponent(value: string): string {
  return value.replace(/[:\/*?\0\\]/g, "_").replace(/\.\./g, "_").slice(0, 128);
}

/**
 * Create an Express middleware that applies distributed rate limiting.
 *
 * @param config - Rate limit configuration for the endpoint
 * @param namespace - Namespace prefix for the Redis key (e.g., "login", "signup")
 */
export function distributedRateLimitMiddleware(
  namespace: string,
  config: RateLimitConfig,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rawIdentifier =
      config.identifierType === "ip"
        ? extractIp(req)
        : (req as any).userId || extractIp(req);

    const key = `ratelimit:${namespace}:${sanitizeKeyComponent(rawIdentifier)}`;
    const result = await checkRateLimit(key, config.limit, config.windowSeconds);

    if (!result.allowed) {
      res.set("Retry-After", String(result.retryAfter));
      return res.status(429).json({
        error: "Too many requests",
        retryAfter: result.retryAfter,
      });
    }

    // Set rate limit headers
    res.set("X-RateLimit-Limit", String(config.limit));
    res.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));

    next();
  };
}
