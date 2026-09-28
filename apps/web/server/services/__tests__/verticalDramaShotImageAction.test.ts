import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(),
  resolveSkillManifestPath: vi.fn(),
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
// `generateShotImageAction`'s auto-fallback now uses
// `resolveQualityLargeContextModelId` (was `resolveStoryBibleModel`).
vi.mock("../verticalDramaImproveScript", () => ({
  resolveQualityLargeContextModelId: vi.fn(),
}));
// Centralized per-series model policy resolver
// (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 3) — its
// own override/fallback contract is covered by
// `verticalDramaLlmModelPolicy.test.ts`; here it's mocked as a pure
// passthrough to `autoFallback` (the mocked `resolveQualityLargeContextModelId`
// above) so this file's pre-existing "no override configured" behavior/
// assertions are unaffected and no real DB access happens.
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateShotImageAction,
  buildShotImageActionUserPrompt,
  InsufficientCreditsError,
  VdSchemaValidationError,
  type GenerateShotImageActionParams,
} from "../verticalDramaShotImageAction";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "../verticalDramaImproveScript";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockResolveQualityModel = vi.mocked(resolveQualityLargeContextModelId);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function gridParams(
  overrides: Partial<GenerateShotImageActionParams> = {},
): GenerateShotImageActionParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 6,
    action: "multi_angle_grid",
    shot: {
      shotNumber: 4,
      currentPrompt: "Interior noodle shop at dusk, ฝ้าย stands behind the counter.",
      currentNegativePrompt: "blurry, extra fingers",
    },
    repairInstruction: null,
    characterReferenceManifest: [
      { index: 1, characterId: "character-2", name: "ฝ้าย" },
      { index: 2, characterId: "character-5", name: "ใบข้าว" },
    ],
    targetAudienceRegion: {
      code: "thai",
      descriptor: "Thai/Southeast Asian features and styling appropriate for Thai audiences",
    },
    productLock: { active: false, productName: null, productDescription: null },
    gridLayout: { panelCount: 9, layout: "3x3" },
    ...overrides,
  };
}

function repairParams(
  overrides: Partial<GenerateShotImageActionParams> = {},
): GenerateShotImageActionParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 6,
    action: "repair",
    shot: {
      shotNumber: 4,
      currentPrompt: "Interior noodle shop, ฝ้าย wears a faded blue apron.",
      currentNegativePrompt: "",
    },
    repairInstruction: "change her apron to red",
    characterReferenceManifest: [{ index: null, characterId: "character-2", name: "ฝ้าย" }],
    targetAudienceRegion: {
      code: "thai",
      descriptor: "Thai/Southeast Asian features and styling appropriate for Thai audiences",
    },
    productLock: {
      active: true,
      productName: "ขวดน้ำปลาตราชฎา",
      productDescription: "amber glass bottle, gold cap, red dragon label",
    },
    gridLayout: null,
    ...overrides,
  };
}

function softenParams(
  overrides: Partial<GenerateShotImageActionParams> = {},
): GenerateShotImageActionParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 6,
    action: "soften",
    softenLevel: 2,
    shot: {
      shotNumber: 4,
      currentPrompt:
        "Interior noodle shop at dusk, ฝ้าย stands behind the counter, exactly matching the reference image.",
      currentNegativePrompt: "identity drift, wrong skin tone",
    },
    repairInstruction: null,
    characterReferenceManifest: [{ index: null, characterId: "character-2", name: "ฝ้าย" }],
    targetAudienceRegion: {
      code: "thai",
      descriptor: "Thai/Southeast Asian features and styling appropriate for Thai audiences",
    },
    productLock: { active: false, productName: null, productDescription: null },
    gridLayout: null,
    ...overrides,
  };
}

function validOutput(overrides: Record<string, unknown> = {}) {
  return {
    contract_version: 1,
    prompt: "Authored prompt text.",
    negative_prompt: "authored negative terms",
    ...overrides,
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 120, completion_tokens: 60 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

describe("buildShotImageActionUserPrompt", () => {
  it("assembles only data facts for multi_angle_grid — no code-authored instruction prose", () => {
    const prompt = buildShotImageActionUserPrompt(gridParams());

    // Ground-truth facts must be present.
    expect(prompt).toContain("action: multi_angle_grid");
    expect(prompt).toContain("shot_number: 4");
    expect(prompt).toContain(
      "current_prompt: Interior noodle shop at dusk, ฝ้าย stands behind the counter.",
    );
    expect(prompt).toContain("current_negative_prompt: blurry, extra fingers");
    expect(prompt).toContain("index=1 name=ฝ้าย character_id=character-2");
    expect(prompt).toContain("index=2 name=ใบข้าว character_id=character-5");
    expect(prompt).toContain("target_audience_region: code=thai");
    expect(prompt).toContain("grid_layout: panel_count=9 layout=3x3");

    // No `repair_instruction:` line at all for a grid action.
    expect(prompt).not.toContain("repair_instruction:");

    // No code-authored instructional/creative sentences — these phrases only
    // ever appear in skill.md now, never in the assembled user-prompt facts.
    expect(prompt).not.toMatch(/render this exact same scene/i);
    expect(prompt).not.toMatch(/no text anywhere in the image/i);
    expect(prompt).not.toMatch(/character identity lock/i);
    expect(prompt).not.toMatch(/do not alter identity/i);
  });

  it("assembles only data facts for repair — includes repair_instruction verbatim, no authored prose", () => {
    const prompt = buildShotImageActionUserPrompt(repairParams());

    expect(prompt).toContain("action: repair");
    expect(prompt).toContain("repair_instruction: change her apron to red");
    expect(prompt).toContain(
      "current_prompt: Interior noodle shop, ฝ้าย wears a faded blue apron.",
    );
    expect(prompt).toContain("current_negative_prompt: (none)");
    expect(prompt).toContain("index=null name=ฝ้าย character_id=character-2");
    expect(prompt).toContain(
      'product_lock: active=true product_name="ขวดน้ำปลาตราชฎา" product_description="amber glass bottle, gold cap, red dragon label"',
    );
    expect(prompt).not.toContain("grid_layout:");

    expect(prompt).not.toMatch(/pose, composition, and framing should follow/i);
    expect(prompt).not.toMatch(/product lock \(mandatory\)/i);
    expect(prompt).not.toMatch(/apply only the requested change/i);
  });

  it("includes soften_level as a data fact for every action, defaulting to 0 when omitted", () => {
    expect(buildShotImageActionUserPrompt(gridParams())).toContain("soften_level: 0");
    expect(buildShotImageActionUserPrompt(repairParams())).toContain("soften_level: 0");
    expect(buildShotImageActionUserPrompt(softenParams({ softenLevel: 1 }))).toContain(
      "soften_level: 1",
    );
    expect(buildShotImageActionUserPrompt(softenParams({ softenLevel: 2 }))).toContain(
      "soften_level: 2",
    );
  });

  it("threads the selected image model prompt budget as a factual input", () => {
    expect(
      buildShotImageActionUserPrompt(
        gridParams({ promptMaxChars: 20_000 }),
      ),
    ).toContain("prompt_max_chars: 20000");
  });

  it("assembles only data facts for soften — no grid_layout, no repair_instruction line", () => {
    const prompt = buildShotImageActionUserPrompt(softenParams());

    expect(prompt).toContain("action: soften");
    expect(prompt).toContain("soften_level: 2");
    expect(prompt).not.toContain("repair_instruction:");
    expect(prompt).not.toContain("grid_layout:");
  });
});

describe("generateShotImageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockResolveQualityModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(3);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-shot-image-action",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-shot-image-action/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
  });

  it("happy path (multi_angle_grid): returns the skill-authored prompt/negativePrompt and deducts credits once", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse(
        validOutput({
          prompt: "3x3 grid authored prompt",
          negative_prompt: "no text, no captions",
        }),
      ),
    );

    const result = await generateShotImageAction(gridParams());

    expect(result.prompt).toBe("3x3 grid authored prompt");
    expect(result.negativePrompt).toBe("no text, no captions");
    expect(result.creditsUsed).toBe(3);
    expect(result.model).toBe("gpt-4o-mini");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        tenantId: "tenant-1",
        sourceType: "skill",
        metadata: expect.objectContaining({
          action: "multi_angle_grid",
          shotNumber: 4,
        }),
      }),
    );
  });

  it("happy path (repair): returns the skill-authored repair prompt/negativePrompt", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse(
        validOutput({
          prompt: "repaired prompt with red apron",
          negative_prompt: "altered product design",
        }),
      ),
    );

    const result = await generateShotImageAction(repairParams());

    expect(result.prompt).toBe("repaired prompt with red apron");
    expect(result.negativePrompt).toBe("altered product design");
  });

  it("defaults negativePrompt to an empty string when the skill omits it", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ contract_version: 1, prompt: "authored prompt only" }),
    );

    const result = await generateShotImageAction(gridParams());

    expect(result.negativePrompt).toBe("");
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateShotImageAction(gridParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output (missing prompt field) and does not deduct credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ contract_version: 1, negative_prompt: "only negative" }),
    );

    await expect(generateShotImageAction(gridParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("happy path (soften): returns the skill-authored softened prompt/negativePrompt", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse(
        validOutput({
          prompt: "Interior noodle shop at dusk, ฝ้าย stands behind the counter, closely resembling the reference image.",
          negative_prompt: "",
        }),
      ),
    );

    const result = await generateShotImageAction(softenParams());

    expect(result.prompt).toContain("closely resembling");
    expect(result.negativePrompt).toBe("");
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ action: "soften", shotNumber: 4 }),
      }),
    );
  });

  describe("child-safety post-generation safety net (Phase 1.3)", () => {
    const childSafetyPrompt =
      "This character MUST be depicted strictly age-appropriately — no adult styling, no glamour. " +
      "Match her exact face shape, skin tone, hairstyle, and distinguishing features to the reference.";

    it("falls back to the original unsoftened prompt/negative prompt when the skill's output drops the child-safety directive present in the input", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      // Skill response OMITS the child-safety clause entirely — simulates a
      // skill regression that must never reach the image render call.
      mockExecute.mockResolvedValue(
        successResponse(
          validOutput({
            prompt: "A cheerful scene, closely resembling the reference image.",
            negative_prompt: "",
          }),
        ),
      );

      const params = softenParams({
        softenLevel: 2,
        shot: {
          shotNumber: 9,
          currentPrompt: childSafetyPrompt,
          currentNegativePrompt: "adult beauty styling, seductive pose",
        },
      });

      const result = await generateShotImageAction(params);

      // Falls back to the ORIGINAL input, verbatim — not a surgical patch.
      expect(result.prompt).toBe(childSafetyPrompt);
      expect(result.negativePrompt).toBe("adult beauty styling, seductive pose");
      // Credits are still deducted — the LLM call itself succeeded.
      expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    });

    it("keeps the skill's output when it correctly preserves the child-safety directive", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      const softenedButSafePrompt =
        "This character MUST be depicted strictly age-appropriately — no adult styling, no glamour. " +
        "Maintain her recognizable appearance from the reference.";
      mockExecute.mockResolvedValue(
        successResponse(
          validOutput({ prompt: softenedButSafePrompt, negative_prompt: "adult beauty styling" }),
        ),
      );

      const params = softenParams({
        softenLevel: 2,
        shot: {
          shotNumber: 9,
          currentPrompt: childSafetyPrompt,
          currentNegativePrompt: "adult beauty styling, seductive pose",
        },
      });

      const result = await generateShotImageAction(params);

      expect(result.prompt).toBe(softenedButSafePrompt);
      expect(result.negativePrompt).toBe("adult beauty styling");
    });

    it("is a no-op safety net when the input never had a child-safety directive", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse(validOutput({ prompt: "an ordinary softened prompt", negative_prompt: "" })),
      );

      const result = await generateShotImageAction(softenParams());

      expect(result.prompt).toBe("an ordinary softened prompt");
    });
  });
});
