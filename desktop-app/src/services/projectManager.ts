/**
 * Project Manager Service
 * Handles saving and loading video editor projects
 */

import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import type { VideoEditorProject } from '../types/videoEditor';

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
      const project: VideoEditorProject = JSON.parse(json);

      // Validate project structure
      if (!project.version || !project.timeline || !project.assets) {
        throw new Error('Invalid project file format');
      }

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
      const project: VideoEditorProject = JSON.parse(json);

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
