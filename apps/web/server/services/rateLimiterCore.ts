interface RateLimitEntry {
  timestamps: number[];
  blocked: boolean;
  blockedUntil?: number;
}

interface RateLimiterConfig {
  windowMs: number;
  maxRequests: number;
  blockDurationMs?: number;
}

const limiters: Map<string, Map<string, RateLimitEntry>> = new Map();

/** Create an in-memory sliding-window limiter with an independent named bucket. */
export function createRateLimiter(name: string, config: RateLimiterConfig) {
  if (!limiters.has(name)) limiters.set(name, new Map());

  return {
    isAllowed(key: string): boolean {
      const entries = limiters.get(name)!;
      const now = Date.now();
      let entry = entries.get(key);
      if (!entry) {
        entry = { timestamps: [], blocked: false };
        entries.set(key, entry);
      }

      if (entry.blocked && entry.blockedUntil && entry.blockedUntil > now) {
        return false;
      } else if (entry.blocked && entry.blockedUntil && entry.blockedUntil <= now) {
        entry.blocked = false;
        entry.blockedUntil = undefined;
        entry.timestamps = [];
      }

      const windowStart = now - config.windowMs;
      entry.timestamps = entry.timestamps.filter(ts => ts > windowStart);
      if (entry.timestamps.length >= config.maxRequests) {
        if (config.blockDurationMs) {
          entry.blocked = true;
          entry.blockedUntil = now + config.blockDurationMs;
        }
        return false;
      }

      entry.timestamps.push(now);
      return true;
    },

    getRemaining(key: string): number {
      const entry = limiters.get(name)!.get(key);
      if (!entry) return config.maxRequests;
      const windowStart = Date.now() - config.windowMs;
      const validTimestamps = entry.timestamps.filter(ts => ts > windowStart);
      return Math.max(0, config.maxRequests - validTimestamps.length);
    },

    getResetTime(key: string): number {
      const entry = limiters.get(name)!.get(key);
      if (!entry) return 0;
      const now = Date.now();
      if (entry.blocked && entry.blockedUntil && entry.blockedUntil > now) {
        return entry.blockedUntil - now;
      }
      if (entry.timestamps.length === 0) return 0;
      return Math.max(0, Math.min(...entry.timestamps) + config.windowMs - now);
    },

    reset(key: string): void {
      limiters.get(name)!.delete(key);
    },

    clear(): void {
      limiters.get(name)!.clear();
    },
  };
}

export function cleanupRateLimiters(now = Date.now()): void {
  const maxAge = 10 * 60 * 1000;
  for (const [, entries] of limiters) {
    for (const [key, entry] of entries) {
      const recentTimestamps = entry.timestamps.filter(ts => ts > now - maxAge);
      if (
        recentTimestamps.length === 0 &&
        (!entry.blocked || (entry.blockedUntil && entry.blockedUntil < now))
      ) {
        entries.delete(key);
      } else {
        entry.timestamps = recentTimestamps;
      }
    }
  }
}
