/**
 * media.listTasks — `seriesId` filter coverage (2026-07-05, Vertical Drama
 * project-scoped media panel filter, work item 3a).
 *
 * `seriesId` is optional and backward compatible: omitted entirely, existing
 * callers get the exact same merged/sorted/sliced result as before. When
 * provided, only tasks tagged with a matching `__vd_series_id` (persisted
 * inside `parameters.extra_params` by the VD generation call sites — see
 * `PERSISTED_INTERNAL_EXTRA_PARAM_KEYS` in mediaGenerationService.ts) survive
 * the filter, and `total`/`tasks` reflect the filtered set, not the raw
 * provider-side page.
 *
 * Same "mock the whole module graph, call the exported procedure handler
 * directly" convention as `media.addToLibrary.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockListTasks,
  mockListDeferredMediaTasks,
  mockListHermesMediaTasks,
  mockCreateInternalTokenFromAuth,
  mockDurabilizeMediaTaskHistory,
  mockProjectMediaTaskArtifacts,
} = vi.hoisted(() => ({
  mockListTasks: vi.fn(),
  mockListDeferredMediaTasks: vi.fn().mockResolvedValue([]),
  mockListHermesMediaTasks: vi.fn().mockResolvedValue([]),
  mockCreateInternalTokenFromAuth: vi
    .fn()
    .mockReturnValue("tenant-bound-media-token"),
  mockDurabilizeMediaTaskHistory: vi.fn(
    async ({ tasks }: { tasks: unknown[] }) => tasks
  ),
  mockProjectMediaTaskArtifacts: vi.fn(
    async ({ tasks }: { tasks: unknown[] }) => tasks
  ),
}));

vi.mock("../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    listTasks: mockListTasks,
    getModels: vi.fn().mockReturnValue([]),
    getModel: vi.fn().mockReturnValue(null),
  },
  MEDIA_MODELS: {},
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo-3-1",
    audio: "elevenlabs-tts",
  },
  resolveReferenceUrl: vi.fn((url: string) => url),
}));

vi.mock("../services/deferredMediaRetryService", () => ({
  listDeferredMediaTasks: mockListDeferredMediaTasks,
}));

vi.mock("../services/mcpMediaAdapter", () => ({
  listMcpMediaTasks: vi.fn().mockResolvedValue([]),
  // Other named exports referenced elsewhere in media.ts — stubbed so the
  // module import doesn't throw; unused by listTasks itself.
  submitMcpMediaTask: vi.fn(),
  getMcpMediaTask: vi.fn(),
}));

vi.mock("../services/hermesMediaAdapter", () => ({
  isHermesMediaTaskId: vi.fn().mockReturnValue(false),
  listHermesMediaTasks: mockListHermesMediaTasks,
  reconcileHermesMediaJobFee: vi.fn(),
}));

vi.mock("../services/auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

vi.mock("../services/mediaLibraryService", () => ({
  addMediaTaskToLibrary: vi.fn(),
}));

vi.mock("../services/mediaTaskArtifactService", () => ({
  applyMediaArtifactProjection: vi.fn((task: unknown) => task),
  durabilizeMediaTaskHistory: mockDurabilizeMediaTaskHistory,
  ensureMediaTaskArtifactsForPolling: vi.fn(),
  projectMediaTaskArtifacts: mockProjectMediaTaskArtifacts,
  redactMediaTaskWithoutTenant: vi.fn((value: unknown) => value),
}));

vi.mock("../services/libraryFeatureFlags", () => ({
  isLibraryEnabledForTenant: vi.fn().mockResolvedValue(false),
}));

vi.mock("../services/tenantContext", () => ({
  resolveTenantIdVarchar: vi.fn((ctxTenantId: unknown, userTenantId: unknown) =>
    ctxTenantId || userTenantId || null,
  ),
}));

vi.mock("../db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../drizzle/schema", () => ({
  marketplaceAutoReviewOutboxJobs: {
    userId: "userId",
    status: "status",
    jobType: "jobType",
    payloadJson: "payloadJson",
    createdAt: "createdAt",
    completedAt: "completedAt",
    updatedAt: "updatedAt",
  },
  mediaModels: { modelId: "modelId", creditCost: "creditCost", configJson: "configJson" },
  mediaProviders: {},
  users: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
  sql: Object.assign(vi.fn(), { raw: vi.fn() }),
}));

vi.mock("../services/sandbox/dispatchService", () => ({
  shouldUseSandbox: vi.fn().mockReturnValue(false),
  dispatchToSandbox: vi.fn(),
}));

vi.mock("../services/abuseGuard", () => ({
  checkAbuseGuard: vi.fn(),
  hashPrompt: vi.fn(),
}));

vi.mock("../services/appRuntimeConfig", () => ({
  getAppRuntimeConfig: vi.fn().mockResolvedValue({ pythonBackendUrl: "http://localhost:8000" }),
}));

vi.mock("../services/crypto", () => ({
  decrypt: vi.fn((v: string) => v),
}));

vi.mock("../services/mediaProviderUtils", () => ({
  assertPublicSafeHttpUrl: vi.fn(),
  assertRelativeUploadMediaReferencePath: vi.fn(),
  getAllowedAspectRatiosFromConfig: vi.fn().mockReturnValue([]),
  getAllowedDurationsFromConfig: vi.fn().mockReturnValue([]),
  getReferenceImageLimitFromConfig: vi.fn().mockReturnValue(5),
  isReferenceImageRequiredFromConfig: vi.fn().mockReturnValue(false),
  normalizeMediaProviderName: vi.fn((v: string) => v),
}));

vi.mock("../services/modelRegistry", () => ({
  getAllModelsAsync: vi.fn().mockResolvedValue([]),
  getDefaultModel: vi.fn(),
  getModelMetadata: vi.fn(),
  getModelsByTypeAsync: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/ssrfValidation", () => ({
  validateExtraParamsNoSsrf: vi.fn(),
}));

vi.mock("../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
}));

vi.mock("../services/mcpProviderModelAliases", () => ({
  normalizeMcpProviderModelIdForProvider: vi.fn((v: string) => v),
}));

vi.mock("../services/mediaProviderAssetService", () => ({
  assertMediaProviderAssetsUsable: vi.fn(),
}));

vi.mock("../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn().mockResolvedValue({}),
}));

vi.mock("../services/ageSafeMediaEnforcer", () => ({
  evaluateMediaPrompt: vi.fn(),
}));

vi.mock("../services/safetyActorContextService", () => ({
  buildSafetyActorContext: vi.fn(),
}));

vi.mock("../services/ageSafetyProfileService", () => ({
  getEffectiveSafetyProfileFromPrefs: vi.fn(),
}));

vi.mock("../services/securityPinService", () => ({
  getSecurityPinVersion: vi.fn(),
}));

vi.mock("../services/creditService", () => ({
  deductCredits: vi.fn(),
  hasEnoughCredits: vi.fn().mockResolvedValue(true),
  refundCredits: vi.fn(),
}));

vi.mock("../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn().mockReturnValue(10),
}));

vi.mock("../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn().mockReturnValue(true), getResetTime: vi.fn().mockReturnValue(1000) },
  isLuxTtsModel: vi.fn().mockReturnValue(false),
  checkLuxTtsRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock("../_core/tokens", () => ({
  createInternalTokenFromAuth: mockCreateInternalTokenFromAuth,
}));

vi.mock("../_core/trpc", () => {
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
  };
});

import { mediaRouter, taskMatchesVerticalDramaSeries } from "./media";

function task(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? "task-1",
    taskId: undefined,
    celeryTaskId: undefined,
    userId: "9",
    mediaType: "image",
    status: "completed",
    model: "google-nano-banana-pro",
    prompt: "a prompt",
    parameters: overrides.parameters ?? {},
    resultUrl: overrides.resultUrl ?? "https://cdn.example/img.png",
    resultData: overrides.resultData ?? {},
    errorMessage: undefined,
    creditsUsed: 1,
    creditsBalance: 99,
    createdAt: (overrides.createdAt as string) ?? new Date().toISOString(),
    startedAt: undefined,
    completedAt: (overrides.createdAt as string) ?? new Date().toISOString(),
    ...overrides,
  };
}

const CTX = { user: { id: 9, role: "user" }, userToken: "session-token", tenantId: "tenant-test", publicUrl: undefined };
const NO_TENANT_CTX = { ...CTX, tenantId: null };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("taskMatchesVerticalDramaSeries (pure helper)", () => {
  it("matches a task tagged via parameters.extra_params.__vd_series_id", () => {
    const t = task({ parameters: { extra_params: { __vd_series_id: "10" } } });
    expect(taskMatchesVerticalDramaSeries(t as any, "10")).toBe(true);
  });

  it("does not match a different series id", () => {
    const t = task({ parameters: { extra_params: { __vd_series_id: "10" } } });
    expect(taskMatchesVerticalDramaSeries(t as any, "11")).toBe(false);
  });

  it("does not match an untagged (legacy) task", () => {
    const t = task({ parameters: { aspect_ratio: "9:16" } });
    expect(taskMatchesVerticalDramaSeries(t as any, "10")).toBe(false);
  });

  it("falls back to resultData when parameters carries no tag", () => {
    const t = task({ parameters: {}, resultData: { extra_params: { __vd_series_id: "22" } } });
    expect(taskMatchesVerticalDramaSeries(t as any, "22")).toBe(true);
  });
});

describe("mediaRouter.listTasks — seriesId filter", () => {
  it("starts the provider and deferred history reads concurrently", async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    mockListTasks.mockImplementation(async () => {
      started.push("provider");
      await gate;
      return { tasks: [], total: 0, limit: 50, offset: 0 };
    });
    mockListDeferredMediaTasks.mockImplementation(async () => {
      started.push("deferred");
      await gate;
      return [];
    });

    const fn = mediaRouter.listTasks as Function;
    const pending = fn({ ctx: CTX, input: { limit: 50 } });
    await Promise.resolve();

    expect(started).toEqual(["provider", "deferred"]);
    release();
    await pending;
  });

  it("hydrates completed tasks before projecting history playback URLs", async () => {
    const completed = task({ id: "completed-without-artifact-row" });
    const durable = {
      ...completed,
      resultUrl: "/api/storage/files/media-studio/tenant-test/9/image/task.png",
      artifacts: [
        {
          outputIndex: 0,
          r2Status: "ready",
          r2Url: "/api/storage/files/media-studio/tenant-test/9/image/task.png",
        },
      ],
    };
    mockListTasks.mockResolvedValue({ tasks: [completed], total: 1 });
    mockDurabilizeMediaTaskHistory.mockResolvedValueOnce([durable]);
    mockProjectMediaTaskArtifacts.mockImplementationOnce(
      async ({ tasks }: { tasks: unknown[] }) => tasks
    );

    const fn = mediaRouter.listTasks as Function;
    const result = await fn({
      ctx: CTX,
      input: { mediaType: "image", status: "completed" },
    });

    expect(mockDurabilizeMediaTaskHistory).toHaveBeenCalledWith({
      tasks: [completed],
      tenantId: "tenant-test",
      userId: 9,
    });
    expect(result.tasks[0]).toMatchObject({
      resultUrl: "/api/storage/files/media-studio/tenant-test/9/image/task.png",
      artifacts: [{ r2Status: "ready" }],
    });
  });

  it("is fully backward compatible when seriesId is omitted", async () => {
    const createdAt = "2026-07-20T09:00:00.000Z";
    mockListTasks.mockResolvedValue({
      tasks: [task({ id: "a", createdAt }), task({ id: "b", createdAt })],
      total: 2,
      limit: 50,
      offset: 0,
    });

    const fn = mediaRouter.listTasks as Function;
    const result = await fn({ ctx: CTX, input: { mediaType: "image", status: "completed" } });

    expect(result.tasks.map((t: any) => t.id)).toEqual(["a", "b"]);
    expect(result.total).toBe(2);
    // No over-fetch multiplier applied when seriesId is absent.
    expect(mockListTasks).toHaveBeenCalledWith(
      "tenant-bound-media-token",
      expect.objectContaining({ limit: 50 }),
    );
  });

  it("rejects task history before calling Python when tenant context is missing", async () => {
    const fn = mediaRouter.listTasks as Function;

    await expect(fn({ ctx: NO_TENANT_CTX, input: { limit: 50 } })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Tenant context is required for generated media",
    });
    expect(mockListTasks).not.toHaveBeenCalled();
  });

  it("binds request tenant context into the media backend token", async () => {
    mockListTasks.mockResolvedValue({
      tasks: [],
      total: 0,
      limit: 50,
      offset: 0,
    });

    const fn = mediaRouter.listTasks as Function;
    await fn({
      ctx: {
        ...CTX,
        userToken: "session-token-without-tenant",
        tenantId: "tenant-ZCSKEM9s",
      },
      input: { limit: 50 },
    });

    expect(mockCreateInternalTokenFromAuth).toHaveBeenCalledWith(
      { userId: 9, tenantId: "tenant-ZCSKEM9s" },
      ["media:generate"],
    );
    expect(mockListTasks).toHaveBeenCalledWith(
      "tenant-bound-media-token",
      expect.objectContaining({ limit: 50 }),
    );
  });

  it("merges Hermes image/video jobs into Media History and total", async () => {
    mockListTasks.mockResolvedValue({
      tasks: [task({ id: "provider-task", createdAt: "2026-07-20T09:00:00.000Z" })],
      total: 1,
      limit: 50,
      offset: 0,
    });
    mockListHermesMediaTasks.mockResolvedValue([
      task({
        id: "hermes_job-1",
        model: "grok-imagine-image",
        createdAt: "2026-07-20T10:00:00.000Z",
      }),
      task({
        id: "hermes_job-2",
        mediaType: "video",
        model: "grok-imagine-video",
        createdAt: "2026-07-20T08:00:00.000Z",
      }),
    ]);

    const fn = mediaRouter.listTasks as Function;
    const result = await fn({ ctx: CTX, input: { limit: 50, daysAgo: 12 } });

    expect(result.tasks.map((entry: any) => entry.id)).toEqual([
      "hermes_job-1",
      "provider-task",
      "hermes_job-2",
    ]);
    expect(result.total).toBe(3);
    expect(mockListHermesMediaTasks).toHaveBeenCalledWith({
      userId: 9,
      tenantId: "tenant-test",
      mediaType: undefined,
      status: undefined,
      limit: 50,
      daysAgo: 12,
    });
  });

  it("returns only tasks tagged with the requested seriesId", async () => {
    mockListTasks.mockResolvedValue({
      tasks: [
        task({ id: "tagged-10", parameters: { extra_params: { __vd_series_id: "10" } } }),
        task({ id: "tagged-11", parameters: { extra_params: { __vd_series_id: "11" } } }),
        task({ id: "untagged", parameters: {} }),
      ],
      total: 3,
      limit: 50,
      offset: 0,
    });

    const fn = mediaRouter.listTasks as Function;
    const result = await fn({
      ctx: CTX,
      input: { mediaType: "image", status: "completed", seriesId: "10" },
    });

    expect(result.tasks.map((t: any) => t.id)).toEqual(["tagged-10"]);
    expect(result.total).toBe(1);
  });

  it("over-fetches (raises the internal page size) when seriesId is provided", async () => {
    mockListTasks.mockResolvedValue({ tasks: [], total: 0, limit: 50, offset: 0 });

    const fn = mediaRouter.listTasks as Function;
    await fn({
      ctx: CTX,
      input: { mediaType: "image", status: "completed", limit: 24, seriesId: "10" },
    });

    const callArgs = mockListTasks.mock.calls[0][1];
    expect(callArgs.limit).toBeGreaterThan(24);
    expect(callArgs.limit).toBeLessThanOrEqual(100);
  });

  it("slices the filtered result to the caller's requested limit", async () => {
    const tagged = Array.from({ length: 5 }, (_, i) =>
      task({
        id: `tagged-${i}`,
        parameters: { extra_params: { __vd_series_id: "10" } },
        createdAt: new Date(2026, 0, i + 1).toISOString(),
      }),
    );
    mockListTasks.mockResolvedValue({ tasks: tagged, total: 5, limit: 50, offset: 0 });

    const fn = mediaRouter.listTasks as Function;
    const result = await fn({
      ctx: CTX,
      input: { mediaType: "image", status: "completed", limit: 2, seriesId: "10" },
    });

    expect(result.tasks).toHaveLength(2);
    expect(result.total).toBe(5);
  });
});
