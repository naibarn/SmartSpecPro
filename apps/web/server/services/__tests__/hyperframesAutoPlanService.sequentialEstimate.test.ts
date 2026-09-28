/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 10 §4.3. New file.
 *
 * Drives `buildHyperframesAutoPlanFromState` (sync, DB-free) with the fixture
 * shape already used at `hyperframesAutoPlanService.test.ts:10-27`, plus
 * `sequentialStoryboardEnabled: true` (section 01 input) and
 * `overrides: { frameStrategy: "sequential_shot_storyboard" }`.
 *
 * HAZARD (section-10 spec §2.3a / §4.3): do NOT assert
 * `sequentialPlan.creditEstimate.estimatedCredits > gridPlan….estimatedCredits`
 * — at preview scale both `Math.ceil` to the same integer. Assert `>=` plus
 * the exact multiplier instead.
 */
import { describe, expect, it } from "vitest";

import {
  applyHyperframesAutoPlanOverrides,
  buildDefaultHyperframesAutoPlanDefaults,
} from "@shared/hyperframes/autoPlan";
import {
  buildHyperframesAutoPlanFromState,
  resolveHyperframesAutoPlanWorkerComplexityMultiplierForTest,
} from "../hyperframesAutoPlanService";

const FIXED_NOW = new Date("2026-06-04T00:00:00.000Z");

function baseInput() {
  return {
    auth: { userId: 1, tenantId: "tenant_1" },
    productId: "product_1",
    productBundle: {
      product: {
        title: "Product",
        selectedImageUrls: ["https://cdn.example.com/product.png"],
      },
    },
    accessInput: {
      flags: {
        enabled: true,
        tenantAllowed: true,
        workerEnabled: true,
      },
    },
    now: FIXED_NOW,
  };
}

describe("autoPlanWorkerComplexityMultiplier — sequential factor (Feature 136 §5.4)", () => {
  it.each([
    {
      qualityMode: "balanced" as const,
      shotCount: 9,
      frameStrategy: "storyboard_3x3_split" as const,
      expected: 1,
    },
    {
      qualityMode: "balanced" as const,
      shotCount: 9,
      frameStrategy: "video_shot_start_stop" as const,
      expected: 1.15,
    },
    {
      qualityMode: "balanced" as const,
      shotCount: 9,
      frameStrategy: "sequential_shot_storyboard" as const,
      expected: 1.1,
    },
    {
      qualityMode: "high" as const,
      shotCount: 9,
      frameStrategy: "sequential_shot_storyboard" as const,
      expected: 1.49,
    },
    {
      qualityMode: "fast" as const,
      shotCount: 9,
      frameStrategy: "sequential_shot_storyboard" as const,
      expected: 0.88,
    },
    {
      qualityMode: "balanced" as const,
      shotCount: 7,
      frameStrategy: "sequential_shot_storyboard" as const,
      expected: 0.86,
    },
    {
      qualityMode: "high" as const,
      shotCount: 7,
      frameStrategy: "video_shot_start_stop" as const,
      expected: 1.21, // existing pin (hyperframesAutoPlanService.test.ts) — must not move
    },
  ])(
    "quality=$qualityMode shotCount=$shotCount frameStrategy=$frameStrategy -> $expected",
    ({ qualityMode, shotCount, frameStrategy, expected }) => {
      const plan = buildHyperframesAutoPlanFromState({
        ...baseInput(),
        sequentialStoryboardEnabled: true,
        overrides: { qualityMode, shotCount, frameStrategy },
      });
      expect(plan.creditEstimate?.workerComplexityMultiplier).toBe(expected);
    }
  );

  it("resolveHyperframesAutoPlanWorkerComplexityMultiplierForTest matches the plan-derived multiplier (pure-function wiring check)", () => {
    const defaults = applyHyperframesAutoPlanOverrides({
      defaults: buildDefaultHyperframesAutoPlanDefaults(),
      overrides: { frameStrategy: "sequential_shot_storyboard", qualityMode: "high" },
    });
    expect(
      resolveHyperframesAutoPlanWorkerComplexityMultiplierForTest(defaults)
    ).toBe(1.49);
  });
});

describe("imageJobCount on the plan (Feature 136 §5.4)", () => {
  it("sequential plan carries imageJobCount === 9", () => {
    const plan = buildHyperframesAutoPlanFromState({
      ...baseInput(),
      sequentialStoryboardEnabled: true,
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });
    expect(plan.creditEstimate?.imageJobCount).toBe(9);
  });

  it("default (3x3) plan has no imageJobCount key", () => {
    const plan = buildHyperframesAutoPlanFromState(baseInput());
    expect(
      Object.prototype.hasOwnProperty.call(
        plan.creditEstimate ?? {},
        "imageJobCount"
      )
    ).toBe(false);
  });

  it("video_shot_start_stop plan has no imageJobCount key (deferred per spec §9)", () => {
    const plan = buildHyperframesAutoPlanFromState({
      ...baseInput(),
      overrides: { frameStrategy: "video_shot_start_stop" },
    });
    expect(
      Object.prototype.hasOwnProperty.call(
        plan.creditEstimate ?? {},
        "imageJobCount"
      )
    ).toBe(false);
  });

  it("flag-off safety: sequential override with sequentialStoryboardEnabled: false is sanitized away — multiplier 1, no imageJobCount, no cost surprise while dark", () => {
    const plan = buildHyperframesAutoPlanFromState({
      ...baseInput(),
      sequentialStoryboardEnabled: false,
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });
    expect(plan.defaults.frameStrategy).toBe("storyboard_3x3_split");
    expect(plan.creditEstimate?.workerComplexityMultiplier).toBe(1);
    expect(
      Object.prototype.hasOwnProperty.call(
        plan.creditEstimate ?? {},
        "imageJobCount"
      )
    ).toBe(false);
  });

  it("flag-off safety: sequential override with sequentialStoryboardEnabled omitted behaves identically to false", () => {
    const plan = buildHyperframesAutoPlanFromState({
      ...baseInput(),
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });
    expect(plan.defaults.frameStrategy).toBe("storyboard_3x3_split");
    expect(plan.creditEstimate?.workerComplexityMultiplier).toBe(1);
    expect(
      Object.prototype.hasOwnProperty.call(
        plan.creditEstimate ?? {},
        "imageJobCount"
      )
    ).toBe(false);
  });

  it("plan-hash stability: the sequential plan's planHash is stable across two identical calls with the same `now` (creditEstimate/imageJobCount never feeds the fingerprint)", () => {
    const input = {
      ...baseInput(),
      sequentialStoryboardEnabled: true,
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    };
    const planA = buildHyperframesAutoPlanFromState(input);
    const planB = buildHyperframesAutoPlanFromState(input);
    expect(planA.planHash).toBe(planB.planHash);
  });

  it("HAZARD guard: sequential vs grid credits at preview scale are >= (not necessarily >, both ceil to the same integer), while the multiplier itself does differ", () => {
    const gridPlan = buildHyperframesAutoPlanFromState(baseInput());
    const sequentialPlan = buildHyperframesAutoPlanFromState({
      ...baseInput(),
      sequentialStoryboardEnabled: true,
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });
    expect(sequentialPlan.creditEstimate?.estimatedCredits).toBeGreaterThanOrEqual(
      gridPlan.creditEstimate?.estimatedCredits ?? 0
    );
    expect(sequentialPlan.creditEstimate?.workerComplexityMultiplier).toBe(1.1);
    expect(gridPlan.creditEstimate?.workerComplexityMultiplier).toBe(1);
  });
});
