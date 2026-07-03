/**
 * Vertical Drama Series — Storyboard Review handoff router (spec feature 131, §12).
 *
 * Flag-gated (`verticalDramaSeriesStoryboardReviewHandoff`) tRPC surface that:
 *   - `createHandoff`      — idempotently create/reopen the review for an episode.
 *   - `getHandoffMetadata` — read the review's vertical-drama metadata for the panel.
 *   - `editVideoPrompt`    — append-only edit of a task's video/motion prompt.
 *
 * All procedures are `userId` + `tenantId` scoped: the source series/episode is
 * asserted to belong to the acting user + tenant, and the target Storyboard
 * Review row (which is `userId`-only) is asserted to belong to the acting user.
 *
 * NOTE: this router is wired into the app router by the conductor — do NOT edit
 * `server/routers.ts` here.
 */

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { requireFeatureFlag } from "../middleware/requireFeatureFlag";
import { isFeatureEnabled } from "../services/tenantFeatureFlagService";
import { tenants, verticalDramaEpisodes, mediaStudioStoryboardReviews } from "../../drizzle/schema";
import {
  createVerticalDramaStoryboardHandoff,
  appendVideoPromptEdit,
  type VerticalDramaReviewData,
  type VerticalDramaHandoffTask,
} from "../services/verticalDramaStoryboardHandoff";

/** Feature-flagged base procedure for all handoff endpoints. */
const handoffProcedure = protectedProcedure.use(
  requireFeatureFlag("verticalDramaSeriesStoryboardReviewHandoff"),
);

/** Resolve whether the sub-shot flag is on for this tenant (best-effort, fail-closed). */
async function resolveSubShotsEnabled(
  db: ReturnType<typeof getDb>,
  tenantId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ featureFlags: tenants.featureFlags })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  const flags = (row?.featureFlags as Record<string, boolean> | null) ?? null;
  return isFeatureEnabled(flags, "verticalDramaSeriesSubShots");
}

async function loadOwnedEpisode(params: {
  db: ReturnType<typeof getDb>;
  userId: number;
  tenantId: string;
  seriesId: number;
  episodeId: number;
}) {
  const { db, userId, tenantId, seriesId, episodeId } = params;
  const [episode] = await db
    .select()
    .from(verticalDramaEpisodes)
    .where(
      and(
        eq(verticalDramaEpisodes.id, episodeId),
        eq(verticalDramaEpisodes.seriesId, seriesId),
        eq(verticalDramaEpisodes.userId, userId),
        eq(verticalDramaEpisodes.tenantId, tenantId),
      ),
    )
    .limit(1);
  return episode ?? null;
}

async function loadOwnedReview(params: {
  db: ReturnType<typeof getDb>;
  userId: number;
  reviewId: number;
}) {
  const { db, userId, reviewId } = params;
  const [review] = await db
    .select()
    .from(mediaStudioStoryboardReviews)
    .where(
      and(
        eq(mediaStudioStoryboardReviews.id, reviewId),
        eq(mediaStudioStoryboardReviews.userId, userId),
      ),
    )
    .limit(1);
  return review ?? null;
}

export const verticalDramaHandoffRouter = router({
  /** Idempotently create (or reopen) the Storyboard Review for an approved episode. */
  createHandoff: handoffProcedure
    .input(
      z.object({
        seriesId: z.string().min(1),
        episodeId: z.string().min(1),
        name: z.string().min(1).max(256).optional(),
        imageModelId: z.string().min(1).optional(),
        videoModelId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId;
      if (!tenantId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required" });
      }
      const db = getDb();

      const seriesId = Number(input.seriesId);
      const episodeId = Number(input.episodeId);
      if (!Number.isFinite(seriesId) || !Number.isFinite(episodeId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid series/episode id" });
      }

      const episode = await loadOwnedEpisode({
        db,
        userId: ctx.user.id,
        tenantId,
        seriesId,
        episodeId,
      });
      if (!episode) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Episode not found" });
      }
      if (!episode.motionPromptPack) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Episode has no approved motion prompt pack to hand off",
        });
      }

      const subShotsEnabled = await resolveSubShotsEnabled(db, tenantId);

      return createVerticalDramaStoryboardHandoff({
        db,
        userId: ctx.user.id,
        tenantId,
        episode,
        subShotsEnabled,
        overrides: {
          imageModelId: input.imageModelId,
          videoModelId: input.videoModelId,
        },
        name: input.name,
      });
    }),

  /** Read the vertical-drama metadata for the review panel. */
  getHandoffMetadata: handoffProcedure
    .input(z.object({ reviewId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const review = await loadOwnedReview({ db, userId: ctx.user.id, reviewId: input.reviewId });
      if (!review) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Storyboard review not found" });
      }
      const reviewData = review.reviewData as Partial<VerticalDramaReviewData> | null;
      if (!reviewData || reviewData.source !== "vertical_drama_series") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Review is not a vertical drama handoff",
        });
      }
      return {
        reviewId: review.id,
        name: review.name,
        status: review.status,
        clipCount: review.clipCount,
        completedClipCount: review.completedClipCount,
        reviewData,
      };
    }),

  /** Append-only edit of a task's video/motion prompt (re-applies stale gating). */
  editVideoPrompt: handoffProcedure
    .input(
      z.object({
        reviewId: z.number().int().positive(),
        taskId: z.string().min(1),
        prompt: z.string().min(1).max(8000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const review = await loadOwnedReview({ db, userId: ctx.user.id, reviewId: input.reviewId });
      if (!review) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Storyboard review not found" });
      }
      const reviewData = review.reviewData as VerticalDramaReviewData | null;
      if (!reviewData || reviewData.source !== "vertical_drama_series") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Review is not a vertical drama handoff",
        });
      }
      const tasks = Array.isArray(reviewData.tasks) ? reviewData.tasks : [];
      const index = tasks.findIndex((t: VerticalDramaHandoffTask) => t.id === input.taskId);
      if (index < 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Task not found in review" });
      }

      const updatedTask = appendVideoPromptEdit(tasks[index], {
        newPrompt: input.prompt,
        editedByUserId: ctx.user.id,
      });
      const nextTasks = [...tasks];
      nextTasks[index] = updatedTask;
      const nextReviewData: VerticalDramaReviewData = {
        ...reviewData,
        tasks: nextTasks,
        updatedAt: Date.now(),
      };

      await db
        .update(mediaStudioStoryboardReviews)
        .set({ reviewData: nextReviewData, updatedAt: new Date() })
        .where(
          and(
            eq(mediaStudioStoryboardReviews.id, input.reviewId),
            eq(mediaStudioStoryboardReviews.userId, ctx.user.id),
          ),
        );

      return { task: updatedTask };
    }),
});

export default verticalDramaHandoffRouter;
