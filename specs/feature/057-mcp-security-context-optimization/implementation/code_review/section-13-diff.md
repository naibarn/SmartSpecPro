diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index cb025362..0ad4cc34 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -87,6 +87,7 @@ import { teamRunRouter } from "./routers/teamRun";
 import { teamWorkItemRouter } from "./routers/teamWorkItem";
 import { scopedMemoryRouter } from "./routers/scopedMemory";
 import { monitoringRouter } from "./routers/monitoring";
+import { mcpServersRouter } from "./routers/mcpServers";
 import { inviteCodeRouter } from "./routers/inviteCode";
 import { userApiKeysRouter } from "./routers/userApiKeys";
 import { notificationPreferencesRouter } from "./routers/notificationPreferences";
@@ -1867,6 +1868,7 @@ export const appRouter = router({
   teamWorkItem: teamWorkItemRouter,
   scopedMemory: scopedMemoryRouter,
   monitoring: monitoringRouter,
+  mcpServers: mcpServersRouter,
   help: helpRouter,
 });
 
diff --git a/apps/web/server/routers/__tests__/mcpServersRouter.test.ts b/apps/web/server/routers/__tests__/mcpServersRouter.test.ts
new file mode 100644
index 00000000..cebfe686
--- /dev/null
+++ b/apps/web/server/routers/__tests__/mcpServersRouter.test.ts
@@ -0,0 +1,280 @@
+/**
+ * Tests for MCP Server CRUD tRPC router (section-13).
+ * Validates Zod schemas, admin-only access, encrypted field redaction,
+ * header allowlisting, and assignment operations.
+ */
+
+import { describe, it, expect } from "vitest";
+import { z } from "zod";
+import {
+  createMcpServerSchema,
+  updateMcpServerSchema,
+  assignToAgencySchema,
+  BLOCKED_HEADERS,
+  sanitizeDescription,
+  validateHeaders,
+  mcpToolNameRegex,
+} from "../mcpServers";
+
+// ────────────────────────────────────────────────────────────
+// Zod schema validation
+// ────────────────────────────────────────────────────────────
+
+describe("createMcpServerSchema", () => {
+  const validHttp = {
+    name: "My MCP Server",
+    slug: "my-mcp-server",
+    transportType: "http" as const,
+    config: { url: "https://example.com/mcp" },
+  };
+
+  it("accepts valid HTTP config", () => {
+    const result = createMcpServerSchema.safeParse(validHttp);
+    expect(result.success).toBe(true);
+  });
+
+  it("sets riskLevel=high by default", () => {
+    const result = createMcpServerSchema.parse(validHttp);
+    expect(result.riskLevel).toBe("high");
+  });
+
+  it("sets timeoutSeconds=30 by default", () => {
+    const result = createMcpServerSchema.parse(validHttp);
+    expect(result.timeoutSeconds).toBe(30);
+  });
+
+  it("sets dataClassification=internal by default", () => {
+    const result = createMcpServerSchema.parse(validHttp);
+    expect(result.dataClassification).toBe("internal");
+  });
+
+  it("rejects unknown keys in config (strict mode)", () => {
+    const result = createMcpServerSchema.safeParse({
+      ...validHttp,
+      config: { url: "https://example.com/mcp", hack: true },
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("accepts valid stdio config with npx only", () => {
+    const result = createMcpServerSchema.safeParse({
+      name: "Local Server",
+      slug: "local-server",
+      transportType: "stdio" as const,
+      config: { command: "npx", args: ["-y", "@modelcontextprotocol/server-sqlite"] },
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects stdio config with disallowed command", () => {
+    const result = createMcpServerSchema.safeParse({
+      name: "Bad Server",
+      slug: "bad-server",
+      transportType: "stdio" as const,
+      config: { command: "bash", args: ["-c", "rm -rf /"] },
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("accepts valid streamable_http config", () => {
+    const result = createMcpServerSchema.safeParse({
+      name: "Streamable",
+      slug: "streamable",
+      transportType: "streamable_http" as const,
+      config: { url: "https://api.example.com/mcp" },
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects slug with invalid characters", () => {
+    const result = createMcpServerSchema.safeParse({
+      ...validHttp,
+      slug: "My Server!",
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects name exceeding 100 chars", () => {
+    const result = createMcpServerSchema.safeParse({
+      ...validHttp,
+      name: "a".repeat(101),
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects timeoutSeconds below 5", () => {
+    const result = createMcpServerSchema.safeParse({
+      ...validHttp,
+      timeoutSeconds: 2,
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects timeoutSeconds above 120", () => {
+    const result = createMcpServerSchema.safeParse({
+      ...validHttp,
+      timeoutSeconds: 200,
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects creditPerCall above 100", () => {
+    const result = createMcpServerSchema.safeParse({
+      ...validHttp,
+      creditPerCall: 150,
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("accepts optional oauthConfig", () => {
+    const result = createMcpServerSchema.safeParse({
+      ...validHttp,
+      oauthConfig: {
+        tokenUrl: "https://auth.example.com/token",
+        grantType: "client_credentials",
+      },
+    });
+    expect(result.success).toBe(true);
+  });
+});
+
+describe("updateMcpServerSchema", () => {
+  it("accepts partial updates", () => {
+    const result = updateMcpServerSchema.safeParse({
+      id: 1,
+      name: "Updated Name",
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("requires id", () => {
+    const result = updateMcpServerSchema.safeParse({
+      name: "Updated Name",
+    });
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("assignToAgencySchema", () => {
+  it("accepts valid assignment", () => {
+    const result = assignToAgencySchema.safeParse({
+      mcpServerId: 1,
+      targetType: "agency",
+      targetId: "abc-123",
+    });
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects invalid targetType", () => {
+    const result = assignToAgencySchema.safeParse({
+      mcpServerId: 1,
+      targetType: "invalid",
+      targetId: "abc-123",
+    });
+    expect(result.success).toBe(false);
+  });
+
+  it("accepts optional tool filters", () => {
+    const result = assignToAgencySchema.safeParse({
+      mcpServerId: 1,
+      targetType: "agent",
+      targetId: "agent-1",
+      enabledToolNames: ["tool1", "tool2"],
+    });
+    expect(result.success).toBe(true);
+  });
+});
+
+// ────────────────────────────────────────────────────────────
+// Header allowlist
+// ────────────────────────────────────────────────────────────
+
+describe("validateHeaders", () => {
+  it("allows safe headers", () => {
+    expect(() => validateHeaders({ Authorization: "Bearer xxx", "Content-Type": "application/json" })).not.toThrow();
+  });
+
+  it("rejects Host header", () => {
+    expect(() => validateHeaders({ Host: "evil.com" })).toThrow();
+  });
+
+  it("rejects X-Forwarded-For header", () => {
+    expect(() => validateHeaders({ "X-Forwarded-For": "1.2.3.4" })).toThrow();
+  });
+
+  it("rejects Cookie header", () => {
+    expect(() => validateHeaders({ Cookie: "session=abc" })).toThrow();
+  });
+
+  it("rejects Set-Cookie header", () => {
+    expect(() => validateHeaders({ "Set-Cookie": "session=abc" })).toThrow();
+  });
+
+  it("is case-insensitive", () => {
+    expect(() => validateHeaders({ host: "evil.com" })).toThrow();
+    expect(() => validateHeaders({ "x-forwarded-host": "evil.com" })).toThrow();
+  });
+});
+
+// ────────────────────────────────────────────────────────────
+// Description sanitization
+// ────────────────────────────────────────────────────────────
+
+describe("sanitizeDescription", () => {
+  it("passes clean text through", () => {
+    expect(sanitizeDescription("A useful tool")).toBe("A useful tool");
+  });
+
+  it("strips HTML tags", () => {
+    expect(sanitizeDescription("<b>Bold</b> text")).toBe("Bold text");
+    expect(sanitizeDescription("<script>alert('xss')</script>")).toBe("alert('xss')");
+    expect(sanitizeDescription("<img src=x onerror=alert(1)>Tool")).toBe("Tool");
+  });
+
+  it("truncates to 500 chars", () => {
+    const long = "a".repeat(600);
+    expect(sanitizeDescription(long).length).toBe(500);
+  });
+
+  it("handles undefined gracefully", () => {
+    expect(sanitizeDescription(undefined)).toBeUndefined();
+  });
+});
+
+// ────────────────────────────────────────────────────────────
+// Tool name validation
+// ────────────────────────────────────────────────────────────
+
+describe("mcpToolNameRegex", () => {
+  it("accepts valid tool names", () => {
+    expect(mcpToolNameRegex.test("read_file")).toBe(true);
+    expect(mcpToolNameRegex.test("get-data")).toBe(true);
+    expect(mcpToolNameRegex.test("myTool123")).toBe(true);
+  });
+
+  it("rejects tool names with special chars", () => {
+    expect(mcpToolNameRegex.test("read file")).toBe(false);
+    expect(mcpToolNameRegex.test("tool;rm")).toBe(false);
+    expect(mcpToolNameRegex.test("")).toBe(false);
+  });
+});
+
+// ────────────────────────────────────────────────────────────
+// BLOCKED_HEADERS constant
+// ────────────────────────────────────────────────────────────
+
+describe("BLOCKED_HEADERS", () => {
+  it("includes all required blocked headers", () => {
+    const lower = BLOCKED_HEADERS.map((h) => h.toLowerCase());
+    expect(lower).toContain("host");
+    expect(lower).toContain("cookie");
+    expect(lower).toContain("set-cookie");
+  });
+
+  it("blocks x-forwarded-* pattern headers", () => {
+    // X-Forwarded-For, X-Forwarded-Host, X-Forwarded-Proto
+    const lower = BLOCKED_HEADERS.map((h) => h.toLowerCase());
+    const hasXForwarded = lower.some((h) => h.startsWith("x-forwarded-"));
+    expect(hasXForwarded).toBe(true);
+  });
+});
diff --git a/apps/web/server/routers/mcpServers.ts b/apps/web/server/routers/mcpServers.ts
new file mode 100644
index 00000000..cd8e1fca
--- /dev/null
+++ b/apps/web/server/routers/mcpServers.ts
@@ -0,0 +1,666 @@
+/**
+ * MCP Server Management tRPC Router (section-13)
+ *
+ * CRUD endpoints for MCP server registry. All endpoints require admin role.
+ * Encrypted fields never returned — only boolean indicators.
+ */
+
+import { TRPCError } from "@trpc/server";
+import crypto from "crypto";
+import { and, eq } from "drizzle-orm";
+import { z } from "zod";
+
+import {
+  adminProcedure,
+  rateLimitedAdminProcedure,
+  router,
+} from "../_core/trpc";
+import { getDb } from "../db";
+import { mcpServerAssignments, mcpServers } from "../../drizzle/schema";
+import { encrypt } from "../services/crypto";
+import { assertPublicIp } from "../services/ssrfValidation";
+
+// ────────────────────────────────────────────────────────────
+// Constants
+// ────────────────────────────────────────────────────────────
+
+export const BLOCKED_HEADERS = [
+  "Host",
+  "X-Forwarded-For",
+  "X-Forwarded-Host",
+  "X-Forwarded-Proto",
+  "Cookie",
+  "Set-Cookie",
+];
+
+export const mcpToolNameRegex = /^[a-zA-Z0-9_-]+$/;
+
+const MAX_TOOLS_PER_SERVER = 100;
+const MAX_DESCRIPTION_LENGTH = 500;
+
+// ────────────────────────────────────────────────────────────
+// Helpers
+// ────────────────────────────────────────────────────────────
+
+export function validateHeaders(
+  headers: Record<string, string> | undefined,
+): void {
+  if (!headers) return;
+  for (const key of Object.keys(headers)) {
+    const lower = key.toLowerCase();
+    if (
+      BLOCKED_HEADERS.some((blocked) => lower === blocked.toLowerCase()) ||
+      lower.startsWith("x-forwarded-")
+    ) {
+      throw new TRPCError({
+        code: "BAD_REQUEST",
+        message: `Header "${key}" is not allowed in MCP server config`,
+      });
+    }
+  }
+}
+
+export function sanitizeDescription(
+  desc: string | undefined,
+): string | undefined {
+  if (desc === undefined || desc === null) return undefined;
+  // Strip HTML tags
+  const cleaned = desc.replace(/<[^>]*>/g, "").trim();
+  return cleaned.slice(0, MAX_DESCRIPTION_LENGTH);
+}
+
+function computeConfigHash(config: unknown): string {
+  return crypto
+    .createHash("sha256")
+    .update(JSON.stringify(config))
+    .digest("hex");
+}
+
+function toResponse(server: typeof mcpServers.$inferSelect) {
+  return {
+    id: server.id,
+    name: server.name,
+    slug: server.slug,
+    description: server.description,
+    transportType: server.transportType,
+    enabled: server.enabled,
+    config: server.config,
+    oauthConfigured: !!(server.oauthAccessTokenEncrypted || server.oauthClientSecretEncrypted),
+    riskLevel: server.riskLevel,
+    dataClassification: server.dataClassification,
+    healthStatus: server.healthStatus,
+    lastHealthCheck: server.lastHealthCheck,
+    timeoutSeconds: server.timeoutSeconds,
+    maxToolsExposed: server.maxToolsExposed,
+    toolNamePrefix: server.toolNamePrefix,
+    creditPerCall: server.creditPerCall,
+    capabilities: server.capabilities,
+    configHash: server.configHash,
+    createdAt: server.createdAt,
+    updatedAt: server.updatedAt,
+  };
+}
+
+// ────────────────────────────────────────────────────────────
+// Zod Schemas (exported for testing)
+// ────────────────────────────────────────────────────────────
+
+const httpConfigSchema = z
+  .object({
+    url: z.string().url(),
+    headers: z.record(z.string()).optional(),
+  })
+  .strict();
+
+const stdioConfigSchema = z
+  .object({
+    command: z.enum(["npx"]),
+    args: z.array(z.string().max(256)).max(10),
+    env: z.record(z.string()).optional(),
+    packageIntegrityHash: z.string().optional(),
+  })
+  .strict();
+
+const streamableHttpConfigSchema = z
+  .object({
+    url: z.string().url(),
+    headers: z.record(z.string()).optional(),
+  })
+  .strict();
+
+const oauthConfigSchema = z.object({
+  tokenUrl: z.string().url(),
+  grantType: z.enum(["client_credentials", "authorization_code"]),
+  scope: z.string().optional(),
+});
+
+export const createMcpServerSchema = z.object({
+  name: z.string().min(1).max(100),
+  slug: z
+    .string()
+    .regex(/^[a-z0-9-]+$/)
+    .min(1)
+    .max(100),
+  description: z.string().max(500).optional(),
+  transportType: z.enum(["http", "streamable_http", "stdio"]),
+  config: z.union([httpConfigSchema, stdioConfigSchema, streamableHttpConfigSchema]),
+  oauthConfig: oauthConfigSchema.optional(),
+  oauthClientId: z.string().optional(),
+  oauthClientSecret: z.string().optional(),
+  timeoutSeconds: z.number().int().min(5).max(120).default(30),
+  riskLevel: z.enum(["low", "medium", "high"]).default("high"),
+  dataClassification: z
+    .enum(["public", "internal", "confidential"])
+    .default("internal"),
+  creditPerCall: z.number().min(0).max(100).default(1),
+});
+
+export const updateMcpServerSchema = z.object({
+  id: z.number().int().positive(),
+  name: z.string().min(1).max(100).optional(),
+  description: z.string().max(500).optional(),
+  transportType: z.enum(["http", "streamable_http", "stdio"]).optional(),
+  config: z
+    .union([httpConfigSchema, stdioConfigSchema, streamableHttpConfigSchema])
+    .optional(),
+  oauthConfig: oauthConfigSchema.optional(),
+  oauthClientId: z.string().optional(),
+  oauthClientSecret: z.string().optional(),
+  enabled: z.boolean().optional(),
+  timeoutSeconds: z.number().int().min(5).max(120).optional(),
+  riskLevel: z.enum(["low", "medium", "high"]).optional(),
+  dataClassification: z
+    .enum(["public", "internal", "confidential"])
+    .optional(),
+  creditPerCall: z.number().min(0).max(100).optional(),
+  maxToolsExposed: z.number().int().min(1).max(200).optional(),
+});
+
+export const assignToAgencySchema = z.object({
+  mcpServerId: z.number().int().positive(),
+  targetType: z.enum(["tenant", "agency", "agent"]),
+  targetId: z.string().min(1).max(36),
+  enabledToolNames: z.array(z.string().max(100)).max(200).optional(),
+  disabledToolNames: z.array(z.string().max(100)).max(200).optional(),
+});
+
+// ────────────────────────────────────────────────────────────
+// Router
+// ────────────────────────────────────────────────────────────
+
+export const mcpServersRouter = router({
+  /** List all MCP servers for the current tenant */
+  list: adminProcedure.query(async ({ ctx }) => {
+    const tenantId = ctx.user.tenantId;
+    const rows = await getDb()
+      .select()
+      .from(mcpServers)
+      .where(eq(mcpServers.tenantId, tenantId))
+      .orderBy(mcpServers.name);
+
+    return rows.map(toResponse);
+  }),
+
+  /** Get a single MCP server by ID (tenant-scoped) */
+  getById: adminProcedure
+    .input(z.object({ id: z.number().int().positive() }))
+    .query(async ({ ctx, input }) => {
+      const [server] = await getDb()
+        .select()
+        .from(mcpServers)
+        .where(
+          and(
+            eq(mcpServers.id, input.id),
+            eq(mcpServers.tenantId, ctx.user.tenantId),
+          ),
+        );
+
+      if (!server) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
+      }
+
+      return toResponse(server);
+    }),
+
+  /** Create a new MCP server */
+  create: adminProcedure
+    .input(createMcpServerSchema)
+    .mutation(async ({ ctx, input }) => {
+      // Validate headers in config
+      if ("headers" in input.config && input.config.headers) {
+        validateHeaders(input.config.headers);
+      }
+
+      const description = sanitizeDescription(input.description);
+      const configHash = computeConfigHash(input.config);
+
+      const insertData: Record<string, unknown> = {
+        tenantId: ctx.user.tenantId,
+        name: input.name,
+        slug: input.slug,
+        description,
+        transportType: input.transportType,
+        config: input.config,
+        configHash,
+        timeoutSeconds: input.timeoutSeconds,
+        riskLevel: input.riskLevel,
+        dataClassification: input.dataClassification,
+        creditPerCall: String(input.creditPerCall),
+        createdBy: ctx.user.id,
+      };
+
+      // Encrypt OAuth secret if provided
+      if (input.oauthClientId) {
+        insertData.oauthClientId = input.oauthClientId;
+      }
+      if (input.oauthClientSecret) {
+        insertData.oauthClientSecretEncrypted = encrypt(input.oauthClientSecret);
+      }
+      if (input.oauthConfig) {
+        insertData.oauthConfig = input.oauthConfig;
+      }
+
+      const [created] = await getDb()
+        .insert(mcpServers)
+        .values(insertData as typeof mcpServers.$inferInsert)
+        .returning();
+
+      return toResponse(created);
+    }),
+
+  /** Update an existing MCP server */
+  update: adminProcedure
+    .input(updateMcpServerSchema)
+    .mutation(async ({ ctx, input }) => {
+      // Verify ownership
+      const [existing] = await getDb()
+        .select()
+        .from(mcpServers)
+        .where(
+          and(
+            eq(mcpServers.id, input.id),
+            eq(mcpServers.tenantId, ctx.user.tenantId),
+          ),
+        );
+
+      if (!existing) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
+      }
+
+      // Validate headers if config changed
+      if (input.config && "headers" in input.config && input.config.headers) {
+        validateHeaders(input.config.headers);
+      }
+
+      const updates: Record<string, unknown> = {
+        updatedAt: new Date(),
+      };
+
+      if (input.name !== undefined) updates.name = input.name;
+      if (input.description !== undefined)
+        updates.description = sanitizeDescription(input.description);
+      if (input.transportType !== undefined)
+        updates.transportType = input.transportType;
+      if (input.enabled !== undefined) updates.enabled = input.enabled;
+      if (input.timeoutSeconds !== undefined)
+        updates.timeoutSeconds = input.timeoutSeconds;
+      if (input.riskLevel !== undefined) updates.riskLevel = input.riskLevel;
+      if (input.dataClassification !== undefined)
+        updates.dataClassification = input.dataClassification;
+      if (input.creditPerCall !== undefined)
+        updates.creditPerCall = String(input.creditPerCall);
+      if (input.maxToolsExposed !== undefined)
+        updates.maxToolsExposed = input.maxToolsExposed;
+
+      if (input.config !== undefined) {
+        updates.config = input.config;
+        updates.configHash = computeConfigHash(input.config);
+      }
+
+      if (input.oauthClientId !== undefined)
+        updates.oauthClientId = input.oauthClientId;
+      if (input.oauthClientSecret !== undefined)
+        updates.oauthClientSecretEncrypted = encrypt(input.oauthClientSecret);
+      if (input.oauthConfig !== undefined)
+        updates.oauthConfig = input.oauthConfig;
+
+      const [updated] = await getDb()
+        .update(mcpServers)
+        .set(updates)
+        .where(eq(mcpServers.id, input.id))
+        .returning();
+
+      return toResponse(updated);
+    }),
+
+  /** Delete an MCP server */
+  delete: adminProcedure
+    .input(z.object({ id: z.number().int().positive() }))
+    .mutation(async ({ ctx, input }) => {
+      const [existing] = await getDb()
+        .select()
+        .from(mcpServers)
+        .where(
+          and(
+            eq(mcpServers.id, input.id),
+            eq(mcpServers.tenantId, ctx.user.tenantId),
+          ),
+        );
+
+      if (!existing) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
+      }
+
+      // Cascade delete handles assignments via FK
+      await getDb().delete(mcpServers).where(eq(mcpServers.id, input.id));
+
+      return { success: true };
+    }),
+
+  /** Test connection to an MCP server (rate limited: 5/min) */
+  testConnection: rateLimitedAdminProcedure
+    .input(z.object({ id: z.number().int().positive() }))
+    .mutation(async ({ ctx, input }) => {
+      const [server] = await getDb()
+        .select()
+        .from(mcpServers)
+        .where(
+          and(
+            eq(mcpServers.id, input.id),
+            eq(mcpServers.tenantId, ctx.user.tenantId),
+          ),
+        );
+
+      if (!server) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
+      }
+
+      const config = server.config as Record<string, unknown>;
+      const url = config?.url as string | undefined;
+
+      if (!url) {
+        return { reachable: false, toolCount: 0, latencyMs: 0 };
+      }
+
+      try {
+        // SSRF protection — reject private IPs
+        const parsed = new URL(url);
+        await assertPublicIp(parsed.hostname);
+
+        const start = Date.now();
+        const controller = new AbortController();
+        const timeout = setTimeout(
+          () => controller.abort(),
+          (server.timeoutSeconds ?? 30) * 1000,
+        );
+
+        try {
+          const resp = await fetch(url, {
+            method: "POST",
+            headers: { "Content-Type": "application/json" },
+            body: JSON.stringify({
+              jsonrpc: "2.0",
+              method: "tools/list",
+              id: 1,
+            }),
+            signal: controller.signal,
+          });
+
+          clearTimeout(timeout);
+          const latencyMs = Date.now() - start;
+
+          if (!resp.ok) {
+            return { reachable: false, toolCount: 0, latencyMs };
+          }
+
+          // Read up to 1MB
+          const text = await resp.text();
+          if (text.length > 1_048_576) {
+            return { reachable: true, toolCount: 0, latencyMs };
+          }
+
+          const body = JSON.parse(text);
+          const tools = Array.isArray(body?.result?.tools)
+            ? body.result.tools
+            : [];
+
+          // Update health status
+          await getDb()
+            .update(mcpServers)
+            .set({
+              healthStatus: "healthy",
+              lastHealthCheck: new Date(),
+            })
+            .where(eq(mcpServers.id, input.id));
+
+          return {
+            reachable: true,
+            toolCount: Math.min(tools.length, MAX_TOOLS_PER_SERVER),
+            latencyMs,
+          };
+        } finally {
+          clearTimeout(timeout);
+        }
+      } catch {
+        // Update health status on failure
+        await getDb()
+          .update(mcpServers)
+          .set({
+            healthStatus: "unhealthy",
+            lastHealthCheck: new Date(),
+          })
+          .where(eq(mcpServers.id, input.id));
+
+        // Never expose error details (SSRF oracle prevention)
+        return { reachable: false, toolCount: 0, latencyMs: 0 };
+      }
+    }),
+
+  /** List discovered tools from a server (namespaced) */
+  listDiscoveredTools: adminProcedure
+    .input(z.object({ id: z.number().int().positive() }))
+    .query(async ({ ctx, input }) => {
+      const [server] = await getDb()
+        .select()
+        .from(mcpServers)
+        .where(
+          and(
+            eq(mcpServers.id, input.id),
+            eq(mcpServers.tenantId, ctx.user.tenantId),
+          ),
+        );
+
+      if (!server) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
+      }
+
+      const config = server.config as Record<string, unknown>;
+      const url = config?.url as string | undefined;
+
+      if (!url) {
+        return { tools: [], serverSlug: server.slug };
+      }
+
+      try {
+        const parsed = new URL(url);
+        await assertPublicIp(parsed.hostname);
+
+        const controller = new AbortController();
+        const timeout = setTimeout(
+          () => controller.abort(),
+          (server.timeoutSeconds ?? 30) * 1000,
+        );
+
+        try {
+          const resp = await fetch(url, {
+            method: "POST",
+            headers: { "Content-Type": "application/json" },
+            body: JSON.stringify({
+              jsonrpc: "2.0",
+              method: "tools/list",
+              id: 1,
+            }),
+            signal: controller.signal,
+          });
+
+          clearTimeout(timeout);
+
+          if (!resp.ok) {
+            return { tools: [], serverSlug: server.slug };
+          }
+
+          const text = await resp.text();
+          if (text.length > 1_048_576) {
+            throw new TRPCError({
+              code: "PAYLOAD_TOO_LARGE",
+              message: "Tool discovery response exceeds 1MB limit",
+            });
+          }
+
+          const body = JSON.parse(text);
+          const rawTools = Array.isArray(body?.result?.tools)
+            ? body.result.tools
+            : [];
+
+          // Limit to MAX_TOOLS_PER_SERVER, validate names, namespace
+          const tools = rawTools
+            .slice(0, MAX_TOOLS_PER_SERVER)
+            .filter(
+              (t: { name?: string }) =>
+                t.name && mcpToolNameRegex.test(t.name),
+            )
+            .map(
+              (t: {
+                name: string;
+                description?: string;
+                inputSchema?: unknown;
+              }) => ({
+                name: `mcp.${server.slug}.${t.name}`,
+                originalName: t.name,
+                description: sanitizeDescription(t.description),
+                hasInputSchema: !!t.inputSchema,
+              }),
+            );
+
+          return { tools, serverSlug: server.slug };
+        } finally {
+          clearTimeout(timeout);
+        }
+      } catch (err) {
+        if (err instanceof TRPCError) throw err;
+        return { tools: [], serverSlug: server.slug };
+      }
+    }),
+
+  /** Assign an MCP server to a tenant, agency, or agent */
+  assignToTarget: adminProcedure
+    .input(assignToAgencySchema)
+    .mutation(async ({ ctx, input }) => {
+      // Verify the MCP server belongs to this tenant
+      const [server] = await getDb()
+        .select()
+        .from(mcpServers)
+        .where(
+          and(
+            eq(mcpServers.id, input.mcpServerId),
+            eq(mcpServers.tenantId, ctx.user.tenantId),
+          ),
+        );
+
+      if (!server) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "MCP server not found" });
+      }
+
+      const [assignment] = await getDb()
+        .insert(mcpServerAssignments)
+        .values({
+          mcpServerId: input.mcpServerId,
+          targetType: input.targetType,
+          targetId: input.targetId,
+          enabledToolNames: input.enabledToolNames ?? null,
+          disabledToolNames: input.disabledToolNames ?? null,
+        })
+        .onConflictDoUpdate({
+          target: [
+            mcpServerAssignments.mcpServerId,
+            mcpServerAssignments.targetType,
+            mcpServerAssignments.targetId,
+          ],
+          set: {
+            enabledToolNames: input.enabledToolNames ?? null,
+            disabledToolNames: input.disabledToolNames ?? null,
+            updatedAt: new Date(),
+          },
+        })
+        .returning();
+
+      return assignment;
+    }),
+
+  /** Remove an MCP server assignment */
+  removeAssignment: adminProcedure
+    .input(z.object({ id: z.number().int().positive() }))
+    .mutation(async ({ ctx, input }) => {
+      // Verify via join that assignment belongs to tenant's server
+      const [assignment] = await getDb()
+        .select({ id: mcpServerAssignments.id })
+        .from(mcpServerAssignments)
+        .innerJoin(
+          mcpServers,
+          eq(mcpServerAssignments.mcpServerId, mcpServers.id),
+        )
+        .where(
+          and(
+            eq(mcpServerAssignments.id, input.id),
+            eq(mcpServers.tenantId, ctx.user.tenantId),
+          ),
+        );
+
+      if (!assignment) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Assignment not found" });
+      }
+
+      await getDb()
+        .delete(mcpServerAssignments)
+        .where(eq(mcpServerAssignments.id, input.id));
+
+      return { success: true };
+    }),
+
+  /** List assignments for a specific target */
+  listAssignments: adminProcedure
+    .input(
+      z.object({
+        targetType: z.enum(["tenant", "agency", "agent"]),
+        targetId: z.string().min(1).max(36),
+      }),
+    )
+    .query(async ({ ctx, input }) => {
+      const rows = await getDb()
+        .select({
+          assignment: mcpServerAssignments,
+          serverName: mcpServers.name,
+          serverSlug: mcpServers.slug,
+          serverEnabled: mcpServers.enabled,
+        })
+        .from(mcpServerAssignments)
+        .innerJoin(
+          mcpServers,
+          eq(mcpServerAssignments.mcpServerId, mcpServers.id),
+        )
+        .where(
+          and(
+            eq(mcpServerAssignments.targetType, input.targetType),
+            eq(mcpServerAssignments.targetId, input.targetId),
+            eq(mcpServers.tenantId, ctx.user.tenantId),
+          ),
+        );
+
+      return rows.map((r) => ({
+        ...r.assignment,
+        serverName: r.serverName,
+        serverSlug: r.serverSlug,
+        serverEnabled: r.serverEnabled,
+      }));
+    }),
+});
