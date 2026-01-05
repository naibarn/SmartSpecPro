/**
 * SmartSpec Pro - React Hooks
 * React hooks for AI image, video, and audio generation.
 *
 * Installation:
 *   npm install @smartspec/react
 *
 * Usage:
 *   import { SmartSpecProvider, useImageGeneration } from '@smartspec/react';
 *
 *   function App() {
 *     return (
 *       <SmartSpecProvider apiKey="ss_live_xxx">
 *         <MyComponent />
 *       </SmartSpecProvider>
 *     );
 *   }
 *
 *   function MyComponent() {
 *     const { generate, result, isLoading, error } = useImageGeneration();
 *
 *     return (
 *       <button onClick={() => generate({ prompt: 'A cute cat' })}>
 *         Generate
 *       </button>
 *     );
 *   }
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  ReactNode,
} from 'react';

// =============================================================================
// TYPES
// =============================================================================

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

export interface GenerateImageOptions {
  prompt: string;
  model?: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  referenceImages?: string[];
}

export interface GenerateVideoOptions {
  prompt: string;
  model?: string;
  duration?: number;
  resolution?: string;
  multiShots?: boolean;
  referenceImage?: string;
}

export interface GenerateAudioOptions {
  text: string;
  model?: string;
  voice?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

export interface SmartSpecContextValue {
  apiKey: string;
  baseUrl: string;
  isReady: boolean;
}

export interface UseGenerationResult<T> {
  generate: (options: T) => Promise<GenerationResult>;
  result: GenerationResult | null;
  isLoading: boolean;
  error: Error | null;
  progress: number;
  reset: () => void;
}

// =============================================================================
// CONTEXT
// =============================================================================

const SmartSpecContext = createContext<SmartSpecContextValue | null>(null);

export interface SmartSpecProviderProps {
  apiKey: string;
  baseUrl?: string;
  children: ReactNode;
}

/**
 * SmartSpec Provider Component
 *
 * Wrap your app with this provider to use SmartSpec hooks.
 *
 * @example
 * ```tsx
 * function App() {
 *   return (
 *     <SmartSpecProvider apiKey="ss_live_xxx">
 *       <MyComponent />
 *     </SmartSpecProvider>
 *   );
 * }
 * ```
 */
export function SmartSpecProvider({
  apiKey,
  baseUrl = 'https://api.smartspec.pro/api/v1',
  children,
}: SmartSpecProviderProps) {
  const value = useMemo(
    () => ({
      apiKey,
      baseUrl,
      isReady: !!apiKey,
    }),
    [apiKey, baseUrl]
  );

  return (
    <SmartSpecContext.Provider value={value}>
      {children}
    </SmartSpecContext.Provider>
  );
}

/**
 * Hook to access SmartSpec context
 */
export function useSmartSpec(): SmartSpecContextValue {
  const context = useContext(SmartSpecContext);
  if (!context) {
    throw new Error('useSmartSpec must be used within a SmartSpecProvider');
  }
  return context;
}

// =============================================================================
// API HELPERS
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

async function apiRequest<T>(
  baseUrl: string,
  apiKey: string,
  method: string,
  endpoint: string,
  body?: any
): Promise<T> {
  const response = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(transformKeys(body, camelToSnake)) : undefined,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `HTTP error: ${response.status}`);
  }

  const data = await response.json();
  return transformKeys<T>(data, snakeToCamel);
}

// =============================================================================
// GENERATION HOOKS
// =============================================================================

/**
 * Hook for image generation
 *
 * @example
 * ```tsx
 * function ImageGenerator() {
 *   const { generate, result, isLoading, error, progress } = useImageGeneration();
 *
 *   const handleGenerate = async () => {
 *     await generate({
 *       prompt: 'A beautiful sunset',
 *       aspectRatio: '16:9',
 *       resolution: '2K'
 *     });
 *   };
 *
 *   return (
 *     <div>
 *       <button onClick={handleGenerate} disabled={isLoading}>
 *         {isLoading ? `Generating... ${progress}%` : 'Generate Image'}
 *       </button>
 *       {error && <p className="error">{error.message}</p>}
 *       {result?.outputUrl && <img src={result.outputUrl} alt="Generated" />}
 *     </div>
 *   );
 * }
 * ```
 */
export function useImageGeneration(): UseGenerationResult<GenerateImageOptions> {
  const { apiKey, baseUrl } = useSmartSpec();
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  const generate = useCallback(
    async (options: GenerateImageOptions): Promise<GenerationResult> => {
      setIsLoading(true);
      setError(null);
      setProgress(0);

      try {
        // Create task
        const task = await apiRequest<GenerationResult>(
          baseUrl,
          apiKey,
          'POST',
          '/generation/image',
          {
            prompt: options.prompt,
            modelId: options.model || 'nano-banana-pro',
            aspectRatio: options.aspectRatio || '1:1',
            resolution: options.resolution || '2K',
            outputFormat: options.outputFormat || 'png',
            referenceImages: options.referenceImages,
          }
        );

        setResult(task);

        // Poll for completion
        let currentTask = task;
        while (!['completed', 'failed', 'cancelled'].includes(currentTask.status)) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          currentTask = await apiRequest<GenerationResult>(
            baseUrl,
            apiKey,
            'GET',
            `/generation/tasks/${task.id}`
          );
          setResult(currentTask);
          setProgress(Math.round(currentTask.progress * 100));
        }

        if (currentTask.status === 'failed') {
          throw new Error(currentTask.errorMessage || 'Generation failed');
        }

        return currentTask;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiKey, baseUrl]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(0);
  }, []);

  return { generate, result, isLoading, error, progress, reset };
}

/**
 * Hook for video generation
 *
 * @example
 * ```tsx
 * function VideoGenerator() {
 *   const { generate, result, isLoading, progress } = useVideoGeneration();
 *
 *   return (
 *     <button onClick={() => generate({ prompt: 'A dog running' })}>
 *       {isLoading ? `Generating... ${progress}%` : 'Generate Video'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useVideoGeneration(): UseGenerationResult<GenerateVideoOptions> {
  const { apiKey, baseUrl } = useSmartSpec();
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  const generate = useCallback(
    async (options: GenerateVideoOptions): Promise<GenerationResult> => {
      setIsLoading(true);
      setError(null);
      setProgress(0);

      try {
        const task = await apiRequest<GenerationResult>(
          baseUrl,
          apiKey,
          'POST',
          '/generation/video',
          {
            prompt: options.prompt,
            modelId: options.model || 'wan/2-6-text-to-video',
            duration: options.duration || 5,
            resolution: options.resolution || '720p',
            multiShots: options.multiShots || false,
            referenceImage: options.referenceImage,
          }
        );

        setResult(task);

        let currentTask = task;
        while (!['completed', 'failed', 'cancelled'].includes(currentTask.status)) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          currentTask = await apiRequest<GenerationResult>(
            baseUrl,
            apiKey,
            'GET',
            `/generation/tasks/${task.id}`
          );
          setResult(currentTask);
          setProgress(Math.round(currentTask.progress * 100));
        }

        if (currentTask.status === 'failed') {
          throw new Error(currentTask.errorMessage || 'Generation failed');
        }

        return currentTask;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiKey, baseUrl]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(0);
  }, []);

  return { generate, result, isLoading, error, progress, reset };
}

/**
 * Hook for audio/speech generation
 *
 * @example
 * ```tsx
 * function AudioGenerator() {
 *   const { generate, result, isLoading } = useAudioGeneration();
 *
 *   return (
 *     <button onClick={() => generate({ text: 'Hello world!' })}>
 *       {isLoading ? 'Generating...' : 'Generate Audio'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useAudioGeneration(): UseGenerationResult<GenerateAudioOptions> {
  const { apiKey, baseUrl } = useSmartSpec();
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  const generate = useCallback(
    async (options: GenerateAudioOptions): Promise<GenerationResult> => {
      setIsLoading(true);
      setError(null);
      setProgress(0);

      try {
        const task = await apiRequest<GenerationResult>(
          baseUrl,
          apiKey,
          'POST',
          '/generation/audio',
          {
            text: options.text,
            modelId: options.model || 'elevenlabs/text-to-speech-turbo-2-5',
            voice: options.voice || 'Rachel',
            stability: options.stability ?? 0.5,
            similarityBoost: options.similarityBoost ?? 0.75,
            speed: options.speed ?? 1.0,
          }
        );

        setResult(task);

        let currentTask = task;
        while (!['completed', 'failed', 'cancelled'].includes(currentTask.status)) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          currentTask = await apiRequest<GenerationResult>(
            baseUrl,
            apiKey,
            'GET',
            `/generation/tasks/${task.id}`
          );
          setResult(currentTask);
          setProgress(Math.round(currentTask.progress * 100));
        }

        if (currentTask.status === 'failed') {
          throw new Error(currentTask.errorMessage || 'Generation failed');
        }

        return currentTask;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error');
        setError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [apiKey, baseUrl]
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setProgress(0);
  }, []);

  return { generate, result, isLoading, error, progress, reset };
}

// =============================================================================
// MODEL HOOKS
// =============================================================================

/**
 * Hook to fetch available models
 *
 * @example
 * ```tsx
 * function ModelSelector() {
 *   const { models, isLoading } = useModels('image');
 *
 *   return (
 *     <select>
 *       {models.map(model => (
 *         <option key={model.id} value={model.id}>{model.name}</option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */
export function useModels(mediaType?: string) {
  const { apiKey, baseUrl } = useSmartSpec();
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const endpoint = mediaType
          ? `/generation/models?media_type=${mediaType}`
          : '/generation/models';
        const data = await apiRequest<ModelInfo[]>(baseUrl, apiKey, 'GET', endpoint);
        setModels(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch models'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchModels();
  }, [apiKey, baseUrl, mediaType]);

  return { models, isLoading, error };
}

// =============================================================================
// TASK HOOKS
// =============================================================================

/**
 * Hook to fetch task history
 *
 * @example
 * ```tsx
 * function TaskHistory() {
 *   const { tasks, isLoading, refetch } = useTasks({ mediaType: 'image' });
 *
 *   return (
 *     <div>
 *       {tasks.map(task => (
 *         <div key={task.id}>{task.prompt}</div>
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTasks(options?: { mediaType?: string; status?: string; limit?: number }) {
  const { apiKey, baseUrl } = useSmartSpec();
  const [tasks, setTasks] = useState<GenerationResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchTasks = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (options?.mediaType) params.append('media_type', options.mediaType);
      if (options?.status) params.append('status', options.status);
      if (options?.limit) params.append('limit', String(options.limit));

      const endpoint = `/generation/tasks${params.toString() ? `?${params}` : ''}`;
      const data = await apiRequest<GenerationResult[]>(baseUrl, apiKey, 'GET', endpoint);
      setTasks(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch tasks'));
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, baseUrl, options?.mediaType, options?.status, options?.limit]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, isLoading, error, refetch: fetchTasks };
}

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  SmartSpecProvider,
  useSmartSpec,
  useImageGeneration,
  useVideoGeneration,
  useAudioGeneration,
  useModels,
  useTasks,
};
