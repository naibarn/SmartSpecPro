/**
 * Coverage for `verticalDramaSeriesClone.ts` (Stage 2.3,
 * `planning/vd-series-memory-and-lineage/plan.md`).
 *
 * `db.transaction` is mocked with a single fake `tx` (mirrors
 * `verticalDramaSeriesMemoryProjection.test.ts`'s own mocking shape) whose
 * `select().from(table).where(...)` resolves per-table fixture rows and whose
 * `insert(table).values(rows)` records what was inserted and (for tables the
 * real code calls `.returning()` on) hands back deterministic new ids. This
 * exercises the REAL clone logic end-to-end, not a fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  verticalDramaCharacters,
  verticalDramaCharacterAliases,
  verticalDramaCharacterAssets,
  verticalDramaLocations,
  verticalDramaLocationAssets,
} from "../../../drizzle/schema";

const {
  mockDb,
  resetHarness,
  setTableRows,
  getInsertedRows,
  getUpdatedRows,
} = vi.hoisted(() => {
  let rowsByTable = new Map<unknown, unknown[]>();
  let insertedByTable = new Map<unknown, unknown[]>();
  let updatedRows: Array<{ table: unknown; id: number; values: any }> = [];
  let nextId = 1000;

  function selectBuilder() {
    let selectedTable: unknown = null;
    const builder: any = {};
    builder.from = vi.fn((table: unknown) => {
      selectedTable = table;
      return builder;
    });
    builder.where = vi.fn(
      () => Promise.resolve(rowsByTable.get(selectedTable) ?? [])
    );
    return builder;
  }

  function insertBuilder(table: unknown) {
    const builder: any = {};
    builder.values = vi.fn((rowsOrRow: any) => {
      const rows = Array.isArray(rowsOrRow) ? rowsOrRow : [rowsOrRow];
      const existing = insertedByTable.get(table) ?? [];
      insertedByTable.set(table, [...existing, ...rows]);
      const chain: any = {
        returning: vi.fn((_proj: unknown) =>
          Promise.resolve(rows.map(() => ({ id: nextId++ })))
        ),
        then: (resolve: any, reject: any) =>
          Promise.resolve(undefined).then(resolve, reject),
      };
      return chain;
    });
    return builder;
  }

  function updateBuilder(table: unknown) {
    const builder: any = {};
    builder.set = vi.fn((values: any) => {
      const chain: any = {
        where: vi.fn((condition: any) => {
          // The real `eq(verticalDramaCharacters.id, newId)` call shape —
          // extract `newId` defensively without depending on drizzle-orm's
          // internal SQL node structure.
          const id =
            condition?.queryChunks
              ?.map((chunk: any) => chunk?.value ?? chunk)
              .find((value: unknown) => typeof value === "number") ??
            condition?.right?.value ??
            null;
          updatedRows.push({ table, id, values });
          return Promise.resolve(undefined);
        }),
      };
      return chain;
    });
    return builder;
  }

  const mockTx = {
    select: vi.fn(() => selectBuilder()),
    insert: vi.fn((table: unknown) => insertBuilder(table)),
    update: vi.fn((table: unknown) => updateBuilder(table)),
  };

  const mockDb = {
    transaction: vi
      .fn()
      .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
  };

  return {
    mockDb,
    resetHarness: () => {
      rowsByTable = new Map();
      insertedByTable = new Map();
      updatedRows = [];
      nextId = 1000;
      mockDb.transaction.mockClear();
    },
    setTableRows: (table: unknown, rows: unknown[]) => {
      rowsByTable.set(table, rows);
    },
    getInsertedRows: (table: unknown) => insertedByTable.get(table) ?? [],
    getUpdatedRows: () => updatedRows,
  };
});

vi.mock("../../db", () => ({ db: mockDb }));

import {
  cloneSeriesCastForLineage,
  mergeCarryOverCurrentState,
  resolveCarryOverAvailability,
} from "../verticalDramaSeriesClone";
import type { VerticalDramaSeriesLineage } from "@shared/verticalDramaSeries/lineage";

beforeEach(() => {
  resetHarness();
});

const TENANT = "tenant-1";
const USER_ID = 42;
const PARENT_SERIES_ID = 16;
const CHILD_SERIES_ID = 99;

function baseParams(lineage?: VerticalDramaSeriesLineage) {
  return {
    tenantId: TENANT,
    userId: USER_ID,
    parentSeriesId: PARENT_SERIES_ID,
    childSeriesId: CHILD_SERIES_ID,
    lineage,
  };
}

describe("resolveCarryOverAvailability / mergeCarryOverCurrentState (pure)", () => {
  it("defaults to returns when no decision exists", () => {
    expect(resolveCarryOverAvailability(undefined)).toBe("returns");
  });

  it("merges postFinaleStatus/suggestedStateUpdate into emotionalState, preserving other currentState keys", () => {
    const merged = mergeCarryOverCurrentState(
      { storyKnowledge: ["knows the truth"] },
      {
        characterKey: "char_a",
        name: "A",
        postFinaleStatus: "won the war",
        availability: "returns",
        suggestedStateUpdate: "estranged from her sister",
      }
    );
    expect(merged.storyKnowledge).toEqual(["knows the truth"]);
    expect(merged.emotionalState).toBe("won the war — estranged from her sister");
  });

  it("leaves currentState untouched when there is no decision", () => {
    const original = { emotionalState: "content" };
    expect(mergeCarryOverCurrentState(original, undefined)).toEqual(original);
  });
});

describe("cloneSeriesCastForLineage", () => {
  it("clones characters preserving characterKey, merges currentState, stamps data.lineage", async () => {
    setTableRows(verticalDramaCharacters, [
      {
        id: 1,
        characterKey: "char_aria",
        name: "Aria",
        role: "lead",
        narrativeRole: "protagonist",
        roleTier: "lead",
        occupation: "CEO",
        roleVisualIntent: null,
        roleProvenance: "ai_assigned",
        roleReviewStatus: "ready",
        data: { currentState: { emotionalState: "victorious" } },
        voiceConfig: { voiceId: "v1" },
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
        sharesFaceWithCharacterId: null,
      },
    ]);

    const lineage: VerticalDramaSeriesLineage = {
      contractVersion: 1,
      parentSeriesId: PARENT_SERIES_ID,
      parentTitle: "Season 1",
      createMode: "sequel",
      carryOver: {
        contractVersion: 1,
        characters: [
          {
            characterKey: "char_aria",
            name: "Aria",
            postFinaleStatus: "won the corporate war",
            availability: "returns",
            suggestedStateUpdate: "estranged from her sister",
          },
        ],
        newCharacterSuggestions: [],
        newConflictDirections: ["a new rot inside the company she won"],
        antagonistStrategy: "new antagonist",
        carriedRelationships: [],
        carriedThreads: [],
      },
    };

    const summary = await cloneSeriesCastForLineage(baseParams(lineage));

    expect(summary.charactersCloned).toBe(1);
    expect(summary.charactersWrittenOut).toBe(0);

    const inserted = getInsertedRows(verticalDramaCharacters);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].characterKey).toBe("char_aria");
    expect(inserted[0].seriesId).toBe(CHILD_SERIES_ID);
    expect(inserted[0].data.currentState.emotionalState).toBe(
      "won the corporate war — estranged from her sister"
    );
    expect(inserted[0].data.lineage).toMatchObject({
      parentSeriesId: PARENT_SERIES_ID,
      parentCharacterId: 1,
      carriedOver: true,
    });
    expect(inserted[0].voiceConfig).toEqual({ voiceId: "v1" });
  });

  it("skips characters whose carry-over decision is write_out", async () => {
    setTableRows(verticalDramaCharacters, [
      {
        id: 1,
        characterKey: "char_villain",
        name: "Villain",
        role: "antagonist",
        narrativeRole: "antagonist",
        roleTier: "lead",
        occupation: null,
        roleVisualIntent: null,
        roleProvenance: null,
        roleReviewStatus: null,
        data: {},
        voiceConfig: null,
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
        sharesFaceWithCharacterId: null,
      },
    ]);

    const lineage: VerticalDramaSeriesLineage = {
      contractVersion: 1,
      parentSeriesId: PARENT_SERIES_ID,
      parentTitle: "Season 1",
      createMode: "sequel",
      carryOver: {
        contractVersion: 1,
        characters: [
          {
            characterKey: "char_villain",
            name: "Villain",
            postFinaleStatus: "died in the finale",
            availability: "write_out",
          },
        ],
        newCharacterSuggestions: [],
        newConflictDirections: ["x"],
        antagonistStrategy: "new one",
        carriedRelationships: [],
        carriedThreads: [],
      },
    };

    const summary = await cloneSeriesCastForLineage(baseParams(lineage));
    expect(summary.charactersCloned).toBe(0);
    expect(summary.charactersWrittenOut).toBe(1);
    expect(getInsertedRows(verticalDramaCharacters)).toHaveLength(0);
  });

  it("remaps parentCharacterId/sharesFaceWithCharacterId self-FKs to the NEW child-series ids, never dangling at the parent's ids", async () => {
    setTableRows(verticalDramaCharacters, [
      {
        id: 1,
        characterKey: "char_twin_a",
        name: "Twin A",
        role: null,
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        roleVisualIntent: null,
        roleProvenance: null,
        roleReviewStatus: null,
        data: {},
        voiceConfig: null,
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
        sharesFaceWithCharacterId: null,
      },
      {
        id: 2,
        characterKey: "char_twin_b",
        name: "Twin B",
        role: null,
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        roleVisualIntent: null,
        roleProvenance: null,
        roleReviewStatus: null,
        data: {},
        voiceConfig: null,
        parentCharacterId: null,
        variantLabel: null,
        variantType: "outfit",
        sharesFaceWithCharacterId: 1,
      },
    ]);

    await cloneSeriesCastForLineage(baseParams(undefined));

    const updated = getUpdatedRows();
    // Row 2 (Twin B) is remapped to point at the NEW id for row 1 — never
    // left pointing at the parent-series row id (1).
    const twinBUpdate = updated.find(u => u.values.sharesFaceWithCharacterId !== null);
    expect(twinBUpdate).toBeDefined();
    expect(twinBUpdate!.values.sharesFaceWithCharacterId).not.toBe(1);
    expect(twinBUpdate!.values.sharesFaceWithCharacterId).toBeGreaterThanOrEqual(1000);
  });

  it("nulls out a self-FK whose referent was written out", async () => {
    setTableRows(verticalDramaCharacters, [
      {
        id: 1,
        characterKey: "char_dead_twin",
        name: "Dead Twin",
        role: null,
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        roleVisualIntent: null,
        roleProvenance: null,
        roleReviewStatus: null,
        data: {},
        voiceConfig: null,
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
        sharesFaceWithCharacterId: null,
      },
      {
        id: 2,
        characterKey: "char_survivor",
        name: "Survivor",
        role: null,
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        roleVisualIntent: null,
        roleProvenance: null,
        roleReviewStatus: null,
        data: {},
        voiceConfig: null,
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
        sharesFaceWithCharacterId: 1,
      },
    ]);

    const lineage: VerticalDramaSeriesLineage = {
      contractVersion: 1,
      parentSeriesId: PARENT_SERIES_ID,
      parentTitle: "Season 1",
      createMode: "sequel",
      carryOver: {
        contractVersion: 1,
        characters: [
          {
            characterKey: "char_dead_twin",
            name: "Dead Twin",
            postFinaleStatus: "died",
            availability: "write_out",
          },
        ],
        newCharacterSuggestions: [],
        newConflictDirections: ["x"],
        antagonistStrategy: "x",
        carriedRelationships: [],
        carriedThreads: [],
      },
    };

    await cloneSeriesCastForLineage(baseParams(lineage));

    const updated = getUpdatedRows();
    const survivorUpdate = updated.find(u => u.values.sharesFaceWithCharacterId !== undefined);
    expect(survivorUpdate).toBeDefined();
    expect(survivorUpdate!.values.sharesFaceWithCharacterId).toBeNull();
  });

  it("clones aliases intact, keyed to the new character id", async () => {
    setTableRows(verticalDramaCharacters, [
      {
        id: 1,
        characterKey: "char_a",
        name: "A",
        role: null,
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        roleVisualIntent: null,
        roleProvenance: null,
        roleReviewStatus: null,
        data: {},
        voiceConfig: null,
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
        sharesFaceWithCharacterId: null,
      },
    ]);
    setTableRows(verticalDramaCharacterAliases, [
      {
        id: 5,
        tenantId: TENANT,
        seriesId: PARENT_SERIES_ID,
        characterId: 1,
        alias: "Kirin",
        normalizedAlias: "kirin",
        source: "bible_declared",
      },
    ]);

    await cloneSeriesCastForLineage(baseParams(undefined));

    const insertedAliases = getInsertedRows(verticalDramaCharacterAliases);
    expect(insertedAliases).toHaveLength(1);
    expect(insertedAliases[0]).toMatchObject({
      seriesId: CHILD_SERIES_ID,
      alias: "Kirin",
      normalizedAlias: "kirin",
      source: "bible_declared",
    });
    expect(insertedAliases[0].characterId).toBeGreaterThanOrEqual(1000);
  });

  it("clones character assets sharing the SAME mediaAssetId, pre-approved", async () => {
    setTableRows(verticalDramaCharacters, [
      {
        id: 1,
        characterKey: "char_a",
        name: "A",
        role: null,
        narrativeRole: null,
        roleTier: null,
        occupation: null,
        roleVisualIntent: null,
        roleProvenance: null,
        roleReviewStatus: null,
        data: {},
        voiceConfig: null,
        parentCharacterId: null,
        variantLabel: null,
        variantType: null,
        sharesFaceWithCharacterId: null,
      },
    ]);
    setTableRows(verticalDramaCharacterAssets, [
      {
        id: 9,
        tenantId: TENANT,
        userId: USER_ID,
        seriesId: PARENT_SERIES_ID,
        characterId: 1,
        mediaAssetId: 777,
        assetType: "portrait",
        role: "primary",
        approved: true,
        containsHumanFace: true,
        qcStatus: "passed",
        checksumSha256: "abc123",
        metadata: { source: "generated" },
      },
    ]);

    const summary = await cloneSeriesCastForLineage(baseParams(undefined));
    expect(summary.characterAssetsCloned).toBe(1);

    const insertedAssets = getInsertedRows(verticalDramaCharacterAssets);
    expect(insertedAssets).toHaveLength(1);
    expect(insertedAssets[0].mediaAssetId).toBe(777);
    expect(insertedAssets[0].approved).toBe(true);
    expect(insertedAssets[0].seriesId).toBe(CHILD_SERIES_ID);
  });

  it("clones locations preserving locationKey + their plate assets sharing mediaAssetId", async () => {
    setTableRows(verticalDramaLocations, [
      {
        id: 3,
        tenantId: TENANT,
        userId: USER_ID,
        seriesId: PARENT_SERIES_ID,
        locationKey: "loc_cafe",
        name: "Cafe",
        data: { description: "a cafe" },
      },
    ]);
    setTableRows(verticalDramaLocationAssets, [
      {
        id: 11,
        tenantId: TENANT,
        userId: USER_ID,
        seriesId: PARENT_SERIES_ID,
        locationId: 3,
        mediaAssetId: 888,
        assetType: "location_reference",
        role: "establishing_plate",
        approved: true,
        qcStatus: "passed",
        checksumSha256: "def456",
        metadata: null,
      },
    ]);

    const summary = await cloneSeriesCastForLineage(baseParams(undefined));
    expect(summary.locationsCloned).toBe(1);
    expect(summary.locationAssetsCloned).toBe(1);

    const insertedLocations = getInsertedRows(verticalDramaLocations);
    expect(insertedLocations[0].locationKey).toBe("loc_cafe");
    expect(insertedLocations[0].seriesId).toBe(CHILD_SERIES_ID);

    const insertedLocationAssets = getInsertedRows(verticalDramaLocationAssets);
    expect(insertedLocationAssets[0].mediaAssetId).toBe(888);
    expect(insertedLocationAssets[0].seriesId).toBe(CHILD_SERIES_ID);
  });

  it("clones nothing when the parent has an empty roster", async () => {
    const summary = await cloneSeriesCastForLineage(baseParams(undefined));
    expect(summary).toEqual({
      charactersCloned: 0,
      charactersWrittenOut: 0,
      aliasesCloned: 0,
      characterAssetsCloned: 0,
      locationsCloned: 0,
      locationAssetsCloned: 0,
    });
  });
});
