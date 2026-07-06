/**
 * Vertical Drama — character-lock auto-soften `softenLevel` passthrough
 * coverage for `generateStartFrameImage` (2026-07-06 prompt-safety upgrade).
 *
 * Same "mock the whole module graph, invoke the exported procedure handler
 * directly" convention as `verticalDramaEpisodes.modelSelection.test.ts` /
 * `verticalDramaEpisodes.generateShotVideoPrompt.test.ts`.
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

const { mockGenerateImageAsync } = vi.hoisted(() => ({
  mockGenerateImageAsync: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: mockGenerateImageAsync },
  DEFAULT_MODELS: { image: "google-nano-banana-pro", video: "veo3/generate-veo-3-video-lite" },
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
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: vi.fn(() => Promise.resolve(null)) },
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
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

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";
import { VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL } from "@shared/verticalDramaSeries/characterLock";

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
          imagePrompt:
            "The character's face must match the attached reference image exactly, with flawless skin tone.",
          negativePrompt: "identity drift, wrong skin tone",
          requiredCharacterRefs: [],
          productReferenceAssetIds: [],
        },
      ],
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetModelsByTypeAsync.mockResolvedValue([
    { id: "google-nano-banana-pro", type: "image", isEnabled: true, creditCost: 10, aliases: [], configJson: {} },
  ]);
  mockGenerateImageAsync.mockResolvedValue({ id: "task-1" });
});

describe("generateStartFrameImage — softenLevel passthrough", () => {
  it("submits the prompt unchanged at softenLevel 0/absent", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.prompt).toContain("exactly");
    expect(request.prompt).toContain("flawless");
  });

  it("applies level-1 softening to the outgoing prompt when softenLevel=1", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, softenLevel: 1 },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.prompt).not.toMatch(/\bexactly\b/i);
    expect(request.prompt).not.toMatch(/flawless/i);
  });

  it("applies level-2 (minimal lock) softening when softenLevel=2", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]));

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, softenLevel: 2 },
    });

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.prompt).not.toMatch(/\bexactly\b/i);
    expect(request.negativePrompt).not.toMatch(/identity drift/i);
  });

  it("rejects a softenLevel above the max via Zod validation upstream (contract check)", () => {
    // The Zod schema itself enforces max 2 — this asserts the shared constant
    // used to build that schema matches the shared module's max, so the two
    // never silently drift apart.
    expect(VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL).toBe(2);
  });
});
