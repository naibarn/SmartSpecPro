import type { TenantFeatureFlags } from "../featureFlags";

export const ARTICLE_STORYBOARD_VIDEO_FLAG_KEYS = [
  "presentationArticleStoryboardVideo",
  "presentationArticleStoryboardVideoPreview",
  "presentationArticleStoryboardVideoOverlay",
  "presentationArticleStoryboardVideoReferenceFrames",
  "presentationArticleStoryboardVideoCharacterReferences",
  "presentationArticleStoryboardVideoSeedancePrompt",
  "presentationArticleStoryboardVideoVoiceScript",
  "presentationArticleStoryboardVideoUvoiceVoiceover",
  "presentationArticleStoryboardVideoElevenLabsDialogue",
  "presentationArticleStoryboardVideoNativeAudio",
  "presentationArticleStoryboardVideoNativeAudioPromptComposer",
] as const;

export type ArticleStoryboardVideoFlagKey = typeof ARTICLE_STORYBOARD_VIDEO_FLAG_KEYS[number];

export type ArticleStoryboardAudioStrategy =
  | "separate_tts_voiceover"
  | "native_video_audio"
  | "silent";

export type ArticleStoryboardVoiceMode = "single_narrator" | "two_speaker_dialogue";

export type ArticleStoryboardVoiceProvider = "uvoice_premium" | "elevenlabs" | "other_tts";

export type ArticleStoryboardTtsRenderStrategy = "single_request" | "segment_then_merge" | "single_request_dialogue";

export type ArticleStoryboardPreviewReasonCode =
  | "ok"
  | "feature_flag_off"
  | "missing_pages"
  | "missing_skill"
  | "video_model_inaccessible"
  | "voice_model_inaccessible"
  | "reference_count_invalid"
  | "character_reference_invalid"
  | "voice_mode_unsupported"
  | "voice_id_missing"
  | "native_audio_unsupported"
  | "native_audio_prompt_composer_disabled"
  | "credit_estimate_unavailable"
  | "uvoice_unavailable"
  | "overlay_normalization_failed"
  | "unsafe_provider_metadata";

export type ArticleStoryboardVideoWarningCode =
  | "overlay_text_long"
  | "timing_estimated"
  | "timing_mismatch"
  | "missing_voice_id_recoverable"
  | "legacy_metadata_defaults"
  | "reference_candidates_stale"
  | "video_prompt_stale";

export interface ArticleStoryboardArticlePageInput {
  id?: string | number | null;
  pageNumber?: number | null;
  title?: string | null;
  heading?: string | null;
  subtitle?: string | null;
  summary?: string | null;
  keyText?: string | null;
  body?: string | null;
  text?: string | null;
  slideImageUrl?: string | null;
}

export interface ArticleStoryboardOverlayPlan {
  id: string;
  preset: "lower_third" | "center_title" | "top_caption";
  headline: string;
  subtext: string;
  css: Record<string, string | number>;
  source: "article_title" | "article_heading" | "article_summary" | "fallback";
  warningCodes: ArticleStoryboardVideoWarningCode[];
}

export interface ArticleStoryboardReferenceImage {
  id: string;
  url: string;
  label?: string;
  source: "generated_3x3" | "uploaded" | "library" | "slide_fallback" | "character";
  confirmed?: boolean;
  safetyStatus?: "approved" | "pending" | "blocked";
  primary?: boolean;
  metadata?: Record<string, unknown>;
}

export interface ArticleStoryboardVideoShotPlan {
  id: string;
  pageId: string;
  pageNumber: number;
  articleTitle: string;
  articleText: string;
  overlay: ArticleStoryboardOverlayPlan;
  durationSeconds: number;
  selectedReferenceImages: ArticleStoryboardReferenceImage[];
  characterReferenceImages: ArticleStoryboardReferenceImage[];
  staticSlideFallbackUrl?: string;
  warningCodes: ArticleStoryboardVideoWarningCode[];
  nativeSpeechLineCount: number;
  speakerSegmentCount: number;
  stale: {
    candidateSheet: boolean;
    videoPrompt: boolean;
  };
}

export interface ArticleStoryboardVoiceSpeaker {
  speaker: string;
  voiceId?: string;
  voiceModelId?: string;
}

export interface ArticleStoryboardVoiceConfig {
  mode: ArticleStoryboardVoiceMode;
  provider?: ArticleStoryboardVoiceProvider;
  voiceModelId?: string;
  speakers: ArticleStoryboardVoiceSpeaker[];
}

export interface ArticleStoryboardVideoModelCapability {
  provider?: string;
  modelId: string;
  accessible: boolean;
  supportsNativeAudio?: boolean;
  supportedSpeechLanguages?: string[];
}

export interface ArticleStoryboardVoiceModelCapability {
  provider: ArticleStoryboardVoiceProvider;
  modelId: string;
  accessible: boolean;
  available?: boolean;
  supportsDialogue?: boolean;
}

export interface ArticleStoryboardAudioStrategyResolution {
  requested: ArticleStoryboardAudioStrategy;
  resolved: ArticleStoryboardAudioStrategy | null;
  reasonCode: ArticleStoryboardPreviewReasonCode;
  message: string;
  nativeAudioAllowed: boolean;
  separateTtsAllowed: boolean;
  fallbackOffered: ArticleStoryboardAudioStrategy[];
  ttsRenderStrategy?: ArticleStoryboardTtsRenderStrategy;
}

export interface ArticleStoryboardCreditBreakdownItem {
  category:
    | "reference_generation"
    | "character_reference_processing"
    | "video_generation"
    | "native_video_audio"
    | "tts"
    | "audio_merge"
    | "render";
  estimatedCredits?: number;
  provider?: string;
  modelId?: string;
  basis?: "shots" | "seconds" | "characters" | "segments" | "provider_estimate";
  notes?: string[];
}

export interface ArticleStoryboardAccessDecision {
  allowed: boolean;
  reasonCode: ArticleStoryboardPreviewReasonCode;
  message: string;
  provider?: string;
  videoModelId?: string;
  voiceModelId?: string;
  audioStrategy: ArticleStoryboardAudioStrategy;
  nativeAudioAllowed: boolean;
  separateTtsAllowed: boolean;
  missingFeatureFlags: ArticleStoryboardVideoFlagKey[];
}

export interface ArticleStoryboardAudioEstimate {
  audioStrategy: ArticleStoryboardAudioStrategy;
  modelPreference?: ArticleStoryboardVoiceProvider;
  estimatedCharacters: number;
  estimatedNativeSpeechSeconds?: number;
  estimatedTtsSegments?: number;
  estimatedCredits?: number;
  notes: string[];
}

export interface ArticleStoryboardVideoPreview {
  shots: ArticleStoryboardVideoShotPlan[];
  accessDecision: ArticleStoryboardAccessDecision;
  audioEstimate: ArticleStoryboardAudioEstimate;
  creditBreakdown: ArticleStoryboardCreditBreakdownItem[];
  warnings: ArticleStoryboardVideoWarningCode[];
}

export interface ArticleStoryboardPlanningOptions {
  pages: ArticleStoryboardArticlePageInput[];
  selectedReferenceImagesByPageId?: Record<string, ArticleStoryboardReferenceImage[]>;
  characterReferenceImagesByPageId?: Record<string, ArticleStoryboardReferenceImage[]>;
  durationSeconds?: number;
}

export interface ArticleStoryboardValidationContext {
  featureFlags: Pick<TenantFeatureFlags, ArticleStoryboardVideoFlagKey>;
  requiredFlags?: ArticleStoryboardVideoFlagKey[];
  videoModel: ArticleStoryboardVideoModelCapability;
  voiceModel?: ArticleStoryboardVoiceModelCapability | null;
  requestedAudioStrategy?: ArticleStoryboardAudioStrategy;
  voiceConfig: ArticleStoryboardVoiceConfig;
  spokenLanguage?: string;
  requiredSkills?: {
    seedancePrompt?: boolean;
    voiceScript?: boolean;
  };
  creditEstimateAvailable?: boolean;
}
