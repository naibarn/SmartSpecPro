import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock crypto.ts before importing the service
vi.mock("../crypto", () => ({
  encrypt: vi.fn((text: string) => `mock-encrypted:${text}`),
  decrypt: vi.fn((_encrypted: string) => "sk-original-key-abcd"),
}));

// Mock getDb
const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockDelete = vi.fn();

vi.mock("../../db", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../../db";
import { encrypt, decrypt } from "../crypto";
import {
  setUserApiKey,
  getUserApiKeys,
  deleteUserApiKey,
  decryptUserApiKey,
} from "../userApiKeyService";

const mockGetDb = vi.mocked(getDb);

describe("userApiKeyService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupDb(overrides: Record<string, unknown> = {}) {
    const db = {
      insert: mockInsert,
      select: mockSelect,
      delete: mockDelete,
      ...overrides,
    };
    mockGetDb.mockResolvedValue(db as any);
    return db;
  }

  describe("setUserApiKey", () => {
    it("encrypts the key using crypto.ts encrypt()", async () => {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
      mockInsert.mockReturnValue({ values });
      setupDb();

      await setUserApiKey(1, null, "openai", "sk-test-key-1234");

      expect(encrypt).toHaveBeenCalledWith("sk-test-key-1234");
    });

    it("extracts the last 4 characters as keyHint", async () => {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
      mockInsert.mockReturnValue({ values });
      setupDb();

      const result = await setUserApiKey(1, null, "openai", "sk-test-key-1234");

      expect(result.keyHint).toBe("1234");
    });

    it("upserts — inserts new row when no existing key for user+provider", async () => {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
      mockInsert.mockReturnValue({ values });
      setupDb();

      await setUserApiKey(1, "tenant-1", "openai", "sk-test-key-1234");

      expect(mockInsert).toHaveBeenCalled();
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          tenantId: "tenant-1",
          provider: "openai",
          apiKeyEncrypted: "mock-encrypted:sk-test-key-1234",
          keyHint: "1234",
        }),
      );
      expect(onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({
            apiKeyEncrypted: "mock-encrypted:sk-test-key-1234",
            keyHint: "1234",
          }),
        }),
      );
    });

    it("upserts — updates existing row when key already exists for user+provider", async () => {
      // Same as above — the onConflictDoUpdate handles both cases
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
      mockInsert.mockReturnValue({ values });
      setupDb();

      await setUserApiKey(1, null, "openai", "sk-new-key-5678");

      expect(onConflictDoUpdate).toHaveBeenCalled();
    });

    it("returns { provider, keyHint } and never returns the encrypted value", async () => {
      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
      mockInsert.mockReturnValue({ values });
      setupDb();

      const result = await setUserApiKey(1, null, "anthropic", "sk-ant-abcXYZW");

      expect(result).toEqual({ provider: "anthropic", keyHint: "XYZW" });
      expect(result).not.toHaveProperty("apiKeyEncrypted");
    });

    it("throws when db is not initialized", async () => {
      mockGetDb.mockResolvedValue(null);

      await expect(
        setUserApiKey(1, null, "openai", "sk-test"),
      ).rejects.toThrow();
    });

    it("throws when apiKey is shorter than 4 characters", async () => {
      setupDb();

      await expect(
        setUserApiKey(1, null, "openai", "abc"),
      ).rejects.toThrow("API key must be at least 4 characters");
    });

    it("throws when apiKey is empty", async () => {
      setupDb();

      await expect(
        setUserApiKey(1, null, "openai", ""),
      ).rejects.toThrow("API key must be at least 4 characters");
    });
  });

  describe("getUserApiKeys", () => {
    it("returns all providers for a user with keyHint only", async () => {
      const mockRows = [
        { provider: "openai", keyHint: "1234" },
        { provider: "anthropic", keyHint: "5678" },
      ];
      const where = vi.fn().mockResolvedValue(mockRows);
      const from = vi.fn().mockReturnValue({ where });
      mockSelect.mockReturnValue({ from });
      setupDb();

      const result = await getUserApiKeys(1);

      expect(result).toEqual(mockRows);
      expect(result[0]).not.toHaveProperty("apiKeyEncrypted");
      expect(mockSelect).toHaveBeenCalled();
    });

    it("throws when db is not initialized", async () => {
      mockGetDb.mockResolvedValue(null);

      await expect(getUserApiKeys(1)).rejects.toThrow("Database not initialized");
    });

    it("returns an empty array when user has no keys", async () => {
      const where = vi.fn().mockResolvedValue([]);
      const from = vi.fn().mockReturnValue({ where });
      mockSelect.mockReturnValue({ from });
      setupDb();

      const result = await getUserApiKeys(1);

      expect(result).toEqual([]);
    });
  });

  describe("deleteUserApiKey", () => {
    it("deletes the row matching userId + provider", async () => {
      const where = vi.fn().mockResolvedValue(undefined);
      mockDelete.mockReturnValue({ where });
      setupDb();

      await deleteUserApiKey(1, "openai");

      expect(mockDelete).toHaveBeenCalled();
      expect(where).toHaveBeenCalled();
    });

    it("is a no-op (does not throw) when provider entry does not exist", async () => {
      const where = vi.fn().mockResolvedValue(undefined);
      mockDelete.mockReturnValue({ where });
      setupDb();

      await expect(deleteUserApiKey(1, "nonexistent")).resolves.toBeUndefined();
    });

    it("throws when db is not initialized", async () => {
      mockGetDb.mockResolvedValue(null);

      await expect(deleteUserApiKey(1, "openai")).rejects.toThrow("Database not initialized");
    });
  });

  describe("decryptUserApiKey", () => {
    it("returns the decrypted key for an existing entry", async () => {
      const limit = vi.fn().mockResolvedValue([{ apiKeyEncrypted: "enc-value" }]);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      mockSelect.mockReturnValue({ from });
      setupDb();

      const result = await decryptUserApiKey(1, "openai");

      expect(result).toBe("sk-original-key-abcd");
    });

    it("returns null when no entry exists for user+provider", async () => {
      const limit = vi.fn().mockResolvedValue([]);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      mockSelect.mockReturnValue({ from });
      setupDb();

      const result = await decryptUserApiKey(1, "openai");

      expect(result).toBeNull();
    });

    it("calls crypto.ts decrypt() with the stored apiKeyEncrypted value", async () => {
      const limit = vi
        .fn()
        .mockResolvedValue([{ apiKeyEncrypted: "iv:tag:cipher" }]);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      mockSelect.mockReturnValue({ from });
      setupDb();

      await decryptUserApiKey(1, "openai");

      expect(decrypt).toHaveBeenCalledWith("iv:tag:cipher");
    });

    it("returns null when decrypt returns empty string", async () => {
      vi.mocked(decrypt).mockReturnValueOnce("");
      const limit = vi
        .fn()
        .mockResolvedValue([{ apiKeyEncrypted: "bad-data" }]);
      const where = vi.fn().mockReturnValue({ limit });
      const from = vi.fn().mockReturnValue({ where });
      mockSelect.mockReturnValue({ from });
      setupDb();

      const result = await decryptUserApiKey(1, "openai");

      expect(result).toBeNull();
    });

    it("throws when db is not initialized", async () => {
      mockGetDb.mockResolvedValue(null);

      await expect(decryptUserApiKey(1, "openai")).rejects.toThrow("Database not initialized");
    });
  });
});
