/**
 * Feature 135 section 12 — `hermesConnections.adminOverview` router-level
 * coverage (§3.3). Only the service seam is mocked (`getHermesAdminOverview`)
 * — this test asserts the router is admin-only and passes through the
 * tenant-scoped call, mirroring `hermesConnections.test.ts`'s conventions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHermesAdminOverviewMock: vi.fn(),
}));

vi.mock("../../services/hermesConnectionService", () => ({
  getHermesAdminOverview: mocks.getHermesAdminOverviewMock,
}));

import { hermesConnectionsRouter } from "../hermesConnections";

function createCtx(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: 1, role: "user", currentTenantId: "tenant-1" },
    tenantId: "tenant-1",
    ...overrides,
  } as any;
}

function createAdminCtx(overrides: Record<string, unknown> = {}) {
  return createCtx({ user: { id: 1, role: "admin", currentTenantId: "tenant-1" }, ...overrides });
}

function createUnauthCtx() {
  return { user: null, tenantId: "tenant-1" } as any;
}

const SAMPLE_OVERVIEW = {
  scopes: [
    {
      scope: "server_shared",
      connections: [
        {
          id: "conn-1",
          scope: "server_shared",
          status: "authorized",
          accountLabel: null,
          accountHint: "grok-user",
          defaultForImage: false,
          defaultForVideo: false,
          entitlementStatus: null,
          assignedWorkerId: "worker-1",
          assignedWorkerOnline: true,
          capabilitySummary: { probedAt: null, imageEnabled: true, videoEnabled: false, maxEditReferences: null },
          dailyJobQuota: 10,
          createdAt: "2026-06-01T00:00:00.000Z",
          authorizedAt: "2026-06-01T00:00:00.000Z",
          usedToday: 3,
          queueDepth: 1,
        },
      ],
    },
    { scope: "server_personal", connections: [] },
    { scope: "private_worker", connections: [] },
  ],
  settings: {
    hermesWorkerEnabled: true,
    sharedPoolEnabled: true,
    serverPersonalEnabled: false,
    privateEnabled: false,
    videoEnabled: false,
    sharedPoolFeeCredits: 2,
    minHermesVersion: "0.18.2",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getHermesAdminOverviewMock.mockResolvedValue(SAMPLE_OVERVIEW);
});

describe("hermesConnectionsRouter.adminOverview", () => {
  it("rejects an unauthenticated ctx with FORBIDDEN (adminProcedure guard)", async () => {
    const caller = hermesConnectionsRouter.createCaller(createUnauthCtx());
    await expect(caller.adminOverview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getHermesAdminOverviewMock).not.toHaveBeenCalled();
  });

  it("rejects a non-admin ctx with FORBIDDEN", async () => {
    const caller = hermesConnectionsRouter.createCaller(createCtx());
    await expect(caller.adminOverview()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getHermesAdminOverviewMock).not.toHaveBeenCalled();
  });

  it("returns the overview for an admin ctx, scoped to the caller's tenant", async () => {
    const caller = hermesConnectionsRouter.createCaller(createAdminCtx());
    const result = await caller.adminOverview();

    expect(mocks.getHermesAdminOverviewMock).toHaveBeenCalledWith({ tenantId: "tenant-1" });
    expect(result).toEqual(SAMPLE_OVERVIEW);
  });

  it("returns per-scope groupings of SafeHermesConnection rows with no secret fields", () => {
    const flatConnections = SAMPLE_OVERVIEW.scopes.flatMap((group) => group.connections);
    for (const connection of flatConnections) {
      expect(JSON.stringify(connection)).not.toMatch(/token|secret|password|refresh|profileReference|auth_json/i);
      expect(connection).toHaveProperty("dailyJobQuota");
      expect(connection).toHaveProperty("usedToday");
      expect(connection).toHaveProperty("queueDepth");
    }
  });

  it("settings snapshot exposes only the five kill-switch flags + fee + minHermesVersion (typed values, never raw system_settings)", async () => {
    const caller = hermesConnectionsRouter.createCaller(createAdminCtx());
    const result = await caller.adminOverview();

    expect(Object.keys(result.settings).sort()).toEqual(
      [
        "hermesWorkerEnabled",
        "sharedPoolEnabled",
        "serverPersonalEnabled",
        "privateEnabled",
        "videoEnabled",
        "sharedPoolFeeCredits",
        "minHermesVersion",
      ].sort(),
    );
  });
});
