/**
 * Video Editor Type Definitions
 */

// ========================================
// Project Structure
// ========================================

export interface VideoEditorProject {
  version: string;           // "1.0"
  name: string;
  createdAt: string;
  modifiedAt: string;

  settings: ProjectSettings;
  timeline: Timeline;
  assets: Record<string, Asset>;
  audioMixing: AudioMixing;
  export: ExportSettings;
}

export interface ProjectSettings {
  width: number;           // 1920
  height: number;          // 1080
  fps: number;             // 30
  sampleRate: number;      // 48000
  duration: number;        // total project duration in seconds
}

export interface Timeline {
  tracks: Track[];
}

export interface Track {
  id: string;
  type: 'video' | 'audio';
  name: string;              // "V1", "A1", etc.
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  height?: number;           // UI track height
}

export interface Clip {
  id: string;
  assetId: string;           // references assets object
  trackId: string;
  startTime: number;         // position in timeline (seconds)
  duration: number;          // visible duration (seconds)
  trimIn: number;            // trim from start (seconds)
  trimOut: number;           // trim from end (seconds)
  volume: number;            // 0.0 - 1.0
  speed: number;             // 0.5 - 2.0
  effects: Effect[];
}

export interface Asset {
  id: string;
  type: 'video' | 'audio' | 'image';
  source: 'generated' | 'imported';

  // For generated media
  taskId?: string;           // backend task_id
  model?: string;

  // File info
  path: string;              // local path in workspace
  originalPath?: string;     // original URL if generated
  filename: string;
  format: string;

  // Metadata
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  sampleRate?: number;

  // Cache
  thumbnailPath?: string;
  waveformData?: number[];   // for audio visualization
}

export interface AudioMixing {
  ducking: DuckingConfig;
  masterVolume: number;
}

export interface DuckingConfig {
  enabled: boolean;
  voiceoverTrackId: string;  // which track triggers ducking
  threshold: number;         // 0.03
  ratio: number;             // 6.0
  attack: number;            // 10ms
  release: number;           // 300ms
  makeupGain: number;        // 0dB
  backgroundGain: number;    // -1dB
}

export interface ExportSettings {
  codec: string;             // h264_videotoolbox, h264_mf, etc.
  bitrate: number;           // 6000
  audioCodec: string;        // aac
  audioBitrate: number;      // 192
}

export interface Effect {
  type: 'fadeIn' | 'fadeOut' | 'transition' | 'speed' | 'filter';
  parameters: Record<string, any>;
}

// ========================================
// UI State
// ========================================

export interface TimelineState {
  currentTime: number;       // playhead position in seconds
  zoom: number;              // pixels per second
  scrollLeft: number;        // horizontal scroll position
  selectedClipIds: string[];
  hoveredClipId: string | null;
  playbackState: 'playing' | 'paused' | 'stopped';
  loopRegion: { start: number; end: number } | null;
}

export interface EditorState {
  project: VideoEditorProject;
  timeline: TimelineState;
  isDirty: boolean;          // has unsaved changes
  history: HistoryEntry[];
  historyIndex: number;
}

export interface HistoryEntry {
  action: string;
  timestamp: number;
  project: VideoEditorProject;
}

// ========================================
// Render Job
// ========================================

export interface RenderJob {
  id: string;
  outputPath: string;
  status: 'pending' | 'rendering' | 'completed' | 'failed' | 'cancelled';
  progress: number;          // 0.0 - 1.0
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

// ========================================
// Media Library
// ========================================

export interface MediaLibraryAsset {
  id: string;
  type: 'video' | 'audio';
  title: string;
  thumbnailUrl: string;
  duration: number;
  url: string;
  model: string;
  createdAt: Date;
  resolution?: string;
  format: string;
  localPath?: string;
  fileSize?: number;
}

// ========================================
// Helper Functions
// ========================================

/**
 * Create a new empty project
 */
export function createEmptyProject(name: string = 'Untitled Project'): VideoEditorProject {
  return {
    version: '1.0',
    name,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    settings: {
      width: 1920,
      height: 1080,
      fps: 30,
      sampleRate: 48000,
      duration: 0
    },
    timeline: {
      tracks: [
        {
          id: 'track-v1',
          type: 'video',
          name: 'V1',
          clips: [],
          muted: false,
          locked: false,
          height: 80
        },
        {
          id: 'track-a1',
          type: 'audio',
          name: 'A1',
          clips: [],
          muted: false,
          locked: false,
          height: 60
        }
      ]
    },
    assets: {},
    audioMixing: {
      ducking: {
        enabled: false,
        voiceoverTrackId: 'track-a1',
        threshold: 0.03,
        ratio: 6.0,
        attack: 10,
        release: 300,
        makeupGain: 0.0,
        backgroundGain: -1.0
      },
      masterVolume: 1.0
    },
    export: {
      codec: 'h264_videotoolbox',  // will be detected at runtime
      bitrate: 6000,
      audioCodec: 'aac',
      audioBitrate: 192
    }
  };
}

/**
 * Generate unique ID
 */
export function generateId(prefix: string = 'id'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format time in seconds to MM:SS or HH:MM:SS
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}

/**
 * Calculate total project duration from timeline
 */
export function calculateProjectDuration(timeline: Timeline): number {
  let maxEnd = 0;

  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd > maxEnd) {
        maxEnd = clipEnd;
      }
    }
  }

  return maxEnd;
}

/**
 * Add asset to project
 */
export function addAssetToProject(
  project: VideoEditorProject,
  asset: MediaLibraryAsset,
  localPath: string
): Asset {
  const newAsset: Asset = {
    id: generateId('asset'),
    type: asset.type,
    source: 'generated',
    taskId: asset.id,
    model: asset.model,
    path: localPath,
    originalPath: asset.url,
    filename: localPath.split('/').pop() || localPath.split('\\').pop() || 'unknown',
    format: asset.format,
    duration: asset.duration,
    thumbnailPath: asset.thumbnailUrl || undefined
  };

  project.assets[newAsset.id] = newAsset;

  return newAsset;
}

/**
 * Add clip to track
 */
export function addClipToTrack(
  track: Track,
  asset: Asset,
  startTime: number = 0
): Clip {
  const newClip: Clip = {
    id: generateId('clip'),
    assetId: asset.id,
    trackId: track.id,
    startTime,
    duration: asset.duration,
    trimIn: 0,
    trimOut: asset.duration,
    volume: 1.0,
    speed: 1.0,
    effects: []
  };

  track.clips.push(newClip);

  // Sort clips by start time
  track.clips.sort((a, b) => a.startTime - b.startTime);

  return newClip;
}

/**
 * Find track by type
 */
export function findTrackByType(
  timeline: Timeline,
  type: 'video' | 'audio'
): Track | undefined {
  return timeline.tracks.find(track => track.type === type && !track.muted && !track.locked);
}

/**
 * Validate project before export
 */
export function validateProject(project: VideoEditorProject): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check if there are any clips
  const hasClips = project.timeline.tracks.some(track => track.clips.length > 0);
  if (!hasClips) {
    errors.push('Project has no clips');
  }

  // Check if all assets exist
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      if (!project.assets[clip.assetId]) {
        errors.push(`Clip ${clip.id} references missing asset ${clip.assetId}`);
      }
    }
  }

  // Check project duration
  const duration = calculateProjectDuration(project.timeline);
  if (duration === 0) {
    errors.push('Project duration is zero');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
