import type {
  ArticleStoryboardAccessDecision,
  ArticleStoryboardAudioEstimate,
  ArticleStoryboardCreditBreakdownItem,
  ArticleStoryboardReferenceImage,
  ArticleStoryboardValidationContext,
  ArticleStoryboardVideoPreview,
  ArticleStoryboardVideoShotPlan,
  ArticleStoryboardVideoWarningCode,
} from "./contracts";
import { getMissingArticleStoryboardVideoFlags } from "./flags";
import {
  estimateArticleStoryboardAudioCharacters,
  estimateArticleStoryboardAudioCredits,
  estimateArticleStoryboardScriptSeconds,
} from "./timing";
import { resolveArticleStoryboardAudioStrategy } from "./audio";

const SIGNED_URL_MARKERS = ["x-amz-signature=", "x-goog-signature=", "x-ms-signature=", "signature="];
const CREDENTIAL_KEYS = ["token", "accessToken", "refreshToken", "oauth", "session", "signedUploadUrl"];

export function validateArticleStoryboardSelectedReferences(
  references: ArticleStoryboardReferenceImage[],
): { valid: boolean; reasonCode: "ok" | "reference_count_invalid"; message: string } {
  if (references.length < 1 || references.length > 5) {
    return {
      valid: false,
      reasonCode: "reference_count_invalid",
      message: "Select between 1 and 5 scene reference images.",
    };
  }
  return { valid: true, reasonCode: "ok", message: "Scene references are valid." };
}

export function validateArticleStoryboardCharacterReferences(
  references: ArticleStoryboardReferenceImage[],
  limit = 5,
): { valid: boolean; reasonCode: "ok" | "character_reference_invalid"; message: string } {
  const invalid = references.find((reference) => {
    if (!reference.url || references.length > limit) {
      return true;
    }
    if (!["uploaded", "library", "character"].includes(reference.source)) {
      return true;
    }
    return reference.confirmed !== true || reference.safetyStatus !== "approved";
  });
  if (invalid || references.length > limit) {
    return {
      valid: false,
      reasonCode: "character_reference_invalid",
      message: "Character references need durable approved URLs and user confirmation.",
    };
  }
  return { valid: true, reasonCode: "ok", message: "Character references are valid." };
}

export function containsUnsafeProviderMetadata(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    return SIGNED_URL_MARKERS.some((marker) => lower.includes(marker));
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(containsUnsafeProviderMetadata);
  }
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => {
    const normalizedKey = key.toLowerCase();
    return CREDENTIAL_KEYS.some((marker) => normalizedKey.includes(marker.toLowerCase()))
      || containsUnsafeProviderMetadata(nested);
  });
}

export function buildArticleStoryboardAudioEstimate(
  shots: ArticleStoryboardVideoShotPlan[],
  context: ArticleStoryboardValidationContext,
): ArticleStoryboardAudioEstimate {
  const audioResolution = resolveArticleStoryboardAudioStrategy(context);
  const audioStrategy = audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover";
  const estimatedCharacters = estimateArticleStoryboardAudioCharacters(shots);
  const estimatedNativeSpeechSeconds = audioStrategy === "native_video_audio"
    ? shots.reduce((sum, shot) => sum + estimateArticleStoryboardScriptSeconds(shot.articleText), 0)
    : undefined;
  const estimatedTtsSegments = audioStrategy === "separate_tts_voiceover"
    ? Math.max(1, shots.length * (context.voiceConfig.mode === "two_speaker_dialogue" ? 2 : 1))
    : undefined;

  return {
    audioStrategy,
    modelPreference: context.voiceModel?.provider,
    estimatedCharacters,
    estimatedNativeSpeechSeconds,
    estimatedTtsSegments,
    estimatedCredits: estimateArticleStoryboardAudioCredits({
      audioStrategy,
      estimatedCharacters,
      estimatedNativeSpeechSeconds,
    }),
    notes: audioResolution.reasonCode === "ok" ? [] : [audioResolution.message],
  };
}

export function buildArticleStoryboardCreditBreakdown(
  shots: ArticleStoryboardVideoShotPlan[],
  audioEstimate: ArticleStoryboardAudioEstimate,
  context: ArticleStoryboardValidationContext,
): ArticleStoryboardCreditBreakdownItem[] {
  const selectedReferenceCount = shots.reduce((sum, shot) => sum + shot.selectedReferenceImages.length, 0);
  const characterReferenceCount = shots.reduce((sum, shot) => sum + shot.characterReferenceImages.length, 0);
  return [
    { category: "reference_generation", basis: "shots", estimatedCredits: shots.length * 0.05 },
    { category: "character_reference_processing", basis: "shots", estimatedCredits: characterReferenceCount * 0.02 },
    {
      category: "video_generation",
      provider: context.videoModel.provider,
      modelId: context.videoModel.modelId,
      basis: "shots",
      estimatedCredits: shots.length,
      notes: selectedReferenceCount === 0 ? ["No selected scene references yet."] : [],
    },
    {
      category: "native_video_audio",
      provider: context.videoModel.provider,
      modelId: context.videoModel.modelId,
      basis: "seconds",
      estimatedCredits: audioEstimate.audioStrategy === "native_video_audio" ? audioEstimate.estimatedCredits : 0,
    },
    {
      category: "tts",
      provider: context.voiceModel?.provider,
      modelId: context.voiceModel?.modelId,
      basis: "characters",
      estimatedCredits: audioEstimate.audioStrategy === "separate_tts_voiceover" ? audioEstimate.estimatedCredits : 0,
    },
    { category: "audio_merge", basis: "segments", estimatedCredits: audioEstimate.estimatedTtsSegments ? 0.01 : 0 },
    { category: "render", basis: "provider_estimate", estimatedCredits: 0.1 },
  ];
}

export function buildArticleStoryboardAccessDecision(
  shots: ArticleStoryboardVideoShotPlan[],
  context: ArticleStoryboardValidationContext,
): ArticleStoryboardAccessDecision {
  const requiredFlags = context.requiredFlags ?? ["presentationArticleStoryboardVideo"];
  const missingFeatureFlags = getMissingArticleStoryboardVideoFlags(context.featureFlags, requiredFlags);
  const audioResolution = resolveArticleStoryboardAudioStrategy(context);

  if (missingFeatureFlags.length > 0) {
    return {
      allowed: false,
      reasonCode: "feature_flag_off",
      message: "Article to Storyboard Video is not enabled for this tenant.",
      provider: context.videoModel.provider,
      videoModelId: context.videoModel.modelId,
      voiceModelId: context.voiceModel?.modelId,
      audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
      nativeAudioAllowed: audioResolution.nativeAudioAllowed,
      separateTtsAllowed: audioResolution.separateTtsAllowed,
      missingFeatureFlags,
    };
  }

  if (shots.length === 0) {
    return {
      allowed: false,
      reasonCode: "missing_pages",
      message: "Add at least one article page before creating a video project.",
      provider: context.videoModel.provider,
      videoModelId: context.videoModel.modelId,
      voiceModelId: context.voiceModel?.modelId,
      audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
      nativeAudioAllowed: audioResolution.nativeAudioAllowed,
      separateTtsAllowed: audioResolution.separateTtsAllowed,
      missingFeatureFlags,
    };
  }

  if (context.requiredSkills?.seedancePrompt === false || context.requiredSkills?.voiceScript === false) {
    return {
      allowed: false,
      reasonCode: "missing_skill",
      message: "Required prompt or voice script skill is unavailable.",
      provider: context.videoModel.provider,
      videoModelId: context.videoModel.modelId,
      voiceModelId: context.voiceModel?.modelId,
      audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
      nativeAudioAllowed: audioResolution.nativeAudioAllowed,
      separateTtsAllowed: audioResolution.separateTtsAllowed,
      missingFeatureFlags,
    };
  }

  if (!context.videoModel.accessible) {
    return {
      allowed: false,
      reasonCode: "video_model_inaccessible",
      message: "Selected video model is not available for this tenant.",
      provider: context.videoModel.provider,
      videoModelId: context.videoModel.modelId,
      voiceModelId: context.voiceModel?.modelId,
      audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
      nativeAudioAllowed: audioResolution.nativeAudioAllowed,
      separateTtsAllowed: audioResolution.separateTtsAllowed,
      missingFeatureFlags,
    };
  }

  for (const shot of shots) {
    const sceneValidation = validateArticleStoryboardSelectedReferences(shot.selectedReferenceImages);
    if (!sceneValidation.valid) {
      return {
        allowed: false,
        reasonCode: sceneValidation.reasonCode,
        message: sceneValidation.message,
        provider: context.videoModel.provider,
        videoModelId: context.videoModel.modelId,
        voiceModelId: context.voiceModel?.modelId,
        audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
        nativeAudioAllowed: audioResolution.nativeAudioAllowed,
        separateTtsAllowed: audioResolution.separateTtsAllowed,
        missingFeatureFlags,
      };
    }

    const characterValidation = validateArticleStoryboardCharacterReferences(shot.characterReferenceImages);
    if (!characterValidation.valid) {
      return {
        allowed: false,
        reasonCode: characterValidation.reasonCode,
        message: characterValidation.message,
        provider: context.videoModel.provider,
        videoModelId: context.videoModel.modelId,
        voiceModelId: context.voiceModel?.modelId,
        audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
        nativeAudioAllowed: audioResolution.nativeAudioAllowed,
        separateTtsAllowed: audioResolution.separateTtsAllowed,
        missingFeatureFlags,
      };
    }
  }

  if (audioResolution.reasonCode !== "ok") {
    return {
      allowed: false,
      reasonCode: audioResolution.reasonCode,
      message: audioResolution.message,
      provider: context.videoModel.provider,
      videoModelId: context.videoModel.modelId,
      voiceModelId: context.voiceModel?.modelId,
      audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
      nativeAudioAllowed: audioResolution.nativeAudioAllowed,
      separateTtsAllowed: audioResolution.separateTtsAllowed,
      missingFeatureFlags,
    };
  }

  if (context.creditEstimateAvailable === false) {
    return {
      allowed: false,
      reasonCode: "credit_estimate_unavailable",
      message: "Credit estimate is required before continuing.",
      provider: context.videoModel.provider,
      videoModelId: context.videoModel.modelId,
      voiceModelId: context.voiceModel?.modelId,
      audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
      nativeAudioAllowed: audioResolution.nativeAudioAllowed,
      separateTtsAllowed: audioResolution.separateTtsAllowed,
      missingFeatureFlags,
    };
  }

  if (containsUnsafeProviderMetadata({ shots, context })) {
    return {
      allowed: false,
      reasonCode: "unsafe_provider_metadata",
      message: "Provider credentials or signed URLs cannot be stored in preview metadata.",
      provider: context.videoModel.provider,
      videoModelId: context.videoModel.modelId,
      voiceModelId: context.voiceModel?.modelId,
      audioStrategy: audioResolution.resolved ?? context.requestedAudioStrategy ?? "separate_tts_voiceover",
      nativeAudioAllowed: audioResolution.nativeAudioAllowed,
      separateTtsAllowed: audioResolution.separateTtsAllowed,
      missingFeatureFlags,
    };
  }

  return {
    allowed: true,
    reasonCode: "ok",
    message: "Ready to create a Storyboard Review project.",
    provider: context.videoModel.provider,
    videoModelId: context.videoModel.modelId,
    voiceModelId: context.voiceModel?.modelId,
    audioStrategy: audioResolution.resolved ?? "separate_tts_voiceover",
    nativeAudioAllowed: audioResolution.nativeAudioAllowed,
    separateTtsAllowed: audioResolution.separateTtsAllowed,
    missingFeatureFlags,
  };
}

export function buildArticleStoryboardVideoPreview(
  shots: ArticleStoryboardVideoShotPlan[],
  context: ArticleStoryboardValidationContext,
): ArticleStoryboardVideoPreview {
  const accessDecision = buildArticleStoryboardAccessDecision(shots, context);
  const audioEstimate = buildArticleStoryboardAudioEstimate(shots, context);
  const warnings = Array.from(
    new Set<ArticleStoryboardVideoWarningCode>(
      shots.flatMap((shot) => shot.warningCodes).concat(audioEstimate.notes.length ? ["timing_estimated"] : []),
    ),
  );
  return {
    shots,
    accessDecision,
    audioEstimate,
    creditBreakdown: buildArticleStoryboardCreditBreakdown(shots, audioEstimate, context),
    warnings,
  };
}
