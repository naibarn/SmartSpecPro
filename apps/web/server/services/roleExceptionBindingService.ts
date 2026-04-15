import { createRoleId, getRoleAgentDetail, saveRoleExceptionBinding, updateRoleExceptionBinding } from "./rolePersistence";
import { getWorkpackDetail } from "./workpackPersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export async function syncRoleExceptionBindings(roleId: string) {
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) {
    throw new Error(`Unknown role: ${roleId}`);
  }

  const created = [];
  for (const run of detail.routineRuns) {
    if (!run.selectedWorkpackFamily) continue;
    const workpackDetail = await getWorkpackDetail(run.selectedWorkpackFamily);
    if (!workpackDetail) continue;
    for (const exception of workpackDetail.exceptions.filter((record) => !record.resolvedAt)) {
      const existing = detail.exceptionBindings.find((binding) => binding.workpackExceptionId === exception.id);
      if (existing) continue;
      created.push(await saveRoleExceptionBinding({
        id: createRoleId("reb"),
        tenantId: detail.role.tenantId,
        roleId: detail.role.id,
        routineId: run.routineId,
        routineRunId: run.id,
        messageId: null,
        handoffId: null,
        workpackExceptionId: exception.id,
        triageOwnerRoleId: detail.role.id,
        escalationTargetRoleId: null,
        nextAction: exception.riskClass === "critical" ? "escalate" : "review",
        operatorActionState: "pending",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }));
    }
  }
  return created;
}

export async function setRoleExceptionOperatorState(input: {
  bindingId: string;
  operatorActionState: "pending" | "in_progress" | "completed" | "review_required";
  nextAction?: "retry" | "remap" | "review" | "escalate" | "downgrade" | "approve";
}) {
  return updateRoleExceptionBinding(input.bindingId, (current) => ({
    ...current,
    operatorActionState: input.operatorActionState,
    nextAction: input.nextAction ?? current.nextAction,
    updatedAt: nowIso(),
  }));
}

export async function listRoleAwareExceptionView(roleId: string) {
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) {
    throw new Error(`Unknown role: ${roleId}`);
  }
  return detail.exceptionBindings.map((binding) => ({
    ...binding,
    source: binding.messageId ? "delegation" : "routine_execution",
    hasEscalationTarget: Boolean(binding.escalationTargetRoleId),
  }));
}

