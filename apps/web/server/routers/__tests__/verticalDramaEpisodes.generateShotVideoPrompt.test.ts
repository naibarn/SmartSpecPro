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

const { mockGetModelsByTypeAsync, mockResolveVerticalDramaCapabilities } =
  vi.hoisted(() => ({
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
  mediaGenerationService: {
    generateImageAsync: vi.fn(),
    generateVideoAsync: vi.fn(),
  },
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo3/generate-veo-3-video-lite",
  },
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
  mediaGenerationLimiter: {
    isAllowed: vi.fn(() => true),
    getResetTime: vi.fn(() => 0),
  },
}));

// `mockGetPrimaryPortraitUrl` hoisted (rather than an inline `vi.fn()`) so
// the multi-character reference images tests below can configure/assert on
// it directly, same convention `verticalDramaEpisodes
// .generateAndPersistSplitShotVideoPrompt.test.ts` already uses for
// `getPrimaryPortraitAssetId`.
const { mockGetPrimaryPortraitUrl } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
  },
}));

// Location visual bible, Phase E (planning/polished-toasting-gadget.md) —
// `generateShotVideoPrompt`'s `locationReferenceImage` resolution
// (`resolveShotVideoPromptLocationReferenceImage`) calls this service's
// `getPrimaryReferenceUrl`, mocked here the same way as
// `verticalDramaCharacterStockService` above (its real implementation uses
// `.innerJoin(...)`, not implemented by this file's `selectChain` helper).
const { mockGetPrimaryReferenceUrl } = vi.hoisted(() => ({
  mockGetPrimaryReferenceUrl: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    getPrimaryReferenceUrl: mockGetPrimaryReferenceUrl,
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
    constructor(
      message: string,
      public issues: unknown
    ) {
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
      (
        prompt: string,
        identity?: { styleName?: string; lighting?: string }
      ) => {
        if (!identity?.styleName && !identity?.lighting) return prompt;
        const tokens = [
          identity.styleName ? `visual style: ${identity.styleName}` : null,
          identity.lighting ? `lighting: ${identity.lighting}` : null,
        ]
          .filter(Boolean)
          .join(", ");
        return `${prompt} Preset style tokens (${tokens}).`;
      }
    ),
    MockInsufficientCreditsError,
    MockVdSchemaValidationError,
    MockRateLimitExceededError,
  };
});
vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt:
    mockGenerateVerticalDramaShotVideoPrompt,
  // Judged best-of-2 quality loop (`planning/vd-video-prompt-model-family-
  // quality/plan.md` Phase 2) — the router now calls THIS export name
  // (`generateShotVideoPrompt`'s non-split path); aliased to the SAME mock
  // as the plain generator above so every pre-existing test in this file
  // (which configures `mockGenerateVerticalDramaShotVideoPrompt` and never
  // touches `promptQuality`) stays byte-identical — `result.promptQuality`
  // simply reads `undefined` for those tests, which is harmless (a plain
  // property read, never dereferenced).
  generateJudgedVerticalDramaShotVideoPrompt:
    mockGenerateVerticalDramaShotVideoPrompt,
  generateVerticalDramaClipDialogue: mockGenerateVerticalDramaClipDialogue,
  appendPresetVisualIdentityStyleTokensToMotionPrompt:
    mockAppendPresetVisualIdentityStyleTokensToMotionPrompt,
  buildCustomCharacterIdentityLockFragments: vi.fn(() => []),
  resolveScreenCallerCharacterNames: vi.fn((refs: string[] = []) => refs),
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
  extractCustomCharacterIdentityLockFragments: vi.fn(() => []),
}));

// Part B3 (planning/`polished-toasting-gadget.md`) — `generateShotVideoPrompt`
// now resolves the episode plan-context block via a dynamic `import()` of
// `verticalDramaStoryBible.ts`. Mocked directly (same "avoid the
// `adminProcedure` chain" reasoning as every other mock in this file above)
// with a safe empty-array default; tests exercising the plan-context
// injection itself override `mockGetActiveBreakdown`'s return value per-case.
//
// Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`) —
// `readItemShotDrafts` is dynamically imported from the SAME module
// (destructured alongside `getActiveBreakdown` in one `import()` call, not a
// separate one) to resolve `deepDraftShotForDialogue`; default `null` so
// every pre-existing test (which never opts into
// `verticalDramaSeriesDeepStoryDrafts`) never even calls this function
// (the router only calls it when that tenant flag is on).
const {
  mockGetActiveBreakdown,
  mockReadItemCliffhangerLine,
  mockReadItemShotDrafts,
} = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(() => []),
  mockReadItemCliffhangerLine: vi.fn(() => undefined),
  mockReadItemShotDrafts: vi.fn(() => null),
}));
vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
  readItemShotDrafts: mockReadItemShotDrafts,
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";
import { targetVerticalDramaSpeechSeconds } from "@shared/verticalDramaSeries/dialogueQuality";
import { ensurePromptWithinLimit } from "../../services/verticalDramaPromptQc";

const router = verticalDramaEpisodesRouter as unknown as Record<
  string,
  Function
>;
const mockEnsurePromptWithinLimit = vi.mocked(ensurePromptWithinLimit);

function ctx(
  overrides: Partial<{
    tenantId: string;
    user: { id: number };
    publicUrl: string;
  }> = {}
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
          // Storyboard characterIds remain a valid cast fallback for legacy
          // fixtures whose start-frame requiredCharacterRefs were not yet
          // backfilled.
          characterIds: ["hero", "grandmother", "หนูนา", "villain"],
          continuityNotes: [],
          durationSeconds: 6,
        },
      ],
    },
    dialogueAudioPlan: null,
    // Feature 135 (Hermes Grok media worker, remediation row 9) —
    // `resolveEpisodeVideoModel` now FAILS CLOSED (BAD_REQUEST) whenever
    // `motionPromptPack.selectedVideoModelId` is missing, so the default
    // fixture must carry a selection that resolves against this file's
    // default mocked catalog (`mockGetModelsByTypeAsync`'s "veo-3-1" row,
    // set in `beforeEach` below). `clips: []` is behaviorally identical to
    // the previous `motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] }` default for every other
    // consumer in this file (`shouldRegenerateDialogueForVideoPrompt` /
    // `hasDuplicateDialogueOnOtherClip` both treat `pack: null` and
    // `pack.clips: []` the same — `!pack?.clips?.length` is `true` either
    // way, and the final persist's `if (freshPack)` branch spreads whatever
    // fixture fields are here, so `durationProfileId`/`motionMode` below
    // are never asserted on by any test — only `.clips` is) — only
    // `resolveEpisodeVideoModel`'s selection check cares about this field.
    motionPromptPack: {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [],
      warnings: [],
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear queued Drizzle-chain implementations between cases. `clearAllMocks`
  // only clears call history; a test that intentionally fails before its
  // asset/roster queries are consumed would otherwise leak those
  // `mockReturnValueOnce` rows into the next case and make valid fixtures look
  // like missing episodes, frames, or character references.
  mockDb.select.mockReset();
  mockDb.update.mockReset();
  mockDb.insert.mockReset();
  mockDb.delete.mockReset();
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
  mockDb.transaction.mockImplementation(
    async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: (...args: unknown[]) => selectChain([]),
        update: (...args: unknown[]) => (mockDb.update as any)(...args),
      };
      return fn(tx);
    }
  );
  mockGetModelsByTypeAsync.mockResolvedValue([
    {
      id: "veo-3-1",
      type: "video",
      isEnabled: true,
      creditCost: 50,
      aliases: [],
      configJson: {},
    },
  ]);
  mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValue({
    prompt: "generated motion prompt",
    negativeMotionPrompt: "no glitching",
    dialogue: [{ lineTh: "สวัสดี", characterKey: "hero" }],
    creditsUsed: 3,
    model: "gpt-vision",
    usedVision: true,
    // Model-family-aware, vision-grounded video prompt quality upgrade
    // (`planning/vd-video-prompt-model-family-quality/plan.md`) — always
    // present on the real service return value; "veo-3-1" (this file's
    // default mocked model row) is a veo-family id.
    family: "veo",
    // Judged best-of-2 quality loop (Phase 2) — always present on the real
    // `generateJudgedVerticalDramaShotVideoPrompt` return value.
    promptQuality: {
      mode: "judged",
      candidates: 2,
      verdict: "accept",
      repaired: false,
    },
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
      .mockReturnValueOnce(
        selectChain([
          {
            id: 900,
            storageKey: "vertical-drama/tenant-1/900.png",
            originalUrl: "https://stale-provider.example/900.png",
          },
        ])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

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

    // Anti-lock-in fix (`planning/vd-video-prompt-skill-first/plan.md`
    // Phase 2a) — this shot has no resolved SOURCE dialogue (no
    // matchingClip.dialogue, no dialogueAudioPlan, no script) — the
    // service mock's own echoed `dialogue: [{ lineTh: "สวัสดี", ... }]` is
    // an LLM improvisation and must NOT be persisted/returned as
    // authoritative; the resolved source stays `[]`.
    expect(result).toEqual({
      prompt: "generated motion prompt",
      dialogue: [],
      creditsUsed: 3,
      usedVision: true,
      // Model-family-aware, vision-grounded video prompt quality upgrade
      // (`planning/vd-video-prompt-model-family-quality/plan.md`) — always
      // stamped onto the mutation return; see the dedicated
      // "promptModelTarget" describe block below for focused coverage.
      promptModelTarget: {
        family: "veo",
        modelId: "veo-3-1",
        generatedAt: expect.any(String),
      },
      // Judged best-of-2 quality loop (Phase 2) — the mutation return
      // includes the service's own `promptQuality` verbatim.
      promptQuality: {
        mode: "judged",
        candidates: 2,
        verdict: "accept",
        repaired: false,
      },
    });

    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        seriesId: 10,
        episodeId: 100,
        shotNumber: 1,
        imageUrl: "/api/storage/files/vertical-drama/tenant-1/900.png",
        imagePrompt: "a hero standing in the rain",
        shotContext: expect.objectContaining({
          description: "Hero stands in the rain, looking up",
          camera: "wide shot, low angle",
        }),
        selectedVideoModelId: "veo-3-1",
        locale: "th",
        // Fast path regression guard: the ordinary Generate action must not
        // silently fan out into two candidates + judge + optional repair.
        qualityLoop: false,
      })
    );

    expect(capturedSet.motionPromptPack.clips).toEqual([
      expect.objectContaining({
        clipNumber: 1,
        sourceShotNumbers: [1],
        startFrameAssetId: "900",
        prompt: "generated motion prompt",
        negativeMotionPrompt: "no glitching",
        dialogue: [],
        // Model-family-aware, vision-grounded video prompt quality upgrade
        // (`planning/vd-video-prompt-model-family-quality/plan.md`) — the
        // non-split persist site stamps this on every fresh clip.
        promptModelTarget: {
          family: "veo",
          modelId: "veo-3-1",
          generatedAt: expect.any(String),
        },
        // Judged best-of-2 quality loop (Phase 2) — persisted on the clip
        // too, next to `promptModelTarget`.
        promptQuality: {
          mode: "judged",
          candidates: 2,
          verdict: "accept",
          repaired: false,
        },
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
        {
          clipNumber: 1,
          sourceShotNumbers: [1],
          prompt: "old shot 1 prompt",
          durationSeconds: 6,
        },
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
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    // The row-lock read inside the transaction sees the FRESH, already
    // concurrently-updated pack — not the stale outer snapshot.
    mockDb.transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          select: () =>
            selectChain([{ motionPromptPack: freshPackFromConcurrentWrite }]),
          update: (...args: unknown[]) => (mockDb.update as any)(...args),
        };
        return fn(tx);
      }
    );

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    // Shot 3's concurrently-persisted clip must survive this write...
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({
        clipNumber: 3,
        prompt: "shot 3 prompt from a concurrent call",
      })
    );
    // ...alongside this call's own shot-1 update.
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({
        clipNumber: 1,
        prompt: "generated motion prompt",
      })
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
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockGenerateVerticalDramaShotVideoPrompt).not.toHaveBeenCalled();
  });

  it("generates a Dual View video prompt when canonical dialogue uses display names instead of roster keys", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    });
    mockGetActiveBreakdown.mockReturnValue([
      {
        episodeNumber: 1,
        workingTitle: "ตอนทดสอบ",
        logline: "สนทนาผ่านประตู",
        keyBeats: ["ทั้งสองตะโกนคุยกัน"],
      },
    ]);
    mockReadItemShotDrafts.mockReturnValue([
      {
        shot_number: 1,
        summary: "ไอริณอยู่ในห้อง กฤตอยู่ด้านนอก",
        dialogue_lines: [
          { speaker: "ไอริณ", line: "เปิดไม่ได้" },
          { speaker: "กฤต", line: "เปิดประตู" },
        ],
      },
    ]);

    const episodeRow = baseEpisodeRow({
      episodeNumber: 1,
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "ไอริณอยู่ในห้องเก็บของ",
            negativePrompt: "",
            requiredCharacterRefs: ["character"],
            productReferenceAssetIds: [],
            approvedMediaAssetId: "900",
            barrierMultiView: {
              enabled: true,
              scenario: "physical_barrier",
              barrierType: "closed_door",
              relation: "same_establishment_adjacent_spaces",
              startView: {
                side: "inside",
                characterRefs: ["character"],
                locationKey: "storage-room",
              },
              referenceView: {
                side: "outside",
                characterRefs: ["character-3"],
                locationKey: "cafe",
                referenceFrameAssetId: "901",
              },
              dialogueSideMap: {
                character: "inside",
                "character-3": "outside",
              },
              status: "ready",
            },
          },
        ],
      },
    });
    const rosterRows = [
      { id: 501, name: "ไอริณ", characterKey: "character" },
      { id: 502, name: "กฤต", characterKey: "character-3" },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/inside.png" }])
      )
      .mockReturnValueOnce(
        selectChain(rosterRows) // resolveShotCharacterIdentitySources
      )
      .mockReturnValueOnce(
        selectChain([{ id: 901, originalUrl: "https://cdn/outside.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th", bible: {} }]))
      .mockReturnValueOnce(selectChain(rosterRows))
      .mockReturnValueOnce(selectChain(rosterRows))
      .mockReturnValueOnce(selectChain(rosterRows));
    mockGetPrimaryPortraitUrl.mockImplementation(
      async (_owner: unknown, characterId: number) =>
        characterId === 501 ? "https://cdn/irin.png" : "https://cdn/krit.png"
    );
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await expect(
      router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      })
    ).resolves.toBeDefined();

    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        imageUrl: "https://cdn/inside.png",
        barrierReferenceImage: {
          url: "https://cdn/outside.png",
          name: "cafe",
        },
        characterReferenceImages: expect.arrayContaining([
          expect.objectContaining({ characterKey: "character" }),
          expect.objectContaining({ characterKey: "character-3" }),
        ]),
        shotContext: expect.objectContaining({
          dialogueLines: [
            expect.objectContaining({
              characterKey: "character",
              speakerName: "ไอริณ",
            }),
            expect.objectContaining({
              characterKey: "character-3",
              speakerName: "กฤต",
            }),
          ],
        }),
      })
    );
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
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

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
      (c: any) => c.clipNumber === 1
    );
    // Anti-lock-in fix (`planning/vd-video-prompt-skill-first/plan.md`
    // Phase 2a) — no resolved source dialogue for this shot, so the LLM
    // mock's own echoed `dialogue` is never persisted; see the "happy path"
    // test above for the full rationale.
    expect(newClip).toMatchObject({
      clipNumber: 1,
      sourceShotNumbers: [1],
      prompt: "generated motion prompt",
      dialogue: [],
    });
    // Untouched pre-existing clip stays exactly as-is.
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({ clipNumber: 2, prompt: "unrelated clip" })
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
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

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
      capturedSet.motionPromptPack.clips.find((c: any) => c.clipNumber === 302)
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
              lineTh:
                "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
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
      .mockReturnValueOnce(
        selectChain([{ id: 901, originalUrl: "https://cdn/901.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

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
              lineTh:
                "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
              characterKey: "grandmother",
            },
          ],
        }),
      })
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
        // Persist-pin (planning/`polished-toasting-gadget.md`) — the
        // PERSISTED dialogue is pinned back to the resolved source
        // (`dialogueLines`, asserted above as the `shotContext.dialogueLines`
        // sent to the LLM) rather than the LLM's own echoed
        // `dialogue: [{ lineTh: "บทใหม่ช็อตสอง", ... }]` from the mock above —
        // this is the exact class of drift the fix eliminates.
        dialogue: [
          {
            lineTh:
              "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
            characterKey: "grandmother",
          },
        ],
      }),
    ]);
  });

  // Dialogue-duplication fix (2026-07-15, ground truth from
  // logs/audit/audit-2026-07-15.jsonl) — `shotVideoPromptQc`'s
  // `ensurePromptWithinLimit` call used to protect the
  // `buildNativeDialogueVerbatimBlock` boilerplate block as a single
  // `protectedFragments` entry. Because the refiner already keeps dialogue
  // INLINE while compressing, that block was re-appended a SECOND time
  // whenever the prompt was over the length cap, duplicating every spoken
  // line. The fix protects each individual quoted line instead.
  describe("dialogue-duplication fix (2026-07-15) — protectedFragments is individual quoted lines, not the boilerplate block", () => {
    it("protects each resolved dialogue line as a bare quoted string, never the 'Native dialogue (verbatim)' block", async () => {
      const pack = {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 2,
            sourceShotNumbers: [2],
            prompt: "old shot 2 prompt",
            durationSeconds: 6,
            dialogue: [
              {
                lineTh:
                  "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
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
              characterIds: ["hero", "grandmother"],
              continuityNotes: [],
              durationSeconds: 6,
            },
          ],
        },
        motionPromptPack: pack,
      });

      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 901, originalUrl: "https://cdn/901.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 2 },
      });

      expect(mockEnsurePromptWithinLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "video",
          protectedFragments: [
            "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
          ],
        })
      );
      const videoQcCall = mockEnsurePromptWithinLimit.mock.calls.find(
        ([args]) => args.kind === "video"
      );
      expect(videoQcCall).toBeDefined();
      const fragments = videoQcCall?.[0].protectedFragments ?? [];
      expect(
        fragments.some((f: string) => f.includes("Native dialogue (verbatim)"))
      ).toBe(false);
    });

    it("non-native-audio model: protectedFragments is undefined (gate unchanged)", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: false,
        verticalDramaReady: true,
      });
      const pack = {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 2,
            sourceShotNumbers: [2],
            prompt: "old shot 2 prompt",
            durationSeconds: 6,
            dialogue: [
              {
                lineTh:
                  "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
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
              characterIds: ["hero", "grandmother"],
              continuityNotes: [],
              durationSeconds: 6,
            },
          ],
        },
        motionPromptPack: pack,
      });

      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 901, originalUrl: "https://cdn/901.png" }])
        )
        .mockReturnValueOnce(selectChain([{ locale: "th" }]))
        .mockReturnValueOnce(selectChain([]));

      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 2 },
      });

      expect(mockEnsurePromptWithinLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "video",
          protectedFragments: undefined,
        })
      );
    });
  });

  it("refreshes duplicated persisted dialogue before regenerating shot 2 video prompt", async () => {
    const duplicatedDialogue = [
      { lineTh: "ยายทวดจัน…วันนี้อย่าหลงนะ", characterKey: "หนูนา" },
      {
        lineTh: "เสียง…ชา…อืม…ใครมาฝากอีกแล้วหรือเปล่า",
        characterKey: "ยายทวดจัน",
      },
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
      .mockReturnValueOnce(
        selectChain([{ id: 901, originalUrl: "https://cdn/901.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 2,
        idempotencyKey: "shot2",
      },
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
      })
    );
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        shotNumber: 2,
        shotContext: expect.objectContaining({ dialogueLines: freshDialogue }),
      })
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

  // Superseded test (Feature 135 — Hermes Grok media worker, remediation row
  // 9, doc comment at `resolveEpisodeVideoModel`'s definition,
  // verticalDramaEpisodes.ts ~:2963-2977). ORIGINAL test (quoted from the
  // pre-repair file): named "creates a minimal pack when motionPromptPack is
  // entirely absent", fixture `baseEpisodeRow({ motionPromptPack: null })`,
  // and asserted the mutation SUCCEEDED, persisting
  // `capturedSet.motionPromptPack` as `{ selectedVideoModelId:
  // "veo3/generate-veo-3-video-lite", clips: [...] }` — i.e. it asserted
  // that an absent pack silently fell back to `DEFAULT_MODELS.video` and
  // materialized a fresh pack from that guess.
  //
  // Reading: that fallback branch is exactly what Feature 135 deliberately
  // REMOVED — `resolveEpisodeVideoModel` now throws `BAD_REQUEST` for any
  // empty/absent `pack?.selectedVideoModelId` before this mutation ever
  // reaches its persist step, and `DEFAULT_MODELS.video` is "never
  // consulted" (the function's own doc comment). This makes the OLD
  // assertion's premise false under current, intentional production
  // behavior — not a regression to chase, but the guard doing its job (a
  // model selection can no longer be silently invented on the user's
  // behalf). The old fixture also proves the `else` branch that used to
  // build that minimal pack (verticalDramaEpisodes.ts ~:14601-14626) is now
  // dead code: reaching it requires a falsy `freshPack`, but `freshPack =
  // freshRow?.motionPromptPack ?? pack` can only be falsy if the OUTER
  // `pack` was falsy too — and `resolveEpisodeVideoModel(pack)` already
  // throws before that point whenever `pack` is null/absent. Rewritten
  // below to verify the actual current contract instead: an entirely
  // absent pack fails closed, asking the user to pick a video model first,
  // and never persists anything.
  it("fails closed with BAD_REQUEST when motionPromptPack is entirely absent (no video model selected yet), and never persists", async () => {
    const episodeRow = baseEpisodeRow({ motionPromptPack: null });

    // `resolveEpisodeVideoModel` (the guard under test here) only runs AFTER
    // `loadOwnedEpisode` / `resolveMediaAssetUrlsByIds` / the locale lookup /
    // `loadSeriesKnownSpeakerKeys` — the same 4 pre-existing selects every
    // other test in this file queues (see e.g. the Wave-7D "does not append…
    // flags-off byte-identical" test's `toHaveBeenCalledTimes(4)` assertion)
    // — so all 4 must be provisioned even though this call throws right
    // after the 4th, before any 5th select would ever be issued.
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

    await expect(
      router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "กรุณาเลือกโมเดลวิดีโอก่อนสร้าง / Select a video model before generating.",
    });

    expect(mockGenerateVerticalDramaShotVideoPrompt).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("passes idempotencyKey through to the service call", async () => {
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
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
      expect.objectContaining({ idempotencyKey: "idem-key-123" })
    );
  });

  describe("nativeAudioEnabled (task #36 — optional NATIVE AUDIO DIRECTION prompt option)", () => {
    it("rollout gate is hardcoded off (F131AC pending) — the service call always receives nativeAudioEnabled: false, even when the client sends true", async () => {
      const pack = {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "old",
            durationSeconds: 6,
          },
        ],
        warnings: [],
      };
      const episodeRow = baseEpisodeRow({ motionPromptPack: pack });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
        .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
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

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ nativeAudioEnabled: false })
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
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "old",
            durationSeconds: 6,
          },
        ],
        warnings: [],
      };
      const episodeRow = baseEpisodeRow({ motionPromptPack: pack });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
        .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
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

      expect(result.audioDirection).toBe(
        "Rain taps the window; a door creaks shut."
      );
      expect(capturedSet.motionPromptPack.clips).toEqual([
        expect.objectContaining({
          clipNumber: 1,
          audioDirection: "Rain taps the window; a door creaks shut.",
        }),
      ]);
    });

    it("persists the raw nativeAudioEnabled preference onto a brand-new pack even though the rollout gate is off", async () => {
      const episodeRow = baseEpisodeRow({
        motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
        .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
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
        expect.objectContaining({ nativeAudioEnabled: false })
      );
    });
  });

  describe('instruction (planning/`polished-toasting-gadget.md` Fix B — "ให้ AI ปรับ" AI-adjust threading)', () => {
    it("instruction present: threaded into the service call as repairInstruction and reflected in the persisted prompt", async () => {
      mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValueOnce({
        prompt: "prompt reflecting the repair instruction",
        negativeMotionPrompt: "no glitching",
        dialogue: [],
        creditsUsed: 3,
        model: "gpt-vision",
        usedVision: true,
      });
      const episodeRow = baseEpisodeRow({
        motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([{ locale: "th" }]))
        .mockReturnValueOnce(selectChain([]));
      let capturedSet: any;
      mockDb.update.mockReturnValueOnce({
        set: vi.fn((v: any) => {
          capturedSet = v;
          return updateChain([episodeRow]);
        }),
      });

      const result = await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          instruction: "make the camera push in faster",
        },
      });

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          repairInstruction: "make the camera push in faster",
        })
      );
      expect(result.prompt).toBe("prompt reflecting the repair instruction");
      expect(capturedSet.motionPromptPack.clips[0].prompt).toBe(
        "prompt reflecting the repair instruction"
      );
    });

    it('instruction absent: the service call receives repairInstruction: undefined (byte-identical to pre-fix behavior — the "สร้างพรอมต์วิดีโอ (AI)" button never sends this field)', async () => {
      const episodeRow = baseEpisodeRow({
        motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([{ locale: "th" }]))
        .mockReturnValueOnce(selectChain([]));
      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ repairInstruction: undefined })
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
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    expect(callArgs.shotDurationSeconds).toBeUndefined();
    expect(callArgs.targetSpeechSeconds).toBeUndefined();
  });

  it("passes shotDurationSeconds + targetSpeechSeconds (via targetVerticalDramaSpeechSeconds) when the flag is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesSpeechBudget: true,
    });
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
    }); // storyboard shot 1 durationSeconds: 6
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    expect(callArgs.shotDurationSeconds).toBe(6);
    expect(callArgs.targetSpeechSeconds).toBeCloseTo(
      targetVerticalDramaSpeechSeconds(6),
      5
    );
  });

  it("maps dialogue via the shot's sourceBeatIndexes (source 3a) instead of the positional guess when the flag is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesSpeechBudget: true,
    });
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      script: {
        structure: {
          beats: [
            {
              beat: 1,
              dialogue_lines: [
                { speaker: "hero", line: "Positional decoy line" },
              ],
            },
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
        scene_dialogue_summary: [
          { scene: 1, dialogue_lines: ['hero: "legacy positional line"'] },
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
            sourceBeatIndexes: [1],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

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
        lineTh:
          "This beat-mapped dialogue line is long enough to clear the coverage floor",
      },
    ]);
  });

  it("still falls back to the positional guess (source 3b) when the flag is on but the shot has no sourceBeatIndexes", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesSpeechBudget: true,
    });
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      script: {
        scene_dialogue_summary: [
          { scene: 1, dialogue_lines: ['hero: "legacy positional line"'] },
        ],
      },
      // storyboard shot (from baseEpisodeRow) carries no sourceBeatIndexes.
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

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
      })
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
        imagePromptFragments: {
          positive: ["mecha plating"],
          negative: ["cartoonish"],
        },
        ...over,
      },
    };
  }

  it("appends the preset's style tokens onto the persisted first-pass prompt when the flag is on and the series carries a preset identity", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: true,
    });
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(
        selectChain([{ bible: presetVisualIdentityBible() }])
      ); // loadSeriesPresetVisualIdentity

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

    expect(
      mockAppendPresetVisualIdentityStyleTokensToMotionPrompt
    ).toHaveBeenCalledWith(
      "generated motion prompt",
      expect.objectContaining({
        styleName: "sci-fi mecha noir",
        lighting: "cold rim light with amber practicals",
      })
    );
    const expectedPrompt =
      "generated motion prompt Preset style tokens (visual style: sci-fi mecha noir, lighting: cold rim light with amber practicals).";
    expect(result.prompt).toBe(expectedPrompt);
    expect(capturedSet.motionPromptPack.clips[0]).toMatchObject({
      prompt: expectedPrompt,
    });
  });

  it("does not append and does not load preset identity when the flag is off (default — flags-off byte-identical)", async () => {
    // Explicit (not relying on an earlier test's `mockResolvedValue` default
    // — `vi.clearAllMocks()` clears call history but not a previously-set
    // default implementation, same footgun documented elsewhere in this
    // file's test suite).
    mockGetTenantFeatureFlags.mockResolvedValue({});
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    const result = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(
      mockAppendPresetVisualIdentityStyleTokensToMotionPrompt
    ).not.toHaveBeenCalled();
    expect(result.prompt).toBe("generated motion prompt");
    // Exactly the 4 pre-Wave-7D selects — no extra `loadSeriesPresetVisualIdentity` read.
    expect(mockDb.select).toHaveBeenCalledTimes(4);
  });

  it("does not append when the flag is on but the series carries no preset identity (legacy/non-preset series)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: true,
    });
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([{ bible: null }])); // no presetVisualIdentity stamped

    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    const result = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(
      mockAppendPresetVisualIdentityStyleTokensToMotionPrompt
    ).not.toHaveBeenCalled();
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
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
        .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({ retentionHooksEnabled: false })
      );
    });

    it("flag on: resolves verticalDramaRetentionHooks and threads retentionHooksEnabled/totalShotCount/hookText/retentionLoopDescription", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaRetentionHooks: true,
      } as any);
      const episodeRow = episodeRowWithScript();
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
        .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

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
        })
      );
    });

    it("omits hookText/retentionLoopDescription when the script has neither field yet (pre-retention-hooks artifact)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaRetentionHooks: true,
      } as any);
      const episodeRow = baseEpisodeRow({});
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
        .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          retentionHooksEnabled: true,
          hookText: undefined,
          retentionLoopDescription: undefined,
        })
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
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      episodeNumber: 1,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

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
    expect(episodePlanContext).toContain(
      "ฝ้ายกับใบข้าวทดสอบกางเกงผ้าอ้อมกันน้ำ"
    );
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
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      episodeNumber: 1,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const callArgs = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
    expect(callArgs.episodePlanContext).not.toContain("จุดค้าง");
    expect(callArgs.episodePlanContext).toContain(
      "กางเกงผ้าอ้อมทำงานยังไงถึงต้องมี"
    );
  });
});

/**
 * Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`,
 * added 2026-07-11) — `resolveShotDialogueLines`'s new source 0
 * (`deepDraftShotForDialogue`, gated by `verticalDramaSeriesDeepStoryDrafts`)
 * wired end-to-end through this mutation: the canonical Overview-page
 * dialogue must reach the LLM's `shotContext.dialogueLines`, must bypass the
 * `shouldRegenerateDialogueForVideoPrompt` auto-regen heuristic entirely, and
 * must be what's PERSISTED/RETURNED (persist-pin) rather than whatever the
 * LLM's own `dialogue[]` output field echoes back.
 */
describe("generateShotVideoPrompt — dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`)", () => {
  function canonicalEpisodeBreakdownItem(over: Record<string, unknown> = {}) {
    return {
      episodeNumber: 1,
      workingTitle: "ตอนทดสอบ",
      logline: "โลจไลน์ทดสอบ",
      keyBeats: ["บีตหนึ่ง"],
      ...over,
    };
  }

  it("canonical Overview-page dialogue wins over a stale/wrong matchingClip.dialogue value, skips the auto-regen LLM call, and the final PERSISTED+RETURNED dialogue is pinned to the canonical source rather than the video-prompt LLM's own echoed dialogue field (regression test for the actual production bug)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    });
    mockGetActiveBreakdown.mockReturnValue([canonicalEpisodeBreakdownItem()]);
    mockReadItemShotDrafts.mockReturnValue([
      {
        shot_number: 1,
        summary: "shot summary",
        dialogue_lines: [{ speaker: "หนูนา", line: "TESTMARK123" }],
      },
    ]);
    mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValueOnce({
      prompt: "generated motion prompt",
      negativeMotionPrompt: "no glitching",
      // The LLM's own echoed dialogue field deliberately diverges from the
      // canonical source fed into it — must never win.
      dialogue: [
        {
          lineTh: "บทที่ LLM แต่งขึ้นเอง ไม่ตรงกับต้นทาง",
          characterKey: "หนูนา",
        },
      ],
      creditsUsed: 3,
      model: "gpt-vision",
      usedVision: true,
    });

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
          // Stale/wrong persisted value from a previous round — must never
          // win once a canonical source exists (this is the actual bug).
          dialogue: [
            { lineTh: "ค่าที่ค้างผิดจากรอบก่อนหน้า", characterKey: "หนูนา" },
          ],
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({
      motionPromptPack: pack,
      episodeNumber: 1,
    });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale/bible lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys

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

    // Canonical dialogue reached the LLM — not the stale matchingClip value.
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        shotContext: expect.objectContaining({
          dialogueLines: [{ characterKey: "หนูนา", lineTh: "TESTMARK123" }],
        }),
      })
    );
    // The auto-regen heuristic never fires for a canonically-resolved shot.
    expect(mockGenerateVerticalDramaClipDialogue).not.toHaveBeenCalled();
    // Persisted AND returned dialogue is pinned to the canonical source.
    expect(result.dialogue).toEqual([
      { characterKey: "หนูนา", lineTh: "TESTMARK123" },
    ]);
    expect(capturedSet.motionPromptPack.clips[0].dialogue).toEqual([
      { characterKey: "หนูนา", lineTh: "TESTMARK123" },
    ]);
  });

  it("flag off: byte-identical to before — deep-drafted canonical dialogue is never even read (readItemShotDrafts not called), matchingClip.dialogue still wins as source 1", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({}); // verticalDramaSeriesDeepStoryDrafts absent -> off
    mockGetActiveBreakdown.mockReturnValue([canonicalEpisodeBreakdownItem()]);
    mockReadItemShotDrafts.mockReturnValue([
      {
        shot_number: 1,
        summary: "shot summary",
        dialogue_lines: [{ speaker: "หนูนา", line: "TESTMARK123" }],
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
          prompt: "old placeholder prompt",
          durationSeconds: 6,
          // Deliberately long enough to clear the PRE-EXISTING, unrelated
          // `shouldRegenerateDialogueForVideoPrompt` VD_DIALOGUE_UNDERFILLED
          // safety net for a 6s clip (same technique as the story-density
          // reform describe block above) — this test is about the flag gate,
          // not that unrelated heuristic.
          dialogue: [
            {
              lineTh:
                "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
              characterKey: "หนูนา",
            },
          ],
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({
      motionPromptPack: pack,
      episodeNumber: 1,
    });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockReadItemShotDrafts).not.toHaveBeenCalled();
    expect(mockGenerateVerticalDramaClipDialogue).not.toHaveBeenCalled();
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        shotContext: expect.objectContaining({
          dialogueLines: [
            {
              lineTh:
                "ยายทวดจันมองตู้กระจกแล้วพูดเบา ๆ ว่าของในนั้นไม่ควรถูกแตะอีก",
              characterKey: "หนูนา",
            },
          ],
        }),
      })
    );
  });

  it("reflects a dialogue edit made at the Overview page between two consecutive generate calls, with no manual sync step in between", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    });
    mockGetActiveBreakdown.mockReturnValue([canonicalEpisodeBreakdownItem()]);

    const pack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [] as unknown[],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({
      motionPromptPack: pack,
      episodeNumber: 1,
    });

    // --- First call: Overview page currently has "TESTMARK123". ---
    mockReadItemShotDrafts.mockReturnValueOnce([
      {
        shot_number: 1,
        summary: "s",
        dialogue_lines: [{ speaker: "หนูนา", line: "TESTMARK123" }],
      },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    const firstResult = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });
    expect(firstResult.dialogue).toEqual([
      { characterKey: "หนูนา", lineTh: "TESTMARK123" },
    ]);

    // --- User edits the Overview page to "TESTMARK456", then immediately
    // generates again — the very next call must reflect the edit without
    // any explicit "sync" step. ---
    mockReadItemShotDrafts.mockReturnValueOnce([
      {
        shot_number: 1,
        summary: "s",
        dialogue_lines: [{ speaker: "หนูนา", line: "TESTMARK456" }],
      },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    const secondResult = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });
    expect(secondResult.dialogue).toEqual([
      { characterKey: "หนูนา", lineTh: "TESTMARK456" },
    ]);
  });

  describe("characterReferenceImages (multi-character disambiguation fix, polished-toasting-gadget.md)", () => {
    function twoCharacterEpisodeRow(over: Record<string, unknown> = {}) {
      return baseEpisodeRow({
        startFramePlan: {
          mode: "single_frame_per_shot",
          selectedImageModelId: "google-nano-banana-pro",
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a hero standing in the rain",
              negativePrompt: "",
              requiredCharacterRefs: ["hero", "grandmother"],
              productReferenceAssetIds: [],
              approvedMediaAssetId: "900",
              castPositionLock: {
                assetId: "900",
                orderedCharacterRefs: ["hero", "grandmother"],
                confirmedAt: "2026-08-18T00:00:00.000Z",
              },
            },
          ],
        },
        ...over,
      });
    }

    it("resolves each required character's portrait, in requiredCharacterRefs order, and threads them into the service call", async () => {
      const episodeRow = twoCharacterEpisodeRow();
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([])) // resolveShotCharacterIdentitySources
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(
          selectChain([
            { id: 501, name: "Hero", characterKey: "hero" },
            { id: 502, name: "Grandmother", characterKey: "grandmother" },
          ])
        ); // resolveShotVideoPromptCharacterReferenceImages's characterRows query

      const portraitUrlByCharacterId: Record<number, string> = {
        501: "https://cdn/hero-portrait.png",
        502: "https://cdn/grandma-portrait.png",
      };
      mockGetPrimaryPortraitUrl.mockImplementation(
        async (_owner: unknown, characterId: number) =>
          portraitUrlByCharacterId[characterId] ?? null
      );

      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          characterReferenceImages: [
            {
              characterKey: "hero",
              name: "Hero",
              url: "https://cdn/hero-portrait.png",
            },
            {
              characterKey: "grandmother",
              name: "Grandmother",
              url: "https://cdn/grandma-portrait.png",
            },
          ],
        })
      );
    });

    it("caps at VERTICAL_DRAMA_SHOT_VIDEO_PROMPT_MAX_CHARACTER_REFS (3) even when more required characters have approved portraits", async () => {
      const episodeRow = baseEpisodeRow({
        startFramePlan: {
          mode: "single_frame_per_shot",
          selectedImageModelId: "google-nano-banana-pro",
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "four characters in one shot",
              negativePrompt: "",
              requiredCharacterRefs: ["a", "b", "c", "d"],
              productReferenceAssetIds: [],
              approvedMediaAssetId: "900",
              castPositionLock: {
                assetId: "900",
                orderedCharacterRefs: ["a", "b", "c", "d"],
                confirmedAt: "2026-08-18T00:00:00.000Z",
              },
            },
          ],
        },
      });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([])) // resolveShotCharacterIdentitySources
        .mockReturnValueOnce(selectChain([{ locale: "th" }]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(
          selectChain([
            { id: 1, name: "A", characterKey: "a" },
            { id: 2, name: "B", characterKey: "b" },
            { id: 3, name: "C", characterKey: "c" },
            { id: 4, name: "D", characterKey: "d" },
          ])
        );

      const portraitUrlByCharacterId: Record<number, string> = {
        1: "https://cdn/a.png",
        2: "https://cdn/b.png",
        3: "https://cdn/c.png",
        4: "https://cdn/d.png",
      };
      mockGetPrimaryPortraitUrl.mockImplementation(
        async (_owner: unknown, characterId: number) =>
          portraitUrlByCharacterId[characterId] ?? null
      );

      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      const call = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
      expect(call.characterReferenceImages).toHaveLength(3);
      expect(
        call.characterReferenceImages.map((c: any) => c.characterKey)
      ).toEqual(["a", "b", "c"]);
    });

    it("silently omits a required character with no approved portrait yet, without throwing", async () => {
      const episodeRow = twoCharacterEpisodeRow();
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([])) // resolveShotCharacterIdentitySources
        .mockReturnValueOnce(selectChain([{ locale: "th" }]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(
          selectChain([
            { id: 501, name: "Hero", characterKey: "hero" },
            { id: 502, name: "Grandmother", characterKey: "grandmother" },
          ])
        );

      mockGetPrimaryPortraitUrl.mockImplementation(
        async (_owner: unknown, characterId: number) =>
          characterId === 501 ? "https://cdn/hero-portrait.png" : null
      );

      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await expect(
        router.generateShotVideoPrompt({
          ctx: ctx(),
          input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
        })
      ).resolves.toBeDefined();

      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          characterReferenceImages: [
            {
              characterKey: "hero",
              name: "Hero",
              url: "https://cdn/hero-portrait.png",
            },
          ],
        })
      );
    });

    it("resolves a relative portrait URL to an absolute one via resolveReferenceUrl(ctx.publicUrl)", async () => {
      const episodeRow = twoCharacterEpisodeRow();
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow]))
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([])) // resolveShotCharacterIdentitySources
        .mockReturnValueOnce(selectChain([{ locale: "th" }]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(
          selectChain([
            { id: 501, name: "Hero", characterKey: "hero" },
            { id: 502, name: "Grandmother", characterKey: "grandmother" },
          ])
        );

      mockGetPrimaryPortraitUrl.mockImplementation(
        async (_owner: unknown, characterId: number) =>
          characterId === 501
            ? "/uploads/hero-portrait.png"
            : "/uploads/grandma-portrait.png"
      );

      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx({ publicUrl: "https://smartaihub.app" }),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      const call = mockGenerateVerticalDramaShotVideoPrompt.mock.calls[0][0];
      expect(call.characterReferenceImages[0].url).toBe(
        "https://smartaihub.app/uploads/hero-portrait.png"
      );
      expect(call.characterReferenceImages[1].url).toBe(
        "https://smartaihub.app/uploads/grandma-portrait.png"
      );
    });

    it("solo-shot identity grounding: resolves the character portrait so the skill can compare it with the start frame", async () => {
      const episodeRow = baseEpisodeRow({
        startFramePlan: {
          mode: "single_frame_per_shot",
          selectedImageModelId: "google-nano-banana-pro",
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a hero standing in the rain",
              negativePrompt: "",
              requiredCharacterRefs: ["hero"],
              productReferenceAssetIds: [],
              approvedMediaAssetId: "900",
            },
          ],
        },
      });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([])) // resolveShotCharacterIdentitySources
        .mockReturnValueOnce(
          selectChain([{ id: 501, name: "Hero", characterKey: "hero" }])
        ); // portrait resolver

      mockGetPrimaryPortraitUrl.mockResolvedValue("/uploads/hero-portrait.png");

      mockDb.update.mockReturnValueOnce({
        set: vi.fn(() => updateChain([episodeRow])),
      });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockDb.select).toHaveBeenCalledTimes(6);
      expect(mockGetPrimaryPortraitUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: "tenant-1",
          userId: 42,
          seriesId: 10,
        }),
        501
      );
      expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          characterReferenceImages: [
            {
              characterKey: "hero",
              name: "Hero",
              url: "/uploads/hero-portrait.png",
            },
          ],
        })
      );
    });
  });
});

/**
 * Synopsis grounding + silence signal + anti-lock-in persistence fix
 * (`planning/vd-video-prompt-skill-first/plan.md` Phases 1a/2) — the router
 * threads the deep-drafted shot's `summary`/`silence_intent` into
 * `shotContext.canonicalShotSummary`/`beatIsSilent`, and the persist-pin
 * step never lets an LLM-invented line become authoritative when the
 * resolved source dialogue is empty (including the explicit silent-beat
 * case).
 */
describe("generateShotVideoPrompt — canonicalShotSummary / beatIsSilent + anti-lock-in persistence (planning/vd-video-prompt-skill-first/plan.md)", () => {
  function canonicalEpisodeBreakdownItem(over: Record<string, unknown> = {}) {
    return {
      episodeNumber: 1,
      workingTitle: "ตอนทดสอบ",
      logline: "โลจไลน์ทดสอบ",
      keyBeats: ["บีตหนึ่ง"],
      ...over,
    };
  }

  it("threads the deep-drafted shot summary into shotContext.canonicalShotSummary when the deep-story-drafts flag is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    });
    mockGetActiveBreakdown.mockReturnValue([canonicalEpisodeBreakdownItem()]);
    mockReadItemShotDrafts.mockReturnValue([
      {
        shot_number: 1,
        summary: "The character silently reads a text message on their phone.",
        dialogue_lines: [{ speaker: "หนูนา", line: "TESTMARK123" }],
      },
    ]);
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      episodeNumber: 1,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        shotContext: expect.objectContaining({
          canonicalShotSummary:
            "The character silently reads a text message on their phone.",
          beatIsSilent: false,
        }),
      })
    );
  });

  it("byte-identical: canonicalShotSummary is undefined and beatIsSilent is false when the deep-story-drafts flag is off (default)", async () => {
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        shotContext: expect.objectContaining({
          canonicalShotSummary: undefined,
          beatIsSilent: false,
        }),
      })
    );
  });

  it("silent beat (silence_intent set): threads beatIsSilent: true, and the LLM's own invented dialogue is NEVER persisted or returned — the anti-lock-in fix for the 'silent beat becomes speaking, permanently' bug", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesDeepStoryDrafts: true,
    });
    mockGetActiveBreakdown.mockReturnValue([canonicalEpisodeBreakdownItem()]);
    mockReadItemShotDrafts.mockReturnValue([
      {
        shot_number: 1,
        summary: "The character silently reads a text message on their phone.",
        dialogue_lines: [],
        silence_intent: "action_visual",
      },
    ]);
    // The video-prompt LLM disobeys the SILENT BEAT instruction and invents
    // a spoken line anyway — this must never become durable ground truth.
    mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValueOnce({
      prompt: "The character looks at their phone, expression unreadable.",
      negativeMotionPrompt: "no glitching",
      dialogue: [
        {
          lineTh: "บทที่ LLM แต่งขึ้นเองทั้งที่ควรเงียบ",
          characterKey: "หนูนา",
        },
      ],
      creditsUsed: 3,
      model: "gpt-vision",
      usedVision: true,
    });
    const episodeRow = baseEpisodeRow({
      motionPromptPack: { selectedVideoModelId: "veo-3-1", clips: [] },
      episodeNumber: 1,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain([]));
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

    // beatIsSilent + the (empty) resolved dialogueLines both reached the
    // service call.
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        shotContext: expect.objectContaining({
          canonicalShotSummary:
            "The character silently reads a text message on their phone.",
          beatIsSilent: true,
          dialogueLines: undefined,
        }),
      })
    );
    // The persist-pin anti-lock-in fix: the LLM's invented line never
    // becomes persisted/returned authoritative dialogue.
    expect(result.dialogue).toEqual([]);
    expect(capturedSet.motionPromptPack.clips[0].dialogue).toEqual([]);

    // A SECOND call (source stays silent) must independently resolve to the
    // same empty dialogue — never pinned to the first call's invented line
    // via `matchingClip.dialogue` (proves the lock-in bug stays fixed).
    const freshPack = capturedSet.motionPromptPack;
    const secondEpisodeRow = baseEpisodeRow({
      motionPromptPack: freshPack,
      episodeNumber: 1,
    });
    mockGenerateVerticalDramaShotVideoPrompt.mockResolvedValueOnce({
      prompt:
        "The character looks at their phone again, expression unreadable.",
      negativeMotionPrompt: "no glitching",
      dialogue: [],
      creditsUsed: 3,
      model: "gpt-vision",
      usedVision: true,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([secondEpisodeRow]))
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      )
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([secondEpisodeRow])),
    });

    const secondResult = await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });
    expect(secondResult.dialogue).toEqual([]);
    // Source 1 (`matchingClip.dialogue`) never saw the first call's
    // invented line, so this second call's own resolved `dialogueLines`
    // (source 0, still silent) stays empty too.
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenLastCalledWith(
      expect.objectContaining({
        shotContext: expect.objectContaining({
          beatIsSilent: true,
          dialogueLines: undefined,
        }),
      })
    );
  });
});

describe("generateShotVideoPrompt — locationReferenceImage (Phase E, planning/polished-toasting-gadget.md)", () => {
  function episodeRowWithLocationOverride(over: Record<string, unknown> = {}) {
    return baseEpisodeRow({
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
            locationKey: "loc_store",
          },
        ],
      },
      ...over,
    });
  }

  it("byte-identical-when-absent: no override and no storyboard distinct_locations group -> locationReferenceImage undefined, getPrimaryReferenceUrl never called", async () => {
    const episodeRow = baseEpisodeRow(); // default fixture: no locationKey on the frame, storyboard has no distinct_locations
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesKnownSpeakerKeys
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).not.toHaveBeenCalled();
    // Exactly the pre-Phase-E 4 selects — the location resolution never
    // touches the database when the shot has no override and no matching
    // storyboard group.
    expect(mockDb.select).toHaveBeenCalledTimes(4);
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ locationReferenceImage: undefined })
    );
  });

  it("resolves the shot's per-shot location override to a reference image and threads it into the service call", async () => {
    const episodeRow = episodeRowWithLocationOverride();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(
        selectChain([{ id: 55, name: "ร้านสะดวกซื้อ", data: {} }])
      ); // resolveLocationRosterRowByKey (override key)
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce(
      "/uploads/store-plate.png"
    );
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx({ publicUrl: "https://smartaihub.app" }),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      55
    );
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        locationReferenceImage: {
          url: "https://smartaihub.app/uploads/store-plate.png",
          name: "ร้านสะดวกซื้อ",
        },
      })
    );
  });

  it("falls back to the storyboard's distinct_locations grouping when the shot has no override", async () => {
    const episodeRow = baseEpisodeRow({
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
        distinct_locations: [
          {
            location_key: "loc_store",
            location_name: "ร้านสะดวกซื้อ",
            shot_numbers: [1],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(
        selectChain([{ id: 55, name: "ร้านสะดวกซื้อ", data: {} }])
      ); // resolveLocationRosterRowByKey (storyboard-matched key)
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce(
      "https://cdn.example.com/store-plate.png"
    );
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        locationReferenceImage: {
          url: "https://cdn.example.com/store-plate.png",
          name: "ร้านสะดวกซื้อ",
        },
      })
    );
  });

  it("omits locationReferenceImage gracefully (never throws) when the override key has no matching roster row yet", async () => {
    const episodeRow = episodeRowWithLocationOverride({
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
            locationKey: "loc_ghost",
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([])); // resolveLocationRosterRowByKey — no row for loc_ghost
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).not.toHaveBeenCalled();
    expect(mockGenerateVerticalDramaShotVideoPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ locationReferenceImage: undefined })
    );
  });
});
