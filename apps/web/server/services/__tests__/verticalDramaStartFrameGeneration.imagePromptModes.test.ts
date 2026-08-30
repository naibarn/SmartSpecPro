/**
 * Two-mode start-frame image prompt switch
 * (`planning/vd-start-frame-prompt-modes/plan.md`) — coverage for
 * `generateStartFrameShotPrompt`'s mode dispatch (legacy skill / mode 1
 * `policy_safe_rewrite` / mode 2 `cinematic_narrative`), the new
 * `TARGET IMAGE MODEL` / `SERIES LOOK REGISTER` / `PRODUCT TIE-IN` /
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
  buildDeterministicPolicySafeImagePrompt,
  ensureSpokenCallerVirtualScreenPrompt,
  buildRenderPlanSceneContinuityLockSection,
  guardStartFramePromptVisibleCast,
  validatePolicySafeSynopsisRewrite,
  type GenerateStartFrameShotPromptParams,
} from "../verticalDramaStartFrameGeneration";
import { executeWithFallback } from "../llmRouter";
import {
  hasEnoughCredits,
  deductCredits,
  calculateCreditsForLLM,
} from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import {
  resolveSkillDirCandidates,
  resolveSkillManifestPath,
} from "../skillFiles";
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
  overrides: Partial<GenerateStartFrameShotPromptParams> = {}
): GenerateStartFrameShotPromptParams {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    shotNumber: 4,
    currentPrompt: "vertical 9:16 start frame for shot 4, Aria in boardroom.",
    currentNegativePrompt: "no identity drift",
    canonicalShotSummary: "อารียืนอยู่ในห้องประชุม",
    characterReferenceManifest: [],
    ...overrides,
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [
        {
          message: { content: JSON.stringify(payload) },
          index: 0,
          finish_reason: "stop",
        },
      ],
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

  mockResolveSkillDirCandidates.mockImplementation((folderPath: string) => [
    `/fake/${folderPath}`,
  ]);
  mockResolveSkillManifestPath.mockImplementation(
    (dir: string) => `${dir}/skill.md`
  );
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
  return typeof systemMessage === "string"
    ? systemMessage
    : JSON.stringify(systemMessage);
}

function userMessageContent(callIndex = 0): string {
  const args = mockExecute.mock.calls[callIndex][0] as {
    messages: Array<{ role: string; content: unknown }>;
  };
  const userMessage = args.messages.find(m => m.role === "user")!.content;
  return typeof userMessage === "string"
    ? userMessage
    : JSON.stringify(userMessage);
}

describe("generateStartFrameShotPrompt — mode dispatch (a, b)", () => {
  it("mode `policy_safe_rewrite` loads the synopsis skill", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        rewritten_synopsis: "อารียืนอยู่ในห้องประชุม",
        safety_adjustments: [],
      })
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" })
    );
    expect(systemMessageContent()).toBe("SYNOPSIS_SKILL_BODY");
    expect(result.prompt).toBe("อารียืนอยู่ในห้องประชุม");
    expect(userMessageContent()).not.toContain("PROMPT LANGUAGE");
    expect(userMessageContent()).not.toContain("framing_override");
  });

  it("mode `cinematic_narrative` loads the cinematic skill", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "a cinematic prompt",
        negative_prompt: "no blur",
      })
    );
    await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative" })
    );
    expect(systemMessageContent()).toBe("CINEMATIC_SKILL_BODY");
  });

  it("removes unselected roster names from a cinematic final prompt", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "คุณกฤตอ่านข้อความว่า ปรางเข้าโทรแล้ว (ปรางไม่ได้อยู่ในห้อง)",
        negative_prompt: "",
      })
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "cinematic_narrative",
        characterReferenceManifest: [
          { index: 1, name: "คุณกฤต", presence: "scene" },
        ],
        excludedVisualCharacterNames: ["ปราง"],
      })
    );

    expect(result.prompt).toContain("คุณกฤต");
    expect(result.prompt).not.toContain("ปราง");
    expect(result.prompt).not.toContain("ไม่ได้อยู่ในห้อง");
  });

  it("keeps screen callers out of the physical reference-image manifest", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        requiredCharacterRefs: ["char-prang", "char-phoom"],
        screenCallerCharacterRefs: ["char-krit"],
        characterReferenceManifest: [
          { index: 1, name: "ปราง", presence: "scene" },
          { index: 2, name: "ภูมิ", presence: "scene" },
        ],
      })
    );

    expect(prompt).toContain("screen_caller_character_refs: char-krit");
    expect(prompt).toContain("do not attach caller portraits");
    expect(prompt).toContain(
      "physical_scene_character_refs: char-prang, char-phoom"
    );
    expect(prompt).not.toContain("Image 3 = char-krit");
    expect(prompt).not.toContain("attach each approved portrait");
  });

  it("absent mode loads the legacy skill (byte-identical to every pre-existing caller)", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a legacy prompt", negative_prompt: "no blur" })
    );
    await generateStartFrameShotPrompt(baseShotParams());
    expect(systemMessageContent()).toBe("LEGACY_SKILL_BODY");
  });

  it("`referenceFrameMode: true` forces the legacy skill even with a mode set", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "a reference-frame prompt",
        negative_prompt: "no blur",
      })
    );
    await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "cinematic_narrative",
        referenceFrameMode: true,
      })
    );
    expect(systemMessageContent()).toBe("LEGACY_SKILL_BODY");
  });

  it("returns no `usedMode`/`frameStamp` when the legacy skill was used (absent mode)", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a legacy prompt", negative_prompt: "no blur" })
    );
    const result = await generateStartFrameShotPrompt(baseShotParams());
    expect(result.usedMode).toBeUndefined();
    expect(result.frameStamp).toBeUndefined();
  });

  it("returns no `usedMode`/`frameStamp` when `referenceFrameMode` forced legacy despite a mode being set", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "a reference-frame prompt",
        negative_prompt: "no blur",
      })
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "policy_safe_rewrite",
        referenceFrameMode: true,
      })
    );
    expect(result.usedMode).toBeUndefined();
    expect(result.frameStamp).toBeUndefined();
  });

  it("returns a `frameStamp` recording mode/resolvedFrom/family/modelId when a mode was actually used", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "a cinematic prompt",
        negative_prompt: "no blur",
      })
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "cinematic_narrative",
        imagePromptModeResolvedFrom: "auto",
        imageModelFamily: "other",
        imageModelId: "google-nano-banana-pro",
      })
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

describe("policy-safe synopsis deterministic contract", () => {
  it("accepts a policy-safe prompt above 3800 within the selected model budget", async () => {
    const synopsis = "x".repeat(4001);
    mockExecute.mockResolvedValue(
      successResponse({
        rewritten_synopsis: synopsis,
        safety_adjustments: [],
      })
    );

    const result = await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "policy_safe_rewrite",
        canonicalShotSummary: synopsis,
        imagePromptMaxChars: 20_000,
      })
    );

    expect(result.prompt).toBe(synopsis);
  });

  it("keeps the legacy 3800 policy-safe limit when no model budget is supplied", async () => {
    const synopsis = "x".repeat(4001);
    mockExecute.mockResolvedValue(
      successResponse({
        rewritten_synopsis: synopsis,
        safety_adjustments: [],
      })
    );

    await expect(
      generateStartFrameShotPrompt(
        baseShotParams({
          imagePromptMode: "policy_safe_rewrite",
          canonicalShotSummary: synopsis,
        })
      )
    ).rejects.toThrow("exceeds 3800 characters");
  });

  it("reports the effective policy-safe budget in an over-limit error", async () => {
    const synopsis = "x".repeat(20_001);
    mockExecute.mockResolvedValue(
      successResponse({
        rewritten_synopsis: synopsis,
        safety_adjustments: [],
      })
    );

    await expect(
      generateStartFrameShotPrompt(
        baseShotParams({
          imagePromptMode: "policy_safe_rewrite",
          canonicalShotSummary: synopsis,
          imagePromptMaxChars: 20_000,
        })
      )
    ).rejects.toThrow("exceeds 20000 characters");
  });

  it("builds reference mapping, an exact physical cast lock, and the rewritten synopsis", () => {
    const prompt = buildDeterministicPolicySafeImagePrompt({
      rewrittenSynopsis: "ภูมิยืนคุยกับปราง",
      characterReferenceManifest: [
        { index: 1, name: "ภูมิ" },
        { index: 2, name: "ปราง" },
      ],
      locationReferenceImage: {
        url: "https://cdn/roof.png",
        label: "ดาดฟ้าตึกแถวเก่า",
      },
    });
    expect(prompt).toContain(
      "REFERENCE MAPPING: Image 1 = ภูมิ; Image 2 = ปราง; Image 3 = location: ดาดฟ้าตึกแถวเก่า."
    );
    expect(prompt).toContain("PHYSICAL CAST LOCK (MANDATORY): exactly 2");
    expect(prompt).toContain("CHARACTER APPARENT-AGE LOCK (MANDATORY)");
    expect(prompt).toContain("ภูมิยืนคุยกับปราง");
    expect(prompt.indexOf("CHARACTER APPARENT-AGE LOCK")).toBeGreaterThan(
      prompt.indexOf("PHYSICAL CAST LOCK")
    );
  });

  it("rejects an undeclared creative addition", () => {
    expect(() =>
      validatePolicySafeSynopsisRewrite("ภูมิยืนคุยกับปราง", {
        rewritten_synopsis: "ภูมิยืนคุยกับปรางใต้แสงฝน",
        safety_adjustments: [],
      })
    ).toThrow("undeclared addition");
  });

  it("retries once when the skill adds undeclared cinematic detail", async () => {
    mockExecute
      .mockResolvedValueOnce(
        successResponse({
          rewritten_synopsis: "อารียืนอยู่ในห้องประชุมใต้แสงนุ่ม",
          safety_adjustments: [],
        })
      )
      .mockResolvedValueOnce(
        successResponse({
          rewritten_synopsis: "อารียืนอยู่ในห้องประชุม",
          safety_adjustments: [],
        })
      );

    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" })
    );

    expect(result.prompt).toBe("อารียืนอยู่ในห้องประชุม");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("uses deterministic declared replacements when Thai output adds an undeclared grammar word", async () => {
    const canonicalSynopsis =
      "ถังเหล็กเก่ากระแทกขอบบ่อ พิมพ์ดาวเห็นห่อผ้าชุ่มน้ำด้านใน เธอรีบคว้าไว้ก่อนที่หลวงราชเดชาจะเอื้อมถึง เป็นช่วงชิงหลักฐานกันในระยะประชิด";
    const invalidModelOutput = {
      rewritten_synopsis:
        "ถังเหล็กเก่ากระแทกขอบบ่อ พิมพ์ดาวเห็นห่อผ้าชุ่มน้ำด้านใน เธอรีบคว้าไว้ก่อนที่หลวงราชเดชาจะเอื้อมถึง เป็นการแย่งชิงหลักฐานกันในระยะประชิด",
      safety_adjustments: [
        {
          original: "ช่วงชิง",
          rewritten: "แย่งชิง",
          reason: "violence",
        },
      ],
    };
    mockExecute
      .mockResolvedValueOnce(successResponse(invalidModelOutput))
      .mockResolvedValueOnce(successResponse(invalidModelOutput));

    const result = await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "policy_safe_rewrite",
        canonicalShotSummary: canonicalSynopsis,
      })
    );

    expect(result.prompt).toBe(
      "ถังเหล็กเก่ากระแทกขอบบ่อ พิมพ์ดาวเห็นห่อผ้าชุ่มน้ำด้านใน เธอรีบคว้าไว้ก่อนที่หลวงราชเดชาจะเอื้อมถึง เป็นแย่งชิงหลักฐานกันในระยะประชิด"
    );
    expect(result.safetyAdjustments).toEqual(["ช่วงชิง → แย่งชิง"]);
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("still fails closed when the retry declares an invalid replacement target", async () => {
    const invalidModelOutput = {
      rewritten_synopsis: "อารียืนอยู่ในห้องประชุม",
      safety_adjustments: [
        {
          original: "คำที่ไม่มีอยู่ในต้นฉบับ",
          rewritten: "คำใหม่",
          reason: "violence",
        },
      ],
    };
    mockExecute
      .mockResolvedValueOnce(successResponse(invalidModelOutput))
      .mockResolvedValueOnce(successResponse(invalidModelOutput));

    await expect(
      generateStartFrameShotPrompt(
        baseShotParams({ imagePromptMode: "policy_safe_rewrite" })
      )
    ).rejects.toThrow("adjustment target must occur exactly once");
  });
});

describe("generateStartFrameShotPrompt — lenient extras parsed and normalized (d)", () => {
  it("mode 1 returns normalized top-level safety_adjustments", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        rewritten_synopsis: "อารียืนอยู่ในห้องประชุมอย่างสมัครใจ",
        safety_adjustments: [
          {
            original: "อารียืนอยู่ในห้องประชุม",
            rewritten: "อารียืนอยู่ในห้องประชุมอย่างสมัครใจ",
            reason: "adult_or_consent",
          },
        ],
      })
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" })
    );
    expect(result.safetyAdjustments).toEqual([
      "อารียืนอยู่ในห้องประชุม → อารียืนอยู่ในห้องประชุมอย่างสมัครใจ",
    ]);
    expect(result.negativePrompt).toBe("");
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
      })
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative" })
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
      })
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative" })
    );
    expect(result.prompt).toContain("a cinematic prompt");
    expect(result.prompt).not.toContain("no blur");
    expect(result.negativePrompt).toBe("no blur");
    expect(result.promptAnalysis).toBeUndefined();
  });

  it("returns no safetyAdjustments/promptAnalysis when the mode returned neither", async () => {
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "a legacy prompt", negative_prompt: "no blur" })
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
      {
        modelId: "vision-model",
        supportsVision: true,
        supportsStructuredOutputs: true,
      } as any,
    ]);
    mockSelectBestLlmModel.mockReturnValue("vision-model");
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "a cinematic prompt",
        negative_prompt: "no blur",
      })
    );

    const result = await generateStartFrameShotPrompt(
      baseShotParams({
        imagePromptMode: "cinematic_narrative",
        characterReferenceImages: [
          { url: "https://cdn/hero.png", label: "Hero" },
        ],
      })
    );

    expect(result.usedVision).toBe(true);
    expect(mockLoadEnabledLlmModelRows).toHaveBeenCalled();
  });

  it("mode 1 does NOT trigger vision resolution from portraits alone (mode 1 never receives them)", async () => {
    mockExecute.mockResolvedValue(
      successResponse({
        rewritten_synopsis: "อารียืนอยู่ในห้องประชุม",
        safety_adjustments: [],
      })
    );
    const result = await generateStartFrameShotPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" })
    );
    expect(result.usedVision).toBe(false);
    expect(mockLoadEnabledLlmModelRows).not.toHaveBeenCalled();
  });
});

describe("buildStartFrameShotPromptUserPrompt — mode-aware fact lines (e)", () => {
  it("injects a non-blank scene lock after location facts and treats blank as absent", () => {
    const block = "SCENE CONTINUITY LOCK\nLIGHTING STATE: late afternoon";
    const without = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        location: {
          name: "Cafe",
          description: "small cafe",
          hasReferenceImage: false,
        },
        speakingOrder: ["Aria"],
      })
    );
    const withLock = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        location: {
          name: "Cafe",
          description: "small cafe",
          hasReferenceImage: false,
        },
        speakingOrder: ["Aria"],
        sceneContinuityLockBlock: block,
      })
    );
    expect(withLock).toContain(block);
    expect(withLock.indexOf(block)).toBeGreaterThan(
      withLock.indexOf("location:")
    );
    expect(withLock.indexOf(block)).toBeLessThan(
      withLock.indexOf("speaking_order:")
    );
    expect(
      buildStartFrameShotPromptUserPrompt(
        baseShotParams({
          sceneContinuityLockBlock: "   ",
        })
      )
    ).toBe(buildStartFrameShotPromptUserPrompt(baseShotParams()));
    expect(withLock.replace(`${block}\n`, "")).toBe(without);
  });

  it("deduplicates render-plan lock blocks and groups shots deterministically", () => {
    const a = "SCENE CONTINUITY LOCK\nLIGHTING STATE: day";
    const b = "SCENE CONTINUITY LOCK\nLIGHTING STATE: night";
    expect(
      buildRenderPlanSceneContinuityLockSection([
        { shotNumber: 4, sceneContinuityLockBlock: b },
        { shotNumber: 2, sceneContinuityLockBlock: a },
        { shotNumber: 1, sceneContinuityLockBlock: a },
        { shotNumber: 3, sceneContinuityLockBlock: a },
        { shotNumber: 5, sceneContinuityLockBlock: b },
      ])
    ).toBe(
      [
        "SCENE CONTINUITY LOCKS (one block per scene; each applies to the shots listed with it):",
        `Shots 1, 2, 3:\n${a}`,
        `Shots 4, 5:\n${b}`,
      ].join("\n\n")
    );
    expect(
      buildRenderPlanSceneContinuityLockSection([
        { shotNumber: 1, sceneContinuityLockBlock: " " },
      ])
    ).toBeNull();
  });

  it("places policy-safe lock text between mapping and synopsis", () => {
    const block = "SCENE CONTINUITY LOCK\nFIXED ELEMENTS: bar counter";
    const prompt = buildDeterministicPolicySafeImagePrompt({
      rewrittenSynopsis: "อารียืนในคาเฟ่",
      characterReferenceManifest: [{ index: 1, name: "อาเรีย" }],
      sceneContinuityLockBlock: block,
    });
    expect(prompt).toContain("REFERENCE MAPPING: Image 1 = อาเรีย.");
    expect(prompt).toContain("CHARACTER APPARENT-AGE LOCK (MANDATORY)");
    expect(prompt).toContain(block);
    expect(prompt).toContain("อารียืนในคาเฟ่");
    expect(prompt.indexOf("CHARACTER APPARENT-AGE LOCK")).toBeLessThan(
      prompt.indexOf(block)
    );
  });

  it("always persists the virtual-screen contract in policy-safe caller prompts", () => {
    const prompt = buildDeterministicPolicySafeImagePrompt({
      rewrittenSynopsis:
        "ภาคินเปิดลำโพงฟังคำเตือนจากกฤต ขณะที่ไอริณยืนอยู่ข้างเขา",
      shotNumber: 3,
      characterReferenceManifest: [
        { index: 1, name: "ภาคิน", presence: "scene" },
        { index: 2, name: "ไอริณ", presence: "scene" },
        {
          index: 3,
          characterId: "character-3",
          name: "กฤต",
          presence: "screen_caller",
        },
      ],
      screenCallerCharacterRefs: ["character-3"],
      spokenCallerCharacterRefs: ["character-3"],
    });

    expect(prompt).toContain("SPOKEN CALLER VIRTUAL SCREENS (MANDATORY)");
    expect(prompt).toContain("screen_1=character-3");
    expect(prompt).toContain("vertical phone screen");
    expect(prompt).toContain("Never show a spoken caller physically in the room");
    expect(prompt).toContain("CALLER FACE IDENTITY LOCK (MANDATORY)");
    expect(prompt).toContain("Image 3 = character-3");
    expect(prompt).toContain("Never use a different face");
  });

  it("has a final-prompt invariant that repairs a caller prompt missing the marker", () => {
    const prompt = ensureSpokenCallerVirtualScreenPrompt({
      prompt: "A physical scene with two characters.",
      screenCallerCharacterRefs: ["character-3"],
      callerFaceReferenceImageIndexes: { "character-3": 3 },
    });

    expect(prompt).toContain("SPOKEN CALLER VIRTUAL SCREENS (MANDATORY)");
    expect(prompt).toContain("screen_1=character-3");
    expect(prompt).toContain("Image 3 = character-3");
  });

  it("repairs a virtual-screen prompt that still lacks the face-lock clause", () => {
    const prompt = ensureSpokenCallerVirtualScreenPrompt({
      prompt:
        "SPOKEN CALLER VIRTUAL SCREENS (MANDATORY): screen_1=character-3 (vertical phone screen).",
      screenCallerCharacterRefs: ["character-3"],
      callerFaceReferenceImageIndexes: { "character-3": 3 },
    });

    expect(prompt).toContain("SPOKEN CALLER VIRTUAL SCREENS (MANDATORY)");
    expect(prompt).toContain("CALLER FACE IDENTITY LOCK (MANDATORY)");
    expect(prompt).toContain("Image 3 = character-3");
  });

  it("removes scene-wide cast staging while preserving environment continuity", () => {
    const contaminatedBlock = [
      "SCENE CONTINUITY LOCK",
      "- Lighting: daytime, soft ambient key",
      "- Fixed elements: cafe counter, menu board",
      "- Spatial layout: ไอริน at the counter; ปราง beside the entrance",
      "- Staging axis: ภาคิน faces ไอริน while ภูมิ waits behind them",
      "- Wardrobe: ปราง wears a black blazer; ภูมิ wears a green shirt",
      "- Continuity prop candidates (not all visible): phone and coffee cup",
      "- Current-shot prop visibility rule: show only props explicitly required by the current shot synopsis/composition; omit unrelated prior props and never duplicate handheld devices.",
      "- Palette: warm wood and cream",
    ].join("\n");

    const prompt = buildDeterministicPolicySafeImagePrompt({
      rewrittenSynopsis: "ไอรินคุยกับภาคินที่โต๊ะในคาเฟ่",
      characterReferenceManifest: [
        { index: 1, name: "ไอริน", presence: "scene" },
        { index: 2, name: "ภาคิน", presence: "scene" },
      ],
      sceneContinuityLockBlock: contaminatedBlock,
    });

    expect(prompt).toContain(
      "exactly 2 physical scene characters — ไอริน, ภาคิน"
    );
    expect(prompt).toContain("Lighting: daytime, soft ambient key");
    expect(prompt).toContain("Fixed elements: cafe counter, menu board");
    expect(prompt).toContain(
      "Continuity prop candidates (not all visible): phone and coffee cup"
    );
    expect(prompt).toContain("Palette: warm wood and cream");
    expect(prompt).not.toContain("ปราง");
    expect(prompt).not.toContain("ภูมิ");
    expect(prompt).not.toContain("Spatial layout:");
    expect(prompt).not.toContain("Staging axis:");
    expect(prompt).not.toContain("Wardrobe:");

    const normalModePrompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ sceneContinuityLockBlock: contaminatedBlock })
    );
    expect(normalModePrompt).toContain("Lighting: daytime, soft ambient key");
    expect(normalModePrompt).not.toContain("ปราง");
    expect(normalModePrompt).not.toContain("ภูมิ");

    const batchLockSection = buildRenderPlanSceneContinuityLockSection([
      { shotNumber: 8, sceneContinuityLockBlock: contaminatedBlock },
    ]);
    expect(batchLockSection).toContain("Lighting: daytime, soft ambient key");
    expect(batchLockSection).not.toContain("ปราง");
    expect(batchLockSection).not.toContain("ภูมิ");
  });

  it("does not leak a future active prop into start-frame prompts or render-plan locks", () => {
    const block = [
      "SCENE CONTINUITY LOCK",
      "- Continuity prop candidates (not all visible): evidence folder — in hand (from shot 1); handcuffs — on wrist (from shot 8)",
      "- Current-shot prop visibility rule: show only props explicitly required by the current shot synopsis/composition; omit unrelated prior props and never duplicate handheld devices.",
    ].join("\n");

    const shotFourPrompt = buildDeterministicPolicySafeImagePrompt({
      rewrittenSynopsis: "คุณกฤตยืนอยู่หน้าคาเฟ่",
      shotNumber: 4,
      characterReferenceManifest: [{ index: 1, name: "คุณกฤต", presence: "scene" }],
      sceneContinuityLockBlock: block,
    });
    expect(shotFourPrompt).toContain("evidence folder");
    expect(shotFourPrompt).not.toContain("handcuffs");

    const shotFourNormalPrompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ shotNumber: 4, sceneContinuityLockBlock: block })
    );
    expect(shotFourNormalPrompt).toContain("evidence folder");
    expect(shotFourNormalPrompt).not.toContain("handcuffs");

    const shotFourLock = buildRenderPlanSceneContinuityLockSection([
      { shotNumber: 4, sceneContinuityLockBlock: block },
    ]);
    expect(shotFourLock).toContain("evidence folder");
    expect(shotFourLock).not.toContain("handcuffs");

    const shotEightLock = buildRenderPlanSceneContinuityLockSection([
      { shotNumber: 8, sceneContinuityLockBlock: block },
    ]);
    expect(shotEightLock).toContain("handcuffs");
  });

  it("removes a roster character who is mentioned but not selected for the shot", () => {
    const prompt = buildDeterministicPolicySafeImagePrompt({
      rewrittenSynopsis:
        "ที่สำนักงานชั่วคราว คุณกฤตกดอ่านข้อความว่า ปรางเข้าโทรแล้ว (ปรางไม่ได้อยู่ในห้องแต่พูดถึงเท่านั้น) เขาชะงักก่อนหยิบกุญแจรถ",
      characterReferenceManifest: [
        { index: 1, name: "คุณกฤต", presence: "scene" },
      ],
      excludedVisualCharacterNames: ["ปราง"],
    } as Parameters<typeof buildDeterministicPolicySafeImagePrompt>[0]);

    expect(prompt).toContain("คุณกฤต");
    expect(prompt).toContain("exactly 1 physical scene character");
    expect(prompt).not.toContain("ปราง");
    expect(prompt).not.toContain("ไม่ได้อยู่ในห้องแต่พูดถึงเท่านั้น");
  });

  it("protects an allowed name that contains a shorter excluded name", () => {
    expect(
      guardStartFramePromptVisibleCast({
        prompt: "ไอรินยืนอ่านรายงาน ส่วนรินถูกพูดถึงในข้อความ",
        allowedCharacterNames: ["ไอริน"],
        excludedCharacterNames: ["ริน"],
      })
    ).toBe("ไอรินยืนอ่านรายงาน ส่วนถูกพูดถึงในข้อความ");
  });

  it("emits TARGET IMAGE MODEL whenever the family is known, regardless of mode", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        imageModelFamily: "gpt",
        imageModelName: "GPT Image",
        imageModelId: "gpt-image-1.5-all",
      })
    );
    expect(prompt).toContain(
      'TARGET IMAGE MODEL: family=gpt model="GPT Image (gpt-image-1.5-all)"'
    );
  });

  it("omits TARGET IMAGE MODEL entirely when the family is unknown (byte-identical regression guard)", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(baseShotParams());
    expect(prompt).not.toContain("TARGET IMAGE MODEL");
  });

  it("emits compact SERIES LOOK REGISTER only for a new mode", () => {
    const register = {
      styleName: "Intimate drama",
      palette: ["warm cream", "muted navy", "soft rose"],
      lighting: "soft window light",
      cameraGrammar: "restrained still composition",
    };
    const withMode = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        imagePromptMode: "cinematic_narrative",
        seriesLookRegister: register,
      })
    );
    expect(withMode).toContain("SERIES LOOK REGISTER");
    expect(withMode).toContain('style="Intimate drama"');
    expect(withMode).toContain("soft window light");
    expect(withMode).toContain('still_camera="restrained still composition"');
    expect(withMode).not.toContain("positive=[");
    expect(withMode).not.toContain("negative=[");

    const legacyNoMode = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ seriesLookRegister: register })
    );
    expect(legacyNoMode).not.toContain("SERIES LOOK REGISTER");
  });

  it("omits SERIES LOOK REGISTER for a new mode when the register is absent", () => {
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" })
    );
    expect(prompt).not.toContain("SERIES LOOK REGISTER");
  });

  it("emits PRODUCT TIE-IN only for a new mode with an active product tie-in", () => {
    const productTieIn = {
      active: true,
      productName: "Golden Fish Sauce",
      productDescription: "amber glass bottle",
    };
    const withMode = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite", productTieIn })
    );
    expect(withMode).toContain(
      'PRODUCT TIE-IN: product_name="Golden Fish Sauce" product_description="amber glass bottle"'
    );

    const legacyNoMode = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ productTieIn })
    );
    expect(legacyNoMode).not.toContain("PRODUCT TIE-IN");
  });

  it("never emits PRODUCT TIE-IN when referenceFrameMode forces legacy, even with a mode + active tie-in set", () => {
    const productTieIn = {
      active: true,
      productName: "X",
      productDescription: "Y",
    };
    const prompt = buildStartFrameShotPromptUserPrompt(
      baseShotParams({
        imagePromptMode: "cinematic_narrative",
        referenceFrameMode: true,
        productTieIn,
      })
    );
    expect(prompt).not.toContain("PRODUCT TIE-IN");
    expect(prompt).not.toContain("SERIES LOOK REGISTER");
  });

  it("emits frame_analysis_inputs ONLY for cinematic_narrative mode", () => {
    const cinematic = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "cinematic_narrative" })
    );
    expect(cinematic).toContain("frame_analysis_inputs");

    const policySafe = buildStartFrameShotPromptUserPrompt(
      baseShotParams({ imagePromptMode: "policy_safe_rewrite" })
    );
    expect(policySafe).not.toContain("frame_analysis_inputs");

    const legacy = buildStartFrameShotPromptUserPrompt(baseShotParams());
    expect(legacy).not.toContain("frame_analysis_inputs");
  });
});

describe("buildStartFrameShotPromptVisionImages — mode-2 vision attachment (c)", () => {
  it("mode 1 / legacy: attaches only the shot's own image + additionalImageUrls, unchanged from today", () => {
    const images = buildStartFrameShotPromptVisionImages(
      "https://cdn/shot.png",
      [{ url: "https://cdn/extra.png", label: "extra" }]
    );
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
      }
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
      characterReferenceImages: [
        { url: "https://cdn/hero.png", label: "Hero" },
      ],
    });
    expect(images).toEqual([
      { url: "https://cdn/hero.png", label: "Image 1 reference: Hero" },
    ]);
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
