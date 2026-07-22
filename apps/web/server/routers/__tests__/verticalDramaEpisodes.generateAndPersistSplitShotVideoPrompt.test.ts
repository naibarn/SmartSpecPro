/**
 * Vertical Drama — speaker-switch consolidated clip
 * (`generateAndPersistSplitShotVideoPrompt`, 2026-07-11 redesign) unit
 * coverage. Exercises `generateShotVideoPrompt`'s split branch (reached when
 * `computeSpeakerSwitchSubShotPlan` deterministically decides a shot's
 * dialogue needs cutting between 2+ speakers) and asserts the shot collapses
 * to EXACTLY ONE persisted clip — `clipNumber === shotNumber`, no
 * `parentShotNumber`/`subShotNumber`, correct `startFrameAssetId`/
 * `extraReferenceAssetIds` ordering — including the regression scenario
 * where a PRE-EXISTING legacy (pre-redesign) N-clip split for the same shot
 * is fully removed by the write.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaEpisodes.generateShotVideoPrompt.test.ts`.
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

// `mockGetPrimaryPortraitUrl` hoisted (rather than an inline `vi.fn()`) so
// the multi-character reference images tests below can configure/assert on
// it directly (multi-character disambiguation fix,
// `polished-toasting-gadget.md`) — same convention this file already uses
// for `getPrimaryPortraitAssetId`.
const { mockGetPrimaryPortraitAssetId, mockGetPrimaryPortraitUrl } = vi.hoisted(() => ({
  mockGetPrimaryPortraitAssetId: vi.fn(),
  mockGetPrimaryPortraitUrl: vi.fn(),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
    getPrimaryPortraitAssetId: mockGetPrimaryPortraitAssetId,
  },
}));

// Location visual bible, Phase E (planning/polished-toasting-gadget.md) —
// the split path's `locationReferenceImage` resolution
// (`resolveShotVideoPromptLocationReferenceImage`, resolved ONCE in
// `generateShotVideoPrompt` before branching into split/non-split) calls
// this service's `getPrimaryReferenceUrl`, mocked here the same way as
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

const {
  mockGenerateVerticalDramaShotVideoPrompt,
  mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch,
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
    mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch: vi.fn(),
    mockGenerateVerticalDramaClipDialogue: vi.fn(),
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
  generateVerticalDramaShotVideoPromptSpeakerSwitch:
    mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch,
  // Judged best-of-2 quality loop (`planning/vd-video-prompt-model-family-
  // quality/plan.md` Phase 2) — the router now calls these export names;
  // aliased to the SAME mocks as the plain generators above so every
  // pre-existing test in this file stays byte-identical (see the identical
  // doc comment in the sibling `generateShotVideoPrompt.test.ts` for the
  // full rationale).
  generateJudgedVerticalDramaShotVideoPrompt: mockGenerateVerticalDramaShotVideoPrompt,
  generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch:
    mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch,
  generateVerticalDramaClipDialogue: mockGenerateVerticalDramaClipDialogue,
  appendPresetVisualIdentityStyleTokensToMotionPrompt:
    mockAppendPresetVisualIdentityStyleTokensToMotionPrompt,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
  RateLimitExceededError: MockRateLimitExceededError,
}));

vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));

// Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`) —
// `readItemShotDrafts` is dynamically imported from the SAME module
// (destructured alongside `getActiveBreakdown`) to resolve
// `deepDraftShotForDialogue`; default `null` so every pre-existing test here
// (which never opts into `verticalDramaSeriesDeepStoryDrafts`) never calls
// it.
const { mockGetActiveBreakdown, mockReadItemCliffhangerLine, mockReadItemShotDrafts } =
  vi.hoisted(() => ({
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
import { ensurePromptWithinLimit } from "../../services/verticalDramaPromptQc";

const router = verticalDramaEpisodesRouter as unknown as Record<string, Function>;
const mockEnsurePromptWithinLimit = vi.mocked(ensurePromptWithinLimit);

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
          imagePrompt: "two characters argue in a kitchen",
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
          description: "Two characters argue in a kitchen",
          cameraSetup: "medium two-shot",
          characterIds: ["hero", "villain"],
          continuityNotes: [],
          durationSeconds: 6,
        },
      ],
    },
    dialogueAudioPlan: {
      dialogue_lines: [
        {
          shot_number: 1,
          speaker_character_id: "hero",
          dialogue_line: "Why didn't you tell me the truth?",
        },
        {
          shot_number: 1,
          speaker_character_id: "villain",
          dialogue_line: "I was protecting you the whole time.",
        },
      ],
    },
    // Feature 135 (Hermes Grok media worker, remediation row 9) —
    // `resolveEpisodeVideoModel` now FAILS CLOSED (BAD_REQUEST) whenever
    // `motionPromptPack.selectedVideoModelId` is missing, so the default
    // fixture must carry a selection that resolves against this file's
    // default mocked catalog (`mockGetModelsByTypeAsync`'s "veo-3-1" row,
    // set in `beforeEach` below). `clips: []` is behaviorally identical to
    // the previous `motionPromptPack: null` default for every other
    // consumer in this file (`shouldRegenerateDialogueForVideoPrompt` /
    // `hasDuplicateDialogueOnOtherClip` both treat `pack: null` and
    // `pack.clips: []` the same — `!pack?.clips?.length` is `true` either
    // way) — only `resolveEpisodeVideoModel`'s selection check cares about
    // this field, so this change is additive/non-behavioral for every test
    // that doesn't override `motionPromptPack` itself.
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
  // Default: transaction re-reads resolve to an empty row, so the merge
  // falls back to the outer `pack` snapshot already captured by
  // `loadOwnedEpisode` — same default convention as
  // `verticalDramaEpisodes.generateShotVideoPrompt.test.ts`.
  mockDb.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
    const tx = {
      select: (..._args: unknown[]) => selectChain([]),
      update: (...args: unknown[]) => (mockDb.update as any)(...args),
    };
    return fn(tx);
  });
  mockGetModelsByTypeAsync.mockResolvedValue([
    { id: "veo-3-1", type: "video", isEnabled: true, creditCost: 50, aliases: [], configJson: {} },
  ]);
  // The speaker-switch flag — gates BOTH `resolveSubShotPolicy` (the split
  // decision) and (harmlessly, since these tests never set
  // `verticalDramaSeriesPresetMixV2`) `resolveVerticalDramaQualityLoopFlags`.
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesSubShots: true });
  mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch.mockResolvedValue({
    prompt: "A continuous kitchen argument, cutting between the hero and the villain.",
    negativeMotionPrompt: "identity drift, warping",
    dialogue: [
      { characterKey: "hero", lineTh: "Why didn't you tell me the truth?" },
      { characterKey: "villain", lineTh: "I was protecting you the whole time." },
    ],
    durationSeconds: 5,
    distinctSpeakerCharacterKeys: ["hero", "villain"],
    creditsUsed: 4,
    model: "gpt-vision",
    usedVision: true,
    // Model-family-aware, vision-grounded video prompt quality upgrade
    // (`planning/vd-video-prompt-model-family-quality/plan.md`) — always
    // present on the real service return value; "veo-3-1" (this file's
    // default mocked model row) is a veo-family id.
    family: "veo",
    // Judged best-of-2 quality loop (Phase 2) — always present on the real
    // `generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch` return value.
    promptQuality: { mode: "judged", candidates: 2, verdict: "accept", repaired: false },
  });
  mockGetPrimaryPortraitAssetId.mockImplementation(
    async (_owner: unknown, characterId: number) => {
      if (characterId === 501) return 9001;
      if (characterId === 502) return 9002;
      return undefined;
    },
  );
});

describe("generateShotVideoPrompt -> generateAndPersistSplitShotVideoPrompt (speaker-switch consolidated clip, 2026-07-11 redesign)", () => {
  it("collapses 2+ distinct alternating speakers into EXACTLY ONE persisted clip (clipNumber === shotNumber, no parentShotNumber/subShotNumber), with correct startFrameAssetId/extraReferenceAssetIds ordering, removing a PRE-EXISTING legacy N-clip split for the same shot", async () => {
    // Regression fixture: shot 1 already has a stale, pre-2026-07-11 2-clip
    // speaker-switch split persisted from an earlier run, plus an unrelated
    // shot 5 clip that must survive untouched.
    const legacyPack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        {
          clipNumber: 101,
          sourceShotNumbers: [1],
          parentShotNumber: 1,
          subShotNumber: 1,
          prompt: "legacy sub-shot 1 prompt",
          durationSeconds: 5,
          startFrameAssetId: "8001",
        },
        {
          clipNumber: 102,
          sourceShotNumbers: [1],
          parentShotNumber: 1,
          subShotNumber: 2,
          prompt: "legacy sub-shot 2 prompt",
          durationSeconds: 3,
          startFrameAssetId: "8002",
        },
        {
          clipNumber: 5,
          sourceShotNumbers: [5],
          prompt: "unrelated shot 5 clip",
          durationSeconds: 6,
        },
      ],
      warnings: [],
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: legacyPack });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([])) // resolveShotVideoPromptCharacterReferenceImages's characterRows query (multi-character disambiguation fix, polished-toasting-gadget.md — no portraits configured in this test, resolves to [])
      .mockReturnValueOnce(
        selectChain([
          { id: 501, characterKey: "hero" },
          { id: 502, characterKey: "villain" },
        ]),
      ); // verticalDramaCharacters portrait lookup (anchor speaker first)

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

    // The speaker-switch generator was invoked with the deterministically
    // computed 2-window plan (hero anchor, villain second window).
    expect(mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch).toHaveBeenCalledWith(
      expect.objectContaining({
        shotNumber: 1,
        subShotWindows: expect.arrayContaining([
          expect.objectContaining({ subShotNumber: 1, characterKey: "hero" }),
          expect.objectContaining({ subShotNumber: 2, characterKey: "villain" }),
        ]),
      }),
    );

    // Return shape drops `subShots[]` entirely — same shape as a normal
    // single-shot generation.
    expect(result).not.toHaveProperty("subShots");
    expect(result).toEqual({
      prompt: "A continuous kitchen argument, cutting between the hero and the villain.",
      dialogue: [
        { characterKey: "hero", lineTh: "Why didn't you tell me the truth?" },
        { characterKey: "villain", lineTh: "I was protecting you the whole time." },
      ],
      creditsUsed: 4,
      usedVision: true,
      audioDirection: undefined,
      // Model-family-aware, vision-grounded video prompt quality upgrade
      // (`planning/vd-video-prompt-model-family-quality/plan.md`) — always
      // stamped onto the split path's return too (same shape as the non-
      // split path's mutation return).
      promptModelTarget: {
        family: "veo",
        modelId: "veo-3-1",
        generatedAt: expect.any(String),
      },
      // Judged best-of-2 quality loop (Phase 2) — the mutation return
      // includes the service's own `promptQuality` verbatim.
      promptQuality: { mode: "judged", candidates: 2, verdict: "accept", repaired: false },
    });

    const clipsForShot1 = capturedSet.motionPromptPack.clips.filter(
      (c: any) => c.clipNumber === 1 || c.sourceShotNumbers?.includes(1) || c.parentShotNumber === 1,
    );
    // Exactly ONE clip for shot 1 — the legacy 101/102 split is fully gone.
    expect(clipsForShot1).toHaveLength(1);
    expect(clipsForShot1[0]).toMatchObject({
      clipNumber: 1,
      sourceShotNumbers: [1],
      startFrameAssetId: "900",
      extraReferenceAssetIds: ["9001", "9002"],
      prompt: "A continuous kitchen argument, cutting between the hero and the villain.",
      durationSeconds: 5,
      // Model-family-aware, vision-grounded video prompt quality upgrade —
      // the split path's persist site stamps this on the collapsed clip too.
      promptModelTarget: {
        family: "veo",
        modelId: "veo-3-1",
        generatedAt: expect.any(String),
      },
      // Judged best-of-2 quality loop (Phase 2) — persisted on the clip too.
      promptQuality: { mode: "judged", candidates: 2, verdict: "accept", repaired: false },
    });
    expect(clipsForShot1[0]).not.toHaveProperty("parentShotNumber");
    expect(clipsForShot1[0]).not.toHaveProperty("subShotNumber");

    // The unrelated shot 5 clip survives untouched.
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({ clipNumber: 5, prompt: "unrelated shot 5 clip" }),
    );
    // No stale legacy clip numbers (101/102) remain anywhere in the pack.
    expect(
      capturedSet.motionPromptPack.clips.some((c: any) => c.clipNumber === 101 || c.clipNumber === 102),
    ).toBe(false);
  });

  it("persists via a row-locked transaction (NOT the plain non-transactional update the old split path used) so a concurrent write is honored, mirroring generateShotVideoPrompt's own fix", async () => {
    const legacyPack = {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips: [
        { clipNumber: 1, sourceShotNumbers: [1], prompt: "old shot 1 prompt", durationSeconds: 6 },
      ],
      warnings: [],
    };
    const freshPackFromConcurrentWrite = {
      ...legacyPack,
      clips: [
        ...legacyPack.clips,
        {
          clipNumber: 7,
          sourceShotNumbers: [7],
          prompt: "shot 7 prompt from a concurrent call",
          durationSeconds: 6,
        },
      ],
    };
    const episodeRow = baseEpisodeRow({ motionPromptPack: legacyPack });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([])) // resolveShotVideoPromptCharacterReferenceImages's characterRows query (multi-character disambiguation fix, polished-toasting-gadget.md — no portraits configured in this test, resolves to [])
      .mockReturnValueOnce(
        selectChain([
          { id: 501, characterKey: "hero" },
          { id: 502, characterKey: "villain" },
        ]),
      );

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    // The row-lock read inside the split path's OWN transaction sees the
    // FRESH, already concurrently-updated pack — not the stale outer
    // snapshot `loadOwnedEpisode` read at the top of the request.
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

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    // Shot 7's concurrently-persisted clip must survive this write...
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({ clipNumber: 7, prompt: "shot 7 prompt from a concurrent call" }),
    );
    // ...alongside this call's own consolidated shot-1 clip.
    expect(capturedSet.motionPromptPack.clips).toContainEqual(
      expect.objectContaining({
        clipNumber: 1,
        prompt: "A continuous kitchen argument, cutting between the hero and the villain.",
      }),
    );
  });

  it("planning/`polished-toasting-gadget.md` Fix B — instruction passed to generateShotVideoPrompt on a split-triggering shot reaches generateVerticalDramaShotVideoPromptSpeakerSwitch as repairInstruction", async () => {
    const episodeRow = baseEpisodeRow();

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup (hoisted before resolveShotDialogueLines — planning/`polished-toasting-gadget.md`)
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(selectChain([])) // resolveShotVideoPromptCharacterReferenceImages's characterRows query (multi-character disambiguation fix, polished-toasting-gadget.md — no portraits configured in this test, resolves to [])
      .mockReturnValueOnce(
        selectChain([
          { id: 501, characterKey: "hero" },
          { id: 502, characterKey: "villain" },
        ]),
      ); // verticalDramaCharacters portrait lookup (anchor speaker first)

    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "make the villain's line land harder",
      },
    });

    expect(mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch).toHaveBeenCalledWith(
      expect.objectContaining({
        repairInstruction: "make the villain's line land harder",
      }),
    );
  });

  it("resolves characterReferenceImages for the split path's distinct speakers, in distinctSpeakerCharacterKeys order, with resolved (absolute) URLs — multi-character disambiguation fix, polished-toasting-gadget.md", async () => {
    const episodeRow = baseEpisodeRow();

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup
      .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
      .mockReturnValueOnce(
        selectChain([
          { id: 501, name: "Hero", characterKey: "hero" },
          { id: 502, name: "Villain", characterKey: "villain" },
        ]),
      ) // resolveShotVideoPromptCharacterReferenceImages's characterRows query
      .mockReturnValueOnce(
        selectChain([
          { id: 501, characterKey: "hero" },
          { id: 502, characterKey: "villain" },
        ]),
      ); // verticalDramaCharacters portrait lookup (anchor speaker first)

    const portraitUrlByCharacterId: Record<number, string> = {
      501: "https://cdn/hero-portrait.png",
      502: "https://cdn/villain-portrait.png",
    };
    mockGetPrimaryPortraitUrl.mockImplementation(
      async (_owner: unknown, characterId: number) => portraitUrlByCharacterId[characterId] ?? null,
    );

    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotVideoPrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch).toHaveBeenCalledWith(
      expect.objectContaining({
        characterReferenceImages: [
          { characterKey: "hero", name: "Hero", url: "https://cdn/hero-portrait.png" },
          { characterKey: "villain", name: "Villain", url: "https://cdn/villain-portrait.png" },
        ],
      }),
    );
  });

  it("silently omits a distinct speaker with no approved portrait yet from characterReferenceImages, without throwing (split path graceful-skip)", async () => {
    const episodeRow = baseEpisodeRow();

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }]))
      .mockReturnValueOnce(selectChain([{ locale: "en" }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(
        selectChain([
          { id: 501, name: "Hero", characterKey: "hero" },
          { id: 502, name: "Villain", characterKey: "villain" },
        ]),
      )
      .mockReturnValueOnce(
        selectChain([
          { id: 501, characterKey: "hero" },
          { id: 502, characterKey: "villain" },
        ]),
      );

    mockGetPrimaryPortraitUrl.mockImplementation(async (_owner: unknown, characterId: number) =>
      characterId === 501 ? "https://cdn/hero-portrait.png" : null,
    );

    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await expect(
      router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).resolves.toBeDefined();

    expect(mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch).toHaveBeenCalledWith(
      expect.objectContaining({
        characterReferenceImages: [
          { characterKey: "hero", name: "Hero", url: "https://cdn/hero-portrait.png" },
        ],
      }),
    );
  });

  describe("locationReferenceImage (Phase E, planning/polished-toasting-gadget.md)", () => {
    it("byte-identical-when-absent: no override and no storyboard distinct_locations group -> locationReferenceImage undefined, getPrimaryReferenceUrl never called", async () => {
      const episodeRow = baseEpisodeRow(); // default fixture: no locationKey on the frame, storyboard has no distinct_locations

      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([])) // resolveShotVideoPromptCharacterReferenceImages's characterRows query
        .mockReturnValueOnce(
          selectChain([
            { id: 501, characterKey: "hero" },
            { id: 502, characterKey: "villain" },
          ]),
        ); // verticalDramaCharacters portrait lookup (anchor speaker first)

      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGetPrimaryReferenceUrl).not.toHaveBeenCalled();
      expect(mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch).toHaveBeenCalledWith(
        expect.objectContaining({ locationReferenceImage: undefined }),
      );
    });

    it("resolves the shot's per-shot location override to a reference image and threads it into the speaker-switch service call", async () => {
      const episodeRow = baseEpisodeRow({
        startFramePlan: {
          mode: "single_frame_per_shot",
          selectedImageModelId: "google-nano-banana-pro",
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "two characters argue in a kitchen",
              negativePrompt: "",
              requiredCharacterRefs: [],
              productReferenceAssetIds: [],
              approvedMediaAssetId: "900",
              locationKey: "loc_kitchen",
            },
          ],
        },
      });

      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([{ id: 56, name: "ครัวที่บ้าน", data: {} }])) // resolveLocationRosterRowByKey (override key)
        .mockReturnValueOnce(selectChain([])) // resolveShotVideoPromptCharacterReferenceImages's characterRows query
        .mockReturnValueOnce(
          selectChain([
            { id: 501, characterKey: "hero" },
            { id: 502, characterKey: "villain" },
          ]),
        ); // verticalDramaCharacters portrait lookup (anchor speaker first)
      mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/kitchen-plate.png");

      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGetPrimaryReferenceUrl).toHaveBeenCalledWith(
        { tenantId: "tenant-1", userId: 42, seriesId: 10 },
        56,
      );
      expect(mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch).toHaveBeenCalledWith(
        expect.objectContaining({
          locationReferenceImage: {
            url: "https://cdn.example.com/kitchen-plate.png",
            name: "ครัวที่บ้าน",
          },
        }),
      );
    });
  });

  // Synopsis grounding (`planning/vd-video-prompt-skill-first/plan.md`
  // Phase 1a) — the split path threads the SAME deep-drafted shot summary
  // the non-split path does. Every OTHER test in this file (byte-identical
  // regression bar: flag off, no deep draft) already proves the
  // non-silent multi-speaker case is unchanged by this fix.
  describe("canonicalShotSummary / beatIsSilent threading (planning/vd-video-prompt-skill-first/plan.md)", () => {
    it("threads the deep-drafted shot summary into the speaker-switch call's shotContext.canonicalShotSummary, beatIsSilent stays false (real dialogue present)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesSubShots: true,
        verticalDramaSeriesDeepStoryDrafts: true,
      });
      mockGetActiveBreakdown.mockReturnValue([
        { episodeNumber: 1, workingTitle: "t", logline: "l", keyBeats: [] },
      ]);
      mockReadItemShotDrafts.mockReturnValue([
        {
          shot_number: 1,
          summary: "The hero confronts the villain about the hidden truth.",
          dialogue_lines: [
            { speaker: "hero", line: "Why didn't you tell me the truth?" },
            { speaker: "villain", line: "I was protecting you the whole time." },
          ],
        },
      ]);
      const episodeRow = baseEpisodeRow({ episodeNumber: 1 });

      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([])) // resolveShotVideoPromptCharacterReferenceImages's characterRows query
        .mockReturnValueOnce(
          selectChain([
            { id: 501, characterKey: "hero" },
            { id: 502, characterKey: "villain" },
          ]),
        ); // verticalDramaCharacters portrait lookup

      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockGenerateVerticalDramaShotVideoPromptSpeakerSwitch).toHaveBeenCalledWith(
        expect.objectContaining({
          shotContext: expect.objectContaining({
            canonicalShotSummary: "The hero confronts the villain about the hidden truth.",
            beatIsSilent: false,
          }),
        }),
      );
    });
  });

  // Dialogue-duplication fix (2026-07-15, ground truth from
  // logs/audit/audit-2026-07-15.jsonl) — the `ensurePromptWithinLimit` call
  // for this split/consolidated-clip path used to protect the
  // `buildNativeDialogueVerbatimBlock` boilerplate block as a single
  // `protectedFragments` entry. Because the refiner already keeps dialogue
  // INLINE while compressing (e.g. `Kla speaks: "..."`), that block was
  // re-appended a SECOND time whenever the prompt was over the length cap,
  // duplicating every spoken line. The fix protects each individual quoted
  // line instead, so the refiner's inline dialogue is recognized as
  // already-present and never duplicated.
  describe("dialogue-duplication fix (2026-07-15) — protectedFragments is individual quoted lines, not the boilerplate block", () => {
    it("protects each dialogue line as a bare quoted string, never the 'Native dialogue (verbatim)' block", async () => {
      const episodeRow = baseEpisodeRow();

      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([])) // resolveShotVideoPromptCharacterReferenceImages's characterRows query
        .mockReturnValueOnce(
          selectChain([
            { id: 501, characterKey: "hero" },
            { id: 502, characterKey: "villain" },
          ]),
        ); // verticalDramaCharacters portrait lookup

      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockEnsurePromptWithinLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "video",
          protectedFragments: [
            "Why didn't you tell me the truth?",
            "I was protecting you the whole time.",
          ],
        }),
      );
      const videoQcCall = mockEnsurePromptWithinLimit.mock.calls.find(
        ([args]) => args.kind === "video",
      );
      expect(videoQcCall).toBeDefined();
      const fragments = videoQcCall?.[0].protectedFragments ?? [];
      expect(fragments.some((f: string) => f.includes("Native dialogue (verbatim)"))).toBe(false);
    });

    it("non-native-audio model: protectedFragments is undefined (gate unchanged)", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: false,
        verticalDramaReady: true,
      });
      const episodeRow = baseEpisodeRow();

      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ locale: "en" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])) // loadSeriesKnownSpeakerKeys
        .mockReturnValueOnce(selectChain([])) // resolveShotVideoPromptCharacterReferenceImages's characterRows query
        .mockReturnValueOnce(
          selectChain([
            { id: 501, characterKey: "hero" },
            { id: 502, characterKey: "villain" },
          ]),
        ); // verticalDramaCharacters portrait lookup

      mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

      await router.generateShotVideoPrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(mockEnsurePromptWithinLimit).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "video", protectedFragments: undefined }),
      );
    });
  });
});
