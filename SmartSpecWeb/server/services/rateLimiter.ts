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
      if (!entry || entry.timestamps.length === 0) return 0;

      const oldestTimestamp = Math.min(...entry.timestamps);
      const resetTime = oldestTimestamp + config.windowMs - Date.now();

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
  maxRequests: 30, // 30 detections per minute
  blockDurationMs: 30000, // Block for 30 seconds if exceeded
});

export const skillExecutionLimiter = createRateLimiter("skill-execution", {
  windowMs: 60000, // 1 minute
  maxRequests: 10, // 10 executions per minute
  blockDurationMs: 60000, // Block for 1 minute if exceeded
});

export const mediaGenerationLimiter = createRateLimiter("media-generation", {
  windowMs: 300000, // 5 minutes
  maxRequests: 20, // 20 generations per 5 minutes
  blockDurationMs: 120000, // Block for 2 minutes if exceeded
});

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
