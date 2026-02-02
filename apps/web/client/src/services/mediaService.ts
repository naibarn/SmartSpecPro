/**
 * Media Generation Service
 * Handles API calls for image, video, and audio generation
 */

import { getAuthToken } from './authService';

const API_BASE_URL = `${import.meta.env.VITE_PY_BACKEND_URL || 'http://127.0.0.1:8000'}/api/v1/media`;

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  size?: string;
  quality?: 'standard' | 'hd';
  style?: string;
  n?: number;
  response_format?: 'url' | 'b64_json';
  aspect_ratio?: string;
  negative_prompt?: string;
  seed?: number;
  cfg_scale?: number;
  steps?: number;
  reference_image_urls?: string[];
  reference_style_url?: string;
}

export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  duration?: number;
  resolution?: string;
  fps?: number;
  aspect_ratio?: string;
  negative_prompt?: string;
  seed?: number;
  reference_video_url?: string;
  reference_image_urls?: string[];
}

export interface AudioGenerationRequest {
  model: string;
  text: string;
  voice?: string;
  speed?: number;
  voice_id?: string;
  stability?: number;
  similarity_boost?: number;
  output_format?: 'mp3' | 'wav';
}

export interface TaskStatus {
  id: string;
  user_id: string;
  media_type: 'image' | 'video' | 'audio';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  model: string;
  prompt: string;
  parameters?: Record<string, any>;
  result_url?: string;
  result_data?: Record<string, any>;
  error_message?: string;
  credits_used?: number;
  credits_balance?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  media_type: 'image' | 'video' | 'audio';
  description?: string;
  capabilities: string[];
  cost_per_unit?: number;
}

/**
 * Upload reference images/files
 */
async function uploadFiles(files: File[]): Promise<string[]> {
  // In a real implementation, this would upload files to a storage service
  // For now, we'll return mock URLs
  return files.map((file, idx) => `https://storage.example.com/${Date.now()}_${idx}_${file.name}`);
}

/**
 * Generate an image
 */
export async function generateImage(request: ImageGenerationRequest): Promise<TaskStatus> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate image');
  }

  return response.json();
}

/**
 * Generate a video
 */
export async function generateVideo(request: VideoGenerationRequest): Promise<TaskStatus> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/video`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate video');
  }

  return response.json();
}

/**
 * Generate audio
 */
export async function generateAudio(request: AudioGenerationRequest): Promise<TaskStatus> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/audio`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to generate audio');
  }

  return response.json();
}

/**
 * Get task status (for polling)
 */
export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get task status');
  }

  return response.json();
}

/**
 * List all tasks for current user
 */
export async function listTasks(
  mediaType?: 'image' | 'video' | 'audio',
  status?: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ tasks: TaskStatus[]; total: number; limit: number; offset: number }> {
  const token = await getAuthToken();

  const params = new URLSearchParams();
  if (mediaType) params.append('media_type', mediaType);
  if (status) params.append('status_filter', status);
  params.append('limit', limit.toString());
  params.append('offset', offset.toString());

  const response = await fetch(`${API_BASE_URL}/tasks?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to list tasks');
  }

  return response.json();
}

/**
 * Cancel a task
 */
export async function cancelTask(taskId: string): Promise<{ success: boolean; message: string; task: TaskStatus }> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/tasks/${taskId}/cancel`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to cancel task');
  }

  return response.json();
}

/**
 * Batch generate media
 */
export async function batchGenerate(
  prompts: string[],
  model: string,
  mediaType: 'image' | 'video' | 'audio',
  parameters?: Record<string, any>
): Promise<{ task_ids: string[]; total_tasks: number }> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompts,
      model,
      media_type: mediaType,
      parameters,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to batch generate');
  }

  return response.json();
}

/**
 * List available models
 */
export async function listModels(mediaType?: 'image' | 'video' | 'audio'): Promise<{ models: ModelInfo[]; total: number }> {
  const token = await getAuthToken();

  const params = new URLSearchParams();
  if (mediaType) params.append('media_type', mediaType);

  const response = await fetch(`${API_BASE_URL}/models?${params}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to list models');
  }

  return response.json();
}

/**
 * Download media file
 */
export async function downloadMedia(taskId: string): Promise<Blob> {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE_URL}/download/${taskId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to download media');
  }

  return response.blob();
}

/**
 * Poll task until completion or failure
 * Supports long-running tasks with extended timeout
 */
export async function pollTaskUntilComplete(
  taskId: string,
  onProgress?: (task: TaskStatus) => void,
  maxAttempts: number = 900, // 30 minutes with 2s interval
  intervalMs: number = 2000
): Promise<TaskStatus> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const task = await getTaskStatus(taskId);

    if (onProgress) {
      onProgress(task);
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      return task;
    }

    await new Promise(resolve => setTimeout(resolve, intervalMs));
    attempts++;
  }

  throw new Error('Task polling timeout - exceeded 30 minutes');
}

/**
 * Start polling in background without blocking
 * Returns a function to stop polling and get current status
 */
export function pollTaskInBackground(
  taskId: string,
  onProgress?: (task: TaskStatus) => void,
  onComplete?: (task: TaskStatus) => void,
  onError?: (error: Error) => void
): () => Promise<TaskStatus | null> {
  let currentTask: TaskStatus | null = null;
  let isStopped = false;

  const poll = async () => {
    try {
      currentTask = await pollTaskUntilComplete(
        taskId,
        (task) => {
          currentTask = task;
          if (onProgress) onProgress(task);
        },
        900, // 30 minutes
        2000
      );

      if (onComplete && !isStopped) {
        onComplete(currentTask);
      }
    } catch (error) {
      if (onError && !isStopped) {
        onError(error instanceof Error ? error : new Error('Unknown error'));
      }
    }
  };

  poll();

  // Return function to stop polling and get current status
  return async () => {
    isStopped = true;
    return currentTask;
  };
}

export { uploadFiles };
