/**
 * Project Manager Service
 * Handles saving and loading video editor projects
 */

import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { VideoEditorProject } from '../types/videoEditor';

/**
 * Validate project structure to prevent malicious data
 * Security: Validates all fields against expected types and ranges
 */
function validateProjectStructure(data: any): VideoEditorProject {
  // Check required top-level fields
  if (typeof data !== 'object' || data === null) {
    throw new Error('Project must be an object');
  }

  if (typeof data.version !== 'string' || !data.version.match(/^\d+\.\d+$/)) {
    throw new Error('Invalid version format (expected: X.Y)');
  }

  if (typeof data.name !== 'string' || data.name.length === 0 || data.name.length > 256) {
    throw new Error('Project name must be 1-256 characters');
  }

  // Validate settings
  if (typeof data.settings !== 'object') {
    throw new Error('Missing settings object');
  }

  const settings = data.settings;
  if (typeof settings.width !== 'number' || settings.width < 1 || settings.width > 7680) {
    throw new Error('Invalid width (must be 1-7680)');
  }

  if (typeof settings.height !== 'number' || settings.height < 1 || settings.height > 4320) {
    throw new Error('Invalid height (must be 1-4320)');
  }

  if (typeof settings.fps !== 'number' || settings.fps < 1 || settings.fps > 120) {
    throw new Error('Invalid FPS (must be 1-120)');
  }

  if (typeof settings.sample_rate !== 'number' || settings.sample_rate < 8000 || settings.sample_rate > 192000) {
    throw new Error('Invalid sample rate (must be 8000-192000)');
  }

  // Validate timeline
  if (typeof data.timeline !== 'object' || !Array.isArray(data.timeline.tracks)) {
    throw new Error('Invalid timeline structure');
  }

  const MAX_TRACKS = 50;
  if (data.timeline.tracks.length > MAX_TRACKS) {
    throw new Error(`Too many tracks (max: ${MAX_TRACKS})`);
  }

  // Validate tracks
  let totalClips = 0;
  for (const track of data.timeline.tracks) {
    if (typeof track.id !== 'string' || track.id.length === 0) {
      throw new Error('Track must have valid id');
    }

    if (typeof track.name !== 'string' || track.name.length > 256) {
      throw new Error('Track name must be valid string');
    }

    if (!['video', 'audio'].includes(track.type)) {
      throw new Error('Track type must be "video" or "audio"');
    }

    if (!Array.isArray(track.clips)) {
      throw new Error('Track clips must be array');
    }

    totalClips += track.clips.length;

    // Validate clips
    for (const clip of track.clips) {
      if (typeof clip.id !== 'string') {
        throw new Error('Clip must have valid id');
      }

      if (typeof clip.assetId !== 'string') {
        throw new Error('Clip must have valid assetId');
      }

      if (typeof clip.startTime !== 'number' || clip.startTime < 0) {
        throw new Error('Clip startTime must be non-negative number');
      }

      if (typeof clip.duration !== 'number' || clip.duration <= 0 || clip.duration > 7200) {
        throw new Error('Clip duration must be 0-7200 seconds');
      }

      if (typeof clip.volume !== 'number' || clip.volume < 0 || clip.volume > 2) {
        throw new Error('Clip volume must be 0-2');
      }
    }
  }

  const MAX_CLIPS = 1000;
  if (totalClips > MAX_CLIPS) {
    throw new Error(`Too many clips (max: ${MAX_CLIPS})`);
  }

  // Validate assets
  if (typeof data.assets !== 'object') {
    throw new Error('Assets must be object');
  }

  const MAX_ASSETS = 500;
  if (Object.keys(data.assets).length > MAX_ASSETS) {
    throw new Error(`Too many assets (max: ${MAX_ASSETS})`);
  }

  for (const [id, asset] of Object.entries(data.assets)) {
    const a = asset as any;
    if (typeof a.type !== 'string' || !['video', 'audio', 'image'].includes(a.type)) {
      throw new Error('Asset type must be "video", "audio", or "image"');
    }

    if (typeof a.path !== 'string' || a.path.length === 0) {
      throw new Error('Asset must have valid path');
    }

    // Security: Check for path traversal attempts
    if (a.path.includes('..') || a.path.includes('\0')) {
      throw new Error('Invalid asset path detected');
    }
  }

  // Validate export settings
  if (typeof data.export !== 'object') {
    throw new Error('Missing export settings');
  }

  const exp = data.export;
  if (typeof exp.bitrate !== 'number' || exp.bitrate < 1000 || exp.bitrate > 50000) {
    throw new Error('Video bitrate must be 1000-50000 kbps');
  }

  if (typeof exp.audioBitrate !== 'number' || exp.audioBitrate < 64 || exp.audioBitrate > 320) {
    throw new Error('Audio bitrate must be 64-320 kbps');
  }

  // Sanitize strings to prevent XSS
  data.name = sanitizeString(data.name);

  return data as VideoEditorProject;
}

/**
 * Sanitize string to prevent XSS attacks
 */
function sanitizeString(str: string): string {
  return str
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

export class ProjectManager {
  private currentProjectPath: string | null = null;

  /**
   * Save project to file
   */
  async saveProject(project: VideoEditorProject, path?: string): Promise<string> {
    try {
      let savePath = path || this.currentProjectPath;

      // If no path, show save dialog
      if (!savePath) {
        const selected = await save({
          defaultPath: `${project.name}.videoproj`,
          filters: [{
            name: 'Video Project',
            extensions: ['videoproj']
          }]
        });

        if (!selected) {
          throw new Error('Save cancelled');
        }

        savePath = selected;
      }

      // Update project metadata
      project.modifiedAt = new Date().toISOString();

      // Serialize project to JSON
      const json = JSON.stringify(project, null, 2);

      // Write to file
      await writeTextFile(savePath, json);

      // Update current path
      this.currentProjectPath = savePath;

      console.log('Project saved:', savePath);
      return savePath;
    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  }

  /**
   * Load project from file
   */
  async loadProject(path?: string): Promise<{ project: VideoEditorProject; path: string }> {
    try {
      let loadPath = path;

      // If no path, show open dialog
      if (!loadPath) {
        const selected = await open({
          multiple: false,
          filters: [{
            name: 'Video Project',
            extensions: ['videoproj']
          }]
        });

        if (!selected || Array.isArray(selected)) {
          throw new Error('Load cancelled');
        }

        loadPath = selected;
      }

      // Read file
      const json = await readTextFile(loadPath);

      // Parse JSON
      const data = JSON.parse(json);

      // Security: Validate project structure thoroughly
      const project = validateProjectStructure(data);

      // Update current path
      this.currentProjectPath = loadPath;

      console.log('Project loaded:', loadPath);
      return { project, path: loadPath };
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  }

  /**
   * Create new project (resets current path)
   */
  newProject(): void {
    this.currentProjectPath = null;
  }

  /**
   * Get current project path
   */
  getCurrentPath(): string | null {
    return this.currentProjectPath;
  }

  /**
   * Check if project has been saved
   */
  isSaved(): boolean {
    return this.currentProjectPath !== null;
  }

  /**
   * Get recent projects from storage
   */
  async getRecentProjects(): Promise<RecentProject[]> {
    try {
      // Get recent projects from local storage
      const stored = localStorage.getItem('recentProjects');
      if (!stored) return [];

      const recent: RecentProject[] = JSON.parse(stored);
      return recent.slice(0, 10); // Keep only 10 most recent
    } catch (error) {
      console.error('Failed to get recent projects:', error);
      return [];
    }
  }

  /**
   * Add project to recent list
   */
  async addToRecent(project: VideoEditorProject, path: string): Promise<void> {
    try {
      const recent = await this.getRecentProjects();

      // Remove if already exists
      const filtered = recent.filter(p => p.path !== path);

      // Add to beginning
      filtered.unshift({
        name: project.name,
        path,
        modifiedAt: project.modifiedAt,
        duration: project.settings.duration,
        resolution: `${project.settings.width}x${project.settings.height}`
      });

      // Keep only 10
      const updated = filtered.slice(0, 10);

      // Save to local storage
      localStorage.setItem('recentProjects', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to add to recent:', error);
    }
  }

  /**
   * Clear recent projects
   */
  clearRecent(): void {
    localStorage.removeItem('recentProjects');
  }

  /**
   * Auto-save project (for recovery)
   */
  async autoSave(project: VideoEditorProject): Promise<void> {
    try {
      const autoSavePath = await this.getAutoSavePath();
      const json = JSON.stringify(project, null, 2);
      await writeTextFile(autoSavePath, json);
      console.log('Auto-saved project');
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  /**
   * Load auto-saved project (for recovery)
   */
  async loadAutoSave(): Promise<VideoEditorProject | null> {
    try {
      const autoSavePath = await this.getAutoSavePath();
      const exists = await invoke<boolean>('file_exists', { path: autoSavePath });

      if (!exists) return null;

      const json = await readTextFile(autoSavePath);
      const data = JSON.parse(json);

      // Security: Validate auto-saved project too
      const project = validateProjectStructure(data);

      console.log('Loaded auto-saved project');
      return project;
    } catch (error) {
      console.error('Failed to load auto-save:', error);
      return null;
    }
  }

  /**
   * Delete auto-save file
   */
  async deleteAutoSave(): Promise<void> {
    try {
      const autoSavePath = await this.getAutoSavePath();
      await invoke('delete_file', { path: autoSavePath });
      console.log('Deleted auto-save');
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Get auto-save file path
   */
  private async getAutoSavePath(): Promise<string> {
    const projectsPath = await invoke<string>('get_video_editor_projects_path');
    return `${projectsPath}/autosave.videoproj`;
  }

  /**
   * Export project metadata (without assets)
   */
  exportMetadata(project: VideoEditorProject): string {
    const metadata = {
      name: project.name,
      version: project.version,
      duration: project.settings.duration,
      resolution: `${project.settings.width}x${project.settings.height}`,
      fps: project.settings.fps,
      tracks: project.timeline.tracks.length,
      clips: project.timeline.tracks.reduce((sum, t) => sum + t.clips.length, 0),
      assets: Object.keys(project.assets).length
    };

    return JSON.stringify(metadata, null, 2);
  }
}

// ========================================
// Types
// ========================================

export interface RecentProject {
  name: string;
  path: string;
  modifiedAt: string;
  duration: number;
  resolution: string;
}

// ========================================
// Export Singleton
// ========================================

export const projectManager = new ProjectManager();
