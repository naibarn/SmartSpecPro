/**
 * Team tRPC Router — team CRUD and template instantiation.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as teamService from "../services/teamService";
import * as workerBudgetService from "../services/workerBudgetService";
import { TEAM_BLUEPRINTS } from "@shared/teamBlueprints";
import { auditLogger } from "../services/auditLogger";

const memberInputSchema = z.object({
  memberKind: z.enum(["assistant", "human", "external_connector"]).default("assistant"),
  memberRole: z.enum(["orchestrator", "researcher", "reviewer", "publisher", "specialist"]).optional(),
  personaId: z.string().min(1).optional(),
  blueprintId: z.string().min(1).optional(),
  blueprintMemberId: z.string().min(1).optional(),
  humanUserId: z.number().int().positive().optional(),
  externalRef: z.string().min(1).max(255).optional(),
  externalWorkerId: z.string().uuid().optional(),
  externalConfigJson: z.record(z.string(), z.unknown()).optional(),
  displayName: z.string().min(1).max(255),
  nickname: z.string().max(100).optional(),
  roleTitle: z.string().max(100).optional(),
  genderStyle: z.string().max(20).optional(),
  specialtyTags: z.array(z.string()).optional(),
  preferredModelId: z.string().max(100).optional(),
  modelSelectionPolicy: z.enum(["fixed", "cost_optimized", "quality_optimized", "auto"]).optional(),
  instructions: z.string().min(1).optional(),
  isLead: z.boolean(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  preferredLanguage: z.string().max(10).optional(),
}).superRefine((member, ctx) => {
  if (member.memberKind === "assistant") {
    if (!member.personaId && !(member.blueprintId && member.blueprintMemberId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["personaId"], message: "Assistant members require personaId or blueprint reference" });
    }
    if (!member.instructions) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["instructions"], message: "Assistant members require instructions" });
    }
  }
  if (member.memberKind === "human" && !member.humanUserId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["humanUserId"], message: "Human members require humanUserId" });
  }
  if (member.memberKind === "external_connector" && !member.externalRef) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["externalRef"], message: "External connector members require externalRef" });
  }
  if (member.isLead && member.memberKind !== "assistant") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["isLead"], message: "Only assistant members can be lead" });
  }
  if (member.memberRole === "orchestrator" && member.memberKind !== "assistant") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["memberRole"], message: "Only assistant members can be orchestrator" });
  }
});

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  return tid;
}

const rateLimitedTeamCreate = protectedProcedure.use(
  createRateLimitMiddleware({
    namespace: "team-create",
    limit: 20,
    windowMs: 3_600_000,
  }),
);

export const teamRouter = router({
  create: rateLimitedTeamCreate
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
      defaultViewMode: z.enum(["transparent", "milestone", "summary"]).optional(),
      defaultAutonomyLevel: z.enum(["manual", "guided", "autonomous"]).optional(),
      defaultModelId: z.string().max(100).optional(),
      members: z.array(memberInputSchema).min(1).max(10),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const result = await teamService.createTeam({
        tenantId,
        ownerUserId: ctx.user!.id,
        ...input,
      });
      auditLogger.log({
        eventType: "team_created",
        userId: ctx.user!.id,
        metadata: {
          teamId: result.teamId,
          tenantId,
          memberCount: input.members.length,
          category: input.category ?? null,
        },
      });
      return result;
    }),

  cloneFromTemplate: rateLimitedTeamCreate
    .input(z.object({
      templateId: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const result = await teamService.createFromTemplate(
        input.templateId,
        tenantId,
        ctx.user!.id,
        { name: input.name, description: input.description },
      );
      auditLogger.log({
        eventType: "team_template_cloned",
        userId: ctx.user!.id,
        metadata: {
          teamId: result.teamId,
          templateId: input.templateId,
          tenantId,
        },
      });
      return result;
    }),

  createFromBlueprint: rateLimitedTeamCreate
    .input(z.object({
      blueprintId: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      category: z.string().max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const result = await teamService.createTeamFromBlueprint(
        input.blueprintId,
        tenantId,
        ctx.user!.id,
        {
          name: input.name,
          description: input.description,
          category: input.category,
        },
      );
      auditLogger.log({
        eventType: "team_blueprint_created",
        userId: ctx.user!.id,
        metadata: {
          teamId: result.teamId,
          blueprintId: input.blueprintId,
          tenantId,
        },
      });
      return result;
    }),

  get: protectedProcedure
    .input(z.object({ teamId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const team = await teamService.getTeam(input.teamId, tenantId);
      if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
      return team;
    }),

  list: protectedProcedure
    .input(z.object({
      status: z.enum(["active", "archived", "draft"]).optional(),
      ownerOnly: z.boolean().optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return teamService.listTeams(
        tenantId,
        input?.ownerOnly ? ctx.user!.id : undefined,
        input?.status,
      );
    }),

  listTemplates: protectedProcedure
    .query(async ({ ctx }) => {
      const tenantId = requireTenantId(ctx);
      return teamService.listTeamTemplates(tenantId);
    }),

  listBindableWorkers: protectedProcedure
    .input(z.object({ teamId: z.string().min(1).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return teamService.listBindableWorkers(tenantId, ctx.user!.id, input?.teamId ?? null);
    }),

  getOwnedWorkerBudget: protectedProcedure
    .input(z.object({ workerId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workerBudgetService.getWorkerBudgetSettings({
        tenantId,
        workerId: input.workerId,
        ownerUserId: ctx.user!.id,
      });
    }),

  updateOwnedWorkerBudget: protectedProcedure
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
        ownerUserId: ctx.user!.id,
        actorUserId: ctx.user!.id,
        budgets: {
          hourlyCredits: input.hourlyCredits ?? null,
          fiveHourCredits: input.fiveHourCredits ?? null,
          dailyCredits: input.dailyCredits ?? null,
          weeklyCredits: input.weeklyCredits ?? null,
          monthlyCredits: input.monthlyCredits ?? null,
        },
      });
    }),

  listBlueprints: protectedProcedure
    .query(() => TEAM_BLUEPRINTS),

  addMember: protectedProcedure
    .input(z.object({
      teamId: z.string().min(1),
      member: memberInputSchema,
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return teamService.addTeamMember(input.teamId, tenantId, input.member);
    }),

  archive: protectedProcedure
    .input(z.object({ teamId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      await teamService.archiveTeam(input.teamId, tenantId);
      return { success: true };
    }),

  updateMember: protectedProcedure
    .input(z.object({
      profileId: z.string().min(1),
      displayName: z.string().max(255).optional(),
      nickname: z.string().max(100).optional(),
      roleTitle: z.string().max(100).optional(),
      memberRole: z.enum(["orchestrator", "researcher", "reviewer", "publisher", "specialist"]).optional(),
      humanUserId: z.number().int().positive().optional(),
      externalRef: z.string().max(255).optional(),
      externalWorkerId: z.string().uuid().nullable().optional(),
      externalConfigJson: z.record(z.string(), z.unknown()).optional(),
      instructions: z.string().optional(),
      model: z.string().max(100).optional(),
      isLead: z.boolean().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      preferredLanguage: z.string().max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const { profileId, ...updates } = input;
      await teamService.updateTeamMember(profileId, tenantId, updates);
      return { success: true };
    }),
});
