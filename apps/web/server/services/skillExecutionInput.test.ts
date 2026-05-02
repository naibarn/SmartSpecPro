import { describe, expect, it } from "vitest";

import { prepareSkillExecutionInputsForPromptPackage } from "./skillExecutionInput";

describe("prepareSkillExecutionInputsForPromptPackage", () => {
  it("removes package-level maxPromptLength for news narration prompt packages", () => {
    const result = prepareSkillExecutionInputsForPromptPackage("video-storyboard-to-prompts", {
      contentMode: "news_narration",
      newsScript: "ข่าวหลายย่อหน้าที่ต้องแตกหลายคลิป",
      maxPromptLength: 5000,
      newsClipDensity: "detailed",
    });

    expect(result.suppressPromptLengthPlan).toBe(true);
    expect(result.userInputs).toMatchObject({
      contentMode: "news_narration",
      newsScript: "ข่าวหลายย่อหน้าที่ต้องแตกหลายคลิป",
      newsClipDensity: "detailed",
    });
    expect(result.userInputs).not.toHaveProperty("maxPromptLength");
  });

  it("keeps maxPromptLength for normal storyboard output", () => {
    const userInputs = {
      contentMode: "storyboard",
      userIdea: "A normal short video",
      maxPromptLength: 5000,
    };

    const result = prepareSkillExecutionInputsForPromptPackage("video-storyboard-to-prompts", userInputs);

    expect(result.suppressPromptLengthPlan).toBe(false);
    expect(result.userInputs).toBe(userInputs);
    expect(result.userInputs.maxPromptLength).toBe(5000);
  });
});
