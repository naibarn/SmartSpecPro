import { describe, expect, it } from "vitest";
import { P2298_CANDIDATE_SEEDS } from "./libraryRetrievalGoldCandidateSeeds";
import {
  evaluateGoldDataset,
  SPEC_229_REQUIRED_QUERY_CLASSES,
} from "./libraryRetrievalGoldDataset";
import {
  getRetrievalBenchmarkProfile,
  retrievalBenchmarkObservationSchema,
} from "./libraryRetrievalBenchmark";
import {
  DEVELOPMENT_OBSERVATIONS,
} from "./libraryRetrievalBenchmark.fixtures";

describe("SPEC-229 profile-aware benchmark observations", () => {
  it("keeps legacy observations compatible and rejects mixed profile runs", () => {
    expect(getRetrievalBenchmarkProfile(DEVELOPMENT_OBSERVATIONS)).toEqual({
      comparisonProfile: null,
      latencyProfile: null,
    });
    const profiled = DEVELOPMENT_OBSERVATIONS.map(observation => ({
      ...retrievalBenchmarkObservationSchema.parse(observation),
      comparisonProfile: "hybrid_reranker" as const,
      latencyProfile: "hybrid_rerank" as const,
    }));
    expect(getRetrievalBenchmarkProfile(profiled)).toEqual({
      comparisonProfile: "hybrid_reranker",
      latencyProfile: "hybrid_rerank",
    });
    expect(() => getRetrievalBenchmarkProfile([
      ...profiled.slice(0, -1),
      { ...profiled[profiled.length - 1], comparisonProfile: "multi_query" },
    ])).toThrow("one comparison profile per run");
  });

  it("evaluates a latency gate only for a complete, profile-matched held-out cohort", () => {
    const candidates = Array.from({ length: 500 }, (_, index) => ({
      ...P2298_CANDIDATE_SEEDS[0],
      caseId: `latency-profile-${index}`,
      query: `latency profile query ${index}`,
      language: (["thai", "english", "mixed"] as const)[index % 3],
      classes: [...SPEC_229_REQUIRED_QUERY_CLASSES],
      sourceGroupId: `latency-source-${index}`,
      split: "held_out" as const,
      useApproval: "release_approved" as const,
      useApprovalEvidence: {
        approverId: "human-owner",
        approverType: "human" as const,
        approvedAt: "2026-10-17T00:00:00.000Z",
        scope: "synthetic latency profile fixture",
      },
      reviews: [
        {
          reviewerId: "independent-agent",
          reviewerVersion: "test-v1",
          reviewerType: "agent" as const,
          decision: "accept_candidate" as const,
          rationale: "test fixture",
        },
      ],
      benchmarkGold: {
        ...P2298_CANDIDATE_SEEDS[0].benchmarkGold,
        tenantId: "tenant-test",
        supportsAnswer: true,
        requiredEvidenceIds: [`evidence-${index}`],
        requiredClaims: [`claim-${index}`],
        expectedRevision: "revision-1",
        shouldCite: false,
        exactIdentifier: true,
      },
    }));
    const observations = candidates.map((candidate, index) => ({
      caseId: candidate.caseId,
      comparisonProfile: "ai_search_bm25" as const,
      latencyProfile: "simple_exact_keyword" as const,
      answerSupported: true,
      coveredClaims: [`claim-${index}`],
      evidence: [
        {
          evidenceId: `evidence-${index}`,
          tenantId: "tenant-test",
          revision: "revision-1",
          digest: "a".repeat(64),
          authorityRank: 1,
          authorized: true,
          revoked: false,
          deleted: false,
        },
      ],
      citations: [],
      providerState: "complete" as const,
      latencyMs: 700,
    }));

    const evaluation = evaluateGoldDataset(candidates, observations);
    expect(evaluation.releaseCriteria.find(
      criterion => criterion.id === "simpleExactKeywordP95Ms"
    )).toMatchObject({ value: 700, status: "PASS" });
    expect(evaluation.releaseCriteria.find(
      criterion => criterion.id === "hybridRerankP95Ms"
    )).toMatchObject({ value: null, status: "NOT_EVALUABLE" });
    expect(() => evaluateGoldDataset(candidates, [
      ...observations.slice(0, -1),
      { ...observations[observations.length - 1], latencyProfile: "hybrid_rerank" },
    ])).toThrow("one latency profile per run");
    expect(evaluateGoldDataset(candidates, [
      ...observations.slice(0, -1),
      { ...observations[observations.length - 1], latencyMs: undefined },
    ]).releaseCriteria.find(
      criterion => criterion.id === "simpleExactKeywordP95Ms"
    )).toMatchObject({ value: null, status: "NOT_EVALUABLE" });
  });
});
