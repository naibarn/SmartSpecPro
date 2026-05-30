/**
 * Video Editor Projects tRPC Router
 * CRUD operations for persistent video editor project storage with auto-save support.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { mediaStudioStoryboardReviews, videoEditorProjects } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";

const STORYBOARD_REVIEW_SERVER_DEBUG_BUILD = "storyboard-review-server-audio-debug-20260527-2245";
const STORYBOARD_REVIEW_CLIENT_DEBUG_BUILD = "storyboard-review-client-lifecycle-debug-20260527-2325";

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

function isStoryboardReviewRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeStoryboardPlannerMetadata(existingValue: unknown, incomingValue: unknown): unknown {
  if (!isStoryboardReviewRecord(existingValue) && !isStoryboardReviewRecord(incomingValue)) {
    return existingValue ?? incomingValue;
  }
  if (!isStoryboardReviewRecord(existingValue)) return incomingValue;
  if (!isStoryboardReviewRecord(incomingValue)) return existingValue;
  return {
    ...incomingValue,
    ...existingValue,
    productionContext: existingValue.productionContext ?? incomingValue.productionContext,
    voiceoverFullScript: existingValue.voiceoverFullScript ?? incomingValue.voiceoverFullScript,
    soundFullBrief: existingValue.soundFullBrief ?? incomingValue.soundFullBrief,
  };
}

function mergeStoryboardExtraParamsMetadata(existingValue: unknown, incomingValue: unknown): unknown {
  if (!isStoryboardReviewRecord(existingValue) && !isStoryboardReviewRecord(incomingValue)) {
    return existingValue ?? incomingValue;
  }
  if (!isStoryboardReviewRecord(existingValue)) return incomingValue;
  if (!isStoryboardReviewRecord(incomingValue)) return existingValue;

  const merged: Record<string, unknown> = {
    ...incomingValue,
    ...existingValue,
    productionContext: existingValue.productionContext ?? incomingValue.productionContext,
    productionRunId: existingValue.productionRunId ?? incomingValue.productionRunId,
    productionStoryConceptId: existingValue.productionStoryConceptId ?? incomingValue.productionStoryConceptId,
    productionStoryConceptTitle: existingValue.productionStoryConceptTitle ?? incomingValue.productionStoryConceptTitle,
    productionVideoConcept: existingValue.productionVideoConcept ?? incomingValue.productionVideoConcept,
    productionConceptDetails: existingValue.productionConceptDetails ?? incomingValue.productionConceptDetails,
    storyboardGuide: existingValue.storyboardGuide ?? incomingValue.storyboardGuide,
    voiceoverFullScript: existingValue.voiceoverFullScript ?? incomingValue.voiceoverFullScript,
  };

  const planner = mergeStoryboardPlannerMetadata(
    existingValue.storyboardPromptPlanner,
    incomingValue.storyboardPromptPlanner,
  );
  if (planner) merged.storyboardPromptPlanner = planner;

  return merged;
}

function mergeStoryboardContextMetadata(existingValue: unknown, incomingValue: unknown): unknown {
  if (!isStoryboardReviewRecord(existingValue) && !isStoryboardReviewRecord(incomingValue)) {
    return existingValue ?? incomingValue;
  }
  if (!isStoryboardReviewRecord(existingValue)) return incomingValue;
  if (!isStoryboardReviewRecord(incomingValue)) return existingValue;

  return {
    ...incomingValue,
    ...existingValue,
    marketplaceProduct: existingValue.marketplaceProduct ?? incomingValue.marketplaceProduct,
    productionContext: existingValue.productionContext ?? incomingValue.productionContext,
    extraParams: mergeStoryboardExtraParamsMetadata(existingValue.extraParams, incomingValue.extraParams),
  };
}

function mergeFresherTaskMediaWithIncomingMetadata(existingTask: unknown, incomingTask: unknown): unknown {
  if (!isStoryboardReviewRecord(existingTask) || !isStoryboardReviewRecord(incomingTask)) {
    return existingTask;
  }
  return {
    ...incomingTask,
    ...existingTask,
    marketplaceProduct: existingTask.marketplaceProduct ?? incomingTask.marketplaceProduct,
    productionContext: existingTask.productionContext ?? incomingTask.productionContext,
    storyboardContext: mergeStoryboardContextMetadata(existingTask.storyboardContext, incomingTask.storyboardContext),
  };
}

function getCompanionAudioUpdatedAt(reviewData: unknown): number {
  if (!reviewData || typeof reviewData !== "object") return 0;
  const value = (reviewData as { companionAudioUpdatedAt?: unknown }).companionAudioUpdatedAt;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

function summarizeCompanionAudio(reviewData: unknown) {
  if (!reviewData || typeof reviewData !== "object") {
    return { draftUpdatedAt: 0, companionAudioUpdatedAt: 0, count: 0, audio: [] };
  }
  const companionAudio = (reviewData as { companionAudio?: unknown }).companionAudio;
  const audioItems = Array.isArray(companionAudio) ? companionAudio : [];
  return {
    draftUpdatedAt: getReviewDataUpdatedAt(reviewData),
    companionAudioUpdatedAt: getCompanionAudioUpdatedAt(reviewData),
    hasExplicitCompanionAudioUpdatedAt: typeof (reviewData as { companionAudioUpdatedAt?: unknown }).companionAudioUpdatedAt === "number",
    count: audioItems.length,
    audio: audioItems.slice(0, 4).map((item) => {
      const audio = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const url = typeof audio.url === "string" ? audio.url : "";
      return {
        id: typeof audio.id === "string" ? audio.id : null,
        kind: typeof audio.kind === "string" ? audio.kind : null,
        title: typeof audio.title === "string" ? audio.title.slice(0, 120) : null,
        model: typeof audio.model === "string" ? audio.model.slice(0, 80) : null,
        urlTail: url ? url.slice(-160) : null,
      };
    }),
  };
}

function getDebugHeaderValue(headers: Record<string, unknown> | undefined, key: string): string | null {
  const value = headers?.[key.toLowerCase()] ?? headers?.[key];
  if (Array.isArray(value)) return value.join(", ").slice(0, 240);
  return typeof value === "string" ? value.slice(0, 240) : null;
}

function summarizeDebugRequest(ctx: { req?: { headers?: Record<string, unknown>; ip?: string; originalUrl?: string; socket?: { remoteAddress?: string } } }) {
  const headers = ctx.req?.headers;
  return {
    ip: ctx.req?.ip ?? ctx.req?.socket?.remoteAddress ?? null,
    xForwardedFor: getDebugHeaderValue(headers, "x-forwarded-for"),
    origin: getDebugHeaderValue(headers, "origin"),
    referer: getDebugHeaderValue(headers, "referer"),
    userAgent: getDebugHeaderValue(headers, "user-agent"),
    methodPath: ctx.req?.originalUrl ?? null,
  };
}

function writeStoryboardReviewDebugLog(entry: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test" || process.env.STORYBOARD_REVIEW_DEBUG_LOG === "0") return;
  const logPath = path.resolve(process.cwd(), process.env.STORYBOARD_REVIEW_DEBUG_LOG_PATH || "logs/storyboard-review-save-debug.ndjson");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify({
      ts: new Date().toISOString(),
      serverBuild: STORYBOARD_REVIEW_SERVER_DEBUG_BUILD,
      ...entry,
    })}\n`, "utf8");
  } catch {
    // Debug logging must never block user saves.
  }
}

export function sanitizeStoryboardReviewClientDebugPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return String(value).slice(0, 120);
  if (depth >= 5) return "[MaxDepth]";

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeStoryboardReviewClientDebugPayload(item, depth + 1));
  }

  const sensitiveKeyPattern = /(authorization|cookie|password|secret|token|sig|signature|url|uri)$/i;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
    output[key] = sensitiveKeyPattern.test(key)
      ? "[redacted]"
      : sanitizeStoryboardReviewClientDebugPayload(item, depth + 1);
  }
  return output;
}

function writeStoryboardReviewClientDebugLog(entry: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "test" || process.env.STORYBOARD_REVIEW_CLIENT_DEBUG_LOG === "0") return;
  const logPath = path.resolve(process.cwd(), process.env.STORYBOARD_REVIEW_CLIENT_DEBUG_LOG_PATH || "logs/storyboard-review-client-debug.ndjson");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify({
      ts: new Date().toISOString(),
      serverBuild: STORYBOARD_REVIEW_SERVER_DEBUG_BUILD,
      clientDebugBuild: STORYBOARD_REVIEW_CLIENT_DEBUG_BUILD,
      ...entry,
    })}\n`, "utf8");
  } catch {
    // Debug logging must never block the review page.
  }
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
  const existingCompanionAudioUpdatedAt = getCompanionAudioUpdatedAt(existingReviewData);
  const incomingCompanionAudioUpdatedAt = getCompanionAudioUpdatedAt(incomingReviewData);

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
      return mergeFresherTaskMediaWithIncomingMetadata(existingTask, incomingTask);
    }
    return incomingTask;
  });

  const existingCompanionAudio = (existingReviewData as { companionAudio?: unknown }).companionAudio;
  const incomingCompanionAudio = (incomingReviewData as { companionAudio?: unknown }).companionAudio;
  const existingAudioItems = Array.isArray(existingCompanionAudio) ? existingCompanionAudio : [];
  const incomingAudioItems = Array.isArray(incomingCompanionAudio) ? incomingCompanionAudio : [];
  const shouldUseExistingCompanionAudio = existingCompanionAudioUpdatedAt > incomingCompanionAudioUpdatedAt;
  if (shouldUseExistingCompanionAudio) {
    changed = true;
  }

  return changed
    ? {
        ...(incomingReviewData as Record<string, unknown>),
        tasks: mergedTasks,
        ...(Array.isArray(incomingCompanionAudio)
          ? {
              companionAudio: shouldUseExistingCompanionAudio ? existingAudioItems : incomingAudioItems,
              companionAudioUpdatedAt: Math.max(existingCompanionAudioUpdatedAt, incomingCompanionAudioUpdatedAt),
            }
          : {}),
      }
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
  /** Browser lifecycle debug events for storyboard review audio persistence. */
  debugStoryboardReviewClient: protectedProcedure
    .input(
      z.object({
        event: z.string().min(1).max(160),
        reviewId: z.number().int().positive().nullable().optional(),
        pageBuild: z.string().max(160).nullable().optional(),
        route: z.string().max(300).nullable().optional(),
        payload: z.unknown().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      writeStoryboardReviewClientDebugLog({
        event: input.event,
        reviewId: input.reviewId ?? null,
        userId: ctx.user.id,
        pageBuild: input.pageBuild ?? null,
        route: input.route ?? null,
        request: summarizeDebugRequest(ctx),
        payload: sanitizeStoryboardReviewClientDebugPayload(input.payload),
      });
      return { ok: true };
    }),

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

      writeStoryboardReviewDebugLog({
        event: "getStoryboardReview",
        reviewId: input.id,
        userId: ctx.user.id,
        found: Boolean(review),
        request: summarizeDebugRequest(ctx),
        stored: summarizeCompanionAudio(review?.reviewData),
      });

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
        debugSource: z.any().optional(),
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
        const reviewData = mergeFresherExistingReviewTasks(existing.reviewData, input.reviewData);
        writeStoryboardReviewDebugLog({
          event: "saveStoryboardReview.update",
          reviewId: input.id,
          userId: ctx.user.id,
          debugSource: input.debugSource ?? null,
          request: summarizeDebugRequest(ctx),
          existing: summarizeCompanionAudio(existing.reviewData),
          incoming: summarizeCompanionAudio(input.reviewData),
          merged: summarizeCompanionAudio(reviewData),
        });

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

        return { id: input.id, reviewData };
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
      writeStoryboardReviewDebugLog({
        event: "saveStoryboardReview.insert",
        reviewId: inserted.id,
        userId: ctx.user.id,
        debugSource: input.debugSource ?? null,
        request: summarizeDebugRequest(ctx),
        incoming: summarizeCompanionAudio(input.reviewData),
      });

      return { id: inserted.id, reviewData: input.reviewData };
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
