/**
 * Coverage for `verticalDramaSeriesMemoryProjection.ts`
 * (`planning/vd-series-memory-and-lineage/plan.md` Stage 1.2) — the write
 * path that merges LLM-authored `episode_memory` blocks into
 * `vertical_drama_series.memory`.
 *
 * `db.transaction` is mocked with a single row-locked `tx` (mirrors
 * `groupsService.test.ts`'s mocking shape) so every assertion here exercises
 * the REAL merge/fold/compact-summary logic, not a fake.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VdEpisodeMemory } from "@shared/verticalDramaSeries/seriesMemoryState";

const { mockDb, mockTx, resetHarness, setStoredMemory, getLastUpdateValues } =
  vi.hoisted(() => {
    let storedMemory: unknown = null;
    let rowExists = true;
    let lastUpdateValues: any = null;

    function selectBuilder() {
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
      select: vi.fn().mockImplementation(() => selectBuilder()),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((values: any) => {
          lastUpdateValues = values;
          storedMemory = values.memory;
          return { where: vi.fn().mockResolvedValue(undefined) };
        }),
      })),
    };

    const mockDb = {
      transaction: vi
        .fn()
        .mockImplementation(async (cb: (tx: any) => Promise<any>) =>
          cb(mockTx)
        ),
    };

    return {
      mockDb,
      mockTx,
      resetHarness: () => {
        storedMemory = null;
        rowExists = true;
        lastUpdateValues = null;
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

import {
  resolveEpisodeMemoryBlock,
  buildCompactSummary,
  upsertEpisodeMemory,
  upsertEpisodeMemories,
  persistDeepDraftEpisodeMemories,
  repairSeriesMemoryContinuity,
} from "../verticalDramaSeriesMemoryProjection";
import { foldSeriesMemory } from "@shared/verticalDramaSeries/seriesMemoryState";
import { VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT } from "@shared/verticalDramaSeries/memory";

beforeEach(() => {
  resetHarness();
});

function episodeMemory(
  overrides: Partial<VdEpisodeMemory> & { episodeNumber: number }
): VdEpisodeMemory {
  return {
    recap: `Recap for episode ${overrides.episodeNumber}`,
    canonicalFacts: [],
    threadsOpened: [],
    threadsResolved: [],
    relationshipChanges: [],
    knowledgeChanges: [],
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* resolveEpisodeMemoryBlock — tolerant parse + deterministic fallback        */
/* -------------------------------------------------------------------------- */

describe("resolveEpisodeMemoryBlock", () => {
  it("never throws and falls back to a recap-only block when raw is undefined (block absent)", () => {
    const result = resolveEpisodeMemoryBlock(undefined, {
      episodeNumber: 5,
      logline: "A logline",
      keyBeats: ["Beat one", "Beat two"],
      cliffhangerLine: "A cliffhanger",
    });
    expect(result.episodeNumber).toBe(5);
    expect(result.recap).toBe("A logline Beat one Beat two A cliffhanger");
    expect(result.relationshipChanges).toEqual([]);
    expect(result.threadsOpened).toEqual([]);
  });

  it("falls back to a generic recap when even logline/keyBeats/cliffhanger are all absent", () => {
    const result = resolveEpisodeMemoryBlock(undefined, { episodeNumber: 3 });
    expect(result.recap).toBe("Episode 3.");
  });

  it("falls back (never throws) when raw fails the strict schema (missing required disclosure)", () => {
    const result = resolveEpisodeMemoryBlock(
      {
        recap: "ignored — schema fails",
        relationship_changes: [{ pair: ["a", "b"], status: "dating" }],
      },
      { episodeNumber: 2, logline: "Fallback logline" }
    );
    expect(result.relationshipChanges).toEqual([]);
    expect(result.recap).toBe("Fallback logline");
  });

  it("resolves a valid block into camelCase VdEpisodeMemory, assigning openedEpisode/sinceEpisode from context (never from the LLM)", () => {
    const result = resolveEpisodeMemoryBlock(
      {
        recap: "Aria and Kane start dating in secret.",
        canonical_facts: ["Aria owns the flower shop"],
        threads_opened: [
          {
            thread_id: "reno",
            description: "House renovation unfinished",
            thread_class: "domestic",
          },
        ],
        threads_resolved: ["old-thread"],
        relationship_changes: [
          {
            pair: ["aria", "kane"],
            status: "dating",
            disclosure: "secret",
            known_by: ["aria"],
          },
        ],
        knowledge_changes: [{ character_key: "kane", learned: "a secret" }],
      },
      { episodeNumber: 7 }
    );
    expect(result).toEqual({
      episodeNumber: 7,
      recap: "Aria and Kane start dating in secret.",
      canonicalFacts: ["Aria owns the flower shop"],
      threadsOpened: [
        {
          threadId: "reno",
          description: "House renovation unfinished",
          threadClass: "domestic",
          openedEpisode: 7,
        },
      ],
      threadsResolved: ["old-thread"],
      relationshipChanges: [
        {
          pair: ["aria", "kane"],
          status: "dating",
          disclosure: "secret",
          knownBy: ["aria"],
          sinceEpisode: 7,
        },
      ],
      knowledgeChanges: [{ characterKey: "kane", learned: "a secret" }],
    });
  });

  it("derives legacy relationship state from strict graph deltas", () => {
    const result = resolveEpisodeMemoryBlock(
      {
        recap: "A public engagement is revealed.",
        relationship_graph_deltas: [
          {
            operation: "reveal",
            edgeId: "edge-7",
            fromCharacterKey: "aria",
            toCharacterKey: "kane",
            relationType: "fiance",
            validFromEpisode: 7,
            disclosure: "public",
            beliefState: "known",
            knownByCharacterKeys: ["aria", "kane"],
            evidenceRefs: ["ep7:shot2"],
            affectedCharacterKeys: ["aria", "kane"],
          },
        ],
        relationship_changes: [
          {
            pair: ["aria", "kane"],
            status: "friend",
            disclosure: "public",
            known_by: [],
          },
        ],
      },
      { episodeNumber: 7 }
    );
    expect(result.relationshipGraphDeltas?.[0]?.edgeId).toBe("edge-7");
    expect(result.relationshipChanges).toEqual([
      {
        pair: ["aria", "kane"],
        status: "fiance",
        disclosure: "public",
        knownBy: ["aria", "kane"],
        sinceEpisode: 7,
      },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* buildCompactSummary — token-bounded for a long series                     */
/* -------------------------------------------------------------------------- */

describe("buildCompactSummary", () => {
  it("stays within the retrieval policy's token budget (~4 chars/token) for a 100-episode series", () => {
    const episodes: VdEpisodeMemory[] = Array.from({ length: 100 }, (_, i) =>
      episodeMemory({
        episodeNumber: i + 1,
        recap:
          "A fairly long recap sentence describing what happened in this episode, with enough detail to matter. ".repeat(
            3
          ),
        canonicalFacts: [`Fact established in episode ${i + 1}`],
      })
    );
    const currentState = foldSeriesMemory(episodes);

    const summary = buildCompactSummary(currentState, episodes);

    const maxChars =
      VERTICAL_DRAMA_MEMORY_RETRIEVAL_POLICY_DEFAULT.maxPromptTokens * 4;
    // Small header/section-label overhead is allowed beyond the pure recap
    // budget, but the WHOLE summary must stay in the same order of magnitude
    // as the token budget, never scale with episode count.
    expect(summary.length).toBeLessThanOrEqual(maxChars + 500);
  });

  it("includes the most RECENT episodes' recaps when older ones must be dropped to fit the budget", () => {
    const episodes: VdEpisodeMemory[] = Array.from({ length: 50 }, (_, i) =>
      episodeMemory({
        episodeNumber: i + 1,
        recap: `Recap text for episode ${i + 1}. `.repeat(50),
      })
    );
    const currentState = foldSeriesMemory(episodes);

    const summary = buildCompactSummary(currentState, episodes);

    expect(summary).toContain("Ep.50:");
    expect(summary).not.toContain("Ep.1:");
  });

  it("renders relationships/open threads/canonical facts sections even when empty", () => {
    const summary = buildCompactSummary(foldSeriesMemory([]), []);
    expect(summary).toContain("RELATIONSHIPS:");
    expect(summary).toContain("OPEN THREADS:");
    expect(summary).toContain("CANONICAL FACTS:");
  });
});

/* -------------------------------------------------------------------------- */
/* upsertEpisodeMemories — supersede-by-episodeNumber + concurrency + userEdited */
/* -------------------------------------------------------------------------- */

describe("upsertEpisodeMemories", () => {
  it("sanitizes orphan resolutions before persisting series memory", async () => {
    setStoredMemory(null);

    await upsertEpisodeMemories(10, "tenant-1", 1, [
      episodeMemory({
        episodeNumber: 11,
        threadsResolved: ["never-opened"],
      }),
      episodeMemory({
        episodeNumber: 12,
        threadsOpened: [
          {
            threadId: "opened-and-resolved",
            description: "A valid thread",
            threadClass: "plot",
            openedEpisode: 12,
          },
        ],
        threadsResolved: ["opened-and-resolved"],
      }),
    ]);

    const written = getLastUpdateValues().memory;
    expect(written.episodes[0].threadsResolved).toEqual([]);
    expect(written.episodes[1].threadsResolved).toEqual([
      "opened-and-resolved",
    ]);
  });

  it("sanitizes repeated thread openings before persisting series memory", async () => {
    setStoredMemory(null);

    await upsertEpisodeMemories(10, "tenant-1", 1, [
      episodeMemory({
        episodeNumber: 5,
        threadsOpened: [
          {
            threadId: "t4",
            description: "Original thread",
            threadClass: "plot",
            openedEpisode: 5,
          },
        ],
      }),
      episodeMemory({
        episodeNumber: 6,
        threadsOpened: [
          {
            threadId: "t4",
            description: "Repeated continuation marker",
            threadClass: "plot",
            openedEpisode: 6,
          },
        ],
      }),
    ]);

    const written = getLastUpdateValues().memory;
    expect(written.episodes[0].threadsOpened).toHaveLength(1);
    expect(written.episodes[1].threadsOpened).toEqual([]);
  });

  it("merges into an empty series (no prior memory row content)", async () => {
    setStoredMemory(null);

    const summary = await upsertEpisodeMemories(10, "tenant-1", 1, [
      episodeMemory({ episodeNumber: 1, recap: "Episode 1 happened" }),
    ]);

    expect(summary).toEqual({
      mergedEpisodeCount: 1,
      newEpisodeCount: 1,
      skippedUserEdited: false,
    });
    const written = getLastUpdateValues().memory;
    expect(written.episodes).toHaveLength(1);
    expect(written.currentState).toBeDefined();
    expect(written.compactSummary).toContain("Episode 1 happened");
    expect(written.lastFoldedEpisode).toBe(1);
  });

  it("supersedes an existing episodeNumber's record — a re-drafted episode's memory wins", async () => {
    setStoredMemory({
      contractVersion: 1,
      episodes: [episodeMemory({ episodeNumber: 1, recap: "OLD recap" })],
      currentState: foldSeriesMemory([
        episodeMemory({ episodeNumber: 1, recap: "OLD recap" }),
      ]),
      compactSummary: "old summary",
      lastFoldedEpisode: 1,
    });

    await upsertEpisodeMemories(10, "tenant-1", 1, [
      episodeMemory({ episodeNumber: 1, recap: "NEW recap" }),
      episodeMemory({ episodeNumber: 2, recap: "Episode 2 recap" }),
    ]);

    const written = getLastUpdateValues().memory;
    expect(written.episodes).toHaveLength(2);
    const ep1 = written.episodes.find(
      (e: VdEpisodeMemory) => e.episodeNumber === 1
    );
    expect(ep1.recap).toBe("NEW recap");
    expect(written.lastFoldedEpisode).toBe(2);
  });

  it("never overwrites userEdited memory's currentState/compactSummary — only appends genuinely-new episodes", async () => {
    setStoredMemory({
      contractVersion: 1,
      episodes: [episodeMemory({ episodeNumber: 1, recap: "Ep1 recap" })],
      currentState: foldSeriesMemory([
        episodeMemory({ episodeNumber: 1, recap: "Ep1 recap" }),
      ]),
      compactSummary: "HAND-EDITED SUMMARY — must survive untouched",
      lastFoldedEpisode: 1,
      userEdited: true,
    });

    const summary = await upsertEpisodeMemories(10, "tenant-1", 1, [
      // Attempt to supersede episode 1 (must be REJECTED — userEdited).
      episodeMemory({ episodeNumber: 1, recap: "Producer tries to overwrite" }),
      // Genuinely new episode 2 (must be MERGED — appended, not folded into
      // currentState/compactSummary).
      episodeMemory({ episodeNumber: 2, recap: "Episode 2 recap" }),
    ]);

    expect(summary.skippedUserEdited).toBe(true);
    expect(summary.newEpisodeCount).toBe(1);
    const written = getLastUpdateValues().memory;
    expect(written.userEdited).toBe(true);
    // The user's hand-authored summary/currentState are untouched.
    expect(written.compactSummary).toBe(
      "HAND-EDITED SUMMARY — must survive untouched"
    );
    // Episode 1 was NOT superseded.
    const ep1 = written.episodes.find(
      (e: VdEpisodeMemory) => e.episodeNumber === 1
    );
    expect(ep1.recap).toBe("Ep1 recap");
    // Episode 2 WAS appended.
    expect(
      written.episodes.some((e: VdEpisodeMemory) => e.episodeNumber === 2)
    ).toBe(true);
  });

  it("userEdited + nothing genuinely new -> true no-op (no DB write at all)", async () => {
    setStoredMemory({
      contractVersion: 1,
      episodes: [episodeMemory({ episodeNumber: 1, recap: "Ep1 recap" })],
      currentState: foldSeriesMemory([
        episodeMemory({ episodeNumber: 1, recap: "Ep1 recap" }),
      ]),
      compactSummary: "HAND-EDITED",
      lastFoldedEpisode: 1,
      userEdited: true,
    });

    const summary = await upsertEpisodeMemories(10, "tenant-1", 1, [
      episodeMemory({ episodeNumber: 1, recap: "attempted overwrite" }),
    ]);

    expect(summary).toEqual({
      mergedEpisodeCount: 0,
      newEpisodeCount: 0,
      skippedUserEdited: true,
    });
    expect(mockTx.update).not.toHaveBeenCalled();
  });

  it("throws when the series row is not found (real DB error propagates — caller's best-effort try/catch is the CALL SITE's job)", async () => {
    setStoredMemory(null, false);

    await expect(
      upsertEpisodeMemories(999, "tenant-1", 1, [
        episodeMemory({ episodeNumber: 1 }),
      ])
    ).rejects.toThrow(/not found/);
  });

  it("is a no-op (does not open a transaction) when given an empty/invalid list", async () => {
    const summary = await upsertEpisodeMemories(10, "tenant-1", 1, []);
    expect(summary).toEqual({
      mergedEpisodeCount: 0,
      newEpisodeCount: 0,
      skippedUserEdited: false,
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("upsertEpisodeMemory (singular) delegates to the batch function for one episode", async () => {
    setStoredMemory(null);
    await upsertEpisodeMemory(
      10,
      "tenant-1",
      1,
      episodeMemory({ episodeNumber: 4, recap: "Ep4" })
    );
    const written = getLastUpdateValues().memory;
    expect(written.episodes).toHaveLength(1);
    expect(written.episodes[0].episodeNumber).toBe(4);
  });
});

/* -------------------------------------------------------------------------- */
/* persistDeepDraftEpisodeMemories — router-facing shim                      */
/* -------------------------------------------------------------------------- */

describe("persistDeepDraftEpisodeMemories", () => {
  it("filters out drafted items with no resolved episodeMemory and merges the rest", async () => {
    setStoredMemory(null);

    const summary = await persistDeepDraftEpisodeMemories(
      { tenantId: "tenant-1", userId: 1, seriesId: 10 },
      [
        {
          episodeNumber: 1,
          episodeMemory: episodeMemory({ episodeNumber: 1 }),
        },
        { episodeNumber: 2 }, // no episodeMemory — must be skipped, never throws.
      ]
    );

    expect(summary.mergedEpisodeCount).toBe(1);
    const written = getLastUpdateValues().memory;
    expect(written.episodes).toHaveLength(1);
    expect(written.episodes[0].episodeNumber).toBe(1);
  });

  it("is a no-op when no drafted item carries episodeMemory (does not open a transaction)", async () => {
    const summary = await persistDeepDraftEpisodeMemories(
      { tenantId: "tenant-1", userId: 1, seriesId: 10 },
      [{ episodeNumber: 1 }, { episodeNumber: 2 }]
    );
    expect(summary).toEqual({
      mergedEpisodeCount: 0,
      newEpisodeCount: 0,
      skippedUserEdited: false,
    });
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });
});

describe("repairSeriesMemoryContinuity", () => {
  it("repairs legacy orphan resolutions without requiring a new draft", async () => {
    setStoredMemory({
      contractVersion: 1,
      episodes: [
        episodeMemory({
          episodeNumber: 11,
          threadsResolved: ["legacy-orphan"],
        }),
      ],
      currentState: foldSeriesMemory([]),
      compactSummary: "legacy",
      lastFoldedEpisode: 11,
    });

    const result = await repairSeriesMemoryContinuity(10, "tenant-1", 1);

    expect(result.quarantinedResolutionCount).toBe(1);
    expect(getLastUpdateValues().memory.episodes[0].threadsResolved).toEqual(
      []
    );
  });

  it("repairs legacy repeated openings without changing the original opening", async () => {
    setStoredMemory({
      contractVersion: 1,
      episodes: [
        episodeMemory({
          episodeNumber: 5,
          threadsOpened: [
            {
              threadId: "t4",
              description: "Original thread",
              threadClass: "plot",
              openedEpisode: 5,
            },
          ],
        }),
        episodeMemory({
          episodeNumber: 6,
          threadsOpened: [
            {
              threadId: "t4",
              description: "Repeated continuation marker",
              threadClass: "plot",
              openedEpisode: 6,
            },
          ],
        }),
      ],
      currentState: foldSeriesMemory([]),
      compactSummary: "legacy",
      lastFoldedEpisode: 6,
    });

    const result = await repairSeriesMemoryContinuity(10, "tenant-1", 1);

    expect(result.quarantinedOpeningCount).toBe(1);
    expect(getLastUpdateValues().memory.episodes[0].threadsOpened).toHaveLength(
      1
    );
    expect(getLastUpdateValues().memory.episodes[1].threadsOpened).toEqual([]);
  });
});
