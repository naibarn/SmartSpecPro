/**
 * Silence Export to Timeline Utilities
 * Pure functions for clip splitting, region removal, and ripple deletion.
 * Separated from React components for testability.
 */

import type {
  Clip,
  Track,
  VideoEditorProject,
  SilentRegion,
} from '../../types/videoEditor';
import { generateId } from '../../types/videoEditor';

const EPSILON = 1e-6; // Floating-point precision threshold

export interface GlobalTimelineCutRange {
  startTime: number;
  endTime: number;
}

/**
 * Normalize cuts once before applying them to any track. This is the same
 * global time-map model used by Worker App, so overlays and camera tracks
 * receive exactly the same timeline compression.
 */
export function normalizeGlobalTimelineCutRanges(
  ranges: GlobalTimelineCutRange[],
  duration: number,
): GlobalTimelineCutRange[] {
  const boundedDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  return ranges
    .map((range) => ({
      startTime: Math.max(0, Math.min(boundedDuration, range.startTime)),
      endTime: Math.max(0, Math.min(boundedDuration, range.endTime)),
    }))
    .filter((range) => range.endTime > range.startTime + EPSILON)
    .sort((left, right) => left.startTime - right.startTime)
    .reduce<GlobalTimelineCutRange[]>((merged, range) => {
      const previous = merged[merged.length - 1];
      if (previous && range.startTime <= previous.endTime + 0.05) {
        previous.endTime = Math.max(previous.endTime, range.endTime);
      } else {
        merged.push({ ...range });
      }
      return merged;
    }, []);
}

function mapTimelineTime(time: number, cuts: GlobalTimelineCutRange[]): number {
  let removed = 0;
  for (const cut of cuts) {
    if (time <= cut.startTime) break;
    if (time < cut.endTime) return Math.max(0, cut.startTime - removed);
    removed += cut.endTime - cut.startTime;
  }
  return Math.max(0, time - removed);
}

function remapClipAcrossGlobalCuts(
  clip: Clip,
  cuts: GlobalTimelineCutRange[],
  trackType: Track['type'],
): Clip[] {
  const clipStart = Math.max(0, clip.startTime);
  const clipEnd = Math.max(clipStart, clip.startTime + Math.max(0, clip.duration));
  if (clipEnd <= clipStart + EPSILON) return [];

  const boundaries = [
    clipStart,
    ...cuts.flatMap((cut) => [cut.startTime, cut.endTime]),
    clipEnd,
  ]
    .filter((value) => value > clipStart + EPSILON && value < clipEnd - EPSILON)
    .sort((left, right) => left - right);

  const slices: Clip[] = [];
  const isTextLike = trackType === 'text' || trackType === 'overlay';
  const speed = Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;

  for (let index = 0; index <= boundaries.length; index += 1) {
    const sourceStart = index === 0 ? clipStart : boundaries[index - 1];
    const sourceEnd = index === boundaries.length ? clipEnd : boundaries[index];
    if (sourceEnd <= sourceStart + EPSILON) continue;

    const isCut = cuts.some(
      (cut) => sourceStart >= cut.startTime - EPSILON && sourceEnd <= cut.endTime + EPSILON,
    );
    if (isCut) continue;

    const mappedStart = mapTimelineTime(sourceStart, cuts);
    const mappedEnd = mapTimelineTime(sourceEnd, cuts);
    const mappedDuration = mappedEnd - mappedStart;
    if (mappedDuration <= EPSILON) continue;

    const pieceOffset = sourceStart - clipStart;
    const pieceDuration = sourceEnd - sourceStart;
    const nextClip: Clip = {
      ...clip,
      id: slices.length === 0 ? clip.id : generateId('clip'),
      startTime: mappedStart,
      duration: mappedDuration,
    };

    if (!isTextLike) {
      nextClip.trimIn = clip.trimIn + pieceOffset * speed;
      nextClip.trimOut = clip.trimIn + (pieceOffset + pieceDuration) * speed;
    }

    slices.push(nextClip);
  }

  return slices;
}

/**
 * Split a clip at a timeline position.
 * Returns [originalClip] if position is at/outside clip bounds.
 * Returns [leftClip, rightClip] if position is within clip.
 *
 * trimIn and trimOut are ABSOLUTE positions in the source asset (seconds).
 */
export function splitClipAtPosition(
  clip: Clip,
  timelinePosition: number,
): [Clip] | [Clip, Clip] {
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;

  // Check if position is outside or at clip boundaries
  if (
    timelinePosition <= clipStart + EPSILON ||
    timelinePosition >= clipEnd - EPSILON
  ) {
    return [clip];
  }

  // Calculate offset from clip start
  const offsetInClip = timelinePosition - clipStart;
  const splitPointInSource = clip.trimIn + offsetInClip;

  // Create left clip
  const leftClip: Clip = {
    ...clip,
    id: generateId('clip'),
    duration: offsetInClip,
    trimOut: splitPointInSource,
  };

  // Create right clip
  const rightClip: Clip = {
    ...clip,
    id: generateId('clip'),
    startTime: timelinePosition,
    duration: clip.duration - offsetInClip,
    trimIn: splitPointInSource,
  };

  return [leftClip, rightClip];
}

/**
 * Split a text/overlay clip at a timeline position.
 * Unlike audio/video clips, text clips don't have meaningful trimIn/trimOut.
 * This splits by adjusting startTime and duration only.
 */
export function splitTextClipAtPosition(
  clip: Clip,
  timelinePosition: number,
): [Clip] | [Clip, Clip] {
  const clipStart = clip.startTime;
  const clipEnd = clip.startTime + clip.duration;

  // Check if position is outside or at clip boundaries
  if (
    timelinePosition <= clipStart + EPSILON ||
    timelinePosition >= clipEnd - EPSILON
  ) {
    return [clip];
  }

  // Calculate offset from clip start
  const offsetInClip = timelinePosition - clipStart;

  // Create left clip (trimIn/trimOut unchanged)
  const leftClip: Clip = {
    ...clip,
    id: generateId('clip'),
    duration: offsetInClip,
  };

  // Create right clip (trimIn/trimOut unchanged)
  const rightClip: Clip = {
    ...clip,
    id: generateId('clip'),
    startTime: timelinePosition,
    duration: clip.duration - offsetInClip,
  };

  return [leftClip, rightClip];
}

/**
 * Check if a region overlaps with a clip.
 */
function regionsOverlap(
  regionStart: number,
  regionEnd: number,
  clipStart: number,
  clipEnd: number,
): boolean {
  return regionStart < clipEnd - EPSILON && regionEnd > clipStart + EPSILON;
}

/**
 * Remove silent regions from a track's clips.
 * Regions must be sorted in DESCENDING order by adjustedStartTime.
 * Processes regions from end to start to maintain position validity.
 *
 * Returns the surviving clips (not yet ripple-deleted).
 */
export function removeRegionsFromTrack(
  initialClips: Clip[],
  regions: SilentRegion[],
  trackType: Track['type'],
): Clip[] {
  if (regions.length === 0) {
    return initialClips;
  }

  // Choose split function based on track type
  const splitFn =
    trackType === 'text' || trackType === 'overlay'
      ? splitTextClipAtPosition
      : splitClipAtPosition;

  let clips = [...initialClips];

  // Process regions in reverse order (last to first)
  for (const region of regions) {
    const newClips: Clip[] = [];

    for (const clip of clips) {
      const clipStart = clip.startTime;
      const clipEnd = clip.startTime + clip.duration;

      // Check if region overlaps this clip
      if (
        !regionsOverlap(
          region.adjustedStartTime,
          region.adjustedEndTime,
          clipStart,
          clipEnd,
        )
      ) {
        // No overlap, keep clip as-is
        newClips.push(clip);
        continue;
      }

      // Region overlaps - split clip at region boundaries
      let currentClips: Clip[] = [clip];

      // Split at region start if inside clip
      if (
        region.adjustedStartTime > clipStart + EPSILON &&
        region.adjustedStartTime < clipEnd - EPSILON
      ) {
        const tempClips: Clip[] = [];
        for (const c of currentClips) {
          const splitResult = splitFn(c, region.adjustedStartTime);
          tempClips.push(...splitResult);
        }
        currentClips = tempClips;
      }

      // Split at region end if inside clip
      if (
        region.adjustedEndTime > clipStart + EPSILON &&
        region.adjustedEndTime < clipEnd - EPSILON
      ) {
        const tempClips: Clip[] = [];
        for (const c of currentClips) {
          const splitResult = splitFn(c, region.adjustedEndTime);
          tempClips.push(...splitResult);
        }
        currentClips = tempClips;
      }

      // Keep only clips that don't fall entirely within the silent region
      for (const c of currentClips) {
        const cStart = c.startTime;
        const cEnd = c.startTime + c.duration;

        // Check if clip is fully contained in the silent region
        const clipFullyInRegion =
          cStart >= region.adjustedStartTime - EPSILON &&
          cEnd <= region.adjustedEndTime + EPSILON;

        // Keep clip if it's NOT fully in region and has non-zero duration
        if (!clipFullyInRegion && c.duration > EPSILON) {
          newClips.push(c);
        }
      }
    }

    clips = newClips;
  }

  return clips;
}

/**
 * Ripple delete: reposition clips sequentially with no gaps.
 * Sorts clips by startTime, then reassigns startTime values.
 */
export function rippleDeleteTrack(clips: Clip[]): Clip[] {
  if (clips.length === 0) {
    return [];
  }

  // Sort by startTime
  const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime);

  // Reposition clips sequentially
  let currentTime = 0;
  const repositioned = sortedClips.map((clip) => {
    const newClip = { ...clip, startTime: currentTime };
    currentTime += clip.duration;
    return newClip;
  });

  return repositioned;
}

/**
 * Calculate project duration from timeline.
 */
function calculateProjectDuration(timeline: VideoEditorProject['timeline']): number {
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
 * Main orchestrator for export to timeline.
 * Returns a new deep-cloned project with regions removed.
 */
export function processExportToTimeline(
  project: VideoEditorProject,
  selectedRegions: SilentRegion[],
  applyToAllTracks: boolean,
  analyzedTrackIds: string[],
): VideoEditorProject {
  // Deep clone project
  const newProject: VideoEditorProject = JSON.parse(JSON.stringify(project));

  // Filter regions and build one shared timeline map. Regions may be repeated
  // for multiple occurrences of the selected source asset; normalization makes
  // those overlaps harmless.
  const validRegions = selectedRegions
    .filter(
      (r) => r.selected && !r.skipped && r.adjustedDuration > EPSILON,
    )
    .map((region) => ({
      startTime: region.adjustedStartTime,
      endTime: region.adjustedEndTime,
    }));

  if (validRegions.length === 0) {
    return newProject;
  }

  const projectDuration = Math.max(
    calculateProjectDuration(newProject.timeline),
    newProject.settings.duration || 0,
  );
  const globalCuts = normalizeGlobalTimelineCutRanges(validRegions, projectDuration);
  if (globalCuts.length === 0) return newProject;

  // Determine target tracks
  const targetTrackIds = new Set<string>();

  // Always include analyzed tracks
  for (const trackId of analyzedTrackIds) {
    targetTrackIds.add(trackId);
  }

  // Always link video ↔ audio tracks to prevent desync.
  // If any audio or video track is analyzed, include ALL video + audio tracks.
  const analyzedTypes = new Set(
    analyzedTrackIds
      .map((id) => newProject.timeline.tracks.find((t) => t.id === id)?.type)
      .filter(Boolean),
  );
  if (analyzedTypes.has('audio') || analyzedTypes.has('video')) {
    for (const track of newProject.timeline.tracks) {
      if (
        (track.type === 'video' || track.type === 'audio') &&
        !track.locked &&
        !track.muted &&
        track.clips.length > 0
      ) {
        targetTrackIds.add(track.id);
      }
    }
  }

  if (applyToAllTracks) {
    // Worker parity: one explicit global cut remaps every populated track,
    // including overlays, text, muted tracks, and locked tracks. The user has
    // explicitly chosen synchronized multi-track editing at this point.
    for (const track of newProject.timeline.tracks) {
      if (track.clips.length > 0) {
        targetTrackIds.add(track.id);
      }
    }
  }

  // Process each target track
  for (const track of newProject.timeline.tracks) {
    if (!targetTrackIds.has(track.id)) {
      continue;
    }

    track.clips = track.clips.flatMap((clip) =>
      remapClipAcrossGlobalCuts(clip, globalCuts, track.type),
    );
  }

  // Recalculate project duration
  newProject.settings.duration = calculateProjectDuration(newProject.timeline);
  newProject.metadata = {
    ...newProject.metadata,
    deadAirCutCount: globalCuts.length,
    deadAirCutRanges: globalCuts,
    deadAirCutFingerprint: JSON.stringify(globalCuts),
  };

  // Update timestamp
  newProject.modifiedAt = new Date().toISOString();

  return newProject;
}
