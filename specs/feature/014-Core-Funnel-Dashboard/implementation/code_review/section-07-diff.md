diff --git a/apps/web/server/routers/funnelAnalytics.rbac.test.ts b/apps/web/server/routers/funnelAnalytics.rbac.test.ts
new file mode 100644
index 0000000..d4bd818
--- /dev/null
+++ b/apps/web/server/routers/funnelAnalytics.rbac.test.ts
@@ -0,0 +1,173 @@
+import { describe, expect, it } from "vitest";
+import { appRouter } from "../routers";
+import type { TrpcContext } from "../_core/context";
+
+type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
+
+function createTestContext(userOverrides?: Partial<AuthenticatedUser>): TrpcContext {
+  const user: AuthenticatedUser = {
+    id: 1,
+    openId: "test-user",
+    email: "test@example.com",
+    name: "Test User",
+    loginMethod: "email",
+    role: "user",
+    registeredDomain: "example.com",
+    createdAt: new Date(),
+    updatedAt: new Date(),
+    lastSignedIn: new Date(),
+    ...userOverrides,
+  };
+
+  return {
+    user,
+    tenantId: "tenant-123",
+    req: {
+      protocol: "https",
+      headers: {},
+    } as TrpcContext["req"],
+    res: {} as TrpcContext["res"],
+  };
+}
+
+function createUnauthenticatedContext(): TrpcContext {
+  return {
+    user: null,
+    tenantId: null,
+    req: {
+      protocol: "https",
+      headers: {},
+    } as TrpcContext["req"],
+    res: {} as TrpcContext["res"],
+  };
+}
+
+describe("funnelAnalytics RBAC", () => {
+  const testInput = {
+    from: new Date("2026-01-01"),
+    to: new Date("2026-01-31"),
+    bucket: "day" as const,
+  };
+
+  describe("unauthorized access", () => {
+    it("rejects unauthenticated requests to summary", async () => {
+      const ctx = createUnauthenticatedContext();
+      const caller = appRouter.createCaller(ctx);
+
+      await expect(
+        caller.funnelAnalytics.summary(testInput),
+      ).rejects.toThrow("Domain admin access required");
+    });
+
+    it("rejects user role requests to summary", async () => {
+      const ctx = createTestContext({ role: "user" });
+      const caller = appRouter.createCaller(ctx);
+
+      await expect(
+        caller.funnelAnalytics.summary(testInput),
+      ).rejects.toThrow("Domain admin access required");
+    });
+
+    it("rejects unauthenticated requests to timeSeries", async () => {
+      const ctx = createUnauthenticatedContext();
+      const caller = appRouter.createCaller(ctx);
+
+      await expect(
+        caller.funnelAnalytics.timeSeries(testInput),
+      ).rejects.toThrow("Domain admin access required");
+    });
+
+    it("rejects user role requests to export", async () => {
+      const ctx = createTestContext({ role: "user" });
+      const caller = appRouter.createCaller(ctx);
+
+      await expect(
+        caller.funnelAnalytics.export({ ...testInput, format: "csv" }),
+      ).rejects.toThrow("Domain admin access required");
+    });
+
+    it("rejects user role requests to rawEvents", async () => {
+      const ctx = createTestContext({ role: "user" });
+      const caller = appRouter.createCaller(ctx);
+
+      await expect(
+        caller.funnelAnalytics.rawEvents({ ...testInput, limit: 10 }),
+      ).rejects.toThrow("Domain admin access required");
+    });
+  });
+
+  describe("authorized access", () => {
+    it("allows admin role to access summary", async () => {
+      const ctx = createTestContext({ role: "admin" });
+      const caller = appRouter.createCaller(ctx);
+
+      // Should not throw - returns empty data if no DB
+      const result = await caller.funnelAnalytics.summary(testInput);
+      expect(result).toHaveProperty("stages");
+      expect(result).toHaveProperty("rangeClamped");
+      expect(result).toHaveProperty("cached");
+    });
+
+    it("allows domain_admin role to access summary", async () => {
+      const ctx = createTestContext({ role: "domain_admin" });
+      const caller = appRouter.createCaller(ctx);
+
+      const result = await caller.funnelAnalytics.summary(testInput);
+      expect(result).toHaveProperty("stages");
+      expect(result).toHaveProperty("rangeClamped");
+      expect(result).toHaveProperty("cached");
+    });
+
+    it("allows admin role to access export", async () => {
+      const ctx = createTestContext({ role: "admin" });
+      const caller = appRouter.createCaller(ctx);
+
+      const result = await caller.funnelAnalytics.export({
+        ...testInput,
+        format: "csv",
+      });
+      expect(result).toHaveProperty("data");
+      expect(result).toHaveProperty("mimeType");
+      expect(result).toHaveProperty("filename");
+    });
+
+    it("allows domain_admin role to access rawEvents", async () => {
+      const ctx = createTestContext({ role: "domain_admin" });
+      const caller = appRouter.createCaller(ctx);
+
+      const result = await caller.funnelAnalytics.rawEvents({
+        ...testInput,
+        limit: 10,
+      });
+      expect(result).toHaveProperty("events");
+      expect(result).toHaveProperty("total");
+    });
+  });
+
+  describe("tenant scope isolation", () => {
+    it("admin role operates on tenantId without domain filter", async () => {
+      const ctx = createTestContext({
+        role: "admin",
+        registeredDomain: "example.com",
+      });
+      const caller = appRouter.createCaller(ctx);
+
+      // The scope should be tenantId-wide (no domain filter)
+      // Verification happens in the actual query - this test ensures no error
+      const result = await caller.funnelAnalytics.summary(testInput);
+      expect(result).toBeDefined();
+    });
+
+    it("domain_admin role operates with domain filter", async () => {
+      const ctx = createTestContext({
+        role: "domain_admin",
+        registeredDomain: "corp.io",
+      });
+      const caller = appRouter.createCaller(ctx);
+
+      // The scope should include domain filter
+      const result = await caller.funnelAnalytics.summary(testInput);
+      expect(result).toBeDefined();
+    });
+  });
+});
diff --git a/apps/web/server/routers/funnelAnalytics.test.ts b/apps/web/server/routers/funnelAnalytics.test.ts
index 2f7541c..14d1343 100644
--- a/apps/web/server/routers/funnelAnalytics.test.ts
+++ b/apps/web/server/routers/funnelAnalytics.test.ts
@@ -1,11 +1,14 @@
-import { describe, expect, it } from "vitest";
+import { describe, expect, it, vi, beforeEach } from "vitest";
 
 import {
   buildScopeFilter,
   clampDateRange,
   bucketToSql,
+  sanitizeEventProperties,
   MAX_RANGE_DAYS,
   STAGE_PRESETS,
+  MAX_EXPORT_ROWS,
+  DISALLOWED_PROPERTY_KEYS,
   type FunnelScope,
 } from "./funnelAnalytics";
 
@@ -134,3 +137,100 @@ describe("funnelAnalytics helpers", () => {
     });
   });
 });
+
+// ── Section 07: Security, RBAC, and Privacy Controls ──
+
+describe("funnelAnalytics security controls", () => {
+  describe("sanitizeEventProperties", () => {
+    it("removes disallowed sensitive property keys", () => {
+      const input = {
+        userId: "user123",
+        email: "user@example.com",
+        password: "secret123",
+        apiKey: "sk-xyz",
+        deviceId: "device-abc",
+        ipAddress: "192.168.1.1",
+      };
+      const result = sanitizeEventProperties(input);
+      expect(result).toHaveProperty("userId");
+      expect(result).toHaveProperty("deviceId");
+      expect(result).not.toHaveProperty("password");
+      expect(result).not.toHaveProperty("apiKey");
+      expect(result).not.toHaveProperty("email");
+      expect(result).not.toHaveProperty("ipAddress");
+    });
+
+    it("handles null and undefined properties", () => {
+      const input = { userId: "user123", email: null, custom: undefined };
+      const result = sanitizeEventProperties(input);
+      expect(result).toHaveProperty("userId");
+      expect(result).not.toHaveProperty("email");
+    });
+
+    it("returns empty object for null input", () => {
+      const result = sanitizeEventProperties(null);
+      expect(result).toEqual({});
+    });
+
+    it("preserves allowed keys from whitelist", () => {
+      const input = {
+        userId: "user123",
+        sessionId: "session-abc",
+        eventType: "click",
+        timestamp: "2026-01-01T00:00:00Z",
+        email: "user@example.com",
+      };
+      const result = sanitizeEventProperties(input);
+      expect(result).toHaveProperty("userId");
+      expect(result).toHaveProperty("sessionId");
+      expect(result).toHaveProperty("eventType");
+      expect(result).toHaveProperty("timestamp");
+      expect(result).not.toHaveProperty("email");
+    });
+  });
+
+  describe("DISALLOWED_PROPERTY_KEYS", () => {
+    it("includes common PII fields", () => {
+      expect(DISALLOWED_PROPERTY_KEYS).toContain("email");
+      expect(DISALLOWED_PROPERTY_KEYS).toContain("phone");
+      expect(DISALLOWED_PROPERTY_KEYS).toContain("ipAddress");
+      expect(DISALLOWED_PROPERTY_KEYS).toContain("ip");
+    });
+
+    it("includes credential fields", () => {
+      expect(DISALLOWED_PROPERTY_KEYS).toContain("password");
+      expect(DISALLOWED_PROPERTY_KEYS).toContain("apiKey");
+      expect(DISALLOWED_PROPERTY_KEYS).toContain("token");
+      expect(DISALLOWED_PROPERTY_KEYS).toContain("secret");
+    });
+  });
+
+  describe("MAX_EXPORT_ROWS", () => {
+    it("is defined and reasonable for export limits", () => {
+      expect(MAX_EXPORT_ROWS).toBeGreaterThan(0);
+      expect(MAX_EXPORT_ROWS).toBeLessThanOrEqual(10000);
+    });
+  });
+
+  describe("buildScopeFilter - fallback detection", () => {
+    it("indicates fallback when ctxTenantId is null and registeredDomain is used", () => {
+      const scope = buildScopeFilter({
+        role: "admin",
+        registeredDomain: "example.com",
+        ctxTenantId: null,
+      });
+      // Fallback happened: tenantId was derived from registeredDomain
+      expect(scope.tenantId).toBe("example.com");
+    });
+
+    it("indicates no fallback when ctxTenantId is provided", () => {
+      const scope = buildScopeFilter({
+        role: "admin",
+        registeredDomain: "example.com",
+        ctxTenantId: "tenant-explicit",
+      });
+      // No fallback: tenantId is the explicit ctx value
+      expect(scope.tenantId).toBe("tenant-explicit");
+    });
+  });
+});
diff --git a/apps/web/server/routers/funnelAnalytics.ts b/apps/web/server/routers/funnelAnalytics.ts
index 3abf225..b8a08b8 100644
--- a/apps/web/server/routers/funnelAnalytics.ts
+++ b/apps/web/server/routers/funnelAnalytics.ts
@@ -4,13 +4,34 @@ import { z } from "zod";
 import { router, domainAdminProcedure } from "../_core/trpc";
 import { funnelEvents } from "../../drizzle/schema";
 import { getDb } from "../db";
+import { auditLogger } from "../services/auditLogger";
 
 // ── Constants ──
 
 export const MAX_RANGE_DAYS = 90;
+export const MAX_EXPORT_ROWS = 5000;
 const CACHE_TTL = 300; // 5 minutes
 const CACHE_PREFIX = "funnel:analytics:";
 
+// Sensitive property keys to exclude from API responses and exports
+export const DISALLOWED_PROPERTY_KEYS = new Set([
+  "email",
+  "phone",
+  "phoneNumber",
+  "ipAddress",
+  "ip",
+  "password",
+  "apiKey",
+  "api_key",
+  "token",
+  "secret",
+  "accessToken",
+  "refreshToken",
+  "ssn",
+  "creditCard",
+  "cvv",
+]);
+
 export const STAGE_PRESETS = {
   acquisition: ["signup_completed", "email_verified"],
   activation: ["first_conversation", "first_llm_request"],
@@ -31,11 +52,34 @@ type Bucket = "day" | "week" | "month";
 
 // ── Shared helpers ──
 
-export function buildScopeFilter(input: {
-  role: string;
-  registeredDomain: string | null;
-  ctxTenantId: string | null;
-}): FunnelScope {
+/**
+ * Sanitize event properties by removing disallowed sensitive keys.
+ * Returns a new object with only allowed properties.
+ */
+export function sanitizeEventProperties(
+  properties: Record<string, unknown> | null | undefined,
+): Record<string, unknown> {
+  if (!properties || typeof properties !== "object") {
+    return {};
+  }
+
+  const sanitized: Record<string, unknown> = {};
+  for (const [key, value] of Object.entries(properties)) {
+    if (!DISALLOWED_PROPERTY_KEYS.has(key) && value !== undefined) {
+      sanitized[key] = value;
+    }
+  }
+  return sanitized;
+}
+
+export function buildScopeFilter(
+  input: {
+    role: string;
+    registeredDomain: string | null;
+    ctxTenantId: string | null;
+  },
+  opts?: { userId?: number | null; emitAudit?: boolean },
+): FunnelScope {
   const tenantId = input.ctxTenantId ?? input.registeredDomain;
   if (!tenantId) {
     throw new TRPCError({
@@ -43,6 +87,22 @@ export function buildScopeFilter(input: {
       message: "Unable to determine tenant scope",
     });
   }
+
+  // Emit audit log if fallback occurred
+  const didFallback = !input.ctxTenantId && input.registeredDomain;
+  if (didFallback && opts?.emitAudit) {
+    auditLogger.log({
+      eventType: "funnel_scope_fallback",
+      userId: opts.userId ?? null,
+      metadata: {
+        role: input.role,
+        fallbackSource: "registeredDomain",
+        resolvedTenantId: tenantId,
+        registeredDomain: input.registeredDomain,
+      },
+    });
+  }
+
   if (input.role === "domain_admin") {
     return { tenantId, domain: input.registeredDomain };
   }
@@ -102,14 +162,20 @@ function scopeConditions(scope: FunnelScope) {
 }
 
 function resolveScope(ctx: {
-  user: { role: string | null; registeredDomain: string | null };
+  user: { id: number; role: string | null; registeredDomain: string | null };
   tenantId: string | null;
 }) {
-  const scope = buildScopeFilter({
-    role: ctx.user.role ?? "domain_admin",
-    registeredDomain: ctx.user.registeredDomain ?? null,
-    ctxTenantId: ctx.tenantId ?? null,
-  });
+  const scope = buildScopeFilter(
+    {
+      role: ctx.user.role ?? "domain_admin",
+      registeredDomain: ctx.user.registeredDomain ?? null,
+      ctxTenantId: ctx.tenantId ?? null,
+    },
+    {
+      userId: ctx.user.id,
+      emitAudit: true,
+    },
+  );
   console.log("[FunnelAnalytics] scope resolved", {
     tenantId: scope.tenantId,
     domain: scope.domain,
@@ -346,6 +412,9 @@ export const funnelAnalyticsRouter = router({
         events: events.map((e) => ({
           ...e,
           eventTime: e.eventTime.toISOString(),
+          properties: sanitizeEventProperties(
+            e.properties as Record<string, unknown> | null,
+          ),
         })),
         total: Number(totalResult[0]?.total ?? 0),
       };
@@ -384,13 +453,31 @@ export const funnelAnalyticsRouter = router({
         .groupBy(sql`${sql.raw(bucketSqlStr)}`, funnelEvents.eventName)
         .orderBy(sql`${sql.raw(bucketSqlStr)}`);
 
-      const mapped = rows.map((r) => ({
+      // Apply export row limit
+      const limitedRows = rows.slice(0, MAX_EXPORT_ROWS);
+      const wasTruncated = rows.length > MAX_EXPORT_ROWS;
+
+      const mapped = limitedRows.map((r) => ({
         bucket: r.bucket,
         eventName: r.eventName,
         total: Number(r.total),
         uniqueUsers: Number(r.uniqueUsers),
       }));
 
+      // Audit export operation
+      auditLogger.log({
+        eventType: "funnel_export",
+        userId: ctx.user.id,
+        metadata: {
+          format: input.format,
+          rowCount: mapped.length,
+          wasTruncated,
+          dateRange: { from: range.from.toISOString(), to: range.to.toISOString() },
+          stage: input.stage ?? "all",
+          scope: { tenantId: scope.tenantId, domain: scope.domain },
+        },
+      });
+
       if (input.format === "json") {
         return {
           data: JSON.stringify(mapped, null, 2),
diff --git a/apps/web/server/services/auditLogger.ts b/apps/web/server/services/auditLogger.ts
index dba7244..429a14d 100644
--- a/apps/web/server/services/auditLogger.ts
+++ b/apps/web/server/services/auditLogger.ts
@@ -33,6 +33,8 @@ export type AuditEventType =
   | "google_drive_sync"
   | "google_drive_webhook"
   | "google_drive_edit"
+  | "funnel_scope_fallback"
+  | "funnel_export"
   | "error";
 
 export interface AuditLogEntry {
diff --git a/apps/web/vitest.config.ts b/apps/web/vitest.config.ts
index f9599d0..b3aa763 100644
--- a/apps/web/vitest.config.ts
+++ b/apps/web/vitest.config.ts
@@ -25,6 +25,11 @@ export default defineConfig({
     ],
     include: ["server/**/*.test.ts", "server/**/*.spec.ts", "client/src/**/*.test.ts", "client/src/**/*.test.tsx", "shared/**/*.test.ts"],
     setupFiles: ["client/src/test-setup.ts"],
+    env: {
+      CONTROL_PLANE_API_KEY: "test-cp.key",
+      CONTROL_PLANE_URL: "http://localhost:7070",
+      ORCHESTRATOR_URL: "http://localhost:8000",
+    },
     server: {
       deps: {
         inline: [/react/, /react-dom/, /@testing-library/],
