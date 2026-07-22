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
// Centralized per-series model policy resolver
// (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 2) — its
// own override/fallback contract is covered by
// `verticalDramaLlmModelPolicy.test.ts`; here it's mocked as a pure
// passthrough to `autoFallback` (the mocked `resolveStoryBibleModel` above)
// so this file's pre-existing "no override configured" behavior/assertions
// are unaffected and no real DB access happens.
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));
// Speaker-switch consolidated-prompt generator
// (`generateVerticalDramaShotVideoPromptSpeakerSwitch`) resolves its model
// via `resolveShotVideoPromptModel` (`loadEnabledLlmModelRows` ->
// `selectBestLlmModel`), a DIFFERENT path than `generateVideoMotionPromptPack`'s
// `resolveStoryBibleModel` above — mocked here so its own test block can
// force the vision-capable branch directly without touching the DB.
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(),
}));
vi.mock("../modelRegistry", () => ({
  resolveVerticalDramaCapabilities: vi.fn(),
}));

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateVideoMotionPromptPack,
  projectMotionPromptPack,
  syncDialogueOntoMotionPromptClips,
  syncStartFramesOntoMotionPromptClips,
  appendPresetVisualIdentityStyleTokensToMotionPrompt,
  generateVerticalDramaShotVideoPrompt,
  generateVerticalDramaShotVideoPromptSpeakerSwitch,
  buildNativeDialogueVerbatimBlock,
  appendMissingDialogueVerbatim,
  RateLimitExceededError,
  type VideoMotionPromptPackProjection,
  type GenerateVerticalDramaShotVideoPromptParams,
  type GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams,
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
import { loadEnabledLlmModelRows } from "../enabledLlmModels";
import { selectBestLlmModel } from "../intelligentModelSelector";
import { resolveVerticalDramaCapabilities } from "../modelRegistry";

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

    // 1 initial + VD_SCHEMA_MAX_RETRIES (2) corrective retries
    expect(mockExecute).toHaveBeenCalledTimes(3);
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

  // Retention hooks (planning/vertical-drama-retention-hooks/plan.md W7,
  // added 2026-07-11) — `retentionHooksEnabled` gates whether the shot lines
  // sent to the LLM are annotated with `is_opening_shot`/
  // `is_retention_ending_shot`. Both facts are derived purely from
  // `storyboardShots[].shotNumber` (min/max), which this function already
  // receives — no new caller wiring required for this pack-level path.
  describe("retentionHooksEnabled (W7 — hook shot / retention-ending shot facts)", () => {
    it("omits is_opening_shot/is_retention_ending_shot markers when the flag is absent (byte-identical default)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput(9)));

      await generateVideoMotionPromptPack(baseParams());

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).not.toContain("is_opening_shot");
      expect(userMessage.content).not.toContain("is_retention_ending_shot");
    });

    it("omits both markers when the flag is explicitly false (byte-identical)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput(9)));

      await generateVideoMotionPromptPack(baseParams({ retentionHooksEnabled: false }));

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).not.toContain("is_opening_shot");
      expect(userMessage.content).not.toContain("is_retention_ending_shot");
    });

    it("annotates the first shot line with is_opening_shot and the last with is_retention_ending_shot when the flag is on", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput(9)));

      await generateVideoMotionPromptPack(baseParams({ retentionHooksEnabled: true }));

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      const content = userMessage.content as string;
      expect(content).toContain("- Shot 1 (10s): Shot 1 | is_opening_shot: true (episode's hook shot)");
      expect(content).toContain(
        "- Shot 9 (10s): Shot 9 | is_retention_ending_shot: true (episode's retention-loop ending shot)",
      );
      // No shot in between should be marked.
      expect(content).not.toMatch(/Shot 5 \(10s\).*is_opening_shot/);
      expect(content).not.toMatch(/Shot 5 \(10s\).*is_retention_ending_shot/);
    });

    it("marks a single-shot episode's only shot line with BOTH facts when the flag is on", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput(1)));

      await generateVideoMotionPromptPack(
        baseParams({
          retentionHooksEnabled: true,
          storyboardShots: [{ shotNumber: 1, description: "Only shot", durationSeconds: 60 }],
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      const content = userMessage.content as string;
      expect(content).toContain("is_opening_shot: true (episode's hook shot)");
      expect(content).toContain("is_retention_ending_shot: true (episode's retention-loop ending shot)");
    });
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
    mockExecute
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(truncatedResponse())
      .mockResolvedValueOnce(truncatedResponse());

    await expect(generateVideoMotionPromptPack(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    // 1 initial + VD_SCHEMA_MAX_RETRIES (2) corrective retries
    expect(mockExecute).toHaveBeenCalledTimes(3);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  /**
   * Cliffhanger-bleed fix (confirmed production bug, 2026-07-11) — regression
   * guard for the judgment call made in this generator's own
   * `episodePlanContext` doc comment: UNLIKE the per-shot generator
   * (`generateVerticalDramaShotVideoPrompt`, whose caller now deliberately
   * omits `cliffhangerLine`), this whole-EPISODE-PACK generator renders
   * `episodePlanContext` as exactly ONE global block for the whole episode
   * (not per-shot), so its caller (`generateRealMotionPromptPack` in
   * `verticalDramaEpisodePipeline.ts`) still legitimately passes the
   * cliffhanger through untouched. These tests prove that decision is still
   * honored (byte-identical to before the fix) — a real regression here
   * would mean the whole-pack generator lost its own ending-beat context.
   */
  describe("episodePlanContext (Part B3, cliffhanger-bleed judgment call — this generator KEEPS it)", () => {
    it("includes the cliffhanger line, once, in the single global scene-setting block", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput(9)));

      await generateVideoMotionPromptPack(
        baseParams({
          episodePlanContext: [
            "ตอนที่ 1: กางเกงผ้าอ้อมทำงานยังไงถึงต้องมี",
            "เรื่องย่อ: ฝ้ายกับใบข้าวทดสอบกางเกงผ้าอ้อมกันน้ำ",
            "จุดค้าง: แล้วถ้ามือดูสะอาด แต่จริงๆ ยังสกปรกอยู่ล่ะ",
          ].join("\n"),
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      const content = userMessage.content as string;
      expect(content).toContain("จุดค้าง: แล้วถ้ามือดูสะอาด แต่จริงๆ ยังสกปรกอยู่ล่ะ");
      // Rendered exactly once — a single global block, not repeated per shot line.
      expect(content.split("จุดค้าง:")).toHaveLength(2);
    });

    it("omits the scene-setting block entirely when episodePlanContext is not provided (byte-identical)", async () => {
      mockHasEnoughCredits.mockResolvedValue(true);
      mockExecute.mockResolvedValue(successResponse(validOutput(9)));

      await generateVideoMotionPromptPack(baseParams());

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).not.toContain("จุดค้าง");
      expect(userMessage.content).not.toContain("บริบทฉากของตอน");
    });
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

describe("generateVerticalDramaShotVideoPrompt (per-shot image-grounded prompt, multi-character reference images fix)", () => {
  function baseShotVideoPromptParams(
    overrides: Partial<GenerateVerticalDramaShotVideoPromptParams> = {},
  ): GenerateVerticalDramaShotVideoPromptParams {
    return {
      userId: 1,
      tenantId: "tenant-1",
      seriesId: 42,
      episodeId: 7,
      shotNumber: 3,
      imageUrl: "https://example.com/shot3.png",
      shotContext: {
        description: "A character stands in a kitchen",
        camera: "medium shot",
        dialogueLines: [{ characterKey: "alice", lineTh: "Hello there" }],
      },
      selectedVideoModelId: "kling-2.0",
      selectedVideoModel: {
        id: "kling-2.0",
        type: "video",
        aspectRatios: ["9:16"],
        configJson: {},
        provider: "test-provider",
        aliases: [],
      } as any,
      locale: "en",
      ...overrides,
    };
  }

  function shotVideoPromptOutput(overrides: Record<string, unknown> = {}) {
    return {
      prompt: "The character looks up, startled, camera pushes in slowly.",
      negative_motion_prompt: "warping, identity drift",
      dialogue: [{ characterKey: "alice", lineTh: "Hello there" }],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockIsAllowed.mockReturnValue(true);
    mockCalculateCredits.mockReturnValue(6);
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
    // Force the vision-capable branch of `resolveShotVideoPromptModel`
    // directly, same convention as the speaker-switch describe block below.
    mockLoadEnabledLlmModelRows.mockResolvedValue([{ modelId: "vision-model" } as any]);
    mockSelectBestLlmModel.mockReturnValue("vision-model");
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      nativeAudioDialogue: false,
      supportsNativeAudio: false,
    } as any);
  });

  // Named speaker attribution (2026-07-15) — the dialogue fact must attribute
  // each line to the resolved DISPLAY NAME (`speakerName`) so the skill matches
  // it to the named character reference images, never the raw `characterKey`.
  function extractUserPromptText(): string {
    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user",
    );
    return typeof userMessage.content === "string"
      ? userMessage.content
      : userMessage.content.map((c: any) => c.text ?? "").join("\n");
  }

  it("dialogue fact attributes each line to the resolved speaker DISPLAY NAME (speakerName), not the raw characterKey", async () => {
    mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

    await generateVerticalDramaShotVideoPrompt(
      baseShotVideoPromptParams({
        shotContext: {
          description: "A character stands in a kitchen",
          camera: "medium shot",
          dialogueLines: [
            { characterKey: "char_kla", speakerName: "กล้า", lineTh: "ภูมิ เคยเห็นรูปนี้ไหม" },
          ],
        },
      }),
    );

    const content = extractUserPromptText();
    expect(content).toContain('1. กล้า: "ภูมิ เคยเห็นรูปนี้ไหม"');
    expect(content).not.toContain('char_kla: "ภูมิ เคยเห็นรูปนี้ไหม"');
  });

  it("dialogue fact falls back to characterKey when no speakerName is resolved (byte-identical to before)", async () => {
    mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

    await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());

    expect(extractUserPromptText()).toContain('1. alice: "Hello there"');
  });

  it("byte-identical-when-omitted: vision content array matches today's single-image shape, and the prompt text carries no character-reference fact line, when characterReferenceImages is absent", async () => {
    mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

    await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user",
    );
    expect(userMessage.content).toEqual([
      { type: "text", text: expect.any(String) },
      {
        type: "image_url",
        image_url: { url: "https://example.com/shot3.png", detail: "high" },
      },
    ]);
    expect(userMessage.content[0].text).not.toContain("Character reference images attached");
  });

  it("labeled-images-attached-in-order: attaches each character reference portrait labeled with its name, after the base start-frame image, in the given order", async () => {
    mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

    await generateVerticalDramaShotVideoPrompt(
      baseShotVideoPromptParams({
        characterReferenceImages: [
          { characterKey: "character-1", name: "ฝ้าย", url: "https://example.com/portrait-1.png" },
          { characterKey: "character-2", url: "https://example.com/portrait-2.png" },
        ],
      }),
    );

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user",
    );
    expect(userMessage.content).toEqual([
      { type: "text", text: expect.any(String) },
      {
        type: "image_url",
        image_url: { url: "https://example.com/shot3.png", detail: "high" },
      },
      { type: "text", text: "Reference image for character: ฝ้าย (character-1)" },
      {
        type: "image_url",
        image_url: { url: "https://example.com/portrait-1.png", detail: "high" },
      },
      { type: "text", text: "Reference image for character: character-2 (character-2)" },
      {
        type: "image_url",
        image_url: { url: "https://example.com/portrait-2.png", detail: "high" },
      },
    ]);
    expect(userMessage.content[0].text).toContain(
      "Character reference images attached below the start frame, each preceded by a text label naming the character: ฝ้าย, character-2.",
    );
  });

  it("non-vision-model-ignores-images: plain-text content (no image array at all) even when characterReferenceImages is supplied", async () => {
    mockSelectBestLlmModel.mockReturnValue(undefined as any);
    mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

    await generateVerticalDramaShotVideoPrompt(
      baseShotVideoPromptParams({
        characterReferenceImages: [
          { characterKey: "character-1", name: "ฝ้าย", url: "https://example.com/portrait-1.png" },
        ],
      }),
    );

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user",
    );
    expect(typeof userMessage.content).toBe("string");
  });

  it("compliance-retry-carries-same-images: the hand-rolled compliance-correction retry (native-audio verbatim-embedding fix) attaches the same images as the first attempt", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      nativeAudioDialogue: true,
      supportsNativeAudio: false,
    } as any);
    mockExecute
      .mockResolvedValueOnce(
        successResponse(
          shotVideoPromptOutput({
            prompt: "Alice speaks softly, mouth moving in sync with her words.",
          }),
        ),
      )
      .mockResolvedValueOnce(
        successResponse(shotVideoPromptOutput({ prompt: 'Alice says "Hello there" warmly.' })),
      );

    await generateVerticalDramaShotVideoPrompt(
      baseShotVideoPromptParams({
        characterReferenceImages: [
          { characterKey: "character-1", name: "ฝ้าย", url: "https://example.com/portrait-1.png" },
        ],
      }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    const imagesInCall = (callIndex: number) =>
      mockExecute.mock.calls[callIndex][0].messages
        .find((m: any) => m.role === "user")
        .content.filter((p: any) => p.type === "image_url");
    const firstImages = imagesInCall(0);
    const secondImages = imagesInCall(1);
    expect(firstImages).toHaveLength(2); // base start frame + 1 character reference
    expect(secondImages).toEqual(firstImages);
  });

  it("deterministically appends every source dialogue line when the native-audio compliance retry still omits it", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      nativeAudioDialogue: true,
      supportsNativeAudio: true,
    } as any);
    mockExecute.mockResolvedValue(
      successResponse(
        shotVideoPromptOutput({
          prompt: "Alice speaks softly without quoting the transcript.",
        }),
      ),
    );

    const result = await generateVerticalDramaShotVideoPrompt(
      baseShotVideoPromptParams({
        shotContext: {
          description: "Alice answers",
          dialogueLines: [
            { characterKey: "alice", lineTh: "First line" },
            { characterKey: "alice", lineTh: "Second line" },
            { characterKey: "bob", lineTh: "Third line" },
          ],
        },
      }),
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    // Lip-sync discipline fix — the deterministic block now attributes each
    // line by speaker (falling back to bare `characterKey` here, since this
    // test doesn't supply `speakerName`) and includes the SILENT LISTENER
    // rules header (2 distinct speakers: alice, bob).
    expect(result.prompt).toContain("Native dialogue (verbatim)");
    expect(result.prompt).toContain("SILENT LISTENER");
    expect(result.prompt).toContain('alice: "First line"');
    expect(result.prompt).toContain('alice: "Second line"');
    expect(result.prompt).toContain('bob: "Third line"');
  });

  it("builds the native dialogue block in source order without deduplicating repeats", () => {
    const result = buildNativeDialogueVerbatimBlock([
      { lineTh: "พูดซ้ำ" },
      { lineTh: "พูดซ้ำ" },
      { lineTh: "ประโยคสุดท้าย" },
    ]);
    const lines = result.split("\n").slice(1);
    expect(lines).toEqual(['"พูดซ้ำ"', '"พูดซ้ำ"', '"ประโยคสุดท้าย"']);
  });

  it("removes a compliant LLM quote before appending the sole canonical dialogue block", () => {
    const result = appendMissingDialogueVerbatim(
      'Alice leans closer and says “Hello there” with a calm smile.',
      [{ lineTh: "Hello there" }],
    );

    expect(result).toContain('Native dialogue (verbatim)');
    expect(result).toContain('"Hello there"');
    expect(result.match(/Hello there/g)).toHaveLength(1);
    expect(result).toContain("[spoken text: use canonical dialogue below]");
  });

  it("attributes each line by resolved speakerName and appends the lip-sync rules block idempotently (find, strip, re-append)", () => {
    const dialogueLines = [
      { characterKey: "character-1", speakerName: "กล้า", lineTh: "ถือขนมไปไหน" },
      { characterKey: "character-2", speakerName: "หนูนา", lineTh: "จะเอาไปให้ยาย" },
    ];
    const first = appendMissingDialogueVerbatim(
      "Kla walks into the kitchen.",
      dialogueLines,
      { dialogueLanguageName: "Thai", establishedCharacterCount: 2 },
    );
    expect(first).toContain('กล้า: "ถือขนมไปไหน"');
    expect(first).toContain('หนูนา: "จะเอาไปให้ยาย"');
    expect(first).toContain("SILENT LISTENER");

    // Idempotent: re-running against the ALREADY-appended prompt finds and
    // strips the previous block (via the stable marker) before re-appending
    // a fresh one — never doubling up.
    const second = appendMissingDialogueVerbatim(first, dialogueLines, {
      dialogueLanguageName: "Thai",
      establishedCharacterCount: 2,
    });
    expect(second.match(/Native dialogue \(verbatim\)/g)).toHaveLength(1);
    expect(second.match(/ถือขนมไปไหน/g)).toHaveLength(1);
    expect(second.match(/จะเอาไปให้ยาย/g)).toHaveLength(1);
  });

  it("fact-line-only-when-non-empty: omits the character-reference-images fact line from the prompt text when the array is explicitly empty", async () => {
    mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

    await generateVerticalDramaShotVideoPrompt(
      baseShotVideoPromptParams({ characterReferenceImages: [] }),
    );

    const userMessage = mockExecute.mock.calls[0][0].messages.find(
      (m: any) => m.role === "user",
    );
    expect(userMessage.content[0].text).not.toContain("Character reference images attached");
  });

  it("threads characterReferenceImageCount onto deductCredits metadata, and 0 when omitted", async () => {
    mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

    await generateVerticalDramaShotVideoPrompt(
      baseShotVideoPromptParams({
        characterReferenceImages: [
          { characterKey: "character-1", name: "ฝ้าย", url: "https://example.com/portrait-1.png" },
          { characterKey: "character-2", url: "https://example.com/portrait-2.png" },
        ],
      }),
    );
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ characterReferenceImageCount: 2 }),
      }),
    );

    mockDeductCredits.mockClear();
    mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));
    await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ characterReferenceImageCount: 0 }),
      }),
    );
  });

  // Location visual bible, Phase E (`planning/polished-toasting-gadget.md`) —
  // widened vision-call plumbing + new `locationReferenceImage` param, mirrors
  // the `characterReferenceImages` coverage above exactly. Every OTHER test
  // in this describe block already omits `locationReferenceImage`, so they
  // collectively serve as the regression guard the plan calls for; this
  // block makes that guarantee explicit.
  describe("locationReferenceImage (location visual bible, Phase E, polished-toasting-gadget.md)", () => {
    it("byte-identical-when-omitted: vision content array matches today's single-image shape, and the prompt text carries no location-reference fact line, when locationReferenceImage is absent", async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

      await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).toEqual([
        { type: "text", text: expect.any(String) },
        {
          type: "image_url",
          image_url: { url: "https://example.com/shot3.png", detail: "high" },
        },
      ]);
      expect(userMessage.content[0].text).not.toContain(
        "Environment/location reference image attached",
      );
    });

    it("location-image-attached-in-order: attaches the location reference image labeled with its name, AFTER the start frame and any character reference images", async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

      await generateVerticalDramaShotVideoPrompt(
        baseShotVideoPromptParams({
          characterReferenceImages: [
            { characterKey: "character-1", name: "ฝ้าย", url: "https://example.com/portrait-1.png" },
          ],
          locationReferenceImage: {
            url: "https://example.com/store-plate.png",
            name: "ร้านสะดวกซื้อ",
          },
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).toEqual([
        { type: "text", text: expect.any(String) },
        {
          type: "image_url",
          image_url: { url: "https://example.com/shot3.png", detail: "high" },
        },
        { type: "text", text: "Reference image for character: ฝ้าย (character-1)" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/portrait-1.png", detail: "high" },
        },
        { type: "text", text: "Environment/location reference image: ร้านสะดวกซื้อ" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/store-plate.png", detail: "high" },
        },
      ]);
      expect(userMessage.content[0].text).toContain(
        "Environment/location reference image attached below the start frame (and any character reference images), preceded by a text label naming the location: ร้านสะดวกซื้อ.",
      );
    });

    it("fact-line-only-when-present: omits the location-reference fact line/image when locationReferenceImage is not supplied, even with characterReferenceImages present", async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

      await generateVerticalDramaShotVideoPrompt(
        baseShotVideoPromptParams({
          characterReferenceImages: [
            { characterKey: "character-1", url: "https://example.com/portrait-1.png" },
          ],
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content[0].text).not.toContain(
        "Environment/location reference image attached",
      );
      expect(
        userMessage.content.filter((p: any) => p.type === "image_url"),
      ).toHaveLength(2); // start frame + 1 character portrait, no location image
    });

    it('defaults the vision-image label to "location" when locationReferenceImage has no name', async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

      await generateVerticalDramaShotVideoPrompt(
        baseShotVideoPromptParams({
          locationReferenceImage: { url: "https://example.com/plate.png" },
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).toContainEqual({
        type: "text",
        text: "Environment/location reference image: location",
      });
      expect(userMessage.content[0].text).toContain(
        "preceded by a text label naming the location: location.",
      );
    });

    it("compliance-retry-carries-same-images: the hand-rolled compliance-correction retry (native-audio verbatim-embedding fix) attaches the same location image as the first attempt", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        nativeAudioDialogue: true,
        supportsNativeAudio: false,
      } as any);
      mockExecute
        .mockResolvedValueOnce(
          successResponse(
            shotVideoPromptOutput({
              prompt: "Alice speaks softly, mouth moving in sync with her words.",
            }),
          ),
        )
        .mockResolvedValueOnce(
          successResponse(shotVideoPromptOutput({ prompt: 'Alice says "Hello there" warmly.' })),
        );

      await generateVerticalDramaShotVideoPrompt(
        baseShotVideoPromptParams({
          locationReferenceImage: { url: "https://example.com/plate.png", name: "Kitchen" },
        }),
      );

      expect(mockExecute).toHaveBeenCalledTimes(2);
      const imagesInCall = (callIndex: number) =>
        mockExecute.mock.calls[callIndex][0].messages
          .find((m: any) => m.role === "user")
          .content.filter((p: any) => p.type === "image_url");
      const firstImages = imagesInCall(0);
      const secondImages = imagesInCall(1);
      expect(firstImages).toHaveLength(2); // base start frame + 1 location reference
      expect(secondImages).toEqual(firstImages);
    });
  });

  // Synopsis grounding + silence signal
  // (`planning/vd-video-prompt-skill-first/plan.md` Phases 1a/2) —
  // `canonicalShotSummary`/`beatIsSilent` fact lines on `shotContext`.
  describe("canonicalShotSummary / beatIsSilent (synopsis grounding + silence signal, planning/vd-video-prompt-skill-first/plan.md)", () => {
    it("byte-identical-when-omitted: no AUTHORITATIVE SHOT BEAT / SILENT BEAT fact lines when both fields are absent", async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

      await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content[0].text).not.toContain("AUTHORITATIVE SHOT BEAT");
      expect(userMessage.content[0].text).not.toContain("SILENT BEAT");
    });

    it("injects the AUTHORITATIVE SHOT BEAT fact line, verbatim, BEFORE the shot description fact when canonicalShotSummary is present", async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

      await generateVerticalDramaShotVideoPrompt(
        baseShotVideoPromptParams({
          shotContext: {
            canonicalShotSummary: "The character silently reads a text message on their phone.",
            description: "A character stands in a kitchen",
            camera: "medium shot",
            dialogueLines: [{ characterKey: "alice", lineTh: "Hello there" }],
          },
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      const text = userMessage.content[0].text as string;
      expect(text).toContain(
        "AUTHORITATIVE SHOT BEAT (story overview — the single source of truth for what visibly happens in this shot; ground the video motion in THIS; when it conflicts with the shorter shot description below, follow this): The character silently reads a text message on their phone.",
      );
      const beatIndex = text.indexOf("AUTHORITATIVE SHOT BEAT");
      const descriptionIndex = text.indexOf("Shot description:");
      expect(beatIndex).toBeGreaterThan(-1);
      expect(descriptionIndex).toBeGreaterThan(-1);
      expect(beatIndex).toBeLessThan(descriptionIndex);
    });

    it("omits the AUTHORITATIVE SHOT BEAT fact line when canonicalShotSummary is an empty/whitespace-only string", async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));

      await generateVerticalDramaShotVideoPrompt(
        baseShotVideoPromptParams({
          shotContext: {
            canonicalShotSummary: "   ",
            description: "A character stands in a kitchen",
          },
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content[0].text).not.toContain("AUTHORITATIVE SHOT BEAT");
    });

    it("injects the SILENT BEAT fact line, verbatim, ahead of the dialogue block when beatIsSilent is true", async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput({ dialogue: [] })));

      await generateVerticalDramaShotVideoPrompt(
        baseShotVideoPromptParams({
          shotContext: {
            beatIsSilent: true,
            description: "A character reads a phone message silently",
          },
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      const text = userMessage.content[0].text as string;
      expect(text).toContain(
        'SILENT BEAT (MANDATORY): this shot is intentionally silent — no character speaks aloud. Express the beat purely through action, expression, and camera. Return "dialogue" as [] and do NOT write any spoken line, lip-sync direction, or verbatim dialogue block.',
      );
      const silentIndex = text.indexOf("SILENT BEAT");
      const dialogueBlockIndex = text.indexOf("Dialogue for this shot");
      expect(silentIndex).toBeGreaterThan(-1);
      expect(dialogueBlockIndex).toBeGreaterThan(-1);
      expect(silentIndex).toBeLessThan(dialogueBlockIndex);
    });

    it("generation-time silence enforcement: an LLM-invented dialogue line on a silent beat never triggers the native-audio compliance retry or the deterministic stitch", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        nativeAudioDialogue: true,
        supportsNativeAudio: false,
      } as any);
      // The model disobeys the SILENT BEAT instruction and invents a line —
      // must never be treated as "required" dialogue to retry/stitch for.
      mockExecute.mockResolvedValue(
        successResponse(
          shotVideoPromptOutput({
            prompt: "The character looks at their phone, expression unreadable.",
            dialogue: [{ characterKey: "alice", lineTh: "Invented line the model made up." }],
          }),
        ),
      );

      const result = await generateVerticalDramaShotVideoPrompt(
        baseShotVideoPromptParams({
          shotContext: {
            beatIsSilent: true,
            description: "A character reads a phone message silently",
          },
        }),
      );

      // Only ONE call — the compliance-correction retry never fired.
      expect(mockExecute).toHaveBeenCalledTimes(1);
      // Nothing was stitched in — the model's own (non-dialogue) prose is
      // returned untouched (trimmed only).
      expect(result.prompt).toBe(
        "The character looks at their phone, expression unreadable.",
      );
      expect(result.prompt).not.toContain("Native dialogue (verbatim)");
    });
  });

  // Vision fallback surface (`planning/vd-video-prompt-skill-first/plan.md`
  // Phase 1b) — a visible server-log signal instead of a silent guess.
  describe("vision fallback surface (planning/vd-video-prompt-skill-first/plan.md Phase 1b)", () => {
    it("logs a [vd_video_prompt] warning with seriesId/episodeId/shotNumber when the resolved model has no vision", async () => {
      mockSelectBestLlmModel.mockReturnValue(undefined as any);
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());

      expect(warnSpy).toHaveBeenCalledWith(
        "[vd_video_prompt] generated WITHOUT vision (no vision-capable model enabled) — model relied on imagePrompt text proxy only",
        { seriesId: 42, episodeId: 7, shotNumber: 3 },
      );
      warnSpy.mockRestore();
    });

    it("does not log the vision-fallback warning when the resolved model DOES have vision", async () => {
      mockExecute.mockResolvedValue(successResponse(shotVideoPromptOutput()));
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // Skill-first stitching gate (`planning/vd-video-prompt-skill-first/
  // plan.md` Phase 3a) — `appendMissingDialogueVerbatim` is a GATED safety
  // net, not an unconditional re-stitch.
  describe("skill-first stitching gate (planning/vd-video-prompt-skill-first/plan.md Phase 3a)", () => {
    it("trusts an already-compliant skill-first prompt: does NOT strip+re-append the canonical block when the model's own prose already embeds every dialogue line verbatim", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        nativeAudioDialogue: true,
        supportsNativeAudio: false,
      } as any);
      mockExecute.mockResolvedValue(
        successResponse(
          shotVideoPromptOutput({
            prompt: 'Alice leans in and says "Hello there" with a warm smile, her eyes soft.',
          }),
        ),
      );

      const result = await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());

      // Only ONE call — the compliance-correction retry never fired (the
      // model was already compliant).
      expect(mockExecute).toHaveBeenCalledTimes(1);
      // The model's own coherent prose is left as-is — no canonical block
      // stripped/re-appended on top of it.
      expect(result.prompt).toBe(
        'Alice leans in and says "Hello there" with a warm smile, her eyes soft.',
      );
      expect(result.prompt).not.toContain("Native dialogue (verbatim)");
      expect(result.prompt.match(/Hello there/g)).toHaveLength(1);
    });

    it("still applies the deterministic safety net when the model's prompt does NOT embed the dialogue verbatim (weak-model regression guard, unchanged from before this fix)", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        nativeAudioDialogue: true,
        supportsNativeAudio: false,
      } as any);
      // Both the first attempt AND the compliance retry stay non-compliant.
      mockExecute.mockResolvedValue(
        successResponse(
          shotVideoPromptOutput({
            prompt: "Alice speaks softly, mouth moving in sync with her words.",
          }),
        ),
      );

      const result = await generateVerticalDramaShotVideoPrompt(baseShotVideoPromptParams());

      expect(mockExecute).toHaveBeenCalledTimes(2); // first attempt + compliance retry
      expect(result.prompt).toContain("Native dialogue (verbatim)");
      expect(result.prompt).toContain('"Hello there"');
    });
  });
});

describe("generateVerticalDramaShotVideoPromptSpeakerSwitch (speaker-switch consolidated prompt, 2026-07-11 redesign)", () => {
  function baseSpeakerSwitchParams(
    overrides: Partial<GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams> = {},
  ): GenerateVerticalDramaShotVideoPromptSpeakerSwitchParams {
    return {
      userId: 1,
      tenantId: "tenant-1",
      seriesId: 42,
      episodeId: 7,
      shotNumber: 3,
      imageUrl: "https://example.com/shot3.png",
      shotContext: {
        description: "Two characters argue in a kitchen",
        camera: "medium two-shot",
        dialogueLines: [
          { characterKey: "alice", lineTh: "Why didn't you tell me?" },
          { characterKey: "bob", lineTh: "I was going to." },
          { characterKey: "alice", lineTh: "That's not good enough." },
        ],
      },
      selectedVideoModelId: "kling-2.0",
      selectedVideoModel: {
        id: "kling-2.0",
        type: "video",
        aspectRatios: ["9:16"],
        configJson: {},
        provider: "test-provider",
        aliases: [],
      } as any,
      locale: "en",
      subShotWindows: [
        { subShotNumber: 1, characterKey: "alice", lineIndexes: [0], durationSeconds: 3 },
        { subShotNumber: 2, characterKey: "bob", lineIndexes: [1], durationSeconds: 5 },
        { subShotNumber: 3, characterKey: "alice", lineIndexes: [2], durationSeconds: 2 },
      ],
      ...overrides,
    };
  }

  function speakerSwitchOutput(overrides: Record<string, unknown> = {}) {
    return {
      prompt: "A continuous kitchen argument, cutting between Alice and Bob across the clip.",
      negative_motion_prompt: "identity drift, warping",
      dialogue: [
        { characterKey: "alice", lineTh: "Why didn't you tell me?" },
        { characterKey: "bob", lineTh: "I was going to." },
        { characterKey: "alice", lineTh: "That's not good enough." },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockIsAllowed.mockReturnValue(true);
    mockCalculateCredits.mockReturnValue(9);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-shot-video-prompt-subshots",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-shot-video-prompt-subshots/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({
      metadata: {} as any,
      content: "System prompt body",
    });
    // Force the vision-capable branch of `resolveShotVideoPromptModel`
    // directly, bypassing the non-vision fallback chain (which itself would
    // otherwise reach `resolveVerticalDramaSeriesModel`/DB).
    mockLoadEnabledLlmModelRows.mockResolvedValue([{ modelId: "vision-model" } as any]);
    mockSelectBestLlmModel.mockReturnValue("vision-model");
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      nativeAudioDialogue: false,
      supportsNativeAudio: false,
    } as any);
  });

  it("returns ONE combined prompt/dialogue/durationSeconds result (not subShots[]), validated against the reused single-shot output schema", async () => {
    mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

    const result = await generateVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    expect(result).not.toHaveProperty("subShots");
    expect(result.prompt).toBe(speakerSwitchOutput().prompt);
    expect(result.dialogue).toHaveLength(3);
    expect(result.durationSeconds).toBe(10); // 3 + 5 + 2
    expect(result.creditsUsed).toBe(9);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("retries native-audio non-compliance and deterministically preserves every timed speaker line", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      nativeAudioDialogue: true,
      supportsNativeAudio: true,
    } as any);
    mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

    const result = await generateVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(result.prompt).toContain('"Why didn\'t you tell me?"');
    expect(result.prompt).toContain('"I was going to."');
    expect(result.prompt).toContain('"That\'s not good enough."');
  });

  it("orders distinctSpeakerCharacterKeys with the anchor (first window) speaker first, then each subsequent NEW speaker in first-appearance order, without duplicates", async () => {
    mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

    const result = await generateVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    // windows: alice (anchor), bob, alice again -> expect ["alice", "bob"]
    expect(result.distinctSpeakerCharacterKeys).toEqual(["alice", "bob"]);
  });

  it("flattens every window's dialogue lines in chronological order", async () => {
    mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

    const result = await generateVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams(),
    );

    expect(result.dialogue.map(l => l.characterKey)).toEqual(["alice", "bob", "alice"]);
    expect(result.dialogue.map(l => l.lineTh)).toEqual([
      "Why didn't you tell me?",
      "I was going to.",
      "That's not good enough.",
    ]);
  });

  it("succeeds even when the LLM response carries NO subShots[] array (proves schema reuse -- the old sub-shot-array-requiring schema is gone)", async () => {
    const output = speakerSwitchOutput();
    expect(output).not.toHaveProperty("subShots");
    mockExecute.mockResolvedValue(successResponse(output));

    await expect(
      generateVerticalDramaShotVideoPromptSpeakerSwitch(baseSpeakerSwitchParams()),
    ).resolves.toBeDefined();
  });

  it("throws RateLimitExceededError before checking credits or calling the LLM", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(5000);

    await expect(
      generateVerticalDramaShotVideoPromptSpeakerSwitch(baseSpeakerSwitchParams()),
    ).rejects.toThrow(RateLimitExceededError);
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      generateVerticalDramaShotVideoPromptSpeakerSwitch(baseSpeakerSwitchParams()),
    ).rejects.toThrow(InsufficientCreditsError);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output (missing required prompt field) and does not deduct credits", async () => {
    mockExecute.mockResolvedValue(successResponse({ dialogue: [] }));

    await expect(
      generateVerticalDramaShotVideoPromptSpeakerSwitch(baseSpeakerSwitchParams()),
    ).rejects.toThrow(VdSchemaValidationError);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  // Recorded gap-4 fix (2026-07-22) — this function used to fold
  // `audio_direction` onto `prompt` as an appended "SFX cues: ..." tail
  // here, which double-appended the sound direction once
  // `verticalDramaVideoPromptFormatter.ts`'s render-time formatter ALSO
  // appended `clip.audioDirection` a second time. The skill now writes the
  // closing sound clause directly into `prompt` itself, so this function
  // must never append it — `audioDirection` is still returned separately,
  // unaffected, for the UI "เสียง:" block + audit trail.
  it("never appends native audio direction onto the prompt as an SFX cue — audioDirection is still returned separately", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      nativeAudioDialogue: false,
      supportsNativeAudio: true,
    } as any);
    mockExecute.mockResolvedValue(
      successResponse(
        speakerSwitchOutput({ audio_direction: "A kettle whistles in the background." }),
      ),
    );

    const result = await generateVerticalDramaShotVideoPromptSpeakerSwitch(
      baseSpeakerSwitchParams({ nativeAudioEnabled: true }),
    );

    expect(result.prompt).toBe(
      "A continuous kitchen argument, cutting between Alice and Bob across the clip.",
    );
    expect(result.prompt).not.toContain("SFX cues:");
    expect(result.audioDirection).toBe("A kettle whistles in the background.");
  });

  // Multi-character disambiguation fix (`polished-toasting-gadget.md`) —
  // widened vision-call plumbing (§1) + new `characterReferenceImages` param
  // (§2). Every OTHER test in this describe block already omits
  // `characterReferenceImages`, so they collectively serve as the regression
  // guard the plan calls for; this test makes that guarantee explicit.
  describe("characterReferenceImages (multi-character disambiguation fix, polished-toasting-gadget.md)", () => {
    it("byte-identical-when-omitted: vision content array matches today's single-image shape", async () => {
      mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

      await generateVerticalDramaShotVideoPromptSpeakerSwitch(baseSpeakerSwitchParams());

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).toEqual([
        { type: "text", text: expect.any(String) },
        {
          type: "image_url",
          image_url: { url: "https://example.com/shot3.png", detail: "high" },
        },
      ]);
      expect(userMessage.content[0].text).not.toContain("Character reference images attached");
    });

    it("images-per-distinct-speaker: attaches one labeled reference image per distinct speaker, after the base start-frame image, and states the fact line", async () => {
      mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

      await generateVerticalDramaShotVideoPromptSpeakerSwitch(
        baseSpeakerSwitchParams({
          characterReferenceImages: [
            { characterKey: "alice", name: "Alice", url: "https://example.com/alice-portrait.png" },
            { characterKey: "bob", name: "Bob", url: "https://example.com/bob-portrait.png" },
          ],
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).toEqual([
        { type: "text", text: expect.any(String) },
        {
          type: "image_url",
          image_url: { url: "https://example.com/shot3.png", detail: "high" },
        },
        { type: "text", text: "Reference image for character: Alice (alice)" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/alice-portrait.png", detail: "high" },
        },
        { type: "text", text: "Reference image for character: Bob (bob)" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/bob-portrait.png", detail: "high" },
        },
      ]);
      expect(userMessage.content[0].text).toContain(
        "Character reference images attached below the start frame, each preceded by a text label naming the character: Alice, Bob.",
      );
    });
  });

  // Location visual bible, Phase E (`planning/polished-toasting-gadget.md`) —
  // mirrors the `characterReferenceImages` describe block immediately above.
  describe("locationReferenceImage (location visual bible, Phase E, polished-toasting-gadget.md)", () => {
    it("byte-identical-when-omitted: vision content array matches today's single-image shape", async () => {
      mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

      await generateVerticalDramaShotVideoPromptSpeakerSwitch(baseSpeakerSwitchParams());

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).toEqual([
        { type: "text", text: expect.any(String) },
        {
          type: "image_url",
          image_url: { url: "https://example.com/shot3.png", detail: "high" },
        },
      ]);
      expect(userMessage.content[0].text).not.toContain(
        "Environment/location reference image attached",
      );
    });

    it("location-image-attached-after-characters: attaches the labeled location reference image after the base start-frame image AND every character reference image, and states the fact line", async () => {
      mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

      await generateVerticalDramaShotVideoPromptSpeakerSwitch(
        baseSpeakerSwitchParams({
          characterReferenceImages: [
            { characterKey: "alice", name: "Alice", url: "https://example.com/alice-portrait.png" },
          ],
          locationReferenceImage: {
            url: "https://example.com/kitchen-plate.png",
            name: "Kitchen",
          },
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content).toEqual([
        { type: "text", text: expect.any(String) },
        {
          type: "image_url",
          image_url: { url: "https://example.com/shot3.png", detail: "high" },
        },
        { type: "text", text: "Reference image for character: Alice (alice)" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/alice-portrait.png", detail: "high" },
        },
        { type: "text", text: "Environment/location reference image: Kitchen" },
        {
          type: "image_url",
          image_url: { url: "https://example.com/kitchen-plate.png", detail: "high" },
        },
      ]);
      expect(userMessage.content[0].text).toContain(
        "Environment/location reference image attached below the start frame (and any character reference images), preceded by a text label naming the location: Kitchen.",
      );
    });
  });

  // Synopsis grounding (`planning/vd-video-prompt-skill-first/plan.md`
  // Phase 1a) — same fact-line contract as
  // `generateVerticalDramaShotVideoPrompt`'s identical coverage above,
  // mirrored for the speaker-switch builder. `beatIsSilent` is not
  // separately covered here — see this shape's own doc comment (a split
  // only happens when dialogue requires cutting between 2-3 speakers, so a
  // genuinely silent shot never reaches this path).
  describe("canonicalShotSummary (synopsis grounding, planning/vd-video-prompt-skill-first/plan.md)", () => {
    it("byte-identical-when-omitted: no AUTHORITATIVE SHOT BEAT fact line when absent", async () => {
      mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

      await generateVerticalDramaShotVideoPromptSpeakerSwitch(baseSpeakerSwitchParams());

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      expect(userMessage.content[0].text).not.toContain("AUTHORITATIVE SHOT BEAT");
    });

    it("injects the AUTHORITATIVE SHOT BEAT fact line, verbatim, BEFORE the shot description fact when present", async () => {
      mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

      await generateVerticalDramaShotVideoPromptSpeakerSwitch(
        baseSpeakerSwitchParams({
          shotContext: {
            canonicalShotSummary: "Alice and Bob argue over a secret Bob has been keeping.",
            description: "Two characters argue in a kitchen",
            camera: "medium two-shot",
            dialogueLines: [
              { characterKey: "alice", lineTh: "Why didn't you tell me?" },
              { characterKey: "bob", lineTh: "I was going to." },
              { characterKey: "alice", lineTh: "That's not good enough." },
            ],
          },
        }),
      );

      const userMessage = mockExecute.mock.calls[0][0].messages.find(
        (m: any) => m.role === "user",
      );
      const text = userMessage.content[0].text as string;
      expect(text).toContain(
        "AUTHORITATIVE SHOT BEAT (story overview — the single source of truth for what visibly happens in this shot; ground the video motion in THIS; when it conflicts with the shorter shot description below, follow this): Alice and Bob argue over a secret Bob has been keeping.",
      );
      const beatIndex = text.indexOf("AUTHORITATIVE SHOT BEAT");
      const descriptionIndex = text.indexOf("Shot description:");
      expect(beatIndex).toBeGreaterThan(-1);
      expect(descriptionIndex).toBeGreaterThan(-1);
      expect(beatIndex).toBeLessThan(descriptionIndex);
    });
  });

  // Skill-first stitching gate (`planning/vd-video-prompt-skill-first/
  // plan.md` Phase 3a) — mirrors the single-shot builder's identical gate.
  describe("skill-first stitching gate (planning/vd-video-prompt-skill-first/plan.md Phase 3a)", () => {
    it("trusts an already-compliant skill-first prompt: does NOT strip+re-append the canonical block when the model's own prose already embeds every segment's dialogue verbatim", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        nativeAudioDialogue: true,
        supportsNativeAudio: false,
      } as any);
      mockExecute.mockResolvedValue(
        successResponse(
          speakerSwitchOutput({
            prompt:
              'Alice snaps, "Why didn\'t you tell me?" Bob mutters, "I was going to." Alice fires back, "That\'s not good enough."',
          }),
        ),
      );

      const result = await generateVerticalDramaShotVideoPromptSpeakerSwitch(
        baseSpeakerSwitchParams(),
      );

      expect(mockExecute).toHaveBeenCalledTimes(1); // no compliance retry
      expect(result.prompt).toBe(
        'Alice snaps, "Why didn\'t you tell me?" Bob mutters, "I was going to." Alice fires back, "That\'s not good enough."',
      );
      expect(result.prompt).not.toContain("Native dialogue (verbatim)");
      expect(result.prompt.match(/Why didn't you tell me\?/g)).toHaveLength(1);
    });

    it("still applies the deterministic safety net when the model's prompt does NOT embed every segment's dialogue verbatim (weak-model regression guard, unchanged from before this fix)", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        nativeAudioDialogue: true,
        supportsNativeAudio: true,
      } as any);
      mockExecute.mockResolvedValue(successResponse(speakerSwitchOutput()));

      const result = await generateVerticalDramaShotVideoPromptSpeakerSwitch(
        baseSpeakerSwitchParams(),
      );

      expect(mockExecute).toHaveBeenCalledTimes(2); // first attempt + compliance retry
      expect(result.prompt).toContain('"Why didn\'t you tell me?"');
      expect(result.prompt).toContain('"I was going to."');
      expect(result.prompt).toContain('"That\'s not good enough."');
    });
  });
});
