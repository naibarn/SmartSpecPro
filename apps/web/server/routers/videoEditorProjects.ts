/**
 * Video Editor Projects tRPC Router
 * CRUD operations for persistent video editor project storage with auto-save support.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { mediaStudioStoryboardReviews, videoEditorProjects } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export function getReviewDataUpdatedAt(reviewData: unknown): number {
  if (!reviewData || typeof reviewData !== "object") return 0;
  const updatedAt = (reviewData as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0;
}

function getTaskUpdatedAt(task: unknown): number {
  if (!task || typeof task !== "object") return 0;
  const updatedAt = (task as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === "number" && Number.isFinite(updatedAt) ? updatedAt : 0;
}

function getTaskId(task: unknown): string | null {
  if (!task || typeof task !== "object") return null;
  const id = (task as { id?: unknown }).id;
  return typeof id === "string" && id.trim().length > 0 ? id : null;
}

function getTaskUrl(task: unknown): string {
  if (!task || typeof task !== "object") return "";
  const url = (task as { url?: unknown }).url;
  return typeof url === "string" ? url : "";
}

export function mergeFresherExistingReviewTasks(
  existingReviewData: unknown,
  incomingReviewData: unknown,
): unknown {
  if (!existingReviewData || typeof existingReviewData !== "object") return incomingReviewData;
  if (!incomingReviewData || typeof incomingReviewData !== "object") return incomingReviewData;

  const existingTasks = (existingReviewData as { tasks?: unknown }).tasks;
  const incomingTasks = (incomingReviewData as { tasks?: unknown }).tasks;
  if (!Array.isArray(existingTasks) || !Array.isArray(incomingTasks)) return incomingReviewData;

  const existingTaskById = new Map<string, unknown>();
  for (const task of existingTasks) {
    const id = getTaskId(task);
    if (id) existingTaskById.set(id, task);
  }

  let changed = false;
  const mergedTasks = incomingTasks.map((incomingTask) => {
    const id = getTaskId(incomingTask);
    if (!id) return incomingTask;
    const existingTask = existingTaskById.get(id);
    if (!existingTask) return incomingTask;

    const existingTaskUpdatedAt = getTaskUpdatedAt(existingTask);
    const incomingTaskUpdatedAt = getTaskUpdatedAt(incomingTask);
    if (
      existingTaskUpdatedAt > incomingTaskUpdatedAt
      && getTaskUrl(existingTask) !== getTaskUrl(incomingTask)
    ) {
      changed = true;
      return existingTask;
    }
    return incomingTask;
  });

  return changed
    ? { ...(incomingReviewData as Record<string, unknown>), tasks: mergedTasks }
    : incomingReviewData;
}

function getReviewThumbnailUrl(reviewData: unknown, fallback: string | null | undefined): string | undefined {
  if (reviewData && typeof reviewData === "object") {
    const tasks = (reviewData as { tasks?: unknown }).tasks;
    if (Array.isArray(tasks)) {
      for (const task of tasks) {
        const url = getTaskUrl(task).trim();
        if (url) return url;
      }
    }
  }
  return fallback ?? undefined;
}

export const videoEditorProjectsRouter = router({
  /** List persistent Media Studio storyboard review workspaces */
  listStoryboardReviews: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        includeArchived: z.boolean().default(false),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { reviews: [], total: 0 };

      const limit = input?.limit ?? 20;
      const offset = input?.offset ?? 0;
      const includeArchived = input?.includeArchived ?? false;
      const where = includeArchived
        ? eq(mediaStudioStoryboardReviews.userId, ctx.user.id)
        : and(
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
            eq(mediaStudioStoryboardReviews.status, "active"),
          );

      const [reviews, [{ total }]] = await Promise.all([
        db
          .select({
            id: mediaStudioStoryboardReviews.id,
            name: mediaStudioStoryboardReviews.name,
            status: mediaStudioStoryboardReviews.status,
            clipCount: mediaStudioStoryboardReviews.clipCount,
            completedClipCount: mediaStudioStoryboardReviews.completedClipCount,
            thumbnailUrl: mediaStudioStoryboardReviews.thumbnailUrl,
            reviewData: mediaStudioStoryboardReviews.reviewData,
            videoEditorProjectId: mediaStudioStoryboardReviews.videoEditorProjectId,
            createdAt: mediaStudioStoryboardReviews.createdAt,
            updatedAt: mediaStudioStoryboardReviews.updatedAt,
          })
          .from(mediaStudioStoryboardReviews)
          .where(where)
          .orderBy(desc(mediaStudioStoryboardReviews.updatedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: sql<number>`count(*)::int` })
          .from(mediaStudioStoryboardReviews)
          .where(where),
      ]);

      return { reviews, total };
    }),

  /** Get a storyboard review workspace by ID */
  getStoryboardReview: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return null;

      const [review] = await db
        .select()
        .from(mediaStudioStoryboardReviews)
        .where(
          and(
            eq(mediaStudioStoryboardReviews.id, input.id),
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
          ),
        )
        .limit(1);

      return review ?? null;
    }),

  /** Save a Media Studio storyboard review workspace */
  saveStoryboardReview: protectedProcedure
    .input(
      z.object({
        id: z.number().optional(),
        name: z.string().min(1).max(256),
        reviewData: z.any(),
        clipCount: z.number().min(0).optional(),
        completedClipCount: z.number().min(0).optional(),
        thumbnailUrl: z.string().optional().nullable(),
        videoEditorProjectId: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const now = new Date();
      if (input.id) {
        const [existing] = await db
          .select({
            id: mediaStudioStoryboardReviews.id,
            reviewData: mediaStudioStoryboardReviews.reviewData,
          })
          .from(mediaStudioStoryboardReviews)
          .where(
            and(
              eq(mediaStudioStoryboardReviews.id, input.id),
              eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
            ),
          )
          .limit(1);
        if (!existing) throw new Error("Storyboard review not found");
        const incomingUpdatedAt = getReviewDataUpdatedAt(input.reviewData);
        const existingUpdatedAt = getReviewDataUpdatedAt(existing.reviewData);
        if (incomingUpdatedAt > 0 && existingUpdatedAt > incomingUpdatedAt) {
          return { id: input.id };
        }

        const reviewData = mergeFresherExistingReviewTasks(existing.reviewData, input.reviewData);

        await db
          .update(mediaStudioStoryboardReviews)
          .set({
            name: input.name,
            reviewData,
            clipCount: input.clipCount,
            completedClipCount: input.completedClipCount,
            thumbnailUrl: getReviewThumbnailUrl(reviewData, input.thumbnailUrl),
            videoEditorProjectId: input.videoEditorProjectId ?? undefined,
            status: "active",
            updatedAt: now,
          })
          .where(eq(mediaStudioStoryboardReviews.id, input.id));

        return { id: input.id };
      }

      const [inserted] = await db
        .insert(mediaStudioStoryboardReviews)
        .values({
          userId: ctx.user.id,
          name: input.name,
          reviewData: input.reviewData,
          clipCount: input.clipCount,
          completedClipCount: input.completedClipCount,
          thumbnailUrl: input.thumbnailUrl ?? undefined,
          videoEditorProjectId: input.videoEditorProjectId ?? undefined,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: mediaStudioStoryboardReviews.id });

      return { id: inserted.id };
    }),

  /** Delete a storyboard review workspace after it is no longer needed */
  deleteStoryboardReview: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await db
        .delete(mediaStudioStoryboardReviews)
        .where(
          and(
            eq(mediaStudioStoryboardReviews.id, input.id),
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
          ),
        );

      return { success: true };
    }),

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
