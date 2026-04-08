import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuthorizeRequest = vi.fn();

vi.mock("./authz", () => ({
  authorizeRequest: mockAuthorizeRequest,
}));

vi.mock("../services/appRuntimeConfig", () => ({
  getAppRuntimeConfig: vi.fn(async () => ({
    pythonBackendUrl: "http://127.0.0.1:4000",
    proxyToken: "test-proxy-token",
  })),
}));

describe("legacy /api/mcp routes", () => {
  beforeEach(() => {
    mockAuthorizeRequest.mockReset();
    mockAuthorizeRequest.mockResolvedValue({
      ok: true,
      mode: "delegated_worker",
      sub: "worker-1",
      scopes: ["mcp:read", "mcp:write"],
      tenantId: "tenant-1",
      userId: 7,
      ownerUserId: 7,
      workerId: "worker-1",
      workerJobId: "job-1",
      delegatedSessionId: "delegated-session-1",
      runtimeType: "openclaw_gateway",
      scopeProfile: "worker_gateway_hybrid_executor",
    });
  });

  it("rejects delegated workers on /api/mcp/tools", async () => {
    const { registerMCPRoutes } = await import("./mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    const res = await request(app).get("/api/mcp/tools");

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      ok: false,
      error: { message: "Delegated workers must use /v1/mcp; legacy /api/mcp/* is unavailable" },
    });
  });

  it("rejects delegated workers on /api/mcp/call", async () => {
    const { registerMCPRoutes } = await import("./mcpRoutes");
    const app = express();
    app.use(express.json());
    registerMCPRoutes(app);

    const res = await request(app)
      .post("/api/mcp/call")
      .send({ name: "workspace_read_file", arguments: { path: "notes.txt" } });

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      ok: false,
      error: { message: "Delegated workers must use /v1/mcp; legacy /api/mcp/* is unavailable" },
    });
  });
});
