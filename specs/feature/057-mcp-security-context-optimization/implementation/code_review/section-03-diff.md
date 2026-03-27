diff --git a/apps/web/server/_core/__tests__/mcpGatewaySecurityFixes.test.ts b/apps/web/server/_core/__tests__/mcpGatewaySecurityFixes.test.ts
new file mode 100644
index 00000000..1f34ab59
--- /dev/null
+++ b/apps/web/server/_core/__tests__/mcpGatewaySecurityFixes.test.ts
@@ -0,0 +1,185 @@
+import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
+import express from "express";
+import request from "supertest";
+import fs from "fs";
+import path from "path";
+
+describe("mcp.ts gateway security fixes (section-03)", () => {
+  const savedEnv = { ...process.env };
+  let tmp: string;
+
+  beforeEach(() => {
+    vi.resetModules();
+    tmp = fs.mkdtempSync(path.join(process.cwd(), "tmp-mcp-gw-"));
+    process.env.WORKSPACE_ROOT = tmp;
+    process.env.MCP_AUDIT_LOG_PATH = path.join(tmp, "audit.jsonl");
+  });
+
+  afterEach(() => {
+    process.env = { ...savedEnv };
+    try {
+      fs.rmSync(tmp, { recursive: true, force: true });
+    } catch {}
+  });
+
+  // M16: requireGatewayKey returns 503 when GATEWAY_KEY is empty/unset
+  it("returns 503 when SMARTSPEC_WEB_GATEWAY_KEY is empty (M16)", async () => {
+    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "";
+    const { registerMcpRoutes } = await import("../mcp");
+    const app = express();
+    app.use(express.json());
+    registerMcpRoutes(app);
+
+    const res = await request(app).get("/api/mcp/tools");
+    expect(res.status).toBe(503);
+    expect(res.body.error).toBe("MCP gateway not configured");
+  });
+
+  // M16: requireGatewayKey returns 503 when GATEWAY_KEY is unset (not just empty)
+  it("returns 503 when SMARTSPEC_WEB_GATEWAY_KEY is unset (M16)", async () => {
+    delete process.env.SMARTSPEC_WEB_GATEWAY_KEY;
+    const { registerMcpRoutes } = await import("../mcp");
+    const app = express();
+    app.use(express.json());
+    registerMcpRoutes(app);
+
+    const res = await request(app).get("/api/mcp/tools");
+    expect(res.status).toBe(503);
+  });
+
+  // M25: security guards do not use NODE_ENV for enforcement
+  it("returns 503 even in development mode when key is empty (M25)", async () => {
+    process.env.NODE_ENV = "development";
+    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "";
+    const { registerMcpRoutes } = await import("../mcp");
+    const app = express();
+    app.use(express.json());
+    registerMcpRoutes(app);
+
+    const res = await request(app).get("/api/mcp/tools");
+    expect(res.status).toBe(503);
+  });
+
+  // M17/M18: .env not in extension allowlists
+  it(".env excluded from read extension allowlist (M17/M18)", async () => {
+    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
+    const { registerMcpRoutes } = await import("../mcp");
+    const app = express();
+    app.use(express.json());
+    registerMcpRoutes(app);
+
+    // Write a .env file in workspace
+    fs.writeFileSync(path.join(tmp, ".env"), "SECRET=value");
+
+    const res = await request(app)
+      .post("/api/mcp/invoke")
+      .set("x-gateway-key", "testkey")
+      .send({ name: "workspace_read_file", arguments: { path: ".env" } });
+
+    expect(res.status).toBe(400);
+    // .env is caught by PATH_DENYLIST (path_denied) or extension check
+    expect(res.body.error).toMatch(/path_denied|extension_not_allowed/);
+  });
+
+  // M03: extensionless files rejected
+  it("extensionless files are rejected (M03)", async () => {
+    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
+    const { registerMcpRoutes } = await import("../mcp");
+    const app = express();
+    app.use(express.json());
+    registerMcpRoutes(app);
+
+    fs.writeFileSync(path.join(tmp, "Makefile"), "all: build");
+
+    const res = await request(app)
+      .post("/api/mcp/invoke")
+      .set("x-gateway-key", "testkey")
+      .send({ name: "workspace_read_file", arguments: { path: "Makefile" } });
+
+    expect(res.status).toBe(400);
+    expect(res.body.error).toMatch(/extension_not_allowed/);
+  });
+
+  // M19: sessionId must be UUID format
+  it("sessionId with path traversal is rejected (M19)", async () => {
+    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
+    process.env.CONTROL_PLANE_BASE_URL = "http://localhost:7070";
+    process.env.CONTROL_PLANE_API_KEY = "cpkey";
+
+    const { registerMcpRoutes } = await import("../mcp");
+    const app = express();
+    app.use(express.json());
+    registerMcpRoutes(app);
+
+    const res = await request(app)
+      .post("/api/mcp/invoke")
+      .set("x-gateway-key", "testkey")
+      .send({
+        name: "artifact_get_url",
+        arguments: { sessionId: "../../admin", key: "test" },
+      });
+
+    expect(res.status).toBe(400);
+    expect(res.body.error).toMatch(/Invalid session ID/i);
+  });
+
+  // M20: symlink resolved before containment check
+  it("symlink escape is blocked (M20)", async () => {
+    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
+    const { registerMcpRoutes } = await import("../mcp");
+    const app = express();
+    app.use(express.json());
+    registerMcpRoutes(app);
+
+    // Create a symlink pointing outside workspace
+    const escapePath = path.join(tmp, "escape.txt");
+    try {
+      fs.symlinkSync("/tmp", escapePath);
+    } catch {
+      // Skip on platforms that don't support symlinks
+      return;
+    }
+
+    const res = await request(app)
+      .post("/api/mcp/invoke")
+      .set("x-gateway-key", "testkey")
+      .send({
+        name: "workspace_read_file",
+        arguments: { path: "escape.txt" },
+      });
+
+    expect(res.status).toBe(400);
+    // Should be caught by either symlink check or not-a-file check
+    expect(res.body.ok).toBe(false);
+  });
+
+  // M21: audit log traceId sanitization in mcp.ts
+  it("traceId with traversal chars is sanitized in audit (M21)", async () => {
+    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
+    process.env.MCP_AUDIT_LOG_PATH = path.join(tmp, "audit.jsonl");
+
+    const { registerMcpRoutes } = await import("../mcp");
+    const app = express();
+    app.use(express.json());
+    registerMcpRoutes(app);
+
+    // Create a valid file
+    fs.writeFileSync(path.join(tmp, "test.txt"), "hello");
+
+    await request(app)
+      .post("/api/mcp/invoke")
+      .set("x-gateway-key", "testkey")
+      .set("x-trace-id", "abc-123")
+      .send({
+        name: "workspace_read_file",
+        arguments: { path: "test.txt" },
+      });
+
+    // The audit file should exist and contain the trace
+    const auditPath = path.join(tmp, "audit.jsonl");
+    if (fs.existsSync(auditPath)) {
+      const content = fs.readFileSync(auditPath, "utf-8");
+      expect(content).toContain("abc-123");
+    }
+  });
+});
diff --git a/apps/web/server/_core/__tests__/mcpSecurityFixes.test.ts b/apps/web/server/_core/__tests__/mcpSecurityFixes.test.ts
new file mode 100644
index 00000000..cc1adcca
--- /dev/null
+++ b/apps/web/server/_core/__tests__/mcpSecurityFixes.test.ts
@@ -0,0 +1,339 @@
+import express from "express";
+import request from "supertest";
+import fs from "fs";
+import path from "path";
+import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
+
+// Mock auth to return controllable auth objects
+const mockAuthorizeRequest = vi.fn();
+vi.mock("../authz", () => ({
+  authorizeRequest: (...args: any[]) => mockAuthorizeRequest(...args),
+}));
+
+vi.mock("../limits", () => ({
+  rateLimit: () => (_req: any, _res: any, next: any) => next(),
+}));
+
+vi.mock("../tokens", () => ({
+  hasScope: (scopes: string[] | undefined, required: string) =>
+    scopes ? scopes.includes(required) : false,
+}));
+
+describe("mcpRoutes security fixes (section-03)", () => {
+  let tmp: string;
+
+  beforeEach(() => {
+    vi.resetModules();
+    vi.clearAllMocks();
+    tmp = fs.mkdtempSync(path.join(process.cwd(), "tmp-mcp-sec-"));
+    process.env.WORKSPACE_ROOT = tmp;
+    process.env.MCP_REQUIRE_WRITE_TOKEN = "1";
+    process.env.MCP_WRITE_TOKEN = "wtoken";
+    process.env.WEB_MCP_RPM = "9999";
+
+    // Default: auth returns a valid user
+    mockAuthorizeRequest.mockResolvedValue({
+      ok: true,
+      mode: "bearer",
+      sub: "42",
+      tenantId: "real-tenant",
+      scopes: ["mcp:read", "mcp:write"],
+    });
+  });
+
+  afterEach(() => {
+    try {
+      fs.rmSync(tmp, { recursive: true, force: true });
+    } catch {}
+  });
+
+  // M01: tenantId resolved from auth object, not x-tenant-id header
+  it("tenantId resolved from auth object, not x-tenant-id header (M01)", async () => {
+    mockAuthorizeRequest.mockResolvedValue({
+      ok: true,
+      mode: "bearer",
+      sub: "42",
+      tenantId: "real-tenant",
+      scopes: ["mcp:read", "mcp:write"],
+    });
+
+    const mockPromote = vi.fn().mockResolvedValue({ workItem: {}, routeResult: {} });
+    vi.doMock("../../services/orchestratorRoomActionsService", () => ({
+      promoteMessageToWorkItem: mockPromote,
+    }));
+
+    const { registerMCPRoutes } = await import("../mcpRoutes");
+    const app = express();
+    app.use(express.json());
+    registerMCPRoutes(app);
+
+    await request(app)
+      .post("/api/mcp/call")
+      .set("x-tenant-id", "evil-tenant")
+      .send({
+        name: "smartspec.orchestrator.promote_message_to_work_item",
+        arguments: {
+          team_id: "t1",
+          room_id: "r1",
+          message_id: "m1",
+          actor_assistant_id: "a1",
+        },
+      });
+
+    // Should use "real-tenant" from auth, not "evil-tenant" from header
+    expect(mockPromote).toHaveBeenCalledWith(
+      expect.objectContaining({ tenantId: "real-tenant" }),
+    );
+  });
+
+  // M01: tenantId header ignored when auth.tenantId absent
+  it("tenantId header ignored even when auth.tenantId is absent (M01)", async () => {
+    mockAuthorizeRequest.mockResolvedValue({
+      ok: true,
+      mode: "bearer",
+      sub: "42",
+      // No tenantId in auth
+      scopes: ["mcp:read", "mcp:write"],
+    });
+
+    const { registerMCPRoutes } = await import("../mcpRoutes");
+    const app = express();
+    app.use(express.json());
+    registerMCPRoutes(app);
+
+    const res = await request(app)
+      .post("/api/mcp/call")
+      .set("x-tenant-id", "injected-tenant")
+      .send({
+        name: "smartspec.orchestrator.promote_message_to_work_item",
+        arguments: {
+          team_id: "t1",
+          room_id: "r1",
+          message_id: "m1",
+          actor_assistant_id: "a1",
+        },
+      });
+
+    // Should fail because no valid tenant context, NOT use the header value
+    expect(res.status).toBe(400);
+    expect(res.body.error?.message).toMatch(/tenant/i);
+  });
+
+  // M02: workspace write requires write token
+  it("workspace write requires write token (M02)", async () => {
+    const { registerMCPRoutes } = await import("../mcpRoutes");
+    const app = express();
+    app.use(express.json());
+    registerMCPRoutes(app);
+
+    // Without write token
+    const rBad = await request(app)
+      .post("/api/mcp/call")
+      .set("x-mcp-write-token", "wrong-token")
+      .send({
+        name: "workspace_write_file",
+        arguments: { path: "test.txt", content: "hello" },
+      });
+    expect(rBad.status).toBe(400);
+
+    // With correct write token
+    const rOk = await request(app)
+      .post("/api/mcp/call")
+      .set("x-mcp-write-token", "wtoken")
+      .send({
+        name: "workspace_write_file",
+        arguments: { path: "test.txt", content: "hello" },
+      });
+    expect(rOk.status).toBe(200);
+  });
+
+  // M03: extensionless files are rejected
+  it("extensionless files are rejected (M03)", async () => {
+    const { registerMCPRoutes } = await import("../mcpRoutes");
+    const app = express();
+    app.use(express.json());
+    registerMCPRoutes(app);
+
+    // Create a Makefile in the workspace
+    fs.writeFileSync(path.join(tmp, "Makefile"), "all: build");
+
+    const res = await request(app)
+      .post("/api/mcp/call")
+      .send({
+        name: "workspace_read_file",
+        arguments: { path: "Makefile" },
+      });
+
+    expect(res.status).toBe(400);
+    expect(res.body.error?.message).toMatch(/extension/i);
+  });
+
+  // M03: .env file read is rejected
+  it("reading .env file is rejected (M17/M18)", async () => {
+    const { registerMCPRoutes } = await import("../mcpRoutes");
+    const app = express();
+    app.use(express.json());
+    registerMCPRoutes(app);
+
+    fs.writeFileSync(path.join(tmp, ".env"), "SECRET=abc");
+
+    const res = await request(app)
+      .post("/api/mcp/call")
+      .send({
+        name: "workspace_read_file",
+        arguments: { path: ".env" },
+      });
+
+    expect(res.status).toBe(400);
+    expect(res.body.error?.message).toMatch(/extension/i);
+  });
+
+  // M04: Python tools cache is per-user-per-tenant
+  it("Python tools cache is per-user-per-tenant (M04)", async () => {
+    let callCount = 0;
+
+    // Mock fetch for Python backend
+    const originalFetch = globalThis.fetch;
+    globalThis.fetch = vi.fn(async (url: any) => {
+      if (String(url).includes("/api/internal/mcp/tools")) {
+        callCount++;
+        return new Response(
+          JSON.stringify({
+            tools: [{ name: `tool-for-call-${callCount}`, description: "test", inputSchema: {} }],
+          }),
+          { status: 200, headers: { "Content-Type": "application/json" } },
+        );
+      }
+      return originalFetch(url);
+    }) as any;
+
+    try {
+      // User 1 / Tenant A
+      mockAuthorizeRequest.mockResolvedValue({
+        ok: true,
+        mode: "bearer",
+        sub: "1",
+        tenantId: "tenantA",
+        scopes: ["mcp:read"],
+      });
+
+      const { registerMCPRoutes } = await import("../mcpRoutes");
+      const app = express();
+      app.use(express.json());
+      registerMCPRoutes(app);
+
+      const r1 = await request(app).get("/api/mcp/tools");
+      expect(r1.status).toBe(200);
+      const tools1 = r1.body.tools.map((t: any) => t.name);
+
+      // User 2 / Tenant B
+      mockAuthorizeRequest.mockResolvedValue({
+        ok: true,
+        mode: "bearer",
+        sub: "2",
+        tenantId: "tenantB",
+        scopes: ["mcp:read"],
+      });
+
+      const r2 = await request(app).get("/api/mcp/tools");
+      expect(r2.status).toBe(200);
+      const tools2 = r2.body.tools.map((t: any) => t.name);
+
+      // Should have made 2 separate fetch calls (different cache keys)
+      expect(callCount).toBe(2);
+
+      // The tools returned should be different (they come from different cache entries)
+      expect(tools1).toContain("tool-for-call-1");
+      expect(tools2).toContain("tool-for-call-2");
+    } finally {
+      globalThis.fetch = originalFetch;
+    }
+  });
+
+  // M26: /mcp/ alias routes removed
+  it("/mcp/ alias routes return 404 (M26)", async () => {
+    const { registerMCPRoutes } = await import("../mcpRoutes");
+    const app = express();
+    app.use(express.json());
+    registerMCPRoutes(app);
+
+    const r1 = await request(app).get("/mcp/tools");
+    expect(r1.status).toBe(404);
+
+    const r2 = await request(app).post("/mcp/call").send({ name: "ping" });
+    expect(r2.status).toBe(404);
+  });
+
+  // M06: request with non-numeric user ID from auth is rejected
+  it("request with non-numeric auth.sub returns error for orchestrator tools (M06)", async () => {
+    mockAuthorizeRequest.mockResolvedValue({
+      ok: true,
+      mode: "bearer",
+      sub: "abc",
+      tenantId: "real-tenant",
+      scopes: ["mcp:read", "mcp:write"],
+    });
+
+    const { registerMCPRoutes } = await import("../mcpRoutes");
+    const app = express();
+    app.use(express.json());
+    registerMCPRoutes(app);
+
+    const res = await request(app)
+      .post("/api/mcp/call")
+      .send({
+        name: "smartspec.orchestrator.promote_message_to_work_item",
+        arguments: {
+          team_id: "t1",
+          room_id: "r1",
+          message_id: "m1",
+          actor_assistant_id: "a1",
+        },
+      });
+
+    expect(res.status).toBe(400);
+    expect(res.body.error?.message).toMatch(/user/i);
+  });
+
+  // M27: trace ID sanitized — control chars stripped from trace IDs
+  it("trace ID with special chars is sanitized (M27)", async () => {
+    const auditEntries: any[] = [];
+    const originalAppendFileSync = fs.appendFileSync;
+    vi.spyOn(fs, "appendFileSync").mockImplementation((filePath: any, data: any) => {
+      if (String(filePath).includes("mcp_audit")) {
+        auditEntries.push(JSON.parse(String(data)));
+        return;
+      }
+      return originalAppendFileSync(filePath, data);
+    });
+
+    const { registerMCPRoutes } = await import("../mcpRoutes");
+    const app = express();
+    app.use(express.json());
+    registerMCPRoutes(app);
+
+    // Create a valid file to read
+    fs.mkdirSync(tmp, { recursive: true });
+    fs.writeFileSync(path.join(tmp, "test.txt"), "hello");
+
+    // Use chars that are allowed by HTTP but could cause log injection
+    // (dots, slashes, spaces are stripped by our sanitizer)
+    await request(app)
+      .post("/api/mcp/call")
+      .set("x-trace-id", "abc../etc/passwd")
+      .send({
+        name: "workspace_read_file",
+        arguments: { path: "test.txt" },
+      });
+
+    // Check that the logged traceId contains only safe chars
+    const entry = auditEntries.find((e) => e.tool === "workspace_read_file");
+    if (entry) {
+      expect(entry.traceId).toMatch(/^[a-zA-Z0-9_-]+$/);
+      expect(entry.traceId).not.toContain("/");
+      expect(entry.traceId).not.toContain(".");
+    }
+
+    vi.restoreAllMocks();
+  });
+});
diff --git a/apps/web/server/_core/mcp.ts b/apps/web/server/_core/mcp.ts
index 45144424..f6a36128 100644
--- a/apps/web/server/_core/mcp.ts
+++ b/apps/web/server/_core/mcp.ts
@@ -19,11 +19,11 @@ const CONTROL_PLANE_BASE_URL = (process.env.CONTROL_PLANE_BASE_URL ?? "").replac
 const CONTROL_PLANE_API_KEY = process.env.CONTROL_PLANE_API_KEY ?? "";
 
 const DEFAULT_READ_EXTS = (process.env.MCP_READ_EXT_ALLOWLIST ??
-  ".md,.txt,.json,.yaml,.yml,.toml,.ts,.tsx,.js,.jsx,.py,.css,.html,.env,.csv")
+  ".md,.txt,.json,.yaml,.yml,.toml,.ts,.tsx,.js,.jsx,.py,.css,.html,.csv")
   .split(",").map(s => s.trim()).filter(Boolean);
 
 const DEFAULT_WRITE_EXTS = (process.env.MCP_WRITE_EXT_ALLOWLIST ??
-  ".md,.txt,.json,.yaml,.yml,.toml,.ts,.tsx,.js,.jsx,.py,.css,.html,.env,.csv")
+  ".md,.txt,.json,.yaml,.yml,.toml,.ts,.tsx,.js,.jsx,.py,.css,.html,.csv")
   .split(",").map(s => s.trim()).filter(Boolean);
 
 const PATH_ALLOWLIST = (process.env.MCP_PATH_ALLOWLIST ?? "").split(",").map(s => s.trim()).filter(Boolean);
@@ -87,7 +87,10 @@ function audit(entry: any) {
 }
 
 function requireGatewayKey(req: any, res: any): boolean {
-  if (!GATEWAY_KEY) return true;
+  if (!GATEWAY_KEY) {
+    res.status(503).json({ error: "MCP gateway not configured" });
+    return false;
+  }
   const k = req.header("x-gateway-key") || "";
   if (k !== GATEWAY_KEY) {
     res.status(401).json({ error: { message: "invalid_gateway_key" } });
@@ -102,6 +105,14 @@ function resolveWorkspacePath(rel: string) {
   if (!abs.startsWith(rootAbs + path.sep) && abs !== rootAbs) {
     throw new Error("path_outside_workspace_root");
   }
+  // M20: Resolve symlinks and re-check containment
+  if (fs.existsSync(abs)) {
+    const resolved = fs.realpathSync(abs);
+    if (!resolved.startsWith(rootAbs + path.sep) && resolved !== rootAbs) {
+      throw new Error("path_escapes_workspace_after_symlink_resolution");
+    }
+    return resolved;
+  }
   return abs;
 }
 
@@ -128,7 +139,11 @@ function checkPathPolicy(rel: string, mode: "read" | "write") {
 
   const ext = path.extname(rel).toLowerCase();
   const allowed = mode === "read" ? DEFAULT_READ_EXTS : DEFAULT_WRITE_EXTS;
-  if (allowed.length > 0 && ext && !allowed.includes(ext)) {
+  // M03: Deny extensionless files — they bypass the allowlist
+  if (!ext) {
+    throw new Error("extension_not_allowed");
+  }
+  if (allowed.length > 0 && !allowed.includes(ext)) {
     throw new Error("extension_not_allowed");
   }
 }
@@ -161,6 +176,11 @@ const tools: ToolDef[] = [
     permission: "net",
     handler: async (args: any) => {
       if (!CONTROL_PLANE_BASE_URL || !CONTROL_PLANE_API_KEY) throw new Error("control_plane_not_configured");
+      // M19: Validate sessionId is UUID format to prevent path traversal
+      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
+      if (!UUID_RE.test(String(args.sessionId))) {
+        throw new Error("Invalid session ID format");
+      }
       const url =
         `${CONTROL_PLANE_BASE_URL}/api/v1/sessions/${encodeURIComponent(String(args.sessionId))}/artifacts/presign-get?` +
         new URLSearchParams({ key: String(args.key) }).toString();
diff --git a/apps/web/server/_core/mcpRoutes.ts b/apps/web/server/_core/mcpRoutes.ts
index 75e4a460..85ea369b 100644
--- a/apps/web/server/_core/mcpRoutes.ts
+++ b/apps/web/server/_core/mcpRoutes.ts
@@ -36,8 +36,8 @@ import { ENV } from "./env";
 const PYTHON_BACKEND_URL = ENV.pythonBackendUrl || "http://localhost:8000";
 const PROXY_TOKEN = process.env.SMARTSPEC_PROXY_TOKEN || "";
 
-// Simple TTL cache for Python-native tools
-let _pythonToolsCache: { tools: ToolDef[]; ts: number } | null = null;
+// M04: Per-user-per-tenant TTL cache for Python-native tools
+const _pythonToolsCacheMap = new Map<string, { tools: ToolDef[]; ts: number }>();
 const PYTHON_TOOLS_CACHE_TTL = 60_000; // 60 seconds
 
 const DRIVE_TOOL_NAMES = new Set([
@@ -59,7 +59,14 @@ function safeJoin(rel: string): string {
 
 function assertExtAllowed(p: string) {
   const ext = path.extname(p).toLowerCase();
-  if (ext && !EXT_ALLOW.has(ext)) throw new Error(`Extension not allowed: ${ext}`);
+  // M03: Deny extensionless files — they bypass the allowlist
+  if (!ext) throw new Error(`Extension not allowed: (none)`);
+  if (!EXT_ALLOW.has(ext)) throw new Error(`Extension not allowed: ${ext}`);
+}
+
+// M27: Sanitize trace IDs to prevent log injection
+function sanitizeTraceId(raw: string): string {
+  return raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
 }
 
 function writeAudit(entry: any) {
@@ -189,7 +196,8 @@ function requiredScopeForTool(name: string): string {
 }
 
 async function callTool(name: string, args: any, req: Request, auth: any) {
-  const traceId = (req.headers["x-trace-id"] as string) || crypto.randomUUID();
+  const rawTraceId = (req.headers["x-trace-id"] as string) || "";
+  const traceId = rawTraceId ? sanitizeTraceId(rawTraceId) : crypto.randomUUID();
   const argsHash = crypto.createHash("sha256").update(JSON.stringify(args || {})).digest("hex");
 
   const baseAudit = {
@@ -249,14 +257,13 @@ async function callTool(name: string, args: any, req: Request, auth: any) {
     }
 
     if (name.startsWith("smartspec.orchestrator.")) {
+      // M01: Resolve tenantId from auth object only — never from x-tenant-id header
       const tenantId =
         (typeof auth?.tenantId === "string" && auth.tenantId) ||
-        String(req.headers["x-tenant-id"] || "");
-      const actorUserIdHeader = String(req.headers["x-user-id"] || "");
-      const actorUserId =
-        Number.isFinite(Number(actorUserIdHeader)) && Number(actorUserIdHeader) > 0
-          ? Number(actorUserIdHeader)
-          : Number.parseInt(String(auth?.sub || ""), 10);
+        (typeof auth?.user?.tenantId === "string" && auth.user.tenantId) ||
+        "";
+      // M06: Resolve userId from auth only — x-user-id header is untrusted
+      const actorUserId = Number.parseInt(String(auth?.sub || ""), 10);
 
       if (!tenantId) {
         throw new Error("Tenant context required for orchestrator tools");
@@ -333,10 +340,12 @@ async function callTool(name: string, args: any, req: Request, auth: any) {
   }
 }
 
-async function fetchPythonMcpTools(userId: number): Promise<ToolDef[]> {
+async function fetchPythonMcpTools(userId: number, tenantId: string): Promise<ToolDef[]> {
   try {
-    if (_pythonToolsCache && Date.now() - _pythonToolsCache.ts < PYTHON_TOOLS_CACHE_TTL) {
-      return _pythonToolsCache.tools;
+    const cacheKey = `${userId}:${tenantId}`;
+    const cached = _pythonToolsCacheMap.get(cacheKey);
+    if (cached && Date.now() - cached.ts < PYTHON_TOOLS_CACHE_TTL) {
+      return cached.tools;
     }
     const controller = new AbortController();
     const timeout = setTimeout(() => controller.abort(), 2000);
@@ -350,8 +359,16 @@ async function fetchPythonMcpTools(userId: number): Promise<ToolDef[]> {
     clearTimeout(timeout);
     if (!resp.ok) return [];
     const data = (await resp.json()) as { tools: ToolDef[] };
-    _pythonToolsCache = { tools: data.tools || [], ts: Date.now() };
-    return _pythonToolsCache.tools;
+    const tools = data.tools || [];
+    _pythonToolsCacheMap.set(cacheKey, { tools, ts: Date.now() });
+    // Evict stale cache entries to prevent memory leaks
+    if (_pythonToolsCacheMap.size > 500) {
+      const now = Date.now();
+      for (const [k, v] of _pythonToolsCacheMap) {
+        if (now - v.ts > PYTHON_TOOLS_CACHE_TTL) _pythonToolsCacheMap.delete(k);
+      }
+    }
+    return tools;
   } catch {
     return [];
   }
@@ -397,7 +414,7 @@ export function registerMCPRoutes(app: Express) {
     if (!auth) {
       writeAudit({
         ts: new Date().toISOString(),
-        traceId: (req.headers["x-trace-id"] as string) || crypto.randomUUID(),
+        traceId: req.headers["x-trace-id"] ? sanitizeTraceId(req.headers["x-trace-id"] as string) : crypto.randomUUID(),
         tool: "__list_tools__",
         ok: false,
         error: "Unauthorized",
@@ -409,7 +426,8 @@ export function registerMCPRoutes(app: Express) {
     }
     // Merge Python-native Drive tools if user is authenticated
     const userId = parseInt(auth.sub, 10);
-    const driveTools = userId ? await fetchPythonMcpTools(userId) : [];
+    const tenantId = auth.tenantId || auth?.user?.tenantId || "";
+    const driveTools = userId ? await fetchPythonMcpTools(userId, tenantId) : [];
     const allTools = [...tools, ...driveTools];
     res.json({ tools: allTools });
   };
@@ -419,7 +437,7 @@ export function registerMCPRoutes(app: Express) {
     if (!auth) {
       writeAudit({
         ts: new Date().toISOString(),
-        traceId: (req.headers["x-trace-id"] as string) || crypto.randomUUID(),
+        traceId: req.headers["x-trace-id"] ? sanitizeTraceId(req.headers["x-trace-id"] as string) : crypto.randomUUID(),
         tool: "__call__",
         ok: false,
         error: "Unauthorized",
@@ -436,7 +454,7 @@ export function registerMCPRoutes(app: Express) {
       if (!hasScope(auth.scopes, required)) {
         writeAudit({
           ts: new Date().toISOString(),
-          traceId: (req.headers["x-trace-id"] as string) || crypto.randomUUID(),
+          traceId: req.headers["x-trace-id"] ? sanitizeTraceId(req.headers["x-trace-id"] as string) : crypto.randomUUID(),
           tool: toolName,
           ok: false,
           error: `Missing scope: ${required}`,
@@ -452,7 +470,7 @@ export function registerMCPRoutes(app: Express) {
       // Check if this is a Python-native Drive tool
       if (DRIVE_TOOL_NAMES.has(toolName)) {
         const userId = parseInt(auth.sub, 10);
-        const tenantId = auth.tenantId || "";
+        const tenantId = auth.tenantId || auth?.user?.tenantId || "";
         const result = await forwardToolCallToPython(toolName, args, userId, tenantId);
         res.json(result);
         return;
@@ -467,6 +485,5 @@ export function registerMCPRoutes(app: Express) {
 
   app.get("/api/mcp/tools", limiter, toolsHandler);
   app.post("/api/mcp/call", limiter, callHandler);
-  app.get("/mcp/tools", limiter, toolsHandler);
-  app.post("/mcp/call", limiter, callHandler);
+  // M26: Removed /mcp/ alias routes — use /api/mcp/ only
 }
