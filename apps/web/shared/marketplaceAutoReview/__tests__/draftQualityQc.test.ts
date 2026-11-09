import { describe, expect, it } from "vitest";
import {
  computeMarketplaceDraftQcReport,
  buildMarketplaceDraftQcRepairPlan,
  formatMarketplaceDraftQcJudgeNormalizationError,
  fingerprintMarketplaceDraftQcCandidate,
  MARKETPLACE_DRAFT_QC_CRITERIA,
  normalizeMarketplaceDraftQcJudgeOutput,
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

  it("keeps malformed critical fails as blockers and fills omitted summary arrays", () => {
    const modelResponse = {
      criteria: MARKETPLACE_DRAFT_QC_CRITERIA.map(item => ({
        criterionId: item.id,
        rawScore: 5,
        evidence: `Evidence for ${item.id}`,
      })),
      criticalFails: [
        {
          code: "Hook Strength",
          explanation: "The evaluator used a rubric label instead of a failure code.",
        },
      ],
      weaknesses: [],
      recommendations: [],
    };

    const normalized = normalizeMarketplaceDraftQcJudgeOutput(modelResponse);

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.data.strengths).toEqual([]);
    expect(normalized.data.criticalFails[0]?.code).toBe(
      "unclassified_critical_fail"
    );
    const report = computeMarketplaceDraftQcReport(normalized.data);
    expect(report.pass).toBe(false);
    expect(report.status).toBe("blocked");
    expect(report.repairPlan?.available).toBe(false);
    expect(report.repairPlan?.actions[0]?.autoRunnable).toBe(false);
  });

  it("does not fabricate missing criterion scores or evidence", () => {
    const modelResponse = {
      ...judge(),
      criteria: MARKETPLACE_DRAFT_QC_CRITERIA.map(item => ({
        criterionId: item.id,
        rawScore: 5,
        evidence: `Evidence for ${item.id}`,
      })),
    };
    modelResponse.criteria[0] = {
      criterionId: MARKETPLACE_DRAFT_QC_CRITERIA[0].id,
      rawScore: 5,
      evidence: "",
    };

    const normalized = normalizeMarketplaceDraftQcJudgeOutput(modelResponse);

    expect(normalized.ok).toBe(false);
    expect(formatMarketplaceDraftQcJudgeNormalizationError(modelResponse)).toContain(
      "criteria[0].evidence"
    );
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
