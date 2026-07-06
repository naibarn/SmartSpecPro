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
import {
  generateCharacterVisualPrompts,
  resolveCharacterRoleTier,
  getRoleTierAppearanceDirective,
  getRoleTierNegativeTerms,
  extractAgeFromDescription,
  detectChildGenderHint,
} from "../verticalDramaCharacterImageGeneration";
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

describe("resolveCharacterRoleTier", () => {
  it.each([
    ["นางเอก", "lead_female"],
    ["Female Lead", "lead_female"],
    ["leading lady", "lead_female"],
    ["heroine", "lead_female"],
    ["  นางเอกวัยรุ่น  ", "lead_female"],
  ])("maps %s to lead_female", (role, expected) => {
    expect(resolveCharacterRoleTier(role)).toBe(expected);
  });

  it.each([
    ["พระเอก", "lead_male"],
    ["Male Lead", "lead_male"],
    ["leading man", "lead_male"],
    ["  พระเอกวัยรุ่น  ", "lead_male"],
  ])("maps %s to lead_male", (role, expected) => {
    expect(resolveCharacterRoleTier(role)).toBe(expected);
  });

  it.each([
    ["คู่หลัก", "lead"],
    ["ตัวหลัก", "lead"],
    ["ตัวเอก", "lead"],
    ["Protagonist", "lead"],
    ["lead role", "lead"],
  ])("maps %s to lead (gender-neutral)", (role, expected) => {
    expect(resolveCharacterRoleTier(role)).toBe(expected);
  });

  it.each([
    ["ตัวร้าย", "villain"],
    ["วายร้าย", "villain"],
    ["ผู้ร้าย", "villain"],
    ["Antagonist", "villain"],
    ["villain", "villain"],
  ])("maps %s to villain", (role, expected) => {
    expect(resolveCharacterRoleTier(role)).toBe(expected);
  });

  it.each([
    ["ตัวประกอบ", "support"],
    ["สมทบ", "support"],
    ["Supporting", "support"],
    ["extra", "support"],
    ["background", "support"],
  ])("maps %s to support", (role, expected) => {
    expect(resolveCharacterRoleTier(role)).toBe(expected);
  });

  it("falls back to 'other' for unrecognized roles", () => {
    expect(resolveCharacterRoleTier("narrator")).toBe("other");
    expect(resolveCharacterRoleTier("")).toBe("other");
    expect(resolveCharacterRoleTier(null)).toBe("other");
    expect(resolveCharacterRoleTier(undefined)).toBe("other");
  });

  it("is case-insensitive and whitespace-tolerant", () => {
    expect(resolveCharacterRoleTier("  MALE LEAD  ")).toBe("lead_male");
    expect(resolveCharacterRoleTier("VILLAIN")).toBe("villain");
  });

  it.each([
    ["ตัวร้ายหญิง", "villain_female"],
    ["นางร้าย", "villain_female"],
    ["Female Antagonist", "villain_female"],
    ["female villain", "villain_female"],
  ])("maps %s to villain_female", (role, expected) => {
    expect(resolveCharacterRoleTier(role)).toBe(expected);
  });

  it.each([
    ["ตัวร้ายชาย", "villain_male"],
    ["วายร้ายชาย", "villain_male"],
    ["Male Antagonist", "villain_male"],
    ["male villain", "villain_male"],
  ])("maps %s to villain_male", (role, expected) => {
    expect(resolveCharacterRoleTier(role)).toBe(expected);
  });

  it("falls back to the neutral villain tier when gender is unclear", () => {
    expect(resolveCharacterRoleTier("ตัวร้าย")).toBe("villain");
    expect(resolveCharacterRoleTier("antagonist")).toBe("villain");
  });

  describe("child tier — highest precedence", () => {
    it("detects a child from explicit Thai child-role keywords in the role field", () => {
      expect(resolveCharacterRoleTier("เด็กชาย")).toBe("child");
      expect(resolveCharacterRoleTier("เด็กหญิง")).toBe("child");
      expect(resolveCharacterRoleTier("เด็ก")).toBe("child");
    });

    it("detects a child from English child-role keywords", () => {
      expect(resolveCharacterRoleTier("child")).toBe("child");
      expect(resolveCharacterRoleTier("kid")).toBe("child");
    });

    it("detects a child from a stated age under 15 in the description (Arabic numerals)", () => {
      expect(resolveCharacterRoleTier("supporting", "12 ปี, a curious kid")).toBe("child");
      expect(resolveCharacterRoleTier(null, "อายุ 8, lives with grandmother")).toBe("child");
      expect(resolveCharacterRoleTier(null, "a 9-year-old girl")).toBe("child");
      expect(resolveCharacterRoleTier(null, "age 10, loves to draw")).toBe("child");
    });

    it("detects a child from a stated age spelled with Thai numerals (๐-๙)", () => {
      expect(resolveCharacterRoleTier(null, "อายุ ๑๒ ปี")).toBe("child");
    });

    it("detects a child from a stated age spelled with Thai number-words", () => {
      expect(resolveCharacterRoleTier(null, "เด็กชายวัยสิบสองปีที่ฉลาดเกินวัย".replace("เด็กชาย", ""))).toBe(
        "child",
      );
      expect(resolveCharacterRoleTier(null, "อายุสิบขวบ")).toBe("child");
      expect(resolveCharacterRoleTier(null, "วัยเก้าปี")).toBe("child");
    });

    it("does NOT detect a child when age is 15 or older", () => {
      expect(resolveCharacterRoleTier("นางเอก", "15 ปี, a determined teenager")).not.toBe("child");
      expect(resolveCharacterRoleTier(null, "อายุ 20 ปี")).not.toBe("child");
    });

    it("child tier OVERRIDES an explicit lead/villain role label — highest precedence", () => {
      expect(resolveCharacterRoleTier("นางเอก", "เด็กหญิงวัยสิบขวบที่เป็นตัวเอกของเรื่อง")).toBe("child");
      expect(resolveCharacterRoleTier("พระเอก", "a 12-year-old boy")).toBe("child");
      expect(resolveCharacterRoleTier("ตัวร้าย", "เด็กชายวัยเก้าขวบ")).toBe("child");
    });

    it("falls through to normal tier resolution when no child keyword/age is present", () => {
      expect(resolveCharacterRoleTier("นางเอก", "late-20s single mother")).toBe("lead_female");
      expect(resolveCharacterRoleTier("ตัวร้าย", "early-40s corporate raider")).toBe("villain");
    });

    it("handles an absent description gracefully (no age false-positive)", () => {
      expect(resolveCharacterRoleTier("นางเอก")).toBe("lead_female");
      expect(resolveCharacterRoleTier("นางเอก", null)).toBe("lead_female");
      expect(resolveCharacterRoleTier("นางเอก", undefined)).toBe("lead_female");
    });
  });
});

describe("extractAgeFromDescription", () => {
  it("extracts an age from Arabic-numeral Thai patterns", () => {
    expect(extractAgeFromDescription("12 ปี")).toBe(12);
    expect(extractAgeFromDescription("อายุ 8 ขวบ")).toBe(8);
    expect(extractAgeFromDescription("เด็กหญิงอายุ 10")).toBe(10);
  });

  it("extracts an age from English patterns", () => {
    expect(extractAgeFromDescription("a 9-year-old girl")).toBe(9);
    expect(extractAgeFromDescription("age 10, loves to draw")).toBe(10);
    expect(extractAgeFromDescription("aged: 7")).toBe(7);
    expect(extractAgeFromDescription("12 years old")).toBe(12);
  });

  it("extracts an age from Thai numerals (๐-๙)", () => {
    expect(extractAgeFromDescription("อายุ ๑๒ ปี")).toBe(12);
    expect(extractAgeFromDescription("๙ ขวบ")).toBe(9);
  });

  it("extracts an age from Thai number-words", () => {
    expect(extractAgeFromDescription("อายุสิบขวบ")).toBe(10);
    expect(extractAgeFromDescription("วัยเก้าปี")).toBe(9);
    expect(extractAgeFromDescription("สิบสองปี")).toBe(12);
    expect(extractAgeFromDescription("สิบเอ็ดขวบ")).toBe(11);
  });

  it("returns undefined when no age is present", () => {
    expect(extractAgeFromDescription("a brave detective")).toBeUndefined();
    expect(extractAgeFromDescription("")).toBeUndefined();
    expect(extractAgeFromDescription(null)).toBeUndefined();
    expect(extractAgeFromDescription(undefined)).toBeUndefined();
  });

  it("returns the smallest age when multiple numbers appear (favors the safer/younger read)", () => {
    // "12 ปี" and an unrelated "8 คน" (8 people) style number should not
    // confuse detection — but if two AGE-shaped numbers both match, prefer
    // the smaller (safer) one.
    expect(extractAgeFromDescription("อายุ 12 ปี พี่ชายอายุ 8 ปี")).toBe(8);
  });
});

describe("detectChildGenderHint", () => {
  it("detects male from เด็กชาย/boy", () => {
    expect(detectChildGenderHint("เด็กชายวัยเก้าขวบ")).toBe("male");
    expect(detectChildGenderHint("a 9-year-old boy")).toBe("male");
  });

  it("detects female from เด็กหญิง/girl", () => {
    expect(detectChildGenderHint("เด็กหญิงวัยสิบขวบ")).toBe("female");
    expect(detectChildGenderHint("a 10-year-old girl")).toBe("female");
  });

  it("returns undefined when no gender hint is present", () => {
    expect(detectChildGenderHint("เด็กวัยสิบขวบ")).toBeUndefined();
    expect(detectChildGenderHint(null)).toBeUndefined();
  });
});

describe("getRoleTierAppearanceDirective", () => {
  it("returns the modern heroine archetype directive for female lead roles (นางเอก)", () => {
    const directive = getRoleTierAppearanceDirective("นางเอก");
    expect(directive).toBeDefined();
    expect(directive).toMatch(/emotionally magnetic/i);
    expect(directive).toMatch(/natural beauty/i);
    expect(directive).toMatch(/expressive eyes capable of tears/i);
    expect(directive).toMatch(/vulnerable yet determined/i);
    expect(directive).toMatch(/never change or imply/i);
  });

  it("returns the modern male-lead archetype directive for male lead roles (พระเอก)", () => {
    const directive = getRoleTierAppearanceDirective("พระเอก");
    expect(directive).toBeDefined();
    expect(directive).toMatch(/cold-ceo energy/i);
    expect(directive).toMatch(/quiet dominance/i);
    expect(directive).toMatch(/hidden pain/i);
    expect(directive).toMatch(/never change or imply/i);
  });

  it("returns a merged neutral directive for gender-ambiguous lead roles", () => {
    const directive = getRoleTierAppearanceDirective("ตัวเอก");
    expect(directive).toBeDefined();
    expect(directive).toMatch(/emotionally magnetic/i);
    expect(directive).toMatch(/gender-neutral/i);
  });

  it("returns an attractive-but-sharp directive for villain roles", () => {
    const directive = getRoleTierAppearanceDirective("ตัวร้าย");
    expect(directive).toBeDefined();
    expect(directive).toMatch(/strikingly attractive/i);
    expect(directive).toMatch(/sharp|cold|dangerous/i);
  });

  it("returns undefined (no forced glamour) for support roles", () => {
    expect(getRoleTierAppearanceDirective("ตัวประกอบ")).toBeUndefined();
  });

  it("returns undefined for 'other'/unrecognized roles", () => {
    expect(getRoleTierAppearanceDirective("narrator")).toBeUndefined();
    expect(getRoleTierAppearanceDirective(null)).toBeUndefined();
  });

  it("returns the female-antagonist archetype directive for villain_female roles (ตัวร้ายหญิง/นางร้าย)", () => {
    const directive = getRoleTierAppearanceDirective("นางร้าย");
    expect(directive).toBeDefined();
    expect(directive).toMatch(/beautiful and sharp-featured/i);
    expect(directive).toMatch(/elegant high-status aura/i);
    expect(directive).toMatch(/hidden agenda/i);
    expect(directive).toMatch(/high-society rival/i);
  });

  it("returns the male-antagonist archetype directive for villain_male roles (ตัวร้ายชาย)", () => {
    const directive = getRoleTierAppearanceDirective("ตัวร้ายชาย");
    expect(directive).toBeDefined();
    expect(directive).toMatch(/dangerously attractive/i);
    expect(directive).toMatch(/sharp predatory gaze/i);
    expect(directive).toMatch(/luxury villain energy/i);
  });

  it("returns the child-safety directive and OVERRIDES the lead directive for a child described in a lead role", () => {
    const directive = getRoleTierAppearanceDirective("นางเอก", "เด็กหญิงวัยสิบขวบ");
    expect(directive).toBeDefined();
    expect(directive).toMatch(/age-appropriate and memorable child character/i);
    expect(directive).toMatch(/depicted strictly age-appropriately/i);
    expect(directive).not.toMatch(/emotionally magnetic/i);
  });

  it("returns the child-safety directive for an explicit child role keyword with no lead label", () => {
    const directive = getRoleTierAppearanceDirective("เด็กชาย");
    expect(directive).toBeDefined();
    expect(directive).toMatch(/curious gaze/i);
    expect(directive).toMatch(/simple modest everyday outfit/i);
  });
});

describe("getRoleTierNegativeTerms", () => {
  it("returns the heroine negative terms for female lead roles (นางเอก)", () => {
    const negatives = getRoleTierNegativeTerms("นางเอก");
    expect(negatives).toBeDefined();
    expect(negatives).toMatch(/fashion model look/i);
    expect(negatives).toMatch(/corporate portrait/i);
    expect(negatives).toMatch(/over-glam makeup/i);
    expect(negatives).toMatch(/plastic skin/i);
    expect(negatives).toMatch(/generic pretty face/i);
  });

  it("returns the male-lead negative terms for male lead roles (พระเอก)", () => {
    const negatives = getRoleTierNegativeTerms("พระเอก");
    expect(negatives).toBeDefined();
    expect(negatives).toMatch(/model photoshoot/i);
    expect(negatives).toMatch(/corporate portrait/i);
    expect(negatives).toMatch(/influencer smile/i);
    expect(negatives).toMatch(/boyband look/i);
    expect(negatives).toMatch(/generic handsome face/i);
  });

  it("returns undefined for the neutral villain/support/other tiers", () => {
    expect(getRoleTierNegativeTerms("ตัวร้าย")).toBeUndefined();
    expect(getRoleTierNegativeTerms("ตัวประกอบ")).toBeUndefined();
    expect(getRoleTierNegativeTerms("narrator")).toBeUndefined();
    expect(getRoleTierNegativeTerms(null)).toBeUndefined();
  });

  it("returns the female-antagonist negative terms for villain_female roles (นางร้าย)", () => {
    const negatives = getRoleTierNegativeTerms("นางร้าย");
    expect(negatives).toBeDefined();
    expect(negatives).toMatch(/exaggerated evil face/i);
    expect(negatives).toMatch(/overly seductive styling/i);
    expect(negatives).toMatch(/revealing outfit/i);
    expect(negatives).toMatch(/generic influencer look/i);
  });

  it("returns the male-antagonist negative terms for villain_male roles (ตัวร้ายชาย)", () => {
    const negatives = getRoleTierNegativeTerms("ตัวร้ายชาย");
    expect(negatives).toBeDefined();
    expect(negatives).toMatch(/cartoon villain/i);
    expect(negatives).toMatch(/exaggerated anger/i);
    expect(negatives).toMatch(/fantasy costume/i);
  });

  it("returns the strict child-safety negative terms, overriding the lead negatives, when a child age is described", () => {
    const negatives = getRoleTierNegativeTerms("นางเอก", "เด็กหญิงวัยสิบขวบ");
    expect(negatives).toBeDefined();
    expect(negatives).toMatch(/adult beauty styling/i);
    expect(negatives).toMatch(/glamorous makeup/i);
    expect(negatives).toMatch(/seductive pose/i);
    expect(negatives).toMatch(/revealing outfit/i);
    expect(negatives).toMatch(/mature expression/i);
    expect(negatives).toMatch(/romantic tension/i);
    expect(negatives).not.toMatch(/fashion model look, corporate portrait, over-glam makeup, plastic skin, generic pretty face/i);
  });
});

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
    expect(result.negativePrompt).toContain("blurry, low quality");
    expect(result.negativePrompt).toContain("no other people");
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

  it("includes the character's description (age/gender/core traits) in the LLM user prompt", async () => {
    // Regression test for the "portrait ignores description" bug — a 12-year-old
    // character (description sourced from `data.description` via the router's
    // `extractCharacterDescription`) must have that text land in the prompt sent
    // to the LLM, not just name+role, otherwise the model invents an unconstrained
    // (e.g. adult) identity.
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(
      baseParams({
        name: "ปัณณ์",
        description:
          "Description: เด็กชายวัยสิบสองปีที่ฉลาดเกินวัยและปกป้องแม่เสมอไม่ว่าจะเกิดอะไรขึ้น",
      }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();
    expect(userMessage!.content).toContain("เด็กชายวัยสิบสองปี");
    expect(userMessage!.content).toContain('"description"');
  });

  it("omits the description key entirely from the LLM user prompt when none is provided", async () => {
    // Guards the other branch of `buildUserPrompt`'s `...(params.description ? {...} : {})`
    // spread — confirms the bug's exact symptom (name+role only) reproduces
    // when description is absent, so a future regression is caught either way.
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ description: undefined }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user");
    expect(userMessage!.content).not.toContain('"description"');
  });

  it("injects the modern heroine archetype directive into the LLM user prompt for นางเอก", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ role: "นางเอก" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain('"appearance_directive"');
    expect(userMessage).toMatch(/emotionally magnetic/i);
    expect(userMessage).toMatch(/vulnerable yet determined/i);
    expect(userMessage).toMatch(/MANDATORY appearance directive/);
    // Tier-specific negatives must also be instructed for merge.
    expect(userMessage).toMatch(/fashion model look, corporate portrait, over-glam makeup, plastic skin, generic pretty face/i);
  });

  it("injects the modern male-lead archetype directive into the LLM user prompt for พระเอก", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ role: "พระเอก" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/cold-ceo energy/i);
    expect(userMessage).toMatch(/quiet dominance/i);
    expect(userMessage).toMatch(/model photoshoot, corporate portrait, influencer smile, boyband look, generic handsome face/i);
  });

  it("injects the attractive-but-sharp villain directive into the LLM user prompt for ตัวร้าย", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ role: "ตัวร้าย" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/strikingly attractive/i);
    expect(userMessage).not.toMatch(/emotionally magnetic/i);
    expect(userMessage).not.toMatch(/cold-ceo energy/i);
  });

  it("injects the modern female-antagonist directive into the LLM user prompt for นางร้าย", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ role: "นางร้าย" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/beautiful and sharp-featured/i);
    expect(userMessage).toMatch(/hidden agenda/i);
    expect(userMessage).toMatch(/exaggerated evil face, fantasy villain styling, overly seductive styling, revealing outfit, beauty pageant pose, generic influencer look, plastic skin/i);
  });

  it("injects the modern male-antagonist directive into the LLM user prompt for ตัวร้ายชาย", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ role: "ตัวร้ายชาย" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/dangerously attractive/i);
    expect(userMessage).toMatch(/luxury villain energy/i);
    expect(userMessage).toMatch(/cartoon villain, exaggerated anger, fantasy costume, generic handsome model, corporate portrait, plastic skin/i);
  });

  it("injects the child-safety directive and negatives, overriding any lead directive, when the description states a child age", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(
      baseParams({ role: "พระเอก", description: "a 9-year-old boy who is the story's protagonist" }),
    );

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/age-appropriate and memorable child character/i);
    expect(userMessage).toMatch(/adult beauty styling, glamorous makeup, seductive pose, revealing outfit, mature expression, romantic tension, fashion model look, plastic skin/i);
    expect(userMessage).not.toMatch(/cold-ceo energy/i);
  });

  it("defensively includes the child-safety negative terms in the final result even when the LLM omits them", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterVisualPrompts(
      baseParams({ role: "นางเอก", description: "เด็กหญิงวัยสิบขวบ" }),
    );

    expect(result.negativePrompt).toContain("adult beauty styling");
    expect(result.negativePrompt).toContain("plastic skin");
  });

  it("does NOT inject any glamour directive for ตัวประกอบ (support)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ role: "ตัวประกอบ" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain('"appearance_directive"');
    expect(userMessage).not.toMatch(/emotionally magnetic/i);
    expect(userMessage).not.toMatch(/strikingly attractive/i);
  });

  it("child-safety tier overrides an explicit lead role label when the description states a child age", async () => {
    // A character labeled นางเอก (lead) but described as a 10-year-old child
    // must resolve to the `child` tier, not the lead tier — child detection
    // has the highest precedence and always wins, per the child-safety
    // archetype extension. The description text (which carries the age) must
    // still reach the prompt verbatim.
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(
      baseParams({
        role: "นางเอก",
        description: "Description: เด็กหญิงวัยสิบขวบที่เป็นตัวเอกของเรื่อง",
      }),
    );

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("เด็กหญิงวัยสิบขวบ");
    expect(userMessage).toMatch(/age-appropriate and memorable child character/i);
    expect(userMessage).toMatch(/depicted strictly age-appropriately/i);
    expect(userMessage).not.toMatch(/emotionally magnetic/i);
  });

  it("injects the MANDATORY solo-portrait rule into the LLM user prompt", async () => {
    // Regression test for the "single mother sacrificing for her child"
    // evidence — a portrait prompt must never add a second person to the
    // frame just because the backstory mentions one.
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/exactly ONE person/i);
    expect(userMessage).toMatch(/solo portrait/i);
    expect(userMessage).toMatch(/no other people/i);
    expect(userMessage).toMatch(/no children/i);
    expect(userMessage).toMatch(/backstory.*mood|mood.*backstory/is);
  });

  it("instructs the solo-portrait negative terms to be appended to every negative_prompt", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/no other people, no second person, no children/i);
  });

  it("defensively appends the solo-portrait negative terms to the result even when the LLM omits them", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterVisualPrompts(baseParams());

    expect(result.negativePrompt).toContain("blurry, low quality");
    expect(result.negativePrompt).toContain("no other people");
    expect(result.negativePrompt).toContain("no children");
  });

  it("injects full cinematic-language guidance (lens, color grade, grain, lighting, bokeh background)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/85mm|portrait lens/i);
    expect(userMessage).toMatch(/color grade/i);
    expect(userMessage).toMatch(/film grain|texture/i);
    expect(userMessage).toMatch(/key light/i);
    expect(userMessage).toMatch(/out of focus|bokeh/i);
  });

  it("injects the default target-audience region descriptor when provided", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ targetAudienceRegion: "east_asian" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/East Asian \(Chinese\/Korean\/Japanese\)/i);
    expect(userMessage).toMatch(/always takes precedence/i);
  });

  it("defaults to the Thai/Southeast Asian region descriptor when targetAudienceRegion is omitted", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ targetAudienceRegion: undefined }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toMatch(/Thai\/Southeast Asian/i);
  });

  it("the region instruction never overrides an explicit ethnicity/nationality already in the character's description", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(
      baseParams({
        targetAudienceRegion: "western",
        description: "Description: a Japanese exchange student living in Bangkok",
      }),
    );

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    // Both the character's own description and the precedence rule must be
    // present — the description text itself is untouched/unfiltered, and the
    // region instruction explicitly defers to it.
    expect(userMessage).toContain("Japanese exchange student");
    expect(userMessage).toMatch(/description does not already/i);
    expect(userMessage).toMatch(/always takes precedence/i);
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
