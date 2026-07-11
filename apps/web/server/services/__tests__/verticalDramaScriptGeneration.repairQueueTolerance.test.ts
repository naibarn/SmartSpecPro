/**
 * Regression coverage for `vertical_drama_episode_runs` row 64
 * (`VD_SCHEMA_VALIDATION_FAILED`, series 6 / episode 2, stage
 * `plan_episode_script`): the model emitted `repair_queue` items as bare
 * strings instead of `{code, message}` objects, and
 * `scriptBuilderOutputSchema`'s strict `z.array(z.object({}).passthrough())`
 * rejected the whole episode script.
 *
 * `warnings`/`repair_queue` now tolerate a bare string item by coercing it
 * to `{ message: string }` (mirrors this codebase's established "tolerant
 * reader, never throws" convention — see `verticalDramaStoryBible.ts`'s
 * `readItemCliffhangerLine` and the parser robustness fixes in
 * `shared/verticalDramaSeries/storyScriptText.ts`) instead of hard-failing.
 * An already-well-formed array of objects must still validate unchanged.
 *
 * Mirrors `verticalDramaScriptGeneration.sceneContracts.test.ts`'s mocking
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

import { generateEpisodeScript, scriptBuilderOutputSchema } from "../verticalDramaScriptGeneration";

const BASE_SCRIPT: Record<string, unknown> = {
  contract_version: 1,
  episode_title: "Midnight Verdict",
  hook: "Aria's phone lights up mid-signature.",
  structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "Beat 1" }] },
  scene_dialogue_summary: [],
  cliffhanger: "The board turns on the rival next.",
  character_state_deltas: [],
  product_tie_in_plan: {},
  continuity_notes: [],
};

function baseParams(over: Record<string, unknown> = {}) {
  return {
    userId: 42,
    tenantId: "tenant-1",
    seriesId: 6,
    episodeId: 42,
    episodeTitle: "Episode 2",
    episodeNumber: 2,
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

describe("scriptBuilderOutputSchema — warnings/repair_queue string-item tolerance", () => {
  it("coerces bare-string repair_queue/warnings items into {message: string} instead of failing validation", () => {
    const parsed = scriptBuilderOutputSchema.parse({
      ...BASE_SCRIPT,
      warnings: ["speech budget still short by 4s"],
      repair_queue: [
        "beat 4 dialogue is still under the speech-budget target",
        "cliffhanger needs a stronger payoff",
      ],
    });

    expect(parsed.warnings).toEqual([{ message: "speech budget still short by 4s" }]);
    expect(parsed.repair_queue).toEqual([
      { message: "beat 4 dialogue is still under the speech-budget target" },
      { message: "cliffhanger needs a stronger payoff" },
    ]);
  });

  it("leaves an already-well-formed array of objects unchanged (no regression)", () => {
    const parsed = scriptBuilderOutputSchema.parse({
      ...BASE_SCRIPT,
      warnings: [{ code: "none", message: "no blocking issues" }],
      repair_queue: [
        { code: "speech_budget_shortfall", message: "beat 2 is under target" },
      ],
    });

    expect(parsed.warnings).toEqual([{ code: "none", message: "no blocking issues" }]);
    expect(parsed.repair_queue).toEqual([
      { code: "speech_budget_shortfall", message: "beat 2 is under target" },
    ]);
  });

  it("tolerates a mixed array of bare strings and well-formed objects in the same field", () => {
    const parsed = scriptBuilderOutputSchema.parse({
      ...BASE_SCRIPT,
      warnings: [],
      repair_queue: [
        "plain string entry",
        { code: "custom_code", message: "object entry", extra: "passthrough-ok" },
      ],
    });

    expect(parsed.repair_queue).toEqual([
      { message: "plain string entry" },
      { code: "custom_code", message: "object entry", extra: "passthrough-ok" },
    ]);
  });
});

describe("generateEpisodeScript — end-to-end tolerance for a drifted repair_queue (regression for run 64)", () => {
  it("succeeds (does not throw VD_SCHEMA_VALIDATION_FAILED) when the LLM emits repair_queue as plain strings", async () => {
    mockLlmResponse({
      ...BASE_SCRIPT,
      warnings: [{ code: "none", message: "no blocking issues" }],
      repair_queue: [
        "beat 4 dialogue is still under the speech-budget target",
        "cliffhanger needs a stronger payoff",
      ],
    });

    const result = await generateEpisodeScript(baseParams());

    expect(result.script.repair_queue).toEqual([
      { message: "beat 4 dialogue is still under the speech-budget target" },
      { message: "cliffhanger needs a stronger payoff" },
    ]);
    expect(result.script.warnings).toEqual([{ code: "none", message: "no blocking issues" }]);
  });

  it("still succeeds unchanged when repair_queue/warnings are already well-formed objects (no regression)", async () => {
    mockLlmResponse({
      ...BASE_SCRIPT,
      warnings: [{ code: "none", message: "no blocking issues" }],
      repair_queue: [],
    });

    const result = await generateEpisodeScript(baseParams());

    expect(result.script.repair_queue).toEqual([]);
    expect(result.script.warnings).toEqual([{ code: "none", message: "no blocking issues" }]);
  });
});
