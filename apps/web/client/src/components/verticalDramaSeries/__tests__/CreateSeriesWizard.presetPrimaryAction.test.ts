import { describe, expect, it } from "vitest";

import { resolveCreateSeriesPresetAction } from "@/components/verticalDramaSeries/CreateSeriesWizard";

/**
 * vd-premise-first-wizard plan (Phase 3) — pure decision matrix: the premise
 * is the spine, presets are supplements, never the reverse. See plan.md
 * "target behaviour" table for the source of truth this test mirrors.
 */
describe("resolveCreateSeriesPresetAction", () => {
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

  it("no premise + 0 presets -> blocked, with a reason (nothing to build from)", () => {
    const action = resolveCreateSeriesPresetAction({
      hasUserPremise: false,
      presetCount: 0,
      lang: "th",
    });
    expect(action.kind).toBe("blocked");
    expect(action.blockedReason).toBeTruthy();
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
        presetCount: 1,
        lang: "en",
      }).label
    ).toBe("Use this preset");
  });
});
