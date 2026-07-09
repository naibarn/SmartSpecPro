/**
 * Vertical Drama Series — `approveArcReplanProposal` / `rejectArcReplanProposal`
 * mutation coverage (spec §7.7.3, section-13, added 2026-07-07).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`.
 * Covers:
 *  - Ownership guard: NOT_FOUND for a series/proposal that doesn't belong to
 *    the caller's tenant/user (never FORBIDDEN — never discloses existence).
 *  - BAD_REQUEST for non-numeric seriesId/proposalEventId before any query runs.
 *  - NOT_FOUND when the memory event exists but is not an `arc_replan_proposal`.
 *  - PRECONDITION_FAILED when the proposal was already approved/rejected.
 *  - Approve happy path: applies via `applyApprovedArcReplan`, persists the
 *    returned bible, appends an `arc_replan_applied` event, passes the
 *    idempotency key through.
 *  - Reject happy path: appends a rejection event on the EXISTING
 *    `arc_replan_proposal` kind; never touches the series bible.
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

vi.mock("../../services/verticalDramaStoryBible", () => ({
  generateStoryBible: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

const { mockApplyApprovedArcReplan } = vi.hoisted(() => ({
  mockApplyApprovedArcReplan: vi.fn(),
}));
vi.mock("../../services/verticalDramaArcReplan", () => ({
  applyApprovedArcReplan: mockApplyApprovedArcReplan,
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

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number; role: string } }> = {}) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

/** Thenable select-chain stub so `await db.select()....where(...).limit(...)` resolves to `rows`. */
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

/** Thenable update-chain stub so `await db.update(...).set(...).where(...).returning()` resolves to `rows`. */
function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

const SERIES_ROW = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
  bible: { logline: "x", breakdownVersions: [] },
};

const VALID_PROPOSAL_PAYLOAD = {
  proposalId: "proposal-uuid-1",
  seriesId: "10",
  triggeredByEpisodeNumber: 3,
  driftReasons: ["VD_ARC_BEATS_CONSUMED_EARLY"],
  affectedEpisodeNumbers: [4, 5],
  proposedBreakdown: [
    {
      episodeNumber: 4,
      workingTitle: "Episode 4",
      logline: "logline",
      keyBeats: ["beat 1"],
      contentBudget: {
        beatCount: 6,
        estimatedSpeechSeconds: 30,
        conflictLevel: 3,
        reversalTarget: 2,
        arcThreads: ["thread-a"],
      },
    },
  ],
  rationale: "because drift",
  status: "proposed",
};

function proposalEventRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 55,
    tenantId: "tenant-1",
    userId: 42,
    seriesId: 10,
    episodeId: null,
    runId: null,
    memoryKind: "arc_replan_proposal",
    payload: VALID_PROPOSAL_PAYLOAD,
    summaryText: null,
    supersedesEventIds: null,
    approved: null,
    approvedByUserId: null,
    createdAt: new Date("2026-07-07T00:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListEvents.mockResolvedValue([]);
});

describe("approveArcReplanProposal — input/ownership guards", () => {
  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.approveArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "not-a-number", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a non-numeric proposalEventId before any query runs", async () => {
    await expect(
      router.approveArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "10", proposalEventId: "not-a-number" },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — empty

    await expect(
      router.approveArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "999", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("never leaks a cross-tenant series — ownership is enforced before the proposal lookup runs", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — not found for this caller

    await expect(
      router.approveArcReplanProposal({
        ctx: ctx({ tenantId: "other-tenant" }),
        input: { seriesId: "10", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the memory event exists but is not an arc_replan_proposal", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([proposalEventRow({ memoryKind: "retcon_proposal" })])); // wrong kind

    await expect(
      router.approveArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "10", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when no memory event matches the given id at all", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([])); // proposal lookup — empty

    await expect(
      router.approveArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "10", proposalEventId: "999" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("approveArcReplanProposal — already-decided guard", () => {
  it("throws PRECONDITION_FAILED when the proposal was already approved", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([proposalEventRow()]));
    mockListEvents.mockResolvedValue([
      { memoryEventId: "200", payload: { arcReplanApprovalOf: "55" } },
    ]);

    await expect(
      router.approveArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "10", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the proposal was already rejected", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([proposalEventRow()]));
    mockListEvents.mockResolvedValue([
      { memoryEventId: "201", payload: { arcReplanRejectionOf: "55" } },
    ]);

    await expect(
      router.approveArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "10", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});

describe("approveArcReplanProposal — happy path", () => {
  it("applies via applyApprovedArcReplan, persists the returned bible, and appends an arc_replan_applied event", async () => {
    const nextBible = { logline: "x", breakdownVersions: [{ versionId: "v2", items: [] }] };
    mockApplyApprovedArcReplan.mockReturnValue(nextBible);

    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([proposalEventRow()])); // proposal lookup

    const updatedRow = { ...SERIES_ROW, bible: nextBible };
    mockDb.update.mockReturnValueOnce(updateChain([updatedRow]));

    mockAppendEvent.mockResolvedValue({ memoryEventId: "300", memoryKind: "arc_replan_applied" });

    const result = await router.approveArcReplanProposal({
      ctx: ctx(),
      input: { seriesId: "10", proposalEventId: "55", idempotencyKey: "idem-1" },
    });

    // applyApprovedArcReplan received the ORIGINAL proposal with status forced to "approved".
    expect(mockApplyApprovedArcReplan).toHaveBeenCalledWith(
      SERIES_ROW.bible,
      expect.objectContaining({ ...VALID_PROPOSAL_PAYLOAD, status: "approved" }),
      42,
    );

    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(result.series.id).toBe("10");
    expect((result.series as any).bible).toEqual(nextBible);

    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        memoryKind: "arc_replan_applied",
        approved: true,
        approvedByUserId: 42,
        idempotencyKey: "idem-1",
        payload: expect.objectContaining({
          arcReplanApprovalOf: "55",
          proposalId: "proposal-uuid-1",
        }),
      }),
    );
    expect(result.event).toEqual({ memoryEventId: "300", memoryKind: "arc_replan_applied" });
  });

  it("throws INTERNAL_SERVER_ERROR when the proposal payload is corrupted/invalid and never calls applyApprovedArcReplan", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([proposalEventRow({ payload: { garbage: true } })]));

    await expect(
      router.approveArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "10", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mockApplyApprovedArcReplan).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("rejectArcReplanProposal", () => {
  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — empty

    await expect(
      router.rejectArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "999", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the proposal was already decided", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW]))
      .mockReturnValueOnce(selectChain([proposalEventRow()]));
    mockListEvents.mockResolvedValue([
      { memoryEventId: "200", payload: { arcReplanApprovalOf: "55" } },
    ]);

    await expect(
      router.rejectArcReplanProposal({
        ctx: ctx(),
        input: { seriesId: "10", proposalEventId: "55" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("appends a rejection event on the EXISTING arc_replan_proposal kind and never touches the series bible", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([proposalEventRow()])); // proposal lookup
    mockAppendEvent.mockResolvedValue({ memoryEventId: "301", memoryKind: "arc_replan_proposal" });

    const result = await router.rejectArcReplanProposal({
      ctx: ctx(),
      input: { seriesId: "10", proposalEventId: "55", idempotencyKey: "idem-2" },
    });

    expect(mockDb.update).not.toHaveBeenCalled(); // prior events + bible untouched
    expect(mockApplyApprovedArcReplan).not.toHaveBeenCalled();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        memoryKind: "arc_replan_proposal",
        approved: false,
        approvedByUserId: 42,
        idempotencyKey: "idem-2",
        payload: expect.objectContaining({ arcReplanRejectionOf: "55", decision: "rejected" }),
      }),
    );
    expect(result.event).toEqual({ memoryEventId: "301", memoryKind: "arc_replan_proposal" });
  });
});
