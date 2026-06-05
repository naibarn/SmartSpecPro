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
    expect(screen.getAllByText("Auto selected")).not.toHaveLength(0);
    expect(screen.queryByText("marketplace_storyboard_motion_9x9_v1")).toBeNull();
  });

  it("shows Standard fallback when Auto is blocked", () => {
    const plan = readyPlan();
    const onStart = vi.fn();
    const onUseStandard = vi.fn();
    plan.blockers.push({
      code: "worker_disabled",
      severity: "blocking",
      copyId: "hyperframes.blocker.worker_disabled",
      safeMessage: "Worker unavailable",
      nextAction: "Use Standard Order",
      userActionRequired: false,
    });
    plan.canStart = false;
    plan.primaryAction = {
      actionId: "use_standard_order",
      label: "Use Standard Order",
      disabled: false,
      copyId: "hyperframes.action.use_standard_order",
    };
    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={onStart}
        onUseStandard={onUseStandard}
      />
    );

    expect(screen.getByText(/standard order remains available/i)).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: /use standard order/i })
    ).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /use standard order/i }));
    expect(onUseStandard).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("allows Resume Auto to open the active run without using Standard fallback", () => {
    const plan = readyPlan();
    const onStart = vi.fn();
    const onUseStandard = vi.fn();
    plan.activeRunId = "mar_active_1";
    plan.canStart = false;
    plan.primaryAction = {
      actionId: "resume_auto_storyboard_review",
      label: "Resume Auto Storyboard Review",
      disabled: false,
      copyId: "hyperframes.action.resume_auto_storyboard_review",
    };

    render(
      <AutoStoryboardReviewPlanSummary
        plan={plan}
        onStart={onStart}
        onUseStandard={onUseStandard}
      />
    );

    const button = screen.getByRole("button", {
      name: /resume auto storyboard review/i,
    });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onUseStandard).not.toHaveBeenCalled();
  });

  it("disables the primary Auto action while the plan is updating", () => {
    const onStart = vi.fn();
    render(
      <AutoStoryboardReviewPlanSummary
        plan={readyPlan()}
        updating
        onStart={onStart}
        onUseStandard={vi.fn()}
      />
    );

    const button = screen.getByRole("button", {
      name: /updating auto plan/i,
    });
    expect(screen.getByRole("status").textContent).toMatch(
      /updating auto plan/i
    );
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });

  it("uses Thai operational copy when locale is Thai", () => {
    render(
      <AutoStoryboardReviewPlanSummary
        plan={readyPlan()}
        locale="th"
        onStart={vi.fn()}
        onUseStandard={vi.fn()}
      />
    );

    expect(screen.getByText(/ระบบเลือก template/)).toBeTruthy();
    expect(screen.getByLabelText("แผน Auto Storyboard Review")).toBeTruthy();
    expect(screen.getByRole("button", { name: /สร้าง Auto Storyboard Review/i }))
      .toBeTruthy();
  });
});
