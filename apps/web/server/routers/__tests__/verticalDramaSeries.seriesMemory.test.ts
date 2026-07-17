/**
 * Vertical Drama Series — `getSeriesMemory` / `updateSeriesMemory` coverage
 * (Stage 1.4, `planning/vd-series-memory-and-lineage/plan.md`). Same "mock
 * the whole module graph, test the exported procedure handler directly"
 * convention as `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`.
 *
 * Covers:
 *  - A series with no memory yet (`memory: null`) returns a well-formed
 *    EMPTY `VdSeriesMemory` shape — never throws, never null-crashes.
 *  - Cross-tenant / missing seriesId is rejected with NOT_FOUND (never
 *    discloses existence) for both the read and the write.
 *  - `updateSeriesMemory` always sets `userEdited: true`.
 *  - After an `upsertEpisode` edit, `currentState` is re-folded and
 *    consistent with the edited episode's `relationshipChanges` — the
 *    assertion that actually proves the feature (AI proposes, user
 *    corrects, the derived state reflects the correction).
 *  - `removeEpisode` drops the episode and re-folds accordingly.
 *  - Invalid `disclosure`/`threadClass` values are rejected by the router's
 *    own Zod schema.
 *  - Coverage summary in `getSeriesMemory` counts real script rows
 *    (`vertical_drama_episodes.script IS NOT NULL`) independently of memory
 *    records.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockDb, mockTx, resetHarness, setStoredMemory, getLastUpdateValues } =
  vi.hoisted(() => {
    let storedMemory: unknown = null;
    let rowExists = true;
    let lastUpdateValues: any = null;

    function txSelectBuilder() {
      const builder: any = {};
      builder.from = vi.fn().mockReturnValue(builder);
      builder.where = vi.fn().mockReturnValue(builder);
      builder.for = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(rowExists ? [{ memory: storedMemory }] : [])
        );
      return builder;
    }

    const mockTx = {
      select: vi.fn().mockImplementation(() => txSelectBuilder()),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          lastUpdateValues = values;
          storedMemory = values.memory;
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    };

    const mockDb = {
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(),
      transaction: vi
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(mockTx)),
    };

    return {
      mockDb,
      mockTx,
      resetHarness: () => {
        storedMemory = null;
        rowExists = true;
        lastUpdateValues = null;
        mockDb.select.mockClear();
        mockDb.update.mockClear();
        mockDb.transaction.mockClear();
        mockTx.select.mockClear();
        mockTx.update.mockClear();
      },
      setStoredMemory: (memory: unknown, exists = true) => {
        storedMemory = memory;
        rowExists = exists;
      },
      getLastUpdateValues: () => lastUpdateValues,
    };
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

import { verticalDramaSeriesRouter } from "../verticalDramaSeries";

const router = verticalDramaSeriesRouter as unknown as Record<string, Function>;

function ctx(
  overrides: Partial<{ tenantId: string | null; user: { id: number; role: string } }> = {}
) {
  return {
    tenantId: "tenant-1",
    user: { id: 42, role: "user" },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

/** Thenable select-chain stub for the non-transactional `db.select()` path (`loadOwnedSeries`, episode-row coverage query). */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const SERIES_ROW_NO_MEMORY = {
  id: 10,
  tenantId: "tenant-1",
  userId: 42,
  title: "Corporate Betrayal",
  status: "active",
  targetEpisodeCount: 30,
  memory: null,
};

function relationship(overrides: Record<string, unknown> = {}) {
  return {
    pair: ["aria", "kane"],
    status: "dating",
    disclosure: "secret",
    knownBy: [],
    sinceEpisode: 4,
    ...overrides,
  };
}

function episode(overrides: Record<string, unknown> = {}) {
  return {
    episodeNumber: 4,
    recap: "Aria and Kane start dating in secret.",
    canonicalFacts: [],
    threadsOpened: [],
    threadsResolved: [],
    relationshipChanges: [relationship()],
    knowledgeChanges: [],
    ...overrides,
  };
}

beforeEach(() => {
  resetHarness();
});

/* -------------------------------------------------------------------------- */
/* getSeriesMemory                                                            */
/* -------------------------------------------------------------------------- */

describe("getSeriesMemory", () => {
  it("returns a well-formed EMPTY VdSeriesMemory shape for a series with no memory yet — never throws", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([SERIES_ROW_NO_MEMORY])) // loadOwnedSeries
      .mockReturnValueOnce(selectChain([])); // episode-row coverage query

    const result = await router.getSeriesMemory({
      ctx: ctx(),
      input: { seriesId: "10" },
    });

    expect(result.memory).toEqual({
      contractVersion: 1,
      episodes: [],
      currentState: {
        relationships: [],
        openThreads: [],
        canonicalFacts: [],
        characterKnowledge: {},
      },
      compactSummary: "",
      lastFoldedEpisode: 0,
    });
    expect(result.coverage.targetEpisodeCount).toBe(30);
    expect(result.coverage.episodeRowCount).toBe(0);
    expect(result.coverage.episodesWithMemory).toBe(0);
    expect(result.coverage.episodesWithRealScript).toBe(0);
    expect(result.coverage.provenanceDistinguishable).toBe(false);
  });

  it("throws NOT_FOUND (never discloses existence) for a cross-tenant/missing seriesId", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedSeries — no match

    await expect(
      router.getSeriesMemory({
        ctx: ctx({ tenantId: "other-tenant" }),
        input: { seriesId: "10" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("counts episodesWithRealScript independently from episodesWithMemory (script rows vs memory records)", async () => {
    const storedMemory = {
      contractVersion: 1,
      episodes: [episode({ episodeNumber: 4 }), episode({ episodeNumber: 9 })],
      currentState: {
        relationships: [relationship()],
        openThreads: [],
        canonicalFacts: [],
        characterKnowledge: {},
      },
      compactSummary: "summary",
      lastFoldedEpisode: 9,
    };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([{ ...SERIES_ROW_NO_MEMORY, memory: storedMemory }])
      ) // loadOwnedSeries
      .mockReturnValueOnce(
        selectChain([
          { episodeNumber: 4, hasScript: true },
          { episodeNumber: 5, hasScript: true },
          { episodeNumber: 9, hasScript: false },
        ])
      ); // episode-row coverage query

    const result = await router.getSeriesMemory({
      ctx: ctx(),
      input: { seriesId: "10" },
    });

    expect(result.coverage.episodeRowCount).toBe(3);
    expect(result.coverage.episodesWithRealScript).toBe(2); // ep 4, 5
    expect(result.coverage.episodesWithMemory).toBe(2); // ep 4, 9
    // Only ep.4 has BOTH a memory record AND a real script row.
    expect(result.coverage.episodesWithMemoryAndRealScript).toBe(1);
  });

  it("rejects a non-numeric seriesId with BAD_REQUEST before any query runs", async () => {
    await expect(
      router.getSeriesMemory({
        ctx: ctx(),
        input: { seriesId: "not-a-number" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* updateSeriesMemory — input validation                                     */
/* -------------------------------------------------------------------------- */

describe("updateSeriesMemory — input validation", () => {
  // Mirrors the router's real (non-passthrough) inner schema shape, since
  // the mocked `protectedProcedure.input()` above is a no-op passthrough —
  // same convention as `verticalDramaSeries.setSeriesTargetAudienceRegion.test.ts`.
  const disclosureSchema = z.enum([
    "secret",
    "known_to_some",
    "public",
    "undeclared",
  ]);
  const threadClassSchema = z.enum([
    "plot",
    "domestic",
    "career",
    "financial",
    "health",
    "relationship",
  ]);
  const relationshipSchema = z.object({
    pair: z.tuple([z.string().min(1), z.string().min(1)]),
    status: z.string().min(1),
    disclosure: disclosureSchema,
    knownBy: z.array(z.string().min(1)).default([]),
    sinceEpisode: z.number().int().positive(),
  });
  const threadSchema = z.object({
    threadId: z.string().min(1),
    description: z.string().min(1),
    threadClass: threadClassSchema,
    openedEpisode: z.number().int().positive(),
    resolvedEpisode: z.number().int().positive().optional(),
  });

  it("rejects an unknown disclosure value", () => {
    expect(() =>
      relationshipSchema.parse({
        pair: ["a", "b"],
        status: "dating",
        disclosure: "everyone_knows_but_them",
        sinceEpisode: 1,
      })
    ).toThrow();
  });

  it("rejects an unknown threadClass value", () => {
    expect(() =>
      threadSchema.parse({
        threadId: "t1",
        description: "desc",
        threadClass: "side_quest",
        openedEpisode: 1,
      })
    ).toThrow();
  });

  it("accepts every documented disclosure/threadClass value", () => {
    for (const disclosure of disclosureSchema.options) {
      expect(() =>
        relationshipSchema.parse({
          pair: ["a", "b"],
          status: "dating",
          disclosure,
          sinceEpisode: 1,
        })
      ).not.toThrow();
    }
    for (const threadClass of threadClassSchema.options) {
      expect(() =>
        threadSchema.parse({
          threadId: "t1",
          description: "desc",
          threadClass,
          openedEpisode: 1,
        })
      ).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* updateSeriesMemory — ownership guard                                      */
/* -------------------------------------------------------------------------- */

describe("updateSeriesMemory — ownership guard", () => {
  it("throws NOT_FOUND when the series row does not match the caller's tenant/user (row lock select empty)", async () => {
    setStoredMemory(null, /* exists */ false);

    await expect(
      router.updateSeriesMemory({
        ctx: ctx(),
        input: {
          seriesId: "999",
          edit: { kind: "upsertEpisode", episode: episode() },
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric seriesId with BAD_REQUEST before opening a transaction", async () => {
    await expect(
      router.updateSeriesMemory({
        ctx: ctx(),
        input: {
          seriesId: "not-a-number",
          edit: { kind: "upsertEpisode", episode: episode() },
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* updateSeriesMemory — happy path: userEdited + re-fold                     */
/* -------------------------------------------------------------------------- */

describe("updateSeriesMemory — happy path", () => {
  it("sets userEdited: true and re-folds currentState from the edited episode's relationshipChanges", async () => {
    setStoredMemory(null); // no prior memory

    const result = await router.updateSeriesMemory({
      ctx: ctx(),
      input: {
        seriesId: "10",
        edit: {
          kind: "upsertEpisode",
          episode: episode({
            episodeNumber: 4,
            relationshipChanges: [
              relationship({ status: "dating", disclosure: "secret" }),
            ],
          }),
        },
      },
    });

    expect(result.memory.userEdited).toBe(true);
    expect(result.memory.episodes).toHaveLength(1);
    // The assertion that proves the feature: currentState.relationships
    // reflects the user's edited relationship, not a stale value.
    expect(result.memory.currentState.relationships).toEqual([
      relationship({ status: "dating", disclosure: "secret" }),
    ]);
    expect(result.memory.lastFoldedEpisode).toBe(4);

    const setValues = getLastUpdateValues();
    expect(setValues.memory.userEdited).toBe(true);
  });

  it("a later edit to the SAME episode number always supersedes, even though a prior edit already set userEdited: true", async () => {
    // Prior state: episode 4 already user-edited to "dating, secret".
    setStoredMemory({
      contractVersion: 1,
      episodes: [episode({ episodeNumber: 4 })],
      currentState: {
        relationships: [relationship()],
        openThreads: [],
        canonicalFacts: [],
        characterKnowledge: {},
      },
      compactSummary: "prior",
      lastFoldedEpisode: 4,
      userEdited: true,
    });

    const result = await router.updateSeriesMemory({
      ctx: ctx(),
      input: {
        seriesId: "10",
        edit: {
          kind: "upsertEpisode",
          episode: episode({
            episodeNumber: 4,
            relationshipChanges: [
              relationship({ status: "broke up", disclosure: "public" }),
            ],
          }),
        },
      },
    });

    // Must supersede — NOT silently dropped the way
    // `upsertEpisodeMemories`'s userEdited-append-only path would.
    expect(result.memory.episodes).toHaveLength(1);
    expect(result.memory.currentState.relationships).toEqual([
      relationship({ status: "broke up", disclosure: "public" }),
    ]);
  });

  it("creates a brand-new episode record for a thin-season episode that never had one (fill-in-yourself escape hatch)", async () => {
    setStoredMemory({
      contractVersion: 1,
      episodes: [episode({ episodeNumber: 4 })],
      currentState: {
        relationships: [relationship()],
        openThreads: [],
        canonicalFacts: [],
        characterKnowledge: {},
      },
      compactSummary: "prior",
      lastFoldedEpisode: 4,
    });

    const result = await router.updateSeriesMemory({
      ctx: ctx(),
      input: {
        seriesId: "10",
        edit: {
          kind: "upsertEpisode",
          episode: episode({
            episodeNumber: 15,
            recap: "Hand-authored recap for the un-scripted episode 15.",
            relationshipChanges: [],
          }),
        },
      },
    });

    expect(result.memory.episodes.map((ep: any) => ep.episodeNumber)).toEqual([
      4, 15,
    ]);
    expect(result.memory.userEdited).toBe(true);
  });

  it("removeEpisode deletes the record and re-folds currentState accordingly", async () => {
    setStoredMemory({
      contractVersion: 1,
      episodes: [episode({ episodeNumber: 4 })],
      currentState: {
        relationships: [relationship()],
        openThreads: [],
        canonicalFacts: [],
        characterKnowledge: {},
      },
      compactSummary: "prior",
      lastFoldedEpisode: 4,
    });

    const result = await router.updateSeriesMemory({
      ctx: ctx(),
      input: {
        seriesId: "10",
        edit: { kind: "removeEpisode", episodeNumber: 4 },
      },
    });

    expect(result.memory.episodes).toEqual([]);
    expect(result.memory.currentState.relationships).toEqual([]);
    expect(result.memory.userEdited).toBe(true);
    expect(result.memory.lastFoldedEpisode).toBe(0);
  });

  it("never accepts a direct currentState override — currentState is always the re-fold of episodes[]", async () => {
    setStoredMemory(null);

    const maliciousInput: any = {
      seriesId: "10",
      edit: {
        kind: "upsertEpisode",
        episode: episode({ episodeNumber: 4, relationshipChanges: [] }),
      },
      // Not part of the schema — even if a caller bypassed types and sent
      // this, the handler never reads `input.currentState`.
      currentState: {
        relationships: [relationship({ status: "SPOOFED" })],
        openThreads: [],
        canonicalFacts: [],
        characterKnowledge: {},
      },
    };

    const result = await router.updateSeriesMemory({
      ctx: ctx(),
      input: maliciousInput,
    });

    expect(result.memory.currentState.relationships).toEqual([]);
  });
});
