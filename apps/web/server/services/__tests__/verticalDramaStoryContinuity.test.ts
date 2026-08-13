import { describe, expect, it } from "vitest";
import {
  auditVerticalDramaStoryControl,
  normalizeVerticalDramaContinuityTimeline,
  selectPriorVerticalDramaMemories,
  validateVerticalDramaContinuity,
  type VerticalDramaContinuityIssue,
} from "@shared/verticalDramaSeries/storyContinuity";
import type { VerticalDramaStoryControlSeed } from "@shared/verticalDramaSeries/storyControl";
import type { VdEpisodeMemory } from "@shared/verticalDramaSeries/seriesMemoryState";

function memory(
  episodeNumber: number,
  threadsOpened: VdEpisodeMemory["threadsOpened"] = [],
  threadsResolved: string[] = []
): VdEpisodeMemory {
  return {
    episodeNumber,
    recap: `Episode ${episodeNumber}`,
    canonicalFacts: [],
    threadsOpened,
    threadsResolved,
    relationshipChanges: [],
    knowledgeChanges: [],
  };
}

describe("validateVerticalDramaContinuity", () => {
  it("quarantines orphan resolutions without changing valid lifecycle records", () => {
    const result = normalizeVerticalDramaContinuityTimeline([
      memory(11, [], ["orphan"]),
      memory(12, [
        {
          threadId: "real-thread",
          description: "A real payoff",
          threadClass: "plot",
          openedEpisode: 12,
        },
      ], ["real-thread"]),
    ]);

    expect(result.episodes[0]?.threadsResolved).toEqual([]);
    expect(result.episodes[1]?.threadsResolved).toEqual(["real-thread"]);
    expect(result.quarantinedResolutions).toEqual([
      expect.objectContaining({
        episodeNumber: 11,
        threadId: "orphan",
        reason: "unregistered_resolution",
      }),
    ]);
    expect(
      validateVerticalDramaContinuity({ episodes: result.episodes }).ok,
    ).toBe(true);
  });

  it("allows an opening and its resolution in the same episode", () => {
    const result = normalizeVerticalDramaContinuityTimeline([
      memory(4, [
        {
          threadId: "same-episode",
          description: "A short-lived problem",
          threadClass: "plot",
          openedEpisode: 4,
        },
      ], ["same-episode"]),
    ]);

    expect(result.quarantinedResolutions).toEqual([]);
    expect(result.episodes[0]?.threadsResolved).toEqual(["same-episode"]);
  });

  it("quarantines a repeated opening as an idempotent continuation marker", () => {
    const result = normalizeVerticalDramaContinuityTimeline([
      memory(5, [
        {
          threadId: "t4",
          description: "The original plot thread",
          threadClass: "plot",
          openedEpisode: 5,
        },
      ]),
      memory(6, [
        {
          threadId: "t4",
          description: "The same thread advanced in the next episode",
          threadClass: "plot",
          openedEpisode: 6,
        },
      ]),
    ]);

    expect(result.episodes[0]?.threadsOpened).toHaveLength(1);
    expect(result.episodes[1]?.threadsOpened).toEqual([]);
    expect(result.quarantinedOpenings).toEqual([
      expect.objectContaining({
        episodeNumber: 6,
        threadId: "t4",
        reason: "duplicate_opening",
      }),
    ]);
    expect(validateVerticalDramaContinuity({ episodes: result.episodes }).ok).toBe(
      true,
    );
  });

  it("does not include future episode memories in the current episode timeline", () => {
    const timeline = selectPriorVerticalDramaMemories(
      [memory(4), memory(5), memory(6)],
      5,
    );

    expect(timeline.map(episode => episode.episodeNumber)).toEqual([4]);
  });

  it("keeps an open thread valid while a season is still in progress", () => {
    const result = validateVerticalDramaContinuity({
      episodes: [
        memory(20, [
          {
            threadId: "mystery-witness-captured",
            description: "Identify the captured clip sender",
            threadClass: "plot",
            openedEpisode: 20,
            expectedResolution: "future_episode",
          },
        ]),
        memory(21),
        memory(25),
      ],
    });

    expect(result.ok).toBe(true);
    expect(result.openThreads.map(thread => thread.threadId)).toEqual([
      "mystery-witness-captured",
    ]);
  });

  it("flags the exact dangling-thread shape at the season boundary", () => {
    const result = validateVerticalDramaContinuity({
      episodes: [
        memory(20, [
          {
            threadId: "mystery-witness-captured",
            description: "Identify the captured clip sender",
            threadClass: "plot",
            openedEpisode: 20,
            expectedResolution: "future_episode",
          },
        ]),
        memory(25),
      ],
      seasonEndEpisode: 25,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      expect.objectContaining<Partial<VerticalDramaContinuityIssue>>({
        code: "season_thread_unresolved",
        threadId: "mystery-witness-captured",
        episodeNumber: 25,
      }),
    ]);
  });

  it("accepts a declared resolution and rejects unknown resolutions", () => {
    const resolved = validateVerticalDramaContinuity({
      episodes: [
        memory(20, [
          {
            threadId: "witness",
            description: "Find the witness",
            threadClass: "plot",
            openedEpisode: 20,
            expectedResolution: "future_episode",
          },
        ]),
        memory(22, [], ["witness"]),
      ],
      seasonEndEpisode: 22,
    });
    expect(resolved.ok).toBe(true);

    const unknown = validateVerticalDramaContinuity({
      episodes: [memory(22, [], ["not-registered"])],
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.issues[0]?.code).toBe("unregistered_thread_resolution");
  });

  it("allows an intentional season-level thread", () => {
    const result = validateVerticalDramaContinuity({
      episodes: [
        memory(1, [
          {
            threadId: "romance-slow-burn",
            description: "Will they confess?",
            threadClass: "relationship",
            openedEpisode: 1,
            expectedResolution: "season",
          },
        ]),
      ],
      seasonEndEpisode: 1,
    });
    expect(result.ok).toBe(true);
  });
});

describe("auditVerticalDramaStoryControl", () => {
  const seed: VerticalDramaStoryControlSeed = {
    contractVersion: 1,
    premiseAnchor: "find the sender",
    canonicalCharacterKeys: ["krit"],
    threadCandidates: [
      {
        threadId: "sender",
        label: "คนส่งคลิป",
        scope: "arc_thread",
        ownerCharacters: ["krit"],
        plantEpisode: 20,
        payoffWindow: { startEpisode: 23, endEpisode: 24 },
        expectedEvidence: ["สร้อยกุญแจ"],
        resolutionCost: "เปิดเผยความลับ",
        status: "active",
      },
      {
        threadId: "mystery-open",
        label: "ปมที่ยังไม่ปิด",
        scope: "arc_thread",
        ownerCharacters: ["krit"],
        plantEpisode: 20,
        payoffWindow: { startEpisode: 23, endEpisode: 24 },
        expectedEvidence: ["หลักฐาน"],
        resolutionCost: "เสียความไว้วางใจ",
        status: "active",
      },
    ],
    romancePhaseSkeleton: [],
    advantageIntent: [],
  };

  it("distinguishes resolved, overdue, registered, and legacy/missing-opening states", () => {
    const result = auditVerticalDramaStoryControl({
      seed,
      currentEpisode: 25,
      episodes: [
        memory(20, [
          {
            threadId: "sender",
            description: "คนส่งคลิป",
            threadClass: "plot",
            openedEpisode: 20,
          },
          {
            threadId: "mystery-open",
            description: "ปมที่ยังไม่ปิด",
            threadClass: "plot",
            openedEpisode: 20,
          },
          {
            threadId: "legacy-hook",
            description: "ปมเก่าที่ไม่อยู่ใน seed",
            threadClass: "plot",
            openedEpisode: 21,
          },
        ]),
        memory(25, [], ["sender", "orphan-resolution"]),
      ],
    });

    expect(result.threads.map(thread => [thread.threadId, thread.status])).toEqual([
      ["sender", "resolved"],
      ["mystery-open", "overdue"],
      ["legacy-hook", "legacy_unknown"],
      ["orphan-resolution", "missing_opening"],
    ]);
    expect(result.counts.resolved).toBe(1);
    expect(result.counts.overdue).toBe(1);
    expect(result.counts.legacy_unknown).toBe(1);
    expect(result.counts.missing_opening).toBe(1);
  });

  it("marks a registered resolution without a memory opening for review", () => {
    const result = auditVerticalDramaStoryControl({
      seed,
      currentEpisode: 24,
      episodes: [memory(24, [], ["sender"])],
    });
    expect(result.threads[0]).toMatchObject({
      status: "missing_opening",
      openedEpisode: null,
      resolvedEpisode: 24,
    });
  });

  it("does not trust a seed-resolved thread without memory evidence", () => {
    const result = auditVerticalDramaStoryControl({
      seed: {
        ...seed,
        threadCandidates: [{ ...seed.threadCandidates[0], status: "resolved" }],
      },
      currentEpisode: 22,
      episodes: [memory(22)],
    });
    expect(result.threads[0]).toMatchObject({
      status: "needs_review",
      openedEpisode: null,
      resolvedEpisode: null,
    });
  });
});
