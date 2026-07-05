/**
 * Vertical Drama — per-shot video prompt mutation
 * (`generateShotVideoPrompt`, Phase 6 §6.6b) unit coverage.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaEpisodes.modelSelection.test.ts` /
 * `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts` — the
 * router's `mutation`/`query` mock passes the raw handler function through
 * unchanged.
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

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
}));

vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
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

const { mockGenerateVerticalDramaShotVideoPrompt } = vi.hoisted(() => ({
  mockGenerateVerticalDramaShotVideoPrompt: vi.fn(),
}));
vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt: mockGenerateVerticalDramaShotVideoPrompt,
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

function updateChain(returned: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(returned)),
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
    startFramePlan: {
      mode: "single_frame_per_shot",
      selectedImageModelId: "google-nano-banana-pro",
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "a hero standing in the rain",
          negativePrompt: "",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          approvedMediaAssetId: "900",
        },
      ],
    },
    storyboard: {
      gridLayout: "3x3",
      shotCount: 9,
      shots: [
        {
          shotNumber: 1,
          description: "Hero stands in the rain, looking up",
          cameraSetup: "wide shot, low angle",
          characterIds: ["hero"],
          continuityNotes: [],
          durationSeconds: 6,
        },
      ],
    },
    dialogueAudioPlan: null,
    motionPromptPack: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModelsByTypeAsync.mockResolvedValue([
    { id: "veo-3-1", type: "video", isEnabled: true, creditCost: 50, aliases: [], configJson: {} },
  ]);
  mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValue({
    prompt: "generated motion prompt",
    negativeMotionPrompt: "no glitching",
    dialogue: [{ lineTh: "สวัสดี", characterKey: "hero" }],
    creditsUsed: 3,
    model: "gpt-vision",
    usedVision: true,
  });
});

describe("generateShotVideoPrompt", () => {
  it("happy path: persists prompt+dialogue onto the matching clip and returns the result", async () => {
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        {
          clipNumber: 1,
          sourceShotNumbers: [1],
          prompt: "old placeholder prompt",
          durationSeconds: 6,
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: pack });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])); // resolveMediaAssetUrlsByIds

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(result).toEqual({
      prompt: "generated motion prompt",
      dialogue: [{ lineTh: "สวัสดี", characterKey: "hero" }],
      creditsUsed: 3,
      usedVision: true,
    });

    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        seriesId: 10,
        episodeId: 100,
        shotNumber: 1,
        imageUrl: "https://cdn/900.png",
        imagePrompt: "a hero standing in the rain",
        shotContext: expect.objectContaining({
          description: "Hero stands in the rain, looking up",
          camera: "wide shot, low angle",
        }),
        selectedVideoModelId: "veo-3-1",
        locale: "th",
      }),
    );

    expect(capturedSet.motionPromptPack.clips).toEqual([
      expect.objectContaining({
        clipNumber: 1,
        sourceShotNumbers: [1],
        prompt: "generated motion prompt",
        negativeMotionPrompt: "no glitching",
        dialogue: [{ lineTh: "สวัสดี", characterKey: "hero" }],
      }),
    ]);
  });

  it("throws PRECONDITION_FAILED when the shot has no approved image yet", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a hero standing in the rain",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            // no approvedMediaAssetId
          },
        ],
      },
    });
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow])); // loadOwnedEpisode

    await expect(
      router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockGenerateVerticalDramaShotVideoPrompt).not.toHaveBeenCalled();
  });

  it("creates a minimal clip entry when the pack exists but has no matching clip", async () => {
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        {
          clipNumber: 2,
          sourceShotNumbers: [2],
          prompt: "unrelated clip",
          durationSeconds: 6,
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: pack });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(capturedSet.motionPromptPack.clips).toHaveLength(2);
    const newClip = capturedSet.motionPromptPack.clips.find(
      (c: any) => c.clipNumber === 1,
    );
    expect(newClip).toMatchObject({
      clipNumber: 1,
      sourceShotNumbers: [1],
      prompt: "generated motion prompt",
      dialogue: [{ lineTh: "สวัสดี", characterKey: "hero" }],
    });
    // Untouched pre-existing clip stays exactly as-is.
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({ clipNumber: 2, prompt: "unrelated clip" }),
    );
  });

  it("creates a minimal pack when motionPromptPack is entirely absent", async () => {
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(capturedSet.motionPromptPack).toMatchObject({
      selectedVideoModelId: "veo3/generate-veo-3-video-lite",
      clips: [
        expect.objectContaining({
          clipNumber: 1,
          sourceShotNumbers: [1],
          prompt: "generated motion prompt",
        }),
      ],
    });
  });

  it("passes idempotencyKey through to the service call", async () => {
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]));
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        idempotencyKey: "idem-key-123",
      },
    });

    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "idem-key-123" }),
    );
  });
});
