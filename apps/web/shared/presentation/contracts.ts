import { z } from "zod";

import {
  PRESENTATION_CONFLICT_SCHEMA_VERSION,
  PRESENTATION_COMPATIBILITY_SCHEMA_VERSION,
  PRESENTATION_CONVERSION_SCHEMA_VERSION,
  PRESENTATION_ERROR_CODE_VALUES,
  PRESENTATION_ITEM_TYPE,
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

export type PresentationRouteGuardInput = z.infer<typeof presentationRouteGuardInputSchema>;
export type PresentationRouteAllowedResult = z.infer<typeof presentationRouteAllowedResultSchema>;
export type PresentationRouteBlockedResult = z.infer<typeof presentationRouteBlockedResultSchema>;
export type PresentationRouteGuardResult = z.infer<typeof presentationRouteGuardResultSchema>;
export type PresentationAvailability = z.infer<typeof presentationAvailabilitySchema>;
export type PresentationVersionConflict = z.infer<typeof presentationVersionConflictSchema>;
export type PresentationSourceFormat = z.infer<typeof presentationSourceFormatSchema>;
export type PresentationCompatibilityResult = z.infer<typeof presentationCompatibilityResultSchema>;
export type PresentationConversionResult = z.infer<typeof presentationConversionResultSchema>;

export function isPresentationItemType(itemType: string): boolean {
  return itemType.trim().toLowerCase() === PRESENTATION_ITEM_TYPE;
}
