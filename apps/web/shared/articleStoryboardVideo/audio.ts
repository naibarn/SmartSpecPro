import type {
  ArticleStoryboardAudioStrategy,
  ArticleStoryboardAudioStrategyResolution,
  ArticleStoryboardValidationContext,
  ArticleStoryboardVoiceConfig,
} from "./contracts";

function hasThaiSpeechSupport(supportedLanguages: string[] | undefined, spokenLanguage: string): boolean {
  if (!Array.isArray(supportedLanguages) || supportedLanguages.length === 0) {
    return false;
  }
  const normalized = spokenLanguage.toLowerCase();
  return supportedLanguages.some((language) => {
    const value = language.toLowerCase();
    return value === normalized || value === "th" || value === "thai" || value === "th-th";
  });
}

export function getPrimaryBuilderAudioStrategies(): ArticleStoryboardAudioStrategy[] {
  return ["separate_tts_voiceover", "native_video_audio"];
}

export function validateArticleStoryboardVoiceConfig(
  voiceConfig: ArticleStoryboardVoiceConfig,
): { valid: boolean; reasonCode: "ok" | "voice_mode_unsupported" | "voice_id_missing"; message: string } {
  if (voiceConfig.mode !== "single_narrator" && voiceConfig.mode !== "two_speaker_dialogue") {
    return {
      valid: false,
      reasonCode: "voice_mode_unsupported",
      message: "Selected voice mode is not supported.",
    };
  }

  const requiredSpeakers = voiceConfig.mode === "two_speaker_dialogue" ? 2 : 1;
  const speakers = voiceConfig.speakers.slice(0, requiredSpeakers);
  if (speakers.length < requiredSpeakers || speakers.some((speaker) => !speaker.voiceId || !speaker.voiceModelId)) {
    return {
      valid: false,
      reasonCode: "voice_id_missing",
      message: "Select a voice model and voice ID for every required speaker.",
    };
  }

  if (voiceConfig.mode === "two_speaker_dialogue") {
    const uniqueVoiceIds = new Set(speakers.map((speaker) => speaker.voiceId));
    if (uniqueVoiceIds.size < 2) {
      return {
        valid: false,
        reasonCode: "voice_id_missing",
        message: "Two-speaker dialogue requires two distinct voice IDs.",
      };
    }
  }

  return { valid: true, reasonCode: "ok", message: "Voice configuration is valid." };
}

export function resolveArticleStoryboardAudioStrategy(
  context: ArticleStoryboardValidationContext,
): ArticleStoryboardAudioStrategyResolution {
  const requested = context.requestedAudioStrategy ?? "separate_tts_voiceover";
  const spokenLanguage = context.spokenLanguage ?? "th-TH";
  const nativeAudioAllowed = Boolean(
    context.featureFlags.presentationArticleStoryboardVideoNativeAudio
      && context.videoModel.accessible
      && context.videoModel.supportsNativeAudio
      && hasThaiSpeechSupport(context.videoModel.supportedSpeechLanguages, spokenLanguage),
  );
  const voiceConfigResult = validateArticleStoryboardVoiceConfig(context.voiceConfig);
  const separateTtsAllowed = Boolean(
    context.voiceModel?.accessible
      && context.voiceModel.available !== false
      && voiceConfigResult.valid,
  );

  if (requested === "silent") {
    return {
      requested,
      resolved: "silent",
      reasonCode: "ok",
      message: "Silent mode is reserved for explicitly muted or legacy projects.",
      nativeAudioAllowed,
      separateTtsAllowed,
      fallbackOffered: [],
    };
  }

  if (requested === "native_video_audio") {
    if (!context.featureFlags.presentationArticleStoryboardVideoNativeAudioPromptComposer) {
      return {
        requested,
        resolved: null,
        reasonCode: "native_audio_prompt_composer_disabled",
        message: "Native video audio prompt composer is disabled.",
        nativeAudioAllowed,
        separateTtsAllowed,
        fallbackOffered: separateTtsAllowed ? ["separate_tts_voiceover"] : [],
      };
    }
    if (!nativeAudioAllowed) {
      return {
        requested,
        resolved: null,
        reasonCode: "native_audio_unsupported",
        message: "Selected video model does not support native audio for the requested language.",
        nativeAudioAllowed,
        separateTtsAllowed,
        fallbackOffered: separateTtsAllowed ? ["separate_tts_voiceover"] : [],
      };
    }
    return {
      requested,
      resolved: "native_video_audio",
      reasonCode: "ok",
      message: "Native video audio is available.",
      nativeAudioAllowed,
      separateTtsAllowed,
      fallbackOffered: [],
    };
  }

  if (!voiceConfigResult.valid) {
    return {
      requested,
      resolved: null,
      reasonCode: voiceConfigResult.reasonCode,
      message: voiceConfigResult.message,
      nativeAudioAllowed,
      separateTtsAllowed,
      fallbackOffered: nativeAudioAllowed ? ["native_video_audio"] : [],
    };
  }

  if (!context.voiceModel?.accessible) {
    return {
      requested,
      resolved: null,
      reasonCode: "voice_model_inaccessible",
      message: "Selected voice model is not available for this tenant.",
      nativeAudioAllowed,
      separateTtsAllowed,
      fallbackOffered: nativeAudioAllowed ? ["native_video_audio"] : [],
    };
  }

  if (context.voiceModel.available === false && context.voiceModel.provider === "uvoice_premium") {
    return {
      requested,
      resolved: null,
      reasonCode: "uvoice_unavailable",
      message: "UVoice premium is unavailable. Choose an explicit fallback before continuing.",
      nativeAudioAllowed,
      separateTtsAllowed,
      fallbackOffered: nativeAudioAllowed ? ["native_video_audio"] : [],
    };
  }

  return {
    requested,
    resolved: "separate_tts_voiceover",
    reasonCode: "ok",
    message: "Separate TTS voiceover is available.",
    nativeAudioAllowed,
    separateTtsAllowed,
    fallbackOffered: [],
    ttsRenderStrategy: context.voiceConfig.mode === "two_speaker_dialogue"
      ? context.voiceModel?.supportsDialogue
        ? "single_request_dialogue"
        : "segment_then_merge"
      : "single_request",
  };
}
