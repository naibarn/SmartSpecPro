import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PRESETS,
  getBuiltInPreset,
} from "../aiStylePresets";
import { SlideStylePresetSchema, AI_STYLE_PRESET_IDS } from "../aiTypes";

describe("Built-in Style Presets", () => {
  it("all built-in presets pass SlideStylePresetSchema validation", () => {
    for (const preset of BUILT_IN_PRESETS) {
      const result = SlideStylePresetSchema.safeParse(preset);
      expect(result.success, `Preset '${preset.id}' failed validation`).toBe(
        true,
      );
    }
  });

  it("getBuiltInPreset returns correct preset for each valid id", () => {
    for (const id of AI_STYLE_PRESET_IDS) {
      const preset = getBuiltInPreset(id);
      expect(preset).toBeDefined();
      expect(preset!.id).toBe(id);
    }
  });

  it("getBuiltInPreset returns undefined for unknown id", () => {
    const preset = getBuiltInPreset("nonexistent-preset");
    expect(preset).toBeUndefined();
  });

  it("each preset has unique id, name, and color palette", () => {
    const ids = BUILT_IN_PRESETS.map((p) => p.id);
    const names = BUILT_IN_PRESETS.map((p) => p.name);
    const backgrounds = BUILT_IN_PRESETS.map((p) => p.colors.background);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(backgrounds).size).toBe(backgrounds.length);
  });

  it("BUILT_IN_PRESETS array contains all style IDs from AI_STYLE_PRESET_IDS", () => {
    expect(BUILT_IN_PRESETS).toHaveLength(AI_STYLE_PRESET_IDS.length);
  });

  it("each preset.colors has all required fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.colors.background).toBeTruthy();
      expect(preset.colors.backgroundAlt).toBeTruthy();
      expect(preset.colors.primary).toBeTruthy();
      expect(preset.colors.secondary).toBeTruthy();
      expect(preset.colors.text).toBeTruthy();
      expect(preset.colors.textMuted).toBeTruthy();
      expect(preset.colors.cardBg).toHaveLength(3);
      expect(preset.colors.overlay).toBeTruthy();
    }
  });

  it("each preset.typography has all required fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(preset.typography.titleFontFamily).toBeTruthy();
      expect(preset.typography.bodyFontFamily).toBeTruthy();
      expect(typeof preset.typography.titleFontWeight).toBe("number");
      expect(typeof preset.typography.bodyFontWeight).toBe("number");
    }
  });

  it("presets with header.enabled have all required header fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      if (preset.header?.enabled) {
        expect(preset.header.height).toBeGreaterThan(0);
        expect(preset.header.backgroundColor).toBeTruthy();
      }
    }
  });

  it("presets with footer.enabled have all required footer fields", () => {
    for (const preset of BUILT_IN_PRESETS) {
      if (preset.footer?.enabled) {
        expect(preset.footer.height).toBeGreaterThan(0);
        expect(preset.footer.backgroundColor).toBeTruthy();
      }
    }
  });
});
