export const AGENT_EXPERIENCE_CANARY_STAGES = [
  "fixture_only",
  "shadow_internal",
  "preview_internal",
  "selected_tenants",
  "ramp_25",
  "ramp_50",
  "ramp_100",
] as const;

export type AgentExperienceCanaryStage = typeof AGENT_EXPERIENCE_CANARY_STAGES[number];

export interface AgentExperienceWaiver {
  waiver_id?: string;
  gate?: string;
  reason?: string;
  owner?: string;
  expires_on?: string;
  mitigation?: string;
  revisit_trigger?: string;
  impacted_stage?: AgentExperienceCanaryStage;
  criticalSafetyGate?: boolean;
}

export interface AgentExperienceReleaseEvidence {
  commandResults?: Record<string, "pass" | "fail" | "not_applicable">;
  waivers?: AgentExperienceWaiver[];
  fixtureInventoryPresent?: boolean;
  schemaChangelogPresent?: boolean;
  dependencyGateReportPresent?: boolean;
  launchDecisionLogPresent?: boolean;
  rollbackDrillPresent?: boolean;
  threatModelPresent?: boolean;
  performanceBaselinePresent?: boolean;
  alertTriageMatrixPresent?: boolean;
  reviewerSignoffPresent?: boolean;
  surfaceAdoptionCriteriaPresent?: boolean;
}

export function validateAgentExperienceWaiver(waiver: AgentExperienceWaiver, now = new Date()): string[] {
  const errors: string[] = [];
  for (const field of ["waiver_id", "gate", "reason", "owner", "expires_on", "mitigation", "revisit_trigger", "impacted_stage"] as const) {
    if (!waiver[field]) errors.push(`waiver missing ${field}`);
  }
  if (waiver.expires_on && Date.parse(waiver.expires_on) <= now.getTime()) {
    errors.push("waiver expired");
  }
  if (waiver.criticalSafetyGate) {
    errors.push("waiver cannot bypass critical safety gates");
  }
  return errors;
}

export function validateAgentExperienceReleaseEvidence(evidence: AgentExperienceReleaseEvidence): string[] {
  const errors: string[] = [];
  if (!evidence.commandResults || Object.keys(evidence.commandResults).length === 0) {
    errors.push("missing command results");
  }
  if (!evidence.fixtureInventoryPresent) errors.push("missing fixture inventory");
  if (!evidence.schemaChangelogPresent) errors.push("missing schema changelog");
  if (!evidence.rollbackDrillPresent) errors.push("missing rollback drill");
  if (!evidence.threatModelPresent) errors.push("missing threat model");
  if (!evidence.performanceBaselinePresent) errors.push("missing performance baseline");
  if (!evidence.alertTriageMatrixPresent) errors.push("missing alert/triage matrix");
  if (!evidence.reviewerSignoffPresent) errors.push("missing reviewer signoff");
  if (!evidence.surfaceAdoptionCriteriaPresent) errors.push("missing surface adoption criteria");
  for (const waiver of evidence.waivers ?? []) {
    errors.push(...validateAgentExperienceWaiver(waiver));
  }
  return errors;
}
