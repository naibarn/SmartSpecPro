import { describe, expect, it } from "vitest";
import { sha256 } from "./libraryCitationAnchor";
import {
  DEVELOPMENT_GOLD_CASES,
  DEVELOPMENT_OBSERVATIONS,
} from "./libraryRetrievalBenchmark.fixtures";
import { P2298_CANDIDATE_SEEDS } from "./libraryRetrievalGoldCandidateSeeds";
import { calculateRetrievalBenchmarkMetrics } from "./libraryRetrievalBenchmark";
import {
  buildGoldDatasetReviewQueue,
  evaluateGoldDataset,
  SPEC_229_REQUIRED_QUERY_CLASSES,
} from "./libraryRetrievalGoldDataset";

const markdown = "# Approved reference\nThe approved value is 42.";
const digest = sha256(markdown);
const quoteHash = sha256("The approved value is 42.");
const latencyProfiles = [
  "simple_exact_keyword",
  "hybrid_rerank",
  "rewrite_hybrid_rerank",
] as const;

function releaseCohort() {
  return Array.from({ length: 500 }, (_, index) => {
    const supportsAnswer = index % 5 !== 0;
    return {
      ...DEVELOPMENT_GOLD_CASES[0],
      caseId: `synthetic-release-control-${index}`,
      query: `synthetic query ${index}`,
      language: (["thai", "english", "mixed"] as const)[index % 3],
      classes: [...SPEC_229_REQUIRED_QUERY_CLASSES],
      sourceGroupId: `synthetic-source-${index}`,
      split: "held_out" as const,
      useApproval: "release_approved" as const,
      useApprovalEvidence: {
        approverId: "synthetic-test-owner",
        approverType: "human" as const,
        approvedAt: "2026-10-18T00:00:00.000Z",
        scope: "synthetic evaluator regression fixture only",
      },
      generator: {
        id: "synthetic-test-generator",
        version: "fixture-v1",
      },
      reviews: [
        {
          reviewerId: "synthetic-independent-reviewer",
          reviewerVersion: "fixture-v1",
          reviewerType: "agent" as const,
          decision: "accept_candidate" as const,
          rationale: "deterministic test fixture",
        },
      ],
      disagreement: { present: false },
      benchmarkGold: {
        tenantId: "tenant-a",
        supportsAnswer,
        requiredEvidenceIds: supportsAnswer ? [`expected-${index}`] : [],
        requiredClaims: supportsAnswer ? [`claim-${index}`] : [],
        minimumAuthorityRank: 2,
        expectedRevision: "r1",
        shouldCite: supportsAnswer,
        exactIdentifier: true,
        gradedRelevantEvidence: [],
      },
    };
  });
}

function positiveObservations(cases: ReturnType<typeof releaseCohort>) {
  return cases.map((item, index) => ({
    caseId: item.caseId,
    comparisonProfile: "multi_query" as const,
    answerSupported: item.benchmarkGold.supportsAnswer,
    coveredClaims: item.benchmarkGold.requiredClaims,
    evidence: item.benchmarkGold.supportsAnswer
      ? [
          {
            evidenceId: `expected-${index}`,
            tenantId: "tenant-a",
            revision: "r1",
            digest,
            authorityRank: 3,
            authorized: true,
            revoked: false,
            deleted: false,
          },
        ]
      : [],
    citations: item.benchmarkGold.supportsAnswer
      ? [
          {
            evidenceId: `expected-${index}`,
            revision: "r1",
            digest,
            lineStart: 2,
            lineEnd: 2,
            quoteHash,
            markdown,
          },
        ]
      : [],
    providerState: "complete" as const,
  }));
}

function latencyRuns(observations: ReturnType<typeof positiveObservations>) {
  return Object.fromEntries(
    latencyProfiles.map((latencyProfile, profileIndex) => [
      latencyProfile,
      observations.map((observation, index) => ({
        ...observation,
        latencyProfile,
        latencyMs: 100 + profileIndex * 100 + (index % 11),
      })),
    ])
  );
}

describe("SPEC-229 synthetic benchmark controls", () => {
  it("identifies the four injected negative-control classes in the 9-case fixture", () => {
    const metrics = calculateRetrievalBenchmarkMetrics(
      DEVELOPMENT_GOLD_CASES,
      DEVELOPMENT_OBSERVATIONS
    );

    expect(metrics).toMatchObject({
      crossTenantLeakage: 1,
      unauthorizedEvidenceLeakage: 1,
      staleOrRevokedEvidenceAccepted: 3,
      unsafePartialOrOutageAnswers: 1,
    });
  });

  it("builds a deterministic human review queue without promoting machine review", () => {
    const first = buildGoldDatasetReviewQueue(P2298_CANDIDATE_SEEDS);
    const second = buildGoldDatasetReviewQueue(P2298_CANDIDATE_SEEDS);
    expect(first).toEqual(second);
    expect(first.entries).toHaveLength(P2298_CANDIDATE_SEEDS.length);
    expect(
      first.entries.every(
        entry =>
          entry.humanReviewStatus === "PENDING_HUMAN_REVIEW" &&
          entry.sourceUseApprovalStatus ===
            "PENDING_OWNER_SOURCE_USE_APPROVAL" &&
          entry.sourceUseApprovalEvidence === null
      )
    ).toBe(true);
  });

  it("keeps conflicting or pending human reviews out of accepted queue states", () => {
    const seed = P2298_CANDIDATE_SEEDS[0]!;
    const review = (
      reviewerId: string,
      decision: "accept_candidate" | "reject" | "needs_adjudication"
    ) => ({
      reviewerId,
      reviewerVersion: "test-v1",
      reviewerType: "human" as const,
      decision,
      rationale: "review queue state regression fixture",
    });
    const candidates = [
      {
        ...seed,
        caseId: "review-conflict",
        reviews: [
          review("human-a", "accept_candidate"),
          review("human-b", "reject"),
        ],
        disagreement: {
          present: true,
          rationale: "conflicting human decisions",
        },
        adjudication: undefined,
      },
      {
        ...seed,
        caseId: "review-needs-adjudication",
        reviews: [review("human-a", "needs_adjudication")],
        disagreement: { present: false },
        adjudication: undefined,
      },
      {
        ...seed,
        caseId: "review-adjudicated-accepted",
        reviews: [
          review("human-a", "accept_candidate"),
          review("human-b", "reject"),
        ],
        disagreement: {
          present: true,
          rationale: "conflicting human decisions",
        },
        adjudication: review("human-adjudicator", "accept_candidate"),
      },
    ];

    const queue = buildGoldDatasetReviewQueue(candidates);
    expect(
      Object.fromEntries(
        queue.entries.map(entry => [entry.caseId, entry.humanReviewStatus])
      )
    ).toEqual({
      "review-conflict": "PENDING_HUMAN_REVIEW",
      "review-needs-adjudication": "PENDING_HUMAN_REVIEW",
      "review-adjudicated-accepted": "HUMAN_ACCEPTED",
    });
  });

  it("compares against a clean positive control without masking the injected failures", () => {
    const observations = positiveObservations(releaseCohort());
    const metrics = calculateRetrievalBenchmarkMetrics(
      DEVELOPMENT_GOLD_CASES,
      DEVELOPMENT_OBSERVATIONS
    );
    const positiveControlMetrics = calculateRetrievalBenchmarkMetrics(
      observations
        .slice(0, DEVELOPMENT_GOLD_CASES.length)
        .map((item, index) => ({
          ...DEVELOPMENT_GOLD_CASES[index],
          caseId: item.caseId,
          tenantId: "tenant-a",
          supportsAnswer: item.answerSupported,
          requiredEvidenceIds: item.evidence.map(row => row.evidenceId),
          requiredClaims: item.coveredClaims,
          expectedRevision: "r1",
          shouldCite: item.citations.length > 0,
          exactIdentifier: true,
        })),
      observations.slice(0, DEVELOPMENT_GOLD_CASES.length)
    );

    expect(metrics.crossTenantLeakage).toBe(1);
    expect(positiveControlMetrics).toMatchObject({
      crossTenantLeakage: 0,
      unauthorizedEvidenceLeakage: 0,
      staleOrRevokedEvidenceAccepted: 0,
      unsafePartialOrOutageAnswers: 0,
      citationPrecision: 1,
      freshnessCorrectness: 1,
    });
  });

  it("can combine all three latency profiles and makes a negative control fail release", () => {
    const candidates = releaseCohort();
    const clean = positiveObservations(candidates);
    const cleanEvaluation = evaluateGoldDataset(
      candidates,
      clean,
      latencyRuns(clean)
    );
    expect(cleanEvaluation.releaseStatus).toBe("PASS");

    const injected = clean.map((observation, index) => {
      if (index === 1)
        return {
          ...observation,
          evidence: observation.evidence.map(item => ({
            ...item,
            tenantId: "tenant-b",
          })),
        };
      if (index === 2)
        return {
          ...observation,
          evidence: observation.evidence.map(item => ({
            ...item,
            authorized: false,
          })),
        };
      if (index === 3)
        return {
          ...observation,
          evidence: observation.evidence.map(item => ({
            ...item,
            revision: "r0",
          })),
        };
      if (index === 4)
        return {
          ...observation,
          evidence: observation.evidence.map(item => ({
            ...item,
            revoked: true,
          })),
        };
      if (index === 7)
        return {
          ...observation,
          evidence: observation.evidence.map(item => ({
            ...item,
            deleted: true,
          })),
        };
      if (index === 6)
        return { ...observation, providerState: "partial" as const };
      return observation;
    });
    const injectedEvaluation = evaluateGoldDataset(
      candidates,
      injected,
      latencyRuns(injected)
    );

    expect(injectedEvaluation.metrics).toMatchObject({
      crossTenantLeakage: 1,
      unauthorizedEvidenceLeakage: 1,
      staleOrRevokedEvidenceAccepted: 3,
      unsafePartialOrOutageAnswers: 1,
    });
    expect(injectedEvaluation.releaseStatus).toBe("FAIL");
    expect(
      injectedEvaluation.releaseCriteria.every(
        row => row.status !== "NOT_EVALUABLE"
      )
    ).toBe(true);
  });
});
