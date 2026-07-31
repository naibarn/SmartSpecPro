/**
 * Feature 132 §6.2 (F132C, scene-contracts) regression coverage:
 * `updateEpisodeDraft`'s JSONB-patch path must preserve a shot's `contract`
 * field. Audit finding: `updateEpisodeDraft` does a WHOLESALE column
 * replace (`updates.storyboard = input.storyboard`, `updates.script =
 * input.script`, etc.) — it never reconstructs a shot/storyboard object
 * field-by-field, so whatever `contract` shape the caller includes in its
 * patch payload is stored verbatim, byte-identical. This test locks that
 * behavior in as a regression guard (per the task brief: "add the
 * regression test either way").
 *
 * (`repairStageOutput`'s actual JSONB-patch mechanism lives in
 * `verticalDramaEpisodePipeline.repairStage`, a file explicitly out of
 * scope for this coordinated pass — see this agent's final report for that
 * finding.)
 *
 * Same "mock the whole module graph" convention as
 * `verticalDramaEpisodes.memoryWiring.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(),
  resolveVerticalDramaCapabilities: vi.fn(),
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

// Location visual bible, Phase D (planning/polished-toasting-gadget.md) —
// `getEpisodeDetail`'s new `episodeLocations` field resolves through
// `verticalDramaLocationStockService.listRows`, mocked here the same way as
// `verticalDramaCharacterStockService` above (its real implementation uses
// `.innerJoin(...)`, not implemented by this file's `selectChain` helper).
// Defaults to an empty roster — every pre-existing test in this file never
// asserts on `episodeLocations`, so this is purely additive.
vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    getPrimaryReferenceUrl: vi.fn(),
    getPrimaryReferenceAssetId: vi.fn(),
    listRows: vi.fn(() => Promise.resolve([])),
  },
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
  verticalDramaEpisodePipeline: { approveRunCheckpoint: vi.fn(), repairStage: vi.fn() },
  VerticalDramaEpisodePipeline: class {},
  VERTICAL_DRAMA_PIPELINE_STAGES: ["plan_episode_script"],
  VERTICAL_DRAMA_RUNNER_MODES: ["dry_run", "full"],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
}));

vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: {
    appendEvent: vi.fn(),
    listEvents: vi.fn(),
    proposeRetcon: vi.fn(),
    approveRetconProposal: vi.fn(),
    rejectRetconProposal: vi.fn(),
    buildEpisodeMemoryBundle: vi.fn(),
  },
  memoryRowToEvent: vi.fn(),
}));

vi.mock("../../services/verticalDramaArcReplan", () => ({
  detectArcDrift: vi.fn(),
  buildArcReplanProposal: vi.fn(),
}));

vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: vi.fn(() => []),
  deriveLegacyContentBudget: vi.fn(),
  // Part A1 (planning/`polished-toasting-gadget.md`) — `getEpisodeDetail`'s
  // `resolveEpisodePlanForEpisode` also reads this export via the SAME
  // dynamic import above.
  readItemCliffhangerLine: vi.fn(() => undefined),
}));

vi.mock("../../services/verticalDramaScriptGeneration", () => ({
  evaluateScriptSpeechCoverage: vi.fn(),
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
  formatVideoClipRequest: vi.fn(),
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

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
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

function updateChain(returned: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateEpisodeDraft — contract preservation regression (F132C)", () => {
  const EPISODE_ROW = { id: 100, episodeNumber: 3 };

  it("stores a storyboard patch's shot.contract fields byte-identical (wholesale column replace, no field-by-field reconstruction)", async () => {
    const storyboardWithContracts = {
      shots: [
        {
          shot_number: 1,
          contract: {
            storyFunction: "reveal",
            emotionalBeat: "dread",
            audienceTakeaway: "the note is fake",
            tensionSource: "time pressure",
            newClueIds: ["clue-1"],
            dialoguePurpose: "confront",
            anchorLine: true,
          },
        },
      ],
    };

    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW])); // loadOwnedEpisode
    const updatedRow = { ...EPISODE_ROW, storyboard: storyboardWithContracts };
    mockDb.update.mockReturnValueOnce(updateChain([updatedRow]));

    await router.updateEpisodeDraft({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", storyboard: storyboardWithContracts },
    });

    const setCallArgs = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setCallArgs.storyboard.shots[0].contract).toEqual(storyboardWithContracts.shots[0].contract);
  });

  it("only writes the fields explicitly supplied — omitting storyboard never touches script/other columns", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW]));
    mockDb.update.mockReturnValueOnce(updateChain([EPISODE_ROW]));

    await router.updateEpisodeDraft({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", title: "New title" },
    });

    const setCallArgs = mockDb.update.mock.results[0].value.set.mock.calls[0][0];
    expect(setCallArgs.title).toBe("New title");
    expect(setCallArgs.storyboard).toBeUndefined();
    expect(setCallArgs.script).toBeUndefined();
  });
});
