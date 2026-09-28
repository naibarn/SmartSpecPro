import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { adminProcedure, router } from "../_core/trpc";
import {
  moveUserTenant,
  TENANT_MOVE_CONFIRMATION,
} from "../services/tenantIdentityService";
import { JobControlPlaneError } from "../services/jobControlPlaneTypes";

function toError(error: unknown): never {
  if (error instanceof JobControlPlaneError) {
    const conflictCodes = new Set([
      "IDEMPOTENCY_CONFLICT", "ACTIVE_JOB_BLOCKED", "QUEUE_CANCELLATION_FAILED",
      "QUEUE_CANCELLATION_INCOMPLETE", "SOURCE_TENANT_CHANGED", "TRANSFER_IN_PROGRESS",
    ]);
    throw new TRPCError({
      code: conflictCodes.has(error.code) ? "CONFLICT" : "BAD_REQUEST",
      message: error.code,
    });
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Tenant operation failed" });
}

export const adminTenantOperationsRouter = router({
  moveUserTenant: adminProcedure
    .input(z.object({
      userId: z.number().int().positive(),
      targetTenantId: z.string().trim().min(1).max(36),
      reason: z.string().trim().min(1).max(500),
      confirmation: z.literal(TENANT_MOVE_CONFIRMATION),
      actionId: z.string().trim().min(1).max(128),
    }).strict())
    .mutation(async ({ ctx, input }) => {
      try {
        return await moveUserTenant({
          ...input,
          actorId: ctx.user.id,
          authorizationScope: `system-admin:${ctx.user.role}`,
          correlationId: `admin:${ctx.user.id}:${input.actionId}`,
        });
      } catch (error) {
        return toError(error);
      }
    }),
});
