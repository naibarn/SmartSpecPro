import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  HYBRID_EXECUTOR_REGISTRY_VERSION,
  HYBRID_PLAN_SCHEMA_VERSION,
  HYBRID_RESULT_SCHEMA_VERSION,
  HYBRID_RUNTIME_CONTRACT_VERSION,
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
const sourceSurfaceSchema = z.enum(["agency", "agency-browser", "agency-chat", "chat", "review-center", "legacy"]);

export const hybridOrchestrationRouter = router({
  createPreviewToken: protectedProcedure
    .input(z.object({
      agencyId: z.string().min(1).max(128).nullable().optional(),
      payload: hybridPlanPayloadSchema,
      sourceSurface: sourceSurfaceSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId || String(ctx.user.currentTenantId ?? "");
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      }

      const result = await createHybridPreviewToken({
        agencyId: input.agencyId ?? null,
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

  resumeExecution: protectedProcedure
    .input(z.object({
      executionId: executionIdSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.tenantId || String(ctx.user.currentTenantId ?? "");
      if (!tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
      }

      const execution = await getHybridExecution({
        executionId: input.executionId,
        userId: ctx.user.id,
        tenantId,
      });
      if (!execution) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Hybrid execution not found" });
      }
      return { execution };
    }),

  cancelExecution: protectedProcedure
    .input(z.object({
      executionId: executionIdSchema,
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
        action: "cancel",
        note: input.note ?? null,
      });
      return { execution };
    }),

  retryStage: protectedProcedure
    .input(z.object({
      executionId: executionIdSchema,
      stageId: z.string().min(1).max(128).optional(),
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
        action: "advance",
        note: input.note ?? `retry:${input.stageId ?? "current"}`,
      });
      return { execution };
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

  getRuntimeHealth: protectedProcedure
    .query(async () => ({
      runtime: "openai-agents",
      available: true,
      contractVersion: HYBRID_RUNTIME_CONTRACT_VERSION,
      executorRegistryVersion: HYBRID_EXECUTOR_REGISTRY_VERSION,
      planSchemaVersion: HYBRID_PLAN_SCHEMA_VERSION,
      resultSchemaVersion: HYBRID_RESULT_SCHEMA_VERSION,
      agencyFallback: "explicit-agency-origin-only",
    })),
});
