import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGenerateImage,
  mockCalculateCreditCost,
  mockDeductCredits,
  mockHasEnoughCredits,
  mockGetDb,
  mockCheckAbuseGuard,
} = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
  mockCalculateCreditCost: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockGetDb: vi.fn(),
  mockCheckAbuseGuard: vi.fn(),
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImage: mockGenerateImage,
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
    mockCheckAbuseGuard.mockResolvedValue({ allowed: true, reason: "", retryAfter: 0 });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockCalculateCreditCost.mockReturnValue(22);
    mockGenerateImage.mockResolvedValue({
      success: true,
      taskId: "task-1",
      status: "completed",
      model: "db-only-image-model",
      provider: "kie.ai",
      creditsUsed: 22,
      data: [{ url: "https://example.com/img.png" }],
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
      [{ modelId: "db-default-image" }],
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
});
