import type {
  ArticleStoryboardAudioStrategy,
  ArticleStoryboardOverlayPlan,
  ArticleStoryboardReferenceImage,
  ArticleStoryboardTtsRenderStrategy,
  ArticleStoryboardVideoWarningCode,
  ArticleStoryboardVoiceConfig,
  ArticleStoryboardVoiceMode,
} from "./contracts";

export interface ArticleStoryboardReviewMetadata {
  schemaVersion: number;
  isArticleStoryboardVideo: true;
  overlay: ArticleStoryboardOverlayPlan;
  audioStrategy: ArticleStoryboardAudioStrategy;
  requestedAudioStrategy?: ArticleStoryboardAudioStrategy;
  resolvedAudioStrategy?: ArticleStoryboardAudioStrategy | null;
  audioReasonCode?: string;
  nativeAudioAllowed?: boolean;
  separateTtsAllowed?: boolean;
  ttsRenderStrategy?: ArticleStoryboardTtsRenderStrategy;
  voiceConfig: ArticleStoryboardVoiceConfig;
  imageReferencePrompt?: string | null;
  generatedImageReferencePrompt?: string | null;
  videoPrompt?: string | null;
  generatedVideoPrompt?: string | null;
  videoPromptOverride?: string | null;
  currentVideoPrompt?: string | null;
  currentPromptSource?: "initial" | "regenerated" | "manual_edit" | string;
  currentPromptUpdatedAt?: string | null;
  reviewPromptEditedAt?: string | null;
  promptSource?: "initial" | "regenerated" | "manual_edit" | string;
  selectedReferenceImages: ArticleStoryboardReferenceImage[];
  characterReferenceImages: ArticleStoryboardReferenceImage[];
  staticSlideFallbackUrl?: string | null;
  scriptSegments: Array<{ speaker?: string; text: string; shotId?: string }>;
  timing: {
    plannedDurationSeconds?: number | null;
    measuredDurationSeconds?: number | null;
    timingSource?: string | null;
  };
  warningCodes: ArticleStoryboardVideoWarningCode[];
}

export interface ArticleStoryboardOverlayUpdate {
  preset?: ArticleStoryboardOverlayPlan["preset"];
  headline?: string;
  subtext?: string;
}

export interface ArticleStoryboardVoiceUpdate {
  voiceModelId?: string;
  speakerVoiceIds?: Record<number, string>;
}

const ARTICLE_STORYBOARD_SOURCE = "presentation_article_storyboard_video";
const SAFE_OVERLAY_PRESETS: ArticleStoryboardOverlayPlan["preset"][] = ["lower_third", "center_title"];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown, maxLength = 180): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanPromptText(value: unknown, maxLength = 12000): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, maxLength);
}

function cleanAudioStrategy(value: unknown): ArticleStoryboardAudioStrategy {
  return value === "native_video_audio" || value === "silent"
    ? value
    : "separate_tts_voiceover";
}

function cleanVoiceMode(value: unknown): ArticleStoryboardVoiceMode {
  return value === "two_speaker_dialogue" ? value : "single_narrator";
}

function cleanTtsRenderStrategy(value: unknown): ArticleStoryboardTtsRenderStrategy | undefined {
  return value === "single_request"
    || value === "segment_then_merge"
    || value === "single_request_dialogue"
    ? value
    : undefined;
}

function cleanReferenceImages(value: unknown): ArticleStoryboardReferenceImage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index): ArticleStoryboardReferenceImage | null => {
      const source = record(item);
      const url = cleanText(source?.url, 2000);
      if (!url) return null;
      const referenceSource = source?.source === "character"
        ? "character"
        : source?.source === "uploaded"
          ? "uploaded"
          : source?.source === "library"
            ? "library"
            : source?.source === "slide_fallback"
              ? "slide_fallback"
              : "generated_3x3";
      return {
        id: cleanText(source?.id, 120) || `reference-${index + 1}`,
        url,
        label: cleanText(source?.label, 120) || undefined,
        source: referenceSource,
        confirmed: source?.confirmed === true,
        safetyStatus: source?.safetyStatus === "blocked" || source?.safetyStatus === "pending"
          ? source.safetyStatus
          : "approved",
        primary: source?.primary === true,
        metadata: record(source?.metadata) ?? undefined,
      };
    })
    .filter((item): item is ArticleStoryboardReferenceImage => Boolean(item));
}

function cleanOverlay(value: unknown): ArticleStoryboardOverlayPlan | null {
  const source = record(value);
  if (!source) return null;
  const requestedPreset = source.preset;
  const preset = requestedPreset === "center_title" || requestedPreset === "lower_third"
    ? requestedPreset
    : "lower_third";
  const css = record(source.css) ?? {};
  return {
    id: cleanText(source.id, 120) || "article-overlay",
    preset,
    headline: cleanText(source.headline, 96),
    subtext: cleanText(source.subtext, 180),
    css: {
      fontFamily: cleanText(css.fontFamily, 120) || "Inter, system-ui, sans-serif",
      color: cleanText(css.color, 40) || "#ffffff",
      background: cleanText(css.background, 80) || "rgba(15, 23, 42, 0.72)",
      padding: cleanText(css.padding, 40) || "12px 16px",
      borderRadius: cleanText(css.borderRadius, 40) || "8px",
    },
    source: source.source === "article_heading" || source.source === "article_summary" || source.source === "fallback"
      ? source.source
      : "article_title",
    warningCodes: Array.isArray(source.warningCodes)
      ? source.warningCodes.filter(isArticleStoryboardWarningCode)
      : [],
  };
}

function cleanVoiceConfig(value: unknown): ArticleStoryboardVoiceConfig {
  const source = record(value);
  const speakers = Array.isArray(source?.speakers) ? source.speakers : [];
  return {
    mode: cleanVoiceMode(source?.mode),
    provider: source?.provider === "elevenlabs" || source?.provider === "other_tts"
      ? source.provider
      : "uvoice_premium",
    voiceModelId: cleanText(source?.voiceModelId, 120) || undefined,
    speakers: speakers.map((speaker, index) => {
      const item = record(speaker);
      return {
        speaker: cleanText(item?.speaker, 80) || (index === 0 ? "Narrator" : `Speaker ${index + 1}`),
        voiceId: cleanText(item?.voiceId ?? item?.voiceID, 120) || undefined,
        voiceModelId: cleanText(item?.voiceModelId, 120) || undefined,
      };
    }),
  };
}

function cleanScriptSegments(value: unknown): ArticleStoryboardReviewMetadata["scriptSegments"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((segment): ArticleStoryboardReviewMetadata["scriptSegments"][number] | null => {
      const item = record(segment);
      const text = cleanText(item?.text, 1000);
      if (!text) return null;
      return {
        speaker: cleanText(item?.speaker, 80) || undefined,
        text,
        shotId: cleanText(item?.shotId, 120) || undefined,
      };
    })
    .filter((segment): segment is ArticleStoryboardReviewMetadata["scriptSegments"][number] => segment !== null);
}

function isArticleStoryboardWarningCode(value: unknown): value is ArticleStoryboardVideoWarningCode {
  return value === "overlay_text_long"
    || value === "timing_estimated"
    || value === "timing_mismatch"
    || value === "missing_voice_id_recoverable"
    || value === "legacy_metadata_defaults"
    || value === "reference_candidates_stale"
    || value === "video_prompt_stale";
}

function readTiming(value: unknown): ArticleStoryboardReviewMetadata["timing"] {
  const source = record(value);
  const planned = Number(source?.plannedDurationSeconds);
  const measured = Number(source?.measuredDurationSeconds);
  return {
    plannedDurationSeconds: Number.isFinite(planned) && planned > 0 ? planned : null,
    measuredDurationSeconds: Number.isFinite(measured) && measured > 0 ? measured : null,
    timingSource: cleanText(source?.timingSource, 80) || null,
  };
}

export function getArticleStoryboardReviewMetadata(
  extraParams: Record<string, unknown> | null | undefined,
): ArticleStoryboardReviewMetadata | null {
  const root = record(extraParams);
  const metadata = record(root?.articleStoryboardVideo);
  const overlay = cleanOverlay(root?.overlay);
  if (!metadata || !overlay) return null;
  if (root?.source !== ARTICLE_STORYBOARD_SOURCE && root?.sourceMode !== "article-storyboard-video") return null;

  const audioStrategy = cleanAudioStrategy(metadata.audioStrategy ?? metadata.resolvedAudioStrategy);
  const warnings = new Set<ArticleStoryboardVideoWarningCode>([
    ...overlay.warningCodes,
    ...(Array.isArray(root.warningCodes) ? root.warningCodes.filter(isArticleStoryboardWarningCode) : []),
    ...(Array.isArray(metadata.warningCodes) ? metadata.warningCodes.filter(isArticleStoryboardWarningCode) : []),
  ]);
  const voiceConfig = cleanVoiceConfig(metadata.voiceConfig);
  if (
    audioStrategy === "separate_tts_voiceover" &&
    voiceConfig.speakers.some((speaker) => !speaker.voiceId)
  ) {
    warnings.add("missing_voice_id_recoverable");
  }
  const timing = readTiming(metadata.timing);
  if (
    typeof timing.plannedDurationSeconds === "number" &&
    typeof timing.measuredDurationSeconds === "number" &&
    Math.abs(timing.plannedDurationSeconds - timing.measuredDurationSeconds) > 1.25
  ) {
    warnings.add("timing_mismatch");
  }

  return {
    schemaVersion: Number(metadata.schemaVersion) || 1,
    isArticleStoryboardVideo: true,
    overlay,
    audioStrategy,
    requestedAudioStrategy: cleanAudioStrategy(metadata.requestedAudioStrategy),
    resolvedAudioStrategy: metadata.resolvedAudioStrategy === null ? null : cleanAudioStrategy(metadata.resolvedAudioStrategy),
    audioReasonCode: cleanText(metadata.audioReasonCode, 120) || undefined,
    nativeAudioAllowed: typeof metadata.nativeAudioAllowed === "boolean" ? metadata.nativeAudioAllowed : undefined,
    separateTtsAllowed: typeof metadata.separateTtsAllowed === "boolean" ? metadata.separateTtsAllowed : undefined,
    ttsRenderStrategy: cleanTtsRenderStrategy(metadata.ttsRenderStrategy),
    voiceConfig,
    imageReferencePrompt: cleanPromptText(metadata.imageReferencePrompt) || null,
    generatedImageReferencePrompt: cleanPromptText(metadata.generatedImageReferencePrompt) || null,
    videoPrompt: cleanPromptText(metadata.videoPrompt) || null,
    generatedVideoPrompt: cleanPromptText(metadata.generatedVideoPrompt) || null,
    videoPromptOverride: cleanPromptText(metadata.videoPromptOverride) || null,
    currentVideoPrompt: cleanPromptText(metadata.currentVideoPrompt) || null,
    currentPromptSource: cleanText(metadata.currentPromptSource, 80) || undefined,
    currentPromptUpdatedAt: cleanText(metadata.currentPromptUpdatedAt ?? metadata.reviewPromptEditedAt, 80) || null,
    reviewPromptEditedAt: cleanText(metadata.reviewPromptEditedAt, 80) || null,
    promptSource: cleanText(metadata.promptSource, 80) || undefined,
    selectedReferenceImages: cleanReferenceImages(metadata.selectedReferenceImages),
    characterReferenceImages: cleanReferenceImages(metadata.characterReferenceImages),
    staticSlideFallbackUrl: cleanText(metadata.staticSlideFallbackUrl, 2000) || null,
    scriptSegments: cleanScriptSegments(metadata.scriptSegments),
    timing,
    warningCodes: Array.from(warnings),
  };
}

export function isArticleStoryboardOverlayPresetSafe(
  preset: unknown,
): preset is ArticleStoryboardOverlayPlan["preset"] {
  return SAFE_OVERLAY_PRESETS.includes(preset as ArticleStoryboardOverlayPlan["preset"]);
}

export function isArticleStoryboardOverlayPromptLike(text: string): boolean {
  return /\b(camera|shot|cinematic|prompt|seedance|veo|generate|reference image|css)\b/i.test(text);
}

export function updateArticleStoryboardOverlayMetadata(
  extraParams: Record<string, unknown>,
  update: ArticleStoryboardOverlayUpdate,
): Record<string, unknown> {
  const current = getArticleStoryboardReviewMetadata(extraParams);
  if (!current) return extraParams;
  const nextPreset = isArticleStoryboardOverlayPresetSafe(update.preset)
    ? update.preset
    : current.overlay.preset;
  const headline = cleanText(update.headline ?? current.overlay.headline, 96);
  const subtext = cleanText(update.subtext ?? current.overlay.subtext, 180);
  const warningCodes = new Set<ArticleStoryboardVideoWarningCode>(current.overlay.warningCodes);
  if (isArticleStoryboardOverlayPromptLike(`${headline} ${subtext}`)) {
    warningCodes.add("overlay_text_long");
  }
  return {
    ...extraParams,
    overlay: {
      ...current.overlay,
      preset: nextPreset,
      headline,
      subtext,
      warningCodes: Array.from(warningCodes),
    },
    articleStoryboardVideo: {
      ...(record(extraParams.articleStoryboardVideo) ?? {}),
      overlayUpdatedAt: Date.now(),
    },
  };
}

export function updateArticleStoryboardVoiceMetadata(
  extraParams: Record<string, unknown>,
  update: ArticleStoryboardVoiceUpdate,
): Record<string, unknown> {
  const current = getArticleStoryboardReviewMetadata(extraParams);
  if (!current) return extraParams;
  const voiceModelId = cleanText(update.voiceModelId ?? current.voiceConfig.voiceModelId, 120);
  const speakers = current.voiceConfig.speakers.map((speaker, index) => ({
    ...speaker,
    voiceModelId: voiceModelId || speaker.voiceModelId,
    voiceId: Object.prototype.hasOwnProperty.call(update.speakerVoiceIds ?? {}, index)
      ? cleanText(update.speakerVoiceIds?.[index], 120) || undefined
      : speaker.voiceId,
  }));
  return {
    ...extraParams,
    articleStoryboardVideo: {
      ...(record(extraParams.articleStoryboardVideo) ?? {}),
      voiceConfig: {
        ...current.voiceConfig,
        voiceModelId: voiceModelId || undefined,
        speakers,
      },
      voiceConfigUpdatedAt: Date.now(),
      ttsAudioStale: true,
    },
  };
}

export function updateArticleStoryboardCurrentPromptMetadata(
  extraParams: Record<string, unknown>,
  currentPrompt: string,
  source = "manual_edit",
): Record<string, unknown> {
  const current = getArticleStoryboardReviewMetadata(extraParams);
  if (!current) return extraParams;
  const prompt = cleanPromptText(currentPrompt);
  if (!prompt) return extraParams;
  const updatedAt = new Date().toISOString();
  const articleStoryboardVideo: Record<string, unknown> = {
    ...(record(extraParams.articleStoryboardVideo) ?? {}),
    currentVideoPrompt: prompt,
    currentPromptSource: source,
    currentPromptUpdatedAt: updatedAt,
  };
  if (source === "manual_edit") {
    articleStoryboardVideo.reviewPromptEditedAt = updatedAt;
  } else {
    delete articleStoryboardVideo.reviewPromptEditedAt;
  }
  return {
    ...extraParams,
    promptSource: source,
    articleStoryboardVideo,
  };
}
