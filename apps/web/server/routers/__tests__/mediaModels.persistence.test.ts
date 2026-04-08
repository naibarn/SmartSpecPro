import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  dbMock,
  clearModelCacheMock,
  clearSkillRegistryCacheMock,
  getStaticFallbackModelsMock,
} = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    instance: {
      selectDistinct: vi.fn(),
    },
  },
  clearModelCacheMock: vi.fn(),
  clearSkillRegistryCacheMock: vi.fn(),
  getStaticFallbackModelsMock: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: dbMock,
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

vi.mock("../../services/modelRegistry", () => ({
  clearModelCache: clearModelCacheMock,
  getStaticFallbackModels: getStaticFallbackModelsMock,
  getStaticModelById: vi.fn(),
  getModelRegistryCounters: vi.fn().mockReturnValue({}),
  resetModelRegistryCounters: vi.fn(),
}));

vi.mock("../../services/skillRegistry", () => ({
  clearSkillRegistryCache: clearSkillRegistryCacheMock,
}));

vi.mock("../../services/crypto", () => ({
  decrypt: vi.fn(),
}));

vi.mock("../../services/mediaGenerationService", () => ({
  getMediaModelResolutionCounters: vi.fn().mockReturnValue({}),
  resetMediaModelResolutionCounters: vi.fn(),
}));

vi.mock("../media", () => ({
  getMediaModelLookupCounters: vi.fn().mockReturnValue({}),
  resetMediaModelLookupCounters: vi.fn(),
}));

vi.mock("../../../drizzle/schema", () => ({
  mediaModels: {
    id: "id",
    modelId: "modelId",
    name: "name",
    description: "description",
    modelType: "modelType",
    provider: "provider",
    aliases: "aliases",
    creditCost: "creditCost",
    aspectRatios: "aspectRatios",
    sizes: "sizes",
    durations: "durations",
    voices: "voices",
    configJson: "configJson",
    isEnabled: "isEnabled",
    priority: "priority",
    sortOrder: "sortOrder",
    updatedAt: "updatedAt",
  },
  mediaProviders: {
    providerName: "providerName",
    displayName: "displayName",
    isEnabled: "isEnabled",
    hasApiKey: "hasApiKey",
    lastTestResult: "lastTestResult",
    sortOrder: "sortOrder",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  and: vi.fn(),
  ilike: vi.fn(),
  sql: vi.fn(),
}));

import { mediaModelsRouter } from "../mediaModels";

function mockSelectReturning(rows: any[]) {
  dbMock.select.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
      orderBy: vi.fn().mockResolvedValue(rows),
    }),
  });
}

describe("mediaModelsRouter persistence guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.instance.selectDistinct.mockResolvedValue([]);
    getStaticFallbackModelsMock.mockReturnValue([]);
  });

  it("rejects unsafe absolute apiEndpoint values before insert", async () => {
    mockSelectReturning([]);

    await expect(
      (mediaModelsRouter.create as Function)({
        input: {
          modelId: "wavespeed-ai/cinematic-video-generator",
          name: "WaveSpeed Launch",
          modelType: "video",
          provider: "wavespeed-ai",
          aliases: [],
          creditCost: 800,
          isEnabled: true,
          priority: 1,
          sortOrder: 1,
          configJson: {
            apiEndpoint: "https://evil.example.com/submit",
          },
        },
      }),
    ).rejects.toThrow(/relative/i);

    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("rejects unsafe apiQueryEndpoint traversal before update", async () => {
    mockSelectReturning([{ id: 1, modelId: "wavespeed-ai/cinematic-video-generator" }]);

    await expect(
      (mediaModelsRouter.update as Function)({
        input: {
          id: 1,
          configJson: {
            apiQueryEndpoint: "/predictions/../result",
          },
        },
      }),
    ).rejects.toThrow(/\.\./i);

    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("sanitizes safe relative endpoints and canonical provider names on create", async () => {
    mockSelectReturning([]);
    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        { id: 1, modelId: "wavespeed-ai/cinematic-video-generator" },
      ]),
    });
    dbMock.insert.mockReturnValue({
      values: insertValues,
    });

    await (mediaModelsRouter.create as Function)({
      input: {
        modelId: "wavespeed-ai/cinematic-video-generator",
        name: "WaveSpeed Launch",
        modelType: "video",
        provider: "wavespeed-ai",
        aliases: [],
        creditCost: 800,
        isEnabled: true,
        priority: 1,
        sortOrder: 1,
        configJson: {
          apiEndpoint: "wavespeed-ai/cinematic-video-generator",
          apiQueryEndpoint: "predictions/{requestId}/result",
          apiConfig: {
            provider: "wavespeed-ai",
          },
        },
      },
    });

    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "wavespeed_ai",
        configJson: {
          apiEndpoint: "/wavespeed-ai/cinematic-video-generator",
          apiQueryEndpoint: "/predictions/{requestId}/result",
          apiConfig: {
            provider: "wavespeed_ai",
          },
        },
      }),
    );
    expect(clearModelCacheMock).toHaveBeenCalled();
    expect(clearSkillRegistryCacheMock).toHaveBeenCalled();
  });

  it("imports a missing static template into the DB catalog", async () => {
    getStaticFallbackModelsMock.mockReturnValue([
      {
        id: "wavespeed-ai/cinematic-video-generator",
        type: "video",
        name: "Seedance 2.0 Grade Cinematic Video Generator",
        provider: "wavespeed_ai",
        description: "WaveSpeed launch model",
        aliases: ["seedance 2"],
        creditCost: 800,
        aspectRatios: ["16:9", "9:16"],
        sizes: undefined,
        durations: [5, 10],
        voices: undefined,
        isEnabled: true,
        priority: 6,
        configJson: {
          apiEndpoint: "wavespeed-ai/cinematic-video-generator",
          apiQueryEndpoint: "predictions/{requestId}/result",
          apiConfig: {
            provider: "wavespeed-ai",
          },
        },
      },
    ]);

    mockSelectReturning([]);
    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 9,
          modelId: "wavespeed-ai/cinematic-video-generator",
          name: "Seedance 2.0 Grade Cinematic Video Generator",
          modelType: "video",
          provider: "wavespeed_ai",
          configJson: {
            apiEndpoint: "/wavespeed-ai/cinematic-video-generator",
            apiQueryEndpoint: "/predictions/{requestId}/result",
            apiConfig: {
              provider: "wavespeed_ai",
            },
          },
        },
      ]),
    });
    dbMock.insert.mockReturnValue({
      values: insertValues,
    });

    const result = await (mediaModelsRouter.importTemplate as Function)({
      input: {
        modelId: "wavespeed-ai/cinematic-video-generator",
      },
    });

    expect(result.imported).toBe(true);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "wavespeed-ai/cinematic-video-generator",
        provider: "wavespeed_ai",
        configJson: {
          apiEndpoint: "/wavespeed-ai/cinematic-video-generator",
          apiQueryEndpoint: "/predictions/{requestId}/result",
          apiConfig: {
            provider: "wavespeed_ai",
          },
        },
      }),
    );
    expect(clearModelCacheMock).toHaveBeenCalled();
    expect(clearSkillRegistryCacheMock).toHaveBeenCalled();
  });

  it("imports a Seedance 2.0 image-to-video template with required reference-image metadata intact", async () => {
    getStaticFallbackModelsMock.mockReturnValue([
      {
        id: "bytedance/seedance-2.0/image-to-video",
        type: "video",
        name: "Seedance 2.0 Image-to-Video",
        provider: "wavespeed_ai",
        description: "WaveSpeed Seedance 2.0 image-to-video",
        aliases: ["seedance 2.0 i2v"],
        creditCost: 900,
        aspectRatios: ["16:9", "9:16", "4:3", "3:4", "1:1", "21:9"],
        sizes: undefined,
        durations: [5, 10, 15],
        voices: undefined,
        isEnabled: true,
        priority: 8,
        configJson: {
          generateType: "image-to-video",
          apiEndpoint: "bytedance/seedance-2.0/image-to-video",
          apiQueryEndpoint: "predictions/{requestId}/result",
          maxReferenceImages: 4,
          requiresReferenceImages: true,
          inputFields: [
            {
              key: "image_urls",
              type: "image_urls",
              required: true,
              syncWith: "reference_images",
              maxItems: 4,
            },
          ],
          apiConfig: {
            provider: "wavespeed-ai",
          },
        },
      },
    ]);

    mockSelectReturning([]);
    const insertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([
        {
          id: 11,
          modelId: "bytedance/seedance-2.0/image-to-video",
          provider: "wavespeed_ai",
          configJson: {
            generateType: "image-to-video",
            apiEndpoint: "/bytedance/seedance-2.0/image-to-video",
            apiQueryEndpoint: "/predictions/{requestId}/result",
            maxReferenceImages: 4,
            requiresReferenceImages: true,
            inputFields: [
              {
                key: "image_urls",
                type: "image_urls",
                required: true,
                syncWith: "reference_images",
                maxItems: 4,
              },
            ],
            apiConfig: {
              provider: "wavespeed_ai",
            },
          },
        },
      ]),
    });
    dbMock.insert.mockReturnValue({
      values: insertValues,
    });

    const result = await (mediaModelsRouter.importTemplate as Function)({
      input: {
        modelId: "bytedance/seedance-2.0/image-to-video",
      },
    });

    expect(result.imported).toBe(true);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "bytedance/seedance-2.0/image-to-video",
        provider: "wavespeed_ai",
        configJson: expect.objectContaining({
          generateType: "image-to-video",
          apiEndpoint: "/bytedance/seedance-2.0/image-to-video",
          requiresReferenceImages: true,
          inputFields: expect.arrayContaining([
            expect.objectContaining({
              key: "image_urls",
              required: true,
            }),
          ]),
        }),
      }),
    );
  });
});
