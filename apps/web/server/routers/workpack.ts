import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { listDomainPackSuggestions, createDraftWorkpack } from "../services/workpackIntakeService";
import { compileWorkpackExecutionPlan } from "../services/workpackCompilerService";
import { getWorkpackDetail, listBenchmarksByTenant, listExceptionsByTenant, listWorkpackDetailsByTenant } from "../services/workpackPersistence";
import { simulateWorkpack } from "../services/workpackSimulationService";
import { replayWorkpackRun } from "../services/workpackReplayService";
import { getConnectorStudioView, validateConnectorMaps } from "../services/workpackConnectorService";
import { deriveWorkpackImprovementProposals } from "../services/workpackLearningService";
import { evaluateWorkpackPromotionEligibility, publishBenchmarkPack, rollbackWorkpackPromotion } from "../services/workpackPromotionService";
import { captureWorkpackMetricSnapshot } from "../services/workpackTelemetryService";
import { getWorkpackReadinessSummary, listWorkpackReadinessSummaries } from "../services/workpackReadinessService";
import { applyWorkpackIncidentAction } from "../services/workpackIncidentControlService";
import { listWorkpackExceptionInbox, resolveWorkpackException } from "../services/workpackExceptionService";

function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
  const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
  }
  return tenantId;
}

export const workpackRouter = router({
  listDomainPackSuggestions: protectedProcedure.query(() => listDomainPackSuggestions()),

  createDraft: protectedProcedure.input(z.object({
    title: z.string().min(1),
    goal: z.string().min(1),
    description: z.string().optional(),
    domainPack: z.enum(["finance_ops", "hr_ops", "support_ops", "sales_ops", "procurement_ops", "executive_support", "custom"]).optional(),
    sources: z.array(z.object({
      type: z.enum(["document", "chat_thread", "case_study", "sop", "workflow", "local_file", "url", "screenshot"]),
      title: z.string().min(1),
      sourceText: z.string().optional(),
      referenceId: z.string().nullable().optional(),
      originSurface: z.string().optional(),
    })).min(1),
  })).mutation(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    return createDraftWorkpack({
      ...input,
      tenantId,
    });
  }),

  list: protectedProcedure.query(({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return Promise.all(listWorkpackDetailsByTenant(tenantId).map(async (detail) => ({
      workpack: detail.workpack,
      version: detail.version,
      readiness: await getWorkpackReadinessSummary(detail.workpack.id),
      latestMetricSnapshot: detail.metricSnapshots[0] ?? captureWorkpackMetricSnapshot(detail.workpack.id),
    })));
  }),

  getDetail: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }

    return {
      ...detail,
      readiness: await getWorkpackReadinessSummary(detail.workpack.id),
      connectorStudio: getConnectorStudioView(detail.workpack.id),
      learningBundle: deriveWorkpackImprovementProposals(detail.workpack.id),
      promotionEligibility: evaluateWorkpackPromotionEligibility(detail.workpack.id),
      exceptionInbox: listWorkpackExceptionInbox(detail.workpack.id),
      latestMetricSnapshot: detail.metricSnapshots[0] ?? captureWorkpackMetricSnapshot(detail.workpack.id),
    };
  }),

  compile: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).mutation(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return compileWorkpackExecutionPlan({
      workpackId: input.workpackId,
      requestedBy: ctx.user?.id ?? null,
    });
  }),

  simulate: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).mutation(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return simulateWorkpack({
      workpackId: input.workpackId,
      requestedBy: ctx.user?.id ?? null,
    });
  }),

  replay: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    runId: z.string().optional(),
    simulationRunId: z.string().optional(),
  })).query(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return replayWorkpackRun({
      workpackId: input.workpackId,
      runId: input.runId ?? null,
      simulationRunId: input.simulationRunId ?? null,
    });
  }),

  connectors: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).query(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return getConnectorStudioView(input.workpackId);
  }),

  validateConnectors: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).mutation(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return validateConnectorMaps({ workpackId: input.workpackId });
  }),

  learning: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).query(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return deriveWorkpackImprovementProposals(input.workpackId);
  }),

  promote: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    publicationScope: z.enum(["tenant_local", "tenant_template", "cross_tenant"]).optional(),
  })).mutation(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return publishBenchmarkPack({
      workpackId: input.workpackId,
      publicationScope: input.publicationScope,
      publisherId: ctx.user?.id ?? null,
    });
  }),

  rollbackPromotion: protectedProcedure.input(z.object({
    promotionRecordId: z.string().min(1),
  })).mutation(({ input }) => rollbackWorkpackPromotion(input.promotionRecordId)),

  readiness: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).query(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return getWorkpackReadinessSummary(input.workpackId);
  }),

  readinessList: protectedProcedure.query(({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return listWorkpackReadinessSummaries(tenantId);
  }),

  exceptionInbox: protectedProcedure.input(z.object({
    workpackId: z.string().optional(),
  }).optional()).query(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    if (input?.workpackId) {
      const detail = getWorkpackDetail(input.workpackId);
      if (!detail || detail.workpack.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
      }
      return listWorkpackExceptionInbox(input.workpackId);
    }
    return listExceptionsByTenant(tenantId);
  }),

  resolveException: protectedProcedure.input(z.object({
    exceptionId: z.string().min(1),
  })).mutation(({ input }) => resolveWorkpackException(input.exceptionId)),

  roiDashboard: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    const workpackDetails = listWorkpackDetailsByTenant(tenantId);
    const readiness = await listWorkpackReadinessSummaries(tenantId);
    const snapshots = workpackDetails.map((detail) => detail.metricSnapshots[0] ?? captureWorkpackMetricSnapshot(detail.workpack.id));

    const totals = snapshots.reduce((acc, snapshot) => ({
      completionRate: acc.completionRate + snapshot.completionRate,
      interventionRate: acc.interventionRate + snapshot.interventionRate,
      exceptionRate: acc.exceptionRate + snapshot.exceptionRate,
      throughputPerDay: acc.throughputPerDay + snapshot.throughputPerDay,
      averageCostPerRun: acc.averageCostPerRun + snapshot.averageCostPerRun,
      estimatedTimeSavedMinutes: acc.estimatedTimeSavedMinutes + snapshot.estimatedTimeSavedMinutes,
      promotionVelocity: acc.promotionVelocity + snapshot.promotionVelocity,
    }), {
      completionRate: 0,
      interventionRate: 0,
      exceptionRate: 0,
      throughputPerDay: 0,
      averageCostPerRun: 0,
      estimatedTimeSavedMinutes: 0,
      promotionVelocity: 0,
    });
    const divisor = Math.max(snapshots.length, 1);

    return {
      totals: {
        completionRate: totals.completionRate / divisor,
        interventionRate: totals.interventionRate / divisor,
        exceptionRate: totals.exceptionRate / divisor,
        throughputPerDay: totals.throughputPerDay,
        averageCostPerRun: totals.averageCostPerRun / divisor,
        estimatedTimeSavedMinutes: totals.estimatedTimeSavedMinutes,
        promotionVelocity: totals.promotionVelocity,
      },
      readiness,
      snapshots,
    };
  }),

  discovery: protectedProcedure.query(({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return {
      starters: listWorkpackDetailsByTenant(tenantId).map((detail) => ({
        workpackId: detail.workpack.id,
        title: detail.workpack.title,
        domainPack: detail.workpack.domainPack,
        lifecycleState: detail.workpack.lifecycleState,
        benchmarkCount: detail.benchmarks.length,
      })),
      benchmarks: listBenchmarksByTenant(tenantId),
    };
  }),

  incidentAction: protectedProcedure.input(z.object({
    workpackId: z.string().optional(),
    versionId: z.string().optional(),
    action: z.enum(["pause", "quarantine", "cancel_queued", "freeze_promotion", "resume"]),
    reason: z.string().min(1),
  })).mutation(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    return applyWorkpackIncidentAction({
      tenantId,
      workpackId: input.workpackId ?? null,
      versionId: input.versionId ?? null,
      action: input.action,
      reason: input.reason,
    });
  }),
});
