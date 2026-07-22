/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 11 §5.3. New file, additive to the shipped
 * `AutoStoryboardReviewPlanSummary.test.tsx` and
 * `AutoStoryboardReviewPlanSummary.imageJobs.test.tsx` (both run alongside
 * this file, never edited — regression tripwire).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildHyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import { buildHyperframesFeatureAccessProjection } from "@shared/hyperframes/featureAccess";
import { AutoStoryboardReviewPlanSummary } from "../AutoStoryboardReviewPlanSummary";

function planWithStrategy(
  frameStrategy: "storyboard_3x3_split" | "video_shot_start_stop" | "sequential_shot_storyboard"
) {
  return buildHyperframesAutoStoryboardReviewPlan({
    productId: "product_1",
    tenantId: "tenant_1",
    userId: 1,
    access: buildHyperframesFeatureAccessProjection({
      tenantId: "tenant_1",
      userId: 1,
      flags: {
        enabled: true,
        tenantAllowed: true,
        workerEnabled: true,
        librarySaveEnabled: false,
        operatorEnabled: false,
        templateAllowlist: [],
      },
    }),
    overrides: { frameStrategy },
    now: new Date("2026-06-04T00:00:00.000Z"),
  });
}

describe("AutoStoryboardReviewPlanSummary — strategy card (Feature 136 §5.3)", () => {
  it("renders the 3x3 strategy label", () => {
    render(
      <AutoStoryboardReviewPlanSummary
        plan={planWithStrategy("storyboard_3x3_split")}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );
    expect(screen.getByText("Frames")).toBeTruthy();
    expect(screen.getByText("3x3 storyboard grid")).toBeTruthy();
  });

  it("renders the start/stop strategy label", () => {
    render(
      <AutoStoryboardReviewPlanSummary
        plan={planWithStrategy("video_shot_start_stop")}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );
    expect(screen.getByText("Start/stop frame pairs")).toBeTruthy();
  });

  it("renders the sequential strategy label in English", () => {
    render(
      <AutoStoryboardReviewPlanSummary
        plan={planWithStrategy("sequential_shot_storyboard")}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );
    expect(screen.getByText("Sequential 9 images")).toBeTruthy();
  });

  it("renders the sequential strategy label in Thai", () => {
    render(
      <AutoStoryboardReviewPlanSummary
        plan={planWithStrategy("sequential_shot_storyboard")}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="th"
      />
    );
    expect(screen.getByText("เฟรม")).toBeTruthy();
    expect(screen.getByText("9 ภาพต่อเนื่อง (Sequential)")).toBeTruthy();
  });
});
