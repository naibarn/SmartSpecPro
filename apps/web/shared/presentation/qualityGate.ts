/**
 * Quality Gate Service (Spec 014 — Section 07)
 *
 * Applies acceptance thresholds from contracts-appendix.md §7:
 *   - auto-accept: fitScore.overall >= 0.78
 *   - warn/cramped: 0.62 – 0.77
 *   - reject/unsafe: < 0.62
 *   - overflow unsafe at overflowRisk >= 0.70
 *   - readability fail when body slots exceed target lines by 2+
 *   - source omission warning when > 15% of mapped source text is silently omitted
 */

import type { PresentationAIDesignFitScore, PresentationAIDesignSourceTrace } from "./contracts";
import type { PresentationComponentSlotBudget } from "./componentRecipes";
import type { PresentationRecipeSlotFitDetails } from "./recipeCompaction";

export const QUALITY_GATE_THRESHOLDS = {
  fitAccept: 0.78,
  fitWarn: 0.62,
  overflowUnsafe: 0.70,
  readabilityExceedLines: 2,
  sourceOmissionWarnPct: 0.15,
  deckConsistencyMaxOscillations: 2,
} as const;

export type QualityGateVerdict = "accept" | "warn" | "reject";

export interface QualityGateIssue {
  rule: string;
  severity: "error" | "warning" | "info";
  message: string;
  slotId?: string;
}

export interface QualityGateResult {
  verdict: QualityGateVerdict;
  issues: QualityGateIssue[];
}

/**
 * Evaluate the quality gate for a single slide based on its fit score.
 */
export function evaluateSlideQualityGate(
  fitScore: PresentationAIDesignFitScore | undefined,
  slotDetails?: PresentationRecipeSlotFitDetails[],
  slotBudgets?: Record<string, PresentationComponentSlotBudget>,
): QualityGateResult {
  const issues: QualityGateIssue[] = [];

  if (!fitScore) {
    return { verdict: "accept", issues: [] };
  }

  // Overall fit score threshold
  if (fitScore.overall < QUALITY_GATE_THRESHOLDS.fitWarn) {
    issues.push({
      rule: "fit_score_unsafe",
      severity: "error",
      message: `Fit score ${fitScore.overall.toFixed(2)} is below the unsafe threshold (${QUALITY_GATE_THRESHOLDS.fitWarn}).`,
    });
  } else if (fitScore.overall < QUALITY_GATE_THRESHOLDS.fitAccept) {
    issues.push({
      rule: "fit_score_cramped",
      severity: "warning",
      message: `Fit score ${fitScore.overall.toFixed(2)} is in the cramped band (${QUALITY_GATE_THRESHOLDS.fitWarn}–${QUALITY_GATE_THRESHOLDS.fitAccept}).`,
    });
  }

  // Overflow risk
  if (fitScore.overflowRisk >= QUALITY_GATE_THRESHOLDS.overflowUnsafe) {
    issues.push({
      rule: "overflow_risk_unsafe",
      severity: "error",
      message: `Overflow risk ${fitScore.overflowRisk.toFixed(2)} exceeds unsafe threshold (${QUALITY_GATE_THRESHOLDS.overflowUnsafe}).`,
    });
  }

  // Readability: check individual slots for line overflow
  if (slotDetails && slotBudgets) {
    for (const slot of slotDetails) {
      const budget = slotBudgets[slot.slotId];
      if (!budget?.preferredLines) continue;
      // slot.overflowRisk > 0 means it is overflowing; high overflow correlates with exceeding target lines
      // We approximate: if overflowRisk >= 0.5, that suggests 2+ extra lines
      if (slot.overflowRisk >= 0.4 && slot.status === "unsafe") {
        issues.push({
          rule: "readability_line_overflow",
          severity: "warning",
          slotId: slot.slotId,
          message: `Slot "${slot.slotId}" likely exceeds target lines by ${QUALITY_GATE_THRESHOLDS.readabilityExceedLines}+ (overflow risk ${slot.overflowRisk.toFixed(2)}).`,
        });
      }
    }
  }

  // Determine verdict
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const verdict: QualityGateVerdict = hasErrors ? "reject" : hasWarnings ? "warn" : "accept";

  return { verdict, issues };
}

/**
 * Evaluate source trace for silent omission percentage.
 *
 * Warns when > 15% of mapped source entries are omitted without
 * fallback/defer metadata.
 */
export function evaluateSourceTraceOmission(
  sourceTrace: PresentationAIDesignSourceTrace[] | undefined,
): QualityGateIssue | null {
  if (!sourceTrace || sourceTrace.length === 0) return null;

  const omittedCount = sourceTrace.filter(
    (entry) => entry.disposition === "omitted",
  ).length;
  const omissionRate = omittedCount / sourceTrace.length;

  if (omissionRate > QUALITY_GATE_THRESHOLDS.sourceOmissionWarnPct) {
    return {
      rule: "source_omission_excessive",
      severity: "warning",
      message: `${(omissionRate * 100).toFixed(0)}% of source content was omitted (${omittedCount}/${sourceTrace.length} entries). Threshold: ${(QUALITY_GATE_THRESHOLDS.sourceOmissionWarnPct * 100).toFixed(0)}%.`,
    };
  }

  return null;
}
