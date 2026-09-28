import { describe, expect, it } from "vitest";
import { VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT } from "../assembly";
import {
  deriveDefaultContentBudget,
  derivePerShotSpeechBudgets,
  planSeasonTieInPlacements,
  proposeTieInDeferReplan,
  VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES,
  verticalDramaArcReplanProposalSchema,
  verticalDramaBreakdownVersionSchema,
  verticalDramaEpisodeBreakdownItemSchema,
  verticalDramaEpisodeContentBudgetSchema,
  verticalDramaEpisodeTieInPlacementSchema,
  verticalDramaPerShotSpeechBudgetSchema,
  type VerticalDramaEpisodeBreakdownItem,
} from "../contentBudget";
import {
  MIN_CLIP_COVERAGE_RATIO,
  MIN_EPISODE_COVERAGE_RATIO,
  targetVerticalDramaSpeechSeconds,
} from "../dialogueQuality";

// A fresh, mutable copy — the profile constant is `as const` (readonly tuple).
const DEFAULT_CLIP_DURATIONS = [
  ...VERTICAL_DRAMA_DURATION_PROFILE_DEFAULT.clipDurationsSeconds,
];

describe("derivePerShotSpeechBudgets", () => {
  it("derives one budget per clip duration in the default 8-clip profile, numbered 1-based", () => {
    const budgets = derivePerShotSpeechBudgets(DEFAULT_CLIP_DURATIONS);

    expect(budgets).toHaveLength(8);
    expect(budgets.map(b => b.shotNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(budgets.map(b => b.clipDurationSeconds)).toEqual(
      DEFAULT_CLIP_DURATIONS
    );
  });

  it("delegates target/min seconds to the canonical dialogueQuality helpers — never re-derives them", () => {
    const budgets = derivePerShotSpeechBudgets(DEFAULT_CLIP_DURATIONS);

    for (const budget of budgets) {
      expect(budget.targetSpeechSeconds).toBe(
        targetVerticalDramaSpeechSeconds(budget.clipDurationSeconds)
      );
      expect(budget.minSpeechSeconds).toBe(
        MIN_CLIP_COVERAGE_RATIO * budget.clipDurationSeconds
      );
    }
  });

  it("matches the spec-quoted 8s and trailing-4s bands (~2.7s/1.8s min, ~1.4s) — rescaled 2026-07-15 (x0.5) alongside THAI_CHARS_PER_SECOND 8.5->17", () => {
    const budgets = derivePerShotSpeechBudgets(DEFAULT_CLIP_DURATIONS);
    const eightSecondShot = budgets[0];
    const fourSecondShot = budgets[7];

    expect(eightSecondShot.clipDurationSeconds).toBe(8);
    expect(eightSecondShot.targetSpeechSeconds).toBeCloseTo(2.72, 2);
    expect(eightSecondShot.minSpeechSeconds).toBeCloseTo(1.8, 2);

    expect(fourSecondShot.clipDurationSeconds).toBe(4);
    expect(fourSecondShot.targetSpeechSeconds).toBeCloseTo(1.36, 2);
  });

  it("defaults sourceBeatIndexes to [] and omits silenceIntent when no options are given", () => {
    const [budget] = derivePerShotSpeechBudgets([8]);

    expect(budget.sourceBeatIndexes).toEqual([]);
    expect(budget).not.toHaveProperty("silenceIntent");
  });

  it("threads sourceBeatIndexesByShot and silenceIntentByShot per 1-based shot number", () => {
    const budgets = derivePerShotSpeechBudgets([8, 8, 4], {
      sourceBeatIndexesByShot: { 1: [0, 1], 3: [4] },
      silenceIntentByShot: { 2: "action_visual" },
    });

    expect(budgets[0].sourceBeatIndexes).toEqual([0, 1]);
    expect(budgets[0].silenceIntent).toBeUndefined();
    expect(budgets[1].sourceBeatIndexes).toEqual([]);
    expect(budgets[1].silenceIntent).toBe("action_visual");
    expect(budgets[2].sourceBeatIndexes).toEqual([4]);
  });

  it("is deterministic — identical input yields identical output", () => {
    const build = () =>
      derivePerShotSpeechBudgets([8, 8, 4], {
        sourceBeatIndexesByShot: { 1: [0, 1] },
        silenceIntentByShot: { 2: "montage" },
      });

    expect(build()).toEqual(build());
  });
});

describe("deriveDefaultContentBudget", () => {
  it("derives a beatCount within the spec's 5-7 default band", () => {
    const budget = deriveDefaultContentBudget(60, "th");

    expect(budget.beatCount).toBeGreaterThanOrEqual(5);
    expect(budget.beatCount).toBeLessThanOrEqual(7);
  });

  it("derives estimatedSpeechSeconds as MIN_EPISODE_COVERAGE_RATIO * duration, rounded up", () => {
    const budget = deriveDefaultContentBudget(60, "th");

    expect(budget.estimatedSpeechSeconds).toBe(
      Math.ceil(MIN_EPISODE_COVERAGE_RATIO * 60)
    );
  });

  it("defaults reversalTarget to 2 and arcThreads to an empty (unknown) list", () => {
    const budget = deriveDefaultContentBudget(60, "th");

    expect(budget.reversalTarget).toBe(2);
    expect(budget.arcThreads).toEqual([]);
  });

  it("never mutates or depends on any external state — same duration/locale yields identical output", () => {
    expect(deriveDefaultContentBudget(60, "th")).toEqual(
      deriveDefaultContentBudget(60, "th")
    );
    expect(deriveDefaultContentBudget(60)).toEqual(
      deriveDefaultContentBudget(60, "en")
    );
  });

  it("validates against verticalDramaEpisodeContentBudgetSchema", () => {
    const budget = deriveDefaultContentBudget(60, "th");
    expect(() =>
      verticalDramaEpisodeContentBudgetSchema.parse(budget)
    ).not.toThrow();
  });
});

describe("VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES", () => {
  it("pins the exact 6 stable drift-reason codes from spec §7.7.3 (task #31 added VD_ARC_TIE_IN_DEFERRED)", () => {
    expect(VERTICAL_DRAMA_ARC_DRIFT_REASON_CODES).toEqual([
      "VD_ARC_BEATS_CONSUMED_EARLY",
      "VD_ARC_HOOK_RESOLVED_EARLY",
      "VD_ARC_HOOK_UNPLANNED",
      "VD_ARC_CONTENT_BUDGET_EXCEEDED",
      "VD_ARC_ESCALATION_ORDER_BROKEN",
      "VD_ARC_TIE_IN_DEFERRED",
    ]);
  });
});

describe("verticalDramaEpisodeContentBudgetSchema", () => {
  const valid = {
    beatCount: 6,
    estimatedSpeechSeconds: 35,
    conflictLevel: 3,
    reversalTarget: 2,
    arcThreads: ["romance", "revenge"],
  };

  it("parses a valid content budget", () => {
    expect(verticalDramaEpisodeContentBudgetSchema.parse(valid)).toEqual(valid);
  });

  it("rejects an out-of-range conflictLevel", () => {
    expect(() =>
      verticalDramaEpisodeContentBudgetSchema.parse({
        ...valid,
        conflictLevel: 6,
      })
    ).toThrow();
  });

  it("is passthrough-tolerant of unknown future fields", () => {
    const withExtra = { ...valid, futureField: "reserved" };
    expect(
      verticalDramaEpisodeContentBudgetSchema.parse(withExtra)
    ).toMatchObject(valid);
  });
});

describe("verticalDramaEpisodeBreakdownItemSchema", () => {
  const legacyItem = {
    episodeNumber: 1,
    workingTitle: "Pilot",
    logline: "A girl meets her giant mecha companion.",
    keyBeats: ["meet", "bond", "cliffhanger"],
  };

  const newItem: VerticalDramaEpisodeBreakdownItem = {
    ...legacyItem,
    contentBudget: deriveDefaultContentBudget(60, "th"),
  };

  it("parses a legacy item that predates contentBudget without requiring it", () => {
    expect(() =>
      verticalDramaEpisodeBreakdownItemSchema.parse(legacyItem)
    ).not.toThrow();
    const parsed = verticalDramaEpisodeBreakdownItemSchema.parse(legacyItem);
    expect(parsed.contentBudget).toBeUndefined();
  });

  it("parses a new item that carries contentBudget", () => {
    const parsed = verticalDramaEpisodeBreakdownItemSchema.parse(newItem);
    expect(parsed.contentBudget).toEqual(newItem.contentBudget);
  });
});

describe("verticalDramaBreakdownVersionSchema", () => {
  it("parses a valid append-only breakdown version", () => {
    const version = {
      versionId: "v1",
      createdAt: new Date().toISOString(),
      createdByUserId: 42,
      source: "generate_story" as const,
      items: [
        {
          episodeNumber: 1,
          workingTitle: "Pilot",
          logline: "Logline",
          keyBeats: ["a", "b"],
          contentBudget: deriveDefaultContentBudget(60, "th"),
        },
      ],
    };

    expect(() =>
      verticalDramaBreakdownVersionSchema.parse(version)
    ).not.toThrow();
  });

  it("rejects an invalid source value", () => {
    expect(() =>
      verticalDramaBreakdownVersionSchema.parse({
        versionId: "v1",
        createdAt: new Date().toISOString(),
        createdByUserId: 42,
        source: "manual_edit",
        items: [],
      })
    ).toThrow();
  });

  it("parses a version WITHOUT ledgers (flag-off/legacy, byte-identical)", () => {
    const version = {
      versionId: "v1",
      createdAt: new Date().toISOString(),
      createdByUserId: 42,
      source: "generate_story" as const,
      items: [
        {
          episodeNumber: 1,
          workingTitle: "Pilot",
          logline: "Logline",
          keyBeats: ["a", "b"],
        },
      ],
    };
    const parsed = verticalDramaBreakdownVersionSchema.parse(version);
    expect(parsed.ledgers).toBeUndefined();
  });

  it("parses a version WITH ledgers (Feature 132 §5 F132B)", () => {
    const version = {
      versionId: "v1",
      createdAt: new Date().toISOString(),
      createdByUserId: 42,
      source: "generate_story" as const,
      items: [
        {
          episodeNumber: 1,
          workingTitle: "Pilot",
          logline: "Logline",
          keyBeats: ["a", "b"],
        },
      ],
      ledgers: {
        evidenceLedger: [{ id: "e1", label: "note", introducedEpisode: 1 }],
        characterActivationLedger: [],
        threatLadder: [],
        consequenceLedger: [],
        threadLedger: [],
        worldRuleLedger: [],
        causalChainMap: [],
      },
    };
    const parsed = verticalDramaBreakdownVersionSchema.parse(version);
    expect(parsed.ledgers?.evidenceLedger).toHaveLength(1);
  });
});

describe("verticalDramaArcReplanProposalSchema", () => {
  const proposedItem = {
    episodeNumber: 5,
    workingTitle: "Revised episode 5",
    logline: "Logline",
    keyBeats: ["a", "b"],
    contentBudget: deriveDefaultContentBudget(60, "th"),
  };

  const valid = {
    proposalId: "proposal-1",
    seriesId: "series-1",
    triggeredByEpisodeNumber: 4,
    driftReasons: ["VD_ARC_BEATS_CONSUMED_EARLY"],
    affectedEpisodeNumbers: [5, 6],
    proposedBreakdown: [proposedItem],
    rationale: "Episode 4 consumed beats planned for episode 5.",
    status: "proposed" as const,
  };

  it("parses a valid arc re-plan proposal", () => {
    expect(() =>
      verticalDramaArcReplanProposalSchema.parse(valid)
    ).not.toThrow();
  });

  it("rejects an unknown drift-reason code", () => {
    expect(() =>
      verticalDramaArcReplanProposalSchema.parse({
        ...valid,
        driftReasons: ["NOT_A_REAL_CODE"],
      })
    ).toThrow();
  });
});

describe("verticalDramaPerShotSpeechBudgetSchema", () => {
  it("parses a valid per-shot budget without silenceIntent", () => {
    const budget = {
      shotNumber: 1,
      clipDurationSeconds: 8,
      targetSpeechSeconds: 5.44,
      minSpeechSeconds: 3.6,
      sourceBeatIndexes: [0, 1],
    };
    expect(() =>
      verticalDramaPerShotSpeechBudgetSchema.parse(budget)
    ).not.toThrow();
  });

  it("parses a valid per-shot budget with a silenceIntent", () => {
    const budget = {
      shotNumber: 9,
      clipDurationSeconds: 4,
      targetSpeechSeconds: 2.72,
      minSpeechSeconds: 1.8,
      sourceBeatIndexes: [],
      silenceIntent: "establishing" as const,
    };
    expect(() =>
      verticalDramaPerShotSpeechBudgetSchema.parse(budget)
    ).not.toThrow();
  });

  it("rejects an invalid silenceIntent", () => {
    const budget = {
      shotNumber: 1,
      clipDurationSeconds: 8,
      targetSpeechSeconds: 5.44,
      minSpeechSeconds: 3.6,
      sourceBeatIndexes: [],
      silenceIntent: "dramatic_reveal",
    };
    expect(() =>
      verticalDramaPerShotSpeechBudgetSchema.parse(budget)
    ).toThrow();
  });
});

/* -------------------------------------------------------------------------- */
/* Task #31 — season tie-in placement planning                                */
/* -------------------------------------------------------------------------- */

function makeItem(
  episodeNumber: number,
  overrides: Partial<VerticalDramaEpisodeBreakdownItem> = {}
): VerticalDramaEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber} title`,
    logline: `Episode ${episodeNumber} logline`,
    keyBeats: [`beat ${episodeNumber}-1`, `beat ${episodeNumber}-2`],
    contentBudget: deriveDefaultContentBudget(60, "en"),
    ...overrides,
  };
}

function makeSeason(count: number): VerticalDramaEpisodeBreakdownItem[] {
  return Array.from({ length: count }, (_, i) => makeItem(i + 1));
}

/** Every field except `tieIn` must be `toEqual` between two items. */
function expectStoryFieldsUnchanged(
  before: VerticalDramaEpisodeBreakdownItem,
  after: VerticalDramaEpisodeBreakdownItem
) {
  expect(after.workingTitle).toBe(before.workingTitle);
  expect(after.logline).toBe(before.logline);
  expect(after.keyBeats).toEqual(before.keyBeats);
  expect(after.contentBudget).toEqual(before.contentBudget);
}

describe("planSeasonTieInPlacements", () => {
  it("distributes an even spread across the season respecting the resolved budget", () => {
    const items = makeSeason(20);
    const result = planSeasonTieInPlacements(items, { perTenCap: 3 });

    const planned = result.filter(i => i.tieIn?.planned);
    // resolveTieInEpisodeBudget(standard, 20, 3) = ceil(3 * 20 / 10) = 6
    expect(planned).toHaveLength(6);
    // Every planned episode number is distinct and none is episode 1.
    expect(new Set(planned.map(i => i.episodeNumber)).size).toBe(6);
    expect(planned.every(i => i.episodeNumber !== 1)).toBe(true);
  });

  it("marks every non-planned item with an explicit tieIn.planned: false (never leaves the field ambiguous)", () => {
    const items = makeSeason(20);
    const result = planSeasonTieInPlacements(items, { perTenCap: 3 });

    const unplanned = result.filter(i => !i.tieIn?.planned);
    expect(unplanned.length).toBeGreaterThan(0);
    for (const item of unplanned) {
      expect(item.tieIn).toEqual({ planned: false, source: "planned" });
    }
  });

  it("avoids episode 1 by default (pure hook episode)", () => {
    const items = makeSeason(10);
    const result = planSeasonTieInPlacements(items, { perTenCap: 10 });

    const episodeOne = result.find(i => i.episodeNumber === 1);
    expect(episodeOne?.tieIn?.planned).toBe(false);
  });

  it("allows episode 1 when avoidEpisodeOne is explicitly false", () => {
    const items = makeSeason(3);
    const result = planSeasonTieInPlacements(items, {
      perTenCap: 10,
      avoidEpisodeOne: false,
    });

    // A generous cap over only 3 episodes should be able to reach episode 1
    // once it's no longer excluded from the eligible pool.
    const plannedNumbers = result.filter(i => i.tieIn?.planned).map(i => i.episodeNumber);
    expect(plannedNumbers.length).toBeGreaterThan(0);
  });

  it("prorates the budget down for a short season (task #23 resolveTieInEpisodeBudget)", () => {
    const items = makeSeason(8); // "short" tier (6-12)
    const result = planSeasonTieInPlacements(items, { perTenCap: 3 });

    // resolveTieInEpisodeBudget(short, 8, 3) = ceil(3 * 8 / 10) = 3
    expect(result.filter(i => i.tieIn?.planned)).toHaveLength(3);
  });

  it("N=3 ultra-short: prorated budget floors to >= 1 even with perTenCap: 0", () => {
    const items = makeSeason(3);
    const result = planSeasonTieInPlacements(items, { perTenCap: 0 });

    const planned = result.filter(i => i.tieIn?.planned);
    expect(planned).toHaveLength(1);
    expect(planned[0].episodeNumber).not.toBe(1);
  });

  it("never mutates workingTitle/logline/keyBeats/contentBudget — only tieIn changes", () => {
    const items = makeSeason(12);
    const result = planSeasonTieInPlacements(items, { perTenCap: 3 });

    result.forEach((item, i) => expectStoryFieldsUnchanged(items[i], item));
  });

  it("is deterministic — identical input yields identical output", () => {
    const items = makeSeason(15);
    const run = () => planSeasonTieInPlacements(items, { perTenCap: 3 });

    expect(run()).toEqual(run());
  });

  it("every returned item's tieIn field validates against the shared zod schema", () => {
    const items = makeSeason(10);
    const result = planSeasonTieInPlacements(items, { perTenCap: 3 });

    for (const item of result) {
      expect(() => verticalDramaEpisodeTieInPlacementSchema.parse(item.tieIn)).not.toThrow();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Task #31 — tie-in defer re-plan proposal                                   */
/* -------------------------------------------------------------------------- */

describe("proposeTieInDeferReplan", () => {
  it("moves the placement to the nearest eligible future episode", () => {
    const items = makeSeason(10).map(item =>
      item.episodeNumber === 5
        ? { ...item, tieIn: { planned: true, source: "planned" as const } }
        : item
    );

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 5,
      producedEpisodeNumbers: [1, 2, 3, 4, 5],
      perTenCap: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targetEpisodeNumber).toBe(6);
    expect(result.rationaleTh).toContain("5");
    expect(result.rationaleTh).toContain("6");
  });

  it("skips already-produced episodes when choosing a target", () => {
    const items = makeSeason(10).map(item =>
      item.episodeNumber === 5
        ? { ...item, tieIn: { planned: true, source: "planned" as const } }
        : item
    );

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 5,
      producedEpisodeNumbers: [1, 2, 3, 4, 5, 6, 7],
      perTenCap: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targetEpisodeNumber).toBe(8);
  });

  it("skips episodes already planned for a tie-in", () => {
    const items = makeSeason(10).map(item => {
      if (item.episodeNumber === 5) return { ...item, tieIn: { planned: true, source: "planned" as const } };
      if (item.episodeNumber === 6) return { ...item, tieIn: { planned: true, source: "planned" as const } };
      return item;
    });

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 5,
      producedEpisodeNumbers: [1, 2, 3, 4, 5],
      perTenCap: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.targetEpisodeNumber).toBe(7);
  });

  it('returns "no_future_slot" when the deferred episode is the last one in the season', () => {
    const items = makeSeason(10).map(item =>
      item.episodeNumber === 10
        ? { ...item, tieIn: { planned: true, source: "planned" as const } }
        : item
    );

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 10,
      producedEpisodeNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      perTenCap: 3,
    });

    expect(result).toEqual({ ok: false, reason: "no_future_slot" });
  });

  it('returns "cap_exhausted" when every future candidate would breach the fatigue-window cap', () => {
    const items = makeSeason(10).map(item => {
      if (item.episodeNumber === 2) return { ...item, tieIn: { planned: true, source: "planned" as const } };
      if (item.episodeNumber === 5) return { ...item, tieIn: { planned: true, source: "planned" as const } };
      return item;
    });

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 5,
      producedEpisodeNumbers: [1, 2, 3, 4, 5],
      perTenCap: 1, // resolveTieInEpisodeBudget(standard, 10, 1) = 1
    });

    expect(result).toEqual({ ok: false, reason: "cap_exhausted" });
  });

  it('returns "source_episode_not_found" when fromEpisodeNumber is not in items', () => {
    const items = makeSeason(10);

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 999,
      producedEpisodeNumbers: [],
      perTenCap: 3,
    });

    expect(result).toEqual({ ok: false, reason: "source_episode_not_found" });
  });

  it("never touches workingTitle/logline/keyBeats/contentBudget on ANY item — byte-identical except tieIn", () => {
    const items = makeSeason(10).map(item =>
      item.episodeNumber === 5
        ? { ...item, tieIn: { planned: true, source: "planned" as const } }
        : item
    );

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 5,
      producedEpisodeNumbers: [1, 2, 3, 4, 5],
      perTenCap: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    result.proposedBreakdown.forEach((item, i) => expectStoryFieldsUnchanged(items[i], item));
  });

  it("clears tieIn.planned on the source episode and sets it fresh on the target with source: deferred", () => {
    // The source's own benefitFocus/intensity is deliberately NOT copied
    // onto the target — that guidance was written for the SOURCE episode's
    // story content, not the target's (different keyBeats/context), so the
    // target starts fresh (undefined) rather than carrying stale context.
    const items = makeSeason(10).map(item =>
      item.episodeNumber === 5
        ? { ...item, tieIn: { planned: true, source: "planned" as const, benefitFocus: "convenience" } }
        : item
    );

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 5,
      producedEpisodeNumbers: [1, 2, 3, 4, 5],
      perTenCap: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const source = result.proposedBreakdown.find(i => i.episodeNumber === 5);
    const target = result.proposedBreakdown.find(i => i.episodeNumber === result.targetEpisodeNumber);
    expect(source?.tieIn?.planned).toBe(false);
    expect(target?.tieIn).toEqual({
      planned: true,
      intensity: undefined,
      benefitFocus: undefined,
      source: "deferred",
      movedFromEpisodeNumber: 5,
    });
  });

  it("returns the FULL items array as proposedBreakdown, not just the 2 touched episodes", () => {
    const items = makeSeason(10).map(item =>
      item.episodeNumber === 5
        ? { ...item, tieIn: { planned: true, source: "planned" as const } }
        : item
    );

    const result = proposeTieInDeferReplan({
      items,
      fromEpisodeNumber: 5,
      producedEpisodeNumbers: [1, 2, 3, 4, 5],
      perTenCap: 3,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.proposedBreakdown).toHaveLength(items.length);
  });
});
