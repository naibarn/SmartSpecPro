/**
 * Two-mode start-frame image prompt switch
 * (`planning/vd-start-frame-prompt-modes/plan.md`) — unit coverage for
 * `setEpisodeImagePromptMode` (new mutation, modeled on
 * `setEpisodeVideoPromptLanguage`) and for `generateShotStartFramePrompt`'s
 * new mode/family resolution + stamp persistence.
 *
 * Deliberately a SEPARATE file from
 * `verticalDramaEpisodes.generateShotStartFramePrompt.test.ts` (rather than
 * appended to it) — that suite currently has pre-existing failures from an
 * unrelated db-mock gap (a `resolveMediaAssetUrlsByIds` `db.select` call the
 * older fixtures don't provision) owned by a separate session; this file
 * avoids that gap entirely by never setting `frame.approvedMediaAssetId` on
 * its fixtures (so that code path is never reached) and follows the SAME
 * "mock the whole module graph, invoke the exported procedure handler
 * directly" + ordered `selectChain` convention that suite established.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetModelsByTypeAsync, mockResolveVerticalDramaCapabilities } = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
  mockResolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  })),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  resolveVerticalDramaCapabilities: mockResolveVerticalDramaCapabilities,
  deriveModelResolutionOptions: vi.fn(() => undefined),
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

const { mockGetPrimaryPortraitUrl } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl },
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
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
  generateVerticalDramaShotVideoPromptSpeakerSwitch: vi.fn(),
  generateVerticalDramaClipDialogue: vi.fn(),
  appendPresetVisualIdentityStyleTokensToMotionPrompt: vi.fn((prompt: string) => prompt),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
}));

const {
  mockGenerateStartFrameShotPrompt,
  MockInsufficientCreditsError,
  MockVdSchemaValidationError,
  MockRateLimitExceededError,
  MockVdReferenceMappingError,
} = vi.hoisted(() => {
  class MockInsufficientCreditsError extends Error {
    code = "VD_INSUFFICIENT_CREDITS";
  }
  class MockVdSchemaValidationError extends Error {
    code = "VD_SCHEMA_VALIDATION_FAILED";
    constructor(message: string, public issues: unknown) {
      super(message);
    }
  }
  class MockRateLimitExceededError extends Error {
    code = "VD_RATE_LIMIT_EXCEEDED";
  }
  class MockVdReferenceMappingError extends Error {
    code = "VD_REFERENCE_MAPPING_MISMATCH";
    constructor(message: string, public mismatches: unknown) {
      super(message);
    }
  }
  return {
    mockGenerateStartFrameShotPrompt: vi.fn(),
    MockInsufficientCreditsError,
    MockVdSchemaValidationError,
    MockRateLimitExceededError,
    MockVdReferenceMappingError,
  };
});
vi.mock("../../services/verticalDramaStartFrameGeneration", () => ({
  generateStartFrameShotPrompt: mockGenerateStartFrameShotPrompt,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
  RateLimitExceededError: MockRateLimitExceededError,
  VdReferenceMappingError: MockVdReferenceMappingError,
}));

const { mockEnsurePromptWithinLimit } = vi.hoisted(() => ({
  mockEnsurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));
vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: mockEnsurePromptWithinLimit,
}));

vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: vi.fn(() => []),
  readItemCliffhangerLine: vi.fn(() => undefined),
  readItemShotDrafts: vi.fn(() => null),
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

/** Build a thenable select-chain stub so `await db.select()....where(...)` resolves to `rows`. */
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

/** For `generateShotStartFramePrompt`'s row-locked txn write: `.where()` resolves directly (no `.returning()`). */
function updateChain(returned: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

/** For `setEpisodeImagePromptMode` (mirrors `setEpisodeVideoPromptLanguage`): `.where()` exposes `.returning()`. */
function updateChainWithReturning(returned: unknown[]) {
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
    startFramePlan: {
      mode: "single_frame_per_shot",
      selectedImageModelId: "google-nano-banana-pro",
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "a hero standing in the rain",
          negativePrompt: "no blur",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          // Deliberately NO `approvedMediaAssetId` — avoids the unrelated
          // `resolveMediaAssetUrlsByIds` db-mock gap (see header comment).
        },
      ],
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      select: (...args: unknown[]) => selectChain([]),
      update: (...args: unknown[]) => (mockDb.update as any)(...args),
    };
    return fn(tx);
  });
  mockGenerateStartFrameShotPrompt.mockResolvedValue({
    prompt: "regenerated start-frame prompt",
    negativePrompt: "regenerated negative prompt",
    creditsUsed: 4,
    model: "gpt-image-planner",
  });
  // `presetMixV2Enabled` defaults to false (flags absent) — keeps
  // `loadSeriesPresetVisualIdentity`'s DB read from ever running in tests
  // that don't explicitly opt in, avoiding an extra required `selectChain`.
  mockGetTenantFeatureFlags.mockResolvedValue(undefined as any);
});

describe("setEpisodeImagePromptMode", () => {
  it("creates a minimal startFramePlan (imagePromptMode set) when none exists yet", async () => {
    const episodeRow = baseEpisodeRow({ startFramePlan: null });
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChainWithReturning([{ ...episodeRow, startFramePlan: v.startFramePlan }]);
      }),
    });

    const result = await router.setEpisodeImagePromptMode({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", mode: "cinematic_narrative" },
    });

    expect(capturedSet.startFramePlan).toMatchObject({
      mode: "single_frame_per_shot",
      selectedImageModelId: "",
      frames: [],
      imagePromptMode: "cinematic_narrative",
    });
    expect(result.startFramePlan.imagePromptMode).toBe("cinematic_narrative");
  });

  it("patches imagePromptMode onto an EXISTING plan, preserving every other field (frames included)", async () => {
    const episodeRow = baseEpisodeRow();
    const originalFrames = episodeRow.startFramePlan.frames;
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChainWithReturning([{ ...episodeRow, startFramePlan: v.startFramePlan }]);
      }),
    });

    await router.setEpisodeImagePromptMode({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", mode: "policy_safe_rewrite" },
    });

    expect(capturedSet.startFramePlan).toMatchObject({
      mode: "single_frame_per_shot",
      selectedImageModelId: "google-nano-banana-pro",
      imagePromptMode: "policy_safe_rewrite",
    });
    expect(capturedSet.startFramePlan.frames).toBe(originalFrames);
  });

  it("accepts 'auto' to restore the default-resolution behavior", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        imagePromptMode: "policy_safe_rewrite",
        frames: [],
      },
    });
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChainWithReturning([{ ...episodeRow, startFramePlan: v.startFramePlan }]);
      }),
    });

    await router.setEpisodeImagePromptMode({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", mode: "auto" },
    });

    expect(capturedSet.startFramePlan.imagePromptMode).toBe("auto");
  });
});

describe("generateShotStartFramePrompt — mode default resolution from image model family", () => {
  it("resolves policy_safe_rewrite by default when the plan's selected image model is GPT-family", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "gpt-image-1.5-all",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a hero standing in the rain",
            negativePrompt: "no blur",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
          },
        ],
      },
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "gpt-image-1.5-all", name: "GPT Image 1.5 (All)", provider: "openai", configJson: {} },
    ]);
    mockGenerateStartFrameShotPrompt.mockResolvedValue({
      prompt: "REFERENCE MAPPING: Image 1 = Hero.\nA hero stands in the rain",
      negativePrompt: "",
      creditsUsed: 2,
      model: "gpt-image-planner",
      usedMode: "policy_safe_rewrite",
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: null }])); // loadSeriesTargetAudienceRegion
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.executeShotStartFramePromptJob({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, canonicalShotSummary: "A hero stands in the rain" },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePromptMode: "policy_safe_rewrite",
        imagePromptModeResolvedFrom: "auto",
        imageModelFamily: "gpt",
        imageModelId: "gpt-image-1.5-all",
      }),
    );
    expect(mockEnsurePromptWithinLimit).not.toHaveBeenCalled();
  });

  it("resolves cinematic_narrative by default when the plan's selected image model is NOT GPT-family", async () => {
    const episodeRow = baseEpisodeRow(); // selectedImageModelId: "google-nano-banana-pro"
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "google-nano-banana-pro", name: "Nano Banana Pro", provider: "google", configJson: {} },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.executeShotStartFramePromptJob({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, canonicalShotSummary: "A hero stands in the rain" },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePromptMode: "cinematic_narrative",
        imagePromptModeResolvedFrom: "auto",
        imageModelFamily: "other",
        imageModelId: "google-nano-banana-pro",
      }),
    );
  });

  it("degrades to family 'other' -> cinematic_narrative, never throwing, when the model catalog lookup fails", async () => {
    const episodeRow = baseEpisodeRow();
    mockGetModelsByTypeAsync.mockRejectedValue(new Error("catalog unavailable"));
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await expect(
      router.executeShotStartFramePromptJob({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, canonicalShotSummary: "A hero stands in the rain" },
      }),
    ).resolves.toBeTruthy();

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ imagePromptMode: "cinematic_narrative", imageModelFamily: "other" }),
    );
  });

  it("an explicit plan.imagePromptMode always wins over the model-family default", async () => {
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { promptLanguage: "en" },
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "gpt-image-1.5-all", // would default to policy_safe_rewrite
        imagePromptMode: "cinematic_narrative", // explicit override
        imagePromptLanguage: "th",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a hero standing in the rain",
            negativePrompt: "no blur",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
          },
        ],
      },
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "gpt-image-1.5-all", name: "GPT Image 1.5 (All)", provider: "openai", configJson: {} },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.executeShotStartFramePromptJob({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, canonicalShotSummary: "A hero stands in the rain" },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        imagePromptMode: "cinematic_narrative",
        imagePromptModeResolvedFrom: "user",
        imageModelFamily: "gpt",
        promptLanguage: "th",
      }),
    );
  });

  it("'auto' (explicit) behaves exactly like an absent imagePromptMode — still resolves from family", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "gpt-image-1.5-all",
        imagePromptMode: "auto",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a hero standing in the rain",
            negativePrompt: "no blur",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
          },
        ],
      },
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "gpt-image-1.5-all", name: "GPT Image 1.5 (All)", provider: "openai", configJson: {} },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.executeShotStartFramePromptJob({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, canonicalShotSummary: "A hero stands in the rain" },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ imagePromptMode: "policy_safe_rewrite", imagePromptModeResolvedFrom: "auto" }),
    );
  });
});

describe("generateShotStartFramePrompt — promptMode stamp persisted + returned", () => {
  it("persists the service's returned frameStamp onto the target frame and returns it as promptMode", async () => {
    const episodeRow = baseEpisodeRow();
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "google-nano-banana-pro", name: "Nano Banana Pro", provider: "google", configJson: {} },
    ]);
    mockGenerateStartFrameShotPrompt.mockResolvedValue({
      prompt: "a cinematic prompt",
      negativePrompt: "no blur",
      creditsUsed: 4,
      model: "gpt-4o-mini",
      usedVision: true,
      usedMode: "cinematic_narrative",
      frameStamp: {
        mode: "cinematic_narrative",
        resolvedFrom: "auto",
        imageModelFamily: "other",
        imageModelId: "google-nano-banana-pro",
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
      safetyAdjustments: ["a → b"],
      promptAnalysis: { storyMeaning: "an accidental closeness", qualityScore: 9 },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.executeShotStartFramePromptJob({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, canonicalShotSummary: "A hero stands in the rain" },
    });

    const persistedFrame = capturedSet.startFramePlan.frames.find((f: any) => f.shotNumber === 1);
    expect(persistedFrame.promptMode).toEqual({
      mode: "cinematic_narrative",
      resolvedFrom: "auto",
      imageModelFamily: "other",
      imageModelId: "google-nano-banana-pro",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(persistedFrame.promptSafetyAdjustments).toEqual(["a → b"]);
    expect(persistedFrame.promptAnalysis).toEqual({ storyMeaning: "an accidental closeness", qualityScore: 9 });

    expect(result.promptMode).toEqual({
      mode: "cinematic_narrative",
      resolvedFrom: "auto",
      imageModelFamily: "other",
      imageModelId: "google-nano-banana-pro",
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("clears a stale mode stamp and analysis when the user runs a general AI edit", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "gpt-image-1.5-all",
        frames: [{
          shotNumber: 1,
          imagePrompt: "old direct prompt",
          negativePrompt: "",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          promptMode: {
            mode: "policy_safe_rewrite",
            resolvedFrom: "auto",
            imageModelFamily: "gpt",
            generatedAt: "2026-01-01T00:00:00.000Z",
          },
          promptSafetyAdjustments: ["old → safe"],
          promptAnalysis: { storyMeaning: "stale" },
        }],
      },
    });
    mockGetModelsByTypeAsync.mockResolvedValue([]);
    mockGenerateStartFrameShotPrompt.mockResolvedValue({
      prompt: "a prompt",
      negativePrompt: "no blur",
      creditsUsed: 4,
      model: "gpt-4o-mini",
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.executeShotStartFramePromptJob({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
    });

    const persistedFrame = capturedSet.startFramePlan.frames.find((f: any) => f.shotNumber === 1);
    expect(persistedFrame.promptMode).toBeUndefined();
    expect(persistedFrame.promptSafetyAdjustments).toBeUndefined();
    expect(persistedFrame.promptAnalysis).toBeUndefined();
    expect(result.promptMode).toBeUndefined();
    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ imagePromptMode: undefined }),
    );
  });
});
