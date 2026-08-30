/**
 * Rate Limiter Service
 * Simple in-memory rate limiting with sliding window algorithm
 */
import { createRateLimiter, cleanupRateLimiters } from "./rateLimiterCore";
export { createRateLimiter } from "./rateLimiterCore";

// Pre-configured rate limiters
export const skillDetectionLimiter = createRateLimiter("skill-detection", {
  windowMs: 60000, // 1 minute
  maxRequests: 60, // 60 detections per minute
  blockDurationMs: 10000, // Block for 10 seconds if exceeded
});

export const skillExecutionLimiter = createRateLimiter("skill-execution", {
  windowMs: 60000, // 1 minute
  maxRequests: 15, // 15 executions per minute
  blockDurationMs: 60000, // Block for 1 minute if exceeded
});

export const mediaGenerationLimiter = createRateLimiter("media-generation", {
  windowMs: 300000, // 5 minutes
  // Raised 20 -> 100: this single bucket is shared across ALL media-generation
  // activity for a user (image gen, character portraits, storyboard, and the
  // Vertical Drama video-motion-prompt-pack, which checks the limiter once
  // per shot AND per clip). A single sub-episode alone bursts ~18-20 calls, so
  // 20/5min tripped almost immediately. 100/5min covers a realistic burst
  // while still capping runaway abuse (per-call credit checks remain the real
  // cost gate).
  maxRequests: 100, // 100 generations per 5 minutes
  blockDurationMs: 120000, // Block for 2 minutes if exceeded
});

export const registrationLimiter = createRateLimiter("registration", {
  windowMs: 3600000, // 1 hour
  maxRequests: 3, // 3 registrations per IP per hour
  blockDurationMs: 7200000, // Block for 2 hours if exceeded
});

export const groupOperationLimiter = createRateLimiter("group-operation", {
  windowMs: 60000, // 1 minute
  maxRequests: 20, // 20 group mutations per minute per user
  blockDurationMs: 30000, // Block for 30 seconds if exceeded
});

export const shareOperationLimiter = createRateLimiter("share-operation", {
  windowMs: 60000, // 1 minute
  maxRequests: 30, // 30 share operations per minute per user
  blockDurationMs: 30000, // Block for 30 seconds if exceeded
});

// ---------------------------------------------------------------------------
// Lux TTS Redis-based rate limiter (5 requests per 10 minutes per user)
// ---------------------------------------------------------------------------

export const LUX_TTS_MODEL_ID = "fal-ai/lux-tts";
const LUX_TTS_LIMIT = 5;
const LUX_TTS_WINDOW_SECONDS = 600; // 10 minutes

export function isLuxTtsModel(model: string | undefined): boolean {
  return model === LUX_TTS_MODEL_ID;
}

export async function checkLuxTtsRateLimit(
  userId: number,
): Promise<{ allowed: boolean; retryAfter: number | null }> {
  const { checkRateLimit } = await import(
    "../middleware/distributedRateLimit"
  );
  const result = await checkRateLimit(
    `ratelimit:lux-tts:${userId}`,
    LUX_TTS_LIMIT,
    LUX_TTS_WINDOW_SECONDS,
  );
  return { allowed: result.allowed, retryAfter: result.retryAfter };
}

// Cleanup old entries periodically (run every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
setInterval(() => {
  cleanupRateLimiters();
}, CLEANUP_INTERVAL);
