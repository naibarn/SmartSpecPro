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
});
