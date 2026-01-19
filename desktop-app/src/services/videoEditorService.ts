/**
 * Video Editor Service
 * Provides integration between Media Library and Video Editor
 */

import { invoke } from '@tauri-apps/api/core';
import { mediaService } from './mediaService';

// ========================================
// Type Definitions
// ========================================

export interface MediaLibraryAsset {
  id: string;              // task_id from backend
  type: 'video' | 'audio';
  title: string;           // from prompt or custom
  thumbnailUrl: string;    // generated thumbnail
  duration: number;        // in seconds
  url: string;             // download URL
  model: string;           // veo-3-1, sora-2, etc.
  createdAt: Date;
  resolution?: string;     // for videos
  format: string;          // mp4, mp3, wav
  localPath?: string;      // cached local path
  fileSize?: number;       // in bytes
}

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
  modified?: number;  // Unix timestamp
}

export interface RenderJob {
  id: string;
  output_path: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed' | 'cancelled';
  progress: number;  // 0.0 - 1.0
  error?: string;
  started_at?: number;
  completed_at?: number;
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
        'video',      // media_type
        'completed',  // status
        limit,
        0             // offset
      );

      return response.tasks
        .filter(task => task.result_url)
        .map(task => ({
          id: task.id,
          type: 'video' as const,
          title: this.extractTitle(task.prompt),
          thumbnailUrl: '', // will be generated later
          duration: this.extractDuration(task.parameters),
          url: task.result_url,
          model: task.model,
          createdAt: new Date(task.completed_at),
          resolution: task.parameters?.resolution || '1080p',
          format: this.extractFormat(task.result_url),
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
        .filter(task => task.result_url)
        .map(task => ({
          id: task.id,
          type: 'audio' as const,
          title: this.extractTitle(task.prompt || task.parameters?.text || 'Audio'),
          thumbnailUrl: '', // audio icon will be used
          duration: 0, // will probe after download
          url: task.result_url,
          model: task.model,
          createdAt: new Date(task.completed_at),
          format: task.parameters?.output_format || 'mp3',
          localPath: undefined
        }));
    } catch (error) {
      console.error('Failed to fetch generated audio:', error);
      throw error;
    }
  }

  /**
   * Fetch all generated media (videos + audio)
   */
  async fetchAllGeneratedMedia(videoLimit: number = 50, audioLimit: number = 50): Promise<{
    videos: MediaLibraryAsset[];
    audio: MediaLibraryAsset[];
  }> {
    const [videos, audio] = await Promise.all([
      this.fetchGeneratedVideos(videoLimit),
      this.fetchGeneratedAudio(audioLimit)
    ]);

    return { videos, audio };
  }

  /**
   * Download media file to local workspace for editing
   */
  async downloadToWorkspace(asset: MediaLibraryAsset): Promise<string> {
    try {
      // Check if already cached
      if (asset.localPath) {
        const exists = await invoke<boolean>('file_exists', { path: asset.localPath });
        if (exists) {
          return asset.localPath;
        }
      }

      // Get workspace path
      const workspacePath = await invoke<string>('get_video_editor_workspace_path');

      // Download from backend
      const blob = await mediaService.downloadMedia(asset.id);

      // Convert blob to array buffer
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Save to workspace directory
      const filename = `${asset.id}.${asset.format}`;
      const localPath = `${workspacePath}/${filename}`;

      await invoke('save_blob_to_file', {
        blob: Array.from(uint8Array),
        path: localPath
      });

      // Update asset
      asset.localPath = localPath;

      // Get file size
      try {
        asset.fileSize = await invoke<number>('get_file_size', { path: localPath });
      } catch (e) {
        console.warn('Failed to get file size:', e);
      }

      return localPath;
    } catch (error) {
      console.error('Failed to download to workspace:', error);
      throw error;
    }
  }

  /**
   * Generate thumbnail for video (using FFmpeg)
   */
  async generateThumbnail(videoPath: string, timeSeconds: number = 1.0): Promise<string> {
    try {
      const thumbnailPath = videoPath.replace(/\.[^.]+$/, '_thumb.jpg');

      await invoke('ffmpeg_generate_thumbnail', {
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

  /**
   * Probe media file metadata (duration, codec, etc.)
   */
  async probeMediaFile(filePath: string): Promise<MediaFileInfo> {
    try {
      return await invoke<MediaFileInfo>('ffmpeg_probe_file', { path: filePath });
    } catch (error) {
      console.error('Failed to probe media file:', error);
      throw error;
    }
  }

  /**
   * Get available FFmpeg encoders
   */
  async detectEncoders(): Promise<string[]> {
    try {
      return await invoke<string[]>('ffmpeg_detect_encoders');
    } catch (error) {
      console.error('Failed to detect encoders:', error);
      throw error;
    }
  }

  /**
   * Get FFmpeg version
   */
  async getFFmpegVersion(): Promise<string> {
    try {
      return await invoke<string>('ffmpeg_version');
    } catch (error) {
      console.error('Failed to get FFmpeg version:', error);
      throw error;
    }
  }

  /**
   * List all files in workspace
   */
  async listWorkspaceFiles(): Promise<WorkspaceFile[]> {
    try {
      return await invoke<WorkspaceFile[]>('list_workspace_files');
    } catch (error) {
      console.error('Failed to list workspace files:', error);
      throw error;
    }
  }

  /**
   * Clean up old workspace files
   */
  async cleanupWorkspace(days: number = 30): Promise<number> {
    try {
      return await invoke<number>('cleanup_workspace', { days });
    } catch (error) {
      console.error('Failed to cleanup workspace:', error);
      throw error;
    }
  }

  /**
   * Delete a file from workspace
   */
  async deleteFile(path: string): Promise<void> {
    try {
      await invoke('delete_file', { path });
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

    // Extract meaningful title from prompt (first 50 chars)
    const cleaned = prompt.trim();
    return cleaned.length > 50
      ? cleaned.substring(0, 50) + '...'
      : cleaned;
  }

  private extractDuration(parameters: any): number {
    return parameters?.duration || 10; // default 10 seconds
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

  /**
   * Start a render job
   */
  async startRender(projectJson: string, outputPath: string): Promise<string> {
    try {
      const jobId = await invoke<string>('start_render', {
        projectJson,
        outputPath
      });
      return jobId;
    } catch (error) {
      console.error('Failed to start render:', error);
      throw error;
    }
  }

  /**
   * Get render job status
   */
  async getRenderStatus(jobId: string): Promise<RenderJob> {
    try {
      return await invoke<RenderJob>('get_render_status', { jobId });
    } catch (error) {
      console.error('Failed to get render status:', error);
      throw error;
    }
  }

  /**
   * Cancel render job
   */
  async cancelRender(jobId: string): Promise<void> {
    try {
      await invoke('cancel_render', { jobId });
    } catch (error) {
      console.error('Failed to cancel render:', error);
      throw error;
    }
  }

  /**
   * List all render jobs
   */
  async listRenderJobs(): Promise<RenderJob[]> {
    try {
      return await invoke<RenderJob[]>('list_render_jobs');
    } catch (error) {
      console.error('Failed to list render jobs:', error);
      throw error;
    }
  }

  /**
   * Poll render job until complete
   */
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
