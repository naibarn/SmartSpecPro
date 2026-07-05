/**
 * Coverage for `verticalDramaSeriesMemoryPlanning.ts` — the service that
 * wires the previously-orphaned `vertical-drama-series-memory-planner`
 * skill into the `summarize_episode_to_series_memory` pipeline stage.
 *
 * Mirrors `verticalDramaEpisodeQualityReview.test.ts`'s mocking pattern:
 *  - credit pre-check uses the conservative fixed estimate, not
 *    `hasEnoughCredits(userId, 1)`.
 *  - a POST-LLM `deductCredits` failure is caught and logged, never bubbled
 *    (the already-paid-for plan is still returned).
 *  - `idempotencyKey` is forwarded straight through to `deductCredits`.
 *  - a malformed LLM response throws `VdSchemaValidationError`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(
      () => "---\nname: vertical-drama-series-memory-planner\n---\nSystem prompt body"
    ),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: "System prompt body" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => [
    "/fake/skills/vertical-drama-series-memory-planner",
  ]),
  resolveSkillManifestPath: vi.fn(
    () => "/fake/skills/vertical-drama-series-memory-planner/skill.md"
  ),
}));

const { mockHasEnoughCredits, mockDeductCredits, mockCalculateCreditsForLLM } = vi.hoisted(
  () => ({
    mockHasEnoughCredits: vi.fn(),
    mockDeductCredits: vi.fn(),
    mockCalculateCreditsForLLM: vi.fn(() => 3),
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

vi.mock("../verticalDramaStoryBible", () => ({
  resolveStoryBibleModel: vi.fn(async () => "gpt-x"),
  extractJson: vi.fn((text: string) => JSON.parse(text)),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
  VdSchemaValidationError: class VdSchemaValidationError extends Error {
    constructor(
      message: string,
      public issues: unknown
    ) {
      super(message);
    }
  },
}));

const { mockDebugError } = vi.hoisted(() => ({ mockDebugError: vi.fn() }));
vi.mock("../../_core/logger", () => ({
  debugError: mockDebugError,
  debugLog: vi.fn(),
}));

import {
  runVerticalDramaSeriesMemoryPlanning,
  InsufficientCreditsError,
  VdSchemaValidationError,
} from "../verticalDramaSeriesMemoryPlanning";

const VALID_PLAN = {
  contract_version: 1,
  canonical_facts: [{ fact_id: "f1", statement: "Aria is CFO of Vantor Group" }],
  prior_episode_summaries: [{ episode_number: 1, summary: "Aria signs the merger" }],
  unresolved_hooks: [{ hook_id: "h_clinic", description: "sister's clinic funding" }],
  resolved_hooks: [],
  relationship_state_changes: [{ pair: ["char_aria", "char_rival"], change: "trust -> rivalry" }],
  character_emotional_state: [{ character_id: "char_aria", state: "suspicious" }],
  product_tie_in_history: [],
  continuity_risks: [{ risk: "wardrobe drift", severity: "low" }],
  episode_recap: "Episode 1: Aria signs the merger and uncovers a hidden clause.",
  memory_compaction_summary: "Series so far: corporate betrayal, clinic subplot open.",
};

function baseParams(over: Record<string, unknown> = {}) {
  return {
    userId: 42,
    tenantId: "tenant-1",
    seriesId: 10,
    episodeId: 100,
    episodeNumber: 1,
    locale: "th" as const,
    script: { episode_title: "Episode 1" },
    storyboard: { shots: [] },
    dialoguePlan: null,
    priorMemoryBundle: undefined,
    ...over,
  };
}

function mockSuccessfulLlmResponse(plan: Record<string, unknown> = VALID_PLAN) {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(plan) } }],
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

describe("runVerticalDramaSeriesMemoryPlanning — credit pre-check", () => {
  it("pre-checks with the conservative fixed estimate, not hasEnoughCredits(userId, 1)", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaSeriesMemoryPlanning(baseParams());

    expect(mockHasEnoughCredits).toHaveBeenCalledTimes(1);
    const [, amountChecked] = mockHasEnoughCredits.mock.calls[0];
    expect(amountChecked).toBeGreaterThan(1);
  });

  it("throws InsufficientCreditsError when the estimate pre-check fails", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      runVerticalDramaSeriesMemoryPlanning(baseParams())
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
  });
});

describe("runVerticalDramaSeriesMemoryPlanning — schema validation", () => {
  it("returns the parsed planner output on a valid response", async () => {
    mockSuccessfulLlmResponse();

    const result = await runVerticalDramaSeriesMemoryPlanning(baseParams());

    expect(result.planned.episode_recap).toBe(VALID_PLAN.episode_recap);
    expect(result.planned.canonical_facts).toHaveLength(1);
    expect(result.planned.unresolved_hooks).toHaveLength(1);
    expect(result.creditsUsed).toBe(3);
  });

  it("throws VdSchemaValidationError on a malformed response (missing required field)", async () => {
    const malformed = { ...VALID_PLAN } as Record<string, unknown>;
    delete malformed.episode_recap;
    mockSuccessfulLlmResponse(malformed);

    await expect(
      runVerticalDramaSeriesMemoryPlanning(baseParams())
    ).rejects.toBeInstanceOf(VdSchemaValidationError);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

describe("runVerticalDramaSeriesMemoryPlanning — post-LLM deductCredits failure handling", () => {
  it("does not throw and still returns the plan when deductCredits fails after a successful LLM call", async () => {
    mockSuccessfulLlmResponse();
    mockDeductCredits.mockRejectedValue(new Error("db down"));

    const result = await runVerticalDramaSeriesMemoryPlanning(baseParams());

    expect(result.planned.episode_recap).toBe(VALID_PLAN.episode_recap);
    expect(result.creditsUsed).toBe(3);
    expect(mockDebugError).toHaveBeenCalledTimes(1);
  });
});

describe("runVerticalDramaSeriesMemoryPlanning — idempotencyKey passthrough", () => {
  it("forwards idempotencyKey to deductCredits", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaSeriesMemoryPlanning(baseParams({ idempotencyKey: "abc-123" }));

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "abc-123" })
    );
  });

  it("passes idempotencyKey through as undefined when not provided", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaSeriesMemoryPlanning(baseParams());

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: undefined })
    );
  });
});

describe("runVerticalDramaSeriesMemoryPlanning — prompt construction", () => {
  it("includes prior_series_memory in the user prompt when priorMemoryBundle is provided", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaSeriesMemoryPlanning(
      baseParams({ priorMemoryBundle: { canonicalFacts: ["Aria is CFO"] } })
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("prior_series_memory");
    expect(userMessage.content).toContain("Aria is CFO");
  });

  it("marks prior_series_memory as none when no bundle is provided", async () => {
    mockSuccessfulLlmResponse();

    await runVerticalDramaSeriesMemoryPlanning(baseParams());

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("prior_series_memory: (none yet");
  });
});
