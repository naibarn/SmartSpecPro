import { describe, expect, it } from "vitest";
import {
  getAllowedExecutionModesForSkillCategory,
  getMediaModelTypeForSkillCategory,
  getRecommendedExecutionModeForSkillCategory,
  isExecutionModeCompatibleWithSkillCategory,
  isImagePromptSkillCategory,
  isPromptGenerationSkillCategory,
  isVideoPromptSkillCategory,
} from "../skillCategoryMetadata";

describe("skillCategoryMetadata", () => {
  it("enforces prompt categories to llm-only or enhance-prompt", () => {
    expect(getAllowedExecutionModesForSkillCategory("image_prompt_generation")).toEqual([
      "llm-only",
      "enhance-prompt",
    ]);
    expect(isExecutionModeCompatibleWithSkillCategory("video_prompt_generation", "media-generate")).toBe(false);
    expect(isExecutionModeCompatibleWithSkillCategory("prompt_enhancement", "enhance-prompt")).toBe(true);
  });

  it("enforces media-generation categories to media-generate only", () => {
    expect(getAllowedExecutionModesForSkillCategory("image_generation")).toEqual([
      "media-generate",
    ]);
    expect(isExecutionModeCompatibleWithSkillCategory("sound_effects", "media-generate")).toBe(true);
    expect(isExecutionModeCompatibleWithSkillCategory("audio_generation", "llm-only")).toBe(false);
  });

  it("returns recommended execution modes by category", () => {
    expect(getRecommendedExecutionModeForSkillCategory("article_generation")).toBe("llm-only");
    expect(getRecommendedExecutionModeForSkillCategory("slide_generation")).toBe("sandbox-command");
    expect(getRecommendedExecutionModeForSkillCategory("video_generation")).toBe("media-generate");
  });

  it("allows slide-generation skills to use sandbox execution", () => {
    expect(getAllowedExecutionModesForSkillCategory("slide_generation")).toEqual([
      "sandbox-command",
      "sandbox-code",
      "llm-only",
    ]);
    expect(isExecutionModeCompatibleWithSkillCategory("slide_generation", "sandbox-command")).toBe(true);
    expect(isExecutionModeCompatibleWithSkillCategory("slide_generation", "sandbox-code")).toBe(true);
    expect(isExecutionModeCompatibleWithSkillCategory("slide_generation", "media-generate")).toBe(false);
  });

  it("reports the correct media model type for media categories", () => {
    expect(getMediaModelTypeForSkillCategory("image_generation")).toBe("image");
    expect(getMediaModelTypeForSkillCategory("video_generation")).toBe("video");
    expect(getMediaModelTypeForSkillCategory("audio_generation")).toBe("audio");
    expect(getMediaModelTypeForSkillCategory("image_video_generation")).toBe("image-video");
  });

  it("identifies prompt-generation categories precisely", () => {
    expect(isPromptGenerationSkillCategory("prompt_enhancement")).toBe(true);
    expect(isPromptGenerationSkillCategory("image_prompt_generation")).toBe(true);
    expect(isPromptGenerationSkillCategory("video_prompt_generation")).toBe(true);
    expect(isPromptGenerationSkillCategory("image_generation")).toBe(false);
    expect(isImagePromptSkillCategory("image_prompt_generation")).toBe(true);
    expect(isVideoPromptSkillCategory("video_prompt_generation")).toBe(true);
  });
});
