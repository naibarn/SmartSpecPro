/**
 * Team tRPC Router — team CRUD and template instantiation.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as teamService from "../services/teamService";

const memberInputSchema = z.object({
  personaId: z.string().min(1),
  displayName: z.string().min(1).max(255),
  nickname: z.string().max(100).optional(),
  roleTitle: z.string().max(100).optional(),
  genderStyle: z.string().max(20).optional(),
  specialtyTags: z.array(z.string()).optional(),
  preferredModelId: z.string().max(100).optional(),
  modelSelectionPolicy: z.enum(["fixed", "cost_optimized", "quality_optimized", "auto"]).optional(),
  instructions: z.string().min(1),
  isLead: z.boolean(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  preferredLanguage: z.string().max(10).optional(),
});

export const teamRouter = router({
  create: protectedProcedure
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
      const tenantId = resolveTenantIdVarchar(ctx);
      return teamService.createTeam({
        tenantId,
        ownerUserId: ctx.userId,
        ...input,
      });
    }),

  cloneFromTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string().min(1),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      return teamService.createFromTemplate(
        input.templateId,
        tenantId,
        ctx.userId,
        { name: input.name, description: input.description },
      );
    }),

  get: protectedProcedure
    .input(z.object({ teamId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
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
      const tenantId = resolveTenantIdVarchar(ctx);
      return teamService.listTeams(
        tenantId,
        input?.ownerOnly ? ctx.userId : undefined,
        input?.status,
      );
    }),

  archive: protectedProcedure
    .input(z.object({ teamId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      await teamService.archiveTeam(input.teamId, tenantId);
      return { success: true };
    }),

  updateMember: protectedProcedure
    .input(z.object({
      profileId: z.string().min(1),
      displayName: z.string().max(255).optional(),
      nickname: z.string().max(100).optional(),
      roleTitle: z.string().max(100).optional(),
      instructions: z.string().optional(),
      model: z.string().max(100).optional(),
      isLead: z.boolean().optional(),
      isActive: z.boolean().optional(),
      sortOrder: z.number().int().optional(),
      preferredLanguage: z.string().max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx);
      const { profileId, ...updates } = input;
      await teamService.updateTeamMember(profileId, tenantId, updates);
      return { success: true };
    }),
});
