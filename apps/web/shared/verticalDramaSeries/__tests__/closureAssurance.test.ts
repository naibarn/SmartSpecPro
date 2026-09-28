import { describe, expect, it } from "vitest";
import { assessThreadClosures } from "../closureAssurance";
import type { VdEpisodeMemory } from "../seriesMemoryState";

const memory = (overrides: Partial<VdEpisodeMemory>): VdEpisodeMemory => ({
  episodeNumber: 1,
  recap: "recap",
  canonicalFacts: [],
  threadsOpened: [],
  threadsResolved: [],
  relationshipChanges: [],
  knowledgeChanges: [],
  ...overrides,
});

describe("assessThreadClosures", () => {
  it("does not report intentional, surprise, or future threads as defects", () => {
    const result = assessThreadClosures({
      horizonEpisode: 5,
      seasonComplete: true,
      episodes: [
        memory({
          threadsOpened: [
            { threadId: "open", description: "open", threadClass: "plot", openedEpisode: 1, closureIntent: "intentional_open" },
            { threadId: "surprise", description: "surprise", threadClass: "plot", openedEpisode: 2, closureIntent: "surprise_payoff" },
            { threadId: "future", description: "future", threadClass: "plot", openedEpisode: 3, expectedResolutionEpisode: 8 },
          ],
        }),
      ],
    });
    expect(result.map(item => item.disposition)).toEqual([
      "intentional_open",
      "surprise_payoff",
      "expected_continuation",
    ]);
    expect(result.every(item => item.severity !== "blocking")).toBe(true);
  });

  it("flags an unclassified required thread at the completed horizon", () => {
    const [result] = assessThreadClosures({
      horizonEpisode: 5,
      seasonComplete: true,
      episodes: [memory({ threadsOpened: [{ threadId: "t1", description: "missing", threadClass: "plot", openedEpisode: 1 }] })],
    });
    expect(result.disposition).toBe("needs_repair");
    expect(result.recommendedAction).toBe("repair");
    expect(result.severity).toBe("blocking");
  });

  it("uses exact resolution IDs as payoff evidence", () => {
    const result = assessThreadClosures({
      horizonEpisode: 3,
      episodes: [
        memory({ threadsOpened: [{ threadId: "t1", description: "resolved", threadClass: "plot", openedEpisode: 1 }] }),
        memory({ episodeNumber: 3, threadsResolved: ["t1"] }),
      ],
    });
    expect(result[0]).toMatchObject({ disposition: "explicit_payoff", evidenceEpisodeNumbers: [3] });
  });
});
