import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../verticalDramaStartFrameGeneration", () => ({
  readSceneVisualStatesFromPlan: vi.fn(),
}));
vi.mock("../verticalDramaSceneVisualState", () => ({
  generateSceneVisualState: vi.fn(),
}));
vi.mock("../../_core/logger", () => ({
  debugError: vi.fn(),
}));

import { readSceneVisualStatesFromPlan } from "../verticalDramaStartFrameGeneration";
import { generateSceneVisualState } from "../verticalDramaSceneVisualState";
import {
  resolveSceneContinuityLocks,
  resolveShotSceneContinuityLock,
} from "../verticalDramaSceneContinuityLock";
import {
  computeSceneMembershipHash,
  type VdSceneVisualState,
} from "@shared/verticalDramaSeries/sceneContinuity";

const readStates = vi.mocked(readSceneVisualStatesFromPlan);
const authorState = vi.mocked(generateSceneVisualState);

function state(locationKey: string, membershipHash: string): VdSceneVisualState {
  return {
    locationKey,
    membershipHash,
    revision: 1,
    lightingState: "late afternoon",
    fixedElements: [{ name: "counter", placement: "north wall" }],
    spatialLayout: "tables face the window",
    stagingAxis: "window to door",
    wardrobeInScene: [],
    activeProps: [],
    paletteMood: "warm cream",
    timeJumpSuspected: false,
    coverageGaps: [],
    memberShotNumbers: [1, 2],
    plannedAt: "2026-08-01T00:00:00.000Z",
  };
}

function params(overrides: Partial<Parameters<typeof resolveSceneContinuityLocks>[0]> = {}) {
  return {
    enabled: true,
    tenantId: "tenant-1",
    userId: 1,
    seriesId: 2,
    episodeId: 3,
    storyboard: {
      shots: [
        { shot_number: 1, summary: "enter" },
        { shot_number: 2, summary: "sit" },
        { shot_number: 3, summary: "leave" },
      ],
      distinct_locations: [
        { location_key: "cafe", location_name: "Cafe", description: "small cafe", shot_numbers: [1, 2] },
        { location_key: "street", location_name: "Street", description: "quiet street", shot_numbers: [3] },
      ],
    },
    startFramePlan: null,
    shotNumbers: [1, 2, 3],
    authorIfMissing: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  readStates.mockReturnValue({});
});

describe("verticalDramaSceneContinuityLock", () => {
  it("returns before reading state or importing the authoring service when disabled", async () => {
    const result = await resolveSceneContinuityLocks(params({ enabled: false }));
    expect(result.blockByShotNumber.size).toBe(0);
    expect(result.diagnostics.sceneCount).toBe(0);
    expect(readStates).not.toHaveBeenCalled();
    expect(authorState).not.toHaveBeenCalled();
  });

  it("renders only a matching non-stale stored state and keeps shot-to-scene identity", async () => {
    const first = await resolveSceneContinuityLocks(params({ shotNumbers: [1] }));
    const locationKey = first.locationKeyByShotNumber.get(1)!;
    const membershipHash = computeSceneMembershipHash({
      episodeId: 3,
      locationKey,
      memberShotNumbers: [1, 2],
      canonicalSummariesByShotNumber: new Map([[1, "enter"], [2, "sit"]]),
    });
    readStates.mockReturnValue({ cafe: state("cafe", membershipHash) });
    const result = await resolveSceneContinuityLocks(params({ shotNumbers: [1] }));
    expect(result.locationKeyByShotNumber.get(1)).toBe("cafe");
    expect(result.blockByShotNumber.get(1)).toContain("SCENE CONTINUITY LOCK");
    expect(result.blockByShotNumber.get(2)).toBeUndefined();
    expect(authorState).not.toHaveBeenCalled();
  });

  it("authors once per missing scene and captures authoring failure without throwing", async () => {
    authorState
      .mockResolvedValueOnce({ state: state("cafe", "unused") } as any)
      .mockRejectedValueOnce(new Error("provider timeout"));
    const result = await resolveSceneContinuityLocks(params({ authorIfMissing: true }));
    expect(authorState).toHaveBeenCalledTimes(2);
    expect(result.diagnostics.authoredCount).toBe(1);
    expect(result.diagnostics.authoringFailures).toEqual([
      { locationKey: "street", reason: "provider timeout" },
    ]);
    expect(result.locationKeyByShotNumber.get(3)).toBe("street");
  });

  it("does not overwrite a manual state and reports it as an eligible batch failure", async () => {
    readStates.mockReturnValue({
      cafe: state("cafe", "stale-hash"),
      street: { ...state("street", "stale-hash"), manualEdit: true },
    });
    authorState.mockResolvedValue({ state: state("cafe", "unused") } as any);
    const result = await resolveSceneContinuityLocks(params({ authorIfMissing: true }));
    expect(authorState).toHaveBeenCalledTimes(1);
    expect(result.diagnostics.authoringFailures).toEqual([
      { locationKey: "street", reason: "manual_edit_state_stale_or_membership_mismatch" },
    ]);
  });

  it("single-shot wrapper reports the matching scene key, not the first state key", async () => {
    const { shotNumbers: _ignored, ...wrapperParams } = params({ authorIfMissing: false });
    const result = await resolveShotSceneContinuityLock({ ...wrapperParams, shotNumber: 3 });
    expect(result.locationKey).toBe("street");
    expect(result.block).toBeUndefined();
  });
});
