/**
 * Media Models tRPC Router
 * CRUD operations for AI generation models (Nano Banana Pro, Flux, Veo, etc.)
 */

import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { mediaModels } from "../../drizzle/schema";
import { eq, asc, desc, and, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { clearModelCache } from "../services/modelRegistry";
import { clearSkillRegistryCache } from "../services/skillRegistry";

// Zod schemas
const mediaModelTypeSchema = z.enum(["image", "video", "audio"]);

const createModelSchema = z.object({
  modelId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  description: z.string().optional(),
  modelType: mediaModelTypeSchema,
  provider: z.string().min(1).max(64),
  aliases: z.array(z.string()).default([]),
  creditCost: z.number().int().min(0).default(10),
  aspectRatios: z.array(z.string()).optional(),
  sizes: z.array(z.string()).optional(),
  durations: z.array(z.number()).optional(),
  voices: z.array(z.string()).optional(),
  configJson: z.record(z.any()).optional(),
  isEnabled: z.boolean().default(true),
  priority: z.number().int().default(99),
  sortOrder: z.number().int().default(0),
});

const updateModelSchema = z.object({
  id: z.number(),
  modelId: z.string().min(1).max(128).optional(),
  name: z.string().min(1).max(128).optional(),
  description: z.string().nullable().optional(),
  modelType: mediaModelTypeSchema.optional(),
  provider: z.string().min(1).max(64).optional(),
  aliases: z.array(z.string()).optional(),
  creditCost: z.number().int().min(0).optional(),
  aspectRatios: z.array(z.string()).nullable().optional(),
  sizes: z.array(z.string()).nullable().optional(),
  durations: z.array(z.number()).nullable().optional(),
  voices: z.array(z.string()).nullable().optional(),
  configJson: z.record(z.any()).nullable().optional(),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
});

export const mediaModelsRouter = router({
  // ==================== Admin Operations ====================

  /**
   * List all models (admin)
   */
  adminList: adminProcedure
    .input(z.object({
      type: mediaModelTypeSchema.optional(),
      provider: z.string().optional(),
      search: z.string().optional(),
      includeDisabled: z.boolean().default(true),
    }).optional())
    .query(async ({ input }) => {
      try {
        const conditions = [];

        if (input?.type) {
          conditions.push(eq(mediaModels.modelType, input.type));
        }

        if (input?.provider) {
          conditions.push(eq(mediaModels.provider, input.provider));
        }

        if (!input?.includeDisabled) {
          conditions.push(eq(mediaModels.isEnabled, true));
        }

        if (input?.search) {
          conditions.push(
            sql`(${mediaModels.name} ILIKE ${`%${input.search}%`} OR ${mediaModels.modelId} ILIKE ${`%${input.search}%`})`
          );
        }

        const models = await db
          .select()
          .from(mediaModels)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority));

        return models;
      } catch (error: any) {
        console.warn("[MediaModels] List query failed:", error.message);
        return [];
      }
    }),

  /**
   * Get single model by ID
   */
  adminGet: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const [model] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.id, input.id));

      if (!model) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      return model;
    }),

  /**
   * Get model by modelId
   */
  getByModelId: adminProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      const [model] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.modelId, input.modelId));

      return model || null;
    }),

  /**
   * Create new model
   */
  create: adminProcedure
    .input(createModelSchema)
    .mutation(async ({ input }) => {
      // Check if modelId already exists
      const [existing] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.modelId, input.modelId));

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Model with ID '${input.modelId}' already exists`,
        });
      }

      const [model] = await db
        .insert(mediaModels)
        .values({
          modelId: input.modelId,
          name: input.name,
          description: input.description,
          modelType: input.modelType,
          provider: input.provider,
          aliases: input.aliases,
          creditCost: input.creditCost,
          aspectRatios: input.aspectRatios,
          sizes: input.sizes,
          durations: input.durations,
          voices: input.voices,
          configJson: input.configJson,
          isEnabled: input.isEnabled,
          priority: input.priority,
          sortOrder: input.sortOrder,
        })
        .returning();

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return model;
    }),

  /**
   * Update model
   */
  update: adminProcedure
    .input(updateModelSchema)
    .mutation(async ({ input }) => {
      const { id, ...data } = input;

      // Check if model exists
      const [existing] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.id, id));

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      // Check if new modelId conflicts
      if (data.modelId && data.modelId !== existing.modelId) {
        const [conflict] = await db
          .select()
          .from(mediaModels)
          .where(eq(mediaModels.modelId, data.modelId));

        if (conflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Model with ID '${data.modelId}' already exists`,
          });
        }
      }

      const [updated] = await db
        .update(mediaModels)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(mediaModels.id, id))
        .returning();

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return updated;
    }),

  /**
   * Delete model
   */
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [deleted] = await db
        .delete(mediaModels)
        .where(eq(mediaModels.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return { success: true };
    }),

  /**
   * Toggle model enabled/disabled
   */
  toggleEnabled: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const [model] = await db
        .select()
        .from(mediaModels)
        .where(eq(mediaModels.id, input.id));

      if (!model) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Model not found",
        });
      }

      const [updated] = await db
        .update(mediaModels)
        .set({
          isEnabled: !model.isEnabled,
          updatedAt: new Date(),
        })
        .where(eq(mediaModels.id, input.id))
        .returning();

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return updated;
    }),

  /**
   * Reorder models (update sortOrder)
   */
  reorder: adminProcedure
    .input(z.object({
      items: z.array(z.object({
        id: z.number(),
        sortOrder: z.number(),
      })),
    }))
    .mutation(async ({ input }) => {
      for (const item of input.items) {
        await db
          .update(mediaModels)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(mediaModels.id, item.id));
      }

      // Clear caches so changes take effect immediately
      clearModelCache();
      clearSkillRegistryCache();

      return { success: true };
    }),

  /**
   * Get statistics
   */
  stats: adminProcedure.query(async () => {
    try {
      const models = await db.select().from(mediaModels);

      return {
        total: models.length,
        enabled: models.filter(m => m.isEnabled).length,
        byType: {
          image: models.filter(m => m.modelType === "image").length,
          video: models.filter(m => m.modelType === "video").length,
          audio: models.filter(m => m.modelType === "audio").length,
        },
        providers: [...new Set(models.map(m => m.provider))],
      };
    } catch (error: any) {
      console.warn("[MediaModels] Stats query failed:", error.message);
      return {
        total: 0,
        enabled: 0,
        byType: { image: 0, video: 0, audio: 0 },
        providers: [],
      };
    }
  }),

  // ==================== Public Operations ====================

  /**
   * List enabled models (for clients)
   * Returns { models: [...], providers: [...] } for UI consumption
   */
  list: protectedProcedure
    .input(z.object({
      type: mediaModelTypeSchema.optional(),
      search: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      try {
        const conditions = [eq(mediaModels.isEnabled, true)];

        if (input?.type) {
          conditions.push(eq(mediaModels.modelType, input.type));
        }

        if (input?.search) {
          conditions.push(
            sql`(${mediaModels.name} ILIKE ${`%${input.search}%`} OR ${mediaModels.modelId} ILIKE ${`%${input.search}%`} OR ${mediaModels.provider} ILIKE ${`%${input.search}%`})`
          );
        }

        const models = await db
          .select({
            id: mediaModels.id,
            modelId: mediaModels.modelId,
            name: mediaModels.name,
            description: mediaModels.description,
            modelType: mediaModels.modelType,
            provider: mediaModels.provider,
            creditCost: mediaModels.creditCost,
            aspectRatios: mediaModels.aspectRatios,
            sizes: mediaModels.sizes,
            durations: mediaModels.durations,
            voices: mediaModels.voices,
            priority: mediaModels.priority,
            configJson: mediaModels.configJson,
          })
          .from(mediaModels)
          .where(and(...conditions))
          .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority));

        // Get unique providers for grouping
        const providers = [...new Set(models.map(m => m.provider))];

        return { models, providers };
      } catch (error: any) {
        console.warn("[MediaModels] Public list query failed:", error.message);
        return { models: [], providers: [] };
      }
    }),

  /**
   * Get available providers
   */
  providers: adminProcedure.query(async () => {
    try {
      const result = await db
        .selectDistinct({ provider: mediaModels.provider })
        .from(mediaModels);

      return result.map(r => r.provider);
    } catch (error: any) {
      return [];
    }
  }),
});
