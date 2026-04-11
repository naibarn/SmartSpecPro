import {
  createRoleId,
  getRoleAgentDetail,
  getRoleAgentDetailForTenant,
  getRoleRoutineForTenant,
  saveRoleApprovalRequest,
  updateRoleAgent,
  updateRoleRoutine,
} from "./rolePersistence";
import { applyRoleIncidentAction } from "./roleIncidentControlService";

function nowIso(): string {
  return new Date().toISOString();
}

export async function pauseRole(input: {
  tenantId: string;
  roleId: string;
  reason: string;
  operatorUserId: number;
}) {
  const detail = await getRoleAgentDetailForTenant(input.tenantId, input.roleId);
  if (!detail) {
    throw new Error(`Unknown role for tenant: ${input.roleId}`);
  }
  await updateRoleAgent(input.roleId, (role) => ({
    ...role,
    lifecycleState: "paused",
    healthState: "degraded",
    updatedAt: nowIso(),
  }));
  return applyRoleIncidentAction({
    tenantId: input.tenantId,
    roleId: input.roleId,
    action: "pause_role",
    reason: input.reason,
    operatorUserId: input.operatorUserId,
  });
}

export async function resumeRole(input: {
  tenantId: string;
  roleId: string;
  reason: string;
  operatorUserId: number;
}) {
  return applyRoleIncidentAction({
    tenantId: input.tenantId,
    roleId: input.roleId,
    action: "resume",
    reason: input.reason,
    operatorUserId: input.operatorUserId,
  });
}

export async function quarantineRole(input: {
  tenantId: string;
  roleId: string;
  reason: string;
  operatorUserId: number;
}) {
  return applyRoleIncidentAction({
    tenantId: input.tenantId,
    roleId: input.roleId,
    action: "quarantine_role",
    reason: input.reason,
    operatorUserId: input.operatorUserId,
  });
}

export async function pauseRoutine(input: {
  tenantId: string;
  roleId: string;
  routineId: string;
  reason: string;
  operatorUserId: number;
}) {
  const detail = await getRoleAgentDetailForTenant(input.tenantId, input.roleId);
  const routine = await getRoleRoutineForTenant(input.tenantId, input.routineId);
  if (!detail || !routine || routine.roleId !== detail.role.id) {
    throw new Error(`Unknown routine for tenant: ${input.routineId}`);
  }
  await updateRoleRoutine(input.routineId, (routine) => ({
    ...routine,
    status: "paused",
    updatedAt: nowIso(),
  }));
  return applyRoleIncidentAction({
    tenantId: input.tenantId,
    roleId: input.roleId,
    routineId: input.routineId,
    action: "pause_routine",
    reason: input.reason,
    operatorUserId: input.operatorUserId,
  });
}

export async function resumeRoutine(input: {
  tenantId: string;
  roleId: string;
  routineId: string;
  reason: string;
  operatorUserId: number;
}) {
  const detail = await getRoleAgentDetailForTenant(input.tenantId, input.roleId);
  const routine = await getRoleRoutineForTenant(input.tenantId, input.routineId);
  if (!detail || !routine || routine.roleId !== detail.role.id) {
    throw new Error(`Unknown routine for tenant: ${input.routineId}`);
  }
  await updateRoleRoutine(input.routineId, (current) => ({
    ...current,
    status: "active",
    updatedAt: nowIso(),
  }));
  return applyRoleIncidentAction({
    tenantId: input.tenantId,
    roleId: input.roleId,
    routineId: input.routineId,
    action: "resume",
    reason: input.reason,
    operatorUserId: input.operatorUserId,
  });
}

export async function requestSafeResumeReview(input: {
  tenantId: string;
  roleId: string;
  requestedByUserId: number;
  routineId?: string | null;
  routineRunId?: string | null;
  note?: string;
}) {
  const detail = await getRoleAgentDetail(input.roleId);
  if (!detail || detail.role.tenantId !== input.tenantId) {
    throw new Error(`Unknown role for tenant: ${input.roleId}`);
  }
  return saveRoleApprovalRequest({
    id: createRoleId("rappr"),
    tenantId: input.tenantId,
    roleId: detail.role.id,
    routineId: input.routineId ?? null,
    routineRunId: input.routineRunId ?? detail.routineRuns[0]?.id ?? null,
    subjectId: input.routineRunId ?? input.roleId,
    approvalType: "safe_resume_review",
    requesterRoleId: detail.role.id,
    requesterUserId: input.requestedByUserId,
    approverScope: "tenant_admin",
    quorum: 1,
    status: "pending",
    allowedDecisions: ["approve", "reject", "freeze"],
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: nowIso(),
    resolvedAt: null,
  });
}

export async function stopDepartmentSlice(input: {
  tenantId: string;
  departmentLabel: string;
  reason: string;
  operatorUserId: number;
}) {
  const detail = await import("./rolePersistence").then((module) => module.listRoleDetailsByTenant(input.tenantId));
  const targets = detail.filter((entry) => entry.role.departmentLabel === input.departmentLabel);
  await Promise.all(targets.map((entry) => applyRoleIncidentAction({
    tenantId: input.tenantId,
    roleId: entry.role.id,
    action: "stop_org_slice",
    reason: input.reason,
    operatorUserId: input.operatorUserId,
  })));
  return {
    stoppedRoleIds: targets.map((entry) => entry.role.id),
  };
}
