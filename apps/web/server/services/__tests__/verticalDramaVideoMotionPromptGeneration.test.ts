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
  generateVideoMotionPromptPack,
  projectMotionPromptPack,
  RateLimitExceededError,
} from "../verticalDramaVideoMotionPromptGeneration";
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
  overrides: Partial<Parameters<typeof generateVideoMotionPromptPack>[0]> = {},
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    episodeTitle: "Episode 1",
    durationSeconds: 90,
    durationProfileId: "profile-90s",
    selectedVideoModelId: "kling-2.0",
    storyboardShots: Array.from({ length: 9 }, (_, i) => ({
      shotNumber: i + 1,
      description: `Shot ${i + 1}`,
      durationSeconds: 10,
    })),
    ...overrides,
  };
}

function validClipRequest(n: number, bridged = false) {
  return {
    clip_number: n,
    source_shot_numbers: [n],
    duration_seconds: 10,
    prompt: `Motion prompt for clip ${n}`,
    negative_motion_prompt: "shaky",
    start_frame_reference: bridged ? { asset_id: `asset-start-${n}` } : null,
    end_frame_reference: bridged ? { asset_id: `asset-end-${n}` } : null,
  };
}

function validOutput(count = 5, bridged = false) {
  return {
    video_plan_summary: { video_model: "kling-2.0" },
    video_clip_requests: Array.from({ length: count }, (_, i) => validClipRequest(i + 1, bridged)),
    plain_text_video_plan: "Full plan text",
  };
}

function successResponse(payload: unknown) {
  return {
    type: "success" as const,
    response: {
      choices: [{ message: { content: JSON.stringify(payload) }, index: 0, finish_reason: "stop" }],
      usage: { prompt_tokens: 220, completion_tokens: 110 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

describe("generateVideoMotionPromptPack", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(7);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-video-motion-prompt-pack",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-video-motion-prompt-pack/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
  });

  it("happy path: valid LLM response projects motion prompt pack, deducts credits once, checks rate limiter", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(5)));

    const result = await generateVideoMotionPromptPack(baseParams());

    expect(result.pack.clips).toHaveLength(5);
    expect(result.pack.selectedVideoModelId).toBe("kling-2.0");
    expect(result.pack.durationProfileId).toBe("profile-90s");
    expect(result.pack.motionMode).toBe("first_frame_to_video");
    expect(result.creditsUsed).toBe(7);
    expect(mockIsAllowed).toHaveBeenCalledWith("user:1");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("selects first_last_frame_bridge motion mode when a clip has both start and end frame references", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(3, true)));

    const result = await generateVideoMotionPromptPack(baseParams());

    expect(result.pack.motionMode).toBe("first_last_frame_bridge");
    expect(result.pack.clips[0].startFrameAssetId).toBe("asset-start-1");
    expect(result.pack.clips[0].endFrameAssetId).toBe("asset-end-1");
  });

  it("throws RateLimitExceededError before checking credits or calling the LLM", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(20_000);

    await expect(generateVideoMotionPromptPack(baseParams())).rejects.toThrow(
      RateLimitExceededError,
    );

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateVideoMotionPromptPack(baseParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output (empty clip list) and does not deduct credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(
      successResponse({
        video_plan_summary: {},
        video_clip_requests: [], // schema requires min(1)
        plain_text_video_plan: "text",
      }),
    );

    await expect(generateVideoMotionPromptPack(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

describe("projectMotionPromptPack", () => {
  it("sorts clips by clip number and falls back to provided model/profile ids when summary lacks them", () => {
    const raw = {
      video_plan_summary: {},
      video_clip_requests: [validClipRequest(2), validClipRequest(1)],
      plain_text_video_plan: "text",
    };
    const pack = projectMotionPromptPack(raw as any, "fallback-video-model", "fallback-profile");
    expect(pack.selectedVideoModelId).toBe("fallback-video-model");
    expect(pack.durationProfileId).toBe("fallback-profile");
    expect(pack.clips.map((c) => c.clipNumber)).toEqual([1, 2]);
  });
});
