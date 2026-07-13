/**
 * Coverage for the 2026-07-08 W9-B "Pass Semantics — Content Completeness"
 * wave's copy layer (`verticalDramaWorkspaceCopy.ts`) — spec section-12
 * "Pass Semantics — Content Completeness", spec §14.1 rule 6b. Companion to
 * `VerticalDramaProductionWizard.test.tsx`'s "content completeness" +
 * "per-shot dialogue viewer" describe blocks (the rendering side of this
 * same wave) and `VerticalDramaDensityMeter.test.tsx`'s speakability-badge
 * suite. Concurrent W9-A landed the criteria/passState pieces for real
 * DURING this task (see git history) — every test below therefore uses the
 * REAL shared ids/values, no forward-compat casts needed at the copy layer.
 */
import { describe, expect, it } from "vitest";

import {
  vdCopy,
  vdDialogueIssueLabel,
  vdWizardCriterionLabel,
  vdWizardEvidenceIdValue,
  vdWizardIncompleteHeadline,
  vdWizardReasonLabel,
  vdWizardStepDisplayStatusLabel,
  VD_WIZARD_CRITERION_LABELS,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";

describe("vdWizardCriterionLabel — new content-completeness criterion ids (2026-07-08/W9-A)", () => {
  it("renders the exact task-specified plain-Thai label for each of the 7 new ids", () => {
    expect(vdWizardCriterionLabel("dialogue_every_shot", "th")).toBe(
      "ทุกช็อตมีบทพูด"
    );
    expect(vdWizardCriterionLabel("no_shot_over_length", "th")).toBe(
      "ไม่มีช็อตที่บทยาวเกินเวลา"
    );
    expect(vdWizardCriterionLabel("no_long_silence", "th")).toBe(
      "ไม่มีช่วงเงียบนานเกินไป"
    );
    expect(vdWizardCriterionLabel("all_lines_speakable", "th")).toBe(
      "ทุกประโยคอ่านออกเสียงได้จริง (ไม่มีสัญลักษณ์แปลก)"
    );
    expect(vdWizardCriterionLabel("image_prompts_all_shots", "th")).toBe(
      "ทุกช็อตมีคำสั่งสร้างภาพ (prompt ภาพ)"
    );
    expect(vdWizardCriterionLabel("video_prompts_all_shots", "th")).toBe(
      "ทุกช็อตมีคำสั่งสร้างวิดีโอ (prompt วิดีโอ)"
    );
    expect(
      vdWizardCriterionLabel("no_unresolved_recommended_repairs", "th")
    ).toBe("จัดการรายการซ่อมที่แนะนำครบแล้ว");
  });

  it("has a non-empty EN label for each of the 7 new ids too", () => {
    for (const id of [
      "dialogue_every_shot",
      "no_shot_over_length",
      "no_long_silence",
      "all_lines_speakable",
      "image_prompts_all_shots",
      "video_prompts_all_shots",
      "no_unresolved_recommended_repairs",
    ] as const) {
      expect(vdWizardCriterionLabel(id, "en").length).toBeGreaterThan(0);
      expect(vdWizardCriterionLabel(id, "en")).not.toBe(id);
    }
  });

  it("keeps every pre-existing criterion id's label byte-identical (no regression from the merge)", () => {
    expect(VD_WIZARD_CRITERION_LABELS.shots_9.th).toBe(
      "สตอรีบอร์ดมีครบ 9 ช็อต"
    );
    expect(VD_WIZARD_CRITERION_LABELS.script_exists.th).toBe(
      "สร้างบทตอนย่อยแล้ว"
    );
    expect(VD_WIZARD_CRITERION_LABELS.final_assembly_completed.th).toBe(
      "ประกอบตอนย่อยแล้ว"
    );
  });

  it("falls back to the raw id (never throws) for a genuinely unknown criterion id", () => {
    expect(vdWizardCriterionLabel("some_future_unknown_criterion", "th")).toBe(
      "some_future_unknown_criterion"
    );
  });
});

describe("vdWizardIncompleteHeadline — 'ขั้นนี้ยังไม่ครบ — เหลือ: {items}' (section-12 Pass Semantics rule 1)", () => {
  it("lists only the unmet (passed !== true) criteria, joined, using each criterion's real label", () => {
    const headline = vdWizardIncompleteHeadline(
      [
        { id: "script_exists", passed: true },
        { id: "dialogue_every_shot", passed: false },
        { id: "all_lines_speakable", passed: null },
      ],
      "th"
    );
    expect(headline).toBe(
      "ขั้นนี้ยังไม่ครบ — เหลือ: ทุกช็อตมีบทพูด, ทุกประโยคอ่านออกเสียงได้จริง (ไม่มีสัญลักษณ์แปลก)"
    );
  });

  it("treats passed: null (not yet evaluable, e.g. a later-step artifact) as unmet, same as passed: false", () => {
    const headline = vdWizardIncompleteHeadline(
      [{ id: "video_prompts_all_shots", passed: null }],
      "th"
    );
    expect(headline).toContain("ทุกช็อตมีคำสั่งสร้างวิดีโอ");
  });

  it("never lists a criterion whose passed is true", () => {
    const headline = vdWizardIncompleteHeadline(
      [
        { id: "shots_9", passed: true },
        { id: "beats_mapped", passed: true },
      ],
      "th"
    );
    expect(headline).not.toContain("สตอรีบอร์ดมีครบ 9 ช็อต");
    expect(headline).not.toContain("จุดประสงค์การเล่าเรื่อง");
  });

  it("falls back to the generic 'ขั้นนี้ยังไม่ครบ' sentence when criteria is empty (stale/hand-built fixture safety net)", () => {
    expect(vdWizardIncompleteHeadline([], "th")).toBe("ขั้นนี้ยังไม่ครบ");
    expect(vdWizardIncompleteHeadline([], "en")).toBe(
      vdCopy("en").wizardIncompleteHeadlineGeneric
    );
  });

  it("renders the EN template too, via the SAME criterion labels", () => {
    const headline = vdWizardIncompleteHeadline(
      [{ id: "dialogue_every_shot", passed: false }],
      "en"
    );
    expect(headline).toContain("Every shot has dialogue");
    expect(headline).toContain("still missing");
  });
});

describe("vdWizardStepDisplayStatusLabel — content-completeness combinations (2026-07-08/W9-A)", () => {
  it("passState 'incomplete' always shows 'ยังไม่ครบ', regardless of status", () => {
    expect(vdWizardStepDisplayStatusLabel("passed", "incomplete", "th")).toBe(
      "ยังไม่ครบ"
    );
  });

  it("status 'passed' + passState 'failed' shows the SAME 'ต้องซ่อมก่อน' text as an actual needs_repair step", () => {
    expect(vdWizardStepDisplayStatusLabel("passed", "failed", "th")).toBe(
      "ต้องซ่อมก่อน"
    );
    expect(vdWizardStepDisplayStatusLabel("passed", "failed", "th")).toBe(
      vdWizardStepDisplayStatusLabel("needs_repair", "failed", "th")
    );
  });

  it("never shows the plain 'ผ่านแล้ว' for either content-completeness combination", () => {
    expect(
      vdWizardStepDisplayStatusLabel("passed", "incomplete", "th")
    ).not.toBe("ผ่านแล้ว");
    expect(vdWizardStepDisplayStatusLabel("passed", "failed", "th")).not.toBe(
      "ผ่านแล้ว"
    );
  });

  it("a genuinely needs_repair/blocked step's own passState: 'failed' is untouched by the new branch (falls through to the plain status label, same as before this wave)", () => {
    expect(vdWizardStepDisplayStatusLabel("needs_repair", "failed", "th")).toBe(
      "ต้องซ่อมก่อน"
    );
    expect(vdWizardStepDisplayStatusLabel("blocked", "failed", "th")).toBe(
      "ติดขัด"
    );
  });

  it("byte-identical for every pre-existing combination this wave did not touch", () => {
    expect(vdWizardStepDisplayStatusLabel("passed", "passed", "th")).toBe(
      "ผ่านแล้ว"
    );
    expect(
      vdWizardStepDisplayStatusLabel("passed", "passed_with_warnings", "th")
    ).toBe("ผ่านแบบมีคำเตือน");
    expect(vdWizardStepDisplayStatusLabel("locked", undefined, "th")).toBe(
      "ล็อกอยู่"
    );
  });
});

describe("vdDialogueIssueLabel — VD_DIALOGUE_UNSPEAKABLE_SYMBOLS (landed for real, 2026-07-08/W9-A) + unknown-code safety", () => {
  it("renders the exact 'มีสัญลักษณ์ที่อ่านไม่ได้' label for VD_DIALOGUE_UNSPEAKABLE_SYMBOLS", () => {
    expect(vdDialogueIssueLabel("VD_DIALOGUE_UNSPEAKABLE_SYMBOLS", "th")).toBe(
      "มีสัญลักษณ์ที่อ่านไม่ได้"
    );
  });

  it("shares the exact same string as the density meter's own densityUnspeakableSymbolsBadge (single source of truth)", () => {
    expect(vdDialogueIssueLabel("VD_DIALOGUE_UNSPEAKABLE_SYMBOLS", "th")).toBe(
      vdCopy("th").densityUnspeakableSymbolsBadge
    );
    expect(vdDialogueIssueLabel("VD_DIALOGUE_UNSPEAKABLE_SYMBOLS", "en")).toBe(
      vdCopy("en").densityUnspeakableSymbolsBadge
    );
  });

  it("falls back to a short, non-empty, never-raw-code sentence for a genuinely unrecognized issue code (defensive — never crashes)", () => {
    const result = vdDialogueIssueLabel("VD_DIALOGUE_SOME_FUTURE_CODE", "th");
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toBe("VD_DIALOGUE_SOME_FUTURE_CODE");
    expect(result).toBe(vdCopy("th").dialogueIssueUnknownFallback);
  });

  it("every pre-existing known code still renders byte-identical text", () => {
    expect(vdDialogueIssueLabel("VD_DIALOGUE_EMPTY", "th")).toBe(
      "ช็อตนี้ไม่มีบทพูด"
    );
    expect(vdDialogueIssueLabel("VD_DIALOGUE_STAGE_DIRECTION", "th")).toBe(
      "เป็นคำสั่งฉาก ไม่ใช่บทพูด"
    );
  });
});

describe("2026-07-08 W9-B plain-language sweep — jargon removed, Copy Contract strings untouched", () => {
  it("VD_WIZARD_DIALOGUE_UNDERFILLED no longer uses the abstract 'ความหนาแน่น' (density) word, describes the concrete problem instead", () => {
    const label = vdWizardReasonLabel("VD_WIZARD_DIALOGUE_UNDERFILLED", "th");
    expect(label).not.toContain("ความหนาแน่น");
    expect(label).toBe(
      "แผนบทพูดมีปัญหาที่ต้องแก้ก่อน (บทน้อยไป หรือเงียบนานไป)"
    );
  });

  it("VD_WIZARD_ASSEMBLY_BLOCKED no longer opens with the ambiguous 'ตอนนี้' (reads as 'right now', not 'this episode')", () => {
    const label = vdWizardReasonLabel("VD_WIZARD_ASSEMBLY_BLOCKED", "th");
    expect(label.startsWith("ตอนนี้")).toBe(false);
    expect(label).toBe("ยังไม่พร้อมประกอบวิดีโอตอนย่อย");
    // Reuses the SAME phrase the assemble_episode CTA already uses.
    expect(label).toContain(vdCopy("th").wizardAssembleEpisode);
  });

  it("the density-forecast/no-dialogue-data messages read as plain, concrete Thai sentences (spot-check no leftover jargon tokens)", () => {
    const noDialogueData = vdCopy("th").wizardScriptNoDialogueDataMessage;
    expect(noDialogueData).not.toContain("ฝังบีต");
    expect(noDialogueData).not.toContain("ระบบวัดความหนาแน่น");
    expect(noDialogueData.length).toBeGreaterThan(0);
  });

  it("preserves every section-12 Copy Contract string VERBATIM (these must never be rewritten by the plain-language sweep)", () => {
    const t = vdCopy("th");
    expect(t.wizardNextUpLabel).toBe("ขั้นต่อไป");
    expect(t.wizardStatusNeedsRepairLabel).toBe("ต้องซ่อมก่อน");
    expect(t.wizardStatusPassedLabel).toBe("ผ่านแล้ว");
    expect(t.wizardCreditChipLabel).toBe("ใช้เครดิต");
    expect(t.repairWholeEpisodeScript).toBe("ซ่อมบททั้งตอนย่อย");
    expect(t.repairThisShotOnly).toBe("ซ่อมเฉพาะช็อตนี้");
    expect(t.generateRealVideoCta).toBe("สร้างวิดีโอจริง");
  });
});

describe("Density meter speakability badge copy (2026-07-08 W9-B, spec §14.1 rule 6b)", () => {
  it("has the exact expected Thai/English text", () => {
    expect(vdCopy("th").densityUnspeakableSymbolsBadge).toBe(
      "มีสัญลักษณ์ที่อ่านไม่ได้"
    );
    expect(vdCopy("en").densityUnspeakableSymbolsBadge).toBe(
      "Contains unreadable symbols"
    );
  });
});

describe("Per-shot dialogue preview copy (2026-07-08 W9-B, owner directive)", () => {
  it("has the exact expected Thai strings", () => {
    const t = vdCopy("th");
    expect(t.wizardDialoguePreviewTitle).toBe("บทพูดจริงรายช็อต");
    expect(t.wizardDialoguePreviewNoDialogueBadge).toBe("ไม่มีบทพูด");
    expect(t.wizardDialoguePreviewOverLengthBadge).toBe("ยาวเกินช็อต");
    expect(t.wizardDialoguePreviewShowMore).toBe("แสดงทั้งหมด");
    expect(t.wizardDialoguePreviewShowLess).toBe("ย่อ");
  });

  it("has non-empty EN equivalents", () => {
    const t = vdCopy("en");
    expect(t.wizardDialoguePreviewTitle.length).toBeGreaterThan(0);
    expect(t.wizardDialoguePreviewNoDialogueBadge.length).toBeGreaterThan(0);
    expect(t.wizardDialoguePreviewOverLengthBadge.length).toBeGreaterThan(0);
  });
});

describe("2026-07-08 acceptance-review fixes — copy layer", () => {
  it("fix #1 (HIGH false-positive): story_structure_complete renders the exact task-specified Thai label", () => {
    expect(vdWizardCriterionLabel("story_structure_complete", "th")).toBe(
      "เนื้อเรื่องครบ (จุดเปิดเรื่อง บีตเรื่อง จุดค้างท้ายตอนย่อย)"
    );
    expect(
      vdWizardCriterionLabel("story_structure_complete", "en").length
    ).toBeGreaterThan(0);
  });

  it("fix #3 (MEDIUM): dialogue_no_warning_issues renders the exact task-specified Thai label", () => {
    expect(vdWizardCriterionLabel("dialogue_no_warning_issues", "th")).toBe(
      "ไม่มีคำเตือนเรื่องบทพูดค้างอยู่"
    );
    expect(
      vdWizardCriterionLabel("dialogue_no_warning_issues", "en").length
    ).toBeGreaterThan(0);
  });

  it("fix #4 (dormant leak): every script_speech_coverage_* evidenceId renders real Thai text, never the raw coverageStatus enum string", () => {
    const rawEnumValues = [
      "in_range",
      "underfilled_warning",
      "underfilled_error",
      "no_dialogue_data",
    ];
    const ids = [
      "script_speech_coverage_in_range",
      "script_speech_coverage_underfilled_warning",
      "script_speech_coverage_underfilled_error",
      "script_speech_coverage_no_dialogue_data",
    ] as const;
    for (const id of ids) {
      const th = vdWizardEvidenceIdValue(id, undefined, "th");
      expect(th.value.length).toBeGreaterThan(0);
      for (const raw of rawEnumValues) expect(th.value).not.toBe(raw);
      const en = vdWizardEvidenceIdValue(id, undefined, "en");
      expect(en.value.length).toBeGreaterThan(0);
    }
    // The no_dialogue_data evidence value is the SAME single source of
    // truth the "with coverageDetail" rendering path already uses.
    expect(
      vdWizardEvidenceIdValue(
        "script_speech_coverage_no_dialogue_data",
        undefined,
        "th"
      ).value
    ).toBe(vdCopy("th").wizardScriptNoDialogueDataMessage);
  });

  it("fix #6 (LOW): VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED renders the exact task-specified Thai string, distinct from VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR", () => {
    const notReviewed = vdWizardReasonLabel(
      "VD_WIZARD_SCRIPT_QUALITY_NOT_REVIEWED",
      "th"
    );
    expect(notReviewed).toBe("ยังไม่ได้ตรวจคุณภาพบท — ตรวจก่อนสร้างภาพ");
    expect(notReviewed).not.toBe(
      vdWizardReasonLabel("VD_WIZARD_SCRIPT_QUALITY_BELOW_FLOOR", "th")
    );
  });
});
