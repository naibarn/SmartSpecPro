/**
 * Vertical Drama Storyboard Completion Plan — Wave 2 backend integration unit
 * coverage for `verticalDramaEpisodes.ts`'s new procedures:
 *  - `listShotReferences` / `linkShotReference` / `deleteShotReference` /
 *    `reorderShotReferences` (Phase 2.2 — thin tRPC wrappers over
 *    `verticalDramaShotReferencesService`)
 *  - `runEpisodeQualityReview` (Phase 3B.5 — runs the quality-review skill
 *    and persists the scorecard via the existing run/artifact ledger tables)
 *  - `getEpisodeDetail`'s new `qualityReview` field
 *
 * Also covers `generateVideoClip`'s reference-image trimming (Phase 2.6):
 * shot references beyond the resolved video model's `maxReferenceImages` are
 * trimmed by `sortOrder` (lowest kept first) and the trimmed count is always
 * reported back, never silently dropped.
 *
 * Same "mock the whole module graph, test the exported procedure handlers
 * directly" convention as `verticalDramaEpisodes.modelSelection.test.ts` —
 * the router's `mutation`/`query` mock passes the raw handler function
 * through unchanged, so each procedure can be invoked directly as
 * `router.someProcedure({ ctx, input })`.
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

vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
  verticalDramaEpisodePipeline: {},
  VerticalDramaEpisodePipeline: class {},
  VERTICAL_DRAMA_PIPELINE_STAGES: ["plan_episode_script"],
  VERTICAL_DRAMA_RUNNER_MODES: ["dry_run", "full"],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
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

const { mockShotReferencesService, MockVerticalDramaShotReferenceError } = vi.hoisted(() => {
  class MockVerticalDramaShotReferenceError extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.name = "VerticalDramaShotReferenceError";
      this.reason = reason;
    }
  }
  return {
    mockShotReferencesService: {
      listForEpisode: vi.fn(),
      listForShot: vi.fn(),
      linkReference: vi.fn(),
      deleteReference: vi.fn(),
      reorder: vi.fn(),
    },
    MockVerticalDramaShotReferenceError,
  };
});

vi.mock("../../services/verticalDramaShotReferences", () => ({
  verticalDramaShotReferencesService: mockShotReferencesService,
  VerticalDramaShotReferenceError: MockVerticalDramaShotReferenceError,
}));

const {
  mockRunVerticalDramaEpisodeQualityReview,
  MockInsufficientCreditsError,
  MockVdSchemaValidationError,
  MockRateLimitExceededError,
} = vi.hoisted(() => ({
  mockRunVerticalDramaEpisodeQualityReview: vi.fn(),
  MockInsufficientCreditsError: class extends Error {},
  MockVdSchemaValidationError: class extends Error {},
  MockRateLimitExceededError: class extends Error {},
}));

vi.mock("../../services/verticalDramaEpisodeQualityReview", () => ({
  runVerticalDramaEpisodeQualityReview: mockRunVerticalDramaEpisodeQualityReview,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
  RateLimitExceededError: MockRateLimitExceededError,
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

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";
import { mediaGenerationService } from "../../services/mediaGenerationService";
import { hasEnoughCredits, deductCredits } from "../../services/creditService";
import { formatVideoClipRequest } from "../../services/verticalDramaVideoPromptFormatter";

const router = verticalDramaEpisodesRouter as unknown as Record<string, Function>;
const mockGenerateVideoAsync = vi.mocked(mediaGenerationService.generateVideoAsync);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockFormatVideoClipRequest = vi.mocked(formatVideoClipRequest);

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

function insertChain(returned: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listShotReferences", () => {
  it("returns the manifest from the shot references service", async () => {
    const manifest = { 1: [{ referenceId: "7" }] };
    mockShotReferencesService.listForEpisode.mockResolvedValue(manifest);

    const result = await router.listShotReferences({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result).toEqual({ references: manifest });
    expect(mockShotReferencesService.listForEpisode).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      100,
    );
  });

  it("maps episode_not_found to NOT_FOUND", async () => {
    mockShotReferencesService.listForEpisode.mockRejectedValue(
      new MockVerticalDramaShotReferenceError("episode_not_found", "Episode not found"),
    );

    await expect(
      router.listShotReferences({ ctx: ctx(), input: { seriesId: "10", episodeId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a non-integer episodeId with BAD_REQUEST (parseId integer guard, T4)", async () => {
    await expect(
      router.listShotReferences({ ctx: ctx(), input: { seriesId: "10", episodeId: "100.5" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockShotReferencesService.listForEpisode).not.toHaveBeenCalled();
  });

  it("rejects a non-integer seriesId with BAD_REQUEST (parseId integer guard, T4)", async () => {
    await expect(
      router.listShotReferences({ ctx: ctx(), input: { seriesId: "10.9", episodeId: "100" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockShotReferencesService.listForEpisode).not.toHaveBeenCalled();
  });
});

describe("linkShotReference", () => {
  it("parses string ids and forwards to the service", async () => {
    const reference = { referenceId: "7", shotNumber: 3 };
    mockShotReferencesService.linkReference.mockResolvedValue(reference);

    const result = await router.linkShotReference({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 3,
        mediaAssetId: "500",
        source: "grid_cut",
      },
    });

    expect(result).toEqual({ reference });
    expect(mockShotReferencesService.linkReference).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeId: 100,
      shotNumber: 3,
      mediaAssetId: 500,
      role: undefined,
      source: "grid_cut",
      sortOrder: undefined,
    });
  });

  it("maps media_asset_cross_tenant to NOT_FOUND (never discloses cross-tenant existence)", async () => {
    mockShotReferencesService.linkReference.mockRejectedValue(
      new MockVerticalDramaShotReferenceError("media_asset_cross_tenant", "cross tenant"),
    );

    await expect(
      router.linkShotReference({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, mediaAssetId: "500", source: "upload" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps media_asset_deleted to BAD_REQUEST", async () => {
    mockShotReferencesService.linkReference.mockRejectedValue(
      new MockVerticalDramaShotReferenceError("media_asset_deleted", "deleted"),
    );

    await expect(
      router.linkShotReference({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, mediaAssetId: "500", source: "upload" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("deleteShotReference", () => {
  it("deletes via the service and returns { deleted: true }", async () => {
    mockShotReferencesService.deleteReference.mockResolvedValue(undefined);

    const result = await router.deleteShotReference({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", referenceId: "7" },
    });

    expect(result).toEqual({ deleted: true });
    expect(mockShotReferencesService.deleteReference).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      7,
    );
  });

  it("maps reference_not_found to NOT_FOUND", async () => {
    mockShotReferencesService.deleteReference.mockRejectedValue(
      new MockVerticalDramaShotReferenceError("reference_not_found", "not found"),
    );

    await expect(
      router.deleteShotReference({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", referenceId: "999" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("reorderShotReferences", () => {
  it("parses ordered reference ids and forwards to the service", async () => {
    const references = [{ referenceId: "2" }, { referenceId: "1" }];
    mockShotReferencesService.reorder.mockResolvedValue(references);

    const result = await router.reorderShotReferences({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 3,
        orderedReferenceIds: ["2", "1"],
      },
    });

    expect(result).toEqual({ references });
    expect(mockShotReferencesService.reorder).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeId: 100,
      shotNumber: 3,
      orderedReferenceIds: [2, 1],
    });
  });
});

describe("runEpisodeQualityReview", () => {
  function episodeRow(over: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeNumber: 1,
      title: "Episode 1",
      script: { episode_title: "Episode 1" },
      storyboard: { shots: [] },
      dialogueAudioPlan: null,
      ...over,
    };
  }

  it("throws PRECONDITION_FAILED when the episode has no script/storyboard yet", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow({ script: null })]));

    await expect(
      router.runEpisodeQualityReview({ ctx: ctx(), input: { seriesId: "10", episodeId: "100" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockRunVerticalDramaEpisodeQualityReview).not.toHaveBeenCalled();
  });

  it("runs the review, persists it via the run/artifact ledger tables, and returns the scorecard", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow()]));
    mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
      review: { episode_title: "Episode 1", scorecard: {}, summary: "ok", issues: [], warnings: [], repair_queue: [] },
      creditsUsed: 3,
      model: "gpt-x",
    });
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 555 }])) // verticalDramaEpisodeRuns
      .mockReturnValueOnce(insertChain([{ id: 777 }])); // verticalDramaRunArtifacts
    mockDb.update.mockReturnValueOnce(updateChain([]));

    const result = await router.runEpisodeQualityReview({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.creditsUsed).toBe(3);
    expect(result.review.summary).toBe("ok");
    expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 42, tenantId: "tenant-1", seriesId: 10, episodeId: 100 }),
    );
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it("maps InsufficientCreditsError to FORBIDDEN", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow()]));
    mockRunVerticalDramaEpisodeQualityReview.mockRejectedValue(
      new MockInsufficientCreditsError("not enough credits"),
    );

    await expect(
      router.runEpisodeQualityReview({ ctx: ctx(), input: { seriesId: "10", episodeId: "100" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps RateLimitExceededError to TOO_MANY_REQUESTS", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow()]));
    mockRunVerticalDramaEpisodeQualityReview.mockRejectedValue(
      new MockRateLimitExceededError("slow down"),
    );

    await expect(
      router.runEpisodeQualityReview({ ctx: ctx(), input: { seriesId: "10", episodeId: "100" } }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("forwards idempotencyKey through to runVerticalDramaEpisodeQualityReview (T2)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow()]));
    mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
      review: { episode_title: "Episode 1", scorecard: {}, summary: "ok", issues: [], warnings: [], repair_queue: [] },
      creditsUsed: 3,
      model: "gpt-x",
    });
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 555 }]))
      .mockReturnValueOnce(insertChain([{ id: 777 }]));
    mockDb.update.mockReturnValueOnce(updateChain([]));

    await router.runEpisodeQualityReview({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", idempotencyKey: "qr-key-1" },
    });

    expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "qr-key-1" }),
    );
  });

  it("throws BAD_REQUEST when the combined script/storyboard/dialoguePlan payload is too large (T5)", async () => {
    // A single ~450k character string field pushes the combined
    // JSON.stringify length over the 400_000 char guard.
    const huge = "x".repeat(450_000);
    mockDb.select.mockReturnValueOnce(
      selectChain([episodeRow({ script: { episode_title: "Episode 1", huge } })]),
    );

    await expect(
      router.runEpisodeQualityReview({ ctx: ctx(), input: { seriesId: "10", episodeId: "100" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockRunVerticalDramaEpisodeQualityReview).not.toHaveBeenCalled();
  });
});

describe("getEpisodeDetail — qualityReview field", () => {
  it("returns null when no quality-review artifact has been written yet", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            script: null,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
          },
        ]),
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits character rows
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview -> no artifact yet

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.qualityReview).toBeNull();
  });

  it("returns the latest persisted quality-review artifact payload", async () => {
    const review = { episode_title: "Episode 1", scorecard: {}, summary: "ok", issues: [], warnings: [], repair_queue: [] };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            script: null,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
          },
        ]),
      )
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ jsonPayload: review }]));

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.qualityReview).toEqual(review);
  });
});

describe("generateVideoClip — reference trimming (Phase 2.6)", () => {
  function episodeRowWithPack(clipOverrides: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "clip 1 motion prompt",
            durationSeconds: 8,
            startFrameAssetId: "900",
            ...clipOverrides,
          },
        ],
        warnings: [],
      },
    };
  }

  function shotReference(over: Partial<{ mediaAssetId: string; sortOrder: number }> = {}) {
    return { referenceId: "r", mediaAssetId: "1", sortOrder: 0, ...over };
  }

  beforeEach(() => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "veo-3-1", type: "video", isEnabled: true, creditCost: 50, aliases: [], configJson: {} },
    ]);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockGenerateVideoAsync.mockResolvedValue({ id: "task-1" } as any);
    mockFormatVideoClipRequest.mockReturnValue({
      prompt: "final prompt",
      negativePrompt: undefined,
      providerFamily: "veo",
      nativeAudioDialogue: true,
      generateAudio: true,
      ttsFallback: false,
      ttsLines: [],
      maxReferenceImages: 3,
      supportsStartFrame: true,
    } as any);
  });

  it("throws PRECONDITION_FAILED when the clip has no motion prompt yet", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRowWithPack({ prompt: "" })]));

    await expect(
      router.generateVideoClip({ ctx: ctx(), input: { seriesId: "10", episodeId: "100", clipNumber: 1 } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("keeps all references and reports trimmedReferenceCount 0 when within the model's maxReferenceImages", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([
      shotReference({ mediaAssetId: "1", sortOrder: 0 }),
      shotReference({ mediaAssetId: "2", sortOrder: 1 }),
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([
          { id: 900, originalUrl: "https://cdn/900.png" },
          { id: 1, originalUrl: "https://cdn/1.png" },
          { id: 2, originalUrl: "https://cdn/2.png" },
        ]),
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    expect(result.trimmedReferenceCount).toBe(0);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: ["https://cdn/900.png", "https://cdn/1.png", "https://cdn/2.png"],
      }),
      expect.any(String),
    );
  });

  it("trims references beyond maxReferenceImages by sortOrder (lowest kept first) and reports the trimmed count", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 1,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([
      shotReference({ mediaAssetId: "3", sortOrder: 2 }),
      shotReference({ mediaAssetId: "1", sortOrder: 0 }),
      shotReference({ mediaAssetId: "2", sortOrder: 1 }),
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([
          { id: 900, originalUrl: "https://cdn/900.png" },
          { id: 1, originalUrl: "https://cdn/1.png" },
        ]),
      ) // resolveMediaAssetUrlsByIds — only start frame + the ONE kept reference (id 1, sortOrder 0)
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    // 3 references linked, only 1 fits the model's maxReferenceImages -> 2 trimmed.
    expect(result.trimmedReferenceCount).toBe(2);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: ["https://cdn/900.png", "https://cdn/1.png"],
      }),
      expect.any(String),
    );
  });

  it("sends no referenceImageUrls when the model accepts none (maxReferenceImages 0)", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: false,
      maxReferenceImages: 0,
      nativeAudioDialogue: false,
      verticalDramaReady: false,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([
      shotReference({ mediaAssetId: "1", sortOrder: 0 }),
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // start frame only
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    expect(result.trimmedReferenceCount).toBe(1);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageUrls: ["https://cdn/900.png"] }),
      expect.any(String),
    );
  });

  it("forwards idempotencyKey through to deductCredits (T2)", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1, idempotencyKey: "vc-key-1" },
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "vc-key-1" }),
    );
  });
});

describe("generateStartFrameImage / generateStartFrameAngleVariations — idempotencyKey passthrough (T2)", () => {
  function episodeRowWithStartFramePlan(frameOverrides: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            negativePrompt: undefined,
            requiredCharacterRefs: [],
            ...frameOverrides,
          },
        ],
      },
    };
  }

  beforeEach(() => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
  });

  it("generateStartFrameImage forwards idempotencyKey through to deductCredits", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])); // pricing lookup
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, idempotencyKey: "sf-key-1" },
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "sf-key-1" }),
    );
  });

  it("generateStartFrameAngleVariations forwards idempotencyKey through to deductCredits", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])); // pricing lookup
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, idempotencyKey: "av-key-1" },
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "av-key-1" }),
    );
  });
});
