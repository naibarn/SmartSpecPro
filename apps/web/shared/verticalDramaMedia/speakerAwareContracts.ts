import { z } from "zod";
import { canonicalJsonStringify, sha256Hex } from "../verticalDramaSeries/artifacts";

export const SPEAKER_AWARE_CONTRACT_VERSION = "feature-179-v1" as const;

const id = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);
const isoDate = z.string().datetime({ offset: true });
const boundedText = z.string().trim().max(4000);
const normalized = z.number().finite().min(0).max(1);
const timeMs = z.number().int().finite().nonnegative().max(86_400_000);

export const speakerAwareStageKindValues = [
  "subtitle_editorial_cut",
  "vad_scan",
  "diarization_scan",
  "visual_track_scan",
  "active_speaker_fusion",
  "condensation_plan",
  "speaker_reframe",
  "manual_review",
  "compose_edit_map",
  "ffmpeg_render",
  "remotion_render",
] as const;
export const speakerAwareStageKindSchema = z.enum(speakerAwareStageKindValues);
export type SpeakerAwareStageKind = z.infer<typeof speakerAwareStageKindSchema>;

export const speakerAwareAdapterStatusValues = [
  "ready",
  "missing_model",
  "missing_runtime",
  "gpu_unavailable",
  "incompatible",
  "disabled",
  "error",
] as const;
export const speakerAwareAdapterStatusSchema = z.enum(speakerAwareAdapterStatusValues);

export const speakerAwareAdapterIdValues = [
  "SileroOnnx",
  "FireRedOnnx",
  "TenVad",
  "WebRtcVad",
  "PyannoteDiarization",
  "MediaPipeFace",
  "PersonBody",
  "ActiveSpeakerFusion",
] as const;
export const speakerAwareAdapterIdSchema = z.enum(speakerAwareAdapterIdValues);

export const speakerAwareArtifactRefSchema = z.object({
  artifactId: id,
  revision: id,
  checksum,
  kind: id,
}).strict();
export type SpeakerAwareArtifactRef = z.infer<typeof speakerAwareArtifactRefSchema>;

export const adapterCapabilitySchema = z.object({
  adapterId: speakerAwareAdapterIdSchema,
  version: id,
  status: speakerAwareAdapterStatusSchema,
  runtime: id.nullable(),
  device: z.enum(["cpu", "cuda", "directml", "metal", "unknown"]),
  modelChecksum: checksum.nullable(),
  supportedSampleRates: z.array(z.number().int().positive().max(192000)).max(8),
  supportedInputKinds: z.array(z.enum(["audio", "video", "image", "jsonl"])).max(8),
  remediationKey: id.nullable(),
  checkedAt: isoDate,
}).strict();
export type AdapterCapability = z.infer<typeof adapterCapabilitySchema>;

const adapterStagePolicySchema = z.object({
  enabledAdapters: z.array(speakerAwareAdapterIdSchema).max(8),
  primary: speakerAwareAdapterIdSchema,
  fallbackPolicy: z.enum(["deny", "allow_listed", "report_unknown"]),
  fallbackAllowList: z.array(speakerAwareAdapterIdSchema).max(8).default([]),
  required: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.required && !value.enabledAdapters.includes(value.primary)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["primary"], message: "primary adapter must be enabled" });
  }
  if (value.fallbackPolicy === "allow_listed" && value.fallbackAllowList.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fallbackAllowList"], message: "allow_listed requires an allow-list" });
  }
  if (value.fallbackAllowList.some((adapter) => !value.enabledAdapters.includes(adapter))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["fallbackAllowList"], message: "fallback must be enabled" });
  }
});

export const adapterPolicySchema = z.object({
  contractVersion: z.literal(SPEAKER_AWARE_CONTRACT_VERSION),
  vad: adapterStagePolicySchema,
  diarization: adapterStagePolicySchema,
  face: adapterStagePolicySchema,
  person: adapterStagePolicySchema,
  activeSpeaker: adapterStagePolicySchema,
  maxScanWindowMs: z.number().int().min(250).max(60_000),
  maxConcurrentProcesses: z.number().int().min(1).max(8),
}).strict();
export type AdapterPolicy = z.infer<typeof adapterPolicySchema>;

export const subtitleCueSchema = z.object({
  cueId: id,
  startMs: timeMs,
  endMs: timeMs,
  text: boundedText,
  speakerId: id.nullable(),
  confidence: z.number().finite().min(0).max(1).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.endMs <= value.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "cue end must be after start" });
});
export type SubtitleCue = z.infer<typeof subtitleCueSchema>;

export const subtitleEvidenceSchema = z.object({
  evidenceId: id,
  sourceKind: z.enum(["authored_subtitle", "observed_asr"]),
  format: z.enum(["srt", "vtt", "ass", "embedded", "json"]),
  language: z.string().trim().min(2).max(16),
  cues: z.array(subtitleCueSchema).max(100_000),
  confidence: z.number().finite().min(0).max(1).nullable(),
  checksum,
  revision: id,
}).strict();
export type SubtitleEvidence = z.infer<typeof subtitleEvidenceSchema>;

const evidenceAdapterSchema = z.object({
  adapterId: speakerAwareAdapterIdSchema,
  adapterVersion: id,
  modelChecksum: checksum.nullable(),
}).strict();

export const vadSegmentSchema = z.object({
  startMs: timeMs,
  endMs: timeMs,
  speechConfidence: z.number().finite().min(0).max(1),
  isSpeech: z.boolean(),
  threshold: z.number().finite().min(0).max(1),
  sampleRate: z.number().int().positive().max(192000),
  evidence: evidenceAdapterSchema,
}).strict().superRefine((value, ctx) => {
  if (value.endMs <= value.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "VAD end must be after start" });
});
export type VadSegment = z.infer<typeof vadSegmentSchema>;

export const diarizationSegmentSchema = z.object({
  speakerId: id,
  startMs: timeMs,
  endMs: timeMs,
  confidence: z.number().finite().min(0).max(1),
  evidence: evidenceAdapterSchema,
}).strict().superRefine((value, ctx) => {
  if (value.endMs <= value.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "diarization end must be after start" });
});
export type DiarizationSegment = z.infer<typeof diarizationSegmentSchema>;

export const visualTrackSchema = z.object({
  trackId: id,
  kind: z.enum(["face", "person", "body_only", "manual"]),
  startMs: timeMs,
  endMs: timeMs,
  boxes: z.array(z.object({ timeMs, x: normalized, y: normalized, width: normalized, height: normalized, confidence: z.number().finite().min(0).max(1) }).strict()).max(100_000),
  posture: z.enum(["seated", "standing", "unknown"]),
  detector: evidenceAdapterSchema,
}).strict().superRefine((value, ctx) => {
  if (value.endMs <= value.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "track end must be after start" });
  if (value.kind === "body_only" && value.detector.adapterId === "MediaPipeFace") ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["detector"], message: "body-only track cannot claim face detector" });
});
export type VisualTrack = z.infer<typeof visualTrackSchema>;

export const activeSpeakerEvidenceSchema = z.object({
  startMs: timeMs,
  endMs: timeMs,
  speakerId: id.nullable(),
  activeFaceTrackId: id.nullable(),
  activePersonTrackId: id.nullable(),
  speechConfidence: z.number().finite().min(0).max(1),
  visualConfidence: z.number().finite().min(0).max(1),
  fusedConfidence: z.number().finite().min(0).max(1),
  basis: z.array(z.enum(["vad", "diarization", "face", "person", "subtitle", "continuity", "manual"])).min(1).max(8),
  conflict: z.enum(["none", "multiple_candidates", "audio_visual_mismatch", "missing_visual", "missing_audio"]),
}).strict();
export type ActiveSpeakerEvidence = z.infer<typeof activeSpeakerEvidenceSchema>;

export const cameraActionSchema = z.object({
  startMs: timeMs,
  endMs: timeMs,
  action: z.enum(["hold", "slow_move", "cut_to_track", "cut_to_wide", "manual_lock", "no_change"]),
  targetTrackId: id.nullable(),
  fromX: normalized,
  fromY: normalized,
  toX: normalized,
  toY: normalized,
  reason: z.enum(["stable_target", "target_edge", "speaker_switch", "target_lost", "manual", "no_evidence"]),
}).strict().superRefine((value, ctx) => {
  if (value.endMs <= value.startMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "camera action end must be after start" });
});
export type CameraAction = z.infer<typeof cameraActionSchema>;

export const editMapRangeSchema = z.object({
  rangeId: id,
  sourceStartMs: timeMs,
  sourceEndMs: timeMs,
  outputStartMs: timeMs,
  outputEndMs: timeMs,
  decision: z.enum(["keep", "remove"]),
  reasons: z.array(z.enum(["dead_air", "manual_cut", "condensation", "speaker_jump", "user_keep", "source"])).min(1).max(6),
}).strict().superRefine((value, ctx) => {
  if (value.sourceEndMs <= value.sourceStartMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceEndMs"], message: "source range must be positive" });
  if (value.outputEndMs < value.outputStartMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["outputEndMs"], message: "output range cannot be negative" });
});
export type EditMapRange = z.infer<typeof editMapRangeSchema>;

export const composedEditMapSchema = z.object({
  contractVersion: z.literal(SPEAKER_AWARE_CONTRACT_VERSION),
  mapId: id,
  mapRevision: id,
  sourceArtifact: speakerAwareArtifactRefSchema,
  parentArtifactHashes: z.array(checksum).max(32),
  ranges: z.array(editMapRangeSchema).min(1).max(100_000),
  cameraActions: z.array(cameraActionSchema).max(100_000),
  activeSpeakers: z.array(activeSpeakerEvidenceSchema).max(100_000),
  manualRevision: id,
  workflowRevision: id,
  approvalState: z.enum(["draft", "review_required", "approved", "stale", "rejected"]),
  createdAt: isoDate,
}).strict();
export type ComposedEditMap = z.infer<typeof composedEditMapSchema>;

export const speakerAwareScanArtifactSchema = z.object({
  contractVersion: z.literal(SPEAKER_AWARE_CONTRACT_VERSION),
  sourceArtifact: speakerAwareArtifactRefSchema,
  sourceChecksum: checksum,
  durationMs: timeMs,
  adapterCapabilities: z.array(adapterCapabilitySchema).max(16),
  subtitleEvidence: subtitleEvidenceSchema.nullable(),
  vadSegments: z.array(vadSegmentSchema).max(100_000),
  diarizationSegments: z.array(diarizationSegmentSchema).max(100_000),
  visualTracks: z.array(visualTrackSchema).max(100_000),
  activeSpeakers: z.array(activeSpeakerEvidenceSchema).max(100_000),
  warnings: z.array(boundedText).max(64),
  scanRevision: id,
  createdAt: isoDate,
}).strict();
export type SpeakerAwareScanArtifact = z.infer<typeof speakerAwareScanArtifactSchema>;

export const speakerAwareEditPlanArtifactSchema = z.object({
  contractVersion: z.literal(SPEAKER_AWARE_CONTRACT_VERSION),
  sourceArtifact: speakerAwareArtifactRefSchema,
  scanArtifact: speakerAwareArtifactRefSchema.nullable(),
  sourceChecksum: checksum,
  composedEditMap: composedEditMapSchema,
  condensationProposals: z.array(z.object({
    proposalId: id,
    startMs: timeMs,
    endMs: timeMs,
    text: boundedText,
    decision: z.enum(["keep", "remove", "shorten"]),
    reason: boundedText,
  }).strict()).max(100_000),
  approvalRequired: z.boolean(),
  createdAt: isoDate,
}).strict();
export type SpeakerAwareEditPlanArtifact = z.infer<typeof speakerAwareEditPlanArtifactSchema>;

export const editStageSchema = z.object({
  stageId: id,
  kind: speakerAwareStageKindSchema,
  enabled: z.boolean(),
  order: z.number().int().nonnegative().max(31),
  inputArtifact: speakerAwareArtifactRefSchema.nullable(),
  outputArtifactKind: id,
  requires: z.array(speakerAwareStageKindSchema).max(8),
}).strict();
export type EditStage = z.infer<typeof editStageSchema>;

export const workflowRecipeSchema = z.object({
  contractVersion: z.literal(SPEAKER_AWARE_CONTRACT_VERSION),
  workflowId: id,
  label: boundedText,
  stages: z.array(editStageSchema).min(1).max(32),
  lockedStages: z.array(id).max(32).default([]),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  const orders = new Set<number>();
  for (const stage of value.stages) {
    if (ids.has(stage.stageId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "duplicate stage id" });
    ids.add(stage.stageId);
    if (orders.has(stage.order)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["stages"], message: "duplicate stage order" });
    orders.add(stage.order);
  }
  if (value.lockedStages.some((stageId) => !ids.has(stageId))) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lockedStages"], message: "locked stage must exist" });
});
export type WorkflowRecipe = z.infer<typeof workflowRecipeSchema>;

export const speakerAwareJobPayloadSchema = z.object({
  kind: z.enum(["speaker_aware_media_scan", "speaker_aware_edit_plan"]),
  seriesId: id.nullable(),
  inputArtifact: speakerAwareArtifactRefSchema,
  analysisArtifacts: z.array(speakerAwareArtifactRefSchema).max(8).default([]),
  localSourceRelativeName: z.string().trim().min(1).max(512).nullable().default(null),
  workflowMode: z.enum(["subtitle_first", "speaker_first", "full_assisted", "custom"]),
  requestedStages: z.array(speakerAwareStageKindSchema).min(1).max(16),
  parentEditMapHash: checksum.nullable(),
  adapterPolicy: adapterPolicySchema,
  adapterPolicyHash: checksum,
  outputStage: speakerAwareStageKindSchema,
  idempotencyKey: id.max(128),
  approvalRequired: z.boolean(),
}).strict();
export type SpeakerAwareJobPayload = z.infer<typeof speakerAwareJobPayloadSchema>;

export function hashSpeakerAwarePayload(value: unknown): string {
  return sha256Hex(canonicalJsonStringify(value));
}

export function hashAdapterPolicy(policy: AdapterPolicy): string {
  return hashSpeakerAwarePayload(policy);
}
