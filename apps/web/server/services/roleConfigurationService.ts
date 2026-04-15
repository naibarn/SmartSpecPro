import type { RoleAutonomyTier } from "../../shared/roleAgentContracts";
import {
  createRoleId,
  getRoleAgentForTenant,
  getRoleAgentDetailForTenant,
  getRoleWorkpackBinding,
  getRoleWorkpackBindingForTenant,
  getRoleRoutine,
  getRoleRoutineForTenant,
  listRoleContractsForRole,
  saveRoleAgent,
  saveRoleBlueprint,
  saveRoleContract,
  saveRoleRoutine,
  saveRoleWorkpackBinding,
  updateRoleAgent,
  updateRoleRoutine,
  updateRoleWorkpackBinding,
} from "./rolePersistence";

function nowIso(): string {
  return new Date().toISOString();
}

export async function createRoleAgentFromBlueprint(input: {
  tenantId: string;
  key: string;
  title: string;
  departmentLabel: string;
  purpose: string;
  defaultMission: string;
  typicalConnectorFamilies?: string[];
  defaultAutonomyTier?: RoleAutonomyTier;
  ownerUserId?: number | null;
  bridgeTeamId?: string | null;
  roomId?: string | null;
}) {
  const timestamp = nowIso();
  const blueprint = await saveRoleBlueprint({
    id: createRoleId("rbp"),
    tenantId: input.tenantId,
    key: input.key,
    title: input.title,
    departmentLabel: input.departmentLabel,
    purpose: input.purpose,
    defaultMission: input.defaultMission,
    kpiCategories: [],
    defaultAuthorityEnvelope: {
      autonomyTier: input.defaultAutonomyTier ?? "guided",
      connectorFamilies: input.typicalConnectorFamilies ?? [],
      sideEffectCeiling: "bounded_write",
      monthlyBudgetLimit: 100,
      regulatedActionLabels: [],
      requiresApprovalFor: [],
      visibilityDefaults: ["owner_full", "delegated_minimum", "redacted_summary", "shared_reference", "operator_review"],
    },
    typicalConnectorFamilies: input.typicalConnectorFamilies ?? [],
    recommendedRoutineStarters: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const roleId = createRoleId("role");
  const contractId = createRoleId("rc");
  const role = await saveRoleAgent({
    id: roleId,
    tenantId: input.tenantId,
    blueprintId: blueprint.id,
    name: input.title,
    departmentLabel: input.departmentLabel,
    lifecycleState: "draft",
    healthState: "healthy",
    currentAutonomyTier: input.defaultAutonomyTier ?? "guided",
    activeContractId: contractId,
    bridgeTeamId: input.bridgeTeamId ?? null,
    roomId: input.roomId ?? null,
    ownerUserId: input.ownerUserId ?? null,
    ownershipContext: {},
    tags: [],
    lastCheckpointAt: null,
    lastRoutineRunId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const contract = await saveRoleContract({
    id: contractId,
    tenantId: input.tenantId,
    roleId,
    versionNumber: 1,
    status: "draft",
    missionStatement: input.defaultMission,
    kpiTargets: [],
    authorityEnvelope: blueprint.defaultAuthorityEnvelope,
    workpackBindingIds: [],
    visibilityMatrix: {
      role_memory: ["owner_full", "operator_review"],
      room_threads: ["owner_full", "delegated_minimum", "redacted_summary", "shared_reference", "operator_review"],
      checkpoints: ["owner_full", "delegated_minimum", "redacted_summary", "operator_review"],
      artifacts: ["owner_full", "delegated_minimum", "shared_reference", "operator_review"],
      exceptions: ["owner_full", "delegated_minimum", "redacted_summary", "operator_review"],
    },
    notes: "",
    activatedAt: null,
    supersededByContractId: null,
    createdAt: timestamp,
  });

  return { blueprint, role, contract };
}

export async function updateRoleMission(input: {
  tenantId: string;
  roleId: string;
  missionStatement: string;
  autonomyTier?: RoleAutonomyTier;
  monthlyBudgetLimit?: number;
}) {
  const detail = await getRoleAgentDetailForTenant(input.tenantId, input.roleId);
  if (!detail || !detail.role.activeContractId) {
    throw new Error(`Unknown role or active contract missing: ${input.roleId}`);
  }
  const role = detail.role;
  const latestVersionNumber = Math.max(0, ...detail.contracts.map((contract) => contract.versionNumber));
  const activeContract = detail.activeContract;

  const timestamp = nowIso();
  return saveRoleContract({
    id: createRoleId("rc"),
    tenantId: role.tenantId,
    roleId: role.id,
    versionNumber: latestVersionNumber + 1,
    status: "pending_review",
    missionStatement: input.missionStatement,
    kpiTargets: activeContract?.kpiTargets ?? [],
    authorityEnvelope: {
      autonomyTier: input.autonomyTier ?? activeContract?.authorityEnvelope.autonomyTier ?? role.currentAutonomyTier,
      connectorFamilies: activeContract?.authorityEnvelope.connectorFamilies ?? [],
      sideEffectCeiling: activeContract?.authorityEnvelope.sideEffectCeiling ?? "bounded_write",
      monthlyBudgetLimit: input.monthlyBudgetLimit ?? activeContract?.authorityEnvelope.monthlyBudgetLimit ?? 100,
      regulatedActionLabels: activeContract?.authorityEnvelope.regulatedActionLabels ?? [],
      requiresApprovalFor: activeContract?.authorityEnvelope.requiresApprovalFor ?? [],
      visibilityDefaults: activeContract?.authorityEnvelope.visibilityDefaults ?? ["owner_full", "delegated_minimum", "redacted_summary"],
    },
    workpackBindingIds: activeContract?.workpackBindingIds ?? [],
    visibilityMatrix: activeContract?.visibilityMatrix ?? {},
    notes: "",
    activatedAt: null,
    supersededByContractId: role.activeContractId,
    createdAt: timestamp,
  });
}

export async function upsertRoleWorkpackBinding(input: {
  tenantId: string;
  roleId: string;
  contractId: string;
  bindingId?: string | null;
  label: string;
  workpackFamily: string;
  resolutionPolicy: "pinned_version" | "follow_benchmark_track" | "follow_latest_ready_in_family";
  pinnedVersionId?: string | null;
  rollbackBaselineVersionId?: string | null;
  connectorCeilingFamilies?: string[];
  budgetCeiling?: number;
}) {
  const role = await getRoleAgentForTenant(input.tenantId, input.roleId);
  if (!role) {
    throw new Error(`Unknown role: ${input.roleId}`);
  }
  const contracts = await listRoleContractsForRole(role.id);
  if (!contracts.some((contract) => contract.id === input.contractId && contract.tenantId === input.tenantId)) {
    throw new Error(`Unknown role contract: ${input.contractId}`);
  }
  const timestamp = nowIso();
  if (input.bindingId) {
    const existing = await getRoleWorkpackBindingForTenant(input.tenantId, input.bindingId);
    if (!existing || existing.roleId !== role.id) {
      throw new Error(`Unknown binding: ${input.bindingId}`);
    }
    return updateRoleWorkpackBinding(existing.id, (binding) => ({
      ...binding,
      label: input.label,
      workpackFamily: input.workpackFamily,
      resolutionPolicy: input.resolutionPolicy,
      pinnedVersionId: input.pinnedVersionId ?? null,
      rollbackBaselineVersionId: input.rollbackBaselineVersionId ?? null,
      connectorCeilingFamilies: input.connectorCeilingFamilies ?? binding.connectorCeilingFamilies,
      budgetCeiling: input.budgetCeiling ?? binding.budgetCeiling,
      createdAt: binding.createdAt,
    }));
  }

  return saveRoleWorkpackBinding({
    id: createRoleId("bind"),
    tenantId: role.tenantId,
    roleId: role.id,
    contractId: input.contractId,
    label: input.label,
    workpackFamily: input.workpackFamily,
    benchmarkTrack: null,
    pinnedVersionId: input.pinnedVersionId ?? null,
    resolutionPolicy: input.resolutionPolicy,
    rollbackBaselineVersionId: input.rollbackBaselineVersionId ?? null,
    connectorCeilingFamilies: input.connectorCeilingFamilies ?? [],
    sideEffectCeiling: "bounded_write",
    budgetCeiling: input.budgetCeiling ?? 0,
    regulatedBoundaryLabel: null,
    active: true,
    createdAt: timestamp,
  });
}

export async function upsertRoleRoutineDefinition(input: {
  tenantId: string;
  roleId: string;
  contractId: string;
  routineId?: string | null;
  title: string;
  description?: string;
  workpackBindingIds: string[];
  autonomyTier: RoleAutonomyTier;
  triggerType: "schedule" | "inbox_poll" | "queue_threshold" | "connector_event" | "exception_follow_up" | "kpi_breach" | "manual";
  intervalMinutes?: number | null;
  cron?: string | null;
  concurrencyPolicy: "singleton" | "allow_overlap" | "partitioned_by_key";
  slaMinutes: number;
}) {
  const role = await getRoleAgentForTenant(input.tenantId, input.roleId);
  if (!role) {
    throw new Error(`Unknown role: ${input.roleId}`);
  }
  const contracts = await listRoleContractsForRole(role.id);
  if (!contracts.some((contract) => contract.id === input.contractId && contract.tenantId === input.tenantId)) {
    throw new Error(`Unknown role contract: ${input.contractId}`);
  }
  const timestamp = nowIso();

  if (input.routineId) {
    const routine = await getRoleRoutineForTenant(input.tenantId, input.routineId);
    if (!routine || routine.roleId !== role.id) {
      throw new Error(`Unknown routine: ${input.routineId}`);
    }
    return updateRoleRoutine(routine.id, (current) => ({
      ...current,
      title: input.title,
      description: input.description ?? current.description,
      autonomyTier: input.autonomyTier,
      workpackBindingIds: input.workpackBindingIds,
      schedule: {
        ...current.schedule,
        triggerType: input.triggerType,
        intervalMinutes: input.intervalMinutes ?? null,
        cron: input.cron ?? null,
      },
      concurrencyPolicy: input.concurrencyPolicy,
      slaMinutes: input.slaMinutes,
      updatedAt: timestamp,
    }));
  }

  return saveRoleRoutine({
    id: createRoleId("routine"),
    tenantId: role.tenantId,
    roleId: role.id,
    contractId: input.contractId,
    title: input.title,
    description: input.description ?? "",
    status: "active",
    autonomyTier: input.autonomyTier,
    workpackBindingIds: input.workpackBindingIds,
    schedule: {
      triggerType: input.triggerType,
      intervalMinutes: input.intervalMinutes ?? null,
      cron: input.cron ?? null,
      queueThreshold: null,
      connectorEventKey: null,
      kpiKey: null,
      followUpDelayMinutes: null,
      activeWindow: null,
    },
    concurrencyPolicy: input.concurrencyPolicy,
    slaMinutes: input.slaMinutes,
    partitionKeyField: null,
    nextWakeAt: null,
    lastWakeAt: null,
    rollbackBaselineVersionId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}
