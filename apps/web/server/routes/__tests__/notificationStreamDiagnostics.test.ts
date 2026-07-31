import { describe, expect, it } from "vitest";
import {
  createSSEEvictionLogLimiter,
  SSE_EVICTION_LOG_WINDOW_MS,
} from "../notificationStreamDiagnostics";

describe("SSE eviction diagnostics", () => {
  it("logs the first eviction and summarizes suppressed churn after the window", () => {
    let now = 1_000;
    const limiter = createSSEEvictionLogLimiter(() => now);

    expect(limiter.record(1)).toEqual({ shouldLog: true, suppressedCount: 0 });
    expect(limiter.record(1)).toEqual({ shouldLog: false, suppressedCount: 0 });
    expect(limiter.record(1)).toEqual({ shouldLog: false, suppressedCount: 0 });

    now += SSE_EVICTION_LOG_WINDOW_MS;
    expect(limiter.record(1)).toEqual({ shouldLog: true, suppressedCount: 2 });
  });

  it("keeps diagnostics independent per user", () => {
    const limiter = createSSEEvictionLogLimiter(() => 1_000);

    expect(limiter.record(1).shouldLog).toBe(true);
    expect(limiter.record(2).shouldLog).toBe(true);
    expect(limiter.record(1).shouldLog).toBe(false);
  });
});
