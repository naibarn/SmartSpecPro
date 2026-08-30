import { z } from "zod";
import type { VerticalDramaArtifactAssuranceLineage } from "./assurance";

export const VISUAL_MEDIA_TYPES = ["image", "video"] as const;
export type VisualMediaType = (typeof VISUAL_MEDIA_TYPES)[number];

export const VISUAL_MEDIA_ORIGINS = [
  "ai_generated",
  "user_upload",
  "web_import",
  "existing_managed",
] as const;
export type VisualMediaOrigin = (typeof VISUAL_MEDIA_ORIGINS)[number];

export const VISUAL_SEMANTIC_ROLES = [
  "scene_anchor",
  "reference",
  "b_roll_still",
  "b_roll_footage",
  "graphic",
  "text_overlay",
] as const;
export type VisualSemanticRole = (typeof VISUAL_SEMANTIC_ROLES)[number];

export const VISUAL_EVIDENCE_STATUSES = [
  "not_applicable",
  "illustrative",
  "needs_verification",
  "partially_verified",
  "verified",
  "stale",
  "contradictory",
  "blocked",
] as const;
export type VisualEvidenceStatus = (typeof VISUAL_EVIDENCE_STATUSES)[number];

export const VISUAL_AUDIO_POLICIES = ["keep", "mute", "replace"] as const;
export type VisualAudioPolicy = (typeof VISUAL_AUDIO_POLICIES)[number];

export const VISUAL_FIT_MODES = ["cover", "contain", "crop_safe"] as const;
export type VisualFitMode = (typeof VISUAL_FIT_MODES)[number];

const boundedId = z.string().trim().min(1).max(128);
const boundedText = z.string().trim().max(5000);
const finiteSeconds = z.number().finite().min(0).max(86_400);

export const sourceMediaSegmentSchema = z
  .object({
    segmentId: boundedId,
    sourceAssetId: z.number().int().positive(),
    revision: z.number().int().positive(),
    mediaType: z.enum(VISUAL_MEDIA_TYPES),
    inSeconds: finiteSeconds.nullable().default(null),
    outSeconds: finiteSeconds.nullable().default(null),
    displayDurationSeconds: finiteSeconds.nullable().default(null),
    label: z.string().trim().min(1).max(180),
    description: boundedText.nullable().default(null),
    evidenceScope: z.array(boundedId).max(32).default([]),
    captureAt: z.string().datetime().nullable().default(null),
    locationLabel: z.string().trim().max(240).nullable().default(null),
    sourceLabel: z.string().trim().max(240).nullable().default(null),
    audioPolicy: z.enum(VISUAL_AUDIO_POLICIES).default("keep"),
    status: z.enum(["draft", "ready", "stale", "blocked"]).default("draft"),
  })
  .superRefine((value, ctx) => {
    if (value.mediaType === "video") {
      if (value.inSeconds == null || value.outSeconds == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inSeconds"],
          message: "Video segments require finite in/out bounds",
        });
      } else if (value.outSeconds <= value.inSeconds) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["outSeconds"],
          message: "Video outSeconds must be greater than inSeconds",
        });
      }
      if (value.displayDurationSeconds != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["displayDurationSeconds"],
          message: "Video segments use source in/out instead of still duration",
        });
      }
    } else if (value.inSeconds != null || value.outSeconds != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inSeconds"],
        message: "Still media cannot use video time bounds",
      });
    }
  });
export type SourceMediaSegment = z.infer<typeof sourceMediaSegmentSchema>;

export const visualSourceSlotSchema = z.object({
  slotId: boundedId,
  slotKey: z.string().trim().min(1).max(96),
  title: z.string().trim().min(1).max(180),
  description: boundedText.nullable().default(null),
  semanticRole: z.enum(VISUAL_SEMANTIC_ROLES),
  mediaType: z.enum(VISUAL_MEDIA_TYPES),
  origin: z.enum(VISUAL_MEDIA_ORIGINS),
  evidenceStatus: z.enum(VISUAL_EVIDENCE_STATUSES),
  sourceAssetId: z.number().int().positive().nullable().default(null),
  mediaAssetId: z.number().int().positive().nullable().default(null),
  segmentIds: z.array(boundedId).max(32).default([]),
  rightsStatus: z.string().trim().max(32).default("pending"),
  disclosureStatus: z.string().trim().max(32).default("not_required"),
  factualScope: z.array(boundedId).max(32).default([]),
  required: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(100_000).default(0),
});
export type VisualSourceSlot = z.infer<typeof visualSourceSlotSchema>;

export const visualCoverageRequirementSchema = z.object({
  requirementId: boundedId,
  scope: z.enum(["series", "episode", "scene", "shot", "claim"]),
  scopeKey: boundedId,
  description: z.string().trim().min(1).max(500),
  allowedRoles: z.array(z.enum(VISUAL_SEMANTIC_ROLES)).min(1).max(6),
  allowedMediaTypes: z.array(z.enum(VISUAL_MEDIA_TYPES)).min(1).max(2),
  requiredEvidence: z
    .enum(["none", "illustrative", "needs_verification", "verified"])
    .default("none"),
  required: z.boolean().default(false),
  fulfilledBySlotIds: z.array(boundedId).max(32).default([]),
});
export type VisualCoverageRequirement = z.infer<
  typeof visualCoverageRequirementSchema
>;

export const visualCoverageFindingSchema = z.object({
  code: boundedId,
  severity: z.enum(["info", "warning", "blocking"]),
  message: z.string().trim().min(1).max(500),
  requirementId: boundedId.nullable().default(null),
  slotId: boundedId.nullable().default(null),
  claimId: boundedId.nullable().default(null),
});
export type VisualCoverageFinding = z.infer<typeof visualCoverageFindingSchema>;

export const visualSourceSnapshotSchema = z.object({
  snapshotId: boundedId,
  revision: z.number().int().positive(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  packId: z.number().int().positive(),
  seriesId: z.number().int().positive().nullable().default(null),
  profileId: z.string().trim().min(1).max(96),
  profileVersion: z.number().int().positive(),
  slots: z.array(visualSourceSlotSchema).max(256),
  segments: z.array(sourceMediaSegmentSchema).max(512),
  coverage: z.array(visualCoverageRequirementSchema).max(512),
  capturedAt: z.string().datetime(),
});
export type VisualSourceSnapshot = z.infer<typeof visualSourceSnapshotSchema>;

export const visualUsageRefSchema = z.object({
  usageId: boundedId,
  slotId: boundedId,
  semanticRole: z.enum(VISUAL_SEMANTIC_ROLES),
  mediaType: z.enum(VISUAL_MEDIA_TYPES),
  sourceAssetId: z.number().int().positive().nullable().default(null),
  mediaAssetId: z.number().int().positive().nullable().default(null),
  segmentId: boundedId.nullable().default(null),
  segmentRevision: z.number().int().positive().nullable().default(null),
  inSeconds: finiteSeconds.nullable().default(null),
  outSeconds: finiteSeconds.nullable().default(null),
  displayDurationSeconds: finiteSeconds.nullable().default(null),
  audioPolicy: z.enum(VISUAL_AUDIO_POLICIES).default("keep"),
  labelMode: z
    .enum(["none", "source", "archive", "ai_illustration"])
    .default("none"),
  snapshotRevision: z.number().int().positive(),
  snapshotFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type VisualUsageRef = z.infer<typeof visualUsageRefSchema>;

export const shotBrollBindingSchema = z.object({
  bindingId: boundedId,
  episodeId: z.number().int().positive(),
  shotNumber: z.number().int().positive(),
  usage: visualUsageRefSchema,
  order: z.number().int().min(0).max(100_000),
  fitMode: z.enum(VISUAL_FIT_MODES).default("cover"),
  active: z.boolean().default(true),
  status: z.enum(["draft", "ready", "stale", "blocked"]).default("draft"),
  /** Additive JSONB projection; legacy bindings omit it. */
  assuranceLineage: z.unknown().optional(),
});
export type ShotBrollBinding = Omit<z.infer<typeof shotBrollBindingSchema>, "assuranceLineage"> & {
  assuranceLineage?: VerticalDramaArtifactAssuranceLineage;
};
