import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGenerateImage,
  mockGenerateVideoAsync,
  mockGenerateAudio,
  mockCalculateCreditCost,
  mockDeductCredits,
  mockHasEnoughCredits,
  mockGetDb,
  mockCheckAbuseGuard,
  mockDecrypt,
} = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
  mockGenerateVideoAsync: vi.fn(),
  mockGenerateAudio: vi.fn(),
  mockCalculateCreditCost: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockGetDb: vi.fn(),
  mockCheckAbuseGuard: vi.fn(),
  mockDecrypt: vi.fn(),
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImage: mockGenerateImage,
    generateVideoAsync: mockGenerateVideoAsync,
    generateAudio: mockGenerateAudio,
    getModels: vi.fn().mockReturnValue([]),
    getModel: vi.fn().mockReturnValue(null),
  },
  MEDIA_MODELS: {
    "google-nano-banana-pro": {
      id: "google-nano-banana-pro",
      type: "image",
      name: "Google Nano Banana Pro",
      provider: "kie.ai",
      creditCost: 10,
    },
  },
  DEFAULT_MODELS: { image: "google-nano-banana-pro", video: "veo-3-1", audio: "elevenlabs-tts" },
}));

vi.mock("../../services/creditService", () => ({
  deductCredits: mockDeductCredits,
  hasEnoughCredits: mockHasEnoughCredits,
  refundCredits: vi.fn(),
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: mockCalculateCreditCost,
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn().mockReturnValue(true),
    getResetTime: vi.fn().mockReturnValue(1000),
  },
  isLuxTtsModel: vi.fn().mockReturnValue(false),
  checkLuxTtsRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfter: 0 }),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../../drizzle/schema", () => ({
  mediaModels: {
    modelId: "modelId",
    modelType: "modelType",
    provider: "provider",
    isEnabled: "isEnabled",
    creditCost: "creditCost",
    configJson: "configJson",
    name: "name",
    sortOrder: "sortOrder",
    priority: "priority",
    id: "id",
  },
  mediaProviders: {
    providerName: "providerName",
    baseUrl: "baseUrl",
    apiKeyEncrypted: "apiKeyEncrypted",
    isEnabled: "isEnabled",
  },
  users: {
    id: "id",
    userPreferences: "userPreferences",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  and: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn().mockReturnValue("fallback-token"),
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../../services/sandbox/dispatchService", () => ({
  shouldUseSandbox: vi.fn().mockReturnValue(false),
  dispatchToSandbox: vi.fn(),
}));

vi.mock("../../services/abuseGuard", () => ({
  checkAbuseGuard: mockCheckAbuseGuard,
  hashPrompt: vi.fn().mockReturnValue("prompt-hash"),
}));

vi.mock("../../services/crypto", () => ({
  decrypt: mockDecrypt,
}));

vi.mock("../../services/mediaLibraryService", () => ({
  addMediaTaskToLibrary: vi.fn(),
}));

vi.mock("../../services/libraryFeatureFlags", () => ({
  isLibraryEnabledForTenant: vi.fn().mockResolvedValue(true),
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: vi.fn().mockReturnValue("tenant-1"),
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
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

import { mediaRouter } from "../media";

function makeDbWithSequentialSelectResults(results: Array<any[]>) {
  let idx = 0;
  return {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        limit: vi.fn().mockImplementation(async () => results[idx++] ?? []),
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockImplementation(async () => results[idx++] ?? []),
          }),
          limit: vi.fn().mockImplementation(async () => results[idx++] ?? []),
        }),
      }),
    })),
  };
}

describe("media router DB-first model contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockCheckAbuseGuard.mockResolvedValue({ allowed: true, reason: "", retryAfter: 0 });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockCalculateCreditCost.mockReturnValue(22);
    mockDecrypt.mockReturnValue("uvoice-test-key");
    mockGenerateImage.mockResolvedValue({
      success: true,
      taskId: "task-1",
      status: "completed",
      model: "db-only-image-model",
      provider: "kie.ai",
      creditsUsed: 22,
      data: [{ url: "https://example.com/img.png" }],
    });
    mockGenerateAudio.mockResolvedValue({
      success: true,
      taskId: "task-audio-1",
      status: "completed",
      model: "db-only-audio-model",
      provider: "uvoice",
      creditsUsed: 22,
      data: [{ url: "https://example.com/audio.mp3" }],
    });
    mockGenerateVideoAsync.mockResolvedValue({
      success: true,
      taskId: "task-video-1",
      status: "completed",
      model: "db-only-video-model",
      provider: "kie.ai",
      creditsUsed: 50,
      data: [{ url: "https://example.com/video.mp4" }],
    });
  });

  it("generateImage accepts DB-only model and forwards DB provider hint", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "image", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 22, configJson: { pricingTiers: { default: 22 } } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.generateImage as Function;
    const result = await fn({
      ctx: {
        user: { id: 123, role: "user", currentTenantId: 1 },
        userToken: "user-token",
        tenantId: 1,
        publicUrl: "https://tenant.example.com",
      },
      input: {
        prompt: "test prompt",
        model: "db-only-image-model",
      },
    });

    expect(result.success).toBe(true);
    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "db-only-image-model",
        apiConfig: expect.objectContaining({ provider: "kie.ai" }),
      }),
      "user-token",
    );
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 22,
        description: "Image generation: db-only-image-model",
      }),
    );
  });

  it("estimateCredits resolves model metadata/name from DB for DB-only model", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "image", provider: "kie.ai", isEnabled: true }],
      [{ name: "DB Only Image Model" }],
      [{ creditCost: 22, configJson: null }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.estimateCredits as Function;
    const result = await fn({
      input: {
        type: "image",
        model: "db-only-image-model",
        numImages: 1,
      },
    });

    expect(result).toMatchObject({
      model: "db-only-image-model",
      modelName: "DB Only Image Model",
      baseCredits: 22,
      estimatedCredits: 22,
    });
  });

  it("rejects disabled model from DB even if static metadata exists", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "image", provider: "kie.ai", isEnabled: false }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.generateImage as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          prompt: "test prompt",
          model: "google-nano-banana-pro",
        },
      }),
    ).rejects.toMatchObject({ message: 'Model "google-nano-banana-pro" is disabled' });
    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  it("does not fallback to static metadata when DB is healthy but model is missing", async () => {
    const db = makeDbWithSequentialSelectResults([[]]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.estimateCredits as Function;
    await expect(
      fn({
        input: {
          type: "image",
          model: "google-nano-banana-pro",
          numImages: 1,
        },
      }),
    ).rejects.toMatchObject({ message: "Invalid model: google-nano-banana-pro" });
  });

  it("uses DB default model when request omits model", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelId: "db-default-image", provider: "kie.ai" }],
      [],
      [{ modelType: "image", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 18, configJson: null }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    mockCalculateCreditCost.mockReturnValue(18);

    const fn = mediaRouter.generateImage as Function;
    await fn({
      ctx: {
        user: { id: 123, role: "user", currentTenantId: 1 },
        userToken: "user-token",
        tenantId: 1,
        publicUrl: "https://tenant.example.com",
      },
      input: {
        prompt: "test prompt",
      },
    });

    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "db-default-image",
      }),
      "user-token",
    );
  });

  it("generateVideoAsync accepts prompts over 2000 chars when the model config allows it", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 50, configJson: { maxPromptLength: 5000, pricingTiers: { default: 50 } } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    mockCalculateCreditCost.mockReturnValue(50);

    const fn = mediaRouter.generateVideoAsync as Function;
    const result = await fn({
      ctx: {
        user: { id: 123, role: "user", currentTenantId: 1 },
        userToken: "user-token",
        tenantId: 1,
        publicUrl: "https://tenant.example.com",
      },
      input: {
        prompt: "a".repeat(2501),
        model: "veo-3-1",
        duration: 10,
      },
    });

    expect(result.success).toBe(true);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "a".repeat(2501),
        model: "veo-3-1",
        duration: 10,
        apiConfig: expect.objectContaining({ provider: "kie.ai" }),
      }),
      "user-token",
    );
  });

  it("generateVideoAsync rejects a fifth reference image only for the WaveSpeed launch model", async () => {
    const wavespeedConfig = {
      maxReferenceImages: 4,
      inputFields: [
        { key: "image_urls", type: "image_urls", syncWith: "reference_images", maxItems: 4 },
        { key: "aspect_ratio", type: "select", options: [{ value: "16:9", label: "16:9" }] },
        { key: "duration", type: "select", options: [{ value: "5", label: "5s" }] },
      ],
    };
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 800, configJson: wavespeedConfig }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.generateVideoAsync as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          prompt: "test prompt",
          model: "wavespeed-ai/cinematic-video-generator",
          duration: 5,
          aspectRatio: "16:9",
          referenceImageUrls: [
            "/uploads/1.png",
            "/uploads/2.png",
            "/uploads/3.png",
            "/uploads/4.png",
            "/uploads/5.png",
          ],
        },
      }),
    ).rejects.toMatchObject({
      message: "The selected model allows at most 4 reference images.",
    });

    expect(mockGenerateVideoAsync).not.toHaveBeenCalled();
  });

  it("generateVideoAsync rejects WaveSpeed-only aspect ratios and durations that are not in the model contract", async () => {
    const wavespeedConfig = {
      inputFields: [
        {
          key: "aspect_ratio",
          type: "select",
          options: [
            { value: "16:9", label: "16:9" },
            { value: "9:16", label: "9:16" },
          ],
        },
        {
          key: "duration",
          type: "select",
          options: [
            { value: "5", label: "5s" },
            { value: "10", label: "10s" },
          ],
        },
      ],
    };
    const fn = mediaRouter.generateVideoAsync as Function;

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 800, configJson: wavespeedConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          prompt: "test prompt",
          model: "wavespeed-ai/cinematic-video-generator",
          duration: 5,
          aspectRatio: "1:1",
        },
      }),
    ).rejects.toMatchObject({
      message: 'Unsupported aspect ratio "1:1" for model "wavespeed-ai/cinematic-video-generator".',
    });

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 800, configJson: wavespeedConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          prompt: "test prompt",
          model: "wavespeed-ai/cinematic-video-generator",
          duration: 15,
          aspectRatio: "16:9",
        },
      }),
    ).rejects.toMatchObject({
      message: 'Unsupported duration "15" for model "wavespeed-ai/cinematic-video-generator".',
    });
  });

  it("generateVideoAsync rejects unsafe absolute reference image URLs but still allows tenant-local relative paths", async () => {
    const wavespeedConfig = {
      maxReferenceImages: 4,
      inputFields: [
        { key: "image_urls", type: "image_urls", syncWith: "reference_images", maxItems: 4 },
      ],
    };
    const fn = mediaRouter.generateVideoAsync as Function;

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 800, configJson: wavespeedConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          prompt: "test prompt",
          model: "wavespeed-ai/cinematic-video-generator",
          duration: 5,
          referenceImageUrls: ["http://127.0.0.1/private.png"],
        },
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/public host/i),
    });

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 800, configJson: wavespeedConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          prompt: "test prompt",
          model: "wavespeed-ai/cinematic-video-generator",
          duration: 5,
          referenceImageUrls: ["/api/private.png"],
        },
      }),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/\/uploads\/ or \/api\/storage\/files\//i),
    });

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 800, configJson: wavespeedConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          prompt: "test prompt",
          model: "wavespeed-ai/cinematic-video-generator",
          duration: 5,
          referenceImageUrls: ["/api/storage/files/library/reference.png"],
        },
      }),
    ).resolves.toMatchObject({ success: true });

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 800, configJson: wavespeedConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          prompt: "test prompt",
          model: "wavespeed-ai/cinematic-video-generator",
          duration: 5,
          referenceImageUrls: ["/uploads/reference.png"],
        },
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it("generateVideoAsync keeps the existing five-image behavior for other providers", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 50, configJson: null }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    mockCalculateCreditCost.mockReturnValue(50);

    const fn = mediaRouter.generateVideoAsync as Function;
    const result = await fn({
      ctx: {
        user: { id: 123, role: "user", currentTenantId: 1 },
        userToken: "user-token",
        tenantId: 1,
        publicUrl: "https://tenant.example.com",
      },
      input: {
        prompt: "test prompt",
        model: "veo-3-1",
        duration: 5,
        referenceImageUrls: [
          "/uploads/1.png",
          "/uploads/2.png",
          "/uploads/3.png",
          "/uploads/4.png",
          "/uploads/5.png",
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "veo-3-1",
        referenceImageUrls: [
          "/uploads/1.png",
          "/uploads/2.png",
          "/uploads/3.png",
          "/uploads/4.png",
          "/uploads/5.png",
        ],
      }),
      "user-token",
    );
  });

  it("prefers a configured provider when resolving the DB default model", async () => {
    const db = makeDbWithSequentialSelectResults([
      [
        { modelId: "db-unconfigured-image", provider: "uvoice" },
        { modelId: "db-configured-image", provider: "kie.ai" },
      ],
      [{ providerName: "kie_ai", apiKeyEncrypted: "encrypted-key" }],
      [{ modelType: "image", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 18, configJson: null }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    mockCalculateCreditCost.mockReturnValue(18);

    const fn = mediaRouter.generateImage as Function;
    await fn({
      ctx: {
        user: { id: 123, role: "user", currentTenantId: 1 },
        userToken: "user-token",
        tenantId: 1,
        publicUrl: "https://tenant.example.com",
      },
      input: {
        prompt: "test prompt",
      },
    });

    expect(mockGenerateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "db-configured-image",
      }),
      "user-token",
    );
  });

  it("getModels derives configured defaults instead of the first sorted row", async () => {
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  id: "seedance-1-0-pro-fast-251015",
                  name: "Seedance Fast",
                  description: "video",
                  type: "video",
                  provider: "byteplus_modelark",
                  creditCost: 20,
                  supportsAspectRatios: ["16:9"],
                  supportsSizes: null,
                  supportsDurations: [5],
                  configJson: null,
                },
                {
                  id: "veo-3-1",
                  name: "Veo 3.1",
                  description: "video",
                  type: "video",
                  provider: "kie.ai",
                  creditCost: 50,
                  supportsAspectRatios: ["16:9"],
                  supportsSizes: null,
                  supportsDurations: [5],
                  configJson: null,
                },
              ]),
            }),
          }),
        }))
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { providerName: "kie_ai", apiKeyEncrypted: "encrypted-key" },
              ]),
            }),
          }),
        })),
    };
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.getModels as Function;
    const result = await fn({ input: { type: "video" } });

    expect(result.defaults.video).toBe("veo-3-1");
    expect(result.models.map((model: { id: string }) => model.id)).toEqual([
      "seedance-1-0-pro-fast-251015",
      "veo-3-1",
    ]);
  });

  it("getModel resolves DB-only model details", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        id: "db-only-image-model",
        type: "image",
        name: "DB Only Image Model",
        provider: "kie.ai",
        description: "from db",
        creditCost: 22,
        supportsAspectRatios: ["1:1"],
        supportsSizes: null,
        supportsDurations: null,
        supportsVoices: null,
      }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.getModel as Function;
    const result = await fn({ input: { modelId: "db-only-image-model" } });

    expect(result).toMatchObject({
      id: "db-only-image-model",
      name: "DB Only Image Model",
      provider: "kie.ai",
      type: "image",
      creditCost: 22,
    });
  });

  it("generateAudio enforces model-specific maxPromptLength from DB config", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "audio", provider: "uvoice", isEnabled: true }],
      [{ creditCost: 150, configJson: { maxPromptLength: 1500, pricingTiers: { default: 150 } } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.generateAudio as Function;
    await expect(
      fn({
        ctx: {
          user: { id: 123, role: "user", currentTenantId: 1 },
          userToken: "user-token",
          tenantId: 1,
          publicUrl: "https://tenant.example.com",
        },
        input: {
          model: "uvoice/tts-natural",
          text: "a".repeat(1501),
        },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("exceeds model limit 1500") });

    expect(mockGenerateAudio).not.toHaveBeenCalled();
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
  });

  it("listModelFieldOptions returns static options from configJson input fields", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "example-tts",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "speakerId",
              options: [
                { value: "TH-KantapongPremiumHD", label: "Kantapong Premium HD" },
                { value: "TH-AnotherVoice", label: "Another Voice" },
              ],
            },
          ],
        },
      }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      input: {
        modelId: "example-tts/standard",
        fieldKey: "speakerId",
        query: "Kantapong",
        limit: 20,
      },
    });

    expect(result.options).toEqual([
      { value: "TH-KantapongPremiumHD", label: "Kantapong Premium HD" },
    ]);
    expect(result.source).toBe("static");
  });

  it("listModelFieldOptions resolves provider_api options and merges with static options", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "example-tts",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "speakerId",
              options: [
                { value: "TH-STATIC", label: "Static Voice" },
              ],
              optionsSource: {
                type: "provider_api",
                endpoint: "/voice/list",
                method: "GET",
                itemsPath: "voices",
                valueField: "speaker_id",
                labelField: "name",
              },
            },
          ],
        },
      }],
      [{
        providerName: "example-tts",
        baseUrl: "https://api.uvoice.ai",
        apiKeyEncrypted: "encrypted-key",
      }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        voices: [
          { speaker_id: "TH-STATIC", name: "Static Voice Dynamic Label" },
          { speaker_id: "TH-DYNAMIC", name: "Dynamic Voice" },
        ],
      }),
    }));

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      input: {
        modelId: "example-tts/standard",
        fieldKey: "speakerId",
        limit: 50,
      },
    });

    expect(result.source).toBe("merged");
    expect(result.options).toEqual([
      { value: "TH-STATIC", label: "Static Voice Dynamic Label" },
      { value: "TH-DYNAMIC", label: "Dynamic Voice" },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.uvoice.ai/voice/list",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer uvoice-test-key",
        }),
      }),
    );
  });

  it("listModelFieldOptions rejects absolute provider_api endpoint and keeps static options only", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "example-tts",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "speakerId",
              options: [{ value: "TH-STATIC", label: "Static Voice" }],
              optionsSource: {
                type: "provider_api",
                endpoint: "https://evil.example.com/voices",
                itemsPath: "voices",
                valueField: "speaker_id",
                labelField: "name",
              },
            },
          ],
        },
      }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      input: {
        modelId: "example-tts/standard",
        fieldKey: "speakerId",
        limit: 50,
      },
    });

    expect(result.source).toBe("static");
    expect(result.options).toEqual([{ value: "TH-STATIC", label: "Static Voice" }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("listModelFieldOptions restricts UVoice results to the selected model tier", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "uvoice",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "voiceID",
              options: [{ value: "TH-STATIC", label: "Static Voice" }],
              optionsSource: {
                type: "provider_api",
                endpoint: "/voice/list",
                itemsPath: "voices",
                valueField: "voiceID",
                labelField: "name",
              },
            },
          ],
        },
      }],
      [{ userPreferences: { translationLanguage: "en" } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Standard&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "EN-1", displayName: "English Voice 1", age: "A", path: "voice-preview/en/voice-1.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Natural&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "EN-2", displayName: "English Voice 2", age: "YA", path: "voice-preview/en/voice-2.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Premium&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "EN-P1", displayName: "English Premium Voice", age: "A", path: "voice-preview/en/voice-premium.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Standard&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "TH-1", displayName: "Thai Voice 1", age: "A", path: "voice-preview/th/voice-1.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Natural&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Premium&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "TH-BowkyPremiumHD", displayName: "Bowky Premium HD", age: "A", path: "voice-preview/th/bowky-premium.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/") {
        return {
          ok: true,
          text: async () => (
            'var apiBaseAudioUrl = "https://hearme.blob.core.windows.net/audiostorage/";'
            + 'var storageToken = "?sig=test-token";'
          ),
        } as any;
      }
      return {
        ok: false,
        status: 404,
      } as any;
    }));

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      ctx: {
        user: { id: 123, role: "user", currentTenantId: 1 },
        userToken: "user-token",
        tenantId: 1,
        publicUrl: "https://tenant.example.com",
      },
      input: {
        modelId: "uvoice/tts-standard",
        fieldKey: "voiceID",
        query: "english",
        limit: 50,
      },
    });

    expect(result.source).toBe("merged");
    expect(result.options).toEqual([
      {
        value: "EN-1",
        label: "en - English Voice 1 (Adult)",
        previewUrl: "https://hearme.blob.core.windows.net/audiostorage/voice-preview/en/voice-1.mp3?sig=test-token",
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Standard&source=API-DOCS",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Natural&source=API-DOCS",
      expect.anything(),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Premium&source=API-DOCS",
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://uvoice.app/",
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: "text/html",
        }),
      }),
    );
  });

  it("listModelFieldOptions includes only premium UVoice voices for premium model and keeps static fallback", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "uvoice",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "voiceID",
              options: [{ value: "TH-STATIC", label: "Static Voice" }],
              optionsSource: {
                type: "provider_api",
                endpoint: "/voice/list",
                itemsPath: "voices",
                valueField: "voiceID",
                labelField: "name",
              },
            },
          ],
        },
      }],
      [{ userPreferences: { translationLanguage: "th" } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Standard&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "EN-1", displayName: "English Voice 1", age: "A", path: "voice-preview/en/voice-1.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Natural&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "EN-2", displayName: "English Voice 2", age: "YA", path: "voice-preview/en/voice-2.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Premium&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "EN-P1", displayName: "English Premium Voice", age: "A", path: "voice-preview/en/voice-premium.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Standard&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "TH-1", displayName: "Thai Voice 1", age: "A", path: "voice-preview/th/voice-1.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Natural&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "TH-N1", displayName: "Thai Natural Voice", age: "YA", path: "voice-preview/th/voice-natural-1.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Premium&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "TH-BowkyPremiumHD", displayName: "Bowky Premium HD", age: "A", path: "voice-preview/th/bowky-premium.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/") {
        return {
          ok: true,
          text: async () => (
            'var apiBaseAudioUrl = "https://hearme.blob.core.windows.net/audiostorage/";'
            + 'var storageToken = "?sig=test-token";'
          ),
        } as any;
      }
      return {
        ok: false,
        status: 404,
      } as any;
    }));

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      ctx: {
        user: { id: 123, role: "user", currentTenantId: 1 },
        userToken: "user-token",
        tenantId: 1,
        publicUrl: "https://tenant.example.com",
      },
      input: {
        modelId: "uvoice/tts-premium",
        fieldKey: "voiceID",
        limit: 50,
      },
    });

    expect(result.source).toBe("merged");
    expect(result.options).toEqual([
      {
        value: "EN-P1",
        label: "en - English Premium Voice (Adult)",
        previewUrl: "https://hearme.blob.core.windows.net/audiostorage/voice-preview/en/voice-premium.mp3?sig=test-token",
      },
      {
        value: "TH-BowkyPremiumHD",
        label: "th - Bowky Premium HD (Adult)",
        previewUrl: "https://hearme.blob.core.windows.net/audiostorage/voice-preview/th/bowky-premium.mp3?sig=test-token",
      },
      {
        value: "TH-STATIC",
        label: "Static Voice",
      },
    ]);
    expect(fetch).not.toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Standard&source=API-DOCS",
      expect.anything(),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Premium&source=API-DOCS",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Natural&source=API-DOCS",
      expect.anything(),
    );
  });

  it("listModelFieldOptions resolves public_api options without provider key", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "kie.ai",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "voice",
              optionsSource: {
                type: "public_api",
                endpoint: "https://api.elevenlabs.io/v1/voices",
                method: "GET",
                itemsPath: "voices",
                valueField: "name",
                labelField: "name",
                valueTransform: "before_dash",
              },
            },
          ],
        },
      }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        voices: [
          { name: "Jessica - Playful, Bright, Warm" },
          { name: "Mark - Natural Conversations" },
        ],
      }),
    }));

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      input: {
        modelId: "elevenlabs/text-to-dialogue-v3",
        fieldKey: "voice",
        limit: 50,
      },
    });

    expect(result.source).toBe("dynamic");
    expect(result.options).toEqual([
      { value: "Jessica", label: "Jessica - Playful, Bright, Warm" },
      { value: "Mark", label: "Mark - Natural Conversations" },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/voices",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
        }),
      }),
    );
  });

  it("listModelFieldOptions rejects non-https public_api endpoint", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "kie.ai",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "voice",
              options: [{ value: "Jessica", label: "Jessica" }],
              optionsSource: {
                type: "public_api",
                endpoint: "http://api.elevenlabs.io/v1/voices",
                method: "GET",
                itemsPath: "voices",
                valueField: "name",
                labelField: "name",
              },
            },
          ],
        },
      }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      input: {
        modelId: "elevenlabs/text-to-dialogue-v3",
        fieldKey: "voice",
        limit: 50,
      },
    });

    expect(result.source).toBe("static");
    expect(result.options).toEqual([{ value: "Jessica", label: "Jessica" }]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
