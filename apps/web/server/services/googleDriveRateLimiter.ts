/**
 * Per-user rate limiters for Google Drive operations.
 *
 * Uses the same createRateLimiter factory from rateLimiter.ts.
 * Keys are user IDs (not IPs) since all Drive operations require auth.
 */

import { createRateLimiter } from "./rateLimiter";

export const gdriveSearchLimiter = createRateLimiter("gdrive-search", {
  windowMs: 60000,
  maxRequests: 30,
  blockDurationMs: 10000,
});

export const gdriveReadLimiter = createRateLimiter("gdrive-read", {
  windowMs: 60000,
  maxRequests: 60,
  blockDurationMs: 10000,
});

export const gdriveSyncLimiter = createRateLimiter("gdrive-sync", {
  windowMs: 60000,
  maxRequests: 5,
  blockDurationMs: 30000,
});

export const gdriveEditLimiter = createRateLimiter("gdrive-edit", {
  windowMs: 60000,
  maxRequests: 10,
  blockDurationMs: 30000,
});
