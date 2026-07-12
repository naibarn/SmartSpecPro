/**
 * Coverage for `verticalDramaScriptGeneration.ts`'s deep story drafts
 * hydration (W10-B, spec/section-16 refine-mode, added 2026-07-08):
 *  - `episode_draft` prompt injection, flag-gated on
 *    `opts.episodeDraftHydrationEnabled`, decoupled from the `episodeDraft`
 *    payload itself (same convention as `speech_budget`/
 *    `opts.speechBudgetEnabled` — see `verticalDramaScriptGeneration.speechBudget.test.ts`);
 *  - the exact draft shot/dialogue content round-trips into the prompt
 *    unchanged (a "hydrate + refine" base, not a summary);
 *  - a non-draft episode (no `episodeDraft` supplied) produces a
 *    byte-identical prompt to before this change, even with the flag on;
 *  - the dialogue-complete schema / coverage gate (`opts.speechBudgetEnabled`)
 *    is completely independent of this flag.
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

/** A vetted W10-A per-shot draft — exact shape `readItemShotDrafts` returns. */
function sampleEpisodeDraft() {
  return {
    shots: [
      {
        shot_number: 1,
        summary: "Aria discovers the clinic-collateral clause mid-signing",
        dialogue_lines: [
          { speaker: "char_aria", line: "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ", delivery: "เย็นชา" },
        ],
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

describe("generateEpisodeScript — episode draft hydration (refine mode, flag-gated, W10-B)", () => {
  it("injects episode_draft with the exact draft shot/dialogue content when opts.episodeDraftHydrationEnabled is true and episodeDraft is supplied", async () => {
    const episodeDraft = sampleEpisodeDraft();

    await generateEpisodeScript(
      baseParams({
        opts: { episodeDraftHydrationEnabled: true },
        episodeDraft,
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("episode_draft");
    // Refine-mode instruction sentence travels with the payload.
    expect(userMessage.content).toContain(
      "A vetted per-shot draft exists — REFINE it into the full script schema",
    );

    // The exact draft content round-trips unchanged (hydrate + refine, not a
    // regenerated summary). `episode_draft: {...}` is always immediately
    // followed by "\n\n" (JSON.stringify emits compact, no-newline JSON, so
    // the ONLY "}" followed by "\n\n" is the outermost one) — mirrors
    // `verticalDramaScriptGeneration.speechBudget.test.ts`'s identical
    // `speech_budget` extraction technique.
    const match = userMessage.content.match(/episode_draft: (\{.*?\})\n\n/);
    expect(match).toBeTruthy();
    const payload = JSON.parse(match![1]);
    expect(payload).toEqual(episodeDraft);
    expect(payload.shots[0].dialogue_lines[0].line).toBe("เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ");
    expect(payload.shots[1].silence_intent).toBe("establishing");
    expect(payload.cliffhanger_line).toBe(episodeDraft.cliffhanger_line);
  });

  it("omits episode_draft entirely when the flag is off, even though episodeDraft is supplied (byte-identical to before this change)", async () => {
    await generateEpisodeScript(
      baseParams({
        episodeDraft: sampleEpisodeDraft(),
        // opts omitted entirely — mirrors a caller that predates this flag.
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("episode_draft");
    expect(userMessage.content).not.toContain("REFINE it into the full script schema");
  });

  it("omits episode_draft when the flag is explicitly false, even with episodeDraft supplied", async () => {
    await generateEpisodeScript(
      baseParams({
        opts: { episodeDraftHydrationEnabled: false },
        episodeDraft: sampleEpisodeDraft(),
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("episode_draft");
  });

  it("omits episode_draft when the flag is on but no episodeDraft is supplied (non-draft episode — payload byte-identical to today)", async () => {
    await generateEpisodeScript(baseParams({ opts: { episodeDraftHydrationEnabled: true } }));

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("episode_draft");
  });

  it("produces a fully byte-identical prompt to a call with no opts/episodeDraft at all when both are omitted (control case)", async () => {
    await generateEpisodeScript(baseParams());
    const withoutAnything = mockExecuteWithFallback.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user",
    ).content;

    vi.clearAllMocks();
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined);
    mockCalculateCreditsForLLM.mockReturnValue(3);
    mockLlmResponse();

    await generateEpisodeScript(baseParams({ opts: { episodeDraftHydrationEnabled: false } }));
    const withFlagFalse = mockExecuteWithFallback.mock.calls[0][0].messages.find(
      (m: { role: string }) => m.role === "user",
    ).content;

    expect(withFlagFalse).toBe(withoutAnything);
  });

  it("is independent of opts.speechBudgetEnabled — both sections can render together without interfering", async () => {
    const episodeDraft = sampleEpisodeDraft();
    // speechBudgetEnabled also runs the post-generation coverage gate, which
    // requires a well-filled script (unrelated to this test's focus) —
    // otherwise it throws VdEpisodeUnderfilledError before this test can
    // assert anything about the prompt.
    mockLlmResponse({
      ...VALID_SCRIPT,
      structure: {
        mode: "beat",
        acts: [],
        beats: [
          {
            beat: 1,
            summary: "Beat 1",
            dialogue_lines: [{ speaker: "char_aria", line: "line one", estimated_speech_seconds: 40 }],
          },
        ],
      },
    });

    await generateEpisodeScript(
      baseParams({
        opts: { speechBudgetEnabled: true, episodeDraftHydrationEnabled: true },
        episodeDraft,
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("speech_budget");
    expect(userMessage.content).toContain("episode_draft");
  });

  it("still deducts credits normally when episode draft hydration is on (generation is not skipped)", async () => {
    const result = await generateEpisodeScript(
      baseParams({
        opts: { episodeDraftHydrationEnabled: true },
        episodeDraft: sampleEpisodeDraft(),
      }),
    );

    expect(result.script.episode_title).toBe("Midnight Verdict");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });
});
