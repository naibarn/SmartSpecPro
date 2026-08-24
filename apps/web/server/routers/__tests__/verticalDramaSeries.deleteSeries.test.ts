/**
 * Vertical Drama Series — `deleteSeries` mutation coverage.
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaEpisodes.memoryWiring.test.ts`. Covers:
 *  - Ownership guard: a series that doesn't belong to the caller's
 *    tenant/user (or doesn't exist) throws NOT_FOUND before anything is
 *    touched (`loadOwnedSeries` semantics — never FORBIDDEN, so existence of
 *    another tenant's/user's series is never disclosed).
 *  - `confirmName` mismatch is rejected with BAD_REQUEST — server-side
 *    defense-in-depth even though the client also requires an exact-match
 *    typed confirmation before enabling the button.
 *  - Happy path: deletes the series row inside `db.transaction` and returns
 *    aggregate child-row counts (used for the confirmation toast). All ten
 *    child tables cascade at the DB level (`onDelete: "cascade"` on
 *    `seriesId` in `drizzle/schema.ts`), so the procedure only issues COUNT
 *    queries plus a single `delete` on `vertical_drama_series` — there is no
 *    manual per-child-table delete to verify beyond the parent delete call.
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
    adminProcedure: createProcedure(),
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

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx(
  overrides: Partial<{
    tenantId: string | null;
    user: { id: number; role: string };
  }> = {}
) {
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

const SERIES_ROW = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteSeries — ownership guard", () => {
  it("throws NOT_FOUND when the series does not belong to the caller's tenant/user", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries lookup — empty

    await expect(
      router.deleteSeries({
        ctx: ctx(),
        input: { seriesId: "999", confirmName: "anything" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST for a non-numeric seriesId before any query runs", async () => {
    await expect(
      router.deleteSeries({
        ctx: ctx(),
        input: { seriesId: "not-a-number", confirmName: "anything" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});

describe("deleteSeries — confirmName guard", () => {
  it("rejects with BAD_REQUEST when confirmName does not exactly match the series title", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW])); // loadOwnedSeries lookup

    await expect(
      router.deleteSeries({
        ctx: ctx(),
        input: { seriesId: "10", confirmName: "Corporate betrayal" }, // wrong case
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("rejects a blank/partial confirmName", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW]));

    await expect(
      router.deleteSeries({
        ctx: ctx(),
        input: { seriesId: "10", confirmName: "Corporate" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});

describe("deleteSeries — happy path", () => {
  it("deletes the series inside a transaction and returns child-row counts", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([SERIES_ROW])); // loadOwnedSeries lookup

    const txDeleteWhere = vi.fn(() => Promise.resolve());
    const txDelete = vi.fn(() => ({ where: txDeleteWhere }));

    // 10 COUNT aggregate queries (one per child table) run via Promise.all
    // inside the transaction — each resolves to a single-row count.
    let countCall = 0;
    const countValues = [3, 5, 4, 9, 6, 6, 2, 7, 1, 0]; // episodes, characters, characterAssets,
    // shotReferences, episodeRuns, runArtifacts, approvalCheckpoints, memoryEvents,
    // memorySnapshots, qcReports (matches Promise.all order in the router)
    const txSelect = vi.fn(() => {
      const value = countValues[countCall] ?? 0;
      countCall += 1;
      return selectChain([{ count: value }]);
    });

    const tx = { select: txSelect, delete: txDelete };
    mockDb.transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(tx)
    );

    const result = await router.deleteSeries({
      ctx: ctx(),
      input: { seriesId: "10", confirmName: "Corporate Betrayal" },
    });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(txDelete).toHaveBeenCalledTimes(1);
    expect(txSelect).toHaveBeenCalledTimes(10);

    expect(result).toMatchObject({
      deleted: true,
      seriesId: "10",
      episodesDeleted: 3,
      charactersDeleted: 5,
      characterAssetsDeleted: 4,
      shotReferencesDeleted: 9,
      episodeRunsDeleted: 6,
      runArtifactsDeleted: 6,
      approvalCheckpointsDeleted: 2,
      memoryEventsDeleted: 7,
      memorySnapshotsDeleted: 1,
      qcReportsDeleted: 0,
    });
  });

  it("scopes the ownership lookup to the caller's tenant and never another tenant's series", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // no row matches this tenant/user

    await expect(
      router.deleteSeries({
        ctx: ctx({ tenantId: "other-tenant" }),
        input: { seriesId: "10", confirmName: "Corporate Betrayal" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});
