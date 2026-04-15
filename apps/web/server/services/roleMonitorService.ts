import { getRoleCheckpointHealth } from "./roleCheckpointService";
import { getRoleRegistrySnapshot } from "./agentRegistryAdapterService";
import { listRoleAwareExceptionView, syncRoleExceptionBindings } from "./roleExceptionBindingService";
import { getRoleAgentDetail, listRoleDetailsByTenant } from "./rolePersistence";
import { evaluateRoleRolloutGate } from "./roleRolloutGateService";
import { getLatestRoleMetricSnapshot } from "./roleTelemetryService";
import { getWorkpackReadinessSummary } from "./workpackReadinessService";

export async function getRoleRosterSummary(tenantId: string) {
  const details = await listRoleDetailsByTenant(tenantId);
  return Promise.all(details.map(async (detail) => {
    const metric = await getLatestRoleMetricSnapshot(detail.role.id);
    const checkpoint = await getRoleCheckpointHealth(detail.role.id);
    const gate = await evaluateRoleRolloutGate({ roleId: detail.role.id });
    const registrySnapshot = await getRoleRegistrySnapshot(tenantId, detail.role.id);
    return {
      roleId: detail.role.id,
      name: detail.role.name,
      departmentLabel: detail.role.departmentLabel,
      lifecycleState: detail.role.lifecycleState,
      healthState: detail.role.healthState,
      autonomyTier: detail.role.currentAutonomyTier,
      backlogDepth: metric?.backlogDepth ?? 0,
      backlogAgeMinutes: metric?.backlogAgeMinutes ?? 0,
      checkpointFreshnessMinutes: checkpoint.ageMinutes ?? 0,
      checkpointFreshnessTier: checkpoint.freshnessTier,
      exceptionCount: detail.exceptionBindings.length,
      kpiTrend: metric?.qualityScore ?? 0,
      blockerCodes: gate.blockers,
      gateResult: gate.gateResult,
      rolloutPhase: gate.rolloutPhase,
      registryId: registrySnapshot?.registry?.id ?? null,
      registryVersionId: registrySnapshot?.version?.id ?? null,
      registryVersionStatus: registrySnapshot?.version?.versionStatus ?? null,
    };
  }));
}

export async function getRoleMonitorDetail(roleId: string) {
  await syncRoleExceptionBindings(roleId);
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) {
    throw new Error(`Unknown role: ${roleId}`);
  }

  const metric = await getLatestRoleMetricSnapshot(roleId);
  const checkpointHealth = await getRoleCheckpointHealth(roleId);
  const gate = await evaluateRoleRolloutGate({ roleId });
  const roleExceptions = await listRoleAwareExceptionView(roleId);
  const registry = await getRoleRegistrySnapshot(detail.role.tenantId, roleId);
  const workpackDependencies = await Promise.all(
    Array.from(new Set(detail.routineRuns.map((run) => run.selectedWorkpackFamily).filter(Boolean) as string[]))
      .map(async (workpackId) => ({
        workpackId,
        readiness: await getWorkpackReadinessSummary(workpackId),
      })),
  );

  return {
    role: detail.role,
    activeContract: detail.activeContract,
    contracts: detail.contracts,
    bindings: detail.bindings,
    routines: detail.routines,
    routineRuns: detail.routineRuns,
    currentRoutineRun: detail.routineRuns.find((run) => run.status === "running" || run.status === "queued" || run.status === "awaiting_approval") ?? null,
    checkpoints: detail.checkpoints,
    checkpointHealth,
    queueItems: detail.queueItems,
    approvals: detail.approvals,
    messages: detail.messages,
    handoffs: detail.handoffs,
    roleExceptions,
    workpackDependencies,
    improvementProposals: detail.improvementProposals,
    promotionGates: detail.promotionGates,
    metric,
    gate,
    registry,
  };
}

export async function getRoleRoutineTimeline(roleId: string) {
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) {
    throw new Error(`Unknown role: ${roleId}`);
  }
  return detail.routineRuns.map((run) => ({
    id: run.id,
    routineId: run.routineId,
    status: run.status,
    triggerSource: run.triggerSource,
    selectedWorkpackFamily: run.selectedWorkpackFamily,
    resolvedWorkpackVersionId: run.resolvedWorkpackVersionId,
    linkedWorkpackRunIds: run.linkedWorkpackRunIds,
    blockerCodes: run.blockerCodes,
    recoveryState: run.recoveryState,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
  }));
}
