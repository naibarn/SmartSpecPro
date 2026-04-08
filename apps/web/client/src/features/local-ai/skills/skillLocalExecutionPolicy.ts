import type {
  LocalSkillExecutionTier,
  ResolvedLocalSkillPolicy,
} from "../types/capability";

export interface SkillLocalExecutionDisplayState {
  canRunLocally: boolean;
  canUseLocalPreprocess: boolean;
  badgeLabel: "Cloud" | "Local Assist" | "Local Safe";
  reason: string | null;
}

export interface LocalSkillRuntimeAvailability {
  scriptBundleAvailable?: boolean;
  gemma4TextAvailable?: boolean;
  installedGemmaProfileIds?: string[];
  externalTextBackendAvailable?: boolean;
}

export function canRunSkillLocally(
  policy: ResolvedLocalSkillPolicy,
  platform: "web" | "tauri",
  runtimeAvailability?: LocalSkillRuntimeAvailability,
): boolean {
  if (!policy.eligible) {
    return false;
  }
  if (policy.requiresTauri && platform !== "tauri") {
    return false;
  }
  if (policy.runtimeKind === "script_bundle") {
    if (runtimeAvailability && runtimeAvailability.scriptBundleAvailable !== true) {
      return false;
    }
    return policy.tier === "local_safe";
  }
  if (policy.runtimeKind === "gemma4_text") {
    if (runtimeAvailability?.externalTextBackendAvailable === true) {
      return policy.tier === "local_safe";
    }
    return (
      runtimeAvailability?.gemma4TextAvailable === true &&
      (runtimeAvailability.installedGemmaProfileIds?.length ?? 0) > 0 &&
      policy.tier === "local_safe"
    );
  }
  return false;
}

export function getLocalSkillBadgeLabel(
  tier: LocalSkillExecutionTier,
): SkillLocalExecutionDisplayState["badgeLabel"] {
  if (tier === "local_safe") {
    return "Local Safe";
  }
  if (tier === "local_preprocess_only") {
    return "Local Assist";
  }
  return "Cloud";
}

export function describeSkillLocalExecution(
  policy: ResolvedLocalSkillPolicy,
  platform: "web" | "tauri",
  runtimeAvailability?: LocalSkillRuntimeAvailability,
): SkillLocalExecutionDisplayState {
  const localRunAllowed = canRunSkillLocally(
    policy,
    platform,
    runtimeAvailability,
  );
  return {
    canRunLocally: localRunAllowed,
    canUseLocalPreprocess:
      policy.eligible === true &&
      ((policy.runtimeKind === "script_bundle" &&
        (runtimeAvailability?.scriptBundleAvailable ?? false) === true) ||
        (policy.runtimeKind === "gemma4_text" &&
          (((runtimeAvailability?.gemma4TextAvailable ?? false) === true &&
            (runtimeAvailability?.installedGemmaProfileIds?.length ?? 0) > 0) ||
            runtimeAvailability?.externalTextBackendAvailable === true))) &&
      policy.tier === "local_preprocess_only" &&
      (platform === "tauri" || platform === "web"),
    badgeLabel: getLocalSkillBadgeLabel(policy.tier),
    reason: policy.reason,
  };
}
