import { describe, expect, it } from "vitest";
import { projectRunnerWorkspaceAuthority } from "./workspaceAuthorityProjectReadModel";

const now = new Date("2026-10-07T12:00:00.000Z");
function runner(overrides: Record<string, unknown> = {}) {
  return {
    runnerId: "runner-a", tenantId: "tenant-a", ownerUserId: 7, profile: "local_device", displayName: "Dev host",
    trustState: "trusted", status: "online", currentSnapshotRevision: "snapshot-1",
    currentSnapshotJson: { runnerSessionId: "session-a", toolInventory: [{ toolId: "codex", kind: "agent_cli", trustState: "busy", authState: "authenticated", availabilityState: "busy", expiresAt: "2026-10-07T12:01:00.000Z" }], workspaces: [{ workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a", gitHead: "a".repeat(40), gitBranch: "main", dirty: false, taskId: "task-42", convergenceState: "USER_WORKSPACE_CONVERGED", convergenceCanonicalSha: "a".repeat(40) }] },
    snapshotObservedAt: new Date("2026-10-07T11:59:00.000Z"), snapshotExpiresAt: new Date("2026-10-07T12:01:00.000Z"),
    lastSeenAt: new Date("2026-10-07T11:59:00.000Z"), revokedAt: null, activeSessionId: "session-a", ...overrides,
  };
}

describe("projectRunnerWorkspaceAuthority", () => {
  it("projects trusted fresh host identity and preserves project and repository identities", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [runner()] as never[], now });
    expect(result.workspaces.observed[0]).toMatchObject({ projectId: "project-a", repositoryId: "repo-a", hostId: "runner-a", provider: "codex", providerResolutionSource: "trusted_runner_active_tool_inventory", runnerProfile: "local_device", trust: "TRUSTED", ownerUserId: 7, sessionId: "session-a", sessionState: "ACTIVE", taskId: "task-42", taskIdSource: "trusted_runner_snapshot_active_session", observedSha: "a".repeat(40), convergenceState: "USER_WORKSPACE_CONVERGED", convergenceCanonicalSha: "a".repeat(40), observedAt: "2026-10-07T11:59:00.000Z" });
    expect(result.hosts.observed[0]).toMatchObject({ hostId: "runner-a", provider: "codex", providerResolutionSource: "trusted_runner_active_tool_inventory" });
    expect(result.pushState.state).toBe("UNKNOWN");
  });

  it("keeps the host provider unknown when its session or tool evidence is stale", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner({ snapshotExpiresAt: new Date("2026-10-07T11:59:00.000Z") }),
    ] as never[], now });

    expect(result.hosts.observed[0]).toMatchObject({ hostId: "runner-a", provider: "UNKNOWN", providerResolutionSource: "no_active_session_provider_fact" });
  });

  it("uses a provider confirmed by the matching live owner session when Runner tool inventory is absent", () => {
    const current = runner({ currentSnapshotJson: { runnerSessionId: "session-a", workspaces: runner().currentSnapshotJson.workspaces } });
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [current] as never[], now,
      localAuthorityStatus: "OBSERVED", localAuthorityObservedAt: now,
      localMissionControl: { sessions: { active_count: 1, active: [{ session_id: "session-a", runner_id: "runner-a", provider: "claude" }] } },
    });

    expect(result.hosts.observed[0]).toMatchObject({ hostId: "runner-a", provider: "claude", providerResolutionSource: "registered_owner_session_fact" });
  });

  it("surfaces provider conflicts on hosts instead of preferring Runner inventory", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [runner()] as never[], now,
      localAuthorityStatus: "OBSERVED", localAuthorityObservedAt: now,
      localMissionControl: { sessions: { active_count: 1, active: [{ session_id: "session-a", runner_id: "runner-a", provider: "claude" }] } },
    });

    expect(result.hosts.observed[0]).toMatchObject({ hostId: "runner-a", provider: "UNKNOWN", providerResolutionSource: "conflicting_authoritative_provider_facts" });
  });

  it("does not project a Runner-reported task when its session is no longer current", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner({ activeSessionId: "new-session" }),
    ] as never[], now });
    expect(result.workspaces.observed[0]).toMatchObject({
      ownerUserId: 7,
      sessionId: null,
      sessionState: "STALE_OR_UNBOUND",
      taskId: null,
      taskIdSource: "UNKNOWN",
    });
  });

  it("uses freshness to exclude expired facts while retaining them as ignored evidence", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner({ snapshotExpiresAt: new Date("2026-10-07T11:59:00.000Z") }),
      runner({ runnerId: "runner-b", currentSnapshotJson: { workspaces: [{ workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a", gitHead: "b".repeat(40) }] } }),
    ] as never[], now });
    expect(result.workspaces.observed[0].hostState).toBe("STALE");
    expect(result.workspaceGroups.observed[0]).toMatchObject({
      state: "OBSERVED",
      reconciliation: {
        status: "RESOLVED_BY_ELIGIBILITY_AND_AGREEMENT",
        policy: "TRUSTED_RUNNER_FACTS_SAME_AUTHORITY; FRESH_FACTS_ONLY; DIVERGENT_RUNNER_GENERATIONS_ARE_NOT_COMPARABLE",
        ignoredClaims: [{ hostId: "runner-a", freshness: "STALE", generation: "snapshot-1" }],
        selectedFact: null,
      },
    });
  });

  it("does not guess a provider from the Runner profile or workspace name when no active tool fact exists", () => {
    const row = runner({ profile: "local_device", currentSnapshotJson: { runnerSessionId: "session-a", workspaces: [{ workspaceId: "codex-project", projectId: "project-a", repositoryId: "repo-a" }] } });
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [row] as never[], now });
    expect(result.workspaces.observed[0]).toMatchObject({ provider: "UNKNOWN", agentIdentity: "runner-a", agentIdentityResolutionSource: "trusted_runner_registration", providerResolutionSource: "no_active_session_provider_fact" });
  });

  it("merges registered owner task facts with trusted Runner provider facts for the same live session", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [runner()] as never[], now,
      localAuthorityStatus: "OBSERVED", localAuthorityObservedAt: now,
      localMissionControl: { sessions: { active_count: 1, active: [{ session_id: "session-a", provider: "UNKNOWN",
        runner_id: null, task_id: "task-a", owner_host: "host-a", execution_state: "LEASED" }] } },
    });

    expect(result.sessions).toMatchObject({ activeCount: 1, active: [expect.objectContaining({
      sessionId: "session-a", provider: "codex", runnerId: "runner-a", runner_id: "runner-a",
      agentIdentity: "codex", task_id: "task-a", owner_host: "host-a", execution_state: "LEASED",
    })] });
  });

  it("does not choose between conflicting confirmed session providers", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [runner()] as never[], now,
      localAuthorityStatus: "OBSERVED", localAuthorityObservedAt: now,
      localMissionControl: { sessions: { active_count: 1, active: [{ session_id: "session-a", provider: "claude" }] } },
    });

    expect(result.sessions.active[0]).toMatchObject({
      provider: "UNKNOWN", providerResolutionSource: "conflicting_authoritative_provider_facts",
    });
  });

  it("reports conflicts in project/repository or dirty-state facts instead of selecting a newer host", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner(),
      runner({ runnerId: "runner-b", currentSnapshotJson: { workspaces: [{ workspaceId: "ws-a", projectId: "project-b", repositoryId: "repo-a", gitHead: "a".repeat(40), gitBranch: "main", dirty: true }] } }),
    ] as never[], now });
    expect(result.workspaceConflicts).toHaveLength(1);
    expect(result.workspaceConflicts[0]).toMatchObject({
      state: "CONFLICT",
      projectId: null,
      reconciliation: {
        status: "CONFLICT",
        reasons: ["TRUSTED_FACTS_DISAGREE_ON_PROJECT_OR_REPOSITORY", "TRUSTED_FACTS_DISAGREE_ON_WORKSPACE_STATE"],
        conflictingFields: ["dirty"],
        selectedFact: null,
      },
    });
  });

  it("surfaces conflicting trusted convergence observations without selecting a host", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner(),
      runner({ runnerId: "runner-b", currentSnapshotJson: { workspaces: [{
        workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a",
        gitHead: "a".repeat(40), gitBranch: "main", dirty: false,
        convergenceState: "CONVERGENCE_PENDING", convergenceCanonicalSha: "b".repeat(40),
      }] } }),
    ] as never[], now });
    expect(result.workspaceConflicts[0]).toMatchObject({
      state: "CONFLICT",
      reconciliation: {
        status: "CONFLICT",
        conflictingFields: ["convergenceState", "convergenceCanonicalSha"],
        selectedFact: null,
      },
    });
  });

  it("retains a single trusted convergence observation when another host has no report", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner(),
      runner({ runnerId: "runner-b", currentSnapshotJson: { workspaces: [{
        workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a",
        gitHead: "a".repeat(40), gitBranch: "main", dirty: false,
      }] } }),
    ] as never[], now });
    expect(result.workspaceGroups.observed[0]).toMatchObject({
      state: "OBSERVED",
      reconciliation: {
        conflictingFields: [],
        agreedWorkspaceState: {
          convergenceState: "USER_WORKSPACE_CONVERGED",
          convergenceCanonicalSha: "a".repeat(40),
        },
      },
    });
  });

  it("does not let a revoked host override a fresh trusted workspace fact", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner(),
      runner({ runnerId: "runner-revoked", trustState: "revoked", revokedAt: new Date("2026-10-07T11:59:30.000Z"), currentSnapshotJson: {
        workspaces: [{ workspaceId: "ws-a", projectId: "project-b", repositoryId: "repo-a", gitHead: "b".repeat(40), dirty: true }],
      } }),
    ] as never[], now });
    expect(result.workspaceGroups.observed[0]).toMatchObject({
      state: "OBSERVED",
      projectId: "project-a",
      reconciliation: {
        eligibleHostIds: ["runner-a"],
        ignoredClaims: [{ hostId: "runner-revoked", trust: "REVOKED", generation: "snapshot-1" }],
      },
    });
    expect(result.workspaceConflicts).toHaveLength(0);
  });

  it("associates a canonical convergence receipt only with its bound workspace ID", () => {
    const receipt = { workspace_id: "ws-a", receipt_id: "receipt-ws-a", result: "USER_WORKSPACE_CONVERGED" };
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [runner()] as never[], now,
      localAuthorityStatus: "OBSERVED",
      localMissionControl: { user_workspace: { workspace_id: "ws-a", convergence_receipt: receipt } },
    });
    expect(result.workspaceGroups.observed[0].reconciliation.canonicalReceipt).toEqual(receipt);
  });

  it("keeps identical opaque workspace IDs isolated across project/repository scopes", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [
      runner(),
      runner({ runnerId: "runner-b", currentSnapshotJson: { workspaces: [{ workspaceId: "ws-a", projectId: "project-b", repositoryId: "repo-b", gitHead: "b".repeat(40), gitBranch: "work" }] } }),
    ] as never[], now });
    expect(result.workspaceGroups.observed).toHaveLength(2);
    expect(result.workspaceGroups.observed).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: "project-a", repositoryId: "repo-a", workspaceId: "ws-a", state: "OBSERVED" }),
      expect.objectContaining({ projectId: "project-b", repositoryId: "repo-b", workspaceId: "ws-a", state: "OBSERVED" }),
    ]));
    expect(result.workspaceConflicts).toHaveLength(0);
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
      sessions: { active_count: 1, active: [{ session_id: "local-session", owner_host: "host-a", owner_lease_expires_at: 1791374460, execution_state: "LEASED", provider: "UNKNOWN", runner_id: null, task_id: "task-a" }] },
      development_state: { uncommitted_intended_work: [], unpushed_intended_commits: { state: "UNKNOWN" }, pushed_unintegrated_work: { state: "OBSERVED", count: 2 }, integrated_work: { state: "PARTIAL" }, semantic_equivalent_integration: { state: "OBSERVED", count: 1 }, recovery_pending: [{ workspace_id: "recovery-a" }] },
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
      sessions: { activeCount: 1, active: [{ session_id: "local-session", provider: "UNKNOWN", task_id: "task-a" }] },
      pushState: { state: "OBSERVED", count: 2 },
      integrationState: { state: "PARTIAL" },
      semanticEquivalentIntegration: { state: "OBSERVED", count: 1 },
      recoveryState: [{ workspace_id: "recovery-a" }],
      convergenceReceipt: null,
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

  it("downgrades expired remote push and canonical facts to STALE", () => {
    const observedAt = "2026-10-07T11:59:00.000Z";
    const later = new Date("2026-10-07T12:02:00.000Z");
    const fact = { state: "OBSERVED", count: 2, freshness: { state: "FRESH", observed_at: observedAt, ttl_seconds: 60 } };
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [], now: later,
      localAuthorityStatus: "OBSERVED", localAuthorityObservedAt: later,
      localMissionControl: {
        repository: { canonical_sha: "a".repeat(40), verification_state: "REMOTE_HEAD_OBSERVED", remote_observation: { status: "OBSERVED", observed_at: observedAt, freshness_ttl_seconds: 60 } },
        user_workspace: { state: "SYNCED", sha: "a".repeat(40), ahead_behind: { state: "OBSERVED", ahead: 0, behind: 0, freshness: { state: "FRESH", observed_at: observedAt, ttl_seconds: 60 } }, remote_observation: { status: "OBSERVED", observed_at: observedAt, freshness_ttl_seconds: 60 } },
        development_state: { unpushed_intended_commits: fact, pushed_unintegrated_work: fact, integrated_work: fact, semantic_equivalent_integration: fact,
          remote_workspace_states: [{ remote_observed_at: observedAt, freshness_ttl_seconds: 60, push_state: "PUSHED", integration_state: "INTEGRATED", unpushed_commit_count: 0 }] },
      },
    });

    expect(result.canonical).toMatchObject({ verification_state: "STALE", remote_observation: { status: "STALE" } });
    expect(result.userWorkspace).toMatchObject({ ahead_behind: { state: "STALE", ahead: null, behind: null }, remote_observation: { status: "STALE" } });
    expect(result.pushState).toMatchObject({ state: "STALE", count: null });
    expect(result.integrationState).toMatchObject({ state: "STALE", count: null });
    expect(result.semanticEquivalentIntegration).toMatchObject({ state: "STALE", count: null });
    expect(result.developmentIntegration.remote_workspace_states[0]).toMatchObject({ push_state: "STALE", integration_state: "STALE", unpushed_commit_count: null });
  });
});
