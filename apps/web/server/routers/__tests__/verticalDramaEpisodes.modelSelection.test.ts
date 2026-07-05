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

import {
  assertModelSelectable,
  resolveEpisodeImageModelId,
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

describe("resolveEpisodeImageModelId — resolution order (episode selection -> DEFAULT_MODELS)", () => {
  beforeEach(() => {
    mockGetModelsByTypeAsync.mockReset();
  });

  it("returns DEFAULT_MODELS.image when the plan has no selection yet", async () => {
    const resolved = await resolveEpisodeImageModelId(null);
    expect(resolved).toBe("google-nano-banana-pro");
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

  it("falls back to DEFAULT_MODELS.image when the episode's selected model no longer exists", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "some-other-model", type: "image", isEnabled: true },
    ]);
    const resolved = await resolveEpisodeImageModelId({
      mode: "single_frame_per_shot",
      selectedImageModelId: "deleted-model",
      frames: [],
    } as any);
    expect(resolved).toBe("google-nano-banana-pro");
  });

  it("falls back to DEFAULT_MODELS.image when the episode's selected model is disabled (fails closed)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      { id: "google-banana-2-lite", type: "image", isEnabled: false },
    ]);
    const resolved = await resolveEpisodeImageModelId({
      mode: "single_frame_per_shot",
      selectedImageModelId: "google-banana-2-lite",
      frames: [],
    } as any);
    expect(resolved).toBe("google-nano-banana-pro");
  });
});
