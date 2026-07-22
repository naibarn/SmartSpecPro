import { describe, expect, it } from "vitest";

import {
  resolveCreateSeriesPresetAction,
  resolveGenreAfterPresetDraft,
} from "@/components/verticalDramaSeries/CreateSeriesWizard";

/**
 * vd-premise-first-wizard plan (Phase 3) — pure decision matrix: the premise
 * is the spine, presets are supplements, never the reverse. See plan.md
 * "target behaviour" table for the source of truth this test mirrors.
 */
describe("resolveCreateSeriesPresetAction", () => {
  it("labels a sequel premise as continuity from the original story", () => {
    const action = resolveCreateSeriesPresetAction({
      hasUserPremise: true,
      presetCount: 0,
      hasBasicSeed: true,
      hasLineageSeed: true,
      lang: "th",
    });

    expect(action).toEqual({
      kind: "synthesize_from_premise_only",
      label: "ให้ AI สร้างภาคต่อจากเรื่องเดิม + โจทย์",
    });
  });

  it("premise + 0 presets -> synthesizes from the premise alone", () => {
    const action = resolveCreateSeriesPresetAction({
      hasUserPremise: true,
      presetCount: 0,
      lang: "th",
    });
    expect(action.kind).toBe("synthesize_from_premise_only");
    expect(action.label).toBe("ให้ AI สร้างโครงเรื่องจากโจทย์");
  });

  it("premise + 1 preset -> synthesizes premise+preset (never verbatim)", () => {
    const action = resolveCreateSeriesPresetAction({
      hasUserPremise: true,
      presetCount: 1,
      lang: "th",
    });
    expect(action.kind).toBe("synthesize_premise_and_presets");
    expect(action.label).toBe("ให้ AI ผสมโจทย์กับ preset");
  });

  it("premise + 2-5 presets -> synthesizes premise+presets", () => {
    for (let presetCount = 2; presetCount <= 5; presetCount++) {
      const action = resolveCreateSeriesPresetAction({
        hasUserPremise: true,
        presetCount,
        lang: "th",
      });
      expect(action.kind).toBe("synthesize_premise_and_presets");
      expect(action.label).toBe("ให้ AI ผสมโจทย์กับ preset");
    }
  });

  it("no premise + 1 preset -> applies the preset verbatim (unchanged legacy path)", () => {
    const action = resolveCreateSeriesPresetAction({
      hasUserPremise: false,
      presetCount: 1,
      lang: "th",
    });
    expect(action.kind).toBe("apply_preset_verbatim");
    expect(action.label).toBe("ใช้ Preset นี้");
  });

  it("no premise + 2-5 presets -> synthesizes presets only (unchanged legacy label)", () => {
    for (let presetCount = 2; presetCount <= 5; presetCount++) {
      const action = resolveCreateSeriesPresetAction({
        hasUserPremise: false,
        presetCount,
        lang: "th",
      });
      expect(action.kind).toBe("synthesize_presets_only");
      expect(action.label).toBe("ให้ AI ผสมเป็น Preset");
    }
  });

  it("no premise + 0 presets + basic seed -> synthesizes from basics", () => {
    const action = resolveCreateSeriesPresetAction({
      hasUserPremise: false,
      presetCount: 0,
      hasBasicSeed: true,
      lang: "th",
    });
    expect(action.kind).toBe("synthesize_from_basics");
    expect(action.label).toBe("ให้ AI สร้างทั้งหมดให้");
  });

  it("no premise + 0 presets + no basic seed -> blocked with actionable guidance", () => {
    const action = resolveCreateSeriesPresetAction({
      hasUserPremise: false,
      presetCount: 0,
      hasBasicSeed: false,
      lang: "th",
    });
    expect(action.kind).toBe("blocked");
    expect(action.blockedReason).toBe(
      "ไม่ต้องเลือก preset ก็ได้ — พิมพ์โจทย์ 1 บรรทัดเพื่อดูตัวอย่างก่อน หรือกด 'ถัดไป' จนถึงแท็บสุดท้ายแล้วกด 'สร้าง' ให้ AI คิดเนื้อเรื่องให้ทั้งหมด"
    );
  });

  it("returns English labels when lang is en", () => {
    expect(
      resolveCreateSeriesPresetAction({
        hasUserPremise: true,
        presetCount: 0,
        lang: "en",
      }).label
    ).toBe("Let AI build the story from your premise");
    expect(
      resolveCreateSeriesPresetAction({
        hasUserPremise: false,
        presetCount: 0,
        hasBasicSeed: true,
        lang: "en",
      }).label
    ).toBe("Let AI build it all");
  });
});

describe("resolveGenreAfterPresetDraft", () => {
  it("preserves an inherited sequel genre instead of replacing it with generated data", () => {
    expect(
      resolveGenreAfterPresetDraft(
        "โรแมนติกดราม่า",
        "romantic_comedy",
        "คาเฟ่หัวใจ",
      ),
    ).toBe("โรแมนติกดราม่า");
  });

  it("uses the generated category when the creator has not set a genre", () => {
    expect(
      resolveGenreAfterPresetDraft("", "romantic_comedy", "คาเฟ่หัวใจ"),
    ).toBe("romantic_comedy");
  });

  it("replaces a legacy inherited genre polluted with the series title", () => {
    expect(
      resolveGenreAfterPresetDraft(
        "คาเฟ่หัวใจ",
        "romantic_comedy",
        "คาเฟ่หัวใจ",
      ),
    ).toBe("romantic_comedy");
  });
});
