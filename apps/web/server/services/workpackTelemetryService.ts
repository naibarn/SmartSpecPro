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

function nowIso(): string {
  return new Date().toISOString();
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function recordWorkpackTelemetryEvent(event: Omit<WorkpackTelemetryEvent, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
}): WorkpackTelemetryEvent {
  const parsed = workpackTelemetryEventSchema.parse({
    ...event,
    id: event.id ?? createWorkpackId("evt"),
    createdAt: event.createdAt ?? nowIso(),
  });
  saveTelemetryEvent(parsed);
  return parsed;
}

export function captureWorkpackMetricSnapshot(workpackId: string): MetricSnapshot {
  const detail = getWorkpackDetail(workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${workpackId}`);
  }

  const totalRuns = detail.runs.length;
  const successfulRuns = detail.runs.filter((run) => run.status === "succeeded");
  const interventionCount = detail.runs.filter((run) => run.approvalCheckpoints.length > 0 || run.status === "awaiting_approval").length;
  const generatedAt = nowIso();
  const snapshot = metricSnapshotSchema.parse({
    id: createWorkpackId("metric"),
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    generatedAt,
    completionRate: totalRuns === 0 ? 0 : successfulRuns.length / totalRuns,
    interventionRate: totalRuns === 0 ? 0 : interventionCount / totalRuns,
    exceptionRate: totalRuns === 0 ? detail.exceptions.length : detail.exceptions.length / Math.max(totalRuns, 1),
    throughputPerDay: totalRuns,
    averageCostPerRun: average(detail.runs.map((run) => run.actualSteps.length * 0.25)),
    estimatedTimeSavedMinutes: successfulRuns.reduce((total, run) => total + (run.actualSteps.length * 12), 0),
    promotionVelocity: detail.promotionRecords.length,
  });

  saveMetricSnapshot(snapshot);
  return snapshot;
}

export function getWorkpackTelemetrySummary(tenantId: string): {
  recentEvents: WorkpackTelemetryEvent[];
  latestSnapshots: MetricSnapshot[];
  totals: {
    workpackCount: number;
    eventCount: number;
    snapshotCount: number;
  };
} {
  const details = listWorkpackDetailsByTenant(tenantId);
  const latestSnapshots = details.map((detail) => detail.metricSnapshots[0] ?? captureWorkpackMetricSnapshot(detail.workpack.id));
  const recentEvents = listTelemetryEventsByTenant(tenantId).slice(0, 50);

  return {
    recentEvents,
    latestSnapshots,
    totals: {
      workpackCount: details.length,
      eventCount: recentEvents.length,
      snapshotCount: listMetricSnapshotsByTenant(tenantId).length,
    },
  };
}

export function getLatestMetricSnapshot(workpackId: string): MetricSnapshot | null {
  const detail = getWorkpackDetail(workpackId);
  return detail?.metricSnapshots[0] ?? null;
}
