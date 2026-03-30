/**
 * Social Inbox tRPC router.
 *
 * Tenant-scoped conversation browsing and reply sending for Meta Channels.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlag } from "../services/featureFlags";
import { auditLogger } from "../services/auditLogger";
import {
  getConversationWithRecentMessages,
  getMessagesByConversation,
  listConversationsByTenant,
  sendReplyToConversation,
  updateConversationStatus,
  type SocialConversationStatus,
} from "../services/socialInboxService";
import { generateSocialDraft } from "../services/socialDraftService";
import { resolveTenantIdVarchar } from "../services/tenantContext";

const socialInboxProcedure = protectedProcedure.use(async ({ ctx, next }) => {
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

const conversationStatusSchema = z.enum(["open", "pending", "closed", "spam"]);

export const socialInboxRouter = router({
  listConversations: socialInboxProcedure
    .input(z.object({
      pageId: z.number().int().positive().optional(),
      status: conversationStatusSchema.optional(),
      cursor: z.string().optional().nullable(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return listConversationsByTenant(ctx.tenantId, input);
    }),

  getConversation: socialInboxProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return getConversationWithRecentMessages(input.conversationId, ctx.tenantId);
    }),

  listMessages: socialInboxProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      cursor: z.string().optional().nullable(),
      limit: z.number().int().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      return getMessagesByConversation(input.conversationId, ctx.tenantId, {
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  sendReply: socialInboxProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      body: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      return sendReplyToConversation({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        conversationId: input.conversationId,
        body: input.body,
      });
    }),

  generateDraft: socialInboxProcedure
    .input(z.object({ conversationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return generateSocialDraft({
        conversationId: input.conversationId,
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
      });
    }),

  updateConversationStatus: socialInboxProcedure
    .input(z.object({
      conversationId: z.number().int().positive(),
      status: conversationStatusSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      await updateConversationStatus(input.conversationId, ctx.tenantId, input.status as SocialConversationStatus);

      auditLogger.log({
        eventType: "social_inbox_status_updated",
        userId: ctx.user.id,
        metadata: {
          tenantId: ctx.tenantId,
          conversationId: input.conversationId,
          status: input.status,
        },
      });

      return {
        success: true,
        conversationId: input.conversationId,
        status: input.status,
      };
    }),
});
