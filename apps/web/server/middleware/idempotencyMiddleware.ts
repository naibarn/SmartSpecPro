import type { Request, Response, NextFunction } from "express";
import { getRedisClient } from "../services/redis";
import { sendApiError } from "./publicApiHeaders";

const MAX_KEY_LENGTH = 64;
const MAX_CACHE_SIZE = 1_048_576; // 1MB
const LARGE_RESPONSE_SIZE = 102_400; // 100KB

/**
 * Idempotency middleware for POST requests.
 * Uses Redis NX lock to prevent concurrent duplicate execution.
 */
export function idempotencyMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST") return next();

    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    if (!idempotencyKey) return next();

    if (idempotencyKey.length > MAX_KEY_LENGTH) {
      return sendApiError(
        res,
        400,
        "invalid_request",
        `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`,
      );
    }

    const tenantId = (req.auth as any)?.tenantId ?? "unknown";
    const cacheKey = `idempotency:${tenantId}:${idempotencyKey}`;
    const lockKey = `idempotency:lock:${tenantId}:${idempotencyKey}`;

    const redis = getRedisClient();

    // Acquire lock (NX = set-if-not-exists)
    const acquired = await redis.set(lockKey, "1", "EX", 60, "NX");
    if (!acquired) {
      return sendApiError(
        res,
        409,
        "idempotency_conflict",
        "A request with this Idempotency-Key is already being processed",
      );
    }

    try {
      // Check for cached response
      const cached = await redis.get(cacheKey);
      if (cached) {
        const { statusCode, body, contentType } = JSON.parse(cached);
        if (contentType) res.setHeader("Content-Type", contentType);
        await redis.del(lockKey).catch(() => {});
        return res.status(statusCode).send(body);
      }

      // Intercept res.json to capture response for caching and release lock
      const originalJson = res.json.bind(res);
      res.json = ((body: any) => {
        const serialized = JSON.stringify(body);
        const byteSize = Buffer.byteLength(serialized, "utf-8");

        if (byteSize <= MAX_CACHE_SIZE) {
          const ttl =
            byteSize > LARGE_RESPONSE_SIZE ? 3600 : 86400;
          const cacheValue = JSON.stringify({
            statusCode: res.statusCode,
            body: serialized,
            contentType: res.getHeader("content-type"),
          });
          redis.set(cacheKey, cacheValue, "EX", ttl).catch(() => {});
        }

        redis.del(lockKey).catch(() => {});
        return originalJson(body);
      }) as any;

      // Also intercept res.send (SSE and non-JSON responses) to release the lock
      const originalSend = res.send.bind(res);
      res.send = ((body: any) => {
        redis.del(lockKey).catch(() => {});
        res.send = originalSend; // restore to prevent double-del on subsequent writes
        return originalSend(body);
      }) as any;

      next();
    } catch {
      await redis.del(lockKey).catch(() => {});
      next();
    }
  };
}
