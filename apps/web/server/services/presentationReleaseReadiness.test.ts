import { describe, expect, it } from "vitest";

import {
  evaluatePresentationCanaryAbort,
  evaluatePresentationPostMigrationConsistency,
  evaluatePresentationReleaseGate,
  validatePresentationLaunchOwnership,
} from "./presentationReleaseReadiness";

describe("presentationReleaseReadiness", () => {
  it("passes post-migration consistency checks when counts/order/bytes are aligned", () => {
    const result = evaluatePresentationPostMigrationConsistency({
      slideCountRows: [{ deckId: 10, persistedSlideCount: 2, actualSlideCount: 2 }],
      orderRows: [{ deckId: 10, orderIndexes: [0, 1] }],
      byteTotalRows: [{ deckId: 10, persistedTotalBytes: 6000, summedAssetBytes: 6000 }],
      orphanAssetLinkIds: [],
      staleObjectKeys: [],
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails post-migration consistency when any core invariant drifts", () => {
    const result = evaluatePresentationPostMigrationConsistency({
      slideCountRows: [{ deckId: 10, persistedSlideCount: 3, actualSlideCount: 2 }],
      orderRows: [{ deckId: 10, orderIndexes: [0, 2] }],
      byteTotalRows: [{ deckId: 10, persistedTotalBytes: 6000, summedAssetBytes: 7500 }],
      orphanAssetLinkIds: [901],
      staleObjectKeys: ["presentation/tenant-1/deck-10/orphan-a.png"],
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain("slide_count_mismatch:10");
    expect(result.failures).toContain("order_invariant_failed:10");
    expect(result.failures).toContain("byte_total_mismatch:10");
    expect(result.failures).toContain("orphan_asset_links_detected");
    expect(result.failures).toContain("stale_objects_detected");
  });

  it("fails release gate when monitoring or rollback prerequisites are missing", () => {
    const gate = evaluatePresentationReleaseGate({
      regressionSuitePassed: true,
      consistencyChecksPassed: true,
      monitoringReady: false,
      rollbackReady: false,
      canaryChecklistPassed: true,
    });

    expect(gate.passed).toBe(false);
    expect(gate.failedChecks).toContain("monitoring_not_ready");
    expect(gate.failedChecks).toContain("rollback_not_ready");
  });

  it("requires regression suite success before canary rollout can pass", () => {
    const gate = evaluatePresentationReleaseGate({
      regressionSuitePassed: false,
      consistencyChecksPassed: true,
      monitoringReady: true,
      rollbackReady: true,
      canaryChecklistPassed: true,
    });

    expect(gate.passed).toBe(false);
    expect(gate.failedChecks).toContain("regression_suite_failed");
    expect(gate.failedChecks).toContain("canary_requires_regression_success");
  });

  it("validates launch-week ownership metadata for conflict/conversion/export incidents", () => {
    const ownership = validatePresentationLaunchOwnership({
      conflict: "backend-oncall@company.com",
      conversion: "",
      export: null,
    });

    expect(ownership.ready).toBe(false);
    expect(ownership.missing).toEqual(["conversion", "export"]);
  });

  it("fails safe when canary metrics include NaN values", () => {
    const result = evaluatePresentationCanaryAbort({
      stage: "selected_tenants",
      conflictRatePercent: Number.NaN,
      exportFailureRatePercent: 1,
      degradationWarningRatePercent: 1,
      queueP95Seconds: 10,
      autosaveP95Ms: 800,
    });

    expect(result.shouldAbort).toBe(true);
    expect(result.reasons).toContain("invalid_metric_input");
    expect(result.reasons).toContain("invalid_metric_conflictRatePercent");
    expect(result.rollbackScope).toBe("global_editor_disable");
  });

  it("fails safe when canary metrics include Infinity", () => {
    const result = evaluatePresentationCanaryAbort({
      stage: "selected_tenants",
      conflictRatePercent: 1,
      exportFailureRatePercent: Number.POSITIVE_INFINITY,
      degradationWarningRatePercent: 1,
      queueP95Seconds: 10,
      autosaveP95Ms: 800,
    });

    expect(result.shouldAbort).toBe(true);
    expect(result.reasons).toContain("invalid_metric_input");
    expect(result.reasons).toContain("invalid_metric_exportFailureRatePercent");
    expect(result.rollbackScope).toBe("global_editor_disable");
  });

  it("fails safe when canary metrics are negative", () => {
    const result = evaluatePresentationCanaryAbort({
      stage: "ramp_25",
      conflictRatePercent: -1,
      exportFailureRatePercent: 1,
      degradationWarningRatePercent: 1,
      queueP95Seconds: 10,
      autosaveP95Ms: 800,
    });

    expect(result.shouldAbort).toBe(true);
    expect(result.reasons).toContain("invalid_metric_input");
    expect(result.reasons).toContain("invalid_metric_conflictRatePercent");
  });

  it("fails safe when percent metrics exceed 100", () => {
    const result = evaluatePresentationCanaryAbort({
      stage: "ramp_25",
      conflictRatePercent: 1,
      exportFailureRatePercent: 101,
      degradationWarningRatePercent: 1,
      queueP95Seconds: 10,
      autosaveP95Ms: 800,
    });

    expect(result.shouldAbort).toBe(true);
    expect(result.reasons).toContain("invalid_metric_input");
    expect(result.reasons).toContain("invalid_metric_exportFailureRatePercent");
  });

  it("fails safe when denominator-zero derived metrics produce Infinity", () => {
    const errorRate = 1 / 0;
    const result = evaluatePresentationCanaryAbort({
      stage: "ramp_25",
      conflictRatePercent: 1,
      exportFailureRatePercent: errorRate,
      degradationWarningRatePercent: 1,
      queueP95Seconds: 10,
      autosaveP95Ms: 800,
    });

    expect(result.shouldAbort).toBe(true);
    expect(result.reasons).toContain("invalid_metric_input");
    expect(result.reasons).toContain("invalid_metric_exportFailureRatePercent");
  });
});
