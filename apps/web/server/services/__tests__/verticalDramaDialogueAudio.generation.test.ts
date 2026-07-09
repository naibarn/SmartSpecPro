/**
 * Coverage for `verticalDramaDialogueAudio.ts`'s `generateEpisodeDialogueAudioPlan`
 * — the real LLM-driven generator wired for `verticalDramaEpisodePipeline.ts`'s
 * `repairStage` `dialogue_audio_plan` real-repair branch (the previously
 * orphaned `vertical-drama-dialogue-audio-planner` skill — see that
 * function's doc comment). Mirrors
 * `verticalDramaStoryboardGeneration.test.ts`'s mocking + assertion pattern
 * exactly.
 *
 * Kept as its own file (not appended to
 * `verticalDramaDialogueAudio.test.ts`) so the existing 645-line pure
 * DB-free/mock-free planner test suite in that file stays completely
 * undisturbed by this heavier LLM-call mock harness.
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
vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<
    typeof import("../verticalDramaStoryBible")
  >("../verticalDramaStoryBible");
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(),
  };
});

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import {
  generateEpisodeDialogueAudioPlan,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../verticalDramaDialogueAudio";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";

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
  overrides: Partial<Parameters<typeof generateEpisodeDialogueAudioPlan>[0]> = {},
) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 42,
    episodeId: 7,
    locale: "th" as const,
    durationSeconds: 60,
    episodeScript: { episode_title: "Episode 1" },
    characters: [{ characterId: "char-1", name: "Aria", role: "lead" }],
    ...overrides,
  };
}

function validOutput(): Record<string, unknown> {
  return {
    contract_version: 1,
    dialogue_lines: [
      {
        shot_number: 1,
        clip_number: 1,
        speaker_character_id: "char-1",
        dialogue_line: "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ",
        estimated_seconds: 2.4,
      },
    ],
    speaker_mapping: [{ speaker: "Aria", character_id: "char-1" }],
    voice_continuity_map: {},
    missing_voice_warnings: [],
    subtitle_cues: [],
    audio_timing_estimate: { total_seconds: 60, dialogue_seconds: 42 },
    native_audio_snippets: [],
    separate_tts_plan: { strategy: "separate_tts_voiceover", lines: [] },
    warnings: [],
    repair_queue: [],
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
      usage: { prompt_tokens: 150, completion_tokens: 80 },
    },
    providerName: "openai",
    providerId: 1,
  } as any;
}

function userMessageContent(): string {
  return mockExecute.mock.calls[0][0].messages.find(
    (m: { role: string }) => m.role === "user",
  ).content;
}

describe("generateEpisodeDialogueAudioPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveModel.mockResolvedValue("gpt-4o-mini");
    mockCalculateCredits.mockReturnValue(5);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockIsAllowed.mockReturnValue(true);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockResolveSkillDirCandidates.mockReturnValue([
      "/fake/skills/vertical-drama-dialogue-audio-planner",
    ]);
    mockResolveSkillManifestPath.mockReturnValue(
      "/fake/skills/vertical-drama-dialogue-audio-planner/skill.md",
    );
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("---\nname: test\n---\nSystem prompt body" as any);
    mockParseSkillFile.mockReturnValue({ metadata: {} as any, content: "System prompt body" });
    mockExecute.mockResolvedValue(successResponse(validOutput()));
  });

  it("happy path: valid LLM response validates, deducts credits once, checks rate limiter", async () => {
    const result = await generateEpisodeDialogueAudioPlan(baseParams());

    expect(result.plan.dialogue_lines).toHaveLength(1);
    expect(result.plan.dialogue_lines[0].dialogue_line).toBe("เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ");
    expect(result.creditsUsed).toBe(5);
    expect(result.model).toBe("gpt-4o-mini");
    expect(mockIsAllowed).toHaveBeenCalledWith("user:1");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws before checking credits or calling the LLM when the rate limiter rejects", async () => {
    mockIsAllowed.mockReturnValue(false);
    mockGetResetTime.mockReturnValue(15_000);

    await expect(generateEpisodeDialogueAudioPlan(baseParams())).rejects.toThrow();

    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and never calls the LLM when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateEpisodeDialogueAudioPlan(baseParams())).rejects.toThrow(
      InsufficientCreditsError,
    );

    expect(mockExecute).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError on malformed LLM output (missing required speaker_character_id) and does not deduct credits", async () => {
    const malformed = validOutput();
    (malformed.dialogue_lines as Array<Record<string, unknown>>)[0] = { dialogue_line: "no speaker" };
    mockExecute.mockResolvedValue(successResponse(malformed));

    await expect(generateEpisodeDialogueAudioPlan(baseParams())).rejects.toThrow(
      VdSchemaValidationError,
    );

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("injects REPAIR MODE framing + the current plan + the instruction when repairContext.currentPlan is present", async () => {
    const currentPlan = { dialogueLines: [{ text: "old line" }] };

    await generateEpisodeDialogueAudioPlan(
      baseParams({
        repairContext: { currentPlan, instruction: "ทำให้บทพูดช็อต 1 สั้นลง" },
      }),
    );

    const content = userMessageContent();
    expect(content).toContain("REPAIR MODE");
    expect(content).toContain("repair_instruction: ทำให้บทพูดช็อต 1 สั้นลง");
    const match = content.match(/current_plan: (\{.*?\})\nrepair_instruction/);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1])).toEqual(currentPlan);
  });

  it("renders a 'none on record yet' current_plan note when repairContext.currentPlan is null", async () => {
    await generateEpisodeDialogueAudioPlan(
      baseParams({
        repairContext: { currentPlan: null, instruction: "plan the dialogue" },
      }),
    );

    const content = userMessageContent();
    expect(content).toContain("current_plan: (none on record yet");
  });

  it("omits REPAIR MODE entirely when repairContext is absent", async () => {
    await generateEpisodeDialogueAudioPlan(baseParams());

    const content = userMessageContent();
    expect(content).not.toContain("REPAIR MODE");
    expect(content).not.toContain("repair_instruction");
  });

  it("renders episode_script, audio_strategy, and characters into the prompt", async () => {
    await generateEpisodeDialogueAudioPlan(
      baseParams({ audioStrategy: "native_video_audio" }),
    );

    const content = userMessageContent();
    expect(content).toContain('episode_script: {"episode_title":"Episode 1"}');
    expect(content).toContain("audio_strategy: native_video_audio");
    expect(content).toContain("char-1: Aria (lead)");
  });

  it("defaults audio_strategy to separate_tts_voiceover when omitted", async () => {
    await generateEpisodeDialogueAudioPlan(baseParams());

    const content = userMessageContent();
    expect(content).toContain("audio_strategy: separate_tts_voiceover");
  });
});
