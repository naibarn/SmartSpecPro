import { describe, expect, it } from "vitest";

import {
  evaluatePresentationEditAdditionalRolloutGate,
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

  it("passes stream-f rollout gate when hold, cohort, and thresholds are healthy", () => {
    const result = evaluatePresentationEditAdditionalRolloutGate({
      stage: "ramp_5",
      holdDurationHours: 26,
      exportsObserved: 640,
      mediaHeavyPercent: 35,
      denseLayoutPercent: 24,
      lowComplexityBaselinePresent: true,
      successRateDropPercent: 0.6,
      slideReadyTimeoutPercent: 0.1,
      svgPlaceholderPercent: 0.2,
      exportLatencyP95RegressionPercent: 8,
      crashOomIncreasePercent: 0.03,
      rollbackRehearsalCompleted: true,
    });

    expect(result.passed).toBe(true);
    expect(result.shouldHalt).toBe(false);
    expect(result.failedChecks).toEqual([]);
  });

  it("blocks promotion when hold rule is incomplete", () => {
    const result = evaluatePresentationEditAdditionalRolloutGate({
      stage: "ramp_1",
      holdDurationHours: 10,
      exportsObserved: 900,
      mediaHeavyPercent: 35,
      denseLayoutPercent: 24,
      lowComplexityBaselinePresent: true,
      successRateDropPercent: 0.6,
      slideReadyTimeoutPercent: 0.1,
      svgPlaceholderPercent: 0.2,
      exportLatencyP95RegressionPercent: 8,
      crashOomIncreasePercent: 0.03,
      rollbackRehearsalCompleted: true,
    });

    expect(result.passed).toBe(false);
    expect(result.shouldHalt).toBe(false);
    expect(result.failedChecks).toContain("stage_hold_incomplete");
  });

  it("blocks promotion when canary cohort composition is incomplete", () => {
    const result = evaluatePresentationEditAdditionalRolloutGate({
      stage: "ramp_5",
      holdDurationHours: 24,
      exportsObserved: 700,
      mediaHeavyPercent: 20,
      denseLayoutPercent: 19,
      lowComplexityBaselinePresent: false,
      successRateDropPercent: 0.6,
      slideReadyTimeoutPercent: 0.1,
      svgPlaceholderPercent: 0.2,
      exportLatencyP95RegressionPercent: 8,
      crashOomIncreasePercent: 0.03,
      rollbackRehearsalCompleted: true,
    });

    expect(result.passed).toBe(false);
    expect(result.shouldHalt).toBe(false);
    expect(result.failedChecks).toContain("cohort_media_heavy_insufficient");
    expect(result.failedChecks).toContain("cohort_dense_layout_insufficient");
    expect(result.failedChecks).toContain("cohort_low_complexity_baseline_missing");
  });

  it("requires rollback rehearsal before 25% and above", () => {
    const result = evaluatePresentationEditAdditionalRolloutGate({
      stage: "ramp_25",
      holdDurationHours: 28,
      exportsObserved: 900,
      mediaHeavyPercent: 40,
      denseLayoutPercent: 25,
      lowComplexityBaselinePresent: true,
      successRateDropPercent: 0.6,
      slideReadyTimeoutPercent: 0.1,
      svgPlaceholderPercent: 0.2,
      exportLatencyP95RegressionPercent: 8,
      crashOomIncreasePercent: 0.03,
      rollbackRehearsalCompleted: false,
    });

    expect(result.passed).toBe(false);
    expect(result.shouldHalt).toBe(false);
    expect(result.failedChecks).toContain("rollback_rehearsal_missing_for_25_plus");
  });

  it("halts rollout when stream-f stop-condition thresholds are breached", () => {
    const result = evaluatePresentationEditAdditionalRolloutGate({
      stage: "ramp_50",
      holdDurationHours: 30,
      exportsObserved: 1500,
      mediaHeavyPercent: 42,
      denseLayoutPercent: 27,
      lowComplexityBaselinePresent: true,
      successRateDropPercent: 1.4,
      slideReadyTimeoutPercent: 0.5,
      svgPlaceholderPercent: 0.8,
      exportLatencyP95RegressionPercent: 20,
      crashOomIncreasePercent: 0.2,
      rollbackRehearsalCompleted: true,
    });

    expect(result.passed).toBe(false);
    expect(result.shouldHalt).toBe(true);
    expect(result.failedChecks).toContain("success_rate_drop_exceeded");
    expect(result.failedChecks).toContain("slide_ready_timeout_exceeded");
    expect(result.failedChecks).toContain("svg_placeholder_rate_exceeded");
    expect(result.failedChecks).toContain("export_latency_regression_exceeded");
    expect(result.failedChecks).toContain("crash_oom_increase_exceeded");
  });

  it("fails safe on invalid stream-f rollout metrics", () => {
    const result = evaluatePresentationEditAdditionalRolloutGate({
      stage: "dogfood",
      holdDurationHours: Number.NaN,
      exportsObserved: 600,
      mediaHeavyPercent: 42,
      denseLayoutPercent: 27,
      lowComplexityBaselinePresent: true,
      successRateDropPercent: 0.6,
      slideReadyTimeoutPercent: 0.2,
      svgPlaceholderPercent: 0.3,
      exportLatencyP95RegressionPercent: 8,
      crashOomIncreasePercent: 0.04,
      rollbackRehearsalCompleted: true,
    });

    expect(result.passed).toBe(false);
    expect(result.shouldHalt).toBe(true);
    expect(result.failedChecks).toContain("invalid_metric_input");
    expect(result.failedChecks).toContain("invalid_metric_holdDurationHours");
  });
});
