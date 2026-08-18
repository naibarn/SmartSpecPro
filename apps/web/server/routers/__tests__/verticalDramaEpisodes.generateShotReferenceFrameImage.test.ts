/**
 * Phase 6a (`planning/vd-start-frame-reference-mapping/plan.md` Phase 6 —
 * user-controlled supplementary reference frames) — `generateShotReferenceFrameImage`
 * coverage: cap-10 guard, render-time reference-mapping fail-closed guard
 * (BEFORE credits), happy-path task submission with `__vd_purpose:
 * "reference_frame"`, and that NO product reference is ever attached.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaEpisodes.characterRefV2.test.ts`
 * (this mutation's closest sibling/precedent — `generateStartFrameImage`'s
 * own render-time guard/credit-reserve/MCP-transport/async-submit structure
 * is mirrored here almost verbatim).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetModelsByTypeAsync,
  mockGetStaticModelById,
  mockResolveVerticalDramaCapabilities,
} = vi.hoisted(() => ({
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

const { mockHasEnoughCredits, mockDeductCredits, mockRefundCredits } =
  vi.hoisted(() => ({
    mockHasEnoughCredits: vi.fn(() => Promise.resolve(true)),
    mockDeductCredits: vi.fn(() => Promise.resolve()),
    mockRefundCredits: vi.fn(() => Promise.resolve()),
  }));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  refundCredits: mockRefundCredits,
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

const { mockGetPrimaryPortraitUrl, mockGetCharacterReferenceUrls } = vi.hoisted(
  () => ({
    mockGetPrimaryPortraitUrl: vi.fn(() => Promise.resolve(null)),
    mockGetCharacterReferenceUrls: vi.fn(() => Promise.resolve([])),
  })
);
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

const { mockListForShot } = vi.hoisted(() => ({
  mockListForShot: vi.fn(() => Promise.resolve([])),
}));
vi.mock("../../services/verticalDramaShotReferences", () => ({
  verticalDramaShotReferencesService: {
    listForEpisode: vi.fn(),
    listForShot: mockListForShot,
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
  generateVerticalDramaShotVideoPromptSpeakerSwitch: vi.fn(),
  generateVerticalDramaClipDialogue: vi.fn(),
  appendPresetVisualIdentityStyleTokensToMotionPrompt: vi.fn(
    (prompt: string) => prompt
  ),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
}));

vi.mock("../../services/verticalDramaStartFrameGeneration", () => ({
  generateStartFrameShotPrompt: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
  VdReferenceMappingError: class extends Error {},
}));

vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));

vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: vi.fn(() => []),
  readItemCliffhangerLine: vi.fn(() => undefined),
  readItemShotDrafts: vi.fn(() => null),
}));

vi.mock("../../services/verticalDramaShotImageAction", () => ({
  generateShotImageAction: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";

const router = verticalDramaEpisodesRouter as unknown as Record<
  string,
  Function
>;

function ctx(
  overrides: Partial<{ tenantId: string; user: { id: number } }> = {}
) {
  return {
    tenantId: "tenant-1",
    user: { id: 42 },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

/** Thenable select-chain stub — resolves at ANY point in the chain. */
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
    startFramePlan: {
      mode: "single_frame_per_shot",
      selectedImageModelId: "google-nano-banana-pro",
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "existing stored prompt",
          negativePrompt: "no blur",
          requiredCharacterRefs: ["char-a"],
          productReferenceAssetIds: ["prod-asset-1"],
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

function existingReferenceFrameRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    referenceId: String(1000 + i),
    seriesId: "10",
    episodeId: "100",
    shotNumber: 1,
    mediaAssetId: String(2000 + i),
    role: "reference" as const,
    source: "reference_frame" as const,
    sortOrder: i,
    createdAt: new Date().toISOString(),
  }));
}

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
  mockListForShot.mockResolvedValue([]);
  mockHasEnoughCredits.mockResolvedValue(true);
});

describe("generateShotReferenceFrameImage (Phase 6a)", () => {
  it("throws PRECONDITION_FAILED when there is no start-frame plan/frame yet, and never calls the LLM/provider", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([baseEpisodeRow({ startFramePlan: null })])
    );

    await expect(
      router.generateShotReferenceFrameImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          prompt: "hero and villain embrace",
          characterKeys: ["char-a"],
        },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("cap-10 guard: rejects with a Thai message and never reaches credits/provider once 10 reference_frame rows already exist", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([baseEpisodeRow()])); // loadOwnedEpisode
    mockListForShot.mockResolvedValueOnce(existingReferenceFrameRows(10));

    await expect(
      router.generateShotReferenceFrameImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          prompt: "hero and villain embrace",
          characterKeys: ["char-a"],
        },
      })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("ครบ 10 ภาพแล้ว"),
    });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("cap-10 guard: only counts rows whose source is 'reference_frame' — a shot with 10 OTHER-source references is unaffected", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS)) // resolveRequiredShotCharacterAttachmentManifest
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing
    mockListForShot.mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) => ({
        referenceId: String(3000 + i),
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: String(4000 + i),
        role: "reference" as const,
        source: "grid_cut" as const,
        sortOrder: i,
        createdAt: new Date().toISOString(),
      }))
    );
    mockGetPrimaryPortraitUrl.mockResolvedValueOnce(PORTRAIT_A);

    await router.generateShotReferenceFrameImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        prompt: "ฝ้าย (Image 1) smiles warmly",
        characterKeys: ["char-a"],
      },
    });

    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
  });

  it("render-time reference-mapping guard fails BEFORE credits are reserved when the confirmed prompt contradicts the real attachment order", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS)); // resolveRequiredShotCharacterAttachmentManifest
    mockGetPrimaryPortraitUrl.mockResolvedValueOnce(PORTRAIT_A);

    await expect(
      router.generateShotReferenceFrameImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          // "char-a" resolves to index 1, but the prompt explicitly claims
          // it is Image 2 — an explicit contradiction.
          prompt: "ฝ้าย (Image 2) smiles warmly",
          characterKeys: ["char-a"],
        },
      })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("ขัดแย้งกับลำดับภาพแนบจริง"),
    });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED (never calls the provider) when a selected characterKey has no approved portrait", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()]))
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS));
    mockGetPrimaryPortraitUrl.mockResolvedValueOnce(null); // char-a has no approved portrait

    await expect(
      router.generateShotReferenceFrameImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          prompt: "ฝ้าย (Image 1) smiles warmly",
          characterKeys: ["char-a"],
        },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).not.toHaveBeenCalled();
  });

  it("happy path: submits the task with extraParams.__vd_purpose 'reference_frame', NO product reference attached, and returns {taskId, creditCost, modelId}", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS)) // resolveRequiredShotCharacterAttachmentManifest
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing
    mockGetPrimaryPortraitUrl.mockResolvedValueOnce(PORTRAIT_A);

    const result = await router.generateShotReferenceFrameImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        prompt: "ฝ้าย (Image 1) smiles warmly",
        negativePrompt: "no blur",
        characterKeys: ["char-a"],
      },
    });

    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
    const [request] = mockGenerateImageAsync.mock.calls[0];
    // Current image transports consume one prompt, so exclusions are folded
    // into the positive prompt before submission (same as start-frame render).
    expect(request.prompt).toBe(
      "ฝ้าย (Image 1) smiles warmly\nNEGATIVE PROMPT: no blur"
    );
    expect(request.negativePrompt).toBeUndefined();
    expect(request.referenceImageUrls).toEqual([PORTRAIT_A]);
    expect(request.auditContext).toMatchObject({
      userId: 42,
      tenantId: "tenant-1",
    });
    expect(request.extraParams).toMatchObject({
      __vd_series_id: "10",
      __vd_episode_id: "100",
      __vd_shot_number: "1",
      __vd_purpose: "reference_frame",
    });

    expect(result).toEqual({
      taskId: "task-1",
      creditCost: 10,
      modelId: "google-nano-banana-pro",
      trimmedReferenceCount: 0,
    });

    // Nothing is ever persisted onto the episode row by this mutation.
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("NO product reference is ever attached, even when the shot carries productReferenceAssetIds", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          baseEpisodeRow({
            startFramePlan: {
              mode: "single_frame_per_shot",
              selectedImageModelId: "google-nano-banana-pro",
              frames: [
                {
                  shotNumber: 1,
                  imagePrompt: "existing stored prompt",
                  negativePrompt: "no blur",
                  requiredCharacterRefs: ["char-a"],
                  // Tie-in-carrying shot — product refs must still never be
                  // attached to a supplementary reference frame.
                  productReferenceAssetIds: ["prod-asset-1"],
                },
              ],
            },
          }),
        ])
      )
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryPortraitUrl.mockResolvedValueOnce(PORTRAIT_A);

    await router.generateShotReferenceFrameImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        prompt: "ฝ้าย (Image 1) smiles warmly",
        characterKeys: ["char-a"],
      },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.referenceImageUrls).toEqual([PORTRAIT_A]);
  });

  it("refunds reserved credits when the provider submit call throws", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()]))
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));
    mockGetPrimaryPortraitUrl.mockResolvedValueOnce(PORTRAIT_A);
    mockGenerateImageAsync.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      router.generateShotReferenceFrameImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          prompt: "ฝ้าย (Image 1) smiles warmly",
          characterKeys: ["char-a"],
        },
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
  });
});
