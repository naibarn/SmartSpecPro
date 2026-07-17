/**
 * Rate Limiter Service
 * Simple in-memory rate limiting with sliding window algorithm
 */

interface RateLimitEntry {
  timestamps: number[];
  blocked: boolean;
  blockedUntil?: number;
}

interface RateLimiterConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  blockDurationMs?: number; // How long to block after limit exceeded
}

const limiters: Map<string, Map<string, RateLimitEntry>> = new Map();

/**
 * Create a rate limiter with specific configuration
 */
export function createRateLimiter(name: string, config: RateLimiterConfig) {
  if (!limiters.has(name)) {
    limiters.set(name, new Map());
  }

  return {
    /**
     * Check if request should be allowed
     * @returns true if allowed, false if rate limited
     */
    isAllowed(key: string): boolean {
      const entries = limiters.get(name)!;
      const now = Date.now();

      // Get or create entry
      let entry = entries.get(key);
      if (!entry) {
        entry = { timestamps: [], blocked: false };
        entries.set(key, entry);
      }

      // Check if currently blocked
      if (entry.blocked && entry.blockedUntil && entry.blockedUntil > now) {
        return false;
      } else if (entry.blocked && entry.blockedUntil && entry.blockedUntil <= now) {
        // Unblock and reset
        entry.blocked = false;
        entry.blockedUntil = undefined;
        entry.timestamps = [];
      }

      // Filter timestamps within window
      const windowStart = now - config.windowMs;
      entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

      // Check if within limit
      if (entry.timestamps.length >= config.maxRequests) {
        // Apply block if configured
        if (config.blockDurationMs) {
          entry.blocked = true;
          entry.blockedUntil = now + config.blockDurationMs;
        }
        return false;
      }

      // Record timestamp and allow
      entry.timestamps.push(now);
      return true;
    },

    /**
     * Get remaining requests for a key
     */
    getRemaining(key: string): number {
      const entries = limiters.get(name)!;
      const entry = entries.get(key);
      if (!entry) return config.maxRequests;

      const now = Date.now();
      const windowStart = now - config.windowMs;
      const validTimestamps = entry.timestamps.filter((ts) => ts > windowStart);

      return Math.max(0, config.maxRequests - validTimestamps.length);
    },

    /**
     * Get time until rate limit resets (in ms)
     */
    getResetTime(key: string): number {
      const entries = limiters.get(name)!;
      const entry = entries.get(key);
      if (!entry) return 0;

      const now = Date.now();

      // An active explicit block is the real gate: when the block lifts,
      // `isAllowed` clears the sliding window and permits the next request
      // immediately, so the block's remaining time — not the window — is the
      // true wait. `blockDurationMs` and `windowMs` are independent and the
      // block can be shorter than the window; the old window-only calc then
      // reported 0 (or a too-small value) while the caller was still blocked,
      // surfacing a misleading "try again in 0 seconds".
      if (entry.blocked && entry.blockedUntil && entry.blockedUntil > now) {
        return entry.blockedUntil - now;
      }

      if (entry.timestamps.length === 0) return 0;

      const oldestTimestamp = Math.min(...entry.timestamps);
      const resetTime = oldestTimestamp + config.windowMs - now;

      return Math.max(0, resetTime);
    },

    /**
     * Clear rate limit for a key
     */
    reset(key: string): void {
      const entries = limiters.get(name)!;
      entries.delete(key);
    },

    /**
     * Clear all entries (for cleanup)
     */
    clear(): void {
      const entries = limiters.get(name)!;
      entries.clear();
    },
  };
}

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
  const now = Date.now();
  const MAX_AGE = 10 * 60 * 1000; // 10 minutes

  for (const [, entries] of limiters) {
    for (const [key, entry] of entries) {
      // Remove entries with no recent activity
      if (entry.timestamps.length === 0 && (!entry.blocked || (entry.blockedUntil && entry.blockedUntil < now))) {
        entries.delete(key);
        continue;
      }

      // Remove very old timestamps
      const recentTimestamps = entry.timestamps.filter((ts) => ts > now - MAX_AGE);
      if (recentTimestamps.length === 0 && (!entry.blocked || (entry.blockedUntil && entry.blockedUntil < now))) {
        entries.delete(key);
      }
    }
  }
}, CLEANUP_INTERVAL);
