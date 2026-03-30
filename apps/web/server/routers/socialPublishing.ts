/**
 * Social Publishing tRPC router.
 *
 * Draft creation, immediate publishing, scheduling, cancellation, and history.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlag } from "../services/featureFlags";
import {
  cancelScheduledPublishingPost,
  createPublishingDraft,
  listPublishingPages,
  listPublishingPosts,
  publishPublishingPostNow,
  schedulePublishingPost,
} from "../services/socialPublishingService";
import { resolveTenantIdVarchar } from "../services/tenantContext";

const socialPublishingProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required",
    });
  }

  const enabled = await getTenantFeatureFlag("META_CHANNELS_ENABLED", tenantId);
  if (!enabled) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Meta Channels are disabled for this tenant",
    });
  }

  return next({
    ctx: {
      ...ctx,
      tenantId,
    },
  });
});

const publishingStatusSchema = z.enum(["draft", "scheduled", "published", "failed"]);

export const socialPublishingRouter = router({
  listPages: socialPublishingProcedure.query(async ({ ctx }) => {
    return listPublishingPages(ctx.tenantId, ctx.user.id);
  }),

  createDraft: socialPublishingProcedure
    .input(z.object({
      pageId: z.number().int().positive(),
      contentText: z.string().trim().max(2000).optional().nullable(),
      contentLink: z.string().url().optional().nullable(),
      mediaRefs: z.array(z.string().trim().url()).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return createPublishingDraft({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        pageId: input.pageId,
        contentText: input.contentText ?? null,
        contentLink: input.contentLink ?? null,
        mediaRefs: input.mediaRefs ?? null,
      });
    }),

  publishNow: socialPublishingProcedure
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return publishPublishingPostNow({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        postId: input.postId,
      });
    }),

  schedulePost: socialPublishingProcedure
    .input(z.object({
      postId: z.number().int().positive(),
      scheduledAt: z.string().datetime(),
    }))
    .mutation(async ({ ctx, input }) => {
      return schedulePublishingPost({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        postId: input.postId,
        scheduledAt: input.scheduledAt,
      });
    }),

  listPosts: socialPublishingProcedure
    .input(z.object({
      pageId: z.number().int().positive().optional(),
      status: publishingStatusSchema.optional(),
      cursor: z.string().optional().nullable(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return listPublishingPosts({
        tenantId: ctx.tenantId,
        pageId: input.pageId,
        status: input.status,
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  cancelScheduledPost: socialPublishingProcedure
    .input(z.object({ postId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return cancelScheduledPublishingPost({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        postId: input.postId,
      });
    }),
});
