import type { Clip, TextConfig, Track, VideoEditorProject } from '../../types/videoEditor';
import { calculateProjectDuration, generateId } from '../../types/videoEditor';

export const STRICT_PARITY_SUPPORTED_TEXT_EFFECTS = ['none', 'shadow', 'outline', 'glow'] as const;

function isSupportedStrictParityEffect(effect: TextConfig['effect']): boolean {
  return STRICT_PARITY_SUPPORTED_TEXT_EFFECTS.includes(
    effect as (typeof STRICT_PARITY_SUPPORTED_TEXT_EFFECTS)[number],
  );
}

export function ensureTextTrack(project: VideoEditorProject): Track {
  const existing = project.timeline.tracks.find((track) => track.type === 'text');
  if (existing) return existing;

  const created: Track = {
    id: 'track-t1',
    type: 'text',
    name: 'T1',
    clips: [],
    muted: false,
    locked: false,
    visible: true,
    height: 50,
  };
  project.timeline.tracks.unshift(created);
  return created;
}

export function canMoveClipToTrack(
  clip: Clip,
  sourceTrackType: Track['type'],
  targetTrackType: Track['type'],
): boolean {
  if (clip.textConfig) {
    return targetTrackType === 'text';
  }
  if ((sourceTrackType === 'video' || sourceTrackType === 'overlay') && targetTrackType === 'audio') {
    return false;
  }
  if (
    sourceTrackType === 'audio' &&
    (targetTrackType === 'video' || targetTrackType === 'overlay' || targetTrackType === 'text')
  ) {
    return false;
  }
  if (sourceTrackType === 'text' && targetTrackType !== 'text') {
    return false;
  }
  return true;
}

export function shouldAllowOverlap(trackType: Track['type'], clip: Clip): boolean {
  return trackType === 'text' || !!clip.textConfig;
}

export function addTextClipToProject(
  project: VideoEditorProject,
  textConfig: TextConfig,
  duration: number,
  currentTime: number,
): Clip {
  if (!isSupportedStrictParityEffect(textConfig.effect)) {
    throw new Error(`Unsupported text effect in strict parity mode: ${textConfig.effect}`);
  }

  const textTrack = ensureTextTrack(project);
  // Ensure newly added text is visible in preview even if user previously hid T1.
  textTrack.visible = true;
  const textAssetId = generateId('text-asset');
  project.assets[textAssetId] = {
    id: textAssetId,
    type: 'image',
    source: 'generated',
    path: '',
    filename: textConfig.text.slice(0, 20) || 'Text',
    format: 'text',
    duration,
  };

  const startTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0;

  const newClip: Clip = {
    id: generateId('clip'),
    assetId: textAssetId,
    trackId: textTrack.id,
    startTime,
    duration,
    trimIn: 0,
    trimOut: duration,
    volume: 0,
    speed: 1.0,
    effects: [],
    textConfig,
  };

  // Text overlap order is defined by array order; preserve append order.
  textTrack.clips.push(newClip);
  project.settings.duration = calculateProjectDuration(project.timeline);
  project.modifiedAt = new Date().toISOString();
  return newClip;
}
