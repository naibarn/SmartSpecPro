/**
 * `vertical-drama-skill-first-architecture` plan, Phase 4 item 1 — coverage
 * for activating the previously-orphaned `vertical-drama-season-dramaturgy-
 * critic` skill (Mode 2, `action: "draft_quality_score"`) as the system
 * prompt for `buildPremiumJudgePrompts`/`buildPremiumRejudgePrompts`
 * (`callPremiumJudge`/`callPremiumRejudge` inside `generateStoryBibleDeep`'s
 * premium pipeline).
 *
 * Mocks `fs`/`@smartspec/skills`/`../skillFiles` the SAME way
 * `verticalDramaScriptGeneration.repairQueueTolerance.test.ts` mocks skill
 * loading for `verticalDramaScriptGeneration.ts`'s own `loadSkillSystemPrompt`
 * — a fake, deterministic skill body lets these tests assert the judge/
 * re-judge system prompt is EXACTLY the loaded skill content (plus the one
 * narrow, still-code-appended tie-in addendum), never inline-authored prose.
 *
 * Otherwise mirrors `verticalDramaStoryBible.premiumDeepDraft.test.ts`'s own
 * mocking convention and call-index math exactly (fan-out 0-2, judge 3,
 * [revise 4, rejudge 5,] sweep last).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const FAKE_DRAMATURGY_CRITIC_SKILL_BODY =
  "FAKE DRAMATURGY CRITIC SKILL BODY — Mode 2 draft_quality_score rubric goes here.";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(
      () => `---\nname: vertical-drama-season-dramaturgy-critic\n---\n${FAKE_DRAMATURGY_CRITIC_SKILL_BODY}`,
    ),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: FAKE_DRAMATURGY_CRITIC_SKILL_BODY })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => ["/fake/skills/vertical-drama-season-dramaturgy-critic"]),
  resolveSkillManifestPath: vi.fn(() => "/fake/skills/vertical-drama-season-dramaturgy-critic/skill.md"),
}));

const { mockLoadEnabledLlmModelRows } = vi.hoisted(() => ({
  mockLoadEnabledLlmModelRows: vi.fn(async () => [] as unknown[]),
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: mockLoadEnabledLlmModelRows,
}));

vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => null),
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

const { mockExecuteWithFallback } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
}));
vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../_core/logger", () => ({
  debugLog: vi.fn(),
  debugError: vi.fn(),
}));

import {
  generateStoryBibleDeep,
  VD_DEEP_DRAFT_SHOTS_PER_EPISODE,
  VD_PREMIUM_DRAFT_SCORE_DIMENSIONS,
  VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS,
  type VdDeepDraftShotDraft,
  type StoredEpisodeBreakdownItem,
} from "../verticalDramaStoryBible";

function existingItem(episodeNumber: number, overrides: Record<string, unknown> = {}): StoredEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline for episode ${episodeNumber}`,
    keyBeats: ["Beat A", "Beat B"],
    ...overrides,
  } as StoredEpisodeBreakdownItem;
}

function shotDraft(shotNumber: number) {
  return {
    shot_number: shotNumber,
    summary: `Shot ${shotNumber} summary`,
    characters: [{ name: "Aria", emotion: "calm" }],
    location_key: "loc-default",
    dialogue_lines: [{ speaker: "Aria", line: `บทพูดช็อต ${shotNumber} ที่ยาวพอสมควรสำหรับการทดสอบ` }],
  };
}

function nineShotDrafts(): VdDeepDraftShotDraft[] {
  return Array.from({ length: VD_DEEP_DRAFT_SHOTS_PER_EPISODE }, (_, i) => shotDraft(i + 1)) as VdDeepDraftShotDraft[];
}

function candidateChunkPayload(tag: string, episodeNumbers: number[]) {
  return {
    episodeBreakdown: episodeNumbers.map((ep) => ({
      episodeNumber: ep,
      workingTitle: `Episode ${ep}`,
      logline: `Logline ${ep}`,
      keyBeats: ["Beat A"],
      shotDrafts: nineShotDrafts(),
      cliffhanger_line: `${tag} cliffhanger for episode ${ep}`,
    })),
    open_threads: [`${tag}-thread`],
  };
}

function scoreFields(overrides: Record<string, number> = {}) {
  const base: Record<string, number> = { overall: 5 };
  for (const dimension of VD_PREMIUM_DRAFT_SCORE_DIMENSIONS) {
    base[dimension] = 5;
  }
  return { ...base, ...overrides };
}

function judgeResponsePayload(
  entries: Array<{ candidateIndex: number; episodeNumber: number; overrides?: Record<string, number> }>,
) {
  return {
    scores: entries.map((e) => ({
      candidateIndex: e.candidateIndex,
      episodeNumber: e.episodeNumber,
      ...scoreFields(e.overrides),
    })),
  };
}

function rejudgeResponsePayload(entries: Array<{ episodeNumber: number; overrides?: Record<string, number> }>) {
  return {
    scores: entries.map((e) => ({ episodeNumber: e.episodeNumber, ...scoreFields(e.overrides) })),
  };
}

function reviseResponsePayload(tag: string, episodeNumbers: number[]) {
  return {
    episodeBreakdown: episodeNumbers.map((ep) => ({
      episodeNumber: ep,
      workingTitle: `Episode ${ep}`,
      logline: `Logline ${ep}`,
      keyBeats: ["Beat A"],
      shotDrafts: nineShotDrafts(),
      cliffhanger_line: `${tag} cliffhanger for episode ${ep}`,
    })),
  };
}

function sweepResponsePayload(issues: Array<{ episodeNumber: number; kind: string; instruction: string }>) {
  return { issues };
}

function mockLlmResponseOnce(payload: unknown, usage = { prompt_tokens: 100, completion_tokens: 200 }) {
  mockExecuteWithFallback.mockResolvedValueOnce({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(payload) } }],
      usage,
    },
  });
}

function baseDeepParams(overrides: Record<string, unknown> = {}) {
  return {
    userId: 1,
    tenantId: "tenant-1",
    seriesId: 10,
    title: "Test Series",
    locale: "th" as const,
    genre: "romance",
    tone: "dramatic",
    episodes: [existingItem(1)],
    mode: "premium" as const,
    ...overrides,
  };
}

function systemPromptOf(callIndex: number): string {
  const args = mockExecuteWithFallback.mock.calls[callIndex][0];
  return args.messages.find((m: { role: string }) => m.role === "system").content;
}

function userPromptOf(callIndex: number): string {
  const args = mockExecuteWithFallback.mock.calls[callIndex][0];
  return args.messages.find((m: { role: string }) => m.role === "user").content;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadEnabledLlmModelRows.mockResolvedValue([]);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
});

describe("premium judge — loads the vertical-drama-season-dramaturgy-critic skill (Mode 2)", () => {
  it("uses the loaded skill's body verbatim as the judge system prompt, plus structured facts (not inline-authored rubric prose) in the user prompt", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1 },
        { candidateIndex: 1, episodeNumber: 1 },
        { candidateIndex: 2, episodeNumber: 1 },
      ]),
    );
    mockLlmResponseOnce(sweepResponsePayload([]));

    await generateStoryBibleDeep(baseDeepParams());

    const judgeSystemPrompt = systemPromptOf(3);
    expect(judgeSystemPrompt).toBe(FAKE_DRAMATURGY_CRITIC_SKILL_BODY);

    const judgeUserPrompt = userPromptOf(3);
    expect(judgeUserPrompt).toContain('Action: "draft_quality_score"');
    expect(judgeUserPrompt).toContain("Locale: th");
    expect(judgeUserPrompt).toContain("Number of candidate drafts given below: 3");
  });

  it("appends the tie_in_naturalness addendum AFTER the skill body only when an episode is marked hasPlannedTieIn", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1, overrides: { tie_in_naturalness: 5 } },
        { candidateIndex: 1, episodeNumber: 1, overrides: { tie_in_naturalness: 5 } },
        { candidateIndex: 2, episodeNumber: 1, overrides: { tie_in_naturalness: 5 } },
      ]),
    );
    mockLlmResponseOnce(sweepResponsePayload([]));

    await generateStoryBibleDeep(
      baseDeepParams({
        tieInDraftContext: {
          productName: "Glow Serum",
          productCategory: "cosmetics",
          forbiddenClaims: ["รักษาสิว"],
          placements: [
            {
              episodeNumber: 1,
              placement: { planned: true, source: "planned", benefitFocus: "ผิวกระจ่างใส", intensity: "featured" },
            },
          ],
        },
      }),
    );

    const judgeSystemPrompt = systemPromptOf(3);
    expect(judgeSystemPrompt.startsWith(FAKE_DRAMATURGY_CRITIC_SKILL_BODY)).toBe(true);
    expect(judgeSystemPrompt).toContain("tie_in_naturalness");
  });
});

describe("premium re-judge — loads the same skill (Mode 2) for the targeted-revise loop", () => {
  it("uses the loaded skill's body verbatim as the re-judge system prompt and frames the input as a single ungrouped candidate", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    // candidate 0 wins (mean overall 3), below floor.
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1, overrides: { overall: 3 } },
        { candidateIndex: 1, episodeNumber: 1, overrides: { overall: 1 } },
        { candidateIndex: 2, episodeNumber: 1, overrides: { overall: 1 } },
      ]),
    );
    mockLlmResponseOnce(reviseResponsePayload("revised", [1]));
    mockLlmResponseOnce(rejudgeResponsePayload([{ episodeNumber: 1, overrides: { overall: 5 } }]));
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(7); // 3 fanout + 1 judge + 1 revise + 1 rejudge + 1 sweep
    expect(result.premiumMetrics).toMatchObject({ roundsUsedPerChunk: [1] });
    expect(result.premiumMetrics.roundsUsedPerChunk[0]).toBeLessThanOrEqual(VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS);

    const rejudgeSystemPrompt = systemPromptOf(5);
    expect(rejudgeSystemPrompt).toBe(FAKE_DRAMATURGY_CRITIC_SKILL_BODY);

    const rejudgeUserPrompt = userPromptOf(5);
    expect(rejudgeUserPrompt).toContain('Action: "draft_quality_score"');
    expect(rejudgeUserPrompt).toContain("no candidate grouping");
  });
});
