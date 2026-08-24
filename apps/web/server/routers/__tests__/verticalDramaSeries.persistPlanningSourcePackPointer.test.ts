import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, mockTx } = vi.hoisted(() => {
  const mockTx = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn().mockResolvedValue([]),
  };
  const mockDb = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi
      .fn()
      .mockImplementation(async (callback: (tx: any) => Promise<unknown>) =>
        callback(mockTx)
      ),
  };
  return { mockDb, mockTx };
});

vi.mock("../../db", () => ({ db: mockDb }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const procedure: any = {
      use: () => procedure,
      input: () => procedure,
      query: (handler: Function) => handler,
      mutation: (handler: Function) => handler,
    };
    return procedure;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (value: unknown) => value,
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
const ctx = { tenantId: "tenant-1", user: { id: 42, role: "user" } };

function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    for: vi.fn(() => Promise.resolve(rows)),
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

function insertChain(rows: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("persistPlanningSourcePackPointer", () => {
  it("persists a pack pointer without hydrating prompt-expansion data", async () => {
    const packSelect = selectChain([
      {
        id: 7,
        seriesId: null,
        draftSessionId: "session-123",
        profileId: "drama_romance",
      },
    ]);
    mockDb.select.mockReturnValueOnce(packSelect);
    mockTx.select.mockReturnValueOnce(selectChain([{ bible: null }]));
    mockTx.update.mockReturnValueOnce(
      updateChain([{ id: 10, bible: { planningState: {} } }])
    );

    const result = await router.persistPlanningSourcePackPointer({
      ctx,
      input: {
        seriesId: "10",
        sourcePackId: 7,
        draftSessionId: "session-123",
        profileId: "drama_romance",
      },
    });

    expect(result.pointer).toMatchObject({
      sourcePackId: 7,
      draftSessionId: "session-123",
      profileId: "drama_romance",
    });
    // The pointer path performs one lightweight source-pack lookup. A full
    // load would issue additional slot/asset/analysis/prompt-expansion reads.
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("rejects a source pack that is not owned by the caller", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.persistPlanningSourcePackPointer({
        ctx,
        input: { seriesId: "10", sourcePackId: 999 },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});

describe("updatePlanningSeriesSnapshot", () => {
  it("persists the selected title and Draft session under the Series row lock", async () => {
    mockTx.select.mockReturnValueOnce(
      selectChain([
        {
          bible: {
            planningState: {
              version: 1,
              revision: 3,
              status: "planning",
              lastSavedAt: "2026-08-24T00:00:00.000Z",
            },
          },
        },
      ])
    );
    mockTx.update.mockReturnValueOnce(
      updateChain([
        {
          id: 10,
          title: "Chosen title",
          bible: { planningState: { revision: 4 } },
        },
      ])
    );

    const result = await router.updatePlanningSeriesSnapshot({
      ctx,
      input: {
        seriesId: "10",
        title: "Chosen title",
        draftSessionId: "draft-session-1",
        activeStep: "story",
      },
    });

    expect(result.series.title).toBe("Chosen title");
    expect(result.planningState).toMatchObject({
      revision: 4,
      draftSessionId: "draft-session-1",
      activeStep: "story",
    });
    expect(mockDb.transaction).toHaveBeenCalled();
  });
});

describe("createPlanningSeriesShell", () => {
  it("reuses the owner's newest placeholder instead of creating a twin shell", async () => {
    mockTx.select.mockReturnValueOnce(
      selectChain([
        {
          id: 22,
          title: "กำลังวางแผนซีรีย์ใหม่",
          status: "planning",
        },
      ])
    );

    const result = await router.createPlanningSeriesShell({
      ctx,
      input: {},
    });

    expect(result.series.id).toBe("22");
    expect(mockTx.insert).not.toHaveBeenCalled();
    expect(mockTx.execute).toHaveBeenCalledTimes(1);
  });

  it("creates a new shell when no placeholder exists", async () => {
    mockTx.select.mockReturnValueOnce(selectChain([]));
    mockTx.insert.mockReturnValueOnce(
      insertChain([
        {
          id: 23,
          title: "กำลังวางแผนซีรีย์ใหม่",
          status: "planning",
        },
      ])
    );

    const result = await router.createPlanningSeriesShell({
      ctx,
      input: {},
    });

    expect(result.series.id).toBe("23");
    expect(mockTx.insert).toHaveBeenCalledTimes(1);
  });
});
