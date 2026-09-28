import { describe, expect, it } from "vitest";

import {
  vdCopy,
  vdCopyWithParams,
  vdMapGenerationErrorMessage,
  vdQualityRepairGroupLabel,
  vdSilenceIntentLabel,
  vdWizardPrimaryActionLabel,
  vdWizardReasonLabel,
  vdWizardScriptCoverageEvidence,
  vdWizardStatusLabel,
  vdWizardStepLabel,
  VD_WIZARD_REASON_LABELS,
} from "@/components/verticalDramaSeries/verticalDramaWorkspaceCopy";
import { VERTICAL_DRAMA_WIZARD_BLOCKING_REASON_CODES } from "@shared/verticalDramaSeries/productionWizard";

describe("vdCopyWithParams", () => {
  it("substitutes every {key} placeholder with the given value", () => {
    expect(
      vdCopyWithParams("บทพูดรวม {n} วิ จากเป้า {min}-{max} วิ", {
        n: 12.3,
        min: 35,
        max: 41,
      })
    ).toBe("บทพูดรวม 12.3 วิ จากเป้า 35-41 วิ");
  });

  it("leaves a template unchanged when no params match", () => {
    expect(vdCopyWithParams("plain text", { n: 1 })).toBe("plain text");
  });

  it("replaces every occurrence of a repeated placeholder", () => {
    expect(vdCopyWithParams("{x}/{x}", { x: 5 })).toBe("5/5");
  });
});

describe("shot generation-history copy", () => {
  it("labels prior generated images as history, not references", () => {
    expect(vdCopy("th").references).toBe("ประวัติการสร้างภาพ");
    expect(vdCopy("en").references).toBe("Generation history");
  });
});

describe("episode regeneration vocabulary", () => {
  it("keeps whole-episode rebuilding and stage rebuilding distinct", () => {
    expect(vdCopy("th").episodeContentRebuildTitle).toBe("สร้างเนื้อหาตอนใหม่");
    expect(vdCopy("th").episodeContentRebuildButton).toBe(
      "สร้างเนื้อหาชุดใหม่ (9 ช็อต)"
    );
    expect(vdCopy("th").episodeContentRebuildModeSameStoryDescription).toContain(
      "บทพูดเดิม"
    );
    expect(vdCopy("th").episodeContentRebuildModeRewriteStoryDescription).toContain(
      "สร้างเรื่องย่อ"
    );
    expect(vdCopy("th").episodeContentRebuildConfirmButton).toBe(
      "ยืนยันและเริ่มสร้าง"
    );
    expect(vdCopy("th").regenerateStage).toBe("สร้างผลลัพธ์ขั้นตอนนี้ใหม่");
    expect(vdCopy("th").regenerateConfirm).not.toContain("ลบชุดเดิม");
    expect(vdCopy("en").regenerateStage).toBe("Rebuild this stage");
    expect(vdCopy("en").regenerateConfirm).not.toContain("delete old");
  });
});

describe("vdWizardReasonLabel", () => {
  it("has a TH and EN label for every one of the 13 fixed VD_WIZARD_* codes", () => {
    for (const code of VERTICAL_DRAMA_WIZARD_BLOCKING_REASON_CODES) {
      expect(VD_WIZARD_REASON_LABELS[code].th.length).toBeGreaterThan(0);
      expect(VD_WIZARD_REASON_LABELS[code].en.length).toBeGreaterThan(0);
      expect(vdWizardReasonLabel(code, "th")).toBe(
        VD_WIZARD_REASON_LABELS[code].th
      );
      expect(vdWizardReasonLabel(code, "en")).toBe(
        VD_WIZARD_REASON_LABELS[code].en
      );
    }
  });

  it("falls back to the raw code for an unrecognized reason string", () => {
    expect(vdWizardReasonLabel("SOME_UNKNOWN_CODE", "th")).toBe(
      "SOME_UNKNOWN_CODE"
    );
  });
});

describe("vdSilenceIntentLabel", () => {
  it("labels every declared silence intent in both locales", () => {
    for (const intent of [
      "dramatic_pause",
      "action_visual",
      "montage",
      "establishing",
    ] as const) {
      expect(vdSilenceIntentLabel(intent, "th").length).toBeGreaterThan(0);
      expect(vdSilenceIntentLabel(intent, "en").length).toBeGreaterThan(0);
    }
  });
});

describe("vdWizardStepLabel / vdWizardStatusLabel / vdWizardPrimaryActionLabel", () => {
  it("returns the Copy Contract verbatim status labels", () => {
    expect(vdWizardStatusLabel("passed", "th")).toBe("ผ่านแล้ว");
    expect(vdWizardStatusLabel("needs_repair", "th")).toBe("ต้องซ่อมก่อน");
  });

  it("returns the Copy Contract verbatim primary-action labels where pinned", () => {
    expect(vdWizardPrimaryActionLabel("generate_video_prompts", "th")).toBe(
      "สร้างพรอมต์วิดีโอทั้งตอนย่อย"
    );
    expect(vdWizardPrimaryActionLabel("repair_shots", "th")).toBe(
      "ซ่อมเฉพาะช็อตนี้"
    );
    expect(vdWizardPrimaryActionLabel("generate_video_clips", "th")).toBe(
      "สร้างวิดีโอจริง"
    );
  });

  it("labels every step id in both locales", () => {
    expect(vdWizardStepLabel("script_qc", "th").length).toBeGreaterThan(0);
    expect(vdWizardStepLabel("script_qc", "en").length).toBeGreaterThan(0);
  });
});

describe("vdQualityRepairGroupLabel", () => {
  it("labels the four canonical loop repair groups", () => {
    expect(vdQualityRepairGroupLabel("plan_episode_script", "th")).toBe(
      "แก้บท"
    );
    expect(vdQualityRepairGroupLabel("storyboard_shotgrid", "th")).toBe(
      "แก้สตอรีบอร์ด"
    );
    expect(vdQualityRepairGroupLabel("dialogue_audio_plan", "th")).toBe(
      "แก้บทพูด"
    );
    expect(vdQualityRepairGroupLabel("tie_in", "th")).toBe("ปรับสินค้า");
  });

  it("falls back to vdStageLabel for any other pipeline stage", () => {
    const t = vdCopy("th");
    expect(vdQualityRepairGroupLabel("normalize_series_input", "th")).not.toBe(
      t.qualityLoopStageScript
    );
  });
});

describe("vdWizardScriptCoverageEvidence (2026-07-08 fix)", () => {
  it("renders a fully numeric Thai label/value for in_range — never the raw enum string", () => {
    const result = vdWizardScriptCoverageEvidence(
      {
        status: "in_range",
        estimatedSpeechSeconds: 36.8,
        targetSpeechSecondsMin: 34.8,
        targetSpeechSecondsMax: 40.8,
      },
      "th"
    );
    expect(result.label).toBe(vdCopy("th").densityMeterTitle);
    expect(result.value).toBe("บทพูดรวม 36.8 วิ จากเป้า 35-41 วิ");
    expect(result.value).not.toContain("in_range");
  });

  it("renders the same numeric shape for underfilled_error — the raw enum never leaks", () => {
    const result = vdWizardScriptCoverageEvidence(
      {
        status: "underfilled_error",
        estimatedSpeechSeconds: 0,
        targetSpeechSecondsMin: 34.8,
        targetSpeechSecondsMax: 40.8,
      },
      "th"
    );
    expect(result.value).toBe("บทพูดรวม 0.0 วิ จากเป้า 35-41 วิ");
    expect(result.value).not.toContain("underfilled_error");
  });

  it("renders the dedicated grandfathering message for no_dialogue_data, in both locales", () => {
    const scriptCoverage = {
      status: "no_dialogue_data" as const,
      estimatedSpeechSeconds: 0,
      targetSpeechSecondsMin: 34.8,
      targetSpeechSecondsMax: 40.8,
    };
    // 2026-07-08 W9-B plain-language sweep reworded this sentence (dropped
    // "ฝังบีต"/"ระบบวัดความหนาแน่น" jargon) — same meaning, plainer words.
    expect(vdWizardScriptCoverageEvidence(scriptCoverage, "th").value).toBe(
      "บทนี้เป็นบทเก่าที่ยังไม่มีข้อมูลบทพูดละเอียดพอ — สร้างบทตอนย่อยใหม่เพื่อดูตัวเลขบทพูดที่แม่นยำ"
    );
    expect(vdWizardScriptCoverageEvidence(scriptCoverage, "en").value).toBe(
      vdCopy("en").wizardScriptNoDialogueDataMessage
    );
    expect(vdWizardScriptCoverageEvidence(scriptCoverage, "th").value).not.toBe(
      "no_dialogue_data"
    );
  });

  it("uses the SAME phrase as the density meter's own copy template (single source of truth)", () => {
    const t = vdCopy("en");
    const result = vdWizardScriptCoverageEvidence(
      {
        status: "in_range",
        estimatedSpeechSeconds: 10,
        targetSpeechSecondsMin: 34.8,
        targetSpeechSecondsMax: 40.8,
      },
      "en"
    );
    expect(result.value).toBe(
      vdCopyWithParams(t.densityEpisodeCoverageTemplate, {
        n: "10.0",
        min: "35",
        max: "41",
      })
    );
  });
});

describe("vdMapGenerationErrorMessage", () => {
  it("maps a VD_TIE_IN_BELOW_FLOOR-prefixed message to the friendly Thai hint", () => {
    expect(
      vdMapGenerationErrorMessage(
        "VD_TIE_IN_BELOW_FLOOR: score 55 is below the pass floor",
        "th"
      )
    ).toBe(vdCopy("th").tieInBlockedHint);
  });

  it("passes through any other message unchanged", () => {
    expect(vdMapGenerationErrorMessage("network timeout", "th")).toBe(
      "network timeout"
    );
  });
});
