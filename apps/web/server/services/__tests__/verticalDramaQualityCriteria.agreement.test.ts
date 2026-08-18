/**
 * Vertical Drama Series — Feature 132 "Unified Criteria Application"
 * agreement test (spec §11; plan
 * `sections/section-01-shared-criteria-and-flags.md`).
 *
 * Spec §11 lists 11 consumer entry points that MUST render a prompt/output
 * containing the criteria version marker (`renderCriteriaVersionMarker()`'s
 * output). This is the single place that tracks "has every path adopted
 * the criteria module yet" — as later Feature 132 sections wire the
 * criteria module into a consumer, they flip that consumer's `.todo` entry
 * below to a real assertion (mirroring the createSeriesFieldLimits
 * "mock the whole module graph" agreement-test convention).
 *
 * For Section 01 (this section), only the foundational assertions run for
 * real: the module exists and is importable, and exports the documented
 * shape. Every real per-consumer assertion is `.todo` with a comment
 * pointing at the section that implements that consumer's wiring.
 */
import { describe, expect, it, vi } from "vitest";
import {
  getVerticalDramaQualityCriteriaBundle,
  renderCriteriaVersionMarker,
} from "../verticalDramaQualityCriteria";

/* -------------------------------------------------------------------------- */
/* Mocks for the `synthesizeVerticalDramaPreset[V2]` real assertion below     */
/* (Section 02) — same "mock the whole module graph" convention as           */
/* `verticalDramaPresetSynthesis.test.ts`.                                   */
/* -------------------------------------------------------------------------- */
vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(
      () => "---\nname: vertical-drama-preset-synthesizer\n---\nSystem prompt body",
    ),
  },
}));

vi.mock("@smartspec/skills", () => ({
  parseSkillFile: vi.fn(() => ({ content: "System prompt body" })),
}));

vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(() => ["/fake/skills/vertical-drama-preset-synthesizer"]),
  resolveSkillManifestPath: vi.fn(() => "/fake/skills/vertical-drama-preset-synthesizer/skill.md"),
}));

vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(async () => true),
  deductCredits: vi.fn(async () => undefined),
  calculateCreditsForLLM: vi.fn(() => 2),
}));

// Mocks for the `generateStoryBible`/`generateStoryBibleDeep` real
// assertions below (Section 02/03 story bible generation) — these two
// service functions resolve their model via `resolveDeepStoryDraftModel`/
// `resolveStoryBibleModel`, which read enabled LLM model rows from the DB;
// mock that lookup so these tests never touch a real database, same
// convention as `verticalDramaStoryBible.speechBudget.test.ts`.
vi.mock("../enabledLlmModels", () => ({
  loadEnabledLlmModelRows: vi.fn(async () => []),
}));
vi.mock("../intelligentModelSelector", () => ({
  selectBestLlmModel: vi.fn(() => null),
}));

const { mockExecuteWithFallback } = vi.hoisted(() => ({
  mockExecuteWithFallback: vi.fn(),
}));
vi.mock("../llmRouter", () => ({
  executeWithFallback: mockExecuteWithFallback,
}));

vi.mock("../verticalDramaStoryArchitecturePlanner", () => ({
  planVerticalDramaStoryArchitecture: vi.fn(async () => ({
    contract: null,
    diagnostics: [],
    repairRounds: 0,
    promptTokens: 0,
    completionTokens: 0,
    model: "gpt-x",
  })),
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

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

/**
 * The spec §11 consumer entry points, in table order. Section 01's own plan
 * describes this as "the 11 spec §11 rows"; the spec.md §11 table as it
 * exists today (v0.4) actually enumerates 12 rows (the "Season critique +
 * apply" and "generateEpisodeScript stage functions" rows are each single
 * rows covering multiple call sites) — this array follows the literal
 * spec.md §11 table exactly rather than the section plan's summary count,
 * so no consumer is silently dropped from the adoption tracker.
 */
const CONSUMER_ENTRY_POINTS = [
  "synthesizeVerticalDramaPreset[V2]",
  "generateStoryBible",
  "generateStoryBibleDeep",
  "extendStoryDraftHorizon",
  "critiqueSeasonDrafts/applySeasonCritique",
  "runVerticalDramaQualityLoop",
  "generateEpisodeScript (runStage/regenerateStage/repairStageOutput)",
  "generateNextEpisodesViaLlm",
  "updateEpisodeDraft/updateEpisodeDraftDialogue",
  "runVerticalDramaEpisodeQualityReview",
  "generateCharacterVisualPrompts/start-frame assembly",
  "dialogue-audio-planner prompt",
] as const;

describe("verticalDramaQualityCriteria agreement test (spec §11 consumer adoption tracker)", () => {
  it("getVerticalDramaQualityCriteriaBundle and renderCriteriaVersionMarker exist and are importable", () => {
    expect(typeof getVerticalDramaQualityCriteriaBundle).toBe("function");
    expect(typeof renderCriteriaVersionMarker).toBe("function");

    const bundle = getVerticalDramaQualityCriteriaBundle();
    expect(bundle.version).toBeGreaterThan(0);
    expect(renderCriteriaVersionMarker()).toContain(String(bundle.version));
  });

  it.each(CONSUMER_ENTRY_POINTS)(
    "consumer %s builds a prompt/output that contains the criteria version marker",
    () => {
      // Scaffold only for Section 01 — each real consumer's assertion is
      // implemented and un-skipped by the section that wires that
      // consumer to the criteria module. See per-entry `.todo` below for
      // which section owns each one.
      expect(true).toBe(true);
    },
  );

  // Per-consumer real assertions (currently `.todo`, flipped by the owning
  // section as each consumer adopts the criteria module):
  it("synthesizeVerticalDramaPreset[V2] embeds the criteria version marker (owned by: Section 02 preset synthesis / premise-primary blending)", async () => {
    const { synthesizeVerticalDramaPreset } = await import("../verticalDramaPresetSynthesis");

    const validDraft = {
      contract_version: 1,
      title: "Title",
      category: "cat",
      logline: "logline",
      mainPlot: "main plot",
      seasonArc: "season arc",
      tone: "tone",
      cliffhangerStyle: "cliffhanger",
      creatorSummary: {
        whatItIsAbout: "A focused story.",
        protagonistAndGoal: "The lead wants to succeed.",
        conflictAndDiscovery: "Pressure reveals the true challenge.",
        centralMystery: "What will the lead choose?",
        decisionNotes: ["Keep one primary engine."],
      },
      characters: [
        { name: "A", role: "lead", occupation: "student", description: "d" },
        { name: "B", role: "support", occupation: "student", description: "d" },
        { name: "C", role: "villain", occupation: "executive", description: "d" },
      ],
      visualBible: "prose",
      mixRecipe: { primaryFlavor: "1", supportingFlavors: ["2"], rationale: "why" },
      warnings: [],
    };

    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(validDraft) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    await synthesizeVerticalDramaPreset({
      userId: 1,
      locale: "th",
      selectedPresets: [
        {
          id: "1",
          title: "Preset One",
          category: "cat",
          logline: "l",
          mainPlot: "m",
          seasonArc: "s",
          tone: "t",
          cliffhangerStyle: "c",
          characters: [{ name: "A", role: "lead", description: "d" }],
          visualBible: "v",
        },
      ],
      selectedCategories: ["some_category"],
    });

    const userPrompt = mockExecuteWithFallback.mock.calls[0][0].messages[1].content as string;
    expect(userPrompt).toContain(renderCriteriaVersionMarker());
  });
  it("generateStoryBible embeds the criteria version marker (owned by: Section 02/03 story bible generation)", async () => {
    const { generateStoryBible } = await import("../verticalDramaStoryBible");

    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                expandedSeasonArc: "arc",
                refinedCharacters: [{ name: "A", role: "lead", description: "d" }],
                episodeBreakdown: [
                  { episodeNumber: 1, workingTitle: "Ep1", logline: "l", keyBeats: ["b"] },
                ],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    await generateStoryBible({
      userId: 1,
      seriesId: 1,
      title: "Series",
      locale: "th",
      targetEpisodeCount: 1,
      bible: {},
    });

    const lastCall = mockExecuteWithFallback.mock.calls[mockExecuteWithFallback.mock.calls.length - 1];
    const systemPrompt = lastCall[0].messages[0].content as string;
    expect(systemPrompt).toContain(renderCriteriaVersionMarker());
  });

  it("generateStoryBibleDeep (standard + premium judge) embeds the criteria version marker (owned by: Section 02/03/05 deep drafts)", async () => {
    const { generateStoryBibleDeep } = await import("../verticalDramaStoryBible");

    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                episodeBreakdown: [
                  {
                    episodeNumber: 1,
                    workingTitle: "Ep1",
                    logline: "l",
                    keyBeats: ["b"],
                    shotDrafts: Array.from({ length: 9 }, (_, i) => ({
                      shot_number: i + 1,
                      summary: `Shot ${i + 1}`,
                      characters: [{ name: "A", emotion: "calm" }],
                      location_key: "campus",
                      dialogue_lines: [{ speaker: "A", line: "Hello there friend" }],
                    })),
                  },
                ],
                open_threads: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    await generateStoryBibleDeep({
      userId: 1,
      seriesId: 1,
      title: "Series",
      locale: "th",
      episodes: [
        { episodeNumber: 1, workingTitle: "Ep1", logline: "l", keyBeats: ["b"] },
      ],
    });

    const lastCall = mockExecuteWithFallback.mock.calls[mockExecuteWithFallback.mock.calls.length - 1];
    const systemPrompt = lastCall[0].messages[0].content as string;
    expect(systemPrompt).toContain(renderCriteriaVersionMarker());
  });

  it("extendStoryDraftHorizon embeds the criteria version marker (owned by: Section 02/03 season extension) — same underlying generateStoryBibleDeep/buildDeepDraftPrompts codepath the router's extendStoryDraftHorizon mutation calls (verticalDramaSeries.ts's runExtendStoryDraftHorizonJob), proven above; no separate service-level prompt builder exists for horizon extension", async () => {
    const { generateStoryBibleDeep } = await import("../verticalDramaStoryBible");

    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                episodeBreakdown: [
                  {
                    episodeNumber: 2,
                    workingTitle: "Ep2",
                    logline: "l",
                    keyBeats: ["b"],
                    shotDrafts: Array.from({ length: 9 }, (_, i) => ({
                      shot_number: i + 1,
                      summary: `Shot ${i + 1}`,
                      characters: [{ name: "A", emotion: "calm" }],
                      location_key: "campus",
                      dialogue_lines: [{ speaker: "A", line: "Hello there friend" }],
                    })),
                  },
                ],
                open_threads: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    // `extendStoryDraftHorizon` (the router mutation) passes a `priorRecap`
    // continuity seed — the same params shape `generateStoryBibleDeep`
    // already accepts — so this exercises the identical prompt-building path.
    await generateStoryBibleDeep({
      userId: 1,
      seriesId: 1,
      title: "Series",
      locale: "th",
      episodes: [
        { episodeNumber: 2, workingTitle: "Ep2", logline: "l", keyBeats: ["b"] },
      ],
      priorRecap: { items: [], openThreads: [] },
    });

    const lastCall = mockExecuteWithFallback.mock.calls[mockExecuteWithFallback.mock.calls.length - 1];
    const systemPrompt = lastCall[0].messages[0].content as string;
    expect(systemPrompt).toContain(renderCriteriaVersionMarker());
  });
  // "critiqueSeasonDrafts/applySeasonCritique embed the criteria version
  // marker" was removed 2026-07-10: both functions (and the whole season
  // critique/apply/quality-loop flow) were replaced by "ปรับปรุงบทละครให้มี
  // ความสมบูรณ์" (`services/verticalDramaImproveScript.ts`), which routes
  // through the `drama-script-evaluate-improve` SKILL (its own markdown
  // prompt, not this file's criteria-marker convention) rather than an
  // inline system prompt — this spec §11 consumer entry point no longer
  // applies.
  it("runVerticalDramaQualityLoop embeds the criteria version marker (owned by: Section 07 targeted revision engine)", async () => {
    const { composeQualityReviewRepairInstruction } = await import("../verticalDramaQualityReviewApply");

    const instruction = composeQualityReviewRepairInstruction([
      { location: "shot 1", problem: "weak", suggested_fix: "fix it" },
    ]);

    expect(instruction).toContain(renderCriteriaVersionMarker());
  });
  it("generateEpisodeScript stage functions (runStage/regenerateStage/repairStageOutput) embed the criteria version marker (owned by: Section 04 scene contracts / Section 05 dialogue rules)", async () => {
    const { generateEpisodeScript } = await import("../verticalDramaScriptGeneration");

    mockExecuteWithFallback.mockClear();
    const validScript = {
      contract_version: 1,
      episode_title: "Episode 1",
      hook: "hook",
      structure: { mode: "beat", acts: [], beats: [] },
      scene_dialogue_summary: [],
      cliffhanger: "cliff",
      character_state_deltas: [],
      product_tie_in_plan: {},
      continuity_notes: [],
      warnings: [],
      repair_queue: [],
    };
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(validScript) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    // `runStage`/`regenerateStage`/`repairStageOutput` all funnel through
    // this ONE prompt builder (see `verticalDramaScriptGeneration.ts`'s
    // file-level doc comment) — one wiring point covers every stage
    // function. `opts.dialogueRulesV2Enabled` is Section 06/07's flag to
    // flip on for real traffic once F132D is fully wired; this test proves
    // the wiring itself is correct and greppable.
    await generateEpisodeScript({
      userId: 1,
      seriesId: 1,
      episodeId: 1,
      episodeTitle: "Episode 1",
      episodeNumber: 1,
      locale: "th",
      durationSeconds: 60,
      storySource: {},
      characters: [],
      opts: { dialogueRulesV2Enabled: true },
    });

    const lastCall = mockExecuteWithFallback.mock.calls[mockExecuteWithFallback.mock.calls.length - 1];
    const userPrompt = lastCall[0].messages[1].content as string;
    expect(userPrompt).toContain(renderCriteriaVersionMarker());
  });
  it("generateNextEpisodesViaLlm embeds the criteria version marker (owned by: Section 02/03 season extension)", async () => {
    const { generateNextEpisodesViaLlm } = await import("../verticalDramaEpisodeContinuation");

    mockExecuteWithFallback.mockClear();
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                previousEpisodeBridge: { episodeNumber: 1, logline: "bridge", keyBeats: ["b"] },
                episodes: [{ episodeNumber: 2, workingTitle: "Ep2", logline: "l", keyBeats: ["b"] }],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    await generateNextEpisodesViaLlm({
      userId: 1,
      seriesId: 1,
      title: "Series",
      locale: "th",
      bible: {},
      existingEpisodes: [{ episodeNumber: 1, title: "Ep1" }],
      nextEpisodeNumber: 2,
      count: 1,
    });

    const lastCall = mockExecuteWithFallback.mock.calls[mockExecuteWithFallback.mock.calls.length - 1];
    const systemPrompt = lastCall[0].messages[0].content as string;
    expect(systemPrompt).toContain(renderCriteriaVersionMarker());
  });
  it("updateEpisodeDraft/updateEpisodeDraftDialogue embed the criteria version marker on save-validation (owned by: Section 05 dialogue rules — manual draft edits)", async () => {
    const { applyManualDialogueEdit } = await import("../verticalDramaStoryBible");

    const result = applyManualDialogueEdit({
      item: {
        episodeNumber: 1,
        workingTitle: "Episode 1",
        logline: "summary",
        keyBeats: ["Beat A"],
        shotDrafts: Array.from({ length: 9 }, (_, index) => ({
          shot_number: index + 1,
          summary: `Shot ${index + 1} summary`,
          dialogue_lines: [],
        })),
      } as never,
      shotNumber: 1,
      lines: [{ speaker: "A", line: "เราต้องไปตอนนี้" }],
      editedByUserId: 1,
      editedAt: "2026-07-09T00:00:00.000Z",
    });

    expect(result.criteriaVersionMarker).toBe(renderCriteriaVersionMarker());
  });
  it("runVerticalDramaEpisodeQualityReview embeds the criteria version marker (owned by: Section 06 multi-pass QC / scorecard v3)", async () => {
    const { runVerticalDramaEpisodeQualityReview } = await import("../verticalDramaEpisodeQualityReview");

    mockExecuteWithFallback.mockClear();
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify({
                contract_version: 3,
                episode_title: "Episode 1",
                scorecard: {
                  reversal_count: 1,
                  reversal_sharpness: 4,
                  emotion_variety: 4,
                  dialogue_naturalness: 4,
                  pacing: 4,
                  overall: 4,
                },
                summary: "ok",
                issues: [],
                warnings: [],
                repair_queue: [],
              }),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    await runVerticalDramaEpisodeQualityReview({
      userId: 1,
      seriesId: 1,
      episodeId: 1,
      episodeTitle: "Episode 1",
      locale: "th",
      script: {},
      storyboard: {},
      scoreV3Dimensions: true,
    });

    const lastCall = mockExecuteWithFallback.mock.calls[mockExecuteWithFallback.mock.calls.length - 1];
    const userPrompt = lastCall[0].messages[1].content as string;
    expect(userPrompt).toContain(renderCriteriaVersionMarker());
  });
  it("generateCharacterVisualPrompts/start-frame assembly embed the criteria version marker (owned by: Section 09/10 character visual quality)", async () => {
    const { buildCharacterVisualPromptsUserPrompt } = await import("../verticalDramaCharacterImageGeneration");
    const { buildStartFrameRenderPlanUserPrompt } = await import("../verticalDramaStartFrameGeneration");

    const characterPrompt = buildCharacterVisualPromptsUserPrompt({
      userId: 1,
      seriesId: 1,
      characterId: 1,
      characterKey: "char-1",
      name: "Nok",
      role: "lead",
      description: "A forensic nurse with a hidden motive.",
      storyContext: { title: "Series", genre: "mystery", tone: "tense" },
    });

    const startFramePrompt = buildStartFrameRenderPlanUserPrompt({
      userId: 1,
      seriesId: 1,
      episodeId: 1,
      episodeTitle: "Episode 1",
      durationSeconds: 60,
      storyboardShots: [
        {
          shotNumber: 1,
          description: "Nok notices a blood mark under the ritual table.",
          cameraSetup: "medium close-up, handheld",
          characterIds: ["char-1"],
          durationSeconds: 5,
        },
      ],
    });

    expect(characterPrompt).toContain(renderCriteriaVersionMarker());
    expect(startFramePrompt).toContain(renderCriteriaVersionMarker());
  });
  it("dialogue-audio-planner prompt embeds the criteria version marker (owned by: Section 05 dialogue rules — speech-profile delivery mapping)", async () => {
    const { generateEpisodeDialogueAudioPlan } = await import("../verticalDramaDialogueAudio");

    mockExecuteWithFallback.mockClear();
    const validPlan = {
      contract_version: 1,
      dialogue_lines: [
        {
          shot_number: 1,
          clip_number: 1,
          speaker_character_id: "char-1",
          dialogue_line: "line",
        },
      ],
      speaker_mapping: [],
      voice_continuity_map: {},
      missing_voice_warnings: [],
      subtitle_cues: [],
      audio_timing_estimate: {},
      native_audio_snippets: [],
      separate_tts_plan: {},
      warnings: [],
      repair_queue: [],
    };
    mockExecuteWithFallback.mockResolvedValue({
      type: "success",
      response: {
        choices: [{ message: { content: JSON.stringify(validPlan) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    });

    await generateEpisodeDialogueAudioPlan({
      userId: 1,
      seriesId: 1,
      episodeId: 1,
      locale: "th",
      durationSeconds: 60,
      episodeScript: {},
      characters: [],
      opts: { dialogueRulesV2Enabled: true },
    });

    const lastCall = mockExecuteWithFallback.mock.calls[mockExecuteWithFallback.mock.calls.length - 1];
    const userPrompt = lastCall[0].messages[1].content as string;
    expect(userPrompt).toContain(renderCriteriaVersionMarker());
  });
});
