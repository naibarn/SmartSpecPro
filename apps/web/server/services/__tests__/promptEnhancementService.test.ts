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
  parsePromptResponse,
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
      referenceImages: ["https://example.com/ref.png"],
      referenceNotes: "The attached image shows a small yellow dog with a blue collar and a red bandana.",
    });

    expect(prompt).toContain("expert AI video prompt generator");
    expect(prompt).toContain("Optimize the prompt for veo");
    expect(prompt).toContain("Honor the requested aspect ratio: 9:16");
    expect(prompt).toContain("continuity anchors for character identity, wardrobe, props, and scene layout");
    expect(prompt).toContain("preserve the same face, hairstyle, body shape, outfit colors, accessories, pose language, and signature props");
    expect(prompt).toContain("Reference notes: The attached image shows a small yellow dog with a blue collar and a red bandana.");
  });

  it("adds a language-aware character limit for video prompt skills", () => {
    const prompt = buildSystemPrompt({
      skillId: "video-prompt-engineer",
      userInput: "บรรยายคนเดินตลาดตอนเย็น",
      language: "th",
      maxPromptLength: 1200,
    });

    expect(prompt).toContain("Keep the total prompt under 1200 characters.");
    expect(prompt).toContain("The output is Thai, so keep phrasing especially compact");
  });

  it("keeps image prompt behavior for image prompt skills", () => {
    const prompt = buildSystemPrompt({
      skillId: "image_prompt_engineer",
      userInput: "Luxury skincare bottle on reflective marble",
      language: "en",
      referenceImages: ["https://example.com/ref.png"],
      referenceNotes: "The attached image shows a small yellow dog with a blue collar and a red bandana.",
    });

    expect(prompt).toContain("expert AI image prompt generator");
    expect(prompt).toContain("Prompt Structure Rules");
    expect(prompt).toContain("If any reference image is a character reference, preserve the same face, hairstyle, body shape, outfit colors, accessories, pose language, and signature props.");
    expect(prompt).toContain("Reference notes: The attached image shows a small yellow dog with a blue collar and a red bandana.");
  });

  it("uses the selected media type when only reference images are provided", () => {
    const prompt = buildUserPrompt({
      skillId: "video-prompt-engineer",
      userInput: "",
      referenceImages: ["https://example.com/ref.png"],
    });

    expect(prompt).toContain("AI video generation");
  });

  it("extracts prompt text from structured image prompt bundle JSON", () => {
    const parsed = parsePromptResponse(JSON.stringify({
      status: "completed",
      prompts: {
        short: "Create a sunset portrait.",
        detailed: "Create a cinematic sunset portrait with warm grading and subtle lens flare.",
        structured: "Topic: sunset portrait",
        negative_constraints: "watermark",
        variants: ["Create a cinematic sunset portrait with warm grading and subtle lens flare."],
      },
      quality_review: {
        pass_count: 1,
      },
    }));

    expect(parsed).toEqual({
      promptEn: "Create a cinematic sunset portrait with warm grading and subtle lens flare.",
      promptTh: "",
    });
  });

  it("extracts final_prompt from cinematic video structured JSON", () => {
    const parsed = parsePromptResponse(JSON.stringify({
      mode: "contact_sheet_2x3",
      aspect_ratio: "9:16",
      delivery_mode: "multi_shot_single_video_not_applicable",
      final_prompt: "Create a plain text cinematic image prompt from the selected reference.",
      prompt_sequence: [
        { prompt: "This should only be used if final_prompt is missing." },
      ],
    }));

    expect(parsed).toEqual({
      promptEn: "Create a plain text cinematic image prompt from the selected reference.",
      promptTh: "",
    });
  });

  it("extracts prompt_sequence when no final_prompt exists", () => {
    const parsed = parsePromptResponse(JSON.stringify({
      mode: "contact_sheet_2x3",
      prompt_sequence: [
        { prompt: "Prompt one." },
        { prompt: "Prompt two." },
      ],
    }));

    expect(parsed).toEqual({
      promptEn: "Prompt one. Prompt two.",
      promptTh: "",
    });
  });

  it("extracts prompt text from a structured JSON array response", () => {
    const parsed = parsePromptResponse(JSON.stringify([
      {
        mode: "angle_grid_3x3",
        aspect_ratio: "9:16",
        prompt_package: {
          master_prompt: "Use @Image1 as the reference and create one clean 3x3 angle grid prompt.",
        },
      },
    ]));

    expect(parsed).toEqual({
      promptEn: "Use @Image1 as the reference and create one clean 3x3 angle grid prompt.",
      promptTh: "",
    });
  });

  it("extracts prompt text from nested JSON string output", () => {
    const parsed = parsePromptResponse(JSON.stringify({
      success: true,
      output: JSON.stringify([
        {
          mode: "angle_grid_3x3",
          prompt_sequence: [
            { prompt: "Prompt from nested JSON string." },
          ],
        },
      ]),
    }));

    expect(parsed).toEqual({
      promptEn: "Prompt from nested JSON string.",
      promptTh: "",
    });
  });

  it("extracts prompt text from prompt_variants bundle JSON", () => {
    const parsed = parsePromptResponse(JSON.stringify({
      prompt_variants: [
        {
          prompt: "A young child walking along the beach with soft warm lighting and gentle ocean waves.",
          edit_prompt: "Enhance the colors to make the scene more vibrant.",
        },
        {
          prompt: "A playful child running on the sandy beach at sunset, laughing as ocean waves splash nearby.",
          edit_prompt: "Add a slight vignette and enhance the sunset colors.",
        },
      ],
    }));

    expect(parsed).toEqual({
      promptEn: "A young child walking along the beach with soft warm lighting and gentle ocean waves. A playful child running on the sandy beach at sunset, laughing as ocean waves splash nearby.",
      promptTh: "",
    });
  });
});
