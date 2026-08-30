/**
 * Vertical Drama Series — `generateStoryBibleDeep` / `extendStoryDraftHorizon`
 * mutation coverage (W10-A, added 2026-07-08).
 *
 * Mocks `../../services/verticalDramaStoryBible` via `importOriginal` so the
 * PURE helpers (`appendBreakdownVersion`, `getActiveBreakdown`,
 * `readActiveDeepDraftMetadata`, `readItemShotDrafts`,
 * `readItemCliffhangerLine`, `resolveDeepDraftHorizon`, the real
 * `InsufficientCreditsError`/`VdSchemaValidationError` classes, etc.) stay
 * REAL — only the LLM-calling `generateStoryBibleDeep` entry point itself is
 * replaced with a `vi.fn()`. This both keeps the merge/version-append logic
 * genuinely exercised AND guarantees `instanceof` checks in the router's
 * catch blocks match the SAME class references the mock can throw.
 *
 * The `_core/trpc` mock below is a REAL (if minimal) middleware composer —
 * unlike the simpler "`.use()` is a no-op passthrough" convention used by
 * sibling test files (e.g. `verticalDramaSeries.arcReplan.test.ts`) — so the
 * "flag off -> FORBIDDEN + no writes" tests actually exercise the
 * `requireFeatureFlag` chain instead of bypassing it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

type TrpcMiddleware = (opts: { ctx: any; next: (o?: { ctx?: any }) => Promise<any> }) => any;

function makeProcedure(middlewares: TrpcMiddleware[]): any {
  const proc: any = {
    use: (mw: TrpcMiddleware) => makeProcedure([...middlewares, mw]),
    input: () => proc,
    query: (handler: Function) => buildHandler(handler),
    mutation: (handler: Function) => buildHandler(handler),
  };
  function buildHandler(handler: Function) {
    return async (opts: { ctx: any; input?: any }) => {
      let lastIndex = -1;
      const dispatch = async (i: number, ctx: any): Promise<any> => {
        if (i <= lastIndex) throw new Error("next() called multiple times");
        lastIndex = i;
        if (i === middlewares.length) {
          return handler({ ctx, input: opts.input });
        }
        return middlewares[i]({ ctx, next: (o?: { ctx?: any }) => dispatch(i + 1, o?.ctx ?? ctx) });
      };
      return dispatch(0, opts.ctx);
    };
  }
  return proc;
}

vi.mock("../../_core/trpc", () => ({
  router: (routes: Record<string, unknown>) => routes,
  protectedProcedure: makeProcedure([]),
}));

// A minimal but REAL flag check (unlike sibling test files' `(x) => x`
// passthrough) so "flag off" tests actually exercise the gate. Reads
// `ctx.tenantFlags[flag]` instead of hitting a real tenant/db lookup.
vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: (flag: string) => async ({ ctx, next }: any) => {
    const flags = ctx.tenantFlags ?? {};
    if (flags[flag] !== true) {
      throw { code: "FORBIDDEN", message: `Feature '${flag}' is not enabled for this tenant` };
    }
    return next();
  },
}));

// `verticalDramaStoryBible.ts` is loaded via `importOriginal` below (to keep
// its PURE helpers real — see file header) which means ITS OWN top-level
// imports are evaluated for real too. Without these, `./enabledLlmModels`
// transitively pulls in `routers/llmProviders.ts`, which needs an
// `adminProcedure` export this file's minimal `_core/trpc` mock doesn't
// provide. None of these four services are exercised by these tests (every
// call that would reach them goes through the mocked `generateStoryBibleDeep`
// below instead) — mirrors `verticalDramaStoryBible.speechBudget.test.ts`'s
// own mock set for the exact same reason.
vi.mock("../../services/enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => []),
}));
vi.mock("../../services/intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => null),
}));
// Async story jobs (#28) — `hasEnoughCredits` defaults to `true` (the
// mutation's own sync PRE-CHECK, run BEFORE enqueueing) so every pre-existing
// test below reaches enqueue/the executor unimpeded; tests that specifically
// exercise the precheck override with `.mockResolvedValueOnce(false)`.
const { mockHasEnoughCredits } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(() => Promise.resolve(true)),
}));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(() => 0),
}));
vi.mock("../../services/llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

const { mockGenerateStoryBible, mockGenerateStoryBibleDeep } = vi.hoisted(() => ({
  mockGenerateStoryBible: vi.fn(),
  mockGenerateStoryBibleDeep: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryBible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/verticalDramaStoryBible")>();
  return {
    ...actual,
    generateStoryBible: mockGenerateStoryBible,
    generateStoryBibleDeep: mockGenerateStoryBibleDeep,
  };
});

const { mockRunVerticalDramaLedgerPlanning } = vi.hoisted(() => ({
  mockRunVerticalDramaLedgerPlanning: vi.fn(),
}));
vi.mock("../../services/verticalDramaLedgerPlanner", () => ({
  runVerticalDramaLedgerPlanning: mockRunVerticalDramaLedgerPlanning,
}));

vi.mock("../../services/verticalDramaArcReplan", () => ({
  applyApprovedArcReplan: vi.fn(),
}));

const { mockListEvents, mockAppendEvent } = vi.hoisted(() => ({
  mockListEvents: vi.fn(),
  mockAppendEvent: vi.fn(),
}));
vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: {
    listEvents: mockListEvents,
    appendEvent: mockAppendEvent,
  },
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

// Async story jobs (#28) — the router statically imports
// `enqueueVerticalDramaStoryJob` from this service; mocked so
// `generateStoryBibleDeep`/`extendStoryDraftHorizon` mutation-level tests
// exercise ONLY the fail-fast guards + enqueue call, never the real
// Redis/BullMQ-backed implementation (covered separately by
// `services/__tests__/verticalDramaStoryJobs.test.ts`).
const { mockEnqueueVerticalDramaStoryJob, mockEnqueueVerticalDramaStoryJobHandoff, mockSubmitVerticalDramaSystemFeedback } = vi.hoisted(() => ({
  mockEnqueueVerticalDramaStoryJob: vi.fn(),
  mockEnqueueVerticalDramaStoryJobHandoff: vi.fn(),
  mockSubmitVerticalDramaSystemFeedback: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryJobs", () => ({
  enqueueVerticalDramaStoryJob: mockEnqueueVerticalDramaStoryJob,
  enqueueVerticalDramaStoryJobHandoff: mockEnqueueVerticalDramaStoryJobHandoff,
  getVerticalDramaStoryJobStatus: vi.fn(),
  getActiveVerticalDramaStoryJob: vi.fn(),
  // Phase F (added 2026-07-09) — additive partial-system-failure feedback
  // bridge; covered by its own describe block below.
  submitVerticalDramaSystemFeedback: mockSubmitVerticalDramaSystemFeedback,
}));

import {
  verticalDramaSeriesRouter,
  updateEpisodeDraftDialogueInput,
  runGenerateStoryBiblePlanJob,
  runGenerateStoryBibleDeepJob,
  runExtendStoryDraftHorizonJob,
} from "../verticalDramaSeries";
import {
  appendBreakdownVersion,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER,
  type VdDeepDraftShotDraft,
} from "../../services/verticalDramaStoryBible";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx(
  overrides: Partial<{
    tenantId: string | null;
    user: { id: number; role: string };
    tenantFlags: Record<string, boolean>;
  }> = {},
) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: true },
    ...overrides,
  };
}

/** Thenable select-chain stub, mirrors `verticalDramaSeries.arcReplan.test.ts`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    groupBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

/** Thenable update-chain stub — kept as a reference so `.set.mock.calls` is inspectable. */
function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

const NINE_SHOTS: VdDeepDraftShotDraft[] = Array.from({ length: 9 }, (_, i) => ({
  shot_number: i + 1,
  summary: `Shot ${i + 1} summary`,
  dialogue_lines: [{ speaker: "Aria", line: `บทพูดช็อต ${i + 1}` }],
}));

const COMPLETENESS_OK = {
  dialogueEveryShot: true,
  allSpeakable: true,
  estimatedSpeechSeconds: 40,
  coverageStatus: "ok" as const,
};

function plannedItem(episodeNumber: number) {
  return {
    episodeNumber,
    workingTitle: `Ep${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: [`Beat ${episodeNumber}`],
  };
}

const COMPATIBILITY_RELATIONSHIP_GRAPH = {
  graphRevisionId: "test-graph",
  fingerprint: "test-graph-fingerprint",
  nodes: [],
  edges: [],
  familyGroups: [],
};

function withCompatibilityGraph(bible: Record<string, unknown>) {
  return {
    ...bible,
    longForm: {
      ...(bible.longForm as Record<string, unknown> | undefined),
      relationshipGraph: COMPATIBILITY_RELATIONSHIP_GRAPH,
    },
  };
}

function draftedResultItem(episodeNumber: number) {
  return {
    episodeNumber,
    shotDrafts: NINE_SHOTS,
    cliffhanger_line: `Cliff ${episodeNumber}`,
    draftCompleteness: COMPLETENESS_OK,
  };
}

/** Premium multi-round drafts (W11-A) — a drafted result item WITH a `draftScorecard`, as `generateStoryBibleDeep({..., mode: "premium"})` would return. */
const SCORECARD_OK = {
  hook_strength: 5,
  reversal_sharpness: 5,
  emotion_variety: 5,
  dialogue_naturalness: 5,
  pacing: 5,
  cliffhanger_strength: 5,
  continuity_with_recap: 5,
  season_cohesion: 5,
  overall: 5,
  judgedAtRound: 0,
};

function draftedResultItemPremium(episodeNumber: number) {
  return { ...draftedResultItem(episodeNumber), draftScorecard: SCORECARD_OK };
}

/** Premium multi-round drafts (W11-A) — `GenerateStoryBibleDeepResult.premiumMetrics`, as the service would return it for a `mode: "premium"` run. */
const PREMIUM_METRICS = {
  mode: "premium" as const,
  candidateCount: 3,
  roundsUsedPerChunk: [0],
  firstPassGatePassRate: 1,
  episodesBelowFloorAfter: 0,
  sweepIssuesFound: 0,
  callsMade: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListEvents.mockResolvedValue([]);
  mockDb.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve(undefined)) });
  mockGetTenantFeatureFlags.mockResolvedValue({});
  mockRunVerticalDramaLedgerPlanning.mockResolvedValue({
    ledgers: {
      evidenceLedger: [],
      characterActivationLedger: [],
      threatLadder: [],
      consequenceLedger: [],
      threadLedger: [],
      worldRuleLedger: [],
      causalChainMap: [],
    },
    creditsUsed: 0,
  });
  mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({}));
});

/* -------------------------------------------------------------------------- */
/* Feature flag gating                                                        */
/* -------------------------------------------------------------------------- */

describe("feature flag gating — verticalDramaSeriesDeepStoryDrafts", () => {
  it("generateStoryBibleDeep throws FORBIDDEN and makes no db calls when the dedicated flag is off", async () => {
    await expect(
      router.generateStoryBibleDeep({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockGenerateStoryBibleDeep).not.toHaveBeenCalled();
  });

  it("extendStoryDraftHorizon throws FORBIDDEN and makes no db calls when the dedicated flag is off", async () => {
    await expect(
      router.extendStoryDraftHorizon({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockGenerateStoryBibleDeep).not.toHaveBeenCalled();
  });

  it("fails closed when the BASE verticalDramaSeries flag is off, even if deep-drafts is on", async () => {
    await expect(
      router.generateStoryBibleDeep({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: false, verticalDramaSeriesDeepStoryDrafts: true } }),
        input: { seriesId: "10" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("FORBIDDEN + no db calls is UNCHANGED for mode: \"premium\" too — the dedicated flag gate runs before mode is ever read (W11-A)", async () => {
    await expect(
      router.generateStoryBibleDeep({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10", mode: "premium" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockGenerateStoryBibleDeep).not.toHaveBeenCalled();

    await expect(
      router.extendStoryDraftHorizon({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10", mode: "premium" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockGenerateStoryBibleDeep).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryBibleDeep                                                     */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — input/ownership/precondition guards (mutation, fail-fast before enqueue)", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.generateStoryBibleDeep({ ctx: ctx(), input: { seriesId: "not-a-number" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(
      router.generateStoryBibleDeep({ ctx: ctx(), input: { seriesId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the series has no active breakdown yet", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 10,
          tenantId: "tenant-1",
          userId: 42,
          targetEpisodeCount: 5,
          bible: withCompatibilityGraph({}),
        },
      ]),
    );
    await expect(
      router.generateStoryBibleDeep({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when no planned episode falls within the requested horizon", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 10,
          tenantId: "tenant-1",
          userId: 42,
          targetEpisodeCount: 5,
          bible: withCompatibilityGraph({ episodeBreakdown: [plannedItem(1)] }),
        },
      ]),
    );
    await expect(
      router.generateStoryBibleDeep({ ctx: ctx(), input: { seriesId: "10", horizonEpisodes: 0 } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN from the sync credits pre-check and never enqueues", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 10,
          tenantId: "tenant-1",
          userId: 42,
          targetEpisodeCount: 2,
          bible: withCompatibilityGraph({ episodeBreakdown: [plannedItem(1), plannedItem(2)] }),
        },
      ]),
    );
    mockHasEnoughCredits.mockResolvedValueOnce(false);

    await expect(
      router.generateStoryBibleDeep({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });
});

describe("generateStoryBibleDeep — mutation: enqueue + dedupe", () => {
  const seriesRow = {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    targetEpisodeCount: 3,
    bible: withCompatibilityGraph({ episodeBreakdown: [plannedItem(1), plannedItem(2), plannedItem(3)] }),
  };

  it("enqueues a deep_generate job with the light kind-specific input and returns { jobId, deduped }", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockEnqueueVerticalDramaStoryJob.mockResolvedValueOnce({ jobId: "job-1", deduped: false });

    const result = await router.generateStoryBibleDeep({
      ctx: ctx(),
      input: { seriesId: "10", horizonEpisodes: 2, idempotencyKey: "key-1", mode: "premium" },
    });

    // Silent-no-op fix (plan `planning/vertical-drama-deep-draft-update-all-noop`,
    // 2026-07-14) — the return shape gained `alreadyComplete` so the client can
    // distinguish an enqueued run from the "nothing left to draft" short-circuit.
    expect(result).toEqual({ jobId: "job-1", deduped: false, alreadyComplete: false, runId: null });
    expect(mockEnqueueVerticalDramaStoryJob).toHaveBeenCalledWith({
      kind: "deep_generate",
      seriesId: 10,
      tenantId: "tenant-1",
      userId: 42,
      input: { horizonEpisodes: 2, mode: "premium", idempotencyKey: "key-1" },
    });
    // The mutation itself never touches the DB beyond the initial ownership read — persistence is the worker's job now.
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockGenerateStoryBibleDeep).not.toHaveBeenCalled();
  });

  it("double-spend guard: forwards deduped: true + the EXISTING jobId as-is when a job is already active for this series", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockEnqueueVerticalDramaStoryJob.mockResolvedValueOnce({ jobId: "existing-job", deduped: true });

    const result = await router.generateStoryBibleDeep({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result).toEqual({ jobId: "existing-job", deduped: true, alreadyComplete: false, runId: null });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("alreadyComplete short-circuit: when every episode within the horizon already has shot drafts, returns { jobId: null, alreadyComplete: true } WITHOUT enqueuing or charging credits", async () => {
    // Silent-no-op fix (plan `planning/vertical-drama-deep-draft-update-all-noop`,
    // 2026-07-14) — the exact scenario that read as "the button just stops":
    // a large series whose resolved horizon is fully covered by already-drafted
    // episodes must NOT enqueue a doomed job that makes zero LLM calls.
    const fullyDraftedRow = {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      targetEpisodeCount: 3,
        bible: withCompatibilityGraph({
          episodeBreakdown: [
            { ...plannedItem(1), shotDrafts: NINE_SHOTS },
            { ...plannedItem(2), shotDrafts: NINE_SHOTS },
            { ...plannedItem(3), shotDrafts: NINE_SHOTS },
          ],
        }),
    };
    mockDb.select.mockReturnValueOnce(selectChain([fullyDraftedRow]));

    const result = await router.generateStoryBibleDeep({
      ctx: ctx(),
      input: { seriesId: "10", horizonEpisodes: 3 },
    });

    expect(result).toEqual({ jobId: null, deduped: false, alreadyComplete: true, runId: null });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* runGenerateStoryBibleDeepJob — worker executor (the OLD synchronous        */
/* mutation body's exact logic, now the async job's worker-side "meat")       */
/* -------------------------------------------------------------------------- */

describe("runGenerateStoryBibleDeepJob — ownership/precondition guards", () => {
  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(
      runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 999 }, vi.fn()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the series has no active breakdown yet", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ id: 10, tenantId: "tenant-1", userId: 42, targetEpisodeCount: 5, bible: null }]),
    );
    await expect(
      runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn()),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockGenerateStoryBibleDeep).not.toHaveBeenCalled();
  });
});

describe("runGenerateStoryBiblePlanJob — durable candidate checkpoint", () => {
  const seriesRow = {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Checkpointed story",
    locale: "th",
    genre: "romance",
    tone: "dramatic",
    targetEpisodeCount: 1,
    defaultEpisodeDurationSeconds: 60,
    bible: withCompatibilityGraph({}),
  };
  const candidate = {
    expandedSeasonArc: "Season arc",
    refinedCharacters: [
      {
        name: "Aria",
        role: "lead",
        description: "Lead character",
        narrativeRole: "protagonist",
        roleTier: "tier1",
        occupation: "Lawyer",
      },
    ],
    episodeBreakdown: [
      { episodeNumber: 1, workingTitle: "First", logline: "Start", keyBeats: ["Beat"] },
    ],
  };

  function seedPlanDb() {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
  }

  it("checkpoints the validated provider result and resumes without another provider call or handoff duplication", async () => {
    mockGenerateStoryBible.mockResolvedValueOnce({
      expanded: candidate,
      creditsUsed: 7,
      model: "test-model",
    });
    mockEnqueueVerticalDramaStoryJobHandoff.mockResolvedValue({
      jobId: "deep-1",
      deduped: false,
    });
    seedPlanDb();
    const persistCheckpointAndWait = vi.fn(async (checkpoint: any) => undefined);
    const progress = vi.fn();
    const first = await runGenerateStoryBiblePlanJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, jobId: "plan-1" },
      progress,
      {
        checkpoint: null,
        persistCheckpoint: vi.fn(),
        persistCheckpointAndWait,
      },
    );

    expect(mockGenerateStoryBible).toHaveBeenCalledTimes(1);
    expect(persistCheckpointAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        planStage: "candidate_ready",
        planCandidate: candidate,
        planCreditsUsed: 7,
        planModel: "test-model",
      }),
    );
    expect(mockEnqueueVerticalDramaStoryJobHandoff).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ deepJobId: "deep-1", creditsUsed: 7 });

    const checkpoint = persistCheckpointAndWait.mock.calls[0][0];
    seedPlanDb();
    const resumed = await runGenerateStoryBiblePlanJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, jobId: "plan-1" },
      progress,
      {
        checkpoint,
        persistCheckpoint: vi.fn(),
        persistCheckpointAndWait: vi.fn(async () => undefined),
      },
    );

    expect(mockGenerateStoryBible).toHaveBeenCalledTimes(1);
    expect(mockEnqueueVerticalDramaStoryJobHandoff).toHaveBeenCalledTimes(2);
    expect(resumed).toMatchObject({ deepJobId: "deep-1", creditsUsed: 7 });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ stage: "candidate_saved" }));
  });

  it("continues automatically with a durable plan fallback after provider/schema failure", async () => {
    mockGenerateStoryBible.mockRejectedValueOnce(
      new VdSchemaValidationError("bad plan json", { issues: [] }),
    );
    mockEnqueueVerticalDramaStoryJobHandoff.mockResolvedValueOnce({
      jobId: "deep-fallback-1",
      deduped: false,
    });
    seedPlanDb();
    const persistCheckpointAndWait = vi.fn(async () => undefined);

    const result = await runGenerateStoryBiblePlanJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, jobId: "plan-fallback-1" },
      vi.fn(),
      {
        checkpoint: null,
        persistCheckpoint: vi.fn(),
        persistCheckpointAndWait,
      },
    );

    expect(result).toMatchObject({
      model: "deterministic-plan-fallback",
      deepJobId: "deep-fallback-1",
      creditsUsed: 0,
    });
    expect(persistCheckpointAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        planStage: "candidate_ready",
        planModel: "deterministic-plan-fallback",
        planCandidate: expect.objectContaining({
          expandedSeasonArc: expect.any(String),
          refinedCharacters: expect.arrayContaining([
            expect.objectContaining({ name: "ตัวละครหลัก" }),
          ]),
          episodeBreakdown: expect.arrayContaining([
            expect.objectContaining({
              episodeNumber: 1,
              keyBeats: expect.any(Array),
            }),
          ]),
        }),
      }),
    );
    expect(mockEnqueueVerticalDramaStoryJobHandoff).toHaveBeenCalledTimes(1);
  });
});

describe("runGenerateStoryBibleDeepJob — happy path", () => {
  it("drafts only the resolved horizon, merges shotDrafts into covered items, leaves the rest untouched, moves the version pointer, and threads onProgress into the service call", async () => {
    const seriesRow = {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: "romance",
      tone: "dramatic",
      targetEpisodeCount: 3,
      defaultEpisodeDurationSeconds: 60,
      bible: { episodeBreakdown: [plannedItem(1), plannedItem(2), plannedItem(3)] },
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [draftedResultItem(1), draftedResultItem(2)],
      chunkSizes: [2],
      partial: false,
      creditsUsed: 6,
      model: "test-model",
      warnings: [],
      finalOpenThreads: ["thread-x"],
    });

    const onProgress = vi.fn();
    const result = await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 2 },
      onProgress,
    );

    // Service called with ONLY the horizon-covered episodes, and the SAME onProgress callback passed straight through.
    expect(mockGenerateStoryBibleDeep).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.episodes.map((e: any) => e.episodeNumber)).toEqual([1, 2]);
    expect(callArgs.onProgress).toBe(onProgress);
    expect(mockRunVerticalDramaLedgerPlanning).not.toHaveBeenCalled();

    // Persisted bible: one new version; episodes 1-2 carry shotDrafts,
    // episode 3 is untouched (no shotDrafts key at all).
    expect(chain.set).toHaveBeenCalledTimes(1);
    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(1);
    const items = versions[0].items as Array<Record<string, unknown>>;
    expect(items[0].shotDrafts).toBe(NINE_SHOTS);
    expect(items[0].cliffhanger_line).toBe("Cliff 1");
    expect(items[1].shotDrafts).toBe(NINE_SHOTS);
    expect(items[2]).toEqual(plannedItem(3));
    expect("shotDrafts" in items[2]).toBe(false);
    expect(setArg.bible.activeBreakdownVersionId).toBe(versions[0].versionId);
    expect(versions[0].deepDraft).toEqual(
      expect.objectContaining({ horizonEndEpisode: 2, chunkSizes: [2] }),
    );

    // Best-effort audit event written.
    expect(mockDb.insert).toHaveBeenCalledTimes(1);

    // Return shape is the EXACT old synchronous mutation's result — now the job record's `result`.
    expect(result.partial).toBe(false);
    expect(result.horizonEndEpisode).toBe(2);
    expect(result.chunkSizes).toEqual([2]);
    expect(result.creditsUsed).toBe(6);
  });

  it("threads the bible's refinedCharacters into knownCharacters (Phase 2.0) and flattens name+aliases into characterBibleNames (Phase 2.1/2.5)", async () => {
    const seriesRow = {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: "romance",
      tone: "dramatic",
      targetEpisodeCount: 3,
      defaultEpisodeDurationSeconds: 60,
      bible: {
        refinedCharacters: [
          {
            name: "คิริน วัฒนเมธา",
            role: "lead",
            narrativeRole: "protagonist",
            roleTier: "lead_male",
            aliases: ["คิริน"],
          },
          { name: "ลลิน ศิริกุล", role: "lead", aliases: [] },
        ],
        episodeBreakdown: [plannedItem(1), plannedItem(2), plannedItem(3)],
      },
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [draftedResultItem(1), draftedResultItem(2)],
      chunkSizes: [2],
      partial: false,
      creditsUsed: 6,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 2 },
      vi.fn(),
    );

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    // Phase 2.0 — full profiles (including aliases), reused for the
    // "CHARACTER BIBLE" prompt block.
    expect(callArgs.knownCharacters).toEqual([
      expect.objectContaining({ name: "คิริน วัฒนเมธา", aliases: ["คิริน"] }),
      expect.objectContaining({ name: "ลลิน ศิริกุล" }),
    ]);
    // Phase 2.1/2.5 — canonical name + declared alias flattened into ONE
    // flat list for the completeness gate's membership check.
    expect(callArgs.characterBibleNames).toEqual(
      expect.arrayContaining(["คิริน วัฒนเมธา", "คิริน", "ลลิน ศิริกุล"]),
    );
  });

  it("runs ledger_plan before draft when F132B is on, persists ledgers on the new version, and includes ledger credits", async () => {
    const seriesRow = {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: "romance",
      tone: "dramatic",
      targetEpisodeCount: 3,
      defaultEpisodeDurationSeconds: 60,
      bible: {
        refinedCharacters: [{ name: "Aria", role: "lead" }],
        episodeBreakdown: [plannedItem(1), plannedItem(2), plannedItem(3)],
      },
    };
    const plannedLedgers = {
      evidenceLedger: [{ id: "e1", label: "note", introducedEpisode: 1 }],
      characterActivationLedger: [],
      threatLadder: [],
      consequenceLedger: [],
      threadLedger: [],
      worldRuleLedger: [],
      causalChainMap: [],
    };
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaQualityLedgers: true });
    mockRunVerticalDramaLedgerPlanning.mockImplementation(async (params: any) => {
      params.onProgress?.({ phase: "ledger" });
      return {
        ledgers: plannedLedgers,
        creditsUsed: 4,
      };
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [draftedResultItem(1), draftedResultItem(2)],
      chunkSizes: [2],
      partial: false,
      creditsUsed: 6,
      model: "test-model",
      warnings: [],
      finalOpenThreads: ["thread-x"],
      missingEpisodes: [],
    });

    const phases: string[] = [];
    const result = await runGenerateStoryBibleDeepJob(
      {
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        horizonEpisodes: 2,
        idempotencyKey: "deep-key",
      },
      (progress) => phases.push(progress.phase),
    );

    expect(mockRunVerticalDramaLedgerPlanning).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        seriesId: 10,
        activeBreakdown: seriesRow.bible.episodeBreakdown,
        idempotencyKey: "deep-key:ledger_plan",
      }),
    );
    expect(phases[0]).toBe("ledger");
    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions[0].ledgers).toEqual(plannedLedgers);
    expect(setArg.bible.ledgers).toEqual(plannedLedgers);
    expect(result.creditsUsed).toBe(10);
  });

  it("completes the season from the approved plan when the service returns a partial result", async () => {
    const seriesRow = {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: null,
      tone: null,
      targetEpisodeCount: 10,
      defaultEpisodeDurationSeconds: 60,
      bible: { episodeBreakdown: Array.from({ length: 10 }, (_, i) => plannedItem(i + 1)) },
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2, 3, 4, 5].map(draftedResultItem),
      chunkSizes: [5],
      partial: true,
      creditsUsed: 15,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      error: "second chunk failed schema validation",
    });

    const result = await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    expect(chain.set).toHaveBeenCalledTimes(1);
    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    const items = versions[0].items as Array<Record<string, unknown>>;
    expect(items.filter((i) => "shotDrafts" in i)).toHaveLength(10);

    expect(result.partial).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.horizonEndEpisode).toBe(10);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          episodeNumber: 10,
          reason: "automatic_completion_fallback",
        }),
      ]),
    );
  });

  it("live-bug fix: passes missingEpisodes through, and horizonEndEpisode honestly reflects only the contiguous coverage actually drafted (never the gap)", async () => {
    const seriesRow = {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: null,
      tone: null,
      targetEpisodeCount: 10,
      defaultEpisodeDurationSeconds: 60,
      bible: { episodeBreakdown: Array.from({ length: 10 }, (_, i) => plannedItem(i + 1)) },
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    // Episode 10 is STILL missing even after the service's own corrective
    // retry — episodes 1-9 (contiguous) are the only ones actually drafted.
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(draftedResultItem),
      chunkSizes: [5, 4],
      partial: true,
      creditsUsed: 27,
      model: "test-model",
      warnings: [{ episodeNumber: 10, shotNumber: 0, reason: "episode_missing_after_retry" }],
      finalOpenThreads: [],
      error: "chunk (episodes 6-10) is still missing episode(s) 10 after a corrective retry",
      missingEpisodes: [10],
    });

    const result = await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    // The missing episode is completed from the approved plan after the
    // provider retries, so the published horizon is complete.
    expect(result.horizonEndEpisode).toBe(10);
    expect(result.partial).toBe(false);
    expect((result as { missingEpisodes: number[] }).missingEpisodes).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ episodeNumber: 10, reason: "automatic_completion_fallback" }),
      ]),
    );

    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions[0].deepDraft).toEqual(
      expect.objectContaining({ horizonEndEpisode: 10 }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* Stage 2.4 threading (`planning/vd-series-memory-and-lineage/plan.md`,      */
/* added 2026-07-17) — `runGenerateStoryBibleDeepJob` building and passing    */
/* `seasonLineage` for a sequel row.                                          */
/* -------------------------------------------------------------------------- */

describe("runGenerateStoryBibleDeepJob — Stage 2.4 seasonLineage threading", () => {
  const PLANNED_ONE = { bible: { episodeBreakdown: [plannedItem(1)] } };

  function baseSeriesRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 20,
      tenantId: "tenant-1",
      userId: 42,
      title: "Time-Crossed Love: Season 2",
      locale: "th",
      genre: "romance",
      tone: "dramatic",
      targetEpisodeCount: 10,
      defaultEpisodeDurationSeconds: 60,
      parentSeriesId: null,
      createMode: null,
      seasonNumber: null,
      lineage: null,
      ...PLANNED_ONE,
      ...overrides,
    };
  }

  function parentSeriesRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 16,
      tenantId: "tenant-1",
      userId: 42,
      title: "Time-Crossed Love",
      genre: "romance",
      tone: "dramatic",
      locale: "th",
      targetEpisodeCount: 30,
      bible: {},
      memory: null,
      ...overrides,
    };
  }

  const CARRY_OVER_SNAPSHOT = {
    contractVersion: 1,
    characters: [
      {
        characterKey: "kai",
        name: "Kai",
        postFinaleStatus: "reunited with Mai",
        availability: "returns",
      },
      {
        characterKey: "villain1",
        name: "Chana",
        postFinaleStatus: "sent to prison",
        availability: "write_out",
      },
    ],
    newCharacterSuggestions: [],
    newConflictDirections: ["a new rival heir emerges"],
    antagonistStrategy: "new antagonist introduced; Chana referenced only in flashback",
    carriedRelationships: [
      {
        pair: ["kai", "mai"],
        status: "engaged",
        disclosure: "public",
        knownBy: ["kai", "mai"],
        sinceEpisode: 28,
      },
    ],
    carriedThreads: [
      {
        threadId: "t-house",
        description: "renovation of the family house still unfinished",
        threadClass: "domestic",
        openedEpisode: 5,
      },
    ],
  };

  function lineageSnapshot(overrides: Record<string, unknown> = {}) {
    return {
      contractVersion: 1,
      parentSeriesId: 16,
      parentTitle: "Time-Crossed Love",
      parentEpisodeCount: 30,
      createMode: "sequel",
      seasonNumber: 2,
      priorSeasonSummary: "Kai and Mai found each other again across time.",
      carryOver: CARRY_OVER_SNAPSHOT,
      ...overrides,
    };
  }

  it("non-sequel row (createMode null, the pre-existing shape of every series) passes seasonLineage: undefined and makes no extra db calls", async () => {
    const seriesRow = baseSeriesRow();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const selectCallsBefore = mockDb.select;
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [draftedResultItem(1)],
      chunkSizes: [1],
      partial: false,
      creditsUsed: 3,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 20 },
      vi.fn(),
    );

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.seasonLineage).toBeUndefined();
    // Zero extra planning selects beyond the pre-existing baseline (main
    // row, the best-effort `existingLocations` attempt, and
    // `ensureRosterCharactersFromStory`'s existing-roster read). The fourth
    // select is the additive compatibility mirror query for the materialized
    // episode row and does not affect the lineage payload.
    // series that predates this feature: `resolveSeasonLineageContext`
    // short-circuits on `createMode !== "sequel"` with no DB call of its own.
    expect(selectCallsBefore).toHaveBeenCalledTimes(4);
  });

  it("sequel whose parent HAS recorded memory: builds seasonLineage from the LIVE parent projection (freshest facts) plus the carry-over snapshot", async () => {
    const parentRow = parentSeriesRow({
      memory: {
        contractVersion: 1,
        episodes: [],
        currentState: {
          relationships: [
            {
              pair: ["kai", "mai"],
              status: "married",
              disclosure: "public",
              knownBy: ["kai", "mai", "chana"],
              sinceEpisode: 30,
            },
          ],
          openThreads: [
            {
              threadId: "t-house",
              description: "renovation of the family house still unfinished",
              threadClass: "domestic",
              openedEpisode: 5,
            },
          ],
          canonicalFacts: ["Kai inherited the family estate"],
          characterKnowledge: { kai: ["Mai's real identity"] },
        },
        compactSummary: "Kai and Mai married after reconciling across timelines.",
        lastFoldedEpisode: 30,
      },
    });
    const seriesRow = baseSeriesRow({
      parentSeriesId: 16,
      createMode: "sequel",
      seasonNumber: 2,
      lineage: lineageSnapshot(),
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow])) // main row (loadOwnedSeries)
      .mockReturnValueOnce(selectChain([])) // existingLocations (child, best-effort)
      .mockReturnValueOnce(selectChain([parentRow])) // parent row (loadOwnedSeries)
      .mockReturnValueOnce(selectChain([])) // parent roster (loadLineageContext)
      .mockReturnValueOnce(selectChain([])); // parent locations (loadLineageContext)
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [draftedResultItem(1)],
      chunkSizes: [1],
      partial: false,
      creditsUsed: 3,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 20 },
      vi.fn(),
    );

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.seasonLineage).toEqual({
      seasonNumber: 2,
      parentTitle: "Time-Crossed Love",
      priorSeasonSummary: "Kai and Mai married after reconciling across timelines.",
      carriedRelationships: [
        {
          pair: ["kai", "mai"],
          status: "married",
          disclosure: "public",
          knownBy: ["kai", "mai", "chana"],
          sinceEpisode: 30,
        },
      ],
      carriedThreads: [
        {
          threadId: "t-house",
          description: "renovation of the family house still unfinished",
          threadClass: "domestic",
          openedEpisode: 5,
        },
      ],
      carriedCharacters: [
        { characterKey: "kai", name: "Kai", postFinaleStatus: "reunited with Mai" },
      ],
      writtenOutCharacters: [{ characterKey: "villain1", name: "Chana" }],
      antagonistStrategy: "new antagonist introduced; Chana referenced only in flashback",
      characterKnowledge: { kai: ["Mai's real identity"] },
    });
  });

  it("sequel whose parent has NO recorded memory: does not crash, and degrades to the carry-over snapshot's facts with empty memory-derived fields (never garbage)", async () => {
    const parentRow = parentSeriesRow({ memory: null });
    const seriesRow = baseSeriesRow({
      parentSeriesId: 16,
      createMode: "sequel",
      seasonNumber: 2,
      lineage: lineageSnapshot(),
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([parentRow]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [draftedResultItem(1)],
      chunkSizes: [1],
      partial: false,
      creditsUsed: 3,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    const result = await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 20 },
      vi.fn(),
    );

    expect(result.partial).toBe(false);
    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    // Memory-derived fields degrade to the honest "nothing recorded" empty
    // default — never fabricated text — while the carry-over snapshot's
    // OWN facts (independent of live memory) still come through.
    expect(callArgs.seasonLineage).toEqual({
      seasonNumber: 2,
      parentTitle: "Time-Crossed Love",
      priorSeasonSummary: "",
      carriedRelationships: [],
      carriedThreads: [],
      carriedCharacters: [
        { characterKey: "kai", name: "Kai", postFinaleStatus: "reunited with Mai" },
      ],
      writtenOutCharacters: [{ characterKey: "villain1", name: "Chana" }],
      antagonistStrategy: "new antagonist introduced; Chana referenced only in flashback",
      characterKnowledge: {},
    });
  });

  it("sequel whose parent has been DELETED (parentSeriesId SET NULL by the FK): falls back to the lineage snapshot, never throws", async () => {
    const seriesRow = baseSeriesRow({
      parentSeriesId: null, // ON DELETE SET NULL already applied
      createMode: "sequel",
      seasonNumber: 2,
      lineage: lineageSnapshot(),
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow])) // main row
      .mockReturnValueOnce(selectChain([])); // existingLocations (child, best-effort)
    // No parent row select at all — `parentSeriesId` is null, so this
    // function must never attempt to load a parent.
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [draftedResultItem(1)],
      chunkSizes: [1],
      partial: false,
      creditsUsed: 3,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await expect(
      runGenerateStoryBibleDeepJob(
        { tenantId: "tenant-1", userId: 42, seriesId: 20 },
        vi.fn(),
      ),
    ).resolves.toEqual(expect.objectContaining({ partial: false }));

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.seasonLineage).toEqual({
      seasonNumber: 2,
      parentTitle: "Time-Crossed Love",
      priorSeasonSummary: "Kai and Mai found each other again across time.",
      carriedRelationships: [
        {
          pair: ["kai", "mai"],
          status: "engaged",
          disclosure: "public",
          knownBy: ["kai", "mai"],
          sinceEpisode: 28,
        },
      ],
      carriedThreads: [
        {
          threadId: "t-house",
          description: "renovation of the family house still unfinished",
          threadClass: "domestic",
          openedEpisode: 5,
        },
      ],
      carriedCharacters: [
        { characterKey: "kai", name: "Kai", postFinaleStatus: "reunited with Mai" },
      ],
      writtenOutCharacters: [{ characterKey: "villain1", name: "Chana" }],
      antagonistStrategy: "new antagonist introduced; Chana referenced only in flashback",
      characterKnowledge: {},
    });
    // 3 = main row + `existingLocations` + `ensureRosterCharactersFromStory`'s
    // roster read (all pre-existing) — NOT 4 or 5, i.e. no parent-row/
    // `loadLineageContext` select ever ran, proving the null `parentSeriesId`
    // guard actually skipped the live-parent load path.
    // Main row + existing locations + the additive materialized-episode
    // compatibility mirror query; no live parent query is made.
    expect(mockDb.select).toHaveBeenCalledTimes(4);
  });
});

/* -------------------------------------------------------------------------- */
/* Phase F (added 2026-07-09) — partial-failure system audit + auto feedback  */
/* ticket bridge for `runGenerateStoryBibleDeepJob`.                          */
/* -------------------------------------------------------------------------- */

describe("runGenerateStoryBibleDeepJob — Phase F: partial-failure system audit + feedback bridge", () => {
  function tenEpisodeSeriesRow() {
    return {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: null,
      tone: null,
      targetEpisodeCount: 10,
      defaultEpisodeDurationSeconds: 60,
      bible: { episodeBreakdown: Array.from({ length: 10 }, (_, i) => plannedItem(i + 1)) },
    };
  }

  function withInsertedRows() {
    const insertedRows: Record<string, unknown>[] = [];
    mockDb.insert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => {
        insertedRows.push(values);
        return Promise.resolve(undefined);
      },
    }));
    return insertedRows;
  }

  it("partial: false (fully succeeded) never records the error audit event or files a system feedback ticket", async () => {
    const seriesRow = tenEpisodeSeriesRow();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2, 3].map(draftedResultItem),
      chunkSizes: [3],
      partial: false,
      creditsUsed: 9,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 3 }, vi.fn());

    expect(mockSubmitVerticalDramaSystemFeedback).not.toHaveBeenCalled();
  });

  it("provider-recoverable partial results finish automatically without a false failure ticket", async () => {
    const seriesRow = tenEpisodeSeriesRow();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    const insertedRows = withInsertedRows();
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2, 3].map(draftedResultItem),
      chunkSizes: [3],
      partial: true,
      creditsUsed: 9,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      error: "second chunk failed schema validation",
    });

    await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 10 },
      vi.fn(),
    );

    // The structural fallback closes the result, so only the normal success
    // audit remains and no false system-failure ticket is filed.
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({ eventType: "vertical_drama_deep_story_draft", statusCode: 200 });
    expect(mockSubmitVerticalDramaSystemFeedback).not.toHaveBeenCalled();
  });

  it("does not create duplicate failure tickets for provider-recoverable partial results", async () => {
    const seriesRow = tenEpisodeSeriesRow();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValueOnce({
      draftedItems: [1, 2, 3].map(draftedResultItem),
      chunkSizes: [3],
      partial: true,
      creditsUsed: 9,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      error: "first failure reason",
    });
    await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 10 },
      vi.fn(),
    );

    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValueOnce({
      draftedItems: [1, 2, 3, 4].map(draftedResultItem),
      chunkSizes: [4],
      partial: true,
      creditsUsed: 12,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      error: "a completely different failure reason this time",
    });
    await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, horizonEpisodes: 10 },
      vi.fn(),
    );

    expect(mockSubmitVerticalDramaSystemFeedback).not.toHaveBeenCalled();
  });
});

describe("runGenerateStoryBibleDeepJob — error mapping", () => {
  const seriesRow = {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Corporate Betrayal",
    locale: "th",
    genre: null,
    tone: null,
    targetEpisodeCount: 2,
    defaultEpisodeDurationSeconds: 60,
    bible: { episodeBreakdown: [plannedItem(1), plannedItem(2)] },
  };

  it("maps InsufficientCreditsError to FORBIDDEN and never writes", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockGenerateStoryBibleDeep.mockRejectedValueOnce(new InsufficientCreditsError());

    await expect(
      runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("completes from the approved plan after a schema validation failure", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockRejectedValueOnce(
      new VdSchemaValidationError("bad json", { issues: [] }),
    );

    const result = await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      vi.fn(),
    );
    expect(result.partial).toBe(false);
    expect(result.missingEpisodes).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "automatic_completion_fallback" }),
      ]),
    );
    expect(mockDb.update).toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* extendStoryDraftHorizon                                                    */
/* -------------------------------------------------------------------------- */

describe("extendStoryDraftHorizon — mutation: fail-fast guards + enqueue", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.extendStoryDraftHorizon({ ctx: ctx(), input: { seriesId: "not-a-number" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when every planned episode already has a deep draft, and never enqueues", async () => {
    const bible = withCompatibilityGraph(
      appendBreakdownVersion(
        {},
        {
          source: "generate_story",
          items: Array.from({ length: 10 }, (_, i) => ({
            ...plannedItem(i + 1),
            shotDrafts: NINE_SHOTS,
            cliffhanger_line: `Cliff ${i + 1}`,
            draftCompleteness: COMPLETENESS_OK,
          })),
          createdByUserId: 42,
          deepDraft: { horizonEndEpisode: 10, chunkSizes: [10], generatedAt: "2026-07-01T00:00:00.000Z" },
        },
      ),
    );
    mockDb.select.mockReturnValueOnce(
      selectChain([{ id: 10, tenantId: "tenant-1", userId: 42, targetEpisodeCount: 10, bible }]),
    );

    await expect(
      router.extendStoryDraftHorizon({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("enqueues an extend job with the light kind-specific input and returns { jobId, deduped }", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 10,
          tenantId: "tenant-1",
          userId: 42,
          targetEpisodeCount: 10,
          bible: withCompatibilityGraph({
            episodeBreakdown: Array.from({ length: 10 }, (_, i) => plannedItem(i + 1)),
          }),
        },
      ]),
    );
    mockEnqueueVerticalDramaStoryJob.mockResolvedValueOnce({ jobId: "extend-job-1", deduped: false });

    const result = await router.extendStoryDraftHorizon({
      ctx: ctx(),
      input: { seriesId: "10", additionalEpisodes: 3, idempotencyKey: "key-9" },
    });

    expect(result).toEqual({ jobId: "extend-job-1", deduped: false, runId: null });
    expect(mockEnqueueVerticalDramaStoryJob).toHaveBeenCalledWith({
      kind: "extend",
      seriesId: 10,
      tenantId: "tenant-1",
      userId: 42,
      input: { additionalEpisodes: 3, mode: "standard", idempotencyKey: "key-9" },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("runExtendStoryDraftHorizonJob — worker executor", () => {
  function seriesRowWithDeepDraftedHorizon(horizonEndEpisode: number, totalEpisodes: number) {
    const draftedItems = Array.from({ length: horizonEndEpisode }, (_, i) => ({
      ...plannedItem(i + 1),
      shotDrafts: NINE_SHOTS,
      cliffhanger_line: `Cliff ${i + 1}`,
      draftCompleteness: COMPLETENESS_OK,
    }));
    const plannedOnly = Array.from({ length: totalEpisodes - horizonEndEpisode }, (_, i) =>
      plannedItem(horizonEndEpisode + i + 1),
    );
    const bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [...draftedItems, ...plannedOnly],
        createdByUserId: 42,
        versionId: "v-deep-1",
        createdAt: "2026-07-01T00:00:00.000Z",
        deepDraft: {
          horizonEndEpisode,
          chunkSizes: [horizonEndEpisode],
          generatedAt: "2026-07-01T00:00:00.000Z",
        },
      },
    );
    return {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: "romance",
      tone: "dramatic",
      targetEpisodeCount: totalEpisodes,
      defaultEpisodeDurationSeconds: 60,
      bible,
    };
  }

  it("continues from the persisted horizonEnd, drafting the next chunk with the FULL prior recap", async () => {
    const seriesRow = seriesRowWithDeepDraftedHorizon(5, 10);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [6, 7, 8, 9, 10].map(draftedResultItem),
      chunkSizes: [5],
      partial: false,
      creditsUsed: 5,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    const result = await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      vi.fn(),
    );

    expect(mockGenerateStoryBibleDeep).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.episodes.map((e: any) => e.episodeNumber)).toEqual([6, 7, 8, 9, 10]);
    expect(callArgs.priorRecap.items).toEqual([
      { episodeNumber: 1, workingTitle: "Ep1", logline: "Logline 1", cliffhangerLine: "Cliff 1" },
      { episodeNumber: 2, workingTitle: "Ep2", logline: "Logline 2", cliffhangerLine: "Cliff 2" },
      { episodeNumber: 3, workingTitle: "Ep3", logline: "Logline 3", cliffhangerLine: "Cliff 3" },
      { episodeNumber: 4, workingTitle: "Ep4", logline: "Logline 4", cliffhangerLine: "Cliff 4" },
      { episodeNumber: 5, workingTitle: "Ep5", logline: "Logline 5", cliffhangerLine: "Cliff 5" },
    ]);
    expect(callArgs.priorRecap.openThreads).toEqual([]);

    expect(result.horizonEndEpisode).toBe(10);
    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(2);
    expect(versions[1].deepDraft).toEqual(
      expect.objectContaining({ horizonEndEpisode: 10, chunkSizes: [5] }),
    );
  });

  it("runs ledger_plan for extension versions when F132B is on and persists the new active version's ledgers", async () => {
    const seriesRow = seriesRowWithDeepDraftedHorizon(5, 10);
    const plannedLedgers = {
      evidenceLedger: [{ id: "e2", label: "new clue", introducedEpisode: 6 }],
      characterActivationLedger: [],
      threatLadder: [],
      consequenceLedger: [],
      threadLedger: [],
      worldRuleLedger: [],
      causalChainMap: [],
    };
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaQualityLedgers: true });
    mockRunVerticalDramaLedgerPlanning.mockResolvedValue({
      ledgers: plannedLedgers,
      creditsUsed: 3,
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [6, 7, 8, 9, 10].map(draftedResultItem),
      chunkSizes: [5],
      partial: false,
      creditsUsed: 5,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      missingEpisodes: [],
    });

    const result = await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      vi.fn(),
    );

    expect(mockRunVerticalDramaLedgerPlanning).toHaveBeenCalledWith(
      expect.objectContaining({
        seriesId: 10,
        activeBreakdown: expect.any(Array),
        totalEpisodeCount: 10,
      }),
    );
    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions[1].ledgers).toEqual(plannedLedgers);
    expect(setArg.bible.ledgers).toEqual(plannedLedgers);
    expect(result.creditsUsed).toBe(8);
  });

  it("live-bug fix: passes missingEpisodes through and keeps horizonEndEpisode honest (contiguous from the prior horizon, never past a still-missing gap)", async () => {
    const seriesRow = seriesRowWithDeepDraftedHorizon(5, 10);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    // Episode 10 is still missing after the service's own corrective retry.
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [6, 7, 8, 9].map(draftedResultItem),
      chunkSizes: [4],
      partial: true,
      creditsUsed: 8,
      model: "test-model",
      warnings: [{ episodeNumber: 10, shotNumber: 0, reason: "episode_missing_after_retry" }],
      finalOpenThreads: [],
      error: "chunk (episodes 6-10) is still missing episode(s) 10 after a corrective retry",
      missingEpisodes: [10],
    });

    const result = await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      vi.fn(),
    );

    expect(result.partial).toBe(false);
    expect(result.horizonEndEpisode).toBe(10);
    expect((result as { missingEpisodes: number[] }).missingEpisodes).toEqual([]);
  });

  it("honors an explicit additionalEpisodes count smaller than the default", async () => {
    const seriesRow = seriesRowWithDeepDraftedHorizon(5, 10);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [6, 7].map(draftedResultItem),
      chunkSizes: [2],
      partial: false,
      creditsUsed: 2,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, additionalEpisodes: 2 },
      vi.fn(),
    );

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.episodes.map((e: any) => e.episodeNumber)).toEqual([6, 7]);
  });

  it("throws PRECONDITION_FAILED when every planned episode already has a deep draft", async () => {
    const seriesRow = seriesRowWithDeepDraftedHorizon(10, 10);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));

    await expect(
      runExtendStoryDraftHorizonJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn()),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockGenerateStoryBibleDeep).not.toHaveBeenCalled();
  });

  it("behaves like a first-ever deep draft (starts at episode 1, empty recap) when the series has never run one", async () => {
    const seriesRow = {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: null,
      tone: null,
      targetEpisodeCount: 10,
      defaultEpisodeDurationSeconds: 60,
      bible: { episodeBreakdown: Array.from({ length: 10 }, (_, i) => plannedItem(i + 1)) },
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2, 3, 4, 5].map(draftedResultItem),
      chunkSizes: [5],
      partial: false,
      creditsUsed: 5,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runExtendStoryDraftHorizonJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.episodes.map((e: any) => e.episodeNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(callArgs.priorRecap.items).toEqual([]);
  });

  /* ------------------------------------------------------------------------ */
  /* Stage 1.5 (`planning/vd-series-memory-and-lineage/plan.md`) —            */
  /* openThreads leak fix: `priorRecap.openThreads` must read from            */
  /* `series.memory.currentState.openThreads` instead of the old hardcoded    */
  /* `[]`, and must degrade to `[]` (never throw) for a series with no        */
  /* memory yet — the case EVERY series predating Stage 1.2 is in.           */
  /* ------------------------------------------------------------------------ */

  it("threads still-open threads from series.memory.currentState.openThreads into priorRecap.openThreads", async () => {
    const seriesRow = {
      ...seriesRowWithDeepDraftedHorizon(5, 10),
      memory: {
        contractVersion: 1,
        episodes: [],
        currentState: {
          relationships: [],
          openThreads: [
            {
              threadId: "t-1",
              description: "รีโนเวทบ้านยังไม่เสร็จ",
              threadClass: "domestic",
              openedEpisode: 2,
            },
            {
              threadId: "t-2",
              description: "ใครอยู่เบื้องหลังเอกสารปลอม",
              threadClass: "plot",
              openedEpisode: 3,
            },
          ],
          canonicalFacts: [],
          characterKnowledge: {},
        },
        compactSummary: "",
        lastFoldedEpisode: 5,
      },
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [6, 7, 8, 9, 10].map(draftedResultItem),
      chunkSizes: [5],
      partial: false,
      creditsUsed: 5,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      vi.fn(),
    );

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.priorRecap.openThreads).toEqual([
      "[domestic] รีโนเวทบ้านยังไม่เสร็จ",
      "[plot] ใครอยู่เบื้องหลังเอกสารปลอม",
    ]);
  });

  it("degrades to [] (never throws) when series.memory is a malformed/legacy shape", async () => {
    const seriesRow = {
      ...seriesRowWithDeepDraftedHorizon(5, 10),
      memory: { someLegacyShape: true },
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [6, 7, 8, 9, 10].map(draftedResultItem),
      chunkSizes: [5],
      partial: false,
      creditsUsed: 5,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      vi.fn(),
    );

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.priorRecap.openThreads).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Phase F parity fix (deferred note, added 2026-07-09) — `runExtendStoryDraftHorizonJob` */
/* gets the SAME error audit event + auto system feedback ticket bridge as    */
/* `runGenerateStoryBibleDeepJob`'s own identical Phase F block above, with a */
/* DISTINCT dedupe title so the two failure classes never collapse together. */
/* -------------------------------------------------------------------------- */

describe("runExtendStoryDraftHorizonJob — Phase F: partial-failure system audit + feedback bridge", () => {
  function seriesRowWithDeepDraftedHorizon(horizonEndEpisode: number, totalEpisodes: number) {
    const draftedItems = Array.from({ length: horizonEndEpisode }, (_, i) => ({
      ...plannedItem(i + 1),
      shotDrafts: NINE_SHOTS,
      cliffhanger_line: `Cliff ${i + 1}`,
      draftCompleteness: COMPLETENESS_OK,
    }));
    const plannedOnly = Array.from({ length: totalEpisodes - horizonEndEpisode }, (_, i) =>
      plannedItem(horizonEndEpisode + i + 1),
    );
    const bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [...draftedItems, ...plannedOnly],
        createdByUserId: 42,
        versionId: "v-deep-1",
        createdAt: "2026-07-01T00:00:00.000Z",
        deepDraft: {
          horizonEndEpisode,
          chunkSizes: [horizonEndEpisode],
          generatedAt: "2026-07-01T00:00:00.000Z",
        },
      },
    );
    return {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: "romance",
      tone: "dramatic",
      targetEpisodeCount: totalEpisodes,
      defaultEpisodeDurationSeconds: 60,
      bible,
    };
  }

  function withInsertedRows() {
    const insertedRows: Record<string, unknown>[] = [];
    mockDb.insert.mockImplementation(() => ({
      values: (values: Record<string, unknown>) => {
        insertedRows.push(values);
        return Promise.resolve(undefined);
      },
    }));
    return insertedRows;
  }

  it("partial: false (fully succeeded) never records the error audit event or files a system feedback ticket", async () => {
    const seriesRow = seriesRowWithDeepDraftedHorizon(5, 10);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [6, 7, 8, 9, 10].map(draftedResultItem),
      chunkSizes: [5],
      partial: false,
      creditsUsed: 5,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runExtendStoryDraftHorizonJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    expect(mockSubmitVerticalDramaSystemFeedback).not.toHaveBeenCalled();
  });

  it("provider-recoverable partial extensions finish without a false failure ticket", async () => {
    const seriesRow = seriesRowWithDeepDraftedHorizon(5, 10);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    const insertedRows = withInsertedRows();
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [6, 7, 8].map(draftedResultItem),
      chunkSizes: [3],
      partial: true,
      creditsUsed: 8,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      error: "extend chunk failed schema validation",
    });

    await runExtendStoryDraftHorizonJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]).toMatchObject({ eventType: "vertical_drama_deep_story_draft", statusCode: 200 });
    expect(mockSubmitVerticalDramaSystemFeedback).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Premium multi-round drafts (W11-A, added 2026-07-08) — mode passthrough,   */
/* scorecard/premium-metadata persistence, and response shape additions.      */
/* -------------------------------------------------------------------------- */

describe("runGenerateStoryBibleDeepJob — premium mode (W11-A)", () => {
  const seriesRow = {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Corporate Betrayal",
    locale: "th",
    genre: "romance",
    tone: "dramatic",
    targetEpisodeCount: 2,
    defaultEpisodeDurationSeconds: 60,
    bible: { episodeBreakdown: [plannedItem(1), plannedItem(2)] },
  };

  it('defaults to mode: "standard" when the input omits it, and echoes callsMade = chunkSizes.length', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2].map(draftedResultItem),
      chunkSizes: [2],
      partial: false,
      creditsUsed: 6,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    const result = await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    expect(mockGenerateStoryBibleDeep.mock.calls[0][0].mode).toBe("standard");
    expect(result.mode).toBe("standard");
    expect(result.callsMade).toBe(1); // chunkSizes.length (premiumMetrics absent)
  });

  it('passes mode: "premium" straight through to the service call and echoes it + premiumMetrics.callsMade back in the response', async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2].map(draftedResultItemPremium),
      chunkSizes: [2],
      partial: false,
      creditsUsed: 30,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      premiumMetrics: PREMIUM_METRICS,
    });

    const result = await runGenerateStoryBibleDeepJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, mode: "premium" },
      vi.fn(),
    );

    expect(mockGenerateStoryBibleDeep.mock.calls[0][0].mode).toBe("premium");
    expect(result.mode).toBe("premium");
    expect(result.callsMade).toBe(PREMIUM_METRICS.callsMade); // from premiumMetrics, NOT chunkSizes.length
  });

  it("persists each episode's draftScorecard into the merged breakdown items, and stamps premium metrics onto the new version's deepDraft meta", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2].map(draftedResultItemPremium),
      chunkSizes: [2],
      partial: false,
      creditsUsed: 30,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      premiumMetrics: PREMIUM_METRICS,
    });

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10, mode: "premium" }, vi.fn());

    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    const items = versions[0].items as Array<Record<string, unknown>>;
    expect(items[0].draftScorecard).toEqual(SCORECARD_OK);
    expect(items[1].draftScorecard).toEqual(SCORECARD_OK);
    expect(versions[0].deepDraft).toMatchObject({ premium: PREMIUM_METRICS });
  });

  it("omits draftScorecard and the deepDraft.premium key entirely for a standard-mode result (byte-identical persistence)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2].map(draftedResultItem), // no draftScorecard — standard-mode shape
      chunkSizes: [2],
      partial: false,
      creditsUsed: 6,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
    });

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    const items = versions[0].items as Array<Record<string, unknown>>;
    expect("draftScorecard" in items[0]).toBe(false);
    expect("premium" in (versions[0].deepDraft as Record<string, unknown>)).toBe(false);
  });

  it("records mode on the best-effort audit event", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2].map(draftedResultItemPremium),
      chunkSizes: [2],
      partial: false,
      creditsUsed: 30,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      premiumMetrics: PREMIUM_METRICS,
    });
    const insertValues = vi.fn(() => Promise.resolve(undefined));
    mockDb.insert.mockReturnValue({ values: insertValues });

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10, mode: "premium" }, vi.fn());

    expect(insertValues).toHaveBeenCalledTimes(1);
    expect(insertValues.mock.calls[0][0]).toMatchObject({ metadata: expect.objectContaining({ mode: "premium" }) });
  });
});

describe("runExtendStoryDraftHorizonJob — premium mode (W11-A)", () => {
  it('passes mode: "premium" through and persists draftScorecard + premium version metadata the same way runGenerateStoryBibleDeepJob does', async () => {
    const seriesRow = {
      id: 10,
      tenantId: "tenant-1",
      userId: 42,
      title: "Corporate Betrayal",
      locale: "th",
      genre: "romance",
      tone: "dramatic",
      targetEpisodeCount: 10,
      defaultEpisodeDurationSeconds: 60,
      bible: { episodeBreakdown: Array.from({ length: 10 }, (_, i) => plannedItem(i + 1)) },
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue({
      draftedItems: [1, 2, 3, 4, 5].map(draftedResultItemPremium),
      chunkSizes: [5],
      partial: false,
      creditsUsed: 30,
      model: "test-model",
      warnings: [],
      finalOpenThreads: [],
      premiumMetrics: PREMIUM_METRICS,
    });

    const result = await runExtendStoryDraftHorizonJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, mode: "premium" },
      vi.fn(),
    );

    expect(mockGenerateStoryBibleDeep.mock.calls[0][0].mode).toBe("premium");
    expect(result.mode).toBe("premium");
    expect(result.callsMade).toBe(PREMIUM_METRICS.callsMade);

    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    const items = versions[0].items as Array<Record<string, unknown>>;
    expect(items[0].draftScorecard).toEqual(SCORECARD_OK);
    expect(versions[0].deepDraft).toMatchObject({ premium: PREMIUM_METRICS });
  });
});

/* -------------------------------------------------------------------------- */
/* updateEpisodeDraftDialogue (W10.5, added 2026-07-08)                       */
/* -------------------------------------------------------------------------- */

/** A stored breakdown item carrying `shots` for `episodeNumber`, as `getActiveBreakdown` would read it back. */
function storedDraftedItem(episodeNumber: number, shots: VdDeepDraftShotDraft[] = NINE_SHOTS) {
  return { ...plannedItem(episodeNumber), shotDrafts: shots, draftCompleteness: COMPLETENESS_OK };
}

/** A series row whose bible has ONE active breakdown version (versionId "v1") carrying episode 1's `shots`. */
function seriesRowWithShots(shots: VdDeepDraftShotDraft[], overrides: Record<string, unknown> = {}) {
  const bible = appendBreakdownVersion(
    {},
    {
      source: "generate_story",
      items: [storedDraftedItem(1, shots)],
      createdByUserId: 42,
      versionId: "v1",
      createdAt: "2026-07-08T00:00:00.000Z",
    },
  );
  return {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Corporate Betrayal",
    locale: "th",
    genre: "romance",
    tone: "dramatic",
    targetEpisodeCount: 5,
    defaultEpisodeDurationSeconds: 60,
    bible,
    ...overrides,
  };
}

describe("updateEpisodeDraftDialogueInput — zod validation limits", () => {
  const base = { seriesId: "10", episodeNumber: 1, shotNumber: 1 };

  it("accepts 0..8 lines with speaker/delivery both optional", () => {
    expect(updateEpisodeDraftDialogueInput.safeParse({ ...base, lines: [] }).success).toBe(true);
    expect(
      updateEpisodeDraftDialogueInput.safeParse({
        ...base,
        lines: Array.from({ length: 8 }, () => ({ line: "บทพูดที่ยาวพอสมควรสำหรับการทดสอบ" })),
      }).success,
    ).toBe(true);
    expect(
      updateEpisodeDraftDialogueInput.safeParse({
        ...base,
        lines: [{ speaker: "Aria", line: "มีทั้งชื่อผู้พูดและบทพูด", delivery: "whispering" }],
      }).success,
    ).toBe(true);
  });

  it("rejects more than 8 lines", () => {
    const result = updateEpisodeDraftDialogueInput.safeParse({
      ...base,
      lines: Array.from({ length: 9 }, () => ({ line: "line" })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty-after-trim line", () => {
    expect(updateEpisodeDraftDialogueInput.safeParse({ ...base, lines: [{ line: "   " }] }).success).toBe(
      false,
    );
    expect(updateEpisodeDraftDialogueInput.safeParse({ ...base, lines: [{ line: "" }] }).success).toBe(false);
  });

  it("accepts a line at exactly 300 characters (after trim) and rejects one character over", () => {
    const atLimit = "ก".repeat(300);
    const overLimit = "ก".repeat(301);
    expect(updateEpisodeDraftDialogueInput.safeParse({ ...base, lines: [{ line: atLimit }] }).success).toBe(
      true,
    );
    expect(
      updateEpisodeDraftDialogueInput.safeParse({ ...base, lines: [{ line: overLimit }] }).success,
    ).toBe(false);
  });

  it("rejects a speaker over 60 characters and a delivery over 120 characters", () => {
    expect(
      updateEpisodeDraftDialogueInput.safeParse({
        ...base,
        lines: [{ speaker: "a".repeat(61), line: "line" }],
      }).success,
    ).toBe(false);
    expect(
      updateEpisodeDraftDialogueInput.safeParse({
        ...base,
        lines: [{ line: "line", delivery: "a".repeat(121) }],
      }).success,
    ).toBe(false);
  });

  it("rejects shotNumber outside the 1..9 range", () => {
    expect(updateEpisodeDraftDialogueInput.safeParse({ ...base, shotNumber: 0, lines: [] }).success).toBe(
      false,
    );
    expect(updateEpisodeDraftDialogueInput.safeParse({ ...base, shotNumber: 10, lines: [] }).success).toBe(
      false,
    );
  });
});

describe("updateEpisodeDraftDialogue — feature flag gating", () => {
  it("throws FORBIDDEN and makes no db calls when the dedicated flag is off", async () => {
    await expect(
      router.updateEpisodeDraftDialogue({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, lines: [] },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("fails closed when the BASE verticalDramaSeries flag is off, even if deep-drafts is on", async () => {
    await expect(
      router.updateEpisodeDraftDialogue({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: false, verticalDramaSeriesDeepStoryDrafts: true } }),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, lines: [] },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

describe("updateEpisodeDraftDialogue — ownership + no-draft guards", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.updateEpisodeDraftDialogue({
        ctx: ctx(),
        input: { seriesId: "not-a-number", episodeNumber: 1, shotNumber: 1, lines: [] },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user (cross-tenant)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(
      router.updateEpisodeDraftDialogue({
        ctx: ctx(),
        input: { seriesId: "999", episodeNumber: 1, shotNumber: 1, lines: [] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND with the 'no draft' message when the series has no breakdown version at all", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ id: 10, tenantId: "tenant-1", userId: 42, targetEpisodeCount: 5, bible: null }]),
    );
    await expect(
      router.updateEpisodeDraftDialogue({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, lines: [] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "ไม่มีร่างสำหรับตอน/ช็อตนี้" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the episode was planned but never deep-drafted (item has no shotDrafts)", async () => {
    const bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [plannedItem(1)],
        createdByUserId: 42,
        versionId: "v1",
        createdAt: "2026-07-08T00:00:00.000Z",
      },
    );
    mockDb.select.mockReturnValueOnce(
      selectChain([{ id: 10, tenantId: "tenant-1", userId: 42, targetEpisodeCount: 5, bible }]),
    );
    await expect(
      router.updateEpisodeDraftDialogue({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, lines: [] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when episodeNumber isn't present in the active breakdown at all", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithShots(NINE_SHOTS)]));
    await expect(
      router.updateEpisodeDraftDialogue({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 99, shotNumber: 1, lines: [] },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("updateEpisodeDraftDialogue — happy path", () => {
  it("replaces the target shot's dialogue_lines VERBATIM, edits the ACTIVE version's item IN PLACE (no new version), recomputes draftCompleteness, and stamps manualDialogueEdit", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        lines: [{ speaker: "Kai", line: "นี่คือบทพูดที่แก้ไขใหม่สำหรับช็อตนี้อย่างชัดเจน" }],
      },
    });

    expect(chain.set).toHaveBeenCalledTimes(1);
    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    // IN-PLACE edit: still exactly ONE version (never appended), same versionId,
    // same active pointer — the explicit, documented exception to append-only.
    expect(versions).toHaveLength(1);
    expect(versions[0].versionId).toBe("v1");
    expect(setArg.bible.activeBreakdownVersionId).toBe("v1");

    const items = versions[0].items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    const editedShots = items[0].shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[2].dialogue_lines).toEqual([
      { speaker: "Kai", line: "นี่คือบทพูดที่แก้ไขใหม่สำหรับช็อตนี้อย่างชัดเจน", delivery: undefined },
    ]);
    // every OTHER shot stays byte-identical.
    for (const i of [0, 1, 3, 4, 5, 6, 7, 8]) {
      expect(editedShots[i]).toEqual(NINE_SHOTS[i]);
    }
    expect(items[0].manualDialogueEdit).toMatchObject({ editedByUserId: 42, shotNumbers: [3] });
    // draftCompleteness recomputed — no longer the stale COMPLETENESS_OK fixture object.
    expect(items[0].draftCompleteness).not.toBe(COMPLETENESS_OK);

    // Best-effort audit event written.
    expect(mockDb.insert).toHaveBeenCalledTimes(1);

    // Response contract: { item, speakabilityWarnings, silenceIntentRemoved } only.
    expect(result).toEqual({
      criteriaVersionMarker: expect.any(String),
      item: items[0],
      speakabilityWarnings: [],
      silenceIntentRemoved: false,
    });
  });

  it("reports speakabilityWarnings for a wrapping-quotes line WITHOUT auto-cleaning the persisted line", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 1,
        lines: [{ speaker: "หนูนา", line: "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”" }],
      },
    });

    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    const editedShots = items[0].shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[0].dialogue_lines[0].line).toBe(
      "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”",
    );

    expect(result.speakabilityWarnings).toEqual([
      {
        lineIndex: 0,
        violations: [{ kind: "wrapping_quotes", found: "“”" }],
        cleanedSuggestion: {
          speaker: "หนูนา",
          line: "ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม",
          delivery: undefined,
        },
      },
    ]);
  });

  it("stores a non-empty placeholder speaker when the caller omits speaker", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));

    const result = await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 1,
        lines: [{ line: "บทพูดที่ไม่มีการระบุชื่อผู้พูดเลยสำหรับช็อตนี้" }],
      },
    });

    const editedShots = (result.item as Record<string, unknown>).shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[0].dialogue_lines[0].speaker).toBe(VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER);
  });

  it("strips a contradictory silence_intent, persists the removal, and returns silenceIntentRemoved: true", async () => {
    const shotsWithSilence = NINE_SHOTS.map((shot) =>
      shot.shot_number === 5
        ? { shot_number: 5, summary: "Establishing shot", dialogue_lines: [], silence_intent: "establishing" as const }
        : shot,
    );
    const seriesRow = seriesRowWithShots(shotsWithSilence);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 5,
        lines: [{ speaker: "Aria", line: "จริงๆแล้วช็อตนี้มีบทพูดด้วยนะ" }],
      },
    });

    expect(result.silenceIntentRemoved).toBe(true);
    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    const editedShots = items[0].shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[4].silence_intent).toBeUndefined();
    expect("silence_intent" in editedShots[4]).toBe(false);
  });

  it("manualDialogueEdit.shotNumbers accumulates across TWO separate mutation calls", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain1 = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain1);

    await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, shotNumber: 2, lines: [{ line: "บทพูดที่หนึ่งสำหรับการทดสอบสะสม" }] },
    });
    const persistedBibleAfterFirst = chain1.set.mock.calls[0][0].bible;

    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...seriesRow, bible: persistedBibleAfterFirst }]),
    );
    const chain2 = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain2);

    const result2 = await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, shotNumber: 5, lines: [{ line: "บทพูดที่สองสำหรับการทดสอบสะสม" }] },
    });

    expect((result2.item as Record<string, unknown>).manualDialogueEdit).toMatchObject({
      shotNumbers: [2, 5],
    });
  });
});

describe("updateEpisodeDraftDialogue — idempotent replay", () => {
  it("a retried call with the SAME idempotencyKey performs ZERO additional writes and returns a consistent result", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const first = await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        lines: [{ line: "บทพูดที่แก้ไขสำหรับการทดสอบ idempotency" }],
        idempotencyKey: "replay-key-1",
      },
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);

    const persistedBible = chain.set.mock.calls[0][0].bible;
    mockDb.select.mockReturnValueOnce(selectChain([{ ...seriesRow, bible: persistedBible }]));

    const second = await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        lines: [{ line: "บทพูดที่แก้ไขสำหรับการทดสอบ idempotency" }],
        idempotencyKey: "replay-key-1",
      },
    });

    // No SECOND db.update call, no SECOND audit insert — total stays at 1 each.
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(second.item).toEqual(first.item);
    expect(second.silenceIntentRemoved).toBe(false);
    expect(second.speakabilityWarnings).toEqual(first.speakabilityWarnings);
  });

  it("a DIFFERENT idempotencyKey (or none) is treated as a fresh edit, not a replay", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain1 = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain1);

    await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        lines: [{ line: "บทพูดที่แก้ไขครั้งแรกสำหรับการทดสอบ" }],
        idempotencyKey: "key-A",
      },
    });

    const persistedBible = chain1.set.mock.calls[0][0].bible;
    mockDb.select.mockReturnValueOnce(selectChain([{ ...seriesRow, bible: persistedBible }]));
    const chain2 = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain2);

    await router.updateEpisodeDraftDialogue({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        lines: [{ line: "บทพูดที่แก้ไขครั้งที่สองสำหรับการทดสอบ" }],
        idempotencyKey: "key-B",
      },
    });

    // A genuinely NEW key is a fresh edit — a SECOND write does happen.
    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });
});
