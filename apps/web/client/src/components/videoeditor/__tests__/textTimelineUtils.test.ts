import { describe, expect, it } from 'vitest';
import { createEmptyProject, type Clip } from '../../../types/videoEditor';
import {
  addTextClipToProject,
  canMoveClipToTrack,
  ensureTextTrack,
  shouldAllowOverlap,
} from '../textTimelineUtils';

describe('textTimelineUtils', () => {
  it('creates T1 when missing before adding text clip', () => {
    const project = createEmptyProject('No T1');
    project.timeline.tracks = project.timeline.tracks.filter((track) => track.type !== 'text');

    const clip = addTextClipToProject(
      project,
      {
        text: 'Hello',
        fontFamily: 'Noto Sans',
        fontSize: 48,
        fontWeight: 700,
        fontStyle: 'normal',
        color: '#ffffff',
        backgroundColor: 'transparent',
        textAlign: 'center',
        effect: 'none',
      },
      5,
      2,
    );

    const textTrack = project.timeline.tracks.find((track) => track.type === 'text');
    expect(textTrack).toBeDefined();
    expect(textTrack!.name).toBe('T1');
    expect(textTrack!.clips).toHaveLength(1);
    expect(clip.trackId).toBe(textTrack!.id);
    expect(clip.startTime).toBe(2);
  });

  it('rejects unsupported strict-parity text effects', () => {
    const project = createEmptyProject('Strict');

    expect(() =>
      addTextClipToProject(
        project,
        {
          text: 'Hello',
          fontFamily: 'Noto Sans',
          fontSize: 48,
          fontWeight: 700,
          fontStyle: 'normal',
          color: '#ffffff',
          backgroundColor: 'transparent',
          textAlign: 'center',
          effect: 'typewriter',
        },
        5,
        0,
      ),
    ).toThrow('Unsupported text effect');
  });

  it('enforces clip move guards for text/video/audio semantics', () => {
    const baseClip: Clip = {
      id: 'c1',
      assetId: 'a1',
      trackId: 'track-v1',
      startTime: 0,
      duration: 3,
      trimIn: 0,
      trimOut: 3,
      volume: 1,
      speed: 1,
      effects: [],
    };

    const textClip: Clip = {
      ...baseClip,
      textConfig: {
        text: 'Hello',
        fontFamily: 'Noto Sans',
        fontSize: 48,
        fontWeight: 700,
        fontStyle: 'normal',
        color: '#ffffff',
        backgroundColor: 'transparent',
        textAlign: 'center',
        effect: 'none',
      },
    };

    expect(canMoveClipToTrack(textClip, 'text', 'text')).toBe(true);
    expect(canMoveClipToTrack(textClip, 'text', 'video')).toBe(false);
    expect(canMoveClipToTrack(baseClip, 'video', 'audio')).toBe(false);
    expect(canMoveClipToTrack(baseClip, 'audio', 'overlay')).toBe(false);
    expect(canMoveClipToTrack(baseClip, 'video', 'overlay')).toBe(true);
  });

  it('allows overlap for text clips/tracks only', () => {
    const baseClip: Clip = {
      id: 'c1',
      assetId: 'a1',
      trackId: 'track-v1',
      startTime: 0,
      duration: 3,
      trimIn: 0,
      trimOut: 3,
      volume: 1,
      speed: 1,
      effects: [],
    };

    const textClip: Clip = {
      ...baseClip,
      textConfig: {
        text: 'Hello',
        fontFamily: 'Noto Sans',
        fontSize: 48,
        fontWeight: 700,
        fontStyle: 'normal',
        color: '#ffffff',
        backgroundColor: 'transparent',
        textAlign: 'center',
        effect: 'none',
      },
    };

    expect(shouldAllowOverlap('text', baseClip)).toBe(true);
    expect(shouldAllowOverlap('video', textClip)).toBe(true);
    expect(shouldAllowOverlap('video', baseClip)).toBe(false);
  });

  it('ensures text track without duplicating when already present', () => {
    const project = createEmptyProject('Has T1');
    const first = ensureTextTrack(project);
    const second = ensureTextTrack(project);
    expect(first.id).toBe(second.id);
    expect(project.timeline.tracks.filter((track) => track.type === 'text')).toHaveLength(1);
  });
});
