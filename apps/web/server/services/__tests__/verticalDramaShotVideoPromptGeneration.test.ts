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
});
