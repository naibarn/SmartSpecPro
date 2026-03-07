export type PresentationEditAdditionalRolloutStage =
  | "dogfood"
  | "ramp_1"
  | "ramp_5"
  | "ramp_25"
  | "ramp_50"
  | "ramp_100";

export interface PresentationEditAdditionalRolloutGateInput {
  stage: PresentationEditAdditionalRolloutStage;
  holdDurationHours: number;
  exportsObserved: number;
  mediaHeavyPercent: number;
  denseLayoutPercent: number;
  lowComplexityBaselinePresent: boolean;
  successRateDropPercent: number;
  slideReadyTimeoutPercent: number;
  svgPlaceholderPercent: number;
  exportLatencyP95RegressionPercent: number;
  crashOomIncreasePercent: number;
  rollbackRehearsalCompleted: boolean;
}

export interface PresentationEditAdditionalRolloutGateResult {
  passed: boolean;
  shouldHalt: boolean;
  failedChecks: string[];
}

function parsePercentMetric(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || value > 100) {
    return null;
  }
  return value;
}

function parseNonNegativeMetric(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return null;
  }
  return value;
}

function parseWholeNumberMetric(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  if (value < 0 || !Number.isInteger(value)) {
    return null;
  }
  return value;
}

export function evaluatePresentationEditAdditionalRolloutGate(
  input: PresentationEditAdditionalRolloutGateInput,
): PresentationEditAdditionalRolloutGateResult {
  const parsedMetrics = {
    holdDurationHours: parseNonNegativeMetric(input.holdDurationHours),
    exportsObserved: parseWholeNumberMetric(input.exportsObserved),
    mediaHeavyPercent: parsePercentMetric(input.mediaHeavyPercent),
    denseLayoutPercent: parsePercentMetric(input.denseLayoutPercent),
    successRateDropPercent: parsePercentMetric(input.successRateDropPercent),
    slideReadyTimeoutPercent: parsePercentMetric(input.slideReadyTimeoutPercent),
    svgPlaceholderPercent: parsePercentMetric(input.svgPlaceholderPercent),
    exportLatencyP95RegressionPercent: parsePercentMetric(input.exportLatencyP95RegressionPercent),
    crashOomIncreasePercent: parsePercentMetric(input.crashOomIncreasePercent),
  };

  const invalidMetrics = Object.entries(parsedMetrics)
    .filter(([, value]) => value === null)
    .map(([metricName]) => metricName);

  if (invalidMetrics.length > 0) {
    return {
      passed: false,
      shouldHalt: true,
      failedChecks: ["invalid_metric_input", ...invalidMetrics.map((metricName) => `invalid_metric_${metricName}`)],
    };
  }

  const failedChecks: string[] = [];

  const holdDurationHours = parsedMetrics.holdDurationHours!;
  const exportsObserved = parsedMetrics.exportsObserved!;
  const mediaHeavyPercent = parsedMetrics.mediaHeavyPercent!;
  const denseLayoutPercent = parsedMetrics.denseLayoutPercent!;
  const successRateDropPercent = parsedMetrics.successRateDropPercent!;
  const slideReadyTimeoutPercent = parsedMetrics.slideReadyTimeoutPercent!;
  const svgPlaceholderPercent = parsedMetrics.svgPlaceholderPercent!;
  const exportLatencyP95RegressionPercent = parsedMetrics.exportLatencyP95RegressionPercent!;
  const crashOomIncreasePercent = parsedMetrics.crashOomIncreasePercent!;

  if (holdDurationHours < 24 || exportsObserved < 500) {
    failedChecks.push("stage_hold_incomplete");
  }
  if (mediaHeavyPercent < 30) {
    failedChecks.push("cohort_media_heavy_insufficient");
  }
  if (denseLayoutPercent < 20) {
    failedChecks.push("cohort_dense_layout_insufficient");
  }
  if (!input.lowComplexityBaselinePresent) {
    failedChecks.push("cohort_low_complexity_baseline_missing");
  }

  const requiresRollbackRehearsal =
    input.stage === "ramp_25" || input.stage === "ramp_50" || input.stage === "ramp_100";
  if (requiresRollbackRehearsal && !input.rollbackRehearsalCompleted) {
    failedChecks.push("rollback_rehearsal_missing_for_25_plus");
  }

  if (successRateDropPercent > 1.0) {
    failedChecks.push("success_rate_drop_exceeded");
  }
  if (slideReadyTimeoutPercent > 0.3) {
    failedChecks.push("slide_ready_timeout_exceeded");
  }
  if (svgPlaceholderPercent > 0.5) {
    failedChecks.push("svg_placeholder_rate_exceeded");
  }
  if (exportLatencyP95RegressionPercent > 15) {
    failedChecks.push("export_latency_regression_exceeded");
  }
  if (crashOomIncreasePercent > 0.1) {
    failedChecks.push("crash_oom_increase_exceeded");
  }

  const shouldHalt = failedChecks.some((check) =>
    check.endsWith("_exceeded") || check === "invalid_metric_input",
  );

  return {
    passed: failedChecks.length === 0,
    shouldHalt,
    failedChecks,
  };
}
