import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVELOPMENT_GOLD_CASES } from "./libraryRetrievalBenchmark.fixtures";
import {
  buildNonProductionReleaseCohort,
  countGoldDataset,
  goldDatasetCandidateSchema,
  isReleaseCohortReady,
  validateGoldDataset,
} from "./libraryRetrievalGoldDataset";

describe("SPEC-229 non-production release cohort preparation", () => {
  it("rejects candidates whose expected revision differs from the pinned source digest", () => {
    const candidates = goldDatasetCandidateSchema.array().parse(
      JSON.parse(
        readFileSync(
          new URL("./libraryRetrievalGoldCandidates.dev.v1.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    const staleCandidate = {
      ...candidates[0],
      benchmarkGold: {
        ...candidates[0].benchmarkGold,
        expectedRevision: `sha256:${"f".repeat(64)}`,
      },
    };

    expect(() => validateGoldDataset([staleCandidate], resolve(process.cwd(), "../..")))
      .toThrow(`Gold source revision mismatch: ${staleCandidate.caseId}`);
  });

  it("derives a reproducible held-out cohort without changing review identity", () => {
    const candidates = goldDatasetCandidateSchema.array().parse(
      JSON.parse(
        readFileSync(
          new URL("./libraryRetrievalGoldCandidates.dev.v1.json", import.meta.url),
          "utf8",
        ),
      ),
    );
    validateGoldDataset(candidates, resolve(process.cwd(), "../.."));
    const approvedAt = "2026-10-18T00:00:00.000Z";
    const cohort = buildNonProductionReleaseCohort(candidates, approvedAt);
    const repeated = buildNonProductionReleaseCohort(candidates, approvedAt);
    const counts = countGoldDataset(cohort);

    expect(cohort).toEqual(repeated);
    expect(cohort.every(item =>
      item.benchmarkGold.requiredEvidenceIds.length !== 1 ||
      item.benchmarkGold.requiredEvidenceIds[0] === item.source.path,
    )).toBe(true);
    expect(candidates.find(item => item.caseId === "b08-001")?.benchmarkGold.requiredEvidenceIds)
      .toEqual(["doc-a"]);
    expect(cohort.find(item => item.caseId === "b08-001")?.benchmarkGold.requiredEvidenceIds)
      .toEqual([cohort.find(item => item.caseId === "b08-001")?.source.path]);
    expect(DEVELOPMENT_GOLD_CASES[0].requiredEvidenceIds).toEqual(["doc-a"]);
    expect(cohort.every(item => {
      if (item.benchmarkGold.requiredEvidenceIds.length === 1) return true;
      return JSON.stringify(item.benchmarkGold.requiredEvidenceIds) === JSON.stringify(
        candidates.find(row => row.caseId === item.caseId)?.benchmarkGold.requiredEvidenceIds,
      );
    })).toBe(true);
    expect(counts).toMatchObject({
      candidateQueries: 560,
      independentlyReviewed: 560,
      machineReviewed: 560,
      humanReviewed: 0,
      humanAccepted: 0,
      reviewAccepted: 560,
      acceptedForGold: 560,
      releaseApproved: 560,
      heldOutReleaseApproved: 503,
      ownerDelegatedPolicySourceUseApproved: 560,
      pendingAdjudication: 0,
    });
    expect(
      cohort.every(item =>
        item.reviews === candidates.find(row => row.caseId === item.caseId)?.reviews,
      ),
    ).toBe(true);
    expect(
      cohort.every(
        item => item.useApprovalEvidence?.scope === "non-production retrieval evaluation",
      ),
    ).toBe(true);
    expect(cohort.every(item => item.split === "held_out" || item.split === "development")).toBe(true);
    expect(isReleaseCohortReady(counts)).toBe(true);
  });
});
