import type { WorkpackGateResult, WorkpackRolloutPhase } from "../../shared/workpackTelemetry";
import { getTenantFeatureFlags } from "./tenantFeatureFlagService";
import { evaluateWorkpackPromotionEligibility } from "./workpackPromotionService";
import { getWorkpackDetail, listIncidentsForWorkpack } from "./workpackPersistence";

export interface WorkpackRolloutGateDecision {
  workpackId: string;
  versionId: string;
  rolloutPhase: WorkpackRolloutPhase;
  gateResult: WorkpackGateResult;
  reasonCode: string;
  nextAction: string;
  blockers: string[];
  tenantFlags: {
    workpacksEnabled: boolean;
    workpackAutonomousPilot: boolean;
    workpackOpsConsole: boolean;
  };
}

export async function evaluateWorkpackRolloutGate(input: {
  workpackId: string;
  targetMode?: "supervised" | "autonomous";
}): Promise<WorkpackRolloutGateDecision> {
  const detail = getWorkpackDetail(input.workpackId);
  if (!detail) {
    throw new Error(`Unknown workpack: ${input.workpackId}`);
  }

  const flags = await getTenantFeatureFlags(detail.workpack.tenantId);
  const incidents = listIncidentsForWorkpack(input.workpackId).filter((incident) => incident.status === "active");
  const promotionEligibility = evaluateWorkpackPromotionEligibility(input.workpackId);
  const unresolvedExceptions = detail.exceptions.filter((record) => !record.resolvedAt);
  const connectorBlocked = detail.version.connectorMaps.some((map) => map.validationStatus === "blocked");
  const connectorStale = detail.version.connectorMaps.some((map) => map.validationStatus === "stale");
  const safeResumeRequired = detail.workpack.policyProfile.safeResumeRequired === true;
  const blockers: string[] = [];

  if (!flags.workpacksEnabled) blockers.push("feature_disabled");
  if (connectorBlocked) blockers.push("connector_blocked");
  if (unresolvedExceptions.some((record) => record.riskClass === "critical")) blockers.push("critical_exception");
  if (incidents.length > 0) blockers.push("active_incident");
  if (detail.simulations.filter((run) => run.status === "passed").length === 0) blockers.push("simulation_missing");
  if (safeResumeRequired) blockers.push("safe_resume_review_required");
  if (input.targetMode === "autonomous" && !flags.workpackAutonomousPilot) blockers.push("autonomous_flag_disabled");
  if (!promotionEligibility.eligible && input.targetMode === "autonomous") blockers.push(promotionEligibility.reasonCode);

  let gateResult: WorkpackGateResult = "ready";
  let rolloutPhase: WorkpackRolloutPhase = "supervised";
  let reasonCode = "ready";
  let nextAction = "Workpack is ready for supervised execution.";

  if (blockers.includes("feature_disabled")) {
    gateResult = "blocked";
    rolloutPhase = "draft_only";
    reasonCode = "feature_disabled";
    nextAction = "Enable workpack feature flags before rollout.";
  } else if (blockers.includes("active_incident")) {
    gateResult = "blocked";
    rolloutPhase = "draft_only";
    reasonCode = "incident_active";
    nextAction = "Resolve or resume the active incident before rollout.";
  } else if (blockers.includes("safe_resume_review_required")) {
    gateResult = "review_required";
    rolloutPhase = "draft_only";
    reasonCode = "safe_resume_review_required";
    nextAction = "Run replay/readiness review again before resuming autonomous execution.";
  } else if (blockers.includes("connector_blocked") || blockers.includes("critical_exception")) {
    gateResult = "blocked";
    rolloutPhase = "draft_only";
    reasonCode = blockers.includes("connector_blocked") ? "connector_blocked" : "exception_burden_high";
    nextAction = "Fix boundary blockers before rollout.";
  } else if (blockers.includes("simulation_missing")) {
    gateResult = "review_required";
    rolloutPhase = "draft_only";
    reasonCode = "simulation_missing";
    nextAction = "Run fixture-backed simulation before rollout.";
  } else if (input.targetMode === "autonomous") {
    if (blockers.length > 0) {
      gateResult = "staged";
      rolloutPhase = "autonomous_pilot";
      reasonCode = blockers[0] ?? "pilot_only";
      nextAction = "Keep the workpack in a narrower pilot cohort until gates clear.";
    } else {
      gateResult = "ready";
      rolloutPhase = promotionEligibility.publicationScope === "tenant_local"
        ? "autonomous_pilot"
        : "autonomous_general";
      reasonCode = "autonomous_ready";
      nextAction = rolloutPhase === "autonomous_general"
        ? "Ready for broader autonomous rollout."
        : "Ready for autonomous pilot rollout.";
    }
  } else if (connectorStale || unresolvedExceptions.length > 0) {
    gateResult = "review_required";
    rolloutPhase = "supervised";
    reasonCode = connectorStale ? "connector_stale" : "review_required";
    nextAction = "Inspect stale mappings or remaining exceptions before expanding rollout.";
  }

  return {
    workpackId: detail.workpack.id,
    versionId: detail.version.id,
    rolloutPhase,
    gateResult,
    reasonCode,
    nextAction,
    blockers,
    tenantFlags: {
      workpacksEnabled: flags.workpacksEnabled,
      workpackAutonomousPilot: flags.workpackAutonomousPilot,
      workpackOpsConsole: flags.workpackOpsConsole,
    },
  };
}
