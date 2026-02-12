import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { modelProviderMap, llmProviders, routingRules } from "../../drizzle/schema";
import { eq, and, asc } from "drizzle-orm";
import { getHealthSummary } from "../services/providerHealth";
import { getAdminUsageStats, getUserUsageStats } from "../services/costTracker";

export const multiProviderRouter = router({
  // --- Model Mapping CRUD (Admin) ---

  listModelMappings: adminProcedure.query(async () => {
    const rows = await db
      .select({
        id: modelProviderMap.id,
        modelId: modelProviderMap.modelId,
        providerId: modelProviderMap.providerId,
        providerName: llmProviders.providerName,
        modelName: modelProviderMap.modelName,
        providerModelId: modelProviderMap.providerModelId,
        pricingInput: modelProviderMap.pricingInput,
        pricingOutput: modelProviderMap.pricingOutput,
        isFree: modelProviderMap.isFree,
        contextLength: modelProviderMap.contextLength,
        isEnabled: modelProviderMap.isEnabled,
        priority: modelProviderMap.priority,
        apiStyle: modelProviderMap.apiStyle,
      })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .orderBy(asc(modelProviderMap.modelId), asc(modelProviderMap.priority));

    // Group by modelId
    const grouped: Record<string, typeof rows> = {};
    for (const row of rows) {
      if (!grouped[row.modelId]) grouped[row.modelId] = [];
      grouped[row.modelId].push(row);
    }
    return grouped;
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
        priority: z.number().int().default(0),
        apiStyle: z.enum(["chat-completions", "responses", "messages", "gemini"]).default("chat-completions"),
      })
    )
    .mutation(async ({ input }) => {
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
            priority: input.priority,
            apiStyle: input.apiStyle,
          })
          .where(eq(modelProviderMap.id, input.id));
        return { success: true, id: input.id };
      }

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
          priority: input.priority,
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
    // 1. Get explicitly configured models from model_provider_map
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

    // 2. Get all enabled providers with their availableModels
    const providers = await db
      .select({
        id: llmProviders.id,
        providerName: llmProviders.providerName,
        availableModels: llmProviders.availableModels,
      })
      .from(llmProviders)
      .where(eq(llmProviders.isEnabled, true));

    // 3. Build a map of explicitly configured models (from model_provider_map)
    const configuredModels = new Set<string>();
    const modelProviders: Record<string, { modelId: string; modelName: string; providers: any[] }> = {};

    for (const row of mappedRows) {
      const key = `${row.modelId}:${row.providerId}`;
      configuredModels.add(key);

      if (!modelProviders[row.modelId]) {
        modelProviders[row.modelId] = { modelId: row.modelId, modelName: row.modelName, providers: [] };
      }
      modelProviders[row.modelId].providers.push(row);
    }

    // 4. Add models from provider.availableModels that aren't in model_provider_map
    for (const provider of providers) {
      if (!provider.availableModels || !Array.isArray(provider.availableModels)) continue;

      for (const model of provider.availableModels as any[]) {
        if (!model.id || !model.name) continue;

        const key = `${model.id}:${provider.id}`;

        // Skip if already configured in model_provider_map
        if (configuredModels.has(key)) continue;

        // Add unconfigured model with provider info
        if (!modelProviders[model.id]) {
          modelProviders[model.id] = { modelId: model.id, modelName: model.name, providers: [] };
        }

        modelProviders[model.id].providers.push({
          modelId: model.id,
          modelName: model.name,
          providerId: provider.id,
          providerName: provider.providerName,
          providerModelId: model.id,
          pricingInput: model.pricing?.input?.toString() || "0",
          pricingOutput: model.pricing?.output?.toString() || "0",
          isFree: (model.pricing?.input === 0 && model.pricing?.output === 0) || false,
          isEnabled: true,
          contextLength: model.contextLength || null,
        });
      }
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
});
