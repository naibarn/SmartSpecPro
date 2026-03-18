import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db module before imports
vi.mock("../../../db", () => ({
  getDb: vi.fn(),
}));

// Mock jose
vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation((payload: any) => {
    const instance = {
      payload,
      setProtectedHeader: vi.fn().mockReturnThis(),
      setExpirationTime: vi.fn().mockReturnThis(),
      sign: vi.fn().mockResolvedValue("mock-jwt-token"),
    };
    return instance;
  }),
  jwtVerify: vi.fn().mockResolvedValue({
    payload: { userId: -1, role: "system_agent" },
  }),
}));

// Mock env
vi.mock("../../../_core/env", () => ({
  ENV: { cookieSecret: "test-secret-key-at-least-32-chars-long!!" },
}));

import { ensureSystemUser, getSystemUserToken, SYSTEM_USER_ID } from "../systemUser";
import { getDb } from "../../../db";

describe("SystemUser", () => {
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
    };
    (getDb as any).mockResolvedValue(mockDb);
  });

  it("creates system user with id -1 if not exists", async () => {
    mockDb.limit.mockResolvedValue([]); // no existing user

    await ensureSystemUser();

    expect(mockDb.insert).toHaveBeenCalled();
    const insertCall = mockDb.values.mock.calls[0][0];
    expect(insertCall).toMatchObject({
      id: SYSTEM_USER_ID,
      email: "system-agent@internal",
      role: "system_agent",
      isSystemUser: true,
    });
  });

  it("does not duplicate system user on second call", async () => {
    mockDb.limit.mockResolvedValue([
      { id: SYSTEM_USER_ID, email: "system-agent@internal", role: "system_agent" },
    ]);

    await ensureSystemUser();

    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("generates valid JWT with system_agent role", async () => {
    const token = await getSystemUserToken();

    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("JWT includes userId -1 and no tenantId", async () => {
    const { SignJWT } = await import("jose");

    // Clear cached token to force regeneration
    vi.resetModules();
    const { getSystemUserToken: freshGetToken } = await import("../systemUser");

    await freshGetToken();

    // Check the SignJWT was called with correct payload
    expect(SignJWT).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SYSTEM_USER_ID,
        role: "system_agent",
      })
    );
    // Verify tenantId is not in payload or is null
    const calledPayload = (SignJWT as any).mock.calls[0][0];
    expect(calledPayload.tenantId).toBeUndefined();
  });

  it("system user cannot login via normal auth flow (loginMethod is system)", async () => {
    mockDb.limit.mockResolvedValue([]); // no existing user

    await ensureSystemUser();

    const insertCall = mockDb.values.mock.calls[0][0];
    expect(insertCall.loginMethod).toBe("system");
    // The "system" loginMethod prevents matching in the normal OAuth flow
  });
});
