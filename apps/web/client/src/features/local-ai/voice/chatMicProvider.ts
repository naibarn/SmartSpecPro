import type { LocalAiVoiceInputMode } from "../types/capability";

export interface ChatMicProviderResolution {
  effectiveMode: LocalAiVoiceInputMode;
  fallbackApplied: boolean;
  reason: string;
}

export function resolveChatMicProvider(input: {
  preferredMode: LocalAiVoiceInputMode;
  localVoiceSupported: boolean;
}): ChatMicProviderResolution {
  if (input.preferredMode === "legacy_stt") {
    return {
      effectiveMode: "legacy_stt",
      fallbackApplied: false,
      reason: "legacy_selected",
    };
  }

  if (input.preferredMode === "gemma4_local") {
    if (input.localVoiceSupported) {
      return {
        effectiveMode: "gemma4_local",
        fallbackApplied: false,
        reason: "local_supported",
      };
    }
    return {
      effectiveMode: "gemma4_local",
      fallbackApplied: false,
      reason: "local_explicit_but_unsupported",
    };
  }

  if (input.localVoiceSupported) {
    return {
      effectiveMode: "gemma4_local",
      fallbackApplied: false,
      reason: "auto_promoted_to_local",
    };
  }

  return {
    effectiveMode: "legacy_stt",
    fallbackApplied: true,
    reason: "auto_fallback_to_legacy",
  };
}
