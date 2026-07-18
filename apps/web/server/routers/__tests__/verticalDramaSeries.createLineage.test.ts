/**
 * Vertical Drama Series — `create`'s season/special-edition lineage
 * (Stage 2.1/2.3, `planning/vd-series-memory-and-lineage/plan.md`) plus the
 * `proposeSeasonCarryOver` mutation (Stage 2.2).
 *
 * Same "mock the whole module graph, test the exported procedure handler
 * directly" convention as `verticalDramaSeries.createPresetStamp.test.ts`.
 * Covers:
 *  - `create`, ORIGINAL mode (no `parentSeriesId`): writes all 4 new columns
 *    as NULL — the single most important regression test (plan brief).
 *  - `create`, flag OFF even with `parentSeriesId` set: still NULL columns,
 *    no ownership check, no clone call — byte-identical to original mode.
 *  - `create`, flag ON + valid owned parent: columns populated + clone
 *    invoked with the right args.
 *  - `create`, flag ON + parent NOT owned (cross-tenant/user): HARD THROWS
 *    (NOT_FOUND) — never a silent empty sequel — and the insert never runs.
 *  - `proposeSeasonCarryOver`: flag off -> FORBIDDEN; flag on + owned
 *    parent -> loads lineage context and returns the synthesized draft;
 *    cross-tenant parent -> NOT_FOUND.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const db: any = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    instance: {},
  };
  // The `create` mutation now runs the insert + cast/location clone for a
  // sequel/special-edition inside ONE `db.transaction` (orphan-row fix) — the
  // fake `tx` handle passed to the callback IS this same mock `db` object, so
  // every existing assertion against `mockDb.insert.mock.results[...]` still
  // finds the insert call it expects, whether or not that call happened to
  // run through a transaction.
  db.transaction = vi.fn((fn: (tx: unknown) => unknown) => fn(db));
  return { mockDb: db };
});
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

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

const { mockLoadLineageContext } = vi.hoisted(() => ({
  mockLoadLineageContext: vi.fn(),
}));
vi.mock("../../services/verticalDramaSeriesLineage", () => ({
  loadLineageContext: mockLoadLineageContext,
}));

const { mockCloneSeriesCastForLineage } = vi.hoisted(() => ({
  mockCloneSeriesCastForLineage: vi.fn(),
}));
vi.mock("../../services/verticalDramaSeriesClone", () => ({
  cloneSeriesCastForLineage: mockCloneSeriesCastForLineage,
}));

const { mockSynthesizeSeasonCarryOver } = vi.hoisted(() => ({
  mockSynthesizeSeasonCarryOver: vi.fn(),
}));
vi.mock("../../services/verticalDramaSeasonCarryOver", () => ({
  synthesizeSeasonCarryOver: mockSynthesizeSeasonCarryOver,
  SeasonCarryOverInputError: class extends Error {},
}));

const { mockSynthesizeSpecialEditionBrief } = vi.hoisted(() => ({
  mockSynthesizeSpecialEditionBrief: vi.fn(),
}));
vi.mock("../../services/verticalDramaSpecialEdition", () => ({
  synthesizeSpecialEditionBrief: mockSynthesizeSpecialEditionBrief,
  composeSpecialEditionUserPremise: vi.fn(),
  SpecialEditionInputError: class extends Error {},
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

function insertChain(returned: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

const PARENT_ROW = {
  id: 16,
  tenantId: "tenant-1",
  userId: 42,
  title: "Season 1",
  locale: "th",
  genre: "romance",
  tone: "dramatic",
  bible: {},
  memory: null,
  parentSeriesId: null,
  createMode: null,
  seasonNumber: null,
  lineage: null,
};

const INSERTED_ROW = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "My Sequel",
  locale: "th",
  aspectRatio: "9:16",
  status: "draft",
  targetEpisodeCount: 10,
  defaultEpisodeDurationSeconds: 60,
  genre: null,
  tone: null,
  targetAudience: null,
  agePolicyId: null,
  bible: null,
  memory: null,
  productTieIn: null,
  policy: null,
  parentSeriesId: null,
  createMode: null,
  seasonNumber: null,
  lineage: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("create — season lineage (Stage 2.1/2.3)", () => {
  it("ORIGINAL mode (no parentSeriesId): writes all 4 new columns as NULL — the critical regression test", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));

    const result = await router.create({
      ctx: ctx(),
      input: { title: "My Series" },
    });

    expect(mockGetTenantFeatureFlags).not.toHaveBeenCalled();
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockCloneSeriesCastForLineage).not.toHaveBeenCalled();

    const insertedValues = (mockDb.insert.mock.results[0].value as any).values.mock
      .calls[0][0];
    expect(insertedValues.parentSeriesId).toBeNull();
    expect(insertedValues.createMode).toBeNull();
    expect(insertedValues.seasonNumber).toBeNull();
    expect(insertedValues.lineage).toBeNull();
    expect(result.series.id).toBe("10");
  });

  it("flag OFF even with parentSeriesId set: still NULL columns, no ownership check, no clone", async () => {
    mockDb.insert.mockReturnValueOnce(insertChain([INSERTED_ROW]));
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: false });

    const result = await router.create({
      ctx: ctx(),
      input: { title: "My Sequel", parentSeriesId: "16" },
    });

    expect(mockGetTenantFeatureFlags).toHaveBeenCalledTimes(1);
    expect(mockDb.select).not.toHaveBeenCalled();
    expect(mockCloneSeriesCastForLineage).not.toHaveBeenCalled();

    const insertedValues = (mockDb.insert.mock.results[0].value as any).values.mock
      .calls[0][0];
    expect(insertedValues.parentSeriesId).toBeNull();
    expect(insertedValues.createMode).toBeNull();
    expect(result.series.id).toBe("10");
  });

  it("flag ON + valid owned parent: populates lineage columns and clones the cast", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([PARENT_ROW])); // loadOwnedSeries
    const insertedWithLineage = {
      ...INSERTED_ROW,
      parentSeriesId: 16,
      createMode: "sequel",
      seasonNumber: 2,
    };
    mockDb.insert.mockReturnValueOnce(insertChain([insertedWithLineage]));
    mockCloneSeriesCastForLineage.mockResolvedValue({
      charactersCloned: 3,
      charactersWrittenOut: 0,
      aliasesCloned: 1,
      characterAssetsCloned: 2,
      locationsCloned: 1,
      locationAssetsCloned: 1,
    });

    const result = await router.create({
      ctx: ctx(),
      input: {
        title: "My Sequel",
        parentSeriesId: "16",
        createMode: "sequel",
        seasonNumber: 2,
      },
    });

    const insertedValues = (mockDb.insert.mock.results[0].value as any).values.mock
      .calls[0][0];
    expect(insertedValues.parentSeriesId).toBe(16);
    expect(insertedValues.createMode).toBe("sequel");
    expect(insertedValues.seasonNumber).toBe(2);

    expect(mockCloneSeriesCastForLineage).toHaveBeenCalledTimes(1);
    expect(mockCloneSeriesCastForLineage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        userId: 42,
        parentSeriesId: 16,
        childSeriesId: 10,
      }),
      // Insert + clone transactional guarantee (orphan-row fix) — the SAME
      // `tx` handle the insert just ran on is passed through, not a bare
      // second `undefined` arg.
      expect.anything()
    );
    expect(result.series.id).toBe("10");
  });

  it("flag ON + parent NOT owned (cross-tenant/user): HARD THROWS NOT_FOUND, insert never runs", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries finds nothing

    await expect(
      router.create({
        ctx: ctx(),
        input: { title: "My Sequel", parentSeriesId: "999999" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("a clone failure HARD-THROWS — no orphan sequel row, never a plain success (orphan-row fix)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([PARENT_ROW]));
    mockDb.insert.mockReturnValueOnce(
      insertChain([{ ...INSERTED_ROW, parentSeriesId: 16 }])
    );
    mockCloneSeriesCastForLineage.mockRejectedValue(new Error("db exploded"));

    // Previously this resolved successfully with `result.series.id === "10"`
    // — a sequel row persisted with `parentSeriesId` set and ZERO cloned
    // cast, silently. Now the insert + clone run inside ONE `db.transaction`
    // (this test's `mockDb.transaction` fake runs the callback against the
    // SAME mock `db`, so the insert call above is still observable, but in
    // the REAL Postgres driver a thrown error inside that callback rolls the
    // whole transaction — insert included — back; no orphan row reaches the
    // database).
    await expect(
      router.create({
        ctx: ctx(),
        input: { title: "My Sequel", parentSeriesId: "16" },
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockCloneSeriesCastForLineage).toHaveBeenCalledTimes(1);
  });
});

describe("proposeSeasonCarryOver (Stage 2.2)", () => {
  it("flag OFF: FORBIDDEN", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: false });

    await expect(
      router.proposeSeasonCarryOver({
        ctx: ctx(),
        input: { parentSeriesId: "16" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("flag ON + owned parent: loads lineage context and returns the synthesized draft", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([PARENT_ROW]));
    const lineageContext = {
      parentSeriesId: 16,
      hasMemory: true,
      memoryEpisodesRecorded: 18,
      parentEpisodeCount: 20,
      currentState: { relationships: [], openThreads: [] },
    };
    mockLoadLineageContext.mockResolvedValue(lineageContext);
    mockSynthesizeSeasonCarryOver.mockResolvedValue({
      draft: { contractVersion: 1, characters: [] },
      creditsUsed: 5,
      model: "test-model",
    });

    const result = await router.proposeSeasonCarryOver({
      ctx: ctx(),
      input: { parentSeriesId: "16", premise: "a new heist" },
    });

    expect(mockLoadLineageContext).toHaveBeenCalledWith(
      PARENT_ROW,
      expect.objectContaining({ tenantId: "tenant-1", userId: 42 })
    );
    expect(mockSynthesizeSeasonCarryOver).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        premise: "a new heist",
        lineageContext,
      })
    );
    expect(result.hasMemory).toBe(true);
    expect(result.memoryEpisodesRecorded).toBe(18);
    expect(result.draft).toEqual({ contractVersion: 1, characters: [] });
  });

  it("cross-tenant/unowned parent: NOT_FOUND", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.proposeSeasonCarryOver({
        ctx: ctx(),
        input: { parentSeriesId: "999999" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockLoadLineageContext).not.toHaveBeenCalled();
    expect(mockSynthesizeSeasonCarryOver).not.toHaveBeenCalled();
  });
});

describe("proposeSpecialEditionBrief (Stage 2.5)", () => {
  it("flag OFF: FORBIDDEN", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: false });

    await expect(
      router.proposeSpecialEditionBrief({
        ctx: ctx(),
        input: {
          parentSeriesId: "16",
          targetEpisodeCount: 1,
          storyFunctionChoice: "review",
        },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("flag ON + owned parent: loads lineage context and returns the synthesized brief", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([PARENT_ROW]));
    const lineageContext = {
      parentSeriesId: 16,
      hasMemory: true,
      memoryEpisodesRecorded: 18,
      parentEpisodeCount: 20,
      currentState: { relationships: [], openThreads: [] },
    };
    mockLoadLineageContext.mockResolvedValue(lineageContext);
    mockSynthesizeSpecialEditionBrief.mockResolvedValue({
      draft: { contractVersion: 1, storyShape: "review", episodeBriefs: [] },
      suggestedUserPremise: "A cozy afternoon at the cafe.",
      creditsUsed: 3,
      model: "test-model",
    });

    const result = await router.proposeSpecialEditionBrief({
      ctx: ctx(),
      input: {
        parentSeriesId: "16",
        targetEpisodeCount: 1,
        storyFunctionChoice: "review",
        marketplaceProductName: "Riverside Cafe",
      },
    });

    expect(mockLoadLineageContext).toHaveBeenCalledWith(
      PARENT_ROW,
      expect.objectContaining({ tenantId: "tenant-1", userId: 42 })
    );
    expect(mockSynthesizeSpecialEditionBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        targetEpisodeCount: 1,
        storyFunctionChoice: "review",
        source: expect.objectContaining({ marketplaceProductName: "Riverside Cafe" }),
        lineageContext,
      })
    );
    expect(result.hasMemory).toBe(true);
    expect(result.memoryEpisodesRecorded).toBe(18);
    expect(result.suggestedUserPremise).toBe("A cozy afternoon at the cafe.");
  });

  it("cross-tenant/unowned parent: NOT_FOUND", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesLineage: true });
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.proposeSpecialEditionBrief({
        ctx: ctx(),
        input: {
          parentSeriesId: "999999",
          targetEpisodeCount: 1,
          storyFunctionChoice: "review",
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockLoadLineageContext).not.toHaveBeenCalled();
    expect(mockSynthesizeSpecialEditionBrief).not.toHaveBeenCalled();
  });
});
