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
  computeVerticalDramaDensityMetrics,
  episodeQualityReviewOutputSchema,
  type VerticalDramaDensityMetrics,
} from "../verticalDramaEpisodeQualityReview";
import { analyzeVerticalDramaEpisodeDialogueQuality } from "@shared/verticalDramaSeries/dialogueQuality";

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

/* -------------------------------------------------------------------------- */
/* v2 superset (spec §16.1 / section-14) — added 2026-07-07                   */
/* -------------------------------------------------------------------------- */

const V1_SKILL_FIXTURE = {
  contract_version: 1,
  episode_title: "Midnight Verdict",
  scorecard: {
    reversal_count: 1,
    reversal_sharpness: 4,
    emotion_variety: 5,
    dialogue_naturalness: 4,
    pacing: 4,
    overall: 4,
  },
  summary: "One clear, legible reversal at beat 3.",
  issues: [
    { location: "beat 2", problem: "only one reversal", suggested_fix: "add a setback beat" },
  ],
  warnings: [],
  repair_queue: [],
};

const V2_SKILL_FIXTURE = {
  contract_version: 2,
  episode_title: "Midnight Verdict",
  scorecard: {
    reversal_count: 2,
    reversal_sharpness: 4,
    emotion_variety: 4,
    dialogue_naturalness: 4,
    pacing: 4,
    overall: 4,
    hook_strength: 5,
    cliffhanger_strength: 4,
    continuity_consistency: 5,
    tie_in_naturalness: 3,
  },
  summary: "Two clear reversals with legible power shifts.",
  issues: [
    {
      location: "shot 4",
      problem: "the tie-in line states the product's benefit outright.",
      suggested_fix: "replace the direct benefit claim with a natural in-story reference.",
    },
  ],
  tie_in_assessment: "Shot 4's dialogue states the product's benefit outright mid-confrontation.",
  density_metrics: {
    estimated_speech_seconds: 42,
    per_clip_coverage: {
      clips_evaluated: 9,
      clips_below_min_ratio: 1,
      clips_below_error_ratio: 0,
      average_coverage_ratio: 0.61,
    },
    silent_gap_count: 0,
    duplicate_line_count: 0,
    stage_direction_count: 0,
    reversal_count: 2,
    max_consecutive_same_emotion: 2,
  },
  warnings: [],
  repair_queue: [],
};

describe("episodeQualityReviewOutputSchema — v2 superset (spec §16.1)", () => {
  it("parses a v1 fixture unchanged (contract_version: 1, no v2 fields)", () => {
    const result = episodeQualityReviewOutputSchema.safeParse(V1_SKILL_FIXTURE);
    expect(result.success).toBe(true);
  });

  it("parses a v1 fixture with contract_version entirely absent (legacy persisted artifacts)", () => {
    const { contract_version, ...withoutVersion } = V1_SKILL_FIXTURE;
    const result = episodeQualityReviewOutputSchema.safeParse(withoutVersion);
    expect(result.success).toBe(true);
  });

  it("parses a v2 fixture with hook_strength/cliffhanger_strength/continuity_consistency/tie_in_naturalness and density_metrics", () => {
    const result = episodeQualityReviewOutputSchema.safeParse(V2_SKILL_FIXTURE);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scorecard.hook_strength).toBe(5);
      expect(result.data.scorecard.cliffhanger_strength).toBe(4);
      expect(result.data.scorecard.continuity_consistency).toBe(5);
      expect(result.data.scorecard.tie_in_naturalness).toBe(3);
      expect(result.data.density_metrics?.estimated_speech_seconds).toBe(42);
      expect(result.data.tie_in_assessment).toBeTruthy();
    }
  });

  it("accepts tie_in_naturalness: null (tie-in disabled) on a contract_version: 2 payload", () => {
    const result = episodeQualityReviewOutputSchema.safeParse({
      ...V2_SKILL_FIXTURE,
      scorecard: { ...V2_SKILL_FIXTURE.scorecard, tie_in_naturalness: null },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scorecard.tie_in_naturalness).toBeNull();
    }
  });

  it("rejects an out-of-range v2 dimension (hook_strength must be 1-5)", () => {
    const result = episodeQualityReviewOutputSchema.safeParse({
      ...V2_SKILL_FIXTURE,
      scorecard: { ...V2_SKILL_FIXTURE.scorecard, hook_strength: 9 },
    });
    expect(result.success).toBe(false);
  });
});

describe("runVerticalDramaEpisodeQualityReview — v2 prompt injection (spec §16.1 rule 1)", () => {
  function capturedUserPrompt(): string {
    return mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
  }

  const SAMPLE_DENSITY_METRICS: VerticalDramaDensityMetrics = {
    estimated_speech_seconds: 42,
    per_clip_coverage: {
      clips_evaluated: 9,
      clips_below_min_ratio: 1,
      clips_below_error_ratio: 0,
      average_coverage_ratio: 0.61,
    },
    silent_gap_count: 0,
    duplicate_line_count: 0,
    stage_direction_count: 0,
    reversal_count: 2,
    max_consecutive_same_emotion: 2,
  };

  it("v1 byte-identical: the prompt has no density_metrics/tie_in_config/contract_version:2 text when neither new param is supplied", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(baseParams());

    const userPrompt = capturedUserPrompt();
    expect(userPrompt).not.toContain("density_metrics:");
    expect(userPrompt).not.toContain("tie_in_config:");
    expect(userPrompt).not.toContain('"contract_version": 2');
  });

  it("injects density_metrics into the prompt and instructs contract_version 2 when densityMetrics is supplied", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(
      baseParams({ densityMetrics: SAMPLE_DENSITY_METRICS }),
    );

    const userPrompt = capturedUserPrompt();
    expect(userPrompt).toContain("density_metrics:");
    expect(userPrompt).toContain(JSON.stringify(SAMPLE_DENSITY_METRICS));
    expect(userPrompt).toContain('"contract_version": 2');
  });

  it("force-overwrites the LLM-returned density_metrics with the caller-supplied value, verbatim, ignoring whatever the LLM returned", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...VALID_REVIEW,
                contract_version: 2,
                density_metrics: {
                  estimated_speech_seconds: 999,
                  per_clip_coverage: {
                    clips_evaluated: 1,
                    clips_below_min_ratio: 1,
                    clips_below_error_ratio: 1,
                    average_coverage_ratio: 0.01,
                  },
                  silent_gap_count: 99,
                  duplicate_line_count: 99,
                  stage_direction_count: 99,
                  reversal_count: 99,
                  max_consecutive_same_emotion: 99,
                },
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });

    const result = await runVerticalDramaEpisodeQualityReview(
      baseParams({ densityMetrics: SAMPLE_DENSITY_METRICS }),
    );

    expect(result.review.density_metrics).toEqual(SAMPLE_DENSITY_METRICS);
  });

  it("includes tie_in_config in the prompt and instructs scoring tie_in_naturalness when tieInConfig.enabled is true", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(
      baseParams({ tieInConfig: { enabled: true, productName: "Cream X" } }),
    );

    const userPrompt = capturedUserPrompt();
    expect(userPrompt).toContain("tie_in_config:");
    expect(userPrompt).toContain('"enabled":true');
    expect(userPrompt).toContain("tie_in_naturalness");
    expect(userPrompt).toContain('"contract_version": 2');
  });

  it("does not mention tie_in_naturalness when tieInConfig is supplied but disabled", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(
      baseParams({ tieInConfig: { enabled: false } }),
    );

    const userPrompt = capturedUserPrompt();
    expect(userPrompt).toContain("tie_in_config:");
    expect(userPrompt).not.toContain("tie_in_naturalness");
  });
});

describe("runVerticalDramaEpisodeQualityReview — reviewMode: \"execution\" (W11.6 Story Lock)", () => {
  function capturedUserPrompt(): string {
    return mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
  }

  it("byte-identical: no STORY LOCK MODE text when reviewMode is omitted", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(baseParams());

    expect(capturedUserPrompt()).not.toContain("STORY LOCK MODE");
  });

  it("injects the execution-only instruction when reviewMode is 'execution'", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(baseParams({ reviewMode: "execution" }));

    const userPrompt = capturedUserPrompt();
    expect(userPrompt).toContain("STORY LOCK MODE");
    expect(userPrompt).toContain("execution-level only");
    expect(userPrompt).toContain("Still SCORE every");
  });

  it("still scores story dimensions normally in execution mode (does not skip contract_version 2 when densityMetrics is also supplied)", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaEpisodeQualityReview(
      baseParams({
        reviewMode: "execution",
        densityMetrics: {
          estimated_speech_seconds: 40,
          per_clip_coverage: {
            clips_evaluated: 9,
            clips_below_min_ratio: 0,
            clips_below_error_ratio: 0,
            average_coverage_ratio: 0.6,
          },
          silent_gap_count: 0,
          duplicate_line_count: 0,
          stage_direction_count: 0,
          reversal_count: 2,
          max_consecutive_same_emotion: 1,
        },
      }),
    );

    const userPrompt = capturedUserPrompt();
    expect(userPrompt).toContain('"contract_version": 2');
    expect(userPrompt).toContain("STORY LOCK MODE");
  });
});

describe("computeVerticalDramaDensityMetrics (spec §16.1 rule 1 / §7.7.1) — no LLM, deterministic", () => {
  it("counts reversals from script.structure.beats[].is_reversal", () => {
    const script = {
      structure: {
        beats: [{ is_reversal: true }, { is_reversal: false }, { is_reversal: true }, {}],
      },
    };
    expect(computeVerticalDramaDensityMetrics({ script }).reversal_count).toBe(2);
  });

  it("returns 0 reversals when script/structure/beats is absent", () => {
    expect(computeVerticalDramaDensityMetrics({}).reversal_count).toBe(0);
  });

  it("computes max_consecutive_same_emotion as the longest run of consecutive identical emotions", () => {
    const storyboard = {
      shots: [
        { shot_number: 1, duration_seconds: 5, emotion: "a" },
        { shot_number: 2, duration_seconds: 5, emotion: "a" },
        { shot_number: 3, duration_seconds: 5, emotion: "a" },
        { shot_number: 4, duration_seconds: 5, emotion: "b" },
        { shot_number: 5, duration_seconds: 5, emotion: "c" },
        { shot_number: 6, duration_seconds: 5, emotion: "c" },
      ],
    };
    expect(computeVerticalDramaDensityMetrics({ storyboard }).max_consecutive_same_emotion).toBe(3);
  });

  it("sorts shots by shot_number before scanning, regardless of input array order", () => {
    const storyboard = {
      shots: [
        { shot_number: 3, duration_seconds: 5, emotion: "a" },
        { shot_number: 1, duration_seconds: 5, emotion: "a" },
        { shot_number: 2, duration_seconds: 5, emotion: "a" },
      ],
    };
    expect(computeVerticalDramaDensityMetrics({ storyboard }).max_consecutive_same_emotion).toBe(3);
  });

  it("returns 1 (not 0) for a fully-varied storyboard — the healthy no-repeats baseline", () => {
    const storyboard = {
      shots: [
        { shot_number: 1, duration_seconds: 5, emotion: "a" },
        { shot_number: 2, duration_seconds: 5, emotion: "b" },
        { shot_number: 3, duration_seconds: 5, emotion: "c" },
      ],
    };
    expect(computeVerticalDramaDensityMetrics({ storyboard }).max_consecutive_same_emotion).toBe(1);
  });

  it("uses dialoguePlan.dialogueLines when present, matching analyzeVerticalDramaEpisodeDialogueQuality's own totals", () => {
    const clipDurations = [
      { shotNumber: 1, durationSeconds: 8 },
      { shotNumber: 2, durationSeconds: 8 },
    ];
    const dialoguePlan = {
      dialogueLines: [
        { shotNumber: 1, text: "สวัสดีตอนเช้านะครับ ทานข้าวหรือยัง" },
        { shotNumber: 2, text: "hello there, how are you doing today my friend" },
      ],
    };

    const result = computeVerticalDramaDensityMetrics({ dialoguePlan, clipDurations });

    const expected = analyzeVerticalDramaEpisodeDialogueQuality([
      { shotNumber: 1, durationSeconds: 8, dialogue: [{ lineTh: "สวัสดีตอนเช้านะครับ ทานข้าวหรือยัง" }] },
      { shotNumber: 2, durationSeconds: 8, dialogue: [{ lineTh: "hello there, how are you doing today my friend" }] },
    ]);

    expect(result.estimated_speech_seconds).toBeCloseTo(expected.totalSpeechSeconds, 2);
    expect(result.per_clip_coverage.clips_evaluated).toBe(2);
  });

  it("falls back to the storyboard shot's own dialogue_excerpt (script_fallback) when no dialoguePlan line exists for that clip", () => {
    const storyboard = {
      shots: [{ shot_number: 1, duration_seconds: 8, dialogue_excerpt: "อย่าทิ้งฉันไปนะ" }],
    };
    const result = computeVerticalDramaDensityMetrics({ storyboard });
    expect(result.per_clip_coverage.clips_evaluated).toBe(1);
    expect(result.estimated_speech_seconds).toBeGreaterThan(0);
  });

  it("counts stage-direction lines via hasVerticalDramaStageDirectionDialogue", () => {
    const clipDurations = [{ shotNumber: 1, durationSeconds: 8 }];
    const dialoguePlan = { dialogueLines: [{ shotNumber: 1, text: "(sighs)" }] };
    expect(
      computeVerticalDramaDensityMetrics({ dialoguePlan, clipDurations }).stage_direction_count,
    ).toBe(1);
  });

  it("counts duplicate lines via analyzeVerticalDramaEpisodeDialogueQuality's VD_DIALOGUE_DUPLICATE issues", () => {
    const clipDurations = [
      { shotNumber: 1, durationSeconds: 8 },
      { shotNumber: 2, durationSeconds: 8 },
    ];
    const dialoguePlan = {
      dialogueLines: [
        { shotNumber: 1, text: "ฉันจะไม่มีวันให้อภัยเธอ" },
        { shotNumber: 2, text: "ฉันจะไม่มีวันให้อภัยเธอ" },
      ],
    };
    expect(
      computeVerticalDramaDensityMetrics({ dialoguePlan, clipDurations }).duplicate_line_count,
    ).toBe(1);
  });

  it("counts silent gaps via analyzeVerticalDramaClipSilence's exceedsLimit", () => {
    const clipDurations = [{ shotNumber: 1, durationSeconds: 20 }];
    const dialoguePlan = { dialogueLines: [{ shotNumber: 1, text: "โอเค" }] };
    expect(
      computeVerticalDramaDensityMetrics({ dialoguePlan, clipDurations }).silent_gap_count,
    ).toBe(1);
  });

  it("returns all-zero metrics for completely empty input without crashing", () => {
    expect(computeVerticalDramaDensityMetrics({})).toEqual({
      estimated_speech_seconds: 0,
      per_clip_coverage: {
        clips_evaluated: 0,
        clips_below_min_ratio: 0,
        clips_below_error_ratio: 0,
        average_coverage_ratio: 0,
      },
      silent_gap_count: 0,
      duplicate_line_count: 0,
      stage_direction_count: 0,
      reversal_count: 0,
      max_consecutive_same_emotion: 0,
    });
  });
});
