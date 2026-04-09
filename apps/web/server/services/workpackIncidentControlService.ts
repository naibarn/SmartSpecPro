import { workpackIncidentRecordSchema, type WorkpackIncidentRecord } from "../../shared/workpackTelemetry";
import {
  createWorkpackId,
  getWorkpackDetail,
  getWorkpackRun,
  listIncidentsByTenant,
  listRunsByTenant,
  saveIncidentRecord,
  saveTelemetryEvent,
  updateIncidentRecord,
  updateWorkpack,
  updateWorkpackRun,
} from "./workpackPersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export function applyWorkpackIncidentAction(input: {
  tenantId: string;
  workpackId?: string | null;
  versionId?: string | null;
  action: WorkpackIncidentRecord["action"];
  reason: string;
}): WorkpackIncidentRecord {
  const createdAt = nowIso();
  const affectedRuns = listRunsByTenant(input.tenantId)
    .filter((run) => (!input.workpackId || run.workpackId === input.workpackId))
    .filter((run) => run.status === "queued" || run.status === "running")
    .map((run) => run.id);

  for (const runId of affectedRuns) {
    const run = getWorkpackRun(runId);
    if (!run) continue;
    if (input.action === "cancel_queued" && run.status === "queued") {
      updateWorkpackRun(run.id, (current) => ({
        ...current,
        status: "cancelled",
        endedAt: createdAt,
        notes: `${current.notes}\nCancelled by incident control: ${input.reason}`.trim(),
      }));
    }
    if ((input.action === "pause" || input.action === "quarantine") && run.status === "running") {
      updateWorkpackRun(run.id, (current) => ({
        ...current,
        status: "blocked",
        endedAt: createdAt,
        notes: `${current.notes}\nBlocked by incident control: ${input.reason}`.trim(),
      }));
    }
  }

  if (input.workpackId) {
    const detail = getWorkpackDetail(input.workpackId);
    if (detail) {
      updateWorkpack(detail.workpack.id, (workpack) => ({
        ...workpack,
        lifecycleState: input.action === "resume" ? "ready" : "paused",
        promotionState: input.action === "freeze_promotion" ? "blocked" : workpack.promotionState,
        updatedAt: createdAt,
      }));
      saveTelemetryEvent({
        id: createWorkpackId("evt"),
        tenantId: detail.workpack.tenantId,
        workpackId: detail.workpack.id,
        versionId: detail.version.id,
        eventName: input.action === "resume" ? "incident_resumed" : input.action === "quarantine" ? "incident_quarantined" : "incident_paused",
        detail: input.reason,
        createdAt,
      });
    }
  }

  const record = workpackIncidentRecordSchema.parse({
    id: createWorkpackId("inc"),
    tenantId: input.tenantId,
    workpackId: input.workpackId ?? null,
    versionId: input.versionId ?? null,
    action: input.action,
    status: input.action === "resume" ? "resolved" : "active",
    reason: input.reason,
    affectedRunIds: affectedRuns,
    safeResumeRequired: input.action === "quarantine" || input.action === "pause",
    createdAt,
    resolvedAt: input.action === "resume" ? createdAt : null,
  });
  saveIncidentRecord(record);

  if (input.action === "resume") {
    const priorIncident = listIncidentsByTenant(input.tenantId)
      .find((incident) => incident.workpackId === input.workpackId && incident.status === "active");
    if (priorIncident) {
      updateIncidentRecord(priorIncident.id, (current) => ({
        ...current,
        status: "resolved",
        resolvedAt: createdAt,
      }));
    }
  }

  return record;
}
