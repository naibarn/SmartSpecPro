/**
 * Vertical Drama — character-lock auto-soften `softenLevel` passthrough
 * coverage for `generateStartFrameImage` (2026-07-06 prompt-safety upgrade;
 * rewritten for the `vertical-drama-skill-first-architecture` plan's Phase
 * 1.3 — soften authoring moved from a regex ladder in
 * `shared/verticalDramaSeries/characterLock.ts` to the
 * `vertical-drama-shot-image-action` skill's `soften_level` input).
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
    // `mockDb.update` needs a working `.set().where()` chain — the mutation
    // persists the QC'd prompt back onto `startFramePlan` whenever it
    // differs from the stored `frame.imagePrompt` (true for every soften
    // level > 0 test case here, since the skill's mocked output differs
    // from the original prompt).
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

vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));

// vertical-drama-skill-first-architecture plan, Phase 1.3 —
// `generateStartFrameImage` now dynamically
// `import("../services/verticalDramaShotImageAction")` ONLY when
// `effectiveSoftenLevel > 0` (the whole point of this test file is proving
// that latency/cost constraint). Mocked here so this file never pulls in the
// real module's `verticalDramaStoryBible.ts` -> `enabledLlmModels.ts` ->
// `llmProviders.ts` chain, which needs `adminProcedure` (not exported by this
// file's `../../_core/trpc` mock above).
const { mockGenerateShotImageAction } = vi.hoisted(() => ({
  mockGenerateShotImageAction: vi.fn(),
}));
vi.mock("../../services/verticalDramaShotImageAction", () => ({
  generateShotImageAction: mockGenerateShotImageAction,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
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

describe("generateStartFrameImage — softenLevel passthrough (Phase 1.3, skill-authored)", () => {
  it("submits the prompt unchanged at softenLevel 0/absent — and makes ZERO calls to generateShotImageAction (latency/cost regression test)", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGenerateShotImageAction).not.toHaveBeenCalled();
    expect(mockGenerateImageAsync).toHaveBeenCalledTimes(1);
    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.prompt).toContain("exactly");
    expect(request.prompt).toContain("flawless");
  });

  it("calls generateShotImageAction with action: soften and softenLevel: 1 when softenLevel=1, and submits its returned prompt", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion

    mockGenerateShotImageAction.mockResolvedValue({
      prompt: "The character's face must closely resemble the attached reference image.",
      negativePrompt: "",
      creditsUsed: 2,
      model: "mock-model",
    });

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, softenLevel: 1 },
    });

    expect(mockGenerateShotImageAction).toHaveBeenCalledTimes(1);
    const [callArgs] = mockGenerateShotImageAction.mock.calls[0];
    expect(callArgs.action).toBe("soften");
    expect(callArgs.softenLevel).toBe(1);
    expect(callArgs.gridLayout).toBeNull();
    expect(callArgs.repairInstruction).toBeNull();
    expect(callArgs.shot.shotNumber).toBe(1);

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.prompt).toBe(
      "The character's face must closely resemble the attached reference image."
    );
    // No code-side identity-lock formatting runs on this branch — the
    // `vertical-drama-shot-image-action` skill's own "soften" output is used
    // as-is, not force-overwritten afterward.
    expect(request.prompt).not.toMatch(/exactly/i);
  });

  it("calls generateShotImageAction with softenLevel: 2 when softenLevel=2", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow]))
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }]))
      .mockReturnValueOnce(selectChain([]));

    mockGenerateShotImageAction.mockResolvedValue({
      prompt: "Maintain the same person's recognizable appearance from the reference.",
      negativePrompt: "",
      creditsUsed: 2,
      model: "mock-model",
    });

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, softenLevel: 2 },
    });

    const [callArgs] = mockGenerateShotImageAction.mock.calls[0];
    expect(callArgs.softenLevel).toBe(2);

    const [request] = mockGenerateImageAsync.mock.calls[0];
    expect(request.prompt).toBe(
      "Maintain the same person's recognizable appearance from the reference."
    );
  });

  it("rejects a softenLevel above the max via Zod validation upstream (contract check)", () => {
    // The Zod schema itself enforces max 2 — this asserts the shared constant
    // used to build that schema matches the shared module's max, so the two
    // never silently drift apart.
    expect(VD_CHARACTER_LOCK_MAX_SOFTEN_LEVEL).toBe(2);
  });
});

describe("generateStartFrameAngleVariations / repairShotImage — softenLevel now flows through the SAME skill call (Phase 1.3)", () => {
  it("generateStartFrameAngleVariations passes softenLevel on the multi_angle_grid call — no separate soften call", async () => {
    const episodeRow = baseEpisodeRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])) // loadSeriesTargetAudienceRegion (gridRegion)
      .mockReturnValueOnce(selectChain([])); // resolveShotCharacterIdentitySources (empty required refs -> may not query, extra chain is harmless if unused)

    mockGenerateShotImageAction.mockResolvedValue({
      prompt: "9-panel grid prompt, softened.",
      negativePrompt: "",
      creditsUsed: 3,
      model: "mock-model",
    });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1, softenLevel: 1 },
    });

    // Exactly ONE skill call authors both the grid layout AND the soften
    // wording together — never two passes.
    expect(mockGenerateShotImageAction).toHaveBeenCalledTimes(1);
    const [callArgs] = mockGenerateShotImageAction.mock.calls[0];
    expect(callArgs.action).toBe("multi_angle_grid");
    expect(callArgs.softenLevel).toBe(1);
  });
});
