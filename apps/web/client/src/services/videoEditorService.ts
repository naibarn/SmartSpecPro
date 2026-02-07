/**
 * Video Editor Service
 * Provides integration between Media Library and Video Editor.
 * Platform-aware: uses Tauri APIs on desktop, MediaJobClient on web.
 */

import * as mediaService from './mediaService';
import { createMediaJobClient, type MediaJobClient } from './mediaJobClient';
import type { MediaLibraryAsset, RenderJob } from '../types/videoEditor';

// Re-export canonical types for backward compat
export type { MediaLibraryAsset, RenderJob } from '../types/videoEditor';

// ========================================
// Service-specific Types (not duplicated elsewhere)
// ========================================

export interface MediaFileInfo {
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  sample_rate?: number;
  codec_video?: string;
  codec_audio?: string;
  has_video: boolean;
  has_audio: boolean;
}

export interface WorkspaceFile {
  name: string;
  path: string;
  size: number;
  modified?: number;
}

// ========================================
// Platform detection
// ========================================

function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

// ========================================
// Lazy MediaJobClient singleton
// ========================================

let _jobClient: MediaJobClient | null = null;
async function getJobClient(): Promise<MediaJobClient> {
  if (!_jobClient) {
    _jobClient = await createMediaJobClient();
  }
  return _jobClient;
}

// ========================================
// Video Editor Media Library
// ========================================

export class VideoEditorMediaLibrary {

  /**
   * Fetch all generated videos from backend
   */
  async fetchGeneratedVideos(limit: number = 100): Promise<MediaLibraryAsset[]> {
    try {
      const response = await mediaService.listTasks(
        'video',
        'completed',
        limit,
        0
      );

      return response.tasks
        .filter((task: mediaService.TaskStatus) => task.result_url)
        .map((task: mediaService.TaskStatus) => ({
          id: task.id,
          type: 'video' as const,
          title: this.extractTitle(task.prompt),
          thumbnailUrl: '',
          duration: this.extractDuration(task.parameters),
          url: task.result_url!,
          model: task.model,
          createdAt: new Date(task.completed_at!),
          resolution: task.parameters?.resolution || '1080p',
          format: this.extractFormat(task.result_url!),
          localPath: undefined
        }));
    } catch (error) {
      console.error('Failed to fetch generated videos:', error);
      throw error;
    }
  }

  /**
   * Fetch all generated audio (TTS/voiceovers)
   */
  async fetchGeneratedAudio(limit: number = 100): Promise<MediaLibraryAsset[]> {
    try {
      const response = await mediaService.listTasks(
        'audio',
        'completed',
        limit,
        0
      );

      return response.tasks
        .filter((task: mediaService.TaskStatus) => task.result_url)
        .map((task: mediaService.TaskStatus) => ({
          id: task.id,
          type: 'audio' as const,
          title: this.extractTitle(task.prompt || task.parameters?.text || 'Audio'),
          thumbnailUrl: '',
          duration: 0,
          url: task.result_url!,
          model: task.model,
          createdAt: new Date(task.completed_at!),
          format: task.parameters?.output_format || 'mp3',
          localPath: undefined
        }));
    } catch (error) {
      console.error('Failed to fetch generated audio:', error);
      throw error;
    }
  }

  /**
   * Fetch all generated images
   */
  async fetchGeneratedImages(limit: number = 100): Promise<MediaLibraryAsset[]> {
    try {
      const response = await mediaService.listTasks(
        'image',
        'completed',
        limit,
        0
      );

      return response.tasks
        .filter((task: mediaService.TaskStatus) => task.result_url)
        .map((task: mediaService.TaskStatus) => ({
          id: task.id,
          type: 'image' as const,
          title: this.extractTitle(task.prompt),
          thumbnailUrl: task.result_url!,
          duration: 5, // Default 5s duration for image clips
          url: task.result_url!,
          model: task.model,
          createdAt: new Date(task.completed_at!),
          resolution: task.parameters?.resolution || '',
          format: this.extractFormat(task.result_url!),
          localPath: undefined
        }));
    } catch (error) {
      console.error('Failed to fetch generated images:', error);
      throw error;
    }
  }

  /**
   * Fetch all generated media (videos + audio + images)
   */
  async fetchAllGeneratedMedia(videoLimit: number = 50, audioLimit: number = 50): Promise<{
    videos: MediaLibraryAsset[];
    audio: MediaLibraryAsset[];
    images: MediaLibraryAsset[];
  }> {
    const [videos, audio, images] = await Promise.all([
      this.fetchGeneratedVideos(videoLimit),
      this.fetchGeneratedAudio(audioLimit),
      this.fetchGeneratedImages(50)
    ]);

    return { videos, audio, images };
  }

  /**
   * Download media file to local workspace for editing.
   * Desktop: saves to filesystem via Tauri.
   * Web: returns the URL directly (no local file system).
   */
  async downloadToWorkspace(asset: MediaLibraryAsset): Promise<string> {
    if (!isDesktop()) {
      return asset.url;
    }

    try {
      if (asset.localPath) {
        const exists = await tauriInvoke<boolean>('file_exists', { path: asset.localPath });
        if (exists) {
          return asset.localPath;
        }
      }

      const workspacePath = await tauriInvoke<string>('get_video_editor_workspace_path');
      const blob = await mediaService.downloadMedia(asset.id);
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      const filename = `${asset.id}.${asset.format}`;
      const localPath = `${workspacePath}/${filename}`;

      await tauriInvoke('save_blob_to_file', {
        blob: Array.from(uint8Array),
        path: localPath
      });

      asset.localPath = localPath;

      try {
        asset.fileSize = await tauriInvoke<number>('get_file_size', { path: localPath });
      } catch {
        // Ignore file size errors
      }

      return localPath;
    } catch (error) {
      console.error('Failed to download to workspace:', error);
      throw error;
    }
  }

  /**
   * Generate thumbnail for video.
   * Desktop: FFmpeg via Tauri. Web: MediaJobClient thumbnails job.
   */
  async generateThumbnail(videoPath: string, timeSeconds: number = 1.0): Promise<string> {
    if (isDesktop()) {
      try {
        const thumbnailPath = videoPath.replace(/\.[^.]+$/, '_thumb.jpg');
        await tauriInvoke('ffmpeg_generate_thumbnail', {
          inputPath: videoPath,
          outputPath: thumbnailPath,
          timeSeconds
        });
        return thumbnailPath;
      } catch (error) {
        console.error('Failed to generate thumbnail:', error);
        throw error;
      }
    }

    try {
      const client = await getJobClient();
      const result = await client.getThumbnails(videoPath, timeSeconds * 1000);
      const thumbs = (result as any).derived?.thumbnails;
      if (thumbs && thumbs.length > 0) {
        return thumbs[0].uri;
      }
      return '';
    } catch (error) {
      console.error('Failed to generate thumbnail via job:', error);
      throw error;
    }
  }

  /**
   * Probe media file metadata.
   * Desktop: FFmpeg via Tauri.
   * Web: Browser HTMLMediaElement (instant, no backend needed).
   */
  async probeMediaFile(filePath: string): Promise<MediaFileInfo> {
    if (isDesktop()) {
      try {
        return await tauriInvoke<MediaFileInfo>('ffmpeg_probe_file', { path: filePath });
      } catch (error) {
        console.error('Failed to probe media file:', error);
        throw error;
      }
    }

    return this.probeWithBrowser(filePath);
  }

  /**
   * Probe media metadata using browser HTMLVideoElement / HTMLAudioElement.
   * Works for any URL the browser can play (same-origin uploads, blob URLs, etc.).
   */
  private probeWithBrowser(url: string): Promise<MediaFileInfo> {
    return new Promise((resolve, reject) => {
      const isAudioOnly = /\.(mp3|wav|ogg|flac|aac)$/i.test(url);
      const el = document.createElement(isAudioOnly ? 'audio' : 'video') as HTMLVideoElement | HTMLAudioElement;

      const timeoutId = setTimeout(() => {
        el.src = '';
        reject(new Error('Browser probe timed out after 10s'));
      }, 10_000);

      el.preload = 'metadata';

      el.onloadedmetadata = () => {
        clearTimeout(timeoutId);
        const isVideo = el instanceof HTMLVideoElement;
        resolve({
          duration: isFinite(el.duration) ? el.duration : 0,
          width: isVideo ? (el as HTMLVideoElement).videoWidth || undefined : undefined,
          height: isVideo ? (el as HTMLVideoElement).videoHeight || undefined : undefined,
          has_video: isVideo && (el as HTMLVideoElement).videoWidth > 0,
          has_audio: true, // browsers can't easily detect audio track absence from metadata alone
        });
        el.src = '';
      };

      el.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error(`Browser cannot read media metadata for: ${url}`));
        el.src = '';
      };

      el.src = url;
    });
  }

  async detectEncoders(): Promise<string[]> {
    if (!isDesktop()) return ['h264'];
    try {
      return await tauriInvoke<string[]>('ffmpeg_detect_encoders');
    } catch (error) {
      console.error('Failed to detect encoders:', error);
      throw error;
    }
  }

  async getFFmpegVersion(): Promise<string> {
    if (!isDesktop()) return 'web-backend';
    try {
      return await tauriInvoke<string>('ffmpeg_version');
    } catch (error) {
      console.error('Failed to get FFmpeg version:', error);
      throw error;
    }
  }

  async listWorkspaceFiles(): Promise<WorkspaceFile[]> {
    if (!isDesktop()) return [];
    try {
      return await tauriInvoke<WorkspaceFile[]>('list_workspace_files');
    } catch (error) {
      console.error('Failed to list workspace files:', error);
      throw error;
    }
  }

  async cleanupWorkspace(days: number = 30): Promise<number> {
    if (!isDesktop()) return 0;
    try {
      return await tauriInvoke<number>('cleanup_workspace', { days });
    } catch (error) {
      console.error('Failed to cleanup workspace:', error);
      throw error;
    }
  }

  async deleteFile(path: string): Promise<void> {
    if (!isDesktop()) return;
    try {
      await tauriInvoke('delete_file', { path });
    } catch (error) {
      console.error('Failed to delete file:', error);
      throw error;
    }
  }

  // ========================================
  // Helper Methods
  // ========================================

  private extractTitle(prompt: string): string {
    if (!prompt) return 'Untitled';
    const cleaned = prompt.trim();
    return cleaned.length > 50
      ? cleaned.substring(0, 50) + '...'
      : cleaned;
  }

  private extractDuration(parameters: Record<string, any> | undefined): number {
    return parameters?.duration || 10;
  }

  private extractFormat(url: string): string {
    const match = url.match(/\.(\w+)(\?|$)/);
    return match ? match[1] : 'mp4';
  }
}

// ========================================
// Render Service
// ========================================

export class VideoEditorRenderService {

  async startRender(projectJson: string, outputPath: string): Promise<string> {
    if (isDesktop()) {
      try {
        return await tauriInvoke<string>('start_render', { projectJson, outputPath });
      } catch (error) {
        console.error('Failed to start render:', error);
        throw error;
      }
    }

    try {
      const client = await getJobClient();
      const project = JSON.parse(projectJson);
      const result = await client.renderMp4(project, outputPath);
      return result.jobId;
    } catch (error) {
      console.error('Failed to start render via job:', error);
      throw error;
    }
  }

  async getRenderStatus(jobId: string): Promise<RenderJob> {
    if (isDesktop()) {
      try {
        return await tauriInvoke<RenderJob>('get_render_status', { jobId });
      } catch (error) {
        console.error('Failed to get render status:', error);
        throw error;
      }
    }

    try {
      const client = await getJobClient();
      const status = await (client as any).adapter.getStatus(jobId);
      return {
        id: jobId,
        outputPath: '',
        status: status.status === 'done' ? 'completed'
          : status.status === 'error' ? 'failed'
          : status.status === 'running' ? 'rendering'
          : 'pending',
        progress: status.progress || 0,
        error: status.message,
      };
    } catch (error) {
      console.error('Failed to get render status:', error);
      throw error;
    }
  }

  async cancelRender(jobId: string): Promise<void> {
    if (isDesktop()) {
      try {
        await tauriInvoke('cancel_render', { jobId });
        return;
      } catch (error) {
        console.error('Failed to cancel render:', error);
        throw error;
      }
    }

    try {
      const client = await getJobClient();
      await client.cancelJob(jobId);
    } catch (error) {
      console.error('Failed to cancel render:', error);
      throw error;
    }
  }

  async listRenderJobs(): Promise<RenderJob[]> {
    if (!isDesktop()) return [];
    try {
      return await tauriInvoke<RenderJob[]>('list_render_jobs');
    } catch (error) {
      console.error('Failed to list render jobs:', error);
      throw error;
    }
  }

  async pollRenderJob(
    jobId: string,
    onProgress?: (job: RenderJob) => void,
    intervalMs: number = 1000
  ): Promise<RenderJob> {
    return new Promise((resolve, reject) => {
      const interval = setInterval(async () => {
        try {
          const job = await this.getRenderStatus(jobId);

          if (onProgress) {
            onProgress(job);
          }

          if (job.status === 'completed') {
            clearInterval(interval);
            resolve(job);
          } else if (job.status === 'failed' || job.status === 'cancelled') {
            clearInterval(interval);
            reject(new Error(job.error || `Render ${job.status}`));
          }
        } catch (error) {
          clearInterval(interval);
          reject(error);
        }
      }, intervalMs);
    });
  }
}

// ========================================
// Export Singleton Instances
// ========================================

export const videoEditorMediaLibrary = new VideoEditorMediaLibrary();
export const videoEditorRenderService = new VideoEditorRenderService();
