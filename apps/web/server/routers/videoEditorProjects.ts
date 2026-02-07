/**
 * Video Editor Projects tRPC Router
 * CRUD operations for persistent video editor project storage with auto-save support.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { videoEditorProjects } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export const videoEditorProjectsRouter = router({
  /** List user's projects, sorted by most recently updated */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { projects: [], total: 0 };

      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;

      const [projects, [{ total }]] = await Promise.all([
        db
          .select({
            id: videoEditorProjects.id,
            name: videoEditorProjects.name,
            thumbnailUrl: videoEditorProjects.thumbnailUrl,
            duration: videoEditorProjects.duration,
            resolution: videoEditorProjects.resolution,
            trackCount: videoEditorProjects.trackCount,
            clipCount: videoEditorProjects.clipCount,
            isAutoSave: videoEditorProjects.isAutoSave,
            createdAt: videoEditorProjects.createdAt,
            updatedAt: videoEditorProjects.updatedAt,
          })
          .from(videoEditorProjects)
          .where(eq(videoEditorProjects.userId, ctx.user.id))
          .orderBy(desc(videoEditorProjects.updatedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(videoEditorProjects)
          .where(eq(videoEditorProjects.userId, ctx.user.id)),
      ]);

      return { projects, total };
    }),

  /** Get a single project by ID (with ownership check) */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const [project] = await db
        .select()
        .from(videoEditorProjects)
        .where(
          and(
            eq(videoEditorProjects.id, input.id),
            eq(videoEditorProjects.userId, ctx.user.id)
          )
        )
        .limit(1);

      return project ?? null;
    }),

  /** Save (create or update) a project */
  save: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(256),
        projectData: z.any(),
        thumbnailUrl: z.string().optional(),
        duration: z.number().optional(),
        resolution: z.string().optional(),
        trackCount: z.number().optional(),
        clipCount: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const now = new Date();

      if (input.id) {
        // Update — verify ownership first
        const [existing] = await db
          .select({ id: videoEditorProjects.id })
          .from(videoEditorProjects)
          .where(
            and(
              eq(videoEditorProjects.id, input.id),
              eq(videoEditorProjects.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (!existing) throw new Error("Project not found");

        await db
          .update(videoEditorProjects)
          .set({
            name: input.name,
            projectData: input.projectData,
            thumbnailUrl: input.thumbnailUrl,
            duration: input.duration?.toString(),
            resolution: input.resolution,
            trackCount: input.trackCount,
            clipCount: input.clipCount,
            isAutoSave: false,
            updatedAt: now,
          })
          .where(eq(videoEditorProjects.id, input.id));

        return { id: input.id };
      } else {
        // Create new
        const [inserted] = await db
          .insert(videoEditorProjects)
          .values({
            userId: ctx.user.id,
            name: input.name,
            projectData: input.projectData,
            thumbnailUrl: input.thumbnailUrl,
            duration: input.duration?.toString(),
            resolution: input.resolution,
            trackCount: input.trackCount,
            clipCount: input.clipCount,
            isAutoSave: false,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: videoEditorProjects.id });

        return { id: inserted.id };
      }
    }),

  /** Auto-save — lightweight update of projectData only */
  autoSave: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        projectData: z.any(),
        clipCount: z.number().optional(),
        duration: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const result = await db
        .update(videoEditorProjects)
        .set({
          projectData: input.projectData,
          clipCount: input.clipCount,
          duration: input.duration?.toString(),
          isAutoSave: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(videoEditorProjects.id, input.id),
            eq(videoEditorProjects.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /** Delete a project (with ownership check) */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .delete(videoEditorProjects)
        .where(
          and(
            eq(videoEditorProjects.id, input.id),
            eq(videoEditorProjects.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /** Rename a project */
  rename: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(256),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .update(videoEditorProjects)
        .set({
          name: input.name,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(videoEditorProjects.id, input.id),
            eq(videoEditorProjects.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),
});
