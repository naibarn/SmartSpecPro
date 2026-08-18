import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../_core/trpc";
import {
  listConnectedDevicesForUser,
  revokeAllMcpConnectionsForUser,
  revokeConnectedDevice,
} from "../services/connectedDeviceService";

function tenantRequired(ctx: {
  tenantId?: unknown;
  user: { currentTenantId?: unknown };
}): string {
  const tenantId = ctx.tenantId ?? ctx.user.currentTenantId ?? null;
  if (tenantId == null || !String(tenantId).trim()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Tenant context is required",
    });
  }
  return String(tenantId);
}

export const connectedDevicesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => ({
    devices: await listConnectedDevicesForUser({
      tenantId: tenantRequired(ctx),
      ownerUserId: ctx.user.id,
    }),
  })),

  revoke: protectedProcedure
    .input(
      z.object({
        deviceId: z.string().min(1).max(36),
        reason: z.string().trim().max(255).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return {
          device: await revokeConnectedDevice({
            tenantId: tenantRequired(ctx),
            ownerUserId: ctx.user.id,
            deviceId: input.deviceId,
            reason: input.reason,
          }),
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Connected device not found"
        ) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Connected device not found",
          });
        }
        throw error;
      }
    }),

  revokeAllMcp: protectedProcedure
    .input(
      z.object({ reason: z.string().trim().max(255).optional() }).optional()
    )
    .mutation(async ({ ctx, input }) => ({
      result: await revokeAllMcpConnectionsForUser({
        tenantId: tenantRequired(ctx),
        ownerUserId: ctx.user.id,
        reason: input?.reason,
      }),
    })),
});
