import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import fs from "fs";
import path from "path";

describe("mcp.ts gateway security fixes (section-03)", () => {
  const savedEnv = { ...process.env };
  let tmp: string;

  beforeEach(() => {
    vi.resetModules();
    tmp = fs.mkdtempSync(path.join(process.cwd(), "tmp-mcp-gw-"));
    process.env.WORKSPACE_ROOT = tmp;
    process.env.MCP_AUDIT_LOG_PATH = path.join(tmp, "audit.jsonl");
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  // M16: requireGatewayKey returns 503 when GATEWAY_KEY is empty/unset
  it("returns 503 when SMARTSPEC_WEB_GATEWAY_KEY is empty (M16)", async () => {
    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "";
    const { registerMcpRoutes } = await import("../mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);

    const res = await request(app).get("/api/mcp/tools");
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("MCP gateway not configured");
  });

  // M16: requireGatewayKey returns 503 when GATEWAY_KEY is unset (not just empty)
  it("returns 503 when SMARTSPEC_WEB_GATEWAY_KEY is unset (M16)", async () => {
    delete process.env.SMARTSPEC_WEB_GATEWAY_KEY;
    const { registerMcpRoutes } = await import("../mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);

    const res = await request(app).get("/api/mcp/tools");
    expect(res.status).toBe(503);
  });

  // M25: security guards do not use NODE_ENV for enforcement
  it("returns 503 even in development mode when key is empty (M25)", async () => {
    process.env.NODE_ENV = "development";
    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "";
    const { registerMcpRoutes } = await import("../mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);

    const res = await request(app).get("/api/mcp/tools");
    expect(res.status).toBe(503);
  });

  // M17/M18: .env not in extension allowlists
  it(".env excluded from read extension allowlist (M17/M18)", async () => {
    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
    const { registerMcpRoutes } = await import("../mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);

    // Write a .env file in workspace
    fs.writeFileSync(path.join(tmp, ".env"), "SECRET=value");

    const res = await request(app)
      .post("/api/mcp/invoke")
      .set("x-gateway-key", "testkey")
      .send({ name: "workspace_read_file", arguments: { path: ".env" } });

    expect(res.status).toBe(400);
    // .env is caught by PATH_DENYLIST (path_denied) or extension check
    expect(res.body.error).toMatch(/path_denied|extension_not_allowed/);
  });

  // M03: extensionless files rejected
  it("extensionless files are rejected (M03)", async () => {
    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
    const { registerMcpRoutes } = await import("../mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);

    fs.writeFileSync(path.join(tmp, "Makefile"), "all: build");

    const res = await request(app)
      .post("/api/mcp/invoke")
      .set("x-gateway-key", "testkey")
      .send({ name: "workspace_read_file", arguments: { path: "Makefile" } });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/extension_not_allowed/);
  });

  // M19: sessionId must be UUID format
  it("sessionId with path traversal is rejected (M19)", async () => {
    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
    process.env.CONTROL_PLANE_BASE_URL = "http://localhost:7070";
    process.env.CONTROL_PLANE_API_KEY = "cpkey";

    const { registerMcpRoutes } = await import("../mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);

    const res = await request(app)
      .post("/api/mcp/invoke")
      .set("x-gateway-key", "testkey")
      .send({
        name: "artifact_get_url",
        arguments: { sessionId: "../../admin", key: "test" },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid session ID/i);
  });

  // M20: symlink resolved before containment check
  it("symlink escape is blocked (M20)", async () => {
    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
    const { registerMcpRoutes } = await import("../mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);

    // Create a symlink pointing outside workspace
    const escapePath = path.join(tmp, "escape.txt");
    try {
      fs.symlinkSync("/tmp", escapePath);
    } catch {
      // Skip on platforms that don't support symlinks
      return;
    }

    const res = await request(app)
      .post("/api/mcp/invoke")
      .set("x-gateway-key", "testkey")
      .send({
        name: "workspace_read_file",
        arguments: { path: "escape.txt" },
      });

    expect(res.status).toBe(400);
    // Should be caught by either symlink check or not-a-file check
    expect(res.body.ok).toBe(false);
  });

  // M21/M27: audit log traceId sanitization in mcp.ts
  it("traceId with injection chars is sanitized in audit (M21/M27)", async () => {
    process.env.SMARTSPEC_WEB_GATEWAY_KEY = "testkey";
    process.env.MCP_AUDIT_LOG_PATH = path.join(tmp, "audit.jsonl");
    process.env.MCP_AUDIT_ROTATE_DAILY = "0"; // Disable rotation for predictable file path

    const { registerMcpRoutes } = await import("../mcp");
    const app = express();
    app.use(express.json());
    registerMcpRoutes(app);

    // Create a valid file
    fs.writeFileSync(path.join(tmp, "test.txt"), "hello");

    // Send trace ID with dots and slashes (log injection attempt)
    await request(app)
      .post("/api/mcp/invoke")
      .set("x-gateway-key", "testkey")
      .set("x-trace-id", "abc../etc/passwd")
      .send({
        name: "workspace_read_file",
        arguments: { path: "test.txt" },
      });

    // The audit file must exist and the traceId must be sanitized
    const auditPath = path.join(tmp, "audit.jsonl");
    expect(fs.existsSync(auditPath)).toBe(true);
    const lines = fs.readFileSync(auditPath, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThan(0);
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.traceId).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(entry.traceId).not.toContain("/");
    expect(entry.traceId).not.toContain(".");
  });
});
