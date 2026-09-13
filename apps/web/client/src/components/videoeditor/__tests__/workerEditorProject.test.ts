import { describe, expect, it } from 'vitest';
import { buildCanonicalWorkerProject, getAssetSourceUrl, normalizePersistedVideoEditorProject } from '../workerEditorProject';
import { createEmptyProject, addClipToTrack } from '../../../types/videoEditor';

describe('worker editor project mapping', () => {
  it('maps web tracks and preserves smart camera metadata without URLs', () => {
    const source = createEmptyProject('Worker handoff');
    const videoTrack = source.timeline.tracks.find((track) => track.type === 'video')!;
    const asset = {
      id: 'asset-1',
      type: 'video' as const,
      source: 'imported' as const,
      mediaAssetId: 42,
      path: '/api/storage/files/42',
      filename: 'clip.mp4',
      format: 'mp4',
      duration: 4,
    };
    source.assets[asset.id] = asset;
    const clip = addClipToTrack(videoTrack, asset, 1);
    clip.smartCamera = { mode: 'auto_face', autoZoom: true, autoPan: true, intensity: 70, safeMargin: 12 };

    const built = buildCanonicalWorkerProject(source, { refs: { [asset.id]: { namespace: 'media_asset', id: 42 } }, unresolved: [] }, 'video-project-1');
    expect(built.project.tracks.find((track) => track.kind === 'video')?.clips[0]).toMatchObject({ startMs: 1000, sourceOutMs: 4000 });
    expect(built.project.migration.preservedUnknown).toHaveProperty('smartCamera');
    expect(JSON.stringify(built.project)).not.toContain('api/storage');
  });

  it('marks unresolved advanced tracks while keeping the canonical shape valid', () => {
    const source = createEmptyProject();
    const overlay = source.timeline.tracks.find((track) => track.type === 'overlay')!;
    const asset = { id: 'asset-2', type: 'image' as const, source: 'imported' as const, path: '/api/storage/files/99', filename: 'image.png', format: 'png', duration: 2 };
    source.assets[asset.id] = asset;
    addClipToTrack(overlay, asset, 0);
    const built = buildCanonicalWorkerProject(source, { refs: { [asset.id]: { namespace: 'media_asset', id: 99 } }, unresolved: ['image.png'] }, 'project');
    expect(built.project.migration.unresolved).toEqual(['image.png']);
    expect(built.unsupported).toContain('track:track-v2');
  });

  it('rejects local filesystem paths at the browser boundary', () => {
    expect(getAssetSourceUrl({ id: 'a', type: 'video', source: 'imported', path: 'C:\\media\\clip.mp4', filename: 'clip.mp4', format: 'mp4', duration: 1 })).toBeNull();
    expect(getAssetSourceUrl({ id: 'b', type: 'video', source: 'imported', path: '/api/storage/files/8', filename: 'clip.mp4', format: 'mp4', duration: 1 })).toBe('/api/storage/files/8');
  });

  it('hydrates compact migration payloads into the full editor timeline', () => {
    const project = normalizePersistedVideoEditorProject({
      projectName: 'Migrated',
      assets: [{ id: 'asset-1', type: 'video', name: 'clip.mp4', uri: '/api/storage/files/1', duration: 3, mediaAssetId: 1 }],
      tracks: [{ id: 'video-1', kind: 'video', name: 'V1', clips: [{ id: 'clip-1', assetId: 'asset-1', startTime: 0, duration: 3 }] }],
      playhead: 0,
    });
    expect(project?.name).toBe('Migrated');
    expect(project?.timeline.tracks[0].type).toBe('video');
    expect(project?.assets['asset-1'].mediaAssetId).toBe(1);
  });

  it('compiles audio solo and track gain into effective clip volume', () => {
    const source = createEmptyProject();
    const audioTracks = source.timeline.tracks.filter((track) => track.type === 'audio');
    const primary = audioTracks[0]!;
    const secondary = { ...primary, id: 'track-a2', name: 'A2', clips: [], solo: false, volume: 1 };
    source.timeline.tracks.push(secondary);
    primary.solo = true;
    primary.volume = 0.5;
    const audio = { id: 'audio-1', type: 'audio' as const, source: 'imported' as const, mediaAssetId: 41, path: '/api/storage/files/41', filename: 'voice.mp3', format: 'mp3', duration: 2 };
    const music = { id: 'audio-2', type: 'audio' as const, source: 'imported' as const, mediaAssetId: 42, path: '/api/storage/files/42', filename: 'music.mp3', format: 'mp3', duration: 2 };
    source.assets[audio.id] = audio;
    source.assets[music.id] = music;
    addClipToTrack(primary, audio, 0).volume = 0.8;
    addClipToTrack(secondary, music, 0).volume = 0.7;
    const built = buildCanonicalWorkerProject(source, {
      refs: { 'audio-1': { namespace: 'media_asset', id: 41 }, 'audio-2': { namespace: 'media_asset', id: 42 } },
      unresolved: [],
    }, 'project');
    const clips = built.project.tracks.filter((track) => track.kind === 'audio').flatMap((track) => track.clips);
    expect(clips.find((clip) => clip.asset.id === 41)).toMatchObject({ volume: 0.4, muted: false });
    expect(clips.find((clip) => clip.asset.id === 42)).toMatchObject({ volume: 0, muted: true });
  });
});
