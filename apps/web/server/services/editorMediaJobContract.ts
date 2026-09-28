import {
  validateMediaJobEnvelope,
  type MediaJobEnvelope,
  type MediaOperation,
} from "@smartspec/shared";

export type EditorMediaJobInput = Omit<MediaJobEnvelope, "jobId" | "tenantId"> & {
  jobId?: string;
  tenantId: string;
  idempotencyKey: string;
  expectedRevisionId?: string;
};

export type WorkerJobInsertProjection = {
  jobType: string;
  inputJson: MediaJobEnvelope;
  capabilityRequirementsJson: Record<string, unknown>;
  instructionsJson: Record<string, unknown>;
  idempotencyKey: string;
};

export type EditorRuntimeRouting = {
  runtimeType: "node_job_worker" | "desktop_zeroclaw_managed";
  available: boolean;
};

export function resolveEditorRuntimeRouting(
  jobType: string,
  nodeExecutorEnabled: boolean,
): EditorRuntimeRouting {
  if (jobType === "video.composition_scan") {
    return { runtimeType: "node_job_worker", available: nodeExecutorEnabled };
  }
  return { runtimeType: "desktop_zeroclaw_managed", available: true };
}

const JOB_TYPE_BY_OPERATION: Record<MediaOperation, string> = {
  "media.probe": "editor_media_probe",
  "media.proxy": "editor_media_proxy",
  "media.waveform": "editor_media_waveform",
  "media.thumbnail": "editor_media_thumbnail",
  "media.analysis": "editor_media_analysis",
  "media.silence_detect": "editor_media_analysis",
  "media.reframe": "editor_media_analysis",
  "media.composition_scan": "video.composition_scan",
  "media.speaker_scan": "editor_media_analysis",
  "media.transcribe": "editor_media_analysis",
  "media.align": "editor_media_analysis",
  "media.audio_mix": "editor_media_analysis",
  "media.audio_extract": "editor_media_audio_extract",
  "media.audio_export": "editor_media_audio_export",
  "media.ai_music": "editor_media_ai_music",
  "media.ai_media_studio": "editor_media_ai_media_studio",
  "media.privacy_track": "editor_media_privacy_track",
  "media.recording_normalize": "editor_media_recording_normalize",
  "video.render_still": "editor_video_render_still",
  "video.render": "editor_video_render",
};

export function buildEditorWorkerJobProjection(input: EditorMediaJobInput): WorkerJobInsertProjection {
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(input.idempotencyKey)) throw new Error("IDEMPOTENCY_KEY_INVALID");
  const { idempotencyKey: _idempotencyKey, expectedRevisionId: _expectedRevisionId, ...rawEnvelope } = input;
  const envelope = validateMediaJobEnvelope(rawEnvelope);
  if (envelope.tenantId !== input.tenantId) throw new Error("TENANT_MISMATCH");
  if (input.expectedRevisionId && input.revisionId !== input.expectedRevisionId) throw new Error("REVISION_CONFLICT");
  return {
    jobType: JOB_TYPE_BY_OPERATION[envelope.operation],
    inputJson: envelope,
    capabilityRequirementsJson: envelope.requirements,
    instructionsJson: { protocol: envelope.protocol, version: envelope.version, planHash: envelope.plan.planHash },
    idempotencyKey: input.idempotencyKey,
  };
}
