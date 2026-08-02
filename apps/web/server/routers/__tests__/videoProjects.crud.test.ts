/**
 * Feature 133 (Video Intelligence Platform), section-07 — `videoProjects`
 * router CRUD + optimistic concurrency + narration stage tests. Same
 * "mock everything to a minimal shape purely so the module can be imported"
 * convention as `verticalDramaEpisodes.textOverlayPlan.test.ts`:
 * `vi.mock("../../_core/trpc")` collapses `protectedProcedure.use().query(fn)`
 * to `fn` directly; `requireFeatureFlag`/`getTenantFeatureFlags` are stubbed
 * so the router's OWN manual `assertVideoIntelligenceEnabled` guard is what
 * the flag-off test actually exercises.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../_core/rateLimitedProcedure", () => ({
  createRateLimitMiddleware: () => (x: unknown) => x,
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: { createTrace: vi.fn(() => "trace-1"), log: vi.fn() },
}));

vi.mock("../../_core/logger", () => ({ debugError: vi.fn(), debugLog: vi.fn() }));

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../db", () => ({ db: mockDb }));

const {
  mockInsertVideoProject,
  mockGetVideoProject,
  mockListVideoProjects,
  mockSaveVideoProjectDocument,
  mockListVideoProjectRevisions,
  mockRestoreVideoProjectRevision,
  mockUpdateVideoProjectFields,
  mockDeleteVideoProject,
  mockInsertBrandKit,
  mockGetBrandKit,
  mockListBrandKits,
  mockUpdateBrandKit,
  mockDeleteBrandKit,
} = vi.hoisted(() => ({
  mockInsertVideoProject: vi.fn(),
  mockGetVideoProject: vi.fn(),
  mockListVideoProjects: vi.fn(),
  mockSaveVideoProjectDocument: vi.fn(),
  mockListVideoProjectRevisions: vi.fn(),
  mockRestoreVideoProjectRevision: vi.fn(),
  mockUpdateVideoProjectFields: vi.fn(),
  mockDeleteVideoProject: vi.fn(),
  mockInsertBrandKit: vi.fn(),
  mockGetBrandKit: vi.fn(),
  mockListBrandKits: vi.fn(),
  mockUpdateBrandKit: vi.fn(),
  mockDeleteBrandKit: vi.fn(),
}));

const { MockVideoProjectRevisionConflictError, MockVideoProjectNotFoundError } = vi.hoisted(() => {
  class VideoProjectRevisionConflictErrorImpl extends Error {
    code = "VIDEO_PROJECT_REVISION_CONFLICT";
    projectId: number;
    expectedRevision: number;
    actualRevision: number;
    constructor(projectId: number, expectedRevision: number, actualRevision: number) {
      super(`VIDEO_PROJECT_REVISION_CONFLICT: project ${projectId}`);
      this.name = "VideoProjectRevisionConflictError";
      this.projectId = projectId;
      this.expectedRevision = expectedRevision;
      this.actualRevision = actualRevision;
    }
  }
  class VideoProjectNotFoundErrorImpl extends Error {
    code = "VIDEO_PROJECT_NOT_FOUND";
    constructor(message: string) {
      super(message);
      this.name = "VideoProjectNotFoundError";
    }
  }
  return {
    MockVideoProjectRevisionConflictError: VideoProjectRevisionConflictErrorImpl,
    MockVideoProjectNotFoundError: VideoProjectNotFoundErrorImpl,
  };
});

vi.mock("../../services/videoProjectRepo", () => ({
  insertVideoProject: mockInsertVideoProject,
  getVideoProject: mockGetVideoProject,
  listVideoProjects: mockListVideoProjects,
  saveVideoProjectDocument: mockSaveVideoProjectDocument,
  listVideoProjectRevisions: mockListVideoProjectRevisions,
  restoreVideoProjectRevision: mockRestoreVideoProjectRevision,
  updateVideoProjectFields: mockUpdateVideoProjectFields,
  deleteVideoProject: mockDeleteVideoProject,
  insertBrandKit: mockInsertBrandKit,
  getBrandKit: mockGetBrandKit,
  listBrandKits: mockListBrandKits,
  updateBrandKit: mockUpdateBrandKit,
  deleteBrandKit: mockDeleteBrandKit,
  // Feature 142, section-04 (additive) — this file doesn't exercise the QA
  // ledger append, but the router imports it, so the mock factory must
  // still export it.
  appendQaLedgerEntry: vi.fn(() => Promise.resolve({ entryCount: 1, totalCount: 1 })),
  VideoProjectRevisionConflictError: MockVideoProjectRevisionConflictError,
  VideoProjectNotFoundError: MockVideoProjectNotFoundError,
}));

const { mockCompileVideoProject, MockVideoProjectCompileError } = vi.hoisted(() => {
  class VideoProjectCompileErrorImpl extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "VideoProjectCompileError";
      this.code = code;
    }
  }
  return { mockCompileVideoProject: vi.fn(), MockVideoProjectCompileError: VideoProjectCompileErrorImpl };
});
vi.mock("../../services/videoProjectCompiler", () => ({
  compileVideoProject: mockCompileVideoProject,
  estimateRenderCost: vi.fn(() => ({ score: 0, cls: "low", recommendPreRender: false })),
  VideoProjectCompileError: MockVideoProjectCompileError,
  BrandLockViolationError: class BrandLockViolationError extends Error {
    constructor(token: string, expected: string, actual: string) {
      super(`Brand lock violation: ${token}`);
      this.name = "BrandLockViolationError";
    }
  },
}));

vi.mock("../../remotion/templates", () => ({ MOTION_TEMPLATE_REGISTRY: {} }));

const { mockResolveProjectAssets, mockBuildAssetManifest, mockAssertSceneLayerAssetUrlsAllowed } = vi.hoisted(() => ({
  mockResolveProjectAssets: vi.fn(),
  mockBuildAssetManifest: vi.fn(),
  // F133-01 checkpoint 1: no-op by default (real allowlist logic is unit
  // tested directly in `videoProjectAssetResolver.test.ts`) — the tests
  // below that exercise the SSRF fix make this throw to prove the router
  // WIRES the checkpoint in and maps the error correctly.
  mockAssertSceneLayerAssetUrlsAllowed: vi.fn(),
}));
vi.mock("../../services/videoProjectAssetResolver", () => ({
  resolveProjectAssets: mockResolveProjectAssets,
  buildAssetManifest: mockBuildAssetManifest,
  fallbackAssetSourceHash: vi.fn((url: string) => `${url}-hash-fallback`),
  mergeAssetManifests: vi.fn((manifests: Array<{ sources: unknown[] }>) => ({
    sources: manifests.flatMap(m => m.sources),
  })),
  assertSceneLayerAssetUrlsAllowed: mockAssertSceneLayerAssetUrlsAllowed,
}));

const { mockQueueRemotionRenderVideoJob } = vi.hoisted(() => ({
  mockQueueRemotionRenderVideoJob: vi.fn(),
}));
vi.mock("../../services/workerSchedulerService", () => ({
  queueRemotionRenderVideoJob: mockQueueRemotionRenderVideoJob,
}));

const {
  mockDispatchLaneARemotionRenderJob,
  mockEnqueueVideoIntelligenceJob,
  mockGetGenerationJobStatus,
  mockGetActiveGenerationJob,
} = vi.hoisted(() => ({
  mockDispatchLaneARemotionRenderJob: vi.fn(() => Promise.resolve()),
  mockEnqueueVideoIntelligenceJob: vi.fn(),
  mockGetGenerationJobStatus: vi.fn(),
  mockGetActiveGenerationJob: vi.fn(),
}));
vi.mock("../../services/videoIntelligenceJobs", () => ({
  dispatchLaneARemotionRenderJob: mockDispatchLaneARemotionRenderJob,
  enqueueVideoIntelligenceJob: mockEnqueueVideoIntelligenceJob,
  getGenerationJobStatus: mockGetGenerationJobStatus,
  getActiveGenerationJob: mockGetActiveGenerationJob,
}));

const { mockValidateProjectClaims } = vi.hoisted(() => ({ mockValidateProjectClaims: vi.fn() }));
vi.mock("../../services/validateProjectClaims", () => ({
  validateProjectClaims: mockValidateProjectClaims,
}));

vi.mock("../../services/videoProjectQualityMetrics", () => ({
  computeQualityMetrics: vi.fn(() => ({
    sceneDurations: [],
    captionCps: [],
    layerCounts: { perScene: [], total: 0, maxLayersPerScene: 0 },
    safeAreaViolations: [],
    claimCoverage: { coverage: 1, mappedCount: 0, unmappedCount: 0, prohibitedCount: 0 },
    renderCost: { score: 0, cls: "low", recommendPreRender: false },
  })),
  // Feature 142, section-04 (additive) — real formula so this file's
  // behaviour is unaffected either way; the router imports this export.
  estimateVideoProjectQualityLoopCredits: vi.fn(
    (perRound: number, maxRounds: number) => Math.max(0, perRound) * Math.max(1, Math.trunc(maxRounds)),
  ),
}));

const { mockSynthesize, mockCalculateTTSCredits } = vi.hoisted(() => ({
  mockSynthesize: vi.fn(),
  mockCalculateTTSCredits: vi.fn(() => 5),
}));
vi.mock("../../services/ttsService", () => ({
  synthesize: mockSynthesize,
  calculateTTSCredits: mockCalculateTTSCredits,
}));

const { mockHasEnoughCredits, mockDeductCredits } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(() => Promise.resolve(true)),
  mockDeductCredits: vi.fn(() => Promise.resolve({})),
}));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  // Feature 142, section-04 (additive) — this file doesn't exercise
  // getStageEstimate/dispatch pricing, but the router imports it.
  calculateCreditsForLLMDynamic: vi.fn(() => Promise.resolve(1)),
}));

const { mockStoragePut } = vi.hoisted(() => ({ mockStoragePut: vi.fn() }));
vi.mock("../../storage", () => ({ storagePut: mockStoragePut }));

vi.mock("../../services/hyperframesTranscriptionService", () => ({
  renderTranscriptCuesAsSrt: vi.fn(() => "SRT"),
  renderTranscriptCuesAsVtt: vi.fn(() => "VTT"),
}));

vi.mock("../../services/marketplaceInsightService", () => ({
  listMarketplaceInsightsByProduct: vi.fn(() => Promise.resolve([])),
}));

// Feature 142, section-04 (additive) — newly imported by the router; this
// file doesn't exercise the LLM-backed stages, so simple default doubles.
vi.mock("../../services/videoIntelligenceModelResolver", () => ({
  resolveStructuredStageModelSelection: vi.fn(() =>
    Promise.resolve({
      modelId: "model-a",
      source: "recommended",
      pricingInputPerMTokUsd: 1,
      pricingOutputPerMTokUsd: 2,
      isFree: false,
    }),
  ),
  assertStructuredStageModelAvailable: vi.fn(() => Promise.resolve()),
  VideoIntelligenceModelError: class VideoIntelligenceModelError extends Error {
    code = "VI_NO_RECOMMENDED_MODEL";
  },
}));
vi.mock("../../services/videoProjectReviewAdapter", () => ({
  makeRunReview: vi.fn(),
  buildDocumentSummary: vi.fn(() => ({ topic: null })),
}));
vi.mock("../../services/videoProjectQualityLoop", () => ({
  runVideoProjectQualityLoop: vi.fn(),
  clampQualityLoopRounds: vi.fn((maxLoops: number) => Math.min(Math.max(1, Math.trunc(maxLoops)), 5)),
}));
// Feature 142, section-05 (additive) — newly imported by the router; this
// file doesn't exercise the scene-plan stage, so a simple default double
// (mirrors the videoProjectReviewAdapter mock above).
vi.mock("../../services/videoProjectScenePlanAdapter", () => ({
  makeRunPlanSkill: vi.fn(),
}));
// Feature 142, section-06 (additive) — newly imported by the router; this
// file doesn't exercise the quality_repair stage, so a simple default
// double (mirrors the mocks above) keeps the real LLM/DB-touching modules
// out of this file's import graph.
vi.mock("../../services/videoProjectRepairApplier", () => ({
  createRepairRoundSession: vi.fn(),
  assertReviewRevisionCurrent: vi.fn(),
}));
vi.mock("../../services/videoProjectRepairRewriter", () => ({
  makeRepairEffects: vi.fn(),
}));

import { videoProjectsRouter, deriveCaptionCues, buildCaptionLinesForRender } from "../videoProjects";
import type { VideoProjectDocument } from "../../../shared/videoIntelligence/projectSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const router = videoProjectsRouter as unknown as Record<string, any>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role?: string } | null }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    ...overrides,
  };
}

function baseDocument(overrides: Partial<VideoProjectDocument> = {}): VideoProjectDocument {
  return {
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    content: { language: "th", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [
      {
        sceneId: "scene-1",
        startMs: 0,
        endMs: 5000,
        narration: "สวัสดีครับ ยินดีต้อนรับสู่สินค้าใหม่ของเรา",
        narrationAudioAssetId: null,
        visual: { kind: "layers" },
        layers: [],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [],
      },
    ],
    audioTracks: [],
    captions: { presetId: "no_subtitle_style", burnIn: false, language: "th" },
    claims: [],
    qa: { targetScore: 7, maxLoops: 1 },
    ...overrides,
  } as VideoProjectDocument;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({
    videoIntelligencePlatformEnabled: true,
    videoIntelligenceCatalogStudioEnabled: true,
    videoIntelligenceMotionStudioEnabled: true,
  });
  mockHasEnoughCredits.mockResolvedValue(true);
});

/* -------------------------------------------------------------------------- */
/* 2.1 CRUD + optimistic concurrency                                          */
/* -------------------------------------------------------------------------- */

describe("videoProjects CRUD", () => {
  it("create/get/list are tenant+owner scoped", async () => {
    mockInsertVideoProject.mockResolvedValueOnce({ id: 1, revision: 1 });
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document: null });
    mockListVideoProjects.mockResolvedValueOnce([]);

    await router.create({ ctx: ctx(), input: { studioType: "motion", name: "My project" } });
    expect(mockInsertVideoProject).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      expect.objectContaining({ name: "My project", sourceRefs: null }),
    );

    await router.get({ ctx: ctx(), input: { projectId: 1 } });
    expect(mockGetVideoProject).toHaveBeenCalledWith({ tenantId: "tenant-1", userId: 42 }, 1);

    await router.list({ ctx: ctx(), input: undefined });
    expect(mockListVideoProjects).toHaveBeenCalledWith({ tenantId: "tenant-1", userId: 42 }, undefined);
  });

  it("F133-03/FE02 fix: rejects creating a catalog-studio project when videoIntelligenceCatalogStudioEnabled is off, even though the master F133A flag is on", async () => {
    // Persistent (not `Once`) override — `create` reads the tenant flags
    // TWICE (`assertVideoIntelligenceEnabled` then `assertStudioTypeEnabled`),
    // so a `mockResolvedValueOnce` would only cover the first call.
    mockGetTenantFeatureFlags.mockResolvedValue({
      videoIntelligencePlatformEnabled: true,
      videoIntelligenceCatalogStudioEnabled: false,
      videoIntelligenceMotionStudioEnabled: true,
    });

    await expect(
      router.create({
        ctx: ctx(),
        input: { studioType: "catalog", name: "Catalog project" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockInsertVideoProject).not.toHaveBeenCalled();
  });

  it("F133-03/FE02 fix: rejects creating a motion-studio project when videoIntelligenceMotionStudioEnabled is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      videoIntelligencePlatformEnabled: true,
      videoIntelligenceCatalogStudioEnabled: true,
      videoIntelligenceMotionStudioEnabled: false,
    });

    await expect(
      router.create({
        ctx: ctx(),
        input: { studioType: "motion", name: "Motion project" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockInsertVideoProject).not.toHaveBeenCalled();
  });

  it("create wires sourceRefs.productIds through to insertVideoProject (implementation-progress.md gap #1)", async () => {
    mockInsertVideoProject.mockResolvedValueOnce({ id: 2, revision: 1 });

    await router.create({
      ctx: ctx(),
      input: {
        studioType: "catalog",
        name: "Catalog project",
        sourceRefs: { productIds: ["prod-1"] },
      },
    });

    expect(mockInsertVideoProject).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      expect.objectContaining({ sourceRefs: { productIds: ["prod-1"] } }),
    );
  });

  it("saveDocument rejects a stale baseRevision with CONFLICT", async () => {
    mockSaveVideoProjectDocument.mockRejectedValueOnce(
      new MockVideoProjectRevisionConflictError(1, 1, 2),
    );

    await expect(
      router.saveDocument({
        ctx: ctx(),
        input: { projectId: 1, baseRevision: 1, document: baseDocument() },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("saveDocument bumps revision and writes a revision row", async () => {
    mockSaveVideoProjectDocument.mockResolvedValueOnce({ revision: 2 });
    const document = baseDocument();

    const result = await router.saveDocument({
      ctx: ctx(),
      input: { projectId: 1, baseRevision: 1, document },
    });

    expect(mockSaveVideoProjectDocument).toHaveBeenCalledTimes(1);
    expect(mockSaveVideoProjectDocument).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42 },
      expect.objectContaining({ id: 1, baseRevision: 1, reason: "saveDocument" }),
    );
    expect(result).toEqual({ revision: 2 });
  });

  it("F133-01 checkpoint 1 fix: saveDocument rejects a document that fails the §17.3 SSRF layer-src allowlist (VI_DOCUMENT_INVALID), before ever persisting it", async () => {
    mockAssertSceneLayerAssetUrlsAllowed.mockImplementationOnce(() => {
      throw new MockVideoProjectCompileError(
        "VI_DOCUMENT_INVALID",
        "§17.3 SSRF host allowlist rejected 1 scene layer src URL(s)",
      );
    });

    await expect(
      router.saveDocument({
        ctx: ctx(),
        input: { projectId: 1, baseRevision: 1, document: baseDocument() },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("VI_DOCUMENT_INVALID") });

    expect(mockAssertSceneLayerAssetUrlsAllowed).toHaveBeenCalledWith(
      expect.anything(),
      "VI_DOCUMENT_INVALID",
    );
    expect(mockSaveVideoProjectDocument).not.toHaveBeenCalled();
  });

  it("saveDocument calls the F133-01 checkpoint-1 SSRF allowlist assertion on the happy path too (defense-in-depth is never skipped)", async () => {
    mockSaveVideoProjectDocument.mockResolvedValueOnce({ revision: 2 });

    await router.saveDocument({
      ctx: ctx(),
      input: { projectId: 1, baseRevision: 1, document: baseDocument() },
    });

    expect(mockAssertSceneLayerAssetUrlsAllowed).toHaveBeenCalledTimes(1);
    expect(mockSaveVideoProjectDocument).toHaveBeenCalledTimes(1);
  });

  it("emits zero extra db.select when the F133A flag is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValueOnce({ videoIntelligencePlatformEnabled: false });

    await expect(router.get({ ctx: ctx(), input: { projectId: 1 } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockGetVideoProject).not.toHaveBeenCalled();
  });

  it("delete is owner-checked", async () => {
    mockDeleteVideoProject.mockResolvedValueOnce(false);

    await expect(router.delete({ ctx: ctx(), input: { projectId: 999 } })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(mockDeleteVideoProject).toHaveBeenCalledWith({ tenantId: "tenant-1", userId: 42 }, 999);
  });
});

/* -------------------------------------------------------------------------- */
/* 2.4 Narration stage                                                        */
/* -------------------------------------------------------------------------- */

describe("runNarrationStage — TTS", () => {
  it("stores a mediaAssets row for the synthesized audio", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 3, document });
    mockSynthesize.mockResolvedValueOnce({
      audioBuffer: Buffer.from("audio-bytes"),
      contentType: "audio/mpeg",
      duration: 1.2,
    });
    mockStoragePut.mockResolvedValueOnce({ key: "video-intelligence/x.mp3", url: "/uploads/x.mp3" });
    const returning = vi.fn(() => Promise.resolve([{ id: 777 }]));
    const values = vi.fn(() => ({ returning }));
    mockDb.insert.mockReturnValueOnce({ values });
    mockSaveVideoProjectDocument.mockResolvedValueOnce({ revision: 4 });

    await router.runNarrationStage({ ctx: ctx(), input: { projectId: 1 } });

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: 42,
        mimeType: "audio/mpeg",
        storageKey: "video-intelligence/x.mp3",
      }),
    );
  });

  it("sets scene.narrationAudioAssetId on the saved document", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 3, document });
    mockSynthesize.mockResolvedValueOnce({
      audioBuffer: Buffer.from("audio-bytes"),
      contentType: "audio/mpeg",
      duration: 1.2,
    });
    mockStoragePut.mockResolvedValueOnce({ key: "k", url: "/uploads/k.mp3" });
    const returning = vi.fn(() => Promise.resolve([{ id: 888 }]));
    mockDb.insert.mockReturnValueOnce({ values: vi.fn(() => ({ returning })) });
    mockSaveVideoProjectDocument.mockResolvedValueOnce({ revision: 4 });

    const result = await router.runNarrationStage({ ctx: ctx(), input: { projectId: 1 } });

    expect(mockSaveVideoProjectDocument).toHaveBeenCalledTimes(1);
    const savedArgs = mockSaveVideoProjectDocument.mock.calls[0]![1] as { document: VideoProjectDocument };
    expect(savedArgs.document.scenes[0]!.narrationAudioAssetId).toBe(888);
    expect(result.revision).toBe(4);
  });

  it("charges TTS credits via calculateTTSCredits(chars)", async () => {
    const document = baseDocument();
    const narrationChars = document.scenes[0]!.narration!.trim().length;
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 3, document });
    mockSynthesize.mockResolvedValueOnce({
      audioBuffer: Buffer.from("audio-bytes"),
      contentType: "audio/mpeg",
      duration: 1.2,
    });
    mockStoragePut.mockResolvedValueOnce({ key: "k", url: "/uploads/k.mp3" });
    mockDb.insert.mockReturnValueOnce({
      values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 999 }])) })),
    });
    mockSaveVideoProjectDocument.mockResolvedValueOnce({ revision: 4 });
    mockCalculateTTSCredits.mockReturnValueOnce(9);

    const result = await router.runNarrationStage({ ctx: ctx(), input: { projectId: 1 } });

    expect(mockCalculateTTSCredits).toHaveBeenCalledWith(narrationChars);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, amount: 9, tenantId: "tenant-1" }),
    );
    expect(result.creditsCharged).toBe(9);
  });

  it("returns early with zero cost when no target scene has narration", async () => {
    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
    });
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 3, document });

    const result = await router.runNarrationStage({ ctx: ctx(), input: { projectId: 1 } });

    expect(result).toEqual({ revision: 3, scenesNarrated: 0, creditsCharged: 0 });
    expect(mockSynthesize).not.toHaveBeenCalled();
    expect(mockSaveVideoProjectDocument).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* deriveCaptionCues — pure helper                                            */
/* -------------------------------------------------------------------------- */

describe("deriveCaptionCues (pure)", () => {
  it("chunks narration into caption-sized cues timed proportionally across the scene window", () => {
    const cues = deriveCaptionCues(
      "This is a reasonably long narration sentence that should split into more than one caption chunk because it exceeds the max chunk length by a fair margin.",
      0,
      10000,
    );
    expect(cues.length).toBeGreaterThan(1);
    expect(cues[0]!.startMs).toBe(0);
    expect(cues[cues.length - 1]!.endMs).toBe(10000);
    for (const cue of cues) {
      expect(cue.endMs).toBeGreaterThan(cue.startMs);
    }
  });

  it("returns [] for empty narration", () => {
    expect(deriveCaptionCues("   ", 0, 5000)).toEqual([]);
  });

  it("returns [] for a zero-duration scene window", () => {
    expect(deriveCaptionCues("hello world", 1000, 1000)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* buildCaptionLinesForRender — pure helper (implementation-progress.md gap #3) */
/* -------------------------------------------------------------------------- */

describe("buildCaptionLinesForRender (pure)", () => {
  it("offsets scene-relative cue ms by scene.startMs and converts to seconds", () => {
    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 1000,
          endMs: 6000,
          narration: "one",
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [{ startMs: 0, endMs: 2000, text: "hello" }],
        },
        {
          sceneId: "scene-2",
          startMs: 6000,
          endMs: 9000,
          narration: "two",
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [{ startMs: 500, endMs: 2500, text: "world" }],
        },
      ],
    });

    expect(buildCaptionLinesForRender(document)).toEqual([
      { startSec: 1, endSec: 3, text: "hello" },
      { startSec: 6.5, endSec: 8.5, text: "world" },
    ]);
  });

  it("returns [] when no scene has caption cues", () => {
    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: null,
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [],
        },
      ],
    });

    expect(buildCaptionLinesForRender(document)).toEqual([]);
  });

  it("skips cues with blank/whitespace-only text", () => {
    const document = baseDocument({
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 0,
          endMs: 5000,
          narration: "one",
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [
            { startMs: 0, endMs: 1000, text: "   " },
            { startMs: 1000, endMs: 2000, text: "real text" },
          ],
        },
      ],
    });

    expect(buildCaptionLinesForRender(document)).toEqual([{ startSec: 1, endSec: 2, text: "real text" }]);
  });
});
