import type { CanonicalClipTransform, CanonicalNleProject, ManagedAssetRef } from '@smartspec/shared';
import { createEmptyProject, type Asset, type Clip, type Track, type VideoEditorProject } from '../../types/videoEditor';

export type WorkerAssetResolution = {
  refs: Record<string, ManagedAssetRef>;
  unresolved: string[];
};

export type WorkerProjectBuild = {
  project: CanonicalNleProject;
  unsupported: string[];
};

function toSafeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 160) || 'editor-project';
}

function clipSourceOut(clip: Clip): number {
  const explicit = Number.isFinite(clip.trimOut) && clip.trimOut > clip.trimIn
    ? clip.trimOut
    : clip.trimIn + Math.max(0.05, clip.duration * Math.max(0.01, clip.speed || 1));
  return Math.max(clip.trimIn, explicit);
}

function mapTransform(clip: Clip): CanonicalClipTransform | undefined {
  const transform = clip.transform;
  if (!transform) return undefined;
  const base: CanonicalClipTransform = {
    x: transform.x,
    y: transform.y,
    scaleX: transform.scaleX,
    scaleY: transform.scaleY,
    rotation: transform.rotation,
    opacity: transform.opacity,
  };
  const keyframes = transform.keyframes?.map((keyframe) => ({
    time: Math.max(0, Math.min(1, keyframe.time)),
    x: keyframe.x,
    y: keyframe.y,
    scaleX: keyframe.scaleX,
    scaleY: keyframe.scaleY,
    rotation: keyframe.rotation,
    opacity: keyframe.opacity,
    ...(keyframe.easing ? { easing: keyframe.easing } : {}),
  }));
  return keyframes && keyframes.length > 0 ? { ...base, keyframes } : base;
}

function mapTrackKind(track: Track): 'video' | 'audio' | 'subtitle' | 'overlay' {
  if (track.type === 'audio') return 'audio';
  if (track.type === 'text') return 'subtitle';
  if (track.type === 'overlay') return 'overlay';
  return 'video';
}

function mapClip(clip: Clip, track: Track, refs: Record<string, ManagedAssetRef>, hasSoloAudioTrack: boolean): {
  clip: CanonicalNleProject['tracks'][number]['clips'][number] | null;
  unsupported: string[];
} {
  const asset = refs[clip.assetId];
  if (!asset) return { clip: null, unsupported: [`asset:${clip.assetId}`] };

  const unsupported: string[] = [];
  if (clip.effects.length > 0) unsupported.push(`effects:${clip.id}`);
  if (clip.inTransition || clip.transitions) unsupported.push(`transitions:${clip.id}`);
  if (track.type === 'overlay' || track.type === 'text') unsupported.push(`track:${track.id}`);

  const trackSuppressed = track.muted || (track.type === 'audio' && hasSoloAudioTrack && track.solo !== true);
  const trackVolume = track.type === 'audio' && Number.isFinite(track.volume) ? Math.max(0, Math.min(1, track.volume as number)) : 1;
  const clipVolume = Number.isFinite(clip.volume) && clip.volume >= 0 ? clip.volume : 1;
  const effectiveVolume = trackSuppressed ? 0 : clipVolume * trackVolume;
  const canonicalClip: CanonicalNleProject['tracks'][number]['clips'][number] = {
    id: toSafeId(clip.id),
    asset,
    startMs: Math.max(0, Math.round(clip.startTime * 1000)),
    sourceInMs: Math.max(0, Math.round(clip.trimIn * 1000)),
    sourceOutMs: Math.max(0, Math.round(clipSourceOut(clip) * 1000)),
    playbackRate: Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1,
    volume: effectiveVolume,
    muted: effectiveVolume <= 0,
    ...(mapTransform(clip) ? { transform: mapTransform(clip) } : {}),
    ...(clip.textConfig ? {
      text: {
        value: clip.textConfig.text,
        style: {
          fontFamily: clip.textConfig.fontFamily,
          fontSize: clip.textConfig.fontSize,
          fontWeight: clip.textConfig.fontWeight,
          fontStyle: clip.textConfig.fontStyle,
          color: clip.textConfig.color,
          backgroundColor: clip.textConfig.backgroundColor,
          textAlign: clip.textConfig.textAlign,
          effect: clip.textConfig.effect,
        },
      },
    } : {}),
  };
  return { clip: canonicalClip, unsupported };
}

export function buildCanonicalWorkerProject(
  source: VideoEditorProject,
  resolution: WorkerAssetResolution,
  projectId: string,
): WorkerProjectBuild {
  const unsupported: string[] = [];
  const hasSoloAudioTrack = source.timeline.tracks.some((track) => track.type === 'audio' && track.solo === true);
  const tracks = source.timeline.tracks.map((track) => {
    const clips = track.clips.flatMap((clip) => {
      const mapped = mapClip(clip, track, resolution.refs, hasSoloAudioTrack);
      unsupported.push(...mapped.unsupported);
      return mapped.clip ? [mapped.clip] : [];
    });
    return { id: toSafeId(track.id), kind: mapTrackKind(track), clips };
  });

  const cameraSettings = Object.fromEntries(
    source.timeline.tracks.flatMap((track) => track.clips)
      .filter((clip) => clip.smartCamera)
      .map((clip) => [toSafeId(clip.id), clip.smartCamera]),
  );

  const project: CanonicalNleProject = {
    projectId: toSafeId(projectId),
    schemaVersion: 'nle.web.1',
    timebase: { numerator: 1, denominator: 1000 },
    canvas: {
      width: Math.max(1, Math.round(source.settings.width)),
      height: Math.max(1, Math.round(source.settings.height)),
      pixelAspectRatio: { numerator: 1, denominator: 1 },
    },
    tracks,
    markers: [],
    render: {
      profileId: 'web-render-1',
      fps: { numerator: Math.max(1, Math.round(source.settings.fps)), denominator: 1 },
      outputRoles: ['final_video'],
    },
    migration: {
      sourceFormat: 'web-video-editor-phase3',
      sourceVersion: source.version || '1.0',
      mappingVersion: 'web-editor-worker-2',
      unresolved: resolution.unresolved,
      unsupported,
      preservedUnknown: {
        ...(Object.keys(cameraSettings).length > 0 ? { smartCamera: cameraSettings } : {}),
        ...(Object.keys(cameraSettings).length > 0
          ? {
              cameraMotionPlans: Object.fromEntries(
                Object.entries(cameraSettings)
                  .filter(([, settings]) => settings?.plan && settings.analysisStatus !== 'stale')
                  .map(([clipId, settings]) => [clipId, settings?.plan]),
              ),
            }
          : {}),
        audioMixing: source.audioMixing,
      },
    },
  };
  return { project, unsupported };
}

export function getAssetSourceUrl(asset: Asset): string | null {
  const candidate = asset.originalPath || asset.path;
  if (typeof candidate !== 'string' || !candidate.trim()) return null;
  const value = candidate.trim();
  if (value.startsWith('/api/storage/files/') || value.startsWith('/uploads/') || /^https:\/\//i.test(value)) return value;
  return null;
}

/** Converts the compact migration editor payload into the full Phase 3 shape. */
export function normalizePersistedVideoEditorProject(value: unknown): VideoEditorProject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.timeline && typeof candidate.timeline === 'object' && candidate.settings && candidate.assets) {
    return value as VideoEditorProject;
  }
  if (!Array.isArray(candidate.tracks) || !Array.isArray(candidate.assets)) return null;

  const project = createEmptyProject(typeof candidate.projectName === 'string' ? candidate.projectName : 'Untitled Project');
  project.assets = {};
  for (const raw of candidate.assets) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : null;
    const type = item.type === 'audio' || item.type === 'image' || item.type === 'video' ? item.type : null;
    if (!id || !type) continue;
    const path = typeof item.uri === 'string' && item.uri ? item.uri : typeof item.path === 'string' ? item.path : '';
    project.assets[id] = {
      id,
      type,
      source: 'imported',
      ...(Number.isSafeInteger(item.mediaAssetId) ? { mediaAssetId: item.mediaAssetId as number } : {}),
      taskId: typeof item.taskId === 'string' ? item.taskId : undefined,
      name: typeof item.name === 'string' ? item.name : id,
      path,
      originalPath: typeof item.originalPath === 'string' ? item.originalPath : path,
      filename: typeof item.name === 'string' ? item.name : id,
      format: typeof item.format === 'string' ? item.format : 'mp4',
      duration: typeof item.duration === 'number' && Number.isFinite(item.duration) ? Math.max(0, item.duration) : 0,
    };
  }

  project.timeline.tracks = [];
  for (const raw of candidate.tracks) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const sourceTrack = raw as Record<string, unknown>;
    const type: Track['type'] = sourceTrack.kind === 'audio' || sourceTrack.kind === 'overlay' || sourceTrack.kind === 'text'
      ? sourceTrack.kind
      : 'video';
    const id = typeof sourceTrack.id === 'string' ? sourceTrack.id : `track-${project.timeline.tracks.length + 1}`;
    const clips: Clip[] = [];
    if (Array.isArray(sourceTrack.clips)) {
      for (const rawClip of sourceTrack.clips) {
        if (!rawClip || typeof rawClip !== 'object' || Array.isArray(rawClip)) continue;
        const sourceClip = rawClip as Record<string, unknown>;
        const assetId = typeof sourceClip.assetId === 'string' ? sourceClip.assetId : '';
        if (!assetId || !project.assets[assetId]) continue;
        const duration = typeof sourceClip.duration === 'number' && Number.isFinite(sourceClip.duration) ? Math.max(0.05, sourceClip.duration) : Math.max(0.05, project.assets[assetId].duration || 5);
        const startTime = typeof sourceClip.startTime === 'number' && Number.isFinite(sourceClip.startTime) ? Math.max(0, sourceClip.startTime) : 0;
        clips.push({
          id: typeof sourceClip.id === 'string' ? sourceClip.id : `clip-${clips.length + 1}`,
          assetId,
          trackId: id,
          startTime,
          duration,
          trimIn: 0,
          trimOut: duration,
          volume: 1,
          speed: 1,
          effects: [],
        });
      }
    }
    project.timeline.tracks.push({
      id,
      type,
      name: typeof sourceTrack.name === 'string' ? sourceTrack.name : id,
      clips,
      muted: sourceTrack.muted === true,
      locked: false,
      visible: true,
      height: type === 'text' ? 50 : type === 'audio' || type === 'overlay' ? 60 : 80,
    });
  }
  if (project.timeline.tracks.length === 0) {
    project.timeline.tracks = createEmptyProject().timeline.tracks;
  }
  project.settings.duration = Math.max(0, project.timeline.tracks.flatMap((track) => track.clips).reduce((end, clip) => Math.max(end, clip.startTime + clip.duration), 0));
  project.modifiedAt = new Date().toISOString();
  return project;
}
