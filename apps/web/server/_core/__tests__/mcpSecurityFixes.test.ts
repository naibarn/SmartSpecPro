import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock auth to return controllable auth objects
const mockAuthorizeRequest = vi.fn();
vi.mock("../authz", () => ({
  authorizeRequest: (...args: any[]) => mockAuthorizeRequest(...args),
}));

vi.mock("../limits", () => ({
  rateLimit: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../tokens", () => ({
  hasScope: (scopes: string[] | undefined, required: string) =>
    scopes ? scopes.includes(required) : false,
}));

describe("mcpRoutes security fixes (section-03)", () => {
  let tmp: string;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    tmp = fs.mkdtempSync(path.join(process.cwd(), "tmp-mcp-sec-"));
    process.env.WORKSPACE_ROOT = tmp;
    process.env.MCP_REQUIRE_WRITE_TOKEN = "1";
    process.env.MCP_WRITE_TOKEN = "wtoken";
    process.env.WEB_MCP_RPM = "9999";

    // Default: auth returns a valid user
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "bearer",
      sub: "42",
      tenantId: "real-tenant",
      scopes: ["mcp:read", "mcp:write"],
    });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  // M01: tenantId resolved from auth object, not x-tenant-id header
  it("tenantId resolved from auth object, not x-tenant-id header (M01)", async () => {
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "bearer",
      sub: "42",
      tenantId: "real-tenant",
      scopes: ["mcp:read", "mcp:write"],
    });

    const mockPromote = vi.fn().mockResolvedValue({ workItem: {}, routeResult: {} });
    vi.doMock("../../services/orchestratorRoomActionsService", () => ({
      promoteMessageToWorkItem: mockPromote,
    }));

    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    await request(app)
      .post("/api/mcp/call")
      .set("x-tenant-id", "evil-tenant")
      .send({
        name: "smartspec.orchestrator.promote_message_to_work_item",
        arguments: {
          team_id: "t1",
          room_id: "r1",
          message_id: "m1",
          actor_assistant_id: "a1",
        },
      });

    // Should use "real-tenant" from auth, not "evil-tenant" from header
    expect(mockPromote).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "real-tenant" }),
    );
  });

  // M01: tenantId header ignored when auth.tenantId absent
  it("tenantId header ignored even when auth.tenantId is absent (M01)", async () => {
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "bearer",
      sub: "42",
      // No tenantId in auth
      scopes: ["mcp:read", "mcp:write"],
    });

    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    const res = await request(app)
      .post("/api/mcp/call")
      .set("x-tenant-id", "injected-tenant")
      .send({
        name: "smartspec.orchestrator.promote_message_to_work_item",
        arguments: {
          team_id: "t1",
          room_id: "r1",
          message_id: "m1",
          actor_assistant_id: "a1",
        },
      });

    // Should fail because no valid tenant context, NOT use the header value
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/tenant/i);
  });

  // M02: workspace write requires write token
  it("workspace write requires write token (M02)", async () => {
    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    // Without write token
    const rBad = await request(app)
      .post("/api/mcp/call")
      .set("x-mcp-write-token", "wrong-token")
      .send({
        name: "workspace_write_file",
        arguments: { path: "test.txt", content: "hello" },
      });
    expect(rBad.status).toBe(400);

    // With correct write token
    const rOk = await request(app)
      .post("/api/mcp/call")
      .set("x-mcp-write-token", "wtoken")
      .send({
        name: "workspace_write_file",
        arguments: { path: "test.txt", content: "hello" },
      });
    expect(rOk.status).toBe(200);
  });

  // M03: extensionless files are rejected
  it("extensionless files are rejected (M03)", async () => {
    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    // Create a Makefile in the workspace
    fs.writeFileSync(path.join(tmp, "Makefile"), "all: build");

    const res = await request(app)
      .post("/api/mcp/call")
      .send({
        name: "workspace_read_file",
        arguments: { path: "Makefile" },
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/extension/i);
  });

  // M03: .env file read is rejected
  it("reading .env file is rejected (M17/M18)", async () => {
    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    fs.writeFileSync(path.join(tmp, ".env"), "SECRET=abc");

    const res = await request(app)
      .post("/api/mcp/call")
      .send({
        name: "workspace_read_file",
        arguments: { path: ".env" },
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/extension/i);
  });

  // M04: Python tools cache is per-user-per-tenant
  it("Python tools cache is per-user-per-tenant (M04)", async () => {
    let callCount = 0;

    // Mock fetch for Python backend
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      if (String(url).includes("/api/internal/mcp/tools")) {
        callCount++;
        return new Response(
          JSON.stringify({
            tools: [{ name: `tool-for-call-${callCount}`, description: "test", inputSchema: {} }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return originalFetch(url);
    }) as any;

    try {
      // User 1 / Tenant A
      mockAuthorizeRequest.mockResolvedValue({
        ok: true,
        mode: "bearer",
        sub: "1",
        tenantId: "tenantA",
        scopes: ["mcp:read"],
      });

      const { registerMCPRoutes } = await import("../mcpRoutes");
      const app = express();
      app.use(express.json());
      registerMCPRoutes(app);

      const r1 = await request(app).get("/api/mcp/tools");
      expect(r1.status).toBe(200);
      const tools1 = r1.body.tools.map((t: any) => t.name);

      // User 2 / Tenant B
      mockAuthorizeRequest.mockResolvedValue({
        ok: true,
        mode: "bearer",
        sub: "2",
        tenantId: "tenantB",
        scopes: ["mcp:read"],
      });

      const r2 = await request(app).get("/api/mcp/tools");
      expect(r2.status).toBe(200);
      const tools2 = r2.body.tools.map((t: any) => t.name);

      // Should have made 2 separate fetch calls (different cache keys)
      expect(callCount).toBe(2);

      // The tools returned should be different (they come from different cache entries)
      expect(tools1).toContain("tool-for-call-1");
      expect(tools2).toContain("tool-for-call-2");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // M26: /mcp/ alias routes removed
  it("/mcp/ alias routes return 404 (M26)", async () => {
    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    const r1 = await request(app).get("/mcp/tools");
    expect(r1.status).toBe(404);

    const r2 = await request(app).post("/mcp/call").send({ name: "ping" });
    expect(r2.status).toBe(404);
  });

  // M06: request with non-numeric user ID from auth is rejected
  it("request with non-numeric auth.sub returns error for orchestrator tools (M06)", async () => {
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "bearer",
      sub: "abc",
      tenantId: "real-tenant",
      scopes: ["mcp:read", "mcp:write"],
    });

    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    const res = await request(app)
      .post("/api/mcp/call")
      .send({
        name: "smartspec.orchestrator.promote_message_to_work_item",
        arguments: {
          team_id: "t1",
          room_id: "r1",
          message_id: "m1",
          actor_assistant_id: "a1",
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/user/i);
  });

  // M27: trace ID sanitized — control chars stripped from trace IDs
  it("trace ID with special chars is sanitized (M27)", async () => {
    const auditEntries: any[] = [];
    const originalAppendFileSync = fs.appendFileSync;
    vi.spyOn(fs, "appendFileSync").mockImplementation((filePath: any, data: any) => {
      if (String(filePath).includes("mcp_audit")) {
        auditEntries.push(JSON.parse(String(data)));
        return;
      }
      return originalAppendFileSync(filePath, data);
    });

    const { registerMCPRoutes } = await import("../mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    // Create a valid file to read
    fs.mkdirSync(tmp, { recursive: true });
    fs.writeFileSync(path.join(tmp, "test.txt"), "hello");

    // Use chars that are allowed by HTTP but could cause log injection
    await request(app)
      .post("/api/mcp/call")
      .set("x-trace-id", "abc../etc/passwd")
      .send({
        name: "workspace_read_file",
        arguments: { path: "test.txt" },
      });

    // Unconditional assertion — audit must have been written
    const entry = auditEntries.find((e) => e.tool === "workspace_read_file");
    expect(entry).toBeDefined();
    expect(entry.traceId).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(entry.traceId).not.toContain("/");
    expect(entry.traceId).not.toContain(".");

    vi.restoreAllMocks();
  });
});
