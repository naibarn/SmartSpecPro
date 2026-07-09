/**
 * Coverage for `verticalDramaArcReplan.ts` (spec §7.7.3, section-13) —
 * deterministic (no LLM, no DB) drift detection + re-plan proposal
 * construction + version application. Mirrors
 * `verticalDramaQualityReviewApply.test.ts`'s pure-function testing style:
 * no mocks needed anywhere in this file.
 */
import { describe, it, expect, vi } from "vitest";
import {
  detectArcDrift,
  buildArcReplanProposal,
  applyApprovedArcReplan,
  findArcReplanTieInGuardViolations,
  VerticalDramaArcReplanGuardViolationError,
  VD_ARC_TIE_IN_REPLAN_GUARD_VIOLATION,
  type ArcDriftApprovedScript,
  type ArcDriftOpenHook,
} from "../verticalDramaArcReplan";
import type { StoredEpisodeBreakdownItem } from "../verticalDramaStoryBible";
import type {
  VerticalDramaEpisodeBreakdownItem,
  VerticalDramaArcReplanProposal,
} from "@shared/verticalDramaSeries/contentBudget";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function breakdownItem(
  episodeNumber: number,
  keyBeats: string[],
  contentBudget: StoredEpisodeBreakdownItem["contentBudget"],
): StoredEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline for episode ${episodeNumber}`,
    keyBeats,
    contentBudget,
  };
}

/** A clean 10-episode season plan with an escalating conflictLevel curve. */
function seasonBreakdown(): StoredEpisodeBreakdownItem[] {
  const conflictCurve = [1, 2, 2, 3, 3, 4, 4, 4, 5, 5];
  return [
    breakdownItem(1, ["Aria discovers the hidden shareholder ledger"], {
      beatCount: 6,
      estimatedSpeechSeconds: 35,
      conflictLevel: conflictCurve[0],
      reversalTarget: 2,
      arcThreads: ["corporate espionage subplot"],
    }),
    breakdownItem(2, ["Somchai confronts his bitter rival at the gala"], {
      beatCount: 6,
      estimatedSpeechSeconds: 35,
      conflictLevel: conflictCurve[1],
      reversalTarget: 2,
      arcThreads: ["corporate espionage subplot"],
    }),
    breakdownItem(3, ["The wedding ceremony is interrupted by scandal"], {
      beatCount: 6,
      estimatedSpeechSeconds: 36,
      conflictLevel: conflictCurve[2],
      reversalTarget: 2,
      arcThreads: ["romance thread"],
    }),
    breakdownItem(4, ["A hidden witness comes forward"], {
      beatCount: 6,
      estimatedSpeechSeconds: 36,
      conflictLevel: conflictCurve[3],
      reversalTarget: 2,
      arcThreads: ["corporate espionage subplot"],
    }),
    breakdownItem(5, ["The blackmail letter is finally traced to its source"], {
      beatCount: 6,
      estimatedSpeechSeconds: 37,
      conflictLevel: conflictCurve[4],
      reversalTarget: 2,
      arcThreads: ["corporate espionage subplot"],
    }),
    breakdownItem(6, ["Family loyalties are tested at the funeral"], {
      beatCount: 6,
      estimatedSpeechSeconds: 37,
      conflictLevel: conflictCurve[5],
      reversalTarget: 2,
      arcThreads: ["romance thread"],
    }),
    breakdownItem(7, ["The rival company launches a hostile takeover"], {
      beatCount: 7,
      estimatedSpeechSeconds: 38,
      conflictLevel: conflictCurve[6],
      reversalTarget: 3,
      arcThreads: ["corporate espionage subplot"],
    }),
    breakdownItem(8, ["A shocking betrayal is uncovered"], {
      beatCount: 7,
      estimatedSpeechSeconds: 38,
      conflictLevel: conflictCurve[7],
      reversalTarget: 3,
      arcThreads: ["corporate espionage subplot", "romance thread"],
    }),
    breakdownItem(9, ["The board votes on the company's fate"], {
      beatCount: 7,
      estimatedSpeechSeconds: 39,
      conflictLevel: conflictCurve[8],
      reversalTarget: 3,
      arcThreads: ["corporate espionage subplot"],
    }),
    breakdownItem(10, ["The finale showdown resolves everything"], {
      beatCount: 7,
      estimatedSpeechSeconds: 40,
      conflictLevel: conflictCurve[9],
      reversalTarget: 3,
      arcThreads: ["corporate espionage subplot", "romance thread"],
    }),
  ];
}

function cleanApprovedScript(overrides: Partial<ArcDriftApprovedScript> = {}): ArcDriftApprovedScript {
  return {
    beatSummaries: ["Aria reviews the quarterly numbers quietly at her desk"],
    continuityNotes: ["Aria remains suspicious of the numbers but says nothing yet"],
    realizedBeatCount: 6,
    realizedEstimatedSpeechSeconds: 35,
    realizedConflictLevel: 1,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* detectArcDrift                                                             */
/* -------------------------------------------------------------------------- */

describe("detectArcDrift", () => {
  it("returns drifted: false and empty reasons/affectedEpisodeNumbers for a clean episode", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript(),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    expect(result).toEqual({ drifted: false, reasons: [], affectedEpisodeNumbers: [] });
  });

  it("fires VD_ARC_BEATS_CONSUMED_EARLY when this episode's content overlaps a FUTURE episode's keyBeats", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({
        beatSummaries: [
          "Somchai confronts his bitter rival directly at the extravagant gala event",
        ],
      }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    expect(result.drifted).toBe(true);
    const reason = result.reasons.find(r => r.code === "VD_ARC_BEATS_CONSUMED_EARLY");
    expect(reason).toBeDefined();
    expect(reason?.evidence).toContain("episode 2");
    expect(result.affectedEpisodeNumbers).toContain(2);
  });

  it("does NOT fire VD_ARC_BEATS_CONSUMED_EARLY against a PAST/current episode's keyBeats (future-only)", () => {
    // Episode 5's approved script overlaps heavily with episode 1's (PAST)
    // keyBeat text — must never be reported as "consumed early" or appear
    // in affectedEpisodeNumbers, since episode 1 is not in the future.
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({
        beatSummaries: ["Aria finally discovers the hidden shareholder ledger everyone hid"],
      }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 5,
      priorMemoryHooks: [],
    });

    const reason = result.reasons.find(r => r.code === "VD_ARC_BEATS_CONSUMED_EARLY");
    expect(reason).toBeUndefined();
    expect(result.affectedEpisodeNumbers.every(n => n > 5)).toBe(true);
  });

  it("fires VD_ARC_HOOK_RESOLVED_EARLY when a hook planned for a later episode is addressed in continuity notes now", () => {
    const priorMemoryHooks: ArcDriftOpenHook[] = [
      {
        hookId: "hook-blackmail-letter",
        description: "the mysterious blackmail letter targeting Aria's family",
        plannedResolutionEpisodeNumber: 5,
      },
    ];

    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({
        continuityNotes: [
          "The mysterious blackmail letter targeting Aria's family is finally revealed and resolved",
        ],
      }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks,
    });

    expect(result.drifted).toBe(true);
    const reason = result.reasons.find(r => r.code === "VD_ARC_HOOK_RESOLVED_EARLY");
    expect(reason).toBeDefined();
    expect(reason?.evidence).toContain("blackmail letter");
    expect(result.affectedEpisodeNumbers).toContain(5);
  });

  it("does NOT fire VD_ARC_HOOK_RESOLVED_EARLY for a hook with no plannedResolutionEpisodeNumber", () => {
    const priorMemoryHooks: ArcDriftOpenHook[] = [
      { hookId: "hook-unplanned-timing", description: "the mysterious blackmail letter" },
    ];

    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({
        continuityNotes: ["The mysterious blackmail letter is resolved"],
      }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks,
    });

    expect(result.reasons.find(r => r.code === "VD_ARC_HOOK_RESOLVED_EARLY")).toBeUndefined();
  });

  it("does NOT fire VD_ARC_HOOK_RESOLVED_EARLY when the planned episode is not in the future", () => {
    const priorMemoryHooks: ArcDriftOpenHook[] = [
      {
        hookId: "hook-already-due",
        description: "the mysterious blackmail letter targeting Aria's family",
        plannedResolutionEpisodeNumber: 3,
      },
    ];

    // episodeNumber 3 == plannedResolutionEpisodeNumber -> resolving it now
    // is ON PLAN, not early.
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({
        continuityNotes: [
          "The mysterious blackmail letter targeting Aria's family is finally revealed and resolved",
        ],
      }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 3,
      priorMemoryHooks,
    });

    expect(result.reasons.find(r => r.code === "VD_ARC_HOOK_RESOLVED_EARLY")).toBeUndefined();
  });

  it("fires VD_ARC_HOOK_UNPLANNED when a new hook matches no declared arcThread across the season", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({
        newHookDescriptions: ["A shocking twin sister nobody knew about suddenly appears"],
      }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    expect(result.drifted).toBe(true);
    const reason = result.reasons.find(r => r.code === "VD_ARC_HOOK_UNPLANNED");
    expect(reason).toBeDefined();
    expect(reason?.evidence).toContain("twin sister");
    // Broad impact — every future episode is potentially affected.
    expect(result.affectedEpisodeNumbers).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("does NOT fire VD_ARC_HOOK_UNPLANNED when the new hook matches a declared arcThread", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({
        newHookDescriptions: ["A new twist deepens the corporate espionage subplot further"],
      }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    expect(result.reasons.find(r => r.code === "VD_ARC_HOOK_UNPLANNED")).toBeUndefined();
  });

  it("fires VD_ARC_CONTENT_BUDGET_EXCEEDED when realized speech seconds exceed the planned budget by > 25%", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({ realizedEstimatedSpeechSeconds: 50 }), // budget is 35 -> +42.9%
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    expect(result.drifted).toBe(true);
    const reason = result.reasons.find(r => r.code === "VD_ARC_CONTENT_BUDGET_EXCEEDED");
    expect(reason).toBeDefined();
    expect(reason?.evidence).toContain("speech");
    expect(result.affectedEpisodeNumbers).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("fires VD_ARC_CONTENT_BUDGET_EXCEEDED when realized beat count exceeds the planned budget by > 25%", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({ realizedBeatCount: 8 }), // budget is 6 -> +33%
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    const reason = result.reasons.find(r => r.code === "VD_ARC_CONTENT_BUDGET_EXCEEDED");
    expect(reason).toBeDefined();
    expect(reason?.evidence).toContain("beat count");
  });

  it("does NOT fire VD_ARC_CONTENT_BUDGET_EXCEEDED within the 25% tolerance", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({ realizedEstimatedSpeechSeconds: 40 }), // budget 35 -> +14.3%
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    expect(result.reasons.find(r => r.code === "VD_ARC_CONTENT_BUDGET_EXCEEDED")).toBeUndefined();
  });

  it("fires VD_ARC_ESCALATION_ORDER_BROKEN when this episode's realized level already meets/exceeds a future episode's planned curve position", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({ realizedConflictLevel: 5 }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    expect(result.drifted).toBe(true);
    const reason = result.reasons.find(r => r.code === "VD_ARC_ESCALATION_ORDER_BROKEN");
    expect(reason).toBeDefined();
    // Episodes 2-8 have conflictLevel < 5 (flattened); 9 and 10 are already
    // at 5, so realized(5) > planned(5) is false for those two.
    expect(result.affectedEpisodeNumbers).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  it("does NOT fire VD_ARC_ESCALATION_ORDER_BROKEN when the realized level stays within the planned curve", () => {
    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({ realizedConflictLevel: 1 }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    expect(result.reasons.find(r => r.code === "VD_ARC_ESCALATION_ORDER_BROKEN")).toBeUndefined();
  });

  it("is deterministic: identical input produces identical output (no Date.now/randomness in the logic path)", () => {
    const input = {
      approvedScript: cleanApprovedScript({
        realizedConflictLevel: 5,
        realizedEstimatedSpeechSeconds: 50,
        newHookDescriptions: ["A shocking twin sister nobody knew about suddenly appears"],
      }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    };

    const first = detectArcDrift(input);
    const second = detectArcDrift(input);
    expect(second).toEqual(first);
  });

  it("skips VD_ARC_CONTENT_BUDGET_EXCEEDED and VD_ARC_ESCALATION_ORDER_BROKEN gracefully when the current episode has no contentBudget (legacy item)", () => {
    const legacyBreakdown: StoredEpisodeBreakdownItem[] = [
      {
        episodeNumber: 1,
        workingTitle: "Episode 1",
        logline: "Legacy logline",
        keyBeats: ["Some legacy beat"],
        // no contentBudget — legacy item
      },
      breakdownItem(2, ["Future beat"], {
        beatCount: 6,
        estimatedSpeechSeconds: 35,
        conflictLevel: 2,
        reversalTarget: 2,
        arcThreads: [],
      }),
    ];

    const result = detectArcDrift({
      approvedScript: cleanApprovedScript({
        realizedEstimatedSpeechSeconds: 999,
        realizedBeatCount: 999,
        realizedConflictLevel: 5,
      }),
      activeBreakdown: legacyBreakdown,
      episodeNumber: 1,
      priorMemoryHooks: [],
    });

    // Escalation-order-broken still fires (episode 2 HAS a contentBudget to
    // compare against); content-budget-exceeded cannot (episode 1 has none).
    expect(result.reasons.find(r => r.code === "VD_ARC_CONTENT_BUDGET_EXCEEDED")).toBeUndefined();
    expect(result.reasons.find(r => r.code === "VD_ARC_ESCALATION_ORDER_BROKEN")).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* buildArcReplanProposal                                                     */
/* -------------------------------------------------------------------------- */

describe("buildArcReplanProposal", () => {
  const drift = detectArcDrift({
    approvedScript: cleanApprovedScript({ realizedConflictLevel: 5 }),
    activeBreakdown: seasonBreakdown(),
    episodeNumber: 1,
    priorMemoryHooks: [],
  });

  function futureReplacementItems(): VerticalDramaEpisodeBreakdownItem[] {
    return [
      {
        episodeNumber: 2,
        workingTitle: "Episode 2 (re-planned)",
        logline: "Re-planned logline",
        keyBeats: ["A re-planned beat"],
        contentBudget: {
          beatCount: 6,
          estimatedSpeechSeconds: 36,
          conflictLevel: 3,
          reversalTarget: 2,
          arcThreads: ["corporate espionage subplot"],
        },
      },
    ];
  }

  it("builds a proposal with status 'proposed', deduplicated driftReasons, and affectedEpisodeNumbers from proposedItems", () => {
    const proposal = buildArcReplanProposal({
      drift,
      activeBreakdown: seasonBreakdown(),
      triggeredByEpisodeNumber: 1,
      proposedItems: futureReplacementItems(),
      seriesId: "series-1",
      proposalId: "proposal-fixed-id",
    });

    expect(proposal.proposalId).toBe("proposal-fixed-id");
    expect(proposal.seriesId).toBe("series-1");
    expect(proposal.triggeredByEpisodeNumber).toBe(1);
    expect(proposal.status).toBe("proposed");
    expect(proposal.affectedEpisodeNumbers).toEqual([2]);
    expect(proposal.driftReasons).toEqual(["VD_ARC_ESCALATION_ORDER_BROKEN"]);
    expect(proposal.proposedBreakdown).toEqual(futureReplacementItems());
    expect(proposal.rationale.length).toBeGreaterThan(0);
  });

  it("auto-composes a rationale from drift evidence when none is provided", () => {
    const proposal = buildArcReplanProposal({
      drift,
      activeBreakdown: seasonBreakdown(),
      triggeredByEpisodeNumber: 1,
      proposedItems: futureReplacementItems(),
      seriesId: "series-1",
    });

    expect(proposal.rationale).toContain("VD_ARC_ESCALATION_ORDER_BROKEN");
  });

  it("uses an explicit rationale override when provided", () => {
    const proposal = buildArcReplanProposal({
      drift,
      activeBreakdown: seasonBreakdown(),
      triggeredByEpisodeNumber: 1,
      proposedItems: futureReplacementItems(),
      seriesId: "series-1",
      rationale: "Custom rationale text",
    });

    expect(proposal.rationale).toBe("Custom rationale text");
  });

  it("throws when proposedItems includes an already-produced/current episode (future-only invariant)", () => {
    expect(() =>
      buildArcReplanProposal({
        drift,
        activeBreakdown: seasonBreakdown(),
        triggeredByEpisodeNumber: 1,
        proposedItems: [
          {
            episodeNumber: 1, // <= triggeredByEpisodeNumber -> must throw
            workingTitle: "Illegal rewrite of episode 1",
            logline: "...",
            keyBeats: ["..."],
            contentBudget: {
              beatCount: 6,
              estimatedSpeechSeconds: 35,
              conflictLevel: 1,
              reversalTarget: 2,
              arcThreads: [],
            },
          },
        ],
        seriesId: "series-1",
      }),
    ).toThrow(/FUTURE episodes/);
  });

  it("throws when drift.reasons is empty (nothing to propose)", () => {
    expect(() =>
      buildArcReplanProposal({
        drift: { drifted: false, reasons: [], affectedEpisodeNumbers: [] },
        activeBreakdown: seasonBreakdown(),
        triggeredByEpisodeNumber: 1,
        proposedItems: futureReplacementItems(),
        seriesId: "series-1",
      }),
    ).toThrow(/drift.reasons must be non-empty/);
  });
});

/* -------------------------------------------------------------------------- */
/* applyApprovedArcReplan                                                     */
/* -------------------------------------------------------------------------- */

describe("applyApprovedArcReplan", () => {
  function approvedProposal(
    proposedBreakdown: VerticalDramaEpisodeBreakdownItem[],
  ): ReturnType<typeof buildArcReplanProposal> {
    const drift = detectArcDrift({
      approvedScript: cleanApprovedScript({ realizedConflictLevel: 5 }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });
    return {
      ...buildArcReplanProposal({
        drift,
        activeBreakdown: seasonBreakdown(),
        triggeredByEpisodeNumber: 1,
        proposedItems: proposedBreakdown,
        seriesId: "series-1",
        proposalId: "proposal-1",
      }),
      status: "approved" as const,
    };
  }

  it("appends a NEW breakdown version, moves the active pointer, and never mutates the input bible", () => {
    const legacyBible: Record<string, unknown> = {
      episodeBreakdown: seasonBreakdown(),
      someOtherField: "untouched",
    };
    const originalSnapshot = JSON.parse(JSON.stringify(legacyBible));

    const proposal = approvedProposal([
      {
        episodeNumber: 2,
        workingTitle: "Episode 2 (re-planned)",
        logline: "Re-planned logline",
        keyBeats: ["A re-planned beat"],
        contentBudget: {
          beatCount: 6,
          estimatedSpeechSeconds: 36,
          conflictLevel: 3,
          reversalTarget: 2,
          arcThreads: ["corporate espionage subplot"],
        },
      },
    ]);

    const newBible = applyApprovedArcReplan(legacyBible, proposal, 42);

    // Original object is completely untouched.
    expect(legacyBible).toEqual(originalSnapshot);
    expect(newBible).not.toBe(legacyBible);
    expect(newBible.someOtherField).toBe("untouched");

    const versions = newBible.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(1);
    expect(versions[0].source).toBe("arc_replan");
    expect(versions[0].createdByUserId).toBe(42);
    expect(newBible.activeBreakdownVersionId).toBe(versions[0].versionId);

    const newItems = versions[0].items as VerticalDramaEpisodeBreakdownItem[];
    expect(newItems).toHaveLength(10);
    // Episode 1 (produced) carried over UNCHANGED from the active breakdown.
    expect(newItems.find(i => i.episodeNumber === 1)).toEqual(seasonBreakdown()[0]);
    // Episode 2 (future) replaced with the proposal's replacement.
    expect(newItems.find(i => i.episodeNumber === 2)?.workingTitle).toBe(
      "Episode 2 (re-planned)",
    );
    // Every other future episode (3-10) untouched from the active breakdown.
    for (const ep of [3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(newItems.find(i => i.episodeNumber === ep)).toEqual(
        seasonBreakdown().find(i => i.episodeNumber === ep),
      );
    }
  });

  it("throws when the proposal is not status 'approved'", () => {
    const drift = detectArcDrift({
      approvedScript: cleanApprovedScript({ realizedConflictLevel: 5 }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 1,
      priorMemoryHooks: [],
    });
    const stillProposed = buildArcReplanProposal({
      drift,
      activeBreakdown: seasonBreakdown(),
      triggeredByEpisodeNumber: 1,
      proposedItems: [
        {
          episodeNumber: 2,
          workingTitle: "Episode 2 (re-planned)",
          logline: "Re-planned logline",
          keyBeats: ["A re-planned beat"],
          contentBudget: {
            beatCount: 6,
            estimatedSpeechSeconds: 36,
            conflictLevel: 3,
            reversalTarget: 2,
            arcThreads: [],
          },
        },
      ],
      seriesId: "series-1",
    });

    expect(() => applyApprovedArcReplan({ episodeBreakdown: seasonBreakdown() }, stillProposed, 1)).toThrow(
      /must be status "approved"/,
    );
  });

  it("appends a second version on top of a first, leaving the first version's items byte-identical", () => {
    const initialBible: Record<string, unknown> = { episodeBreakdown: seasonBreakdown() };

    const firstProposal = approvedProposal([
      {
        episodeNumber: 2,
        workingTitle: "Episode 2 (first replan)",
        logline: "...",
        keyBeats: ["..."],
        contentBudget: {
          beatCount: 6,
          estimatedSpeechSeconds: 36,
          conflictLevel: 3,
          reversalTarget: 2,
          arcThreads: [],
        },
      },
    ]);
    const afterFirst = applyApprovedArcReplan(initialBible, firstProposal, 1);

    const drift2 = detectArcDrift({
      approvedScript: cleanApprovedScript({ realizedConflictLevel: 5 }),
      activeBreakdown: seasonBreakdown(),
      episodeNumber: 3,
      priorMemoryHooks: [],
    });
    const secondProposal = {
      ...buildArcReplanProposal({
        drift: drift2,
        activeBreakdown: seasonBreakdown(),
        triggeredByEpisodeNumber: 3,
        proposedItems: [
          {
            episodeNumber: 4,
            workingTitle: "Episode 4 (second replan)",
            logline: "...",
            keyBeats: ["..."],
            contentBudget: {
              beatCount: 6,
              estimatedSpeechSeconds: 37,
              conflictLevel: 3,
              reversalTarget: 2,
              arcThreads: [],
            },
          },
        ],
        seriesId: "series-1",
      }),
      status: "approved" as const,
    };

    const afterSecond = applyApprovedArcReplan(afterFirst, secondProposal, 2);

    const versions = afterSecond.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions).toHaveLength(2);
    // First version is completely untouched by the second append.
    expect(versions[0]).toEqual((afterFirst.breakdownVersions as Array<Record<string, unknown>>)[0]);
    expect(afterSecond.activeBreakdownVersionId).toBe(versions[1].versionId);
  });
});

/* -------------------------------------------------------------------------- */
/* Task #31 — VD_ARC_TIE_IN_DEFERRED apply guard                              */
/* -------------------------------------------------------------------------- */

describe("applyApprovedArcReplan — VD_ARC_TIE_IN_DEFERRED guard (task #31)", () => {
  // Built directly (NOT via `buildArcReplanProposal`, whose future-only
  // invariant would reject `affectedEpisodeNumbers` including the SOURCE
  // episode) — mirrors exactly how `deferEpisodeTieIn`
  // (`server/routers/verticalDramaEpisodes.ts`) constructs this proposal
  // shape itself.
  function tieInDeferredProposal(
    proposedBreakdown: VerticalDramaEpisodeBreakdownItem[],
  ): VerticalDramaArcReplanProposal {
    return {
      proposalId: "tie-in-proposal-1",
      seriesId: "series-1",
      triggeredByEpisodeNumber: 1,
      driftReasons: ["VD_ARC_TIE_IN_DEFERRED"],
      affectedEpisodeNumbers: [1, 2],
      proposedBreakdown,
      rationale: "Moved product from episode 1 to episode 2.",
      status: "approved",
    };
  }

  it("applies cleanly when proposedBreakdown only changes tieIn", () => {
    const active = seasonBreakdown();
    const proposedBreakdown = active.map(item => {
      if (item.episodeNumber === 1) return { ...item, tieIn: { planned: false, source: "planned" as const } };
      if (item.episodeNumber === 2) {
        return {
          ...item,
          tieIn: { planned: true, source: "deferred" as const, movedFromEpisodeNumber: 1 },
        };
      }
      return item;
    });
    const bible: Record<string, unknown> = { episodeBreakdown: active };

    const newBible = applyApprovedArcReplan(bible, tieInDeferredProposal(proposedBreakdown), 1);

    const versions = newBible.breakdownVersions as Array<Record<string, unknown>>;
    const items = versions[0].items as VerticalDramaEpisodeBreakdownItem[];
    expect(items.find(i => i.episodeNumber === 1)?.tieIn?.planned).toBe(false);
    expect(items.find(i => i.episodeNumber === 2)?.tieIn).toEqual({
      planned: true,
      source: "deferred",
      movedFromEpisodeNumber: 1,
    });
  });

  it("throws VerticalDramaArcReplanGuardViolationError when a non-tieIn field changes", () => {
    const active = seasonBreakdown();
    const proposedBreakdown = active.map(item =>
      item.episodeNumber === 2
        ? {
            ...item,
            logline: "A secretly rewritten logline",
            tieIn: { planned: true, source: "deferred" as const, movedFromEpisodeNumber: 1 },
          }
        : item,
    );
    const bible: Record<string, unknown> = { episodeBreakdown: active };

    expect(() => applyApprovedArcReplan(bible, tieInDeferredProposal(proposedBreakdown), 1)).toThrow(
      VerticalDramaArcReplanGuardViolationError,
    );
  });

  it("never mutates the bible when the guard rejects", () => {
    const active = seasonBreakdown();
    const originalSnapshot = JSON.parse(JSON.stringify(active));
    const proposedBreakdown = active.map(item =>
      item.episodeNumber === 2 ? { ...item, workingTitle: "Hacked title" } : item,
    );
    const bible: Record<string, unknown> = { episodeBreakdown: active };

    expect(() => applyApprovedArcReplan(bible, tieInDeferredProposal(proposedBreakdown), 1)).toThrow();
    expect(active).toEqual(originalSnapshot);
    expect(bible.episodeBreakdown).toEqual(originalSnapshot);
  });

  it("reports a violation for a proposedBreakdown item naming an episode the active version doesn't have", () => {
    const active = seasonBreakdown();
    const proposedBreakdown: VerticalDramaEpisodeBreakdownItem[] = [
      {
        episodeNumber: 9999,
        workingTitle: "Fabricated episode",
        logline: "...",
        keyBeats: ["..."],
        contentBudget: { beatCount: 6, estimatedSpeechSeconds: 35, conflictLevel: 3, reversalTarget: 2, arcThreads: [] },
        tieIn: { planned: true, source: "deferred", movedFromEpisodeNumber: 1 },
      },
    ];
    const bible: Record<string, unknown> = { episodeBreakdown: active };

    let caught: unknown;
    try {
      applyApprovedArcReplan(bible, tieInDeferredProposal(proposedBreakdown), 1);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VerticalDramaArcReplanGuardViolationError);
    const violationError = caught as VerticalDramaArcReplanGuardViolationError;
    expect(violationError.code).toBe(VD_ARC_TIE_IN_REPLAN_GUARD_VIOLATION);
    expect(violationError.violations).toEqual([
      { episodeNumber: 9999, changedFields: ["__no_matching_active_item__"] },
    ]);
  });

  it("invokes opts.persistAudit with the violation record before throwing", () => {
    const active = seasonBreakdown();
    const proposedBreakdown = active.map(item =>
      item.episodeNumber === 2 ? { ...item, logline: "Sneaky change" } : item,
    );
    const bible: Record<string, unknown> = { episodeBreakdown: active };
    const persistAudit = vi.fn();

    expect(() =>
      applyApprovedArcReplan(bible, tieInDeferredProposal(proposedBreakdown), 1, { persistAudit }),
    ).toThrow(VerticalDramaArcReplanGuardViolationError);

    expect(persistAudit).toHaveBeenCalledTimes(1);
    expect(persistAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: "tie-in-proposal-1",
        seriesId: "series-1",
        violations: expect.arrayContaining([
          expect.objectContaining({ episodeNumber: 2, changedFields: expect.arrayContaining(["logline"]) }),
        ]),
      }),
    );
  });

  it("defaults opts.persistAudit to a no-op — omitting it never throws a secondary error", () => {
    const active = seasonBreakdown();
    const proposedBreakdown = active.map(item =>
      item.episodeNumber === 2 ? { ...item, logline: "Sneaky change" } : item,
    );
    const bible: Record<string, unknown> = { episodeBreakdown: active };

    expect(() => applyApprovedArcReplan(bible, tieInDeferredProposal(proposedBreakdown), 1)).toThrow(
      VerticalDramaArcReplanGuardViolationError,
    );
  });

  it("does NOT apply the tie-in guard to a proposal without VD_ARC_TIE_IN_DEFERRED — free to change story content", () => {
    const active = seasonBreakdown();
    const proposedBreakdown = active.map(item =>
      item.episodeNumber === 2 ? { ...item, logline: "Legitimately re-planned logline" } : item,
    );
    const bible: Record<string, unknown> = { episodeBreakdown: active };
    const proposal: VerticalDramaArcReplanProposal = {
      ...tieInDeferredProposal(proposedBreakdown),
      driftReasons: ["VD_ARC_BEATS_CONSUMED_EARLY"],
    };

    expect(() => applyApprovedArcReplan(bible, proposal, 1)).not.toThrow();
  });
});

describe("findArcReplanTieInGuardViolations", () => {
  it("returns [] when every item matches the active version except tieIn", () => {
    const active = seasonBreakdown();
    const proposed = active.map(item =>
      item.episodeNumber === 1 ? { ...item, tieIn: { planned: false, source: "planned" as const } } : item,
    );

    expect(findArcReplanTieInGuardViolations(active, proposed)).toEqual([]);
  });

  it("reports every changed field name (deep-compared, not reference-compared), sorted", () => {
    const active = seasonBreakdown();
    const proposed = active.map(item =>
      item.episodeNumber === 1
        ? { ...item, keyBeats: [...item.keyBeats, "a sneaky new beat"], workingTitle: "Renamed" }
        : item,
    );

    expect(findArcReplanTieInGuardViolations(active, proposed)).toEqual([
      { episodeNumber: 1, changedFields: ["keyBeats", "workingTitle"] },
    ]);
  });

  it("does not false-positive on a harmless key-insertion-order difference in contentBudget", () => {
    const active = seasonBreakdown();
    const reordered = active.map(item => ({
      ...item,
      contentBudget: item.contentBudget
        ? {
            arcThreads: item.contentBudget.arcThreads,
            reversalTarget: item.contentBudget.reversalTarget,
            conflictLevel: item.contentBudget.conflictLevel,
            estimatedSpeechSeconds: item.contentBudget.estimatedSpeechSeconds,
            beatCount: item.contentBudget.beatCount,
          }
        : item.contentBudget,
    }));

    expect(findArcReplanTieInGuardViolations(active, reordered)).toEqual([]);
  });
});
