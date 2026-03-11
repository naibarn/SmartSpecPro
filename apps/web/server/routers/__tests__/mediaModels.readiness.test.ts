import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockClearModelCache,
  mockClearSkillRegistryCache,
  mockDbSelect,
  mockDbUpdate,
} = vi.hoisted(() => ({
  mockClearModelCache: vi.fn(),
  mockClearSkillRegistryCache: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("../../services/modelRegistry", () => ({
  clearModelCache: mockClearModelCache,
  getModelRegistryCounters: vi.fn(),
  resetModelRegistryCounters: vi.fn(),
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
});
