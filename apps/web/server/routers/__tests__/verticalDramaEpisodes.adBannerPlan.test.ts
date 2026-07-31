/**
 * Vertical Drama Episodes — Ad Banner Overlay per-episode SELECTION coverage
 * (F131W, task #30-A2, `planning/vertical-drama-ad-banner-overlay/plan.md`
 * §2 "ชั้นการใช้" + §6 episode side):
 *  - `parseEpisodeAdBannerPlan` / `resolveEpisodeAdBannerEffectiveWindow` /
 *    `findEpisodeAdBannerFullscreenOverlaps` / `validateEpisodeAdBannerPlan` /
 *    `buildAdBannerDesignsSummary` — pure helpers (DB-free).
 *  - `updateEpisodeAdBannerPlan` — plan CRUD validation matrix.
 *  - `getEpisodeDetail` — additive `adBannerPlan`/`adBannerDesignsSummary`/
 *    `flags.adBannerOverlay`, flag-gated.
 *  - `assembleEpisodeVideo` — additive banner-feeding into `submitAssemblyJob`.
 *
 * Same "mock everything to a minimal no-op shape purely so the module can be
 * imported" convention as `verticalDramaEpisodes.voiceChain.test.ts`
 * (extended here with `services/verticalDramaAdBanner`, the one NEW heavy
 * lazy-imported dependency this wave adds — see that router file's Ad Banner
 * Overlay import-block doc comment for why it is mocked rather than real).
 * `@shared/verticalDramaSeries/adBannerPresets` is left UNMOCKED (pure,
 * deterministic — same convention as `verticalDramaSeries.adBanner.test.ts`)
 * so the real style/placement presets + `parseAdBannerDesigns` run for real.
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
  // Task #21 phase B — this file only exercises Ad Banner Overlay feeding;
  // none of its `assembleEpisodeVideo` calls set `includeDialogueAudio`/
  // `subtitlePreset`, so the default no-op shape (matching what the REAL
  // resolver returns for that same "nothing requested" input) is enough.
  // Dialogue-audio/subtitles feeding behavior itself is covered in
  // `verticalDramaEpisodeVideoAssembly.test.ts` (real implementation) and
  // `verticalDramaEpisodes.voiceChain.test.ts` (router wiring).
  resolveEpisodeDialogueAudioAndSubtitlesRunInputs: vi.fn(() => ({
    dialogueAudioSegmentsIncluded: 0,
    subtitleLinesIncluded: 0,
  })),
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

import {
  verticalDramaEpisodesRouter,
  parseEpisodeAdBannerPlan,
  resolveEpisodeAdBannerEffectiveWindow,
  findEpisodeAdBannerFullscreenOverlaps,
  validateEpisodeAdBannerPlan,
  buildAdBannerDesignsSummary,
  type VdEpisodeAdBannerPlan,
  type VdEpisodeAdBannerSelection,
} from "../verticalDramaEpisodes";
import * as episodeVideoAssembly from "../../services/verticalDramaEpisodeVideoAssembly";
import type { VdAdBannerDesign } from "@shared/verticalDramaSeries/adBannerPresets";

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

/** Thenable select-chain stub — resolves at ANY point in the chain (mirrors `voiceChain.test.ts`'s own helper). */
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

function readyBanner(
  overrides: Partial<VdAdBannerDesign> = {}
): VdAdBannerDesign {
  return {
    id: "banner-1",
    stylePresetId: "bold_typography",
    placementId: "bottom_band",
    copy: { headline: "ลดพิเศษ 30%" },
    prompt: { generated: "a bold banner" },
    generation: { modelId: "google-nano-banana-pro" },
    imageAsset: {
      url: "https://cdn.example.com/banner-1.png",
      generatedAt: "2026-07-09T00:00:00.000Z",
    },
    defaultTiming: { mode: "entire" },
    status: "ready",
    ...overrides,
  } as VdAdBannerDesign;
}

function seriesRow(
  adBanners: unknown[],
  overrides: Record<string, unknown> = {}
) {
  return {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    productTieIn: {
      enabled: true,
      productName: "Glow Serum",
      productCategory: "cosmetics",
      adBanners,
    },
    ...overrides,
  };
}

const EPISODE_ROW_BASE = {
  id: 20,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  episodeNumber: 1,
  targetDurationSeconds: 60,
  motionPromptPack: null,
  assemblyManifest: null,
  adBannerPlan: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({
    verticalDramaSeriesAdBannerOverlay: true,
  });
  mockResolveAdBannerApprovalGate.mockReturnValue(false);
});

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

describe("parseEpisodeAdBannerPlan", () => {
  it("returns null for a null/undefined column value (grandfathered legacy episode)", () => {
    expect(parseEpisodeAdBannerPlan(null)).toBeNull();
    expect(parseEpisodeAdBannerPlan(undefined)).toBeNull();
  });

  it("returns null (never throws) for a malformed record", () => {
    expect(parseEpisodeAdBannerPlan({ enabled: "yes" })).toBeNull();
    expect(parseEpisodeAdBannerPlan("not an object")).toBeNull();
  });

  it("parses a well-formed plan", () => {
    const plan = { enabled: true, selections: [{ bannerId: "banner-1" }] };
    expect(parseEpisodeAdBannerPlan(plan)).toEqual(plan);
  });
});

describe("resolveEpisodeAdBannerEffectiveWindow", () => {
  it("uses the explicit selection timing override when present", () => {
    const design = readyBanner({ defaultTiming: { mode: "entire" } });
    const selection: Pick<VdEpisodeAdBannerSelection, "timing"> = {
      timing: { mode: "window", startSec: 5, durationSec: 3 },
    };
    expect(resolveEpisodeAdBannerEffectiveWindow(selection, design)).toEqual({
      mode: "window",
      startSec: 5,
      endSec: 8,
    });
  });

  it("falls back to the design's own defaultTiming when no override is given", () => {
    const design = readyBanner({
      placementId: "fullscreen",
      defaultTiming: { mode: "window", startSec: 2, durationSec: 3 },
    });
    expect(resolveEpisodeAdBannerEffectiveWindow({}, design)).toEqual({
      mode: "window",
      startSec: 2,
      endSec: 5,
    });
  });

  it('resolves "entire" mode to a [0, Infinity) sentinel window', () => {
    const design = readyBanner({ defaultTiming: { mode: "entire" } });
    expect(resolveEpisodeAdBannerEffectiveWindow({}, design)).toEqual({
      mode: "entire",
      startSec: 0,
      endSec: Number.POSITIVE_INFINITY,
    });
  });
});

describe("findEpisodeAdBannerFullscreenOverlaps", () => {
  const fullscreenDesign = (
    id: string,
    timing: VdAdBannerDesign["defaultTiming"]
  ) => readyBanner({ id, placementId: "fullscreen", defaultTiming: timing });

  it("returns [] when there is only one fullscreen selection", () => {
    const design = fullscreenDesign("b1", {
      mode: "window",
      startSec: 0,
      durationSec: 3,
    });
    const designsById = new Map([["b1", design]]);
    expect(
      findEpisodeAdBannerFullscreenOverlaps([{ bannerId: "b1" }], designsById)
    ).toEqual([]);
  });

  it("flags two non-overlapping window fullscreen selections as OK", () => {
    const b1 = fullscreenDesign("b1", {
      mode: "window",
      startSec: 0,
      durationSec: 3,
    });
    const b2 = fullscreenDesign("b2", {
      mode: "window",
      startSec: 10,
      durationSec: 3,
    });
    const designsById = new Map([
      ["b1", b1],
      ["b2", b2],
    ]);
    expect(
      findEpisodeAdBannerFullscreenOverlaps(
        [{ bannerId: "b1" }, { bannerId: "b2" }],
        designsById
      )
    ).toEqual([]);
  });

  it("flags two overlapping window fullscreen selections", () => {
    const b1 = fullscreenDesign("b1", {
      mode: "window",
      startSec: 0,
      durationSec: 5,
    });
    const b2 = fullscreenDesign("b2", {
      mode: "window",
      startSec: 3,
      durationSec: 5,
    });
    const designsById = new Map([
      ["b1", b1],
      ["b2", b2],
    ]);
    const issues = findEpisodeAdBannerFullscreenOverlaps(
      [{ bannerId: "b1" }, { bannerId: "b2" }],
      designsById
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "VD_EPISODE_AD_BANNER_FULLSCREEN_OVERLAP",
    });
  });

  it('an "entire" fullscreen selection always overlaps any other fullscreen selection ("entire may coexist with nothing")', () => {
    const b1 = fullscreenDesign("b1", { mode: "entire" });
    const b2 = fullscreenDesign("b2", {
      mode: "window",
      startSec: 50,
      durationSec: 1,
    });
    const designsById = new Map([
      ["b1", b1],
      ["b2", b2],
    ]);
    const issues = findEpisodeAdBannerFullscreenOverlaps(
      [{ bannerId: "b1" }, { bannerId: "b2" }],
      designsById
    );
    expect(issues).toHaveLength(1);
  });

  it("does not compare band/side selections against each other or against fullscreen (they may always coexist)", () => {
    const band = readyBanner({
      id: "band",
      placementId: "bottom_band",
      defaultTiming: { mode: "entire" },
    });
    const side = readyBanner({
      id: "side",
      placementId: "side_vertical",
      defaultTiming: { mode: "entire" },
    });
    const designsById = new Map([
      ["band", band],
      ["side", side],
    ]);
    expect(
      findEpisodeAdBannerFullscreenOverlaps(
        [{ bannerId: "band" }, { bannerId: "side" }],
        designsById
      )
    ).toEqual([]);
  });
});

describe("validateEpisodeAdBannerPlan", () => {
  it("flags more than VD_AD_BANNER_MAX_PER_SERIES selections", () => {
    const designs = Array.from({ length: 6 }, (_, i) =>
      readyBanner({ id: `b${i}` })
    );
    const plan: VdEpisodeAdBannerPlan = {
      enabled: true,
      selections: designs.map(d => ({ bannerId: d.id })),
    };
    const issues = validateEpisodeAdBannerPlan(plan, designs);
    expect(issues.some(i => i.code === "VD_EPISODE_AD_BANNER_TOO_MANY")).toBe(
      true
    );
  });

  it("flags a duplicate bannerId selection", () => {
    const design = readyBanner();
    const plan: VdEpisodeAdBannerPlan = {
      enabled: true,
      selections: [{ bannerId: "banner-1" }, { bannerId: "banner-1" }],
    };
    const issues = validateEpisodeAdBannerPlan(plan, [design]);
    expect(
      issues.some(i => i.code === "VD_EPISODE_AD_BANNER_DUPLICATE_SELECTION")
    ).toBe(true);
  });

  it("flags an unknown bannerId", () => {
    const plan: VdEpisodeAdBannerPlan = {
      enabled: true,
      selections: [{ bannerId: "does-not-exist" }],
    };
    const issues = validateEpisodeAdBannerPlan(plan, [readyBanner()]);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "VD_EPISODE_AD_BANNER_UNKNOWN_DESIGN",
        bannerId: "does-not-exist",
      }),
    ]);
  });

  it("flags a design that exists but is not ready", () => {
    const draft = readyBanner({ status: "draft", imageAsset: undefined });
    const plan: VdEpisodeAdBannerPlan = {
      enabled: true,
      selections: [{ bannerId: draft.id }],
    };
    const issues = validateEpisodeAdBannerPlan(plan, [draft]);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY",
        bannerId: draft.id,
      }),
    ]);
  });

  it("flags a ready design missing imageAsset.url as not ready", () => {
    const noImage = readyBanner({ status: "ready", imageAsset: undefined });
    const plan: VdEpisodeAdBannerPlan = {
      enabled: true,
      selections: [{ bannerId: noImage.id }],
    };
    const issues = validateEpisodeAdBannerPlan(plan, [noImage]);
    expect(
      issues.some(i => i.code === "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY")
    ).toBe(true);
  });

  it("flags an invalid window timing override (negative startSec)", () => {
    const design = readyBanner();
    const plan: VdEpisodeAdBannerPlan = {
      enabled: true,
      selections: [
        {
          bannerId: design.id,
          timing: { mode: "window", startSec: -1, durationSec: 3 },
        },
      ],
    };
    const issues = validateEpisodeAdBannerPlan(plan, [design]);
    expect(
      issues.some(i => i.code === "VD_EPISODE_AD_BANNER_INVALID_WINDOW")
    ).toBe(true);
  });

  it("flags overlapping fullscreen selections", () => {
    const b1 = readyBanner({
      id: "b1",
      placementId: "fullscreen",
      defaultTiming: { mode: "window", startSec: 0, durationSec: 5 },
    });
    const b2 = readyBanner({
      id: "b2",
      placementId: "fullscreen",
      defaultTiming: { mode: "window", startSec: 1, durationSec: 5 },
    });
    const plan: VdEpisodeAdBannerPlan = {
      enabled: true,
      selections: [{ bannerId: "b1" }, { bannerId: "b2" }],
    };
    const issues = validateEpisodeAdBannerPlan(plan, [b1, b2]);
    expect(
      issues.some(i => i.code === "VD_EPISODE_AD_BANNER_FULLSCREEN_OVERLAP")
    ).toBe(true);
  });

  it("returns [] for a valid plan within limits", () => {
    const design = readyBanner();
    const plan: VdEpisodeAdBannerPlan = {
      enabled: true,
      selections: [{ bannerId: design.id }],
    };
    expect(validateEpisodeAdBannerPlan(plan, [design])).toEqual([]);
  });
});

describe("buildAdBannerDesignsSummary", () => {
  it("projects id/placementId/status/imageUrl/label/defaultTiming", () => {
    const design = readyBanner();
    const summary = buildAdBannerDesignsSummary([design], false);
    expect(summary).toEqual([
      {
        id: "banner-1",
        placementId: "bottom_band",
        status: "ready",
        imageUrl: "https://cdn.example.com/banner-1.png",
        label: "ลดพิเศษ 30%",
        defaultTiming: { mode: "entire" },
        excludedByApproval: false,
      },
    ]);
  });

  it("falls back to stylePresetId as the label when copy.headline is absent", () => {
    const design = readyBanner({ copy: {} });
    const summary = buildAdBannerDesignsSummary([design], false);
    expect(summary[0]?.label).toBe("bold_typography");
  });

  it("marks excludedByApproval when the gate is on and the design has no approvedAt", () => {
    const design = readyBanner({ approval: { required: true } });
    const summary = buildAdBannerDesignsSummary([design], true);
    expect(summary[0]?.excludedByApproval).toBe(true);
  });

  it("does not mark excludedByApproval when the design is already approved", () => {
    const design = readyBanner({
      approval: { required: true, approvedAt: "2026-07-09T00:00:00.000Z" },
    });
    const summary = buildAdBannerDesignsSummary([design], true);
    expect(summary[0]?.excludedByApproval).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* updateEpisodeAdBannerPlan                                                  */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeAdBannerPlan", () => {
  it("throws FORBIDDEN when verticalDramaSeriesAdBannerOverlay is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesAdBannerOverlay: false,
    });

    await expect(
      router.updateEpisodeAdBannerPlan({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "20",
          plan: { enabled: true, selections: [] },
        },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for an episode the caller does not own", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.updateEpisodeAdBannerPlan({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "999",
          plan: { enabled: true, selections: [] },
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("throws BAD_REQUEST (VD_EPISODE_AD_BANNER_TOO_MANY) for more than 5 selections", async () => {
    const designs = Array.from({ length: 6 }, (_, i) =>
      readyBanner({ id: `b${i}` })
    );
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([seriesRow(designs)]));

    await expect(
      router.updateEpisodeAdBannerPlan({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "20",
          plan: {
            enabled: true,
            selections: designs.map(d => ({ bannerId: d.id })),
          },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VD_EPISODE_AD_BANNER_TOO_MANY"),
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST (VD_EPISODE_AD_BANNER_UNKNOWN_DESIGN) for a bannerId not on the series", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([seriesRow([readyBanner()])]));

    await expect(
      router.updateEpisodeAdBannerPlan({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "20",
          plan: { enabled: true, selections: [{ bannerId: "missing" }] },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VD_EPISODE_AD_BANNER_UNKNOWN_DESIGN"),
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST (VD_EPISODE_AD_BANNER_DESIGN_NOT_READY) for a draft design", async () => {
    const draft = readyBanner({ status: "draft", imageAsset: undefined });
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([seriesRow([draft])]));

    await expect(
      router.updateEpisodeAdBannerPlan({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "20",
          plan: { enabled: true, selections: [{ bannerId: draft.id }] },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("VD_EPISODE_AD_BANNER_DESIGN_NOT_READY"),
    });
  });

  it("throws BAD_REQUEST (VD_EPISODE_AD_BANNER_FULLSCREEN_OVERLAP) for overlapping fullscreen selections", async () => {
    const b1 = readyBanner({
      id: "b1",
      placementId: "fullscreen",
      defaultTiming: { mode: "window", startSec: 0, durationSec: 5 },
    });
    const b2 = readyBanner({
      id: "b2",
      placementId: "fullscreen",
      defaultTiming: { mode: "window", startSec: 1, durationSec: 5 },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([seriesRow([b1, b2])]));

    await expect(
      router.updateEpisodeAdBannerPlan({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "20",
          plan: {
            enabled: true,
            selections: [{ bannerId: "b1" }, { bannerId: "b2" }],
          },
        },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining(
        "VD_EPISODE_AD_BANNER_FULLSCREEN_OVERLAP"
      ),
    });
  });

  it("persists a valid plan and returns it", async () => {
    const design = readyBanner();
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([seriesRow([design])]));
    const chain = updateChain();
    const setSpy = vi.fn();
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    const plan = { enabled: true, selections: [{ bannerId: design.id }] };
    const result = await router.updateEpisodeAdBannerPlan({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", plan },
    });

    expect(result).toEqual({ plan });
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ adBannerPlan: plan })
    );
  });

  it("accepts an empty plan (grandfather: enabled=false, no selections)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([seriesRow([])]));
    mockDb.update.mockReturnValueOnce(updateChain());

    const plan = { enabled: false, selections: [] };
    const result = await router.updateEpisodeAdBannerPlan({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", plan },
    });
    expect(result).toEqual({ plan });
  });
});

/* -------------------------------------------------------------------------- */
/* getEpisodeDetail — adBannerPlan / adBannerDesignsSummary / flags.adBannerOverlay */
/* -------------------------------------------------------------------------- */

describe("getEpisodeDetail — Ad Banner Overlay (F131W, #30-A2)", () => {
  it("flag OFF: returns null plan, empty summary, and never queries the series row for banners", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesAdBannerOverlay: false,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.adBannerPlan).toBeNull();
    expect(result.adBannerDesignsSummary).toEqual([]);
    expect(result.flags.adBannerOverlay).toBe(false);
    expect(mockDb.select).toHaveBeenCalledTimes(3); // no 4th series-row read
  });

  it("flag ON + no plan saved yet: grandfathers a null adBannerPlan (legacy episode)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([seriesRow([readyBanner()])])); // loadSeriesAdBannerContext

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.adBannerPlan).toBeNull();
    expect(result.adBannerDesignsSummary).toHaveLength(1);
    expect(result.flags.adBannerOverlay).toBe(true);
  });

  it("flag ON + a saved plan: returns the parsed plan and the series' design summary", async () => {
    const savedPlan = { enabled: true, selections: [{ bannerId: "banner-1" }] };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([{ ...EPISODE_ROW_BASE, adBannerPlan: savedPlan }])
      )
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([seriesRow([readyBanner()])]));

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.adBannerPlan).toEqual(savedPlan);
    expect(result.adBannerDesignsSummary).toEqual([
      expect.objectContaining({ id: "banner-1", status: "ready" }),
    ]);
  });

  it("marks a design excludedByApproval when the series' approval gate is on and the design is unapproved", async () => {
    mockResolveAdBannerApprovalGate.mockReturnValue(true);
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(
        selectChain([
          seriesRow([readyBanner({ approval: { required: true } })]),
        ])
      );

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.adBannerDesignsSummary[0]?.excludedByApproval).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* assembleEpisodeVideo — banner feeding into submitAssemblyJob               */
/* -------------------------------------------------------------------------- */

describe("assembleEpisodeVideo — Ad Banner Overlay feeding (F131W, #30-A2)", () => {
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

  it("flag OFF: submits with no banners key at all, and returns an empty excludedAdBanners list", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesAdBannerOverlay: false,
    });
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          ...EPISODE_ROW_BASE,
          adBannerPlan: {
            enabled: true,
            selections: [{ bannerId: "banner-1" }],
          },
        },
      ])
    );

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.jobId).toBe("job-1");
    expect(result.excludedAdBanners).toEqual([]);
    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.banners).toBeUndefined();
  });

  it("flag ON + plan disabled: submits with no banners key at all", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          ...EPISODE_ROW_BASE,
          adBannerPlan: {
            enabled: false,
            selections: [{ bannerId: "banner-1" }],
          },
        },
      ])
    );

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.banners).toBeUndefined();
  });

  it('flag ON + enabled plan: builds banners correctly, resolving "entire" to [0, targetDurationSeconds] and marking entire:true (task #21 phase B)', async () => {
    const design = readyBanner({
      placementId: "bottom_band",
      defaultTiming: { mode: "entire" },
    });
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...EPISODE_ROW_BASE,
            targetDurationSeconds: 45,
            adBannerPlan: {
              enabled: true,
              selections: [{ bannerId: design.id }],
            },
          },
        ])
      )
      .mockReturnValueOnce(selectChain([seriesRow([design])])); // loadSeriesAdBannerContext

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.excludedAdBanners).toEqual([]);
    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.banners).toEqual([
      {
        imageUrl: "https://cdn.example.com/banner-1.png",
        placementId: "bottom_band",
        sideAlign: undefined,
        startSec: 0,
        endSec: 45,
        fadeSec: 0.3,
        entire: true,
      },
    ]);
  });

  it('flag ON + enabled plan with "window" timing: does NOT set entire:true (task #21 phase B — only "entire" mode is advisory)', async () => {
    const design = readyBanner({
      placementId: "bottom_band",
      defaultTiming: { mode: "window", startSec: 5, durationSec: 3 },
    });
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...EPISODE_ROW_BASE,
            adBannerPlan: {
              enabled: true,
              selections: [{ bannerId: design.id }],
            },
          },
        ])
      )
      .mockReturnValueOnce(selectChain([seriesRow([design])]));

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.banners[0].entire).toBeUndefined();
  });

  it("resolves an explicit window timing override without substituting the target duration", async () => {
    const design = readyBanner({
      placementId: "fullscreen",
      defaultTiming: { mode: "window", startSec: 0, durationSec: 3 },
    });
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...EPISODE_ROW_BASE,
            adBannerPlan: {
              enabled: true,
              selections: [
                {
                  bannerId: design.id,
                  timing: { mode: "window", startSec: 10, durationSec: 4 },
                },
              ],
            },
          },
        ])
      )
      .mockReturnValueOnce(selectChain([seriesRow([design])]));

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.banners).toEqual([
      expect.objectContaining({ startSec: 10, endSec: 14 }),
    ]);
  });

  it("excludes a design gated by the regulated-category approval requirement, with a warning in the response", async () => {
    mockResolveAdBannerApprovalGate.mockReturnValue(true);
    const design = readyBanner({ approval: { required: true } });
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...EPISODE_ROW_BASE,
            adBannerPlan: {
              enabled: true,
              selections: [{ bannerId: design.id }],
            },
          },
        ])
      )
      .mockReturnValueOnce(selectChain([seriesRow([design])]));

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.excludedAdBanners).toEqual([
      expect.objectContaining({
        bannerId: design.id,
        code: "VD_EPISODE_AD_BANNER_APPROVAL_REQUIRED",
      }),
    ]);
    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.banners).toBeUndefined();
  });

  it("includes a design once approved even when the series requires approval", async () => {
    mockResolveAdBannerApprovalGate.mockReturnValue(true);
    const design = readyBanner({
      approval: { required: true, approvedAt: "2026-07-09T00:00:00.000Z" },
    });
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...EPISODE_ROW_BASE,
            adBannerPlan: {
              enabled: true,
              selections: [{ bannerId: design.id }],
            },
          },
        ])
      )
      .mockReturnValueOnce(selectChain([seriesRow([design])]));

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.excludedAdBanners).toEqual([]);
    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.banners).toHaveLength(1);
  });

  it("excludes (rather than crashes on) a selection whose design was deleted from the series after the plan was saved", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...EPISODE_ROW_BASE,
            adBannerPlan: { enabled: true, selections: [{ bannerId: "gone" }] },
          },
        ])
      )
      .mockReturnValueOnce(selectChain([seriesRow([])]));

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.excludedAdBanners).toEqual([
      expect.objectContaining({
        bannerId: "gone",
        code: "VD_EPISODE_AD_BANNER_DESIGN_NOT_READY",
      }),
    ]);
  });
});
