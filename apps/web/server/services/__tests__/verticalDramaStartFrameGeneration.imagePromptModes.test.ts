/**
 * Two-mode start-frame image prompt switch
 * (`planning/vd-start-frame-prompt-modes/plan.md`) — coverage for
 * `generateStartFrameShotPrompt`'s mode dispatch (legacy skill / mode 1
 * `policy_safe_rewrite` / mode 2 `cinematic_narrative`), the new
 * `TARGET IMAGE MODEL` / `SERIES VISUAL IDENTITY` / `PRODUCT TIE-IN` /
 * `frame_analysis_inputs` fact lines, the mode-2-only vision attachment
 * (`buildStartFrameShotPromptVisionImages`), and the lenient extras
 * (`safety_adjustments` / `analysis_summary` / `quality_score` /
 * `quality_flags`) normalization.
 *
 * Same mock set as `verticalDramaStartFrameGeneration.test.ts` (llmRouter,
 * creditService, rateLimiter, skillFiles, @smartspec/skills, fs,
 * verticalDramaImproveScript) PLUS `../db` / `../enabledLlmModels` /
 * `../intelligentModelSelector` — NEWLY required here because this is the
 * first test file to actually CALL `generateStartFrameShotPrompt` (the
 * pre-existing `referenceFrameMode.test.ts` only exercises the pure
 * `buildStartFrameShotPromptUserPrompt` builder, and the main
 * `verticalDramaStartFrameGeneration.test.ts` only exercises
 * `generateStartFrameRenderPlan` — neither reaches
 * `resolveStartFrameShotPromptModel`'s `loadEnabledLlmModelRows`/
 * `selectBestLlmModel` call, which transitively imports `../db`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../llmRouter", () => ({
  executeWithFallback: vi.fn(),
}));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: {
    isAllowed: vi.fn(),
    getResetTime: vi.fn(),
  },
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
vi.mock("../verticalDramaImproveScript", () => ({
  resolveStartFramePlanModel: vi.fn(),
}));
// New for this file (see header doc comment) — `resolveStartFrameShotPromptModel`
// (private to the service) calls these when vision is wanted.
vi.mock("../db", () => ({ db: {}, getDb: vi.fn() }));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateStartFrameShotPrompt,
  buildStartFrameShotPromptUserPrompt,
  buildStartFrameShotPromptVisionImages,
  VdReferenceMappingError,
  type GenerateStartFrameShotPromptParams,
} from "../verticalDramaStartFrameGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { resolveStartFramePlanModel } from "../verticalDramaImproveScript";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { selectBestLlmModel } from "../intelligentModelSelector";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStartFramePlanModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);

/** Marker system-prompt bodies, one per skill folder — lets tests assert WHICH skill loaded without depending on real file content. */
const SKILL_BODY_BY_FOLDER: Record<string, string> = {
  "vertical-drama-shot-start-frame-prompt": "LEGACY_SKILL_BODY",
  "vertical-drama-shot-synopsis-image-prompt": "SYNOPSIS_SKILL_BODY",
  "vertical-drama-cinematic-narrative-image-prompt": "CINEMATIC_SKILL_BODY",
};

function baseShotParams(
  overrides: Partial<GenerateStartFrameShotPromptParams> = {},
): GenerateStartFrameShotPromptParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    shotNumber: 4,
    currentPrompt: "vertical 9:16 start frame for shot 4, Aria in boardroom.",
    currentNegativePrompt: "no identity drift",
    characterReferenceManifest: [],
    ...overrides,
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveModel.mockResolvedValue("configured-model");
  mockCalculateCredits.mockReturnValue(2);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined as any);
  mockIsAllowed.mockReturnValue(true);
  mockGetResetTime.mockReturnValue(0);
  // No vision-capable model available by default — tests that need vision
  // override this explicitly.
  mockLoadEnabledLlmModelRows.mockResolvedValue([]);
  mockSelectBestLlmModel.mockReturnValue(null);

  mockResolveSkillDirCandidates.mockImplementation((folderPath: string) => [`/fake/${folderPath}`]);
  mockResolveSkillManifestPath.mockImplementation((dir: string) => `${dir}/skill.md`);
  mockExistsSync.mockReturnValue(true);
  mockReadFileSync.mockImplementation((filePath: unknown) => {
    const p = String(filePath);
    for (const [folder, body] of Object.entries(SKILL_BODY_BY_FOLDER)) {
      if (p.includes(folder)) return body;
    }
    return "UNKNOWN_SKILL_BODY";
  });
  mockParseSkillFile.mockImplementation((raw: unknown) => ({
    metadata: {} as any,
    content: String(raw),
  }));
});

function systemMessageContent(callIndex = 0): string {
  const args = mockExecute.mock.calls[callIndex][0] as {
    messages: Array<{ role: string; content: unknown }>;
  };
  const systemMessage = args.messages.find(m => m.role === "system")!.content;
  return typeof systemMessage === "string" ? systemMessage : JSON.stringify(systemMessage);
}

describe("generateStartFrameShotPrompt — mode dispatch (a, b)", () => {
  it("mode `policy_safe_rewrite` loads the synopsis skill", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a policy-safe prompt", negative_prompt: "no blur" }),
    );
    await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" }),
    );
    expect(systemMessageContent()).toBe("SYNOPSIS_SKILL_BODY");
  });

  it("mode `cinematic_narrative` loads the cinematic skill", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a cinematic prompt", negative_prompt: "no blur" }),
    );
    await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative" }),
    );
    expect(systemMessageContent()).toBe("CINEMATIC_SKILL_BODY");
  });

  it("absent mode loads the legacy skill (byte-identical to every pre-existing caller)", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a legacy prompt", negative_prompt: "no blur" }),
    );
    await generateStartFrameShotPrompt(baseShotParams());
    expect(systemMessageContent()).toBe("LEGACY_SKILL_BODY");
  });

  it("`referenceFrameMode: true` forces the legacy skill even with a mode set", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a reference-frame prompt", negative_prompt: "no blur" }),
    );
    await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative", referenceFrameMode: true }),
    );
    expect(systemMessageContent()).toBe("LEGACY_SKILL_BODY");
  });

  it("returns no `usedMode`/`frameStamp` when the legacy skill was used (absent mode)", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a legacy prompt", negative_prompt: "no blur" }),
    );
    const result = await generateStartFrameShotPrompt(baseShotParams());
    expect(result.usedMode).toBeUndefined();
    expect(result.frameStamp).toBeUndefined();
  });

  it("returns no `usedMode`/`frameStamp` when `referenceFrameMode` forced legacy despite a mode being set", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a reference-frame prompt", negative_prompt: "no blur" }),
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite", referenceFrameMode: true }),
    );
    expect(result.usedMode).toBeUndefined();
    expect(result.frameStamp).toBeUndefined();
  });

  it("returns a `frameStamp` recording mode/resolvedFrom/family/modelId when a mode was actually used", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a cinematic prompt", negative_prompt: "no blur" }),
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "cinematic_narrative",
        imagePromptModeResolvedFrom: "auto",
        imageModelFamily: "other",
        imageModelId: "google-nano-banana-pro",
      }),
    );
    expect(result.usedMode).toBe("cinematic_narrative");
    expect(result.frameStamp).toMatchObject({
      mode: "cinematic_narrative",
      resolvedFrom: "auto",
      imageModelFamily: "other",
      imageModelId: "google-nano-banana-pro",
    });
    expect(typeof result.frameStamp?.generatedAt).toBe("string");
  });
});

describe("generateStartFrameShotPrompt — reference-mapping validator still fail-closed regardless of mode", () => {
  it("throws VdReferenceMappingError when a mode-1 prompt's own 'Image N' claim contradicts the manifest after one corrective retry", async () => {
    const manifest = [{ index: 1, name: "Hero" }, { index: 2, name: "Villain" }];
    // First attempt AND the corrective retry both claim the wrong index.
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "REFERENCE MAPPING: Image 1 = Villain; Image 2 = Hero. A scene.",
        negative_prompt: "no blur",
      }),
    );
    await expect(
      generateStartFrameShotPrompt(
        baseShotParams({ imagePromptMode: "policy_safe_rewrite", characterReferenceManifest: manifest }),
      ),
    ).rejects.toThrow(VdReferenceMappingError);
    // One initial call + one corrective retry — never more.
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });
});

describe("generateStartFrameShotPrompt — lenient extras parsed and normalized (d)", () => {
  it("mode 1 returns normalized top-level safety_adjustments", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "a policy-safe prompt",
        negative_prompt: "no blur",
        safety_adjustments: ["  original → rewritten  ", "", 42, "second → fix"],
      }),
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" }),
    );
    expect(result.safetyAdjustments).toEqual(["original → rewritten", "second → fix"]);
  });

  it("mode 2 returns normalized analysis_summary subset + quality_score/quality_flags as promptAnalysis, and safety_adjustments from analysis_summary", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "a cinematic prompt",
        negative_prompt: "no blur",
        analysis_summary: {
          story_meaning: "  an accidental closeness  ",
          primary_emotion: "restrained warmth",
          decisive_moment: "the half-second their eyes meet",
          safety_adjustments: ["a → b"],
        },
        quality_score: 9,
        quality_flags: ["  too_many_emotions  ", ""],
      }),
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative" }),
    );
    expect(result.promptAnalysis).toEqual({
      storyMeaning: "an accidental closeness",
      primaryEmotion: "restrained warmth",
      decisiveMoment: "the half-second their eyes meet",
      qualityScore: 9,
      qualityFlags: ["too_many_emotions"],
    });
    expect(result.safetyAdjustments).toEqual(["a → b"]);
  });

  it("a malformed extra (wrong type) never blocks prompt/negative_prompt from being returned", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "a cinematic prompt",
        negative_prompt: "no blur",
        // Deliberately malformed: analysis_summary as a bare string, and
        // quality_score as a string instead of a number.
        analysis_summary: "not an object",
        quality_score: "9",
      }),
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative" }),
    );
    expect(result.prompt).toBe("a cinematic prompt");
    expect(result.negativePrompt).toBe("no blur");
    expect(result.promptAnalysis).toBeUndefined();
  });

  it("returns no safetyAdjustments/promptAnalysis when the mode returned neither", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a legacy prompt", negative_prompt: "no blur" }),
    );
    const result = await generateStartFrameShotPrompt(baseShotParams());
    expect(result.safetyAdjustments).toBeUndefined();
    expect(result.promptAnalysis).toBeUndefined();
  });
});

describe("generateStartFrameShotPrompt — mode 2 vision resolution (D3: image-grounded even with no existing shot image)", () => {
  it("resolves a vision-capable model when mode 2 has portraits/location but no existing shot imageUrl", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "configured-model", supportsVision: false } as any,
      { modelId: "vision-model", supportsVision: true, supportsStructuredOutputs: true } as any,
    ]);
    mockSelectBestLlmModel.mockReturnValue("vision-model");
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a cinematic prompt", negative_prompt: "no blur" }),
    );

    const result = await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "cinematic_narrative",
        characterReferenceImages: [{ url: "https://cdn/hero.png", label: "Hero" }],
      }),
    );

    expect(result.usedVision).toBe(true);
    expect(mockLoadEnabledLlmModelRows).toHaveBeenCalled();
  });

  it("mode 1 does NOT trigger vision resolution from portraits alone (mode 1 never receives them)", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a policy-safe prompt", negative_prompt: "no blur" }),
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" }),
    );
    expect(result.usedVision).toBe(false);
    expect(mockLoadEnabledLlmModelRows).not.toHaveBeenCalled();
  });
});

describe("buildStartFrameShotPromptUserPrompt — mode-aware fact lines (e)", () => {
  it("emits TARGET IMAGE MODEL whenever the family is known, regardless of mode", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imageModelFamily: "gpt", imageModelName: "GPT Image", imageModelId: "gpt-image-1.5-all" }),
    );
    expect(prompt).toContain('TARGET IMAGE MODEL: family=gpt model="GPT Image (gpt-image-1.5-all)"');
  });

  it("omits TARGET IMAGE MODEL entirely when the family is unknown (byte-identical regression guard)", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(baseShotParams());
    expect(prompt).not.toContain("TARGET IMAGE MODEL");
  });

  it("emits SERIES VISUAL IDENTITY only for a new mode with non-empty fragments", () => {
    const fragments = { positive: ["soft window light"], negative: ["oversaturated"] };
    const withMode = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative", presetVisualIdentityFragments: fragments }),
    );
    expect(withMode).toContain("SERIES VISUAL IDENTITY");
    expect(withMode).toContain("soft window light");
    expect(withMode).toContain("oversaturated");

    const legacyNoMode = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ presetVisualIdentityFragments: fragments }),
    );
    expect(legacyNoMode).not.toContain("SERIES VISUAL IDENTITY");
  });

  it("omits SERIES VISUAL IDENTITY for a new mode when fragments are empty/absent", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" }),
    );
    expect(prompt).not.toContain("SERIES VISUAL IDENTITY");
  });

  it("emits PRODUCT TIE-IN only for a new mode with an active product tie-in", () => {
    const productTieIn = { active: true, productName: "Golden Fish Sauce", productDescription: "amber glass bottle" };
    const withMode = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite", productTieIn }),
    );
    expect(withMode).toContain('PRODUCT TIE-IN: product_name="Golden Fish Sauce" product_description="amber glass bottle"');

    const legacyNoMode = buildStartFrameShotPromptUserPrompt(baseShotParams({ productTieIn }));
    expect(legacyNoMode).not.toContain("PRODUCT TIE-IN");
  });

  it("never emits PRODUCT TIE-IN when referenceFrameMode forces legacy, even with a mode + active tie-in set", () => {
    const productTieIn = { active: true, productName: "X", productDescription: "Y" };
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative", referenceFrameMode: true, productTieIn }),
    );
    expect(prompt).not.toContain("PRODUCT TIE-IN");
    expect(prompt).not.toContain("SERIES VISUAL IDENTITY");
  });

  it("emits frame_analysis_inputs ONLY for cinematic_narrative mode", () => {
    const cinematic = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative" }),
    );
    expect(cinematic).toContain("frame_analysis_inputs");

    const policySafe = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" }),
    );
    expect(policySafe).not.toContain("frame_analysis_inputs");

    const legacy = buildStartFrameShotPromptUserPrompt(baseShotParams());
    expect(legacy).not.toContain("frame_analysis_inputs");
  });
});

describe("buildStartFrameShotPromptVisionImages — mode-2 vision attachment (c)", () => {
  it("mode 1 / legacy: attaches only the shot's own image + additionalImageUrls, unchanged from today", () => {
    const images = buildStartFrameShotPromptVisionImages("https://cdn/shot.png", [
      { url: "https://cdn/extra.png", label: "extra" },
    ]);
    expect(images).toEqual([
      { url: "https://cdn/shot.png" },
      { url: "https://cdn/extra.png", label: "extra" },
    ]);
  });

  it("mode 2: attaches portraits (manifest order, 'Image N reference: <name>') then the location, between images[0] and additionalImageUrls", () => {
    const images = buildStartFrameShotPromptVisionImages(
      "https://cdn/shot.png",
      [{ url: "https://cdn/extra.png", label: "extra (user-supplied)" }],
      {
        characterReferenceImages: [
          { url: "https://cdn/hero.png", label: "Hero" },
          { url: "https://cdn/villain.png", label: "Villain" },
        ],
        locationReferenceImage: { url: "https://cdn/cafe.png", label: "Café" },
      },
    );
    expect(images).toEqual([
      { url: "https://cdn/shot.png" },
      { url: "https://cdn/hero.png", label: "Image 1 reference: Hero" },
      { url: "https://cdn/villain.png", label: "Image 2 reference: Villain" },
      { url: "https://cdn/cafe.png", label: "Location reference: Café" },
      { url: "https://cdn/extra.png", label: "extra (user-supplied)" },
    ]);
  });

  it("mode 2 labels 'Image 1' for the first portrait even when the shot has NO own current image (no images[0] shift)", () => {
    const images = buildStartFrameShotPromptVisionImages(undefined, undefined, {
      characterReferenceImages: [{ url: "https://cdn/hero.png", label: "Hero" }],
    });
    expect(images).toEqual([{ url: "https://cdn/hero.png", label: "Image 1 reference: Hero" }]);
  });

  it("caps portraits at 4 (manifest order preserved) and logs a warning when the shot needs more", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const portraits = ["A", "B", "C", "D", "E"].map((name, i) => ({
      url: `https://cdn/${name}.png`,
      label: name,
    }));
    const images = buildStartFrameShotPromptVisionImages(undefined, undefined, {
      characterReferenceImages: portraits,
    });
    expect(images).toEqual([
      { url: "https://cdn/A.png", label: "Image 1 reference: A" },
      { url: "https://cdn/B.png", label: "Image 2 reference: B" },
      { url: "https://cdn/C.png", label: "Image 3 reference: C" },
      { url: "https://cdn/D.png", label: "Image 4 reference: D" },
    ]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
