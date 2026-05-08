import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock service layer
vi.mock("../../services/userApiKeyService", () => ({
  setUserApiKey: vi.fn(),
  getUserApiKeys: vi.fn(),
  deleteUserApiKey: vi.fn(),
  isUserLlmApiKeySelfServiceEnabled: vi.fn(),
}));

// Mock rate limit middleware (no-op in tests)
vi.mock("../../_core/rateLimitedProcedure", () => ({
  createRateLimitMiddleware: vi.fn(() => {
    return async (opts: any) => opts.next();
  }),
}));

// Mock tenantContext
vi.mock("../../services/tenantContext", () => ({
  resolveTenantIdVarchar: vi.fn(
    (ctxTenantId: unknown, userTenantId: unknown) =>
      ctxTenantId || userTenantId || null,
  ),
}));

import type { TrpcContext } from "../../_core/context";
import {
  setUserApiKey,
  getUserApiKeys,
  deleteUserApiKey,
  isUserLlmApiKeySelfServiceEnabled,
} from "../../services/userApiKeyService";
import { userApiKeysRouter } from "../userApiKeys";

const mockSetUserApiKey = vi.mocked(setUserApiKey);
const mockGetUserApiKeys = vi.mocked(getUserApiKeys);
const mockDeleteUserApiKey = vi.mocked(deleteUserApiKey);
const mockIsUserLlmApiKeySelfServiceEnabled = vi.mocked(isUserLlmApiKeySelfServiceEnabled);

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUnauthenticatedContext(): TrpcContext {
  return {
    user: null,
    req: { ip: "127.0.0.1", headers: {}, protocol: "https" } as any,
    res: { clearCookie: vi.fn() } as any,
    userToken: null,
    tenantId: null,
    publicUrl: null,
  };
}

function createAuthenticatedContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "user@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    currentTenantId: "tenant-1",
  } as AuthenticatedUser;

  return {
    user,
    req: { ip: "127.0.0.1", headers: {}, protocol: "https" } as any,
    res: { clearCookie: vi.fn() } as any,
    userToken: null,
    tenantId: "tenant-1",
    publicUrl: null,
  };
}

describe("userApiKeys router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUserLlmApiKeySelfServiceEnabled.mockResolvedValue(true);
  });

  // Use createCaller for auth-gating tests
  const createCaller = userApiKeysRouter.createCaller;

  // --- Auth gating ---
  describe("auth gating", () => {
    it("setKey requires authentication (returns UNAUTHORIZED)", async () => {
      const caller = createCaller(createUnauthenticatedContext());

      await expect(
        caller.setKey({ provider: "openai", apiKey: "sk-test.short" }),
      ).rejects.toThrow(/login/);
    });

    it("listKeys requires authentication (returns UNAUTHORIZED)", async () => {
      const caller = createCaller(createUnauthenticatedContext());

      await expect(caller.listKeys()).rejects.toThrow(/login/);
    });

    it("getPolicy requires authentication (returns UNAUTHORIZED)", async () => {
      const caller = createCaller(createUnauthenticatedContext());

      await expect(caller.getPolicy()).rejects.toThrow(/login/);
    });

    it("deleteKey requires authentication (returns UNAUTHORIZED)", async () => {
      const caller = createCaller(createUnauthenticatedContext());

      await expect(
        caller.deleteKey({ provider: "openai" }),
      ).rejects.toThrow(/login/);
    });
  });

  // --- setKey behavior ---
  describe("setKey", () => {
    it("calls service.setUserApiKey with correct args", async () => {
      mockSetUserApiKey.mockResolvedValue({
        provider: "openai",
        keyHint: "1234",
      });
      const caller = createCaller(createAuthenticatedContext());

      const result = await caller.setKey({
        provider: "openai",
        apiKey: "sk-test.short",
      });

      expect(mockSetUserApiKey).toHaveBeenCalledWith(
        1,
        "tenant-1",
        "openai",
        "sk-test.short",
      );
      expect(result).toEqual({
        provider: "openai",
        keyHint: "1234",
        configured: true,
      });
    });

    it("returns { provider, keyHint, configured } and NOT the apiKey", async () => {
      mockSetUserApiKey.mockResolvedValue({
        provider: "anthropic",
        keyHint: "XYZW",
      });
      const caller = createCaller(createAuthenticatedContext());

      const result = await caller.setKey({
        provider: "anthropic",
        apiKey: "sk-ant.short",
      });

      expect(result).not.toHaveProperty("apiKey");
      expect(result).not.toHaveProperty("apiKeyEncrypted");
      expect(result.configured).toBe(true);
    });

    it("blocks saving keys when admin disabled user-managed LLM API keys", async () => {
      mockIsUserLlmApiKeySelfServiceEnabled.mockResolvedValue(false);
      const caller = createCaller(createAuthenticatedContext());

      await expect(
        caller.setKey({
          provider: "openai",
          apiKey: "sk-test.short",
        }),
      ).rejects.toThrow("User-managed LLM API keys are disabled by admin");

      expect(mockSetUserApiKey).not.toHaveBeenCalled();
    });
  });

  // --- Input validation ---
  describe("input validation", () => {
    it("setKey rejects invalid provider", async () => {
      const caller = createCaller(createAuthenticatedContext());

      await expect(
        caller.setKey({ provider: "badprovider" as any, apiKey: "sk-test.bad" }),
      ).rejects.toThrow();
    });

    it("setKey rejects empty apiKey", async () => {
      const caller = createCaller(createAuthenticatedContext());

      await expect(
        caller.setKey({ provider: "openai", apiKey: "" }),
      ).rejects.toThrow();
    });

    it("setKey rejects apiKey under 20 chars", async () => {
      const caller = createCaller(createAuthenticatedContext());

      await expect(
        caller.setKey({ provider: "openai", apiKey: "sk-short-key" }),
      ).rejects.toThrow();
    });

    it("setKey rejects apiKey over 500 chars", async () => {
      const caller = createCaller(createAuthenticatedContext());

      await expect(
        caller.setKey({ provider: "openai", apiKey: "x".repeat(501) }),
      ).rejects.toThrow();
    });

    it("deleteKey rejects invalid provider", async () => {
      const caller = createCaller(createAuthenticatedContext());

      await expect(
        caller.deleteKey({ provider: "invalid" as any }),
      ).rejects.toThrow();
    });
  });

  // --- listKeys behavior ---
  describe("listKeys", () => {
    it("returns array of { provider, keyHint, configured }", async () => {
      mockGetUserApiKeys.mockResolvedValue([
        { provider: "openai", keyHint: "1234" },
        { provider: "anthropic", keyHint: "5678" },
      ]);
      const caller = createCaller(createAuthenticatedContext());

      const keys = await caller.listKeys();

      expect(keys).toHaveLength(2);
      expect(keys[0]).toEqual({
        provider: "openai",
        keyHint: "1234",
        configured: true,
      });
      expect(keys[0]).not.toHaveProperty("apiKeyEncrypted");
    });

    it("returns empty array for user with no keys", async () => {
      mockGetUserApiKeys.mockResolvedValue([]);
      const caller = createCaller(createAuthenticatedContext());

      const keys = await caller.listKeys();

      expect(keys).toEqual([]);
    });
  });

  describe("getPolicy", () => {
    it("returns whether user-managed LLM API keys are allowed", async () => {
      mockIsUserLlmApiKeySelfServiceEnabled.mockResolvedValue(false);
      const caller = createCaller(createAuthenticatedContext());

      await expect(caller.getPolicy()).resolves.toEqual({ allowed: false });
    });
  });

  // --- deleteKey behavior ---
  describe("deleteKey", () => {
    it("removes the key and returns { success: true }", async () => {
      mockDeleteUserApiKey.mockResolvedValue(undefined);
      const caller = createCaller(createAuthenticatedContext());

      const result = await caller.deleteKey({ provider: "openai" });

      expect(result).toEqual({ success: true });
      expect(mockDeleteUserApiKey).toHaveBeenCalledWith(1, "openai");
    });

    it("non-existent provider still returns { success: true }", async () => {
      mockDeleteUserApiKey.mockResolvedValue(undefined);
      const caller = createCaller(createAuthenticatedContext());

      const result = await caller.deleteKey({ provider: "deepseek" });

      expect(result).toEqual({ success: true });
    });
  });

  // --- Security ---
  describe("security", () => {
    it("decryptUserApiKey is not exposed as a procedure", () => {
      const procedures = Object.keys(
        (userApiKeysRouter as any)._def.procedures,
      );
      expect(procedures).not.toContain("decryptKey");
      expect(procedures).not.toContain("decryptUserApiKey");
      expect(procedures).toEqual(
        expect.arrayContaining(["getPolicy", "setKey", "listKeys", "deleteKey"]),
      );
    });
  });
});
