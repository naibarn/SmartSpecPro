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
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
}));
vi.mock("../providerHealth", () => ({
  isAvailable: vi.fn(),
}));
vi.mock("../modelRegistry", () => ({
  resolveVerticalDramaCapabilities: vi.fn(),
}));
vi.mock("../verticalDramaProviderRouting", () => ({
  detectProviderFamily: vi.fn(),
}));
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
// `resolveShotVideoPromptModel`'s non-vision fallback now uses
// `resolveQualityLargeContextModelId` (was `resolveStoryBibleModel`). Fully
// mocked (only this one export is used by this file) rather than partially
// mocked via `vi.importActual` — this file's own SUT
// (`verticalDramaVideoMotionPromptGeneration.ts`) now has a REAL, static
// dependency on `verticalDramaImproveScript.ts`, and a full mock here avoids
// pulling in that module's own real dependency chain during this file's test
// run.
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
  generateVerticalDramaShotVideoPrompt,
  RateLimitExceededError,
  VdVisionRequiredError,
} from "../verticalDramaVideoMotionPromptGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { selectBestLlmModel } from "../intelligentModelSelector";
import { isAvailable } from "../providerHealth";
import { resolveVerticalDramaCapabilities } from "../modelRegistry";
import { resolveStoryBibleModel, InsufficientCreditsError, VdSchemaValidationError } from "../verticalDramaStoryBible";
import { resolveQualityLargeContextModelId } from "../verticalDramaImproveScript";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockResolveQualityModel = vi.mocked(resolveQualityLargeContextModelId);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);
const mockIsProviderAvailable = vi.mocked(isAvailable);
const mockResolveVerticalDramaCapabilities = vi.mocked(resolveVerticalDramaCapabilities);

function baseParams(
  overrides: Partial<Parameters<typeof generateVerticalDramaShotVideoPrompt>[0]> = {},
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    shotNumber: 3,
    imageUrl: "https://cdn.example.com/uploads/vd/shot-3.png",
    imagePrompt: "A young man kneels in a cold corridor, morning light.",
    shotContext: {
      description: "Frame stays high, panic rises",
      camera: "push-in, vertical",
      emotion: "urgent",
      dialogueLines: [] as Array<{
        characterKey?: string;
        lineTh: string;
        emotion?: string;
        delivery?: { tone?: string; pace?: string; pauses?: string; texture?: string };
        subtext?: string;
      }>,
    },
    selectedVideoModelId: "higgsfield/veo3_1_lite",
    selectedVideoModel: {
      type: "video" as const,
      aspectRatios: ["9:16"],
      configJson: {},
      provider: "higgsfield",
      aliases: [],
      id: "higgsfield/veo3_1_lite",
    },
    locale: "th" as const,
    idempotencyKey: "idem-key-1",
    ...overrides,
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 300, completion_tokens: 150 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

function truncatedResponse() {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: '{"prompt": "incomplete' }, index: 0, finish_reason: "length" }],
      usage: { prompt_tokens: 300, completion_tokens: 4000 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

describe("generateVerticalDramaShotVideoPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("active-vision-model");
    mockResolveQualityModel.mockResolvedValue("active-text-model");
    mockCalculateCredits.mockReturnValue(5);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-shot-video-prompt",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-shot-video-prompt/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "vision-model-1" } as any,
    ]);
    mockSelectBestLlmModel.mockReturnValue("vision-model-1");
    mockIsProviderAvailable.mockReturnValue(true);
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
  });

  it("happy path: uses a vision-capable model, attaches the image, includes the no-appearance instruction, deducts credits once", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "Camera holds steady as tension rises across his face.",
        negative_motion_prompt: "no identity drift",
        dialogue: [],
      }),
    );

    const result = await generateVerticalDramaShotVideoPrompt(baseParams());

    expect(result.usedVision).toBe(true);
    expect(result.prompt).toContain("Camera holds steady");
    expect(result.creditsUsed).toBe(5);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "idem-key-1" }),
    );

    // The image was actually attached as an image_url content part.
    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    expect(Array.isArray(userMessage.content)).toBe(true);
    const imagePart = (userMessage.content as any[]).find(p => p.type === "image_url");
    expect(imagePart.image_url.url).toBe("https://cdn.example.com/uploads/vd/shot-3.png");
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    // No-appearance-description instruction must be present in the system
    // prompt sent as this call's `system` message (loaded from skill.md).
    expect(call.messages[0].content).toBe("System prompt body");
    expect(textPart.text).toContain("attached image");
    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
      expect.objectContaining({
        supportsVision: true,
        supportsStructuredOutputs: true,
        recommendedOnly: true,
      }),
      expect.any(Array),
    );
  });

  it("falls back to the non-vision default model + text-only content when no enabled model supports vision", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockSelectBestLlmModel.mockReturnValue(null);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Motion description via prompt proxy only.", dialogue: [] }),
    );

    const result = await generateVerticalDramaShotVideoPrompt(baseParams());

    expect(result.usedVision).toBe(false);
    expect(result.model).toBe("active-text-model");
    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    expect(typeof userMessage.content).toBe("string");
    expect(userMessage.content).toContain(
      "A young man kneels in a cold corridor, morning light.",
    );
  });

  it("skips a vision model whose provider is in health cooldown and uses the next routable model", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "down-vision-model", providerId: 1, supportsVision: true } as any,
      { modelId: "healthy-vision-model", providerId: 2, supportsVision: true } as any,
    ]);
    mockIsProviderAvailable.mockImplementation((providerId) => providerId !== 1);
    mockSelectBestLlmModel.mockImplementation((_requirements, rows) => rows[0]?.modelId ?? null);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Healthy provider motion prompt.", dialogue: [] }),
    );

    const result = await generateVerticalDramaShotVideoPrompt(baseParams());

    expect(result.model).toBe("healthy-vision-model");
    expect(result.usedVision).toBe(true);
  });

  it("fails closed for character-grounded prompts when no vision-capable model is available", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);
    mockSelectBestLlmModel.mockReturnValue(null);

    await expect(
      generateVerticalDramaShotVideoPrompt(
        baseParams({
          characterReferenceImages: [
            { characterKey: "phakin", name: "ภาคิน", url: "https://example.com/phakin.png" },
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(VdVisionRequiredError);
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("embeds Thai dialogue verbatim instruction when the selected model has native audio and the shot has dialogue", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: 'He says, in natural spoken Thai, exactly: "แม่ครับ".',
        dialogue: [{ lineTh: "แม่ครับ", characterKey: "ปัณณ์" }],
      }),
    );

    const result = await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [{ lineTh: "แม่ครับ", characterKey: "ปัณณ์" }],
        },
      }),
    );

    expect(result.dialogue).toEqual([{ lineTh: "แม่ครับ", characterKey: "ปัณณ์" }]);
    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    expect(textPart.text).toContain("native lip-synced audio");
    expect(textPart.text).toContain("แม่ครับ");
  });

  it("routes dialogue to TTS-fallback instruction when the selected model has no native audio", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 9,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "Mouth moves as if speaking, no literal transcript embedded.",
        dialogue: [{ lineTh: "แม่ครับ" }],
      }),
    );

    await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [{ lineTh: "แม่ครับ" }],
        },
      }),
    );

    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    expect(textPart.text).toContain("NO native lip-sync");
  });

  it("ttsFallback branch returns the model-authored dialogue line (result.dialogue) so the caller persists it onto the clip + routes it to TTS, with speaking-direction (no literal transcript) in the prompt", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 9,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "The girl speaks a short line, lips syncing naturally, no transcript embedded.",
        dialogue: [{ lineTh: "แม่ครับ ผมกลับมาแล้ว" }],
      }),
    );

    const result = await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [{ lineTh: "แม่ครับ ผมกลับมาแล้ว" }],
        },
      }),
    );

    // The dialogue line must survive into the result so the router persists
    // it onto `clip.dialogue` (บทพูด box + "เสียงแยก TTS" badge) — never
    // dropped just because this model has no native audio.
    expect(result.dialogue).toEqual([{ lineTh: "แม่ครับ ผมกลับมาแล้ว" }]);
    expect(result.prompt).not.toContain("แม่ครับ ผมกลับมาแล้ว");
    expect(result.prompt.toLowerCase()).toMatch(/speak|lip/);
  });

  it("instructs the model to write its own short line (in the resolved speech language) only when the shot implies speech and no source dialogue was supplied — never defaults to silence", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "She turns and answers softly.",
        dialogue: [{ lineTh: "เดี๋ยวนี้เลยนะ" }],
      }),
    );

    await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "She turns to answer him, mouth opening to speak",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [],
        },
      }),
    );

    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    expect(textPart.text).toContain("NO-SOURCE-DIALOGUE");
    expect(textPart.text).toContain("WRITE one short, natural line yourself");
    expect(textPart.text).not.toContain("silent/ambient clip");
  });

  it("does NOT instruct the model to invent dialogue when dialogueLines is non-empty (no-source-dialogue clause omitted)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Camera holds.", dialogue: [{ lineTh: "แม่ครับ" }] }),
    );

    await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [{ lineTh: "แม่ครับ" }],
        },
      }),
    );

    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    expect(textPart.text).not.toContain("NO-SOURCE-DIALOGUE");
  });

  // 2026-07-07 non-human-character-vanishing fix — the shot-video-prompt
  // service context also gets the character identity map so motion/acting
  // direction for a non-human required character (e.g. เจ้าเกลือ, a cat)
  // doesn't drift into generic-human phrasing either.
  it("injects the character identity map into the user prompt when the router supplies one", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "The cat curls up near the bottle.", dialogue: [] }),
    );

    await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "calm",
          dialogueLines: [],
          characterIdentityMap:
            "CHARACTER IDENTITY MAP (MANDATORY — read before writing any character description):\n" +
            "character-8 = เจ้าเกลือ (มาสคอตของร้าน): แมวขาวปุยตาสีทะเลที่ชอบนอนทับขวดสำคัญ\n" +
            "Every required character listed above MUST be depicted true to this identity.",
        },
      }),
    );

    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    expect(textPart.text).toContain("CHARACTER IDENTITY MAP");
    expect(textPart.text).toContain("เจ้าเกลือ");
  });

  it("omits the character identity map entirely when the router doesn't supply one (backward compatible)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
    );

    await generateVerticalDramaShotVideoPrompt(baseParams());

    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    expect(textPart.text).not.toContain("CHARACTER IDENTITY MAP");
  });

  it("defaults to English prompt language + Thai speech language when the caller supplies neither (episode-level language plan)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Camera pushes in.", dialogue: [] }),
    );

    await generateVerticalDramaShotVideoPrompt(baseParams());

    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    expect(textPart.text).toContain("write the \"prompt\" and \"negative_motion_prompt\" fields entirely in English");
    expect(textPart.text).toContain("speak in Thai in this video");
  });

  it("threads a caller-supplied promptLanguage/dialogueLanguage into the LLM user prompt", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "Camera pushes in as she speaks.",
        dialogue: [{ lineTh: "Let's go.", characterKey: "aria" }],
      }),
    );

    await generateVerticalDramaShotVideoPrompt(
      baseParams({
        promptLanguage: "zh",
        dialogueLanguage: "en",
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [{ lineTh: "Let's go.", characterKey: "aria" }],
        },
      }),
    );

    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    const textPart = (userMessage.content as any[]).find(p => p.type === "text");
    expect(textPart.text).toContain("write the \"prompt\" and \"negative_motion_prompt\" fields entirely in Chinese");
    expect(textPart.text).toContain("speak in English in this video");
  });

  it("supports the wider dialogueLanguage set (e.g. Vietnamese, Arabic) beyond just th/en", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Camera pushes in as she speaks.", dialogue: [] }),
    );

    await generateVerticalDramaShotVideoPrompt(baseParams({ dialogueLanguage: "vi" }));
    let call = mockExecute.mock.calls[0][0];
    let textPart = (call.messages[1].content as any[]).find((p: any) => p.type === "text");
    expect(textPart.text).toContain("speak in Vietnamese in this video");

    mockExecute.mockClear();
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Camera pushes in as she speaks.", dialogue: [] }),
    );
    await generateVerticalDramaShotVideoPrompt(baseParams({ dialogueLanguage: "ar" }));
    call = mockExecute.mock.calls[0][0];
    textPart = (call.messages[1].content as any[]).find((p: any) => p.type === "text");
    expect(textPart.text).toContain("speak in Arabic in this video");
  });

  it("throws RateLimitExceededError before checking credits or calling the LLM", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(15_000);

    await expect(generateVerticalDramaShotVideoPrompt(baseParams())).rejects.toThrow(
      RateLimitExceededError,
    );

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateVerticalDramaShotVideoPrompt(baseParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("retries once with a higher token ceiling on truncated/invalid JSON, and succeeds on the retry", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(successResponse({ prompt: "Recovered prompt.", dialogue: [] }));

    const result = await generateVerticalDramaShotVideoPrompt(baseParams());

    expect(result.prompt).toBe("Recovered prompt.");
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute.mock.calls[1][0].maxTokens).toBeGreaterThan(
      mockExecute.mock.calls[0][0].maxTokens,
    );
  });

  it("throws VdSchemaValidationError (does not silently deduct credits) when BOTH attempts fail schema validation", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "active-vision-model", providerId: 1, supportsVision: true, supportsStructuredOutputs: true, isRecommended: true, priority: 1 } as any,
      { modelId: "active-vision-fallback", providerId: 2, supportsVision: true, supportsStructuredOutputs: true, isRecommended: true, priority: 2 } as any,
      { modelId: "unapproved-gemini", providerId: 3, supportsVision: true, supportsStructuredOutputs: true, isRecommended: false, priority: 0 } as any,
    ]);
    mockSelectBestLlmModel.mockImplementation((_requirements, rows) => rows[0]?.modelId ?? null);
    mockExecute.mockResolvedValue(truncatedResponse());

    await expect(generateVerticalDramaShotVideoPrompt(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    // Recovery may rotate once, but only into the admin-recommended set.
    expect(mockExecute).toHaveBeenCalledTimes(4);
    expect(mockExecute.mock.calls.map(([request]) => request.model)).toEqual([
      "active-vision-model",
      "active-vision-model",
      "active-vision-fallback",
      "active-vision-fallback",
    ]);
    expect(mockExecute.mock.calls.some(([request]) => request.model === "unapproved-gemini")).toBe(false);
    expect(mockExecute.mock.calls.some(([request]) => request.model === "gpt-4o-mini")).toBe(false);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("does not leave the Recommend set when no approved fallback is available", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "active-vision-model", providerId: 1, supportsVision: true, supportsStructuredOutputs: true, isRecommended: true, priority: 1 } as any,
      { modelId: "unapproved-gemini", providerId: 2, supportsVision: true, supportsStructuredOutputs: true, isRecommended: false, priority: 0 } as any,
    ]);
    mockSelectBestLlmModel.mockImplementation((_requirements, rows) => rows[0]?.modelId ?? null);
    mockExecute.mockResolvedValue(truncatedResponse());

    await expect(generateVerticalDramaShotVideoPrompt(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockExecute.mock.calls.every(([request]) => request.model === "active-vision-model")).toBe(true);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  // 2026-07-07 fix — repro: shot 4/series 4/episode 11, `higgsfield/grok_video`
  // selected (native audio, verified via audit log + DB), yet the LLM
  // (gpt-5.4-nano) wrote "lips moving in sync with the spoken line" instead
  // of quoting the line verbatim, despite receiving the correct instruction.
  // The compliance retry below is the fix for that failure mode.
  it("retries with a compliance-correction instruction when a native-audio model's prompt omits the verbatim dialogue line, and uses the corrected result", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(
        successResponse({
          prompt: "Her lips move in sync with the spoken line as she delivers the warning.",
          dialogue: [{ lineTh: "อย่าเข้ามา", characterKey: "หนูนา" }],
        }),
      )
      .mockResolvedValueOnce(
        successResponse({
          prompt: 'She says, in natural spoken Thai, exactly: "อย่าเข้ามา". Guarded, urgent tone.',
          dialogue: [{ lineTh: "อย่าเข้ามา", characterKey: "หนูนา" }],
        }),
      );

    const result = await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [{ lineTh: "อย่าเข้ามา", characterKey: "หนูนา" }],
        },
      }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    // The corrected (verbatim-embedding) response wins.
    expect(result.prompt).toContain("อย่าเข้ามา");
    expect(result.prompt).not.toContain("lips move in sync");

    const retryCall = mockExecute.mock.calls[1][0];
    const retryUserMessage = retryCall.messages[1];
    const retryTextPart = (retryUserMessage.content as any[]).find((p: any) => p.type === "text");
    expect(retryTextPart.text).toContain("COMPLIANCE CORRECTION");
    expect(retryTextPart.text).toContain("อย่าเข้ามา");
  });

  it("keeps the original (schema-valid) result when the compliance retry ALSO fails to embed the line verbatim, instead of throwing", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(
        successResponse({
          prompt: "His mouth moves as if speaking the warning line naturally.",
          dialogue: [{ lineTh: "หยุดนะ" }],
        }),
      )
      .mockResolvedValueOnce(
        successResponse({
          prompt: "His mouth moves again, still no literal transcript embedded.",
          dialogue: [{ lineTh: "หยุดนะ" }],
        }),
      );

    const result = await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [{ lineTh: "หยุดนะ" }],
        },
      }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    // Falls back to the FIRST (original) outcome rather than the still-
    // non-compliant retry, and never throws. The skill-first stitching gate
    // (`planning/vd-video-prompt-skill-first/plan.md` Phase 3a) still
    // appends the deterministic dialogue-verbatim safety net on top of that
    // original text, since neither attempt embedded the line verbatim — the
    // exact same contract the sibling "still applies the deterministic
    // safety net" coverage in `verticalDramaVideoMotionPromptGeneration
    // .test.ts` asserts for this scenario.
    expect(result.prompt).toContain("His mouth moves as if speaking the warning line naturally.");
    expect(result.prompt).toContain("Native dialogue (verbatim)");
    expect(result.prompt).toContain('"หยุดนะ"');
  });

  it("does NOT trigger the compliance retry when the model has no native audio (mouth-movement-only prose is correct there)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 9,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
    mockExecute.mockResolvedValue(
      successResponse({
        prompt: "Her lips move in sync with the spoken line, no transcript embedded.",
        dialogue: [{ lineTh: "อย่าเข้ามา" }],
      }),
    );

    await generateVerticalDramaShotVideoPrompt(
      baseParams({
        shotContext: {
          description: "desc",
          camera: "cam",
          emotion: "urgent",
          dialogueLines: [{ lineTh: "อย่าเข้ามา" }],
        },
      }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

/**
 * Story-density reform (spec §7.7.2 Layer 4, section-13, added 2026-07-07)
 * — `buildShotVideoPromptUserPrompt` (the FIRST-pass video-prompt builder)
 * gains duration/target-speech-seconds awareness, mirroring the phrasing
 * `generateVerticalDramaClipDialogue`'s `buildClipDialogueUserPrompt`
 * already uses on its (regeneration-only) path.
 */
describe("generateVerticalDramaShotVideoPrompt — duration-aware prompt (spec §7.7.2 Layer 4)", () => {
  // `beforeEach` is scoped to its enclosing `describe` block (vitest/jest
  // semantics) — this sibling block needs its OWN copy of the parent
  // `describe("generateVerticalDramaShotVideoPrompt", ...)` block's setup
  // above, otherwise every mock here (`mockExecute` included) silently
  // retains whatever state the LAST test of that other block left behind.
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("active-vision-model");
    mockResolveQualityModel.mockResolvedValue("active-text-model");
    mockCalculateCredits.mockReturnValue(5);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-shot-video-prompt",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-shot-video-prompt/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "vision-model-1" } as any,
    ]);
    mockSelectBestLlmModel.mockReturnValue("vision-model-1");
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
  });

  it("embeds clip duration + target spoken-dialogue seconds when both params are provided", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
    );

    await generateVerticalDramaShotVideoPrompt(
      baseParams({ shotDurationSeconds: 8, targetSpeechSeconds: 5.44 }),
    );

    const call = mockExecute.mock.calls[0][0];
    const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
    expect(textPart.text).toContain("Clip duration: 8s");
    expect(textPart.text).toContain("Target spoken-dialogue duration: about 5.4s total across all returned lines.");
  });

  it("omits both duration lines when neither param is provided (flag-off byte-identical to before)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
    );

    await generateVerticalDramaShotVideoPrompt(baseParams());

    const call = mockExecute.mock.calls[0][0];
    const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
    expect(textPart.text).not.toContain("Clip duration:");
    expect(textPart.text).not.toContain("Target spoken-dialogue duration:");
  });

  it("states clip duration without a target-speech line when only shotDurationSeconds is provided", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
    );

    await generateVerticalDramaShotVideoPrompt(baseParams({ shotDurationSeconds: 4 }));

    const call = mockExecute.mock.calls[0][0];
    const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
    expect(textPart.text).toContain("Clip duration: 4s");
    expect(textPart.text).not.toContain("Target spoken-dialogue duration:");
  });

  describe("nativeAudioEnabled (task #36 — optional NATIVE AUDIO DIRECTION prompt option)", () => {
    it("omits the NATIVE AUDIO DIRECTION instruction and audioDirection result when nativeAudioEnabled is not set (byte-identical default)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(baseParams());

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).not.toContain("NATIVE AUDIO DIRECTION");
      expect(textPart.text).not.toContain("native_audio: true");
      expect(result.audioDirection).toBeUndefined();
    });

    it("omits the instruction and result field when nativeAudioEnabled is true but the model does NOT support native audio", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: false,
        supportsNativeAudio: false,
        verticalDramaReady: true,
      });
      mockExecute.mockResolvedValue(
        successResponse({
          prompt: "Camera holds steady.",
          dialogue: [],
          audio_direction: "rain on the window; door creaks open",
        }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseParams({ nativeAudioEnabled: true }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).not.toContain("NATIVE AUDIO DIRECTION");
      // Even though the (mocked) model returned an audio_direction field
      // unprompted, the result never surfaces it when the option didn't
      // actually activate — guards against trusting an unprompted field.
      expect(result.audioDirection).toBeUndefined();
    });

    it("includes the NATIVE AUDIO DIRECTION instruction (SFX-primary, ambience-secondary, hard prohibitions) and returns audioDirection when enabled + supported", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        supportsNativeAudio: true,
        verticalDramaReady: true,
      });
      mockExecute.mockResolvedValue(
        successResponse({
          prompt: "Camera holds steady.",
          dialogue: [],
          audio_direction: "Door slams shut; distant rain patters against the window.",
        }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseParams({ nativeAudioEnabled: true }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).toContain("NATIVE AUDIO DIRECTION (native_audio: true)");
      expect(textPart.text).toContain("SFX cues");
      expect(textPart.text).toContain("ambient soundscape");
      expect(textPart.text).toContain("NEVER include speech/dialogue/voices/vocals");
      expect(textPart.text).toContain("NEVER include music/melody/lyrics/score");
      expect(result.audioDirection).toBe(
        "Door slams shut; distant rain patters against the window.",
      );
      // Sound-direction ownership fix (recorded gap 4, 2026-07-22) — this
      // function no longer appends an SFX tail onto `prompt` itself (the
      // skill now writes the sound clause into `prompt` directly; this mock
      // doesn't simulate that, so the returned prompt is exactly what the
      // mocked model returned, byte-for-byte).
      expect(result.prompt).toBe("Camera holds steady.");
      expect(result.prompt).not.toContain("SFX cues:");
    });

    it("leaves audioDirection undefined when enabled + supported but the model's response has no audio_direction field", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        supportsNativeAudio: true,
        verticalDramaReady: true,
      });
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseParams({ nativeAudioEnabled: true }),
      );

      expect(result.audioDirection).toBeUndefined();
    });
  });

  // Retention hooks (planning/vertical-drama-retention-hooks/plan.md W7,
  // added 2026-07-11) — `retentionHooksEnabled` gates whether
  // `is_opening_shot`/`is_retention_ending_shot` (derived from
  // `shotNumber`/`totalShotCount`) are rendered into the prompt. No router
  // call site sets either field yet (out of scope here) — these tests cover
  // the service-level contract directly.
  describe("retentionHooksEnabled (W7 — hook shot / retention-ending shot facts)", () => {
    it("omits both facts when retentionHooksEnabled is not set (byte-identical default)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(baseParams({ shotNumber: 1, totalShotCount: 9 }));

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).not.toContain("is_opening_shot");
      expect(textPart.text).not.toContain("is_retention_ending_shot");
    });

    it("omits both facts when retentionHooksEnabled is true but totalShotCount is absent and shotNumber is not 1", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({ shotNumber: 3, retentionHooksEnabled: true }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).not.toContain("is_opening_shot");
      expect(textPart.text).not.toContain("is_retention_ending_shot");
    });

    it("states is_opening_shot: true when retentionHooksEnabled is true and shotNumber is 1", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({ shotNumber: 1, totalShotCount: 9, retentionHooksEnabled: true }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).toContain("is_opening_shot: true");
      expect(textPart.text).not.toContain("is_retention_ending_shot");
    });

    it("states is_retention_ending_shot: true when retentionHooksEnabled is true and shotNumber equals totalShotCount", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({ shotNumber: 9, totalShotCount: 9, retentionHooksEnabled: true }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).toContain("is_retention_ending_shot: true");
      expect(textPart.text).not.toContain("is_opening_shot");
    });

    it("states BOTH facts when the episode has exactly one shot (shotNumber === 1 === totalShotCount)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({ shotNumber: 1, totalShotCount: 1, retentionHooksEnabled: true }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).toContain("is_opening_shot: true");
      expect(textPart.text).toContain("is_retention_ending_shot: true");
    });

    // Retention hooks W7 (router-wiring package, added 2026-07-11) —
    // `hookText`/`retentionLoopDescription` grounding text, the ONE
    // additive param this package added to this file (R7 deferred it).
    it("omits hookText/retentionLoopDescription text even when supplied, if the flag is off (byte-identical default)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({
          shotNumber: 1,
          totalShotCount: 9,
          hookText: "A phone rings in an empty house.",
          retentionLoopDescription: "The door creaks open.",
        }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).not.toContain("Episode hook");
      expect(textPart.text).not.toContain("Episode retention loop");
    });

    it("renders hookText on the opening shot when the flag is on", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({
          shotNumber: 1,
          totalShotCount: 9,
          retentionHooksEnabled: true,
          hookText: "A phone rings in an empty house.",
        }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).toContain(
        "Episode hook (verbatim, from the script"
      );
      expect(textPart.text).toContain("A phone rings in an empty house.");
      expect(textPart.text).not.toContain("Episode retention loop");
    });

    it("renders retentionLoopDescription on the retention-ending shot when the flag is on", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({
          shotNumber: 9,
          totalShotCount: 9,
          retentionHooksEnabled: true,
          retentionLoopDescription: "The door creaks open.",
        }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).toContain(
        "Episode retention loop (verbatim, from the script"
      );
      expect(textPart.text).toContain("The door creaks open.");
      expect(textPart.text).not.toContain("Episode hook");
    });

    it("omits the hook/retention-loop text lines when neither string is supplied, even with the flag on", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({ shotNumber: 1, totalShotCount: 1, retentionHooksEnabled: true }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p) => p.type === "text");
      expect(textPart.text).not.toContain("Episode hook");
      expect(textPart.text).not.toContain("Episode retention loop");
    });
  });
});

/**
 * Model-family-aware, vision-grounded video prompt quality upgrade
 * (`planning/vd-video-prompt-model-family-quality/plan.md`) — the
 * `TARGET VIDEO MODEL` fact block, `frame_analysis` parsing/normalization,
 * the position-anchor corrective-retry extension, and the SFX budget-aware
 * concat. Own top-level `describe`/`beforeEach` (mirrors the file's existing
 * per-block setup convention) so this coverage never depends on state left
 * behind by the sibling blocks above.
 */
describe("model-family-aware, vision-grounded video prompt quality upgrade (planning/vd-video-prompt-model-family-quality/plan.md)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockIsAllowed.mockReturnValue(true);
    mockCalculateCredits.mockReturnValue(5);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-shot-video-prompt",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-shot-video-prompt/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "vision-model-1" } as any,
    ]);
    mockSelectBestLlmModel.mockReturnValue("vision-model-1");
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
  });

  describe("TARGET VIDEO MODEL fact block", () => {
    it("emits 'TARGET VIDEO MODEL' + 'family: veo' for a veo model row (baseParams' default higgsfield/veo3_1_lite)", async () => {
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(baseParams());

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p: any) => p.type === "text");
      expect(textPart.text).toContain("TARGET VIDEO MODEL");
      expect(textPart.text).toContain("family: veo");
    });

    it("emits 'family: grok' + 'negative_prompt_supported: no' for a grok model row", async () => {
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({
          selectedVideoModelId: "grok-imagine-video-1.5",
          selectedVideoModel: {
            type: "video",
            aspectRatios: ["9:16"],
            configJson: {},
            provider: "hermes_grok",
            aliases: [],
            id: "grok-imagine-video-1.5",
          },
        }),
      );

      const call = mockExecute.mock.calls[0][0];
      const textPart = (call.messages[1].content as any[]).find((p: any) => p.type === "text");
      expect(textPart.text).toContain("family: grok");
      expect(textPart.text).toContain("negative_prompt_supported: no");
    });

    it("returns the resolved family on the result even when the fact block's request is byte-simple (solo shot, no established characters)", async () => {
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(baseParams());

      expect(result.family).toBe("veo");
    });

    it("requests frame_analysis (REQUIRED line) whenever an established character portrait is attached", async () => {
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      await generateVerticalDramaShotVideoPrompt(
        baseParams({
          characterReferenceImages: [
            { characterKey: "character-1", name: "ฝ้าย", url: "https://example.com/portrait-1.png" },
            { characterKey: "character-2", url: "https://example.com/portrait-2.png" },
          ],
        }),
      );
      const establishedCall = mockExecute.mock.calls[0][0];
      const establishedText = (establishedCall.messages[1].content as any[]).find(
        (p: any) => p.type === "text",
      ).text;
      expect(establishedText).toContain("frame_analysis: REQUIRED");

      mockExecute.mockClear();
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );
      await generateVerticalDramaShotVideoPrompt(
        baseParams({
          characterReferenceImages: [
            { characterKey: "character-1", name: "ฝ้าย", url: "https://example.com/portrait-1.png" },
          ],
        }),
      );
      const soloCall = mockExecute.mock.calls[0][0];
      const soloText = (soloCall.messages[1].content as any[]).find(
        (p: any) => p.type === "text",
      ).text;
      expect(soloText).toContain("frame_analysis: REQUIRED");

      mockExecute.mockClear();
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );
      await generateVerticalDramaShotVideoPrompt(baseParams());
      const noPortraitCall = mockExecute.mock.calls[0][0];
      const noPortraitText = (noPortraitCall.messages[1].content as any[]).find(
        (p: any) => p.type === "text",
      ).text;
      expect(noPortraitText).not.toContain("frame_analysis: REQUIRED");
    });
  });

  describe("frame_analysis parsing/normalization", () => {
    it("parses and normalizes frame_analysis from the LLM response (trims strings, drops empty entries)", async () => {
      mockExecute.mockResolvedValue(
        successResponse({
          prompt: "Camera holds steady.",
          dialogue: [],
          frame_analysis: {
            people: [
              { name: "  ฝ้าย  ", position: " left ", note: "foreground", action: "holding a phone" },
              { name: "character-2", position: "right" },
              { name: "", position: "center" },
            ],
            position_source: "image",
          },
        }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseParams({
          characterReferenceImages: [
            { characterKey: "character-1", name: "ฝ้าย", url: "https://example.com/portrait-1.png" },
            { characterKey: "character-2", url: "https://example.com/portrait-2.png" },
          ],
        }),
      );

      // Trimmed, and the empty-name entry is dropped by normalization.
      expect(result.frameAnalysis).toEqual({
        people: [
          { name: "ฝ้าย", position: "left", action: "holding a phone" },
          { name: "character-2", position: "right" },
        ],
        positionSource: "image",
      });
    });

    it("leaves frameAnalysis undefined when the LLM response has no usable frame_analysis field", async () => {
      mockExecute.mockResolvedValue(
        successResponse({ prompt: "Camera holds steady.", dialogue: [] }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(baseParams());

      expect(result.frameAnalysis).toBeUndefined();
    });
  });

  describe("position-anchor compliance retry (item C)", () => {
    it("rejects anatomical right-hand wording instead of treating it as screen-right", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(
        successResponse({
          prompt: 'phakin on the right hand says "อย่าไป".',
          dialogue: [{ lineTh: "อย่าไป", characterKey: "phakin" }],
          frame_analysis: {
            people: [{ name: "phakin", position: "left" }],
            position_source: "image",
          },
        }),
      );

      await expect(
        generateVerticalDramaShotVideoPrompt(
          baseParams({
            characterReferenceImages: [
              { characterKey: "phakin", name: "ภาคิน", url: "https://example.com/phakin.png" },
            ],
            shotContext: {
              description: "desc",
              camera: "cam",
              emotion: "urgent",
              dialogueLines: [{ lineTh: "อย่าไป", characterKey: "phakin" }],
            },
          }),
        ),
      ).rejects.toThrow(VdSchemaValidationError);
      expect(mockExecute).toHaveBeenCalledTimes(2);
      expect(mockDeductCredits).not.toHaveBeenCalled();
    });

    it("triggers exactly one corrective retry (never a second) when a quoted dialogue line lacks a nearby name/position anchor, then ACCEPTS the result regardless (fail-open) and surfaces a warning", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      // BOTH attempts return the SAME poorly-anchored (but verbatim-quoted)
      // prompt — the retry does NOT fix it, proving the fail-open "accept
      // regardless" contract rather than a throw/block.
      mockExecute.mockResolvedValue(
        successResponse({
          prompt: 'Someone says quietly: "อย่าเข้ามา" before turning away.',
          dialogue: [{ lineTh: "อย่าเข้ามา", characterKey: "หนูนา" }],
        }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseParams({
          characterReferenceImages: [
            { characterKey: "character-1", name: "หนูนา", url: "https://example.com/portrait-1.png" },
            { characterKey: "character-2", name: "ตัวร้าย", url: "https://example.com/portrait-2.png" },
          ],
          shotContext: {
            description: "desc",
            camera: "cam",
            emotion: "urgent",
            dialogueLines: [
              { lineTh: "อย่าเข้ามา", characterKey: "หนูนา", speakerName: "หนูนา" },
            ],
          },
        }),
      );

      // Exactly ONE corrective retry (cost policy) — never a second LLM pass.
      expect(mockExecute).toHaveBeenCalledTimes(2);
      const retryCall = mockExecute.mock.calls[1][0];
      const retryText = (retryCall.messages[1].content as any[]).find(
        (p: any) => p.type === "text",
      ).text;
      expect(retryText).toContain("POSITION-ANCHOR CORRECTION");
      expect(retryText).toContain("อย่าเข้ามา");

      // Fail-open: generation is never blocked/thrown over a still-imperfect
      // anchor — the result is accepted and a warning is surfaced instead.
      expect(result.prompt).toContain("อย่าเข้ามา");
      expect(result.warnings?.length).toBeGreaterThan(0);
      expect(result.warnings?.[0]).toContain("position-anchor");
    });

    it("does NOT trigger the position-anchor retry when no character portrait is attached, even with native audio + dialogue", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockExecute.mockResolvedValue(
        successResponse({
          prompt: 'Someone says quietly: "อย่าเข้ามา" before turning away.',
          dialogue: [{ lineTh: "อย่าเข้ามา", characterKey: "หนูนา" }],
        }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseParams({
          shotContext: {
            description: "desc",
            camera: "cam",
            emotion: "urgent",
            dialogueLines: [{ lineTh: "อย่าเข้ามา", characterKey: "หนูนา" }],
          },
        }),
      );

      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(result.warnings).toBeUndefined();
    });
  });

  // Recorded gap-4 fix (2026-07-22) — this block used to be "SFX budget-
  // aware concat (item E)" and asserted a LENGTH-DEPENDENT code-side concat
  // (skip the tail over 2000 chars, append it when it fit). That concat is
  // now deleted entirely: the skill writes the closing sound clause
  // directly into `prompt` itself (budget-guarded by the skill's own rule),
  // and this function must NEVER fold `audio_direction` onto `prompt`
  // itself, regardless of length — doing so used to double the sound
  // direction in the actual provider-submitted prompt, because
  // `verticalDramaVideoPromptFormatter.ts`'s render-time formatter ALSO
  // appended `clip.audioDirection` a second time (see that file's own test
  // suite for the formatter-side half of this fix).
  describe("sound-direction ownership fix (recorded gap 4, 2026-07-22) — no code-side SFX concat", () => {
    it("never appends an SFX/ambient tail onto the returned prompt, even when the combined length would have fit the old 2000-char cap", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: false,
        supportsNativeAudio: true,
        verticalDramaReady: true,
      });
      mockExecute.mockResolvedValue(
        successResponse({
          prompt: "Camera holds steady.",
          dialogue: [],
          audio_direction: "Rain taps the window.",
        }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseParams({ nativeAudioEnabled: true }),
      );

      expect(result.prompt).toBe("Camera holds steady.");
      expect(result.prompt).not.toContain("SFX cues:");
      // Still returned separately so the UI "เสียง:" block + audit trail can
      // read it — unaffected by this fix.
      expect(result.audioDirection).toBe("Rain taps the window.");
    });

    it("never appends an SFX/ambient tail even when the combined length would have exceeded the old 2000-char cap", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: false,
        supportsNativeAudio: true,
        verticalDramaReady: true,
      });
      const longBasePrompt = "A".repeat(1950);
      const longAudioDirection = "B".repeat(200);
      mockExecute.mockResolvedValue(
        successResponse({
          prompt: longBasePrompt,
          dialogue: [],
          audio_direction: longAudioDirection,
        }),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseParams({ nativeAudioEnabled: true }),
      );

      expect(result.prompt).toBe(longBasePrompt);
      expect(result.prompt).not.toContain("SFX cues:");
      expect(result.prompt.length).toBeLessThanOrEqual(2000);
      expect(result.audioDirection).toBe(longAudioDirection);
    });
  });
});
