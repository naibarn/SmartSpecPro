import { describe, expect, it } from "vitest";
import { analyzeDecision, type DecisionCriterion } from "./analysis";

const criteria: DecisionCriterion[] = [
  { id: "access", label: "Access", weight: 2, direction: "higher_is_better", required: true, normalization: "unit_interval" },
  { id: "cost", label: "Cost", weight: 1, direction: "lower_is_better", required: true, normalization: "unit_interval" },
];

describe("analyzeDecision", () => {
  it("ranks alternatives deterministically and returns explainable contributions", () => {
    const result = analyzeDecision({
      templateVersion: "site-selection-v1",
      methodologyVersion: "mcda-weighted-sum-v1",
      criteria,
      alternatives: [
        { id: "A", values: { access: { value: 0.9, low: 0.8, high: 1, evidenceRefs: ["e1"], admitted: true }, cost: { value: 0.7, evidenceRefs: ["e2"], admitted: true } } },
        { id: "B", values: { access: { value: 0.5, evidenceRefs: ["e3"], admitted: true }, cost: { value: 0.2, evidenceRefs: ["e4"], admitted: true } } },
      ],
    });
    expect(result.ranking.map(item => item.alternativeId)).toEqual(["A", "B"]);
    expect(result.ranking[0]).toMatchObject({ score: 0.7, lowerBound: 0.633333, upperBound: 0.766667 });
    expect(result.ranking[0]?.contributions).toHaveLength(2);
    expect(result.methodologyVersion).toBe("mcda-weighted-sum-v1");
    expect(result.sensitivity).toMatchObject({ relativeWeightDelta: 0.1, stableTopChoice: expect.any(Boolean) });
  });

  it("keeps missing required values as gaps instead of treating them as zero", () => {
    const result = analyzeDecision({
      templateVersion: "v1",
      methodologyVersion: "mcda-weighted-sum-v1",
      criteria,
      alternatives: [{ id: "A", values: { access: { value: 0.9, evidenceRefs: ["e1"], admitted: true } } }],
    });
    expect(result.ranking[0]?.score).toBe(0.9);
    expect(result.ranking[0]?.missingRequiredCriteria).toEqual(["cost"]);
    expect(result.readiness).toMatchObject({ status: "partial", requiredCovered: 1, requiredTotal: 2 });
  });

  it("excludes unadmitted evidence-backed values from material scoring", () => {
    const result = analyzeDecision({
      templateVersion: "v1",
      methodologyVersion: "mcda-weighted-sum-v1",
      criteria: [criteria[0]!],
      alternatives: [{ id: "A", values: { access: { value: 1, evidenceRefs: ["candidate-1"], admitted: false } } }],
    });
    expect(result.ranking[0]).not.toHaveProperty("score");
    expect(result.ranking[0]?.missingRequiredCriteria).toEqual(["access"]);
    expect(result.readiness.status).toBe("blocked");
  });

  it("rejects invalid weights, duplicate criteria, non-finite values and unbounded inputs", () => {
    expect(() => analyzeDecision({ templateVersion: "v1", methodologyVersion: "m1", criteria: [{ ...criteria[0]!, weight: -1 }], alternatives: [] })).toThrow("DECISION_CRITERIA_INVALID");
    expect(() => analyzeDecision({ templateVersion: "v1", methodologyVersion: "m1", criteria: [criteria[0]!, criteria[0]!], alternatives: [] })).toThrow("DECISION_CRITERIA_INVALID");
    expect(() => analyzeDecision({ templateVersion: "v1", methodologyVersion: "m1", criteria: [criteria[0]!], alternatives: [{ id: "A", values: { access: { value: Number.NaN, evidenceRefs: ["e1"], admitted: true } } }] })).toThrow("DECISION_VALUE_INVALID");
  });

  it("does not call an empty decision ready and reports ranking sensitivity", () => {
    const empty = analyzeDecision({ templateVersion: "v1", methodologyVersion: "mcda-v1", criteria, alternatives: [] });
    expect(empty.readiness.status).toBe("blocked");
    const sensitive = analyzeDecision({
      templateVersion: "v1", methodologyVersion: "mcda-v1", criteria: [{ ...criteria[0]!, weight: 1.16 }, criteria[1]!],
      alternatives: [
        { id: "A", values: { access: { value: 0.9, evidenceRefs: ["e1"], admitted: true }, cost: { value: 0.8, evidenceRefs: ["e2"], admitted: true } } },
        { id: "B", values: { access: { value: 0.4, evidenceRefs: ["e3"], admitted: true }, cost: { value: 0.2, evidenceRefs: ["e4"], admitted: true } } },
      ],
    });
    expect(sensitive.sensitivity.relativeWeightDelta).toBe(0.1);
    expect(sensitive.sensitivity.stableTopChoice).toBe(false);
    expect(sensitive.sensitivity.changedTopAlternativeIds).toContain("A");
  });

  it("keeps alternatives with missing required evidence out of the comparable ranking", () => {
    const result = analyzeDecision({
      templateVersion: "v1", methodologyVersion: "mcda-v1", criteria,
      alternatives: [
        { id: "complete", values: { access: { value: 0.7, evidenceRefs: ["e1"], admitted: true }, cost: { value: 0.8, evidenceRefs: ["e2"], admitted: true } } },
        { id: "incomplete", values: { access: { value: 1, evidenceRefs: ["e3"], admitted: true } } },
      ],
    });
    expect(result.ranking.map(item => item.alternativeId)).toEqual(["complete", "incomplete"]);
    expect(result.ranking[1]?.comparable).toBe(false);
    expect(result.readiness).toMatchObject({ status: "partial", requiredCovered: 1, requiredTotal: 2 });
    expect(result.materiallyDistinguishable).toBe(false);
  });
});
