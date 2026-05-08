/**
 * Project Manager Service
 * Handles saving and loading video editor projects.
 * Platform-aware: uses Tauri APIs on desktop, web APIs on browser.
 */

import type {
  TextConfig,
  TransformEasing,
  TransformKeyframe,
  TransformKeyframeProperty,
  VideoEditorProject,
} from '../types/videoEditor';
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

export const TEXT_CONTRACT_VERSION = '1.0';

export const STRICT_PARITY_TEXT_CAPABILITY_MATRIX = Object.freeze({
  mode: 'strict_parity',
  supportedEffects: ['none', 'shadow', 'outline', 'glow'] as const,
  unsupportedEffects: ['typewriter', 'fade-in-word'] as const,
  supportsPerPropertyEasingOverride: false,
});

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const RGB_COLOR_RE = /^rgba?\(\s*(\d{1,3}\s*,\s*){2}\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i;
const VALID_TRANSFORM_EASINGS: TransformEasing[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out'];
const VALID_TRANSFORM_EASING_PROPERTIES: TransformKeyframeProperty[] = [
  'x',
  'y',
  'scaleX',
  'scaleY',
  'rotation',
  'opacity',
];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function sanitizeColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (value === 'transparent') return value;
  if (RGB_COLOR_RE.test(value)) return value;
  if (!HEX_COLOR_RE.test(value)) return fallback;
  return value.toLowerCase();
}

function sanitizeCssTextEffect(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 240) return undefined;
  if (/[;<>{}]/.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeTransformEasing(value: unknown, fallback: TransformEasing = 'linear'): TransformEasing {
  if (typeof value !== 'string') return fallback;
  return (VALID_TRANSFORM_EASINGS as string[]).includes(value) ? (value as TransformEasing) : fallback;
}

function normalizeTransformEasingOverrides(
  value: unknown,
): Partial<Record<TransformKeyframeProperty, TransformEasing>> | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const raw = value as Record<string, unknown>;
  const normalized: Partial<Record<TransformKeyframeProperty, TransformEasing>> = {};

  for (const property of VALID_TRANSFORM_EASING_PROPERTIES) {
    const easing = normalizeTransformEasing(raw[property], 'linear');
    if (typeof raw[property] === 'string' && easing === raw[property]) {
      normalized[property] = easing;
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function hasTextSemantics(projectData: any): boolean {
  const tracks = projectData?.timeline?.tracks;
  if (!Array.isArray(tracks)) return false;
  return tracks.some((track: any) => {
    if (track?.type === 'text') return true;
    if (!Array.isArray(track?.clips)) return false;
    return track.clips.some((clip: any) => !!clip?.textConfig);
  });
}

function majorVersion(value: string): number | null {
  if (!/^\d+\.\d+$/.test(value)) return null;
  const [majorRaw] = value.split('.');
  const parsed = Number.parseInt(majorRaw, 10);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return parsed;
}

function validateTextContractVersion(projectData: any): void {
  if (typeof projectData.contractVersion !== 'string') return;

  const projectMajor = majorVersion(projectData.contractVersion);
  const supportedMajor = majorVersion(TEXT_CONTRACT_VERSION);
  if (projectMajor === null || supportedMajor === null) {
    throw new Error('Invalid text contractVersion format (expected: X.Y)');
  }
  if (projectMajor <= supportedMajor) return;

  const policy = projectData.compatibilityPolicy?.unsupportedContractPolicy ?? 'reject_with_clear_error';
  if (policy === 'gated_downgrade' && !hasTextSemantics(projectData)) {
    return;
  }
  throw new Error(
    `Unsupported text contractVersion "${projectData.contractVersion}" (policy: ${policy})`,
  );
}

function validateTransformKeyframes(rawKeyframes: any): TransformKeyframe[] {
  if (!Array.isArray(rawKeyframes)) return [];

  const normalized = rawKeyframes.map((keyframe: any) => {
    if (typeof keyframe !== 'object' || keyframe === null) {
      throw new Error('Text keyframe must be an object');
    }
    const time = clampNumber(keyframe.time, 0, 1, -1);
    if (time < 0 || time > 1) {
      throw new Error('Text keyframe time must be between 0 and 1');
    }
    const easing = normalizeTransformEasing(keyframe.easing, 'linear');
    const easingOverrides = normalizeTransformEasingOverrides(keyframe.easingOverrides);

    return {
      time,
      x: clampNumber(keyframe.x, 0, 1, 0.5),
      y: clampNumber(keyframe.y, 0, 1, 0.5),
      scaleX: clampNumber(keyframe.scaleX, 0.1, 3, 1),
      scaleY: clampNumber(keyframe.scaleY, 0.1, 3, 1),
      rotation: clampNumber(keyframe.rotation, -360, 360, 0),
      opacity: clampNumber(keyframe.opacity, 0, 1, 1),
      easing,
      ...(easingOverrides ? { easingOverrides } : {}),
    } satisfies TransformKeyframe;
  });

  normalized.sort((a, b) => a.time - b.time);
  for (let i = 1; i < normalized.length; i++) {
    if (Math.abs(normalized[i].time - normalized[i - 1].time) <= 0.000001) {
      throw new Error('Text keyframes must use unique time markers');
    }
  }
  return normalized;
}

export function validateTextCapabilityMatrixCompliance(config: TextConfig): void {
  const supported = new Set<string>(STRICT_PARITY_TEXT_CAPABILITY_MATRIX.supportedEffects);
  if (!supported.has(config.effect)) {
    throw new Error(
      `Text effect "${config.effect}" is not supported in ${STRICT_PARITY_TEXT_CAPABILITY_MATRIX.mode} mode`,
    );
  }
}

function normalizeTextConfig(rawConfig: any): TextConfig {
  if (typeof rawConfig !== 'object' || rawConfig === null) {
    throw new Error('Text clip must include textConfig object');
  }

  const text = typeof rawConfig.text === 'string' ? rawConfig.text.trim() : '';
  if (!text) {
    throw new Error('Text clip text must be non-empty');
  }

  const normalized: TextConfig = {
    text,
    fontFamily:
      typeof rawConfig.fontFamily === 'string' && rawConfig.fontFamily.trim().length > 0
        ? rawConfig.fontFamily.trim()
        : 'Noto Sans',
    fontSize: clampNumber(rawConfig.fontSize, 8, 256, 48),
    fontWeight: clampNumber(rawConfig.fontWeight, 100, 900, 700),
    fontStyle: rawConfig.fontStyle === 'italic' ? 'italic' : 'normal',
    color: sanitizeColor(rawConfig.color, '#ffffff'),
    backgroundColor: sanitizeColor(rawConfig.backgroundColor, 'transparent'),
    textAlign: rawConfig.textAlign === 'left' || rawConfig.textAlign === 'right' ? rawConfig.textAlign : 'center',
    effect:
      rawConfig.effect === 'none' ||
      rawConfig.effect === 'shadow' ||
      rawConfig.effect === 'outline' ||
      rawConfig.effect === 'glow' ||
      rawConfig.effect === 'typewriter' ||
      rawConfig.effect === 'fade-in-word'
        ? rawConfig.effect
        : 'none',
    effectColor: sanitizeColor(rawConfig.effectColor, '#000000'),
    textShadow: sanitizeCssTextEffect(rawConfig.textShadow),
    textStroke: sanitizeCssTextEffect(rawConfig.textStroke),
    lineHeight: clampNumber(rawConfig.lineHeight, 0.8, 3, 1.25),
    letterSpacing: clampNumber(rawConfig.letterSpacing, -8, 24, 0),
  };

  validateTextCapabilityMatrixCompliance(normalized);
  return normalized;
}

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

  validateTextContractVersion(data);

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

    if (!['video', 'audio', 'overlay', 'text'].includes(track.type)) {
      throw new Error('Track type must be "video", "audio", "overlay", or "text"');
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

      if (typeof clip.volume !== 'number') {
        clip.volume = track.type === 'text' ? 0 : 1;
      }
      if (clip.volume < 0 || clip.volume > 2) {
        throw new Error('Clip volume must be 0-2');
      }
      if (typeof clip.speed !== 'number') {
        clip.speed = 1;
      }
      if (!Array.isArray(clip.effects)) {
        clip.effects = [];
      }
      if (track.type === 'text' || clip.textConfig) {
        clip.textConfig = normalizeTextConfig(clip.textConfig);
        if (typeof clip.transform !== 'object' || clip.transform === null) {
          clip.transform = {
            x: 0.5,
            y: 0.5,
            scaleX: 1,
            scaleY: 1,
            rotation: 0,
            opacity: 1,
            keyframes: [],
          };
        }
        clip.transform.keyframes = validateTransformKeyframes(clip.transform.keyframes);
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

    const isGeneratedTextPlaceholder = a.source === 'generated' && a.format === 'text';
    if (!isGeneratedTextPlaceholder && (typeof a.path !== 'string' || a.path.length === 0)) {
      throw new Error('Asset must have valid path');
    }

    // Security: Check for path traversal attempts
    if (typeof a.path === 'string' && a.path.length > 0 && (a.path.includes('..') || a.path.includes('\0'))) {
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
