import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetDb, mockResolveTenantIdVarchar } = vi.hoisted(() => {
  process.env.JWT_SECRET = "test-jwt-secret-for-users-router-tenant-context";

  return {
    mockGetDb: vi.fn(),
    mockResolveTenantIdVarchar: vi.fn((ctxTenantId: unknown, userTenantId: unknown) =>
      typeof ctxTenantId === "string" && ctxTenantId.trim().length > 0
        ? ctxTenantId.trim()
        : typeof userTenantId === "string" && userTenantId.trim().length > 0
          ? userTenantId.trim()
          : null,
    ),
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: mockResolveTenantIdVarchar,
}));

import { usersRouter } from "../users";

function createSelectChain(result: unknown[], terminal: "orderBy" | "where" = "where") {
  const chain: Record<string, any> = {
    from: vi.fn(() => chain),
    leftJoin: vi.fn(() => chain),
    where: vi.fn(() => terminal === "where" ? Promise.resolve(result) : chain),
    orderBy: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
}

function createContext() {
  return {
    user: {
      id: 42,
      openId: "user-open-id",
      email: "worker-owner@example.com",
      name: "Worker Owner",
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      currentTenantId: "profile-tenant",
    },
    tenantId: "url-tenant",
    userToken: null,
    privateVaultToken: null,
    publicUrl: "https://smartaihub.app",
    req: { ip: "127.0.0.1", headers: {}, protocol: "https" } as any,
    res: {} as any,
  };
}

describe("usersRouter connected workers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists connected workers from the URL tenant before the profile tenant", async () => {
    const workerRows = [
      {
        id: "worker-url-tenant",
        displayName: "My render worker",
        externalReference: "worker-app://machine-01",
        runtimeType: "desktop_zeroclaw_managed",
        workerMode: "per_user",
        status: "online",
        machineId: "machine-01",
        machineName: "NAIBARN-PC",
        runtimeVersion: "0.1.9",
        lastSeenAt: new Date("2026-06-23T05:05:04.000Z"),
        teamId: null,
        capabilitiesJson: {
          runtimeMetadata: {
            preferredProviderName: "SmartSpecPro Gateway",
            workerAccessPolicy: {
              permissionPreset: "operator_basic",
              permissionScopes: ["workers:claim"],
            },
          },
        },
      },
    ];
    const workerQuery = createSelectChain(workerRows, "orderBy");
    const groupsQuery = createSelectChain([]);
    mockGetDb.mockResolvedValue({
      select: vi.fn()
        .mockReturnValueOnce(workerQuery)
        .mockReturnValueOnce(groupsQuery),
    });

    const result = await usersRouter.createCaller(createContext() as any).listConnectedWorkers();

    expect(mockResolveTenantIdVarchar).toHaveBeenCalledWith("url-tenant", "profile-tenant");
    expect(result.workers).toHaveLength(1);
    expect(result.workers[0]).toMatchObject({
      workerId: "worker-url-tenant",
      displayName: "My render worker",
      workerTypeKey: "smart_ai_hub_worker_app",
      runtimeVersion: "0.1.9",
      preferredProviderName: "SmartSpecPro Gateway",
      permissionPreset: "operator_basic",
      permissionScopeCount: 1,
    });
  });
});
