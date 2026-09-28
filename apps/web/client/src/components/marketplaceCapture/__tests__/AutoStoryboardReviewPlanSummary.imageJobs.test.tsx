/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 10 §4.4. New file. Clones the render harness from the existing
 * `AutoStoryboardReviewPlanSummary.test.tsx:8-27` and attaches a
 * `creditEstimate` fixture directly to the plan.
 *
 * The pre-existing `AutoStoryboardReviewPlanSummary.test.tsx` is left
 * untouched and is re-run alongside this file as part of the acceptance
 * checklist.
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

function planWithEstimate(
  creditEstimate: HyperframesCreditEstimate | null,
  locale?: "en" | "th"
) {
  return {
    plan: buildHyperframesAutoStoryboardReviewPlan({
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
    }),
    locale,
  };
}

describe("AutoStoryboardReviewPlanSummary — image job count (Feature 136 §5.6)", () => {
  it("renders the EN image-job line when imageJobCount = 9", () => {
    const { plan } = planWithEstimate(creditEstimateFixture({ imageJobCount: 9 }));
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );

    expect(
      screen.getByText(
        content => content.includes("9") && content.includes("image jobs")
      )
    ).toBeTruthy();
  });

  it("renders the Thai image-job line (contains 9 and ภาพ) when imageJobCount = 9", () => {
    const { plan } = planWithEstimate(creditEstimateFixture({ imageJobCount: 9 }));
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="th"
      />
    );

    expect(
      screen.getByText(
        content => content.includes("9") && content.includes("ภาพ")
      )
    ).toBeTruthy();
  });

  it("renders no image-job line when imageJobCount is absent, and keeps the credits line", () => {
    const { plan } = planWithEstimate(creditEstimateFixture());
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );

    expect(
      screen.queryByText(content => content.includes("image jobs"))
    ).toBeNull();
    expect(screen.getByText("1 credits est.")).toBeTruthy();
  });

  it("renders no image-job line when imageJobCount = 1, and keeps the credits line", () => {
    const { plan } = planWithEstimate(
      creditEstimateFixture({ imageJobCount: 1 })
    );
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );

    expect(
      screen.queryByText(content => content.includes("image jobs"))
    ).toBeNull();
    expect(screen.getByText("1 credits est.")).toBeTruthy();
  });

  it("renders no image-job line when creditEstimate is null, and falls back to the preview-policy label", () => {
    const { plan } = planWithEstimate(null);
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
        locale="en"
      />
    );

    expect(
      screen.queryByText(content => content.includes("image jobs"))
    ).toBeNull();
    expect(screen.getByText("Preview policy")).toBeTruthy();
  });
});
