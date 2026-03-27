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
  PRESENTATION_WARNING_CONTRACT_VERSION,
} from "./constants";
import {
  presentationExportWarningsSchema,
  type PresentationExportWarning,
} from "./exportWarnings";
import {
  presentationAILayoutModeSchema,
  presentationAILayoutModeBlockedBySchema,
} from "./contentProfile";

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
  "slide-left",
  "slide-right",
  "zoom-in",
  "zoom-out",
  "blur",
]);
export const presentationMediaMotionPresetSchema = z.enum([
  "none",
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "pan-up-left",
  "pan-up-right",
  "pan-down-left",
  "pan-down-right",
]);
export const presentationMediaMotionEasingSchema = z.enum([
  "linear",
  "ease-in-out",
]);
export const presentationMediaMotionTimingModeSchema = z.enum([
  "duration",
  "until-slide-end",
]);
export const presentationMediaMotionSegmentSchema = z.object({
  preset: presentationMediaMotionPresetSchema,
  intensity: z.number().finite().min(0).max(1).optional(),
  easing: presentationMediaMotionEasingSchema.optional(),
  timingMode: presentationMediaMotionTimingModeSchema.optional(),
  durationMs: z.number().finite().min(250).max(120_000).optional(),
}).strict();
export const presentationMediaMotionSchema = z.object({
  preset: presentationMediaMotionPresetSchema.optional(),
  intensity: z.number().finite().min(0).max(1).optional(),
  easing: presentationMediaMotionEasingSchema.optional(),
  timingMode: presentationMediaMotionTimingModeSchema.optional(),
  durationMs: z.number().finite().min(250).max(120_000).optional(),
  intro: presentationMediaMotionSegmentSchema.optional(),
  outro: presentationMediaMotionSegmentSchema.optional(),
}).strict();
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
export const presentationMediaShapeSchema = z.enum([
  "rect",
  "rounded",
  "circle",
  "ellipse",
  "diamond",
  "star",
]);

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
  fontWeight: z.enum(["normal", "300", "400", "500", "600", "700"]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textDecoration: z.enum(["none", "underline", "line-through"]).optional(),
  textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
  lineHeight: z.number().finite().min(0.6).max(10).optional(),
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
  mediaShape: presentationMediaShapeSchema.optional(),
  mediaCornerRadius: z.number().finite().min(0).max(1_000).optional(),
  imagePositionX: z.number().finite().min(0).max(100).optional(),
  imagePositionY: z.number().finite().min(0).max(100).optional(),
  imageZoom: z.number().finite().min(0.5).max(3).optional(),
  imagePrompt: z.string().max(4_000).optional(),
  imageModelId: z.string().max(256).optional(),
  imageReferenceUrls: z.array(z.string().max(2_048)).max(5).optional(),
  imageExtraParams: z.record(z.unknown()).optional(),
  svgContent: z.string().max(8_192).optional(),
  svgColor: z.string().max(32).optional(),
  mediaMotion: presentationMediaMotionSchema.optional(),
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
  videoPrompt: z.string().max(4_000).optional(),
  videoModelId: z.string().max(256).optional(),
  videoReferenceUrls: z.array(z.string().max(2_048)).max(5).optional(),
  videoFit: z.enum(["contain", "cover", "fill"]).optional(),
  mediaShape: presentationMediaShapeSchema.optional(),
  mediaCornerRadius: z.number().finite().min(0).max(1_000).optional(),
  videoPositionX: z.number().finite().min(0).max(100).optional(),
  videoPositionY: z.number().finite().min(0).max(100).optional(),
  videoZoom: z.number().finite().min(0.5).max(3).optional(),
  videoExtraParams: z.record(z.unknown()).optional(),
  mediaMotion: presentationMediaMotionSchema.optional(),
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

export const presentationComponentSlotTypeSchema = z.enum([
  "text",
  "image",
  "video",
  "icon",
  "list",
]);

export const presentationComponentTextSlotBindingSchema = z.object({
  slotId: z.string().min(1).max(64),
  type: z.literal("text"),
  text: z.string().max(10_000),
}).strict();

export const presentationComponentImageSlotBindingSchema = z.object({
  slotId: z.string().min(1).max(64),
  type: z.literal("image"),
  src: z.string().max(4_096),
  alt: z.string().max(512).optional(),
}).strict();

export const presentationComponentVideoSlotBindingSchema = z.object({
  slotId: z.string().min(1).max(64),
  type: z.literal("video"),
  src: z.string().max(4_096),
  poster: z.string().max(4_096).optional(),
  title: z.string().max(512).optional(),
}).strict();

export const presentationComponentIconSlotBindingSchema = z.object({
  slotId: z.string().min(1).max(64),
  type: z.literal("icon"),
  name: z.string().min(1).max(128),
  src: z.string().max(4_096).optional(),
}).strict();

export const presentationComponentListSlotBindingSchema = z.object({
  slotId: z.string().min(1).max(64),
  type: z.literal("list"),
  items: z.array(z.string().max(2_000)).max(20),
}).strict();

export const presentationComponentSlotBindingSchema = z.discriminatedUnion("type", [
  presentationComponentTextSlotBindingSchema,
  presentationComponentImageSlotBindingSchema,
  presentationComponentVideoSlotBindingSchema,
  presentationComponentIconSlotBindingSchema,
  presentationComponentListSlotBindingSchema,
]);

export const presentationPreviewTargetSchema = z.enum([
  "editor-thumb",
  "library-card",
  "share-image",
  "export-thumb",
]);

export const presentationPreviewArtifactStatusSchema = z.enum([
  "queued",
  "rendering",
  "ready",
  "failed",
  "stale",
]);

export const presentationPreviewArtifactSchema = z.object({
  previewHash: z.string().min(1).max(128),
  target: presentationPreviewTargetSchema,
  status: presentationPreviewArtifactStatusSchema,
  artifactUri: z.string().max(4_096).optional(),
  rendererVersion: z.string().min(1).max(64),
  fontCatalogVersion: z.number().int().positive(),
  definitionRevision: z.number().int().positive(),
  staleReason: z.string().max(256).optional(),
  createdAt: z.string().min(1).max(64),
  updatedAt: z.string().min(1).max(64),
  attemptCount: z.number().int().min(0).max(100).default(0),
}).strict();

export const presentationComponentInstanceSchema = z.object({
  id: z.string().min(1).max(128),
  componentId: z.string().min(1).max(128),
  componentType: z.string().min(1).max(128),
  definitionRevision: z.number().int().positive(),
  slotBindings: z.array(presentationComponentSlotBindingSchema).max(32).default([]),
  fallbackElements: z.array(presentationSlideElementSchema).max(PRESENTATION_LIMITS.maxElementsPerSlide).default([]),
  preview: presentationPreviewArtifactSchema.optional(),
}).strict();

export const presentationRenderableOrderEntrySchema = z.string()
  .min(1)
  .max(192)
  .regex(/^(element|component):.+$/);

export const presentationPendingMediaJobSchema = z.object({
  id: z.string().min(1).max(128),
  mediaType: z.enum(["image", "video"]),
  mediaTaskId: z.string().min(1).max(256),
  providerTaskId: z.string().max(256).optional(),
  billingStage: z.enum(["submit", "poll"]).optional(),
  targetElementId: z.string().max(128).optional(),
  targetSlotId: z.string().max(64).optional(),
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

export const presentationAIDesignCandidateSchema = z.object({
  recipeId: z.string().min(1).max(128),
  score: z.number().finite().min(0).max(1000),
}).strict();

export const presentationAIDesignModeCandidateSchema = z.object({
  mode: presentationAILayoutModeSchema,
  score: z.number().finite().min(-100).max(100),
  fitStatus: z.enum(["fits", "cramped", "unsafe"]).optional(),
  reason: z.string().min(1).max(512).optional(),
  blockedBy: presentationAILayoutModeBlockedBySchema.optional(),
}).strict();

export const presentationAINarrativeSectionSchema = z.object({
  heading: z.string().min(1).max(180),
  details: z.array(z.string().min(1).max(260)).min(1).max(4),
}).strict();

export const presentationAINarrativeSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.array(z.string().min(1).max(260)).min(1).max(10),
  notes: z.string().min(1).max(5000).optional(),
  sections: z.array(presentationAINarrativeSectionSchema).min(1).max(6).optional(),
  mediaPlan: z.array(z.object({
    slotId: z.string().min(1).max(64),
    prompt: z.string().min(1).max(500),
  }).strict()).max(8).optional(),
  graphicCategory: z.string().min(1).max(120).optional(),
  templateId: z.string().min(1).max(128).optional(),
}).strict();

export const presentationAIDesignOverrideHistorySchema = z.object({
  recipeId: z.string().min(1).max(128),
  previousRecipeId: z.string().min(1).max(128).optional(),
  appliedAt: z.string().min(1).max(64),
  source: z.enum(["editor"]),
}).strict();

export const presentationAIDesignFitScoreSchema = z.object({
  overall: z.number().finite().min(0).max(1),
  density: z.number().finite().min(0).max(1),
  readability: z.number().finite().min(0).max(1),
  overflowRisk: z.number().finite().min(0).max(1),
  deckConsistency: z.number().finite().min(0).max(1).optional(),
  status: z.enum(["fits", "cramped", "unsafe"]),
}).strict();

export const presentationAIDesignSourceTraceSchema = z.object({
  sourceId: z.string().min(1).max(128),
  sourceType: z.enum(["heading", "subheading", "paragraph", "bullet", "section"]),
  sourceExcerpt: z.string().min(1).max(512).optional(),
  disposition: z.enum(["used", "shortened", "omitted", "deferred", "split"]),
  targetSlotId: z.string().min(1).max(128).optional(),
  targetSlideId: z.string().min(1).max(128).optional(),
  notes: z.string().min(1).max(512).optional(),
}).strict();

export const presentationAIDesignFallbackHistorySchema = z.object({
  step: z.enum([
    "retry_compaction",
    "switch_recipe",
    "switch_mode",
    "split_slide",
    "blocked_locked_mode",
    "blocked_safety_policy",
    "blocked_provider_policy",
  ]),
  from: z.string().min(1).max(128).optional(),
  to: z.string().min(1).max(128).optional(),
  reason: z.string().min(1).max(512),
  timestamp: z.string().min(1).max(64),
}).strict();

export const presentationAIDesignMediaModeMetadataSchema = z.object({
  provider: z.string().min(1).max(128).optional(),
  modelId: z.string().min(1).max(128).optional(),
  promptVersion: z.string().min(1).max(128).optional(),
  visualIntent: z.enum(["cover", "poster", "infographic", "summary_visual"]).optional(),
  thaiTextRisk: z.enum(["low", "medium", "high"]).optional(),
  reviewRequired: z.boolean().optional(),
  editableSourceRetained: z.boolean(),
}).strict();

export const presentationSlideAIDesignSchema = z.object({
  source: z.literal("draft-with-ai"),
  taskId: z.string().min(1).max(128).optional(),
  schemaVersion: z.literal("presentation_ai_layout_v1").optional(),
  mode: presentationAILayoutModeSchema.optional(),
  candidateModes: z.array(presentationAIDesignModeCandidateSchema).max(8).optional(),
  modeLocked: z.boolean().optional(),
  userOverrideMode: presentationAILayoutModeSchema.nullable().optional(),
  fitScore: presentationAIDesignFitScoreSchema.optional(),
  compactionLevel: z.enum(["none", "balanced", "compact", "aggressive"]).optional(),
  componentRecipeId: z.string().min(1).max(128).optional(),
  selectionMode: z.enum(["llm", "heuristic", "manual-override", "none"]),
  selectionReason: z.string().min(1).max(512).optional(),
  candidateRecipes: z.array(presentationAIDesignCandidateSchema).max(8).optional(),
  narrative: presentationAINarrativeSchema.optional(),
  overrideHistory: z.array(presentationAIDesignOverrideHistorySchema).max(16).optional(),
  sourceTrace: z.array(presentationAIDesignSourceTraceSchema).max(64).optional(),
  fallbackHistory: z.array(presentationAIDesignFallbackHistorySchema).max(32).optional(),
  mediaModeMetadata: presentationAIDesignMediaModeMetadataSchema.optional(),
  generatedAt: z.string().min(1).max(64).optional(),
}).strict();

export const presentationSlideBackgroundSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("color"), value: z.string().min(1).max(64) }),
  z.object({ type: z.literal("image"), url: z.string().min(1).max(500), libraryItemId: z.number().int().positive().optional() }),
]);

export const presentationSlideContentSchema = z.object({
  elements: z.array(presentationSlideElementSchema).max(PRESENTATION_LIMITS.maxElementsPerSlide),
  components: z.array(presentationComponentInstanceSchema).max(64).optional(),
  renderOrder: z.array(presentationRenderableOrderEntrySchema).max(PRESENTATION_LIMITS.maxElementsPerSlide + 64).optional(),
  canvas: presentationCanvasSizeSchema.optional(),
  transition: presentationTransitionSchema.optional(),
  durationMs: z.number().finite().min(250).max(120_000).optional(),
  pendingMediaJobs: z.array(presentationPendingMediaJobSchema).max(32).optional(),
  background: presentationSlideBackgroundSchema.optional(),
  visualOnly: z.boolean().optional(),
  aiDesign: presentationSlideAIDesignSchema.optional(),
}).strict();

/** Audio extracted from an unmuted video element on the slide, for mixing into MP4 export. */
export const videoElementAudioTrackSchema = z.object({
  url: z.string().min(1).max(4_096),
  volume: z.number().finite().min(0).max(1).default(1),
}).strict();

export const presentationSlideshowSlideSchema = z.object({
  slideId: z.number().int().positive(),
  orderIndex: z.number().int().nonnegative(),
  title: z.string().min(1).max(255),
  durationMs: z.number().int().min(250).max(120_000),
  transition: presentationTransitionSchema,
  /** Resolved audio track for this slide. Only present in getPlayDeck response, not in export flows. */
  audioTrack: resolvedAudioTrackSchema.nullable().optional(),
  /** Audio from unmuted video elements on this slide. Mixed into MP4 export by FFmpeg. */
  videoElementAudioTracks: z.array(videoElementAudioTrackSchema).max(4).optional(),
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
  warningContractVersion: z.literal(PRESENTATION_WARNING_CONTRACT_VERSION).optional(),
  deckId: z.number().int().positive(),
  /** Export format — png and jpg produce zip archives of per-slide images */
  format: z.enum(["png", "jpg", "pdf", "mp4"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive().max(120),
  /** Quality preset — only meaningful for mp4 and jpg formats */
  quality: z.enum(["draft", "standard", "high"]).optional(),
  slides: z.array(presentationSlideshowSlideSchema).max(500),
  /** True when at least one slide contains a video element and MP4 needs dynamic capture. */
  hasDynamicVideo: z.boolean().optional(),
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
export type PresentationMediaMotionPreset = z.infer<typeof presentationMediaMotionPresetSchema>;
export type PresentationMediaMotionEasing = z.infer<typeof presentationMediaMotionEasingSchema>;
export type PresentationMediaMotionTimingMode = z.infer<typeof presentationMediaMotionTimingModeSchema>;
export type PresentationMediaMotionSegment = z.infer<typeof presentationMediaMotionSegmentSchema>;
export type PresentationMediaMotion = z.infer<typeof presentationMediaMotionSchema>;
export type PresentationMediaShape = z.infer<typeof presentationMediaShapeSchema>;
export type PresentationSlideElement = z.infer<typeof presentationSlideElementSchema>;
export type PresentationComponentSlotType = z.infer<typeof presentationComponentSlotTypeSchema>;
export type PresentationComponentTextSlotBinding = z.infer<typeof presentationComponentTextSlotBindingSchema>;
export type PresentationComponentImageSlotBinding = z.infer<typeof presentationComponentImageSlotBindingSchema>;
export type PresentationComponentVideoSlotBinding = z.infer<typeof presentationComponentVideoSlotBindingSchema>;
export type PresentationComponentIconSlotBinding = z.infer<typeof presentationComponentIconSlotBindingSchema>;
export type PresentationComponentListSlotBinding = z.infer<typeof presentationComponentListSlotBindingSchema>;
export type PresentationComponentSlotBinding = z.infer<typeof presentationComponentSlotBindingSchema>;
export type PresentationPreviewTarget = z.infer<typeof presentationPreviewTargetSchema>;
export type PresentationPreviewArtifactStatus = z.infer<typeof presentationPreviewArtifactStatusSchema>;
export type PresentationPreviewArtifact = z.infer<typeof presentationPreviewArtifactSchema>;
export type PresentationComponentInstance = z.infer<typeof presentationComponentInstanceSchema>;
export type PresentationRenderableOrderEntry = z.infer<typeof presentationRenderableOrderEntrySchema>;
export type PresentationPendingMediaJob = z.infer<typeof presentationPendingMediaJobSchema>;
export type PresentationAIDesignCandidate = z.infer<typeof presentationAIDesignCandidateSchema>;
export type PresentationAIDesignModeCandidate = z.infer<typeof presentationAIDesignModeCandidateSchema>;
export type PresentationAIDesignOverrideHistory = z.infer<typeof presentationAIDesignOverrideHistorySchema>;
export type PresentationAIDesignFitScore = z.infer<typeof presentationAIDesignFitScoreSchema>;
export type PresentationAIDesignSourceTrace = z.infer<typeof presentationAIDesignSourceTraceSchema>;
export type PresentationAIDesignFallbackHistory = z.infer<typeof presentationAIDesignFallbackHistorySchema>;
export type PresentationAIDesignMediaModeMetadata = z.infer<typeof presentationAIDesignMediaModeMetadataSchema>;
export type PresentationAINarrativeSection = z.infer<typeof presentationAINarrativeSectionSchema>;
export type PresentationAINarrative = z.infer<typeof presentationAINarrativeSchema>;
export type PresentationSlideAIDesign = z.infer<typeof presentationSlideAIDesignSchema>;
export type PresentationSlideBackground = z.infer<typeof presentationSlideBackgroundSchema>;
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

export interface PresentationCompatibilityExpansionResult {
  slideContent: PresentationSlideContent;
  warnings: string[];
}

export interface PresentationRenderableElementsResult {
  elements: PresentationSlideElement[];
  warnings: string[];
}

export interface PresentationResolvedRenderOrderResult {
  order: PresentationRenderableOrderEntry[];
  warnings: string[];
}

export function presentationRenderOrderIdForElement(elementId: string): PresentationRenderableOrderEntry {
  return `element:${elementId}`;
}

export function presentationRenderOrderIdForComponent(componentId: string): PresentationRenderableOrderEntry {
  return `component:${componentId}`;
}

function extractRenderableOrderId(
  entry: PresentationRenderableOrderEntry,
): { kind: "element" | "component"; id: string } | null {
  if (entry.startsWith("element:")) {
    return { kind: "element", id: entry.slice("element:".length) };
  }
  if (entry.startsWith("component:")) {
    return { kind: "component", id: entry.slice("component:".length) };
  }
  return null;
}

export function resolvePresentationSlideRenderOrder(
  slideContent: PresentationSlideContent,
): PresentationResolvedRenderOrderResult {
  const defaultOrder: PresentationRenderableOrderEntry[] = [
    ...(slideContent.components ?? []).map((component) => presentationRenderOrderIdForComponent(component.id)),
    ...slideContent.elements.map((element) => presentationRenderOrderIdForElement(element.id)),
  ];
  const sourceOrder = slideContent.renderOrder ?? defaultOrder;
  const validElementIds = new Set(slideContent.elements.map((element) => element.id));
  const validComponentIds = new Set((slideContent.components ?? []).map((component) => component.id));
  const warnings: string[] = [];
  const seen = new Set<PresentationRenderableOrderEntry>();
  const normalized: PresentationRenderableOrderEntry[] = [];

  for (const entry of sourceOrder) {
    if (seen.has(entry)) {
      warnings.push(`render_order_duplicate:${entry}`);
      continue;
    }
    const parsed = extractRenderableOrderId(entry);
    if (!parsed) {
      warnings.push(`render_order_invalid:${entry}`);
      continue;
    }
    const isValid = parsed.kind === "element"
      ? validElementIds.has(parsed.id)
      : validComponentIds.has(parsed.id);
    if (!isValid) {
      warnings.push(`render_order_missing_ref:${entry}`);
      continue;
    }
    seen.add(entry);
    normalized.push(entry);
  }

  for (const entry of defaultOrder) {
    if (!seen.has(entry)) {
      normalized.push(entry);
      seen.add(entry);
    }
  }

  return {
    order: normalized,
    warnings,
  };
}

export function getPresentationSlideRenderableElements(
  slideContent: PresentationSlideContent,
): PresentationRenderableElementsResult {
  const { order, warnings } = resolvePresentationSlideRenderOrder(slideContent);
  const renderable: PresentationSlideElement[] = [];
  const elementById = new Map(slideContent.elements.map((element) => [element.id, element] as const));
  const componentById = new Map((slideContent.components ?? []).map((component) => [component.id, component] as const));

  for (const entry of order) {
    const parsed = extractRenderableOrderId(entry);
    if (!parsed) {
      continue;
    }

    if (parsed.kind === "element") {
      const element = elementById.get(parsed.id);
      if (element) {
        renderable.push(element);
      }
      continue;
    }

    const component = componentById.get(parsed.id);
    if (!component) {
      continue;
    }
    if (!component.fallbackElements || component.fallbackElements.length === 0) {
      warnings.push(`component_fallback_missing:${component.id}`);
      continue;
    }
    renderable.push(...component.fallbackElements);
  }

  return {
    elements: renderable,
    warnings,
  };
}

export function expandPresentationSlideContentForCompatibility(
  slideContent: PresentationSlideContent,
): PresentationCompatibilityExpansionResult {
  const renderable = getPresentationSlideRenderableElements(slideContent);

  return {
    slideContent: {
      ...slideContent,
      elements: renderable.elements,
      components: slideContent.components?.length ? undefined : slideContent.components,
      renderOrder: renderable.elements.map((element) => presentationRenderOrderIdForElement(element.id)),
    },
    warnings: renderable.warnings,
  };
}

export function isPresentationItemType(itemType: string): boolean {
  return itemType.trim().toLowerCase() === PRESENTATION_ITEM_TYPE;
}
