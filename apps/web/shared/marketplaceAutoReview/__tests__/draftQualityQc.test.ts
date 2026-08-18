import { describe, expect, it } from "vitest";
import {
  computeMarketplaceDraftQcReport,
  buildMarketplaceDraftQcRepairPlan,
  fingerprintMarketplaceDraftQcCandidate,
  MARKETPLACE_DRAFT_QC_CRITERIA,
  marketplaceDraftQcJudgeOutputSchema,
} from "../draftQualityQc";

function judge(overrides: Record<string, unknown> = {}) {
  return marketplaceDraftQcJudgeOutputSchema.parse({
    criteria: MARKETPLACE_DRAFT_QC_CRITERIA.map(item => ({
      criterionId: item.id,
      rawScore: 5,
      evidence: `Evidence for ${item.id}`,
    })),
    criticalFails: [],
    strengths: ["Clear product story"],
    weaknesses: [],
    recommendations: [],
    ...overrides,
  });
}

describe("marketplace product Creative QC contract", () => {
  it("computes the weighted ten-point score and passes at 8 or above", () => {
    const report = computeMarketplaceDraftQcReport(judge());
    expect(report.overallScore).toBe(10);
    expect(report.uncappedScore).toBe(10);
    expect(report.pass).toBe(true);
    expect(report.criteria).toHaveLength(10);
  });

  it("applies hard-fail caps and blocks approval", () => {
    const report = computeMarketplaceDraftQcReport(
      judge({
        criticalFails: [
          {
            code: "product_truth_drift",
            explanation: "The draft invents a product claim.",
          },
        ],
      })
    );
    expect(report.uncappedScore).toBe(10);
    expect(report.overallScore).toBe(6);
    expect(report.status).toBe("blocked");
    expect(report.pass).toBe(false);
  });

  it("fingerprints equivalent objects deterministically", () => {
    expect(
      fingerprintMarketplaceDraftQcCandidate({ b: 2, a: ["x", 1] })
    ).toBe(fingerprintMarketplaceDraftQcCandidate({ a: ["x", 1], b: 2 }));
  });

  it("builds a bounded plan and marks product-truth repairs manual", () => {
    const report = computeMarketplaceDraftQcReport(
      judge({
        criteria: MARKETPLACE_DRAFT_QC_CRITERIA.map(item => ({
          criterionId: item.id,
          rawScore: 2,
          evidence: `Weak evidence for ${item.id}`,
        })),
        recommendations: ["Clarify the benefit and CTA."],
      })
    );
    const plan = buildMarketplaceDraftQcRepairPlan(report);
    expect(plan.available).toBe(true);
    expect(
      plan.actions.every(action =>
        action.targetPaths.every(path => !action.preservePaths.includes(path))
      )
    ).toBe(true);
    const manualPlan = buildMarketplaceDraftQcRepairPlan(
      computeMarketplaceDraftQcReport(
        judge({
          criticalFails: [
            { code: "product_truth_drift", explanation: "Truth conflict" },
          ],
        })
      )
    );
    expect(manualPlan.available).toBe(false);
    expect(manualPlan.actions[0]?.autoRunnable).toBe(false);
  });
});
