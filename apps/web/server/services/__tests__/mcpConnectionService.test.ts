import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnectionRows = vi.fn();
const mockSet = vi.fn();
const mockListRows = vi.fn();

vi.mock("../../db", () => ({
  getDb: () => ({
    select: () => {
      const builder: Record<string, ReturnType<typeof vi.fn>> = {
        from: vi.fn(() => builder),
        innerJoin: vi.fn(() => builder),
        where: vi.fn(() => builder),
        orderBy: vi.fn(() => mockListRows()),
        limit: vi.fn(() => mockConnectionRows()),
      };
      return builder;
    },
    update: () => ({
      set: (payload: Record<string, unknown>) => {
        mockSet(payload);
        return {
          where: () => Promise.resolve(undefined),
        };
      },
    }),
  }),
}));

import { listConnectedMcpProviderKeys, testMcpConnection } from "../mcpConnectionService";

describe("mcpConnectionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps expired MCP connections in requires_reauth during health checks", async () => {
    mockConnectionRows.mockResolvedValueOnce([{
      id: "connection-1",
      encryptedTokenRef: "encrypted-token",
      status: "connected",
      revokedAt: null,
      tokenExpiresAt: new Date(Date.now() - 60_000),
    }]);

    const result = await testMcpConnection({
      tenantId: "tenant-1",
      userId: 1,
      connectionId: "connection-1",
    });

    expect(result).toEqual({ status: "requires_reauth", ok: false });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      status: "requires_reauth",
      lastErrorCode: "MCP connection token has expired; reconnect required",
      lastErrorAt: expect.any(Date),
      lastHealthCheckAt: expect.any(Date),
      updatedAt: expect.any(Date),
    }));
    expect(mockSet).not.toHaveBeenCalledWith(expect.objectContaining({ status: "connected" }));
  });

  it("marks non-expired MCP connections connected during health checks", async () => {
    mockConnectionRows.mockResolvedValueOnce([{
      id: "connection-1",
      encryptedTokenRef: "encrypted-token",
      status: "connected",
      revokedAt: null,
      tokenExpiresAt: new Date(Date.now() + 60_000),
    }]);

    const result = await testMcpConnection({
      tenantId: "tenant-1",
      userId: 1,
      connectionId: "connection-1",
    });

    expect(result).toEqual({ status: "connected", ok: true });
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
      status: "connected",
      lastHealthCheckAt: expect.any(Date),
      updatedAt: expect.any(Date),
    }));
  });

  it("includes connected personal and shared providers but excludes disconnected personal connections", async () => {
    const now = new Date();
    const connection = (overrides: Record<string, unknown>) => ({
      id: "connection-1",
      tenantId: "tenant-1",
      ownerUserId: 1,
      displayName: "MCP connection",
      status: "connected",
      providerAccountLabel: null,
      defaultForImage: false,
      defaultForVideo: false,
      createdAt: now,
      updatedAt: now,
      tokenExpiresAt: null,
      revokedAt: null,
      encryptedTokenRef: "encrypted-token",
      ...overrides,
    });

    mockListRows
      .mockReturnValueOnce([
        { connection: connection({ id: "personal-higgsfield" }), template: { providerKey: "higgsfield", displayName: "Higgsfield", allowedAssetTypes: ["image", "video"], isEnabled: true } },
        { connection: connection({ id: "disconnected-magnific", status: "revoked", revokedAt: now }), template: { providerKey: "magnific", displayName: "Magnific", allowedAssetTypes: ["image", "video"], isEnabled: true } },
      ])
      .mockReturnValueOnce([
        { connection: connection({ id: "shared-magnific", ownerUserId: 2 }), template: { providerKey: "magnific", displayName: "Magnific", allowedAssetTypes: ["image", "video"], isEnabled: true }, share: { id: "share-1", groupId: 7, allowedAssetTypes: ["image"], updatedAt: now } },
      ]);

    await expect(listConnectedMcpProviderKeys({ tenantId: "tenant-1", userId: 1 })).resolves.toEqual(
      new Set(["higgsfield", "magnific"]),
    );
  });
});
