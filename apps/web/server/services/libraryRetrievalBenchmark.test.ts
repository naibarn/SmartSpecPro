import { describe, expect, it } from "vitest";
import { sha256 } from "./libraryCitationAnchor";
import { DEVELOPMENT_GOLD_CASES, DEVELOPMENT_OBSERVATIONS } from "./libraryRetrievalBenchmark.fixtures";
import {
  calculateRetrievalBenchmarkMetrics,
  retrievalBenchmarkGoldCaseSchema,
  SPEC_229_RELEASE_CRITERIA,
  isCitationValid,
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
      aclControlCoverage: null,
      freshnessControlCoverage: null,
      securityControlsComplete: false,
      aclLeakage: 2,
      crossTenantLeakage: 1,
      unauthorizedEvidenceLeakage: 1,
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

  it("does not report freshness as successful when no evidence was checked", () => {
    const noEvidenceCases = [DEVELOPMENT_GOLD_CASES[0]];
    const noEvidenceObservations = [{
      ...DEVELOPMENT_OBSERVATIONS[0],
      evidence: [],
      citations: [],
    }];
    expect(calculateRetrievalBenchmarkMetrics(noEvidenceCases, noEvidenceObservations))
      .toMatchObject({ freshnessCorrectness: null, freshnessControlCoverage: null, securityControlsComplete: false });
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

  it("reports cross-tenant and unauthorized evidence leakage independently", () => {
    const metrics = calculateRetrievalBenchmarkMetrics(
      DEVELOPMENT_GOLD_CASES,
      DEVELOPMENT_OBSERVATIONS
    );
    expect(metrics.crossTenantLeakage).toBe(1);
    expect(metrics.unauthorizedEvidenceLeakage).toBe(1);
    expect(metrics.aclLeakage).toBe(2);
  });

  it("checks expected revision only against the expected source identity", () => {
    const gold = {
      caseId: "revision-with-current-distractor",
      query: "current policy",
      tenantId: "tenant-a",
      supportsAnswer: true,
      requiredEvidenceIds: ["expected-doc"],
      requiredClaims: [],
      minimumAuthorityRank: 1,
      expectedRevision: "r2",
      shouldCite: false,
    };
    const observation = {
      caseId: gold.caseId,
      answerSupported: true,
      coveredClaims: [],
      evidence: [
        {
          evidenceId: "expected-doc",
          tenantId: "tenant-a",
          revision: "r2",
          digest: "a".repeat(64),
          authorityRank: 1,
          authorized: true,
          revoked: false,
          deleted: false,
        },
        {
          evidenceId: "unrelated-current-doc",
          tenantId: "tenant-a",
          revision: "r17",
          digest: "b".repeat(64),
          authorityRank: 1,
          authorized: true,
          revoked: false,
          deleted: false,
        },
      ],
      citations: [],
      providerState: "complete" as const,
    };

    const metrics = calculateRetrievalBenchmarkMetrics([gold], [observation]);
    expect(metrics.freshnessCorrectness).toBe(1);
    expect(metrics.staleOrRevokedEvidenceAccepted).toBe(0);
  });

  it("rejects citations backed by unauthorized, cross-tenant, stale, revoked, or deleted evidence", () => {
    const markdown = "# Authorized guide\nThe approved amount is 42.";
    const digest = sha256(markdown);
    const citation = {
      evidenceId: "doc-a",
      revision: "r2",
      digest,
      lineStart: 2,
      lineEnd: 2,
      quoteHash: sha256("The approved amount is 42."),
      markdown,
    };
    const authorizedEvidence = DEVELOPMENT_OBSERVATIONS[0].evidence[0];
    expect(isCitationValid(citation, authorizedEvidence)).toBe(true);
    for (const mutation of [
      { authorized: false },
      { tenantId: "tenant-b" },
      { revision: "r1" },
      { revoked: true },
      { deleted: true },
    ]) {
      const observations = DEVELOPMENT_OBSERVATIONS.map(row =>
        row.caseId === "supported-valid-citation"
          ? {
              ...row,
              evidence: [{ ...row.evidence[0], ...mutation }],
            }
          : row
      );
      expect(
        calculateRetrievalBenchmarkMetrics(
          DEVELOPMENT_GOLD_CASES,
          observations
        ).citationPrecision
      ).toBe(0);
    }
  });
});
