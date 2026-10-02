/** PostgreSQL-backed sliding-window limiter shared by all web instances. */

import type { Request, Response, NextFunction } from "express";
import { consumeSlidingWindow } from "../services/postgresRateLimitStore";

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
  error?: "storage_unavailable";
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
 * Consume one slot from a PostgreSQL-backed sliding window.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const result = await consumeSlidingWindow("system-rate-limit", key, limit, windowSeconds);
    return {
      allowed: result.allowed,
      remaining: result.remaining,
      retryAfter: result.retryAfterSeconds,
    };
  } catch (error) {
    console.error("[RateLimit] PostgreSQL error, failing closed:", (error as Error).message);
    return { allowed: false, remaining: 0, retryAfter: 30, error: "storage_unavailable" };
  }
}

// ─── Express middleware factory ─────────────────────────────────────────────

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
}

/**
 * Sanitize a value for use as a rate limit identifier.
 * Removes characters that could cause key injection or collisions.
 */
function sanitizeKeyComponent(value: string): string {
  return value.replace(/[:\/*?\0\\]/g, "_").replace(/\.\./g, "_").slice(0, 128);
}

/**
 * Create an Express middleware that applies distributed rate limiting.
 *
 * @param config - Rate limit configuration for the endpoint
 * @param namespace - Namespace prefix for the rate limit identifier (e.g., "login", "signup")
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
