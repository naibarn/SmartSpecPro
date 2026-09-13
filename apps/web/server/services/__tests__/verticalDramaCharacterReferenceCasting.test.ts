import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSyncSkill,
  mockGetSkill,
  mockResolvePolicy,
  mockExecuteLlm,
  mockSettleSkillRun,
} = vi.hoisted(() => ({
  mockSyncSkill: vi.fn(),
  mockGetSkill: vi.fn(),
  mockResolvePolicy: vi.fn(),
  mockExecuteLlm: vi.fn(),
  mockSettleSkillRun: vi.fn(),
}));

vi.mock("../skillRegistry", () => ({
  syncSingleSkillIfChanged: mockSyncSkill,
  getSkillByIdAsync: mockGetSkill,
}));
vi.mock("../skillExecutionPolicy", () => ({
  resolveSkillExecutionPolicy: mockResolvePolicy,
}));
vi.mock("../skillModelFallback", () => ({
  executeSkillLlmWithFallback: mockExecuteLlm,
}));
vi.mock("../skillRevenueBilling", () => ({
  settleSkillRun: mockSettleSkillRun,
}));

import {
  buildCharacterCandidatePromptInput,
  buildCharacterCandidatePromptMessages,
  buildCharacterCandidateSingleImageRenderPrompt,
  findCharacterCandidatePromptDuplicatePairs,
  generateCharacterReferenceCastingPrompt,
  parseCharacterCandidatePromptOutput,
} from "../verticalDramaCharacterReferenceCasting";

describe("verticalDramaCharacterReferenceCasting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncSkill.mockResolvedValue({ error: null });
    mockGetSkill.mockResolvedValue({
      id: "character-candidate-prompt",
      skillContent: "Return one plain-text character prompt.",
    });
    mockResolvePolicy.mockResolvedValue({
      modelId: "vision-model",
      allowFreeModels: false,
      modelSource: "skill_defaultModel",
    });
    mockExecuteLlm.mockResolvedValue({
      success: true,
      content: "  Create a new fictional casting character.  ",
      modelId: "vision-model",
    });
    mockSettleSkillRun.mockResolvedValue({ totalCredits: 2 });
  });

  it("builds the skill input and omits blank additional instructions", () => {
    expect(
      buildCharacterCandidatePromptInput({
        referenceImages: [" /one.jpg ", "/one.jpg", "/two.jpg"],
        imageCount: 3,
        genderPresentation: "female",
        ethnicity: "Thai / Southeast Asian",
        ageMin: 23,
        ageMax: 25,
        lockClothing: false,
        poseMode: "auto_natural",
        cameraFraming: "half_body",
        additionalInstructions: "   ",
      }),
    ).toEqual({
      reference_images: ["/one.jpg", "/two.jpg"],
      image_count: 3,
      candidate_count: 3,
      gender_presentation: "female",
      ethnicity: "Thai / Southeast Asian",
      age_min: 23,
      age_max: 25,
      lock_clothing: false,
      pose_mode: "auto_natural",
      camera_framing: "half_body",
    });
  });

  it("sends each reference as a multimodal image part", () => {
    const messages = buildCharacterCandidatePromptMessages("system", {
      referenceImages: ["https://cdn/one.jpg", "https://cdn/two.jpg"],
      imageCount: 2,
      genderPresentation: "female",
      ethnicity: "Thai",
      ageMin: 23,
      ageMax: 25,
      lockClothing: true,
      poseMode: "lock_reference",
      cameraFraming: "close_up",
    });
    const content = messages[1]?.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(3);
    expect(content?.[1]).toMatchObject({
      type: "image_url",
      image_url: { url: "https://cdn/one.jpg" },
    });
  });

  it("runs the named skill and settles one skill run after plain-text output", async () => {
    const result = await generateCharacterReferenceCastingPrompt({
      userId: 7,
      tenantId: "tenant-1",
      runId: "run-1",
      referenceImages: ["https://cdn/ref.jpg"],
      imageCount: 1,
      genderPresentation: "female",
      ethnicity: "Thai",
      ageMin: 23,
      ageMax: 25,
      lockClothing: false,
      poseMode: "auto_natural",
      cameraFraming: "half_body",
      additionalInstructions: "ชุดลำลอง",
    });

    expect(result).toEqual({
      prompts: ["Create a new fictional casting character."],
      prompt: "Create a new fictional casting character.",
      modelId: "vision-model",
      creditsUsed: 2,
      runId: "run-1",
      repairCount: 0,
      duplicatePairs: [],
    });
    expect(mockExecuteLlm).toHaveBeenCalledWith(
      expect.objectContaining({
        skillSlug: "character-candidate-prompt",
        userId: 7,
        maxTokens: 2400,
      }),
    );
    expect(mockSettleSkillRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-1",
        skillSlug: "character-candidate-prompt",
        tenantId: "tenant-1",
      }),
    );
  });

  it("adds a one-image directive before independent candidate rendering", () => {
    const prompt = buildCharacterCandidateSingleImageRenderPrompt(
      "Create a new fictional casting character.",
    );
    expect(prompt).toContain("exactly one single image only");
    expect(prompt).toContain("not the person in any reference image");
  });

  it("parses a numbered batch and detects exact/near duplicate prompts", () => {
    const prompts = parseCharacterCandidatePromptOutput(
      [
        "CANDIDATE 1:\nA warm Thai woman with an oval face and long waves.\nEND CANDIDATE 1",
        "CANDIDATE 2:\nA warm Thai woman with an oval face and long waves.\nEND CANDIDATE 2",
        "CANDIDATE 3:\nA Thai woman with a diamond face, cropped curls, and a small scar.\nEND CANDIDATE 3",
      ].join("\n"),
      3,
    );
    expect(prompts).toHaveLength(3);
    expect(findCharacterCandidatePromptDuplicatePairs(prompts)).toEqual([[0, 1]]);
  });

  it("repairs an incomplete batch with one prompt per missing candidate", async () => {
    mockExecuteLlm
      .mockResolvedValueOnce({
        success: true,
        content: "CANDIDATE 1:\nFirst distinct person with an oval face and waves.\nEND CANDIDATE 1",
        modelId: "vision-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Second distinct person with a diamond face and cropped curls.",
        modelId: "vision-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: "Third distinct person with a square face and a braided bob.",
        modelId: "vision-model",
      });

    const result = await generateCharacterReferenceCastingPrompt({
      userId: 7,
      tenantId: "tenant-1",
      referenceImages: ["https://cdn/ref.jpg"],
      imageCount: 3,
      genderPresentation: "female",
      ethnicity: "Thai",
      ageMin: 23,
      ageMax: 25,
      lockClothing: false,
      poseMode: "auto_natural",
      cameraFraming: "half_body",
    });

    expect(result.prompts).toHaveLength(3);
    expect(new Set(result.prompts).size).toBe(3);
    expect(result.duplicatePairs).toEqual([]);
    expect(result.repairCount).toBeGreaterThan(0);
  });

  it("regenerates a duplicate batch before returning it", async () => {
    mockExecuteLlm
      .mockResolvedValueOnce({
        success: true,
        content: [
          "CANDIDATE 1:\nA warm Thai woman with an oval face, almond eyes, and long waves wearing a cream blouse.\nEND CANDIDATE 1",
          "CANDIDATE 2:\nA warm Thai woman with an oval face, almond eyes, and long waves wearing a cream blouse.\nEND CANDIDATE 2",
        ].join("\n"),
        modelId: "vision-model",
      })
      .mockResolvedValueOnce({
        success: true,
        content: [
          "CANDIDATE 1:\nA warm Thai woman with an oval face, almond eyes, and long waves wearing a cream blouse.\nEND CANDIDATE 1",
          "CANDIDATE 2:\nA warm Thai woman with a diamond face, narrow eyes, cropped curls, and a small cheek scar wearing a cream blouse.\nEND CANDIDATE 2",
        ].join("\n"),
        modelId: "vision-model",
      });

    const result = await generateCharacterReferenceCastingPrompt({
      userId: 7,
      tenantId: "tenant-1",
      referenceImages: ["https://cdn/ref.jpg"],
      imageCount: 2,
      genderPresentation: "female",
      ethnicity: "Thai",
      ageMin: 23,
      ageMax: 25,
      lockClothing: false,
      poseMode: "auto_natural",
      cameraFraming: "half_body",
    });

    expect(mockExecuteLlm).toHaveBeenCalledTimes(2);
    expect(result.repairCount).toBe(1);
    expect(result.duplicatePairs).toEqual([]);
    expect(new Set(result.prompts).size).toBe(2);
  });

  it("rejects an empty skill response before settlement", async () => {
    mockExecuteLlm.mockResolvedValue({ success: true, content: "   " });
    await expect(
      generateCharacterReferenceCastingPrompt({
        userId: 7,
        tenantId: "tenant-1",
        referenceImages: ["https://cdn/ref.jpg"],
        imageCount: 1,
        genderPresentation: "female",
        ethnicity: "Thai",
        ageMin: 23,
        ageMax: 25,
        lockClothing: false,
        poseMode: "auto_natural",
        cameraFraming: "half_body",
      }),
    ).rejects.toThrow("returned empty output");
    expect(mockSettleSkillRun).not.toHaveBeenCalled();
  });
});
