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
  type: 'video' | 'audio' | 'overlay' | 'text';
  name: string;              // "V1", "V2", "A1", "T1", etc.
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  visible: boolean;          // Whether track is visible in preview/render
  height?: number;           // UI track height
  zIndex?: number;           // For overlay tracks stacking order
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
  transitions?: {
    fadeIn?: number;         // fade in duration (seconds)
    fadeOut?: number;        // fade out duration (seconds)
  };
  inTransition?: ClipTransition;  // Clip-to-clip transition from previous clip
  transform?: ClipTransform; // For overlay clips
  textConfig?: TextConfig;   // For text clips
  groupId?: string;          // For compound clip grouping
  duplicateBoundaryFrameTrim?: {
    frameCount: number;
    seconds: number;
    fps: number;
    reason: 'matching_first_last_frame_boundary';
  };
}

export interface TextConfig {
  text: string;
  fontFamily: string;        // Google Fonts family name
  fontSize: number;          // px
  fontWeight: number;        // 400, 700, etc.
  fontStyle: 'normal' | 'italic';
  color: string;             // hex color
  backgroundColor: string;   // hex color or 'transparent'
  textAlign: 'left' | 'center' | 'right';
  effect: 'none' | 'shadow' | 'outline' | 'glow' | 'typewriter' | 'fade-in-word';
  effectColor?: string;      // for shadow/outline/glow
  textShadow?: string;
  textStroke?: string;
  lineHeight?: number;
  letterSpacing?: number;
}

export interface Asset {
  id: string;
  type: 'video' | 'audio' | 'image';
  source: 'generated' | 'imported';

  // For generated media
  taskId?: string;           // backend task_id
  model?: string;

  // File info
  name?: string;             // display name
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

  // Generation metadata (prompt, reference images, model used)
  generationPrompt?: string;
  referenceUrls?: string[];
  generationModelId?: string;
  generationAspectRatio?: string;
  generationExtraParams?: Record<string, unknown>;
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
// Clip-to-Clip Transitions
// ========================================

export type TransitionName =
  | 'none'
  | 'crossfade'
  | 'wipeLeft'
  | 'wipeRight'
  | 'wipeUp'
  | 'wipeDown'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'zoomIn'
  | 'zoomOut'
  | 'circleOpen'
  | 'circleClose'
  | 'diamondOpen'
  | 'blur'
  | 'pixelize'
  | 'radial'
  | 'smoothLeft'
  | 'smoothRight';

export type TransitionAlignment = 'start' | 'center' | 'end';

export interface ClipTransition {
  name: TransitionName;
  durationMs: number;  // 200-2000ms, default 500ms
  alignment?: TransitionAlignment;  // default 'center' — how overlap is distributed
}

// ========================================
// Overlay & Transform
// ========================================

export interface ClipTransform {
  // Position (0-1 normalized, relative to video dimensions)
  x: number;                 // 0 = left, 0.5 = center, 1 = right
  y: number;                 // 0 = top, 0.5 = center, 1 = bottom

  // Scale (0.1 - 3.0)
  scaleX: number;            // 1.0 = original width
  scaleY: number;            // 1.0 = original height

  // Rotation (degrees)
  rotation: number;          // 0 - 360

  // Opacity
  opacity: number;           // 0.0 - 1.0

  // Keyframes for animation
  keyframes?: TransformKeyframe[];
}

export type TransformEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export type TransformKeyframeProperty =
  | 'x'
  | 'y'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'opacity';

export type TransformEasingOverrides = Partial<Record<TransformKeyframeProperty, TransformEasing>>;

export interface TransformKeyframe {
  time: number;              // Time in clip duration (0 - 1 normalized)
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  easing?: TransformEasing;
  easingOverrides?: TransformEasingOverrides;
}

// ========================================
// Silence Detection & Dead Air Removal
// ========================================

export interface SilentRegion {
  id: string;
  trackId: string;           // Which track this belongs to
  startTime: number;         // Start time in seconds
  endTime: number;           // End time in seconds
  duration: number;          // Duration in seconds
  adjustedStartTime: number; // start + softeningBuffer
  adjustedEndTime: number;   // end - softeningBuffer
  adjustedDuration: number;  // may be 0 if skipped
  selected: boolean;         // User can toggle selection to remove
  averageDb: number;         // Average dB level in this region
  skipped: boolean;          // true if too short after buffer
  manual?: boolean;          // true when user manually marks a cut range
}

export interface SilenceDetectionConfig {
  threshold: number;         // dB threshold for silence (e.g., -40)
  minDuration: number;       // Minimum silence duration to detect (seconds, e.g., 0.5)
  softeningBuffer: number;   // Buffer in seconds to add/subtract at region edges (default 0.2)
  enabled: boolean;          // Whether silence detection is active
  trackIds: string[];        // Which tracks to analyze
}

export interface SilenceDetectionResult {
  regions: SilentRegion[];
  totalSilenceDuration: number;
  totalActiveDuration: number;
  analysisComplete: boolean;
}

export type AnalysisStage =
  | 'idle'
  | 'preparing'
  | 'scanning'
  | 'detecting'
  | 'applying_buffer'
  | 'done'
  | 'error';

/**
 * Reference interface for the Silence Detection Dialog's local state.
 * NOT used as a single useState<SilenceDetectionDialogState>() -- each
 * field is managed by its own useState hook. This exists as a type
 * contract / documentation for what state the dialog manages.
 */
export interface SilenceDetectionDialogState {
  isOpen: boolean;
  config: SilenceDetectionConfig;
  regions: SilentRegion[];
  analysisComplete: boolean;
  isAnalyzing: boolean;
  analysisStage: AnalysisStage;
  playbackTime: number;
  timelineZoom: number;
  skipSilencePreview: boolean;
  applyToAllTracks: boolean;
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
// Render Spec (Cloud Run Job)
// ========================================

export type RenderProfile = 'preview' | 'standard' | 'high';

export interface RenderSpec {
  project: VideoEditorProject;       // Existing editor state (tracks, clips, assets)
  profile: RenderProfile;
  renderHash: string;                // sha256(inputs + timeline + profile)
  outputKey: string;                 // R2 path: renders/{profile}/{renderHash}.mp4
  inputAssetKeys: Record<string, string>;  // assetId -> R2 object key mapping
  jobId?: string;                    // For progress tracking
}

// ========================================
// Media Library
// ========================================

export interface MediaLibraryAsset {
  id: string;
  type: 'video' | 'audio' | 'image';
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
  /** Original generation prompt (from Draft with AI or Quick Generate) */
  generationPrompt?: string;
  /** Reference image URLs used during generation */
  referenceUrls?: string[];
  /** Model ID used during generation */
  generationModelId?: string;
  /** Aspect ratio used during generation */
  generationAspectRatio?: string;
  /** Model-specific options used during generation */
  generationExtraParams?: Record<string, unknown>;
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
          id: 'track-t1',
          type: 'text',
          name: 'T1',
          clips: [],
          muted: false,
          locked: false,
          visible: true,
          height: 50
        },
        {
          id: 'track-v2',
          type: 'overlay',
          name: 'V2',
          clips: [],
          muted: false,
          locked: false,
          visible: true,
          height: 60
        },
        {
          id: 'track-v1',
          type: 'video',
          name: 'V1',
          clips: [],
          muted: false,
          locked: false,
          visible: true,
          height: 80
        },
        {
          id: 'track-a1',
          type: 'audio',
          name: 'A1',
          clips: [],
          muted: false,
          locked: false,
          visible: true,
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
  if (!Number.isFinite(seconds)) {
    return '0:00.00';
  }
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
    name: asset.title,
    path: localPath,
    originalPath: asset.url,
    filename: localPath.split('/').pop() || localPath.split('\\').pop() || 'unknown',
    format: asset.format,
    duration: asset.duration,
    thumbnailPath: asset.thumbnailUrl || undefined,
    generationPrompt: asset.generationPrompt,
    referenceUrls: asset.referenceUrls,
    generationModelId: asset.generationModelId,
    generationAspectRatio: asset.generationAspectRatio,
    generationExtraParams: asset.generationExtraParams,
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
  // Images get 5s default; video/audio fallback to 10s if duration unknown
  const isImageAsset = asset.type === 'image';
  const clipDuration = isImageAsset ? 5 : (asset.duration > 0 ? asset.duration : 10);
  const newClip: Clip = {
    id: generateId('clip'),
    assetId: asset.id,
    trackId: track.id,
    startTime,
    duration: clipDuration,
    trimIn: 0,
    trimOut: clipDuration,
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
  type: 'video' | 'audio' | 'image'
): Track | undefined {
  if (type === 'image') {
    // Images go to video track first, then overlay
    return timeline.tracks.find(track =>
      (track.type === 'video' || track.type === 'overlay') && !track.muted && !track.locked
    );
  }
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

/**
 * Apply a softening buffer to silence regions.
 * For each region: adjustedStart = start + buffer, adjustedEnd = end - buffer.
 * If the buffer makes the region too short (adjustedEnd <= adjustedStart),
 * the region is marked as skipped with adjustedDuration = 0.
 */
export function applyBufferToRegions(
  regions: SilentRegion[],
  bufferSeconds: number
): SilentRegion[] {
  const buf = Math.max(0, bufferSeconds);
  return regions.map((region) => {
    // Manual ranges are explicit user intent and should not collapse due buffer.
    if (region.manual) {
      const adjustedStartTime = Math.max(0, region.startTime);
      const adjustedEndTime = Math.max(adjustedStartTime, region.endTime);
      return {
        ...region,
        adjustedStartTime,
        adjustedEndTime,
        adjustedDuration: Math.max(0, adjustedEndTime - adjustedStartTime),
        skipped: false,
      };
    }

    const adjustedStartTime = Math.max(0, region.startTime + buf);
    const adjustedEndTime = region.endTime - buf;
    const skipped = adjustedEndTime <= adjustedStartTime;
    return {
      ...region,
      adjustedStartTime,
      adjustedEndTime,
      adjustedDuration: skipped ? 0 : adjustedEndTime - adjustedStartTime,
      skipped,
    };
  });
}

/**
 * Convert a dB value to a percentage for display purposes.
 * Maps the range [-60dB, -10dB] to [0%, 100%].
 * Values outside this range are NOT clamped.
 */
export function dbToPercent(db: number): number {
  return ((db + 60) / 50) * 100;
}

// ========================================
// V2 Migration (Seconds -> Milliseconds)
// ========================================

/**
 * V2 project clip fields (ms-based).
 * Used in migrated projects.
 */
export interface ClipV2 extends Omit<Clip, 'startTime' | 'duration' | 'trimIn' | 'trimOut' | 'transitions'> {
  startMs: number;
  durationMs: number;
  inMs: number;
  outMs: number;
  transitions?: {
    fadeInMs?: number;
    fadeOutMs?: number;
  };
  // Keep legacy fields as optional for backward compat
  startTime?: number;
  duration?: number;
  trimIn?: number;
  trimOut?: number;
}

/**
 * V2 project settings with ms-based duration.
 */
export interface ProjectSettingsV2 extends Omit<ProjectSettings, 'duration'> {
  durationMs: number;
  duration?: number;
}

/**
 * V2 silent region (ms-based).
 */
export interface SilentRegionV2 extends Omit<SilentRegion, 'startTime' | 'endTime' | 'duration'> {
  startMs: number;
  endMs: number;
  durationMs: number;
  // Keep legacy
  startTime?: number;
  endTime?: number;
  duration?: number;
}

/**
 * Migrate a v1.0 project (seconds-based) to v2.0 (milliseconds-based).
 * Idempotent: calling on a v2.0+ project returns it unchanged.
 */
export function migrateProjectV1ToV2(project: any): any {
  if (!project || project.version !== '1.0') {
    return project;
  }

  const migrated = JSON.parse(JSON.stringify(project));
  migrated.version = '2.0';

  // Migrate settings.duration -> settings.durationMs
  if (typeof migrated.settings?.duration === 'number') {
    migrated.settings.durationMs = Math.round(migrated.settings.duration * 1000);
  }

  // Migrate clips
  if (migrated.timeline?.tracks) {
    for (const track of migrated.timeline.tracks) {
      if (!Array.isArray(track.clips)) continue;
      for (const clip of track.clips) {
        if (typeof clip.startTime === 'number') {
          clip.startMs = Math.round(clip.startTime * 1000);
        }
        if (typeof clip.duration === 'number') {
          clip.durationMs = Math.round(clip.duration * 1000);
        }
        if (typeof clip.trimIn === 'number') {
          clip.inMs = Math.round(clip.trimIn * 1000);
        }
        if (typeof clip.trimOut === 'number') {
          clip.outMs = Math.round(clip.trimOut * 1000);
        }
        if (clip.transitions) {
          if (typeof clip.transitions.fadeIn === 'number') {
            clip.transitions.fadeInMs = Math.round(clip.transitions.fadeIn * 1000);
          }
          if (typeof clip.transitions.fadeOut === 'number') {
            clip.transitions.fadeOutMs = Math.round(clip.transitions.fadeOut * 1000);
          }
        }
      }
    }
  }

  return migrated;
}

/**
 * Format milliseconds as MM:SS.CC or HH:MM:SS.CC
 */
export function formatTimeMs(ms: number): string {
  if (!Number.isFinite(ms)) {
    return '0:00.00';
  }
  const totalSeconds = ms / 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const centiseconds = Math.floor((totalSeconds % 1) * 100);

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
  }

  return `${mins}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

/**
 * Calculate total project duration from timeline using ms-based clips.
 * Falls back to seconds-based fields if ms fields not present.
 */
export function calculateProjectDurationMs(timeline: Timeline): number {
  let maxEnd = 0;

  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      const c = clip as any;
      // Prefer ms fields, fall back to seconds * 1000
      const startMs = typeof c.startMs === 'number' ? c.startMs : (c.startTime || 0) * 1000;
      const durationMs = typeof c.durationMs === 'number' ? c.durationMs : (c.duration || 0) * 1000;
      const clipEnd = startMs + durationMs;
      if (clipEnd > maxEnd) {
        maxEnd = clipEnd;
      }
    }
  }

  return maxEnd;
}
