import { describe, expect, it } from "vitest";

import { createSpec224WorkspaceLifecycleReceiptReader } from "../spec224WorkspaceLifecycleReceiptReader";
import type { Spec224WorkspaceLifecycleReceiptReadInput } from "../spec224DevelopmentRunContracts";

const input: Spec224WorkspaceLifecycleReceiptReadInput = {
  runId: "run-r11-fixture",
  tenantId: "tenant-fixture",
  actorId: 42,
  repositoryRef: "repo:fixture-repository",
  projectId: "project-fixture",
  canonicalRef: "refs/heads/main",
  integratedSha: "a".repeat(40),
  convergenceEvidenceRef: "evidence:workspace-convergence:converged-1",
  retirementEvidenceRef: "evidence:worktree-retirement:retired-1",
  convergenceAuthorityJobId: "job-converge-1",
  retirementAuthorityJobId: "job-retire-1",
};

function authorityJob(id: string, kind: "convergence" | "retirement", overrides: Record<string, unknown> = {}) {
  const action = kind === "convergence" ? "SYNC_WORKSPACE_SAFELY" : "RETIRE_SAFE_WORKTREE";
  const inner = kind === "convergence"
    ? {
        receipt_id: "workspace-convergence:converged-1", project_id: "project-fixture",
        repository_id: "fixture-repository", workspace_id: "canonical", task_id: input.runId,
        workspace_role: "CANONICAL_USER_WORKSPACE", result: "USER_WORKSPACE_CONVERGED", dirty: false,
        canonical_ref: "refs/heads/main", integrated_sha: "a".repeat(40), canonical_sha: "b".repeat(40),
        canonical_user_workspace_sha: "b".repeat(40), verified_at: "2026-10-11T08:00:00.000Z",
      }
    : {
        receipt_id: "worktree-retirement:retired-1", project_id: "project-fixture",
        repository_id: "fixture-repository", workspace_id: "task-worktree", task_id: input.runId,
        workspace_role: "TASK_WORKTREE", result: "WORKTREE_RETIRED", integration_verified: true,
        owner_state: "NO_ACTIVE_SESSION", workspace_sha: "b".repeat(40), canonical_sha: "b".repeat(40),
        retired_at: "2026-10-11T08:00:00.000Z",
      };
  return {
    jobId: id,
    tenantId: input.tenantId,
    requestedByUserId: input.actorId,
    jobType: "workspace.authority.safe_action",
    status: "succeeded",
    input: {
      tenantId: input.tenantId, actorId: input.actorId, projectId: input.projectId,
      repositoryId: "fixture-repository", workspaceId: "workspace-fixture", action,
      authority: {
        runnerId: "runner-fixture", snapshotRevision: "snapshot-1",
        snapshotObservedAt: "2026-10-11T07:59:00.000Z",
        snapshotExpiresAt: "2026-10-11T08:01:00.000Z",
      },
    },
    output: {
      receipt: {
        schemaVersion: "workspace-authority-action-receipt.v1", receiptId: `workspace-action:${id}`,
        jobId: id, tenantId: input.tenantId, actorId: input.actorId, projectId: input.projectId,
        repositoryId: "fixture-repository", workspaceId: "workspace-fixture", action,
        status: kind === "convergence" ? "USER_WORKSPACE_CONVERGED" : "WORKTREE_RETIRED",
        runnerId: "runner-fixture", snapshotRevision: "snapshot-1",
        observedAt: "2026-10-11T08:00:00.000Z",
        evidence: {
          status: kind === "convergence" ? "USER_WORKSPACE_CONVERGED" : "WORKTREE_RETIRED",
          receipt: inner,
        },
      },
    },
    ...overrides,
  };
}

function reader(jobs: Record<string, unknown>) {
  return createSpec224WorkspaceLifecycleReceiptReader({
    async getJobSnapshot(jobId, scope) {
      if (scope?.tenantId !== input.tenantId || scope.requestedByUserId !== input.actorId) return null;
      return (jobs[jobId] ?? null) as never;
    },
  });
}

describe("Spec 224 workspace lifecycle receipt authority reader", () => {
  it("accepts only persisted, successful, correctly scoped authority job outputs", async () => {
    const result = await reader({
      [input.convergenceAuthorityJobId]: authorityJob(input.convergenceAuthorityJobId, "convergence"),
      [input.retirementAuthorityJobId]: authorityJob(input.retirementAuthorityJobId, "retirement"),
    }).readPersistedReceipts(input);

    expect(result).toMatchObject({
      status: "VERIFIED",
      convergenceAuthorityJobId: input.convergenceAuthorityJobId,
      retirementAuthorityJobId: input.retirementAuthorityJobId,
      convergenceReceipt: { integrated_sha: input.integratedSha },
      retirementReceipt: { task_id: input.runId },
    });
  });

  it.each([
    ["wrong tenant", { tenantId: "tenant-other" }],
    ["wrong actor", { requestedByUserId: 7 }],
    ["wrong job type", { jobType: "development.run" }],
    ["failed job", { status: "failed" }],
  ])("rejects %s evidence", async (_label, override) => {
    const result = await reader({
      [input.convergenceAuthorityJobId]: authorityJob(input.convergenceAuthorityJobId, "convergence", override),
      [input.retirementAuthorityJobId]: authorityJob(input.retirementAuthorityJobId, "retirement"),
    }).readPersistedReceipts(input);

    expect(result).toEqual({ status: "PENDING", reason: "WORKSPACE_LIFECYCLE_RECEIPT_NOT_AUTHORITY_ISSUED" });
  });

  it("does not accept fabricated IDs that do not resolve in worker_jobs", async () => {
    const result = await reader({}).readPersistedReceipts(input);
    expect(result).toEqual({ status: "PENDING", reason: "WORKSPACE_LIFECYCLE_RECEIPT_NOT_AUTHORITY_ISSUED" });
  });

  it("rejects a receipt for a stale canonical source SHA", async () => {
    const stale = authorityJob(input.convergenceAuthorityJobId, "convergence");
    const output = stale.output as { receipt: { evidence: { receipt: Record<string, unknown> } } };
    output.receipt.evidence.receipt.integrated_sha = "c".repeat(40);
    const result = await reader({
      [input.convergenceAuthorityJobId]: stale,
      [input.retirementAuthorityJobId]: authorityJob(input.retirementAuthorityJobId, "retirement"),
    }).readPersistedReceipts(input);

    expect(result).toEqual({ status: "PENDING", reason: "WORKSPACE_LIFECYCLE_RECEIPT_TARGET_STALE" });
  });

  it("rejects an action receipt whose Runner snapshot envelope conflicts with its persisted job input", async () => {
    const forged = authorityJob(input.convergenceAuthorityJobId, "convergence");
    const output = forged.output as { receipt: Record<string, unknown> };
    output.receipt.runnerId = "runner-other";
    const result = await reader({
      [input.convergenceAuthorityJobId]: forged,
      [input.retirementAuthorityJobId]: authorityJob(input.retirementAuthorityJobId, "retirement"),
    }).readPersistedReceipts(input);

    expect(result).toEqual({ status: "PENDING", reason: "WORKSPACE_LIFECYCLE_RECEIPT_NOT_AUTHORITY_ISSUED" });
  });
});
