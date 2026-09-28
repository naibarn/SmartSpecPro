import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// Mock db before importing the service
vi.mock("../../db", () => {
  const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  const mockSelect = vi.fn();
  const mockUpdate = vi.fn();
  return {
    db: {
      insert: mockInsert,
      select: mockSelect,
      update: mockUpdate,
    },
  };
});

// Mock tenant feature flag service
vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn().mockResolvedValue({ publicApi: true }),
}));

// Set HMAC secret before importing
const TEST_HMAC_SECRET = "test-hmac-key-long-enough-for-tests-123456";
vi.stubEnv("API_KEY_HMAC_SECRET", TEST_HMAC_SECRET);

// Mock ENV
vi.mock("../../_core/env", () => ({
  ENV: {
    apiKeyHmacSecret: "test-hmac-key-long-enough-for-tests-123456",
  },
}));

import {
  createKey,
  validateKey,
  revokeKey,
  assertHmacSecretConfigured,
  _computeKeyHash,
} from "../apiKeyService";
import { db } from "../../db";
import { getTenantFeatureFlags } from "../tenantFeatureFlagService";

describe("apiKeyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("key generation", () => {
    it("produces sk-ssp_{tenantShortId}_{random} format", async () => {
      const tenantId = "abc12345-6789-abcd-ef01-234567890000";

      // Mock db.insert to capture inserted values
      const valuesFn = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({ values: valuesFn });

      const result = await createKey(tenantId, 1, "Test Key", ["skills:list"]);

      expect(result.rawKey).toMatch(/^sk-ssp_/);
      expect(result.rawKey).toContain("abc12345");
      expect(result.rawKey.length).toBeGreaterThanOrEqual(40);
      expect(result.rawKey.length).toBeLessThanOrEqual(60);
    });

    it("returned raw key matches HMAC hash stored in DB", async () => {
      const tenantId = "abc12345-6789-abcd-ef01-234567890000";

      let insertedValues: any;
      const valuesFn = vi.fn().mockImplementation((vals: any) => {
        insertedValues = vals;
        return Promise.resolve(undefined);
      });
      (db.insert as any).mockReturnValue({ values: valuesFn });

      const result = await createKey(tenantId, 1, "Test Key", ["skills:list"]);

      // Compute expected hash
      const expectedHash = crypto
        .createHmac("sha256", TEST_HMAC_SECRET)
        .update(result.rawKey)
        .digest("hex");

      expect(insertedValues.keyHash).toBe(expectedHash);
    });

    it("validates scopes against ALLOWED_API_SCOPES", async () => {
      const valuesFn = vi.fn().mockResolvedValue(undefined);
      (db.insert as any).mockReturnValue({ values: valuesFn });

      await expect(
        createKey("tenant-id-xxxxx", 1, "Test", ["skills:list", "skills:execute"]),
      ).resolves.toBeDefined();
    });

    it("rejects unknown scopes", async () => {
      await expect(
        createKey("tenant-id-xxxxx", 1, "Test", ["skills:list", "invalid:scope"]),
      ).rejects.toThrow("Invalid scope: invalid:scope");
    });

    it("marks browserless MCP keys and applies safe default credit budgets", async () => {
      let insertedValues: any;
      const valuesFn = vi.fn().mockImplementation((values: any) => {
        insertedValues = values;
        return Promise.resolve(undefined);
      });
      (db.insert as any).mockReturnValue({ values: valuesFn });

      await createKey("tenant-id-xxxxx", 1, "MCP CLI", ["mcp:read"], { purpose: "mcp_cli" });

      expect(insertedValues.metadata).toMatchObject({
        purpose: "mcp_cli",
        creditQuota5h: 500,
        creditQuotaDaily: 1_500,
        creditQuotaWeekly: 5_000,
      });
    });
  });

  describe("key validation", () => {
    it("returns AuthContext for valid key", async () => {
      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
      const keyHash = _computeKeyHash(rawKey);

      const mockRow = {
        id: "key-uuid",
        tenantId: "tenant-uuid",
        userId: 42,
        keyHash,
        isActive: true,
        expiresAt: null,
        scopes: ["skills:list", "skills:execute"],
      };

      // Chain: select().from().where().limit()
      const limitFn = vi.fn().mockResolvedValue([mockRow]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as any).mockReturnValue({ from: fromFn });

      // Mock update for lastUsedAt
      const updateSetFn = vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue(Promise.resolve()),
      });
      (db.update as any).mockReturnValue({ set: updateSetFn });

      const result = await validateKey(rawKey);

      expect(result).toEqual({
        userId: 42,
        tenantId: "tenant-uuid",
        mode: "api_key",
        apiKeyId: "key-uuid",
        scopes: ["skills:list", "skills:execute"],
      });
    });

    it("keeps conservative MCP defaults for an older purpose-only key", async () => {
      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
      const keyHash = _computeKeyHash(rawKey);
      const mockRow = {
        id: "key-uuid",
        tenantId: "tenant-uuid",
        userId: 42,
        keyHash,
        isActive: true,
        expiresAt: null,
        scopes: ["mcp:read"],
        metadata: { purpose: "mcp_cli" },
      };
      const limitFn = vi.fn().mockResolvedValue([mockRow]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as any).mockReturnValue({ from: fromFn });
      const updateSetFn = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue(Promise.resolve()) });
      (db.update as any).mockReturnValue({ set: updateSetFn });

      const result = await validateKey(rawKey);

      expect(result).toMatchObject({
        keyPurpose: "mcp_cli",
        creditQuota5h: 500,
        creditQuotaDaily: 1_500,
        creditQuotaWeekly: 5_000,
      });
    });

    it("rejects expired key", async () => {
      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
      const keyHash = _computeKeyHash(rawKey);

      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      const mockRow = {
        id: "key-uuid",
        tenantId: "tenant-uuid",
        userId: 42,
        keyHash,
        isActive: true,
        expiresAt: pastDate,
        scopes: ["skills:list"],
      };

      const limitFn = vi.fn().mockResolvedValue([mockRow]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as any).mockReturnValue({ from: fromFn });

      const result = await validateKey(rawKey);
      expect(result).toBeNull();
    });

    it("rejects key without sk-ssp_ prefix", async () => {
      const result = await validateKey("bad-prefix-key");
      expect(result).toBeNull();
    });

    it("rejects key when no DB match found", async () => {
      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";

      const limitFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as any).mockReturnValue({ from: fromFn });

      const result = await validateKey(rawKey);
      expect(result).toBeNull();
    });

    it("rejects inactive key", async () => {
      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";

      // isActive=false means WHERE clause won't match — empty result
      const limitFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as any).mockReturnValue({ from: fromFn });

      const result = await validateKey(rawKey);
      expect(result).toBeNull();
    });

    it("returns key even when tenant publicApi flag is false (feature gate handled by middleware)", async () => {
      // validateKey() no longer checks the publicApi feature flag — that check
      // was moved to publicApiFeatureGuard middleware so it can return a proper
      // 403 with "feature_disabled" instead of a misleading 401 "invalid_api_key".
      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
      const keyHash = _computeKeyHash(rawKey);

      const mockRow = {
        id: "key-uuid",
        tenantId: "tenant-uuid",
        userId: 42,
        keyHash,
        isActive: true,
        expiresAt: null,
        scopes: ["skills:list"],
      };

      const limitFn = vi.fn().mockResolvedValue([mockRow]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as any).mockReturnValue({ from: fromFn });

      const result = await validateKey(rawKey);
      expect(result).not.toBeNull();
      expect(result?.tenantId).toBe("tenant-uuid");
    });

    it("uses hash-based lookup (timing-safe by design)", async () => {
      // The validateKey implementation computes HMAC first, then does DB lookup by exact hash.
      // This is timing-safe because the DB returns 0 or 1 rows — no partial match leakage.
      // We verify this by checking that db.select is called (hash-based lookup)
      // rather than iterating through keys.
      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";

      const limitFn = vi.fn().mockResolvedValue([]);
      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
      (db.select as any).mockReturnValue({ from: fromFn });

      await validateKey(rawKey);

      expect(db.select).toHaveBeenCalled();
    });
  });

  describe("revocation", () => {
    it("sets isActive=false", async () => {
      const setFn = vi.fn();
      const whereFn = vi.fn().mockResolvedValue({ rowCount: 1 });
      setFn.mockReturnValue({ where: whereFn });
      (db.update as any).mockReturnValue({ set: setFn });

      const result = await revokeKey("key-id", "tenant-id");
      expect(result).toEqual({ revoked: true });
      expect(setFn).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });

    it("throws if key not found", async () => {
      const setFn = vi.fn();
      const whereFn = vi.fn().mockResolvedValue({ rowCount: 0 });
      setFn.mockReturnValue({ where: whereFn });
      (db.update as any).mockReturnValue({ set: setFn });

      await expect(revokeKey("bad-id", "tenant-id")).rejects.toThrow(
        "API key not found",
      );
    });
  });

  describe("startup assertion", () => {
    it("throws if API_KEY_HMAC_SECRET is missing", async () => {
      // Temporarily override ENV
      const envModule = await import("../../_core/env");
      const original = envModule.ENV.apiKeyHmacSecret;
      (envModule.ENV as any).apiKeyHmacSecret = "";

      expect(() => assertHmacSecretConfigured()).toThrow(
        "FATAL: API_KEY_HMAC_SECRET must be set",
      );

      (envModule.ENV as any).apiKeyHmacSecret = original;
    });

    it("throws if API_KEY_HMAC_SECRET < 32 bytes", async () => {
      const envModule = await import("../../_core/env");
      const original = envModule.ENV.apiKeyHmacSecret;
      (envModule.ENV as any).apiKeyHmacSecret = "short";

      expect(() => assertHmacSecretConfigured()).toThrow(
        "FATAL: API_KEY_HMAC_SECRET must be set",
      );

      (envModule.ENV as any).apiKeyHmacSecret = original;
    });

    it("does not throw with valid secret", () => {
      expect(() => assertHmacSecretConfigured()).not.toThrow();
    });
  });
});
