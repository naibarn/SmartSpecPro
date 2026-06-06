import { z } from "zod";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesChargeSummarySchema,
  HyperframesPollingGuidanceSchema,
  HyperframesRepairActionSchema,
  HyperframesRenderIntentSchema,
  HyperframesRenderStatusProjectionSchema,
  MarketplaceAutoReviewCompositionModeSchema,
  MarketplaceAutoReviewLaunchModeSchema,
} from "./contracts";
import {
  HyperframesAutoPlanOverrideInputSchema,
  HyperframesAutoStoryboardReviewPlanSchema,
} from "./autoPlan";
import { HyperframesFeatureAccessProjectionSchema } from "./featureAccess";
import { HyperframesTemplateDescriptorSchema } from "./contracts";

const ProductIdInputSchema = z.object({
  productId: z.string().min(1).max(64),
});

export const GetAutoStoryboardReviewPlanInputSchema = ProductIdInputSchema.extend({
  includeTemplates: z.boolean().optional().default(false),
  overrides: HyperframesAutoPlanOverrideInputSchema.optional().default({}),
}).strict();

export const GetAutoStoryboardReviewPlanOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    access: HyperframesFeatureAccessProjectionSchema,
    plan: HyperframesAutoStoryboardReviewPlanSchema,
    templates: z.array(HyperframesTemplateDescriptorSchema).default([]),
  })
  .strict();

export const StartAutoStoryboardReviewInputSchema = ProductIdInputSchema.extend({
  expectedPlanHash: z.string().min(6).max(128).optional(),
  idempotencyKey: z.string().min(1).max(192).optional(),
  overrides: HyperframesAutoPlanOverrideInputSchema.optional().default({}),
  referenceAnchors: z
    .object({
      schemaVersion: z.number().int().positive().optional(),
      creationIntent: z
        .enum(["storyboard", "video", "auto_review_video"])
        .optional()
        .nullable(),
      characterMode: z
        .enum([
          "product_only",
          "hands_only",
          "described_character",
          "uploaded_reference",
        ])
        .optional(),
      characterBrief: z.string().min(1).max(2000).optional(),
      characterPreset: z
        .union([
          z.string().max(4000),
          z.record(z.unknown()),
          z.array(z.unknown()),
        ])
        .optional(),
      requiredRoles: z
        .array(z.enum(["product", "character", "environment"]))
        .optional(),
      lockPolicy: z.record(z.unknown()).optional(),
      productImageUrl: z.string().min(1).max(4096),
      productImageId: z.string().max(160).optional().nullable(),
      productImageRef: z.string().max(512).optional().nullable(),
      productImageSource: z.string().max(128).optional().nullable(),
      productImageSourceUrl: z.string().max(4096).optional().nullable(),
      productImageStorageKey: z.string().max(1024).optional().nullable(),
      productImageHash: z.string().max(256).optional().nullable(),
      productImageIndex: z.number().int().optional().nullable(),
      auditMetadata: z.record(z.unknown()).optional(),
      fileEvidence: z.record(z.unknown()).optional(),
      sourceRefs: z.array(z.string().min(1).max(512)).optional(),
    })
    .passthrough()
    .optional()
    .nullable(),
}).strict();

export const StartAutoStoryboardReviewOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    launchMode: MarketplaceAutoReviewLaunchModeSchema,
    plan: HyperframesAutoStoryboardReviewPlanSchema,
    run: z.record(z.unknown()).nullable().optional(),
    render: HyperframesRenderStatusProjectionSchema.nullable().optional(),
    chargeSummary: HyperframesChargeSummarySchema,
    polling: HyperframesPollingGuidanceSchema,
    invalidates: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const CreateHyperframesPreviewInputSchema = z
  .object({
    productId: z.string().min(1).max(64),
    runId: z.string().min(1).max(64),
    expectedCompositionInputHash: z.string().min(6).max(128).optional(),
    renderIntent: z.literal("preview").optional().default("preview"),
    compositionMode: z
      .literal("storyboard_motion_preview")
      .optional()
      .default("storyboard_motion_preview"),
  })
  .strict();

export const CreateHyperframesPreviewOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    render: HyperframesRenderStatusProjectionSchema,
    chargeSummary: HyperframesChargeSummarySchema,
    polling: HyperframesPollingGuidanceSchema,
    invalidates: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const GetHyperframesRenderJobInputSchema = z
  .object({
    renderJobId: z.string().min(1).max(128),
    productId: z.string().min(1).max(64).optional(),
    runId: z.string().min(1).max(64).optional(),
    etag: z.string().min(1).max(160).optional(),
  })
  .strict();

export const GetHyperframesRenderJobOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    render: HyperframesRenderStatusProjectionSchema,
    polling: HyperframesPollingGuidanceSchema,
    notModified: z.boolean().default(false),
  })
  .strict();

export const RepairHyperframesRenderJobInputSchema = z
  .object({
    renderJobId: z.string().min(1).max(128),
    productId: z.string().min(1).max(64),
    runId: z.string().min(1).max(64),
    actionId: z.string().min(1).max(160),
    actionType: HyperframesRepairActionSchema.shape.actionType,
    expectedCompositionInputHash: z.string().min(6).max(128).optional(),
  })
  .strict();

export const RepairHyperframesRenderJobOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    render: HyperframesRenderStatusProjectionSchema,
    chargeSummary: HyperframesChargeSummarySchema.optional(),
    polling: HyperframesPollingGuidanceSchema,
    invalidates: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const ListHyperframesTemplatesInputSchema = z
  .object({
    includeDisabled: z.boolean().optional().default(false),
    compositionMode: MarketplaceAutoReviewCompositionModeSchema.optional(),
    renderIntent: HyperframesRenderIntentSchema.optional(),
  })
  .strict()
  .optional()
  .default({});

export const ListHyperframesTemplatesOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    access: HyperframesFeatureAccessProjectionSchema,
    templates: z.array(HyperframesTemplateDescriptorSchema),
  })
  .strict();

export const CancelHyperframesRenderJobInputSchema = z
  .object({
    renderJobId: z.string().min(1).max(128),
    productId: z.string().min(1).max(64).optional(),
    runId: z.string().min(1).max(64).optional(),
    reason: z.string().max(240).optional(),
  })
  .strict();

export const CancelHyperframesRenderJobOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    render: HyperframesRenderStatusProjectionSchema,
    polling: HyperframesPollingGuidanceSchema,
  })
  .strict();

export const SaveHyperframesRenderToLibraryInputSchema = z
  .object({
    productId: z.string().min(1).max(64),
    runId: z.string().min(1).max(64),
    renderJobId: z.string().min(1).max(128),
    idempotencyKey: z.string().min(1).max(256),
  })
  .strict();

export const SaveHyperframesRenderToLibraryOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    created: z.boolean(),
    libraryItem: z.record(z.unknown()),
    render: HyperframesRenderStatusProjectionSchema,
    chargeSummary: HyperframesChargeSummarySchema,
    polling: HyperframesPollingGuidanceSchema,
    invalidates: z.array(z.string().min(1)).default([]),
  })
  .strict();

export type GetAutoStoryboardReviewPlanInput = z.infer<
  typeof GetAutoStoryboardReviewPlanInputSchema
>;
export type StartAutoStoryboardReviewInput = z.infer<
  typeof StartAutoStoryboardReviewInputSchema
>;
export type CreateHyperframesPreviewInput = z.infer<
  typeof CreateHyperframesPreviewInputSchema
>;
export type GetHyperframesRenderJobInput = z.infer<
  typeof GetHyperframesRenderJobInputSchema
>;
export type RepairHyperframesRenderJobInput = z.infer<
  typeof RepairHyperframesRenderJobInputSchema
>;
export type RepairHyperframesRenderJobOutput = z.infer<
  typeof RepairHyperframesRenderJobOutputSchema
>;
export type SaveHyperframesRenderToLibraryInput = z.infer<
  typeof SaveHyperframesRenderToLibraryInputSchema
>;
