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
});
