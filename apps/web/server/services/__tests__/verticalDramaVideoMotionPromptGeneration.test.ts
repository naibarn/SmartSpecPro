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
  syncDialogueOntoMotionPromptClips,
  syncStartFramesOntoMotionPromptClips,
  appendPresetVisualIdentityStyleTokensToMotionPrompt,
  RateLimitExceededError,
  type VideoMotionPromptPackProjection,
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

/** Simulates a real truncated-mid-array LLM response (same failure class as the start-frame planner). */
function truncatedResponse() {
  const full = JSON.stringify(validOutput());
  const cutIndex = full.indexOf('"video_clip_requests"') + 60;
  return {
    type: "success" as const,
    response: {
      choices: [
        { message: { content: full.slice(0, cutIndex) }, index: 0, finish_reason: "length" },
      ],
      usage: { prompt_tokens: 220, completion_tokens: 4000 },
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

  it("defaults to English prompt language + Thai speech language when the caller supplies neither (episode-level language plan)", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(2)));

    const result = await generateVideoMotionPromptPack(baseParams());

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user",
    );
    expect(userMessage.content).toContain(
      "write every \"video_clip_requests[].prompt\"",
    );
    expect(userMessage.content).toContain("entirely in English");
    expect(userMessage.content).toContain("speak in Thai in this video");
    expect(result.pack.promptLanguage).toBeUndefined();
    expect(result.pack.dialogueLanguage).toBeUndefined();
  });

  it("threads a caller-supplied promptLanguage/dialogueLanguage into the LLM user prompt and echoes them onto the projected pack", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(2)));

    const result = await generateVideoMotionPromptPack(
      baseParams({ promptLanguage: "ja", dialogueLanguage: "en" }),
    );

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user",
    );
    expect(userMessage.content).toContain("entirely in Japanese");
    expect(userMessage.content).toContain("speak in English in this video");
    expect(result.pack.promptLanguage).toBe("ja");
    expect(result.pack.dialogueLanguage).toBe("en");
  });

  it("supports the wider dialogueLanguage set (e.g. Hindi) beyond just th/en", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValue(successResponse(validOutput(2)));

    const result = await generateVideoMotionPromptPack(
      baseParams({ dialogueLanguage: "hi" }),
    );

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user",
    );
    expect(userMessage.content).toContain("speak in Hindi in this video");
    expect(result.pack.dialogueLanguage).toBe("hi");
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

  // Phase 6, §6.6a root-cause regression: the LLM must never be allowed to
  // emit the SAME `prompt` text for two or more clips — this used to pass
  // schema validation silently (nothing in the schema forbade it). Duplicate
  // prompts are now treated as a schema-validation failure so the existing
  // one-shot retry (`executeJsonPlanningCallWithRetry`) automatically re-runs
  // the call instead of a duplicate pack persisting to the episode.
  it("treats an all-identical-prompt response as a schema validation failure and retries once", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    const duplicateOutput = {
      video_plan_summary: { video_model: "kling-2.0" },
      video_clip_requests: Array.from({ length: 4 }, (_, i) => ({
        ...validClipRequest(i + 1),
        prompt: "Same motion prompt for every clip",
      })),
      plain_text_video_plan: "Full plan text",
    };
    mockExecute
      .mockResolvedValueOnce(successResponse(duplicateOutput))
      .mockResolvedValueOnce(successResponse(validOutput(4)));

    const result = await generateVideoMotionPromptPack(baseParams());

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result.pack.clips.map(c => c.prompt)).toEqual([
      "Motion prompt for clip 1",
      "Motion prompt for clip 2",
      "Motion prompt for clip 3",
      "Motion prompt for clip 4",
    ]);
  });

  it("throws VdSchemaValidationError (does not silently persist a duplicate-prompt pack) when the retry is ALSO all-identical prompts", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    const duplicateOutput = {
      video_plan_summary: { video_model: "kling-2.0" },
      video_clip_requests: Array.from({ length: 3 }, (_, i) => ({
        ...validClipRequest(i + 1),
        prompt: "Identical prompt text",
      })),
      plain_text_video_plan: "Full plan text",
    };
    mockExecute.mockResolvedValue(successResponse(duplicateOutput));

    await expect(generateVideoMotionPromptPack(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("allows two clips to share dialogue-adjacent wording as long as the full prompt text differs", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    const output = {
      video_plan_summary: { video_model: "kling-2.0" },
      video_clip_requests: [
        { ...validClipRequest(1), prompt: "Clip 1: camera pushes in slowly on the reveal." },
        { ...validClipRequest(2), prompt: "Clip 2: camera holds steady on the reveal." },
      ],
      plain_text_video_plan: "Full plan text",
    };
    mockExecute.mockResolvedValueOnce(successResponse(output));

    const result = await generateVideoMotionPromptPack(baseParams());

    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(result.pack.clips).toHaveLength(2);
  });

  it("retries once with a higher token ceiling when the first response is truncated JSON, and succeeds on the retry", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(successResponse(validOutput(5)));

    const result = await generateVideoMotionPromptPack(baseParams());

    expect(result.pack.clips).toHaveLength(5);
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute.mock.calls[0][0].model).toBe(mockExecute.mock.calls[1][0].model);
    expect(mockExecute.mock.calls[1][0].maxTokens).toBeGreaterThanOrEqual(
      mockExecute.mock.calls[0][0].maxTokens,
    );
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws VdSchemaValidationError (does not silently persist an empty pack) when BOTH the first attempt and the retry are truncated", async () => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockExecute.mockResolvedValueOnce(truncatedResponse()).mockResolvedValueOnce(truncatedResponse());

    await expect(generateVideoMotionPromptPack(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
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

  it("honors a pre-existing caller-supplied model id even when the LLM summary claims a different one (Phase 1.2 fix)", () => {
    const raw = {
      video_plan_summary: { video_model: "some-other-model-the-llm-mentioned" },
      video_clip_requests: [validClipRequest(1)],
      plain_text_video_plan: "text",
    };
    const pack = projectMotionPromptPack(raw as any, "user-selected-video-model", "profile-x");
    expect(pack.selectedVideoModelId).toBe("user-selected-video-model");
  });

  it("falls back to the LLM's own claimed model only when no caller model id is supplied", () => {
    const raw = {
      video_plan_summary: { video_model: "llm-claimed-video-model" },
      video_clip_requests: [validClipRequest(1)],
      plain_text_video_plan: "text",
    };
    const pack = projectMotionPromptPack(raw as any, "", "profile-x");
    expect(pack.selectedVideoModelId).toBe("llm-claimed-video-model");
  });

  it("echoes the caller-supplied languagePlan onto the projection, and omits both fields when absent", () => {
    const raw = {
      video_plan_summary: {},
      video_clip_requests: [validClipRequest(1)],
      plain_text_video_plan: "text",
    };
    const withLanguage = projectMotionPromptPack(raw as any, "model-x", "profile-x", undefined, {
      promptLanguage: "zh",
      dialogueLanguage: "en",
    });
    expect(withLanguage.promptLanguage).toBe("zh");
    expect(withLanguage.dialogueLanguage).toBe("en");

    const withoutLanguage = projectMotionPromptPack(raw as any, "model-x", "profile-x");
    expect(withoutLanguage.promptLanguage).toBeUndefined();
    expect(withoutLanguage.dialogueLanguage).toBeUndefined();
  });
});

describe("appendPresetVisualIdentityStyleTokensToMotionPrompt (spec §8.2.2 flow-through)", () => {
  it("is a no-op when identity is undefined", () => {
    expect(appendPresetVisualIdentityStyleTokensToMotionPrompt("hero walks forward", undefined)).toBe(
      "hero walks forward",
    );
  });

  it("appends both styleName and lighting as deterministic style tokens", () => {
    const result = appendPresetVisualIdentityStyleTokensToMotionPrompt("hero walks forward", {
      styleName: "Neon Bio-Jungle Tech",
      lighting: "bioluminescent rim light",
    });
    expect(result).toContain("hero walks forward");
    expect(result).toContain("Neon Bio-Jungle Tech");
    expect(result).toContain("bioluminescent rim light");
  });

  it("appends only the present field when the other is empty", () => {
    const result = appendPresetVisualIdentityStyleTokensToMotionPrompt("hero walks forward", {
      styleName: "Neon Bio-Jungle Tech",
      lighting: "",
    });
    expect(result).toContain("Neon Bio-Jungle Tech");
    expect(result).not.toContain("lighting: ,");
  });
});

describe("syncDialogueOntoMotionPromptClips", () => {
  function basePack(clips: VideoMotionPromptPackProjection["clips"]): VideoMotionPromptPackProjection {
    return {
      selectedVideoModelId: "veo-3-1",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips,
    };
  }

  it("returns the pack unchanged when dialogueAudioPlan is null", () => {
    const pack = basePack([{ clipNumber: 1, sourceShotNumbers: [1], prompt: "p", durationSeconds: 8 }]);
    const result = syncDialogueOntoMotionPromptClips(pack, null);
    expect(result).toBe(pack);
  });

  it("returns the pack unchanged for today's camelCase dry-run placeholder shape (shotLines: [])", () => {
    const pack = basePack([{ clipNumber: 1, sourceShotNumbers: [1], prompt: "p", durationSeconds: 8 }]);
    const result = syncDialogueOntoMotionPromptClips(pack, {
      audioStrategy: "separate_tts_voiceover",
      shotLines: [],
    });
    expect(result).toBe(pack);
  });

  it("maps a raw dialogue_lines[] entry onto the matching clip by clip_number", () => {
    const pack = basePack([
      { clipNumber: 1, sourceShotNumbers: [1], prompt: "clip 1 prompt", durationSeconds: 8 },
      { clipNumber: 2, sourceShotNumbers: [2], prompt: "clip 2 prompt", durationSeconds: 8 },
    ]);
    const result = syncDialogueOntoMotionPromptClips(pack, {
      dialogue_lines: [
        {
          shot_number: 1,
          clip_number: 1,
          speaker_character_id: "char_aria",
          dialogue_line: "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ",
          delivery: { tone: "cold", pace: "slow", pauses: "beat", texture: "steady" },
          subtext: "sounds calm but has decided to retaliate",
        },
      ],
    });
    expect(result.clips[0].dialogue).toEqual([
      {
        characterKey: "char_aria",
        lineTh: "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ",
        emotion: undefined,
        delivery: { tone: "cold", pace: "slow", pauses: "beat", texture: "steady" },
        subtext: "sounds calm but has decided to retaliate",
      },
    ]);
    expect(result.clips[1].dialogue).toBeUndefined();
  });

  it("falls back to matching by shot_number against sourceShotNumbers when clip_number is absent", () => {
    const pack = basePack([{ clipNumber: 5, sourceShotNumbers: [7, 8], prompt: "p", durationSeconds: 8 }]);
    const result = syncDialogueOntoMotionPromptClips(pack, {
      dialogue_lines: [{ shot_number: 8, speaker_character_id: "char_kai", dialogue_line: "ไปกันเถอะ" }],
    });
    expect(result.clips[0].dialogue).toHaveLength(1);
    expect(result.clips[0].dialogue?.[0].lineTh).toBe("ไปกันเถอะ");
  });

  it("never overwrites a clip's existing non-empty dialogue array (upstream passthrough already carried it)", () => {
    const existing = [{ characterKey: "char_existing", lineTh: "existing line" }];
    const pack = basePack([
      { clipNumber: 1, sourceShotNumbers: [1], prompt: "p", durationSeconds: 8, dialogue: existing },
    ]);
    const result = syncDialogueOntoMotionPromptClips(pack, {
      dialogue_lines: [{ clip_number: 1, speaker_character_id: "char_other", dialogue_line: "different line" }],
    });
    expect(result.clips[0].dialogue).toBe(existing);
  });

  it("ignores dialogue_lines entries with an empty dialogue_line", () => {
    const pack = basePack([{ clipNumber: 1, sourceShotNumbers: [1], prompt: "p", durationSeconds: 8 }]);
    const result = syncDialogueOntoMotionPromptClips(pack, {
      dialogue_lines: [{ clip_number: 1, speaker_character_id: "char_aria", dialogue_line: "   " }],
    });
    expect(result.clips[0].dialogue).toBeUndefined();
  });
});

describe("syncStartFramesOntoMotionPromptClips (video MCP submission fix)", () => {
  function basePack(clips: VideoMotionPromptPackProjection["clips"]): VideoMotionPromptPackProjection {
    return {
      selectedVideoModelId: "higgsfield/grok_video",
      durationProfileId: "vertical_drama_60s_9_frames_8_clips",
      motionMode: "first_frame_to_video",
      clips,
    };
  }

  it("returns the pack unchanged when startFramePlan is null", () => {
    const pack = basePack([{ clipNumber: 1, sourceShotNumbers: [1], prompt: "p", durationSeconds: 8 }]);
    const result = syncStartFramesOntoMotionPromptClips(pack, null);
    expect(result).toBe(pack);
  });

  it("returns the pack unchanged when startFramePlan has no frames", () => {
    const pack = basePack([{ clipNumber: 1, sourceShotNumbers: [1], prompt: "p", durationSeconds: 8 }]);
    const result = syncStartFramesOntoMotionPromptClips(pack, { frames: [] });
    expect(result).toBe(pack);
  });

  it("fills a clip's startFrameAssetId from the matching approved start-frame render by primary shot number (regression: LLM never given real asset ids, so this was always empty)", () => {
    const pack = basePack([
      { clipNumber: 1, sourceShotNumbers: [1], prompt: "clip 1 prompt", durationSeconds: 8 },
      { clipNumber: 2, sourceShotNumbers: [2], prompt: "clip 2 prompt", durationSeconds: 8 },
    ]);
    const result = syncStartFramesOntoMotionPromptClips(pack, {
      frames: [
        { shotNumber: 1, approvedMediaAssetId: "60" },
        { shotNumber: 2, approvedMediaAssetId: "61" },
      ],
    });
    expect(result.clips[0].startFrameAssetId).toBe("60");
    expect(result.clips[1].startFrameAssetId).toBe("61");
  });

  it("never overwrites a clip's existing startFrameAssetId (upstream LLM already carried one)", () => {
    const pack = basePack([
      { clipNumber: 1, sourceShotNumbers: [1], prompt: "p", durationSeconds: 8, startFrameAssetId: "existing-frame" },
    ]);
    const result = syncStartFramesOntoMotionPromptClips(pack, {
      frames: [{ shotNumber: 1, approvedMediaAssetId: "60" }],
    });
    expect(result.clips[0].startFrameAssetId).toBe("existing-frame");
  });

  it("leaves a clip's startFrameAssetId unset when its primary shot has no approved frame yet", () => {
    const pack = basePack([{ clipNumber: 1, sourceShotNumbers: [3], prompt: "p", durationSeconds: 8 }]);
    const result = syncStartFramesOntoMotionPromptClips(pack, {
      frames: [{ shotNumber: 1, approvedMediaAssetId: "60" }],
    });
    expect(result.clips[0].startFrameAssetId).toBeUndefined();
  });

  it("uses the clip's first sourceShotNumbers entry as the primary shot (matches generateVideoClip's own parentShotNumber ?? sourceShotNumbers[0] convention)", () => {
    const pack = basePack([{ clipNumber: 1, sourceShotNumbers: [4, 5], prompt: "p", durationSeconds: 8 }]);
    const result = syncStartFramesOntoMotionPromptClips(pack, {
      frames: [
        { shotNumber: 4, approvedMediaAssetId: "70" },
        { shotNumber: 5, approvedMediaAssetId: "71" },
      ],
    });
    expect(result.clips[0].startFrameAssetId).toBe("70");
  });
});
