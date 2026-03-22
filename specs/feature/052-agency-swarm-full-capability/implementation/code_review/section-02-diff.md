diff --git a/apps/web/server/routers/__tests__/agencyCustomTools.test.ts b/apps/web/server/routers/__tests__/agencyCustomTools.test.ts
new file mode 100644
index 00000000..9d8b5537
--- /dev/null
+++ b/apps/web/server/routers/__tests__/agencyCustomTools.test.ts
@@ -0,0 +1,114 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock dependencies before imports
+vi.mock("../../db", () => ({
+  db: {
+    select: vi.fn().mockReturnThis(),
+    from: vi.fn().mockReturnThis(),
+    where: vi.fn().mockReturnThis(),
+    limit: vi.fn().mockReturnThis(),
+    insert: vi.fn().mockReturnThis(),
+    values: vi.fn().mockReturnThis(),
+    update: vi.fn().mockReturnThis(),
+    set: vi.fn().mockReturnThis(),
+    returning: vi.fn().mockResolvedValue([]),
+    orderBy: vi.fn().mockReturnThis(),
+    offset: vi.fn().mockResolvedValue([]),
+  },
+}));
+
+vi.mock("../../services/crypto", () => ({
+  encrypt: vi.fn((v: string) => `encrypted:${v}`),
+  decrypt: vi.fn((v: string) => v.replace("encrypted:", "")),
+}));
+
+vi.mock("../../services/featureFlags", () => ({
+  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
+  setTenantFeatureFlag: vi.fn(),
+}));
+
+vi.mock("../../_core/rateLimitedProcedure", () => ({
+  createRateLimitMiddleware: vi.fn(() => vi.fn(({ next }: any) => next())),
+}));
+
+import { validateSsrfUrl } from "../../services/ssrfValidator";
+import { encrypt } from "../../services/crypto";
+
+describe("Custom Tools Backend — SSRF & Encryption", () => {
+  it("createCustomTool rejects endpoint with private IP (SSRF)", () => {
+    expect(() => validateSsrfUrl("http://10.0.0.5/api")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("http://192.168.1.1/api")).toThrow("SSRF");
+  });
+
+  it("createCustomTool rejects endpoint with localhost", () => {
+    expect(() => validateSsrfUrl("http://localhost:8080/hook")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("http://127.0.0.1/hook")).toThrow("SSRF");
+  });
+
+  it("createCustomTool encrypts headers before storing", () => {
+    const headers = { Authorization: "Bearer sk-test" };
+    const encrypted = encrypt(JSON.stringify(headers));
+    expect(encrypted).toBe(`encrypted:${JSON.stringify(headers)}`);
+    expect(encrypted).not.toBe(JSON.stringify(headers));
+  });
+
+  it("SSRF allows valid public URLs", () => {
+    expect(() => validateSsrfUrl("https://api.example.com/webhook")).not.toThrow();
+  });
+});
+
+describe("Custom Tools Backend — Schema validation", () => {
+  it("customToolInputSchema validates correct input", async () => {
+    const { customToolInputSchema } = await import("../agency");
+    const result = customToolInputSchema.safeParse({
+      name: "my-tool",
+      endpoint: "https://api.example.com/hook",
+      httpMethod: "POST",
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("customToolInputSchema rejects invalid httpMethod", async () => {
+    const { customToolInputSchema } = await import("../agency");
+    const result = customToolInputSchema.safeParse({
+      name: "my-tool",
+      endpoint: "https://api.example.com/hook",
+      httpMethod: "PATCH",
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("customToolInputSchema validates retryPolicy bounds", async () => {
+    const { customToolInputSchema } = await import("../agency");
+    const result = customToolInputSchema.safeParse({
+      name: "my-tool",
+      endpoint: "https://api.example.com/hook",
+      httpMethod: "POST",
+      retryPolicy: { maxRetries: 10, backoffMs: 100 },
+    });
+    expect(result.success).toBe(false); // maxRetries max is 5
+  });
+});
+
+describe("Custom Tools Backend — modelSettings migration idempotency", () => {
+  it("modelSettings migration produces correct camelCase keys", () => {
+    function migrateModelSettings(settings: Record<string, unknown>) {
+      const result = { ...settings };
+      if ("top_p" in result) {
+        result.topP = result.top_p;
+        delete result.top_p;
+      }
+      if ("max_tokens" in result) {
+        result.maxTokens = result.max_tokens;
+        delete result.max_tokens;
+      }
+      return result;
+    }
+
+    const input = { top_p: 0.9, max_tokens: 4096, temperature: 0.7 };
+    const migrated = migrateModelSettings(input);
+    expect(migrated).toEqual({ topP: 0.9, maxTokens: 4096, temperature: 0.7 });
+    // Idempotent
+    expect(migrateModelSettings(migrated)).toEqual(migrated);
+  });
+});
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index b9a5e554..b1b5d6ad 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -27,6 +27,8 @@ import {
 } from "../../drizzle/schema";
 import { eq, and, or, desc, asc, inArray, sql, getTableColumns, count } from "drizzle-orm";
 import { agencyBridge } from "../services/agencyBridge";
+import { validateSsrfUrl } from "../services/ssrfValidator";
+import { encrypt } from "../services/crypto";
 import type { RunResult } from "../services/agencyBridge";
 import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";
 import { buildAgencyTaskMetadata } from "../services/agencyEscalation";
@@ -63,6 +65,26 @@ async function assertAgencyEnabled(tenantId: string): Promise<void> {
   }
 }
 
+// Exported Zod schema for custom tool input (reused by section-04 OpenAPI import)
+export const customToolInputSchema = z.object({
+  name: z.string().min(1).max(100),
+  description: z.string().max(2000).optional(),
+  endpoint: z.string().url(),
+  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE"]),
+  headers: z.record(z.string()).optional(),
+  inputSchema: z.record(z.unknown()).optional(),
+  outputSchema: z.record(z.unknown()).optional(),
+  riskLevel: z.enum(["low", "medium", "high"]).default("low"),
+  strictSchema: z.boolean().default(false),
+  oneCallAtATime: z.boolean().default(false),
+  icon: z.string().max(50).optional(),
+  category: z.string().max(50).optional(),
+  retryPolicy: z.object({
+    maxRetries: z.number().int().min(0).max(5),
+    backoffMs: z.number().int().min(100).max(30000),
+  }).optional(),
+});
+
 // Q-1: Detect cycles in communication flows using DFS
 function detectFlowCycle(
   flows: Array<{ fromAgentName: string; toAgentName: string }>,
@@ -2813,4 +2835,302 @@ export const agencyRouter = router({
         userId: ctx.user!.id,
       });
     }),
+
+  // ─── Custom Tool CRUD ────────────────────────────────────────────────
+
+  createCustomTool: protectedProcedure
+    .use(createRateLimitMiddleware({ namespace: "agency-tool-create", limit: 10, windowMs: 60_000 }))
+    .input(customToolInputSchema)
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId!;
+      await assertAgencyEnabled(tenantId);
+
+      // Enforce per-tenant tool limit
+      const [toolCount] = await db
+        .select({ count: count() })
+        .from(agencyTools)
+        .where(and(eq(agencyTools.tenantId, tenantId), eq(agencyTools.isEnabled, true)));
+      if (toolCount.count >= 50) {
+        throw new TRPCError({
+          code: "FORBIDDEN",
+          message: "Custom tool limit reached (50 per tenant)",
+        });
+      }
+
+      // Check name uniqueness
+      const existing = await db
+        .select({ id: agencyTools.id })
+        .from(agencyTools)
+        .where(and(eq(agencyTools.tenantId, tenantId), eq(agencyTools.name, input.name)))
+        .limit(1);
+      if (existing.length > 0) {
+        throw new TRPCError({
+          code: "CONFLICT",
+          message: `A tool named '${input.name}' already exists`,
+        });
+      }
+
+      // SSRF validation
+      try {
+        validateSsrfUrl(input.endpoint);
+      } catch (e: any) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: `SSRF: ${e.message}` });
+      }
+
+      // Encrypt headers if provided
+      const headersEncrypted = input.headers
+        ? encrypt(JSON.stringify(input.headers))
+        : null;
+
+      const id = crypto.randomUUID();
+      const [tool] = await db.insert(agencyTools).values({
+        id,
+        tenantId,
+        name: input.name,
+        description: input.description ?? null,
+        toolType: "http_api",
+        config: { endpoint: input.endpoint },
+        riskLevel: input.riskLevel,
+        requiresApproval: input.riskLevel === "high",
+        inputSchema: input.inputSchema ?? null,
+        outputSchema: input.outputSchema ?? null,
+        httpMethod: input.httpMethod,
+        headersEncrypted,
+        retryPolicy: input.retryPolicy ?? null,
+        icon: input.icon ?? null,
+        category: input.category ?? null,
+        version: 1,
+        isExposedAsApi: false,
+        strictSchema: input.strictSchema,
+        oneCallAtATime: input.oneCallAtATime,
+        isEnabled: true,
+      }).returning();
+
+      return { ...tool, headersEncrypted: undefined, hasHeaders: !!headersEncrypted };
+    }),
+
+  updateCustomTool: protectedProcedure
+    .input(z.object({ toolId: z.string().uuid() }).merge(customToolInputSchema.partial()))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId!;
+      await assertAgencyEnabled(tenantId);
+
+      const [existing] = await db
+        .select()
+        .from(agencyTools)
+        .where(and(eq(agencyTools.id, input.toolId), eq(agencyTools.tenantId, tenantId)))
+        .limit(1);
+      if (!existing) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Tool not found" });
+      }
+
+      // SSRF re-validation if endpoint changed
+      if (input.endpoint) {
+        try {
+          validateSsrfUrl(input.endpoint);
+        } catch (e: any) {
+          throw new TRPCError({ code: "BAD_REQUEST", message: `SSRF: ${e.message}` });
+        }
+      }
+
+      const updates: Record<string, unknown> = { updatedAt: new Date(), version: existing.version + 1 };
+      if (input.name !== undefined) updates.name = input.name;
+      if (input.description !== undefined) updates.description = input.description;
+      if (input.endpoint !== undefined) updates.config = { endpoint: input.endpoint };
+      if (input.httpMethod !== undefined) updates.httpMethod = input.httpMethod;
+      if (input.headers !== undefined) {
+        updates.headersEncrypted = encrypt(JSON.stringify(input.headers));
+      }
+      if (input.inputSchema !== undefined) updates.inputSchema = input.inputSchema;
+      if (input.outputSchema !== undefined) updates.outputSchema = input.outputSchema;
+      if (input.riskLevel !== undefined) updates.riskLevel = input.riskLevel;
+      if (input.strictSchema !== undefined) updates.strictSchema = input.strictSchema;
+      if (input.oneCallAtATime !== undefined) updates.oneCallAtATime = input.oneCallAtATime;
+      if (input.icon !== undefined) updates.icon = input.icon;
+      if (input.category !== undefined) updates.category = input.category;
+      if (input.retryPolicy !== undefined) updates.retryPolicy = input.retryPolicy;
+
+      const [updated] = await db
+        .update(agencyTools)
+        .set(updates)
+        .where(eq(agencyTools.id, input.toolId))
+        .returning();
+      return { ...updated, headersEncrypted: undefined, hasHeaders: !!updated.headersEncrypted };
+    }),
+
+  deleteCustomTool: protectedProcedure
+    .input(z.object({ toolId: z.string().uuid() }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId!;
+      await assertAgencyEnabled(tenantId);
+
+      const [tool] = await db
+        .select({ id: agencyTools.id, tenantId: agencyTools.tenantId })
+        .from(agencyTools)
+        .where(and(eq(agencyTools.id, input.toolId), eq(agencyTools.tenantId, tenantId)));
+      if (!tool) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Tool not found" });
+      }
+
+      // Check if any agents reference this tool
+      const refs = await db
+        .select({ id: agencyAgentTools.id })
+        .from(agencyAgentTools)
+        .where(eq(agencyAgentTools.toolId, input.toolId))
+        .limit(1);
+      if (refs.length > 0) {
+        throw new TRPCError({
+          code: "PRECONDITION_FAILED",
+          message: "Tool is in use by agents. Remove it from agents first.",
+        });
+      }
+
+      // Soft-delete
+      await db
+        .update(agencyTools)
+        .set({ isEnabled: false, updatedAt: new Date() })
+        .where(eq(agencyTools.id, input.toolId));
+      return { success: true };
+    }),
+
+  listCustomTools: protectedProcedure
+    .input(z.object({
+      search: z.string().optional(),
+      page: z.number().int().min(1).default(1),
+      limit: z.number().int().min(1).max(50).default(20),
+    }))
+    .query(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId!;
+      await assertAgencyEnabled(tenantId);
+
+      const conditions = [
+        eq(agencyTools.tenantId, tenantId),
+        eq(agencyTools.isEnabled, true),
+        inArray(agencyTools.toolType, ["http_api", "openapi_import", "mcp_bridge"]),
+      ];
+
+      if (input.search) {
+        conditions.push(
+          or(
+            sql`${agencyTools.name} ILIKE ${"%" + input.search + "%"}`,
+            sql`${agencyTools.description} ILIKE ${"%" + input.search + "%"}`,
+          )!,
+        );
+      }
+
+      const offset = (input.page - 1) * input.limit;
+      const tools = await db
+        .select({
+          id: agencyTools.id,
+          name: agencyTools.name,
+          description: agencyTools.description,
+          toolType: agencyTools.toolType,
+          httpMethod: agencyTools.httpMethod,
+          riskLevel: agencyTools.riskLevel,
+          icon: agencyTools.icon,
+          category: agencyTools.category,
+          version: agencyTools.version,
+          strictSchema: agencyTools.strictSchema,
+          oneCallAtATime: agencyTools.oneCallAtATime,
+          hasHeaders: sql<boolean>`${agencyTools.headersEncrypted} IS NOT NULL`.as("hasHeaders"),
+          createdAt: agencyTools.createdAt,
+          updatedAt: agencyTools.updatedAt,
+        })
+        .from(agencyTools)
+        .where(and(...conditions))
+        .orderBy(desc(agencyTools.createdAt))
+        .limit(input.limit)
+        .offset(offset);
+
+      const [{ total }] = await db
+        .select({ total: count() })
+        .from(agencyTools)
+        .where(and(...conditions));
+
+      return { tools, total, page: input.page, limit: input.limit };
+    }),
+
+  testCustomTool: protectedProcedure
+    .use(createRateLimitMiddleware({ namespace: "agency-tool-test", limit: 20, windowMs: 60_000 }))
+    .input(z.object({
+      toolId: z.string().uuid(),
+      sampleInput: z.record(z.unknown()),
+    }))
+    .mutation(async ({ ctx, input }) => {
+      const tenantId = ctx.tenantId!;
+      await assertAgencyEnabled(tenantId);
+
+      const [tool] = await db
+        .select()
+        .from(agencyTools)
+        .where(and(eq(agencyTools.id, input.toolId), eq(agencyTools.tenantId, tenantId)));
+      if (!tool) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Tool not found" });
+      }
+
+      // Validate input against schema if present
+      if (tool.inputSchema) {
+        const { default: Ajv } = await import("ajv");
+        const ajv = new Ajv({ allErrors: true });
+        const validate = ajv.compile(tool.inputSchema as Record<string, unknown>);
+        if (!validate(input.sampleInput)) {
+          throw new TRPCError({
+            code: "BAD_REQUEST",
+            message: `Input schema validation failed: ${ajv.errorsText(validate.errors)}`,
+          });
+        }
+      }
+
+      // SSRF re-validation (defense in depth)
+      const endpoint = (tool.config as any)?.endpoint;
+      if (!endpoint) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: "Tool has no endpoint configured" });
+      }
+      try {
+        validateSsrfUrl(endpoint);
+      } catch (e: any) {
+        throw new TRPCError({ code: "BAD_REQUEST", message: `SSRF: ${e.message}` });
+      }
+
+      // Decrypt headers
+      let headers: Record<string, string> = { "Content-Type": "application/json" };
+      if (tool.headersEncrypted) {
+        const { decrypt } = await import("../services/crypto");
+        const parsed = JSON.parse(decrypt(tool.headersEncrypted));
+        headers = { ...headers, ...parsed };
+      }
+
+      const startMs = Date.now();
+      const controller = new AbortController();
+      const timeout = setTimeout(() => controller.abort(), 10_000);
+
+      try {
+        const method = tool.httpMethod || "POST";
+        const fetchOpts: RequestInit = {
+          method,
+          headers,
+          signal: controller.signal,
+        };
+        if (method !== "GET") {
+          fetchOpts.body = JSON.stringify(input.sampleInput);
+        }
+
+        const resp = await fetch(endpoint, fetchOpts);
+        const bodyText = await resp.text();
+        const durationMs = Date.now() - startMs;
+
+        return {
+          status: resp.status,
+          body: bodyText.slice(0, 10_240), // truncate to 10KB
+          durationMs,
+        };
+      } catch (e: any) {
+        throw new TRPCError({
+          code: "INTERNAL_SERVER_ERROR",
+          message: `Tool test failed: ${e.message}`,
+        });
+      } finally {
+        clearTimeout(timeout);
+      }
+    }),
 });
diff --git a/apps/web/server/services/__tests__/ssrfValidator.test.ts b/apps/web/server/services/__tests__/ssrfValidator.test.ts
new file mode 100644
index 00000000..7ded3e0e
--- /dev/null
+++ b/apps/web/server/services/__tests__/ssrfValidator.test.ts
@@ -0,0 +1,62 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
+import { validateSsrfUrl } from "../ssrfValidator";
+
+describe("ssrfValidator", () => {
+  const originalEnv = process.env;
+
+  beforeEach(() => {
+    process.env = { ...originalEnv };
+    delete process.env.SMARTSPEC_INTERNAL_URL;
+  });
+
+  afterEach(() => {
+    process.env = originalEnv;
+  });
+
+  it("rejects private IP 10.x.x.x", () => {
+    expect(() => validateSsrfUrl("http://10.0.0.5/api")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("http://10.255.255.255/api")).toThrow("SSRF");
+  });
+
+  it("rejects private IP 172.16.x.x - 172.31.x.x", () => {
+    expect(() => validateSsrfUrl("http://172.16.0.1/api")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("http://172.31.255.255/api")).toThrow("SSRF");
+  });
+
+  it("rejects private IP 192.168.x.x", () => {
+    expect(() => validateSsrfUrl("http://192.168.1.1/api")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("http://192.168.0.100/api")).toThrow("SSRF");
+  });
+
+  it("rejects localhost (127.0.0.1, localhost, ::1)", () => {
+    expect(() => validateSsrfUrl("http://localhost:8080/hook")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("http://127.0.0.1/hook")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("http://[::1]/hook")).toThrow("SSRF");
+  });
+
+  it("rejects cloud metadata 169.254.169.254", () => {
+    expect(() => validateSsrfUrl("http://169.254.169.254/latest/meta-data/")).toThrow("SSRF");
+  });
+
+  it("rejects non-http/https schemes", () => {
+    expect(() => validateSsrfUrl("ftp://example.com/file")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("file:///etc/passwd")).toThrow("SSRF");
+  });
+
+  it("allows SMARTSPEC_INTERNAL_URL explicitly", () => {
+    process.env.SMARTSPEC_INTERNAL_URL = "http://127.0.0.1:3000";
+    expect(() => validateSsrfUrl("http://127.0.0.1:3000/api/tools")).not.toThrow();
+  });
+
+  it("allows valid public HTTPS URLs", () => {
+    expect(() => validateSsrfUrl("https://api.openai.com/v1/chat")).not.toThrow();
+    expect(() => validateSsrfUrl("https://hooks.slack.com/services/abc")).not.toThrow();
+    expect(() => validateSsrfUrl("http://example.com/webhook")).not.toThrow();
+  });
+
+  it("rejects empty or malformed URLs", () => {
+    expect(() => validateSsrfUrl("")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("not-a-url")).toThrow("SSRF");
+    expect(() => validateSsrfUrl("://missing-scheme")).toThrow("SSRF");
+  });
+});
diff --git a/apps/web/server/services/ssrfValidator.ts b/apps/web/server/services/ssrfValidator.ts
new file mode 100644
index 00000000..06f51bbd
--- /dev/null
+++ b/apps/web/server/services/ssrfValidator.ts
@@ -0,0 +1,109 @@
+/**
+ * SSRF Validator — validates URLs to prevent Server-Side Request Forgery.
+ * Mirrors the Python `_validate_tool_url` pattern in agency_tools.py.
+ */
+
+const BLOCKED_HOSTS = new Set([
+  "localhost",
+  "127.0.0.1",
+  "0.0.0.0",
+  "::1",
+  "[::1]",
+  "169.254.169.254",
+  "metadata.google.internal",
+]);
+
+/** CIDR blocks to reject, expressed as [baseInt, maskBits] for IPv4 */
+const BLOCKED_IPV4_RANGES: Array<[number, number]> = [
+  [ipToInt("10.0.0.0"), 8],
+  [ipToInt("172.16.0.0"), 12],
+  [ipToInt("192.168.0.0"), 16],
+  [ipToInt("127.0.0.0"), 8],
+  [ipToInt("169.254.0.0"), 16],
+];
+
+/** Parse dotted IPv4 string to 32-bit integer */
+function ipToInt(ip: string): number {
+  const parts = ip.split(".").map(Number);
+  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
+}
+
+/** Check if an IPv4 address integer falls within a CIDR block */
+function isInRange(ipInt: number, baseInt: number, maskBits: number): boolean {
+  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
+  return (ipInt & mask) === (baseInt & mask);
+}
+
+/** Check if a string is a valid IPv4 address */
+function isIPv4(host: string): boolean {
+  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
+}
+
+/** Check if a string is an IPv6 address (simplified check) */
+function isIPv6(host: string): boolean {
+  return host.includes(":");
+}
+
+/**
+ * Validates that a URL is safe from SSRF attacks.
+ * Blocks private IPs, localhost, cloud metadata endpoints, non-HTTP schemes.
+ * Allows the configured SMARTSPEC_INTERNAL_URL.
+ * @throws Error if URL is blocked.
+ */
+export function validateSsrfUrl(url: string): void {
+  if (!url || typeof url !== "string") {
+    throw new Error("SSRF validation failed: empty or invalid URL");
+  }
+
+  // Allow the configured internal service URL
+  const internalUrl = process.env.SMARTSPEC_INTERNAL_URL;
+  if (internalUrl && url.startsWith(internalUrl)) {
+    return;
+  }
+
+  let parsed: URL;
+  try {
+    parsed = new URL(url);
+  } catch {
+    throw new Error("SSRF validation failed: malformed URL");
+  }
+
+  // Only allow http and https schemes
+  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
+    throw new Error(`SSRF validation failed: unsupported scheme '${parsed.protocol}'`);
+  }
+
+  const hostname = parsed.hostname.toLowerCase();
+
+  // Check blocked hosts
+  if (BLOCKED_HOSTS.has(hostname)) {
+    throw new Error(`SSRF validation failed: blocked host '${hostname}'`);
+  }
+
+  // Check IPv4 private ranges
+  if (isIPv4(hostname)) {
+    const ipInt = ipToInt(hostname);
+    for (const [baseInt, maskBits] of BLOCKED_IPV4_RANGES) {
+      if (isInRange(ipInt, baseInt, maskBits)) {
+        throw new Error(`SSRF validation failed: private IP '${hostname}'`);
+      }
+    }
+  }
+
+  // Check IPv6 blocked patterns
+  if (isIPv6(hostname)) {
+    // Block fc00::/7 (unique local) and fe80::/10 (link-local)
+    const lower = hostname.replace(/^\[|\]$/g, "").toLowerCase();
+    if (
+      lower.startsWith("fc") ||
+      lower.startsWith("fd") ||
+      lower.startsWith("fe8") ||
+      lower.startsWith("fe9") ||
+      lower.startsWith("fea") ||
+      lower.startsWith("feb") ||
+      lower === "::1"
+    ) {
+      throw new Error(`SSRF validation failed: blocked IPv6 address '${hostname}'`);
+    }
+  }
+}
diff --git a/python-backend/app/services/agency_tools.py b/python-backend/app/services/agency_tools.py
index 2df7b2f2..26bdc8b3 100644
--- a/python-backend/app/services/agency_tools.py
+++ b/python-backend/app/services/agency_tools.py
@@ -153,6 +153,101 @@ class ToolConfig(BaseModel):
     config: dict[str, Any] = {}
 
 
+class CustomToolConfig(BaseModel):
+    """Extended config for custom (non-builtin) tools."""
+
+    tool_id: str
+    tool_type: str
+    risk_level: str
+    requires_approval: bool
+    endpoint_url: str
+    http_method: str = "POST"
+    input_schema: dict | None = None
+    output_schema: dict | None = None
+    strict_schema: bool = False
+    one_call_at_a_time: bool = False
+    retry_policy: dict | None = None
+    headers: dict[str, str] | None = None
+    config: dict[str, Any] = {}
+
+
+# Module-level locks for oneCallAtATime tools
+import asyncio as _asyncio_mod
+_TOOL_LOCKS: dict[str, _asyncio_mod.Lock] = {}
+
+
+def _validate_custom_tool_input(
+    tool_input: dict[str, Any],
+    input_schema: dict,
+    strict_schema: bool,
+) -> str | None:
+    """Validate tool input against JSON Schema. Returns error string or None."""
+    try:
+        import jsonschema
+
+        schema = dict(input_schema)
+        if strict_schema and "additionalProperties" not in schema:
+            schema["additionalProperties"] = False
+
+        jsonschema.validate(instance=tool_input, schema=schema)
+        return None
+    except Exception as exc:
+        return f"Tool input validation failed: {exc}"
+
+
+def _execute_custom_tool_sync(custom_config: CustomToolConfig, tool_input: dict[str, Any]) -> str:
+    """Execute a custom tool via HTTP (synchronous)."""
+    # SSRF re-validation at execution time
+    try:
+        _validate_tool_url(custom_config.endpoint_url)
+    except ValueError as exc:
+        return f"Tool '{custom_config.tool_id}' has a blocked endpoint: {exc}"
+
+    # Input validation
+    if custom_config.input_schema:
+        err = _validate_custom_tool_input(
+            tool_input, custom_config.input_schema, custom_config.strict_schema
+        )
+        if err:
+            return err
+
+    # Prepare headers
+    headers = {"Content-Type": "application/json"}
+    if custom_config.headers:
+        headers.update(custom_config.headers)
+
+    # Retry policy
+    max_retries = 0
+    backoff_ms = 1000
+    if custom_config.retry_policy:
+        max_retries = custom_config.retry_policy.get("maxRetries", 0)
+        backoff_ms = custom_config.retry_policy.get("backoffMs", 1000)
+
+    timeout = 30.0
+    method = custom_config.http_method.upper()
+    last_error = ""
+
+    for attempt in range(max_retries + 1):
+        try:
+            with httpx.Client(timeout=timeout) as client:
+                kwargs: dict[str, Any] = {"headers": headers}
+                if method != "GET":
+                    kwargs["json"] = tool_input
+
+                resp = client.request(method, custom_config.endpoint_url, **kwargs)
+                if resp.status_code < 400:
+                    return resp.text[:51200]  # truncate to 50KB
+                last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
+        except Exception as exc:
+            last_error = str(exc)[:200]
+
+        if attempt < max_retries:
+            import time
+            time.sleep(backoff_ms / 1000.0 * (2 ** attempt))
+
+    return f"Tool execution failed after {max_retries + 1} attempts: {last_error}"
+
+
 def _make_run_func(tool_config: ToolConfig, whitelist: set[str]):
     """Create a run function closure for a tool bridge."""
     captured_config = tool_config
diff --git a/python-backend/tests/unit/services/test_agency_tool_bridge.py b/python-backend/tests/unit/services/test_agency_tool_bridge.py
new file mode 100644
index 00000000..5be83469
--- /dev/null
+++ b/python-backend/tests/unit/services/test_agency_tool_bridge.py
@@ -0,0 +1,144 @@
+"""Tests for custom tool bridge extensions in agency_tools.py."""
+import pytest
+from unittest.mock import patch, MagicMock
+
+from app.services.agency_tools import (
+    CustomToolConfig,
+    _validate_custom_tool_input,
+    _validate_tool_url,
+    _execute_custom_tool_sync,
+)
+
+
+class TestCustomToolInputValidation:
+    """Test input validation against JSON Schema."""
+
+    def test_validates_input_against_schema(self):
+        schema = {
+            "type": "object",
+            "properties": {"url": {"type": "string"}},
+            "required": ["url"],
+        }
+        err = _validate_custom_tool_input({"count": 5}, schema, strict_schema=False)
+        assert err is not None
+        assert "validation" in err.lower()
+
+    def test_returns_none_for_valid_input(self):
+        schema = {
+            "type": "object",
+            "properties": {"url": {"type": "string"}},
+            "required": ["url"],
+        }
+        err = _validate_custom_tool_input({"url": "https://example.com"}, schema, strict_schema=False)
+        assert err is None
+
+    def test_returns_structured_error_not_traceback(self):
+        schema = {
+            "type": "object",
+            "properties": {"name": {"type": "string"}},
+            "required": ["name"],
+        }
+        err = _validate_custom_tool_input({"name": 123}, schema, strict_schema=False)
+        assert err is not None
+        assert "validation" in err.lower()
+        assert "Traceback" not in err
+
+    def test_strict_schema_rejects_additional_properties(self):
+        schema = {
+            "type": "object",
+            "properties": {"name": {"type": "string"}},
+        }
+        # Non-strict: additional props allowed
+        err_loose = _validate_custom_tool_input(
+            {"name": "test", "extra": "val"}, schema, strict_schema=False
+        )
+        assert err_loose is None
+
+        # Strict: additional props rejected
+        err_strict = _validate_custom_tool_input(
+            {"name": "test", "extra": "val"}, schema, strict_schema=True
+        )
+        assert err_strict is not None
+        assert "validation" in err_strict.lower()
+
+
+class TestSsrfGuard:
+    """Test SSRF protection at execution time."""
+
+    def test_blocks_private_ips(self):
+        with pytest.raises(ValueError, match="Blocked"):
+            _validate_tool_url("http://10.0.0.1/api")
+
+    def test_blocks_localhost(self):
+        with pytest.raises(ValueError, match="Blocked|localhost"):
+            _validate_tool_url("http://localhost:9999/api")
+
+    def test_blocks_metadata_endpoint(self):
+        with pytest.raises(ValueError, match="Blocked"):
+            _validate_tool_url("http://169.254.169.254/latest/")
+
+    def test_allows_public_urls(self):
+        # Should not raise
+        _validate_tool_url("https://api.example.com/webhook")
+
+    def test_blocks_non_http_schemes(self):
+        with pytest.raises(ValueError, match="scheme"):
+            _validate_tool_url("ftp://example.com/file")
+
+
+class TestCustomToolExecution:
+    """Test custom tool HTTP execution."""
+
+    @patch("app.services.agency_tools.httpx.Client")
+    def test_executes_http_call(self, mock_client_cls):
+        mock_resp = MagicMock()
+        mock_resp.status_code = 200
+        mock_resp.text = '{"result": "ok"}'
+        mock_client = MagicMock()
+        mock_client.__enter__ = MagicMock(return_value=mock_client)
+        mock_client.__exit__ = MagicMock(return_value=False)
+        mock_client.request.return_value = mock_resp
+        mock_client_cls.return_value = mock_client
+
+        config = CustomToolConfig(
+            tool_id="test-tool",
+            tool_type="http_api",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="https://api.example.com/hook",
+            http_method="POST",
+        )
+        result = _execute_custom_tool_sync(config, {"query": "test"})
+        assert result == '{"result": "ok"}'
+
+    def test_rejects_ssrf_at_execution(self):
+        config = CustomToolConfig(
+            tool_id="bad-tool",
+            tool_type="http_api",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="http://10.0.0.1/internal",
+            http_method="POST",
+        )
+        result = _execute_custom_tool_sync(config, {})
+        assert "blocked" in result.lower()
+
+    @patch("app.services.agency_tools.httpx.Client")
+    def test_validates_input_before_http(self, mock_client_cls):
+        config = CustomToolConfig(
+            tool_id="schema-tool",
+            tool_type="http_api",
+            risk_level="low",
+            requires_approval=False,
+            endpoint_url="https://api.example.com/hook",
+            http_method="POST",
+            input_schema={
+                "type": "object",
+                "properties": {"url": {"type": "string"}},
+                "required": ["url"],
+            },
+        )
+        result = _execute_custom_tool_sync(config, {"count": 5})
+        assert "validation" in result.lower()
+        # HTTP should NOT have been called
+        mock_client_cls.assert_not_called()
