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

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

// Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`) —
// `regenerateClipDialogue` resolves `deepDraftShotForRegen` via a dynamic
// `import()` of `verticalDramaStoryBible.ts` (same "avoid the
// `adminProcedure` chain" reasoning as every other mock in this file).
// Default `null` so every pre-existing test (which never opts into
// `verticalDramaSeriesDeepStoryDrafts`) never even calls it.
const { mockGetActiveBreakdown, mockReadItemShotDrafts } = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(() => []),
  mockReadItemShotDrafts: vi.fn(() => null),
}));
vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemShotDrafts: mockReadItemShotDrafts,
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

  it("2026-07-11 dup-clip fix: collapses a stale split's leftover sub-shot clips into exactly one clip, seeded from the first matching sub-shot", async () => {
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        { clipNumber: 1, sourceShotNumbers: [1], prompt: "shot 1 prompt", durationSeconds: 6 },
        {
          clipNumber: 301,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 1,
          prompt: "stale sub-shot 1 prompt",
          durationSeconds: 3,
          dialogue: [{ lineTh: "stale sub-shot 1 line" }],
        },
        {
          clipNumber: 302,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 2,
          prompt: "stale sub-shot 2 prompt",
          durationSeconds: 3,
          dialogue: [{ lineTh: "stale sub-shot 2 line" }],
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({
      motionPromptPack: pack,
      storyboard: {
        gridLayout: "3x3",
        shotCount: 9,
        shots: [
          {
            shotNumber: 3,
            description: "Two characters argue",
            cameraSetup: "medium shot",
            characterIds: ["a", "b"],
            continuityNotes: [],
            durationSeconds: 6,
          },
        ],
      },
    });

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

    await router.regenerateClipDialogue({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 3 },
    });

    const shot3Clips = capturedSet.motionPromptPack.clips.filter(
      (c: any) => c.sourceShotNumbers?.includes(3) || c.parentShotNumber === 3,
    );
    // Exactly one clip survives for shot 3 — the stale sub-shot 2 clip
    // (clipNumber 302) must be gone, not left behind as a duplicate.
    expect(shot3Clips).toHaveLength(1);
    expect(shot3Clips[0]).toMatchObject({
      prompt: "stale sub-shot 1 prompt",
      dialogue: [{ lineTh: "อย่าไปไหนนะยาย รอฉันกลับมาก่อน", characterKey: "หนูนา" }],
    });
    // No longer a sub-shot once collapsed.
    expect(shot3Clips[0].parentShotNumber).toBeUndefined();
    expect(shot3Clips[0].subShotNumber).toBeUndefined();
    // Shot 1's own clip is untouched.
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({ clipNumber: 1, prompt: "shot 1 prompt" }),
    );
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

/**
 * Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`,
 * added 2026-07-11) — when this shot carries a canonical dialogue (or an
 * explicit `silence_intent`) at the Overview page, `regenerateClipDialogue`
 * always syncs to / rejects based on THAT source alone, ignoring any
 * user-typed `instruction`, and never calls the LLM.
 */
describe("regenerateClipDialogue — dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`)", () => {
  it("syncs to the canonical Overview-page dialogue without calling the LLM, ignoring the instruction, creditsUsed 0, synced: true", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesDeepStoryDrafts: true });
    mockGetActiveBreakdown.mockReturnValue([
      { episodeNumber: 1, workingTitle: "t", logline: "l", keyBeats: [] },
    ]);
    mockReadItemShotDrafts.mockReturnValue([
      {
        shot_number: 1,
        summary: "s",
        dialogue_lines: [{ speaker: "หนูนา", line: "TESTMARK123", delivery: "soft" }],
      },
    ]);

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
    const episodeRow = baseEpisodeRow({ motionPromptPack: pack, episodeNumber: 1 });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: null }])); // locale/bible lookup (deep-draft resolution)

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.regenerateClipDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        // Deliberately supplied — must be IGNORED once canonical dialogue
        // exists, never falls through to the LLM path just because an
        // instruction was supplied.
        instruction: "ทำให้สั้นลง",
      },
    });

    expect(mockGenerateVerticalDramaClipDialogue).not.toHaveBeenCalled();
    expect(result).toEqual({
      dialogue: [{ characterKey: "หนูนา", lineTh: "TESTMARK123", delivery: { tone: "soft" } }],
      creditsUsed: 0,
      synced: true,
    });
    expect(capturedSet.motionPromptPack.clips[0].dialogue).toEqual([
      { characterKey: "หนูนา", lineTh: "TESTMARK123", delivery: { tone: "soft" } },
    ]);
  });

  it("throws PRECONDITION_FAILED when the shot is marked silence_intent at the Overview page — touches no clip, calls neither the LLM nor db.update", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesDeepStoryDrafts: true });
    mockGetActiveBreakdown.mockReturnValue([
      { episodeNumber: 1, workingTitle: "t", logline: "l", keyBeats: [] },
    ]);
    mockReadItemShotDrafts.mockReturnValue([
      {
        shot_number: 1,
        summary: "wordless establishing shot",
        dialogue_lines: [],
        silence_intent: "establishing",
      },
    ]);

    const episodeRow = baseEpisodeRow({ motionPromptPack: null, episodeNumber: 1 });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));

    await expect(
      router.regenerateClipDialogue({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "ช็อตนี้ถูกกำหนดไว้ว่าตั้งใจไม่มีบทพูด — แก้ไขได้ที่หน้าภาพรวม (Overview)",
    });

    expect(mockGenerateVerticalDramaClipDialogue).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("flag ON but this shot has no deep-drafted entry yet — falls through to the pre-existing LLM path unchanged (regression guard)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesDeepStoryDrafts: true });
    mockGetActiveBreakdown.mockReturnValue([]); // no matching episode plan item at all

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
    const episodeRow = baseEpisodeRow({ motionPromptPack: pack, episodeNumber: 1 });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: null }])) // locale/bible lookup
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

    expect(mockGenerateVerticalDramaClipDialogue).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      dialogue: [{ lineTh: "อย่าไปไหนนะยาย รอฉันกลับมาก่อน", characterKey: "หนูนา" }],
      creditsUsed: 2,
    });
    expect(capturedSet.motionPromptPack.clips[0].dialogue).toEqual([
      { lineTh: "อย่าไปไหนนะยาย รอฉันกลับมาก่อน", characterKey: "หนูนา" },
    ]);
  });
});
