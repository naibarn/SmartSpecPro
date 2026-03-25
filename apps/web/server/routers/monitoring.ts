/**
 * Monitoring tRPC Router — run/agent monitoring queries.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as monitoringService from "../services/monitoringService";
import * as notificationService from "../services/orchestratorNotificationService";
import * as unifiedNotificationService from "../services/unifiedNotificationService";
import { checkNotificationHealth } from "../services/notificationHealthChecks";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tid;
}

export const monitoringRouter = router({
  getRunEvents: protectedProcedure
    .input(z.object({
      runId: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return monitoringService.getRunEvents(input.runId, tenantId, input.limit);
    }),

  captureSnapshot: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return monitoringService.captureSnapshot(input.runId, tenantId);
    }),

  checkStuck: protectedProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return monitoringService.checkStuckAgent(input.runId, tenantId);
    }),

  getNotifications: protectedProcedure
    .input(z.object({
      includeRead: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return notificationService.getNotifications(ctx.user!.id, tenantId, {
        includeRead: input?.includeRead,
        limit: input?.limit,
      });
    }),

  markNotificationRead: protectedProcedure
    .input(z.object({ notificationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await notificationService.markAsRead(input.notificationId, ctx.user!.id);
      return { success: true };
    }),

  dismissNotification: protectedProcedure
    .input(z.object({ notificationId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await notificationService.dismissNotification(input.notificationId, ctx.user!.id);
      return { success: true };
    }),

  // ─── Unified Notification Endpoints ─────────────────────────────────────

  getUnifiedNotifications: adminProcedure
    .input(
      z.object({
        source: z
          .enum(["user", "orchestrator", "guardian"])
          .optional(),
        severity: z
          .enum(["low", "normal", "high", "critical"])
          .optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        page: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return unifiedNotificationService.getUnifiedNotifications(tenantId, {
        ...input,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        endDate: input.endDate ? new Date(input.endDate) : undefined,
      });
    }),

  getUnifiedStats: adminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return unifiedNotificationService.getUnifiedStats(tenantId);
  }),

  notificationHealth: adminProcedure.query(async () => {
    return checkNotificationHealth();
  }),

  // ─── System Monitoring (Celery Push) ────────────────────────────────────

  /**
   * List health checks pushed by Celery tasks, with pagination and filters.
   */
  getChecks: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(200).default(50),
        status: z.string().optional(),
        checkType: z.string().optional(),
        since: z.string().datetime().optional(),
      }),
    )
    .query(async ({ input }) => {
      return monitoringService.getChecks(input);
    }),

  /**
   * List monitoring alerts with pagination and optional severity / ack filters.
   */
  getAlerts: adminProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(200).default(50),
        severity: z.enum(["info", "warning", "error", "critical"]).optional(),
        acknowledged: z.boolean().optional(),
      }),
    )
    .query(async ({ input }) => {
      return monitoringService.getAlerts(input);
    }),

  /**
   * Acknowledge a monitoring alert by ID.
   */
  acknowledgeAlert: adminProcedure
    .input(z.object({ alertId: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await monitoringService.acknowledgeAlert(input.alertId);
      return { success: true };
    }),

  /**
   * Return system_metrics_history rows from the last N hours for chart display.
   */
  getMetricsHistory: adminProcedure
    .input(z.object({ hours: z.number().int().min(1).max(720).default(24) }))
    .query(async ({ input }) => {
      return monitoringService.getMetricsHistory(input.hours);
    }),

  /**
   * Aggregate current status: services, unacknowledged alert counts, last check time.
   */
  getCurrentStatus: adminProcedure.query(async () => {
    return monitoringService.getCurrentStatus();
  }),
});
