import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildHyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import { buildHyperframesFeatureAccessProjection } from "@shared/hyperframes/featureAccess";
import { AutoStoryboardReviewPlanSummary } from "../AutoStoryboardReviewPlanSummary";

function readyPlan() {
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
    now: new Date("2026-06-04T00:00:00.000Z"),
  });
}

describe("AutoStoryboardReviewPlanSummary", () => {
  it("starts Auto without requiring custom selectors", () => {
    const onStart = vi.fn();
    render(
      <AutoStoryboardReviewPlanSummary
        plan={readyPlan()}
        onStart={onStart}
        onUseStandard={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /create auto storyboard review/i }));
    expect(onStart).toHaveBeenCalled();
    expect(screen.getByText("marketplace_storyboard_motion_9x9_v1")).toBeTruthy();
  });

  it("shows Standard fallback when Auto is blocked", () => {
    const plan = readyPlan();
    plan.blockers.push({
      code: "worker_disabled",
      severity: "blocking",
      copyId: "hyperframes.blocker.worker_disabled",
      safeMessage: "Worker unavailable",
      nextAction: "Use Standard Order",
      userActionRequired: false,
    });
    plan.canStart = false;
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
      />
    );

    expect(screen.getByText(/standard order remains available/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /standard order/i })).toBeTruthy();
  });

  it("uses Thai operational copy when locale is Thai", () => {
    render(
      <AutoStoryboardReviewPlanSummary
        plan={null}
        locale="th"
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
      />
    );

    expect(screen.getByText(/ระบบเลือก template/)).toBeTruthy();
    expect(screen.getByText("นโยบาย preview")).toBeTruthy();
  });
});
