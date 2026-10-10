import { beforeEach, describe, expect, it, vi } from "vitest";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const { mockCreateJob, mockStartSchedule, mockStopSchedule, mockGetDb, mockSelect, mockFrom, mockWhere } = vi.hoisted(() => ({
  mockCreateJob: vi.fn(), mockStartSchedule: vi.fn(), mockStopSchedule: vi.fn(), mockGetDb: vi.fn(),
  mockSelect: vi.fn(), mockFrom: vi.fn(), mockWhere: vi.fn(),
}));
vi.mock("../services/jobControlPlaneGateway", () => ({ createControlPlaneJob: mockCreateJob }));
vi.mock("./feature186SystemScheduler", () => ({ startFeature186SystemSchedule: mockStartSchedule, stopFeature186SystemSchedule: mockStopSchedule, utcMinuteOccurrence: (date: Date) => date.toISOString() }));
vi.mock("../db", () => ({ getDb: mockGetDb }));
import { collectLocalWorkspaceAudit, enqueueWorkspaceAuthorityAuditEvent, initializeWorkspaceAuthorityAuditJob, reconcileOwnedPullRequests, shutdownWorkspaceAuthorityAuditJob } from "./workspaceAuthorityAuditJob";

describe("workspace authority audit triggers", () => {
  beforeEach(() => {
    mockCreateJob.mockReset(); mockStartSchedule.mockReset(); mockStopSchedule.mockReset();
    mockWhere.mockReset().mockResolvedValue([]);
    mockFrom.mockReset().mockReturnValue({ where: mockWhere });
    mockSelect.mockReset().mockReturnValue({ from: mockFrom });
    mockGetDb.mockReset().mockReturnValue({ select: mockSelect });
  });
  it("creates the default periodic AUDIT_ONLY schedule", async () => {
    await initializeWorkspaceAuthorityAuditJob();
    expect(mockStartSchedule).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "workspace-authority-audit", jobType: "workspace.authority.audit", input: { mode: "AUDIT_ONLY", trigger: "PERIODIC" } }));
    await shutdownWorkspaceAuthorityAuditJob();
    expect(mockStopSchedule).toHaveBeenCalledWith("workspace-authority-audit");
  });
  it("uses stable idempotency for lifecycle events and rejects missing event identity", async () => {
    mockCreateJob.mockResolvedValue({ jobId: "job-1" });
    await enqueueWorkspaceAuthorityAuditEvent({ tenantId: "tenant-a", eventType: "HANDOFF_COMPLETE", eventId: "handoff-1" });
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ idempotencyKey: "workspace-authority:HANDOFF_COMPLETE:handoff-1" }), definition: expect.objectContaining({ input: { tenantId: "tenant-a", mode: "AUDIT_ONLY", trigger: "HANDOFF_COMPLETE" } }) }));
    await expect(enqueueWorkspaceAuthorityAuditEvent({ tenantId: "tenant-a", eventType: "SESSION_FINISH", eventId: " " })).rejects.toThrow("WORKSPACE_AUDIT_EVENT_INVALID");
  });
  it.each(["CANONICAL_CONVERGENCE_SUCCESS", "RECOVERY_ARCHIVE_COMPLETE"] as const)("accepts the %s lifecycle event with a stable idempotency key", async eventType => {
    mockCreateJob.mockResolvedValue({ jobId: "job-2" });
    await enqueueWorkspaceAuthorityAuditEvent({ tenantId: "tenant-a", eventType, eventId: "receipt-1" });
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ idempotencyKey: `workspace-authority:${eventType}:receipt-1` }),
      definition: expect.objectContaining({ input: { tenantId: "tenant-a", mode: "AUDIT_ONLY", trigger: eventType } }),
    }));
  });

  it("does not guess a local registry path when the audit host is not configured", async () => {
    await expect(collectLocalWorkspaceAudit({})).resolves.toEqual({ status: "NOT_CONFIGURED", reason: "repository_not_configured" });
  });

  it("queues only an open PR whose repository, branch, SHA, task workspace and inactive Runner owner all match", async () => {
    const enqueue = vi.fn().mockResolvedValue({ jobId: "job-pr-1" });
    const sha = "a".repeat(40);
    const now = new Date("2026-10-10T12:00:00.000Z");
    const result = await reconcileOwnedPullRequests({
      tenantId: "tenant-a", now,
      runners: [{ runnerId: "runner-a", ownerUserId: 41, currentSnapshotJson: { workspaces: [{
        workspaceId: "workspace-a", projectId: "project-a", repositoryId: "repository-a", gitBranch: "codex/task-a",
        gitHead: sha, dirty: false, taskId: "task-a",
      }] }, trustState: "trusted", status: "online", snapshotObservedAt: new Date(now.getTime() - 1_000),
      snapshotExpiresAt: new Date(now.getTime() + 60_000), revokedAt: null, activeSessionId: null }],
      local: { status: "OBSERVED", authority: { status: "AUTHORITY_RESOLVED", project_id: "project-a", repository_id: "repository-a",
        canonical_ref: "refs/heads/main", workspaces: [{ workspace_id: "workspace-a", role: "TASK_WORKTREE", task_id: "task-a",
          head_sha: sha, branch: "codex/task-a", dirty: false, session_state: "STALE_CLOSED_SESSION", lifecycle_state: "OPEN" }] } },
    }, {
      env: { SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY: "/tmp/repository" }, repository: async () => "naibarn/SmartSpecPro",
      list: async () => [{ number: 37, state: "OPEN", isDraft: false, baseRefName: "main", headRefName: "codex/task-a",
        headRefOid: sha, headRepository: "naibarn/SmartSpecPro", mergeable: true, mergeStateStatus: "CLEAN" }],
      enqueue,
    });
    expect(result).toMatchObject({ status: "OBSERVED", discovered: 1, enqueued: 1 });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-a", actorId: 41,
      projectId: "project-a", repositoryId: "repository-a", workspaceId: "workspace-a", action: "INTEGRATE_COMPLETED_WORK",
      idempotencyKey: `autonomous-pr:37:${sha}`, payload: { pullRequestNumber: 37, expectedHeadSha: sha, automatedReconciliation: true } }));
  });

  it("does not queue stale, active, dirty, draft, forked, or mismatched PR ownership facts", async () => {
    const enqueue = vi.fn();
    const sha = "b".repeat(40);
    const now = new Date("2026-10-10T12:00:00.000Z");
    const makeLocal = (overrides: Record<string, unknown> = {}) => ({ status: "OBSERVED" as const,
      authority: { status: "AUTHORITY_RESOLVED", project_id: "project-a", repository_id: "repository-a", canonical_ref: "main",
        workspaces: [{ workspace_id: "workspace-a", role: "TASK_WORKTREE", task_id: "task-a", head_sha: sha,
          branch: "codex/task-a", dirty: false, session_state: "NO_ACTIVE_SESSION", lifecycle_state: "OPEN", ...overrides }] } });
    const runner = { runnerId: "runner-a", ownerUserId: 41, currentSnapshotJson: { workspaces: [{ workspaceId: "workspace-a",
      projectId: "project-a", repositoryId: "repository-a", gitBranch: "codex/task-a", gitHead: sha, dirty: false, taskId: "task-a" }] },
      trustState: "trusted", status: "online", snapshotObservedAt: new Date(now.getTime() - 1_000), snapshotExpiresAt: new Date(now.getTime() + 60_000), revokedAt: null, activeSessionId: null };
    const pr = { number: 38, state: "OPEN", isDraft: true, baseRefName: "main", headRefName: "codex/task-a", headRefOid: sha,
      headRepository: "naibarn/SmartSpecPro", mergeable: true, mergeStateStatus: "CLEAN" };
    for (const [local, runnerFact, pullRequest] of [
      [makeLocal(), { ...runner, activeSessionId: "session-live" }, { ...pr, isDraft: false }],
      [makeLocal(), { ...runner, snapshotExpiresAt: new Date(now.getTime() - 1) }, { ...pr, isDraft: false }],
      [makeLocal({ dirty: true }), runner, { ...pr, isDraft: false }],
      [makeLocal(), runner, pr],
      [makeLocal(), runner, { ...pr, isDraft: false, headRefOid: "c".repeat(40) }],
      [makeLocal(), runner, { ...pr, isDraft: false, headRepository: "fork/SmartSpecPro" }],
      [makeLocal(), runner, { ...pr, isDraft: false, mergeStateStatus: "BLOCKED" }],
    ] as const) {
      await reconcileOwnedPullRequests({ tenantId: "tenant-a", now, runners: [runnerFact], local }, {
        env: { SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY: "/tmp/repository" }, repository: async () => "naibarn/SmartSpecPro",
        list: async () => [pullRequest], enqueue,
      });
    }
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("runs the configured local collector in AUDIT_ONLY mode and parses its receipt", async () => {
    const temp = mkdtempSync(path.join(os.tmpdir(), "workspace-audit-exec-"));
    const executable = path.join(temp, "python-fixture");
    try {
      writeFileSync(executable, "#!/bin/sh\nif [ \"$2\" = \"mission-control\" ]; then printf '%s\\n' '{\"status\":\"MISSION_CONTROL_SNAPSHOT_READY\",\"project_id\":\"project-a\"}'; elif [ \"$2\" = \"resolve\" ]; then printf '%s\\n' '{\"status\":\"AUTHORITY_RESOLVED\",\"project_id\":\"project-a\",\"repository_id\":\"repository-a\",\"canonical_ref\":\"refs/heads/main\",\"workspaces\":[]}'; else printf '%s\\n' '{\"status\":\"WORKTREE_AUDIT_COMPLETE\",\"mode\":\"AUDIT_ONLY\",\"workspaces\":[]}'; fi\n");
      chmodSync(executable, 0o700);
      const result = await collectLocalWorkspaceAudit({
        SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY: process.cwd(),
        SMARTSPEC_PYTHON_EXECUTABLE: executable,
      });
      expect(result).toEqual({ status: "OBSERVED", result: { status: "WORKTREE_AUDIT_COMPLETE", mode: "AUDIT_ONLY", workspaces: [] },
        authority: { status: "AUTHORITY_RESOLVED", project_id: "project-a", repository_id: "repository-a", canonical_ref: "refs/heads/main", workspaces: [] },
        missionControl: { status: "OBSERVED", result: { status: "MISSION_CONTROL_SNAPSHOT_READY", project_id: "project-a" } } });
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("includes persisted local registry audit evidence in the scheduled audit result", async () => {
    const { executeWorkspaceAuthorityAudit } = await import("./workspaceAuthorityAuditJob");
    const result = await executeWorkspaceAuthorityAudit({
      tenantId: "tenant-a",
      now: new Date("2026-10-07T12:00:00.000Z"),
      collectLocal: async () => ({ status: "OBSERVED", result: { status: "WORKTREE_AUDIT_COMPLETE", mode: "AUDIT_ONLY", workspaces: [{ classification: "UNKNOWN_OWNER" }] } }),
    });
    expect(result).toMatchObject({ mode: "AUDIT_ONLY", runnerCount: 0, localWorkspaceAudit: { status: "OBSERVED", result: { mode: "AUDIT_ONLY" } } });
  });

  it("enqueues an idempotent owner-lease-expired event from the local audit receipt", async () => {
    mockCreateJob.mockResolvedValue({ jobId: "job-expired-owner" });
    const { executeWorkspaceAuthorityAudit } = await import("./workspaceAuthorityAuditJob");
    const result = await executeWorkspaceAuthorityAudit({
      tenantId: "tenant-a",
      now: new Date("2026-10-07T12:00:00.000Z"),
      collectLocal: async () => ({ status: "OBSERVED", result: { status: "WORKTREE_AUDIT_COMPLETE", mode: "AUDIT_ONLY", workspaces: [
        { workspace_id: "workspace-1", owner_lease_expired: true, owner_lease_expires_at: 1791374399 },
        { workspace_id: "workspace-2", owner_lease_expired: false, owner_lease_expires_at: 1791374399 },
      ] } }),
    });
    expect(result.ownerLeaseExpirationEventCount).toBe(1);
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ idempotencyKey: "workspace-authority:OWNER_LEASE_EXPIRED:workspace-1:1791374399" }),
      definition: expect.objectContaining({ input: { tenantId: "tenant-a", mode: "AUDIT_ONLY", trigger: "OWNER_LEASE_EXPIRED" } }),
    }));
  });

  it("enqueues canonical convergence lifecycle work from the durable convergence receipt", async () => {
    mockCreateJob.mockResolvedValue({ jobId: "job-converged" });
    const { executeWorkspaceAuthorityAudit } = await import("./workspaceAuthorityAuditJob");
    const result = await executeWorkspaceAuthorityAudit({
      tenantId: "tenant-a",
      now: new Date("2026-10-07T12:00:00.000Z"),
      collectLocal: async () => ({
        status: "OBSERVED",
        result: { status: "WORKTREE_AUDIT_COMPLETE", mode: "AUDIT_ONLY", workspaces: [] },
        missionControl: { status: "OBSERVED", result: { user_workspace: { convergence_receipt: {
          receipt_id: "workspace-convergence:receipt-1", result: "USER_WORKSPACE_CONVERGED",
          integrated_sha: "a".repeat(40), canonical_sha: "a".repeat(40),
          workspace_role: "CANONICAL_USER_WORKSPACE", dirty: false,
        } } } },
      }),
    });
    expect(result.canonicalConvergenceSuccessEventCount).toBe(1);
    expect(result.integrationFinishEventCount).toBe(1);
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ idempotencyKey: "workspace-authority:CANONICAL_CONVERGENCE_SUCCESS:workspace-convergence:receipt-1" }),
      definition: expect.objectContaining({ input: { tenantId: "tenant-a", mode: "AUDIT_ONLY", trigger: "CANONICAL_CONVERGENCE_SUCCESS" } }),
    }));
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ idempotencyKey: `workspace-authority:INTEGRATION_FINISH:workspace-convergence:receipt-1:${"a".repeat(40)}` }),
      definition: expect.objectContaining({ input: { tenantId: "tenant-a", mode: "AUDIT_ONLY", trigger: "INTEGRATION_FINISH" } }),
    }));
  });
});
