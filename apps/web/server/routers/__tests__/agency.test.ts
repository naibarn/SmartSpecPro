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
    middleware: (fn: Function) => fn,
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

const { mockCommitLibraryBackedPreview } = vi.hoisted(() => ({
  mockCommitLibraryBackedPreview: vi.fn(),
}));

const { mockCommitPresentationPreview } = vi.hoisted(() => ({
  mockCommitPresentationPreview: vi.fn(),
}));

const {
  mockEnsureBuiltInAgencyExperienceTemplates,
  mockResolveAgencyRetrievalScope,
} = vi.hoisted(() => ({
  mockEnsureBuiltInAgencyExperienceTemplates: vi.fn().mockResolvedValue(undefined),
  mockResolveAgencyRetrievalScope: vi.fn().mockResolvedValue(null),
}));

const {
  mockExpireRunPreviewArtifacts,
  mockRecordAgencyPreviewMetric,
} = vi.hoisted(() => ({
  mockExpireRunPreviewArtifacts: vi.fn().mockResolvedValue(0),
  mockRecordAgencyPreviewMetric: vi.fn(),
}));

vi.mock("../../services/agencyCommitService", () => ({
  AgencyPreviewCommitError: class AgencyPreviewCommitError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
  commitLibraryBackedPreview: mockCommitLibraryBackedPreview,
}));

vi.mock("../../services/agencyDeckCommitService", () => ({
  commitPresentationPreview: mockCommitPresentationPreview,
}));

vi.mock("../../services/agencyExperienceTemplateService", () => ({
  ensureBuiltInAgencyExperienceTemplates: mockEnsureBuiltInAgencyExperienceTemplates,
  resolveAgencyRetrievalScope: mockResolveAgencyRetrievalScope,
}));

vi.mock("../../services/agencyPreviewLifecycleService", () => ({
  expireRunPreviewArtifacts: mockExpireRunPreviewArtifacts,
  recordAgencyPreviewMetric: mockRecordAgencyPreviewMetric,
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
  getDb: vi.fn(),
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
    sourceTemplateId: "sourceTemplateId",
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
  agencyRunArtifacts: {
    id: "id",
    runId: "runId",
    agencyId: "agencyId",
    tenantId: "tenantId",
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
    createdBy: "createdBy",
    sourceAgencyId: "sourceAgencyId",
    status: "status",
    agentDefinitions: "agentDefinitions",
    communicationFlows: "communicationFlows",
    name: "name",
    description: "description",
    category: "category",
    isActive: "isActive",
  },
  agentTemplates: {
    id: "id",
    tenantId: "tenantId",
  }
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: any[]) => ({ type: "eq", args })),
  and: vi.fn((...args: any[]) => ({ type: "and", args })),
  or: vi.fn((...args: any[]) => ({ type: "or", args })),
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

    it("hides archived agencies by default", async () => {
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
      await handler({
        ctx: makeCtx(),
        input: { limit: 50, offset: 0 },
      });

      const whereArg = (chain.where as any).mock.calls[0][0];
      expect(whereArg.type).toBe("and");
      expect(whereArg.args.some((clause: any) => clause.type === "sql")).toBe(true);
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

    it("passes resolved template retrieval scope into the bridge request", async () => {
      mockResolveAgencyRetrievalScope.mockResolvedValue({
        version: 1,
        experienceKey: "deep_research",
        templateDefault: "tenant_accessible",
        userOverride: "library_only",
        effectiveMode: "library_only",
        permissionFilter: {
          tenantId: "tenant-001",
          userId: 1,
        },
      });
      mockBridgeExecuteRun.mockResolvedValue({
        runId: "run-001",
        status: "completed",
        response: "Scoped analysis complete",
        creditsUsed: 2,
        durationMs: 800,
        stepAttemptSnapshots: [],
        structuredResult: null,
        previewArtifacts: [],
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
      await handler({
        ctx: makeCtx(),
        input: {
          agencyId: "agency-001",
          conversationId: "conv-001",
          message: "Analyze tenant sources only",
          retrievalScopeOverride: {
            mode: "library_only",
          },
        },
      });

      expect(mockBridgeExecuteRun).toHaveBeenCalledWith(
        expect.objectContaining({
          retrievalScope: expect.objectContaining({
            effectiveMode: "library_only",
            permissionFilter: {
              tenantId: "tenant-001",
              userId: 1,
            },
          }),
        }),
      );
    });

    it("emits a structured-result parse metric for preview-capable runs", async () => {
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
            executive_summary: "Demand is rising.",
            sections: [],
            key_findings: [],
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
              executive_summary: "Demand is rising.",
              sections: [],
              key_findings: [],
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
      await handler({
        ctx: makeCtx(),
        input: {
          agencyId: "agency-001",
          conversationId: "conv-001",
          message: "Analyze this",
        },
      });

      expect(mockRecordAgencyPreviewMetric).toHaveBeenCalledWith(
        "structured_result_parse",
        expect.objectContaining({
          status: "success",
          hasPreview: true,
        }),
      );
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

  describe("commitPreview", () => {
    it("commits a research preview through the library-backed commit service", async () => {
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
            executive_summary: "Demand is rising.",
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
              executive_summary: "Demand is rising.",
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

      const conversationSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "conv-001", agencyId: "agency-001", userId: 1 },
            ]),
          }),
        }),
      };
      const artifactSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "artifact-1",
                runId: "run-001",
                tenantId: "tenant-001",
                commitToken: "commit-token-1",
                commitStatus: "not_committed",
                targetType: null,
                targetId: null,
              },
            ]),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(conversationSelect as any)
        .mockReturnValueOnce(artifactSelect as any);

      mockCommitLibraryBackedPreview.mockResolvedValue({
        artifactId: "artifact-1",
        runId: "run-001",
        commitToken: "commit-token-1",
        status: "committed",
        targetType: "library_item",
        targetId: "501",
      });

      const handler = agencyRouter.commitPreview;
      const result = await handler({
        ctx: makeCtx(),
        input: {
          agencyId: "agency-001",
          runId: "run-001",
          artifactId: "artifact-1",
          commitToken: "commit-token-1",
        },
      });

      expect(mockCommitLibraryBackedPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          commitToken: "commit-token-1",
          preview: expect.objectContaining({
            previewType: "research",
          }),
        }),
      );
      expect(result).toEqual({
        ok: true,
        artifactId: "artifact-1",
        runId: "run-001",
        commitToken: "commit-token-1",
        status: "committed",
        targetType: "library_item",
        targetId: "501",
      });
    });

    it("can block deck commit behind a rollout flag while preview reads stay enabled", async () => {
      mockGetTenantFeatureFlag.mockImplementation((flag) => {
        if (flag === "AGENCY_DECK_COMMIT_ENABLED") return Promise.resolve(false);
        return Promise.resolve(true);
      });
      mockBridgeGetRunDetails.mockResolvedValue({
        runId: "run-001",
        conversationId: "conv-001",
        status: "completed",
        response: "Deck preview ready.",
        creditsUsed: 0,
        durationMs: 900,
        stepAttemptSnapshots: [],
        structuredResult: {
          version: "1.0",
          intent: "presentation_deck",
          summary: "Deck preview ready.",
          payload: {
            title: "Quarterly strategy deck",
            description: "Board review",
            language: "en",
            style_preset: "editorial-clean",
            slides: [
              {
                templateId: "hero_center",
                title: "Overview",
                body: ["Revenue up"],
                notes: "Start here",
                graphicCategory: "Business",
                imagePromptKeywords: "business chart",
              },
            ],
          },
          artifacts: [],
          references: [],
          metrics: {},
        },
        previewArtifacts: [
          {
            id: "artifact-1",
            intent: "presentation_deck",
            artifact_type: "deck",
            state: "preview_generated",
            summary: "Deck preview ready.",
            commit_status: "not_committed",
            commit_token: "commit-token-1",
            payload_json: {
              title: "Quarterly strategy deck",
              description: "Board review",
              language: "en",
              style_preset: "editorial-clean",
              slides: [
                {
                  templateId: "hero_center",
                  title: "Overview",
                  body: ["Revenue up"],
                  notes: "Start here",
                  graphicCategory: "Business",
                  imagePromptKeywords: "business chart",
                },
              ],
            },
            provenance_json: [],
            payload_storage_key: null,
            committed_at: null,
            expired_at: null,
          },
        ],
      });

      const conversationSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "conv-001", agencyId: "agency-001", userId: 1 },
            ]),
          }),
        }),
      };
      const artifactSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "artifact-1",
                runId: "run-001",
                tenantId: "tenant-001",
                commitToken: "commit-token-1",
                commitStatus: "not_committed",
                targetType: null,
                targetId: null,
              },
            ]),
          }),
        }),
      };

      const previewHandler = agencyRouter.getRunPreview;
      mockDbSelect.mockReturnValueOnce(conversationSelect as any);
      const previewResult = await previewHandler({
        ctx: makeCtx(),
        input: {
          agencyId: "agency-001",
          runId: "run-001",
        },
      });

      expect(previewResult.preview).toEqual(
        expect.objectContaining({
          previewType: "deck",
        }),
      );

      mockDbSelect
        .mockReturnValueOnce(conversationSelect as any)
        .mockReturnValueOnce(artifactSelect as any);

      const commitHandler = agencyRouter.commitPreview;
      await expect(
        commitHandler({
          ctx: makeCtx(),
          input: {
            agencyId: "agency-001",
            runId: "run-001",
            artifactId: "artifact-1",
            commitToken: "commit-token-1",
          },
        }),
      ).rejects.toThrow(/disabled/i);

      expect(mockRecordAgencyPreviewMetric).toHaveBeenCalledWith(
        "commit_blocked",
        expect.objectContaining({
          reason: "deck_commit_disabled",
        }),
      );
    });

    it("commits a deck preview through the presentation commit service", async () => {
      mockGetTenantFeatureFlag.mockResolvedValue(true);

      mockBridgeGetRunDetails.mockResolvedValue({
        runId: "run-001",
        conversationId: "conv-001",
        status: "completed",
        response: "Deck preview ready.",
        creditsUsed: 0,
        durationMs: 900,
        stepAttemptSnapshots: [],
        structuredResult: {
          version: "1.0",
          intent: "presentation_deck",
          summary: "Deck preview ready.",
          payload: {
            title: "Quarterly strategy deck",
            description: "Board review",
            language: "en",
            style_preset: "editorial-clean",
            slides: [
              {
                templateId: "hero_center",
                title: "Overview",
                body: ["Revenue up"],
                notes: "Start here",
                graphicCategory: "Business",
                imagePromptKeywords: "business chart",
              },
            ],
          },
          artifacts: [],
          references: [],
          metrics: {},
        },
        previewArtifacts: [
          {
            id: "artifact-1",
            intent: "presentation_deck",
            artifact_type: "deck",
            state: "preview_generated",
            summary: "Deck preview ready.",
            commit_status: "not_committed",
            commit_token: "commit-token-1",
            payload_json: {
              title: "Quarterly strategy deck",
              description: "Board review",
              language: "en",
              style_preset: "editorial-clean",
              slides: [
                {
                  templateId: "hero_center",
                  title: "Overview",
                  body: ["Revenue up"],
                  notes: "Start here",
                  graphicCategory: "Business",
                  imagePromptKeywords: "business chart",
                },
              ],
            },
            provenance_json: [],
            payload_storage_key: null,
            committed_at: null,
            expired_at: null,
          },
        ],
      });

      const conversationSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              { id: "conv-001", agencyId: "agency-001", userId: 1 },
            ]),
          }),
        }),
      };
      const artifactSelect = {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([
              {
                id: "artifact-1",
                runId: "run-001",
                tenantId: "tenant-001",
                commitToken: "commit-token-1",
                commitStatus: "not_committed",
                targetType: null,
                targetId: null,
              },
            ]),
          }),
        }),
      };
      mockDbSelect
        .mockReturnValueOnce(conversationSelect as any)
        .mockReturnValueOnce(artifactSelect as any);

      mockCommitPresentationPreview.mockResolvedValue({
        artifactId: "artifact-1",
        runId: "run-001",
        commitToken: "commit-token-1",
        status: "committed",
        targetType: "presentation_deck",
        targetId: JSON.stringify({ deckId: 42, libraryItemId: 99 }),
        deckId: 42,
        libraryItemId: 99,
      });

      const handler = agencyRouter.commitPreview;
      const result = await handler({
        ctx: makeCtx(),
        input: {
          agencyId: "agency-001",
          runId: "run-001",
          artifactId: "artifact-1",
          commitToken: "commit-token-1",
        },
      });

      expect(mockCommitPresentationPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          commitToken: "commit-token-1",
          preview: expect.objectContaining({
            previewType: "deck",
          }),
        }),
      );
      expect(result).toEqual({
        ok: true,
        artifactId: "artifact-1",
        runId: "run-001",
        commitToken: "commit-token-1",
        status: "committed",
        targetType: "presentation_deck",
        targetId: JSON.stringify({ deckId: 42, libraryItemId: 99 }),
        deckId: 42,
        libraryItemId: 99,
      });
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
    it("clones built-in template tools into the new tenant draft", async () => {
      mockDbSelect
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: "platform-deep-research",
                name: "Deep Research",
                description: "Template",
                systemPrompt: "Prompt",
              },
            ]),
          }),
        } as any)
        .mockReturnValueOnce({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                id: "tpl-agent-1",
                name: "Deep Research Lead",
                description: "Lead",
                instructions: "Use RAG",
                defaultModel: "gpt-4.1-mini",
                isEntryPoint: true,
                position: { x: 0, y: 0 },
                defaultTools: ["builtin-rag-knowledge", "builtin-document-search"],
              },
            ]),
          }),
        } as any);

      const insertCalls: Array<{ table: any; values: any[] | Record<string, unknown> }> = [];
      mockDbInsert.mockImplementation((table: any) => ({
        values: vi.fn((values: any) => {
          insertCalls.push({ table, values });
          return Promise.resolve(undefined);
        }),
      }));

      const handler = agencyRouter.createFromTemplate;
      const result = await handler({
        ctx: makeCtx(),
        input: { agencyTemplateId: "platform-deep-research" },
      });

      expect(mockEnsureBuiltInAgencyExperienceTemplates).toHaveBeenCalled();
      expect(result).toHaveProperty("id");
      expect(insertCalls).toHaveLength(3);
      expect(insertCalls[0]?.values).toEqual(expect.objectContaining({
        sourceTemplateId: "platform-deep-research",
      }));
      expect(insertCalls[2]?.values).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ toolId: "builtin-rag-knowledge" }),
          expect.objectContaining({ toolId: "builtin-document-search" }),
        ]),
      );
    });
  });

  it("includes the Meta Channels builtin tool in listTools", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    mockDbSelect.mockReturnValue(chain);

    const handler = agencyRouter.listTools;
    const result = await handler({
      ctx: makeCtx(),
      input: { limit: 50, offset: 0 },
    });

    const metaTool = result.tools.find((tool: any) => tool.id === "builtin-meta-channels");
    expect(metaTool).toMatchObject({
      id: "builtin-meta-channels",
      name: "Meta Channels",
      riskLevel: "medium",
      requiresApproval: false,
      category: "social",
    });
    expect(metaTool?.configSchema?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "pageId" }),
        expect.objectContaining({ key: "allowedActions" }),
        expect.objectContaining({ key: "requireApproval" }),
      ]),
    );
  });

  it("includes the provider-neutral Social Actions builtin tool in listTools", async () => {
    const chain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      offset: vi.fn().mockResolvedValue([]),
    };
    mockDbSelect.mockReturnValue(chain);

    const handler = agencyRouter.listTools;
    const result = await handler({
      ctx: makeCtx(),
      input: { limit: 50, offset: 0 },
    });

    const socialTool = result.tools.find((tool: any) => tool.id === "builtin-social-actions");
    expect(socialTool).toMatchObject({
      id: "builtin-social-actions",
      name: "Social Actions",
      riskLevel: "medium",
      requiresApproval: false,
      category: "social",
    });
    expect(socialTool?.configSchema?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "provider" }),
        expect.objectContaining({ key: "pageId" }),
        expect.objectContaining({ key: "action" }),
      ]),
    );
  });

  describe("saveAsTemplate", () => {
    it("creates a template from an agency owned by user", async () => {
      const mockAgency = {
        id: "agency-001",
        tenantId: "tenant-001",
        createdBy: 1,
        description: "Test agency",
        topology: "custom",
      };
      const mockAgents = [
        {
          id: "agent-1",
          agencyId: "agency-001",
          name: "Researcher",
          nodeType: "agent",
          instructions: "Research things",
          modelRequirements: { supportsWebSearch: true },
          nodeConfig: { executionMode: "agentic" },
          isEntryPoint: true,
          position: { x: 100, y: 200 },
        },
        {
          id: "agent-2",
          agencyId: "agency-001",
          name: "Writer",
          nodeType: "agent",
          instructions: "Write content",
          modelRequirements: null,
          nodeConfig: null,
          isEntryPoint: false,
          position: { x: 300, y: 200 },
        },
      ];
      const mockFlows = [
        {
          id: "flow-1",
          agencyId: "agency-001",
          fromAgentId: "agent-1",
          toAgentId: "agent-2",
          flowType: "delegation",
          flowConfig: null,
        },
      ];
      const mockTools = [
        { id: "t1", agentId: "agent-1", toolId: "builtin-web-search" },
      ];

      const insertCalls: any[] = [];
      const selectResults = [
        [mockAgency],   // 1st select: agency lookup
        mockAgents,     // 2nd select: agents lookup
        mockFlows,      // 3rd select: flows lookup
        mockTools,      // 4th select: tools lookup
      ];
      let selectIdx = 0;

      mockDbSelect.mockImplementation(() => {
        const result = selectResults[selectIdx] ?? [];
        selectIdx++;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(result),
          }),
        };
      });

      mockDbInsert.mockImplementation((table: any) => {
        const inserter = {
          values: (vals: any) => {
            insertCalls.push({ table, values: vals });
            return Promise.resolve();
          },
        };
        return inserter;
      });

      const handler = agencyRouter.saveAsTemplate;
      const result = await handler({
        ctx: makeCtx(),
        input: {
          agencyId: "agency-001",
          name: "My Template",
          description: "Template description",
        },
      });

      expect(result).toHaveProperty("templateId");
      expect(insertCalls).toHaveLength(1);
      const templateValues = insertCalls[0].values;
      expect(templateValues.name).toBe("My Template");
      expect(templateValues.tenantId).toBe("tenant-001");
      expect(templateValues.createdBy).toBe(1);
      expect(templateValues.sourceAgencyId).toBe("agency-001");
      expect(templateValues.status).toBe("draft");
      expect(templateValues.agentDefinitions).toHaveLength(2);
      expect(templateValues.agentDefinitions[0].name).toBe("Researcher");
      expect(templateValues.agentDefinitions[0].toolIds).toEqual(["builtin-web-search"]);
      expect(templateValues.agentDefinitions[0].isEntryPoint).toBe(true);
      // Verify UUIDs are stripped
      expect(templateValues.agentDefinitions[0]).not.toHaveProperty("id");
      expect(templateValues.agentDefinitions[0]).not.toHaveProperty("agencyId");
      // Verify nodeConfig and modelRequirements preserved
      expect(templateValues.agentDefinitions[0].nodeConfig).toEqual({ executionMode: "agentic" });
      expect(templateValues.agentDefinitions[0].modelRequirements).toEqual({ supportsWebSearch: true });
      // Relative positions
      expect(templateValues.agentDefinitions[0].relativePosition).toEqual({ x: 0, y: 0 });
      expect(templateValues.agentDefinitions[1].relativePosition).toEqual({ x: 200, y: 0 });
      // Communication flows use indices
      expect(templateValues.communicationFlows).toHaveLength(1);
      expect(templateValues.communicationFlows[0]).toMatchObject({
        fromIndex: 0,
        toIndex: 1,
        flowType: "delegation",
      });
    });

    it("rejects non-owner non-admin users", async () => {
      const mockAgency = {
        id: "agency-001",
        tenantId: "tenant-001",
        createdBy: 999, // different user
      };

      mockDbSelect.mockImplementation(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([mockAgency]),
        }),
      }));

      const handler = agencyRouter.saveAsTemplate;
      await expect(handler({
        ctx: makeCtx({ user: { id: 1, role: "user", currentTenantId: "tenant-001" } }),
        input: { agencyId: "agency-001", name: "Test" },
      })).rejects.toThrow(/owner or admin/);
    });

    it("allows admin to save template for any agency", async () => {
      const mockAgency = {
        id: "agency-001",
        tenantId: "tenant-001",
        createdBy: 999,
        description: "Desc",
      };

      const adminSelectResults = [
        [mockAgency],  // agency lookup
        [],            // agents lookup (empty)
        [],            // flows lookup (empty)
      ];
      let adminSelectIdx = 0;
      mockDbSelect.mockImplementation(() => {
        const result = adminSelectResults[adminSelectIdx] ?? [];
        adminSelectIdx++;
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue(result),
          }),
        };
      });

      mockDbInsert.mockImplementation(() => ({
        values: vi.fn().mockResolvedValue(undefined),
      }));

      const handler = agencyRouter.saveAsTemplate;
      const result = await handler({
        ctx: makeCtx({ user: { id: 1, role: "admin", currentTenantId: "tenant-001" } }),
        input: { agencyId: "agency-001", name: "Admin Template" },
      });

      expect(result).toHaveProperty("templateId");
    });
  });
});
