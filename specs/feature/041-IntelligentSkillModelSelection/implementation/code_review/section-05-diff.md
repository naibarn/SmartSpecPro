diff --git a/apps/web/server/routers/multiProvider.test.ts b/apps/web/server/routers/multiProvider.test.ts
index 80a97d81..c85c67fc 100644
--- a/apps/web/server/routers/multiProvider.test.ts
+++ b/apps/web/server/routers/multiProvider.test.ts
@@ -1,11 +1,12 @@
 import { describe, it, expect, vi, beforeEach } from "vitest";
 
-const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockHealthSummary } = vi.hoisted(() => ({
+const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockHealthSummary, mockComputeModelPriority } = vi.hoisted(() => ({
   mockDbSelect: vi.fn(),
   mockDbInsert: vi.fn(),
   mockDbUpdate: vi.fn(),
   mockDbDelete: vi.fn(),
   mockHealthSummary: vi.fn().mockReturnValue(new Map()),
+  mockComputeModelPriority: vi.fn().mockReturnValue(42),
 }));
 
 vi.mock("../db", () => ({
@@ -25,6 +26,10 @@ vi.mock("../services/providerHealth", () => ({
   getHealthSummary: mockHealthSummary,
 }));
 
+vi.mock("../services/intelligentModelSelector", () => ({
+  computeModelPriority: mockComputeModelPriority,
+}));
+
 vi.mock("../services/costTracker", () => ({
   getAdminUsageStats: vi.fn().mockResolvedValue({
     totalRequests: 100,
@@ -59,7 +64,12 @@ vi.mock("../_core/trpc", () => {
   };
 });
 
-import { groupModelMappingsByModelId, type ModelMappingListRow, multiProviderRouter } from "./multiProvider";
+import {
+  groupModelMappingsByModelId,
+  mergeAdminModelCatalogRows,
+  type ModelMappingListRow,
+  multiProviderRouter,
+} from "./multiProvider";
 
 beforeEach(() => {
   vi.clearAllMocks();
@@ -91,6 +101,7 @@ describe("groupModelMappingsByModelId", () => {
         contextLength: 128000,
         isEnabled: true,
         priority: 0,
+        priorityLocked: false,
         apiStyle: "responses",
       },
       {
@@ -107,6 +118,7 @@ describe("groupModelMappingsByModelId", () => {
         contextLength: 128000,
         isEnabled: false,
         priority: 1,
+        priorityLocked: false,
         apiStyle: "chat-completions",
       },
       {
@@ -123,6 +135,7 @@ describe("groupModelMappingsByModelId", () => {
         contextLength: 200000,
         isEnabled: true,
         priority: 0,
+        priorityLocked: false,
         apiStyle: "messages",
       },
     ];
@@ -152,6 +165,84 @@ describe("listModelMappings", () => {
   });
 });
 
+describe("mergeAdminModelCatalogRows", () => {
+  it("includes provider catalog models even when they are not mapped yet", () => {
+    const rows = mergeAdminModelCatalogRows({
+      providers: [
+        {
+          id: 1,
+          providerName: "openrouter",
+          providerDisplayName: "OpenRouter",
+          availableModels: [
+            {
+              id: "openai/gpt-5.4",
+              name: "GPT 5.4",
+              contextLength: 400000,
+              pricing: { input: 2.5, output: 10 },
+            },
+          ],
+        },
+      ],
+      mappings: [],
+    });
+
+    expect(rows).toHaveLength(1);
+    expect(rows[0]?.providerModelId).toBe("openai/gpt-5.4");
+    expect(rows[0]?.isMapped).toBe(false);
+    expect(rows[0]?.isEnabled).toBe(false);
+  });
+});
+
+describe("listAdminModelCatalog", () => {
+  it("returns merged mapped and unmapped provider catalog rows", async () => {
+    const providerOrderByMock = vi.fn().mockResolvedValue([
+      {
+        id: 1,
+        providerName: "openrouter",
+        providerDisplayName: "OpenRouter",
+        availableModels: [
+          {
+            id: "openai/gpt-5.4",
+            name: "GPT 5.4",
+            contextLength: 400000,
+            pricing: { input: 2.5, output: 10 },
+          },
+        ],
+      },
+    ]);
+    const providerFromMock = vi.fn().mockReturnValue({ orderBy: providerOrderByMock });
+    mockDbSelect.mockImplementationOnce(() => ({ from: providerFromMock }));
+
+    const mappingOrderByMock = vi.fn().mockResolvedValue([
+      {
+        id: 1,
+        modelId: "gpt-4o",
+        providerId: 1,
+        providerName: "openrouter",
+        providerDisplayName: "OpenRouter",
+        modelName: "GPT-4o",
+        providerModelId: "openai/gpt-4o",
+        pricingInput: "2.50",
+        pricingOutput: "10.00",
+        isFree: false,
+        contextLength: 128000,
+        isEnabled: true,
+        priority: 0,
+        apiStyle: "chat-completions",
+      },
+    ]);
+    const mappingJoinMock = vi.fn().mockReturnValue({ orderBy: mappingOrderByMock });
+    const mappingFromMock = vi.fn().mockReturnValue({ innerJoin: mappingJoinMock });
+    mockDbSelect.mockImplementationOnce(() => ({ from: mappingFromMock }));
+
+    const fn = multiProviderRouter.listAdminModelCatalog as Function;
+    const result = await fn({ ctx: { user: { role: "admin" } } });
+
+    expect(result.some((row: any) => row.providerModelId === "openai/gpt-4o" && row.isMapped)).toBe(true);
+    expect(result.some((row: any) => row.providerModelId === "openai/gpt-5.4" && !row.isMapped)).toBe(true);
+  });
+});
+
 describe("upsertModelMapping", () => {
   it("creates a new mapping", async () => {
     const returningMock = vi.fn().mockResolvedValue([{ id: 10 }]);
@@ -239,6 +330,44 @@ describe("bulkSetModelMappingsEnabled", () => {
   });
 });
 
+describe("bulkSetAdminModelCatalogEnabled", () => {
+  it("creates mappings for unmapped catalog models when enabling", async () => {
+    // Mock provider pre-load for priority computation
+    const providerWhereMock = vi.fn().mockResolvedValue([]);
+    const providerFromMock = vi.fn().mockReturnValue({ where: providerWhereMock });
+    mockDbSelect.mockImplementationOnce(() => ({ from: providerFromMock }));
+
+    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
+    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate });
+    mockDbInsert.mockReturnValue({ values: valuesMock });
+
+    const fn = multiProviderRouter.bulkSetAdminModelCatalogEnabled as Function;
+    const result = await fn({
+      ctx: { user: { role: "admin" } },
+      input: {
+        items: [{
+          mappingId: null,
+          modelId: "openai/gpt-5.4",
+          providerId: 1,
+          modelName: "GPT 5.4",
+          providerModelId: "openai/gpt-5.4",
+          pricingInput: 2.5,
+          pricingOutput: 10,
+          isFree: false,
+          contextLength: 400000,
+          priority: 0,
+          apiStyle: "chat-completions",
+        }],
+        isEnabled: true,
+      },
+    });
+
+    expect(result.success).toBe(true);
+    expect(result.insertedCount).toBe(1);
+    expect(mockDbInsert).toHaveBeenCalled();
+  });
+});
+
 describe("listRoutingRules", () => {
   it("returns rules sorted by specificity", async () => {
     const rules = [
@@ -368,3 +497,184 @@ describe("getUserUsageStats", () => {
     expect(result.totalCreditsUsed).toBe(500);
   });
 });
+
+describe("multiProvider.updateModelPriority", () => {
+  it("updates priority and sets priorityLocked=true", async () => {
+    const returningMock = vi.fn().mockResolvedValue([{
+      id: 1,
+      modelId: "gpt-4o",
+      priority: 25,
+      priorityLocked: true,
+    }]);
+    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
+    const setMock = vi.fn().mockReturnValue({ where: whereMock });
+    mockDbUpdate.mockReturnValue({ set: setMock });
+
+    const fn = multiProviderRouter.updateModelPriority as Function;
+    const result = await fn({
+      ctx: { user: { role: "admin" } },
+      input: { mappingId: 1, priority: 25 },
+    });
+
+    expect(result.success).toBe(true);
+    expect(result.mapping.priority).toBe(25);
+    expect(result.mapping.priorityLocked).toBe(true);
+    expect(setMock).toHaveBeenCalledWith(
+      expect.objectContaining({ priority: 25, priorityLocked: true })
+    );
+  });
+
+  it("requires admin role", () => {
+    expect(multiProviderRouter.updateModelPriority).toBeDefined();
+  });
+
+  it("returns updated mapping in response", async () => {
+    const updatedRow = {
+      id: 5,
+      modelId: "claude-sonnet-4",
+      priority: 0,
+      priorityLocked: true,
+    };
+    const returningMock = vi.fn().mockResolvedValue([updatedRow]);
+    const whereMock = vi.fn().mockReturnValue({ returning: returningMock });
+    const setMock = vi.fn().mockReturnValue({ where: whereMock });
+    mockDbUpdate.mockReturnValue({ set: setMock });
+
+    const fn = multiProviderRouter.updateModelPriority as Function;
+    const result = await fn({
+      ctx: { user: { role: "admin" } },
+      input: { mappingId: 5, priority: 0 },
+    });
+
+    expect(result.mapping).toEqual(updatedRow);
+  });
+});
+
+describe("multiProvider.backfillModelPriorities", () => {
+  it("computes priority for all unlocked rows", async () => {
+    const unlockedRows = [
+      { id: 1, modelId: "gpt-4o", priority: 0, priorityLocked: false,
+        pricingInput: "2.5", pricingOutput: "10", isFree: false,
+        contextLength: 128000, supportsFunctionTools: true,
+        supportsStructuredOutputs: true, supportsWebSearch: false,
+        supportsCodeExecution: false, supportsComputerUse: false,
+        supportsBackground: false, supportsResponses: true,
+        supportsVision: true },
+      { id: 2, modelId: "kimi-k2.5", priority: 0, priorityLocked: false,
+        pricingInput: "0", pricingOutput: "0", isFree: true,
+        contextLength: 128000, supportsFunctionTools: false,
+        supportsStructuredOutputs: false, supportsWebSearch: false,
+        supportsCodeExecution: false, supportsComputerUse: false,
+        supportsBackground: false, supportsResponses: false,
+        supportsVision: false },
+    ];
+    const whereMock = vi.fn().mockResolvedValue(unlockedRows);
+    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
+    mockDbSelect.mockReturnValue({ from: fromMock });
+
+    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
+    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
+    mockDbUpdate.mockReturnValue({ set: updateSetMock });
+
+    mockComputeModelPriority.mockReturnValue(35);
+
+    const fn = multiProviderRouter.backfillModelPriorities as Function;
+    const result = await fn({ ctx: { user: { role: "admin" } } });
+
+    expect(result.success).toBe(true);
+    expect(result.updatedCount).toBe(2);
+    expect(mockComputeModelPriority).toHaveBeenCalledTimes(2);
+  });
+
+  it("skips rows with priorityLocked=true", async () => {
+    const whereMock = vi.fn().mockResolvedValue([]);
+    const fromMock = vi.fn().mockReturnValue({ where: whereMock });
+    mockDbSelect.mockReturnValue({ from: fromMock });
+
+    const fn = multiProviderRouter.backfillModelPriorities as Function;
+    const result = await fn({ ctx: { user: { role: "admin" } } });
+
+    expect(result.updatedCount).toBe(0);
+    expect(mockComputeModelPriority).not.toHaveBeenCalled();
+  });
+});
+
+describe("bulkSetAdminModelCatalogEnabled — priority assignment", () => {
+  it("assigns computed priority to new entries (not 0)", async () => {
+    const providerRows = [{
+      id: 1,
+      availableModels: [{
+        id: "openai/gpt-5.4",
+        name: "GPT 5.4",
+        contextLength: 400000,
+        pricing: { input: 2.5, output: 10 },
+        createdAt: Math.floor(Date.now() / 1000) - 7 * 86400,
+      }],
+    }];
+    const providerWhereMock = vi.fn().mockResolvedValue(providerRows);
+    const providerFromMock = vi.fn().mockReturnValue({ where: providerWhereMock });
+    mockDbSelect.mockImplementationOnce(() => ({ from: providerFromMock }));
+
+    mockComputeModelPriority.mockReturnValue(18);
+
+    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
+    const valuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate });
+    mockDbInsert.mockReturnValue({ values: valuesMock });
+
+    const fn = multiProviderRouter.bulkSetAdminModelCatalogEnabled as Function;
+    const result = await fn({
+      ctx: { user: { role: "admin" } },
+      input: {
+        items: [{
+          mappingId: null,
+          modelId: "openai/gpt-5.4",
+          providerId: 1,
+          modelName: "GPT 5.4",
+          providerModelId: "openai/gpt-5.4",
+          pricingInput: 2.5,
+          pricingOutput: 10,
+          isFree: false,
+          contextLength: 400000,
+        }],
+        isEnabled: true,
+      },
+    });
+
+    expect(result.success).toBe(true);
+    expect(mockComputeModelPriority).toHaveBeenCalled();
+    const insertedValues = valuesMock.mock.calls[0][0];
+    expect(insertedValues[0].priority).toBe(18);
+  });
+
+  it("does not overwrite priorityLocked=true entries", async () => {
+    const updateWhereMock = vi.fn().mockResolvedValue(undefined);
+    const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
+    mockDbUpdate.mockReturnValue({ set: updateSetMock });
+
+    const fn = multiProviderRouter.bulkSetAdminModelCatalogEnabled as Function;
+    const result = await fn({
+      ctx: { user: { role: "admin" } },
+      input: {
+        items: [{
+          mappingId: 99,
+          modelId: "gpt-4o",
+          providerId: 1,
+          modelName: "GPT-4o",
+          providerModelId: "openai/gpt-4o",
+          pricingInput: 2.5,
+          pricingOutput: 10,
+          isFree: false,
+        }],
+        isEnabled: true,
+      },
+    });
+
+    expect(result.success).toBe(true);
+    expect(updateSetMock).toHaveBeenCalledWith(
+      expect.objectContaining({ isEnabled: true })
+    );
+    expect(updateSetMock).not.toHaveBeenCalledWith(
+      expect.objectContaining({ priority: expect.any(Number) })
+    );
+  });
+});
diff --git a/apps/web/server/routers/multiProvider.ts b/apps/web/server/routers/multiProvider.ts
index 8abee640..8fa2b9ed 100644
--- a/apps/web/server/routers/multiProvider.ts
+++ b/apps/web/server/routers/multiProvider.ts
@@ -1,10 +1,12 @@
 import { z } from "zod";
+import { createHash } from "node:crypto";
 import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
 import { db } from "../db";
 import { modelProviderMap, llmProviders, routingRules } from "../../drizzle/schema";
 import { eq, and, asc, inArray } from "drizzle-orm";
 import { getHealthSummary } from "../services/providerHealth";
 import { getAdminUsageStats, getUserUsageStats } from "../services/costTracker";
+import { computeModelPriority } from "../services/intelligentModelSelector";
 
 export interface ModelMappingListRow {
   id: number;
@@ -20,9 +22,147 @@ export interface ModelMappingListRow {
   contextLength: number | null;
   isEnabled: boolean;
   priority: number;
+  priorityLocked: boolean;
   apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
 }
 
+interface ProviderCatalogModel {
+  id: string;
+  name: string;
+  contextLength?: number;
+  pricing?: {
+    input?: number;
+    output?: number;
+  };
+}
+
+interface ProviderCatalogRow {
+  id: number;
+  providerName: string;
+  providerDisplayName: string;
+  availableModels: ProviderCatalogModel[] | null;
+}
+
+export interface AdminModelCatalogRow {
+  mappingId: number | null;
+  isMapped: boolean;
+  modelId: string;
+  providerId: number;
+  providerName: string;
+  providerDisplayName: string;
+  modelName: string;
+  providerModelId: string;
+  pricingInput: string;
+  pricingOutput: string;
+  isFree: boolean;
+  contextLength: number | null;
+  isEnabled: boolean;
+  priority: number;
+  priorityLocked: boolean;
+  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
+}
+
+function defaultApiStyleForProvider(providerName: string): AdminModelCatalogRow["apiStyle"] {
+  switch (providerName.toLowerCase()) {
+    case "openai":
+      return "responses";
+    case "anthropic":
+      return "messages";
+    case "google":
+      return "gemini";
+    default:
+      return "chat-completions";
+  }
+}
+
+function buildCanonicalModelId(providerModelId: string) {
+  if (providerModelId.length <= 128) {
+    return providerModelId;
+  }
+
+  const normalized = providerModelId
+    .trim()
+    .toLowerCase()
+    .replace(/[^a-z0-9]+/g, "-")
+    .replace(/^-+|-+$/g, "")
+    .slice(0, 115) || "model";
+  const hash = createHash("sha1").update(providerModelId).digest("hex").slice(0, 12);
+  return `${normalized}-${hash}`.slice(0, 128);
+}
+
+export function mergeAdminModelCatalogRows(input: {
+  providers: ProviderCatalogRow[];
+  mappings: ModelMappingListRow[];
+}): AdminModelCatalogRow[] {
+  const rows = new Map<string, AdminModelCatalogRow>();
+
+  for (const mapping of input.mappings) {
+    rows.set(`${mapping.providerId}:${mapping.providerModelId}`, {
+      mappingId: mapping.id,
+      isMapped: true,
+      modelId: mapping.modelId,
+      providerId: mapping.providerId,
+      providerName: mapping.providerName,
+      providerDisplayName: mapping.providerDisplayName,
+      modelName: mapping.modelName,
+      providerModelId: mapping.providerModelId,
+      pricingInput: mapping.pricingInput,
+      pricingOutput: mapping.pricingOutput,
+      isFree: mapping.isFree,
+      contextLength: mapping.contextLength,
+      isEnabled: mapping.isEnabled,
+      priority: mapping.priority,
+      priorityLocked: mapping.priorityLocked,
+      apiStyle: mapping.apiStyle,
+    });
+  }
+
+  for (const provider of input.providers) {
+    for (const model of provider.availableModels ?? []) {
+      const key = `${provider.id}:${model.id}`;
+      if (rows.has(key)) {
+        continue;
+      }
+
+      const pricingInput = model.pricing?.input ?? 0;
+      const pricingOutput = model.pricing?.output ?? 0;
+
+      rows.set(key, {
+        mappingId: null,
+        isMapped: false,
+        modelId: buildCanonicalModelId(model.id),
+        providerId: provider.id,
+        providerName: provider.providerName,
+        providerDisplayName: provider.providerDisplayName,
+        modelName: model.name || model.id,
+        providerModelId: model.id,
+        pricingInput: String(pricingInput),
+        pricingOutput: String(pricingOutput),
+        isFree: pricingInput === 0 && pricingOutput === 0,
+        contextLength: model.contextLength ?? null,
+        isEnabled: false,
+        priority: 0,
+        priorityLocked: false,
+        apiStyle: defaultApiStyleForProvider(provider.providerName),
+      });
+    }
+  }
+
+  return Array.from(rows.values()).sort((left, right) => {
+    const nameCompare = left.modelName.localeCompare(right.modelName);
+    if (nameCompare !== 0) {
+      return nameCompare;
+    }
+
+    const providerCompare = left.providerDisplayName.localeCompare(right.providerDisplayName);
+    if (providerCompare !== 0) {
+      return providerCompare;
+    }
+
+    return left.providerModelId.localeCompare(right.providerModelId);
+  });
+}
+
 export function groupModelMappingsByModelId(rows: ModelMappingListRow[]) {
   return rows.reduce<Record<string, ModelMappingListRow[]>>((grouped, row) => {
     if (!grouped[row.modelId]) {
@@ -52,6 +192,7 @@ export const multiProviderRouter = router({
         contextLength: modelProviderMap.contextLength,
         isEnabled: modelProviderMap.isEnabled,
         priority: modelProviderMap.priority,
+        priorityLocked: modelProviderMap.priorityLocked,
         apiStyle: modelProviderMap.apiStyle,
       })
       .from(modelProviderMap)
@@ -61,6 +202,46 @@ export const multiProviderRouter = router({
     return groupModelMappingsByModelId(rows as ModelMappingListRow[]);
   }),
 
+  listAdminModelCatalog: adminProcedure.query(async () => {
+    const [providers, mappings] = await Promise.all([
+      db
+        .select({
+          id: llmProviders.id,
+          providerName: llmProviders.providerName,
+          providerDisplayName: llmProviders.displayName,
+          availableModels: llmProviders.availableModels,
+        })
+        .from(llmProviders)
+        .orderBy(asc(llmProviders.sortOrder)),
+      db
+        .select({
+          id: modelProviderMap.id,
+          modelId: modelProviderMap.modelId,
+          providerId: modelProviderMap.providerId,
+          providerName: llmProviders.providerName,
+          providerDisplayName: llmProviders.displayName,
+          modelName: modelProviderMap.modelName,
+          providerModelId: modelProviderMap.providerModelId,
+          pricingInput: modelProviderMap.pricingInput,
+          pricingOutput: modelProviderMap.pricingOutput,
+          isFree: modelProviderMap.isFree,
+          contextLength: modelProviderMap.contextLength,
+          isEnabled: modelProviderMap.isEnabled,
+          priority: modelProviderMap.priority,
+          priorityLocked: modelProviderMap.priorityLocked,
+          apiStyle: modelProviderMap.apiStyle,
+        })
+        .from(modelProviderMap)
+        .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
+        .orderBy(asc(modelProviderMap.modelId), asc(modelProviderMap.priority)),
+    ]);
+
+    return mergeAdminModelCatalogRows({
+      providers: providers as ProviderCatalogRow[],
+      mappings: mappings as ModelMappingListRow[],
+    });
+  }),
+
   bulkSetModelMappingsEnabled: adminProcedure
     .input(z.object({
       ids: z.array(z.number().int()).min(1).max(500),
@@ -81,6 +262,119 @@ export const multiProviderRouter = router({
       };
     }),
 
+  bulkSetAdminModelCatalogEnabled: adminProcedure
+    .input(z.object({
+      items: z.array(z.object({
+        mappingId: z.number().nullable().optional(),
+        modelId: z.string().min(1).max(128),
+        providerId: z.number(),
+        modelName: z.string().min(1).max(512),
+        providerModelId: z.string().min(1).max(256),
+        pricingInput: z.number().min(0),
+        pricingOutput: z.number().min(0),
+        isFree: z.boolean(),
+        contextLength: z.number().int().nonnegative().nullable().optional(),
+        priority: z.number().int().optional(),
+        apiStyle: z.enum(["chat-completions", "responses", "messages", "gemini"]).optional(),
+      })).min(1).max(500),
+      isEnabled: z.boolean(),
+    }))
+    .mutation(async ({ input }) => {
+      const mappedIds = Array.from(new Set(
+        input.items
+          .map((item) => item.mappingId ?? null)
+          .filter((id): id is number => typeof id === "number"),
+      ));
+
+      if (mappedIds.length > 0) {
+        await db
+          .update(modelProviderMap)
+          .set({ isEnabled: input.isEnabled })
+          .where(inArray(modelProviderMap.id, mappedIds));
+      }
+
+      let insertedCount = 0;
+      if (input.isEnabled) {
+        const unmappedItems = input.items.filter((item) => item.mappingId == null);
+        if (unmappedItems.length > 0) {
+          // Pre-load provider availableModels for priority computation
+          const relevantProviderIds = [...new Set(unmappedItems.map((item) => item.providerId))];
+          const providerAvailableModels = await db
+            .select({
+              id: llmProviders.id,
+              availableModels: llmProviders.availableModels,
+            })
+            .from(llmProviders)
+            .where(inArray(llmProviders.id, relevantProviderIds));
+
+          // Build Map<providerModelId, SyncedModel> for O(1) lookup
+          const syncedModelMap = new Map<string, {
+            createdAt?: number;
+            pricing?: { input: number; output: number };
+            contextLength?: number;
+          }>();
+          for (const provider of providerAvailableModels) {
+            for (const model of (provider.availableModels as any[]) ?? []) {
+              syncedModelMap.set(model.id, {
+                createdAt: model.createdAt,
+                pricing: model.pricing,
+                contextLength: model.contextLength,
+              });
+            }
+          }
+
+          await db
+            .insert(modelProviderMap)
+            .values(unmappedItems.map((item) => {
+              const syncedModel = syncedModelMap.get(item.providerModelId);
+              const computedPriority = item.priority ?? computeModelPriority({
+                pricingInput: item.pricingInput,
+                pricingOutput: item.pricingOutput,
+                isFree: item.isFree,
+                contextLength: item.contextLength ?? syncedModel?.contextLength ?? null,
+                createdAt: syncedModel?.createdAt,
+                supportsFunctionTools: false,
+                supportsStructuredOutputs: false,
+                supportsWebSearch: false,
+                supportsCodeExecution: false,
+                supportsComputerUse: false,
+                supportsBackground: false,
+                supportsResponses: false,
+                supportsVision: false,
+              });
+
+              return {
+                modelId: buildCanonicalModelId(item.modelId || item.providerModelId),
+                providerId: item.providerId,
+                modelName: item.modelName.slice(0, 128),
+                providerModelId: item.providerModelId,
+                pricingInput: String(item.pricingInput),
+                pricingOutput: String(item.pricingOutput),
+                isFree: item.isFree,
+                contextLength: item.contextLength ?? null,
+                isEnabled: true,
+                priority: computedPriority,
+                apiStyle: item.apiStyle ?? "chat-completions",
+              };
+            }))
+            .onConflictDoUpdate({
+              target: [modelProviderMap.modelId, modelProviderMap.providerId],
+              set: {
+                isEnabled: true,
+              },
+            });
+          insertedCount = unmappedItems.length;
+        }
+      }
+
+      return {
+        success: true,
+        updatedCount: mappedIds.length,
+        insertedCount,
+        isEnabled: input.isEnabled,
+      };
+    }),
+
   upsertModelMapping: adminProcedure
     .input(
       z.object({
@@ -94,31 +388,55 @@ export const multiProviderRouter = router({
         isFree: z.boolean(),
         contextLength: z.number().int().positive(),
         isEnabled: z.boolean(),
-        priority: z.number().int().default(0),
+        priority: z.number().int().min(0).max(999).optional(),
         apiStyle: z.enum(["chat-completions", "responses", "messages", "gemini"]).default("chat-completions"),
       })
     )
     .mutation(async ({ input }) => {
+      const isExplicitPriority = input.priority !== undefined;
+
       if (input.id) {
+        const setValues: Record<string, any> = {
+          modelId: input.modelId,
+          providerId: input.providerId,
+          modelName: input.modelName,
+          providerModelId: input.providerModelId,
+          pricingInput: String(input.pricingInput),
+          pricingOutput: String(input.pricingOutput),
+          isFree: input.isFree,
+          contextLength: input.contextLength,
+          isEnabled: input.isEnabled,
+          apiStyle: input.apiStyle,
+        };
+        if (isExplicitPriority) {
+          setValues.priority = input.priority;
+          setValues.priorityLocked = true;
+        }
         await db
           .update(modelProviderMap)
-          .set({
-            modelId: input.modelId,
-            providerId: input.providerId,
-            modelName: input.modelName,
-            providerModelId: input.providerModelId,
-            pricingInput: String(input.pricingInput),
-            pricingOutput: String(input.pricingOutput),
-            isFree: input.isFree,
-            contextLength: input.contextLength,
-            isEnabled: input.isEnabled,
-            priority: input.priority,
-            apiStyle: input.apiStyle,
-          })
+          .set(setValues)
           .where(eq(modelProviderMap.id, input.id));
         return { success: true, id: input.id };
       }
 
+      const computedPriority = isExplicitPriority
+        ? input.priority!
+        : computeModelPriority({
+            pricingInput: input.pricingInput,
+            pricingOutput: input.pricingOutput,
+            isFree: input.isFree,
+            contextLength: input.contextLength,
+            createdAt: undefined,
+            supportsFunctionTools: false,
+            supportsStructuredOutputs: false,
+            supportsWebSearch: false,
+            supportsCodeExecution: false,
+            supportsComputerUse: false,
+            supportsBackground: false,
+            supportsResponses: false,
+            supportsVision: false,
+          });
+
       const result = await db
         .insert(modelProviderMap)
         .values({
@@ -131,7 +449,8 @@ export const multiProviderRouter = router({
           isFree: input.isFree,
           contextLength: input.contextLength,
           isEnabled: input.isEnabled,
-          priority: input.priority,
+          priority: computedPriority,
+          priorityLocked: isExplicitPriority,
           apiStyle: input.apiStyle,
         })
         .returning({ id: modelProviderMap.id });
@@ -146,6 +465,35 @@ export const multiProviderRouter = router({
       return { success: true };
     }),
 
+  updateModelPriority: adminProcedure
+    .input(
+      z.object({
+        mappingId: z.number().int(),
+        priority: z.number().int().min(0).max(999),
+      })
+    )
+    .mutation(async ({ input }) => {
+      const result = await db
+        .update(modelProviderMap)
+        .set({
+          priority: input.priority,
+          priorityLocked: true,
+        })
+        .where(eq(modelProviderMap.id, input.mappingId))
+        .returning({
+          id: modelProviderMap.id,
+          modelId: modelProviderMap.modelId,
+          priority: modelProviderMap.priority,
+          priorityLocked: modelProviderMap.priorityLocked,
+        });
+
+      if (!result[0]) {
+        throw new Error(`Mapping ${input.mappingId} not found`);
+      }
+
+      return { success: true as const, mapping: result[0] };
+    }),
+
   // --- Routing Rules CRUD (Admin) ---
 
   listRoutingRules: adminProcedure.query(async () => {
@@ -298,4 +646,40 @@ export const multiProviderRouter = router({
         end: new Date(input.endDate),
       });
     }),
+
+  backfillModelPriorities: adminProcedure
+    .mutation(async () => {
+      const unlockedRows = await db
+        .select()
+        .from(modelProviderMap)
+        .where(eq(modelProviderMap.priorityLocked, false));
+
+      let updatedCount = 0;
+
+      for (const row of unlockedRows) {
+        const priority = computeModelPriority({
+          pricingInput: row.pricingInput ? Number(row.pricingInput) : null,
+          pricingOutput: row.pricingOutput ? Number(row.pricingOutput) : null,
+          isFree: row.isFree,
+          createdAt: undefined,
+          supportsFunctionTools: row.supportsFunctionTools ?? false,
+          supportsStructuredOutputs: row.supportsStructuredOutputs ?? false,
+          supportsWebSearch: row.supportsWebSearch ?? false,
+          supportsCodeExecution: row.supportsCodeExecution ?? false,
+          supportsComputerUse: row.supportsComputerUse ?? false,
+          supportsBackground: row.supportsBackground ?? false,
+          supportsResponses: row.supportsResponses ?? false,
+          supportsVision: row.supportsVision ?? false,
+        });
+
+        await db
+          .update(modelProviderMap)
+          .set({ priority })
+          .where(eq(modelProviderMap.id, row.id));
+
+        updatedCount++;
+      }
+
+      return { success: true as const, updatedCount };
+    }),
 });
