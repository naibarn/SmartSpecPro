import { describe, expect, it } from "vitest";
import {
  classifyDraftSkillCapability,
  getDraftSkillMediaType,
  getDraftSkillModeLabel,
  isArticleDraftSkill,
  isSupportedDraftSkill,
  shouldUseDraftSkillForMedia,
} from "../draftSkillCapabilities";

describe("draftSkillCapabilities", () => {
  it("classifies article-generation skills", () => {
    const skill = { slug: "general-article-writer", category: "article_generation" };
    expect(classifyDraftSkillCapability(skill)).toBe("article");
    expect(isArticleDraftSkill(skill)).toBe(true);
    expect(shouldUseDraftSkillForMedia(skill)).toBe(false);
    expect(getDraftSkillModeLabel(skill)).toBe("Article Generation");
  });

  it("classifies prompt-enhancement skills", () => {
    const skill = { slug: "prompt-enhancer", category: "prompt_enhancement", executionMode: "enhance-prompt" };
    expect(classifyDraftSkillCapability(skill)).toBe("prompt");
    expect(isSupportedDraftSkill(skill)).toBe(true);
    expect(shouldUseDraftSkillForMedia(skill)).toBe(true);
    expect(getDraftSkillMediaType(skill)).toBe("image");
    expect(getDraftSkillModeLabel(skill)).toBe("Prompt Enhancement");
  });

  it("classifies image prompt generation skills separately from image generators", () => {
    const skill = { slug: "image-prompt-engineer", category: "image_prompt_generation", executionMode: "enhance-prompt" };
    expect(classifyDraftSkillCapability(skill)).toBe("prompt");
    expect(shouldUseDraftSkillForMedia(skill)).toBe(true);
    expect(getDraftSkillMediaType(skill)).toBe("image");
    expect(getDraftSkillModeLabel(skill)).toBe("Create Prompt for Image Generation");
  });

  it("classifies video prompt generation skills separately from video generators", () => {
    const skill = { slug: "video-prompt-engineer", category: "video_prompt_generation", executionMode: "llm-only" };
    expect(classifyDraftSkillCapability(skill)).toBe("prompt");
    expect(shouldUseDraftSkillForMedia(skill)).toBe(true);
    expect(getDraftSkillMediaType(skill)).toBe("video");
    expect(getDraftSkillModeLabel(skill)).toBe("Create Prompt for Video Generation");
  });

  it("classifies image-generation skills", () => {
    const skill = { slug: "image-creator", category: "image_generation", executionMode: "media-generate" };
    expect(classifyDraftSkillCapability(skill)).toBe("image");
    expect(shouldUseDraftSkillForMedia(skill)).toBe(true);
    expect(getDraftSkillMediaType(skill)).toBe("image");
    expect(getDraftSkillModeLabel(skill)).toBe("Image Generation");
  });

  it("classifies video-generation skills", () => {
    const skill = { slug: "video-story-crafter", category: "video_generation", executionMode: "media-generate" };
    expect(classifyDraftSkillCapability(skill)).toBe("video");
    expect(shouldUseDraftSkillForMedia(skill)).toBe(true);
    expect(getDraftSkillMediaType(skill)).toBe("video");
    expect(getDraftSkillModeLabel(skill)).toBe("Video Generation");
  });

  it("keeps legacy article heuristics for older skills", () => {
    const skill = { slug: "parenting-article-writer", category: null, executionMode: "llm-only" };
    expect(classifyDraftSkillCapability(skill)).toBe("article");
  });

  it("rejects unsupported skills", () => {
    const skill = { slug: "code-helper", category: "code_assistant", executionMode: "llm-only" };
    expect(classifyDraftSkillCapability(skill)).toBe("unknown");
    expect(isSupportedDraftSkill(skill)).toBe(false);
    expect(getDraftSkillModeLabel(skill)).toBe("Unsupported");
  });
});
