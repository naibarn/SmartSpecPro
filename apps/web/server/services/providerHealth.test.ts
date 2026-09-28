import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockResolvedValue([]),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
  }),
}));

import {
  recordSuccess,
  recordFailure,
  getHealthStatus,
  isAvailable,
  getHealthSummary,
  initFromDb,
  persistHealth,
  _resetForTesting,
} from "./providerHealth";
import { getDb } from "../db";

beforeEach(() => {
  _resetForTesting();
  vi.clearAllMocks();
});

describe("Health State Transitions", () => {
  it("defaults new provider to healthy", () => {
    expect(getHealthStatus(999)).toBe("healthy");
  });

  it("keeps healthy when failure rate below 5% with 10+ requests", () => {
    // 20 successes, 1 failure = 4.76% < 5%
    for (let i = 0; i < 20; i++) recordSuccess(1);
    recordFailure(1, "timeout");
    expect(getHealthStatus(1)).toBe("healthy");
  });

  it("does not count request-specific vision reference failures against provider health", () => {
    for (let i = 0; i < 8; i++) recordSuccess(1);
    for (let i = 0; i < 12; i++) recordFailure(1, "reference_unavailable");

    expect(getHealthStatus(1)).toBe("healthy");
    expect(isAvailable(1)).toBe(true);
    expect(getHealthSummary().get(1)?.failureCount).toBe(0);
  });

  it("transitions to degraded when failure rate exceeds 5%", () => {
    // 9 successes, 1 failure = 10% > 5%
    for (let i = 0; i < 9; i++) recordSuccess(1);
    recordFailure(1, "server_error");
    expect(getHealthStatus(1)).toBe("degraded");
  });

  it("transitions to down when failure rate exceeds 20%", () => {
    // 8 successes, 3 failures = 27% > 20%
    for (let i = 0; i < 8; i++) recordSuccess(1);
    for (let i = 0; i < 3; i++) recordFailure(1, "server_error");
    expect(getHealthStatus(1)).toBe("down");
  });

  it("down provider returns isAvailable() = false", () => {
    for (let i = 0; i < 8; i++) recordSuccess(1);
    for (let i = 0; i < 3; i++) recordFailure(1, "server_error");
    expect(isAvailable(1)).toBe(false);
  });

  it("down provider with expired cooldown returns isAvailable() = true", () => {
    for (let i = 0; i < 8; i++) recordSuccess(1);
    for (let i = 0; i < 3; i++) recordFailure(1, "server_error");
    expect(getHealthStatus(1)).toBe("down");

    // Manipulate cooldown by accessing via summary
    const summary = getHealthSummary();
    const state = summary.get(1)!;
    // Directly set cooldownUntil to past -- we need to access actual map
    // Use _resetForTesting approach: set cooldown in the past via time mock
    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);
    expect(isAvailable(1)).toBe(true);
    vi.useRealTimers();
  });

  it("successful request after cooldown transitions down -> healthy", () => {
    for (let i = 0; i < 8; i++) recordSuccess(1);
    for (let i = 0; i < 3; i++) recordFailure(1, "server_error");
    expect(getHealthStatus(1)).toBe("down");

    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);
    recordSuccess(1);
    expect(getHealthStatus(1)).toBe("healthy");
    vi.useRealTimers();
  });

  it("failure rate dropping below 5% transitions degraded -> healthy", () => {
    // Get to degraded: 9 successes, 1 failure = 10%
    for (let i = 0; i < 9; i++) recordSuccess(1);
    recordFailure(1, "server_error");
    expect(getHealthStatus(1)).toBe("degraded");

    // Add enough successes to drop below 5%: need failures/total < 0.05
    // Currently 1 failure / 11 total = 9%. Need 1/N < 0.05 => N > 20
    for (let i = 0; i < 10; i++) recordSuccess(1);
    // Now 1 failure / 21 total = 4.76% < 5%
    expect(getHealthStatus(1)).toBe("healthy");
  });

  it("getHealthSummary returns all tracked providers", () => {
    recordSuccess(1);
    recordSuccess(2);
    recordSuccess(3);
    const summary = getHealthSummary();
    expect(summary.size).toBe(3);
    expect(summary.has(1)).toBe(true);
    expect(summary.has(2)).toBe(true);
    expect(summary.has(3)).toBe(true);
  });
});

describe("Persistence", () => {
  it("initFromDb seeds in-memory state", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([
          { id: 10, healthStatus: "degraded", failureCount: 5, successCount: 50 },
        ]),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    await initFromDb();
    expect(getHealthStatus(10)).toBe("degraded");
  });

  it("provider marked down in DB starts as down in memory", async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockResolvedValue([
          { id: 20, healthStatus: "down", failureCount: 15, successCount: 10 },
        ]),
      }),
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    await initFromDb();
    expect(getHealthStatus(20)).toBe("down");
    expect(isAvailable(20)).toBe(false);
  });

  it("persistHealth writes current status to llm_providers", async () => {
    const whereFn = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const mockDb = { update: updateFn };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    recordSuccess(1);
    recordSuccess(2);

    await persistHealth();
    expect(updateFn).toHaveBeenCalledTimes(2);
  });
});
