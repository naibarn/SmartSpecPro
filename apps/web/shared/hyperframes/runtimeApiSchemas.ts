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
  HyperframesAudioEventSchema,
  HyperframesCreativePresetCategorySchema,
  HyperframesCreativePresetSchema,
  hyperframesThaiFontFamilies,
} from "./creativePresets";
import {
  HyperframesAutoPlanOverrideInputSchema,
  HyperframesAutoStoryboardReviewPlanSchema,
} from "./autoPlan";
import { AutoReviewCreativePresetSelectionSchema } from "./autoReviewCreativePresets";
import { HyperframesFeatureAccessProjectionSchema } from "./featureAccess";
import { HyperframesTemplateDescriptorSchema } from "./contracts";
import {
  SequentialEvidencePreviewSchema,
  SequentialReferenceCapacitySchema,
} from "../marketplaceCapture/sequentialEvidencePreview";
import {
  HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC,
  HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC,
  HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS,
} from "./limits";
import {
  VideoSegmentPlanSchema,
  VideoSegmentPlanWarningSchema,
} from "../videoSegmentPlanner";

const ProductIdInputSchema = z.object({
  productId: z.string().min(1).max(64),
});

export const HyperframesValidatedAudioAssetSchema = z
  .object({
    assetRef: z.string().trim().min(1).max(240),
    source: z
      .enum(["bundled", "tenant_uploaded", "library_selected", "generated"])
      .default("bundled"),
    licenseName: z.string().trim().min(1).max(160),
    checksum: z
      .object({
        algorithm: z.literal("sha256").default("sha256"),
        value: z
          .string()
          .trim()
          .regex(/^[a-f0-9]{32,128}$/i),
      })
      .strict(),
    mimeType: z
      .string()
      .trim()
      .regex(/^audio\/[a-z0-9.+-]+$/i),
    durationSec: z.number().positive().max(600),
    ownerTenantId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const GetAutoStoryboardReviewPlanInputSchema =
  ProductIdInputSchema.extend({
    includeTemplates: z.boolean().optional().default(false),
    overrides: HyperframesAutoPlanOverrideInputSchema.optional().default({}),
    workflowMode: z.enum(["standard", "job_workbench"]).optional(),
  }).strict();

export const GetAutoStoryboardReviewPlanOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    access: HyperframesFeatureAccessProjectionSchema,
    plan: HyperframesAutoStoryboardReviewPlanSchema,
    templates: z.array(HyperframesTemplateDescriptorSchema).default([]),
    // Feature 136 (section 05, §5.4) — optional, populated ONLY when the
    // tenant flag is on AND the resolved strategy is sequential (see
    // `getHyperframesAutoStoryboardReviewPlanWithEvidence`). Optional-absent
    // is mandatory: these keys must not serialize at all when unpopulated,
    // keeping the section-01 plan snapshot byte-identical.
    evidencePreview: SequentialEvidencePreviewSchema.optional(),
    referenceCapacity: SequentialReferenceCapacitySchema.optional(),
  })
  .strict();

const HyperframesAutoReviewTransportMetadataSchema = z
  .object({
    transport: z.enum(["gateway_api", "mcp"]),
    connectionId: z.string().max(64).optional(),
    mcpConnectionId: z.string().max(64).optional(),
    sharedGroupId: z.number().int().optional(),
    approvalId: z.string().max(128).optional(),
    mcpApprovalId: z.string().max(128).optional(),
    idempotencyKey: z.string().max(128).optional(),
  })
  .optional()
  .nullable();

export const GetVideoSegmentPlanPreviewInputSchema =
  ProductIdInputSchema.extend({
    overrides: HyperframesAutoPlanOverrideInputSchema.optional().default({}),
    transportMetadata: HyperframesAutoReviewTransportMetadataSchema,
    referenceAnchors: z
      .object({
        schemaVersion: z.number().int().positive().optional(),
        creationIntent: z
          .enum(["storyboard", "video", "auto_review_video"])
          .optional()
          .nullable(),
        creativePresets: z
          .array(AutoReviewCreativePresetSelectionSchema)
          .max(8)
          .optional(),
        productImageUrl: z.string().min(1).max(4096).optional(),
      })
      .passthrough()
      .optional()
      .nullable(),
  }).strict();

export const GetVideoSegmentPlanPreviewOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    videoSegmentPlan: VideoSegmentPlanSchema,
    accessDecision: z
      .object({
        allowed: z.boolean(),
        reasonCode: z.string().max(160).optional(),
        message: z.string().max(600).optional(),
        transport: z.enum(["gateway_api", "mcp"]).optional(),
        provider: z.string().max(120).optional(),
        mcpConnectionId: z.string().max(64).optional(),
        sharedGroupId: z.number().int().optional(),
      })
      .strict(),
    creditEstimate: z
      .object({
        mode: z.enum(["per_shot", "segment_duration"]),
        estimatedCredits: z.number().nonnegative(),
        basis: z.enum(["jobs", "segments", "seconds"]),
        creditSource: z.enum(["gateway_api", "mcp_provider_account"]),
        notes: z.array(z.string().max(400)).default([]),
      })
      .strict(),
    warnings: z.array(VideoSegmentPlanWarningSchema).default([]),
    fallbackReason: z.string().min(1).optional(),
  })
  .strict();

export type GetVideoSegmentPlanPreviewInput = z.infer<
  typeof GetVideoSegmentPlanPreviewInputSchema
>;
export type GetVideoSegmentPlanPreviewOutput = z.infer<
  typeof GetVideoSegmentPlanPreviewOutputSchema
>;

export const StartAutoStoryboardReviewInputSchema = ProductIdInputSchema.extend(
  {
    expectedPlanHash: z.string().min(6).max(128).optional(),
    idempotencyKey: z.string().min(1).max(192).optional(),
    overrides: HyperframesAutoPlanOverrideInputSchema.optional().default({}),
    workflowMode: z.enum(["standard", "job_workbench"]).optional(),
    transportMetadata: HyperframesAutoReviewTransportMetadataSchema,
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
        reviewTone: z
          .enum([
            "warm_honest",
            "funny_light",
            "irritated_problem",
            "energetic_excited",
            "empathetic_soft",
            "expert_confident",
            "straight_serious",
          ])
          .optional()
          .nullable(),
        storytellingStructure: z
          .enum([
            "hook_problem_emotion_insight_solution_result_cta",
            "hook_problem_insight_proof_cta",
            "product_review_situation_problem_try_result_fit",
            "before_after_bridge",
            "pas",
            "aida",
            "relatable_story",
            "problem_struggle_solution_transformation",
          ])
          .optional()
          .nullable(),
        creativePresets: z
          .array(AutoReviewCreativePresetSelectionSchema)
          .max(8)
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
  }
).strict();

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

export const HyperframesThaiFontFamilySchema = z.enum(
  hyperframesThaiFontFamilies
);

export const HyperframesFinalCompositeTextModeSchema = z.enum([
  "none",
  "hook_only",
  "per_shot",
  "hook_and_per_shot",
]);

export const HyperframesFinalCompositeOverlayPresetSchema = z.enum([
  "auto",
  "hook_sequence",
  "spec_highlight",
  "feature_cards",
  "price_impact",
  "premium_product_hero",
  "electronics_spec_stack",
  "hero_price_billboard",
  "kinetic_bold_hook",
  "creator_top_punch",
  "ugc_center_stack",
  "white_intro_card",
  "tech_signal_map",
  "split_product_specs",
  "badge_cascade",
  "lower_third_review",
  "neon_gaming_specs",
  "spec_lines_6_clean",
  "spec_lines_10_dark",
  "spec_lines_12_light",
  "spec_lines_15_neon",
  "clean_subtitle",
]);

export const HyperframesFinalCompositeSubtitlePresetSchema = z.enum([
  "classic_box",
  "minimal_shadow",
  "creator_pop",
  "karaoke_word",
  "highlight_bar",
  "lower_third",
  "cinematic_wide",
  "neon_glow",
  "review_bubble",
  "no_subtitle_style",
]);

export const HyperframesFinalCompositeTextMotionPresetSchema = z.enum([
  "stagger_rise",
  "slide_right_to_left",
  "slide_left_to_right",
  "pop_scale",
  "wipe_reveal",
  "none",
]);

export const HyperframesFinalCompositeSubtitleCueSchema = z
  .object({
    startSec: z.number().min(0).max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC),
    endSec: z.number().min(0.1).max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC),
    text: z.string().trim().max(360),
  })
  .strict()
  .refine(cue => cue.endSec > cue.startSec, {
    message: "Subtitle cue endSec must be greater than startSec.",
  });

export const HyperframesFinalCompositeShotInputSchema = z
  .object({
    id: z.string().trim().min(1).max(160),
    index: z.number().int().min(0).max(11),
    title: z.string().trim().max(180).optional().default(""),
    sourceVideoUrl: z.string().trim().min(1).max(4096),
    sourceVideoRef: z.string().trim().max(1024).optional().nullable(),
    mediaStartSec: z
      .number()
      .min(0)
      .max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC)
      .optional()
      .default(0),
    startSec: z.number().min(0).max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC),
    durationSec: z
      .number()
      .min(0.5)
      .max(HYPERFRAMES_FINAL_COMPOSITE_SHOT_MAX_SEC),
    onScreenText: z.array(z.string().trim().max(600)).max(15).default([]),
    subtitleCues: z
      .array(HyperframesFinalCompositeSubtitleCueSchema)
      .max(12)
      .default([]),
    overlayPreset:
      HyperframesFinalCompositeOverlayPresetSchema.optional().default("auto"),
    animationPreset: z
      .enum([
        "smooth_reveal",
        "slide_pop",
        "bounce_price",
        "floating_product",
        "glow_feature",
        "fade_clean",
      ])
      .optional()
      .default("smooth_reveal"),
    transition: z
      .enum(["fade", "slide", "zoom", "whip", "none"])
      .optional()
      .default("fade"),
    textMotionPreset:
      HyperframesFinalCompositeTextMotionPresetSchema.optional().default(
        "stagger_rise"
      ),
  })
  .strict();

export const HyperframesFinalCompositeConfigSchema = z
  .object({
    finalVideoLengthSec: z
      .number()
      .min(1)
      .max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC),
    width: z.number().int().min(320).max(4096).optional().default(1080),
    height: z.number().int().min(320).max(4096).optional().default(1920),
    fps: z.number().int().min(12).max(60).optional().default(30),
    textMode:
      HyperframesFinalCompositeTextModeSchema.optional().default(
        "hook_and_per_shot"
      ),
    overlayPreset:
      HyperframesFinalCompositeOverlayPresetSchema.optional().default("auto"),
    includeHookText: z.boolean().optional().default(true),
    includeShotText: z.boolean().optional().default(true),
    burnInSubtitles: z.boolean().optional().default(true),
    preserveNativeAudio: z.boolean().optional().default(true),
    subtitlePreset:
      HyperframesFinalCompositeSubtitlePresetSchema.optional().default(
        "classic_box"
      ),
    audioPackPresetId: z.string().trim().min(1).max(180).optional(),
    musicPresetId: z.string().trim().min(1).max(180).optional(),
    sfxPresetIds: z
      .array(z.string().trim().min(1).max(180))
      .max(12)
      .default([]),
    audioEvents: z.array(HyperframesAudioEventSchema).max(80).default([]),
    audioAssetValidation: z
      .object({
        stagedAssetsRequired: z.boolean().default(true),
        allowSyntheticFallback: z.boolean().default(true),
        missingAssetRefs: z
          .array(z.string().trim().min(1).max(240))
          .default([]),
        validatedAssetRefs: z
          .array(z.string().trim().min(1).max(240))
          .default([]),
        validatedAssets: z
          .array(HyperframesValidatedAudioAssetSchema)
          .max(80)
          .default([]),
      })
      .strict()
      .default({
        stagedAssetsRequired: true,
        allowSyntheticFallback: true,
        missingAssetRefs: [],
        validatedAssetRefs: [],
        validatedAssets: [],
      }),
    fontFamily: HyperframesThaiFontFamilySchema.optional().default("Prompt"),
    styleBrief: z
      .string()
      .trim()
      .max(HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS)
      .optional()
      .default(""),
    hookText: z.string().trim().max(160).optional().default(""),
    supportingText: z.string().trim().max(160).optional().default(""),
    subtitlePlacement: z
      .enum(["bottom", "lower_third"])
      .optional()
      .default("bottom"),
    subtitleFontSizePx: z.number().int().min(24).max(52).optional().default(34),
    textMotionPreset:
      HyperframesFinalCompositeTextMotionPresetSchema.optional().default(
        "slide_right_to_left"
      ),
    safeZonePercent: z.number().min(0).max(30).optional().default(8),
    cssAnimationEnabled: z.boolean().optional().default(true),
    gsapCompatibleTimeline: z.boolean().optional().default(true),
    shots: z.array(HyperframesFinalCompositeShotInputSchema).min(1).max(12),
  })
  .strict();

export const CreateHyperframesFinalCompositeInputSchema = z
  .object({
    productId: z.string().min(1).max(64),
    runId: z.string().min(1).max(64),
    expectedCompositionInputHash: z.string().min(6).max(128).optional(),
    renderIntent: z.literal("final").optional().default("final"),
    compositionMode: z
      .literal("captioned_final_composite")
      .optional()
      .default("captioned_final_composite"),
    config: HyperframesFinalCompositeConfigSchema,
  })
  .strict();

export const CreateHyperframesFinalCompositeOutputSchema = z
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
    renderJobId: z.string().trim().max(128).optional(),
    productId: z.string().min(1).max(64).optional(),
    runId: z.string().min(1).max(64).optional(),
    etag: z.string().min(1).max(160).optional(),
  })
  .strict()
  .refine(
    input => Boolean(input.renderJobId?.trim() || input.runId?.trim()),
    "renderJobId or runId is required"
  );

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

export const ListHyperframesCreativePresetsInputSchema = z
  .object({
    includeDisabled: z.boolean().optional().default(false),
    includeCandidate: z.boolean().optional().default(false),
    category: HyperframesCreativePresetCategorySchema.optional(),
  })
  .strict()
  .optional()
  .default({});

export const ListHyperframesCreativePresetsOutputSchema = z
  .object({
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    access: HyperframesFeatureAccessProjectionSchema,
    presets: z.array(HyperframesCreativePresetSchema),
    aliases: z.record(z.string().min(1)),
    creativeCapabilities: z
      .object({
        canUseProducerPresets: z.boolean(),
        canUseFallbackPresets: z.boolean(),
        canUseOfficialCliPresets: z.boolean().default(false),
        canUseAudioPacks: z.boolean(),
        canUseSfx: z.boolean(),
      })
      .strict()
      .default({
        canUseProducerPresets: false,
        canUseFallbackPresets: false,
        canUseOfficialCliPresets: false,
        canUseAudioPacks: false,
        canUseSfx: false,
      }),
    runtimeCapabilities: z
      .object({
        diagnosticFallbackOnly: z.boolean().default(true),
        hyperframesCli: z.boolean().default(false),
        ffmpegAssFallback: z.boolean(),
        smokeRenderer: z.boolean(),
        hyperframesProducer: z.boolean(),
        runtimeMode: z
          .enum([
            "official_runtime_blocked",
            "official_cli_ready",
            "official_producer_ready",
            "canary",
            "rollback",
          ])
          .default("official_runtime_blocked"),
        minRuntimeProfile: z.string().min(1).max(180),
        testedRuntimeProfileHash: z.string().min(6).max(160),
        minHyperframesVersion: z.string().min(1).max(80).default("0.6.95"),
        testedHyperframesVersion: z.string().min(1).max(80).default("0.6.95"),
      })
      .strict()
      .default({
        diagnosticFallbackOnly: true,
        hyperframesCli: false,
        ffmpegAssFallback: false,
        smokeRenderer: false,
        hyperframesProducer: false,
        runtimeMode: "official_runtime_blocked",
        minRuntimeProfile: "feature_120_runtime_v1",
        testedRuntimeProfileHash: "hf_runtime_feature_120_v1",
        minHyperframesVersion: "0.6.95",
        testedHyperframesVersion: "0.6.95",
      }),
    presetAvailability: z
      .record(
        z
          .object({
            selectable: z.boolean(),
            reason: z.string().max(240).nullable(),
            fallbackMode: z.enum([
              "official_producer",
              "official_cli",
              "diagnostic_only",
              "not_available",
              "producer",
              "ffmpeg_ass",
            ]),
          })
          .strict()
      )
      .default({}),
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
export type CreateHyperframesFinalCompositeInput = z.infer<
  typeof CreateHyperframesFinalCompositeInputSchema
>;
export type HyperframesFinalCompositeConfig = z.infer<
  typeof HyperframesFinalCompositeConfigSchema
>;
export type GetHyperframesRenderJobInput = z.infer<
  typeof GetHyperframesRenderJobInputSchema
>;
export type ListHyperframesCreativePresetsInput = z.infer<
  typeof ListHyperframesCreativePresetsInputSchema
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
