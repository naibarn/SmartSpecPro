import type { TenantFeatureFlags } from "../../shared/featureFlags";

export type VerticalDramaAssuranceReleaseEvidence = {
  releaseId: string;
  evidenceReleaseId: string | null;
  implementationGate: "pass" | "pending" | "failed";
  productionGate: "pass" | "pending" | "failed";
  cohortAllowed: boolean;
  dependencies: {
    draftQc: boolean;
    promptMedia: boolean;
    storySeason: boolean;
  };
};

export type VerticalDramaAssuranceReleaseDecision = {
  mode: "legacy_deterministic" | "agent_shadow" | "agent_active";
  allowed: boolean;
  reason: "kill_switch" | "force_rollback" | "evidence_missing" | "dependency_not_ready" | "cohort_not_allowed" | "legacy_default" | "active_allowed" | "shadow_allowed";
};

const ACTIVE_FLAGS = new Set([
  "verticalDramaDraftQcOrchestraActive",
  "verticalDramaPromptQcOrchestraActive",
  "verticalDramaStoryAssuranceActive",
]);

export function evaluateVerticalDramaAssuranceRelease(input: {
  taskFamily: "draft_qc" | "prompt_media" | "story_season";
  flags: Pick<TenantFeatureFlags, "verticalDramaAssuranceShadow" | "verticalDramaDraftQcOrchestraActive" | "verticalDramaPromptQcOrchestraActive" | "verticalDramaStoryAssuranceActive" | "verticalDramaAssuranceKillSwitch" | "openAiAgentsRuntimeForceRollback" | "openAiAgentsRuntimeEnabled" | "openAiAgentsRuntimeSkillShadow" | "openAiAgentsRuntimeSkillActive">;
  evidence: VerticalDramaAssuranceReleaseEvidence | null;
}): VerticalDramaAssuranceReleaseDecision {
  if (input.flags.verticalDramaAssuranceKillSwitch) return { mode: "legacy_deterministic", allowed: false, reason: "kill_switch" };
  if (input.flags.openAiAgentsRuntimeForceRollback) return { mode: "legacy_deterministic", allowed: false, reason: "force_rollback" };
  const activeFlag = input.taskFamily === "draft_qc" ? "verticalDramaDraftQcOrchestraActive" : input.taskFamily === "prompt_media" ? "verticalDramaPromptQcOrchestraActive" : "verticalDramaStoryAssuranceActive";
  const activeRequested = input.flags[activeFlag];
  if (activeRequested) {
    const evidence = input.evidence;
    const dependenciesReady = input.taskFamily === "draft_qc" ? evidence?.dependencies.draftQc : input.taskFamily === "prompt_media" ? evidence?.dependencies.draftQc && evidence.dependencies.promptMedia : evidence?.dependencies.draftQc && evidence.dependencies.promptMedia && evidence.dependencies.storySeason;
    if (!evidence || evidence.releaseId !== evidence.evidenceReleaseId || evidence.implementationGate !== "pass" || evidence.productionGate !== "pass") return { mode: "legacy_deterministic", allowed: false, reason: "evidence_missing" };
    if (!evidence.cohortAllowed) return { mode: "legacy_deterministic", allowed: false, reason: "cohort_not_allowed" };
    if (!dependenciesReady) return { mode: "legacy_deterministic", allowed: false, reason: "dependency_not_ready" };
    if (!input.flags.openAiAgentsRuntimeEnabled || !input.flags.openAiAgentsRuntimeSkillActive) return { mode: "legacy_deterministic", allowed: false, reason: "dependency_not_ready" };
    return { mode: "agent_active", allowed: true, reason: "active_allowed" };
  }
  if (input.flags.verticalDramaAssuranceShadow && input.flags.openAiAgentsRuntimeEnabled && input.flags.openAiAgentsRuntimeSkillShadow) {
    return { mode: "agent_shadow", allowed: true, reason: "shadow_allowed" };
  }
  return { mode: "legacy_deterministic", allowed: false, reason: "legacy_default" };
}

export function canAssertVerticalDramaKillSwitch(): true {
  return true;
}

export function canClearVerticalDramaKillSwitch(input: { evidence: VerticalDramaAssuranceReleaseEvidence | null; expectedReleaseId: string }): boolean {
  return input.evidence?.productionGate === "pass" && input.evidence.releaseId === input.expectedReleaseId && input.evidence.evidenceReleaseId === input.expectedReleaseId;
}
