import { z } from "zod";
import { stableHash } from "./hyperframes/contracts";

export const MANUAL_STORYBOARD_MOCKUP_PRODUCT_ID =
  "manual_storyboard_product_mockup";
export const MANUAL_STORYBOARD_PRODUCT_ID_PATTERN =
  /^manual_storyboard_product_[A-Za-z0-9_-]+$/;

export function normalizeManualStoryboardProductId(value: unknown): string {
  const productId = typeof value === "string" ? value.trim() : "";
  if (!productId) return "";
  return MANUAL_STORYBOARD_PRODUCT_ID_PATTERN.test(productId)
    ? MANUAL_STORYBOARD_MOCKUP_PRODUCT_ID
    : productId;
}

export const storyboardPreviewMatchCaptureEngineValues = [
  "hyperframes_worker",
  "preview_match_browser_capture",
] as const;

export const storyboardPreviewMatchCaptureQualityValues = [
  "standard",
  "high",
] as const;

export const storyboardPreviewMatchCaptureStatusValues = [
  "not_started",
  "queued",
  "blocked",
  "preparing_assets",
  "browser_ready",
  "capturing",
  "encoding",
  "verifying",
  "publishing",
  "completed",
  "saved_to_library",
  "cancelled",
  "failed_transient",
  "failed_permanent",
  "verification_failed",
  "compliance_blocked",
] as const;

export const storyboardPreviewMatchCaptureStageValues = [
  "queue",
  "prepare_assets",
  "browser_ready",
  "capture_browser",
  "encode_mp4",
  "verify_output",
  "publish_library",
] as const;

export const storyboardPreviewMatchCaptureFailureCodeValues = [
  "feature_disabled",
  "server_worker_disabled",
  "client_capture_not_trusted",
  "invalid_quality",
  "unsupported_output",
  "missing_source_video",
  "stale_preview_hash",
  "route_token_invalid",
  "capture_payload_missing",
  "asset_manifest_invalid",
  "browser_launch_failed",
  "capture_ready_timeout",
  "capture_ready_failed",
  "media_preload_failed",
  "font_preload_failed",
  "browser_recording_unavailable",
  "encode_failed",
  "verification_failed",
  "render_surface_mismatch",
  "library_publish_failed",
  "stale_attempt",
  "capture_attempt_stale",
  "cancelled",
] as const;

export const storyboardPreviewMatchCaptureEngineSchema = z.enum(
  storyboardPreviewMatchCaptureEngineValues,
);

export const storyboardPreviewMatchCaptureQualitySchema = z.enum(
  storyboardPreviewMatchCaptureQualityValues,
);

export const storyboardPreviewMatchCaptureStatusSchema = z.enum(
  storyboardPreviewMatchCaptureStatusValues,
);

export const storyboardPreviewMatchCaptureStageSchema = z.enum(
  storyboardPreviewMatchCaptureStageValues,
);

export const storyboardPreviewMatchCaptureFailureCodeSchema = z.enum(
  storyboardPreviewMatchCaptureFailureCodeValues,
);

export type StoryboardFinalCompositeRenderEngine =
  (typeof storyboardPreviewMatchCaptureEngineValues)[number];

export type StoryboardPreviewMatchCaptureQuality =
  (typeof storyboardPreviewMatchCaptureQualityValues)[number];

export type StoryboardPreviewMatchCaptureStatus =
  (typeof storyboardPreviewMatchCaptureStatusValues)[number];

export type StoryboardPreviewMatchCaptureStage =
  (typeof storyboardPreviewMatchCaptureStageValues)[number];

export type StoryboardPreviewMatchCaptureFailureCode =
  (typeof storyboardPreviewMatchCaptureFailureCodeValues)[number];

export const storyboardPreviewMatchCaptureProjectionSchema = z.object({
  captureJobId: z.string().min(1).nullable(),
  engine: z.literal("preview_match_browser_capture"),
  quality: storyboardPreviewMatchCaptureQualitySchema,
  status: storyboardPreviewMatchCaptureStatusSchema,
  stage: storyboardPreviewMatchCaptureStageSchema.nullable(),
  progressPercent: z.number().min(0).max(100).default(0),
  previewCompositionHash: z.string().min(1).nullable(),
  timelineHash: z.string().min(1).nullable(),
  safeMessage: z.string().nullable(),
  safeDiagnostics: z.array(z.string()).default([]),
  failureCode: storyboardPreviewMatchCaptureFailureCodeSchema.nullable(),
  canCancel: z.boolean().default(false),
  canRetry: z.boolean().default(false),
  outputUrl: z.string().nullable(),
  libraryItemId: z.union([z.string(), z.number()]).nullable().optional(),
  evidenceRef: z.string().nullable().optional(),
  captureElapsedSeconds: z.number().min(0).nullable().optional(),
});

export type StoryboardPreviewMatchCaptureProjection =
  z.infer<typeof storyboardPreviewMatchCaptureProjectionSchema>;

export type PreviewMatchSubtitleCue = {
  startSec: number;
  endSec: number;
  text: string;
};

export type PreviewMatchCompositionPayload = {
  tenantId: string;
  productId: string;
  runId: string;
  storyboardReviewId: string;
  requestedByUserId?: number | string | null;
  revision: number;
  finalCompositeConfigHash: string;
  previewCompositionHash: string;
  timelineHash: string;
  engine: "preview_match_browser_capture";
  output: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
  };
  text: Record<string, unknown>;
  audio: Record<string, unknown>;
  shots: Array<{
    id: string;
    index: number;
    sourceClipId: string;
    sourceVideoRef: string | null;
    mediaStartSec: number;
    startSec: number;
    endSec: number;
    durationSeconds: number;
    overlayPreset: string;
    animationPreset: string;
    transition: string;
    textMotionPreset: string;
    onScreenText: string[];
    subtitleCues: PreviewMatchSubtitleCue[];
    subtitleText: string[];
    subtitleVtt: string | null;
    subtitleSrt: string | null;
  }>;
};

export type PreviewMatchCompositionMetadata = {
  tenantId?: string | null;
  productId?: string | null;
  runId?: string | null;
  storyboardReviewId?: string | number | null;
  requestedByUserId?: number | string | null;
  revision?: number | null;
  finalCompositeConfigHash?: string | null;
  previewCompositionHash?: string | null;
  timelineHash?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asNumber(value: unknown, fallback: number): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function roundTenth(value: unknown, fallback = 0): number {
  return Math.round(asNumber(value, fallback) * 10) / 10;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => asString(item).trim())
    .filter(Boolean);
}

function asUserId(value: unknown): string | number | null {
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function normalizeSubtitleCues(value: unknown): PreviewMatchSubtitleCue[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(cue => {
      const record = asRecord(cue);
      return {
        startSec: roundTenth(record.startSec),
        endSec: roundTenth(record.endSec),
        text: asString(record.text).trim(),
      };
    })
    .filter(cue => cue.text && cue.endSec >= cue.startSec);
}

function normalizePlainRecord(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter(([_key, child]) => child !== undefined),
  );
}

function normalizeShotDurationSeconds(shotRecord: Record<string, unknown>): number {
  const explicitDuration = roundTenth(shotRecord.durationSeconds, 0);
  const startSec = roundTenth(shotRecord.startSec);
  const endSec = roundTenth(shotRecord.endSec, explicitDuration);
  const timelineDuration = roundTenth(Math.max(0, endSec - startSec), explicitDuration);
  return Math.max(0, timelineDuration || explicitDuration);
}

export function buildPreviewMatchCompositionPayloadFromHyperframesPreview(
  preview: unknown,
  metadata: PreviewMatchCompositionMetadata = {},
): PreviewMatchCompositionPayload {
  const record = asRecord(preview);
  const output = asRecord(record.output);
  const shots = Array.isArray(record.shots) ? record.shots : [];
  const metadataRecord = asRecord(record.previewMatchMetadata);
  const resolvedMetadata = {
    tenantId: asString(metadata.tenantId ?? metadataRecord.tenantId, "default"),
    productId: asString(metadata.productId ?? metadataRecord.productId, "unknown_product"),
    runId: asString(metadata.runId ?? metadataRecord.runId, "unknown_run"),
    storyboardReviewId: asString(
      metadata.storyboardReviewId ?? metadataRecord.storyboardReviewId,
      "unknown_storyboard",
    ),
    requestedByUserId: asUserId(metadata.requestedByUserId ?? metadataRecord.requestedByUserId),
    revision: Math.max(0, Math.round(asNumber(metadata.revision ?? metadataRecord.revision, 0))),
    finalCompositeConfigHash: asString(
      metadata.finalCompositeConfigHash ?? metadataRecord.finalCompositeConfigHash,
      "pending_config_hash",
    ),
    previewCompositionHash: asString(
      metadata.previewCompositionHash ?? metadataRecord.previewCompositionHash,
      "pending_preview_hash",
    ),
    timelineHash: asString(
      metadata.timelineHash ?? metadataRecord.timelineHash,
      "pending_timeline_hash",
    ),
  };

  return {
    ...resolvedMetadata,
    engine: "preview_match_browser_capture",
    output: {
      width: Math.max(1, Math.round(asNumber(output.width, 1080))),
      height: Math.max(1, Math.round(asNumber(output.height, 1920))),
      fps: Math.max(1, Math.round(asNumber(output.fps, 30))),
      durationSeconds: roundTenth(output.durationSeconds, 0),
    },
    text: normalizePlainRecord(record.text),
    audio: normalizePlainRecord(record.audio),
    shots: shots.map((shot, index) => {
      const shotRecord = asRecord(shot);
      const durationSeconds = normalizeShotDurationSeconds(shotRecord);
      const startSec = roundTenth(shotRecord.startSec);
      return {
        id: asString(shotRecord.id, `shot-${index + 1}`),
        index: Math.round(asNumber(shotRecord.index, index)),
        sourceClipId: asString(shotRecord.sourceClipId, asString(shotRecord.id, `shot-${index + 1}`)),
        sourceVideoRef: asString(shotRecord.sourceVideoRef).trim() || null,
        mediaStartSec: roundTenth(shotRecord.mediaStartSec),
        startSec,
        endSec: roundTenth(shotRecord.endSec, startSec + durationSeconds),
        durationSeconds,
        overlayPreset: asString(shotRecord.overlayPreset, "default"),
        animationPreset: asString(shotRecord.animationPreset, "smooth_reveal"),
        transition: asString(shotRecord.transition, "fade"),
        textMotionPreset: asString(shotRecord.textMotionPreset, "smooth"),
        onScreenText: asStringArray(shotRecord.onScreenText),
        subtitleCues: normalizeSubtitleCues(shotRecord.subtitleCues),
        subtitleText: asStringArray(shotRecord.subtitleText),
        subtitleVtt: asString(shotRecord.subtitleVtt).trim() || null,
        subtitleSrt: asString(shotRecord.subtitleSrt).trim() || null,
      };
    }),
  };
}

export function withPreviewMatchCompositionHashes(
  payload: PreviewMatchCompositionPayload,
): PreviewMatchCompositionPayload {
  const pendingPreviewPayload = {
    ...payload,
    finalCompositeConfigHash: "pending_config_hash",
    previewCompositionHash: "pending_preview_hash",
    timelineHash: "pending_timeline_hash",
  };
  const finalCompositeConfigHash = computePreviewMatchFinalCompositeConfigHash(pendingPreviewPayload);
  const previewCompositionHash = computePreviewMatchCompositionHash(pendingPreviewPayload);
  const timelineHash = computePreviewMatchTimelineHash(pendingPreviewPayload);
  return {
    ...payload,
    finalCompositeConfigHash,
    previewCompositionHash,
    timelineHash,
  };
}

export function computePreviewMatchFinalCompositeConfigHash(payload: PreviewMatchCompositionPayload): string {
  return stableHash({
    engine: payload.engine,
    output: payload.output,
    text: payload.text,
    audio: payload.audio,
    shotPlan: payload.shots.map(shot => ({
      id: shot.id,
      index: shot.index,
      sourceClipId: shot.sourceClipId,
      mediaStartSec: shot.mediaStartSec,
      startSec: shot.startSec,
      endSec: shot.endSec,
      durationSeconds: shot.durationSeconds,
      overlayPreset: shot.overlayPreset,
      animationPreset: shot.animationPreset,
      transition: shot.transition,
      textMotionPreset: shot.textMotionPreset,
    })),
  }).replace(/^hf_/, "pmfc_");
}

export function computePreviewMatchCompositionHash(payload: PreviewMatchCompositionPayload): string {
  return stableHash({
    engine: payload.engine,
    output: payload.output,
    text: payload.text,
    audio: payload.audio,
    shots: payload.shots.map(shot => ({
      id: shot.id,
      sourceClipId: shot.sourceClipId,
      sourceVideoRef: shot.sourceVideoRef,
      mediaStartSec: shot.mediaStartSec,
      startSec: shot.startSec,
      endSec: shot.endSec,
      durationSeconds: shot.durationSeconds,
      overlayPreset: shot.overlayPreset,
      animationPreset: shot.animationPreset,
      transition: shot.transition,
      textMotionPreset: shot.textMotionPreset,
      onScreenText: shot.onScreenText,
      subtitleCues: shot.subtitleCues,
      subtitleVtt: shot.subtitleVtt,
      subtitleSrt: shot.subtitleSrt,
    })),
  }).replace(/^hf_/, "pmc_");
}

export function computePreviewMatchTimelineHash(payload: PreviewMatchCompositionPayload): string {
  return stableHash({
    output: {
      fps: payload.output.fps,
      durationSeconds: payload.output.durationSeconds,
    },
    shots: payload.shots.map(shot => ({
      id: shot.id,
      sourceVideoRef: shot.sourceVideoRef,
      mediaStartSec: shot.mediaStartSec,
      startSec: shot.startSec,
      endSec: shot.endSec,
      durationSeconds: shot.durationSeconds,
      subtitleCues: shot.subtitleCues,
      animationPreset: shot.animationPreset,
      transition: shot.transition,
      textMotionPreset: shot.textMotionPreset,
    })),
  }).replace(/^hf_/, "pmt_");
}

export const previewMatchCompositionPayloadSchema = z.object({
  tenantId: z.string().min(1),
  productId: z.string().min(1),
  runId: z.string().min(1),
  storyboardReviewId: z.string().min(1),
  requestedByUserId: z.union([z.string(), z.number()]).nullable().optional(),
  revision: z.number().int().nonnegative(),
  finalCompositeConfigHash: z.string().min(1),
  previewCompositionHash: z.string().min(1),
  timelineHash: z.string().min(1),
  engine: z.literal("preview_match_browser_capture"),
  output: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: z.number().int().positive(),
    durationSeconds: z.number().nonnegative(),
  }),
  text: z.record(z.unknown()),
  audio: z.record(z.unknown()),
  shots: z.array(z.object({
    id: z.string().min(1),
    index: z.number().int().nonnegative(),
    sourceClipId: z.string().min(1),
    sourceVideoRef: z.string().nullable(),
    mediaStartSec: z.number(),
    startSec: z.number(),
    endSec: z.number(),
    durationSeconds: z.number().nonnegative(),
    overlayPreset: z.string(),
    animationPreset: z.string(),
    transition: z.string(),
    textMotionPreset: z.string(),
    onScreenText: z.array(z.string()),
    subtitleCues: z.array(z.object({
      startSec: z.number(),
      endSec: z.number(),
      text: z.string().min(1),
    })),
    subtitleText: z.array(z.string()),
    subtitleVtt: z.string().nullable(),
    subtitleSrt: z.string().nullable(),
  })).min(1),
});

export const createPreviewMatchFinalCompositeCaptureInputSchema = z.object({
  productId: z.string().min(1).max(64),
  runId: z.string().min(1).max(64),
  storyboardReviewId: z.string().min(1).max(128),
  quality: storyboardPreviewMatchCaptureQualitySchema.default("standard"),
  expectedPreviewCompositionHash: z.string().min(1).max(160),
  expectedTimelineHash: z.string().min(1).max(160),
  finalCompositeConfigHash: z.string().min(1).max(160),
  output: z.object({
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(320).max(3840),
    fps: z.number().int().min(12).max(60),
    durationSeconds: z.number().min(0.1).max(600),
  }),
  idempotencyKey: z.string().min(1).max(256).optional(),
  payload: previewMatchCompositionPayloadSchema,
}).strict();

export const getPreviewMatchCaptureJobInputSchema = z.object({
  captureJobId: z.string().min(1).max(128).optional(),
  productId: z.string().min(1).max(64).optional(),
  runId: z.string().min(1).max(64).optional(),
  storyboardReviewId: z.string().min(1).max(128).optional(),
}).strict().refine(
  input => Boolean(input.captureJobId?.trim() || input.runId?.trim()),
  "captureJobId or runId is required",
);

export const cancelPreviewMatchCaptureJobInputSchema = z.object({
  captureJobId: z.string().min(1).max(128),
  productId: z.string().min(1).max(64).optional(),
  runId: z.string().min(1).max(64).optional(),
}).strict();

export const previewMatchCaptureJobOutputSchema = z.object({
  capture: storyboardPreviewMatchCaptureProjectionSchema,
  invalidates: z.array(z.string()).default([]),
}).strict();

export type CreatePreviewMatchFinalCompositeCaptureInput = z.infer<
  typeof createPreviewMatchFinalCompositeCaptureInputSchema
>;
export type GetPreviewMatchCaptureJobInput = z.infer<typeof getPreviewMatchCaptureJobInputSchema>;
export type CancelPreviewMatchCaptureJobInput = z.infer<
  typeof cancelPreviewMatchCaptureJobInputSchema
>;
