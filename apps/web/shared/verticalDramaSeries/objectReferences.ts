import { z } from "zod";

/** Shared contract for durable, reusable story objects and commercial tie-ins. */
export const verticalDramaObjectReferenceModeSchema = z.enum([
  "story_object",
  "commercial_tie_in",
]);
export type VerticalDramaObjectReferenceMode = z.infer<
  typeof verticalDramaObjectReferenceModeSchema
>;

export const verticalDramaObjectReferenceSourceSchema = z.enum([
  "manual",
  "uploaded",
  "library",
  "marketplace_capture",
  "generated",
  "legacy_product_tie_in",
]);
export type VerticalDramaObjectReferenceSource = z.infer<
  typeof verticalDramaObjectReferenceSourceSchema
>;

export const verticalDramaObjectReferenceStatusSchema = z.enum([
  "active",
  "archived",
]);
export type VerticalDramaObjectReferenceStatus = z.infer<
  typeof verticalDramaObjectReferenceStatusSchema
>;

export const verticalDramaObjectTypeSchema = z.enum([
  "box",
  "jewelry",
  "document",
  "key",
  "weapon",
  "heirloom",
  "device",
  "other",
]);
export type VerticalDramaObjectType = z.infer<
  typeof verticalDramaObjectTypeSchema
>;

export const verticalDramaObjectAssetRoleSchema = z.enum([
  "canonical",
  "detail",
  "alternate",
]);
export type VerticalDramaObjectAssetRole = z.infer<
  typeof verticalDramaObjectAssetRoleSchema
>;

export const verticalDramaObjectAssetStateSchema = z.enum([
  "active",
  "draft",
  "removed",
]);
export type VerticalDramaObjectAssetState = z.infer<
  typeof verticalDramaObjectAssetStateSchema
>;

export const verticalDramaObjectCapabilityKeySchema = z.enum([
  "objectCatalog",
  "objectDetection",
  "objectImageGeneration",
  "objectLegacyBackfill",
]);
export type VerticalDramaObjectCapabilityKey = z.infer<
  typeof verticalDramaObjectCapabilityKeySchema
>;

export const verticalDramaObjectCapabilitiesSchema = z.object({
  objectCatalog: z.boolean(),
  objectDetection: z.boolean(),
  objectImageGeneration: z.boolean(),
  objectLegacyBackfill: z.boolean(),
});
export type VerticalDramaObjectCapabilities = z.infer<
  typeof verticalDramaObjectCapabilitiesSchema
>;

export const verticalDramaObjectWarningSchema = z.object({
  code: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(500),
  objectReferenceId: z.string().optional(),
  shotNumber: z.number().int().positive().optional(),
  retryable: z.boolean().default(false),
});
export type VerticalDramaObjectWarning = z.infer<
  typeof verticalDramaObjectWarningSchema
>;

export type VerticalDramaObjectReferenceSuggestionView = {
  id: string;
  objectReferenceId: string;
  name: string;
  shotNumber: number;
  confidence: number | null;
  status: string;
  decision: string | null;
  evidenceJson: unknown;
};

export const verticalDramaObjectRevisionSchema = z.number().int().nonnegative();
export const verticalDramaObjectIdempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const verticalDramaObjectReferenceAliasSchema = z
  .string()
  .trim()
  .min(2)
  .max(160);

export const verticalDramaObjectReferenceCreateSchema = z.object({
  seriesId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  canonicalPrompt: z.string().trim().max(4000).optional(),
  mode: verticalDramaObjectReferenceModeSchema.default("story_object"),
  source: verticalDramaObjectReferenceSourceSchema.default("uploaded"),
  objectType: verticalDramaObjectTypeSchema.default("other"),
  narrativeRole: z.string().trim().max(160).optional(),
  continuityNotes: z.string().trim().max(2000).optional(),
  aliases: z.array(verticalDramaObjectReferenceAliasSchema).max(24).optional(),
  commercialTieInEnabled: z.boolean().default(false),
  marketplaceCaptureId: z.string().trim().max(128).optional(),
  marketplaceProductId: z.string().trim().max(128).optional(),
});
export type VerticalDramaObjectReferenceCreate = z.infer<
  typeof verticalDramaObjectReferenceCreateSchema
>;

export const verticalDramaObjectReferenceUpdateSchema = z.object({
  objectReferenceId: z.string().min(1),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  canonicalPrompt: z.string().trim().max(4000).nullable().optional(),
  mode: verticalDramaObjectReferenceModeSchema.optional(),
  objectType: verticalDramaObjectTypeSchema.optional(),
  narrativeRole: z.string().trim().max(160).nullable().optional(),
  continuityNotes: z.string().trim().max(2000).nullable().optional(),
  commercialTieInEnabled: z.boolean().optional(),
  expectedRevision: verticalDramaObjectRevisionSchema.optional(),
  idempotencyKey: verticalDramaObjectIdempotencyKeySchema.optional(),
});

export const verticalDramaObjectReferenceAssetSchema = z.object({
  objectReferenceId: z.string().min(1),
  mediaAssetId: z.string().min(1),
  role: verticalDramaObjectAssetRoleSchema.default("alternate"),
  source: verticalDramaObjectReferenceSourceSchema.default("library"),
  label: z.string().trim().max(160).optional(),
  expectedRevision: verticalDramaObjectRevisionSchema.optional(),
  idempotencyKey: verticalDramaObjectIdempotencyKeySchema.optional(),
});

export const verticalDramaShotObjectReferenceSchema = z.object({
  objectReferenceId: z.string().min(1),
  episodeId: z.string().min(1),
  shotNumber: z.number().int().min(1).max(100),
  assignmentSource: z
    .enum(["manual", "detected", "special_tie_in"])
    .default("manual"),
  confidence: z.number().min(0).max(1).optional(),
  locked: z.boolean().default(false),
  selectedMediaAssetId: z.string().min(1).optional(),
  expectedRevision: verticalDramaObjectRevisionSchema.optional(),
  idempotencyKey: verticalDramaObjectIdempotencyKeySchema.optional(),
});

export function objectReferenceStableKey(input: {
  mode: VerticalDramaObjectReferenceMode;
  marketplaceCaptureId?: string | null;
  marketplaceProductId?: string | null;
  name?: string | null;
}) {
  if (input.mode === "commercial_tie_in" && input.marketplaceCaptureId) {
    return `capture:${input.marketplaceCaptureId}:${input.marketplaceProductId ?? "default"}`;
  }
  return `story:${(input.name ?? "").trim().toLocaleLowerCase()}`;
}

export function normalizeObjectReferenceAlias(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export function normalizeObjectReferenceAliases(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map(normalizeObjectReferenceAlias)
        .filter(value => value.length >= 2)
    )
  ).slice(0, 24);
}

export function objectReferenceContextFingerprint(input: unknown): string {
  const text = JSON.stringify(input, (_key, value) =>
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : value
  );
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function selectObjectReferenceMedia<T extends { id: string | number }>(
  assets: T[],
  maxCount: number
): T[] {
  if (!Number.isSafeInteger(maxCount) || maxCount <= 0) return [];
  return [...assets]
    .sort((left, right) => {
      const roleRank = (asset: T) => {
        const role = (asset as T & { role?: string }).role;
        return role === "canonical" || role === "primary"
          ? 0
          : role === "detail"
            ? 1
            : 2;
      };
      return (
        roleRank(left) - roleRank(right) ||
        String(left.id).localeCompare(String(right.id))
      );
    })
    .slice(0, maxCount);
}

export function objectReferenceWarning(input: {
  code: string;
  message: string;
  objectReferenceId?: string;
  shotNumber?: number;
  retryable?: boolean;
}): VerticalDramaObjectWarning {
  return verticalDramaObjectWarningSchema.parse(input);
}

export function buildObjectReferencePrompt(input: {
  name: string;
  objectType?: string | null;
  description?: string | null;
  continuityNotes?: string | null;
  sceneContext?: string | null;
}): string {
  const parts = [
    `Story-critical prop: ${input.name.trim()}.`,
    input.objectType ? `Object type: ${input.objectType}.` : "",
    input.description?.trim()
      ? `Narrative context: ${input.description.trim()}.`
      : "",
    input.continuityNotes?.trim()
      ? `Continuity lock: ${input.continuityNotes.trim()}.`
      : "Preserve the same shape, material, colors, markings, and distinctive details across shots.",
    input.sceneContext?.trim()
      ? `Current scene context: ${input.sceneContext.trim()}.`
      : "",
  ];
  return parts.filter(Boolean).join(" ");
}
