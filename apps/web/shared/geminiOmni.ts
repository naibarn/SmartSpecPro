export const GEMINI_OMNI_VIDEO_MODEL_ID = "gemini-omni-video";
export const GEMINI_OMNI_FLASH_1_1_VIDEO_MODEL_ID = "gemini-omni-flash-1-1";
export const GEMINI_OMNI_FLASH_1_1_PROVIDER_MODEL_ID = "google/gemini-omni-flash-1-1";
export const GEMINI_OMNI_CHARACTER_CAPABILITY = "gemini_omni_character";
export const GEMINI_OMNI_AUDIO_CAPABILITY = "gemini_omni_audio";
export const GEMINI_OMNI_CONTRACT_VERSION = "1.0.0";
export const GEMINI_OMNI_MAX_REFERENCE_UNITS = 7;
export const GEMINI_OMNI_MAX_SOURCE_VIDEOS = 1;
export const GEMINI_OMNI_MAX_CHARACTER_IDS = 3;
export const GEMINI_OMNI_MAX_SOURCE_VIDEO_SECONDS = 30;
export const GEMINI_OMNI_MAX_SOURCE_VIDEO_TRIM_SECONDS = 10;
export const GEMINI_OMNI_MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
export const GEMINI_OMNI_MAX_VIDEO_UPLOAD_BYTES = 100 * 1024 * 1024;

export type GeminiOmniVoiceGender = "female" | "male" | "genderless";

export interface GeminiOmniVoicePreset {
  id: string;
  gender: GeminiOmniVoiceGender;
  tone: string;
  pitch: string;
  description: string;
  recommendedUseCases: string[];
}

export const GEMINI_OMNI_VOICE_PRESETS: readonly GeminiOmniVoicePreset[] = [
  { id: "achernar", gender: "female", tone: "soft", pitch: "high pitch", description: "Soft female voice with a high pitch, gentle timbre, calm pacing, and warm emotion for intimate narration, beauty, wellness, and tender storytelling.", recommendedUseCases: ["beauty", "wellness", "gentle narration"] },
  { id: "achird", gender: "male", tone: "friendly", pitch: "mid pitch", description: "Friendly male voice with a mid pitch, approachable timbre, natural speaking rate, and reassuring energy for explainers, reviews, and product guidance.", recommendedUseCases: ["explainer", "review", "friendly guide"] },
  { id: "algenib", gender: "male", tone: "raspy", pitch: "low pitch", description: "Raspy low-pitched male voice with textured timbre, slower confident pacing, and gritty emotion for dramatic trailers, premium products, and cinematic tension.", recommendedUseCases: ["trailer", "premium", "dramatic"] },
  { id: "algieba", gender: "male", tone: "easygoing", pitch: "mid-low pitch", description: "Easygoing male voice with a mid-low pitch, relaxed timbre, steady speaking rate, and casual warmth for lifestyle, marketplace reviews, and conversational ads.", recommendedUseCases: ["lifestyle", "review", "casual sales"] },
  { id: "alnilam", gender: "male", tone: "steady", pitch: "mid-low pitch", description: "Steady male voice with a mid-low pitch, balanced timbre, measured pacing, and reliable emotion for brand films, corporate stories, and instructional content.", recommendedUseCases: ["brand film", "corporate", "instructional"] },
  { id: "aoede", gender: "female", tone: "brisk", pitch: "mid pitch", description: "Brisk female voice with a mid pitch, crisp timbre, quick speaking rate, and energetic emotion for short-form ads, launches, promos, and social hooks.", recommendedUseCases: ["short ads", "promo", "social hook"] },
  { id: "autonoe", gender: "female", tone: "bright", pitch: "mid pitch", description: "Bright female voice with a mid pitch, clear timbre, upbeat pacing, and optimistic emotion for cheerful product demos, education, and family-friendly stories.", recommendedUseCases: ["demo", "education", "family"] },
  { id: "callirrhoe", gender: "female", tone: "easygoing", pitch: "mid pitch", description: "Easygoing female voice with a mid pitch, relaxed timbre, natural pace, and friendly warmth for UGC-style reviews, daily lifestyle, and soft selling.", recommendedUseCases: ["UGC", "lifestyle", "soft sell"] },
  { id: "charon", gender: "male", tone: "intellectual", pitch: "low pitch", description: "Intellectual low-pitched male voice with precise timbre, controlled speaking rate, and thoughtful emotion for documentaries, analysis, expert reviews, and premium explainers.", recommendedUseCases: ["documentary", "analysis", "expert"] },
  { id: "despina", gender: "female", tone: "smooth", pitch: "mid pitch", description: "Smooth female voice with a mid pitch, polished timbre, fluid pacing, and elegant emotion for luxury, skincare, fashion, and cinematic brand narration.", recommendedUseCases: ["luxury", "fashion", "skincare"] },
  { id: "enceladus", gender: "male", tone: "breathy", pitch: "low pitch", description: "Breathy low-pitched male voice with airy timbre, slower intimate pacing, and moody emotion for suspense, atmospheric films, and premium night-time storytelling.", recommendedUseCases: ["suspense", "atmospheric", "premium"] },
  { id: "erinome", gender: "female", tone: "clear", pitch: "mid pitch", description: "Clear female voice with a mid pitch, articulate timbre, balanced speaking rate, and confident emotion for tutorials, product education, and trustworthy guides.", recommendedUseCases: ["tutorial", "education", "trust"] },
  { id: "fenrir", gender: "male", tone: "lively", pitch: "younger pitch", description: "Lively young male voice with energetic timbre, fast natural pacing, and playful emotion for TikTok-style content, gaming, youth products, and quick demos.", recommendedUseCases: ["TikTok", "gaming", "youth"] },
  { id: "gacrux", gender: "female", tone: "mature", pitch: "mid pitch", description: "Mature female voice with a mid pitch, grounded timbre, measured pace, and composed emotion for authority, health, finance, and premium trust-building stories.", recommendedUseCases: ["authority", "health", "finance"] },
  { id: "iapetus", gender: "male", tone: "clear", pitch: "mid-low pitch", description: "Clear male voice with a mid-low pitch, articulate timbre, steady rate, and confident emotion for product specs, comparisons, how-to content, and professional demos.", recommendedUseCases: ["comparison", "how-to", "professional"] },
  { id: "kore", gender: "female", tone: "capable", pitch: "mid pitch", description: "Capable female voice with a mid pitch, competent timbre, purposeful pace, and assured emotion for productivity, SaaS, business, and practical product walkthroughs.", recommendedUseCases: ["SaaS", "business", "walkthrough"] },
  { id: "laomedeia", gender: "female", tone: "cheerful", pitch: "mid-high pitch", description: "Cheerful female voice with a mid-high pitch, lively timbre, upbeat speaking rate, and joyful emotion for promos, gifts, food, travel, and bright social videos.", recommendedUseCases: ["promo", "food", "travel"] },
  { id: "leda", gender: "female", tone: "young", pitch: "mid-high pitch", description: "Young female voice with a mid-high pitch, fresh timbre, quick friendly pacing, and expressive emotion for trend content, beauty, fashion, and creator-style narration.", recommendedUseCases: ["trend", "beauty", "creator"] },
  { id: "orus", gender: "male", tone: "steady", pitch: "mid-low pitch", description: "Steady male voice with a mid-low pitch, stable timbre, controlled pacing, and dependable emotion for training, product proof, technical demos, and grounded narration.", recommendedUseCases: ["training", "technical", "proof"] },
  { id: "puck", gender: "male", tone: "cheerful", pitch: "mid pitch", description: "Cheerful male voice with a mid pitch, upbeat timbre, lively speaking rate, and playful emotion for fun product videos, family content, and casual ads.", recommendedUseCases: ["fun ads", "family", "casual"] },
  { id: "pulcherrima", gender: "genderless", tone: "forward", pitch: "mid-high pitch", description: "Forward genderless voice with a mid-high pitch, direct timbre, crisp pacing, and confident energy for tech, futuristic brand films, announcements, and bold CTAs.", recommendedUseCases: ["tech", "announcement", "bold CTA"] },
  { id: "rasalgethi", gender: "male", tone: "intellectual", pitch: "mid pitch", description: "Intellectual male voice with a mid pitch, thoughtful timbre, moderate pace, and analytical emotion for educational videos, research-backed claims, and expert storytelling.", recommendedUseCases: ["education", "research", "expert"] },
  { id: "sadachbia", gender: "male", tone: "vivid", pitch: "low pitch", description: "Vivid low-pitched male voice with expressive timbre, dramatic pacing, and high-impact emotion for cinematic ads, action stories, and strong product reveals.", recommendedUseCases: ["cinematic", "action", "reveal"] },
  { id: "sadaltager", gender: "male", tone: "knowledgeable", pitch: "mid pitch", description: "Knowledgeable male voice with a mid pitch, informative timbre, clear pacing, and credible emotion for explainers, product education, tutorials, and buyer guidance.", recommendedUseCases: ["explainer", "tutorial", "buyer guide"] },
  { id: "schedar", gender: "male", tone: "smooth", pitch: "mid-low pitch", description: "Smooth male voice with a mid-low pitch, polished timbre, relaxed pacing, and refined emotion for luxury, travel, real estate, and premium brand stories.", recommendedUseCases: ["luxury", "travel", "real estate"] },
  { id: "sulafat", gender: "female", tone: "warm", pitch: "mid pitch", description: "Warm female voice with a mid pitch, comforting timbre, natural speaking rate, and caring emotion for home, parenting, wellness, and trust-building product stories.", recommendedUseCases: ["home", "parenting", "wellness"] },
  { id: "umbriel", gender: "male", tone: "smooth", pitch: "low pitch", description: "Smooth low-pitched male voice with rich timbre, slower elegant pacing, and calm emotion for premium narration, cinematic voiceover, and sophisticated brand films.", recommendedUseCases: ["premium", "cinematic", "sophisticated"] },
  { id: "vindemiatrix", gender: "female", tone: "gentle", pitch: "mid pitch", description: "Gentle female voice with a mid pitch, soft timbre, relaxed pacing, and empathetic emotion for sensitive topics, wellness, customer care, and heartfelt storytelling.", recommendedUseCases: ["sensitive", "customer care", "heartfelt"] },
  { id: "zephyr", gender: "female", tone: "bright", pitch: "mid-high pitch", description: "Bright female voice with a mid-high pitch, sparkling timbre, lively pace, and optimistic emotion for energetic ads, launches, social videos, and fresh brand content.", recommendedUseCases: ["launch", "social", "fresh brand"] },
  { id: "zubenelgenubi", gender: "male", tone: "casual", pitch: "mid-low pitch", description: "Casual male voice with a mid-low pitch, conversational timbre, natural pacing, and relaxed emotion for UGC reviews, marketplace selling, and everyday demos.", recommendedUseCases: ["UGC", "marketplace", "everyday demo"] },
];

export const GEMINI_OMNI_VOICE_PRESET_IDS = new Set(GEMINI_OMNI_VOICE_PRESETS.map((preset) => preset.id));

export function getGeminiOmniVoicePreset(id: string | null | undefined): GeminiOmniVoicePreset | undefined {
  const normalized = String(id ?? "").trim().toLowerCase();
  return GEMINI_OMNI_VOICE_PRESETS.find((preset) => preset.id === normalized);
}

export function isGeminiOmniVoicePresetId(id: string | null | undefined): boolean {
  return Boolean(getGeminiOmniVoicePreset(id));
}

export type GeminiOmniReferenceVideoInput =
  | string
  | {
      url?: string;
      video_url?: string;
      videoUrl?: string;
      start?: number | string;
      starts?: number | string;
      start_time?: number | string;
      startTime?: number | string;
      end?: number | string;
      ends?: number | string;
      end_time?: number | string;
      endTime?: number | string;
      durationSeconds?: number | string;
      duration_seconds?: number | string;
    };

export interface GeminiOmniVideoValidationInput {
  modelId?: unknown;
  prompt?: string | null;
  imageUrls?: unknown;
  videoList?: unknown;
  referenceVideoUrls?: unknown;
  referenceVideoUrl?: unknown;
  characterIds?: unknown;
  audioIds?: unknown;
  duration?: unknown;
  resolution?: unknown;
  firstFrameUrl?: unknown;
  lastFrameUrl?: unknown;
}

export interface GeminiOmniNormalizedVideoInput {
  prompt: string;
  imageUrls: string[];
  videoList: Array<{ url: string; start?: number | string; ends?: number | string; durationSeconds?: number | string }>;
  characterIds: string[];
  audioIds: string[];
  duration: "4" | "6" | "8" | "10";
  resolution: "360p" | "720p" | "1080p" | "4K";
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  referenceUnitCount: number;
  hasSourceVideo: boolean;
  pricingPresenceLabel: "with-video" | "without-video";
  pricingDurationKey: "4s" | "6s" | "8s" | "10s";
}

export interface GeminiOmniValidationIssue {
  code:
    | "prompt_required"
    | "invalid_image_url"
    | "too_many_videos"
    | "invalid_video_url"
    | "invalid_video_trim"
    | "source_video_too_long"
    | "too_many_characters"
    | "invalid_character_id"
    | "invalid_audio_id"
    | "reference_unit_limit"
    | "unsupported_duration"
    | "unsupported_resolution"
    | "invalid_first_frame_url"
    | "invalid_last_frame_url"
    | "last_frame_requires_first_frame"
    | "first_last_frame_conflict";
  message: string;
  field?: string;
}

export interface GeminiOmniValidationResult {
  ok: boolean;
  normalized: GeminiOmniNormalizedVideoInput;
  issues: GeminiOmniValidationIssue[];
}

export interface GeminiOmniProductionNodeReference {
  kind: "source_video" | "reference_image" | "product_image" | "character_asset" | "audio_asset";
  url?: string;
  assetId?: string;
  outputRefId?: string;
  providerPayloadKey?: "video_list" | "image_urls" | "character_ids" | "audio_ids" | string;
  referenceUnitWeight?: number;
}

export interface GeminiOmniProductionNodeCapabilityInput {
  prompt?: string | null;
  references: GeminiOmniProductionNodeReference[];
  duration?: unknown;
  resolution?: unknown;
}

const SUPPORTED_DURATIONS = new Set(["4", "6", "8", "10"]);
const LEGACY_SUPPORTED_RESOLUTIONS = new Set(["720p", "1080p", "4K"]);
const FLASH_1_1_SUPPORTED_RESOLUTIONS = new Set(["360p", "720p", "1080p", "4K"]);
const SAFE_RELATIVE_MEDIA_PREFIXES = ["/uploads/", "/api/storage/files/"] as const;

function isUnsafeLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost"
    || normalized === "0.0.0.0"
    || normalized === "::1"
    || normalized.endsWith(".local")
    || normalized.endsWith(".internal")
    || normalized === "metadata.google.internal"
  ) {
    return true;
  }
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) {
    return true;
  }
  const private172 = normalized.match(/^172\.(\d{1,2})\./);
  if (private172) {
    const secondOctet = Number(private172[1]);
    return secondOctet >= 16 && secondOctet <= 31;
  }
  return normalized === "169.254.169.254" || /^169\.254\./.test(normalized);
}

function normalizeStringList(value: unknown): string[] {
  const rawItems = Array.isArray(value) ? value : value ? [value] : [];
  return rawItems
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

export function isGeminiOmniVideoModelId(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === GEMINI_OMNI_VIDEO_MODEL_ID
    || normalized === "gemini-omni"
    || normalized === "gemini_omni_video"
    || normalized === GEMINI_OMNI_FLASH_1_1_VIDEO_MODEL_ID
    || normalized === GEMINI_OMNI_FLASH_1_1_PROVIDER_MODEL_ID
    || normalized === "gemini_omni_flash_1_1";
}

export function isGeminiOmniFlash11VideoModelId(value: unknown): boolean {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === GEMINI_OMNI_FLASH_1_1_VIDEO_MODEL_ID
    || normalized === GEMINI_OMNI_FLASH_1_1_PROVIDER_MODEL_ID
    || normalized === "gemini_omni_flash_1_1";
}

export function normalizeGeminiOmniDuration(value: unknown): "4" | "6" | "8" | "10" {
  const normalized = String(value ?? "4").trim().replace(/s$/i, "");
  return SUPPORTED_DURATIONS.has(normalized) ? normalized as "4" | "6" | "8" | "10" : "4";
}

export function normalizeGeminiOmniResolution(value: unknown): "360p" | "720p" | "1080p" | "4K" {
  const raw = String(value ?? "1080p").trim();
  const normalized = raw.toLowerCase() === "4k" ? "4K" : raw.toLowerCase();
  if (normalized === "360p" || normalized === "720p" || normalized === "1080p" || normalized === "4K") {
    return normalized;
  }
  return "1080p";
}

function normalizeGeminiOmniResolutionForValidation(value: unknown): string {
  const raw = String(value ?? "1080p").trim();
  return raw.toLowerCase() === "4k" ? "4K" : raw.toLowerCase();
}

function parseOptionalPositiveNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizeGeminiOmniVideoList(...values: unknown[]): GeminiOmniNormalizedVideoInput["videoList"] {
  const rawItems = values.flatMap((value) => Array.isArray(value) ? value : value ? [value] : []);
  const normalized: GeminiOmniNormalizedVideoInput["videoList"] = [];

  for (const item of rawItems) {
    if (typeof item === "string") {
      const url = item.trim();
      if (url) normalized.push({ url });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as GeminiOmniReferenceVideoInput & Record<string, unknown>;
    const url = String(record.url ?? record.video_url ?? record.videoUrl ?? "").trim();
    if (!url) continue;
    const entry: { url: string; start?: number | string; ends?: number | string; durationSeconds?: number | string } = { url };
    const start = record.start ?? record.starts ?? record.start_time ?? record.startTime;
    const ends = record.ends ?? record.end ?? record.end_time ?? record.endTime;
    const durationSeconds = record.durationSeconds ?? record.duration_seconds;
    if (start !== undefined && start !== null && start !== "") entry.start = start as number | string;
    if (ends !== undefined && ends !== null && ends !== "") entry.ends = ends as number | string;
    if (durationSeconds !== undefined && durationSeconds !== null && durationSeconds !== "") {
      entry.durationSeconds = durationSeconds as number | string;
    }
    normalized.push(entry);
  }

  return normalized;
}

export function isGeminiOmniAllowedMediaReferenceUrl(value: string): boolean {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) {
    try {
      const decoded = decodeURIComponent(trimmed);
      return !decoded.includes("..")
        && SAFE_RELATIVE_MEDIA_PREFIXES.some((prefix) => decoded.startsWith(prefix));
    } catch {
      return false;
    }
  }
  try {
    const parsed = new URL(trimmed);
    return (parsed.protocol === "https:" || parsed.protocol === "http:")
      && !isUnsafeLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export function validateGeminiOmniVideoInput(input: GeminiOmniVideoValidationInput): GeminiOmniValidationResult {
  const prompt = String(input.prompt ?? "").trim();
  const imageUrls = normalizeStringList(input.imageUrls);
  const videoList = normalizeGeminiOmniVideoList(input.videoList, input.referenceVideoUrls, input.referenceVideoUrl);
  const characterIds = normalizeStringList(input.characterIds);
  const audioIds = normalizeStringList(input.audioIds);
  const firstFrameUrl = String(input.firstFrameUrl ?? "").trim() || undefined;
  const lastFrameUrl = String(input.lastFrameUrl ?? "").trim() || undefined;
  const isFlash11 = isGeminiOmniFlash11VideoModelId(input.modelId);
  const duration = normalizeGeminiOmniDuration(input.duration);
  const resolution = normalizeGeminiOmniResolution(input.resolution);
  const rawResolution = normalizeGeminiOmniResolutionForValidation(input.resolution);
  const referenceUnitCount = imageUrls.length + (videoList.length * 2) + characterIds.length;
  const issues: GeminiOmniValidationIssue[] = [];

  if (!prompt) {
    issues.push({ code: "prompt_required", field: "prompt", message: "Prompt is required for Gemini Omni Video." });
  }
  for (const url of imageUrls) {
    if (!isGeminiOmniAllowedMediaReferenceUrl(url)) {
      issues.push({ code: "invalid_image_url", field: "image_urls", message: "Reference images must be public HTTP(S) URLs or tenant upload URLs." });
    }
  }
  if (firstFrameUrl && !isGeminiOmniAllowedMediaReferenceUrl(firstFrameUrl)) {
    issues.push({ code: "invalid_first_frame_url", field: "first_frame_url", message: "First frame must be a public HTTP(S) URL or tenant upload URL." });
  }
  if (lastFrameUrl && !isGeminiOmniAllowedMediaReferenceUrl(lastFrameUrl)) {
    issues.push({ code: "invalid_last_frame_url", field: "last_frame_url", message: "Last frame must be a public HTTP(S) URL or tenant upload URL." });
  }
  if (lastFrameUrl && !firstFrameUrl) {
    issues.push({ code: "last_frame_requires_first_frame", field: "last_frame_url", message: "Last frame requires a first frame." });
  }
  if (firstFrameUrl && !isFlash11) {
    issues.push({ code: "first_last_frame_conflict", field: "first_frame_url", message: "First and last frame inputs are supported only by Gemini Omni Flash 1.1." });
  }
  if ((firstFrameUrl || lastFrameUrl) && (imageUrls.length || videoList.length || characterIds.length || audioIds.length)) {
    issues.push({ code: "first_last_frame_conflict", field: "first_frame_url", message: "Frame inputs cannot be combined with image, video, character, or audio references." });
  }
  if (videoList.length > GEMINI_OMNI_MAX_SOURCE_VIDEOS) {
    issues.push({ code: "too_many_videos", field: "video_list", message: "Gemini Omni Video supports at most one source video." });
  }
  for (const video of videoList) {
    if (!isGeminiOmniAllowedMediaReferenceUrl(video.url)) {
      issues.push({ code: "invalid_video_url", field: "video_list", message: "Source video must be a public HTTP(S) URL or tenant upload URL." });
    }
    const start = parseOptionalPositiveNumber(video.start);
    const ends = parseOptionalPositiveNumber(video.ends);
    const durationSeconds = parseOptionalPositiveNumber((video as { durationSeconds?: unknown }).durationSeconds);
    if (durationSeconds !== null && durationSeconds > GEMINI_OMNI_MAX_SOURCE_VIDEO_SECONDS) {
      issues.push({ code: "source_video_too_long", field: "video_list", message: "Gemini Omni source video must be 30 seconds or shorter." });
    }
    if (start !== null && ends !== null) {
      if (ends <= start) {
        issues.push({ code: "invalid_video_trim", field: "video_list", message: "Source video end time must be greater than start time." });
      } else if ((ends - start) > GEMINI_OMNI_MAX_SOURCE_VIDEO_TRIM_SECONDS) {
        issues.push({ code: "invalid_video_trim", field: "video_list", message: "Gemini Omni source video trim range must be 10 seconds or shorter." });
      }
    }
  }
  if (characterIds.length > GEMINI_OMNI_MAX_CHARACTER_IDS) {
    issues.push({ code: "too_many_characters", field: "character_ids", message: "Gemini Omni Video supports at most three character references." });
  }
  for (const id of characterIds) {
    if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
      issues.push({ code: "invalid_character_id", field: "character_ids", message: "Character IDs contain unsupported characters." });
    }
  }
  for (const id of audioIds) {
    if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
      issues.push({ code: "invalid_audio_id", field: "audio_ids", message: "Audio IDs contain unsupported characters." });
    }
  }
  if (referenceUnitCount > GEMINI_OMNI_MAX_REFERENCE_UNITS) {
    issues.push({ code: "reference_unit_limit", message: "Gemini Omni references exceed the 7-unit limit." });
  }
  if (!SUPPORTED_DURATIONS.has(String(input.duration ?? "4").replace(/s$/i, ""))) {
    issues.push({ code: "unsupported_duration", field: "duration", message: "Gemini Omni duration must be 4s, 6s, 8s, or 10s." });
  }
  const supportedResolutions = isFlash11 ? FLASH_1_1_SUPPORTED_RESOLUTIONS : LEGACY_SUPPORTED_RESOLUTIONS;
  if (!supportedResolutions.has(rawResolution)) {
    issues.push({ code: "unsupported_resolution", field: "resolution", message: isFlash11 ? "Gemini Omni Flash 1.1 resolution must be 360p, 720p, 1080p, or 4K." : "Gemini Omni resolution must be 720p, 1080p, or 4K." });
  }

  return {
    ok: issues.length === 0,
    issues,
    normalized: {
      prompt,
      imageUrls,
      videoList,
      characterIds,
      audioIds,
      duration,
      resolution,
      ...(firstFrameUrl ? { firstFrameUrl } : {}),
      ...(lastFrameUrl ? { lastFrameUrl } : {}),
      referenceUnitCount,
      hasSourceVideo: videoList.length > 0,
      pricingPresenceLabel: videoList.length > 0 ? "with-video" : "without-video",
      pricingDurationKey: `${duration}s` as "4s" | "6s" | "8s" | "10s",
    },
  };
}

export function buildGeminiOmniProviderExtraParams(input: GeminiOmniVideoValidationInput): Record<string, unknown> {
  const validation = validateGeminiOmniVideoInput(input);
  const providerVideoList = validation.normalized.videoList.map(({ url, start, ends }) => ({
    url,
    ...(start !== undefined ? { start } : {}),
    ...(ends !== undefined ? { ends } : {}),
  }));
  const hasFrameInput = Boolean(validation.normalized.firstFrameUrl || validation.normalized.lastFrameUrl);
  return {
    ...(hasFrameInput ? {
      ...(validation.normalized.firstFrameUrl ? { first_frame_url: validation.normalized.firstFrameUrl } : {}),
      ...(validation.normalized.lastFrameUrl ? { last_frame_url: validation.normalized.lastFrameUrl } : {}),
    } : {
      image_urls: validation.normalized.imageUrls,
      video_list: providerVideoList,
      character_ids: validation.normalized.characterIds,
      audio_ids: validation.normalized.audioIds,
    }),
    duration: validation.normalized.duration,
    resolution: validation.normalized.resolution,
    gemini_omni_contract_version: GEMINI_OMNI_CONTRACT_VERSION,
  };
}

export function validateGeminiOmniProductionNodeCapability(input: GeminiOmniProductionNodeCapabilityInput): GeminiOmniValidationResult {
  const imageUrls: string[] = [];
  const videoList: GeminiOmniReferenceVideoInput[] = [];
  const characterIds: string[] = [];
  const audioIds: string[] = [];

  for (const reference of input.references) {
    if (reference.kind === "source_video") {
      videoList.push({ url: reference.url, videoUrl: reference.url });
    } else if (reference.kind === "reference_image" || reference.kind === "product_image") {
      if (reference.url) imageUrls.push(reference.url);
    } else if (reference.kind === "character_asset") {
      if (reference.assetId) characterIds.push(reference.assetId);
    } else if (reference.kind === "audio_asset") {
      if (reference.assetId) audioIds.push(reference.assetId);
    }
  }

  return validateGeminiOmniVideoInput({
    prompt: input.prompt,
    imageUrls,
    videoList,
    characterIds,
    audioIds,
    duration: input.duration,
    resolution: input.resolution,
  });
}
