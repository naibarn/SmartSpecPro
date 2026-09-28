/**
 * Coverage for `verticalDramaGenreProposal.ts` — the service backing the
 * genre-proposal pass of `scripts/repair-vertical-drama-genre-pollution.ts`
 * (Stage 1.5 follow-up, `planning/vd-series-memory-and-lineage/plan.md`
 * task #7).
 *
 * Mirrors `verticalDramaSeriesMemoryPlanning.test.ts`'s mocking pattern:
 *  - credit pre-check uses the conservative fixed estimate, not
 *    `hasEnoughCredits(userId, 1)`.
 *  - a POST-LLM `deductCredits` failure is caught and logged, never bubbled
 *    (the already-paid-for proposal is still returned).
 *  - `idempotencyKey` is forwarded straight through to `deductCredits`.
 *  - a malformed LLM response throws `VdSchemaValidationError`.
 * Also covers `buildGenreProposalFacts` — the pure fact-bounding function —
 * separately, with no mocking required.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(
      () => "---\nname: vertical-drama-genre-normalizer\n---\nSystem prompt body"
    ),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: "System prompt body" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => [
    "/fake/skills/vertical-drama-genre-normalizer",
  ]),
  resolveSkillManifestPath: vi.fn(
    () => "/fake/skills/vertical-drama-genre-normalizer/skill.md"
  ),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLM } = vi.hoisted(
  () => ({
    mockHasEnoughCredits: vi.fn(),
    mockDeductCredits: vi.fn(),
    mockCalculateCreditsForLLM: vi.fn(() => 2),
  })
);

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

// Centralized per-series model policy resolver — mocked as a pure
// passthrough to `autoFallback` so this file's assertions never hit the DB
// (mirrors `verticalDramaSeriesMemoryPlanning.test.ts`).
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

const { mockDebugError } = vi.hoisted(() => ({ mockDebugError: vi.fn() }));
vi.mock("../../_core/logger", () => ({
  debugError: mockDebugError,
  debugLog: vi.fn(),
}));

import {
  runVerticalDramaGenreProposal,
  buildGenreProposalFacts,
  genreProposalOutputSchema,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../verticalDramaGenreProposal";

const VALID_PROPOSAL = {
  contract_version: 1,
  decision: "change" as const,
  proposed_genre: "โรแมนติกดราม่าย้อนเวลา",
  rationale: "เรื่องเล่าเกี่ยวกับการย้อนเวลาไปแก้ไขอดีตและความรัก ไม่ใช่แนวที่เดิมเป็นชื่อสำรอง",
};

function baseParams(over: Record<string, unknown> = {}) {
  return {
    userId: 42,
    tenantId: "tenant-1",
    seriesId: 17,
    locale: "th" as const,
    facts: buildGenreProposalFacts({
      title: "รักข้ามเวลา",
      genre: "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา",
      bible: {
        logline: "สถาปนิกผู้ถูกดึงเข้าอดีตต้องช่วยวิญญาณสาว",
        episodeBreakdown: [{ episodeNumber: 1, logline: "พบนาฬิกาทองเหลือง", keyBeats: ["a", "b"] }],
      },
    }),
    ...over,
  };
}

function mockSuccessfulLlmResponse(proposal: Record<string, unknown> = VALID_PROPOSAL) {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(proposal) } }],
      usage: { prompt_tokens: 80, completion_tokens: 20 },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(2);
});

describe("buildGenreProposalFacts — pure fact bounding", () => {
  it("carries title/currentGenre through untouched", () => {
    const facts = buildGenreProposalFacts({
      title: "รักข้ามเวลา",
      genre: "คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา",
      bible: null,
    });
    expect(facts.title).toBe("รักข้ามเวลา");
    expect(facts.currentGenre).toBe("คฤหาสน์ครึ่งเวลา: อ้อมใจในเงา");
  });

  it("handles a null/missing bible without throwing", () => {
    const facts = buildGenreProposalFacts({ title: "t", genre: null, bible: null });
    expect(facts.logline).toBeUndefined();
    expect(facts.episodeSamples).toEqual([]);
  });

  it("bounds a large episodeBreakdown to first-3 + last-2 (5 total), not all 30", () => {
    const episodeBreakdown = Array.from({ length: 30 }, (_, i) => ({
      episodeNumber: i + 1,
      logline: `ep-${i + 1}`,
      keyBeats: [`beat-${i + 1}-a`, `beat-${i + 1}-b`],
    }));
    const facts = buildGenreProposalFacts({
      title: "t",
      genre: null,
      bible: { episodeBreakdown },
    });
    expect(facts.episodeSamples).toHaveLength(5);
    const numbers = facts.episodeSamples.map(sample => sample.episodeNumber);
    expect(numbers).toEqual([1, 2, 3, 29, 30]);
  });

  it("includes every episode when there are 5 or fewer", () => {
    const episodeBreakdown = Array.from({ length: 3 }, (_, i) => ({ episodeNumber: i + 1 }));
    const facts = buildGenreProposalFacts({ title: "t", genre: null, bible: { episodeBreakdown } });
    expect(facts.episodeSamples).toHaveLength(3);
  });

  it("truncates long bible free-text fields to a bounded length", () => {
    const long = "ก".repeat(2000);
    const facts = buildGenreProposalFacts({
      title: "t",
      genre: null,
      bible: { logline: long, mainPlot: long, seasonArc: long },
    });
    expect(facts.logline!.length).toBeLessThanOrEqual(500);
    expect(facts.mainPlot!.length).toBeLessThanOrEqual(500);
    expect(facts.seasonArc!.length).toBeLessThanOrEqual(500);
  });

  it("includes a non-empty reference genre vocabulary drawn from the shared preset category labels", () => {
    const facts = buildGenreProposalFacts({ title: "t", genre: null, bible: null });
    expect(facts.genreVocabulary.length).toBeGreaterThan(20);
    expect(facts.genreVocabulary).toContain("รักข้ามชนชั้น");
  });
});

describe("runVerticalDramaGenreProposal — credit pre-check", () => {
  it("pre-checks with the conservative fixed estimate, not hasEnoughCredits(userId, 1)", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaGenreProposal(baseParams());

    expect(mockHasEnoughCredits).toHaveBeenCalledTimes(1);
    const [, amountChecked] = mockHasEnoughCredits.mock.calls[0];
    expect(amountChecked).toBeGreaterThan(1);
  });

  it("throws InsufficientCreditsError when the estimate pre-check fails", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(runVerticalDramaGenreProposal(baseParams())).rejects.toBeInstanceOf(
      InsufficientCreditsError
    );
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });
});

describe("runVerticalDramaGenreProposal — schema validation", () => {
  it("returns the parsed proposal on a valid response", async () => {
    mockSuccessfulLlmResponse();

    const result = await runVerticalDramaGenreProposal(baseParams());

    expect(result.proposed.decision).toBe("change");
    expect(result.proposed.proposed_genre).toBe(VALID_PROPOSAL.proposed_genre);
    expect(result.creditsUsed).toBe(2);
  });

  it("throws VdSchemaValidationError on a malformed response (missing required field)", async () => {
    const malformed = { ...VALID_PROPOSAL } as Record<string, unknown>;
    delete malformed.proposed_genre;
    mockSuccessfulLlmResponse(malformed);

    await expect(runVerticalDramaGenreProposal(baseParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError
    );
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("throws VdSchemaValidationError when decision is not keep/change", async () => {
    mockSuccessfulLlmResponse({ ...VALID_PROPOSAL, decision: "maybe" });

    await expect(runVerticalDramaGenreProposal(baseParams())).rejects.toBeInstanceOf(
      VdSchemaValidationError
    );
  });
});

describe("runVerticalDramaGenreProposal — post-LLM deductCredits failure handling", () => {
  it("does not throw and still returns the proposal when deductCredits fails after a successful LLM call", async () => {
    mockSuccessfulLlmResponse();
    mockDeductCredits.mockRejectedValue(new Error("db down"));

    const result = await runVerticalDramaGenreProposal(baseParams());

    expect(result.proposed.proposed_genre).toBe(VALID_PROPOSAL.proposed_genre);
    expect(result.creditsUsed).toBe(2);
    expect(mockDebugError).toHaveBeenCalledTimes(1);
  });
});

describe("runVerticalDramaGenreProposal — idempotencyKey passthrough", () => {
  it("forwards idempotencyKey to deductCredits", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaGenreProposal(baseParams({ idempotencyKey: "abc-123" }));

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "abc-123" })
    );
  });
});

describe("genreProposalOutputSchema", () => {
  it("accepts a well-formed 'keep' verdict", () => {
    const result = genreProposalOutputSchema.safeParse({
      contract_version: 1,
      decision: "keep",
      proposed_genre: "โรแมนติกดราม่าย้อนเวลา",
      rationale: "แนวเรื่องเดิมถูกต้องแล้ว",
    });
    expect(result.success).toBe(true);
  });
});
