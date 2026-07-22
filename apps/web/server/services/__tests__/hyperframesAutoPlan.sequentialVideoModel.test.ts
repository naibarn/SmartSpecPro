/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 09 §4, T1 plan-surface cases. `buildHyperframesAutoPlanFromState`
 * is a pure, sync, DB-free builder (section-01 precedent for
 * `sequentialStoryboardEnabled`); this file exercises it directly with an
 * explicit `access` object, no DB mocking needed — mirrors
 * `marketplaceAutoReview.sequentialGate.test.ts`'s established pattern for
 * the exact same kind of plan-surface field.
 *
 * Spec: specs/feature/136-marketplace-auto-review-sequential-shot-storyboard/
 * sections/section-09-full-video.md §4/§5.2.
 */
import { describe, expect, it } from "vitest";

import { buildHyperframesAutoPlanFromState } from "../hyperframesAutoPlanService";
import { resolveHyperframesFeatureAccess } from "../hyperframesFeatureAccessService";
import {
  HyperframesBlockerCodeSchema,
  type HyperframesBlockerCode,
} from "@shared/hyperframes/contracts";
import { getHyperframesBlockerCopy } from "@shared/hyperframes/statusCopy";

const FIXED_NOW = new Date("2026-01-01T00:00:00.000Z");
const FIXED_AUTH = { userId: 1, tenantId: "tenant_1" } as const;
const FIXED_PRODUCT_BUNDLE = { images: ["https://example.com/product.png"] };
const BLOCKER_CODE: HyperframesBlockerCode =
  "sequential_video_model_no_start_frame";

function permissiveAccess() {
  return resolveHyperframesFeatureAccess({
    auth: FIXED_AUTH,
    productId: "product_1",
    flags: {
      enabled: true,
      tenantAllowed: true,
      workerEnabled: true,
      librarySaveEnabled: false,
      operatorEnabled: false,
      templateAllowlist: [],
    },
    now: FIXED_NOW,
  });
}

function buildPlan(overrides: {
  frameStrategyOverride?: string;
  outputModeOverride?: string;
  videoModelSupportsStartFrame?: boolean;
}) {
  return buildHyperframesAutoPlanFromState({
    auth: FIXED_AUTH,
    productId: "product_1",
    productBundle: FIXED_PRODUCT_BUNDLE,
    activeRun: null,
    access: permissiveAccess(),
    overrides: {
      ...(overrides.outputModeOverride
        ? { outputMode: overrides.outputModeOverride }
        : {}),
      ...(overrides.frameStrategyOverride
        ? { frameStrategy: overrides.frameStrategyOverride }
        : {}),
    },
    sequentialStoryboardEnabled: true,
    videoModelSupportsStartFrame: overrides.videoModelSupportsStartFrame,
    now: FIXED_NOW,
  } as any);
}

describe("Feature 136 section 09 T1 — sequential_video_model_no_start_frame plan blocker", () => {
  it("blocks (canStart: false) for sequential + full_video + an unsupported video model", () => {
    const plan = buildPlan({
      outputModeOverride: "full_video",
      frameStrategyOverride: "sequential_shot_storyboard",
      videoModelSupportsStartFrame: false,
    });

    expect(plan.defaults.outputMode).toBe("full_video");
    expect(plan.defaults.frameStrategy).toBe("sequential_shot_storyboard");
    expect(
      plan.blockers.some(blocker => blocker.code === BLOCKER_CODE)
    ).toBe(true);
    expect(
      plan.blockers.find(blocker => blocker.code === BLOCKER_CODE)?.severity
    ).toBe("blocking");
    expect(plan.canStart).toBe(false);
  });

  it("does not block for sequential + full_video + a supported video model; canStart unchanged", () => {
    const supportedPlan = buildPlan({
      outputModeOverride: "full_video",
      frameStrategyOverride: "sequential_shot_storyboard",
      videoModelSupportsStartFrame: true,
    });
    expect(
      supportedPlan.blockers.some(blocker => blocker.code === BLOCKER_CODE)
    ).toBe(false);

    const noFieldPlan = buildPlan({
      outputModeOverride: "full_video",
      frameStrategyOverride: "sequential_shot_storyboard",
    });
    expect(supportedPlan.canStart).toBe(noFieldPlan.canStart);
  });

  it("omitted videoModelSupportsStartFrame (legacy callers) ⇒ output deep-equals the call without the field", () => {
    const withField = buildHyperframesAutoPlanFromState({
      auth: FIXED_AUTH,
      productId: "product_1",
      productBundle: FIXED_PRODUCT_BUNDLE,
      activeRun: null,
      access: permissiveAccess(),
      overrides: {
        outputMode: "full_video",
        frameStrategy: "sequential_shot_storyboard",
      },
      sequentialStoryboardEnabled: true,
      videoModelSupportsStartFrame: undefined,
      now: FIXED_NOW,
    } as any);
    const withoutField = buildHyperframesAutoPlanFromState({
      auth: FIXED_AUTH,
      productId: "product_1",
      productBundle: FIXED_PRODUCT_BUNDLE,
      activeRun: null,
      access: permissiveAccess(),
      overrides: {
        outputMode: "full_video",
        frameStrategy: "sequential_shot_storyboard",
      },
      sequentialStoryboardEnabled: true,
      now: FIXED_NOW,
    } as any);

    expect(withField).toEqual(withoutField);
    expect(
      withField.blockers.some(blocker => blocker.code === BLOCKER_CODE)
    ).toBe(false);
  });

  it("never produces the blocker for a non-sequential strategy, even with an unsupported model", () => {
    const startStopPlan = buildPlan({
      outputModeOverride: "full_video",
      frameStrategyOverride: "video_shot_start_stop",
      videoModelSupportsStartFrame: false,
    });
    expect(
      startStopPlan.blockers.some(blocker => blocker.code === BLOCKER_CODE)
    ).toBe(false);
    expect(startStopPlan.canStart).toBe(true);

    const gridPlan = buildPlan({
      outputModeOverride: "full_video",
      frameStrategyOverride: "storyboard_3x3_split",
      videoModelSupportsStartFrame: false,
    });
    expect(
      gridPlan.blockers.some(blocker => blocker.code === BLOCKER_CODE)
    ).toBe(false);
  });

  it("never produces the blocker for sequential + storyboard_images, even with an unsupported model", () => {
    const plan = buildPlan({
      frameStrategyOverride: "sequential_shot_storyboard",
      videoModelSupportsStartFrame: false,
    });
    expect(plan.defaults.outputMode).toBe("storyboard_images");
    expect(
      plan.blockers.some(blocker => blocker.code === BLOCKER_CODE)
    ).toBe(false);
    expect(plan.canStart).toBe(true);
  });

  it("is a valid HyperframesBlockerCode with non-empty Thai copy", () => {
    expect(HyperframesBlockerCodeSchema.parse(BLOCKER_CODE)).toBe(
      BLOCKER_CODE
    );
    const copy = getHyperframesBlockerCopy(BLOCKER_CODE, "th");
    expect(copy.description.length).toBeGreaterThan(0);
    expect(/[฀-๿]/.test(copy.description)).toBe(true);
    expect(copy.label.length).toBeGreaterThan(0);
    expect(copy.nextAction && copy.nextAction.length).toBeGreaterThan(0);
  });
});
