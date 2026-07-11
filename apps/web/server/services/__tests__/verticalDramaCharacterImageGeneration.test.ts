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
// Phase 6 (`planning/vertical-drama-centralized-model-policy/plan.md`) —
// `resolveCharacterVisualBibleModel`'s auto-fallback now uses
// `resolveQualityLargeContextModelId` (was `resolveStoryBibleModel`).
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));
// Centralized per-series model policy resolver
// (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 2) — its
// own override/fallback contract is covered by
// `verticalDramaLlmModelPolicy.test.ts`; here it's mocked as a pure
// passthrough to `autoFallback` (the mocked `resolveQualityLargeContextModelId`
// above) so this file's pre-existing "no override configured" behavior/
// assertions (`resolveCharacterVisualBibleModel` now delegates through the
// centralized resolver instead of being a plain alias) are unaffected and no
// real DB access happens.
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));
const { mockGetPrimaryPortraitUrl } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
}));
vi.mock("../verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl },
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateCharacterVisualPrompts,
  resolveCharacterRoleTier,
  extractAgeFromDescription,
  detectChildGenderHint,
  readPresetVisualIdentityFromBible,
  pickMatchingCharacterArchetype,
  buildCharacterVisualPromptsUserPrompt,
  resolveFaceSourceReferenceForCharacter,
} from "../verticalDramaCharacterImageGeneration";
import type { VerticalDramaPresetVisualIdentity } from "@shared/verticalDramaSeries/presetVisualIdentity";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import {
  resolveStoryBibleModel,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "../verticalDramaImproveScript";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockResolveQualityModel = vi.mocked(resolveQualityLargeContextModelId);
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
    // These four are now REQUIRED (vertical-drama-skill-first-architecture
    // plan, Phase 2, item 3 — no more code-authored fallback), so every
    // success-path mock response must supply them with real, distinct,
    // non-empty content.
    turnaround_prompt: "360 turnaround of Alice, consistent identity anchors, tall with dark hair",
    full_body_prompt: "Full body of Alice, standing pose, head to toe visible, trench coat",
    expression_sheet_prompt: "Expression sheet of Alice: neutral, happy, surprised, sad",
    outfit_sheet_prompt: "Outfit sheet of Alice wearing her signature trench coat",
    negative_prompt:
      "blurry, low quality, no other people, no second person, no children, no extra person, " +
      "no crowd, no background figures, no hands of others",
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

  it("maps generic lead with female/mother indicator (e.g. แม่ ตัวเอก) to lead_female", () => {
    expect(resolveCharacterRoleTier("แม่ ตัวเอก")).toBe("lead_female");
    expect(resolveCharacterRoleTier("ตัวเอก", "หญิงสาววัย 25 ปี")).toBe("lead_female");
  });

  it("maps generic lead with male indicator to lead_male", () => {
    expect(resolveCharacterRoleTier("พ่อ ตัวเอก")).toBe("lead_male");
    expect(resolveCharacterRoleTier("ตัวเอก", "ชายหนุ่มวัย 28 ปี")).toBe("lead_male");
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

// `getRoleTierAppearanceDirective`/`getRoleTierNegativeTerms` were removed
// (vertical-drama-skill-first-architecture plan, Phase 2, item 1) — the
// TypeScript `ROLE_TIER_DIRECTIVES`/`ROLE_TIER_NEGATIVE_TERMS` tables they
// read from used to duplicate, and override, skill.md's own role-tier
// archetype table. Role-tier appearance/negative-term authorship is now
// entirely the skill's responsibility; see
// `verticalDramaCharacterVisualBible.skillContent.test.ts` for regression
// coverage that skill.md's own table/examples remain complete, and the
// "does NOT inject a code-authored appearance_directive" test below for
// regression coverage that this module never reintroduces the override.

describe("generateCharacterVisualPrompts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockResolveQualityModel.mockResolvedValue("gpt-4o-mini");
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

  it("does NOT inject a code-authored appearance_directive into the LLM user prompt (Phase 2 item 1 — trust the skill)", async () => {
    // Regression guard against reintroducing `ROLE_TIER_DIRECTIVES`/
    // `ROLE_TIER_NEGATIVE_TERMS`-style code-authored, "MANDATORY...
    // authoritative" role-tier prose — role-tier appearance guidance is now
    // solely authored by skill.md's own archetype table (see
    // `verticalDramaCharacterVisualBible.skillContent.test.ts`).
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ role: "นางเอก" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain('"appearance_directive"');
    expect(userMessage).not.toMatch(/MANDATORY appearance directive/i);
    expect(userMessage).not.toMatch(/role-appearance negative terms/i);
  });

  it("passes the character's raw role/description through as plain facts and instructs the skill to derive its own role tier", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams({ role: "พระเอก" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain('"role": "พระเอก"');
    expect(userMessage).toMatch(/Derive this character's role\s+tier/i);
  });

  it("does NOT inject the solo-portrait rule or cinematic-language guidance into the LLM user prompt (Phase 2 item 2 — relocated to skill.md)", async () => {
    // Regression test for the "single mother sacrificing for her child"
    // evidence that originally motivated the solo-portrait rule — that rule
    // now lives entirely in skill.md's "Solo-portrait identity reference"
    // section (see `verticalDramaCharacterVisualBible.skillContent.test.ts`),
    // not as code-injected user-prompt text.
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    await generateCharacterVisualPrompts(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toMatch(/MANDATORY solo-portrait rule/i);
    expect(userMessage).not.toMatch(/85mm f\/1\.8/i);
    expect(userMessage).not.toMatch(/portrait lens/i);
    expect(userMessage).not.toMatch(/color grade/i);
    expect(userMessage).not.toMatch(/bokeh/i);
  });

  it("passes the skill's own negative_prompt/derived-prompt output straight through, with no code-authored merge of role-tier or solo-portrait negative terms", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterVisualPrompts(
      baseParams({ role: "นางเอก", description: "เด็กหญิงวัยสิบขวบ" }),
    );

    // `validCharacter()`'s own `negative_prompt` already carries the
    // solo-portrait terms — this proves they came from the (mocked) skill
    // response itself, not a code-side force-merge.
    expect(result.negativePrompt).toBe(
      "blurry, low quality, no other people, no second person, no children, no extra person, " +
        "no crowd, no background figures, no hands of others",
    );
  });

  it("reads turnaroundPrompt/fullBodyPrompt/expressionSheetPrompt/outfitSheetPrompt directly from the LLM response — no code-authored fallback (Phase 2 item 3)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterVisualPrompts(baseParams());

    expect(result.turnaroundPrompt).toBe(
      "360 turnaround of Alice, consistent identity anchors, tall with dark hair",
    );
    expect(result.fullBodyPrompt).toBe(
      "Full body of Alice, standing pose, head to toe visible, trench coat",
    );
    expect(result.expressionSheetPrompt).toBe("Expression sheet of Alice: neutral, happy, surprised, sad");
    expect(result.outfitSheetPrompt).toBe("Outfit sheet of Alice wearing her signature trench coat");
  });

  it.each([
    ["turnaround_prompt", "turnaroundPrompt"],
    ["full_body_prompt", "fullBodyPrompt"],
    ["expression_sheet_prompt", "expressionSheetPrompt"],
    ["outfit_sheet_prompt", "outfitSheetPrompt"],
  ])(
    "throws VdSchemaValidationError (no silent fallback) when the LLM response omits required field %s",
    async (field) => {
      mockHasEnoughCredits.mockResolvedValue(true);
      const character = validCharacter() as Record<string, unknown>;
      delete character[field];
      mockExecute.mockResolvedValue(successResponse(validOutput([character as any])));

      await expect(generateCharacterVisualPrompts(baseParams())).rejects.toThrow(VdSchemaValidationError);
      expect(mockDeductCredits).not.toHaveBeenCalled();
    },
  );

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

/* -------------------------------------------------------------------------- */
/* Preset visual identity flow-through (spec §8.2.2 flow-through rule,        */
/* section-15 change D)                                                       */
/* -------------------------------------------------------------------------- */

function fullIdentity(overrides: Partial<VerticalDramaPresetVisualIdentity> = {}): VerticalDramaPresetVisualIdentity {
  return {
    styleName: "Neon Bio-Jungle Tech",
    palette: ["Teal", "Bioluminescent Green", "Deep Jungle Black"],
    lighting: "bioluminescent rim light",
    environmentMotifs: ["glowing orchids"],
    wardrobeGrammar: ["techwear scout suit", "tactical straps"],
    signaturePropsAndCompanions: ["cyber tiger companion"],
    cameraGrammar: "low-angle hero portrait, centered 9:16",
    characterArchetypes: [
      { role: "นางเอก/องครักษ์ป่า", look: "techwear scout with glowing seams" },
      { role: "สหายสัตว์ประหลาด", look: "tiger-machine hybrid, glowing blue plating" },
    ],
    imagePromptFragments: {
      positive: ["bioluminescent jungle glow", "neon teal-green rim light"],
      negative: ["urban skyline", "daylight desert"],
    },
    ...overrides,
  };
}

describe("readPresetVisualIdentityFromBible", () => {
  it("returns undefined for a null/absent bible", () => {
    expect(readPresetVisualIdentityFromBible(null)).toBeUndefined();
    expect(readPresetVisualIdentityFromBible(undefined)).toBeUndefined();
    expect(readPresetVisualIdentityFromBible({})).toBeUndefined();
  });

  it("returns undefined for a legacy bible with no presetVisualIdentity key (never throws)", () => {
    expect(
      readPresetVisualIdentityFromBible({ visualStyle: "some prose", logline: "x" }),
    ).toBeUndefined();
  });

  it("returns undefined (never throws) for a malformed presetVisualIdentity value", () => {
    expect(
      readPresetVisualIdentityFromBible({ presetVisualIdentity: { styleName: "incomplete" } }),
    ).toBeUndefined();
  });

  it("parses a valid presetVisualIdentity back out of the bible", () => {
    const identity = fullIdentity();
    expect(readPresetVisualIdentityFromBible({ presetVisualIdentity: identity })).toEqual(identity);
  });
});

describe("pickMatchingCharacterArchetype", () => {
  const identity = fullIdentity();

  it("matches an archetype whose role overlaps the character's own role (compound role split on '/')", () => {
    const archetype = pickMatchingCharacterArchetype(identity, "องครักษ์ป่า");
    expect(archetype?.look).toBe("techwear scout with glowing seams");
  });

  it("matches via the character's description when role alone doesn't overlap", () => {
    // The description embeds the archetype's compound role phrase
    // ("สหายสัตว์ประหลาด") verbatim/contiguously — Thai has no mandatory
    // inter-word spacing, so the match is contiguous-substring based (see
    // the function's own doc comment); `role` here ("เพื่อนซี้") deliberately
    // shares no substring with either archetype's role so only the
    // description drives the match.
    const archetype = pickMatchingCharacterArchetype(
      identity,
      "เพื่อนซี้",
      "สัตว์เลี้ยงไซเบอร์ที่เป็นสหายสัตว์ประหลาดคู่ใจของตัวเอก",
    );
    expect(archetype?.look).toContain("tiger-machine hybrid");
  });

  it("falls back to the FIRST archetype when nothing matches", () => {
    const archetype = pickMatchingCharacterArchetype(identity, "ตัวร้ายหลัก", "no overlap here");
    expect(archetype).toBe(identity.characterArchetypes[0]);
  });

  it("returns undefined when the identity has no archetypes at all", () => {
    const empty = fullIdentity({ characterArchetypes: [] });
    expect(pickMatchingCharacterArchetype(empty, "any role")).toBeUndefined();
  });
});

describe("generateCharacterVisualPrompts — preset visual identity flow-through", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockResolveQualityModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(4);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({ metadata: {} as any, content: "System prompt body" });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));
  });

  it("sends the preset visual identity as a structured preset_visual_identity FACT object (style_name/palette/wardrobe_grammar/matched_archetype_look) — never an authored connective sentence (Phase 2 item 4)", async () => {
    const identity = fullIdentity();

    await generateCharacterVisualPrompts(
      baseParams({ role: "องครักษ์ป่า", presetVisualIdentity: identity }),
    );

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain('"preset_visual_identity"');
    expect(userMessage).toContain('"style_name": "Neon Bio-Jungle Tech"');
    expect(userMessage).toContain('"Teal"');
    expect(userMessage).toContain('"Bioluminescent Green"');
    expect(userMessage).toContain('"Deep Jungle Black"');
    expect(userMessage).toContain('"techwear scout suit"');
    expect(userMessage).toContain('"tactical straps"');
    expect(userMessage).toContain('"matched_archetype_look": "techwear scout with glowing seams"');
    // The old code-authored connective sentence must be gone — skill.md's
    // "Preset visual identity" section is now the sole author of how these
    // facts get woven into prose.
    expect(userMessage).not.toMatch(/This series uses a preset visual identity/i);
    expect(userMessage).not.toMatch(/Blend this consistently into/i);
  });

  it("does NOT add a preset_visual_identity field when presetVisualIdentity is absent (legacy tolerant)", async () => {
    await generateCharacterVisualPrompts(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain("preset_visual_identity");
  });

  it("merges the preset identity's negative fragments into the returned negativePrompt", async () => {
    const identity = fullIdentity();

    const result = await generateCharacterVisualPrompts(
      baseParams({ presetVisualIdentity: identity }),
    );

    expect(result.negativePrompt).toContain("urban skyline");
    expect(result.negativePrompt).toContain("daylight desert");
    // Existing negative-prompt guarantees (from the mocked skill response
    // itself, not a code-side merge — see the earlier "passes the skill's
    // own negative_prompt... straight through" test) are still present.
    expect(result.negativePrompt).toContain("no other people");
  });

  it("the character's own role/description still flow through as plain facts unchanged when a preset visual identity is present", async () => {
    const identity = fullIdentity();

    await generateCharacterVisualPrompts(
      baseParams({ presetVisualIdentity: identity, description: "เด็กชายวัยสิบสองปี" }),
    );

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain("เด็กชายวัยสิบสองปี");
  });
});

describe("resolveFaceSourceReferenceForCharacter", () => {
  const owner = { tenantId: "tenant-1", userId: 1, seriesId: 42 };

  beforeEach(() => {
    mockGetPrimaryPortraitUrl.mockReset();
  });

  it("twin case: sharesFaceWithCharacterId set — resolves the SOURCE character's portrait with a hard lock", async () => {
    mockGetPrimaryPortraitUrl.mockResolvedValue("https://cdn.example.com/char-source.png");

    const result = await resolveFaceSourceReferenceForCharacter(owner, {
      parentCharacterId: null,
      variantType: null,
      sharesFaceWithCharacterId: 99,
    });

    expect(mockGetPrimaryPortraitUrl).toHaveBeenCalledWith(owner, 99);
    expect(result).toEqual({
      imageUrl: "https://cdn.example.com/char-source.png",
      lockStrength: "hard",
      relationshipNote: expect.stringMatching(/twin/i),
    });
  });

  it("outfit variant case: parentCharacterId + variantType 'outfit' — resolves the PARENT's portrait with a hard lock", async () => {
    mockGetPrimaryPortraitUrl.mockResolvedValue("https://cdn.example.com/char-parent.png");

    const result = await resolveFaceSourceReferenceForCharacter(owner, {
      parentCharacterId: 42,
      variantType: "outfit",
      sharesFaceWithCharacterId: null,
    });

    expect(mockGetPrimaryPortraitUrl).toHaveBeenCalledWith(owner, 42);
    expect(result).toEqual({
      imageUrl: "https://cdn.example.com/char-parent.png",
      lockStrength: "hard",
      relationshipNote: expect.stringMatching(/outfit variant/i),
    });
  });

  it("age-stage variant case: parentCharacterId + variantType 'age_stage' — resolves the PARENT's portrait with a LOOSE lock", async () => {
    mockGetPrimaryPortraitUrl.mockResolvedValue("https://cdn.example.com/char-parent.png");

    const result = await resolveFaceSourceReferenceForCharacter(owner, {
      parentCharacterId: 42,
      variantType: "age_stage",
      sharesFaceWithCharacterId: null,
    });

    expect(mockGetPrimaryPortraitUrl).toHaveBeenCalledWith(owner, 42);
    expect(result).toEqual({
      imageUrl: "https://cdn.example.com/char-parent.png",
      lockStrength: "loose",
      relationshipNote: expect.stringMatching(/age-stage/i),
    });
  });

  it("plain character case: neither field set — returns null WITHOUT querying for a portrait", async () => {
    const result = await resolveFaceSourceReferenceForCharacter(owner, {
      parentCharacterId: null,
      variantType: null,
      sharesFaceWithCharacterId: null,
    });

    expect(result).toBeNull();
    expect(mockGetPrimaryPortraitUrl).not.toHaveBeenCalled();
  });

  it("returns null (not a throw) when the source/parent character has no approved portrait yet", async () => {
    mockGetPrimaryPortraitUrl.mockResolvedValue(null);

    const result = await resolveFaceSourceReferenceForCharacter(owner, {
      parentCharacterId: 42,
      variantType: "outfit",
      sharesFaceWithCharacterId: null,
    });

    expect(result).toBeNull();
  });

  it("twin relationship takes precedence when both sharesFaceWithCharacterId and parentCharacterId happen to be set", async () => {
    mockGetPrimaryPortraitUrl.mockResolvedValue("https://cdn.example.com/char-twin-source.png");

    const result = await resolveFaceSourceReferenceForCharacter(owner, {
      parentCharacterId: 7,
      variantType: "outfit",
      sharesFaceWithCharacterId: 99,
    });

    expect(mockGetPrimaryPortraitUrl).toHaveBeenCalledWith(owner, 99);
    expect(result?.lockStrength).toBe("hard");
    expect(result?.relationshipNote).toMatch(/twin/i);
  });
});

describe("buildCharacterVisualPromptsUserPrompt — face_source_reference flow-through", () => {
  it("includes a face_source_reference FACT object (image_url/lock_strength/relationship_note) when faceSourceReference is present", () => {
    const userPrompt = buildCharacterVisualPromptsUserPrompt(
      baseParams({
        faceSourceReference: {
          imageUrl: "https://cdn.example.com/char-parent.png",
          lockStrength: "hard",
          relationshipNote: "outfit variant of the same person, different scene context",
        },
      }),
    );

    expect(userPrompt).toContain('"face_source_reference"');
    expect(userPrompt).toContain('"image_url": "https://cdn.example.com/char-parent.png"');
    expect(userPrompt).toContain('"lock_strength": "hard"');
    expect(userPrompt).toContain('"relationship_note": "outfit variant of the same person, different scene context"');
  });

  it("includes lock_strength 'loose' for an age-stage variant's faceSourceReference", () => {
    const userPrompt = buildCharacterVisualPromptsUserPrompt(
      baseParams({
        faceSourceReference: {
          imageUrl: "https://cdn.example.com/char-parent.png",
          lockStrength: "loose",
          relationshipNote: "age-stage variant of the same person, different life stage",
        },
      }),
    );

    expect(userPrompt).toContain('"lock_strength": "loose"');
  });

  it("omits the face_source_reference field entirely when faceSourceReference is absent (preserves today's byte-identical behavior for standalone characters)", () => {
    const userPrompt = buildCharacterVisualPromptsUserPrompt(baseParams());

    expect(userPrompt).not.toContain("face_source_reference");
  });

  it("omits the face_source_reference field entirely when faceSourceReference is explicitly null", () => {
    const userPrompt = buildCharacterVisualPromptsUserPrompt(baseParams({ faceSourceReference: null }));

    expect(userPrompt).not.toContain("face_source_reference");
  });
});

describe("generateCharacterVisualPrompts — face_source_reference flow-through to the LLM call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockResolveQualityModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(4);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({ metadata: {} as any, content: "System prompt body" });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));
  });

  it("sends face_source_reference as a structured FACT object to the LLM when provided", async () => {
    await generateCharacterVisualPrompts(
      baseParams({
        faceSourceReference: {
          imageUrl: "https://cdn.example.com/char-twin-source.png",
          lockStrength: "hard",
          relationshipNote: "twin sibling — face must match exactly, styling must be clearly distinct",
        },
      }),
    );

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain('"face_source_reference"');
    expect(userMessage).toContain("https://cdn.example.com/char-twin-source.png");
    expect(userMessage).toContain('"lock_strength": "hard"');
  });

  it("does NOT add a face_source_reference field for a standalone character (byte-identical to pre-feature behavior)", async () => {
    await generateCharacterVisualPrompts(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain("face_source_reference");
  });
});

/**
 * has_own_reference_image flow-through (vertical-drama-reference-picker-
 * outfit-lock plan, Phase D2 — section B): the router resolves
 * `referencePortraitUrl` and passes `hasOwnReferenceImage: Boolean(...)` in —
 * this module's only job is to forward that fact to the skill as
 * `has_own_reference_image: true`, never author any instruction text itself
 * (that would recreate the exact hardcoded-router-sentence bug this feature
 * fixes).
 */
describe("generateCharacterVisualPrompts — has_own_reference_image flow-through to the LLM call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockResolveQualityModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(4);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({ metadata: {} as any, content: "System prompt body" });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));
  });

  it("sends has_own_reference_image: true when hasOwnReferenceImage is true", async () => {
    await generateCharacterVisualPrompts(baseParams({ hasOwnReferenceImage: true }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain('"has_own_reference_image": true');
  });

  it("omits has_own_reference_image entirely when hasOwnReferenceImage is false (byte-identical to pre-feature behavior)", async () => {
    await generateCharacterVisualPrompts(baseParams({ hasOwnReferenceImage: false }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain("has_own_reference_image");
  });

  it("omits has_own_reference_image entirely when hasOwnReferenceImage is absent (legacy tolerant)", async () => {
    await generateCharacterVisualPrompts(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain("has_own_reference_image");
  });
});

/**
 * custom_instruction flow-through (vertical-drama-character-custom-
 * instruction plan): the router threads the caller's raw free-text framing/
 * pose hint straight through as `customInstruction` — this module's only job
 * is to forward it to the skill as `custom_instruction`, never author any
 * prompt-construction logic itself (skill-first — `skill.md`'s own "Custom
 * instruction" section is the sole author of how the fact is used). Mirrors
 * the `has_own_reference_image` flow-through coverage above exactly.
 */
describe("generateCharacterVisualPrompts — custom_instruction flow-through to the LLM call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockResolveQualityModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(4);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({ metadata: {} as any, content: "System prompt body" });
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));
  });

  it("sends custom_instruction as a raw string when customInstruction is set", async () => {
    await generateCharacterVisualPrompts(baseParams({ customInstruction: "half-body shot, front-facing" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain('"custom_instruction": "half-body shot, front-facing"');
  });

  it("omits custom_instruction entirely when customInstruction is empty (byte-identical to pre-feature behavior)", async () => {
    await generateCharacterVisualPrompts(baseParams({ customInstruction: "" }));

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain("custom_instruction");
  });

  it("omits custom_instruction entirely when customInstruction is absent (legacy tolerant)", async () => {
    await generateCharacterVisualPrompts(baseParams());

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).not.toContain("custom_instruction");
  });
});

/* -------------------------------------------------------------------------- */
/* Character Design Bible sheet types (vertical-drama-character-sheet-        */
/* consolidation plan, Phase B) — requestedSheetType / sheet_prompt.          */
/* -------------------------------------------------------------------------- */

describe("buildCharacterVisualPromptsUserPrompt — requested_sheet_type flow-through", () => {
  it("includes requested_sheet_type in the payload when requestedSheetType is present", () => {
    const userPrompt = buildCharacterVisualPromptsUserPrompt(
      baseParams({ requestedSheetType: "cover" }),
    );

    expect(userPrompt).toContain('"requested_sheet_type": "cover"');
  });

  it("omits requested_sheet_type entirely when requestedSheetType is absent (byte-identical to pre-feature behavior)", () => {
    const userPrompt = buildCharacterVisualPromptsUserPrompt(baseParams());

    expect(userPrompt).not.toContain("requested_sheet_type");
  });
});

describe("generateCharacterVisualPrompts — sheet_prompt passthrough", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockResolveQualityModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(4);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({ metadata: {} as any, content: "System prompt body" });
    mockHasEnoughCredits.mockResolvedValue(true);
  });

  it("reads sheet_prompt directly from the LLM response when present — no code-authored fallback", async () => {
    const character = {
      ...validCharacter(),
      sheet_prompt: "solo reference sheet, exactly one person: full-body cover portrait of Alice...",
      sheet_type: "cover",
    };
    mockExecute.mockResolvedValue(successResponse(validOutput([character])));

    const result = await generateCharacterVisualPrompts(
      baseParams({ requestedSheetType: "cover" }),
    );

    expect(result.sheetPrompt).toBe(
      "solo reference sheet, exactly one person: full-body cover portrait of Alice...",
    );

    const callArgs = mockExecute.mock.calls[0][0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = callArgs.messages.find((m) => m.role === "user")!.content;
    expect(userMessage).toContain('"requested_sheet_type": "cover"');
  });

  it("leaves sheetPrompt undefined when the LLM response omits it (legitimately absent, not a schema violation)", async () => {
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateCharacterVisualPrompts(baseParams());

    expect(result.sheetPrompt).toBeUndefined();
  });
});
