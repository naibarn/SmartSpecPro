/**
 * Vertical Drama Series memory-system gap fixes — backend integration unit
 * coverage for `verticalDramaEpisodes.ts`:
 *  - `approveCheckpoint` on the `summarize_episode_to_series_memory`
 *    checkpoint: appends ALL memory event kinds found in a real
 *    `vertical-drama-series-memory-planner` artifact (episode_summary +
 *    hook_opened[] + hook_resolved[] + character_delta[] +
 *    relationship_delta[] + continuity_warning[] + product_tie_in_usage[] +
 *    canonical_fact[]) in one pass, each with its own idempotency key.
 *  - Falls back to the old summary-only behavior when no planner artifact
 *    is present (old runs / dry_run / plan_only).
 *  - A terminal (already-approved) checkpoint short-circuits and never
 *    re-appends anything (idempotency).
 *  - `proposeRetcon` wraps `verticalDramaSeriesMemory.ts`'s `proposeRetcon()`
 *    with the correct Zod-validated fields.
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

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
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
  },
}));
vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: mockMemoryService,
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

vi.mock("../../services/verticalDramaVideoPromptFormatter", () => ({
  formatVideoClipRequest: vi.fn(),
}));

vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt: vi.fn(),
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
});

describe("approveCheckpoint — summarize_episode_to_series_memory (full planner artifact)", () => {
  const PLANNER_ARTIFACT = {
    stage: "summarize_episode_to_series_memory",
    episodeNumber: 3,
    pending: true,
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

  it("appends episode_summary + every other memory event kind from the planner artifact", async () => {
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome());
    mockDb.select
      .mockReturnValueOnce(selectChain([{ episodeNumber: 3 }])) // episode lookup
      .mockReturnValueOnce(selectChain([{ jsonPayload: PLANNER_ARTIFACT }])); // artifact lookup
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

    await router.approveCheckpoint({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        checkpointId: "900",
        decision: "approve",
      },
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

    // episode_summary carries the real recap text, not the deterministic placeholder.
    const summaryCall = calls.find((c) => c.memoryKind === "episode_summary");
    expect(summaryCall.summaryText).toBe(PLANNER_ARTIFACT.episode_recap);

    // Every appended event is marked approved by the acting user.
    for (const c of calls) {
      expect(c.approved).toBe(true);
      expect(c.approvedByUserId).toBe(42);
    }
  });

  it("uses distinct idempotency keys per item so re-approval never double-appends (idempotency)", async () => {
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome());
    mockDb.select
      .mockReturnValueOnce(selectChain([{ episodeNumber: 3 }]))
      .mockReturnValueOnce(selectChain([{ jsonPayload: PLANNER_ARTIFACT }]));
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

    await router.approveCheckpoint({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        checkpointId: "900",
        decision: "approve",
      },
    });

    const keys = mockMemoryService.appendEvent.mock.calls.map(
      (c) => c[0].idempotencyKey,
    );
    // No duplicate idempotency keys across all appended events.
    expect(new Set(keys).size).toBe(keys.length);
    // The base checkpoint-scoped key is present for episode_summary.
    expect(keys).toContain("vd-episode-summary-checkpoint-900");
  });

  it("falls back to summary-only append when the artifact has no planner output (old run)", async () => {
    mockApproveRunCheckpoint.mockResolvedValue(checkpointOutcome());
    mockDb.select
      .mockReturnValueOnce(selectChain([{ episodeNumber: 3 }]))
      .mockReturnValueOnce(
        selectChain([
          {
            jsonPayload: {
              stage: "summarize_episode_to_series_memory",
              episodeNumber: 3,
              summary: "Episode 3 summary (pending approval — not yet applied)",
              pending: true,
            },
          },
        ]),
      );
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

    await router.approveCheckpoint({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        checkpointId: "900",
        decision: "approve",
      },
    });

    // Only the single episode_summary append — no planner-derived kinds.
    expect(mockMemoryService.appendEvent).toHaveBeenCalledTimes(1);
    expect(mockMemoryService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ memoryKind: "episode_summary" }),
    );
  });

  it("short-circuits on an already-terminal checkpoint — never re-appends (idempotency)", async () => {
    mockApproveRunCheckpoint.mockResolvedValue({
      checkpoint: {
        id: 900,
        runId: 800,
        stage: "summarize_episode_to_series_memory",
        state: "approved",
      },
      alreadyTerminal: true,
    });

    await router.approveCheckpoint({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        checkpointId: "900",
        decision: "approve",
      },
    });

    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("does not append any memory events for a non-summarize stage checkpoint", async () => {
    mockApproveRunCheckpoint.mockResolvedValue(
      checkpointOutcome({ stage: "plan_episode_script" }),
    );

    await router.approveCheckpoint({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        checkpointId: "900",
        decision: "approve",
      },
    });

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
