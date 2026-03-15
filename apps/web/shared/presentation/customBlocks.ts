import { z } from "zod";

import { BUILT_IN_PRESENTATION_COMPONENT_IDS } from "./componentRecipes";
import {
  presentationCanvasSizeSchema,
  presentationComponentSlotBindingSchema,
  presentationSlideBackgroundSchema,
  presentationSlideElementSchema,
} from "./contracts";

export const PRESENTATION_CUSTOM_BLOCK_OUTPUT_FORMAT = "presentation_custom_block_v1";
export const PRESENTATION_CUSTOM_BLOCK_SKILL_SLUG = "presentation-custom-block";
export const PRESENTATION_CUSTOM_BLOCK_PREVIEW_RENDERER_VERSION = "server-svg-v1";
export const PRESENTATION_PREVIEW_CACHE_SKILL_SLUG = "presentation-preview-cache";
export const PRESENTATION_PREVIEW_CACHE_OUTPUT_FORMAT = "presentation_preview_svg_v1";
export const PRESENTATION_CUSTOM_BLOCK_GOVERNANCE_SKILL_SLUG = "presentation-custom-block-governance";
export const PRESENTATION_CUSTOM_BLOCK_GOVERNANCE_OUTPUT_FORMAT = "presentation_custom_block_governance_v1";

export const presentationCustomBlockVisibilitySchema = z.enum(["private", "team"]);

export const presentationCustomBlockPreviewSchema = z.object({
  artifactKey: z.string().trim().min(1).max(512),
  artifactUrl: z.string().trim().min(1).max(8192),
  previewHash: z.string().trim().min(1).max(128),
  rendererVersion: z.string().trim().min(1).max(64),
  generatedAt: z.string().trim().min(1).max(64),
}).strict();

export const presentationCustomBlockPreviewSourceSchema = z.object({
  canvas: presentationCanvasSizeSchema,
  fallbackElements: z.array(presentationSlideElementSchema).max(128),
  background: presentationSlideBackgroundSchema.optional(),
}).strict();

export const presentationCustomBlockGovernanceEventSchema = z.object({
  eventType: z.enum([
    "visibility_changed",
    "pinned_changed",
    "featured_changed",
    "ownership_transferred",
  ]),
  actorUserId: z.number().int().positive(),
  actorRole: z.string().trim().min(1).max(64),
  recordedAt: z.string().trim().min(1).max(64),
  detail: z.string().trim().min(1).max(240).optional(),
}).strict();

export const presentationCustomBlockRecordSchema = z.object({
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).default(""),
  category: z.literal("Custom").default("Custom"),
  componentId: z.enum(BUILT_IN_PRESENTATION_COMPONENT_IDS),
  slotBindings: z.array(presentationComponentSlotBindingSchema).max(32),
  savedAt: z.string().trim().min(1).max(64),
  visibility: presentationCustomBlockVisibilitySchema.default("private"),
  isPinned: z.boolean().default(false),
  isTeamFeatured: z.boolean().default(false),
  usageCount: z.number().int().nonnegative().default(0),
  lastUsedAt: z.string().trim().min(1).max(64).optional(),
  favoriteUserIds: z.array(z.number().int().positive()).max(128).default([]),
  preview: presentationCustomBlockPreviewSchema.optional(),
  previewSource: presentationCustomBlockPreviewSourceSchema.optional(),
  governanceEvents: z.array(presentationCustomBlockGovernanceEventSchema).max(32).default([]),
}).strict();

export const presentationCustomBlockCreateInputSchema = z.object({
  label: z.string().trim().min(1).max(120),
  description: z.string().trim().max(240).default(""),
  componentId: z.enum(BUILT_IN_PRESENTATION_COMPONENT_IDS),
  slotBindings: z.array(presentationComponentSlotBindingSchema).max(32),
  visibility: presentationCustomBlockVisibilitySchema.default("private"),
  previewSource: presentationCustomBlockPreviewSourceSchema,
}).strict();

export const presentationCustomBlockDeleteInputSchema = z.object({
  blockId: z.string().trim().min(1).max(64),
}).strict();

export const presentationCustomBlockListScopeSchema = z.enum(["all", "mine", "team"]);
export const presentationCustomBlockListSortSchema = z.enum(["featured", "newest", "a_z", "most_used", "recent_activity"]);

export const presentationCustomBlockListInputSchema = z.object({
  scope: presentationCustomBlockListScopeSchema.default("all"),
  search: z.string().trim().max(120).optional(),
  sort: presentationCustomBlockListSortSchema.default("featured"),
  limit: z.number().int().min(1).max(200).default(100),
}).strict();

export const presentationCustomBlockUpdateInputSchema = z.object({
  blockId: z.string().trim().min(1).max(64),
  visibility: presentationCustomBlockVisibilitySchema.optional(),
  isPinned: z.boolean().optional(),
  isTeamFeatured: z.boolean().optional(),
  favorite: z.boolean().optional(),
  transferToUserId: z.number().int().positive().optional(),
}).strict().refine((value) => (
  value.visibility !== undefined
  || value.isPinned !== undefined
  || value.isTeamFeatured !== undefined
  || value.favorite !== undefined
  || value.transferToUserId !== undefined
), "At least one custom block update field is required.");

export const presentationCustomBlockTrackUseInputSchema = z.object({
  blockId: z.string().trim().min(1).max(64),
}).strict();

export const presentationCustomBlockRenderPreviewInputSchema = z.object({
  previewSource: presentationCustomBlockPreviewSourceSchema,
}).strict();

export const presentationCustomBlockRenderPreviewResultSchema = presentationCustomBlockPreviewSchema.extend({
  svg: z.string().trim().min(1),
}).strict();

export const presentationPreviewCacheRecordSchema = z.object({
  previewHash: z.string().trim().min(1).max(128),
  rendererVersion: z.string().trim().min(1).max(64),
  artifactKey: z.string().trim().min(1).max(512),
  artifactUrl: z.string().trim().min(1).max(8192),
  generatedAt: z.string().trim().min(1).max(64),
}).strict();

export const presentationCustomBlockGovernanceAuditInputSchema = z.object({
  search: z.string().trim().max(120).optional(),
  eventType: z.enum(["all", "visibility_changed", "pinned_changed", "featured_changed", "ownership_transferred"]).default("all"),
  limit: z.number().int().min(1).max(200).default(100),
}).strict();

export const presentationCustomBlockGovernanceAuditEntrySchema = z.object({
  blockId: z.string().trim().min(1).max(64),
  blockLabel: z.string().trim().min(1).max(120),
  ownerUserId: z.number().int().positive(),
  visibility: presentationCustomBlockVisibilitySchema,
  eventType: presentationCustomBlockGovernanceEventSchema.shape.eventType,
  actorUserId: z.number().int().positive(),
  actorRole: z.string().trim().min(1).max(64),
  recordedAt: z.string().trim().min(1).max(64),
  detail: z.string().trim().min(1).max(240).optional(),
}).strict();

export const presentationCustomBlockGovernanceAuditRecordSchema =
  presentationCustomBlockGovernanceAuditEntrySchema.extend({
    indexedAt: z.string().trim().min(1).max(64),
  }).strict();

export const presentationCustomBlockSchema = presentationCustomBlockRecordSchema.extend({
  id: z.string().trim().min(1).max(64),
  ownerUserId: z.number().int().positive(),
  canDelete: z.boolean().default(false),
  canFeature: z.boolean().default(false),
  canTransferOwnership: z.boolean().default(false),
  isFavorite: z.boolean().default(false),
}).strict();

export type PresentationCustomBlockVisibility = z.infer<typeof presentationCustomBlockVisibilitySchema>;
export type PresentationCustomBlockPreview = z.infer<typeof presentationCustomBlockPreviewSchema>;
export type PresentationCustomBlockPreviewSource = z.infer<typeof presentationCustomBlockPreviewSourceSchema>;
export type PresentationCustomBlockGovernanceEvent = z.infer<typeof presentationCustomBlockGovernanceEventSchema>;
export type PresentationCustomBlockRecord = z.infer<typeof presentationCustomBlockRecordSchema>;
export type PresentationCustomBlockCreateInput = z.infer<typeof presentationCustomBlockCreateInputSchema>;
export type PresentationCustomBlockListInput = z.infer<typeof presentationCustomBlockListInputSchema>;
export type PresentationCustomBlockUpdateInput = z.infer<typeof presentationCustomBlockUpdateInputSchema>;
export type PresentationCustomBlockTrackUseInput = z.infer<typeof presentationCustomBlockTrackUseInputSchema>;
export type PresentationCustomBlockRenderPreviewInput = z.infer<typeof presentationCustomBlockRenderPreviewInputSchema>;
export type PresentationCustomBlockRenderPreviewResult = z.infer<typeof presentationCustomBlockRenderPreviewResultSchema>;
export type PresentationPreviewCacheRecord = z.infer<typeof presentationPreviewCacheRecordSchema>;
export type PresentationCustomBlock = z.infer<typeof presentationCustomBlockSchema>;
export type PresentationCustomBlockGovernanceAuditInput = z.infer<typeof presentationCustomBlockGovernanceAuditInputSchema>;
export type PresentationCustomBlockGovernanceAuditEntry = z.infer<typeof presentationCustomBlockGovernanceAuditEntrySchema>;
export type PresentationCustomBlockGovernanceAuditRecord = z.infer<typeof presentationCustomBlockGovernanceAuditRecordSchema>;
