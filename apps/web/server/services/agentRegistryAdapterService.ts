import {
  createAgentRegistry,
  getAgentRegistry,
  listAgentRegistryVersions,
  publishAgentVersion,
  resolveAgentVersion,
  type AgentRegistryResolutionResult,
} from "./agentRegistryService";
import {
  getRoleAgent,
  getRoleAgentDetailForTenant,
  getRoleBlueprint,
  listRoleBindingsForRole,
  listRoleContractsForRole,
  listRoleDetailsByTenant,
  updateRoleAgent,
  type RolePersistenceSession,
} from "./rolePersistence";
import type {
  RoleAgent,
  RoleBlueprint,
  RoleContract,
  RoleWorkpackBinding,
} from "../../shared/roleAgentContracts";
import type {
  AgentRegistryManifest,
  AgentRegistryPolicyBundle,
  AgentRegistryVersionStatus,
} from "../../shared/agentRegistryContracts";
import type {
  AgentRegistryRegistry,
  AgentRegistryVersion,
} from "../../drizzle/schema";

const REGISTRY_CONTEXT_KEY = "agentRegistry";

type AgentRegistryRef = {
  registryId: string;
  registryKey: string;
  versionId: string | null;
  versionNumber: number | null;
  syncedAt: string;
};

export type RoleRegistrySnapshot = {
  registry: AgentRegistryRegistry | null;
  version: AgentRegistryVersion | null;
  resolution: AgentRegistryResolutionResult | null;
  reference: AgentRegistryRef | null;
};

export type DelegatedRegistrySnapshot = {
  registryId: string;
  registryKey: string;
  versionId: string | null;
  versionStatus: AgentRegistryVersionStatus | null;
  stableVersionId: string | null;
  resolutionReason: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function readRegistryRef(role: RoleAgent): AgentRegistryRef | null {
  const context = role.ownershipContext as Record<string, unknown> | null | undefined;
  const raw = context && typeof context[REGISTRY_CONTEXT_KEY] === "object"
    ? context[REGISTRY_CONTEXT_KEY] as Record<string, unknown>
    : null;
  if (!raw) return null;
  const registryId = typeof raw.registryId === "string" ? raw.registryId : null;
  const registryKey = typeof raw.registryKey === "string" ? raw.registryKey : null;
  if (!registryId || !registryKey) return null;
  return {
    registryId,
    registryKey,
    versionId: typeof raw.versionId === "string" ? raw.versionId : null,
    versionNumber: typeof raw.versionNumber === "number" ? raw.versionNumber : null,
    syncedAt: typeof raw.syncedAt === "string" ? raw.syncedAt : nowIso(),
  };
}

function toRoleToolClasses(blueprint: RoleBlueprint | null, contract: RoleContract | null): string[] {
  const connectorFamilies = blueprint?.typicalConnectorFamilies ?? [];
  const approval = contract?.authorityEnvelope.requiresApprovalFor ?? [];
  return Array.from(new Set([...connectorFamilies, ...approval])).filter(Boolean);
}

function buildManifest(role: RoleAgent, blueprint: RoleBlueprint | null, contract: RoleContract | null): AgentRegistryManifest {
  return {
    registryKey: `role-agent:${role.id}`,
    agentKind: "role_agent",
    title: role.name,
    description: blueprint?.purpose ?? contract?.missionStatement ?? role.departmentLabel,
    owningTeamId: role.bridgeTeamId ?? null,
    owningUserId: role.ownerUserId ?? null,
    modelFamilies: [],
    metadata: {
      roleId: role.id,
      blueprintId: role.blueprintId ?? null,
      contractId: contract?.id ?? null,
      departmentLabel: role.departmentLabel,
      lifecycleState: role.lifecycleState,
      healthState: role.healthState,
    },
  };
}

function buildRegistryCreateInput(role: RoleAgent, blueprint: RoleBlueprint | null, contract: RoleContract | null) {
  return {
    tenantId: role.tenantId,
    registryKey: `role-agent:${role.id}`,
    agentKind: "role_agent" as const,
    title: role.name,
    description: blueprint?.purpose ?? contract?.missionStatement ?? role.departmentLabel,
    owningTeamId: role.bridgeTeamId ?? null,
    owningUserId: role.ownerUserId ?? null,
    modelFamilies: [],
    metadata: {
      roleId: role.id,
      blueprintId: role.blueprintId ?? null,
      contractId: contract?.id ?? null,
      departmentLabel: role.departmentLabel,
      lifecycleState: role.lifecycleState,
      healthState: role.healthState,
    },
  };
}

function buildPolicyBundle(role: RoleAgent, blueprint: RoleBlueprint | null, contract: RoleContract | null): AgentRegistryPolicyBundle {
  const authority = contract?.authorityEnvelope;
  const toolClasses = toRoleToolClasses(blueprint, contract);
  return {
    purpose: contract?.missionStatement ?? blueprint?.purpose ?? role.name,
    supportedWorkDomains: [role.departmentLabel],
    supportedToolClasses: toolClasses,
    disallowedActionClasses: authority?.regulatedActionLabels ?? [],
    memoryScope: {
      accessScope: "registry",
      visibility: "operator_review",
      retentionTier: "standard",
      redactionState: "redacted",
      legalHold: false,
    },
    budgetPolicy: {
      perTenantCredits: authority?.monthlyBudgetLimit ?? undefined,
      sideEffectCeiling: authority?.sideEffectCeiling ?? "bounded_write",
    },
    escalationPolicy: {
      failClosed: true,
      approvalRequiredFor: authority?.requiresApprovalFor ?? [],
      escalationTriggers: authority?.requiresApprovalFor ?? [],
      escalationTargets: role.bridgeTeamId ? [role.bridgeTeamId] : [],
    },
    approvalRequirements: authority?.requiresApprovalFor ?? [],
    modelCompatibility: [],
    evaluationTargets: [role.id, contract?.id ?? "contract"],
    outcomeMemoryHook: `role:${role.id}:outcome_memory`,
    metadata: {
      roleId: role.id,
      blueprintId: role.blueprintId ?? null,
      contractId: contract?.id ?? null,
    },
  };
}

function buildRolloutBindings(role: RoleAgent, bindings: RoleWorkpackBinding[]) {
  return bindings
    .filter((binding) => binding.active)
    .map((binding) => ({
      teamTargetId: role.bridgeTeamId ?? null,
      queueTargetId: null,
      workpackFamily: binding.workpackFamily,
      environment: null,
      shadowPercent: binding.resolutionPolicy === "follow_latest_ready_in_family" ? 25 : 0,
      canaryPercent: binding.resolutionPolicy === "follow_benchmark_track" ? 10 : 0,
    }));
}

function mapContractStatusToVersionStatus(status: RoleContract["status"]) {
  if (status === "active") return "published" as const;
  if (status === "pending_review") return "review_required" as const;
  if (status === "blocked") return "draft" as const;
  return "draft" as const;
}

async function storeRegistryRef(roleId: string, ref: AgentRegistryRef, session?: RolePersistenceSession): Promise<void> {
  const role = await getRoleAgent(roleId, session);
  if (!role) {
    return;
  }
  await updateRoleAgent(role.id, (current) => ({
    ...current,
    ownershipContext: {
      ...current.ownershipContext,
      [REGISTRY_CONTEXT_KEY]: ref,
    },
    updatedAt: nowIso(),
  }), session);
}

export async function syncRoleRegistry(
  tenantId: string,
  roleId: string,
  session?: RolePersistenceSession,
): Promise<RoleRegistrySnapshot | null> {
  const role = await getRoleAgent(roleId, session);
  if (!role || role.tenantId !== tenantId) {
    return null;
  }

  const blueprint = role.blueprintId ? await getRoleBlueprint(role.blueprintId, session) : null;
  const contracts = await listRoleContractsForRole(role.id, session);
  const contract = [...contracts].sort((left, right) => right.versionNumber - left.versionNumber)[0] ?? null;
  if (!contract) {
    return { registry: null, version: null, resolution: null, reference: readRegistryRef(role) };
  }

  const existingRef = readRegistryRef(role);
  const currentRegistry = existingRef ? await getAgentRegistry(tenantId, existingRef.registryId) : null;
  const registry = currentRegistry ?? await createAgentRegistry(buildRegistryCreateInput(role, blueprint, contract));
  const versions = await listAgentRegistryVersions(tenantId, registry.id);
  const versionNumber = contract.versionNumber;
  let version = versions.find((candidate) => candidate.versionNumber === versionNumber) ?? null;

  if (!version) {
    version = await publishAgentVersion({
      tenantId,
      registryId: registry.id,
      versionNumber,
      versionStatus: mapContractStatusToVersionStatus(contract.status),
      rolloutState: contract.status === "active" ? "general" : "draft",
      previousVersionId: versions[0]?.id ?? null,
      isStable: contract.status === "active",
      reviewRequired: contract.status === "pending_review",
      publishedAt: contract.activatedAt ?? null,
      frozenAt: null,
      manifest: buildManifest(role, blueprint, contract),
      policies: buildPolicyBundle(role, blueprint, contract),
      rolloutBindings: buildRolloutBindings(role, await listRoleBindingsForRole(role.id, session)),
    });
  }

  const reference: AgentRegistryRef = {
    registryId: registry.id,
    registryKey: registry.registryKey,
    versionId: version.id,
    versionNumber: version.versionNumber,
    syncedAt: nowIso(),
  };
  await storeRegistryRef(role.id, reference, session);

  let resolution: AgentRegistryResolutionResult | null = null;
  try {
    resolution = await resolveAgentVersion({
      tenantId,
      registryId: registry.id,
      allowDraftVersions: true,
      allowEvidencePreference: true,
      requireApproval: false,
      requestedToolClasses: [],
      requestedActionClasses: [],
      workloadClass: role.departmentLabel,
    });
  } catch {
    resolution = null;
  }

  return {
    registry,
    version,
    resolution,
    reference,
  };
}

export async function getRoleRegistrySnapshot(
  tenantId: string,
  roleId: string,
  session?: RolePersistenceSession,
): Promise<RoleRegistrySnapshot | null> {
  const detail = await getRoleAgentDetailForTenant(tenantId, roleId, session);
  if (!detail) {
    return null;
  }

  const role = detail.role;
  const ref = readRegistryRef(role);
  if (!ref) {
    return { registry: null, version: null, resolution: null, reference: null };
  }

  const registry = await getAgentRegistry(tenantId, ref.registryId);
  if (!registry) {
    return { registry: null, version: null, resolution: null, reference: ref };
  }

  const version = ref.versionId
    ? (await listAgentRegistryVersions(tenantId, registry.id)).find((candidate) => candidate.id === ref.versionId) ?? null
    : null;

  let resolution: AgentRegistryResolutionResult | null = null;
  try {
    resolution = await resolveAgentVersion({
      tenantId,
      registryId: registry.id,
      allowDraftVersions: true,
      allowEvidencePreference: true,
      requireApproval: false,
      requestedToolClasses: [],
      requestedActionClasses: [],
      workloadClass: role.departmentLabel,
    });
  } catch {
    resolution = null;
  }

  return {
    registry,
    version,
    resolution,
    reference: ref,
  };
}

export async function getOwnerRegistrySnapshot(
  tenantId: string,
  ownerUserId: number,
  session?: RolePersistenceSession,
): Promise<DelegatedRegistrySnapshot | null> {
  const details = await listRoleDetailsByTenant(tenantId, session);
  const ownedRoles = details.filter((detail) => detail.role.ownerUserId === ownerUserId);
  if (ownedRoles.length !== 1) {
    return null;
  }

  const snapshot = await getRoleRegistrySnapshot(tenantId, ownedRoles[0].role.id, session);
  if (!snapshot?.registry) {
    return null;
  }

  return {
    registryId: snapshot.registry.id,
    registryKey: snapshot.registry.registryKey,
    versionId: snapshot.version?.id ?? snapshot.reference?.versionId ?? null,
    versionStatus: (snapshot.version?.versionStatus ?? null) as AgentRegistryVersionStatus | null,
    stableVersionId: snapshot.registry.currentStableVersionId ?? null,
    resolutionReason: snapshot.resolution?.reason ?? null,
  };
}
