/**
 * Social Automation tRPC router.
 *
 * Manages automation rules and human approval queue for social channels.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "../_core/trpc";
import { getTenantFeatureFlag } from "../services/featureFlags";
import {
  approveAutomationAction,
  createAutomationRule,
  deleteAutomationRule,
  listAutomationApprovals,
  listAutomationPages,
  listAutomationPageRules,
  rejectAutomationAction,
  toggleAutomationRule,
  updateAutomationRule,
} from "../services/socialAutomationService";
import { resolveTenantIdVarchar } from "../services/tenantContext";

const socialAutomationProcedure = protectedProcedure.use(async ({ ctx, next }) => {
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

const triggerTypeSchema = z.enum(["new_message", "keyword_match", "unread_timeout"]);
const actionModeSchema = z.enum(["off", "draft_only", "approval_required", "auto_send"]);
const approvalStatusSchema = z.enum(["all", "pending", "approved", "rejected", "expired"]);

const ruleConditionsSchema = z.record(z.unknown()).optional().nullable();
const policyConfigSchema = z.record(z.unknown()).optional().nullable();

export const socialAutomationRouter = router({
  listPages: socialAutomationProcedure.query(async ({ ctx }) => {
    return listAutomationPages(ctx.tenantId, ctx.user.id);
  }),

  listRules: socialAutomationProcedure
    .input(z.object({
      pageId: z.number().int().positive().optional().nullable(),
    }))
    .query(async ({ ctx, input }) => {
      return listAutomationPageRules({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        pageId: input.pageId ?? undefined,
      });
    }),

  createRule: socialAutomationProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(255),
      pageId: z.number().int().positive().optional().nullable(),
      triggerType: triggerTypeSchema,
      conditions: ruleConditionsSchema,
      actionMode: actionModeSchema.optional().nullable(),
      policyConfig: policyConfigSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return createAutomationRule({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        input,
      });
    }),

  updateRule: socialAutomationProcedure
    .input(z.object({
      ruleId: z.number().int().positive(),
      name: z.string().trim().min(1).max(255).optional(),
      conditions: ruleConditionsSchema,
      actionMode: actionModeSchema.optional().nullable(),
      policyConfig: policyConfigSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      return updateAutomationRule({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        input,
      });
    }),

  toggleRule: socialAutomationProcedure
    .input(z.object({
      ruleId: z.number().int().positive(),
      isEnabled: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      return toggleAutomationRule({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        ruleId: input.ruleId,
        isEnabled: input.isEnabled,
      });
    }),

  deleteRule: socialAutomationProcedure
    .input(z.object({ ruleId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      return deleteAutomationRule({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        ruleId: input.ruleId,
      });
    }),

  listApprovals: socialAutomationProcedure
    .input(z.object({
      pageId: z.number().int().positive().optional().nullable(),
      status: approvalStatusSchema.optional().nullable(),
      cursor: z.string().optional().nullable(),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      return listAutomationApprovals({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        pageId: input.pageId ?? undefined,
        status: input.status ?? undefined,
        cursor: input.cursor,
        limit: input.limit,
      });
    }),

  approveAction: socialAutomationProcedure
    .input(z.object({
      approvalId: z.number().int().positive(),
      editedContent: z.string().trim().max(4000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return approveAutomationAction({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        approvalId: input.approvalId,
        editedContent: input.editedContent ?? undefined,
      });
    }),

  rejectAction: socialAutomationProcedure
    .input(z.object({
      approvalId: z.number().int().positive(),
      note: z.string().trim().max(2000).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return rejectAutomationAction({
        tenantId: ctx.tenantId,
        userId: ctx.user.id,
        approvalId: input.approvalId,
        note: input.note ?? undefined,
      });
    }),
});
