import { describe, expect, it } from "vitest";

import type { PresentationAIDesignFitScore, PresentationAIDesignSourceTrace } from "./contracts";
import {
  evaluateSlideQualityGate,
  evaluateSourceTraceOmission,
  QUALITY_GATE_THRESHOLDS,
} from "./qualityGate";

function makeFitScore(overrides: Partial<PresentationAIDesignFitScore> = {}): PresentationAIDesignFitScore {
  return {
    overall: 0.85,
    overflowRisk: 0.1,
    ...overrides,
  };
}

describe("evaluateSlideQualityGate", () => {
  it("returns accept when no fit score is provided", () => {
    const result = evaluateSlideQualityGate(undefined);
    expect(result.verdict).toBe("accept");
    expect(result.issues).toHaveLength(0);
  });

  it("returns accept when fit score is above accept threshold", () => {
    const result = evaluateSlideQualityGate(makeFitScore({ overall: 0.90 }));
    expect(result.verdict).toBe("accept");
  });

  it("returns warn when fit score is in cramped band", () => {
    const result = evaluateSlideQualityGate(makeFitScore({ overall: 0.70 }));
    expect(result.verdict).toBe("warn");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ rule: "fit_score_cramped", severity: "warning" }),
    );
  });

  it("returns reject when fit score is below unsafe threshold", () => {
    const result = evaluateSlideQualityGate(makeFitScore({ overall: 0.50 }));
    expect(result.verdict).toBe("reject");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ rule: "fit_score_unsafe", severity: "error" }),
    );
  });

  it("returns reject when overflow risk exceeds unsafe threshold", () => {
    const result = evaluateSlideQualityGate(makeFitScore({ overall: 0.85, overflowRisk: 0.75 }));
    expect(result.verdict).toBe("reject");
    expect(result.issues).toContainEqual(
      expect.objectContaining({ rule: "overflow_risk_unsafe", severity: "error" }),
    );
  });

  it("returns accept at exact boundary values", () => {
    const result = evaluateSlideQualityGate(makeFitScore({
      overall: QUALITY_GATE_THRESHOLDS.fitAccept,
      overflowRisk: QUALITY_GATE_THRESHOLDS.overflowUnsafe - 0.01,
    }));
    expect(result.verdict).toBe("accept");
  });
});

describe("evaluateSourceTraceOmission", () => {
  it("returns null when no source trace is provided", () => {
    expect(evaluateSourceTraceOmission(undefined)).toBeNull();
  });

  it("returns null for empty source trace", () => {
    expect(evaluateSourceTraceOmission([])).toBeNull();
  });

  it("returns null when omission rate is below threshold", () => {
    const trace: PresentationAIDesignSourceTrace[] = [
      { sourceId: "s1", sourceType: "heading", disposition: "used", targetSlotId: "title" },
      { sourceId: "s2", sourceType: "paragraph", disposition: "used", targetSlotId: "body" },
      { sourceId: "s3", sourceType: "paragraph", disposition: "used", targetSlotId: "lead" },
    ];
    expect(evaluateSourceTraceOmission(trace)).toBeNull();
  });

  it("returns warning when omission rate exceeds threshold", () => {
    const trace: PresentationAIDesignSourceTrace[] = [
      { sourceId: "s1", sourceType: "heading", disposition: "used", targetSlotId: "title" },
      { sourceId: "s2", sourceType: "paragraph", disposition: "omitted" },
      { sourceId: "s3", sourceType: "bullet", disposition: "omitted" },
      { sourceId: "s4", sourceType: "paragraph", disposition: "omitted" },
      { sourceId: "s5", sourceType: "paragraph", disposition: "used", targetSlotId: "body" },
    ];
    const result = evaluateSourceTraceOmission(trace);
    expect(result).not.toBeNull();
    expect(result!.rule).toBe("source_omission_excessive");
    expect(result!.severity).toBe("warning");
  });
});
