import type {
  CapabilityResult,
  LocalAiCatalogEntry,
  LocalAiConversationOverride,
  LocalAiPolicy,
  LocalAiSyncedPreferences,
  LocalAiTaskClass,
  RuntimeDecisionEnvelope,
} from "../../../../packages/local-ai-core/src/index";
import {
  resolveConversationLocalAiMode,
  resolveConversationPreferredProfileId,
} from "../../../../packages/local-ai-core/src/index";

function pickEligibleProfileId(
  catalog: LocalAiCatalogEntry[],
  capability: CapabilityResult,
  preferredProfileId: string | null | undefined,
): string | null {
  if (preferredProfileId) {
    const preferred = catalog.find(
      (entry) =>
        entry.id === preferredProfileId &&
        entry.status === "allowed" &&
        capability.eligibleProfiles.includes(entry.id),
    );
    if (preferred) {
      return preferred.id;
    }
  }

  return (
    catalog.find(
      (entry) =>
        entry.status === "allowed" &&
        capability.eligibleProfiles.includes(entry.id),
    )?.id ?? null
  );
}

export function decideLocalAiRuntime(input: {
  taskClass: LocalAiTaskClass;
  prefs: LocalAiSyncedPreferences;
  override?: LocalAiConversationOverride | null;
  policy: LocalAiPolicy;
  capability: CapabilityResult;
  catalog: LocalAiCatalogEntry[];
}): RuntimeDecisionEnvelope {
  const selectedMode = resolveConversationLocalAiMode(
    input.prefs,
    input.override,
  );

  if (!input.policy.featureEnabled) {
    return {
      taskClass: input.taskClass,
      userPreferences: input.prefs,
      conversationOverride: input.override ?? null,
      capability: input.capability,
      selectedMode,
      selectedRuntime: "cloud",
      selectedProfileId: null,
      fallbackAllowed: true,
      reason: "tenant_disabled",
    };
  }

  if (input.policy.forceCloudOnly || selectedMode === "cloud_only" || selectedMode === "off") {
    return {
      taskClass: input.taskClass,
      userPreferences: input.prefs,
      conversationOverride: input.override ?? null,
      capability: input.capability,
      selectedMode,
      selectedRuntime: "cloud",
      selectedProfileId: null,
      fallbackAllowed: true,
      reason: input.policy.forceCloudOnly ? "force_cloud_only" : "mode_cloud_only",
    };
  }

  const selectedProfileId = pickEligibleProfileId(
    input.catalog,
    input.capability,
    resolveConversationPreferredProfileId(input.prefs, input.override),
  );

  if (!input.capability.supported || !selectedProfileId) {
    return {
      taskClass: input.taskClass,
      userPreferences: input.prefs,
      conversationOverride: input.override ?? null,
      capability: input.capability,
      selectedMode,
      selectedRuntime: "cloud",
      selectedProfileId: null,
      fallbackAllowed: selectedMode !== "local_only",
      reason: "capability_unavailable",
    };
  }

  const selectedRuntime =
    selectedMode === "local_only" ? "local" : "hybrid";

  return {
    taskClass: input.taskClass,
    userPreferences: input.prefs,
    conversationOverride: input.override ?? null,
    capability: input.capability,
    selectedMode,
    selectedRuntime,
    selectedProfileId,
    fallbackAllowed: selectedMode !== "local_only",
    reason: "eligible_local_profile",
  };
}
