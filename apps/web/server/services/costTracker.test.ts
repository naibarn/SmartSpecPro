import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockInsert, mockSelectFrom, mockSelect } = vi.hoisted(() => {
  const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  const mockSelectFrom = vi.fn();
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
  return { mockInsert, mockSelectFrom, mockSelect };
});

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue({
    insert: mockInsert,
    select: mockSelect,
  }),
}));

import { logRequest, calculateCost, getAdminUsageStats, getUserUsageStats } from "./costTracker";
import { getDb } from "../db";

beforeEach(() => {
  vi.clearAllMocks();
  // Reset mock chains
  mockInsert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
});

describe("logRequest", () => {
  it("inserts row into provider_usage_log", async () => {
    await logRequest({
      userId: 1,
      providerId: 2,
      modelUsed: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      creditsCharged: 1,
      responseTimeMs: 500,
      statusCode: 200,
      wasFallback: false,
    });
    expect(mockInsert).toHaveBeenCalled();
  });

  it("logs failed requests with errorType and statusCode", async () => {
    const valuesFn = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesFn });

    await logRequest({
      userId: 1,
      providerId: 2,
      modelUsed: "gpt-4o",
      inputTokens: 100,
      outputTokens: 0,
      costUsd: 0,
      creditsCharged: 0,
      responseTimeMs: 5000,
      statusCode: 429,
      errorType: "rate_limit",
      wasFallback: false,
    });

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        errorType: "rate_limit",
        statusCode: 429,
      })
    );
  });

  it("logs fallback requests with wasFallback and fallbackFromProviderId", async () => {
    const valuesFn = vi.fn().mockResolvedValue(undefined);
    mockInsert.mockReturnValue({ values: valuesFn });

    await logRequest({
      userId: 1,
      providerId: 3,
      modelUsed: "gpt-4o",
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.001,
      creditsCharged: 1,
      responseTimeMs: 800,
      statusCode: 200,
      wasFallback: true,
      fallbackFromProviderId: 2,
    });

    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        wasFallback: true,
        fallbackFromProviderId: 2,
      })
    );
  });
});

describe("calculateCost", () => {
  it("uses provider-reported cost when available", async () => {
    const cost = await calculateCost({
      providerReportedCost: 0.0035,
      modelId: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(cost).toEqual({ cost: 0.0035, method: "provider_reported" });
  });

  it("uses model pricing from model_provider_map as fallback", async () => {
    const mockWhere = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([
        { pricingInput: "2.50", pricingOutput: "10.00", isFree: false },
      ]),
    });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockDb = {
      select: vi.fn().mockReturnValue({ from: mockFrom }),
      insert: mockInsert,
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const cost = await calculateCost({
      modelId: "gpt-4o",
      inputTokens: 1000,
      outputTokens: 500,
    });

    // (1000/1M * 2.50) + (500/1M * 10.00) = 0.0025 + 0.005 = 0.0075
    expect(cost.cost).toBeCloseTo(0.0075, 10);
    expect(cost.method).toBe("model_lookup");
  });

  it("uses default pricing when model not in map", async () => {
    const mockWhere = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([]),
    });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockDb = {
      select: vi.fn().mockReturnValue({ from: mockFrom }),
      insert: mockInsert,
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const cost = await calculateCost({
      modelId: "unknown-model",
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    // (1M/1M * 1.0) + (1M/1M * 4.0) = 5.0
    expect(cost).toEqual({ cost: 5.0, method: "default_rate" });
  });

  it("returns cost = 0 for free models", async () => {
    const mockWhere = vi.fn().mockReturnValue({
      limit: vi.fn().mockResolvedValue([
        { pricingInput: "0", pricingOutput: "0", isFree: true },
      ]),
    });
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockDb = {
      select: vi.fn().mockReturnValue({ from: mockFrom }),
      insert: mockInsert,
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const cost = await calculateCost({
      modelId: "kimi-k2.5-free",
      inputTokens: 10000,
      outputTokens: 5000,
    });

    expect(cost).toEqual({ cost: 0, method: "model_lookup" });
  });
});

describe("getAdminUsageStats", () => {
  it("aggregates by provider and model with date range", async () => {
    let callCount = 0;
    const groupByMock = vi.fn().mockResolvedValue([]);
    const whereMock = vi.fn().mockReturnValue({ groupBy: groupByMock });
    const mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return [{ count: 10, totalCost: 0.5, errorCount: 2 }];
            }
            return { groupBy: groupByMock };
          }),
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({ groupBy: groupByMock }),
          }),
        })),
      })),
      insert: mockInsert,
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const stats = await getAdminUsageStats({
      dateRange: { start: new Date("2026-01-01"), end: new Date("2026-02-01") },
    });

    expect(stats).toBeDefined();
    expect(typeof stats.totalRequests).toBe("number");
    expect(typeof stats.totalCostUsd).toBe("number");
    expect(Array.isArray(stats.topUsers)).toBe(true);
  });
});

describe("getUserUsageStats", () => {
  it("returns only specified user data", async () => {
    let callCount = 0;
    const mockDb = {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) {
              return [{ count: 5, totalCost: 1.5, totalCredits: 20 }];
            }
            return { groupBy: vi.fn().mockResolvedValue([]) };
          }),
        })),
      })),
      insert: mockInsert,
    };
    vi.mocked(getDb).mockResolvedValue(mockDb as any);

    const stats = await getUserUsageStats(42, {
      start: new Date("2026-01-01"),
      end: new Date("2026-02-01"),
    });

    expect(stats).toBeDefined();
    expect(typeof stats.totalRequests).toBe("number");
    expect(typeof stats.totalCostUsd).toBe("number");
    expect(typeof stats.totalCreditsUsed).toBe("number");
  });
});
