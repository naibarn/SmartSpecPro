import { describe, expect, it } from "vitest";

import {
  resolveMediaTypeFromSkillCategory,
  sanitizeMediaModelSelectionWithEnabledIds,
} from "./mediaModelSelection";

describe("mediaModelSelection", () => {
  it("maps media skill categories to media types", () => {
    expect(resolveMediaTypeFromSkillCategory("image_generation")).toBe("image");
    expect(resolveMediaTypeFromSkillCategory("video-generation")).toBe("video");
    expect(resolveMediaTypeFromSkillCategory("audio_generation")).toBe("audio");
    expect(resolveMediaTypeFromSkillCategory("research")).toBeNull();
  });

  it("removes disabled models from explicit allowlists and default selections", () => {
    expect(
      sanitizeMediaModelSelectionWithEnabledIds(
        ["enabled-image", "fallback-image"],
        {
          availableModels: ["enabled-image", "disabled-image"],
          defaultModel: "disabled-image",
        },
        { fallbackToTypeDefault: true },
        "fallback-image",
      ),
    ).toEqual({
      availableModels: ["enabled-image"],
      defaultModel: "enabled-image",
    });
  });

  it("uses the type default only when the skill does not define an explicit allowlist", () => {
    expect(
      sanitizeMediaModelSelectionWithEnabledIds(
        ["enabled-image", "fallback-image"],
        {
          availableModels: null,
          defaultModel: "disabled-image",
        },
        { fallbackToTypeDefault: true },
        "fallback-image",
      ),
    ).toEqual({
      availableModels: null,
      defaultModel: "fallback-image",
    });

    expect(
      sanitizeMediaModelSelectionWithEnabledIds(
        ["enabled-image", "fallback-image"],
        {
          availableModels: ["disabled-image"],
          defaultModel: "disabled-image",
        },
        { fallbackToTypeDefault: true },
        "fallback-image",
      ),
    ).toEqual({
      availableModels: [],
      defaultModel: null,
    });
  });
});
