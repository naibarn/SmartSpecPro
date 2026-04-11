import type { RolePromotionDecision } from "../../shared/roleAgentContracts";
import { createRoleId, getRoleAgentDetail, saveRolePromotionGate } from "./rolePersistence";

function nowIso(): string {
  return new Date().toISOString();
}

function decidePromotion(input: {
  replayPassRate: number;
  exceptionRate: number;
  kpiMissStreak: number;
  checkpointFreshnessMinutes: number;
  incidentBlocked: boolean;
  readinessOk: boolean;
  authorityDeltaDetected: boolean;
}): { decision: RolePromotionDecision; reasonCodes: string[]; requiresReview: boolean } {
  const reasonCodes: string[] = [];
  if (input.incidentBlocked) reasonCodes.push("incident_blocked");
  if (!input.readinessOk) reasonCodes.push("workpack_not_ready");
  if (input.replayPassRate < 0.75) reasonCodes.push("replay_below_floor");
  if (input.exceptionRate > 0.25) reasonCodes.push("exception_rate_high");
  if (input.kpiMissStreak >= 3) reasonCodes.push("kpi_miss_streak");
  if (input.checkpointFreshnessMinutes > 120) reasonCodes.push("checkpoint_stale");
  if (input.authorityDeltaDetected) reasonCodes.push("authority_delta_detected");

  if (reasonCodes.includes("incident_blocked") || reasonCodes.includes("authority_delta_detected")) {
    return { decision: "freeze", reasonCodes, requiresReview: true };
  }
  if (reasonCodes.includes("replay_below_floor") || reasonCodes.includes("exception_rate_high") || reasonCodes.includes("checkpoint_stale")) {
    return { decision: "downgrade", reasonCodes, requiresReview: false };
  }
  if (input.replayPassRate >= 0.95 && input.exceptionRate <= 0.05 && input.kpiMissStreak === 0 && input.readinessOk) {
    return { decision: "promote", reasonCodes: ["promotion_minima_met"], requiresReview: false };
  }
  return { decision: "unchanged", reasonCodes: reasonCodes.length > 0 ? reasonCodes : ["steady_state"], requiresReview: false };
}

export async function evaluateRolePromotionGate(roleId: string): Promise<Awaited<ReturnType<typeof saveRolePromotionGate>>> {
  const detail = await getRoleAgentDetail(roleId);
  if (!detail) {
    throw new Error(`Unknown role: ${roleId}`);
  }

  const latestMetric = detail.metricSnapshots[0];
  const latestRun = detail.routineRuns[0];
  const incidentBlocked = detail.role.lifecycleState === "quarantined" || detail.role.healthState === "quarantined";
  const readinessOk = !latestRun?.blockerCodes.some((code) => code.includes("workpack") || code.includes("incident"));
  const authorityDeltaDetected = detail.improvementProposals.some((proposal) => proposal.authorityImpact !== "none" && proposal.status === "pending");
  const kpiMissStreak = latestMetric && latestMetric.slaHitRate < 0.9 ? 1 : 0;
  const checkpointFreshnessMinutes = latestMetric?.checkpointFreshnessMinutes ?? 0;

  const evaluation = decidePromotion({
    replayPassRate: latestMetric?.replayPassRate ?? 0,
    exceptionRate: latestMetric?.exceptionRate ?? 0,
    kpiMissStreak,
    checkpointFreshnessMinutes,
    incidentBlocked,
    readinessOk,
    authorityDeltaDetected,
  });

  return saveRolePromotionGate({
    id: createRoleId("rpg"),
    tenantId: detail.role.tenantId,
    roleId: detail.role.id,
    routineId: latestMetric?.routineId ?? latestRun?.routineId ?? null,
    currentAutonomyTier: detail.role.currentAutonomyTier,
    recommendedDecision: evaluation.decision,
    reasonCodes: evaluation.reasonCodes,
    replayPassRate: latestMetric?.replayPassRate ?? 0,
    exceptionRate: latestMetric?.exceptionRate ?? 0,
    kpiMissStreak,
    checkpointFreshnessMinutes,
    workpackIncidentBlocked: incidentBlocked,
    workpackReadinessOk: readinessOk,
    authorityDeltaDetected,
    requiresReview: evaluation.requiresReview,
    evaluatedAt: nowIso(),
  });
}

