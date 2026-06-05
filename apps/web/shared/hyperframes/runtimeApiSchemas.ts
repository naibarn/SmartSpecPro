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
