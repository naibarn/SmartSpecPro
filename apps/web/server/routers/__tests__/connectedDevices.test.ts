import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/trpc", () => {
  const procedure = () => {
    const current: any = {
      input: () => current,
      query: (handler: unknown) => handler,
      mutation: (handler: unknown) => handler,
      use: () => current,
    };
    return current;
  };
  return {
    router: (routes: unknown) => routes,
    protectedProcedure: procedure(),
  };
});

const { mockList, mockRevoke, mockRevokeAll, mockUpdatePermissions } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockRevoke: vi.fn(),
  mockRevokeAll: vi.fn(),
  mockUpdatePermissions: vi.fn(),
}));

vi.mock("../../services/connectedDeviceService", () => ({
  listConnectedDevicesForUser: mockList,
  revokeConnectedDevice: mockRevoke,
  revokeAllMcpConnectionsForUser: mockRevokeAll,
  updateConnectedDevicePermissions: mockUpdatePermissions,
}));

import { connectedDevicesRouter } from "../connectedDevices";

describe("connectedDevicesRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists only the authenticated user's tenant scope", async () => {
    mockList.mockResolvedValue([]);
    await (connectedDevicesRouter.list as any)({
      ctx: {
        tenantId: "tenant-a",
        user: { id: 7, currentTenantId: "tenant-fallback" },
      },
    });
    expect(mockList).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      ownerUserId: 7,
    });
  });

  it("does not leak whether another owner's device exists", async () => {
    mockRevoke.mockRejectedValue(new Error("Connected device not found"));
    await expect(
      (connectedDevicesRouter.revoke as any)({
        ctx: { tenantId: "tenant-a", user: { id: 7 } },
        input: { deviceId: "device-owned-by-someone-else" },
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockRevoke).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        ownerUserId: 7,
        deviceId: "device-owned-by-someone-else",
      })
    );
  });

  it("passes an idempotent revoke request to the canonical service", async () => {
    const device = { deviceId: "device-1", status: "revoked" };
    mockRevoke.mockResolvedValue(device);
    const result = await (connectedDevicesRouter.revoke as any)({
      ctx: { tenantId: "tenant-a", user: { id: 7 } },
      input: { deviceId: "device-1", reason: "user_revoked_from_settings" },
    });
    expect(result).toEqual({ device });
    expect(mockRevoke).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      ownerUserId: 7,
      deviceId: "device-1",
      reason: "user_revoked_from_settings",
    });
  });

  it("revokes all MCP bindings only in the authenticated tenant", async () => {
    mockRevokeAll.mockResolvedValue({
      revokedDeviceCount: 2,
      revokedRecordCount: 3,
    });
    const result = await (connectedDevicesRouter.revokeAllMcp as any)({
      ctx: { tenantId: "tenant-a", user: { id: 7 } },
      input: { reason: "user_revoked_all_mcp_connections" },
    });
    expect(result).toEqual({
      result: { revokedDeviceCount: 2, revokedRecordCount: 3 },
    });
    expect(mockRevokeAll).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      ownerUserId: 7,
      reason: "user_revoked_all_mcp_connections",
    });
  });

  it("updates device permissions only in the authenticated tenant and user scope", async () => {
    const device = {
      deviceId: "device-1",
      allowedScopes: ["mcp:read"],
      effectiveScopes: ["mcp:read"],
    };
    mockUpdatePermissions.mockResolvedValue(device);
    const result = await (connectedDevicesRouter.updatePermissions as any)({
      ctx: { tenantId: "tenant-a", user: { id: 7 } },
      input: { deviceId: "device-1", allowedScopes: ["mcp:read"] },
    });
    expect(result).toEqual({ device });
    expect(mockUpdatePermissions).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      ownerUserId: 7,
      deviceId: "device-1",
      allowedScopes: ["mcp:read"],
    });
  });
});
