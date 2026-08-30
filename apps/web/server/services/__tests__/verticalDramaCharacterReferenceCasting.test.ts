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
  generateCharacterReferenceCastingPrompt,
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
      prompt: "Create a new fictional casting character.",
      modelId: "vision-model",
      creditsUsed: 2,
      runId: "run-1",
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
