import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClearModelCache,
  mockClearSkillRegistryCache,
  mockDbSelect,
  mockDbUpdate,
  mockGetStaticFallbackModels,
  mockGetStaticModelById,
  mockListConnectedMcpProviderKeys,
} = vi.hoisted(() => ({
  mockClearModelCache: vi.fn(),
  mockClearSkillRegistryCache: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockGetStaticFallbackModels: vi.fn(),
  mockGetStaticModelById: vi.fn(),
  mockListConnectedMcpProviderKeys: vi.fn(),
}));

vi.mock("../../services/modelRegistry", () => ({
  clearModelCache: mockClearModelCache,
  getStaticFallbackModels: mockGetStaticFallbackModels,
  getStaticModelById: mockGetStaticModelById,
  filterModelsByDisabledProviders: (models: Array<{ provider: string }>, providers: Array<{ providerName: string; isEnabled: boolean }>) => {
    const disabled = new Set(
      providers.filter((provider) => !provider.isEnabled).map((provider) => provider.providerName.replace(/[.-]/g, "_")),
    );
    return models.filter((model) => !disabled.has(model.provider.replace(/[.-]/g, "_")));
  },
  filterModelsByMcpProviderAccess: (models: unknown[]) => models,
  deriveModelResolutionOptions: vi.fn(() => undefined),
  resolveVerticalDramaCapabilities: vi.fn(() => ({})),
  getModelsByTypeAsync: vi.fn(),
  getModelRegistryCounters: vi.fn(),
  resetModelRegistryCounters: vi.fn(),
}));

vi.mock("../../services/mcpConnectionService", () => ({
  listConnectedMcpProviderKeys: mockListConnectedMcpProviderKeys,
}));

vi.mock("../../services/skillRegistry", () => ({
  clearSkillRegistryCache: mockClearSkillRegistryCache,
}));

vi.mock("../../services/crypto", () => ({
  decrypt: vi.fn(),
}));

vi.mock("../../services/mediaGenerationService", () => ({
  getMediaModelResolutionCounters: vi.fn(),
  resetMediaModelResolutionCounters: vi.fn(),
}));

vi.mock("../media", () => ({
  getMediaModelLookupCounters: vi.fn(),
  resetMediaModelLookupCounters: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    insert: vi.fn(),
    delete: vi.fn(),
    instance: { selectDistinct: vi.fn() },
  },
}));

vi.mock("../../_core/trpc", () => {
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
    adminProcedure: createProcedure(),
    protectedProcedure: createProcedure(),
  };
});

import { mediaModelsRouter } from "../mediaModels";

function makeSelectBuilder(result: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  };
}

function makeSelectImmediate(result: unknown) {
  return {
    from: vi.fn().mockResolvedValue(result),
    where: vi.fn().mockResolvedValue(result),
    orderBy: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  };
}

describe("mediaModels readiness helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStaticFallbackModels.mockReturnValue([]);
    mockGetStaticModelById.mockReturnValue(undefined);
    mockListConnectedMcpProviderKeys.mockResolvedValue(new Set());
  });

  it("annotates adminList rows with provider readiness details", async () => {
    const modelRows = [
      {
        id: 1,
        modelId: "ready-model",
        name: "Ready Model",
        description: null,
        modelType: "image",
        provider: "kie.ai",
        aliases: [],
        creditCost: 10,
        aspectRatios: null,
        sizes: null,
        durations: null,
        voices: null,
        configJson: null,
        isEnabled: true,
        priority: 1,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 2,
        modelId: "disabled-provider-model",
        name: "Disabled Provider Model",
        description: null,
        modelType: "video",
        provider: "byteplus_modelark",
        aliases: [],
        creditCost: 20,
        aspectRatios: null,
        sizes: null,
        durations: null,
        voices: null,
        configJson: null,
        isEnabled: true,
        priority: 2,
        sortOrder: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const providerRows = [
      {
        providerName: "kie_ai",
        displayName: "Kie AI",
        isEnabled: true,
        hasApiKey: true,
        lastTestResult: { success: true, message: "OK" },
      },
      {
        providerName: "byteplus_modelark",
        displayName: "BytePlus ModelArk",
        isEnabled: false,
        hasApiKey: true,
        lastTestResult: { success: true, message: "OK" },
      },
    ];

    mockDbSelect
      .mockReturnValueOnce(makeSelectBuilder(modelRows))
      .mockReturnValueOnce(makeSelectBuilder(providerRows));

    const fn = mediaModelsRouter.adminList as Function;
    const result = await fn({ input: { includeDisabled: true } });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      modelId: "ready-model",
      providerReady: true,
      providerReadiness: "ready",
      providerDisplayName: "Kie AI",
      providerConfigFound: true,
    });
    expect(result[1]).toMatchObject({
      modelId: "disabled-provider-model",
      providerReady: false,
      providerReadiness: "provider_disabled",
      providerDisplayName: "BytePlus ModelArk",
      providerConfigFound: true,
    });
  });

  it("excludes models backed by disabled providers from the public image/video/audio catalog", async () => {
    const modelRows = [
      {
        id: 1,
        modelId: "enabled-image",
        name: "Enabled Image",
        description: null,
        modelType: "image",
        provider: "kie.ai",
        creditCost: 10,
        aspectRatios: null,
        sizes: null,
        durations: null,
        voices: null,
        priority: 1,
        sortOrder: 1,
        configJson: null,
      },
      {
        id: 2,
        modelId: "disabled-video",
        name: "Disabled Video",
        description: null,
        modelType: "video",
        provider: "byteplus-modelark",
        creditCost: 10,
        aspectRatios: null,
        sizes: null,
        durations: null,
        voices: null,
        priority: 2,
        sortOrder: 2,
        configJson: null,
      },
      {
        id: 3,
        modelId: "disabled-audio",
        name: "Disabled Audio",
        description: null,
        modelType: "audio",
        provider: "byteplus_modelark",
        creditCost: 10,
        aspectRatios: null,
        sizes: null,
        durations: null,
        voices: null,
        priority: 3,
        sortOrder: 3,
        configJson: null,
      },
    ];
    const providerRows = [
      { providerName: "kie_ai", isEnabled: true },
      { providerName: "byteplus_modelark", isEnabled: false },
    ];

    mockDbSelect
      .mockReturnValueOnce(makeSelectBuilder(modelRows))
      .mockReturnValueOnce(makeSelectImmediate(providerRows));

    const result = await (mediaModelsRouter.list as Function)({ input: undefined });

    expect(result.models.map((model: { modelId: string }) => model.modelId)).toEqual([
      "enabled-image",
    ]);
    expect(result.providers).toEqual(["kie.ai"]);
  });

  it("disableUnavailable disables only enabled models with providers that are not ready", async () => {
    const modelRows = [
      {
        id: 1,
        modelId: "ready-model",
        provider: "kie.ai",
        isEnabled: true,
      },
      {
        id: 2,
        modelId: "missing-key-model",
        provider: "uvoice",
        isEnabled: true,
      },
      {
        id: 3,
        modelId: "already-disabled",
        provider: "byteplus_modelark",
        isEnabled: false,
      },
    ];

    const providerRows = [
      {
        providerName: "kie_ai",
        displayName: "Kie AI",
        isEnabled: true,
        hasApiKey: true,
        lastTestResult: { success: true, message: "OK" },
      },
      {
        providerName: "uvoice",
        displayName: "UVoice",
        isEnabled: true,
        hasApiKey: false,
        lastTestResult: null,
      },
      {
        providerName: "byteplus_modelark",
        displayName: "BytePlus ModelArk",
        isEnabled: false,
        hasApiKey: true,
        lastTestResult: null,
      },
    ];

    mockDbSelect
      .mockReturnValueOnce(makeSelectBuilder(modelRows))
      .mockReturnValueOnce(makeSelectImmediate(providerRows));

    const whereMock = vi.fn().mockResolvedValue([{ id: 2 }]);
    const setMock = vi.fn().mockReturnValue({ where: whereMock });
    mockDbUpdate.mockReturnValue({ set: setMock });

    const fn = mediaModelsRouter.disableUnavailable as Function;
    const result = await fn({});

    expect(result).toMatchObject({
      success: true,
      disabledCount: 1,
      disabledModelIds: ["missing-key-model"],
    });
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
    expect(whereMock).toHaveBeenCalledTimes(1);
    expect(mockClearModelCache).toHaveBeenCalledTimes(1);
    expect(mockClearSkillRegistryCache).toHaveBeenCalledTimes(1);
  });

  it("merges static config fallback into DB model config when legacy rows are missing maxPromptLength", async () => {
    mockGetStaticModelById.mockImplementation((lookupKey: string) => {
      if (lookupKey === "veo3/generate-veo-3-video-fast" || lookupKey === "veo3_fast") {
        return {
          id: "veo_3_1-fast",
          configJson: { maxPromptLength: 5000 },
        };
      }
      return undefined;
    });

    const modelRows = [
      {
        id: 1,
        modelId: "veo3/generate-veo-3-video-fast",
        name: "Veo 3.1 Fast",
        description: null,
        modelType: "video",
        provider: "knplabai",
        aliases: [],
        creditCost: 35,
        aspectRatios: null,
        sizes: null,
        durations: null,
        voices: null,
        configJson: { kieModelId: "veo3_fast", pricingTiers: { default: 35 } },
        isEnabled: true,
        priority: 1,
        sortOrder: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const providerRows = [
      {
        providerName: "knplabai",
        displayName: "KNPLabs AI",
        isEnabled: true,
        hasApiKey: true,
        lastTestResult: { success: true, message: "OK" },
      },
    ];

    mockDbSelect
      .mockReturnValueOnce(makeSelectBuilder(modelRows))
      .mockReturnValueOnce(makeSelectBuilder(providerRows));

    const fn = mediaModelsRouter.adminList as Function;
    const result = await fn({ input: { includeDisabled: true } });

    expect(result[0]).toMatchObject({
      modelId: "veo3/generate-veo-3-video-fast",
      configJson: {
        kieModelId: "veo3_fast",
        pricingTiers: { default: 35 },
        maxPromptLength: 5000,
      },
    });
  });

  it("lists importable static templates that are missing from the DB catalog", async () => {
    mockGetStaticFallbackModels.mockReturnValue([
      {
        id: "wavespeed-ai/cinematic-video-generator",
        type: "video",
        name: "Seedance 2.0 Grade Cinematic Video Generator",
        provider: "wavespeed_ai",
        description: "WaveSpeed launch model",
        aliases: ["seedance 2"],
        creditCost: 800,
        aspectRatios: ["16:9", "9:16"],
        durations: [5, 10],
        isEnabled: true,
        priority: 6,
        configJson: { apiPayloadFormat: "wavespeed" },
      },
    ]);

    mockDbSelect
      .mockReturnValueOnce(makeSelectImmediate([]))
      .mockReturnValueOnce(makeSelectBuilder([
        {
          providerName: "wavespeed_ai",
          displayName: "WaveSpeedAI",
          isEnabled: true,
          hasApiKey: true,
          lastTestResult: { success: true, message: "OK" },
        },
      ]));

    const fn = mediaModelsRouter.adminTemplates as Function;
    const result = await fn({ input: { type: "video", includeDisabled: true } });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      modelId: "wavespeed-ai/cinematic-video-generator",
      name: "Seedance 2.0 Grade Cinematic Video Generator",
      provider: "wavespeed_ai",
      providerReady: true,
      providerDisplayName: "WaveSpeedAI",
    });
  });
});
