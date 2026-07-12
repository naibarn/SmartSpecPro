/**
 * Feature 133 (Video Intelligence Platform), section-07 — `videoProjects`
 * router render-pipeline tests: `compileProject` (no side effects),
 * `queueRender` (preview downscale, assetManifest wiring, final claim gate),
 * `exportCaptions`. Mocks `compileVideoProject`, `queueRemotionRenderVideoJob`,
 * and the asset resolver so the router's *wiring* is under test, not the
 * compiler (section-07 §2.2).
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
  mockGetVideoProject,
  mockUpdateVideoProjectFields,
  mockGetBrandKit,
} = vi.hoisted(() => ({
  mockGetVideoProject: vi.fn(),
  mockUpdateVideoProjectFields: vi.fn(() => Promise.resolve({})),
  mockGetBrandKit: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../services/videoProjectRepo", () => ({
  insertVideoProject: vi.fn(),
  getVideoProject: mockGetVideoProject,
  listVideoProjects: vi.fn(),
  saveVideoProjectDocument: vi.fn(),
  listVideoProjectRevisions: vi.fn(),
  restoreVideoProjectRevision: vi.fn(),
  updateVideoProjectFields: mockUpdateVideoProjectFields,
  deleteVideoProject: vi.fn(),
  insertBrandKit: vi.fn(),
  getBrandKit: mockGetBrandKit,
  listBrandKits: vi.fn(),
  updateBrandKit: vi.fn(),
  deleteBrandKit: vi.fn(),
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

vi.mock("../../remotion/templates", () => ({ MOTION_TEMPLATE_REGISTRY: {} }));

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
  // F133-01 checkpoint 1 lives in `saveDocument` — `queueRender` tests here
  // don't call it, but the module mock must still export it since the
  // router imports it.
  assertSceneLayerAssetUrlsAllowed: vi.fn(),
}));

const { mockQueueRemotionRenderVideoJob } = vi.hoisted(() => ({
  mockQueueRemotionRenderVideoJob: vi.fn(),
}));
vi.mock("../../services/workerSchedulerService", () => ({
  queueRemotionRenderVideoJob: mockQueueRemotionRenderVideoJob,
}));

const { mockDispatchLaneARemotionRenderJob } = vi.hoisted(() => ({
  mockDispatchLaneARemotionRenderJob: vi.fn(() => Promise.resolve()),
}));
vi.mock("../../services/videoIntelligenceJobs", () => ({
  dispatchLaneARemotionRenderJob: mockDispatchLaneARemotionRenderJob,
  enqueueVideoIntelligenceJob: vi.fn(),
  getGenerationJobStatus: vi.fn(),
  getActiveGenerationJob: vi.fn(),
}));

const { mockValidateProjectClaims } = vi.hoisted(() => ({ mockValidateProjectClaims: vi.fn() }));
vi.mock("../../services/validateProjectClaims", () => ({
  validateProjectClaims: mockValidateProjectClaims,
}));

vi.mock("../../services/videoProjectQualityMetrics", () => ({
  computeQualityMetrics: vi.fn(),
}));
vi.mock("../../services/ttsService", () => ({
  synthesize: vi.fn(),
  calculateTTSCredits: vi.fn(() => 0),
}));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(() => Promise.resolve(true)),
  deductCredits: vi.fn(() => Promise.resolve({})),
}));
vi.mock("../../storage", () => ({ storagePut: vi.fn() }));

const { mockRenderTranscriptCuesAsSrt, mockRenderTranscriptCuesAsVtt } = vi.hoisted(() => ({
  mockRenderTranscriptCuesAsSrt: vi.fn(() => "SRT-OUTPUT"),
  mockRenderTranscriptCuesAsVtt: vi.fn(() => "VTT-OUTPUT"),
}));
vi.mock("../../services/hyperframesTranscriptionService", () => ({
  renderTranscriptCuesAsSrt: mockRenderTranscriptCuesAsSrt,
  renderTranscriptCuesAsVtt: mockRenderTranscriptCuesAsVtt,
}));

vi.mock("../../services/marketplaceInsightService", () => ({
  listMarketplaceInsightsByProduct: vi.fn(() => Promise.resolve([])),
}));

import { videoProjectsRouter } from "../videoProjects";
import type { VideoProjectDocument } from "../../../shared/videoIntelligence/projectSchemas";
import type { RemotionTemplateConfig } from "../../../shared/remotion/layerTemplateSchemas";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const router = videoProjectsRouter as unknown as Record<string, any>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role?: string } | null }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42, role: "user" }, ...overrides };
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
        narration: "สินค้านี้ดีที่สุด",
        narrationAudioAssetId: null,
        visual: { kind: "layers" },
        layers: [],
        motion: { intensity: "medium", camera: "static" },
        captionCues: [{ startMs: 0, endMs: 1000, text: "สินค้านี้ดีที่สุด" }],
      },
    ],
    audioTracks: [],
    captions: { presetId: "no_subtitle_style", burnIn: false, language: "th" },
    claims: [],
    qa: { targetScore: 7, maxLoops: 1 },
    ...overrides,
  } as VideoProjectDocument;
}

function fakeConfig(overrides: Partial<RemotionTemplateConfig> = {}): RemotionTemplateConfig {
  return {
    id: "video_intelligence_compiled",
    name: "Video Intelligence Compiled Project",
    width: 1080,
    height: 1920,
    fps: 30,
    durationInFrames: 150,
    layers: [
      {
        id: "video-layer-1",
        type: "video",
        startFrame: 0,
        durationFrames: 150,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotationDeg: 0,
        opacity: 1,
        zIndex: 0,
        src: "https://cdn.example.com/clip.mp4",
        trimStartSec: 0,
        volume: 1,
        muted: false,
      },
    ],
    ...overrides,
  } as RemotionTemplateConfig;
}

function fakeResolver() {
  return {
    url: vi.fn((id: number | string) => `/uploads/${id}`),
    sha256: vi.fn(() => undefined),
    sha256ByUrl: vi.fn(() => undefined),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ videoIntelligencePlatformEnabled: true });
  mockGetBrandKit.mockResolvedValue(null);
  mockValidateProjectClaims.mockReturnValue({
    mappedClaims: [],
    unmappedStatements: [],
    prohibitedClaims: [],
    coverage: 1,
    blocksFinalRender: false,
  });
});

describe("compileProject", () => {
  it("returns config + cost with no side effects", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    const cost = { score: 42, cls: "low" as const, recommendPreRender: false };
    const config = fakeConfig();
    mockCompileVideoProject.mockReturnValueOnce({ kind: "single", config, cost });

    const result = await router.compileProject({ ctx: ctx(), input: { projectId: 1 } });

    expect(result).toEqual({ kind: "single", config, cost });
    expect(mockDb.insert).not.toHaveBeenCalled();
    expect(mockQueueRemotionRenderVideoJob).not.toHaveBeenCalled();
  });
});

describe("queueRender", () => {
  it("preview downscales to ≤540×960 / fps≤15 before queueing", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig({ width: 1080, height: 1920, fps: 30, durationInFrames: 300 }),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockBuildAssetManifest.mockReturnValueOnce({ sources: [] });
    mockQueueRemotionRenderVideoJob.mockResolvedValueOnce({ created: true, job: { id: "job-1" } });

    await router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "preview" } });

    expect(mockQueueRemotionRenderVideoJob).toHaveBeenCalledTimes(1);
    const call = mockQueueRemotionRenderVideoJob.mock.calls[0]![0];
    expect(call.renderProfile.width).toBeLessThanOrEqual(540);
    expect(call.renderProfile.height).toBeLessThanOrEqual(960);
    expect(call.renderProfile.fps).toBeLessThanOrEqual(15);
    expect(call.renderProfile.profile).toBe("preview");
  });

  it("wires assetManifest from buildAssetManifest into the payload", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig(),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockBuildAssetManifest.mockReturnValueOnce({
      sources: [{ role: "video", url: "https://cdn.example.com/clip.mp4", sha256: undefined }],
    });
    mockQueueRemotionRenderVideoJob.mockResolvedValueOnce({ created: true, job: { id: "job-2" } });

    await router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "final" } });

    const call = mockQueueRemotionRenderVideoJob.mock.calls[0]![0];
    expect(call.assetManifest.sources).toHaveLength(1);
    expect(call.assetManifest.sources[0].url).toBe("https://cdn.example.com/clip.mp4");
    expect(call.assetManifest.sources[0].role).toBe("video");
    expect(typeof call.assetManifest.sources[0].sha256).toBe("string");
    expect(call.assetManifest.sources[0].sha256.length).toBeGreaterThanOrEqual(8);
  });

  it("wires real captionLines (absolute-timeline seconds) into the payload when captions.burnIn is true (implementation-progress.md gap #3)", async () => {
    const document = baseDocument({
      captions: { presetId: "minimal_shadow", burnIn: true, language: "th" },
      scenes: [
        {
          sceneId: "scene-1",
          startMs: 1000,
          endMs: 6000,
          narration: "สินค้านี้ดีที่สุด",
          narrationAudioAssetId: null,
          visual: { kind: "layers" },
          layers: [],
          motion: { intensity: "medium", camera: "static" },
          captionCues: [
            { startMs: 0, endMs: 1000, text: "สินค้านี้ดีที่สุด" },
            { startMs: 1000, endMs: 2000, text: "ลองใช้ดูสิ" },
          ],
        },
      ],
    });
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig(),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockBuildAssetManifest.mockReturnValueOnce({ sources: [] });
    mockQueueRemotionRenderVideoJob.mockResolvedValueOnce({ created: true, job: { id: "job-caption" } });

    await router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "preview" } });

    const call = mockQueueRemotionRenderVideoJob.mock.calls[0]![0];
    expect(call.postPasses).toEqual(["loudnorm", "ass_burn"]);
    expect(call.captionLines).toEqual([
      { startSec: 1, endSec: 2, text: "สินค้านี้ดีที่สุด" },
      { startSec: 2, endSec: 3, text: "ลองใช้ดูสิ" },
    ]);
    // implementation-progress.md gap #3 follow-up: the author's chosen
    // preset must also be threaded through (not the "no_subtitle_style"
    // sentinel), otherwise the burned .ass file has zero visible Dialogue
    // events regardless of captionLines content.
    expect(call.captionPresetId).toBe("minimal_shadow");
  });

  it("omits captionLines and captionPresetId when captions.burnIn is false", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig(),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockBuildAssetManifest.mockReturnValueOnce({ sources: [] });
    mockQueueRemotionRenderVideoJob.mockResolvedValueOnce({ created: true, job: { id: "job-no-caption" } });

    await router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "preview" } });

    const call = mockQueueRemotionRenderVideoJob.mock.calls[0]![0];
    expect(call.postPasses).toEqual(["loudnorm"]);
    expect(call.captionLines).toBeUndefined();
    expect(call.captionPresetId).toBeUndefined();
  });

  it("final profile is blocked by a prohibited/unmapped claim (VI_CLAIM_VIOLATION)", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({
      id: 1,
      revision: 1,
      document,
      sourceRefs: { productIds: ["prod-1"] },
    });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig(),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockValidateProjectClaims.mockReturnValueOnce({
      mappedClaims: [],
      unmappedStatements: [{ statement: "guaranteed to cure", sceneId: "scene-1" }],
      prohibitedClaims: [{ claim: "guaranteed to cure", status: "prohibited" }],
      coverage: 0,
      blocksFinalRender: true,
    });

    await expect(
      router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "final" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringContaining("VI_CLAIM_VIOLATION") });

    expect(mockQueueRemotionRenderVideoJob).not.toHaveBeenCalled();
  });

  it("F133-02 fix: rejects final render of a catalog-studio project with missing/empty sourceRefs.productIds (VI_MISSING_SOURCE_REFS)", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({
      id: 1,
      revision: 1,
      document,
      studioType: "catalog",
      sourceRefs: null,
    });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig(),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });

    await expect(
      router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "final" } }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VI_MISSING_SOURCE_REFS"),
    });

    // The claim gate must never even run — there is nothing to validate
    // against without a resolved catalog, which is exactly the bypass this
    // closes.
    expect(mockValidateProjectClaims).not.toHaveBeenCalled();
    expect(mockQueueRemotionRenderVideoJob).not.toHaveBeenCalled();
  });

  it("F133-02 fix: a catalog-studio project WITH sourceRefs.productIds proceeds to the claim gate as before (no regression)", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({
      id: 1,
      revision: 1,
      document,
      studioType: "catalog",
      sourceRefs: { productIds: ["prod-1"] },
    });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig(),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockBuildAssetManifest.mockReturnValueOnce({ sources: [] });
    mockQueueRemotionRenderVideoJob.mockResolvedValueOnce({ created: true, job: { id: "job-catalog-ok" } });

    await router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "final" } });

    expect(mockValidateProjectClaims).toHaveBeenCalledTimes(1);
    expect(mockQueueRemotionRenderVideoJob).toHaveBeenCalledTimes(1);
  });

  it("F133-02 fix: a motion-studio project with no sourceRefs still renders normally (unaffected — the missing-sourceRefs requirement is catalog-only)", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({
      id: 1,
      revision: 1,
      document,
      studioType: "motion",
      sourceRefs: null,
    });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig(),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockBuildAssetManifest.mockReturnValueOnce({ sources: [] });
    mockQueueRemotionRenderVideoJob.mockResolvedValueOnce({ created: true, job: { id: "job-motion-ok" } });

    await router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "final" } });

    expect(mockQueueRemotionRenderVideoJob).toHaveBeenCalledTimes(1);
  });

  it("preview profile skips the claim gate entirely (validateProjectClaims not called)", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "single",
      config: fakeConfig(),
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });
    mockBuildAssetManifest.mockReturnValueOnce({ sources: [] });
    mockQueueRemotionRenderVideoJob.mockResolvedValueOnce({ created: true, job: { id: "job-3" } });

    await router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "preview" } });

    expect(mockValidateProjectClaims).not.toHaveBeenCalled();
  });

  it("rejects a segmented compile (Phase-1 single-job-only render contract)", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });
    mockResolveProjectAssets.mockResolvedValueOnce(fakeResolver());
    mockCompileVideoProject.mockReturnValueOnce({
      kind: "segmented",
      parts: [fakeConfig()],
      concat: { parts: [{ index: 0, durationInFrames: 150 }] },
      cost: { score: 1, cls: "low", recommendPreRender: false },
    });

    await expect(
      router.queueRender({ ctx: ctx(), input: { projectId: 1, profile: "final" } }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VI_SEGMENTED_RENDER_NOT_SUPPORTED"),
    });
    expect(mockQueueRemotionRenderVideoJob).not.toHaveBeenCalled();
  });
});

describe("exportCaptions", () => {
  it("returns SRT and VTT via the reused renderers", async () => {
    const document = baseDocument();
    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });

    const srtResult = await router.exportCaptions({ ctx: ctx(), input: { projectId: 1, format: "srt" } });
    expect(srtResult).toEqual({ format: "srt", content: "SRT-OUTPUT" });
    expect(mockRenderTranscriptCuesAsSrt).toHaveBeenCalledWith([
      { index: 1, text: "สินค้านี้ดีที่สุด", start: 0, end: 1 },
    ]);

    mockGetVideoProject.mockResolvedValueOnce({ id: 1, revision: 1, document, sourceRefs: null });
    const vttResult = await router.exportCaptions({ ctx: ctx(), input: { projectId: 1, format: "vtt" } });
    expect(vttResult).toEqual({ format: "vtt", content: "VTT-OUTPUT" });
    expect(mockRenderTranscriptCuesAsVtt).toHaveBeenCalledWith([
      { index: 1, text: "สินค้านี้ดีที่สุด", start: 0, end: 1 },
    ]);
  });
});
