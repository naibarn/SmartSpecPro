/**
 * Feature 138 P1 — explicit Scene Visual State mutation coverage.
 *
 * This suite intentionally lives outside the large Gate-B router suite. The
 * router module is imported with a small, deterministic service graph and the
 * mutation handlers are invoked directly through the same raw-procedure mock
 * convention used by the surrounding Vertical Drama router tests.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDb,
  mockRequireFeatureFlag,
  mockGetTenantFeatureFlags,
  mockGenerateSceneVisualState,
  mockBuildAuthoringInput,
  mockGetPrimaryReferenceUrl,
} = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
  mockRequireFeatureFlag: vi.fn((flag: string) => (value: unknown) => value),
  mockGetTenantFeatureFlags: vi.fn(async () => ({
    verticalDramaSceneContinuity: true,
    verticalDramaSeriesPresetMixV2: false,
    verticalDramaSeriesLookLock: false,
  })),
  mockGenerateSceneVisualState: vi.fn(),
  mockBuildAuthoringInput: vi.fn((input: Record<string, unknown>) => input),
  mockGetPrimaryReferenceUrl: vi.fn(async () => undefined),
}));

vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const procedure: any = {
      use: () => procedure,
      input: () => procedure,
      query: (handler: Function) => handler,
      mutation: (handler: Function) => handler,
    };
    return procedure;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: mockRequireFeatureFlag,
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(async () => []),
  isDbModelCatalogLoaded: () => true,
  resolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  })),
  deriveModelResolutionOptions: vi.fn(() => undefined),
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: vi.fn(),
    generateVideoAsync: vi.fn(),
  },
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo3/generate-veo-3-video-lite",
  },
  resolveReferenceUrl: (value: string) => value,
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
  mediaGenerationLimiter: {
    isAllowed: vi.fn(() => true),
    getResetTime: vi.fn(() => 0),
  },
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: vi.fn() },
}));
vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    getPrimaryReferenceUrl: mockGetPrimaryReferenceUrl,
    getPrimaryReferenceAssetId: vi.fn(async () => undefined),
    listRows: vi.fn(async () => []),
  },
}));

vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
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
  verticalDramaShotReferencesService: {},
  VerticalDramaShotReferenceError: class extends Error {},
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
  generateJudgedVerticalDramaShotVideoPrompt: vi.fn(),
  generateJudgedVerticalDramaShotVideoPromptSpeakerSwitch: vi.fn(),
  generateVerticalDramaClipDialogue: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
  appendPresetVisualIdentityStyleTokensToMotionPrompt: vi.fn(),
}));
vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));

const {
  MockInsufficientCreditsError,
  MockVdSchemaValidationError,
  MockRateLimitExceededError,
} = vi.hoisted(() => ({
  MockInsufficientCreditsError: class MockInsufficientCreditsError extends Error {},
  MockVdSchemaValidationError: class MockVdSchemaValidationError extends Error {},
  MockRateLimitExceededError: class RateLimitExceededError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RateLimitExceededError";
    }
  },
}));

vi.mock("../../services/verticalDramaSceneVisualState", () => ({
  generateSceneVisualState: mockGenerateSceneVisualState,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
  RateLimitExceededError: MockRateLimitExceededError,
}));

vi.mock("../../services/verticalDramaSceneContinuityLock", () => ({
  buildSceneVisualStateAuthoringInput: mockBuildAuthoringInput,
}));

const { mockReadSceneVisualStatesFromPlan, mockUpsertSceneVisualState } =
  vi.hoisted(() => ({
    mockReadSceneVisualStatesFromPlan: vi.fn(
      (plan: { sceneVisualStates?: unknown }) =>
        (plan.sceneVisualStates && typeof plan.sceneVisualStates === "object"
          ? plan.sceneVisualStates
          : {}) as Record<string, any>
    ),
    mockUpsertSceneVisualState: vi.fn(),
  }));

vi.mock("../../services/verticalDramaStartFrameGeneration", () => ({
  readSceneVisualStatesFromPlan: mockReadSceneVisualStatesFromPlan,
  upsertSceneVisualState: mockUpsertSceneVisualState,
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";

const router = verticalDramaEpisodesRouter as unknown as Record<
  string,
  (args: any) => Promise<any>
>;

function selectChain<T>(rows: T[]) {
  const chain: any = {};
  for (const method of [
    "from",
    "where",
    "leftJoin",
    "innerJoin",
    "orderBy",
    "limit",
    "for",
  ]) {
    chain[method] = () => chain;
  }
  chain.then = (
    resolve: (value: T[]) => unknown,
    reject?: (error: unknown) => unknown
  ) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}

function updateChain<T>(rows: T[]) {
  const chain: any = {};
  chain.set = vi.fn((value: unknown) => {
    chain.setPayload = value;
    return chain;
  });
  for (const method of ["where", "returning"])
    chain[method] = () => chain;
  chain.then = (
    resolve: (value: T[]) => unknown,
    reject?: (error: unknown) => unknown
  ) => Promise.resolve(rows).then(resolve, reject);
  return chain;
}

function makePlan(state?: Record<string, unknown>) {
  return {
    mode: "single_frame_per_shot",
    frames: [
      { shotNumber: 1, imagePrompt: "hall", locationKey: "hall" },
      { shotNumber: 2, imagePrompt: "hall again", locationKey: "hall" },
    ],
    ...(state ? { sceneVisualStates: state } : {}),
  };
}

function makeEpisode(startFramePlan = makePlan()) {
  return {
    id: 11,
    tenantId: "tenant-1",
    userId: 7,
    seriesId: 3,
    episodeNumber: 1,
    title: "Episode 1",
    storyboard: {
      distinct_locations: [
        {
          location_key: "hall",
          location_name: "Hall",
          description: "A quiet hall",
          shot_numbers: [1, 2],
        },
      ],
      shots: [
        { shot_number: 1, visual_description: "Hero enters" },
        { shot_number: 2, visual_description: "Hero waits" },
      ],
    },
    startFramePlan,
  };
}

const ctx = { tenantId: "tenant-1", user: { id: 7 } };
const inputBase = {
  seriesId: "3",
  episodeId: "11",
  locationKey: "hall",
  expectedRevision: 0,
};

function queuePlanReads(episode: any, freshPlan = episode.startFramePlan) {
  mockDb.select.mockReturnValueOnce(selectChain([episode]));
  mockDb.select.mockReturnValueOnce(
    selectChain([
      { id: 20, name: "Hall roster", data: { description: "Roster hall" } },
    ])
  );
  mockDb.select.mockReturnValueOnce(
    selectChain([{ bible: null, locale: "th" }])
  );
  const tx = {
    select: vi.fn(() => selectChain([{ startFramePlan: freshPlan }])),
    update: vi.fn(() => updateChain([{ startFramePlan: freshPlan }])),
  };
  mockDb.transaction.mockImplementationOnce(
    async (callback: (value: any) => Promise<any>) => callback(tx)
  );
  return tx;
}

function configureUpsert() {
  mockUpsertSceneVisualState.mockImplementation(
    ({ current = {}, next, origin, force }: any) => {
      const existing = current[next.locationKey];
      if (origin === "planned" && existing?.manualEdit && force !== true) {
        return {
          states: current,
          written: false,
          skippedReason: "manual_edit_protected",
        };
      }
      return {
        states: { ...current, [next.locationKey]: next },
        written: true,
      };
    }
  );
}

describe("verticalDramaEpisodes scene visual state mutations", () => {
  beforeEach(() => {
    mockDb.select.mockReset();
    mockDb.update.mockReset();
    mockDb.transaction.mockReset();
    mockBuildAuthoringInput.mockClear();
    mockGenerateSceneVisualState.mockReset();
    mockGetPrimaryReferenceUrl.mockClear();
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSceneContinuity: true,
      verticalDramaSeriesPresetMixV2: false,
      verticalDramaSeriesLookLock: false,
    });
    mockReadSceneVisualStatesFromPlan.mockImplementation(
      (plan: any) => plan.sceneVisualStates ?? {}
    );
    configureUpsert();
    mockGenerateSceneVisualState.mockResolvedValue({
      state: {
        locationKey: "hall",
        membershipHash: "generated-hash",
        revision: 1,
        lightingState: "warm evening",
        fixedElements: [],
        spatialLayout: "centered",
        stagingAxis: "north-south",
        wardrobeInScene: [],
        activeProps: [],
        paletteMood: "gold",
        timeJumpSuspected: false,
        coverageGaps: [],
        memberShotNumbers: [1, 2],
        plannedAt: "2026-08-01T00:00:00.000Z",
      },
      creditsUsed: 4,
      usedVision: false,
    });
  });

  it("registers both mutations behind the dedicated scene-continuity flag", () => {
    expect(mockRequireFeatureFlag).toHaveBeenCalledWith(
      "verticalDramaSceneContinuity"
    );
    expect(typeof router.planSceneVisualState).toBe("function");
    expect(typeof router.updateSceneVisualState).toBe("function");
  });

  it("authors a scene once, persists the resolved members, and preserves roster facts", async () => {
    const episode = makeEpisode();
    const tx = queuePlanReads(episode);
    const result = await router.planSceneVisualState({
      ctx,
      input: { ...inputBase, idempotencyKey: "plan-1" },
    });

    expect(result.planned).toBe(true);
    expect(result.sceneVisualState.memberShotNumbers).toEqual([1, 2]);
    expect(mockGenerateSceneVisualState).toHaveBeenCalledTimes(1);
    expect(mockBuildAuthoringInput).toHaveBeenCalledWith(
      expect.objectContaining({
        location: expect.objectContaining({
          location_name: "Hall",
          description: "A quiet hall",
        }),
      })
    );
    expect(tx.update).toHaveBeenCalledTimes(1);
  });

  it("is idempotent for an existing auto state and protects a manual state", async () => {
    const autoState = {
      locationKey: "hall",
      revision: 2,
      manualEdit: false,
      lightingState: "warm",
      memberShotNumbers: [1, 2],
    };
    const episode = makeEpisode(makePlan({ hall: autoState }));
    mockDb.select.mockReturnValueOnce(selectChain([episode]));
    const skipped = await router.planSceneVisualState({
      ctx,
      input: { ...inputBase, expectedRevision: 2 },
    });
    expect(skipped).toMatchObject({
      planned: false,
      skippedReason: "already_planned",
    });
    expect(mockGenerateSceneVisualState).not.toHaveBeenCalled();

    const manualEpisode = makeEpisode(
      makePlan({ hall: { ...autoState, manualEdit: true } })
    );
    mockDb.select.mockReturnValueOnce(selectChain([manualEpisode]));
    const protectedResult = await router.planSceneVisualState({
      ctx,
      input: { ...inputBase, expectedRevision: 2 },
    });
    expect(protectedResult).toMatchObject({
      planned: false,
      skippedReason: "manual_edit",
    });
    expect(mockGenerateSceneVisualState).not.toHaveBeenCalled();
  });

  it("releases stale state through a zero-cost manual spread update", async () => {
    const existing = {
      locationKey: "hall",
      revision: 4,
      stale: true,
      lightingState: "old",
      spatialLayout: "keep me",
      memberShotNumbers: [1, 2],
    };
    const episode = makeEpisode(makePlan({ hall: existing }));
    queuePlanReads(episode, episode.startFramePlan);
    const result = await router.updateSceneVisualState({
      ctx,
      input: {
        ...inputBase,
        expectedRevision: 4,
        patch: { lightingState: "new" },
      },
    });
    expect(result.sceneVisualState).toMatchObject({
      lightingState: "new",
      spatialLayout: "keep me",
      manualEdit: true,
    });
    expect(result.sceneVisualState.stale).toBeUndefined();
    expect(mockGenerateSceneVisualState).not.toHaveBeenCalled();
  });

  it("marks every member frame stale while retaining existing image anchors", async () => {
    const existing = {
      ...makePlan({
        hall: {
          locationKey: "hall",
          revision: 4,
          lightingState: "old",
          memberShotNumbers: [1, 2],
        },
      }),
      frames: [
        {
          shotNumber: 1,
          imagePrompt: "old shot 1",
          approvedMediaAssetId: "asset-1",
          sceneContinuity: { lighting_match: "match" },
          locationKey: "hall",
        },
        {
          shotNumber: 2,
          imagePrompt: "old shot 2",
          videoStartMediaAssetId: "video-2",
          sceneContinuity: { lighting_match: "match" },
          locationKey: "hall",
        },
        {
          shotNumber: 3,
          imagePrompt: "unrelated shot",
          approvedMediaAssetId: "asset-3",
          locationKey: "other",
        },
      ],
    };
    const episode = makeEpisode(existing);
    const tx = queuePlanReads(episode, existing);
    await router.updateSceneVisualState({
      ctx,
      input: {
        ...inputBase,
        expectedRevision: 4,
        patch: {
          sleepSurface: {
            type: "long_bed",
            name: "เตียงนอนทรงยาวของภูมิ",
            occupant: "ภูมิ",
            placement: "ข้างโต๊ะเล็ก",
          },
        },
      },
    });

    const persistedPlan = tx.update.mock.results[0]?.value?.setPayload
      ?.startFramePlan;
    expect(persistedPlan.frames[0]).toMatchObject({
      approvedMediaAssetId: "asset-1",
      imageStaleReason: "prompt_changed",
      sceneContinuity: undefined,
    });
    expect(persistedPlan.frames[1]).toMatchObject({
      videoStartMediaAssetId: "video-2",
      imageStaleReason: "prompt_changed",
      sceneContinuity: undefined,
    });
    expect(persistedPlan.frames[2]).toEqual(existing.frames[2]);
    expect(persistedPlan.sceneVisualStates.hall.sleepSurface).toEqual({
      type: "long_bed",
      name: "เตียงนอนทรงยาวของภูมิ",
      occupant: "ภูมิ",
      placement: "ข้างโต๊ะเล็ก",
    });
  });

  it("rejects stale expectedRevision before authoring or writing", async () => {
    const state = {
      locationKey: "hall",
      revision: 3,
      memberShotNumbers: [1, 2],
    };
    const episode = makeEpisode(makePlan({ hall: state }));
    mockDb.select.mockReturnValueOnce(selectChain([episode]));
    const tx = {
      select: vi.fn(() =>
        selectChain([{ startFramePlan: episode.startFramePlan }])
      ),
      update: vi.fn(() => updateChain([])),
    };
    mockDb.transaction.mockImplementationOnce(
      async (callback: (value: any) => Promise<any>) => callback(tx)
    );
    await expect(
      router.updateSceneVisualState({
        ctx,
        input: {
          ...inputBase,
          expectedRevision: 2,
          patch: { lightingState: "new" },
        },
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockGenerateSceneVisualState).not.toHaveBeenCalled();
  });

  it.each([
    [MockInsufficientCreditsError, "FORBIDDEN"],
    [MockVdSchemaValidationError, "INTERNAL_SERVER_ERROR"],
    [MockRateLimitExceededError, "TOO_MANY_REQUESTS"],
  ])("maps %p from the explicit authoring path", async (ErrorClass, code) => {
    const episode = makeEpisode();
    queuePlanReads(episode);
    mockGenerateSceneVisualState.mockRejectedValueOnce(
      new (ErrorClass as any)("boom")
    );
    await expect(
      router.planSceneVisualState({ ctx, input: { ...inputBase } })
    ).rejects.toMatchObject({ code });
  });
});
