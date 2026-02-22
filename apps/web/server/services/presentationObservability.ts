import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";

export interface PresentationObservabilityLog {
  event: string;
  timestamp: string;
  tenantId?: string;
  deckId?: number;
  slideId?: number;
  userId?: number;
  format?: "png" | "mp4";
  errorCode?: string;
  reasonCode?: string;
  conversionStatus?: string;
  sourceFormat?: string;
  retryAfterSeconds?: number;
}

export interface PresentationAlertSnapshot {
  conflictRate: number;
  conversionFailureRate: number;
  queueLatencyP95Ms: number;
  exportFailureRate: number;
  throttleRejectionRate: number;
  duplicateSuppressionRate: number;
}

export interface PresentationAlertThresholds {
  maxConflictRate: number;
  maxConversionFailureRate: number;
  maxQueueLatencyP95Ms: number;
  maxExportFailureRate: number;
  maxThrottleRejectionRate: number;
  minDuplicateSuppressionRate: number;
}

const DEFAULT_THRESHOLDS: PresentationAlertThresholds = {
  maxConflictRate: 0.05,
  maxConversionFailureRate: 0.03,
  maxQueueLatencyP95Ms: 120_000,
  maxExportFailureRate: 0.04,
  maxThrottleRejectionRate: 0.2,
  minDuplicateSuppressionRate: 0.01,
};

const logs: PresentationObservabilityLog[] = [];
const metricCounters = new Map<string, number>();

function toSafeLogPayload(
  event: string,
  payload: Record<string, unknown>,
): PresentationObservabilityLog {
  return {
    event,
    timestamp: new Date().toISOString(),
    tenantId: typeof payload.tenantId === "string" ? payload.tenantId : undefined,
    deckId: typeof payload.deckId === "number" ? payload.deckId : undefined,
    slideId: typeof payload.slideId === "number" ? payload.slideId : undefined,
    userId: typeof payload.userId === "number" ? payload.userId : undefined,
    format: payload.format === "png" || payload.format === "mp4" ? payload.format : undefined,
    errorCode: typeof payload.errorCode === "string" ? payload.errorCode : undefined,
    reasonCode: typeof payload.reasonCode === "string" ? payload.reasonCode : undefined,
    conversionStatus: typeof payload.conversionStatus === "string" ? payload.conversionStatus : undefined,
    sourceFormat: typeof payload.sourceFormat === "string" ? payload.sourceFormat : undefined,
    retryAfterSeconds:
      typeof payload.retryAfterSeconds === "number" ? Math.max(1, Math.round(payload.retryAfterSeconds)) : undefined,
  };
}

export function recordPresentationLog(
  event: string,
  payload: Record<string, unknown>,
): void {
  const safe = toSafeLogPayload(event, payload);
  logs.push(safe);
}

export function incrementPresentationMetric(metric: string, delta = 1): void {
  metricCounters.set(metric, (metricCounters.get(metric) ?? 0) + delta);
}

export function recordPresentationFailureMetric(errorCode: string): void {
  incrementPresentationMetric("presentation.failure.total");
  if (errorCode === PRESENTATION_ERROR_CODE.VERSION_CONFLICT) {
    incrementPresentationMetric("presentation.conflict.total");
    return;
  }
  if (errorCode === PRESENTATION_ERROR_CODE.EXPORT_THROTTLED) {
    incrementPresentationMetric("presentation.export.throttle_rejection.total");
    return;
  }
  if (errorCode === PRESENTATION_ERROR_CODE.RENDER_SCHEMA_MISMATCH) {
    incrementPresentationMetric("presentation.export.schema_mismatch.total");
    return;
  }
  if (errorCode === PRESENTATION_ERROR_CODE.UNSUPPORTED_ITEM_TYPE) {
    incrementPresentationMetric("presentation.conversion.failure.total");
    return;
  }
  if (errorCode === PRESENTATION_ERROR_CODE.CONVERSION_IN_PROGRESS) {
    incrementPresentationMetric("presentation.conversion.locked.total");
  }
}

export function getPresentationObservabilityLogs(): PresentationObservabilityLog[] {
  return [...logs];
}

export function getPresentationMetricValue(metric: string): number {
  return metricCounters.get(metric) ?? 0;
}

export function evaluatePresentationAlertThresholds(
  snapshot: PresentationAlertSnapshot,
  overrides?: Partial<PresentationAlertThresholds>,
): { triggered: boolean; alerts: string[]; thresholds: PresentationAlertThresholds } {
  const thresholds: PresentationAlertThresholds = {
    ...DEFAULT_THRESHOLDS,
    ...overrides,
  };
  const alerts: string[] = [];

  if (snapshot.conflictRate > thresholds.maxConflictRate) {
    alerts.push("conflict_rate_exceeded");
  }
  if (snapshot.conversionFailureRate > thresholds.maxConversionFailureRate) {
    alerts.push("conversion_failure_rate_exceeded");
  }
  if (snapshot.queueLatencyP95Ms > thresholds.maxQueueLatencyP95Ms) {
    alerts.push("queue_latency_p95_exceeded");
  }
  if (snapshot.exportFailureRate > thresholds.maxExportFailureRate) {
    alerts.push("export_failure_rate_exceeded");
  }
  if (snapshot.throttleRejectionRate > thresholds.maxThrottleRejectionRate) {
    alerts.push("throttle_rejection_rate_exceeded");
  }
  if (snapshot.duplicateSuppressionRate < thresholds.minDuplicateSuppressionRate) {
    alerts.push("duplicate_suppression_too_low");
  }

  return {
    triggered: alerts.length > 0,
    alerts,
    thresholds,
  };
}

export function resetPresentationObservabilityStateForTests(): void {
  logs.length = 0;
  metricCounters.clear();
}
