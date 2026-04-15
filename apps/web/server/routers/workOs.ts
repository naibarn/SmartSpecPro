import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { domainAdminProcedure, protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import * as workOsService from "../services/workOsService";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  }
  return tenantId;
}

const assignmentTypeSchema = z.enum(["human", "queue", "role", "hybrid"]);

export const workOsRouter = router({
  createRequest: protectedProcedure
    .input(z.object({
      projectId: z.number().int().optional(),
      sourceType: z.string().min(1),
      sourceRef: z.string().max(255).optional(),
      requesterType: assignmentTypeSchema.optional(),
      requesterId: z.string().max(36).optional(),
      workType: z.string().max(100).optional(),
      businessDomain: z.string().max(100).optional(),
      urgency: z.string().max(30).optional(),
      riskLevel: z.string().max(30).optional(),
      classificationConfidence: z.number().min(0).max(1).optional(),
      defaultOwnerType: assignmentTypeSchema.optional(),
      defaultOwnerId: z.string().max(36).optional(),
      defaultQueueId: z.string().max(36).optional(),
      title: z.string().min(1).max(500),
      objective: z.string().max(10000).optional(),
      linkedConversationIds: z.array(z.string().min(1)).optional(),
      linkedWorkpackRunIds: z.array(z.string().min(1)).optional(),
      linkedRoleRoutineRunIds: z.array(z.string().min(1)).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const { requesterId: inputRequesterId, ...requestInput } = input;
      const requesterId = inputRequesterId ?? String(ctx.user!.id);
      return workOsService.createWorkRequest({
        tenantId,
        ...requestInput,
        requesterId,
      });
    }),

  listMyRequests: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).optional() }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.listMyWorkRequests({
        tenantId,
        requesterId: String(ctx.user!.id),
        limit: input?.limit ?? 10,
      });
    }),

  createTask: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      teamId: z.string().min(1),
      roomId: z.string().min(1),
      runId: z.string().min(1).optional(),
      title: z.string().min(1).max(500),
      objective: z.string().max(10000).optional(),
      sourceType: z.string().max(50).optional(),
      sourceRef: z.string().max(255).optional(),
      priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
      riskClass: z.enum(["low", "medium", "high", "critical"]).optional(),
      requiresApproval: z.boolean().optional(),
      actorUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.createWorkTask({
        tenantId,
        ...input,
      });
    }),

  attachLegacyTask: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      taskId: z.string().min(1),
      actorUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.attachLegacyTaskToCase({
        tenantId,
        ...input,
      });
    }),

  getCase: domainAdminProcedure
    .input(z.object({ caseId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.getWorkCaseProjection(input.caseId, tenantId);
    }),

  projectTask: domainAdminProcedure
    .input(z.object({ taskId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.projectTaskAsCase(input.taskId, tenantId);
    }),

  inbox: domainAdminProcedure
    .input(z.object({
      ownerType: assignmentTypeSchema.optional(),
      ownerId: z.string().max(36).optional(),
    }).optional())
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.getInbox(tenantId, input?.ownerType ?? null, input?.ownerId ?? null);
    }),

  timeline: domainAdminProcedure
    .input(z.object({ caseId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(input.caseId, tenantId);
      return projection.timeline;
    }),

  recordApproval: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      taskId: z.string().min(1).optional(),
      requestId: z.string().min(1).optional(),
      approvalTransportId: z.string().min(1).optional(),
      decision: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
      approverType: assignmentTypeSchema.optional(),
      approverId: z.string().min(1).optional(),
      comment: z.string().max(1000).optional(),
      metadataJson: z.record(z.string(), z.unknown()).optional(),
      actorUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.recordApproval({
        tenantId,
        ...input,
      });
    }),

  recordException: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      taskId: z.string().min(1).optional(),
      requestId: z.string().min(1).optional(),
      exceptionType: z.string().min(1).max(100),
      severity: z.string().max(30).optional(),
      reason: z.string().max(5000).optional(),
      ownerType: assignmentTypeSchema.optional(),
      ownerId: z.string().min(1).optional(),
      status: z.enum(["open", "paused", "downgraded", "resolved"]).optional(),
      metadataJson: z.record(z.string(), z.unknown()).optional(),
      actorUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.recordException({
        tenantId,
        ...input,
      });
    }),

  recordOutcome: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      taskId: z.string().min(1).optional(),
      requestId: z.string().min(1).optional(),
      disposition: z.string().min(1).max(100),
      resolutionCode: z.string().max(100).optional(),
      customerImpact: z.string().max(100).optional(),
      reviewerResult: z.string().max(100).optional(),
      followUpRequired: z.boolean().optional(),
      summary: z.string().max(5000).optional(),
      metadataJson: z.record(z.string(), z.unknown()).optional(),
      actorUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.recordOutcome({
        tenantId,
        ...input,
      });
    }),

  recordSla: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      taskId: z.string().min(1).optional(),
      requestId: z.string().min(1).optional(),
      policyId: z.string().min(1).optional(),
      dueAt: z.coerce.date().optional(),
      serviceWindowStartAt: z.coerce.date().optional(),
      serviceWindowEndAt: z.coerce.date().optional(),
      urgency: z.string().max(30).optional(),
      breachState: z.enum(["none", "at_risk", "breached", "resolved"]).optional(),
      breachedAt: z.coerce.date().optional(),
      escalatedAt: z.coerce.date().optional(),
      actorUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.recordSla({
        tenantId,
        ...input,
      });
    }),

  reassignCase: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      ownerType: assignmentTypeSchema,
      ownerId: z.string().max(36).optional(),
      reason: z.string().max(500).optional(),
      actorUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return workOsService.reassignWorkCase({
        tenantId,
        ...input,
      });
    }),

  overview: domainAdminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return workOsService.getOverview(tenantId);
  }),
});
