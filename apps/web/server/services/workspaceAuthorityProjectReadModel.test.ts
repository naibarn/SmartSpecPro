import { describe, expect, it } from "vitest";
import { projectRunnerWorkspaceAuthority } from "./workspaceAuthorityProjectReadModel";

const now = new Date("2026-10-07T12:00:00.000Z");
function runner(overrides: Record<string, unknown> = {}) {
  return {
    runnerId: "runner-a", tenantId: "tenant-a", ownerUserId: 7, profile: "local_device", displayName: "Dev host",
    trustState: "trusted", status: "online", currentSnapshotRevision: "snapshot-1",
    currentSnapshotJson: { runnerSessionId: "session-a", toolInventory: [{ toolId: "codex", kind: "agent_cli", trustState: "busy", authState: "authenticated", availabilityState: "busy", expiresAt: "2026-10-07T12:01:00.000Z" }], workspaces: [{ workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a", gitHead: "a".repeat(40), gitBranch: "main", dirty: false }] },
    snapshotObservedAt: new Date("2026-10-07T11:59:00.000Z"), snapshotExpiresAt: new Date("2026-10-07T12:01:00.000Z"),
    lastSeenAt: new Date("2026-10-07T11:59:00.000Z"), revokedAt: null, activeSessionId: "session-a", ...overrides,
  };
}

describe("projectRunnerWorkspaceAuthority", () => {
  it("projects trusted fresh host identity and preserves project and repository identities", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [runner()] as never[], now });
    expect(result.workspaces.observed[0]).toMatchObject({ projectId: "project-a", repositoryId: "repo-a", hostId: "runner-a", provider: "codex", providerResolutionSource: "trusted_runner_active_tool_inventory", runnerProfile: "local_device", trust: "TRUSTED", sessionId: "session-a", observedSha: "a".repeat(40) });
    expect(result.pushState.state).toBe("UNKNOWN");
  });

  it("marks stale snapshots and conflicting host revisions explicitly", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner({ snapshotExpiresAt: new Date("2026-10-07T11:59:00.000Z") }),
      runner({ runnerId: "runner-b", currentSnapshotJson: { workspaces: [{ workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a", gitHead: "b".repeat(40) }] } }),
    ] as never[], now });
    expect(result.workspaces.observed[0].hostState).toBe("STALE");
    expect(result.workspaceConflicts).toHaveLength(1);
  });

  it("does not guess a provider from the Runner profile or workspace name when no active tool fact exists", () => {
    const row = runner({ profile: "local_device", currentSnapshotJson: { runnerSessionId: "session-a", workspaces: [{ workspaceId: "codex-project", projectId: "project-a", repositoryId: "repo-a" }] } });
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [row] as never[], now });
    expect(result.workspaces.observed[0]).toMatchObject({ provider: "UNKNOWN", agentIdentity: "UNKNOWN", providerResolutionSource: "no_active_session_provider_fact" });
  });

  it("reports conflicts in project/repository or dirty-state facts instead of selecting a newer host", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner(),
      runner({ runnerId: "runner-b", currentSnapshotJson: { workspaces: [{ workspaceId: "ws-a", projectId: "project-b", repositoryId: "repo-a", gitHead: "a".repeat(40), gitBranch: "main", dirty: true }] } }),
    ] as never[], now });
    expect(result.workspaceConflicts).toHaveLength(1);
    expect(result.workspaceConflicts[0].state).toBe("CONFLICT");
  });

  it("marks facts without a project/repository binding as unbound", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner({ currentSnapshotJson: { workspaces: [{ workspaceId: "ws-a", gitHead: "a".repeat(40) }] } }),
    ] as never[], now });
    expect(result.workspaces.observed[0].projectId).toBeNull();
    expect(result.workspaceGroups.observed[0].state).toBe("UNBOUND");
    expect(result.workspaceConflicts).toHaveLength(0);
  });

  it("aggregates canonical, user-workspace, development, worktree, and SPEC-295 production facts from the local authority snapshot", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [], now, localAuthorityStatus: "OBSERVED", localAuthorityObservedAt: now, localMissionControl: {
      repository: { repository_id: "repo-a", canonical_ref: "refs/heads/main", canonical_branch: "main", canonical_sha: "a".repeat(40), verification_state: "USER_WORKSPACE_CONVERGED" },
      user_workspace: { workspace_id: "workspace-a", role: "CANONICAL_USER_WORKSPACE", sha: "a".repeat(40), state: "SYNCED", dirty: false },
      development_state: { uncommitted_intended_work: [], unpushed_intended_commits: { state: "UNKNOWN" } },
      worktrees: { active: [], integrating: [], retireable: [], stale_or_unknown: [], recovery: [] },
      production: { status: "UNKNOWN", reason: "SPEC-295 runtime evidence was not supplied" },
    } });
    expect(result).toMatchObject({
      localAuthorityStatus: "OBSERVED",
      localAuthorityObservedAt: now.toISOString(),
      canonical: { canonical_sha: "a".repeat(40) },
      userWorkspace: { workspace_id: "workspace-a", role: "CANONICAL_USER_WORKSPACE" },
      developmentIntegration: { unpushed_intended_commits: { state: "UNKNOWN" } },
      worktreeLifecycle: { integrating: [], recovery: [] },
      production: { status: "UNKNOWN", reason: "SPEC-295 runtime evidence was not supplied" },
    });
  });

  it("does not present stale local audit evidence as current Mission Control state", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [], now,
      localAuthorityStatus: "STALE", localAuthorityObservedAt: new Date("2026-10-07T11:00:00.000Z"),
      localMissionControl: { repository: { canonical_sha: "old" } },
    });
    expect(result.canonical).toMatchObject({ status: "UNKNOWN", reason: "local_authority_snapshot_unavailable" });
    expect(result.localAuthorityStatus).toBe("STALE");
    expect(result.localAuthorityObservedAt).toBe("2026-10-07T11:00:00.000Z");
  });
});
