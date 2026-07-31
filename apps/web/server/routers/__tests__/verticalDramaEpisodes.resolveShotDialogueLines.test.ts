/**
 * Vertical Drama — `resolveShotDialogueLines` (per-shot dialogue sourcing
 * fallback chain, 2026-07-06 fix) unit coverage. Same "mock the whole module
 * graph" convention as `verticalDramaEpisodes.generateShotVideoPrompt.test.ts`
 * — only imports the pure helper, but the router file's module-level imports
 * still need mocking to load it at all.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db", () => ({ db: {} }));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: vi.fn(), generateVideoAsync: vi.fn() },
  DEFAULT_MODELS: { image: "google-nano-banana-pro", video: "veo3/generate-veo-3-video-lite" },
  resolveReferenceUrl: vi.fn((url: string, publicUrl?: string | null) =>
    url.startsWith("http") ? url : `${publicUrl ?? ""}${url}`
  ),
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 10),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: vi.fn(),
  resolveVerticalDramaCapabilities: vi.fn(() => ({})),
  deriveModelResolutionOptions: vi.fn(() => undefined),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "token"),
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: vi.fn() },
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: vi.fn(),
}));

vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
  // Async stage set + generalized submit
  // (`planning/vd-async-stage-jobs-generalization/plan.md`) — the router
  // reads both on every runStage call, so a factory without them throws
  // before the behavior under test is reached.
  VERTICAL_DRAMA_ASYNC_STAGES: new Set([
    "storyboard_shotgrid",
    "plan_episode_script",
  ]),
  verticalDramaEpisodePipeline: {},
  VerticalDramaEpisodePipeline: class {},
  VERTICAL_DRAMA_PIPELINE_STAGES: ["plan_episode_script"],
  VERTICAL_DRAMA_RUNNER_MODES: ["dry_run", "full"],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
  detectProviderFamily: vi.fn(() => "veo"),
}));

vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: {},
  memoryRowToEvent: vi.fn(),
}));

vi.mock("../../services/verticalDramaEpisodeContinuation", () => ({
  generateNextEpisodesViaLlm: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../services/verticalDramaShotReferences", () => ({
  verticalDramaShotReferencesService: {
    listForEpisode: vi.fn(),
    listForShot: vi.fn(),
    linkReference: vi.fn(),
    deleteReference: vi.fn(),
    reorder: vi.fn(),
  },
  VerticalDramaShotReferenceError: class extends Error {
    constructor(public reason: string, message: string) {
      super(message);
    }
  },
}));

vi.mock("../../services/verticalDramaEpisodeQualityReview", () => ({
  runVerticalDramaEpisodeQualityReview: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
}));

// Mocked directly (like `verticalDramaEpisodeQualityReview` above) so this
// file never pulls in `verticalDramaSeriesMemoryPlanning.ts` ->
// `verticalDramaStoryBible.ts` -> `enabledLlmModels.ts` -> `llmProviders.ts`'s
// `adminProcedure` dependency, which this file's `../../_core/trpc` mock does
// not export.
vi.mock("../../services/verticalDramaSeriesMemoryPlanning", () => ({
  runVerticalDramaSeriesMemoryPlanning: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
}));

vi.mock("../../services/verticalDramaVideoPromptFormatter", () => ({
  formatVideoClipRequest: vi.fn(),
}));

vi.mock("../../services/verticalDramaVideoMotionPromptGeneration", () => ({
  generateVerticalDramaShotVideoPrompt: vi.fn(),
}));

vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));

import { resolveShotDialogueLines } from "../verticalDramaEpisodes";
import type { VdDeepDraftShotDraft } from "../../services/verticalDramaStoryBible";

describe("resolveShotDialogueLines", () => {
  it("prefers already-synced clip dialogue over every other source", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: {
        clipNumber: 1,
        dialogue: [{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }],
      },
      dialogueAudioPlan: {
        dialogue_lines: [{ shot_number: 1, dialogue_line: "จาก dialogueAudioPlan" }],
      },
      script: {
        scene_dialogue_summary: [{ scene: 1, dialogue_lines: ["หนูนา: \"จากสคริปต์\""] }],
      },
      storyboardShotCount: 9,
    });

    expect(result).toEqual([{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }]);
  });

  it("falls back to dialogueAudioPlan when no clip dialogue is synced yet", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: { clipNumber: 1 },
      dialogueAudioPlan: {
        dialogue_lines: [
          {
            shot_number: 1,
            dialogue_line: "จาก dialogueAudioPlan",
            speaker_character_id: "หนูนา",
          },
        ],
      },
      script: {
        scene_dialogue_summary: [{ scene: 1, dialogue_lines: ["หนูนา: \"จากสคริปต์\""] }],
      },
      storyboardShotCount: 9,
    });

    expect(result).toEqual([
      expect.objectContaining({ lineTh: "จาก dialogueAudioPlan", characterKey: "หนูนา" }),
    ]);
  });

  it("falls back to the script's scene_dialogue_summary when dialogueAudioPlan is absent (script-only case)", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: {
        scene_dialogue_summary: [
          {
            scene: 1,
            dialogue_lines: [
              "หนูนา: \"ยายทวดจัน…วันนี้อย่าหลงนะ\"",
              "ยายทวดจัน: \"เสียง…ชา…อืม\"",
            ],
          },
        ],
      },
      storyboardShotCount: 9,
      knownSpeakerKeys: new Set(["หนูนา", "ยายทวดจัน"]),
    });

    expect(result).toEqual([
      { characterKey: "หนูนา", lineTh: "ยายทวดจัน…วันนี้อย่าหลงนะ", origin: "script_fallback" },
    ]);
  });

  it("drops an unattributed sound-cue fragment from the script fallback (2026-07-07 unusable-dialogue fix): the exact user repro string with no recognized speaker", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: {
        scene_dialogue_summary: [
          {
            scene: 1,
            dialogue_lines: [
              "หนูนา: \"อย่าไปไหนนะยาย\"",
              "เสียง…ชา…อืม…ใครมาฝากอีกแล้วหรือเปล่า",
            ],
          },
        ],
      },
      storyboardShotCount: 9,
      knownSpeakerKeys: new Set(["หนูนา"]),
    });

    expect(result).toEqual([
      { characterKey: "หนูนา", lineTh: "อย่าไปไหนนะยาย", origin: "script_fallback" },
    ]);
  });

  it("drops sound-cue speaker labels such as 'เสียงชานไม้' when they are not known characters", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: {
        scene_dialogue_summary: [
          {
            scene: 1,
            dialogue_lines: [
              "หนูนา: \"อย่าไปไหนนะยาย\"",
              "เสียงชานไม้: \"อืม...ใครมาฝากอีกแล้วหรือเปล่า\"",
            ],
          },
        ],
      },
      storyboardShotCount: 9,
      knownSpeakerKeys: new Set(["หนูนา"]),
    });

    expect(result).toEqual([
      { characterKey: "หนูนา", lineTh: "อย่าไปไหนนะยาย", origin: "script_fallback" },
    ]);
  });

  it("keeps a line whose speaker matches a known character even when the speaker label itself looks unusual (e.g. a real 'voice' character like เสียงในขวด)", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: {
        scene_dialogue_summary: [
          {
            scene: 1,
            dialogue_lines: ["เสียงในขวด: \"ปล่อยฉันออกไปที\""],
          },
        ],
      },
      storyboardShotCount: 9,
      knownSpeakerKeys: new Set(["เสียงในขวด"]),
    });

    expect(result).toEqual([
      { characterKey: "เสียงในขวด", lineTh: "ปล่อยฉันออกไปที", origin: "script_fallback" },
    ]);
  });

  it("drops a bare ellipsis-only fragment with no speaker label at all", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: {
        scene_dialogue_summary: [
          { scene: 1, dialogue_lines: ["หนูนา: \"สวัสดีค่ะ\"", "…"] },
        ],
      },
      storyboardShotCount: 9,
      knownSpeakerKeys: new Set(["หนูนา"]),
    });

    expect(result).toEqual([
      { characterKey: "หนูนา", lineTh: "สวัสดีค่ะ", origin: "script_fallback" },
    ]);
  });

  it("maps a later shot number onto a later scene proportionally", () => {
    const script = {
      scene_dialogue_summary: [
        { scene: 1, dialogue_lines: ["A: \"scene one\""] },
        { scene: 2, dialogue_lines: ["B: \"scene two\""] },
        { scene: 3, dialogue_lines: ["C: \"scene three\""] },
        { scene: 4, dialogue_lines: ["D: \"scene four\""] },
        { scene: 5, dialogue_lines: ["E: \"scene five\""] },
      ],
    };

    const shot9 = resolveShotDialogueLines({
      shotNumber: 9,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script,
      storyboardShotCount: 9,
    });
    expect(shot9).toEqual([
      { characterKey: "E", lineTh: "scene five", origin: "script_fallback" },
    ]);

    const shot1 = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script,
      storyboardShotCount: 9,
    });
    expect(shot1).toEqual([
      { characterKey: "A", lineTh: "scene one", origin: "script_fallback" },
    ]);
  });

  it("returns [] (never throws) when no source has any dialogue for this shot — a genuinely silent shot stays silent", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: { clipNumber: 1, dialogue: [] },
      dialogueAudioPlan: null,
      script: null,
      storyboardShotCount: 9,
    });

    expect(result).toEqual([]);
  });

  it("returns [] when dialogueAudioPlan exists but has no lines for this shot/clip and there is no script fallback", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 5,
      matchingClip: { clipNumber: 5 },
      dialogueAudioPlan: {
        dialogue_lines: [{ shot_number: 1, dialogue_line: "unrelated shot" }],
      },
      script: null,
      storyboardShotCount: 9,
    });

    expect(result).toEqual([]);
  });
});

/**
 * Story-density reform (spec §7.7.2 Layer 3/4, section-13, added
 * 2026-07-07) — source 3a: deterministic beat-index mapping, preferred over
 * the positional guess (3b) whenever the shot carries `sourceBeatIndexes`
 * and the referenced beat(s) have dialogue-complete `dialogue_lines[]`.
 */
describe("resolveShotDialogueLines — source 3a beat-index mapping", () => {
  const scriptWithDialogueCompleteBeats = {
    structure: {
      beats: [
        { beat: 1, summary: "beat zero", dialogue_lines: [{ speaker: "หนูนา", line: "สวัสดีค่ะ" }] },
        {
          beat: 2,
          summary: "beat one",
          dialogue_lines: [
            { speaker: "ยายทวดจัน", line: "อย่าไปไหนนะยาย", delivery: "urgent whisper", subtext: "ห่วงใย" },
            { speaker: "หนูนา", line: "ค่ะยาย" },
          ],
        },
      ],
    },
    // Legacy freeform fallback data too, to prove 3a wins over 3b when both
    // are present.
    scene_dialogue_summary: [{ scene: 1, dialogue_lines: ["ป้าตา: \"จากฉากเก่า\""] }],
  };

  it("maps to the referenced beat's dialogue_lines by 0-based index, ignoring the positional/scene fallback entirely", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: scriptWithDialogueCompleteBeats,
      storyboardShotCount: 9,
      sourceBeatIndexes: [0],
    });

    expect(result).toEqual([{ characterKey: "หนูนา", lineTh: "สวัสดีค่ะ" }]);
  });

  it("combines lines from multiple referenced beat indexes, in order", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 2,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: scriptWithDialogueCompleteBeats,
      storyboardShotCount: 9,
      sourceBeatIndexes: [0, 1],
    });

    expect(result).toEqual([
      { characterKey: "หนูนา", lineTh: "สวัสดีค่ะ" },
      {
        characterKey: "ยายทวดจัน",
        lineTh: "อย่าไปไหนนะยาย",
        delivery: { tone: "urgent whisper" },
        subtext: "ห่วงใย",
      },
      { characterKey: "หนูนา", lineTh: "ค่ะยาย" },
    ]);
  });

  it("never tags a beat-mapped line with origin: script_fallback (it is script-stage-authored, not a freeform guess)", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: scriptWithDialogueCompleteBeats,
      storyboardShotCount: 9,
      sourceBeatIndexes: [1],
    });

    expect(result.every((l) => l.origin === undefined)).toBe(true);
  });

  it("falls back to the positional guess (source 3b, keeping its script_fallback tag) when sourceBeatIndexes is omitted", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: scriptWithDialogueCompleteBeats,
      storyboardShotCount: 9,
      // sourceBeatIndexes intentionally omitted.
    });

    expect(result).toEqual([{ characterKey: "ป้าตา", lineTh: "จากฉากเก่า", origin: "script_fallback" }]);
  });

  it("falls back to the positional guess when sourceBeatIndexes is an empty array", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: scriptWithDialogueCompleteBeats,
      storyboardShotCount: 9,
      sourceBeatIndexes: [],
    });

    expect(result).toEqual([{ characterKey: "ป้าตา", lineTh: "จากฉากเก่า", origin: "script_fallback" }]);
  });

  it("falls back to the positional guess when the referenced beat index is out of range / has no dialogue_lines", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: scriptWithDialogueCompleteBeats,
      storyboardShotCount: 9,
      sourceBeatIndexes: [99],
    });

    expect(result).toEqual([{ characterKey: "ป้าตา", lineTh: "จากฉากเก่า", origin: "script_fallback" }]);
  });

  it("never runs beat-index mapping for sources 1/2 — already-synced clip dialogue still wins outright", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: {
        clipNumber: 1,
        dialogue: [{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }],
      },
      dialogueAudioPlan: null,
      script: scriptWithDialogueCompleteBeats,
      storyboardShotCount: 9,
      sourceBeatIndexes: [0],
    });

    expect(result).toEqual([{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }]);
  });
});

/**
 * Dialogue single-source-of-truth (planning/`polished-toasting-gadget.md`,
 * added 2026-07-11) — source 0: the deep-drafted shot's canonical dialogue
 * (`bible.breakdownVersions[active].items[episode].shotDrafts[shot]`, the
 * Overview page's user-editable source of truth). Tried BEFORE every other
 * source, including the previously most-authoritative source 1
 * (`matchingClip.dialogue`) — this is the actual fix for the recurring
 * "wrong dialogue in the video prompt" bug (a stale/wrong persisted
 * `matchingClip.dialogue` value was winning over what a human had since
 * edited/confirmed at the Overview page).
 */
describe("resolveShotDialogueLines — source 0: deep-drafted canonical dialogue", () => {
  it("wins over source 1 (matchingClip.dialogue) even when the clip carries a different, stale/wrong value (regression test for the actual bug this fix addresses)", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: {
        clipNumber: 1,
        dialogue: [{ lineTh: "ค่าที่ค้างผิดจากรอบก่อนหน้า", characterKey: "หนูนา" }],
      },
      dialogueAudioPlan: null,
      script: null,
      storyboardShotCount: 9,
      deepDraftShot: {
        shot_number: 1,
        summary: "shot summary",
        dialogue_lines: [{ speaker: "หนูนา", line: "TESTMARK123" }],
      } as VdDeepDraftShotDraft,
    });

    expect(result).toEqual([{ characterKey: "หนูนา", lineTh: "TESTMARK123" }]);
  });

  it("maps speaker/line/delivery fields correctly (delivery folded into tone, same convention as source 3a)", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script: null,
      storyboardShotCount: 9,
      deepDraftShot: {
        shot_number: 1,
        summary: "shot summary",
        dialogue_lines: [
          { speaker: "ยายทวดจัน", line: "อย่าไปไหนนะยาย", delivery: "urgent whisper" },
          { speaker: "หนูนา", line: "ค่ะยาย" },
        ],
      } as VdDeepDraftShotDraft,
    });

    expect(result).toEqual([
      {
        characterKey: "ยายทวดจัน",
        lineTh: "อย่าไปไหนนะยาย",
        delivery: { tone: "urgent whisper" },
      },
      { characterKey: "หนูนา", lineTh: "ค่ะยาย" },
    ]);
  });

  it("returns [] for an explicit silence_intent shot, even when a lower-fidelity fallback source has real dialogue", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: {
        clipNumber: 1,
        dialogue: [{ lineTh: "ค่าเก่าบนคลิป", characterKey: "หนูนา" }],
      },
      dialogueAudioPlan: {
        dialogue_lines: [{ shot_number: 1, dialogue_line: "จาก dialogueAudioPlan" }],
      },
      script: {
        scene_dialogue_summary: [{ scene: 1, dialogue_lines: ["หนูนา: \"จากสคริปต์\""] }],
      },
      storyboardShotCount: 9,
      deepDraftShot: {
        shot_number: 1,
        summary: "a wordless establishing shot",
        dialogue_lines: [],
        silence_intent: "establishing",
      } as VdDeepDraftShotDraft,
    });

    expect(result).toEqual([]);
  });

  it("falls through to the pre-existing chain when the deep-draft entry has neither dialogue_lines nor silence_intent yet (in-progress draft)", () => {
    const result = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: {
        clipNumber: 1,
        dialogue: [{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }],
      },
      dialogueAudioPlan: null,
      script: null,
      storyboardShotCount: 9,
      deepDraftShot: {
        shot_number: 1,
        summary: "not drafted yet",
        dialogue_lines: [],
      } as VdDeepDraftShotDraft,
    });

    expect(result).toEqual([{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }]);
  });

  it("is byte-identical to the pre-existing behavior when deepDraftShot is omitted (undefined) — backward compatibility for callers that haven't adopted the new param", () => {
    const withoutParam = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: {
        clipNumber: 1,
        dialogue: [{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }],
      },
      dialogueAudioPlan: null,
      script: null,
      storyboardShotCount: 9,
    });
    const withNullParam = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: {
        clipNumber: 1,
        dialogue: [{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }],
      },
      dialogueAudioPlan: null,
      script: null,
      storyboardShotCount: 9,
      deepDraftShot: null,
    });

    expect(withoutParam).toEqual([{ lineTh: "จากคลิปที่ซิงค์แล้ว", characterKey: "หนูนา" }]);
    expect(withNullParam).toEqual(withoutParam);
  });
});
