import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { P2298_CANDIDATE_SEEDS } from "./libraryRetrievalGoldCandidateSeeds";
import {
  countGoldDataset,
  goldDatasetCandidateSchema,
  assignDeterministicSplits,
  buildGoldDatasetReviewQueue,
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
  it("validates tenant, lifecycle, and revision-pair control expectations", () => {
    const seed = P2298_CANDIDATE_SEEDS[0]!;
    const expectation = {
      controlId: "acl-deny-1",
      kind: "acl" as const,
      targetEvidenceId: "foreign-doc",
      targetTenantId: "tenant-b",
      callerTenantId: "tenant-a",
      expectedVisibility: "blocked" as const,
      expectedLifecycle: "active" as const,
    };
    expect(goldDatasetCandidateSchema.parse({
      ...seed,
      benchmarkGold: { ...seed.benchmarkGold, controlExpectations: [expectation] },
    }).benchmarkGold.controlExpectations).toHaveLength(1);
    expect(() => goldDatasetCandidateSchema.parse({
      ...seed,
      benchmarkGold: {
        ...seed.benchmarkGold,
        controlExpectations: [{ ...expectation, expectedVisibility: "visible" }],
      },
    })).toThrow("Cross-tenant ACL controls must expect blocked visibility");
    expect(() => goldDatasetCandidateSchema.parse({
      ...seed,
      benchmarkGold: {
        ...seed.benchmarkGold,
        controlExpectations: [{
          ...expectation,
          controlId: "stale-1",
          kind: "freshness",
          targetTenantId: "tenant-a",
          callerTenantId: "tenant-a",
          expectedLifecycle: "stale",
        }],
      },
    })).toThrow("Stale controls require distinct current and target revisions");
    const activeFreshness = {
      ...expectation,
      controlId: "freshness-current-1",
      kind: "freshness" as const,
      targetTenantId: "tenant-a",
      callerTenantId: "tenant-a",
      expectedVisibility: "visible" as const,
      expectedLifecycle: "active" as const,
      currentRevision: "r2",
      targetRevision: "r2",
      currentDigest: "a".repeat(64),
      targetDigest: "a".repeat(64),
    };
    expect(goldDatasetCandidateSchema.parse({
      ...seed,
      benchmarkGold: { ...seed.benchmarkGold, controlExpectations: [activeFreshness] },
    }).benchmarkGold.controlExpectations).toHaveLength(1);
    expect(() => goldDatasetCandidateSchema.parse({
      ...seed,
      benchmarkGold: {
        ...seed.benchmarkGold,
        controlExpectations: [{ ...activeFreshness, currentDigest: undefined, targetDigest: undefined }],
      },
    })).toThrow("Freshness controls require pinned current and target revisions and digests");
    expect(() => goldDatasetCandidateSchema.parse({
      ...seed,
      benchmarkGold: {
        ...seed.benchmarkGold,
        controlExpectations: [{ ...activeFreshness, expectedVisibility: "blocked" }],
      },
    })).toThrow("Active freshness controls must prove the pinned current revision is visible");
    expect(() => goldDatasetCandidateSchema.parse({
      ...seed,
      benchmarkGold: {
        ...seed.benchmarkGold,
        controlExpectations: [{ ...activeFreshness, targetRevision: "r1", targetDigest: "b".repeat(64) }],
      },
    })).toThrow("Active freshness controls must pin the same current and target revision and digest");
    expect(() => goldDatasetCandidateSchema.parse({
      ...seed,
      benchmarkGold: {
        ...seed.benchmarkGold,
        controlExpectations: [{
          ...activeFreshness,
          kind: "lifecycle",
          expectedLifecycle: "stale",
          expectedVisibility: "blocked",
          targetRevision: "r1",
          targetDigest: undefined,
        }],
      },
    })).toThrow("Lifecycle controls must target revoked, deleted, or tombstoned evidence");
  });

  it("validates the new integrity cohort without promoting it to release gold", () => {
    const candidatePath = resolve(
      process.cwd(),
      "server/services/libraryRetrievalGoldCandidates.integrity-v1.json",
    );
    const candidates = JSON.parse(readFileSync(candidatePath, "utf8")) as unknown[];
    const parsed = candidates.map(candidate => goldDatasetCandidateSchema.parse(candidate));

    validateGoldDataset(parsed, resolve(process.cwd(), "../.."));
    expect(parsed).toHaveLength(500);
    expect(parsed.every(candidate =>
      candidate.split === "development" &&
      candidate.useApproval === "development_only" &&
      candidate.reviews.length === 2 &&
      candidate.reviews[1]?.reviewerType === "agent" &&
      candidate.reviews[1]?.reviewerVersion === "independent-row-review-v1" &&
      ["accept_candidate", "reject"].includes(candidate.reviews[1]?.decision ?? "")
    )).toBe(true);
    expect(parsed.filter(candidate =>
      candidate.reviews[1]?.decision === "accept_candidate"
    )).toHaveLength(451);
    expect(parsed.filter(candidate =>
      candidate.reviews[1]?.decision === "reject"
    )).toHaveLength(49);
    expect(countGoldDataset(parsed)).toMatchObject({
      candidateQueries: 500,
      reviewAccepted: 451,
      pendingAdjudication: 0,
      humanReviewed: 0,
      humanAccepted: 0,
      releaseApproved: 0,
      heldOutReleaseApproved: 0,
    });
    expect(parsed.some(isReleaseEvaluationEligible)).toBe(false);
    expect(parsed.some(isHeldOutReleaseEvaluationEligible)).toBe(false);
  });

  it("preserves independent machine review for the unseen development cohort without certifying it", () => {
    const candidatePath = resolve(
      process.cwd(),
      "server/services/libraryRetrievalGoldCandidates.unseen-v1.json",
    );
    const reviewPath = resolve(
      process.cwd(),
      "../../specs/feature/229-Unified RAG Retrieval Intelligence, Cloudflare AI Search & Vectorize/handoff/evidence/p2298-unseen-v1-independent-machine-review-20261018.json",
    );
    const parsed = (JSON.parse(readFileSync(candidatePath, "utf8")) as unknown[])
      .map(candidate => goldDatasetCandidateSchema.parse(candidate));
    const review = JSON.parse(readFileSync(reviewPath, "utf8")) as {
      subject: { artifactSha256: string };
      reviewer: { reviewerId: string; reviewerType: string; reviewerVersion: string };
      summary: { decisionCounts: Record<string, number>; humanReviewedCount: number; releaseApprovedCount: number };
      rows: Array<{ caseId: string; decision: string; evidence: { sourcePath: string; sourceSha256: string; lineStart: number; lineEnd: number; quoteSha256: string } }>;
    };
    const sourceRows = new Map(review.rows.map(row => [row.caseId, row]));

    validateGoldDataset(parsed, resolve(process.cwd(), "../.."));
    expect(parsed).toHaveLength(549);
    expect(review.subject.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(review.reviewer.reviewerType).toBe("agent");
    expect(review.rows).toHaveLength(parsed.length);
    for (const candidate of parsed) {
      const row = sourceRows.get(candidate.caseId);
      if (!row) throw new Error(`Missing independent review for ${candidate.caseId}`);
      expect(candidate.reviews).toContainEqual(expect.objectContaining({
        reviewerId: review.reviewer.reviewerId,
        reviewerVersion: review.reviewer.reviewerVersion,
        reviewerType: "agent",
        decision: row.decision === "accept_candidate_machine_only"
          ? "accept_candidate"
          : row.decision,
      }));
      expect(candidate.source).toMatchObject({
        path: row.evidence.sourcePath,
        sha256: row.evidence.sourceSha256,
        lineStart: row.evidence.lineStart,
        lineEnd: row.evidence.lineEnd,
        quoteSha256: row.evidence.quoteSha256,
      });
    }
    expect(countGoldDataset(parsed)).toMatchObject({
      candidateQueries: 549,
      independentlyReviewed: 549,
      machineReviewed: 549,
      reviewAccepted: 487,
      pendingAdjudication: 49,
      humanReviewed: 0,
      humanAccepted: 0,
      releaseApproved: 0,
      heldOutReleaseApproved: 0,
    });
    expect(review.summary).toMatchObject({
      decisionCounts: {
        accept_candidate_machine_only: 487,
        reject: 13,
        needs_adjudication: 49,
      },
      humanReviewedCount: 0,
      releaseApprovedCount: 0,
    });
    expect(parsed.some(isReleaseEvaluationEligible)).toBe(false);
    expect(parsed.some(isHeldOutReleaseEvaluationEligible)).toBe(false);
    expect(missingRequiredQueryClasses(parsed)).toContain("thai");
    expect(missingRequiredQueryClasses(parsed)).toContain("stale_conflict");
  });

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
    const queue = buildGoldDatasetReviewQueue([P2298_CANDIDATE_SEEDS[0]]);
    expect(queue.schemaVersion).toBe("spec229-independent-review-queue-v2");
    expect(queue.entries[0]).toMatchObject({
      machineReviews: expect.any(Array),
      humanReviews: [],
      humanReviewStatus: "PENDING_HUMAN_REVIEW",
      sourceUseApprovalStatus: "PENDING_OWNER_SOURCE_USE_APPROVAL",
    });
  });

  it("validates and exposes reviewed follow-up context and multi-query variants", () => {
    const candidate = goldDatasetCandidateSchema.parse({
      ...P2298_CANDIDATE_SEEDS[0],
      classes: [...P2298_CANDIDATE_SEEDS[0].classes, "follow_up"],
      conversationContext: [
        { role: "user", content: "Earlier user question" },
        { role: "assistant", content: "Earlier assistant reply" },
      ],
      multiQueryVariants: ["reviewed alternate query"],
    });
    const queue = buildGoldDatasetReviewQueue([candidate]);
    expect(queue.entries[0]).toMatchObject({
      conversationContext: candidate.conversationContext,
      multiQueryVariants: ["reviewed alternate query"],
    });
    expect(() => goldDatasetCandidateSchema.parse({
      ...candidate,
      multiQueryVariants: Array.from({ length: 8 }, (_, index) => `variant ${index}`),
    })).toThrow();
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

  it("accepts only source-bound owner-delegated policy evidence for repository-only non-production use", () => {
    const seed = P2298_CANDIDATE_SEEDS[0];
    const approved = {
      ...seed,
      split: "held_out" as const,
      useApproval: "release_approved" as const,
      useApprovalEvidence: {
        approverType: "owner_delegated_policy" as const,
        policyId: "SPEC229_NONPRODUCTION_REPO_SOURCE" as const,
        policyVersion: 1 as const,
        authorizationRef:
          "owner-directive:SPEC229_NONPRODUCTION_EVAL" as const,
        approvedAt: "2026-10-18T00:00:00.000Z",
        sourcePath: seed.source.path,
        sourceSha256: seed.source.sha256,
        repositoryLicenseSha256:
          "e3884b252b3bfc045e55be43a34d1e80da070bc6f804ac95bf4660e97d62ebc6",
        scope: "non-production retrieval evaluation" as const,
      },
    };

    expect(isHeldOutReleaseEvaluationEligible(approved)).toBe(true);
    expect(() =>
      validateGoldDataset([approved], resolve(process.cwd(), "../../"))
    ).not.toThrow();
    expect(countGoldDataset([approved])).toMatchObject({
      machineReviewed: 1,
      humanReviewed: 0,
      humanAccepted: 0,
      releaseApproved: 1,
      humanSourceUseApproved: 0,
      ownerDelegatedPolicySourceUseApproved: 1,
      heldOutReleaseApproved: 1,
    });
    expect(() =>
      validateGoldDataset([
        {
          ...approved,
          useApprovalEvidence: {
            ...approved.useApprovalEvidence,
            sourceSha256: "f".repeat(64),
          },
        },
      ], resolve(process.cwd(), "../../"))
    ).toThrow("auditable source-use approval evidence");
    expect(isHeldOutReleaseEvaluationEligible({
      ...approved,
      source: { ...approved.source, license: "unverified" },
    })).toBe(false);
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
