/**
 * Phase 1 of `planning/polished-toasting-gadget.md` (location visual bible)
 * — coverage for `verticalDramaEpisodePipeline.ts`'s:
 *  - `validateStagePayload`'s new `distinct_locations` shot_numbers coverage
 *    check (gaps/overlaps rejection) — data-driven, unconditional (no
 *    feature flag; only runs when the payload actually carries
 *    `distinct_locations`);
 *  - `generateRealStartFramePlan`'s shot-mapping threading a `location` fact
 *    onto each `storyboardShots[]` entry from the storyboard's own
 *    `distinct_locations[]` groups, and omitting it entirely when no
 *    matching group exists (byte-identical regression guard).
 *
 * Mirrors `verticalDramaEpisodePipeline.sceneContracts.test.ts`'s mocking
 * pattern exactly.
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

const { mockGenerateStartFrameRenderPlan } = vi.hoisted(() => ({
  mockGenerateStartFrameRenderPlan: vi.fn(),
}));
vi.mock("../verticalDramaStartFrameGeneration", () => ({
  generateStartFrameRenderPlan: mockGenerateStartFrameRenderPlan,
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

const { mockDebugError } = vi.hoisted(() => ({ mockDebugError: vi.fn() }));
vi.mock("../../_core/logger", () => ({ debugError: mockDebugError }));

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

import { VerticalDramaEpisodePipeline, validateStagePayload } from "../verticalDramaEpisodePipeline";

const pipeline = new VerticalDramaEpisodePipeline() as any;

const owner = { tenantId: "tenant-1", userId: 42, seriesId: 10, episodeId: 100 };

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
  mockReadItemCliffhangerLine.mockReturnValue(undefined);
  mockGenerateStartFrameRenderPlan.mockResolvedValue({
    plan: { mode: "single_frame_per_shot", selectedImageModelId: "model-x", frames: [] },
    raw: {},
    creditsUsed: 1,
    model: "gpt-x",
  });
});

/* -------------------------------------------------------------------------- */
/* validateStagePayload — distinct_locations shot_numbers coverage check     */
/* -------------------------------------------------------------------------- */

function nineShots() {
  return Array.from({ length: 9 }, (_, i) => ({ shot_number: i + 1 }));
}

describe("validateStagePayload — storyboard_shotgrid distinct_locations coverage (Phase 1 location visual bible)", () => {
  it("byte-identical: a payload with no distinct_locations key runs no location check at all", () => {
    const result = validateStagePayload("storyboard_shotgrid", { shots: nineShots() });
    expect(result.valid).toBe(true);
  });

  it("passes a clean 1-9 partition split across 2 contiguous groups", () => {
    const payload = {
      shots: nineShots(),
      distinct_locations: [
        { location_key: "store", shot_numbers: [1, 2, 3] },
        { location_key: "kitchen", shot_numbers: [4, 5, 6, 7, 8, 9] },
      ],
    };
    const result = validateStagePayload("storyboard_shotgrid", payload);
    expect(result.valid).toBe(true);
  });

  it("passes a clean single group covering all 9 shots (the default one-location case)", () => {
    const payload = {
      shots: nineShots(),
      distinct_locations: [{ location_key: "boardroom", shot_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] }],
    };
    const result = validateStagePayload("storyboard_shotgrid", payload);
    expect(result.valid).toBe(true);
  });

  it("fails on a gap: shot 9 not covered by any location group", () => {
    const payload = {
      shots: nineShots(),
      distinct_locations: [
        { location_key: "store", shot_numbers: [1, 2, 3] },
        { location_key: "kitchen", shot_numbers: [4, 5, 6, 7, 8] },
      ],
    };
    const result = validateStagePayload("storyboard_shotgrid", payload);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        e => e.message.includes("gaps") && e.message.includes("shot(s) 9"),
      ),
    ).toBe(true);
    expect(result.errors[result.errors.length - 1].repairable).toBe(true);
  });

  it("fails on an overlap: shot 4 claimed by two location groups", () => {
    const payload = {
      shots: nineShots(),
      distinct_locations: [
        { location_key: "store", shot_numbers: [1, 2, 3, 4] },
        { location_key: "kitchen", shot_numbers: [4, 5, 6, 7, 8, 9] },
      ],
    };
    const result = validateStagePayload("storyboard_shotgrid", payload);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        e => e.message.includes("overlap") && e.message.includes("shot(s) 4"),
      ),
    ).toBe(true);
  });

  it("fails on BOTH a gap and an overlap simultaneously, reporting both", () => {
    // shot 5 claimed twice, shot 9 claimed by nobody.
    const payload = {
      shots: nineShots(),
      distinct_locations: [
        { location_key: "store", shot_numbers: [1, 2, 3, 4, 5] },
        { location_key: "kitchen", shot_numbers: [5, 6, 7, 8] },
      ],
    };
    const result = validateStagePayload("storyboard_shotgrid", payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("overlap"))).toBe(true);
    expect(result.errors.some(e => e.message.includes("gaps"))).toBe(true);
  });

  it("the shot-count check (exactly 9) still runs alongside the new location coverage check", () => {
    const payload = {
      shots: nineShots().slice(0, 8),
      distinct_locations: [{ location_key: "boardroom", shot_numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9] }],
    };
    const result = validateStagePayload("storyboard_shotgrid", payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("exactly 9 shots"))).toBe(true);
  });

  it("non-numeric/garbage shot_numbers entries are ignored, not crashed on, and still surface as a gap", () => {
    const payload = {
      shots: nineShots(),
      distinct_locations: [
        { location_key: "store", shot_numbers: [1, 2, 3, "not-a-number", null] },
        { location_key: "kitchen", shot_numbers: [4, 5, 6, 7, 8] },
      ],
    };
    const result = validateStagePayload("storyboard_shotgrid", payload);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.message.includes("shot(s) 9"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* generateRealStartFramePlan — location threading into storyboardShots[]    */
/* -------------------------------------------------------------------------- */

function seriesRow() {
  return { bible: null, locale: "th" };
}

const TWO_GROUP_STORYBOARD = {
  shots: Array.from({ length: 9 }, (_, i) => ({
    shot_number: i + 1,
    visual_description: `Shot ${i + 1} description`,
    camera: { shot_type: "medium", angle: "eye_level", movement: "static" },
    required_character_refs: ["char-1"],
    duration_seconds: 6,
  })),
  distinct_locations: [
    {
      location_key: "convenience_store_main",
      location_name: "ร้านสะดวกซื้อ (โซนของเด็ก)",
      description: "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน",
      shot_numbers: [1, 2, 3],
    },
    {
      location_key: "family_kitchen",
      location_name: "ครัวที่บ้าน",
      description: "ครัวขนาดกลาง โต๊ะไม้ตรงกลาง",
      shot_numbers: [4, 5, 6, 7, 8, 9],
    },
  ],
};

const NO_LOCATION_STORYBOARD = {
  shots: Array.from({ length: 9 }, (_, i) => ({
    shot_number: i + 1,
    visual_description: `Shot ${i + 1} description`,
    camera: { shot_type: "medium", angle: "eye_level", movement: "static" },
    required_character_refs: ["char-1"],
    duration_seconds: 6,
  })),
};

function baseEpisode(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    title: "Episode 3",
    episodeNumber: 3,
    targetDurationSeconds: 60,
    startFramePlan: null,
    storyboard: NO_LOCATION_STORYBOARD,
    ...over,
  };
}

describe("generateRealStartFramePlan — location threading (Phase 1 location visual bible)", () => {
  it("populates storyboardShots[].location for shots covered by a distinct_locations group, correctly split across both groups", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()])) // seriesRow
      .mockReturnValueOnce(selectChain([])); // characterIdentityRows

    await pipeline.generateRealStartFramePlan(
      owner,
      baseEpisode({ storyboard: TWO_GROUP_STORYBOARD }),
    );

    const callArgs = mockGenerateStartFrameRenderPlan.mock.calls[0][0];
    const shots = callArgs.storyboardShots as Array<{ shotNumber: number; location?: unknown }>;
    expect(shots).toHaveLength(9);

    // Shots 1-3 -> convenience store.
    for (const n of [1, 2, 3]) {
      const shot = shots.find(s => s.shotNumber === n)!;
      expect(shot.location).toEqual({
        name: "ร้านสะดวกซื้อ (โซนของเด็ก)",
        description: "แถวชั้นวางของเด็ก แสงไฟนีออนสีขาวจากเพดาน",
        hasReferenceImage: false,
      });
    }
    // Shots 4-9 -> family kitchen.
    for (const n of [4, 5, 6, 7, 8, 9]) {
      const shot = shots.find(s => s.shotNumber === n)!;
      expect(shot.location).toEqual({
        name: "ครัวที่บ้าน",
        description: "ครัวขนาดกลาง โต๊ะไม้ตรงกลาง",
        hasReferenceImage: false,
      });
    }
  });

  it("omits storyboardShots[].location entirely (not merely undefined) when the storyboard has no distinct_locations data", async () => {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStartFramePlan(owner, baseEpisode());

    const callArgs = mockGenerateStartFrameRenderPlan.mock.calls[0][0];
    const shots = callArgs.storyboardShots as Array<Record<string, unknown>>;
    expect(shots).toHaveLength(9);
    for (const shot of shots) {
      expect(shot.location).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(shot, "location")).toBe(false);
    }
  });

  it("omits location only for shots NOT covered by any group when distinct_locations is a partial/incomplete list", async () => {
    const partialStoryboard = {
      ...TWO_GROUP_STORYBOARD,
      distinct_locations: [
        {
          location_key: "convenience_store_main",
          location_name: "ร้านสะดวกซื้อ",
          description: "แถวชั้นวางของเด็ก",
          shot_numbers: [1, 2, 3],
        },
        // Shots 4-9 intentionally uncovered for this test.
      ],
    };
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([]));

    await pipeline.generateRealStartFramePlan(
      owner,
      baseEpisode({ storyboard: partialStoryboard }),
    );

    const callArgs = mockGenerateStartFrameRenderPlan.mock.calls[0][0];
    const shots = callArgs.storyboardShots as Array<{ shotNumber: number; location?: unknown }>;
    expect(shots.find(s => s.shotNumber === 1)!.location).toBeDefined();
    expect(shots.find(s => s.shotNumber === 4)!.location).toBeUndefined();
  });
});

describe("generateRealStartFramePlan — scene visual state carry-over", () => {
  const priorState = {
    locationKey: "convenience_store_main",
    membershipHash: "vd-scene-v1-test",
    revision: 1,
    lightingState: "cool fluorescent",
    fixedElements: [],
    spatialLayout: "aisles left to right",
    stagingAxis: "counter side",
    wardrobeInScene: [],
    activeProps: [],
    paletteMood: "cool white",
    timeJumpSuspected: false,
    coverageGaps: [],
    memberShotNumbers: [1, 2, 3],
    plannedAt: "2026-08-01T00:00:00.000Z",
  };

  function primeReads() {
    mockDb.select
      .mockReturnValueOnce(selectChain([seriesRow()]))
      .mockReturnValueOnce(selectChain([]));
  }

  it("passes raw state and groups built with pre-regeneration location overrides", async () => {
    primeReads();
    const rawStates = { convenience_store_main: priorState };
    await pipeline.generateRealStartFramePlan(owner, baseEpisode({
      storyboard: TWO_GROUP_STORYBOARD,
      startFramePlan: {
        sceneVisualStates: rawStates,
        frames: [{ shotNumber: 3, locationKey: "family_kitchen" }],
      },
    }));

    expect(mockGenerateStartFrameRenderPlan.mock.calls[0][0].sceneVisualStatesCarryOver).toEqual({
      previous: rawStates,
      sceneShotGroups: [
        { locationKey: "convenience_store_main", shotNumbers: [1, 2] },
        { locationKey: "family_kitchen", shotNumbers: [3, 4, 5, 6, 7, 8, 9] },
      ],
    });
  });

  it("omits the entire params key when legacy state is absent", async () => {
    primeReads();
    await pipeline.generateRealStartFramePlan(owner, baseEpisode());
    expect(mockGenerateStartFrameRenderPlan.mock.calls[0][0])
      .not.toHaveProperty("sceneVisualStatesCarryOver");
  });

  it("passes empty membership groups without interpreting them as deletion", async () => {
    primeReads();
    const rawStates = { convenience_store_main: priorState };
    await pipeline.generateRealStartFramePlan(owner, baseEpisode({
      startFramePlan: { sceneVisualStates: rawStates, frames: [] },
    }));
    expect(mockGenerateStartFrameRenderPlan.mock.calls[0][0].sceneVisualStatesCarryOver)
      .toEqual({ previous: rawStates, sceneShotGroups: [] });
  });

  it("logs dropped states best-effort without failing generation", async () => {
    primeReads();
    mockGenerateStartFrameRenderPlan.mockResolvedValueOnce({
      plan: { mode: "single_frame_per_shot", selectedImageModelId: "model-x", frames: [] },
      raw: {}, creditsUsed: 1, model: "gpt-x",
    });
    await expect(pipeline.generateRealStartFramePlan(owner, baseEpisode({
      storyboard: TWO_GROUP_STORYBOARD,
      startFramePlan: { sceneVisualStates: { convenience_store_main: priorState }, frames: [] },
    }))).resolves.toBeDefined();
    expect(mockDebugError).toHaveBeenCalledWith(
      "vd_scene_visual_state_carryover",
      expect.stringContaining("dropped=[convenience_store_main]"),
    );
  });
});
