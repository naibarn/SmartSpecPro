import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSkillById,
  mockGetSkillByIdOrType,
  mockGetAvailableSkills,
} = vi.hoisted(() => ({
  mockGetSkillById: vi.fn(),
  mockGetSkillByIdOrType: vi.fn(),
  mockGetAvailableSkills: vi.fn(),
}));

vi.mock("../skillRegistry", () => ({
  getAvailableSkills: mockGetAvailableSkills,
  getSkillById: mockGetSkillById,
  getSkillByIdOrType: mockGetSkillByIdOrType,
}));

import {
  buildSystemPrompt,
  buildUserPrompt,
  resolvePromptEnhancementSkill,
} from "../promptEnhancementService";

describe("promptEnhancementService", () => {
  beforeEach(() => {
    mockGetSkillById.mockReset();
    mockGetSkillByIdOrType.mockReset();

    const skillMap: Record<string, any> = {
      image_prompt_engineer: {
        id: "image_prompt_engineer",
        name: "Image Prompt Engineer",
        category: "image_prompt_generation",
      },
      "video-prompt-engineer": {
        id: "video-prompt-engineer",
        name: "Video Prompt Engineer",
        category: "video_prompt_generation",
      },
      "create-image-prompt": {
        id: "create-image-prompt",
        name: "Create Image Prompt",
        category: "image_prompt_generation",
      },
    };

    mockGetSkillById.mockImplementation((id: string) => skillMap[id]);
    mockGetSkillByIdOrType.mockImplementation((id: string) => skillMap[id]);
    mockGetAvailableSkills.mockReturnValue([
      { id: "image_prompt_engineer", name: "Image Prompt Engineer", category: "image_prompt_generation", priority: 50 },
      { id: "video-prompt-engineer", name: "Video Prompt Engineer", category: "video_prompt_generation", priority: 40 },
    ]);
  });

  it("defaults to the image prompt skill when no skillId is provided", () => {
    const resolved = resolvePromptEnhancementSkill();
    expect(resolved.resolvedSkillId).toBe("image_prompt_engineer");
    expect(resolved.mediaType).toBe("image");
  });

  it("switches to video prompt behavior for video prompt skills", () => {
    const prompt = buildSystemPrompt({
      skillId: "video-prompt-engineer",
      userInput: "A cinematic travel reel through Bangkok at sunset",
      language: "en",
      aspectRatio: "9:16",
      targetPlatform: "veo",
    });

    expect(prompt).toContain("expert AI video prompt generator");
    expect(prompt).toContain("Optimize the prompt for veo");
    expect(prompt).toContain("Honor the requested aspect ratio: 9:16");
  });

  it("keeps image prompt behavior for image prompt skills", () => {
    const prompt = buildSystemPrompt({
      skillId: "image_prompt_engineer",
      userInput: "Luxury skincare bottle on reflective marble",
      language: "en",
    });

    expect(prompt).toContain("expert AI image prompt generator");
    expect(prompt).toContain("Prompt Structure Rules");
  });

  it("uses the selected media type when only reference images are provided", () => {
    const prompt = buildUserPrompt({
      skillId: "video-prompt-engineer",
      userInput: "",
      referenceImages: ["https://example.com/ref.png"],
    });

    expect(prompt).toContain("AI video generation");
  });
});
