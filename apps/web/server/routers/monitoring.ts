/**
 * Monitoring tRPC Router — run/agent monitoring queries.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as monitoringService from "../services/monitoringService";
import * as notificationService from "../services/orchestratorNotificationService";

export const monitoringRouter = router({
  getRunEvents: protectedProcedure
    .input(z.object({
      runId: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return monitoringService.getRunEvents(input.runId, tenantId, input.limit);
    }),

  captureSnapshot: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return monitoringService.captureSnapshot(input.runId, tenantId);
    }),

  checkStuck: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return monitoringService.checkStuckAgent(input.runId, tenantId);
    }),

  getNotifications: protectedProcedure
    .input(z.object({
      includeRead: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return notificationService.getNotifications(ctx.userId, tenantId, {
        includeRead: input?.includeRead,
        limit: input?.limit,
      });
    }),

  markNotificationRead: protectedProcedure
    .input(z.object({ notificationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await notificationService.markAsRead(input.notificationId, ctx.userId);
      return { success: true };
    }),

  dismissNotification: protectedProcedure
    .input(z.object({ notificationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await notificationService.dismissNotification(input.notificationId, ctx.userId);
      return { success: true };
    }),
});
