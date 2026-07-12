/**
 * Vertical Drama Series — `repairStage` REAL repair coverage (CRITICAL FIX,
 * added 2026-07-08): before this change, `repairStage` returned only
 * `buildStagePayload`'s deterministic, no-provider-call placeholder for
 * EVERY stage — `mode: "repair"` never altered the output, so a "repair"
 * never actually changed the episode's live `script`/`storyboard`/
 * `dialogueAudioPlan` content (see `repairStage`'s own doc comment in
 * `verticalDramaEpisodePipeline.ts` for the full trace).
 *
 * This file proves, for the 3 REAL-repair stages
 * (`plan_episode_script`/`storyboard_shotgrid`/`dialogue_audio_plan`):
 *  - the real generation function is invoked with the CURRENT persisted
 *    content + the instruction (repair framing);
 *  - the live episode column is updated with the REAL content;
 *  - the written artifact payload is the REAL content (not the placeholder)
 *    plus the `_repair` lineage metadata, unchanged from before;
 *  - a generation failure (including an "underfilled" style error) maps to
 *    a normal `failed`/`repair` `RunResult` — never throws — mirroring
 *    `runStage`'s catch-and-map convention;
 *  - a NON-target stage (e.g. `start_frame_render_plan`) is a pure
 *    regression check: still returns the deterministic placeholder,
 *    unchanged;
 *  - a REAL repaired script correctly flows into the SAME deterministic
 *    W11.6 "Story Lock" guard (`evaluateVerticalDramaStoryLockScriptGuard`,
 *    `verticalDramaQualityReviewApply.ts`, pure/DB-free/exported) the
 *    router's `repairVerticalDramaStageWithStoryLockGuard` wrapper already
 *    calls — proving the guard "plugs into" a REAL repair unchanged. The
 *    wrapper function itself (snapshot/revert/audit-write) is router-owned
 *    and non-exported; its own behavior with a MOCKED `repairStage` is
 *    already covered by
 *    `verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`'s
 *    "repairStageOutput — W11.6 Story Lock" suite — this file closes the
 *    gap by exercising the guard against genuinely real repaired content.
 *
 * Same "mock the whole module graph, test the exported method directly"
 * convention as `verticalDramaEpisodePipeline.memoryWiring.test.ts` /
 * `verticalDramaEpisodePipeline.episodeDraftHydration.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    instance: {},
  },
}));
vi.mock("../../db", () => ({ db: mockDb }));

const { mockMemoryService } = vi.hoisted(() => ({
  mockMemoryService: {
    appendEvent: vi.fn(),
    listEvents: vi.fn(),
    buildEpisodeMemoryBundle: vi.fn(),
    proposeRetcon: vi.fn(),
    approveRetconProposal: vi.fn(),
    rejectRetconProposal: vi.fn(),
  },
}));
vi.mock("../verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: mockMemoryService,
  VerticalDramaSeriesMemoryService: class {},
  memoryRowToEvent: vi.fn(),
}));

const { mockGenerateEpisodeScript, mockGenerateStoryboardShotgrid } = vi.hoisted(() => ({
  mockGenerateEpisodeScript: vi.fn(),
  mockGenerateStoryboardShotgrid: vi.fn(),
}));
vi.mock("../verticalDramaScriptGeneration", () => ({
  generateEpisodeScript: mockGenerateEpisodeScript,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaStoryboardGeneration", () => ({
  generateStoryboardShotgrid: mockGenerateStoryboardShotgrid,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
const { mockGenerateEpisodeDialogueAudioPlan, mockBuildDialogueAudioPlan } = vi.hoisted(() => ({
  mockGenerateEpisodeDialogueAudioPlan: vi.fn(),
  mockBuildDialogueAudioPlan: vi.fn(),
}));
vi.mock("../verticalDramaDialogueAudio", () => ({
  generateEpisodeDialogueAudioPlan: mockGenerateEpisodeDialogueAudioPlan,
  buildDialogueAudioPlan: mockBuildDialogueAudioPlan,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaStartFrameGeneration", () => ({
  generateStartFrameRenderPlan: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaVideoMotionPromptGeneration", () => ({
  generateVideoMotionPromptPack: vi.fn(),
  syncDialogueOntoMotionPromptClips: vi.fn(),
  syncStartFramesOntoMotionPromptClips: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
const { mockGetPrimaryPortraitUrl } = vi.hoisted(() => ({
  mockGetPrimaryPortraitUrl: vi.fn(),
}));
vi.mock("../verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: mockGetPrimaryPortraitUrl },
}));
vi.mock("../verticalDramaStoryboardHandoff", () => ({
  createVerticalDramaStoryboardHandoff: vi.fn(),
}));
vi.mock("../verticalDramaSeriesMemoryPlanning", () => ({
  runVerticalDramaSeriesMemoryPlanning: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));
vi.mock("../verticalDramaProductTieIn", () => ({
  extractShotProductPlacements: vi.fn(() => []),
  findPlacementForShot: vi.fn(),
  appendProductPresenceDirective: vi.fn(),
  resolveProductReferenceImageUrls: vi.fn(),
  resolveMarketplaceCaptureProductImageUrls: vi.fn(),
  resolveFrameProductReferenceAssetIds: vi.fn(),
}));

import { VerticalDramaEpisodePipeline } from "../verticalDramaEpisodePipeline";
import { evaluateVerticalDramaStoryLockScriptGuard } from "../verticalDramaQualityReviewApply";

const pipeline = new VerticalDramaEpisodePipeline() as any;

const owner = { tenantId: "tenant-1", userId: 42, seriesId: 10, episodeId: 100 };

/** Build a thenable select-chain stub so `await db.select()....where(...)` (with or without `.limit()`/`.orderBy()`) resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

/** Build a thenable update-chain stub: `set(...).where(...)` (thenable) or `.returning()` resolves. `set` is a spy so call args are inspectable. */
function updateChain(rows: unknown[] = []) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

/** Build a thenable insert-chain stub: `values(...).returning()` resolves to `rows`. `values` is a spy so call args are inspectable. */
function insertChain(rows: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

const CURRENT_SCRIPT = {
  contract_version: 1,
  episode_title: "Midnight Verdict",
  hook: "Aria's phone lights up mid-signature.",
  structure: { mode: "beat", acts: [], beats: [{ beat: 1, summary: "b1" }] },
  scene_dialogue_summary: [],
  cliffhanger: "A weak cliffhanger.",
  character_state_deltas: [],
  product_tie_in_plan: { tie_ins: [] },
  continuity_notes: [],
  warnings: [],
  repair_queue: [],
};

const CURRENT_STORYBOARD = {
  storyboard_summary: {},
  canonical_style_bible: {},
  shot_grid_plan: {},
  // `validateStagePayload` requires exactly 9 shots for `storyboard_shotgrid`.
  shots: Array.from({ length: 9 }, (_, i) => ({ shot_number: i + 1, duration_seconds: 8 })),
  plain_text_storyboard: "old text",
  storyboard_handoff_json: {},
};

function baseEpisode(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    title: "Episode 3",
    episodeNumber: 3,
    targetDurationSeconds: 60,
    script: CURRENT_SCRIPT,
    storyboard: CURRENT_STORYBOARD,
    dialogueAudioPlan: null,
    ...over,
  };
}

const CHARACTER_ROWS = [{ id: 1, characterKey: "char_aria", name: "Aria", role: "lead" }];

beforeEach(() => {
  vi.clearAllMocks();
  mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue(null);
  mockGetPrimaryPortraitUrl.mockResolvedValue(null);
  // No pending checkpoint by default — tests that care about the checkpoint
  // update queue their own select sequence explicitly.
});

/** Queue the 4 selects a successful script/storyboard/dialogue repair performs, in order: loadEpisode, seriesRow, characterRows, checkpoint lookup. */
function queueSuccessSelects(episode: unknown, seriesRow: unknown, checkpoint: unknown = null) {
  mockDb.select
    .mockReturnValueOnce(selectChain([episode]))
    .mockReturnValueOnce(selectChain([seriesRow]))
    .mockReturnValueOnce(selectChain(CHARACTER_ROWS))
    .mockReturnValueOnce(selectChain(checkpoint ? [checkpoint] : []));
}

describe("repairStage — plan_episode_script (real repair)", () => {
  it("calls generateEpisodeScript with repairContext (current script + instruction), persists the live script column, and writes a real artifact + _repair metadata", async () => {
    const episode = baseEpisode();
    queueSuccessSelects(episode, { bible: null, locale: "th", productTieIn: null, tone: null });

    const episodeUpdateChain = updateChain();
    const runUpdateChain = updateChain();
    const checkpointUpdateChain = updateChain();
    mockDb.update
      .mockReturnValueOnce(episodeUpdateChain)
      .mockReturnValueOnce(runUpdateChain);

    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 800 }])) // writeRun
      .mockReturnValueOnce(insertChain([{ id: 900 }])); // writeArtifact

    const REPAIRED_SCRIPT = {
      ...CURRENT_SCRIPT,
      episode_title: "Midnight Verdict",
      cliffhanger: "A MUCH stronger cliffhanger.",
    };
    mockGenerateEpisodeScript.mockResolvedValue({
      script: REPAIRED_SCRIPT,
      creditsUsed: 3,
      model: "gpt-x",
    });

    const outcome = await pipeline.repairStage(owner, "plan_episode_script", {
      instruction: "ทำให้ cliffhanger น่าตื่นเต้นกว่านี้",
      sourceArtifactId: "111",
    });

    // Real generation invoked exactly once, with repair framing.
    expect(mockGenerateEpisodeScript).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateEpisodeScript.mock.calls[0][0];
    expect(callArgs.repairContext).toEqual({
      currentScript: CURRENT_SCRIPT,
      instruction: "ทำให้ cliffhanger น่าตื่นเต้นกว่านี้",
    });

    // Live episode column persisted with the REAL script.
    expect(episodeUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ script: REPAIRED_SCRIPT }),
    );

    // Artifact payload is the REAL content + _repair lineage metadata.
    // `insertChain`'s `.values(...)` call captured the artifact row.
    const insertCallsFn = (mockDb.insert.mock.results[1].value as any).values as any;
    const artifactValues = insertCallsFn.mock.calls[0][0];
    expect(artifactValues.jsonPayload).toMatchObject({
      stage: "plan_episode_script",
      episode_title: REPAIRED_SCRIPT.episode_title,
      cliffhanger: REPAIRED_SCRIPT.cliffhanger,
      _repair: {
        instruction: "ทำให้ cliffhanger น่าตื่นเต้นกว่านี้",
        supersedesArtifactId: "111",
      },
    });

    expect(outcome.result.status).toBe("succeeded");
    expect(outcome.result.next_action).toBe("approve");
    expect(outcome.staleStages.length).toBeGreaterThan(0);
    expect(outcome.staleStages).not.toContain("plan_episode_script");
  });
});

describe("repairStage — storyboard_shotgrid (real repair)", () => {
  it("calls generateStoryboardShotgrid with repairContext (current storyboard + instruction) and persists the live storyboard column", async () => {
    const episode = baseEpisode();
    queueSuccessSelects(episode, { bible: null, locale: "th", tone: null });
    // Phase 2 of `planning/polished-toasting-gadget.md` (location visual
    // bible, dispatch 3/3) — `generateRealStoryboard` (called from inside
    // `repairStage`'s own real-repair wiring for this stage) now does a 3rd
    // select (the series' location roster) beyond what `queueSuccessSelects`
    // already queues (episode/seriesRow/characterRows/checkpoint=[]). Not
    // added to the shared helper itself — `plan_episode_script`'s repair
    // test (which calls `generateRealScript`, untouched by this dispatch)
    // also reuses that helper and must stay at exactly 4 queued selects.
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const episodeUpdateChain = updateChain();
    const runUpdateChain = updateChain();
    mockDb.update.mockReturnValueOnce(episodeUpdateChain).mockReturnValueOnce(runUpdateChain);
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 801 }]))
      .mockReturnValueOnce(insertChain([{ id: 901 }]));

    const REPAIRED_STORYBOARD = {
      ...CURRENT_STORYBOARD,
      shots: [
        { shot_number: 1, duration_seconds: 8, camera: { shot_type: "close-up" } },
        ...CURRENT_STORYBOARD.shots.slice(1),
      ],
    };
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: REPAIRED_STORYBOARD,
      creditsUsed: 8,
      model: "gpt-4o-mini",
    });

    const outcome = await pipeline.repairStage(owner, "storyboard_shotgrid", {
      instruction: "Fix shot 1's camera to a close-up.",
    });

    expect(mockGenerateStoryboardShotgrid).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.repairContext).toEqual({
      currentStoryboard: CURRENT_STORYBOARD,
      instruction: "Fix shot 1's camera to a close-up.",
    });

    expect(episodeUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ storyboard: REPAIRED_STORYBOARD }),
    );
    expect(outcome.result.status).toBe("succeeded");
  });
});

describe("repairStage — dialogue_audio_plan (real repair, previously-orphaned skill)", () => {
  it("resolves beats from the LLM's dialogue_lines[], calls buildDialogueAudioPlan, and persists the REAL VerticalDramaDialogueAudioPlan onto the live column", async () => {
    const episode = baseEpisode({
      dialogueAudioPlan: {
        mode: "dialogue",
        audioStrategy: "dialogue_tts",
        speakerVoiceMap: {
          entries: [
            {
              speakerName: "Aria",
              characterId: "char_aria",
              voiceId: "voice_aria_v1",
              locked: true,
              missingVoiceId: false,
            },
          ],
        },
      },
    });
    queueSuccessSelects(episode, { locale: "th" });

    const episodeUpdateChain = updateChain();
    const runUpdateChain = updateChain();
    mockDb.update.mockReturnValueOnce(episodeUpdateChain).mockReturnValueOnce(runUpdateChain);
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 802 }]))
      .mockReturnValueOnce(insertChain([{ id: 902 }]));

    mockGenerateEpisodeDialogueAudioPlan.mockResolvedValue({
      plan: {
        contract_version: 1,
        dialogue_lines: [
          {
            shot_number: 1,
            clip_number: 1,
            speaker_character_id: "char_aria",
            dialogue_line: "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ",
            estimated_seconds: 2.4,
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
      },
      creditsUsed: 5,
      model: "gpt-4o-mini",
    });
    const FAKE_REAL_PLAN = { planId: "dap-10-100", dialogueLines: [{ text: "real line" }] };
    mockBuildDialogueAudioPlan.mockReturnValue(FAKE_REAL_PLAN);

    const outcome = await pipeline.repairStage(owner, "dialogue_audio_plan", {
      instruction: "ทำให้บทพูดช็อต 1 สั้นลง",
    });

    // The skill's raw dialogue line was correctly mapped into a DialogueBeatInput
    // (speaker name resolved from the character roster, not left as the raw id).
    expect(mockBuildDialogueAudioPlan).toHaveBeenCalledTimes(1);
    const buildArgs = mockBuildDialogueAudioPlan.mock.calls[0][0];
    expect(buildArgs.beats).toEqual([
      expect.objectContaining({
        shotNumber: 1,
        clipNumber: 1,
        speakerName: "Aria",
        speakerCharacterId: "char_aria",
        isNarration: false,
        text: "เรื่องนี้ยังไม่จบง่ายๆ หรอกนะ",
        estimatedSeconds: 2.4,
      }),
    ]);
    // Voice continuity carried forward from the CURRENT plan (not discarded
    // by a text-only repair).
    expect(buildArgs.voiceBindings).toEqual([
      expect.objectContaining({ speakerName: "Aria", characterId: "char_aria", voiceId: "voice_aria_v1" }),
    ]);
    expect(buildArgs.mode).toBe("dialogue");
    expect(buildArgs.requestedStrategy).toBe("dialogue_tts");

    // Live dialogueAudioPlan column persisted with buildDialogueAudioPlan's
    // REAL (canonical-shape) output — not the skill's raw snake_case payload.
    expect(episodeUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ dialogueAudioPlan: FAKE_REAL_PLAN }),
    );
    expect(outcome.result.status).toBe("succeeded");
  });
});

describe("repairStage — non-target stage regression (start_frame_render_plan keeps the deterministic placeholder)", () => {
  it("never calls any real generator and persists no live-content column — output is byte-identical to the pre-existing placeholder", async () => {
    const episode = baseEpisode();
    // Only 2 selects for a non-real-repair stage: loadEpisode + checkpoint lookup.
    mockDb.select
      .mockReturnValueOnce(selectChain([episode]))
      .mockReturnValueOnce(selectChain([]));

    const runUpdateChain = updateChain();
    mockDb.update.mockReturnValue(runUpdateChain);
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 803 }]))
      .mockReturnValueOnce(insertChain([{ id: 903 }]));

    const outcome = await pipeline.repairStage(owner, "start_frame_render_plan", {
      instruction: "irrelevant instruction",
    });

    expect(mockGenerateEpisodeScript).not.toHaveBeenCalled();
    expect(mockGenerateStoryboardShotgrid).not.toHaveBeenCalled();
    expect(mockGenerateEpisodeDialogueAudioPlan).not.toHaveBeenCalled();
    // Only the run's artifactIds update happens — no live episode-column write.
    expect(mockDb.update).toHaveBeenCalledTimes(1);

    const artifactValues = (mockDb.insert.mock.results[1].value as any).values.mock.calls[0][0];
    expect(artifactValues.jsonPayload).toMatchObject({
      stage: "start_frame_render_plan",
      mode: "single_frame_per_shot",
      selectedImageModelId: "dry-run-image-model",
    });
    expect(outcome.result.status).toBe("succeeded");
  });
});

describe("repairStage — real-generation failure maps to failed/repair RunResult (never throws)", () => {
  it("plan_episode_script: a generation error is mapped, not thrown; the live script column is left untouched", async () => {
    const episode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([episode]))
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS));

    const runUpdateChain = updateChain();
    mockDb.update.mockReturnValue(runUpdateChain);
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 804 }]))
      .mockReturnValueOnce(insertChain([{ id: 904 }]));

    mockGenerateEpisodeScript.mockRejectedValue(new Error("provider timeout"));

    const outcome = await pipeline.repairStage(owner, "plan_episode_script", {
      instruction: "fix it",
    });

    expect(outcome.result.status).toBe("failed");
    expect(outcome.result.next_action).toBe("repair");
    expect(outcome.result.errors).toEqual([
      { code: "VD_SCRIPT_GENERATION_FAILED", message: "provider timeout", repairable: true },
    ]);
    expect(outcome.staleStages).toEqual([]);
    // No episode-column update at all — generation failed before persisting.
    expect(mockDb.update).toHaveBeenCalledTimes(1); // only the run's artifactIds update
  });

  it("plan_episode_script: a critically-underfilled-script style error (VdEpisodeUnderfilledError-shaped) is mapped the SAME way — needs_repair, not a crash", async () => {
    const episode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([episode]))
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", productTieIn: null, tone: null }]))
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS));
    mockDb.update.mockReturnValue(updateChain());
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 805 }]))
      .mockReturnValueOnce(insertChain([{ id: 905 }]));

    class VdEpisodeUnderfilledErrorStub extends Error {}
    mockGenerateEpisodeScript.mockRejectedValue(
      new VdEpisodeUnderfilledErrorStub(
        "Episode script is critically underfilled: ~10.0s of estimated speech for a 60s episode (17% coverage) — needs repair before the storyboard stage.",
      ),
    );

    const outcome = await pipeline.repairStage(owner, "plan_episode_script", {
      instruction: "expand the dialogue",
    });

    expect(outcome.result.status).toBe("failed");
    expect(outcome.result.next_action).toBe("repair");
    expect(outcome.result.errors[0].message).toContain("critically underfilled");
  });

  it("dialogue_audio_plan: a generation error is mapped via mapDialogueAudioPlanGenerationError, never throws", async () => {
    const episode = baseEpisode();
    mockDb.select
      .mockReturnValueOnce(selectChain([episode]))
      .mockReturnValueOnce(selectChain([{ locale: "th" }]))
      .mockReturnValueOnce(selectChain(CHARACTER_ROWS));
    mockDb.update.mockReturnValue(updateChain());
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 806 }]))
      .mockReturnValueOnce(insertChain([{ id: 906 }]));

    mockGenerateEpisodeDialogueAudioPlan.mockRejectedValue(new Error("skill call failed"));

    const outcome = await pipeline.repairStage(owner, "dialogue_audio_plan", {
      instruction: "fix the dialogue",
    });

    expect(outcome.result.status).toBe("failed");
    expect(outcome.result.next_action).toBe("repair");
    expect(outcome.result.errors).toEqual([
      { code: "VD_DIALOGUE_AUDIO_PLAN_GENERATION_FAILED", message: "skill call failed", repairable: true },
    ]);
    expect(mockBuildDialogueAudioPlan).not.toHaveBeenCalled();
  });
});

describe("repairStage — W11.6 Story Lock guard integration through the REAL repair path", () => {
  it("a real repaired script that changes the beat count is flagged by evaluateVerticalDramaStoryLockScriptGuard (violated: true)", async () => {
    const episode = baseEpisode();
    queueSuccessSelects(episode, { bible: null, locale: "th", productTieIn: null, tone: null });
    const episodeUpdateChain = updateChain();
    mockDb.update.mockReturnValueOnce(episodeUpdateChain).mockReturnValueOnce(updateChain());
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 807 }]))
      .mockReturnValueOnce(insertChain([{ id: 907 }]));

    // Story-violating rewrite: an extra beat appended (beat count changed).
    const STORY_VIOLATING_SCRIPT = {
      ...CURRENT_SCRIPT,
      structure: {
        mode: "beat",
        acts: [],
        beats: [{ beat: 1, summary: "b1" }, { beat: 2, summary: "a brand new invented beat" }],
      },
    };
    mockGenerateEpisodeScript.mockResolvedValue({
      script: STORY_VIOLATING_SCRIPT,
      creditsUsed: 3,
      model: "gpt-x",
    });

    await pipeline.repairStage(owner, "plan_episode_script", {
      instruction: "polish the wording only",
    });

    // Same snapshot/compare sequence `repairVerticalDramaStageWithStoryLockGuard`
    // (server/routers/verticalDramaEpisodes.ts) performs: prior = the episode's
    // script BEFORE this call; repaired = what repairStage actually persisted.
    const persistedScript = episodeUpdateChain.set.mock.calls[0][0].script;
    const guard = evaluateVerticalDramaStoryLockScriptGuard(CURRENT_SCRIPT, persistedScript);

    expect(guard.violated).toBe(true);
    expect(guard.violations.some((v: string) => v.includes("beat count changed"))).toBe(true);
  });

  it("a real repaired script that only reword the SAME beats/hook/cliffhanger is NOT flagged (violated: false)", async () => {
    const episode = baseEpisode();
    queueSuccessSelects(episode, { bible: null, locale: "th", productTieIn: null, tone: null });
    const episodeUpdateChain = updateChain();
    mockDb.update.mockReturnValueOnce(episodeUpdateChain).mockReturnValueOnce(updateChain());
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 808 }]))
      .mockReturnValueOnce(insertChain([{ id: 908 }]));

    // Execution-only rewrite: same beat count/hook/cliffhanger words, just
    // additional flavor text — same significant-word overlap.
    const EXECUTION_ONLY_SCRIPT = {
      ...CURRENT_SCRIPT,
      hook: "Aria's phone lights up mid-signature, hands trembling.",
      cliffhanger: "A weak cliffhanger, somehow even weaker now.",
    };
    mockGenerateEpisodeScript.mockResolvedValue({
      script: EXECUTION_ONLY_SCRIPT,
      creditsUsed: 3,
      model: "gpt-x",
    });

    await pipeline.repairStage(owner, "plan_episode_script", {
      instruction: "polish the wording only",
    });

    const persistedScript = episodeUpdateChain.set.mock.calls[0][0].script;
    const guard = evaluateVerticalDramaStoryLockScriptGuard(CURRENT_SCRIPT, persistedScript);

    expect(guard.violated).toBe(false);
  });
});
