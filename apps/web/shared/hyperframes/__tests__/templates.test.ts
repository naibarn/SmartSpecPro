import { describe, expect, it } from "vitest";

import {
  HYPERFRAMES_BUILT_IN_TEMPLATES,
  getDefaultHyperframesTemplate,
  getHyperframesPlatformPreset,
  isHyperframesTemplateCompatible,
  listHyperframesBuiltInTemplates,
  listHyperframesPlatformPresets,
} from "../templates";

describe("HyperFrames template registry contracts", () => {
  it("registers the built-in templates required by the spec", () => {
    expect(HYPERFRAMES_BUILT_IN_TEMPLATES.map(template => template.templateId))
      .toEqual([
        "marketplace_storyboard_motion_9x9_v1",
        "marketplace_product_card_explainer_9_16_v1",
        "marketplace_captioned_final_composite_9_16_v1",
        "marketplace_social_variant_square_v1",
      ]);
  });

  it("returns enabled presets by default and keeps disabled presets defined", () => {
    expect(listHyperframesPlatformPresets().map(preset => preset.presetId))
      .toEqual(["generic_vertical_9_16", "tiktok_reels_shorts_9_16"]);
    expect(
      listHyperframesPlatformPresets({ includeDisabled: true }).map(
        preset => preset.presetId
      )
    ).toContain("youtube_landscape_16_9");
    expect(getHyperframesPlatformPreset("generic_vertical_9_16")).toMatchObject({
      width: 1080,
      height: 1920,
      fps: 24,
    });
  });

  it("selects the default storyboard motion template automatically", () => {
    const template = getDefaultHyperframesTemplate();
    expect(template.templateId).toBe("marketplace_storyboard_motion_9x9_v1");
    expect(
      isHyperframesTemplateCompatible({
        template,
        launchMode: "auto_storyboard_review",
        compositionMode: "storyboard_motion_preview",
        renderIntent: "preview",
        platformPresetId: "generic_vertical_9_16",
      })
    ).toBe(true);
  });

  it("filters incompatible templates without requiring UI customization", () => {
    expect(
      listHyperframesBuiltInTemplates({
        compositionMode: "captioned_final_composite",
        renderIntent: "final",
        platformPresetId: "generic_vertical_9_16",
      }).map(template => template.templateId)
    ).toEqual(["marketplace_captioned_final_composite_9_16_v1"]);
  });
});
