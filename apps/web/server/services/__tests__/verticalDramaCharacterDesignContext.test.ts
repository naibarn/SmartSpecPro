import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `crossSeriesUniqueness` parent exclusion (plan Stage 2.3,
 * `planning/vd-series-memory-and-lineage/plan.md`) — exercises
 * `loadCharacterDesignContext`'s actual DB query (NOT the pure
 * `buildCharacterDesignContextFromRows` the rest of this file covers), since
 * the fix lives in the `ne(...)` predicate passed to `db.select()`.
 */
const { mockDb, setSelectResults, getWhereConditions, resetQueryHarness } = vi.hoisted(() => {
  let queue: unknown[][] = [];
  let whereConditions: unknown[] = [];
  function selectBuilder() {
    const builder: any = {};
    builder.from = vi.fn(() => builder);
    builder.where = vi.fn((condition: unknown) => {
      whereConditions.push(condition);
      return builder;
    });
    builder.orderBy = vi.fn(() => builder);
    builder.limit = vi.fn(() => Promise.resolve(queue.shift() ?? []));
    // `currentCastRows` is awaited directly off `.limit(...)` above; the
    // `recentSeriesRows`/`recentCharacterRows` queries (inside the try/catch)
    // are also awaited directly off `.limit(...)` — no bare `.where()` await
    // occurs in `loadCharacterDesignContext`, so `.limit` is the only
    // resolution point this mock needs.
    return builder;
  }
  const mockDb = { select: vi.fn(() => selectBuilder()) };
  return {
    mockDb,
    setSelectResults: (results: unknown[][]) => {
      queue = [...results];
    },
    getWhereConditions: () => whereConditions,
    resetQueryHarness: () => {
      queue = [];
      whereConditions = [];
    },
  };
});
vi.mock("../../db", () => ({ db: mockDb }));
vi.mock("../../_core/logger", () => ({ debugError: vi.fn() }));

import {
  buildCharacterDesignContextFromRows,
  extractCharacterDesignDna,
  loadCharacterDesignContext,
} from "../verticalDramaCharacterDesignContext";

function characterRow(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    characterKey: `character-${id}`,
    name: `Character ${id}`,
    role: id % 2 === 0 ? "support" : "lead",
    data: {
      description: `Description ${id}`,
      visualBible: {
        visualIdentitySummary: `Visual identity ${id}`,
      },
    },
    parentCharacterId: null,
    sharesFaceWithCharacterId: null,
    updatedAt: new Date(
      `2026-07-${String((id % 20) + 1).padStart(2, "0")}T00:00:00Z`
    ),
    ...overrides,
  };
}

describe("verticalDramaCharacterDesignContext", () => {
  it("retains the target and caps the contrast cast at 30", () => {
    const target = characterRow(999, { role: "นางเอก" });
    const context = buildCharacterDesignContextFromRows({
      series: {
        id: 100,
        title: "The Last Verdict",
        genre: "legal thriller",
        tone: "restrained",
        bible: { premise: "A public defender uncovers a family conspiracy." },
      },
      target,
      currentCastRows: Array.from({ length: 40 }, (_, index) =>
        characterRow(index + 1)
      ),
      recentSeriesRows: [],
      recentCharacterRows: [],
    });

    expect(context.currentCast).toHaveLength(30);
    expect(context.currentCast[0]).toMatchObject({
      characterId: 999,
      relationshipKind: "target",
    });
    expect(context.archiveStatus).toBe("available");
  });

  it("treats variants as identity evidence and twins as face-linked people", () => {
    const target = characterRow(10, { parentCharacterId: 5 });
    const context = buildCharacterDesignContextFromRows({
      series: {
        id: 100,
        title: "Kin",
        genre: "drama",
        tone: "warm",
        bible: {},
      },
      target,
      currentCastRows: [
        characterRow(5),
        characterRow(11, { parentCharacterId: 5 }),
        characterRow(12, { sharesFaceWithCharacterId: 10 }),
      ],
      recentSeriesRows: [],
      recentCharacterRows: [],
    });

    expect(
      context.currentCast.find(entry => entry.characterId === 5)
        ?.relationshipKind
    ).toBe("same_person_variant");
    expect(
      context.currentCast.find(entry => entry.characterId === 11)
        ?.relationshipKind
    ).toBe("same_person_variant");
    expect(
      context.currentCast.find(entry => entry.characterId === 12)
        ?.relationshipKind
    ).toBe("face_linked_twin");
  });

  it("retains at most five recent series and two usable leads per series", () => {
    const recentSeriesRows = Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      title: `Series ${index + 1}`,
      genre: "romance",
      tone: "bright",
      bible: {},
      updatedAt: new Date(
        `2026-06-${String(20 - index).padStart(2, "0")}T00:00:00Z`
      ),
    }));
    const recentCharacterRows = recentSeriesRows.flatMap(series => [
      {
        ...characterRow(series.id * 100 + 1, { role: "นางเอก" }),
        seriesId: series.id,
      },
      {
        ...characterRow(series.id * 100 + 2, { role: "พระเอก" }),
        seriesId: series.id,
      },
      {
        ...characterRow(series.id * 100 + 3, { role: "ตัวเอก" }),
        seriesId: series.id,
      },
      {
        ...characterRow(series.id * 100 + 4, { role: "support" }),
        seriesId: series.id,
      },
    ]);

    const context = buildCharacterDesignContextFromRows({
      series: {
        id: 99,
        title: "New Series",
        genre: "romance",
        tone: "dark",
        bible: {},
      },
      target: characterRow(999),
      currentCastRows: [],
      recentSeriesRows,
      recentCharacterRows,
    });

    expect(context.recentLeadArchive).toHaveLength(5);
    expect(
      context.recentLeadArchive.every(series => series.leads.length === 2)
    ).toBe(true);
  });

  it("ignores malformed persisted DNA instead of leaking it into comparison context", () => {
    expect(
      extractCharacterDesignDna({
        visualBible: { designDna: { version: 1, designIntent: "partial" } },
      })
    ).toBeUndefined();
  });

  it("marks degraded archive context explicitly without weakening current-cast evidence", () => {
    const context = buildCharacterDesignContextFromRows({
      series: {
        id: 100,
        title: "The Last Verdict",
        genre: "legal thriller",
        tone: "restrained",
        bible: {},
      },
      target: characterRow(999),
      currentCastRows: [characterRow(2)],
      recentSeriesRows: [],
      recentCharacterRows: [],
      archiveStatus: "unavailable",
    });

    expect(context.archiveStatus).toBe("unavailable");
    expect(context.currentCast).toHaveLength(2);
    expect(context.recentLeadArchive).toEqual([]);
  });
});

/** Recursively collects every numeric leaf value out of a drizzle-orm `SQL` condition tree (`.queryChunks[].value`) — used to assert WHICH ids a composed `and(...)` condition compares against, without depending on drizzle's internal AST shape beyond this one property. */
function extractNumericLiterals(node: unknown, out: number[] = []): number[] {
  if (node == null || typeof node !== "object") return out;
  const record = node as Record<string, unknown>;
  if (typeof record.value === "number") out.push(record.value);
  if (Array.isArray(record.queryChunks)) {
    for (const chunk of record.queryChunks) extractNumericLiterals(chunk, out);
  }
  return out;
}

describe("loadCharacterDesignContext — crossSeriesUniqueness parent exclusion (plan Stage 2.3)", () => {
  beforeEach(() => {
    resetQueryHarness();
  });

  const owner = { tenantId: "tenant-1", userId: 42 };
  const target = characterRow(999);

  it("excludes the PARENT series (not just the current series) from the recentLeadArchive query when parentSeriesId is set", async () => {
    setSelectResults([[], [], []]);
    await loadCharacterDesignContext(
      owner,
      { id: 100, title: "Season 2", genre: "romance", tone: "warm", bible: {}, parentSeriesId: 55 },
      target
    );

    const recentSeriesCondition = getWhereConditions()[1];
    const comparedIds = extractNumericLiterals(recentSeriesCondition);
    expect(comparedIds).toContain(100); // still excludes itself
    expect(comparedIds).toContain(55); // NEW: also excludes its own parent
  });

  it("is unchanged (no parent exclusion) when parentSeriesId is null", async () => {
    setSelectResults([[], [], []]);
    await loadCharacterDesignContext(
      owner,
      { id: 100, title: "Original Series", genre: "romance", tone: "warm", bible: {}, parentSeriesId: null },
      target
    );

    const recentSeriesCondition = getWhereConditions()[1];
    const comparedIds = extractNumericLiterals(recentSeriesCondition);
    expect(comparedIds).toContain(100);
    expect(comparedIds).not.toContain(55);
  });

  it("is unchanged when parentSeriesId is simply absent from the series object (older call sites)", async () => {
    setSelectResults([[], [], []]);
    await loadCharacterDesignContext(
      owner,
      { id: 100, title: "Original Series", genre: "romance", tone: "warm", bible: {} },
      target
    );

    const recentSeriesCondition = getWhereConditions()[1];
    const comparedIds = extractNumericLiterals(recentSeriesCondition);
    expect(comparedIds).toContain(100);
  });
});
