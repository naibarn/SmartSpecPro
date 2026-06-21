import { beforeEach, describe, expect, it, vi } from "vitest";

const mockConnectionRows = vi.fn();
const mockSet = vi.fn();

vi.mock("../../db", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => mockConnectionRows(),
        }),
      }),
    }),
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

import { testMcpConnection } from "../mcpConnectionService";

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
});
