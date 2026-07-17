/**
 * Deep story drafts (W10-A, added 2026-07-08) — coverage for
 * `verticalDramaStoryBible.ts`'s chunked bible-stage shot-drafting
 * additions: chunk math, horizon resolution, cross-chunk continuity recap,
 * post-chunk speakability enforcement, `draftCompleteness`, credit
 * pre-check/deduction, partial-failure persistence, and the new
 * `appendBreakdownVersion`/`get`-summary read helpers' legacy tolerance.
 *
 * Mirrors `verticalDramaStoryBible.speechBudget.test.ts`'s mocking
 * convention exactly (mock `enabledLlmModels`/`intelligentModelSelector`/
 * `creditService`/`llmRouter`/`_core/logger`, import the real service).
 * Speakability fixtures reuse the REAL "episode-11 bad data" lines from
 * `shared/verticalDramaSeries/dialogueQuality.test.ts` verbatim.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  computeDeepDraftChunkSizes,
  resolveDeepDraftHorizon,
  enforceEpisodeShotDraftSpeakability,
  computeDraftCompleteness,
  reconcileDeepDraftChunkEpisodes,
  buildDeepDraftMissingEpisodesRetryInstruction,
  readItemShotDrafts,
  readItemCliffhangerLine,
  readActiveDeepDraftMetadata,
  computeDeepDraftSummary,
  appendBreakdownVersion,
  InsufficientCreditsError,
  VD_DEEP_DRAFT_SHOTS_PER_EPISODE,
  VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE,
  resolveActiveBreakdownVersionIndex,
  readItemManualDialogueEdit,
  readItemDraftCompleteness,
  applyManualDialogueEdit,
  analyzeManualDialogueEditLines,
  ManualDialogueEditNoDraftError,
  VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER,
  type VdDeepDraftShotDraft,
  type VdDeepDraftWarning,
  type StoredEpisodeBreakdownItem,
} from "../verticalDramaStoryBible";
import { estimateVerticalDramaSpeechSeconds } from "@shared/verticalDramaSeries/dialogueQuality";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
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

function chunkResponsePayload(
  episodeNumbers: number[],
  opts: { openThreads?: string[]; shotDraftsFor?: (ep: number) => unknown[] } = {},
) {
  return {
    episodeBreakdown: episodeNumbers.map((ep) => ({
      episodeNumber: ep,
      workingTitle: `Episode ${ep}`,
      logline: `Logline ${ep}`,
      keyBeats: ["Beat A"],
      shotDrafts: opts.shotDraftsFor ? opts.shotDraftsFor(ep) : nineShotDrafts(),
      cliffhanger_line: `Cliffhanger for episode ${ep}`,
    })),
    open_threads: opts.openThreads ?? [],
  };
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadEnabledLlmModelRows.mockResolvedValue([]);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
});

/* -------------------------------------------------------------------------- */
/* Chunk math + horizon resolution                                            */
/* -------------------------------------------------------------------------- */

describe("computeDeepDraftChunkSizes", () => {
  it("splits 10 episodes into [5, 5]", () => {
    expect(computeDeepDraftChunkSizes(10)).toEqual([5, 5]);
  });

  it("splits 12 episodes into [5, 5, 2]", () => {
    expect(computeDeepDraftChunkSizes(12)).toEqual([5, 5, 2]);
  });

  it("keeps a horizon of 3 (out of a 100-episode series) as a single [3] chunk", () => {
    expect(computeDeepDraftChunkSizes(3)).toEqual([3]);
  });

  it("returns [] for zero or negative episode counts", () => {
    expect(computeDeepDraftChunkSizes(0)).toEqual([]);
    expect(computeDeepDraftChunkSizes(-5)).toEqual([]);
  });
});

describe("resolveDeepDraftHorizon", () => {
  it("defaults to ALL episodes when totalEpisodes <= 20 and no horizon was requested", () => {
    expect(resolveDeepDraftHorizon(undefined, 10)).toBe(10);
    expect(resolveDeepDraftHorizon(undefined, 20)).toBe(20);
  });

  it("defaults to 3 for a large series (> 20 episodes) with no horizon requested", () => {
    expect(resolveDeepDraftHorizon(undefined, 100)).toBe(3);
    expect(resolveDeepDraftHorizon(undefined, 21)).toBe(3);
  });

  it("clamps an explicit horizon to totalEpisodes", () => {
    expect(resolveDeepDraftHorizon(500, 100)).toBe(100);
  });

  it("honors an explicit horizon within range for a large series", () => {
    expect(resolveDeepDraftHorizon(3, 100)).toBe(3);
  });

  it("never goes below 0", () => {
    expect(resolveDeepDraftHorizon(undefined, 0)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Post-chunk speakability enforcement — real dialogueQuality.test.ts fixtures */
/* -------------------------------------------------------------------------- */

describe("enforceEpisodeShotDraftSpeakability — real speakability fixtures (episode-11 bad data)", () => {
  it("applies the cleaned version automatically for a line that stays speakable after cleaning (real bad data 1)", () => {
    const warnings: VdDeepDraftWarning[] = [];
    const shots: VdDeepDraftShotDraft[] = [
      {
        shot_number: 1,
        summary: "Grandmother warns the girl",
        dialogue_lines: [
          { speaker: "หนูนา", line: "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”" },
        ],
      },
    ];

    const result = enforceEpisodeShotDraftSpeakability(1, shots, warnings);

    expect(result[0].dialogue_lines).toEqual([
      {
        speaker: "หนูนา",
        line: "ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม",
        delivery: undefined,
      },
    ]);
    expect(warnings).toEqual([]);
  });

  it("cleans an em-dash line to a comma and keeps it (real bad data 4)", () => {
    const warnings: VdDeepDraftWarning[] = [];
    const shots: VdDeepDraftShotDraft[] = [
      {
        shot_number: 2,
        summary: "Chai reassures the group",
        dialogue_lines: [
          { speaker: "ชายนต์", line: "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”" },
        ],
      },
    ];

    const result = enforceEpisodeShotDraftSpeakability(1, shots, warnings);

    expect(result[0].dialogue_lines[0].line).toBe(
      "ใจเย็น ฟังให้ครบตามกติกา, ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย",
    );
    expect(warnings).toEqual([]);
  });

  it("drops a line that cleans down to a bare nonverbal sound and records a warning (real bad data 3: cat 'เหมียว~')", () => {
    const warnings: VdDeepDraftWarning[] = [];
    const shots: VdDeepDraftShotDraft[] = [
      {
        shot_number: 4,
        summary: "The cat reacts to the noise",
        dialogue_lines: [{ speaker: "เจ้าเกลือ(เหมียว)", line: "“เหมียว~”" }],
      },
    ];

    const result = enforceEpisodeShotDraftSpeakability(11, shots, warnings);

    expect(result[0].dialogue_lines).toEqual([]);
    expect(warnings).toEqual([{ episodeNumber: 11, shotNumber: 4, reason: "nonverbal_line" }]);
  });

  it("drops a line that cleans down to nothing at all and records a warning (synthetic — no all-symbol lines in the real fixtures)", () => {
    const warnings: VdDeepDraftWarning[] = [];
    const shots: VdDeepDraftShotDraft[] = [
      {
        shot_number: 2,
        summary: "Wind rustles through the alley",
        dialogue_lines: [{ speaker: "Ambience", line: "~~~" }],
      },
    ];

    const result = enforceEpisodeShotDraftSpeakability(3, shots, warnings);

    expect(result[0].dialogue_lines).toEqual([]);
    expect(warnings).toEqual([{ episodeNumber: 3, shotNumber: 2, reason: "empty_after_cleaning" }]);
  });

  it("leaves an already-speakable line and a silence_intent shot's empty dialogue untouched", () => {
    const warnings: VdDeepDraftWarning[] = [];
    const shots: VdDeepDraftShotDraft[] = [
      { shot_number: 1, summary: "Clean line", dialogue_lines: [{ speaker: "หนูนา", line: "ปล่อยฉันออกไปที" }] },
      { shot_number: 5, summary: "Establishing shot", dialogue_lines: [], silence_intent: "establishing" },
    ];

    const result = enforceEpisodeShotDraftSpeakability(1, shots, warnings);

    expect(result[0]).toEqual(shots[0]);
    expect(result[1]).toEqual(shots[1]);
    expect(warnings).toEqual([]);
  });

  /* ---------------------------------------------------------------------- */
  /* silence_intent vs dialogue contradiction (live-bug fix)                */
  /* ---------------------------------------------------------------------- */

  it("strips silence_intent and records a silence_intent_conflict warning when a shot has BOTH silence_intent and a usable (post-cleaning) dialogue line — dialogue wins", () => {
    const warnings: VdDeepDraftWarning[] = [];
    const shots: VdDeepDraftShotDraft[] = [
      {
        shot_number: 3,
        summary: "Establishing shot that was ALSO given a real line",
        dialogue_lines: [{ speaker: "หนูนา", line: "ปล่อยฉันออกไปที" }],
        silence_intent: "establishing",
      },
    ];

    const result = enforceEpisodeShotDraftSpeakability(5, shots, warnings);

    expect(result[0].dialogue_lines).toEqual([{ speaker: "หนูนา", line: "ปล่อยฉันออกไปที" }]);
    expect(result[0].silence_intent).toBeUndefined();
    expect("silence_intent" in result[0]).toBe(false);
    expect(warnings).toEqual([{ episodeNumber: 5, shotNumber: 3, reason: "silence_intent_conflict" }]);
  });

  it("strips silence_intent when a line only becomes usable AFTER cleaning (em-dash line + silence_intent both set)", () => {
    const warnings: VdDeepDraftWarning[] = [];
    const shots: VdDeepDraftShotDraft[] = [
      {
        shot_number: 2,
        summary: "Chai reassures the group",
        dialogue_lines: [
          { speaker: "ชายนต์", line: "“ใจเย็น ฟังให้ครบตามกติกา—ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย”" },
        ],
        silence_intent: "dramatic_pause",
      },
    ];

    const result = enforceEpisodeShotDraftSpeakability(1, shots, warnings);

    expect(result[0].dialogue_lines[0].line).toBe(
      "ใจเย็น ฟังให้ครบตามกติกา, ความจริงที่ปลอดภัยต้องพิสูจน์ได้ด้วย",
    );
    expect(result[0].silence_intent).toBeUndefined();
    expect(warnings).toEqual([{ episodeNumber: 1, shotNumber: 2, reason: "silence_intent_conflict" }]);
  });

  it("keeps silence_intent (no contradiction warning) when the shot's only dialogue line is junk and gets dropped during cleaning — existing nonverbal_line warning is unchanged", () => {
    const warnings: VdDeepDraftWarning[] = [];
    const shots: VdDeepDraftShotDraft[] = [
      {
        shot_number: 4,
        summary: "The cat reacts to the noise",
        dialogue_lines: [{ speaker: "เจ้าเกลือ(เหมียว)", line: "“เหมียว~”" }],
        silence_intent: "action_visual",
      },
    ];

    const result = enforceEpisodeShotDraftSpeakability(11, shots, warnings);

    expect(result[0].dialogue_lines).toEqual([]);
    expect(result[0].silence_intent).toBe("action_visual");
    expect(warnings).toEqual([{ episodeNumber: 11, shotNumber: 4, reason: "nonverbal_line" }]);
  });
});

/* -------------------------------------------------------------------------- */
/* reconcileDeepDraftChunkEpisodes — chunk episode-set validation (live-bug   */
/* fix: chunk under-count no longer accepted silently)                       */
/* -------------------------------------------------------------------------- */

describe("reconcileDeepDraftChunkEpisodes", () => {
  it("returns every item, in REQUESTED order, when the returned set matches exactly (order-independent input)", () => {
    const result = reconcileDeepDraftChunkEpisodes(
      [1, 2, 3],
      [{ episodeNumber: 2 }, { episodeNumber: 1 }, { episodeNumber: 3 }],
    );
    expect(result.items.map((i) => i.episodeNumber)).toEqual([1, 2, 3]);
    expect(result.missingEpisodeNumbers).toEqual([]);
  });

  it("reports missing episode numbers in ascending order when the chunk under-returns", () => {
    const result = reconcileDeepDraftChunkEpisodes(
      [6, 7, 8, 9, 10],
      [6, 7, 8, 9].map((episodeNumber) => ({ episodeNumber })),
    );
    expect(result.items.map((i) => i.episodeNumber)).toEqual([6, 7, 8, 9]);
    expect(result.missingEpisodeNumbers).toEqual([10]);
  });

  it("deterministically drops a duplicate episode number, keeping the FIRST occurrence", () => {
    const result = reconcileDeepDraftChunkEpisodes(
      [1, 2],
      [
        { episodeNumber: 1, tag: "first" },
        { episodeNumber: 1, tag: "duplicate" },
        { episodeNumber: 2, tag: "only" },
      ],
    );
    expect(result.items).toEqual([
      { episodeNumber: 1, tag: "first" },
      { episodeNumber: 2, tag: "only" },
    ]);
    expect(result.missingEpisodeNumbers).toEqual([]);
  });

  it("drops an extra episode number that was never requested, without affecting missingEpisodeNumbers", () => {
    const result = reconcileDeepDraftChunkEpisodes(
      [1],
      [{ episodeNumber: 1 }, { episodeNumber: 99 }],
    );
    expect(result.items.map((i) => i.episodeNumber)).toEqual([1]);
    expect(result.missingEpisodeNumbers).toEqual([]);
  });

  it("handles duplicates, extras, AND a genuine gap all in the same response", () => {
    const result = reconcileDeepDraftChunkEpisodes(
      [1, 2, 3],
      [
        { episodeNumber: 1 },
        { episodeNumber: 1 }, // duplicate — dropped
        { episodeNumber: 99 }, // extra — dropped
        { episodeNumber: 3 },
        // episode 2 never came back
      ],
    );
    expect(result.items.map((i) => i.episodeNumber)).toEqual([1, 3]);
    expect(result.missingEpisodeNumbers).toEqual([2]);
  });
});

describe("buildDeepDraftMissingEpisodesRetryInstruction", () => {
  it("names every missing episode number explicitly", () => {
    const instruction = buildDeepDraftMissingEpisodesRetryInstruction([10]);
    expect(instruction).toContain("missing required episode(s): 10");

    const multi = buildDeepDraftMissingEpisodesRetryInstruction([2, 4]);
    expect(multi).toContain("missing required episode(s): 2, 4");
  });
});

/* -------------------------------------------------------------------------- */
/* draftCompleteness — canonical estimator                                    */
/* -------------------------------------------------------------------------- */

describe("computeDraftCompleteness", () => {
  function wellCoveredShots(): VdDeepDraftShotDraft[] {
    return Array.from({ length: 9 }, (_, i) => ({
      shot_number: i + 1,
      summary: `Shot ${i + 1}`,
      dialogue_lines: [
        { speaker: "Aria", line: "นี่คือบทพูดที่ยาวพอสำหรับการทดสอบการครอบคลุมเสียงพูดในช็อตนี้อย่างแน่นอน" },
        { speaker: "Kai", line: "และนี่คือบทพูดที่สองเพื่อให้แน่ใจว่าครอบคลุมเป้าหมายเสียงพูดของช็อตนี้อย่างสมบูรณ์" },
      ],
    })) as VdDeepDraftShotDraft[];
  }

  it("computes estimatedSpeechSeconds via the canonical per-line estimator (sum across every shot)", () => {
    const shots = wellCoveredShots();
    const result = computeDraftCompleteness(shots);

    const expectedTotal = shots.reduce(
      (sum, shot) =>
        sum + shot.dialogue_lines.reduce((s, l) => s + estimateVerticalDramaSpeechSeconds(l.line), 0),
      0,
    );
    expect(result.estimatedSpeechSeconds).toBeCloseTo(expectedTotal, 5);
  });

  it("dialogueEveryShot is true when every shot has a line or an explicit silence_intent", () => {
    const shots = wellCoveredShots();
    shots[8] = { ...shots[8], dialogue_lines: [], silence_intent: "establishing" };
    expect(computeDraftCompleteness(shots).dialogueEveryShot).toBe(true);
  });

  it("dialogueEveryShot is false when a shot has neither dialogue nor a silence_intent", () => {
    const shots = wellCoveredShots();
    shots[8] = { ...shots[8], dialogue_lines: [] };
    expect(computeDraftCompleteness(shots).dialogueEveryShot).toBe(false);
  });

  it("allSpeakable is true once every remaining line is already clean", () => {
    expect(computeDraftCompleteness(wellCoveredShots()).allSpeakable).toBe(true);
  });

  it("classifies coverageStatus ok/error against the canonical episode coverage ratios", () => {
    expect(computeDraftCompleteness(wellCoveredShots()).coverageStatus).toBe("ok");

    const emptyShots: VdDeepDraftShotDraft[] = Array.from({ length: 9 }, (_, i) => ({
      shot_number: i + 1,
      summary: `Shot ${i + 1}`,
      dialogue_lines: [],
    })) as VdDeepDraftShotDraft[];
    expect(computeDraftCompleteness(emptyShots).coverageStatus).toBe("error");
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryBibleDeep — cross-chunk continuity recap                      */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — cross-chunk continuity recap", () => {
  it("chunk 2's prompt contains chunk 1's titles, cliffhanger lines, and open threads", async () => {
    const episodes = Array.from({ length: 6 }, (_, i) => existingItem(i + 1));
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4, 5], { openThreads: ["thread-alpha", "thread-beta"] }));
    mockLlmResponseOnce(chunkResponsePayload([6]));

    await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    const secondCallArgs = mockExecuteWithFallback.mock.calls[1][0];
    const userMessage = secondCallArgs.messages.find((m: { role: string }) => m.role === "user");

    expect(userMessage.content).toContain("Episode 1");
    expect(userMessage.content).toContain("Cliffhanger for episode 1");
    expect(userMessage.content).toContain("thread-alpha");
    expect(userMessage.content).toContain("thread-beta");
  });

  it("chunk 1's prompt carries no recap section when no priorRecap was seeded", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));

    await generateStoryBibleDeep(baseDeepParams());

    const firstCallArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = firstCallArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("Continuity recap");
  });

  it("seeds the FIRST chunk's recap from an explicit priorRecap (extendStoryDraftHorizon use case)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([6]));

    await generateStoryBibleDeep(
      baseDeepParams({
        episodes: [existingItem(6)],
        priorRecap: {
          items: [{ episodeNumber: 5, workingTitle: "Ep5", logline: "Logline 5", cliffhangerLine: "Cliff 5" }],
          openThreads: ["carried-thread"],
        },
      }),
    );

    const firstCallArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = firstCallArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("Ep5");
    expect(userMessage.content).toContain("Cliff 5");
    expect(userMessage.content).toContain("carried-thread");
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryBibleDeep — credits                                           */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — credits", () => {
  it("pre-checks total credits as chunkCount * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE BEFORE the first call", async () => {
    const episodes = Array.from({ length: 12 }, (_, i) => existingItem(i + 1)); // -> chunks [5, 5, 2]
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4, 5]));
    mockLlmResponseOnce(chunkResponsePayload([6, 7, 8, 9, 10]));
    mockLlmResponseOnce(chunkResponsePayload([11, 12]));

    await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockHasEnoughCredits).toHaveBeenCalledTimes(1);
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(1, 3 * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE);
  });

  it("deducts credits exactly once per successfully-completed chunk", async () => {
    const episodes = Array.from({ length: 12 }, (_, i) => existingItem(i + 1));
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4, 5]));
    mockLlmResponseOnce(chunkResponsePayload([6, 7, 8, 9, 10]));
    mockLlmResponseOnce(chunkResponsePayload([11, 12]));

    await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockDeductCredits).toHaveBeenCalledTimes(3);
  });

  it("throws InsufficientCreditsError and calls no LLM when the total pre-check fails", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(generateStoryBibleDeep(baseDeepParams())).rejects.toThrow(InsufficientCreditsError);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryBibleDeep — resilient resume (added 2026-07-14,              */
/* `planning/vertical-drama-deep-story-resilient-resume/plan.md`)             */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — resilient resume", () => {
  it("skips episodes in alreadyDraftedEpisodeNumbers entirely: no prompt built, no LLM call, no credits deducted for them — only the remaining episodes are drafted, and the result is the full (resumed + new) union", async () => {
    const episodes = Array.from({ length: 10 }, (_, i) => existingItem(i + 1)); // episodes 1-10
    // Episodes 1-5 are "already drafted" (simulating a checkpoint from an
    // interrupted earlier attempt) — only 6-10 should actually run.
    const resumedItems = Array.from({ length: 5 }, (_, i) => ({
      episodeNumber: i + 1,
      shotDrafts: nineShotDrafts(),
      cliffhanger_line: `Resumed cliffhanger ${i + 1}`,
      draftCompleteness: { allSpeakable: true, dialogueEveryShot: true, estimatedSpeechSeconds: 50 },
    }));
    mockLlmResponseOnce(chunkResponsePayload([6, 7, 8, 9, 10]));

    const result = await generateStoryBibleDeep(
      baseDeepParams({
        episodes,
        resumeDraftedItems: resumedItems,
        alreadyDraftedEpisodeNumbers: [1, 2, 3, 4, 5],
      }),
    );

    // Exactly ONE chunk call (for the 5 remaining episodes) — the 5 resumed
    // episodes never triggered a prompt/LLM call.
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
    const [callArgs] = mockExecuteWithFallback.mock.calls[0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toMatch(/"episodeNumber":[1-5],/);

    // Credits pre-check + deduction only cover the 1 remaining chunk, not
    // the 2 chunks a fresh (non-resumed) 10-episode run would normally need.
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(1, 1 * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);

    // Full union returned: 5 resumed + 5 newly drafted = 10, ascending order preserved.
    expect(result.draftedItems).toHaveLength(10);
    expect(result.draftedItems.map((item) => item.episodeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result.draftedItems[0].cliffhanger_line).toBe("Resumed cliffhanger 1");
    expect(result.partial).toBe(false);
    expect(result.chunkSizes).toEqual([5]);
  });

  it("returns the full resumed set with zero LLM calls/credits when EVERY requested episode is already drafted (full resume)", async () => {
    const episodes = Array.from({ length: 3 }, (_, i) => existingItem(i + 1));
    const resumedItems = Array.from({ length: 3 }, (_, i) => ({
      episodeNumber: i + 1,
      shotDrafts: nineShotDrafts(),
      cliffhanger_line: `Resumed ${i + 1}`,
      draftCompleteness: { allSpeakable: true, dialogueEveryShot: true, estimatedSpeechSeconds: 50 },
    }));

    const result = await generateStoryBibleDeep(
      baseDeepParams({
        episodes,
        resumeDraftedItems: resumedItems,
        alreadyDraftedEpisodeNumbers: [1, 2, 3],
      }),
    );

    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(result.draftedItems).toHaveLength(3);
    expect(result.creditsUsed).toBe(0);
    expect(result.partial).toBe(false);
    expect(result.chunkSizes).toEqual([]);
  });

  it("fires onChunkComplete with ONLY that chunk's freshly-drafted items (never the resumed ones)", async () => {
    const episodes = Array.from({ length: 6 }, (_, i) => existingItem(i + 1));
    const resumedItems = [
      {
        episodeNumber: 1,
        shotDrafts: nineShotDrafts(),
        cliffhanger_line: "Resumed 1",
        draftCompleteness: { allSpeakable: true, dialogueEveryShot: true, estimatedSpeechSeconds: 50 },
      },
    ];
    mockLlmResponseOnce(chunkResponsePayload([2, 3, 4, 5, 6]));
    const onChunkComplete = vi.fn();

    await generateStoryBibleDeep(
      baseDeepParams({
        episodes,
        resumeDraftedItems: resumedItems,
        alreadyDraftedEpisodeNumbers: [1],
        onChunkComplete,
      }),
    );

    expect(onChunkComplete).toHaveBeenCalledTimes(1);
    const [chunkArg] = onChunkComplete.mock.calls[0];
    expect(chunkArg.map((item: { episodeNumber: number }) => item.episodeNumber)).toEqual([2, 3, 4, 5, 6]);
  });

  it("byte-identical to a fresh run when resumeDraftedItems/alreadyDraftedEpisodeNumbers are omitted", async () => {
    const episodes = Array.from({ length: 5 }, (_, i) => existingItem(i + 1));
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4, 5]));

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(result.draftedItems).toHaveLength(5);
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryBibleDeep — mode: "standard" byte-identity (W11-A)            */
/*                                                                            */
/* Premium multi-round drafts (W11-A) add a `mode` switch at the very top of  */
/* `generateStoryBibleDeep` — everything below it (this whole file's target)  */
/* is UNTOUCHED source. These 2 tests pin down that `mode: "standard"` (and,  */
/* by extension, every test ABOVE this block, which omits `mode` entirely)    */
/* produce the EXACT SAME single-call-per-chunk prompt/call-count behavior.   */
/* -------------------------------------------------------------------------- */

describe('generateStoryBibleDeep — mode: "standard" byte-identity (W11-A)', () => {
  it("issues exactly ONE call per chunk (not the 3-way premium fan-out) with mode: \"standard\"", async () => {
    const episodes = Array.from({ length: 6 }, (_, i) => existingItem(i + 1)); // -> chunks [5, 1]
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4, 5]));
    mockLlmResponseOnce(chunkResponsePayload([6]));

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes, mode: "standard" }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    expect(mockHasEnoughCredits).toHaveBeenCalledWith(1, 2 * VD_DEEP_DRAFT_PER_CALL_CREDIT_ESTIMATE);
    expect(mockDeductCredits).toHaveBeenCalledTimes(2);
    expect(result.draftedItems).toHaveLength(6);
    expect(result.draftedItems[0].draftScorecard).toBeUndefined();
    expect((result as { premiumMetrics?: unknown }).premiumMetrics).toBeUndefined();
  });

  it("produces a BYTE-IDENTICAL prompt whether mode is omitted or explicitly \"standard\"", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams());
    const omittedCallArgs = mockExecuteWithFallback.mock.calls[0][0];

    vi.clearAllMocks();
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined);
    mockCalculateCreditsForLLM.mockReturnValue(3);
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams({ mode: "standard" }));
    const explicitCallArgs = mockExecuteWithFallback.mock.calls[0][0];

    expect(explicitCallArgs.messages).toEqual(omittedCallArgs.messages);
    expect(explicitCallArgs.maxTokens).toBe(omittedCallArgs.maxTokens);
    expect(explicitCallArgs.temperature).toBe(omittedCallArgs.temperature);
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryBibleDeep — format profiles (task #23, added 2026-07-08)      */
/*                                                                            */
/* The "FORMAT PROFILE" block only ever appears when BOTH `formatProfilesEnabled` */
/* is `true` AND the resolved profile's tier is NOT "standard" — every other  */
/* combination (flag off, flag on but no `totalEpisodeCount`, or a standard-  */
/* tier `totalEpisodeCount`) must render a systemPrompt with NO trace of it,  */
/* which is what keeps every test ABOVE this block (none of which pass       */
/* `formatProfilesEnabled`) byte-identical.                                   */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — format profiles (task #23)", () => {
  function systemPromptFromFirstCall(): string {
    const firstCallArgs = mockExecuteWithFallback.mock.calls[0][0];
    const systemMessage = firstCallArgs.messages.find((m: { role: string }) => m.role === "system");
    return systemMessage.content as string;
  }

  it("omits the FORMAT PROFILE block when formatProfilesEnabled is omitted (flag-off byte-identical)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams({ totalEpisodeCount: 3 }));
    expect(systemPromptFromFirstCall()).not.toContain("FORMAT PROFILE");
  });

  it("omits the FORMAT PROFILE block when formatProfilesEnabled is true but totalEpisodeCount is omitted", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams({ formatProfilesEnabled: true }));
    expect(systemPromptFromFirstCall()).not.toContain("FORMAT PROFILE");
  });

  it("omits the FORMAT PROFILE block for a standard-tier totalEpisodeCount even with the flag on", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({ formatProfilesEnabled: true, totalEpisodeCount: 20 }),
    );
    expect(systemPromptFromFirstCall()).not.toContain("FORMAT PROFILE");
  });

  it("adds a FORMAT PROFILE block with the ultra_short guidance + 3s cold-open hook rule for a 3-episode season", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({ formatProfilesEnabled: true, totalEpisodeCount: 3 }),
    );
    const systemPrompt = systemPromptFromFirstCall();
    expect(systemPrompt).toContain("FORMAT PROFILE");
    expect(systemPrompt).toContain("ซีรีส์สั้นมาก");
    expect(systemPrompt).toContain("3 seconds");
  });

  it("adds a FORMAT PROFILE block with the short guidance + 5s cold-open hook rule for a 9-episode season", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({ formatProfilesEnabled: true, totalEpisodeCount: 9 }),
    );
    const systemPrompt = systemPromptFromFirstCall();
    expect(systemPrompt).toContain("FORMAT PROFILE");
    expect(systemPrompt).toContain("ซีรีส์สั้น");
    expect(systemPrompt).toContain("5 seconds");
  });

  it("uses the English beat-density guidance for an English-locale series", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(
      baseDeepParams({ locale: "en", formatProfilesEnabled: true, totalEpisodeCount: 3 }),
    );
    const systemPrompt = systemPromptFromFirstCall();
    expect(systemPrompt).toContain("FORMAT PROFILE");
    expect(systemPrompt).toContain("2-3 standard episodes");
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryBibleDeep — partial failure                                   */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — partial failure", () => {
  it("stops after a later chunk fails but returns the earlier chunk's drafted items with partial: true", async () => {
    const episodes = Array.from({ length: 10 }, (_, i) => existingItem(i + 1)); // -> chunks [5, 5]
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4, 5]));
    mockExecuteWithFallback.mockResolvedValueOnce({ type: "error", error: "provider exploded" });

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(result.partial).toBe(true);
    expect(result.chunkSizes).toEqual([5]);
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(result.error).toBeTruthy();
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    // A chunk-level provider failure is unrelated to the episode-count
    // reconciliation fix below — missingEpisodes stays empty (always
    // present, never undefined).
    expect(result.missingEpisodes).toEqual([]);
  });

  it("throws (does not return a partial result) when the VERY FIRST chunk fails — nothing to persist", async () => {
    const episodes = Array.from({ length: 10 }, (_, i) => existingItem(i + 1));
    mockExecuteWithFallback.mockResolvedValueOnce({ type: "error", error: "provider exploded" });

    await expect(generateStoryBibleDeep(baseDeepParams({ episodes }))).rejects.toThrow();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

/* -------------------------------------------------------------------------- */
/* generateStoryBibleDeep — chunk episode-count mismatch (live-bug fix:       */
/* corrective retry on a missing/extra/duplicate episode set)                */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — chunk episode-count mismatch (missing-episode corrective retry)", () => {
  it("issues ONE corrective retry naming the missing episode number when the first attempt under-returns, and completes normally (no partial) once the retry recovers it", async () => {
    const episodes = Array.from({ length: 5 }, (_, i) => existingItem(i + 1));
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4])); // missing episode 5
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4, 5])); // retry recovers it

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    const retryUserMessage = mockExecuteWithFallback.mock.calls[1][0].messages.find(
      (m: { role: string }) => m.role === "user",
    );
    expect(retryUserMessage.content).toContain("missing required episode(s): 5");

    expect(result.partial).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.missingEpisodes).toEqual([]);
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(result.chunkSizes).toEqual([5]);
    // Both real LLM calls (first attempt + corrective retry) get deducted.
    expect(mockDeductCredits).toHaveBeenCalledTimes(2);
  });

  it('marks the run partial with missingEpisodes: [10] when the corrective retry STILL doesn\'t recover the missing episode — the earlier full chunk AND the partially-recovered chunk are both persisted', async () => {
    const episodes = Array.from({ length: 10 }, (_, i) => existingItem(i + 1)); // -> chunks [5, 5]
    mockLlmResponseOnce(chunkResponsePayload([1, 2, 3, 4, 5])); // chunk 1 — complete, no retry needed
    mockLlmResponseOnce(chunkResponsePayload([6, 7, 8, 9])); // chunk 2 first attempt — missing 10
    mockLlmResponseOnce(chunkResponsePayload([6, 7, 8, 9])); // chunk 2 retry — STILL missing 10

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    // Only 3 calls total — a 3rd chunk is never attempted once chunk 2 is
    // still incomplete after its retry (never overstate coverage past a gap).
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(3);

    expect(result.partial).toBe(true);
    expect(result.missingEpisodes).toEqual([10]);
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Chunk 2's ACTUAL persisted count (4), not the originally-requested 5 —
    // this is also what the client success toast sums.
    expect(result.chunkSizes).toEqual([5, 4]);
    expect(result.warnings).toContainEqual({
      episodeNumber: 10,
      shotNumber: 0,
      reason: "episode_missing_after_retry",
    });
    expect(result.error).toContain("10");
    expect(mockDeductCredits).toHaveBeenCalledTimes(3); // chunk 1 + chunk 2's first attempt + chunk 2's retry
  });

  it("does not retry at all when the only discrepancy is a duplicate/extra episode number (nothing is actually missing)", async () => {
    const episodes = [existingItem(1), existingItem(2)];
    mockLlmResponseOnce({
      episodeBreakdown: [
        ...chunkResponsePayload([1, 2]).episodeBreakdown,
        { ...chunkResponsePayload([2]).episodeBreakdown[0] }, // duplicate episode 2
        { ...chunkResponsePayload([99]).episodeBreakdown[0] }, // extra, unrequested episode
      ],
      open_threads: [],
    });

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1); // no corrective retry issued
    expect(result.partial).toBe(false);
    expect(result.missingEpisodes).toEqual([]);
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1, 2]);
  });

  it("prefers the retry's fresh redraft over the first attempt's content for an episode present in BOTH responses", async () => {
    const episodes = [existingItem(1), existingItem(2)];
    const firstPayload = chunkResponsePayload([1, 2]);
    firstPayload.episodeBreakdown = firstPayload.episodeBreakdown.filter((ep) => ep.episodeNumber === 1); // drop episode 2 — missing
    firstPayload.episodeBreakdown[0].cliffhanger_line = "FIRST attempt cliffhanger for episode 1";
    mockLlmResponseOnce(firstPayload);

    const retryPayload = chunkResponsePayload([1, 2], { openThreads: ["retry-thread"] });
    retryPayload.episodeBreakdown[0].cliffhanger_line = "RETRY cliffhanger for episode 1";
    retryPayload.episodeBreakdown[1].cliffhanger_line = "RETRY cliffhanger for episode 2";
    mockLlmResponseOnce(retryPayload);

    const result = await generateStoryBibleDeep(baseDeepParams({ episodes }));

    expect(result.partial).toBe(false);
    expect(result.finalOpenThreads).toEqual(["retry-thread"]);
    expect(result.draftedItems.map((i) => i.episodeNumber)).toEqual([1, 2]);
    expect(result.draftedItems.find((i) => i.episodeNumber === 1)?.cliffhanger_line).toBe(
      "RETRY cliffhanger for episode 1",
    );
    expect(result.draftedItems.find((i) => i.episodeNumber === 2)?.cliffhanger_line).toBe(
      "RETRY cliffhanger for episode 2",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* appendBreakdownVersion — deepDraft metadata (W10-A)                        */
/* -------------------------------------------------------------------------- */

describe("appendBreakdownVersion — deepDraft metadata (W10-A)", () => {
  it("stamps the optional deepDraft metadata onto the new version when provided", () => {
    const result = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [existingItem(1)],
        createdByUserId: 7,
        versionId: "v-deep-1",
        createdAt: "2026-07-08T00:00:00.000Z",
        deepDraft: { horizonEndEpisode: 5, chunkSizes: [5], generatedAt: "2026-07-08T00:00:00.000Z" },
      },
    );

    const versions = result.breakdownVersions as Array<Record<string, unknown>>;
    expect(versions[0].deepDraft).toEqual({
      horizonEndEpisode: 5,
      chunkSizes: [5],
      generatedAt: "2026-07-08T00:00:00.000Z",
    });
  });

  it("omits the deepDraft key entirely when not provided — existing arc-replan/plain callers unaffected", () => {
    const result = appendBreakdownVersion(
      {},
      {
        source: "arc_replan",
        items: [existingItem(1)],
        createdByUserId: 1,
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    );
    const versions = result.breakdownVersions as Array<Record<string, unknown>>;
    expect("deepDraft" in versions[0]).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Legacy tolerance — readers never throw on data that predates deep drafts   */
/* -------------------------------------------------------------------------- */

describe("readItemShotDrafts / readItemCliffhangerLine — legacy tolerance", () => {
  it("returns null/undefined for a legacy item with neither field at all", () => {
    const legacy = existingItem(1);
    expect(readItemShotDrafts(legacy)).toBeNull();
    expect(readItemCliffhangerLine(legacy)).toBeUndefined();
  });

  it("returns the parsed shotDrafts/cliffhanger_line when present and valid", () => {
    const shots = nineShotDrafts();
    const item = existingItem(1, { shotDrafts: shots, cliffhanger_line: "จะเกิดอะไรขึ้นต่อไป" });
    expect(readItemShotDrafts(item)).toEqual(shots);
    expect(readItemCliffhangerLine(item)).toBe("จะเกิดอะไรขึ้นต่อไป");
  });

  it("returns null (never throws) when shotDrafts is malformed", () => {
    const item = existingItem(1, {
      shotDrafts: [{ shot_number: 1, summary: "only one shot", dialogue_lines: [] }],
    });
    expect(readItemShotDrafts(item)).toBeNull();
  });
});

describe("readActiveDeepDraftMetadata", () => {
  it("returns null when no versions exist at all", () => {
    expect(readActiveDeepDraftMetadata(null)).toBeNull();
    expect(readActiveDeepDraftMetadata({})).toBeNull();
  });

  it("returns null for a legacy version that predates deep drafts (still parses, no deepDraft key)", () => {
    const bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [existingItem(1)],
        createdByUserId: 1,
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    );
    expect(readActiveDeepDraftMetadata(bible)).toBeNull();
  });

  it("returns the active version's deepDraft metadata when present", () => {
    const bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [existingItem(1)],
        createdByUserId: 1,
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
        deepDraft: { horizonEndEpisode: 5, chunkSizes: [5], generatedAt: "2026-01-01T00:00:00.000Z" },
      },
    );
    expect(readActiveDeepDraftMetadata(bible)).toEqual({
      horizonEndEpisode: 5,
      chunkSizes: [5],
      generatedAt: "2026-01-01T00:00:00.000Z",
    });
  });
});

describe("computeDeepDraftSummary", () => {
  it("returns null when the series has no breakdown at all", () => {
    expect(computeDeepDraftSummary(null, 10)).toBeNull();
  });

  it("returns null when the breakdown exists but no episode has shotDrafts yet (a plain generateStoryBible series)", () => {
    const bible = { episodeBreakdown: [existingItem(1), existingItem(2)] };
    expect(computeDeepDraftSummary(bible, 10)).toBeNull();
  });

  it("computes horizonEndEpisode/episodesWithDrafts/totalEpisodes from the active version's deepDraft metadata", () => {
    const items = [
      existingItem(1, { shotDrafts: nineShotDrafts() }),
      existingItem(2, { shotDrafts: nineShotDrafts() }),
      existingItem(3),
    ];
    const bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items,
        createdByUserId: 1,
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
        deepDraft: { horizonEndEpisode: 2, chunkSizes: [2], generatedAt: "2026-01-01T00:00:00.000Z" },
      },
    );

    expect(computeDeepDraftSummary(bible, 10)).toEqual({
      horizonEndEpisode: 2,
      episodesWithDrafts: 2,
      totalEpisodes: 10,
    });
  });

  it("falls back to the highest drafted episode number when deepDraft metadata is absent (legacy bible)", () => {
    const bible = {
      episodeBreakdown: [
        existingItem(1, { shotDrafts: nineShotDrafts() }),
        existingItem(2, { shotDrafts: nineShotDrafts() }),
        existingItem(3),
      ],
    };
    expect(computeDeepDraftSummary(bible, 5)).toEqual({
      horizonEndEpisode: 2,
      episodesWithDrafts: 2,
      totalEpisodes: 5,
    });
  });
});

/* -------------------------------------------------------------------------- */
/* resolveActiveBreakdownVersionIndex — manual dialogue edits (W10.5,         */
/* added 2026-07-08)                                                          */
/* -------------------------------------------------------------------------- */

describe("resolveActiveBreakdownVersionIndex", () => {
  it("returns -1 when no versions exist at all", () => {
    expect(resolveActiveBreakdownVersionIndex(null)).toBe(-1);
    expect(resolveActiveBreakdownVersionIndex({})).toBe(-1);
  });

  it("returns the LAST version's index when activeBreakdownVersionId is missing/stale", () => {
    let bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [existingItem(1)],
        createdByUserId: 1,
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    );
    bible = appendBreakdownVersion(bible, {
      source: "generate_story",
      items: [existingItem(1)],
      createdByUserId: 1,
      versionId: "v2",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    expect(resolveActiveBreakdownVersionIndex(bible)).toBe(1);
    expect(resolveActiveBreakdownVersionIndex({ ...bible, activeBreakdownVersionId: "does-not-exist" })).toBe(1);
  });

  it("returns the index matching activeBreakdownVersionId, even when it's an EARLIER version (rewound)", () => {
    let bible = appendBreakdownVersion(
      {},
      {
        source: "generate_story",
        items: [existingItem(1)],
        createdByUserId: 1,
        versionId: "v1",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    );
    bible = appendBreakdownVersion(bible, {
      source: "generate_story",
      items: [existingItem(1)],
      createdByUserId: 1,
      versionId: "v2",
      createdAt: "2026-01-02T00:00:00.000Z",
    });

    expect(resolveActiveBreakdownVersionIndex({ ...bible, activeBreakdownVersionId: "v1" })).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Manual dialogue edits — series Overview per-shot correction (W10.5,        */
/* added 2026-07-08)                                                          */
/* -------------------------------------------------------------------------- */

describe("readItemManualDialogueEdit — legacy tolerance", () => {
  it("returns null for an item with shotDrafts that has never been manually edited", () => {
    expect(readItemManualDialogueEdit(existingItem(1, { shotDrafts: nineShotDrafts() }))).toBeNull();
  });

  it("returns null for a fully legacy item with neither shotDrafts nor manualDialogueEdit", () => {
    expect(readItemManualDialogueEdit(existingItem(1))).toBeNull();
  });

  it("returns the parsed stamp when present and valid", () => {
    const item = existingItem(1, {
      shotDrafts: nineShotDrafts(),
      manualDialogueEdit: { editedAt: "2026-07-08T00:00:00.000Z", editedByUserId: 7, shotNumbers: [2, 5] },
    });
    expect(readItemManualDialogueEdit(item)).toEqual({
      editedAt: "2026-07-08T00:00:00.000Z",
      editedByUserId: 7,
      shotNumbers: [2, 5],
    });
  });

  it("returns null (never throws) when manualDialogueEdit is malformed", () => {
    const item = existingItem(1, {
      shotDrafts: nineShotDrafts(),
      manualDialogueEdit: { shotNumbers: "not-an-array" },
    });
    expect(readItemManualDialogueEdit(item)).toBeNull();
  });
});

describe("analyzeManualDialogueEditLines", () => {
  it("returns [] when every line is already speakable", () => {
    expect(analyzeManualDialogueEditLines([{ speaker: "Aria", line: "ปล่อยฉันออกไปที" }])).toEqual([]);
  });

  it("reports a violation with lineIndex + cleanedSuggestion for an unspeakable line, WITHOUT mutating the input", () => {
    const lines = [
      { speaker: "Aria", line: "clean line, no issues here" },
      { speaker: "หนูนา", line: "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”" },
    ];
    const frozen = JSON.parse(JSON.stringify(lines));

    const warnings = analyzeManualDialogueEditLines(lines);

    expect(warnings).toEqual([
      {
        lineIndex: 1,
        violations: [{ kind: "wrapping_quotes", found: "“”" }],
        cleanedSuggestion: {
          speaker: "หนูนา",
          line: "ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม",
          delivery: undefined,
        },
      },
    ]);
    expect(lines).toEqual(frozen);
  });
});

describe("applyManualDialogueEdit", () => {
  it("REPLACES the target shot's dialogue_lines verbatim (never auto-cleaned) and leaves every other shot untouched", () => {
    const item = existingItem(1, { shotDrafts: nineShotDrafts() });

    const result = applyManualDialogueEdit({
      item,
      shotNumber: 3,
      lines: [{ speaker: "Kai", line: "นี่คือบทพูดที่แก้ไขใหม่สำหรับช็อตนี้อย่างชัดเจน" }],
      editedByUserId: 7,
      editedAt: "2026-07-08T00:00:00.000Z",
    });

    const updatedShots = readItemShotDrafts(result.item)!;
    expect(updatedShots[2].dialogue_lines).toEqual([
      { speaker: "Kai", line: "นี่คือบทพูดที่แก้ไขใหม่สำหรับช็อตนี้อย่างชัดเจน", delivery: undefined },
    ]);
    // every other shot is byte-identical to the original 9-shot fixture.
    const originalShots = nineShotDrafts();
    for (const i of [0, 1, 3, 4, 5, 6, 7, 8]) {
      expect(updatedShots[i]).toEqual(originalShots[i]);
    }
  });

  it("Feature 132 §6.2 (F132C) regression: preserves the edited shot's `contract` object unchanged (spread-based preservation, never dropped by a future explicit-field refactor)", () => {
    const contract = {
      storyFunction: "reveal",
      emotionalBeat: "dread",
      audienceTakeaway: "the note is fake",
      tensionSource: "time pressure",
      newClueIds: ["clue-1"],
      dialoguePurpose: "confront",
      anchorLine: true,
    };
    const shots = nineShotDrafts();
    shots[2] = { ...shots[2], contract } as VdDeepDraftShotDraft;
    const item = existingItem(1, { shotDrafts: shots });

    const result = applyManualDialogueEdit({
      item,
      shotNumber: 3,
      lines: [{ speaker: "Kai", line: "นี่คือบทพูดที่แก้ไขใหม่สำหรับช็อตนี้อย่างชัดเจน" }],
      editedByUserId: 7,
      editedAt: "2026-07-08T00:00:00.000Z",
    });

    const updatedShots = readItemShotDrafts(result.item)!;
    expect(updatedShots[2].contract).toEqual(contract);
  });

  it("recomputes the item's draftCompleteness from the FULL (updated) 9-shot list via the canonical estimator", () => {
    const shots = nineShotDrafts();
    const item = existingItem(1, { shotDrafts: shots });

    const result = applyManualDialogueEdit({
      item,
      shotNumber: 1,
      lines: [
        { line: "บทพูดที่ยาวขึ้นมากสำหรับช็อตแรกเพื่อให้ระยะเวลาพูดเปลี่ยนแปลงไปอย่างชัดเจนแน่นอน" },
        { line: "และอีกหนึ่งประโยคเพื่อเพิ่มเวลาพูดโดยรวมของช็อตนี้ให้มากขึ้นไปอีก" },
      ],
      editedByUserId: 1,
    });

    const updatedShots = readItemShotDrafts(result.item)!;
    const expectedCompleteness = computeDraftCompleteness(updatedShots);
    expect(readItemDraftCompleteness(result.item)).toEqual(expectedCompleteness);

    // Sanity: the recomputed total genuinely reflects the new (longer) lines
    // — not a stale/cached value from before the edit.
    const originalCompleteness = computeDraftCompleteness(shots);
    expect(expectedCompleteness.estimatedSpeechSeconds).not.toBeCloseTo(
      originalCompleteness.estimatedSpeechSeconds,
      5,
    );
  });

  it("speaker is optional — stores a non-empty placeholder so readItemShotDrafts keeps parsing the WHOLE item", () => {
    const item = existingItem(1, { shotDrafts: nineShotDrafts() });

    const result = applyManualDialogueEdit({
      item,
      shotNumber: 4,
      lines: [{ line: "บทพูดที่ไม่มีการระบุชื่อผู้พูดเลยสำหรับช็อตนี้" }],
      editedByUserId: 1,
    });

    const updatedShots = readItemShotDrafts(result.item);
    expect(updatedShots).not.toBeNull();
    expect(updatedShots![3].dialogue_lines[0].speaker).toBe(VD_MANUAL_DIALOGUE_EDIT_UNSPECIFIED_SPEAKER);
  });

  it("strips a contradictory silence_intent and sets silenceIntentRemoved: true when at least one line is submitted", () => {
    const shots = nineShotDrafts();
    shots[4] = { shot_number: 5, summary: "Establishing shot", dialogue_lines: [], silence_intent: "establishing" };
    const item = existingItem(1, { shotDrafts: shots });

    const result = applyManualDialogueEdit({
      item,
      shotNumber: 5,
      lines: [{ speaker: "Aria", line: "จริงๆแล้วช็อตนี้มีบทพูดด้วยนะ" }],
      editedByUserId: 1,
    });

    expect(result.silenceIntentRemoved).toBe(true);
    const updatedShots = readItemShotDrafts(result.item)!;
    expect(updatedShots[4].silence_intent).toBeUndefined();
    expect("silence_intent" in updatedShots[4]).toBe(false);
  });

  it("keeps silence_intent and silenceIntentRemoved: false when the submitted lines array is empty", () => {
    const shots = nineShotDrafts();
    shots[4] = { shot_number: 5, summary: "Establishing shot", dialogue_lines: [], silence_intent: "establishing" };
    const item = existingItem(1, { shotDrafts: shots });

    const result = applyManualDialogueEdit({ item, shotNumber: 5, lines: [], editedByUserId: 1 });

    expect(result.silenceIntentRemoved).toBe(false);
    const updatedShots = readItemShotDrafts(result.item)!;
    expect(updatedShots[4].silence_intent).toBe("establishing");
    expect(updatedShots[4].dialogue_lines).toEqual([]);
  });

  it("surfaces speakabilityWarnings for a wrapping-quotes fixture WITHOUT auto-cleaning the stored line (real bad-data fixture)", () => {
    const item = existingItem(1, { shotDrafts: nineShotDrafts() });

    const result = applyManualDialogueEdit({
      item,
      shotNumber: 1,
      lines: [{ speaker: "หนูนา", line: "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”" }],
      editedByUserId: 1,
    });

    // Stored VERBATIM — wrapping quotes are NOT stripped in storage.
    const updatedShots = readItemShotDrafts(result.item)!;
    expect(updatedShots[0].dialogue_lines).toEqual([
      { speaker: "หนูนา", line: "“ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม”", delivery: undefined },
    ]);

    // Reported (not applied) so the client can offer the cleaned suggestion.
    expect(result.speakabilityWarnings).toEqual([
      {
        lineIndex: 0,
        violations: [{ kind: "wrapping_quotes", found: "“”" }],
        cleanedSuggestion: {
          speaker: "หนูนา",
          line: "ยายทวดจัน…วันนี้อย่าหลงนะ เราต้องทำตามกติกาเหมือนเดิม",
          delivery: undefined,
        },
      },
    ]);
  });

  it("manualDialogueEdit stamp accumulates shotNumbers ACROSS TWO edits, deduping a shot edited twice", () => {
    const item = existingItem(1, { shotDrafts: nineShotDrafts() });

    const first = applyManualDialogueEdit({
      item,
      shotNumber: 2,
      lines: [{ line: "บทพูดที่หนึ่งสำหรับช็อตสองที่ยาวพอสมควรสำหรับการทดสอบ" }],
      editedByUserId: 7,
      editedAt: "2026-07-08T00:00:00.000Z",
    });
    expect(readItemManualDialogueEdit(first.item)).toEqual({
      editedAt: "2026-07-08T00:00:00.000Z",
      editedByUserId: 7,
      shotNumbers: [2],
    });

    const second = applyManualDialogueEdit({
      item: first.item,
      shotNumber: 5,
      lines: [{ line: "บทพูดที่สองสำหรับช็อตห้าที่ยาวพอสมควรสำหรับการทดสอบ" }],
      editedByUserId: 9,
      editedAt: "2026-07-08T01:00:00.000Z",
    });
    expect(readItemManualDialogueEdit(second.item)).toEqual({
      editedAt: "2026-07-08T01:00:00.000Z",
      editedByUserId: 9,
      shotNumbers: [2, 5],
    });

    // Editing shot 2 again does not duplicate it in the accumulated array.
    const third = applyManualDialogueEdit({
      item: second.item,
      shotNumber: 2,
      lines: [{ line: "บทพูดที่สามแก้ไขช็อตสองอีกครั้งสำหรับการทดสอบ" }],
      editedByUserId: 9,
      editedAt: "2026-07-08T02:00:00.000Z",
    });
    expect(readItemManualDialogueEdit(third.item)?.shotNumbers).toEqual([2, 5]);
  });

  it("stamps appliedIdempotencyKeys and accumulates it across edits carrying a NEW key each time", () => {
    const item = existingItem(1, { shotDrafts: nineShotDrafts() });

    const first = applyManualDialogueEdit({
      item,
      shotNumber: 1,
      lines: [{ line: "บรรทัดแรกที่ยาวพอสมควรสำหรับการทดสอบ idempotency" }],
      editedByUserId: 1,
      idempotencyKey: "key-a",
    });
    expect(readItemManualDialogueEdit(first.item)?.appliedIdempotencyKeys).toEqual(["key-a"]);

    const second = applyManualDialogueEdit({
      item: first.item,
      shotNumber: 2,
      lines: [{ line: "บรรทัดที่สองที่ยาวพอสมควรสำหรับการทดสอบ idempotency" }],
      editedByUserId: 1,
      idempotencyKey: "key-b",
    });
    expect(readItemManualDialogueEdit(second.item)?.appliedIdempotencyKeys).toEqual(["key-a", "key-b"]);
  });

  it("omits appliedIdempotencyKeys entirely when no idempotencyKey was ever provided", () => {
    const item = existingItem(1, { shotDrafts: nineShotDrafts() });
    const result = applyManualDialogueEdit({
      item,
      shotNumber: 1,
      lines: [{ line: "บรรทัดที่ไม่มี idempotency key เลยสำหรับช็อตนี้" }],
      editedByUserId: 1,
    });
    expect(readItemManualDialogueEdit(result.item)?.appliedIdempotencyKeys).toBeUndefined();
  });

  it("throws ManualDialogueEditNoDraftError when the item has no shotDrafts at all", () => {
    const item = existingItem(1); // plain generateStoryBible-only item, no deep draft ever run
    expect(() =>
      applyManualDialogueEdit({ item, shotNumber: 1, lines: [], editedByUserId: 1 }),
    ).toThrow(ManualDialogueEditNoDraftError);
  });

  it("throws ManualDialogueEditNoDraftError when shotNumber has no matching shot in the item's shotDrafts", () => {
    // Schema-valid (length 9) but missing shot_number 9 — shot 1 appears twice instead.
    const shots = nineShotDrafts();
    shots[8] = { ...shots[0] };
    const item = existingItem(1, { shotDrafts: shots });

    expect(() =>
      applyManualDialogueEdit({ item, shotNumber: 9, lines: [], editedByUserId: 1 }),
    ).toThrow(ManualDialogueEditNoDraftError);
  });

  it("never mutates the input item", () => {
    const shots = nineShotDrafts();
    const item = existingItem(1, { shotDrafts: shots });
    const snapshot = JSON.parse(JSON.stringify(item));

    applyManualDialogueEdit({
      item,
      shotNumber: 1,
      lines: [{ line: "บทพูดใหม่ที่ไม่ควรกระทบต้นฉบับเดิมเลยสำหรับช็อตนี้" }],
      editedByUserId: 1,
    });

    expect(item).toEqual(snapshot);
  });
});
