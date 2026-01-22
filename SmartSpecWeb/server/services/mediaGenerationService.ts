/**
 * Media Generation Service
 * Proxies requests to Python backend for image, video, and audio generation
 */

// ==================== Types ====================

export type MediaType = "image" | "video" | "audio";

export type ImageModel =
  | "google-nano-banana-pro"
  | "flux-2.0"
  | "z-image"
  | "grok-imagine";

export type VideoModel =
  | "veo-3-1"
  | "sora-2"
  | "kling-2.6";

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
  model?: ImageModel;
  size?: string;
  aspectRatio?: string;
  negativePrompt?: string;
  numImages?: number;
}

export interface VideoGenerationRequest {
  prompt: string;
  model?: VideoModel;
  duration?: number;
  aspectRatio?: string;
  fps?: number;
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
// PYTHON_BACKEND_URL (preferred) -> BACKEND_URL -> OAUTH_SERVER_URL (fallback)
const PYTHON_BACKEND_URL =
  process.env.PYTHON_BACKEND_URL ||
  process.env.BACKEND_URL ||
  process.env.OAUTH_SERVER_URL ||
  "http://localhost:8000";
const NODE_ENV = process.env.NODE_ENV || "development";

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
   * Generate image synchronously
   */
  async generateImage(
    request: ImageGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    const payload = {
      prompt: request.prompt,
      model: request.model || DEFAULT_MODELS.image,
      size: request.size,
      aspect_ratio: request.aspectRatio,
      negative_prompt: request.negativePrompt,
      n: request.numImages || 1,
    };

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
  }

  /**
   * Generate video synchronously
   */
  async generateVideo(
    request: VideoGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    const payload = {
      prompt: request.prompt,
      model: request.model || DEFAULT_MODELS.video,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      fps: request.fps,
    };

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
  }

  /**
   * Generate audio synchronously
   */
  async generateAudio(
    request: AudioGenerationRequest,
    userToken: string
  ): Promise<MediaGenerationResponse> {
    const payload = {
      text: request.text,
      model: request.model || DEFAULT_MODELS.audio,
      voice: request.voice,
      speed: request.speed,
    };

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
  }

  /**
   * Generate image asynchronously (returns task ID for polling)
   */
  async generateImageAsync(
    request: ImageGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    const payload = {
      prompt: request.prompt,
      model: request.model || DEFAULT_MODELS.image,
      size: request.size,
      aspect_ratio: request.aspectRatio,
      negative_prompt: request.negativePrompt,
      n: request.numImages || 1,
    };

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
  }

  /**
   * Generate video asynchronously (returns task ID for polling)
   */
  async generateVideoAsync(
    request: VideoGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    const payload = {
      prompt: request.prompt,
      model: request.model || DEFAULT_MODELS.video,
      duration: request.duration,
      aspect_ratio: request.aspectRatio,
      fps: request.fps,
    };

    const response = await fetch(`${this.baseUrl}/api/v1/media/async/video`, {
      method: "POST",
      headers: this.getHeaders(userToken),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || `Async video generation failed: ${response.status}`);
    }

    const data = await response.json();
    return this.mapTask(data);
  }

  /**
   * Generate audio asynchronously (returns task ID for polling)
   */
  async generateAudioAsync(
    request: AudioGenerationRequest,
    userToken: string
  ): Promise<MediaTask> {
    const payload = {
      text: request.text,
      model: request.model || DEFAULT_MODELS.audio,
      voice: request.voice,
      speed: request.speed,
    };

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
    }
  ): Promise<TaskListResponse> {
    const params = new URLSearchParams();
    if (options?.mediaType) params.append("media_type", options.mediaType);
    if (options?.status) params.append("status_filter", options.status);
    if (options?.limit) params.append("limit", options.limit.toString());
    if (options?.offset) params.append("offset", options.offset.toString());

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

  /**
   * Map Python backend task to our format
   */
  private mapTask(data: Record<string, unknown>): MediaTask {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      mediaType: data.media_type as MediaType,
      status: data.status as TaskStatus,
      model: data.model as string,
      prompt: data.prompt as string,
      parameters: data.parameters as Record<string, unknown>,
      resultUrl: data.result_url as string,
      resultData: data.result_data as Record<string, unknown>,
      errorMessage: data.error_message as string,
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
