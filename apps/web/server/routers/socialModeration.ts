/**
 * Social Moderation tRPC router.
 *
 * Lists comments and proxies reply/hide/delete actions for Meta pages.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlag } from "../services/featureFlags";
import {
  deleteModerationComment,
  hideModerationComment,
  listModerationComments,
  listModerationPages,
  replyToModerationComment,
} from "../services/socialModerationService";
import { resolveTenantIdVarchar } from "../services/tenantContext";

const socialModerationProcedure = protectedProcedure.use(async ({ ctx, next }) => {
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

export const socialModerationRouter = router({
  listPages: socialModerationProcedure.query(async ({ ctx }) => {
    return listModerationPages(ctx.tenantId, ctx.user.id);
  }),

  listComments: socialModerationProcedure
    .input(z.object({
      pageId: z.number().int().positive(),
      cursor: z.string().optional().nullable(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return listModerationComments({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        pageId: input.pageId,
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  replyToComment: socialModerationProcedure
    .input(z.object({
      commentId: z.number().int().positive(),
      body: z.string().trim().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      return replyToModerationComment({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        commentId: input.commentId,
        body: input.body,
      });
    }),

  hideComment: socialModerationProcedure
    .input(z.object({ commentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return hideModerationComment({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        commentId: input.commentId,
      });
    }),

  deleteComment: socialModerationProcedure
    .input(z.object({ commentId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return deleteModerationComment({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        commentId: input.commentId,
      });
    }),
});
