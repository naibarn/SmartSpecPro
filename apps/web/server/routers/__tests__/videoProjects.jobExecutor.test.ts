/**
 * Feature 142 — section-08 §5.2. `runVideoIntelligenceJobExecutor`
 * (`videoProjects.ts:562-587` region) had NO dedicated test file before this
 * section — it is exercised only incidentally inside
 * `videoProjects.stages.test.ts`'s per-stage deep-dive describes. This file
 * is a SEPARATE entry point test: routing across all four kinds + the
 * unknown-kind path, result JSON-serialisability (the result round-trips
 * through Redis, so a `Date`/`Map`/`Error` would be silent data loss), the
 * auth scope built from the PAYLOAD (a BullMQ worker has no `ctx`), and
 * error containment through `runVideoIntelligenceJob` (`videoIntelligenceJobs.ts`).
 *
 * Mock header copied from `videoProjects.stages.test.ts` (itself copied from
 * `videoProjects.render.test.ts:11-160`) with ONE deliberate difference:
 * `../../services/videoIntelligenceJobs` is left UNMOCKED here so the
 * "record.error" integration test can drive the REAL
 * `runVideoIntelligenceJob` against an injected in-memory fake Redis — no
 * network Redis call is ever made, dependencies are always explicit.
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

// The real registry (pure, no I/O) — the real `videoProjectScenePlanner`
// (also unmocked below) reads it directly.
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

vi.mock("../../services/workerSchedulerService", () => ({
  queueRemotionRenderVideoJob: vi.fn(),
}));

// Deliberately UNMOCKED (see file header) — the "record.error" integration
// test drives the real `runVideoIntelligenceJob` + `enqueueVideoIntelligenceJob`
// with an injected in-memory fake Redis. No test in this file calls a
// dispatch-side router mutation, so leaving this real never touches a
// network Redis connection.
import {
  runVideoIntelligenceJob,
  enqueueVideoIntelligenceJob,
  getGenerationJobStatus,
  type VideoIntelligenceJobRedisAdapter,
} from "../../services/videoIntelligenceJobs";

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
  mockCalculateCreditsForLLMDynamic: vi.fn((inputTokens: number, outputTokens: number) =>
    Promise.resolve(Math.max(1, Math.ceil((inputTokens + outputTokens) / 100))),
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

import { runVideoIntelligenceJobExecutor } from "../videoProjects";
import type { VideoProjectDocument } from "../../../shared/videoIntelligence/projectSchemas";

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
    revision: 7,
    status: "content",
    document: baseDocument(),
    sourceRefs: null,
    studioType: "motion",
    qaLedger: null,
    ...overrides,
  };
}

function scenePlanPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: "scene_plan" as const,
    tenantId: "tenant-1",
    userId: 42,
    projectId: 1,
    input: {
      traceId: "trace-1",
      modelId: "model-a",
      modelSource: "recommended",
      previousStatus: "content",
      baseRevision: 7,
      ...overrides,
    },
  };
}

function qualityReviewPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: "quality_review" as const,
    tenantId: "tenant-1",
    userId: 42,
    projectId: 1,
    input: {
      traceId: "trace-1",
      modelId: "model-a",
      modelSource: "recommended",
      previousStatus: "content",
      baseRevision: 7,
      ...overrides,
    },
  };
}

function qualityRepairPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: "quality_repair" as const,
    tenantId: "tenant-1",
    userId: 42,
    projectId: 1,
    input: {
      traceId: "trace-1",
      modelId: "model-a",
      modelSource: "recommended",
      previousStatus: "qa",
      baseRevision: 7,
      stages: [],
      ...overrides,
    },
  };
}

function narrationPayload(overrides: Record<string, unknown> = {}) {
  return {
    kind: "narration" as const,
    tenantId: "tenant-1",
    userId: 42,
    projectId: 1,
    input: { ...overrides },
  };
}

function scenePlanOutputFixture(overrides: Record<string, unknown> = {}) {
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

function reviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    score: 8,
    scorecard: { clarity: 8 },
    issues: [{ dimension: "clarity", severity: "low", message: "fine" }],
    ...overrides,
  };
}

function storedReviewFixture(overrides: Record<string, unknown> = {}) {
  return {
    score: 4,
    scorecard: { content: 4 },
    issues: [{ dimension: "content", severity: "high", message: "needs work" }],
    repairInstructions: [{ stage: "narration", instruction: "tighten it" }],
    ...overrides,
  };
}

function ledgerWith(review: Record<string, unknown>, revision = 7) {
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
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ videoIntelligencePlatformEnabled: true });
  mockGetBrandKit.mockResolvedValue(null);
  mockUpdateVideoProjectFields.mockResolvedValue({});
  mockHasEnoughCredits.mockResolvedValue(true);
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

  mockGetVideoProject.mockResolvedValue(projectRow());
  mockMakeRunPlanSkill.mockReturnValue(vi.fn(async () => scenePlanOutputFixture()));
  mockMakeRunReview.mockReturnValue(vi.fn(async () => reviewFixture()));
  mockRunVideoProjectQualityLoop.mockImplementation(async (args: any) => {
    const review = args.initialReview ?? (await args.effects.runReview({ projectId: args.projectId, metrics: args.metrics }));
    await args.effects.persistReview(review);
    return { rounds: 1, bestReview: review, history: [review] };
  });
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

describe("runVideoIntelligenceJobExecutor — routing", () => {
  it("routes kind 'scene_plan' to the scene-plan stage", async () => {
    await runVideoIntelligenceJobExecutor(scenePlanPayload() as any, vi.fn());

    expect(mockMakeRunPlanSkill).toHaveBeenCalledTimes(1);
    expect(mockMakeRunReview).not.toHaveBeenCalled();
    expect(mockCreateRepairRoundSession).not.toHaveBeenCalled();
  });

  it("routes kind 'quality_review' to the quality-review stage", async () => {
    await runVideoIntelligenceJobExecutor(qualityReviewPayload() as any, vi.fn());

    expect(mockRunVideoProjectQualityLoop).toHaveBeenCalledTimes(1);
    expect(mockAppendQaLedgerEntry).toHaveBeenCalledTimes(1);
    expect(mockMakeRunPlanSkill).not.toHaveBeenCalled();
    expect(mockCreateRepairRoundSession).not.toHaveBeenCalled();
  });

  it("routes kind 'quality_repair' to the quality-repair stage", async () => {
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 7, qaLedger: ledgerWith(storedReviewFixture()) }),
    );

    await runVideoIntelligenceJobExecutor(qualityRepairPayload() as any, vi.fn());

    expect(mockCreateRepairRoundSession).toHaveBeenCalledTimes(1);
    expect(mockMakeRunPlanSkill).not.toHaveBeenCalled();
  });

  it("treats kind 'narration' as a documented no-op and emits narration_noop", async () => {
    const onProgress = vi.fn();
    const result = (await runVideoIntelligenceJobExecutor(narrationPayload() as any, onProgress)) as Record<
      string,
      unknown
    >;

    expect(result).toMatchObject({ skipped: true });
    expect(onProgress).toHaveBeenCalledWith({ stage: "narration_noop" });
    expect(mockGetVideoProject).not.toHaveBeenCalled();
  });

  it("throws a greppable error for an unknown kind", async () => {
    const badPayload = { ...scenePlanPayload(), kind: "totally_unknown_kind" };

    await expect(runVideoIntelligenceJobExecutor(badPayload as any, vi.fn())).rejects.toThrow(
      /Unknown video intelligence job kind: totally_unknown_kind/,
    );
  });

  it("builds the ProjectAuthScope from the payload's tenantId and userId, not from ctx", async () => {
    await runVideoIntelligenceJobExecutor(
      qualityReviewPayload({}) as any,
      vi.fn(),
    );
    // Re-derive with a DIFFERENT tenant/user to prove the auth scope tracks
    // the payload, not some fixed/ambient value.
    vi.clearAllMocks();
    mockGetTenantFeatureFlags.mockResolvedValue({ videoIntelligencePlatformEnabled: true });
    mockGetVideoProject.mockResolvedValue(projectRow());
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
    mockComputeQualityMetrics.mockReturnValue({ claimCoverage: { coverage: 1 }, layerCounts: { total: 0 } });
    mockCompileVideoProject.mockReturnValue({
      kind: "single",
      config: { id: "cfg", name: "cfg", width: 1080, height: 1920, fps: 30, durationInFrames: 150, layers: [] },
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockMakeRunReview.mockReturnValue(vi.fn(async () => reviewFixture()));
    mockRunVideoProjectQualityLoop.mockImplementation(async (args: any) => {
      const review = await args.effects.runReview({ projectId: args.projectId, metrics: args.metrics });
      await args.effects.persistReview(review);
      return { rounds: 1, bestReview: review, history: [review] };
    });

    const differentTenantPayload = qualityReviewPayload();
    (differentTenantPayload as any).tenantId = "tenant-DIFFERENT";
    (differentTenantPayload as any).userId = 9999;

    await runVideoIntelligenceJobExecutor(differentTenantPayload as any, vi.fn());

    expect(mockGetVideoProject).toHaveBeenCalledWith(
      { tenantId: "tenant-DIFFERENT", userId: 9999 },
      1,
    );
  });
});

describe("runVideoIntelligenceJobExecutor — result shape", () => {
  it("returns a JSON-serialisable result for every kind", async () => {
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 7, qaLedger: ledgerWith(storedReviewFixture()) }),
    );

    for (const payload of [
      scenePlanPayload(),
      qualityReviewPayload(),
      qualityRepairPayload(),
      narrationPayload(),
    ]) {
      const result = await runVideoIntelligenceJobExecutor(payload as any, vi.fn());
      // The round-trip through JSON is the actual contract: a `Date`, a
      // `Map`, or an `Error` embedded in the result becomes silent data loss
      // once it goes through Redis (`videoIntelligenceJobs.ts`'s
      // `JSON.stringify(record)`).
      expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("returns a result carrying creditsUsed and modelId for scene_plan", async () => {
    const result = (await runVideoIntelligenceJobExecutor(scenePlanPayload() as any, vi.fn())) as Record<
      string,
      unknown
    >;
    expect(typeof result.creditsUsed).toBe("number");
    expect(result.modelId).toBe("model-a");
  });

  it("returns a result carrying creditsUsed and modelId for quality_review", async () => {
    const result = (await runVideoIntelligenceJobExecutor(qualityReviewPayload() as any, vi.fn())) as Record<
      string,
      unknown
    >;
    expect(typeof result.creditsUsed).toBe("number");
    expect(result.modelId).toBe("model-a");
  });

  it("emits onProgress at each stage boundary, in order (scene_plan)", async () => {
    const onProgress = vi.fn();
    await runVideoIntelligenceJobExecutor(scenePlanPayload() as any, onProgress);

    const stages = onProgress.mock.calls.map(call => call[0].stage);
    expect(stages).toEqual(["scene_plan_start", "scene_plan_planning", "scene_plan_persisted"]);
  });

  it("emits onProgress at each stage boundary, in order (quality_repair)", async () => {
    mockGetVideoProject.mockResolvedValue(
      projectRow({ revision: 7, qaLedger: ledgerWith(storedReviewFixture()) }),
    );
    const onProgress = vi.fn();
    await runVideoIntelligenceJobExecutor(qualityRepairPayload() as any, onProgress);

    const stages = onProgress.mock.calls.map(call => call[0].stage);
    expect(stages).toEqual([
      "quality_repair_start",
      "quality_repair_applying",
      "quality_repair_rereview",
      "quality_repair_persisted",
    ]);
  });
});

describe("runVideoIntelligenceJobExecutor — error containment", () => {
  it("lets a thrown scene_plan error reject rather than resolving to a success-shaped result", async () => {
    mockMakeRunPlanSkill.mockReturnValue(
      vi.fn(async () => {
        throw new Error("planner exploded");
      }),
    );

    await expect(runVideoIntelligenceJobExecutor(scenePlanPayload() as any, vi.fn())).rejects.toThrow(
      /planner exploded/,
    );
  });

  it("does not swallow an error into a successful-looking result", async () => {
    mockMakeRunReview.mockReturnValue(
      vi.fn(async () => {
        throw new Error("review call exploded");
      }),
    );
    mockRunVideoProjectQualityLoop.mockImplementation(async (args: any) => {
      // Force the real effect through so the thrown error actually propagates.
      await args.effects.runReview({ projectId: args.projectId, metrics: args.metrics });
      return { rounds: 1, bestReview: reviewFixture(), history: [] };
    });

    let thrown: unknown;
    let result: unknown;
    try {
      result = await runVideoIntelligenceJobExecutor(qualityReviewPayload() as any, vi.fn());
    } catch (error) {
      thrown = error;
    }

    expect(result).toBeUndefined();
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(/review call exploded/);
  });

  it("lets a thrown stage error reject — runVideoIntelligenceJob turns it into record.error", async () => {
    mockMakeRunPlanSkill.mockReturnValue(
      vi.fn(async () => {
        throw new Error("planner exploded for real");
      }),
    );

    const store = new Map<string, string>();
    const fakeRedis: VideoIntelligenceJobRedisAdapter & { store: Map<string, string> } = {
      store,
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      set: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
        return "OK";
      }),
      del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    };

    const { jobId } = await enqueueVideoIntelligenceJob(
      { kind: "scene_plan", tenantId: "tenant-1", userId: 42, projectId: 1, input: scenePlanPayload().input },
      { redis: fakeRedis, enqueueBullmqJob: vi.fn().mockResolvedValue(undefined) },
    );

    await runVideoIntelligenceJob(jobId, runVideoIntelligenceJobExecutor, { redis: fakeRedis });

    const record = await getGenerationJobStatus(
      jobId,
      { tenantId: "tenant-1", userId: 42, projectId: 1 },
      { redis: fakeRedis },
    );

    expect(record?.status).toBe("failed");
    expect(record?.error).toMatch(/planner exploded for real/);
    expect(record?.result).toBeNull();
  });

  it("records a stage run for the schema-failure-rate denominator on BOTH success and failure", async () => {
    const observability = await import("../../services/videoIntelligenceObservability");
    const recordSpy = vi.spyOn(observability, "recordVideoIntelligenceStageRun");

    await runVideoIntelligenceJobExecutor(scenePlanPayload() as any, vi.fn());
    expect(recordSpy).toHaveBeenCalledWith("scene_plan");

    recordSpy.mockClear();
    mockMakeRunPlanSkill.mockReturnValue(
      vi.fn(async () => {
        throw new Error("planner exploded");
      }),
    );
    await expect(runVideoIntelligenceJobExecutor(scenePlanPayload() as any, vi.fn())).rejects.toThrow();
    expect(recordSpy).toHaveBeenCalledWith("scene_plan");

    recordSpy.mockRestore();
  });
});
