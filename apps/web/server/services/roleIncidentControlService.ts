import { roleIncidentRecordSchema, type RoleIncidentRecord } from "../../shared/roleTelemetry";
import { applyWorkpackIncidentAction } from "./workpackIncidentControlService";
import {
  createRoleId,
  getRoleAgentDetail,
  saveRoleIncidentRecord,
  updateRoleAgent,
  updateRoleRoutine,
  updateRoleRoutineRun,
} from "./rolePersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export async function applyRoleIncidentAction(input: {
  tenantId: string;
  roleId?: string | null;
  routineId?: string | null;
  action: RoleIncidentRecord["action"];
  reason: string;
  operatorUserId?: number | null;
  note?: string | null;
}): Promise<RoleIncidentRecord> {
  const timestamp = nowIso();
  const detail = input.roleId ? await getRoleAgentDetail(input.roleId) : null;
  if (input.roleId && (!detail || detail.role.tenantId !== input.tenantId)) {
    throw new Error(`Unknown role for tenant: ${input.roleId}`);
  }

  const affectedRuns = (detail?.routineRuns ?? [])
    .filter((run) => !input.routineId || run.routineId === input.routineId)
    .filter((run) => run.status === "queued" || run.status === "running" || run.status === "awaiting_approval");

  const linkedWorkpackIds = Array.from(new Set(affectedRuns.map((run) => run.selectedWorkpackFamily).filter(Boolean) as string[]));

  if (detail?.role.id) {
    await updateRoleAgent(detail.role.id, (role) => ({
      ...role,
      lifecycleState: input.action === "resume" ? "active" : input.action.includes("quarantine") ? "quarantined" : "paused",
      healthState: input.action === "resume" ? "healthy" : input.action.includes("quarantine") ? "quarantined" : "degraded",
      updatedAt: timestamp,
    }));
  }

  for (const run of affectedRuns) {
    await updateRoleRoutineRun(run.id, (current) => ({
      ...current,
      status: input.action === "resume"
        ? "queued"
        : input.action.includes("quarantine")
          ? "quarantined"
          : "blocked",
      recoveryState: input.action === "resume" ? "needs_resume_review" : input.action.includes("quarantine") ? "quarantined" : "needs_resume_review",
      blockerCodes: input.action === "resume"
        ? current.blockerCodes
        : Array.from(new Set([...current.blockerCodes, "role_incident_active"])),
      endedAt: input.action === "resume" ? null : timestamp,
      updatedAt: timestamp,
    }));
  }

  if (input.routineId) {
    await updateRoleRoutine(input.routineId, (routine) => ({
      ...routine,
      status: input.action === "resume" ? "active" : input.action.includes("quarantine") ? "blocked" : "paused",
      updatedAt: timestamp,
    }));
  } else if (detail) {
    await Promise.all(detail.routines.map((routine) => updateRoleRoutine(routine.id, (current) => ({
      ...current,
      status: input.action === "resume" ? "active" : input.action.includes("quarantine") ? "blocked" : "paused",
      updatedAt: timestamp,
    }))));
  }

  for (const workpackId of linkedWorkpackIds) {
    await applyWorkpackIncidentAction({
      tenantId: input.tenantId,
      workpackId,
      action: input.action === "resume"
        ? "resume"
        : input.action.includes("quarantine")
          ? "quarantine"
          : "pause",
      reason: input.reason,
    });
  }

  return saveRoleIncidentRecord(roleIncidentRecordSchema.parse({
    id: createRoleId("rinc"),
    tenantId: input.tenantId,
    roleId: input.roleId ?? null,
    routineId: input.routineId ?? null,
    action: input.action,
    status: input.action === "resume" ? "resolved" : "active",
    reason: input.reason,
    affectedRoutineRunIds: affectedRuns.map((run) => run.id),
    linkedWorkpackIds,
    safeResumeRequired: input.action !== "resume",
    operatorUserId: input.operatorUserId ?? null,
    note: input.note ?? null,
    createdAt: timestamp,
    resolvedAt: input.action === "resume" ? timestamp : null,
  }));
}
