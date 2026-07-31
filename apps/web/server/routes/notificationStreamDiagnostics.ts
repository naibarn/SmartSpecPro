export const SSE_EVICTION_LOG_WINDOW_MS = 60_000;

type EvictionWindow = {
  startedAt: number;
  suppressedCount: number;
};

export type SSEEvictionLogDecision = {
  shouldLog: boolean;
  suppressedCount: number;
};

/**
 * Bounds repeated per-user eviction logs during reconnect or multi-tab churn.
 * The connection cap remains enforced by the route; this helper only controls
 * diagnostic volume and is intentionally free of Express/Redis dependencies.
 */
export function createSSEEvictionLogLimiter(
  now: () => number = () => Date.now(),
) {
  const windows = new Map<number, EvictionWindow>();

  return {
    record(userId: number): SSEEvictionLogDecision {
      const timestamp = now();
      const current = windows.get(userId);

      // Keep this diagnostic-only map bounded when many distinct users churn.
      for (const [trackedUserId, window] of windows) {
        if (timestamp - window.startedAt >= SSE_EVICTION_LOG_WINDOW_MS * 2) {
          windows.delete(trackedUserId);
        }
      }

      if (!current || timestamp - current.startedAt >= SSE_EVICTION_LOG_WINDOW_MS) {
        const suppressedCount = current?.suppressedCount ?? 0;
        windows.set(userId, { startedAt: timestamp, suppressedCount: 0 });
        return { shouldLog: true, suppressedCount };
      }

      current.suppressedCount += 1;
      return { shouldLog: false, suppressedCount: 0 };
    },

    reset() {
      windows.clear();
    },
  };
}
