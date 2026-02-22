import { findPresentationByteInconsistencies, type DeckByteReconciliationRow } from "./presentationPersistence";

export interface PresentationSlideCountConsistencyRow {
  deckId: number;
  persistedSlideCount: number;
  actualSlideCount: number;
}

export interface PresentationOrderConsistencyRow {
  deckId: number;
  orderIndexes: number[];
}

export interface PresentationPostMigrationConsistencyInput {
  slideCountRows: PresentationSlideCountConsistencyRow[];
  orderRows: PresentationOrderConsistencyRow[];
  byteTotalRows: DeckByteReconciliationRow[];
  orphanAssetLinkIds: number[];
  staleObjectKeys: string[];
}

export interface PresentationPostMigrationConsistencyResult {
  passed: boolean;
  failures: string[];
}

export interface PresentationReleaseGateInput {
  regressionSuitePassed: boolean;
  consistencyChecksPassed: boolean;
  monitoringReady: boolean;
  rollbackReady: boolean;
  canaryChecklistPassed: boolean;
}

export interface PresentationReleaseGateResult {
  passed: boolean;
  failedChecks: string[];
}

export interface PresentationLaunchOwnershipInput {
  conflict: string | null;
  conversion: string | null;
  export: string | null;
}

export interface PresentationLaunchOwnershipResult {
  ready: boolean;
  missing: Array<"conflict" | "conversion" | "export">;
}

export type PresentationCanaryStage = "selected_tenants" | "ramp_25" | "ramp_50";

export interface PresentationCanaryAbortInput {
  stage: PresentationCanaryStage;
  conflictRatePercent: number;
  exportFailureRatePercent: number;
  degradationWarningRatePercent: number;
  queueP95Seconds: number;
  autosaveP95Ms: number;
}

export interface PresentationCanaryAbortResult {
  shouldAbort: boolean;
  reasons: string[];
  rollbackScope: "global_editor_disable" | "export_write_disable" | null;
}

function isOrderContiguous(orderIndexes: number[]): boolean {
  if (orderIndexes.length === 0) {
    return true;
  }
  const sorted = [...orderIndexes].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (sorted[i] !== i) {
      return false;
    }
  }
  return true;
}

function hasOwner(value: string | null): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function evaluatePresentationPostMigrationConsistency(
  input: PresentationPostMigrationConsistencyInput,
): PresentationPostMigrationConsistencyResult {
  const failures: string[] = [];

  for (const row of input.slideCountRows) {
    if (row.persistedSlideCount !== row.actualSlideCount) {
      failures.push(`slide_count_mismatch:${row.deckId}`);
    }
  }

  for (const row of input.orderRows) {
    if (!isOrderContiguous(row.orderIndexes)) {
      failures.push(`order_invariant_failed:${row.deckId}`);
    }
  }

  const byteMismatches = findPresentationByteInconsistencies(input.byteTotalRows);
  for (const mismatch of byteMismatches) {
    failures.push(`byte_total_mismatch:${mismatch.deckId}`);
  }

  if (input.orphanAssetLinkIds.length > 0) {
    failures.push("orphan_asset_links_detected");
  }
  if (input.staleObjectKeys.length > 0) {
    failures.push("stale_objects_detected");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}

export function evaluatePresentationReleaseGate(
  input: PresentationReleaseGateInput,
): PresentationReleaseGateResult {
  const failedChecks: string[] = [];

  if (!input.regressionSuitePassed) {
    failedChecks.push("regression_suite_failed");
  }
  if (!input.consistencyChecksPassed) {
    failedChecks.push("consistency_checks_failed");
  }
  if (!input.monitoringReady) {
    failedChecks.push("monitoring_not_ready");
  }
  if (!input.rollbackReady) {
    failedChecks.push("rollback_not_ready");
  }
  if (!input.canaryChecklistPassed) {
    failedChecks.push("canary_checklist_incomplete");
  }
  if (input.canaryChecklistPassed && !input.regressionSuitePassed) {
    failedChecks.push("canary_requires_regression_success");
  }

  return {
    passed: failedChecks.length === 0,
    failedChecks,
  };
}

export function validatePresentationLaunchOwnership(
  input: PresentationLaunchOwnershipInput,
): PresentationLaunchOwnershipResult {
  const missing: PresentationLaunchOwnershipResult["missing"] = [];

  if (!hasOwner(input.conflict)) {
    missing.push("conflict");
  }
  if (!hasOwner(input.conversion)) {
    missing.push("conversion");
  }
  if (!hasOwner(input.export)) {
    missing.push("export");
  }

  return {
    ready: missing.length === 0,
    missing,
  };
}

export function evaluatePresentationCanaryAbort(
  input: PresentationCanaryAbortInput,
): PresentationCanaryAbortResult {
  const reasons: string[] = [];

  if (input.conflictRatePercent > 5) {
    reasons.push("conflict_rate_exceeded");
  }
  if (input.exportFailureRatePercent > 4) {
    reasons.push("export_failure_rate_exceeded");
  }
  if (input.stage !== "selected_tenants" && input.degradationWarningRatePercent > 25) {
    reasons.push("degradation_warning_rate_exceeded");
  }
  if (input.stage !== "selected_tenants" && input.queueP95Seconds > 120) {
    reasons.push("export_queue_latency_exceeded");
  }
  if (input.stage === "ramp_50" && input.autosaveP95Ms > 1500) {
    reasons.push("autosave_latency_exceeded");
  }

  const shouldAbort = reasons.length > 0;
  if (!shouldAbort) {
    return {
      shouldAbort: false,
      reasons,
      rollbackScope: null,
    };
  }

  const requiresGlobalDisable =
    reasons.includes("conflict_rate_exceeded") || reasons.includes("autosave_latency_exceeded");

  return {
    shouldAbort: true,
    reasons,
    rollbackScope: requiresGlobalDisable ? "global_editor_disable" : "export_write_disable",
  };
}
