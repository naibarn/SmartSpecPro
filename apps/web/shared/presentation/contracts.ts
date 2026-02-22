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
  sourceItemId: z.number().int().positive(),
  sourceFormat: z.enum(["pptx", "ppt"]),
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

const presentationElementCoordinateSchema = z.number().finite().min(-100_000).max(100_000);
const presentationElementSizeSchema = z.number().finite().min(0).max(100_000);
const presentationElementOpacitySchema = z.number().finite().min(0).max(1);

export const presentationTextElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("text"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  text: z.string().max(10_000),
  color: z.string().min(1).max(64),
}).strict();

export const presentationImageElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("image"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  src: z.string().max(4_096),
  alt: z.string().max(512),
}).strict();

export const presentationRectElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("rect"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  fill: z.string().min(1).max(64),
}).strict();

export const presentationLineElementSchema = z.object({
  id: z.string().min(1).max(128),
  type: z.literal("line"),
  x: presentationElementCoordinateSchema,
  y: presentationElementCoordinateSchema,
  width: presentationElementSizeSchema,
  height: presentationElementSizeSchema,
  opacity: presentationElementOpacitySchema.optional(),
  stroke: z.string().min(1).max(64),
  strokeWidth: z.number().finite().min(0).max(1_000),
}).strict();

export const presentationSlideElementSchema = z.discriminatedUnion("type", [
  presentationTextElementSchema,
  presentationImageElementSchema,
  presentationRectElementSchema,
  presentationLineElementSchema,
]);

export const presentationSlideContentSchema = z.object({
  elements: z.array(presentationSlideElementSchema).max(PRESENTATION_LIMITS.maxElementsPerSlide),
  transition: presentationTransitionSchema.optional(),
  durationMs: z.number().finite().min(250).max(120_000).optional(),
}).strict();

export const presentationSlideshowSlideSchema = z.object({
  slideId: z.number().int().positive(),
  orderIndex: z.number().int().nonnegative(),
  title: z.string().min(1).max(255),
  durationMs: z.number().int().min(250).max(120_000),
  transition: presentationTransitionSchema,
});

export const presentationSlideshowPayloadSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_SLIDESHOW_SCHEMA_VERSION),
  deckId: z.number().int().positive(),
  generatedAt: z.coerce.date(),
  slides: z.array(presentationSlideshowSlideSchema).max(500),
});

export const presentationRenderSpecSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_RENDER_SCHEMA_VERSION),
  deckId: z.number().int().positive(),
  format: z.enum(["png", "mp4"]),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  slides: z.array(presentationSlideshowSlideSchema).max(500),
});

export const presentationExportStatusSchema = z.enum([
  "queued",
  "processing",
  "done",
  "error",
]);

export const presentationExportResultSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_EXPORT_SCHEMA_VERSION),
  exportId: z.string().min(1).max(128),
  jobId: z.string().min(1).max(128),
  deckId: z.number().int().positive(),
  format: z.enum(["png", "mp4"]),
  deduped: z.boolean(),
  status: presentationExportStatusSchema,
  message: z.string().min(1).max(400).optional(),
  renderSpec: presentationRenderSpecSchema,
});

export const presentationExportStatusResultSchema = z.object({
  schemaVersion: z.literal(PRESENTATION_EXPORT_SCHEMA_VERSION),
  exportId: z.string().min(1).max(128),
  jobId: z.string().min(1).max(128),
  status: presentationExportStatusSchema,
  format: z.enum(["png", "mp4"]),
  updatedAt: z.coerce.date(),
  message: z.string().min(1).max(400).optional(),
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
export type PresentationSlideContent = z.infer<typeof presentationSlideContentSchema>;
export type PresentationExportResult = z.infer<typeof presentationExportResultSchema>;
export type PresentationExportStatusResult = z.infer<typeof presentationExportStatusResultSchema>;

export function isPresentationItemType(itemType: string): boolean {
  return itemType.trim().toLowerCase() === PRESENTATION_ITEM_TYPE;
}
