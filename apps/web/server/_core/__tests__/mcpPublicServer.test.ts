import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { registerMcpPublicRoutes } from "../mcpPublicServer";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

let mockRedisData: Record<string, string> = {};

const {
  mockDelegatedManifest,
  mockPromoteMessageToWorkItem,
  mockAdvanceWorkItemByAssistant,
  mockApproveWorkItemByAssistant,
  mockRequestWorkItemChangesByAssistant,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockDelegatedManifest: {
    sessionId: "delegated-session-1",
    workerId: "worker-1",
    workerJobId: "job-1",
    tenantId: "tenant-1",
    actingUserId: 7,
    ownerUserId: 7,
    runtimeType: "openclaw_gateway",
    scopeProfile: "worker_gateway_hybrid_executor",
    grantedScopes: ["mcp:read", "mcp:write", "llm:chat", "skills:list", "library:search", "rag:search"],
    routeFamilies: ["llm", "skills", "library", "rag", "mcp", "callbacks"],
    allowedMcpNamespaces: ["gateway", "knowledge", "skills"],
    allowedModelAliases: ["gpt-5.4-mini"],
    allowedProviderProfiles: [],
    knowledgeAccess: {
      libraryRead: false,
      librarySearch: true,
      libraryUpload: false,
      ragSearch: true,
      ragIngest: false,
    },
    grantSummary: {
      skills: [],
      agencies: [],
      libraryItemIds: [],
      mcpNamespaces: ["gateway", "knowledge", "skills"],
    },
    uploadPolicy: {
      enabled: false,
      allowedItemTypes: [],
      maxFileBytes: null,
    },
    callbackTargets: {
      roomUpdate: true,
      workflowUpdate: true,
      userNotification: true,
    },
    availability: {
      http: "ready",
      mcp: "ready",
      knowledge: "ready",
    },
    mcp: {
      enabled: true,
      availableFamilies: ["gateway", "knowledge", "skills"],
      families: [
        { family: "gateway", enabled: true, availableToolCount: 4, reason: null },
        { family: "knowledge", enabled: true, availableToolCount: 3, reason: null },
        { family: "skills", enabled: true, availableToolCount: 4, reason: null },
      ],
      availableTools: [
        {
          name: "smartspec.gateway.models.list",
          family: "gateway",
          namespace: "gateway",
          toolGroup: "gateway_read",
          availability: "ready",
          reason: null,
        },
      ],
      experimentalTools: [],
      disabledTools: [],
      familyFlags: {
        browserEnabled: false,
        workspaceEnabled: false,
        driveEnabled: false,
        orchestratorEnabled: false,
      },
      operatorPolicy: {
        enabled: true,
        disabledFamilies: [],
        disabledToolGroups: [],
        approvalRequiredToolGroups: [],
      },
    },
    discovery: {
      openApiUrl: "/v1/openapi.json",
      docsUrl: "/v1/docs",
      catalogUrl: "/v1/mcp/catalog",
      manifestPath: "/api/worker-jobs/job-1/delegated-manifest",
      recommendedAuthMode: "bearer",
      routeHints: [],
    },
    expiresAt: "2026-04-08T00:00:00.000Z",
  },
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
  mockAuditLog: vi.fn(),
}));

vi.mock("../../services/redis", () => ({
  getRedisClient: () => ({
    get: vi.fn(async (key: string) => mockRedisData[key] ?? null),
    set: vi.fn(async (key: string, value: string, _ex: string, _ttl: number) => {
      mockRedisData[key] = value;
      return "OK";
    }),
    expire: vi.fn(async () => 1),
    del: vi.fn(async (key: string) => {
      delete mockRedisData[key];
      return 1;
    }),
  }),
}));

vi.mock("../../services/auditLogger", () => ({
  auditLogger: {
    log: mockAuditLog,
  },
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

vi.mock("../../services/orchestratorRoomActionsService", () => ({
  promoteMessageToWorkItem: mockPromoteMessageToWorkItem,
  advanceWorkItemByAssistant: mockAdvanceWorkItemByAssistant,
  approveWorkItemByAssistant: mockApproveWorkItemByAssistant,
  requestWorkItemChangesByAssistant: mockRequestWorkItemChangesByAssistant,
}));

vi.mock("../../services/workerDelegationService", async () => {
  const actual = await vi.importActual<typeof import("../../services/workerDelegationService")>(
    "../../services/workerDelegationService",
  );
  return {
    ...actual,
    getDelegatedWorkerManifestBySessionId: vi.fn(async ({ delegatedSessionId }: { delegatedSessionId: string }) =>
      delegatedSessionId === "delegated-session-1" ? mockDelegatedManifest : null),
  };
});

// ---------------------------------------------------------------------------
// Test app factory
// ---------------------------------------------------------------------------

function makeApp(
  scopesOrAuth?: string[] | Record<string, any>,
  requestHeaders?: Record<string, string>,
) {
  const app = express();
  app.use(express.json());
  // Simulate apiKeyAuthMiddleware by setting req.auth before routes
  app.use((req: any, _res: any, next: any) => {
    const defaultScopes = [
      "mcp:read",
      "mcp:write",
      "skills:list",
      "skills:execute",
      "agencies:list",
      "agencies:invoke",
      "agency:tools:mcp",
      "media:generate",
      "presentations:create",
      "video_projects:create",
      "jobs:create",
      "jobs:read",
      "llm:chat",
    ];
    if (Array.isArray(scopesOrAuth)) {
      req.auth = {
        ok: true,
        mode: "api_key",
        sub: "1",
        userId: 1,
        tenantId: "tenant-1",
        apiKeyId: "key-1",
        scopes: scopesOrAuth,
      };
    } else {
      req.auth = scopesOrAuth ?? {
        ok: true,
        mode: "api_key",
        sub: "1",
        userId: 1,
        tenantId: "tenant-1",
        apiKeyId: "key-1",
        scopes: defaultScopes,
      };
    }
    if (requestHeaders) {
      for (const [key, value] of Object.entries(requestHeaders)) {
        req.headers[key.toLowerCase()] = value;
      }
    }
    next();
  });
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
  it("allows delegated worker callers to initialize an owner-bound MCP session", async () => {
    const delegatedWorkerApp = makeApp({
      ok: true,
      mode: "delegated_worker",
      sub: "worker-1",
      userId: 7,
      ownerUserId: 7,
      tenantId: "tenant-1",
      workerId: "worker-1",
      workerJobId: "job-1",
      delegatedSessionId: "delegated-session-1",
      runtimeType: "openclaw_gateway",
      scopes: ["mcp:read", "mcp:write"],
    });

    const res = await request(delegatedWorkerApp)
      .post("/v1/mcp")
      .send({
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } },
        id: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.result.protocolVersion).toBe("2025-03-26");
    const sessionId = res.headers["mcp-session-id"];
    const stored = JSON.parse(mockRedisData[`mcp:session:${sessionId}`]);
    expect(stored.authMode).toBe("delegated_worker");
    expect(stored.ownerUserId).toBe(7);
    expect(stored.workerId).toBe("worker-1");
    expect(stored.delegatedSessionId).toBe("delegated-session-1");
  });

  it("limits delegated worker tools/list to granted MCP namespaces", async () => {
    const delegatedWorkerApp = makeApp({
      ok: true,
      mode: "delegated_worker",
      sub: "worker-1",
      userId: 7,
      ownerUserId: 7,
      tenantId: "tenant-1",
      workerId: "worker-1",
      workerJobId: "job-1",
      delegatedSessionId: "delegated-session-1",
      runtimeType: "openclaw_gateway",
      scopeProfile: "worker_gateway_hybrid_executor",
      scopes: ["mcp:read", "mcp:write", "llm:chat", "skills:list", "library:search", "rag:search"],
    });
    const sessionId = await initializeSession(delegatedWorkerApp);

    const res = await request(delegatedWorkerApp)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 });

    expect(res.status).toBe(200);
    const toolNames = res.body.result.tools.map((tool: any) => tool.name);
    expect(toolNames).toContain("smartspec.gateway.models.list");
    expect(toolNames).toContain("smartspec.knowledge.library.search");
    expect(toolNames).toContain("smartspec.skills.list");
    expect(toolNames).not.toContain("smartspec.workspace.read_file");
    expect(toolNames).not.toContain("smartspec.orchestrator.promote_message_to_work_item");
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "mcp_tool_call",
      metadata: expect.objectContaining({
        event: "tools_list",
        hiddenToolCount: expect.any(Number),
      }),
    }));
  });

  it("hides delegated MCP families disabled by operator policy", async () => {
    const previousDisabledFamilies = process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_DISABLED_FAMILIES;
    const previousScopes = [...mockDelegatedManifest.grantedScopes];
    const previousNamespaces = [...mockDelegatedManifest.allowedMcpNamespaces];
    const previousFamilies = [...mockDelegatedManifest.routeFamilies];
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_DISABLED_FAMILIES = "media";
    mockDelegatedManifest.grantedScopes = [...previousScopes, "media:generate"];
    mockDelegatedManifest.allowedMcpNamespaces = [...previousNamespaces, "media"];
    mockDelegatedManifest.routeFamilies = [...new Set([...previousFamilies, "media"])];

    try {
      const delegatedWorkerApp = makeApp({
        ok: true,
        mode: "delegated_worker",
        sub: "worker-1",
        userId: 7,
        ownerUserId: 7,
        tenantId: "tenant-1",
        workerId: "worker-1",
        workerJobId: "job-1",
        delegatedSessionId: "delegated-session-1",
        runtimeType: "openclaw_gateway",
        scopeProfile: "worker_gateway_hybrid_executor",
        scopes: mockDelegatedManifest.grantedScopes,
      });
      const sessionId = await initializeSession(delegatedWorkerApp);

      const res = await request(delegatedWorkerApp)
        .post("/v1/mcp")
        .set("Mcp-Session-Id", sessionId)
        .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 3 });

      expect(res.status).toBe(200);
      const toolNames = res.body.result.tools.map((tool: any) => tool.name);
      expect(toolNames).not.toContain("smartspec.media.generate_image");
      expect(toolNames).not.toContain("smartspec.media.generate_video");
    } finally {
      process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_DISABLED_FAMILIES = previousDisabledFamilies;
      mockDelegatedManifest.grantedScopes = previousScopes;
      mockDelegatedManifest.allowedMcpNamespaces = previousNamespaces;
      mockDelegatedManifest.routeFamilies = previousFamilies;
    }
  });

  it("hides all delegated MCP tools when delegated MCP is globally disabled by operator policy", async () => {
    const previousEnabled = process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED;
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = "false";

    try {
      const delegatedWorkerApp = makeApp({
        ok: true,
        mode: "delegated_worker",
        sub: "worker-1",
        userId: 7,
        ownerUserId: 7,
        tenantId: "tenant-1",
        workerId: "worker-1",
        workerJobId: "job-1",
        delegatedSessionId: "delegated-session-1",
        runtimeType: "openclaw_gateway",
        scopeProfile: "worker_gateway_hybrid_executor",
        scopes: mockDelegatedManifest.grantedScopes,
      });
      const sessionId = await initializeSession(delegatedWorkerApp);

      const res = await request(delegatedWorkerApp)
        .post("/v1/mcp")
        .set("Mcp-Session-Id", sessionId)
        .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 3 });

      expect(res.status).toBe(200);
      expect(res.body.result.tools).toEqual([]);
    } finally {
      process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_ENABLED = previousEnabled;
    }
  });

  it("hides delegated MCP tools for Hermes sessions that truthfully advertise MCP as unavailable", async () => {
    const previousRuntimeType = mockDelegatedManifest.runtimeType;
    const previousAvailability = { ...mockDelegatedManifest.availability };
    const previousMcp = structuredClone(mockDelegatedManifest.mcp);

    mockDelegatedManifest.runtimeType = "hermes_agent_gateway";
    mockDelegatedManifest.availability = {
      ...mockDelegatedManifest.availability,
      mcp: "unavailable",
    };
    mockDelegatedManifest.mcp = {
      ...mockDelegatedManifest.mcp,
      enabled: false,
      availableFamilies: [],
      families: [],
      availableTools: [],
      experimentalTools: [],
      disabledTools: [],
    };

    try {
      const delegatedWorkerApp = makeApp({
        ok: true,
        mode: "delegated_worker",
        sub: "worker-1",
        userId: 7,
        ownerUserId: 7,
        tenantId: "tenant-1",
        workerId: "worker-1",
        workerJobId: "job-1",
        delegatedSessionId: "delegated-session-1",
        runtimeType: "hermes_agent_gateway",
        scopeProfile: "worker_gateway_hybrid_executor",
        scopes: ["mcp:read", "mcp:write", "llm:chat"],
      });
      const sessionId = await initializeSession(delegatedWorkerApp);

      const res = await request(delegatedWorkerApp)
        .post("/v1/mcp")
        .set("Mcp-Session-Id", sessionId)
        .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 5 });

      expect(res.status).toBe(200);
      expect(res.body.result.tools).toEqual([]);
    } finally {
      mockDelegatedManifest.runtimeType = previousRuntimeType;
      mockDelegatedManifest.availability = previousAvailability;
      mockDelegatedManifest.mcp = previousMcp;
    }
  });

  it("denies delegated MCP tools that require approval by operator policy", async () => {
    const previousApprovalGroups = process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_APPROVAL_REQUIRED_TOOL_GROUPS;
    const previousScopes = [...mockDelegatedManifest.grantedScopes];
    const previousNamespaces = [...mockDelegatedManifest.allowedMcpNamespaces];
    const previousFamilies = [...mockDelegatedManifest.routeFamilies];
    process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_APPROVAL_REQUIRED_TOOL_GROUPS = "media_generation";
    mockDelegatedManifest.grantedScopes = [...previousScopes, "media:generate"];
    mockDelegatedManifest.allowedMcpNamespaces = [...previousNamespaces, "media"];
    mockDelegatedManifest.routeFamilies = [...new Set([...previousFamilies, "media"])];

    try {
      const delegatedWorkerApp = makeApp({
        ok: true,
        mode: "delegated_worker",
        sub: "worker-1",
        userId: 7,
        ownerUserId: 7,
        tenantId: "tenant-1",
        workerId: "worker-1",
        workerJobId: "job-1",
        delegatedSessionId: "delegated-session-1",
        runtimeType: "openclaw_gateway",
        scopeProfile: "worker_gateway_hybrid_executor",
        scopes: mockDelegatedManifest.grantedScopes,
      });
      const sessionId = await initializeSession(delegatedWorkerApp);

      const res = await request(delegatedWorkerApp)
        .post("/v1/mcp")
        .set("Mcp-Session-Id", sessionId)
        .send({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
            name: "smartspec.media.generate_image",
            arguments: { prompt: "robot pianist" },
          },
          id: 4,
        });

      expect(res.status).toBe(200);
      expect(res.body.error.code).toBe(-32603);
      expect(res.body.error.message).toBe("Internal error");
      expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        eventType: "mcp_tool_call",
        metadata: expect.objectContaining({
          event: "approval_required",
          toolName: "smartspec.media.generate_image",
          reason: "approval_required_by_operator_policy",
        }),
      }));
    } finally {
      process.env.OPENCLAW_EXTERNAL_RUNTIME_MCP_APPROVAL_REQUIRED_TOOL_GROUPS = previousApprovalGroups;
      mockDelegatedManifest.grantedScopes = previousScopes;
      mockDelegatedManifest.allowedMcpNamespaces = previousNamespaces;
      mockDelegatedManifest.routeFamilies = previousFamilies;
    }
  });

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
    expect(res.body.result.serverInfo.name).toBe("SmartAIHub");
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

  it("does not advertise placeholder smartspec.llm.* MCP tools", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 });

    const toolNames = res.body.result.tools.map((tool: any) => tool.name);
    expect(toolNames).not.toContain("smartspec.llm.chat");
    expect(toolNames).not.toContain("smartspec.llm.embed");
    expect(toolNames).not.toContain("smartspec.llm.models");
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
    expect(res.body.result.content[0].text).not.toContain("\"_meta\"");
    expect(res.body.result._meta.contextState.toolResults[0].content).toContain("workItem");
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

  it("requires mcp:read scope for bearer callers too", async () => {
    const res = await request(
      makeApp({
        ok: true,
        mode: "bearer",
        sub: "42",
        tenantId: "tenant-bearer",
        userId: 42,
        scopes: [],
      }),
    )
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

  it("normalizes bearer auth into a tenant-safe MCP session", async () => {
    const app = makeApp({
      ok: true,
      mode: "bearer",
      sub: "42",
      userId: 42,
      tenantId: "tenant-bearer",
      scopes: ["mcp:read", "mcp:write"],
    });
    const sessionId = await initializeSession(app);
    const stored = JSON.parse(mockRedisData[`mcp:session:${sessionId}`]);

    expect(stored.tenantId).toBe("tenant-bearer");
    expect(stored.userId).toBe(42);
    expect(stored.apiKeyId).toBeNull();
  });

  it("normalizes session auth into a tenant-safe MCP session", async () => {
    const app = makeApp({
      ok: true,
      mode: "session",
      sub: "7",
      user: { id: 7, currentTenantId: "tenant-session" },
      scopes: ["mcp:read", "mcp:write"],
    });
    const sessionId = await initializeSession(app);
    const stored = JSON.parse(mockRedisData[`mcp:session:${sessionId}`]);

    expect(stored.tenantId).toBe("tenant-session");
    expect(stored.userId).toBe(7);
    expect(stored.apiKeyId).toBeNull();
  });

  it("allows internal-style bearer sessions only with explicit tenant and user headers", async () => {
    const app = makeApp(
      {
        ok: true,
        mode: "bearer",
        sub: "internal",
        scopes: ["mcp:read", "mcp:write"],
      },
      {
        "x-tenant-id": "tenant-internal",
        "x-user-id": "91",
      },
    );
    const sessionId = await initializeSession(app);
    const stored = JSON.parse(mockRedisData[`mcp:session:${sessionId}`]);

    expect(stored.tenantId).toBe("tenant-internal");
    expect(stored.userId).toBe(91);
  });

  it("rejects internal-style bearer sessions without explicit tenant/user headers", async () => {
    const res = await request(
      makeApp({
        ok: true,
        mode: "bearer",
        sub: "internal",
        scopes: ["mcp:read", "mcp:write"],
      }),
    )
      .post("/v1/mcp")
      .send({
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } },
        id: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe(-32603);
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
    expect(res.body.error.message).toBe("Internal error");
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
    expect(res.body.name).toBe("SmartAIHub");
    expect(res.body.url).toBe("https://smartaihub.app/v1/mcp");
    expect(res.body.auth.type).toBe("bearer");
    expect(res.body.capabilities.tools).toBe(true);
    expect(res.body.docs).toBeDefined();
  });
});

describe("GET /v1/mcp/catalog", () => {
  it("returns the static machine-readable MCP catalog", async () => {
    const res = await request(makeApp()).get("/v1/mcp/catalog");

    expect(res.status).toBe(200);
    expect(res.body.canonicalEndpoint).toBe("/v1/mcp");
    expect(res.body.capabilities).toEqual(expect.objectContaining({
      tools: true,
      prompts: false,
      resources: false,
      toolsListChanged: false,
    }));
    expect(Array.isArray(res.body.tools)).toBe(true);
    expect(res.body.tools.some((tool: any) => tool.name === "smartspec.gateway.models.list")).toBe(true);
    expect(res.body.tools.find((tool: any) => tool.name === "smartspec.gateway.chat.create")?.toolGroup).toBe("gateway_generation");
    expect(res.body.operatorPolicy).toEqual(expect.objectContaining({
      enabled: expect.any(Boolean),
      disabledFamilies: expect.any(Array),
      disabledToolGroups: expect.any(Array),
      approvalRequiredToolGroups: expect.any(Array),
    }));
  });
});

// ---------------------------------------------------------------------------
// MCP Spec 2025-03-26 Compliance (section-05)
// ---------------------------------------------------------------------------

describe("MCP Spec Compliance — Batch requests", () => {
  it("batch request — array of 3 JSON-RPC requests returns array of 3 responses", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send([
        { jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 },
        { jsonrpc: "2.0", method: "tools/list", params: {}, id: 2 },
        { jsonrpc: "2.0", method: "ping", params: {}, id: 3 },
      ]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(3);
    expect(res.body[0].id).toBe(1);
    expect(res.body[1].id).toBe(2);
    expect(res.body[2].id).toBe(3);
  });

  it("single request (non-array) still works", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(false);
    expect(res.body.id).toBe(1);
    expect(res.body.result).toBeDefined();
  });

  it("batch with mixed valid/invalid — each processed independently", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send([
        { jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 },
        { jsonrpc: "2.0", method: "invalid_method", params: {}, id: 2 },
      ]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].result).toBeDefined();
    expect(res.body[1].error.code).toBe(-32601);
  });

  it("rejects batch exceeding MAX_BATCH_SIZE with -32600", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    // Create batch of 101 requests (over limit of 100)
    const batch = Array.from({ length: 101 }, (_, i) => ({
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
      id: i + 1,
    }));

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send(batch);

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe(-32600);
  });
});

describe("MCP Spec Compliance — Protocol version negotiation", () => {
  it("client sends supported version — server echoes it", async () => {
    const res = await request(makeApp())
      .post("/v1/mcp")
      .send({
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test" } },
        id: 1,
      });

    expect(res.body.result.protocolVersion).toBe("2025-03-26");
    expect(res.headers["mcp-session-id"]).toBeDefined();
  });

  it("client sends unsupported version — server returns its latest", async () => {
    const res = await request(makeApp())
      .post("/v1/mcp")
      .send({
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2020-01-01", capabilities: {}, clientInfo: { name: "test" } },
        id: 1,
      });

    expect(res.body.result.protocolVersion).toBe("2025-03-26");
    expect(res.headers["mcp-session-id"]).toBeDefined();
  });
});

describe("MCP Spec Compliance — notifications/initialized", () => {
  it("notifications/initialized accepted as no-op (no error)", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "notifications/initialized" });

    // Notifications have no id → no JSON-RPC response body expected
    expect(res.status).toBe(204);
  });
});

describe("MCP Spec Compliance — Session termination (DELETE)", () => {
  it("DELETE /v1/mcp with valid Mcp-Session-Id terminates session", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    // Verify session exists
    expect(mockRedisData[`mcp:session:${sessionId}`]).toBeDefined();

    // Terminate
    const del = await request(app)
      .delete("/v1/mcp")
      .set("Mcp-Session-Id", sessionId);

    expect(del.status).toBe(204);

    // Session should be deleted from Redis
    expect(mockRedisData[`mcp:session:${sessionId}`]).toBeUndefined();
  });

  it("subsequent request after session termination returns 404", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    // Terminate the session
    await request(app)
      .delete("/v1/mcp")
      .set("Mcp-Session-Id", sessionId);

    // Try to use the terminated session
    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 });

    expect(res.status).toBe(404);
  });
});

describe("MCP Spec Compliance — Expired session HTTP 404", () => {
  it("expired session returns HTTP 404, not JSON-RPC error in 200", async () => {
    const res = await request(makeApp())
      .post("/v1/mcp")
      .set("Mcp-Session-Id", "00000000-dead-beef-0000-000000000000")
      .send({ jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 });

    expect(res.status).toBe(404);
  });
});

describe("MCP Spec Compliance — ping method", () => {
  it("ping returns empty result", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send({ jsonrpc: "2.0", method: "ping", params: {}, id: 99 });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(99);
    expect(res.body.result).toEqual({});
  });
});

describe("MCP Spec Compliance — additional edge cases", () => {
  it("DELETE without Mcp-Session-Id header returns 204 (no-op)", async () => {
    const res = await request(makeApp()).delete("/v1/mcp");
    expect(res.status).toBe(204);
  });

  it("batch with notification excluded from response array", async () => {
    const app = makeApp();
    const sessionId = await initializeSession(app);

    const res = await request(app)
      .post("/v1/mcp")
      .set("Mcp-Session-Id", sessionId)
      .send([
        { jsonrpc: "2.0", method: "tools/list", params: {}, id: 1 },
        { jsonrpc: "2.0", method: "notifications/initialized" },
      ]);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Only the tools/list response — notification produces no entry
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe(1);
  });

  it("batch with multiple initialize calls is rejected", async () => {
    const res = await request(makeApp())
      .post("/v1/mcp")
      .send([
        { jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2025-03-26" }, id: 1 },
        { jsonrpc: "2.0", method: "initialize", params: { protocolVersion: "2025-03-26" }, id: 2 },
      ]);

    expect(res.status).toBe(200);
    expect(res.body.error.code).toBe(-32600);
    expect(res.body.error.message).toMatch(/at most one initialize/i);
  });

  it("DELETE with non-UUID session ID returns 204 without Redis call", async () => {
    const app = makeApp();
    const res = await request(app)
      .delete("/v1/mcp")
      .set("Mcp-Session-Id", "../other:key");

    expect(res.status).toBe(204);
    // The crafted key should NOT have been deleted from Redis
  });
});
