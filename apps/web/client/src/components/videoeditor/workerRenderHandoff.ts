import {
  SILENCE_CUT_MAP_VERSION,
  validateCameraMotionPlan,
  type CameraMotionPlan,
  type SilenceCutMap,
} from '@smartspec/shared';
import type { VideoEditorProject } from '../../types/videoEditor';

export const WORKER_RENDER_HANDOFF_VERSION = 'web-editor-render-handoff.v1' as const;

export type WorkerRenderOptions = {
  handoffVersion: typeof WORKER_RENDER_HANDOFF_VERSION;
  cameraMotionPlans: Record<string, CameraMotionPlan>;
  silenceCutMap?: SilenceCutMap;
};

function isValidSilenceCutMap(value: unknown): value is SilenceCutMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const map = value as Partial<SilenceCutMap>;
  return map.version === SILENCE_CUT_MAP_VERSION
    && Number.isSafeInteger(map.sourceDurationMs)
    && map.sourceDurationMs >= 0
    && Number.isSafeInteger(map.editedDurationMs)
    && map.editedDurationMs >= 0
    && Array.isArray(map.ranges)
    && typeof map.sourceFingerprint === 'string'
    && typeof map.revisionId === 'string'
    && (map.audioStreamIndex === null || Number.isSafeInteger(map.audioStreamIndex))
    && typeof map.detectionFingerprint === 'string'
    && typeof map.fingerprint === 'string';
}

/**
 * Builds the exact render options shared by the queue helper and final submit.
 * The function is intentionally pure so payload parity can be tested without
 * mounting the editor component.
 */
export function buildWorkerRenderOptions(project: VideoEditorProject): WorkerRenderOptions {
  const cameraMotionPlans: Record<string, CameraMotionPlan> = {};
  for (const track of project.timeline.tracks) {
    for (const clip of track.clips) {
      const settings = clip.smartCamera;
      if (!settings?.plan) continue;
      if (settings.analysisStatus === 'stale') {
        throw new Error(`CAMERA_PLAN_STALE_REANALYSIS_REQUIRED:${clip.id}`);
      }
      const errors = validateCameraMotionPlan(settings.plan);
      if (errors.length > 0) {
        throw new Error(`CAMERA_PLAN_INVALID:${clip.id}:${errors.join(',')}`);
      }
      cameraMotionPlans[clip.id] = settings.plan;
    }
  }

  const silenceCutMap = project.metadata?.silenceCutMap;
  if (silenceCutMap !== undefined && !isValidSilenceCutMap(silenceCutMap)) {
    throw new Error('SILENCE_CUT_MAP_INVALID');
  }

  return {
    handoffVersion: WORKER_RENDER_HANDOFF_VERSION,
    cameraMotionPlans,
    ...(silenceCutMap ? { silenceCutMap } : {}),
  };
}
