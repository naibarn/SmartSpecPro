/**
 * Coverage for `verticalDramaScriptGeneration.ts`'s `repairContext`
 * (real-repair wiring for `verticalDramaEpisodePipeline.ts`'s `repairStage`,
 * see that method's doc comment):
 *  - `repairContext` injects the raw `current_script`/`repair_instruction`
 *    facts into the prompt, flag-free/decoupled exactly like
 *    `episode_draft`/`speech_budget` (see
 *    `verticalDramaScriptGeneration.episodeDraft.test.ts`'s identical
 *    convention). The "you are REPAIRING, not writing from scratch; apply
 *    only the requested change" behavioral contract itself now lives in
 *    skill.md's "Repair Mode" section (skill-first architecture, see
 *    `planning/vertical-drama-skill-first-architecture/plan.md` Tier 5) —
 *    this file no longer authors that instruction text, so these tests
 *    assert on the raw facts reaching the prompt, not on authored sentences;
 *  - a fresh-generation call (no `repairContext`) produces a byte-identical
 *    prompt to before this parameter existed;
 *  - the credit-check/deduct + coverage-gate flow is completely unaffected
 *    by `repairContext` — a repair is charged and gated exactly like a
 *    fresh generation.
 *
 * Mirrors `verticalDramaScriptGeneration.episodeDraft.test.ts`'s mocking
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

import { generateEpisodeScript } from "../verticalDramaScriptGeneration";

const VALID_SCRIPT: Record<string, unknown> = {
  contract_version: 1,
  episode_title: "Midnight Verdict — Repaired",
  hook: "Aria's phone lights up mid-signature.",
  structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "Beat 1" }] },
  scene_dialogue_summary: [],
  cliffhanger: "The board turns on the rival next.",
  character_state_deltas: [],
  product_tie_in_plan: {},
  continuity_notes: [],
  warnings: [],
  repair_queue: [],
};

const CURRENT_SCRIPT: Record<string, unknown> = {
  contract_version: 1,
  episode_title: "Midnight Verdict",
  hook: "Aria's phone lights up mid-signature.",
  structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "Original beat 1" }] },
  scene_dialogue_summary: [],
  cliffhanger: "A weak cliffhanger.",
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

function mockLlmResponse(script: unknown = VALID_SCRIPT) {
  mockExecuteWithFallback.mockResolvedValue({
    type: "success",
    response: {
      choices: [{ message: { content: JSON.stringify(script) } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    },
  });
}

function userMessageContent(): string {
  const callArgs = mockExecuteWithFallback.mock.calls[0][0];
  return callArgs.messages.find((m: { role: string }) => m.role === "user").content;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
  mockLlmResponse();
});

describe("generateEpisodeScript — repairContext (real-repair wiring for repairStage)", () => {
  it("injects the raw current_script + repair_instruction facts when repairContext is supplied", async () => {
    await generateEpisodeScript(
      baseParams({
        repairContext: {
          currentScript: CURRENT_SCRIPT,
          instruction: "ทำให้ cliffhanger น่าตื่นเต้นกว่านี้",
        },
      }),
    );

    const content = userMessageContent();
    expect(content).toContain("repair_instruction: ทำให้ cliffhanger น่าตื่นเต้นกว่านี้");

    const match = content.match(/current_script: (\{.*?\})\nrepair_instruction/);
    expect(match).toBeTruthy();
    expect(JSON.parse(match![1])).toEqual(CURRENT_SCRIPT);
  });

  it("omits current_script/repair_instruction entirely when repairContext is absent (fresh generation, byte-identical to before this field existed)", async () => {
    await generateEpisodeScript(baseParams());

    const content = userMessageContent();
    expect(content).not.toContain("repair_instruction");
    expect(content).not.toContain("current_script");
  });

  it("still runs the same credit-check -> call -> deduct-credits flow for a repair call (no special-casing)", async () => {
    await generateEpisodeScript(
      baseParams({
        repairContext: { currentScript: CURRENT_SCRIPT, instruction: "fix it" },
      }),
    );

    expect(mockHasEnoughCredits).toHaveBeenCalledTimes(1);
    expect(mockExecuteWithFallback).toHaveBeenCalledTimes(1);
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("throws InsufficientCreditsError for a repair call exactly like a fresh generation when credits are insufficient", async () => {
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      generateEpisodeScript(
        baseParams({
          repairContext: { currentScript: CURRENT_SCRIPT, instruction: "fix it" },
        }),
      ),
    ).rejects.toThrow();

    expect(mockExecuteWithFallback).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });
});
