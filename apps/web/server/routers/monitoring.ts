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
import { collectServiceRuntimeSnapshot } from "./services";
import * as workerFleetService from "../services/workerFleetService";
import * as workerBudgetService from "../services/workerBudgetService";
import * as workOsService from "../services/workOsService";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tid;
}

export const monitoringRouter = router({
  getWorkpackSummary: adminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return monitoringService.getWorkpackMonitoringSummary(tenantId);
  }),

  getWorkpackReadiness: adminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    const { listWorkpackReadinessSummaries } = await import("../services/workpackReadinessService");
    return listWorkpackReadinessSummaries(tenantId);
  }),

  getRoleAutonomySummary: adminProcedure
    .input(z.object({
      roleId: z.string().min(1).optional(),
      departmentLabel: z.string().min(1).optional(),
      routineId: z.string().min(1).optional(),
      workpackFamily: z.string().min(1).optional(),
      runtimeFamily: z.string().min(1).optional(),
      connectorFamily: z.string().min(1).optional(),
      riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const { getRoleRosterSummary } = await import("../services/roleMonitorService");
      const { listRoleTelemetrySnapshots } = await import("../services/roleTelemetryService");
      return {
        roster: await getRoleRosterSummary(tenantId),
        telemetry: await listRoleTelemetrySnapshots(tenantId, input ?? {}),
      };
    }),

  getWorkOsOverview: adminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return workOsService.getOverview(tenantId);
  }),

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
        groupKey: z.string().min(1).optional(),
      }),
    )
    .query(async ({ input }) => {
      return monitoringService.getAlerts(input);
    }),

  /**
   * Acknowledge a monitoring alert by ID.
   */
  acknowledgeAlert: adminProcedure
    .input(z.object({
      alertId: z.number().int().positive(),
      note: z.string().trim().max(1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await monitoringService.acknowledgeAlert({
        alertId: input.alertId,
        acknowledgedBy: ctx.user!.id,
        actorName: ctx.user!.name ?? null,
        actorEmail: ctx.user!.email ?? null,
        note: input.note,
      });
      return { success: true };
    }),

  recordIncidentAction: adminProcedure
    .input(z.object({
      groupKey: z.string().min(1),
      action: z.enum(["note", "handoff", "resolved", "reopened"]),
      note: z.string().trim().max(1000).optional(),
      ownerUserId: z.number().int().positive().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await monitoringService.recordIncidentAction({
        groupKey: input.groupKey,
        action: input.action,
        actorId: ctx.user!.id,
        actorName: ctx.user!.name ?? null,
        actorEmail: ctx.user!.email ?? null,
        note: input.note,
        ownerUserId: input.ownerUserId,
      });
      return { success: true };
    }),

  forceFreshCheck: adminProcedure
    .mutation(async () => {
      const snapshot = await collectServiceRuntimeSnapshot();
      const services = Object.fromEntries(
        snapshot.services.map((service) => {
          const alias = service.id === "smartspec-web"
            ? "web"
            : service.id === "smartspec-backend"
              ? "backend"
              : service.name;

          return [alias, {
            status: service.status,
            displayName: service.displayName,
            uptime: service.uptime,
            type: service.type,
            healthCheck: service.healthCheck ?? null,
            cpu: service.cpu ?? null,
            memory: service.memory ?? null,
            restarts: service.restarts ?? null,
          }];
        }),
      );

      const criticalStates = new Set(["stopped", "unhealthy"]);
      const warningStates = new Set(["starting", "unknown"]);
      const overallStatus = snapshot.services.some((service) => criticalStates.has(service.status))
        ? "critical"
        : snapshot.services.some((service) => warningStates.has(service.status))
          ? "warning"
          : "ok";

      const result = await monitoringService.pushMetrics({
        checkType: "manual_refresh",
        status: overallStatus,
        source: "admin.force_fresh_check",
        details: {
          memoryUsedMb: snapshot.system.memory?.used ?? 0,
          memoryTotalMb: snapshot.system.memory?.total ?? 0,
          memoryPercent: snapshot.system.memory?.usedPercent ?? 0,
          cpuPercent: null,
          diskUsedGb: snapshot.system.disk?.used ?? null,
          diskTotalGb: snapshot.system.disk?.total ?? null,
          services,
        },
      });

      return {
        success: true,
        checkId: result.checkId,
        status: overallStatus,
      };
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

  listWorkers: adminProcedure
    .query(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerFleetService.listWorkerFleet(tenantId);
    }),

  getWorkerDiagnostics: adminProcedure
    .input(z.object({ workerId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerFleetService.getWorkerDiagnosticsSnapshot(tenantId, input.workerId);
    }),

  getWorkerMcpInsights: adminProcedure
    .input(z.object({
      workerId: z.string().min(1),
      hours: z.number().int().min(1).max(168).default(24),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerFleetService.getWorkerMcpInsights(tenantId, input.workerId, {
        hours: input.hours,
      });
    }),

  getTenantWorkerMcpOverview: adminProcedure
    .input(z.object({
      hours: z.number().int().min(1).max(168).default(24),
    }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerFleetService.getTenantWorkerMcpOverview(tenantId, {
        hours: input?.hours ?? 24,
      });
    }),

  updateWorkerState: adminProcedure
    .input(z.object({
      workerId: z.string().min(1),
      action: z.enum(["disable", "drain", "resume", "revoke"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const worker = await workerFleetService.updateWorkerFleetState({
        tenantId,
        workerId: input.workerId,
        action: input.action,
        actorUserId: ctx.user?.id ?? null,
      });
      return {
        success: true,
        workerId: worker.id,
        status: worker.status,
      };
    }),

  cleanupWorkerRetention: adminProcedure
    .mutation(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerFleetService.cleanupWorkerFleetRetention({ tenantId });
    }),

  redactLegacyWorkerData: adminProcedure
    .mutation(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerFleetService.redactLegacyWorkerData({
        tenantId,
        actorUserId: ctx.user?.id ?? null,
      });
    }),

  getWorkerBudget: adminProcedure
    .input(z.object({ workerId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerBudgetService.getWorkerBudgetSettings({
        tenantId,
        workerId: input.workerId,
      });
    }),

  updateWorkerBudget: adminProcedure
    .input(z.object({
      workerId: z.string().min(1),
      hourlyCredits: z.number().int().positive().nullable().optional(),
      fiveHourCredits: z.number().int().positive().nullable().optional(),
      dailyCredits: z.number().int().positive().nullable().optional(),
      weeklyCredits: z.number().int().positive().nullable().optional(),
      monthlyCredits: z.number().int().positive().nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerBudgetService.updateWorkerBudgetSettings({
        tenantId,
        workerId: input.workerId,
        actorUserId: ctx.user?.id ?? null,
        budgets: {
          hourlyCredits: input.hourlyCredits ?? null,
          fiveHourCredits: input.fiveHourCredits ?? null,
          dailyCredits: input.dailyCredits ?? null,
          weeklyCredits: input.weeklyCredits ?? null,
          monthlyCredits: input.monthlyCredits ?? null,
        },
      });
    }),

  /**
   * Unified early-warning summary for admin monitoring surfaces.
   */
  getOpsOverview: adminProcedure
    .input(
      z.object({
        metricsHours: z.number().int().min(1).max(48).default(6),
        auditHours: z.number().int().min(1).max(48).default(6),
        orchestrationHours: z.number().int().min(1).max(48).default(6),
      }).optional(),
    )
    .query(async ({ input }) => {
      return monitoringService.getOpsOverview({
        metricsHours: input?.metricsHours,
        auditHours: input?.auditHours,
        orchestrationHours: input?.orchestrationHours,
      });
    }),

  getOpsIncidentTimeline: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(20).default(6),
        groupKey: z.string().min(1).optional(),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return monitoringService.getOpsIncidentTimeline(tenantId, {
        limit: input?.limit ?? 6,
        groupKey: input?.groupKey,
      });
    }),

  syncOpsAlerts: adminProcedure
    .input(
      z.object({
        includeWarnings: z.boolean().default(true),
      }).optional(),
    )
    .mutation(async ({ input }) => {
      return monitoringService.syncOpsAlerts({
        includeWarnings: input?.includeWarnings ?? true,
      });
    }),
});
