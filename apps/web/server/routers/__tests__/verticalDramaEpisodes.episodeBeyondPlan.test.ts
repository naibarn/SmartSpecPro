/**
 * Task #26 (data sanity — episode number beyond the planned season size,
 * e.g. episode 11 materialized/generated while the story bible's season
 * plan only covers episodes 1-10):
 *  - `getEpisodeBreakdownStatus` — standalone query (kept separate from
 *    `getEpisodeDetail` — see that new procedure's doc comment for why):
 *    `"matched"` / `"beyond_plan"` / `"no_plan"`, a UNION of the active
 *    (`getActiveBreakdown`) + legacy top-level `bible.episodeBreakdown`
 *    sources (see `resolveEpisodeBreakdownStatus`'s doc comment).
 *  - `assertEpisodeWithinSeasonPlan` fail-fast gate, wired into `runStage`/
 *    `regenerateStage`/`runEpisode` for a real (non-dry-run) `plan_episode_
 *    script` run: rejects `VD_EPISODE_BEYOND_PLAN` (PRECONDITION_FAILED)
 *    when beyond plan, no-ops (grandfathered) for `"no_plan"`/`"matched"`,
 *    never gates a dry_run/plan_only preview, never gates other stages, and
 *    never gates `runEpisode` when resuming from a stage AFTER
 *    `plan_episode_script` (the episode already has real content there).
 *
 * Same "mock the whole module graph, test the exported procedure handlers
 * directly" convention as `verticalDramaEpisodes.episodeDraftAvailable.test.ts`
 * — this file's mocking harness is copied from that proven setup verbatim,
 * with ONE difference: `VERTICAL_DRAMA_PIPELINE_STAGES` here is the FULL,
 * correctly-ordered 15-stage list (not that file's truncated 2-stage mock),
 * since `runEpisode`'s `fromStage`-reachability check needs the real stage
 * order to resolve correctly.
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
  mediaGenerationService: {
    generateImageAsync: vi.fn(),
    generateVideoAsync: vi.fn(),
  },
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo3/generate-veo-3-video-lite",
  },
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
  mediaGenerationLimiter: {
    isAllowed: vi.fn(() => true),
    getResetTime: vi.fn(() => 0),
  },
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: vi.fn() },
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
  // FULL, correctly-ordered 15-stage sequence (mirrors
  // `verticalDramaEpisodePipeline.ts`'s own `VERTICAL_DRAMA_PIPELINE_STAGES`
  // verbatim) — `stageEnum`/`runEpisode`'s `fromStage`-reachability check in
  // the router under test are BOTH built from this mocked array at module
  // load time, so it must be the real order, not a truncated stand-in.
  VERTICAL_DRAMA_PIPELINE_STAGES: [
    "normalize_series_input",
    "plan_episode_script",
    "update_character_visual_bible",
    "generate_or_import_character_refs",
    "storyboard_shotgrid",
    "start_frame_render_plan",
    "render_or_import_start_frames",
    "approve_start_frames",
    "dialogue_audio_plan",
    "video_motion_prompt_pack",
    "create_storyboard_review_project",
    "review_generate_repair_in_storyboard_review",
    "render_or_import_video_clips",
    "assemble_episode_manifest",
    "summarize_episode_to_series_memory",
  ],
  VERTICAL_DRAMA_RUNNER_MODES: [
    "dry_run",
    "plan_only",
    "render_images",
    "render_video",
    "full",
    "repair",
  ],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
}));

const { mockAppendEvent, mockListEvents } = vi.hoisted(() => ({
  mockAppendEvent: vi.fn().mockResolvedValue({ memoryEventId: "evt-1" }),
  mockListEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: {
    appendEvent: mockAppendEvent,
    listEvents: mockListEvents,
  },
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
    (
      imagePrompt: string,
      identity?: { imagePromptFragments?: { positive?: string[] } }
    ) => {
      const positive = identity?.imagePromptFragments?.positive ?? [];
      if (positive.length === 0) return imagePrompt;
      return `${imagePrompt}, ${positive.join(", ")}`;
    }
  ),
  mockMergePresetVisualIdentityNegativeFragments: vi.fn(
    (
      negativePrompt: string | undefined,
      identity?: { imagePromptFragments?: { negative?: string[] } }
    ) => {
      const negative = identity?.imagePromptFragments?.negative ?? [];
      if (negative.length === 0) return negativePrompt;
      const fragment = negative.join(", ");
      const existing = negativePrompt?.trim();
      return existing ? `${existing}, ${fragment}` : fragment;
    }
  ),
}));
vi.mock("../../services/verticalDramaStartFrameGeneration", () => ({
  appendPresetVisualIdentityFragmentsToImagePrompt:
    mockAppendPresetVisualIdentityFragmentsToImagePrompt,
  mergePresetVisualIdentityNegativeFragments:
    mockMergePresetVisualIdentityNegativeFragments,
}));

const { mockShotReferencesService, MockVerticalDramaShotReferenceError } =
  vi.hoisted(() => {
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
  runVerticalDramaEpisodeQualityReview:
    mockRunVerticalDramaEpisodeQualityReview,
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

// Task #26 — the ONE new module this file's new code paths actually reach
// (via `resolveEpisodeBreakdownStatus`'s `getActiveBreakdown` call). Fully
// controlled fake here, same reasoning as
// `verticalDramaEpisodes.episodeDraftAvailable.test.ts`'s identical mock.
const { mockGetActiveBreakdown } = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(() => [] as Array<{ episodeNumber: number }>),
}));
vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemShotDrafts: vi.fn(),
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";
import { getTenantFeatureFlags } from "../../services/tenantFeatureFlagService";

const router = verticalDramaEpisodesRouter as unknown as Record<
  string,
  Function
>;
const mockGetTenantFeatureFlags = vi.mocked(getTenantFeatureFlags);

function ctx(
  overrides: Partial<{ tenantId: string; user: { id: number } }> = {}
) {
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
  episodeNumber: 11,
  targetDurationSeconds: 60,
  script: null,
  dialogueAudioPlan: null,
  storyboard: null,
  storyboardReviewId: null,
  startFramePlan: null,
  motionPromptPack: null,
  assemblyManifest: null,
};

function episodeRow(episodeNumber: number) {
  return { ...BASE_EPISODE_ROW, episodeNumber };
}

function plannedItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({ episodeNumber: i + 1 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({} as any);
  mockGetActiveBreakdown.mockReturnValue([]);
});

describe("getEpisodeBreakdownStatus", () => {
  it("returns no_plan when the series has no breakdown at all (legacy pre-planning series, grandfathered)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(11)])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: null }])); // resolveEpisodeBreakdownStatus
    mockGetActiveBreakdown.mockReturnValue([]);

    const result = await router.getEpisodeBreakdownStatus({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result).toEqual({
      breakdownStatus: "no_plan",
      plannedEpisodeCount: 0,
    });
  });

  it("returns matched when the active breakdown has an item for this episode number", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(3)]))
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }]));
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.getEpisodeBreakdownStatus({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result).toEqual({
      breakdownStatus: "matched",
      plannedEpisodeCount: 10,
    });
  });

  it("returns beyond_plan when the episode number exceeds every breakdown source (task #26's core scenario: ep 11 vs a 10-episode plan)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(11)]))
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }]));
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.getEpisodeBreakdownStatus({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result).toEqual({
      breakdownStatus: "beyond_plan",
      plannedEpisodeCount: 10,
    });
  });

  it("still reports matched when only the LEGACY top-level bible.episodeBreakdown (not the active/versioned one) covers this episode — Mode-B continuation on a series that separately adopted versioned breakdowns", async () => {
    // Regression guard for the "union, not getActiveBreakdown alone"
    // design: `generateNextEpisodes`'s Mode-B LLM continuation only ever
    // appends to the legacy top-level array, never to `breakdownVersions[]`.
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(11)]))
      .mockReturnValueOnce(
        selectChain([
          {
            bible: {
              breakdownVersions: [{ versionId: "v1", items: [] }],
              episodeBreakdown: [
                {
                  episodeNumber: 11,
                  workingTitle: "t",
                  logline: "l",
                  keyBeats: ["a"],
                },
              ],
            },
          },
        ])
      );
    mockGetActiveBreakdown.mockReturnValue([]); // active version covers nothing

    const result = await router.getEpisodeBreakdownStatus({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.breakdownStatus).toBe("matched");
  });
});

describe("runStage — VD_EPISODE_BEYOND_PLAN gate (task #26)", () => {
  it("rejects a real (full-mode) plan_episode_script run when the episode is beyond the season plan", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(11)])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }])); // gate lookup
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    await expect(
      router.runStage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          stage: "plan_episode_script",
          mode: "full",
        },
      })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("VD_EPISODE_BEYOND_PLAN"),
    });
    expect(mockRunStage).not.toHaveBeenCalled();
  });

  it("never gates a dry_run/plan_only preview, even for a beyond-plan episode", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow(11)])); // loadOwnedEpisode only
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.runStage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        stage: "plan_episode_script",
        mode: "dry_run",
      },
    });

    expect(result).toEqual({});
    expect(mockRunStage).toHaveBeenCalled();
  });

  it("does not gate a matched (within-plan) episode", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(3)]))
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }]));
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.runStage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        stage: "plan_episode_script",
        mode: "full",
      },
    });

    expect(result).toEqual({});
    expect(mockRunStage).toHaveBeenCalled();
  });

  it("grandfathers a no_plan (legacy pre-planning) series — never gates even though the episode is far beyond any explicit plan", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(50)]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));
    mockGetActiveBreakdown.mockReturnValue([]);

    const result = await router.runStage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        stage: "plan_episode_script",
        mode: "full",
      },
    });

    expect(result).toEqual({});
    expect(mockRunStage).toHaveBeenCalled();
  });

  it("does not gate other stages even for a beyond-plan episode", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow(11)])); // loadOwnedEpisode only
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.runStage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        stage: "storyboard_shotgrid",
        mode: "full",
      },
    });

    expect(result).toEqual({});
    expect(mockRunStage).toHaveBeenCalled();
  });
});

describe("regenerateStage — VD_EPISODE_BEYOND_PLAN gate (task #26)", () => {
  it("rejects BEFORE deleting any prior run when the episode is beyond the season plan", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(11)]))
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }]));
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    await expect(
      router.regenerateStage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          stage: "plan_episode_script",
        },
      })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("VD_EPISODE_BEYOND_PLAN"),
    });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("does not gate other stages even for a beyond-plan episode", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow(11)])); // loadOwnedEpisode only
    mockDb.delete.mockReturnValueOnce({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    });
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.regenerateStage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", stage: "storyboard_shotgrid" },
    });

    expect(result).toEqual({});
  });
});

describe("runEpisode — VD_EPISODE_BEYOND_PLAN gate (task #26)", () => {
  it("rejects a real run starting from the default (first) stage when the episode is beyond the season plan", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(11)])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }])); // gate lookup
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    await expect(
      router.runEpisode({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", mode: "full" },
      })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("VD_EPISODE_BEYOND_PLAN"),
    });
    expect(mockRunEpisode).not.toHaveBeenCalled();
  });

  it("never gates a dry_run", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow(11)]));
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.runEpisode({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", mode: "dry_run" },
    });

    expect(result).toEqual({ results: [] });
    expect(mockRunEpisode).toHaveBeenCalled();
  });

  it("does not gate when resuming from a stage AFTER plan_episode_script, even for a beyond-plan episode (the episode already has real content there)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow(11)])); // loadOwnedEpisode only
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.runEpisode({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        mode: "full",
        fromStage: "storyboard_shotgrid",
      },
    });

    expect(result).toEqual({ results: [] });
    expect(mockRunEpisode).toHaveBeenCalled();
  });

  it("does not gate a matched (within-plan) episode", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow(3)]))
      .mockReturnValueOnce(selectChain([{ bible: { breakdownVersions: [] } }]));
    mockGetActiveBreakdown.mockReturnValue(plannedItems(10));

    const result = await router.runEpisode({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", mode: "full" },
    });

    expect(result).toEqual({ results: [] });
    expect(mockRunEpisode).toHaveBeenCalled();
  });
});
