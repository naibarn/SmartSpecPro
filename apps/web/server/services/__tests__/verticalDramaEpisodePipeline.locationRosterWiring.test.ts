/**
 * Phase 2 of `planning/polished-toasting-gadget.md` (location visual bible,
 * dispatch 3/3) — coverage for `verticalDramaEpisodePipeline.ts`'s:
 *  - `generateRealStoryboard`'s real `existingLocations` query (Phase 1 added
 *    the `GenerateStoryboardShotgridParams.existingLocations` param + its
 *    prompt rendering, but every call site omitted it entirely since the
 *    roster table didn't exist yet — this is the query that makes it
 *    non-empty);
 *  - `runStage`'s `storyboard_shotgrid` branch calling
 *    `reconcileEpisodeLocations` right after the real storyboard persists,
 *    wrapped in its own try/catch so a reconciliation failure never fails
 *    the overall stage result.
 *
 * Mirrors `verticalDramaEpisodePipeline.distinctLocations.test.ts`'s (Phase
 * 1) mocking pattern for the `generateRealStoryboard` private-method tests;
 * the `runStage` integration test additionally mocks the DB insert/update
 * chains `writeRun`/`writeArtifact`/`ensurePendingCheckpoint` need, since no
 * existing test in this codebase exercises `runStage`'s real-generation
 * `storyboard_shotgrid` branch end-to-end yet.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
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

const {
  mockGenerateEpisodeScript,
  mockGenerateStoryboardShotgrid,
  mockGenerateStartFrameRenderPlan,
  mockResolveSceneContinuityLocks,
} = vi.hoisted(() => ({
  mockGenerateEpisodeScript: vi.fn(),
  mockGenerateStoryboardShotgrid: vi.fn(),
  mockGenerateStartFrameRenderPlan: vi.fn(),
  mockResolveSceneContinuityLocks: vi.fn(),
}));
vi.mock("../verticalDramaScriptGeneration", () => ({
  generateEpisodeScript: mockGenerateEpisodeScript,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  // Series memory Producer B (planning/vd-series-memory-and-lineage/
  // plan.md Stage 1.2) — best-effort no-op stub; the memory-write
  // wiring itself is covered by
  // verticalDramaScriptGeneration.episodeMemory.test.ts, not this file.
  resolveScriptEpisodeMemory: vi.fn(),
}));
vi.mock("../verticalDramaSeriesMemoryProjection", () => ({
  upsertEpisodeMemory: vi.fn(),
}));

vi.mock("../verticalDramaStoryboardGeneration", () => ({
  generateStoryboardShotgrid: mockGenerateStoryboardShotgrid,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
  VerticalDramaStoryboardPolicyRecoveryError: class extends Error {},
}));
vi.mock("../verticalDramaDialogueAudio", () => ({
  generateEpisodeDialogueAudioPlan: vi.fn(),
  buildDialogueAudioPlan: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaStartFrameGeneration", () => ({
  generateStartFrameRenderPlan: mockGenerateStartFrameRenderPlan,
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));
vi.mock("../verticalDramaSceneContinuityLock", () => ({
  resolveSceneContinuityLocks: mockResolveSceneContinuityLocks,
}));
const { mockGetTenantFeatureFlags } = vi.hoisted(() => ({
  mockGetTenantFeatureFlags: vi.fn(),
}));
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));
const { mockCaptureSeriesVisualSourceSnapshot } = vi.hoisted(() => ({
  mockCaptureSeriesVisualSourceSnapshot: vi.fn(),
}));
vi.mock("../verticalDramaVisualSourceSnapshotService", () => ({
  captureSeriesVisualSourceSnapshot: mockCaptureSeriesVisualSourceSnapshot,
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
const { mockListLocationRows } = vi.hoisted(() => ({
  mockListLocationRows: vi.fn(),
}));
vi.mock("../verticalDramaLocationStock", () => ({
  verticalDramaLocationStockService: { listRows: mockListLocationRows },
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

const { mockGetActiveBreakdown, mockReadItemShotDrafts, mockReadItemCliffhangerLine } = vi.hoisted(
  () => ({
    mockGetActiveBreakdown: vi.fn(),
    mockReadItemShotDrafts: vi.fn(),
    mockReadItemCliffhangerLine: vi.fn(),
  }),
);
vi.mock("../verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemShotDrafts: mockReadItemShotDrafts,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
}));

const { mockReconcileEpisodeLocations } = vi.hoisted(() => ({
  mockReconcileEpisodeLocations: vi.fn(),
}));
vi.mock("../verticalDramaLocationReconciliation", () => ({
  reconcileEpisodeLocations: mockReconcileEpisodeLocations,
}));

const { mockGenerateShotSceneIntent, mockApplyShotSceneIntent } = vi.hoisted(() => ({
  mockGenerateShotSceneIntent: vi.fn(),
  mockApplyShotSceneIntent: vi.fn(),
}));
vi.mock("../verticalDramaShotSceneIntent", () => ({
  generateVerticalDramaShotSceneIntent: mockGenerateShotSceneIntent,
  applyVerticalDramaShotSceneIntent: mockApplyShotSceneIntent,
  VerticalDramaShotSceneIntentReviewRequiredError: class extends Error {},
}));

const { mockDebugError } = vi.hoisted(() => ({
  mockDebugError: vi.fn(),
}));
vi.mock("../../_core/logger", () => ({
  debugError: mockDebugError,
  debugLog: vi.fn(),
}));

import {
  VerticalDramaEpisodePipeline,
  resetEpisodeStoryboardGenerationState,
  validateStagePayload,
} from "../verticalDramaEpisodePipeline";

const pipeline = new VerticalDramaEpisodePipeline() as any;

const owner = { tenantId: "tenant-1", userId: 42, seriesId: 10, episodeId: 100 };
const episode = {
  id: 100,
  title: "Episode 3",
  episodeNumber: 3,
  targetDurationSeconds: 60,
  script: null,
} as any;

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

beforeEach(() => {
  vi.clearAllMocks();
  mockDb.select.mockImplementation(() => selectChain([]));
  mockDb.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
    callback(mockDb)
  );
  mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue(null);
  mockGenerateStoryboardShotgrid.mockResolvedValue({
    storyboard: { shots: [] },
    creditsUsed: 1,
    model: "gpt-x",
  });
  mockGenerateStartFrameRenderPlan.mockResolvedValue({
    plan: { frames: [] },
    creditsUsed: 1,
    model: "gpt-x",
  });
  mockResolveSceneContinuityLocks.mockResolvedValue({
    blockByShotNumber: new Map(),
    locationKeyByShotNumber: new Map(),
    statesByLocationKey: {},
    newlyAuthoredByLocationKey: {},
    diagnostics: { sceneCount: 0, authoredCount: 0, authoringFailures: [] },
  });
  mockGetTenantFeatureFlags.mockResolvedValue({
    verticalDramaSceneContinuity: true,
  });
  mockGetPrimaryPortraitUrl.mockResolvedValue(null);
  mockListLocationRows.mockResolvedValue([]);
  mockGenerateShotSceneIntent.mockResolvedValue({
    intent: { shots: [] },
    creditsUsed: 0,
    model: "gpt-x",
  });
  mockApplyShotSceneIntent.mockImplementation(
    ({ storyboard }: { storyboard: { shots: unknown[] } }) => ({
      shots: storyboard.shots,
    }),
  );
  mockGetActiveBreakdown.mockReturnValue([]);
  mockReconcileEpisodeLocations.mockResolvedValue({ createdLocations: [], reusedLocations: [] });
});

/* -------------------------------------------------------------------------- */
/* generateRealStoryboard — real existingLocations query (step 4a)           */
/* -------------------------------------------------------------------------- */

describe("generateRealStoryboard — existingLocations real query (Phase 2 location visual bible)", () => {
  it("passes the series' location roster, mapped to {locationKey, name, description}, to generateStoryboardShotgrid", async () => {
    const rosterRows = [
      { locationKey: "loc_store", name: "ร้านสะดวกซื้อ", data: { description: "a store description" }, createdAt: new Date("2026-01-01"), primaryReferenceUrl: null },
      { locationKey: "loc_kitchen", name: "ครัวที่บ้าน", data: { description: "a kitchen description" }, createdAt: new Date("2026-01-02"), primaryReferenceUrl: null },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }])) // seriesRow
      .mockReturnValueOnce(selectChain([])) // characterRows
      .mockReturnValueOnce(selectChain([])); // alias rows (planning/vd-character-identity-repair/plan.md)
    mockListLocationRows.mockResolvedValueOnce(rosterRows);

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.existingLocations).toEqual([
      { locationKey: "loc_store", name: "ร้านสะดวกซื้อ", description: "a store description" },
      { locationKey: "loc_kitchen", name: "ครัวที่บ้าน", description: "a kitchen description" },
    ]);
  });

  it("falls back to the location's own name as description when data.description is missing", async () => {
    const rosterRows = [{ locationKey: "loc_store", name: "ร้านสะดวกซื้อ", data: null, createdAt: new Date("2026-01-01"), primaryReferenceUrl: null }];
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])); // alias rows (planning/vd-character-identity-repair/plan.md)
    mockListLocationRows.mockResolvedValueOnce(rosterRows);

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.existingLocations).toEqual([
      { locationKey: "loc_store", name: "ร้านสะดวกซื้อ", description: "ร้านสะดวกซื้อ" },
    ]);
  });

  it("passes existingLocations: undefined (byte-identical to before Phase 2) when the series has no roster rows yet", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])); // alias rows (planning/vd-character-identity-repair/plan.md)
    mockListLocationRows.mockResolvedValueOnce([]); // empty roster

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.existingLocations).toBeUndefined();
  });

  it("scopes the roster query to the caller's tenant + user + series", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])); // alias rows (planning/vd-character-identity-repair/plan.md)
    mockListLocationRows.mockResolvedValueOnce([]);

    await pipeline.generateRealStoryboard(owner, episode, false);

    expect(mockListLocationRows).toHaveBeenCalledWith({
      tenantId: owner.tenantId,
      userId: owner.userId,
      seriesId: owner.seriesId,
    });
  });

  it("uses the approved-image roster row as the canonical representative for front/parking aliases", async () => {
    const rosterRows = [
      {
        locationKey: "clinic-front",
        name: "หน้าคลินิก",
        data: { description: "clinic front" },
        createdAt: new Date("2026-01-01"),
        primaryReferenceUrl: null,
      },
      {
        locationKey: "clinic-front-parking",
        name: "ลานจอดรถหน้าคลินิก",
        data: { description: "clinic front parking" },
        createdAt: new Date("2026-01-02"),
        primaryReferenceUrl: "https://cdn.example/clinic.webp",
      },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));
    mockListLocationRows.mockResolvedValueOnce(rosterRows);

    await pipeline.generateRealStoryboard(owner, episode, false);

    expect(mockGenerateStoryboardShotgrid.mock.calls[0][0].existingLocations).toEqual([
      {
        locationKey: "clinic-front-parking",
        name: "ลานจอดรถหน้าคลินิก",
        description: "clinic front parking clinic front",
      },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* runStage — reconcileEpisodeLocations wiring (step 4b)                      */
/* -------------------------------------------------------------------------- */

function insertChain(rows: unknown[]) {
  const chain: any = {
    values: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

function updateChain(rows: unknown[] = []) {
  const chain: any = {
    set: vi.fn(() => chain),
    where: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

function deleteChain() {
  const chain: any = {
    where: vi.fn(() => Promise.resolve()),
  };
  return chain;
}

describe("resetEpisodeStoryboardGenerationState", () => {
  it("clears the episode storyboard and shot-level bindings while preserving master rows", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));
    mockDb.delete.mockImplementation(() => deleteChain());
    mockDb.update.mockReturnValue(updateChain());

    await expect(resetEpisodeStoryboardGenerationState(owner)).resolves.toEqual({
      reset: true,
    });

    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.delete).toHaveBeenCalledTimes(5);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    expect(mockDb.update.mock.results[0].value.set).toHaveBeenCalledWith(
      expect.objectContaining({
        storyboard: null,
        startFramePlan: null,
        dialogueAudioPlan: null,
        motionPromptPack: null,
        assemblyManifest: null,
        storyboardReviewId: null,
      })
    );
  });

  it("does not clear a newer storyboard rebuild that is already queued or running", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ id: 77 }]));

    await expect(resetEpisodeStoryboardGenerationState(owner)).resolves.toEqual({
      reset: false,
      activeRunId: 77,
    });

    expect(mockDb.delete).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});

const NINE_SHOTS = Array.from({ length: 9 }, (_, i) => ({ shot_number: i + 1, duration_seconds: 6 }));
const STORE_GROUP = {
  location_key: "loc_store",
  location_name: "ร้านสะดวกซื้อ",
  description: "a store",
  shot_numbers: [1, 2, 3],
};
const KITCHEN_GROUP = {
  location_key: "loc_kitchen",
  location_name: "ครัวที่บ้าน",
  description: "a kitchen",
  shot_numbers: [4, 5, 6, 7, 8, 9],
};

describe("generateRealStartFramePlan — optional scene continuity failures", () => {
  it("keeps the existing start-frame path when scene continuity is disabled", async () => {
    mockGetTenantFeatureFlags.mockResolvedValueOnce({
      verticalDramaSceneContinuity: false,
    });

    const result = await pipeline.generateRealStartFramePlan(owner, {
      ...episode,
      storyboard: {
        shots: [{ shot_number: 1, duration_seconds: 6, visual_description: "A store" }],
        distinct_locations: [STORE_GROUP],
      },
    });

    expect(mockResolveSceneContinuityLocks).not.toHaveBeenCalled();
    expect(mockGenerateStartFrameRenderPlan).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual([]);
  });

  it("keeps generating the start-frame plan and emits an advisory warning when a scene lock cannot be authored", async () => {
    mockResolveSceneContinuityLocks.mockResolvedValueOnce({
      blockByShotNumber: new Map(),
      locationKeyByShotNumber: new Map([[1, "loc_store"]]),
      statesByLocationKey: {},
      newlyAuthoredByLocationKey: {},
      diagnostics: {
        sceneCount: 1,
        authoredCount: 0,
        authoringFailures: [
          { locationKey: "loc_store", reason: "provider timeout" },
        ],
      },
    });

    const result = await pipeline.generateRealStartFramePlan(owner, {
      ...episode,
      storyboard: {
        shots: [{ shot_number: 1, duration_seconds: 6, visual_description: "A store" }],
        distinct_locations: [STORE_GROUP],
      },
    });

    expect(mockGenerateStartFrameRenderPlan).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VD_OPTIONAL_SCENE_CONTINUITY_SKIPPED",
          severity: "warning",
          targetStage: "start_frame_render_plan",
          repairable: false,
        }),
      ]),
    );
    expect(mockDebugError).toHaveBeenCalledWith(
      "vd_optional_scene_continuity",
      expect.stringContaining("continuing without locks"),
      expect.any(Array),
    );
  });

  it("continues with the start-frame plan when the optional continuity resolver itself throws", async () => {
    mockResolveSceneContinuityLocks.mockRejectedValueOnce(
      new Error("continuity resolver unavailable"),
    );

    const result = await pipeline.generateRealStartFramePlan(owner, {
      ...episode,
      storyboard: {
        shots: [{ shot_number: 1, duration_seconds: 6, visual_description: "A store" }],
        distinct_locations: [STORE_GROUP],
      },
    });

    expect(mockGenerateStartFrameRenderPlan).toHaveBeenCalledTimes(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VD_OPTIONAL_SCENE_CONTINUITY_SKIPPED",
          severity: "warning",
        }),
      ]),
    );
    expect(mockDebugError).toHaveBeenCalledWith(
      "vd_optional_scene_continuity",
      expect.stringContaining("continuing without locks"),
      expect.objectContaining({ message: "continuity resolver unavailable" }),
    );
  });
});

/**
 * Queue the exact `mockDb.select` sequence a successful
 * `runStage(owner, "storyboard_shotgrid", {mode: "full"})` consumes:
 * loadEpisode -> continuity-gate series row -> generateRealStoryboard's
 * seriesRow -> characterRows -> (planning/vd-character-identity-repair/plan.md)
 * alias rows. The location roster is supplied by the mocked stock service, so
 * no further selects happen on the
 * success path (`runQc` is a no-op via the default stub provider port; the
 * checkpoint bookkeeping below uses `insert`, not `select`).
 */
function queueRunStageSelects() {
  mockDb.select
    .mockReturnValueOnce(selectChain([episode])) // loadEpisode
    .mockReturnValueOnce(selectChain([])) // continuity-gate series row
    .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }])) // seriesRow
    .mockReturnValueOnce(selectChain([])) // characterRows
    .mockReturnValueOnce(selectChain([])); // alias rows (planning/vd-character-identity-repair/plan.md)
}

function setupWritePath() {
  mockDb.update.mockReturnValue(updateChain([{ id: owner.episodeId }]));
  mockDb.insert.mockReturnValue(insertChain([{ id: 1 }]));
}

describe("generated visual-plan compare-and-set persistence", () => {
  it("keeps a start-frame plan changed while its prompt call was running", async () => {
    const latestPlan = {
      frames: [{ shotNumber: 1, imagePrompt: "user-edited prompt" }],
    };
    mockDb.update.mockReturnValueOnce(updateChain([]));
    mockDb.select.mockReturnValueOnce(
      selectChain([{ startFramePlan: latestPlan }]),
    );

    const result = await pipeline.persistStartFramePlanIfCurrent(
      owner,
      { shots: [{ shot_number: 1, visual_description: "original" }] },
      { frames: [{ shotNumber: 1, imagePrompt: "prior prompt" }] },
      { frames: [{ shotNumber: 1, imagePrompt: "new generated prompt" }] },
    );

    expect(result).toEqual({ persisted: false, currentPlan: latestPlan });
    expect(mockDb.update.mock.results[0].value.set).toHaveBeenCalledWith(
      expect.objectContaining({
        startFramePlan: expect.objectContaining({
          frames: [{ shotNumber: 1, imagePrompt: "new generated prompt" }],
        }),
      }),
    );
  });

  it("keeps newer video prompt and source edits instead of persisting a stale pack", async () => {
    const latestPack = {
      clips: [{ clipNumber: 1, prompt: "user-edited motion" }],
    };
    mockDb.update.mockReturnValueOnce(updateChain([]));
    mockDb.select.mockReturnValueOnce(
      selectChain([{ motionPromptPack: latestPack }]),
    );

    const result = await pipeline.persistMotionPromptPackIfCurrent(
      owner,
      {
        storyboard: { shots: [{ shot_number: 1 }] },
        startFramePlan: { frames: [{ shotNumber: 1 }] },
        dialogueAudioPlan: { dialogueLines: [] },
        motionPromptPack: { clips: [{ clipNumber: 1, prompt: "old" }] },
      },
      { clips: [{ clipNumber: 1, prompt: "generated from the old snapshot" }] },
    );

    expect(result).toEqual({ persisted: false, currentPack: latestPack });
    expect(mockDb.update.mock.results[0].value.set).toHaveBeenCalledWith(
      expect.objectContaining({
        motionPromptPack: {
          clips: [{ clipNumber: 1, prompt: "generated from the old snapshot" }],
        },
      }),
    );
  });
});

describe("runStage — storyboard_shotgrid real-generation branch calls reconcileEpisodeLocations after persist (Phase 2 location visual bible)", () => {
  it("calls reconcileEpisodeLocations(owner, distinctLocations) with the camelCase-mapped groups right after the storyboard persists, and the stage still succeeds", async () => {
    queueRunStageSelects();
    setupWritePath();
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: { shots: NINE_SHOTS, distinct_locations: [STORE_GROUP, KITCHEN_GROUP] },
      creditsUsed: 3,
      model: "gpt-4o-mini",
    });

    const outcome = await pipeline.runStage(owner, "storyboard_shotgrid", { mode: "full" });

    expect(mockReconcileEpisodeLocations).toHaveBeenCalledTimes(1);
    expect(mockReconcileEpisodeLocations).toHaveBeenCalledWith(owner, [
      { locationKey: "loc_store", locationName: "ร้านสะดวกซื้อ", description: "a store", shotNumbers: [1, 2, 3] },
      {
        locationKey: "loc_kitchen",
        locationName: "ครัวที่บ้าน",
        description: "a kitchen",
        shotNumbers: [4, 5, 6, 7, 8, 9],
      },
    ]);
    expect(outcome.result.status).toBe("succeeded");
  });

  it("persists the canonical roster key returned by reconciliation for a situation-qualified legacy key", async () => {
    queueRunStageSelects();
    setupWritePath();
    const qualifiedGroup = {
      location_key: "location-2-visit1",
      location_name: "ศูนย์ควบคุมการปฏิบัติการบิน (ช่วงเช้า)",
      description: "flight control center during the morning crisis",
      shot_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    };
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: {
        shots: NINE_SHOTS,
        distinct_locations: [qualifiedGroup],
      },
      creditsUsed: 3,
      model: "gpt-4o-mini",
    });
    mockReconcileEpisodeLocations.mockResolvedValueOnce({
      createdLocations: [],
      reusedLocations: [
        {
          locationKey: "location-2",
          name: "ศูนย์ควบคุมการปฏิบัติการบิน",
        },
      ],
      locationBindings: [
        {
          incomingLocationKey: "location-2-visit1",
          incomingLocationName:
            "ศูนย์ควบคุมการปฏิบัติการบิน (ช่วงเช้า)",
          canonicalLocationKey: "location-2",
        },
      ],
    });

    const outcome = await pipeline.runStage(owner, "storyboard_shotgrid", {
      mode: "full",
    });

    const sharedUpdateChain = mockDb.update.mock.results[0].value;
    const storyboardWrites = sharedUpdateChain.set.mock.calls
      .map(([values]: [{ storyboard?: any }]) => values.storyboard)
      .filter(Boolean);
    expect(storyboardWrites).toHaveLength(2);
    expect(storyboardWrites[0].distinct_locations[0].location_key).toBe(
      "location-2-visit1"
    );
    expect(storyboardWrites[1].distinct_locations[0]).toMatchObject({
      location_key: "location-2",
      location_name: "ศูนย์ควบคุมการปฏิบัติการบิน (ช่วงเช้า)",
    });
    expect(outcome.result.status).toBe("succeeded");
  });

  it("keeps a newer user storyboard draft when generation finishes from an older snapshot", async () => {
    queueRunStageSelects();
    const latestStoryboard = {
      shots: NINE_SHOTS,
      editor_note: "saved while the planner was running",
    };
    mockDb.select.mockImplementation(() =>
      selectChain([{ storyboard: latestStoryboard }])
    );
    setupWritePath();
    mockDb.update.mockReturnValueOnce(updateChain());
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: { shots: NINE_SHOTS, distinct_locations: [STORE_GROUP] },
      creditsUsed: 3,
      model: "gpt-4o-mini",
    });

    const outcome = await pipeline.runStage(owner, "storyboard_shotgrid", {
      mode: "full",
    });

    expect(outcome.result.status).toBe("succeeded");
    expect(outcome.result.errors).toEqual([]);
    expect(outcome.result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VD_STORYBOARD_GENERATION_STALE",
          severity: "warning",
        }),
      ]),
    );
    expect(mockReconcileEpisodeLocations).not.toHaveBeenCalled();
    const storyboardArtifact = mockDb.insert.mock.results
      .flatMap(({ value }: { value: any }) => value.values.mock.calls)
      .map(([values]: [{ jsonPayload?: Record<string, unknown> }]) => values)
      .find(values => values.jsonPayload?.editor_note);
    expect(storyboardArtifact?.jsonPayload?.editor_note).toBe(
      latestStoryboard.editor_note,
    );
  });

  it("does not overwrite a user edit made during location reconciliation", async () => {
    queueRunStageSelects();
    const latestStoryboard = {
      shots: NINE_SHOTS,
      editor_note: "changed during reconciliation",
    };
    mockDb.select.mockImplementation(() =>
      selectChain([{ storyboard: latestStoryboard }])
    );
    setupWritePath();
    mockDb.update
      .mockReturnValueOnce(updateChain([{ id: owner.episodeId }]))
      .mockReturnValueOnce(updateChain());
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: {
        shots: NINE_SHOTS,
        distinct_locations: [
          {
            ...STORE_GROUP,
            location_key: "legacy_store_key",
            shot_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          },
        ],
      },
      creditsUsed: 3,
      model: "gpt-4o-mini",
    });
    mockReconcileEpisodeLocations.mockResolvedValueOnce({
      createdLocations: [],
      reusedLocations: [],
      locationBindings: [
        {
          incomingLocationKey: "legacy_store_key",
          incomingLocationName: STORE_GROUP.location_name,
          canonicalLocationKey: "canonical_store_key",
        },
      ],
    });

    const outcome = await pipeline.runStage(owner, "storyboard_shotgrid", {
      mode: "full",
    });

    expect(outcome.result.status).toBe("succeeded");
    expect(outcome.result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VD_STORYBOARD_GENERATION_STALE" }),
      ]),
    );
    const storyboardArtifact = mockDb.insert.mock.results
      .flatMap(({ value }: { value: any }) => value.values.mock.calls)
      .map(([values]: [{ jsonPayload?: Record<string, unknown> }]) => values)
      .find(values => values.jsonPayload?.editor_note);
    expect(storyboardArtifact?.jsonPayload?.editor_note).toBe(
      latestStoryboard.editor_note,
    );
  });

  it("calls reconcileEpisodeLocations with an empty array when the storyboard has no distinct_locations", async () => {
    queueRunStageSelects();
    setupWritePath();
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: { shots: NINE_SHOTS },
      creditsUsed: 3,
      model: "gpt-4o-mini",
    });

    const outcome = await pipeline.runStage(owner, "storyboard_shotgrid", { mode: "full" });

    expect(mockReconcileEpisodeLocations).toHaveBeenCalledWith(owner, []);
    expect(outcome.result.status).toBe("succeeded");
  });

  it("a reconciliation failure does NOT fail the overall storyboard stage result — best-effort, logged via debugError", async () => {
    queueRunStageSelects();
    setupWritePath();
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: { shots: NINE_SHOTS, distinct_locations: [STORE_GROUP, KITCHEN_GROUP] },
      creditsUsed: 3,
      model: "gpt-4o-mini",
    });
    mockReconcileEpisodeLocations.mockRejectedValueOnce(new Error("transient DB error"));

    const outcome = await pipeline.runStage(owner, "storyboard_shotgrid", { mode: "full" });

    // The reconciliation failure is swallowed — the storyboard itself
    // already generated and persisted successfully, so the stage result
    // must still read as a success, not a failure/repair state.
    expect(outcome.result.status).toBe("succeeded");
    expect(outcome.result.errors).toEqual([]);
    expect(mockDebugError).toHaveBeenCalledTimes(1);
    expect(mockDebugError.mock.calls[0][0]).toBe("vd_location_reconciliation");
  });

  it("keeps the generated storyboard when optional scene-intent planning times out", async () => {
    queueRunStageSelects();
    setupWritePath();
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: {
        shots: NINE_SHOTS,
        distinct_locations: [STORE_GROUP, KITCHEN_GROUP],
      },
      creditsUsed: 3,
      model: "gpt-4o-mini",
    });
    mockGenerateShotSceneIntent.mockRejectedValueOnce(
      new Error("planner timed out"),
    );

    const outcome = await pipeline.runStage(owner, "storyboard_shotgrid", {
      mode: "full",
    });

    const storyboardWrites = mockDb.update.mock.results[0].value.set.mock.calls
      .map(([values]: [{ storyboard?: any }]) => values.storyboard)
      .filter(Boolean);
    expect(storyboardWrites[0].shots).toEqual(NINE_SHOTS);
    expect(outcome.result.status).toBe("succeeded");
    expect(outcome.result.errors).toEqual([]);
    expect(outcome.result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VD_OPTIONAL_SCENE_INTENT_SKIPPED",
          severity: "warning",
        }),
      ]),
    );
    expect(mockGenerateStoryboardShotgrid).toHaveBeenCalledTimes(1);
    expect(mockGenerateShotSceneIntent).toHaveBeenCalledTimes(1);
    expect(mockDebugError.mock.calls[0][0]).toBe("vd_optional_scene_intent");
  });

  it("keeps the generated storyboard when the optional scene-intent service is unavailable", async () => {
    queueRunStageSelects();
    setupWritePath();
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: {
        shots: NINE_SHOTS,
        distinct_locations: [STORE_GROUP, KITCHEN_GROUP],
      },
      creditsUsed: 3,
      model: "gpt-4o-mini",
    });
    mockGenerateShotSceneIntent.mockRejectedValueOnce(
      new Error("scene-intent service unavailable"),
    );

    const outcome = await pipeline.runStage(owner, "storyboard_shotgrid", {
      mode: "full",
    });

    expect(outcome.result.status).toBe("succeeded");
    expect(outcome.result.errors).toEqual([]);
    expect(outcome.result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VD_OPTIONAL_SCENE_INTENT_SKIPPED",
          severity: "warning",
        }),
      ]),
    );
    expect(mockGenerateStoryboardShotgrid).toHaveBeenCalledTimes(1);
    expect(mockDebugError.mock.calls[0][0]).toBe("vd_optional_scene_intent");
  });

  it("falls back when the optional scene-intent candidate is rejected without losing its completed-call credit record", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([]));
    mockGenerateStoryboardShotgrid.mockResolvedValue({
      storyboard: { shots: NINE_SHOTS },
      creditsUsed: 3,
      model: "gpt-4o-mini",
      creditCharge: {
        amount: 3,
        model: "gpt-4o-mini",
        inputTokens: 10,
        outputTokens: 20,
        skillSlug: "vertical-drama-storyboard-shotgrid",
        description: "base storyboard",
      },
    });
    mockGenerateShotSceneIntent.mockResolvedValueOnce({
      intent: { shots: [] },
      creditsUsed: 2,
      model: "gpt-4o-mini",
      creditCharge: {
        amount: 2,
        model: "gpt-4o-mini",
        inputTokens: 5,
        outputTokens: 10,
        skillSlug: "vertical-drama-shot-scene-intent",
        description: "scene intent",
      },
    });
    mockApplyShotSceneIntent.mockImplementationOnce(() => {
      throw new Error("shot 1: model marked interpretation for review");
    });

    const result = await pipeline.generateRealStoryboard(owner, episode, false);

    expect(result.storyboard.shots).toEqual(NINE_SHOTS);
    expect(result.creditsUsed).toBe(5);
    expect(result.creditCharges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillSlug: "vertical-drama-storyboard-shotgrid" }),
        expect.objectContaining({ skillSlug: "vertical-drama-shot-scene-intent" }),
      ]),
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VD_OPTIONAL_SCENE_INTENT_SKIPPED",
          severity: "warning",
        }),
      ]),
    );
    expect(mockDebugError).toHaveBeenCalledWith(
      "vd_optional_scene_intent",
      expect.any(String),
      expect.objectContaining({
        message: expect.stringContaining("model marked interpretation for review"),
      }),
    );
    expect(mockGenerateStoryboardShotgrid).toHaveBeenCalledTimes(1);
  });

  it("dry_run mode never calls reconcileEpisodeLocations (no real generation override runs at all)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episode])); // loadEpisode only
    setupWritePath();

    await pipeline.runStage(owner, "storyboard_shotgrid", { mode: "dry_run" });

    expect(mockGenerateStoryboardShotgrid).not.toHaveBeenCalled();
    expect(mockReconcileEpisodeLocations).not.toHaveBeenCalled();
  });
});

describe("runStage — optional assurance remains advisory", () => {
  it.each([
    { name: "context unavailable", failsDuringCapture: false },
    { name: "snapshot timeout", failsDuringCapture: true },
  ])(
    "preserves the succeeded stage and persists a warning when assurance has $name",
    async ({ failsDuringCapture }) => {
      mockDb.select.mockReturnValueOnce(selectChain([episode]));
      setupWritePath();
      mockGetTenantFeatureFlags.mockResolvedValueOnce({
        verticalDramaPromptQcOrchestraActive: true,
        verticalDramaAssuranceKillSwitch: false,
      });
      if (failsDuringCapture) {
        mockCaptureSeriesVisualSourceSnapshot.mockRejectedValueOnce(
          new Error("snapshot timed out")
        );
      } else {
        mockCaptureSeriesVisualSourceSnapshot.mockResolvedValueOnce(null);
      }

      const outcome = await pipeline.runStage(owner, "start_frame_render_plan", {
        mode: "dry_run",
      });

      expect(outcome.result.status).toBe("succeeded");
      expect(outcome.result.next_action).toBe("resume_next_stage");
      expect(outcome.result.errors).toEqual([]);
      expect(outcome.result.warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "VD_ASSURANCE_ADVISORY_UNAVAILABLE",
            severity: "warning",
            repairable: false,
          }),
        ])
      );
      const runUpdate = mockDb.update.mock.results.at(-1)?.value;
      expect(runUpdate?.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "succeeded",
          nextAction: "resume_next_stage",
          warnings: expect.arrayContaining([
            expect.objectContaining({
              code: "VD_ASSURANCE_ADVISORY_UNAVAILABLE",
            }),
          ]),
          errors: [],
        })
      );
    }
  );
});
