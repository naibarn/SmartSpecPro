import { describe, it, expect } from 'vitest';
import {
  splitClipAtPosition,
  splitTextClipAtPosition,
  removeRegionsFromTrack,
  rippleDeleteTrack,
  processExportToTimeline,
} from '../silenceExportUtils';
import type {
  Clip,
  Track,
  VideoEditorProject,
  SilentRegion,
} from '../../../types/videoEditor';
import { generateId } from '../../../types/videoEditor';

// Helper to create test clips
function createClip(
  id: string,
  startTime: number,
  duration: number,
  trimIn: number,
  trimOut: number,
): Clip {
  return {
    id,
    startTime,
    duration,
    trimIn,
    trimOut,
    assetId: 'asset-1',
    type: 'audio',
    clipType: 'audio',
    trackId: 'track-1',
    volume: 1.0,
    selected: false,
  };
}

// Helper to create test regions
function createRegion(
  id: string,
  adjustedStartTime: number,
  adjustedEndTime: number,
): SilentRegion {
  return {
    id,
    trackId: 'track-1',
    startTime: adjustedStartTime,
    endTime: adjustedEndTime,
    duration: adjustedEndTime - adjustedStartTime,
    adjustedStartTime,
    adjustedEndTime,
    adjustedDuration: adjustedEndTime - adjustedStartTime,
    selected: true,
    averageDb: -40,
    skipped: false,
  };
}

describe('splitClipAtPosition', () => {
  it('should split a clip at midpoint with correct trimIn/trimOut', () => {
    const clip = createClip('clip-1', 2.0, 8.0, 1.0, 9.0);
    const result = splitClipAtPosition(clip, 6.0);

    expect(result.length).toBe(2);
    const [left, right] = result;

    // Left clip
    expect(left.startTime).toBe(2.0);
    expect(left.duration).toBe(4.0);
    expect(left.trimIn).toBe(1.0);
    expect(left.trimOut).toBe(5.0); // trimIn + duration

    // Right clip
    expect(right.startTime).toBe(6.0);
    expect(right.duration).toBe(4.0);
    expect(right.trimIn).toBe(5.0);
    expect(right.trimOut).toBe(9.0);

    // Both reference same asset
    expect(left.assetId).toBe(clip.assetId);
    expect(right.assetId).toBe(clip.assetId);
  });

  it('should return original clip when splitting at clip start', () => {
    const clip = createClip('clip-1', 2.0, 8.0, 1.0, 9.0);
    const result = splitClipAtPosition(clip, 2.0);

    expect(result.length).toBe(1);
    expect(result[0]).toEqual(clip);
  });

  it('should return original clip when splitting at clip end', () => {
    const clip = createClip('clip-1', 2.0, 8.0, 1.0, 9.0);
    const result = splitClipAtPosition(clip, 10.0); // startTime + duration

    expect(result.length).toBe(1);
    expect(result[0]).toEqual(clip);
  });

  it('should return original clip when splitting outside clip bounds', () => {
    const clip = createClip('clip-1', 2.0, 8.0, 1.0, 9.0);

    // Before clip
    const resultBefore = splitClipAtPosition(clip, 1.0);
    expect(resultBefore.length).toBe(1);
    expect(resultBefore[0]).toEqual(clip);

    // After clip
    const resultAfter = splitClipAtPosition(clip, 15.0);
    expect(resultAfter.length).toBe(1);
    expect(resultAfter[0]).toEqual(clip);
  });

  it('should have split clip durations sum to original duration', () => {
    const clip = createClip('clip-1', 2.0, 8.0, 1.0, 9.0);
    const result = splitClipAtPosition(clip, 5.0);

    expect(result.length).toBe(2);
    const totalDuration = result[0].duration + result[1].duration;
    expect(totalDuration).toBeCloseTo(clip.duration, 6);
  });

  it('should generate new IDs for split clips', () => {
    const clip = createClip('clip-1', 2.0, 8.0, 1.0, 9.0);
    const result = splitClipAtPosition(clip, 6.0);

    expect(result.length).toBe(2);
    expect(result[0].id).not.toBe(clip.id);
    expect(result[1].id).not.toBe(clip.id);
    expect(result[0].id).not.toBe(result[1].id);
  });
});

describe('splitTextClipAtPosition', () => {
  it('should split text clip by adjusting startTime and duration only', () => {
    const clip: Clip = {
      ...createClip('clip-1', 2.0, 8.0, 0.0, 0.0),
      type: 'text',
      clipType: 'text',
    };

    const result = splitTextClipAtPosition(clip, 6.0);

    expect(result.length).toBe(2);
    const [left, right] = result;

    // Left clip
    expect(left.startTime).toBe(2.0);
    expect(left.duration).toBe(4.0);
    expect(left.trimIn).toBe(0.0); // Unchanged
    expect(left.trimOut).toBe(0.0); // Unchanged

    // Right clip
    expect(right.startTime).toBe(6.0);
    expect(right.duration).toBe(4.0);
    expect(right.trimIn).toBe(0.0); // Unchanged
    expect(right.trimOut).toBe(0.0); // Unchanged
  });
});

describe('removeRegionsFromTrack', () => {
  it('should remove a single region from a single clip', () => {
    const clip = createClip('clip-1', 2.0, 8.0, 1.0, 9.0);
    const region = createRegion('r1', 5.0, 7.0);

    const result = removeRegionsFromTrack([clip], [region], 'audio');

    // Should have two clips (left and right of the removed region)
    expect(result.length).toBe(2);

    const [left, right] = result;
    expect(left.startTime).toBe(2.0);
    expect(left.duration).toBeCloseTo(3.0, 6);
    expect(right.startTime).toBeCloseTo(7.0, 6);
    expect(right.duration).toBeCloseTo(3.0, 6);
  });

  it('should process multiple non-overlapping regions in reverse order', () => {
    const clip = createClip('clip-1', 0.0, 10.0, 0.0, 10.0);
    const regions = [
      createRegion('r1', 2.0, 3.0),
      createRegion('r2', 6.0, 7.0),
    ].sort((a, b) => b.adjustedStartTime - a.adjustedStartTime); // Descending

    const result = removeRegionsFromTrack([clip], regions, 'audio');

    // Should have three clips (before r1, between r1 and r2, after r2)
    expect(result.length).toBe(3);
  });

  it('should remove clip entirely when region spans entire clip', () => {
    const clip = createClip('clip-1', 5.0, 3.0, 0.0, 3.0);
    const region = createRegion('r1', 4.0, 9.0); // Spans beyond clip

    const result = removeRegionsFromTrack([clip], [region], 'audio');

    // Clip should be completely removed
    expect(result.length).toBe(0);
  });

  it('should handle region starting before clip start', () => {
    const clip = createClip('clip-1', 5.0, 5.0, 0.0, 5.0);
    const region = createRegion('r1', 3.0, 7.0); // Starts before clip

    const result = removeRegionsFromTrack([clip], [region], 'audio');

    // Should only remove the overlapping portion (5.0-7.0)
    expect(result.length).toBe(1);
    expect(result[0].startTime).toBeCloseTo(7.0, 6);
    expect(result[0].duration).toBeCloseTo(3.0, 6);
  });

  it('should handle region ending after clip end', () => {
    const clip = createClip('clip-1', 5.0, 5.0, 0.0, 5.0);
    const region = createRegion('r1', 7.0, 12.0); // Ends after clip

    const result = removeRegionsFromTrack([clip], [region], 'audio');

    // Should only remove the overlapping portion (7.0-10.0)
    expect(result.length).toBe(1);
    expect(result[0].startTime).toBe(5.0);
    expect(result[0].duration).toBeCloseTo(2.0, 6);
  });

  it('should return unchanged clips when no regions provided', () => {
    const clip = createClip('clip-1', 2.0, 8.0, 1.0, 9.0);

    const result = removeRegionsFromTrack([clip], [], 'audio');

    expect(result.length).toBe(1);
    expect(result[0]).toEqual(clip);
  });
});

describe('rippleDeleteTrack', () => {
  it('should reposition clips sequentially with no gaps', () => {
    const clips = [
      createClip('c1', 0, 3, 0, 3),
      createClip('c2', 5, 4, 0, 4),
      createClip('c3', 12, 2, 0, 2),
    ];

    const result = rippleDeleteTrack(clips);

    expect(result.length).toBe(3);
    expect(result[0].startTime).toBe(0);
    expect(result[1].startTime).toBe(3); // 0 + 3
    expect(result[2].startTime).toBe(7); // 3 + 4
  });

  it('should preserve clip order', () => {
    const clips = [
      createClip('c1', 0, 2, 0, 2),
      createClip('c2', 10, 3, 0, 3),
      createClip('c3', 5, 1, 0, 1),
    ];

    const result = rippleDeleteTrack(clips);

    // Should sort by original startTime first
    expect(result[0].id).toBe('c1');
    expect(result[1].id).toBe('c3');
    expect(result[2].id).toBe('c2');
  });

  it('should work with empty clips array', () => {
    const result = rippleDeleteTrack([]);
    expect(result.length).toBe(0);
  });

  it('should leave clips unchanged when already sequential', () => {
    const clips = [
      createClip('c1', 0, 3, 0, 3),
      createClip('c2', 3, 4, 0, 4),
      createClip('c3', 7, 2, 0, 2),
    ];

    const result = rippleDeleteTrack(clips);

    expect(result[0].startTime).toBe(0);
    expect(result[1].startTime).toBe(3);
    expect(result[2].startTime).toBe(7);
  });
});

/**
 * Track-type handling and undo behavior for processExportToTimeline
 * are tested via integration tests:
 *
 * - Text/overlay clips use splitTextClipAtPosition (no trimIn/trimOut changes)
 * - Audio/video clips use splitClipAtPosition (updates trimIn/trimOut)
 * - Muted/locked tracks are excluded from "apply to all tracks"
 * - Deep cloning ensures original project is unmodified (undo support)
 * - modifiedAt timestamp is updated
 * - settings.duration is recalculated
 *
 * These scenarios require full project structure and are more efficiently
 * tested as integration tests rather than unit tests with extensive mocking.
 */
