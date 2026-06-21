import { describe, expect, it } from "vitest";

import {
  autoReviewCreativePresetRequestedAudioStrategy,
  buildAutoReviewCreativePresetDirective,
  normalizeAutoReviewCreativePresetSelections,
} from "../autoReviewCreativePresets";

describe("Auto Review creative presets", () => {
  it("normalizes known presets and drops unknown values", () => {
    expect(
      normalizeAutoReviewCreativePresetSelections([
        { family: "tone_preset", presetId: "tone_warm_honest" },
        { family: "tone_preset", presetId: "tone_expert_confident" },
        { family: "audio_preset", presetId: "audio_thai_tts" },
        { family: "audio_preset", presetId: "not_real" },
      ])
    ).toEqual([
      { family: "tone_preset", presetId: "tone_expert_confident" },
      { family: "audio_preset", presetId: "audio_thai_tts" },
    ]);
  });

  it("resolves Thai speech to separate TTS and warns Seedance not to speak Thai natively", () => {
    const selections = [
      { family: "audio_preset" as const, presetId: "audio_thai_tts" },
    ];

    expect(autoReviewCreativePresetRequestedAudioStrategy(selections)).toBe(
      "separate_tts_voiceover"
    );
    const directive = buildAutoReviewCreativePresetDirective({
      selections,
      videoModel: "seedance-2.0-pro",
    });

    expect(directive).toContain("separate Thai TTS");
    expect(directive).toContain("storyboard shot.voiceover");
    expect(directive).toContain("do not ask Seedance");
  });

  it("keeps preset influence away from product and character identity", () => {
    const directive = buildAutoReviewCreativePresetDirective({
      selections: [
        { family: "visual_style_preset", presetId: "visual_real_home_use" },
        { family: "camera_motion_preset", presetId: "camera_macro_detail" },
      ],
    });

    expect(directive).toContain("must not change product identity");
    expect(directive).toContain("character identity");
    expect(directive).toContain("reference frame roles");
  });
});
