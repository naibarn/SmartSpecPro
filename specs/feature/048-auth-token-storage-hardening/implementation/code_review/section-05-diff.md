diff --git a/apps/web/server/services/__tests__/userApiKeyService.test.ts b/apps/web/server/services/__tests__/userApiKeyService.test.ts
new file mode 100644
index 00000000..7f37c4e7
--- /dev/null
+++ b/apps/web/server/services/__tests__/userApiKeyService.test.ts
@@ -0,0 +1,233 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock crypto.ts before importing the service
+vi.mock("../crypto", () => ({
+  encrypt: vi.fn((text: string) => `mock-encrypted:${text}`),
+  decrypt: vi.fn((_encrypted: string) => "sk-original-key-abcd"),
+}));
+
+// Mock getDb
+const mockInsert = vi.fn();
+const mockSelect = vi.fn();
+const mockDelete = vi.fn();
+
+vi.mock("../../db", () => ({
+  getDb: vi.fn(),
+}));
+
+import { getDb } from "../../db";
+import { encrypt, decrypt } from "../crypto";
+import {
+  setUserApiKey,
+  getUserApiKeys,
+  deleteUserApiKey,
+  decryptUserApiKey,
+} from "../userApiKeyService";
+
+const mockGetDb = vi.mocked(getDb);
+
+describe("userApiKeyService", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  function setupDb(overrides: Record<string, unknown> = {}) {
+    const db = {
+      insert: mockInsert,
+      select: mockSelect,
+      delete: mockDelete,
+      ...overrides,
+    };
+    mockGetDb.mockResolvedValue(db as any);
+    return db;
+  }
+
+  describe("setUserApiKey", () => {
+    it("encrypts the key using crypto.ts encrypt()", async () => {
+      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
+      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
+      mockInsert.mockReturnValue({ values });
+      setupDb();
+
+      await setUserApiKey(1, null, "openai", "sk-test-key-1234");
+
+      expect(encrypt).toHaveBeenCalledWith("sk-test-key-1234");
+    });
+
+    it("extracts the last 4 characters as keyHint", async () => {
+      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
+      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
+      mockInsert.mockReturnValue({ values });
+      setupDb();
+
+      const result = await setUserApiKey(1, null, "openai", "sk-test-key-1234");
+
+      expect(result.keyHint).toBe("1234");
+    });
+
+    it("upserts — inserts new row when no existing key for user+provider", async () => {
+      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
+      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
+      mockInsert.mockReturnValue({ values });
+      setupDb();
+
+      await setUserApiKey(1, "tenant-1", "openai", "sk-test-key-1234");
+
+      expect(mockInsert).toHaveBeenCalled();
+      expect(values).toHaveBeenCalledWith(
+        expect.objectContaining({
+          userId: 1,
+          tenantId: "tenant-1",
+          provider: "openai",
+          apiKeyEncrypted: "mock-encrypted:sk-test-key-1234",
+          keyHint: "1234",
+        }),
+      );
+      expect(onConflictDoUpdate).toHaveBeenCalledWith(
+        expect.objectContaining({
+          set: expect.objectContaining({
+            apiKeyEncrypted: "mock-encrypted:sk-test-key-1234",
+            keyHint: "1234",
+          }),
+        }),
+      );
+    });
+
+    it("upserts — updates existing row when key already exists for user+provider", async () => {
+      // Same as above — the onConflictDoUpdate handles both cases
+      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
+      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
+      mockInsert.mockReturnValue({ values });
+      setupDb();
+
+      await setUserApiKey(1, null, "openai", "sk-new-key-5678");
+
+      expect(onConflictDoUpdate).toHaveBeenCalled();
+    });
+
+    it("returns { provider, keyHint } and never returns the encrypted value", async () => {
+      const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
+      const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
+      mockInsert.mockReturnValue({ values });
+      setupDb();
+
+      const result = await setUserApiKey(1, null, "anthropic", "sk-ant-abcXYZW");
+
+      expect(result).toEqual({ provider: "anthropic", keyHint: "XYZW" });
+      expect(result).not.toHaveProperty("apiKeyEncrypted");
+    });
+
+    it("throws when db is not initialized", async () => {
+      mockGetDb.mockResolvedValue(null);
+
+      await expect(
+        setUserApiKey(1, null, "openai", "sk-test"),
+      ).rejects.toThrow();
+    });
+  });
+
+  describe("getUserApiKeys", () => {
+    it("returns all providers for a user with keyHint only", async () => {
+      const mockRows = [
+        { provider: "openai", keyHint: "1234" },
+        { provider: "anthropic", keyHint: "5678" },
+      ];
+      const where = vi.fn().mockResolvedValue(mockRows);
+      const from = vi.fn().mockReturnValue({ where });
+      mockSelect.mockReturnValue({ from });
+      setupDb();
+
+      const result = await getUserApiKeys(1);
+
+      expect(result).toEqual(mockRows);
+      expect(mockSelect).toHaveBeenCalled();
+    });
+
+    it("returns an empty array when user has no keys", async () => {
+      const where = vi.fn().mockResolvedValue([]);
+      const from = vi.fn().mockReturnValue({ where });
+      mockSelect.mockReturnValue({ from });
+      setupDb();
+
+      const result = await getUserApiKeys(1);
+
+      expect(result).toEqual([]);
+    });
+  });
+
+  describe("deleteUserApiKey", () => {
+    it("deletes the row matching userId + provider", async () => {
+      const where = vi.fn().mockResolvedValue(undefined);
+      mockDelete.mockReturnValue({ where });
+      setupDb();
+
+      await deleteUserApiKey(1, "openai");
+
+      expect(mockDelete).toHaveBeenCalled();
+      expect(where).toHaveBeenCalled();
+    });
+
+    it("is a no-op (does not throw) when provider entry does not exist", async () => {
+      const where = vi.fn().mockResolvedValue(undefined);
+      mockDelete.mockReturnValue({ where });
+      setupDb();
+
+      await expect(deleteUserApiKey(1, "nonexistent")).resolves.toBeUndefined();
+    });
+  });
+
+  describe("decryptUserApiKey", () => {
+    it("returns the decrypted key for an existing entry", async () => {
+      const limit = vi.fn().mockResolvedValue([{ apiKeyEncrypted: "enc-value" }]);
+      const where = vi.fn().mockReturnValue({ limit });
+      const from = vi.fn().mockReturnValue({ where });
+      mockSelect.mockReturnValue({ from });
+      setupDb();
+
+      const result = await decryptUserApiKey(1, "openai");
+
+      expect(result).toBe("sk-original-key-abcd");
+    });
+
+    it("returns null when no entry exists for user+provider", async () => {
+      const limit = vi.fn().mockResolvedValue([]);
+      const where = vi.fn().mockReturnValue({ limit });
+      const from = vi.fn().mockReturnValue({ where });
+      mockSelect.mockReturnValue({ from });
+      setupDb();
+
+      const result = await decryptUserApiKey(1, "openai");
+
+      expect(result).toBeNull();
+    });
+
+    it("calls crypto.ts decrypt() with the stored apiKeyEncrypted value", async () => {
+      const limit = vi
+        .fn()
+        .mockResolvedValue([{ apiKeyEncrypted: "iv:tag:cipher" }]);
+      const where = vi.fn().mockReturnValue({ limit });
+      const from = vi.fn().mockReturnValue({ where });
+      mockSelect.mockReturnValue({ from });
+      setupDb();
+
+      await decryptUserApiKey(1, "openai");
+
+      expect(decrypt).toHaveBeenCalledWith("iv:tag:cipher");
+    });
+
+    it("returns null when decrypt returns empty string", async () => {
+      vi.mocked(decrypt).mockReturnValueOnce("");
+      const limit = vi
+        .fn()
+        .mockResolvedValue([{ apiKeyEncrypted: "bad-data" }]);
+      const where = vi.fn().mockReturnValue({ limit });
+      const from = vi.fn().mockReturnValue({ where });
+      mockSelect.mockReturnValue({ from });
+      setupDb();
+
+      const result = await decryptUserApiKey(1, "openai");
+
+      expect(result).toBeNull();
+    });
+  });
+});
diff --git a/apps/web/server/services/userApiKeyService.ts b/apps/web/server/services/userApiKeyService.ts
new file mode 100644
index 00000000..c379fb3c
--- /dev/null
+++ b/apps/web/server/services/userApiKeyService.ts
@@ -0,0 +1,112 @@
+import { eq, and } from "drizzle-orm";
+import { getDb } from "../db";
+import { userLlmApiKeys } from "../../drizzle/schema";
+import { encrypt, decrypt } from "./crypto";
+
+/**
+ * Set (upsert) a user's LLM API key for a specific provider.
+ * The key is encrypted at rest using AES-256-GCM via crypto.ts.
+ */
+export async function setUserApiKey(
+  userId: number,
+  tenantId: string | null,
+  provider: string,
+  apiKey: string,
+): Promise<{ provider: string; keyHint: string }> {
+  const db = await getDb();
+  if (!db) throw new Error("Database not initialized");
+
+  const apiKeyEncrypted = encrypt(apiKey);
+  const keyHint = apiKey.slice(-4);
+
+  await db
+    .insert(userLlmApiKeys)
+    .values({
+      userId,
+      tenantId,
+      provider,
+      apiKeyEncrypted,
+      keyHint,
+    })
+    .onConflictDoUpdate({
+      target: [userLlmApiKeys.userId, userLlmApiKeys.provider],
+      set: {
+        apiKeyEncrypted,
+        keyHint,
+        updatedAt: new Date(),
+      },
+    });
+
+  return { provider, keyHint };
+}
+
+/**
+ * List all API key providers configured by a user (keyHint only, no secrets).
+ */
+export async function getUserApiKeys(
+  userId: number,
+): Promise<Array<{ provider: string; keyHint: string | null }>> {
+  const db = await getDb();
+  if (!db) throw new Error("Database not initialized");
+
+  return db
+    .select({
+      provider: userLlmApiKeys.provider,
+      keyHint: userLlmApiKeys.keyHint,
+    })
+    .from(userLlmApiKeys)
+    .where(eq(userLlmApiKeys.userId, userId));
+}
+
+/**
+ * Delete a user's API key for a specific provider.
+ * No-op if the entry does not exist.
+ */
+export async function deleteUserApiKey(
+  userId: number,
+  provider: string,
+): Promise<void> {
+  const db = await getDb();
+  if (!db) throw new Error("Database not initialized");
+
+  await db
+    .delete(userLlmApiKeys)
+    .where(
+      and(
+        eq(userLlmApiKeys.userId, userId),
+        eq(userLlmApiKeys.provider, provider),
+      ),
+    );
+}
+
+/**
+ * Decrypt and return a user's API key for a specific provider.
+ * Returns null if no key exists or decryption fails.
+ *
+ * INTERNAL ONLY — never expose via tRPC or HTTP endpoint.
+ */
+export async function decryptUserApiKey(
+  userId: number,
+  provider: string,
+): Promise<string | null> {
+  const db = await getDb();
+  if (!db) throw new Error("Database not initialized");
+
+  const rows = await db
+    .select({ apiKeyEncrypted: userLlmApiKeys.apiKeyEncrypted })
+    .from(userLlmApiKeys)
+    .where(
+      and(
+        eq(userLlmApiKeys.userId, userId),
+        eq(userLlmApiKeys.provider, provider),
+      ),
+    )
+    .limit(1);
+
+  if (rows.length === 0) return null;
+
+  const decrypted = decrypt(rows[0].apiKeyEncrypted);
+  if (!decrypted) return null;
+
+  return decrypted;
+}
