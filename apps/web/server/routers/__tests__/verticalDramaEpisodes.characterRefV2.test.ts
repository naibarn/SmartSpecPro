/**
 * Vertical Drama — F131Z (`verticalDramaSeriesCharacterRefV2`) coverage:
 * `resolveShotCharacterReferenceUrls`'s flag-gated SECOND identity-lock
 * reference image (the character's stored `character_sheet_turnaround`/
 * `character_sheet_full` asset, alongside the primary portrait), threaded
 * through both `generateStartFrameImage` and `generateStartFrameAngleVariations`.
 * See `planning/vertical-drama-character-consistency/research-2026-07-09.md`
 * (option A) for the product rationale.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaEpisodes.characterLockSoften.test.ts`
 * / `verticalDramaEpisodes.adBannerPlan.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetModelsByTypeAsync, mockResolveVerticalDramaCapabilities } =
  vi.hoisted(() => ({
    mockGetModelsByTypeAsync: vi.fn(),
    // Hoisted (unlike `characterLockSoften.test.ts`'s inline mock) so tests
    // can override `maxReferenceImages` per case — the trim-cap integration
    // test needs a LOW cap, the ordering test needs a cap high enough that
    // nothing is trimmed.
    mockResolveVerticalDramaCapabilities: vi.fn(() => ({
      supportsStartFrame: true,
      maxReferenceImages: 10,
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
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
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

const { mockGenerateImageAsync } = vi.hoisted(() => ({
  mockGenerateImageAsync: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: mockGenerateImageAsync },
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo3/generate-veo-3-video-lite",
  },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 10),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(() => Promise.resolve(true)),
  deductCredits: vi.fn(() => Promise.resolve()),
  refundCredits: vi.fn(() => Promise.resolve()),
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

const { mockGetPrimaryPortraitUrl, mockGetCharacterReferenceUrls } =
  vi.hoisted(() => ({
    mockGetPrimaryPortraitUrl: vi.fn(() => Promise.resolve(null)),
    mockGetCharacterReferenceUrls: vi.fn(() => Promise.resolve([])),
  }));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
    getCharacterReferenceUrls: mockGetCharacterReferenceUrls,
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

// vertical-drama-skill-first-architecture plan, Phase 1 item 1 —
// `generateStartFrameAngleVariations` now dynamically
// `import("../services/verticalDramaShotImageAction")` (same
// "adminProcedure transitive dependency" reasoning as every other dynamic
// import in this router — see `verticalDramaEpisodes.ts`'s doc comment on
// this exact pattern). Mocked here so this file never pulls in the real
// module's `verticalDramaStoryBible.ts` -> `enabledLlmModels.ts` ->
// `llmProviders.ts` chain, which needs `adminProcedure` (not exported by
// this file's `../../_core/trpc` mock above). The mock echoes
// `shot.currentPrompt`/`shot.currentNegativePrompt` back into its return
// value so this file's reference-image-array assertions (which don't depend
// on prompt text) are unaffected.
vi.mock("../../services/verticalDramaShotImageAction", () => ({
  generateShotImageAction: vi.fn(
    async (params: {
      shot: { currentPrompt: string; currentNegativePrompt: string };
    }) => ({
      prompt: params.shot.currentPrompt,
      negativePrompt: params.shot.currentNegativePrompt,
      creditsUsed: 0,
      model: "mock-model",
    })
  ),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
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

/** Thenable select-chain stub — resolves at ANY point in the chain (mirrors `characterLockSoften.test.ts`'s own helper). */
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
          imagePrompt: "A moody establishing shot of the two leads.",
          negativePrompt: "identity drift",
          requiredCharacterRefs: ["char-a", "char-b"],
          productReferenceAssetIds: [],
        },
      ],
    },
    ...over,
  };
}

const CHARACTER_ROWS = [
  { id: 501, name: "ฝ้าย", characterKey: "char-a" },
  { id: 502, name: "ใบข้าว", characterKey: "char-b" },
];
const PORTRAIT_A = "https://cdn.example.com/portrait-a.png";
const PORTRAIT_B = "https://cdn.example.com/portrait-b.png";
const SHEET_A = "https://cdn.example.com/sheet-a.png";
const SHEET_B = "https://cdn.example.com/sheet-b.png";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModelsByTypeAsync.mockResolvedValue([
    {
      id: "google-nano-banana-pro",
      type: "image",
      isEnabled: true,
      creditCost: 10,
      aliases: [],
      configJson: {},
    },
  ]);
  mockGenerateImageAsync.mockResolvedValue({ id: "task-1" });
  mockResolveVerticalDramaCapabilities.mockReturnValue({
    supportsStartFrame: true,
    maxReferenceImages: 10,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  });
  // Fail-closed default (matches production `resolveVerticalDramaCharacterRefV2Flag`
  // for any test that doesn't explicitly enable it) — same convention as
  // `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`'s beforeEach.
  mockGetTenantFeatureFlags.mockResolvedValue({} as any);
});

describe("generateStartFrameImage — F131Z character reference set", () => {
  it("does not allow a character sheet to substitute for a missing primary portrait", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesCharacterRefV2: true,
    } as any);
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()]))
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS));
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(PORTRAIT_B);
    mockGetCharacterReferenceUrls
      .mockResolvedValueOnce([SHEET_A])
      .mockResolvedValueOnce([PORTRAIT_B, SHEET_B]);

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("ฝ้าย"),
    });
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("fails before credits/provider and lists a missing portrait in a three-character shot", async () => {
    const threeCharacterEpisode = baseEpisodeRow({
      startFramePlan: {
        ...baseEpisodeRow().startFramePlan,
        frames: [
          {
            ...baseEpisodeRow().startFramePlan.frames[0],
            requiredCharacterRefs: ["char-a", "char-b", "char-c"],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([threeCharacterEpisode]))
      .mockReturnValueOnce(
        selectChain([
          ...CHARACTER_ROWS,
          { id: 503, name: "ลุงสมพร", characterKey: "char-c" },
        ]),
      );
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(PORTRAIT_A)
      .mockResolvedValueOnce(PORTRAIT_B)
      .mockResolvedValueOnce(null);

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("ลุงสมพร"),
    });
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("blocks a three-character shot when the selected model accepts only two references", async () => {
    const threeCharacterEpisode = baseEpisodeRow({
      startFramePlan: {
        ...baseEpisodeRow().startFramePlan,
        frames: [
          {
            ...baseEpisodeRow().startFramePlan.frames[0],
            requiredCharacterRefs: ["char-a", "char-b", "char-c"],
          },
        ],
      },
    });
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 2,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([threeCharacterEpisode]))
      .mockReturnValueOnce(
        selectChain([
          ...CHARACTER_ROWS,
          { id: 503, name: "ลุงสมพร", characterKey: "char-c" },
        ]),
      )
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(PORTRAIT_A)
      .mockResolvedValueOnce(PORTRAIT_B)
      .mockResolvedValueOnce("https://cdn.example.com/portrait-c.png");

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("ต้องใช้ตัวละคร 3 คน"),
    });
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("flag off: resolves portraits only, in character order — byte-identical to pre-F131Z behavior", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS)) // resolveShotCharacterReferenceUrls character lookup
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(PORTRAIT_A)
      .mockResolvedValueOnce(PORTRAIT_B);

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryPortraitUrl).toHaveBeenCalledTimes(2);
    expect(mockGetPrimaryPortraitUrl).toHaveBeenNthCalledWith(
      1,
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      501
    );
    expect(mockGetPrimaryPortraitUrl).toHaveBeenNthCalledWith(
      2,
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      502
    );
    // The new dual-reference resolver is never even invoked when the flag is off.
    expect(mockGetCharacterReferenceUrls).not.toHaveBeenCalled();

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual([PORTRAIT_A, PORTRAIT_B]);
  });

  it("flag on: returns ALL portraits first, THEN all sheets (never interleaved per-character)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesCharacterRefV2: true,
    } as any);
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()]))
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetCharacterReferenceUrls
      .mockResolvedValueOnce([PORTRAIT_A, SHEET_A])
      .mockResolvedValueOnce([PORTRAIT_B, SHEET_B]);
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(PORTRAIT_A)
      .mockResolvedValueOnce(PORTRAIT_B);

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetCharacterReferenceUrls).toHaveBeenNthCalledWith(
      1,
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      501,
      { includeSheet: true }
    );
    expect(mockGetCharacterReferenceUrls).toHaveBeenNthCalledWith(
      2,
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      502,
      { includeSheet: true }
    );
    expect(mockGetPrimaryPortraitUrl).toHaveBeenCalledTimes(2);

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual([
      PORTRAIT_A,
      PORTRAIT_B,
      SHEET_A,
      SHEET_B,
    ]);
  });

  it("flag on + trim cap (maxReferenceImages=3): end-trimming drops a sheet before it ever drops a portrait", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesCharacterRefV2: true,
    } as any);
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()]))
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetCharacterReferenceUrls
      .mockResolvedValueOnce([PORTRAIT_A, SHEET_A])
      .mockResolvedValueOnce([PORTRAIT_B, SHEET_B]);
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(PORTRAIT_A)
      .mockResolvedValueOnce(PORTRAIT_B);

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    // Both portraits survive; only the SECOND character's sheet is trimmed
    // off the end — neither portrait is ever sacrificed for a sheet.
    expect(request.referenceImageUrls).toEqual([PORTRAIT_A, PORTRAIT_B, SHEET_A]);
    expect(result.trimmedProductReferenceCount).toBe(1);
  });
});

describe("generateStartFrameAngleVariations — F131Z threading (second call site)", () => {
  it("flag on: the 3x3 grid call site also resolves portraits-then-sheets", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesCharacterRefV2: true,
    } as any);
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS)) // resolveShotCharacterReferenceUrls
      .mockReturnValueOnce(selectChain([])) // resolveShotCharacterIdentitySources
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion (series row)
    mockGetCharacterReferenceUrls
      .mockResolvedValueOnce([PORTRAIT_A, SHEET_A])
      .mockResolvedValueOnce([PORTRAIT_B, SHEET_B]);
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(PORTRAIT_A)
      .mockResolvedValueOnce(PORTRAIT_B);

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetCharacterReferenceUrls).toHaveBeenCalledTimes(2);
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual([
      PORTRAIT_A,
      PORTRAIT_B,
      SHEET_A,
      SHEET_B,
    ]);
  });
});

describe("generateStartFrameImage — skill-first render prompt, no code-authored identity-lock append (planning/vd-start-frame-reference-mapping/plan.md Phase 3)", () => {
  it("renders the skill-authored prompt UNMODIFIED at softenLevel 0 — no code-appended 'Image N = name' bracket block", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesCharacterRefV2: false,
    } as any);
    const namedCharacterRows = [
      { id: 501, name: "ใบข้าว", characterKey: "char-a" },
      { id: 502, name: "ฝ้าย", characterKey: "char-b" },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()]))
      .mockReturnValueOnce(selectChain(namedCharacterRows))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce(PORTRAIT_A)
      .mockResolvedValueOnce(PORTRAIT_B);

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    // The stored (skill-authored) prompt is sent byte-identical — the
    // formerly-appended code-authored "Image N = name" bracket block (and
    // its identity-lock sentence) is GONE (RC2 fix): a second,
    // independently-authored mapping on top of the skill's own prose is
    // exactly what produced the reported live contradiction.
    expect(request.prompt).toBe("A moody establishing shot of the two leads.");
    expect(request.prompt).not.toContain("Attached character reference images:");
    // No append means the QC'd prompt is byte-identical to the stored
    // prompt, so the "persist the QC'd prompt back onto the plan" branch
    // (`imagePromptQc.prompt !== frame.imagePrompt`) is correctly a no-op —
    // unlike before this fix, when the append always made them differ.
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
