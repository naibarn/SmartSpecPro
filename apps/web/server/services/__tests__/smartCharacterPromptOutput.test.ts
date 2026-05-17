import { describe, expect, it } from "vitest";

import {
  buildSmartCharacterLlmPrompt,
  buildSmartCharacterPromptOutput,
  sanitizeSmartCharacterPromptOutput,
  validateSmartCharacterPromptOutput,
} from "../smartCharacterPromptOutput";

describe("sanitizeSmartCharacterPromptOutput", () => {
  it("removes Midjourney-style aspect ratio suffixes", () => {
    expect(sanitizeSmartCharacterPromptOutput("ภาพถ่ายแฟชั่นสวยงาม --ar 9:16")).toBe("ภาพถ่ายแฟชั่นสวยงาม");
    expect(sanitizeSmartCharacterPromptOutput("Portrait prompt --aspect=4:5")).toBe("Portrait prompt");
  });

  it("keeps natural-language aspect ratio wording", () => {
    expect(sanitizeSmartCharacterPromptOutput("vertical 9:16 composition with soft light")).toBe(
      "vertical 9:16 composition with soft light",
    );
  });

  it("builds fast deterministic prompt output without command suffixes", () => {
    const output = buildSmartCharacterPromptOutput({
      prompt_count: 1,
      shot_types: "medium",
      aspect_ratio: "9:16",
      character_profile: {
        name: "Mina",
        age: { specific_age: 17 },
        hair: { color: "dark_brown" },
      },
      generation_preferences: {
        style_direction: "fashion_editorial",
      },
    });

    expect(output).toContain("MEDIUM SHOT");
    expect(output).toContain("Mina");
    expect(output).toContain("vertical 9:16 composition");
    expect(output).not.toContain("--ar");
  });

  it("builds a compact LLM prompt that forbids platform suffixes", () => {
    const prompt = buildSmartCharacterLlmPrompt({
      prompt_count: 1,
      shot_types: "portrait",
      aspect_ratio: "9:16",
      character_profile: { name: "Mina" },
      generation_preferences: { style_direction: "fashion_editorial" },
    });

    expect(prompt).toContain("Generate copy-ready AI image prompts");
    expect(prompt).toContain("Do not include Midjourney/platform command suffixes");
    expect(prompt).toContain("vertical 9:16 composition");
  });

  it("does not require or invent a character name", () => {
    const prompt = buildSmartCharacterLlmPrompt({
      prompt_count: 1,
      shot_types: "portrait",
      character_profile: {},
    });
    const fallbackOutput = buildSmartCharacterPromptOutput({
      prompt_count: 1,
      shot_types: "portrait",
      character_profile: {},
    });

    expect(prompt).toContain("No character name was provided");
    expect(prompt).not.toContain("Character name: .");
    expect(fallbackOutput).toContain("portrait shot.");
    expect(fallbackOutput).not.toContain("of .");
  });

  it("rejects empty or unusable LLM prompt output", () => {
    expect(validateSmartCharacterPromptOutput("")).toEqual({
      ok: false,
      reason: "LLM returned an empty prompt.",
    });
    expect(validateSmartCharacterPromptOutput("ok")).toEqual({
      ok: false,
      reason: "LLM returned a prompt that is too short to use.",
    });
  });

  it("accepts usable LLM prompt output after sanitizing command suffixes", () => {
    const result = validateSmartCharacterPromptOutput(
      "A cinematic portrait shot of a modern character in natural window lighting, realistic photography, detailed skin texture, confident pose, soft background, balanced vertical composition --ar 9:16",
    );

    expect(result).toEqual({
      ok: true,
      content: "A cinematic portrait shot of a modern character in natural window lighting, realistic photography, detailed skin texture, confident pose, soft background, balanced vertical composition",
    });
  });
});
