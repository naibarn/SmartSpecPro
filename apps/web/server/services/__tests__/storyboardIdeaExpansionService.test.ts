import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callLLMStructured: vi.fn(),
}));

vi.mock("../callLLMStructured", () => mocks);

import { getStoryboardSkillSchema } from "../storyboardSkillRegistry";
import {
  buildStoryboardIdeaExpansionPrompt,
  expandStoryboardIdea,
  validateStoryboardSkillExpansionFields,
} from "../storyboardIdeaExpansionService";

const completeExpansion = {
  projectTitle: "มื้ออาหารแสนสุข",
  videoIdea: "เด็กสองคนแบ่งอาหารกันกินอย่างมีความสุข",
  sceneDetail: "Warm dining room with a stable cozy composition",
  customActivity: "Taste food, share food, and laugh together",
  customNotes: "Keep the same characters, realistic hands, and vertical 9:16",
  dialogueLines: [
    { speaker: "เด็ก", text: "แบ่งกันนะ จะได้อร่อยด้วยกัน", language: "th" },
  ],
};

beforeEach(() => {
  mocks.callLLMStructured.mockReset();
  mocks.callLLMStructured.mockResolvedValue({
    data: completeExpansion,
    creditsUsed: 1,
    modelId: "test-model",
  });
});

describe("Storyboard idea expansion service", () => {
  it("builds a field-aware prompt for the selected skill", () => {
    const skill = getStoryboardSkillSchema("cute_child_image_generator");
    const prompt = buildStoryboardIdeaExpansionPrompt({
      roughIdea: "เด็กสองคนแบ่งอาหารกันกิน",
      language: "th",
      storyType: "dialogue",
      totalShots: 9,
      skill,
    });

    expect(prompt).toContain("exactly these six keys");
    expect(prompt).toContain("scene_detail");
    expect(prompt).toContain("custom_activity");
    expect(prompt).toContain("custom_notes");
    expect(prompt).toContain("dialogueLines");
    expect(prompt).toContain("approximately 9 shots");
    expect(prompt).toContain("เด็กสองคนแบ่งอาหารกันกิน");
  });

  it("rejects incomplete provider output before it can reach the skill", () => {
    expect(() =>
      validateStoryboardSkillExpansionFields({
        projectTitle: "Dinner",
        videoIdea: "Two children share food",
        sceneDetail: "Warm dining room",
        customActivity: "Share food",
        customNotes: "Photorealistic",
      })
    ).not.toThrow();
    expect(() =>
      validateStoryboardSkillExpansionFields({
        projectTitle: "Dinner",
        videoIdea: "Two children share food",
        sceneDetail: "Warm dining room",
        customActivity: "",
        customNotes: "Photorealistic",
      })
    ).toThrow();
  });

  it("uses the portable storyboard registry without requiring shared runtime skill registration", async () => {
    await expandStoryboardIdea({
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "storyboard-idea-test-1",
      roughIdea: "เด็กสองคนแบ่งอาหารกันกิน",
      language: "th",
      storyType: "dialogue",
      totalShots: 9,
      selectedSkillId: "cute_child_image_generator",
    });

    expect(mocks.callLLMStructured).toHaveBeenCalledTimes(1);
    const call = mocks.callLLMStructured.mock.calls[0][0];
    expect(call.runtimeOptions).toBeUndefined();
    expect(call.billingMetadata.skillSlug).toBeUndefined();
    expect(call.billingMetadata.selectedStoryboardSkillId).toBe(
      "cute_child_image_generator"
    );
    expect(call.billingMetadata.idempotencyKey).toBe("storyboard-idea-test-1");
  });

  it("returns structured dialogue when the selected story type includes speech", async () => {
    const result = await expandStoryboardIdea({
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "storyboard-idea-dialogue-1",
      roughIdea: "เด็กสองคนแบ่งอาหารกันกิน",
      language: "th",
      storyType: "dialogue",
      totalShots: 9,
      selectedSkillId: "cute_child_image_generator",
    });

    expect(result.dialogueLines).toEqual(completeExpansion.dialogueLines);
  });

  it("passes an explicitly selected LLM model to the structured call", async () => {
    await expandStoryboardIdea({
      userId: 7,
      tenantId: "tenant-1",
      idempotencyKey: "storyboard-idea-model-1",
      roughIdea: "เด็กสองคนแบ่งอาหารกันกิน",
      language: "th",
      storyType: "mime",
      totalShots: 9,
      selectedSkillId: "cute_child_image_generator",
      llmModelId: "openai/gpt-4o-mini",
    });

    expect(mocks.callLLMStructured).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openai/gpt-4o-mini" })
    );
  });

  it("rejects a dialogue expansion that has no usable dialogue lines", async () => {
    mocks.callLLMStructured.mockResolvedValueOnce({
      data: { ...completeExpansion, dialogueLines: [] },
      creditsUsed: 1,
      modelId: "test-model",
    });

    await expect(
      expandStoryboardIdea({
        userId: 7,
        tenantId: "tenant-1",
        idempotencyKey: "storyboard-idea-dialogue-2",
        roughIdea: "เด็กสองคนแบ่งอาหารกันกิน",
        language: "th",
        storyType: "dialogue",
        totalShots: 9,
        selectedSkillId: "cute_child_image_generator",
      })
    ).rejects.toThrow("must include dialogue lines");
  });
});
