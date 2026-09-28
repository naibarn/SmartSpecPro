import { describe, expect, it, vi } from "vitest";

const mockDbSelect = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  db: { select: mockDbSelect },
  getDb: vi.fn(),
}));

import {
  filterModelsByMcpProviderAccess,
  filterModelsByDisabledProviders,
  getModelsByType,
  refreshModelCache,
} from "../modelRegistry";

describe("filterModelsByDisabledProviders", () => {
  it("filters disabled providers across image, video, and audio models", () => {
    const models = [
      { id: "image-model", provider: "kie.ai", type: "image" },
      { id: "video-model", provider: "byteplus-modelark", type: "video" },
      { id: "audio-model", provider: "byteplus_modelark", type: "audio" },
    ];

    const result = filterModelsByDisabledProviders(models, [
      { providerName: "kie_ai", isEnabled: true },
      { providerName: "byteplus_modelark", isEnabled: false },
    ]);

    expect(result.map(model => model.id)).toEqual(["image-model"]);
  });

  it("preserves the compatibility behavior when no provider rows exist", () => {
    const models = [{ id: "legacy-model", provider: "legacy", type: "image" }];

    expect(filterModelsByDisabledProviders(models, [])).toEqual(models);
  });

  it("keeps a successful all-disabled provider load empty instead of reviving static models", async () => {
    const modelRows = [
      {
        modelId: "disabled-image",
        name: "Disabled Image",
        description: null,
        modelType: "image",
        provider: "byteplus-modelark",
        aliases: [],
        creditCost: 10,
        aspectRatios: null,
        sizes: null,
        durations: null,
        voices: null,
        configJson: null,
        isEnabled: true,
        priority: 1,
        sortOrder: 1,
      },
    ];
    const providerRows = [
      { providerName: "byteplus_modelark", isEnabled: false },
    ];
    const makeQuery = (result: unknown) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(result),
        }),
      }),
    });
    const makeProviderQuery = (result: unknown) => ({
      from: vi.fn().mockResolvedValue(result),
    });
    mockDbSelect
      .mockReturnValueOnce(makeQuery(modelRows))
      .mockReturnValueOnce(makeProviderQuery(providerRows));

    await refreshModelCache();

    expect(getModelsByType("image")).toEqual([]);
  });

  it("keeps enabled image, video, and audio models while removing disabled-provider rows", async () => {
    const modelRows = [
      {
        modelId: "enabled-image",
        name: "Enabled Image",
        modelType: "image",
        provider: "kie.ai",
        aliases: [],
        creditCost: 10,
        isEnabled: true,
        priority: 1,
        sortOrder: 1,
      },
      {
        modelId: "disabled-video",
        name: "Disabled Video",
        modelType: "video",
        provider: "byteplus-modelark",
        aliases: [],
        creditCost: 10,
        isEnabled: true,
        priority: 2,
        sortOrder: 2,
      },
      {
        modelId: "enabled-audio",
        name: "Enabled Audio",
        modelType: "audio",
        provider: "kie_ai",
        aliases: [],
        creditCost: 10,
        isEnabled: true,
        priority: 3,
        sortOrder: 3,
      },
    ];
    const makeQuery = (result: unknown) => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(result),
        }),
      }),
    });
    mockDbSelect.mockReturnValueOnce(makeQuery(modelRows)).mockReturnValueOnce({
      from: vi.fn().mockResolvedValue([
        { providerName: "kie_ai", isEnabled: true },
        { providerName: "byteplus_modelark", isEnabled: false },
      ]),
    });

    await refreshModelCache();

    expect(getModelsByType("image").map(model => model.id)).toEqual([
      "enabled-image",
    ]);
    expect(getModelsByType("video")).toEqual([]);
    expect(getModelsByType("audio").map(model => model.id)).toEqual([
      "enabled-audio",
    ]);
  });
});

describe("filterModelsByMcpProviderAccess", () => {
  const models = [
    { id: "magnific-mcp/imagen-nano-banana-2", provider: "magnific", configJson: { transport: "mcp" } },
    { id: "higgsfield/nano_banana_2", provider: "higgsfield", configJson: { transport: "mcp" } },
    { id: "magnific/mystic", provider: "magnific", configJson: { transport: "gateway_api" } },
    { id: "kie.ai/nano-banana", provider: "kie.ai", configJson: null },
  ];

  it("hides disconnected MCP providers but preserves ordinary Magnific API models", () => {
    expect(filterModelsByMcpProviderAccess(models, new Set()).map(model => model.id)).toEqual([
      "magnific/mystic",
      "kie.ai/nano-banana",
    ]);
  });

  it("shows MCP models when the personal or shared provider connection is active", () => {
    expect(filterModelsByMcpProviderAccess(models, new Set(["higgsfield"])).map(model => model.id)).toEqual([
      "higgsfield/nano_banana_2",
      "magnific/mystic",
      "kie.ai/nano-banana",
    ]);
    expect(filterModelsByMcpProviderAccess(models, new Set(["magnific", "higgsfield"]))).toEqual(models);
  });
});
