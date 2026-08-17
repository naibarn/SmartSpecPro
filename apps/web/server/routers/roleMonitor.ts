import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import * as roleConfigurationService from "../services/roleConfigurationService";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as roleCommandService from "../services/roleCommandService";
import * as roleMonitorService from "../services/roleMonitorService";
import * as roleTelemetryService from "../services/roleTelemetryService";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: string | number | null } | null }): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  }
  return tenantId;
}

export const roleMonitorRouter = router({
  roster: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return roleMonitorService.getRoleRosterSummary(tenantId);
  }),

  detail: protectedProcedure
    .input(z.object({ roleId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const detail = await roleMonitorService.getRoleMonitorDetail(input.roleId);
      if (detail.role.tenantId !== tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Role belongs to another tenant" });
      }
      return detail;
    }),

  timeline: protectedProcedure
    .input(z.object({ roleId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const timeline = await roleMonitorService.getRoleRoutineTimeline(input.roleId);
      if (timeline.length > 0) {
        const detail = await roleMonitorService.getRoleMonitorDetail(input.roleId);
        if (detail.role.tenantId !== tenantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Role belongs to another tenant" });
        }
      }
      return timeline;
    }),

  telemetry: protectedProcedure
    .input(z.object({ roleId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const detail = await roleMonitorService.getRoleMonitorDetail(input.roleId);
      if (detail.role.tenantId !== tenantId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Role belongs to another tenant" });
      }
      return roleTelemetryService.getLatestRoleMetricSnapshot(input.roleId);
    }),

  createRole: adminProcedure
    .input(z.object({
      key: z.string().min(1),
      title: z.string().min(1),
      departmentLabel: z.string().min(1),
      purpose: z.string().min(1),
      defaultMission: z.string().min(1),
      typicalConnectorFamilies: z.array(z.string()).optional(),
      defaultAutonomyTier: z.enum(["manual", "guided", "supervised", "autonomous"]).optional(),
      bridgeTeamId: z.string().optional(),
      roomId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleConfigurationService.createRoleAgentFromBlueprint({
        tenantId,
        key: input.key,
        title: input.title,
        departmentLabel: input.departmentLabel,
        purpose: input.purpose,
        defaultMission: input.defaultMission,
        typicalConnectorFamilies: input.typicalConnectorFamilies,
        defaultAutonomyTier: input.defaultAutonomyTier,
        ownerUserId: ctx.user!.id,
        bridgeTeamId: input.bridgeTeamId ?? null,
        roomId: input.roomId ?? null,
      });
    }),

  updateMission: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      missionStatement: z.string().min(1),
      autonomyTier: z.enum(["manual", "guided", "supervised", "autonomous"]).optional(),
      monthlyBudgetLimit: z.number().nonnegative().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleConfigurationService.updateRoleMission({
        ...input,
        tenantId,
      });
    }),

  upsertBinding: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      contractId: z.string().min(1),
      bindingId: z.string().optional(),
      label: z.string().min(1),
      workpackFamily: z.string().min(1),
      resolutionPolicy: z.enum(["pinned_version", "follow_benchmark_track", "follow_latest_ready_in_family"]),
      pinnedVersionId: z.string().optional(),
      rollbackBaselineVersionId: z.string().optional(),
      connectorCeilingFamilies: z.array(z.string()).optional(),
      budgetCeiling: z.number().nonnegative().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleConfigurationService.upsertRoleWorkpackBinding({
        ...input,
        tenantId,
        bindingId: input.bindingId ?? null,
      });
    }),

  upsertRoutine: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      contractId: z.string().min(1),
      routineId: z.string().optional(),
      title: z.string().min(1),
      description: z.string().optional(),
      workpackBindingIds: z.array(z.string()).min(1),
      autonomyTier: z.enum(["manual", "guided", "supervised", "autonomous"]),
      triggerType: z.enum(["schedule", "inbox_poll", "queue_threshold", "connector_event", "exception_follow_up", "kpi_breach", "manual"]),
      intervalMinutes: z.number().int().positive().optional(),
      cron: z.string().optional(),
      concurrencyPolicy: z.enum(["singleton", "allow_overlap", "partitioned_by_key"]),
      slaMinutes: z.number().int().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleConfigurationService.upsertRoleRoutineDefinition({
        ...input,
        tenantId,
        routineId: input.routineId ?? null,
        intervalMinutes: input.intervalMinutes ?? null,
        cron: input.cron ?? null,
      });
    }),

  pauseRole: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleCommandService.pauseRole({
        tenantId,
        roleId: input.roleId,
        reason: input.reason,
        operatorUserId: ctx.user!.id,
      });
    }),

  resumeRole: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleCommandService.resumeRole({
        tenantId,
        roleId: input.roleId,
        reason: input.reason,
        operatorUserId: ctx.user!.id,
      });
    }),

  quarantineRole: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleCommandService.quarantineRole({
        tenantId,
        roleId: input.roleId,
        reason: input.reason,
        operatorUserId: ctx.user!.id,
      });
    }),

  pauseRoutine: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      routineId: z.string().min(1),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleCommandService.pauseRoutine({
        tenantId,
        roleId: input.roleId,
        routineId: input.routineId,
        reason: input.reason,
        operatorUserId: ctx.user!.id,
      });
    }),

  resumeRoutine: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      routineId: z.string().min(1),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleCommandService.resumeRoutine({
        tenantId,
        roleId: input.roleId,
        routineId: input.routineId,
        reason: input.reason,
        operatorUserId: ctx.user!.id,
      });
    }),

  requestSafeResumeReview: adminProcedure
    .input(z.object({
      roleId: z.string().min(1),
      routineId: z.string().optional(),
      routineRunId: z.string().optional(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleCommandService.requestSafeResumeReview({
        tenantId,
        roleId: input.roleId,
        routineId: input.routineId ?? null,
        routineRunId: input.routineRunId ?? null,
        requestedByUserId: ctx.user!.id,
        note: input.note,
      });
    }),

  stopDepartmentSlice: adminProcedure
    .input(z.object({
      departmentLabel: z.string().min(1),
      reason: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return roleCommandService.stopDepartmentSlice({
        tenantId,
        departmentLabel: input.departmentLabel,
        reason: input.reason,
        operatorUserId: ctx.user!.id,
      });
    }),
});
