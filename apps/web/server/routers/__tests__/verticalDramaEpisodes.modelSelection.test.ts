/**
 * Vertical Drama Storyboard Completion Plan — Phase 1 unit coverage for the
 * episode-level model-selection helpers in `verticalDramaEpisodes.ts`:
 *  - `assertModelSelectable` (used by `setEpisodeModelSelection` to validate
 *    a requested model id/type/enabled state before persisting it)
 *  - `resolveEpisodeImageModelId` (resolution order: episode-level
 *    `startFramePlan.selectedImageModelId` → `DEFAULT_MODELS.image`, used by
 *    `generateStartFrameImage` / `generateStartFrameAngleVariations`)
 *
 * The router file itself has a large module graph (DB, credit service,
 * media generation service, pipeline, provider routing, etc.) — everything
 * except `modelRegistry` is mocked to a minimal no-op shape purely so the
 * module can be imported; none of the mocked services are exercised by
 * these two pure-ish helper functions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetModelsByTypeAsync } = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  isDbModelCatalogLoaded: () => true,
  resolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  })),
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    instance: {},
  },
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
  mediaGenerationService: { generateImageAsync: vi.fn() },
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

import {
  assertModelSelectable,
  resolveEpisodeImageModelId,
  resolveEpisodeVideoModel,
} from "../verticalDramaEpisodes";

function model(overrides: Partial<{ id: string; isEnabled: boolean }> = {}) {
  return { id: "veo-3-1", type: "video", isEnabled: true, ...overrides };
}

describe("assertModelSelectable", () => {
  beforeEach(() => {
    mockGetModelsByTypeAsync.mockReset();
  });

  it("resolves without throwing for an enabled, existing model", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([model({ id: "veo-3-1" })]);
    await expect(assertModelSelectable("veo-3-1", "video")).resolves.toBeUndefined();
    expect(mockGetModelsByTypeAsync).toHaveBeenCalledWith("video");
  });

  it("throws BAD_REQUEST for a model id that doesn't exist in the catalog", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([model({ id: "veo-3-1" })]);
    await expect(assertModelSelectable("does-not-exist", "video")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws BAD_REQUEST for a disabled model", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([model({ id: "veo-3-1", isEnabled: false })]);
    await expect(assertModelSelectable("veo-3-1", "video")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("scopes the lookup to the requested media type — an image model id is not selectable as video", async () => {
    // getModelsByTypeAsync("video") would not include an image-only model id,
    // so the catalog search correctly comes back empty for it.
    mockGetModelsByTypeAsync.mockResolvedValue([model({ id: "veo-3-1" })]);
    await expect(assertModelSelectable("google-nano-banana-pro", "video")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("resolveEpisodeImageModelId — resolution order (fail-closed, requires explicit episode selection)", () => {
  beforeEach(() => {
    mockGetModelsByTypeAsync.mockReset();
  });

  it("throws BAD_REQUEST when the plan has no selection yet (no silent DEFAULT_MODELS fallback)", async () => {
    await expect(resolveEpisodeImageModelId(null)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // Bails out before touching the catalog — nothing to resolve without a selection.
    expect(mockGetModelsByTypeAsync).not.toHaveBeenCalled();
  });

  it("returns the episode's selected model when it exists and is enabled", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "google-banana-2-lite", type: "image", isEnabled: true },
    ]);
    const resolved = await resolveEpisodeImageModelId({
      mode: "single_frame_per_shot",
      selectedImageModelId: "google-banana-2-lite",
      frames: [],
    } as any);
    expect(resolved).toBe("google-banana-2-lite");
  });

  it("throws BAD_REQUEST when the episode's selected model no longer exists (fails closed)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "some-other-model", type: "image", isEnabled: true },
    ]);
    await expect(
      resolveEpisodeImageModelId({
        mode: "single_frame_per_shot",
        selectedImageModelId: "deleted-model",
        frames: [],
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when the episode's selected model is disabled (fails closed)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "google-banana-2-lite", type: "image", isEnabled: false },
    ]);
    await expect(
      resolveEpisodeImageModelId({
        mode: "single_frame_per_shot",
        selectedImageModelId: "google-banana-2-lite",
        frames: [],
      } as any)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

/**
 * Feature 135 — Hermes Grok media worker (section 09, remediation row 9):
 * `resolveEpisodeVideoModel` used to silently fall back to
 * `DEFAULT_MODELS.video` (and even manufacture a synthetic last-resort
 * `ModelDefinition`) when the pack had no selection or the selected model
 * was gone/disabled. These tests encode the FIXED, fail-closed behavior —
 * they replace/invert what would have been "falls back to DEFAULT_MODELS"
 * assertions (this is one of the two remediation suites the zero-regression
 * gate explicitly expects to flip from fallback-assertions to
 * throw-assertions).
 */
describe("resolveEpisodeVideoModel — fail-closed (remediation row 9, no DEFAULT_MODELS.video fallback)", () => {
  beforeEach(() => {
    mockGetModelsByTypeAsync.mockReset();
  });

  it("throws BAD_REQUEST when the pack has no selection yet (DEFAULT_MODELS.video is never consulted)", async () => {
    // The default row EXISTS in the catalog — proves the throw is NOT just
    // an artifact of an empty catalog; the fallback path is truly gone.
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "veo3/generate-veo-3-video-lite", type: "video", isEnabled: true },
    ]);
    await expect(resolveEpisodeVideoModel(null)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockGetModelsByTypeAsync).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for an empty/whitespace selectedVideoModelId (treated as no selection)", async () => {
    await expect(
      resolveEpisodeVideoModel({ selectedVideoModelId: "   " } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when the selected model no longer exists in the catalog (no fallback)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "veo3/generate-veo-3-video-lite", type: "video", isEnabled: true },
    ]);
    await expect(
      resolveEpisodeVideoModel({ selectedVideoModelId: "deleted-model" } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("throws BAD_REQUEST when the selected model is disabled (no fallback)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "veo-3-1", type: "video", isEnabled: false },
    ]);
    await expect(
      resolveEpisodeVideoModel({ selectedVideoModelId: "veo-3-1" } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns the full ModelDefinition for a valid, enabled selection (gateway model — unchanged happy path)", async () => {
    const modelRow = { id: "veo-3-1", type: "video", isEnabled: true, creditCost: 50, aliases: [], configJson: {} };
    mockGetModelsByTypeAsync.mockResolvedValue([modelRow]);
    const resolved = await resolveEpisodeVideoModel({ selectedVideoModelId: "veo-3-1" } as any);
    expect(resolved).toEqual(modelRow);
  });

  it("returns the full ModelDefinition for a valid Hermes-transport selection", async () => {
    const modelRow = {
      id: "hermes-grok/grok-imagine-video",
      type: "video",
      isEnabled: true,
      creditCost: 0,
      aliases: [],
      configJson: { transport: "hermes_worker" },
    };
    mockGetModelsByTypeAsync.mockResolvedValue([modelRow]);
    const resolved = await resolveEpisodeVideoModel({
      selectedVideoModelId: "hermes-grok/grok-imagine-video",
    } as any);
    expect(resolved).toEqual(modelRow);
  });
});
