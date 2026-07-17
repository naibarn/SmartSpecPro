/**
 * Vertical Drama Storyboard Completion Plan — Wave 2 backend integration unit
 * coverage for `verticalDramaEpisodes.ts`'s new procedures:
 *  - `listShotReferences` / `linkShotReference` / `deleteShotReference` /
 *    `reorderShotReferences` (Phase 2.2 — thin tRPC wrappers over
 *    `verticalDramaShotReferencesService`)
 *  - `runEpisodeQualityReview` (Phase 3B.5 — runs the quality-review skill
 *    and persists the scorecard via the existing run/artifact ledger tables)
 *  - `getEpisodeDetail`'s new `qualityReview` field
 *
 * Also covers `generateVideoClip`'s reference-image trimming (Phase 2.6):
 * shot references beyond the resolved video model's `maxReferenceImages` are
 * trimmed by `sortOrder` (lowest kept first) and the trimmed count is always
 * reported back, never silently dropped.
 *
 * Same "mock the whole module graph, test the exported procedure handlers
 * directly" convention as `verticalDramaEpisodes.modelSelection.test.ts` —
 * the router's `mutation`/`query` mock passes the raw handler function
 * through unchanged, so each procedure can be invoked directly as
 * `router.someProcedure({ ctx, input })`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetModelsByTypeAsync,
  mockResolveVerticalDramaCapabilities,
  mockDeriveModelResolutionOptions,
} = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
  mockResolveVerticalDramaCapabilities: vi.fn(() => ({
    supportsStartFrame: true,
    maxReferenceImages: 3,
    nativeAudioDialogue: true,
    verticalDramaReady: true,
  })),
  // Default: no resolution options (undefined) — most fixtures in this file
  // don't set configJson.inputFields/supportedResolutions, so
  // `assertResolutionOption` is a no-op unless a test explicitly overrides
  // this mock (storyboard-complete plan Phase 6.2).
  mockDeriveModelResolutionOptions: vi.fn(() => undefined),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
  resolveVerticalDramaCapabilities: mockResolveVerticalDramaCapabilities,
  deriveModelResolutionOptions: mockDeriveModelResolutionOptions,
  // Feature 135 — Hermes Grok media worker (section 09, remediation row 9):
  // `resolveEpisodeVideoModel`'s new cold-start guard (mirroring
  // `resolveEpisodeImageModelId`'s pre-existing one) calls this. Default
  // "DB catalog loaded" so the resolver's normal exists/enabled validation
  // runs (matches `verticalDramaCharacters.modelSelection.test.ts`'s /
  // `verticalDramaEpisodes.modelSelection.test.ts`'s default).
  isDbModelCatalogLoaded: () => true,
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

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: {
    generateImageAsync: vi.fn(),
    generateVideoAsync: vi.fn(),
  },
  DEFAULT_MODELS: {
    image: "google-nano-banana-pro",
    video: "veo3/generate-veo-3-video-lite",
  },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 10),
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
  mediaGenerationLimiter: {
    isAllowed: vi.fn(() => true),
    getResetTime: vi.fn(() => 0),
  },
}));

// Phase 5c (`vd-start-frame-reference-mapping/plan.md`) — `getPrimaryPortraitAssetId`
// added alongside the pre-existing `getPrimaryPortraitUrl` mock (SAME
// "mock the service directly, real impl uses `.innerJoin` the local
// `selectChain` helper doesn't support" reasoning as the location-stock mock
// immediately below). Hoisted so `generateVideoClip`'s new tests can assert
// on/configure it directly.
const { mockGetPrimaryPortraitAssetId } = vi.hoisted(() => ({
  mockGetPrimaryPortraitAssetId: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: vi.fn(),
    getPrimaryPortraitAssetId: mockGetPrimaryPortraitAssetId,
  },
}));

// Location visual bible, Phases D/E (planning/polished-toasting-gadget.md) —
// mocked the SAME way as `verticalDramaCharacterStockService` immediately
// above: this service's real `getPrimaryReferenceAssetId`/`listRows`
// implementations use `.innerJoin(...)`, which this file's local
// `selectChain` mock helper does not implement (only `.leftJoin`) — mocking
// the service directly (rather than letting its real DB-backed
// implementation run against `mockDb`) avoids that gap entirely, same
// reasoning as the character-stock mock above.
const { mockGetPrimaryReferenceUrl, mockGetPrimaryReferenceAssetId, mockListLocationRows } =
  vi.hoisted(() => ({
    mockGetPrimaryReferenceUrl: vi.fn(() => Promise.resolve(undefined)),
    mockGetPrimaryReferenceAssetId: vi.fn(() => Promise.resolve(undefined)),
    mockListLocationRows: vi.fn(() => Promise.resolve([])),
  }));
vi.mock("../../services/verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: {
    getPrimaryReferenceUrl: mockGetPrimaryReferenceUrl,
    getPrimaryReferenceAssetId: mockGetPrimaryReferenceAssetId,
    listRows: mockListLocationRows,
  },
}));

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(),
}));

const { mockResolveMediaTransport } = vi.hoisted(() => ({
  mockResolveMediaTransport: vi.fn(),
}));
vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: mockResolveMediaTransport,
}));

// Feature 135 — Hermes Grok media worker (section 09): `generateVideoClip`'s
// private `resolveVdMediaTransportDecision` dynamically `import()`s these
// two hermes-namespace modules only on the `hermes_worker` branch — mocked
// here so `generateVideoClip — Hermes transport` tests below never touch
// the real DB/scheduler admission logic (owned by sections 05/09's own
// dedicated test suites).
const { mockQueueHermesMediaJob } = vi.hoisted(() => ({
  mockQueueHermesMediaJob: vi.fn(),
}));
vi.mock("../../services/hermesMediaScheduler", () => ({
  queueHermesMediaJob: mockQueueHermesMediaJob,
}));

const { mockBuildHermesMediaReferences, mockGetHermesConnection } = vi.hoisted(() => ({
  mockBuildHermesMediaReferences: vi.fn(async () => []),
  mockGetHermesConnection: vi.fn(async () => ({ capabilities: null })),
}));
vi.mock("../../services/hermesMediaReferences", () => ({
  buildHermesMediaReferences: mockBuildHermesMediaReferences,
  buildHermesMediaTaskEnvelope: (params: {
    taskId: string;
    userId: number;
    mediaType: string;
    model: string;
    prompt: string;
    extraParams?: Record<string, unknown>;
  }) => ({
    id: params.taskId,
    userId: String(params.userId),
    mediaType: params.mediaType,
    status: "pending",
    model: params.model,
    prompt: params.prompt,
    creditsUsed: 0,
    createdAt: new Date().toISOString(),
  }),
  resolveHermesReferenceAssetIdFromUrl: vi.fn(async () => null),
}));
vi.mock("../../services/hermesConnectionService", () => ({
  getHermesConnection: mockGetHermesConnection,
  listHermesConnections: vi.fn(async () => []),
}));

const { mockRepairStage, mockRunStage } = vi.hoisted(() => ({
  mockRepairStage: vi.fn(),
  // Wave-4A — additive: the dry-run singleton pipeline's `runStage` was
  // never mocked before this wave (no pre-existing test called
  // `router.runStage`/`router.regenerateStage`); needed for the "dry-run is
  // never gated" test below.
  mockRunStage: vi.fn().mockResolvedValue({}),
}));
vi.mock("../../services/verticalDramaEpisodePipeline", () => ({
  verticalDramaEpisodePipeline: {
    repairStage: mockRepairStage,
    runStage: mockRunStage,
  },
  VerticalDramaEpisodePipeline: class {
    repairStage = mockRepairStage;
    runStage = mockRunStage;
    static downstreamStages = vi.fn(() => []);
  },
  VERTICAL_DRAMA_PIPELINE_STAGES: [
    "plan_episode_script",
    "create_storyboard_review_project",
  ],
  VERTICAL_DRAMA_RUNNER_MODES: ["dry_run", "full"],
}));

vi.mock("../../services/verticalDramaProviderRouting", () => ({
  createVerticalDramaProviderRoutingPort: vi.fn(),
}));

const { mockAppendEvent, mockListEvents } = vi.hoisted(() => ({
  mockAppendEvent: vi.fn().mockResolvedValue({ memoryEventId: "evt-1" }),
  mockListEvents: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../services/verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: {
    appendEvent: mockAppendEvent,
    listEvents: mockListEvents,
  },
  memoryRowToEvent: vi.fn(),
}));

vi.mock("../../services/verticalDramaEpisodeContinuation", () => ({
  generateNextEpisodesViaLlm: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

// Wave-7D (spec §7.7.2/§8.8) — `buildProductionWizardInput` loads this via a
// runtime `import()` (never static — see that function's doc comment in
// `verticalDramaEpisodes.ts`), but `vi.mock` intercepts dynamic imports of a
// mocked path exactly like static ones (same convention already established
// by `verticalDramaEpisodes.memoryWiring.test.ts`'s identical mock for the
// SAME module/export, covering `runArcDriftCheckAndProposeIfNeeded`'s use of
// it). This file never previously imported this module.
const { mockEvaluateScriptSpeechCoverage } = vi.hoisted(() => ({
  mockEvaluateScriptSpeechCoverage: vi.fn(),
}));
vi.mock("../../services/verticalDramaScriptGeneration", () => ({
  evaluateScriptSpeechCoverage: mockEvaluateScriptSpeechCoverage,
}));

// Task #31 (spec §7.7.3, added 2026-07-09) — `deferEpisodeTieIn`'s F131Y
// path and `resolveSeasonTieInPlacementForEpisode` (`getEpisodeDetail`) both
// dynamically `import("../services/verticalDramaStoryBible")` for
// `getActiveBreakdown` (same "3 modules transitively pull in adminProcedure"
// reasoning as every other dynamic import in this file — see
// `runArcDriftCheckAndProposeIfNeeded`'s own doc comment, which ALSO
// dynamically imports this exact module for `getActiveBreakdown` +
// `deriveLegacyContentBudget`, mocked here too so that call site stays safe
// even though no pre-existing test in this file enables `verticalDramaSeriesArcReplan`).
const {
  mockGetActiveBreakdown,
  mockDeriveLegacyContentBudget,
  mockReadItemCliffhangerLine,
  mockReadItemShotDrafts,
} = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(() => [] as unknown[]),
  mockDeriveLegacyContentBudget: vi.fn(),
  // Part A1 (planning/`polished-toasting-gadget.md`) — `getEpisodeDetail`'s
  // new `resolveEpisodePlanForEpisode` also reads this export via the SAME
  // dynamic import above.
  mockReadItemCliffhangerLine: vi.fn(() => undefined),
  // `getEpisodeDetail`'s shot-plan resolution (commits 1fc2e9d, 1452f2b) reads
  // this export via the same dynamic import. The real function returns `null`
  // when a breakdown item carries no stored `shotDrafts`; mirror that no-drafts
  // default so the consumers' `readItemShotDrafts(item) !== null` and
  // `(readItemShotDrafts(item) ?? []).find(...)` paths behave realistically.
  mockReadItemShotDrafts: vi.fn(() => null),
}));
vi.mock("../../services/verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  deriveLegacyContentBudget: mockDeriveLegacyContentBudget,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
  readItemShotDrafts: mockReadItemShotDrafts,
}));

// Wave-7D (spec §8.2.2 flow-through rule) — `generateStartFrameAngleVariations`
// and `repairShotImage` now also load these 2 pure fragment-merge functions
// via the SAME runtime `import()` pattern `generateStartFrameImage` already
// established (this file never previously imported this module — it
// transitively reaches `enabledLlmModels.ts` -> `llmProviders.ts`'s
// `adminProcedure`, unsafe for this file's `../../_core/trpc` mock, same
// reasoning as every other dynamically-imported module in this router).
// Real pure logic mirrored inline (not `vi.importActual`, for that same
// reason) so tests can assert on both call args and resulting prompt text.
const {
  mockAppendPresetVisualIdentityFragmentsToImagePrompt,
  mockMergePresetVisualIdentityNegativeFragments,
} = vi.hoisted(() => ({
  mockAppendPresetVisualIdentityFragmentsToImagePrompt: vi.fn(
    (
      imagePrompt: string,
      identity?: { imagePromptFragments?: { positive?: string[] } }
    ) => {
      const positive = identity?.imagePromptFragments?.positive ?? [];
      if (positive.length === 0) return imagePrompt;
      return `${imagePrompt}, ${positive.join(", ")}`;
    }
  ),
  mockMergePresetVisualIdentityNegativeFragments: vi.fn(
    (
      negativePrompt: string | undefined,
      identity?: { imagePromptFragments?: { negative?: string[] } }
    ) => {
      const negative = identity?.imagePromptFragments?.negative ?? [];
      if (negative.length === 0) return negativePrompt;
      const fragment = negative.join(", ");
      const existing = negativePrompt?.trim();
      return existing ? `${existing}, ${fragment}` : fragment;
    }
  ),
}));
vi.mock("../../services/verticalDramaStartFrameGeneration", () => ({
  appendPresetVisualIdentityFragmentsToImagePrompt:
    mockAppendPresetVisualIdentityFragmentsToImagePrompt,
  mergePresetVisualIdentityNegativeFragments:
    mockMergePresetVisualIdentityNegativeFragments,
}));

// vertical-drama-skill-first-architecture plan, Phase 1 items 1-2 —
// `generateStartFrameAngleVariations`/`repairShotImage` now dynamically
// `import("../services/verticalDramaShotImageAction")` (same "adminProcedure
// transitive dependency" reasoning as every other dynamic import in this
// file) to author the grid/repair prompt via the
// `vertical-drama-shot-image-action` skill instead of hand-built strings.
// The mock ECHOES `shot.currentPrompt`/`repair_instruction` back into its
// returned `prompt` (and `shot.currentNegativePrompt` back into
// `negativePrompt`) so every pre-existing assertion about facts flowing
// THROUGH this call (preset-visual-identity fragments, the user's repair
// instruction, the shot's own negative prompt) keeps working unchanged —
// only the assertions that checked literal ROUTER-authored instructional
// text (grid layout wording, "no text" warning, character-identity-lock
// wording) move to this skill's own fixtures/skill.md, since the router no
// longer authors that text at all.
const { mockGenerateShotImageAction } = vi.hoisted(() => ({
  mockGenerateShotImageAction: vi.fn(
    async (params: {
      action: "multi_angle_grid" | "repair";
      shot: { currentPrompt: string; currentNegativePrompt: string };
      repairInstruction?: string | null;
    }) => ({
      prompt:
        params.action === "repair"
          ? [params.shot.currentPrompt, params.repairInstruction]
              .filter(Boolean)
              .join(" ")
          : `${params.shot.currentPrompt} [multi_angle_grid authored by skill]`,
      negativePrompt: params.shot.currentNegativePrompt || "",
      creditsUsed: 0,
      model: "mock-model",
    })
  ),
}));
vi.mock("../../services/verticalDramaShotImageAction", () => ({
  generateShotImageAction: mockGenerateShotImageAction,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

const { mockShotReferencesService, MockVerticalDramaShotReferenceError } =
  vi.hoisted(() => {
    class MockVerticalDramaShotReferenceError extends Error {
      reason: string;
      constructor(reason: string, message: string) {
        super(message);
        this.name = "VerticalDramaShotReferenceError";
        this.reason = reason;
      }
    }
    return {
      mockShotReferencesService: {
        listForEpisode: vi.fn(),
        listForShot: vi.fn(),
        linkReference: vi.fn(),
        deleteReference: vi.fn(),
        unlinkReferenceByAsset: vi.fn(),
        reorder: vi.fn(),
      },
      MockVerticalDramaShotReferenceError,
    };
  });

vi.mock("../../services/verticalDramaShotReferences", () => ({
  verticalDramaShotReferencesService: mockShotReferencesService,
  VerticalDramaShotReferenceError: MockVerticalDramaShotReferenceError,
}));

const {
  mockRunVerticalDramaEpisodeQualityReview,
  mockComputeVerticalDramaDensityMetrics,
  mockComputeRetentionMetrics,
  MockInsufficientCreditsError,
  MockVdSchemaValidationError,
  MockRateLimitExceededError,
} = vi.hoisted(() => ({
  mockRunVerticalDramaEpisodeQualityReview: vi.fn(),
  // Wave-4A (spec §16.1) — deterministic fake so tests can assert the
  // computed value flows through to `runVerticalDramaEpisodeQualityReview`'s
  // `densityMetrics` param unchanged.
  mockComputeVerticalDramaDensityMetrics: vi.fn(() => ({
    estimated_speech_seconds: 42,
    per_clip_coverage: {
      clips_evaluated: 9,
      clips_below_min_ratio: 0,
      clips_below_error_ratio: 0,
      average_coverage_ratio: 0.9,
    },
    silent_gap_count: 0,
    duplicate_line_count: 0,
    stage_direction_count: 0,
    reversal_count: 1,
    max_consecutive_same_emotion: 1,
  })),
  // Retention hooks (`planning/vertical-drama-retention-hooks/plan.md` W6,
  // router-wiring package, added 2026-07-11) — same "deterministic fake so
  // tests can assert the computed value flows through unchanged" role as
  // `mockComputeVerticalDramaDensityMetrics` above.
  mockComputeRetentionMetrics: vi.fn(() => ({
    subtitle_line_facts: { max_line_chars: 10, longest_line_excerpt: "hi" },
    retention_structure_facts: {
      open_loop_count: 1,
      retention_loop_type: "unresolved_image",
      retention_loop_present: true,
    },
    shot_change_cadence_facts: {
      max_static_streak: 0,
      windows_without_change: 0,
      declared_change_mismatch_count: 0,
    },
    retention_loop_rotation_facts: { repeated_streak: 0 },
  })),
  MockInsufficientCreditsError: class extends Error {},
  MockVdSchemaValidationError: class extends Error {},
  MockRateLimitExceededError: class extends Error {},
}));

vi.mock("../../services/verticalDramaEpisodeQualityReview", () => ({
  runVerticalDramaEpisodeQualityReview:
    mockRunVerticalDramaEpisodeQualityReview,
  computeVerticalDramaDensityMetrics: mockComputeVerticalDramaDensityMetrics,
  computeRetentionMetrics: mockComputeRetentionMetrics,
  InsufficientCreditsError: MockInsufficientCreditsError,
  VdSchemaValidationError: MockVdSchemaValidationError,
  RateLimitExceededError: MockRateLimitExceededError,
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

// `verticalDramaEpisodes.ts` imports `ensurePromptWithinLimit` from
// `verticalDramaPromptQc.ts`, which itself imports `verticalDramaStoryBible.ts`
// -> `enabledLlmModels.ts` -> `llmProviders.ts` (which needs `adminProcedure`,
// not exported by this file's `../../_core/trpc` mock above). Mock the QC
// module directly (pass-through: returns the prompt unchanged) so that
// unrelated import chain never loads.
vi.mock("../../services/verticalDramaPromptQc", () => ({
  ensurePromptWithinLimit: vi.fn(async ({ prompt }: { prompt: string }) => ({
    prompt,
    refined: false,
    creditsUsed: 0,
    truncated: false,
  })),
}));

import { verticalDramaEpisodesRouter } from "../verticalDramaEpisodes";
import { mediaGenerationService } from "../../services/mediaGenerationService";
import {
  hasEnoughCredits,
  deductCredits,
  refundCredits,
} from "../../services/creditService";
import { calculateCreditCost } from "../../services/pricingCalculator";
import { formatVideoClipRequest } from "../../services/verticalDramaVideoPromptFormatter";
import { getTenantFeatureFlags } from "../../services/tenantFeatureFlagService";
import { VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT } from "../../services/verticalDramaQualityReviewApply";

const router = verticalDramaEpisodesRouter as unknown as Record<
  string,
  Function
>;
const mockGetTenantFeatureFlags = vi.mocked(getTenantFeatureFlags);
const mockGenerateVideoAsync = vi.mocked(
  mediaGenerationService.generateVideoAsync
);
const mockHasEnoughCredits = vi.mocked(hasEnoughCredits);
const mockDeductCredits = vi.mocked(deductCredits);
const mockRefundCredits = vi.mocked(refundCredits);
const mockCalculateCreditCost = vi.mocked(calculateCreditCost);
const mockFormatVideoClipRequest = vi.mocked(formatVideoClipRequest);

function ctx(
  overrides: Partial<{ tenantId: string; user: { id: number } }> = {}
) {
  return {
    tenantId: "tenant-1",
    user: { id: 42 },
    userToken: null,
    publicUrl: undefined,
    ...overrides,
  };
}

/** Build a thenable select-chain stub so `await db.select()....where(...)` resolves to `rows`. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function insertChain(returned: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

function updateChain(returned: unknown[]) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => Promise.resolve(returned)),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  // `vi.clearAllMocks()` clears call history but NOT a previously configured
  // `mockResolvedValue` default (only `mockReset()` does that) — without
  // this, a test elsewhere in the file that sets
  // `mockGetTenantFeatureFlags.mockResolvedValue({...someFlagsOn})` would
  // leak that default into every LATER test in this file that never
  // explicitly sets its own flags (Wave-4A discovery). Explicitly resetting
  // to "everything off" here makes every test's implicit reliance on the
  // flags-off default robust to file ordering.
  mockGetTenantFeatureFlags.mockResolvedValue({} as any);
});

describe("listShotReferences", () => {
  it("returns the manifest from the shot references service", async () => {
    const manifest = { 1: [{ referenceId: "7" }] };
    mockShotReferencesService.listForEpisode.mockResolvedValue(manifest);

    const result = await router.listShotReferences({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result).toEqual({ references: manifest });
    expect(mockShotReferencesService.listForEpisode).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      100
    );
  });

  it("maps episode_not_found to NOT_FOUND", async () => {
    mockShotReferencesService.listForEpisode.mockRejectedValue(
      new MockVerticalDramaShotReferenceError(
        "episode_not_found",
        "Episode not found"
      )
    );

    await expect(
      router.listShotReferences({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "999" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a non-integer episodeId with BAD_REQUEST (parseId integer guard, T4)", async () => {
    await expect(
      router.listShotReferences({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100.5" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockShotReferencesService.listForEpisode).not.toHaveBeenCalled();
  });

  it("rejects a non-integer seriesId with BAD_REQUEST (parseId integer guard, T4)", async () => {
    await expect(
      router.listShotReferences({
        ctx: ctx(),
        input: { seriesId: "10.9", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockShotReferencesService.listForEpisode).not.toHaveBeenCalled();
  });
});

describe("linkShotReference", () => {
  it("parses string ids and forwards to the service", async () => {
    const reference = { referenceId: "7", shotNumber: 3 };
    mockShotReferencesService.linkReference.mockResolvedValue(reference);

    const result = await router.linkShotReference({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 3,
        mediaAssetId: "500",
        source: "grid_cut",
      },
    });

    expect(result).toEqual({ reference });
    expect(mockShotReferencesService.linkReference).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeId: 100,
      shotNumber: 3,
      mediaAssetId: 500,
      role: undefined,
      source: "grid_cut",
      sortOrder: undefined,
    });
  });

  it("accepts source 'reference_frame' (Phase 6a — user-controlled supplementary reference frames, planning/vd-start-frame-reference-mapping/plan.md Phase 6)", async () => {
    const reference = { referenceId: "9", shotNumber: 3, source: "reference_frame" };
    mockShotReferencesService.linkReference.mockResolvedValue(reference);

    const result = await router.linkShotReference({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 3,
        mediaAssetId: "500",
        source: "reference_frame",
      },
    });

    expect(result).toEqual({ reference });
    expect(mockShotReferencesService.linkReference).toHaveBeenCalledWith(
      expect.objectContaining({ source: "reference_frame" })
    );
  });

  it("maps media_asset_cross_tenant to NOT_FOUND (never discloses cross-tenant existence)", async () => {
    mockShotReferencesService.linkReference.mockRejectedValue(
      new MockVerticalDramaShotReferenceError(
        "media_asset_cross_tenant",
        "cross tenant"
      )
    );

    await expect(
      router.linkShotReference({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          mediaAssetId: "500",
          source: "upload",
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps media_asset_deleted to BAD_REQUEST", async () => {
    mockShotReferencesService.linkReference.mockRejectedValue(
      new MockVerticalDramaShotReferenceError("media_asset_deleted", "deleted")
    );

    await expect(
      router.linkShotReference({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          mediaAssetId: "500",
          source: "upload",
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("deleteShotReference", () => {
  it("deletes via the service and returns { deleted: true }", async () => {
    mockShotReferencesService.deleteReference.mockResolvedValue(undefined);

    const result = await router.deleteShotReference({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", referenceId: "7" },
    });

    expect(result).toEqual({ deleted: true });
    expect(mockShotReferencesService.deleteReference).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      7
    );
  });

  it("maps reference_not_found to NOT_FOUND", async () => {
    mockShotReferencesService.deleteReference.mockRejectedValue(
      new MockVerticalDramaShotReferenceError(
        "reference_not_found",
        "not found"
      )
    );

    await expect(
      router.deleteShotReference({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", referenceId: "999" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setApprovedStartFrameAsset — main-image-swap-history (demotion + promotion-dedup)", () => {
  function episodeRowWithFrame(approvedMediaAssetId: string | undefined) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            requiredCharacterRefs: [],
            approvedMediaAssetId,
          },
        ],
      },
      motionPromptPack: null,
    };
  }

  beforeEach(() => {
    mockShotReferencesService.linkReference.mockResolvedValue({
      referenceId: "1",
    });
    mockShotReferencesService.unlinkReferenceByAsset.mockResolvedValue(false);
  });

  it("demotes the previous main image into the reference strip and removes the new asset from the strip", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithFrame("900")])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 901 }])) // mediaAssets ownership lookup for the new asset
      .mockReturnValueOnce(selectChain([])); // resolveEpisodePlanAssetUrls
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.setApprovedStartFrameAsset({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: "901",
      },
    });

    expect(result.startFramePlan.frames[0].approvedMediaAssetId).toBe("901");

    // 1. Old main image (900) gets linked into the reference strip as
    //    "previous_main".
    expect(mockShotReferencesService.linkReference).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeId: 100,
      shotNumber: 1,
      mediaAssetId: 900,
      role: "reference",
      source: "previous_main",
    });

    // 2. New main image (901) is removed from the reference strip, if present.
    expect(
      mockShotReferencesService.unlinkReferenceByAsset
    ).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      100,
      1,
      901
    );
  });

  it("does not demote or promote-dedup when there was no previous main image", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithFrame(undefined)])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 901 }])) // mediaAssets ownership lookup
      .mockReturnValueOnce(selectChain([])); // resolveEpisodePlanAssetUrls
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    await router.setApprovedStartFrameAsset({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: "901",
      },
    });

    expect(mockShotReferencesService.linkReference).not.toHaveBeenCalled();
    // Still de-dupes the strip for the new asset even with no previous main.
    expect(
      mockShotReferencesService.unlinkReferenceByAsset
    ).toHaveBeenCalledWith(
      { tenantId: "tenant-1", userId: 42, seriesId: 10 },
      100,
      1,
      901
    );
  });

  it("is a no-op for demotion/promotion when the new asset is the same as the current main image", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithFrame("900")])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 900 }])) // mediaAssets ownership lookup (same asset)
      .mockReturnValueOnce(selectChain([])); // resolveEpisodePlanAssetUrls
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    await router.setApprovedStartFrameAsset({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: "900",
      },
    });

    expect(mockShotReferencesService.linkReference).not.toHaveBeenCalled();
    expect(
      mockShotReferencesService.unlinkReferenceByAsset
    ).not.toHaveBeenCalled();
  });

  it("still completes the swap even if demoting the previous asset throws a shot-reference error (best-effort)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithFrame("900")])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 901 }])) // mediaAssets ownership lookup
      .mockReturnValueOnce(selectChain([])); // resolveEpisodePlanAssetUrls
    mockDb.update.mockReturnValueOnce(updateChain([{}]));
    mockShotReferencesService.linkReference.mockRejectedValue(
      new MockVerticalDramaShotReferenceError("media_asset_deleted", "deleted")
    );

    const result = await router.setApprovedStartFrameAsset({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: "901",
      },
    });

    expect(result.startFramePlan.frames[0].approvedMediaAssetId).toBe("901");
  });
});

// planning/vd-start-frame-reference-mapping/plan.md, Phase 5d.
describe("recordShotAngleGridAsset — persisted alternate-angle backup stills (Phase 5d)", () => {
  function episodeRowWithAngleGridFrame(
    angleGridAssetIds: number[] | undefined
  ) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            requiredCharacterRefs: [],
            angleGridAssetIds,
          },
        ],
      },
      motionPromptPack: null,
    };
  }

  it("appends a new asset id onto an empty/absent angleGridAssetIds list", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithAngleGridFrame(undefined)])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 901 }])) // mediaAssets ownership lookup
      .mockReturnValueOnce(
        selectChain([{ id: 901, originalUrl: "https://cdn/901.png" }])
      ); // resolveMediaAssetUrlsByIds
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.recordShotAngleGridAsset({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: "901",
      },
    });

    expect(result.angleGridAssetIds).toEqual([901]);
    expect(result.angleGridAssets).toEqual([
      { mediaAssetId: 901, url: "https://cdn/901.png" },
    ]);
    expect(result.startFramePlan.frames[0].angleGridAssetIds).toEqual([901]);
  });

  it("appends onto an existing list, preserving order", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithAngleGridFrame([100, 200])])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 300 }])) // mediaAssets ownership lookup
      .mockReturnValueOnce(
        selectChain([
          { id: 100, originalUrl: "https://cdn/100.png" },
          { id: 200, originalUrl: "https://cdn/200.png" },
          { id: 300, originalUrl: "https://cdn/300.png" },
        ])
      ); // resolveMediaAssetUrlsByIds
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.recordShotAngleGridAsset({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: "300",
      },
    });

    expect(result.angleGridAssetIds).toEqual([100, 200, 300]);
  });

  it("dedupes — re-recording an already-present asset id promotes it to most-recent instead of duplicating", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithAngleGridFrame([100, 200, 300])])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 100 }])) // mediaAssets ownership lookup — re-recording id 100
      .mockReturnValueOnce(
        selectChain([
          { id: 200, originalUrl: "https://cdn/200.png" },
          { id: 300, originalUrl: "https://cdn/300.png" },
          { id: 100, originalUrl: "https://cdn/100.png" },
        ])
      ); // resolveMediaAssetUrlsByIds
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.recordShotAngleGridAsset({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: "100",
      },
    });

    expect(result.angleGridAssetIds).toEqual([200, 300, 100]);
  });

  it("caps at the 5 most recent entries, dropping the oldest", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithAngleGridFrame([1, 2, 3, 4, 5])])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 6 }])) // mediaAssets ownership lookup
      .mockReturnValueOnce(
        selectChain([
          { id: 2, originalUrl: "https://cdn/2.png" },
          { id: 3, originalUrl: "https://cdn/3.png" },
          { id: 4, originalUrl: "https://cdn/4.png" },
          { id: 5, originalUrl: "https://cdn/5.png" },
          { id: 6, originalUrl: "https://cdn/6.png" },
        ])
      ); // resolveMediaAssetUrlsByIds
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.recordShotAngleGridAsset({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mediaAssetId: "6",
      },
    });

    // id 1 (oldest) is dropped; exactly 5 remain, newest ("6") last.
    expect(result.angleGridAssetIds).toEqual([2, 3, 4, 5, 6]);
  });

  it("throws NOT_FOUND when the media asset does not belong to the caller's tenant/user", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithAngleGridFrame([])])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])); // mediaAssets ownership lookup — no row

    await expect(
      router.recordShotAngleGridAsset({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          mediaAssetId: "999",
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when the episode has no start-frame plan yet", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            startFramePlan: null,
            motionPromptPack: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 901 }])); // mediaAssets ownership lookup

    await expect(
      router.recordShotAngleGridAsset({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          mediaAssetId: "901",
        },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws NOT_FOUND when no start-frame plan entry exists for the requested shot", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithAngleGridFrame([])])) // loadOwnedEpisode — only shot 1 exists
      .mockReturnValueOnce(selectChain([{ id: 901 }])); // mediaAssets ownership lookup

    await expect(
      router.recordShotAngleGridAsset({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 99,
          mediaAssetId: "901",
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("setShotCharacterReference — manual per-shot character/variant override (planning/vertical-drama-twin-variant-completeness W6 backend)", () => {
  function episodeRowWithTwoShots() {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "shot one prompt",
            requiredCharacterRefs: ["hero"],
          },
          {
            shotNumber: 2,
            imagePrompt: "shot two prompt",
            requiredCharacterRefs: ["villain"],
          },
        ],
      },
      motionPromptPack: null,
    };
  }

  it("patches only the target shot's requiredCharacterRefs and leaves every other shot untouched", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithTwoShots()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ characterKey: "hero-formal" }])); // roster validation
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.setShotCharacterReference({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        characterRefs: ["hero-formal"],
      },
    });

    expect(result.startFramePlan.frames[0]).toMatchObject({
      shotNumber: 1,
      requiredCharacterRefs: ["hero-formal"],
    });
    // Shot 2 is byte-identical to before — this mutation never touches any
    // shot other than the one targeted by `shotNumber`.
    expect(result.startFramePlan.frames[1]).toMatchObject({
      shotNumber: 2,
      requiredCharacterRefs: ["villain"],
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("allows clearing a shot's character refs to an empty array", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRowWithTwoShots()])); // loadOwnedEpisode
    // No roster validation query when `characterRefs` is empty.
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.setShotCharacterReference({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        characterRefs: [],
      },
    });

    expect(result.startFramePlan.frames[0].requiredCharacterRefs).toEqual([]);
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown/nonexistent characterKey with BAD_REQUEST and does not write anything", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithTwoShots()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ characterKey: "hero-formal" }])); // roster validation — "ghost-key" missing

    await expect(
      router.setShotCharacterReference({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          characterRefs: ["hero-formal", "ghost-key"],
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects a caller who does not own the series/episode with NOT_FOUND", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedEpisode -> no row

    await expect(
      router.setShotCharacterReference({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "999",
          shotNumber: 1,
          characterRefs: ["hero-formal"],
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  // 2026-07-15: the per-shot character-ref override must be settable BEFORE the
  // start-frame plan/prompt exists (e.g. to add a freshly-created manual
  // character to a shot). It used to throw NOT_FOUND / PRECONDITION_FAILED;
  // now it creates a minimal frame/plan.
  it("creates a new frame for a shot with no existing plan entry (append + keep sorted), instead of throwing", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithTwoShots()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ characterKey: "hero-formal" }])); // roster validation
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.setShotCharacterReference({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 99,
        characterRefs: ["hero-formal"],
      },
    });

    expect(
      result.startFramePlan.frames.find((f: { shotNumber: number }) => f.shotNumber === 99)
    ).toMatchObject({
      shotNumber: 99,
      imagePrompt: "",
      requiredCharacterRefs: ["hero-formal"],
    });
    expect(
      result.startFramePlan.frames.map((f: { shotNumber: number }) => f.shotNumber)
    ).toEqual([1, 2, 99]); // existing shots untouched, frames sorted ascending
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("creates a minimal plan + frame when the episode has NO start-frame plan yet (the reported bug)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ ...episodeRowWithTwoShots(), startFramePlan: null }])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ characterKey: "mintra" }])); // roster validation
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.setShotCharacterReference({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        characterRefs: ["mintra"],
      },
    });

    expect(result.startFramePlan.mode).toBe("single_frame_per_shot");
    expect(result.startFramePlan.frames).toEqual([
      expect.objectContaining({
        shotNumber: 1,
        imagePrompt: "",
        requiredCharacterRefs: ["mintra"],
      }),
    ]);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

describe("setShotLocation — manual per-shot location override (Phase D, planning/polished-toasting-gadget.md)", () => {
  function episodeRowWithTwoShots() {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "shot one prompt",
            requiredCharacterRefs: [],
          },
          {
            shotNumber: 2,
            imagePrompt: "shot two prompt",
            requiredCharacterRefs: [],
            locationKey: "loc_kitchen",
          },
        ],
      },
      motionPromptPack: null,
    };
  }

  it("patches only the target shot's locationKey and leaves every other shot untouched", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithTwoShots()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ id: 55 }])); // roster validation
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.setShotLocation({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        locationKey: "loc_store",
      },
    });

    expect(result.startFramePlan.frames[0]).toMatchObject({
      shotNumber: 1,
      locationKey: "loc_store",
    });
    // Shot 2 is byte-identical to before — this mutation never touches any
    // shot other than the one targeted by `shotNumber`.
    expect(result.startFramePlan.frames[1]).toMatchObject({
      shotNumber: 2,
      locationKey: "loc_kitchen",
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("allows clearing a shot's location override with locationKey: null (skips roster validation entirely)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRowWithTwoShots()])); // loadOwnedEpisode
    // No roster validation query when `locationKey` is null.
    mockDb.update.mockReturnValueOnce(updateChain([{}]));

    const result = await router.setShotLocation({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 2,
        locationKey: null,
      },
    });

    expect(result.startFramePlan.frames[1].locationKey).toBeUndefined();
    expect(mockDb.select).toHaveBeenCalledTimes(1);
  });

  it("rejects an unknown/nonexistent locationKey with BAD_REQUEST and does not write anything", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithTwoShots()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])); // roster validation — no matching row

    await expect(
      router.setShotLocation({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          locationKey: "loc_ghost",
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects a caller who does not own the series/episode with NOT_FOUND (cross-tenant — loadOwnedEpisode's tenant-scoped query finds no row)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([])); // loadOwnedEpisode -> no row for this tenant

    await expect(
      router.setShotLocation({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "999",
          shotNumber: 1,
          locationKey: "loc_store",
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown shotNumber with NOT_FOUND", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episodeRowWithTwoShots()])); // loadOwnedEpisode

    await expect(
      router.setShotLocation({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 99,
          locationKey: null,
        },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("rejects when no start-frame plan exists yet with PRECONDITION_FAILED", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 100,
          tenantId: "tenant-1",
          userId: 42,
          seriesId: 10,
          startFramePlan: null,
        },
      ])
    ); // loadOwnedEpisode

    await expect(
      router.setShotLocation({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          locationKey: "loc_store",
        },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

describe("reorderShotReferences", () => {
  it("parses ordered reference ids and forwards to the service", async () => {
    const references = [{ referenceId: "2" }, { referenceId: "1" }];
    mockShotReferencesService.reorder.mockResolvedValue(references);

    const result = await router.reorderShotReferences({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 3,
        orderedReferenceIds: ["2", "1"],
      },
    });

    expect(result).toEqual({ references });
    expect(mockShotReferencesService.reorder).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeId: 100,
      shotNumber: 3,
      orderedReferenceIds: [2, 1],
    });
  });
});

describe("runEpisodeQualityReview", () => {
  function episodeRow(over: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeNumber: 1,
      title: "Episode 1",
      script: { episode_title: "Episode 1" },
      storyboard: { shots: [] },
      dialogueAudioPlan: null,
      ...over,
    };
  }

  it("throws PRECONDITION_FAILED when the episode has no script/storyboard yet", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([episodeRow({ script: null })])
    );

    await expect(
      router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockRunVerticalDramaEpisodeQualityReview).not.toHaveBeenCalled();
  });

  it("runs the review, persists it via the run/artifact ledger tables, and returns the scorecard", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
      review: {
        episode_title: "Episode 1",
        scorecard: {},
        summary: "ok",
        issues: [],
        warnings: [],
        repair_queue: [],
      },
      creditsUsed: 3,
      model: "gpt-x",
    });
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 555 }])) // verticalDramaEpisodeRuns
      .mockReturnValueOnce(insertChain([{ id: 777 }])); // verticalDramaRunArtifacts
    mockDb.update.mockReturnValueOnce(updateChain([]));

    const result = await router.runEpisodeQualityReview({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.creditsUsed).toBe(3);
    expect(result.review.summary).toBe("ok");
    expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        tenantId: "tenant-1",
        seriesId: 10,
        episodeId: 100,
      })
    );
    expect(mockDb.insert).toHaveBeenCalledTimes(2);
  });

  it("maps InsufficientCreditsError to FORBIDDEN", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockRunVerticalDramaEpisodeQualityReview.mockRejectedValue(
      new MockInsufficientCreditsError("not enough credits")
    );

    await expect(
      router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps RateLimitExceededError to TOO_MANY_REQUESTS", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockRunVerticalDramaEpisodeQualityReview.mockRejectedValue(
      new MockRateLimitExceededError("slow down")
    );

    await expect(
      router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("forwards idempotencyKey through to runVerticalDramaEpisodeQualityReview (T2)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
      review: {
        episode_title: "Episode 1",
        scorecard: {},
        summary: "ok",
        issues: [],
        warnings: [],
        repair_queue: [],
      },
      creditsUsed: 3,
      model: "gpt-x",
    });
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 555 }]))
      .mockReturnValueOnce(insertChain([{ id: 777 }]));
    mockDb.update.mockReturnValueOnce(updateChain([]));

    await router.runEpisodeQualityReview({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", idempotencyKey: "qr-key-1" },
    });

    expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "qr-key-1" })
    );
  });

  it("throws BAD_REQUEST when the combined script/storyboard/dialoguePlan payload is too large (T5)", async () => {
    // A single ~450k character string field pushes the combined
    // JSON.stringify length over the 400_000 char guard.
    const huge = "x".repeat(450_000);
    mockDb.select.mockReturnValueOnce(
      selectChain([
        episodeRow({ script: { episode_title: "Episode 1", huge } }),
      ])
    );

    await expect(
      router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockRunVerticalDramaEpisodeQualityReview).not.toHaveBeenCalled();
  });

  describe("avoidPrevious", () => {
    it("loads the previous stored review and forwards its issues + avoidPrevious: true", async () => {
      const previousReview = {
        episode_title: "Episode 1",
        scorecard: {},
        summary: "ok",
        issues: [
          { location: "shot 1", problem: "flat", suggested_fix: "vary it" },
        ],
        warnings: [],
        repair_queue: [],
      };
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ jsonPayload: previousReview }])) // loadLatestQualityReview
        .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: {},
          summary: "ok",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", avoidPrevious: true },
      });

      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          avoidPrevious: true,
          previousIssues: previousReview.issues,
        })
      );
    });

    it("degrades to a normal (non-avoid) review when no previous review exists yet", async () => {
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview -> none yet
        .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: {},
          summary: "ok",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", avoidPrevious: true },
      });

      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          avoidPrevious: false,
          previousIssues: undefined,
        })
      );
    });
  });

  describe("Wave-4A — hybrid density metrics + tie-in passthrough (spec §16.1/§13.1)", () => {
    beforeEach(() => {
      mockComputeVerticalDramaDensityMetrics.mockClear();
    });

    it("flags off: densityMetrics/tieInConfig stay undefined (byte-identical v1 call shape)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { locale: "th", productTieIn: null, qualityPolicy: null },
          ])
        ); // series row
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: {},
          summary: "ok",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockComputeVerticalDramaDensityMetrics).not.toHaveBeenCalled();
      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          densityMetrics: undefined,
          tieInConfig: undefined,
        })
      );
      // Exactly the v1 shape: 2 inserts (run + artifact) for the review only.
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it("verticalDramaSeriesSpeechBudget on: computes densityMetrics and passes it through", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesSpeechBudget: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { locale: "th", productTieIn: null, qualityPolicy: null },
          ])
        ); // series row
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: {},
          summary: "ok",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockComputeVerticalDramaDensityMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          script: expect.anything(),
          storyboard: expect.anything(),
        })
      );
      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          densityMetrics: expect.objectContaining({
            estimated_speech_seconds: 42,
          }),
          tieInConfig: undefined,
        })
      );
    });

    it("verticalDramaSeriesQualityLoopV2 alone (no speechBudget) also computes densityMetrics", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesQualityLoopV2: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()]))
        .mockReturnValueOnce(
          selectChain([
            { locale: "th", productTieIn: null, qualityPolicy: null },
          ])
        );
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: {},
          summary: "ok",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockComputeVerticalDramaDensityMetrics).toHaveBeenCalled();
    });

    it("tieInQc chain fully on + series tie-in enabled: passes tieInConfig and builds + persists the tie-in report", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesSpeechBudget: true,
        verticalDramaSeriesQualityLoopV2: true,
        verticalDramaSeriesTieInQc: true,
      } as any);
      const seriesTieIn = {
        enabled: true,
        productName: "GlowCream",
        referenceAssetIds: [],
        disclosurePolicy: "not_required",
        allowedStoryFunctions: ["daily_use"],
        forbiddenClaims: [],
        maxEpisodesWithTieInPerTenEpisodes: 3,
        requireHumanApproval: true,
      };
      const scriptWithTieIn = {
        episode_title: "Episode 1",
        product_tie_in_plan: {
          tie_ins: [{ shot_numbers: [3], story_function: "daily_use" }],
        },
      };
      mockDb.select
        .mockReturnValueOnce(
          selectChain([episodeRow({ script: scriptWithTieIn })])
        ) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { locale: "th", productTieIn: seriesTieIn, qualityPolicy: null },
          ])
        ) // series row (locale+productTieIn+qualityPolicy)
        .mockReturnValueOnce(selectChain([{ productTieIn: seriesTieIn }])) // maybeBuildAndPersistTieInQualityReport's own productTieIn select
        .mockReturnValueOnce(
          selectChain([{ episodeNumber: 1, script: scriptWithTieIn }])
        ); // loadSeriesTieInPlacementHistory
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: { overall: 5, tie_in_naturalness: 5 },
          summary: "ok",
          tie_in_assessment: "feels earned",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }])) // review run
        .mockReturnValueOnce(insertChain([{ id: 777 }])) // review artifact
        .mockReturnValueOnce(insertChain([{ id: 888 }])) // tie-in report run
        .mockReturnValueOnce(insertChain([{ id: 999 }])); // tie-in report artifact
      mockDb.update
        .mockReturnValueOnce(updateChain([])) // review run artifactIds update
        .mockReturnValueOnce(updateChain([])); // tie-in report run artifactIds update

      const result = await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          tieInConfig: expect.objectContaining({
            enabled: true,
            productName: "GlowCream",
          }),
        })
      );
      expect(result.tieInQualityReport).toEqual(
        expect.objectContaining({
          naturalnessScore: 100,
          passed: true,
          visualShotCount: 1,
        })
      );
      expect(mockDb.insert).toHaveBeenCalledTimes(4);
    });

    it("tieInQc requires BOTH speechBudget AND qualityLoopV2 (spec §17) — off when only tieInQc itself is set", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesTieInQc: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()]))
        .mockReturnValueOnce(
          selectChain([
            {
              locale: "th",
              productTieIn: { enabled: true },
              qualityPolicy: null,
            },
          ])
        );
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: {},
          summary: "ok",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({ tieInConfig: undefined })
      );
      // No tie-in report side effects — only the 2 review inserts.
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe("Retention hooks (planning/vertical-drama-retention-hooks/plan.md W6, router-wiring package)", () => {
    beforeEach(() => {
      mockComputeRetentionMetrics.mockClear();
    });

    it("flags off: scoreRetentionDimensions/retentionMetrics stay undefined/false, computeRetentionMetrics never called, no extra prior-episodes query", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { locale: "th", productTieIn: null, qualityPolicy: null },
          ])
        ); // series row
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: {},
          summary: "ok",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockComputeRetentionMetrics).not.toHaveBeenCalled();
      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreRetentionDimensions: false,
          retentionMetrics: undefined,
        })
      );
      // Exactly the v1 shape: 2 selects (loadOwnedEpisode + series row), no
      // extra "recent episodes" query.
      expect(mockDb.select).toHaveBeenCalledTimes(2);
    });

    it("verticalDramaRetentionHooks on: computes retentionMetrics (fed by the last 3 prior episodes' retention_loop.type) and passes scoreRetentionDimensions: true", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaRetentionHooks: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { locale: "th", productTieIn: null, qualityPolicy: null },
          ])
        ) // series row
        .mockReturnValueOnce(
          selectChain([
            { script: { retention_loop: { type: "clue" } } },
            { script: { retention_loop: { type: "threat" } } },
          ])
        ); // loadRecentVerticalDramaRetentionLoopTypes
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: {
          episode_title: "Episode 1",
          scorecard: {},
          summary: "ok",
          issues: [],
          warnings: [],
          repair_queue: [],
        },
        creditsUsed: 3,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.runEpisodeQualityReview({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockComputeRetentionMetrics).toHaveBeenCalledWith(
        expect.objectContaining({
          script: expect.anything(),
          storyboard: expect.anything(),
          recentRetentionLoopTypes: ["clue", "threat"],
        })
      );
      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreRetentionDimensions: true,
          retentionMetrics: expect.objectContaining({
            retention_structure_facts: expect.objectContaining({
              open_loop_count: 1,
            }),
          }),
        })
      );
    });
  });
});

describe("applyQualityReviewSuggestions", () => {
  function episodeRow(over: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeNumber: 1,
      title: "Episode 1",
      script: { episode_title: "Episode 1" },
      storyboard: { shots: [] },
      dialogueAudioPlan: null,
      ...over,
    };
  }

  const STORED_REVIEW = {
    episode_title: "Episode 1",
    scorecard: { overall: 3 },
    summary: "needs work",
    issues: [
      {
        location: "shot 1",
        problem: "flat emotion",
        suggested_fix: "vary expression",
      },
      {
        location: "beat 2",
        problem: "weak reversal",
        suggested_fix: "sharpen the flip",
      },
    ],
    warnings: [],
    repair_queue: [],
  };

  beforeEach(() => {
    mockRepairStage.mockReset();
  });

  it("throws PRECONDITION_FAILED when there is no stored quality review yet", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview -> none

    await expect(
      router.applyQualityReviewSuggestions({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(mockRepairStage).not.toHaveBeenCalled();
  });

  it("groups issues by stage, repairs script before storyboard with one combined instruction each, re-reviews, and returns the fresh scorecard", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ jsonPayload: STORED_REVIEW }])) // loadLatestQualityReview
      .mockReturnValueOnce(selectChain([episodeRow()])) // refreshedRow (loadOwnedEpisode again)
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup for re-review
    mockRepairStage
      .mockResolvedValueOnce({
        runId: 1,
        result: {} as any,
        staleStages: ["storyboard_shotgrid", "start_frame_render_plan"],
      })
      .mockResolvedValueOnce({
        runId: 2,
        result: {} as any,
        staleStages: ["start_frame_render_plan"],
      });
    const freshReview = {
      episode_title: "Episode 1",
      scorecard: { overall: 4 },
      summary: "better",
      issues: [],
      warnings: [],
      repair_queue: [],
    };
    mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
      review: freshReview,
      creditsUsed: 3,
      model: "gpt-x",
    });
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 555 }]))
      .mockReturnValueOnce(insertChain([{ id: 777 }]));
    mockDb.update.mockReturnValueOnce(updateChain([]));

    const result = await router.applyQualityReviewSuggestions({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    // Script repaired first, then storyboard.
    expect(mockRepairStage).toHaveBeenCalledTimes(2);
    expect(mockRepairStage.mock.calls[0][1]).toBe("plan_episode_script");
    expect(mockRepairStage.mock.calls[0][2].instruction).toContain("beat 2");
    expect(mockRepairStage.mock.calls[1][1]).toBe("storyboard_shotgrid");
    expect(mockRepairStage.mock.calls[1][2].instruction).toContain("shot 1");

    expect(result.stagesRepaired).toEqual([
      "plan_episode_script",
      "storyboard_shotgrid",
    ]);
    expect(result.staleStages).toEqual(
      expect.arrayContaining(["storyboard_shotgrid", "start_frame_render_plan"])
    );
    expect(result.newReview).toEqual(freshReview);
    expect(result.warning).toBeNull();
  });

  it("returns success with a warning when the auto re-review fails after repairs succeed", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ jsonPayload: STORED_REVIEW }])) // loadLatestQualityReview
      .mockReturnValueOnce(selectChain([episodeRow()])) // refreshedRow
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockRepairStage.mockResolvedValue({
      runId: 1,
      result: {} as any,
      staleStages: [],
    });
    mockRunVerticalDramaEpisodeQualityReview.mockRejectedValue(
      new Error("llm down")
    );

    const result = await router.applyQualityReviewSuggestions({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.stagesRepaired).toEqual([
      "plan_episode_script",
      "storyboard_shotgrid",
    ]);
    expect(result.newReview).toBeNull();
    expect(result.warning).toContain("llm down");
  });

  it("passes idempotencyKey through with a -rereview suffix for the auto re-review", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ jsonPayload: STORED_REVIEW }])) // loadLatestQualityReview
      .mockReturnValueOnce(selectChain([episodeRow()])) // refreshedRow
      .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
    mockRepairStage.mockResolvedValue({
      runId: 1,
      result: {} as any,
      staleStages: [],
    });
    mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
      review: STORED_REVIEW,
      creditsUsed: 1,
      model: "gpt-x",
    });
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 555 }]))
      .mockReturnValueOnce(insertChain([{ id: 777 }]));
    mockDb.update.mockReturnValueOnce(updateChain([]));

    await router.applyQualityReviewSuggestions({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        idempotencyKey: "apply-key-1",
      },
    });

    expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "apply-key-1-rereview" })
    );
  });

  describe("Wave-4A — loop mode (spec §16.1)", () => {
    const BELOW_FLOOR_REVIEW = {
      episode_title: "Episode 1",
      scorecard: { overall: 2 },
      summary: "needs work",
      issues: [],
      warnings: [],
      repair_queue: [],
    };

    it("falls through to the exact v1 single-pass behavior when loop:true but the flag is off", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ jsonPayload: STORED_REVIEW }])) // loadLatestQualityReview
        .mockReturnValueOnce(selectChain([episodeRow()])) // refreshedRow (v1 re-review path)
        .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
      mockRepairStage.mockResolvedValue({
        runId: 1,
        result: {} as any,
        staleStages: [],
      });
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: STORED_REVIEW,
        creditsUsed: 1,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      const result = await router.applyQualityReviewSuggestions({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", loop: true },
      });

      // v1 shape: `stagesRepaired`/`staleStages`/`warning` present, no `loopState`.
      expect(result).not.toHaveProperty("loopState");
      expect(result.stagesRepaired).toEqual([
        "plan_episode_script",
        "storyboard_shotgrid",
      ]);
    });

    it("with maxAutoImproveRounds: 0, evaluates the initial review against policy floors without calling any effects, and returns {loopState, newReview}", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesQualityLoopV2: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ jsonPayload: BELOW_FLOOR_REVIEW }])) // loadLatestQualityReview (outer guard)
        .mockReturnValueOnce(
          selectChain([{ qualityPolicy: { maxAutoImproveRounds: 0 } }])
        ) // loadVerticalDramaQualityPolicy
        .mockReturnValueOnce(selectChain([{ id: 900 }])) // loadLatestQualityReviewArtifactId
        .mockReturnValueOnce(selectChain([{ jsonPayload: BELOW_FLOOR_REVIEW }])) // loadLatestQualityReview (inner, loop fn)
        .mockReturnValueOnce(
          selectChain([{ locale: "th", productTieIn: null }])
        ) // seriesRowForLoop
        .mockReturnValueOnce(
          selectChain([{ jsonPayload: BELOW_FLOOR_REVIEW }])
        ); // loadQualityReviewArtifactById
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 1001 }])) // quality_loop_state run
        .mockReturnValueOnce(insertChain([{ id: 1002 }])); // quality_loop_state artifact
      mockDb.update.mockReturnValueOnce(updateChain([])); // quality_loop_state run artifactIds update

      const result = await router.applyQualityReviewSuggestions({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", loop: true },
      });

      expect(result).toHaveProperty("loopState");
      expect((result as any).loopState.status).toBe("idle");
      expect((result as any).loopState.rounds).toEqual([]);
      expect((result as any).newReview).toEqual(BELOW_FLOOR_REVIEW);
      expect(mockRepairStage).not.toHaveBeenCalled();
      expect(mockRunVerticalDramaEpisodeQualityReview).not.toHaveBeenCalled();
    });

    it("rejects with FORBIDDEN when the estimated full-loop credit cost exceeds the user's balance", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesQualityLoopV2: true,
      } as any);
      mockHasEnoughCredits.mockResolvedValueOnce(false);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ jsonPayload: BELOW_FLOOR_REVIEW }])) // loadLatestQualityReview (outer)
        .mockReturnValueOnce(
          selectChain([{ qualityPolicy: { maxAutoImproveRounds: 2 } }])
        ); // loadVerticalDramaQualityPolicy

      await expect(
        router.applyQualityReviewSuggestions({
          ctx: ctx(),
          input: { seriesId: "10", episodeId: "100", loop: true },
        })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(mockRepairStage).not.toHaveBeenCalled();
    });
  });

  describe("W11.6 Story Lock — v1 single-apply path", () => {
    const PRIOR_SCRIPT = {
      episode_title: "Episode 1",
      hook: "Aria discovers a secret clause hidden inside the merger contract.",
      cliffhanger:
        "As Aria walks out, her assistant reveals the rival's own board just voted against him.",
      structure: {
        beats: [
          { beat: 1, summary: "setup", is_reversal: false },
          { beat: 2, summary: "reveal", is_reversal: true },
        ],
      },
      scene_dialogue_summary: [{ scene: 1, location: "boardroom" }],
    };
    // Beat count 2 -> 3 is a deterministic, unambiguous story-lock violation
    // regardless of hook/cliffhanger text (kept identical here on purpose).
    const VIOLATING_REPAIRED_SCRIPT = {
      ...PRIOR_SCRIPT,
      structure: {
        beats: [
          { beat: 1, summary: "setup", is_reversal: false },
          { beat: 2, summary: "reveal", is_reversal: true },
          { beat: 3, summary: "a brand new scene", is_reversal: false },
        ],
      },
    };
    const SCRIPT_ONLY_REVIEW = {
      episode_title: "Episode 1",
      scorecard: { overall: 3 },
      summary: "needs work",
      issues: [
        {
          location: "beat 1",
          problem: "weak reversal",
          suggested_fix: "sharpen the flip",
        },
      ],
      warnings: [],
      repair_queue: [],
    };

    function scriptEpisodeRow(
      script: unknown,
      over: Record<string, unknown> = {}
    ) {
      return {
        id: 100,
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        episodeNumber: 1,
        title: "Episode 1",
        script,
        storyboard: { shots: [] },
        dialogueAudioPlan: null,
        ...over,
      };
    }

    beforeEach(() => {
      mockRepairStage.mockReset();
    });

    it("rejects a violating script repair: reverts the live script, writes an audit artifact, excludes the stage from stagesRepaired/staleStages, and surfaces a warning", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesStoryLock: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([scriptEpisodeRow(PRIOR_SCRIPT)])) // loadOwnedEpisode (outer)
        .mockReturnValueOnce(selectChain([{ jsonPayload: SCRIPT_ONLY_REVIEW }])) // loadLatestQualityReview
        .mockReturnValueOnce(selectChain([scriptEpisodeRow(PRIOR_SCRIPT)])) // guard "before" snapshot
        .mockReturnValueOnce(
          selectChain([scriptEpisodeRow(VIOLATING_REPAIRED_SCRIPT)])
        ) // guard "after" snapshot
        // refreshedRow for the auto re-review — storyboard: null short-circuits the LLM re-review path.
        .mockReturnValueOnce(
          selectChain([
            scriptEpisodeRow(VIOLATING_REPAIRED_SCRIPT, { storyboard: null }),
          ])
        );
      mockRepairStage.mockResolvedValueOnce({
        runId: 1,
        result: {} as any,
        staleStages: ["storyboard_shotgrid"],
      });
      const revertChain = updateChain([]);
      const artifactIdsChain = updateChain([]);
      mockDb.update
        .mockReturnValueOnce(revertChain)
        .mockReturnValueOnce(artifactIdsChain);
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 900 }])) // story_lock_violation run row
        .mockReturnValueOnce(insertChain([{ id: 901 }])); // story_lock_violation artifact row

      const result = await router.applyQualityReviewSuggestions({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      // Instruction sent to the pipeline carries the execution-only constraint.
      expect(mockRepairStage).toHaveBeenCalledTimes(1);
      expect(mockRepairStage.mock.calls[0][1]).toBe("plan_episode_script");
      expect(mockRepairStage.mock.calls[0][2].instruction).toContain(
        VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT
      );

      // Reverted the live script column back to the PRIOR content.
      expect(revertChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ script: PRIOR_SCRIPT })
      );

      // Audit artifact recorded (append-only; the rejected artifact `repairStage`
      // already wrote is never deleted, this is a separate violation record).
      expect(mockDb.insert).toHaveBeenCalledTimes(2);

      // Rejected round never counts as "repaired" and never marks anything stale.
      expect(result.stagesRepaired).toEqual([]);
      expect(result.staleStages).toEqual([]);
      expect(result.warning).toContain("ปฏิเสธการซ่อม 1 รายการ");
      expect(result.warning).toContain("เนื้อเรื่องเปลี่ยนเกินกำหนด");
    });

    it("accepts a wording-only script repair: no revert, stage counted as repaired, no story-lock warning", async () => {
      const WORDING_ONLY_REPAIRED_SCRIPT = {
        ...PRIOR_SCRIPT,
        hook: "Inside the merger contract, Aria discovers a secret clause hidden there.",
      };
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesStoryLock: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([scriptEpisodeRow(PRIOR_SCRIPT)])) // loadOwnedEpisode (outer)
        .mockReturnValueOnce(selectChain([{ jsonPayload: SCRIPT_ONLY_REVIEW }])) // loadLatestQualityReview
        .mockReturnValueOnce(selectChain([scriptEpisodeRow(PRIOR_SCRIPT)])) // guard "before" snapshot
        .mockReturnValueOnce(
          selectChain([scriptEpisodeRow(WORDING_ONLY_REPAIRED_SCRIPT)])
        ) // guard "after" snapshot
        .mockReturnValueOnce(
          selectChain([
            scriptEpisodeRow(WORDING_ONLY_REPAIRED_SCRIPT, {
              storyboard: null,
            }),
          ])
        ); // refreshedRow
      mockRepairStage.mockResolvedValueOnce({
        runId: 1,
        result: {} as any,
        staleStages: ["storyboard_shotgrid"],
      });

      const result = await router.applyQualityReviewSuggestions({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result.stagesRepaired).toEqual(["plan_episode_script"]);
      expect(result.staleStages).toEqual(["storyboard_shotgrid"]);
      expect(result.warning).not.toContain("เนื้อเรื่องเปลี่ยนเกินกำหนด");
    });

    it("does not append the constraint or run the guard when the flag is off (byte-identical to pre-W11.6)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([scriptEpisodeRow(PRIOR_SCRIPT)])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ jsonPayload: SCRIPT_ONLY_REVIEW }])) // loadLatestQualityReview
        .mockReturnValueOnce(
          selectChain([
            scriptEpisodeRow(VIOLATING_REPAIRED_SCRIPT, { storyboard: null }),
          ])
        ); // refreshedRow only — NO extra guard snapshots
      mockRepairStage.mockResolvedValueOnce({
        runId: 1,
        result: {} as any,
        staleStages: ["storyboard_shotgrid"],
      });

      const result = await router.applyQualityReviewSuggestions({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockRepairStage.mock.calls[0][2].instruction).not.toContain(
        VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT
      );
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(result.stagesRepaired).toEqual(["plan_episode_script"]);
      expect(result.warning).not.toContain("เนื้อเรื่องเปลี่ยนเกินกำหนด");
    });
  });

  describe("Retention hooks — v1 single-apply path (planning/vertical-drama-retention-hooks/plan.md, router-wiring package)", () => {
    beforeEach(() => {
      mockRepairStage.mockReset();
      mockComputeRetentionMetrics.mockClear();
    });

    it("flags off: repairStage gets retentionHooksEnabled: false, re-review gets scoreRetentionDimensions: false and retentionMetrics: undefined, computeRetentionMetrics never called", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ jsonPayload: STORED_REVIEW }])) // loadLatestQualityReview
        .mockReturnValueOnce(selectChain([episodeRow()])) // refreshedRow
        .mockReturnValueOnce(selectChain([{ locale: "th" }])); // locale lookup
      mockRepairStage.mockResolvedValue({
        runId: 1,
        result: {} as any,
        staleStages: [],
      });
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: STORED_REVIEW,
        creditsUsed: 1,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.applyQualityReviewSuggestions({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      for (const call of mockRepairStage.mock.calls) {
        expect(call[2]).toEqual(
          expect.objectContaining({ retentionHooksEnabled: false })
        );
      }
      expect(mockComputeRetentionMetrics).not.toHaveBeenCalled();
      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreRetentionDimensions: false,
          retentionMetrics: undefined,
        })
      );
    });

    it("verticalDramaRetentionHooks on: repairStage gets retentionHooksEnabled: true for every repaired group, and the re-review computes + passes retentionMetrics", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaRetentionHooks: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ jsonPayload: STORED_REVIEW }])) // loadLatestQualityReview
        .mockReturnValueOnce(selectChain([episodeRow()])) // refreshedRow
        .mockReturnValueOnce(selectChain([{ locale: "th" }])) // locale lookup
        .mockReturnValueOnce(selectChain([])); // loadRecentVerticalDramaRetentionLoopTypes (no prior episodes)
      mockRepairStage.mockResolvedValue({
        runId: 1,
        result: {} as any,
        staleStages: [],
      });
      mockRunVerticalDramaEpisodeQualityReview.mockResolvedValue({
        review: STORED_REVIEW,
        creditsUsed: 1,
        model: "gpt-x",
      });
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 555 }]))
        .mockReturnValueOnce(insertChain([{ id: 777 }]));
      mockDb.update.mockReturnValueOnce(updateChain([]));

      await router.applyQualityReviewSuggestions({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockRepairStage.mock.calls.length).toBeGreaterThan(0);
      for (const call of mockRepairStage.mock.calls) {
        expect(call[2]).toEqual(
          expect.objectContaining({ retentionHooksEnabled: true })
        );
      }
      expect(mockComputeRetentionMetrics).toHaveBeenCalledWith(
        expect.objectContaining({ recentRetentionLoopTypes: [] })
      );
      expect(mockRunVerticalDramaEpisodeQualityReview).toHaveBeenCalledWith(
        expect.objectContaining({
          scoreRetentionDimensions: true,
          retentionMetrics: expect.objectContaining({
            retention_structure_facts: expect.objectContaining({
              open_loop_count: 1,
            }),
          }),
        })
      );
    });
  });
});

describe("repairStageOutput — W11.6 Story Lock", () => {
  function episodeRow() {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeNumber: 1,
      title: "Episode 1",
      script: {},
      storyboard: {},
      dialogueAudioPlan: null,
    };
  }

  beforeEach(() => {
    mockRepairStage.mockReset();
  });

  it("does not modify the manual repair instruction when the flag is off (byte-identical)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({} as any);
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow()]));
    mockRepairStage.mockResolvedValue({
      runId: 1,
      result: {} as any,
      staleStages: [],
    });

    await router.repairStageOutput({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        stage: "plan_episode_script",
        instruction: "fix the pacing in shot 3",
      },
    });

    expect(mockRepairStage.mock.calls[0][2].instruction).toBe(
      "fix the pacing in shot 3"
    );
  });

  it("appends the script constraint block to the manual repair instruction when the flag is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesStoryLock: true,
    } as any);
    mockDb.select.mockReturnValueOnce(selectChain([episodeRow()]));
    mockRepairStage.mockResolvedValue({
      runId: 1,
      result: {} as any,
      staleStages: [],
    });

    await router.repairStageOutput({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        stage: "plan_episode_script",
        instruction: "fix the pacing in shot 3",
      },
    });

    const instruction = mockRepairStage.mock.calls[0][2].instruction;
    expect(instruction).toContain("fix the pacing in shot 3");
    expect(instruction).toContain(VD_STORY_LOCK_SCRIPT_REPAIR_CONSTRAINT);
  });
});

describe("getEpisodeDetail — episodeLocations field (Phase D, planning/polished-toasting-gadget.md)", () => {
  function baseEpisodeRow() {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      script: null,
      dialogueAudioPlan: null,
      storyboard: null,
      storyboardReviewId: null,
      startFramePlan: null,
      motionPromptPack: null,
    };
  }

  it("returns [] (never null) when the series has no locations yet", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview
      .mockReturnValueOnce(selectChain([])); // episodePlan's own series-bible select
    // `mockListLocationRows` defaults to `Promise.resolve([])` (see this
    // file's top-level `verticalDramaLocationStock` mock) — no override
    // needed for the empty-roster case.

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.episodeLocations).toEqual([]);
    expect(mockListLocationRows).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
    });
  });

  it("returns the exact { locationKey, name, primaryReferenceUrl } shape for every roster location, with primaryReferenceUrl present only for an approved reference", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview
      .mockReturnValueOnce(selectChain([])); // episodePlan's own series-bible select
    mockListLocationRows.mockResolvedValueOnce([
      {
        id: 55,
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        locationKey: "loc_store",
        name: "ร้านสะดวกซื้อ",
        data: { description: "a store" },
        createdAt: new Date(),
        updatedAt: new Date(),
        primaryReferenceUrl: "https://cdn.example.com/store-plate.png",
        primaryReferenceAssetLinkId: 900,
      } as any,
      {
        id: 56,
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        locationKey: "loc_kitchen",
        name: "ครัวที่บ้าน",
        data: { description: "a kitchen" },
        createdAt: new Date(),
        updatedAt: new Date(),
        // No `primaryReferenceUrl` — no approved establishing plate yet.
      } as any,
    ]);

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.episodeLocations).toEqual([
      {
        locationKey: "loc_store",
        name: "ร้านสะดวกซื้อ",
        primaryReferenceUrl: "https://cdn.example.com/store-plate.png",
      },
      {
        locationKey: "loc_kitchen",
        name: "ครัวที่บ้าน",
        primaryReferenceUrl: undefined,
      },
    ]);
  });

  it("resolves to [] (never throws) when the location roster lookup itself fails — tolerant fallback, same convention as episodePlan", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([baseEpisodeRow()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview
      .mockReturnValueOnce(selectChain([])); // episodePlan's own series-bible select
    mockListLocationRows.mockRejectedValueOnce(new Error("db unavailable"));

    await expect(
      router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).resolves.toMatchObject({ episodeLocations: [] });
  });
});

describe("getEpisodeDetail — qualityReview field", () => {
  it("returns null when no quality-review artifact has been written yet", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            script: null,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits character rows
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview -> no artifact yet

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.qualityReview).toBeNull();
  });

  it("returns the latest persisted quality-review artifact payload", async () => {
    const review = {
      episode_title: "Episode 1",
      scorecard: {},
      summary: "ok",
      issues: [],
      warnings: [],
      repair_queue: [],
    };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            script: null,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
          },
        ])
      )
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ jsonPayload: review }]));

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.qualityReview).toEqual(review);
  });

  it("planning/vertical-drama-twin-variant-completeness W6: characterPortraits includes variant/twin relationship metadata for a variant row and omits it (undefined) for a plain base character", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            script: null,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([
          {
            id: 1,
            characterKey: "hero",
            name: "Hero",
            parentCharacterId: null,
            variantLabel: null,
            variantType: null,
            sharesFaceWithCharacterId: null,
          },
          {
            id: 2,
            characterKey: "hero-formal",
            name: "Hero",
            parentCharacterId: 1,
            variantLabel: "Formal outfit",
            variantType: "outfit",
            sharesFaceWithCharacterId: null,
          },
          {
            id: 3,
            characterKey: "hero-twin",
            name: "Evil Twin",
            parentCharacterId: null,
            variantLabel: null,
            variantType: null,
            sharesFaceWithCharacterId: 1,
          },
        ])
      ) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    // Plain base character: relationship fields are undefined, not
    // null-noise (the widened map is purely additive for existing rows).
    expect(result.characterPortraits.hero).toMatchObject({
      characterId: "1",
      name: "Hero",
    });
    expect(result.characterPortraits.hero.parentCharacterId).toBeUndefined();
    expect(result.characterPortraits.hero.variantLabel).toBeUndefined();
    expect(result.characterPortraits.hero.variantType).toBeUndefined();
    expect(
      result.characterPortraits.hero.sharesFaceWithCharacterId
    ).toBeUndefined();

    // Outfit variant row: carries parentCharacterId/variantLabel/variantType.
    expect(result.characterPortraits["hero-formal"]).toMatchObject({
      characterId: "2",
      parentCharacterId: "1",
      variantLabel: "Formal outfit",
      variantType: "outfit",
    });
    expect(
      result.characterPortraits["hero-formal"].sharesFaceWithCharacterId
    ).toBeUndefined();

    // Twin row: carries sharesFaceWithCharacterId, no parent/variant fields.
    expect(result.characterPortraits["hero-twin"]).toMatchObject({
      characterId: "3",
      sharesFaceWithCharacterId: "1",
    });
    expect(
      result.characterPortraits["hero-twin"].parentCharacterId
    ).toBeUndefined();
    expect(result.characterPortraits["hero-twin"].variantLabel).toBeUndefined();
  });

  it("Wave-4A: all new keys are null/0 and flags all false when every 2026-07-07 flag is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({} as any);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            script: null,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])); // loadLatestQualityReview

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.qualityPolicyResolved).toBeNull();
    expect(result.latestQualityLoopState).toBeNull();
    expect(result.tieInQualityReport).toBeNull();
    expect(result.arcReplanPendingCount).toBe(0);
    expect(result.wizard).toBeNull();
    // W10-B (2026-07-08) — `episodeDraftAvailable` is `null` when
    // `verticalDramaSeriesDeepStoryDrafts` is off, same convention as
    // `wizard`'s own null-when-flag-off shape.
    expect(result.episodeDraftAvailable).toBeNull();
    expect(result.flags).toEqual({
      speechBudget: false,
      arcReplan: false,
      qualityLoopV2: false,
      tieInQc: false,
      productionWizard: false,
      presetMixV2: false,
      deepStoryDrafts: false,
      // debt-item-1 (2026-07-08) — see `verticalDramaEpisodes.voiceChain.test.ts`
      // for dedicated flags.voiceChain coverage.
      voiceChain: false,
      // F131W (#30-A2) — see `verticalDramaEpisodes.adBannerPlan.test.ts` for
      // dedicated flags.adBannerOverlay coverage.
      adBannerOverlay: false,
      // F131AB (task #34) — see `verticalDramaEpisodes.textOverlayPlan.test.ts`
      // for dedicated flags.textOverlaySuite coverage.
      textOverlaySuite: false,
    });
    // Pre-existing fields stay exactly as before — no extra db.select calls
    // beyond the original 3 (byte-identical flags-off proof; W10-B's own
    // `resolveEpisodeDraftAvailable` select never runs when its flag is off)
    // plus 1 for Part A1's unconditional `episodePlan` lookup
    // (planning/`polished-toasting-gadget.md`) — resolved as the LAST query
    // of `getEpisodeDetail`, unaffected by any flag. Phase D's
    // `episodeLocations` adds NO extra `mockDb.select` call here — it goes
    // through the mocked `verticalDramaLocationStockService.listRows`
    // (service-level mock, see this file's `mockListLocationRows`), not a
    // raw `db.select`.
    expect(mockDb.select).toHaveBeenCalledTimes(4);
  });

  it("Wave-4A: populates qualityPolicyResolved, latestQualityLoopState, and a derived wizard state when qualityLoopV2 + productionWizard are on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesQualityLoopV2: true,
      verticalDramaSeriesProductionWizard: true,
    } as any);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            episodeNumber: 1,
            targetDurationSeconds: 60,
            script: null,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
            assemblyManifest: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview -> none
      .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // loadVerticalDramaQualityPolicy
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityLoopState -> none
      .mockReturnValueOnce(selectChain([{ productTieIn: null }])); // wizard's own productTieIn lookup

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.qualityPolicyResolved).toEqual(
      expect.objectContaining({ minOverall: 4, maxAutoImproveRounds: 2 })
    );
    expect(result.latestQualityLoopState).toBeNull();
    expect(result.wizard).toEqual(
      expect.objectContaining({
        activeStepId: expect.any(String),
        steps: expect.any(Array),
        primaryCta: expect.any(String),
      })
    );
    expect((result.wizard as any).steps.length).toBe(11);
    expect(result.flags.qualityLoopV2).toBe(true);
    expect(result.flags.productionWizard).toBe(true);
  });

  it("2026-07-08 fix: wires the REAL latestQualityLoopState.status into the wizard's script_qc evidence instead of always hardcoding 'not_run'", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesQualityLoopV2: true,
      verticalDramaSeriesProductionWizard: true,
    } as any);
    const persistedLoopState = {
      episodeId: "100",
      rounds: [],
      status: "escalated_max_rounds",
      activeReviewArtifactId: "artifact-1",
    };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            episodeNumber: 1,
            targetDurationSeconds: 60,
            // Non-null script + storyboard — script_qc is only ever
            // EVALUATED (rather than "locked") once the storyboard step
            // itself has passed.
            script: { episode_title: "Episode 1", structure: { beats: [] } },
            dialogueAudioPlan: null,
            storyboard: { shots: [] },
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
            assemblyManifest: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview -> none
      .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // loadVerticalDramaQualityPolicy
      .mockReturnValueOnce(selectChain([{ jsonPayload: persistedLoopState }])) // loadLatestQualityLoopState -> real state
      .mockReturnValueOnce(selectChain([{ productTieIn: null }])); // wizard's own productTieIn lookup

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.latestQualityLoopState).toEqual(persistedLoopState);
    const scriptQcStep = (result.wizard as any).steps.find(
      (s: any) => s.stepId === "script_qc"
    );
    expect(scriptQcStep.status).toBe("needs_repair");
    const loopRow = scriptQcStep.evidence.find(
      (r: any) => r.label === "Auto-improve loop"
    );
    expect(loopRow.value).toBe("escalated_max_rounds");
    expect(loopRow.loopState).toBe("escalated_max_rounds");
    const loopCriterion = scriptQcStep.criteria.find(
      (c: any) => c.id === "loop_state"
    );
    expect(loopCriterion.passed).toBe(false);
  });

  it("Wave-7D: wizard's script.coverageStatus is the REAL evaluateScriptSpeechCoverage result when speechBudget + qualityLoopV2 + productionWizard are all on and the episode has a script", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesSpeechBudget: true,
      verticalDramaSeriesQualityLoopV2: true,
      verticalDramaSeriesProductionWizard: true,
    } as any);
    const script = { episode_title: "Episode 1", structure: { beats: [] } };
    mockEvaluateScriptSpeechCoverage.mockReturnValue({
      estimatedSpeechSeconds: 5,
      coverageRatio: 0.08,
      status: "underfilled_error",
      // 2026-07-08 fix — evaluateScriptSpeechCoverage's real contract now
      // always includes the target band too; this mock matches the shape.
      targetSpeechSecondsMin: 34.8,
      targetSpeechSecondsMax: 40.8,
    });
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            episodeNumber: 1,
            targetDurationSeconds: 60,
            script,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
            assemblyManifest: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview -> none
      .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // loadVerticalDramaQualityPolicy
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityLoopState -> none
      .mockReturnValueOnce(selectChain([{ productTieIn: null, locale: "en" }])); // wizard's own productTieIn + locale lookup

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(mockEvaluateScriptSpeechCoverage).toHaveBeenCalledWith(
      script,
      60,
      "en"
    );
    const scriptStep = (result.wizard as any).steps.find(
      (s: any) => s.stepId === "episode_script"
    );
    expect(scriptStep).toMatchObject({
      status: "needs_repair",
      blockingReasons: ["VD_WIZARD_SCRIPT_UNDERFILLED"],
    });
  });

  it("Wave-7D: wizard's script.coverageStatus stays the in_range placeholder when speechBudget is off, even with a script present (flags-off byte-identical)", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesQualityLoopV2: true,
      verticalDramaSeriesProductionWizard: true,
    } as any);
    const script = { episode_title: "Episode 1", structure: { beats: [] } };
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            episodeNumber: 1,
            targetDurationSeconds: 60,
            script,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
            assemblyManifest: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview -> none
      .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // loadVerticalDramaQualityPolicy
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityLoopState -> none
      .mockReturnValueOnce(selectChain([{ productTieIn: null, locale: "en" }])); // wizard's own productTieIn + locale lookup

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(mockEvaluateScriptSpeechCoverage).not.toHaveBeenCalled();
    const scriptStep = (result.wizard as any).steps.find(
      (s: any) => s.stepId === "episode_script"
    );
    expect(scriptStep).toMatchObject({ status: "passed", blockingReasons: [] });
  });

  it("2026-07-08 fix: a legacy script with no_dialogue_data stays passed (never locks storyboard_shots) and the evidence row carries the real numbers, never the raw enum string", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesSpeechBudget: true,
      verticalDramaSeriesQualityLoopV2: true,
      verticalDramaSeriesProductionWizard: true,
    } as any);
    const script = {
      episode_title: "Episode 1",
      structure: {
        beats: [{ beat: 1, summary: "legacy beat, no dialogue_lines" }],
      },
      scene_dialogue_summary: [],
    };
    mockEvaluateScriptSpeechCoverage.mockReturnValue({
      estimatedSpeechSeconds: 36.8,
      coverageRatio: 0.613,
      status: "no_dialogue_data",
      targetSpeechSecondsMin: 34.8,
      targetSpeechSecondsMax: 40.8,
    });
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            id: 100,
            tenantId: "tenant-1",
            userId: 42,
            seriesId: 10,
            episodeNumber: 1,
            targetDurationSeconds: 60,
            script,
            dialogueAudioPlan: null,
            storyboard: null,
            storyboardReviewId: null,
            startFramePlan: null,
            motionPromptPack: null,
            assemblyManifest: null,
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview -> none
      .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // loadVerticalDramaQualityPolicy
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityLoopState -> none
      .mockReturnValueOnce(selectChain([{ productTieIn: null, locale: "en" }])); // wizard's own productTieIn + locale lookup

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    const scriptStep = (result.wizard as any).steps.find(
      (s: any) => s.stepId === "episode_script"
    );
    expect(scriptStep).toMatchObject({ status: "passed", blockingReasons: [] });
    const storyboardStep = (result.wizard as any).steps.find(
      (s: any) => s.stepId === "storyboard_shots"
    );
    expect(storyboardStep.status).not.toBe("locked");

    const evidenceRow = scriptStep.evidence[0];
    expect(evidenceRow.value).not.toBe("no_dialogue_data");
    expect(evidenceRow.scriptCoverage).toEqual({
      status: "no_dialogue_data",
      estimatedSpeechSeconds: 36.8,
      targetSpeechSecondsMin: 34.8,
      targetSpeechSecondsMax: 40.8,
    });
  });

  /**
   * 2026-07-08/W9-A (spec §14.1 rule 6b, section-12 "Pass Semantics —
   * Content Completeness") — end-to-end coverage through `getEpisodeDetail`:
   * `episode_script`'s 4 new criteria, `storyboard_shots`' 2 new criteria +
   * "incomplete" passState, and the new `perShotDialoguePreview` field. Shot
   * 2's dialogue is the REAL episode-11 bad-data line verbatim (curly
   * wrapping quotes + a speaker parenthetical + a tilde) — chosen because
   * `resolveShotDialogueLines`'s OWN pre-existing junk-fragment filter does
   * NOT drop it (it only recognizes `เสียง…`-prefixed fragments), proving
   * this wave's new speakability analyzer catches something nothing else
   * already did.
   */
  describe("2026-07-08/W9-A content-completeness wave", () => {
    const script = {
      episode_title: "Episode 11",
      structure: { beats: [] },
      scene_dialogue_summary: [
        { scene: 1, dialogue_lines: ['หนูนา: "ปล่อยฉันออกไปที"'] },
        { scene: 2, dialogue_lines: ["เจ้าเกลือ(เหมียว): “เหมียว~”"] },
      ],
    };
    const storyboard = {
      shots: [
        {
          shot_number: 1,
          duration_seconds: 8,
          narrative_purpose: "หนูนาพยายามเตือนยายทวด",
          image_prompt: "a girl warning her great-grandmother, vertical frame",
        },
        {
          shot_number: 2,
          duration_seconds: 8,
          narrative_purpose: "เจ้าเกลือส่งเสียงเตือนภัย",
          image_prompt: "a cat reacting to danger, vertical frame",
        },
      ],
    };

    it("flags the real bad-data line: episode_script's all_lines_speakable reads false for shot 2 only, passState 'failed', status/locks unaffected", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesQualityLoopV2: true,
        verticalDramaSeriesProductionWizard: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(
          selectChain([
            {
              id: 100,
              tenantId: "tenant-1",
              userId: 42,
              seriesId: 10,
              episodeNumber: 11,
              targetDurationSeconds: 60,
              script,
              dialogueAudioPlan: null,
              storyboard,
              storyboardReviewId: null,
              startFramePlan: null,
              motionPromptPack: null,
              assemblyManifest: null,
            },
          ])
        ) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
        .mockReturnValueOnce(selectChain([])) // loadLatestQualityReview -> none
        .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // loadVerticalDramaQualityPolicy
        .mockReturnValueOnce(selectChain([])) // loadLatestQualityLoopState -> none
        .mockReturnValueOnce(
          selectChain([{ productTieIn: null, locale: "th" }])
        ); // wizard's own productTieIn + locale lookup

      const result = await router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const scriptStep = (result.wizard as any).steps.find(
        (s: any) => s.stepId === "episode_script"
      );
      expect(scriptStep.status).toBe("passed");
      expect(scriptStep.passState).toBe("failed");
      expect(
        scriptStep.criteria.find((c: any) => c.id === "all_lines_speakable")
      ).toEqual({
        id: "all_lines_speakable",
        passed: false,
        detail: "1/2",
      });
      expect(
        scriptStep.criteria.find((c: any) => c.id === "dialogue_every_shot")
      ).toEqual({
        id: "dialogue_every_shot",
        passed: true,
        detail: "2/2",
      });
      // Section-12 "CTA ordering/locks unchanged" — storyboard_shots (the
      // gate this step feeds) is completely unaffected.
      expect(
        (result.wizard as any).steps.find(
          (s: any) => s.stepId === "storyboard_shots"
        ).status
      ).toBe("passed");

      // The preview carries the RAW (unsanitized) text — never the cleaned
      // suggestion — so the user sees exactly what needs fixing.
      const preview = (result as any).perShotDialoguePreview;
      expect(preview).toHaveLength(2);
      expect(preview[0]).toEqual({
        shotNumber: 1,
        lines: [{ speaker: "หนูนา", line: "ปล่อยฉันออกไปที" }],
        overLength: false,
        silent: expect.any(Boolean),
      });
      expect(preview[1].lines).toEqual([
        { speaker: "เจ้าเกลือ(เหมียว)", line: "“เหมียว~”" },
      ]);
    });

    it("storyboard exists with image prompts but no motion prompt pack yet: storyboard_shots is 'incomplete', never a clean pass, and never re-locks the downstream pipeline", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesQualityLoopV2: true,
        verticalDramaSeriesProductionWizard: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(
          selectChain([
            {
              id: 100,
              tenantId: "tenant-1",
              userId: 42,
              seriesId: 10,
              episodeNumber: 11,
              targetDurationSeconds: 60,
              script,
              dialogueAudioPlan: null,
              storyboard,
              storyboardReviewId: null,
              startFramePlan: null,
              // No motion prompt pack yet — freshly generated storyboard.
              motionPromptPack: null,
              assemblyManifest: null,
            },
          ])
        )
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ qualityPolicy: null }]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(
          selectChain([{ productTieIn: null, locale: "th" }])
        );

      const result = await router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const storyboardStep = (result.wizard as any).steps.find(
        (s: any) => s.stepId === "storyboard_shots"
      );
      expect(storyboardStep.status).toBe("passed");
      expect(storyboardStep.passState).toBe("incomplete");
      expect(
        storyboardStep.criteria.find(
          (c: any) => c.id === "image_prompts_all_shots"
        )
      ).toEqual({
        id: "image_prompts_all_shots",
        passed: true,
      });
      expect(
        storyboardStep.criteria.find(
          (c: any) => c.id === "video_prompts_all_shots"
        )
      ).toEqual({
        id: "video_prompts_all_shots",
        passed: false,
      });
    });

    it("no db.select calls beyond the existing 6 — this wave adds zero new queries", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesQualityLoopV2: true,
        verticalDramaSeriesProductionWizard: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(
          selectChain([
            {
              id: 100,
              tenantId: "tenant-1",
              userId: 42,
              seriesId: 10,
              episodeNumber: 11,
              targetDurationSeconds: 60,
              script,
              dialogueAudioPlan: null,
              storyboard,
              storyboardReviewId: null,
              startFramePlan: null,
              motionPromptPack: null,
              assemblyManifest: null,
            },
          ])
        )
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([{ qualityPolicy: null }]))
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(
          selectChain([{ productTieIn: null, locale: "th" }])
        );

      await router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      // +1 for Part A1's unconditional `episodePlan` lookup
      // (planning/`polished-toasting-gadget.md`), resolved as the LAST query
      // of `getEpisodeDetail`. Phase D's `episodeLocations` adds NO extra
      // `mockDb.select` call — it goes through the mocked
      // `verticalDramaLocationStockService.listRows` (service-level mock).
      expect(mockDb.select).toHaveBeenCalledTimes(7);
    });

    it("productionWizard flag off: perShotDialoguePreview stays null (flags-off byte-identical)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(
          selectChain([
            {
              id: 100,
              tenantId: "tenant-1",
              userId: 42,
              seriesId: 10,
              script,
              dialogueAudioPlan: null,
              storyboard,
              storyboardReviewId: null,
              startFramePlan: null,
              motionPromptPack: null,
            },
          ])
        )
        .mockReturnValueOnce(selectChain([]))
        .mockReturnValueOnce(selectChain([]));

      const result = await router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect((result as any).perShotDialoguePreview).toBeNull();
      // +1 for Part A1's unconditional `episodePlan` lookup
      // (planning/`polished-toasting-gadget.md`), resolved as the LAST query
      // of `getEpisodeDetail`. Phase D's `episodeLocations` adds NO extra
      // `mockDb.select` call — it goes through the mocked
      // `verticalDramaLocationStockService.listRows` (service-level mock).
      expect(mockDb.select).toHaveBeenCalledTimes(4);
    });
  });
});

/**
 * 2026-07-08 acceptance-review fixes #2 (HIGH false-negative, circular
 * assemblyManifest gate) and #5 (LOW-MED dead input, shotRepair.
 * failingTargetCount) — end-to-end coverage through `getEpisodeDetail`'s
 * wizard wiring. Drives every step through `episode_script` -> `video_clips`
 * to "passed" (qualityLoopV2/productionWizard coupling requires a real
 * passing scorecard — v1's always-passed fallback is unavailable once
 * productionWizard is on) so `video_clips`/`final_episode`'s OWN status is
 * actually reachable and observable.
 */
describe("2026-07-08 acceptance-review fix #2 — video_clips real completedClips signal (no more circular assemblyManifest gate)", () => {
  function fullyPassingEpisodeRow(over: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeNumber: 1,
      targetDurationSeconds: 16,
      script: { episode_title: "Episode 1", structure: { beats: [] } },
      dialogueAudioPlan: { audioStrategy: "dialogue_tts" },
      storyboard: { shots: [] },
      storyboardReviewId: null,
      startFramePlan: {
        selectedImageModelId: "model-1",
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            negativePrompt: "",
            requiredCharacterRefs: [],
            productReferenceAssetIds: [],
            approvedMediaAssetId: "900",
          },
        ],
      },
      motionPromptPack: null,
      assemblyManifest: null,
      ...over,
    };
  }

  function passingReview() {
    return {
      episode_title: "Episode 1",
      scorecard: {
        reversal_count: 0,
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
    };
  }

  /** Full 8-call db.select chain for a `productionWizardEnabled` request
   *  whose `startFramePlan` has an `approvedMediaAssetId` (so
   *  `resolveEpisodePlanAssetUrls` ALSO issues a real query — one more than
   *  the "no db.select calls beyond the existing 6" tests above, none of
   *  which set an approved asset id) AND a non-null `motionPromptPack` (so
   *  debt-item-4's `resolveVideoPromptsStale` ALSO issues a real query — see
   *  that function's doc comment; `getEpisodeDetail` only fires it once a
   *  motion-prompt-pack artifact exists). Order: loadOwnedEpisode ->
   *  resolveEpisodePlanAssetUrls -> resolveSeriesCharacterPortraits ->
   *  loadLatestQualityReview -> loadVerticalDramaQualityPolicy ->
   *  loadLatestQualityLoopState -> wizard's own productTieIn+locale lookup ->
   *  resolveVideoPromptsStale. `artifactRows` (default `[]`, resolving
   *  `stale` to `false`) feeds that final call — pass explicit
   *  `{stage, id}` rows to exercise a real stale/not-stale outcome. */
  function mockFullPassingChain(
    row: Record<string, unknown>,
    artifactRows: unknown[] = []
  ) {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesQualityLoopV2: true,
      verticalDramaSeriesProductionWizard: true,
    } as any);
    mockDb.select
      .mockReturnValueOnce(selectChain([row])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])) // resolveEpisodePlanAssetUrls
      .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
      .mockReturnValueOnce(selectChain([{ jsonPayload: passingReview() }])) // loadLatestQualityReview
      .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // loadVerticalDramaQualityPolicy
      .mockReturnValueOnce(selectChain([])) // loadLatestQualityLoopState -> none
      .mockReturnValueOnce(selectChain([{ productTieIn: null, locale: "th" }])) // wizard's productTieIn + locale lookup
      .mockReturnValueOnce(selectChain(artifactRows)); // resolveVideoPromptsStale
  }

  it("all clips carry videoTask.videoUrl but assemblyManifest is absent: video_clips passes and final_episode unlocks (guided flow no longer stranded)", async () => {
    const row = fullyPassingEpisodeRow({
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "profile-a",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "p1",
            durationSeconds: 8,
            videoTask: { videoUrl: "https://x/1.mp4" },
          },
          {
            clipNumber: 2,
            sourceShotNumbers: [1],
            prompt: "p2",
            durationSeconds: 8,
            videoTask: { videoUrl: "https://x/2.mp4" },
          },
        ],
        warnings: [],
      },
      assemblyManifest: null,
    });
    mockFullPassingChain(row);

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });
    const steps = (result.wizard as any).steps;

    const videoClipsStep = steps.find((s: any) => s.stepId === "video_clips");
    expect(videoClipsStep.status).toBe("passed");
    expect(videoClipsStep.evidence[0].detail).toBe("2/2");

    const finalEpisodeStep = steps.find(
      (s: any) => s.stepId === "final_episode"
    );
    expect(finalEpisodeStep.status).not.toBe("locked");
    expect(finalEpisodeStep.status).toBe("ready");
    expect(finalEpisodeStep.primaryAction).toBe("assemble_episode");
  });

  it("partial clips (only some carry videoTask.videoUrl): video_clips stays 'ready' with an 'n/total' evidence detail, final_episode stays locked on VD_WIZARD_VIDEO_CLIPS_INCOMPLETE", async () => {
    const row = fullyPassingEpisodeRow({
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "profile-a",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "p1",
            durationSeconds: 8,
            videoTask: { videoUrl: "https://x/1.mp4" },
          },
          {
            clipNumber: 2,
            sourceShotNumbers: [1],
            prompt: "p2",
            durationSeconds: 8,
          },
        ],
        warnings: [],
      },
      assemblyManifest: null,
    });
    mockFullPassingChain(row);

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });
    const steps = (result.wizard as any).steps;

    const videoClipsStep = steps.find((s: any) => s.stepId === "video_clips");
    expect(videoClipsStep.status).toBe("ready");
    expect(videoClipsStep.evidence[0].value).toBe("1/2");
    expect(videoClipsStep.evidence[0].detail).toBe("1/2");

    const finalEpisodeStep = steps.find(
      (s: any) => s.stepId === "final_episode"
    );
    expect(finalEpisodeStep.status).toBe("locked");
    expect(finalEpisodeStep.blockingReasons).toEqual([
      "VD_WIZARD_VIDEO_CLIPS_INCOMPLETE",
    ]);
  });

  it("acceptance-review fix #5: a clip whose videoTask carries status 'failed' counts toward shot_repair.failingTargetCount (best-effort signal, evidence reflects the real count)", async () => {
    const row = fullyPassingEpisodeRow({
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "profile-a",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "p1",
            durationSeconds: 8,
            videoTask: { videoUrl: "https://x/1.mp4" },
          },
          {
            clipNumber: 2,
            sourceShotNumbers: [1],
            prompt: "p2",
            durationSeconds: 8,
            // Best-effort read: nothing in this codebase's write path
            // persists this today, but the field is honoured the moment it
            // exists on the loaded JSONB payload.
            videoTask: { status: "failed" } as unknown as { videoUrl?: string },
          },
        ],
        warnings: [],
      },
      assemblyManifest: null,
    });
    mockFullPassingChain(row);

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });
    const shotRepairStep = (result.wizard as any).steps.find(
      (s: any) => s.stepId === "shot_repair"
    );

    expect(shotRepairStep.status).toBe("needs_repair");
    expect(shotRepairStep.primaryAction).toBe("repair_shots");
    expect(shotRepairStep.evidence[0].value).toBe("1");
    expect(shotRepairStep.evidence[0].detail).toBe("1");
  });

  it("acceptance-review fix #5: zero failed videoTasks -> shot_repair.failingTargetCount stays 0 (optional, not needs_repair) — unchanged from before this fix", async () => {
    const row = fullyPassingEpisodeRow({
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "profile-a",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "p1",
            durationSeconds: 8,
            videoTask: { videoUrl: "https://x/1.mp4" },
          },
        ],
        warnings: [],
      },
      assemblyManifest: null,
      targetDurationSeconds: 8,
    });
    mockFullPassingChain(row);

    const result = await router.getEpisodeDetail({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });
    const shotRepairStep = (result.wizard as any).steps.find(
      (s: any) => s.stepId === "shot_repair"
    );
    expect(shotRepairStep.status).toBe("optional");
    expect(shotRepairStep.evidence[0].value).toBe("0");
  });

  /**
   * debt-item-4 (2026-07-08) — `videoPrompts.stale` is now a real signal:
   * whether the episode's LATEST `storyboard_shotgrid` artifact was written
   * AFTER its latest `video_motion_prompt_pack` artifact. `id` is strictly
   * increasing (bigserial), so a higher `id` always means "written later" —
   * these rows don't need real timestamps to exercise both outcomes.
   */
  describe("debt-item-4: videoPrompts.stale (real per-artifact-ledger signal)", () => {
    function rowWithPack() {
      return fullyPassingEpisodeRow({
        motionPromptPack: {
          selectedVideoModelId: "veo-3-1",
          durationProfileId: "profile-a",
          motionMode: "first_frame_to_video",
          clips: [
            {
              clipNumber: 1,
              sourceShotNumbers: [1],
              prompt: "p1",
              durationSeconds: 8,
              videoTask: { videoUrl: "https://x/1.mp4" },
            },
          ],
          warnings: [],
        },
        assemblyManifest: null,
      });
    }

    function findVideoPromptsStep(
      result: Awaited<ReturnType<typeof router.getEpisodeDetail>>
    ) {
      return (result.wizard as any).steps.find(
        (s: any) => s.stepId === "video_prompts"
      );
    }

    it("is true when the storyboard artifact was written AFTER the video-prompts artifact (storyboard re-edited since)", async () => {
      mockFullPassingChain(rowWithPack(), [
        { stage: "storyboard_shotgrid", id: 20 }, // newer (higher id)
        { stage: "video_motion_prompt_pack", id: 10 },
      ]);

      const result = await router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const videoPromptsStep = findVideoPromptsStep(result);
      expect(videoPromptsStep.status).toBe("needs_repair");
      expect(videoPromptsStep.evidence[0].value).toBe("Stale");
      expect(
        videoPromptsStep.criteria.find(
          (c: any) => c.id === "video_prompts_not_stale"
        ).passed
      ).toBe(false);
    });

    it("is false when the video-prompts artifact was written AFTER (or at the same time as) the storyboard artifact", async () => {
      mockFullPassingChain(rowWithPack(), [
        { stage: "video_motion_prompt_pack", id: 20 }, // newer (higher id)
        { stage: "storyboard_shotgrid", id: 10 },
      ]);

      const result = await router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const videoPromptsStep = findVideoPromptsStep(result);
      expect(videoPromptsStep.status).toBe("passed");
      expect(videoPromptsStep.evidence[0].value).toBe("Fresh");
      expect(
        videoPromptsStep.criteria.find(
          (c: any) => c.id === "video_prompts_not_stale"
        ).passed
      ).toBe(true);
    });

    it("is false (fail-safe default) when one or both stages have no artifact row yet", async () => {
      mockFullPassingChain(rowWithPack(), [
        { stage: "storyboard_shotgrid", id: 20 },
      ]);

      const result = await router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const videoPromptsStep = findVideoPromptsStep(result);
      expect(videoPromptsStep.status).toBe("passed");
      expect(videoPromptsStep.evidence[0].value).toBe("Fresh");
    });

    it("never queries resolveVideoPromptsStale when motionPromptPack is null (select count stays at the pre-debt-item-4 7 calls)", async () => {
      // `fullyPassingEpisodeRow()`'s default `startFramePlan` carries an
      // `approvedMediaAssetId`, so — same as `mockFullPassingChain`'s row —
      // `resolveEpisodePlanAssetUrls` ALSO issues a real query here; only
      // the 8th (`resolveVideoPromptsStale`) call is the one debt-item-4
      // conditionally skips.
      const row = fullyPassingEpisodeRow({
        motionPromptPack: null,
        assemblyManifest: null,
      });
      mockGetTenantFeatureFlags.mockResolvedValue({
        verticalDramaSeriesQualityLoopV2: true,
        verticalDramaSeriesProductionWizard: true,
      } as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([row])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([])) // resolveEpisodePlanAssetUrls
        .mockReturnValueOnce(selectChain([])) // resolveSeriesCharacterPortraits
        .mockReturnValueOnce(selectChain([{ jsonPayload: passingReview() }])) // loadLatestQualityReview
        .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // loadVerticalDramaQualityPolicy
        .mockReturnValueOnce(selectChain([])) // loadLatestQualityLoopState -> none
        .mockReturnValueOnce(
          selectChain([{ productTieIn: null, locale: "th" }])
        ); // wizard's productTieIn + locale lookup

      const result = await router.getEpisodeDetail({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      const videoPromptsStep = findVideoPromptsStep(result);
      expect(videoPromptsStep.evidence[0].value).toBe("Not generated");
      // +1 for Part A1's unconditional `episodePlan` lookup
      // (planning/`polished-toasting-gadget.md`), resolved as the LAST query
      // of `getEpisodeDetail` (the 8th call here — no `mockReturnValueOnce`
      // queued for it, so the resulting `undefined` chain is caught by
      // `resolveEpisodePlanForEpisode`'s own defensive try/catch and
      // resolves to `episodePlan: null`, same fail-safe contract as every
      // other best-effort lookup in this procedure). Phase D's
      // `episodeLocations` adds NO extra `mockDb.select` call — it goes
      // through the mocked `verticalDramaLocationStockService.listRows`
      // (service-level mock, default resolves to `[]`).
      expect(mockDb.select).toHaveBeenCalledTimes(8);
    });
  });
});

describe("generateVideoClip — reference trimming (Phase 2.6)", () => {
  function episodeRowWithPack(clipOverrides: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "clip 1 motion prompt",
            durationSeconds: 8,
            startFrameAssetId: "900",
            ...clipOverrides,
          },
        ],
        warnings: [],
      },
    };
  }

  function shotReference(
    over: Partial<{ mediaAssetId: string; sortOrder: number }> = {}
  ) {
    return { referenceId: "r", mediaAssetId: "1", sortOrder: 0, ...over };
  }

  beforeEach(() => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      {
        id: "veo-3-1",
        type: "video",
        isEnabled: true,
        creditCost: 50,
        aliases: [],
        configJson: {},
      },
    ]);
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockGenerateVideoAsync.mockResolvedValue({ id: "task-1" } as any);
    mockFormatVideoClipRequest.mockReturnValue({
      prompt: "final prompt",
      negativePrompt: undefined,
      providerFamily: "veo",
      nativeAudioDialogue: true,
      generateAudio: true,
      ttsFallback: false,
      ttsLines: [],
      maxReferenceImages: 3,
      supportsStartFrame: true,
    } as any);
  });

  it("throws PRECONDITION_FAILED when the clip has no motion prompt yet", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([episodeRowWithPack({ prompt: "" })])
    );

    await expect(
      router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("keeps all references and reports trimmedReferenceCount 0 when within the model's maxReferenceImages", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([
      shotReference({ mediaAssetId: "1", sortOrder: 0 }),
      shotReference({ mediaAssetId: "2", sortOrder: 1 }),
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([
          { id: 900, originalUrl: "https://cdn/900.png" },
          { id: 1, originalUrl: "https://cdn/1.png" },
          { id: 2, originalUrl: "https://cdn/2.png" },
        ])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    expect(result.trimmedReferenceCount).toBe(0);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: [
          "https://cdn/900.png",
          "https://cdn/1.png",
          "https://cdn/2.png",
        ],
      }),
      expect.any(String)
    );
  });

  it("trims references beyond maxReferenceImages by sortOrder (lowest kept first) and reports the trimmed count", async () => {
    // Phase 5b fix (`vd-start-frame-reference-mapping/plan.md`) — with a
    // Grok-Imagine-like `maxReferenceImages: 1` AND a start frame present,
    // the extras budget is `1 - 1 = 0` (the start frame consumes the
    // model's only slot; the SERVICE-side combined-array cap
    // `resolveReferenceImageUrlsForModel` would otherwise silently drop
    // whatever the router thought it could keep here). So ZERO shot
    // references fit — `referenceImageUrls` stays byte-identical to
    // `[startFrame]` and ALL 3 linked references count as trimmed.
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 1,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([
      shotReference({ mediaAssetId: "3", sortOrder: 2 }),
      shotReference({ mediaAssetId: "1", sortOrder: 0 }),
      shotReference({ mediaAssetId: "2", sortOrder: 1 }),
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds — ONLY the start frame; the extras budget is 0
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    // 3 references linked, extras budget is 0 (maxReferenceImages(1) - 1 for
    // the start frame) -> all 3 trimmed.
    expect(result.trimmedReferenceCount).toBe(3);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: ["https://cdn/900.png"],
      }),
      expect.any(String)
    );
  });

  it("sends no referenceImageUrls when the model accepts none (maxReferenceImages 0)", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: false,
      maxReferenceImages: 0,
      nativeAudioDialogue: false,
      verticalDramaReady: false,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([
      shotReference({ mediaAssetId: "1", sortOrder: 0 }),
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // start frame only
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    expect(result.trimmedReferenceCount).toBe(1);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({ referenceImageUrls: ["https://cdn/900.png"] }),
      expect.any(String)
    );
  });

  it("2026-07-11 speaker-switch redesign: merges clip.extraReferenceAssetIds IN FRONT OF shot-level manual references (kept first when trimmed)", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([
      shotReference({ mediaAssetId: "5", sortOrder: 0 }),
    ]);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithPack({ extraReferenceAssetIds: ["3"] })])
      ) // loadOwnedEpisode — clip carries one additional speaker portrait
      .mockReturnValueOnce(
        selectChain([
          { id: 900, originalUrl: "https://cdn/900.png" },
          { id: 3, originalUrl: "https://cdn/3.png" },
          { id: 5, originalUrl: "https://cdn/5.png" },
        ])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    // extraReferenceAssetIds (1) + shot-level reference (1) = 2, within
    // maxReferenceImages(3) -> nothing trimmed, extra reference ordered
    // BEFORE the shot-level manual reference.
    expect(result.trimmedReferenceCount).toBe(0);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: [
          "https://cdn/900.png",
          "https://cdn/3.png",
          "https://cdn/5.png",
        ],
      }),
      expect.any(String)
    );
  });

  it("2026-07-11 speaker-switch redesign + Phase 5b fix: extraReferenceAssetIds are kept first when trimmed to the extras budget, dropping the shot-level manual reference AND the second extra (budget is maxReferenceImages - 1 for the start frame)", async () => {
    // Phase 5b fix — previously this test asserted the PRE-fix (buggy)
    // behavior: `maxReferenceImages(2)` used directly as the extras budget,
    // keeping BOTH extra portraits (3, 4) plus the start frame — 3 total ids
    // resolved, one over this model's real 2-image cap, which the
    // SERVICE-side combined-array slice (`resolveReferenceImageUrlsForModel`)
    // would have silently trimmed to 2 at actual submission time (dropping
    // "4"), while `trimmedReferenceCount` still reported only 1. The fixed
    // budget is `maxReferenceImages(2) - 1 (start frame) = 1`, so only ONE
    // extra portrait ("3") fits — matches what the service will actually
    // keep.
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 2,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([
      shotReference({ mediaAssetId: "5", sortOrder: 0 }),
    ]);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithPack({ extraReferenceAssetIds: ["3", "4"] })])
      ) // loadOwnedEpisode — 2 additional speaker portraits
      .mockReturnValueOnce(
        selectChain([
          { id: 900, originalUrl: "https://cdn/900.png" },
          { id: 3, originalUrl: "https://cdn/3.png" },
        ])
      ) // resolveMediaAssetUrlsByIds — only start frame + the ONE kept extra reference (extras budget is 1)
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    // extraReferenceAssetIds (2) + shot-level reference (1) = 3, trimmed to
    // the extras budget maxReferenceImages(2) - 1 (start frame) = 1 -> the
    // shot-level manual reference AND the second extra portrait ("4") are
    // both dropped, only the FIRST extra ("3") survives.
    expect(result.trimmedReferenceCount).toBe(2);
    expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: ["https://cdn/900.png", "https://cdn/3.png"],
      }),
      expect.any(String)
    );
  });

  it("forwards idempotencyKey through to deductCredits (T2)", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

    await router.generateVideoClip({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        clipNumber: 1,
        idempotencyKey: "vc-key-1",
      },
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "vc-key-1" })
    );
  });

  it("skips hasEnoughCredits/deductCredits for a zero-cost model (e.g. Higgsfield/Magnific MCP) and still submits generation", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      {
        id: "higgsfield/nano_banana_2",
        type: "video",
        isEnabled: true,
        creditCost: 0,
        aliases: [],
        configJson: {},
      },
    ]);
    mockShotReferencesService.listForShot.mockResolvedValue([]);
    // `generateVideoClip` now prices via `calculateCreditCost` (storyboard-
    // complete plan Phase 6.2b — resolution-tiered pricing), same convention
    // as the image mutations; override the global mock's default 10 for
    // this one call so the zero-cost model still prices to 0.
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          episodeRowWithPack({
            /* keep default clip shape */
          }),
        ])
      ) // loadOwnedEpisode — uses the default "veo-3-1" selection from episodeRowWithPack
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])); // pricing lookup — zero-cost model

    const result = await router.generateVideoClip({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
    });

    expect(result.creditCost).toBe(0);
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockGenerateVideoAsync).toHaveBeenCalled();
  });

  it("does not call refundCredits on submit failure for a zero-cost model", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([]);
    // See the matching comment in the previous test — override the default
    // mocked 10 so this zero-cost model still prices to 0.
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])); // pricing lookup — zero-cost model
    mockGenerateVideoAsync.mockRejectedValueOnce(new Error("submit failed"));

    await expect(
      router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  // Location visual bible, Phase E (planning/polished-toasting-gadget.md) —
  // the shot's location reference asset, appended AFTER character/shot
  // references and included in the same trim-to-maxReferenceImages logic.
  describe("location reference (Phase E, planning/polished-toasting-gadget.md)", () => {
    it("byte-identical when the shot has no resolved location (no override, no storyboard data): referenceImageUrls unchanged, and adds zero new db.select calls", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([
        shotReference({ mediaAssetId: "1", sortOrder: 0 }),
      ]);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode — no storyboard/startFramePlan fields at all
        .mockReturnValueOnce(
          selectChain([
            { id: 900, originalUrl: "https://cdn/900.png" },
            { id: 1, originalUrl: "https://cdn/1.png" },
          ])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.trimmedReferenceCount).toBe(0);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: ["https://cdn/900.png", "https://cdn/1.png"],
        }),
        expect.any(String)
      );
      // Exactly the pre-Phase-E 3 selects — the location resolution never
      // touches the database when the shot has no override and no matching
      // storyboard group.
      expect(mockDb.select).toHaveBeenCalledTimes(3);
    });

    it("includes the shot's location reference asset (resolved via the per-shot override) AFTER the start frame and shot references", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([]);
      const episodeRow = {
        ...episodeRowWithPack(),
        storyboard: null,
        startFramePlan: {
          selectedImageModelId: null,
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a prompt",
              requiredCharacterRefs: [],
              locationKey: "loc_store",
            },
          ],
        },
      };
      mockGetPrimaryReferenceAssetId.mockResolvedValueOnce(950);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 55, name: "ร้านสะดวกซื้อ", data: {} }])) // resolveLocationRosterRowByKey (override key)
        .mockReturnValueOnce(
          selectChain([
            { id: 900, originalUrl: "https://cdn/900.png" },
            { id: 950, originalUrl: "https://cdn/950-location-plate.png" },
          ])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(mockGetPrimaryReferenceAssetId).toHaveBeenCalledWith(
        { tenantId: "tenant-1", userId: 42, seriesId: 10 },
        55
      );
      expect(result.trimmedReferenceCount).toBe(0);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: ["https://cdn/900.png", "https://cdn/950-location-plate.png"],
        }),
        expect.any(String)
      );
    });

    it("trims the location reference away FIRST when the model caps out, keeping the start frame + the higher-priority shot reference", async () => {
      // Phase 5b fix — `maxReferenceImages: 2` (not 1) so the extras budget
      // (`maxReferenceImages - 1` for the start frame, see that fix's doc
      // comment in `generateVideoClip`) is exactly 1: enough for the ONE
      // higher-priority shot reference, none left for the lower-priority
      // location reference. `maxReferenceImages: 1` would leave a budget of
      // 0 (covered by the top-level "trims references beyond
      // maxReferenceImages..." test above) and wouldn't exercise this
      // test's actual point — priority ordering BETWEEN a shot reference and
      // the location reference.
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 2,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([
        shotReference({ mediaAssetId: "1", sortOrder: 0 }),
      ]);
      const episodeRow = {
        ...episodeRowWithPack(),
        storyboard: null,
        startFramePlan: {
          selectedImageModelId: null,
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a prompt",
              requiredCharacterRefs: [],
              locationKey: "loc_store",
            },
          ],
        },
      };
      mockGetPrimaryReferenceAssetId.mockResolvedValueOnce(950);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 55, name: "ร้านสะดวกซื้อ", data: {} }])) // resolveLocationRosterRowByKey
        .mockReturnValueOnce(
          selectChain([
            { id: 900, originalUrl: "https://cdn/900.png" },
            { id: 1, originalUrl: "https://cdn/1.png" },
          ])
        ) // resolveMediaAssetUrlsByIds — only start frame + the ONE kept shot reference (location trimmed away)
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      // shot reference (1) + location reference (1) = 2, trimmed to the
      // extras budget maxReferenceImages(2) - 1 (start frame) = 1 -> the
      // location reference (lowest priority) is the one dropped, never the
      // shot-level manual reference.
      expect(result.trimmedReferenceCount).toBe(1);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: ["https://cdn/900.png", "https://cdn/1.png"],
        }),
        expect.any(String)
      );
    });

    it("omits the location reference gracefully (never throws) when the override key has no matching roster row yet", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([]);
      const episodeRow = {
        ...episodeRowWithPack(),
        storyboard: null,
        startFramePlan: {
          selectedImageModelId: null,
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a prompt",
              requiredCharacterRefs: [],
              locationKey: "loc_ghost",
            },
          ],
        },
      };
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([])) // resolveLocationRosterRowByKey — no row for loc_ghost
        .mockReturnValueOnce(selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.trimmedReferenceCount).toBe(0);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({ referenceImageUrls: ["https://cdn/900.png"] }),
        expect.any(String)
      );
    });
  });

  // planning/vd-start-frame-reference-mapping/plan.md, Phase 5b/5c.
  describe("Phase 5b (reference-slot accounting fix) + 5c (auto-attach required-character portraits)", () => {
    it("5b: model max=3 + start frame -> extras budget is 2, exactly 2 of 3 shot references kept and trimmedReferenceCount counts the rest", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([
        shotReference({ mediaAssetId: "1", sortOrder: 0 }),
        shotReference({ mediaAssetId: "2", sortOrder: 1 }),
        shotReference({ mediaAssetId: "3", sortOrder: 2 }),
      ]);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { id: 900, originalUrl: "https://cdn/900.png" },
            { id: 1, originalUrl: "https://cdn/1.png" },
            { id: 2, originalUrl: "https://cdn/2.png" },
          ])
        ) // resolveMediaAssetUrlsByIds — start frame + the 2 references that fit the extras budget (3 - 1 for the start frame)
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.trimmedReferenceCount).toBe(1);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: [
            "https://cdn/900.png",
            "https://cdn/1.png",
            "https://cdn/2.png",
          ],
        }),
        expect.any(String)
      );
    });

    it("5b: Grok-like max=1 + start frame -> extras budget is 0, referenceImageUrls is byte-identical to [startFrame]", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 1,
        nativeAudioDialogue: false,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([
        shotReference({ mediaAssetId: "1", sortOrder: 0 }),
        shotReference({ mediaAssetId: "2", sortOrder: 1 }),
      ]);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds — extras budget is 0, only the start frame is ever resolved
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.trimmedReferenceCount).toBe(2);
      const call = mockGenerateVideoAsync.mock.calls[0][0] as {
        referenceImageUrls?: string[];
      };
      expect(call.referenceImageUrls).toEqual(["https://cdn/900.png"]);
      // Never queried the character roster for portraits on a max=1 model.
      expect(mockGetPrimaryPortraitAssetId).not.toHaveBeenCalled();
    });

    it("5b: byte-identical to pre-fix behavior when the clip has no start frame (extras budget stays the full maxReferenceImages)", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 2,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([
        shotReference({ mediaAssetId: "1", sortOrder: 0 }),
        shotReference({ mediaAssetId: "2", sortOrder: 1 }),
      ]);
      mockDb.select
        .mockReturnValueOnce(
          selectChain([episodeRowWithPack({ startFrameAssetId: undefined })])
        ) // loadOwnedEpisode — no start frame on this clip
        .mockReturnValueOnce(
          selectChain([
            { id: 1, originalUrl: "https://cdn/1.png" },
            { id: 2, originalUrl: "https://cdn/2.png" },
          ])
        ) // resolveMediaAssetUrlsByIds — no `- 1` term, both references fit
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.trimmedReferenceCount).toBe(0);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: ["https://cdn/1.png", "https://cdn/2.png"],
        }),
        expect.any(String)
      );
    });

    it("5c: auto-attaches required-character primary portraits, in requiredCharacterRefs order, after manual refs and BEFORE the location reference", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([
        shotReference({ mediaAssetId: "5", sortOrder: 0 }),
      ]);
      const episodeRow = {
        ...episodeRowWithPack(),
        storyboard: null,
        startFramePlan: {
          selectedImageModelId: null,
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a prompt",
              requiredCharacterRefs: ["char_a", "char_b"],
              locationKey: "loc_store",
            },
          ],
        },
      };
      mockGetPrimaryReferenceAssetId.mockResolvedValueOnce(950);
      mockGetPrimaryPortraitAssetId
        .mockResolvedValueOnce(101) // char_a
        .mockResolvedValueOnce(102); // char_b
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([{ id: 55, name: "ร้านสะดวกซื้อ", data: {} }])) // resolveLocationRosterRowByKey
        .mockReturnValueOnce(
          selectChain([
            { id: 11, characterKey: "char_a" },
            { id: 12, characterKey: "char_b" },
          ])
        ) // resolveClipRequiredCharacterPortraitAssetIds — character roster rows
        .mockReturnValueOnce(
          selectChain([
            { id: 900, originalUrl: "https://cdn/900.png" },
            { id: 5, originalUrl: "https://cdn/5.png" },
            { id: 101, originalUrl: "https://cdn/101-char-a.png" },
          ])
        ) // resolveMediaAssetUrlsByIds — extras budget (3 - 1) fits the manual ref + only ONE portrait; location trimmed
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      // Both characters' portraits are resolved (best-effort enrichment
      // resolves every required character up front)...
      expect(mockGetPrimaryPortraitAssetId).toHaveBeenNthCalledWith(
        1,
        { tenantId: "tenant-1", userId: 42, seriesId: 10 },
        11
      );
      expect(mockGetPrimaryPortraitAssetId).toHaveBeenNthCalledWith(
        2,
        { tenantId: "tenant-1", userId: 42, seriesId: 10 },
        12
      );
      // ...but only ONE fits the remaining extras budget after the manual
      // shot reference ("5") + char_a's portrait (101) fills the extras
      // budget exactly (2); char_b's portrait (102) never even makes it into
      // the ordered array (sliced off before location is appended), and the
      // location (950) is the one entry that IS in the ordered array but
      // beyond the budget -> `trimmedReferenceCount` is 1 (only the ordered
      // array's own overflow is counted; a portrait already excluded by the
      // per-slot slice was never added to the ordered array to begin with).
      expect(result.trimmedReferenceCount).toBe(1);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: [
            "https://cdn/900.png",
            "https://cdn/5.png",
            "https://cdn/101-char-a.png",
          ],
        }),
        expect.any(String)
      );
    });

    it("5c: dedupes a required character's portrait asset id against a reference already present (manual ref or start frame)", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([]);
      const episodeRow = {
        ...episodeRowWithPack(),
        storyboard: null,
        startFramePlan: {
          selectedImageModelId: null,
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a prompt",
              // char_a resolves to asset id 900 — the SAME asset already
              // used as the start frame — so it must be dropped, not
              // duplicated.
              requiredCharacterRefs: ["char_a", "char_b"],
            },
          ],
        },
      };
      mockGetPrimaryPortraitAssetId
        .mockResolvedValueOnce(900) // char_a — duplicate of the start frame
        .mockResolvedValueOnce(102); // char_b
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { id: 11, characterKey: "char_a" },
            { id: 12, characterKey: "char_b" },
          ])
        ) // resolveClipRequiredCharacterPortraitAssetIds — character roster rows
        .mockReturnValueOnce(
          selectChain([
            { id: 900, originalUrl: "https://cdn/900.png" },
            { id: 102, originalUrl: "https://cdn/102-char-b.png" },
          ])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.trimmedReferenceCount).toBe(0);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceImageUrls: [
            "https://cdn/900.png",
            "https://cdn/102-char-b.png",
          ],
        }),
        expect.any(String)
      );
    });

    it("5c: never attempts portrait auto-attach when maxReferenceImages is 1 (Grok Imagine) — no character roster query at all", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 1,
        nativeAudioDialogue: false,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([]);
      const episodeRow = {
        ...episodeRowWithPack(),
        storyboard: null,
        startFramePlan: {
          selectedImageModelId: null,
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a prompt",
              requiredCharacterRefs: ["char_a"],
            },
          ],
        },
      };
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds — NO character roster select in between
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(mockGetPrimaryPortraitAssetId).not.toHaveBeenCalled();
      expect(mockDb.select).toHaveBeenCalledTimes(3);
      expect(result.trimmedReferenceCount).toBe(0);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({ referenceImageUrls: ["https://cdn/900.png"] }),
        expect.any(String)
      );
    });

    it("5c: never fails the render when portrait resolution throws — submits without the auto-attached portraits (best-effort)", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockShotReferencesService.listForShot.mockResolvedValue([]);
      const episodeRow = {
        ...episodeRowWithPack(),
        storyboard: null,
        startFramePlan: {
          selectedImageModelId: null,
          frames: [
            {
              shotNumber: 1,
              imagePrompt: "a prompt",
              requiredCharacterRefs: ["char_a"],
            },
          ],
        },
      };
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockImplementationOnce(() => {
          throw new Error("db unavailable");
        }) // resolveClipRequiredCharacterPortraitAssetIds — character roster query fails
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }])); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.trimmedReferenceCount).toBe(0);
      expect(mockGenerateVideoAsync).toHaveBeenCalledWith(
        expect.objectContaining({ referenceImageUrls: ["https://cdn/900.png"] }),
        expect.any(String)
      );
    });
  });

  // Feature 135 — Hermes Grok media worker (section 09, row 9): the private
  // `resolveVdMediaTransportDecision` twin routes a Hermes-transport video
  // model into `queueHermesMediaJob` instead of `generateVideoAsync`,
  // trimming references via `effectiveHermesCapability` (the CONNECTION's
  // own capability manifest, not just the model row) on top of the
  // pre-existing "identity before environment" trim.
  describe("generateVideoClip — Hermes transport (section 09, row 9)", () => {
    // This suite's `mockGetModelsByTypeAsync.mockResolvedValue(...)` below is
    // STICKY beyond the file's top-level `vi.clearAllMocks()` (only
    // `mockReset()` clears a configured resolved-value default — see this
    // file's own doc comment on `mockGetTenantFeatureFlags` for the same
    // gotcha) — reset every hermes-only mock back to a blank `vi.fn()` after
    // this describe block so no default leaks into later, unrelated tests
    // in this same file that never set their own value.
    afterEach(() => {
      mockQueueHermesMediaJob.mockReset();
      mockBuildHermesMediaReferences.mockReset();
      mockGetHermesConnection.mockReset();
      mockGetModelsByTypeAsync.mockReset();
    });

    beforeEach(() => {
      // Defensive: `mockDb.select`/`mockGetModelsByTypeAsync` are shared,
      // file-wide `vi.fn()`s whose queued `mockReturnValueOnce` entries
      // survive the top-level `vi.clearAllMocks()` (only `mockReset()`
      // clears a queued/default return) — reset both to a blank slate here
      // so an unrelated EARLIER test's un-consumed queue entries can never
      // leak into this suite's own `mockReturnValueOnce` sequence.
      mockDb.select.mockReset();
      mockQueueHermesMediaJob.mockReset();
      mockBuildHermesMediaReferences.mockReset().mockImplementation(async ({ orderedRefs }: { orderedRefs: Array<{ assetId: string; role: string; label: string }> }) =>
        orderedRefs.map((ref, idx) => ({ ...ref, index: idx + 1, sha256: "a".repeat(64) })),
      );
      mockGetHermesConnection.mockReset();
      mockGetModelsByTypeAsync.mockReset();
      mockGetModelsByTypeAsync.mockResolvedValue([
        {
          id: "hermes-grok/grok-imagine-video",
          type: "video",
          isEnabled: true,
          creditCost: 0,
          aliases: [],
          configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-video" } },
        },
      ]);
      mockHasEnoughCredits.mockResolvedValue(true);
      mockDeductCredits.mockResolvedValue(undefined as any);
    });

    function hermesEpisodeRowWithPack(clipOverrides: Record<string, unknown> = {}) {
      return {
        id: 100,
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        motionPromptPack: {
          selectedVideoModelId: "hermes-grok/grok-imagine-video",
          durationProfileId: "vertical_drama_60s_9_frames_8_clips",
          motionMode: "first_frame_to_video",
          clips: [
            {
              clipNumber: 1,
              sourceShotNumbers: [1],
              prompt: "clip 1 motion prompt",
              durationSeconds: 8,
              startFrameAssetId: "900",
              ...clipOverrides,
            },
          ],
          warnings: [],
        },
      };
    }

    it("routes into queueHermesMediaJob (operation video.image_to_video), never calls generateVideoAsync, and reserves no platform credits", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockGetHermesConnection.mockResolvedValue({
        capabilities: { operations: { "video.image_to_video": { enabled: true, maxReferences: 1 } } },
      });
      mockShotReferencesService.listForShot.mockResolvedValue([]);
      mockQueueHermesMediaJob.mockResolvedValue({ created: true, taskId: "hermes_job-9", job: {} });
      mockDb.select
        .mockReturnValueOnce(selectChain([hermesEpisodeRowWithPack()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(
          selectChain([{ creditCost: 0, configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-video" } } }])
        ); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1, hermesConnectionId: "hermes-conn-1" },
      });

      expect(mockGenerateVideoAsync).not.toHaveBeenCalled();
      expect(mockQueueHermesMediaJob).toHaveBeenCalledTimes(1);
      expect(mockQueueHermesMediaJob).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "video.image_to_video",
          connectionId: "hermes-conn-1",
          tenantId: "tenant-1",
          requestedByUserId: 42,
        }),
      );
      // Effective capability (manifest maxReferences: 1) trims the ordered
      // ref set down to ONLY the start frame — grok i2v identity-before-
      // environment: the start frame alone carries 100% of identity.
      const call = mockQueueHermesMediaJob.mock.calls[0][0];
      expect(call.references).toHaveLength(1);
      expect(call.references[0]).toMatchObject({ assetId: "900", role: "start_frame" });
      expect(result.taskId).toBe("hermes_job-9");
      expect(result.creditCost).toBe(0);
      // No platform-credit reserve on the hermes path (the scheduler's
      // shared-pool fee, if any, is section-05's job, not this router's).
      expect(mockDeductCredits).not.toHaveBeenCalled();
      expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    });

    it("keeps the start frame + extra references when the connection manifest's maxReferences allows more than 1", async () => {
      mockResolveVerticalDramaCapabilities.mockReturnValue({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: true,
        verticalDramaReady: true,
      });
      mockGetHermesConnection.mockResolvedValue({
        capabilities: { operations: { "video.image_to_video": { enabled: true, maxReferences: 3 } } },
      });
      mockShotReferencesService.listForShot.mockResolvedValue([
        shotReference({ mediaAssetId: "1", sortOrder: 0 }),
      ]);
      mockQueueHermesMediaJob.mockResolvedValue({ created: true, taskId: "hermes_job-10", job: {} });
      mockDb.select
        .mockReturnValueOnce(selectChain([hermesEpisodeRowWithPack()]))
        .mockReturnValueOnce(
          selectChain([
            { id: 900, originalUrl: "https://cdn/900.png" },
            { id: 1, originalUrl: "https://cdn/1.png" },
          ])
        )
        .mockReturnValueOnce(
          selectChain([{ creditCost: 0, configJson: { transport: "hermes_worker", hermes: { providerModelId: "grok-imagine-video" } } }])
        );

      await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1, hermesConnectionId: "hermes-conn-1" },
      });

      const call = mockQueueHermesMediaJob.mock.calls[0][0];
      expect(call.references).toHaveLength(2);
      expect(call.references.map((r: { assetId: string }) => r.assetId)).toEqual(["900", "1"]);
    });
  });
});

describe("generateStartFrameImage / generateStartFrameAngleVariations — idempotencyKey passthrough (T2)", () => {
  function episodeRowWithStartFramePlan(
    frameOverrides: Record<string, unknown> = {}
  ) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            negativePrompt: undefined,
            requiredCharacterRefs: [],
            ...frameOverrides,
          },
        ],
      },
    };
  }

  beforeEach(() => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
  });

  it("generateStartFrameImage forwards idempotencyKey through to deductCredits", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])); // pricing lookup
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        idempotencyKey: "sf-key-1",
      },
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "sf-key-1" })
    );
  });

  it("generateStartFrameAngleVariations forwards idempotencyKey through to deductCredits", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        idempotencyKey: "av-key-1",
      },
    });

    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "av-key-1" })
    );
  });

  it("generateStartFrameImage skips hasEnoughCredits/deductCredits for a zero-cost model and still submits generation", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])); // pricing lookup — zero-cost model
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(result.creditCost).toBe(0);
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameImage does not call refundCredits on submit failure for a zero-cost model", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])); // pricing lookup — zero-cost model
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockRejectedValue(new Error("submit failed"));

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockDeductCredits).not.toHaveBeenCalled();
    expect(mockRefundCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameAngleVariations skips hasEnoughCredits/deductCredits for a zero-cost model and still submits generation", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: null }])) // pricing lookup — zero-cost model
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });

    const result = await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(result.creditCost).toBe(0);
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it('generateStartFrameImage builds transportMetadata.transport === "mcp" for an MCP-transport model (e.g. higgsfield/nano_banana_2) and forwards it to generateImageAsync', async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0); // MCP models are zero-cost (billed via MCP subscription)
    mockGetModelsByTypeAsync.mockResolvedValue([
      {
        id: "higgsfield/nano_banana_2",
        type: "image",
        isEnabled: true,
        aliases: [],
        configJson: {},
      },
    ]);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...episodeRowWithStartFramePlan(),
            startFramePlan: {
              selectedImageModelId: "higgsfield/nano_banana_2",
              frames: [
                {
                  shotNumber: 1,
                  imagePrompt: "a prompt",
                  requiredCharacterRefs: [],
                },
              ],
            },
          },
        ])
      ) // loadOwnedEpisode — episode-level selection resolves to the MCP model
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: {} }])); // pricing lookup — zero-cost MCP model
    const mcpMetadata = {
      transport: "mcp",
      originSurface: "media_studio",
      assetType: "image",
      providerKey: "higgsfield",
      connectionId: "conn-1",
      creditPolicy: "provider_credits_tracked",
    };
    mockResolveMediaTransport.mockResolvedValue(mcpMetadata);
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "mcp-task-1" });

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        mcpConnectionId: "conn-1",
      },
    });

    expect(result.taskId).toBe("mcp-task-1");
    expect(mockResolveMediaTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorUserId: 42,
        assetType: "image",
        requestedTransport: "mcp",
        mcpConnectionId: "conn-1",
        providerKey: "higgsfield",
      })
    );
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        transportMetadata: expect.objectContaining({ transport: "mcp" }),
      }),
      expect.any(String)
    );
    // Zero-cost MCP model — credit reserve/refund cycle still skipped.
    expect(mockHasEnoughCredits).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameImage throws BAD_REQUEST for an MCP-transport model when no mcpConnectionId is provided (fails closed instead of dispatching to the wrong provider)", async () => {
    mockCalculateCreditCost.mockReturnValueOnce(0);
    mockGetModelsByTypeAsync.mockResolvedValue([
      {
        id: "higgsfield/nano_banana_2",
        type: "image",
        isEnabled: true,
        aliases: [],
        configJson: {},
      },
    ]);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          {
            ...episodeRowWithStartFramePlan(),
            startFramePlan: {
              selectedImageModelId: "higgsfield/nano_banana_2",
              frames: [
                {
                  shotNumber: 1,
                  imagePrompt: "a prompt",
                  requiredCharacterRefs: [],
                },
              ],
            },
          },
        ])
      ) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 0, configJson: {} }])); // pricing lookup

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mockResolveMediaTransport).not.toHaveBeenCalled();
    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
  });
});

describe("resolution validation + pricing (Phase 6.2)", () => {
  function episodeRowWithStartFramePlan(
    frameOverrides: Record<string, unknown> = {}
  ) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            negativePrompt: undefined,
            requiredCharacterRefs: [],
            ...frameOverrides,
          },
        ],
      },
    };
  }

  beforeEach(() => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });
  });

  it("generateStartFrameImage passes a valid resolution through to generateImageAsync and calculateCreditCost", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce([
      { value: "720p", label: "720p", creditCost: 150 },
      { value: "1080p", label: "1080p", creditCost: 300 },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([
          { creditCost: 150, configJson: { pricingFormula: "matrix" } },
        ])
      ); // pricing lookup

    await router.generateStartFrameImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        resolution: "1080p",
      },
    });

    expect(mockCalculateCreditCost).toHaveBeenCalledWith(
      expect.objectContaining({ creditCost: 150 }),
      expect.objectContaining({ resolution: "1080p" })
    );
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: "1080p" }),
      expect.any(String)
    );
  });

  it("generateStartFrameImage rejects an invalid resolution with BAD_REQUEST when the model has known resolutionOptions", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce([
      { value: "720p", label: "720p" },
      { value: "1080p", label: "1080p" },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 150, configJson: {} }])); // pricing lookup

    await expect(
      router.generateStartFrameImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          resolution: "8K",
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
    expect(mockDeductCredits).not.toHaveBeenCalled();
  });

  it("generateStartFrameImage ignores a supplied resolution (no validation error) when the model has no resolution options at all", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce(undefined);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])); // pricing lookup

    const result = await router.generateStartFrameImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        resolution: "anything",
      },
    });

    expect(result.taskId).toBe("task-1");
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({ resolution: "anything" }),
      expect.any(String)
    );
  });

  it("generateStartFrameAngleVariations rejects an invalid resolution with BAD_REQUEST", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce([
      { value: "720p", label: "720p" },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await expect(
      router.generateStartFrameAngleVariations({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          resolution: "invalid",
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("no burned-in text in the 3x3 multi-angle grid prompt (Phase 6.3)", () => {
  function episodeRowWithStartFramePlan(
    frameOverrides: Record<string, unknown> = {}
  ) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            negativePrompt: "blurry",
            requiredCharacterRefs: [],
            ...frameOverrides,
          },
        ],
      },
    };
  }

  beforeEach(() => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockDeriveModelResolutionOptions.mockReturnValue(undefined);
  });

  // vertical-drama-skill-first-architecture plan, Phase 1 item 1 — the
  // literal "no text/captions/labels/watermarks" grid-instruction wording
  // is now authored entirely by the `vertical-drama-shot-image-action`
  // skill (see that skill's `skill.md` "Action: multi_angle_grid" section
  // and its fixtures for that wording's own coverage), not by this router.
  // These tests now verify the ROUTER's responsibility instead: it must ask
  // the skill for a `multi_angle_grid` action with the right grid layout and
  // the shot's own current prompt/negative-prompt as facts, and must forward
  // the skill's returned prompt/negative-prompt through to the actual render
  // call unmutated (via this file's `mockGenerateShotImageAction`, which
  // echoes those facts back into its return value).
  it("calls the shot-image-action skill with action=multi_angle_grid, a 3x3/9-panel grid_layout, and the shot's own prompt/negative-prompt facts", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGenerateShotImageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "multi_angle_grid",
        shot: expect.objectContaining({
          shotNumber: 1,
          currentPrompt: "a prompt",
          currentNegativePrompt: "blurry",
        }),
        repairInstruction: null,
        gridLayout: { panelCount: 9, layout: "3x3" },
      })
    );

    const call = (
      mediaGenerationService.generateImageAsync as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    // Skill-authored prompt (mocked, echoes the input facts) flows through
    // to the render call, and the shot's own negativePrompt is preserved.
    expect(call.prompt).toMatch(/a prompt/);
    expect(call.negativePrompt).toMatch(/blurry/);
  });

  it("passes an empty current_negative_prompt fact (never undefined) when the shot has no negativePrompt of its own", async () => {
    mockDb.select
      .mockReturnValueOnce(
        selectChain([
          episodeRowWithStartFramePlan({ negativePrompt: undefined }),
        ])
      )
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }]))
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(mockGenerateShotImageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        shot: expect.objectContaining({ currentNegativePrompt: "" }),
      })
    );
  });

  it("Wave-7D: appends the series' preset visual identity fragments onto the grid prompt/negative-prompt when verticalDramaSeriesPresetMixV2 is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: true,
    } as any);
    // Full shape required by the REAL `verticalDramaPresetVisualIdentitySchema`
    // parse inside `loadSeriesPresetVisualIdentity` (min-3 palette etc.) — a
    // partial fixture silently fails validation and the flow-through no-ops.
    const identity = {
      styleName: "sci-fi mecha noir",
      palette: ["steel blue", "amber", "gunmetal"],
      lighting: "cold rim light",
      environmentMotifs: ["hangar bays"],
      wardrobeGrammar: ["pilot suits"],
      signaturePropsAndCompanions: ["mecha unit"],
      cameraGrammar: "low angle hero shots",
      characterArchetypes: [],
      imagePromptFragments: {
        positive: ["mecha plating"],
        negative: ["cartoonish"],
      },
    };
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ bible: { presetVisualIdentity: identity } }])
      ) // loadSeriesPresetVisualIdentity
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(
      mockAppendPresetVisualIdentityFragmentsToImagePrompt
    ).toHaveBeenCalledWith("a prompt", identity);
    const call = (
      mediaGenerationService.generateImageAsync as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(call.prompt).toMatch(/mecha plating/);
    expect(call.negativePrompt).toMatch(/cartoonish/);
  });

  it("Wave-7D: does not append preset fragments when verticalDramaSeriesPresetMixV2 is off (default — flags-off byte-identical)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });

    await router.generateStartFrameAngleVariations({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
    });

    expect(
      mockAppendPresetVisualIdentityFragmentsToImagePrompt
    ).not.toHaveBeenCalled();
    expect(
      mockMergePresetVisualIdentityNegativeFragments
    ).not.toHaveBeenCalled();
  });
});

describe("repairShotImage (Phase 6.5)", () => {
  function episodeRowWithApprovedAsset(
    frameOverrides: Record<string, unknown> = {}
  ) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          {
            shotNumber: 1,
            imagePrompt: "a prompt",
            requiredCharacterRefs: [],
            approvedMediaAssetId: "900",
            ...frameOverrides,
          },
        ],
      },
    };
  }

  beforeEach(() => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockDeriveModelResolutionOptions.mockReturnValue(undefined);
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: false,
      verticalDramaReady: true,
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      {
        id: "google-nano-banana-pro",
        type: "image",
        isEnabled: true,
        name: "Google Nano Banana Pro",
        aliases: [],
        configJson: {},
      },
    ]);
  });

  it("throws PRECONDITION_FAILED when the shot has no startFramePlan yet", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 100,
          tenantId: "tenant-1",
          userId: 42,
          seriesId: 10,
          startFramePlan: null,
        },
      ])
    );

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          instruction: "change the jacket to red",
        },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws PRECONDITION_FAILED when the shot has no approvedMediaAssetId yet", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        episodeRowWithApprovedAsset({ approvedMediaAssetId: undefined }),
      ])
    );

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          instruction: "change the jacket to red",
        },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws PRECONDITION_FAILED when the approved asset URL cannot be resolved (deleted/inaccessible)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])); // resolveMediaAssetUrlsByIds — no matching row

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          instruction: "change the jacket to red",
        },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("throws PRECONDITION_FAILED listing capable models when the resolved model does not accept image input", async () => {
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: false,
      maxReferenceImages: 0,
      nativeAudioDialogue: false,
      verticalDramaReady: false,
    });
    mockGetModelsByTypeAsync.mockResolvedValue([
      {
        id: "z-image",
        type: "image",
        isEnabled: true,
        name: "Z-Image (no i2i)",
        aliases: [],
        configJson: {},
      },
      {
        id: "google-nano-banana-pro",
        type: "image",
        isEnabled: true,
        name: "Google Nano Banana Pro",
        aliases: [],
        configJson: {},
      },
    ]);
    // First call (guard check on the resolved model) -> not capable.
    // Second call (building the capable-models list) -> nano banana pro IS capable.
    mockResolveVerticalDramaCapabilities
      .mockReturnValueOnce({
        supportsStartFrame: false,
        maxReferenceImages: 0,
        nativeAudioDialogue: false,
        verticalDramaReady: false,
      })
      .mockReturnValueOnce({
        supportsStartFrame: false,
        maxReferenceImages: 0,
        nativeAudioDialogue: false,
        verticalDramaReady: false,
      })
      .mockReturnValueOnce({
        supportsStartFrame: true,
        maxReferenceImages: 3,
        nativeAudioDialogue: false,
        verticalDramaReady: true,
      });
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          instruction: "change the jacket to red",
        },
      })
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: expect.stringContaining("Google Nano Banana Pro"),
    });
    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
  });

  it("submits an image-to-image edit with the current image as the sole reference, a preservation directive, and reserves credits", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "repair-task-1" });

    const result = await router.repairShotImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "change the jacket to red",
        idempotencyKey: "repair-key-1",
      },
    });

    expect(result).toEqual({
      taskId: "repair-task-1",
      modelId: "google-nano-banana-pro",
      creditCost: 10,
    });
    expect(mockDeductCredits).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: "repair-key-1", amount: 10 })
    );
    expect(mediaGenerationService.generateImageAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUrls: ["https://cdn/900.png"],
        prompt: expect.stringContaining("change the jacket to red"),
      }),
      expect.any(String)
    );
    // vertical-drama-skill-first-architecture plan, Phase 1 item 2 — the
    // character-identity-lock wording is now authored entirely by the
    // `vertical-drama-shot-image-action` skill (see that skill's `skill.md`
    // "Action: repair" section), not by this router. Verify instead that the
    // router asked the skill for a `repair` action with the shot's current
    // prompt and the user's own instruction as facts.
    expect(mockGenerateShotImageAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "repair",
        shot: expect.objectContaining({
          shotNumber: 1,
          currentPrompt: "a prompt",
        }),
        repairInstruction: "change the jacket to red",
        gridLayout: null,
      })
    );
  });

  it("refunds credits when generation submission fails", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockRejectedValue(new Error("submit failed"));

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          instruction: "change the jacket to red",
        },
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });

    expect(mockRefundCredits).toHaveBeenCalled();
  });

  it("rejects an invalid resolution with BAD_REQUEST before submitting", async () => {
    mockDeriveModelResolutionOptions.mockReturnValueOnce([
      { value: "1K", label: "1K" },
    ]);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: {} }])); // pricing lookup

    await expect(
      router.repairShotImage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          shotNumber: 1,
          instruction: "change the jacket to red",
          resolution: "4K",
        },
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
  });

  it("Wave-7D: appends the series' preset visual identity fragments onto the repair prompt/negative-prompt when verticalDramaSeriesPresetMixV2 is on", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({
      verticalDramaSeriesPresetMixV2: true,
    } as any);
    const identity = {
      styleName: "sci-fi mecha noir",
      palette: ["steel blue", "amber", "gunmetal"],
      lighting: "cold rim light",
      environmentMotifs: ["hangar bays"],
      wardrobeGrammar: ["pilot suits"],
      signaturePropsAndCompanions: ["mecha unit"],
      cameraGrammar: "low angle hero shots",
      characterArchetypes: [],
      imagePromptFragments: {
        positive: ["mecha plating"],
        negative: ["cartoonish"],
      },
    };
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])) // loadSeriesTargetAudienceRegion — defaults to "thai"
      .mockReturnValueOnce(
        selectChain([{ bible: { presetVisualIdentity: identity } }])
      ); // loadSeriesPresetVisualIdentity
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "repair-task-1" });

    await router.repairShotImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "change the jacket to red",
      },
    });

    expect(
      mockAppendPresetVisualIdentityFragmentsToImagePrompt
    ).toHaveBeenCalled();
    const call = (
      mediaGenerationService.generateImageAsync as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(call.prompt).toMatch(/mecha plating/);
    expect(call.negativePrompt).toMatch(/cartoonish/);
    // Pre-existing repair negative prompt is `undefined` for a non-tie-in
    // shot — the preset's negative fragment is still merged in on its own,
    // proving `mergePresetVisualIdentityNegativeFragments` handles the
    // `undefined` base case (mirrors `generateStartFrameImage`'s usage).
    expect(call.negativePrompt).not.toMatch(/^undefined/);
  });

  it("Wave-7D: does not append preset fragments when verticalDramaSeriesPresetMixV2 is off (default — flags-off byte-identical)", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithApprovedAsset()])) // loadOwnedEpisode
      .mockReturnValueOnce(
        selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
      ) // resolveMediaAssetUrlsByIds
      .mockReturnValueOnce(selectChain([{ creditCost: 10, configJson: null }])) // pricing lookup
      .mockReturnValueOnce(selectChain([])); // loadSeriesTargetAudienceRegion — defaults to "thai"
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "repair-task-1" });

    const result = await router.repairShotImage({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        shotNumber: 1,
        instruction: "change the jacket to red",
      },
    });

    expect(result.taskId).toBe("repair-task-1");
    expect(
      mockAppendPresetVisualIdentityFragmentsToImagePrompt
    ).not.toHaveBeenCalled();
    expect(
      mockMergePresetVisualIdentityNegativeFragments
    ).not.toHaveBeenCalled();
    const call = (
      mediaGenerationService.generateImageAsync as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    // Byte-identical to before Wave-7D: no tie-in shot -> negativePrompt is `undefined`.
    expect(call.negativePrompt).toBeUndefined();
  });
});

describe("Wave-4A — tie-in quality gate (spec §13.1) on generateStartFrameImage / generateVideoClip", () => {
  const TIE_IN_QC_FLAGS = {
    verticalDramaSeriesSpeechBudget: true,
    verticalDramaSeriesQualityLoopV2: true,
    verticalDramaSeriesTieInQc: true,
  } as any;

  const scriptWithTieInOnShot1 = {
    episode_title: "Episode 1",
    product_tie_in_plan: {
      tie_ins: [{ shot_numbers: [1], story_function: "daily_use" }],
    },
  };
  const scriptWithTieInOnShot9Only = {
    episode_title: "Episode 1",
    product_tie_in_plan: {
      tie_ins: [{ shot_numbers: [9], story_function: "daily_use" }],
    },
  };

  function episodeRowWithStartFramePlan(over: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      script: scriptWithTieInOnShot1,
      startFramePlan: {
        selectedImageModelId: null,
        frames: [
          { shotNumber: 1, imagePrompt: "a prompt", requiredCharacterRefs: [] },
        ],
      },
      ...over,
    };
  }

  function episodeRowWithPack(over: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      script: scriptWithTieInOnShot1,
      motionPromptPack: {
        selectedVideoModelId: "veo-3-1",
        durationProfileId: "vertical_drama_60s_9_frames_8_clips",
        motionMode: "first_frame_to_video",
        clips: [
          {
            clipNumber: 1,
            sourceShotNumbers: [1],
            prompt: "clip 1 motion prompt",
            durationSeconds: 8,
            startFrameAssetId: "900",
          },
        ],
        warnings: [],
      },
      ...over,
    };
  }

  beforeEach(() => {
    mockHasEnoughCredits.mockResolvedValue(true);
    mockDeductCredits.mockResolvedValue(undefined as any);
    mockGetModelsByTypeAsync.mockResolvedValue([
      {
        id: "veo-3-1",
        type: "video",
        isEnabled: true,
        creditCost: 50,
        aliases: [],
        configJson: {},
      },
    ]);
    mockResolveVerticalDramaCapabilities.mockReturnValue({
      supportsStartFrame: true,
      maxReferenceImages: 3,
      nativeAudioDialogue: true,
      verticalDramaReady: true,
    });
    mockShotReferencesService.listForShot.mockResolvedValue([]);
    mockFormatVideoClipRequest.mockReturnValue({
      prompt: "final prompt",
      negativePrompt: undefined,
      providerFamily: "veo",
      nativeAudioDialogue: true,
      generateAudio: true,
      ttsFallback: false,
      ttsLines: [],
      maxReferenceImages: 3,
      supportsStartFrame: true,
    } as any);
    mediaGenerationService.generateImageAsync = vi
      .fn()
      .mockResolvedValue({ id: "task-1" });
    // Explicit (not relying on an earlier describe block's persisted
    // `mockResolvedValue` default — `vi.clearAllMocks()` clears call
    // history but not a previously-set default implementation, which would
    // make this block's tests fragile to file execution order).
    mockGenerateVideoAsync.mockResolvedValue({ id: "task-1" } as any);
  });

  describe("generateStartFrameImage", () => {
    it("rejects with VD_TIE_IN_BELOW_FLOOR when no tie-in report exists yet for a tie-in shot", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([])); // loadLatestTieInQualityReport -> none

      await expect(
        router.generateStartFrameImage({
          ctx: ctx(),
          input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
        })
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("VD_TIE_IN_BELOW_FLOOR"),
      });
      expect(mediaGenerationService.generateImageAsync).not.toHaveBeenCalled();
    });

    it("rejects with VD_TIE_IN_BELOW_FLOOR when the latest tie-in report is failing", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { jsonPayload: { passed: false, naturalnessScore: 40 } },
          ])
        ); // failing report

      await expect(
        router.generateStartFrameImage({
          ctx: ctx(),
          input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
        })
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("VD_TIE_IN_BELOW_FLOOR"),
      });
    });

    it("proceeds normally when the latest tie-in report has passed", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ jsonPayload: { passed: true, naturalnessScore: 90 } }])
        ) // passing report
        .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // Wave-7D: loadVerticalDramaQualityPolicy (defaults -> blockPaidGenerationBelowFloor: true -> override-audit short-circuits)
        .mockReturnValueOnce(
          selectChain([{ creditCost: 10, configJson: null }])
        ); // pricing lookup

      const result = await router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(result.taskId).toBe("task-1");
      expect(mediaGenerationService.generateImageAsync).toHaveBeenCalled();
      // Guided-mode default policy (blockPaidGenerationBelowFloor: true) never
      // records an override — only the policy select runs, no insert/update.
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("Wave-7D: records a VD_QUALITY_FLOOR_OVERRIDE audit event in expert mode with a failing scorecard, but still proceeds with generation (does not block)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      let capturedArtifactValues: any;
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ jsonPayload: { passed: true, naturalnessScore: 90 } }])
        ) // passing tie-in report
        .mockReturnValueOnce(
          selectChain([
            { qualityPolicy: { blockPaidGenerationBelowFloor: false } },
          ])
        ) // expert-mode policy
        .mockReturnValueOnce(selectChain([{ id: 555 }])) // loadLatestQualityReviewArtifactId
        .mockReturnValueOnce(
          selectChain([
            { jsonPayload: { scorecard: { overall: 2, pacing: 2 } } },
          ])
        ) // loadLatestQualityReview -> failing scorecard
        .mockReturnValueOnce(
          selectChain([{ creditCost: 10, configJson: null }])
        ); // pricing lookup
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 700 }])) // override-audit run row
        .mockReturnValueOnce({
          values: vi.fn((v: any) => {
            capturedArtifactValues = v;
            return { returning: vi.fn(() => Promise.resolve([{ id: 701 }])) };
          }),
        }); // override-audit artifact row
      mockDb.update.mockReturnValueOnce(updateChain([]));

      const result = await router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      // Does NOT block: generation still proceeds normally.
      expect(result.taskId).toBe("task-1");
      expect(mediaGenerationService.generateImageAsync).toHaveBeenCalled();

      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(capturedArtifactValues).toMatchObject({
        tenantId: "tenant-1",
        userId: 42,
        seriesId: 10,
        episodeId: 100,
        stage: "quality_floor_override_audit",
        jsonPayload: expect.objectContaining({
          code: "VD_QUALITY_FLOOR_OVERRIDE",
          userId: 42,
          episodeId: 100,
          reviewArtifactId: "555",
          overall: 2,
          failingDimensions: expect.arrayContaining(["overall", "pacing"]),
          source: "trpc.verticalDramaEpisodes.generateStartFrameImage",
        }),
      });
    });

    it("Wave-7D: does not record an override when expert mode but the latest scorecard already passes the policy floor", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ jsonPayload: { passed: true, naturalnessScore: 90 } }])
        ) // passing tie-in report
        .mockReturnValueOnce(
          selectChain([
            { qualityPolicy: { blockPaidGenerationBelowFloor: false } },
          ])
        ) // expert-mode policy
        .mockReturnValueOnce(selectChain([{ id: 555 }])) // loadLatestQualityReviewArtifactId
        .mockReturnValueOnce(
          selectChain([
            { jsonPayload: { scorecard: { overall: 5, pacing: 5 } } },
          ])
        ) // passing scorecard
        .mockReturnValueOnce(
          selectChain([{ creditCost: 10, configJson: null }])
        ); // pricing lookup

      const result = await router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(result.taskId).toBe("task-1");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("does not check the tie-in report at all for a shot with no tie-in placement", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(
          selectChain([
            episodeRowWithStartFramePlan({
              script: scriptWithTieInOnShot9Only,
            }),
          ])
        ) // loadOwnedEpisode — shot 1 requested, tie-in is on shot 9
        .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // Wave-7D: loadVerticalDramaQualityPolicy (no tie-in-report select in between — the tie-in gate itself no-ops for this episode)
        .mockReturnValueOnce(
          selectChain([{ creditCost: 10, configJson: null }])
        ); // pricing lookup

      const result = await router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(result.taskId).toBe("task-1");
    });

    it("skips the gate entirely when verticalDramaSeriesTieInQc is off (default)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithStartFramePlan()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ creditCost: 10, configJson: null }])
        ); // pricing lookup (no tie-in-report select)

      const result = await router.generateStartFrameImage({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", shotNumber: 1 },
      });

      expect(result.taskId).toBe("task-1");
    });
  });

  describe("generateVideoClip", () => {
    it("rejects with VD_TIE_IN_BELOW_FLOOR when no tie-in report exists yet for a tie-in-carrying clip", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([])); // loadLatestTieInQualityReport -> none

      await expect(
        router.generateVideoClip({
          ctx: ctx(),
          input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
        })
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("VD_TIE_IN_BELOW_FLOOR"),
      });
      expect(mockGenerateVideoAsync).not.toHaveBeenCalled();
    });

    it("proceeds normally when the latest tie-in report has passed", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ jsonPayload: { passed: true, naturalnessScore: 90 } }])
        ) // passing report
        .mockReturnValueOnce(selectChain([{ qualityPolicy: null }])) // Wave-7D: loadVerticalDramaQualityPolicy (defaults -> no override recorded)
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(
          selectChain([{ creditCost: 50, configJson: null }])
        ); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.taskId).toBe("task-1");
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("Wave-7D: records a VD_QUALITY_FLOOR_OVERRIDE audit event in expert mode with a failing scorecard, but still proceeds with generation (does not block)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      let capturedArtifactValues: any;
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ jsonPayload: { passed: true, naturalnessScore: 90 } }])
        ) // passing tie-in report
        .mockReturnValueOnce(
          selectChain([
            { qualityPolicy: { blockPaidGenerationBelowFloor: false } },
          ])
        ) // expert-mode policy
        .mockReturnValueOnce(selectChain([{ id: 555 }])) // loadLatestQualityReviewArtifactId
        .mockReturnValueOnce(
          selectChain([
            { jsonPayload: { scorecard: { overall: 1, pacing: 1 } } },
          ])
        ) // failing scorecard
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(
          selectChain([{ creditCost: 50, configJson: null }])
        ); // pricing lookup
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 700 }])) // override-audit run row
        .mockReturnValueOnce({
          values: vi.fn((v: any) => {
            capturedArtifactValues = v;
            return { returning: vi.fn(() => Promise.resolve([{ id: 701 }])) };
          }),
        }); // override-audit artifact row
      mockDb.update.mockReturnValueOnce(updateChain([]));

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.taskId).toBe("task-1");
      expect(mockGenerateVideoAsync).toHaveBeenCalled();
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(capturedArtifactValues).toMatchObject({
        stage: "quality_floor_override_audit",
        jsonPayload: expect.objectContaining({
          code: "VD_QUALITY_FLOOR_OVERRIDE",
          reviewArtifactId: "555",
          source: "trpc.verticalDramaEpisodes.generateVideoClip",
        }),
      });
    });

    it("skips the gate entirely when verticalDramaSeriesTieInQc is off (default)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(
          selectChain([{ creditCost: 50, configJson: null }])
        ); // pricing lookup

      const result = await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(result.taskId).toBe("task-1");
    });

    it("passes clip.audioDirection through to formatVideoClipRequest when present (task #36)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      const episodeRow = episodeRowWithPack({
        motionPromptPack: {
          selectedVideoModelId: "veo-3-1",
          durationProfileId: "vertical_drama_60s_9_frames_8_clips",
          motionMode: "first_frame_to_video",
          clips: [
            {
              clipNumber: 1,
              sourceShotNumbers: [1],
              prompt: "clip 1 motion prompt",
              durationSeconds: 8,
              startFrameAssetId: "900",
              audioDirection: "Rain taps the window; a door creaks shut.",
            },
          ],
          warnings: [],
        },
      });
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRow])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        ) // resolveMediaAssetUrlsByIds
        .mockReturnValueOnce(
          selectChain([{ creditCost: 50, configJson: null }])
        ); // pricing lookup

      await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(mockFormatVideoClipRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          clip: expect.objectContaining({
            audioDirection: "Rain taps the window; a door creaks shut.",
          }),
        }),
      );
    });

    it("passes clip.audioDirection as undefined when the clip never opted in (byte-identical call shape)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithPack()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([{ id: 900, originalUrl: "https://cdn/900.png" }])
        )
        .mockReturnValueOnce(selectChain([{ creditCost: 50, configJson: null }]));

      await router.generateVideoClip({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100", clipNumber: 1 },
      });

      expect(mockFormatVideoClipRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          clip: expect.objectContaining({ audioDirection: undefined }),
        }),
      );
    });
  });
});

describe("Wave-4A — tie-in quality gate (spec §13.1) on runStage / regenerateStage (create_storyboard_review_project)", () => {
  const TIE_IN_QC_FLAGS = {
    verticalDramaSeriesSpeechBudget: true,
    verticalDramaSeriesQualityLoopV2: true,
    verticalDramaSeriesTieInQc: true,
  } as any;

  function episodeRowWithTieIn() {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      script: {
        episode_title: "Episode 1",
        product_tie_in_plan: {
          tie_ins: [{ shot_numbers: [3], story_function: "daily_use" }],
        },
      },
    };
  }

  beforeEach(() => {
    mockRunStage.mockClear();
  });

  describe("runStage", () => {
    it("rejects VD_TIE_IN_BELOW_FLOOR for a real (full-mode) create_storyboard_review_project run when the tie-in report is missing", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithTieIn()])) // loadOwnedEpisode
        .mockReturnValueOnce(selectChain([])); // loadLatestTieInQualityReport -> none

      await expect(
        router.runStage({
          ctx: ctx(),
          input: {
            seriesId: "10",
            episodeId: "100",
            stage: "create_storyboard_review_project",
            mode: "full",
          },
        })
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("VD_TIE_IN_BELOW_FLOOR"),
      });
      expect(mockRunStage).not.toHaveBeenCalled();
    });

    it("never gates a dry_run/plan_only preview run, even with a failing tie-in report", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select.mockReturnValueOnce(selectChain([episodeRowWithTieIn()])); // loadOwnedEpisode only — no tie-in-report select

      const result = await router.runStage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          stage: "create_storyboard_review_project",
          mode: "dry_run",
        },
      });

      expect(result).toEqual({});
      expect(mockRunStage).toHaveBeenCalled();
    });

    it("does not gate other stages even when the episode has a failing tie-in report", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithTieIn()])) // loadOwnedEpisode
        // Task #26 — `plan_episode_script` + real mode now also runs
        // `assertEpisodeWithinSeasonPlan`'s `resolveEpisodeBreakdownStatus`
        // bible lookup; an empty row (`bible: null`) resolves "no_plan"
        // (grandfathered legacy series), so the gate is a no-op here.
        .mockReturnValueOnce(selectChain([]));

      const result = await router.runStage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          stage: "plan_episode_script",
          mode: "full",
        },
      });

      expect(result).toEqual({});
    });
  });

  describe("regenerateStage", () => {
    it("rejects VD_TIE_IN_BELOW_FLOOR before deleting any prior run when the tie-in report is failing", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(selectChain([episodeRowWithTieIn()])) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain([
            { jsonPayload: { passed: false, naturalnessScore: 30 } },
          ])
        ); // failing report

      await expect(
        router.regenerateStage({
          ctx: ctx(),
          input: {
            seriesId: "10",
            episodeId: "100",
            stage: "create_storyboard_review_project",
          },
        })
      ).rejects.toMatchObject({
        code: "PRECONDITION_FAILED",
        message: expect.stringContaining("VD_TIE_IN_BELOW_FLOOR"),
      });
      expect(mockDb.delete).not.toHaveBeenCalled();
    });

    it("skips the gate entirely when verticalDramaSeriesTieInQc is off (default)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({} as any);
      mockDb.select.mockReturnValueOnce(selectChain([episodeRowWithTieIn()])); // loadOwnedEpisode only
      mockDb.delete.mockReturnValueOnce({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDb.update.mockReturnValueOnce(updateChain([]));

      const result = await router.regenerateStage({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          stage: "create_storyboard_review_project",
        },
      });

      expect(result).toEqual({});
      expect(mockRunStage).toHaveBeenCalled();
    });
  });
});

describe("deferEpisodeTieIn (spec §13.1 defer path)", () => {
  const TIE_IN_QC_FLAGS = {
    verticalDramaSeriesSpeechBudget: true,
    verticalDramaSeriesQualityLoopV2: true,
    verticalDramaSeriesTieInQc: true,
  } as any;

  function episodeRowWithTieIn(over: Record<string, unknown> = {}) {
    return {
      id: 100,
      tenantId: "tenant-1",
      userId: 42,
      seriesId: 10,
      episodeNumber: 7,
      script: {
        episode_title: "Episode 7",
        product_tie_in_plan: {
          tie_ins: [{ shot_numbers: [3], story_function: "daily_use" }],
        },
      },
      ...over,
    };
  }

  beforeEach(() => {
    mockAppendEvent.mockClear();
    mockAppendEvent.mockResolvedValue({ memoryEventId: "evt-1" });
    mockGetActiveBreakdown.mockReset();
    mockGetActiveBreakdown.mockReturnValue([]);
  });

  /** A clean N-episode season breakdown item, no `tieIn` field (legacy/bootstrap starting state). */
  function breakdownItem(episodeNumber: number) {
    return {
      episodeNumber,
      workingTitle: `Episode ${episodeNumber} title`,
      logline: `Episode ${episodeNumber} logline`,
      keyBeats: [`beat ${episodeNumber}`],
      contentBudget: {
        beatCount: 6,
        estimatedSpeechSeconds: 35,
        conflictLevel: 3,
        reversalTarget: 2,
        arcThreads: [],
      },
    };
  }
  function season(count: number) {
    return Array.from({ length: count }, (_, i) => breakdownItem(i + 1));
  }

  it("rejects with FORBIDDEN when verticalDramaSeriesTieInQc is off", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue({} as any);

    await expect(
      router.deferEpisodeTieIn({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("rejects with PRECONDITION_FAILED when the episode has no script yet", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
    mockDb.select.mockReturnValueOnce(
      selectChain([episodeRowWithTieIn({ script: null })])
    );

    await expect(
      router.deferEpisodeTieIn({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("rejects with PRECONDITION_FAILED when the episode has no tie-in placement to defer", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
    mockDb.select.mockReturnValueOnce(
      selectChain([
        episodeRowWithTieIn({
          script: {
            episode_title: "Episode 7",
            product_tie_in_plan: { tie_ins: [] },
          },
        }),
      ])
    );

    await expect(
      router.deferEpisodeTieIn({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("strips tie_ins, backs up the prior script as a run artifact, appends a deferred memory event, and returns staleStages", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
    mockDb.select
      .mockReturnValueOnce(selectChain([episodeRowWithTieIn()])) // loadOwnedEpisode
      .mockReturnValueOnce(selectChain([])); // schedule-risk series row -> none (skips risk sub-flow)
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 501 }])) // prior-script run
      .mockReturnValueOnce(insertChain([{ id: 601 }])); // prior-script artifact
    mockDb.update
      .mockReturnValueOnce(updateChain([])) // run artifactIds update
      .mockReturnValueOnce(updateChain([])); // episode.script overwrite

    const result = await router.deferEpisodeTieIn({
      ctx: ctx(),
      input: {
        seriesId: "10",
        episodeId: "100",
        idempotencyKey: "defer-key-1",
      },
    });

    expect(result.scriptArtifactRef).toEqual({ priorScriptArtifactId: "601" });
    expect((result.script as any).product_tie_in_plan.tie_ins).toEqual([]);
    expect(result.staleStages).toEqual([]); // mocked VerticalDramaEpisodePipeline.downstreamStages -> []
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryKind: "product_tie_in_usage",
        payload: { deferred: true, fromEpisodeNumber: 7 },
        idempotencyKey: "defer-key-1",
      })
    );
  });

  it("computes scheduleAtRisk: true when the window falls short of the target and no future episodes remain", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithTieIn({ episodeNumber: 10 })])
      ) // loadOwnedEpisode — last episode
      .mockReturnValueOnce(
        selectChain([
          {
            productTieIn: {
              enabled: true,
              maxEpisodesWithTieInPerTenEpisodes: 3,
            },
            targetEpisodeCount: 10,
          },
        ])
      ) // schedule-risk series row
      .mockReturnValueOnce(selectChain([])); // loadSeriesTieInPlacementHistory -> no other placements in window
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 501 }]))
      .mockReturnValueOnce(insertChain([{ id: 601 }]));
    mockDb.update
      .mockReturnValueOnce(updateChain([]))
      .mockReturnValueOnce(updateChain([]));

    const result = await router.deferEpisodeTieIn({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.scheduleAtRisk).toBe(true);
  });

  it("computes scheduleAtRisk: false when future episodes remain to reschedule into", async () => {
    mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
    mockDb.select
      .mockReturnValueOnce(
        selectChain([episodeRowWithTieIn({ episodeNumber: 3 })])
      ) // not the last episode
      .mockReturnValueOnce(
        selectChain([
          {
            productTieIn: {
              enabled: true,
              maxEpisodesWithTieInPerTenEpisodes: 3,
            },
            targetEpisodeCount: 10,
          },
        ])
      )
      .mockReturnValueOnce(selectChain([]));
    mockDb.insert
      .mockReturnValueOnce(insertChain([{ id: 501 }]))
      .mockReturnValueOnce(insertChain([{ id: 601 }]));
    mockDb.update
      .mockReturnValueOnce(updateChain([]))
      .mockReturnValueOnce(updateChain([]));

    const result = await router.deferEpisodeTieIn({
      ctx: ctx(),
      input: { seriesId: "10", episodeId: "100" },
    });

    expect(result.scheduleAtRisk).toBe(false);
  });

  describe("F131Y `verticalDramaSeriesTieInReplan` real proposal path (task #31)", () => {
    const TIE_IN_REPLAN_FLAGS = {
      ...TIE_IN_QC_FLAGS,
      verticalDramaSeriesTieInReplan: true,
    } as any;

    it("flag off: result.proposal and result.reason are both undefined (grandfather, byte-identical)", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_QC_FLAGS);
      mockDb.select
        .mockReturnValueOnce(
          selectChain([episodeRowWithTieIn({ episodeNumber: 3 })])
        )
        .mockReturnValueOnce(
          selectChain([
            {
              productTieIn: {
                enabled: true,
                maxEpisodesWithTieInPerTenEpisodes: 3,
              },
              targetEpisodeCount: 10,
            },
          ])
        )
        .mockReturnValueOnce(selectChain([]));
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 501 }]))
        .mockReturnValueOnce(insertChain([{ id: 601 }]));
      mockDb.update
        .mockReturnValueOnce(updateChain([]))
        .mockReturnValueOnce(updateChain([]));

      const result = await router.deferEpisodeTieIn({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(result.proposal).toBeUndefined();
      expect(result.reason).toBeUndefined();
      expect(mockGetActiveBreakdown).not.toHaveBeenCalled();
    });

    it("flag on + legacy series (no tieIn on any item) bootstraps a season plan and persists a real arc_replan_proposal", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_REPLAN_FLAGS);
      mockGetActiveBreakdown.mockReturnValueOnce(season(10));
      mockDb.select
        .mockReturnValueOnce(
          selectChain([episodeRowWithTieIn({ episodeNumber: 5 })])
        ) // loadOwnedEpisode
        .mockReturnValueOnce(
          selectChain(
            [1, 2, 3, 4, 5].map(n => ({
              episodeNumber: n,
              script: { episode_title: `Episode ${n}` },
            }))
          )
        ) // loadProducedEpisodeNumbers -> [1,2,3,4,5]
        .mockReturnValueOnce(
          selectChain([
            {
              bible: { episodeBreakdown: season(10) },
              productTieIn: {
                enabled: true,
                maxEpisodesWithTieInPerTenEpisodes: 3,
              },
              targetEpisodeCount: 10,
            },
          ])
        ); // seriesRowForReplan
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 501 }]))
        .mockReturnValueOnce(insertChain([{ id: 601 }]));
      mockDb.update
        .mockReturnValueOnce(updateChain([]))
        .mockReturnValueOnce(updateChain([]));

      const result = await router.deferEpisodeTieIn({
        ctx: ctx(),
        input: {
          seriesId: "10",
          episodeId: "100",
          idempotencyKey: "defer-key-2",
        },
      });

      expect(result.scheduleAtRisk).toBe(false);
      expect(result.reason).toBeUndefined();
      expect(result.proposal).toBeDefined();
      expect(result.proposal?.targetEpisodeNumber).toBeGreaterThan(5);

      expect(mockAppendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          memoryKind: "arc_replan_proposal",
          idempotencyKey: "defer-key-2:arc-replan-proposal",
          payload: expect.objectContaining({
            triggeredByEpisodeNumber: 5,
            driftReasons: ["VD_ARC_TIE_IN_DEFERRED"],
            status: "proposed",
            affectedEpisodeNumbers: expect.arrayContaining([5]),
          }),
        })
      );
      const proposalCall = mockAppendEvent.mock.calls.find(
        (call: any[]) => call[0]?.memoryKind === "arc_replan_proposal"
      );
      const proposedBreakdown = proposalCall?.[0]?.payload
        ?.proposedBreakdown as Array<{
        episodeNumber: number;
      }>;
      expect(proposedBreakdown).toHaveLength(10); // whole-season bootstrap, not just the 2 touched episodes
    });

    it("flag on + no eligible future episode: falls back to scheduleAtRisk with reason 'no_future_slot'", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_REPLAN_FLAGS);
      mockGetActiveBreakdown.mockReturnValueOnce(season(10));
      mockDb.select
        .mockReturnValueOnce(
          selectChain([episodeRowWithTieIn({ episodeNumber: 10 })])
        ) // last episode
        .mockReturnValueOnce(selectChain([])) // loadProducedEpisodeNumbers -> []
        .mockReturnValueOnce(
          selectChain([
            {
              bible: { episodeBreakdown: season(10) },
              productTieIn: {
                enabled: true,
                maxEpisodesWithTieInPerTenEpisodes: 3,
              },
              targetEpisodeCount: 10,
            },
          ])
        ) // seriesRowForReplan
        .mockReturnValueOnce(
          selectChain([
            {
              productTieIn: {
                enabled: true,
                maxEpisodesWithTieInPerTenEpisodes: 3,
              },
              targetEpisodeCount: 10,
            },
          ])
        ) // fallback seriesRowForSchedule
        .mockReturnValueOnce(selectChain([])); // fallback loadSeriesTieInPlacementHistory
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 501 }]))
        .mockReturnValueOnce(insertChain([{ id: 601 }]));
      mockDb.update
        .mockReturnValueOnce(updateChain([]))
        .mockReturnValueOnce(updateChain([]));

      const result = await router.deferEpisodeTieIn({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(result.proposal).toBeUndefined();
      expect(result.reason).toBe("no_future_slot");
      expect(result.scheduleAtRisk).toBe(true); // fallback to the pre-#31 signal
    });

    it("flag on but tie-in disabled at the series level: never calls getActiveBreakdown, falls back to scheduleAtRisk logic", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue(TIE_IN_REPLAN_FLAGS);
      mockDb.select
        .mockReturnValueOnce(
          selectChain([episodeRowWithTieIn({ episodeNumber: 3 })])
        )
        .mockReturnValueOnce(selectChain([])) // loadProducedEpisodeNumbers -> []
        .mockReturnValueOnce(
          selectChain([
            { productTieIn: { enabled: false }, targetEpisodeCount: 10 },
          ])
        ) // seriesRowForReplan — disabled
        .mockReturnValueOnce(
          selectChain([
            { productTieIn: { enabled: false }, targetEpisodeCount: 10 },
          ])
        ); // fallback seriesRowForSchedule
      // fallback scheduleAtRisk short-circuits (scheduleTieInConfig.enabled === false) — no further select.
      mockDb.insert
        .mockReturnValueOnce(insertChain([{ id: 501 }]))
        .mockReturnValueOnce(insertChain([{ id: 601 }]));
      mockDb.update
        .mockReturnValueOnce(updateChain([]))
        .mockReturnValueOnce(updateChain([]));

      const result = await router.deferEpisodeTieIn({
        ctx: ctx(),
        input: { seriesId: "10", episodeId: "100" },
      });

      expect(mockGetActiveBreakdown).not.toHaveBeenCalled();
      expect(result.proposal).toBeUndefined();
      expect(result.scheduleAtRisk).toBe(false);
    });
  });
});
