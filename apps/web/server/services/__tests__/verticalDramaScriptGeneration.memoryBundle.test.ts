/**
 * Coverage for `verticalDramaScriptGeneration.ts`'s `memoryBundle` wiring —
 * the fix for the gap where series long-memory was never fed into episode
 * script generation. The `vertical-drama-script-builder` skill's
 * `schemas/input.schema.json` declares a `memory_state` key, so the bundle
 * must be rendered into the LLM user prompt under exactly that key name.
 *
 * Mirrors `verticalDramaSeriesMemoryPlanning.test.ts`'s mocking pattern.
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

const VALID_SCRIPT = {
  contract_version: 1,
  episode_title: "Midnight Verdict",
  hook: "Aria's phone lights up mid-signature.",
  structure: { mode: "beat", acts: [], beats: [] },
  scene_dialogue_summary: [],
  cliffhanger: "The board turns on the rival next.",
  character_state_deltas: [],
  product_tie_in_plan: {},
  continuity_notes: [],
  warnings: [],
  repair_queue: [],
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

function mockSuccessfulLlmResponse() {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(VALID_SCRIPT) } }],
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

describe("generateEpisodeScript — memoryBundle wiring", () => {
  it("includes the active plan's cliffhanger and continuity ledger in the prompt", async () => {
    mockSuccessfulLlmResponse();

    await generateEpisodeScript(
      baseParams({
        storySource: {
          cliffhangerLine: "The locked-room witness appears on the screen.",
          continuityPlan: {
            threadLedger: [{ threadId: "mystery-witness-captured" }],
          },
        },
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("Planned cliffhanger / continuity obligation");
    expect(userMessage.content).toContain("mystery-witness-captured");
  });

  it("includes memory_state in the user prompt when memoryBundle is provided", async () => {
    mockSuccessfulLlmResponse();

    await generateEpisodeScript(
      baseParams({
        memoryBundle: {
          canonicalFacts: ["Aria is CFO of Vantor Group"],
          unresolvedHooks: ["sister's clinic funding"],
        },
      })
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("memory_state");
    expect(userMessage.content).toContain("Aria is CFO of Vantor Group");
    expect(userMessage.content).toContain("sister's clinic funding");
  });

  it("omits memory_state entirely when no memoryBundle is provided (episode 1 / predates the field)", async () => {
    mockSuccessfulLlmResponse();

    await generateEpisodeScript(baseParams());

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("memory_state");
  });

  it("gives the final episode an explicit continuity contract", async () => {
    mockSuccessfulLlmResponse();

    await generateEpisodeScript(
      baseParams({
        episodeNumber: 10,
        seasonContext: { totalEpisodeCount: 10 },
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("episode 10 of 10 (FINAL EPISODE)");
    expect(userMessage.content).toContain("Every episode_memory.threads_opened entry MUST include expected_resolution");
    expect(userMessage.content).toContain("Do not emit future_episode at the season boundary");
  });

  it("rejects an opened thread without a resolution classification before charging credits", async () => {
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                ...VALID_SCRIPT,
                episode_memory: {
                  recap: "A new clue appears.",
                  canonical_facts: [],
                  threads_opened: [
                    {
                      thread_id: "unclassified-clue",
                      description: "A clue that needs a planned payoff.",
                      thread_class: "plot",
                    },
                  ],
                  threads_resolved: [],
                },
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      },
    });

    await expect(
      generateEpisodeScript(
        baseParams({
          seasonContext: { totalEpisodeCount: 10 },
        }),
      ),
    ).rejects.toThrow("Episode continuity metadata failed the authoring contract");
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});

describe("generateEpisodeScript — truncated-JSON retry (shares executeJsonPlanningCallWithRetry with the start-frame/motion-prompt generators)", () => {
  it("retries once on truncated JSON and succeeds using the SAME model on retry", async () => {
    const fullJson = JSON.stringify(VALID_SCRIPT);
    const truncated = fullJson.slice(0, fullJson.indexOf('"hook"') + 20);

    mockExecuteWithFallback
      .mockResolvedValueOnce({
        type: "success",
        response: {
          choices: [{ message: { content: truncated } }],
          usage: { prompt_tokens: 100, completion_tokens: 4000 },
        },
      })
      .mockResolvedValueOnce({
        type: "success",
        response: {
          choices: [{ message: { content: fullJson } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        },
      });

    const result = await generateEpisodeScript(baseParams());

    expect(result.script.episode_title).toBe("Midnight Verdict");
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(2);
    expect(mockExecuteWithFallback.mock.calls[0][0].model).toBe(
      mockExecuteWithFallback.mock.calls[1][0].model,
    );
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws (does not silently persist a partial script) when both attempts return truncated JSON", async () => {
    const fullJson = JSON.stringify(VALID_SCRIPT);
    const truncated = fullJson.slice(0, fullJson.indexOf('"hook"') + 20);
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: truncated } }],
        usage: { prompt_tokens: 100, completion_tokens: 4000 },
      },
    });

    await expect(generateEpisodeScript(baseParams())).rejects.toThrow();

    // 1 initial + VD_SCHEMA_MAX_RETRIES (2) corrective retries
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(3);
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
