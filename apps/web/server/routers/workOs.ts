import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { domainAdminProcedure, protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  buildAutomationPolicySnapshot,
  resolveAutomationLaunchPolicy,
  resolveAutomationStepRoute,
} from "../services/workAutomationPolicyService";
import {
  getDefaultContractCompatibility,
  skillStudioActionValues,
  workOrchestratorSurfaceValues,
  type SkillStudioAction,
  type WorkOrchestratorSurface,
} from "../../shared/workOrchestrator";
import { executeAutomationStep } from "../services/workAutomationExecutionService";
import * as automationFabricService from "../services/workAutomationFabricService";
import { getBrowserAutomationHealth, reconcileBrowserAutomationTaskClaims } from "../services/workAutomationBrowserTaskService";
import * as workOsService from "../services/workOsService";
import { buildPreflightRevisionFingerprint } from "../services/preflightRevisionService";
import {
  redactPreflightDiagnostics,
  resolvePreflightPreviewAccess,
} from "../services/preflightAccessPolicyService";
import { resolveTeamForAutomation } from "../services/teamResolutionPolicyService";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  }
  return tenantId;
}


function isPlaceholderAutomationObjective(
  objective: string | null | undefined,
  title: string
): boolean {
  if (!objective) return true;
  const normalized = objective.trim().toLowerCase();
  const normalizedTitle = title.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized === normalizedTitle ||
    normalized === `start automation for ${normalizedTitle}` ||
    normalized.startsWith("start automation for ")
  );
}

function resolveAutomationObjective(input: {
  title: string;
  objective?: string | null;
  requestObjective?: string | null;
  caseSummary?: string | null;
  caseTitle?: string | null;
}): {
  objective: string | null;
  source: "input" | "request.objective" | "case.summary" | "case.title";
} {
  const title = input.title.trim();
  const rawObjective = input.objective?.trim() || null;
  const requestObjective = input.requestObjective?.trim() || null;
  const caseSummary = input.caseSummary?.trim() || null;
  const caseTitle = input.caseTitle?.trim() || title || null;

  if (rawObjective && !isPlaceholderAutomationObjective(rawObjective, title)) {
    return { objective: rawObjective, source: "input" };
  }
  if (requestObjective) {
    return { objective: requestObjective, source: "request.objective" };
  }
  if (caseSummary) {
    return { objective: caseSummary, source: "case.summary" };
  }
  if (caseTitle) {
    return { objective: caseTitle, source: "case.title" };
  }
  return { objective: rawObjective, source: "input" };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(item => String(item).trim()).filter(Boolean)
    : [];
}

function surfaceGateFor(surface: WorkOrchestratorSurface) {
  switch (surface) {
    case "skill":
      return "manifest_risk_policy" as const;
    case "agency":
      return "capability_risk_policy" as const;
    case "workflow":
      return "feature_flag_runtime_permission_approval" as const;
    case "browser":
      return "connector_domain_policy" as const;
    case "document_management":
      return "bounded_write_scope" as const;
    case "media_studio":
      return "provider_allowlist_quota" as const;
    case "skill_studio":
      return "skill_studio_action_policy" as const;
    case "manual":
      return "human_action" as const;
    case "video_editor":
    case "work_os":
    default:
      return "explicit_approval" as const;
  }
}

function buildCapabilityEntry(input: {
  surface: WorkOrchestratorSurface;
  action?: SkillStudioAction | null;
  selected: boolean;
}) {
  const contractCompatibility = getDefaultContractCompatibility(input.surface);
  const approvalRequired =
    input.surface === "workflow" ||
    input.surface === "skill_studio" ||
    input.surface === "video_editor" ||
    input.surface === "manual" ||
    input.surface === "work_os";
  return {
    id: input.action ? `${input.surface}:${input.action}` : input.surface,
    surface: input.surface,
    action: input.action ?? null,
    title: input.action
      ? `Skill Studio: ${input.action.replace(/_/g, " ")}`
      : input.surface.replace(/_/g, " "),
    description: input.selected
      ? "Selected by the legacy launch policy allowlist."
      : "Planner-visible capability candidate.",
    governance: {
      surface: input.surface,
      action: input.action ?? null,
      plannerVisible: true,
      autoExecutableByDefault:
        input.surface === "skill" || input.surface === "agency",
      approvalRequired,
      minimumGate: surfaceGateFor(input.surface),
      requiredFeatureFlags:
        input.surface === "workflow"
          ? ["workflow_surface_planning"]
          : input.surface === "skill_studio"
            ? ["skill_studio_planning"]
            : [],
      requiredPermissions:
        input.surface === "workflow"
          ? ["workflow:execute"]
          : input.surface === "skill_studio"
            ? ["skill_studio:launch"]
            : [],
    },
    contractCompatibility,
    blockedReason:
      contractCompatibility.state === "blocked_contract_not_migrated"
        ? contractCompatibility.reasonCode
        : null,
    metadata: {
      selected: input.selected,
    },
  };
}

const assignmentTypeSchema = z.enum(["human", "queue", "role", "hybrid"]);
const automationModeSchema = z.enum(["manual_assist", "semi_auto", "fully_auto"]);
const automationRunStatusSchema = z.enum(["pending", "running", "waiting_for_input", "waiting_for_approval", "paused", "completed", "failed", "cancelled"]);
const automationStepStatusSchema = z.enum(["planned", "running", "needs_input", "awaiting_approval", "blocked", "succeeded", "failed", "skipped", "cancelled"]);
const automationCheckpointApprovalStateSchema = z.enum(["pending", "approved", "rejected", "not_required"]);
const automationCheckpointStatusSchema = z.enum(["open", "approved", "rejected", "resumed", "cancelled"]);
const automationSurfaceSchema = z.enum(["manual", "work_os", "skill", "agency", "browser", "document_management", "media_studio", "video_editor"]);

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

  createAutomationRun: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      requestId: z.string().min(1).optional(),
      taskId: z.string().min(1).optional(),
      templateKey: z.string().min(1).max(120).optional(),
      templateVersion: z.string().max(50).optional(),
      title: z.string().min(1).max(500),
      objective: z.string().max(10000).optional(),
      mode: automationModeSchema.optional(),
      status: automationRunStatusSchema.optional(),
      createdByUserId: z.number().int().optional(),
      createdByAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.createAutomationRun({
        tenantId,
        ...input,
      });
    }),


  resolvePreflightPreview: protectedProcedure
    .input(z.object({
      caseId: z.string().min(1),
      title: z.string().max(500).optional(),
      objective: z.string().max(10000).optional(),
      mode: automationModeSchema.optional(),
      templateKey: z.string().min(1).max(120).optional(),
      templateVersion: z.string().max(50).optional(),
      linkedConversationIds: z.array(z.string().min(1)).optional(),
      linkedWorkpackRunIds: z.array(z.string().min(1)).optional(),
      linkedRoleRoutineRunIds: z.array(z.string().min(1)).optional(),
      selectedSourceIds: z.array(z.string().min(1)).optional(),
      explicitTeamId: z.string().min(1).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(input.caseId, tenantId);
      const access = resolvePreflightPreviewAccess({
        actorUserId: ctx.user?.id ?? null,
        actorRole: ctx.user?.role ?? null,
        requesterId: projection.request?.requesterId ?? null,
      });
      if (!access.allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only preview automation for your own request or as an admin.",
        });
      }

      const policy = resolveAutomationLaunchPolicy({
        caseRecord: projection.case,
        requestRecord: projection.request,
        templateKey: input.templateKey ?? null,
        templateVersion: input.templateVersion ?? null,
        mode: input.mode ?? null,
      });
      const policyJson = buildAutomationPolicySnapshot(policy);
      const title = input.title?.trim() || projection.case.title;
      const resolvedObjective = resolveAutomationObjective({
        title,
        objective: input.objective ?? null,
        requestObjective: projection.request?.objective ?? null,
        caseSummary: projection.case.summary ?? null,
        caseTitle: projection.case.title ?? null,
      });

      const requestRecord = projection.request as Record<string, unknown> | null;
      const linkedConversationIds =
        input.linkedConversationIds ??
        asStringArray(requestRecord?.linkedConversationIdsJson);
      const linkedWorkpackRunIds =
        input.linkedWorkpackRunIds ??
        asStringArray(requestRecord?.linkedWorkpackRunIdsJson);
      const linkedRoleRoutineRunIds =
        input.linkedRoleRoutineRunIds ??
        asStringArray(requestRecord?.linkedRoleRoutineRunIdsJson);

      const sourceRefs = [
        {
          sourceType: "case" as const,
          sourceId: projection.case.id,
          label: projection.case.title,
          required: true,
          trust: "trusted" as const,
          freshness: "current" as const,
        },
        projection.request
          ? {
              sourceType: "request" as const,
              sourceId: projection.request.id,
              label: projection.request.title,
              required: true,
              trust: "trusted" as const,
              freshness: "current" as const,
            }
          : null,
        ...linkedConversationIds.map(sourceId => ({
          sourceType: "conversation" as const,
          sourceId,
          label: `Conversation ${sourceId}`,
          required: true,
          trust: "derived" as const,
          freshness: "recent" as const,
        })),
        ...linkedWorkpackRunIds.map(sourceId => ({
          sourceType: "workpack_run" as const,
          sourceId,
          label: `Workpack run ${sourceId}`,
          required: false,
          trust: "derived" as const,
          freshness: "recent" as const,
        })),
        ...linkedRoleRoutineRunIds.map(sourceId => ({
          sourceType: "role_routine_run" as const,
          sourceId,
          label: `Role routine run ${sourceId}`,
          required: false,
          trust: "derived" as const,
          freshness: "recent" as const,
        })),
      ].filter((source): source is NonNullable<typeof source> => Boolean(source));

      const selectedSourceIds =
        input.selectedSourceIds && input.selectedSourceIds.length > 0
          ? input.selectedSourceIds
          : sourceRefs.map(source => source.sourceId);
      const preflightRevision = buildPreflightRevisionFingerprint({
        requestTitle: title,
        requestObjective: resolvedObjective.objective,
        linkedConversationIds,
        linkedWorkpackRunIds,
        linkedRoleRoutineRunIds,
        selectedSourceIds,
        policyInputs: policyJson,
        explicitTeamId: input.explicitTeamId ?? null,
      });
      const explicitTeamAuthorized =
        Boolean(input.explicitTeamId) &&
        (ctx.user?.role === "admin" || ctx.user?.role === "domain_admin");
      const teamResolution = resolveTeamForAutomation({
        explicitTeamId: input.explicitTeamId ?? null,
        explicitTeamAuthorized,
        caseOwnerType: projection.case.ownerType,
        caseOwnerId: projection.case.ownerId,
        requestDefaultQueueId: projection.request?.defaultQueueId ?? null,
        requestDefaultOwnerType: projection.request?.defaultOwnerType ?? null,
        requestDefaultOwnerId: projection.request?.defaultOwnerId ?? null,
      });

      const selectedSurfaces = new Set<string>(policy.surfaceAllowlist ?? []);
      const capabilityCatalog = workOrchestratorSurfaceValues.flatMap(surface => {
        if (surface === "skill_studio") {
          return skillStudioActionValues.map(action =>
            buildCapabilityEntry({
              surface,
              action,
              selected: selectedSurfaces.has(surface),
            })
          );
        }
        return [
          buildCapabilityEntry({
            surface,
            selected: selectedSurfaces.has(surface),
          }),
        ];
      });

      const diagnostics = redactPreflightDiagnostics({
        visibleReasonCodes: capabilityCatalog
          .map(entry => entry.blockedReason)
          .filter(Boolean),
        policyJson,
        teamResolution,
        contractCompatibility: capabilityCatalog.map(entry => ({
          id: entry.id,
          state: entry.contractCompatibility.state,
          reasonCode: entry.contractCompatibility.reasonCode,
        })),
      }, access);

      return {
        access,
        caseId: input.caseId,
        requestId: projection.request?.id ?? null,
        previewView: access.view,
        brief: {
          title,
          objective: resolvedObjective.objective,
          summary: resolvedObjective.objective ?? title,
          sourceRefs,
          approvalSnapshots: [],
          generatedAt: preflightRevision.generatedAt,
        },
        capabilityCatalog,
        teamResolution,
        preflightRevision,
        diagnostics,
      };
    }),

  resolveAutomationPlan: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      templateKey: z.string().min(1).max(120).optional(),
      templateVersion: z.string().max(50).optional(),
      title: z.string().max(500).optional(),
      objective: z.string().max(10000).optional(),
      mode: automationModeSchema.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(input.caseId, tenantId);
      const policy = resolveAutomationLaunchPolicy({
        caseRecord: projection.case,
        requestRecord: projection.request,
        templateKey: input.templateKey ?? null,
        templateVersion: input.templateVersion ?? null,
        mode: input.mode ?? null,
      });
      return {
        ...policy,
        policyJson: buildAutomationPolicySnapshot(policy),
        caseId: input.caseId,
        title: input.title?.trim() || projection.case.title,
        objective: input.objective?.trim() || projection.case.summary || projection.request?.objective || null,
      };
    }),

  resolveAutomationStepRoute: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      stepKey: z.string().min(1).max(120),
      requestedSurface: automationSurfaceSchema.optional().nullable(),
      templateKey: z.string().min(1).max(120).optional(),
      templateVersion: z.string().max(50).optional(),
      mode: automationModeSchema.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      const projection = await workOsService.getWorkCaseProjection(input.caseId, tenantId);
      const policy = resolveAutomationLaunchPolicy({
        caseRecord: projection.case,
        requestRecord: projection.request,
        templateKey: input.templateKey ?? null,
        templateVersion: input.templateVersion ?? null,
        mode: input.mode ?? null,
      });
      const route = resolveAutomationStepRoute({
        stepKey: input.stepKey,
        requestedSurface: input.requestedSurface ?? null,
        policy,
      });
      return {
        ...route,
        policyJson: buildAutomationPolicySnapshot(policy),
        caseId: input.caseId,
      };
    }),

  executeAutomationStep: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      runId: z.string().min(1),
      stepKey: z.string().min(1).max(120),
      stepIndex: z.number().int().min(0),
      title: z.string().min(1).max(500),
      objective: z.string().max(10000).optional(),
      prompt: z.string().max(20000).optional(),
      requestedSurface: automationSurfaceSchema.optional().nullable(),
      approvalState: automationCheckpointApprovalStateSchema.optional().nullable(),
      idempotencyKey: z.string().max(180).optional(),
      inputRefsJson: z.array(z.string().min(1)).optional(),
      skillId: z.string().max(120).optional(),
      agencyId: z.string().max(120).optional(),
      agencyConversationId: z.string().max(120).optional(),
      agencyRecipientAgent: z.string().max(120).optional(),
      agencyAdditionalInstructions: z.string().max(5000).optional(),
      libraryItemType: z.string().max(100).optional(),
      librarySource: z.string().max(100).optional(),
      libraryTitle: z.string().max(500).optional(),
      mediaModel: z.string().max(120).optional(),
      videoModel: z.string().max(120).optional(),
      aspectRatio: z.string().max(30).optional(),
      size: z.string().max(30).optional(),
      duration: z.number().int().positive().optional(),
      referenceImageUrls: z.array(z.string().min(1)).optional(),
      referenceVideoUrls: z.array(z.string().min(1)).optional(),
      createdByUserId: z.number().int().optional(),
      createdByAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return executeAutomationStep({
        tenantId,
        ...input,
        userToken: ctx.userToken ?? "",
        actorUserId: input.createdByUserId ?? ctx.user.id,
        actorAssistantId: input.createdByAssistantId ?? null,
      });
    }),

  recordAutomationStep: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      runId: z.string().min(1),
      stepKey: z.string().min(1).max(120),
      stepIndex: z.number().int().min(0),
      title: z.string().min(1).max(500),
      status: automationStepStatusSchema,
      riskTier: z.enum(["low", "medium", "high", "critical"]).optional(),
      surface: automationSurfaceSchema.optional(),
      inputRefsJson: z.array(z.string().min(1)).optional(),
      outputRefsJson: z.array(z.string().min(1)).optional(),
      retryCount: z.number().int().min(0).optional(),
      idempotencyKey: z.string().max(180).optional(),
      summary: z.string().max(5000).optional(),
      detailJson: z.record(z.string(), z.unknown()).optional(),
      checkpointId: z.string().min(1).optional(),
      startedAt: z.coerce.date().optional(),
      completedAt: z.coerce.date().optional(),
      runStatus: automationRunStatusSchema.optional(),
      finalDisposition: z.string().max(120).optional(),
      finalDispositionReason: z.string().max(5000).optional(),
      createdByUserId: z.number().int().optional(),
      createdByAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.recordAutomationRunStepProgress({
        tenantId,
        ...input,
      });
    }),

  recordAutomationCheckpoint: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      runId: z.string().min(1),
      stepId: z.string().min(1).optional(),
      stepKey: z.string().min(1).optional(),
      checkpointKey: z.string().min(1).max(120),
      resumeCursor: z.string().min(1),
      approvalState: automationCheckpointApprovalStateSchema.optional(),
      checkpointStatus: automationCheckpointStatusSchema.optional(),
      editSnapshotRefsJson: z.array(z.string().min(1)).optional(),
      snapshotJson: z.record(z.string(), z.unknown()).optional(),
      detailJson: z.record(z.string(), z.unknown()).optional(),
      requestedByUserId: z.number().int().optional(),
      approvedByUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
      requestedAt: z.coerce.date().optional(),
      approvedAt: z.coerce.date().optional(),
      resumedAt: z.coerce.date().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.recordAutomationCheckpoint({
        tenantId,
        ...input,
      });
    }),

  resumeAutomationCheckpoint: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      runId: z.string().min(1),
      checkpointId: z.string().min(1),
      requestedByUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.resumeAutomationRunFromCheckpoint({
        tenantId,
        ...input,
      });
    }),

  recordAutomationModeChange: domainAdminProcedure
    .input(z.object({
      caseId: z.string().min(1),
      runId: z.string().min(1),
      fromMode: automationModeSchema.optional().nullable(),
      toMode: automationModeSchema,
      reason: z.string().max(5000).optional(),
      detailJson: z.record(z.string(), z.unknown()).optional(),
      actorUserId: z.number().int().optional(),
      actorAssistantId: z.string().min(1).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.recordAutomationModeChange({
        tenantId,
        ...input,
      });
    }),

  reconcileBrowserAutomationTasks: domainAdminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).optional() }).optional())
    .mutation(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return reconcileBrowserAutomationTaskClaims(tenantId, { limit: input?.limit ?? 20 });
    }),

  getBrowserAutomationHealth: domainAdminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return getBrowserAutomationHealth(tenantId);
  }),

  getAutomationRun: domainAdminProcedure
    .input(z.object({ runId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const tenantId = requireTenantId(ctx);
      return automationFabricService.getAutomationRunProjection(input.runId, tenantId);
    }),

  overview: domainAdminProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return workOsService.getOverview(tenantId);
  }),
});
