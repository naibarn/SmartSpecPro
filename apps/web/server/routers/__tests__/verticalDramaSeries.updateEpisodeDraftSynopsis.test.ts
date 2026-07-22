/**
 * Vertical Drama Series — `updateEpisodeDraftSynopsis` mutation coverage
 * (added 2026-07-22, `planning/vd-edit-episode-synopsis/plan.md`).
 *
 * Mirrors `verticalDramaSeries.deepStoryDrafts.test.ts`'s exact mock/harness
 * conventions (same file, same static import surface — this router file
 * pulls in a wide static import graph, so the mock set below is the same
 * minimal set that file uses to let it load without touching a real DB,
 * LLM, or Redis-backed job queue). `verticalDramaStoryBible.ts` is loaded
 * via `importOriginal` so its PURE helpers (`appendBreakdownVersion`,
 * `readBreakdownVersions`, `resolveActiveBreakdownVersionIndex`, etc.) stay
 * REAL — only the LLM-calling entry points are replaced with `vi.fn()`.
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
// its PURE helpers real) which means ITS OWN top-level imports are
// evaluated for real too. Without these, `./enabledLlmModels` transitively
// pulls in `routers/llmProviders.ts`, which needs an `adminProcedure` export
// this file's minimal `_core/trpc` mock doesn't provide — mirrors
// `verticalDramaSeries.deepStoryDrafts.test.ts`'s own mock set for the exact
// same reason.
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

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
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

const { mockEnqueueVerticalDramaStoryJob, mockSubmitVerticalDramaSystemFeedback } = vi.hoisted(() => ({
  mockEnqueueVerticalDramaStoryJob: vi.fn(),
  mockSubmitVerticalDramaSystemFeedback: vi.fn(),
}));
vi.mock("../../services/verticalDramaStoryJobs", () => ({
  enqueueVerticalDramaStoryJob: mockEnqueueVerticalDramaStoryJob,
  getVerticalDramaStoryJobStatus: vi.fn(),
  getActiveVerticalDramaStoryJob: vi.fn(),
  submitVerticalDramaSystemFeedback: mockSubmitVerticalDramaSystemFeedback,
}));

import {
  verticalDramaSeriesRouter,
  updateEpisodeDraftSynopsisInput,
} from "../verticalDramaSeries";
import {
  appendBreakdownVersion,
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

/** Thenable select-chain stub, mirrors the sibling deep-story-drafts test file. */
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

function plannedItem(episodeNumber: number) {
  return {
    episodeNumber,
    workingTitle: `Ep${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: [`Beat ${episodeNumber}`],
  };
}

/**
 * A series row whose bible has BOTH parallel synopsis locations populated
 * for episodes 1 and 2: the versioned `breakdownVersions[0].items[]` (item 1
 * also carries `shotDrafts`/`cliffhanger_line` — extra fields that MUST
 * survive an edit untouched) AND the legacy top-level `episodeBreakdown[]`.
 */
function seriesRowForSynopsis(overrides: Record<string, unknown> = {}) {
  const bible = appendBreakdownVersion(
    {
      episodeBreakdown: [
        { episodeNumber: 1, workingTitle: "Ep1", logline: "Old logline 1", keyBeats: ["Beat 1"] },
        { episodeNumber: 2, workingTitle: "Ep2", logline: "Old logline 2", keyBeats: ["Beat 2"] },
      ],
    },
    {
      source: "generate_story",
      items: [
        {
          ...plannedItem(1),
          shotDrafts: NINE_SHOTS,
          cliffhanger_line: "Cliff 1",
          manualDialogueEdit: { editedByUserId: 42, shotNumbers: [3] },
        },
        plannedItem(2),
      ],
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

beforeEach(() => {
  vi.clearAllMocks();
  mockListEvents.mockResolvedValue([]);
  mockDb.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve(undefined)) });
  mockGetTenantFeatureFlags.mockResolvedValue({});
});

/* -------------------------------------------------------------------------- */
/* updateEpisodeDraftSynopsisInput — zod validation                           */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftSynopsisInput — zod validation limits", () => {
  const base = { seriesId: "10", episodeNumber: 1 };

  it("accepts a valid logline", () => {
    expect(
      updateEpisodeDraftSynopsisInput.safeParse({ ...base, logline: "เรื่องย่อใหม่" }).success,
    ).toBe(true);
  });

  it("rejects an empty-after-trim logline", () => {
    expect(updateEpisodeDraftSynopsisInput.safeParse({ ...base, logline: "   " }).success).toBe(false);
    expect(updateEpisodeDraftSynopsisInput.safeParse({ ...base, logline: "" }).success).toBe(false);
  });

  it("accepts a logline at exactly 1200 characters (after trim) and rejects one character over", () => {
    const atLimit = "ก".repeat(1200);
    const overLimit = "ก".repeat(1201);
    expect(updateEpisodeDraftSynopsisInput.safeParse({ ...base, logline: atLimit }).success).toBe(true);
    expect(updateEpisodeDraftSynopsisInput.safeParse({ ...base, logline: overLimit }).success).toBe(false);
  });

  it("rejects a non-positive episodeNumber", () => {
    expect(
      updateEpisodeDraftSynopsisInput.safeParse({ ...base, episodeNumber: 0, logline: "x" }).success,
    ).toBe(false);
    expect(
      updateEpisodeDraftSynopsisInput.safeParse({ ...base, episodeNumber: -1, logline: "x" }).success,
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Feature flag gating                                                        */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftSynopsis — feature flag gating", () => {
  it("throws FORBIDDEN and makes no db calls when the dedicated flag is off", async () => {
    await expect(
      router.updateEpisodeDraftSynopsis({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10", episodeNumber: 1, logline: "New logline" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("fails closed when the BASE verticalDramaSeries flag is off, even if deep-drafts is on", async () => {
    await expect(
      router.updateEpisodeDraftSynopsis({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: false, verticalDramaSeriesDeepStoryDrafts: true } }),
        input: { seriesId: "10", episodeNumber: 1, logline: "New logline" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Ownership + no-draft guards                                                */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftSynopsis — ownership + no-draft guards", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.updateEpisodeDraftSynopsis({
        ctx: ctx(),
        input: { seriesId: "not-a-number", episodeNumber: 1, logline: "New logline" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user (cross-tenant)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(
      router.updateEpisodeDraftSynopsis({
        ctx: ctx(),
        input: { seriesId: "999", episodeNumber: 1, logline: "New logline" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND with the wrong user id even for the correct tenant/series (ownership, not just tenant)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries filters by userId too — a wrong user id yields no row.
    await expect(
      router.updateEpisodeDraftSynopsis({
        ctx: ctx({ user: { id: 999, role: "user" } }),
        input: { seriesId: "10", episodeNumber: 1, logline: "New logline" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND with the 'no draft' message when the series has no breakdown version at all", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ id: 10, tenantId: "tenant-1", userId: 42, targetEpisodeCount: 5, bible: null }]),
    );
    await expect(
      router.updateEpisodeDraftSynopsis({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 1, logline: "New logline" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "ไม่มีร่างสำหรับตอนนี้" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when episodeNumber isn't present in the active breakdown at all", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowForSynopsis()]));
    await expect(
      router.updateEpisodeDraftSynopsis({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 99, logline: "New logline" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND", message: "ไม่มีร่างสำหรับตอนนี้" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Happy path — dual write + field preservation                              */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftSynopsis — happy path", () => {
  it("dual-writes the new logline into BOTH breakdownVersions[active].items[] AND legacy episodeBreakdown[], preserving every other field", async () => {
    const seriesRow = seriesRowForSynopsis();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow])); // loadOwnedSeries
    const updateBibleChain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(updateBibleChain);
    mockDb.select.mockReturnValueOnce(selectChain([])); // syncEpisodeDraftSummarySynopsis: no materialized episode row

    const result = await router.updateEpisodeDraftSynopsis({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, logline: "เรื่องย่อใหม่สำหรับตอนที่หนึ่ง" },
    });

    expect(result).toEqual({
      ok: true,
      episodeNumber: 1,
      logline: "เรื่องย่อใหม่สำหรับตอนที่หนึ่ง",
    });

    expect(updateBibleChain.set).toHaveBeenCalledTimes(1);
    const setArg = updateBibleChain.set.mock.calls[0][0];

    // (1) breakdownVersions[active].items[] patched.
    const versions = setArg.bible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(1); // in-place edit, no new version appended.
    const items = versions[0].items as Array<Record<string, unknown>>;
    const editedItem = items.find((i) => i.episodeNumber === 1)!;
    expect(editedItem.logline).toBe("เรื่องย่อใหม่สำหรับตอนที่หนึ่ง");
    // Every other field on the edited item survives byte-identical.
    expect(editedItem.shotDrafts).toBe(NINE_SHOTS);
    expect(editedItem.cliffhanger_line).toBe("Cliff 1");
    expect(editedItem.workingTitle).toBe("Ep1");
    expect(editedItem.keyBeats).toEqual(["Beat 1"]);
    expect(editedItem.manualDialogueEdit).toEqual({ editedByUserId: 42, shotNumbers: [3] });
    // Episode 2's item is completely untouched.
    const untouchedItem = items.find((i) => i.episodeNumber === 2)!;
    expect(untouchedItem).toEqual(plannedItem(2));

    // (2) legacy episodeBreakdown[] patched too.
    const legacy = setArg.bible.episodeBreakdown as Array<Record<string, unknown>>;
    const legacyEdited = legacy.find((e) => e.episodeNumber === 1)!;
    expect(legacyEdited.logline).toBe("เรื่องย่อใหม่สำหรับตอนที่หนึ่ง");
    expect(legacyEdited.workingTitle).toBe("Ep1");
    const legacyUntouched = legacy.find((e) => e.episodeNumber === 2)!;
    expect(legacyUntouched.logline).toBe("Old logline 2");

    expect(setArg.updatedAt).toBeInstanceOf(Date);

    // Best-effort audit event written.
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
  });

  it("skips the legacy sync entirely (never crashes) when bible.episodeBreakdown is absent", async () => {
    const seriesRow = seriesRowForSynopsis({
      bible: (() => {
        const { episodeBreakdown, ...rest } = seriesRowForSynopsis().bible as Record<string, unknown>;
        return rest;
      })(),
    });
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const result = await router.updateEpisodeDraftSynopsis({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, logline: "New logline without legacy array" },
    });

    expect(result.ok).toBe(true);
    const setArg = chain.set.mock.calls[0][0];
    expect("episodeBreakdown" in setArg.bible).toBe(false);
  });

  it("best-effort syncs vertical_drama_episodes.script._draftSummary.logline when a materialized row with a _draftSummary exists", async () => {
    const seriesRow = seriesRowForSynopsis();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow])); // loadOwnedSeries
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }])); // bible write

    const episodeRow = {
      id: 77,
      script: { _draftSummary: { logline: "Old logline 1", keyBeats: ["Beat 1"] }, other: "kept" },
    };
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow])); // syncEpisodeDraftSummarySynopsis lookup
    const episodeUpdateChain = updateChain([{}]);
    mockDb.update.mockReturnValueOnce(episodeUpdateChain); // syncEpisodeDraftSummarySynopsis write

    await router.updateEpisodeDraftSynopsis({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, logline: "เรื่องย่อใหม่ที่ sync แล้ว" },
    });

    expect(mockDb.update).toHaveBeenCalledTimes(2);
    const episodeSetArg = episodeUpdateChain.set.mock.calls[0][0];
    expect(episodeSetArg.script).toEqual({
      _draftSummary: { logline: "เรื่องย่อใหม่ที่ sync แล้ว", keyBeats: ["Beat 1"] },
      other: "kept",
    });
  });

  it("best-effort sync is silently skipped (never fails the mutation) when no materialized episode row exists", async () => {
    const seriesRow = seriesRowForSynopsis();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockDb.select.mockReturnValueOnce(selectChain([])); // no episode row

    const result = await router.updateEpisodeDraftSynopsis({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, logline: "New logline, no materialized episode" },
    });

    expect(result.ok).toBe(true);
    // Only ONE db.update call (the bible write) — the sync helper found no
    // row and returned without writing.
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("best-effort sync is silently skipped when the materialized row's script has no _draftSummary", async () => {
    const seriesRow = seriesRowForSynopsis();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    mockDb.update.mockReturnValueOnce(updateChain([{ ...seriesRow }]));
    mockDb.select.mockReturnValueOnce(
      selectChain([{ id: 77, script: { someOtherField: true } }]),
    );

    const result = await router.updateEpisodeDraftSynopsis({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, logline: "New logline, no draft summary" },
    });

    expect(result.ok).toBe(true);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

/* -------------------------------------------------------------------------- */
/* No-op when unchanged                                                       */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftSynopsis — no-op when unchanged", () => {
  it("returns success WITHOUT any db write, audit event, or updatedAt bump when the submitted logline is identical to the current one", async () => {
    const seriesRow = seriesRowForSynopsis();
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));

    const result = await router.updateEpisodeDraftSynopsis({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, logline: `Logline 1` },
    });

    expect(result).toEqual({ ok: true, episodeNumber: 1, logline: "Logline 1" });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
    // Only the ONE ownership-load select — the no-op short-circuit never
    // reaches the best-effort materialized-episode sync select either.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });
});
