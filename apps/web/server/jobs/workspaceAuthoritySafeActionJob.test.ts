import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueueEvent: vi.fn(), resolveAuthority: vi.fn() }));
vi.mock("./workspaceAuthorityAuditJob", () => ({ enqueueWorkspaceAuthorityAuditEvent: mocks.enqueueEvent }));
vi.mock("../services/workspaceAuthoritySafeActions", () => ({ resolveOwnedWorkspaceAuthority: mocks.resolveAuthority }));

import { executeWorkspaceAuthoritySafeAction } from "./workspaceAuthoritySafeActionJob";

const env = { SMARTSPEC_WORKSPACE_AUTHORITY_REPOSITORY: "/canonical/repo" } as NodeJS.ProcessEnv;
function request(overrides: Record<string, unknown> = {}) {
  return {
    jobId: "job-1", tenantId: "tenant-a", actorId: 42, projectId: "project-a", repositoryId: "repo-a",
    workspaceId: "ws-a", action: "INSPECT_LOCAL_CHANGES", payload: {},
    authority: {
      runnerId: "runner-a", snapshotRevision: "snap-1",
      snapshotObservedAt: "2026-10-07T11:59:00.000Z",
      snapshotExpiresAt: "2026-10-07T12:01:00.000Z",
    }, ...overrides,
  };
}
const resolved = {
  status: "AUTHORITY_RESOLVED", project_id: "project-a", repository_id: "repo-a",
  canonical_ref: "refs/heads/main", canonical_sha: "a".repeat(40), canonical_workspace_id: "ws-canonical",
  workspaces: [{ workspace_id: "ws-a", location: "/private/worktree" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAuthority.mockResolvedValue({
    runnerId: "runner-a",
    snapshotRevision: "snap-1",
    snapshotObservedAt: "2026-10-07T11:59:00.000Z",
    snapshotExpiresAt: "2026-10-07T12:01:00.000Z",
  });
});

describe("workspace authority safe action executor", () => {
  it("rechecks trusted Runner authority before any local or mutating execution", async () => {
    const runAuthority = vi.fn().mockResolvedValue(resolved);
    mocks.resolveAuthority.mockResolvedValueOnce({
      runnerId: "runner-a",
      snapshotRevision: "snap-2",
      snapshotObservedAt: "2026-10-07T11:59:30.000Z",
      snapshotExpiresAt: "2026-10-07T12:01:30.000Z",
    });

    await expect(executeWorkspaceAuthoritySafeAction(request({ action: "RETIRE_SAFE_WORKTREE" }), env, { runAuthority }))
      .rejects.toThrow("WORKSPACE_ACTION_AUTHORITY_CHANGED");

    expect(mocks.resolveAuthority).toHaveBeenCalledWith({
      tenantId: "tenant-a", actorId: 42, projectId: "project-a", repositoryId: "repo-a", workspaceId: "ws-a",
    });
    expect(runAuthority).not.toHaveBeenCalled();
  });

  it("does not start local execution when the registered Runner snapshot has expired", async () => {
    const runAuthority = vi.fn().mockResolvedValue(resolved);
    mocks.resolveAuthority.mockRejectedValueOnce(new Error("WORKSPACE_ACTION_AUTHORITY_STALE"));

    await expect(executeWorkspaceAuthoritySafeAction(request({ action: "SYNC_WORKSPACE_SAFELY" }), env, { runAuthority }))
      .rejects.toThrow("WORKSPACE_ACTION_AUTHORITY_STALE");

    expect(runAuthority).not.toHaveBeenCalled();
  });

  it("runs local inspection only through the canonical worker executor and removes host paths from the receipt", async () => {
    const calls: string[][] = [];
    const runAuthority = vi.fn(async (_root: string, _env: NodeJS.ProcessEnv, args: string[]) => {
      calls.push(args);
      return args[0] === "resolve" ? resolved : {
        status: "WORKTREE_AUDIT_COMPLETE",
        workspaces: [{ workspace_id: "ws-a", dirty: true, path: "/private/worktree", changed_path_count: 1 }],
      };
    });
    const result = await executeWorkspaceAuthoritySafeAction(request(), env, {
      runAuthority, hostname: () => "authority-host", now: () => new Date("2026-10-07T12:00:00.000Z"),
    });
    expect(calls).toEqual([["resolve"], ["collect", "--mode", "AUDIT_ONLY"]]);
    expect(result.output.receipt).toMatchObject({
      receiptId: "workspace-action:job-1", action: "INSPECT_LOCAL_CHANGES", status: "WORKTREE_AUDIT_COMPLETE",
      executionHost: "authority-host", observedAt: "2026-10-07T12:00:00.000Z",
      evidence: { workspace: { workspace_id: "ws-a", dirty: true, changed_path_count: 1 } },
    });
    expect(JSON.stringify(result)).not.toContain("/private/worktree");
  });

  it("refuses project or workspace authority mismatches before an action is invoked", async () => {
    const runAuthority = vi.fn().mockResolvedValue({ ...resolved, project_id: "other-project" });
    await expect(executeWorkspaceAuthoritySafeAction(request(), env, { runAuthority }))
      .rejects.toThrow("WORKSPACE_ACTION_PROJECT_BINDING_MISMATCH");
    expect(runAuthority).toHaveBeenCalledTimes(1);
  });

  it("uses an opaque registered workspace ID for dirty-work recovery and emits an idempotent archive event", async () => {
    const runAuthority = vi.fn(async (_root: string, _env: NodeJS.ProcessEnv, args: string[]) => args[0] === "resolve"
      ? resolved : { status: "DIRTY_WORK_PRESERVED", workspace_id: "ws-a", manifest_sha256: "b".repeat(64), recovery_path: "/private/recovery" });
    const result = await executeWorkspaceAuthoritySafeAction(request({ action: "RECOVER_WORK" }), env, { runAuthority });
    expect(runAuthority.mock.calls[1][2]).toEqual(["preserve", "--workspace-id", "ws-a"]);
    expect(mocks.enqueueEvent).toHaveBeenCalledWith({
      tenantId: "tenant-a", eventType: "RECOVERY_ARCHIVE_COMPLETE", eventId: `ws-a:${"b".repeat(64)}`,
    });
    expect(JSON.stringify(result)).not.toContain("/private/recovery");
  });

  it("only enables retirement in the local authority command after project/workspace re-resolution", async () => {
    const runAuthority = vi.fn(async (_root: string, _env: NodeJS.ProcessEnv, args: string[]) => args[0] === "resolve"
      ? resolved : { status: "WORKTREE_RETIRED", receipt: { receipt_id: "worktree-retirement:r1", previous_path: "/private/worktree" } });
    const result = await executeWorkspaceAuthoritySafeAction(request({ action: "RETIRE_SAFE_WORKTREE" }), env, { runAuthority });
    expect(runAuthority.mock.calls[1][2]).toEqual(["retire", "--workspace-id", "ws-a", "--apply"]);
    expect(result.output.receipt.evidence).toEqual({ status: "WORKTREE_RETIRED", receipt: { receipt_id: "worktree-retirement:r1" } });
  });

  it("rejects a pull request whose required integration state is not clean and never calls merge", async () => {
    const runAuthority = vi.fn().mockResolvedValue(resolved);
    const merge = vi.fn();
    const github = {
      repository: vi.fn().mockResolvedValue("owner/repo"),
      inspect: vi.fn().mockResolvedValue({ state: "OPEN", isDraft: false, baseRefName: "main", headRefOid: "c".repeat(40), mergeable: true, mergeStateStatus: "BLOCKED" }),
      merge,
    };
    await expect(executeWorkspaceAuthoritySafeAction(request({ action: "INTEGRATE_COMPLETED_WORK", workspaceId: null,
      payload: { pullRequestNumber: 42, expectedHeadSha: "c".repeat(40) } }), env, { runAuthority, github }))
      .rejects.toThrow("WORKSPACE_ACTION_PULL_REQUEST_NOT_MERGEABLE");
    expect(merge).not.toHaveBeenCalled();
  });

  it("integrates only the fenced head through the protected merge endpoint and emits lifecycle events", async () => {
    const runAuthority = vi.fn(async (_root: string, _env: NodeJS.ProcessEnv, args: string[]) => args[0] === "resolve"
      ? resolved : { status: "USER_WORKSPACE_CONVERGED", receipt: { receipt_id: "workspace-convergence:r1" } });
    const github = {
      repository: vi.fn().mockResolvedValue("owner/repo"),
      inspect: vi.fn().mockResolvedValue({ state: "OPEN", isDraft: false, baseRefName: "main", headRefOid: "c".repeat(40), mergeable: true, mergeStateStatus: "CLEAN" }),
      merge: vi.fn().mockResolvedValue({ merged: true, sha: "d".repeat(40) }),
    };
    const result = await executeWorkspaceAuthoritySafeAction(request({ action: "INTEGRATE_COMPLETED_WORK", workspaceId: null,
      payload: { pullRequestNumber: 42, expectedHeadSha: "c".repeat(40) } }), env, { runAuthority, github });
    expect(github.merge).toHaveBeenCalledWith("/canonical/repo", "owner/repo", 42, "c".repeat(40));
    expect(runAuthority.mock.calls.at(-1)?.[2]).toEqual(["converge", "--integrated-sha", "d".repeat(40)]);
    expect(mocks.enqueueEvent).toHaveBeenCalledWith({
      tenantId: "tenant-a", eventType: "INTEGRATION_FINISH", eventId: `pull-request:42:${"d".repeat(40)}`,
    });
    expect(mocks.enqueueEvent).toHaveBeenCalledWith({
      tenantId: "tenant-a", eventType: "HANDOFF_COMPLETE",
      eventId: `pull-request:42:${"d".repeat(40)}:workspace-convergence:r1`,
    });
    expect(result.output.receipt.evidence).toMatchObject({ status: "INTEGRATION_RECORDED", integratedSha: "d".repeat(40) });
  });
});
