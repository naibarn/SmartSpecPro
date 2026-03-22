import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerMcpPublicRoutes } from "../mcpPublicServer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockRedisData: Record<string, string> = {};

vi.mock("../../services/redis", () => ({
  getRedisClient: () => ({
    get: vi.fn(async (key: string) => mockRedisData[key] ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
      mockRedisData[key] = value;
      return "OK";
    }),
    expire: vi.fn(async () => 1),
  }),
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
      ],
    };
    next();
  },
}));

const {
  mockPromoteMessageToWorkItem,
  mockAdvanceWorkItemByAssistant,
  mockApproveWorkItemByAssistant,
  mockRequestWorkItemChangesByAssistant,
} = vi.hoisted(() => ({
  mockPromoteMessageToWorkItem: vi.fn(async () => ({
    workItem: { id: "work-1", title: "Follow up" },
    createdMessage: { id: "msg-1" },
    autoRouted: { targetStep: "research", roomMessage: { id: "msg-2" } },
  })),
  mockAdvanceWorkItemByAssistant: vi.fn(async () => ({
    workItem: { id: "work-1" },
    targetStep: "review",
    roomMessage: { id: "msg-3" },
  })),
  mockApproveWorkItemByAssistant: vi.fn(async () => ({
    workItem: { id: "work-1" },
    roomMessage: { id: "msg-4" },
  })),
  mockRequestWorkItemChangesByAssistant: vi.fn(async () => ({
    workItem: { id: "work-1" },
    roomMessage: { id: "msg-5" },
    autoRouted: { targetStep: "research", roomMessage: { id: "msg-6" } },
  })),
}));

vi.mock("../../services/orchestratorRoomActionsService", () => ({
  promoteMessageToWorkItem: mockPromoteMessageToWorkItem,
  advanceWorkItemByAssistant: mockAdvanceWorkItemByAssistant,
  approveWorkItemByAssistant: mockApproveWorkItemByAssistant,
  requestWorkItemChangesByAssistant: mockRequestWorkItemChangesByAssistant,
}));

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(scopes?: string[]) {
  const app = express();
  app.use(express.json());
  if (scopes) {
    app.use((req: any, _res: any, next: any) => {
      (req as any)._mockScopes = scopes;
      next();
    });
  }
  registerMcpPublicRoutes(app);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function initializeSession(app: any): Promise<string> {
  const res = await request(app)
    .post("/v1/mcp")
    .send({
      jsonrpc: "2.0",
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "test" },
      },
      id: 1,
    });
  return res.headers["mcp-session-id"];
}

beforeEach(() => {
  mockRedisData = {};
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Protocol tests
// ---------------------------------------------------------------------------

describe("POST /v1/mcp — protocol", () => {
  it("returns server capabilities on initialize", async () => {
    const res = await request(makeApp())
      .post("/v1/mcp")
      .send({
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } },
        id: 1,
      });
    expect(res.status).toBe(200);
    expect(res.body.result.serverInfo.name).toBe("SmartSpecPro");
    expect(res.body.result.protocolVersion).toBe("2025-03-26");
    expect(res.body.result.capabilities.tools).toBeDefined();
    expect(res.headers["mcp-session-id"]).toBeDefined();
  });

  it("returns 25+ tools on tools/list", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 });

    expect(res.status).toBe(200);
    expect(res.body.result.tools.length).toBeGreaterThanOrEqual(25);
  });

  it("each tool has name, description, and inputSchema", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 });

    for (const tool of res.body.result.tools) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(typeof tool.inputSchema).toBe("object");
    }
  });

  it("executes tool and returns content array", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "smartspec.skills.list", arguments: {} },
        id: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.result.content).toBeInstanceOf(Array);
    expect(res.body.result.content.length).toBeGreaterThan(0);
  });

  it("lists orchestrator room action tools when the session has agencies:invoke + mcp:write", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 9 });

    const toolNames = res.body.result.tools.map((tool: any) => tool.name);
    expect(toolNames).toContain("smartspec.orchestrator.promote_message_to_work_item");
    expect(toolNames).toContain("smartspec.orchestrator.advance_work_item");
    expect(toolNames).toContain("smartspec.orchestrator.approve_work_item");
    expect(toolNames).toContain("smartspec.orchestrator.request_work_item_changes");
  });

  it("delegates orchestrator tool calls to the shared room action service", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: "smartspec.orchestrator.promote_message_to_work_item",
          arguments: {
            team_id: "team-1",
            room_id: "room-1",
            message_id: "msg-1",
            actor_assistant_id: "assistant-1",
            title: "Research follow-up",
            target_step: "research",
          },
        },
        id: 10,
      });

    expect(mockPromoteMessageToWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      teamId: "team-1",
      roomId: "room-1",
      messageId: "msg-1",
      actorAssistantId: "assistant-1",
      actorUserId: 1,
      title: "Research follow-up",
      targetStep: "research",
    }));
    expect(res.body.result.content[0].text).toContain("\"workItem\"");
  });

  it("rejects invalid JSON-RPC format (missing jsonrpc field)", async () => {
    const res = await request(makeApp())
      .post("/v1/mcp")
      .send({ method: "initialize", id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe(-32600);
  });

  it("returns -32601 for unknown method", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "unknown/method", params: {}, id: 4 });

    expect(res.body.error.code).toBe(-32601);
  });

  it("requires mcp:read scope — 403 without scope", async () => {
    const res = await request(makeApp([])) // empty scopes
      .post("/v1/mcp")
      .send({ jsonrpc: "2.0", method: "initialize", params: {}, id: 1 });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Session management tests
// ---------------------------------------------------------------------------

describe("Session management", () => {
  it("creates Redis session with key pattern mcp:session:{id}", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);
    expect(mockRedisData[`mcp:session:${sessionId}`]).toBeDefined();
  });

  it("session data contains state, tenantId, userId", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);
    const stored = JSON.parse(mockRedisData[`mcp:session:${sessionId}`]);
    expect(stored.state).toBe("ready");
    expect(stored.tenantId).toBe("tenant-1");
    expect(stored.userId).toBe(1);
  });

  it("requires Mcp-Session-Id for non-initialize methods", async () => {
    const res = await request(makeApp())
      .post("/v1/mcp")
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 });
    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toMatch(/session/i);
  });

  it("returns session expired error for unknown session ID", async () => {
    const res = await request(makeApp())
      .post("/v1/mcp")
      .set("Mcp-Session-Id", "00000000-0000-0000-0000-000000000000")
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 });
    expect(res.body.error.message).toMatch(/expired|invalid/i);
  });
});

// ---------------------------------------------------------------------------
// Tool scope enforcement tests
// ---------------------------------------------------------------------------

describe("Tool scope enforcement", () => {
  it("rejects tool call when session lacks required scope", async () => {
    // Initialize with only mcp:read scope — not skills:execute
    const app = makeApp(["mcp:read"]);
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "smartspec.skills.execute", arguments: { skill_id: "test", inputs: {} } },
        id: 2,
      });

    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toMatch(/scope/i);
  });

  it("rejects write tool when mcp:write scope is missing", async () => {
    // Has skills:execute but not mcp:write
    const app = makeApp(["mcp:read", "skills:execute"]);
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "smartspec.skills.execute", arguments: { skill_id: "x", inputs: {} } },
        id: 2,
      });

    expect(res.body.error).toBeDefined();
  });

  it("allows read tools with only mcp:read and tool scope", async () => {
    const app = makeApp(["mcp:read", "skills:list"]);
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "smartspec.skills.list", arguments: {} },
        id: 2,
      });

    expect(res.body.result).toBeDefined();
    expect(res.body.error).toBeUndefined();
  });

  it("returns -32602 when tool name is missing in tools/call", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { arguments: {} }, // no name
        id: 2,
      });

    expect(res.body.error.code).toBe(-32602);
  });
});

// ---------------------------------------------------------------------------
// Discovery manifest tests
// ---------------------------------------------------------------------------

describe("GET /.well-known/mcp.json", () => {
  it("returns valid MCP manifest without authentication", async () => {
    const res = await request(makeApp()).get("/.well-known/mcp.json");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body.name).toBe("SmartSpecPro");
    expect(res.body.url).toBe("https://smartaihub.app/v1/mcp");
    expect(res.body.auth.type).toBe("bearer");
    expect(res.body.capabilities.tools).toBe(true);
    expect(res.body.docs).toBeDefined();
  });
});
