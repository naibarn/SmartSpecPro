import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listHermesConnectionsMock: vi.fn(),
  getHermesConnectionMock: vi.fn(),
  getHermesAvailabilityMock: vi.fn(),
  startHermesConnectMock: vi.fn(),
  getHermesConnectStatusMock: vi.fn(),
  setHermesDefaultConnectionMock: vi.fn(),
  disconnectHermesConnectionMock: vi.fn(),
  probeHermesConnectionMock: vi.fn(),
  adminListHermesConnectionsMock: vi.fn(),
  adminSetHermesQuotaMock: vi.fn(),
  adminDisableHermesConnectionMock: vi.fn(),
}));

vi.mock("../../services/hermesConnectionService", () => ({
  listHermesConnections: mocks.listHermesConnectionsMock,
  getHermesConnection: mocks.getHermesConnectionMock,
  getHermesAvailability: mocks.getHermesAvailabilityMock,
  startHermesConnect: mocks.startHermesConnectMock,
  getHermesConnectStatus: mocks.getHermesConnectStatusMock,
  setHermesDefaultConnection: mocks.setHermesDefaultConnectionMock,
  disconnectHermesConnection: mocks.disconnectHermesConnectionMock,
  probeHermesConnection: mocks.probeHermesConnectionMock,
  adminListHermesConnections: mocks.adminListHermesConnectionsMock,
  adminSetHermesQuota: mocks.adminSetHermesQuotaMock,
  adminDisableHermesConnection: mocks.adminDisableHermesConnectionMock,
}));

import { hermesConnectionsRouter } from "../hermesConnections";

function createCtx(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: 1,
      role: "user",
      currentTenantId: "tenant-1",
    },
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

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listHermesConnectionsMock.mockResolvedValue([]);
  mocks.getHermesConnectionMock.mockResolvedValue({});
  mocks.getHermesAvailabilityMock.mockResolvedValue({
    enabled: false,
    videoEnabled: false,
    scopes: { serverShared: false, serverPersonal: false, privateWorker: false },
  });
  mocks.startHermesConnectMock.mockResolvedValue({ connectionId: "conn-1" });
  mocks.getHermesConnectStatusMock.mockResolvedValue({ status: "pending" });
  mocks.setHermesDefaultConnectionMock.mockResolvedValue(undefined);
  mocks.disconnectHermesConnectionMock.mockResolvedValue(undefined);
  mocks.probeHermesConnectionMock.mockResolvedValue(undefined);
  mocks.adminListHermesConnectionsMock.mockResolvedValue([]);
  mocks.adminSetHermesQuotaMock.mockResolvedValue(undefined);
  mocks.adminDisableHermesConnectionMock.mockResolvedValue(undefined);
});

describe("hermesConnectionsRouter — auth", () => {
  it("rejects every procedure for an unauthenticated ctx", async () => {
    const caller = hermesConnectionsRouter.createCaller(createUnauthCtx());

    await expect(caller.listConnections()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.getConnection({ connectionId: "c1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.getAvailability()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.startConnect({ scope: "server_personal", consentAcknowledged: true }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.getConnectStatus({ connectionId: "c1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.setDefault({ connectionId: "c1", assetType: "image" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.disconnect({ connectionId: "c1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.probe({ connectionId: "c1" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    // adminProcedure's guard checks `!ctx.user || role mismatch` as a single
    // condition, so an unauthenticated ctx surfaces as FORBIDDEN here (not
    // UNAUTHORIZED) — see `_core/trpc.ts`'s `adminProcedure` middleware.
    await expect(caller.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminSetQuota({ connectionId: "c1", dailyJobQuota: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminDisable({ connectionId: "c1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects adminList/adminSetQuota/adminDisable for a non-admin ctx", async () => {
    const caller = hermesConnectionsRouter.createCaller(createCtx());

    await expect(caller.adminList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminSetQuota({ connectionId: "c1", dailyJobQuota: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.adminDisable({ connectionId: "c1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows adminList/adminSetQuota/adminDisable for an admin ctx", async () => {
    const caller = hermesConnectionsRouter.createCaller(createAdminCtx());

    await expect(caller.adminList()).resolves.toEqual([]);
    await expect(caller.adminSetQuota({ connectionId: "c1", dailyJobQuota: 5 })).resolves.toBeUndefined();
    await expect(caller.adminDisable({ connectionId: "c1" })).resolves.toBeUndefined();
  });
});

describe("hermesConnectionsRouter — getAvailability", () => {
  it("reflects flag states from the service", async () => {
    const caller = hermesConnectionsRouter.createCaller(createCtx());

    mocks.getHermesAvailabilityMock.mockResolvedValueOnce({
      enabled: false,
      videoEnabled: false,
      scopes: { serverShared: false, serverPersonal: false, privateWorker: false },
    });
    await expect(caller.getAvailability()).resolves.toMatchObject({ enabled: false });

    mocks.getHermesAvailabilityMock.mockResolvedValueOnce({
      enabled: true,
      videoEnabled: false,
      scopes: { serverShared: true, serverPersonal: true, privateWorker: true },
    });
    await expect(caller.getAvailability()).resolves.toMatchObject({ enabled: true, videoEnabled: false });
  });
});

describe("hermesConnectionsRouter — input validation", () => {
  it("rejects startConnect with an invalid scope value", async () => {
    const caller = hermesConnectionsRouter.createCaller(createCtx());
    await expect(caller.startConnect({ scope: "not_a_scope" as any, consentAcknowledged: true })).rejects.toThrow();
    expect(mocks.startHermesConnectMock).not.toHaveBeenCalled();
  });

  it("rejects setDefault with an invalid assetType", async () => {
    const caller = hermesConnectionsRouter.createCaller(createCtx());
    await expect(caller.setDefault({ connectionId: "c1", assetType: "audio" as any })).rejects.toThrow();
    expect(mocks.setHermesDefaultConnectionMock).not.toHaveBeenCalled();
  });
});

describe("hermesConnectionsRouter — no token-like fields in responses", () => {
  it("listConnections never surfaces token-like keys on a happy path", async () => {
    mocks.listHermesConnectionsMock.mockResolvedValueOnce([{
      id: "conn-1",
      scope: "server_personal",
      status: "authorized",
      accountLabel: "My Grok",
      accountHint: "grok-fan",
      defaultForImage: true,
      defaultForVideo: false,
      entitlementStatus: null,
      assignedWorkerId: "worker-1",
      assignedWorkerOnline: true,
      capabilitySummary: { probedAt: null, imageEnabled: false, videoEnabled: false, maxEditReferences: null },
      dailyJobQuota: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      authorizedAt: "2026-01-01T00:00:00.000Z",
    }]);

    const caller = hermesConnectionsRouter.createCaller(createCtx());
    const result = await caller.listConnections();
    expect(JSON.stringify(result)).not.toMatch(/token|secret|password|refresh|auth_json/i);
  });
});

describe("hermesConnectionsRouter — delegation", () => {
  it("passes tenant/user context through to the service for startConnect", async () => {
    const caller = hermesConnectionsRouter.createCaller(createCtx());
    await caller.startConnect({ scope: "server_personal", consentAcknowledged: true, label: "My connection" });
    expect(mocks.startHermesConnectMock).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      userId: 1,
      isAdmin: false,
      scope: "server_personal",
      consentAcknowledged: true,
      label: "My connection",
    }));
  });

  it("marks isAdmin true for an admin ctx on startConnect", async () => {
    const caller = hermesConnectionsRouter.createCaller(createAdminCtx());
    await caller.startConnect({ scope: "server_shared", consentAcknowledged: true });
    expect(mocks.startHermesConnectMock).toHaveBeenCalledWith(expect.objectContaining({ isAdmin: true }));
  });
});
