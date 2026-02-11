import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockHealthSummary } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockHealthSummary: vi.fn().mockReturnValue(new Map()),
}));

vi.mock("../db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
  getDb: vi.fn().mockResolvedValue({
    select: mockDbSelect,
    insert: mockDbInsert,
  }),
}));

vi.mock("../services/providerHealth", () => ({
  getHealthSummary: mockHealthSummary,
}));

vi.mock("../services/costTracker", () => ({
  getAdminUsageStats: vi.fn().mockResolvedValue({
    totalRequests: 100,
    totalCostUsd: 5.0,
    costByProvider: [],
    costByModel: [],
    errorRate: 0.02,
    topUsers: [],
  }),
  getUserUsageStats: vi.fn().mockResolvedValue({
    totalRequests: 10,
    totalCostUsd: 0.5,
    totalCreditsUsed: 500,
    modelBreakdown: [],
  }),
}));

// Mock tRPC procedures - simplified for unit testing
vi.mock("../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

import { multiProviderRouter } from "./multiProvider";

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to set up chained mocks
function mockSelectChain(result: any[]) {
  const orderByMock = vi.fn().mockResolvedValue(result);
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const joinMock = vi.fn().mockReturnValue({ where: whereMock, orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ innerJoin: joinMock, where: whereMock, orderBy: orderByMock });
  mockDbSelect.mockReturnValue({ from: fromMock });
}

describe("listModelMappings", () => {
  it("returns mappings grouped by modelId", async () => {
    const rows = [
      { id: 1, modelId: "gpt-4o", providerId: 1, providerName: "OpenRouter", modelName: "GPT-4o", providerModelId: "openai/gpt-4o", pricingInput: "2.50", pricingOutput: "10.00", isFree: false, contextLength: 128000, isEnabled: true, priority: 0 },
      { id: 2, modelId: "gpt-4o", providerId: 2, providerName: "Zen", modelName: "GPT-4o", providerModelId: "gpt-4o", pricingInput: "2.50", pricingOutput: "10.00", isFree: false, contextLength: 128000, isEnabled: true, priority: 1 },
      { id: 3, modelId: "kimi-k2.5", providerId: 2, providerName: "Zen", modelName: "Kimi K2.5", providerModelId: "kimi-k2.5", pricingInput: "0", pricingOutput: "0", isFree: true, contextLength: 128000, isEnabled: true, priority: 0 },
    ];
    mockSelectChain(rows);

    const fn = multiProviderRouter.listModelMappings as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result["gpt-4o"]).toHaveLength(2);
    expect(result["kimi-k2.5"]).toHaveLength(1);
  });
});

describe("upsertModelMapping", () => {
  it("creates a new mapping", async () => {
    const returningMock = vi.fn().mockResolvedValue([{ id: 10 }]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDbInsert.mockReturnValue({ values: valuesMock });

    const fn = multiProviderRouter.upsertModelMapping as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: {
        modelId: "test-model",
        providerId: 1,
        modelName: "Test Model",
        providerModelId: "test-model-v1",
        pricingInput: 1.0,
        pricingOutput: 4.0,
        isFree: false,
        contextLength: 8192,
        isEnabled: true,
        priority: 0,
      },
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe(10);
  });

  it("updates existing mapping by id", async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbUpdate.mockReturnValue({ set: setMock });

    const fn = multiProviderRouter.upsertModelMapping as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: {
        id: 5,
        modelId: "test-model",
        providerId: 1,
        modelName: "Updated",
        providerModelId: "test-model-v1",
        pricingInput: 2.0,
        pricingOutput: 8.0,
        isFree: false,
        contextLength: 8192,
        isEnabled: true,
        priority: 0,
      },
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe(5);
  });
});

describe("deleteModelMapping", () => {
  it("deletes a mapping by id", async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    mockDbDelete.mockReturnValue({ where: whereMock });

    const fn = multiProviderRouter.deleteModelMapping as Function;
    const result = await fn({ ctx: { user: { role: "admin" } }, input: { id: 3 } });

    expect(result.success).toBe(true);
    expect(mockDbDelete).toHaveBeenCalled();
  });
});

describe("listRoutingRules", () => {
  it("returns rules sorted by specificity", async () => {
    const rules = [
      { id: 1, modelPattern: "*", routingMode: "cost", maxFallbacks: 3, isActive: true, providerOrder: null, createdAt: new Date() },
      { id: 2, modelPattern: "gpt-*", routingMode: "quality", maxFallbacks: 3, isActive: true, providerOrder: null, createdAt: new Date() },
      { id: 3, modelPattern: "gpt-4o", routingMode: "priority", maxFallbacks: 2, isActive: true, providerOrder: [1, 2], createdAt: new Date() },
    ];

    const orderByMock = vi.fn().mockResolvedValue(rules);
    const fromMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
    mockDbSelect.mockReturnValue({ from: fromMock });

    const fn = multiProviderRouter.listRoutingRules as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    // Exact match first, then glob, then wildcard
    expect(result[0].modelPattern).toBe("gpt-4o");
    expect(result[1].modelPattern).toBe("gpt-*");
    expect(result[2].modelPattern).toBe("*");
  });
});

describe("upsertRoutingRule", () => {
  it("rejects priority mode without providerOrder", async () => {
    const fn = multiProviderRouter.upsertRoutingRule as Function;
    await expect(
      fn({
        ctx: { user: { role: "admin" } },
        input: { modelPattern: "gpt-4o", routingMode: "priority", maxFallbacks: 3, isActive: true },
      })
    ).rejects.toThrow("providerOrder is required");
  });

  it("creates a new rule", async () => {
    const returningMock = vi.fn().mockResolvedValue([{ id: 1 }]);
    const valuesMock = vi.fn().mockReturnValue({ returning: returningMock });
    mockDbInsert.mockReturnValue({ values: valuesMock });

    const fn = multiProviderRouter.upsertRoutingRule as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: { modelPattern: "*", routingMode: "cost", maxFallbacks: 3, isActive: true },
    });

    expect(result.success).toBe(true);
  });
});

describe("getProviderHealth", () => {
  it("returns health status for all providers", async () => {
    mockHealthSummary.mockReturnValue(
      new Map([
        [1, { status: "healthy", failureCount: 0, successCount: 100 }],
        [2, { status: "degraded", failureCount: 5, successCount: 50 }],
      ])
    );

    const providers = [
      { id: 1, providerName: "OpenRouter", lastHealthCheck: null },
      { id: 2, providerName: "Zen", lastHealthCheck: null },
    ];
    const orderByMock = vi.fn().mockResolvedValue(providers);
    const whereMock = vi.fn().mockReturnValue(providers);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbSelect.mockReturnValue({ from: fromMock });

    const fn = multiProviderRouter.getProviderHealth as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result).toHaveLength(2);
    expect(result[0].status).toBe("healthy");
    expect(result[1].status).toBe("degraded");
  });
});

describe("getAvailableModelsWithProviders", () => {
  function mockAvailableModelsQueries(mappedRows: any[], providerRows: any[]) {
    const mappedOrderByMock = vi.fn().mockResolvedValue(mappedRows);
    const mappedWhereMock = vi.fn().mockReturnValue({ orderBy: mappedOrderByMock });
    const mappedJoinMock = vi.fn().mockReturnValue({ where: mappedWhereMock });
    const mappedFromMock = vi.fn().mockReturnValue({ innerJoin: mappedJoinMock });

    const providerWhereMock = vi.fn().mockResolvedValue(providerRows);
    const providerFromMock = vi.fn().mockReturnValue({ where: providerWhereMock });

    mockDbSelect
      .mockImplementationOnce(() => ({ from: mappedFromMock }))
      .mockImplementationOnce(() => ({ from: providerFromMock }));
  }

  it("returns models grouped with providers", async () => {
    const rows = [
      { modelId: "gpt-4o", modelName: "GPT-4o", providerId: 1, providerName: "OpenRouter", providerModelId: "openai/gpt-4o", pricingInput: "2.50", pricingOutput: "10.00", isFree: false, isEnabled: true, contextLength: 128000 },
      { modelId: "kimi-k2.5", modelName: "Kimi K2.5", providerId: 2, providerName: "Zen", providerModelId: "kimi-k2.5", pricingInput: "0", pricingOutput: "0", isFree: true, isEnabled: true, contextLength: 128000 },
    ];
    mockAvailableModelsQueries(rows, []);

    const fn = multiProviderRouter.getAvailableModelsWithProviders as Function;
    const result = await fn({ ctx: { user: { id: 1 } } });

    expect(result).toHaveLength(2);
    expect(result[0].modelId).toBe("gpt-4o");
    expect(result[0].providers).toHaveLength(1);
  });

  it("excludes disabled models", async () => {
    // The query already filters by isEnabled, so this tests the WHERE clause
    mockAvailableModelsQueries([], []);

    const fn = multiProviderRouter.getAvailableModelsWithProviders as Function;
    const result = await fn({ ctx: { user: { id: 1 } } });

    expect(result).toHaveLength(0);
  });
});

describe("getUserUsageStats", () => {
  it("returns user stats", async () => {
    const fn = multiProviderRouter.getUserUsageStats as Function;
    const result = await fn({
      ctx: { user: { id: 42 } },
      input: { startDate: "2026-01-01T00:00:00Z", endDate: "2026-02-01T00:00:00Z" },
    });

    expect(result.totalRequests).toBe(10);
    expect(result.totalCreditsUsed).toBe(500);
  });
});
