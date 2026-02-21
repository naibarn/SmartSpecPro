/**
 * Per-user rate limiters for OneDrive operations.
 *
 * Uses the same createRateLimiter factory from rateLimiter.ts.
 * Keys are user IDs (not IPs) since all OneDrive operations require auth.
 */

import { createRateLimiter } from "./rateLimiter";

export const onedriveSearchLimiter = createRateLimiter("onedrive-search", {
  windowMs: 60000,
  maxRequests: 30,
  blockDurationMs: 10000,
});

export const onedriveReadLimiter = createRateLimiter("onedrive-read", {
  windowMs: 60000,
  maxRequests: 60,
  blockDurationMs: 10000,
});

export const onedriveSyncLimiter = createRateLimiter("onedrive-sync", {
  windowMs: 60000,
  maxRequests: 5,
  blockDurationMs: 30000,
});

export const onedriveEditLimiter = createRateLimiter("onedrive-edit", {
  windowMs: 60000,
  maxRequests: 10,
  blockDurationMs: 30000,
});
