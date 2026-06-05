import { describe, expect, it } from "vitest";

import type { HyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import {
  getUserSafeHyperframesRepairAction,
  resolveHyperframesRenderUiState,
  resolveHyperframesRenderRefetchInterval,
  resolveMarketplaceAutoReviewLaunchMode,
  shouldShowAutoStoryboardReviewSurface,
} from "./marketplaceHyperframesUiState";

function planWithAutoAccess(
  canAccessAuto: boolean
): HyperframesAutoStoryboardReviewPlan {
  return {
    access: {
      accessState: canAccessAuto ? "enabled" : "disabled",
      capabilities: {
        canAccessAuto,
      },
    },
  } as HyperframesAutoStoryboardReviewPlan;
}

describe("marketplaceHyperframesUiState", () => {
  it("shows the Auto surface only when the feature is accessible", () => {
    expect(shouldShowAutoStoryboardReviewSurface(null)).toBe(false);
    expect(
      shouldShowAutoStoryboardReviewSurface(null, { loading: true })
    ).toBe(true);
    expect(shouldShowAutoStoryboardReviewSurface(null, { error: true })).toBe(
      true
    );
    expect(shouldShowAutoStoryboardReviewSurface(planWithAutoAccess(false))).toBe(
      false
    );
    expect(shouldShowAutoStoryboardReviewSurface(planWithAutoAccess(true))).toBe(
      true
    );
  });

  it("falls back to Standard Order as the effective launch mode when Auto is unavailable", () => {
    expect(
      resolveMarketplaceAutoReviewLaunchMode({
        current: "auto_storyboard_review",
        plan: null,
        loading: true,
      })
    ).toBe("auto_storyboard_review");
    expect(
      resolveMarketplaceAutoReviewLaunchMode({
        current: "standard_order",
        plan: null,
        loading: true,
      })
    ).toBe("standard_order");
    expect(
      resolveMarketplaceAutoReviewLaunchMode({
        current: "auto_storyboard_review",
        plan: null,
        error: true,
      })
    ).toBe("auto_storyboard_review");
    expect(
      resolveMarketplaceAutoReviewLaunchMode({
        current: "standard_order",
        plan: null,
        error: true,
      })
    ).toBe("standard_order");
    expect(
      resolveMarketplaceAutoReviewLaunchMode({
        current: "auto_storyboard_review",
        plan: null,
      })
    ).toBe("standard_order");
    expect(
      resolveMarketplaceAutoReviewLaunchMode({
        current: "auto_storyboard_review",
        plan: planWithAutoAccess(false),
      })
    ).toBe("standard_order");
    expect(
      resolveMarketplaceAutoReviewLaunchMode({
        current: "auto_storyboard_review",
        plan: planWithAutoAccess(true),
      })
    ).toBe("auto_storyboard_review");
  });

  it("uses render polling guidance and stops on terminal or blocked projections", () => {
    expect(resolveHyperframesRenderRefetchInterval(null)).toBe(15_000);
    expect(
      resolveHyperframesRenderRefetchInterval({
        status: "rendering",
        polling: {
          recommendedIntervalMs: 5_000,
          maxIntervalMs: 30_000,
          stopWhenStatus: ["completed"],
          staleAfterMs: 15_000,
          terminalState: false,
        },
      } as never)
    ).toBe(5_000);
    expect(
      resolveHyperframesRenderRefetchInterval({
        status: "completed",
        polling: {
          recommendedIntervalMs: 30_000,
          maxIntervalMs: 30_000,
          stopWhenStatus: ["completed"],
          staleAfterMs: 120_000,
          terminalState: true,
        },
      } as never)
    ).toBe(false);
    expect(
      resolveHyperframesRenderRefetchInterval({
        status: "not_available",
        polling: {
          recommendedIntervalMs: 5_000,
          maxIntervalMs: 30_000,
          stopWhenStatus: ["completed"],
          staleAfterMs: 15_000,
          terminalState: false,
        },
      } as never)
    ).toBe(false);
    expect(
      resolveHyperframesRenderRefetchInterval({
        status: "blocked_needs_user",
        polling: {
          recommendedIntervalMs: 5_000,
          maxIntervalMs: 30_000,
          stopWhenStatus: ["completed"],
          staleAfterMs: 15_000,
          terminalState: false,
        },
      } as never)
    ).toBe(false);
    expect(
      resolveHyperframesRenderRefetchInterval({
        status: "template_disabled",
        polling: {
          recommendedIntervalMs: 5_000,
          maxIntervalMs: 30_000,
          stopWhenStatus: ["completed"],
          staleAfterMs: 15_000,
          terminalState: false,
        },
      } as never)
    ).toBe(false);
  });

  it("classifies blocked render statuses as terminal UI states without cancel", () => {
    expect(
      resolveHyperframesRenderUiState({
        render: {
          status: "not_available",
          repairActions: [],
          polling: { terminalState: false },
        } as never,
      })
    ).toMatchObject({
      state: "blocked",
      active: false,
      blocked: true,
      canCancel: false,
    });
    expect(
      resolveHyperframesRenderUiState({
        render: {
          status: "template_disabled",
          repairActions: [],
          polling: { terminalState: false },
        } as never,
      })
    ).toMatchObject({
      state: "blocked",
      active: false,
      blocked: true,
      canCancel: false,
    });
  });

  it("keeps active render statuses cancellable and filters operator-only repairs", () => {
    expect(
      resolveHyperframesRenderUiState({
        render: {
          status: "rendering",
          permissions: { canCancel: true, canRepair: false },
          repairActions: [],
          polling: { terminalState: false },
        } as never,
      })
    ).toMatchObject({
      state: "active",
      active: true,
      canCancel: true,
    });

    expect(
      getUserSafeHyperframesRepairAction({
        permissions: { canCancel: false, canRepair: true },
        repairActions: [
          {
            actionId: "operator_only",
            actionType: "rerun_layout_inspect",
            label: "Operator repair",
            safeDescription: "Requires support",
            requiresOperator: true,
            auditRequired: true,
            disabledReason: null,
          },
          {
            actionId: "disabled_user_action",
            actionType: "retry_worker_step",
            label: "Retry disabled",
            safeDescription: "Temporarily unavailable",
            requiresOperator: false,
            auditRequired: true,
            disabledReason: "Wait for support",
          },
          {
            actionId: "safe_retry",
            actionType: "retry_worker_step",
            label: "Retry worker step",
            safeDescription: "Retry safely",
            requiresOperator: false,
            auditRequired: true,
            disabledReason: null,
          },
        ],
      } as never)?.actionId
    ).toBe("safe_retry");

    expect(
      getUserSafeHyperframesRepairAction({
        permissions: { canCancel: false, canRepair: false },
        repairActions: [
          {
            actionId: "safe_retry",
            actionType: "retry_worker_step",
            label: "Retry worker step",
            safeDescription: "Retry safely",
            requiresOperator: false,
            auditRequired: true,
            disabledReason: null,
          },
        ],
      } as never)
    ).toBeNull();
  });
});
