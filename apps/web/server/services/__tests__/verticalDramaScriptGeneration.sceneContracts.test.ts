/**
 * Feature 132 §6 (F132C, scene contracts, `verticalDramaSceneContracts`,
 * added 2026-07-09) — coverage for `verticalDramaScriptGeneration.ts`'s
 * flag-gated "honor the draft shot's contract" instruction.
 *
 * Mirrors `verticalDramaScriptGeneration.episodeDraft.test.ts`'s mocking
 * pattern exactly (same file, same skill, same LLM call surface).
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
  episode_title: "Midnight Verdict",
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

/** A vetted W10-A per-shot draft with a contract on one shot (F132C shape). */
function sampleEpisodeDraftWithContract() {
  return {
    shots: [
      {
        shot_number: 1,
        summary: "Aria discovers the clinic-collateral clause mid-signing",
        dialogue_lines: [
          { speaker: "char_aria", line: "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ", delivery: "เย็นชา" },
        ],
        contract: {
          storyFunction: "reveal",
          emotionalBeat: "dread",
          audienceTakeaway: "the clause is a trap",
          tensionSource: "time pressure",
          newClueIds: ["clue-1"],
          dialoguePurpose: "confront",
          characterDecision: "Aria decides to keep signing",
          anchorLine: true,
        },
      },
      {
        shot_number: 2,
        summary: "A quiet establishing beat before the confrontation",
        dialogue_lines: [],
        silence_intent: "establishing" as const,
      },
    ],
    cliffhanger_line: "Her assistant whispers that the rival's own board just called an emergency vote.",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
  mockLlmResponse();
});

describe("generateEpisodeScript — scene contract honoring instruction (F132C, flag-gated)", () => {
  it("byte-identical: omits the contract instruction when opts.sceneContractsEnabled is absent, even with a contract-bearing episodeDraft + hydration flag on", async () => {
    await generateEpisodeScript(
      baseParams({
        opts: { episodeDraftHydrationEnabled: true },
        episodeDraft: sampleEpisodeDraftWithContract(),
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("contract.newClueIds budget");
  });

  it("byte-identical: omits the contract instruction when opts.sceneContractsEnabled is explicitly false", async () => {
    await generateEpisodeScript(
      baseParams({
        opts: { episodeDraftHydrationEnabled: true, sceneContractsEnabled: false },
        episodeDraft: sampleEpisodeDraftWithContract(),
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("contract.newClueIds budget");
  });

  it("adds the contract-honoring instruction when sceneContractsEnabled is true AND episodeDraft hydration rendered", async () => {
    await generateEpisodeScript(
      baseParams({
        opts: { episodeDraftHydrationEnabled: true, sceneContractsEnabled: true },
        episodeDraft: sampleEpisodeDraftWithContract(),
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("contract.newClueIds budget");
    expect(userMessage.content).toContain("storyFunction");
    expect(userMessage.content).toContain("characterDecision visible");
    // The actual contract data itself already travels for free inside
    // episode_draft's JSON.stringify payload.
    expect(userMessage.content).toContain('"newClueIds":["clue-1"]');
  });

  it("omits the contract instruction when sceneContractsEnabled is true but there is no episodeDraft at all (nothing to honor)", async () => {
    await generateEpisodeScript(
      baseParams({ opts: { sceneContractsEnabled: true } }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("contract.newClueIds budget");
  });

  it("omits the contract instruction when sceneContractsEnabled is true but episodeDraftHydrationEnabled is off (hydration section itself never rendered)", async () => {
    await generateEpisodeScript(
      baseParams({
        opts: { sceneContractsEnabled: true, episodeDraftHydrationEnabled: false },
        episodeDraft: sampleEpisodeDraftWithContract(),
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("episode_draft");
    expect(userMessage.content).not.toContain("contract.newClueIds budget");
  });

  it("produces a fully byte-identical prompt to a call with no opts at all when opts is completely omitted (control case)", async () => {
    await generateEpisodeScript(baseParams());
    const withoutAnything = mockExecuteWithFallback.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user",
    ).content;

    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined);
    mockCalculateCreditsForLLM.mockReturnValue(3);
    mockLlmResponse();

    await generateEpisodeScript(baseParams({ opts: { sceneContractsEnabled: false } }));
    const withFlagFalse = mockExecuteWithFallback.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user",
    ).content;

    expect(withFlagFalse).toBe(withoutAnything);
  });
});
