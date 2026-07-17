/**
 * Vertical Drama Series — `foldSeriesMemory` pure-fold coverage (plan
 * `planning/vd-series-memory-and-lineage/plan.md` Stage 1.1). Mirrors the
 * sibling `../__tests__/audienceAgeRating.test.ts` convention: pure-function
 * assertions only, no DB/LLM/mocking needed.
 */
import { describe, expect, it } from "vitest";
import {
  foldSeriesMemory,
  type VdEpisodeMemory,
  type VdOpenThread,
  type VdRelationshipState,
} from "../seriesMemoryState";

function relationship(
  overrides: Partial<VdRelationshipState> & { pair: [string, string] }
): VdRelationshipState {
  return {
    status: "unknown",
    disclosure: "undeclared",
    knownBy: [],
    sinceEpisode: overrides.sinceEpisode ?? 1,
    ...overrides,
  };
}

function thread(
  overrides: Partial<VdOpenThread> & { threadId: string }
): VdOpenThread {
  return {
    description: "",
    threadClass: "plot",
    openedEpisode: 1,
    ...overrides,
  };
}

function episode(
  overrides: Partial<VdEpisodeMemory> & { episodeNumber: number }
): VdEpisodeMemory {
  return {
    recap: "",
    canonicalFacts: [],
    threadsOpened: [],
    threadsResolved: [],
    relationshipChanges: [],
    knowledgeChanges: [],
    ...overrides,
  };
}

describe("foldSeriesMemory — empty / base cases", () => {
  it("returns empty state (not undefined/throw) for an empty array", () => {
    expect(foldSeriesMemory([])).toEqual({
      relationships: [],
      openThreads: [],
      canonicalFacts: [],
      characterKnowledge: {},
    });
  });

  it("does not throw on a non-array input", () => {
    // Defensive against malformed LLM-adjacent callers; cast to satisfy TS.
    expect(() =>
      foldSeriesMemory(null as unknown as VdEpisodeMemory[])
    ).not.toThrow();
    expect(foldSeriesMemory(null as unknown as VdEpisodeMemory[])).toEqual({
      relationships: [],
      openThreads: [],
      canonicalFacts: [],
      characterKnowledge: {},
    });
  });
});

describe("foldSeriesMemory — relationships: last state wins per pair", () => {
  it("keeps only the latest relationship state for a pair across episodes", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 1,
        relationshipChanges: [
          relationship({
            pair: ["alice", "bob"],
            status: "strangers",
            disclosure: "undeclared",
            sinceEpisode: 1,
          }),
        ],
      }),
      episode({
        episodeNumber: 2,
        relationshipChanges: [
          relationship({
            pair: ["alice", "bob"],
            status: "dating",
            disclosure: "secret",
            sinceEpisode: 2,
          }),
        ],
      }),
    ];

    const result = foldSeriesMemory(episodes);
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0]).toMatchObject({
      status: "dating",
      disclosure: "secret",
      sinceEpisode: 2,
    });
  });

  it("treats [a,b] and [b,a] as the SAME pair (order-insensitive)", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 1,
        relationshipChanges: [
          relationship({ pair: ["alice", "bob"], status: "strangers" }),
        ],
      }),
      episode({
        episodeNumber: 2,
        relationshipChanges: [
          // Same pair, reversed tuple order — must supersede, not add a 2nd entry.
          relationship({ pair: ["bob", "alice"], status: "dating" }),
        ],
      }),
    ];

    const result = foldSeriesMemory(episodes);
    expect(result.relationships).toHaveLength(1);
    expect(result.relationships[0].status).toBe("dating");
  });

  it("tracks multiple independent pairs separately, in stable sorted order", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 1,
        relationshipChanges: [
          relationship({ pair: ["zed", "alice"], status: "rivals" }),
          relationship({ pair: ["bob", "carol"], status: "siblings" }),
        ],
      }),
    ];

    const result = foldSeriesMemory(episodes);
    expect(result.relationships).toHaveLength(2);
    // Stable, deterministic ordering (normalized-pair-key sort) — snapshot-testable.
    expect(result.relationships.map(r => r.pair.slice().sort())).toEqual([
      ["alice", "zed"],
      ["bob", "carol"],
    ]);
  });
});

describe("foldSeriesMemory — threads", () => {
  it("a thread opened then resolved in a LATER episode disappears from openThreads", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 1,
        threadsOpened: [
          thread({
            threadId: "t1",
            description: "renovation",
            threadClass: "domestic",
            openedEpisode: 1,
          }),
        ],
      }),
      episode({ episodeNumber: 2 }),
      episode({ episodeNumber: 3, threadsResolved: ["t1"] }),
    ];

    const result = foldSeriesMemory(episodes);
    expect(result.openThreads).toHaveLength(0);
  });

  it("a thread resolved in the SAME episode it opened is resolved", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 1,
        threadsOpened: [thread({ threadId: "t1", openedEpisode: 1 })],
        threadsResolved: ["t1"],
      }),
    ];

    expect(foldSeriesMemory(episodes).openThreads).toHaveLength(0);
  });

  it("a thread that is never resolved persists in openThreads", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 1,
        threadsOpened: [
          thread({
            threadId: "t1",
            description: "unfinished business",
            threadClass: "domestic",
            openedEpisode: 1,
          }),
        ],
      }),
    ];

    const result = foldSeriesMemory(episodes);
    expect(result.openThreads).toHaveLength(1);
    expect(result.openThreads[0]).toMatchObject({
      threadId: "t1",
      threadClass: "domestic",
    });
  });

  it("resolving an unknown/never-opened threadId does not throw and has no effect", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({ episodeNumber: 1, threadsResolved: ["ghost-thread"] }),
      episode({
        episodeNumber: 2,
        threadsOpened: [thread({ threadId: "t1", openedEpisode: 2 })],
      }),
    ];

    expect(() => foldSeriesMemory(episodes)).not.toThrow();
    const result = foldSeriesMemory(episodes);
    expect(result.openThreads).toHaveLength(1);
    expect(result.openThreads[0].threadId).toBe("t1");
  });
});

describe("foldSeriesMemory — replay ordering", () => {
  it("folds correctly even when the input array is NOT sorted by episodeNumber", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 3,
        relationshipChanges: [
          relationship({
            pair: ["a", "b"],
            status: "final-state",
            sinceEpisode: 3,
          }),
        ],
      }),
      episode({
        episodeNumber: 1,
        relationshipChanges: [
          relationship({
            pair: ["a", "b"],
            status: "first-state",
            sinceEpisode: 1,
          }),
        ],
      }),
      episode({
        episodeNumber: 2,
        relationshipChanges: [
          relationship({
            pair: ["a", "b"],
            status: "middle-state",
            sinceEpisode: 2,
          }),
        ],
      }),
    ];

    const result = foldSeriesMemory(episodes);
    expect(result.relationships[0].status).toBe("final-state");
  });

  it("duplicate episodeNumber: the entry appearing LATER in the input array wins", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 5,
        relationshipChanges: [
          relationship({ pair: ["a", "b"], status: "first-written" }),
        ],
      }),
      episode({
        episodeNumber: 5,
        relationshipChanges: [
          relationship({ pair: ["a", "b"], status: "second-written" }),
        ],
      }),
    ];

    const result = foldSeriesMemory(episodes);
    expect(result.relationships[0].status).toBe("second-written");
  });
});

describe("foldSeriesMemory — canonicalFacts / characterKnowledge accumulation", () => {
  it("accumulates canonicalFacts across episodes, de-duplicated, in first-seen order", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({ episodeNumber: 1, canonicalFacts: ["fact A", "fact B"] }),
      episode({ episodeNumber: 2, canonicalFacts: ["fact B", "fact C"] }),
    ];

    expect(foldSeriesMemory(episodes).canonicalFacts).toEqual([
      "fact A",
      "fact B",
      "fact C",
    ]);
  });

  it("accumulates characterKnowledge per characterKey, de-duplicated", () => {
    const episodes: VdEpisodeMemory[] = [
      episode({
        episodeNumber: 1,
        knowledgeChanges: [{ characterKey: "alice", learned: "bob's secret" }],
      }),
      episode({
        episodeNumber: 2,
        knowledgeChanges: [
          { characterKey: "alice", learned: "bob's secret" }, // duplicate, ignored
          { characterKey: "alice", learned: "carol's plan" },
          { characterKey: "bob", learned: "alice knows" },
        ],
      }),
    ];

    const result = foldSeriesMemory(episodes);
    expect(result.characterKnowledge.alice).toEqual([
      "bob's secret",
      "carol's plan",
    ]);
    expect(result.characterKnowledge.bob).toEqual(["alice knows"]);
  });
});

describe("foldSeriesMemory — malformed input tolerance", () => {
  it("never throws on malformed relationshipChanges/threadsResolved/knowledgeChanges entries", () => {
    const malformed = [
      episode({
        episodeNumber: 1,
        // @ts-expect-error deliberately malformed for defensive-coverage test
        relationshipChanges: [
          { pair: ["only-one"] },
          null,
          { pair: "not-an-array" },
        ],
        // @ts-expect-error deliberately malformed for defensive-coverage test
        threadsResolved: [null, 42],
        // @ts-expect-error deliberately malformed for defensive-coverage test
        knowledgeChanges: [{ characterKey: "alice" }, null],
      }),
    ];

    expect(() => foldSeriesMemory(malformed)).not.toThrow();
    const result = foldSeriesMemory(malformed);
    expect(result.relationships).toEqual([]);
    expect(result.characterKnowledge).toEqual({});
  });
});
