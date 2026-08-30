import { z } from "zod";
import { remotionRenderVideoWorkerInputSchema } from "../workerRuntime";

export const VERTICAL_DRAMA_MEDIA_CONTRACT_VERSION = "2026-08-25.1";
const id = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const label = z.string().trim().min(1).max(240);
const storageKey = z.string().trim().min(1).max(512).refine(
  (value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes("..") && !/[\u0000-\u001f]/.test(value),
  "storage keys must be relative and traversal-free"
);
const boundedText = z.string().trim().max(4000);
const safeObject = z.record(z.string(), z.unknown());

function rejectUnsafeText(value: unknown, context: z.RefinementCtx): void {
  if (typeof value !== "string") return;
  if (/https?:\/\//i.test(value) || /(?:^|[\\/])(?:home|users|tmp|var|mnt)(?:[\\/]|$)/i.test(value) || /-----BEGIN|bearer\s+|api[_-]?key|access[_-]?token/i.test(value)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "paths, URLs, and credentials are not accepted" });
  }
}

const safeDescription = boundedText.superRefine(rejectUnsafeText);
const revision = id;
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);

export const mediaAspectRatioValues = ["source", "9:16"] as const;
export const mediaProcessingModeValues = ["manual_intent", "automated_ai_editing"] as const;
export const mediaAssetKindValues = ["video", "image", "audio"] as const;
export const mediaPipelineStateValues = ["discovered", "admitted", "processing", "qc_failed", "ready", "published", "stale", "revoked"] as const;
export const mediaJobKindValues = [
  "media_ingest",
  "broll_preprocess",
  "shot_video_generation",
  "footage_probe_analyze",
  "footage_prepare",
  "footage_broll_render",
] as const;
// Keep the media contract aligned with the Worker job ledger. `completed` is
// emitted before/alongside publication by some control-plane versions, while
// `expired` is a terminal reconciliation state; both must be representable so
// clients do not poll forever or mistake an expired job for an active one.
export const mediaJobStatusValues = ["queued", "claimed", "running", "uploading", "verifying", "completed", "published", "failed", "canceled", "expired", "quarantined"] as const;
export const mediaErrorCodeValues = ["invalid_contract", "root_not_bound", "root_revision_stale", "source_not_stable", "unsupported_media", "dead_air_detection_failed", "focus_track_failed", "duration_budget_exceeded", "qc_failed", "workflow_capability_blocked", "artifact_checksum_mismatch", "artifact_ownership_failed", "publication_rejected", "index_enqueue_failed", "source_reference_expired", "source_fingerprint_mismatch", "transcription_unavailable", "transcription_failed", "unsupported_composition_executor", "placement_out_of_bounds", "placement_source_not_ready", "approval_required", "render_contract_mismatch"] as const;

export const mediaAspectRatioSchema = z.enum(mediaAspectRatioValues);
export const mediaProcessingModeSchema = z.enum(mediaProcessingModeValues);
export const mediaAssetKindSchema = z.enum(mediaAssetKindValues);
export const mediaPipelineStateSchema = z.enum(mediaPipelineStateValues);
export const mediaJobKindSchema = z.enum(mediaJobKindValues);
export const mediaJobStatusSchema = z.enum(mediaJobStatusValues);
export const mediaErrorCodeSchema = z.enum(mediaErrorCodeValues);

export const seriesMediaRootBindingSchema = z.object({
  seriesId: id,
  rootId: id,
  rootFingerprint: id,
  bindingRevision: z.number().int().positive(),
  workspaceMode: z.enum(["local_only", "managed_local"]),
  status: z.enum(["pending", "active", "stale", "revoking", "revoked"]),
}).strict();
export type SeriesMediaRootBinding = z.infer<typeof seriesMediaRootBindingSchema>;

export const mediaSourceManifestSchema = z.object({
  assetId: id,
  kind: mediaAssetKindSchema,
  sourceRevision: revision,
  sourceFingerprint: checksum,
  fileName: label.regex(/^[^\\/]+$/),
  relativeName: z.string().trim().min(1).max(512).refine((value) => !value.startsWith("/") && !value.includes("\\") && !value.split("/").includes(".."), "relativeName must stay inside the bound root").optional(),
  sizeBytes: z.number().int().nonnegative().max(50_000_000_000),
  durationMs: z.number().int().nonnegative().max(86_400_000).nullable(),
  captureAt: z.string().datetime({ offset: true }).nullable(),
}).strict();
export type MediaSourceManifest = z.infer<typeof mediaSourceManifestSchema>;

export const mediaProbeSchema = z.object({
  width: z.number().int().positive().max(16384).nullable(),
  height: z.number().int().positive().max(16384).nullable(),
  fps: z.number().positive().max(240).nullable(),
  durationMs: z.number().int().nonnegative().max(86_400_000).nullable(),
  hasAudio: z.boolean(),
  rotationDegrees: z.number().int().min(-360).max(360),
  codec: id.nullable(),
  container: id.nullable(),
}).strict();

export const deadAirPolicySchema = z.object({
  enabled: z.boolean(),
  thresholdDb: z.number().min(-80).max(0),
  minSilenceMs: z.number().int().min(100).max(30_000),
  padMs: z.number().int().min(0).max(2000),
}).strict();
export const focusTargetSchema = z.object({
  targetId: id,
  label,
  kind: z.enum(["person", "object", "face", "manual_region"]),
  confidence: z.number().min(0).max(1),
  normalizedX: z.number().min(0).max(1),
  normalizedY: z.number().min(0).max(1),
}).strict();
export const focusTrackPointSchema = z.object({
  timeMs: z.number().int().nonnegative().max(86_400_000),
  normalizedX: z.number().min(0).max(1),
  normalizedY: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  method: z.string().trim().min(1).max(120),
}).strict();
export const reframePolicySchema = z.object({
  enabled: z.boolean(),
  target: focusTargetSchema.nullable(),
  trackingMode: z.enum(["auto_subject", "auto_person", "auto_object", "face_priority", "manual_region", "manual_keyframes"]),
  aspectRatio: z.literal("9:16"),
  maxCropFraction: z.number().min(0).max(1),
  fallback: z.enum(["letterbox", "blurred_background", "reject"]),
  focusTrack: z.array(focusTrackPointSchema).max(256).default([]),
}).strict();
export const stillMotionPolicySchema = z.object({
  enabled: z.boolean(),
  motion: z.enum(["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down", "ken_burns_auto"]),
  startScale: z.number().min(1).max(2),
  endScale: z.number().min(1).max(2),
  durationMs: z.number().int().min(500).max(90_000),
}).strict();
export const shotBudgetPolicySchema = z.object({
  maxDurationMs: z.number().int().min(1000).max(90_000),
  minDurationMs: z.number().int().min(250).max(30_000),
  maxBrollMs: z.number().int().min(0).max(90_000),
  preserveNarrativeAudio: z.boolean(),
}).strict();

export const mediaEditSegmentSchema = z.object({
  segmentId: id,
  sourceAssetId: id,
  sourceRevision: revision,
  startMs: z.number().int().nonnegative().max(86_400_000),
  endMs: z.number().int().positive().max(86_400_000),
  removeDeadAir: z.boolean(),
  reframe: reframePolicySchema,
  stillMotion: stillMotionPolicySchema.nullable(),
}).strict().superRefine((value, context) => {
  if (value.endMs <= value.startMs) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "segment end must be after start" });
});

export const mediaEditPlanSchema = z.object({
  planId: id,
  planRevision: revision,
  mode: mediaProcessingModeSchema,
  aspectRatio: mediaAspectRatioSchema,
  deadAir: deadAirPolicySchema,
  budget: shotBudgetPolicySchema,
  segments: z.array(mediaEditSegmentSchema).min(1).max(64),
  rationale: safeDescription,
}).strict();

export const mediaQcReportSchema = z.object({
  qcVersion: revision,
  passed: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  hasAudio: z.boolean(),
  checksum: checksum,
  checks: z.array(z.object({ code: id, passed: z.boolean(), messageKey: id }).strict()).max(32),
  failureCode: mediaErrorCodeSchema.nullable(),
}).strict();

export const mediaIntelligenceMetadataSchema = z.object({
  transcript: boundedText.optional(),
  tags: z.array(z.string().trim().min(1).max(120)).max(64).default([]),
  subjects: z.array(z.string().trim().min(1).max(160)).max(32).default([]),
  scenes: z.array(z.object({
    startMs: z.number().int().nonnegative().max(86_400_000),
    endMs: z.number().int().positive().max(86_400_000).nullable(),
    label: z.string().trim().min(1).max(160),
    confidence: z.number().min(0).max(1),
  }).strict()).max(256).default([]),
  silenceSegments: z.array(z.object({
    startMs: z.number().int().nonnegative().max(86_400_000),
    endMs: z.number().int().positive().max(86_400_000).nullable(),
  }).strict()).max(256).default([]),
  focusTrack: z.array(z.object({
    timeMs: z.number().int().nonnegative().max(86_400_000),
    normalizedX: z.number().min(0).max(1),
    normalizedY: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1),
    method: z.string().trim().min(1).max(120),
  }).strict()).max(256).default([]),
  transform: z.object({
    aspectRatio: z.enum(["source", "9:16"]),
    trackingMode: z.enum(["auto_subject", "auto_person", "auto_object", "face_priority", "manual_region", "manual_keyframes", "center_fallback"]),
    fallback: z.enum(["letterbox", "blurred_background", "reject"]).nullable(),
    stillMotion: z.string().trim().max(32).nullable(),
  }).strict().optional(),
}).strict();

export const startFrameAssetSchema = z.object({
  assetId: id,
  revision,
  fingerprint: checksum,
  storageKey: storageKey,
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  materializedPath: z.string().trim().min(1).max(256).optional(),
}).strict();
export const referenceFrameSchema = z.object({
  assetId: id,
  revision,
  fingerprint: checksum,
  storageKey: storageKey,
  role: z.enum(["character", "location", "prop", "style", "continuity", "last_frame"]),
  order: z.number().int().min(0).max(31),
  weight: z.number().min(0).max(1),
  materializedPath: z.string().trim().min(1).max(256).optional(),
}).strict();
export const referenceFramePackSchema = z.object({
  packId: id,
  packRevision: revision,
  frames: z.array(referenceFrameSchema).max(32),
  lastFrame: referenceFrameSchema.nullable(),
  referenceVideoAssetId: id.nullable(),
  referenceAudioAssetId: id.nullable(),
}).strict().superRefine((value, context) => {
  const orders = new Set<number>();
  for (const frame of value.frames) {
    if (orders.has(frame.order)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["frames"], message: "reference frame order must be unique" });
    orders.add(frame.order);
  }
});

export const mediaWorkflowRequestSchema = z.object({
  intent: z.enum(["image_to_video", "video_reframe", "broll_motion", "shot_generation"]),
  workflowFamily: id,
  requestedWorkflowId: id.nullable(),
  startFrame: startFrameAssetSchema.nullable(),
  referenceFrames: referenceFramePackSchema.nullable(),
  policyRevision: revision,
}).strict();
export const mediaWorkflowPolicySnapshotSchema = z.object({
  policyRevision: revision,
  defaultWorkflowId: id,
  allowedWorkflowIds: z.array(id).min(1).max(32),
  allowUserOverride: z.boolean(),
  requiredCapabilities: z.array(id).max(32),
  workflowDefaults: z.record(z.string().trim().min(1).max(160), id).default({}),
}).strict().superRefine((value, context) => {
  const allowed = new Set(value.allowedWorkflowIds);
  if (!allowed.has(value.defaultWorkflowId)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["defaultWorkflowId"], message: "default workflow must be allowed" });
  }
  for (const [operation, workflowId] of Object.entries(value.workflowDefaults)) {
    if (!allowed.has(workflowId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["workflowDefaults", operation], message: "operation workflow must be allowed" });
    }
  }
});
export const mediaWorkflowResolutionSchema = z.object({
  resolutionId: id,
  selectedWorkflowId: id,
  selectedBy: z.enum(["admin_default", "user_override", "auto_capability_fallback"]),
  policyRevision: revision,
  capabilitySnapshotRevision: revision,
  immutable: z.literal(true),
}).strict();
export type MediaWorkflowResolution = z.infer<typeof mediaWorkflowResolutionSchema>;
export const mediaCapabilityProbeSchema = z.object({
  capabilityRevision: revision,
  adapter: z.enum(["worker_local", "comfy_mcp"]),
  reachable: z.boolean(),
  capabilities: z.array(id).max(64),
  workflowIds: z.array(id).max(64),
  models: z.array(id).max(64),
  checkedAt: z.string().datetime({ offset: true }),
  blockedReason: mediaErrorCodeSchema.nullable(),
}).strict();

export const mediaIngestJobPayloadSchema = z.object({
  kind: z.literal("media_ingest"),
  seriesId: id,
  binding: seriesMediaRootBindingSchema,
  source: mediaSourceManifestSchema,
  idempotencyKey: id.max(128),
}).strict();
export const brollPreprocessJobPayloadSchema = z.object({
  kind: z.literal("broll_preprocess"),
  seriesId: id,
  binding: seriesMediaRootBindingSchema,
  source: mediaSourceManifestSchema,
  probe: mediaProbeSchema,
  editPlan: mediaEditPlanSchema,
  idempotencyKey: id.max(128),
}).strict();
export const shotVideoGenerationJobPayloadSchema = z.object({
  kind: z.literal("shot_video_generation"),
  seriesId: id,
  binding: seriesMediaRootBindingSchema,
  episodeId: id,
  shotId: id,
  shotRevision: revision,
  startFrame: startFrameAssetSchema.nullable(),
  referenceFrames: referenceFramePackSchema.nullable(),
  workflowRequest: mediaWorkflowRequestSchema,
  workflowResolution: mediaWorkflowResolutionSchema,
  // Feature 165: null means use the Worker-local active Comfy profile. A
  // populated resolution is an immutable server-side pin and is never a
  // credential or an endpoint.
  connectionResolution: z.object({
    selectedProfileId: id,
    profileRevision: z.number().int().positive(),
    permissionRevision: z.number().int().positive(),
    policyRevision: z.number().int().positive(),
  }).strict().nullable().optional().default(null),
  budget: shotBudgetPolicySchema,
  idempotencyKey: id.max(128),
}).strict();

export const footageAnalysisStatusSchema = z.enum(["ready", "partial", "unavailable", "failed"]);
export const footageAnalysisSourceStatusSchema = z.object({
  probe: footageAnalysisStatusSchema,
  transcript: footageAnalysisStatusSchema,
  visual: footageAnalysisStatusSchema,
  guide: footageAnalysisStatusSchema,
  warnings: z.array(id).max(32),
  unknowns: z.array(boundedText).max(32),
}).strict().superRefine((value, context) => {
  const incomplete = [value.probe, value.transcript, value.visual, value.guide]
    .some(status => status !== "ready");
  if (incomplete && value.warnings.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["warnings"], message: "Incomplete footage analysis must declare a warning" });
  }
  if (incomplete && value.unknowns.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["unknowns"], message: "Incomplete footage analysis must declare an unknown" });
  }
});

export const footageSpeechRangeSchema = z.object({
  startMs: z.number().int().nonnegative().max(86_400_000),
  endMs: z.number().int().positive().max(86_400_000),
  confidence: z.number().min(0).max(1),
}).strict().superRefine((value, context) => {
  if (value.endMs <= value.startMs) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "speech range end must be after start" });
});

export const footageTranscriptTokenSchema = z.object({
  text: z.string().trim().min(1).max(500),
  startMs: z.number().int().nonnegative().max(86_400_000),
  endMs: z.number().int().positive().max(86_400_000),
  confidence: z.number().min(0).max(1).nullable(),
}).strict();

export const footageTranscriptSchema = z.object({
  language: id,
  model: id,
  text: boundedText,
  tokens: z.array(footageTranscriptTokenSchema).max(12_000),
  fingerprint: checksum,
  status: footageAnalysisStatusSchema,
  reason: id.nullable(),
}).strict();

export const footageGuideSchema = z.object({
  schemaVersion: z.literal("vd-footage-guide-v1"),
  sourceAssetId: id,
  sourceRevision: revision,
  sourceFingerprint: checksum,
  timelineTimebase: z.literal("milliseconds"),
  probe: mediaProbeSchema,
  speechRanges: z.array(footageSpeechRangeSchema).max(256),
  silenceRanges: z.array(z.object({
    startMs: z.number().int().nonnegative().max(86_400_000),
    endMs: z.number().int().positive().max(86_400_000),
    kind: z.enum(["leading", "middle", "trailing", "unknown"]),
    confidence: z.number().min(0).max(1),
  }).strict()).max(256),
  sceneRanges: z.array(z.object({
    startMs: z.number().int().nonnegative().max(86_400_000),
    endMs: z.number().int().positive().max(86_400_000),
    confidence: z.number().min(0).max(1),
    keyframeAssetId: id.nullable(),
  }).strict()).max(256),
  transcript: footageTranscriptSchema.nullable(),
  semanticGuide: z.object({
    observations: z.array(z.object({ text: boundedText, confidence: z.number().min(0).max(1), evidence: id }).strict()).max(64),
    recommendedTieIn: z.array(z.object({ text: boundedText, evidence: id }).strict()).max(32),
    avoid: z.array(z.object({ text: boundedText, evidence: id }).strict()).max(32),
    confidence: z.number().min(0).max(1),
  }).strict(),
  status: footageAnalysisSourceStatusSchema,
  runtime: z.object({ manifestVersion: id, binaryFingerprint: checksum.nullable(), modelFingerprint: checksum.nullable() }).strict(),
}).strict();
export type FootageGuide = z.infer<typeof footageGuideSchema>;

export const footageProbeAnalyzeJobPayloadSchema = z.object({
  kind: z.literal("footage_probe_analyze"),
  seriesId: id,
  binding: seriesMediaRootBindingSchema,
  source: mediaSourceManifestSchema,
  requestedLanguage: z.string().trim().regex(/^[a-z]{2,8}(-[A-Z]{2})?$/).default("th"),
  transcriptionPolicy: z.enum(["required", "preferred", "disabled"]).default("preferred"),
  analysisProfile: z.enum(["fast", "standard", "deep"]).default("standard"),
  idempotencyKey: id.max(128),
}).strict();

export const footagePrepareSegmentSchema = z.object({
  sourceInMs: z.number().int().nonnegative().max(86_400_000),
  sourceOutMs: z.number().int().positive().max(86_400_000),
  keep: z.boolean(),
  reason: boundedText,
}).strict().superRefine((value, context) => {
  if (value.sourceOutMs <= value.sourceInMs) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceOutMs"], message: "prepare segment end must be after start" });
});

export const footagePrepareJobPayloadSchema = z.object({
  kind: z.literal("footage_prepare"),
  seriesId: id,
  binding: seriesMediaRootBindingSchema,
  source: mediaSourceManifestSchema,
  analysisRevision: revision,
  segments: z.array(footagePrepareSegmentSchema).min(1).max(64),
  /** Silence is copied from the immutable Worker guide. It is advisory input
   * to preparation; the Worker still bounds and validates every cut. */
  silenceRanges: z.array(z.object({
    startMs: z.number().int().nonnegative().max(86_400_000),
    endMs: z.number().int().positive().max(86_400_000),
  }).strict()).max(256).default([]),
  trimPolicy: z.object({ removeDeadAir: z.boolean(), preserveSpeechPaddingMs: z.number().int().min(0).max(2000) }).strict(),
  baseAudioPolicy: z.enum(["preserve", "mute", "selected_ranges"]),
  fitPolicy: z.enum(["source", "9:16_cover", "9:16_contain"]),
  outputProfile: z.object({ maxDurationMs: z.number().int().positive().max(90_000), generateProxy: z.boolean() }).strict(),
  approvalFingerprint: checksum,
  idempotencyKey: id.max(128),
}).strict();

export const footageBrollPlacementSchema = z.object({
  storyBeatId: id,
  startMs: z.number().int().nonnegative().max(86_400_000),
  endMs: z.number().int().positive().max(86_400_000),
  sourceMediaAssetId: id,
  sourceInMs: z.number().int().nonnegative().max(86_400_000).default(0),
  sourceOutMs: z.number().int().positive().max(86_400_000).nullable().default(null),
  placementMode: z.enum(["overlay", "cutaway", "replace"]),
  fitMode: z.enum(["cover", "contain", "crop"]),
  baseAudioPolicy: z.enum(["preserve", "mute", "selected_ranges"]),
  brollAudioPolicy: z.enum(["mute", "mix", "replace"]).default("mute"),
}).strict().superRefine((value, context) => {
  if (value.endMs <= value.startMs) context.addIssue({ code: z.ZodIssueCode.custom, path: ["endMs"], message: "placement end must be after start" });
  if (value.sourceOutMs !== null && value.sourceOutMs <= value.sourceInMs) context.addIssue({ code: z.ZodIssueCode.custom, path: ["sourceOutMs"], message: "B-roll source out must be after source in" });
});
export type FootageBrollPlacement = z.infer<typeof footageBrollPlacementSchema>;

export const footageBrollRenderJobPayloadSchema = z.object({
  kind: z.literal("footage_broll_render"),
  seriesId: id,
  binding: seriesMediaRootBindingSchema,
  preparedSource: mediaSourceManifestSchema,
  preparedRevision: revision,
  baseDurationMs: z.number().int().positive().max(90_000),
  placements: z.array(footageBrollPlacementSchema).max(32),
  storyRevisionId: id,
  shotPlanRevisionId: id,
  assetManifest: z.array(mediaSourceManifestSchema).max(64),
  renderProfile: z.object({ width: z.literal(1080), height: z.literal(1920), fps: z.number().positive().max(60), compositionExecutor: z.literal("remotion_render_video") }).strict(),
  /** Server-compiled, URL-bearing Remotion payload. It is optional only for
   * backwards-compatible admission; the Worker must reject a render request
   * that does not contain it rather than guessing storage URLs. */
  remotionInput: remotionRenderVideoWorkerInputSchema.optional(),
  idempotencyKey: id.max(128),
}).strict();

export const verticalDramaMediaJobPayloadSchema = z.discriminatedUnion("kind", [mediaIngestJobPayloadSchema, brollPreprocessJobPayloadSchema, shotVideoGenerationJobPayloadSchema, footageProbeAnalyzeJobPayloadSchema, footagePrepareJobPayloadSchema, footageBrollRenderJobPayloadSchema]);

export const mediaArtifactManifestSchema = z.object({
  artifactId: id,
  artifactRevision: revision,
  kind: z.enum(["normalized_video", "thumbnail", "waveform", "transcript", "analysis", "shot_video"]),
  storageKey,
  checksum,
  sizeBytes: z.number().int().positive().max(50_000_000_000),
  contentType: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9.+-]*\/[A-Za-z0-9][A-Za-z0-9.+-]*$/),
  durationMs: z.number().int().nonnegative().nullable(),
  qc: mediaQcReportSchema,
  sourceAssetId: id,
  sourceRevision: revision,
  intelligence: mediaIntelligenceMetadataSchema.optional(),
}).strict();

export const mediaJobProgressSchema = z.object({
  jobId: id,
  kind: mediaJobKindSchema,
  status: mediaJobStatusSchema,
  stage: id,
  percent: z.number().int().min(0).max(100),
  messageKey: id,
  artifactIds: z.array(id).max(64),
}).strict();
export type VerticalDramaMediaJobPayload = z.infer<typeof verticalDramaMediaJobPayloadSchema>;
