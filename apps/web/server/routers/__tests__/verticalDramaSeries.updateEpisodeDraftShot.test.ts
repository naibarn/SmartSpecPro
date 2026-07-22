/**
 * Vertical Drama Series — `updateEpisodeDraftShot` mutation coverage (added
 * 2026-07-22, `planning/vd-edit-episode-synopsis/plan.md` Phase 2, revised
 * same day to a COMBINED summary+dialogue edit — see the mutation's own doc
 * comment in `verticalDramaSeries.ts` for the "why combined" rationale).
 *
 * Mirrors `verticalDramaSeries.updateEpisodeDraftSynopsis.test.ts`'s exact
 * mock/harness conventions (same minimal mock set, `importOriginal` for
 * `verticalDramaStoryBible.ts` so its PURE helpers stay real), plus the
 * `NINE_SHOTS`/`seriesRowWithShots`/`COMPLETENESS_OK` shot-draft fixtures
 * from `verticalDramaSeries.deepStoryDrafts.test.ts`'s own
 * `updateEpisodeDraftDialogue` coverage (same shape, this mutation edits the
 * same `shotDrafts[]`).
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
  updateEpisodeDraftShotInput,
} from "../verticalDramaSeries";
import {
  appendBreakdownVersion,
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

beforeEach(() => {
  vi.clearAllMocks();
  mockListEvents.mockResolvedValue([]);
  mockDb.insert.mockReturnValue({ values: vi.fn(() => Promise.resolve(undefined)) });
  mockGetTenantFeatureFlags.mockResolvedValue({});
});

/* -------------------------------------------------------------------------- */
/* updateEpisodeDraftShotInput — zod validation                               */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftShotInput — zod validation limits", () => {
  const base = { seriesId: "10", episodeNumber: 1, shotNumber: 1 };

  it("accepts a summary-only submission", () => {
    expect(updateEpisodeDraftShotInput.safeParse({ ...base, summary: "เรื่องย่อใหม่" }).success).toBe(true);
  });

  it("accepts a lines-only submission", () => {
    expect(updateEpisodeDraftShotInput.safeParse({ ...base, lines: [{ line: "บทพูดใหม่" }] }).success).toBe(true);
  });

  it("accepts a both-at-once submission", () => {
    expect(
      updateEpisodeDraftShotInput.safeParse({
        ...base,
        summary: "เรื่องย่อใหม่",
        lines: [{ line: "บทพูดใหม่" }],
      }).success,
    ).toBe(true);
  });

  it("rejects a submission with NEITHER summary nor lines", () => {
    const result = updateEpisodeDraftShotInput.safeParse(base);
    expect(result.success).toBe(false);
  });

  it("rejects an empty-after-trim summary", () => {
    expect(updateEpisodeDraftShotInput.safeParse({ ...base, summary: "   " }).success).toBe(false);
  });

  it("accepts a summary at exactly 600 characters (after trim) and rejects one character over", () => {
    const atLimit = "ก".repeat(600);
    const overLimit = "ก".repeat(601);
    expect(updateEpisodeDraftShotInput.safeParse({ ...base, summary: atLimit }).success).toBe(true);
    expect(updateEpisodeDraftShotInput.safeParse({ ...base, summary: overLimit }).success).toBe(false);
  });

  it("rejects more than 8 lines (reuses updateEpisodeDraftDialogueInput's line limits)", () => {
    const result = updateEpisodeDraftShotInput.safeParse({
      ...base,
      lines: Array.from({ length: 9 }, () => ({ line: "line" })),
    });
    expect(result.success).toBe(false);
  });

  it("rejects shotNumber outside the 1..9 range", () => {
    expect(updateEpisodeDraftShotInput.safeParse({ ...base, shotNumber: 0, summary: "x" }).success).toBe(false);
    expect(updateEpisodeDraftShotInput.safeParse({ ...base, shotNumber: 10, summary: "x" }).success).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Feature flag gating                                                        */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftShot — feature flag gating", () => {
  it("throws FORBIDDEN and makes no db calls when the dedicated flag is off", async () => {
    await expect(
      router.updateEpisodeDraftShot({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: true, verticalDramaSeriesDeepStoryDrafts: false } }),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, summary: "New summary" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("fails closed when the BASE verticalDramaSeries flag is off, even if deep-drafts is on", async () => {
    await expect(
      router.updateEpisodeDraftShot({
        ctx: ctx({ tenantFlags: { verticalDramaSeries: false, verticalDramaSeriesDeepStoryDrafts: true } }),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, summary: "New summary" },
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Ownership + no-draft guards                                                */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftShot — ownership + no-draft guards", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.updateEpisodeDraftShot({
        ctx: ctx(),
        input: { seriesId: "not-a-number", episodeNumber: 1, shotNumber: 1, summary: "New summary" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the series does not belong to the caller's tenant (cross-tenant)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    await expect(
      router.updateEpisodeDraftShot({
        ctx: ctx(),
        input: { seriesId: "999", episodeNumber: 1, shotNumber: 1, summary: "New summary" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND with the wrong user id even for the correct tenant/series (ownership, not just tenant)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries filters by userId too — a wrong user id yields no row.
    await expect(
      router.updateEpisodeDraftShot({
        ctx: ctx({ user: { id: 999, role: "user" } }),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, summary: "New summary" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND with the 'no draft' message when the series has no breakdown version at all", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ id: 10, tenantId: "tenant-1", userId: 42, targetEpisodeCount: 5, bible: null }]),
    );
    await expect(
      router.updateEpisodeDraftShot({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, summary: "New summary" },
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
      router.updateEpisodeDraftShot({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 1, summary: "New summary" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when episodeNumber isn't present in the active breakdown at all", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithShots(NINE_SHOTS)]));
    await expect(
      router.updateEpisodeDraftShot({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 99, shotNumber: 1, summary: "New summary" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when shotNumber has no matching shot", async () => {
    // A series row with a malformed (8-length, missing shot 9) shotDrafts
    // array parses to `null` via `readItemShotDrafts`'s `.length(9)` check —
    // simplest way to exercise "shot not found" without a live LLM chunk.
    const shots = NINE_SHOTS.slice(0, 8);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRowWithShots(shots as VdDeepDraftShotDraft[])]));
    await expect(
      router.updateEpisodeDraftShot({
        ctx: ctx(),
        input: { seriesId: "10", episodeNumber: 1, shotNumber: 9, summary: "New summary" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* Happy path — summary-only, lines-only, both-at-once                        */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftShot — happy path", () => {
  it("summary-only: patches ONLY summary, leaves dialogue_lines/draftCompleteness untouched, ONE write", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, shotNumber: 3, summary: "เรื่องย่อช็อตที่แก้ไขใหม่" },
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1); // active-version-only write, no legacy episodeBreakdown key.
    expect("episodeBreakdown" in setArg.bible).toBe(false);

    const editedShots = items[0].shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[2].summary).toBe("เรื่องย่อช็อตที่แก้ไขใหม่");
    expect(editedShots[2].dialogue_lines).toEqual(NINE_SHOTS[2].dialogue_lines);
    for (const i of [0, 1, 3, 4, 5, 6, 7, 8]) {
      expect(editedShots[i]).toEqual(NINE_SHOTS[i]);
    }
    expect(items[0].manualSummaryEdit).toMatchObject({ editedByUserId: 42, shotNumbers: [3] });
    expect(items[0].manualDialogueEdit).toBeUndefined();
    // draftCompleteness NEVER recomputed/touched by a summary-only edit.
    expect(items[0].draftCompleteness).toBe(COMPLETENESS_OK);

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      episodeNumber: 1,
      shotNumber: 3,
      summary: "เรื่องย่อช็อตที่แก้ไขใหม่",
      speakabilityWarnings: [],
      silenceIntentRemoved: false,
    });
  });

  it("lines-only: patches ONLY dialogue_lines (via the real applyManualDialogueEdit), recomputes draftCompleteness, ONE write", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        lines: [{ speaker: "Kai", line: "นี่คือบทพูดที่แก้ไขใหม่สำหรับช็อตนี้อย่างชัดเจน" }],
      },
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    const editedShots = items[0].shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[2].dialogue_lines).toEqual([
      { speaker: "Kai", line: "นี่คือบทพูดที่แก้ไขใหม่สำหรับช็อตนี้อย่างชัดเจน", delivery: undefined },
    ]);
    expect(editedShots[2].summary).toBe(NINE_SHOTS[2].summary); // summary untouched.
    expect(items[0].manualDialogueEdit).toMatchObject({ editedByUserId: 42, shotNumbers: [3] });
    expect(items[0].manualSummaryEdit).toBeUndefined();
    // draftCompleteness IS recomputed by the reused applyManualDialogueEdit path.
    expect(items[0].draftCompleteness).not.toBe(COMPLETENESS_OK);

    // No `summary` key at all in the response when summary wasn't supplied.
    expect(result).toEqual({
      ok: true,
      episodeNumber: 1,
      shotNumber: 3,
      speakabilityWarnings: [],
      silenceIntentRemoved: false,
    });
  });

  it("both-at-once: applies summary AND lines to the SAME item in exactly ONE write, stamping BOTH separate stamps", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        summary: "เรื่องย่อช็อตใหม่พร้อมบทพูดใหม่",
        lines: [{ speaker: "Kai", line: "บทพูดใหม่ที่แก้พร้อมกันกับเรื่องย่อ" }],
      },
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    const editedShots = items[0].shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[2].summary).toBe("เรื่องย่อช็อตใหม่พร้อมบทพูดใหม่");
    expect(editedShots[2].dialogue_lines).toEqual([
      { speaker: "Kai", line: "บทพูดใหม่ที่แก้พร้อมกันกับเรื่องย่อ", delivery: undefined },
    ]);
    // BOTH stamps present, and kept SEPARATE (never merged).
    expect(items[0].manualSummaryEdit).toMatchObject({ editedByUserId: 42, shotNumbers: [3] });
    expect(items[0].manualDialogueEdit).toMatchObject({ editedByUserId: 42, shotNumbers: [3] });

    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      episodeNumber: 1,
      shotNumber: 3,
      summary: "เรื่องย่อช็อตใหม่พร้อมบทพูดใหม่",
      speakabilityWarnings: [],
      silenceIntentRemoved: false,
    });
  });

  it("both-at-once preserves the dialogue path's silence_intent-removal behavior", async () => {
    const shotsWithSilence = NINE_SHOTS.map((shot) =>
      shot.shot_number === 5
        ? { shot_number: 5, summary: "Establishing shot", dialogue_lines: [], silence_intent: "establishing" as const }
        : shot,
    );
    const seriesRow = seriesRowWithShots(shotsWithSilence);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 5,
        summary: "เรื่องย่อช็อตห้าที่แก้ใหม่",
        lines: [{ speaker: "Aria", line: "จริงๆแล้วช็อตนี้มีบทพูดด้วยนะ" }],
      },
    });

    expect(result.silenceIntentRemoved).toBe(true);
    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    const editedShots = items[0].shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[4].summary).toBe("เรื่องย่อช็อตห้าที่แก้ใหม่");
    expect("silence_intent" in editedShots[4]).toBe(false);
  });

  it("stores a non-empty placeholder speaker when lines is supplied without speaker (reused applyManualDialogueEdit behavior)", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 1,
        lines: [{ line: "บทพูดที่ไม่มีการระบุชื่อผู้พูดเลยสำหรับช็อตนี้" }],
      },
    });

    const setArg = chain.set.mock.calls[0][0];
    const items = setArg.bible.breakdownVersions[0].items as Array<Record<string, unknown>>;
    const editedShots = items[0].shotDrafts as VdDeepDraftShotDraft[];
    expect(editedShots[0].dialogue_lines[0].speaker).toBe(VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER);
  });
});

/* -------------------------------------------------------------------------- */
/* No-op when unchanged                                                       */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftShot — no-op when unchanged", () => {
  it("returns success WITHOUT any db write when the submitted summary is identical to the current one", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));

    const result = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, shotNumber: 3, summary: NINE_SHOTS[2].summary },
    });

    expect(result).toEqual({
      ok: true,
      episodeNumber: 1,
      shotNumber: 3,
      summary: NINE_SHOTS[2].summary,
      speakabilityWarnings: [],
      silenceIntentRemoved: false,
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("returns success WITHOUT any db write when the submitted lines are identical to the current ones", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));

    const result = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        lines: [{ speaker: "Aria", line: NINE_SHOTS[2].dialogue_lines[0]!.line }],
      },
    });

    expect(result.ok).toBe(true);
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("STILL WRITES when summary is unchanged but lines changed (only BOTH-unchanged is a no-op)", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        summary: NINE_SHOTS[2].summary,
        lines: [{ line: "บทพูดใหม่ที่เปลี่ยนไปจากเดิมแน่นอน" }],
      },
    });

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Idempotent replay                                                          */
/* -------------------------------------------------------------------------- */

describe("updateEpisodeDraftShot — idempotent replay", () => {
  it("a retried call with the SAME idempotencyKey (both fields) performs ZERO additional writes", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain);

    const first = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        summary: "เรื่องย่อที่แก้สำหรับ idempotency",
        lines: [{ line: "บทพูดที่แก้สำหรับ idempotency" }],
        idempotencyKey: "replay-key-1",
      },
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);

    const persistedBible = chain.set.mock.calls[0][0].bible;
    mockDb.select.mockReturnValueOnce(selectChain([{ ...seriesRow, bible: persistedBible }]));

    const second = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        summary: "เรื่องย่อที่แก้สำหรับ idempotency",
        lines: [{ line: "บทพูดที่แก้สำหรับ idempotency" }],
        idempotencyKey: "replay-key-1",
      },
    });

    // No SECOND db.update call, no SECOND audit insert — total stays at 1 each.
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("a DIFFERENT idempotencyKey is treated as a fresh edit, not a replay", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain1 = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain1);

    await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, shotNumber: 3, summary: "First edit", idempotencyKey: "key-A" },
    });

    const persistedBible = chain1.set.mock.calls[0][0].bible;
    mockDb.select.mockReturnValueOnce(selectChain([{ ...seriesRow, bible: persistedBible }]));
    const chain2 = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain2);

    await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, shotNumber: 3, summary: "Second edit", idempotencyKey: "key-B" },
    });

    // A genuinely NEW key is a fresh edit — a SECOND write does happen.
    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it("a replay key recorded on the summary stamp but never submitted for lines is NOT a replay when lines is newly supplied", async () => {
    const seriesRow = seriesRowWithShots(NINE_SHOTS);
    mockDb.select.mockReturnValueOnce(selectChain([seriesRow]));
    const chain1 = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain1);

    // First call: summary-only, key "shared-key".
    await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: { seriesId: "10", episodeNumber: 1, shotNumber: 3, summary: "Summary only edit", idempotencyKey: "shared-key" },
    });
    const persistedBible = chain1.set.mock.calls[0][0].bible;
    mockDb.select.mockReturnValueOnce(selectChain([{ ...seriesRow, bible: persistedBible }]));
    const chain2 = updateChain([{ ...seriesRow }]);
    mockDb.update.mockReturnValueOnce(chain2);

    // Second call: SAME key, but now ALSO submits lines — the dialogue
    // stamp has never recorded "shared-key", so this must be a fresh write,
    // not a replay.
    const result = await router.updateEpisodeDraftShot({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeNumber: 1,
        shotNumber: 3,
        summary: "Summary only edit",
        lines: [{ line: "บทพูดใหม่ที่เพิ่งเพิ่มเข้ามาในครั้งที่สอง" }],
        idempotencyKey: "shared-key",
      },
    });

    expect(mockDb.update).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });
});
