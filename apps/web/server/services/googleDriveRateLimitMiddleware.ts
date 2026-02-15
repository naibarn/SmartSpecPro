/**
 * tRPC middleware for per-user Google Drive rate limiting.
 *
 * Similar to rateLimitedProcedure.ts but uses user ID instead of IP.
 */

import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../_core/context";

type RateLimiterInstance = {
  isAllowed(key: string): boolean;
  getResetTime(key: string): number;
};

/**
 * Creates a tRPC middleware that enforces per-user rate limiting for
 * Google Drive operations. Throws TRPCError with code TOO_MANY_REQUESTS
 * when the limit is exceeded, including retryAfter in the error data.
 */
export function createGDriveRateLimitMiddleware(limiter: RateLimiterInstance) {
  return async ({ ctx, next }: { ctx: TrpcContext; next: () => Promise<any> }) => {
    const userId = (ctx as any).user?.id;
    if (!userId) {
      // No user context -- skip rate limiting (auth middleware will catch)
      return next();
    }

    const key = `user:${userId}`;
    if (!limiter.isAllowed(key)) {
      const retryAfter = Math.ceil(limiter.getResetTime(key) / 1000);
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Rate limit exceeded. Please try again later.",
        cause: { retryAfter },
      });
    }

    return next();
  };
}
