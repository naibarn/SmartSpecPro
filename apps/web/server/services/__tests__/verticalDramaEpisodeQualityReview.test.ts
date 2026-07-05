/**
 * Focused coverage for the security-audit fixes made to
 * `verticalDramaEpisodeQualityReview.ts`:
 *  - T3: the pre-call credit check uses a conservative fixed estimate
 *    (`QUALITY_REVIEW_ESTIMATED_CREDIT_COST`) instead of the too-permissive
 *    `hasEnoughCredits(userId, 1)`.
 *  - T3: a failure in the POST-LLM `deductCredits` call is caught and logged
 *    (never bubbled as a raw error) — the review the user already paid
 *    provider cost for is still returned.
 *  - T2: `idempotencyKey` is forwarded from `RunEpisodeQualityReviewParams`
 *    straight through to `deductCredits`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => "---\nname: vertical-drama-episode-quality-review\n---\nSystem prompt body"),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn((raw: string) => ({ content: "System prompt body" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => ["/fake/skills/vertical-drama-episode-quality-review"]),
  resolveSkillManifestPath: vi.fn(() => "/fake/skills/vertical-drama-episode-quality-review/skill.md"),
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

const { mockDebugError } = vi.hoisted(() => ({ mockDebugError: vi.fn() }));
vi.mock("../../_core/logger", () => ({
  debugError: mockDebugError,
  debugLog: vi.fn(),
}));

import {
  runVerticalDramaEpisodeQualityReview,
  InsufficientCreditsError,
} from "../verticalDramaEpisodeQualityReview";

const VALID_REVIEW = {
  episode_title: "Episode 1",
  scorecard: {
    reversal_count: 1,
    reversal_sharpness: 3,
    emotion_variety: 3,
    dialogue_naturalness: 3,
    pacing: 3,
    overall: 3,
  },
  summary: "ok",
  issues: [],
  warnings: [],
  repair_queue: [],
};

function baseParams(over: Record<string, unknown> = {}) {
  return {
    userId: 42,
    tenantId: "tenant-1",
    seriesId: 10,
    episodeId: 100,
    episodeTitle: "Episode 1",
    locale: "th" as const,
    script: { episode_title: "Episode 1" },
    storyboard: { shots: [] },
    dialoguePlan: null,
    ...over,
  };
}

function mockSuccessfulLlmResponse() {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(VALID_REVIEW) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
});

describe("runVerticalDramaEpisodeQualityReview — credit pre-check (T3)", () => {
  it("pre-checks with the conservative fixed estimate, not hasEnoughCredits(userId, 1)", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(baseParams());

    expect(mockHasEnoughCredits).toHaveBeenCalledTimes(1);
    const [, amountChecked] = mockHasEnoughCredits.mock.calls[0];
    expect(amountChecked).toBeGreaterThan(1);
  });

  it("throws InsufficientCreditsError when the estimate pre-check fails", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(runVerticalDramaEpisodeQualityReview(baseParams())).rejects.toBeInstanceOf(
      InsufficientCreditsError,
    );
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });
});

describe("runVerticalDramaEpisodeQualityReview — post-LLM deductCredits failure handling (T3)", () => {
  it("does not throw and still returns the review when deductCredits fails after a successful LLM call", async () => {
    mockSuccessfulLlmResponse();
    mockDeductCredits.mockRejectedValue(new Error("db down"));

    const result = await runVerticalDramaEpisodeQualityReview(baseParams());

    expect(result.review.summary).toBe("ok");
    expect(result.creditsUsed).toBe(3);
    expect(mockDebugError).toHaveBeenCalledTimes(1);
  });
});

describe("runVerticalDramaEpisodeQualityReview — idempotencyKey passthrough (T2)", () => {
  it("forwards idempotencyKey to deductCredits", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(
      baseParams({ idempotencyKey: "abc-123" }),
    );

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "abc-123" }),
    );
  });

  it("passes idempotencyKey through as undefined when not provided", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(baseParams());

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: undefined }),
    );
  });
});
