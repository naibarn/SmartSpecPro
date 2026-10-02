import type { RevisionedSourceReference } from "./compoundHazards";

export interface WaterQualityMeasurement {
  readonly parameter: string;
  readonly value: number;
  readonly unit: string;
  readonly method?: string;
  readonly observedAt: string;
  readonly sample?: { readonly id: string; readonly collectedAt: string };
  readonly source: RevisionedSourceReference;
  readonly thresholdBasis?: { readonly id: string; readonly revision: string; readonly comparator: "max" | "min"; readonly value: number; readonly unit: string };
}

export interface WaterQualityAssessment {
  readonly measurement: WaterQualityMeasurement;
  readonly conclusion: "incomplete" | "measured_no_safety_conclusion" | "threshold_exceeded" | "threshold_not_exceeded";
  /** A single measurement cannot establish potability or safe use. */
  readonly safeForDrinking: false;
}

export function assessWaterQualityMeasurement(measurement: WaterQualityMeasurement): WaterQualityAssessment {
  const complete = measurement.parameter.trim().length > 0
    && Number.isFinite(measurement.value)
    && measurement.unit.trim().length > 0
    && measurement.method?.trim().length
    && measurement.sample?.id.trim().length
    && measurement.sample.collectedAt.trim().length
    && measurement.source.id.trim().length > 0
    && measurement.source.revision.trim().length > 0
    && !Number.isNaN(new Date(measurement.observedAt).getTime());
  if (!complete) return { measurement, conclusion: "incomplete", safeForDrinking: false };
  const threshold = measurement.thresholdBasis;
  if (!threshold || threshold.unit !== measurement.unit || !Number.isFinite(threshold.value)) {
    return { measurement, conclusion: "measured_no_safety_conclusion", safeForDrinking: false };
  }
  const exceeded = threshold.comparator === "max" ? measurement.value > threshold.value : measurement.value < threshold.value;
  return { measurement, conclusion: exceeded ? "threshold_exceeded" : "threshold_not_exceeded", safeForDrinking: false };
}
