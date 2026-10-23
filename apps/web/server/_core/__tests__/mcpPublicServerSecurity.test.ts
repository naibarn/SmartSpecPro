import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import type { McpToolSession } from "../mcpRegistry";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockRedisData: Record<string, string> = {};
let mockMcpSessions: Record<string, McpToolSession> = {};
let mockMcpSessionTtls: Record<string, number> = {};

vi.mock("../../services/redisClients", () => ({
  getCacheClient: () => ({
    get: vi.fn(async (key: string) => mockRedisData[key] ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
      mockRedisData[key] = value;
      return "OK";
    }),
    expire: vi.fn(async () => 1),
  }),
}));

vi.mock("../../services/mcpPostgresState", () => ({
  saveMcpSession: vi.fn(async (id: string, session: McpToolSession, ttlSeconds: number) => {
    mockMcpSessions[id] = session;
    mockMcpSessionTtls[id] = ttlSeconds;
  }),
  loadMcpSession: vi.fn(async (id: string) => mockMcpSessions[id] ?? null),
  deleteMcpSession: vi.fn(async (id: string) => {
    delete mockMcpSessions[id];
  }),
  loadMcpToolReplay: vi.fn(async () => null),
  saveMcpToolReplay: vi.fn(async () => undefined),
}));

vi.mock("../../middleware/apiKeyAuth", () => ({
  apiKeyAuthMiddleware: (req: any, _res: any, next: any) => {
    req.auth = (req as any)._mockAuth ?? {
      ok: true,
      mode: "api_key",
      sub: "1",
      userId: 1,
      tenantId: "tenant-1",
      apiKeyId: "key-1",
      scopes: (req as any)._mockScopes ?? [
        "mcp:read",
        "mcp:write",
        "skills:list",
        "skills:execute",
        "agencies:list",
        "agencies:invoke",
        "media:generate",
        "presentations:create",
        "video_projects:create",
        "jobs:create",
        "jobs:read",
        "llm:chat",
        "agency:tools:mcp",
      ],
    };
    next();
  },
}));

vi.mock("../../services/orchestratorRoomActionsService", () => ({
  promoteMessageToWorkItem: vi.fn(async () => ({
    workItem: { id: "work-1" },
    createdMessage: { id: "msg-1" },
  })),
  advanceWorkItemByAssistant: vi.fn(async () => ({ workItem: { id: "work-1" } })),
  approveWorkItemByAssistant: vi.fn(async () => ({ workItem: { id: "work-1" } })),
  requestWorkItemChangesByAssistant: vi.fn(async () => ({ workItem: { id: "work-1" } })),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: vi.fn(async () => true),
}));

vi.mock("../../services/tenantFeatureFlagService", async () => {
  const actual = await vi.importActual<typeof import("../../services/tenantFeatureFlagService")>("../../services/tenantFeatureFlagService");
  const flags = await vi.importActual<typeof import("../../../shared/featureFlags")>("../../../shared/featureFlags");
  return {
    ...actual,
    getTenantFeatureFlags: vi.fn(async () => ({
      ...flags.FEATURE_FLAG_DEFAULTS,
      mcpModernProtocolEnabled: true,
      mcpLegacyCompatibilityEnabled: true,
      mcpResourcesEnabled: true,
      mcpGuideToolAliasesEnabled: true,
      mcpOAuthProtectedResourceEnabled: true,
    })),
  };
});

vi.mock("../../services/appRuntimeConfig", async () => {
  const actual = await vi.importActual<typeof import("../../services/appRuntimeConfig")>(
    "../../services/appRuntimeConfig",
  );
  return {
    ...actual,
    getAppRuntimeConfig: vi.fn(async () => ({
      pythonBackendUrl: "http://localhost:4000",
      proxyToken: "test-proxy-token",
      webGatewayToken: "test-web-gateway-token",
    })),
    getCachedPythonBackendUrl: vi.fn(() => "http://localhost:4000"),
  };
});

vi.mock("../../services/skillRegistry", () => ({
  getAvailableSkillsAsync: vi.fn(async () => []),
  getSkillByIdAsync: vi.fn(async () => null),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeApp(scopes?: string[]) {
  const { registerMcpPublicRoutes } = await import("../mcpPublicServer");
  const { apiKeyAuthMiddleware } = await import("../../middleware/apiKeyAuth");
  const app = express();
  app.use(express.json());
  if (scopes) {
    app.use((req: any, _res: any, next: any) => {
      (req as any)._mockScopes = scopes;
      next();
    });
  }
  // Add auth middleware before routes (simulates the shared /v1 middleware chain)
  app.use(apiKeyAuthMiddleware);
  registerMcpPublicRoutes(app);
  return app;
}

async function initializeSession(app: any, scopes?: string[]): Promise<string> {
  const req = request(app).post("/v1/mcp");
  if (scopes) {
    // Add scopes to the request (handled by mock middleware)
  }
  const res = await req.send({
    jsonrpc: "2.0",
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } },
    id: 1,
  });
  return res.headers["mcp-session-id"];
}

beforeEach(() => {
  mockRedisData = {};
  mockMcpSessions = {};
  mockMcpSessionTtls = {};
  vi.clearAllMocks();
});

// Warm the large MCP registry import before the first 5-second test timeout.
// Without this, running this file alone makes the first initialize request
// appear to hang even though the same request is deterministic once imported.
beforeAll(async () => {
  await import("../mcpPublicServer");
});

// ---------------------------------------------------------------------------
// Section 04 Security Tests
// ---------------------------------------------------------------------------

describe("M11: Unimplemented tools return error, not raw args", () => {
  it("smartspec.files.read returns -32601 error, not the input args", async () => {
    const app = await makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "smartspec.files.read",
          arguments: { path: "/etc/passwd" },
        },
        id: 3,
      });

    // Should get an error, not a result with our args
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe(-32601);
    expect(res.body.error.message).toBe("Tool not implemented");
    // Must NOT contain the input args in the response
    expect(JSON.stringify(res.body)).not.toContain("/etc/passwd");
  });
});

describe("M28: JSON-RPC error does not reflect method name", () => {
  it("unknown method returns fixed error message without input", async () => {
    const app = await makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "<script>alert(1)</script>",
        params: {},
        id: 5,
      });

    expect(res.body.error.code).toBe(-32601);
    expect(res.body.error.message).toBe("Method not found");
    expect(res.body.error.message).not.toContain("<script>");
  });
});

describe("M14: Session TTL configurable", () => {
  it("uses the current runtime default of 1800 seconds", async () => {
    const previousTtl = process.env.MCP_SESSION_TTL_SECONDS;
    delete process.env.MCP_SESSION_TTL_SECONDS;
    try {
      const app = await makeApp();
      const sessionId = await initializeSession(app);

      expect(mockMcpSessions[sessionId]).toBeDefined();
      expect(mockMcpSessionTtls[sessionId]).toBe(1800);
    } finally {
      if (previousTtl === undefined) delete process.env.MCP_SESSION_TTL_SECONDS;
      else process.env.MCP_SESSION_TTL_SECONDS = previousTtl;
    }
  });
});

describe("M23: active MCP rejects unknown tool names without reflecting input", () => {
  it("returns a fixed not-implemented error for an unregistered tool", async () => {
    const app = await makeApp();
    const sessionId = await initializeSession(app);
    const untrustedName = "smartspec.<script>alert(1)</script>";

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: untrustedName, arguments: {} },
        id: 2,
      });

    expect(res.body.error.code).toBe(-32601);
    expect(res.body.error.message).toBe("Tool not implemented");
    expect(JSON.stringify(res.body)).not.toContain(untrustedName);
  });
});

describe("M08: MCP session scope enforcement", () => {
  it("session with only mcp:read cannot call write tools", async () => {
    // Initialize with only mcp:read — no skills:execute or mcp:write
    const app = await makeApp(["mcp:read"]);
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "smartspec.skills.execute", arguments: { skill_id: "test", inputs: {} } },
        id: 3,
      });

    // Should be rejected because session scopes lack skills:execute
    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toBe("Internal error");
  });
});
