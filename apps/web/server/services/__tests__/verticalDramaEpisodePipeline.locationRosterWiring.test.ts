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
}));
vi.mock("../verticalDramaDialogueAudio", () => ({
  generateEpisodeDialogueAudioPlan: vi.fn(),
  buildDialogueAudioPlan: vi.fn(),
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

const { mockDebugError } = vi.hoisted(() => ({
  mockDebugError: vi.fn(),
}));
vi.mock("../../_core/logger", () => ({
  debugError: mockDebugError,
  debugLog: vi.fn(),
}));

import { VerticalDramaEpisodePipeline, validateStagePayload } from "../verticalDramaEpisodePipeline";

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
  mockMemoryService.buildEpisodeMemoryBundle.mockResolvedValue(null);
  mockGenerateStoryboardShotgrid.mockResolvedValue({
    storyboard: { shots: [] },
    creditsUsed: 1,
    model: "gpt-x",
  });
  mockGetPrimaryPortraitUrl.mockResolvedValue(null);
  mockGetActiveBreakdown.mockReturnValue([]);
  mockReconcileEpisodeLocations.mockResolvedValue({ createdLocations: [], reusedLocations: [] });
});

/* -------------------------------------------------------------------------- */
/* generateRealStoryboard — real existingLocations query (step 4a)           */
/* -------------------------------------------------------------------------- */

describe("generateRealStoryboard — existingLocations real query (Phase 2 location visual bible)", () => {
  it("passes the series' location roster, mapped to {locationKey, name, description}, to generateStoryboardShotgrid", async () => {
    const rosterRows = [
      { locationKey: "loc_store", name: "ร้านสะดวกซื้อ", data: { description: "a store description" } },
      { locationKey: "loc_kitchen", name: "ครัวที่บ้าน", data: { description: "a kitchen description" } },
    ];
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }])) // seriesRow
      .mockReturnValueOnce(selectChain([])) // characterRows
      .mockReturnValueOnce(selectChain([])) // alias rows (planning/vd-character-identity-repair/plan.md)
      .mockReturnValueOnce(selectChain(rosterRows)); // NEW: location roster

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.existingLocations).toEqual([
      { locationKey: "loc_store", name: "ร้านสะดวกซื้อ", description: "a store description" },
      { locationKey: "loc_kitchen", name: "ครัวที่บ้าน", description: "a kitchen description" },
    ]);
  });

  it("falls back to the location's own name as description when data.description is missing", async () => {
    const rosterRows = [{ locationKey: "loc_store", name: "ร้านสะดวกซื้อ", data: null }];
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])) // alias rows (planning/vd-character-identity-repair/plan.md)
      .mockReturnValueOnce(selectChain(rosterRows));

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
      .mockReturnValueOnce(selectChain([])) // alias rows (planning/vd-character-identity-repair/plan.md)
      .mockReturnValueOnce(selectChain([])); // empty roster

    await pipeline.generateRealStoryboard(owner, episode, false);

    const callArgs = mockGenerateStoryboardShotgrid.mock.calls[0][0];
    expect(callArgs.existingLocations).toBeUndefined();
  });

  it("scopes the roster query to the caller's tenant + user + series", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }]))
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([])) // alias rows (planning/vd-character-identity-repair/plan.md)
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStoryboard(owner, episode, false);

    // The 4th select call is the location-roster query (3rd is now the
    // alias-rows query, planning/vd-character-identity-repair/plan.md) —
    // assert it ran (via .from()/.where() being invoked on the 4th chain
    // instance).
    expect(mockDb.select).toHaveBeenCalledTimes(4);
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
    where: vi.fn(() => Promise.resolve(rows)),
  };
  return chain;
}

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

/**
 * Queue the exact `mockDb.select` sequence a successful
 * `runStage(owner, "storyboard_shotgrid", {mode: "full"})` consumes:
 * loadEpisode -> generateRealStoryboard's seriesRow -> characterRows ->
 * (planning/vd-character-identity-repair/plan.md) alias rows -> (Phase 2)
 * location roster. No further selects happen on the success path (`runQc`
 * is a no-op via the default stub provider port; the checkpoint
 * bookkeeping below uses `insert`, not `select`).
 */
function queueRunStageSelects() {
  mockDb.select
    .mockReturnValueOnce(selectChain([episode])) // loadEpisode
    .mockReturnValueOnce(selectChain([{ bible: null, locale: "th", tone: null }])) // seriesRow
    .mockReturnValueOnce(selectChain([])) // characterRows
    .mockReturnValueOnce(selectChain([])) // alias rows (planning/vd-character-identity-repair/plan.md)
    .mockReturnValueOnce(selectChain([])); // location roster (existingLocations)
}

function setupWritePath() {
  mockDb.update.mockReturnValue(updateChain());
  mockDb.insert.mockReturnValue(insertChain([{ id: 1 }]));
}

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

  it("dry_run mode never calls reconcileEpisodeLocations (no real generation override runs at all)", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([episode])); // loadEpisode only
    setupWritePath();

    await pipeline.runStage(owner, "storyboard_shotgrid", { mode: "dry_run" });

    expect(mockGenerateStoryboardShotgrid).not.toHaveBeenCalled();
    expect(mockReconcileEpisodeLocations).not.toHaveBeenCalled();
  });
});
