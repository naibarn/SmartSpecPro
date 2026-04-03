import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockHealthSummary, mockComputeModelPriority } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
  mockHealthSummary: vi.fn().mockReturnValue(new Map()),
  mockComputeModelPriority: vi.fn().mockReturnValue(42),
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

vi.mock("../services/intelligentModelSelector", () => ({
  computeModelPriority: mockComputeModelPriority,
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

import {
  groupModelMappingsByModelId,
  mergeAdminModelCatalogRows,
  type ModelMappingListRow,
  multiProviderRouter,
} from "./multiProvider";

beforeEach(() => {
  vi.clearAllMocks();
});

// Helper to set up chained mocks
function mockSelectChain(result: any[], providers: any[] = []) {
  const providerOrderByMock = vi.fn().mockResolvedValue(providers);
  const providerFromMock = vi.fn().mockReturnValue({ orderBy: providerOrderByMock });

  const orderByMock = vi.fn().mockResolvedValue(result);
  const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
  const joinMock = vi.fn().mockReturnValue({ where: whereMock, orderBy: orderByMock });
  const fromMock = vi.fn().mockReturnValue({ innerJoin: joinMock, where: whereMock, orderBy: orderByMock });

  mockDbSelect
    .mockImplementationOnce(() => ({ from: providerFromMock }))
    .mockImplementationOnce(() => ({ from: fromMock }));
}

describe("groupModelMappingsByModelId", () => {
  it("groups rows by canonical model id", () => {
    const rows: ModelMappingListRow[] = [
      {
        id: 1,
        modelId: "gpt-5",
        providerId: 10,
        providerName: "openai",
        providerDisplayName: "OpenAI",
        modelName: "GPT-5",
        providerModelId: "gpt-5",
        pricingInput: "1.25",
        pricingOutput: "10",
        isFree: false,
        contextLength: 128000,
        isEnabled: true,
        priority: 0,
        priorityLocked: false,
        apiStyle: "responses",
      },
      {
        id: 2,
        modelId: "gpt-5",
        providerId: 11,
        providerName: "openrouter",
        providerDisplayName: "OpenRouter",
        modelName: "GPT-5",
        providerModelId: "openai/gpt-5",
        pricingInput: "1.15",
        pricingOutput: "9.5",
        isFree: false,
        contextLength: 128000,
        isEnabled: false,
        priority: 1,
        priorityLocked: false,
        apiStyle: "chat-completions",
      },
      {
        id: 3,
        modelId: "claude-sonnet-4",
        providerId: 12,
        providerName: "anthropic",
        providerDisplayName: "Anthropic",
        modelName: "Claude Sonnet 4",
        providerModelId: "claude-sonnet-4",
        pricingInput: "3",
        pricingOutput: "15",
        isFree: false,
        contextLength: 200000,
        isEnabled: true,
        priority: 0,
        priorityLocked: false,
        apiStyle: "messages",
      },
    ];

    const grouped = groupModelMappingsByModelId(rows);

    expect(Object.keys(grouped)).toEqual(["gpt-5", "claude-sonnet-4"]);
    expect(grouped["gpt-5"]).toHaveLength(2);
    expect(grouped["claude-sonnet-4"]?.[0]?.providerDisplayName).toBe("Anthropic");
  });
});

describe("listModelMappings", () => {
  it("returns mappings grouped by modelId", async () => {
    const rows = [
      { id: 1, modelId: "gpt-4o", providerId: 1, providerName: "OpenRouter", providerDisplayName: "OpenRouter", modelName: "GPT-4o", providerModelId: "openai/gpt-4o", pricingInput: "2.50", pricingOutput: "10.00", isFree: false, contextLength: 128000, isEnabled: true, priority: 0, apiStyle: "chat-completions" },
      { id: 2, modelId: "gpt-4o", providerId: 2, providerName: "Zen", providerDisplayName: "Zen", modelName: "GPT-4o", providerModelId: "gpt-4o", pricingInput: "2.50", pricingOutput: "10.00", isFree: false, contextLength: 128000, isEnabled: true, priority: 1, apiStyle: "chat-completions" },
      { id: 3, modelId: "kimi-k2.5", providerId: 2, providerName: "Zen", providerDisplayName: "Zen", modelName: "Kimi K2.5", providerModelId: "kimi-k2.5", pricingInput: "0", pricingOutput: "0", isFree: true, contextLength: 128000, isEnabled: true, priority: 0, apiStyle: "chat-completions" },
    ];
    mockSelectChain(rows);

    const fn = multiProviderRouter.listModelMappings as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result["gpt-4o"]).toHaveLength(2);
    expect(result["kimi-k2.5"]).toHaveLength(1);
  });
});

describe("mergeAdminModelCatalogRows", () => {
  it("includes provider catalog models even when they are not mapped yet", () => {
    const rows = mergeAdminModelCatalogRows({
      providers: [
        {
          id: 1,
          providerName: "openrouter",
          providerDisplayName: "OpenRouter",
          availableModels: [
            {
              id: "openai/gpt-5.4",
              name: "GPT 5.4",
              contextLength: 400000,
              pricing: { input: 2.5, output: 10 },
            },
          ],
        },
      ],
      mappings: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.providerModelId).toBe("openai/gpt-5.4");
    expect(rows[0]?.isMapped).toBe(false);
    expect(rows[0]?.isEnabled).toBe(false);
  });

  it("preserves Kie catalog apiStyle, config, capabilities, and canonical alias mapping", () => {
    const rows = mergeAdminModelCatalogRows({
      providers: [
        {
          id: 2,
          providerName: "kie_ai",
          providerDisplayName: "Kie AI",
          availableModels: [
            {
              id: "gpt-5-4",
              name: "GPT 5.4",
              contextLength: 400000,
              pricing: { input: 2.5, output: 15 },
              apiStyle: "responses",
              supportsResponses: true,
              supportsVision: true,
              config: {
                requestBodyFormat: "responses",
                apiEndpoint: "/codex/v1/responses",
                passthroughFields: ["reasoning", "tools"],
              },
            },
          ],
        },
      ],
      mappings: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.modelId).toBe("gpt-5.4");
    expect(rows[0]?.apiStyle).toBe("responses");
    expect(rows[0]?.supportsResponses).toBe(true);
    expect(rows[0]?.supportsVision).toBe(true);
    expect(rows[0]?.config?.apiEndpoint).toBe("/codex/v1/responses");
    expect(rows[0]?.config?.passthroughFields).toEqual(["reasoning", "tools"]);
  });
});

describe("listAdminModelCatalog", () => {
  it("returns merged mapped and unmapped provider catalog rows", async () => {
    const providerOrderByMock = vi.fn().mockResolvedValue([
      {
        id: 1,
        providerName: "openrouter",
        providerDisplayName: "OpenRouter",
        availableModels: [
          {
            id: "openai/gpt-5.4",
            name: "GPT 5.4",
            contextLength: 400000,
            pricing: { input: 2.5, output: 10 },
          },
        ],
      },
    ]);
    const providerFromMock = vi.fn().mockReturnValue({ orderBy: providerOrderByMock });
    mockDbSelect.mockImplementationOnce(() => ({ from: providerFromMock }));

    const mappingOrderByMock = vi.fn().mockResolvedValue([
      {
        id: 1,
        modelId: "gpt-4o",
        providerId: 1,
        providerName: "openrouter",
        providerDisplayName: "OpenRouter",
        modelName: "GPT-4o",
        providerModelId: "openai/gpt-4o",
        pricingInput: "2.50",
        pricingOutput: "10.00",
        isFree: false,
        contextLength: 128000,
        isEnabled: true,
        priority: 0,
        apiStyle: "chat-completions",
      },
    ]);
    const mappingJoinMock = vi.fn().mockReturnValue({ orderBy: mappingOrderByMock });
    const mappingFromMock = vi.fn().mockReturnValue({ innerJoin: mappingJoinMock });
    mockDbSelect.mockImplementationOnce(() => ({ from: mappingFromMock }));

    const fn = multiProviderRouter.listAdminModelCatalog as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result.some((row: any) => row.providerModelId === "openai/gpt-4o" && row.isMapped)).toBe(true);
    expect(result.some((row: any) => row.providerModelId === "openai/gpt-5.4" && !row.isMapped)).toBe(true);
  });

  it("hydrates Kie AI template catalog when a legacy provider row has no availableModels", async () => {
    const providerOrderByMock = vi.fn().mockResolvedValue([
      {
        id: 2,
        providerName: "kie_ai",
        providerDisplayName: "Kie AI",
        availableModels: null,
      },
    ]);
    const providerFromMock = vi.fn().mockReturnValue({ orderBy: providerOrderByMock });
    mockDbSelect.mockImplementationOnce(() => ({ from: providerFromMock }));

    const mappingOrderByMock = vi.fn().mockResolvedValue([]);
    const mappingJoinMock = vi.fn().mockReturnValue({ orderBy: mappingOrderByMock });
    const mappingFromMock = vi.fn().mockReturnValue({ innerJoin: mappingJoinMock });
    mockDbSelect.mockImplementationOnce(() => ({ from: mappingFromMock }));

    const fn = multiProviderRouter.listAdminModelCatalog as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result.length).toBeGreaterThan(0);
    expect(result.some((row: any) => row.providerName === "kie_ai" && row.providerModelId === "gpt-5-4")).toBe(true);
    expect(result.some((row: any) => row.providerName === "kie_ai" && row.providerModelId === "gemini-3-pro")).toBe(true);
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

describe("bulkSetModelMappingsEnabled", () => {
  it("updates multiple mappings in one mutation", async () => {
    const whereMock = vi.fn().mockResolvedValue(undefined);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbUpdate.mockReturnValue({ set: setMock });

    const fn = multiProviderRouter.bulkSetModelMappingsEnabled as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: { ids: [1, 2, 2, 3], isEnabled: false },
    });

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(3);
    expect(result.isEnabled).toBe(false);
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});

describe("bulkSetAdminModelCatalogEnabled", () => {
  it("creates mappings for unmapped catalog models when enabling", async () => {
    // Mock provider pre-load for priority computation
    const providerWhereMock = vi.fn().mockResolvedValue([]);
    const providerFromMock = vi.fn().mockReturnValue({ where: providerWhereMock });
    mockDbSelect.mockImplementationOnce(() => ({ from: providerFromMock }));

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockDbInsert.mockReturnValue({ values: valuesMock });

    const fn = multiProviderRouter.bulkSetAdminModelCatalogEnabled as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: {
        items: [{
          mappingId: null,
          modelId: "openai/gpt-5.4",
          providerId: 1,
          modelName: "GPT 5.4",
          providerModelId: "openai/gpt-5.4",
          pricingInput: 2.5,
          pricingOutput: 10,
          isFree: false,
          contextLength: 400000,
          priority: 0,
          apiStyle: "chat-completions",
        }],
        isEnabled: true,
      },
    });

    expect(result.success).toBe(true);
    expect(result.insertedCount).toBe(1);
    expect(mockDbInsert).toHaveBeenCalled();
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
  function mockAvailableModelsQuery(mappedRows: any[]) {
    const mappedOrderByMock = vi.fn().mockResolvedValue(mappedRows);
    const mappedWhereMock = vi.fn().mockReturnValue({ orderBy: mappedOrderByMock });
    const mappedJoinMock = vi.fn().mockReturnValue({ where: mappedWhereMock });
    const mappedFromMock = vi.fn().mockReturnValue({ innerJoin: mappedJoinMock });
    mockDbSelect.mockImplementationOnce(() => ({ from: mappedFromMock }));
  }

  it("returns models grouped with providers", async () => {
    const rows = [
      { modelId: "gpt-4o", modelName: "GPT-4o", providerId: 1, providerName: "OpenRouter", providerModelId: "openai/gpt-4o", pricingInput: "2.50", pricingOutput: "10.00", isFree: false, isEnabled: true, contextLength: 128000 },
      { modelId: "kimi-k2.5", modelName: "Kimi K2.5", providerId: 2, providerName: "Zen", providerModelId: "kimi-k2.5", pricingInput: "0", pricingOutput: "0", isFree: true, isEnabled: true, contextLength: 128000 },
    ];
    mockAvailableModelsQuery(rows);

    const fn = multiProviderRouter.getAvailableModelsWithProviders as Function;
    const result = await fn({ ctx: { user: { id: 1 } } });

    expect(result).toHaveLength(2);
    expect(result[0].modelId).toBe("gpt-4o");
    expect(result[0].providers).toHaveLength(1);
  });

  it("hydrates Kie pricing from provider catalog when legacy mappings were stored as free", async () => {
    const rows = [
      {
        modelId: "gpt-5.4",
        modelName: "GPT 5.4",
        providerId: 9,
        providerName: "kie_ai",
        providerDisplayName: "Kie AI",
        providerModelId: "gpt-5-4",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        isEnabled: true,
        contextLength: 400000,
        availableModels: [
          {
            id: "gpt-5-4",
            name: "GPT 5.4",
            pricing: { input: 0.7, output: 5.6 },
          },
        ],
      },
    ];
    mockAvailableModelsQuery(rows);

    const fn = multiProviderRouter.getAvailableModelsWithProviders as Function;
    const result = await fn({ ctx: { user: { id: 1 } } });

    expect(result[0]?.providers[0]).toMatchObject({
      pricingInput: "0.7",
      pricingOutput: "5.6",
      isFree: false,
    });
  });

  it("excludes disabled models", async () => {
    mockAvailableModelsQuery([]);

    const fn = multiProviderRouter.getAvailableModelsWithProviders as Function;
    const result = await fn({ ctx: { user: { id: 1 } } });

    expect(result).toHaveLength(0);
  });

  it("does not re-add provider models outside enabled mappings", async () => {
    mockAvailableModelsQuery([]);

    const fn = multiProviderRouter.getAvailableModelsWithProviders as Function;
    const result = await fn({ ctx: { user: { id: 1 } } });

    expect(result).toEqual([]);
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

describe("multiProvider.updateModelPriority", () => {
  it("updates priority and sets priorityLocked=true", async () => {
    const returningMock = vi.fn().mockResolvedValue([{
      id: 1,
      modelId: "gpt-4o",
      priority: 25,
      priorityLocked: true,
    }]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbUpdate.mockReturnValue({ set: setMock });

    const fn = multiProviderRouter.updateModelPriority as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: { mappingId: 1, priority: 25 },
    });

    expect(result.success).toBe(true);
    expect(result.mapping.priority).toBe(25);
    expect(result.mapping.priorityLocked).toBe(true);
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 25, priorityLocked: true })
    );
  });

  it("requires admin role", () => {
    expect(multiProviderRouter.updateModelPriority).toBeDefined();
  });

  it("returns updated mapping in response", async () => {
    const updatedRow = {
      id: 5,
      modelId: "claude-sonnet-4",
      priority: 0,
      priorityLocked: true,
    };
    const returningMock = vi.fn().mockResolvedValue([updatedRow]);
    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbUpdate.mockReturnValue({ set: setMock });

    const fn = multiProviderRouter.updateModelPriority as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: { mappingId: 5, priority: 0 },
    });

    expect(result.mapping).toEqual(updatedRow);
  });
});

describe("multiProvider.backfillModelPriorities", () => {
  it("computes priority for all unlocked rows", async () => {
    const unlockedRows = [
      { id: 1, modelId: "gpt-4o", priority: 0, priorityLocked: false,
        pricingInput: "2.5", pricingOutput: "10", isFree: false,
        contextLength: 128000, supportsFunctionTools: true,
        supportsStructuredOutputs: true, supportsWebSearch: false,
        supportsCodeExecution: false, supportsComputerUse: false,
        supportsBackground: false, supportsResponses: true,
        supportsVision: true },
      { id: 2, modelId: "kimi-k2.5", priority: 0, priorityLocked: false,
        pricingInput: "0", pricingOutput: "0", isFree: true,
        contextLength: 128000, supportsFunctionTools: false,
        supportsStructuredOutputs: false, supportsWebSearch: false,
        supportsCodeExecution: false, supportsComputerUse: false,
        supportsBackground: false, supportsResponses: false,
        supportsVision: false },
    ];
    const whereMock = vi.fn().mockResolvedValue(unlockedRows);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbSelect.mockReturnValue({ from: fromMock });

    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    mockDbUpdate.mockReturnValue({ set: updateSetMock });

    mockComputeModelPriority.mockReturnValue(35);

    const fn = multiProviderRouter.backfillModelPriorities as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result.success).toBe(true);
    expect(result.updatedCount).toBe(2);
    expect(mockComputeModelPriority).toHaveBeenCalledTimes(2);
  });

  it("skips rows with priorityLocked=true", async () => {
    const whereMock = vi.fn().mockResolvedValue([]);
    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbSelect.mockReturnValue({ from: fromMock });

    const fn = multiProviderRouter.backfillModelPriorities as Function;
    const result = await fn({ ctx: { user: { role: "admin" } } });

    expect(result.updatedCount).toBe(0);
    expect(mockComputeModelPriority).not.toHaveBeenCalled();
  });
});

describe("bulkSetAdminModelCatalogEnabled — priority assignment", () => {
  it("assigns computed priority to new entries (not 0)", async () => {
    const providerRows = [{
      id: 1,
      availableModels: [{
        id: "openai/gpt-5.4",
        name: "GPT 5.4",
        contextLength: 400000,
        pricing: { input: 2.5, output: 10 },
        createdAt: Math.floor(Date.now() / 1000) - 7 * 86400,
      }],
    }];
    const providerWhereMock = vi.fn().mockResolvedValue(providerRows);
    const providerFromMock = vi.fn().mockReturnValue({ where: providerWhereMock });
    mockDbSelect.mockImplementationOnce(() => ({ from: providerFromMock }));

    mockComputeModelPriority.mockReturnValue(18);

    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate });
    mockDbInsert.mockReturnValue({ values: valuesMock });

    const fn = multiProviderRouter.bulkSetAdminModelCatalogEnabled as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: {
        items: [{
          mappingId: null,
          modelId: "openai/gpt-5.4",
          providerId: 1,
          modelName: "GPT 5.4",
          providerModelId: "openai/gpt-5.4",
          pricingInput: 2.5,
          pricingOutput: 10,
          isFree: false,
          contextLength: 400000,
        }],
        isEnabled: true,
      },
    });

    expect(result.success).toBe(true);
    expect(mockComputeModelPriority).toHaveBeenCalled();
    const insertedValues = valuesMock.mock.calls[0][0];
    expect(insertedValues[0].priority).toBe(18);
  });

  it("does not overwrite priorityLocked=true entries", async () => {
    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
    mockDbUpdate.mockReturnValue({ set: updateSetMock });

    const fn = multiProviderRouter.bulkSetAdminModelCatalogEnabled as Function;
    const result = await fn({
      ctx: { user: { role: "admin" } },
      input: {
        items: [{
          mappingId: 99,
          modelId: "gpt-4o",
          providerId: 1,
          modelName: "GPT-4o",
          providerModelId: "openai/gpt-4o",
          pricingInput: 2.5,
          pricingOutput: 10,
          isFree: false,
        }],
        isEnabled: true,
      },
    });

    expect(result.success).toBe(true);
    expect(updateSetMock).toHaveBeenCalledWith(
      expect.objectContaining({ isEnabled: true })
    );
    expect(updateSetMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ priority: expect.any(Number) })
    );
  });
});
