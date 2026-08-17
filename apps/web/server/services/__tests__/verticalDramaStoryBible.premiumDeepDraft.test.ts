/**
 * Premium multi-round drafts (W11-A, added 2026-07-08) — coverage for
 * `verticalDramaStoryBible.ts`'s `generateStoryBibleDeep({..., mode:
 * "premium"})` pipeline: per-chunk 3-way fan-out, deterministic gates, the
 * inline LLM judge, the targeted-revise loop with its regression guard, the
 * one-time season continuity sweep, the credit estimator, and per-call
 * credit deduction (including partial-run failure).
 *
 * Mirrors `verticalDramaStoryBible.deepStoryDrafts.test.ts`'s mocking
 * convention exactly (mock `enabledLlmModels`/`intelligentModelSelector`/
 * `creditService`/`llmRouter`/`_core/logger`, import the real service).
 *
 * Call-order determinism note: `Promise.allSettled([...])` evaluates its
 * array argument SYNCHRONOUSLY (each async candidate function runs up to its
 * own first `await`, which is the mocked `executeWithFallback` call), so the
 * 3 fan-out candidates always call `executeWithFallback` in lens order
 * (0, 1, 2) BEFORE any of them resolve — `mockResolvedValueOnce`/
 * `mockRejectedValueOnce` queued in that same order deterministically maps
 * one-to-one onto (candidate 0, candidate 1, candidate 2).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadEnabledLlmModelRows } = vi.hoisted(() => ({
  mockLoadEnabledLlmModelRows: vi.fn(async () => [] as unknown[]),
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: mockLoadEnabledLlmModelRows,
}));

const { mockResolveVerticalDramaSeriesModel } = vi.hoisted(() => ({
  mockResolveVerticalDramaSeriesModel: vi.fn(
    async (_seriesId: number, autoFallback: () => Promise<string>) => autoFallback(),
  ),
}));
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: mockResolveVerticalDramaSeriesModel,
}));

vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => null),
}));
import { selectBestLlmModel } from "../intelligentModelSelector";

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
  resolveDeepStoryDraftModel,
  estimatePremiumDeepDraftCalls,
  computePremiumDeepDraftChunkSizes,
  meetsPremiumDraftFloor,
  computePremiumGateViolationCount,
  selectPremiumDraftWinnerIndex,
  VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE,
  VD_PREMIUM_DEEP_DRAFT_EPISODES_PER_CALL,
  VD_DEEP_DRAFT_SHOTS_PER_EPISODE,
  VD_PREMIUM_DRAFT_CANDIDATE_COUNT,
  VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS,
  VD_PREMIUM_DRAFT_MIN_OVERALL,
  VD_PREMIUM_DRAFT_MIN_DIMENSION,
  VD_PREMIUM_DRAFT_LENS_EMOTION_FIRST,
  VD_PREMIUM_DRAFT_LENS_CONFLICT_FIRST,
  VD_PREMIUM_DRAFT_LENS_DIALOGUE_NATURALNESS_FIRST,
  VD_PREMIUM_DRAFT_SCORE_DIMENSIONS,
  type VdDeepDraftShotDraft,
  type StoredEpisodeBreakdownItem,
} from "../verticalDramaStoryBible";

const mockSelectBestLlmModel = vi.mocked(selectBestLlmModel);

/* -------------------------------------------------------------------------- */
/* Fixtures — mirrors verticalDramaStoryBible.deepStoryDrafts.test.ts's own   */
/* -------------------------------------------------------------------------- */

function existingItem(
  episodeNumber: number,
  overrides: Record<string, unknown> = {},
): StoredEpisodeBreakdownItem {
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline for episode ${episodeNumber}`,
    keyBeats: ["Beat A", "Beat B"],
    ...overrides,
  } as StoredEpisodeBreakdownItem;
}

function shotDraft(shotNumber: number, overrides: Record<string, unknown> = {}) {
  return {
    shot_number: shotNumber,
    summary: `Shot ${shotNumber} summary`,
    characters: [{ name: "Aria", emotion: "calm" }],
    location_key: "loc-default",
    dialogue_lines: [{ speaker: "Aria", line: `บทพูดช็อต ${shotNumber} ที่ยาวพอสมควรสำหรับการทดสอบ` }],
    ...overrides,
  };
}

function nineShotDrafts(): VdDeepDraftShotDraft[] {
  return Array.from({ length: VD_DEEP_DRAFT_SHOTS_PER_EPISODE }, (_, i) => shotDraft(i + 1)) as VdDeepDraftShotDraft[];
}

/** A fan-out candidate's raw chunk response — tags `cliffhanger_line`/`open_threads` with `tag` so tests can identify which candidate's content "won". */
function candidateChunkPayload(
  tag: string,
  episodeNumbers: number[],
  opts: { shotDraftsFor?: (ep: number) => unknown[] } = {},
) {
  return {
    episodeBreakdown: episodeNumbers.map((ep) => ({
      episodeNumber: ep,
      workingTitle: `Episode ${ep}`,
      logline: `Logline ${ep}`,
      keyBeats: ["Beat A"],
      shotDrafts: opts.shotDraftsFor ? opts.shotDraftsFor(ep) : nineShotDrafts(),
      cliffhanger_line: `${tag} cliffhanger for episode ${ep}`,
    })),
    open_threads: [`${tag}-thread`],
  };
}

/** Full-marks (5/5) score fields for every dimension + overall — override individual keys to create below-floor fixtures. */
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
  mockLoadEnabledLlmModelRows.mockResolvedValue([
    { modelId: "active-llm-model", providerId: 1, priority: 1 } as any,
  ]);
  mockResolveVerticalDramaSeriesModel.mockImplementation(
    async (_seriesId: number, autoFallback: () => Promise<string>) => autoFallback(),
  );
  mockSelectBestLlmModel.mockReturnValue(null);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
});

/* -------------------------------------------------------------------------- */
/* Pure helpers — no LLM mocking needed                                       */
/* -------------------------------------------------------------------------- */

describe("estimatePremiumDeepDraftCalls", () => {
  it("computes chunkCount * 10 + 2", () => {
    expect(estimatePremiumDeepDraftCalls(1)).toBe(12);
    expect(estimatePremiumDeepDraftCalls(3)).toBe(32);
    expect(estimatePremiumDeepDraftCalls(0)).toBe(2);
  });

  it("never goes negative for a negative chunk count", () => {
    expect(estimatePremiumDeepDraftCalls(-5)).toBe(2);
  });
});

describe("computePremiumDeepDraftChunkSizes", () => {
  it(`splits premium chunks at ${VD_PREMIUM_DEEP_DRAFT_EPISODES_PER_CALL} episode(s) per call`, () => {
    expect(computePremiumDeepDraftChunkSizes(0)).toEqual([]);
    expect(computePremiumDeepDraftChunkSizes(1)).toEqual([1]);
    expect(computePremiumDeepDraftChunkSizes(5)).toEqual([2, 2, 1]);
    expect(computePremiumDeepDraftChunkSizes(10)).toEqual([2, 2, 2, 2, 2]);
  });
});

describe("resolveDeepStoryDraftModel", () => {
  it("selects by capability policy instead of a hardcoded model id", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([
      { modelId: "small-fast-model", priority: 0 } as any,
      { modelId: "large-structured-model", priority: 10 } as any,
    ]);
    mockSelectBestLlmModel.mockReturnValue("large-structured-model");

    await expect(resolveDeepStoryDraftModel()).resolves.toBe("large-structured-model");

    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
      {
        supportsThinking: true,
        supportsStructuredOutputs: true,
        supportsResponses: true,
        contextLength: 1_000_000,
      },
      expect.any(Array),
    );
  });
});

describe("meetsPremiumDraftFloor", () => {
  it(`passes when overall >= ${VD_PREMIUM_DRAFT_MIN_OVERALL} and every dimension >= ${VD_PREMIUM_DRAFT_MIN_DIMENSION}`, () => {
    expect(meetsPremiumDraftFloor(scoreFields())).toBe(true);
    expect(meetsPremiumDraftFloor(scoreFields({ overall: VD_PREMIUM_DRAFT_MIN_OVERALL }))).toBe(true);
  });

  it("fails when overall is below the floor", () => {
    expect(meetsPremiumDraftFloor(scoreFields({ overall: VD_PREMIUM_DRAFT_MIN_OVERALL - 1 }))).toBe(false);
  });

  it("fails when ANY single dimension is below the floor, even with a high overall", () => {
    expect(meetsPremiumDraftFloor(scoreFields({ dialogue_naturalness: VD_PREMIUM_DRAFT_MIN_DIMENSION - 1 }))).toBe(
      false,
    );
  });
});

describe("computePremiumGateViolationCount", () => {
  const clean = { dialogueEveryShot: true, allSpeakable: true, estimatedSpeechSeconds: 10, coverageStatus: "ok" as const };

  it("is 0 for a fully clean episode", () => {
    expect(computePremiumGateViolationCount([{ draftCompleteness: clean }])).toBe(0);
  });

  it("adds 1 for !dialogueEveryShot and 1 for !allSpeakable", () => {
    expect(
      computePremiumGateViolationCount([
        { draftCompleteness: { ...clean, dialogueEveryShot: false } },
      ]),
    ).toBe(1);
    expect(
      computePremiumGateViolationCount([
        { draftCompleteness: { ...clean, dialogueEveryShot: false, allSpeakable: false } },
      ]),
    ).toBe(2);
  });

  it("adds 1 for coverageStatus warning and 2 for error", () => {
    expect(computePremiumGateViolationCount([{ draftCompleteness: { ...clean, coverageStatus: "warning" } }])).toBe(1);
    expect(computePremiumGateViolationCount([{ draftCompleteness: { ...clean, coverageStatus: "error" } }])).toBe(2);
  });

  it("sums violations across multiple items", () => {
    expect(
      computePremiumGateViolationCount([
        { draftCompleteness: { ...clean, coverageStatus: "error" } },
        { draftCompleteness: { ...clean, dialogueEveryShot: false } },
      ]),
    ).toBe(3);
  });
});

describe("selectPremiumDraftWinnerIndex", () => {
  it("picks the candidate with the highest mean overall", () => {
    expect(
      selectPremiumDraftWinnerIndex([
        { index: 0, meanOverall: 3, gateViolationCount: 0 },
        { index: 1, meanOverall: 4.5, gateViolationCount: 0 },
        { index: 2, meanOverall: 4, gateViolationCount: 0 },
      ]),
    ).toBe(1);
  });

  it("tie-breaks on fewer gate violations when mean overall ties", () => {
    expect(
      selectPremiumDraftWinnerIndex([
        { index: 0, meanOverall: 4, gateViolationCount: 2 },
        { index: 1, meanOverall: 4, gateViolationCount: 0 },
        { index: 2, meanOverall: 4, gateViolationCount: 1 },
      ]),
    ).toBe(1);
  });

  it("tie-breaks on lens/candidate order (earliest index) when overall AND violations both tie", () => {
    expect(
      selectPremiumDraftWinnerIndex([
        { index: 0, meanOverall: 4, gateViolationCount: 0 },
        { index: 1, meanOverall: 4, gateViolationCount: 0 },
        { index: 2, meanOverall: 4, gateViolationCount: 0 },
      ]),
    ).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Fan-out                                                                    */
/* -------------------------------------------------------------------------- */

describe("premium — fan-out", () => {
  it(`issues exactly ${VD_PREMIUM_DRAFT_CANDIDATE_COUNT} calls with 3 distinct lens strings, then 1 judge call, then 1 sweep call`, async () => {
    mockResolveVerticalDramaSeriesModel.mockResolvedValueOnce("google/gemini-3.5-flash");
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

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(mockResolveVerticalDramaSeriesModel).toHaveBeenCalledWith(
      10,
      resolveDeepStoryDraftModel,
    );
    expect(mockExecuteWithFallback.mock.calls.every(([request]) =>
      request.model === "google/gemini-3.5-flash"
    )).toBe(true);
    expect(result.model).toBe("google/gemini-3.5-flash");
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(5);

    const lensTexts = [systemPromptOf(0), systemPromptOf(1), systemPromptOf(2)];
    expect(lensTexts[0]).toContain(VD_PREMIUM_DRAFT_LENS_EMOTION_FIRST);
    expect(lensTexts[1]).toContain(VD_PREMIUM_DRAFT_LENS_CONFLICT_FIRST);
    expect(lensTexts[2]).toContain(VD_PREMIUM_DRAFT_LENS_DIALOGUE_NATURALNESS_FIRST);
    expect(new Set(lensTexts).size).toBe(3); // pairwise distinct

    // The base (pre-lens) prompt is shared — every candidate still gets the chunk's episode data
    // (from the STORED planned item via `buildDeepDraftPrompts`, not the mocked response payload).
    expect(userPromptOf(0)).toContain("Logline for episode 1");
    expect(userPromptOf(1)).toContain("Logline for episode 1");
    expect(userPromptOf(2)).toContain("Logline for episode 1");

    expect(result.premiumMetrics).toMatchObject({
      mode: "premium",
      candidateCount: 3,
      roundsUsedPerChunk: [0],
      episodesBelowFloorAfter: 0,
      sweepIssuesFound: 0,
      callsMade: 5,
    });
  });

  it("fails the whole chunk (throws, since it's the first chunk) when ANY of the 3 fan-out candidates fails without deducting the unusable fan-out set", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockExecuteWithFallback.mockResolvedValueOnce({ type: "error", error: "provider exploded" });
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));

    await expect(generateStoryBibleDeep(baseDeepParams())).rejects.toThrow();

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(3); // no judge/sweep call — chunk failed before that
    expect(mockDeductCredits).not.toHaveBeenCalled(); // no persisted/usable chunk, so no partial fan-out charge
  });
});

/* -------------------------------------------------------------------------- */
/* Winner selection (end-to-end wiring)                                       */
/* -------------------------------------------------------------------------- */

describe("premium — winner selection (end-to-end)", () => {
  it("persists the judge's highest-mean-overall candidate's content, not the other two", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1, overrides: { overall: 4 } },
        { candidateIndex: 1, episodeNumber: 1, overrides: { overall: 5 } }, // highest — should win
        { candidateIndex: 2, episodeNumber: 1, overrides: { overall: 4 } },
      ]),
    );
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(result.draftedItems).toHaveLength(1);
    expect(result.draftedItems[0].cliffhanger_line).toBe("c1 cliffhanger for episode 1");
    expect(result.finalOpenThreads).toEqual(["c1-thread"]);
    expect(result.draftedItems[0].draftScorecard).toMatchObject({ overall: 5, judgedAtRound: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/* Targeted revise + regression guard                                        */
/* -------------------------------------------------------------------------- */

describe("premium — targeted revise + regression guard", () => {
  it("revise targets ONLY the below-floor episode(s), and the regression guard keeps the PRIOR version when the revision scores lower — retrying up to the round cap", async () => {
    const episodes = [existingItem(1), existingItem(2)];

    // Fan-out: all 3 candidates return the same 2-episode content.
    mockLlmResponseOnce(candidateChunkPayload("c0", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1, 2]));
    // Judge: candidate 0 wins on mean overall (ep1=5, ep2=3 -> mean 4); ep2 is below floor (overall 3 < 4).
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1, overrides: { overall: 5 } },
        { candidateIndex: 0, episodeNumber: 2, overrides: { overall: 3 } },
        { candidateIndex: 1, episodeNumber: 1, overrides: { overall: 2 } },
        { candidateIndex: 1, episodeNumber: 2, overrides: { overall: 2 } },
        { candidateIndex: 2, episodeNumber: 1, overrides: { overall: 3 } },
        { candidateIndex: 2, episodeNumber: 2, overrides: { overall: 3 } },
      ]),
    );
    // Round 1: revise + re-judge episode 2 only, scored LOWER than the prior (3) -> regression guard rejects it.
    mockLlmResponseOnce(reviseResponsePayload("revised-r1", [2]));
    mockLlmResponseOnce(rejudgeResponsePayload([{ episodeNumber: 2, overrides: { overall: 2 } }]));
    // Round 2 (still below floor): same outcome — rejected again.
    mockLlmResponseOnce(reviseResponsePayload("revised-r2", [2]));
    mockLlmResponseOnce(rejudgeResponsePayload([{ episodeNumber: 2, overrides: { overall: 2 } }]));
    // Round 3 (still below floor): same outcome — rejected again.
    mockLlmResponseOnce(reviseResponsePayload("revised-r3", [2]));
    mockLlmResponseOnce(rejudgeResponsePayload([{ episodeNumber: 2, overrides: { overall: 2 } }]));
    // Round 4 (still below floor, the round cap): same outcome — rejected again.
    mockLlmResponseOnce(reviseResponsePayload("revised-r4", [2]));
    mockLlmResponseOnce(rejudgeResponsePayload([{ episodeNumber: 2, overrides: { overall: 2 } }]));
    // Season sweep — no issues, to keep this test focused on the revise loop.
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(13); // 3 fanout + 1 judge + 4*(revise+rejudge) + 1 sweep

    // The revise call (5th call, index 4) must target ONLY episode 2.
    const reviseUserPrompt = userPromptOf(4);
    expect(reviseUserPrompt).toContain("Logline for episode 2");
    expect(reviseUserPrompt).not.toContain("Logline for episode 1");

    const episode2 = result.draftedItems.find((i) => i.episodeNumber === 2)!;
    expect(episode2.cliffhanger_line).toBe("c0 cliffhanger for episode 2"); // prior (winner) version kept, NOT "revised-r1"/"revised-r2"
    expect(episode2.draftScorecard).toMatchObject({ overall: 3, judgedAtRound: 0 });

    const episode1 = result.draftedItems.find((i) => i.episodeNumber === 1)!;
    expect(episode1.cliffhanger_line).toBe("c0 cliffhanger for episode 1"); // untouched — was never below floor

    expect(result.premiumMetrics).toMatchObject({
      roundsUsedPerChunk: [VD_PREMIUM_DRAFT_MAX_REVISE_ROUNDS],
      episodesBelowFloorAfter: 1,
    });
  });

  it("stops early (does not attempt a 2nd round) once a round's ADOPTED revision brings every episode to floor", async () => {
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
    // Round 1: revise + re-judge — new score (5) is HIGHER than prior (3) -> adopted, now at floor.
    mockLlmResponseOnce(reviseResponsePayload("revised", [1]));
    mockLlmResponseOnce(rejudgeResponsePayload([{ episodeNumber: 1, overrides: { overall: 5 } }]));
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    // 3 fanout + 1 judge + ONE revise/rejudge pair + 1 sweep = 7 (NOT 9 — round 2 never attempted).
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(7);

    const episode1 = result.draftedItems[0];
    expect(episode1.cliffhanger_line).toBe("revised cliffhanger for episode 1");
    expect(episode1.draftScorecard).toMatchObject({ overall: 5, judgedAtRound: 1 });
    expect(result.premiumMetrics).toMatchObject({ roundsUsedPerChunk: [1], episodesBelowFloorAfter: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/* Season continuity sweep                                                    */
/* -------------------------------------------------------------------------- */

describe("premium — season continuity sweep", () => {
  it("applies a spot-revise ONLY to the episode named in a sweep issue, leaving other episodes untouched", async () => {
    const episodes = [existingItem(1), existingItem(2)];
    mockLlmResponseOnce(candidateChunkPayload("c0", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1, 2]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1 },
        { candidateIndex: 0, episodeNumber: 2 },
        { candidateIndex: 1, episodeNumber: 1, overrides: { overall: 1 } },
        { candidateIndex: 1, episodeNumber: 2, overrides: { overall: 1 } },
        { candidateIndex: 2, episodeNumber: 1, overrides: { overall: 1 } },
        { candidateIndex: 2, episodeNumber: 2, overrides: { overall: 1 } },
      ]),
    );
    // Both episodes already at floor (5/5) -> no revise-loop calls.
    mockLlmResponseOnce(
      sweepResponsePayload([{ episodeNumber: 1, kind: "contradiction", instruction: "fix the contradiction" }]),
    );
    mockLlmResponseOnce(reviseResponsePayload("spot-revised", [1]));
    mockLlmResponseOnce(rejudgeResponsePayload([{ episodeNumber: 1, overrides: { overall: 5 } }]));

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(7); // 3 fanout + 1 judge + 1 sweep + 1 spot-revise + 1 spot-rejudge

    const spotReviseUserPrompt = userPromptOf(5);
    expect(spotReviseUserPrompt).toContain("Logline for episode 1");
    expect(spotReviseUserPrompt).not.toContain("Logline for episode 2");

    const episode1 = result.draftedItems.find((i) => i.episodeNumber === 1)!;
    expect(episode1.cliffhanger_line).toBe("spot-revised cliffhanger for episode 1");
    expect(episode1.draftScorecard?.judgedAtRound).toBe(3); // VD_PREMIUM_DRAFT_SWEEP_ROUND

    const episode2 = result.draftedItems.find((i) => i.episodeNumber === 2)!;
    expect(episode2.cliffhanger_line).toBe("c0 cliffhanger for episode 2"); // untouched by the sweep
    expect(episode2.draftScorecard?.judgedAtRound).toBe(0);

    expect(result.premiumMetrics).toMatchObject({ sweepIssuesFound: 1 });
  });

  it("never runs more than once even when it finds issues (no re-sweep after the spot-revise)", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    mockLlmResponseOnce(judgeResponsePayload([{ candidateIndex: 0, episodeNumber: 1 }]));
    mockLlmResponseOnce(sweepResponsePayload([{ episodeNumber: 1, kind: "repeat", instruction: "vary the line" }]));
    mockLlmResponseOnce(reviseResponsePayload("spot-revised", [1]));
    mockLlmResponseOnce(rejudgeResponsePayload([{ episodeNumber: 1, overrides: { overall: 5 } }]));

    await generateStoryBibleDeep(baseDeepParams());

    // Exactly ONE sweep-detect call total (call index 4) — never a second one.
    const sweepCalls = mockExecuteWithFallback.mock.calls.filter((_, idx) =>
      systemPromptOf(idx).includes("season continuity checker"),
    );
    expect(sweepCalls).toHaveLength(1);
  });

  it("leaves every episode unchanged and reports sweepIssuesFound: 0 when the sweep finds nothing", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    mockLlmResponseOnce(judgeResponsePayload([{ candidateIndex: 0, episodeNumber: 1 }]));
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(5); // no spot-revise/re-judge pair
    expect(result.premiumMetrics).toMatchObject({ sweepIssuesFound: 0 });
  });
});

/* -------------------------------------------------------------------------- */
/* Credits — estimator wiring, per-call deduction, partial failure            */
/* -------------------------------------------------------------------------- */

describe("premium — credits", () => {
  it("pre-checks total credits as estimatePremiumDeepDraftCalls(chunkCount) * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE BEFORE the first call", async () => {
    const episodes = Array.from({ length: 3 }, (_, i) => existingItem(i + 1)); // -> premium chunks [2, 1]
    mockLlmResponseOnce(candidateChunkPayload("c0", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1, 2]));
    mockLlmResponseOnce(
      judgeResponsePayload(
        [1, 2].flatMap((ep) => [
          { candidateIndex: 0, episodeNumber: ep },
          { candidateIndex: 1, episodeNumber: ep },
          { candidateIndex: 2, episodeNumber: ep },
        ]),
      ),
    );
    mockLlmResponseOnce(candidateChunkPayload("c0b", [3]));
    mockLlmResponseOnce(candidateChunkPayload("c1b", [3]));
    mockLlmResponseOnce(candidateChunkPayload("c2b", [3]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 3 },
        { candidateIndex: 1, episodeNumber: 3 },
        { candidateIndex: 2, episodeNumber: 3 },
      ]),
    );
    mockLlmResponseOnce(sweepResponsePayload([]));

    await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockHasEnoughCredits).toHaveBeenCalledTimes(1);
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(1, estimatePremiumDeepDraftCalls(2) * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE);
  });

  it("throws InsufficientCreditsError using the PREMIUM estimate and calls no LLM when the pre-check fails", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateStoryBibleDeep(baseDeepParams())).rejects.toThrow("Insufficient credits");
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(1, estimatePremiumDeepDraftCalls(1) * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("deducts credits per ACTUAL successful call, and on a partial failure still counts only the calls that really succeeded", async () => {
    const episodes = Array.from({ length: 3 }, (_, i) => existingItem(i + 1)); // -> premium chunks [2, 1]

    // Chunk 1 (episodes 1-2): fan-out + judge, everyone already at floor -> 4 calls, no revise.
    mockLlmResponseOnce(candidateChunkPayload("c0", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1, 2]));
    mockLlmResponseOnce(
      judgeResponsePayload(
        [1, 2].flatMap((ep) => [
          { candidateIndex: 0, episodeNumber: ep },
          { candidateIndex: 1, episodeNumber: ep },
          { candidateIndex: 2, episodeNumber: ep },
        ]),
      ),
    );
    // Chunk 2 (episode 3): candidate 0 succeeds, candidate 1 FAILS, candidate 2 succeeds -> chunk fails.
    mockLlmResponseOnce(candidateChunkPayload("c0b", [3]));
    mockExecuteWithFallback.mockResolvedValueOnce({ type: "error", error: "provider exploded" });
    mockLlmResponseOnce(candidateChunkPayload("c2b", [3]));

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(result.partial).toBe(true);
    expect(result.chunkSizes).toEqual([2]);
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1, 2]);
    expect(result.error).toBeTruthy();

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(7); // 4 (chunk1) + 3 attempted (chunk2)
    expect(mockDeductCredits).toHaveBeenCalledTimes(4); // chunk2 produced no usable persisted result, so no partial fan-out charge
    expect(result.premiumMetrics?.callsMade).toBe(4);
    expect(result.premiumMetrics?.sweepIssuesFound).toBe(0); // sweep never runs on a partial result
  });
});

/* -------------------------------------------------------------------------- */
/* Scorecard shape persisted per episode                                      */
/* -------------------------------------------------------------------------- */

describe("premium — scorecard shape", () => {
  it("attaches a full 8-dimension + overall + judgedAtRound scorecard to every drafted episode", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    mockLlmResponseOnce(judgeResponsePayload([{ candidateIndex: 0, episodeNumber: 1 }]));
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    const scorecard = result.draftedItems[0].draftScorecard!;
    for (const dimension of VD_PREMIUM_DRAFT_SCORE_DIMENSIONS) {
      expect(scorecard[dimension]).toBe(5);
    }
    expect(scorecard.overall).toBe(5);
    expect(scorecard.judgedAtRound).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Stage 2.4b (`planning/vd-series-memory-and-lineage/plan.md`) —             */
/* `prior_season_continuity` conditional judge dimension — mirrors the       */
/* `tie_in_naturalness` conditional-dimension coverage in                    */
/* `verticalDramaStoryBible.tieInDraft.test.ts` exactly (byte-identical-when- */
/* absent, present + floor-checked + revise-triggering when given).          */
/* -------------------------------------------------------------------------- */

function seasonLineageFixture(overrides: Record<string, unknown> = {}) {
  return {
    seasonNumber: 2,
    parentTitle: "รักข้ามเวลา",
    priorSeasonSummary: "สรุปภาค 1: พิมพ์ดาวและกวินท์คบกันแบบเปิดเผยแล้ว",
    carriedRelationships: [
      {
        pair: ["aria", "kane"] as [string, string],
        status: "คบกันแบบเปิดเผย",
        disclosure: "public" as const,
        knownBy: [],
        sinceEpisode: 30,
      },
    ],
    carriedThreads: [
      {
        threadId: "house-reno",
        description: "การรีโนเวทบ้านยังไม่เสร็จ",
        threadClass: "domestic" as const,
        openedEpisode: 5,
      },
    ],
    carriedCharacters: [{ characterKey: "aria", name: "Aria" }],
    writtenOutCharacters: [],
    antagonistStrategy: "ตัวร้ายเดิมถูกจับแล้ว ต้องหาปมใหม่",
    characterKnowledge: { aria: ["รู้ว่ากวินท์เป็นน้องชายแท้ๆ"] },
    ...overrides,
  };
}

describe("premium — Stage 2.4b prior_season_continuity (sequel continuity judge dimension)", () => {
  it("byte-identical: no seasonLineage -> scorecard has no prior_season_continuity key, and the judge prompts never mention it/SEASON LINEAGE", async () => {
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    mockLlmResponseOnce(judgeResponsePayload([{ candidateIndex: 0, episodeNumber: 1 }]));
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(result.draftedItems[0].draftScorecard).not.toHaveProperty(
      "prior_season_continuity",
    );
    const judgeSystemPrompt = systemPromptOf(3);
    const judgeUserPrompt = userPromptOf(3);
    // The dramaturgy-critic skill.md's static content documents
    // "prior_season_continuity" unconditionally (Stage 2.4b puts the actual
    // judging CRITERIA in the skill, unlike `tie_in_naturalness`'s
    // code-only rubric) — so the bare dimension NAME is expected to appear
    // in every judge call's systemPrompt, sequel or not. What must stay
    // conditional is the code-appended TRIGGER instruction
    // (`buildPriorSeasonContinuityJudgeInstruction`) that tells the model to
    // actually SCORE it this call — that phrase must be absent here.
    expect(judgeSystemPrompt).not.toContain(
      'a "SEASON LINEAGE" fact block is given in the user message',
    );
    expect(judgeUserPrompt).not.toContain("SEASON LINEAGE");
  });

  it("scores prior_season_continuity when seasonLineage is given, floor-checks it (independent of the 8 core dimensions), and a below-floor score triggers a targeted revise round with the SEASON LINEAGE facts threaded to both the judge and the revise call", async () => {
    const seasonLineage = seasonLineageFixture();
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    // Candidate 0 wins on mean overall (5 > 3) despite every CORE dimension
    // being full marks — it drifted from the prior season, so
    // prior_season_continuity alone must fail the floor.
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1, overrides: { prior_season_continuity: 2 } },
        { candidateIndex: 1, episodeNumber: 1, overrides: { overall: 3 } },
        { candidateIndex: 2, episodeNumber: 1, overrides: { overall: 3 } },
      ]),
    );
    // Round 1: revise + re-judge — the revision restores continuity, scored
    // higher on prior_season_continuity, and is adopted (overall unchanged >= prior).
    mockLlmResponseOnce(reviseResponsePayload("revised", [1]));
    mockLlmResponseOnce(
      rejudgeResponsePayload([
        { episodeNumber: 1, overrides: { prior_season_continuity: 5 } },
      ]),
    );
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(
      baseDeepParams({ seasonLineage }),
    );

    // Calls: 0-2 fan-out, 3 judge, 4 revise, 5 re-judge, 6 sweep.
    const judgeSystemPrompt = systemPromptOf(3);
    const judgeUserPrompt = userPromptOf(3);
    expect(judgeSystemPrompt).toContain("prior_season_continuity");
    expect(judgeUserPrompt).toContain("SEASON LINEAGE");
    expect(judgeUserPrompt).toContain(seasonLineage.parentTitle);

    const reviseUserPrompt = userPromptOf(4);
    expect(reviseUserPrompt).toContain("SEASON LINEAGE");
    expect(reviseUserPrompt).toContain(seasonLineage.parentTitle);

    expect(result.draftedItems[0].draftScorecard).toMatchObject({
      prior_season_continuity: 5,
      judgedAtRound: 1,
    });
    expect(result.premiumMetrics).toMatchObject({ roundsUsedPerChunk: [1] });
  });
});

/* -------------------------------------------------------------------------- */
/* Live-bug fixes — shared enforcement, exercised through the premium entry   */
/* (verifies both fixes are NOT standard-mode-only)                          */
/* -------------------------------------------------------------------------- */

describe("premium — missing-episode corrective retry (shared chunk under-count fix)", () => {
  it("recovers an episode the fan-out winner never drafted via ONE cheap corrective retry, and the run completes non-partial", async () => {
    const episodes = [existingItem(1), existingItem(2)];
    // All 3 fan-out candidates only draft episode 1 — episode 2 never comes back.
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
    // Missing-episode retry (plain, non-fan-out call) recovers episode 2.
    mockLlmResponseOnce(candidateChunkPayload("recovered", [2]));
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(6); // 3 fanout + 1 judge + 1 missing-episode retry + 1 sweep
    const retryUserPrompt = userPromptOf(4);
    expect(retryUserPrompt).toContain("missing required episode(s): 2");

    expect(result.partial).toBe(false);
    expect(result.missingEpisodes).toEqual([]);
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1, 2]);
    const recovered = result.draftedItems.find((i) => i.episodeNumber === 2)!;
    expect(recovered.cliffhanger_line).toBe("recovered cliffhanger for episode 2");
    expect(recovered.draftScorecard).toMatchObject({ overall: 1, judgedAtRound: 0 }); // never went through the judge — worst-case, not fabricated

    expect(mockDeductCredits).toHaveBeenCalledTimes(6);
    expect(result.premiumMetrics?.callsMade).toBe(6);
  });

  it("marks the run partial with missingEpisodes populated when even the corrective retry can't recover the gap", async () => {
    const episodes = [existingItem(1), existingItem(2)];
    mockLlmResponseOnce(candidateChunkPayload("c0", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1]));
    mockLlmResponseOnce(judgeResponsePayload([{ candidateIndex: 0, episodeNumber: 1 }]));
    // Missing-episode retry ALSO only returns episode 1 — episode 2 still missing.
    mockLlmResponseOnce(candidateChunkPayload("retry-still-c0", [1]));

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(result.partial).toBe(true);
    expect(result.missingEpisodes).toEqual([2]);
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1]);
    expect(result.warnings).toContainEqual({ episodeNumber: 2, shotNumber: 0, reason: "episode_missing_after_retry" });
    // Sweep never runs on a partial result (same rule as any other chunk failure).
    expect(result.premiumMetrics?.sweepIssuesFound).toBe(0);
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(5); // 3 fanout + 1 judge + 1 missing-episode retry, no sweep
    expect(mockDeductCredits).toHaveBeenCalledTimes(5);
  });
});

describe("premium — silence_intent/dialogue contradiction (shared enforcement fix)", () => {
  it("strips silence_intent and records a warning for a fan-out candidate's shot that has both, same as standard mode", async () => {
    const contradictingShotDraftsFor = (_ep: number) =>
      nineShotDrafts().map((shot, idx) =>
        idx === 0
          ? {
              ...shot,
              silence_intent: "establishing",
              dialogue_lines: [{ speaker: "Aria", line: "ปล่อยฉันออกไปที" }],
            }
          : shot,
      );

    mockLlmResponseOnce(candidateChunkPayload("c0", [1], { shotDraftsFor: contradictingShotDraftsFor }));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1], { shotDraftsFor: contradictingShotDraftsFor }));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1], { shotDraftsFor: contradictingShotDraftsFor }));
    mockLlmResponseOnce(judgeResponsePayload([{ candidateIndex: 0, episodeNumber: 1 }]));
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(5); // no missing-episode retry needed here

    const winningShot = result.draftedItems[0].shotDrafts.find((s) => s.shot_number === 1)!;
    expect(winningShot.silence_intent).toBeUndefined();
    expect(winningShot.dialogue_lines).toEqual([{ speaker: "Aria", line: "ปล่อยฉันออกไปที" }]);
    expect(result.warnings).toContainEqual({ episodeNumber: 1, shotNumber: 1, reason: "silence_intent_conflict" });
  });
});

/* -------------------------------------------------------------------------- */
/* Resilient resume (added 2026-07-14,                                       */
/* `planning/vertical-drama-deep-story-resilient-resume/plan.md`) — premium- */
/* mode analogue of `verticalDramaStoryBible.deepStoryDrafts.test.ts`'s own  */
/* "generateStoryBibleDeep — resilient resume" describe block.               */
/* -------------------------------------------------------------------------- */

describe("premium — resilient resume", () => {
  function resumedItem(episodeNumber: number) {
    return {
      episodeNumber,
      shotDrafts: nineShotDrafts(),
      cliffhanger_line: `Resumed cliffhanger ${episodeNumber}`,
      draftCompleteness: { allSpeakable: true, dialogueEveryShot: true, estimatedSpeechSeconds: 50 },
    };
  }

  it("skips episodes in alreadyDraftedEpisodeNumbers entirely: no fan-out/judge call, no credits deducted for them — only the remaining episodes' chunk runs, and the result is the full (resumed + new) union", async () => {
    const episodes = [existingItem(1), existingItem(2), existingItem(3), existingItem(4)];
    const resumedItems = [resumedItem(1), resumedItem(2)];

    // Only ONE chunk (episodes 3-4) should ever run — episodes 1-2 are
    // already drafted, so `computePremiumDeepDraftChunkSizes` only ever sees
    // the remaining 2 episodes -> chunkSizes [2], not [2, 2].
    mockLlmResponseOnce(candidateChunkPayload("c0", [3, 4]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [3, 4]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [3, 4]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 3 },
        { candidateIndex: 0, episodeNumber: 4 },
        { candidateIndex: 1, episodeNumber: 3 },
        { candidateIndex: 1, episodeNumber: 4 },
        { candidateIndex: 2, episodeNumber: 3 },
        { candidateIndex: 2, episodeNumber: 4 },
      ]),
    );
    mockLlmResponseOnce(sweepResponsePayload([]));

    const result = await generateStoryBibleDeep(
      baseDeepParams({
        episodes,
        resumeDraftedItems: resumedItems,
        alreadyDraftedEpisodeNumbers: [1, 2],
      }),
    );

    // 3 fan-out + 1 judge + 1 sweep = 5 calls for ONE chunk — a fresh
    // (non-resumed) 4-episode run would need 2 chunks (9 calls: 4+4+1).
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(5);
    expect(userPromptOf(0)).toContain("Logline for episode 3");
    expect(userPromptOf(0)).toContain("Logline for episode 4");
    expect(userPromptOf(0)).not.toContain("Logline for episode 1");
    expect(userPromptOf(0)).not.toContain("Logline for episode 2");

    // Credit pre-check only covers the 1 remaining chunk (estimatePremiumDeepDraftCalls(1) = 12),
    // not the 2 chunks a fresh 4-episode run would normally need (estimatePremiumDeepDraftCalls(2) = 22).
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(1, estimatePremiumDeepDraftCalls(1) * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE);

    // Full union returned: 2 resumed + 2 newly drafted = 4, ascending order preserved.
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1, 2, 3, 4]);
    expect(result.draftedItems.find((i) => i.episodeNumber === 1)?.cliffhanger_line).toBe("Resumed cliffhanger 1");
    expect(result.draftedItems.find((i) => i.episodeNumber === 2)?.cliffhanger_line).toBe("Resumed cliffhanger 2");
    expect(result.draftedItems.find((i) => i.episodeNumber === 3)?.cliffhanger_line).toBe("c0 cliffhanger for episode 3");
    expect(result.draftedItems.find((i) => i.episodeNumber === 4)?.cliffhanger_line).toBe("c0 cliffhanger for episode 4");
    expect(result.partial).toBe(false);
    expect(result.chunkSizes).toEqual([2]);
  });

  it("returns the full resumed set with zero LLM calls/credits and a valid empty premiumMetrics when EVERY requested episode is already drafted (full resume)", async () => {
    const episodes = [existingItem(1), existingItem(2)];
    const resumedItems = [resumedItem(1), resumedItem(2)];

    const result = await generateStoryBibleDeep(
      baseDeepParams({
        episodes,
        resumeDraftedItems: resumedItems,
        alreadyDraftedEpisodeNumbers: [1, 2],
      }),
    );

    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(result.draftedItems).toHaveLength(2);
    expect(result.creditsUsed).toBe(0);
    expect(result.partial).toBe(false);
    expect(result.chunkSizes).toEqual([]);
    expect(result.premiumMetrics).toEqual({
      mode: "premium",
      candidateCount: VD_PREMIUM_DRAFT_CANDIDATE_COUNT,
      roundsUsedPerChunk: [],
      firstPassGatePassRate: 0,
      episodesBelowFloorAfter: 0,
      sweepIssuesFound: 0,
      callsMade: 0,
    });
  });

  it("fires onChunkComplete once per chunk with ONLY that chunk's freshly-drafted items (never the resumed ones)", async () => {
    const episodes = [existingItem(1), existingItem(2), existingItem(3), existingItem(4)];

    // Chunk 1: episodes 1-2.
    mockLlmResponseOnce(candidateChunkPayload("c0", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [1, 2]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [1, 2]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1 },
        { candidateIndex: 0, episodeNumber: 2 },
        { candidateIndex: 1, episodeNumber: 1 },
        { candidateIndex: 1, episodeNumber: 2 },
        { candidateIndex: 2, episodeNumber: 1 },
        { candidateIndex: 2, episodeNumber: 2 },
      ]),
    );
    // Chunk 2: episodes 3-4.
    mockLlmResponseOnce(candidateChunkPayload("c0", [3, 4]));
    mockLlmResponseOnce(candidateChunkPayload("c1", [3, 4]));
    mockLlmResponseOnce(candidateChunkPayload("c2", [3, 4]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 3 },
        { candidateIndex: 0, episodeNumber: 4 },
        { candidateIndex: 1, episodeNumber: 3 },
        { candidateIndex: 1, episodeNumber: 4 },
        { candidateIndex: 2, episodeNumber: 3 },
        { candidateIndex: 2, episodeNumber: 4 },
      ]),
    );
    mockLlmResponseOnce(sweepResponsePayload([]));
    const onChunkComplete = vi.fn();

    await generateStoryBibleDeep(baseDeepParams({ episodes, onChunkComplete }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(9); // 4 + 4 + 1 sweep
    expect(onChunkComplete).toHaveBeenCalledTimes(2);
    expect(onChunkComplete.mock.calls[0][0].map((i: { episodeNumber: number }) => i.episodeNumber)).toEqual([1, 2]);
    expect(onChunkComplete.mock.calls[1][0].map((i: { episodeNumber: number }) => i.episodeNumber)).toEqual([3, 4]);
  });

  it("byte-identical to a fresh (non-resumed) premium run when resumeDraftedItems/alreadyDraftedEpisodeNumbers/onChunkComplete are omitted", async () => {
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

    const result = await generateStoryBibleDeep(baseDeepParams());

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(5);
    expect(mockDeductCredits).toHaveBeenCalledTimes(5); // premium deducts per LLM call (3 fanout + judge + sweep), not per chunk
    expect(result.draftedItems).toHaveLength(1);
    expect(result.partial).toBe(false);
  });
});
