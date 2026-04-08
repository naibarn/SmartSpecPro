import type { LocalAiSyncedPreferences } from "../types/capability";
import {
  DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
  LOCAL_AI_EXECUTION_MODES,
  LOCAL_AI_HANDS_FREE_MODES,
  LOCAL_AI_VOICE_INPUT_MODES,
  LOCAL_AI_VOICE_READBACK_MODES,
} from "../types/capability";

export { DEFAULT_LOCAL_AI_SYNCED_PREFERENCES };

export function resolveLocalAiSyncedPreferences(
  input: unknown,
): LocalAiSyncedPreferences {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES };
  }

  const candidate = input as Record<string, unknown>;
  const mode =
    typeof candidate.mode === "string" &&
    LOCAL_AI_EXECUTION_MODES.includes(
      candidate.mode as (typeof LOCAL_AI_EXECUTION_MODES)[number],
    )
      ? (candidate.mode as LocalAiSyncedPreferences["mode"])
      : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES.mode;
  const voiceInputMode =
    typeof candidate.voiceInputMode === "string" &&
    LOCAL_AI_VOICE_INPUT_MODES.includes(
      candidate.voiceInputMode as (typeof LOCAL_AI_VOICE_INPUT_MODES)[number],
    )
      ? (candidate.voiceInputMode as LocalAiSyncedPreferences["voiceInputMode"])
      : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES.voiceInputMode;
  const voiceReadbackMode =
    typeof candidate.voiceReadbackMode === "string" &&
    LOCAL_AI_VOICE_READBACK_MODES.includes(
      candidate.voiceReadbackMode as (typeof LOCAL_AI_VOICE_READBACK_MODES)[number],
    )
      ? (
          candidate.voiceReadbackMode as LocalAiSyncedPreferences["voiceReadbackMode"]
        )
      : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES.voiceReadbackMode;
  const handsFreeMode =
    typeof candidate.handsFreeMode === "string" &&
    LOCAL_AI_HANDS_FREE_MODES.includes(
      candidate.handsFreeMode as (typeof LOCAL_AI_HANDS_FREE_MODES)[number],
    )
      ? (candidate.handsFreeMode as LocalAiSyncedPreferences["handsFreeMode"])
      : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES.handsFreeMode;
  const voiceReadbackLanguage =
    typeof candidate.voiceReadbackLanguage === "string" &&
    candidate.voiceReadbackLanguage.trim().length > 0
      ? candidate.voiceReadbackLanguage.trim()
      : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES.voiceReadbackLanguage;
  const voiceReadbackRate =
    typeof candidate.voiceReadbackRate === "number" &&
    Number.isFinite(candidate.voiceReadbackRate)
      ? Math.max(0.5, Math.min(1.5, candidate.voiceReadbackRate))
      : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES.voiceReadbackRate;
  const wakePhrase =
    typeof candidate.wakePhrase === "string" &&
    candidate.wakePhrase.trim().length > 0
      ? candidate.wakePhrase.trim()
      : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES.wakePhrase;

  return {
    ...DEFAULT_LOCAL_AI_SYNCED_PREFERENCES,
    enabled: candidate.enabled === true,
    mode,
    defaultModelId:
      typeof candidate.defaultModelId === "string" &&
      candidate.defaultModelId.trim().length > 0
        ? candidate.defaultModelId.trim()
        : null,
    useForGeneralChat: candidate.useForGeneralChat === true,
    useForSummaries:
      typeof candidate.useForSummaries === "boolean"
        ? candidate.useForSummaries
        : DEFAULT_LOCAL_AI_SYNCED_PREFERENCES.useForSummaries,
    useForImageTasks: candidate.useForImageTasks === true,
    enableVoiceCommands: candidate.enableVoiceCommands === true,
    voiceInputMode,
    voiceReadbackMode,
    voiceReadbackLanguage,
    voiceReadbackRate,
    voiceReadbackOnlyForVoiceCommands:
      candidate.voiceReadbackOnlyForVoiceCommands === true,
    voiceSearchUsesLocation: candidate.voiceSearchUsesLocation === true,
    handsFreeMode,
    wakePhrase,
  };
}
