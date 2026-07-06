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
    });

    expect(result).toEqual([
      { characterKey: "หนูนา", lineTh: "ยายทวดจัน…วันนี้อย่าหลงนะ" },
      { characterKey: "ยายทวดจัน", lineTh: "เสียง…ชา…อืม" },
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
    expect(shot9).toEqual([{ characterKey: "E", lineTh: "scene five" }]);

    const shot1 = resolveShotDialogueLines({
      shotNumber: 1,
      matchingClip: undefined,
      dialogueAudioPlan: null,
      script,
      storyboardShotCount: 9,
    });
    expect(shot1).toEqual([{ characterKey: "A", lineTh: "scene one" }]);
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
