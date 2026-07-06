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

const {
  mockGetModelsByTypeAsync,
  mockResolveVerticalDramaCapabilities,
  mockDeriveModelResolutionOptions,
} = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
  mockResolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  })),
  // Default: no resolution options (undefined) — most fixtures in this file
  // don't set configJson.inputFields/supportedResolutions, so
  // `assertResolutionOption` is a no-op unless a test explicitly overrides
  // this mock (storyboard-complete plan Phase 6.2).
  mockDeriveModelResolutionOptions: vi.fn(() => undefined),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  resolveVerticalDramaCapabilities: mockResolveVerticalDramaCapabilities,
  deriveModelResolutionOptions: mockDeriveModelResolutionOptions,
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

const { mockResolveMediaTransport } = vi.hoisted(() => ({
  mockResolveMediaTransport: vi.fn(),
}));
vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: mockResolveMediaTransport,
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

vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt: vi.fn(),
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
import { mediaGenerationService } from "../../services/mediaGenerationService";
import { hasEnoughCredits, deductCredits, refundCredits } from "../../services/creditService";
import { calculateCreditCost } from "../../services/pricingCalculator";
import { formatVideoClipRequest } from "../../services/verticalDramaVideoPromptFormatter";

const router = verticalDramaEpisodesRouter as unknown as Record<string, Function>;
const mockGenerateVideoAsync = vi.mocked(mediaGenerationService.generateVideoAsync);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockRefundCredits = vi.mocked(refundCredits);
const mockCalculateCreditCost = vi.mocked(calculateCreditCost);
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
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
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
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockRunVerticalDramaEpisodeQualityReview.mockRejectedValue(
      new MockInsufficientCreditsError("not enough credits"),
    );

    await expect(
      router.runEpisodeQualityReview({ ctx: ctx(), input: { seriesId: "10", episodeId: "100" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps RateLimitExceededError to TOO_MANY_REQUESTS", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockRunVerticalDramaEpisodeQualityReview.mockRejectedValue(
      new MockRateLimitExceededError("slow down"),
    );

    await expect(
      router.runEpisodeQualityReview({ ctx: ctx(), input: { seriesId: "10", episodeId: "100" } }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("forwards idempotencyKey through to runVerticalDramaEpisodeQualityReview (T2)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
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

  it("skips hasEnoughCredits/deductCredits for a zero-cost model (e.g. Higgsfield/Magnific MCP) and still submits generation", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "higgsfield/nano_banana_2", type: "video", isEnabled: true, creditCost: 0, aliases: [], configJson: {} },
    ]);
    mockShotReferencesService.listForShot.mockResolvedValue([]);
    // `generateVideoClip` now prices via `calculateCreditCost` (storyboard-
    // complete plan Phase 6.2b — resolution-tiered pricing), same convention
    // as the image mutations; override the global mock's default 10 for
    // this one call so the zero-cost model still prices to 0.
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithPack({ /* keep default clip shape */ })]),
      ) // loadOwnedEpisode — uses the default "veo-3-1" selection from episodeRowWithPack
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])); // pricing lookup — zero-cost model

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    expect(result.creditCost).toBe(0);
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateVideoAsync).toHaveBeenCalled();
  });

  it("does not call refundCredits on submit failure for a zero-cost model", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([]);
    // See the matching comment in the previous test — override the default
    // mocked 10 so this zero-cost model still prices to 0.
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])); // pricing lookup — zero-cost model
    mockGenerateVideoAsync.mockRejectedValueOnce(new Error("submit failed"));

    await expect(
      router.generateVideoClip({ ctx: ctx(), input: { seriesId: "10", episodeId: "100", clipNumber: 1 } }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
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
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, idempotencyKey: "av-key-1" },
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "av-key-1" }),
    );
  });

  it("generateStartFrameImage skips hasEnoughCredits/deductCredits for a zero-cost model and still submits generation", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])); // pricing lookup — zero-cost model
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "task-1" });

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(result.creditCost).toBe(0);
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameImage does not call refundCredits on submit failure for a zero-cost model", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])); // pricing lookup — zero-cost model
    mediaGenerationService.generateImageAsync = vi.fn().mockRejectedValue(new Error("submit failed"));

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameAngleVariations skips hasEnoughCredits/deductCredits for a zero-cost model and still submits generation", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])) // pricing lookup — zero-cost model
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "task-1" });

    const result = await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(result.creditCost).toBe(0);
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameImage builds transportMetadata.transport === \"mcp\" for an MCP-transport model (e.g. higgsfield/nano_banana_2) and forwards it to generateImageAsync", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0); // MCP models are zero-cost (billed via MCP subscription)
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "higgsfield/nano_banana_2", type: "image", isEnabled: true, aliases: [], configJson: {} },
    ]);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...episodeRowWithStartFramePlan(),
            startFramePlan: {
              selectedImageModelId: "higgsfield/nano_banana_2",
              frames: [{ shotNumber: 1, imagePrompt: "a prompt", requiredCharacterRefs: [] }],
            },
          },
        ]),
      ) // loadOwnedEpisode — episode-level selection resolves to the MCP model
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: {} }])); // pricing lookup — zero-cost MCP model
    const mcpMetadata = {
      transport: "mcp",
      originSurface: "media_studio",
      assetType: "image",
      providerKey: "higgsfield",
      connectionId: "conn-1",
      creditPolicy: "provider_credits_tracked",
    };
    mockResolveMediaTransport.mockResolvedValue(mcpMetadata);
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "mcp-task-1" });

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, mcpConnectionId: "conn-1" },
    });

    expect(result.taskId).toBe("mcp-task-1");
    expect(mockResolveMediaTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorUserId: 42,
        assetType: "image",
        requestedTransport: "mcp",
        mcpConnectionId: "conn-1",
        providerKey: "higgsfield",
      }),
    );
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        transportMetadata: expect.objectContaining({ transport: "mcp" }),
      }),
      expect.any(String),
    );
    // Zero-cost MCP model — credit reserve/refund cycle still skipped.
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameImage throws BAD_REQUEST for an MCP-transport model when no mcpConnectionId is provided (fails closed instead of dispatching to the wrong provider)", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "higgsfield/nano_banana_2", type: "image", isEnabled: true, aliases: [], configJson: {} },
    ]);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...episodeRowWithStartFramePlan(),
            startFramePlan: {
              selectedImageModelId: "higgsfield/nano_banana_2",
              frames: [{ shotNumber: 1, imagePrompt: "a prompt", requiredCharacterRefs: [] }],
            },
          },
        ]),
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: {} }])); // pricing lookup

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockResolveMediaTransport).not.toHaveBeenCalled();
    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
  });
});

describe("resolution validation + pricing (Phase 6.2)", () => {
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
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "task-1" });
  });

  it("generateStartFrameImage passes a valid resolution through to generateImageAsync and calculateCreditCost", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce([
      { value: "720p", label: "720p", creditCost: 150 },
      { value: "1080p", label: "1080p", creditCost: 300 },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 150, configJson: { pricingFormula: "matrix" } }])); // pricing lookup

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, resolution: "1080p" },
    });

    expect(mockCalculateCreditCost).toHaveBeenCalledWith(
      expect.objectContaining({ creditCost: 150 }),
      expect.objectContaining({ resolution: "1080p" }),
    );
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: "1080p" }),
      expect.any(String),
    );
  });

  it("generateStartFrameImage rejects an invalid resolution with BAD_REQUEST when the model has known resolutionOptions", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce([
      { value: "720p", label: "720p" },
      { value: "1080p", label: "1080p" },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 150, configJson: {} }])); // pricing lookup

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, resolution: "8K" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameImage ignores a supplied resolution (no validation error) when the model has no resolution options at all", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce(undefined);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])); // pricing lookup

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, resolution: "anything" },
    });

    expect(result.taskId).toBe("task-1");
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: "anything" }),
      expect.any(String),
    );
  });

  it("generateStartFrameAngleVariations rejects an invalid resolution with BAD_REQUEST", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce([{ value: "720p", label: "720p" }]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await expect(
      router.generateStartFrameAngleVariations({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, resolution: "invalid" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("no burned-in text in the 3x3 multi-angle grid prompt (Phase 6.3)", () => {
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
            negativePrompt: "blurry",
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
    mockDeriveModelResolutionOptions.mockReturnValue(undefined);
  });

  it("instructs no text/captions/labels/watermarks anywhere in the image, both in the prompt and the negative prompt", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const call = (mediaGenerationService.generateImageAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];

    // Prompt must explicitly forbid on-image text and must NOT phrase angle
    // names as something to render as a label (still lists example angle
    // names for diversity, but the "no text" instruction must be present and
    // unambiguous).
    expect(call.prompt).toMatch(/no text/i);
    expect(call.prompt).toMatch(/caption/i);
    expect(call.prompt).toMatch(/watermark/i);
    expect(call.prompt).toMatch(/3x3 grid of 9 panels/i);

    // Negative prompt must also enforce it (defense in depth), while still
    // preserving the shot's own negativePrompt.
    expect(call.negativePrompt).toMatch(/blurry/);
    expect(call.negativePrompt).toMatch(/text/i);
    expect(call.negativePrompt).toMatch(/caption/i);
    expect(call.negativePrompt).toMatch(/watermark/i);
  });

  it("still includes negative-prompt no-text terms even when the shot has no negativePrompt of its own", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithStartFramePlan({ negativePrompt: undefined })]),
      )
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }]))
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    const call = (mediaGenerationService.generateImageAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.negativePrompt).toMatch(/text/i);
  });
});

describe("repairShotImage (Phase 6.5)", () => {
  function episodeRowWithApprovedAsset(frameOverrides: Record<string, unknown> = {}) {
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
            requiredCharacterRefs: [],
            approvedMediaAssetId: "900",
            ...frameOverrides,
          },
        ],
      },
    };
  }

  beforeEach(() => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockDeriveModelResolutionOptions.mockReturnValue(undefined);
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "google-nano-banana-pro", type: "image", isEnabled: true, name: "Google Nano Banana Pro", aliases: [], configJson: {} },
    ]);
  });

  it("throws PRECONDITION_FAILED when the shot has no startFramePlan yet", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: 100, tenantId: "tenant-1", userId: 42, seriesId: 10, startFramePlan: null }]));

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "change the jacket to red" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws PRECONDITION_FAILED when the shot has no approvedMediaAssetId yet", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([episodeRowWithApprovedAsset({ approvedMediaAssetId: undefined })]),
    );

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "change the jacket to red" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws PRECONDITION_FAILED when the approved asset URL cannot be resolved (deleted/inaccessible)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])); // resolveMediaAssetUrlsByIds — no matching row

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "change the jacket to red" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws PRECONDITION_FAILED listing capable models when the resolved model does not accept image input", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: false,
      maxReferenceImages: 0,
      nativeAudioDialogue: false,
      verticalDramaReady: false,
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "z-image", type: "image", isEnabled: true, name: "Z-Image (no i2i)", aliases: [], configJson: {} },
      { id: "google-nano-banana-pro", type: "image", isEnabled: true, name: "Google Nano Banana Pro", aliases: [], configJson: {} },
    ]);
    // First call (guard check on the resolved model) -> not capable.
    // Second call (building the capable-models list) -> nano banana pro IS capable.
    mockResolveVerticalDramaCapabilities
      .mockReturnValueOnce({ supportsStartFrame: false, maxReferenceImages: 0, nativeAudioDialogue: false, verticalDramaReady: false })
      .mockReturnValueOnce({ supportsStartFrame: false, maxReferenceImages: 0, nativeAudioDialogue: false, verticalDramaReady: false })
      .mockReturnValueOnce({ supportsStartFrame: true, maxReferenceImages: 3, nativeAudioDialogue: false, verticalDramaReady: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "change the jacket to red" },
      }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Google Nano Banana Pro"),
    });
    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
  });

  it("submits an image-to-image edit with the current image as the sole reference, a preservation directive, and reserves credits", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi.fn().mockResolvedValue({ id: "repair-task-1" });

    const result = await router.repairShotImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "change the jacket to red",
        idempotencyKey: "repair-key-1",
      },
    });

    expect(result).toEqual({ taskId: "repair-task-1", modelId: "google-nano-banana-pro", creditCost: 10 });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "repair-key-1", amount: 10 }),
    );
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: ["https://cdn/900.png"],
        prompt: expect.stringContaining("change the jacket to red"),
      }),
      expect.any(String),
    );
    const call = (mediaGenerationService.generateImageAsync as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // Repair prompt now uses the standardized two-tier character-lock
    // instruction (2026-07-06 prompt-safety upgrade) instead of an inline
    // "same character identity" sentence.
    expect(call.prompt).toMatch(/CHARACTER IDENTITY LOCK/i);
    expect(call.prompt).toMatch(/PERSISTENT/);
    expect(call.prompt).toMatch(/VARIABLE/);
  });

  it("refunds credits when generation submission fails", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi.fn().mockRejectedValue(new Error("submit failed"));

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1, instruction: "change the jacket to red" },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockRefundCredits).toHaveBeenCalled();
  });

  it("rejects an invalid resolution with BAD_REQUEST before submitting", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce([{ value: "1K", label: "1K" }]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          instruction: "change the jacket to red",
          resolution: "4K",
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
  });
});
