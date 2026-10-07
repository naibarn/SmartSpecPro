import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  select: vi.fn(),
  createControlPlaneJob: vi.fn(),
}));

vi.mock("drizzle-orm", () => ({
  and: (...values: unknown[]) => values,
  eq: (...values: unknown[]) => values,
  isNull: (...values: unknown[]) => values,
}));
vi.mock("../../drizzle/schema", () => ({
  runnerNodes: {
    runnerId: "runnerId", tenantId: "tenantId", ownerUserId: "ownerUserId",
    trustState: "trustState", status: "status", activeSessionId: "activeSessionId",
    currentSnapshotRevision: "currentSnapshotRevision", currentSnapshotJson: "currentSnapshotJson",
    snapshotObservedAt: "snapshotObservedAt", snapshotExpiresAt: "snapshotExpiresAt", revokedAt: "revokedAt",
  },
  workerJobs: {
    id: "id", tenantId: "tenantId", requestedByUserId: "requestedByUserId",
    jobType: "jobType", status: "status", inputJson: "inputJson", outputJson: "outputJson",
    createdAt: "createdAt", finishedAt: "finishedAt",
  },
}));
vi.mock("../db", () => ({ getDb: () => ({ select: mocks.select }) }));
vi.mock("./jobControlPlaneGateway", () => ({ createControlPlaneJob: mocks.createControlPlaneJob }));

import { enqueueWorkspaceAuthorityAction, resolveOwnedWorkspaceAuthority } from "./workspaceAuthoritySafeActions";

function row(overrides: Record<string, unknown> = {}) {
  return {
    runnerId: "runner-a", ownerUserId: 42, trustState: "trusted", status: "offline",
    activeSessionId: null, currentSnapshotRevision: "snapshot-1",
    snapshotObservedAt: new Date("2026-10-07T11:00:00.000Z"),
    snapshotExpiresAt: new Date("2026-10-07T10:00:00.000Z"),
    currentSnapshotJson: { workspaceIds: ["ws-a"], workspaces: [{ workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a", gitHead: "a".repeat(40), gitBranch: "main", dirty: false }] },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [row()];
  mocks.select.mockImplementation(() => ({ from: () => ({ where: async () => mocks.rows }) }));
  mocks.createControlPlaneJob.mockResolvedValue({ jobId: "job-1", created: true });
});

describe("Workspace Authority safe-action dispatch", () => {
  const base = {
    tenantId: "tenant-a", actorId: 42, projectId: "project-a", repositoryId: "repo-a",
    workspaceId: "ws-a", action: "INSPECT_LOCAL_CHANGES" as const,
  };

  it("resolves only the owned trusted Runner fact bound to the requested project and workspace", async () => {
    await expect(resolveOwnedWorkspaceAuthority(base)).resolves.toMatchObject({
      runnerId: "runner-a", ownerUserId: 42, trustState: "trusted",
      workspace: { workspaceId: "ws-a", projectId: "project-a", repositoryId: "repo-a" },
    });
  });

  it("rejects a workspace owned by another actor", async () => {
    mocks.rows = [row({ ownerUserId: 9 })];
    await expect(resolveOwnedWorkspaceAuthority(base)).rejects.toMatchObject({ code: "WORKSPACE_ACTION_AUTHORITY_NOT_FOUND" });
  });

  it("rejects unbound or cross-project Runner workspace facts", async () => {
    mocks.rows = [row({ currentSnapshotJson: { workspaceIds: ["ws-a"] } })];
    await expect(resolveOwnedWorkspaceAuthority(base)).rejects.toMatchObject({ code: "WORKSPACE_ACTION_AUTHORITY_NOT_FOUND" });
  });

  it("rejects ambiguous workspace identities reported by more than one Runner", async () => {
    mocks.rows = [row(), row({ runnerId: "runner-b" })];
    await expect(resolveOwnedWorkspaceAuthority(base)).rejects.toMatchObject({ code: "WORKSPACE_ACTION_AUTHORITY_CONFLICT" });
  });

  it("queues through worker_jobs and returns replay status for a repeated normalized request", async () => {
    const request = { ...base, idempotencyKey: "safe-action-key-1", payload: {} };
    await expect(enqueueWorkspaceAuthorityAction(request)).resolves.toMatchObject({ status: "QUEUED", jobId: "job-1" });
    expect(mocks.createControlPlaneJob).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ tenantId: "tenant-a", actorType: "user", actorId: 42, idempotencyKey: expect.stringMatching(/^workspace-action:/) }),
      definition: expect.objectContaining({ jobType: "workspace.authority.safe_action", input: expect.objectContaining({ action: "INSPECT_LOCAL_CHANGES", projectId: "project-a", workspaceId: "ws-a" }) }),
    }));
    mocks.createControlPlaneJob.mockResolvedValueOnce({ jobId: "job-1", created: false });
    await expect(enqueueWorkspaceAuthorityAction(request)).resolves.toMatchObject({ status: "REPLAY_SAFE", jobId: "job-1" });
  });

  it("surfaces a same-key conflicting request as an explicit conflict", async () => {
    mocks.createControlPlaneJob.mockRejectedValueOnce(new Error("IDEMPOTENCY_CONFLICT"));
    await expect(enqueueWorkspaceAuthorityAction({ ...base, idempotencyKey: "safe-action-key-1", action: "RECOVER_WORK", payload: {} }))
      .rejects.toMatchObject({ code: "WORKSPACE_ACTION_IDEMPOTENCY_CONFLICT" });
  });
});
