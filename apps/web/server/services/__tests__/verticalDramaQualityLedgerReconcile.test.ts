/**
 * Coverage for `verticalDramaQualityLedgerReconcile.ts` (Feature 132 §5.4,
 * F132B) — `reconcileLedgers` + the per-ledger deterministic check
 * functions. Mirrors this section's own Test-first plan bullet 2.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeLedgerDramaturgy,
  checkCharacterActivationOverdue,
  checkConsequenceNotFollowed,
  checkEvidenceNoResistance,
  checkEvidenceOrphaned,
  checkEvidenceOverduePayoff,
  checkThreadStalled,
  checkThreatLadderAntagonistIdle,
  checkThreatLadderMissingCost,
  checkThreatLadderNonEscalating,
  checkWorldRuleNeverReusedOrNoChoice,
  reconcileLedgers,
} from "../verticalDramaQualityLedgerReconcile";
import { emptyQualityLedgers, type VerticalDramaQualityLedgers } from "@shared/verticalDramaSeries/qualityLedgers";
import type { StoredEpisodeBreakdownItem } from "../verticalDramaStoryBible";

/* -------------------------------------------------------------------------- */
/* Fixture builders                                                          */
/* -------------------------------------------------------------------------- */

function shotDraft(
  shotNumber: number,
  summary: string,
  dialogueLines: Array<{ speaker: string; line: string }> = []
) {
  return {
    shot_number: shotNumber,
    summary,
    dialogue_lines: dialogueLines,
  };
}

function nineShots(
  overrides: Record<number, ReturnType<typeof shotDraft>> = {}
): ReturnType<typeof shotDraft>[] {
  const shots: ReturnType<typeof shotDraft>[] = [];
  for (let i = 1; i <= 9; i++) {
    shots.push(overrides[i] ?? shotDraft(i, `เนื้อหาทั่วไปของฉากที่ ${i}`));
  }
  return shots;
}

function draftedItem(
  episodeNumber: number,
  opts: {
    shots?: Record<number, ReturnType<typeof shotDraft>>;
    characterDecisions?: Array<{ character: string; decision: string }>;
    antagonistTactics?: string[];
  } = {}
): StoredEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `ตอนที่ ${episodeNumber}`,
    logline: "logline",
    keyBeats: ["beat"],
    shotDrafts: nineShots(opts.shots),
    ...(opts.characterDecisions ? { character_decisions: opts.characterDecisions } : {}),
    ...(opts.antagonistTactics ? { antagonist_tactics: opts.antagonistTactics } : {}),
  } as unknown as StoredEpisodeBreakdownItem;
}

/* -------------------------------------------------------------------------- */
/* Evidence ledger                                                          */
/* -------------------------------------------------------------------------- */

describe("reconcileLedgers — evidence ledger", () => {
  it("a clue introduced in ep2, never mentioned again -> status: orphaned + finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      evidenceLedger: [
        { id: "e1", label: "บันทึกเปื้อนเลือด", introducedEpisode: 2, usedEpisodes: [], changesDecisionEpisodes: [], status: "open" },
      ],
    };
    const items = [
      draftedItem(1),
      draftedItem(2, { shots: { 1: shotDraft(1, "ตำรวจพบบันทึกเปื้อนเลือด") } }),
      draftedItem(3),
      draftedItem(4),
    ];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.evidenceLedger[0].status).toBe("orphaned");
    expect(reconciled.evidenceLedger[0].usedEpisodes).toEqual([]);

    const findings = checkEvidenceOrphaned(reconciled.evidenceLedger);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("evidence_orphaned");
  });

  it("a clue used in ep4 with no accompanying decision -> status: convenience + finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      evidenceLedger: [
        { id: "e1", label: "กุญแจสำรอง", introducedEpisode: 1, usedEpisodes: [], changesDecisionEpisodes: [], status: "open" },
      ],
    };
    const items = [
      draftedItem(1, { shots: { 1: shotDraft(1, "นางเอกเก็บกุญแจสำรองไว้") } }),
      draftedItem(2),
      draftedItem(3),
      draftedItem(4, { shots: { 2: shotDraft(2, "นางเอกใช้กุญแจสำรองเปิดประตู") } }),
    ];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.evidenceLedger[0].status).toBe("convenience");
    expect(reconciled.evidenceLedger[0].usedEpisodes).toEqual([4]);
    expect(reconciled.evidenceLedger[0].changesDecisionEpisodes).toEqual([]);

    const findings = checkEvidenceNoResistance(reconciled.evidenceLedger);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("evidence_no_resistance");
  });

  it("a clue past mustPayoffByEpisode with no payoffEpisode -> overdue finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      evidenceLedger: [
        {
          id: "e1",
          label: "จดหมายลับ",
          introducedEpisode: 1,
          mustPayoffByEpisode: 3,
          usedEpisodes: [],
          changesDecisionEpisodes: [],
          status: "open",
        },
      ],
    };
    const items = [draftedItem(1), draftedItem(2), draftedItem(3), draftedItem(4)];

    const reconciled = reconcileLedgers(ledgers, items);
    const findings = checkEvidenceOverduePayoff(reconciled.evidenceLedger, 4);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("evidence_no_payoff");
  });

  it("a clue used with an accompanying decision in the SAME episode -> a payoff is recorded, no orphan/convenience finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      evidenceLedger: [
        { id: "e1", label: "รูปถ่ายเก่า", introducedEpisode: 1, usedEpisodes: [], changesDecisionEpisodes: [], status: "open" },
      ],
    };
    const items = [
      draftedItem(1, { shots: { 1: shotDraft(1, "เธอเจอรูปถ่ายเก่าในลิ้นชัก") } }),
      draftedItem(2, {
        shots: { 1: shotDraft(1, "เธอเผชิญหน้าพ่อด้วยรูปถ่ายเก่า") },
        characterDecisions: [{ character: "Mai", decision: "เผชิญหน้าพ่อ" }],
      }),
    ];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.evidenceLedger[0].status).toBe("payoff_confirmed");
    expect(checkEvidenceOrphaned(reconciled.evidenceLedger)).toHaveLength(0);
    expect(checkEvidenceNoResistance(reconciled.evidenceLedger)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Character activation ledger                                              */
/* -------------------------------------------------------------------------- */

describe("reconcileLedgers — character activation ledger", () => {
  it("a character with no appearance/action by the required deadline -> status: dormant + finding fires", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      characterActivationLedger: [
        { character: "Mai", requiredActivationByEpisode: 3, status: "dormant" },
      ],
    };
    const items = [draftedItem(1), draftedItem(2), draftedItem(3)];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.characterActivationLedger[0].status).toBe("dormant");

    const findings = checkCharacterActivationOverdue(reconciled.characterActivationLedger, 3);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("character_agency_zero_decisions");
  });

  it("a character activated on time (speaks + decides before the deadline) -> no finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      characterActivationLedger: [
        { character: "Nok", requiredActivationByEpisode: 3, status: "dormant" },
      ],
    };
    const items = [
      draftedItem(1, {
        shots: { 1: shotDraft(1, "เปิดตัว", [{ speaker: "Nok", line: "ฉันจะไม่ยอม" }]) },
        characterDecisions: [{ character: "Nok", decision: "ปฏิเสธข้อเสนอ" }],
      }),
      draftedItem(2),
      draftedItem(3),
    ];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.characterActivationLedger[0].status).toBe("active");
    expect(checkCharacterActivationOverdue(reconciled.characterActivationLedger, 3)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Threat ladder                                                             */
/* -------------------------------------------------------------------------- */

describe("reconcileLedgers — threat ladder", () => {
  it("a flat (non-escalating) threat level across 3+ consecutive episodes -> finding", () => {
    const threatLadder = [
      { episode: 1, threatLevel: 2, costToProtagonist: "เสียเวลา" },
      { episode: 2, threatLevel: 2, costToProtagonist: "เสียเงิน" },
      { episode: 3, threatLevel: 2, costToProtagonist: "เสียใจ" },
    ];
    const findings = checkThreatLadderNonEscalating(threatLadder as never);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("threat_not_escalating");
    expect(findings[0].evidenceEpisodes).toEqual([1, 2, 3]);
  });

  it("an episode threat row missing costToProtagonist -> finding", () => {
    const threatLadder = [{ episode: 1, threatLevel: 2 }];
    const findings = checkThreatLadderMissingCost(threatLadder as never);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("threat_not_escalating");
  });

  it("antagonist absent (no causedByAntagonist) for 3+ consecutive episodes -> finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      threatLadder: [
        { episode: 1, threatLevel: 1 },
        { episode: 2, threatLevel: 2 },
        { episode: 3, threatLevel: 3 },
      ],
    };
    const items = [draftedItem(1), draftedItem(2), draftedItem(3)];

    const reconciled = reconcileLedgers(ledgers, items);
    const findings = checkThreatLadderAntagonistIdle(reconciled.threatLadder);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("antagonist_idle");
  });

  it("threat rows with antagonist_tactics recorded that episode get causedByAntagonist filled in by reconcile", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      threatLadder: [{ episode: 1, threatLevel: 2 }],
    };
    const items = [draftedItem(1, { antagonistTactics: ["ขู่"] })];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.threatLadder[0].causedByAntagonist).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* Consequence / Thread ledgers                                             */
/* -------------------------------------------------------------------------- */

describe("reconcileLedgers — consequence ledger", () => {
  it("mustBeFollowedInEpisode passed with no matching later event -> status: dropped + finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      consequenceLedger: [
        {
          id: "c1",
          decisionEpisode: 1,
          character: "Nok",
          decision: "เธอเลือกที่จะโกหกตำรวจ",
          mustBeFollowedInEpisode: 3,
          status: "pending",
        },
      ],
    };
    const items = [draftedItem(1), draftedItem(2), draftedItem(3)];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.consequenceLedger[0].status).toBe("dropped");

    const findings = checkConsequenceNotFollowed(reconciled.consequenceLedger);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("decision_without_consequence");
  });

  it("mustBeFollowedInEpisode passed WITH a matching later event -> status: followed, no finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      consequenceLedger: [
        {
          id: "c1",
          decisionEpisode: 1,
          character: "Nok",
          decision: "เธอเลือกที่จะโกหกตำรวจ",
          mustBeFollowedInEpisode: 3,
          status: "pending",
        },
      ],
    };
    const items = [
      draftedItem(1),
      draftedItem(2, { shots: { 1: shotDraft(1, "ตำรวจจับได้ว่าเธอเลือกที่จะโกหกตำรวจ") } }),
      draftedItem(3),
    ];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.consequenceLedger[0].status).toBe("followed");
    expect(reconciled.consequenceLedger[0].followedInEpisode).toBe(2);
    expect(checkConsequenceNotFollowed(reconciled.consequenceLedger)).toHaveLength(0);
  });
});

describe("reconcileLedgers — thread ledger", () => {
  it("mustMoveAgainByEpisode passed with lastMovedEpisode unchanged -> thread_stalled finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      threadLedger: [
        { id: "t1", label: "น้องสาวหายตัวไป", lastMovedEpisode: 1, mustMoveAgainByEpisode: 3, status: "active" },
      ],
    };
    const items = [draftedItem(1), draftedItem(2), draftedItem(3)];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.threadLedger[0].status).toBe("stalled");
    expect(reconciled.threadLedger[0].lastMovedEpisode).toBe(1);

    const findings = checkThreadStalled(reconciled.threadLedger);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("thread_stalled");
  });

  it("a resolved thread is never resurrected by reconcile even past its deadline", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      threadLedger: [
        { id: "t1", label: "น้องสาวหายตัวไป", mustMoveAgainByEpisode: 1, status: "resolved" },
      ],
    };
    const items = [draftedItem(1), draftedItem(2)];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.threadLedger[0].status).toBe("resolved");
    expect(checkThreadStalled(reconciled.threadLedger)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* World rule ledger                                                        */
/* -------------------------------------------------------------------------- */

describe("reconcileLedgers — world rule ledger", () => {
  it("a rule with usedAgainEpisodes: [] past its introduction -> verdict: revise + finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      worldRuleLedger: [
        {
          id: "w1",
          rule: "คำสาปส่งต่อกันได้เฉพาะเที่ยงคืน",
          introducedEpisode: 1,
          usedAgainEpisodes: [],
          createsChoice: true,
          verdict: "keep",
        },
      ],
    };
    const items = [draftedItem(1), draftedItem(2)];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.worldRuleLedger[0].verdict).toBe("revise");

    const findings = checkWorldRuleNeverReusedOrNoChoice(reconciled.worldRuleLedger);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("world_rules_undefined");
  });

  it("a rule with createsChoice: false past its introduction -> verdict: revise, even if reused", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      worldRuleLedger: [
        {
          id: "w1",
          rule: "เวทมนตร์ต้องแลกด้วยความทรงจำ",
          introducedEpisode: 1,
          usedAgainEpisodes: [],
          createsChoice: false,
          verdict: "keep",
        },
      ],
    };
    const items = [
      draftedItem(1),
      draftedItem(2, { shots: { 1: shotDraft(1, "เธอใช้เวทมนตร์ต้องแลกด้วยความทรงจำอีกครั้ง") } }),
    ];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.worldRuleLedger[0].usedAgainEpisodes).toEqual([2]);
    expect(reconciled.worldRuleLedger[0].verdict).toBe("revise");
  });

  it("a rule reused with createsChoice: true past its introduction -> verdict stays keep, no finding", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      worldRuleLedger: [
        {
          id: "w1",
          rule: "กระจกวิเศษบอกความจริงได้ครั้งเดียวต่อวัน",
          introducedEpisode: 1,
          usedAgainEpisodes: [],
          createsChoice: true,
          verdict: "keep",
        },
      ],
    };
    const items = [
      draftedItem(1),
      draftedItem(2, { shots: { 1: shotDraft(1, "เธอใช้กระจกวิเศษบอกความจริงได้ครั้งเดียวต่อวันอีกครั้ง") } }),
    ];

    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.worldRuleLedger[0].verdict).toBe("keep");
    expect(checkWorldRuleNeverReusedOrNoChoice(reconciled.worldRuleLedger)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* reconcileLedgers — integration invariants                                */
/* -------------------------------------------------------------------------- */

describe("reconcileLedgers — integration invariants", () => {
  function fullFixture(): { ledgers: VerticalDramaQualityLedgers; items: StoredEpisodeBreakdownItem[] } {
    const ledgers: VerticalDramaQualityLedgers = {
      evidenceLedger: [
        { id: "e1", label: "บันทึกลับ", introducedEpisode: 1, usedEpisodes: [], changesDecisionEpisodes: [], status: "open" },
      ],
      characterActivationLedger: [
        { character: "Mai", requiredActivationByEpisode: 3, status: "dormant" },
      ],
      threatLadder: [
        { episode: 1, threatLevel: 1 },
        { episode: 2, threatLevel: 2 },
      ],
      consequenceLedger: [
        { id: "c1", decisionEpisode: 1, character: "Mai", decision: "ตัดสินใจหนี", status: "pending" },
      ],
      threadLedger: [{ id: "t1", label: "คดีฆาตกรรม", status: "active" }],
      worldRuleLedger: [
        {
          id: "w1",
          rule: "กฎบางอย่าง",
          introducedEpisode: 1,
          usedAgainEpisodes: [],
          createsChoice: true,
          verdict: "keep",
        },
      ],
      causalChainMap: [{ id: "cc1", description: "a leads to b", episodes: [1] }],
    };
    const items = [
      draftedItem(1, {
        shots: { 1: shotDraft(1, "เธอพบบันทึกลับและตัดสินใจหนี") },
        characterDecisions: [{ character: "Mai", decision: "ตัดสินใจหนี" }],
      }),
      draftedItem(2),
    ];
    return { ledgers, items };
  }

  it("is a pure, synchronous function (never an LLM/network call — no Promise returned)", () => {
    const { ledgers, items } = fullFixture();
    const result = reconcileLedgers(ledgers, items);
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof (result as unknown as PromiseLike<unknown>).then).not.toBe("function");
  });

  it("is idempotent — running it twice on the same input produces the same output", () => {
    const { ledgers, items } = fullFixture();
    const once = reconcileLedgers(ledgers, items);
    const twice = reconcileLedgers(once, items);
    expect(twice).toEqual(once);
  });

  it("never removes a ledger row — every array's length is preserved", () => {
    const { ledgers, items } = fullFixture();
    const reconciled = reconcileLedgers(ledgers, items);
    expect(reconciled.evidenceLedger).toHaveLength(ledgers.evidenceLedger.length);
    expect(reconciled.characterActivationLedger).toHaveLength(ledgers.characterActivationLedger.length);
    expect(reconciled.threatLadder).toHaveLength(ledgers.threatLadder.length);
    expect(reconciled.consequenceLedger).toHaveLength(ledgers.consequenceLedger.length);
    expect(reconciled.threadLedger).toHaveLength(ledgers.threadLedger.length);
    expect(reconciled.worldRuleLedger).toHaveLength(ledgers.worldRuleLedger.length);
    expect(reconciled.causalChainMap).toHaveLength(ledgers.causalChainMap.length);
  });

  it("supports being called with only a PARTIAL (revised-only) episode subset without discarding unaffected ledger rows", () => {
    const { ledgers, items } = fullFixture();
    // Only episode 2 (not episode 1) passed this time — episode 1's already-derived state must not be lost.
    const partial = reconcileLedgers(ledgers, [items[1]]);
    expect(partial.evidenceLedger).toHaveLength(1);
    expect(partial.characterActivationLedger).toHaveLength(1);
  });

  it("analyzeLedgerDramaturgy concatenates every check's findings", () => {
    const ledgers: VerticalDramaQualityLedgers = {
      ...emptyQualityLedgers(),
      evidenceLedger: [
        { id: "e1", label: "หมดอายุ", introducedEpisode: 1, usedEpisodes: [], changesDecisionEpisodes: [], status: "orphaned" },
      ],
      worldRuleLedger: [
        {
          id: "w1",
          rule: "กฎ",
          introducedEpisode: 1,
          usedAgainEpisodes: [],
          createsChoice: true,
          verdict: "revise",
        },
      ],
    };
    const findings = analyzeLedgerDramaturgy(ledgers, 5);
    const kinds = findings.map(f => f.kind);
    expect(kinds).toContain("evidence_orphaned");
    expect(kinds).toContain("world_rules_undefined");
  });
});
