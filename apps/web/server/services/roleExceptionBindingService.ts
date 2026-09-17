import { getRoleAgentDetail, updateRoleExceptionBinding } from "./rolePersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export async function syncRoleExceptionBindings(roleId: string) {
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) throw new Error(`Unknown role: ${roleId}`);
  return [];
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
