import { z } from "zod";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesChargeSummarySchema,
  HyperframesPollingGuidanceSchema,
  HyperframesRenderIntentSchema,
  HyperframesRenderStatusProjectionSchema,
  MarketplaceAutoReviewCompositionModeSchema,
  MarketplaceAutoReviewLaunchModeSchema,
} from "./contracts";
import { HyperframesAutoStoryboardReviewPlanSchema } from "./autoPlan";
import { HyperframesFeatureAccessProjectionSchema } from "./featureAccess";
import { HyperframesTemplateDescriptorSchema } from "./contracts";

const ProductIdInputSchema = z.object({
  productId: z.string().min(1).max(64),
});

export const GetAutoStoryboardReviewPlanInputSchema = ProductIdInputSchema.extend({
  includeTemplates: z.boolean().optional().default(false),
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
  idempotencyKey: z.string().min(1).max(256).optional(),
  overrides: z.record(z.unknown()).optional().default({}),
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
    renderIntent: HyperframesRenderIntentSchema.optional().default("preview"),
    compositionMode: MarketplaceAutoReviewCompositionModeSchema.optional().default(
      "storyboard_motion_preview"
    ),
    idempotencyKey: z.string().min(1).max(256).optional(),
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
export type SaveHyperframesRenderToLibraryInput = z.infer<
  typeof SaveHyperframesRenderToLibraryInputSchema
>;
