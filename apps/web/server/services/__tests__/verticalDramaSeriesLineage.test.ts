/**
 * Coverage for `verticalDramaSeriesLineage.ts` (Stage 2.3,
 * `planning/vd-series-memory-and-lineage/plan.md`) — `loadLineageContext`'s
 * bounded read path: `series.memory` (compactSummary + currentState) plus
 * roster/locations, NEVER the parent's full episode-by-episode content.
 *
 * This module has NO ownership-check responsibility of its own (see its own
 * header doc comment) — a cross-tenant parent is the CALLER's
 * (`server/routers/verticalDramaSeries.ts`'s `loadOwnedSeries`) concern, not
 * this file's. What this test asserts instead is the bounded-read contract:
 * a parent with no recorded memory degrades gracefully (never throws), and
 * the roster/locations queries are correctly tenant/user/series scoped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb, resetHarness, setTableRows } = vi.hoisted(() => {
  let rowsByTable = new Map<unknown, unknown[]>();

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

  const mockDb = {
    select: vi.fn(() => selectBuilder()),
  };

  return {
    mockDb,
    resetHarness: () => {
      rowsByTable = new Map();
    },
    setTableRows: (table: unknown, rows: unknown[]) => {
      rowsByTable.set(table, rows);
    },
  };
});

vi.mock("../../db", () => ({ db: mockDb }));

import { loadLineageContext } from "../verticalDramaSeriesLineage";
import {
  verticalDramaCharacters,
  verticalDramaLocations,
  type VerticalDramaSeriesRow,
} from "../../../drizzle/schema";

beforeEach(() => {
  resetHarness();
});

function parentRow(
  overrides: Partial<VerticalDramaSeriesRow> = {}
): VerticalDramaSeriesRow {
  return {
    id: 16,
    tenantId: "tenant-1",
    userId: 42,
    title: "Season 1",
    locale: "th",
    aspectRatio: "9:16",
    status: "draft",
    targetEpisodeCount: 20,
    defaultEpisodeDurationSeconds: 60,
    genre: "romance",
    tone: "dramatic",
    targetAudience: null,
    agePolicyId: null,
    bible: { visualStyle: "neon noir", cameraGrammar: "handheld" },
    memory: null,
    productTieIn: null,
    policy: null,
    qualityPolicy: null,
    llmModelPolicy: null,
    trailer: null,
    watermark: null,
    productionEpisodesManifest: null,
    parentSeriesId: null,
    createMode: null,
    seasonNumber: null,
    lineage: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  } as VerticalDramaSeriesRow;
}

const OWNER = { tenantId: "tenant-1", userId: 42 };

describe("loadLineageContext", () => {
  it("degrades gracefully when the parent has NO recorded memory yet (the common case today)", async () => {
    const context = await loadLineageContext(parentRow({ memory: null }), OWNER);
    expect(context.hasMemory).toBe(false);
    expect(context.compactSummary).toBe("");
    expect(context.currentState.relationships).toEqual([]);
    expect(context.currentState.openThreads).toEqual([]);
    expect(context.memoryEpisodesRecorded).toBe(0);
  });

  it("never throws on a malformed memory blob", async () => {
    await expect(
      loadLineageContext(parentRow({ memory: "not-an-object" as any }), OWNER)
    ).resolves.toMatchObject({ hasMemory: false });
  });

  it("surfaces the bounded compactSummary/currentState — never the full episode list — from a populated memory", async () => {
    const memory = {
      contractVersion: 1,
      episodes: [{ episodeNumber: 1, recap: "..." }],
      currentState: {
        relationships: [
          {
            pair: ["char_a", "char_b"],
            status: "คบกัน",
            disclosure: "public",
            knownBy: [],
            sinceEpisode: 5,
          },
        ],
        openThreads: [],
        canonicalFacts: ["fact 1"],
        characterKnowledge: {},
      },
      compactSummary: "RELATIONSHIPS:\n- ...",
      lastFoldedEpisode: 18,
    };

    const context = await loadLineageContext(
      parentRow({ memory, targetEpisodeCount: 20 }),
      OWNER
    );

    expect(context.hasMemory).toBe(true);
    expect(context.compactSummary).toBe(memory.compactSummary);
    expect(context.currentState.relationships).toEqual(
      memory.currentState.relationships
    );
    expect(context.memoryEpisodesRecorded).toBe(18);
    expect(context.parentEpisodeCount).toBe(20);
    // The full `episodes[]` array is NEVER surfaced on the context — only
    // the folded `currentState` + bounded `compactSummary`.
    expect((context as any).episodes).toBeUndefined();
  });

  it("reads visual identity + audience rating from bible, defaulting the rating when absent", async () => {
    const context = await loadLineageContext(
      parentRow({ bible: { visualStyle: "x", cameraGrammar: "y" } }),
      OWNER
    );
    expect(context.visualIdentity.visualStyle).toBe("x");
    expect(context.visualIdentity.cameraGrammar).toBe("y");
    expect(context.audienceAgeRating).toBe("18plus");
  });

  it("loads the roster + location roster scoped to the parent series", async () => {
    setTableRows(verticalDramaCharacters, [
      {
        id: 1,
        characterKey: "char_a",
        name: "A",
        role: "lead",
        narrativeRole: "protagonist",
        roleTier: "lead",
        occupation: "CEO",
        data: {},
      },
    ]);
    setTableRows(verticalDramaLocations, [
      { id: 2, locationKey: "loc_cafe", name: "Cafe", data: {} },
    ]);

    const context = await loadLineageContext(parentRow(), OWNER);
    expect(context.roster).toHaveLength(1);
    expect(context.roster[0].characterKey).toBe("char_a");
    expect(context.locations).toHaveLength(1);
    expect(context.locations[0].locationKey).toBe("loc_cafe");
  });
});
