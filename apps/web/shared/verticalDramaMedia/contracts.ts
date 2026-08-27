import { z } from "zod";

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
export const mediaJobKindValues = ["media_ingest", "broll_preprocess", "shot_video_generation"] as const;
export const mediaJobStatusValues = ["queued", "claimed", "running", "uploading", "verifying", "published", "failed", "canceled", "quarantined"] as const;
export const mediaErrorCodeValues = ["invalid_contract", "root_not_bound", "root_revision_stale", "source_not_stable", "unsupported_media", "dead_air_detection_failed", "focus_track_failed", "duration_budget_exceeded", "qc_failed", "workflow_capability_blocked", "artifact_checksum_mismatch", "artifact_ownership_failed", "publication_rejected", "index_enqueue_failed"] as const;

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
export const verticalDramaMediaJobPayloadSchema = z.discriminatedUnion("kind", [mediaIngestJobPayloadSchema, brollPreprocessJobPayloadSchema, shotVideoGenerationJobPayloadSchema]);

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
