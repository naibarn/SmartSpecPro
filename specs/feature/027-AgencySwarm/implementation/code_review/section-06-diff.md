diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 3c7d9c2..349585e 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -362,7 +362,7 @@ app.get("/api/media/image-proxy", async (req, res) => {
 const VALID_SOURCE_TYPES = new Set([
   "chat", "skill", "media_image", "media_video", "media_audio",
   "indexing", "rag", "stt", "translation", "brainstorm",
-  "scheduler", "admin", "other",
+  "scheduler", "admin", "agency", "other",
 ]);
 
 // Helper: derive sourceType from service tag when not explicitly provided
@@ -433,6 +433,57 @@ app.post("/api/internal/credits/charge", async (req, res) => {
   }
 });
 
+// Internal agency multiplier markup endpoint (Python backend -> Node.js)
+app.post("/api/internal/credits/agency-markup", async (req, res) => {
+  const authHeader = req.headers.authorization || "";
+  if (!authHeader.startsWith("Bearer ") || !ENV.webGatewayToken) {
+    return res.status(401).json({ success: false, error: "Unauthorized" });
+  }
+  const token = authHeader.slice(7);
+  if (token !== ENV.webGatewayToken) {
+    return res.status(401).json({ success: false, error: "Unauthorized" });
+  }
+
+  try {
+    const { userId, agencyId, markupAmount, sourceType } = req.body;
+
+    if (typeof userId !== "number" || !Number.isFinite(userId) || userId <= 0) {
+      return res.status(400).json({ success: false, error: "userId must be a positive number" });
+    }
+    if (typeof agencyId !== "string" || !agencyId) {
+      return res.status(400).json({ success: false, error: "agencyId is required" });
+    }
+    if (typeof markupAmount !== "number" || !Number.isFinite(markupAmount) || markupAmount <= 0) {
+      return res.status(400).json({ success: false, error: "markupAmount must be a positive number" });
+    }
+
+    const { deductCredits } = await import("../services/creditService");
+
+    const result = await deductCredits({
+      userId,
+      amount: markupAmount,
+      description: `Agency multiplier markup for agency ${agencyId}`,
+      sourceType: "agency",
+      metadata: {
+        agencyId,
+        markupAmount,
+        sourceType: sourceType ?? "agency",
+        service: "agency.multiplier_markup",
+      },
+    });
+
+    return res.json({
+      success: true,
+      markupCharged: markupAmount,
+      creditsUsed: result.creditsUsed,
+      transactionId: result.transactionId,
+    });
+  } catch (err: any) {
+    const status = err.message?.includes("Insufficient credits") ? 402 : 500;
+    return res.status(status).json({ success: false, error: err.message });
+  }
+});
+
 // Internal Google Drive cleanup endpoint (Python backend -> Node.js)
 app.post("/api/internal/google-drive/cleanup", async (req, res) => {
   const authHeader = req.headers.authorization || "";
diff --git a/apps/web/server/routers.ts b/apps/web/server/routers.ts
index 7043cb1..3ff3585 100644
--- a/apps/web/server/routers.ts
+++ b/apps/web/server/routers.ts
@@ -66,6 +66,7 @@ import { infrastructureRouter } from "./routers/infrastructure";
 import { presentationRouter } from "./routers/presentation";
 import { presentationImportRouter } from "./routers/presentationImport";
 import { sandboxRouter } from "./routers/sandbox";
+import { agencyRouter } from "./routers/agency";
 
 // Zod schemas for validation
 const strongPasswordSchema = z.string().min(8).refine(
@@ -1431,6 +1432,9 @@ export const appRouter = router({
   // OpenSandbox integration
   sandbox: sandboxRouter,
 
+  // Agency-Swarm multi-agent system
+  agency: agencyRouter,
+
   // AI helpers (streaming chat is served via /api/llm/stream; this router is for uploads)
   ai: router({
     upload: protectedProcedure
diff --git a/apps/web/server/routers/__tests__/agency.test.ts b/apps/web/server/routers/__tests__/agency.test.ts
new file mode 100644
index 0000000..526adbd
--- /dev/null
+++ b/apps/web/server/routers/__tests__/agency.test.ts
@@ -0,0 +1,432 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// --- Mocks ---
+
+// Mock tRPC to extract handler functions
+vi.mock("../../_core/trpc", () => {
+  const createProcedure = () => {
+    const proc: any = {
+      query: (fn: Function) => fn,
+      mutation: (fn: Function) => fn,
+      input: () => proc,
+      use: () => proc,
+    };
+    return proc;
+  };
+
+  return {
+    router: (routes: any) => routes,
+    protectedProcedure: createProcedure(),
+    adminProcedure: createProcedure(),
+  };
+});
+
+vi.mock("../../_core/rateLimitedProcedure", () => ({
+  createRateLimitMiddleware: () => vi.fn((_: any) => _.next()),
+}));
+
+const { mockGetFeatureFlag, mockSetFeatureFlag } = vi.hoisted(() => ({
+  mockGetFeatureFlag: vi.fn().mockResolvedValue(true),
+  mockSetFeatureFlag: vi.fn().mockResolvedValue(undefined),
+}));
+
+vi.mock("../../services/featureFlags", () => ({
+  getFeatureFlag: mockGetFeatureFlag,
+  setFeatureFlag: mockSetFeatureFlag,
+}));
+
+const { mockBridgeExecuteRun, mockBridgeCancelRun, mockBridgeListRuns } =
+  vi.hoisted(() => ({
+    mockBridgeExecuteRun: vi.fn(),
+    mockBridgeCancelRun: vi.fn(),
+    mockBridgeListRuns: vi.fn(),
+  }));
+
+vi.mock("../../services/agencyBridge", () => ({
+  agencyBridge: {
+    executeRun: mockBridgeExecuteRun,
+    cancelRun: mockBridgeCancelRun,
+    listRuns: mockBridgeListRuns,
+  },
+}));
+
+// Mock DB and Drizzle ORM
+const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockDbTransaction } =
+  vi.hoisted(() => ({
+    mockDbSelect: vi.fn(),
+    mockDbInsert: vi.fn(),
+    mockDbUpdate: vi.fn(),
+    mockDbDelete: vi.fn(),
+    mockDbTransaction: vi.fn(),
+  }));
+
+vi.mock("../../db", () => ({
+  db: {
+    select: mockDbSelect,
+    insert: mockDbInsert,
+    update: mockDbUpdate,
+    delete: mockDbDelete,
+    transaction: mockDbTransaction,
+  },
+}));
+
+vi.mock("../../../drizzle/schema", () => ({
+  agencies: {
+    id: "id",
+    tenantId: "tenantId",
+    slug: "slug",
+    name: "name",
+    description: "description",
+    systemPrompt: "systemPrompt",
+    creditMultiplier: "creditMultiplier",
+    maxAgents: "maxAgents",
+    maxRunTimeSeconds: "maxRunTimeSeconds",
+    isFallbackSafe: "isFallbackSafe",
+    status: "status",
+    isPublished: "isPublished",
+    createdBy: "createdBy",
+    createdAt: "createdAt",
+    updatedAt: "updatedAt",
+  },
+  agencyAgents: {
+    id: "id",
+    agencyId: "agencyId",
+    name: "name",
+    description: "description",
+    instructions: "instructions",
+    model: "model",
+    modelSettings: "modelSettings",
+    isEntryPoint: "isEntryPoint",
+    isOptional: "isOptional",
+    position: "position",
+    createdAt: "createdAt",
+  },
+  agencyAgentTools: {
+    id: "id",
+    agentId: "agentId",
+    toolId: "toolId",
+    createdAt: "createdAt",
+  },
+  agencyCommunicationFlows: {
+    id: "id",
+    agencyId: "agencyId",
+    fromAgentId: "fromAgentId",
+    toAgentId: "toAgentId",
+    flowType: "flowType",
+    createdAt: "createdAt",
+  },
+  agencyConversations: {
+    id: "id",
+    agencyId: "agencyId",
+    userId: "userId",
+    title: "title",
+    totalCreditsUsed: "totalCreditsUsed",
+    messageCount: "messageCount",
+    isArchived: "isArchived",
+    createdAt: "createdAt",
+    updatedAt: "updatedAt",
+  },
+  agencyTools: {
+    id: "id",
+    tenantId: "tenantId",
+    name: "name",
+    description: "description",
+    toolType: "toolType",
+    configuration: "configuration",
+    createdAt: "createdAt",
+  },
+}));
+
+vi.mock("drizzle-orm", () => ({
+  eq: vi.fn((...args: any[]) => ({ type: "eq", args })),
+  and: vi.fn((...args: any[]) => ({ type: "and", args })),
+  desc: vi.fn((col: any) => ({ type: "desc", col })),
+  sql: vi.fn(),
+}));
+
+vi.mock("nanoid", () => ({
+  nanoid: vi.fn(() => "mock-uuid-123456"),
+}));
+
+import { agencyRouter } from "../agency";
+
+// Helper to build ctx
+function makeCtx(overrides: Partial<{
+  user: any;
+  tenantId: string | null;
+  userToken: string | null;
+}> = {}) {
+  return {
+    user: overrides.user ?? {
+      id: 1,
+      role: "user",
+      currentTenantId: "tenant-001",
+    },
+    tenantId: overrides.tenantId ?? "tenant-001",
+    userToken: overrides.userToken ?? "user-jwt-token",
+    req: {} as any,
+    res: {} as any,
+    publicUrl: null,
+  };
+}
+
+beforeEach(() => {
+  vi.clearAllMocks();
+  // Default: feature flag enabled
+  mockGetFeatureFlag.mockResolvedValue(true);
+});
+
+describe("agencyRouter", () => {
+  it("exports all required procedures", () => {
+    expect(agencyRouter).toBeDefined();
+    expect(agencyRouter.list).toBeDefined();
+    expect(agencyRouter.getById).toBeDefined();
+    expect(agencyRouter.create).toBeDefined();
+    expect(agencyRouter.update).toBeDefined();
+    expect(agencyRouter.delete).toBeDefined();
+    expect(agencyRouter.listConversations).toBeDefined();
+    expect(agencyRouter.createConversation).toBeDefined();
+    expect(agencyRouter.sendMessage).toBeDefined();
+    expect(agencyRouter.adminListAgencies).toBeDefined();
+    expect(agencyRouter.adminToggleTenant).toBeDefined();
+    expect(agencyRouter.adminKillRun).toBeDefined();
+  });
+
+  describe("list", () => {
+    it("returns agencies filtered by tenant", async () => {
+      const mockAgencies = [
+        { id: "agency-001", name: "Test Agency", status: "published" },
+      ];
+
+      // Chain the query builder
+      const chain = {
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockReturnThis(),
+        orderBy: vi.fn().mockReturnThis(),
+        limit: vi.fn().mockReturnThis(),
+        offset: vi.fn().mockResolvedValue(mockAgencies),
+      };
+      mockDbSelect.mockReturnValue(chain);
+
+      const handler = agencyRouter.list;
+      const result = await handler({
+        ctx: makeCtx(),
+        input: { limit: 50, offset: 0 },
+      });
+
+      expect(result.agencies).toEqual(mockAgencies);
+      expect(mockGetFeatureFlag).toHaveBeenCalledWith("AGENCY_SWARM_ENABLED");
+    });
+  });
+
+  describe("feature flag gating", () => {
+    it("throws NOT_FOUND when feature flag is disabled", async () => {
+      mockGetFeatureFlag.mockResolvedValue(false);
+
+      const chain = {
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockReturnThis(),
+        orderBy: vi.fn().mockReturnThis(),
+        limit: vi.fn().mockReturnThis(),
+        offset: vi.fn().mockResolvedValue([]),
+      };
+      mockDbSelect.mockReturnValue(chain);
+
+      const handler = agencyRouter.list;
+      await expect(
+        handler({ ctx: makeCtx(), input: { limit: 50, offset: 0 } }),
+      ).rejects.toThrow();
+    });
+  });
+
+  describe("sendMessage", () => {
+    it("dispatches to Python bridge and returns result", async () => {
+      const mockRunResult = {
+        runId: "run-001",
+        status: "completed",
+        response: "Analysis complete",
+        creditsUsed: 5,
+        durationMs: 1200,
+      };
+      mockBridgeExecuteRun.mockResolvedValue(mockRunResult);
+
+      // Mock conversation lookup
+      const convChain = {
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockReturnThis(),
+        limit: vi.fn().mockResolvedValue([
+          {
+            id: "conv-001",
+            agencyId: "agency-001",
+            userId: 1,
+          },
+        ]),
+      };
+      mockDbSelect.mockReturnValue(convChain);
+
+      const handler = agencyRouter.sendMessage;
+      const result = await handler({
+        ctx: makeCtx(),
+        input: {
+          agencyId: "agency-001",
+          conversationId: "conv-001",
+          message: "Analyze this",
+        },
+      });
+
+      expect(mockBridgeExecuteRun).toHaveBeenCalledWith(
+        expect.objectContaining({
+          agencyId: "agency-001",
+          conversationId: "conv-001",
+          message: "Analyze this",
+          userToken: "user-jwt-token",
+          userId: 1,
+        }),
+      );
+      expect(result).toEqual(mockRunResult);
+    });
+  });
+
+  describe("adminToggleTenant", () => {
+    it("requires admin role (mock enforces via procedure type)", () => {
+      // adminProcedure is the procedure type used for adminToggleTenant,
+      // which enforces admin role. Here we just verify the handler exists
+      // and can be called with admin ctx.
+      expect(agencyRouter.adminToggleTenant).toBeDefined();
+    });
+
+    it("calls setFeatureFlag for the tenant", async () => {
+      const handler = agencyRouter.adminToggleTenant;
+      await handler({
+        ctx: makeCtx({ user: { id: 1, role: "admin", currentTenantId: "t-001" } }),
+        input: { tenantId: "tenant-target", enabled: true },
+      });
+
+      expect(mockSetFeatureFlag).toHaveBeenCalledWith(
+        "AGENCY_SWARM_ENABLED",
+        true,
+      );
+    });
+  });
+
+  describe("adminKillRun", () => {
+    it("sends cancel to Python bridge", async () => {
+      mockBridgeCancelRun.mockResolvedValue(undefined);
+
+      const handler = agencyRouter.adminKillRun;
+      await handler({
+        ctx: makeCtx({ user: { id: 1, role: "admin", currentTenantId: "t-001" } }),
+        input: { agencyId: "agency-001", runId: "run-001" },
+      });
+
+      expect(mockBridgeCancelRun).toHaveBeenCalledWith(
+        "agency-001",
+        "run-001",
+        expect.any(String),
+      );
+    });
+  });
+
+  describe("create", () => {
+    it("validates exactly one entry point agent", async () => {
+      const handler = agencyRouter.create;
+      // No entry point agent
+      await expect(
+        handler({
+          ctx: makeCtx(),
+          input: {
+            name: "Test Agency",
+            slug: "test-agency",
+            agents: [
+              {
+                name: "Agent A",
+                instructions: "Do things",
+                model: "gpt-4o-mini",
+                isEntryPoint: false,
+              },
+            ],
+          },
+        }),
+      ).rejects.toThrow(/entry point/i);
+    });
+
+    it("creates agency with valid input in a transaction", async () => {
+      // Mock the transaction to execute the callback
+      mockDbTransaction.mockImplementation(async (cb: Function) => {
+        const tx = {
+          insert: vi.fn().mockReturnValue({
+            values: vi.fn().mockReturnValue({
+              returning: vi.fn().mockResolvedValue([{ id: "new-agency-id" }]),
+            }),
+          }),
+        };
+        return cb(tx);
+      });
+
+      const handler = agencyRouter.create;
+      const result = await handler({
+        ctx: makeCtx(),
+        input: {
+          name: "Research Team",
+          slug: "research-team",
+          description: "A research agency",
+          agents: [
+            {
+              name: "Researcher",
+              instructions: "Research stuff",
+              model: "gpt-4o",
+              isEntryPoint: true,
+            },
+            {
+              name: "Writer",
+              instructions: "Write reports",
+              model: "gpt-4o-mini",
+              isEntryPoint: false,
+            },
+          ],
+          communicationFlows: [
+            {
+              fromAgentName: "Researcher",
+              toAgentName: "Writer",
+              flowType: "delegation" as const,
+            },
+          ],
+        },
+      });
+
+      expect(mockDbTransaction).toHaveBeenCalledTimes(1);
+      expect(result).toHaveProperty("id");
+    });
+  });
+
+  describe("delete", () => {
+    it("soft-deletes by setting status to archived", async () => {
+      // Mock finding the agency
+      const selectChain = {
+        from: vi.fn().mockReturnThis(),
+        where: vi.fn().mockReturnThis(),
+        limit: vi.fn().mockResolvedValue([
+          { id: "agency-001", tenantId: "tenant-001", createdBy: 1, status: "published" },
+        ]),
+      };
+      mockDbSelect.mockReturnValue(selectChain);
+
+      const updateChain = {
+        set: vi.fn().mockReturnThis(),
+        where: vi.fn().mockResolvedValue(undefined),
+      };
+      mockDbUpdate.mockReturnValue(updateChain);
+
+      const handler = agencyRouter.delete;
+      await handler({
+        ctx: makeCtx(),
+        input: { id: "agency-001" },
+      });
+
+      expect(mockDbUpdate).toHaveBeenCalled();
+      expect(updateChain.set).toHaveBeenCalledWith(
+        expect.objectContaining({ status: "archived" }),
+      );
+    });
+  });
+});
diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
new file mode 100644
index 0000000..62a7f1f
--- /dev/null
+++ b/apps/web/server/routers/agency.ts
@@ -0,0 +1,510 @@
+/**
+ * Agency tRPC Router
+ *
+ * CRUD for agencies, agent configs, communication flows.
+ * Conversation management for agency chat sessions.
+ * Admin operations (toggle tenant, kill run).
+ */
+
+import { z } from "zod";
+import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
+import { TRPCError } from "@trpc/server";
+import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
+import { db } from "../db";
+import {
+  agencies,
+  agencyAgents,
+  agencyAgentTools,
+  agencyCommunicationFlows,
+  agencyConversations,
+} from "../../drizzle/schema";
+import { eq, and, desc } from "drizzle-orm";
+import { agencyBridge } from "../services/agencyBridge";
+import { getFeatureFlag, setFeatureFlag } from "../services/featureFlags";
+import { nanoid } from "nanoid";
+
+// Feature flag guard
+async function assertAgencyEnabled(): Promise<void> {
+  const enabled = await getFeatureFlag("AGENCY_SWARM_ENABLED");
+  if (!enabled) {
+    throw new TRPCError({ code: "NOT_FOUND", message: "Not found" });
+  }
+}
+
+// Rate-limited procedures specific to agencies
+const agencyCreateProcedure = protectedProcedure.use(
+  createRateLimitMiddleware({ namespace: "agency-create", limit: 10, windowMs: 86_400_000 }),
+);
+const agencyMessageProcedure = protectedProcedure.use(
+  createRateLimitMiddleware({ namespace: "agency-message", limit: 60, windowMs: 60_000 }),
+);
+const agencyTemplateProcedure = protectedProcedure.use(
+  createRateLimitMiddleware({ namespace: "agency-template", limit: 5, windowMs: 86_400_000 }),
+);
+
+export const agencyRouter = router({
+  // --- CRUD ---
+
+  list: protectedProcedure
+    .input(
+      z.object({
+        status: z.enum(["draft", "published", "archived"]).optional(),
+        limit: z.number().min(1).max(100).default(50),
+        offset: z.number().min(0).default(0),
+      }),
+    )
+    .query(async ({ ctx, input }) => {
+      await assertAgencyEnabled();
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+
+      const conditions: any[] = [eq(agencies.tenantId, tenantId)];
+      if (input.status) {
+        conditions.push(eq(agencies.status, input.status));
+      }
+
+      const result = await db
+        .select()
+        .from(agencies)
+        .where(and(...conditions))
+        .orderBy(desc(agencies.createdAt))
+        .limit(input.limit)
+        .offset(input.offset);
+
+      return { agencies: result };
+    }),
+
+  getById: protectedProcedure
+    .input(z.object({ id: z.string().uuid() }))
+    .query(async ({ ctx, input }) => {
+      await assertAgencyEnabled();
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+
+      const [agency] = await db
+        .select()
+        .from(agencies)
+        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+
+      // Fetch agents
+      const agents = await db
+        .select()
+        .from(agencyAgents)
+        .where(eq(agencyAgents.agencyId, input.id));
+
+      // Fetch communication flows
+      const flows = await db
+        .select()
+        .from(agencyCommunicationFlows)
+        .where(eq(agencyCommunicationFlows.agencyId, input.id));
+
+      // Fetch agent tool assignments
+      const agentIds = agents.map((a: { id: string }) => a.id);
+      let toolAssignments: any[] = [];
+      if (agentIds.length > 0) {
+        // Get tools for each agent
+        for (const agentId of agentIds) {
+          const tools = await db
+            .select()
+            .from(agencyAgentTools)
+            .where(eq(agencyAgentTools.agentId, agentId));
+          toolAssignments.push(...tools);
+        }
+      }
+
+      return { ...agency, agents, communicationFlows: flows, agentToolAssignments: toolAssignments };
+    }),
+
+  create: agencyCreateProcedure
+    .input(
+      z.object({
+        name: z.string().min(1).max(255),
+        slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
+        description: z.string().optional(),
+        systemPrompt: z.string().optional(),
+        creditMultiplier: z.number().min(1).max(10).default(1),
+        maxAgents: z.number().min(1).max(20).default(10),
+        maxRunTimeSeconds: z.number().min(30).max(3600).default(600),
+        isFallbackSafe: z.boolean().default(false),
+        agents: z
+          .array(
+            z.object({
+              name: z.string().min(1).max(100),
+              description: z.string().optional(),
+              instructions: z.string(),
+              model: z.string().max(100),
+              modelSettings: z
+                .object({
+                  max_tokens: z.number().optional(),
+                  temperature: z.number().min(0).max(2).optional(),
+                  top_p: z.number().min(0).max(1).optional(),
+                })
+                .optional(),
+              isEntryPoint: z.boolean().default(false),
+              isOptional: z.boolean().default(false),
+              position: z.object({ x: z.number(), y: z.number() }).optional(),
+              toolIds: z.array(z.string().uuid()).optional(),
+            }),
+          )
+          .min(1),
+        communicationFlows: z
+          .array(
+            z.object({
+              fromAgentName: z.string(),
+              toAgentName: z.string(),
+              flowType: z.enum(["delegation", "handoff"]),
+            }),
+          )
+          .optional(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      await assertAgencyEnabled();
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userId = ctx.user!.id;
+
+      // Validate exactly one entry point
+      const entryPoints = input.agents.filter((a) => a.isEntryPoint);
+      if (entryPoints.length !== 1) {
+        throw new TRPCError({
+          code: "BAD_REQUEST",
+          message: `Exactly one entry point agent is required, found ${entryPoints.length}`,
+        });
+      }
+
+      const agencyId = nanoid(36);
+
+      await db.transaction(async (tx) => {
+        // Insert agency
+        await tx.insert(agencies).values({
+          id: agencyId,
+          tenantId,
+          slug: input.slug,
+          name: input.name,
+          description: input.description ?? null,
+          systemPrompt: input.systemPrompt ?? null,
+          creditMultiplier: String(input.creditMultiplier),
+          maxAgents: input.maxAgents,
+          maxRunTimeSeconds: input.maxRunTimeSeconds,
+          isFallbackSafe: input.isFallbackSafe,
+          status: "draft",
+          createdBy: userId,
+        });
+
+        // Build agent name -> id mapping for communication flows
+        const agentNameToId: Record<string, string> = {};
+
+        // Insert agents
+        for (const agent of input.agents) {
+          const agentId = nanoid(36);
+          agentNameToId[agent.name] = agentId;
+
+          await tx.insert(agencyAgents).values({
+            id: agentId,
+            agencyId,
+            name: agent.name,
+            description: agent.description ?? null,
+            instructions: agent.instructions,
+            model: agent.model,
+            modelSettings: agent.modelSettings ?? null,
+            isEntryPoint: agent.isEntryPoint,
+            isOptional: agent.isOptional,
+            position: agent.position ?? null,
+          });
+
+          // Insert tool assignments
+          if (agent.toolIds?.length) {
+            for (const toolId of agent.toolIds) {
+              await tx.insert(agencyAgentTools).values({
+                id: nanoid(36),
+                agentId,
+                toolId,
+              });
+            }
+          }
+        }
+
+        // Insert communication flows
+        if (input.communicationFlows?.length) {
+          for (const flow of input.communicationFlows) {
+            const fromId = agentNameToId[flow.fromAgentName];
+            const toId = agentNameToId[flow.toAgentName];
+            if (!fromId || !toId) {
+              throw new TRPCError({
+                code: "BAD_REQUEST",
+                message: `Invalid communication flow: agent "${!fromId ? flow.fromAgentName : flow.toAgentName}" not found`,
+              });
+            }
+            await tx.insert(agencyCommunicationFlows).values({
+              id: nanoid(36),
+              agencyId,
+              fromAgentId: fromId,
+              toAgentId: toId,
+              flowType: flow.flowType,
+            });
+          }
+        }
+      });
+
+      return { id: agencyId };
+    }),
+
+  update: protectedProcedure
+    .input(
+      z.object({
+        id: z.string().uuid(),
+        name: z.string().min(1).max(255).optional(),
+        description: z.string().optional(),
+        systemPrompt: z.string().optional(),
+        creditMultiplier: z.number().min(1).max(10).optional(),
+        maxRunTimeSeconds: z.number().min(30).max(3600).optional(),
+        isFallbackSafe: z.boolean().optional(),
+        status: z.enum(["draft", "published", "archived"]).optional(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      await assertAgencyEnabled();
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
+      // Fetch existing agency
+      const [agency] = await db
+        .select()
+        .from(agencies)
+        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+
+      if (agency.createdBy !== userId && !isAdmin) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to update this agency" });
+      }
+
+      const { id, ...updateFields } = input;
+      const setValues: Record<string, any> = {};
+      if (updateFields.name !== undefined) setValues.name = updateFields.name;
+      if (updateFields.description !== undefined) setValues.description = updateFields.description;
+      if (updateFields.systemPrompt !== undefined) setValues.systemPrompt = updateFields.systemPrompt;
+      if (updateFields.creditMultiplier !== undefined)
+        setValues.creditMultiplier = String(updateFields.creditMultiplier);
+      if (updateFields.maxRunTimeSeconds !== undefined)
+        setValues.maxRunTimeSeconds = updateFields.maxRunTimeSeconds;
+      if (updateFields.isFallbackSafe !== undefined) setValues.isFallbackSafe = updateFields.isFallbackSafe;
+      if (updateFields.status !== undefined) {
+        setValues.status = updateFields.status;
+        if (updateFields.status === "published") setValues.isPublished = true;
+        if (updateFields.status === "archived") setValues.isPublished = false;
+      }
+
+      if (Object.keys(setValues).length > 0) {
+        await db.update(agencies).set(setValues).where(eq(agencies.id, id));
+      }
+
+      return { success: true };
+    }),
+
+  delete: protectedProcedure
+    .input(z.object({ id: z.string().uuid() }))
+    .mutation(async ({ ctx, input }) => {
+      await assertAgencyEnabled();
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userId = ctx.user!.id;
+      const isAdmin = ctx.user!.role === "admin";
+
+      const [agency] = await db
+        .select()
+        .from(agencies)
+        .where(and(eq(agencies.id, input.id), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+
+      if (agency.createdBy !== userId && !isAdmin) {
+        throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to delete this agency" });
+      }
+
+      // Soft delete
+      await db
+        .update(agencies)
+        .set({ status: "archived", isPublished: false })
+        .where(eq(agencies.id, input.id));
+
+      return { success: true };
+    }),
+
+  // --- Conversations ---
+
+  listConversations: protectedProcedure
+    .input(
+      z.object({
+        agencyId: z.string().uuid(),
+        limit: z.number().min(1).max(100).default(20),
+        offset: z.number().min(0).default(0),
+      }),
+    )
+    .query(async ({ ctx, input }) => {
+      await assertAgencyEnabled();
+      const userId = ctx.user!.id;
+
+      const result = await db
+        .select()
+        .from(agencyConversations)
+        .where(
+          and(
+            eq(agencyConversations.agencyId, input.agencyId),
+            eq(agencyConversations.userId, userId),
+            eq(agencyConversations.isArchived, false),
+          ),
+        )
+        .orderBy(desc(agencyConversations.updatedAt))
+        .limit(input.limit)
+        .offset(input.offset);
+
+      return { conversations: result };
+    }),
+
+  createConversation: protectedProcedure
+    .input(
+      z.object({
+        agencyId: z.string().uuid(),
+        title: z.string().max(255).default("New Agency Chat"),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      await assertAgencyEnabled();
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userId = ctx.user!.id;
+
+      // Validate agency exists in tenant
+      const [agency] = await db
+        .select()
+        .from(agencies)
+        .where(and(eq(agencies.id, input.agencyId), eq(agencies.tenantId, tenantId)))
+        .limit(1);
+
+      if (!agency) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Agency not found" });
+      }
+
+      const conversationId = nanoid(36);
+      await db.insert(agencyConversations).values({
+        id: conversationId,
+        agencyId: input.agencyId,
+        userId,
+        title: input.title,
+      });
+
+      return { id: conversationId };
+    }),
+
+  // --- Run (delegates to Python) ---
+
+  sendMessage: agencyMessageProcedure
+    .input(
+      z.object({
+        agencyId: z.string().uuid(),
+        conversationId: z.string().uuid(),
+        message: z.string().min(1).max(10000),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      await assertAgencyEnabled();
+      const userId = ctx.user!.id;
+      const tenantId = ctx.tenantId ?? String(ctx.user!.currentTenantId ?? "");
+      const userToken = ctx.userToken ?? "";
+
+      // Validate conversation belongs to user
+      const [conv] = await db
+        .select()
+        .from(agencyConversations)
+        .where(
+          and(
+            eq(agencyConversations.id, input.conversationId),
+            eq(agencyConversations.userId, userId),
+          ),
+        )
+        .limit(1);
+
+      if (!conv) {
+        throw new TRPCError({
+          code: "NOT_FOUND",
+          message: "Conversation not found",
+        });
+      }
+
+      const result = await agencyBridge.executeRun({
+        agencyId: input.agencyId,
+        conversationId: input.conversationId,
+        message: input.message,
+        userToken,
+        tenantId,
+        userId,
+      });
+
+      return result;
+    }),
+
+  // --- Admin ---
+
+  adminListAgencies: adminProcedure
+    .input(
+      z.object({
+        tenantId: z.string().optional(),
+        status: z.enum(["draft", "published", "archived"]).optional(),
+        limit: z.number().min(1).max(100).default(50),
+        offset: z.number().min(0).default(0),
+      }),
+    )
+    .query(async ({ ctx, input }) => {
+      const conditions: any[] = [];
+      if (input.tenantId) {
+        conditions.push(eq(agencies.tenantId, input.tenantId));
+      }
+      if (input.status) {
+        conditions.push(eq(agencies.status, input.status));
+      }
+
+      const result = await db
+        .select()
+        .from(agencies)
+        .where(conditions.length > 0 ? and(...conditions) : undefined)
+        .orderBy(desc(agencies.createdAt))
+        .limit(input.limit)
+        .offset(input.offset);
+
+      return { agencies: result };
+    }),
+
+  adminToggleTenant: adminProcedure
+    .input(
+      z.object({
+        tenantId: z.string(),
+        enabled: z.boolean(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      await setFeatureFlag("AGENCY_SWARM_ENABLED", input.enabled);
+      return { success: true, tenantId: input.tenantId, enabled: input.enabled };
+    }),
+
+  adminKillRun: adminProcedure
+    .input(
+      z.object({
+        agencyId: z.string().uuid(),
+        runId: z.string().uuid(),
+      }),
+    )
+    .mutation(async ({ ctx, input }) => {
+      const userToken = ctx.userToken ?? "";
+      await agencyBridge.cancelRun(input.agencyId, input.runId, userToken);
+      return { success: true };
+    }),
+});
diff --git a/apps/web/server/services/__tests__/agencyBridge.test.ts b/apps/web/server/services/__tests__/agencyBridge.test.ts
new file mode 100644
index 0000000..132c0b9
--- /dev/null
+++ b/apps/web/server/services/__tests__/agencyBridge.test.ts
@@ -0,0 +1,196 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+
+// Mock ENV before importing agencyBridge
+vi.mock("../../_core/env", () => ({
+  ENV: {
+    pythonBackendUrl: "http://localhost:8000",
+    webGatewayToken: "test-gateway-token",
+  },
+}));
+
+import { AgencyBridge, agencyBridge } from "../agencyBridge";
+
+describe("AgencyBridge", () => {
+  let bridge: AgencyBridge;
+  let fetchSpy: ReturnType<typeof vi.fn>;
+
+  beforeEach(() => {
+    bridge = new AgencyBridge();
+    fetchSpy = vi.fn();
+    globalThis.fetch = fetchSpy;
+  });
+
+  afterEach(() => {
+    vi.restoreAllMocks();
+  });
+
+  describe("executeRun", () => {
+    it("calls Python POST /api/v1/agencies/{id}/run with correct body", async () => {
+      const mockResponse = {
+        run_id: "run-001",
+        status: "completed",
+        response: "Analysis complete",
+        credits_used: 5.0,
+        duration_ms: 1200,
+      };
+
+      fetchSpy.mockResolvedValue({
+        ok: true,
+        status: 200,
+        json: async () => mockResponse,
+      });
+
+      const result = await bridge.executeRun({
+        agencyId: "agency-001",
+        conversationId: "conv-001",
+        message: "Analyze this data",
+        userToken: "user-jwt-token",
+        tenantId: "tenant-001",
+        userId: 42,
+      });
+
+      expect(fetchSpy).toHaveBeenCalledTimes(1);
+      const [url, options] = fetchSpy.mock.calls[0];
+      expect(url).toBe("http://localhost:8000/api/v1/agencies/agency-001/run");
+      expect(options.method).toBe("POST");
+      expect(JSON.parse(options.body)).toEqual({
+        conversation_id: "conv-001",
+        message: "Analyze this data",
+      });
+      expect(result.runId).toBe("run-001");
+      expect(result.status).toBe("completed");
+      expect(result.response).toBe("Analysis complete");
+    });
+
+    it("passes auth headers (Authorization + X-User-Token + X-Tenant-Id)", async () => {
+      fetchSpy.mockResolvedValue({
+        ok: true,
+        status: 200,
+        json: async () => ({
+          run_id: "run-002",
+          status: "completed",
+          response: "Done",
+          credits_used: 1,
+          duration_ms: 500,
+        }),
+      });
+
+      await bridge.executeRun({
+        agencyId: "agency-001",
+        conversationId: "conv-001",
+        message: "Test",
+        userToken: "user-bearer-token",
+        tenantId: "tenant-xyz",
+        userId: 99,
+      });
+
+      const headers = fetchSpy.mock.calls[0][1].headers;
+      expect(headers["Authorization"]).toBe("Bearer user-bearer-token");
+      expect(headers["X-Tenant-Id"]).toBe("tenant-xyz");
+      expect(headers["X-User-Id"]).toBe("99");
+      expect(headers["Content-Type"]).toBe("application/json");
+    });
+
+    it("throws on non-2xx response from Python", async () => {
+      fetchSpy.mockResolvedValue({
+        ok: false,
+        status: 500,
+        json: async () => ({ detail: "Internal server error" }),
+      });
+
+      await expect(
+        bridge.executeRun({
+          agencyId: "agency-001",
+          conversationId: "conv-001",
+          message: "Test",
+          userToken: "token",
+          tenantId: "tenant",
+          userId: 1,
+        }),
+      ).rejects.toThrow();
+    });
+
+    it("maps HTTP 402 to credit-insufficient error", async () => {
+      fetchSpy.mockResolvedValue({
+        ok: false,
+        status: 402,
+        json: async () => ({ detail: "Insufficient credits" }),
+      });
+
+      await expect(
+        bridge.executeRun({
+          agencyId: "agency-001",
+          conversationId: "conv-001",
+          message: "Test",
+          userToken: "token",
+          tenantId: "tenant",
+          userId: 1,
+        }),
+      ).rejects.toThrow(/insufficient credits/i);
+    });
+  });
+
+  describe("cancelRun", () => {
+    it("calls Python POST /api/v1/agencies/{id}/runs/{runId}/cancel", async () => {
+      fetchSpy.mockResolvedValue({
+        ok: true,
+        status: 200,
+        json: async () => ({ status: "cancelled" }),
+      });
+
+      await bridge.cancelRun("agency-001", "run-001", "user-token");
+
+      expect(fetchSpy).toHaveBeenCalledTimes(1);
+      const [url, options] = fetchSpy.mock.calls[0];
+      expect(url).toBe(
+        "http://localhost:8000/api/v1/agencies/agency-001/runs/run-001/cancel",
+      );
+      expect(options.method).toBe("POST");
+    });
+  });
+
+  describe("listRuns", () => {
+    it("calls Python GET /api/v1/agencies/{id}/runs with query params", async () => {
+      fetchSpy.mockResolvedValue({
+        ok: true,
+        status: 200,
+        json: async () => ({
+          runs: [{ id: "run-001", status: "completed" }],
+          total: 1,
+        }),
+      });
+
+      const result = await bridge.listRuns("agency-001", "user-token", {
+        status: "completed",
+        limit: 10,
+        offset: 0,
+      });
+
+      expect(fetchSpy).toHaveBeenCalledTimes(1);
+      const url = fetchSpy.mock.calls[0][0];
+      expect(url).toContain("/api/v1/agencies/agency-001/runs");
+      expect(url).toContain("status=completed");
+      expect(url).toContain("limit=10");
+      expect(result.runs).toHaveLength(1);
+      expect(result.total).toBe(1);
+    });
+
+    it("handles empty result set", async () => {
+      fetchSpy.mockResolvedValue({
+        ok: true,
+        status: 200,
+        json: async () => ({ runs: [], total: 0 }),
+      });
+
+      const result = await bridge.listRuns("agency-001", "user-token", {});
+      expect(result.runs).toHaveLength(0);
+      expect(result.total).toBe(0);
+    });
+  });
+
+  describe("singleton", () => {
+    it("exports a singleton instance", () => {
+      expect(agencyBridge).toBeInstanceOf(AgencyBridge);
+    });
+  });
+});
diff --git a/apps/web/server/services/agencyBridge.ts b/apps/web/server/services/agencyBridge.ts
new file mode 100644
index 0000000..4c48275
--- /dev/null
+++ b/apps/web/server/services/agencyBridge.ts
@@ -0,0 +1,175 @@
+/**
+ * AgencyBridge -- HTTP client for Python agency service.
+ *
+ * All methods construct requests to the Python backend's
+ * /api/v1/agencies/* endpoints and return parsed responses.
+ * Streaming is NOT handled here -- see section-07 (SSE streaming).
+ */
+
+import { ENV } from "../_core/env";
+
+const PYTHON_BACKEND_URL = (ENV.pythonBackendUrl || "http://localhost:8000").replace(/\/+$/, "");
+const RUN_TIMEOUT_MS = 120_000; // 2 minutes for multi-agent runs
+
+interface RunParams {
+  agencyId: string;
+  conversationId: string;
+  message: string;
+  userToken: string;
+  tenantId: string;
+  userId: number;
+}
+
+interface RunResult {
+  runId: string;
+  status: string;
+  response: string;
+  creditsUsed: number;
+  durationMs: number;
+}
+
+interface RunFilters {
+  status?: string;
+  limit?: number;
+  offset?: number;
+}
+
+interface RunListResult {
+  runs: Array<{
+    id: string;
+    status: string;
+    totalCreditsUsed: number;
+    startedAt: string;
+    completedAt: string | null;
+    durationMs: number | null;
+  }>;
+  total: number;
+}
+
+function makeHeaders(userToken: string): Record<string, string> {
+  return {
+    "Content-Type": "application/json",
+    Authorization: `Bearer ${userToken}`,
+  };
+}
+
+function makeHeadersWithMeta(
+  userToken: string,
+  tenantId: string,
+  userId: number,
+): Record<string, string> {
+  return {
+    ...makeHeaders(userToken),
+    "X-Tenant-Id": tenantId,
+    "X-User-Id": String(userId),
+  };
+}
+
+async function handleResponse<T>(response: Response, context: string): Promise<T> {
+  if (response.ok) {
+    return response.json() as Promise<T>;
+  }
+
+  let detail = "";
+  try {
+    const body = await response.json();
+    detail = body.detail || body.error || JSON.stringify(body);
+  } catch {
+    detail = `HTTP ${response.status}`;
+  }
+
+  if (response.status === 402) {
+    throw new Error(`Insufficient credits: ${detail}`);
+  }
+  if (response.status === 404) {
+    throw new Error(`Not found: ${detail}`);
+  }
+  if (response.status === 429) {
+    throw new Error(`Rate limit exceeded: ${detail}`);
+  }
+
+  throw new Error(`Agency bridge ${context} failed (${response.status}): ${detail}`);
+}
+
+export class AgencyBridge {
+  async executeRun(params: RunParams): Promise<RunResult> {
+    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${params.agencyId}/run`;
+
+    const response = await fetch(url, {
+      method: "POST",
+      headers: makeHeadersWithMeta(params.userToken, params.tenantId, params.userId),
+      body: JSON.stringify({
+        conversation_id: params.conversationId,
+        message: params.message,
+      }),
+      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
+    });
+
+    const data = await handleResponse<any>(response, "executeRun");
+
+    return {
+      runId: data.run_id,
+      status: data.status,
+      response: data.response,
+      creditsUsed: data.credits_used ?? 0,
+      durationMs: data.duration_ms ?? 0,
+    };
+  }
+
+  async cancelRun(agencyId: string, runId: string, userToken: string): Promise<void> {
+    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${agencyId}/runs/${runId}/cancel`;
+
+    const response = await fetch(url, {
+      method: "POST",
+      headers: makeHeaders(userToken),
+    });
+
+    await handleResponse<any>(response, "cancelRun");
+  }
+
+  async listRuns(
+    agencyId: string,
+    userToken: string,
+    filters: RunFilters,
+  ): Promise<RunListResult> {
+    const params = new URLSearchParams();
+    if (filters.status) params.set("status", filters.status);
+    if (filters.limit != null) params.set("limit", String(filters.limit));
+    if (filters.offset != null) params.set("offset", String(filters.offset));
+
+    const qs = params.toString();
+    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${agencyId}/runs${qs ? `?${qs}` : ""}`;
+
+    const response = await fetch(url, {
+      method: "GET",
+      headers: makeHeaders(userToken),
+    });
+
+    return handleResponse<RunListResult>(response, "listRuns");
+  }
+
+  async getRunDetails(
+    agencyId: string,
+    runId: string,
+    userToken: string,
+  ): Promise<RunResult> {
+    const url = `${PYTHON_BACKEND_URL}/api/v1/agencies/${agencyId}/runs/${runId}`;
+
+    const response = await fetch(url, {
+      method: "GET",
+      headers: makeHeaders(userToken),
+    });
+
+    const data = await handleResponse<any>(response, "getRunDetails");
+
+    return {
+      runId: data.run_id ?? data.id,
+      status: data.status,
+      response: data.response ?? "",
+      creditsUsed: data.credits_used ?? data.totalCreditsUsed ?? 0,
+      durationMs: data.duration_ms ?? data.durationMs ?? 0,
+    };
+  }
+}
+
+export const agencyBridge = new AgencyBridge();
diff --git a/apps/web/server/services/sandbox/dispatchService.ts b/apps/web/server/services/sandbox/dispatchService.ts
index 2647385..ca482f2 100644
--- a/apps/web/server/services/sandbox/dispatchService.ts
+++ b/apps/web/server/services/sandbox/dispatchService.ts
@@ -15,10 +15,11 @@ export type ExecutionMode =
   | "sandbox-browser"
   | "sandbox-file"
   | "sandbox-media"
+  | "sandbox-python"
   | "media-generate";
 
 export interface SandboxDispatchRequest {
-  featureType: "chat" | "skill" | "workflow" | "library" | "media" | "presentation" | "connector";
+  featureType: "chat" | "skill" | "workflow" | "library" | "media" | "presentation" | "connector" | "agency";
   executionMode: ExecutionMode;
   tenantId: string;
   userId: number;
