/**
 * Coverage for `verticalDramaScriptGeneration.ts`'s Section 05 additions
 * (spec §7.3 speech profiles / §11 unified criteria, F132F/F132D, added
 * 2026-07-09):
 *  - a character's `speechProfile` (when present) renders a per-character
 *    voice card into the prompt, via the shared `renderVoiceCardBlock`;
 *  - a character with NO `speechProfile` never gets a voice card (byte-
 *    identical for legacy/non-profiled characters);
 *  - `opts.dialogueRulesV2Enabled` injects Section 01's dialogue-rules-v2
 *    fragment (incl. the greppable criteria-version marker) into the
 *    prompt; omitted/false keeps the prompt byte-identical to before this
 *    field existed.
 *
 * Mirrors `verticalDramaScriptGeneration.repairContext.test.ts`'s mocking
 * pattern exactly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "---\nname: vertical-drama-script-builder\n---\nSystem prompt body"),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: "System prompt body" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => ["/fake/skills/vertical-drama-script-builder"]),
  resolveSkillManifestPath: vi.fn(() => "/fake/skills/vertical-drama-script-builder/skill.md"),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLM } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockCalculateCreditsForLLM: vi.fn(() => 3),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  calculateCreditsForLLM: mockCalculateCreditsForLLM,
}));

vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

const { mockExecuteWithFallback } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
}));
vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../verticalDramaStoryBible", async () => {
  const actual = await vi.importActual<typeof import("../verticalDramaStoryBible")>(
    "../verticalDramaStoryBible",
  );
  return {
    ...actual,
    resolveStoryBibleModel: vi.fn(async () => "gpt-x"),
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

import { generateEpisodeScript } from "../verticalDramaScriptGeneration";
import type { VerticalDramaSpeechProfile } from "@shared/verticalDramaSeries/speechProfile";

const VALID_SCRIPT: Record<string, unknown> = {
  contract_version: 1,
  episode_title: "Episode 3",
  hook: "hook",
  structure: { mode: "beat", acts: [], beats: [] },
  scene_dialogue_summary: [],
  cliffhanger: "cliff",
  character_state_deltas: [],
  product_tie_in_plan: {},
  continuity_notes: [],
  warnings: [],
  repair_queue: [],
};

const SAMPLE_SPEECH_PROFILE: VerticalDramaSpeechProfile = {
  speakingSpeed: "fast",
  vocabularyLevel: "educated",
  emotionalDefault: "brittle sarcasm",
  typicalSentenceLength: "short",
  metaphorUsage: "occasional",
  commonLineFunction: "deflects with humor",
};

function baseParams(over: Record<string, unknown> = {}) {
  return {
    userId: 42,
    tenantId: "tenant-1",
    seriesId: 10,
    episodeId: 100,
    episodeTitle: "Episode 3",
    episodeNumber: 3,
    locale: "th" as const,
    durationSeconds: 60,
    storySource: {},
    characters: [],
    ...over,
  };
}

function mockLlmResponse(script: unknown = VALID_SCRIPT) {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(script) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
  });
}

function userMessageContent(): string {
  const callArgs = mockExecuteWithFallback.mock.calls[0][0];
  return callArgs.messages.find((m: { role: string }) => m.role === "user").content;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
  mockLlmResponse();
});

describe("generateEpisodeScript — speechProfile voice cards (spec §7.3, F132F)", () => {
  it("renders a voice card for a character that carries a speechProfile", async () => {
    await generateEpisodeScript(
      baseParams({
        characters: [
          { characterId: "char-1", name: "Aria", role: "lead", speechProfile: SAMPLE_SPEECH_PROFILE },
        ],
      }),
    );

    const content = userMessageContent();
    expect(content).toContain("Character voice cards");
    expect(content).toContain("char-1 (Aria)");
    expect(content).toContain("Voice:");
    expect(content).toContain("Speaking speed: fast");
    expect(content).toContain("Common line function: deflects with humor");
  });

  it("omits the voice-cards section entirely when no character has a speechProfile (byte-identical to before this field existed)", async () => {
    await generateEpisodeScript(
      baseParams({
        characters: [{ characterId: "char-1", name: "Aria", role: "lead" }],
      }),
    );

    const content = userMessageContent();
    expect(content).not.toContain("Character voice cards");
    expect(content).not.toContain("Voice:");
  });

  it("renders a voice card only for the character(s) that actually carry a speechProfile, in a mixed roster", async () => {
    await generateEpisodeScript(
      baseParams({
        characters: [
          { characterId: "char-1", name: "Aria", role: "lead", speechProfile: SAMPLE_SPEECH_PROFILE },
          { characterId: "char-2", name: "Somsak", role: "supporting" },
        ],
      }),
    );

    const content = userMessageContent();
    expect(content).toContain("char-1 (Aria)");
    expect(content).not.toContain("char-2 (Somsak):\nVoice:");
  });
});

describe("generateEpisodeScript — opts.dialogueRulesV2Enabled (spec §11, F132D)", () => {
  it("omits the dialogue-rules-v2 fragment and criteria marker when the flag is omitted (byte-identical)", async () => {
    await generateEpisodeScript(baseParams());

    const content = userMessageContent();
    expect(content).not.toContain("DIALOGUE QUALITY RULES v2");
    expect(content).not.toMatch(/VD_QUALITY_CRITERIA_V\d+/);
  });

  it("injects the dialogue-rules-v2 fragment + criteria version marker when opts.dialogueRulesV2Enabled is true", async () => {
    await generateEpisodeScript(baseParams({ opts: { dialogueRulesV2Enabled: true } }));

    const content = userMessageContent();
    expect(content).toContain("DIALOGUE QUALITY RULES v2");
    expect(content).toMatch(/VD_QUALITY_CRITERIA_V\d+/);
    expect(content).toContain("Anchor lines");
    expect(content).toContain("Clue budget");
  });
});

describe("generateEpisodeScript — dialogue language profile", () => {
  it("injects the exact contemporary spoken-English contract for an Auto English series", async () => {
    await generateEpisodeScript(
      baseParams({
        locale: "en",
        dialogueLanguageProfile: { version: 1, marketMode: "auto" },
      }),
    );

    const content = userMessageContent();
    expect(content).toContain(
      "Natural contemporary American English, spoken dialogue, not translated English.",
    );
    expect(content).toContain("dialogue_language_profile");
    expect(content).toContain("United States / General American English");
  });
});
