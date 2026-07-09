/**
 * Dramaturgy critic (W11.5, added 2026-07-08) — coverage for
 * `verticalDramaStoryBible.ts`'s LLM-backed halves: `critiqueSeasonDrafts`
 * (ONE critic call, deterministic facts injected into the prompt) and
 * `applySeasonCritique` (batched revise calls + the deterministic-findings
 * regression guard). This is a SEPARATE, on-demand pass — it never runs
 * inside, and never modifies, the premium fan-out/judge/revise/sweep
 * pipeline (see `verticalDramaStoryBible.premiumDeepDraft.test.ts`, which
 * stays untouched and green).
 *
 * Mirrors `verticalDramaStoryBible.premiumDeepDraft.test.ts`'s mocking
 * convention exactly (mock `enabledLlmModels`/`intelligentModelSelector`/
 * `creditService`/`llmRouter`/`_core/logger`, import the real service) since
 * `applySeasonCritique` reuses that file's own `callPremiumRevise`/
 * `gateRawPremiumEpisodes` machinery internally.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLoadEnabledLlmModelRows } = vi.hoisted(() => ({
  mockLoadEnabledLlmModelRows: vi.fn(async () => [] as unknown[]),
}));
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: mockLoadEnabledLlmModelRows,
}));

const { mockSelectBestLlmModel } = vi.hoisted(() => ({
  mockSelectBestLlmModel: vi.fn((): string | null => null),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: mockSelectBestLlmModel,
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
  critiqueSeasonDrafts,
  applySeasonCritique,
  analyzeSeasonDramaturgy,
  NoDeepDraftedEpisodesError,
  InsufficientCreditsError,
  VdSchemaValidationError,
  VD_SEASON_CRITIQUE_APPLY_SCORECARD_ROUND,
  VD_SEASON_CRITIQUE_MIN_CONTEXT_LENGTH,
  type StoredEpisodeBreakdownItem,
} from "../verticalDramaStoryBible";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function draftedItem(
  episodeNumber: number,
  lines: Array<{ speaker: string; line: string }>,
  extra: Record<string, unknown> = {},
): StoredEpisodeBreakdownItem {
  const shotDrafts = Array.from({ length: 9 }, (_, i) => ({
    shot_number: i + 1,
    summary: `Shot ${i + 1}`,
    dialogue_lines: i < lines.length ? [lines[i]] : [],
  }));
  return {
    episodeNumber,
    workingTitle: `Episode ${episodeNumber}`,
    logline: `Logline ${episodeNumber}`,
    keyBeats: ["Beat"],
    shotDrafts,
    ...extra,
  } as StoredEpisodeBreakdownItem;
}

function mockLlmResponseOnce(payload: unknown, usage = { prompt_tokens: 100, completion_tokens: 200 }) {
  mockExecuteWithFallback.mockResolvedValueOnce({
    type: "success",
    response: { choices: [{ message: { content: JSON.stringify(payload) } }], usage },
  });
}

function userPromptOf(callIndex: number): string {
  const args = mockExecuteWithFallback.mock.calls[callIndex][0];
  return args.messages.find((m: { role: string }) => m.role === "user").content;
}

function critiqueResponsePayload(overrides: Record<string, unknown> = {}) {
  return {
    overallScore: 7,
    strengths: ["จังหวะเปิดเรื่องดึงดูดดี"],
    findings: [
      {
        kind: "protagonist_no_stake",
        evidenceEpisodes: [1],
        problem: "พระเอกไม่มีเหตุผลส่วนตัวในการเข้าไปพัวพันกับเรื่องนี้",
        fixInstruction: "เพิ่มเหตุผลส่วนตัวให้พระเอกตั้งแต่ตอนแรก",
      },
    ],
    ...overrides,
  };
}

function reviseResponsePayload(
  episodes: Array<{
    episodeNumber: number;
    shotDraftsOverride?: unknown[];
    extra?: Record<string, unknown>;
  }>,
) {
  return {
    episodeBreakdown: episodes.map((e) => ({
      episodeNumber: e.episodeNumber,
      workingTitle: `Episode ${e.episodeNumber}`,
      logline: `Logline ${e.episodeNumber}`,
      keyBeats: ["Beat"],
      shotDrafts:
        e.shotDraftsOverride ??
        Array.from({ length: 9 }, (_, i) => ({
          shot_number: i + 1,
          summary: `Revised shot ${i + 1}`,
          dialogue_lines: [{ speaker: "เอก", line: `บทพูดที่แก้ไขแล้วของช็อต ${i + 1}` }],
        })),
      cliffhanger_line: `Revised cliffhanger ${e.episodeNumber}`,
      ...e.extra,
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockLoadEnabledLlmModelRows.mockResolvedValue([]);
  mockSelectBestLlmModel.mockReturnValue(null);
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
});

/* -------------------------------------------------------------------------- */
/* critiqueSeasonDrafts                                                       */
/* -------------------------------------------------------------------------- */

describe("critiqueSeasonDrafts", () => {
  it("throws NoDeepDraftedEpisodesError and makes no LLM call when nothing is deep-drafted yet", async () => {
    const items: StoredEpisodeBreakdownItem[] = [
      { episodeNumber: 1, workingTitle: "E1", logline: "L1", keyBeats: ["b"] } as StoredEpisodeBreakdownItem,
    ];
    await expect(
      critiqueSeasonDrafts({
        userId: 1,
        seriesId: 10,
        title: "Test Series",
        locale: "th",
        items,
      }),
    ).rejects.toBeInstanceOf(NoDeepDraftedEpisodesError);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError and makes no LLM call when the caller lacks credits", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    await expect(
      critiqueSeasonDrafts({ userId: 1, seriesId: 10, title: "T", locale: "th", items }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("injects the deterministic findings into the prompt as facts, makes exactly ONE call, and deducts real credits", async () => {
    // Deterministic finale_no_price_paid WILL fire on this fixture (no price_paid set).
    const items = [draftedItem(2, [{ speaker: "เอก", line: "จบเรื่องแบบไม่มีอะไรเสีย" }])];
    const expectedDeterministic = analyzeSeasonDramaturgy(items, []);
    expect(expectedDeterministic.some((f) => f.kind === "finale_no_price_paid")).toBe(true);

    mockLlmResponseOnce(critiqueResponsePayload());

    const result = await critiqueSeasonDrafts({
      userId: 7,
      tenantId: "tenant-1",
      seriesId: 10,
      title: "Test Series",
      locale: "th",
      genre: "romance",
      tone: "dramatic",
      items,
    });

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
    expect(userPromptOf(0)).toContain("finale_no_price_paid");
    expect(userPromptOf(0)).toContain("Test Series");

    expect(result.critique.overallScore).toBe(7);
    expect(result.deterministicFindings).toEqual(expectedDeterministic);
    expect(result.creditsUsed).toBe(3);
    expect(result.model).toBeTruthy();

    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits.mock.calls[0][0]).toMatchObject({
      userId: 7,
      tenantId: "tenant-1",
      amount: 3,
      metadata: expect.objectContaining({ seriesId: 10, feature: "vertical_drama_series_season_critique" }),
    });
  });

  it("rejects a critic response whose finding kind is outside the 8-golden-findings-plus-other enum (after the retry also fails)", async () => {
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    const badPayload = critiqueResponsePayload({
      findings: [{ kind: "not_a_real_kind", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
    });
    mockLlmResponseOnce(badPayload);
    mockLlmResponseOnce(badPayload); // the one automatic retry also fails validation.

    await expect(
      critiqueSeasonDrafts({ userId: 1, seriesId: 10, title: "T", locale: "th", items }),
    ).rejects.toBeInstanceOf(VdSchemaValidationError);
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  /* ------------------------------------------------------------------------ */
  /* Capability-based model selection (task #29) — the critique call MUST     */
  /* route through `resolveSeasonCritiqueModel` (large context + thinking),   */
  /* never a hardcoded model id.                                              */
  /* ------------------------------------------------------------------------ */

  it("uses the capability-selected model (large context + thinking) for the critique call when an enabled model qualifies", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([{ modelId: "big-context-thinker" } as any]);
    mockSelectBestLlmModel.mockReturnValue("big-context-thinker");
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    mockLlmResponseOnce(critiqueResponsePayload());

    const result = await critiqueSeasonDrafts({ userId: 1, seriesId: 10, title: "T", locale: "th", items });

    expect(result.model).toBe("big-context-thinker");
    expect(mockExecuteWithFallback.mock.calls[0][0]).toMatchObject({ model: "big-context-thinker" });
    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
      {
        supportsThinking: true,
        supportsStructuredOutputs: true,
        contextLength: VD_SEASON_CRITIQUE_MIN_CONTEXT_LENGTH,
      },
      expect.any(Array),
    );
  });

  it("falls back to resolveStoryBibleModel's model when no enabled model qualifies for the capability requirements", async () => {
    // A model IS enabled, but `selectBestLlmModel` (shared mock — also used
    // internally by `resolveStoryBibleModel`'s own fallback attempt) reports
    // no row meets the capability bar, so `resolveSeasonCritiqueModel` falls
    // through to `resolveStoryBibleModel()`, which — with the SAME single
    // enabled row and `selectBestLlmModel` still returning null — resolves to
    // that row's own `modelId` (its own documented fallback chain).
    mockLoadEnabledLlmModelRows.mockResolvedValue([{ modelId: "small-context-model", priority: 1 } as any]);
    mockSelectBestLlmModel.mockReturnValue(null);
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    mockLlmResponseOnce(critiqueResponsePayload());

    const result = await critiqueSeasonDrafts({ userId: 1, seriesId: 10, title: "T", locale: "th", items });

    expect(result.model).toBe("small-context-model");
  });

  it("falls back to the gpt-4o-mini last resort when NO model is enabled at all (unchanged pre-existing behavior)", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([]);
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    mockLlmResponseOnce(critiqueResponsePayload());

    const result = await critiqueSeasonDrafts({ userId: 1, seriesId: 10, title: "T", locale: "th", items });

    expect(result.model).toBe("gpt-4o-mini");
  });
});

/* -------------------------------------------------------------------------- */
/* applySeasonCritique                                                        */
/* -------------------------------------------------------------------------- */

describe("applySeasonCritique", () => {
  it("returns immediately with zero calls when none of the selected findings' evidence episodes are drafted", async () => {
    const items = [{ episodeNumber: 1, workingTitle: "E1", logline: "L1", keyBeats: ["b"] } as StoredEpisodeBreakdownItem];
    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [{ kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
    });
    expect(result).toEqual({
      updatedItems: items,
      updatedEpisodeNumbers: [],
      rejected: [],
      creditsUsed: 0,
      callsMade: 0,
      model: "",
    });
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("throws InsufficientCreditsError when the caller lacks credits for the estimate", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    await expect(
      applySeasonCritique({
        userId: 1,
        seriesId: 10,
        title: "T",
        locale: "th",
        items,
        findings: [{ kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });

  it("happy path: revises the affected episode, accepts a clean revision, deducts real credits, and bumps a PRIOR premium scorecard's judgedAtRound", async () => {
    const priorScorecard = {
      hook_strength: 4,
      reversal_sharpness: 4,
      emotion_variety: 4,
      dialogue_naturalness: 4,
      pacing: 4,
      cliffhanger_strength: 4,
      continuity_with_recap: 4,
      season_cohesion: 4,
      overall: 4,
      judgedAtRound: 0,
    };
    const items = [
      draftedItem(1, [{ speaker: "เอก", line: "เราต้องรีบไปตอนนี้เลย" }], {
        price_paid: "เอกต้องเสียตำแหน่งงานเพื่อแลกกับความจริง",
        draftScorecard: priorScorecard,
      }),
    ];
    mockLlmResponseOnce(reviseResponsePayload([{ episodeNumber: 1 }]));

    const result = await applySeasonCritique({
      userId: 3,
      tenantId: "tenant-1",
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [
        { kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "บทพูดตรงเกินไป", fixInstruction: "เขียนบทพูดให้เป็นธรรมชาติขึ้น" },
      ],
    });

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
    expect(result.updatedEpisodeNumbers).toEqual([1]);
    expect(result.rejected).toEqual([]);
    expect(result.callsMade).toBe(1);
    expect(result.creditsUsed).toBe(3);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);

    const updated = result.updatedItems.find((i) => i.episodeNumber === 1)!;
    expect((updated as { cliffhanger_line?: string }).cliffhanger_line).toBe("Revised cliffhanger 1");
    expect((updated as { draftScorecard?: typeof priorScorecard }).draftScorecard).toMatchObject({
      overall: 4, // score VALUES untouched — this pass never re-judges.
      judgedAtRound: VD_SEASON_CRITIQUE_APPLY_SCORECARD_ROUND,
    });
    // price_paid carried forward via the merge fallback (the revise response never re-sent it).
    expect((updated as { price_paid?: string }).price_paid).toBe("เอกต้องเสียตำแหน่งงานเพื่อแลกกับความจริง");
  });

  it("does NOT fabricate a draftScorecard for a standard-mode episode that never had one", async () => {
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    mockLlmResponseOnce(reviseResponsePayload([{ episodeNumber: 1 }]));

    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [{ kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
    });

    const updated = result.updatedItems.find((i) => i.episodeNumber === 1)!;
    expect("draftScorecard" in updated).toBe(false);
  });

  it("REGRESSION GUARD: rejects a revision that introduces a NEW deterministic finding (on-the-nose dialogue) the episode did not already have, keeping the prior content", async () => {
    const cleanLines = { speaker: "เอก", line: "เราต้องรีบไปตอนนี้เลยนะ" };
    const items = [
      draftedItem(1, [cleanLines], { price_paid: "เอกต้องเสียเงินเก็บทั้งชีวิต" }),
    ];
    // Baseline must be clean (no on_the_nose_dialogue) for this to be a genuine regression.
    const baseline = analyzeSeasonDramaturgy(items, []);
    expect(baseline.some((f) => f.kind === "on_the_nose_dialogue")).toBe(false);

    // The revised draft is heavy with abstract words -> triggers on_the_nose_dialogue on episode 1.
    const abstractHeavyShots = Array.from({ length: 9 }, (_, i) => ({
      shot_number: i + 1,
      summary: `Revised shot ${i + 1}`,
      dialogue_lines: [
        {
          speaker: "เอก",
          line: i < 2 ? "นี่คือความจริงและกติกาที่ทุกคนต้องยอมรับ" : `บทพูดปกติของช็อต ${i + 1}`,
        },
      ],
    }));
    mockLlmResponseOnce(
      reviseResponsePayload([{ episodeNumber: 1, shotDraftsOverride: abstractHeavyShots }]),
    );

    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [
        { kind: "other", evidenceEpisodes: [1], problem: "จังหวะช้าไปหน่อย", fixInstruction: "เร่งจังหวะให้เร็วขึ้น" },
      ],
    });

    expect(result.updatedEpisodeNumbers).toEqual([]);
    expect(result.rejected).toEqual([
      { episodeNumber: 1, reason: expect.stringContaining("ปัญหาใหม่") },
    ]);
    // The prior (unrevised) item is preserved byte-for-byte in updatedItems.
    const preserved = result.updatedItems.find((i) => i.episodeNumber === 1)!;
    expect(preserved).toBe(items[0]);
    // Credits/calls are still accounted for — the LLM call itself happened and cost real money.
    expect(result.callsMade).toBe(1);
    expect(result.creditsUsed).toBe(3);
  });

  it("REGRESSION GUARD: rejects a revision that introduces a NEW antagonist_tactic_repetition finding (a fresh 3-episode 'ขู่' streak the episode wasn't part of before)", async () => {
    // Baseline: "ขู่" appears at episodes 1, 3, 5 (never 3 in a row) — clean.
    // Episode 4 (the revision target) currently uses a DIFFERENT tactic.
    const items = [
      draftedItem(1, [{ speaker: "เอก", line: "บทของตอนหนึ่ง" }], { antagonist_tactics: ["ขู่"] }),
      draftedItem(2, [{ speaker: "เอก", line: "บทของตอนสอง" }], { antagonist_tactics: ["สลับเอกสาร"] }),
      draftedItem(3, [{ speaker: "เอก", line: "บทของตอนสาม" }], { antagonist_tactics: ["ขู่"] }),
      draftedItem(4, [{ speaker: "เอก", line: "บทของตอนสี่" }], { antagonist_tactics: ["ปิดปาก"] }),
      draftedItem(5, [{ speaker: "เอก", line: "บทของตอนห้า" }], { antagonist_tactics: ["ขู่"] }),
    ];
    const baseline = analyzeSeasonDramaturgy(items, []);
    expect(baseline.some((f) => f.kind === "antagonist_tactic_repetition")).toBe(false);

    // The revised episode 4 now ALSO uses "ขู่" — creating a fresh 3, 4, 5 streak.
    mockLlmResponseOnce(
      reviseResponsePayload([{ episodeNumber: 4, extra: { antagonist_tactics: ["ขู่"] } }]),
    );

    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [
        { kind: "other", evidenceEpisodes: [4], problem: "จังหวะช้าไปหน่อย", fixInstruction: "เร่งจังหวะให้เร็วขึ้น" },
      ],
    });

    expect(result.updatedEpisodeNumbers).toEqual([]);
    expect(result.rejected).toEqual([{ episodeNumber: 4, reason: expect.stringContaining("ปัญหาใหม่") }]);
    const preserved = result.updatedItems.find((i) => i.episodeNumber === 4)!;
    expect(preserved).toBe(items[3]); // prior (unrevised) content kept byte-for-byte.
  });

  it("splits affected episodes across at most 2 batched revise calls, grouping feedback per episode", async () => {
    const items = [1, 2, 3, 4].map((n) => draftedItem(n, [{ speaker: "เอก", line: `บทของตอน ${n}` }]));
    mockLlmResponseOnce(reviseResponsePayload([{ episodeNumber: 1 }, { episodeNumber: 2 }]));
    mockLlmResponseOnce(reviseResponsePayload([{ episodeNumber: 3 }, { episodeNumber: 4 }]));

    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [
        { kind: "on_the_nose_dialogue", evidenceEpisodes: [1, 2, 3, 4], problem: "p", fixInstruction: "f" },
      ],
    });

    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    expect(result.updatedEpisodeNumbers).toEqual([1, 2, 3, 4]);
    expect(result.callsMade).toBe(2);
    expect(result.creditsUsed).toBe(6);
  });

  it("only revises episodes named in the SELECTED findings, ignoring evidence episodes from findings the caller did not pass", async () => {
    const items = [1, 2].map((n) => draftedItem(n, [{ speaker: "เอก", line: `บทของตอน ${n}` }]));
    mockLlmResponseOnce(reviseResponsePayload([{ episodeNumber: 1 }]));

    await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [{ kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
    });

    const revisePrompt = userPromptOf(0);
    expect(revisePrompt).toContain("Logline for episode 1".replace("for episode 1", "1")); // sanity: contains episode 1 content
    expect(revisePrompt).toContain("Episode 1");
    expect(revisePrompt).not.toContain("Episode 2");
  });

  it("rejects an episode the revise response never covered, without throwing", async () => {
    const items = [1, 2].map((n) => draftedItem(n, [{ speaker: "เอก", line: `บทของตอน ${n}` }]));
    mockLlmResponseOnce(reviseResponsePayload([{ episodeNumber: 1 }])); // episode 2 requested but never returned.

    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [
        { kind: "on_the_nose_dialogue", evidenceEpisodes: [1, 2], problem: "p", fixInstruction: "f" },
      ],
    });

    expect(result.updatedEpisodeNumbers).toEqual([1]);
    expect(result.rejected).toEqual([{ episodeNumber: 2, reason: expect.any(String) }]);
  });

  it("rejects every episode in a chunk (never throws) when that chunk's LLM call fails outright", async () => {
    const items = [1, 2].map((n) => draftedItem(n, [{ speaker: "เอก", line: `บทของตอน ${n}` }]));
    mockExecuteWithFallback.mockResolvedValueOnce({ type: "error", error: "provider is down" });
    // executeJsonPlanningCallWithRetry's own retry attempt (still fails).
    mockExecuteWithFallback.mockResolvedValueOnce({ type: "error", error: "provider is down" });

    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [
        { kind: "on_the_nose_dialogue", evidenceEpisodes: [1, 2], problem: "p", fixInstruction: "f" },
      ],
    });

    expect(result.updatedEpisodeNumbers).toEqual([]);
    expect(result.rejected).toEqual([
      { episodeNumber: 1, reason: expect.any(String) },
      { episodeNumber: 2, reason: expect.any(String) },
    ]);
    expect(result.callsMade).toBe(0);
    expect(result.creditsUsed).toBe(0);
  });

  /* ------------------------------------------------------------------------ */
  /* Capability-based model selection (task #29) — owner-required: the        */
  /* apply-fixes call MUST route through the SAME `resolveSeasonCritiqueModel` */
  /* (large context + thinking) the critique call uses, never a hardcoded id. */
  /* ------------------------------------------------------------------------ */

  it("uses the capability-selected model (large context + thinking) for the apply-fixes call too", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([{ modelId: "big-context-thinker" } as any]);
    mockSelectBestLlmModel.mockReturnValue("big-context-thinker");
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    mockLlmResponseOnce(reviseResponsePayload([{ episodeNumber: 1 }]));

    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [{ kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
    });

    expect(result.model).toBe("big-context-thinker");
    expect(mockExecuteWithFallback.mock.calls[0][0]).toMatchObject({ model: "big-context-thinker" });
    expect(mockSelectBestLlmModel).toHaveBeenCalledWith(
      {
        supportsThinking: true,
        supportsStructuredOutputs: true,
        contextLength: VD_SEASON_CRITIQUE_MIN_CONTEXT_LENGTH,
      },
      expect.any(Array),
    );
  });

  it("falls back to resolveStoryBibleModel's model for the apply-fixes call when no enabled model qualifies for the capability requirements", async () => {
    mockLoadEnabledLlmModelRows.mockResolvedValue([{ modelId: "small-context-model", priority: 1 } as any]);
    mockSelectBestLlmModel.mockReturnValue(null);
    const items = [draftedItem(1, [{ speaker: "เอก", line: "เริ่มเรื่อง" }])];
    mockLlmResponseOnce(reviseResponsePayload([{ episodeNumber: 1 }]));

    const result = await applySeasonCritique({
      userId: 1,
      seriesId: 10,
      title: "T",
      locale: "th",
      items,
      findings: [{ kind: "on_the_nose_dialogue", evidenceEpisodes: [1], problem: "p", fixInstruction: "f" }],
    });

    expect(result.model).toBe("small-context-model");
  });
});
