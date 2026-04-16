import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { workpackDomainPackValues } from "../../shared/workpackDomainPacks";
import { protectedProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  answerClarificationQuestion,
  createDraftWorkpack,
  dismissClarificationQuestion,
  listDomainPackSuggestions,
} from "../services/workpackIntakeService";
import { compileWorkpackExecutionPlan } from "../services/workpackCompilerService";
import {
  getWorkpackDetail,
  listBenchmarksByTenant,
  listExceptionsByTenant,
  listSchedulesByTenant,
  listWorkpackDetailsByTenant,
} from "../services/workpackPersistence";
import { simulateWorkpack } from "../services/workpackSimulationService";
import { analyzeWorkpackReplay, replayWorkpackRun } from "../services/workpackReplayService";
import {
  buildEnterpriseReleaseGate,
  buildEnterpriseSdkContract,
  buildGovernedContextSnapshot,
  buildPackManifest,
  buildTraceEnvelope,
} from "../services/enterprisePlatformArtifacts";
import {
  discoverConnectorIntrospections,
  getConnectorStudioView,
  refreshConnectorIntrospections,
  updateConnectorMapFields,
  validateConnectorMaps,
} from "../services/workpackConnectorService";
import { deriveWorkpackImprovementProposals } from "../services/workpackLearningService";
import { evaluateWorkpackPromotionEligibility, publishBenchmarkPack, rollbackWorkpackPromotion } from "../services/workpackPromotionService";
import { captureWorkpackMetricSnapshot } from "../services/workpackTelemetryService";
import { getWorkpackReadinessSummary, listWorkpackReadinessSummaries } from "../services/workpackReadinessService";
import { applyWorkpackIncidentAction } from "../services/workpackIncidentControlService";
import { listWorkpackExceptionInbox, resolveWorkpackException } from "../services/workpackExceptionService";
import {
  createWorkpackSchedule,
  launchWorkpack,
  listWorkpackExecutorSnapshots,
  reconcileDispatchedWorkpackRuns,
  runDueWorkpackSchedules,
  triggerWorkpackSchedule,
} from "../services/workpackLaunchService";

function buildWorkpackEnterpriseEvidence(detail: NonNullable<Awaited<ReturnType<typeof getWorkpackDetail>>>, readiness: Awaited<ReturnType<typeof getWorkpackReadinessSummary>>, replay: Awaited<ReturnType<typeof replayWorkpackRun>>) {
  const latestBenchmark = detail.benchmarks[0] ?? null;
  const packManifest = latestBenchmark ? buildPackManifest({ benchmarkPack: latestBenchmark, detail }) : null;
  const traceEnvelope = buildTraceEnvelope({
    traceId: detail.runs[0]?.id ? `trace:${detail.runs[0].id}` : `trace:${detail.workpack.id}`,
    tenantId: detail.workpack.tenantId,
    source: "workpack",
    entityId: detail.workpack.id,
    eventType: "enterprise_evidence_snapshot",
    summary: `${detail.workpack.title} enterprise evidence snapshot`,
    evidenceRefs: [
      ...(detail.runs[0]?.artifactReferences.map((artifact) => artifact.artifactId) ?? []),
      ...(replay.diffs.map((diff) => `${diff.category}:${diff.stepId ?? "run"}`)),
    ],
  });
  const governedContext = buildGovernedContextSnapshot({
    tenantId: detail.workpack.tenantId,
    principalScope: "workpack",
    objective: detail.workpack.goal,
    items: [
      {
        id: `workpack:${detail.workpack.id}`,
        label: detail.workpack.title,
        sourceType: "workpack",
        scope: "workpack",
        trustTier: "trusted",
        freshnessTier: "fresh",
        reason: "Canonical workpack objective and title",
        score: 1,
        evidenceRefs: [`workpack:${detail.workpack.id}`],
      },
      {
        id: `readiness:${detail.workpack.id}`,
        label: `Readiness ${readiness.gateResult}`,
        sourceType: "readiness",
        scope: "workpack",
        trustTier: "derived",
        freshnessTier: "fresh",
        reason: readiness.nextAction,
        score: readiness.gateResult === "ready" ? 0.92 : readiness.gateResult === "review_required" ? 0.66 : 0.28,
        evidenceRefs: [`readiness:${detail.workpack.id}`],
      },
      {
        id: `replay:${detail.workpack.id}`,
        label: `Replay ${replay.gateStatus}`,
        sourceType: "replay",
        scope: "workpack",
        trustTier: "derived",
        freshnessTier: "warm",
        reason: replay.nextAction,
        score: replay.gateStatus === "clean" ? 0.9 : replay.gateStatus === "review_required" ? 0.62 : 0.24,
        evidenceRefs: [`replay:${detail.workpack.id}`],
      },
      ...detail.version.connectorMaps.map((map, index) => ({
        id: `connector:${map.connectorFamily}:${index}`,
        label: map.connectorFamily,
        sourceType: "connector",
        scope: "workpack" as const,
        trustTier: map.validationStatus === "validated" ? "trusted" : "derived",
        freshnessTier: map.validationStatus === "validated" ? "fresh" : "warm",
        reason: `Connector validation is ${map.validationStatus}`,
        score: map.validationStatus === "validated" ? 0.88 : map.validationStatus === "stale" ? 0.54 : 0.2,
        evidenceRefs: [`connector:${map.connectorFamily}`],
      })),
    ],
  });
  const readinessRecord = {
    version: 1 as const,
    kind: "workpack" as const,
    entityId: detail.workpack.id,
    generatedAt: readiness.updatedAt,
    score: readiness.gateResult === "ready" ? 0.9 : readiness.gateResult === "review_required" ? 0.62 : 0.24,
    status: readiness.gateResult === "ready" ? "ready" as const : readiness.gateResult === "review_required" ? "staged" as const : "blocked" as const,
    reason: readiness.nextAction,
    evidenceRefs: [
      `readiness:${detail.workpack.id}`,
      `replay:${detail.workpack.id}`,
    ],
  };
  const releaseGate = buildEnterpriseReleaseGate({
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    kind: latestBenchmark ? "promotion" : "readiness",
    traceEnvelope,
    governedContext,
    readinessRecord,
    packManifest,
    replayGateStatus: replay.gateStatus === "blocked" ? "blocked" : replay.gateStatus === "review_required" ? "review_required" : "ready",
    evidenceRefs: [
      ...traceEnvelope.evidenceRefs,
      ...governedContext.items.flatMap((item) => item.evidenceRefs),
      ...readinessRecord.evidenceRefs,
    ],
  });
  const sdkContract = buildEnterpriseSdkContract({
    tenantId: detail.workpack.tenantId,
    workpackId: detail.workpack.id,
    governedContext,
    traceEnvelope,
    readinessRecord,
    packManifest,
  });

  return {
    traceEnvelope,
    governedContext,
    packManifest,
    readinessRecord,
    releaseGate,
    sdkContract,
  };
}

type WorkpackRoadmapPhaseStatus = "ready" | "review_required" | "blocked";

type WorkpackRoadmapSummary = {
  workpackCount: number;
  phaseCounts: {
    ready: number;
    review_required: number;
    blocked: number;
  };
  blockerCounts: Array<{
    blocker: string;
    count: number;
  }>;
};

type WorkpackRoadmapTrendPoint = {
  workpackId: string;
  title: string;
  updatedAt: string;
  sequence: number;
  ready: number;
  review_required: number;
  blocked: number;
  totalPhases: number;
};

function buildWorkpackRoadmapProgress(detail: NonNullable<Awaited<ReturnType<typeof getWorkpackDetail>>>, enterprise: ReturnType<typeof buildWorkpackEnterpriseEvidence>) {
  const governedContext = enterprise.governedContext ?? {
    selectedCount: 0,
    items: [],
  };
  const releaseGate = enterprise.releaseGate ?? {
    gateResult: "review_required" as const,
    failedChecks: ["enterprise_release_gate_missing"],
    evidenceRefs: [],
    explanation: "Enterprise release gate data is unavailable.",
  };
  const readinessRecord = enterprise.readinessRecord ?? {
    status: "blocked" as const,
    reason: "Readiness record unavailable.",
    evidenceRefs: [],
  };
  const sdkContract = enterprise.sdkContract ?? {
    requiredSignals: [],
  };
  const packManifest = enterprise.packManifest ?? null;
  const phase1Blockers = [
    ...(governedContext.selectedCount > 0 ? [] : ["no_scoped_context"]),
    ...(governedContext.items.some((item) => item.included && item.trustTier === "untrusted") ? ["untrusted_context_selected"] : []),
  ];
  const phase1: {
    phase: number;
    title: string;
    status: WorkpackRoadmapPhaseStatus;
    owner: string;
    reviewer: string;
    blockers: string[];
    nextAction: string;
    evidenceRefs: string[];
  } = {
    phase: 1,
    title: "Governed Context Fabric",
    status: phase1Blockers.length === 0 ? "ready" : "review_required",
    owner: "platform owner",
    reviewer: "security owner",
    blockers: phase1Blockers,
    nextAction: phase1Blockers.length === 0
      ? "Context assembly is stable and can be reused as a durable input."
      : "Tighten context scope and remove untrusted items before expanding use.",
    evidenceRefs: governedContext.items.flatMap((item) => item.evidenceRefs),
  };

  const phase2Blockers = [
    ...(releaseGate.gateResult === "blocked" ? releaseGate.failedChecks : []),
  ];
  const phase2: typeof phase1 = {
    phase: 2,
    title: "Tracing, Replay, And Release Gates",
    status: releaseGate.gateResult === "ready"
      ? "ready"
      : releaseGate.gateResult === "review_required"
        ? "review_required"
        : "blocked",
    owner: "observability owner",
    reviewer: "security owner",
    blockers: phase2Blockers,
    nextAction: releaseGate.explanation,
    evidenceRefs: releaseGate.evidenceRefs,
  };

  const phase3Blockers = [
    ...(packManifest ? [] : ["pack_manifest_missing"]),
    ...(packManifest && !packManifest.reversible ? ["pack_not_reversible"] : []),
    ...(detail.benchmarks.length > 0 ? [] : ["benchmark_not_published"]),
  ];
  const phase3: typeof phase1 = {
    phase: 3,
    title: "Workforce Exchange Packs",
    status: phase3Blockers.length === 0 ? "ready" : packManifest ? "review_required" : "blocked",
    owner: "platform owner",
    reviewer: "observability owner",
    blockers: phase3Blockers,
    nextAction: phase3Blockers.length === 0
      ? "Pack manifest is available for exchange and promotion."
      : "Publish or harden the pack manifest before exchange.",
    evidenceRefs: packManifest ? [packManifest.packId] : [],
  };

  const phase4Blockers = [
    ...(readinessRecord.status === "blocked" ? ["readiness_blocked"] : []),
    ...(sdkContract.requiredSignals.some((signal) => signal.includes(":missing")) ? ["required_signal_missing"] : []),
  ];
  const phase4: typeof phase1 = {
    phase: 4,
    title: "Readiness, Economics, And SDK Standards",
    status: readinessRecord.status === "ready"
      ? "ready"
      : readinessRecord.status === "staged"
        ? "review_required"
        : "blocked",
    owner: "product owner",
    reviewer: "platform owner",
    blockers: phase4Blockers,
    nextAction: readinessRecord.reason,
    evidenceRefs: readinessRecord.evidenceRefs,
  };

  return [phase1, phase2, phase3, phase4];
}

function summarizeWorkpackRoadmapProgress(roadmapProgress: Array<{
  workpackId: string;
  title: string;
  phases: Array<{
    phase: number;
    title: string;
    status: WorkpackRoadmapPhaseStatus;
    owner: string;
    reviewer: string;
    blockers: string[];
    nextAction: string;
    evidenceRefs: string[];
  }>;
}>): WorkpackRoadmapSummary {
  const phaseCounts = {
    ready: 0,
    review_required: 0,
    blocked: 0,
  } as const;
  const blockerCounts = new Map<string, number>();

  for (const item of roadmapProgress) {
    for (const phase of item.phases ?? []) {
      phaseCounts[phase.status] += 1;
      for (const blocker of phase.blockers ?? []) {
        blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
      }
    }
  }

  return {
    workpackCount: roadmapProgress.length,
    phaseCounts,
    blockerCounts: Array.from(blockerCounts.entries())
      .map(([blocker, count]) => ({ blocker, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6),
  };
}

function buildWorkpackRoadmapTrend(roadmapProgress: Array<{
  workpackId: string;
  title: string;
  updatedAt: string;
  phases: Array<{
    phase: number;
    title: string;
    status: WorkpackRoadmapPhaseStatus;
    owner: string;
    reviewer: string;
    blockers: string[];
    nextAction: string;
    evidenceRefs: string[];
  }>;
}>): WorkpackRoadmapTrendPoint[] {
  const ordered = [...roadmapProgress].sort((left, right) => left.updatedAt.localeCompare(right.updatedAt));
  const accumulator = {
    ready: 0,
    review_required: 0,
    blocked: 0,
  };

  return ordered.map((item, index) => {
    for (const phase of item.phases ?? []) {
      accumulator[phase.status] += 1;
    }
    return {
      workpackId: item.workpackId,
      title: item.title,
      updatedAt: item.updatedAt,
      sequence: index + 1,
      ready: accumulator.ready,
      review_required: accumulator.review_required,
      blocked: accumulator.blocked,
      totalPhases: accumulator.ready + accumulator.review_required + accumulator.blocked,
    };
  });
}

const workpackSourceInputSchema = z.object({
  type: z.enum([
    "document",
    "chat_thread",
    "case_study",
    "sop",
    "workflow",
    "workflow_export",
    "local_file",
    "url",
    "screenshot",
    "spreadsheet",
    "browser_trace",
    "screen_recording",
  ]),
  title: z.string().min(1),
  sourceText: z.string().optional(),
  referenceId: z.string().nullable().optional(),
  originSurface: z.string().optional(),
  localFileRef: z.object({
    deviceId: z.string().nullable().optional(),
    rootLabel: z.string().nullable().optional(),
    rootPath: z.string().nullable().optional(),
    path: z.string().min(1),
    metadataSummary: z.string().optional(),
    previewAvailable: z.boolean().optional(),
    snippetAvailable: z.boolean().optional(),
  }).nullable().optional(),
});

const connectorIntrospectionMetadataSchema = z.object({
  connectorKey: z.string().optional(),
  availableFields: z.array(z.string()).optional(),
  fieldTypes: z.record(z.string()).optional(),
  grantedScopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  schemaVersion: z.string().nullable().optional(),
  supportsIdempotency: z.boolean().optional(),
  status: z.enum(["healthy", "stale", "unavailable"]).optional(),
  source: z.enum(["manual", "desktop_host", "managed_runtime"]).optional(),
  collectedAt: z.string().datetime().optional(),
  sourceDeviceId: z.string().nullable().optional(),
});

const metricSliceDimensionSchema = z.enum([
  "workpack",
  "team",
  "profession",
  "connector",
  "runtime",
  "risk_tier",
  "policy_profile",
]);

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
    domainPack: z.enum(workpackDomainPackValues).optional(),
    sources: z.array(workpackSourceInputSchema).min(1),
  })).mutation(({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    return createDraftWorkpack({
      ...input,
      tenantId,
    });
  }),

  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return Promise.all((await listWorkpackDetailsByTenant(tenantId)).map(async (detail) => ({
      workpack: detail.workpack,
      version: detail.version,
      readiness: await getWorkpackReadinessSummary(detail.workpack.id),
      latestMetricSnapshot: detail.metricSnapshots[0] ?? await captureWorkpackMetricSnapshot(detail.workpack.id),
    })));
  }),

  getDetail: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }

    const readiness = await getWorkpackReadinessSummary(detail.workpack.id);
    const replay = await analyzeWorkpackReplay({
      workpackId: detail.workpack.id,
      runId: detail.runs[0]?.id ?? null,
    });
    const enterprise = buildWorkpackEnterpriseEvidence(detail, readiness, replay);

    return {
      ...detail,
      readiness,
      connectorStudio: await getConnectorStudioView(detail.workpack.id),
      learningBundle: await deriveWorkpackImprovementProposals(detail.workpack.id),
      promotionEligibility: await evaluateWorkpackPromotionEligibility(detail.workpack.id),
      exceptionInbox: await listWorkpackExceptionInbox(detail.workpack.id),
      latestMetricSnapshot: detail.metricSnapshots[0] ?? await captureWorkpackMetricSnapshot(detail.workpack.id),
      executorSnapshots: await listWorkpackExecutorSnapshots({
        tenantId,
        workpackId: detail.workpack.id,
      }),
      enterprise,
    };
  }),

  compile: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return compileWorkpackExecutionPlan({
      workpackId: input.workpackId,
      requestedBy: ctx.user?.id ?? null,
    });
  }),

  answerClarification: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    questionId: z.string().min(1),
    answer: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return answerClarificationQuestion(input);
  }),

  dismissClarification: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    questionId: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return dismissClarificationQuestion(input);
  }),

  simulate: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    mode: z.enum(["fixture", "masked_history", "synthetic", "trace_replay"]).optional(),
    fixtureId: z.string().nullable().optional(),
    payload: z.record(z.unknown()).optional(),
    replayRunId: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return simulateWorkpack({
      workpackId: input.workpackId,
      requestedBy: ctx.user?.id ?? null,
      mode: input.mode,
      fixtureId: input.fixtureId ?? null,
      payload: input.payload,
      replayRunId: input.replayRunId ?? null,
    });
  }),

  replay: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    runId: z.string().optional(),
    simulationRunId: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
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
  })).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return getConnectorStudioView(input.workpackId);
  }),

  discoverConnectors: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return discoverConnectorIntrospections(input.workpackId);
  }),

  validateConnectors: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return validateConnectorMaps({ workpackId: input.workpackId });
  }),

  refreshConnectorIntrospections: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    metadataByFamily: z.record(connectorIntrospectionMetadataSchema),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    const metadataByFamily = Object.fromEntries(
      Object.entries(input.metadataByFamily).map(([connectorFamily, metadata]) => [
        connectorFamily,
        {
          ...metadata,
          schemaVersion: metadata.schemaVersion ?? undefined,
        },
      ]),
    );
    return refreshConnectorIntrospections({
      workpackId: input.workpackId,
      metadataByFamily,
    });
  }),

  updateConnectorMap: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    connectorMapId: z.string().min(1),
    fieldMappings: z.array(z.object({
      sourceField: z.string().min(1),
      targetField: z.string().min(1),
      required: z.boolean().optional(),
      sideEffectClass: z.enum(["read_only", "bounded_write", "external_write", "irreversible", "financial", "privileged"]).optional(),
    })).optional(),
    samplePayload: z.record(z.unknown()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return updateConnectorMapFields({
      workpackId: input.workpackId,
      connectorMapId: input.connectorMapId,
      fieldMappings: input.fieldMappings?.map((mapping) => ({
        sourceField: mapping.sourceField,
        targetField: mapping.targetField,
        required: mapping.required ?? true,
        sideEffectClass: mapping.sideEffectClass ?? "read_only",
      })),
      samplePayload: input.samplePayload,
    });
  }),

  startRun: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    autonomyMode: z.enum(["draft", "supervised", "autonomous"]).optional(),
    trigger: z.enum(["manual", "scheduled", "event", "role_agent"]).optional(),
    triggerSource: z.string().optional(),
    scheduleId: z.string().nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return launchWorkpack({
      workpackId: input.workpackId,
      requestedBy: ctx.user?.id ?? null,
      autonomyMode: input.autonomyMode === "draft" ? "supervised" : input.autonomyMode,
      trigger: input.trigger,
      triggerSource: input.triggerSource,
      scheduleId: input.scheduleId ?? null,
    });
  }),

  createSchedule: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    title: z.string().min(1),
    triggerType: z.enum(["cron", "interval", "event"]),
    cronExpression: z.string().nullable().optional(),
    intervalMinutes: z.number().int().positive().nullable().optional(),
    eventKey: z.string().nullable().optional(),
    targetAutonomyMode: z.enum(["draft", "supervised", "autonomous"]).optional(),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return createWorkpackSchedule({
      tenantId,
      workpackId: detail.workpack.id,
      versionId: detail.version.id,
      title: input.title,
      triggerType: input.triggerType,
      cronExpression: input.cronExpression ?? null,
      intervalMinutes: input.intervalMinutes ?? null,
      eventKey: input.eventKey ?? null,
      targetAutonomyMode: input.targetAutonomyMode === "draft" ? "supervised" : input.targetAutonomyMode,
      createdBy: ctx.user?.id ?? null,
    });
  }),

  triggerSchedule: protectedProcedure.input(z.object({
    scheduleId: z.string().min(1),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const schedule = (await listSchedulesByTenant(tenantId)).find((item) => item.id === input.scheduleId);
    if (!schedule) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
    }
    return triggerWorkpackSchedule(input.scheduleId);
  }),

  runDueSchedules: protectedProcedure
    .input(z.object({ at: z.string().datetime().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx);
      const launchedRunIds = await runDueWorkpackSchedules(input?.at ? new Date(input.at) : undefined, tenantId);
      return { launchedRunIds };
    }),

  reconcileRuns: protectedProcedure
    .input(z.object({
      workpackId: z.string().optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      const tenantId = requireTenantId(ctx);
      if (input?.workpackId) {
        const detail = await getWorkpackDetail(input.workpackId);
        if (!detail || detail.workpack.tenantId !== tenantId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
        }
      }
      const reconciledRunIds = await reconcileDispatchedWorkpackRuns({
        tenantId,
        workpackId: input?.workpackId,
      });
      return { reconciledRunIds };
    }),

  listSchedules: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    return listSchedulesByTenant(tenantId);
  }),

  learning: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
    if (!detail || detail.workpack.tenantId !== tenantId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
    }
    return deriveWorkpackImprovementProposals(input.workpackId);
  }),

  promote: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
    publicationScope: z.enum(["tenant_local", "tenant_template", "cross_tenant"]).optional(),
  })).mutation(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
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
  })).mutation(({ ctx, input }) => rollbackWorkpackPromotion({
    tenantId: requireTenantId(ctx),
    promotionRecordId: input.promotionRecordId,
  })),

  readiness: protectedProcedure.input(z.object({
    workpackId: z.string().min(1),
  })).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const detail = await getWorkpackDetail(input.workpackId);
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
  }).optional()).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    if (input?.workpackId) {
      const detail = await getWorkpackDetail(input.workpackId);
      if (!detail || detail.workpack.tenantId !== tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Workpack not found" });
      }
      return listWorkpackExceptionInbox(input.workpackId);
    }
    return (await listExceptionsByTenant(tenantId))
      .filter((record) => !record.resolvedAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }),

  resolveException: protectedProcedure.input(z.object({
    exceptionId: z.string().min(1),
    action: z.enum([
      "approve",
      "reject",
      "retry",
      "downgrade_autonomy",
      "remap_connector",
      "regenerate_workpack",
      "escalate_admin",
      "mark_false_positive",
    ]).optional(),
  })).mutation(({ ctx, input }) => resolveWorkpackException({
    tenantId: requireTenantId(ctx),
    exceptionId: input.exceptionId,
    action: input.action,
    requestedBy: ctx.user?.id ?? null,
  })),

  roiDashboard: protectedProcedure.input(z.object({
    sliceDimension: metricSliceDimensionSchema.optional(),
  }).optional()).query(async ({ ctx, input }) => {
    const tenantId = requireTenantId(ctx);
    const workpackDetails = await listWorkpackDetailsByTenant(tenantId);
    const readiness = await listWorkpackReadinessSummaries(tenantId);
    const readinessByWorkpackId = new Map(readiness.map((item) => [item.workpackId, item]));
    const snapshots = await Promise.all(workpackDetails.map(async (detail) => (
      detail.metricSnapshots[0] ?? await captureWorkpackMetricSnapshot(detail.workpack.id)
    )));
    const enterprise = await Promise.all(workpackDetails.map(async (detail) => {
      const readinessItem = readinessByWorkpackId.get(detail.workpack.id) ?? await getWorkpackReadinessSummary(detail.workpack.id);
      const replay = await analyzeWorkpackReplay({
        workpackId: detail.workpack.id,
        runId: detail.runs[0]?.id ?? null,
      });
      const evidence = buildWorkpackEnterpriseEvidence(detail, readinessItem, replay);
      return {
        workpackId: detail.workpack.id,
        title: detail.workpack.title,
        releaseGate: evidence.releaseGate,
        sdkContract: evidence.sdkContract,
        manifest: evidence.packManifest,
      };
    }));
    const roadmapProgress = workpackDetails.map((detail, index) => ({
      workpackId: detail.workpack.id,
      title: detail.workpack.title,
      updatedAt: detail.workpack.updatedAt,
      phases: buildWorkpackRoadmapProgress(detail, enterprise[index]!),
    }));
    const roadmapSummary = summarizeWorkpackRoadmapProgress(roadmapProgress);
    const roadmapTrend = buildWorkpackRoadmapTrend(roadmapProgress);

    const totals = snapshots.reduce((acc, snapshot) => ({
      completionRate: acc.completionRate + snapshot.completionRate,
      successRate: acc.successRate + snapshot.successRate,
      interventionRate: acc.interventionRate + snapshot.interventionRate,
      exceptionRate: acc.exceptionRate + snapshot.exceptionRate,
      rollbackRate: acc.rollbackRate + snapshot.rollbackRate,
      throughputPerDay: acc.throughputPerDay + snapshot.throughputPerDay,
      averageCostPerRun: acc.averageCostPerRun + snapshot.averageCostPerRun,
      estimatedTimeSavedMinutes: acc.estimatedTimeSavedMinutes + snapshot.estimatedTimeSavedMinutes,
      policyBlockFrequency: acc.policyBlockFrequency + snapshot.policyBlockFrequency,
      promotionVelocity: acc.promotionVelocity + snapshot.promotionVelocity,
    }), {
      completionRate: 0,
      successRate: 0,
      interventionRate: 0,
      exceptionRate: 0,
      rollbackRate: 0,
      throughputPerDay: 0,
      averageCostPerRun: 0,
      estimatedTimeSavedMinutes: 0,
      policyBlockFrequency: 0,
      promotionVelocity: 0,
    });
    const divisor = Math.max(snapshots.length, 1);
    const sliceDimension = input?.sliceDimension;
    const slices = snapshots
      .flatMap((snapshot) => snapshot.slices)
      .filter((slice) => !sliceDimension || slice.dimension === sliceDimension)
      .reduce<Record<string, {
        dimension: string;
        value: string;
        completionRate: number;
        interventionRate: number;
        exceptionRate: number;
        throughputPerDay: number;
        averageCostPerRun: number;
        count: number;
      }>>((acc, slice) => {
        const key = `${slice.dimension}:${slice.value}`;
        const current = acc[key] ?? {
          dimension: slice.dimension,
          value: slice.value,
          completionRate: 0,
          interventionRate: 0,
          exceptionRate: 0,
          throughputPerDay: 0,
          averageCostPerRun: 0,
          count: 0,
        };
        current.completionRate += slice.completionRate;
        current.interventionRate += slice.interventionRate;
        current.exceptionRate += slice.exceptionRate;
        current.throughputPerDay += slice.throughputPerDay;
        current.averageCostPerRun += slice.averageCostPerRun;
        current.count += 1;
        acc[key] = current;
        return acc;
      }, {});
    const normalizedSlices = Object.values(slices)
      .map((slice) => ({
        dimension: slice.dimension,
        value: slice.value,
        completionRate: slice.completionRate / slice.count,
        interventionRate: slice.interventionRate / slice.count,
        exceptionRate: slice.exceptionRate / slice.count,
        throughputPerDay: slice.throughputPerDay,
        averageCostPerRun: slice.averageCostPerRun / slice.count,
      }))
      .sort((left, right) => right.interventionRate - left.interventionRate)
      .slice(0, 12);
    const recommendations = snapshots
      .flatMap((snapshot) => snapshot.recommendations)
      .reduce<Record<string, { kind: string; summary: string; workpackId?: string | null; count: number }>>((acc, recommendation) => {
        const key = `${recommendation.kind}:${recommendation.workpackId ?? "none"}:${recommendation.summary}`;
        const current = acc[key] ?? { ...recommendation, count: 0 };
        current.count += 1;
        acc[key] = current;
        return acc;
      }, {});

    return {
      totals: {
        completionRate: totals.completionRate / divisor,
        successRate: totals.successRate / divisor,
        interventionRate: totals.interventionRate / divisor,
        exceptionRate: totals.exceptionRate / divisor,
        rollbackRate: totals.rollbackRate / divisor,
        throughputPerDay: totals.throughputPerDay,
        averageCostPerRun: totals.averageCostPerRun / divisor,
        estimatedTimeSavedMinutes: totals.estimatedTimeSavedMinutes,
        policyBlockFrequency: totals.policyBlockFrequency / divisor,
        promotionVelocity: totals.promotionVelocity,
      },
      readiness,
      enterprise,
      roadmapProgress,
      roadmapSummary,
      roadmapTrend,
      snapshots,
      slices: normalizedSlices,
      recommendations: Object.values(recommendations)
        .sort((left, right) => right.count - left.count)
        .slice(0, 8),
    };
  }),

  discovery: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = requireTenantId(ctx);
    const details = await listWorkpackDetailsByTenant(tenantId);
    const detailsByWorkpackId = new Map(details.map((detail) => [detail.workpack.id, detail]));
    return {
      starters: details.map((detail) => ({
        workpackId: detail.workpack.id,
        title: detail.workpack.title,
        domainPack: detail.workpack.domainPack,
        lifecycleState: detail.workpack.lifecycleState,
        benchmarkCount: detail.benchmarks.length,
      })),
      benchmarks: (await listBenchmarksByTenant(tenantId)).map((benchmark) => {
        const sourceDetail = detailsByWorkpackId.get(benchmark.sourceWorkpackId) ?? null;
        return {
          ...benchmark,
          manifest: sourceDetail ? buildPackManifest({ benchmarkPack: benchmark, detail: sourceDetail }) : null,
        };
      }),
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
