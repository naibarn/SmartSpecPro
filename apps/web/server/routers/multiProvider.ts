import { z } from "zod";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { modelProviderMap, llmProviders, routingRules } from "../../drizzle/schema";
import { eq, and, asc, inArray } from "drizzle-orm";
import { getHealthSummary } from "../services/providerHealth";
import { getAdminUsageStats, getUserUsageStats } from "../services/costTracker";
import { computeModelPriority } from "../services/intelligentModelSelector";

export interface ModelMappingListRow {
  id: number;
  modelId: string;
  providerId: number;
  providerName: string;
  providerDisplayName: string;
  modelName: string;
  providerModelId: string;
  pricingInput: string;
  pricingOutput: string;
  isFree: boolean;
  contextLength: number | null;
  isEnabled: boolean;
  priority: number;
  priorityLocked: boolean;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
}

interface ProviderCatalogModel {
  id: string;
  name: string;
  contextLength?: number;
  pricing?: {
    input?: number;
    output?: number;
  };
}

interface ProviderCatalogRow {
  id: number;
  providerName: string;
  providerDisplayName: string;
  availableModels: ProviderCatalogModel[] | null;
}

export interface AdminModelCatalogRow {
  mappingId: number | null;
  isMapped: boolean;
  modelId: string;
  providerId: number;
  providerName: string;
  providerDisplayName: string;
  modelName: string;
  providerModelId: string;
  pricingInput: string;
  pricingOutput: string;
  isFree: boolean;
  contextLength: number | null;
  isEnabled: boolean;
  priority: number;
  priorityLocked: boolean;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
}

function defaultApiStyleForProvider(providerName: string): AdminModelCatalogRow["apiStyle"] {
  switch (providerName.toLowerCase()) {
    case "openai":
      return "responses";
    case "anthropic":
      return "messages";
    case "google":
      return "gemini";
    default:
      return "chat-completions";
  }
}

function buildCanonicalModelId(providerModelId: string) {
  if (providerModelId.length <= 128) {
    return providerModelId;
  }

  const normalized = providerModelId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 115) || "model";
  const hash = createHash("sha1").update(providerModelId).digest("hex").slice(0, 12);
  return `${normalized}-${hash}`.slice(0, 128);
}

export function mergeAdminModelCatalogRows(input: {
  providers: ProviderCatalogRow[];
  mappings: ModelMappingListRow[];
}): AdminModelCatalogRow[] {
  const rows = new Map<string, AdminModelCatalogRow>();

  for (const mapping of input.mappings) {
    rows.set(`${mapping.providerId}:${mapping.providerModelId}`, {
      mappingId: mapping.id,
      isMapped: true,
      modelId: mapping.modelId,
      providerId: mapping.providerId,
      providerName: mapping.providerName,
      providerDisplayName: mapping.providerDisplayName,
      modelName: mapping.modelName,
      providerModelId: mapping.providerModelId,
      pricingInput: mapping.pricingInput,
      pricingOutput: mapping.pricingOutput,
      isFree: mapping.isFree,
      contextLength: mapping.contextLength,
      isEnabled: mapping.isEnabled,
      priority: mapping.priority,
      priorityLocked: mapping.priorityLocked,
      apiStyle: mapping.apiStyle,
    });
  }

  for (const provider of input.providers) {
    for (const model of provider.availableModels ?? []) {
      const key = `${provider.id}:${model.id}`;
      if (rows.has(key)) {
        continue;
      }

      const pricingInput = model.pricing?.input ?? 0;
      const pricingOutput = model.pricing?.output ?? 0;

      rows.set(key, {
        mappingId: null,
        isMapped: false,
        modelId: buildCanonicalModelId(model.id),
        providerId: provider.id,
        providerName: provider.providerName,
        providerDisplayName: provider.providerDisplayName,
        modelName: model.name || model.id,
        providerModelId: model.id,
        pricingInput: String(pricingInput),
        pricingOutput: String(pricingOutput),
        isFree: pricingInput === 0 && pricingOutput === 0,
        contextLength: model.contextLength ?? null,
        isEnabled: false,
        priority: 0,
        priorityLocked: false,
        apiStyle: defaultApiStyleForProvider(provider.providerName),
      });
    }
  }

  return Array.from(rows.values()).sort((left, right) => {
    const nameCompare = left.modelName.localeCompare(right.modelName);
    if (nameCompare !== 0) {
      return nameCompare;
    }

    const providerCompare = left.providerDisplayName.localeCompare(right.providerDisplayName);
    if (providerCompare !== 0) {
      return providerCompare;
    }

    return left.providerModelId.localeCompare(right.providerModelId);
  });
}

export function groupModelMappingsByModelId(rows: ModelMappingListRow[]) {
  return rows.reduce<Record<string, ModelMappingListRow[]>>((grouped, row) => {
    if (!grouped[row.modelId]) {
      grouped[row.modelId] = [];
    }
    grouped[row.modelId]!.push(row);
    return grouped;
  }, {});
}

export const multiProviderRouter = router({
  // --- Model Mapping CRUD (Admin) ---

  listModelMappings: adminProcedure.query(async () => {
    const rows = await db
      .select({
        id: modelProviderMap.id,
        modelId: modelProviderMap.modelId,
        providerId: modelProviderMap.providerId,
        providerName: llmProviders.providerName,
        providerDisplayName: llmProviders.displayName,
        modelName: modelProviderMap.modelName,
        providerModelId: modelProviderMap.providerModelId,
        pricingInput: modelProviderMap.pricingInput,
        pricingOutput: modelProviderMap.pricingOutput,
        isFree: modelProviderMap.isFree,
        contextLength: modelProviderMap.contextLength,
        isEnabled: modelProviderMap.isEnabled,
        priority: modelProviderMap.priority,
        priorityLocked: modelProviderMap.priorityLocked,
        apiStyle: modelProviderMap.apiStyle,
      })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .orderBy(asc(modelProviderMap.modelId), asc(modelProviderMap.priority));

    return groupModelMappingsByModelId(rows as ModelMappingListRow[]);
  }),

  listAdminModelCatalog: adminProcedure.query(async () => {
    const [providers, mappings] = await Promise.all([
      db
        .select({
          id: llmProviders.id,
          providerName: llmProviders.providerName,
          providerDisplayName: llmProviders.displayName,
          availableModels: llmProviders.availableModels,
        })
        .from(llmProviders)
        .orderBy(asc(llmProviders.sortOrder)),
      db
        .select({
          id: modelProviderMap.id,
          modelId: modelProviderMap.modelId,
          providerId: modelProviderMap.providerId,
          providerName: llmProviders.providerName,
          providerDisplayName: llmProviders.displayName,
          modelName: modelProviderMap.modelName,
          providerModelId: modelProviderMap.providerModelId,
          pricingInput: modelProviderMap.pricingInput,
          pricingOutput: modelProviderMap.pricingOutput,
          isFree: modelProviderMap.isFree,
          contextLength: modelProviderMap.contextLength,
          isEnabled: modelProviderMap.isEnabled,
          priority: modelProviderMap.priority,
          priorityLocked: modelProviderMap.priorityLocked,
          apiStyle: modelProviderMap.apiStyle,
        })
        .from(modelProviderMap)
        .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
        .orderBy(asc(modelProviderMap.modelId), asc(modelProviderMap.priority)),
    ]);

    return mergeAdminModelCatalogRows({
      providers: providers as ProviderCatalogRow[],
      mappings: mappings as ModelMappingListRow[],
    });
  }),

  bulkSetModelMappingsEnabled: adminProcedure
    .input(z.object({
      ids: z.array(z.number().int()).min(1).max(500),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const uniqueIds = Array.from(new Set(input.ids));

      await db
        .update(modelProviderMap)
        .set({ isEnabled: input.isEnabled })
        .where(inArray(modelProviderMap.id, uniqueIds));

      return {
        success: true,
        updatedCount: uniqueIds.length,
        isEnabled: input.isEnabled,
      };
    }),

  bulkSetAdminModelCatalogEnabled: adminProcedure
    .input(z.object({
      items: z.array(z.object({
        mappingId: z.number().nullable().optional(),
        modelId: z.string().min(1).max(128),
        providerId: z.number(),
        modelName: z.string().min(1).max(512),
        providerModelId: z.string().min(1).max(256),
        pricingInput: z.number().min(0),
        pricingOutput: z.number().min(0),
        isFree: z.boolean(),
        contextLength: z.number().int().nonnegative().nullable().optional(),
        priority: z.number().int().optional(),
        apiStyle: z.enum(["chat-completions", "responses", "messages", "gemini"]).optional(),
      })).min(1).max(500),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ input }) => {
      const mappedIds = Array.from(new Set(
        input.items
          .map((item) => item.mappingId ?? null)
          .filter((id): id is number => typeof id === "number"),
      ));

      if (mappedIds.length > 0) {
        await db
          .update(modelProviderMap)
          .set({ isEnabled: input.isEnabled })
          .where(inArray(modelProviderMap.id, mappedIds));
      }

      let insertedCount = 0;
      if (input.isEnabled) {
        const unmappedItems = input.items.filter((item) => item.mappingId == null);
        if (unmappedItems.length > 0) {
          // Pre-load provider availableModels for priority computation
          const relevantProviderIds = [...new Set(unmappedItems.map((item) => item.providerId))];
          const providerAvailableModels = await db
            .select({
              id: llmProviders.id,
              availableModels: llmProviders.availableModels,
            })
            .from(llmProviders)
            .where(inArray(llmProviders.id, relevantProviderIds));

          // Build Map<providerModelId, SyncedModel> for O(1) lookup
          const syncedModelMap = new Map<string, {
            createdAt?: number;
            pricing?: { input: number; output: number };
            contextLength?: number;
          }>();
          for (const provider of providerAvailableModels) {
            const models = Array.isArray(provider.availableModels) ? provider.availableModels : [];
            for (const model of models) {
              syncedModelMap.set(model.id, {
                createdAt: model.createdAt,
                pricing: model.pricing,
                contextLength: model.contextLength,
              });
            }
          }

          await db
            .insert(modelProviderMap)
            .values(unmappedItems.map((item) => {
              const syncedModel = syncedModelMap.get(item.providerModelId);
              const computedPriority = item.priority ?? computeModelPriority({
                pricingInput: item.pricingInput,
                pricingOutput: item.pricingOutput,
                isFree: item.isFree,
                contextLength: item.contextLength ?? syncedModel?.contextLength ?? null,
                createdAt: syncedModel?.createdAt,
                supportsFunctionTools: false,
                supportsStructuredOutputs: false,
                supportsWebSearch: false,
                supportsCodeExecution: false,
                supportsComputerUse: false,
                supportsBackground: false,
                supportsResponses: false,
                supportsVision: false,
              });

              return {
                modelId: buildCanonicalModelId(item.modelId || item.providerModelId),
                providerId: item.providerId,
                modelName: item.modelName.slice(0, 128),
                providerModelId: item.providerModelId,
                pricingInput: String(item.pricingInput),
                pricingOutput: String(item.pricingOutput),
                isFree: item.isFree,
                contextLength: item.contextLength ?? null,
                isEnabled: true,
                priority: computedPriority,
                apiStyle: item.apiStyle ?? "chat-completions",
              };
            }))
            .onConflictDoUpdate({
              target: [modelProviderMap.modelId, modelProviderMap.providerId],
              set: {
                isEnabled: true,
              },
            });
          insertedCount = unmappedItems.length;
        }
      }

      return {
        success: true,
        updatedCount: mappedIds.length,
        insertedCount,
        isEnabled: input.isEnabled,
      };
    }),

  upsertModelMapping: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        modelId: z.string().min(1).max(128),
        providerId: z.number(),
        modelName: z.string().min(1).max(128),
        providerModelId: z.string().min(1).max(256),
        pricingInput: z.number().min(0),
        pricingOutput: z.number().min(0),
        isFree: z.boolean(),
        contextLength: z.number().int().positive(),
        isEnabled: z.boolean(),
        priority: z.number().int().min(0).max(999).optional(),
        apiStyle: z.enum(["chat-completions", "responses", "messages", "gemini"]).default("chat-completions"),
      })
    )
    .mutation(async ({ input }) => {
      const isExplicitPriority = input.priority !== undefined;

      if (input.id) {
        await db
          .update(modelProviderMap)
          .set({
            modelId: input.modelId,
            providerId: input.providerId,
            modelName: input.modelName,
            providerModelId: input.providerModelId,
            pricingInput: String(input.pricingInput),
            pricingOutput: String(input.pricingOutput),
            isFree: input.isFree,
            contextLength: input.contextLength,
            isEnabled: input.isEnabled,
            apiStyle: input.apiStyle,
            ...(isExplicitPriority ? { priority: input.priority, priorityLocked: true } : {}),
          })
          .where(eq(modelProviderMap.id, input.id));
        return { success: true, id: input.id };
      }

      const computedPriority = isExplicitPriority
        ? input.priority!
        : computeModelPriority({
            pricingInput: input.pricingInput,
            pricingOutput: input.pricingOutput,
            isFree: input.isFree,
            contextLength: input.contextLength,
            createdAt: undefined,
            supportsFunctionTools: false,
            supportsStructuredOutputs: false,
            supportsWebSearch: false,
            supportsCodeExecution: false,
            supportsComputerUse: false,
            supportsBackground: false,
            supportsResponses: false,
            supportsVision: false,
          });

      const result = await db
        .insert(modelProviderMap)
        .values({
          modelId: input.modelId,
          providerId: input.providerId,
          modelName: input.modelName,
          providerModelId: input.providerModelId,
          pricingInput: String(input.pricingInput),
          pricingOutput: String(input.pricingOutput),
          isFree: input.isFree,
          contextLength: input.contextLength,
          isEnabled: input.isEnabled,
          priority: computedPriority,
          priorityLocked: isExplicitPriority,
          apiStyle: input.apiStyle,
        })
        .returning({ id: modelProviderMap.id });

      return { success: true, id: result[0]?.id };
    }),

  deleteModelMapping: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(modelProviderMap).where(eq(modelProviderMap.id, input.id));
      return { success: true };
    }),

  updateModelPriority: adminProcedure
    .input(
      z.object({
        mappingId: z.number().int(),
        priority: z.number().int().min(0).max(999),
      })
    )
    .mutation(async ({ input }) => {
      const result = await db
        .update(modelProviderMap)
        .set({
          priority: input.priority,
          priorityLocked: true,
        })
        .where(eq(modelProviderMap.id, input.mappingId))
        .returning({
          id: modelProviderMap.id,
          modelId: modelProviderMap.modelId,
          priority: modelProviderMap.priority,
          priorityLocked: modelProviderMap.priorityLocked,
        });

      if (!result[0]) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Model mapping not found" });
      }

      return { success: true as const, mapping: result[0] };
    }),

  // --- Routing Rules CRUD (Admin) ---

  listRoutingRules: adminProcedure.query(async () => {
    const rules = await db
      .select()
      .from(routingRules)
      .orderBy(asc(routingRules.modelPattern));

    // Sort: exact matches first, then globs, then wildcard
    return rules.sort((a: (typeof rules)[number], b: (typeof rules)[number]) => {
      const aHasWild = a.modelPattern.includes("*");
      const bHasWild = b.modelPattern.includes("*");
      if (!aHasWild && bHasWild) return -1;
      if (aHasWild && !bHasWild) return 1;
      if (a.modelPattern === "*") return 1;
      if (b.modelPattern === "*") return -1;
      return a.modelPattern.localeCompare(b.modelPattern);
    });
  }),

  upsertRoutingRule: adminProcedure
    .input(
      z.object({
        id: z.number().optional(),
        modelPattern: z.string().min(1).max(128),
        routingMode: z.enum(["cost", "quality", "priority"]),
        providerOrder: z.array(z.number()).optional(),
        maxFallbacks: z.number().int().min(0).max(10).default(3),
        isActive: z.boolean().default(true),
      })
    )
    .mutation(async ({ input }) => {
      if (input.routingMode === "priority" && (!input.providerOrder || input.providerOrder.length === 0)) {
        throw new Error("providerOrder is required when routingMode is 'priority'");
      }

      const values = {
        modelPattern: input.modelPattern,
        routingMode: input.routingMode,
        providerOrder: input.providerOrder ?? null,
        maxFallbacks: input.maxFallbacks,
        isActive: input.isActive,
      };

      if (input.id) {
        await db.update(routingRules).set(values).where(eq(routingRules.id, input.id));
        return { success: true, id: input.id };
      }

      const result = await db.insert(routingRules).values(values).returning({ id: routingRules.id });
      return { success: true, id: result[0]?.id };
    }),

  deleteRoutingRule: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(routingRules).where(eq(routingRules.id, input.id));
      return { success: true };
    }),

  // --- Provider Health (Admin) ---

  getProviderHealth: adminProcedure.query(async () => {
    const summary = getHealthSummary();
    const providers = await db
      .select({
        id: llmProviders.id,
        providerName: llmProviders.providerName,
        lastHealthCheck: llmProviders.lastHealthCheck,
      })
      .from(llmProviders)
      .where(eq(llmProviders.isEnabled, true));

    return providers.map((p: (typeof providers)[number]) => {
      const state = summary.get(p.id);
      return {
        providerId: p.id,
        providerName: p.providerName,
        status: state?.status ?? "healthy",
        failureCount: state?.failureCount ?? 0,
        successCount: state?.successCount ?? 0,
        lastHealthCheck: p.lastHealthCheck,
      };
    });
  }),

  // --- Usage Stats (Admin) ---

  getAdminUsageStats: adminProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        providerId: z.number().optional(),
        userId: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      return getAdminUsageStats({
        dateRange: { start: new Date(input.startDate), end: new Date(input.endDate) },
        providerId: input.providerId,
        userId: input.userId,
      });
    }),

  // --- User Endpoints ---

  getAvailableModelsWithProviders: protectedProcedure.query(async () => {
    // Return only enabled mappings from enabled providers.
    const mappedRows = await db
      .select({
        modelId: modelProviderMap.modelId,
        modelName: modelProviderMap.modelName,
        providerId: modelProviderMap.providerId,
        providerName: llmProviders.providerName,
        providerModelId: modelProviderMap.providerModelId,
        pricingInput: modelProviderMap.pricingInput,
        pricingOutput: modelProviderMap.pricingOutput,
        isFree: modelProviderMap.isFree,
        isEnabled: modelProviderMap.isEnabled,
        contextLength: modelProviderMap.contextLength,
      })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(and(eq(modelProviderMap.isEnabled, true), eq(llmProviders.isEnabled, true)))
      .orderBy(asc(modelProviderMap.modelId), asc(modelProviderMap.priority));

    const modelProviders: Record<string, { modelId: string; modelName: string; providers: any[] }> = {};

    for (const row of mappedRows) {
      if (!modelProviders[row.modelId]) {
        modelProviders[row.modelId] = { modelId: row.modelId, modelName: row.modelName, providers: [] };
      }
      modelProviders[row.modelId].providers.push(row);
    }

    return Object.values(modelProviders);
  }),

  getUserUsageStats: protectedProcedure
    .input(
      z.object({
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      })
    )
    .query(async ({ ctx, input }) => {
      return getUserUsageStats(ctx.user!.id, {
        start: new Date(input.startDate),
        end: new Date(input.endDate),
      });
    }),

  backfillModelPriorities: adminProcedure
    .mutation(async () => {
      const unlockedRows = await db
        .select()
        .from(modelProviderMap)
        .where(eq(modelProviderMap.priorityLocked, false));

      const updates = unlockedRows.map((row: typeof unlockedRows[number]) => {
        const priority = computeModelPriority({
          pricingInput: row.pricingInput ? Number(row.pricingInput) : null,
          pricingOutput: row.pricingOutput ? Number(row.pricingOutput) : null,
          isFree: row.isFree,
          createdAt: undefined,
          supportsFunctionTools: row.supportsFunctionTools ?? false,
          supportsStructuredOutputs: row.supportsStructuredOutputs ?? false,
          supportsWebSearch: row.supportsWebSearch ?? false,
          supportsCodeExecution: row.supportsCodeExecution ?? false,
          supportsComputerUse: row.supportsComputerUse ?? false,
          supportsBackground: row.supportsBackground ?? false,
          supportsResponses: row.supportsResponses ?? false,
          supportsVision: row.supportsVision ?? false,
        });
        return db
          .update(modelProviderMap)
          .set({ priority })
          .where(eq(modelProviderMap.id, row.id));
      });

      await Promise.all(updates);

      return { success: true as const, updatedCount: updates.length };
    }),
});
