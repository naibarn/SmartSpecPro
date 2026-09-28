/**
 * Vertical Drama — episode-level video-prompt LANGUAGE plan
 * (`setEpisodeVideoPromptLanguage`) unit coverage.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaEpisodes.modelSelection.test.ts` /
 * `verticalDramaEpisodes.generateShotVideoPrompt.test.ts` — the router's
 * `mutation`/`query` mock passes the raw handler function through unchanged.
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
}));

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
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
  resolveReferenceUrl: vi.fn((url: string, publicUrl?: string | null) =>
    url.startsWith("http") ? url : `${publicUrl ?? ""}${url}`
  ),
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

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
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
  detectProviderFamily: vi.fn(() => "veo"),
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
    constructor(public reason: string, message: string) {
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

// Mocked directly (like `verticalDramaEpisodeQualityReview` above) so this
// file never pulls in `verticalDramaSeriesMemoryPlanning.ts` ->
// `verticalDramaStoryBible.ts` -> `enabledLlmModels.ts` -> `llmProviders.ts`'s
// `adminProcedure` dependency, which this file's `../../_core/trpc` mock does
// not export.
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

// `verticalDramaEpisodes.ts` imports `ensurePromptWithinLimit` from
// `verticalDramaPromptQc.ts`, which itself imports `verticalDramaStoryBible.ts`
// -> `enabledLlmModels.ts` -> `llmProviders.ts` (which needs `adminProcedure`,
// not exported by this file's `../../_core/trpc` mock above). Mock the QC
// module directly (pass-through: returns the prompt unchanged) so that
// unrelated import chain never loads.
vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";

const router = verticalDramaEpisodesRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string; user: { id: number } }> = {}) {
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
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    for: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function updateChain(returned: unknown[]) {
  const whereResult: any = {
    returning: vi.fn(() => Promise.resolve(returned)),
    then: (resolve: any) => Promise.resolve(returned).then(resolve),
  };
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => whereResult),
  };
  return chain;
}

function baseEpisodeRow(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 10,
    durationProfileId: "vertical_drama_60s_9_frames_8_clips",
    startFramePlan: null,
    storyboard: null,
    dialogueAudioPlan: null,
    motionPromptPack: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({
      select: (...args: unknown[]) => (mockDb.select as any)(...args),
      update: (...args: unknown[]) => (mockDb.update as any)(...args),
    }),
  );
  mockGetModelsByTypeAsync.mockResolvedValue([
    { id: "veo-3-1", type: "video", isEnabled: true, creditCost: 50, aliases: [], configJson: {} },
  ]);
});

describe("setEpisodeVideoPromptLanguage", () => {
  it("throws BAD_REQUEST when neither promptLanguage nor dialogueLanguage is supplied", async () => {
    await expect(
      router.setEpisodeVideoPromptLanguage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("creates a minimal motionPromptPack when none exists yet, persisting both language fields", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([episodeRow]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([{ ...episodeRow, motionPromptPack: v.motionPromptPack }]);
      }),
    });

    const result = await router.setEpisodeVideoPromptLanguage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", promptLanguage: "ja", dialogueLanguage: "en" },
    });

    expect(capturedSet.motionPromptPack).toMatchObject({
      promptLanguage: "ja",
      dialogueLanguage: "en",
      clips: [],
    });
    expect(result.motionPromptPack).toMatchObject({
      promptLanguage: "ja",
      dialogueLanguage: "en",
    });
  });

  it("patches only the supplied field(s) onto an existing motionPromptPack, preserving everything else", async () => {
    const existingPack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [{ clipNumber: 1, sourceShotNumbers: [1], prompt: "existing prompt", durationSeconds: 8 }],
      warnings: [],
      dialogueLanguage: "th",
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: existingPack });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([episodeRow]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([{ ...episodeRow, motionPromptPack: v.motionPromptPack }]);
      }),
    });

    await router.setEpisodeVideoPromptLanguage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", promptLanguage: "zh" },
    });

    expect(capturedSet.motionPromptPack).toMatchObject({
      selectedVideoModelId: "veo-3-1",
      promptLanguage: "zh",
      dialogueLanguage: "th",
      clips: existingPack.clips,
    });
  });

  it("snapshots the legacy image language before changing video language and preserves fresh frames", async () => {
    const initiallyLoaded = baseEpisodeRow({
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        promptLanguage: "th",
        clips: [],
        warnings: [],
      },
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "gpt-image-2",
        frames: [],
      },
    });
    const freshRow = {
      ...initiallyLoaded,
      startFramePlan: {
        ...initiallyLoaded.startFramePlan,
        frames: [{
          shotNumber: 1,
          imagePrompt: "fresh concurrent prompt",
          negativePrompt: "",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
        }],
      },
    };
    mockDb.select
      .mockReturnValueOnce(selectChain([initiallyLoaded]))
      .mockReturnValueOnce(selectChain([freshRow]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((value: any) => {
        capturedSet = value;
        return updateChain([{ ...freshRow, ...value }]);
      }),
    });

    await router.setEpisodeVideoPromptLanguage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", promptLanguage: "en" },
    });

    expect(capturedSet.motionPromptPack.promptLanguage).toBe("en");
    expect(capturedSet.startFramePlan).toMatchObject({
      imagePromptLanguage: "th",
      frames: [{ imagePrompt: "fresh concurrent prompt" }],
    });
  });
});

describe("setEpisodeImagePromptLanguage", () => {
  it("creates a minimal start-frame plan and persists image language independently", async () => {
    const episodeRow = baseEpisodeRow({
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        promptLanguage: "en",
        clips: [],
        warnings: [],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([episodeRow]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((value: any) => {
        capturedSet = value;
        return updateChain([{ ...episodeRow, ...value }]);
      }),
    });

    await router.setEpisodeImagePromptLanguage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", imagePromptLanguage: "th" },
    });

    expect(capturedSet.startFramePlan).toMatchObject({
      mode: "single_frame_per_shot",
      selectedImageModelId: "",
      imagePromptLanguage: "th",
      frames: [],
    });
    expect(capturedSet.motionPromptPack).toBeUndefined();
  });
});
