/**
 * Feature 135 — Hermes Grok media worker (section 09): `media.ts`'s
 * three-way branch coverage for `generateImageAsync`/`generateVideoAsync` —
 * a Hermes-transport model (or an explicit `transport: "hermes_worker"`)
 * routes into `queueHermesMediaJob` instead of the gateway_api/MCP paths,
 * with no upfront `hasEnoughCredits`/`deductCredits` (credit source is
 * `provider_account`, section-05's job).
 *
 * Same "mock the whole module graph" convention as
 * `media.db-first.contract.test.ts` (this file's own `makeDbWithSequentialSelectResults`
 * helper is copied verbatim) — `generateImageAsync`/`generateVideoAsync`'s
 * hermes branch additionally dynamically imports
 * `resolveVdCharacterMediaTransportDecision` from `verticalDramaCharacters.ts`,
 * which pulls that router's own module graph in too (mocked here the same
 * way `verticalDramaLocations.test.ts` / `verticalDramaSeries.adBanner.test.ts`
 * already do for the identical reuse).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGenerateImage,
  mockGenerateVideoAsync,
  mockCalculateCreditCost,
  mockDeductCredits,
  mockHasEnoughCredits,
  mockGetDb,
  mockCheckAbuseGuard,
  mockHashPrompt,
  mockResolveMediaTransport,
  mockSubmitMcpMediaGeneration,
  mockQueueHermesMediaJob,
  mockBuildHermesMediaReferences,
  mockResolveHermesReferenceAssetIdFromUrl,
} = vi.hoisted(() => ({
  mockGenerateImage: vi.fn(),
  mockGenerateVideoAsync: vi.fn(),
  mockCalculateCreditCost: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockHasEnoughCredits: vi.fn(),
  mockGetDb: vi.fn(),
  mockCheckAbuseGuard: vi.fn(),
  mockHashPrompt: vi.fn((text: string, serialized: string) => `${text}::${serialized}`),
  mockResolveMediaTransport: vi.fn(),
  mockSubmitMcpMediaGeneration: vi.fn(),
  mockQueueHermesMediaJob: vi.fn(),
  mockBuildHermesMediaReferences: vi.fn(async () => []),
  mockResolveHermesReferenceAssetIdFromUrl: vi.fn(async () => null),
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImage: mockGenerateImage,
    generateImageAsync: mockGenerateImage,
    generateVideoAsync: mockGenerateVideoAsync,
    getModels: vi.fn().mockReturnValue([]),
    getModel: vi.fn().mockReturnValue(null),
  },
  MEDIA_MODELS: {},
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
  users: { id: "id", userPreferences: "userPreferences" },
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
  decrypt: vi.fn(),
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

vi.mock("../../services/appRuntimeConfig", () => ({
  getAppRuntimeConfig: vi.fn().mockResolvedValue({ pythonBackendUrl: "http://localhost:8000" }),
}));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
    // `verticalDramaCharacters.ts` (pulled in dynamically by the hermes
    // branch's `resolveVdCharacterMediaTransportDecision` import) builds its
    // own base procedure at module-load time via
    // `protectedProcedure.use(requireFeatureFlag(...))`, which internally
    // calls `middleware(...)` — needs a pass-through export here too.
    middleware: (fn: Function) => fn,
  };
});

// Feature 135 — the hermes branch dynamically imports
// `resolveVdCharacterMediaTransportDecision` from `verticalDramaCharacters.ts`,
// pulling that router's ENTIRE static module graph in too — mocked wholesale
// the same way `verticalDramaLocations.test.ts`/`verticalDramaSeries.adBanner.test.ts`
// already do for the identical reuse.
vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  readPresetVisualIdentityFromBible: vi.fn(() => undefined),
  generateCharacterVisualPrompts: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  resolveFaceSourceReferenceForCharacter: vi.fn(),
}));
vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(async () => ({
    ageSafetyPolicyEnabled: false,
    ageSafetyMediaEnforcementEnabled: false,
    hermesMediaWorker: true,
  })),
}));
vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(async () => []),
  isDbModelCatalogLoaded: () => true,
  getAllModelsAsync: vi.fn(async () => []),
  getDefaultModel: vi.fn(() => undefined),
  getModelMetadata: vi.fn(() => undefined),
  getStaticModelById: vi.fn(() => undefined),
  refreshModelCache: vi.fn(),
  mapToApiModelId: vi.fn((id: string) => id),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: vi.fn(),
    getReferenceImageUrlByAssetLinkId: vi.fn(),
  },
  VerticalDramaCharacterStockError: class extends Error {
    constructor(public readonly reason: string, message: string) {
      super(message);
    }
  },
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE: "policy-rejected",
}));

vi.mock("../../services/hermesMediaScheduler", () => ({
  queueHermesMediaJob: mockQueueHermesMediaJob,
}));
vi.mock("../../services/hermesMediaReferences", () => ({
  buildHermesMediaReferences: mockBuildHermesMediaReferences,
  buildHermesMediaTaskEnvelope: (params: {
    taskId: string;
    userId: number;
    mediaType: string;
    model: string;
    prompt: string;
    extraParams?: Record<string, unknown>;
  }) => ({
    id: params.taskId,
    userId: String(params.userId),
    mediaType: params.mediaType,
    status: "pending",
    model: params.model,
    prompt: params.prompt,
    creditsUsed: 0,
    createdAt: new Date().toISOString(),
  }),
  resolveHermesReferenceAssetIdFromUrl: mockResolveHermesReferenceAssetIdFromUrl,
}));
vi.mock("../../services/hermesConnectionService", () => ({
  getHermesConnection: vi.fn(async () => ({ capabilities: null })),
  listHermesConnections: vi.fn(async () => []),
}));

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

function ctx() {
  return {
    user: { id: 123, role: "user", currentTenantId: 1 },
    userToken: "user-token",
    tenantId: 1,
    publicUrl: "https://tenant.example.com",
  };
}

describe("media router — hermes_worker three-way branch (section 09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckAbuseGuard.mockResolvedValue({ allowed: true, reason: "", retryAfter: 0 });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockCalculateCreditCost.mockReturnValue(0);
    mockQueueHermesMediaJob.mockResolvedValue({ created: true, taskId: "hermes_task-1", job: {} });
  });

  describe("generateImageAsync", () => {
    it("routes a Hermes-transport model into queueHermesMediaJob, returns a MediaTask-shaped envelope, and never deducts platform credits", async () => {
      const db = makeDbWithSequentialSelectResults([
        [{ modelType: "image", provider: "hermes-grok", isEnabled: true }],
        [
          {
            creditCost: 0,
            configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-image" } },
          },
        ],
      ]);
      mockGetDb.mockResolvedValue(db as any);

      const fn = mediaRouter.generateImageAsync as Function;
      const result = await fn({
        ctx: ctx(),
        input: {
          prompt: "a hermes-routed prompt",
          model: "hermes-grok/grok-imagine-image",
          hermesConnectionId: "hermes-conn-1",
        },
      });

      expect(mockGenerateImage).not.toHaveBeenCalled();
      expect(mockSubmitMcpMediaGeneration).not.toHaveBeenCalled();
      expect(mockQueueHermesMediaJob).toHaveBeenCalledTimes(1);
      expect(mockQueueHermesMediaJob).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "image.generate",
          connectionId: "hermes-conn-1",
          tenantId: "tenant-1",
          requestedByUserId: 123,
        }),
      );
      expect(result.id).toBe("hermes_task-1");
      expect(result.status).toBe("pending");
      expect(mockHasEnoughCredits).not.toHaveBeenCalled();
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });

    it("rejects a raw external reference URL for hermes with BAD_REQUEST (library-backed assets only)", async () => {
      const db = makeDbWithSequentialSelectResults([
        [{ modelType: "image", provider: "hermes-grok", isEnabled: true }],
        [{ creditCost: 0, configJson: { transport: "hermes_worker" } }],
      ]);
      mockGetDb.mockResolvedValue(db as any);
      mockResolveHermesReferenceAssetIdFromUrl.mockResolvedValue(null);

      const fn = mediaRouter.generateImageAsync as Function;
      await expect(
        fn({
          ctx: ctx(),
          input: {
            prompt: "a hermes-routed prompt",
            model: "hermes-grok/grok-imagine-image",
            hermesConnectionId: "hermes-conn-1",
            referenceImageUrls: ["https://external.example.com/not-owned.png"],
          },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockQueueHermesMediaJob).not.toHaveBeenCalled();
    });

    it("throws BAD_REQUEST when hermesConnectionId is supplied for a non-hermes resolved transport", async () => {
      const db = makeDbWithSequentialSelectResults([
        [{ modelType: "image", provider: "kie.ai", isEnabled: true }],
        [{ creditCost: 10, configJson: null }],
      ]);
      mockGetDb.mockResolvedValue(db as any);

      const fn = mediaRouter.generateImageAsync as Function;
      await expect(
        fn({
          ctx: ctx(),
          input: {
            prompt: "a gateway prompt",
            model: "google-nano-banana-pro",
            hermesConnectionId: "hermes-conn-1",
          },
        }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(mockQueueHermesMediaJob).not.toHaveBeenCalled();
    });

    it("regression: an ordinary gateway_api model is unaffected (byte-identical)", async () => {
      const db = makeDbWithSequentialSelectResults([
        [{ modelType: "image", provider: "kie.ai", isEnabled: true }],
        [{ creditCost: 10, configJson: null }],
      ]);
      mockGetDb.mockResolvedValue(db as any);
      mockCalculateCreditCost.mockReturnValue(10);
      mockGenerateImage.mockResolvedValue({ id: "task-gw", status: "completed" } as any);

      const fn = mediaRouter.generateImageAsync as Function;
      const result = await fn({
        ctx: ctx(),
        input: { prompt: "a gateway prompt", model: "google-nano-banana-pro" },
      });

      expect(mockQueueHermesMediaJob).not.toHaveBeenCalled();
      expect(mockDeductCredits).toHaveBeenCalledTimes(1);
      expect(result.id).toBe("task-gw");
    });
  });

  describe("generateVideoAsync", () => {
    it("routes a Hermes-transport video model into queueHermesMediaJob (operation video.generate — no start image)", async () => {
      const db = makeDbWithSequentialSelectResults([
        [{ modelType: "video", provider: "hermes-grok", isEnabled: true }],
        [
          {
            creditCost: 0,
            configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-video" } },
          },
        ],
      ]);
      mockGetDb.mockResolvedValue(db as any);

      const fn = mediaRouter.generateVideoAsync as Function;
      const result = await fn({
        ctx: ctx(),
        input: {
          prompt: "a hermes-routed video prompt",
          model: "hermes-grok/grok-imagine-video",
          hermesConnectionId: "hermes-conn-1",
        },
      });

      expect(mockGenerateVideoAsync).not.toHaveBeenCalled();
      expect(mockQueueHermesMediaJob).toHaveBeenCalledTimes(1);
      expect(mockQueueHermesMediaJob).toHaveBeenCalledWith(
        expect.objectContaining({ operation: "video.generate", connectionId: "hermes-conn-1" }),
      );
      expect(result.id).toBe("hermes_task-1");
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });

    it("regression: an ordinary gateway_api video model is unaffected (byte-identical)", async () => {
      const db = makeDbWithSequentialSelectResults([
        [{ modelType: "video", provider: "kie.ai", isEnabled: true }],
        [{ creditCost: 50, configJson: null }],
      ]);
      mockGetDb.mockResolvedValue(db as any);
      mockCalculateCreditCost.mockReturnValue(50);
      mockGenerateVideoAsync.mockResolvedValue({ id: "task-video-gw", status: "completed" } as any);

      const fn = mediaRouter.generateVideoAsync as Function;
      const result = await fn({
        ctx: ctx(),
        input: { prompt: "a gateway video prompt", model: "veo-3-1" },
      });

      expect(mockQueueHermesMediaJob).not.toHaveBeenCalled();
      expect(result.id).toBe("task-video-gw");
    });
  });
});
