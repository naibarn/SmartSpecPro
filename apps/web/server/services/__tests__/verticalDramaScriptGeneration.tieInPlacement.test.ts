/**
 * Coverage for `verticalDramaScriptGeneration.ts`'s season-plan tie-in
 * consumer (task #31, spec §7.7.2/§7.7.3, added 2026-07-09) —
 * `GenerateEpisodeScriptParams.episodeTieInPlacement`'s 3-way branch:
 *  - `planned: true`  -> FORCES the tie-in section (no "skip if unnatural"
 *    escape hatch), injects benefitFocus/intensity guidance;
 *  - `planned: false` -> OMITS the tie-in section entirely, even though the
 *    series-level `productTieIn.enabled` policy is on;
 *  - absent            -> today's `productTieIn.enabled`-only behavior,
 *    byte-identical (grandfather).
 *
 * Mirrors `verticalDramaScriptGeneration.speechBudget.test.ts`'s mocking
 * pattern exactly (same skill-loading / credit / LLM-router mocks) and its
 * "assert on the actual prompt string sent to the LLM" convention.
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

const VALID_SCRIPT_BASE = {
  contract_version: 1,
  episode_title: "Midnight Verdict",
  hook: "Aria's phone lights up mid-signature.",
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

function wellFilledScript(): Record<string, unknown> {
  return {
    ...VALID_SCRIPT_BASE,
    structure: {
      mode: "beat",
      acts: [],
      beats: Array.from({ length: 6 }, (_, i) => ({ beat: i + 1, summary: `Beat ${i + 1}` })),
    },
  };
}

async function promptContent(params: Record<string, unknown>): Promise<string> {
  await generateEpisodeScript(params as Parameters<typeof generateEpisodeScript>[0]);
  const callArgs = mockExecuteWithFallback.mock.calls[0][0];
  const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
  return userMessage.content as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
  mockLlmResponse(wellFilledScript());
});

const ENABLED_PRODUCT_TIE_IN = {
  enabled: true,
  productName: "GlowSerum",
  productDescription: "A brightening face serum",
  allowedStoryFunctions: ["daily_use"],
  forbiddenClaims: [],
};

describe("generateEpisodeScript — episodeTieInPlacement (task #31, spec §7.7.2/§7.7.3)", () => {
  it("grandfather: absent episodeTieInPlacement + productTieIn.enabled -> today's MANDATORY-when-enabled framing (no REQUIRED override)", async () => {
    // The escape-hatch instruction itself ("If tie-in cannot be placed
    // naturally...") is now authored once in skill.md's "Product Tie-In"
    // section (skill-first architecture) rather than restated in the
    // prompt — this test only asserts on the raw MANDATORY-vs-REQUIRED
    // framing fact `buildUserPrompt` still supplies.
    const content = await promptContent(baseParams({ productTieIn: ENABLED_PRODUCT_TIE_IN }));

    expect(content).toContain("product_tie_in_policy");
    expect(content).toContain("MANDATORY when enabled");
    expect(content).not.toContain("REQUIRED this episode");
  });

  it("productTieIn disabled entirely: no tie-in section regardless of episodeTieInPlacement", async () => {
    const content = await promptContent(
      baseParams({
        productTieIn: { enabled: false },
        episodeTieInPlacement: { planned: true, source: "planned" },
      }),
    );

    expect(content).not.toContain("product_tie_in_policy");
  });

  it("planned: true FORCES the tie-in section with the REQUIRED framing", async () => {
    const content = await promptContent(
      baseParams({
        productTieIn: ENABLED_PRODUCT_TIE_IN,
        episodeTieInPlacement: { planned: true, source: "planned" },
      }),
    );

    expect(content).toContain("product_tie_in_policy");
    expect(content).toContain("REQUIRED this episode");
    expect(content).not.toContain("MANDATORY when enabled");
  });

  it("planned: true injects benefitFocus and intensity guidance when supplied", async () => {
    const content = await promptContent(
      baseParams({
        productTieIn: ENABLED_PRODUCT_TIE_IN,
        episodeTieInPlacement: {
          planned: true,
          source: "deferred",
          movedFromEpisodeNumber: 1,
          benefitFocus: "long-lasting hydration",
          intensity: "featured",
        },
      }),
    );

    expect(content).toContain("long-lasting hydration");
    expect(content).toContain("featured");
    expect(content).toContain("hero-prop moment");
  });

  it("planned: false OMITS the tie-in section entirely, even though productTieIn.enabled is true", async () => {
    const content = await promptContent(
      baseParams({
        productTieIn: ENABLED_PRODUCT_TIE_IN,
        episodeTieInPlacement: { planned: false, source: "planned" },
      }),
    );

    expect(content).not.toContain("product_tie_in_policy");
    expect(content).not.toContain("PRODUCT TIE-IN");
  });
});
