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

// ==================== Types ====================

export type MediaType = "image" | "video" | "audio";

export type ImageModel =
  | "google-nano-banana-pro"
  | "flux-2.0"
  | "z-image"
  | "grok-imagine"
  // BytePlus ModelArk — Seedream image models
  | "seedream-4-5-251128"
  | "seedream-4-0-250828";

export type VideoModel =
  | "veo-3-1"
  | "sora-2"
  | "kling-2.6"
  // BytePlus ModelArk — Seedance video models
  | "seedance-1-0-pro-fast-251015"
  | "seedance-1-0-pro-250528"
  | "seedance-1-0-lite-t2v-250428"
  | "seedance-1-0-lite-i2v-250428";

export type AudioModel =
  | "elevenlabs-tts"
  | "elevenlabs-sfx";

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
  /** Reference video URL for vid2vid */
  referenceVideoUrl?: string;
}

export interface AudioGenerationRequest {
  text: string;
  model?: AudioModel;
  voice?: string;
  speed?: number;
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

// Support multiple env var names for docker compatibility
// PYTHON_BACKEND_URL (preferred) -> BACKEND_URL -> localhost fallback
const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:8000";
const NODE_ENV = process.env.NODE_ENV || "development";

// Public URL for external services (like KIE AI) to access uploaded files
// This should be the tenant's public domain (e.g., https://smartaihub.app)
// Falls back to internal URL for backward compatibility
const PUBLIC_URL =
  process.env.PUBLIC_URL ||
  process.env.APP_PUBLIC_URL ||
  process.env.VITE_APP_URL ||
  null;

// Internal URL for Python backend to access Node.js server (for file downloads)
// In Docker, this is the internal container network URL
const NODE_SERVER_INTERNAL_URL =
  process.env.NODE_SERVER_INTERNAL_URL ||
  "http://smartspec-web:3000";

/**
 * Convert relative URLs (e.g., /uploads/xxx.png) to full URLs
 * so external services (like KIE AI) can download the files
 * @param url The URL to resolve
 * @param publicUrl Optional public URL from request context (tenant domain, e.g., https://smartaihub.app)
 */
function resolveReferenceUrl(url: string, publicUrl?: string | null): string {
  if (!url) return url;

  // If already a full URL, return as-is
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  // Convert relative path to full URL
  // Priority: 1) Request's publicUrl (tenant domain), 2) Env PUBLIC_URL, 3) Internal URL
  if (url.startsWith("/uploads/") || url.startsWith("/")) {
    const baseUrl = publicUrl || PUBLIC_URL || NODE_SERVER_INTERNAL_URL;
    return `${baseUrl}${url}`;
  }

  return url;
}

/**
 * Process extraParams and resolve any relative URLs (e.g., image_input field)
 * This ensures URLs like /uploads/... are converted to full URLs for the Python backend
 * @param extraParams The extra parameters object
 * @param publicUrl Optional public URL from request context (tenant domain)
 */
function resolveExtraParamsUrls(extraParams: Record<string, any>, publicUrl?: string | null): Record<string, any> {
  const resolved = { ...extraParams };
  for (const [key, value] of Object.entries(resolved)) {
    // If value is an array of strings that look like relative URLs, resolve them
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
      const firstVal = value[0] as string;
      if (firstVal.startsWith('/uploads/') || (firstVal.startsWith('/') && !firstVal.startsWith('//'))) {
        resolved[key] = value.map((url: string) => resolveReferenceUrl(url, publicUrl));
      }
    }
    // If value is a single string that looks like a relative URL
    else if (typeof value === 'string' && (value.startsWith('/uploads/') || (value.startsWith('/') && !value.startsWith('//')))) {
      resolved[key] = resolveReferenceUrl(value, publicUrl);
    }
  }
  return resolved;
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

export class MediaGenerationService {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    const rawUrl = baseUrl || PYTHON_BACKEND_URL;
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

  /**
   * Generate image synchronously (with rate limiting)
   */
  async generateImage(
    request: ImageGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    const modelId = request.model || DEFAULT_MODELS.image;
    const modelMeta = MEDIA_MODELS[modelId];
    const provider = modelMeta?.provider || "kie.ai";

    const payload: Record<string, unknown> = {
      prompt: request.prompt,
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

    // Add per-model API config from configJson
    if ((request as any).apiConfig) {
      payload.api_config = (request as any).apiConfig;
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
    if (request.referenceImageUrls && request.referenceImageUrls.length > 0) {
      payload.reference_image_urls = request.referenceImageUrls
        .slice(0, 5)
        .map(url => resolveReferenceUrl(url, publicUrl));
    }

    // Add reference style if provided
    if (request.referenceStyleUrl) {
      payload.reference_style_url = resolveReferenceUrl(request.referenceStyleUrl, publicUrl);
    }

    // Use rate limiter to prevent overwhelming the API
    try {
      const result = await scheduleMediaWithLimiter(provider, "image" as RateLimiterMediaType, async () => {
        const response = await fetch(`${this.baseUrl}/api/v1/media/image`, {
          method: "POST",
          headers: this.getHeaders(userToken),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Image generation failed: ${response.status}`);
        }

        const data = await response.json();
        return this.mapResponse(data);
      });

      // Record successful usage
      recordMediaUsage(provider, modelId, "image" as RateLimiterMediaType, true, result.creditsUsed);
      return result;
    } catch (error) {
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
    const modelMeta = MEDIA_MODELS[modelId];
    const provider = modelMeta?.provider || "kie.ai";

    const payload: Record<string, unknown> = {
      prompt: request.prompt,
      model: modelId,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      fps: request.fps,
    };

    // Add resolution if provided (e.g., "720p", "1080p")
    if (request.resolution) {
      payload.resolution = request.resolution;
    }

    // Add per-model API config from configJson
    if ((request as any).apiConfig) {
      payload.api_config = (request as any).apiConfig;
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
    if (request.referenceImageUrls && request.referenceImageUrls.length > 0) {
      payload.reference_image_urls = request.referenceImageUrls
        .slice(0, 5)
        .map(url => resolveReferenceUrl(url, publicUrl));
    }

    // Add reference video for vid2vid
    if (request.referenceVideoUrl) {
      payload.reference_video_url = resolveReferenceUrl(request.referenceVideoUrl, publicUrl);
    }

    // Use rate limiter with video priority (lower priority due to resource intensity)
    try {
      const result = await scheduleMediaWithLimiter(provider, "video" as RateLimiterMediaType, async () => {
        const response = await fetch(`${this.baseUrl}/api/v1/media/video`, {
          method: "POST",
          headers: this.getHeaders(userToken),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Video generation failed: ${response.status}`);
        }

        const data = await response.json();
        return this.mapResponse(data);
      });

      recordMediaUsage(provider, modelId, "video" as RateLimiterMediaType, true, result.creditsUsed);
      return result;
    } catch (error) {
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
    const modelMeta = MEDIA_MODELS[modelId];
    const provider = modelMeta?.provider || "kie.ai";

    const payload = {
      text: request.text,
      model: modelId,
      voice: request.voice,
      speed: request.speed,
    };

    try {
      const result = await scheduleMediaWithLimiter(provider, "audio" as RateLimiterMediaType, async () => {
        const response = await fetch(`${this.baseUrl}/api/v1/media/audio`, {
          method: "POST",
          headers: this.getHeaders(userToken),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Audio generation failed: ${response.status}`);
        }

        const data = await response.json();
        return this.mapResponse(data);
      });

      recordMediaUsage(provider, modelId, "audio" as RateLimiterMediaType, true, result.creditsUsed);
      return result;
    } catch (error) {
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
    const modelMeta = MEDIA_MODELS[modelId];
    const provider = modelMeta?.provider || "kie.ai";

    const payload: Record<string, unknown> = {
      prompt: request.prompt,
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

    // Add apiConfig for model-specific endpoints and payload formats
    if (request.apiConfig) {
      payload.api_config = request.apiConfig;
    }

    // Add extraParams for model-specific fields
    if (request.extraParams) {
      payload.extra_params = resolveExtraParamsUrls(request.extraParams, publicUrl);
    }

    // Add reference images if provided (1-5 images)
    if (request.referenceImageUrls && request.referenceImageUrls.length > 0) {
      payload.reference_image_urls = request.referenceImageUrls
        .slice(0, 5)
        .map(url => resolveReferenceUrl(url, publicUrl));
    }

    // Add reference style if provided
    if (request.referenceStyleUrl) {
      payload.reference_style_url = resolveReferenceUrl(request.referenceStyleUrl, publicUrl);
    }

    try {
      const task = await scheduleMediaWithLimiter(provider, "image" as RateLimiterMediaType, async () => {
        const response = await fetch(`${this.baseUrl}/api/v1/media/async/image`, {
          method: "POST",
          headers: this.getHeaders(userToken),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Async image generation failed: ${response.status}`);
        }

        const data = await response.json();
        return this.mapTask(data);
      });

      // Record task submission (actual completion tracked separately)
      recordMediaUsage(provider, modelId, "image" as RateLimiterMediaType, true, 0);
      return task;
    } catch (error) {
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
    const modelMeta = MEDIA_MODELS[modelId];
    const provider = modelMeta?.provider || "kie.ai";

    const payload: Record<string, unknown> = {
      prompt: request.prompt,
      model: modelId,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      fps: request.fps,
      resolution: request.resolution,
    };

    // Get publicUrl from request for resolving relative URLs to tenant domain
    const publicUrl = request.publicUrl;

    // Add reference images for img2vid
    if (request.referenceImageUrls && request.referenceImageUrls.length > 0) {
      payload.reference_image_urls = request.referenceImageUrls
        .slice(0, 5)
        .map(url => resolveReferenceUrl(url, publicUrl));
    }

    // Add reference video for vid2vid
    if (request.referenceVideoUrl) {
      payload.reference_video_url = resolveReferenceUrl(request.referenceVideoUrl, publicUrl);
    }

    // Add apiConfig for model-specific endpoints and payload formats (e.g., Veo 3)
    if (request.apiConfig) {
      payload.api_config = request.apiConfig;
    }

    // Add extraParams for additional model-specific parameters
    if (request.extraParams) {
      payload.extra_params = resolveExtraParamsUrls(request.extraParams, publicUrl);
    }

    console.log('[MediaGeneration] generateVideoAsync called with:', {
      model: modelId,
      provider,
      baseUrl: this.baseUrl,
      payloadKeys: Object.keys(payload),
    });

    try {
      const task = await scheduleMediaWithLimiter(provider, "video" as RateLimiterMediaType, async () => {
        const url = `${this.baseUrl}/api/v1/media/async/video`;
        console.log('[MediaGeneration] Making POST request to:', url);
        console.log('[MediaGeneration] Payload:', JSON.stringify(payload, null, 2));

        const response = await fetch(url, {
          method: "POST",
          headers: this.getHeaders(userToken),
          body: JSON.stringify(payload),
        });

        console.log('[MediaGeneration] Response status:', response.status);

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          console.error('[MediaGeneration] Error response:', error);
          throw new Error(error.detail || `Async video generation failed: ${response.status}`);
        }

        const data = await response.json();
        console.log('[MediaGeneration] Success response data:', data);
        return this.mapTask(data);
      });

      console.log('[MediaGeneration] Task created and mapped:', task);
      recordMediaUsage(provider, modelId, "video" as RateLimiterMediaType, true, 0);
      return task;
    } catch (error) {
      console.error('[MediaGeneration] Error in generateVideoAsync:', error);
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
    const modelMeta = MEDIA_MODELS[modelId];
    const provider = modelMeta?.provider || "kie.ai";

    const payload = {
      text: request.text,
      model: modelId,
      voice: request.voice,
      speed: request.speed,
    };

    try {
      const task = await scheduleMediaWithLimiter(provider, "audio" as RateLimiterMediaType, async () => {
        const response = await fetch(`${this.baseUrl}/api/v1/media/async/audio`, {
          method: "POST",
          headers: this.getHeaders(userToken),
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Async audio generation failed: ${response.status}`);
        }

        const data = await response.json();
        return this.mapTask(data);
      });

      recordMediaUsage(provider, modelId, "audio" as RateLimiterMediaType, true, 0);
      return task;
    } catch (error) {
      recordMediaUsage(provider, modelId, "audio" as RateLimiterMediaType, false, 0);
      throw error;
    }
  }

  /**
   * Get task status by ID
   */
  async getTask(taskId: string, userToken: string): Promise<MediaTask> {
    const response = await fetch(`${this.baseUrl}/api/v1/media/tasks/${taskId}`, {
      method: "GET",
      headers: this.getHeaders(userToken),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `Get task failed: ${response.status}`);
    }

    const data = await response.json();
    return this.mapTask(data);
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
  private mapTask(data: Record<string, unknown>): MediaTask {
    return {
      id: data.id as string,
      taskId: data.task_id as string | undefined, // External provider task ID (e.g., Kie.ai)
      celeryTaskId: data.celery_task_id as string | undefined,
      userId: data.user_id as string,
      mediaType: data.media_type as MediaType,
      status: data.status as TaskStatus,
      model: data.model as string,
      prompt: data.prompt as string,
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
