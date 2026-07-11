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

const {
  mockGenerateVerticalDramaShotVideoPrompt,
  mockGenerateVerticalDramaClipDialogue,
  mockAppendPresetVisualIdentityStyleTokensToMotionPrompt,
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
    // Wave-7D (spec §8.2.2 flow-through rule) — `generateShotVideoPrompt`
    // calls this directly (already-statically-imported, real function in
    // production; mocked here like every other export of this module). Real
    // pure logic mirrored inline (not `vi.importActual` — this module
    // transitively reaches `enabledLlmModels.ts` -> `llmProviders.ts`'s
    // `adminProcedure`, unsafe for this file's `../../_core/trpc` mock, same
    // reasoning as every other mock in this file) so tests can assert on
    // BOTH the call args and the resulting persisted prompt text.
    mockAppendPresetVisualIdentityStyleTokensToMotionPrompt: vi.fn(
      (prompt: string, identity?: { styleName?: string; lighting?: string }) => {
        if (!identity?.styleName && !identity?.lighting) return prompt;
        const tokens = [
          identity.styleName ? `visual style: ${identity.styleName}` : null,
          identity.lighting ? `lighting: ${identity.lighting}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return `${prompt} Preset style tokens (${tokens}).`;
      },
    ),
    MockInsufficientCreditsError,
    MockVdSchemaValidationError,
    MockRateLimitExceededError,
  };
});
vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt: mockGenerateVerticalDramaShotVideoPrompt,
  generateVerticalDramaClipDialogue: mockGenerateVerticalDramaClipDialogue,
  appendPresetVisualIdentityStyleTokensToMotionPrompt:
    mockAppendPresetVisualIdentityStyleTokensToMotionPrompt,
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

// Part B3 (planning/`polished-toasting-gadget.md`) — `generateShotVideoPrompt`
// now resolves the episode plan-context block via a dynamic `import()` of
// `verticalDramaStoryBible.ts`. Mocked directly (same "avoid the
// `adminProcedure` chain" reasoning as every other mock in this file above)
// with a safe empty-array default; tests exercising the plan-context
// injection itself override `mockGetActiveBreakdown`'s return value per-case.
const { mockGetActiveBreakdown, mockReadItemCliffhangerLine } = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(() => []),
  mockReadItemCliffhangerLine: vi.fn(() => undefined),
}));
vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";
import { targetVerticalDramaSpeechSeconds } from "@shared/verticalDramaSeries/dialogueQuality";

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
    // `.for("update")` — row-lock modifier used by the 2026-07-11
    // lost-update race fix's transaction re-read (`generateShotVideoPrompt`).
    for: vi.fn(() => chain),
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
  // 2026-07-11 lost-update race fix — `generateShotVideoPrompt`'s final
  // persist step now runs inside `db.transaction(...)`, re-reading +
  // locking the row (`tx.select(...).for("update")`) right before merging
  // the new clip, instead of reusing the (possibly-stale) `pack` captured
  // near the top of the request. Default stub: `tx.select` resolves to an
  // empty row (so the merge falls back to the outer `pack`, i.e. byte
  // identical to every pre-fix test's expectations below), and `tx.update`
  // delegates straight through to `mockDb.update` so the existing
  // `mockDb.update.mockReturnValueOnce({ set: ... })` / `capturedSet`
  // convention every test below already uses keeps working unchanged. The
  // dedicated race-fix test further down overrides this per-case to prove
  // a concurrently-written fresh row is actually honored.
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      select: (...args: unknown[]) => selectChain([]),
      update: (...args: unknown[]) => (mockDb.update as any)(...args),
    };
    return fn(tx);
  });
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
  mockGenerateVerticalDramaClipDialogue.mockResolvedValue({
    dialogue: [{ lineTh: "บทสดใหม่ของช็อตนี้", characterKey: "hero" }],
    creditsUsed: 2,
    model: "gpt-4o-mini",
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
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup (no tie-in placement -> no productTieIn select)

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

  it("2026-07-11 lost-update race fix: merges against the freshly row-locked pack, not the stale snapshot loaded earlier — a concurrent call's already-persisted clip survives", async () => {
    // The `pack` this call's `loadOwnedEpisode` read near the top of the
    // request — a STALE snapshot taken BEFORE a concurrent
    // `generateShotVideoPrompt` call for a different shot (shot 3) finished
    // and persisted its own clip.
    const stalePack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        { clipNumber: 1, sourceShotNumbers: [1], prompt: "old shot 1 prompt", durationSeconds: 6 },
      ],
      warnings: [],
    };
    // What's ACTUALLY in the DB by the time this call reaches its final
    // write — the concurrent shot-3 call already committed its clip.
    const freshPackFromConcurrentWrite = {
      ...stalePack,
      clips: [
        ...stalePack.clips,
        {
          clipNumber: 3,
          sourceShotNumbers: [3],
          prompt: "shot 3 prompt from a concurrent call",
          durationSeconds: 6,
        },
      ],
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: stalePack });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode (stale snapshot)
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    // The row-lock read inside the transaction sees the FRESH, already
    // concurrently-updated pack — not the stale outer snapshot.
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: () => selectChain([{ motionPromptPack: freshPackFromConcurrentWrite }]),
        update: (...args: unknown[]) => (mockDb.update as any)(...args),
      };
      return fn(tx);
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    // Shot 3's concurrently-persisted clip must survive this write...
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({
        clipNumber: 3,
        prompt: "shot 3 prompt from a concurrent call",
      }),
    );
    // ...alongside this call's own shot-1 update.
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({ clipNumber: 1, prompt: "generated motion prompt" }),
    );
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
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));

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

  it("2026-07-11 dup-clip fix: collapses a stale split's leftover sub-shot clips into exactly one clip when the shot no longer needs a split", async () => {
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        {
          clipNumber: 301,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 1,
          prompt: "stale sub-shot 1 prompt",
          durationSeconds: 3,
        },
        {
          clipNumber: 302,
          sourceShotNumbers: [3],
          parentShotNumber: 3,
          subShotNumber: 2,
          prompt: "stale sub-shot 2 prompt",
          durationSeconds: 3,
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({
      motionPromptPack: pack,
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 3,
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
            shotNumber: 3,
            description: "Hero stands in the rain, looking up",
            cameraSetup: "wide shot, low angle",
            characterIds: ["hero"],
            continuityNotes: [],
            durationSeconds: 6,
          },
        ],
      },
    });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 3 },
    });

    // Exactly one clip for shot 3 survives — no stale clipNumber 302.
    expect(capturedSet.motionPromptPack.clips).toHaveLength(1);
    expect(capturedSet.motionPromptPack.clips[0]).toMatchObject({
      clipNumber: 3,
      sourceShotNumbers: [3],
      prompt: "generated motion prompt",
    });
    expect(
      capturedSet.motionPromptPack.clips.find((c: any) => c.clipNumber === 302),
    ).toBeUndefined();
  });

  it("uses the requested shot's image, storyboard context, and matching clip when regenerating shot 2", async () => {
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        {
          clipNumber: 1,
          sourceShotNumbers: [1],
          prompt: "shot 1 prompt must stay untouched",
          durationSeconds: 6,
          dialogue: [{ lineTh: "บทช็อตหนึ่ง", characterKey: "hero" }],
        },
        {
          clipNumber: 2,
          sourceShotNumbers: [2],
          prompt: "old shot 2 prompt",
          durationSeconds: 6,
          dialogue: [
            {
              lineTh: "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
              characterKey: "grandmother",
            },
          ],
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "shot one image prompt",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            approvedMediaAssetId: "900",
          },
          {
            shotNumber: 2,
            imagePrompt: "shot two image prompt by the glass cabinet",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            approvedMediaAssetId: "901",
          },
        ],
      },
      storyboard: {
        gridLayout: "3x3",
        shotCount: 9,
        shots: [
          {
            shotNumber: 1,
            description: "Shot one description",
            cameraSetup: "wide shot",
            characterIds: ["hero"],
            continuityNotes: [],
            durationSeconds: 6,
          },
          {
            shotNumber: 2,
            description: "Girl reaches toward the glass cabinet",
            cameraSetup: "close-up, eye level, slow push-in",
            characterIds: ["hero", "grandmother"],
            continuityNotes: [],
            durationSeconds: 6,
          },
        ],
      },
      motionPromptPack: pack,
    });

    mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValueOnce({
      prompt: "generated motion prompt for shot 2",
      negativeMotionPrompt: "no glitching",
      dialogue: [{ lineTh: "บทใหม่ช็อตสอง", characterKey: "grandmother" }],
      creditsUsed: 3,
      model: "gpt-vision",
      usedVision: true,
    });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 901, originalUrl: "https://cdn/901.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 2 },
    });

    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        shotNumber: 2,
        imageUrl: "https://cdn/901.png",
        imagePrompt: "shot two image prompt by the glass cabinet",
        shotContext: expect.objectContaining({
          description: "Girl reaches toward the glass cabinet",
          camera: "close-up, eye level, slow push-in",
          dialogueLines: [
            {
              lineTh: "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
              characterKey: "grandmother",
            },
          ],
        }),
      }),
    );

    expect(capturedSet.motionPromptPack.clips).toEqual([
      expect.objectContaining({
        clipNumber: 1,
        sourceShotNumbers: [1],
        prompt: "shot 1 prompt must stay untouched",
        dialogue: [{ lineTh: "บทช็อตหนึ่ง", characterKey: "hero" }],
      }),
      expect.objectContaining({
        clipNumber: 2,
        sourceShotNumbers: [2],
        prompt: "generated motion prompt for shot 2",
        dialogue: [{ lineTh: "บทใหม่ช็อตสอง", characterKey: "grandmother" }],
      }),
    ]);
  });

  it("refreshes duplicated persisted dialogue before regenerating shot 2 video prompt", async () => {
    const duplicatedDialogue = [
      { lineTh: "ยายทวดจัน…วันนี้อย่าหลงนะ", characterKey: "หนูนา" },
      { lineTh: "เสียง…ชา…อืม…ใครมาฝากอีกแล้วหรือเปล่า", characterKey: "ยายทวดจัน" },
    ];
    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        {
          clipNumber: 1,
          sourceShotNumbers: [1],
          prompt: "shot 1 prompt",
          durationSeconds: 6,
          dialogue: duplicatedDialogue,
        },
        {
          clipNumber: 2,
          sourceShotNumbers: [2],
          prompt: "old shot 2 prompt",
          durationSeconds: 6,
          dialogue: duplicatedDialogue,
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 2,
            imagePrompt: "shot two image prompt by the glass cabinet",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            approvedMediaAssetId: "901",
          },
        ],
      },
      storyboard: {
        gridLayout: "3x3",
        shotCount: 9,
        shots: [
          {
            shotNumber: 2,
            description: "Girl reaches toward the glass cabinet",
            cameraSetup: "close-up, eye level, slow push-in",
            characterIds: ["หนูนา", "ยายทวดจัน"],
            continuityNotes: [],
            durationSeconds: 6,
          },
        ],
      },
      motionPromptPack: pack,
    });
    const freshDialogue = [
      { lineTh: "ยาย มองเห็นอะไรในตู้ไหม", characterKey: "หนูนา" },
      { lineTh: "ข้าเห็นเงาเก่าขยับอยู่ข้างใน", characterKey: "ยายทวดจัน" },
    ];
    mockGenerateVerticalDramaClipDialogue.mockResolvedValueOnce({
      dialogue: freshDialogue,
      creditsUsed: 2,
      model: "gpt-4o-mini",
    });
    mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValueOnce({
      prompt: "generated motion prompt for shot 2 with fresh dialogue",
      negativeMotionPrompt: "no glitching",
      dialogue: freshDialogue,
      creditsUsed: 3,
      model: "gpt-vision",
      usedVision: true,
    });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 901, originalUrl: "https://cdn/901.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 2, idempotencyKey: "shot2" },
    });

    expect(mockGenerateVerticalDramaClipDialogue).toHaveBeenCalledWith(
      expect.objectContaining({
        shotNumber: 2,
        idempotencyKey: "shot2:dialogue-refresh",
        shotContext: expect.objectContaining({
          description: "Girl reaches toward the glass cabinet",
          sceneDialogueContext: [
            'หนูนา: "ยายทวดจัน…วันนี้อย่าหลงนะ"',
            'ยายทวดจัน: "เสียง…ชา…อืม…ใครมาฝากอีกแล้วหรือเปล่า"',
          ],
        }),
      }),
    );
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        shotNumber: 2,
        shotContext: expect.objectContaining({ dialogueLines: freshDialogue }),
      }),
    );
    expect(result.creditsUsed).toBe(5);
    expect(capturedSet.motionPromptPack.clips).toEqual([
      expect.objectContaining({
        clipNumber: 1,
        sourceShotNumbers: [1],
        dialogue: duplicatedDialogue,
      }),
      expect.objectContaining({
        clipNumber: 2,
        sourceShotNumbers: [2],
        prompt: "generated motion prompt for shot 2 with fresh dialogue",
        dialogue: freshDialogue,
      }),
    ]);
  });

  it("creates a minimal pack when motionPromptPack is entirely absent", async () => {
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));

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
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));
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

  describe("nativeAudioEnabled (task #36 — optional NATIVE AUDIO DIRECTION prompt option)", () => {
    it("rollout gate is hardcoded off (F131AC pending) — the service call always receives nativeAudioEnabled: false, even when the client sends true", async () => {
      const pack = {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: [
          { clipNumber: 1, sourceShotNumbers: [1], prompt: "old", durationSeconds: 6 },
        ],
        warnings: [],
      };
      const episodeRow = baseEpisodeRow({ motionPromptPack: pack });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ locale: "th" }]));
      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          nativeAudioEnabled: true,
        },
      });

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ nativeAudioEnabled: false }),
      );
    });

    it("persists audioDirection onto the matching clip and returns it, while still gating the service call off", async () => {
      mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValueOnce({
        prompt: "generated motion prompt",
        negativeMotionPrompt: "no glitching",
        dialogue: [],
        creditsUsed: 3,
        model: "gpt-vision",
        usedVision: true,
        audioDirection: "Rain taps the window; a door creaks shut.",
      });
      const pack = {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: [
          { clipNumber: 1, sourceShotNumbers: [1], prompt: "old", durationSeconds: 6 },
        ],
        warnings: [],
      };
      const episodeRow = baseEpisodeRow({ motionPromptPack: pack });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ locale: "th" }]));
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

      expect(result.audioDirection).toBe("Rain taps the window; a door creaks shut.");
      expect(capturedSet.motionPromptPack.clips).toEqual([
        expect.objectContaining({
          clipNumber: 1,
          audioDirection: "Rain taps the window; a door creaks shut.",
        }),
      ]);
    });

    it("persists the raw nativeAudioEnabled preference onto a brand-new pack even though the rollout gate is off", async () => {
      const episodeRow = baseEpisodeRow({ motionPromptPack: null });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ locale: "th" }]));
      let capturedSet: any;
      mockDb.update.mockReturnValueOnce({
        set: vi.fn((v: any) => {
          capturedSet = v;
          return updateChain([episodeRow]);
        }),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          nativeAudioEnabled: true,
        },
      });

      expect(capturedSet.motionPromptPack.nativeAudioEnabled).toBe(true);
      // ...but the service call itself was still gated off (see the
      // rollout-gate test above) — the preference is stored for whenever
      // the conductor flips F131AC, not honored yet.
      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ nativeAudioEnabled: false }),
      );
    });
  });
});

/**
 * Story-density reform (spec §7.7.2 Layer 3/4, section-13, added
 * 2026-07-07) — `verticalDramaSeriesSpeechBudget`-gated wiring:
 *  - duration-aware first-pass video prompt params (`shotDurationSeconds` /
 *    `targetSpeechSeconds`, consumed by `buildShotVideoPromptUserPrompt`);
 *  - `resolveShotDialogueLines`'s deterministic beat-index mapping, wired
 *    end-to-end from the storyboard shot's `sourceBeatIndexes` through to
 *    the `shotContext.dialogueLines` this router mutation sends the LLM.
 */
describe("generateShotVideoPrompt — story-density reform wiring (flag-gated)", () => {
  it("omits shotDurationSeconds/targetSpeechSeconds when the flag is off (default — byte-identical to before)", async () => {
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    expect(callArgs.shotDurationSeconds).toBeUndefined();
    expect(callArgs.targetSpeechSeconds).toBeUndefined();
  });

  it("passes shotDurationSeconds + targetSpeechSeconds (via targetVerticalDramaSpeechSeconds) when the flag is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesSpeechBudget: true });
    const episodeRow = baseEpisodeRow({ motionPromptPack: null }); // storyboard shot 1 durationSeconds: 6
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    expect(callArgs.shotDurationSeconds).toBe(6);
    expect(callArgs.targetSpeechSeconds).toBeCloseTo(targetVerticalDramaSpeechSeconds(6), 5);
  });

  it("maps dialogue via the shot's sourceBeatIndexes (source 3a) instead of the positional guess when the flag is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesSpeechBudget: true });
    const episodeRow = baseEpisodeRow({
      motionPromptPack: null,
      script: {
        structure: {
          beats: [
            { beat: 1, dialogue_lines: [{ speaker: "hero", line: "Positional decoy line" }] },
            {
              beat: 2,
              dialogue_lines: [
                {
                  speaker: "hero",
                  // Deliberately long enough that its estimated speech
                  // seconds clear MIN_CLIP_COVERAGE_RATIO for a 6s clip
                  // (>= 2.7s of speech) — otherwise the PRE-EXISTING,
                  // unrelated `shouldRegenerateDialogueForVideoPrompt`
                  // quality gate (VD_DIALOGUE_UNDERFILLED) auto-regenerates
                  // this line via `generateVerticalDramaClipDialogue` before
                  // it ever reaches `generateVerticalDramaShotVideoPrompt`,
                  // masking the assertion this test actually cares about.
                  line: "This beat-mapped dialogue line is long enough to clear the coverage floor",
                },
              ],
            },
          ],
        },
        scene_dialogue_summary: [{ scene: 1, dialogue_lines: ['hero: "legacy positional line"'] }],
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
            sourceBeatIndexes: [1],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    // The dialogue-regeneration safety net never fires for this well-formed,
    // non-`script_fallback` beat-mapped line.
    expect(mockGenerateVerticalDramaClipDialogue).not.toHaveBeenCalled();
    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    expect(callArgs.shotContext.dialogueLines).toEqual([
      {
        characterKey: "hero",
        lineTh: "This beat-mapped dialogue line is long enough to clear the coverage floor",
      },
    ]);
  });

  it("still falls back to the positional guess (source 3b) when the flag is on but the shot has no sourceBeatIndexes", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesSpeechBudget: true });
    const episodeRow = baseEpisodeRow({
      motionPromptPack: null,
      script: {
        scene_dialogue_summary: [{ scene: 1, dialogue_lines: ['hero: "legacy positional line"'] }],
      },
      // storyboard shot (from baseEpisodeRow) carries no sourceBeatIndexes.
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    // Source 3b's `script_fallback` tag is exactly what the PRE-EXISTING,
    // unrelated `shouldRegenerateDialogueForVideoPrompt` safety net always
    // regenerates before the final LLM call — so the positional guess's
    // resolved text is observable one layer earlier, as the regeneration
    // call's `sceneDialogueContext` (proving 3b, not 3a, produced it).
    expect(mockGenerateVerticalDramaClipDialogue).toHaveBeenCalledWith(
      expect.objectContaining({
        shotContext: expect.objectContaining({
          sceneDialogueContext: ['hero: "legacy positional line"'],
        }),
      }),
    );
    // The (mocked) regenerated dialogue is what reaches the final call.
    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    expect(callArgs.shotContext.dialogueLines).toEqual([
      { lineTh: "บทสดใหม่ของช็อตนี้", characterKey: "hero" },
    ]);
  });
});

/**
 * Wave-7D (spec §8.2.2 flow-through rule, `verticalDramaSeriesPresetMixV2`)
 * — extends the identity flow-through W4-A already wired into
 * `generateVideoClip`'s PROVIDER payload onto this procedure's user-visible
 * FIRST-PASS prompt (the one persisted onto `motionPromptPack.clips[]` and
 * returned to the caller before any paid render happens).
 */
describe("generateShotVideoPrompt — preset visual identity flow-through (Wave-7D, flag-gated)", () => {
  function presetVisualIdentityBible(over: Record<string, unknown> = {}) {
    return {
      presetVisualIdentity: {
        styleName: "sci-fi mecha noir",
        palette: ["steel blue", "amber", "gunmetal"],
        lighting: "cold rim light with amber practicals",
        environmentMotifs: ["hangar bays"],
        wardrobeGrammar: ["pilot suits"],
        signaturePropsAndCompanions: ["mecha unit"],
        cameraGrammar: "low angle hero shots",
        characterArchetypes: [],
        imagePromptFragments: { positive: ["mecha plating"], negative: ["cartoonish"] },
        ...over,
      },
    };
  }

  it("appends the preset's style tokens onto the persisted first-pass prompt when the flag is on and the series carries a preset identity", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: true });
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
      .mockReturnValueOnce(selectChain([{ bible: presetVisualIdentityBible() }])); // loadSeriesPresetVisualIdentity

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

    expect(mockAppendPresetVisualIdentityStyleTokensToMotionPrompt).toHaveBeenCalledWith(
      "generated motion prompt",
      expect.objectContaining({ styleName: "sci-fi mecha noir", lighting: "cold rim light with amber practicals" }),
    );
    const expectedPrompt =
      "generated motion prompt Preset style tokens (visual style: sci-fi mecha noir, lighting: cold rim light with amber practicals).";
    expect(result.prompt).toBe(expectedPrompt);
    expect(capturedSet.motionPromptPack.clips[0]).toMatchObject({ prompt: expectedPrompt });
  });

  it("does not append and does not load preset identity when the flag is off (default — flags-off byte-identical)", async () => {
    // Explicit (not relying on an earlier test's `mockResolvedValue` default
    // — `vi.clearAllMocks()` clears call history but not a previously-set
    // default implementation, same footgun documented elsewhere in this
    // file's test suite).
    mockGetTenantFeatureFlags.mockResolvedValue({});
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    const result = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockAppendPresetVisualIdentityStyleTokensToMotionPrompt).not.toHaveBeenCalled();
    expect(result.prompt).toBe("generated motion prompt");
    // Exactly the 4 pre-Wave-7D selects — no extra `loadSeriesPresetVisualIdentity` read.
    expect(mockDb.select).toHaveBeenCalledTimes(4);
  });

  it("does not append when the flag is on but the series carries no preset identity (legacy/non-preset series)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesPresetMixV2: true });
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain([{ bible: null }])); // no presetVisualIdentity stamped

    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    const result = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockAppendPresetVisualIdentityStyleTokensToMotionPrompt).not.toHaveBeenCalled();
    expect(result.prompt).toBe("generated motion prompt");
  });

  describe("retention hooks router wiring (planning/vertical-drama-retention-hooks/plan.md W7)", () => {
    function episodeRowWithScript(over: Record<string, unknown> = {}) {
      return baseEpisodeRow({
        script: {
          hook: "A phone rings in an empty house.",
          retention_loop: {
            type: "unresolved_image",
            description: "The phone keeps ringing as the door creaks open.",
          },
        },
        storyboard: {
          gridLayout: "3x3",
          shotCount: 2,
          shots: [
            {
              shotNumber: 1,
              description: "Hero stands in the rain, looking up",
              cameraSetup: "wide shot, low angle",
              characterIds: ["hero"],
              continuityNotes: [],
              durationSeconds: 6,
            },
            {
              shotNumber: 2,
              description: "Hero looks back one last time",
              cameraSetup: "close up",
              characterIds: ["hero"],
              continuityNotes: [],
              durationSeconds: 6,
            },
          ],
        },
        ...over,
      });
    }

    it("flag off: retentionHooksEnabled is false (byte-identical prompt, per the service's own flag gate)", async () => {
      // `vi.clearAllMocks()` (top-level `beforeEach`) clears call history but
      // NOT a previously configured `mockResolvedValue` — explicitly reset
      // to "everything off" so this test is robust to file ordering (same
      // rationale as `verticalDramaEpisodes.shotReferencesAndQualityReview
      // .test.ts`'s identical `beforeEach` comment).
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      const episodeRow = episodeRowWithScript();
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ retentionHooksEnabled: false }),
      );
    });

    it("flag on: resolves verticalDramaRetentionHooks and threads retentionHooksEnabled/totalShotCount/hookText/retentionLoopDescription", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaRetentionHooks: true,
      } as any);
      const episodeRow = episodeRowWithScript();
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGetTenantFeatureFlags).toHaveBeenCalledWith("tenant-1");
      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          retentionHooksEnabled: true,
          totalShotCount: 2,
          hookText: "A phone rings in an empty house.",
          retentionLoopDescription:
            "The phone keeps ringing as the door creaks open.",
        }),
      );
    });

    it("omits hookText/retentionLoopDescription when the script has neither field yet (pre-retention-hooks artifact)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaRetentionHooks: true,
      } as any);
      const episodeRow = baseEpisodeRow({});
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          retentionHooksEnabled: true,
          hookText: undefined,
          retentionLoopDescription: undefined,
        }),
      );
    });
  });
});

/**
 * Cliffhanger-bleed fix (confirmed production bug, 2026-07-11) — the NEXT
 * episode's teased `cliffhanger_line` (intentionally authored to preview
 * the following episode, see `readItemCliffhangerLine`'s doc comment) must
 * never be included in the `episodePlanContext` this per-shot mutation
 * builds and passes to `generateVerticalDramaShotVideoPrompt`, because that
 * service runs once PER SHOT — every independent LLM call for every shot
 * previously saw the next episode's theme as "reference" context, and
 * cheaper models did not reliably honor the "reference only, do not copy"
 * instruction, bleeding next-episode dialogue into unrelated current-episode
 * shots (confirmed: series 6 / episode 41, shots 2/3/6). Real-world data
 * confirmed across a full 6-episode series that every episode's own
 * `cliffhanger_line` matches the FOLLOWING episode's actual topic — so this
 * suite deliberately sets the current episode's own `logline`/`keyBeats` to
 * one topic (e.g. diaper testing) and the `cliffhanger_line` to a
 * DIFFERENT, unrelated topic (e.g. hand cleanliness) to mirror the real
 * incident shape.
 */
describe("generateShotVideoPrompt — episodePlanContext excludes the next-episode cliffhanger (cliffhanger-bleed fix)", () => {
  function diaperEpisodeBreakdownItem(over: Record<string, unknown> = {}) {
    return {
      episodeNumber: 1,
      workingTitle: "กางเกงผ้าอ้อมทำงานยังไงถึงต้องมี",
      logline: "ฝ้ายกับใบข้าวทดสอบกางเกงผ้าอ้อมกันน้ำ",
      keyBeats: ["เปิดฉากทดสอบกางเกงผ้าอ้อม", "สรุปผลการทดสอบ"],
      // The NEXT episode's (unrelated) teased theme — intentionally authored
      // this way, must never reach this per-shot call's LLM context.
      cliffhanger_line: "แล้วถ้ามือดูสะอาด แต่จริงๆ ยังสกปรกอยู่ล่ะ",
      ...over,
    };
  }

  it("omits the cliffhanger line from episodePlanContext while keeping title/logline/keyBeats", async () => {
    mockGetActiveBreakdown.mockReturnValue([diaperEpisodeBreakdownItem()]);
    const episodeRow = baseEpisodeRow({ motionPromptPack: null, episodeNumber: 1 });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    const episodePlanContext: string | undefined = callArgs.episodePlanContext;
    expect(episodePlanContext).toBeDefined();
    // The bleed vector — must be gone.
    expect(episodePlanContext).not.toContain("จุดค้าง");
    expect(episodePlanContext).not.toContain("แล้วถ้ามือดูสะอาด");
    // Legitimate current-episode continuity grounding — must stay.
    expect(episodePlanContext).toContain("กางเกงผ้าอ้อมทำงานยังไงถึงต้องมี");
    expect(episodePlanContext).toContain("ฝ้ายกับใบข้าวทดสอบกางเกงผ้าอ้อมกันน้ำ");
    expect(episodePlanContext).toContain("เปิดฉากทดสอบกางเกงผ้าอ้อม");
    expect(episodePlanContext).toContain("สรุปผลการทดสอบ");
    // `readItemCliffhangerLine` must not even be consulted for this call
    // site anymore — the router omits `cliffhangerLine` outright.
    expect(mockReadItemCliffhangerLine).not.toHaveBeenCalled();
  });

  it("still omits the cliffhanger line even when the breakdown item has no cliffhanger_line at all", async () => {
    mockGetActiveBreakdown.mockReturnValue([
      diaperEpisodeBreakdownItem({ cliffhanger_line: undefined }),
    ]);
    const episodeRow = baseEpisodeRow({ motionPromptPack: null, episodeNumber: 1 });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ locale: "th" }]));
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    expect(callArgs.episodePlanContext).not.toContain("จุดค้าง");
    expect(callArgs.episodePlanContext).toContain("กางเกงผ้าอ้อมทำงานยังไงถึงต้องมี");
  });
});
