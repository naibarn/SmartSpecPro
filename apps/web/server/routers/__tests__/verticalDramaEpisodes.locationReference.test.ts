/**
 * Vertical Drama — Phase 2 of `planning/polished-toasting-gadget.md`
 * (location visual bible, dispatch 3/3) render-time attachment coverage:
 * `resolveShotLocationReferenceEntry` threaded through both
 * `generateStartFrameImage` and `generateStartFrameAngleVariations` via the
 * widened `mergeAndTrimReferenceImageUrls(characterRefUrls, locationRefUrls,
 * sceneAnchorRefUrls, productRefUrls, maxReferenceImages)`.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaEpisodes.characterRefV2.test.ts`
 * (this file's own direct precedent/sibling — same fixture shapes reused
 * where possible). Deliberately a SEPARATE, NEW test file — the task's own
 * regression requirement is that `characterRefV2.test.ts` (and every other
 * pre-existing test of these two procedures) passes UNMODIFIED; none of its
 * fixtures carry a `storyboard` field, so `resolveShotLocationReferenceEntry`
 * short-circuits to a no-op (zero new DB calls) for every one of those
 * existing tests — see this file's own "byte-identical when absent" case
 * below for the same assertion made explicit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetModelsByTypeAsync,
  mockGetStaticModelById,
  mockResolveVerticalDramaCapabilities,
} =
  vi.hoisted(() => ({
    mockGetModelsByTypeAsync: vi.fn(),
    mockGetStaticModelById: vi.fn(() => undefined),
    mockResolveVerticalDramaCapabilities: vi.fn(() => ({
      supportsStartFrame: true,
      maxReferenceImages: 10,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    })),
  }));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  getStaticModelById: mockGetStaticModelById,
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

const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: vi.fn(),
}));
vi.mock("../../services/auditLogger", () => ({
  auditLogger: { log: mockAuditLog },
}));

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

const { mockGetPrimaryPortraitUrl } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl,
  },
}));

const { mockGetPrimaryReferenceUrl } = vi.hoisted(() => ({
  mockGetPrimaryReferenceUrl: vi.fn(() => Promise.resolve(undefined)),
}));
vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    getPrimaryReferenceUrl: mockGetPrimaryReferenceUrl,
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

/** Thenable select-chain stub — resolves at ANY point in the chain (mirrors `characterRefV2.test.ts`'s own helper). */
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

const STORE_LOCATION_GROUP = {
  location_key: "loc_store",
  location_name: "ร้านสะดวกซื้อ",
  description: "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน",
  shot_numbers: [1, 2, 3],
};
const KITCHEN_LOCATION_GROUP = {
  location_key: "loc_kitchen",
  location_name: "ครัวที่บ้าน",
  description: "ครัวขนาดกลาง โต๊ะไม้ตรงกลาง",
  shot_numbers: [4, 5, 6, 7, 8, 9],
};

function baseEpisodeRow(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 10,
    durationProfileId: "vertical_drama_60s_9_frames_8_clips",
    // No `storyboard` field by default — matches every pre-existing fixture
    // for these two procedures (see `characterRefV2.test.ts`), so
    // `resolveShotLocationReferenceEntry` short-circuits with zero DB calls
    // unless a test explicitly opts in via `over.storyboard`.
    startFramePlan: {
      mode: "single_frame_per_shot",
      selectedImageModelId: "google-nano-banana-pro",
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "A moody establishing shot of the two leads.",
          negativePrompt: "identity drift",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
        },
      ],
    },
    ...over,
  };
}

const LOCATION_ROW = {
  id: 55,
  locationKey: "loc_store",
  name: "ร้านสะดวกซื้อ",
  data: { description: "a real description" },
};

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
  mockGetTenantFeatureFlags.mockResolvedValue({} as any);
  mockGetPrimaryReferenceUrl.mockResolvedValue(undefined);
});

describe("generateStartFrameImage — location reference attachment (Phase 2 location visual bible)", () => {
  it("attaches the nearest approved same-scene neighbor and persists its provenance when the flag is enabled", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP] },
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "first shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            approvedMediaAssetId: "901",
          },
          {
            shotNumber: 2,
            imagePrompt: "second shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
          },
        ],
      },
    });
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSceneContinuity: true,
      verticalDramaSceneNeighborAnchors: true,
    });
    const setPlan = vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) }));
    mockDb.update.mockReturnValueOnce({ set: setPlan });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(
        selectChain([{ id: 901, originalUrl: "https://cdn.example.com/shot-1.png" }])
      )
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce(undefined);

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 2 },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual([
      "https://cdn.example.com/shot-1.png",
    ]);
    expect(setPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        startFramePlan: expect.objectContaining({
          frames: expect.arrayContaining([
            expect.objectContaining({
              shotNumber: 2,
              sceneAnchor: expect.objectContaining({
                anchorShotNumber: 1,
                mediaAssetId: 901,
                source: "approved",
              }),
            }),
          ]),
        }),
      }),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "vd_scene_neighbor_anchor_attached",
        metadata: expect.objectContaining({
          shotNumber: 2,
          anchorShotNumber: 1,
          source: "approved",
          layer: "render",
          dropped: false,
        }),
      }),
    );
  });

  it("does not resolve or attach a neighbor when scene continuity is disabled", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP] },
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "first shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            approvedMediaAssetId: "901",
          },
          {
            shotNumber: 2,
            imagePrompt: "second shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce(undefined);

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 2 },
    });

    expect(mockGetTenantFeatureFlags).toHaveBeenCalled();
    expect(mockDb.select).toHaveBeenCalledTimes(3);
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toBeUndefined();
  });

  it("byte-identical when the episode's storyboard has no distinct_locations data: zero new DB calls, referenceImageUrls unchanged", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup — NO location roster query in between

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).not.toHaveBeenCalled();
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toBeUndefined();
  });

  it("resolves and attaches the shot's location reference URL when the storyboard has a matching distinct_locations group", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP, KITCHEN_LOCATION_GROUP] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([LOCATION_ROW])) // resolveShotLocationReferenceEntry roster lookup
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/store-plate.png");

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      55
    );
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual(["https://cdn.example.com/store-plate.png"]);
    expect(result.trimmedProductReferenceCount).toBe(0);
  });

  it("resolves a canonical roster image when the legacy storyboard key and situation-qualified name drifted (series 18 regression)", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: {
        distinct_locations: [
          {
            location_key: "location-2-visit1",
            location_name:
              "ศูนย์ควบคุมการปฏิบัติการบิน (ช่วงเช้า)",
            description: "flight control center during the morning crisis",
            shot_numbers: [1],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(
        selectChain([
          {
            id: 72,
            locationKey: "location-2",
            name: "ศูนย์ควบคุมการปฏิบัติการบิน",
            data: { description: "canonical flight control center" },
          },
        ])
      )
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce(
      "https://cdn.example.com/flight-control-center.png"
    );

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      72
    );
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual([
      "https://cdn.example.com/flight-control-center.png",
    ]);
  });

  it("shot 4 (kitchen group) resolves the KITCHEN location, not the store — group matching is per-shot, not per-episode", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP, KITCHEN_LOCATION_GROUP] },
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 4,
            imagePrompt: "cut to kitchen",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ id: 56, locationKey: "loc_kitchen", name: "ครัวที่บ้าน", data: { description: "kitchen desc" } }]))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/kitchen-plate.png");

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 4 },
    });

    expect(mockGetPrimaryReferenceUrl).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      56
    );
  });

  it("no roster row yet for the matched location_key (reconciliation hasn't run): omits the location reference gracefully, never throws", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([])) // exact-key roster lookup — no row yet
      .mockReturnValueOnce(selectChain([])) // bounded name fallback — no row yet
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).not.toHaveBeenCalled();
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toBeUndefined();
  });

  it("location has a roster row but no approved reference image yet: referenceImageUrls omitted (not an empty-string entry)", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([LOCATION_ROW]))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce(undefined);

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toBeUndefined();
  });

  it("priority ordering: character refs survive trimming before the location ref does", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 1,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP] },
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a shot",
            negativePrompt: "",
            requiredCharacterRefs: ["char-a"],
            productReferenceAssetIds: [],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 501, name: "Character A", characterKey: "char-a" }])
      ) // resolveRequiredShotCharacterAttachmentManifest character lookup
      .mockReturnValueOnce(selectChain([LOCATION_ROW])) // location roster lookup
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup
    mockGetPrimaryPortraitUrl.mockResolvedValueOnce("https://cdn.example.com/portrait-a.png");
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/store-plate.png");

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    // With maxReferenceImages=1, only the character portrait survives — the
    // location ref is trimmed off the end before it, per the character ->
    // location -> product priority order.
    expect(request.referenceImageUrls).toEqual(["https://cdn.example.com/portrait-a.png"]);
    expect(result.trimmedProductReferenceCount).toBe(1);
  });
});

describe("generateStartFrameAngleVariations — location reference attachment (Phase 2, second call site)", () => {
  it("byte-identical when the episode's storyboard has no distinct_locations data", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).not.toHaveBeenCalled();
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toBeUndefined();
  });

  it("resolves and attaches the shot's location reference URL when present", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP, KITCHEN_LOCATION_GROUP] },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([LOCATION_ROW])) // resolveShotLocationReferenceEntry roster lookup
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/store-plate.png");

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual(["https://cdn.example.com/store-plate.png"]);
  });
});

/**
 * Phase D of `planning/polished-toasting-gadget.md` — per-shot location
 * override precedence (`resolveEffectiveShotLocationKey`, consumed by
 * `resolveShotLocationReferenceEntry`). Exercised through
 * `generateStartFrameImage` (same call site/fixture conventions as the first
 * describe block above) since `resolveShotLocationReferenceEntry` is a
 * private, non-exported helper.
 */
describe("resolveShotLocationReferenceEntry — per-shot override precedence (Phase D, planning/polished-toasting-gadget.md)", () => {
  it("the shot's own startFramePlan.frames[].locationKey override takes precedence over the storyboard's distinct_locations grouping", async () => {
    const episodeRow = baseEpisodeRow({
      // Storyboard groups shot 1 under the STORE location...
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP, KITCHEN_LOCATION_GROUP] },
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            // ...but this shot's own override picks the KITCHEN location instead.
            locationKey: "loc_kitchen",
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 56, locationKey: "loc_kitchen", name: "ครัวที่บ้าน", data: { description: "kitchen desc" } }])
      ) // roster lookup for the OVERRIDE key (loc_kitchen), not the storyboard-matched loc_store
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/kitchen-plate.png");

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      56
    );
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual(["https://cdn.example.com/kitchen-plate.png"]);
  });

  it("the override resolves the location even when the storyboard carries no distinct_locations data at all", async () => {
    const episodeRow = baseEpisodeRow({
      // No `storyboard` field at all — the override must not depend on it.
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            locationKey: "loc_store",
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([LOCATION_ROW])) // roster lookup for the override key
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/store-plate.png");

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      55
    );
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual(["https://cdn.example.com/store-plate.png"]);
  });

  it("an override locationKey with no matching roster row yet resolves gracefully to no location reference, never throws", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            locationKey: "loc_ghost",
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // roster lookup — no row for loc_ghost
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).not.toHaveBeenCalled();
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toBeUndefined();
  });

  it("byte-identical when the shot has no override: falls back to the storyboard's distinct_locations grouping exactly as before Phase D", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [STORE_LOCATION_GROUP] },
      // `locationKey` absent on the frame — pre-Phase-D shape.
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([LOCATION_ROW])) // roster lookup via the storyboard-matched key
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup
    mockGetPrimaryReferenceUrl.mockResolvedValueOnce("https://cdn.example.com/store-plate.png");

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGetPrimaryReferenceUrl).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      55
    );
  });
});
