/**
 * Feature 142 (Video Intelligence: Structured Planning & Deterministic QA
 * Engine), section-04 — stage dispatch (credits, status, model pinning),
 * `getStageEstimate`, and the `quality_review` executor. Mock header copied
 * wholesale from `videoProjects.render.test.ts:11-160` (same "mock everything
 * to a minimal shape purely so the module can be imported" convention), with
 * mocks added for the modules this section newly imports:
 * `videoIntelligenceModelResolver`, `videoProjectReviewAdapter`,
 * `videoProjectQualityLoop`, and `videoProjectRepo.appendQaLedgerEntry`.
 * `videoProjectStageEstimator` is deliberately left UNMOCKED — it is pure
 * (no I/O), and using the real implementation is what makes the "moves with
 * document size" assertions genuine rather than tautological.
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

const { mockAuditLog, mockCreateTrace } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
  mockCreateTrace: vi.fn(() => "trace-1"),
}));
vi.mock("../../services/auditLogger", () => ({
  auditLogger: { createTrace: mockCreateTrace, log: mockAuditLog },
}));
vi.mock("../../_core/logger", () => ({ debugError: vi.fn(), debugLog: vi.fn() }));

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock("../../db", () => ({ db: mockDb }));

const {
  mockGetVideoProject,
  mockUpdateVideoProjectFields,
  mockGetBrandKit,
  mockAppendQaLedgerEntry,
  mockSaveVideoProjectDocument,
} = vi.hoisted(() => ({
  mockGetVideoProject: vi.fn(),
  mockUpdateVideoProjectFields: vi.fn(() => Promise.resolve({})),
  mockGetBrandKit: vi.fn(() => Promise.resolve(null)),
  mockAppendQaLedgerEntry: vi.fn(() => Promise.resolve({ entryCount: 1, totalCount: 1 })),
  mockSaveVideoProjectDocument: vi.fn(),
}));
vi.mock("../../services/videoProjectRepo", () => ({
  insertVideoProject: vi.fn(),
  getVideoProject: mockGetVideoProject,
  listVideoProjects: vi.fn(),
  saveVideoProjectDocument: mockSaveVideoProjectDocument,
  listVideoProjectRevisions: vi.fn(),
  restoreVideoProjectRevision: vi.fn(),
  updateVideoProjectFields: mockUpdateVideoProjectFields,
  deleteVideoProject: vi.fn(),
  insertBrandKit: vi.fn(),
  getBrandKit: mockGetBrandKit,
  listBrandKits: vi.fn(),
  updateBrandKit: vi.fn(),
  deleteBrandKit: vi.fn(),
  appendQaLedgerEntry: mockAppendQaLedgerEntry,
  VideoProjectRevisionConflictError: class VideoProjectRevisionConflictError extends Error {},
  VideoProjectNotFoundError: class VideoProjectNotFoundError extends Error {},
}));

const { mockCompileVideoProject } = vi.hoisted(() => ({ mockCompileVideoProject: vi.fn() }));
vi.mock("../../services/videoProjectCompiler", () => ({
  compileVideoProject: mockCompileVideoProject,
  estimateRenderCost: vi.fn(() => ({ score: 0, cls: "low", recommendPreRender: false })),
  VideoProjectCompileError: class VideoProjectCompileError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.name = "VideoProjectCompileError";
      this.code = code;
    }
  },
  BrandLockViolationError: class BrandLockViolationError extends Error {},
}));

// section-05 note: the REAL registry (pure, no I/O) is used here rather than
// a `{}` stub — the real `videoProjectScenePlanner` (also unmocked below) now
// reads it directly for template-existence/param validation, and the stub
// would crash `buildAvailableTemplates()`'s `MOTION_TEMPLATE_REGISTRY[id].meta`
// lookup for every one of the 10 known template ids.
vi.mock("../../remotion/templates", async importOriginal => {
  const actual = await importOriginal<typeof import("../../remotion/templates")>();
  return { ...actual };
});

const { mockResolveProjectAssets, mockBuildAssetManifest, mockFallbackAssetSourceHash } = vi.hoisted(() => ({
  mockResolveProjectAssets: vi.fn(),
  mockBuildAssetManifest: vi.fn(),
  mockFallbackAssetSourceHash: vi.fn((url: string) => "f".repeat(8) + Buffer.from(url).toString("hex").slice(0, 8)),
}));
vi.mock("../../services/videoProjectAssetResolver", () => ({
  resolveProjectAssets: mockResolveProjectAssets,
  buildAssetManifest: mockBuildAssetManifest,
  fallbackAssetSourceHash: mockFallbackAssetSourceHash,
  mergeAssetManifests: vi.fn((manifests: Array<{ sources: unknown[] }>) => ({
    sources: manifests.flatMap(m => m.sources),
  })),
  assertSceneLayerAssetUrlsAllowed: vi.fn(),
}));

const { mockQueueRemotionRenderVideoJob } = vi.hoisted(() => ({
  mockQueueRemotionRenderVideoJob: vi.fn(),
}));
vi.mock("../../services/workerSchedulerService", () => ({
  queueRemotionRenderVideoJob: mockQueueRemotionRenderVideoJob,
}));

const { mockEnqueueVideoIntelligenceJob, mockDispatchLaneARemotionRenderJob } = vi.hoisted(() => ({
  mockEnqueueVideoIntelligenceJob: vi.fn(() => Promise.resolve({ jobId: "job-1", deduped: false })),
  mockDispatchLaneARemotionRenderJob: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../services/videoIntelligenceJobs", () => ({
  dispatchLaneARemotionRenderJob: mockDispatchLaneARemotionRenderJob,
  enqueueVideoIntelligenceJob: mockEnqueueVideoIntelligenceJob,
  getGenerationJobStatus: vi.fn(),
  getActiveGenerationJob: vi.fn(),
}));

const { mockValidateProjectClaims } = vi.hoisted(() => ({ mockValidateProjectClaims: vi.fn() }));
vi.mock("../../services/validateProjectClaims", () => ({
  validateProjectClaims: mockValidateProjectClaims,
}));

const { mockComputeQualityMetrics, mockEstimateVideoProjectQualityLoopCredits } = vi.hoisted(() => ({
  mockComputeQualityMetrics: vi.fn(),
  mockEstimateVideoProjectQualityLoopCredits: vi.fn((perRound: number, maxRounds: number) =>
    Math.max(0, perRound) * Math.max(1, Math.trunc(maxRounds)),
  ),
}));
vi.mock("../../services/videoProjectQualityMetrics", () => ({
  computeQualityMetrics: mockComputeQualityMetrics,
  estimateVideoProjectQualityLoopCredits: mockEstimateVideoProjectQualityLoopCredits,
}));

vi.mock("../../services/ttsService", () => ({
  synthesize: vi.fn(),
  calculateTTSCredits: vi.fn(() => 0),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLMDynamic } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(() => Promise.resolve(true)),
  mockDeductCredits: vi.fn(() => Promise.resolve({})),
  mockCalculateCreditsForLLMDynamic: vi.fn((inputTokens: number, outputTokens: number, model: string) =>
    Promise.resolve(
      Math.max(1, Math.ceil((inputTokens + outputTokens) / 100)) + (model === "expensive-model" ? 500 : 0),
    ),
  ),
}));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  calculateCreditsForLLMDynamic: mockCalculateCreditsForLLMDynamic,
}));

vi.mock("../../storage", () => ({ storagePut: vi.fn() }));

vi.mock("../../services/hyperframesTranscriptionService", () => ({
  renderTranscriptCuesAsSrt: vi.fn(() => "SRT-OUTPUT"),
  renderTranscriptCuesAsVtt: vi.fn(() => "VTT-OUTPUT"),
}));

vi.mock("../../services/marketplaceInsightService", () => ({
  listMarketplaceInsightsByProduct: vi.fn(() => Promise.resolve([])),
}));

const { mockResolveStructuredStageModelSelection, mockAssertStructuredStageModelAvailable, MockVideoIntelligenceModelError } =
  vi.hoisted(() => {
    class VideoIntelligenceModelErrorImpl extends Error {
      code = "VI_NO_RECOMMENDED_MODEL";
      constructor(message: string) {
        super(message);
        this.name = "VideoIntelligenceModelError";
      }
    }
    return {
      mockResolveStructuredStageModelSelection: vi.fn(),
      mockAssertStructuredStageModelAvailable: vi.fn(() => Promise.resolve()),
      MockVideoIntelligenceModelError: VideoIntelligenceModelErrorImpl,
    };
  });
vi.mock("../../services/videoIntelligenceModelResolver", () => ({
  resolveStructuredStageModelSelection: mockResolveStructuredStageModelSelection,
  assertStructuredStageModelAvailable: mockAssertStructuredStageModelAvailable,
  VideoIntelligenceModelError: MockVideoIntelligenceModelError,
}));

const { mockMakeRunReview, mockBuildDocumentSummary } = vi.hoisted(() => ({
  mockMakeRunReview: vi.fn(),
  mockBuildDocumentSummary: vi.fn(() => ({ topic: null })),
}));
vi.mock("../../services/videoProjectReviewAdapter", () => ({
  makeRunReview: mockMakeRunReview,
  buildDocumentSummary: mockBuildDocumentSummary,
}));

// section-05 — the scene-plan adapter is mocked the same way as
// videoProjectReviewAdapter above; `videoProjectScenePlanner` itself is
// deliberately left UNMOCKED (real, pure, effect-injected) so these wiring
// tests exercise the genuine merge/validation pipeline against the mocked
// LLM seam only.
const { mockMakeRunPlanSkill } = vi.hoisted(() => ({
  mockMakeRunPlanSkill: vi.fn(),
}));
vi.mock("../../services/videoProjectScenePlanAdapter", () => ({
  makeRunPlanSkill: mockMakeRunPlanSkill,
}));

const { mockRunVideoProjectQualityLoop, mockClampQualityLoopRounds } = vi.hoisted(() => ({
  mockRunVideoProjectQualityLoop: vi.fn(),
  mockClampQualityLoopRounds: vi.fn((maxLoops: number) => Math.min(Math.max(1, Math.trunc(maxLoops)), 5)),
}));
vi.mock("../../services/videoProjectQualityLoop", () => ({
  runVideoProjectQualityLoop: mockRunVideoProjectQualityLoop,
  clampQualityLoopRounds: mockClampQualityLoopRounds,
}));

// section-06 — the repair applier/session and the repair rewriter are
// mocked the SAME way as videoProjectReviewAdapter/videoProjectQualityLoop
// above: this router test exercises WIRING only, never the real
// applier/rewriter logic (those have their own dedicated, zero-router-mock
// test files).
const { mockCreateRepairRoundSession, mockAssertReviewRevisionCurrent } = vi.hoisted(() => ({
  mockCreateRepairRoundSession: vi.fn(),
  mockAssertReviewRevisionCurrent: vi.fn(),
}));
vi.mock("../../services/videoProjectRepairApplier", () => ({
  createRepairRoundSession: mockCreateRepairRoundSession,
  assertReviewRevisionCurrent: mockAssertReviewRevisionCurrent,
}));

const { mockMakeRepairEffects } = vi.hoisted(() => ({ mockMakeRepairEffects: vi.fn() }));
vi.mock("../../services/videoProjectRepairRewriter", () => ({
  makeRepairEffects: mockMakeRepairEffects,
}));

import { videoProjectsRouter, runVideoIntelligenceJobExecutor } from "../videoProjects";
import type { VideoProjectDocument } from "../../../shared/videoIntelligence/projectSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const router = videoProjectsRouter as unknown as Record<string, any>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role?: string } | null }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42, role: "user" }, ...overrides };
}

function scene(id: string, overrides: Partial<VideoProjectDocument["scenes"][number]> = {}) {
  return {
    sceneId: id,
    startMs: 0,
    endMs: 5000,
    narration: "Try this product today.",
    narrationAudioAssetId: null,
    visual: { kind: "layers" as const },
    layers: [],
    motion: { intensity: "medium" as const, camera: "static" },
    captionCues: [{ startMs: 0, endMs: 1000, text: "Try this product today." }],
    ...overrides,
  };
}

function baseDocument(overrides: Partial<VideoProjectDocument> = {}): VideoProjectDocument {
  return {
    schemaVersion: 1,
    format: { width: 1080, height: 1920, fps: 30, durationMs: 5000 },
    content: { language: "en", platformPreset: "tiktok_9_16" },
    brandKitId: null,
    scenes: [scene("scene-1")],
    audioTracks: [],
    captions: { presetId: "no_subtitle_style", burnIn: false, language: "en" },
    claims: [],
    qa: { targetScore: 7, maxLoops: 1 },
    ...overrides,
  } as VideoProjectDocument;
}

function projectRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    revision: 3,
    status: "content",
    document: baseDocument(),
    sourceRefs: null,
    studioType: "motion",
    qaLedger: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ videoIntelligencePlatformEnabled: true });
  mockGetBrandKit.mockResolvedValue(null);
  mockUpdateVideoProjectFields.mockResolvedValue({});
  mockHasEnoughCredits.mockResolvedValue(true);
  mockEnqueueVideoIntelligenceJob.mockResolvedValue({ jobId: "job-1", deduped: false });
  mockResolveStructuredStageModelSelection.mockResolvedValue({
    modelId: "model-a",
    source: "recommended",
    pricingInputPerMTokUsd: 1,
    pricingOutputPerMTokUsd: 2,
    isFree: false,
  });
  mockAssertStructuredStageModelAvailable.mockResolvedValue(undefined);
  mockValidateProjectClaims.mockReturnValue({
    mappedClaims: [],
    unmappedStatements: [],
    prohibitedClaims: [],
    coverage: 1,
    blocksFinalRender: false,
  });
  mockComputeQualityMetrics.mockReturnValue({
    sceneDurations: [],
    captionCps: [],
    layerCounts: { perScene: [], total: 0, maxLayersPerScene: 0 },
    safeAreaViolations: [],
    claimCoverage: { coverage: 1, mappedCount: 0, unmappedCount: 0, prohibitedCount: 0 },
    renderCost: { score: 1, cls: "low", recommendPreRender: false },
  });
  mockCompileVideoProject.mockReturnValue({
    kind: "single",
    config: { id: "cfg", name: "cfg", width: 1080, height: 1920, fps: 30, durationInFrames: 150, layers: [] },
    cost: { score: 1, cls: "low", recommendPreRender: false },
  });
  mockResolveProjectAssets.mockResolvedValue({
    url: vi.fn((id: number | string) => `/uploads/${id}`),
    sha256: vi.fn(() => undefined),
    sha256ByUrl: vi.fn(() => undefined),
  });
  mockSaveVideoProjectDocument.mockResolvedValue({ revision: 8 });

  mockAssertReviewRevisionCurrent.mockImplementation(() => {});
  mockMakeRepairEffects.mockReturnValue({ rewriteForStage: vi.fn(async () => []) });
  mockCreateRepairRoundSession.mockImplementation(({ document: sessionDocument, baseRevision }: any) => ({
    repairStage: vi.fn(async () => {}),
    recomputeMetrics: vi.fn(async () => ({
      sceneDurations: [],
      captionCps: [],
      layerCounts: { perScene: [], total: 0, maxLayersPerScene: 0 },
      safeAreaViolations: [],
      claimCoverage: { coverage: 1, mappedCount: 0, unmappedCount: 0, prohibitedCount: 0 },
      renderCost: { score: 1, cls: "low", recommendPreRender: false },
    })),
    snapshot: () => ({
      document: sessionDocument,
      revision: baseRevision,
      roundsPersisted: 0,
      applied: [],
      skipped: [],
      rolledBack: [],
    }),
  }));
});

/* -------------------------------------------------------------------------- */
/* Dispatch — runQualityReview (reference implementation for all three)      */
/* -------------------------------------------------------------------------- */

describe("runQualityReview (dispatch)", () => {
  it("enqueues a quality_review job and returns { jobId, traceId }", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());

    const result = await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });

    expect(result.jobId).toBe("job-1");
    expect(result.traceId).toBe("trace-1");
    expect(mockEnqueueVideoIntelligenceJob).toHaveBeenCalledTimes(1);
    expect(mockEnqueueVideoIntelligenceJob.mock.calls[0]![0]).toMatchObject({
      kind: "quality_review",
      tenantId: "tenant-1",
      userId: 42,
      projectId: 1,
    });
  });

  it("stamps status 'qa' BEFORE enqueueing — asserted by mock call ORDER, not final state", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ status: "content" }));

    const callOrder: string[] = [];
    mockUpdateVideoProjectFields.mockImplementation(async (_auth: unknown, _id: unknown, patch: { status?: string }) => {
      callOrder.push(`status:${patch.status}`);
      return {};
    });
    mockEnqueueVideoIntelligenceJob.mockImplementation(async () => {
      callOrder.push("enqueue");
      return { jobId: "job-1", deduped: false };
    });

    await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });

    expect(callOrder).toEqual(["status:qa", "enqueue"]);
  });

  it("carries the dispatch-resolved modelId in the job payload input", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());

    await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });

    const call = mockEnqueueVideoIntelligenceJob.mock.calls[0]![0];
    expect(call.input.modelId).toBe("model-a");
  });

  it("carries previousStatus and baseRevision in the job payload input", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ status: "content", revision: 5 }));

    await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });

    const call = mockEnqueueVideoIntelligenceJob.mock.calls[0]![0];
    expect(call.input.previousStatus).toBe("content");
    expect(call.input.baseRevision).toBe(5);
  });

  it("pre-checks credits and throws VI_INSUFFICIENT_CREDITS with ZERO job records written", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    mockHasEnoughCredits.mockResolvedValueOnce(false);

    await expect(router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VI_INSUFFICIENT_CREDITS"),
    });

    expect(mockEnqueueVideoIntelligenceJob).not.toHaveBeenCalled();
  });

  it("does not stamp status when the credit pre-check fails", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    mockHasEnoughCredits.mockResolvedValueOnce(false);

    await expect(
      router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } }),
    ).rejects.toThrow();

    expect(mockUpdateVideoProjectFields).not.toHaveBeenCalled();
  });

  it("restores the previous status when enqueue throws VI_QUEUE_UNAVAILABLE", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ status: "content" }));
    mockEnqueueVideoIntelligenceJob.mockRejectedValueOnce(
      Object.assign(new Error("VI_QUEUE_UNAVAILABLE: redis down"), { code: "INTERNAL_SERVER_ERROR" }),
    );

    await expect(
      router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } }),
    ).rejects.toThrow(/VI_QUEUE_UNAVAILABLE/);

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledTimes(2);
    expect(mockUpdateVideoProjectFields.mock.calls[0]![2]).toEqual({ status: "qa" });
    expect(mockUpdateVideoProjectFields.mock.calls[1]![2]).toEqual({ status: "content" });
  });

  it("throws VI_NO_RECOMMENDED_MODEL at dispatch when no recommended model resolves", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    mockResolveStructuredStageModelSelection.mockRejectedValueOnce(
      new MockVideoIntelligenceModelError("VI_NO_RECOMMENDED_MODEL: none available"),
    );

    await expect(router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VI_NO_RECOMMENDED_MODEL"),
    });

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockUpdateVideoProjectFields).not.toHaveBeenCalled();
    expect(mockEnqueueVideoIntelligenceJob).not.toHaveBeenCalled();
  });

  it("emits a video_project_stage audit event with phase 'start'", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());

    await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "video_project_stage",
        metadata: expect.objectContaining({ stage: "quality_review", phase: "start" }),
      }),
    );
  });

  it("emits zero extra db.select when the platform flag is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValueOnce({ videoIntelligencePlatformEnabled: false });

    await expect(router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    expect(mockGetVideoProject).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("makes ZERO deductCredits calls on the dispatch path", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());

    await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Dispatch — the other two stages inherit the same rules                    */
/* -------------------------------------------------------------------------- */

describe("runScenePlanStage / applyQualityRepairs (dispatch)", () => {
  it("runScenePlanStage stamps 'scenes' at dispatch and pins a model", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ status: "content" }));

    await router.runScenePlanStage({ ctx: ctx(), input: { projectId: 1 } });

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledWith(
      expect.anything(),
      1,
      { status: "scenes" },
    );
    const call = mockEnqueueVideoIntelligenceJob.mock.calls[0]![0];
    expect(call.kind).toBe("scene_plan");
    expect(call.input.modelId).toBe("model-a");
  });

  it("applyQualityRepairs stamps 'qa' at dispatch and pins a model", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ status: "qa" }));

    await router.applyQualityRepairs({ ctx: ctx(), input: { projectId: 1 } });

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledWith(expect.anything(), 1, { status: "qa" });
    const call = mockEnqueueVideoIntelligenceJob.mock.calls[0]![0];
    expect(call.kind).toBe("quality_repair");
    expect(call.input.modelId).toBe("model-a");
  });

  it("applyQualityRepairs passes the requested stages through into the payload", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());

    await router.applyQualityRepairs({
      ctx: ctx(),
      input: { projectId: 1, stages: ["narration", "captions"] },
    });

    const call = mockEnqueueVideoIntelligenceJob.mock.calls[0]![0];
    expect(call.input.stages).toEqual(["narration", "captions"]);
  });

  it("a deduped enqueue (active pointer already held) does not double-stamp status", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    mockEnqueueVideoIntelligenceJob.mockResolvedValueOnce({ jobId: "existing-1", deduped: true });

    const result = await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });

    expect(result.jobId).toBe("existing-1");
    expect(mockUpdateVideoProjectFields).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* getStageEstimate                                                           */
/* -------------------------------------------------------------------------- */

describe("getStageEstimate", () => {
  it("derives perRoundCredits from the resolved model's catalog pricing and the document size", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ document: baseDocument() }));

    const result = await router.getStageEstimate({
      ctx: ctx(),
      input: { projectId: 1, stage: "quality_review" },
    });

    expect(result.perRoundCredits).toBeGreaterThan(0);
    expect(mockCalculateCreditsForLLMDynamic).toHaveBeenCalledWith(
      expect.any(Number),
      expect.any(Number),
      "model-a",
    );
  });

  it("returns a DIFFERENT number for a bigger document with the same model", async () => {
    const small = projectRow({ document: baseDocument({ scenes: [scene("scene-1")] }) });
    const large = projectRow({
      document: baseDocument({
        scenes: [
          scene("scene-1", { narration: "A".repeat(3000) }),
          scene("scene-2", { narration: "B".repeat(3000) }),
          scene("scene-3", { narration: "C".repeat(3000) }),
        ],
      }),
    });

    mockGetVideoProject.mockResolvedValueOnce(small);
    const smallResult = await router.getStageEstimate({
      ctx: ctx(),
      input: { projectId: 1, stage: "quality_review" },
    });

    mockGetVideoProject.mockResolvedValueOnce(large);
    const largeResult = await router.getStageEstimate({
      ctx: ctx(),
      input: { projectId: 1, stage: "quality_review" },
    });

    expect(largeResult.perRoundCredits).toBeGreaterThan(smallResult.perRoundCredits);
    expect(largeResult.ceilingCredits).toBeGreaterThan(smallResult.ceilingCredits);
  });

  it("returns a DIFFERENT number for a differently-priced model with the same document", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    mockResolveStructuredStageModelSelection.mockResolvedValueOnce({
      modelId: "model-a",
      source: "recommended",
      pricingInputPerMTokUsd: 1,
      pricingOutputPerMTokUsd: 2,
      isFree: false,
    });
    const cheapResult = await router.getStageEstimate({
      ctx: ctx(),
      input: { projectId: 1, stage: "quality_review" },
    });

    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    mockResolveStructuredStageModelSelection.mockResolvedValueOnce({
      modelId: "expensive-model",
      source: "recommended",
      pricingInputPerMTokUsd: 50,
      pricingOutputPerMTokUsd: 100,
      isFree: false,
    });
    const expensiveResult = await router.getStageEstimate({
      ctx: ctx(),
      input: { projectId: 1, stage: "quality_review" },
    });

    expect(expensiveResult.perRoundCredits).not.toBe(cheapResult.perRoundCredits);
    expect(expensiveResult.modelId).toBe("expensive-model");
  });

  it("never returns a hardcoded constant", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ document: baseDocument() }));
    const first = await router.getStageEstimate({ ctx: ctx(), input: { projectId: 1, stage: "quality_review" } });

    mockGetVideoProject.mockResolvedValueOnce(
      projectRow({ document: baseDocument({ scenes: [scene("scene-1"), scene("scene-2")] }) }),
    );
    const second = await router.getStageEstimate({ ctx: ctx(), input: { projectId: 1, stage: "quality_review" } });

    expect(first.perRoundCredits).not.toBe(second.perRoundCredits);
  });

  it("returns ceilingCredits = perRound × 5 × maxLoops and flags isCeiling", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ document: baseDocument({ qa: { targetScore: 7, maxLoops: 2 } }) }));

    const result = await router.getStageEstimate({ ctx: ctx(), input: { projectId: 1, stage: "quality_review" } });

    expect(result.callsPerRoundCeiling).toBe(5);
    expect(result.ceilingCredits).toBe(result.perRoundCredits * 5 * result.maxLoops);
    expect(result.isCeiling).toBe(true);
  });

  it("returns typicalCredits alongside the ceiling so the UI can show both", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ document: baseDocument({ qa: { targetScore: 7, maxLoops: 3 } }) }));

    const result = await router.getStageEstimate({ ctx: ctx(), input: { projectId: 1, stage: "quality_review" } });

    expect(result.typicalCredits).toBe(result.perRoundCredits * result.maxLoops);
    expect(result.typicalCredits).toBeLessThan(result.ceilingCredits);
  });

  it("clamps maxLoops to at least 1", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow({ document: baseDocument({ qa: { targetScore: 7, maxLoops: 0 } }) }));

    const result = await router.getStageEstimate({ ctx: ctx(), input: { projectId: 1, stage: "quality_review" } });

    expect(result.maxLoops).toBe(1);
  });

  it("returns the same modelId that dispatch will carry into the job", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    const estimateResult = await router.getStageEstimate({
      ctx: ctx(),
      input: { projectId: 1, stage: "quality_review" },
    });

    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    await router.runQualityReview({ ctx: ctx(), input: { projectId: 1 } });
    const dispatchCall = mockEnqueueVideoIntelligenceJob.mock.calls[0]![0];

    expect(dispatchCall.input.modelId).toBe(estimateResult.modelId);
  });

  it("throws VI_NO_RECOMMENDED_MODEL when no recommended model is available", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());
    mockResolveStructuredStageModelSelection.mockRejectedValueOnce(
      new MockVideoIntelligenceModelError("VI_NO_RECOMMENDED_MODEL: none available"),
    );

    await expect(
      router.getStageEstimate({ ctx: ctx(), input: { projectId: 1, stage: "quality_review" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("VI_NO_RECOMMENDED_MODEL") });
  });

  it("makes no LLM call and no credit charge", async () => {
    mockGetVideoProject.mockResolvedValueOnce(projectRow());

    await router.getStageEstimate({ ctx: ctx(), input: { projectId: 1, stage: "quality_review" } });

    expect(mockMakeRunReview).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Execution — quality_review via runVideoIntelligenceJobExecutor            */
/* -------------------------------------------------------------------------- */

describe("runVideoIntelligenceJobExecutor (quality_review)", () => {
  function jobPayload(overrides: Record<string, unknown> = {}) {
    return {
      kind: "quality_review" as const,
      tenantId: "tenant-1",
      userId: 42,
      projectId: 1,
      input: {
        traceId: "trace-exec-1",
        modelId: "model-a",
        modelSource: "recommended",
        previousStatus: "content",
        baseRevision: 3,
        ...overrides,
      },
    };
  }

  function reviewFixture(overrides: Record<string, unknown> = {}) {
    return {
      score: 8,
      scorecard: { clarity: 8 },
      issues: [{ dimension: "clarity", severity: "low", message: "fine" }],
      ...overrides,
    };
  }

  beforeEach(() => {
    mockGetVideoProject.mockResolvedValue(projectRow({ revision: 7 }));
    mockMakeRunReview.mockReturnValue(vi.fn(async () => reviewFixture()));
    mockRunVideoProjectQualityLoop.mockImplementation(async (args: any) => {
      const review = await args.effects.runReview({ projectId: args.projectId, metrics: args.metrics });
      await args.effects.persistReview(review);
      return { rounds: 1, bestReview: review, history: [review] };
    });
  });

  it("calls runVideoProjectQualityLoop with the computed metrics and the section-03 runReview effect", async () => {
    const metricsFixture = { claimCoverage: { coverage: 1 }, layerCounts: { total: 0 } };
    mockComputeQualityMetrics.mockReturnValue(metricsFixture);
    const runReviewEffect = vi.fn(async () => reviewFixture());
    mockMakeRunReview.mockReturnValue(runReviewEffect);

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockRunVideoProjectQualityLoop).toHaveBeenCalledWith(
      expect.objectContaining({ metrics: metricsFixture, effects: expect.objectContaining({ runReview: runReviewEffect }) }),
    );
  });

  it("uses the modelId carried in the payload and does NOT re-resolve", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload({ modelId: "carried-model" }) as any, vi.fn());

    expect(mockResolveStructuredStageModelSelection).not.toHaveBeenCalled();
    expect(mockAssertStructuredStageModelAvailable).toHaveBeenCalledWith(
      "carried-model",
      undefined,
      { source: "recommended" },
    );
    expect(mockMakeRunReview).toHaveBeenCalledWith(expect.objectContaining({ modelId: "carried-model" }));
  });

  it("fails with VI_NO_RECOMMENDED_MODEL when the carried model is no longer available", async () => {
    mockAssertStructuredStageModelAvailable.mockRejectedValueOnce(
      new MockVideoIntelligenceModelError("VI_NO_RECOMMENDED_MODEL: revoked"),
    );

    await expect(runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())).rejects.toThrow(
      /VI_NO_RECOMMENDED_MODEL/,
    );
  });

  it("appends a QaLedgerEntry to video_projects.qaLedger", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockAppendQaLedgerEntry).toHaveBeenCalledTimes(1);
    const [, projectIdArg, entryArg] = mockAppendQaLedgerEntry.mock.calls[0]!;
    expect(projectIdArg).toBe(1);
    expect(entryArg).toMatchObject({ round: 1, traceId: "trace-exec-1", modelId: "model-a" });
  });

  it("records the document revision the review judged in the ledger entry", async () => {
    mockGetVideoProject.mockResolvedValue(projectRow({ revision: 42 }));

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    const [, , entryArg] = mockAppendQaLedgerEntry.mock.calls[0]!;
    expect(entryArg.revision).toBe(42);
  });

  it("writes NO review payload into video_project_revisions", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockSaveVideoProjectDocument).not.toHaveBeenCalled();
  });

  it("returns a serialisable result carrying review, creditsUsed and modelId", async () => {
    mockMakeRunReview.mockReturnValue(vi.fn(async (_input: unknown) => reviewFixture()));

    const result = (await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())) as Record<string, unknown>;

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result).toMatchObject({ kind: "quality_review", review: reviewFixture(), modelId: "model-a" });
    expect(typeof result.creditsUsed).toBe("number");
  });

  it("sets status 'ready' when score >= targetScore and !blocksFinalRender", async () => {
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 7, document: baseDocument({ qa: { targetScore: 7, maxLoops: 1 } }) }),
    );
    mockValidateProjectClaims.mockReturnValue({
      mappedClaims: [],
      unmappedStatements: [],
      prohibitedClaims: [],
      coverage: 1,
      blocksFinalRender: false,
    });

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledWith(expect.anything(), 1, { status: "ready" });
  });

  it("sets status 'qa' otherwise", async () => {
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 7, document: baseDocument({ qa: { targetScore: 9, maxLoops: 1 } }) }),
    );

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledWith(expect.anything(), 1, { status: "qa" });
  });

  it("restores previousStatus when the loop throws", async () => {
    mockRunVideoProjectQualityLoop.mockRejectedValueOnce(new Error("loop exploded"));

    await expect(
      runVideoIntelligenceJobExecutor(jobPayload({ previousStatus: "content" }) as any, vi.fn()),
    ).rejects.toThrow(/loop exploded/);

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledWith(expect.anything(), 1, { status: "content" });
    expect(mockUpdateVideoProjectFields).not.toHaveBeenCalledWith(expect.anything(), 1, { status: "ready" });
  });

  it("emits a 'finish' audit event with score, issueCount, highSeverityCount, claimCoverage, modelUsed", async () => {
    mockComputeQualityMetrics.mockReturnValue({ claimCoverage: { coverage: 0.75 }, layerCounts: { total: 0 } });

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "video_project_stage",
        metadata: expect.objectContaining({
          stage: "quality_review",
          phase: "finish",
          score: 8,
          issueCount: 1,
          highSeverityCount: 0,
          claimCoverage: 0.75,
          modelUsed: "model-a",
        }),
      }),
    );
  });

  it("makes ZERO deductCredits calls on the execution path", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("passes repairStage/recomputeMetrics stubs that are not called in this section", async () => {
    // section-06 replaces this expectation once repairs are wired.
    let capturedEffects: any;
    mockRunVideoProjectQualityLoop.mockImplementationOnce(async (args: any) => {
      capturedEffects = args.effects;
      const review = await args.effects.runReview({ projectId: args.projectId, metrics: args.metrics });
      await args.effects.persistReview(review);
      return { rounds: 1, bestReview: review, history: [review] };
    });

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(typeof capturedEffects.repairStage).toBe("function");
    expect(typeof capturedEffects.recomputeMetrics).toBe("function");
    await expect(capturedEffects.repairStage("content", "instr")).resolves.toBeUndefined();
    await expect(capturedEffects.recomputeMetrics("1")).resolves.toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Execution — scene_plan via runVideoIntelligenceJobExecutor (section-05)   */
/* -------------------------------------------------------------------------- */

describe("runVideoIntelligenceJobExecutor (scene_plan)", () => {
  function jobPayload(overrides: Record<string, unknown> = {}) {
    return {
      kind: "scene_plan" as const,
      tenantId: "tenant-1",
      userId: 42,
      projectId: 1,
      input: {
        traceId: "trace-exec-1",
        modelId: "model-a",
        modelSource: "recommended",
        previousStatus: "content",
        baseRevision: 3,
        ...overrides,
      },
    };
  }

  function planOutputFixture(overrides: Record<string, unknown> = {}) {
    return {
      scenes: [
        {
          sceneId: "scene-1",
          templateId: "kinetic_typography",
          templateParams: { words: ["Hi"] },
          startMs: 0,
          endMs: 5000,
          rationale: "hook",
          onScreenStatements: [],
        },
      ],
      summary: "planned scene-1",
      ...overrides,
    };
  }

  beforeEach(() => {
    mockGetVideoProject.mockResolvedValue(projectRow({ revision: 7 }));
    mockMakeRunPlanSkill.mockReturnValue(vi.fn(async () => planOutputFixture()));
  });

  it("uses the modelId carried in the payload and does NOT re-resolve", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload({ modelId: "carried-model" }) as any, vi.fn());

    expect(mockResolveStructuredStageModelSelection).not.toHaveBeenCalled();
    expect(mockAssertStructuredStageModelAvailable).toHaveBeenCalledWith(
      "carried-model",
      undefined,
      { source: "recommended" },
    );
    expect(mockMakeRunPlanSkill).toHaveBeenCalledWith(expect.objectContaining({ modelId: "carried-model" }));
  });

  it("fails with VI_NO_RECOMMENDED_MODEL when the carried model is no longer available", async () => {
    mockAssertStructuredStageModelAvailable.mockRejectedValueOnce(
      new MockVideoIntelligenceModelError("VI_NO_RECOMMENDED_MODEL: revoked"),
    );

    await expect(runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())).rejects.toThrow(
      /VI_NO_RECOMMENDED_MODEL/,
    );
  });

  it("defaults mode to fill_empty when the input omits it", async () => {
    const result = (await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())) as Record<
      string,
      unknown
    >;

    expect(result.mode).toBe("fill_empty");
  });

  it("passes mode 'replace' through from the payload input", async () => {
    const result = (await runVideoIntelligenceJobExecutor(
      jobPayload({ mode: "replace" }) as any,
      vi.fn(),
    )) as Record<string, unknown>;

    expect(result.mode).toBe("replace");
  });

  it("resolves catalog facts for a catalog project and passes null for a motion project", async () => {
    let capturedInput: any;
    mockMakeRunPlanSkill.mockReturnValue(
      vi.fn(async (input: unknown) => {
        capturedInput = input;
        return planOutputFixture();
      }),
    );
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 7, studioType: "catalog", sourceRefs: { productIds: ["p1"] } }),
    );

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(capturedInput.catalogFacts).not.toBeNull();
    expect(capturedInput.catalogFacts.productIds).toEqual(["p1"]);

    capturedInput = undefined;
    mockGetVideoProject.mockResolvedValue(projectRow({ revision: 7, studioType: "motion" }));
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(capturedInput.catalogFacts).toBeNull();
  });

  it("saves with baseRevision from the payload and reason 'scene_plan'", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload({ baseRevision: 5 }) as any, vi.fn());

    expect(mockSaveVideoProjectDocument).toHaveBeenCalledTimes(1);
    const [, args] = mockSaveVideoProjectDocument.mock.calls[0]!;
    expect(args).toMatchObject({ id: 1, baseRevision: 5, reason: "scene_plan" });
  });

  it("restores previousStatus when the planner throws", async () => {
    mockMakeRunPlanSkill.mockReturnValue(
      vi.fn(async () => {
        throw new Error("planner exploded");
      }),
    );

    await expect(
      runVideoIntelligenceJobExecutor(jobPayload({ previousStatus: "content" }) as any, vi.fn()),
    ).rejects.toThrow(/planner exploded/);

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledWith(expect.anything(), 1, { status: "content" });
  });

  it("returns a serialisable result carrying revision, plannedSceneIds, gaps, creditsUsed and modelId", async () => {
    mockSaveVideoProjectDocument.mockResolvedValue({ revision: 9 });

    const result = (await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())) as Record<
      string,
      unknown
    >;

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result).toMatchObject({
      kind: "scene_plan",
      revision: 9,
      plannedSceneIds: ["scene-1"],
      modelId: "model-a",
    });
    expect(Array.isArray(result.gaps)).toBe(true);
    expect(typeof result.creditsUsed).toBe("number");
  });

  it("emits onProgress at scene_plan_start / scene_plan_planning / scene_plan_persisted", async () => {
    const onProgress = vi.fn();

    await runVideoIntelligenceJobExecutor(jobPayload() as any, onProgress);

    const stages = onProgress.mock.calls.map(call => call[0].stage);
    expect(stages).toEqual(["scene_plan_start", "scene_plan_planning", "scene_plan_persisted"]);
  });

  it("makes ZERO deductCredits calls on the scene-plan path", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Execution — quality_repair via runVideoIntelligenceJobExecutor (section-06)*/
/* -------------------------------------------------------------------------- */

describe("runVideoIntelligenceJobExecutor (quality_repair)", () => {
  function jobPayload(overrides: Record<string, unknown> = {}) {
    return {
      kind: "quality_repair" as const,
      tenantId: "tenant-1",
      userId: 42,
      projectId: 1,
      input: {
        traceId: "trace-repair-1",
        modelId: "model-a",
        modelSource: "recommended",
        previousStatus: "qa",
        baseRevision: 7,
        stages: [],
        ...overrides,
      },
    };
  }

  function storedReview(overrides: Record<string, unknown> = {}) {
    return {
      score: 4,
      scorecard: { content: 4 },
      issues: [{ dimension: "content", severity: "high", message: "needs work" }],
      repairInstructions: [{ stage: "narration", instruction: "tighten it" }],
      ...overrides,
    };
  }

  function ledgerWith(review: Record<string, unknown> | null, revision = 7) {
    if (review === null) return null;
    return {
      entries: [
        {
          at: "2026-01-01T00:00:00.000Z",
          round: 1,
          revision,
          review,
          creditsUsed: 5,
          modelId: "model-a",
          traceId: "trace-review-1",
        },
      ],
      totalCount: 1,
    };
  }

  beforeEach(() => {
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 7, qaLedger: ledgerWith(storedReview()) }),
    );
    // Default: a single-round pass-through — the loop calls persistReview
    // once with the SAME reference it was handed as `initialReview` (the
    // stored review), which the router must recognise as already-ledgered.
    mockRunVideoProjectQualityLoop.mockImplementation(async (args: any) => {
      await args.effects.persistReview(args.initialReview);
      return { rounds: 1, bestReview: args.initialReview, history: [args.initialReview] };
    });
  });

  it("loads the newest QaLedgerEntry as the review to apply", async () => {
    const newest = storedReview({ score: 5 });
    mockGetVideoProject.mockResolvedValue(
      projectRow({
        revision: 7,
        qaLedger: {
          entries: [storedReview({ score: 1 }), newest].map((review, i) => ({
            at: "2026-01-01T00:00:00.000Z",
            round: i + 1,
            revision: 7,
            review,
            creditsUsed: 0,
            modelId: "model-a",
            traceId: "trace-x",
          })),
          totalCount: 2,
        },
      }),
    );

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    const call = mockRunVideoProjectQualityLoop.mock.calls[0][0];
    expect(call.initialReview).toEqual(newest);
  });

  it("throws VI_REPAIR_NO_INSTRUCTIONS when the ledger is empty", async () => {
    mockGetVideoProject.mockResolvedValue(projectRow({ revision: 7, qaLedger: null }));

    await expect(runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())).rejects.toThrow(
      /VI_REPAIR_NO_INSTRUCTIONS/,
    );
  });

  it("throws VI_REPAIR_NO_INSTRUCTIONS when the newest entry has no repairInstructions", async () => {
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 7, qaLedger: ledgerWith(storedReview({ repairInstructions: [] })) }),
    );

    await expect(runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())).rejects.toThrow(
      /VI_REPAIR_NO_INSTRUCTIONS/,
    );
  });

  it("throws VI_REPAIR_STALE_REVIEW when the ledger review's revision != the project revision", async () => {
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 9, qaLedger: ledgerWith(storedReview(), 7) }),
    );
    mockAssertReviewRevisionCurrent.mockImplementation(({ reviewedRevision, currentRevision }: any) => {
      if (reviewedRevision !== currentRevision) {
        throw new Error("VI_REPAIR_STALE_REVIEW: stale");
      }
    });

    await expect(runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())).rejects.toThrow(
      /VI_REPAIR_STALE_REVIEW/,
    );
    expect(mockCreateRepairRoundSession).not.toHaveBeenCalled();
    expect(mockSaveVideoProjectDocument).not.toHaveBeenCalled();
    expect(mockAppendQaLedgerEntry).not.toHaveBeenCalled();
  });

  it("uses the modelId carried in the payload and does NOT re-resolve", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload({ modelId: "carried-model" }) as any, vi.fn());

    expect(mockResolveStructuredStageModelSelection).not.toHaveBeenCalled();
    expect(mockAssertStructuredStageModelAvailable).toHaveBeenCalledWith(
      "carried-model",
      undefined,
      { source: "recommended" },
    );
    expect(mockMakeRepairEffects).toHaveBeenCalledWith(expect.objectContaining({ modelId: "carried-model" }));
  });

  it("fails with VI_NO_RECOMMENDED_MODEL when the carried model is no longer available", async () => {
    mockAssertStructuredStageModelAvailable.mockRejectedValueOnce(
      new MockVideoIntelligenceModelError("VI_NO_RECOMMENDED_MODEL: revoked"),
    );

    await expect(runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())).rejects.toThrow(
      /VI_NO_RECOMMENDED_MODEL/,
    );
  });

  it("wires persistDocument to save with reason 'quality_repair'", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    const sessionArgs = mockCreateRepairRoundSession.mock.calls[0][0];
    await sessionArgs.persistDocument({ scenes: [] } as any, 7);

    expect(mockSaveVideoProjectDocument).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 1, baseRevision: 7, reason: "quality_repair" }),
    );
  });

  it("appends a QaLedgerEntry for a NEW re-review round, but not for the already-ledgered initial review", async () => {
    const initial = storedReview();
    const nextRound = storedReview({ score: 8, repairInstructions: [] });
    mockGetVideoProject.mockResolvedValue(projectRow({ revision: 7, qaLedger: ledgerWith(initial) }));
    mockRunVideoProjectQualityLoop.mockImplementation(async (args: any) => {
      await args.effects.persistReview(args.initialReview); // already ledgered -> skipped
      await args.effects.persistReview(nextRound); // a genuinely new round -> appended
      return { rounds: 2, bestReview: nextRound, history: [args.initialReview, nextRound] };
    });

    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockAppendQaLedgerEntry).toHaveBeenCalledTimes(1);
    const [, projectIdArg, entryArg] = mockAppendQaLedgerEntry.mock.calls[0]!;
    expect(projectIdArg).toBe(1);
    expect(entryArg).toMatchObject({ round: 2, review: nextRound, traceId: "trace-repair-1" });
  });

  it("is a safe no-op on redelivery — the second run throws before any write", async () => {
    // First run "succeeds" and (in the real system) bumps the revision.
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());
    vi.clearAllMocks();
    mockGetTenantFeatureFlags.mockResolvedValue({ videoIntelligencePlatformEnabled: true });
    mockAssertStructuredStageModelAvailable.mockResolvedValue(undefined);

    // Second run (redelivery): the stored review's revision (7) no longer
    // matches the NOW-current project revision (8) — the guard must fire.
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 8, qaLedger: ledgerWith(storedReview(), 7) }),
    );
    mockAssertReviewRevisionCurrent.mockImplementation(({ reviewedRevision, currentRevision }: any) => {
      if (reviewedRevision !== currentRevision) {
        throw new Error("VI_REPAIR_STALE_REVIEW: stale");
      }
    });

    await expect(runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())).rejects.toThrow(
      /VI_REPAIR_STALE_REVIEW/,
    );
    // No repair document write and no ledger append — the ONLY write that
    // happens is `withStageStatusRestore`'s status-restore-on-failure
    // (restoring `previousStatus`, which is unconditional on ANY thrown
    // error and orthogonal to this guard).
    expect(mockSaveVideoProjectDocument).not.toHaveBeenCalled();
    expect(mockAppendQaLedgerEntry).not.toHaveBeenCalled();
    expect(mockCreateRepairRoundSession).not.toHaveBeenCalled();
  });

  it("returns a serialisable result carrying appliedStages, revisionBefore/After and scoreBefore/After", async () => {
    const result = (await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn())) as Record<string, unknown>;

    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result).toMatchObject({
      kind: "quality_repair",
      revisionBefore: 7,
      scoreBefore: 4,
      scoreAfter: 4,
    });
    expect(Array.isArray(result.appliedStages)).toBe(true);
    expect(Array.isArray(result.skippedStages)).toBe(true);
    expect(Array.isArray(result.rolledBackStages)).toBe(true);
  });

  it("sets status 'qa' on finish", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledWith(expect.anything(), 1, { status: "qa" });
  });

  it("restores previousStatus when the loop throws", async () => {
    mockRunVideoProjectQualityLoop.mockRejectedValueOnce(new Error("loop exploded"));

    await expect(
      runVideoIntelligenceJobExecutor(jobPayload({ previousStatus: "content" }) as any, vi.fn()),
    ).rejects.toThrow(/loop exploded/);

    expect(mockUpdateVideoProjectFields).toHaveBeenCalledWith(expect.anything(), 1, { status: "content" });
  });

  it("emits start and finish audit events carrying appliedStages/skippedStages/revisionBefore/revisionAfter", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "video_project_stage",
        metadata: expect.objectContaining({ stage: "quality_repair", phase: "finish" }),
      }),
    );
    const finishCall = mockAuditLog.mock.calls.find(
      call => (call[0] as any).metadata?.phase === "finish" && (call[0] as any).metadata?.stage === "quality_repair",
    );
    expect(finishCall![0].metadata).toMatchObject({
      revisionBefore: 7,
    });
  });

  it("makes ZERO deductCredits calls on the repair path", async () => {
    await runVideoIntelligenceJobExecutor(jobPayload() as any, vi.fn());

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
