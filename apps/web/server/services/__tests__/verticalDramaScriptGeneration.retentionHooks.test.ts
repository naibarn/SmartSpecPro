/**
 * Coverage for `verticalDramaScriptGeneration.ts`'s retention-hooks
 * additions (`planning/vertical-drama-retention-hooks/plan.md` W1/W2, added
 * 2026-07-11):
 *  - `genre` / `recentRetentionLoopTypes` prompt injection, flag-gated on
 *    `opts.retentionHooksEnabled` — MUST be byte-identical to before this
 *    change when the flag is off/omitted (the #1 safety guarantee for this
 *    round);
 *  - `scriptBuilderOutputSchema`'s new optional `open_loops[]` /
 *    `retention_loop` superset (backward-compatible, never required).
 *
 * Mirrors `verticalDramaScriptGeneration.speechBudget.test.ts`'s mocking
 * pattern exactly.
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
vi.mock("../verticalDramaLlmModelPolicy", () => ({
  resolveVerticalDramaSeriesModel: vi.fn(
    (_seriesId: number, autoFallback: () => Promise<string | null>) => autoFallback(),
  ),
}));

import { generateEpisodeScript, scriptBuilderOutputSchema } from "../verticalDramaScriptGeneration";

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

function mockLlmResponse(script: unknown) {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(script) } }],
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

/* -------------------------------------------------------------------------- */
/* Flags-off byte-identical (the #1 safety guarantee)                        */
/* -------------------------------------------------------------------------- */

describe("generateEpisodeScript — retention-hooks prompt injection is byte-identical when the flag is off", () => {
  it("omits genre entirely when opts.retentionHooksEnabled is absent, even though genre is supplied", async () => {
    mockLlmResponse(VALID_SCRIPT);

    await generateEpisodeScript(baseParams({ genre: "romance" }));

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("genre:");
    expect(userMessage.content).not.toContain("recent_retention_loop_types");
  });

  it("omits genre when opts.retentionHooksEnabled is explicitly false", async () => {
    mockLlmResponse(VALID_SCRIPT);

    await generateEpisodeScript(
      baseParams({
        genre: "educational",
        recentRetentionLoopTypes: ["clue", "threat"],
        opts: { retentionHooksEnabled: false },
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("genre:");
    expect(userMessage.content).not.toContain("recent_retention_loop_types");
  });

  it("produces the exact same prompt with and without genre/recentRetentionLoopTypes supplied, when the flag is off (true byte-identical proof)", async () => {
    mockLlmResponse(VALID_SCRIPT);

    await generateEpisodeScript(baseParams());
    const withoutFacts = mockExecuteWithFallback.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user",
    ).content;

    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined);
    mockCalculateCreditsForLLM.mockReturnValue(3);
    mockLlmResponse(VALID_SCRIPT);

    await generateEpisodeScript(
      baseParams({ genre: "drama", recentRetentionLoopTypes: ["promise"] }),
    );
    const withFactsButFlagOff = mockExecuteWithFallback.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user",
    ).content;

    expect(withFactsButFlagOff).toBe(withoutFacts);
  });
});

/* -------------------------------------------------------------------------- */
/* Flags-on rendering                                                        */
/* -------------------------------------------------------------------------- */

describe("generateEpisodeScript — retention-hooks prompt injection (flag on)", () => {
  it("renders the genre fact when opts.retentionHooksEnabled is true and genre is supplied", async () => {
    mockLlmResponse(VALID_SCRIPT);

    await generateEpisodeScript(
      baseParams({ genre: "romance", opts: { retentionHooksEnabled: true } }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("genre: romance");
  });

  it("omits genre when the flag is on but genre is absent/null", async () => {
    mockLlmResponse(VALID_SCRIPT);

    await generateEpisodeScript(baseParams({ opts: { retentionHooksEnabled: true } }));

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("genre:");
  });

  it("renders recent_retention_loop_types when the flag is on and the array is non-empty", async () => {
    mockLlmResponse(VALID_SCRIPT);

    await generateEpisodeScript(
      baseParams({
        recentRetentionLoopTypes: ["clue", "threat", "clue"],
        opts: { retentionHooksEnabled: true },
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("recent_retention_loop_types");
    expect(userMessage.content).toContain('["clue","threat","clue"]');
  });

  it("omits recent_retention_loop_types when the flag is on but the array is empty/absent", async () => {
    mockLlmResponse(VALID_SCRIPT);

    await generateEpisodeScript(
      baseParams({ recentRetentionLoopTypes: [], opts: { retentionHooksEnabled: true } }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("recent_retention_loop_types");
  });
});

/* -------------------------------------------------------------------------- */
/* scriptBuilderOutputSchema — open_loops[] / retention_loop superset        */
/* -------------------------------------------------------------------------- */

describe("scriptBuilderOutputSchema — open_loops[]/retention_loop superset (backward-compatible, never required)", () => {
  it("still parses a legacy script with neither open_loops nor retention_loop", () => {
    const result = scriptBuilderOutputSchema.safeParse(VALID_SCRIPT);
    expect(result.success).toBe(true);
  });

  it("parses a script with a well-formed open_loops[] entry and retention_loop object", () => {
    const script = {
      ...VALID_SCRIPT,
      open_loops: [
        {
          question: "who tipped off the rival's backers",
          planted_at_beat: 3,
          expected_resolution: "future_episode",
        },
      ],
      retention_loop: {
        type: "threat",
        description: "the rival's own backers just called an emergency vote",
        ties_to_beat: 3,
      },
    };
    const result = scriptBuilderOutputSchema.safeParse(script);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.open_loops).toHaveLength(1);
      expect(result.data.open_loops![0].expected_resolution).toBe("future_episode");
      expect(result.data.retention_loop?.type).toBe("threat");
    }
  });

  it("rejects an invalid retention_loop.type / expected_resolution enum value", () => {
    const badType = {
      ...VALID_SCRIPT,
      retention_loop: { type: "plot_twist", description: "x", ties_to_beat: 1 },
    };
    expect(scriptBuilderOutputSchema.safeParse(badType).success).toBe(false);

    const badResolution = {
      ...VALID_SCRIPT,
      open_loops: [{ question: "x", planted_at_beat: 1, expected_resolution: "never" }],
    };
    expect(scriptBuilderOutputSchema.safeParse(badResolution).success).toBe(false);
  });

  it("accepts an empty open_loops[] array (Zod does not hard-enforce the >=1 skill.md rule — enforced by review LLM instead)", () => {
    const script = { ...VALID_SCRIPT, open_loops: [] };
    expect(scriptBuilderOutputSchema.safeParse(script).success).toBe(true);
  });
});
