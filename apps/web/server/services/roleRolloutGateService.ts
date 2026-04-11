import { roleRolloutGateDecisionSchema, type RoleRolloutGateDecision } from "../../shared/roleTelemetry";
import { getRoleAgentDetail } from "./rolePersistence";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { evaluateRolePromotionGate } from "./rolePromotionGateService";
import { getLatestRoleMetricSnapshot } from "./roleTelemetryService";

export async function evaluateRoleRolloutGate(input: {
  roleId: string;
}): Promise<RoleRolloutGateDecision> {
  const detail = await getRoleAgentDetail(input.roleId);
  if (!detail) {
    throw new Error(`Unknown role: ${input.roleId}`);
  }

  const flags = await getTenantFeatureFlags(detail.role.tenantId);
  const latestMetric = await getLatestRoleMetricSnapshot(detail.role.id);
  const promotionGate = await evaluateRolePromotionGate(detail.role.id);
  const blockers: string[] = [];

  if (!flags.orchestratorEnabled) blockers.push("orchestrator_disabled");
  if (!flags.workpacksEnabled) blockers.push("workpacks_disabled");
  if (!flags.workpackOpsConsole) blockers.push("ops_console_disabled");
  if (detail.role.lifecycleState === "quarantined") blockers.push("role_quarantined");
  if (detail.routineRuns.some((run) => run.blockerCodes.some((code) => code.includes("workpack") || code.includes("incident")))) {
    blockers.push("workpack_dependency_blocked");
  }
  if (latestMetric && latestMetric.replayPassRate < 0.8) blockers.push("replay_pass_rate_low");
  if (latestMetric && latestMetric.exceptionRate > 0.25) blockers.push("exception_rate_high");
  if (latestMetric && latestMetric.checkpointFreshnessMinutes > 120) blockers.push("checkpoint_stale");
  if (detail.role.currentAutonomyTier === "autonomous" && !flags.workpackAutonomousPilot) blockers.push("autonomous_pilot_disabled");
  if (promotionGate.requiresReview) blockers.push("promotion_review_required");

  const gateResult = blockers.length === 0
    ? "ready"
    : blockers.includes("role_quarantined") || blockers.includes("workpack_dependency_blocked")
      ? "blocked"
      : blockers.includes("promotion_review_required")
        ? "review_required"
        : "staged";

  const rolloutPhase = detail.role.currentAutonomyTier === "autonomous"
    ? "autonomous_pilot"
    : detail.role.currentAutonomyTier === "supervised"
      ? "supervised"
      : "guided";

  return roleRolloutGateDecisionSchema.parse({
    tenantId: detail.role.tenantId,
    roleId: detail.role.id,
    routineId: detail.routines[0]?.id ?? null,
    rolloutPhase,
    gateResult,
    reasonCode: blockers[0] ?? "ready",
    nextAction: blockers.length === 0
      ? "Role autonomy posture is healthy."
      : `Resolve ${blockers[0]} before widening autonomy.`,
    blockers,
    currentAutonomyTier: detail.role.currentAutonomyTier,
  });
}

