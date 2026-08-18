import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());
const mockDecrypt = vi.hoisted(() => vi.fn((value: string) => value));

vi.mock("../../db", () => ({ getDb: mockGetDb }));
vi.mock("../crypto", () => ({ decrypt: mockDecrypt }));

import {
  getMcpRuntimeConfigForAdmin,
  refreshMcpRuntimeConfigCache,
  resetMcpRuntimeConfigCacheForTests,
} from "../mcpRuntimeConfig";

function settingsQuery(where: ReturnType<typeof vi.fn>) {
  return {
    select: () => ({
      from: () => ({ where }),
    }),
  };
}

describe("MCP runtime setting category compatibility", () => {
  afterEach(() => {
    resetMcpRuntimeConfigCacheForTests();
    vi.clearAllMocks();
  });

  it("prefers the mcp category while retaining legacy infrastructure values", async () => {
    const where = vi.fn()
      .mockResolvedValueOnce([
        { key: "oauth_private_jwk", value: "private-jwk", isSensitive: false },
        { key: "modern_protocol_enabled", value: "true", isSensitive: false },
      ])
      .mockResolvedValueOnce([
        { key: "modern_protocol_enabled", value: "false", isSensitive: false },
        { key: "oauth_protected_resource_enabled", value: "true", isSensitive: false },
      ]);
    mockGetDb.mockResolvedValue(settingsQuery(where));

    await refreshMcpRuntimeConfigCache();
    const snapshot = getMcpRuntimeConfigForAdmin();

    expect(snapshot.source).toBe("db");
    expect(snapshot.keyConfigured).toBe(true);
    expect(snapshot.config.modernProtocolEnabled).toBe(true);
    expect(snapshot.config.oauthProtectedResourceEnabled).toBe(true);
  });
});
