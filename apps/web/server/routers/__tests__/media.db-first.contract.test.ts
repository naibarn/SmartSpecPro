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
  mockHashPrompt,
  mockDecrypt,
  mockResolveMediaTransport,
  mockSubmitMcpMediaGeneration,
} = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
  mockGenerateVideoAsync: vi.fn(),
  mockGenerateAudio: vi.fn(),
  mockCalculateCreditCost: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockGetDb: vi.fn(),
  mockCheckAbuseGuard: vi.fn(),
  mockHashPrompt: vi.fn((text: string, serialized: string) => `${text}::${serialized}`),
  mockDecrypt: vi.fn(),
  mockResolveMediaTransport: vi.fn(),
  mockSubmitMcpMediaGeneration: vi.fn(),
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
    "fal-ai/gemini-3.1-flash-tts": {
      id: "fal-ai/gemini-3.1-flash-tts",
      type: "audio",
      name: "Gemini 3.1 Flash TTS",
      provider: "fal_ai",
      creditCost: 150,
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
  hashPrompt: mockHashPrompt,
}));

vi.mock("../../services/crypto", () => ({
  decrypt: mockDecrypt,
}));

vi.mock("../../services/mediaLibraryService", () => ({
  addMediaTaskToLibrary: vi.fn(),
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: (...args: unknown[]) => mockResolveMediaTransport(...args),
}));

vi.mock("../../services/mcpMediaAdapter", () => ({
  cancelMcpMediaGeneration: vi.fn(),
  getMcpMediaTask: vi.fn(),
  listMcpMediaTasks: vi.fn(),
  submitMcpMediaGeneration: (...args: unknown[]) => mockSubmitMcpMediaGeneration(...args),
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

function makeCtx(origin = "https://tenant.example.com") {
  return {
    user: { id: 123, role: "user", currentTenantId: 1 },
    userToken: "user-token",
    tenantId: 1,
    publicUrl: origin,
    req: {
      headers: {
        origin,
      },
    },
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
    mockResolveMediaTransport.mockImplementation(async (input) => ({
      transport: "mcp",
      tenantId: input.tenantId,
      originSurface: input.originSurface,
      assetType: input.assetType,
      actorUserId: input.actorUserId,
      ownerUserId: input.actorUserId,
      connectionId: input.mcpConnectionId,
      sharedGroupId: input.sharedGroupId,
      connectionScope: input.sharedGroupId ? "shared" : "personal",
      providerKey: input.providerKey,
      providerModelId: input.providerModelId,
      toolName: input.toolName,
      argumentShape: input.argumentShape,
      creditPolicy: "provider_credits_tracked",
      idempotencyKey: input.idempotencyKey,
    }));
    mockSubmitMcpMediaGeneration.mockResolvedValue({
      success: true,
      taskId: "mcp-video-1",
      id: "mcp-video-1",
      status: "processing",
      model: "higgsfield/seedance_2_0_fast",
      provider: "higgsfield",
      creditsUsed: 0,
      data: [],
    });
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

  it("generateVideoAsync keeps Media Studio source context in credits and task params", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 50, configJson: { pricingTiers: { default: 50 } } }],
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
        prompt: "media studio prompt",
        model: "veo-3-1",
        duration: 10,
        originSurface: "media_studio",
        extraParams: {
          quality: "high",
        },
      },
    });

    expect(result.success).toBe(true);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: "media_video",
        metadata: expect.objectContaining({
          endpoint: "generateVideoAsync",
          originSurface: "media_studio",
        }),
      }),
    );
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        extraParams: expect.objectContaining({
          quality: "high",
          __reserved_credits: 50,
          __reserved_duration: 10,
          __origin_surface: "media_studio",
        }),
      }),
      "user-token",
    );
  });

  it("generateVideoAsync uses explicit MCP route metadata instead of stale DB provider hints", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 0, configJson: { pricingTiers: { default: 0 } } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.generateVideoAsync as Function;
    const result = await fn({
      ctx: makeCtx(),
      input: {
        prompt: "short storyboard video prompt",
        model: "higgsfield/seedance_2_0_fast",
        duration: 8,
        aspectRatio: "9:16",
        transport: "mcp",
        mcpConnectionId: "mcp_conn_higgsfield",
        sharedGroupId: 42,
        mcpProviderKey: "higgsfield",
        mcpProviderModelId: "seedance_2_0_fast",
        mcpToolName: "generate_video",
        mcpArgumentShape: "higgsfield.generate_video",
        originSurface: "storyboard_review",
        idempotencyKey: "storyboard-review-task-1",
      },
    });

    expect(result).toMatchObject({ taskId: "mcp-video-1" });
    expect(mockResolveMediaTransport).toHaveBeenCalledWith(expect.objectContaining({
      requestedTransport: "mcp",
      assetType: "video",
      mcpConnectionId: "mcp_conn_higgsfield",
      sharedGroupId: 42,
      providerKey: "higgsfield",
      providerModelId: "seedance_2_0_fast",
      model: "seedance_2_0_fast",
      toolName: "generate_video",
      argumentShape: "higgsfield.generate_video",
      originSurface: "storyboard_review",
    }));
    expect(mockSubmitMcpMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      model: "higgsfield/seedance_2_0_fast",
      metadata: expect.objectContaining({
        providerKey: "higgsfield",
        providerModelId: "seedance_2_0_fast",
      }),
      parameters: expect.objectContaining({
        duration: 8,
        aspectRatio: "9:16",
      }),
    }));
    expect(mockGenerateVideoAsync).not.toHaveBeenCalled();
  });

  it("generateVideoAsync derives MCP route metadata from provider-prefixed model ids before stale DB provider fallbacks", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 0, configJson: { transport: "mcp", pricingTiers: { default: 0 } } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.generateVideoAsync as Function;
    const result = await fn({
      ctx: makeCtx(),
      input: {
        prompt: "short storyboard video prompt",
        model: "higgsfield/seedance_2_0_fast",
        duration: 8,
        aspectRatio: "9:16",
        transport: "mcp",
        mcpConnectionId: "mcp_conn_higgsfield",
        sharedGroupId: 42,
        originSurface: "storyboard_review",
        idempotencyKey: "storyboard-review-task-missing-route",
      },
    });

    expect(result).toMatchObject({ taskId: "mcp-video-1" });
    expect(mockResolveMediaTransport).toHaveBeenCalledWith(expect.objectContaining({
      requestedTransport: "mcp",
      assetType: "video",
      mcpConnectionId: "mcp_conn_higgsfield",
      sharedGroupId: 42,
      providerKey: "higgsfield",
      providerModelId: "seedance_2_0_fast",
      model: "seedance_2_0_fast",
      argumentShape: "higgsfield.generate_video",
      originSurface: "storyboard_review",
    }));
    expect(mockSubmitMcpMediaGeneration).toHaveBeenCalledWith(expect.objectContaining({
      model: "higgsfield/seedance_2_0_fast",
      metadata: expect.objectContaining({
        providerKey: "higgsfield",
        providerModelId: "seedance_2_0_fast",
      }),
    }));
    expect(mockGenerateVideoAsync).not.toHaveBeenCalled();
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

  it("generateImage rejects user-supplied Magnific webhook fields before provider calls", async () => {
    const magnificConfig = {
      provider: "magnific",
      inputFields: [
        { key: "prompt", type: "text", syncWith: "prompt", maxLength: 4096, required: true },
        { key: "aspect_ratio", type: "select", syncWith: "aspect_ratio", options: [{ value: "1:1", label: "1:1" }] },
      ],
    };
    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ name: "Mystic", modelType: "image", provider: "magnific", isEnabled: true }],
      [{ creditCost: 20, configJson: magnificConfig }],
    ]) as any);

    const fn = mediaRouter.generateImage as Function;
    await expect(
      fn({
        ctx: makeCtx(),
        input: {
          prompt: "test prompt",
          model: "magnific/mystic",
          aspectRatio: "1:1",
          extraParams: {
            webhook_url: "https://example.com/hook",
          },
        },
      }),
    ).rejects.toMatchObject({
      message: "Magnific does not allow user-supplied webhook_url.",
    });

    expect(mockGenerateImage).not.toHaveBeenCalled();
  });

  it("generateImage enforces Magnific numeric ranges and Google-search model support", async () => {
    const magnificConfig = {
      provider: "magnific",
      inputFields: [
        { key: "prompt", type: "text", syncWith: "prompt", maxLength: 4096, required: true },
        { key: "horizontal_angle", label: "Horizontal Angle", type: "number", min: 0, max: 360 },
      ],
    };
    const fn = mediaRouter.generateImage as Function;

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ name: "Change Camera", modelType: "image", provider: "magnific", isEnabled: true }],
      [{ creditCost: 12, configJson: magnificConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: makeCtx(),
        input: {
          prompt: "test prompt",
          model: "magnific/change-camera",
          extraParams: { horizontal_angle: 361 },
        },
      }),
    ).rejects.toMatchObject({
      message: "Horizontal Angle must be at most 360.",
    });

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ name: "Change Camera", modelType: "image", provider: "magnific", isEnabled: true }],
      [{ creditCost: 12, configJson: magnificConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: makeCtx(),
        input: {
          prompt: "test prompt",
          model: "magnific/change-camera",
          extraParams: { use_google_search_tool: true },
        },
      }),
    ).rejects.toMatchObject({
      message: "use_google_search_tool is only supported on Magnific Nano Banana models.",
    });
  });

  it("generateVideoAsync enforces Magnific reference video and resolution metadata", async () => {
    const magnificConfig = {
      provider: "magnific",
      inputFields: [
        { key: "video_urls", label: "Reference Video", type: "video_urls", syncWith: "reference_videos", required: true, maxItems: 1 },
        {
          key: "resolution",
          label: "Resolution",
          type: "select",
          options: [
            { value: "720p", label: "720p" },
            { value: "1080p", label: "1080p" },
          ],
        },
        { key: "duration", type: "select", options: [{ value: "4", label: "4s" }] },
      ],
    };
    const fn = mediaRouter.generateVideoAsync as Function;

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ name: "Video Upscaler", modelType: "video", provider: "magnific", isEnabled: true }],
      [{ creditCost: 200, configJson: magnificConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: makeCtx(),
        input: {
          prompt: "upscale this",
          model: "magnific/video-upscaler-precision",
          duration: 4,
          resolution: "4k",
        },
      }),
    ).rejects.toMatchObject({
      message: 'Unsupported resolution "4k" for model "magnific/video-upscaler-precision".',
    });

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ name: "Video Upscaler", modelType: "video", provider: "magnific", isEnabled: true }],
      [{ creditCost: 200, configJson: magnificConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: makeCtx(),
        input: {
          prompt: "upscale this",
          model: "magnific/video-upscaler-precision",
          duration: 4,
          resolution: "720p",
        },
      }),
    ).rejects.toMatchObject({
      message: 'The selected model "magnific/video-upscaler-precision" requires at least one reference video.',
    });

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ name: "Video Upscaler", modelType: "video", provider: "magnific", isEnabled: true }],
      [{ creditCost: 200, configJson: magnificConfig }],
    ]) as any);
    await expect(
      fn({
        ctx: makeCtx(),
        input: {
          prompt: "upscale this",
          model: "magnific/video-upscaler-precision",
          duration: 4,
          resolution: "720p",
          referenceVideoUrls: ["/uploads/source.mp4"],
        },
      }),
    ).resolves.toMatchObject({ success: true });
  });

  it("generateVideoAsync accepts Gemini Omni tenant upload references and forwards video_list", async () => {
    const geminiConfig = {
      apiPayloadFormat: "market",
      kieModelId: "gemini-omni-video",
      supportedDurations: [4, 6, 8, 10],
      supportedResolutions: ["720p", "1080p", "4K"],
      maxReferenceImages: 7,
      maxReferenceVideos: 1,
      apiConfig: {
        reference_image_input_key: "image_urls",
        reference_image_input_type: "array",
        reference_video_input_key: "video_list",
        reference_video_input_type: "object_array",
      },
      inputFields: [
        { key: "image_urls", type: "image_urls", syncWith: "reference_images", maxItems: 7 },
        { key: "video_list", type: "video_urls", syncWith: "reference_videos", maxItems: 1, affectsPricing: true },
        { key: "resolution", type: "select", options: [{ value: "1080p", label: "1080p" }] },
        { key: "duration", type: "select", options: [{ value: "4", label: "4s" }] },
      ],
      pricingTiers: { default: 90, "1080p-4s-with-video": 240 },
      pricingFormula: "matrix",
    };
    const fn = mediaRouter.generateVideoAsync as Function;
    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ name: "Gemini Omni Video", modelType: "video", provider: "kie.ai", isEnabled: true }],
      [{ creditCost: 90, configJson: geminiConfig }],
    ]) as any);
    mockCalculateCreditCost.mockReturnValue(240);

    await expect(
      fn({
        ctx: makeCtx(),
        input: {
          prompt: "cinematic edit",
          model: "gemini-omni-video",
          duration: 4,
          resolution: "1080p",
          referenceImageUrls: ["/uploads/ref.png"],
          referenceVideoUrls: ["/api/storage/files/chat/uploads/source.mp4"],
        },
      }),
    ).resolves.toMatchObject({ success: true });

    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-omni-video",
        referenceVideoUrls: ["/api/storage/files/chat/uploads/source.mp4"],
        extraParams: expect.objectContaining({
          image_urls: ["/uploads/ref.png"],
          video_list: [{ url: "/api/storage/files/chat/uploads/source.mp4" }],
        }),
      }),
      "user-token",
    );
    expect(mockCalculateCreditCost).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        video_list: [{ url: "/api/storage/files/chat/uploads/source.mp4" }],
      }),
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
    expect(result.models.map((model: { id: string }) => model.id)).toEqual(["veo-3-1"]);
  });

  it("getModels hides models whose enabled provider is missing configuration", async () => {
    const db = {
      select: vi
        .fn()
        .mockImplementationOnce(() => ({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue([
                {
                  id: "veo-3-1",
                  name: "Veo 3.1",
                  description: "video",
                  type: "video",
                  provider: "knplabai",
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
                { providerName: "knplabai", hasApiKey: false, apiKeyEncrypted: null },
              ]),
            }),
          }),
        })),
    };
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.getModels as Function;
    const result = await fn({ input: { type: "video" } });

    expect(result.models).toEqual([]);
    expect(result.defaults.video).toBeNull();
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

  it("generateAudio rejects OmniVoice audio generation from non-desktop origins", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "audio", provider: "omnivoice", isEnabled: true }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.generateAudio as Function;
    await expect(
      fn({
        ctx: makeCtx("https://smartaihub.app"),
        input: {
          model: "omnivoice-tts",
          text: "hello from web",
          extraParams: {
            reference_audio_base64: "YWJj",
          },
        },
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("desktop app") });

    expect(mockGenerateAudio).not.toHaveBeenCalled();
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
  });

  it("generateAudio allows OmniVoice audio generation from desktop origins", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{ modelType: "audio", provider: "omnivoice", isEnabled: true }],
      [{ creditCost: 150, configJson: { maxPromptLength: 1500, pricingTiers: { default: 150 } } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);

    const fn = mediaRouter.generateAudio as Function;
    await expect(
      fn({
        ctx: makeCtx("tauri://localhost"),
        input: {
          model: "omnivoice-tts",
          text: "hello from desktop",
          extraParams: {
            reference_audio_base64: "YWJj",
            reference_text: "hello reference",
          },
        },
      }),
    ).resolves.toBeDefined();
  });

  it("generateAudio rejects malformed Gemini TTS payloads before abuse checks and service calls", async () => {
    mockGetDb.mockResolvedValue(null as any);

    const fn = mediaRouter.generateAudio as Function;
    await expect(
      fn({
        ctx: makeCtx("https://smartaihub.app"),
        input: {
          model: "fal-ai/gemini-3.1-flash-tts",
          text: "Host: Welcome back.",
          extraParams: {
            language_code: "Klingon",
            speakers: [
              { speaker_id: "Host One", voice: "Kore" },
            ],
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Gemini 3.1 Flash TTS input validation failed"),
    });

    expect(mockCheckAbuseGuard).not.toHaveBeenCalled();
    expect(mockGenerateAudio).not.toHaveBeenCalled();
  });

  it("generateAudio rejects Gemini top-level speed before abuse checks and service calls", async () => {
    mockGetDb.mockResolvedValue(null as any);

    const fn = mediaRouter.generateAudio as Function;
    await expect(
      fn({
        ctx: makeCtx("https://smartaihub.app"),
        input: {
          model: "fal-ai/gemini-3.1-flash-tts",
          text: "Host: Welcome back.",
          speed: 1.25,
          extraParams: {
            voice: "Kore",
          },
        },
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("speed is not supported by Gemini 3.1 Flash TTS"),
    });

    expect(mockCheckAbuseGuard).not.toHaveBeenCalled();
    expect(mockGenerateAudio).not.toHaveBeenCalled();
  });

  it("generateAudio ignores top-level Gemini voice in the abuse hash when speakers are present", async () => {
    mockGetDb.mockResolvedValue(null as any);

    const fn = mediaRouter.generateAudio as Function;
    const baseInput = {
      model: "fal-ai/gemini-3.1-flash-tts",
      text: "Host: Welcome back.",
      extraParams: {
        speakers: [
          { speaker_id: "Host", voice: "Kore" },
        ],
      },
    } as const;

    await fn({
      ctx: makeCtx("https://smartaihub.app"),
      input: {
        ...baseInput,
        voice: "Kore",
      },
    });
    const firstHash = mockCheckAbuseGuard.mock.calls[0]?.[0]?.promptHash;

    mockCheckAbuseGuard.mockClear();
    mockGenerateAudio.mockClear();

    await fn({
      ctx: makeCtx("https://smartaihub.app"),
      input: {
        ...baseInput,
        voice: "Zephyr",
      },
    });
    const secondHash = mockCheckAbuseGuard.mock.calls[0]?.[0]?.promptHash;

    expect(firstHash).toBe(secondHash);
    expect(mockCheckAbuseGuard).toHaveBeenCalledTimes(1);
    expect(mockGenerateAudio).toHaveBeenCalledTimes(1);
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

  it("listModelFieldOptions uses Magnific API-key header for provider-discovered LoRA options", async () => {
    mockDecrypt.mockReturnValue("magnific-test-key");
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "image",
        provider: "magnific",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "style_lora_id",
              options: [],
              optionsSource: {
                type: "provider_api",
                endpoint: "/v1/ai/loras",
                method: "GET",
                itemsPath: "data",
                valueField: "id",
                labelField: "name",
                queryParam: "query",
              },
            },
          ],
        },
      }],
      [{
        providerName: "magnific",
        baseUrl: "https://api.magnific.com",
        apiKeyEncrypted: "encrypted-key",
      }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "lora-style-1", name: "Painterly" },
        ],
      }),
    }));

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      input: {
        modelId: "magnific/mystic",
        fieldKey: "style_lora_id",
        query: "paint",
        limit: 20,
      },
    });

    expect(result.source).toBe("dynamic");
    expect(result.options).toEqual([{ value: "lora-style-1", label: "Painterly" }]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.magnific.com/v1/ai/loras?query=paint",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "x-magnific-api-key": "magnific-test-key",
        }),
      }),
    );
    const [, fetchInit] = (fetch as any).mock.calls[0];
    expect(fetchInit.headers.Authorization).toBeUndefined();
  });

  it("listModelFieldOptions uses ElevenLabs voice search with xi-api-key auth", async () => {
    mockDecrypt.mockReturnValue("elevenlabs-test-key");
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "elevenlabs",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "voice_id",
              options: [
                { value: "21m00Tcm4TlvDq8ikWAM", label: "Rachel" },
              ],
              optionsSource: {
                type: "provider_api",
                endpoint: "/v2/voices?page_size=100&sort=name&sort_direction=asc&include_total_count=false",
                method: "GET",
                itemsPath: "voices",
                valueField: "voice_id",
                labelField: "name",
                previewField: "preview_url",
                queryParam: "search",
              },
            },
          ],
        },
      }],
      [{
        providerName: "elevenlabs",
        baseUrl: "https://api.elevenlabs.io",
        apiKeyEncrypted: "encrypted-key",
      }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        voices: [
          { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", preview_url: "https://cdn.example.com/rachel.mp3" },
          { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
        ],
      }),
    }));

    const fn = mediaRouter.listModelFieldOptions as Function;
    const result = await fn({
      input: {
        modelId: "elevenlabs/text-to-speech",
        fieldKey: "voice_id",
        query: "adam",
        limit: 50,
      },
    });

    expect(result.source).toBe("merged");
    expect(result.options).toEqual([
      { value: "pNInz6obpgDQGcFmaJgB", label: "Adam" },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v2/voices?page_size=100&sort=name&sort_direction=asc&include_total_count=false&search=adam",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "xi-api-key": "elevenlabs-test-key",
        }),
      }),
    );
    const [, fetchInit] = (fetch as any).mock.calls[0];
    expect(fetchInit.headers.Authorization).toBeUndefined();
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
            + 'var CDNBaseAudioUrl = "https://cdn.uvoice.app/";'
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

    expect(result.source).toBe("dynamic");
    expect(result.options).toEqual([
      {
        value: "EN-1",
        label: "en - English Voice 1 (Adult)",
        previewUrl: "https://cdn.uvoice.app/voice-preview/en/voice-1.mp3",
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

  it("listModelFieldOptions includes only live natural UVoice voices for natural model", async () => {
    const db = makeDbWithSequentialSelectResults([
      [{
        modelType: "audio",
        provider: "uvoice",
        isEnabled: true,
        configJson: {
          inputFields: [
            {
              key: "voiceID",
              options: [],
              optionsSource: {
                type: "public_api",
                endpoint: "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Natural&source=API-DOCS",
                itemsPath: "",
                valueField: "voiceID",
                labelField: "displayName",
                previewField: "path",
              },
            },
          ],
        },
      }],
      [{ userPreferences: { translationLanguage: "th" } }],
    ]);
    mockGetDb.mockResolvedValue(db as any);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Natural&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "EN-ThaptimNatural", displayName: "Ruby (Beta)", age: "A" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Natural&source=API-DOCS") {
        return {
          ok: true,
          json: async () => ([
            { voiceID: "TH-KittiNatural", displayName: "กิตติ (Beta)", age: "A", path: "voice-preview/th/kitti_natural.mp3" },
            { voiceID: "TH-NalineeNatural", displayName: "นลินี (Beta)", age: "A", path: "voice-preview/th/nalinee_natural.mp3" },
            { voiceID: "TH-Ai868Natural", displayName: "AI 868 (Beta)", age: "A", path: "voice-preview/th/ai868_natural.mp3" },
          ]),
        } as any;
      }
      if (url === "https://uvoice.app/") {
        return {
          ok: true,
          text: async () => (
            'var apiBaseAudioUrl = "https://hearme.blob.core.windows.net/audiostorage/";'
            + 'var CDNBaseAudioUrl = "https://cdn.uvoice.app/";'
            + 'var storageToken = "?sig=test-token";'
          ),
        } as any;
      }
      return { ok: false, status: 404 } as any;
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
        modelId: "uvoice/tts-natural",
        fieldKey: "voiceID",
        limit: 50,
      },
    });

    expect(result.source).toBe("dynamic");
    expect(result.options).toEqual([
      {
        value: "EN-ThaptimNatural",
        label: "en - Ruby (Beta) (Adult)",
      },
      {
        value: "TH-KittiNatural",
        label: "th - กิตติ (Beta) (Adult)",
        previewUrl: "https://cdn.uvoice.app/voice-preview/th/kitti_natural.mp3",
      },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Natural&source=API-DOCS",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=th&filter=Natural&source=API-DOCS",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Standard&source=API-DOCS",
      expect.anything(),
    );
    expect(fetch).not.toHaveBeenCalledWith(
      "https://uvoice.app/?getVoice=true&lang_selected=en&filter=Premium&source=API-DOCS",
      expect.anything(),
    );
  });

  it("listModelFieldOptions includes only live premium UVoice voices for premium model", async () => {
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
            + 'var CDNBaseAudioUrl = "https://cdn.uvoice.app/";'
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

    expect(result.source).toBe("dynamic");
    expect(result.options).toEqual([
      {
        value: "EN-P1",
        label: "en - English Premium Voice (Adult)",
        previewUrl: "https://cdn.uvoice.app/voice-preview/en/voice-premium.mp3",
      },
      {
        value: "TH-BowkyPremiumHD",
        label: "th - Bowky Premium HD (Adult)",
        previewUrl: "https://cdn.uvoice.app/voice-preview/th/bowky-premium.mp3",
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

  it("generateVideoAsync requires a reference image for WaveSpeed image-to-video models without affecting cinematic", async () => {
    const wavespeedI2vConfig = {
      maxReferenceImages: 4,
      requiresReferenceImages: true,
      inputFields: [
        { key: "image_urls", type: "image_urls", syncWith: "reference_images", required: true, maxItems: 4 },
        { key: "aspect_ratio", type: "select", options: [{ value: "21:9", label: "21:9" }, { value: "16:9", label: "16:9" }] },
        { key: "duration", type: "select", options: [{ value: "5", label: "5s" }] },
      ],
    };
    const fn = mediaRouter.generateVideoAsync as Function;

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 900, configJson: wavespeedI2vConfig }],
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
          model: "bytedance/seedance-2.0/image-to-video",
          duration: 5,
          aspectRatio: "21:9",
        },
      }),
    ).rejects.toMatchObject({
      message: 'The selected model "bytedance/seedance-2.0/image-to-video" requires at least one reference image.',
    });

    mockGetDb.mockResolvedValue(makeDbWithSequentialSelectResults([
      [{ modelType: "video", provider: "wavespeed_ai", isEnabled: true }],
      [{ creditCost: 900, configJson: wavespeedI2vConfig }],
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
          model: "bytedance/seedance-2.0/image-to-video",
          duration: 5,
          aspectRatio: "21:9",
          referenceImageUrls: ["/uploads/reference.png"],
        },
      }),
    ).resolves.toMatchObject({ success: true });
  });
});
