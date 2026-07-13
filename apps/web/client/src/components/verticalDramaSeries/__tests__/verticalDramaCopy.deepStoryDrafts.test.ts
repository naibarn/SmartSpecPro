import { describe, expect, it } from "vitest";

import {
  deepStoryDraftsCallRoundsText,
  deepStoryDraftsCliffhangerText,
  deepStoryDraftsDialogueLineText,
  deepStoryDraftsExtendCtaText,
  deepStoryDraftsFormatProfileChipText,
  deepStoryDraftsGeneratedSuccessText,
  deepStoryDraftsHorizonCountText,
  deepStoryDraftsModePremiumHintText,
  deepStoryDraftsPartialWarningText,
  deepStoryDraftsPremiumDimensionCopy,
  deepStoryDraftsPremiumDimensionLabel,
  deepStoryDraftsScopeKeepHintText,
  deepStoryDraftsScorecardBelowFloorDimText,
  deepStoryDraftsScorecardOverallBadgeText,
  deepStoryDraftsShotSummaryLabel,
  deepStoryDraftsSilenceIntentCopy,
  deepStoryDraftsSilenceIntentLabel,
  deepStoryDraftsSpeechSecondsBadgeText,
  deepStoryDraftsSummaryText,
  formatPremiumDraftScore,
  manualDialogueEditLineGroupLabel,
  manualDialogueEditLiveSpeechSecondsText,
  manualDialogueEditSavedSuccessText,
  manualDialogueEditSavedWithWarningsText,
  manualDialogueEditViolationCopy,
  manualDialogueEditViolationLabel,
  PREMIUM_DRAFT_SCORE_DIMENSIONS,
  storyJobProgressText,
  verticalDramaCopy,
} from "@/components/verticalDramaSeries/verticalDramaCopy";
import { VERTICAL_DRAMA_SILENCE_INTENTS } from "@shared/verticalDramaSeries/contentBudget";
import type { VerticalDramaLineSpeakabilityViolationKind } from "@shared/verticalDramaSeries/dialogueQuality";

/**
 * Regression coverage for the W10-C (spec F131T) Copy Contract strings —
 * these MUST stay verbatim in Thai since `VerticalDramaDeepStoryDraftsPanel.tsx`
 * renders them directly.
 */
describe("deepStoryDraftsGeneratedSuccessText", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(deepStoryDraftsGeneratedSuccessText("th", 5)).toBe(
      "ร่างแล้ว 5 ตอนย่อย"
    );
  });

  it("renders an English equivalent with correct pluralization", () => {
    expect(deepStoryDraftsGeneratedSuccessText("en", 1)).toBe(
      "Drafted 1 Sub-episode"
    );
    expect(deepStoryDraftsGeneratedSuccessText("en", 5)).toBe(
      "Drafted 5 Sub-episodes"
    );
  });
});

describe("deepStoryDraftsPartialWarningText", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(deepStoryDraftsPartialWarningText("th", 7)).toBe(
      "ร่างสำเร็จบางส่วน (ถึงตอนย่อยที่ 7) — กดขยายเพื่อทำต่อ"
    );
  });
});

describe("deepStoryDraftsSummaryText", () => {
  it("renders the exact Copy Contract string in Thai", () => {
    expect(
      deepStoryDraftsSummaryText("th", {
        episodesWithDrafts: 3,
        totalEpisodes: 10,
        horizonEndEpisode: 3,
      })
    ).toBe("ร่างละเอียดแล้ว 3/10 ตอนย่อย (ถึงตอนย่อยที่ 3)");
  });

  it("omits the premium marker when `premium` is absent (byte-identical to before W11-B)", () => {
    expect(
      deepStoryDraftsSummaryText("th", {
        episodesWithDrafts: 5,
        totalEpisodes: 10,
        horizonEndEpisode: 5,
      })
    ).toBe("ร่างละเอียดแล้ว 5/10 ตอนย่อย (ถึงตอนย่อยที่ 5)");
  });

  it("appends '· โหมดพรีเมียม' when `premium` is true", () => {
    expect(
      deepStoryDraftsSummaryText("th", {
        episodesWithDrafts: 5,
        totalEpisodes: 10,
        horizonEndEpisode: 5,
        premium: true,
      })
    ).toBe("ร่างละเอียดแล้ว 5/10 ตอนย่อย (ถึงตอนย่อยที่ 5) · โหมดพรีเมียม");
  });

  it("appends the English premium marker equivalent", () => {
    expect(
      deepStoryDraftsSummaryText("en", {
        episodesWithDrafts: 5,
        totalEpisodes: 10,
        horizonEndEpisode: 5,
        premium: true,
      })
    ).toBe(
      "Drafted in detail: 5/10 Sub-episodes (through Sub-episode 5) · Premium mode"
    );
  });
});

describe("deepStoryDraftsHorizonCountText / deepStoryDraftsCallRoundsText", () => {
  it("renders the exact Copy Contract strings in Thai", () => {
    expect(deepStoryDraftsHorizonCountText("th", 10)).toBe(
      "จำนวนตอนย่อยที่จะร่าง: 10 ตอนย่อย"
    );
    expect(deepStoryDraftsCallRoundsText("th", 2)).toBe("จำนวนรอบเรียก: 2 รอบ");
  });
});

describe("deepStoryDraftsFormatProfileChipText (task #23)", () => {
  it("renders the exact ultra_short Thai Copy Contract string", () => {
    expect(
      deepStoryDraftsFormatProfileChipText("th", {
        tier: "ultra_short",
        nameTh: "ซีรีส์สั้นมาก",
        perEpisodeHookRule: { hookWithinSeconds: 3 },
      })
    ).toBe(
      "โปรไฟล์ความยาว: ซีรีส์สั้นมาก — ทุกตอนย่อยเปิดด้วย hook ใน 3 วิ / เนื้อแน่นไม่มีตอนเติม"
    );
  });

  it("renders the short-tier Thai string with its own name/seconds", () => {
    expect(
      deepStoryDraftsFormatProfileChipText("th", {
        tier: "short",
        nameTh: "ซีรีส์สั้น",
        perEpisodeHookRule: { hookWithinSeconds: 5 },
      })
    ).toBe(
      "โปรไฟล์ความยาว: ซีรีส์สั้น — ทุกตอนย่อยเปิดด้วย hook ใน 5 วิ / เนื้อแน่นไม่มีตอนเติม"
    );
  });

  it("renders an English variant deriving the tier name from `tier`, not a nameTh string", () => {
    const en = deepStoryDraftsFormatProfileChipText("en", {
      tier: "ultra_short",
      nameTh: "ซีรีส์สั้นมาก",
      perEpisodeHookRule: { hookWithinSeconds: 3 },
    });
    expect(en).toContain("ultra-short series");
    expect(en).toContain("3s");
    expect(en).not.toContain("ซีรีส์สั้นมาก");
  });
});

describe("deepStoryDraftsShotSummaryLabel", () => {
  it("renders the exact 'ช็อต N — {summary}' Copy Contract shape", () => {
    expect(deepStoryDraftsShotSummaryLabel("th", 3, "นางเอกเดินเข้าบ้าน")).toBe(
      "ช็อต 3 — นางเอกเดินเข้าบ้าน"
    );
  });
});

describe("deepStoryDraftsDialogueLineText", () => {
  it("renders the exact '{speaker}: {line}' template, matching the wizard's own", () => {
    expect(
      deepStoryDraftsDialogueLineText("th", "นางเอก", "ฉันจะไม่ยอมแพ้")
    ).toBe("นางเอก: ฉันจะไม่ยอมแพ้");
  });
});

describe("deepStoryDraftsCliffhangerText", () => {
  it("renders the exact 'จุดค้าง: {line}' Copy Contract shape", () => {
    expect(deepStoryDraftsCliffhangerText("th", "ประตูเปิดออกช้าๆ")).toBe(
      "จุดค้าง: ประตูเปิดออกช้าๆ"
    );
  });
});

describe("deepStoryDraftsSpeechSecondsBadgeText", () => {
  it("renders the exact 'บทพูดรวม {n} วิ' Copy Contract shape, rounded", () => {
    expect(deepStoryDraftsSpeechSecondsBadgeText("th", 12.6)).toBe(
      "บทพูดรวม 13 วิ"
    );
  });
});

describe("deepStoryDraftsSilenceIntentCopy / deepStoryDraftsSilenceIntentLabel", () => {
  it("has a bilingual entry for every canonical silence-intent code", () => {
    for (const intent of VERTICAL_DRAMA_SILENCE_INTENTS) {
      expect(
        deepStoryDraftsSilenceIntentCopy[intent].th.length
      ).toBeGreaterThan(0);
      expect(
        deepStoryDraftsSilenceIntentCopy[intent].en.length
      ).toBeGreaterThan(0);
    }
  });

  it("looks up a known intent in the requested language", () => {
    expect(deepStoryDraftsSilenceIntentLabel("th", "establishing")).toBe(
      deepStoryDraftsSilenceIntentCopy.establishing.th
    );
    expect(deepStoryDraftsSilenceIntentLabel("en", "establishing")).toBe(
      deepStoryDraftsSilenceIntentCopy.establishing.en
    );
  });
});

describe("deepStoryDraftsShotViewerToggle / badges", () => {
  it("matches the exact literal Copy Contract strings", () => {
    expect(verticalDramaCopy.deepStoryDraftsShotViewerToggle.th).toBe(
      "ดูร่าง 9 ช็อต + บทพูด"
    );
    expect(verticalDramaCopy.deepStoryDraftsDialogueCompleteBadge.th).toBe(
      "✓ บทพูดครบทุกช็อต"
    );
    expect(verticalDramaCopy.deepStoryDraftsSpeakableBadge.th).toBe(
      "✓ อ่านออกเสียงได้"
    );
  });
});

/**
 * Owner-reported fix (2026-07-08) — the extend CTA's label must always
 * reflect how many episodes THIS click will actually draft
 * (`min(5, totalEpisodes - horizonEndEpisode)`), computed by the caller
 * (`VerticalDramaDeepStoryDraftsPanel.tsx`'s `computeDeepDraftExtendCount`)
 * and passed in as `count`. Previously a hardcoded literal (`"ขยายร่างอีก 5
 * ตอน"`) that stayed "+5" even when fewer than 5 episodes remained.
 */
describe("deepStoryDraftsExtendCtaText", () => {
  it("renders the exact 'ขยายร่างอีก {n} ตอน' Copy Contract shape", () => {
    expect(deepStoryDraftsExtendCtaText("th", 5)).toBe("ขยายร่างอีก 5 ตอนย่อย");
    expect(deepStoryDraftsExtendCtaText("th", 1)).toBe("ขยายร่างอีก 1 ตอนย่อย");
  });

  it("renders an English equivalent with correct pluralization", () => {
    expect(deepStoryDraftsExtendCtaText("en", 1)).toBe(
      "Extend draft by 1 more Sub-episode"
    );
    expect(deepStoryDraftsExtendCtaText("en", 5)).toBe(
      "Extend draft by 5 more Sub-episodes"
    );
  });
});

/**
 * Consolidated primary action (kills the "which button do I press?"
 * confusion) — the ONE primary button + confirm-dialog scope radio that
 * replaces the old "Generate story"/"Regenerate" buttons and the deep-draft
 * card's own former separate "generate" CTA. See
 * `VerticalDramaDeepStoryDraftsPanel.tsx`'s `VerticalDramaDeepStoryDraftsActions`.
 */
describe("Consolidated primary action copy", () => {
  const keys = [
    "deepStoryDraftsGenerateFullCta",
    "deepStoryDraftsUpdateCta",
    "deepStoryDraftsScopeGroupLabel",
    "deepStoryDraftsScopeKeepLabel",
    "deepStoryDraftsScopeRewriteLabel",
    "deepStoryDraftsScopeRewriteHint",
    "deepStoryDraftsChainStoryProgress",
    "deepStoryDraftsChainDeepProgress",
  ] as const;

  it("has non-empty bilingual (th/en) entries for every new key", () => {
    for (const key of keys) {
      expect(verticalDramaCopy[key].th.length).toBeGreaterThan(0);
      expect(verticalDramaCopy[key].en.length).toBeGreaterThan(0);
    }
  });

  it("matches the exact literal Copy Contract strings (Thai)", () => {
    expect(verticalDramaCopy.deepStoryDraftsGenerateFullCta.th).toBe(
      "สร้างเนื้อเรื่องเต็ม + ร่างละเอียดทุกตอนย่อย"
    );
    expect(verticalDramaCopy.deepStoryDraftsUpdateCta.th).toBe(
      "อัปเดตเนื้อเรื่องละเอียดทุกตอนย่อย (9 ช็อต + บทพูด)"
    );
    expect(verticalDramaCopy.deepStoryDraftsScopeKeepLabel.th).toBe(
      "เก็บโครงเรื่องเดิม แล้วเติม/อัปเดตร่างละเอียด"
    );
    expect(verticalDramaCopy.deepStoryDraftsScopeRewriteLabel.th).toBe(
      "คิดโครงเรื่องใหม่ทั้งหมด แล้วร่างละเอียดต่อ"
    );
    expect(verticalDramaCopy.deepStoryDraftsScopeRewriteHint.th).toBe(
      "เริ่มคิดเรื่องใหม่ทั้งหมด ของเดิมถูกแทนที่ (ร่างเก่ายังย้อนดูได้)"
    );
    expect(verticalDramaCopy.deepStoryDraftsChainStoryProgress.th).toBe(
      "กำลังคิดโครงเรื่องใหม่…"
    );
    expect(verticalDramaCopy.deepStoryDraftsChainDeepProgress.th).toBe(
      "กำลังร่างละเอียด…"
    );
  });
});

describe("deepStoryDraftsScopeKeepHintText", () => {
  it("interpolates the real episode count rather than a hardcoded example number", () => {
    expect(deepStoryDraftsScopeKeepHintText("th", 10)).toBe(
      "โครง 10 ตอนย่อยยังเหมือนเดิม เพิ่มบทละเอียดให้ทุกตอนย่อย"
    );
    expect(deepStoryDraftsScopeKeepHintText("th", 6)).toBe(
      "โครง 6 ตอนย่อยยังเหมือนเดิม เพิ่มบทละเอียดให้ทุกตอนย่อย"
    );
  });

  it("renders a non-empty English equivalent", () => {
    expect(deepStoryDraftsScopeKeepHintText("en", 10).length).toBeGreaterThan(
      0
    );
  });
});

/**
 * Premium multi-round drafts (W11-B) — quality-mode picker in the confirm
 * dialog + per-episode scorecard badges. See
 * `VerticalDramaDeepStoryDraftsPanel.tsx`'s mode `RadioGroup` and
 * `VerticalDramaDeepStoryDraftEpisodeDetail`'s scorecard block.
 */
describe("Premium mode-picker copy (W11-B)", () => {
  const keys = [
    "deepStoryDraftsModeGroupLabel",
    "deepStoryDraftsModeStandardLabel",
    "deepStoryDraftsModeStandardHint",
    "deepStoryDraftsModePremiumLabel",
    "deepStoryDraftsExtendPremiumCheckboxLabel",
    "deepStoryDraftsScorecardBelowFloorToggle",
  ] as const;

  it("has non-empty bilingual (th/en) entries for every new key", () => {
    for (const key of keys) {
      expect(verticalDramaCopy[key].th.length).toBeGreaterThan(0);
      expect(verticalDramaCopy[key].en.length).toBeGreaterThan(0);
    }
  });

  it("matches the literal 'มาตรฐาน (เร็ว ประหยัด)' / 'คิดหลายรอบ (พรีเมียม)' Copy Contract labels", () => {
    expect(verticalDramaCopy.deepStoryDraftsModeStandardLabel.th).toBe(
      "มาตรฐาน (เร็ว ประหยัด)"
    );
    expect(verticalDramaCopy.deepStoryDraftsModePremiumLabel.th).toBe(
      "คิดหลายรอบ (พรีเมียม)"
    );
  });
});

describe("deepStoryDraftsModePremiumHintText", () => {
  it("renders the exact 'แตก 3 มุมเขียน ตรวจ ซ่อมอัตโนมัติ (~{n} ครั้งเรียก)' Copy Contract shape", () => {
    expect(deepStoryDraftsModePremiumHintText("th", 8)).toBe(
      "แตก 3 มุมเขียน ตรวจ ซ่อมอัตโนมัติ (~8 ครั้งเรียก)"
    );
  });

  it("renders a non-empty English equivalent carrying the same call estimate", () => {
    const text = deepStoryDraftsModePremiumHintText("en", 8);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("8");
  });
});

describe("formatPremiumDraftScore", () => {
  it("renders a whole number without a decimal point", () => {
    expect(formatPremiumDraftScore(4)).toBe("4");
    expect(formatPremiumDraftScore(5)).toBe("5");
  });

  it("rounds to at most 1 decimal place, trimming a trailing .0", () => {
    expect(formatPremiumDraftScore(4.04)).toBe("4");
    expect(formatPremiumDraftScore(3.333)).toBe("3.3");
    expect(formatPremiumDraftScore(4.5)).toBe("4.5");
  });

  it("never throws on non-finite input", () => {
    expect(formatPremiumDraftScore(Number.NaN)).toBe("0");
  });
});

describe("deepStoryDraftsScorecardOverallBadgeText", () => {
  it("renders the exact 'คะแนน {overall}/5' Copy Contract shape", () => {
    expect(deepStoryDraftsScorecardOverallBadgeText("th", 4)).toBe("คะแนน 4/5");
  });

  it("renders a non-empty English equivalent", () => {
    expect(
      deepStoryDraftsScorecardOverallBadgeText("en", 4).length
    ).toBeGreaterThan(0);
  });
});

describe("PREMIUM_DRAFT_SCORE_DIMENSIONS / deepStoryDraftsPremiumDimensionCopy", () => {
  it("has exactly the 8 owner-approved dimensions, in prompt/response order", () => {
    expect(PREMIUM_DRAFT_SCORE_DIMENSIONS).toEqual([
      "hook_strength",
      "reversal_sharpness",
      "emotion_variety",
      "dialogue_naturalness",
      "pacing",
      "cliffhanger_strength",
      "continuity_with_recap",
      "season_cohesion",
    ]);
  });

  it("has a non-empty bilingual label for every dimension", () => {
    for (const dimension of PREMIUM_DRAFT_SCORE_DIMENSIONS) {
      expect(
        deepStoryDraftsPremiumDimensionCopy[dimension].th.length
      ).toBeGreaterThan(0);
      expect(
        deepStoryDraftsPremiumDimensionCopy[dimension].en.length
      ).toBeGreaterThan(0);
    }
  });

  it("labels 'pacing' as 'จังหวะเรื่อง' (matches the below-floor Copy Contract example)", () => {
    expect(deepStoryDraftsPremiumDimensionCopy.pacing.th).toBe("จังหวะเรื่อง");
  });
});

describe("deepStoryDraftsPremiumDimensionLabel", () => {
  it("looks up a known dimension in the requested language", () => {
    expect(deepStoryDraftsPremiumDimensionLabel("th", "pacing")).toBe(
      "จังหวะเรื่อง"
    );
    expect(deepStoryDraftsPremiumDimensionLabel("en", "pacing")).toBe(
      deepStoryDraftsPremiumDimensionCopy.pacing.en
    );
  });

  it("falls back to the raw code for an unknown dimension, never throws", () => {
    expect(
      deepStoryDraftsPremiumDimensionLabel("th", "not_a_real_dimension")
    ).toBe("not_a_real_dimension");
  });
});

describe("deepStoryDraftsScorecardBelowFloorDimText", () => {
  it("renders the exact 'จุดที่ยังต่ำ: จังหวะเรื่อง 2/5' Copy Contract example", () => {
    expect(deepStoryDraftsScorecardBelowFloorDimText("th", "pacing", 2)).toBe(
      "จุดที่ยังต่ำ: จังหวะเรื่อง 2/5"
    );
  });

  it("renders a non-empty English equivalent", () => {
    const text = deepStoryDraftsScorecardBelowFloorDimText("en", "pacing", 2);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("2/5");
  });
});

/**
 * Manual dialogue edits (W10.5) — inline per-shot editor Copy Contract
 * strings for `VerticalDramaDeepStoryDraftEpisodeDetail`'s new editor. See
 * that component's `ManualDialogueEditShotForm`.
 */
describe("Manual dialogue edit copy (W10.5)", () => {
  const staticKeys = [
    "manualDialogueEditCta",
    "manualDialogueEditCancel",
    "manualDialogueEditSave",
    "manualDialogueEditSaving",
    "manualDialogueEditAddLine",
    "manualDialogueEditMaxLinesReached",
    "manualDialogueEditRemoveLine",
    "manualDialogueEditSpeakerLabel",
    "manualDialogueEditLineLabel",
    "manualDialogueEditDeliveryPlaceholder",
    "manualDialogueEditLineRequired",
    "manualDialogueEditApplyCleaned",
    "manualDialogueEditEditedBadge",
    "manualDialogueEditAlreadyCreatedHint",
    "manualDialogueEditSilenceRemovedInfo",
    "manualDialogueEditSaveError",
  ] as const;

  it("has non-empty bilingual (th/en) entries for every new key", () => {
    for (const key of staticKeys) {
      expect(verticalDramaCopy[key].th.length).toBeGreaterThan(0);
      expect(verticalDramaCopy[key].en.length).toBeGreaterThan(0);
    }
  });

  it("matches the exact literal Copy Contract strings from the task brief (Thai)", () => {
    expect(verticalDramaCopy.manualDialogueEditCta.th).toBe("แก้บทพูด");
    expect(verticalDramaCopy.manualDialogueEditDeliveryPlaceholder.th).toBe(
      "อารมณ์/วิธีพูด"
    );
    expect(verticalDramaCopy.manualDialogueEditApplyCleaned.th).toBe(
      "ใช้เวอร์ชันที่แก้ให้"
    );
    expect(verticalDramaCopy.manualDialogueEditEditedBadge.th).toBe("แก้แล้ว");
    expect(verticalDramaCopy.manualDialogueEditAlreadyCreatedHint.th).toBe(
      "ตอนย่อยนี้ถูกสร้างแล้ว — บทที่แก้จะถูกใช้เมื่อสร้าง/เกลี่ยบทของตอนย่อยนั้นอีกครั้ง"
    );
    expect(verticalDramaCopy.manualDialogueEditSilenceRemovedInfo.th).toBe(
      "นำป้ายช็อตภาพล้วนออก เพราะมีบทพูดแล้ว"
    );
  });
});

describe("manualDialogueEditSavedSuccessText", () => {
  it("renders the exact 'บันทึกบทช็อต {n} แล้ว' Copy Contract shape", () => {
    expect(manualDialogueEditSavedSuccessText("th", 3)).toBe(
      "บันทึกบทช็อต 3 แล้ว"
    );
  });

  it("renders a non-empty English equivalent carrying the shot number", () => {
    const text = manualDialogueEditSavedSuccessText("en", 3);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("3");
  });
});

describe("manualDialogueEditSavedWithWarningsText", () => {
  it("renders the exact 'บันทึกแล้ว แต่ยังมี {k} จุดที่อ่านออกเสียงยาก' Copy Contract shape", () => {
    expect(manualDialogueEditSavedWithWarningsText("th", 2)).toBe(
      "บันทึกแล้ว แต่ยังมี 2 จุดที่อ่านออกเสียงยาก"
    );
  });

  it("renders an English equivalent with correct pluralization", () => {
    expect(manualDialogueEditSavedWithWarningsText("en", 1)).toBe(
      "Saved, but 1 spot is still hard to read aloud"
    );
    expect(manualDialogueEditSavedWithWarningsText("en", 2)).toBe(
      "Saved, but 2 spots are still hard to read aloud"
    );
  });
});

describe("manualDialogueEditLiveSpeechSecondsText", () => {
  it("renders the exact 'บทพูดรวม {live} วิ (เป้า {target} วิ)' Copy Contract shape, both rounded", () => {
    expect(manualDialogueEditLiveSpeechSecondsText("th", 12.6, 5.44)).toBe(
      "บทพูดรวม 13 วิ (เป้า 5 วิ)"
    );
  });

  it("renders a non-empty English equivalent carrying both numbers", () => {
    const text = manualDialogueEditLiveSpeechSecondsText("en", 12.6, 5.44);
    expect(text).toContain("13");
    expect(text).toContain("5");
  });
});

describe("manualDialogueEditLineGroupLabel", () => {
  it("renders the exact 'บรรทัดที่ {n}' Copy Contract shape", () => {
    expect(manualDialogueEditLineGroupLabel("th", 1)).toBe("บรรทัดที่ 1");
  });

  it("renders a non-empty English equivalent carrying the line number", () => {
    expect(manualDialogueEditLineGroupLabel("en", 2)).toContain("2");
  });
});

describe("manualDialogueEditViolationCopy / manualDialogueEditViolationLabel", () => {
  const kinds: VerticalDramaLineSpeakabilityViolationKind[] = [
    "wrapping_quotes",
    "parenthetical_stage_direction",
    "unspeakable_symbol",
    "em_dash",
    "ellipsis_run",
    "emoji",
    "nonverbal_line",
  ];

  it("has a non-empty bilingual entry for every violation kind", () => {
    for (const kind of kinds) {
      expect(manualDialogueEditViolationCopy[kind].th.length).toBeGreaterThan(
        0
      );
      expect(manualDialogueEditViolationCopy[kind].en.length).toBeGreaterThan(
        0
      );
    }
  });

  it("looks up a known violation kind in the requested language", () => {
    expect(manualDialogueEditViolationLabel("th", "wrapping_quotes")).toBe(
      manualDialogueEditViolationCopy.wrapping_quotes.th
    );
    expect(manualDialogueEditViolationLabel("en", "wrapping_quotes")).toBe(
      manualDialogueEditViolationCopy.wrapping_quotes.en
    );
  });

  it("falls back to the raw code for an unknown kind, never throws", () => {
    expect(manualDialogueEditViolationLabel("th", "not_a_real_kind")).toBe(
      "not_a_real_kind"
    );
  });
});

/**
 * Async story jobs (#28, added 2026-07-08) — `storyJobProgressText` is the
 * ONLY place `{phase, chunkIndex, chunkCount, episodesDone}` events from
 * `services/verticalDramaStoryBible.ts`'s `VdStoryDraftProgressEvent` (via
 * the job status poll) become the "รอบเรียก {i}/{n} · {phase}" copy the
 * generate/extend/critique/apply CTAs and their aria-live progress regions
 * render.
 */
describe("storyJobProgressText", () => {
  it("reads null/undefined progress as 'queued' (a freshly-enqueued or just-resumed job with no snapshot yet)", () => {
    expect(storyJobProgressText("th", null)).toBe("กำลังอยู่ในคิว…");
    expect(storyJobProgressText("th", undefined)).toBe("กำลังอยู่ในคิว…");
    expect(storyJobProgressText("en", null)).toBe("Queued…");
  });

  it("renders 'รอบเรียก {i}/{n} · {phase}' when chunkIndex/chunkCount are both present", () => {
    expect(
      storyJobProgressText("th", {
        phase: "draft",
        chunkIndex: 2,
        chunkCount: 4,
      })
    ).toBe("รอบเรียก 2/4 · กำลังร่าง");
    expect(
      storyJobProgressText("en", {
        phase: "review",
        chunkIndex: 1,
        chunkCount: 3,
      })
    ).toBe("Call 1/3 · Reviewing");
  });

  it("omits the round prefix when chunkIndex or chunkCount is absent (not chunk-scoped, e.g. the premium season sweep)", () => {
    expect(storyJobProgressText("th", { phase: "outline" })).toBe(
      "กำลังคิดโครง"
    );
    expect(
      storyJobProgressText("th", { phase: "outline", chunkIndex: 1 })
    ).toBe("กำลังคิดโครง");
  });

  it("renders the whole-season critique's single-call phase verbatim", () => {
    expect(storyJobProgressText("th", { phase: "reading" })).toBe(
      "กำลังอ่านทั้งซีซั่น…"
    );
    expect(storyJobProgressText("en", { phase: "reading" })).toBe(
      "Reading the whole season…"
    );
  });

  it("'fix' phase names the affected Sub-episode numbers, ascending, comma-joined", () => {
    expect(
      storyJobProgressText("th", { phase: "fix", episodesDone: [5, 2, 9] })
    ).toBe("กำลังซ่อมตอนย่อย 2, 5, 9");
    expect(
      storyJobProgressText("en", { phase: "fix", episodesDone: [3] })
    ).toBe("Fixing Sub-episode 3");
  });

  it("'fix' phase falls back to the bare prefix when episodesDone is absent/empty", () => {
    expect(storyJobProgressText("th", { phase: "fix" })).toBe(
      "กำลังซ่อมตอนย่อย"
    );
    expect(storyJobProgressText("th", { phase: "fix", episodesDone: [] })).toBe(
      "กำลังซ่อมตอนย่อย"
    );
  });

  it("'fix' phase combines the round prefix WITH the episode list when both are present (applySeasonCritique's own chunked shape)", () => {
    expect(
      storyJobProgressText("th", {
        phase: "fix",
        chunkIndex: 1,
        chunkCount: 2,
        episodesDone: [3, 4],
      })
    ).toBe("รอบเรียก 1/2 · กำลังซ่อมตอนย่อย 3, 4");
  });
});
