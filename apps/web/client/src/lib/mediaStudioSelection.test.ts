import { describe, expect, it } from "vitest";
import {
  canGenerateInMediaStudio,
  pickMediaStudioSkillForTab,
} from "./mediaStudioSelection";

describe("mediaStudioSelection", () => {
  const skills = [
    { id: "image_prompt_engineer", type: "image-prompt-generation", priority: 70 },
    { id: "video-prompt-engineer", type: "video-prompt-generation", priority: 60 },
    { id: "image-creator", type: "image-generation", priority: 95 },
    { id: "audio-creator", type: "audio-generation", priority: 80 },
  ];

  it("restores the saved skill only when it still matches the current tab", () => {
    expect(
      pickMediaStudioSkillForTab("image", skills, "image_prompt_engineer"),
    ).toBe("image_prompt_engineer");

    expect(
      pickMediaStudioSkillForTab("video", skills, "image_prompt_engineer"),
    ).toBe("video-prompt-engineer");
  });

  it("returns the highest-priority compatible prompt skill for image and video tabs", () => {
    expect(
      pickMediaStudioSkillForTab("image", skills),
    ).toBe("image_prompt_engineer");

    expect(
      pickMediaStudioSkillForTab("video", skills),
    ).toBe("video-prompt-engineer");

    expect(
      pickMediaStudioSkillForTab("audio", skills),
    ).toBe("audio-creator");
  });

  it("allows manual generate when the user typed a prompt even without any selected skill", () => {
    expect(
      canGenerateInMediaStudio({
        prompt: "A cinematic mountain sunrise",
        enhancedPrompt: "",
        advancedRequest: "",
        isGenerating: false,
        credits: 10,
        modelCost: 1,
      }),
    ).toBe(true);
  });

  it("blocks generate when there is no prompt, generation is already running, or credits are insufficient", () => {
    expect(
      canGenerateInMediaStudio({
        prompt: "",
        enhancedPrompt: "",
        advancedRequest: "",
        isGenerating: false,
        credits: 10,
        modelCost: 1,
      }),
    ).toBe(false);

    expect(
      canGenerateInMediaStudio({
        prompt: "Prompt",
        enhancedPrompt: "",
        advancedRequest: "",
        isGenerating: true,
        credits: 10,
        modelCost: 1,
      }),
    ).toBe(false);

    expect(
      canGenerateInMediaStudio({
        prompt: "Prompt",
        enhancedPrompt: "",
        advancedRequest: "",
        isGenerating: false,
        credits: 0,
        modelCost: 1,
      }),
    ).toBe(false);
  });
});
