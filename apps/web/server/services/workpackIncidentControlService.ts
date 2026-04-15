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
  withWorkpackPersistenceTransaction,
} from "./workpackPersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export async function applyWorkpackIncidentAction(input: {
  tenantId: string;
  workpackId?: string | null;
  versionId?: string | null;
  action: WorkpackIncidentRecord["action"];
  reason: string;
}): Promise<WorkpackIncidentRecord> {
  return withWorkpackPersistenceTransaction(async (session) => {
    const createdAt = nowIso();
    const workpackDetail = input.workpackId
      ? await getWorkpackDetail(input.workpackId, session)
      : null;

    if (input.workpackId && (!workpackDetail || workpackDetail.workpack.tenantId !== input.tenantId)) {
      throw new Error(`Unknown workpack for tenant: ${input.workpackId}`);
    }

    const affectedRuns = (await listRunsByTenant(input.tenantId, session))
      .filter((run) => (!input.workpackId || run.workpackId === input.workpackId))
      .filter((run) => run.status === "queued" || run.status === "running")
      .map((run) => run.id);

    for (const runId of affectedRuns) {
      const run = await getWorkpackRun(runId, session);
      if (!run) continue;
      if (input.action === "cancel_queued" && run.status === "queued") {
        await updateWorkpackRun(run.id, (current) => ({
          ...current,
          status: "cancelled",
          endedAt: createdAt,
          notes: `${current.notes}\nCancelled by incident control: ${input.reason}`.trim(),
        }), session);
      }
      if ((input.action === "pause" || input.action === "quarantine") && run.status === "running") {
        await updateWorkpackRun(run.id, (current) => ({
          ...current,
          status: "blocked",
          endedAt: createdAt,
          notes: `${current.notes}\nBlocked by incident control: ${input.reason}`.trim(),
        }), session);
      }
    }

    if (input.workpackId) {
      const detail = workpackDetail;
      if (detail) {
        const clarificationOpen = detail.playbook.clarificationQueue.some((question) => question.status === "pending");
        const connectorNeedsReview = detail.version.connectorMaps.some((map) => map.validationStatus !== "validated");
        const nextLifecycleState =
          input.action === "resume"
            ? clarificationOpen
              ? "clarification_needed"
              : "needs_review"
            : "paused";
        await updateWorkpack(detail.workpack.id, (workpack) => ({
          ...workpack,
          lifecycleState: nextLifecycleState,
          autonomyMode: input.action === "resume" ? "draft" : workpack.autonomyMode,
          promotionState: input.action === "freeze_promotion" ? "blocked" : workpack.promotionState,
          policyProfile: {
            ...workpack.policyProfile,
            safeResumeRequired: input.action === "resume" ? true : input.action === "pause" || input.action === "quarantine",
            safeResumeReason: input.action === "resume"
              ? connectorNeedsReview
                ? "connector_revalidation_required"
                : clarificationOpen
                  ? "clarification_queue_open"
                  : "replay_and_readiness_review_required"
              : input.reason,
          },
          updatedAt: createdAt,
        }), session);
        await saveTelemetryEvent({
          id: createWorkpackId("evt"),
          tenantId: detail.workpack.tenantId,
          workpackId: detail.workpack.id,
          versionId: detail.version.id,
          eventName: input.action === "resume" ? "incident_resumed" : input.action === "quarantine" ? "incident_quarantined" : "incident_paused",
          detail: input.reason,
          createdAt,
        }, session);
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
    await saveIncidentRecord(record, session);

    if (input.action === "resume") {
      const priorIncident = (await listIncidentsByTenant(input.tenantId, session))
        .find((incident) => incident.workpackId === input.workpackId && incident.status === "active");
      if (priorIncident) {
        await updateIncidentRecord(priorIncident.id, (current) => ({
          ...current,
          status: "resolved",
          resolvedAt: createdAt,
        }), session);
      }
    }

    return record;
  });
}
