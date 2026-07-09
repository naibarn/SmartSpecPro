/**
 * Coverage for the 2026-07-08 criteria-transparency wave's copy layer
 * (`verticalDramaWorkspaceCopy.ts`) — every new id -> label map has a
 * non-empty TH + EN entry, and every localized function renders REAL text,
 * never a raw machine id / enum / English passthrough. Companion to
 * `productionWizard.test.ts` (the resolver side of this same wave) and
 * `verticalDramaWorkspaceCopy.wave5a.test.ts` (the earlier scriptCoverage
 * fix this wave generalizes).
 */
import { describe, expect, it } from "vitest";

import {
  vdCopy,
  vdWizardCriterionLabel,
  vdWizardCriterionStatusLabel,
  vdWizardEvidenceIdValue,
  vdWizardLoopStateEvidence,
  vdWizardLoopStateLabel,
  vdWizardOutOfScopeLine,
  vdWizardScorecardOverallEvidence,
  vdWizardStepDisplayStatusLabel,
  VD_WIZARD_CRITERION_LABELS,
  VD_WIZARD_EVIDENCE_LABELS,
  VD_WIZARD_LOOP_STATE_LABELS,
  VD_WIZARD_OUT_OF_SCOPE_ITEM_LABELS,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";
import {
  VERTICAL_DRAMA_WIZARD_CRITERION_IDS,
  VERTICAL_DRAMA_WIZARD_EVIDENCE_IDS,
  VERTICAL_DRAMA_WIZARD_OUT_OF_SCOPE_NOTE_IDS,
} from "@shared/verticalDramaSeries/productionWizard";
import { VERTICAL_DRAMA_QUALITY_LOOP_STATUSES } from "@shared/verticalDramaSeries/qualityPolicy";

describe("vdWizardCriterionLabel", () => {
  it("has a non-empty TH and EN label for every one of the fixed criterion ids", () => {
    for (const id of VERTICAL_DRAMA_WIZARD_CRITERION_IDS) {
      expect(VD_WIZARD_CRITERION_LABELS[id].th.length).toBeGreaterThan(0);
      expect(VD_WIZARD_CRITERION_LABELS[id].en.length).toBeGreaterThan(0);
      expect(vdWizardCriterionLabel(id, "th")).toBe(VD_WIZARD_CRITERION_LABELS[id].th);
    }
  });
});

describe("vdWizardCriterionStatusLabel — ✓/⚠/✗ as TEXT, never color-only", () => {
  it("maps true -> passed, false -> failed, null -> not-yet-checked, in both locales", () => {
    expect(vdWizardCriterionStatusLabel(true, "th")).toBe("ผ่าน");
    expect(vdWizardCriterionStatusLabel(false, "th")).toBe("ไม่ผ่าน");
    expect(vdWizardCriterionStatusLabel(null, "th")).toBe("ยังไม่ตรวจ");
    expect(vdWizardCriterionStatusLabel(true, "en")).toBe(vdCopy("en").wizardCriterionPassedLabel);
    expect(vdWizardCriterionStatusLabel(false, "en")).toBe(vdCopy("en").wizardCriterionFailedLabel);
    expect(vdWizardCriterionStatusLabel(null, "en")).toBe(vdCopy("en").wizardCriterionWarningLabel);
  });
});

describe("vdWizardOutOfScopeLine (owner confusions #1 and #3)", () => {
  it("renders the exact expected Thai sentence for dialogue_later_step -> dialogue_audio", () => {
    const line = vdWizardOutOfScopeLine({ id: "dialogue_later_step", laterStepId: "dialogue_audio" }, "th");
    expect(line).toBe("สิ่งที่ยังไม่ตรวจในขั้นนี้: บทพูดรายช็อต — จะทำที่ขั้น 'บทพูด/เสียง'");
  });

  it("renders the exact expected Thai sentence for prompts_later_step -> video_prompts", () => {
    const line = vdWizardOutOfScopeLine({ id: "prompts_later_step", laterStepId: "video_prompts" }, "th");
    expect(line).toBe("สิ่งที่ยังไม่ตรวจในขั้นนี้: พรอมต์วิดีโอ — จะทำที่ขั้น 'พรอมต์วิดีโอ'");
  });

  it("has a non-empty TH and EN item label for every out-of-scope note id", () => {
    for (const id of VERTICAL_DRAMA_WIZARD_OUT_OF_SCOPE_NOTE_IDS) {
      expect(VD_WIZARD_OUT_OF_SCOPE_ITEM_LABELS[id].th.length).toBeGreaterThan(0);
      expect(VD_WIZARD_OUT_OF_SCOPE_ITEM_LABELS[id].en.length).toBeGreaterThan(0);
    }
  });
});

describe("vdWizardScorecardOverallEvidence — 'Scorecard overall' leak fix", () => {
  it("renders 'คะแนนรวม {x}/5 (เกณฑ์ {y})' for a reviewed scorecard, reusing the SAME template as the quality-review card", () => {
    const result = vdWizardScorecardOverallEvidence({ overall: 3, minOverall: 4 }, "th");
    expect(result.label).toBe(vdCopy("th").qualityOverall);
    expect(result.value).toBe("คะแนนรวม 3/5 (เกณฑ์ 4)");
  });

  it("renders the dedicated 'not reviewed' sentence when overall is null, in both locales", () => {
    expect(vdWizardScorecardOverallEvidence({ overall: null, minOverall: 4 }, "th").value).toBe(
      "ยังไม่ได้ตรวจ",
    );
    expect(vdWizardScorecardOverallEvidence({ overall: null, minOverall: 4 }, "en").value).toBe(
      vdCopy("en").wizardScorecardNotReviewed,
    );
  });
});

describe("vdWizardLoopStateLabel / vdWizardLoopStateEvidence — 'Auto-improve loop' + 'not_run' leak fix", () => {
  it("has a non-empty TH and EN label for every loop status, including the wizard-only 'not_run'", () => {
    for (const status of [...VERTICAL_DRAMA_QUALITY_LOOP_STATUSES, "not_run"] as const) {
      expect(VD_WIZARD_LOOP_STATE_LABELS[status].th.length).toBeGreaterThan(0);
      expect(VD_WIZARD_LOOP_STATE_LABELS[status].en.length).toBeGreaterThan(0);
    }
  });

  it("renders the exact task-specified Thai sentence for 'not_run'", () => {
    expect(vdWizardLoopStateLabel("not_run", "th")).toBe("ยังไม่เคยรันปรับอัตโนมัติ");
  });

  it("vdWizardLoopStateEvidence pairs a localized row label with the localized status text — never the raw enum", () => {
    const result = vdWizardLoopStateEvidence("not_run", "th");
    expect(result.label).toBe("การปรับอัตโนมัติ");
    expect(result.value).toBe("ยังไม่เคยรันปรับอัตโนมัติ");
    expect(result.value).not.toBe("not_run");
  });

  it("escalated states map to distinct, non-generic sentences", () => {
    expect(vdWizardLoopStateLabel("escalated_max_rounds", "th")).not.toBe(
      vdWizardLoopStateLabel("escalated_regression", "th"),
    );
  });
});

describe("vdWizardEvidenceIdValue — file-wide evidence leak-fix sweep", () => {
  it("has a non-empty TH and EN {label, value} pair for every fixed evidence id", () => {
    for (const id of VERTICAL_DRAMA_WIZARD_EVIDENCE_IDS) {
      expect(VD_WIZARD_EVIDENCE_LABELS[id].th.label.length).toBeGreaterThan(0);
      expect(VD_WIZARD_EVIDENCE_LABELS[id].th.value.length).toBeGreaterThan(0);
      expect(VD_WIZARD_EVIDENCE_LABELS[id].en.label.length).toBeGreaterThan(0);
      expect(VD_WIZARD_EVIDENCE_LABELS[id].en.value.length).toBeGreaterThan(0);
    }
  });

  it("substitutes a numeric detail into the {n} placeholder", () => {
    const result = vdWizardEvidenceIdValue("start_frames_approved_count", "4/9", "th");
    expect(result.value).toBe("อนุมัติแล้ว 4/9");
  });

  it("renders a fixed (no-detail) row's static Thai value verbatim", () => {
    expect(vdWizardEvidenceIdValue("storyboard_generated", undefined, "th")).toEqual({
      label: "สตอรีบอร์ด",
      value: "สร้างครบ 9 ช็อตแล้ว",
    });
  });

  it("no Thai value for any evidence id contains a raw English status word leaked from the resolver's fallback strings", () => {
    const englishLeakWords = [
      "Not reviewed",
      "not_run",
      "Complete",
      "Incomplete",
      "Not started",
      "Missing",
      "Underfilled",
      "Fresh",
      "Stale",
      "Passed",
      "Created",
    ];
    for (const id of VERTICAL_DRAMA_WIZARD_EVIDENCE_IDS) {
      const th = VD_WIZARD_EVIDENCE_LABELS[id].th;
      for (const word of englishLeakWords) {
        expect(th.label).not.toContain(word);
        expect(th.value).not.toContain(word);
      }
    }
  });
});

describe("vdWizardStepDisplayStatusLabel — passed_with_warnings visual (text, not color-only)", () => {
  it("returns the dedicated 'ผ่านแบบมีคำเตือน' text only when status is passed AND passState is passed_with_warnings", () => {
    expect(vdWizardStepDisplayStatusLabel("passed", "passed_with_warnings", "th")).toBe(
      "ผ่านแบบมีคำเตือน",
    );
  });

  it("falls back to the plain status label for a clean pass", () => {
    expect(vdWizardStepDisplayStatusLabel("passed", "passed", "th")).toBe("ผ่านแล้ว");
  });

  it("falls back to the plain status label when passState is undefined (hand-built fixtures elsewhere)", () => {
    expect(vdWizardStepDisplayStatusLabel("passed", undefined, "th")).toBe("ผ่านแล้ว");
  });

  it("never applies the passed_with_warnings override to a non-passed status", () => {
    expect(vdWizardStepDisplayStatusLabel("needs_repair", "failed", "th")).toBe("ต้องซ่อมก่อน");
  });
});
