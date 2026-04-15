import type { RoleTelemetrySnapshot } from "../../shared/roleTelemetry";
import { roleTelemetrySnapshotSchema } from "../../shared/roleTelemetry";
import { createRoleId, getRoleAgentDetail, listRoleDetailsByTenant, saveRoleMetricSnapshot } from "./rolePersistence";
import { evaluateRolePromotionGate } from "./rolePromotionGateService";
import { getWorkpackDetail } from "./workpackPersistence";

export interface RoleTelemetryFilters {
  roleId?: string;
  departmentLabel?: string;
  routineId?: string;
  workpackFamily?: string;
  runtimeFamily?: string;
  connectorFamily?: string;
  riskTier?: RoleTelemetrySnapshot["riskTier"];
}

function nowIso(): string {
  return new Date().toISOString();
}

async function collectWorkpackSignals(detail: NonNullable<Awaited<ReturnType<typeof getRoleAgentDetail>>>) {
  const linkedWorkpacks = await Promise.all(
    Array.from(new Set(detail.routineRuns.map((run) => run.selectedWorkpackFamily).filter(Boolean) as string[]))
      .map((workpackId) => getWorkpackDetail(workpackId)),
  );
  return {
    linkedWorkpacks,
    connectorFamilies: Array.from(new Set(linkedWorkpacks.flatMap((workpack) => workpack?.version.connectorMaps.map((map) => map.connectorFamily) ?? []))),
    runtimeFamilies: Array.from(new Set(linkedWorkpacks.flatMap((workpack) => workpack?.runs.flatMap((run) => run.actualSteps.map((step) => step.runtimePath)) ?? []))),
  };
}

export async function captureRoleMetricSnapshot(roleId: string): Promise<RoleTelemetrySnapshot> {
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) {
    throw new Error(`Unknown role: ${roleId}`);
  }

  const completedRuns = detail.routineRuns.filter((run) => run.status === "succeeded");
  const activeRuns = detail.routineRuns.filter((run) => run.status === "queued" || run.status === "running" || run.status === "awaiting_approval");
  const blockedRuns = detail.routineRuns.filter((run) => run.status === "blocked" || run.status === "failed" || run.status === "quarantined");
  const checkpoint = detail.checkpoints[0];
  const checkpointFreshnessMinutes = checkpoint
    ? Math.max(0, Math.round((Date.now() - Date.parse(checkpoint.updatedAt ?? checkpoint.createdAt)) / 60_000))
    : 0;

  const { linkedWorkpacks, connectorFamilies, runtimeFamilies } = await collectWorkpackSignals(detail);
  const gate = await evaluateRolePromotionGate(roleId);

  const throughput = completedRuns.length;
  const exceptionRate = detail.exceptionBindings.length / Math.max(1, detail.routineRuns.length);
  const interventionRate = detail.approvals.filter((approval) => approval.status === "approved" || approval.status === "pending").length / Math.max(1, detail.routineRuns.length);
  const slaHitRate = completedRuns.length / Math.max(1, completedRuns.length + blockedRuns.length);
  const replayPassRate = linkedWorkpacks.length === 0
    ? 0
    : linkedWorkpacks.reduce((total, workpack) => {
      const passed = workpack?.simulations.filter((simulation) => simulation.status === "passed").length ?? 0;
      const totalRuns = workpack?.simulations.length ?? 0;
      return total + (totalRuns === 0 ? 0 : passed / totalRuns);
    }, 0) / linkedWorkpacks.length;

  const snapshot = roleTelemetrySnapshotSchema.parse({
    roleId: detail.role.id,
    tenantId: detail.role.tenantId,
    departmentLabel: detail.role.departmentLabel,
    routineId: detail.routines[0]?.id ?? null,
    throughput,
    interventionRate,
    exceptionRate,
    backlogDepth: activeRuns.length,
    backlogAgeMinutes: activeRuns.length > 0 ? checkpointFreshnessMinutes : 0,
    slaHitRate,
    qualityScore: Math.max(0, 1 - exceptionRate),
    replayPassRate,
    improvementVelocity: detail.improvementProposals.filter((proposal) => proposal.status === "approved" || proposal.status === "auto_applied").length,
    autonomyTier: detail.role.currentAutonomyTier,
    promotionDecision: gate.recommendedDecision,
    rolloutPhase: gate.recommendedDecision === "promote" && detail.role.currentAutonomyTier === "autonomous"
      ? "autonomous_general"
      : detail.role.currentAutonomyTier === "autonomous"
        ? "autonomous_pilot"
        : detail.role.currentAutonomyTier === "supervised"
          ? "supervised"
          : "guided",
    gateResult: gate.requiresReview
      ? "review_required"
      : gate.recommendedDecision === "freeze"
        ? "blocked"
        : gate.recommendedDecision === "promote"
          ? "ready"
          : "staged",
    checkpointFreshnessMinutes,
    recoveryChurn: detail.routineRuns.filter((run) => run.recoveryState !== "fresh").length,
    budgetBurn: detail.metricSnapshots[0]?.budgetBurn ?? 0,
    riskTier: exceptionRate > 0.3 ? "high" : blockedRuns.length > 0 ? "medium" : "low",
    connectorFamilies,
    runtimeFamilies,
    blockerCodes: Array.from(new Set(detail.routineRuns.flatMap((run) => run.blockerCodes))),
    updatedAt: nowIso(),
  });

  await saveRoleMetricSnapshot({
    id: createRoleId("rmetric"),
    tenantId: snapshot.tenantId,
    roleId: snapshot.roleId,
    routineId: snapshot.routineId ?? null,
    autonomyTier: snapshot.autonomyTier,
    healthState: detail.role.healthState,
    backlogDepth: snapshot.backlogDepth,
    backlogAgeMinutes: snapshot.backlogAgeMinutes,
    throughput: snapshot.throughput,
    interventionRate: snapshot.interventionRate,
    exceptionRate: snapshot.exceptionRate,
    slaHitRate: snapshot.slaHitRate,
    qualityScore: snapshot.qualityScore,
    replayPassRate: snapshot.replayPassRate,
    improvementVelocity: snapshot.improvementVelocity,
    checkpointFreshnessMinutes: snapshot.checkpointFreshnessMinutes,
    checkpointFreshnessTier: snapshot.checkpointFreshnessMinutes > 120 ? "critical" : snapshot.checkpointFreshnessMinutes > 30 ? "warning" : "fresh",
    recoveryChurn: snapshot.recoveryChurn,
    budgetBurn: snapshot.budgetBurn,
    blockerCodes: snapshot.blockerCodes,
    generatedAt: snapshot.updatedAt,
  });

  return snapshot;
}

export async function getLatestRoleMetricSnapshot(roleId: string): Promise<RoleTelemetrySnapshot | null> {
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) return null;
  if (detail.metricSnapshots.length === 0) {
    return captureRoleMetricSnapshot(roleId);
  }
  const latest = detail.metricSnapshots[0]!;
  const gate = await evaluateRolePromotionGate(roleId);
  const { connectorFamilies, runtimeFamilies } = await collectWorkpackSignals(detail);
  return roleTelemetrySnapshotSchema.parse({
    roleId: detail.role.id,
    tenantId: detail.role.tenantId,
    departmentLabel: detail.role.departmentLabel,
    routineId: latest.routineId ?? null,
    throughput: latest.throughput,
    interventionRate: latest.interventionRate,
    exceptionRate: latest.exceptionRate,
    backlogDepth: latest.backlogDepth,
    backlogAgeMinutes: latest.backlogAgeMinutes,
    slaHitRate: latest.slaHitRate,
    qualityScore: latest.qualityScore,
    replayPassRate: latest.replayPassRate,
    improvementVelocity: latest.improvementVelocity,
    autonomyTier: latest.autonomyTier,
    promotionDecision: gate.recommendedDecision,
    rolloutPhase: latest.autonomyTier === "autonomous" ? "autonomous_pilot" : latest.autonomyTier === "supervised" ? "supervised" : "guided",
    gateResult: gate.requiresReview ? "review_required" : gate.recommendedDecision === "freeze" ? "blocked" : "ready",
    checkpointFreshnessMinutes: latest.checkpointFreshnessMinutes,
    recoveryChurn: latest.recoveryChurn,
    budgetBurn: latest.budgetBurn,
    riskTier: latest.exceptionRate > 0.3 ? "high" : latest.recoveryChurn > 0 ? "medium" : "low",
    connectorFamilies,
    runtimeFamilies,
    blockerCodes: latest.blockerCodes,
    updatedAt: latest.generatedAt,
  });
}

function matchesTelemetryFilters(
  snapshot: RoleTelemetrySnapshot,
  detail: NonNullable<Awaited<ReturnType<typeof getRoleAgentDetail>>>,
  filters: RoleTelemetryFilters,
): boolean {
  if (filters.roleId && snapshot.roleId !== filters.roleId) return false;
  if (filters.departmentLabel && snapshot.departmentLabel !== filters.departmentLabel) return false;
  if (filters.routineId && snapshot.routineId !== filters.routineId) return false;
  if (filters.workpackFamily && !detail.routineRuns.some((run) => run.selectedWorkpackFamily === filters.workpackFamily)) return false;
  if (filters.runtimeFamily && !snapshot.runtimeFamilies.includes(filters.runtimeFamily)) return false;
  if (filters.connectorFamily && !snapshot.connectorFamilies.includes(filters.connectorFamily)) return false;
  if (filters.riskTier && snapshot.riskTier !== filters.riskTier) return false;
  return true;
}

export async function listRoleTelemetrySnapshots(tenantId: string, filters: RoleTelemetryFilters = {}): Promise<RoleTelemetrySnapshot[]> {
  const details = await listRoleDetailsByTenant(tenantId);
  const snapshots = await Promise.all(
    details.map(async (detail) => ({
      detail,
      snapshot: await getLatestRoleMetricSnapshot(detail.role.id).then((snapshot) => snapshot ?? captureRoleMetricSnapshot(detail.role.id)),
    })),
  );
  return snapshots
    .filter(({ detail, snapshot }) => matchesTelemetryFilters(snapshot, detail, filters))
    .map(({ snapshot }) => snapshot);
}
