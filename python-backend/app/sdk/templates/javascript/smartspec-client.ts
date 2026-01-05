/**
 * SmartSpec Pro - JavaScript/TypeScript SDK
 * Easy-to-use client for AI image, video, and audio generation.
 *
 * Installation:
 *   npm install @smartspec/sdk
 *
 * Usage:
 *   import { SmartSpecClient } from '@smartspec/sdk';
 *
 *   const client = new SmartSpecClient({ apiKey: 'ss_live_xxx' });
 *
 *   // Generate an image
 *   const result = await client.generateImage({
 *     prompt: 'A beautiful sunset over mountains',
 *     aspectRatio: '16:9',
 *     resolution: '2K'
 *   });
 *   console.log(result.outputUrl);
 */

const VERSION = '1.0.0';

// =============================================================================
// TYPES
// =============================================================================

export type MediaType = 'image' | 'video' | 'audio';

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GenerationResult {
  id: string;
  status: TaskStatus;
  taskType: string;
  modelId: string;
  prompt: string;
  outputUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
  creditsUsed: number;
  progress: number;
  createdAt?: string;
  completedAt?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  mediaType: string;
  description: string;
  status: string;
  isFeatured: boolean;
  baseCredits: number;
  aspectRatios?: string[];
  resolutions?: string[];
  durations?: number[];
  outputFormats?: string[];
  tags?: string[];
}

export interface SmartSpecConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
}

export interface GenerateImageOptions {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  referenceImages?: string[];
  wait?: boolean;
  timeout?: number;
}

export interface GenerateVideoOptions {
  prompt: string;
  model?: string;
  duration?: number;
  resolution?: string;
  multiShots?: boolean;
  referenceImage?: string;
  wait?: boolean;
  timeout?: number;
}

export interface GenerateAudioOptions {
  text: string;
  model?: string;
  voice?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
  wait?: boolean;
  timeout?: number;
}

export interface ListTasksOptions {
  mediaType?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// ERRORS
// =============================================================================

export class SmartSpecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmartSpecError';
  }
}

export class AuthenticationError extends SmartSpecError {
  constructor(message: string = 'Invalid API key') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends SmartSpecError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends SmartSpecError {
  constructor(message: string = 'Validation error') {
    super(message);
    this.name = 'ValidationError';
  }
}

export class GenerationError extends SmartSpecError {
  constructor(message: string) {
    super(message);
    this.name = 'GenerationError';
  }
}

// =============================================================================
// HELPERS
// =============================================================================

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function transformKeys<T>(obj: any, transformer: (key: string) => string): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeys(item, transformer)) as T;
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).reduce((acc, key) => {
      const newKey = transformer(key);
      acc[newKey] = transformKeys(obj[key], transformer);
      return acc;
    }, {} as any) as T;
  }
  return obj;
}

function toSnakeCase<T>(obj: T): any {
  return transformKeys(obj, camelToSnake);
}

function toCamelCase<T>(obj: any): T {
  return transformKeys(obj, snakeToCamel);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// CLIENT
// =============================================================================

/**
 * SmartSpec Pro API Client
 *
 * @example
 * ```typescript
 * const client = new SmartSpecClient({ apiKey: 'ss_live_xxx' });
 *
 * // Generate an image
 * const result = await client.generateImage({
 *   prompt: 'A cute cat wearing a hat',
 *   aspectRatio: '1:1',
 *   resolution: '2K',
 *   wait: true
 * });
 *
 * console.log(result.outputUrl);
 * ```
 */
export class SmartSpecClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(config: SmartSpecConfig) {
    this.apiKey = config.apiKey;
    if (!this.apiKey) {
      throw new AuthenticationError(
        'API key is required. Pass apiKey in config or set SMARTSPEC_API_KEY environment variable.'
      );
    }

    this.baseUrl =
      config.baseUrl ||
      (typeof process !== 'undefined'
        ? process.env.SMARTSPEC_BASE_URL
        : undefined) ||
      'https://api.smartspec.pro/api/v1';
    this.timeout = config.timeout || 60000;
  }

  private async request<T>(
    method: string,
    endpoint: string,
    options: {
      body?: any;
      params?: Record<string, any>;
    } = {}
  ): Promise<T> {
    const url = new URL(endpoint, this.baseUrl);

    if (options.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(camelToSnake(key), String(value));
        }
      });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': `SmartSpec-JS-SDK/${VERSION}`,
        },
        body: options.body ? JSON.stringify(toSnakeCase(options.body)) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 401) {
        throw new AuthenticationError();
      } else if (response.status === 429) {
        throw new RateLimitError();
      } else if (response.status === 400) {
        const data = await response.json();
        throw new ValidationError(data.detail || 'Validation error');
      }

      if (!response.ok) {
        throw new SmartSpecError(`HTTP error: ${response.status}`);
      }

      const data = await response.json();
      return toCamelCase<T>(data);
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof SmartSpecError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new SmartSpecError('Request timed out');
      }
      throw new SmartSpecError(`Request failed: ${(error as Error).message}`);
    }
  }

  // ===========================================================================
  // MODELS
  // ===========================================================================

  /**
   * List available generation models.
   *
   * @param mediaType - Filter by type (image, video, audio)
   * @param includeBeta - Include beta models
   * @returns List of ModelInfo objects
   */
  async listModels(
    mediaType?: string,
    includeBeta: boolean = true
  ): Promise<ModelInfo[]> {
    return this.request<ModelInfo[]>('GET', '/generation/models', {
      params: { mediaType, includeBeta },
    });
  }

  /**
   * Get information about a specific model.
   *
   * @param modelId - Model identifier
   * @returns ModelInfo object
   */
  async getModel(modelId: string): Promise<ModelInfo> {
    return this.request<ModelInfo>('GET', `/generation/models/${modelId}`);
  }

  // ===========================================================================
  // IMAGE GENERATION
  // ===========================================================================

  /**
   * Generate an image using AI.
   *
   * @param options - Generation options
   * @returns GenerationResult object
   *
   * @example
   * ```typescript
   * const result = await client.generateImage({
   *   prompt: 'A beautiful sunset over mountains',
   *   aspectRatio: '16:9',
   *   resolution: '2K',
   *   wait: true
   * });
   * console.log(result.outputUrl);
   * ```
   */
  async generateImage(options: GenerateImageOptions): Promise<GenerationResult> {
    const payload = {
      prompt: options.prompt,
      modelId: options.model || 'nano-banana-pro',
      aspectRatio: options.aspectRatio || '1:1',
      resolution: options.resolution || '2K',
      outputFormat: options.outputFormat || 'png',
      referenceImages: options.referenceImages,
    };

    const result = await this.request<GenerationResult>(
      'POST',
      '/generation/image',
      { body: payload }
    );

    if (options.wait) {
      return this.waitForTask(result.id, options.timeout || 120000);
    }

    return result;
  }

  // ===========================================================================
  // VIDEO GENERATION
  // ===========================================================================

  /**
   * Generate a video using AI.
   *
   * @param options - Generation options
   * @returns GenerationResult object
   *
   * @example
   * ```typescript
   * const result = await client.generateVideo({
   *   prompt: 'A dog running on the beach',
   *   duration: 5,
   *   resolution: '720p',
   *   wait: true
   * });
   * console.log(result.outputUrl);
   * ```
   */
  async generateVideo(options: GenerateVideoOptions): Promise<GenerationResult> {
    const payload = {
      prompt: options.prompt,
      modelId: options.model || 'wan/2-6-text-to-video',
      duration: options.duration || 5,
      resolution: options.resolution || '720p',
      multiShots: options.multiShots || false,
      referenceImage: options.referenceImage,
    };

    const result = await this.request<GenerationResult>(
      'POST',
      '/generation/video',
      { body: payload }
    );

    if (options.wait) {
      return this.waitForTask(result.id, options.timeout || 300000);
    }

    return result;
  }

  // ===========================================================================
  // AUDIO GENERATION
  // ===========================================================================

  /**
   * Generate audio/speech using AI.
   *
   * @param options - Generation options
   * @returns GenerationResult object
   *
   * @example
   * ```typescript
   * const result = await client.generateAudio({
   *   text: 'Hello, welcome to SmartSpec Pro!',
   *   voice: 'Rachel',
   *   wait: true
   * });
   * console.log(result.outputUrl);
   * ```
   */
  async generateAudio(options: GenerateAudioOptions): Promise<GenerationResult> {
    const payload = {
      text: options.text,
      modelId: options.model || 'elevenlabs/text-to-speech-turbo-2-5',
      voice: options.voice || 'Rachel',
      stability: options.stability ?? 0.5,
      similarityBoost: options.similarityBoost ?? 0.75,
      speed: options.speed ?? 1.0,
    };

    const result = await this.request<GenerationResult>(
      'POST',
      '/generation/audio',
      { body: payload }
    );

    if (options.wait) {
      return this.waitForTask(result.id, options.timeout || 60000);
    }

    return result;
  }

  // ===========================================================================
  // TASK MANAGEMENT
  // ===========================================================================

  /**
   * Get the status of a generation task.
   *
   * @param taskId - Task identifier
   * @returns GenerationResult object
   */
  async getTask(taskId: string): Promise<GenerationResult> {
    return this.request<GenerationResult>('GET', `/generation/tasks/${taskId}`);
  }

  /**
   * Wait for a task to complete.
   *
   * @param taskId - Task identifier
   * @param timeout - Maximum wait time in milliseconds
   * @param pollInterval - Time between status checks in milliseconds
   * @returns GenerationResult object
   */
  async waitForTask(
    taskId: string,
    timeout: number = 300000,
    pollInterval: number = 2000
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    while (true) {
      const result = await this.getTask(taskId);

      if (['completed', 'failed', 'cancelled'].includes(result.status)) {
        return result;
      }

      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        throw new GenerationError(`Task timed out after ${timeout}ms`);
      }

      await sleep(pollInterval);
    }
  }

  /**
   * List generation tasks.
   *
   * @param options - List options
   * @returns List of GenerationResult objects
   */
  async listTasks(options: ListTasksOptions = {}): Promise<GenerationResult[]> {
    return this.request<GenerationResult[]>('GET', '/generation/tasks', {
      params: {
        mediaType: options.mediaType,
        status: options.status,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
  }

  /**
   * Delete a generation task.
   *
   * @param taskId - Task identifier
   * @returns True if deleted successfully
   */
  async deleteTask(taskId: string): Promise<boolean> {
    await this.request('DELETE', `/generation/tasks/${taskId}`);
    return true;
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a SmartSpec client.
 *
 * @param apiKey - API key (or set SMARTSPEC_API_KEY env var)
 * @returns SmartSpecClient instance
 */
export function createClient(apiKey?: string): SmartSpecClient {
  const key =
    apiKey ||
    (typeof process !== 'undefined' ? process.env.SMARTSPEC_API_KEY : undefined);

  if (!key) {
    throw new AuthenticationError(
      'API key is required. Pass apiKey parameter or set SMARTSPEC_API_KEY environment variable.'
    );
  }

  return new SmartSpecClient({ apiKey: key });
}

// Default export
export default SmartSpecClient;
