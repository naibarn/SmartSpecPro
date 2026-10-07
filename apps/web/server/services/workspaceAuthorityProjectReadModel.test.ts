import { describe, expect, it } from "vitest";
import { projectRunnerWorkspaceAuthority } from "./workspaceAuthorityProjectReadModel";

const now = new Date("2026-10-07T12:00:00.000Z");
function runner(overrides: Record<string, unknown> = {}) {
  return {
    runnerId: "runner-a", tenantId: "tenant-a", ownerUserId: 7, profile: "codex", displayName: "Dev host",
    trustState: "trusted", status: "online", currentSnapshotRevision: "snapshot-1",
    currentSnapshotJson: { runnerSessionId: "session-a", workspaces: [{ workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a", gitHead: "a".repeat(40), gitBranch: "main", dirty: false }] },
    snapshotObservedAt: new Date("2026-10-07T11:59:00.000Z"), snapshotExpiresAt: new Date("2026-10-07T12:01:00.000Z"),
    lastSeenAt: new Date("2026-10-07T11:59:00.000Z"), revokedAt: null, activeSessionId: "session-a", ...overrides,
  };
}

describe("projectRunnerWorkspaceAuthority", () => {
  it("projects trusted fresh host identity and preserves project and repository identities", () => {
    const result = projectRunnerWorkspaceAuthority({ tenantId: "tenant-a", actorId: 7, rows: [runner()] as never[], now });
    expect(result.workspaces.observed[0]).toMatchObject({ projectId: "project-a", repositoryId: "repo-a", hostId: "runner-a", provider: "codex", trust: "TRUSTED", sessionId: "session-a", observedSha: "a".repeat(40) });
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
});
