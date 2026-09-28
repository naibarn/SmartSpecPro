import { describe, expect, it } from 'vitest';
import { buildSilenceCutMap } from '@smartspec/shared';
import { createEmptyProject, addClipToTrack } from '../../../types/videoEditor';
import { buildWorkerRenderOptions } from '../workerRenderHandoff';

function makeProject() {
  const project = createEmptyProject('render handoff');
  const track = project.timeline.tracks.find((candidate) => candidate.type === 'video')!;
  const asset = {
    id: 'asset-1',
    type: 'video' as const,
    source: 'imported' as const,
    path: '/api/storage/files/1',
    filename: 'clip.mp4',
    format: 'mp4',
    duration: 4,
  };
  project.assets[asset.id] = asset;
  const clip = addClipToTrack(track, asset, 0);
  clip.smartCamera = {
    mode: 'face_activity',
    autoZoom: true,
    autoPan: true,
    intensity: 70,
    safeMargin: 10,
    analysisStatus: 'browser_ready',
    plan: {
      version: 'camera.motion.v2',
      mode: 'face_activity',
      durationMs: 4000,
      keyframes: [
        { timeMs: 0, x: 0.5, y: 0.5, scale: 1.1, source: 'auto' },
        { timeMs: 4000, x: 0.6, y: 0.5, scale: 1.2, source: 'auto' },
      ],
      evidence: {
        analysisMode: 'quick',
        status: 'approved',
        activityEvidence: [],
      },
    },
  };
  project.metadata = {
    silenceCutMap: buildSilenceCutMap({
      sourceDurationMs: 4000,
      ranges: [{ startMs: 1000, endMs: 1500 }],
      sourceFingerprint: 'asset-1:4',
      revisionId: 'revision-1',
      audioStreamIndex: 0,
      detectionFingerprint: 'browser-audio-v1',
    }),
  };
  return project;
}

function getVideoClip(project: ReturnType<typeof makeProject>) {
  return project.timeline.tracks.find((track) => track.type === 'video')!.clips[0]!;
}

describe('worker render handoff', () => {
  it('carries approved camera plans and the silence cut map as one canonical option set', () => {
    const project = makeProject();
    const result = buildWorkerRenderOptions(project);

    expect(result.handoffVersion).toBe('web-editor-render-handoff.v1');
    expect(result.cameraMotionPlans[getVideoClip(project).id]).toEqual(getVideoClip(project).smartCamera?.plan);
    expect(result.silenceCutMap).toEqual(project.metadata?.silenceCutMap);
  });

  it('rejects stale camera plans before a render envelope is built', () => {
    const project = makeProject();
    getVideoClip(project).smartCamera!.analysisStatus = 'stale';

    expect(() => buildWorkerRenderOptions(project)).toThrow(`CAMERA_PLAN_STALE_REANALYSIS_REQUIRED:${getVideoClip(project).id}`);
  });
});
