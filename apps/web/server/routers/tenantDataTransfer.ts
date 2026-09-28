import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { domainAdminProcedure, middleware, rateLimitedDomainAdminProcedure, router } from "../_core/trpc";
import {
  approveTenantTransfer,
  cancelTenantTransfer,
  createTenantTransferPreview,
  getTenantTransferOperation,
  listTenantTransferItems,
  listTenantTransferPreviewItems,
  resolveTenantTransferItem,
  resumeTenantTransfer,
  type TransferServiceActor,
} from "../services/tenantDataTransfer";
import { JobControlPlaneError } from "../services/jobControlPlaneTypes";

const selectionSchema = z.object({
  resourceKind: z.string().trim().min(1).max(100),
  resourceIds: z.array(z.string().trim().min(1).max(255)).max(5_000).default([]),
}).strict();

const previewIdSchema = z.string().trim().min(1).max(36);
const operationIdSchema = z.string().trim().min(1).max(36);
const actionIdSchema = z.string().trim().min(1).max(128);

const transferFeatureGate = middleware(async ({ next }) => {
  if (process.env.FEATURE_189_TRANSFER_ENABLED !== "true") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Tenant transfer is not enabled",
    });
  }
  return next();
});

const transferDomainAdminProcedure = domainAdminProcedure.use(transferFeatureGate);
const rateLimitedTransferDomainAdminProcedure = rateLimitedDomainAdminProcedure.use(transferFeatureGate);

function transferActor(ctx: { user: { id: number; currentTenantId?: string | number | null } }): TransferServiceActor {
  const tenantId = String(ctx.user.currentTenantId ?? "").trim();
  if (!tenantId) throw new TRPCError({ code: "FORBIDDEN", message: "Authenticated tenant is required" });
  return { tenantId, actorId: ctx.user.id, authorizationScope: `tenant:${tenantId}:domain-admin` };
}

function toTrpcError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof JobControlPlaneError) {
    const code = error.code;
    const trpcCode = code === "FORBIDDEN" || code === "TENANT_MISMATCH" ? "FORBIDDEN"
      : code === "BACKPRESSURE" || code === "JOB_ADMISSION_BACKPRESSURE" ? "TOO_MANY_REQUESTS"
        : code === "IDEMPOTENCY_CONFLICT" ? "CONFLICT"
          : code === "PREVIEW_STALE" || code === "PREVIEW_EXPIRED" || code === "JOB_STATE_CONFLICT" || code === "ACTIVE_JOB_BLOCKED" || code === "TRANSFER_IN_PROGRESS" || code === "OPERATOR_REVIEW_REQUIRED" ? "CONFLICT"
            : "BAD_REQUEST";
    throw new TRPCError({ code: trpcCode, message: code });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Transfer operation failed" });
}

export const tenantDataTransferRouter = router({
  preview: rateLimitedTransferDomainAdminProcedure
    .input(z.object({
      sourceUserId: z.number().int().positive(),
      targetUserId: z.number().int().positive(),
      selections: z.array(selectionSchema).min(1).max(32),
      requestIdempotencyKey: actionIdSchema,
    }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await createTenantTransferPreview({ actor: transferActor(ctx), ...input });
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  listPreviewItems: rateLimitedTransferDomainAdminProcedure
    .input(z.object({
      previewId: previewIdSchema,
      cursor: z.string().max(1_500).nullable().optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      classification: z.string().trim().min(1).max(40).optional(),
    }).strict())
    .query(async ({ ctx, input }) => {
      try {
        return await listTenantTransferPreviewItems({ actor: transferActor(ctx), ...input });
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  approve: rateLimitedTransferDomainAdminProcedure
    .input(z.object({
      previewId: previewIdSchema,
      snapshotFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
      sourceUserId: z.number().int().positive(),
      targetUserId: z.number().int().positive(),
      confirmation: z.string().trim().max(32),
      actionId: actionIdSchema,
    }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await approveTenantTransfer({ actor: transferActor(ctx), ...input });
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  getOperation: transferDomainAdminProcedure
    .input(z.object({ operationId: operationIdSchema }).strict())
    .query(async ({ ctx, input }) => {
      try {
        return await getTenantTransferOperation({ actor: transferActor(ctx), operationId: input.operationId });
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  listItems: transferDomainAdminProcedure
    .input(z.object({
      operationId: operationIdSchema,
      cursor: z.string().max(1_500).nullable().optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      state: z.string().trim().min(1).max(40).optional(),
    }).strict())
    .query(async ({ ctx, input }) => {
      try {
        return await listTenantTransferItems({ actor: transferActor(ctx), ...input });
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  resume: rateLimitedTransferDomainAdminProcedure
    .input(z.object({ operationId: operationIdSchema, actionId: actionIdSchema }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await resumeTenantTransfer({ actor: transferActor(ctx), ...input });
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  resolveItem: rateLimitedTransferDomainAdminProcedure
    .input(z.object({ operationId: operationIdSchema, itemId: previewIdSchema, resolution: z.enum(["retry", "skip"]), actionId: actionIdSchema }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await resolveTenantTransferItem({ actor: transferActor(ctx), ...input });
      } catch (error) {
        return toTrpcError(error);
      }
    }),

  cancel: rateLimitedTransferDomainAdminProcedure
    .input(z.object({ operationId: operationIdSchema, actionId: actionIdSchema }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await cancelTenantTransfer({ actor: transferActor(ctx), ...input });
      } catch (error) {
        return toTrpcError(error);
      }
    }),
});
