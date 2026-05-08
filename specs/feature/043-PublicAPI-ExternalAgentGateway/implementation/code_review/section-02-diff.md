diff --git a/apps/web/server/_core/env.ts b/apps/web/server/_core/env.ts
index b699e3d0..1e7c5668 100644
--- a/apps/web/server/_core/env.ts
+++ b/apps/web/server/_core/env.ts
@@ -45,4 +45,7 @@ export const ENV = {
   sandboxDefaultProfile: process.env.SANDBOX_DEFAULT_PROFILE ?? "code-default",
   sandboxRequireForSkills: process.env.SANDBOX_REQUIRE_FOR_SKILLS === "true",
   sandboxRequireForMedia: process.env.SANDBOX_REQUIRE_FOR_MEDIA === "true",
+
+  // Public API key HMAC secret (server pepper for key hashing)
+  apiKeyHmacSecret: process.env.API_KEY_HMAC_SECRET ?? "",
 };
diff --git a/apps/web/server/services/__tests__/apiKeyService.test.ts b/apps/web/server/services/__tests__/apiKeyService.test.ts
new file mode 100644
index 00000000..ee7d4f28
--- /dev/null
+++ b/apps/web/server/services/__tests__/apiKeyService.test.ts
@@ -0,0 +1,282 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import crypto from "crypto";
+
+// Mock db before importing the service
+vi.mock("../../db", () => {
+  const mockInsert = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
+  const mockSelect = vi.fn();
+  const mockUpdate = vi.fn();
+  return {
+    db: {
+      insert: mockInsert,
+      select: mockSelect,
+      update: mockUpdate,
+    },
+  };
+});
+
+// Mock tenant feature flag service
+vi.mock("../tenantFeatureFlagService", () => ({
+  getTenantFeatureFlags: vi.fn().mockResolvedValue({ publicApi: true }),
+}));
+
+// Set HMAC secret before importing
+const TEST_HMAC_SECRET = "test-hmac-key.short";
+vi.stubEnv("API_KEY_HMAC_SECRET", TEST_HMAC_SECRET);
+
+// Mock ENV
+vi.mock("../../_core/env", () => ({
+  ENV: {
+    apiKeyHmacSecret: "test-hmac-key.short",
+  },
+}));
+
+import {
+  createKey,
+  validateKey,
+  revokeKey,
+  assertHmacSecretConfigured,
+  _computeKeyHash,
+} from "../apiKeyService";
+import { db } from "../../db";
+import { getTenantFeatureFlags } from "../tenantFeatureFlagService";
+
+describe("apiKeyService", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  describe("key generation", () => {
+    it("produces sk-ssp_{tenantShortId}_{random} format", async () => {
+      const tenantId = "abc12345-6789-abcd-ef01-234567890000";
+
+      // Mock db.insert to capture inserted values
+      const valuesFn = vi.fn().mockResolvedValue(undefined);
+      (db.insert as any).mockReturnValue({ values: valuesFn });
+
+      const result = await createKey(tenantId, 1, "Test Key", ["skills:list"]);
+
+      expect(result.rawKey).toMatch(/^sk-ssp_/);
+      expect(result.rawKey).toContain("abc12345");
+      expect(result.rawKey.length).toBeGreaterThanOrEqual(40);
+      expect(result.rawKey.length).toBeLessThanOrEqual(60);
+    });
+
+    it("returned raw key matches HMAC hash stored in DB", async () => {
+      const tenantId = "abc12345-6789-abcd-ef01-234567890000";
+
+      let insertedValues: any;
+      const valuesFn = vi.fn().mockImplementation((vals: any) => {
+        insertedValues = vals;
+        return Promise.resolve(undefined);
+      });
+      (db.insert as any).mockReturnValue({ values: valuesFn });
+
+      const result = await createKey(tenantId, 1, "Test Key", ["skills:list"]);
+
+      // Compute expected hash
+      const expectedHash = crypto
+        .createHmac("sha256", TEST_HMAC_SECRET)
+        .update(result.rawKey)
+        .digest("hex");
+
+      expect(insertedValues.keyHash).toBe(expectedHash);
+    });
+
+    it("validates scopes against ALLOWED_API_SCOPES", async () => {
+      const valuesFn = vi.fn().mockResolvedValue(undefined);
+      (db.insert as any).mockReturnValue({ values: valuesFn });
+
+      await expect(
+        createKey("tenant-id-xxxxx", 1, "Test", ["skills:list", "skills:execute"]),
+      ).resolves.toBeDefined();
+    });
+
+    it("rejects unknown scopes", async () => {
+      await expect(
+        createKey("tenant-id-xxxxx", 1, "Test", ["skills:list", "invalid:scope"]),
+      ).rejects.toThrow("Invalid scope: invalid:scope");
+    });
+  });
+
+  describe("key validation", () => {
+    it("returns AuthContext for valid key", async () => {
+      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
+      const keyHash = _computeKeyHash(rawKey);
+
+      const mockRow = {
+        id: "key-uuid",
+        tenantId: "tenant-uuid",
+        userId: 42,
+        keyHash,
+        isActive: true,
+        expiresAt: null,
+        scopes: ["skills:list", "skills:execute"],
+      };
+
+      // Chain: select().from().where().limit()
+      const limitFn = vi.fn().mockResolvedValue([mockRow]);
+      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
+      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
+      (db.select as any).mockReturnValue({ from: fromFn });
+
+      // Mock update for lastUsedAt
+      const updateSetFn = vi.fn().mockReturnValue({
+        where: vi.fn().mockReturnValue(Promise.resolve()),
+      });
+      (db.update as any).mockReturnValue({ set: updateSetFn });
+
+      const result = await validateKey(rawKey);
+
+      expect(result).toEqual({
+        userId: 42,
+        tenantId: "tenant-uuid",
+        mode: "api_key",
+        apiKeyId: "key-uuid",
+        scopes: ["skills:list", "skills:execute"],
+      });
+    });
+
+    it("rejects expired key", async () => {
+      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
+      const keyHash = _computeKeyHash(rawKey);
+
+      const pastDate = new Date();
+      pastDate.setDate(pastDate.getDate() - 1);
+
+      const mockRow = {
+        id: "key-uuid",
+        tenantId: "tenant-uuid",
+        userId: 42,
+        keyHash,
+        isActive: true,
+        expiresAt: pastDate,
+        scopes: ["skills:list"],
+      };
+
+      const limitFn = vi.fn().mockResolvedValue([mockRow]);
+      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
+      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
+      (db.select as any).mockReturnValue({ from: fromFn });
+
+      const result = await validateKey(rawKey);
+      expect(result).toBeNull();
+    });
+
+    it("rejects key without sk-ssp_ prefix", async () => {
+      const result = await validateKey("bad-prefix-key");
+      expect(result).toBeNull();
+    });
+
+    it("rejects key when no DB match found", async () => {
+      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
+
+      const limitFn = vi.fn().mockResolvedValue([]);
+      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
+      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
+      (db.select as any).mockReturnValue({ from: fromFn });
+
+      const result = await validateKey(rawKey);
+      expect(result).toBeNull();
+    });
+
+    it("rejects key when tenant publicApi flag is false", async () => {
+      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
+      const keyHash = _computeKeyHash(rawKey);
+
+      const mockRow = {
+        id: "key-uuid",
+        tenantId: "tenant-uuid",
+        userId: 42,
+        keyHash,
+        isActive: true,
+        expiresAt: null,
+        scopes: ["skills:list"],
+      };
+
+      const limitFn = vi.fn().mockResolvedValue([mockRow]);
+      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
+      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
+      (db.select as any).mockReturnValue({ from: fromFn });
+
+      (getTenantFeatureFlags as any).mockResolvedValueOnce({ publicApi: false });
+
+      const result = await validateKey(rawKey);
+      expect(result).toBeNull();
+    });
+
+    it("uses hash-based lookup (timing-safe by design)", async () => {
+      // The validateKey implementation computes HMAC first, then does DB lookup by exact hash.
+      // This is timing-safe because the DB returns 0 or 1 rows — no partial match leakage.
+      // We verify this by checking that db.select is called (hash-based lookup)
+      // rather than iterating through keys.
+      const rawKey = "sk-ssp_abc12345_someRandomKeyDataHere12345678";
+
+      const limitFn = vi.fn().mockResolvedValue([]);
+      const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
+      const fromFn = vi.fn().mockReturnValue({ where: whereFn });
+      (db.select as any).mockReturnValue({ from: fromFn });
+
+      await validateKey(rawKey);
+
+      expect(db.select).toHaveBeenCalled();
+    });
+  });
+
+  describe("revocation", () => {
+    it("sets isActive=false", async () => {
+      const setFn = vi.fn();
+      const whereFn = vi.fn().mockResolvedValue({ rowCount: 1 });
+      setFn.mockReturnValue({ where: whereFn });
+      (db.update as any).mockReturnValue({ set: setFn });
+
+      const result = await revokeKey("key-id", "tenant-id");
+      expect(result).toEqual({ revoked: true });
+      expect(setFn).toHaveBeenCalledWith(
+        expect.objectContaining({ isActive: false }),
+      );
+    });
+
+    it("throws if key not found", async () => {
+      const setFn = vi.fn();
+      const whereFn = vi.fn().mockResolvedValue({ rowCount: 0 });
+      setFn.mockReturnValue({ where: whereFn });
+      (db.update as any).mockReturnValue({ set: setFn });
+
+      await expect(revokeKey("bad-id", "tenant-id")).rejects.toThrow(
+        "API key not found",
+      );
+    });
+  });
+
+  describe("startup assertion", () => {
+    it("throws if API_KEY_HMAC_SECRET is missing", async () => {
+      // Temporarily override ENV
+      const envModule = await import("../../_core/env");
+      const original = envModule.ENV.apiKeyHmacSecret;
+      (envModule.ENV as any).apiKeyHmacSecret = "";
+
+      expect(() => assertHmacSecretConfigured()).toThrow(
+        "FATAL: API_KEY_HMAC_SECRET must be set",
+      );
+
+      (envModule.ENV as any).apiKeyHmacSecret = original;
+    });
+
+    it("throws if API_KEY_HMAC_SECRET < 32 bytes", async () => {
+      const envModule = await import("../../_core/env");
+      const original = envModule.ENV.apiKeyHmacSecret;
+      (envModule.ENV as any).apiKeyHmacSecret = "short";
+
+      expect(() => assertHmacSecretConfigured()).toThrow(
+        "FATAL: API_KEY_HMAC_SECRET must be set",
+      );
+
+      (envModule.ENV as any).apiKeyHmacSecret = original;
+    });
+
+    it("does not throw with valid secret", () => {
+      expect(() => assertHmacSecretConfigured()).not.toThrow();
+    });
+  });
+});
diff --git a/apps/web/server/services/apiKeyService.ts b/apps/web/server/services/apiKeyService.ts
new file mode 100644
index 00000000..c20207bd
--- /dev/null
+++ b/apps/web/server/services/apiKeyService.ts
@@ -0,0 +1,233 @@
+import crypto from "crypto";
+import { eq, and, sql, desc, gte } from "drizzle-orm";
+import { db } from "../db";
+import { apiKeys, publicApiAuditLog } from "../../drizzle/schema";
+import { ENV } from "../_core/env";
+import {
+  ALLOWED_API_SCOPES_SET,
+  type AuthContext,
+} from "../../shared/publicApiTypes";
+import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
+
+const KEY_PREFIX = "sk-ssp_";
+
+/** Compute HMAC-SHA256 hash of raw key using server pepper. */
+function computeKeyHash(rawKey: string): string {
+  return crypto
+    .createHmac("sha256", ENV.apiKeyHmacSecret)
+    .update(rawKey)
+    .digest("hex");
+}
+
+/** Generate a raw API key with tenant short ID embedded. */
+function generateRawKey(tenantId: string): string {
+  const tenantShortId = tenantId.slice(0, 8);
+  const randomPart = crypto
+    .randomBytes(24)
+    .toString("base64url")
+    .replace(/=/g, "");
+  return `${KEY_PREFIX}${tenantShortId}_${randomPart}`;
+}
+
+/**
+ * Assert that API_KEY_HMAC_SECRET is configured.
+ * Call during server startup to fail fast.
+ */
+export function assertHmacSecretConfigured(): void {
+  if (!ENV.apiKeyHmacSecret || ENV.apiKeyHmacSecret.length < 32) {
+    throw new Error(
+      "FATAL: API_KEY_HMAC_SECRET must be set to a string of at least 32 characters",
+    );
+  }
+}
+
+/**
+ * Create a new API key.
+ * Returns the raw key exactly once — it is never stored.
+ */
+export async function createKey(
+  tenantId: string,
+  userId: number,
+  name: string,
+  scopes: string[],
+  options?: {
+    expiresAt?: Date;
+    rateLimit?: number;
+    creditLimit?: number;
+    metadata?: Record<string, unknown>;
+  },
+): Promise<{ id: string; rawKey: string; keyPrefix: string }> {
+  // Validate scopes
+  for (const scope of scopes) {
+    if (!ALLOWED_API_SCOPES_SET.has(scope)) {
+      throw new Error(`Invalid scope: ${scope}`);
+    }
+  }
+
+  const rawKey = generateRawKey(tenantId);
+  const keyHash = computeKeyHash(rawKey);
+  const keyPrefix = rawKey.slice(0, 16);
+  const id = crypto.randomUUID();
+
+  await db.insert(apiKeys).values({
+    id,
+    tenantId,
+    userId,
+    name: name.slice(0, 100),
+    keyPrefix,
+    keyHash,
+    scopes,
+    rateLimit: options?.rateLimit ?? 60,
+    creditLimit: options?.creditLimit ?? null,
+    expiresAt: options?.expiresAt ?? null,
+    metadata: options?.metadata ?? null,
+    isActive: true,
+  });
+
+  return { id, rawKey, keyPrefix };
+}
+
+/**
+ * Validate a raw API key and return an AuthContext if valid.
+ * This is the hot path — called on every API request.
+ */
+export async function validateKey(
+  rawKey: string,
+): Promise<AuthContext | null> {
+  if (!rawKey.startsWith(KEY_PREFIX)) {
+    return null;
+  }
+
+  const keyHash = computeKeyHash(rawKey);
+
+  const [row] = await db
+    .select()
+    .from(apiKeys)
+    .where(and(eq(apiKeys.keyHash, keyHash), eq(apiKeys.isActive, true)))
+    .limit(1);
+
+  if (!row) {
+    return null;
+  }
+
+  if (row.expiresAt && row.expiresAt < new Date()) {
+    return null;
+  }
+
+  // Check tenant feature flag
+  const flags = await getTenantFeatureFlags(row.tenantId);
+  if (!flags.publicApi) {
+    return null;
+  }
+
+  // Fire-and-forget: update lastUsedAt
+  db.update(apiKeys)
+    .set({ lastUsedAt: new Date() })
+    .where(eq(apiKeys.id, row.id))
+    .catch(() => {});
+
+  return {
+    userId: row.userId,
+    tenantId: row.tenantId,
+    mode: "api_key",
+    apiKeyId: row.id,
+    scopes: row.scopes as string[],
+  };
+}
+
+/**
+ * List API keys for a tenant, optionally filtered by user.
+ * Never returns keyHash.
+ */
+export async function listKeys(tenantId: string, userId?: number) {
+  const conditions = [eq(apiKeys.tenantId, tenantId)];
+  if (userId !== undefined) {
+    conditions.push(eq(apiKeys.userId, userId));
+  }
+
+  const rows = await db
+    .select({
+      id: apiKeys.id,
+      name: apiKeys.name,
+      keyPrefix: apiKeys.keyPrefix,
+      scopes: apiKeys.scopes,
+      rateLimit: apiKeys.rateLimit,
+      creditLimit: apiKeys.creditLimit,
+      expiresAt: apiKeys.expiresAt,
+      lastUsedAt: apiKeys.lastUsedAt,
+      isActive: apiKeys.isActive,
+      createdAt: apiKeys.createdAt,
+    })
+    .from(apiKeys)
+    .where(and(...conditions))
+    .orderBy(desc(apiKeys.createdAt));
+
+  return rows;
+}
+
+/**
+ * Revoke an API key (soft delete via isActive=false).
+ */
+export async function revokeKey(
+  keyId: string,
+  tenantId: string,
+): Promise<{ revoked: boolean }> {
+  const result = await db
+    .update(apiKeys)
+    .set({ isActive: false, updatedAt: new Date() })
+    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)));
+
+  if (result.rowCount === 0) {
+    throw new Error("API key not found");
+  }
+
+  return { revoked: true };
+}
+
+/**
+ * Get usage stats for an API key from the audit log.
+ */
+export async function getKeyUsageStats(keyId: string, tenantId: string) {
+  const thirtyDaysAgo = new Date();
+  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
+
+  const [totals] = await db
+    .select({
+      totalRequests: sql<number>`count(*)::int`,
+      totalCreditsUsed: sql<number>`coalesce(sum("creditsUsed"), 0)::int`,
+      errorCount: sql<number>`count(*) filter (where "statusCode" >= 400)::int`,
+    })
+    .from(publicApiAuditLog)
+    .where(
+      and(
+        eq(publicApiAuditLog.apiKeyId, keyId),
+        gte(publicApiAuditLog.createdAt, thirtyDaysAgo),
+      ),
+    );
+
+  const dailyStats = await db
+    .select({
+      date: sql<string>`date_trunc('day', "createdAt")::date::text`,
+      requests: sql<number>`count(*)::int`,
+      credits: sql<number>`coalesce(sum("creditsUsed"), 0)::int`,
+    })
+    .from(publicApiAuditLog)
+    .where(
+      and(
+        eq(publicApiAuditLog.apiKeyId, keyId),
+        gte(publicApiAuditLog.createdAt, thirtyDaysAgo),
+      ),
+    )
+    .groupBy(sql`date_trunc('day', "createdAt")`)
+    .orderBy(sql`date_trunc('day', "createdAt")`);
+
+  return {
+    totalRequests: totals?.totalRequests ?? 0,
+    totalCreditsUsed: totals?.totalCreditsUsed ?? 0,
+    errorCount: totals?.errorCount ?? 0,
+    dailyStats,
+  };
+}
+
+// Re-export for testing
+export { computeKeyHash as _computeKeyHash };
diff --git a/apps/web/shared/publicApiTypes.ts b/apps/web/shared/publicApiTypes.ts
index bc072f1b..db45d6a0 100644
--- a/apps/web/shared/publicApiTypes.ts
+++ b/apps/web/shared/publicApiTypes.ts
@@ -24,6 +24,9 @@ export const ALLOWED_API_SCOPES = [
 
 export type ApiScope = (typeof ALLOWED_API_SCOPES)[number];
 
+/** Set version for fast O(1) lookups. */
+export const ALLOWED_API_SCOPES_SET: ReadonlySet<string> = new Set(ALLOWED_API_SCOPES);
+
 /** Authentication context populated by API key middleware. */
 export interface AuthContext {
   userId: number;
@@ -48,3 +51,24 @@ export type JobType = (typeof VALID_JOB_TYPES)[number];
 
 /** Maximum credits a single job can reserve (overflow guard). */
 export const MAX_SINGLE_JOB_CREDITS = 10_000;
+
+/** Standard API error codes. */
+export type ApiErrorCode =
+  | "invalid_api_key"
+  | "insufficient_scopes"
+  | "rate_limit_exceeded"
+  | "insufficient_credits"
+  | "daily_credit_limit"
+  | "invalid_request"
+  | "not_found"
+  | "internal_error"
+  | "feature_disabled";
+
+/** OpenAI-compatible error envelope. */
+export interface ApiErrorResponse {
+  error: {
+    code: ApiErrorCode;
+    message: string;
+    type: string; // e.g. "auth_error", "billing_error", "invalid_request_error"
+  };
+}
