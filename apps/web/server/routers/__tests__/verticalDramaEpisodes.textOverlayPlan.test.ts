/**
 * Vertical Drama Episodes — Text Overlay Suite coverage (F131AB, task #34,
 * `planning/vertical-drama-end-card-teaser/plan.md` v2):
 *  - `updateEpisodeTextOverlayPlan` — flag gate, ownership, duration-bound
 *    validation, persistence, warning pass-through.
 *  - `getEpisodeDetail` — additive `textOverlayPlan`/`textOverlayPreview`/
 *    `flags.textOverlaySuite`, flag-gated (ZERO extra `db.select` calls when
 *    off — this query's own test suite hard-asserts exact select counts).
 *  - `assembleEpisodeVideo` — additive overlay/watermark feeding into
 *    `submitAssemblyJob` (merged into the SAME `subtitles` object dialogue
 *    captions use).
 *
 * Same "mock everything to a minimal no-op shape purely so the module can be
 * imported" convention as `verticalDramaEpisodes.adBannerPlan.test.ts`
 * (extended here with `services/verticalDramaTextOverlayResolution`, the ONE
 * new lazy-loaded dependency this wave adds).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetModelsByTypeAsync } = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  resolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  })),
  deriveModelResolutionOptions: vi.fn(() => undefined),
}));

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
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

const {
  mockGenerateImageAsync,
  mockGenerateAudioAsync,
  mockGenerateVideoAsync,
} = vi.hoisted(() => ({
  mockGenerateImageAsync: vi.fn(),
  mockGenerateAudioAsync: vi.fn(),
  mockGenerateVideoAsync: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: mockGenerateImageAsync,
    generateAudioAsync: mockGenerateAudioAsync,
    generateVideoAsync: mockGenerateVideoAsync,
  },
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo3/generate-veo-3-video-lite",
    audio: "uvoice/tts-premium",
  },
}));

const { mockCalculateCreditCost } = vi.hoisted(() => ({
  mockCalculateCreditCost: vi.fn(
    (model: { creditCost: number }) => model.creditCost
  ),
}));
vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: mockCalculateCreditCost,
}));

const { mockHasEnoughCredits, mockDeductCredits, mockRefundCredits } =
  vi.hoisted(() => ({
    mockHasEnoughCredits: vi.fn(),
    mockDeductCredits: vi.fn(),
    mockRefundCredits: vi.fn(),
  }));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  refundCredits: mockRefundCredits,
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "token"),
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(() => true),
    getResetTime: vi.fn(() => 0),
  },
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: vi.fn() },
}));

// Location visual bible, Phase D (planning/polished-toasting-gadget.md) —
// `getEpisodeDetail`'s new `episodeLocations` field resolves through
// `verticalDramaLocationStockService.listRows`, mocked here the same way as
// `verticalDramaCharacterStockService` above (its real implementation uses
// `.innerJoin(...)`, not implemented by this file's `selectChain` helper).
// Defaults to an empty roster — every pre-existing test in this file never
// asserts on `episodeLocations`, so this is purely additive.
vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    getPrimaryReferenceUrl: vi.fn(),
    getPrimaryReferenceAssetId: vi.fn(),
    listRows: vi.fn(() => Promise.resolve([])),
  },
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
  // Async stage set + generalized submit
  // (`planning/vd-async-stage-jobs-generalization/plan.md`) — the router
  // reads both on every runStage call, so a factory without them throws
  // before the behavior under test is reached.
  VERTICAL_DRAMA_ASYNC_STAGES: new Set([
    "storyboard_shotgrid",
    "plan_episode_script",
  ]),
  verticalDramaEpisodePipeline: {},
  VerticalDramaEpisodePipeline: class {},
  VERTICAL_DRAMA_PIPELINE_STAGES: ["plan_episode_script"],
  VERTICAL_DRAMA_RUNNER_MODES: ["dry_run", "full"],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
}));

vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: {},
  memoryRowToEvent: vi.fn(),
}));

vi.mock("../../services/verticalDramaEpisodeContinuation", () => ({
  generateNextEpisodesViaLlm: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../services/verticalDramaShotReferences", () => ({
  verticalDramaShotReferencesService: {
    listForEpisode: vi.fn(),
    listForShot: vi.fn(),
    linkReference: vi.fn(),
    deleteReference: vi.fn(),
    reorder: vi.fn(),
  },
  VerticalDramaShotReferenceError: class extends Error {
    constructor(
      public reason: string,
      message: string
    ) {
      super(message);
    }
  },
}));

vi.mock("../../services/verticalDramaEpisodeQualityReview", () => ({
  runVerticalDramaEpisodeQualityReview: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
}));

vi.mock("../../services/verticalDramaSeriesMemoryPlanning", () => ({
  runVerticalDramaSeriesMemoryPlanning: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
}));

vi.mock("../../services/verticalDramaVideoPromptFormatter", () => ({
  formatVideoClipRequest: vi.fn(() => ({
    prompt: "formatted prompt",
    negativePrompt: undefined,
    providerFamily: "veo",
    nativeAudioDialogue: true,
    generateAudio: true,
    ttsFallback: false,
    ttsLines: [],
    maxReferenceImages: 3,
    supportsStartFrame: true,
  })),
}));

vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt: vi.fn(),
}));

vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));

vi.mock("../../services/verticalDramaEpisodeVideoAssembly", () => ({
  extractClipSourcesFromMotionPromptPack: vi.fn(() => []),
  resolveClipsForAssembly: vi.fn(() => ({ ordered: [], missing: [] })),
  // no longer the primary path — see queueVerticalDramaFfmpegAssemblyJob
  submitAssemblyJob: vi.fn(async () => ({ jobId: "job-1" })),
  // Vertical Drama Render Queue plan §4.2 Wave 3 — `assembleEpisodeVideo`
  // persists `assemblyManifest.compiledVideo = {status:"pending", pendingJobId}`
  // right after enqueueing.
  persistCompiledVideoState: vi.fn(async () => undefined),
  compiledVideoFilename: vi.fn(() => "compiled.mp4"),
  resolveEpisodeDialogueAudioAndSubtitlesRunInputs: vi.fn(() => ({
    dialogueAudioSegmentsIncluded: 0,
    subtitleLinesIncluded: 0,
  })),
  repairVerticalDramaVideoAssetUrls: vi.fn((pack: unknown) => pack),
}));

// Vertical Drama Render Queue plan §4.2 Wave 3 — `assembleEpisodeVideo`
// enqueues via this lazily-imported service instead of calling
// `submitAssemblyJob` in-process; mocked here the SAME way so
// `assembleEpisodeVideo`'s dynamic `await import(...)` resolves to this
// stub instead of the real module (which calls `createRateLimiter(...)` at
// load time — see that router file's own import-block doc comment).
const { mockQueueVerticalDramaFfmpegAssemblyJob } = vi.hoisted(() => ({
  mockQueueVerticalDramaFfmpegAssemblyJob: vi.fn(async () => ({
    created: true,
    job: { id: "job-1" },
  })),
}));
vi.mock("../../services/workerSchedulerService", () => ({
  queueVerticalDramaFfmpegAssemblyJob: mockQueueVerticalDramaFfmpegAssemblyJob,
}));

// `planning/vd-remotion-render-option/plan.md` wave 1 (2026-07-31) — Remotion
// is now the DEFAULT engine `assembleEpisodeVideo` tries FIRST (only an
// explicit `renderEngine: "ffmpeg"`, or a Remotion failure, falls through to
// `queueVerticalDramaFfmpegAssemblyJob` above). Mocked the same lazy-import
// way so the router's `await import("../services/verticalDramaRemotionRender")`
// resolves to this stub instead of the real module (which statically imports
// `queueRemotionRenderVideoJob` from `workerSchedulerService` — an export the
// mock above deliberately doesn't carry, since nothing in this suite exercises
// the real Remotion submission plumbing). Every `assembleEpisodeVideo` test in
// this file takes the DEFAULT path, so asserting on THIS mock's call args is
// what proves the overlay/watermark feed actually reaches production's real
// (Remotion) engine — not a dead ffmpeg fallback nobody hits.
const { mockSubmitVdRemotionAssembly } = vi.hoisted(() => ({
  mockSubmitVdRemotionAssembly: vi.fn(async () => ({
    jobId: "job-1",
    created: true,
    layerCount: 1,
    videoDurationSeconds: 10,
  })),
}));
vi.mock("../../services/verticalDramaRemotionRender", () => ({
  submitVdRemotionAssembly: mockSubmitVdRemotionAssembly,
  reconcileVdRemotionAssembly: vi.fn(async () => ({ reconciled: false })),
}));

const { mockResolveVdEpisodeTextOverlayEngineInputs } = vi.hoisted(() => ({
  mockResolveVdEpisodeTextOverlayEngineInputs: vi.fn(),
}));
vi.mock("../../services/verticalDramaTextOverlayResolution", () => ({
  resolveVdEpisodeTextOverlayEngineInputs:
    mockResolveVdEpisodeTextOverlayEngineInputs,
  loadVdSeriesTextOverlayContext: vi.fn(async () => ({
    seriesTitle: "Midnight Vows",
    targetEpisodeCount: 10,
    watermark: null,
  })),
  resolveVdEndCardAndOpenerAutoTexts: vi.fn(async () => ({
    endCard: { text: "auto end card", source: "fallback" },
    openerRecap: { text: "", source: "none" },
  })),
  resolveVdCharacterIntroCardsForEpisode: vi.fn(async () => []),
}));

vi.mock("../../services/appRuntimeConfig", () => ({
  getCachedAppRuntimeConfig: vi.fn(() => ({
    internalNodeUrl: "http://localhost:3000",
  })),
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

const { mockResolveAdBannerApprovalGate } = vi.hoisted(() => ({
  mockResolveAdBannerApprovalGate: vi.fn(() => false),
}));
vi.mock("../../services/verticalDramaAdBanner", () => ({
  resolveAdBannerApprovalGate: mockResolveAdBannerApprovalGate,
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";
import * as episodeVideoAssembly from "../../services/verticalDramaEpisodeVideoAssembly";

const router = verticalDramaEpisodesRouter as unknown as Record<
  string,
  Function
>;

function ctx(
  overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}
) {
  return {
    tenantId: "tenant-1",
    user: { id: 42 },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function updateChain(rows: unknown[] = []) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

const EPISODE_ROW_BASE = {
  id: 20,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  episodeNumber: 1,
  title: null,
  targetDurationSeconds: 60,
  motionPromptPack: null,
  assemblyManifest: null,
  adBannerPlan: null,
  textOverlayPlan: null,
  startFramePlan: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({
    verticalDramaSeriesTextOverlaySuite: true,
  });
  mockResolveAdBannerApprovalGate.mockReturnValue(false);
  mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue({
    overlays: [],
    watermarkImages: [],
    overlaysIncluded: 0,
  });
});

/* -------------------------------------------------------------------------- */
/* updateEpisodeTextOverlayPlan                                               */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeTextOverlayPlan", () => {
  const validPlan = {
    endCard: {
      enabled: true,
      text: "ติดตามตอนต่อไป",
      durationSec: 3,
      showFollowLine: true,
      styleVariant: "center_card" as const,
    },
  };

  it("throws FORBIDDEN when verticalDramaSeriesTextOverlaySuite is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesTextOverlaySuite: false,
    });

    await expect(
      router.updateEpisodeTextOverlayPlan({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "20", plan: validPlan },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an episode the caller does not own", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.updateEpisodeTextOverlayPlan({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "999", plan: validPlan },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST for an out-of-range end card duration", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));

    await expect(
      router.updateEpisodeTextOverlayPlan({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "20",
          plan: {
            endCard: {
              enabled: true,
              durationSec: 99,
              showFollowLine: true,
              styleVariant: "center_card",
            },
          },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        "VD_TEXT_OVERLAY_END_CARD_DURATION_OUT_OF_RANGE"
      ),
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("persists a valid plan and returns it with an empty warnings list", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));
    const chain = updateChain();
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeTextOverlayPlan({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", plan: validPlan },
    });

    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ textOverlayPlan: validPlan })
    );
    expect(result.plan).toEqual(validPlan);
    expect(result.warnings).toEqual([]);
  });

  it("returns non-blocking warnings alongside the saved plan (e.g. >2 concurrent cards)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));
    mockDb.update.mockReturnValueOnce(updateChain());
    const card = (id: string, offsetSec: number) => ({
      id,
      kind: "narrative_hook" as const,
      anchor: { shotNumber: 1, offsetSec },
      text: "x",
      durationSec: 2,
      enabled: true,
    });
    const planWithOverlap = {
      cards: [card("a", 0), card("b", 0.5), card("c", 1)],
    };

    const result = await router.updateEpisodeTextOverlayPlan({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", plan: planWithOverlap },
    });

    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: "VD_TEXT_OVERLAY_TOO_MANY_CONCURRENT_CARDS",
      }),
    ]);
    // Still persisted despite the warning (warnings never block).
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("accepts an empty plan (grandfather: no kinds enabled)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));
    mockDb.update.mockReturnValueOnce(updateChain());

    const result = await router.updateEpisodeTextOverlayPlan({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", plan: {} },
    });
    expect(result.plan).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* getEpisodeDetail — textOverlayPlan / textOverlayPreview / flags            */
/* -------------------------------------------------------------------------- */

describe("getEpisodeDetail — Text Overlay Suite (F131AB, task #34)", () => {
  it("flag OFF: returns null plan/preview and adds ZERO extra db.select calls", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesTextOverlaySuite: false,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.textOverlayPlan).toBeNull();
    expect(result.textOverlayPreview).toBeNull();
    expect(result.flags.textOverlaySuite).toBe(false);
    expect(mockDb.select).toHaveBeenCalledTimes(3);
    expect(mockResolveVdEpisodeTextOverlayEngineInputs).not.toHaveBeenCalled();
  });

  it("flag ON: returns a preview built from the resolution service, and the parsed saved plan", async () => {
    const savedPlan = {
      endCard: {
        enabled: true,
        text: "manual end card",
        durationSec: 3,
        showFollowLine: true,
        styleVariant: "center_card",
      },
    };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([{ ...EPISODE_ROW_BASE, textOverlayPlan: savedPlan }])
      )
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.textOverlayPlan).toEqual(savedPlan);
    // `deriveTitleBumperLines`/`deriveEpisodeIndicatorLabel`
    // (`@shared/verticalDramaSeries/textOverlay.ts`) label sub-episodes
    // "SUB-EP N[/target]", not "EP N[/target]" — matches the implementation.
    expect(result.textOverlayPreview).toEqual({
      endCard: { text: "auto end card", source: "fallback" },
      openerRecap: { text: "", source: "none" },
      titleBumper: { primary: "Midnight Vows", secondary: "SUB-EP 1" },
      episodeIndicator: { label: "SUB-EP 1/10" },
      characterIntroCards: [],
    });
    expect(result.flags.textOverlaySuite).toBe(true);
  });

  it("flag ON + no saved plan yet: grandfathers a null textOverlayPlan (legacy episode)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });
    expect(result.textOverlayPlan).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* assembleEpisodeVideo — overlay/watermark feeding                          */
/* -------------------------------------------------------------------------- */

describe("assembleEpisodeVideo — Text Overlay Suite feeding (F131AB, task #34)", () => {
  const clipSources = [
    { clipNumber: 1, videoUrl: "https://cdn.example.com/clip1.mp4" },
  ];

  beforeEach(() => {
    vi.mocked(
      episodeVideoAssembly.extractClipSourcesFromMotionPromptPack
    ).mockReturnValue(clipSources as any);
    vi.mocked(episodeVideoAssembly.resolveClipsForAssembly).mockReturnValue({
      ordered: clipSources as any,
      missing: [],
    });
    vi.mocked(episodeVideoAssembly.submitAssemblyJob).mockResolvedValue({
      jobId: "job-1",
    } as any);
  });

  it("flag OFF: submits with no overlays/watermarkImages, returns zeroed counts", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesTextOverlaySuite: false,
    });
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.jobId).toBe("job-1");
    expect(result.textOverlayEventsIncluded).toBe(0);
    expect(result.watermarkIncluded).toBe(false);
    expect(mockResolveVdEpisodeTextOverlayEngineInputs).not.toHaveBeenCalled();
    // Default render engine is Remotion (see the `verticalDramaRemotionRender`
    // mock's own doc comment above) — the ffmpeg queue is never reached.
    const call = mockSubmitVdRemotionAssembly.mock.calls[0]![0] as any;
    expect(call.subtitles).toBeUndefined();
    expect(call.watermarkImages).toBeUndefined();
    expect(mockQueueVerticalDramaFfmpegAssemblyJob).not.toHaveBeenCalled();
  });

  it("flag ON: merges resolved overlays into submitAssemblyJob's subtitles (preset falls back to no_subtitle_style)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));
    const overlayEvent = {
      kind: "end_card",
      text: "จบแล้ว",
      startSec: 57,
      endSec: 60,
      endAnchored: true,
    };
    mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue({
      overlays: [overlayEvent],
      watermarkImages: [],
      overlaysIncluded: 1,
    });

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    const call = mockSubmitVdRemotionAssembly.mock.calls[0]![0] as any;
    expect(call.subtitles).toEqual({
      preset: "no_subtitle_style",
      lines: [],
      fontsDir: undefined,
      overlays: [overlayEvent],
    });
    expect(call.overlays).toEqual([overlayEvent]);
    expect(result.textOverlayEventsIncluded).toBe(1);
  });

  it("flag ON + resolved watermarkImages: threads it into submitAssemblyJob and marks watermarkIncluded", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));
    const watermarkImage = {
      slotId: "primary" as const,
      imageUrl: "https://cdn.example.com/logo.png",
      position: "top_right" as const,
      opacity: 0.45,
      scalePct: 10,
      marginPx: 32,
    };
    mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue({
      overlays: [],
      watermarkImages: [watermarkImage],
      overlaysIncluded: 0,
    });

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    const call = mockSubmitVdRemotionAssembly.mock.calls[0]![0] as any;
    expect(call.watermarkImages).toEqual([watermarkImage]);
    expect(result.watermarkIncluded).toBe(true);
  });

  it("dual watermark: two resolved watermarkImages both thread through to submitVdRemotionAssembly", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));
    const primary = {
      slotId: "primary" as const,
      imageUrl: "https://cdn.example.com/series-logo.png",
      position: "top_right" as const,
      opacity: 0.45,
      scalePct: 10,
      marginPx: 32,
    };
    const secondary = {
      slotId: "secondary" as const,
      imageUrl: "https://cdn.example.com/channel-logo.png",
      position: "bottom_left" as const,
      opacity: 0.6,
      scalePct: 8,
      marginPx: 16,
    };
    mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue({
      overlays: [],
      watermarkImages: [primary, secondary],
      overlaysIncluded: 0,
    });

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    const call = mockSubmitVdRemotionAssembly.mock.calls[0]![0] as any;
    expect(call.watermarkImages).toEqual([primary, secondary]);
    expect(result.watermarkIncluded).toBe(true);
  });

  it("input.includeTextOverlays === false drops the saved plan but STILL resolves the watermark", async () => {
    // The two opt-outs are documented as independent. This used to gate the
    // whole block on `includeTextOverlays`, so turning text overlays off
    // silently dropped a configured series watermark too. `plan: null` is how
    // "no text overlays" is expressed to the resolver (same shape the
    // season-batch path uses).
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", includeTextOverlays: false },
    });

    expect(mockResolveVdEpisodeTextOverlayEngineInputs).toHaveBeenCalledWith(
      expect.objectContaining({ plan: null, includeWatermark: true })
    );
  });

  it("includeTextOverlays: false + a configured watermark still reaches the render feed", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));
    const watermarkImage = {
      slotId: "primary" as const,
      imageUrl: "https://cdn.example.com/logo.png",
      position: "top_right" as const,
      opacity: 0.45,
      scalePct: 10,
      marginPx: 32,
    };
    mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue({
      overlays: [],
      watermarkImages: [watermarkImage],
      overlaysIncluded: 0,
    });

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", includeTextOverlays: false },
    });

    const call = mockSubmitVdRemotionAssembly.mock.calls[0]![0] as any;
    expect(call.watermarkImages).toEqual([watermarkImage]);
    expect(result.watermarkIncluded).toBe(true);
  });

  it("BOTH opt-outs false skips the resolver entirely (no feed at all)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "20",
        includeTextOverlays: false,
        includeWatermark: false,
      },
    });

    expect(mockResolveVdEpisodeTextOverlayEngineInputs).not.toHaveBeenCalled();
    expect(result.watermarkIncluded).toBe(false);
  });

  it("input.includeWatermark === false is threaded through as includeWatermark: false", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]));

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", includeWatermark: false },
    });

    expect(mockResolveVdEpisodeTextOverlayEngineInputs).toHaveBeenCalledWith(
      expect.objectContaining({ includeWatermark: false })
    );
  });

  it("preserves dialogue-audio subtitle lines/preset when BOTH dialogue captions and text overlays are present", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        { ...EPISODE_ROW_BASE, dialogueAudioPlan: { dialogueLines: [] } },
      ])
    );
    vi.mocked(
      episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs
    ).mockReturnValue({
      dialogueAudioSegmentsIncluded: 0,
      subtitleLinesIncluded: 1,
      subtitles: {
        preset: "classic_box",
        lines: [{ startSec: 0, endSec: 2, text: "สวัสดี" }],
      },
    } as any);
    const overlayEvent = {
      kind: "episode_indicator",
      text: "EP 1/10",
      startSec: 0,
      endSec: 0,
      entireClip: true,
    };
    mockResolveVdEpisodeTextOverlayEngineInputs.mockResolvedValue({
      overlays: [overlayEvent],
      watermarkImages: [],
      overlaysIncluded: 1,
    });

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", subtitlePreset: "classic_box" },
    });

    const call = mockSubmitVdRemotionAssembly.mock.calls[0]![0] as any;
    expect(call.subtitles.preset).toBe("classic_box");
    expect(call.subtitles.lines).toEqual([
      { startSec: 0, endSec: 2, text: "สวัสดี" },
    ]);
    expect(call.subtitles.overlays).toEqual([overlayEvent]);
    expect(call.overlays).toEqual([overlayEvent]);
  });
});
