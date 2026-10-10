import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ enqueueEvent: vi.fn(), resolveAuthority: vi.fn() }));
vi.mock("./workspaceAuthorityAuditJob", () => ({ enqueueWorkspaceAuthorityAuditEvent: mocks.enqueueEvent }));
vi.mock("../services/workspaceAuthoritySafeActions", () => ({ resolveOwnedWorkspaceAuthority: mocks.resolveAuthority }));

import {
  evaluateRequiredCheckGate,
  executeWorkspaceAuthoritySafeAction,
  readRequiredChecks,
} from "./workspaceAuthoritySafeActionJob";

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
  it("reads required checks from active rulesets and legacy branch protection", () => {
    expect(readRequiredChecks([
      { type: "required_status_checks", parameters: { required_status_checks: [
        { context: "ruleset/build", integration_id: 15368 },
      ] } },
    ], {
      checks: [{ context: "protection/build", app_id: 15368 }],
      contexts: ["legacy/lint"],
    })).toEqual([
      { context: "ruleset/build", integrationId: 15368 },
      { context: "protection/build", integrationId: 15368 },
      { context: "legacy/lint", integrationId: null },
    ]);
  });

  it("treats omitted or -1 GitHub app bindings as an any-app required check", () => {
    expect(readRequiredChecks([
      { type: "required_status_checks", parameters: { required_status_checks: [
        { context: "ruleset/any-app" },
      ] } },
    ], { checks: [{ context: "protection/any-app", app_id: -1 }], contexts: [] })).toEqual([
      { context: "ruleset/any-app", integrationId: null },
      { context: "protection/any-app", integrationId: null },
    ]);
  });

  it.each([
    [null, null],
    [[{ type: "required_status_checks" }], null],
    [[{ type: "required_status_checks", parameters: { required_status_checks: [null] } }], null],
    [[], { checks: [], contexts: "malformed" }],
  ])("fails closed on malformed required-check policy metadata", (rules, protection) => {
    expect(() => readRequiredChecks(rules, protection)).toThrow("WORKSPACE_ACTION_CHECK_POLICY_UNAVAILABLE");
  });

  it.each([
    ["skipped", "completed", "skipped", "skipped"],
    ["failed", "completed", "failure", "failed"],
    ["pending", "in_progress", null, "pending"],
    ["missing", null, null, "missing"],
  ])("blocks a required %s check on the exact PR head", (_label, status, conclusion, expectedState) => {
    const evidence = evaluateRequiredCheckGate({
      headSha: "c".repeat(40),
      requiredChecks: [{ context: "build-preview", integrationId: 15368 }],
      checkRuns: status === null ? [] : [{
        name: "build-preview", status: String(status), conclusion: conclusion as string | null, integrationId: 15368,
      }],
      commitStatuses: [],
    });
    expect(evidence.state).toBe("REQUIRED_CHECKS_NOT_PASSED");
    expect(evidence.headSha).toBe("c".repeat(40));
    expect(evidence.requiredChecks).toEqual([
      { context: "build-preview", integrationId: 15368, state: expectedState },
    ]);
  });

  it("accepts a required check only when its matching app reports success", () => {
    const evidence = evaluateRequiredCheckGate({
      headSha: "c".repeat(40),
      requiredChecks: [{ context: "build-preview", integrationId: 15368 }],
      checkRuns: [
        { name: "build-preview", status: "completed", conclusion: "success", integrationId: 15368 },
        { name: "build-preview", status: "completed", conclusion: "success", integrationId: 999 },
      ],
      commitStatuses: [],
    });
    expect(evidence.state).toBe("REQUIRED_CHECKS_PASSED");
    expect(evidence.requiredChecks[0].state).toBe("success");
  });

  it("uses the latest GitHub check attempt after a failed attempt was repaired", () => {
    const evidence = evaluateRequiredCheckGate({
      headSha: "c".repeat(40),
      requiredChecks: [{ context: "git_lifecycle", integrationId: 15368 }],
      checkRuns: [
        { name: "git_lifecycle", status: "completed", conclusion: "failure", integrationId: 15368,
          startedAt: "2026-10-10T10:00:00Z", completedAt: "2026-10-10T10:01:00Z" },
        { name: "git_lifecycle", status: "completed", conclusion: "success", integrationId: 15368,
          startedAt: "2026-10-10T10:02:00Z", completedAt: "2026-10-10T10:03:00Z" },
      ],
      commitStatuses: [],
    });
    expect(evidence.state).toBe("REQUIRED_CHECKS_PASSED");
    expect(evidence.requiredChecks[0].state).toBe("success");
  });

  it("keeps a newer in-progress required check pending despite an older success", () => {
    const evidence = evaluateRequiredCheckGate({
      headSha: "c".repeat(40),
      requiredChecks: [{ context: "git_lifecycle", integrationId: 15368 }],
      checkRuns: [
        { name: "git_lifecycle", status: "completed", conclusion: "success", integrationId: 15368,
          startedAt: "2026-10-10T10:00:00Z", completedAt: "2026-10-10T10:01:00Z" },
        { name: "git_lifecycle", status: "in_progress", conclusion: null, integrationId: 15368,
          startedAt: "2026-10-10T10:02:00Z", completedAt: null },
      ],
      commitStatuses: [],
    });
    expect(evidence.state).toBe("REQUIRED_CHECKS_NOT_PASSED");
    expect(evidence.requiredChecks[0].state).toBe("pending");
  });

  it("accepts a required legacy commit status only when its exact context is successful", () => {
    const passed = evaluateRequiredCheckGate({
      headSha: "c".repeat(40),
      requiredChecks: [{ context: "legacy/build", integrationId: null }],
      checkRuns: [],
      commitStatuses: [{ context: "legacy/build", state: "success" }],
    });
    const failed = evaluateRequiredCheckGate({
      headSha: "c".repeat(40),
      requiredChecks: [{ context: "legacy/build", integrationId: null }],
      checkRuns: [],
      commitStatuses: [{ context: "legacy/build", state: "failure" }],
    });
    expect(passed.state).toBe("REQUIRED_CHECKS_PASSED");
    expect(failed.requiredChecks[0].state).toBe("failed");
  });

  it("records skipped optional CI as skipped when no required checks are configured", () => {
    const evidence = evaluateRequiredCheckGate({
      headSha: "c".repeat(40), requiredChecks: [],
      checkRuns: [{ name: "build-preview", status: "completed", conclusion: "skipped", integrationId: 15368 }],
      commitStatuses: [],
    });
    expect(evidence.state).toBe("NO_REQUIRED_CHECKS_CONFIGURED");
    expect(evidence.observedChecks).toEqual([
      { context: "build-preview", source: "check_run", state: "skipped" },
    ]);
  });

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

  it("requires a successful retirement dry-run before applying local worktree cleanup", async () => {
    const runAuthority = vi.fn(async (_root: string, _env: NodeJS.ProcessEnv, args: string[]) => args[0] === "resolve"
      ? resolved : args.includes("--apply")
        ? { status: "WORKTREE_RETIRED", receipt: { receipt_id: "worktree-retirement:r1", previous_path: "/private/worktree" } }
        : { status: "RETIREMENT_DRY_RUN" });
    const result = await executeWorkspaceAuthoritySafeAction(request({ action: "RETIRE_SAFE_WORKTREE" }), env, { runAuthority });
    expect(runAuthority.mock.calls[1][2]).toEqual(["retire", "--workspace-id", "ws-a"]);
    expect(runAuthority.mock.calls[2][2]).toEqual(["retire", "--workspace-id", "ws-a", "--apply"]);
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

  it("never calls merge when a required check is skipped", async () => {
    const runAuthority = vi.fn().mockResolvedValue(resolved);
    const checkGate = vi.fn().mockRejectedValue(new Error("WORKSPACE_ACTION_REQUIRED_CHECKS_NOT_PASSED"));
    const merge = vi.fn();
    const github = {
      repository: vi.fn().mockResolvedValue("owner/repo"),
      inspect: vi.fn().mockResolvedValue({ state: "OPEN", isDraft: false, baseRefName: "main", headRefOid: "c".repeat(40), mergeable: true, mergeStateStatus: "CLEAN" }),
      checkGate,
      merge,
    };
    await expect(executeWorkspaceAuthoritySafeAction(request({ action: "INTEGRATE_COMPLETED_WORK", workspaceId: null,
      payload: { pullRequestNumber: 42, expectedHeadSha: "c".repeat(40) } }), env, { runAuthority, github }))
      .rejects.toThrow("WORKSPACE_ACTION_REQUIRED_CHECKS_NOT_PASSED");
    expect(checkGate).toHaveBeenCalledWith("/canonical/repo", "owner/repo", "main", "c".repeat(40));
    expect(merge).not.toHaveBeenCalled();
  });

  it("rechecks the worker lease immediately before the GitHub merge side effect", async () => {
    const runAuthority = vi.fn().mockResolvedValue(resolved);
    const merge = vi.fn().mockResolvedValue({ merged: true, sha: "d".repeat(40) });
    const github = {
      repository: vi.fn().mockResolvedValue("owner/repo"),
      inspect: vi.fn().mockResolvedValue({ state: "OPEN", isDraft: false, baseRefName: "main", headRefOid: "c".repeat(40), mergeable: true, mergeStateStatus: "CLEAN" }),
      checkGate: vi.fn().mockResolvedValue({ state: "REQUIRED_CHECKS_PASSED", headSha: "c".repeat(40), requiredChecks: [], observedChecks: [] }),
      merge,
    };
    const assertActive = vi.fn().mockRejectedValue(new Error("LEASE_FENCED"));
    await expect(executeWorkspaceAuthoritySafeAction(request({ action: "INTEGRATE_COMPLETED_WORK", workspaceId: null,
      payload: { pullRequestNumber: 42, expectedHeadSha: "c".repeat(40) } }), env, { runAuthority, github, assertActive }))
      .rejects.toThrow("LEASE_FENCED");
    expect(assertActive).toHaveBeenCalledTimes(1);
    expect(merge).not.toHaveBeenCalled();
  });

  it("integrates only the fenced head through the protected merge endpoint and emits lifecycle events", async () => {
    const runAuthority = vi.fn(async (_root: string, _env: NodeJS.ProcessEnv, args: string[]) => args[0] === "resolve"
      ? resolved : { status: "USER_WORKSPACE_CONVERGED", receipt: { receipt_id: "workspace-convergence:r1" } });
    const github = {
      repository: vi.fn().mockResolvedValue("owner/repo"),
      inspect: vi.fn().mockResolvedValue({ state: "OPEN", isDraft: false, baseRefName: "main", headRefOid: "c".repeat(40), mergeable: true, mergeStateStatus: "CLEAN" }),
      checkGate: vi.fn().mockResolvedValue({
        state: "NO_REQUIRED_CHECKS_CONFIGURED", headSha: "c".repeat(40), requiredChecks: [],
        observedChecks: [{ context: "build-preview", source: "check_run", state: "skipped" }],
      }),
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
    expect(result.output.receipt.evidence).toMatchObject({
      status: "INTEGRATION_RECORDED", integratedSha: "d".repeat(40),
      checkGate: { state: "NO_REQUIRED_CHECKS_CONFIGURED", observedChecks: [
        { context: "build-preview", source: "check_run", state: "skipped" },
      ] },
    });
  });
});
