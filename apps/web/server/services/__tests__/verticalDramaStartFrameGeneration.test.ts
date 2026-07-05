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
  generateStartFrameRenderPlan,
  projectStartFramePlan,
  RateLimitExceededError,
} from "../verticalDramaStartFrameGeneration";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
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
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockGetResetTime = vi.mocked(mediaGenerationLimiter.getResetTime);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

function baseParams(
  overrides: Partial<Parameters<typeof generateStartFrameRenderPlan>[0]> = {},
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    episodeTitle: "Episode 1",
    durationSeconds: 90,
    selectedImageModelId: "google-banana-2-lite",
    storyboardShots: Array.from({ length: 9 }, (_, i) => ({
      shotNumber: i + 1,
      description: `Shot ${i + 1}`,
      cameraSetup: "medium shot",
      characterIds: ["char-1"],
      durationSeconds: 10,
    })),
    ...overrides,
  };
}

function validRequest(n: number) {
  return {
    shot_number: n,
    prompt: `Start frame prompt for shot ${n}`,
    negative_prompt: "blurry",
    reference_assets: [{ character_id: "char-1" }],
  };
}

function validOutput(count = 9) {
  return {
    render_plan_summary: { image_model: "google-banana-2-lite" },
    start_frame_requests: Array.from({ length: count }, (_, i) => validRequest(i + 1)),
    plain_text_render_plan: "Full plan text",
    downstream_video_input_manifest: {},
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 180, completion_tokens: 90 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

/** Simulates a real truncated-mid-array LLM response (evidence: 2026-07-05 series 2 episode 1). */
function truncatedResponse() {
  const full = JSON.stringify(validOutput());
  // Cut off partway through the `start_frame_requests` array, same failure
  // shape as `VD_SCHEMA_VALIDATION_FAILED`'s "Expected ',' or ']' after array
  // element" error.
  const cutIndex = full.indexOf('"start_frame_requests"') + 60;
  return {
    type: "success" as const,
    response: {
      choices: [
        { message: { content: full.slice(0, cutIndex) }, index: 0, finish_reason: "length" },
      ],
      usage: { prompt_tokens: 180, completion_tokens: 4000 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

describe("generateStartFrameRenderPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(6);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-shot-start-frame-render",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-shot-start-frame-render/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
  });

  it("happy path: valid LLM response projects render plan, deducts credits once, checks rate limiter", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput()));

    const result = await generateStartFrameRenderPlan(baseParams());

    expect(result.plan.frames).toHaveLength(9);
    expect(result.plan.mode).toBe("single_frame_per_shot");
    expect(result.plan.selectedImageModelId).toBe("google-banana-2-lite");
    expect(result.plan.frames[0]).toMatchObject({
      shotNumber: 1,
      imagePrompt: "Start frame prompt for shot 1",
      requiredCharacterRefs: ["char-1"],
    });
    expect(result.creditsUsed).toBe(6);
    expect(mockIsAllowed).toHaveBeenCalledWith("user:1");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws RateLimitExceededError before checking credits or calling the LLM", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(15_000);

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      RateLimitExceededError,
    );

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output (wrong request count) and does not deduct credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(4))); // schema requires exactly 9

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("retries once with a higher token ceiling when the first response is truncated JSON, and succeeds on the retry (2026-07-05 evidence: series 2 episode 1)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(successResponse(validOutput()));

    const result = await generateStartFrameRenderPlan(baseParams());

    expect(result.plan.frames).toHaveLength(9);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    // Same model both times — never auto-switches models on retry.
    expect(mockExecute.mock.calls[0][0].model).toBe(mockExecute.mock.calls[1][0].model);
    // Retry uses a higher/no-lower token ceiling than the first attempt.
    expect(mockExecute.mock.calls[1][0].maxTokens).toBeGreaterThanOrEqual(
      mockExecute.mock.calls[0][0].maxTokens,
    );
    // Retry's user prompt carries the stricter no-truncation instruction.
    const retryUserMessage = mockExecute.mock.calls[1][0].messages.find(
      (m: { role: string }) => m.role === "user",
    );
    expect(retryUserMessage.content).toMatch(/complete, valid, compact JSON/i);
    // Credits are only deducted once (for the successful retry), not twice.
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws VdSchemaValidationError (does not silently persist an empty plan) when BOTH the first attempt and the retry are truncated", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValueOnce(truncatedResponse()).mockResolvedValueOnce(truncatedResponse());

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("does not retry on a non-JSON provider/network error (only retries malformed-JSON/schema failures)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue({ type: "error", error: "upstream 503", statusCode: 503 } as any);

    await expect(generateStartFrameRenderPlan(baseParams())).rejects.toThrow(
      "LLM request failed: upstream 503",
    );

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });
});

describe("projectStartFramePlan", () => {
  it("sorts frames by shot number and falls back to the provided image model id when summary lacks one", () => {
    const raw = {
      render_plan_summary: {},
      start_frame_requests: [validRequest(2), validRequest(1)],
      plain_text_render_plan: "text",
      downstream_video_input_manifest: {},
    };
    const plan = projectStartFramePlan(raw as any, "fallback-model");
    expect(plan.selectedImageModelId).toBe("fallback-model");
    expect(plan.frames.map((f) => f.shotNumber)).toEqual([1, 2]);
  });

  it("honors a pre-existing caller-supplied model id even when the LLM summary claims a different one (Phase 1.2 fix)", () => {
    const raw = {
      render_plan_summary: { image_model: "some-other-model-the-llm-mentioned" },
      start_frame_requests: [validRequest(1)],
      plain_text_render_plan: "text",
      downstream_video_input_manifest: {},
    };
    const plan = projectStartFramePlan(raw as any, "user-selected-model");
    expect(plan.selectedImageModelId).toBe("user-selected-model");
  });

  it("falls back to the LLM's own claimed model only when no caller model id is supplied", () => {
    const raw = {
      render_plan_summary: { image_model: "llm-claimed-model" },
      start_frame_requests: [validRequest(1)],
      plain_text_render_plan: "text",
      downstream_video_input_manifest: {},
    };
    const plan = projectStartFramePlan(raw as any, "");
    expect(plan.selectedImageModelId).toBe("llm-claimed-model");
  });
});
