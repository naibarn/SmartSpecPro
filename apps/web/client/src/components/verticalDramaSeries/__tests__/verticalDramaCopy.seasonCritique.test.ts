import { describe, expect, it } from "vitest";

import {
  SEASON_CRITIQUE_FINDING_KINDS,
  seasonCritiqueApplyFooterText,
  seasonCritiqueApplySuccessText,
  seasonCritiqueEvidenceEpisodesText,
  seasonCritiqueFindingKindCopy,
  seasonCritiqueFindingKindLabel,
  seasonCritiqueRejectedLineText,
  seasonCritiqueScoreText,
  verticalDramaCopy,
  pickCopy,
} from "@/components/verticalDramaSeries/verticalDramaCopy";

/**
 * Dramaturgy critic (W11.5, added 2026-07-08) — Copy Contract coverage for
 * `VerticalDramaSeasonCritiqueCard`'s interpolated strings + the 8
 * golden-critique finding-kind labels + "other".
 */

describe("SEASON_CRITIQUE_FINDING_KINDS", () => {
  it("has exactly the 9 critique kinds plus 'other', in order (8 golden + tie_in_distribution from task #22)", () => {
    expect(SEASON_CRITIQUE_FINDING_KINDS).toEqual([
      "protagonist_no_stake",
      "world_rules_undefined",
      "key_character_late_intro",
      "character_agency_zero_decisions",
      "antagonist_tactic_repetition",
      "finale_no_price_paid",
      "on_the_nose_dialogue",
      "info_heavy_low_action",
      "tie_in_distribution",
      "other",
    ]);
  });

  it("has a bilingual label for every kind — no gaps", () => {
    for (const kind of SEASON_CRITIQUE_FINDING_KINDS) {
      expect(seasonCritiqueFindingKindCopy[kind].th.length).toBeGreaterThan(0);
      expect(seasonCritiqueFindingKindCopy[kind].en.length).toBeGreaterThan(0);
    }
  });
});

describe("seasonCritiqueFindingKindLabel", () => {
  it("returns the Thai label for a known kind", () => {
    expect(seasonCritiqueFindingKindLabel("th", "key_character_late_intro")).toBe(
      "ตัวละครสำคัญออกตัวช้าเกินไป",
    );
    expect(seasonCritiqueFindingKindLabel("th", "antagonist_tactic_repetition")).toBe(
      "ตัวร้ายใช้กลวิธีซ้ำเดิม",
    );
  });

  it("returns the English label for a known kind", () => {
    expect(seasonCritiqueFindingKindLabel("en", "finale_no_price_paid")).toBe(
      "The finale resolves without any real cost",
    );
  });

  it("falls back to the raw code for an unknown kind (defensive, never throws)", () => {
    expect(seasonCritiqueFindingKindLabel("th", "not_a_real_kind")).toBe("not_a_real_kind");
  });
});

describe("seasonCritiqueScoreText", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(seasonCritiqueScoreText("th", 7)).toBe("คะแนนรวม 7/10");
  });

  it("renders an English equivalent", () => {
    expect(seasonCritiqueScoreText("en", 7)).toBe("Overall score 7/10");
  });
});

describe("seasonCritiqueEvidenceEpisodesText", () => {
  it("sorts and joins episode numbers ascending in Thai", () => {
    expect(seasonCritiqueEvidenceEpisodesText("th", [5, 2, 4])).toBe("ตอนที่ 2, 4, 5");
  });

  it("pluralizes 'Episode(s)' in English", () => {
    expect(seasonCritiqueEvidenceEpisodesText("en", [3])).toBe("Episode 3");
    expect(seasonCritiqueEvidenceEpisodesText("en", [3, 4])).toBe("Episodes 3, 4");
  });
});

describe("seasonCritiqueApplyFooterText", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(seasonCritiqueApplyFooterText("th", 3)).toBe("ปรับตามคำวิจารณ์ (3 ข้อ, มีค่าใช้จ่าย)");
  });

  it("pluralizes 'item(s)' in English", () => {
    expect(seasonCritiqueApplyFooterText("en", 1)).toBe("Apply the critique (1 item, incurs a cost)");
    expect(seasonCritiqueApplyFooterText("en", 2)).toBe("Apply the critique (2 items, incurs a cost)");
  });
});

describe("seasonCritiqueApplySuccessText", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(seasonCritiqueApplySuccessText("th", 2)).toBe("ปรับปรุงแล้ว 2 ตอน");
  });
});

describe("seasonCritiqueRejectedLineText", () => {
  it("renders 'ตอนที่ {n}: {reason}' in Thai", () => {
    expect(seasonCritiqueRejectedLineText("th", 4, "การแก้ไขทำให้เกิดปัญหาใหม่")).toBe(
      "ตอนที่ 4: การแก้ไขทำให้เกิดปัญหาใหม่",
    );
  });
});

describe("static dictionary entries", () => {
  it("exposes the primary CTA labels in both languages", () => {
    expect(pickCopy("th", verticalDramaCopy.seasonCritiqueCta)).toBe("วิจารณ์ซีซั่นนี้ (AI)");
    expect(pickCopy("th", verticalDramaCopy.seasonCritiqueRerunCta)).toBe("วิจารณ์ใหม่");
    expect(pickCopy("en", verticalDramaCopy.seasonCritiqueCta)).toBe("Critique this season (AI)");
  });
});
