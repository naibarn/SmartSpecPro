import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetRunnerCompanionState = vi.hoisted(() => vi.fn());
const mockGetDb = vi.hoisted(() => vi.fn());
const mockRunnerReadiness = vi.hoisted(() => vi.fn());

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const procedure: any = {
      input: () => procedure,
      query: (handler: Function) => handler,
      mutation: (handler: Function) => handler,
    };
    return procedure;
  };
  return {
    router: (routes: unknown) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
  };
});

vi.mock("../../db", () => ({ getDb: (...args: unknown[]) => mockGetDb(...args) }));
vi.mock("../../services/runnerCompanionViewState", () => ({
  getRunnerCompanionState: (...args: unknown[]) =>
    mockGetRunnerCompanionState(...args),
}));
vi.mock("../../services/spec224AuthorizationService", () => ({
  defaultSpec224AuthorizationService: { runnerReadiness: (...args: unknown[]) => mockRunnerReadiness(...args) },
}));
vi.mock("../../services/cloudflareStagingExecutorIdentityService", () => ({
  CLOUDFLARE_STAGING_EXECUTOR_CAPABILITY: "cloudflare.staging.executor",
  CLOUDFLARE_STAGING_EXECUTOR_PROFILE: "cloudflare_staging_executor",
  CLOUDFLARE_STAGING_EXECUTOR_TARGET: "cloudflare-staging",
  validateCloudflareStagingExecutorRegistration: vi.fn(),
}));

import { runnerNodesRouter } from "../runnerNodes";
import { PgDialect } from "drizzle-orm/pg-core";

describe("runnerNodesRouter.companionState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRunnerCompanionState.mockResolvedValue({
      schemaVersion: "runner-companion.v1",
    });
    mockRunnerReadiness.mockResolvedValue({ ready: true, code: "RUNNER_READY", ownerAction: null });
  });

  it("binds the projection to the authenticated tenant and user", async () => {
    const handler = runnerNodesRouter.companionState as unknown as Function;

    await handler({
      ctx: {
        tenantId: "tenant-a",
        user: { id: 7, role: "admin", currentTenantId: "tenant-b" },
      },
    });

    expect(mockGetRunnerCompanionState).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      userId: 7,
    });
  });

  it("uses the authenticated current tenant when the request context has no override", async () => {
    const handler = runnerNodesRouter.companionState as unknown as Function;

    await handler({ ctx: { user: { id: 11, currentTenantId: "tenant-c" } } });

    expect(mockGetRunnerCompanionState).toHaveBeenCalledWith({
      tenantId: "tenant-c",
      userId: 11,
    });
  });

  it("evaluates workspace execution readiness through the authenticated Runner scope", async () => {
    const handler = runnerNodesRouter.workspaceReadiness as unknown as Function;
    const result = await handler({
      ctx: { tenantId: "tenant-a", user: { id: 7, currentTenantId: "tenant-b" } },
      input: { runnerId: "runner-a", workspaceId: "workspace-a" },
    });

    expect(mockRunnerReadiness).toHaveBeenCalledWith({
      context: { tenantId: "tenant-a", actorId: 7 },
      runnerId: "runner-a",
      workspaceId: "workspace-a",
    });
    expect(result).toMatchObject({ ready: true, code: "RUNNER_READY" });
  });

  it("scopes Runner workspace presentation to the authenticated tenant and owner", async () => {
    let whereClause: any;
    const rows = [{
      runnerId: "runner-user-7",
      tenantId: "tenant-a",
      ownerUserId: 7,
      profile: "local_device",
      nodeKind: "local_device",
      displayName: "SmartSpecPro",
      trustState: "trusted",
      status: "online",
      currentSnapshotRevision: "r1",
      currentSnapshotJson: {
        workspaceIds: ["ws-1"],
        workspaces: [{
          workspaceId: "ws-1",
          displayName: "SmartSpecPro",
          projectId: "project-1",
          repositoryId: "repo-1",
          gitHead: "a".repeat(40),
          gitBranch: "main",
          dirty: false,
        }],
      },
      snapshotExpiresAt: new Date(Date.now() + 60_000),
      snapshotObservedAt: new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    }];
    mockGetDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            whereClause = condition;
            return { orderBy: () => ({ limit: async () => rows }) };
          },
        }),
      }),
    });
    const handler = runnerNodesRouter.list as unknown as Function;
    const result = await handler({
      ctx: { tenantId: "tenant-a", user: { id: 7, role: "user", currentTenantId: "tenant-b" } },
      input: { viewMode: "simple" },
    });

    const query = new PgDialect().sqlToQuery(whereClause.getSQL());
    expect(query.params).toContain("tenant-a");
    expect(query.params).toContain(7);
    expect(result.runners[0].workspaces).toEqual([
      { provenance: "user_owned", displayName: "SmartSpecPro" },
    ]);
    expect(result.runners[0]).not.toHaveProperty("workspaceIds");
    expect(result.runners[0].displayName).toBe("SmartSpecPro");
    expect(result.runners[0]).toMatchObject({
      capabilitySnapshotPersisted: true,
      capabilitySnapshotCurrent: false,
      capabilityAckState: "stale",
      readinessStatus: "degraded",
    });
  });
});
