/**
 * Vertical Drama Series memory-system coverage for
 * `verticalDramaEpisodePipeline.ts`'s `summarize_episode_to_series_memory`
 * durable memory writes (2026-07-07 relocation — these used to live inline in
 * the `approveCheckpoint` router mutation; see
 * `verticalDramaEpisodes.memoryWiring.test.ts` for the router-level history).
 *
 * Manual approval was removed from the product workflow: checkpoints are now
 * created already `approved` (see `ensurePendingCheckpoint`), so
 * `approveRunCheckpoint` is no longer the only path that can trigger the
 * memory writes — `runStage` triggers them directly at checkpoint-creation
 * time for new runs. Both paths funnel through the same private
 * `applyEpisodeSummaryMemoryWrites` helper, so this file covers:
 *  - `approveRunCheckpoint`: the LEGACY pending->approved transition path
 *    (old checkpoint rows that predate auto-approval-at-creation) still
 *    appends every memory event kind found in a real
 *    `vertical-drama-series-memory-planner` artifact, exactly as the router
 *    used to.
 *  - `approveRunCheckpoint` on an already-terminal (already-approved)
 *    checkpoint short-circuits and never re-appends anything — this is what
 *    makes the now-dead client auto-approve calls (and any stale UI) safe
 *    no-ops against checkpoints that were auto-approved at creation.
 *  - Falls back to the old summary-only behavior when no planner artifact is
 *    present (old runs / dry_run / plan_only).
 *
 * Same "mock the whole module graph, test the exported method directly"
 * convention as `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`.
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

const { mockMemoryService } = vi.hoisted(() => ({
  mockMemoryService: {
    appendEvent: vi.fn(),
    listEvents: vi.fn(),
    buildEpisodeMemoryBundle: vi.fn(),
    proposeRetcon: vi.fn(),
    approveRetconProposal: vi.fn(),
    rejectRetconProposal: vi.fn(),
  },
}));
vi.mock("../verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: mockMemoryService,
  VerticalDramaSeriesMemoryService: class {},
  memoryRowToEvent: vi.fn(),
}));

// The pipeline imports several other stage-generation services purely for
// their exported functions/error classes — none of them are exercised by
// `approveRunCheckpoint`, so they're stubbed as pass-throughs. (Left
// unmocked, `verticalDramaVideoMotionPromptGeneration.ts` transitively loads
// `enabledLlmModels.ts` -> `llmProviders.ts`, which needs `adminProcedure`
// from `_core/trpc` — outside this test's scope entirely.)
vi.mock("../verticalDramaScriptGeneration", () => ({
  generateEpisodeScript: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaStoryboardGeneration", () => ({
  generateStoryboardShotgrid: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaStartFrameGeneration", () => ({
  generateStartFrameRenderPlan: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaVideoMotionPromptGeneration", () => ({
  generateVideoMotionPromptPack: vi.fn(),
  syncDialogueOntoMotionPromptClips: vi.fn(),
  syncStartFramesOntoMotionPromptClips: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: vi.fn() },
}));
vi.mock("../verticalDramaStoryboardHandoff", () => ({
  createVerticalDramaStoryboardHandoff: vi.fn(),
}));
vi.mock("../verticalDramaSeriesMemoryPlanning", () => ({
  runVerticalDramaSeriesMemoryPlanning: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));
vi.mock("../verticalDramaProductTieIn", () => ({
  extractShotProductPlacements: vi.fn(),
  findPlacementForShot: vi.fn(),
  appendProductPresenceDirective: vi.fn(),
  resolveProductReferenceImageUrls: vi.fn(),
  resolveMarketplaceCaptureProductImageUrls: vi.fn(),
  resolveFrameProductReferenceAssetIds: vi.fn(),
}));

import { VerticalDramaEpisodePipeline } from "../verticalDramaEpisodePipeline";

const pipeline = new VerticalDramaEpisodePipeline();

const owner = { tenantId: "tenant-1", userId: 42, seriesId: 10, episodeId: 100 };

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

/** Build a thenable update-chain stub: `set(...).where(...).returning()` resolves to `rows`. */
function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

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

function pendingCheckpointRow(over: Record<string, unknown> = {}) {
  return {
    id: 900,
    runId: 800,
    stage: "summarize_episode_to_series_memory",
    state: "pending",
    sourceArtifactIds: ["700"],
    notes: null,
    ...over,
  };
}

describe("approveRunCheckpoint — legacy pending->approved summarize_episode_to_series_memory", () => {
  it("appends episode_summary + every other memory event kind from the planner artifact", async () => {
    const checkpoint = pendingCheckpointRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([checkpoint])) // checkpoint lookup in approveRunCheckpoint
      .mockReturnValueOnce(selectChain([{ episodeNumber: 3 }])) // episode lookup
      .mockReturnValueOnce(selectChain([{ jsonPayload: PLANNER_ARTIFACT }])); // artifact lookup
    mockDb.update.mockReturnValue(
      updateChain([{ ...checkpoint, state: "approved", approvedByUserId: 42 }])
    );
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

    const outcome = await pipeline.approveRunCheckpoint(owner, 900, "approve");

    expect(outcome?.alreadyTerminal).toBe(false);

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
    const checkpoint = pendingCheckpointRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([checkpoint]))
      .mockReturnValueOnce(selectChain([{ episodeNumber: 3 }]))
      .mockReturnValueOnce(selectChain([{ jsonPayload: PLANNER_ARTIFACT }]));
    mockDb.update.mockReturnValue(
      updateChain([{ ...checkpoint, state: "approved", approvedByUserId: 42 }])
    );
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

    await pipeline.approveRunCheckpoint(owner, 900, "approve");

    const keys = mockMemoryService.appendEvent.mock.calls.map((c) => c[0].idempotencyKey);
    // No duplicate idempotency keys across all appended events.
    expect(new Set(keys).size).toBe(keys.length);
    // The base checkpoint-scoped key is present for episode_summary.
    expect(keys).toContain("vd-episode-summary-checkpoint-900");
  });

  it("falls back to summary-only append when the artifact has no planner output (old run)", async () => {
    const checkpoint = pendingCheckpointRow();
    mockDb.select
      .mockReturnValueOnce(selectChain([checkpoint]))
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
        ])
      );
    mockDb.update.mockReturnValue(
      updateChain([{ ...checkpoint, state: "approved", approvedByUserId: 42 }])
    );
    mockMemoryService.appendEvent.mockResolvedValue({ memoryEventId: "1" });

    await pipeline.approveRunCheckpoint(owner, 900, "approve");

    // Only the single episode_summary append — no planner-derived kinds.
    expect(mockMemoryService.appendEvent).toHaveBeenCalledTimes(1);
    expect(mockMemoryService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ memoryKind: "episode_summary" })
    );
  });

  it("short-circuits on an already-terminal (already-approved) checkpoint — never re-appends (idempotency)", async () => {
    // This is the case every now-auto-approved checkpoint hits: it is born
    // `approved`, so any later call to `approveRunCheckpoint` (e.g. a stale
    // client auto-approve call, now unreachable in practice but still a safe
    // no-op) must never re-run the memory writes.
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 900,
          runId: 800,
          stage: "summarize_episode_to_series_memory",
          state: "approved",
          sourceArtifactIds: ["700"],
        },
      ])
    );

    const outcome = await pipeline.approveRunCheckpoint(owner, 900, "approve");

    expect(outcome?.alreadyTerminal).toBe(true);
    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
    // Only the single checkpoint-lookup select — no episode/artifact lookups either.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("does not append any memory events for a non-summarize stage checkpoint", async () => {
    const checkpoint = pendingCheckpointRow({ stage: "plan_episode_script" });
    mockDb.select.mockReturnValueOnce(selectChain([checkpoint]));
    mockDb.update.mockReturnValue(
      updateChain([{ ...checkpoint, state: "approved", approvedByUserId: 42 }])
    );

    const outcome = await pipeline.approveRunCheckpoint(owner, 900, "approve");

    expect(outcome?.alreadyTerminal).toBe(false);
    expect(mockMemoryService.appendEvent).not.toHaveBeenCalled();
  });
});
