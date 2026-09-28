import { describe, expect, it } from "vitest";
import {
  DRAFT_QC_CRITERIA,
  DRAFT_QC_PASS_THRESHOLD,
  buildDraftQualityQcRepairPlan,
  compareDraftQualityQcCandidates,
  computeDraftQualityQcReport,
  estimateDraftQualityQcCredits,
  fingerprintDraftQualityQcCandidate,
  normalizeDraftQualityQcRoundBudget,
} from "../draftQualityQc";

function judge(rawScore = 5) {
  return {
    criteria: DRAFT_QC_CRITERIA.map(item => ({
      criterionId: item.id,
      rawScore,
      evidence: `evidence for ${item.id}`,
    })),
    criticalFails: [],
    strengths: ["clear hook"],
    weaknesses: [],
    recommendations: [],
  } as const;
}

describe("draft quality QC contract", () => {
  it("keeps the rubric weights at ten and computes a passing perfect score", () => {
    expect(DRAFT_QC_CRITERIA.reduce((sum, item) => sum + item.weight, 0)).toBe(10);
    const report = computeDraftQualityQcReport(judge());
    expect(report.overallScore).toBe(10);
    expect(report.pass).toBe(true);
    expect(report.overallScore).toBeGreaterThanOrEqual(DRAFT_QC_PASS_THRESHOLD);
  });

  it("blocks a high score when a critical fail exists", () => {
    const report = computeDraftQualityQcReport({
      ...judge(),
      criticalFails: [{ code: "missing_repeatable_engine", explanation: "No episode engine" }],
    });
    expect(report.pass).toBe(false);
    expect(report.status).toBe("blocked");
  });

  it("builds a bounded repair plan from weak criteria without changing scores", () => {
    const report = computeDraftQualityQcReport({
      ...judge(4),
      recommendations: ["Strengthen the repeatable episode engine"],
    });
    const repairPlan = buildDraftQualityQcRepairPlan(report);

    expect(report.overallScore).toBe(8);
    expect(report.pass).toBe(false);
    expect(repairPlan.available).toBe(true);
    expect(repairPlan.actions.length).toBeGreaterThan(0);
    expect(repairPlan.actions.length).toBeLessThanOrEqual(6);
    expect(repairPlan.actions.every(action => action.autoRunnable)).toBe(true);
  });

  it("uses deterministic candidate comparison and bounded round choices", () => {
    const current = { report: computeDraftQualityQcReport(judge(4)), round: 0 };
    const candidate = { report: computeDraftQualityQcReport(judge(5)), round: 1 };
    expect(compareDraftQualityQcCandidates(current, candidate)).toBe(1);
    expect(compareDraftQualityQcCandidates(candidate, current)).toBe(-1);
    expect(normalizeDraftQualityQcRoundBudget(undefined)).toBe(2);
    expect(normalizeDraftQualityQcRoundBudget(7)).toBe(2);
    expect(normalizeDraftQualityQcRoundBudget(10)).toBe(10);
  });

  it("estimates baseline plus two calls per improvement round", () => {
    expect(estimateDraftQualityQcCredits({ maxImprovementRounds: 5, perCallCredits: 2 })).toMatchObject({
      baselineCalls: 1,
      maxCalls: 11,
      estimatedCredits: 22,
    });
  });

  it("fingerprints object keys independently of insertion order", () => {
    expect(fingerprintDraftQualityQcCandidate({ b: 2, a: 1 })).toBe(
      fingerprintDraftQualityQcCandidate({ a: 1, b: 2 }),
    );
    expect(fingerprintDraftQualityQcCandidate({ a: 1, b: 2 })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });
});
