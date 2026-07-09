/**
 * Dramaturgy critic (W11.5, added 2026-07-08) — `critiqueSeasonDrafts`/
 * `applySeasonCritique` mutation coverage, plus `get`'s additive
 * `lastCritique` field.
 *
 * Mirrors `verticalDramaSeries.deepStoryDrafts.test.ts`'s exact mocking
 * convention: `../../services/verticalDramaStoryBible` is mocked via
 * `importOriginal` so the PURE helpers (`appendBreakdownVersion`,
 * `getActiveBreakdown`, `readActiveSeasonCritique`,
 * `stampSeasonCritiqueOnActiveVersion`, `readBibleRefinedCharacters`,
 * `readItemShotDrafts`, the real `InsufficientCreditsError`/
 * `VdSchemaValidationError`/`NoDeepDraftedEpisodesError` classes) stay REAL —
 * only the LLM-calling `critiqueSeasonDrafts`/`applySeasonCritique` entry
 * points themselves are replaced with `vi.fn()`s. The `_core/trpc` mock is a
 * REAL (if minimal) middleware composer so "flag off -> FORBIDDEN + no
 * writes" tests actually exercise `requireFeatureFlag`.
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

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: (flag: string) => async ({ ctx, next }: any) => {
    const flags = ctx.tenantFlags ?? {};
    if (flags[flag] !== true) {
      throw { code: "FORBIDDEN", message: `Feature '${flag}' is not enabled for this tenant` };
    }
    return next();
  },
}));

// See `verticalDramaSeries.deepStoryDrafts.test.ts`'s own identical mock set
// for why these four are needed even though nothing here exercises them
// directly — `importOriginal` below evaluates the real service file's own
// top-level imports for real.
vi.mock("../../services/enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => []),
}));
vi.mock("../../services/intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => null),
}));
// Async story jobs (#28) — see `verticalDramaSeries.deepStoryDrafts.test.ts`'s
// identical convention: `hasEnoughCredits` defaults to `true` (the
// mutation's own sync pre-check) so pre-existing tests reach enqueue/the
// executor unimpeded.
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

const { mockCritiqueSeasonDrafts, mockApplySeasonCritique } = vi.hoisted(() => ({
  mockCritiqueSeasonDrafts: vi.fn(),
  mockApplySeasonCritique: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryBible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/verticalDramaStoryBible")>();
  return {
    ...actual,
    generateStoryBible: vi.fn(),
    generateStoryBibleDeep: vi.fn(),
    critiqueSeasonDrafts: mockCritiqueSeasonDrafts,
    applySeasonCritique: mockApplySeasonCritique,
  };
});

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

// Async story jobs (#28) — see `verticalDramaSeries.deepStoryDrafts.test.ts`'s
// identical mock (this router file statically imports these from that
// service; the real Redis/BullMQ-backed implementation is covered
// separately by `services/__tests__/verticalDramaStoryJobs.test.ts`).
const { mockEnqueueVerticalDramaStoryJob } = vi.hoisted(() => ({
  mockEnqueueVerticalDramaStoryJob: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryJobs", () => ({
  enqueueVerticalDramaStoryJob: mockEnqueueVerticalDramaStoryJob,
  getVerticalDramaStoryJobStatus: vi.fn(),
  getActiveVerticalDramaStoryJob: vi.fn(),
}));

import {
  verticalDramaSeriesRouter,
  runCritiqueSeasonDraftsJob,
  runApplySeasonCritiqueJob,
} from "../verticalDramaSeries";
import {
  appendBreakdownVersion,
  InsufficientCreditsError,
  VdSchemaValidationError,
  NoDeepDraftedEpisodesError,
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

function draftedPlanItem(episodeNumber: number) {
  return {
    episodeNumber,
    workingTitle: `Ep${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: [`Beat ${episodeNumber}`],
    shotDrafts: NINE_SHOTS,
  };
}

function plainPlanItem(episodeNumber: number) {
  return {
    episodeNumber,
    workingTitle: `Ep${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: [`Beat ${episodeNumber}`],
  };
}

function seriesRowWithBible(bible: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Corporate Betrayal",
    locale: "th",
    genre: "romance",
    tone: "dramatic",
    targetEpisodeCount: 2,
    defaultEpisodeDurationSeconds: 60,
    bible,
    ...overrides,
  };
}

function critiqueServiceResult(overrides: Record<string, unknown> = {}) {
  return {
    critique: {
      overallScore: 7,
      strengths: ["จังหวะเปิดเรื่องดี"],
      findings: [
        {
          kind: "protagonist_no_stake",
          evidenceEpisodes: [1],
          problem: "พระเอกไม่มีเหตุผลส่วนตัว",
          fixInstruction: "เพิ่มเหตุผลส่วนตัวให้ชัดเจน",
        },
        {
          kind: "on_the_nose_dialogue",
          evidenceEpisodes: [2],
          problem: "บทพูดตรงเกินไป",
          fixInstruction: "เขียนบทพูดให้เป็นธรรมชาติขึ้น",
        },
      ],
    },
    deterministicFindings: [{ kind: "finale_no_price_paid", evidenceEpisodes: [2], detail: "no price paid" }],
    creditsUsed: 4,
    model: "test-model",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListEvents.mockResolvedValue([]);
  mockDb.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve(undefined)) });
});

/* -------------------------------------------------------------------------- */
/* Feature flag gating                                                        */
/* -------------------------------------------------------------------------- */

describe("feature flag gating — verticalDramaSeriesDeepStoryDrafts (W11.5 rides the SAME flag, no new one)", () => {
  it("critiqueSeasonDrafts throws FORBIDDEN and makes no db/LLM/enqueue calls when the dedicated flag is off", async () => {
    await expect(
      router.critiqueSeasonDrafts({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockCritiqueSeasonDrafts).not.toHaveBeenCalled();
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("applySeasonCritique throws FORBIDDEN and makes no db/LLM/enqueue calls when the dedicated flag is off", async () => {
    await expect(
      router.applySeasonCritique({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockApplySeasonCritique).not.toHaveBeenCalled();
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("fails closed when the BASE verticalDramaSeries flag is off, even if deep-drafts is on", async () => {
    await expect(
      router.critiqueSeasonDrafts({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: false, verticalDramaSeriesDeepStoryDrafts: true } }),
        input: { seriesId: "10" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      router.applySeasonCritique({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: false, verticalDramaSeriesDeepStoryDrafts: true } }),
        input: { seriesId: "10" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* critiqueSeasonDrafts — mutation: fail-fast guards + enqueue                */
/* -------------------------------------------------------------------------- */

describe("critiqueSeasonDrafts — mutation: fail-fast guards + enqueue", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.critiqueSeasonDrafts({ ctx: ctx(), input: { seriesId: "not-a-number" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(
      router.critiqueSeasonDrafts({ ctx: ctx(), input: { seriesId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the series has no active breakdown at all", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(null as unknown as Record<string, unknown>)]));
    await expect(
      router.critiqueSeasonDrafts({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when episodes are planned but none is deep-drafted yet", async () => {
    const bible = { episodeBreakdown: [plainPlanItem(1), plainPlanItem(2)] };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible)]));
    await expect(
      router.critiqueSeasonDrafts({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN from the sync credits pre-check and never enqueues", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42 },
    );
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible, { targetEpisodeCount: 1 })]));
    mockHasEnoughCredits.mockResolvedValueOnce(false);

    await expect(
      router.critiqueSeasonDrafts({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("enqueues a critique job and returns { jobId, deduped }, sharing the SAME per-series slot every other kind uses", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1), draftedPlanItem(2)], createdByUserId: 42 },
    );
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible)]));
    mockEnqueueVerticalDramaStoryJob.mockResolvedValueOnce({ jobId: "critique-job-1", deduped: false });

    const result = await router.critiqueSeasonDrafts({ ctx: ctx(), input: { seriesId: "10", idempotencyKey: "key-1" } });

    expect(result).toEqual({ jobId: "critique-job-1", deduped: false });
    expect(mockEnqueueVerticalDramaStoryJob).toHaveBeenCalledWith({
      kind: "critique",
      seriesId: 10,
      tenantId: "tenant-1",
      userId: 42,
      input: { idempotencyKey: "key-1" },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockCritiqueSeasonDrafts).not.toHaveBeenCalled();
  });

  it("double-spend guard: forwards deduped: true + the EXISTING jobId when a job (of ANY kind) is already active for this series", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42 },
    );
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible, { targetEpisodeCount: 1 })]));
    mockEnqueueVerticalDramaStoryJob.mockResolvedValueOnce({ jobId: "existing-apply-job", deduped: true });

    const result = await router.critiqueSeasonDrafts({ ctx: ctx(), input: { seriesId: "10" } });

    expect(result).toEqual({ jobId: "existing-apply-job", deduped: true });
  });
});

/* -------------------------------------------------------------------------- */
/* runCritiqueSeasonDraftsJob — worker executor                               */
/* -------------------------------------------------------------------------- */

describe("runCritiqueSeasonDraftsJob — happy path", () => {
  it("builds the roster from bible.refinedCharacters, calls the service with the full active breakdown + onProgress, and persists lastCritique onto the active version IN PLACE (no new version)", async () => {
    const bible = appendBreakdownVersion(
      { refinedCharacters: [{ name: "เอก", role: "lead", description: "d" }] },
      {
        source: "generate_story",
        items: [draftedPlanItem(1), draftedPlanItem(2)],
        createdByUserId: 42,
        versionId: "v1",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    );
    const seriesRow = seriesRowWithBible(bible);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockCritiqueSeasonDrafts.mockResolvedValue(critiqueServiceResult());

    const onProgress = vi.fn();
    const result = await runCritiqueSeasonDraftsJob(
      { tenantId: "tenant-1", userId: 42, seriesId: 10, idempotencyKey: "key-1" },
      onProgress,
    );

    expect(mockCritiqueSeasonDrafts).toHaveBeenCalledTimes(1);
    const callArgs = mockCritiqueSeasonDrafts.mock.calls[0][0];
    expect(callArgs.items.map((i: any) => i.episodeNumber)).toEqual([1, 2]);
    expect(callArgs.roster).toEqual([{ name: "เอก" }]);
    expect(callArgs.title).toBe("Corporate Betrayal");
    expect(callArgs.onProgress).toBe(onProgress);

    expect(chain.set).toHaveBeenCalledTimes(1);
    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(1); // IN PLACE — never appends a new version.
    expect(versions[0].versionId).toBe("v1");
    expect(versions[0].lastCritique).toMatchObject({
      overallScore: 7,
      findings: critiqueServiceResult().critique.findings,
      deterministicFindingsCount: 1,
    });

    expect(mockDb.insert).toHaveBeenCalledTimes(1); // best-effort audit event.

    expect(result.critique.overallScore).toBe(7);
    expect(result.deterministicFindings).toEqual(critiqueServiceResult().deterministicFindings);
    expect(result.creditsUsed).toBe(4);
    expect(result.callsMade).toBe(1);
  });
});

describe("runCritiqueSeasonDraftsJob — error mapping", () => {
  function draftedSeriesRow() {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42 },
    );
    return seriesRowWithBible(bible, { targetEpisodeCount: 1 });
  }

  it("maps InsufficientCreditsError to FORBIDDEN and never writes", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([draftedSeriesRow()]));
    mockCritiqueSeasonDrafts.mockRejectedValueOnce(new InsufficientCreditsError());
    await expect(
      runCritiqueSeasonDraftsJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("maps NoDeepDraftedEpisodesError to PRECONDITION_FAILED and never writes", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([draftedSeriesRow()]));
    mockCritiqueSeasonDrafts.mockRejectedValueOnce(new NoDeepDraftedEpisodesError());
    await expect(
      runCritiqueSeasonDraftsJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn()),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("maps VdSchemaValidationError to UNPROCESSABLE_CONTENT and never writes", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([draftedSeriesRow()]));
    mockCritiqueSeasonDrafts.mockRejectedValueOnce(new VdSchemaValidationError("bad json", {}));
    await expect(
      runCritiqueSeasonDraftsJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn()),
    ).rejects.toMatchObject({ code: "UNPROCESSABLE_CONTENT" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* applySeasonCritique — mutation: fail-fast guards + enqueue                 */
/* -------------------------------------------------------------------------- */

describe("applySeasonCritique — mutation: fail-fast guards + enqueue", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.applySeasonCritique({ ctx: ctx(), input: { seriesId: "nope" } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a cross-tenant/missing series", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(
      router.applySeasonCritique({ ctx: ctx(), input: { seriesId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when no critique has ever been run", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42 },
    );
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible, { targetEpisodeCount: 1 })]));
    await expect(
      router.applySeasonCritique({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the requested findingIndexes resolve to nothing selected", async () => {
    const bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [draftedPlanItem(1)],
        createdByUserId: 42,
        versionId: "v1",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    );
    (bible.breakdownVersions as any[])[0].lastCritique = {
      critiquedAt: "2026-07-01T00:00:00.000Z",
      overallScore: 5,
      strengths: [],
      findings: [{ kind: "other", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
      deterministicFindingsCount: 0,
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible, { targetEpisodeCount: 1 })]));

    await expect(
      router.applySeasonCritique({ ctx: ctx(), input: { seriesId: "10", findingIndexes: [99] } }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN from the sync credits pre-check and never enqueues", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42, versionId: "v1" },
    );
    (bible.breakdownVersions as any[])[0].lastCritique = {
      critiquedAt: "2026-07-01T00:00:00.000Z",
      overallScore: 5,
      strengths: [],
      findings: [{ kind: "other", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
      deterministicFindingsCount: 0,
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible, { targetEpisodeCount: 1 })]));
    mockHasEnoughCredits.mockResolvedValueOnce(false);

    await expect(
      router.applySeasonCritique({ ctx: ctx(), input: { seriesId: "10" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockEnqueueVerticalDramaStoryJob).not.toHaveBeenCalled();
  });

  it("enqueues an apply_critique job with the light kind-specific input and returns { jobId, deduped }", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42, versionId: "v1" },
    );
    (bible.breakdownVersions as any[])[0].lastCritique = {
      critiquedAt: "2026-07-01T00:00:00.000Z",
      overallScore: 5,
      strengths: [],
      findings: [{ kind: "other", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
      deterministicFindingsCount: 0,
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible, { targetEpisodeCount: 1 })]));
    mockEnqueueVerticalDramaStoryJob.mockResolvedValueOnce({ jobId: "apply-job-1", deduped: false });

    const result = await router.applySeasonCritique({
      ctx: ctx(),
      input: { seriesId: "10", findingIndexes: [0], idempotencyKey: "key-2" },
    });

    expect(result).toEqual({ jobId: "apply-job-1", deduped: false });
    expect(mockEnqueueVerticalDramaStoryJob).toHaveBeenCalledWith({
      kind: "apply_critique",
      seriesId: 10,
      tenantId: "tenant-1",
      userId: 42,
      input: { findingIndexes: [0], idempotencyKey: "key-2" },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockApplySeasonCritique).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* runApplySeasonCritiqueJob — worker executor                                */
/* -------------------------------------------------------------------------- */

describe("runApplySeasonCritiqueJob — happy path", () => {
  function seriesRowWithCritique(findings: Array<Record<string, unknown>>) {
    const bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [draftedPlanItem(1), draftedPlanItem(2)],
        createdByUserId: 42,
        versionId: "v1",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    );
    (bible.breakdownVersions as any[])[0].lastCritique = {
      critiquedAt: "2026-07-01T00:00:00.000Z",
      overallScore: 6,
      strengths: ["ok"],
      findings,
      deterministicFindingsCount: 1,
    };
    return seriesRowWithBible(bible);
  }

  it("defaults findingIndexes to EVERY persisted finding when omitted, passes their kind/evidence/problem/fix + onProgress straight through", async () => {
    const findings = [
      { kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p1", fixInstruction: "f1" },
      { kind: "finale_no_price_paid", evidenceEpisodes: [2], problem: "p2", fixInstruction: "f2" },
    ];
    const seriesRow = seriesRowWithCritique(findings);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockApplySeasonCritique.mockResolvedValue({
      updatedItems: [draftedPlanItem(1), draftedPlanItem(2)],
      updatedEpisodeNumbers: [1, 2],
      rejected: [],
      creditsUsed: 6,
      callsMade: 1,
      model: "test-model",
    });

    const onProgress = vi.fn();
    const result = await runApplySeasonCritiqueJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, onProgress);

    expect(mockApplySeasonCritique).toHaveBeenCalledTimes(1);
    expect(mockApplySeasonCritique.mock.calls[0][0].findings).toEqual(findings);
    expect(mockApplySeasonCritique.mock.calls[0][0].onProgress).toBe(onProgress);

    expect(chain.set).toHaveBeenCalledTimes(1);
    const setArg = chain.set.mock.calls[0][0];
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(2); // append-only — a NEW version this time.
    expect(setArg.bible.activeBreakdownVersionId).toBe(versions[1].versionId);
    expect(versions[1].lastCritique).toMatchObject({ overallScore: 6 }); // carried forward.

    expect(result.updatedEpisodes).toEqual([1, 2]);
    expect(result.rejected).toEqual([]);
    expect(result.creditsUsed).toBe(6);
    expect(result.callsMade).toBe(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("honors an explicit findingIndexes subset", async () => {
    const findings = [
      { kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p1", fixInstruction: "f1" },
      { kind: "finale_no_price_paid", evidenceEpisodes: [2], problem: "p2", fixInstruction: "f2" },
    ];
    const seriesRow = seriesRowWithCritique(findings);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockApplySeasonCritique.mockResolvedValue({
      updatedItems: [draftedPlanItem(1), draftedPlanItem(2)],
      updatedEpisodeNumbers: [2],
      rejected: [],
      creditsUsed: 3,
      callsMade: 1,
      model: "test-model",
    });

    await runApplySeasonCritiqueJob({ tenantId: "tenant-1", userId: 42, seriesId: 10, findingIndexes: [1] }, vi.fn());

    expect(mockApplySeasonCritique.mock.calls[0][0].findings).toEqual([findings[1]]);
  });

  it("skips the db write entirely when every selected finding was rejected (nothing changed), but still records the audit event", async () => {
    const findings = [{ kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p1", fixInstruction: "f1" }];
    const seriesRow = seriesRowWithCritique(findings);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockApplySeasonCritique.mockResolvedValue({
      updatedItems: [draftedPlanItem(1), draftedPlanItem(2)],
      updatedEpisodeNumbers: [],
      rejected: [{ episodeNumber: 1, reason: "การแก้ไขทำให้เกิดปัญหาใหม่ จึงเก็บเวอร์ชันเดิมไว้" }],
      creditsUsed: 3,
      callsMade: 1,
      model: "test-model",
    });

    const result = await runApplySeasonCritiqueJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).toHaveBeenCalledTimes(1); // audit event still recorded.
    expect(result.rejected).toEqual([
      { episodeNumber: 1, reason: "การแก้ไขทำให้เกิดปัญหาใหม่ จึงเก็บเวอร์ชันเดิมไว้" },
    ]);
    expect(result.updatedEpisodes).toEqual([]);
  });
});

describe("runApplySeasonCritiqueJob — error mapping", () => {
  it("maps InsufficientCreditsError to FORBIDDEN and never writes", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42, versionId: "v1" },
    );
    (bible.breakdownVersions as any[])[0].lastCritique = {
      critiquedAt: "2026-07-01T00:00:00.000Z",
      overallScore: 5,
      strengths: [],
      findings: [{ kind: "other", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
      deterministicFindingsCount: 0,
    };
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithBible(bible, { targetEpisodeCount: 1 })]));
    mockApplySeasonCritique.mockRejectedValueOnce(new InsufficientCreditsError());

    await expect(
      runApplySeasonCritiqueJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* get — lastCritique                                                         */
/* -------------------------------------------------------------------------- */

describe("get — additive lastCritique field (W11.5)", () => {
  it("is null when the active version has never been critiqued", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42 },
    );
    const seriesRow = seriesRowWithBible(bible, { targetEpisodeCount: 1 });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow])).mockReturnValueOnce(selectChain([]));

    const result = await router.get({ ctx: ctx(), input: { seriesId: "10" } });
    expect(result.series.lastCritique).toBeNull();
  });

  it("surfaces the persisted critique once one has been run", async () => {
    const bible = appendBreakdownVersion(
      {},
      { source: "generate_story", items: [draftedPlanItem(1)], createdByUserId: 42, versionId: "v1" },
    );
    const stored = {
      critiquedAt: "2026-07-01T00:00:00.000Z",
      overallScore: 8,
      strengths: ["strong hook"],
      findings: [],
      deterministicFindingsCount: 0,
    };
    (bible.breakdownVersions as any[])[0].lastCritique = stored;
    const seriesRow = seriesRowWithBible(bible, { targetEpisodeCount: 1 });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow])).mockReturnValueOnce(selectChain([]));

    const result = await router.get({ ctx: ctx(), input: { seriesId: "10" } });
    expect(result.series.lastCritique).toEqual(stored);
  });
});
