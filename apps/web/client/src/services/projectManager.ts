/**
 * Project Manager Service
 * Handles saving and loading video editor projects.
 * Platform-aware: uses Tauri APIs on desktop, web APIs on browser.
 */

import type { VideoEditorProject } from '../types/videoEditor';
import { migrateProjectV1ToV2 } from '../types/videoEditor';

// ========================================
// Platform Detection
// ========================================

const WEB_AUTOSAVE_KEY = 'videoEditorAutoSave';

function isDesktop(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI__;
}

async function getTauriApis() {
  const core = await import('@tauri-apps/api/core');
  const dialog = await import('@tauri-apps/plugin-dialog');
  const fs = await import('@tauri-apps/plugin-fs');
  return {
    invoke: core.invoke,
    save: dialog.save,
    open: dialog.open,
    readTextFile: fs.readTextFile,
    writeTextFile: fs.writeTextFile,
  };
}

// ========================================
// Validation
// ========================================

/**
 * Validate project structure to prevent malicious data.
 * Exported for testing.
 */
export function validateProjectStructure(data: any): VideoEditorProject {
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

  // BUG FIX: was checking settings.sample_rate (snake_case) but type uses sampleRate (camelCase)
  if (typeof settings.sampleRate !== 'number' || settings.sampleRate < 8000 || settings.sampleRate > 192000) {
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

    // BUG FIX: was missing 'overlay' — Phase 3 uses overlay tracks
    if (!['video', 'audio', 'overlay'].includes(track.type)) {
      throw new Error('Track type must be "video", "audio", or "overlay"');
    }

    if (!Array.isArray(track.clips)) {
      throw new Error('Track clips must be array');
    }

    totalClips += track.clips.length;

    // Validate clips (version-aware)
    const isV2 = data.version === '2.0';
    for (const clip of track.clips) {
      if (typeof clip.id !== 'string') {
        throw new Error('Clip must have valid id');
      }

      if (typeof clip.assetId !== 'string') {
        throw new Error('Clip must have valid assetId');
      }

      if (isV2) {
        // V2: ms-based fields
        if (typeof clip.startMs === 'number' && clip.startMs < 0) {
          throw new Error('Clip startMs must be non-negative number');
        }
        if (typeof clip.durationMs === 'number' && (clip.durationMs <= 0 || clip.durationMs > 7200000)) {
          throw new Error('Clip durationMs must be 0-7200000 ms');
        }
      } else {
        // V1: seconds-based fields
        if (typeof clip.startTime !== 'number' || clip.startTime < 0) {
          throw new Error('Clip startTime must be non-negative number');
        }
        if (typeof clip.duration !== 'number' || clip.duration <= 0 || clip.duration > 7200) {
          throw new Error('Clip duration must be 0-7200 seconds');
        }
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
    if (!isDesktop()) {
      return this.saveProjectWeb(project);
    }

    try {
      const { save, writeTextFile } = await getTauriApis();
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
      await writeTextFile(savePath!, json);

      // Update current path
      this.currentProjectPath = savePath!;

      console.log('Project saved:', savePath);
      return savePath!;
    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  }

  /**
   * Web: Save project by triggering a browser file download.
   */
  private async saveProjectWeb(project: VideoEditorProject): Promise<string> {
    project.modifiedAt = new Date().toISOString();
    const json = JSON.stringify(project, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const fileName = `${project.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.videoproj`;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Also persist to localStorage for auto-save / recent list
    this.currentProjectPath = `web:${fileName}`;

    console.log('Project saved (web download):', fileName);
    return this.currentProjectPath;
  }

  /**
   * Load project from file.
   * Auto-migrates v1.0 projects to v2.0.
   */
  async loadProject(path?: string): Promise<{ project: VideoEditorProject; path: string }> {
    if (!isDesktop()) {
      return this.loadProjectWeb();
    }

    try {
      const { open, readTextFile } = await getTauriApis();
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
      let data = JSON.parse(json);

      // Auto-migrate v1.0 -> v2.0
      if (data.version === '1.0') {
        data = migrateProjectV1ToV2(data);
      }

      // Security: Validate project structure thoroughly
      const project = validateProjectStructure(data);

      // Update current path
      this.currentProjectPath = loadPath!;

      console.log('Project loaded:', loadPath);
      return { project, path: loadPath! };
    } catch (error) {
      console.error('Failed to load project:', error);
      throw error;
    }
  }

  /**
   * Web: Load project via browser file picker + FileReader.
   */
  private loadProjectWeb(): Promise<{ project: VideoEditorProject; path: string }> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.videoproj';

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          reject(new Error('Load cancelled'));
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          try {
            const json = reader.result as string;
            let data = JSON.parse(json);

            // Auto-migrate v1.0 -> v2.0
            if (data.version === '1.0') {
              data = migrateProjectV1ToV2(data);
            }

            // Security: Validate project structure thoroughly
            const project = validateProjectStructure(data);

            const fileName = file.name;
            this.currentProjectPath = `web:${fileName}`;

            console.log('Project loaded (web):', fileName);
            resolve({ project, path: this.currentProjectPath });
          } catch (err) {
            reject(err instanceof Error ? err : new Error('Failed to parse project file'));
          }
        };

        reader.onerror = () => {
          reject(new Error('Failed to read project file'));
        };

        reader.readAsText(file);
      };

      // Handle cancel (user closes file picker without selecting)
      input.oncancel = () => {
        reject(new Error('Load cancelled'));
      };

      input.click();
    });
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
    if (!isDesktop()) {
      try {
        const json = JSON.stringify(project);
        localStorage.setItem(WEB_AUTOSAVE_KEY, json);
      } catch (error) {
        console.warn('Web auto-save failed (localStorage may be full):', error);
      }
      return;
    }

    try {
      const { writeTextFile } = await getTauriApis();
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
    if (!isDesktop()) {
      try {
        const json = localStorage.getItem(WEB_AUTOSAVE_KEY);
        if (!json) return null;

        let data = JSON.parse(json);

        if (data.version === '1.0') {
          data = migrateProjectV1ToV2(data);
        }

        const project = validateProjectStructure(data);
        console.log('Loaded auto-saved project (web)');
        return project;
      } catch (error) {
        console.warn('Failed to load web auto-save:', error);
        return null;
      }
    }

    try {
      const { invoke, readTextFile } = await getTauriApis();
      const autoSavePath = await this.getAutoSavePath();
      const exists = await invoke<boolean>('file_exists', { path: autoSavePath });

      if (!exists) return null;

      const json = await readTextFile(autoSavePath);
      let data = JSON.parse(json);

      // Auto-migrate
      if (data.version === '1.0') {
        data = migrateProjectV1ToV2(data);
      }

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
    if (!isDesktop()) {
      localStorage.removeItem(WEB_AUTOSAVE_KEY);
      return;
    }

    try {
      const { invoke } = await getTauriApis();
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
    const { invoke } = await getTauriApis();
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
