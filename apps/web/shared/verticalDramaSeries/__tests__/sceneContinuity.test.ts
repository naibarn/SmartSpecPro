import { describe, expect, it } from "vitest";

import {
  VD_SCENE_ANCHOR_SOURCES,
  VD_SCENE_CONTINUITY_LOCK_HEADER,
  buildSceneShotGroups,
  computeSceneMembershipHash,
  findSceneShotGroupForShot,
  isSameSceneMembership,
  renderSceneContinuityLockBlock,
  resolveSceneVisualState,
  selectSceneContinuityAnchor,
  type VdSceneVisualState,
} from "../sceneContinuity";

function state(overrides: Partial<VdSceneVisualState> = {}): VdSceneVisualState {
  return {
    locationKey: "roof",
    membershipHash: "vd-scene-v1-current",
    revision: 1,
    lightingState: "late afternoon from camera left",
    fixedElements: [{ name: "water tank", placement: "rear right" }],
    spatialLayout: "door left, ledge right",
    stagingAxis: "camera remains south of the actors",
    wardrobeInScene: [{ character: "Aria", wardrobe: "navy jacket" }],
    activeProps: [{ name: "envelope", placement: "on ledge", fromShot: 2 }],
    paletteMood: "muted blue and concrete gray",
    timeJumpSuspected: false,
    coverageGaps: [],
    memberShotNumbers: [1, 2, 3],
    plannedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("scene grouping and identity", () => {
  it("partitions, merges same keys, applies overrides, and preserves first match", () => {
    const groups = buildSceneShotGroups({
      distinctLocations: [
        { location_key: "roof", shot_numbers: [3, 1, 2, 2] },
        { location_key: "room", shot_numbers: [2, 4] },
        { location_key: "roof", shot_numbers: [5] },
      ],
      overridesByShotNumber: new Map([[3, "room"], [4, " "]]),
    });
    expect(groups).toEqual([
      { locationKey: "roof", shotNumbers: [1, 2, 5] },
      { locationKey: "room", shotNumbers: [3, 4] },
    ]);
    expect(findSceneShotGroupForShot(groups, 3)?.locationKey).toBe("room");
    expect(findSceneShotGroupForShot(groups, 99)).toBeUndefined();
  });

  it("tolerates malformed input and rejects invalid shot numbers", () => {
    expect(buildSceneShotGroups({ distinctLocations: null })).toEqual([]);
    expect(buildSceneShotGroups({
      distinctLocations: [
        null,
        { location_key: "", shot_numbers: [1] },
        { location_key: "valid", shot_numbers: ["2", 0, -1, 2.5, "bad"] },
      ],
    })).toEqual([{ locationKey: "valid", shotNumbers: [2] }]);
  });

  it("compares membership as sets", () => {
    expect(isSameSceneMembership([3, 2, 2, 1], [1, 2, 3])).toBe(true);
    expect(isSameSceneMembership(undefined, [])).toBe(true);
    expect(isSameSceneMembership([], [1])).toBe(false);
  });

  it("computes a stable hash over every identity input", () => {
    const input = {
      episodeId: 10,
      locationKey: "roof",
      memberShotNumbers: [3, 1, 2, 2],
      locationAssetId: 77,
      canonicalSummariesByShotNumber: new Map([[1, "A"], [2, "B"], [3, "C"]]),
    };
    const hash = computeSceneMembershipHash(input);
    expect(hash).toMatch(/^vd-scene-v1-[0-9a-f]{16}$/);
    expect(computeSceneMembershipHash({ ...input, memberShotNumbers: [1, 2, 3] })).toBe(hash);
    expect(computeSceneMembershipHash({ ...input, locationAssetId: 78 })).not.toBe(hash);
    expect(computeSceneMembershipHash({
      ...input,
      canonicalSummariesByShotNumber: new Map([[1, "changed"], [2, "B"], [3, "C"]]),
    })).not.toBe(hash);
  });
});

describe("scene anchor selection", () => {
  const group = { locationKey: "roof", shotNumbers: [1, 2, 3] };

  it("prefers the nearest shot even when it has generated rather than approved canon", () => {
    expect(selectSceneContinuityAnchor({
      shotNumber: 3,
      group,
      currentPlanRevision: 4,
      approvedAssetIdByShotNumber: new Map([[1, 101]]),
      latestGeneratedAssetByShotNumber: new Map([[2, {
        mediaAssetId: 202,
        status: "succeeded",
        locationKey: "roof",
        planRevision: 4,
      }]]),
    })).toEqual({ anchorShotNumber: 2, mediaAssetId: 202, source: "latest_generated" });
  });

  it("prefers approved over generated for the same shot", () => {
    expect(selectSceneContinuityAnchor({
      shotNumber: 2,
      group,
      currentPlanRevision: "r1",
      approvedAssetIdByShotNumber: new Map([[1, 101]]),
      latestGeneratedAssetByShotNumber: new Map([[1, {
        mediaAssetId: 102,
        status: "succeeded",
        locationKey: "roof",
        planRevision: "r1",
      }]]),
    })?.source).toBe("approved");
  });

  it.each([
    [{ status: "failed", locationKey: "roof", planRevision: 4 }, "failed"],
    [{ status: "succeeded", locationKey: "room", planRevision: 4 }, "cross-scene"],
    [{ status: "succeeded", locationKey: "roof", planRevision: 3 }, "stale-plan"],
    [{ status: "succeeded", locationKey: "roof", planRevision: 4, rejected: true }, "rejected"],
    [{ status: "succeeded", locationKey: "roof", planRevision: 4, stale: true }, "stale"],
  ] as const)("rejects %s latest-generated candidates", (candidate) => {
    expect(selectSceneContinuityAnchor({
      shotNumber: 2,
      group,
      currentPlanRevision: 4,
      approvedAssetIdByShotNumber: new Map(),
      latestGeneratedAssetByShotNumber: new Map([[1, { mediaAssetId: 201, ...candidate }]]),
    })).toBeUndefined();
  });

  it("rejects invalid ids and never returns the shot itself", () => {
    expect(selectSceneContinuityAnchor({
      shotNumber: 1,
      group,
      currentPlanRevision: 1,
      approvedAssetIdByShotNumber: new Map([[1, 100], [0, Number.NaN]]),
      latestGeneratedAssetByShotNumber: new Map(),
    })).toBeUndefined();
  });
});

describe("scene state resolution and lock rendering", () => {
  it("resolves bounded persisted state and normalizes membership", () => {
    const resolved = resolveSceneVisualState({
      ...state(),
      memberShotNumbers: [3, "1", 2, 2, 0],
      fixedElements: [null, { name: "tank", placement: "right" }],
      manualEdit: true,
      stale: "false",
    });
    expect(resolved?.memberShotNumbers).toEqual([1, 2, 3]);
    expect(resolved?.fixedElements).toEqual([{ name: "tank", placement: "right" }]);
    expect(resolved?.manualEdit).toBe(true);
    expect(resolved?.stale).toBeUndefined();
  });

  it.each([null, 1, [], {}, { locationKey: " " }])("rejects unusable state", raw => {
    expect(resolveSceneVisualState(raw)).toBeUndefined();
  });

  it("renders only locked facts in fixed order when the membership hash matches", () => {
    expect(renderSceneContinuityLockBlock(state(), "vd-scene-v1-current")).toBe([
      VD_SCENE_CONTINUITY_LOCK_HEADER,
      "- Lighting: late afternoon from camera left",
      "- Fixed elements: water tank — rear right",
      "- Spatial layout: door left, ledge right",
      "- Staging axis: camera remains south of the actors",
      "- Wardrobe: Aria: navy jacket",
      "- Active props: envelope — on ledge (from shot 2)",
      "- Palette and mood: muted blue and concrete gray",
    ].join("\n"));
  });

  it("renders no lock for stale or mismatched membership", () => {
    expect(renderSceneContinuityLockBlock(state(), "different")).toBeUndefined();
    expect(renderSceneContinuityLockBlock(state({ stale: true }), "vd-scene-v1-current"))
      .toBeUndefined();
  });

  it("does not emit a lone header or metadata", () => {
    const empty = state({
      lightingState: "",
      fixedElements: [],
      spatialLayout: "",
      stagingAxis: "",
      wardrobeInScene: [],
      activeProps: [],
      paletteMood: "",
      coverageGaps: ["secret metadata"],
    });
    expect(renderSceneContinuityLockBlock(empty, empty.membershipHash)).toBeUndefined();
  });
});

describe("scene continuity constants", () => {
  it("keeps anchor sources and lock header frozen", () => {
    expect(VD_SCENE_ANCHOR_SOURCES).toEqual(["approved", "latest_generated"]);
    expect(VD_SCENE_CONTINUITY_LOCK_HEADER).toBe("SCENE CONTINUITY LOCK");
  });
});
