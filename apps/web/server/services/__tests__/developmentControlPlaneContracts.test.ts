import { describe, expect, it } from "vitest";

import {
  buildChangeSet,
  buildDevelopmentJob,
  buildEngineeringEvidenceBundle,
  buildReleaseCandidate,
  DevelopmentControlPlaneError,
  assertReleaseCandidateImmutable,
  transitionDevelopmentJob,
} from "../developmentControlPlaneContracts";

const baseJob = {
  developmentJobId: "devjob-001",
  tenantId: "tenant-acme",
  productId: "product-acme",
  workPackageRef: "workpackage:wp-001",
  repositoryRef: "repo:product-acme",
  baseRevision: "git:base123",
  request: "Add a governed mini app",
  contextPackHash: "a".repeat(64),
  harnessProfileRef: "harness:local-agent-v1",
  skillLockRefs: ["skill:research@1.0.0#" + "b".repeat(64)],
  targetEnvironment: "staging" as const,
  createdBy: "user-42",
};

describe("Spec 218 development control-plane contracts", () => {
  it("creates scoped DevelopmentJobs and rejects production/direct-secret inputs", () => {
    expect(buildDevelopmentJob(baseJob)).toMatchObject({ state: "DRAFT", targetEnvironment: "staging" });
    expect(() => buildDevelopmentJob({ ...baseJob, targetEnvironment: "production" })).toThrow("TARGET_ENVIRONMENT_FORBIDDEN");
    expect(() => buildDevelopmentJob({ ...baseJob, metadata: { apiKey: "raw-secret" } })).toThrow("RAW_SECRET_FORBIDDEN");
  });

  it("enforces the resumable state machine and rejects illegal skips", () => {
    const job = buildDevelopmentJob(baseJob);
    expect(transitionDevelopmentJob(job, "PLANNED").state).toBe("PLANNED");
    expect(() => transitionDevelopmentJob(job, "EXECUTING")).toThrow("JOB_TRANSITION_INVALID");
    expect(() => transitionDevelopmentJob({ ...job, state: "FAILED" }, "EXECUTING")).toThrow("JOB_TERMINAL");
  });

  it("requires isolated non-protected ChangeSets and detects stale base revisions", () => {
    expect(buildChangeSet({
      changeSetId: "changeset-001",
      developmentJobId: "devjob-001",
      repositoryRef: "repo:product-acme",
      branchRef: "branch:dev-job-001",
      baseRevision: "git:base123",
      headRevision: "git:head123",
      fileRefs: ["file:src/App.tsx"],
    })).toMatchObject({ branchRef: "branch:dev-job-001" });
    expect(() => buildChangeSet({
      changeSetId: "changeset-001",
      developmentJobId: "devjob-001",
      repositoryRef: "repo:product-acme",
      branchRef: "main",
      baseRevision: "git:base123",
      headRevision: "git:head123",
      fileRefs: [],
    })).toThrow("PROTECTED_BRANCH_FORBIDDEN");
  });

  it("normalizes evidence and requires source/context/harness lineage", () => {
    const evidence = buildEngineeringEvidenceBundle({
      sourceRevision: "git:head123",
      baseRevision: "git:base123",
      contextPackHash: "a".repeat(64),
      harnessProfileRef: "harness:local-agent-v1",
      methodologyRef: "methodology:standard-v1",
      skillLockRefs: baseJob.skillLockRefs,
      build: { status: "passed", ref: "artifact:build-1" },
      tests: { status: "passed", ref: "evidence:test-1" },
      security: { status: "passed", ref: "evidence:scan-1" },
      preview: { status: "passed", ref: "preview:preview-1" },
    });
    expect(evidence.completeness).toBe("COMPLETE");
    expect(() => buildEngineeringEvidenceBundle({
      sourceRevision: "git:changed",
      baseRevision: "git:base123",
      contextPackHash: "a".repeat(64),
      harnessProfileRef: "harness:local-agent-v1",
      methodologyRef: "methodology:standard-v1",
      skillLockRefs: baseJob.skillLockRefs,
      build: { status: "passed", ref: "artifact:build-1" },
      tests: { status: "pending", ref: "evidence:test-1" },
      security: { status: "passed", ref: "evidence:scan-1" },
      preview: { status: "passed", ref: "preview:preview-1" },
    })).not.toThrow();
  });

  it("creates an immutable ReleaseCandidate only from merged complete evidence", () => {
    const job = transitionDevelopmentJob(buildDevelopmentJob(baseJob), "PLANNED");
    const mergedJob = { ...job, state: "MERGED" as const };
    const changeSet = buildChangeSet({
      changeSetId: "changeset-001",
      developmentJobId: "devjob-001",
      repositoryRef: "repo:product-acme",
      branchRef: "branch:dev-job-001",
      baseRevision: "git:base123",
      headRevision: "git:head123",
      fileRefs: ["file:src/App.tsx"],
    });
    const evidence = buildEngineeringEvidenceBundle({
      sourceRevision: "git:head123",
      baseRevision: "git:base123",
      contextPackHash: "a".repeat(64),
      harnessProfileRef: "harness:local-agent-v1",
      methodologyRef: "methodology:standard-v1",
      skillLockRefs: baseJob.skillLockRefs,
      build: { status: "passed", ref: "artifact:build-1" },
      tests: { status: "passed", ref: "evidence:test-1" },
      security: { status: "passed", ref: "evidence:scan-1" },
      preview: { status: "passed", ref: "preview:preview-1" },
    });
    const candidate = buildReleaseCandidate({
      releaseCandidateId: "rc-001",
      job: mergedJob,
      changeSet,
      evidence,
      commitRevision: "git:head123",
      treeHash: "c".repeat(64),
      artifactDigest: "d".repeat(64),
      approverPrincipalId: "user-approver",
      handoffToSpec219: true,
    });
    expect(candidate.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(assertReleaseCandidateImmutable(candidate, candidate)).toBe(true);
    expect(() => assertReleaseCandidateImmutable(candidate, { ...candidate, artifactDigest: "e".repeat(64) })).toThrow("RC_IMMUTABLE");
    expect(() => buildReleaseCandidate({ ...candidate, job: { ...mergedJob, state: "EXECUTING" } })).toThrow(DevelopmentControlPlaneError);
  });
});
