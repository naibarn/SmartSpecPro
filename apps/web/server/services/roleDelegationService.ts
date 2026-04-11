import {
  type RoleMessage,
  type RoleVisibilityClass,
  sanitizeRoleSensitivePayload,
} from "../../shared/roleAgentContracts";
import type { SideEffectClass } from "../../shared/workpackContracts";
import { createRoleId, getRoleAgentDetail, saveRoleApprovalRequest, saveRoleHandoff, saveRoleMessage } from "./rolePersistence";
import * as roomService from "./roomService";
import { getWorkpackDetail } from "./workpackPersistence";

const SIDE_EFFECT_RANK: Record<SideEffectClass, number> = {
  read_only: 0,
  bounded_write: 1,
  external_write: 2,
  irreversible: 3,
  financial: 4,
  privileged: 5,
};

const DEFAULT_MESSAGE_VISIBILITY: RoleVisibilityClass[] = [
  "owner_full",
  "delegated_minimum",
  "shared_reference",
  "operator_review",
  "redacted_summary",
];

function nowIso(): string {
  return new Date().toISOString();
}

function visibilityForIntent(intent: RoleMessage["intentType"]): RoleVisibilityClass {
  if (intent === "handoff" || intent === "approval_request") return "delegated_minimum";
  if (intent === "shared_finding" || intent === "status_summary") return "redacted_summary";
  return "owner_full";
}

function allowedVisibilityForScopes(
  detail: NonNullable<Awaited<ReturnType<typeof getRoleAgentDetail>>>,
  scopes: string[],
): Set<RoleVisibilityClass> {
  const fallback = new Set<RoleVisibilityClass>(DEFAULT_MESSAGE_VISIBILITY);
  const contract = detail.activeContract;
  if (!contract) {
    return fallback;
  }

  const explicitlyConfiguredScopes = scopes.filter((scope) => Object.prototype.hasOwnProperty.call(contract.visibilityMatrix, scope));
  if (explicitlyConfiguredScopes.length > 0) {
    const scopedAllowed = new Set<RoleVisibilityClass>();
    for (const scope of explicitlyConfiguredScopes) {
      for (const value of contract.visibilityMatrix[scope] ?? []) {
        scopedAllowed.add(value as RoleVisibilityClass);
      }
    }
    return scopedAllowed;
  }

  const defaults = contract.authorityEnvelope.visibilityDefaults as RoleVisibilityClass[] | undefined;
  if (defaults && defaults.length > 0) {
    return new Set<RoleVisibilityClass>(defaults);
  }

  return fallback;
}

function minimumNecessaryMetadata(
  metadata: Record<string, unknown>,
  visibilityClass: RoleVisibilityClass,
): Record<string, unknown> {
  const sanitized = sanitizeRoleSensitivePayload(metadata);
  if (visibilityClass === "owner_full") {
    return sanitized;
  }

  const allowedKeys = visibilityClass === "delegated_minimum"
    ? ["objective", "priority", "deadline", "routineId", "routineRunId", "workpackFamily", "workpackRunId", "reasonCode", "status"]
    : ["status", "summary", "reasonCode", "workpackFamily", "priority"];

  return Object.fromEntries(
    Object.entries(sanitized).filter(([key]) => allowedKeys.includes(key)),
  );
}

function canMirrorToRoom(visibilityClass: RoleVisibilityClass): boolean {
  return visibilityClass === "shared_reference" || visibilityClass === "redacted_summary";
}

function maxAllowedSideEffect(detail: NonNullable<Awaited<ReturnType<typeof getRoleAgentDetail>>>): SideEffectClass {
  const contract = detail.activeContract;
  return (contract?.authorityEnvelope.sideEffectCeiling ?? "read_only") as SideEffectClass;
}

function maxBudget(detail: NonNullable<Awaited<ReturnType<typeof getRoleAgentDetail>>>): number {
  return detail.activeContract?.authorityEnvelope.monthlyBudgetLimit ?? 0;
}

async function delegationBlockers(input: {
  sender: NonNullable<Awaited<ReturnType<typeof getRoleAgentDetail>>>;
  recipient: NonNullable<Awaited<ReturnType<typeof getRoleAgentDetail>>>;
  workpackFamily?: string | null;
}): Promise<string[]> {
  const blockers: string[] = [];
  if (input.sender.role.tenantId !== input.recipient.role.tenantId) blockers.push("cross_tenant_forbidden");
  if (!input.sender.activeContract) blockers.push("sender_contract_missing");
  if (!input.recipient.activeContract) blockers.push("recipient_contract_missing");

  if (input.workpackFamily) {
    const recipientBinding = input.recipient.bindings.find((binding) => binding.workpackFamily === input.workpackFamily && binding.active);
    if (!recipientBinding) blockers.push("recipient_binding_missing");
    const workpackDetail = await getWorkpackDetail(input.workpackFamily);
    if (workpackDetail) {
      const connectorFamilies = Array.from(new Set(workpackDetail.version.connectorMaps.map((map) => map.connectorFamily)));
      if (connectorFamilies.some((family) => !input.sender.activeContract?.authorityEnvelope.connectorFamilies.includes(family))) {
        blockers.push("sender_connector_scope_exceeded");
      }
      if (connectorFamilies.some((family) => !input.recipient.activeContract?.authorityEnvelope.connectorFamilies.includes(family))) {
        blockers.push("recipient_connector_scope_exceeded");
      }
      const maxSideEffect = workpackDetail.version.executionPlan?.steps.reduce<SideEffectClass>((current, step) => {
        return SIDE_EFFECT_RANK[step.sideEffectClass] > SIDE_EFFECT_RANK[current] ? step.sideEffectClass : current;
      }, "read_only") ?? "read_only";
      if (SIDE_EFFECT_RANK[maxSideEffect] > SIDE_EFFECT_RANK[maxAllowedSideEffect(input.sender)]) blockers.push("sender_side_effect_exceeded");
      if (SIDE_EFFECT_RANK[maxSideEffect] > SIDE_EFFECT_RANK[maxAllowedSideEffect(input.recipient)]) blockers.push("recipient_side_effect_exceeded");
      const estimatedBudget = workpackDetail.version.executionPlan?.steps.length ?? 0;
      if (maxBudget(input.sender) > 0 && estimatedBudget > maxBudget(input.sender)) blockers.push("sender_budget_exceeded");
      if (maxBudget(input.recipient) > 0 && estimatedBudget > maxBudget(input.recipient)) blockers.push("recipient_budget_exceeded");
    }
  }

  return blockers;
}

export async function sendTypedRoleMessage(input: {
  tenantId: string;
  senderRoleId: string;
  recipientRoleId?: string | null;
  recipientGroup?: string | null;
  roomId?: string | null;
  relatedRoutineId?: string | null;
  relatedRoutineRunId?: string | null;
  relatedWorkpackFamily?: string | null;
  relatedWorkpackRunId?: string | null;
  intentType: RoleMessage["intentType"];
  priority?: RoleMessage["priority"];
  dueState?: RoleMessage["dueState"];
  contentSummary: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  message: RoleMessage;
  handoffId: string | null;
  approvalRequestId: string | null;
}> {
  const sender = await getRoleAgentDetail(input.senderRoleId);
  if (!sender || sender.role.tenantId !== input.tenantId) {
    throw new Error(`Unknown sender role: ${input.senderRoleId}`);
  }

  const recipient = input.recipientRoleId ? await getRoleAgentDetail(input.recipientRoleId) : null;
  if (input.recipientRoleId && (!recipient || recipient.role.tenantId !== input.tenantId)) {
    throw new Error(`Unknown recipient role: ${input.recipientRoleId}`);
  }

  const blockers = recipient
    ? await delegationBlockers({
      sender,
      recipient,
      workpackFamily: input.relatedWorkpackFamily ?? null,
    })
    : [];
  if (blockers.length > 0 && ["handoff", "request", "approval_request"].includes(input.intentType)) {
    throw new Error(`Delegation blocked: ${blockers.join(", ")}`);
  }

  const visibilityClass = visibilityForIntent(input.intentType);
  if (!allowedVisibilityForScopes(sender, ["role_messages"]).has(visibilityClass)) {
    throw new Error(`Delegation blocked: sender_visibility_scope_exceeded`);
  }
  if (recipient && !allowedVisibilityForScopes(recipient, ["role_messages"]).has(visibilityClass)) {
    throw new Error(`Delegation blocked: recipient_visibility_scope_exceeded`);
  }

  const timestamp = nowIso();
  const message = await saveRoleMessage({
    id: createRoleId("rmsg"),
    tenantId: input.tenantId,
    roomId: input.roomId ?? sender.role.roomId ?? null,
    senderRoleId: sender.role.id,
    recipientRoleId: recipient?.role.id ?? null,
    recipientGroup: input.recipientGroup ?? null,
    relatedRoutineId: input.relatedRoutineId ?? null,
    relatedRoutineRunId: input.relatedRoutineRunId ?? null,
    relatedWorkpackFamily: input.relatedWorkpackFamily ?? null,
    relatedWorkpackRunId: input.relatedWorkpackRunId ?? null,
    intentType: input.intentType,
    priority: input.priority ?? "normal",
    dueState: input.dueState ?? "pending",
    actionabilityState: input.intentType === "status_summary" || input.intentType === "shared_finding" ? "informational" : "pending",
    provenance: {
      source: input.roomId ? "team_room" : "role_monitor",
      actorId: sender.role.id,
      actorType: "role",
      traceId: createRoleId("trace"),
    },
    visibilityClass,
    contentSummary: input.contentSummary,
    metadata: minimumNecessaryMetadata(input.metadata ?? {}, visibilityClass),
    createdAt: timestamp,
    acknowledgedAt: null,
  });

  let handoffId: string | null = null;
  if (recipient && input.intentType === "handoff") {
    const handoff = await saveRoleHandoff({
      id: createRoleId("handoff"),
      tenantId: input.tenantId,
      senderRoleId: sender.role.id,
      recipientRoleId: recipient.role.id,
      sourceMessageId: message.id,
      relatedRoutineId: input.relatedRoutineId ?? null,
      relatedRoutineRunId: input.relatedRoutineRunId ?? null,
      purpose: input.contentSummary,
      expectedReviewState: "pending",
      status: "pending",
      linkedExceptionId: null,
      linkedWorkpackRunId: input.relatedWorkpackRunId ?? null,
      outcomeSummary: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    handoffId = handoff.id;
  }

  let approvalRequestId: string | null = null;
  if (input.intentType === "approval_request") {
    const approval = await saveRoleApprovalRequest({
      id: createRoleId("rappr"),
      tenantId: input.tenantId,
      roleId: sender.role.id,
      routineId: input.relatedRoutineId ?? null,
      routineRunId: input.relatedRoutineRunId ?? null,
      subjectId: message.id,
      approvalType: "delegated_approval_request",
      requesterRoleId: sender.role.id,
      requesterUserId: sender.role.ownerUserId ?? null,
      approverScope: "tenant_admin",
      quorum: 1,
      status: "pending",
      allowedDecisions: ["approve", "reject"],
      expiresAt: null,
      createdAt: timestamp,
      resolvedAt: null,
    });
    approvalRequestId = approval.id;
  }

  const mirrorRoomId = input.roomId ?? sender.role.roomId ?? null;
  const senderRoomVisibility = allowedVisibilityForScopes(sender, ["room_threads"]).has(visibilityClass);
  const recipientRoomVisibility = !recipient || allowedVisibilityForScopes(recipient, ["room_threads"]).has(visibilityClass);
  if (mirrorRoomId && canMirrorToRoom(visibilityClass) && senderRoomVisibility && recipientRoomVisibility) {
    await roomService.sendMessage({
      roomId: mirrorRoomId,
      tenantId: input.tenantId,
      senderType: "system",
      recipientType: recipient ? "subgroup" : "all",
      recipientGroupJson: recipient ? { roleIds: [sender.role.id, recipient.role.id] } : undefined,
      content: visibilityClass === "redacted_summary" ? input.contentSummary.slice(0, 280) : input.contentSummary,
      summaryContent: input.contentSummary.slice(0, 280),
      metadataJson: {
        roleMessageId: message.id,
        senderRoleId: sender.role.id,
        recipientRoleId: recipient?.role.id ?? null,
        intentType: input.intentType,
        handoffId,
        approvalRequestId,
        visibilityClass,
      },
      visibility: "milestone",
      turnType: "decision",
    });
  }

  return {
    message,
    handoffId,
    approvalRequestId,
  };
}
