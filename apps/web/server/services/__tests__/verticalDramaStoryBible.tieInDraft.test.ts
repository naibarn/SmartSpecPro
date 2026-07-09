/**
 * Season-level product tie-in DRAFT awareness (task #22, spec §7.7.2/§7.7.3,
 * added 2026-07-09) — coverage for `verticalDramaStoryBible.ts`'s
 * `tieInDraftContext` threading into `buildDeepDraftPrompts` (standard +
 * premium fan-out), the `tie_in` shot-marking schema addition,
 * `reconcileTieInDraftMarking`, the premium `tie_in_naturalness` judge
 * dimension, and `analyzeSeasonDramaturgy`'s new `tie_in_distribution`
 * finding.
 *
 * Mirrors `verticalDramaStoryBible.deepStoryDrafts.test.ts`/
 * `verticalDramaStoryBible.premiumDeepDraft.test.ts`'s mocking convention
 * exactly (mock `enabledLlmModels`/`intelligentModelSelector`/
 * `creditService`/`llmRouter`/`_core/logger`, import the real service).
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
  reconcileTieInDraftMarking,
  analyzeSeasonDramaturgy,
  VD_DEEP_DRAFT_SHOTS_PER_EPISODE,
  VD_PREMIUM_DRAFT_SCORE_DIMENSIONS,
  type VdDeepDraftShotDraft,
  type StoredEpisodeBreakdownItem,
  type VdTieInDraftContext,
} from "../verticalDramaStoryBible";

/* -------------------------------------------------------------------------- */
/* Fixtures — mirrors the sibling deep-draft test files' own fixtures         */
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
    dialogue_lines: [{ speaker: "Aria", line: `บทพูดช็อต ${shotNumber} ที่ยาวพอสมควรสำหรับการทดสอบ` }],
    ...overrides,
  };
}

function nineShotDrafts(): VdDeepDraftShotDraft[] {
  return Array.from({ length: VD_DEEP_DRAFT_SHOTS_PER_EPISODE }, (_, i) => shotDraft(i + 1)) as VdDeepDraftShotDraft[];
}

/** Nine shots, exactly one (`markedShotNumber`) carrying `tie_in.has_product_moment: true`. */
function nineShotDraftsWithTieIn(markedShotNumber: number): VdDeepDraftShotDraft[] {
  return Array.from({ length: VD_DEEP_DRAFT_SHOTS_PER_EPISODE }, (_, i) => {
    const shotNumber = i + 1;
    return shotDraft(
      shotNumber,
      shotNumber === markedShotNumber
        ? { tie_in: { has_product_moment: true, benefit_line: "ใช้งานง่ายทุกเช้า" } }
        : {},
    );
  }) as VdDeepDraftShotDraft[];
}

function chunkResponsePayload(
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
      cliffhanger_line: `Cliffhanger for episode ${ep}`,
    })),
    open_threads: [],
  };
}

function candidateChunkPayload(tag: string, episodeNumbers: number[], opts: { shotDraftsFor?: (ep: number) => unknown[] } = {}) {
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

const plannedTieInContext: VdTieInDraftContext = {
  productName: "Glow Serum",
  productCategory: "cosmetics",
  forbiddenClaims: ["รักษาสิว"],
  placements: [
    { episodeNumber: 1, placement: { planned: true, source: "planned", benefitFocus: "ผิวกระจ่างใส", intensity: "featured" } },
  ],
};

/* -------------------------------------------------------------------------- */
/* buildDeepDraftPrompts — tie-in draft context (standard mode)               */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — tie-in draft context prompt threading (task #22)", () => {
  it("omits ALL tie-in content when tieInDraftContext is absent (byte-identical to before task #22)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams());
    const sys = systemPromptOf(0);
    const user = userPromptOf(0);
    expect(sys).not.toContain("PRODUCT TIE-IN");
    expect(sys).not.toContain("tie_in");
    expect(user).not.toContain("productTieIn");
  });

  it("adds a PRODUCT TIE-IN system block naming the product + forbidden claims + the tie_in shot-shape suffix", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams({ tieInDraftContext: plannedTieInContext }));
    const sys = systemPromptOf(0);
    expect(sys).toContain("PRODUCT TIE-IN");
    expect(sys).toContain("Glow Serum");
    expect(sys).toContain("รักษาสิว");
    expect(sys).toContain('"tie_in": {"has_product_moment": boolean, "benefit_line": string}');
  });

  it("attaches a planned:true productTieIn payload (with benefit_focus/intensity) for a planned episode", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    await generateStoryBibleDeep(baseDeepParams({ tieInDraftContext: plannedTieInContext }));
    const user = userPromptOf(0);
    expect(user).toContain('"planned":true');
    expect(user).toContain("ผิวกระจ่างใส");
    expect(user).toContain("featured");
  });

  it("attaches a planned:false + 'no product' instruction for an episode NOT in the season plan", async () => {
    const unplannedContext: VdTieInDraftContext = {
      ...plannedTieInContext,
      placements: [{ episodeNumber: 2, placement: { planned: false, source: "planned" } }],
    };
    mockLlmResponseOnce(chunkResponsePayload([2]));
    await generateStoryBibleDeep(
      baseDeepParams({ episodes: [existingItem(2)], tieInDraftContext: unplannedContext }),
    );
    const user = userPromptOf(0);
    expect(user).toContain('"planned":false');
    expect(user).toContain("No product this episode");
  });
});

/* -------------------------------------------------------------------------- */
/* Shot draft schema — tie_in marking (additive/passthrough)                  */
/* -------------------------------------------------------------------------- */

describe("shot draft schema — tie_in marking (task #22)", () => {
  it("accepts and preserves a shot marked has_product_moment: true with a benefit_line", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1], { shotDraftsFor: () => nineShotDraftsWithTieIn(3) }));
    const result = await generateStoryBibleDeep(baseDeepParams({ tieInDraftContext: plannedTieInContext }));
    const shot3 = result.draftedItems[0].shotDrafts.find((s) => s.shot_number === 3);
    expect(shot3?.tie_in?.has_product_moment).toBe(true);
    expect(shot3?.tie_in?.benefit_line).toBe("ใช้งานง่ายทุกเช้า");
  });

  it("a legacy chunk response with no tie_in on any shot still parses fine (grandfather)", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    const result = await generateStoryBibleDeep(baseDeepParams());
    expect(result.draftedItems[0].shotDrafts.every((s) => s.tie_in === undefined)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* reconcileTieInDraftMarking — pure function                                 */
/* -------------------------------------------------------------------------- */

describe("reconcileTieInDraftMarking", () => {
  it("is a no-op when context is absent", () => {
    const result = reconcileTieInDraftMarking(
      [{ episodeNumber: 1, shotDrafts: nineShotDrafts() }],
      undefined,
    );
    expect(result).toEqual({ warnings: [], mismatchCount: 0 });
  });

  it("flags a PLANNED episode with no marked shot — episode-level (shotNumber 0)", () => {
    const context: VdTieInDraftContext = {
      productName: "X",
      forbiddenClaims: [],
      placements: [{ episodeNumber: 1, placement: { planned: true, source: "planned" } }],
    };
    const result = reconcileTieInDraftMarking(
      [{ episodeNumber: 1, shotDrafts: nineShotDrafts() }],
      context,
    );
    expect(result.mismatchCount).toBe(1);
    expect(result.warnings).toEqual([
      { episodeNumber: 1, shotNumber: 0, reason: "tie_in_placement_mismatch" },
    ]);
  });

  it("flags an UNPLANNED episode that has a marked shot anyway — names the offending shot", () => {
    const context: VdTieInDraftContext = {
      productName: "X",
      forbiddenClaims: [],
      placements: [{ episodeNumber: 1, placement: { planned: false, source: "planned" } }],
    };
    const result = reconcileTieInDraftMarking(
      [{ episodeNumber: 1, shotDrafts: nineShotDraftsWithTieIn(5) }],
      context,
    );
    expect(result.mismatchCount).toBe(1);
    expect(result.warnings).toEqual([
      { episodeNumber: 1, shotNumber: 5, reason: "tie_in_placement_mismatch" },
    ]);
  });

  it("no warning when a planned episode HAS a marked shot", () => {
    const context: VdTieInDraftContext = {
      productName: "X",
      forbiddenClaims: [],
      placements: [{ episodeNumber: 1, placement: { planned: true, source: "planned" } }],
    };
    const result = reconcileTieInDraftMarking(
      [{ episodeNumber: 1, shotDrafts: nineShotDraftsWithTieIn(2) }],
      context,
    );
    expect(result).toEqual({ warnings: [], mismatchCount: 0 });
  });

  it("no warning when an unplanned episode correctly has no marked shot", () => {
    const context: VdTieInDraftContext = {
      productName: "X",
      forbiddenClaims: [],
      placements: [{ episodeNumber: 1, placement: { planned: false, source: "planned" } }],
    };
    const result = reconcileTieInDraftMarking(
      [{ episodeNumber: 1, shotDrafts: nineShotDrafts() }],
      context,
    );
    expect(result).toEqual({ warnings: [], mismatchCount: 0 });
  });
});

describe("generateStoryBibleDeep — tie-in reconciliation end-to-end (standard mode)", () => {
  it("pushes tie_in_placement_mismatch into warnings and sets tieInMismatchCount when a planned episode's draft has no marked shot", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1])); // no shot marked
    const result = await generateStoryBibleDeep(baseDeepParams({ tieInDraftContext: plannedTieInContext }));
    expect(result.tieInMismatchCount).toBe(1);
    expect(result.warnings).toContainEqual({ episodeNumber: 1, shotNumber: 0, reason: "tie_in_placement_mismatch" });
    // Reconciliation NEVER fails the run — the chunk still succeeded.
    expect(result.partial).toBe(false);
    expect(result.draftedItems).toHaveLength(1);
  });

  it("tieInMismatchCount is 0 (not undefined) when every planned episode is correctly marked", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1], { shotDraftsFor: () => nineShotDraftsWithTieIn(4) }));
    const result = await generateStoryBibleDeep(baseDeepParams({ tieInDraftContext: plannedTieInContext }));
    expect(result.tieInMismatchCount).toBe(0);
  });

  it("tieInMismatchCount stays undefined when tieInDraftContext was not supplied", async () => {
    mockLlmResponseOnce(chunkResponsePayload([1]));
    const result = await generateStoryBibleDeep(baseDeepParams());
    expect(result.tieInMismatchCount).toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Premium mode — tie_in_naturalness judge dimension (task #22)               */
/* -------------------------------------------------------------------------- */

describe("generateStoryBibleDeep — premium mode tie_in_naturalness judge dimension (task #22)", () => {
  it("requests tie_in_naturalness in the judge prompt + marks the episode hasPlannedTieIn when a chunk has a placed episode", async () => {
    mockLlmResponseOnce(candidateChunkPayload("a", [1]));
    mockLlmResponseOnce(candidateChunkPayload("b", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c", [1]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1, overrides: { tie_in_naturalness: 5 } },
        { candidateIndex: 1, episodeNumber: 1, overrides: { tie_in_naturalness: 5 } },
        { candidateIndex: 2, episodeNumber: 1, overrides: { tie_in_naturalness: 5 } },
      ]),
    );
    // Season sweep (index 4) — an unmocked call resolves `undefined` and is
    // caught internally by `runPremiumSeasonSweep`'s own try/catch, so it is
    // safe to leave unmocked here (mirrors sibling premium tests that don't
    // care about the sweep outcome).

    const result = await generateStoryBibleDeep(
      baseDeepParams({ mode: "premium", tieInDraftContext: plannedTieInContext }),
    );

    const judgeSystemPrompt = systemPromptOf(3);
    const judgeUserPrompt = userPromptOf(3);
    expect(judgeSystemPrompt).toContain("tie_in_naturalness");
    expect(judgeUserPrompt).toContain('"hasPlannedTieIn":true');
    expect(result.draftedItems[0].draftScorecard?.tie_in_naturalness).toBe(5);
  });

  it("omits tie_in_naturalness from the judge prompt entirely when no episode in the run is placed", async () => {
    mockLlmResponseOnce(candidateChunkPayload("a", [1]));
    mockLlmResponseOnce(candidateChunkPayload("b", [1]));
    mockLlmResponseOnce(candidateChunkPayload("c", [1]));
    mockLlmResponseOnce(
      judgeResponsePayload([
        { candidateIndex: 0, episodeNumber: 1 },
        { candidateIndex: 1, episodeNumber: 1 },
        { candidateIndex: 2, episodeNumber: 1 },
      ]),
    );

    await generateStoryBibleDeep(baseDeepParams({ mode: "premium" }));

    const judgeSystemPrompt = systemPromptOf(3);
    const judgeUserPrompt = userPromptOf(3);
    expect(judgeSystemPrompt).not.toContain("tie_in_naturalness");
    expect(judgeUserPrompt).not.toContain("hasPlannedTieIn");
  });
});

/* -------------------------------------------------------------------------- */
/* analyzeSeasonDramaturgy — tie_in_distribution finding (task #22)           */
/* -------------------------------------------------------------------------- */

describe("analyzeSeasonDramaturgy — tie_in_distribution finding (task #22)", () => {
  function draftedItemWithTieIn(
    episodeNumber: number,
    planned: boolean,
    markedShotNumber: number | null,
  ): StoredEpisodeBreakdownItem {
    return {
      episodeNumber,
      workingTitle: `Episode ${episodeNumber}`,
      logline: `Logline ${episodeNumber}`,
      keyBeats: ["Beat"],
      tieIn: { planned, source: "planned" },
      shotDrafts: markedShotNumber === null ? nineShotDrafts() : nineShotDraftsWithTieIn(markedShotNumber),
    } as StoredEpisodeBreakdownItem;
  }

  it("flags two ADJACENT planned episodes (bunching), even for undrafted items", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      { episodeNumber: 1, workingTitle: "E1", logline: "L", keyBeats: ["B"], tieIn: { planned: true, source: "planned" }, shotDrafts: nineShotDraftsWithTieIn(1) } as StoredEpisodeBreakdownItem,
      { episodeNumber: 2, workingTitle: "E2", logline: "L", keyBeats: ["B"], tieIn: { planned: true, source: "planned" } } as StoredEpisodeBreakdownItem,
      { episodeNumber: 3, workingTitle: "E3", logline: "L", keyBeats: ["B"], tieIn: { planned: false, source: "planned" } } as StoredEpisodeBreakdownItem,
    ];
    const findings = analyzeSeasonDramaturgy(items);
    const bunching = findings.filter((f) => f.kind === "tie_in_distribution" && f.evidenceEpisodes.includes(2));
    expect(bunching.length).toBeGreaterThan(0);
    expect(bunching[0].evidenceEpisodes).toEqual([1, 2]);
  });

  it("does NOT flag two planned episodes that are NOT adjacent", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      draftedItemWithTieIn(1, true, 1),
      draftedItemWithTieIn(4, true, 1),
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findings.filter((f) => f.kind === "tie_in_distribution")).toHaveLength(0);
  });

  it("flags a PLANNED + DRAFTED episode with no marked shot", () => {
    const items: StoredEpisodeBreakdownItem[] = [draftedItemWithTieIn(1, true, null)];
    const findings = analyzeSeasonDramaturgy(items);
    const unmarked = findings.find((f) => f.kind === "tie_in_distribution");
    expect(unmarked?.evidenceEpisodes).toEqual([1]);
  });

  it("does NOT flag a planned episode that has not been drafted yet (no shotDrafts)", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      { episodeNumber: 1, workingTitle: "E1", logline: "L", keyBeats: ["B"], tieIn: { planned: true, source: "planned" } } as StoredEpisodeBreakdownItem,
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findings.filter((f) => f.kind === "tie_in_distribution")).toHaveLength(0);
  });

  it("returns no tie_in_distribution finding for a series with no tie-in plan at all (grandfather)", () => {
    const items: StoredEpisodeBreakdownItem[] = [
      {
        episodeNumber: 1,
        workingTitle: "E1",
        logline: "L",
        keyBeats: ["B"],
        shotDrafts: nineShotDrafts(),
      } as StoredEpisodeBreakdownItem,
    ];
    const findings = analyzeSeasonDramaturgy(items);
    expect(findings.filter((f) => f.kind === "tie_in_distribution")).toHaveLength(0);
  });
});
