/**
 * Coverage for `verticalDramaDialogueAudio.ts`'s Section 05 additions (spec
 * §7.3 speech profiles / §11 unified criteria, F132F/F132D, added
 * 2026-07-09):
 *  - a character's `speechProfile` (when present) maps into a per-character
 *    delivery-hint instruction (pace + tone), never the profile echoed
 *    verbatim;
 *  - a character with no `speechProfile` never gets a delivery-hint line;
 *  - `opts.dialogueRulesV2Enabled` injects Section 01's dialogue-rules-v2
 *    fragment (incl. the criteria version marker); omitted/false keeps the
 *    prompt byte-identical.
 *
 * Mirrors `verticalDramaDialogueAudio.generation.test.ts`'s mocking pattern.
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
// Centralized per-series model policy resolver
// (`planning/vertical-drama-centralized-model-policy/plan.md` Phase 3) — its
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

import fs from "fs";
import { parseSkillFile } from "@smartspec/skills";
import { generateEpisodeDialogueAudioPlan } from "../verticalDramaDialogueAudio";
import { executeWithFallback } from "../llmRouter";
import { hasEnoughCredits, deductCredits, calculateCreditsForLLM } from "../creditService";
import { mediaGenerationLimiter } from "../rateLimiter";
import { resolveSkillDirCandidates, resolveSkillManifestPath } from "../skillFiles";
import { resolveStoryBibleModel } from "../verticalDramaStoryBible";
import type { VerticalDramaSpeechProfile } from "@shared/verticalDramaSeries/speechProfile";

const mockExecute = vi.mocked(executeWithFallback);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockCalculateCredits = vi.mocked(calculateCreditsForLLM);
const mockResolveModel = vi.mocked(resolveStoryBibleModel);
const mockIsAllowed = vi.mocked(mediaGenerationLimiter.isAllowed);
const mockResolveSkillDirCandidates = vi.mocked(resolveSkillDirCandidates);
const mockResolveSkillManifestPath = vi.mocked(resolveSkillManifestPath);
const mockExistsSync = vi.mocked(fs.existsSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockParseSkillFile = vi.mocked(parseSkillFile);

const SAMPLE_SPEECH_PROFILE: VerticalDramaSpeechProfile = {
  speakingSpeed: "rapid_fire",
  vocabularyLevel: "everyday",
  emotionalDefault: "barely-contained panic",
  typicalSentenceLength: "very_short",
  metaphorUsage: "none",
  commonLineFunction: "blurts out warnings",
};

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

describe("generateEpisodeDialogueAudioPlan — Section 05 additions", () => {
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

  it("maps a character's speechProfile into a pace + tone delivery-hint instruction", async () => {
    await generateEpisodeDialogueAudioPlan(
      baseParams({
        characters: [
          { characterId: "char-1", name: "Aria", role: "lead", speechProfile: SAMPLE_SPEECH_PROFILE },
        ],
      }),
    );

    const content = userMessageContent();
    expect(content).toContain("Character speech-profile delivery hints");
    expect(content).toContain("char-1 (Aria)");
    expect(content).toContain("rapid-fire, breathless pacing");
    expect(content).toContain("barely-contained panic");
  });

  it("never echoes the raw speechProfile object verbatim into the prompt", async () => {
    await generateEpisodeDialogueAudioPlan(
      baseParams({
        characters: [
          { characterId: "char-1", name: "Aria", role: "lead", speechProfile: SAMPLE_SPEECH_PROFILE },
        ],
      }),
    );

    const content = userMessageContent();
    expect(content).not.toContain('"speakingSpeed"');
    expect(content).not.toContain('"vocabularyLevel"');
  });

  it("omits the delivery-hints section entirely when no character has a speechProfile", async () => {
    await generateEpisodeDialogueAudioPlan(baseParams());

    const content = userMessageContent();
    expect(content).not.toContain("Character speech-profile delivery hints");
  });

  it("omits the dialogue-rules-v2 fragment and criteria marker when opts.dialogueRulesV2Enabled is omitted", async () => {
    await generateEpisodeDialogueAudioPlan(baseParams());

    const content = userMessageContent();
    expect(content).not.toContain("DIALOGUE QUALITY RULES v2");
    expect(content).not.toMatch(/VD_QUALITY_CRITERIA_V\d+/);
  });

  it("injects the dialogue-rules-v2 fragment + criteria version marker when opts.dialogueRulesV2Enabled is true", async () => {
    await generateEpisodeDialogueAudioPlan(
      baseParams({ opts: { dialogueRulesV2Enabled: true } }),
    );

    const content = userMessageContent();
    expect(content).toContain("DIALOGUE QUALITY RULES v2");
    expect(content).toMatch(/VD_QUALITY_CRITERIA_V\d+/);
    expect(content).toContain("Spoken register");
  });
});
