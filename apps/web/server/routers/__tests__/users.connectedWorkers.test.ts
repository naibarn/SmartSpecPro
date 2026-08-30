import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
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
          hermesMedia: {
            advertised: true,
            hermesVersion: "0.4.0",
            reason: "ready",
          },
          verticalDramaMedia: {
            ready: true,
            capabilities: ["scan", "preprocess", "publish"],
          },
          workerApp: {
            acceptJobs: true,
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
      status: "offline",
      preferredProviderName: "SmartSpecPro Gateway",
      permissionPreset: "operator_basic",
      permissionScopeCount: 1,
      runtimeLabel: "Hermes Worker App",
      runtimeFamily: "Hermes",
      capabilities: {
        hermesReady: true,
        hermesVersion: "0.4.0",
        localMediaReady: true,
        localMediaCapabilities: ["scan", "preprocess", "publish"],
        acceptJobs: true,
      },
    });
  });

  it("marks connected workers offline when their heartbeat is stale", async () => {
    const baseWorker = {
      displayName: "My render worker",
      externalReference: "worker-app://machine-01",
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "shared_department",
      status: "online",
      machineId: "machine-01",
      machineName: "NAIBARN-PC",
      runtimeVersion: "0.1.9",
      teamId: null,
      capabilitiesJson: {},
    };
    const workerRows = [
      {
        ...baseWorker,
        id: "fresh-worker",
        lastSeenAt: new Date("2026-06-23T11:59:00.000Z"),
      },
      {
        ...baseWorker,
        id: "stale-worker",
        lastSeenAt: new Date("2026-06-23T11:55:00.000Z"),
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

    expect(result.workers.map((worker) => [worker.workerId, worker.status])).toEqual([
      ["fresh-worker", "online"],
      ["stale-worker", "offline"],
    ]);
    expect(result.workers.map((worker) => worker.runtimeLabel)).toEqual([
      "Smart AI Hub Worker App",
      "Smart AI Hub Worker App",
    ]);
    expect(result.workers[0].permissionPreset).toBe("vertical_drama_media_operator");
    expect(result.workers[0].permissionScopes).toContain("series:media:process");
    expect(result.workers[1].permissionScopes).toContain("series:media:publish");
  });

  it("updates the worker policy and the current device policy together", async () => {
    const workerRow = {
      id: "worker-policy",
      displayName: "Policy worker",
      externalReference: "worker-app://policy-machine",
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "per_user",
      status: "online",
      machineId: "policy-machine",
      machineName: "POLICY-PC",
      runtimeVersion: "0.1.9",
      lastSeenAt: new Date("2026-06-23T11:59:00.000Z"),
      teamId: null,
      capabilitiesJson: {
        runtimeMetadata: {
          workerAccessPolicy: {
            permissionPreset: "vertical_drama_media_operator",
            permissionScopes: ["workers:heartbeat", "series:read"],
          },
        },
      },
    };
    const workerQuery: Record<string, any> = {
      from: vi.fn(() => workerQuery),
      where: vi.fn(() => workerQuery),
      limit: vi.fn(() => Promise.resolve([workerRow])),
    };
    const deviceQuery: Record<string, any> = {
      from: vi.fn(() => deviceQuery),
      where: vi.fn(() => deviceQuery),
      orderBy: vi.fn(() => deviceQuery),
      limit: vi.fn(() => Promise.resolve([{
        id: "device-policy",
        scopesJson: ["workers:heartbeat", "series:read"],
      }])),
    };
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    mockGetDb.mockResolvedValue({
      select: vi.fn()
        .mockReturnValueOnce(workerQuery)
        .mockReturnValueOnce(deviceQuery),
      update: vi.fn(() => ({ set: updateSet })),
    });

    const result = await usersRouter.createCaller(createContext() as any)
      .updateConnectedWorkerPermissions({
        workerId: "worker-policy",
        permissionScopes: ["workers:heartbeat", "series:read"],
      });

    expect(result.deviceUpdated).toBe(true);
    expect(result.worker.permissionPreset).toBe("custom");
    expect(result.worker.permissionScopes).toEqual([
      "workers:heartbeat",
      "series:read",
    ]);
    expect(updateSet).toHaveBeenCalledTimes(2);
  });

  it("rejects a permission elevation before writing either policy", async () => {
    const workerRow = {
      id: "worker-policy-bound",
      displayName: "Bound policy worker",
      externalReference: "worker-app://bound-machine",
      runtimeType: "desktop_zeroclaw_managed",
      workerMode: "per_user",
      status: "online",
      machineId: "bound-machine",
      machineName: "BOUND-PC",
      runtimeVersion: "0.1.9",
      lastSeenAt: new Date("2026-06-23T11:59:00.000Z"),
      teamId: null,
      capabilitiesJson: {
        runtimeMetadata: {
          workerAccessPolicy: {
            permissionPreset: "custom",
            permissionScopes: ["workers:heartbeat"],
          },
        },
      },
    };
    const workerQuery: Record<string, any> = {
      from: vi.fn(() => workerQuery),
      where: vi.fn(() => workerQuery),
      limit: vi.fn(() => Promise.resolve([workerRow])),
    };
    const deviceQuery: Record<string, any> = {
      from: vi.fn(() => deviceQuery),
      where: vi.fn(() => deviceQuery),
      orderBy: vi.fn(() => deviceQuery),
      limit: vi.fn(() => Promise.resolve([{
        id: "device-bound-policy",
        scopesJson: ["workers:heartbeat"],
      }])),
    };
    const updateSet = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));
    mockGetDb.mockResolvedValue({
      select: vi.fn()
        .mockReturnValueOnce(workerQuery)
        .mockReturnValueOnce(deviceQuery),
      update: vi.fn(() => ({ set: updateSet })),
    });

    await expect(
      usersRouter.createCaller(createContext() as any)
        .updateConnectedWorkerPermissions({
          workerId: "worker-policy-bound",
          permissionScopes: ["workers:heartbeat", "series:read"],
        }),
    ).rejects.toThrow("permissionScopes exceed the current device approval");
    expect(updateSet).not.toHaveBeenCalled();
  });
});
