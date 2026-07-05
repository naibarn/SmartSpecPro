import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(),
}));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
    },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import { generateCharacterVisualPrompts } from "../verticalDramaCharacterImageGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import {
  resolveStoryBibleModel,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../verticalDramaStoryBible";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function baseParams(
  overrides: Partial<Parameters<typeof generateCharacterVisualPrompts>[0]> = {},
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    characterId: 7,
    characterKey: "char-1",
    name: "Alice",
    role: "lead",
    description: "A brave detective",
    storyContext: { title: "My Series", genre: "noir", tone: "dark" },
    ...overrides,
  };
}

function validCharacter(characterId = "char-1") {
  return {
    character_id: characterId,
    name: "Alice",
    visual_identity_summary: "Tall, dark hair, trench coat",
    primary_portrait_prompt: "A portrait of Alice, tall with dark hair, wearing a trench coat",
    negative_prompt: "blurry, low quality",
    attachment_package: [{ type: "reference", value: "x" }],
  };
}

function validOutput(characters = [validCharacter()]) {
  return {
    visual_bible_summary: {},
    characters,
    plain_text_summary: "Summary text",
    storyboard_attachment_manifest: {},
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 150, completion_tokens: 80 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

describe("generateCharacterVisualPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(4);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
  });

  it("happy path: valid LLM response projects portrait/negative prompt, deducts credits once", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterVisualPrompts(baseParams());

    expect(result.portraitPrompt).toBe(
      "A portrait of Alice, tall with dark hair, wearing a trench coat",
    );
    expect(result.negativePrompt).toBe("blurry, low quality");
    expect(result.creditsUsed).toBe(4);
    expect(result.model).toBe("gpt-4o-mini");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        amount: 4,
        metadata: expect.objectContaining({ characterId: 7, seriesId: 42 }),
      }),
    );
  });

  it("falls back to the first character when character_id does not match characterKey", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput([validCharacter("some-other-id")])));

    const result = await generateCharacterVisualPrompts(baseParams());

    expect(result.raw.characters[0].character_id).toBe("some-other-id");
    expect(result.portraitPrompt).toContain("Alice");
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateCharacterVisualPrompts(baseParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output and does not deduct credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ visual_bible_summary: {}, characters: [], plain_text_summary: "x" }),
    ); // characters must be min(1)

    await expect(generateCharacterVisualPrompts(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
