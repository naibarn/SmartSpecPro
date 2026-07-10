/**
 * Vertical Drama Series memory-system gap fixes — backend integration unit
 * coverage for `verticalDramaEpisodes.ts`:
 *  - `approveCheckpoint` delegates entirely to
 *    `verticalDramaEpisodePipeline.approveRunCheckpoint` and returns its
 *    checkpoint row as-is — it no longer performs any memory-write side
 *    effects itself.
 *  - `proposeRetcon` wraps `verticalDramaSeriesMemory.ts`'s `proposeRetcon()`
 *    with the correct Zod-validated fields.
 *
 * (2026-07-07: the `summarize_episode_to_series_memory` memory-event writes —
 * episode_summary + hook_opened[] + hook_resolved[] + character_delta[] +
 * relationship_delta[] + continuity_warning[] + product_tie_in_usage[] +
 * canonical_fact[], each with its own idempotency key — used to live inline
 * in this router's `approveCheckpoint` mutation. They were relocated into
 * `verticalDramaEpisodePipeline.approveRunCheckpoint` so BOTH the legacy
 * pending->approved transition AND the new create-time auto-approval path in
 * `runStage` apply them from one place. See
 * `verticalDramaEpisodePipeline.memoryWiring.test.ts` for that coverage.)
 *
 * Same "mock the whole module graph, test the exported procedure handlers
 * directly" convention as `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`.
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

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

const { mockApproveRunCheckpoint } = vi.hoisted(() => ({
  mockApproveRunCheckpoint: vi.fn(),
}));
vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
  verticalDramaEpisodePipeline: { approveRunCheckpoint: mockApproveRunCheckpoint },
  VerticalDramaEpisodePipeline: class {},
  VERTICAL_DRAMA_PIPELINE_STAGES: ["plan_episode_script"],
  VERTICAL_DRAMA_RUNNER_MODES: ["dry_run", "full"],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
}));

const { mockMemoryService } = vi.hoisted(() => ({
  mockMemoryService: {
    appendEvent: vi.fn(),
    listEvents: vi.fn(),
    proposeRetcon: vi.fn(),
    approveRetconProposal: vi.fn(),
    rejectRetconProposal: vi.fn(),
    buildEpisodeMemoryBundle: vi.fn(),
  },
}));
vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: mockMemoryService,
  memoryRowToEvent: vi.fn(),
}));

// Story-density reform (spec §7.7.3, section-13, added 2026-07-07) — the
// router loads these 3 modules via a runtime `import()` (not a static
// import — see `runArcDriftCheckAndProposeIfNeeded`'s doc comment in
// `verticalDramaEpisodes.ts` for why), but `vi.mock` intercepts dynamic
// imports of a mocked path exactly like static ones, so these mocks apply
// here too. Simple, fully-controlled fakes — the real drift-detection
// algorithm is already covered by `verticalDramaArcReplan.test.ts`; this
// file only tests the WIRING (hook points, flag gating, idempotency).
const { mockDetectArcDrift, mockBuildArcReplanProposal } = vi.hoisted(() => ({
  mockDetectArcDrift: vi.fn(),
  mockBuildArcReplanProposal: vi.fn(),
}));
vi.mock("../../services/verticalDramaArcReplan", () => ({
  detectArcDrift: mockDetectArcDrift,
  buildArcReplanProposal: mockBuildArcReplanProposal,
}));

const { mockGetActiveBreakdown, mockDeriveLegacyContentBudget } = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(),
  mockDeriveLegacyContentBudget: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  deriveLegacyContentBudget: mockDeriveLegacyContentBudget,
}));

const { mockEvaluateScriptSpeechCoverage } = vi.hoisted(() => ({
  mockEvaluateScriptSpeechCoverage: vi.fn(),
}));
vi.mock("../../services/verticalDramaScriptGeneration", () => ({
  evaluateScriptSpeechCoverage: mockEvaluateScriptSpeechCoverage,
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

// Mocked directly (like `verticalDramaEpisodeQualityReview` above) so this
// file never pulls in `verticalDramaSeriesMemoryPlanning.ts` ->
// `verticalDramaStoryBible.ts` -> `enabledLlmModels.ts` -> `llmProviders.ts`'s
// `adminProcedure` dependency, which this file's `../../_core/trpc` mock does
// not export.
const { mockRunVerticalDramaSeriesMemoryPlanning } = vi.hoisted(() => ({
  mockRunVerticalDramaSeriesMemoryPlanning: vi.fn(),
}));
vi.mock("../../services/verticalDramaSeriesMemoryPlanning", () => ({
  runVerticalDramaSeriesMemoryPlanning: mockRunVerticalDramaSeriesMemoryPlanning,
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
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  // `vi.clearAllMocks()` clears call history but NOT a mock's implementation
  // (that's `mockReset`) — `mockGetTenantFeatureFlags.mockResolvedValue(...)`
  // set by one arc-drift test would otherwise silently persist as the
  // DEFAULT for every later test in this file (flag "leaks" on). Explicitly
  // reset just this one mock so every test starts from the fail-closed
  // default (`undefined` -> optional-chained to "flag off" by the router)
  // unless it explicitly opts in.
  mockGetTenantFeatureFlags.mockReset();
});

describe("approveCheckpoint — delegates to the pipeline, no router-level side effects", () => {
  function checkpointOutcome(over: Record<string, unknown> = {}) {
    return {
      checkpoint: {
        id: 900,
        runId: 800,
        stage: "summarize_episode_to_series_memory",
        state: "approved",
        sourceArtifactIds: ["700"],
        notes: null,
        ...over,
      },
      alreadyTerminal: false,
    };
  }

  it("returns the pipeline's checkpoint outcome as-is and never calls the memory service itself", async () => {
    // All `summarize_episode_to_series_memory` memory-write side effects now
    // happen INSIDE `verticalDramaEpisodePipeline.approveRunCheckpoint`
    // (mocked here as `mockApproveRunCheckpoint`) — see
    // `verticalDramaEpisodePipeline.memoryWiring.test.ts` for that coverage.
    // This router mutation must not duplicate any of it.
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome());

    const result = await router.approveCheckpoint({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        checkpointId: "900",
        decision: "approve",
      },
    });

    expect(mockApproveRunCheckpoint).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, episodeId: 100 },
      900,
      "approve",
      undefined,
    );
    expect(result).toEqual({ checkpoint: { ...checkpointOutcome().checkpoint, id: "900" } });
    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when the pipeline can't find the checkpoint", async () => {
    mockApproveRunCheckpoint.mockResolvedValue(null);

    await expect(
      router.approveCheckpoint({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          checkpointId: "900",
          decision: "approve",
        },
      }),
    ).rejects.toThrow("Checkpoint not found");
  });

  it("is a no-op pass-through for an already-terminal checkpoint (idempotency)", async () => {
    mockApproveRunCheckpoint.mockResolvedValue({
      checkpoint: {
        id: 900,
        runId: 800,
        stage: "summarize_episode_to_series_memory",
        state: "approved",
      },
      alreadyTerminal: true,
    });

    const result = await router.approveCheckpoint({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        checkpointId: "900",
        decision: "approve",
      },
    });

    expect(result.checkpoint.id).toBe("900");
    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

/**
 * Story-density reform (spec §7.7.3, section-13, added 2026-07-07) —
 * deterministic arc-drift check hooked onto a genuine `plan_episode_script`
 * OR `summarize_episode_to_series_memory` checkpoint approval transition
 * (covers first-time script approval, re-approval of a repaired script —
 * `repairStageOutput` always creates a NEW checkpoint on the same stage —
 * and the pipeline-driven memory-summary checkpoint). Flag-gated
 * (`verticalDramaSeriesArcReplan`); best-effort (never blocks the approval).
 */
describe("approveCheckpoint — arc-drift check (spec §7.7.3, section-13)", () => {
  function checkpointOutcome(over: Record<string, unknown> = {}) {
    return {
      checkpoint: {
        id: 900,
        runId: 800,
        stage: "plan_episode_script",
        state: "approved",
        sourceArtifactIds: ["700"],
        notes: null,
        ...over,
      },
      alreadyTerminal: false,
    };
  }

  const EPISODE_ROW_FOR_DRIFT = {
    id: 100,
    episodeNumber: 3,
    script: { structure: { beats: [{ beat: 1, intensity: 4 }] }, continuity_notes: [] },
  };

  const ACTIVE_BREAKDOWN_ITEM = {
    episodeNumber: 4,
    workingTitle: "Ep 4",
    logline: "The rival strikes back",
    keyBeats: ["confrontation"],
  };

  function mockHappyPathDependencies() {
    mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue({ unresolvedHooks: [] });
    mockGetActiveBreakdown.mockReturnValue([ACTIVE_BREAKDOWN_ITEM]);
    mockEvaluateScriptSpeechCoverage.mockReturnValue({
      estimatedSpeechSeconds: 50,
      coverageRatio: 0.83,
      status: "in_range",
    });
    mockDetectArcDrift.mockReturnValue({
      drifted: true,
      reasons: [{ code: "VD_ARC_CONTENT_BUDGET_EXCEEDED", evidence: "over budget" }],
      affectedEpisodeNumbers: [4],
    });
    mockDeriveLegacyContentBudget.mockReturnValue({
      beatCount: 6,
      estimatedSpeechSeconds: 36,
      conflictLevel: 3,
      reversalTarget: 2,
      arcThreads: [],
    });
    mockBuildArcReplanProposal.mockReturnValue({
      proposalId: "p-1",
      seriesId: "10",
      triggeredByEpisodeNumber: 3,
      driftReasons: ["VD_ARC_CONTENT_BUDGET_EXCEEDED"],
      affectedEpisodeNumbers: [4],
      proposedBreakdown: [{ ...ACTIVE_BREAKDOWN_ITEM, contentBudget: {} }],
      rationale: "Episode 3 exceeded its content budget.",
      status: "proposed",
    });
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "55" });
  }

  it("appends an arc_replan_proposal event on genuine approval of the plan_episode_script stage when the flag is on and drift is detected", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome({ stage: "plan_episode_script" }));
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_FOR_DRIFT])); // loadOwnedEpisode (drift hook)
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: {} }])); // series bible
    mockHappyPathDependencies();

    await router.approveCheckpoint({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", checkpointId: "900", decision: "approve" },
    });

    expect(mockMemoryService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        episodeId: 100,
        memoryKind: "arc_replan_proposal",
        idempotencyKey: "vd-arc-replan-proposal-checkpoint-900",
      }),
    );
  });

  it("also runs on genuine approval of the pipeline-driven summarize_episode_to_series_memory checkpoint", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
    mockApproveRunCheckpoint.mockResolvedValue(
      checkpointOutcome({ stage: "summarize_episode_to_series_memory" }),
    );
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_FOR_DRIFT]));
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: {} }]));
    mockHappyPathDependencies();

    await router.approveCheckpoint({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", checkpointId: "900", decision: "approve" },
    });

    expect(mockMemoryService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ memoryKind: "arc_replan_proposal" }),
    );
  });

  it("does not run the drift check when the flag is off (default)", async () => {
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome());

    await router.approveCheckpoint({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", checkpointId: "900", decision: "approve" },
    });

    expect(mockGetActiveBreakdown).not.toHaveBeenCalled();
    expect(mockDetectArcDrift).not.toHaveBeenCalled();
    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
  });

  it("does not run the drift check for an already-terminal checkpoint, even with the flag on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
    mockApproveRunCheckpoint.mockResolvedValue({
      checkpoint: { id: 900, runId: 800, stage: "plan_episode_script", state: "approved" },
      alreadyTerminal: true,
    });

    await router.approveCheckpoint({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", checkpointId: "900", decision: "approve" },
    });

    expect(mockDetectArcDrift).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("does not run the drift check on a rejection, even with the flag on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
    mockApproveRunCheckpoint.mockResolvedValue(
      checkpointOutcome({ stage: "plan_episode_script", state: "rejected" }),
    );

    await router.approveCheckpoint({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", checkpointId: "900", decision: "reject" },
    });

    expect(mockDetectArcDrift).not.toHaveBeenCalled();
  });

  it("does not run the drift check for a checkpoint stage outside the 2 hooked stages, even with the flag on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome({ stage: "storyboard_shotgrid" }));

    await router.approveCheckpoint({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", checkpointId: "900", decision: "approve" },
    });

    expect(mockDetectArcDrift).not.toHaveBeenCalled();
  });

  it("does not append a proposal when detectArcDrift finds no drift", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome());
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_FOR_DRIFT]));
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: {} }]));
    mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue({ unresolvedHooks: [] });
    mockGetActiveBreakdown.mockReturnValue([ACTIVE_BREAKDOWN_ITEM]);
    mockEvaluateScriptSpeechCoverage.mockReturnValue({
      estimatedSpeechSeconds: 40,
      coverageRatio: 0.67,
      status: "in_range",
      targetSpeechSecondsMin: 34.8,
      targetSpeechSecondsMax: 40.8,
    });
    mockDetectArcDrift.mockReturnValue({ drifted: false, reasons: [], affectedEpisodeNumbers: [] });

    await router.approveCheckpoint({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", checkpointId: "900", decision: "approve" },
    });

    expect(mockBuildArcReplanProposal).not.toHaveBeenCalled();
    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
  });

  it("is best-effort — an unexpected error in the drift check never fails the approval response", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome());
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW_FOR_DRIFT]));
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: {} }]));
    mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue({ unresolvedHooks: [] });
    mockGetActiveBreakdown.mockImplementation(() => {
      throw new Error("boom");
    });

    const result = await router.approveCheckpoint({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", checkpointId: "900", decision: "approve" },
    });

    expect(result.checkpoint.id).toBe("900");
    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
  });
});

describe("proposeRetcon", () => {
  it("wraps verticalDramaSeriesMemoryService.proposeRetcon with the validated fields", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: 10 }])); // assertSeriesOwned
    mockMemoryService.proposeRetcon.mockResolvedValue({
      memoryEventId: "42",
      memoryKind: "retcon_proposal",
    });

    const result = await router.proposeRetcon({
      ctx: ctx(),
      input: {
        seriesId: "10",
        factSummary: "Aria is no longer CFO",
        reason: "she resigned in episode 5",
      },
    });

    expect(result).toEqual({
      event: { memoryEventId: "42", memoryKind: "retcon_proposal" },
    });
    expect(mockMemoryService.proposeRetcon).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: { tenantId: "tenant-1", userId: 42, seriesId: 10 },
        proposedFact: "Aria is no longer CFO",
        rationale: "she resigned in episode 5",
        supersedesEventIds: [],
      }),
    );
  });

  it("looks up the contradicted fact text when supersedesEventIds is provided", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ id: 10 }])) // assertSeriesOwned
      ;
    mockMemoryService.listEvents.mockResolvedValue([
      {
        memoryEventId: "5",
        memoryKind: "canonical_fact",
        payload: { fact: "Aria is CFO of Vantor Group" },
        summaryText: "Aria is CFO of Vantor Group",
      },
    ]);
    mockMemoryService.proposeRetcon.mockResolvedValue({ memoryEventId: "42" });

    await router.proposeRetcon({
      ctx: ctx(),
      input: {
        seriesId: "10",
        factSummary: "Aria is no longer CFO",
        supersedesEventIds: ["5"],
      },
    });

    expect(mockMemoryService.proposeRetcon).toHaveBeenCalledWith(
      expect.objectContaining({
        contradictedFact: "Aria is CFO of Vantor Group",
        supersedesEventIds: ["5"],
      }),
    );
  });

});

describe("summarizeEpisodeToMemory — manual episode -> series memory trigger", () => {
  const EPISODE_ROW = {
    id: 100,
    episodeNumber: 3,
    script: { title: "Ep 3" },
    storyboard: { shots: [] },
    dialogueAudioPlan: null,
  };

  const PLANNED = {
    contract_version: 1,
    canonical_facts: [{ fact_id: "f1", statement: "Aria is CFO of Vantor Group" }],
    prior_episode_summaries: [],
    unresolved_hooks: [{ hook_id: "h_clinic", description: "sister's clinic funding" }],
    resolved_hooks: [{ hook_id: "h_old", description: "old hook resolved" }],
    relationship_state_changes: [
      { pair: ["char_aria", "char_rival"], change: "trust -> rivalry" },
    ],
    character_emotional_state: [{ character_id: "char_aria", state: "suspicious" }],
    product_tie_in_history: [{ productName: "SkinGlow serum" }],
    continuity_risks: [{ risk: "wardrobe drift", severity: "low" }],
    episode_recap: "Episode 3: Aria uncovers the hidden clause.",
    memory_compaction_summary: "Series so far: corporate betrayal.",
  };

  it("throws PRECONDITION_FAILED when the episode has no script/storyboard", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW, script: null, storyboard: null }]),
    ); // loadOwnedEpisode

    await expect(
      router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      }),
    ).rejects.toThrow(/บทและสตอรี่บอร์ด/);

    expect(mockRunVerticalDramaSeriesMemoryPlanning).not.toHaveBeenCalled();
  });

  it("runs the planner and appends every memory event kind on first summarization", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])); // series locale lookup
    mockMemoryService.listEvents.mockResolvedValue([]); // no prior manual summary
    mockMemoryService.buildEpisodeMemoryBundle = vi.fn().mockResolvedValue({});
    mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
      planned: PLANNED,
      creditsUsed: 12,
      model: "gpt-x",
    });
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

    const result = await router.summarizeEpisodeToMemory({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    const calls = mockMemoryService.appendEvent.mock.calls.map((c) => c[0]);
    const kinds = calls.map((c) => c.memoryKind);

    expect(kinds).toContain("episode_summary");
    expect(kinds).toContain("hook_opened");
    expect(kinds).toContain("hook_resolved");
    expect(kinds).toContain("character_delta");
    expect(kinds).toContain("relationship_delta");
    expect(kinds).toContain("continuity_warning");
    expect(kinds).toContain("product_tie_in_usage");
    expect(kinds).toContain("canonical_fact");

    for (const c of calls) {
      expect(c.approved).toBe(true);
      expect(c.approvedByUserId).toBe(42);
      expect(c.payload.source).toBe("manual");
    }

    expect(result.alreadySummarized).toBe(false);
    expect(result.eventsAppended).toBe(calls.length);
    expect(result.creditsUsed).toBe(12);
  });

  it("uses distinct idempotency keys per appended event (idempotency)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW]))
      .mockReturnValueOnce(selectChain([]));
    mockMemoryService.listEvents.mockResolvedValue([]);
    mockMemoryService.buildEpisodeMemoryBundle = vi.fn().mockResolvedValue({});
    mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
      planned: PLANNED,
      creditsUsed: 12,
      model: "gpt-x",
    });
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

    await router.summarizeEpisodeToMemory({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    const keys = mockMemoryService.appendEvent.mock.calls.map((c) => c[0].idempotencyKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every((k: string) => k.startsWith("vd-episode-summary-manual-100-"))).toBe(true);
  });

  /**
   * Feature 132 §5.3 (F132B, ledgers-and-story-state, added 2026-07-09) —
   * `summarizeEpisodeToMemory` appends a `story_state` memory event ONLY
   * when the `verticalDramaQualityLedgers` tenant flag is on AND the
   * memory-planner's response actually included a `story_state` object this
   * run (a pre-upgrade skill response, or the flag being off, omits the
   * key) — byte-identical event count to today in either case.
   */
  describe("story_state event write (F132B)", () => {
    const STORY_STATE = {
      episode: 3,
      knownByProtagonist: ["the note is fake"],
      threatLevel: 3,
      requiredNextEpisodeResponse: "Aria must confront the rival",
    };

    it("appends a story_state event when the flag is ON and the planner response includes story_state", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaQualityLedgers: true });
      mockDb.select
        .mockReturnValueOnce(selectChain([EPISODE_ROW]))
        .mockReturnValueOnce(selectChain([]));
      mockMemoryService.listEvents.mockResolvedValue([]);
      mockMemoryService.buildEpisodeMemoryBundle = vi.fn().mockResolvedValue({});
      mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
        planned: { ...PLANNED, story_state: STORY_STATE },
        creditsUsed: 12,
        model: "gpt-x",
      });
      mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

      await router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const storyStateCall = mockMemoryService.appendEvent.mock.calls.find(
        (c) => c[0].memoryKind === "story_state",
      );
      expect(storyStateCall).toBeDefined();
      expect(storyStateCall[0].payload.storyState).toEqual(STORY_STATE);
      expect(storyStateCall[0].payload.episodeNumber).toBe(3);
    });

    it("does NOT append a story_state event when the flag is OFF, even if the planner response includes story_state", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([EPISODE_ROW]))
        .mockReturnValueOnce(selectChain([]));
      mockMemoryService.listEvents.mockResolvedValue([]);
      mockMemoryService.buildEpisodeMemoryBundle = vi.fn().mockResolvedValue({});
      mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
        planned: { ...PLANNED, story_state: STORY_STATE },
        creditsUsed: 12,
        model: "gpt-x",
      });
      mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

      await router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const kinds = mockMemoryService.appendEvent.mock.calls.map((c) => c[0].memoryKind);
      expect(kinds).not.toContain("story_state");
    });

    it("does NOT append a story_state event when the flag is ON but the planner response omits story_state (byte-identical event count)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaQualityLedgers: true });
      mockDb.select
        .mockReturnValueOnce(selectChain([EPISODE_ROW]))
        .mockReturnValueOnce(selectChain([]));
      mockMemoryService.listEvents.mockResolvedValue([]);
      mockMemoryService.buildEpisodeMemoryBundle = vi.fn().mockResolvedValue({});
      mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
        planned: PLANNED, // no story_state field
        creditsUsed: 12,
        model: "gpt-x",
      });
      mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

      await router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const kinds = mockMemoryService.appendEvent.mock.calls.map((c) => c[0].memoryKind);
      expect(kinds).not.toContain("story_state");
    });
  });

  it("is a free no-op when already manually summarized and force is not set", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW])); // loadOwnedEpisode
    mockMemoryService.listEvents.mockResolvedValue([
      { memoryKind: "episode_summary", payload: { source: "manual" } },
    ]);

    const result = await router.summarizeEpisodeToMemory({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result).toEqual({ alreadySummarized: true, eventsAppended: 0, creditsUsed: 0 });
    expect(mockRunVerticalDramaSeriesMemoryPlanning).not.toHaveBeenCalled();
    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
  });

  it("re-runs the planner and appends a fresh set of events when force is set", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW]))
      .mockReturnValueOnce(selectChain([]));
    mockMemoryService.listEvents.mockResolvedValue([
      { memoryKind: "episode_summary", payload: { source: "manual" } },
    ]);
    mockMemoryService.buildEpisodeMemoryBundle = vi.fn().mockResolvedValue({});
    mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
      planned: PLANNED,
      creditsUsed: 12,
      model: "gpt-x",
    });
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "2" });

    const result = await router.summarizeEpisodeToMemory({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", force: true },
    });

    expect(mockRunVerticalDramaSeriesMemoryPlanning).toHaveBeenCalledTimes(1);
    expect(result.alreadySummarized).toBe(false);
    expect(result.eventsAppended).toBeGreaterThan(0);
  });

  /**
   * Story-density reform (spec §7.7.3, section-13, added 2026-07-07) —
   * arc-drift check hooked onto the end of a FRESH manual summarization run
   * (never on the `alreadySummarized` short-circuit above). Flag-gated;
   * `newHookDescriptions` is diffed from `planned.unresolved_hooks` against
   * `priorMemoryBundle.unresolvedHooks` — richer than the `approveCheckpoint`
   * hook, which has no structured hook source at script-approval time.
   */
  describe("arc-drift check", () => {
    function mockHappyPathDriftDependencies() {
      mockGetActiveBreakdown.mockReturnValue([
        { episodeNumber: 4, workingTitle: "Ep 4", logline: "The rival strikes back", keyBeats: ["confrontation"] },
      ]);
      mockEvaluateScriptSpeechCoverage.mockReturnValue({
        estimatedSpeechSeconds: 50,
        coverageRatio: 0.83,
        status: "in_range",
        // 2026-07-08 fix — evaluateScriptSpeechCoverage's real contract now
        // always includes the target band too; this mock matches the shape.
        targetSpeechSecondsMin: 34.8,
        targetSpeechSecondsMax: 40.8,
      });
      mockDetectArcDrift.mockReturnValue({
        drifted: true,
        reasons: [{ code: "VD_ARC_HOOK_UNPLANNED", evidence: "new hook not in plan" }],
        affectedEpisodeNumbers: [4],
      });
      mockDeriveLegacyContentBudget.mockReturnValue({
        beatCount: 6,
        estimatedSpeechSeconds: 36,
        conflictLevel: 3,
        reversalTarget: 2,
        arcThreads: [],
      });
      mockBuildArcReplanProposal.mockReturnValue({
        proposalId: "p-2",
        seriesId: "10",
        triggeredByEpisodeNumber: 3,
        driftReasons: ["VD_ARC_HOOK_UNPLANNED"],
        affectedEpisodeNumbers: [4],
        proposedBreakdown: [],
        rationale: "Episode 3 introduced an unplanned hook.",
        status: "proposed",
      });
    }

    it("appends an arc_replan_proposal event on a fresh run when the flag is on and drift is detected", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
      mockDb.select
        .mockReturnValueOnce(selectChain([EPISODE_ROW])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([])) // series locale lookup
        .mockReturnValueOnce(selectChain([{ bible: {} }])); // series bible (drift hook)
      mockMemoryService.listEvents.mockResolvedValue([]);
      mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue({ unresolvedHooks: [] });
      mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
        planned: PLANNED,
        creditsUsed: 12,
        model: "gpt-x",
      });
      mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });
      mockHappyPathDriftDependencies();

      await router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", idempotencyKey: "sum-1" },
      });

      expect(mockMemoryService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryKind: "arc_replan_proposal",
          idempotencyKey: "sum-1:arc-replan-proposal",
        }),
      );
      // The planner's own hook (`sister's clinic funding`) is NOT already in
      // the prior bundle's `unresolvedHooks` ([]), so it is passed through
      // as a genuinely NEW hook for `VD_ARC_HOOK_UNPLANNED` to evaluate.
      expect(mockDetectArcDrift).toHaveBeenCalledWith(
        expect.objectContaining({
          approvedScript: expect.objectContaining({
            newHookDescriptions: ["sister's clinic funding"],
          }),
        }),
      );
    });

    it("does not run the drift check when the flag is off (default)", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([EPISODE_ROW]))
        .mockReturnValueOnce(selectChain([]));
      mockMemoryService.listEvents.mockResolvedValue([]);
      mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue({ unresolvedHooks: [] });
      mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
        planned: PLANNED,
        creditsUsed: 12,
        model: "gpt-x",
      });
      mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

      await router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockDetectArcDrift).not.toHaveBeenCalled();
      expect(mockMemoryService.appendEvent).not.toHaveBeenCalledWith(
        expect.objectContaining({ memoryKind: "arc_replan_proposal" }),
      );
    });

    it("does not run the drift check on the alreadySummarized short-circuit, even with the flag on", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
      mockDb.select.mockReturnValueOnce(selectChain([EPISODE_ROW]));
      mockMemoryService.listEvents.mockResolvedValue([
        { memoryKind: "episode_summary", payload: { source: "manual" } },
      ]);

      const result = await router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(result.alreadySummarized).toBe(true);
      expect(mockDetectArcDrift).not.toHaveBeenCalled();
    });

    it("omits the arc-replan-proposal idempotency suffix when the caller supplied no idempotencyKey", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
      mockDb.select
        .mockReturnValueOnce(selectChain([EPISODE_ROW]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ bible: {} }]));
      mockMemoryService.listEvents.mockResolvedValue([]);
      mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue({ unresolvedHooks: [] });
      mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
        planned: PLANNED,
        creditsUsed: 12,
        model: "gpt-x",
      });
      mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });
      mockHappyPathDriftDependencies();

      await router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockMemoryService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({ memoryKind: "arc_replan_proposal", idempotencyKey: undefined }),
      );
    });

    it("is best-effort — an unexpected error in the drift check never fails summarizeEpisodeToMemory's own result", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesArcReplan: true });
      mockDb.select
        .mockReturnValueOnce(selectChain([EPISODE_ROW]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ bible: {} }]));
      mockMemoryService.listEvents.mockResolvedValue([]);
      mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue({ unresolvedHooks: [] });
      mockRunVerticalDramaSeriesMemoryPlanning.mockResolvedValue({
        planned: PLANNED,
        creditsUsed: 12,
        model: "gpt-x",
      });
      mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });
      mockGetActiveBreakdown.mockImplementation(() => {
        throw new Error("boom");
      });

      const result = await router.summarizeEpisodeToMemory({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(result.alreadySummarized).toBe(false);
      expect(result.creditsUsed).toBe(12);
    });
  });
});
