import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
      input: () => proc,
      use: () => proc,
    };
    return proc;
  };
  return {
    router: (routes: any) => routes,
    protectedProcedure: createProcedure(),
    adminProcedure: createProcedure(),
    publicProcedure: createProcedure(),
  };
});

vi.mock("../../_core/rateLimitedProcedure", () => ({
  createRateLimitMiddleware: () => vi.fn((_: any) => _.next()),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: vi.fn().mockResolvedValue(true),
  setTenantFeatureFlag: vi.fn(),
}));

vi.mock("../../services/agencyBridge", () => ({
  agencyBridge: {
    executeRun: vi.fn(),
    cancelRun: vi.fn(),
    listRuns: vi.fn(),
    getRunDetails: vi.fn(),
  },
}));

vi.mock("../../services/agencyCommitService", () => ({
  AgencyPreviewCommitError: class extends Error {},
  commitLibraryBackedPreview: vi.fn(),
}));

vi.mock("../../services/agencyDeckCommitService", () => ({
  commitPresentationPreview: vi.fn(),
}));

vi.mock("../../services/agencyExperienceTemplateService", () => ({
  ensureBuiltInAgencyExperienceTemplates: vi.fn().mockResolvedValue(undefined),
  resolveAgencyRetrievalScope: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../services/agencyPreviewLifecycleService", () => ({
  expireRunPreviewArtifacts: vi.fn().mockResolvedValue(0),
  recordAgencyPreviewMetric: vi.fn(),
}));

vi.mock("../../services/taskPlannerMiddleware", () => ({
  runPlanner: vi.fn(),
  recordStepAttempt: vi.fn(),
}));

vi.mock("../../services/agencyEscalation", () => ({
  buildAgencyTaskMetadata: vi.fn(),
}));

vi.mock("../../services/agencyPreviewService", () => ({
  buildAgencyPreview: vi.fn(),
}));

vi.mock("../../lib/agencySvgGenerator", () => ({
  generateAgencySvg: vi.fn(),
}));

vi.mock("../../services/notificationService", () => ({
  createNotification: vi.fn(),
}));

vi.mock("../../services/agencyResultRouter", () => ({
  parseAndRouteAgencyResult: vi.fn(),
}));

// --- Core DB and crypto mocks ---
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbDelete = vi.fn();
const mockDbTransaction = vi.fn();

vi.mock("../../db", () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
    insert: (...args: any[]) => mockDbInsert(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
    delete: (...args: any[]) => mockDbDelete(...args),
    transaction: (...args: any[]) => mockDbTransaction(...args),
  },
}));

vi.mock("../../../drizzle/schema", () => {
  const table = (cols: string[]) => {
    const t: any = {};
    for (const c of cols) t[c] = c;
    return t;
  };
  return {
    agencies: table(["id", "tenantId", "name", "slug", "description", "systemPrompt", "creditMultiplier", "maxAgents", "maxRunTimeSeconds", "isFallbackSafe", "status", "isPublished", "createdBy", "createdAt", "updatedAt", "sourceTemplateId"]),
    agencyAgents: table(["id", "agencyId", "name", "description", "instructions", "model", "modelSettings", "isEntryPoint", "isOptional", "position", "createdAt", "nodeType", "nodeConfig"]),
    agencyAgentTools: table(["id", "agentId", "toolId", "createdAt", "toolConfig"]),
    agencyCommunicationFlows: table(["id", "agencyId", "fromAgentId", "toAgentId", "flowType", "createdAt"]),
    agencyConversations: table(["id", "agencyId", "userId", "title", "totalCreditsUsed", "messageCount", "isArchived", "createdAt", "updatedAt"]),
    agencyRunArtifacts: table(["id", "runId", "agencyId", "conversationId", "agentId", "artifactType", "status", "data", "createdAt", "tenantId"]),
    agencyTools: table(["id", "tenantId", "name", "description", "toolType", "config", "riskLevel", "requiresApproval", "inputSchema", "outputSchema", "httpMethod", "headersEncrypted", "retryPolicy", "icon", "category", "version", "isExposedAsApi", "strictSchema", "oneCallAtATime", "isEnabled", "createdAt", "updatedAt"]),
    agencyVersions: table(["id", "agencyId", "version", "snapshot", "createdBy", "changeNote", "createdAt"]),
    agencyPermissions: table(["id", "agencyId", "userId", "groupId", "permissionLevel", "createdAt"]),
    userGroups: table(["id", "tenantId", "name"]),
    users: table(["id", "email", "role", "tenantId"]),
    systemSettings: table(["id", "category", "key", "value", "tenantId"]),
  };
});

const mockEncrypt = vi.fn().mockReturnValue("encrypted:iv:tag:cipher");
const mockDecrypt = vi.fn().mockReturnValue('{"Authorization":"Bearer test"}');

vi.mock("../../services/crypto", () => ({
  encrypt: (...args: any[]) => mockEncrypt(...args),
  decrypt: (...args: any[]) => mockDecrypt(...args),
}));

vi.mock("../../services/ssrfValidator", () => ({
  validateSsrfUrl: (url: string) => {
    if (url.includes("169.254") || url.includes("10.0.0") || url.includes("127.0.0") || url.includes("192.168")) {
      throw new Error(`SSRF validation failed: blocked host`);
    }
  },
}));

// ── Import router after mocks ───────────────────────────────────────────────

const ctx = {
  user: { id: "user-1", email: "test@example.com", role: "admin", tenantId: "tenant-1" },
  tenantId: "tenant-1",
};

function setupDbChain() {
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    returning: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };
  return chain;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("OpenAPI Import procedures", () => {
  let agencyRouter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "development";
    const mod = await import("../agency");
    agencyRouter = mod.agencyRouter;
  });

  describe("importOpenAPITools", () => {
    it("parses valid spec and returns previews", async () => {
      const handler = agencyRouter.importOpenAPITools;
      const spec = JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        servers: [{ url: "https://api.example.com" }],
        paths: {
          "/pets": {
            get: { operationId: "listPets", summary: "List pets" },
            post: { operationId: "createPet", summary: "Create pet" },
          },
          "/pets/{id}": {
            get: { operationId: "getPet", summary: "Get pet" },
          },
        },
      });

      const result = await handler({ input: { specContent: spec, specFormat: "json" }, ctx });
      expect(result.previews).toHaveLength(3);
      expect(result.baseUrl).toBe("https://api.example.com");
      expect(result.previews[0]).toHaveProperty("name");
      expect(result.previews[0]).toHaveProperty("httpMethod");
      expect(result.previews[0]).toHaveProperty("path");
      expect(result.previews[0]).toHaveProperty("inputSchema");
    });

    it("rejects spec >500KB via validation", async () => {
      const handler = agencyRouter.importOpenAPITools;
      const largeSpec = "x".repeat(501_000);

      await expect(
        handler({ input: { specContent: largeSpec, specFormat: "json" }, ctx }),
      ).rejects.toThrow();
    });

    it("validates baseUrl override with SSRF check", async () => {
      const handler = agencyRouter.importOpenAPITools;
      const spec = JSON.stringify({
        openapi: "3.0.3",
        info: { title: "Test", version: "1.0" },
        paths: { "/test": { get: { operationId: "test" } } },
      });

      await expect(
        handler({
          input: { specContent: spec, specFormat: "json", baseUrl: "http://10.0.0.1/api" },
          ctx,
        }),
      ).rejects.toThrow(/SSRF/);
    });
  });

  describe("confirmOpenAPIImport", () => {
    const selectedTools = [
      { name: "listPets", description: "List pets", httpMethod: "GET", path: "/pets", inputSchema: { type: "object" } },
      { name: "createPet", description: "Create pet", httpMethod: "POST", path: "/pets", inputSchema: { type: "object" } },
      { name: "getPet", description: "Get pet", httpMethod: "GET", path: "/pets/{id}", inputSchema: { type: "object" } },
    ];

    it("bulk creates tools from selected previews", async () => {
      const handler = agencyRouter.confirmOpenAPIImport;

      const selectChain = setupDbChain();
      selectChain.where.mockResolvedValue([{ count: 0 }]);
      mockDbSelect.mockReturnValue(selectChain);

      let insertedValues: any[] = [];
      const insertChain = setupDbChain();
      insertChain.values = vi.fn((vals: any[]) => {
        insertedValues = vals;
        return insertChain;
      });
      mockDbInsert.mockReturnValue(insertChain);

      const result = await handler({
        input: { selectedTools, baseUrl: "https://api.example.com" },
        ctx,
      });

      expect(result.created).toBe(3);
      expect(result.toolIds).toHaveLength(3);
      expect(insertedValues).toHaveLength(3);
      expect(insertedValues[0].toolType).toBe("openapi_import");
      expect(insertedValues[0].tenantId).toBe("tenant-1");
      expect(insertedValues[0].isEnabled).toBe(true);
      expect(insertedValues[0].headersEncrypted).toBeNull();
    });

    it("rejects if total tools would exceed 50-tool cap", async () => {
      const handler = agencyRouter.confirmOpenAPIImport;

      const selectChain = setupDbChain();
      selectChain.where.mockResolvedValue([{ count: 48 }]);
      mockDbSelect.mockReturnValue(selectChain);

      const fiveTools = Array.from({ length: 5 }, (_, i) => ({
        name: `tool${i}`,
        description: `Tool ${i}`,
        httpMethod: "GET",
        path: `/path${i}`,
        inputSchema: { type: "object" },
      }));

      await expect(
        handler({
          input: { selectedTools: fiveTools, baseUrl: "https://api.example.com" },
          ctx,
        }),
      ).rejects.toThrow(/50 tool limit/);
    });

    it("encrypts API key header before storage", async () => {
      const handler = agencyRouter.confirmOpenAPIImport;

      const selectChain = setupDbChain();
      selectChain.where.mockResolvedValue([{ count: 0 }]);
      mockDbSelect.mockReturnValue(selectChain);

      const insertChain = setupDbChain();
      mockDbInsert.mockReturnValue(insertChain);

      await handler({
        input: {
          selectedTools: [selectedTools[0]],
          baseUrl: "https://api.example.com",
          apiKey: "sk-test-key-123",
        },
        ctx,
      });

      expect(mockEncrypt).toHaveBeenCalledWith(
        JSON.stringify({ Authorization: "Bearer sk-test-key-123" }),
      );
    });

    it("sets toolType to 'openapi_import' on created tools", async () => {
      const handler = agencyRouter.confirmOpenAPIImport;

      const selectChain = setupDbChain();
      selectChain.where.mockResolvedValue([{ count: 0 }]);
      mockDbSelect.mockReturnValue(selectChain);

      let insertedValues: any[] = [];
      const insertChain = setupDbChain();
      insertChain.values = vi.fn((vals: any[]) => {
        insertedValues = vals;
        return insertChain;
      });
      mockDbInsert.mockReturnValue(insertChain);

      await handler({
        input: { selectedTools: [selectedTools[0]], baseUrl: "https://api.example.com" },
        ctx,
      });

      expect(insertedValues).toHaveLength(1);
      expect(insertedValues[0].toolType).toBe("openapi_import");
    });
  });
});
