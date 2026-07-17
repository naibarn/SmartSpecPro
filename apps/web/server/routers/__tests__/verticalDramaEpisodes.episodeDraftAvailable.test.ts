/**
 * Deep story drafts hydration (W10-B, spec/section-16 refine-mode, added
 * 2026-07-08) — router-level coverage:
 *  - `getEpisodeDetail`'s new `episodeDraftAvailable` field: `null` when
 *    `verticalDramaSeriesDeepStoryDrafts` is off, `true`/`false` when on
 *    depending on whether the episode's active breakdown item carries a
 *    vetted W10-A `shotDrafts` array.
 *  - `runStage`/`runEpisode` resolve the tenant flag and thread
 *    `deepStoryDraftsFlagOn` into the pipeline's `RunStageOptions` — the
 *    router half of "resolve the active breakdown item once, pass into both
 *    stage calls when flag on + draft present" (the pipeline half is covered
 *    by `verticalDramaEpisodePipeline.episodeDraftHydration.test.ts`).
 *
 * Same "mock the whole module graph, test the exported procedure handlers
 * directly" convention as `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`
 * — this file's mocking harness is copied from that proven setup verbatim
 * (every static import `verticalDramaEpisodes.ts` needs at module-load time,
 * regardless of which procedure a given test exercises) plus one addition:
 * `../../services/verticalDramaStoryBible`, which THIS file's new code paths
 * (unlike any pre-existing test in that file) actually reach via a dynamic
 * `import()` when the new flag is on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetModelsByTypeAsync,
  mockResolveVerticalDramaCapabilities,
  mockDeriveModelResolutionOptions,
} = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
  mockResolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  })),
  mockDeriveModelResolutionOptions: vi.fn(() => undefined),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  resolveVerticalDramaCapabilities: mockResolveVerticalDramaCapabilities,
  deriveModelResolutionOptions: mockDeriveModelResolutionOptions,
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

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: vi.fn(), generateVideoAsync: vi.fn() },
  DEFAULT_MODELS: { image: "google-nano-banana-pro", video: "veo3/generate-veo-3-video-lite" },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 10),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "token"),
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
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

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
}));

const { mockResolveMediaTransport } = vi.hoisted(() => ({
  mockResolveMediaTransport: vi.fn(),
}));
vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: mockResolveMediaTransport,
}));

const { mockRepairStage, mockRunStage, mockRunEpisode } = vi.hoisted(() => ({
  mockRepairStage: vi.fn(),
  mockRunStage: vi.fn().mockResolvedValue({}),
  mockRunEpisode: vi.fn().mockResolvedValue({ results: [] }),
}));
vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
  verticalDramaEpisodePipeline: {
    repairStage: mockRepairStage,
    runStage: mockRunStage,
    runEpisode: mockRunEpisode,
  },
  VerticalDramaEpisodePipeline: class {
    repairStage = mockRepairStage;
    runStage = mockRunStage;
    runEpisode = mockRunEpisode;
    static downstreamStages = vi.fn(() => []);
  },
  VERTICAL_DRAMA_PIPELINE_STAGES: ["plan_episode_script", "create_storyboard_review_project"],
  VERTICAL_DRAMA_RUNNER_MODES: ["dry_run", "full"],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
}));

const { mockAppendEvent, mockListEvents } = vi.hoisted(() => ({
  mockAppendEvent: vi.fn().mockResolvedValue({ memoryEventId: "evt-1" }),
  mockListEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: { appendEvent: mockAppendEvent, listEvents: mockListEvents },
  memoryRowToEvent: vi.fn(),
}));

vi.mock("../../services/verticalDramaEpisodeContinuation", () => ({
  generateNextEpisodesViaLlm: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

const { mockEvaluateScriptSpeechCoverage } = vi.hoisted(() => ({
  mockEvaluateScriptSpeechCoverage: vi.fn(),
}));
vi.mock("../../services/verticalDramaScriptGeneration", () => ({
  evaluateScriptSpeechCoverage: mockEvaluateScriptSpeechCoverage,
}));

const {
  mockAppendPresetVisualIdentityFragmentsToImagePrompt,
  mockMergePresetVisualIdentityNegativeFragments,
} = vi.hoisted(() => ({
  mockAppendPresetVisualIdentityFragmentsToImagePrompt: vi.fn(
    (imagePrompt: string, identity?: { imagePromptFragments?: { positive?: string[] } }) => {
      const positive = identity?.imagePromptFragments?.positive ?? [];
      if (positive.length === 0) return imagePrompt;
      return `${imagePrompt}, ${positive.join(", ")}`;
    },
  ),
  mockMergePresetVisualIdentityNegativeFragments: vi.fn(
    (
      negativePrompt: string | undefined,
      identity?: { imagePromptFragments?: { negative?: string[] } },
    ) => {
      const negative = identity?.imagePromptFragments?.negative ?? [];
      if (negative.length === 0) return negativePrompt;
      const fragment = negative.join(", ");
      const existing = negativePrompt?.trim();
      return existing ? `${existing}, ${fragment}` : fragment;
    },
  ),
}));
vi.mock("../../services/verticalDramaStartFrameGeneration", () => ({
  appendPresetVisualIdentityFragmentsToImagePrompt: mockAppendPresetVisualIdentityFragmentsToImagePrompt,
  mergePresetVisualIdentityNegativeFragments: mockMergePresetVisualIdentityNegativeFragments,
}));

const { mockShotReferencesService, MockVerticalDramaShotReferenceError } = vi.hoisted(() => {
  class MockVerticalDramaShotReferenceError extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.name = "VerticalDramaShotReferenceError";
      this.reason = reason;
    }
  }
  return {
    mockShotReferencesService: {
      listForEpisode: vi.fn(),
      listForShot: vi.fn(),
      linkReference: vi.fn(),
      deleteReference: vi.fn(),
      unlinkReferenceByAsset: vi.fn(),
      reorder: vi.fn(),
    },
    MockVerticalDramaShotReferenceError,
  };
});

vi.mock("../../services/verticalDramaShotReferences", () => ({
  verticalDramaShotReferencesService: mockShotReferencesService,
  VerticalDramaShotReferenceError: MockVerticalDramaShotReferenceError,
}));

const {
  mockRunVerticalDramaEpisodeQualityReview,
  mockComputeVerticalDramaDensityMetrics,
  MockInsufficientCreditsError,
  MockVdSchemaValidationError,
  MockRateLimitExceededError,
} = vi.hoisted(() => ({
  mockRunVerticalDramaEpisodeQualityReview: vi.fn(),
  mockComputeVerticalDramaDensityMetrics: vi.fn(() => ({
    estimated_speech_seconds: 42,
    per_clip_coverage: {
      clips_evaluated: 9,
      clips_below_min_ratio: 0,
      clips_below_error_ratio: 0,
      average_coverage_ratio: 0.9,
    },
    silent_gap_count: 0,
    duplicate_line_count: 0,
    stage_direction_count: 0,
    reversal_count: 1,
    max_consecutive_same_emotion: 1,
  })),
  MockInsufficientCreditsError: class extends Error {},
  MockVdSchemaValidationError: class extends Error {},
  MockRateLimitExceededError: class extends Error {},
}));

vi.mock("../../services/verticalDramaEpisodeQualityReview", () => ({
  runVerticalDramaEpisodeQualityReview: mockRunVerticalDramaEpisodeQualityReview,
  computeVerticalDramaDensityMetrics: mockComputeVerticalDramaDensityMetrics,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
  RateLimitExceededError: MockRateLimitExceededError,
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

// W10-B addition (2026-07-08) — the ONE new module this file's new code
// paths actually reach (via `getEpisodeDetail`'s `resolveEpisodeDraftAvailable`
// and, when the tenant flag is off, never at all). `getActiveBreakdown`/
// `readItemShotDrafts` are small, fully-controlled fakes here — never
// `importActual` (that would pull in the `adminProcedure` chain this file's
// `../../_core/trpc` mock does not provide, same reasoning as every other
// dynamically-imported module in this router — see
// `verticalDramaEpisodes.ts`'s `runArcDriftCheckAndProposeIfNeeded` doc
// comment).
const { mockGetActiveBreakdown, mockReadItemShotDrafts, mockReadItemCliffhangerLine } = vi.hoisted(
  () => ({
    mockGetActiveBreakdown: vi.fn(),
    mockReadItemShotDrafts: vi.fn(),
    // Part A1 (planning/`polished-toasting-gadget.md`) — `getEpisodeDetail`'s
    // `resolveEpisodePlanForEpisode` also reads this export via the SAME
    // dynamic import above.
    mockReadItemCliffhangerLine: vi.fn(() => undefined),
  }),
);
vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemShotDrafts: mockReadItemShotDrafts,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";
import { getTenantFeatureFlags } from "../../services/tenantFeatureFlagService";

const router = verticalDramaEpisodesRouter as unknown as Record<string, Function>;
const mockGetTenantFeatureFlags = vi.mocked(getTenantFeatureFlags);

function ctx(overrides: Partial<{ tenantId: string; user: { id: number } }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42 },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

/** Build a thenable select-chain stub so `await db.select()....where(...)` resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const BASE_EPISODE_ROW = {
  id: 100,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  episodeNumber: 3,
  targetDurationSeconds: 60,
  script: null,
  dialogueAudioPlan: null,
  storyboard: null,
  storyboardReviewId: null,
  startFramePlan: null,
  motionPromptPack: null,
  assemblyManifest: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({} as any);
});

describe("getEpisodeDetail — episodeDraftAvailable (W10-B)", () => {
  it("is null when verticalDramaSeriesDeepStoryDrafts is off (fail-closed default) — never resolves the breakdown at all", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([BASE_EPISODE_ROW])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.episodeDraftAvailable).toBeNull();
    expect(result.flags.deepStoryDrafts).toBe(false);
    expect(mockGetActiveBreakdown).not.toHaveBeenCalled();
  });

  it("is true when the flag is on and the episode's active breakdown item carries a vetted shotDrafts array", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    } as any);
    mockDb.select
      .mockReturnValueOnce(selectChain([BASE_EPISODE_ROW])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }])); // resolveEpisodeDraftAvailable
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          bible: {
            breakdownVersions: [],
            episodeBreakdown: [
              {
                episodeNumber: 3,
                workingTitle: "ตอนที่ 3",
                logline: "เรื่องย่อ",
                keyBeats: [],
                shotDrafts: [
                  {
                    shot_number: 4,
                    summary:
                      "พี่วินโรยโกโก้บนมือทุกคน ใบข้าวหัวเราะตอนเห็นคราบเต็มมือ",
                    dialogue_lines: [],
                  },
                ],
              },
            ],
          },
        },
      ])
    ); // resolveEpisodePlanForEpisode
    mockGetActiveBreakdown.mockReturnValue([{ episodeNumber: 3 }]);
    mockReadItemShotDrafts.mockReturnValue([
      {
        shot_number: 4,
        summary: "พี่วินโรยโกโก้บนมือทุกคน ใบข้าวหัวเราะตอนเห็นคราบเต็มมือ",
        dialogue_lines: [],
      },
    ]);

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.episodeDraftAvailable).toBe(true);
    expect(result.flags.deepStoryDrafts).toBe(true);
    expect(result.episodePlan?.shotDrafts).toEqual([
      {
        shotNumber: 4,
        summary: "พี่วินโรยโกโก้บนมือทุกคน ใบข้าวหัวเราะตอนเห็นคราบเต็มมือ",
        dialogueLines: [],
      },
    ]);
  });

  it("is false when the flag is on but the episode's active breakdown item has no shotDrafts", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    } as any);
    mockDb.select
      .mockReturnValueOnce(selectChain([BASE_EPISODE_ROW]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }]));
    mockGetActiveBreakdown.mockReturnValue([{ episodeNumber: 3 }]);
    mockReadItemShotDrafts.mockReturnValue(null);

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.episodeDraftAvailable).toBe(false);
  });

  it("is false when the flag is on but no breakdown item matches this episode number at all", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    } as any);
    mockDb.select
      .mockReturnValueOnce(selectChain([BASE_EPISODE_ROW]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));
    mockGetActiveBreakdown.mockReturnValue([]);

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.episodeDraftAvailable).toBe(false);
  });
});

describe("runStage / runEpisode — deepStoryDraftsFlagOn threading (W10-B)", () => {
  it("runStage resolves the tenant flag and passes deepStoryDraftsFlagOn: true into the pipeline's RunStageOptions", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    } as any);
    mockDb.select.mockReturnValueOnce(selectChain([BASE_EPISODE_ROW])); // loadOwnedEpisode

    await router.runStage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", stage: "plan_episode_script", mode: "dry_run" },
    });

    expect(mockRunStage).toHaveBeenCalledTimes(1);
    const opts = mockRunStage.mock.calls[0][2];
    expect(opts.deepStoryDraftsFlagOn).toBe(true);
  });

  it("runStage passes deepStoryDraftsFlagOn: false when the tenant flag is off", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([BASE_EPISODE_ROW]));

    await router.runStage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", stage: "plan_episode_script", mode: "dry_run" },
    });

    const opts = mockRunStage.mock.calls[0][2];
    expect(opts.deepStoryDraftsFlagOn).toBe(false);
  });

  it("runEpisode resolves the tenant flag and passes deepStoryDraftsFlagOn: true into the pipeline's runEpisode options", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    } as any);
    mockDb.select.mockReturnValueOnce(selectChain([BASE_EPISODE_ROW])); // loadOwnedEpisode

    await router.runEpisode({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", mode: "dry_run" },
    });

    expect(mockRunEpisode).toHaveBeenCalledTimes(1);
    const opts = mockRunEpisode.mock.calls[0][1];
    expect(opts.deepStoryDraftsFlagOn).toBe(true);
  });
});
