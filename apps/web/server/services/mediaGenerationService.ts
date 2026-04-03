/**
 * Media Generation Service
 * Proxies requests to Python backend for image, video, and audio generation
 * Uses rate limiting to prevent overwhelming external APIs
 */

import {
  scheduleMediaWithLimiter,
  recordMediaUsage,
  type MediaType as RateLimiterMediaType,
} from './llmRateLimiter';
import { normalizeMediaPrompt } from "./mediaPromptNormalization";
import { auditLogger } from "./auditLogger";
import { getModelById, mapToApiModelId } from "./modelRegistry";
import {
  getCachedInternalNodeUrl,
  getCachedPublicAppUrl,
  getCachedPythonBackendUrl,
} from "./appRuntimeConfig";
import {
  assertRelativeUploadMediaReferencePath,
  buildWaveSpeedLaunchModelConfigJson,
  getReferenceImageLimitFromConfig,
  normalizeMediaProviderName,
  WAVESPEED_ALLOWED_ASPECT_RATIOS,
  WAVESPEED_ALLOWED_DURATIONS,
  WAVESPEED_LAUNCH_MODEL_DESCRIPTION,
  WAVESPEED_LAUNCH_MODEL_ID,
  WAVESPEED_LAUNCH_MODEL_NAME,
  WAVESPEED_PROVIDER,
} from "./mediaProviderUtils";

// ==================== Types ====================

export type MediaType = "image" | "video" | "audio";

// Use string IDs so newly added DB models don't require code changes.
export type ImageModel = string;
export type VideoModel = string;
export type AudioModel = string;

export type TaskStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface ModelMetadata {
  id: string;
  type: MediaType;
  name: string;
  provider: string;
  description: string;
  supportsAspectRatios?: string[];
  supportsSizes?: string[];
  supportsDurations?: number[];
  supportsVoices?: string[];
  creditCost: number;
  configJson?: Record<string, unknown>;
}
export { normalizeMediaPrompt } from "./mediaPromptNormalization";

const RETRYABLE_MEDIA_SETTINGS_ERROR = /\bSETTINGS_KEY_NOT_FOUND\b/i;
const MEDIA_SUBMIT_RETRY_DELAY_MS = 250;
const MEDIA_SUBMIT_MAX_ATTEMPTS = 2;

const mediaModelResolutionCounters = {
  providerFromApiConfig: 0,
  providerFromStaticRegistry: 0,
  providerDefaultFallback: 0,
  unknownModelRequests: 0,
};

export function getMediaModelResolutionCounters(): Readonly<typeof mediaModelResolutionCounters> {
  return { ...mediaModelResolutionCounters };
}

export function resetMediaModelResolutionCounters(): void {
  mediaModelResolutionCounters.providerFromApiConfig = 0;
  mediaModelResolutionCounters.providerFromStaticRegistry = 0;
  mediaModelResolutionCounters.providerDefaultFallback = 0;
  mediaModelResolutionCounters.unknownModelRequests = 0;
}

function resolveProviderFromApiConfig(apiConfig?: Record<string, string>): string | null {
  if (!apiConfig) return null;
  for (const key of ["provider", "provider_id", "providerId", "providerName"]) {
    const value = apiConfig[key as keyof typeof apiConfig];
    if (typeof value === "string" && value.trim().length > 0) {
      const normalized = normalizeMediaProviderName(value);
      return normalized === WAVESPEED_PROVIDER ? normalized : value.trim();
    }
  }
  return null;
}

function resolveProvider(modelId: string, apiConfig?: Record<string, string>): string {
  const providerFromConfig = resolveProviderFromApiConfig(apiConfig);
  if (providerFromConfig) {
    mediaModelResolutionCounters.providerFromApiConfig += 1;
    return providerFromConfig;
  }

  const modelMeta = MEDIA_MODELS[modelId];
  if (modelMeta?.provider) {
    mediaModelResolutionCounters.providerFromStaticRegistry += 1;
    return modelMeta.provider;
  }

  mediaModelResolutionCounters.providerDefaultFallback += 1;
  mediaModelResolutionCounters.unknownModelRequests += 1;
  console.warn("[MediaModelResolution] Unknown model provider fallback", { modelId });
  return "kie.ai";
}

// Model registry with metadata
export const MEDIA_MODELS: Record<string, ModelMetadata> = {
  // Image models
  "google-nano-banana-pro": {
    id: "google-nano-banana-pro",
    type: "image",
    name: "Google Nano Banana Pro",
    provider: "kie.ai",
    description: "High-quality image generation with Google's latest model",
    supportsSizes: ["1024x1024", "1024x1792", "1792x1024"],
    supportsAspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4"],
    creditCost: 10,
  },
  "google-banana-2": {
    id: "google-banana-2",
    type: "image",
    name: "Google Banana 2",
    provider: "kie.ai",
    description: "Gemini 3.1 Flash Image model with fast 4K generation and image editing support",
    supportsAspectRatios: ["1:1", "1:4", "1:8", "2:3", "3:2", "3:4", "4:1", "4:3", "4:5", "5:4", "8:1", "9:16", "16:9", "21:9", "auto"],
    creditCost: 40,
  },
  "flux-2.0": {
    id: "flux-2.0",
    type: "image",
    name: "Flux 2.0",
    provider: "kie.ai",
    description: "Fast and creative image generation",
    supportsSizes: ["1024x1024", "1024x1792", "1792x1024"],
    supportsAspectRatios: ["1:1", "16:9", "9:16"],
    creditCost: 8,
  },
  "z-image": {
    id: "z-image",
    type: "image",
    name: "Z-Image",
    provider: "kie.ai",
    description: "Artistic style image generation",
    supportsSizes: ["1024x1024"],
    supportsAspectRatios: ["1:1"],
    creditCost: 5,
  },
  "grok-imagine": {
    id: "grok-imagine",
    type: "image",
    name: "Grok Imagine",
    provider: "kie.ai",
    description: "xAI's image generation model",
    supportsSizes: ["1024x1024", "1024x1792", "1792x1024"],
    supportsAspectRatios: ["1:1", "16:9", "9:16"],
    creditCost: 12,
  },
  "gpt-image-1.5-all": {
    id: "gpt-image-1.5-all",
    type: "image",
    name: "GPT Image 1.5 All",
    provider: "knplabai",
    description: "OpenAI-compatible image generation via KNPLabs",
    supportsSizes: ["1024x1024", "1536x1536"],
    supportsAspectRatios: ["1:1", "16:9", "9:16"],
    creditCost: 12,
  },
  "gemini-3.1-flash-image-preview": {
    id: "gemini-3.1-flash-image-preview",
    type: "image",
    name: "Gemini 3.1 Flash Image",
    provider: "knplabai",
    description: "Gemini native image generation via KNPLabs",
    supportsAspectRatios: ["1:1", "16:9", "9:16"],
    creditCost: 14,
  },
  // Video models
  "veo-3-1": {
    id: "veo-3-1",
    type: "video",
    name: "Veo 3.1",
    provider: "kie.ai",
    description: "Google's video generation model",
    supportsDurations: [5, 10, 15],
    supportsAspectRatios: ["16:9", "9:16", "1:1"],
    creditCost: 50,
  },
  "sora-2": {
    id: "sora-2",
    type: "video",
    name: "Sora 2",
    provider: "kie.ai",
    description: "OpenAI's video generation model",
    supportsDurations: [5, 10, 15, 20],
    supportsAspectRatios: ["16:9", "9:16", "1:1"],
    creditCost: 80,
  },
  "kling-2.6": {
    id: "kling-2.6",
    type: "video",
    name: "Kling 2.6",
    provider: "kie.ai",
    description: "Kling video generation model",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 40,
  },
  "veo_3_1-fast": {
    id: "veo_3_1-fast",
    type: "video",
    name: "Veo 3.1 Fast",
    provider: "knplabai",
    description: "KNPLabs fast form-data video generation",
    supportsDurations: [5, 10, 15],
    supportsAspectRatios: ["16:9", "9:16", "1:1"],
    creditCost: 35,
  },
  "grok-video-3": {
    id: "grok-video-3",
    type: "video",
    name: "Grok Video 3",
    provider: "knplabai",
    description: "KNPLabs JSON video generation",
    supportsDurations: [5, 10, 15],
    supportsAspectRatios: ["16:9", "9:16", "1:1"],
    creditCost: 36,
  },
  [WAVESPEED_LAUNCH_MODEL_ID]: {
    id: WAVESPEED_LAUNCH_MODEL_ID,
    type: "video",
    name: WAVESPEED_LAUNCH_MODEL_NAME,
    provider: WAVESPEED_PROVIDER,
    description: WAVESPEED_LAUNCH_MODEL_DESCRIPTION,
    supportsDurations: [...WAVESPEED_ALLOWED_DURATIONS],
    supportsAspectRatios: [...WAVESPEED_ALLOWED_ASPECT_RATIOS],
    creditCost: 800,
    configJson: buildWaveSpeedLaunchModelConfigJson(),
  },
  // ========== BytePlus ModelArk — Seedream Image Models ==========
  "seedream-4-5-251128": {
    id: "seedream-4-5-251128",
    type: "image",
    name: "Seedream 4.5",
    provider: "byteplus_modelark",
    description: "BytePlus Seedream 4.5 — high-quality image generation (synchronous)",
    supportsSizes: ["1024x1024", "2048x2048", "4096x4096"],
    creditCost: 15,
  },
  "seedream-4-0-250828": {
    id: "seedream-4-0-250828",
    type: "image",
    name: "Seedream 4.0",
    provider: "byteplus_modelark",
    description: "BytePlus Seedream 4.0 — cost-efficient image generation (synchronous)",
    supportsSizes: ["1024x1024", "2048x2048", "4096x4096"],
    creditCost: 10,
  },
  // ========== BytePlus ModelArk — Seedance Video Models ==========
  "seedance-1-0-pro-fast-251015": {
    id: "seedance-1-0-pro-fast-251015",
    type: "video",
    name: "Seedance Pro Fast",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Pro Fast — fast text-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
  "seedance-1-0-pro-250528": {
    id: "seedance-1-0-pro-250528",
    type: "video",
    name: "Seedance Pro",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Pro — high-quality text-to-video and image-to-video (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 30,
  },
  "seedance-1-0-lite-t2v-250428": {
    id: "seedance-1-0-lite-t2v-250428",
    type: "video",
    name: "Seedance Lite T2V",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Lite — text-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
  "seedance-1-0-lite-i2v-250428": {
    id: "seedance-1-0-lite-i2v-250428",
    type: "video",
    name: "Seedance Lite I2V",
    provider: "byteplus_modelark",
    description: "BytePlus Seedance Lite — image-to-video generation (async)",
    supportsDurations: [5, 10],
    supportsAspectRatios: ["16:9", "9:16"],
    creditCost: 20,
  },
  // Audio models
  "elevenlabs-tts": {
    id: "elevenlabs-tts",
    type: "audio",
    name: "ElevenLabs Text-to-Speech",
    provider: "kie.ai",
    description: "High-quality text-to-speech",
    supportsVoices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    creditCost: 5,
  },
  "elevenlabs-sfx": {
    id: "elevenlabs-sfx",
    type: "audio",
    name: "ElevenLabs Sound Effects",
    provider: "kie.ai",
    description: "Sound effects generation",
    creditCost: 3,
  },
  "gpt-4o-mini-tts": {
    id: "gpt-4o-mini-tts",
    type: "audio",
    name: "GPT-4o Mini TTS",
    provider: "knplabai",
    description: "KNPLabs OpenAI-compatible text-to-speech",
    supportsVoices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    creditCost: 4,
  },
  "tts-1": {
    id: "tts-1",
    type: "audio",
    name: "TTS-1",
    provider: "knplabai",
    description: "KNPLabs OpenAI-compatible text-to-speech",
    supportsVoices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
    creditCost: 3,
  },
  "uvoice/tts-standard": {
    id: "uvoice/tts-standard",
    type: "audio",
    name: "UVoice TTS Standard",
    provider: "uvoice",
    description: "UVoice standard text-to-speech",
    creditCost: 150,
  },
  "uvoice/tts-natural": {
    id: "uvoice/tts-natural",
    type: "audio",
    name: "UVoice TTS Natural",
    provider: "uvoice",
    description: "UVoice natural text-to-speech",
    creditCost: 150,
  },
  "uvoice/tts-premium": {
    id: "uvoice/tts-premium",
    type: "audio",
    name: "UVoice TTS Premium",
    provider: "uvoice",
    description: "UVoice premium text-to-speech",
    creditCost: 300,
  },
};

// Default models
export const DEFAULT_MODELS = {
  image: "google-nano-banana-pro" as ImageModel,
  video: "veo-3-1" as VideoModel,
  audio: "elevenlabs-tts" as AudioModel,
};

// ==================== Request/Response Interfaces ====================

export interface ImageGenerationRequest {
  prompt: string;
  model?: string;
  size?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  numImages?: number;
  /** Output resolution (e.g., "1K", "2K", "4K") */
  resolution?: string;
  /** Output format (e.g., "png", "jpeg") */
  outputFormat?: string;
  /** Per-model API overrides from model config */
  apiConfig?: Record<string, string>;
  /** Dynamic model-specific input fields */
  extraParams?: Record<string, any>;
  /** Tenant public URL for resolving relative reference URLs */
  publicUrl?: string;
  /** Reference images for style transfer or img2img (1-5 URLs) */
  referenceImageUrls?: string[];
  /** Reference style URL for style transfer */
  referenceStyleUrl?: string;
  /** Optional audit metadata for end-to-end traceability */
  auditContext?: MediaAuditContext;
}

export interface VideoGenerationRequest {
  prompt: string;
  model?: string;
  duration?: number;
  aspectRatio?: string;
  fps?: number;
  /** Output resolution (e.g., "720p", "1080p") */
  resolution?: string;
  /** Per-model API overrides from model config */
  apiConfig?: Record<string, string>;
  /** Dynamic model-specific input fields */
  extraParams?: Record<string, any>;
  /** Tenant public URL for resolving relative reference URLs */
  publicUrl?: string;
  /** Reference images for video generation (img2vid) */
  referenceImageUrls?: string[];
  /** Reference video URLs for vid2vid */
  referenceVideoUrls?: string[];
  /** Legacy single reference video URL for vid2vid */
  referenceVideoUrl?: string;
  /** Optional audit metadata for end-to-end traceability */
  auditContext?: MediaAuditContext;
}

export interface AudioGenerationRequest {
  text: string;
  model?: AudioModel;
  voice?: string;
  speed?: number;
  /** Per-model API overrides from model config */
  apiConfig?: Record<string, string>;
  /** Dynamic model-specific input fields */
  extraParams?: Record<string, any>;
  /** Tenant public URL for resolving relative reference URLs */
  publicUrl?: string;
  /** Optional audit metadata for end-to-end traceability */
  auditContext?: MediaAuditContext;
}

export interface MediaAuditContext {
  userId?: number;
  traceId?: string;
  source?: string;
  stage?: string;
  [key: string]: unknown;
}

export interface MediaGenerationResult {
  id: string;
  url?: string;
  data?: Record<string, unknown>;
}

export interface MediaGenerationResponse {
  success: boolean;
  data: MediaGenerationResult[];
  creditsUsed: number;
  creditsBalance: number;
  model: string;
  error?: string;
}

export interface MediaTask {
  id: string;
  taskId?: string; // External provider task ID (e.g., Kie.ai)
  celeryTaskId?: string; // Internal Celery task UUID for tracking/monitoring
  userId: string;
  mediaType: MediaType;
  status: TaskStatus;
  model: string;
  prompt: string;
  parameters?: Record<string, unknown>;
  resultUrl?: string;
  resultData?: Record<string, unknown>;
  errorMessage?: string;
  creditsUsed?: number;
  creditsBalance?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskListResponse {
  tasks: MediaTask[];
  total: number;
  limit: number;
  offset: number;
}

// ==================== Service Class ====================

const NODE_ENV = process.env.NODE_ENV || "development";

/**
 * Convert relative public asset URLs (e.g., /uploads/xxx.png, /api/storage/files/xxx.png) to full URLs
 * so external services (like KIE AI) can download the files
 * @param url The URL to resolve
 * @param publicUrl Optional public URL from request context (tenant domain, e.g., https://smartaihub.app)
 */
export function resolveReferenceUrl(url: string, publicUrl?: string | null): string {
  if (!url) return url;

  // If already a full URL, keep public URLs as-is.
  // Loopback/private hosts are rewritten to the internal Node URL so the
  // Python backend can fetch them and re-host them on R2 for Kie.ai.
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const parsed = new URL(url);
      if (!isLoopbackOrPrivateHost(parsed.hostname)) {
        return url;
      }

      const internalBase = new URL(getCachedInternalNodeUrl());
      internalBase.pathname = parsed.pathname;
      internalBase.search = parsed.search;
      internalBase.hash = parsed.hash;
      return internalBase.toString();
    } catch {
      return url;
    }
  }

  // Convert relative path to full URL
  // Priority: 1) Request's publicUrl (tenant domain) if public, 2) UI-managed public URL.
  // Internal-only fallbacks are rejected so external providers never receive app-internal paths.
  if (url.startsWith("/")) {
    assertRelativeUploadMediaReferencePath(url, "Reference URL");
    const cachedPublicUrl = getCachedPublicAppUrl();
    const baseUrl = isPublicHttpUrl(publicUrl || "")
      ? publicUrl!
      : isPublicHttpUrl(cachedPublicUrl || "")
        ? cachedPublicUrl
        : null;
    if (!baseUrl) {
      throw new Error("Reference URL requires a public app URL to resolve /uploads/ assets safely");
    }
    return `${baseUrl}${url}`;
  }

  return url;
}

/**
 * Process extraParams and resolve any relative URLs (e.g., image_input field)
 * This ensures public asset URLs like /uploads/... and /api/storage/files/... are converted to full URLs for the Python backend
 * @param extraParams The extra parameters object
 * @param publicUrl Optional public URL from request context (tenant domain)
 */
function resolveExtraParamsUrls(extraParams: Record<string, any>, publicUrl?: string | null): Record<string, any> {
  const resolved = { ...extraParams };
  for (const [key, value] of Object.entries(resolved)) {
    // If value is an array of strings that look like relative URLs, resolve them
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      const firstVal = value[0] as string;
      if (firstVal.startsWith('/') && !firstVal.startsWith('//')) {
        resolved[key] = value.map((url: string) => resolveReferenceUrl(url, publicUrl));
      }
    }
    // If value is a single string that looks like a relative URL
    else if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')) {
      resolved[key] = resolveReferenceUrl(value, publicUrl);
    }
  }
  return resolved;
}

function getReferenceImageLimitForModel(modelId: string): number {
  const normalizedModelId = mapToApiModelId(modelId);
  const model = getModelById(normalizedModelId) || getModelById(modelId) || MEDIA_MODELS[modelId];
  return getReferenceImageLimitFromConfig(model?.configJson) ?? 5;
}

function resolveReferenceImageUrlsForModel(
  modelId: string,
  urls: string[] | undefined,
  publicUrl?: string | null,
): string[] | undefined {
  if (!urls || urls.length === 0) {
    return undefined;
  }

  const limit = getReferenceImageLimitForModel(modelId);
  return urls
    .slice(0, limit)
    .map((url) => resolveReferenceUrl(url, publicUrl));
}

type ReferenceImageInputType = "array" | "url";

function inferReferenceImageInputLabel(rawKey: string): string {
  const normalizedKey = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalizedKey.includes("video")) {
    return "Reference Videos";
  }
  if (normalizedKey.includes("audio")) {
    return "Reference Audio";
  }
  return "Reference Images";
}

function normalizeReferenceImageInputType(rawType: unknown): ReferenceImageInputType | null {
  if (typeof rawType !== "string") {
    return null;
  }

  const type = rawType.trim().toLowerCase();
  if (!type) {
    return null;
  }

  if (type === "array" || type === "image_urls" || type === "video_urls" || type === "audio_urls") {
    return "array";
  }

  if (type === "url" || type === "text" || type === "string") {
    return "url";
  }

  return null;
}

function inferReferenceImageInputConfig(modelId: string): { key: string; label?: string; type: ReferenceImageInputType } | undefined {
  const normalizedModelId = mapToApiModelId(modelId);
  const model = getModelById(normalizedModelId) || getModelById(modelId);
  const inputFields = Array.isArray((model?.configJson as { inputFields?: unknown } | undefined)?.inputFields)
    ? ((model?.configJson as { inputFields?: unknown } | undefined)?.inputFields as unknown[])
    : [];

  for (const field of inputFields) {
    if (!field || typeof field !== "object") {
      continue;
    }

    const record = field as Record<string, unknown>;
    const rawKey = typeof record.key === "string" ? record.key.trim() : "";
    if (!rawKey) {
      continue;
    }

    const normalizedKey = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const rawSyncWith = typeof record.syncWith === "string" ? record.syncWith.trim() : "";
    const rawLabel = typeof record.label === "string" ? record.label.trim() : "";
    const looksLikeReferenceImageField = (
      rawSyncWith === "reference_images"
      || normalizedKey === "imageinput"
      || normalizedKey === "referenceimages"
      || normalizedKey.includes("referenceimage")
      || normalizedKey.includes("imageurl")
    );
    if (!looksLikeReferenceImageField) {
      continue;
    }

    const type = normalizeReferenceImageInputType(record.type);
    if (!type) {
      continue;
    }

    return { key: rawKey, label: rawLabel || inferReferenceImageInputLabel(rawKey), type };
  }

  return undefined;
}

function buildApiConfigWithReferenceImageConfig(
  modelId: string,
  apiConfig: Record<string, string> | undefined,
  referenceImageUrls?: string[],
): Record<string, string> | undefined {
  const baseConfig = apiConfig ? { ...apiConfig } : undefined;
  if (!referenceImageUrls || referenceImageUrls.length === 0) {
    return baseConfig;
  }

  const referenceImageConfig = inferReferenceImageInputConfig(modelId);
  if (!referenceImageConfig) {
    return baseConfig;
  }

  return {
    ...(baseConfig ?? {}),
    reference_image_input_key: referenceImageConfig.key,
    ...(referenceImageConfig.label ? { reference_image_input_label: referenceImageConfig.label } : {}),
    reference_image_input_type: referenceImageConfig.type,
  };
}

/**
 * Validate and enforce HTTPS for backend URL in production
 */
function validateBackendUrl(url: string): string {
  const parsedUrl = new URL(url);

  // In production, enforce HTTPS
  if (NODE_ENV === "production") {
    if (parsedUrl.protocol !== "https:") {
      // Allow localhost in production for containerized deployments
      if (parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
        console.error(
          `[SECURITY WARNING] Python backend URL must use HTTPS in production: ${url}`
        );
        // Attempt to upgrade to HTTPS
        parsedUrl.protocol = "https:";
        console.warn(`[SECURITY] Auto-upgrading backend URL to HTTPS: ${parsedUrl.toString()}`);
        return parsedUrl.toString().replace(/\/$/, ""); // Remove trailing slash
      }
    }
  } else if (NODE_ENV !== "development" && NODE_ENV !== "test") {
    // Staging or other environments - warn but don't block
    if (parsedUrl.protocol !== "https:" && parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
      console.warn(
        `[SECURITY WARNING] Consider using HTTPS for Python backend URL: ${url}`
      );
    }
  }

  return url;
}

function isLoopbackOrPrivateHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (!lower) return false;

  if (
    lower === "localhost" ||
    lower === "host.docker.internal" ||
    lower === "smartspec-web" ||
    lower === "0.0.0.0" ||
    lower === "::1" ||
    lower === "[::1]"
  ) {
    return true;
  }

  if (/^127(?:\.\d{1,3}){3}$/.test(lower)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(lower)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2}$/.test(lower)) return true;
  if (/^169\.254(?:\.\d{1,3}){2}$/.test(lower)) return true;

  return false;
}

function isPublicHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    return !isLoopbackOrPrivateHost(parsed.hostname);
  } catch {
    return false;
  }
}

class MediaRequestError extends Error {
  statusCode: number;
  responsePayload: unknown;
  endpoint: string;

  constructor(message: string, statusCode: number, endpoint: string, responsePayload: unknown) {
    super(message);
    this.name = "MediaRequestError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
    this.responsePayload = responsePayload;
  }
}

function sanitizeAuditError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  return raw.replace(/\s+/g, " ").trim().slice(0, 500);
}

function isRetryableMediaSubmitError(error: unknown): boolean {
  if (error instanceof MediaRequestError) {
    return false;
  }
  const raw = error instanceof Error ? error.message : String(error ?? "");
  return RETRYABLE_MEDIA_SETTINGS_ERROR.test(raw);
}

function enrichMediaSubmitError(error: unknown, endpointPath: string): Error {
  const raw = error instanceof Error ? error.message : String(error ?? "Unknown error");
  if (!RETRYABLE_MEDIA_SETTINGS_ERROR.test(raw) || raw.includes(`[endpoint=${endpointPath}]`)) {
    return error instanceof Error ? error : new Error(raw);
  }

  const enriched = new Error(`${raw} [endpoint=${endpointPath}]`);
  if (error instanceof Error && error.stack) {
    enriched.stack = error.stack;
  }
  return enriched;
}

export class MediaGenerationService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const rawUrl = baseUrl || getCachedPythonBackendUrl();
    this.baseUrl = validateBackendUrl(rawUrl);
  }

  /**
   * Get auth headers for Python backend
   */
  private getHeaders(userToken: string): HeadersInit {
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${userToken}`,
    };
  }

  private getAuditContext(request: { auditContext?: MediaAuditContext }): MediaAuditContext {
    return request.auditContext ?? {};
  }

  private logRetryableSubmitError(params: {
    request: { auditContext?: MediaAuditContext };
    provider: string;
    model: string;
    mediaType: MediaType;
    requestType: string;
    endpoint: string;
    attempt: number;
    maxAttempts: number;
    error: unknown;
  }): void {
    const auditContext = this.getAuditContext(params.request);
    const errorMessage = sanitizeAuditError(params.error);

    auditLogger.log({
      traceId: typeof auditContext.traceId === "string" ? auditContext.traceId : undefined,
      eventType: "error",
      userId: typeof auditContext.userId === "number" ? auditContext.userId : null,
      providerName: params.provider,
      model: params.model,
      mediaType: params.mediaType,
      requestType: params.requestType,
      endpoint: params.endpoint,
      errorType: "media_submit_retryable_error",
      errorMessage,
      metadata: {
        source: auditContext.source ?? "media_generation_service",
        stage: auditContext.stage ?? null,
        retryAttempt: params.attempt,
        maxAttempts: params.maxAttempts,
      },
    });

    console.warn("[MediaGenerationService] Retrying transient media submit error", {
      traceId: auditContext.traceId,
      provider: params.provider,
      model: params.model,
      mediaType: params.mediaType,
      requestType: params.requestType,
      endpoint: params.endpoint,
      attempt: params.attempt,
      maxAttempts: params.maxAttempts,
      errorMessage,
    });
  }

  private async submitTaskWithRetry(params: {
    request: { auditContext?: MediaAuditContext };
    requestType: string;
    mediaType: MediaType;
    provider: string;
    model: string;
    endpoint: string;
    userToken: string;
    payload: unknown;
  }): Promise<{ status: number; data: any }> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MEDIA_SUBMIT_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await scheduleMediaWithLimiter(
          params.provider,
          params.mediaType as RateLimiterMediaType,
          async () => this.postJson(params.userToken, params.endpoint, params.payload),
        );
      } catch (error) {
        const enrichedError = enrichMediaSubmitError(error, params.endpoint);
        lastError = enrichedError;

        if (!isRetryableMediaSubmitError(enrichedError) || attempt >= MEDIA_SUBMIT_MAX_ATTEMPTS) {
          throw enrichedError;
        }

        this.logRetryableSubmitError({
          request: params.request,
          provider: params.provider,
          model: params.model,
          mediaType: params.mediaType,
          requestType: params.requestType,
          endpoint: params.endpoint,
          attempt,
          maxAttempts: MEDIA_SUBMIT_MAX_ATTEMPTS,
          error: enrichedError,
        });

        await new Promise((resolve) => setTimeout(resolve, MEDIA_SUBMIT_RETRY_DELAY_MS));
      }
    }

    throw enrichMediaSubmitError(lastError, params.endpoint);
  }

  private logMediaRequest(params: {
    request: { auditContext?: MediaAuditContext };
    requestType: string;
    mediaType: MediaType;
    provider: string;
    model: string;
    endpoint: string;
    payload: unknown;
  }): void {
    const auditContext = this.getAuditContext(params.request);
    auditLogger.log({
      traceId: typeof auditContext.traceId === "string" ? auditContext.traceId : undefined,
      eventType: "media_request",
      userId: typeof auditContext.userId === "number" ? auditContext.userId : null,
      providerName: params.provider,
      model: params.model,
      mediaType: params.mediaType,
      requestType: params.requestType,
      requestPayload: {
        source: auditContext.source ?? "media_generation_service",
        stage: auditContext.stage ?? null,
        endpoint: params.endpoint,
        provider: params.provider,
        model: params.model,
        payload: params.payload,
      },
    });
  }

  private logMediaResponse(params: {
    request: { auditContext?: MediaAuditContext };
    requestType: string;
    mediaType: MediaType;
    provider: string;
    model: string;
    statusCode: number;
    success: boolean;
    responsePayload?: unknown;
    errorMessage?: string;
  }): void {
    const auditContext = this.getAuditContext(params.request);
    auditLogger.log({
      traceId: typeof auditContext.traceId === "string" ? auditContext.traceId : undefined,
      eventType: "media_response",
      userId: typeof auditContext.userId === "number" ? auditContext.userId : null,
      providerName: params.provider,
      model: params.model,
      mediaType: params.mediaType,
      requestType: params.requestType,
      statusCode: params.statusCode,
      errorType: params.success ? undefined : "media_generation_failed",
      errorMessage: params.success ? undefined : params.errorMessage,
      responsePayload: {
        success: params.success,
        ...(!params.success && params.errorMessage ? { error: params.errorMessage } : {}),
        ...(params.responsePayload !== undefined ? { providerResponse: params.responsePayload } : {}),
      },
      metadata: {
        source: auditContext.source ?? "media_generation_service",
        stage: auditContext.stage ?? null,
      },
    });
  }

  private async postJson(userToken: string, endpointPath: string, payload: unknown): Promise<{ status: number; data: any }> {
    const response = await fetch(`${this.baseUrl}${endpointPath}`, {
      method: "POST",
      headers: this.getHeaders(userToken),
      body: JSON.stringify(payload),
    });

    const rawText = await response.text().catch(() => "");
    let parsed: unknown;
    if (rawText.length === 0) {
      parsed = {};
    } else {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { raw: rawText.slice(0, 2000) };
      }
    }

    if (!response.ok) {
      const payloadObj = parsed && typeof parsed === "object"
        ? parsed as Record<string, unknown>
        : {};
      const nestedError = payloadObj.error && typeof payloadObj.error === "object"
        ? payloadObj.error as Record<string, unknown>
        : undefined;
      const code = nestedError?.code ?? payloadObj.code;
      const detail =
        nestedError?.message
        ?? payloadObj.detail
        ?? payloadObj.message
        ?? payloadObj.error;
      const detailObj = detail && typeof detail === "object"
        ? detail as Record<string, unknown>
        : undefined;
      const detailMessage = typeof detail === "string" && detail.trim().length > 0
        ? detail
        : (
          detailObj
          && typeof detailObj.message === "string"
          && detailObj.message.trim().length > 0
        )
          ? detailObj.message
          : (
            detailObj
            && typeof detailObj.detail === "string"
            && detailObj.detail.trim().length > 0
          )
            ? detailObj.detail
            : (
              detailObj
              && typeof detailObj.error === "string"
              && detailObj.error.trim().length > 0
            )
              ? detailObj.error
              : null;
      const messageBase = detailMessage ?? `Media request failed: ${response.status}`;
      const message = typeof code === "string" && code.trim().length > 0
        ? `${code}: ${messageBase}`
        : messageBase;
      throw new MediaRequestError(message, response.status, endpointPath, parsed);
    }

    return { status: response.status, data: parsed };
  }

  /**
   * Generate image synchronously (with rate limiting)
   */
  async generateImage(
    request: ImageGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    const modelId = request.model || DEFAULT_MODELS.image;
    const provider = resolveProvider(modelId, request.apiConfig);
    const normalizedPrompt = normalizeMediaPrompt(request.prompt) || request.prompt.trim();

    const payload: Record<string, unknown> = {
      prompt: normalizedPrompt,
      model: modelId,
      size: request.size,
      aspect_ratio: request.aspectRatio,
      negative_prompt: request.negativePrompt,
      n: request.numImages || 1,
    };

    // Add resolution if provided (e.g., "1K", "2K", "4K")
    if ((request as any).resolution) {
      payload.resolution = (request as any).resolution;
    }

    // Add output format if provided
    if ((request as any).outputFormat) {
      payload.output_format = (request as any).outputFormat;
    }

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = (request as any).publicUrl as string | undefined;

    // Add extra params from dynamic input fields
    // Resolve any relative URLs (e.g., image_input with /uploads/... paths)
    if ((request as any).extraParams) {
      payload.extra_params = resolveExtraParamsUrls((request as any).extraParams, publicUrl);
    }

    // Add reference images if provided (1-5 images)
    // Convert relative URLs to full URLs for Python backend
    const resolvedReferenceImageUrls = resolveReferenceImageUrlsForModel(
      modelId,
      request.referenceImageUrls,
      publicUrl,
    );
    if (resolvedReferenceImageUrls) {
      payload.reference_image_urls = resolvedReferenceImageUrls;
    }

    const apiConfig = buildApiConfigWithReferenceImageConfig(
      modelId,
      (request as any).apiConfig,
      request.referenceImageUrls,
    );
    if (apiConfig) {
      payload.api_config = apiConfig;
    }

    // Add reference style if provided
    if (request.referenceStyleUrl) {
      payload.reference_style_url = resolveReferenceUrl(request.referenceStyleUrl, publicUrl);
    }

    this.logMediaRequest({
      request,
      requestType: "generateImage",
      mediaType: "image",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/image",
      payload,
    });

    // Use rate limiter to prevent overwhelming the API
    try {
      const result = await scheduleMediaWithLimiter(provider, "image" as RateLimiterMediaType, async () => {
        const { data, status } = await this.postJson(userToken, "/api/v1/media/image", payload);
        this.logMediaResponse({
          request,
          requestType: "generateImage",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: status,
          success: true,
          responsePayload: data,
        });
        return this.mapResponse(data);
      });

      // Record successful usage
      recordMediaUsage(provider, modelId, "image" as RateLimiterMediaType, true, result.creditsUsed);
      return result;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateImage",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateImage",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      // Record failed usage
      recordMediaUsage(provider, modelId, "image" as RateLimiterMediaType, false, 0);
      throw error;
    }
  }

  /**
   * Generate video synchronously (with rate limiting)
   */
  async generateVideo(
    request: VideoGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    const modelId = request.model || DEFAULT_MODELS.video;
    const provider = resolveProvider(modelId, request.apiConfig);
    const normalizedPrompt = normalizeMediaPrompt(request.prompt) || request.prompt.trim();

    const payload: Record<string, unknown> = {
      prompt: normalizedPrompt,
      model: modelId,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      fps: request.fps,
    };

    // Add resolution if provided (e.g., "720p", "1080p")
    if (request.resolution) {
      payload.resolution = request.resolution;
    }

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = (request as any).publicUrl as string | undefined;

    // Add extra params from dynamic input fields
    // Resolve any relative URLs (e.g., image_input with /uploads/... paths)
    if ((request as any).extraParams) {
      payload.extra_params = resolveExtraParamsUrls((request as any).extraParams, publicUrl);
    }

    // Add reference images for img2vid
    // Convert relative URLs to full URLs for Python backend
    const resolvedReferenceImageUrls = resolveReferenceImageUrlsForModel(
      modelId,
      request.referenceImageUrls,
      publicUrl,
    );
    if (resolvedReferenceImageUrls) {
      payload.reference_image_urls = resolvedReferenceImageUrls;
    }

    const apiConfig = buildApiConfigWithReferenceImageConfig(
      modelId,
      (request as any).apiConfig,
      request.referenceImageUrls,
    );
    if (apiConfig) {
      payload.api_config = apiConfig;
    }

    // Add reference video(s) for vid2vid
    const referenceVideoUrls = (request.referenceVideoUrls && request.referenceVideoUrls.length > 0)
      ? request.referenceVideoUrls
      : (request.referenceVideoUrl ? [request.referenceVideoUrl] : []);
    if (referenceVideoUrls.length > 0) {
      const resolvedVideoUrls = referenceVideoUrls.map((url) => resolveReferenceUrl(url, publicUrl));
      payload.reference_video_urls = resolvedVideoUrls;
      payload.reference_video_url = resolvedVideoUrls[0];
    }

    this.logMediaRequest({
      request,
      requestType: "generateVideo",
      mediaType: "video",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/video",
      payload,
    });

    // Use rate limiter with video priority (lower priority due to resource intensity)
    try {
      const result = await scheduleMediaWithLimiter(provider, "video" as RateLimiterMediaType, async () => {
        const { data, status } = await this.postJson(userToken, "/api/v1/media/video", payload);
        this.logMediaResponse({
          request,
          requestType: "generateVideo",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: status,
          success: true,
          responsePayload: data,
        });
        return this.mapResponse(data);
      });

      recordMediaUsage(provider, modelId, "video" as RateLimiterMediaType, true, result.creditsUsed);
      return result;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateVideo",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateVideo",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(provider, modelId, "video" as RateLimiterMediaType, false, 0);
      throw error;
    }
  }

  /**
   * Generate audio synchronously (with rate limiting)
   */
  async generateAudio(
    request: AudioGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    const modelId = request.model || DEFAULT_MODELS.audio;
    const provider = resolveProvider(modelId, request.apiConfig);
    const payload: Record<string, unknown> = {
      text: request.text,
      model: modelId,
      voice: request.voice,
      speed: request.speed,
    };

    // Add apiConfig for model-specific endpoints and payload formats
    if (request.apiConfig) {
      payload.api_config = request.apiConfig;
    }

    // Add extraParams for model-specific fields
    if (request.extraParams) {
      payload.extra_params = resolveExtraParamsUrls(request.extraParams, request.publicUrl);
    }

    this.logMediaRequest({
      request,
      requestType: "generateAudio",
      mediaType: "audio",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/audio",
      payload,
    });

    try {
      const result = await scheduleMediaWithLimiter(provider, "audio" as RateLimiterMediaType, async () => {
        const { data, status } = await this.postJson(userToken, "/api/v1/media/audio", payload);
        this.logMediaResponse({
          request,
          requestType: "generateAudio",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: status,
          success: true,
          responsePayload: data,
        });
        return this.mapResponse(data);
      });

      recordMediaUsage(provider, modelId, "audio" as RateLimiterMediaType, true, result.creditsUsed);
      return result;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateAudio",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateAudio",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(provider, modelId, "audio" as RateLimiterMediaType, false, 0);
      throw error;
    }
  }

  /**
   * Generate image asynchronously (returns task ID for polling, with rate limiting)
   */
  async generateImageAsync(
    request: ImageGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    const modelId = request.model || DEFAULT_MODELS.image;
    const provider = resolveProvider(modelId, request.apiConfig);
    const normalizedPrompt = normalizeMediaPrompt(request.prompt) || request.prompt.trim();

    const payload: Record<string, unknown> = {
      prompt: normalizedPrompt,
      model: modelId,
      size: request.size,
      aspect_ratio: request.aspectRatio,
      negative_prompt: request.negativePrompt,
      n: request.numImages || 1,
      resolution: request.resolution,
      output_format: request.outputFormat,
    };

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = request.publicUrl;

    // Add extraParams for model-specific fields
    if (request.extraParams) {
      payload.extra_params = resolveExtraParamsUrls(request.extraParams, publicUrl);
    }

    // Add reference images if provided (1-5 images)
    const resolvedReferenceImageUrls = resolveReferenceImageUrlsForModel(
      modelId,
      request.referenceImageUrls,
      publicUrl,
    );
    if (resolvedReferenceImageUrls) {
      payload.reference_image_urls = resolvedReferenceImageUrls;
    }

    const apiConfig = buildApiConfigWithReferenceImageConfig(
      modelId,
      request.apiConfig,
      request.referenceImageUrls,
    );
    if (apiConfig) {
      payload.api_config = apiConfig;
    }

    // Add reference style if provided
    if (request.referenceStyleUrl) {
      payload.reference_style_url = resolveReferenceUrl(request.referenceStyleUrl, publicUrl);
    }

    this.logMediaRequest({
      request,
      requestType: "generateImageAsync",
      mediaType: "image",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/async/image",
      payload,
    });

    try {
      const { data, status } = await this.submitTaskWithRetry({
        request,
        requestType: "generateImageAsync",
        mediaType: "image",
        provider,
        model: modelId,
        endpoint: "/api/v1/media/async/image",
        userToken,
        payload,
      });
      this.logMediaResponse({
        request,
        requestType: "generateImageAsync",
        mediaType: "image",
        provider,
        model: modelId,
        statusCode: status,
        success: true,
        responsePayload: data,
      });
      const task = this.mapTask(data);

      // Record task submission (actual completion tracked separately)
      recordMediaUsage(provider, modelId, "image" as RateLimiterMediaType, true, 0);
      return task;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateImageAsync",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateImageAsync",
          mediaType: "image",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(provider, modelId, "image" as RateLimiterMediaType, false, 0);
      throw error;
    }
  }

  /**
   * Generate video asynchronously (returns task ID for polling, with rate limiting)
   */
  async generateVideoAsync(
    request: VideoGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    const modelId = request.model || DEFAULT_MODELS.video;
    const provider = resolveProvider(modelId, request.apiConfig);
    const normalizedPrompt = normalizeMediaPrompt(request.prompt) || request.prompt.trim();

    const payload: Record<string, unknown> = {
      prompt: normalizedPrompt,
      model: modelId,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      fps: request.fps,
      resolution: request.resolution,
    };

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = request.publicUrl;

    // Add reference images for img2vid
    const resolvedReferenceImageUrls = resolveReferenceImageUrlsForModel(
      modelId,
      request.referenceImageUrls,
      publicUrl,
    );
    if (resolvedReferenceImageUrls) {
      payload.reference_image_urls = resolvedReferenceImageUrls;
    }

    // Add reference video(s) for vid2vid
    const referenceVideoUrls = (request.referenceVideoUrls && request.referenceVideoUrls.length > 0)
      ? request.referenceVideoUrls
      : (request.referenceVideoUrl ? [request.referenceVideoUrl] : []);
    if (referenceVideoUrls.length > 0) {
      const resolvedVideoUrls = referenceVideoUrls.map((url) => resolveReferenceUrl(url, publicUrl));
      payload.reference_video_urls = resolvedVideoUrls;
      payload.reference_video_url = resolvedVideoUrls[0];
    }

    // Add apiConfig for model-specific endpoints and payload formats (e.g., Veo 3)
    if (request.apiConfig) {
      payload.api_config = request.apiConfig;
    }

    // Add extraParams for additional model-specific parameters
    if (request.extraParams) {
      payload.extra_params = resolveExtraParamsUrls(request.extraParams, publicUrl);
    }

    this.logMediaRequest({
      request,
      requestType: "generateVideoAsync",
      mediaType: "video",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/async/video",
      payload,
    });

    try {
      const { data, status } = await this.submitTaskWithRetry({
        request,
        requestType: "generateVideoAsync",
        mediaType: "video",
        provider,
        model: modelId,
        endpoint: "/api/v1/media/async/video",
        userToken,
        payload,
      });
      this.logMediaResponse({
        request,
        requestType: "generateVideoAsync",
        mediaType: "video",
        provider,
        model: modelId,
        statusCode: status,
        success: true,
        responsePayload: data,
      });
      const task = this.mapTask(data);

      recordMediaUsage(provider, modelId, "video" as RateLimiterMediaType, true, 0);
      return task;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateVideoAsync",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateVideoAsync",
          mediaType: "video",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(provider, modelId, "video" as RateLimiterMediaType, false, 0);
      throw error;
    }
  }

  /**
   * Generate audio asynchronously (returns task ID for polling, with rate limiting)
   */
  async generateAudioAsync(
    request: AudioGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    const modelId = request.model || DEFAULT_MODELS.audio;
    const provider = resolveProvider(modelId, request.apiConfig);
    const payload: Record<string, unknown> = {
      text: request.text,
      model: modelId,
      voice: request.voice,
      speed: request.speed,
    };

    // Add apiConfig for model-specific endpoints and payload formats
    if (request.apiConfig) {
      payload.api_config = request.apiConfig;
    }

    // Add extraParams for model-specific fields
    if (request.extraParams) {
      payload.extra_params = resolveExtraParamsUrls(request.extraParams, request.publicUrl);
    }

    this.logMediaRequest({
      request,
      requestType: "generateAudioAsync",
      mediaType: "audio",
      provider,
      model: modelId,
      endpoint: "/api/v1/media/async/audio",
      payload,
    });

    try {
      const { data, status } = await this.submitTaskWithRetry({
        request,
        requestType: "generateAudioAsync",
        mediaType: "audio",
        provider,
        model: modelId,
        endpoint: "/api/v1/media/async/audio",
        userToken,
        payload,
      });
      this.logMediaResponse({
        request,
        requestType: "generateAudioAsync",
        mediaType: "audio",
        provider,
        model: modelId,
        statusCode: status,
        success: true,
        responsePayload: data,
      });
      const task = this.mapTask(data);

      recordMediaUsage(provider, modelId, "audio" as RateLimiterMediaType, true, 0);
      return task;
    } catch (error) {
      if (error instanceof MediaRequestError) {
        this.logMediaResponse({
          request,
          requestType: "generateAudioAsync",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: error.statusCode,
          success: false,
          responsePayload: error.responsePayload,
          errorMessage: sanitizeAuditError(error),
        });
      } else {
        this.logMediaResponse({
          request,
          requestType: "generateAudioAsync",
          mediaType: "audio",
          provider,
          model: modelId,
          statusCode: 0,
          success: false,
          errorMessage: sanitizeAuditError(error),
        });
      }
      recordMediaUsage(provider, modelId, "audio" as RateLimiterMediaType, false, 0);
      throw error;
    }
  }

  /**
   * Get task status by ID
   */
  async getTask(taskId: string, userToken: string, auditContext?: MediaAuditContext): Promise<MediaTask> {
    auditLogger.log({
      traceId: typeof auditContext?.traceId === "string" ? auditContext.traceId : undefined,
      eventType: "media_request",
      userId: typeof auditContext?.userId === "number" ? auditContext.userId : null,
      requestType: "getTask",
      mediaTaskId: taskId,
      requestPayload: {
        source: auditContext?.source ?? "media_generation_service",
        endpoint: `/api/v1/media/tasks/${taskId}`,
      },
    });

    const response = await fetch(`${this.baseUrl}/api/v1/media/tasks/${taskId}`, {
      method: "GET",
      headers: this.getHeaders(userToken),
    });

    const rawText = await response.text().catch(() => "");
    let parsed: unknown;
    if (!rawText) {
      parsed = {};
    } else {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = { raw: rawText.slice(0, 2000) };
      }
    }

    if (!response.ok) {
      const detail = (parsed as Record<string, unknown> | null)?.detail;
      const errorMessage = typeof detail === "string" && detail.trim().length > 0
        ? detail
        : `Get task failed: ${response.status}`;
      auditLogger.log({
        traceId: typeof auditContext?.traceId === "string" ? auditContext.traceId : undefined,
        eventType: "media_response",
        userId: typeof auditContext?.userId === "number" ? auditContext.userId : null,
        requestType: "getTask",
        mediaTaskId: taskId,
        statusCode: response.status,
        errorType: "media_task_fetch_failed",
        errorMessage: errorMessage.slice(0, 500),
        responsePayload: parsed,
      });
      throw new Error(errorMessage);
    }

    auditLogger.log({
      traceId: typeof auditContext?.traceId === "string" ? auditContext.traceId : undefined,
      eventType: "media_response",
      userId: typeof auditContext?.userId === "number" ? auditContext.userId : null,
      requestType: "getTask",
      mediaTaskId: taskId,
      statusCode: response.status,
      responsePayload: parsed,
    });
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid task payload");
    }
    return this.mapTask(parsed as Record<string, unknown>);
  }

  /**
   * List user's tasks
   */
  async listTasks(
    userToken: string,
    options?: {
      mediaType?: MediaType;
      status?: TaskStatus;
      limit?: number;
      offset?: number;
      daysAgo?: number;
    }
  ): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    if (options?.mediaType) params.append("media_type", options.mediaType);
    if (options?.status) params.append("status_filter", options.status);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.offset) params.append("offset", options.offset.toString());
    if (options?.daysAgo) params.append("days_ago", options.daysAgo.toString());

    const url = `${this.baseUrl}/api/v1/media/tasks${params.toString() ? `?${params}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.getHeaders(userToken),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `List tasks failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      tasks: (data.tasks || []).map((t: Record<string, unknown>) => this.mapTask(t)),
      total: data.total || 0,
      limit: data.limit || 50,
      offset: data.offset || 0,
    };
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, userToken: string): Promise<MediaTask> {
    const response = await fetch(`${this.baseUrl}/api/v1/media/tasks/${taskId}/cancel`, {
      method: "PATCH",
      headers: this.getHeaders(userToken),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `Cancel task failed: ${response.status}`);
    }

    const data = await response.json();
    return this.mapTask(data.task);
  }

  /**
   * Get available models
   */
  getModels(type?: MediaType): ModelMetadata[] {
    const models = Object.values(MEDIA_MODELS);
    if (type) {
      return models.filter((m) => m.type === type);
    }
    return models;
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): ModelMetadata | undefined {
    return MEDIA_MODELS[modelId];
  }

  /**
   * Map Python backend response to our format
   */
  private mapResponse(data: Record<string, unknown>): MediaGenerationResponse {
    return {
      success: true,
      data: (data.data as MediaGenerationResult[]) || [],
      creditsUsed: (data.credits_used as number) || 0,
      creditsBalance: (data.credits_balance as number) || 0,
      model: (data.model as string) || "",
    };
  }

  private extractTaskErrorMessage(data: Record<string, unknown>): string | undefined {
    const directError = data.error_message;
    if (typeof directError === "string" && directError.trim()) {
      return directError.trim();
    }

    const resultData = data.result_data;
    if (!resultData || typeof resultData !== "object") {
      return undefined;
    }

    const seen = new Set<string>();
    const messages: string[] = [];
    const enqueue = (value: unknown) => {
      if (typeof value !== "string") return;
      const normalized = value.trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      messages.push(normalized);
    };

    const extract = (value: unknown, depth: number) => {
      if (depth > 5 || value === null || value === undefined) return;
      if (typeof value === "string") {
        enqueue(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => extract(item, depth + 1));
        return;
      }
      if (typeof value !== "object") return;
      const obj = value as Record<string, unknown>;

      // Prioritized keys commonly used by providers.
      const priorityKeys = [
        "error",
        "errorMessage",
        "failMsg",
        "message",
        "msg",
        "detail",
        "reason",
      ];
      for (const key of priorityKeys) {
        if (key in obj) {
          extract(obj[key], depth + 1);
        }
      }

      // Traverse common nested containers.
      const nestedKeys = [
        "data",
        "response",
        "submission",
        "output",
        "result",
        "resultJson",
        "kie_ai_response",
        "raw_response",
      ];
      for (const key of nestedKeys) {
        if (key in obj) {
          extract(obj[key], depth + 1);
        }
      }
    };

    extract(resultData, 0);
    return messages[0];
  }

  /**
   * Map Python backend task to our format
   */
  mapTask(data: Record<string, unknown>): MediaTask {
    return {
      id: data.id as string,
      taskId: data.task_id as string | undefined, // External provider task ID (e.g., Kie.ai)
      celeryTaskId: data.celery_task_id as string | undefined,
      userId: data.user_id as string,
      mediaType: data.media_type as MediaType,
      status: data.status as TaskStatus,
      model: data.model as string,
      prompt: normalizeMediaPrompt(data.prompt),
      parameters: data.parameters as Record<string, unknown>,
      resultUrl: data.result_url as string,
      resultData: data.result_data as Record<string, unknown>,
      errorMessage: this.extractTaskErrorMessage(data),
      creditsUsed: data.credits_used as number,
      creditsBalance: data.credits_balance as number,
      createdAt: data.created_at as string,
      startedAt: data.started_at as string,
      completedAt: data.completed_at as string,
    };
  }
}

// Export singleton instance
export const mediaGenerationService = new MediaGenerationService();
