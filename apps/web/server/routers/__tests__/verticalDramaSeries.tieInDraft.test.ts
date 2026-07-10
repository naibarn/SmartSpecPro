/**
 * Season-level product tie-in DRAFT awareness (task #22, spec §7.7.2/§7.7.3,
 * added 2026-07-09) — `resolveTieInDraftBootstrap` + its wiring into
 * `runGenerateStoryBibleDeepJob`/`runExtendStoryDraftHorizonJob`: gating on
 * BOTH the `verticalDramaSeriesTieInReplan` tenant flag AND the series'
 * `productTieIn.enabled`, bootstrap-and-persist via the SAME
 * `appendBreakdownVersion` write the executor already performs, and the
 * grandfather case (no `productTieIn` at all -> nothing changes).
 *
 * Mirrors `verticalDramaSeries.deepStoryDrafts.test.ts`'s mocking convention
 * exactly (same db/trpc/requireFeatureFlag/enabledLlmModels/
 * intelligentModelSelector/creditService/llmRouter/verticalDramaStoryBible-
 * via-importOriginal/verticalDramaSeriesMemory/logger/verticalDramaStoryJobs
 * mock set), PLUS a NEW `tenantFeatureFlagService` mock (that sibling file
 * never needed one — every one of its tests implicitly exercises this
 * router's fail-closed `getTenantFeatureFlags` catch branch, since the
 * mocked `../../db` module has no `getDb` export). `planSeasonTieInPlacements`
 * is NOT mocked — it is a pure, dependency-free function
 * (`@shared/verticalDramaSeries/contentBudget`), so these tests exercise the
 * REAL distribution logic.
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

vi.mock("../../services/enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => []),
}));
vi.mock("../../services/intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => null),
}));
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

const { mockGenerateStoryBibleDeep } = vi.hoisted(() => ({
  mockGenerateStoryBibleDeep: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryBible", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/verticalDramaStoryBible")>();
  return {
    ...actual,
    generateStoryBible: vi.fn(),
    generateStoryBibleDeep: mockGenerateStoryBibleDeep,
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

const { mockEnqueueVerticalDramaStoryJob } = vi.hoisted(() => ({
  mockEnqueueVerticalDramaStoryJob: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryJobs", () => ({
  enqueueVerticalDramaStoryJob: mockEnqueueVerticalDramaStoryJob,
  getVerticalDramaStoryJobStatus: vi.fn(),
  getActiveVerticalDramaStoryJob: vi.fn(),
  // Phase F (added 2026-07-09) — the router now statically imports this for
  // the partial-system-failure feedback bridge; every fixture in this file
  // uses `partial: false`, so it's never actually invoked here.
  submitVerticalDramaSystemFeedback: vi.fn(),
}));

/**
 * Task #22 — this test file's ONE addition relative to
 * `verticalDramaSeries.deepStoryDrafts.test.ts`'s mock set: control over the
 * `verticalDramaSeriesTieInReplan` tenant flag. Defaults (via `beforeEach`)
 * to an object WITHOUT that key, matching `resolveVerticalDramaTieInReplanFlag`'s
 * fail-closed `flags?.verticalDramaSeriesTieInReplan === true` read.
 */
const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(async () => ({}) as Record<string, boolean>),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

import { runGenerateStoryBibleDeepJob, runExtendStoryDraftHorizonJob } from "../verticalDramaSeries";

/* -------------------------------------------------------------------------- */
/* Fixtures — mirrors verticalDramaSeries.deepStoryDrafts.test.ts's own       */
/* -------------------------------------------------------------------------- */

const NINE_SHOTS = Array.from({ length: 9 }, (_, i) => ({
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

function plannedItem(episodeNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    episodeNumber,
    workingTitle: `Ep${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: [`Beat ${episodeNumber}`],
    ...overrides,
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

function baseGenerateResult(episodeNumbers: number[]) {
  return {
    draftedItems: episodeNumbers.map(draftedResultItem),
    chunkSizes: [episodeNumbers.length],
    partial: false,
    creditsUsed: episodeNumbers.length * 3,
    model: "test-model",
    warnings: [],
    finalOpenThreads: [],
  };
}

/** Thenable select-chain stub, mirrors the sibling test file. */
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

function baseSeriesRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    tenantId: "tenant-1",
    userId: 42,
    title: "Corporate Betrayal",
    locale: "th",
    genre: "romance",
    tone: "dramatic",
    targetEpisodeCount: 4,
    defaultEpisodeDurationSeconds: 60,
    bible: { episodeBreakdown: [plannedItem(1), plannedItem(2), plannedItem(3), plannedItem(4)] },
    productTieIn: null as unknown,
    ...overrides,
  };
}

const ENABLED_TIE_IN_CONFIG = {
  enabled: true,
  productName: "Glow Serum",
  productCategory: "cosmetics",
  forbiddenClaims: ["รักษาสิว"],
  maxEpisodesWithTieInPerTenEpisodes: 3,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockListEvents.mockResolvedValue([]);
  mockDb.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve(undefined)) });
  mockHasEnoughCredits.mockResolvedValue(true);
  mockGetTenantFeatureFlags.mockResolvedValue({});
  mockGenerateStoryBibleDeep.mockResolvedValue(baseGenerateResult([1, 2, 3, 4]));
});

/* -------------------------------------------------------------------------- */
/* Gating                                                                     */
/* -------------------------------------------------------------------------- */

describe("runGenerateStoryBibleDeepJob — tie-in draft bootstrap gating (task #22)", () => {
  it("grandfather: no productTieIn at all -> tieInDraftContext undefined, no tieIn persisted, even with the flag ON", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTieInReplan: true });
    const seriesRow = baseSeriesRow({ productTieIn: null });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.tieInDraftContext).toBeUndefined();

    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    expect(items.every((i) => !("tieIn" in i))).toBe(true);
  });

  it("flag OFF (even with productTieIn.enabled true) -> tieInDraftContext undefined, no tieIn persisted", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({}); // flag absent -> false
    const seriesRow = baseSeriesRow({ productTieIn: ENABLED_TIE_IN_CONFIG });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.tieInDraftContext).toBeUndefined();
    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    expect(items.every((i) => !("tieIn" in i))).toBe(true);
  });

  it("flag ON but productTieIn.enabled false -> tieInDraftContext undefined, no tieIn persisted", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTieInReplan: true });
    const seriesRow = baseSeriesRow({ productTieIn: { ...ENABLED_TIE_IN_CONFIG, enabled: false } });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.tieInDraftContext).toBeUndefined();
  });

  it("flag ON + productTieIn.enabled true -> bootstraps placements, threads tieInDraftContext, and PERSISTS tieIn on every item via the SAME appendBreakdownVersion write (source stays generate_story)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTieInReplan: true });
    const seriesRow = baseSeriesRow({ productTieIn: ENABLED_TIE_IN_CONFIG });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.tieInDraftContext).toBeDefined();
    expect(callArgs.tieInDraftContext.productName).toBe("Glow Serum");
    expect(callArgs.tieInDraftContext.productCategory).toBe("cosmetics");
    expect(callArgs.tieInDraftContext.forbiddenClaims).toEqual(["รักษาสิว"]);
    // Every episode (all 4, the FULL active breakdown) has a placement entry — planSeasonTieInPlacements stamps every item.
    expect(callArgs.tieInDraftContext.placements).toHaveLength(4);
    // The episodes ACTUALLY drafted this run also already carry `tieIn` (bootstrapped BEFORE the horizon filter).
    expect(callArgs.episodes.every((e: any) => e.tieIn !== undefined)).toBe(true);

    const setArg = chain.set.mock.calls[0][0];
    expect(setArg.bible.breakdownVersions[0].source).toBe("generate_story");
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(4);
    expect(items.every((i) => i.tieIn !== undefined)).toBe(true);
  });

  it("does NOT re-bootstrap when at least one item already carries a tieIn field — existing placements are preserved untouched", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTieInReplan: true });
    const existingPlacement = { planned: true, source: "manual" as const, benefitFocus: "already decided" };
    const seriesRow = baseSeriesRow({
      productTieIn: ENABLED_TIE_IN_CONFIG,
      bible: {
        episodeBreakdown: [
          plannedItem(1, { tieIn: existingPlacement }),
          plannedItem(2),
          plannedItem(3),
          plannedItem(4),
        ],
      },
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    const ep1Placement = callArgs.tieInDraftContext.placements.find((p: any) => p.episodeNumber === 1);
    expect(ep1Placement.placement).toEqual(existingPlacement);
    // Episode 2/3/4 were never touched by planSeasonTieInPlacements (bootstrap skipped entirely) — no placement entries for them.
    expect(callArgs.tieInDraftContext.placements).toHaveLength(1);
  });

  it("defaults maxEpisodesWithTieInPerTenEpisodes when the stored config omits it (defensive read) without throwing", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTieInReplan: true });
    const seriesRow = baseSeriesRow({
      productTieIn: { enabled: true, productName: "X" }, // no maxEpisodesWithTieInPerTenEpisodes key
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    await expect(
      runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn()),
    ).resolves.toBeDefined();
    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.tieInDraftContext.placements.length).toBeGreaterThan(0);
  });
});

describe("runExtendStoryDraftHorizonJob — tie-in draft bootstrap gating (task #22)", () => {
  it("flag ON + productTieIn.enabled true -> bootstraps + persists tieIn the same way as runGenerateStoryBibleDeepJob", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTieInReplan: true });
    const seriesRow = baseSeriesRow({
      productTieIn: ENABLED_TIE_IN_CONFIG,
      bible: {
        breakdownVersions: [
          {
            versionId: "v1",
            createdAt: "2026-07-01T00:00:00.000Z",
            createdByUserId: 42,
            source: "generate_story",
            items: [plannedItem(1), plannedItem(2), plannedItem(3), plannedItem(4)],
            deepDraft: { horizonEndEpisode: 2, chunkSizes: [2], generatedAt: "2026-07-01T00:00:00.000Z" },
          },
        ],
        activeBreakdownVersionId: "v1",
      },
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue(baseGenerateResult([3, 4]));

    await runExtendStoryDraftHorizonJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.tieInDraftContext).toBeDefined();
    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[1].items as Array<Record<string, unknown>>;
    expect(items.every((i) => i.tieIn !== undefined)).toBe(true);
  });

  it("grandfather: no productTieIn -> tieInDraftContext undefined", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTieInReplan: true });
    const seriesRow = baseSeriesRow({
      productTieIn: null,
      bible: {
        breakdownVersions: [
          {
            versionId: "v1",
            createdAt: "2026-07-01T00:00:00.000Z",
            createdByUserId: 42,
            source: "generate_story",
            items: [plannedItem(1), plannedItem(2), plannedItem(3), plannedItem(4)],
            deepDraft: { horizonEndEpisode: 2, chunkSizes: [2], generatedAt: "2026-07-01T00:00:00.000Z" },
          },
        ],
        activeBreakdownVersionId: "v1",
      },
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue(baseGenerateResult([3, 4]));

    await runExtendStoryDraftHorizonJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    const callArgs = mockGenerateStoryBibleDeep.mock.calls[0][0];
    expect(callArgs.tieInDraftContext).toBeUndefined();
  });
});

describe("runGenerateStoryBibleDeepJob — tie-in mismatch count threads through to the job result (task #22)", () => {
  it("surfaces tieInMismatchCount on the job result when the service reports one", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesTieInReplan: true });
    const seriesRow = baseSeriesRow({ productTieIn: ENABLED_TIE_IN_CONFIG });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue({ ...baseGenerateResult([1, 2, 3, 4]), tieInMismatchCount: 2 });

    const result = await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    expect(result.tieInMismatchCount).toBe(2);
  });

  it("tieInMismatchCount is undefined on the job result when the service omits it (flag off / no tie-in)", async () => {
    const seriesRow = baseSeriesRow({ productTieIn: null });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockGenerateStoryBibleDeep.mockResolvedValue(baseGenerateResult([1, 2, 3, 4]));

    const result = await runGenerateStoryBibleDeepJob({ tenantId: "tenant-1", userId: 42, seriesId: 10 }, vi.fn());

    expect(result.tieInMismatchCount).toBeUndefined();
  });
});
