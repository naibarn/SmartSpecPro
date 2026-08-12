import { describe, expect, it, vi } from "vitest";

vi.mock("../llmRouter", () => ({ executeWithFallback: vi.fn() }));
vi.mock("../creditService", () => ({
  hasEnoughCredits: vi.fn(), deductCredits: vi.fn(), calculateCreditsForLLM: vi.fn(),
}));
vi.mock("../rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(), getResetTime: vi.fn() },
}));
vi.mock("../skillFiles", () => ({
  resolveSkillDirCandidates: vi.fn(), resolveSkillManifestPath: vi.fn(),
}));
vi.mock("@smartspec/skills", () => ({ parseSkillFile: vi.fn() }));
vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    default: { ...actual, existsSync: vi.fn(), readFileSync: vi.fn() },
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});
vi.mock("../verticalDramaImproveScript", () => ({ resolveStartFramePlanModel: vi.fn() }));

import {
  carrySceneVisualStates,
  projectStartFramePlan,
  readSceneVisualStatesFromPlan,
  upsertSceneVisualState,
} from "../verticalDramaStartFrameGeneration";
import type { VdSceneVisualState } from "@shared/verticalDramaSeries/sceneContinuity";

function state(overrides: Partial<VdSceneVisualState> = {}): VdSceneVisualState {
  return {
    locationKey: "kitchen",
    membershipHash: "vd-scene-v1-test",
    revision: 1,
    lightingState: "late afternoon",
    fixedElements: [{ name: "window", placement: "left wall" }],
    spatialLayout: "table center",
    stagingAxis: "camera doorway side",
    wardrobeInScene: [],
    activeProps: [],
    paletteMood: "warm cream",
    timeJumpSuspected: false,
    coverageGaps: [],
    memberShotNumbers: [1, 2],
    plannedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

const rawPlan = {
  render_plan_summary: { image_model: "model-x" },
  start_frame_requests: [{
    shot_number: 1,
    prompt: "new prompt",
    negative_prompt: "new negative",
    reference_assets: [],
  }],
} as any;

describe("readSceneVisualStatesFromPlan", () => {
  it.each([null, "bad", [], {}, { sceneVisualStates: [] }])(
    "returns an empty record for unusable plan input %#",
    input => expect(readSceneVisualStatesFromPlan(input)).toEqual({}),
  );

  it("drops malformed entries and makes the record key authoritative", () => {
    expect(readSceneVisualStatesFromPlan({
      sceneVisualStates: { kitchen: state({ locationKey: "wrong" }), bad: { locationKey: "" } },
    })).toEqual({ kitchen: state() });
  });

  it("never throws for malformed nested jsonb", () => {
    const hostile = Object.create(null, { sceneVisualStates: { get: () => { throw new Error("bad"); } } });
    expect(readSceneVisualStatesFromPlan(hostile)).toEqual({});
  });
});

describe("carrySceneVisualStates", () => {
  it("returns undefined for absent or entirely unusable prior state", () => {
    expect(carrySceneVisualStates({})).toBeUndefined();
    expect(carrySceneVisualStates({ previous: { bad: { locationKey: "" } } })).toBeUndefined();
  });

  it("keeps identical membership regardless of order and preserves stale", () => {
    const prior = state({ memberShotNumbers: [2, 1], stale: true });
    expect(carrySceneVisualStates({
      previous: { kitchen: prior },
      sceneShotGroups: [{ locationKey: "kitchen", shotNumbers: [1, 2] }],
    })).toEqual({ kitchen: state({ stale: true }) });
  });

  it("drops changed generated state but keeps a manual state stale without rewriting membership", () => {
    expect(carrySceneVisualStates({
      previous: { kitchen: state() },
      sceneShotGroups: [{ locationKey: "kitchen", shotNumbers: [1, 2, 3] }],
    })).toBeUndefined();
    expect(carrySceneVisualStates({
      previous: { kitchen: state({ manualEdit: true }) },
      sceneShotGroups: [{ locationKey: "kitchen", shotNumbers: [1, 2, 3] }],
    })).toEqual({ kitchen: state({ manualEdit: true, stale: true }) });
  });

  it.each([undefined, []] as const)("treats unknown/empty membership as preserve-all %#", groups => {
    const prior = { zeta: state({ locationKey: "zeta" }), alpha: state({ locationKey: "alpha" }) };
    const carried = carrySceneVisualStates({ previous: prior, sceneShotGroups: groups });
    expect(carried).toEqual(prior);
    expect(Object.keys(carried!)).toEqual(["alpha", "zeta"]);
  });

  it("does not mutate inputs and is deterministic", () => {
    const prior = { kitchen: state({ manualEdit: true }) };
    const groups = [{ locationKey: "kitchen", shotNumbers: [1, 2, 3] }];
    const snapshot = structuredClone({ prior, groups });
    const first = carrySceneVisualStates({ previous: prior, sceneShotGroups: groups });
    expect(carrySceneVisualStates({ previous: prior, sceneShotGroups: groups })).toEqual(first);
    expect({ prior, groups }).toEqual(snapshot);
  });
});

describe("upsertSceneVisualState", () => {
  it("implements lazy first-write-wins", () => {
    expect(upsertSceneVisualState({ current: undefined, next: state(), origin: "lazy" })).toMatchObject({
      written: true,
    });
    expect(upsertSceneVisualState({ current: { kitchen: state() }, next: state(), origin: "lazy" }))
      .toMatchObject({ written: false, skippedReason: "already_present" });
  });

  it("protects manual state from planned writes unless forced", () => {
    const current = { kitchen: state({ manualEdit: true, stale: true }) };
    expect(upsertSceneVisualState({ current, next: state({ revision: 2 }), origin: "planned" }))
      .toMatchObject({ written: false, skippedReason: "manual_edit_protected" });
    expect(upsertSceneVisualState({ current, next: state({ revision: 2 }), origin: "planned", force: true }))
      .toEqual({ states: { kitchen: state({ revision: 2 }) }, written: true });
  });

  it("manual writes set manualEdit, clear stale, normalize the key, and preserve siblings", () => {
    const current = { bedroom: state({ locationKey: "bedroom" }) };
    const result = upsertSceneVisualState({
      current,
      next: state({ locationKey: " kitchen ", stale: true }),
      origin: "manual",
    });
    expect(result).toEqual({
      states: {
        bedroom: current.bedroom,
        kitchen: state({ manualEdit: true }),
      },
      written: true,
    });
    expect(current).toEqual({ bedroom: state({ locationKey: "bedroom" }) });
  });
});

describe("projectStartFramePlan scene state carry-over", () => {
  it("keeps omission byte-identical and never emits an empty key", () => {
    const omitted = projectStartFramePlan(rawPlan, "model-x");
    const explicit = projectStartFramePlan(rawPlan, "model-x", undefined, undefined, undefined, undefined, undefined);
    expect(explicit).toEqual(omitted);
    expect(Object.hasOwn(omitted, "sceneVisualStates")).toBe(false);
    expect(Object.hasOwn(projectStartFramePlan(rawPlan, "model-x", undefined, undefined, undefined, undefined, {}), "sceneVisualStates")).toBe(false);
  });

  it("emits carried state between prompt language and frames", () => {
    const result = projectStartFramePlan(
      rawPlan, "model-x", undefined, undefined, undefined, "th",
      { previous: { kitchen: state() }, sceneShotGroups: [{ locationKey: "kitchen", shotNumbers: [2, 1] }] },
    );
    expect(result.sceneVisualStates).toEqual({ kitchen: state() });
    expect(Object.keys(result)).toEqual([
      "mode", "selectedImageModelId", "imagePromptLanguage", "sceneVisualStates", "frames",
    ]);
  });

  it("does not expand the existing seven-field per-frame carry contract", () => {
    const previous = {
      shotNumber: 1,
      imagePrompt: "old",
      negativePrompt: "old negative",
      requiredCharacterRefs: [],
      productReferenceAssetIds: [9],
      productRefsCustomized: true,
      approvedMediaAssetId: 10,
      locationKey: "kitchen",
      canonicalShotSummary: "summary",
      angleGrid: { columns: 3 },
      angleGridAssetIds: [11],
      promptMode: "auto",
      promptSafetyAdjustments: ["old"],
      promptAnalysis: { old: true },
    } as any;
    const frame = projectStartFramePlan(rawPlan, "model-x", undefined, undefined, new Map([[1, previous]])).frames[0] as any;
    expect(frame).toMatchObject({
      productReferenceAssetIds: [9], productRefsCustomized: true,
      locationKey: "kitchen", canonicalShotSummary: "summary",
      angleGrid: { columns: 3 }, angleGridAssetIds: [11],
    });
    expect(frame).not.toHaveProperty("approvedMediaAssetId");
    expect(frame.imageStaleReason).toBe("prompt_changed");
    expect(frame).not.toHaveProperty("promptMode");
    expect(frame).not.toHaveProperty("promptSafetyAdjustments");
    expect(frame).not.toHaveProperty("promptAnalysis");
  });
});
