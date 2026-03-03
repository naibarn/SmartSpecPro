import { z } from "zod";

import {
  PRESENTATION_CONFLICT_SCHEMA_VERSION,
  PRESENTATION_COMPATIBILITY_SCHEMA_VERSION,
  PRESENTATION_CONVERSION_SCHEMA_VERSION,
  PRESENTATION_ERROR_CODE_VALUES,
  PRESENTATION_EXPORT_SCHEMA_VERSION,
  PRESENTATION_ITEM_TYPE,
  PRESENTATION_LIMITS,
  PRESENTATION_RENDER_SCHEMA_VERSION,
  PRESENTATION_SLIDESHOW_SCHEMA_VERSION,
} from "./constants";
import {
  presentationExportWarningsSchema,
  type PresentationExportWarning,
} from "./exportWarnings";

export const presentationRouteGuardInputSchema = z.object({
  itemId: z.number().int().positive(),
  itemType: z.string().min(1).max(64),
});

export const presentationRecoveryCtaSchema = z.object({
  label: z.string().min(1).max(120),
  href: z.string().min(1).max(2048),
});

export const presentationRouteAllowedResultSchema = z.object({
  allowed: z.literal(true),
  itemId: z.number().int().positive(),
  editorRoute: z.string().min(1).max(2048),
});

export const presentationRouteBlockedResultSchema = z.object({
  allowed: z.literal(false),
  itemId: z.number().int().positive(),
  itemType: z.string().min(1).max(64),
  errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES),
  message: z.string().min(1).max(400),
  recoveryCta: presentationRecoveryCtaSchema,
});

export const presentationRouteGuardResultSchema = z.union([
  presentationRouteAllowedResultSchema,
  presentationRouteBlockedResultSchema,
]);

export const presentationAvailabilitySchema = z.object({
  enabled: z.boolean(),
  errorCode: z.enum(PRESENTATION_ERROR_CODE_VALUES).optional(),
  message: z.string().optional(),
  aiGenerationEnabled: z.boolean().optional(),
});

export const presentationConflictReasonCodeSchema = z.enum([
  "DECK_VERSION_MISMATCH",
  "SLIDE_VERSION_MISMATCH",
]);

export const presentationDeckConflictSnapshotSchema = z.object({
  id: z.number().int().positive(),
  version: z.number().int().nonnegative(),
  slideCount: z.number().int().nonnegative(),
  totalAssetBytes: z.number().int().nonnegative(),
  updatedAt: z.coerce.date(),
});

export const presentationSlideConflictSnapshotSchema = z.object({
  id: z.number().int().positive(),
  deckId: z.number().int().positive(),
  orderIndex: z.number().int().nonnegative(),
  version: z.number().int().nonnegative(),
  title: z.string().min(1).max(255),
  slideContent: z.record(z.any()),
  notes: z.string().nullable(),
  updatedAt: z.coerce.date(),
});

export const presentationVersionConflictSchema = z.object({
  conflictSchemaVersion: z.literal(PRESENTATION_CONFLICT_SCHEMA_VERSION),
  reasonCode: presentationConflictReasonCodeSchema,
  expectedVersion: z.number().int().nonnegative(),
  latestDeckVersion: z.number().int().nonnegative(),
  latestSlideVersion: z.number().int().nonnegative().optional(),
  deckId: z.number().int().positive(),
  slideId: z.number().int().positive().optional(),
  saveMode: z.enum(["manual", "autosave"]).optional(),
  latestDeck: presentationDeckConflictSnapshotSchema,
  latestSlide: presentationSlideConflictSnapshotSchema.optional(),
});

export const presentationSourceFormatSchema = z.enum([
  "presentation",
  "pptx",
  "ppt",
  "unknown",
]);

const presentationReadOnlySourceFormatSchema = z.enum([
  "pptx",
  "ppt",
  "google_slides",
  "unknown",
]);

export const presentationCompatibilityEditableSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_COMPATIBILITY_SCHEMA_VERSION),
  mode: z.literal("editable"),
  itemId: z.number().int().positive(),
  sourceFormat: z.literal("presentation"),
  canConvert: z.literal(false),
});

export const presentationCompatibilityReadOnlySchema = z.object({
  schemaVersion: z.literal(PRESENTATION_COMPATIBILITY_SCHEMA_VERSION),
  mode: z.literal("read_only"),
  itemId: z.number().int().positive(),
  sourceFormat: presentationReadOnlySourceFormatSchema,
  canConvert: z.boolean(),
  guidance: z.string().min(1).max(400),
  partialFidelity: z.boolean(),
  fidelityWarnings: z.array(z.string().min(1).max(200)).max(25),
});

export const presentationCompatibilityResultSchema = z.union([
  presentationCompatibilityEditableSchema,
  presentationCompatibilityReadOnlySchema,
]);

export const presentationConversionStatusSchema = z.enum([
  "created",
  "existing",
  "locked",
  "unsupported",
]);

export const presentationConversionResultSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_CONVERSION_SCHEMA_VERSION),
  sourceItemId: z.number().int().positive().optional(),
  sourceFormat: z.enum(["pptx", "ppt", "google_slides"]),
  conversionStatus: presentationConversionStatusSchema,
  partialFidelity: z.boolean(),
  fidelityWarnings: z.array(z.string().min(1).max(200)).max(25),
  deckLibraryItemId: z.number().int().positive().optional(),
  deckId: z.number().int().positive().optional(),
  guidance: z.string().min(1).max(400).optional(),
});

export const presentationTransitionSchema = z.enum([
  "cut",
  "fade",
]);
export const presentationCanvasPresetSchema = z.enum([
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "4:5",
  "5:4",
  "1:1",
]);

const presentationElementCoordinateSchema = z.number().finite().min(-100_000).max(100_000);
const presentationElementSizeSchema = z.number().finite().min(0).max(100_000);
const presentationElementOpacitySchema = z.number().finite().min(0).max(1);
const presentationElementRotationSchema = z.number().finite().min(-3600).max(3600);
const presentationCanvasDimensionSchema = z.number().int().positive().max(10_000);

export const presentationCanvasSizeSchema = z.object({
  preset: presentationCanvasPresetSchema.optional(),
  width: presentationCanvasDimensionSchema,
  height: presentationCanvasDimensionSchema,
}).strict();

export const presentationTextElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("text"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  rotation: presentationElementRotationSchema.optional(),
  text: z.string().max(10_000),
  color: z.string().min(1).max(64),
  fontSize: z.number().finite().min(8).max(512).optional(),
  fontFamily: z.string().min(1).max(128).optional(),
  fontWeight: z.enum(["normal", "500", "600", "700"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z.number().finite().min(0.6).max(4).optional(),
  letterSpacing: z.number().finite().min(-20).max(100).optional(),
  backgroundColor: z.string().min(1).max(64).optional(),
  textShadow: z.string().max(256).optional(),
  textStroke: z.string().max(128).optional(),
}).strict();

export const presentationImageElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("image"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  rotation: presentationElementRotationSchema.optional(),
  src: z.string().max(4_096),
  alt: z.string().max(512),
  imageFit: z.enum(["contain", "cover", "fill"]).optional(),
  imagePositionX: z.number().finite().min(0).max(100).optional(),
  imagePositionY: z.number().finite().min(0).max(100).optional(),
  imageZoom: z.number().finite().min(0.5).max(3).optional(),
  imagePrompt: z.string().max(4_000).optional(),
  imageModelId: z.string().max(256).optional(),
  imageReferenceUrls: z.array(z.string().max(2_048)).max(5).optional(),
  svgContent: z.string().max(8_192).optional(),
  svgColor: z.string().max(32).optional(),
}).strict();

export const presentationVideoElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("video"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  rotation: presentationElementRotationSchema.optional(),
  src: z.string().max(4_096),
  poster: z.string().max(4_096).optional(),
  title: z.string().max(512).optional(),
  muted: z.boolean().optional(),
  loop: z.boolean().optional(),
}).strict();

export const presentationRectElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("rect"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  rotation: presentationElementRotationSchema.optional(),
  fill: z.string().min(1).max(64),
  stroke: z.string().min(1).max(64).optional(),
  strokeWidth: z.number().finite().min(0).max(1_000).optional(),
}).strict();

export const presentationLineElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("line"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  rotation: presentationElementRotationSchema.optional(),
  fill: z.string().min(1).max(64).optional(),
  stroke: z.string().min(1).max(64),
  strokeWidth: z.number().finite().min(0).max(1_000),
}).strict();

// === Audio Track Schemas ===

/** Validates tRPC input when a user attaches audio to a slide (references library item, URL resolved server-side) */
export const audioTrackInputSchema = z.object({
  libraryItemId: z.number().int().positive(),
  volume: z.number().finite().min(0).max(1),
  startAtMs: z.number().int().min(0),
  endAtMs: z.number().int().min(0).nullable().optional(),
}).strict();

/** Resolved per-slide audio track sent to Python in the render spec (libraryItemId replaced by presigned URL) */
export const resolvedAudioTrackSchema = z.object({
  url: z.string().url(),
  volume: z.number().finite().min(0).max(1),
  startAtMs: z.number().int().min(0),
  endAtMs: z.number().int().min(0).nullable().optional(),
}).strict();

/** Validates tRPC input for deck-level background audio */
export const projectAudioTrackInputSchema = z.object({
  libraryItemId: z.number().int().positive(),
  volume: z.number().finite().min(0).max(1),
  startAtMs: z.number().int().min(0).optional(),
  endAtMs: z.number().int().min(0).nullable().optional(),
  loop: z.boolean(),
  fadeOutMs: z.number().int().min(0).nullable().optional(),
}).strict();

/** Resolved deck-level audio track sent to Python in the render spec */
export const resolvedProjectAudioTrackSchema = z.object({
  url: z.string().url(),
  volume: z.number().finite().min(0).max(1),
  startAtMs: z.number().int().min(0).optional(),
  endAtMs: z.number().int().min(0).nullable().optional(),
  loop: z.boolean(),
  fadeOutMs: z.number().int().min(0).nullable().optional(),
}).strict();

export const presentationSlideElementSchema = z.discriminatedUnion("type", [
  presentationTextElementSchema,
  presentationImageElementSchema,
  presentationVideoElementSchema,
  presentationRectElementSchema,
  presentationLineElementSchema,
]);

export const presentationPendingMediaJobSchema = z.object({
  id: z.string().min(1).max(128),
  mediaType: z.enum(["image", "video"]),
  mediaTaskId: z.string().min(1).max(256),
  providerTaskId: z.string().max(256).optional(),
  targetElementId: z.string().max(128).optional(),
  targetX: presentationElementCoordinateSchema,
  targetY: presentationElementCoordinateSchema,
  targetWidth: presentationElementSizeSchema,
  targetHeight: presentationElementSizeSchema,
  modelId: z.string().max(256).optional(),
  prompt: z.string().max(4000).optional(),
  status: z.enum(["pending", "processing", "failed"]).optional(),
  reason: z.string().max(256).optional(),
  createdAt: z.string().min(1).max(64),
  lastCheckedAt: z.string().min(1).max(64).optional(),
}).strict();

export const presentationSlideContentSchema = z.object({
  elements: z.array(presentationSlideElementSchema).max(PRESENTATION_LIMITS.maxElementsPerSlide),
  canvas: presentationCanvasSizeSchema.optional(),
  transition: presentationTransitionSchema.optional(),
  durationMs: z.number().finite().min(250).max(120_000).optional(),
  pendingMediaJobs: z.array(presentationPendingMediaJobSchema).max(32).optional(),
}).strict();

export const presentationSlideshowSlideSchema = z.object({
  slideId: z.number().int().positive(),
  orderIndex: z.number().int().nonnegative(),
  title: z.string().min(1).max(255),
  durationMs: z.number().int().min(250).max(120_000),
  transition: presentationTransitionSchema,
  /** Resolved audio track for this slide. Only present in getPlayDeck response, not in export flows. */
  audioTrack: resolvedAudioTrackSchema.nullable().optional(),
});

export const presentationSlideshowPayloadSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_SLIDESHOW_SCHEMA_VERSION),
  deckId: z.number().int().positive(),
  generatedAt: z.coerce.date(),
  slides: z.array(presentationSlideshowSlideSchema).max(500),
  /** Resolved deck-level audio. Only present in getPlayDeck response. */
  projectAudioTrack: resolvedProjectAudioTrackSchema.nullable().optional(),
});

export const presentationRenderSpecSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_RENDER_SCHEMA_VERSION),
  deckId: z.number().int().positive(),
  /** Export format — png and jpg produce zip archives of per-slide images */
  format: z.enum(["png", "jpg", "pdf", "mp4"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive().max(120),
  /** Quality preset — only meaningful for mp4 and jpg formats */
  quality: z.enum(["draft", "standard", "high"]).optional(),
  slides: z.array(presentationSlideshowSlideSchema).max(500),
  /** Resolved deck-level audio for mixing into the exported video */
  projectAudioTrack: resolvedProjectAudioTrackSchema.nullable().optional(),
  warnings: presentationExportWarningsSchema.default([]),
});

export const presentationExportStatusSchema = z.enum([
  "queued",
  "processing",
  "done",
  "error",
  "cancelled",
]);

export const presentationExportResultSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_EXPORT_SCHEMA_VERSION),
  /** DB primary key of the presentation_exports row */
  exportId: z.number().int().positive(),
  deckId: z.number().int().positive(),
  format: z.enum(["png", "jpg", "pdf", "mp4"]),
  deduped: z.boolean(),
  status: presentationExportStatusSchema,
  message: z.string().min(1).max(400).optional(),
  renderSpec: presentationRenderSpecSchema,
  warnings: presentationExportWarningsSchema.default([]),
});

export const presentationExportStatusResultSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_EXPORT_SCHEMA_VERSION),
  exportId: z.number().int().positive(),
  status: presentationExportStatusSchema,
  format: z.enum(["png", "jpg", "pdf", "mp4"]),
  /** Progress percentage 0–100 */
  progressPct: z.number().int().min(0).max(100).default(0),
  /** Human-readable current stage, e.g. "Rendering slide 3 of 10" */
  stage: z.string().max(120).nullable().optional(),
  /** Download URL (absolute presigned HTTPS/HTTP or relative app path). Only present when status is "done". */
  downloadUrl: z.string().max(8_192).regex(/^(https?:\/\/|\/).+/).nullable().optional(),
  /** Error description. Only present when status is "error". */
  errorMessage: z.string().max(1000).nullable().optional(),
  /** Output file size in bytes. Only present when status is "done". */
  outputBytes: z.number().nonnegative().nullable().optional(),
  updatedAt: z.coerce.date(),
  warnings: presentationExportWarningsSchema.default([]),
});

export type PresentationRouteGuardInput = z.infer<typeof presentationRouteGuardInputSchema>;
export type PresentationRouteAllowedResult = z.infer<typeof presentationRouteAllowedResultSchema>;
export type PresentationRouteBlockedResult = z.infer<typeof presentationRouteBlockedResultSchema>;
export type PresentationRouteGuardResult = z.infer<typeof presentationRouteGuardResultSchema>;
export type PresentationAvailability = z.infer<typeof presentationAvailabilitySchema>;
export type PresentationVersionConflict = z.infer<typeof presentationVersionConflictSchema>;
export type PresentationSourceFormat = z.infer<typeof presentationSourceFormatSchema>;
export type PresentationCompatibilityResult = z.infer<typeof presentationCompatibilityResultSchema>;
export type PresentationConversionResult = z.infer<typeof presentationConversionResultSchema>;
export type PresentationSlideshowPayload = z.infer<typeof presentationSlideshowPayloadSchema>;
export type PresentationRenderSpec = z.infer<typeof presentationRenderSpecSchema>;
export type PresentationTransition = z.infer<typeof presentationTransitionSchema>;
export type PresentationSlideElement = z.infer<typeof presentationSlideElementSchema>;
export type PresentationPendingMediaJob = z.infer<typeof presentationPendingMediaJobSchema>;
export type PresentationSlideContent = z.infer<typeof presentationSlideContentSchema>;
export type PresentationExportResult = z.infer<typeof presentationExportResultSchema>;
export type PresentationExportStatusResult = z.infer<typeof presentationExportStatusResultSchema>;
export type { PresentationExportWarning };

// TODO: When play-mode-only fields are added (e.g., chapter markers, loop ranges), replace this
// alias with `presentationSlideshowPayloadSchema.extend({...})` to avoid a breaking schema change.
export const presentationPlayDeckPayloadSchema = presentationSlideshowPayloadSchema;
export type AudioTrackInput = z.infer<typeof audioTrackInputSchema>;
export type ResolvedAudioTrack = z.infer<typeof resolvedAudioTrackSchema>;
export type ProjectAudioTrackInput = z.infer<typeof projectAudioTrackInputSchema>;
export type ResolvedProjectAudioTrack = z.infer<typeof resolvedProjectAudioTrackSchema>;
export type PresentationPlayDeckPayload = z.infer<typeof presentationPlayDeckPayloadSchema>;

export function isPresentationItemType(itemType: string): boolean {
  return itemType.trim().toLowerCase() === PRESENTATION_ITEM_TYPE;
}
