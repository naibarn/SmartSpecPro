import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { P2298_CANDIDATE_SEEDS } from "./libraryRetrievalGoldCandidateSeeds";
import {
  countGoldDataset,
  assignDeterministicSplits,
  bootstrapMean95,
  deterministicStratifiedSample,
  evaluateGoldDataset,
  validateGoldDataset,
  wilson95,
  isReleaseEvaluationEligible,
  isHeldOutReleaseEvaluationEligible,
  isReleaseCohortReady,
  missingRequiredQueryClasses,
} from "./libraryRetrievalGoldDataset";
import { retrievalBenchmarkObservationSchema } from "./libraryRetrievalBenchmark";

describe("SPEC-229 gold dataset pipeline", () => {
  it("validates pinned source digests and source spans for development candidates", () => {
    validateGoldDataset(
      P2298_CANDIDATE_SEEDS,
      resolve(process.cwd(), "../../")
    );
    expect(P2298_CANDIDATE_SEEDS).toHaveLength(10);
    expect(() =>
      validateGoldDataset(
        [
          {
            ...P2298_CANDIDATE_SEEDS[0],
            source: {
              ...P2298_CANDIDATE_SEEDS[0].source,
              sha256: "f".repeat(64),
            },
          },
        ],
        resolve(process.cwd(), "../../")
      )
    ).toThrow("Gold source digest mismatch");
  });

  it("keeps machine review separate from human review and accepted gold eligibility", () => {
    const counts = countGoldDataset(P2298_CANDIDATE_SEEDS);
    expect(counts).toMatchObject({
      candidateQueries: 10,
      unreviewed: 0,
      independentlyReviewed: 10,
      machineReviewed: 10,
      humanReviewed: 0,
      humanAccepted: 0,
      reviewAccepted: 10,
      acceptedForGold: 0,
      releaseApproved: 0,
      heldOutReleaseApproved: 0,
      developmentOnly: 10,
    });
    expect(
      countGoldDataset([{ ...P2298_CANDIDATE_SEEDS[0], reviews: [] }])
        .unreviewed
    ).toBe(1);
  });

  it("never evaluates release criteria using only development or calibration rows", () => {
    const classes = [
      "semantic_paraphrase",
      "exact_id",
      "uuid",
      "error_code",
      "api_path",
      "filename",
      "spec_id",
      "follow_up",
      "ambiguous",
      "typo",
      "multi_hop",
      "stale_conflict",
      "no_answer",
      "acl_attack",
      "deleted_revoked",
      "ocr",
      "long_document",
      "code_config_log",
    ];
    const approved = Array.from({ length: 500 }, (_, index) => {
      const seed = P2298_CANDIDATE_SEEDS[0];
      return {
        ...seed,
        caseId: `approved-development-${index}`,
        query: `${seed.query} ${index}`,
        sourceGroupId: `development-source-${index}`,
        split: "development" as const,
        classes,
        useApproval: "release_approved" as const,
        useApprovalEvidence: {
          approverId: "human-owner",
          approverType: "human" as const,
          approvedAt: "2026-10-17T00:00:00.000Z",
          scope: "evaluation fixture",
        },
      };
    });
    const observations = approved.map(item => ({
      caseId: item.caseId,
      answerSupported: false,
      coveredClaims: [],
      evidence: [],
      citations: [],
      providerState: "complete" as const,
    }));

    expect(countGoldDataset(approved)).toMatchObject({
      releaseApproved: 500,
      heldOutReleaseApproved: 0,
    });
    expect(isHeldOutReleaseEvaluationEligible(approved[0])).toBe(false);
    expect(evaluateGoldDataset(approved, observations)).toMatchObject({
      metrics: { caseCount: 500 },
      releaseStatus: "NOT_EVALUABLE",
    });

    const oneHeldOut = approved.map((item, index) =>
      index === 0 ? { ...item, split: "held_out" as const } : item
    );
    const evaluation = evaluateGoldDataset(oneHeldOut, observations);
    expect(countGoldDataset(oneHeldOut).heldOutReleaseApproved).toBe(1);
    expect(isReleaseCohortReady(countGoldDataset(oneHeldOut))).toBe(false);
    expect(evaluation).toMatchObject({
      metrics: { caseCount: 500 },
      releaseStatus: "NOT_EVALUABLE",
    });
    expect(
      evaluation.releaseCriteria.find(
        criterion => criterion.id === "heldOutGoldQueryCount"
      )
    ).toMatchObject({ value: 1, status: "NOT_EVALUABLE" });
  });

  it("rejects self-review and source-group leakage across data splits", () => {
    const selfReviewed = {
      ...P2298_CANDIDATE_SEEDS[0],
      reviews: [
        {
          ...P2298_CANDIDATE_SEEDS[0].reviews[0],
          reviewerId: P2298_CANDIDATE_SEEDS[0].generator.id,
        },
      ],
    };
    expect(() => validateGoldDataset([selfReviewed])).toThrow(
      "Generator cannot independently review"
    );
    expect(() =>
      validateGoldDataset([
        P2298_CANDIDATE_SEEDS[0],
        { ...P2298_CANDIDATE_SEEDS[1], split: "held_out" },
      ])
    ).toThrow("Source group crosses dataset splits");
    expect(() =>
      validateGoldDataset([
        P2298_CANDIDATE_SEEDS[0],
        {
          ...P2298_CANDIDATE_SEEDS[1],
          query: P2298_CANDIDATE_SEEDS[0].query,
          split: "held_out",
          sourceGroupId: P2298_CANDIDATE_SEEDS[1].source.path,
        },
      ])
    ).toThrow("Duplicate normalized query inflates dataset");
    expect(() =>
      validateGoldDataset([
        P2298_CANDIDATE_SEEDS[0],
        {
          ...P2298_CANDIDATE_SEEDS[1],
          query: `  ${P2298_CANDIDATE_SEEDS[0].query.toLocaleUpperCase()}  `,
        },
      ])
    ).toThrow("Duplicate normalized query inflates dataset");
    expect(() =>
      validateGoldDataset([
        {
          ...P2298_CANDIDATE_SEEDS[1],
          sourceGroupId: "forged-other-source",
        },
      ])
    ).toThrow("sourceGroupId must bind");
    expect(() =>
      validateGoldDataset(
        [
          {
            ...P2298_CANDIDATE_SEEDS[0],
            sourceGroupId: "../../etc/passwd",
            source: {
              ...P2298_CANDIDATE_SEEDS[0].source,
              path: "../../etc/passwd",
            },
          },
        ],
        resolve(process.cwd(), "../../")
      )
    ).toThrow("Unsafe gold source path");
  });

  it("uses deterministic class-stratified sampling and reports small data as not evaluable", () => {
    const once = deterministicStratifiedSample(P2298_CANDIDATE_SEEDS, 2).map(
      item => item.caseId
    );
    const twice = deterministicStratifiedSample(P2298_CANDIDATE_SEEDS, 2).map(
      item => item.caseId
    );
    expect(once).toEqual(twice);
    expect(
      evaluateGoldDataset(P2298_CANDIDATE_SEEDS, undefined).releaseStatus
    ).toBe("NOT_EVALUABLE");
    const assigned = assignDeterministicSplits(P2298_CANDIDATE_SEEDS);
    expect(
      assignDeterministicSplits(P2298_CANDIDATE_SEEDS).map(row => row.split)
    ).toEqual(assigned.map(row => row.split));
    expect(new Set(assigned.map(row => row.split)).size).toBe(1);
  });

  it("calculates reproducible Wilson confidence intervals", () => {
    expect(wilson95(0, 0)).toBeNull();
    expect(wilson95(8, 10)).toEqual(wilson95(8, 10));
    expect(wilson95(8, 10)?.lower).toBeLessThan(0.8);
    expect(wilson95(8, 10)?.upper).toBeGreaterThan(0.8);
  });

  it("calculates deterministic percentile bootstrap intervals only at the reporting sample floor", () => {
    expect(bootstrapMean95(Array(29).fill(0.5), "seed")).toBeNull();
    const values = [...Array(20).fill(0.25), ...Array(20).fill(0.75)];
    expect(bootstrapMean95(values, "fixed-seed")).toEqual(
      bootstrapMean95(values, "fixed-seed")
    );
    expect(bootstrapMean95(Array(30).fill(0.5), "constant-seed")).toEqual({
      lower: 0.5,
      upper: 0.5,
    });
  });

  it("fails closed on missing authorization and refuses release freshness without an expected revision", () => {
    const observation = {
      caseId: "x",
      answerSupported: false,
      coveredClaims: [],
      evidence: [
        {
          evidenceId: "d",
          tenantId: "t",
          revision: "r1",
          digest: "a".repeat(64),
          authorityRank: 1,
        },
      ],
      citations: [],
      providerState: "complete",
    };
    expect(() =>
      retrievalBenchmarkObservationSchema.parse(observation)
    ).toThrow();
    expect(isReleaseEvaluationEligible(P2298_CANDIDATE_SEEDS[0])).toBe(false);
    expect(missingRequiredQueryClasses(P2298_CANDIDATE_SEEDS)).toContain(
      "semantic_paraphrase"
    );
  });

  it("does not count human votes accepted later by rejection or pending adjudication", () => {
    const humanAcceptedThenRejected = {
      ...P2298_CANDIDATE_SEEDS[0],
      reviews: [
        {
          reviewerId: "human-1",
          reviewerVersion: "review-form-v1",
          reviewerType: "human" as const,
          recordedAt: "2026-10-17T00:00:00.000Z",
          decision: "accept_candidate" as const,
          rationale: "reviewed",
        },
      ],
      adjudication: {
        reviewerId: "human-2",
        reviewerVersion: "review-form-v1",
        reviewerType: "human" as const,
        recordedAt: "2026-10-17T00:00:00.000Z",
        decision: "reject" as const,
        rationale: "source span mismatch",
      },
    };
    expect(countGoldDataset([humanAcceptedThenRejected]).humanAccepted).toBe(0);
  });

  it("lets an independent adjudication resolve a pending review and keeps pending adjudication pending", () => {
    const candidate = P2298_CANDIDATE_SEEDS[0];
    const pending = {
      ...candidate,
      reviews: [
        { ...candidate.reviews[0], decision: "needs_adjudication" as const },
      ],
      adjudication: {
        reviewerId: "human-adjudicator",
        reviewerVersion: "form-v1",
        reviewerType: "human" as const,
        recordedAt: "2026-10-17T00:02:00.000Z",
        decision: "accept_candidate" as const,
        rationale: "source verified",
      },
    };
    expect(countGoldDataset([pending])).toMatchObject({
      reviewAccepted: 1,
      pendingAdjudication: 0,
      humanAccepted: 1,
    });
    const unresolved = {
      ...pending,
      adjudication: {
        ...pending.adjudication,
        decision: "needs_adjudication" as const,
      },
    };
    expect(countGoldDataset([unresolved]).pendingAdjudication).toBe(1);
  });
});
