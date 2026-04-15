import type { CapabilityResult } from "../capability/index.ts";
import type {
  LocalAiConversationOverride,
  LocalAiExecutionMode,
  LocalAiSyncedPreferences,
  LocalAiTaskClass,
  LocalAiVoiceInputMode,
} from "../runtime-types/index.ts";

export interface RuntimeDecisionEnvelope {
  taskClass: LocalAiTaskClass;
  userPreferences: LocalAiSyncedPreferences;
  conversationOverride?: LocalAiConversationOverride | null;
  capability: CapabilityResult;
  selectedMode: LocalAiExecutionMode;
  selectedRuntime: "cloud" | "hybrid" | "local";
  selectedProfileId?: string | null;
  fallbackAllowed: boolean;
  reason: string;
}

export function resolveConversationLocalAiMode(
  preferences: LocalAiSyncedPreferences,
  override?: LocalAiConversationOverride | null,
): LocalAiExecutionMode {
  if (override?.disableForConversation) {
    return "cloud_only";
  }

  return override?.mode ?? preferences.mode;
}

export function resolveExplicitChatSessionLocalAiMode(
  override?: LocalAiConversationOverride | null,
): LocalAiExecutionMode {
  if (override?.disableForConversation) {
    return "cloud_only";
  }

  if (override?.mode === "local_only") {
    return "local_only";
  }

  if (override?.mode === "cloud_only") {
    return "cloud_only";
  }

  // Chat sessions stay on the cloud path unless the conversation explicitly opts into Local AI.
  return "cloud_only";
}

export function resolveConversationPreferredProfileId(
  preferences: LocalAiSyncedPreferences,
  override?: LocalAiConversationOverride | null,
): string | null {
  return override?.preferredProfileId ?? preferences.defaultModelId ?? null;
}

export function resolveConversationVoiceInputMode(
  preferences: LocalAiSyncedPreferences,
  override?: LocalAiConversationOverride | null,
): LocalAiVoiceInputMode {
  return override?.voiceInputMode ?? preferences.voiceInputMode;
}

export function applyConversationLocalAiOverride(
  preferences: LocalAiSyncedPreferences,
  override?: LocalAiConversationOverride | null,
): LocalAiSyncedPreferences {
  return {
    ...preferences,
    mode: resolveConversationLocalAiMode(preferences, override),
    defaultModelId: resolveConversationPreferredProfileId(preferences, override),
    voiceInputMode: resolveConversationVoiceInputMode(preferences, override),
  };
}
