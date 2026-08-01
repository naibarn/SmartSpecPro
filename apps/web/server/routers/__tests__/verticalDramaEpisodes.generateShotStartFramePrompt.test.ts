/**
 * Vertical Drama — per-shot start-frame prompt mutation
 * (`generateShotStartFramePrompt`, planning/`polished-toasting-gadget.md`
 * Fix A) unit coverage.
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as
 * `verticalDramaEpisodes.generateShotVideoPrompt.test.ts` (this procedure's
 * own established sibling/precedent) — the router's `mutation`/`query` mock
 * passes the raw handler function through unchanged.
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
  getStaticModelById: vi.fn(() => undefined),
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

// `generateShotVideoPrompt`/`regenerateClipDialogue` (unrelated procedures in
// the same router file) statically import from this module — mocked away
// wholesale (same "avoid the `adminProcedure` chain" reasoning as every
// other mock in this file) since none of this file's tests exercise those
// procedures.
vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt: vi.fn(),
  generateVerticalDramaShotVideoPromptSpeakerSwitch: vi.fn(),
  generateVerticalDramaClipDialogue: vi.fn(),
  appendPresetVisualIdentityStyleTokensToMotionPrompt: vi.fn((prompt: string) => prompt),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
}));

// `generateShotStartFramePrompt` dynamically imports this module (mirrors
// how `repairShotImage`/`generateStartFrameAngleVariations` dynamically
// import `verticalDramaShotImageAction.ts` — same "transitively reaches
// `enabledLlmModels.ts` -> `adminProcedure`" reasoning documented at this
// router file's own top-of-file import comment for
// `verticalDramaStartFrameGeneration.ts`). Mocked wholesale here since THIS
// file's tests DO exercise that dynamic-import call site (unlike
// `generateShotVideoPrompt.test.ts`, which never needs this mock).
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
  // RC3 fix (`planning/vd-start-frame-reference-mapping/plan.md` Phase 2) —
  // thrown by the (mocked) service when a corrective retry still leaves an
  // explicit "Image N" contradiction; the router must map this to
  // PRECONDITION_FAILED (see the test below).
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
vi.mock("../../services/verticalDramaSceneContinuityLock", () => ({
  resolveShotSceneContinuityLock: vi.fn(async () => ({})),
}));

// `verticalDramaEpisodes.ts` imports `ensurePromptWithinLimit` from
// `verticalDramaPromptQc.ts`, which itself imports `verticalDramaStoryBible.ts`
// -> `enabledLlmModels.ts` -> `llmProviders.ts` (which needs `adminProcedure`,
// not exported by this file's `../../_core/trpc` mock above). Mock the QC
// module directly (pass-through: returns the prompt unchanged) so that
// unrelated import chain never loads.
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

// Part B3 (planning/`polished-toasting-gadget.md`) — `generateShotVideoPrompt`
// (an unrelated procedure in the same router file) resolves the episode
// plan-context block via a dynamic `import()` of `verticalDramaStoryBible.ts`.
// Mocked directly (same "avoid the `adminProcedure` chain" reasoning as every
// other mock in this file above); this file's own tests never trigger that
// dynamic import (`generateShotStartFramePrompt` doesn't use it), but the
// mock still needs to exist for the router module to resolve if anything else
// in the file statically referenced it.
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
    // `.for("update")` — row-lock modifier used by the transaction re-read.
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

/**
 * `generateShotStartFramePrompt` (verticalDramaEpisodes.ts ~:12793) resolves
 * the TARGET shot's own `frame.approvedMediaAssetId` into a vision-ready URL
 * via a dedicated `resolveMediaAssetUrlsByIds` `media_assets` lookup — the
 * LAST `db.select` call before the (mocked) `generateStartFrameShotPrompt`
 * service call. Every test whose target frame carries `approvedMediaAssetId`
 * (the fixtures below use "900") must provision this as the final entry in
 * its `mockDb.select` chain, matching the `{ id, originalUrl }` shape
 * `resolveMediaAssetUrlsByIds` selects — otherwise the real (unmocked) call
 * falls through to `.from` on `undefined`.
 */
function approvedMediaAssetSelectChain(assetId = 900) {
  return selectChain([
    { id: assetId, originalUrl: `https://cdn.example.test/media/${assetId}.png` },
  ]);
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
          approvedMediaAssetId: "900",
        },
        {
          shotNumber: 2,
          imagePrompt: "sibling shot, untouched",
          negativePrompt: "sibling negative",
          requiredCharacterRefs: ["hero"],
          productReferenceAssetIds: ["prod-asset-1"],
          approvedMediaAssetId: "901",
          productRefsCustomized: true,
        },
      ],
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default transaction stub: `tx.select` resolves to an empty row (so the
  // merge falls back to the outer `plan` snapshot captured near the top of
  // the request — i.e. byte-identical to every test's fixture below unless a
  // test explicitly overrides this to prove the row-lock re-read is honored).
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
});

describe("generateShotStartFramePrompt", () => {
  it("passes the nearest same-scene neighbor into prompt vision and records anchor provenance", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [] },
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
            locationKey: "loc_store",
          },
          {
            shotNumber: 2,
            imagePrompt: "second shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            locationKey: "loc_store",
          },
        ],
      },
    });
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSceneContinuity: true,
      verticalDramaSceneNeighborAnchors: true,
    });
    mockGenerateStartFrameShotPrompt.mockResolvedValueOnce({
      prompt: "regenerated start-frame prompt",
      negativePrompt: "regenerated negative prompt",
      creditsUsed: 4,
      model: "gpt-image-2-planner",
      sceneAnchorAttached: true,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }])) // loadSeriesTargetAudienceRegion
      .mockReturnValueOnce(selectChain([])) // current shot location roster lookup
      .mockReturnValueOnce(
        selectChain([{ id: 901, originalUrl: "https://cdn.example.com/shot-1.png" }]),
      ); // neighbor anchor URL lookup
    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((value: any) => {
        capturedSet = value;
        return updateChain([episodeRow]);
      }),
    });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 2 },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneContinuityEnabled: true,
        sceneAnchorImage: {
          url: "https://cdn.example.com/shot-1.png",
          anchorShotNumber: 1,
        },
      }),
    );
    expect(capturedSet.startFramePlan.frames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          shotNumber: 2,
          sceneAnchor: expect.objectContaining({
            anchorShotNumber: 1,
            mediaAssetId: 901,
            source: "approved",
          }),
        }),
      ]),
    );
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "vd_scene_neighbor_anchor_attached",
        metadata: expect.objectContaining({
          shotNumber: 2,
          anchorShotNumber: 1,
          source: "approved",
          layer: "prompt",
          dropped: false,
        }),
      }),
    );
  });

  it("records a cap drop when prompt authoring cannot attach the resolved anchor", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: { distinct_locations: [] },
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
            locationKey: "loc_store",
          },
          {
            shotNumber: 2,
            imagePrompt: "second shot",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            locationKey: "loc_store",
          },
        ],
      },
    });
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSceneContinuity: true,
      verticalDramaSceneNeighborAnchors: true,
    });
    mockGenerateStartFrameShotPrompt.mockResolvedValueOnce({
      prompt: "regenerated start-frame prompt",
      negativePrompt: "regenerated negative prompt",
      creditsUsed: 4,
      model: "gpt-image-2-planner",
      sceneAnchorAttached: false,
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(
        selectChain([{ id: 901, originalUrl: "https://cdn.example.com/shot-1.png" }]),
      );
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 2 },
    });

    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "vd_scene_neighbor_anchor_attached",
        metadata: expect.objectContaining({
          layer: "prompt",
          dropped: true,
          dropReason: "cap",
        }),
      }),
    );
  });

  it("threads the selected image model prompt budget through authoring and QC", async () => {
    const episodeRow = baseEpisodeRow();
    mockGetModelsByTypeAsync.mockResolvedValue([{
      id: "google-nano-banana-pro",
      name: "Google Nano Banana Pro",
      provider: "kie.ai",
      configJson: { maxPromptLength: 20_000 },
    }]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain());
    mockDb.update.mockReturnValueOnce({
      set: vi.fn(() => updateChain([episodeRow])),
    });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "make the lighting brighter",
      },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ imagePromptMaxChars: 20_000 }),
    );
    expect(mockEnsurePromptWithinLimit).toHaveBeenCalledWith(
      expect.objectContaining({ maxChars: 20_000 }),
    );
  });

  it("creates a minimal per-shot frame when no start-frame plan exists, without running the whole-episode planning stage", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: null,
      storyboard: {
        shots: [
          {
            shot_number: 1,
            required_character_refs: [],
          },
        ],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: null }])); // loadSeriesTargetAudienceRegion

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((value: any) => {
        capturedSet = value;
        return updateChain([episodeRow]);
      }),
    });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        canonicalShotSummary: "The hero reaches the rain-soaked cafe.",
      },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledOnce();
    expect(capturedSet.startFramePlan).toMatchObject({
      mode: "single_frame_per_shot",
      selectedImageModelId: "",
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "regenerated start-frame prompt",
          negativePrompt: "regenerated negative prompt",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
          canonicalShotSummary: "The hero reaches the rain-soaked cafe.",
        },
      ],
    });
  });

  it("adds only the missing shot frame to an existing plan and preserves sibling frames", async () => {
    const episodeRow = baseEpisodeRow({
      storyboard: {
        shots: [{ shot_number: 9, required_character_refs: [] }],
      },
    });
    const originalFrames = episodeRow.startFramePlan.frames;
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: null }])); // loadSeriesTargetAudienceRegion

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((value: any) => {
        capturedSet = value;
        return updateChain([episodeRow]);
      }),
    });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 9,
        instruction: "Create this shot prompt from its storyboard facts.",
      },
    });

    expect(capturedSet.startFramePlan.frames).toHaveLength(3);
    expect(capturedSet.startFramePlan.frames[0]).toBe(originalFrames[0]);
    expect(capturedSet.startFramePlan.frames[1]).toBe(originalFrames[1]);
    expect(capturedSet.startFramePlan.frames[2]).toMatchObject({
      shotNumber: 9,
      imagePrompt: "regenerated start-frame prompt",
      negativePrompt: "regenerated negative prompt",
      requiredCharacterRefs: [],
      productReferenceAssetIds: [],
    });
  });

  it("merges a newly materialized shot into the fresh row-locked plan created by a concurrent per-shot request", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: null,
      storyboard: { shots: [{ shot_number: 1, required_character_refs: [] }] },
    });
    const concurrentPlan = {
      mode: "single_frame_per_shot" as const,
      selectedImageModelId: "google-nano-banana-pro",
      frames: [
        {
          shotNumber: 2,
          imagePrompt: "concurrent shot 2 prompt",
          negativePrompt: "",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
        },
      ],
    };
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]));

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((value: any) => {
        capturedSet = value;
        return updateChain([episodeRow]);
      }),
    });
    mockDb.transaction.mockImplementationOnce(
      async (fn: (tx: unknown) => unknown) => {
        const tx = {
          select: () => selectChain([{ startFramePlan: concurrentPlan }]),
          update: (...args: unknown[]) => (mockDb.update as any)(...args),
        };
        return fn(tx);
      }
    );

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(capturedSet.startFramePlan.selectedImageModelId).toBe(
      "google-nano-banana-pro"
    );
    expect(capturedSet.startFramePlan.frames).toEqual([
      expect.objectContaining({
        shotNumber: 1,
        imagePrompt: "regenerated start-frame prompt",
      }),
      concurrentPlan.frames[0],
    ]);
  });

  it("happy path: persists prompt+negative prompt onto ONLY the target shot's frame; every sibling frame stays the exact same object reference", async () => {
    const episodeRow = baseEpisodeRow();
    const originalSiblingFrame = episodeRow.startFramePlan.frames[1];

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: null }])) // loadSeriesTargetAudienceRegion
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")
    // Shot 1 (the target) has empty requiredCharacterRefs/productReferenceAssetIds,
    // so loadSeriesProductTieInFacts/resolveShotCharacterIdentitySources/
    // resolveShotCharacterReferenceEntries all short-circuit with no DB call.

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "make the lighting brighter",
      },
    });

    expect(result).toEqual({
      prompt: "regenerated start-frame prompt",
      negativePrompt: "regenerated negative prompt",
      creditsUsed: 4,
      // The procedure's own return statement always includes these two
      // (two-mode start-frame image prompt switch stamp) — `false`/
      // `undefined` here because this test's `mockGenerateStartFrameShotPrompt`
      // resolved value (set in `beforeEach`) carries neither `usedVision` nor
      // `frameStamp`.
      usedVision: false,
      promptMode: undefined,
    });

    const updatedFrames = capturedSet.startFramePlan.frames;
    expect(updatedFrames).toHaveLength(2);
    expect(updatedFrames[0]).toMatchObject({
      shotNumber: 1,
      imagePrompt: "regenerated start-frame prompt",
      negativePrompt: "regenerated negative prompt",
      // approvedMediaAssetId must survive untouched (open-question decision,
      // researched — see planning/`polished-toasting-gadget.md`).
      approvedMediaAssetId: "900",
      requiredCharacterRefs: [],
      productReferenceAssetIds: [],
    });
    // The sibling shot's frame object is REFERENCE-EQUAL to the original —
    // never reconstructed, not just deep-equal.
    expect(updatedFrames[1]).toBe(originalSiblingFrame);
    // Top-level plan fields survive untouched.
    expect(capturedSet.startFramePlan.mode).toBe("single_frame_per_shot");
    expect(capturedSet.startFramePlan.selectedImageModelId).toBe(
      "google-nano-banana-pro",
    );
  });

  it("strips a stale identity-lock suffix and threads instruction/region/product-lock/character-reference-manifest into the service call", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt:
              "a hero standing in the rain [Attached character reference images: Image 1 = Hero]",
            negativePrompt: "no blur",
            requiredCharacterRefs: ["hero"],
            productReferenceAssetIds: ["prod-asset-1"],
            approvedMediaAssetId: "900",
          },
        ],
      },
    });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: { targetAudienceRegion: "thai" } }])) // loadSeriesTargetAudienceRegion
      .mockReturnValueOnce(
        selectChain([
          { productTieIn: { productName: "Golden Fish Sauce", productDescription: "amber glass bottle" } },
        ]),
      ) // loadSeriesProductTieInFacts
      .mockReturnValueOnce(
        selectChain([
          { characterKey: "hero", name: "Hero Name", role: "protagonist", data: { description: "a sharp lawyer" } },
        ]),
      ) // resolveShotCharacterIdentitySources
      .mockReturnValueOnce(
        selectChain([{ id: 5, name: "Hero Name", characterKey: "hero" }]),
      ) // resolveShotCharacterReferenceEntries's characterRows query
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    mockGetPrimaryPortraitUrl.mockResolvedValueOnce("https://cdn/hero-portrait.png");

    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "she should look more nervous",
      },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        seriesId: 10,
        episodeId: 100,
        shotNumber: 1,
        instruction: "she should look more nervous",
        currentPrompt: "a hero standing in the rain",
        currentNegativePrompt: "no blur",
        requiredCharacterRefs: ["hero"],
        characters: [
          expect.objectContaining({
            characterKey: "hero",
            name: "Hero Name",
            role: "protagonist",
            description: "a sharp lawyer",
          }),
        ],
        characterReferenceManifest: [
          { index: 1, characterId: null, name: "Hero Name" },
        ],
        targetAudienceRegion: "thai",
        productLock: {
          active: true,
          productName: "Golden Fish Sauce",
          productDescription: "amber glass bottle",
        },
      }),
    );
  });

  it("RC1 fix (planning/vd-start-frame-reference-mapping/plan.md Phase 1): characterReferenceManifest follows frame.requiredCharacterRefs order even when the DB returns character rows in the OPPOSITE order", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "two characters in a standoff",
            negativePrompt: "no blur",
            requiredCharacterRefs: ["hero", "villain"],
            productReferenceAssetIds: [],
            approvedMediaAssetId: "900",
          },
        ],
      },
    });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ bible: null }])) // loadSeriesTargetAudienceRegion
      .mockReturnValueOnce(
        selectChain([
          { characterKey: "hero", name: "Hero Name", role: "protagonist", data: {} },
          { characterKey: "villain", name: "Villain Name", role: "antagonist", data: {} },
        ]),
      ) // resolveShotCharacterIdentitySources
      // `resolveShotCharacterReferenceEntries`'s `characterRows` query has NO
      // `ORDER BY` — Postgres returns the OPPOSITE order from
      // `requiredCharacterRefs` here, the exact scenario RC1 fixes.
      .mockReturnValueOnce(
        selectChain([
          { id: 2, name: "Villain Name", characterKey: "villain" },
          { id: 1, name: "Hero Name", characterKey: "hero" },
        ]),
      )
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce("https://cdn/villain-portrait.png")
      .mockResolvedValueOnce("https://cdn/hero-portrait.png");

    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
    });

    // The manifest handed to the skill must be in `requiredCharacterRefs`
    // order (hero=1, villain=2) — the SAME order the real paid render later
    // attaches reference images in — NOT the DB's own arbitrary row order.
    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        characterReferenceManifest: [
          { index: 1, characterId: null, name: "Hero Name" },
          { index: 2, characterId: null, name: "Villain Name" },
        ],
      }),
    );
  });

  it("maps a VdReferenceMappingError (still-contradictory prompt after one corrective retry) to a PRECONDITION_FAILED TRPCError", async () => {
    mockGenerateStartFrameShotPrompt.mockRejectedValueOnce(
      new MockVdReferenceMappingError("reference mapping still contradicts the manifest", [
        { characterName: "Hero Name", claimedImageIndex: 2, expectedImageIndex: 1 },
      ]),
    );
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    await expect(
      router.generateShotStartFramePrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("maps InsufficientCreditsError to a FORBIDDEN TRPCError", async () => {
    mockGenerateStartFrameShotPrompt.mockRejectedValueOnce(
      new MockInsufficientCreditsError("insufficient credits"),
    );
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    await expect(
      router.generateShotStartFramePrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps VdSchemaValidationError to an INTERNAL_SERVER_ERROR TRPCError", async () => {
    mockGenerateStartFrameShotPrompt.mockRejectedValueOnce(
      new MockVdSchemaValidationError("bad schema", {}),
    );
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    await expect(
      router.generateShotStartFramePrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("maps RateLimitExceededError to a TOO_MANY_REQUESTS TRPCError", async () => {
    mockGenerateStartFrameShotPrompt.mockRejectedValueOnce(
      new MockRateLimitExceededError("slow down"),
    );
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    await expect(
      router.generateShotStartFramePrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
      }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS", message: "slow down" });
  });

  it("maps an unrecognized error to INTERNAL_SERVER_ERROR with its own message", async () => {
    mockGenerateStartFrameShotPrompt.mockRejectedValueOnce(new Error("boom"));
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    await expect(
      router.generateShotStartFramePrompt({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "boom" });
  });

  it("passes idempotencyKey through to the service call", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")
    mockDb.update.mockReturnValueOnce({ set: vi.fn(() => updateChain([episodeRow])) });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "fix it",
        idempotencyKey: "idem-key-abc",
      },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "idem-key-abc" }),
    );
  });

  it("runs the service's returned prompt through ensurePromptWithinLimit before persisting", async () => {
    mockEnsurePromptWithinLimit.mockResolvedValueOnce({
      prompt: "qc-refined prompt",
      refined: true,
      creditsUsed: 1,
      truncated: false,
    });
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([episodeRow]);
      }),
    });

    const result = await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
    });

    expect(result.prompt).toBe("qc-refined prompt");
    expect(capturedSet.startFramePlan.frames[0].imagePrompt).toBe("qc-refined prompt");
  });

  it("2026-07-11-style lost-update race fix: merges against the freshly row-locked plan, not the stale snapshot loaded earlier", async () => {
    const staleEpisodeRow = baseEpisodeRow();
    // What's ACTUALLY in the DB by the time this call reaches its final
    // write — a concurrent call for shot 2 already persisted its own edit.
    const freshPlanFromConcurrentWrite = {
      ...staleEpisodeRow.startFramePlan,
      frames: [
        staleEpisodeRow.startFramePlan.frames[0],
        {
          ...staleEpisodeRow.startFramePlan.frames[1],
          imagePrompt: "shot 2 prompt from a concurrent call",
        },
      ],
    };

    mockDb.select
      .mockReturnValueOnce(selectChain([staleEpisodeRow]))
      .mockReturnValueOnce(selectChain([{ bible: null }]))
      .mockReturnValueOnce(approvedMediaAssetSelectChain()); // resolveMediaAssetUrlsByIds (frame.approvedMediaAssetId "900")

    let capturedSet: any;
    mockDb.update.mockReturnValueOnce({
      set: vi.fn((v: any) => {
        capturedSet = v;
        return updateChain([staleEpisodeRow]);
      }),
    });
    mockDb.transaction.mockImplementationOnce(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        select: () => selectChain([{ startFramePlan: freshPlanFromConcurrentWrite }]),
        update: (...args: unknown[]) => (mockDb.update as any)(...args),
      };
      return fn(tx);
    });

    await router.generateShotStartFramePrompt({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "fix it" },
    });

    // Shot 2's concurrently-persisted edit must survive this write...
    expect(capturedSet.startFramePlan.frames[1]).toMatchObject({
      shotNumber: 2,
      imagePrompt: "shot 2 prompt from a concurrent call",
    });
    // ...alongside this call's own shot-1 update.
    expect(capturedSet.startFramePlan.frames[0]).toMatchObject({
      shotNumber: 1,
      imagePrompt: "regenerated start-frame prompt",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* generateShotReferenceFramePrompt (Phase 6a — user-controlled              */
/* supplementary reference frames, planning/vd-start-frame-reference-mapping/ */
/* plan.md Phase 6)                                                          */
/* -------------------------------------------------------------------------- */

describe("generateShotReferenceFramePrompt", () => {
  it("throws PRECONDITION_FAILED when there is no start-frame plan/frame yet, and never calls the LLM service", async () => {
    const episodeRow = baseEpisodeRow({ startFramePlan: null });
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow])); // loadOwnedEpisode

    await expect(
      router.generateShotReferenceFramePrompt({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          characterKeys: ["hero"],
          instruction: "ไอริณโอบกอดภาคิน",
        },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockGenerateStartFrameShotPrompt).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when a selected characterKey is not in the series roster, and never calls the LLM service", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ characterKey: "hero" }])); // roster query — only "hero" exists

    await expect(
      router.generateShotReferenceFramePrompt({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          characterKeys: ["hero", "ghost-key"],
          instruction: "ไอริณโอบกอดภาคิน",
        },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockGenerateStartFrameShotPrompt).not.toHaveBeenCalled();
  });

  it("builds characterReferenceManifest in the USER'S characterKeys order (not frame.requiredCharacterRefs order), passes referenceFrameMode: true, and never persists onto the episode row", async () => {
    const episodeRow = baseEpisodeRow({
      startFramePlan: {
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-nano-banana-pro",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "two characters in a standoff",
            negativePrompt: "no blur",
            // Deliberately the OPPOSITE order from the user's selection below
            // — the manifest must follow the USER's order, not this.
            requiredCharacterRefs: ["villain", "hero"],
            productReferenceAssetIds: [],
            canonicalShotSummary: "ฉากเผชิญหน้าในซอกตึก",
          },
        ],
      },
    });

    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ characterKey: "hero" }, { characterKey: "villain" }]),
      ) // roster validation query
      .mockReturnValueOnce(
        // resolveShotCharacterReferenceEntries's characterRows query — DB
        // returns rows in yet another (arbitrary) order.
        selectChain([
          { id: 2, name: "Villain Name", characterKey: "villain" },
          { id: 1, name: "Hero Name", characterKey: "hero" },
        ]),
      )
      .mockReturnValueOnce(
        // resolveShotCharacterIdentitySources
        selectChain([
          { characterKey: "hero", name: "Hero Name", role: "protagonist", data: {} },
          { characterKey: "villain", name: "Villain Name", role: "antagonist", data: {} },
        ]),
      );

    mockGetPrimaryPortraitUrl
      .mockResolvedValueOnce("https://cdn/hero-portrait.png")
      .mockResolvedValueOnce("https://cdn/villain-portrait.png");

    const result = await router.generateShotReferenceFramePrompt({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        // User selects hero FIRST, villain second — the opposite of
        // frame.requiredCharacterRefs above.
        characterKeys: ["hero", "villain"],
        instruction: "ไอริณโอบกอดภาคิน",
      },
    });

    expect(mockGenerateStartFrameShotPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        instruction: "ไอริณโอบกอดภาคิน",
        referenceFrameMode: true,
        requiredCharacterRefs: ["hero", "villain"],
        canonicalShotSummary: "ฉากเผชิญหน้าในซอกตึก",
        characterReferenceManifest: [
          { index: 1, characterId: null, name: "Hero Name" },
          { index: 2, characterId: null, name: "Villain Name" },
        ],
      }),
    );
    // Never a speakingOrder fact — Phase 6 design (arbitrary user-directed
    // pose/action, not necessarily this shot's dialogue beat).
    expect(mockGenerateStartFrameShotPrompt).not.toHaveBeenCalledWith(
      expect.objectContaining({ speakingOrder: expect.anything() }),
    );

    expect(result).toEqual({
      prompt: "regenerated start-frame prompt",
      negativePrompt: "regenerated negative prompt",
      creditsUsed: 4,
      model: "gpt-image-planner",
      characterKeys: ["hero", "villain"],
    });

    // MUST NOT write to `startFramePlan.frames[].imagePrompt` — this is a
    // prompt-authoring-only call.
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("maps a VdReferenceMappingError (still-contradictory prompt after one corrective retry) to a PRECONDITION_FAILED TRPCError, and never persists", async () => {
    mockGenerateStartFrameShotPrompt.mockRejectedValueOnce(
      new MockVdReferenceMappingError("reference mapping still contradicts the manifest", [
        { characterName: "Hero Name", claimedImageIndex: 2, expectedImageIndex: 1 },
      ]),
    );
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ characterKey: "hero" }])) // roster validation
      .mockReturnValueOnce(
        selectChain([{ id: 1, name: "Hero Name", characterKey: "hero" }]),
      ) // resolveShotCharacterReferenceEntries's characterRows query
      .mockReturnValueOnce(
        selectChain([
          { characterKey: "hero", name: "Hero Name", role: "protagonist", data: {} },
        ]),
      ); // resolveShotCharacterIdentitySources
    mockGetPrimaryPortraitUrl.mockResolvedValueOnce("https://cdn/hero-portrait.png");

    await expect(
      router.generateShotReferenceFramePrompt({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          characterKeys: ["hero"],
          instruction: "fix it",
        },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });

    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
