import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  hybridBlendModeSchema,
  hybridPlanPayloadSchema,
} from "@shared/orchestration/hybridOrchestration";
import {
  advanceHybridExecution,
  createHybridPreviewToken,
  getHybridExecution,
  getHybridPreviewPayload,
  refreshHybridPreviewToken,
  startHybridExecution,
  hybridExecutionActionSchema,
} from "../services/hybridOrchestrationRuntime";

const previewTokenSchema = z.string().min(10).max(2048);
const executionIdSchema = z.string().min(10).max(128);

export const hybridOrchestrationRouter = router({
  createPreviewToken: protectedProcedure
    .input(z.object({
      agencyId: z.string().min(1).max(128),
      payload: hybridPlanPayloadSchema,
      sourceSurface: z.enum(["agency-browser", "agency-chat", "chat", "review-center", "legacy"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId || String(ctx.user.currentTenantId ?? "");
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      }

      const result = await createHybridPreviewToken({
        agencyId: input.agencyId,
        userId: ctx.user.id,
        tenantId,
        payload: input.payload,
        sourceSurface: input.sourceSurface,
      });

      return result;
    }),

  getPreview: protectedProcedure
    .input(z.object({
      token: previewTokenSchema,
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId || String(ctx.user.currentTenantId ?? "");
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      }

      const payload = await getHybridPreviewPayload({
        token: input.token,
        userId: ctx.user.id,
        tenantId,
      });

      return payload;
    }),

  refreshPreviewToken: protectedProcedure
    .input(z.object({
      previewToken: previewTokenSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId || String(ctx.user.currentTenantId ?? "");
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      }

      const result = await refreshHybridPreviewToken({
        previewToken: input.previewToken,
        userId: ctx.user.id,
        tenantId,
      });

      return result;
    }),

  startExecution: protectedProcedure
    .input(z.object({
      previewToken: previewTokenSchema,
      blendMode: hybridBlendModeSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId || String(ctx.user.currentTenantId ?? "");
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      }

      const execution = await startHybridExecution({
        previewToken: input.previewToken,
        userId: ctx.user.id,
        tenantId,
        blendMode: input.blendMode,
      });

      return {
        execution,
      };
    }),

  getExecution: protectedProcedure
    .input(z.object({
      executionId: executionIdSchema,
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId || String(ctx.user.currentTenantId ?? "");
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      }

      const execution = await getHybridExecution({
        executionId: input.executionId,
        userId: ctx.user.id,
        tenantId,
      });
      return execution;
    }),

  advanceExecution: protectedProcedure
    .input(z.object({
      executionId: executionIdSchema,
      action: hybridExecutionActionSchema,
      note: z.string().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId || String(ctx.user.currentTenantId ?? "");
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      }

      const execution = await advanceHybridExecution({
        executionId: input.executionId,
        userId: ctx.user.id,
        tenantId,
        action: input.action,
        note: input.note ?? null,
      });

      return { execution };
    }),
});
