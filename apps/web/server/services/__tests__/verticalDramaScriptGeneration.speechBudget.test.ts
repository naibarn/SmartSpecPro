/**
 * Coverage for `verticalDramaScriptGeneration.ts`'s story-density reform
 * additions (spec §7.7.2 Layer 2, section-13, added 2026-07-07):
 *  - `scriptBuilderOutputSchema`'s dialogue-complete superset
 *    (`dialogue_lines[]` / beat-level `estimated_speech_seconds`);
 *  - `speech_budget` / `content_budget` prompt injection, flag-gated on
 *    `opts.speechBudgetEnabled`;
 *  - the pure `evaluateScriptSpeechCoverage` classifier;
 *  - `generateEpisodeScript`'s post-generation coverage gate (throws
 *    `VdEpisodeUnderfilledError` with stable code
 *    `VD_DIALOGUE_EPISODE_UNDERFILLED` when critically underfilled, flag-on
 *    only; credits are NOT deducted when it throws).
 *
 * Mirrors `verticalDramaScriptGeneration.memoryBundle.test.ts`'s mocking
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

import {
  generateEpisodeScript,
  evaluateScriptSpeechCoverage,
  VdEpisodeUnderfilledError,
  scriptBuilderOutputSchema,
  type ScriptBuilderOutput,
} from "../verticalDramaScriptGeneration";

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

/** A well-filled script: 8 beats x 2 dialogue lines each, each line's own
 * estimated_speech_seconds pre-computed generously (well above the ~35s
 * MIN_EPISODE_COVERAGE_RATIO floor for a 60s episode). */
function wellFilledScript(): Record<string, unknown> {
  const beats = Array.from({ length: 8 }, (_, i) => ({
    beat: i + 1,
    summary: `Beat ${i + 1} summary`,
    dialogue_lines: [
      { speaker: "Aria", line: `Line A for beat ${i + 1}`, estimated_speech_seconds: 3 },
      { speaker: "Somchai", line: `Line B for beat ${i + 1}`, estimated_speech_seconds: 3 },
    ],
    estimated_speech_seconds: 6,
  }));
  return {
    ...VALID_SCRIPT_BASE,
    structure: { mode: "beat", acts: [], beats },
  };
}

/**
 * A critically underfilled script: SOME beat-level dialogue exists, but
 * nowhere near the ~35s floor for a 60s episode — "real dialogue exists,
 * but far too little" (as opposed to `noDialogueDataScript()` below, which
 * has NO dialogue data anywhere at all — 2026-07-08 fix distinguishes the
 * two, see `evaluateScriptSpeechCoverage`'s doc comment).
 */
function underfilledScript(): Record<string, unknown> {
  return {
    ...VALID_SCRIPT_BASE,
    structure: {
      mode: "beat",
      acts: [],
      beats: [
        {
          beat: 1,
          summary: "Only a tiny sliver of dialogue",
          dialogue_lines: [{ speaker: "Aria", line: "Hi.", estimated_speech_seconds: 3 }],
        },
      ],
    },
  };
}

/**
 * A script with NO dialogue data anywhere — no beat-level `dialogue_lines[]`
 * AND an empty legacy `scene_dialogue_summary[]` (`VALID_SCRIPT_BASE`
 * already sets that to `[]`) — the distinct `no_dialogue_data` case (spec
 * §17 grandfathering), 2026-07-08 fix.
 */
function noDialogueDataScript(): Record<string, unknown> {
  return {
    ...VALID_SCRIPT_BASE,
    structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "Only a summary, no lines" }] },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue(undefined);
  mockCalculateCreditsForLLM.mockReturnValue(3);
});

/* -------------------------------------------------------------------------- */
/* Schema superset                                                            */
/* -------------------------------------------------------------------------- */

describe("scriptBuilderOutputSchema — dialogue-complete superset", () => {
  it("still parses a legacy script with no dialogue_lines[] anywhere (byte-compatible)", () => {
    const legacy = {
      ...VALID_SCRIPT_BASE,
      structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "A beat with no dialogue_lines" }] },
    };
    const result = scriptBuilderOutputSchema.safeParse(legacy);
    expect(result.success).toBe(true);
  });

  it("parses a new script with per-beat dialogue_lines and beat-level estimated_speech_seconds", () => {
    const result = scriptBuilderOutputSchema.safeParse(wellFilledScript());
    expect(result.success).toBe(true);
    if (result.success) {
      const parsedBeats = (result.data as ScriptBuilderOutput).structure.beats!;
      expect(parsedBeats[0].dialogue_lines).toHaveLength(2);
      expect(parsedBeats[0].dialogue_lines![0].speaker).toBe("Aria");
      expect(parsedBeats[0].estimated_speech_seconds).toBe(6);
    }
  });

  it("requires speaker and line per dialogue_lines entry", () => {
    const missingSpeaker = {
      ...VALID_SCRIPT_BASE,
      structure: {
        mode: "beat",
        beats: [{ beat: 1, dialogue_lines: [{ line: "Text with no speaker" }] }],
      },
    };
    expect(scriptBuilderOutputSchema.safeParse(missingSpeaker).success).toBe(false);

    const missingLine = {
      ...VALID_SCRIPT_BASE,
      structure: {
        mode: "beat",
        beats: [{ beat: 1, dialogue_lines: [{ speaker: "Aria" }] }],
      },
    };
    expect(scriptBuilderOutputSchema.safeParse(missingLine).success).toBe(false);
  });

  it("accepts optional delivery/subtext fields on a dialogue line", () => {
    const withExtras = {
      ...VALID_SCRIPT_BASE,
      structure: {
        mode: "beat",
        beats: [
          {
            beat: 1,
            dialogue_lines: [
              {
                speaker: "Aria",
                line: "We need to talk.",
                delivery: "urgent whisper",
                subtext: "she already knows",
                estimated_speech_seconds: 1.2,
              },
            ],
          },
        ],
      },
    };
    expect(scriptBuilderOutputSchema.safeParse(withExtras).success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* evaluateScriptSpeechCoverage (pure)                                        */
/* -------------------------------------------------------------------------- */

describe("evaluateScriptSpeechCoverage", () => {
  it("classifies a well-filled 60s episode as in_range", () => {
    const parsed = scriptBuilderOutputSchema.parse(wellFilledScript());
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    expect(result.estimatedSpeechSeconds).toBe(48); // 8 beats x 6s
    expect(result.coverageRatio).toBeCloseTo(48 / 60, 5);
    expect(result.status).toBe("in_range");
  });

  it("classifies a script with SOME beat-level dialogue but far too little as underfilled_error", () => {
    const parsed = scriptBuilderOutputSchema.parse(underfilledScript());
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    expect(result.estimatedSpeechSeconds).toBe(3);
    expect(result.status).toBe("underfilled_error");
  });

  it("classifies a script with NO dialogue data anywhere (no beat-level dialogue_lines AND empty legacy scene_dialogue_summary) as no_dialogue_data, never underfilled_error (2026-07-08 fix, spec §17 grandfathering)", () => {
    const parsed = scriptBuilderOutputSchema.parse(noDialogueDataScript());
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    expect(result.estimatedSpeechSeconds).toBe(0);
    expect(result.status).toBe("no_dialogue_data");
  });

  it("always returns the canonical episode-level target band, regardless of status", () => {
    const inRange = evaluateScriptSpeechCoverage(scriptBuilderOutputSchema.parse(wellFilledScript()), 60);
    const noData = evaluateScriptSpeechCoverage(scriptBuilderOutputSchema.parse(noDialogueDataScript()), 60);
    for (const result of [inRange, noData]) {
      expect(result.targetSpeechSecondsMin).toBeCloseTo(17.4, 5); // 0.29 * 60 (MIN_EPISODE_COVERAGE_RATIO rescaled 0.58->0.29 alongside THAI_CHARS_PER_SECOND 8.5->17)
      expect(result.targetSpeechSecondsMax).toBeCloseTo(20.4, 5); // default 8-clip profile sum, rescaled x0.5 alongside the target-clip ratio
    }
  });

  it("classifies a moderately underfilled episode as underfilled_warning (below MIN, at/above ERROR)", () => {
    const script = {
      ...VALID_SCRIPT_BASE,
      structure: {
        mode: "beat",
        beats: [
          {
            beat: 1,
            dialogue_lines: [{ speaker: "Aria", line: "short", estimated_speech_seconds: 12.5 }],
          },
        ],
      },
    };
    const parsed = scriptBuilderOutputSchema.parse(script);
    const result = evaluateScriptSpeechCoverage(parsed, 60); // 12.5/60 = 0.208 -> between ERROR 0.165 and MIN 0.29 (halved alongside THAI_CHARS_PER_SECOND 8.5->17 to land in the same band)
    expect(result.status).toBe("underfilled_warning");
  });

  it("prefers a line's own estimated_speech_seconds over recomputing from text", () => {
    const script = {
      ...VALID_SCRIPT_BASE,
      structure: {
        mode: "beat",
        beats: [
          {
            beat: 1,
            dialogue_lines: [
              // Text is short, but the line explicitly self-reports 50s —
              // the explicit value must win over the canonical estimator.
              { speaker: "Aria", line: "hi", estimated_speech_seconds: 50 },
            ],
          },
        ],
      },
    };
    const parsed = scriptBuilderOutputSchema.parse(script);
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    expect(result.estimatedSpeechSeconds).toBe(50);
  });

  it("falls back to the canonical estimator when a line lacks estimated_speech_seconds", () => {
    const script = {
      ...VALID_SCRIPT_BASE,
      structure: {
        mode: "beat",
        beats: [
          {
            beat: 1,
            dialogue_lines: [{ speaker: "Aria", line: "สวัสดีตอนเช้าค่ะ" }], // no estimated_speech_seconds
          },
        ],
      },
    };
    const parsed = scriptBuilderOutputSchema.parse(script);
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    // 8 Thai chars / 17 chars-per-second (floored at 0.75) — must be > 0,
    // proving the canonical estimator ran instead of defaulting to 0.
    expect(result.estimatedSpeechSeconds).toBeGreaterThan(0);
  });
});

/* -------------------------------------------------------------------------- */
/* evaluateScriptSpeechCoverage — legacy scene_dialogue_summary fallback      */
/* (2026-07-08 fix, spec §17 grandfathering — reproduces the production bug:  */
/* a legacy script whose beats have no dialogue_lines[] but whose real       */
/* dialogue lives in the pre-existing scene_dialogue_summary[] shape, the    */
/* same shape resolveShotDialogueLines's source-3b already falls back to.)   */
/* -------------------------------------------------------------------------- */

describe("evaluateScriptSpeechCoverage — legacy scene_dialogue_summary fallback", () => {
  /**
   * Mirrors a real legacy (pre-speechBudget-flag) script: no beat-level
   *  dialogue_lines[] anywhere, but real dialogue lives in the legacy
   *  scene_dialogue_summary[].dialogue_lines[] freeform strings — exactly
   *  the shape resolveShotDialogueLines's source-3b already parses
   *  (verticalDramaEpisodes.ts). The main line is 313 repeated Thai
   *  characters — 313 / 17 chars-per-second ≈ 18.4s (rescaled 2026-07-15
   *  alongside THAI_CHARS_PER_SECOND 8.5->17; was ≈36.8s) — a deterministic
   *  stand-in for the EXACT production repro (owner's density meter showed
   *  "บทพูดรวม 36.8 วิ" / 0.61 coverage on a 60s episode, now displayed as
   *  ≈18.4s / same ≈0.31 coverage since MIN_EPISODE_COVERAGE_RATIO was
   *  rescaled 0.58->0.29 in lockstep) so this test's expected numbers can be
   *  computed exactly rather than hand-counting a natural-language sentence.
   */
  function legacyScriptWithSceneDialogue(): Record<string, unknown> {
    return {
      ...VALID_SCRIPT_BASE,
      structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "No embedded dialogue_lines" }] },
      scene_dialogue_summary: [
        { scene: 1, dialogue_lines: [`หนูนา: ${"ก".repeat(313)}`] },
        {
          scene: 2,
          dialogue_lines: ["เสียง…ลมพัดผ่านหน้าต่างเบาๆ"], // stage-direction/sound-cue fragment — must be filtered
        },
      ],
    };
  }

  it("falls back to scene_dialogue_summary[] when no beat has any dialogue_lines, instead of reporting 0/underfilled_error — reproduces the production contradiction (owner's screenshot: wizard said underfilled_error while the density meter, which resolves from this same legacy source, showed 36.8s/in_range on a 60s episode)", () => {
    const parsed = scriptBuilderOutputSchema.parse(legacyScriptWithSceneDialogue());
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    expect(result.estimatedSpeechSeconds).toBeCloseTo(313 / 17, 5); // ≈ 18.4s (was ≈36.8s pre-rescale)
    expect(result.status).toBe("in_range"); // 18.4/60 ≈ 0.307 >= MIN_EPISODE_COVERAGE_RATIO (0.29)
  });

  it("prefers beat-level dialogue_lines over the legacy fallback whenever source 1 has ANY entry (unchanged precedence, even when the legacy fallback alone would sum higher)", () => {
    const script = {
      ...VALID_SCRIPT_BASE,
      structure: {
        mode: "beat",
        beats: [
          { beat: 1, dialogue_lines: [{ speaker: "Aria", line: "hi", estimated_speech_seconds: 0.75 }] },
        ],
      },
      scene_dialogue_summary: [
        { dialogue_lines: ["หนูนา: ประโยคนี้ยาวกว่ามากและควรจะให้วินาทีสูงกว่าอย่างแน่นอนแน่ๆ"] },
      ],
    };
    const parsed = scriptBuilderOutputSchema.parse(script);
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    expect(result.estimatedSpeechSeconds).toBe(0.75);
  });

  it("filters junk sound-cue fragments the same way resolveShotDialogueLines's source-3b does — เสียง…/sfx/ellipsis-only lines never count toward coverage", () => {
    const withOnlyJunk = {
      ...VALID_SCRIPT_BASE,
      structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "no lines" }] },
      scene_dialogue_summary: [
        { dialogue_lines: ["เสียง…ลมพัดผ่านหน้าต่าง", "…", "sfx: door creaks"] },
      ],
    };
    const parsed = scriptBuilderOutputSchema.parse(withOnlyJunk);
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    expect(result.estimatedSpeechSeconds).toBe(0);
    expect(result.status).toBe("no_dialogue_data");
  });

  it("still returns no_dialogue_data when scene_dialogue_summary exists but every scene has an empty dialogue_lines[]", () => {
    const script = {
      ...VALID_SCRIPT_BASE,
      structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "no lines" }] },
      scene_dialogue_summary: [{ scene: 1, dialogue_lines: [] }, { scene: 2 }],
    };
    const parsed = scriptBuilderOutputSchema.parse(script);
    const result = evaluateScriptSpeechCoverage(parsed, 60);
    expect(result.status).toBe("no_dialogue_data");
  });
});

/* -------------------------------------------------------------------------- */
/* generateEpisodeScript — speech_budget/content_budget prompt injection      */
/* -------------------------------------------------------------------------- */

describe("generateEpisodeScript — speech-budget prompt injection (flag-gated)", () => {
  it("injects speech_budget and content_budget when opts.speechBudgetEnabled is true", async () => {
    mockLlmResponse(wellFilledScript());

    const contentBudget = {
      beatCount: 6,
      estimatedSpeechSeconds: 36,
      conflictLevel: 2,
      reversalTarget: 2,
      arcThreads: ["romance thread"],
    };

    await generateEpisodeScript(
      baseParams({
        opts: { speechBudgetEnabled: true },
        speechBudget: { contentBudget },
      }),
    );

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("speech_budget");
    expect(userMessage.content).toContain("target_speech_seconds_min");
    expect(userMessage.content).toContain("per_shot_band");
    expect(userMessage.content).toContain("content_budget");
    expect(userMessage.content).toContain("romance thread");
  });

  it("omits speech_budget/content_budget entirely when the flag is off (byte-identical to before)", async () => {
    mockLlmResponse(wellFilledScript());

    await generateEpisodeScript(baseParams());

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).not.toContain("speech_budget");
    expect(userMessage.content).not.toContain("content_budget");
  });

  it("omits content_budget (but still sends speech_budget) when the flag is on but no contentBudget is supplied", async () => {
    mockLlmResponse(wellFilledScript());

    await generateEpisodeScript(baseParams({ opts: { speechBudgetEnabled: true } }));

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    expect(userMessage.content).toContain("speech_budget");
    expect(userMessage.content).not.toContain("content_budget");
  });

  it("derives per_shot_band from the default 8-clip duration profile (8s -> ~2.7/1.8, 4s -> ~1.4)", async () => {
    mockLlmResponse(wellFilledScript());

    await generateEpisodeScript(baseParams({ opts: { speechBudgetEnabled: true } }));

    const callArgs = mockExecuteWithFallback.mock.calls[0][0];
    const userMessage = callArgs.messages.find((m: { role: string }) => m.role === "user");
    // `speech_budget: {...}` is always immediately followed by "\n\n" (the
    // next prompt section, or at minimum VD_COMPACT_JSON_INSTRUCTION) since
    // JSON.stringify emits compact (no-newline) JSON — the non-greedy match
    // is therefore guaranteed to stop at the OUTERMOST closing brace, not an
    // inner one.
    const match: RegExpMatchArray | null = userMessage.content.match(/speech_budget: (\{.*?\})\n\n/);
    expect(match).toBeTruthy();
    const payload = JSON.parse(match![1]);

    expect(payload.per_shot_band).toHaveLength(2);
    expect(payload.per_shot_band[0].clip_duration_seconds).toBe(8);
    expect(payload.per_shot_band[0].target_speech_seconds).toBeCloseTo(2.72, 5);
    expect(payload.per_shot_band[0].min_speech_seconds).toBeCloseTo(1.8, 5);
    expect(payload.per_shot_band[1].clip_duration_seconds).toBe(4);
    expect(payload.per_shot_band[1].target_speech_seconds).toBeCloseTo(1.36, 5);
    expect(payload.per_shot_band[1].min_speech_seconds).toBeCloseTo(0.9, 5);
  });
});

/* -------------------------------------------------------------------------- */
/* generateEpisodeScript — post-generation coverage gate                     */
/* -------------------------------------------------------------------------- */

describe("generateEpisodeScript — post-generation coverage gate (flag-gated)", () => {
  it("throws VdEpisodeUnderfilledError with code VD_DIALOGUE_EPISODE_UNDERFILLED when critically underfilled and the flag is on", async () => {
    mockLlmResponse(underfilledScript());

    await expect(
      generateEpisodeScript(baseParams({ opts: { speechBudgetEnabled: true } })),
    ).rejects.toThrow(VdEpisodeUnderfilledError);

    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("attaches code VD_DIALOGUE_EPISODE_UNDERFILLED and the coverage detail to the thrown error", async () => {
    mockLlmResponse(underfilledScript());

    try {
      await generateEpisodeScript(baseParams({ opts: { speechBudgetEnabled: true } }));
      expect.fail("expected generateEpisodeScript to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(VdEpisodeUnderfilledError);
      const underfilledError = error as VdEpisodeUnderfilledError;
      expect(underfilledError.code).toBe("VD_DIALOGUE_EPISODE_UNDERFILLED");
      expect(underfilledError.coverage.status).toBe("underfilled_error");
    }
  });

  it("does NOT throw / does NOT gate when the flag is off, even for a critically underfilled script (byte-identical to before)", async () => {
    mockLlmResponse(underfilledScript());

    const result = await generateEpisodeScript(baseParams());

    expect(result.script.episode_title).toBe("Midnight Verdict");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });

  it("also throws VdEpisodeUnderfilledError (coverage.status no_dialogue_data) for a FRESH generation with no dialogue data anywhere — no_dialogue_data is only grandfathered on the wizard's read-back of an EXISTING script, never at generation time (2026-07-08 fix)", async () => {
    mockLlmResponse(noDialogueDataScript());

    try {
      await generateEpisodeScript(baseParams({ opts: { speechBudgetEnabled: true } }));
      expect.fail("expected generateEpisodeScript to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(VdEpisodeUnderfilledError);
      const underfilledError = error as VdEpisodeUnderfilledError;
      expect(underfilledError.code).toBe("VD_DIALOGUE_EPISODE_UNDERFILLED");
      expect(underfilledError.coverage.status).toBe("no_dialogue_data");
    }
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("succeeds and deducts credits normally for a well-filled script when the flag is on", async () => {
    mockLlmResponse(wellFilledScript());

    const result = await generateEpisodeScript(baseParams({ opts: { speechBudgetEnabled: true } }));

    expect(result.script.episode_title).toBe("Midnight Verdict");
    expect(mockDeductCredits).toHaveBeenCalledTimes(1);
  });
});

// 2026-07-08 prod hotfix regression: `scene_dialogue_summary` arriving as a
// NON-ARRAY (object/string/null) must not crash coverage evaluation — the
// live failure was "[tRPC] ERROR: getEpisodeDetail: sceneDialogueSummary is
// not iterable" after a story rewrite persisted an object-shaped summary.
describe("evaluateScriptSpeechCoverage — non-array scene_dialogue_summary (prod hotfix)", () => {
  const target = 60;
  it.each([
    ["object", { scene_1: { dialogue_lines: ["หนูนา: สวัสดี"] } }],
    ["string", "หนูนา: สวัสดี"],
    ["null", null],
    ["number", 42],
  ])("does not throw and reports no_dialogue_data when summary is %s", (_kind, summary) => {
    const script = {
      episode_title: "t",
      hook: "h",
      structure: { mode: "beats", beats: [] },
      scene_dialogue_summary: summary,
      cliffhanger: "c",
    } as never;
    const result = evaluateScriptSpeechCoverage(script, target, "th");
    expect(result.status).toBe("no_dialogue_data");
    expect(result.estimatedSpeechSeconds).toBe(0);
  });
});
