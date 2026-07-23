/**
 * Quality-mode control promotion (2026-07-23 user feedback: the repair-
 * rounds selector was undiscoverable, and its worst-case credit impact was
 * never shown next to the Estimate tile). New file, additive to the
 * shipped `AutoStoryboardReviewPlanSummary.test.tsx` and
 * `AutoStoryboardReviewPlanSummary.imageJobs.test.tsx` (both run alongside
 * this file, never edited — regression tripwire).
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildHyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import { buildHyperframesFeatureAccessProjection } from "@shared/hyperframes/featureAccess";
import type { HyperframesCreditEstimate } from "@shared/hyperframes/contracts";
import { AutoStoryboardReviewPlanSummary } from "../AutoStoryboardReviewPlanSummary";

function creditEstimateFixture(
  overrides: Partial<HyperframesCreditEstimate> = {}
): HyperframesCreditEstimate {
  return {
    estimateRef: "hf_estimate_hf_input_preview",
    tenantId: "tenant_1",
    userId: 1,
    runId: "mar_1",
    renderIntent: "preview",
    compositionMode: "storyboard_motion_preview",
    costClass: "composition_preview",
    width: 1080,
    height: 1920,
    fps: 24,
    durationSeconds: 15,
    estimatedFrameCount: 360,
    estimatedRenderPixels: 746_496_000,
    estimatedStorageBytes: 12_000_000,
    profileMultiplier: 1,
    costClassMultiplier: 0.65,
    workerComplexityMultiplier: 1,
    estimatedCredits: 1,
    freePreviewApplied: true,
    quotaDecision: "free_preview_allowed",
    idempotencyKey:
      "hyperframes-credit:tenant_1:mar_1:preview:hf_input:1.0.0:generic_vertical_9_16",
    compositionEstimateRef:
      "hyperframes-credit:tenant_1:mar_1:preview:hf_input:1.0.0:generic_vertical_9_16",
    compositionReservationRef: null,
    compositionChargeRef: null,
    compositionRefundRef: null,
    ...overrides,
  };
}

function planWithEstimate(creditEstimate: HyperframesCreditEstimate | null) {
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
    creditEstimate,
    now: new Date("2026-06-04T00:00:00.000Z"),
  });
}

describe("AutoStoryboardReviewPlanSummary — quality-mode worst-case estimate", () => {
  it("renders no worst-case line when qualityModeRepairRounds is omitted (existing callers unaffected)", () => {
    const plan = planWithEstimate(creditEstimateFixture({ imageJobCount: 9 }));
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );

    expect(
      screen.queryByText(content => content.includes("if every shot needs"))
    ).toBeNull();
  });

  it("renders the EN worst-case line using imageJobCount x rounds", () => {
    const plan = planWithEstimate(creditEstimateFixture({ imageJobCount: 9 }));
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
        qualityModeRepairRounds={3}
      />
    );

    expect(
      screen.getByText(
        "typically ~9 images · up to 27 images if every shot needs a repair"
      )
    ).toBeTruthy();
  });

  it("renders the Thai worst-case line using imageJobCount x rounds", () => {
    const plan = planWithEstimate(creditEstimateFixture({ imageJobCount: 9 }));
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="th"
        qualityModeRepairRounds={4}
      />
    );

    expect(
      screen.getByText("ปกติ ~9 ภาพ · สูงสุด 36 ภาพ ถ้าต้องซ่อมทุกช็อต")
    ).toBeTruthy();
  });

  it("falls back to a typical count of 1 when imageJobCount is absent (non-sequential strategy)", () => {
    const plan = planWithEstimate(creditEstimateFixture());
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
        qualityModeRepairRounds={3}
      />
    );

    expect(
      screen.getByText(
        "typically ~1 image · up to 3 images if every shot needs a repair"
      )
    ).toBeTruthy();
  });

  it("renders no worst-case line when creditEstimate is null, even if qualityModeRepairRounds is provided", () => {
    const plan = planWithEstimate(null);
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
        qualityModeRepairRounds={3}
      />
    );

    expect(
      screen.queryByText(content => content.includes("if every shot needs"))
    ).toBeNull();
    expect(screen.getByText("Preview policy")).toBeTruthy();
  });

  it("renders the caller-provided qualityModeControl slot inside the Estimate tile", () => {
    const plan = planWithEstimate(creditEstimateFixture({ imageJobCount: 9 }));
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
        qualityModeControl={<div>QUALITY_MODE_SLOT</div>}
      />
    );

    expect(screen.getByText("QUALITY_MODE_SLOT")).toBeTruthy();
  });

  it("renders nothing extra when qualityModeControl is omitted", () => {
    const plan = planWithEstimate(creditEstimateFixture({ imageJobCount: 9 }));
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );

    expect(screen.queryByText("QUALITY_MODE_SLOT")).toBeNull();
  });
});
