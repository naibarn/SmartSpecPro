/**
 * Vertical Drama — `regenerateClipDialogue` mutation (2026-07-07 "unusable
 * dialogue" fix) unit coverage. Same "mock the whole module graph, invoke the
 * exported procedure handler directly" convention as
 * `verticalDramaEpisodes.generateShotVideoPrompt.test.ts`.
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
  formatVideoClipRequest: vi.fn(),
}));

const {
  mockGenerateVerticalDramaShotVideoPrompt,
  mockGenerateVerticalDramaClipDialogue,
  MockInsufficientCreditsError,
  MockVdSchemaValidationError,
  MockRateLimitExceededError,
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
  return {
    mockGenerateVerticalDramaShotVideoPrompt: vi.fn(),
    mockGenerateVerticalDramaClipDialogue: vi.fn(),
    MockInsufficientCreditsError,
    MockVdSchemaValidationError,
    MockRateLimitExceededError,
  };
});
vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt: mockGenerateVerticalDramaShotVideoPrompt,
  generateVerticalDramaClipDialogue: mockGenerateVerticalDramaClipDialogue,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
  RateLimitExceededError: MockRateLimitExceededError,
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
    script: null,
    motionPromptPack: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModelsByTypeAsync.mockResolvedValue([
    { id: "veo-3-1", type: "video", isEnabled: true, creditCost: 50, aliases: [], configJson: {} },
  ]);
  mockGenerateVerticalDramaClipDialogue.mockResolvedValue({
    dialogue: [{ lineTh: "อย่าไปไหนนะยาย รอฉันกลับมาก่อน", characterKey: "หนูนา" }],
    creditsUsed: 2,
    model: "gpt-4o-mini",
  });
});

describe("regenerateClipDialogue", () => {
  it("happy path: overwrites the matching clip's dialogue and returns the result", async () => {
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        {
          clipNumber: 1,
          sourceShotNumbers: [1],
          prompt: "existing video prompt",
          durationSeconds: 6,
          dialogue: [{ lineTh: "เสียง…ชา…อืม…ใครมาฝากอีกแล้วหรือเปล่า" }],
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: pack });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.regenerateClipDialogue({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(result).toEqual({
      dialogue: [{ lineTh: "อย่าไปไหนนะยาย รอฉันกลับมาก่อน", characterKey: "หนูนา" }],
      creditsUsed: 2,
    });

    expect(mockGenerateVerticalDramaClipDialogue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        seriesId: 10,
        episodeId: 100,
        shotNumber: 1,
        shotContext: expect.objectContaining({
          description: "Hero stands in the rain, looking up",
          camera: "wide shot, low angle",
        }),
      }),
    );

    // Overwrite semantics: the clip's OLD (broken) dialogue is replaced, not
    // merged/appended.
    expect(capturedSet.motionPromptPack.clips).toEqual([
      expect.objectContaining({
        clipNumber: 1,
        sourceShotNumbers: [1],
        prompt: "existing video prompt",
        dialogue: [{ lineTh: "อย่าไปไหนนะยาย รอฉันกลับมาก่อน", characterKey: "หนูนา" }],
      }),
    ]);
  });

  it("passes the optional instruction through to the service call", async () => {
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        { clipNumber: 1, sourceShotNumbers: [1], prompt: "existing prompt", durationSeconds: 6 },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: pack });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.regenerateClipDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "สั้นลง ทางการน้อยลง",
        idempotencyKey: "idem-key-abc",
      },
    });

    expect(mockGenerateVerticalDramaClipDialogue).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "สั้นลง ทางการน้อยลง",
        idempotencyKey: "idem-key-abc",
      }),
    );
  });

  it("creates a minimal clip entry when the pack exists but has no matching clip", async () => {
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        { clipNumber: 2, sourceShotNumbers: [2], prompt: "unrelated clip", durationSeconds: 6 },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: pack });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    await router.regenerateClipDialogue({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(capturedSet.motionPromptPack.clips).toHaveLength(2);
    const newClip = capturedSet.motionPromptPack.clips.find((c: any) => c.clipNumber === 1);
    expect(newClip).toMatchObject({
      clipNumber: 1,
      sourceShotNumbers: [1],
      dialogue: [{ lineTh: "อย่าไปไหนนะยาย รอฉันกลับมาก่อน", characterKey: "หนูนา" }],
    });
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({ clipNumber: 2, prompt: "unrelated clip" }),
    );
  });

  it("creates a minimal pack when motionPromptPack is entirely absent", async () => {
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    await router.regenerateClipDialogue({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(capturedSet.motionPromptPack).toMatchObject({
      selectedVideoModelId: "veo3/generate-veo-3-video-lite",
      clips: [
        expect.objectContaining({
          clipNumber: 1,
          sourceShotNumbers: [1],
          dialogue: [{ lineTh: "อย่าไปไหนนะยาย รอฉันกลับมาก่อน", characterKey: "หนูนา" }],
        }),
      ],
    });
  });

  it("throws FORBIDDEN when credits are insufficient", async () => {
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([]));
    mockGenerateVerticalDramaClipDialogue.mockRejectedValueOnce(
      new MockInsufficientCreditsError("insufficient"),
    );

    await expect(
      router.regenerateClipDialogue({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
