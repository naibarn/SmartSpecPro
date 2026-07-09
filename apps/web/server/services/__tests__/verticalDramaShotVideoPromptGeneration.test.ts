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

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateVerticalDramaShotVideoPrompt,
  RateLimitExceededError,
} from "../verticalDramaVideoMotionPromptGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { selectBestLlmModel } from "../intelligentModelSelector";
import { resolveVerticalDramaCapabilities } from "../modelRegistry";
import { resolveStoryBibleModel, InsufficientCreditsError, VdSchemaValidationError } from "../verticalDramaStoryBible";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);
const mockLoadEnabledLlmModelRows = vi.mocked(loadEnabledLlmModelRows);
const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);
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
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
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
  });

  it("falls back to the non-vision default model + text-only content when no enabled model supports vision", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockSelectBestLlmModel.mockReturnValue(null);
    mockExecute.mockResolvedValue(
      successResponse({ prompt: "Motion description via prompt proxy only.", dialogue: [] }),
    );

    const result = await generateVerticalDramaShotVideoPrompt(baseParams());

    expect(result.usedVision).toBe(false);
    expect(result.model).toBe("gpt-4o-mini");
    const call = mockExecute.mock.calls[0][0];
    const userMessage = call.messages[1];
    expect(typeof userMessage.content).toBe("string");
    expect(userMessage.content).toContain(
      "A young man kneels in a cold corridor, morning light.",
    );
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
    mockExecute.mockResolvedValue(truncatedResponse());

    await expect(generateVerticalDramaShotVideoPrompt(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
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
    // non-compliant retry, and never throws.
    expect(result.prompt).toBe("His mouth moves as if speaking the warning line naturally.");
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
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
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
});
