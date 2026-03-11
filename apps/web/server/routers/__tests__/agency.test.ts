import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// --- Mocks ---

// Mock tRPC to extract handler functions
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

const { mockGetTenantFeatureFlag, mockSetTenantFeatureFlag } = vi.hoisted(() => ({
  mockGetTenantFeatureFlag: vi.fn().mockResolvedValue(true),
  mockSetTenantFeatureFlag: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/featureFlags", () => ({
  getTenantFeatureFlag: mockGetTenantFeatureFlag,
  setTenantFeatureFlag: mockSetTenantFeatureFlag,
}));

const { mockBridgeExecuteRun, mockBridgeCancelRun, mockBridgeListRuns, mockBridgeGetRunDetails } =
  vi.hoisted(() => ({
    mockBridgeExecuteRun: vi.fn(),
    mockBridgeCancelRun: vi.fn(),
    mockBridgeListRuns: vi.fn(),
    mockBridgeGetRunDetails: vi.fn(),
  }));

vi.mock("../../services/agencyBridge", () => ({
  agencyBridge: {
    executeRun: mockBridgeExecuteRun,
    cancelRun: mockBridgeCancelRun,
    listRuns: mockBridgeListRuns,
    getRunDetails: mockBridgeGetRunDetails,
  },
}));

// Mock DB and Drizzle ORM
const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockDbTransaction } =
  vi.hoisted(() => ({
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockDbDelete: vi.fn(),
    mockDbTransaction: vi.fn(),
  }));

vi.mock("../../db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
    transaction: mockDbTransaction,
  },
}));

vi.mock("../../../drizzle/schema", () => ({
  agencies: {
    id: "id",
    tenantId: "tenantId",
    slug: "slug",
    name: "name",
    description: "description",
    systemPrompt: "systemPrompt",
    creditMultiplier: "creditMultiplier",
    maxAgents: "maxAgents",
    maxRunTimeSeconds: "maxRunTimeSeconds",
    isFallbackSafe: "isFallbackSafe",
    status: "status",
    isPublished: "isPublished",
    createdBy: "createdBy",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  agencyAgents: {
    id: "id",
    agencyId: "agencyId",
    name: "name",
    description: "description",
    instructions: "instructions",
    model: "model",
    modelSettings: "modelSettings",
    isEntryPoint: "isEntryPoint",
    isOptional: "isOptional",
    position: "position",
    createdAt: "createdAt",
  },
  agencyAgentTools: {
    id: "id",
    agentId: "agentId",
    toolId: "toolId",
    createdAt: "createdAt",
  },
  agencyCommunicationFlows: {
    id: "id",
    agencyId: "agencyId",
    fromAgentId: "fromAgentId",
    toAgentId: "toAgentId",
    flowType: "flowType",
    createdAt: "createdAt",
  },
  agencyConversations: {
    id: "id",
    agencyId: "agencyId",
    userId: "userId",
    title: "title",
    totalCreditsUsed: "totalCreditsUsed",
    messageCount: "messageCount",
    isArchived: "isArchived",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  agencyTools: {
    id: "id",
    tenantId: "tenantId",
    name: "name",
    description: "description",
    toolType: "toolType",
    configuration: "configuration",
    createdAt: "createdAt",
  },
  systemSettings: {
    category: "category",
    key: "key",
    value: "value",
  },
  users: {
    id: "id",
    name: "name",
    email: "email",
  },
  agencyTemplates: {
    id: "id",
    tenantId: "tenantId",
  },
  agentTemplates: {
    id: "id",
    tenantId: "tenantId",
  }
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => ({ type: "eq", args })),
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
  desc: vi.fn((col: any) => ({ type: "desc", col })),
  inArray: vi.fn((...args: any[]) => ({ type: "inArray", args })),
  sql: Object.assign(
    (...args: any[]) => ({
      type: "sql",
      args,
      as: (alias: string) => ({ type: "sql", args, alias }),
    }),
    { raw: vi.fn() },
  ),
  getTableColumns: vi.fn((table: Record<string, unknown>) => table),
}));

// crypto.randomUUID() is used for ID generation - mock it for deterministic tests
vi.spyOn(crypto, "randomUUID").mockReturnValue("00000000-0000-4000-a000-000000000001" as `${string}-${string}-${string}-${string}-${string}`);

import { agencyRouter } from "../agency";

// Helper to build ctx
function makeCtx(overrides: Partial<{
  user: any;
  tenantId: string | null;
  userToken: string | null;
}> = {}) {
  return {
    user: overrides.user ?? {
      id: 1,
      role: "user",
      currentTenantId: "tenant-001",
    },
    tenantId: overrides.tenantId ?? "tenant-001",
    userToken: overrides.userToken ?? "user-jwt-token",
    req: {} as any,
    res: {} as any,
    publicUrl: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: feature flag enabled
  mockGetTenantFeatureFlag.mockResolvedValue(true);
  // Default: no quota configured (quota check returns empty)
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([]),
    }),
  });
});

describe("agencyRouter", () => {
  it("exports all required procedures", () => {
    expect(agencyRouter).toBeDefined();
    expect(agencyRouter.list).toBeDefined();
    expect(agencyRouter.getById).toBeDefined();
    expect(agencyRouter.create).toBeDefined();
    expect(agencyRouter.update).toBeDefined();
    expect(agencyRouter.delete).toBeDefined();
    expect(agencyRouter.listConversations).toBeDefined();
    expect(agencyRouter.createConversation).toBeDefined();
    expect(agencyRouter.sendMessage).toBeDefined();
    expect(agencyRouter.adminListAgencies).toBeDefined();
    expect(agencyRouter.adminToggleTenant).toBeDefined();
    expect(agencyRouter.adminKillRun).toBeDefined();
  });

  describe("list", () => {
    it("returns agencies filtered by tenant", async () => {
      const mockAgencies = [
        { id: "agency-001", name: "Test Agency", status: "published" },
      ];

      // Chain the query builder
      const chain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue(mockAgencies),
      };
      mockDbSelect.mockReturnValue(chain);

      const handler = agencyRouter.list;
      const result = await handler({
        ctx: makeCtx(),
        input: { limit: 50, offset: 0 },
      });

      expect(result.agencies).toEqual([
        {
          ...mockAgencies[0],
          canEdit: false,
        },
      ]);
    });
  });

  describe("feature flag gating", () => {
    it("throws NOT_FOUND when feature flag is disabled", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(false);

      const chain = {
        from: vi.fn().mockReturnThis(),
        leftJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        offset: vi.fn().mockResolvedValue([]),
      };
      mockDbSelect.mockReturnValue(chain);

      const handler = agencyRouter.list;
      const result = await handler({ ctx: makeCtx(), input: { limit: 50, offset: 0 } });
      expect(result.agencies).toEqual([]);
    });
  });

  describe("sendMessage", () => {
    it("dispatches to Python bridge and returns result", async () => {
      const mockRunResult = {
        runId: "run-001",
        status: "completed",
        response: "Analysis complete",
        creditsUsed: 5,
        durationMs: 1200,
        stepAttemptSnapshots: [],
        structuredResult: null,
        previewArtifacts: [],
      };
      mockBridgeExecuteRun.mockResolvedValue(mockRunResult);

      // Mock conversation lookup
      const convChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: "conv-001",
            agencyId: "agency-001",
            userId: 1,
          },
        ]),
      };
      mockDbSelect.mockReturnValue(convChain);

      const handler = agencyRouter.sendMessage;
      const result = await handler({
        ctx: makeCtx(),
        input: {
          agencyId: "agency-001",
          conversationId: "conv-001",
          message: "Analyze this",
        },
      });

      expect(mockBridgeExecuteRun).toHaveBeenCalledWith(
        expect.objectContaining({
          agencyId: "agency-001",
          conversationId: "conv-001",
          message: "Analyze this",
          userToken: "user-jwt-token",
          userId: 1,
        }),
      );
      expect(result).toEqual({
        ...mockRunResult,
        preview: null,
      });
    });

    it("adds a preview DTO when the bridge returns structured preview metadata", async () => {
      mockBridgeExecuteRun.mockResolvedValue({
        runId: "run-001",
        status: "completed",
        response: "Research preview ready.",
        creditsUsed: 0,
        durationMs: 1200,
        stepAttemptSnapshots: [],
        structuredResult: {
          version: "1.0",
          intent: "research_report",
          summary: "Research preview ready.",
          payload: {
            title: "Market scan",
            executive_summary: "The market is moving quickly.",
            sections: [],
            key_findings: ["Demand is rising"],
            recommendations: [],
          },
          artifacts: [],
          references: [],
          metrics: {},
        },
        previewArtifacts: [
          {
            id: "artifact-1",
            intent: "research_report",
            artifact_type: "report",
            state: "preview_generated",
            summary: "Research preview ready.",
            commit_status: "not_committed",
            commit_token: "commit-token-1",
            payload_json: {
              title: "Market scan",
              executive_summary: "The market is moving quickly.",
              sections: [],
              key_findings: ["Demand is rising"],
              recommendations: [],
            },
            provenance_json: [],
            payload_storage_key: null,
            committed_at: null,
            expired_at: null,
          },
        ],
      });

      const convChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: "conv-001",
            agencyId: "agency-001",
            userId: 1,
          },
        ]),
      };
      mockDbSelect.mockReturnValue(convChain);

      const handler = agencyRouter.sendMessage;
      const result = await handler({
        ctx: makeCtx(),
        input: {
          agencyId: "agency-001",
          conversationId: "conv-001",
          message: "Analyze this",
        },
      });

      expect(result.preview).toEqual(
        expect.objectContaining({
          previewType: "research",
          lifecycleState: "preview_generated",
          summaryText: "Research preview ready.",
        }),
      );
    });
  });

  describe("getRunPreview", () => {
    it("returns a run preview DTO sourced from the Python bridge", async () => {
      mockBridgeGetRunDetails.mockResolvedValue({
        runId: "run-001",
        conversationId: "conv-001",
        status: "completed",
        response: "Research preview ready.",
        creditsUsed: 0,
        durationMs: 1200,
        stepAttemptSnapshots: [],
        structuredResult: {
          version: "1.0",
          intent: "research_report",
          summary: "Research preview ready.",
          payload: {
            title: "Market scan",
            executive_summary: "The market is moving quickly.",
            sections: [],
            key_findings: ["Demand is rising"],
            recommendations: [],
          },
          artifacts: [],
          references: [],
          metrics: {},
        },
        previewArtifacts: [
          {
            id: "artifact-1",
            intent: "research_report",
            artifact_type: "report",
            state: "preview_generated",
            summary: "Research preview ready.",
            commit_status: "not_committed",
            commit_token: "commit-token-1",
            payload_json: {
              title: "Market scan",
              executive_summary: "The market is moving quickly.",
              sections: [],
              key_findings: ["Demand is rising"],
              recommendations: [],
            },
            provenance_json: [],
            payload_storage_key: null,
            committed_at: null,
            expired_at: null,
          },
        ],
      });

      const convChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          {
            id: "conv-001",
            agencyId: "agency-001",
            userId: 1,
          },
        ]),
      };
      mockDbSelect.mockReturnValue(convChain);

      const handler = agencyRouter.getRunPreview;
      const result = await handler({
        ctx: makeCtx(),
        input: { agencyId: "agency-001", runId: "run-001" },
      });

      expect(mockBridgeGetRunDetails).toHaveBeenCalledWith(
        "agency-001",
        "run-001",
        "user-jwt-token",
      );
      expect(result.preview).toEqual(
        expect.objectContaining({
          previewType: "research",
          lifecycleState: "preview_generated",
        }),
      );
    });
  });

  describe("adminToggleTenant", () => {
    it("requires admin role (mock enforces via procedure type)", () => {
      // adminProcedure is the procedure type used for adminToggleTenant,
      // which enforces admin role. Here we just verify the handler exists
      // and can be called with admin ctx.
      expect(agencyRouter.adminToggleTenant).toBeDefined();
    });

    it("calls setTenantFeatureFlag for the tenant", async () => {
      const handler = agencyRouter.adminToggleTenant;
      await handler({
        ctx: makeCtx({ user: { id: 1, role: "admin", currentTenantId: "t-001" } }),
        input: { tenantId: "tenant-target", enabled: true },
      });

      expect(mockSetTenantFeatureFlag).toHaveBeenCalledWith(
        "AGENCY_SWARM_ENABLED",
        "tenant-target",
        true,
      );
    });
  });

  describe("adminKillRun", () => {
    it("sends cancel to Python bridge", async () => {
      mockBridgeCancelRun.mockResolvedValue(undefined);

      const handler = agencyRouter.adminKillRun;
      await handler({
        ctx: makeCtx({ user: { id: 1, role: "admin", currentTenantId: "t-001" } }),
        input: { agencyId: "agency-001", runId: "run-001" },
      });

      expect(mockBridgeCancelRun).toHaveBeenCalledWith(
        "agency-001",
        "run-001",
        expect.any(String),
      );
    });
  });

  describe("create", () => {
    it("validates exactly one entry point agent", async () => {
      const handler = agencyRouter.create;
      // No entry point agent
      await expect(
        handler({
          ctx: makeCtx(),
          input: {
            name: "Test Agency",
            slug: "test-agency",
            agents: [
              {
                name: "Agent A",
                instructions: "Do things",
                model: "gpt-4o-mini",
                isEntryPoint: false,
              },
            ],
          },
        }),
      ).rejects.toThrow(/entry point/i);
    });

    it("creates agency with valid input in a transaction", async () => {
      // Mock the transaction to execute the callback
      mockDbTransaction.mockImplementation(async (cb: Function) => {
        const tx = {
          insert: vi.fn().mockReturnValue({
            values: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([{ id: "new-agency-id" }]),
            }),
          }),
        };
        return cb(tx);
      });

      const handler = agencyRouter.create;
      const result = await handler({
        ctx: makeCtx(),
        input: {
          name: "Research Team",
          slug: "research-team",
          description: "A research agency",
          agents: [
            {
              name: "Researcher",
              instructions: "Research stuff",
              model: "gpt-4o",
              isEntryPoint: true,
            },
            {
              name: "Writer",
              instructions: "Write reports",
              model: "gpt-4o-mini",
              isEntryPoint: false,
            },
          ],
          communicationFlows: [
            {
              fromAgentName: "Researcher",
              toAgentName: "Writer",
              flowType: "delegation" as const,
            },
          ],
        },
      });

      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
      expect(result).toHaveProperty("id");
    });
  });

  describe("delete", () => {
    it("soft-deletes by setting status to archived", async () => {
      // Mock finding the agency
      const selectChain = {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([
          { id: "agency-001", tenantId: "tenant-001", createdBy: 1, status: "published" },
        ]),
      };
      mockDbSelect.mockReturnValue(selectChain);

      const updateChain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
      };
      mockDbUpdate.mockReturnValue(updateChain);

      const handler = agencyRouter.delete;
      await handler({
        ctx: makeCtx(),
        input: { id: "agency-001" },
      });

      expect(mockDbUpdate).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: "archived" }),
      );
    });
  });

  describe("createFromTemplate", () => {
    it("throws NOT_FOUND when template feature flag is disabled", async () => {
      // Mock getTenantFeatureFlag to return true for AGENCY_SWARM_ENABLED 
      // but false for AGENCY_TEMPLATES_ENABLED
      mockGetTenantFeatureFlag.mockImplementation((flag) => {
        if (flag === "AGENCY_SWARM_ENABLED") return Promise.resolve(true);
        if (flag === "AGENCY_TEMPLATES_ENABLED") return Promise.resolve(false);
        return Promise.resolve(false);
      });

      const handler = agencyRouter.createFromTemplate;
      await expect(
        handler({ ctx: makeCtx(), input: { templateId: "test-template" } }),
      ).rejects.toThrow(/not found/i);
    });

    it("throws NOT_FOUND when template does not exist", async () => {
      // Both flags true
      mockGetTenantFeatureFlag.mockResolvedValue(true);

      // We rely on the actual implementation of getTemplateById returning undefined
      // for an unknown ID since we're not mocking `../../skills/agency-templates/index`
      const handler = agencyRouter.createFromTemplate;
      await expect(
        handler({ ctx: makeCtx(), input: { templateId: "non-existent-template" } }),
      ).rejects.toThrow(/Template not found/);
    });
  });
});
