import { describe, expect, it } from "vitest";

import {
  canEnableAdminModelCatalogRow,
  filterAdminModelCatalogRows,
  collectVisibleMappingIds,
  filterFlatModelMappings,
  filterModelMappingGroups,
  getAdminModelSelectionKey,
  sortAdminModelCatalogRows,
  type AdminModelCatalogRow,
  type AdminModelMappingsGrouped,
} from "./multiProviderAdminModelMappings";

const groupedMappings: AdminModelMappingsGrouped = {
  "gpt-5": [
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
      providerId: 20,
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
  ],
  "claude-sonnet-4": [
    {
      id: 3,
      modelId: "claude-sonnet-4",
      providerId: 30,
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
  ],
};

describe("filterModelMappingGroups", () => {
  it("filters rows by provider while preserving group summary", () => {
    const groups = filterModelMappingGroups({
      groupedMappings,
      searchQuery: "",
      providerFilter: "20",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.modelId).toBe("gpt-5");
    expect(groups[0]?.models.map((row) => row.id)).toEqual([2]);
    expect(groups[0]?.enabledCount).toBe(0);
  });

  it("matches search terms against model and provider fields", () => {
    const groups = filterModelMappingGroups({
      groupedMappings,
      searchQuery: "anthropic",
      providerFilter: "all",
    });

    expect(groups).toHaveLength(1);
    expect(groups[0]?.modelId).toBe("claude-sonnet-4");
  });
});

describe("filterFlatModelMappings", () => {
  it("returns a flat, provider-filtered list ordered by model then provider", () => {
    const rows = filterFlatModelMappings({
      groupedMappings,
      searchQuery: "",
      providerFilter: "all",
    });

    expect(rows.map((row) => row.id)).toEqual([3, 1, 2]);
  });

  it("matches search terms against provider model ids", () => {
    const rows = filterFlatModelMappings({
      groupedMappings,
      searchQuery: "openai/gpt-5",
      providerFilter: "all",
    });

    expect(rows.map((row) => row.id)).toEqual([2]);
  });
});

describe("collectVisibleMappingIds", () => {
  it("flattens ids from filtered groups", () => {
    const groups = filterModelMappingGroups({
      groupedMappings,
      searchQuery: "gpt",
      providerFilter: "all",
    });

    expect(collectVisibleMappingIds(groups)).toEqual([1, 2]);
  });
});

describe("filterAdminModelCatalogRows", () => {
  it("keeps unmapped catalog rows visible and searchable", () => {
    const rows = filterAdminModelCatalogRows([
      {
        mappingId: null,
        isMapped: false,
        modelId: "openai/gpt-5.4",
        providerId: 20,
        providerName: "openrouter",
        providerDisplayName: "OpenRouter",
        modelName: "GPT 5.4",
        providerModelId: "openai/gpt-5.4",
        pricingInput: "2.5",
        pricingOutput: "10",
        isFree: false,
        contextLength: 400000,
        isEnabled: false,
        priority: 0,
        priorityLocked: false,
        apiStyle: "chat-completions",
      },
    ], "gpt 5.4", "20");

    expect(rows).toHaveLength(1);
    expect(getAdminModelSelectionKey(rows[0]!)).toBe("catalog:20:openai/gpt-5.4");
  });

  it("preserves NVIDIA metadata on catalog rows while filtering", () => {
    const rows = filterAdminModelCatalogRows([
      {
        mappingId: null,
        isMapped: false,
        modelId: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        providerId: 91,
        providerName: "nvidia_nim",
        providerDisplayName: "NVIDIA NIM",
        modelName: "Llama 3.3 Nemotron Super 49B v1.5",
        providerModelId: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        contextLength: 128000,
        isEnabled: false,
        priority: 0,
        priorityLocked: false,
        apiStyle: "chat-completions",
        ownedBy: "nvidia",
        surface: "chat",
        executionMode: "public",
        autoSelectionEligible: true,
        catalogEligibility: "public-chat",
        supportsStructuredOutputs: true,
      },
    ], "nemotron", "91");

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownedBy: "nvidia",
      surface: "chat",
      executionMode: "public",
      autoSelectionEligible: true,
      catalogEligibility: "public-chat",
      supportsStructuredOutputs: true,
    });
  });

  it("preserves invalid NVIDIA eligibility metadata for stale mapped rows", () => {
    const rows = filterAdminModelCatalogRows([
      {
        mappingId: 7,
        isMapped: true,
        modelId: "llama-guard",
        providerId: 91,
        providerName: "nvidia_nim",
        providerDisplayName: "NVIDIA NIM",
        modelName: "Llama Guard 4 12B",
        providerModelId: "meta/llama-guard-4-12b",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        contextLength: 8192,
        isEnabled: true,
        priority: 0,
        priorityLocked: false,
        apiStyle: "chat-completions",
        ownedBy: "meta",
        surface: "guardrail",
        executionMode: "deferred",
        autoSelectionEligible: false,
        catalogEligibility: "invalid",
        catalogInvalidReason: "surface-not-chat",
      },
    ], "guard", "91");

    expect(rows[0]).toMatchObject({
      catalogEligibility: "invalid",
      catalogInvalidReason: "surface-not-chat",
    });
  });

  it("preserves isRecommended metadata while filtering", () => {
    const rows = filterAdminModelCatalogRows([
      {
        mappingId: 12,
        isMapped: true,
        modelId: "deepseek-v4-flash",
        providerId: 5,
        providerName: "openrouter",
        providerDisplayName: "OpenRouter",
        modelName: "DeepSeek V4 Flash",
        providerModelId: "deepseek/deepseek-v4-flash",
        pricingInput: "0.28",
        pricingOutput: "0.28",
        isFree: false,
        contextLength: 128000,
        isEnabled: true,
        priority: 5,
        priorityLocked: true,
        apiStyle: "chat-completions",
        isRecommended: true,
      },
    ], "deepseek", "5");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.isRecommended).toBe(true);
  });
});

function buildCatalogRow(overrides: Partial<AdminModelCatalogRow>): AdminModelCatalogRow {
  return {
    mappingId: 1,
    isMapped: true,
    modelId: "model-a",
    providerId: 10,
    providerName: "openai",
    providerDisplayName: "OpenAI",
    modelName: "Model A",
    providerModelId: "model-a",
    pricingInput: "1",
    pricingOutput: "2",
    isFree: false,
    contextLength: 1000,
    isEnabled: true,
    priority: 0,
    priorityLocked: false,
    apiStyle: "chat-completions",
    ...overrides,
  };
}

describe("sortAdminModelCatalogRows", () => {
  it("sorts by name ascending and descending", () => {
    const rows = [
      buildCatalogRow({ modelName: "Zeta", providerModelId: "zeta" }),
      buildCatalogRow({ modelName: "Alpha", providerModelId: "alpha" }),
      buildCatalogRow({ modelName: "Mid", providerModelId: "mid" }),
    ];

    const asc = sortAdminModelCatalogRows(rows, "name", "asc");
    expect(asc.map((row) => row.modelName)).toEqual(["Alpha", "Mid", "Zeta"]);

    const desc = sortAdminModelCatalogRows(rows, "name", "desc");
    expect(desc.map((row) => row.modelName)).toEqual(["Zeta", "Mid", "Alpha"]);
  });

  it("sorts by input price numerically, not as a string (9 before 10)", () => {
    const rows = [
      buildCatalogRow({ modelName: "A", providerModelId: "a", pricingInput: "10" }),
      buildCatalogRow({ modelName: "B", providerModelId: "b", pricingInput: "9" }),
      buildCatalogRow({ modelName: "C", providerModelId: "c", pricingInput: "2" }),
    ];

    const asc = sortAdminModelCatalogRows(rows, "inputPrice", "asc");
    expect(asc.map((row) => row.pricingInput)).toEqual(["2", "9", "10"]);

    const desc = sortAdminModelCatalogRows(rows, "inputPrice", "desc");
    expect(desc.map((row) => row.pricingInput)).toEqual(["10", "9", "2"]);
  });

  it("sorts by output price numerically", () => {
    const rows = [
      buildCatalogRow({ modelName: "A", providerModelId: "a", pricingOutput: "10" }),
      buildCatalogRow({ modelName: "B", providerModelId: "b", pricingOutput: "9" }),
      buildCatalogRow({ modelName: "C", providerModelId: "c", pricingOutput: "2" }),
    ];

    const asc = sortAdminModelCatalogRows(rows, "outputPrice", "asc");
    expect(asc.map((row) => row.pricingOutput)).toEqual(["2", "9", "10"]);

    const desc = sortAdminModelCatalogRows(rows, "outputPrice", "desc");
    expect(desc.map((row) => row.pricingOutput)).toEqual(["10", "9", "2"]);
  });

  it("sorts by context length and treats null as 0", () => {
    const rows = [
      buildCatalogRow({ modelName: "A", providerModelId: "a", contextLength: 128000 }),
      buildCatalogRow({ modelName: "B", providerModelId: "b", contextLength: null }),
      buildCatalogRow({ modelName: "C", providerModelId: "c", contextLength: 4096 }),
    ];

    const asc = sortAdminModelCatalogRows(rows, "context", "asc");
    expect(asc.map((row) => row.modelName)).toEqual(["B", "C", "A"]);

    const desc = sortAdminModelCatalogRows(rows, "context", "desc");
    expect(desc.map((row) => row.modelName)).toEqual(["A", "C", "B"]);
  });

  it("uses a stable tiebreak (modelName then providerModelId) when values are equal", () => {
    const rows = [
      buildCatalogRow({ modelName: "Same", providerModelId: "z-provider", pricingInput: "5" }),
      buildCatalogRow({ modelName: "Same", providerModelId: "a-provider", pricingInput: "5" }),
    ];

    const asc = sortAdminModelCatalogRows(rows, "inputPrice", "asc");
    expect(asc.map((row) => row.providerModelId)).toEqual(["a-provider", "z-provider"]);

    const desc = sortAdminModelCatalogRows(rows, "inputPrice", "desc");
    expect(desc.map((row) => row.providerModelId)).toEqual(["a-provider", "z-provider"]);
  });

  it("does not mutate the input array", () => {
    const rows = [
      buildCatalogRow({ modelName: "Zeta", providerModelId: "zeta" }),
      buildCatalogRow({ modelName: "Alpha", providerModelId: "alpha" }),
    ];
    const original = [...rows];

    sortAdminModelCatalogRows(rows, "name", "asc");

    expect(rows).toEqual(original);
  });

  it("preserves isRecommended without treating it as a sort key", () => {
    const rows = [
      buildCatalogRow({ modelName: "Alpha", providerModelId: "alpha", isRecommended: true }),
      buildCatalogRow({ modelName: "Zeta", providerModelId: "zeta", isRecommended: false }),
    ];

    const sorted = sortAdminModelCatalogRows(rows, "name", "asc");

    expect(sorted.map((row) => row.modelName)).toEqual(["Alpha", "Zeta"]);
    expect(sorted[0]?.isRecommended).toBe(true);
    expect(sorted[1]?.isRecommended).toBe(false);
  });
});

describe("canEnableAdminModelCatalogRow", () => {
  it("allows public-chat and manual-only rows only", () => {
    expect(canEnableAdminModelCatalogRow({ catalogEligibility: "public-chat" })).toBe(true);
    expect(canEnableAdminModelCatalogRow({ catalogEligibility: "manual-only" })).toBe(true);
    expect(canEnableAdminModelCatalogRow({ catalogEligibility: "internal-only" })).toBe(false);
    expect(canEnableAdminModelCatalogRow({ catalogEligibility: "deferred" })).toBe(false);
    expect(canEnableAdminModelCatalogRow({ catalogEligibility: "invalid" })).toBe(false);
  });
});

describe("filterAdminModelCatalogRows — priority secondary sort", () => {
  it("sorts by modelName first, then by priority ASC as tiebreaker", () => {
    const rows = filterAdminModelCatalogRows([
      {
        mappingId: 1,
        isMapped: true,
        modelId: "gpt-4o",
        providerId: 10,
        providerName: "openai",
        providerDisplayName: "OpenAI",
        modelName: "GPT-4o",
        providerModelId: "gpt-4o",
        pricingInput: "2.5",
        pricingOutput: "10",
        isFree: false,
        contextLength: 128000,
        isEnabled: true,
        priority: 50,
        priorityLocked: false,
        apiStyle: "chat-completions",
      },
      {
        mappingId: 2,
        isMapped: true,
        modelId: "gpt-4o",
        providerId: 20,
        providerName: "openrouter",
        providerDisplayName: "OpenRouter",
        modelName: "GPT-4o",
        providerModelId: "openai/gpt-4o",
        pricingInput: "2.5",
        pricingOutput: "10",
        isFree: false,
        contextLength: 128000,
        isEnabled: true,
        priority: 10,
        priorityLocked: true,
        apiStyle: "chat-completions",
      },
    ], "", "all");
    expect(rows[0]!.mappingId).toBe(2); // priority 10
    expect(rows[1]!.mappingId).toBe(1); // priority 50
  });

  it("does not change order when modelNames differ (primary sort wins)", () => {
    const result = filterAdminModelCatalogRows([
      {
        mappingId: 1,
        isMapped: true,
        modelId: "zeta-model",
        providerId: 10,
        providerName: "provider-a",
        providerDisplayName: "Provider A",
        modelName: "Zeta",
        providerModelId: "zeta",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        contextLength: 4096,
        isEnabled: true,
        priority: 1,
        priorityLocked: false,
        apiStyle: "chat-completions",
      },
      {
        mappingId: 2,
        isMapped: true,
        modelId: "alpha-model",
        providerId: 10,
        providerName: "provider-a",
        providerDisplayName: "Provider A",
        modelName: "Alpha",
        providerModelId: "alpha",
        pricingInput: "0",
        pricingOutput: "0",
        isFree: true,
        contextLength: 4096,
        isEnabled: true,
        priority: 99,
        priorityLocked: true,
        apiStyle: "chat-completions",
      },
    ], "", "all");
    expect(result[0]!.modelName).toBe("Alpha");
    expect(result[1]!.modelName).toBe("Zeta");
  });
});
