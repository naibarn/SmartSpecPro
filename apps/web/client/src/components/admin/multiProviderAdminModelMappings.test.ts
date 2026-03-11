import { describe, expect, it } from "vitest";

import {
  collectVisibleMappingIds,
  filterFlatModelMappings,
  filterModelMappingGroups,
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
