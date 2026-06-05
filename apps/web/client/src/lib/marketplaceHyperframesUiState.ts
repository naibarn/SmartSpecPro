import type { HyperframesAutoStoryboardReviewPlan } from "@shared/hyperframes/autoPlan";
import type {
  HyperframesRepairAction,
  HyperframesRenderStatusProjection,
  MarketplaceAutoReviewLaunchMode,
} from "@shared/hyperframes/contracts";

export function shouldShowAutoStoryboardReviewSurface(
  plan: HyperframesAutoStoryboardReviewPlan | null | undefined,
  options: { loading?: boolean; error?: boolean } = {}
): boolean {
  if (options.loading || options.error) return true;
  return Boolean(plan?.access.capabilities.canAccessAuto);
}

export function resolveMarketplaceAutoReviewLaunchMode(input: {
  current: MarketplaceAutoReviewLaunchMode;
  plan: HyperframesAutoStoryboardReviewPlan | null | undefined;
  loading?: boolean;
  error?: boolean;
}): MarketplaceAutoReviewLaunchMode {
  return shouldShowAutoStoryboardReviewSurface(input.plan, {
    loading: input.loading,
    error: input.error,
  })
    ? input.current
    : "standard_order";
}

const HYPERFRAMES_CLIENT_STOP_POLLING_STATUSES = new Set([
  "not_available",
  "blocked_needs_user",
  "compliance_blocked",
  "template_disabled",
]);

const HYPERFRAMES_CLIENT_ACTIVE_STATUSES = new Set([
  "queued",
  "staging_assets",
  "linting",
  "snapshotting",
  "inspecting",
  "rendering",
  "qa_checking",
  "saving_to_library",
  "cancel_requested",
]);

const HYPERFRAMES_CLIENT_SUCCESS_STATUSES = new Set([
  "ready_for_review",
  "completed",
  "saved_to_library",
]);

const HYPERFRAMES_CLIENT_FAILED_STATUSES = new Set([
  "failed",
  "failed_transient",
  "failed_permanent",
  "dead_lettered",
  "stale_input_hash",
]);

const HYPERFRAMES_CLIENT_BLOCKED_STATUSES = new Set([
  "not_available",
  "blocked_needs_user",
  "compliance_blocked",
  "template_disabled",
]);

export type HyperframesRenderUiState =
  | "loading"
  | "active"
  | "success"
  | "failed"
  | "blocked"
  | "cancelled";

export function getUserSafeHyperframesRepairAction(
  render:
    | Pick<HyperframesRenderStatusProjection, "repairActions" | "permissions">
    | null
    | undefined
): HyperframesRepairAction | null {
  if (!render?.permissions?.canRepair) return null;
  return (
    render.repairActions?.find(
      action => !action.requiresOperator && !action.disabledReason
    ) ?? null
  );
}

export function resolveHyperframesRenderUiState(input: {
  render: Pick<
    HyperframesRenderStatusProjection,
    "status" | "polling" | "repairActions" | "permissions"
  > | null | undefined;
  loading?: boolean;
}): {
  state: HyperframesRenderUiState;
  active: boolean;
  failed: boolean;
  blocked: boolean;
  completed: boolean;
  saved: boolean;
  canCancel: boolean;
  userRepairAction: HyperframesRepairAction | null;
} {
  const status = input.render?.status;
  const userRepairAction = getUserSafeHyperframesRepairAction(input.render);
  const loading = Boolean(input.loading && !input.render);
  const saved = status === "saved_to_library";
  const completed = status === "completed" || status === "ready_for_review";
  const failed = Boolean(status && HYPERFRAMES_CLIENT_FAILED_STATUSES.has(status));
  const blocked = Boolean(status && HYPERFRAMES_CLIENT_BLOCKED_STATUSES.has(status));
  const terminal =
    Boolean(input.render?.polling?.terminalState) ||
    Boolean(status && HYPERFRAMES_CLIENT_SUCCESS_STATUSES.has(status)) ||
    failed ||
    blocked ||
    status === "cancelled";
  const active = Boolean(
    status && HYPERFRAMES_CLIENT_ACTIVE_STATUSES.has(status) && !terminal
  );

  return {
    state: loading
      ? "loading"
      : status === "cancelled"
        ? "cancelled"
        : failed
          ? "failed"
          : blocked
            ? "blocked"
            : saved || completed
              ? "success"
              : "active",
    active,
    failed,
    blocked,
    completed,
    saved,
    canCancel:
      active &&
      status !== "cancel_requested" &&
      input.render?.permissions?.canCancel === true,
    userRepairAction,
  };
}

export function resolveHyperframesRenderRefetchInterval(
  render: Pick<HyperframesRenderStatusProjection, "polling" | "status"> | null | undefined,
  fallbackIntervalMs = 15_000
): number | false {
  if (!render) return fallbackIntervalMs;
  if (render.polling?.terminalState) return false;
  if (render.polling?.stopWhenStatus?.includes(render.status)) return false;
  if (HYPERFRAMES_CLIENT_STOP_POLLING_STATUSES.has(render.status)) return false;
  return render.polling?.recommendedIntervalMs ?? fallbackIntervalMs;
}
