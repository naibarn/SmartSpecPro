/**
 * Dramaturgy critic (W11.5, added 2026-07-08) — coverage for
 * `verticalDramaStoryBible.ts`'s DETERMINISTIC, code-only season-craft
 * checks (`analyzeSeasonDramaturgy`) and the small tolerant readers backing
 * them. No LLM/db mocking needed — every function under test here is pure.
 *
 * Fixtures are modeled directly on the owner's golden 8/10 human critique
 * (see the task brief): a key character with real weight only from episode
 * 5 of 10, the antagonist repeating "ขู่" (threaten) across 4 consecutive
 * episodes, a side character (ปราง) who speaks but never decides anything,
 * dialogue overusing abstract nouns ("ความจริง"/"กติกา"/...), a finale with
 * no stated price, and a fantasy rule system mentioned often but never
 * codified into `world_rules`.
 *
 * The "apply-flow pure helpers" (`chunkSeasonCritiqueEpisodeNumbers`,
 * `seasonCritiqueRevisionIntroducesNewFinding`) and `loadSeasonCritiqueSystemPrompt`
 * coverage that used to live in this file were removed 2026-07-10 along with
 * `critiqueSeasonDrafts`/`applySeasonCritique`/the quality loop themselves
 * (replaced by "ปรับปรุงบทละครให้มีความสมบูรณ์" — see
 * `services/verticalDramaImproveScript.ts`). `analyzeSeasonDramaturgy`/
 * `VD_SEASON_CRITIQUE_FINDING_KINDS` and the tolerant per-item readers below
 * are DELIBERATELY still covered here — the separate, still-active
 * `verticalDramaQualityLedgerReconcile.ts` feature depends on them.
 */
import { describe, expect, it } from "vitest";
import {
  analyzeSeasonDramaturgy,
  readItemAntagonistTactics,
  readItemCharacterDecisions,
  readItemProtagonistStake,
  readItemWorldRules,
  readItemPricePaid,
  readBibleRefinedCharacters,
  VD_DRAMATURGY_LATE_INTRO_DIVISOR,
  VD_DRAMATURGY_MIN_TACTIC_VARIETY,
  VD_DRAMATURGY_TACTIC_REPEAT_STREAK,
  VD_DRAMATURGY_ABSTRACT_WORD_DENSITY_THRESHOLD,
  VD_DRAMATURGY_RULE_MENTION_MIN_EPISODES,
  type VdDramaturgyFinding,
  type StoredEpisodeBreakdownItem,
} from "../verticalDramaStoryBible";
import { resolveVerticalDramaFormatProfile } from "@shared/verticalDramaSeries/formatProfiles";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/** A planned-but-not-yet-drafted item (no `shotDrafts` at all). */
function plannedItem(episodeNumber: number): StoredEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: ["Beat"],
  } as StoredEpisodeBreakdownItem;
}

/**
 * A deep-drafted item with EXACTLY 9 shots (required for `readItemShotDrafts`
 * to parse it at all — a malformed/short array is treated as "not drafted").
 * `lines[i]` becomes shot `i+1`'s sole dialogue line (or none, past the end
 * of `lines`); `extra` is spread onto the item (antagonist_tactics/
 * character_decisions/price_paid/world_rules/protagonist_stake).
 */
function draftedItem(
  episodeNumber: number,
  lines: Array<{ speaker: string; line: string }>,
  extra: Record<string, unknown> = {},
): StoredEpisodeBreakdownItem {
  const shotDrafts = Array.from({ length: 9 }, (_, i) => ({
    shot_number: i + 1,
    summary: `Shot ${i + 1}`,
    dialogue_lines: i < lines.length ? [lines[i]] : [],
  }));
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: ["Beat"],
    shotDrafts,
    ...extra,
  } as StoredEpisodeBreakdownItem;
}

function findingsOfKind(findings: VdDramaturgyFinding[], kind: string): VdDramaturgyFinding[] {
  return findings.filter((f) => f.kind === kind);
}

/* -------------------------------------------------------------------------- */
/* Golden-critique fixtures — each check fires                               */
/* -------------------------------------------------------------------------- */

describe("analyzeSeasonDramaturgy — golden critique fixtures fire", () => {
  it("key_character_late_intro: flags a roster character whose real first appearance is episode 5 of 10 (threshold ceil(10/3)=4)", () => {
    expect(Math.ceil(10 / VD_DRAMATURGY_LATE_INTRO_DIVISOR)).toBe(4);

    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่องกันเลย" }]),
      draftedItem(2, [{ speaker: "เอก", line: "ทุกอย่างยังปกติดี" }]),
      draftedItem(3, [{ speaker: "เอก", line: "มีบางอย่างผิดปกติ" }]),
      draftedItem(4, [{ speaker: "เอก", line: "ต้องสืบให้รู้เรื่อง" }]),
      draftedItem(5, [{ speaker: "ปัณณ์", line: "ผมรู้เรื่องนี้ดีที่สุด" }]),
      plannedItem(6),
      plannedItem(7),
      plannedItem(8),
      plannedItem(9),
      plannedItem(10),
    ];

    const findings = analyzeSeasonDramaturgy(items, [{ name: "ปัณณ์" }]);
    const lateIntro = findingsOfKind(findings, "key_character_late_intro");
    expect(lateIntro).toHaveLength(1);
    expect(lateIntro[0].evidenceEpisodes).toEqual([5]);
  });

  it("does NOT flag late-intro when the character first appears exactly AT the threshold (boundary — only strictly later is late)", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "หนึ่ง" }]),
      draftedItem(2, [{ speaker: "เอก", line: "สอง" }]),
      draftedItem(3, [{ speaker: "เอก", line: "สาม" }]),
      draftedItem(4, [{ speaker: "ปัณณ์", line: "สี่ ผมมาแล้ว" }]),
      plannedItem(5),
      plannedItem(6),
      plannedItem(7),
      plannedItem(8),
      plannedItem(9),
      plannedItem(10),
    ];
    const findings = analyzeSeasonDramaturgy(items, [{ name: "ปัณณ์" }]);
    expect(findingsOfKind(findings, "key_character_late_intro")).toHaveLength(0);
  });

  it("skips a roster character who never appears at all (no evidence to call 'late' on)", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "หนึ่ง" }]),
      plannedItem(2),
      plannedItem(3),
    ];
    const findings = analyzeSeasonDramaturgy(items, [{ name: "ไม่เคยปรากฏ" }]);
    expect(findingsOfKind(findings, "key_character_late_intro")).toHaveLength(0);
  });

  it('antagonist_tactic_repetition: flags "ขู่" repeated across 4 CONSECUTIVE episodes even with 3 distinct tactics overall', () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [], {}),
      draftedItem(2, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(3, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(4, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(5, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(6, [], {}),
      draftedItem(7, [], { antagonist_tactics: ["สลับเอกสาร"] }),
      draftedItem(8, [], { antagonist_tactics: ["ปิดปาก"] }),
    ];

    const findings = analyzeSeasonDramaturgy(items);
    const repetition = findingsOfKind(findings, "antagonist_tactic_repetition");
    expect(repetition).toHaveLength(1); // only the streak — 3 distinct tactics overall, so variety is NOT also flagged.
    expect(repetition[0].evidenceEpisodes).toEqual([2, 3, 4, 5]);
    expect(repetition[0].detail).toContain("ขู่");
  });

  it("antagonist_tactic_repetition: also flags overall variety < 3 distinct tactics, independent of any streak", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(3, [], { antagonist_tactics: ["ปิดปาก"] }),
      draftedItem(5, [], { antagonist_tactics: ["ขู่"] }),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    const repetition = findingsOfKind(findings, "antagonist_tactic_repetition");
    expect(repetition.some((f) => f.detail.includes("2 แบบ"))).toBe(true);
  });

  it("does NOT flag a same-tag streak of only 2 (below the streak threshold), with 3 distinct tactics overall (variety also satisfied)", () => {
    expect(VD_DRAMATURGY_TACTIC_REPEAT_STREAK).toBe(3);
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(2, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(3, [], { antagonist_tactics: ["สลับเอกสาร"] }),
      draftedItem(4, [], { antagonist_tactics: ["ปิดปาก"] }),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findingsOfKind(findings, "antagonist_tactic_repetition")).toHaveLength(0);
  });

  it("character_agency_zero_decisions: flags ปราง who speaks in 3 episodes but never has a recorded decision", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }]),
      draftedItem(2, [{ speaker: "ปราง", line: "หนูไม่รู้อะไรเลยค่ะ" }]),
      draftedItem(3, [{ speaker: "เอก", line: "ทุกคนสงสัยปราง" }], {
        character_decisions: [{ character: "เอก", decision: "ตัดสินใจสืบเรื่องต่อ" }],
      }),
      draftedItem(4, [{ speaker: "ปราง", line: "หนูกลัวมากตอนนี้" }]),
      draftedItem(5, [{ speaker: "เอก", line: "ปรางถูกจับตัวไป" }]),
      draftedItem(6, [{ speaker: "ปราง", line: "ช่วยหนูด้วย" }]),
    ];
    const findings = analyzeSeasonDramaturgy(items, [{ name: "ปราง" }]);
    const agency = findingsOfKind(findings, "character_agency_zero_decisions");
    expect(agency).toHaveLength(1);
    expect(agency[0].evidenceEpisodes).toEqual([2, 4, 6]);
  });

  it("does NOT flag a character who has at least one recorded decision anywhere in the season", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "ปราง", line: "หนูไม่รู้อะไรเลยค่ะ" }]),
      draftedItem(2, [{ speaker: "ปราง", line: "หนูตัดสินใจแล้ว" }], {
        character_decisions: [{ character: "ปราง", decision: "เลือกที่จะบอกความจริงกับตำรวจ" }],
      }),
    ];
    const findings = analyzeSeasonDramaturgy(items, [{ name: "ปราง" }]);
    expect(findingsOfKind(findings, "character_agency_zero_decisions")).toHaveLength(0);
  });

  it("on_the_nose_dialogue: flags dialogue whose abstract-word density exceeds the threshold", () => {
    expect(VD_DRAMATURGY_ABSTRACT_WORD_DENSITY_THRESHOLD).toBeCloseTo(0.12);
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [
        { speaker: "เอก", line: "นี่คือความจริงที่ทุกคนต้องรู้" },
        { speaker: "ปราง", line: "หนูแค่อยากกลับบ้าน" },
        { speaker: "เอก", line: "เราต้องไปกันแล้ว" },
        { speaker: "ปราง", line: "อากาศวันนี้ดีจัง" },
        { speaker: "เอก", line: "รอฉันแป๊บนึงนะ" },
      ]),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    const onTheNose = findingsOfKind(findings, "on_the_nose_dialogue");
    expect(onTheNose).toHaveLength(1);
    expect(onTheNose[0].evidenceEpisodes).toEqual([1]);
  });

  it("does NOT flag dialogue whose abstract-word density stays at/below the threshold", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [
        { speaker: "เอก", line: "เราต้องรีบไปแล้วตอนนี้เลย" },
        { speaker: "ปราง", line: "หนูแค่อยากกลับบ้านเฉยๆ" },
        { speaker: "เอก", line: "อากาศวันนี้เย็นสบายดีนะ" },
      ]),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findingsOfKind(findings, "on_the_nose_dialogue")).toHaveLength(0);
  });

  it("finale_no_price_paid: flags the LAST-numbered drafted episode when it has no price_paid", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }]),
      draftedItem(2, [{ speaker: "เอก", line: "กลางเรื่อง" }]),
      draftedItem(3, [{ speaker: "เอก", line: "จบเรื่องแบบไม่มีอะไรเสีย" }]),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    const finale = findingsOfKind(findings, "finale_no_price_paid");
    expect(finale).toHaveLength(1);
    expect(finale[0].evidenceEpisodes).toEqual([3]);
  });

  it("does NOT flag the finale once price_paid is set", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }]),
      draftedItem(2, [{ speaker: "เอก", line: "จบเรื่อง" }], {
        price_paid: "เอกต้องเสียตำแหน่งงานเพื่อแลกกับการเปิดโปงความจริง",
      }),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findingsOfKind(findings, "finale_no_price_paid")).toHaveLength(0);
  });

  it("does NOT flag a finale that has not been deep-drafted yet (nothing to critique)", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }]),
      plannedItem(2),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findingsOfKind(findings, "finale_no_price_paid")).toHaveLength(0);
  });

  it("world_rules_undefined: flags rule-system words mentioned in >= 3 episodes while world_rules stays empty", () => {
    expect(VD_DRAMATURGY_RULE_MENTION_MIN_EPISODES).toBe(3);
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "ยายทวด", line: "การเปิดขวดนี้มีกฎอยู่นะ" }]),
      draftedItem(2, [{ speaker: "เอก", line: "แสงนั้นคือพลังอะไรกันแน่" }]),
      draftedItem(3, [{ speaker: "ยายทวด", line: "คำสาปนี้มีขีดจำกัดของมันเสมอ" }]),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    const worldRules = findingsOfKind(findings, "world_rules_undefined");
    expect(worldRules).toHaveLength(1);
    expect(worldRules[0].evidenceEpisodes).toEqual([1, 2, 3]);
  });

  it("does NOT flag world_rules_undefined when rule words appear in fewer than 3 episodes", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "ยายทวด", line: "การเปิดขวดนี้มีกฎอยู่นะ" }]),
      draftedItem(2, [{ speaker: "เอก", line: "แสงนั้นคือพลังอะไรกันแน่" }]),
      draftedItem(3, [{ speaker: "เอก", line: "วันนี้อากาศดีมาก" }]),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findingsOfKind(findings, "world_rules_undefined")).toHaveLength(0);
  });

  it("does NOT flag world_rules_undefined once ANY episode records a world_rules entry", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "ยายทวด", line: "การเปิดขวดนี้มีกฎอยู่นะ" }], {
        world_rules: [{ rule: "เปิดขวดได้แค่คืนพระจันทร์เต็มดวง", limit_or_cost: "ใช้ได้ครั้งเดียวต่อปี" }],
      }),
      draftedItem(2, [{ speaker: "เอก", line: "แสงนั้นคือพลังอะไรกันแน่" }]),
      draftedItem(3, [{ speaker: "ยายทวด", line: "คำสาปนี้มีขีดจำกัดของมันเสมอ" }]),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findingsOfKind(findings, "world_rules_undefined")).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Silence on healthy fixtures                                                */
/* -------------------------------------------------------------------------- */

describe("analyzeSeasonDramaturgy — silent on healthy fixtures", () => {
  it("returns [] for a series with no deep-drafted episodes at all", () => {
    const items = [plannedItem(1), plannedItem(2), plannedItem(3)];
    expect(analyzeSeasonDramaturgy(items, [{ name: "ใครก็ได้" }])).toEqual([]);
  });

  it("returns [] for an empty items array", () => {
    expect(analyzeSeasonDramaturgy([], [])).toEqual([]);
  });

  it("returns [] for a fully healthy 10-episode season (every check satisfied)", () => {
    const roster = [{ name: "เอก" }, { name: "ปราง" }];
    const tacticsByEp: Record<number, string[]> = {
      2: ["ขู่"],
      4: ["สลับเอกสาร"],
      6: ["ปิดปาก"],
      8: ["ขู่"],
    };
    const items: StoredEpisodeBreakdownItem[] = Array.from({ length: 10 }, (_, i) => {
      const episodeNumber = i + 1;
      const lines = [
        { speaker: "เอก", line: `เราต้องรีบไปตอนนี้เลยตอนที่ ${episodeNumber}` },
        { speaker: "ปราง", line: `หนูเลือกที่จะช่วยเขาตอนที่ ${episodeNumber}` },
      ];
      const extra: Record<string, unknown> = {
        character_decisions: [
          { character: "เอก", decision: `ตัดสินใจเดินหน้าต่อในตอนที่ ${episodeNumber}` },
          { character: "ปราง", decision: `เลือกที่จะไม่หนีในตอนที่ ${episodeNumber}` },
        ],
      };
      if (tacticsByEp[episodeNumber]) extra.antagonist_tactics = tacticsByEp[episodeNumber];
      if (episodeNumber === 1) {
        extra.protagonist_stake = "เอกต้องพิสูจน์ความบริสุทธิ์ของพ่อตัวเองก่อนที่คดีจะหมดอายุความ";
        extra.world_rules = [
          { rule: "เปิดขวดได้แค่คืนพระจันทร์เต็มดวงเท่านั้น", limit_or_cost: "ใช้ได้เพียงครั้งเดียวต่อปี" },
        ];
      }
      if (episodeNumber === 10) {
        extra.price_paid = "เอกต้องสละตำแหน่งงานที่รักที่สุดเพื่อแลกกับการเปิดโปงความจริงทั้งหมด";
      }
      return draftedItem(episodeNumber, lines, extra);
    });

    expect(analyzeSeasonDramaturgy(items, roster)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Format profiles (task #23, added 2026-07-08)                              */
/*                                                                            */
/* Owner's concern: "ซีรีส์สั้นมาก 3 ตอน คิดได้ดีเทียบกันไหม" — a 3-episode    */
/* series must be held to as tight a dramaturgy standard as a long season,    */
/* not the same loose, formula-scaled thresholds `analyzeSeasonDramaturgy`    */
/* already applies to a 10/20+ episode season.                                */
/* -------------------------------------------------------------------------- */

describe("analyzeSeasonDramaturgy — format profiles (task #23)", () => {
  it("(a) regression protection: a resolved STANDARD-tier profile produces IDENTICAL findings to passing no profile at all", () => {
    // 20 episodes -> "standard" tier (>= 13) — the exact tier whose numeric
    // dramaturgy fields are documented as "not read directly"; this proves
    // that in code, not just by reading the doc comment.
    const roster = [{ name: "ปัณณ์" }];
    const items: StoredEpisodeBreakdownItem[] = Array.from({ length: 20 }, (_, i) => {
      const episodeNumber = i + 1;
      const speaker = episodeNumber === 8 ? "ปัณณ์" : "เอก";
      return draftedItem(episodeNumber, [{ speaker, line: `บทพูดตอนที่ ${episodeNumber} ยาวพอสมควร` }]);
    });

    const withoutProfile = analyzeSeasonDramaturgy(items, roster);
    const withStandardProfile = analyzeSeasonDramaturgy(
      items,
      roster,
      resolveVerticalDramaFormatProfile(20),
    );
    expect(withStandardProfile).toEqual(withoutProfile);
    // Sanity check this fixture actually exercises the late-intro check at
    // all (ปัณณ์ first appears episode 8; legacy threshold ceil(20/3) = 7).
    expect(findingsOfKind(withoutProfile, "key_character_late_intro")).toHaveLength(1);
  });

  it("(a) regression protection: a standard-tier profile still honors the legacy ceil(total/3) boundary rule (not the fixed short-tier bar)", () => {
    // Episode 7 of 20 is EXACTLY at the legacy threshold (ceil(20/3) = 7) —
    // "only strictly later is late" — so this must stay unflagged even with
    // a resolved standard-tier profile passed explicitly.
    const roster = [{ name: "ปัณณ์" }];
    const items: StoredEpisodeBreakdownItem[] = Array.from({ length: 20 }, (_, i) => {
      const episodeNumber = i + 1;
      const speaker = episodeNumber === 7 ? "ปัณณ์" : "เอก";
      return draftedItem(episodeNumber, [{ speaker, line: `บทพูดตอนที่ ${episodeNumber} ยาวพอสมควร` }]);
    });
    const findings = analyzeSeasonDramaturgy(items, roster, resolveVerticalDramaFormatProfile(20));
    expect(findingsOfKind(findings, "key_character_late_intro")).toHaveLength(0);
  });

  it("(b) ultra_short: flags key_character_late_intro at ep2-intro on a 3-episode season", () => {
    const roster = [{ name: "ปัณณ์" }];
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่องกันเลยตอนที่หนึ่ง" }]),
      draftedItem(2, [{ speaker: "ปัณณ์", line: "ผมเพิ่งเข้าเรื่องตอนที่สอง" }]),
      draftedItem(3, [{ speaker: "เอก", line: "จบเรื่องกันตอนที่สาม" }]),
    ];
    const profile = resolveVerticalDramaFormatProfile(3);
    expect(profile.tier).toBe("ultra_short");

    const findings = analyzeSeasonDramaturgy(items, roster, profile);
    const lateIntro = findingsOfKind(findings, "key_character_late_intro");
    expect(lateIntro).toHaveLength(1);
    expect(lateIntro[0].evidenceEpisodes).toEqual([2]);
  });

  it("ultra_short's FIXED episode-1 bar flags a case the legacy ceil(N/3) formula would NOT (proves the profile — not a formula coincidence — drives the result)", () => {
    // 5 episodes is still ultra_short (<= 5), but the LEGACY formula would
    // give ceil(5/3) = 2 for this same fixture, and episode 2 is exactly AT
    // that threshold (not flagged, per the boundary rule). The FIXED
    // ultra_short bar (episode 1 only) flags it instead.
    const roster = [{ name: "ปัณณ์" }];
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่องกันเลยตอนที่หนึ่ง" }]),
      draftedItem(2, [{ speaker: "ปัณณ์", line: "ผมเพิ่งเข้าเรื่องตอนที่สอง" }]),
      draftedItem(3, [{ speaker: "เอก", line: "ดำเนินเรื่องต่อตอนที่สาม" }]),
      draftedItem(4, [{ speaker: "เอก", line: "ดำเนินเรื่องต่อตอนที่สี่" }]),
      draftedItem(5, [{ speaker: "เอก", line: "จบเรื่องกันตอนที่ห้า" }]),
    ];

    const withoutProfile = analyzeSeasonDramaturgy(items, roster);
    expect(findingsOfKind(withoutProfile, "key_character_late_intro")).toHaveLength(0);

    const withUltraShortProfile = analyzeSeasonDramaturgy(items, roster, resolveVerticalDramaFormatProfile(5));
    const lateIntro = findingsOfKind(withUltraShortProfile, "key_character_late_intro");
    expect(lateIntro).toHaveLength(1);
    expect(lateIntro[0].evidenceEpisodes).toEqual([2]);
  });

  it("ultra_short tightens antagonist_tactic_repetition to a 2-episode streak (vs. the legacy 3-episode streak)", () => {
    // 3 DISTINCT tactics overall (meets VD_DRAMATURGY_MIN_TACTIC_VARIETY) so
    // only the STREAK sub-check is in play here, not the separate variety
    // sub-check — mirrors the existing golden fixture "does NOT flag a
    // same-tag streak of only 2" above, which uses this exact shape.
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(2, [], { antagonist_tactics: ["ขู่"] }),
      draftedItem(3, [], { antagonist_tactics: ["สลับเอกสาร"] }),
      draftedItem(4, [], { antagonist_tactics: ["ปิดปาก"] }),
    ];

    const withoutProfile = analyzeSeasonDramaturgy(items);
    expect(findingsOfKind(withoutProfile, "antagonist_tactic_repetition")).toHaveLength(0);

    const withUltraShortProfile = analyzeSeasonDramaturgy(items, [], resolveVerticalDramaFormatProfile(3));
    const repetition = findingsOfKind(withUltraShortProfile, "antagonist_tactic_repetition");
    expect(repetition).toHaveLength(1);
    expect(repetition[0].evidenceEpisodes).toEqual([1, 2]);
  });

  it("ultra_short's character_agency check requires a decision BEFORE the finale, not merely 'ever'", () => {
    // ปราง speaks in every episode and has exactly one recorded decision —
    // but only in the FINALE (episode 3). The legacy "at least one, ever"
    // bar is satisfied (not flagged); the short-season "before the finale"
    // bar is not (flagged), since there is no runway left afterward to show
    // that decision's consequence.
    const roster = [{ name: "ปราง" }];
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItem(1, [{ speaker: "ปราง", line: "หนูยังไม่แน่ใจอะไรเลยตอนนี้" }]),
      draftedItem(2, [{ speaker: "ปราง", line: "หนูยังลังเลอยู่เลยตอนนี้" }]),
      draftedItem(3, [{ speaker: "ปราง", line: "หนูตัดสินใจแล้วในที่สุด" }], {
        character_decisions: [{ character: "ปราง", decision: "เลือกที่จะบอกความจริงกับตำรวจ" }],
      }),
    ];

    const withoutProfile = analyzeSeasonDramaturgy(items, roster);
    expect(findingsOfKind(withoutProfile, "character_agency_zero_decisions")).toHaveLength(0);

    const withUltraShortProfile = analyzeSeasonDramaturgy(items, roster, resolveVerticalDramaFormatProfile(3));
    const agency = findingsOfKind(withUltraShortProfile, "character_agency_zero_decisions");
    expect(agency).toHaveLength(1);
    expect(agency[0].evidenceEpisodes).toEqual([1, 2, 3]);
  });
});

/* -------------------------------------------------------------------------- */
/* Tolerant per-item readers                                                  */
/* -------------------------------------------------------------------------- */

describe("W11.5 tolerant readers — absent/malformed never throw", () => {
  it("readItemAntagonistTactics/readItemCharacterDecisions/readItemWorldRules default to [] when absent or malformed", () => {
    const bare = { episodeNumber: 1, workingTitle: "E", logline: "L", keyBeats: ["b"] } as StoredEpisodeBreakdownItem;
    expect(readItemAntagonistTactics(bare)).toEqual([]);
    expect(readItemCharacterDecisions(bare)).toEqual([]);
    expect(readItemWorldRules(bare)).toEqual([]);

    const malformed = { ...bare, antagonist_tactics: [123], character_decisions: "nope", world_rules: [{}] } as unknown as StoredEpisodeBreakdownItem;
    expect(readItemAntagonistTactics(malformed)).toEqual([]);
    expect(readItemCharacterDecisions(malformed)).toEqual([]);
    expect(readItemWorldRules(malformed)).toEqual([]);
  });

  it("readItemProtagonistStake/readItemPricePaid default to undefined when absent, blank, or malformed", () => {
    const bare = { episodeNumber: 1, workingTitle: "E", logline: "L", keyBeats: ["b"] } as StoredEpisodeBreakdownItem;
    expect(readItemProtagonistStake(bare)).toBeUndefined();
    expect(readItemPricePaid(bare)).toBeUndefined();

    const blank = { ...bare, protagonist_stake: "   ", price_paid: "" } as StoredEpisodeBreakdownItem;
    expect(readItemProtagonistStake(blank)).toBeUndefined();
    expect(readItemPricePaid(blank)).toBeUndefined();

    const real = { ...bare, protagonist_stake: "เหตุผลส่วนตัว", price_paid: "ราคาที่ต้องจ่าย" } as StoredEpisodeBreakdownItem;
    expect(readItemProtagonistStake(real)).toBe("เหตุผลส่วนตัว");
    expect(readItemPricePaid(real)).toBe("ราคาที่ต้องจ่าย");
  });

  it("readBibleRefinedCharacters reads bible.refinedCharacters down to {name} and tolerates absence/malformed shapes", () => {
    expect(readBibleRefinedCharacters(null)).toEqual([]);
    expect(readBibleRefinedCharacters({})).toEqual([]);
    expect(readBibleRefinedCharacters({ refinedCharacters: "nope" })).toEqual([]);
    expect(
      readBibleRefinedCharacters({
        refinedCharacters: [
          { name: "เอก", role: "lead", description: "protagonist" },
          { name: "ปราง", role: "supporting", description: "victim" },
        ],
      }),
    ).toEqual([{ name: "เอก" }, { name: "ปราง" }]);
  });
});

