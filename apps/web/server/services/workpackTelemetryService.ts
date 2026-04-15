import {
  metricSnapshotSchema,
  type MetricSnapshot,
} from "../../shared/workpackContracts";
import {
  workpackTelemetryEventSchema,
  type WorkpackTelemetryEvent,
} from "../../shared/workpackTelemetry";
import {
  createWorkpackId,
  getWorkpackDetail,
  listMetricSnapshotsByTenant,
  listTelemetryEventsByTenant,
  listWorkpackDetailsByTenant,
  saveMetricSnapshot,
  saveTelemetryEvent,
} from "./workpackPersistence";

type WorkpackDetail = NonNullable<Awaited<ReturnType<typeof getWorkpackDetail>>>;

function nowIso(): string {
  return new Date().toISOString();
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function buildSlices(
  detail: WorkpackDetail,
  rates: {
    completionRate: number;
    interventionRate: number;
    exceptionRate: number;
    throughputPerDay: number;
    averageCostPerRun: number;
  },
): MetricSnapshot["slices"] {
  const runtimes = unique(detail.version.executionPlan?.steps.map((step) => step.preferredRuntimePath) ?? []);
  const connectors = unique(detail.version.connectorMaps.map((map) => map.connectorFamily));
  const teamValue = typeof detail.workpack.policyProfile.teamId === "string"
    ? detail.workpack.policyProfile.teamId
    : "unassigned";
  const policyProfile = typeof detail.workpack.policyProfile.humanInLoopPreference === "string"
    ? detail.workpack.policyProfile.humanInLoopPreference
    : "default";
  const unresolvedRisk = detail.exceptions.find((record) => !record.resolvedAt)?.riskClass ?? "none";

  return [
    { dimension: "workpack", value: detail.workpack.title, ...rates },
    { dimension: "team", value: teamValue, ...rates },
    { dimension: "profession", value: detail.workpack.domainPack, ...rates },
    { dimension: "risk_tier", value: unresolvedRisk, ...rates },
    { dimension: "policy_profile", value: policyProfile, ...rates },
    ...connectors.map((connectorFamily) => ({
      dimension: "connector" as const,
      value: connectorFamily,
      ...rates,
    })),
    ...runtimes.map((runtime) => ({
      dimension: "runtime" as const,
      value: runtime,
      ...rates,
    })),
  ];
}

function buildRecommendations(
  detail: WorkpackDetail,
  metrics: {
    completionRate: number;
    interventionRate: number;
    exceptionRate: number;
    rollbackRate: number;
    policyBlockFrequency: number;
  },
): MetricSnapshot["recommendations"] {
  const recommendations: MetricSnapshot["recommendations"] = [];

  if (
    metrics.completionRate >= 0.8
    && metrics.interventionRate <= 0.2
    && metrics.exceptionRate <= 0.15
  ) {
    recommendations.push({
      kind: "promotion_ready",
      summary: `${detail.workpack.title} is meeting promotion thresholds with low human intervention.`,
      workpackId: detail.workpack.id,
    });
  }

  if (metrics.interventionRate >= 0.35 || metrics.policyBlockFrequency >= 0.3) {
    recommendations.push({
      kind: "reduce_manual_handoff",
      summary: `${detail.workpack.title} still hits too many manual checkpoints. Narrow approval boundaries or clarify intake fields.`,
      workpackId: detail.workpack.id,
    });
  }

  if (detail.version.connectorMaps.some((map) => map.validationStatus !== "validated")) {
    recommendations.push({
      kind: "connector_hotspot",
      summary: `${detail.workpack.title} has connector drift or missing scopes that should be fixed before broader rollout.`,
      workpackId: detail.workpack.id,
    });
  }

  if (
    detail.workpack.lifecycleState === "needs_review"
    || metrics.exceptionRate >= 0.5
    || detail.exceptions.filter((record) => !record.resolvedAt).length >= 3
  ) {
    recommendations.push({
      kind: "new_workpack_candidate",
      summary: `Repeated exception patterns suggest there is still manual work that should be broken into a new reusable workpack.`,
      workpackId: detail.workpack.id,
    });
  }

  return recommendations;
}

export async function recordWorkpackTelemetryEvent(event: Omit<WorkpackTelemetryEvent, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
}): Promise<WorkpackTelemetryEvent> {
  const parsed = workpackTelemetryEventSchema.parse({
    ...event,
    id: event.id ?? createWorkpackId("evt"),
    createdAt: event.createdAt ?? nowIso(),
  });
  await saveTelemetryEvent(parsed);
  return parsed;
}

export async function captureWorkpackMetricSnapshot(workpackId: string): Promise<MetricSnapshot> {
  const detail = await getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }

  const totalRuns = detail.runs.length;
  const successfulRuns = detail.runs.filter((run) => run.status === "succeeded");
  const interventionCount = detail.runs.filter((run) => run.approvalCheckpoints.length > 0 || run.status === "awaiting_approval").length;
  const blockedOrPolicyPaused = detail.runs.filter((run) => (
    run.status === "blocked"
    || run.status === "awaiting_approval"
    || run.notes.toLowerCase().includes("approval")
    || run.notes.toLowerCase().includes("policy")
  )).length;
  const rollbackCount = detail.promotionRecords.filter((record) => record.state === "rolled_back").length;
  const generatedAt = nowIso();
  const completionRate = totalRuns === 0 ? 0 : successfulRuns.length / totalRuns;
  const interventionRate = totalRuns === 0 ? 0 : interventionCount / totalRuns;
  const exceptionRate = totalRuns === 0 ? detail.exceptions.length : detail.exceptions.length / Math.max(totalRuns, 1);
  const throughputPerDay = totalRuns;
  const averageCostPerRun = average(detail.runs.map((run) => run.actualSteps.length * 0.25));
  const estimatedTimeSavedMinutes = successfulRuns.reduce((total, run) => total + (run.actualSteps.length * 12), 0);
  const successRate = completionRate;
  const rollbackRate = Math.max(totalRuns, detail.promotionRecords.length, 1) === 0
    ? 0
    : rollbackCount / Math.max(detail.promotionRecords.length, 1);
  const policyBlockFrequency = totalRuns === 0 ? 0 : blockedOrPolicyPaused / totalRuns;
  const rates = {
    completionRate,
    interventionRate,
    exceptionRate,
    throughputPerDay,
    averageCostPerRun,
  };
  const snapshot = metricSnapshotSchema.parse({
    id: createWorkpackId("metric"),
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    generatedAt,
    completionRate,
    successRate,
    interventionRate,
    exceptionRate,
    rollbackRate,
    throughputPerDay,
    averageCostPerRun,
    estimatedTimeSavedMinutes,
    policyBlockFrequency,
    promotionVelocity: detail.promotionRecords.length,
    slices: buildSlices(detail, rates),
    recommendations: buildRecommendations(detail, {
      completionRate,
      interventionRate,
      exceptionRate,
      rollbackRate,
      policyBlockFrequency,
    }),
  });

  await saveMetricSnapshot(snapshot);
  return snapshot;
}

export async function getWorkpackTelemetrySummary(tenantId: string): Promise<{
  recentEvents: WorkpackTelemetryEvent[];
  latestSnapshots: MetricSnapshot[];
  totals: {
    workpackCount: number;
    eventCount: number;
    snapshotCount: number;
  };
}> {
  const details = await listWorkpackDetailsByTenant(tenantId);
  const latestSnapshots = await Promise.all(details.map(async (detail) => (
    detail.metricSnapshots[0] ?? captureWorkpackMetricSnapshot(detail.workpack.id)
  )));
  const recentEvents = (await listTelemetryEventsByTenant(tenantId)).slice(0, 50);
  const snapshotCount = (await listMetricSnapshotsByTenant(tenantId)).length;

  return {
    recentEvents,
    latestSnapshots,
    totals: {
      workpackCount: details.length,
      eventCount: recentEvents.length,
      snapshotCount,
    },
  };
}

export async function getLatestMetricSnapshot(workpackId: string): Promise<MetricSnapshot | null> {
  const detail = await getWorkpackDetail(workpackId);
  return detail?.metricSnapshots[0] ?? null;
}
