/**
 * Vertical Drama Episodes — W12-A "voice chain" wave coverage:
 *  - `selectPendingDialogueAudioLines` / `estimateDialogueAudioBatchCreditCost` /
 *    `buildDialogueAudioTimelineFromPlan` — pure helpers (DB-free).
 *  - `generateEpisodeDialogueAudio` — whole-episode per-line TTS batch
 *    (resumability, credit pre-check math, partial-failure semantics,
 *    idempotency).
 *  - `assembleEpisodeVideo` — the additive, flag-gated `dialogueAudioTimeline`/
 *    `loudnessNormalize` manifest merge (flags-off unchanged).
 *
 * The router file itself has a large module graph (DB, credit service, media
 * generation service, pipeline, provider routing, etc.) — same "mock
 * everything to a minimal no-op shape purely so the module can be imported"
 * convention as `verticalDramaEpisodes.modelSelection.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetModelsByTypeAsync } = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  resolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  })),
  deriveModelResolutionOptions: vi.fn(() => undefined),
}));

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

const { mockGenerateImageAsync, mockGenerateAudioAsync, mockGenerateVideoAsync } = vi.hoisted(() => ({
  mockGenerateImageAsync: vi.fn(),
  mockGenerateAudioAsync: vi.fn(),
  mockGenerateVideoAsync: vi.fn(),
}));
vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: mockGenerateImageAsync,
    generateAudioAsync: mockGenerateAudioAsync,
    generateVideoAsync: mockGenerateVideoAsync,
  },
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo3/generate-veo-3-video-lite",
    audio: "uvoice/tts-premium",
  },
}));

const { mockCalculateCreditCost } = vi.hoisted(() => ({
  mockCalculateCreditCost: vi.fn((model: { creditCost: number }) => model.creditCost),
}));
vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: mockCalculateCreditCost,
}));

const { mockHasEnoughCredits, mockDeductCredits, mockRefundCredits } = vi.hoisted(() => ({
  mockHasEnoughCredits: vi.fn(),
  mockDeductCredits: vi.fn(),
  mockRefundCredits: vi.fn(),
}));
vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: mockHasEnoughCredits,
  deductCredits: mockDeductCredits,
  refundCredits: mockRefundCredits,
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

// Location visual bible, Phase D (planning/polished-toasting-gadget.md) —
// `getEpisodeDetail`'s new `episodeLocations` field resolves through
// `verticalDramaLocationStockService.listRows`, mocked here the same way as
// `verticalDramaCharacterStockService` above (its real implementation uses
// `.innerJoin(...)`, not implemented by this file's `selectChain` helper).
// Defaults to an empty roster — every pre-existing test in this file never
// asserts on `episodeLocations`, so this is purely additive.
vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    getPrimaryReferenceUrl: vi.fn(),
    getPrimaryReferenceAssetId: vi.fn(),
    listRows: vi.fn(() => Promise.resolve([])),
  },
}));

const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));

vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
  verticalDramaEpisodePipeline: {},
  VerticalDramaEpisodePipeline: class {},
  VERTICAL_DRAMA_PIPELINE_STAGES: ["plan_episode_script"],
  VERTICAL_DRAMA_RUNNER_MODES: ["dry_run", "full"],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
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

vi.mock("../../services/verticalDramaSeriesMemoryPlanning", () => ({
  runVerticalDramaSeriesMemoryPlanning: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  RateLimitExceededError: class extends Error {},
}));

vi.mock("../../services/verticalDramaVideoPromptFormatter", () => ({
  formatVideoClipRequest: vi.fn(() => ({
    prompt: "formatted prompt",
    negativePrompt: undefined,
    providerFamily: "veo",
    nativeAudioDialogue: true,
    generateAudio: true,
    ttsFallback: false,
    ttsLines: [],
    maxReferenceImages: 3,
    supportsStartFrame: true,
  })),
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

vi.mock("../../services/verticalDramaEpisodeVideoAssembly", () => ({
  extractClipSourcesFromMotionPromptPack: vi.fn(() => []),
  resolveClipsForAssembly: vi.fn(() => ({ ordered: [], missing: [] })),
  // no longer the primary path — see queueVerticalDramaFfmpegAssemblyJob
  submitAssemblyJob: vi.fn(async () => ({ jobId: "job-1" })),
  // Vertical Drama Render Queue plan §4.2 Wave 3 — `assembleEpisodeVideo`
  // persists `assemblyManifest.compiledVideo = {status:"pending", pendingJobId}`
  // right after enqueueing.
  persistCompiledVideoState: vi.fn(async () => undefined),
  compiledVideoFilename: vi.fn(() => "compiled.mp4"),
  // Task #21 phase B — default no-op shape (matches every PRE-EXISTING test
  // in this file, none of which set `includeDialogueAudio`/`subtitlePreset`);
  // overridden per-test below via `mockReturnValueOnce`/`mockReturnValue` for
  // the new "dialogue audio + subtitles feeding" coverage — same controllable
  // mock pattern this file already uses for `submitAssemblyJob`/
  // `resolveClipsForAssembly`. The REAL implementation's own math/branching
  // is covered directly in `verticalDramaEpisodeVideoAssembly.test.ts`.
  resolveEpisodeDialogueAudioAndSubtitlesRunInputs: vi.fn(() => ({
    dialogueAudioSegmentsIncluded: 0,
    subtitleLinesIncluded: 0,
  })),
}));

// Vertical Drama Render Queue plan §4.2 Wave 3 — `assembleEpisodeVideo`
// enqueues via this lazily-imported service instead of calling
// `submitAssemblyJob` in-process; mocked here the SAME way so
// `assembleEpisodeVideo`'s dynamic `await import(...)` resolves to this
// stub instead of the real module (which calls `createRateLimiter(...)` at
// load time — see that router file's own import-block doc comment).
const { mockQueueVerticalDramaFfmpegAssemblyJob } = vi.hoisted(() => ({
  mockQueueVerticalDramaFfmpegAssemblyJob: vi.fn(async () => ({
    created: true,
    job: { id: "job-1" },
  })),
}));
vi.mock("../../services/workerSchedulerService", () => ({
  queueVerticalDramaFfmpegAssemblyJob: mockQueueVerticalDramaFfmpegAssemblyJob,
}));

vi.mock("../../services/appRuntimeConfig", () => ({
  getCachedAppRuntimeConfig: vi.fn(() => ({ internalNodeUrl: "http://localhost:3000" })),
}));

vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
  debugLog: vi.fn(),
}));

import {
  verticalDramaEpisodesRouter,
  selectPendingDialogueAudioLines,
  estimateDialogueAudioBatchCreditCost,
  buildDialogueAudioTimelineFromPlan,
} from "../verticalDramaEpisodes";
import * as episodeVideoAssembly from "../../services/verticalDramaEpisodeVideoAssembly";
import type { VerticalDramaDialogueAudioPlan, VerticalDramaSeparateTtsPlanItem } from "@shared/verticalDramaSeries/audio";

const router = verticalDramaEpisodesRouter as unknown as Record<string, Function>;

function ctx(overrides: Partial<{ tenantId: string | null; user: { id: number } }> = {}) {
  return { tenantId: "tenant-1", user: { id: 42 }, userToken: null, publicUrl: undefined, ...overrides };
}

/** Thenable select-chain stub — resolves at ANY point in the chain.
 *  `orderBy` was added for debt-item-1's `getEpisodeDetail` coverage below
 *  (`loadLatestQualityReview` chains `.orderBy(...).limit(1)`) — a pure
 *  passthrough, so every pre-existing test in this file that never calls it
 *  is unaffected. */
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

function updateChain(rows: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

function ttsItem(over: Partial<VerticalDramaSeparateTtsPlanItem> = {}): VerticalDramaSeparateTtsPlanItem {
  return {
    lineId: "line-1",
    speakerName: "Aria",
    characterId: "char_aria",
    voiceProvider: "uvoice",
    voiceModelId: "uvoice/tts-premium",
    voiceId: "th-porche",
    text: "We are not done here.",
    targetDurationSeconds: 2,
    blocked: false,
    ...over,
  };
}

function dialogueLine(over: Record<string, unknown> = {}) {
  return {
    lineId: "line-1",
    shotNumber: 1,
    clipNumber: 1,
    speakerName: "Aria",
    speakerCharacterId: "char_aria",
    isNarration: false,
    text: "We are not done here.",
    start: 0,
    end: 2,
    targetDurationSeconds: 2,
    ...over,
  };
}

function plan(over: Partial<VerticalDramaDialogueAudioPlan> = {}): VerticalDramaDialogueAudioPlan {
  return {
    planId: "dap-1",
    seriesId: "10",
    episodeId: "20",
    mode: "dialogue",
    audioStrategy: "separate_tts_voiceover",
    language: "th",
    dialogueLines: [dialogueLine() as any],
    speakerVoiceMap: { entries: [] },
    nativeAudioPolicy: {
      requested: false,
      modelSupportsNativeAudio: false,
      modelSupportsRequestedLanguage: false,
      userAcceptedRegenerationCost: false,
      allowed: false,
      blockingReasons: [],
    },
    separateTtsPlan: { strategy: "separate_tts_voiceover", items: [ttsItem()], injectsIntoVideoPrompts: false, blockedLineIds: [] },
    nativeAudioSnippets: [],
    subtitleCues: [],
    subtitleSafeArea: { position: "bottom_safe", maxLines: 2, avoidFaceArea: true },
    timing: { episodeTargetSeconds: 60, totalDialogueSeconds: 2, perShot: [], overlongLineIds: [], timingMismatch: false },
    repairQueue: [],
    warnings: [],
    subShotsEnabled: false,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
    ...over,
  };
}

const EPISODE_ROW_BASE = {
  id: 20,
  tenantId: "tenant-1",
  userId: 42,
  seriesId: 10,
  episodeNumber: 1,
  motionPromptPack: null,
  assemblyManifest: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });
  mockHasEnoughCredits.mockResolvedValue(true);
  mockDeductCredits.mockResolvedValue({ id: 1 });
  mockRefundCredits.mockResolvedValue({ id: 2 });
  mockCalculateCreditCost.mockImplementation((model: { creditCost: number }) => model.creditCost);
});

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

describe("selectPendingDialogueAudioLines", () => {
  it("returns [] for a null/no-separate-TTS plan", () => {
    expect(selectPendingDialogueAudioLines(null)).toEqual([]);
    expect(selectPendingDialogueAudioLines(plan({ separateTtsPlan: undefined }))).toEqual([]);
  });

  it("excludes blocked items", () => {
    const result = selectPendingDialogueAudioLines(
      plan({
        separateTtsPlan: {
          strategy: "separate_tts_voiceover",
          items: [ttsItem({ lineId: "l1" }), ttsItem({ lineId: "l2", blocked: true, voiceId: undefined })],
          injectsIntoVideoPrompts: false,
          blockedLineIds: ["l2"],
        },
      }),
    );
    expect(result.map((i) => i.lineId)).toEqual(["l1"]);
  });

  it("excludes lines already carrying a pending task (resumability)", () => {
    const result = selectPendingDialogueAudioLines(
      plan({
        separateTtsPlan: {
          strategy: "separate_tts_voiceover",
          items: [
            ttsItem({ lineId: "l1" }),
            ttsItem({ lineId: "l2", audioTask: { pendingTaskId: "task-abc" } }),
          ],
          injectsIntoVideoPrompts: false,
          blockedLineIds: [],
        },
      }),
    );
    expect(result.map((i) => i.lineId)).toEqual(["l1"]);
  });

  it("excludes lines already carrying a completed audio asset (resumability)", () => {
    const result = selectPendingDialogueAudioLines(
      plan({
        separateTtsPlan: {
          strategy: "separate_tts_voiceover",
          items: [
            ttsItem({ lineId: "l1" }),
            ttsItem({ lineId: "l2", audioTask: { audioUrl: "https://example.com/l2.mp3" } }),
          ],
          injectsIntoVideoPrompts: false,
          blockedLineIds: [],
        },
      }),
    );
    expect(result.map((i) => i.lineId)).toEqual(["l1"]);
  });
});

describe("estimateDialogueAudioBatchCreditCost", () => {
  it("sums each item's cost against its own resolved model pricing", () => {
    const pricing = new Map([
      ["model-a", { creditCost: 3, configJson: null }],
      ["model-b", { creditCost: 7, configJson: null }],
    ]);
    const total = estimateDialogueAudioBatchCreditCost(
      [ttsItem({ voiceModelId: "model-a" }), ttsItem({ voiceModelId: "model-b" })],
      pricing,
    );
    expect(total).toBe(10);
  });

  it("falls back to the default pricing (creditCost: 10) for an unresolvable model", () => {
    const total = estimateDialogueAudioBatchCreditCost([ttsItem({ voiceModelId: "deleted-model" })], new Map());
    expect(total).toBe(10);
  });

  it("degenerates to pendingLines × per-line estimate when every line shares one model", () => {
    const pricing = new Map([["model-a", { creditCost: 4, configJson: null }]]);
    const items = [ttsItem({ lineId: "l1", voiceModelId: "model-a" }), ttsItem({ lineId: "l2", voiceModelId: "model-a" })];
    expect(estimateDialogueAudioBatchCreditCost(items, pricing)).toBe(2 * 4);
  });
});

describe("buildDialogueAudioTimelineFromPlan", () => {
  it("returns [] when no line has a completed audio task", () => {
    expect(buildDialogueAudioTimelineFromPlan(plan())).toEqual([]);
  });

  it("builds one entry per line with a completed audioUrl, using plan timing", () => {
    const result = buildDialogueAudioTimelineFromPlan(
      plan({
        separateTtsPlan: {
          strategy: "separate_tts_voiceover",
          items: [ttsItem({ audioTask: { pendingTaskId: "t1", audioUrl: "https://cdn.example.com/l1.mp3" } })],
          injectsIntoVideoPrompts: false,
          blockedLineIds: [],
        },
      }),
    );
    expect(result).toEqual([
      {
        lineId: "line-1",
        shotNumber: 1,
        clipNumber: 1,
        audioAssetId: "https://cdn.example.com/l1.mp3",
        startSeconds: 0,
        durationSeconds: 2,
      },
    ]);
  });

  it("prefers mediaAssetId over audioUrl when both are present", () => {
    const result = buildDialogueAudioTimelineFromPlan(
      plan({
        separateTtsPlan: {
          strategy: "separate_tts_voiceover",
          items: [
            ttsItem({
              audioTask: { audioUrl: "https://cdn.example.com/l1.mp3", mediaAssetId: "asset-99" },
            }),
          ],
          injectsIntoVideoPrompts: false,
          blockedLineIds: [],
        },
      }),
    );
    expect(result[0].audioAssetId).toBe("asset-99");
  });
});

/* -------------------------------------------------------------------------- */
/* generateEpisodeDialogueAudio                                               */
/* -------------------------------------------------------------------------- */

describe("generateEpisodeDialogueAudio", () => {
  it("throws PRECONDITION_FAILED when the episode has no separate-TTS plan", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ ...EPISODE_ROW_BASE, dialogueAudioPlan: null }]));

    await expect(
      router.generateEpisodeDialogueAudio({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "20" },
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("submits one task per pending line and persists pendingTaskId onto the plan", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ ...EPISODE_ROW_BASE, dialogueAudioPlan: plan() }])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ modelId: "uvoice/tts-premium", creditCost: 5, configJson: null }])); // pricing
    mockGenerateAudioAsync.mockResolvedValue({ id: "task-123" });
    const setSpy = vi.fn();
    const chain = updateChain([]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    const result = await router.generateEpisodeDialogueAudio({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", idempotencyKey: "batch-1" },
    });

    expect(result).toEqual({
      submittedCount: 1,
      skippedCount: 0,
      taskIds: ["task-123"],
      creditEstimate: 5,
    });
    expect(mockGenerateAudioAsync).toHaveBeenCalledWith(
      expect.objectContaining({ text: "We are not done here.", model: "uvoice/tts-premium", voice: "th-porche" }),
      expect.any(String),
    );
    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dialogueAudioPlan: expect.objectContaining({
          separateTtsPlan: expect.objectContaining({
            items: [expect.objectContaining({ lineId: "line-1", audioTask: { pendingTaskId: "task-123" } })],
          }),
        }),
      }),
    );
    // Per-line idempotency key derived from the batch key + lineId.
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "batch-1:line:line-1" }),
    );
  });

  it("resumability: skips a line that already has a pending task and does not re-submit or re-charge it", async () => {
    const alreadySubmitted = plan({
      separateTtsPlan: {
        strategy: "separate_tts_voiceover",
        items: [ttsItem({ audioTask: { pendingTaskId: "existing-task" } })],
        injectsIntoVideoPrompts: false,
        blockedLineIds: [],
      },
    });
    mockDb.select.mockReturnValueOnce(selectChain([{ ...EPISODE_ROW_BASE, dialogueAudioPlan: alreadySubmitted }]));

    const result = await router.generateEpisodeDialogueAudio({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result).toEqual({ submittedCount: 0, skippedCount: 1, taskIds: [], creditEstimate: 0 });
    expect(mockGenerateAudioAsync).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN and submits nothing when the pre-check credit estimate is unaffordable", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ ...EPISODE_ROW_BASE, dialogueAudioPlan: plan() }]))
      .mockReturnValueOnce(selectChain([{ modelId: "uvoice/tts-premium", creditCost: 5, configJson: null }]));
    mockHasEnoughCredits.mockResolvedValue(false);

    await expect(
      router.generateEpisodeDialogueAudio({ ctx: ctx(), input: { seriesId: "10", episodeId: "20" } }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateAudioAsync).not.toHaveBeenCalled();
  });

  it("partial failure: keeps the successfully submitted line's task, refunds and reports the failed line, both surfaced together", async () => {
    const twoLinePlan = plan({
      separateTtsPlan: {
        strategy: "separate_tts_voiceover",
        items: [ttsItem({ lineId: "l1" }), ttsItem({ lineId: "l2" })],
        injectsIntoVideoPrompts: false,
        blockedLineIds: [],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([{ ...EPISODE_ROW_BASE, dialogueAudioPlan: twoLinePlan }]))
      .mockReturnValueOnce(selectChain([{ modelId: "uvoice/tts-premium", creditCost: 5, configJson: null }]));
    mockGenerateAudioAsync
      .mockResolvedValueOnce({ id: "task-l1" })
      .mockRejectedValueOnce(new Error("provider unavailable"));
    mockDb.update.mockReturnValueOnce(updateChain([]));

    const result = await router.generateEpisodeDialogueAudio({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.submittedCount).toBe(1);
    expect(result.taskIds).toEqual(["task-l1"]);
    expect(result.failures).toEqual([{ lineId: "l2", error: "provider unavailable" }]);
    // The failed line's reservation is refunded; the successful line's is not.
    expect(mockDeductCredits).toHaveBeenCalledTimes(2);
    expect(mockRefundCredits).toHaveBeenCalledTimes(1);
    expect(mockRefundCredits).toHaveBeenCalledWith(expect.objectContaining({ amount: 5 }));
  });

  it("continues submitting remaining lines after a mid-batch credit-reservation failure (best-effort, not stop-on-first-failure)", async () => {
    const twoLinePlan = plan({
      separateTtsPlan: {
        strategy: "separate_tts_voiceover",
        items: [ttsItem({ lineId: "l1" }), ttsItem({ lineId: "l2" })],
        injectsIntoVideoPrompts: false,
        blockedLineIds: [],
      },
    });
    mockDb.select
      .mockReturnValueOnce(selectChain([{ ...EPISODE_ROW_BASE, dialogueAudioPlan: twoLinePlan }]))
      .mockReturnValueOnce(selectChain([{ modelId: "uvoice/tts-premium", creditCost: 5, configJson: null }]));
    mockDeductCredits.mockRejectedValueOnce(new Error("Insufficient credits")).mockResolvedValueOnce({ id: 1 });
    mockGenerateAudioAsync.mockResolvedValueOnce({ id: "task-l2" });
    mockDb.update.mockReturnValueOnce(updateChain([]));

    const result = await router.generateEpisodeDialogueAudio({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.submittedCount).toBe(1);
    expect(result.taskIds).toEqual(["task-l2"]);
    expect(result.failures).toEqual([{ lineId: "l1", error: "Insufficient credits" }]);
  });

  it("throws NOT_FOUND for an episode the caller does not own", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    await expect(
      router.generateEpisodeDialogueAudio({ ctx: ctx(), input: { seriesId: "10", episodeId: "999" } }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

/* -------------------------------------------------------------------------- */
/* assembleEpisodeVideo — dialogueAudioTimeline (additive, flag-gated)        */
/* -------------------------------------------------------------------------- */

describe("assembleEpisodeVideo — dialogueAudioTimeline merge (W12-A)", () => {
  const clipSources = [{ clipNumber: 1, videoUrl: "https://cdn.example.com/clip1.mp4" }];

  beforeEach(() => {
    vi.mocked(episodeVideoAssembly.extractClipSourcesFromMotionPromptPack).mockReturnValue(clipSources as any);
    vi.mocked(episodeVideoAssembly.resolveClipsForAssembly).mockReturnValue({
      ordered: clipSources as any,
      missing: [],
    });
    vi.mocked(episodeVideoAssembly.submitAssemblyJob).mockResolvedValue({ jobId: "job-1" } as any);
  });

  const completedPlan = plan({
    separateTtsPlan: {
      strategy: "separate_tts_voiceover",
      items: [ttsItem({ audioTask: { pendingTaskId: "t1", audioUrl: "https://cdn.example.com/l1.mp3" } })],
      injectsIntoVideoPrompts: false,
      blockedLineIds: [],
    },
  });

  it("passes canonical identities to the resolver and submits its one-per-shot selection", async () => {
    const rawClipSources = [
      { clipNumber: 1, videoUrl: "https://cdn.example.com/1.mp4" },
      { clipNumber: 301 },
      { clipNumber: 302, videoUrl: "https://cdn.example.com/302.mp4" },
      { clipNumber: 4, videoUrl: "https://cdn.example.com/4.mp4" },
    ];
    const selectedClipSources = [
      rawClipSources[0],
      rawClipSources[2],
      rawClipSources[3],
    ];
    vi.mocked(
      episodeVideoAssembly.extractClipSourcesFromMotionPromptPack,
    ).mockReturnValue(rawClipSources as any);
    vi.mocked(episodeVideoAssembly.resolveClipsForAssembly).mockReturnValue({
      ordered: selectedClipSources as any,
      missing: [],
    });
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesVoiceChain: false,
    });
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          ...EPISODE_ROW_BASE,
          storyboard: {
            shots: [
              { shot_number: 1 },
              { shot_number: 3 },
              { shot_number: 4 },
            ],
          },
          startFramePlan: {
            frames: [
              { shotNumber: 1 },
              { shotNumber: 3 },
              { shotNumber: 4 },
            ],
          },
          motionPromptPack: { clips: [] },
        },
      ]),
    );

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(episodeVideoAssembly.resolveClipsForAssembly).toHaveBeenCalledWith(
      rawClipSources,
      {
        allowPartial: undefined,
        storyboardShotNumbers: [1, 3, 4],
        startFrameShotNumbers: [1, 3, 4],
      },
    );
    expect(mockQueueVerticalDramaFfmpegAssemblyJob).toHaveBeenCalledWith(
      expect.objectContaining({
        renderFeed: expect.objectContaining({ clips: selectedClipSources }),
      }),
    );
  });

  it("flag OFF: never queries for a fresh manifest or writes dialogueAudioTimeline", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: false });
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: {}, dialogueAudioPlan: completedPlan }]),
    );

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.jobId).toBe("job-1");
    expect(mockDb.select).toHaveBeenCalledTimes(1); // only loadOwnedEpisode — no second manifest read
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("flag ON + no completed dialogue-audio lines yet: no manifest write (unaffected)", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: {}, dialogueAudioPlan: plan() }]),
    );

    await router.assembleEpisodeVideo({ ctx: ctx(), input: { seriesId: "10", episodeId: "20" } });

    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("flag ON + completed lines: merges dialogueAudioTimeline + loudnessNormalize into assemblyManifest, preserving existing manifest keys", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: {}, dialogueAudioPlan: completedPlan }]),
      ) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ assemblyManifest: { compiledVideo: { pendingJobId: "job-1", status: "pending" } } }]),
      ); // fresh re-read before the manifest patch

    const setSpy = vi.fn();
    const chain = updateChain([]);
    const originalSet = chain.set;
    chain.set = vi.fn((arg: unknown) => {
      setSpy(arg);
      return originalSet(arg);
    });
    mockDb.update.mockReturnValueOnce(chain);

    await router.assembleEpisodeVideo({ ctx: ctx(), input: { seriesId: "10", episodeId: "20" } });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        assemblyManifest: expect.objectContaining({
          compiledVideo: { pendingJobId: "job-1", status: "pending" }, // preserved, untouched
          loudnessNormalize: true,
          dialogueAudioTimeline: [
            expect.objectContaining({ lineId: "line-1", audioAssetId: "https://cdn.example.com/l1.mp3" }),
          ],
        }),
      }),
    );
  });
});

/* -------------------------------------------------------------------------- */
/* assembleEpisodeVideo — dialogue audio + subtitles feeding (task #21 phase B) */
/* -------------------------------------------------------------------------- */

describe("assembleEpisodeVideo — dialogue audio + subtitles feeding (task #21 phase B)", () => {
  const clipSources = [{ clipNumber: 1, videoUrl: "https://cdn.example.com/clip1.mp4" }];
  const pack = {
    clips: [{ clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 8, prompt: "p" }],
  };

  beforeEach(() => {
    vi.mocked(episodeVideoAssembly.extractClipSourcesFromMotionPromptPack).mockReturnValue(clipSources as any);
    vi.mocked(episodeVideoAssembly.resolveClipsForAssembly).mockReturnValue({
      ordered: clipSources as any,
      missing: [],
    });
    vi.mocked(episodeVideoAssembly.submitAssemblyJob).mockResolvedValue({ jobId: "job-1" } as any);
    vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mockReturnValue({
      dialogueAudioSegmentsIncluded: 0,
      subtitleLinesIncluded: 0,
    });
  });

  it("resolves includeDialogueAudio=false to the resolver when the caller does not opt in, even with the voice-chain flag on", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: pack, dialogueAudioPlan: plan() }]),
    );

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" }, // includeDialogueAudio omitted
    });

    const call = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock
      .calls[0]![0];
    expect(call.includeDialogueAudio).toBe(false);
  });

  it("resolves includeDialogueAudio=true only when BOTH the caller opts in AND the voice-chain flag is on", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: pack, dialogueAudioPlan: plan() }]),
    );

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", includeDialogueAudio: true },
    });

    const call = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock
      .calls[0]![0];
    expect(call.includeDialogueAudio).toBe(true);
  });

  it("forces includeDialogueAudio=false when the caller opts in but the voice-chain flag is OFF", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: false });
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: pack, dialogueAudioPlan: plan() }]),
    );

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", includeDialogueAudio: true },
    });

    const call = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock
      .calls[0]![0];
    expect(call.includeDialogueAudio).toBe(false);
  });

  it("passes motionClips derived from motionPromptPack.clips and includedClipNumbers from the resolved clip list", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: pack, dialogueAudioPlan: plan() }]),
    );

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    const call = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock
      .calls[0]![0];
    expect(call.motionClips).toEqual([{ clipNumber: 1, sourceShotNumbers: [1], durationSeconds: 8 }]);
    expect(call.includedClipNumbers).toEqual([1]);
  });

  it("passes subtitlePreset through untouched, including \"none\"", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: pack, dialogueAudioPlan: plan() }]),
    );

    await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20", subtitlePreset: "none" },
    });

    const call = vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mock
      .calls[0]![0];
    expect(call.subtitlePreset).toBe("none");
  });

  it("threads the resolver's dialogueAudio/subtitles into submitAssemblyJob's call args when present, and surfaces the counts in the response", async () => {
    vi.mocked(episodeVideoAssembly.resolveEpisodeDialogueAudioAndSubtitlesRunInputs).mockReturnValue({
      dialogueAudio: {
        segments: [{ audioUrl: "https://cdn.example.com/l1.mp3", startSec: 0 }],
        loudnessNormalize: true,
      },
      subtitles: { preset: "classic_box", lines: [{ startSec: 0, endSec: 2, text: "hi" }] },
      dialogueAudioSegmentsIncluded: 1,
      subtitleLinesIncluded: 1,
    });
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: pack, dialogueAudioPlan: plan() }]),
    );

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "20",
        includeDialogueAudio: true,
        subtitlePreset: "classic_box",
      },
    });

    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.dialogueAudio).toEqual({
      segments: [{ audioUrl: "https://cdn.example.com/l1.mp3", startSec: 0 }],
      loudnessNormalize: true,
    });
    expect(call.subtitles).toEqual({
      preset: "classic_box",
      lines: [{ startSec: 0, endSec: 2, text: "hi" }],
    });
    expect(result.dialogueAudioSegmentsIncluded).toBe(1);
    expect(result.subtitleLinesIncluded).toBe(1);
  });

  it("omits dialogueAudio/subtitles keys from submitAssemblyJob's call args when the resolver returns neither, and reports zero counts", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ ...EPISODE_ROW_BASE, motionPromptPack: pack, dialogueAudioPlan: plan() }]),
    );

    const result = await router.assembleEpisodeVideo({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    const call = mockQueueVerticalDramaFfmpegAssemblyJob.mock.calls[0]![0].renderFeed as any;
    expect(call.dialogueAudio).toBeUndefined();
    expect(call.subtitles).toBeUndefined();
    expect(result.dialogueAudioSegmentsIncluded).toBe(0);
    expect(result.subtitleLinesIncluded).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* getEpisodeDetail — flags.voiceChain (debt-item-1, 2026-07-08)              */
/* -------------------------------------------------------------------------- */

describe("getEpisodeDetail — flags.voiceChain (debt-item-1)", () => {
  it("is true when verticalDramaSeriesVoiceChain is on — same tenant flag assembleEpisodeVideo already gates on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: true });
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.flags.voiceChain).toBe(true);
  });

  it("is false when verticalDramaSeriesVoiceChain is off (fail-closed default)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({ verticalDramaSeriesVoiceChain: false });
    mockDb.select
      .mockReturnValueOnce(selectChain([EPISODE_ROW_BASE]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "20" },
    });

    expect(result.flags.voiceChain).toBe(false);
  });
});
