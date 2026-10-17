import { describe, expect, it } from "vitest";
import { DEVELOPMENT_GOLD_CASES, DEVELOPMENT_OBSERVATIONS } from "./libraryRetrievalBenchmark.fixtures";
import {
  calculateRetrievalBenchmarkMetrics,
  retrievalBenchmarkGoldCaseSchema,
  SPEC_229_RELEASE_CRITERIA,
} from "./libraryRetrievalBenchmark";

describe("Library retrieval development benchmark", () => {
  it("validates deterministic development gold labels and computes reproducible metrics", () => {
    expect(DEVELOPMENT_GOLD_CASES.map(item => retrievalBenchmarkGoldCaseSchema.parse(item))).toHaveLength(9);
    expect(calculateRetrievalBenchmarkMetrics(DEVELOPMENT_GOLD_CASES, DEVELOPMENT_OBSERVATIONS)).toEqual({
      caseCount: 9,
      evidenceRecall: 1,
      recallAt5: 1,
      recallAt10: 1,
      recallAt20: 1,
      recallAt50: 1,
      hitAt5: 1,
      hitAt10: 1,
      hitAt20: 1,
      hitAt50: 1,
      mrrAt10: 1,
      nDCGAt10: 1,
      exactIdentifierHitAt5: 1,
      thaiRecallAt20: 1,
      englishRecallAt20: 1,
      mixedRecallAt20: 1,
      evidenceCoverage: 0.8,
      citationPrecision: 0.5,
      citationAvailability: 0.25,
      freshnessCorrectness: 0.571429,
      authorityCorrectness: 0.857143,
      aclLeakage: 1,
      unsafePartialOrOutageAnswers: 1,
      staleOrRevokedEvidenceAccepted: 3,
      noAnswerPrecision: 1,
      noAnswerRecall: 1,
      partialOrOutageResults: 2,
      p50LatencyMs: null,
      p95LatencyMs: null,
      p99LatencyMs: null,
      meanCostMicros: null,
    });
  });

  it("keeps canonical SPEC §27 release criteria unchanged and separately identifiable", () => {
    expect(SPEC_229_RELEASE_CRITERIA).toMatchObject({
      crossTenantLeakage: 0,
      unauthorizedEvidenceLeakage: 0,
      exactIdentifierHitAt5: 0.99,
      overallRecallAt20: 0.95,
      thaiRecallAt20: 0.92,
      englishRecallAt20: 0.95,
      nDCGAt10: 0.85,
      mrrAt10: 0.85,
      citationPrecision: 0.95,
      freshnessCorrectness: 0.98,
      noAnswerPrecision: 0.9,
      noAnswerRecall: 0.9,
      simpleExactKeywordP95Ms: 800,
      hybridRerankP95Ms: 1500,
      rewriteHybridRerankP95Ms: 2500,
    });
    expect(DEVELOPMENT_GOLD_CASES.length).toBeLessThan(500);
  });

  it("rejects mismatched observation counts rather than silently dropping cases", () => {
    expect(() => calculateRetrievalBenchmarkMetrics(DEVELOPMENT_GOLD_CASES, [])).toThrow("Benchmark case/observation count mismatch");
  });

  it("binds observations by caseId and rejects duplicate or missing evidence rows", () => {
    const baseline = calculateRetrievalBenchmarkMetrics(DEVELOPMENT_GOLD_CASES, DEVELOPMENT_OBSERVATIONS);
    expect(calculateRetrievalBenchmarkMetrics(
      DEVELOPMENT_GOLD_CASES,
      [...DEVELOPMENT_OBSERVATIONS].reverse(),
    )).toEqual(baseline);
    const duplicate = [...DEVELOPMENT_OBSERVATIONS];
    duplicate[1] = { ...duplicate[1], caseId: duplicate[0].caseId };
    expect(() => calculateRetrievalBenchmarkMetrics(DEVELOPMENT_GOLD_CASES, duplicate))
      .toThrow("Benchmark observations must contain each gold caseId exactly once");
  });
});
