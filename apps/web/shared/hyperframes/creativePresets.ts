import { z } from "zod";
import { HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC } from "./limits";

import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesArtifactRefSchema,
  HyperframesLibraryFinalizeMetadataSchema,
  HyperframesOutputRefSchema,
  HyperframesPlatformPresetIdSchema,
  HyperframesRenderIntentSchema,
  MarketplaceAutoReviewCompositionModeSchema,
} from "./contracts";
import { HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS } from "./limits";

const SafeIdSchema = z.string().trim().min(1).max(180);
const SafeHashSchema = z.string().trim().min(6).max(160);
const SafeTextSchema = z.string().trim().max(4000);
const SafeUrlOrRefSchema = z.string().trim().min(1).max(2048);

export const hyperframesCreativePresetCategories = [
  "overlay",
  "subtitle",
  "music",
  "sfx",
  "transition",
  "audio_pack",
] as const;

export const hyperframesCreativePresetLifecycleStates = [
  "draft",
  "candidate",
  "active",
  "disabled",
  "archived",
] as const;

export const hyperframesCreativePresetCapabilityStates = [
  "official_cli_ready",
  "official_producer_ready",
  "diagnostic_fallback_only",
  "official_runtime_blocked",
  "producer_ready",
  "fallback_only",
  "unsupported",
] as const;

export const hyperframesCreativeCopySources = [
  "product_truth",
  "marketplace_capture_field",
  "ai_insight_evidence",
  "user_edit",
  "policy_disclosure",
  "derived_summary",
] as const;

export const hyperframesThaiFontFamilies = [
  "Prompt",
  "Noto Sans Thai",
  "IBM Plex Sans Thai",
  "Sarabun",
  "Kanit",
] as const;

export const hyperframesAudioRoles = [
  "voiceover",
  "music",
  "transition_sfx",
  "ui_sfx",
  "accent_sfx",
  "ambience",
] as const;

export const hyperframesAudioVisualTriggers = [
  "video_start",
  "scene_cut",
  "text_appears",
  "card_materializes",
  "button_depress",
  "price_badge_pop",
  "sales_number_lock",
  "product_reveal",
  "cta_lock",
  "manual",
] as const;

export const HyperframesCreativePresetCategorySchema = z.enum(
  hyperframesCreativePresetCategories
);
export const HyperframesCreativePresetLifecycleStateSchema = z.enum(
  hyperframesCreativePresetLifecycleStates
);
export const HyperframesCreativePresetCapabilityStateSchema = z.enum(
  hyperframesCreativePresetCapabilityStates
);
export const HyperframesCreativeCopySourceSchema = z.enum(
  hyperframesCreativeCopySources
);
export const HyperframesThaiFontFamilySchema = z.enum(hyperframesThaiFontFamilies);
export const HyperframesAudioRoleSchema = z.enum(hyperframesAudioRoles);
export const HyperframesAudioVisualTriggerSchema = z.enum(
  hyperframesAudioVisualTriggers
);

export const HyperframesPresetVariableSchema = z
  .object({
    key: SafeIdSchema,
    label: SafeTextSchema,
    type: z.enum(["text", "number", "boolean", "string_array", "cue_array"]),
    required: z.boolean().default(false),
    editable: z.boolean().default(true),
    defaultValue: z.unknown().optional(),
    maxLength: z.number().int().positive().max(4000).optional(),
    copySource: HyperframesCreativeCopySourceSchema.optional(),
  })
  .strict();

export type HyperframesPresetVariable = z.infer<
  typeof HyperframesPresetVariableSchema
>;

export const HyperframesPresetTimingPolicySchema = z
  .object({
    minDurationSec: z.number().min(0).max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC).optional(),
    maxDurationSec: z.number().min(0).max(HYPERFRAMES_FINAL_COMPOSITE_MAX_SEC).optional(),
    supportsWordTiming: z.boolean().default(false),
    supportsPhraseFallback: z.boolean().default(true),
    requiresVisualTrigger: z.boolean().default(false),
  })
  .strict();

export type HyperframesPresetTimingPolicy = z.infer<
  typeof HyperframesPresetTimingPolicySchema
>;

export const HyperframesPresetSafeAreaPolicySchema = z
  .object({
    placement: z.enum(["top", "center", "bottom", "lower_third", "end_card"]),
    maxLines: z.number().int().min(1).max(6).optional(),
    maxCharsPerLine: z.number().int().min(8).max(80).optional(),
    avoidProduct: z.boolean().default(true),
    avoidFace: z.boolean().default(true),
    avoidPrice: z.boolean().default(false),
  })
  .strict();

export type HyperframesPresetSafeAreaPolicy = z.infer<
  typeof HyperframesPresetSafeAreaPolicySchema
>;

export const HyperframesCreativeRuntimeSupportSchema = z
  .object({
    diagnosticFallbackOnly: z.boolean().default(false),
    hyperframesCli: z.boolean().default(true),
    hyperframesProducer: z.boolean(),
    minRuntimeProfile: SafeIdSchema,
    testedRuntimeProfileHash: SafeHashSchema,
    minHyperframesVersion: SafeTextSchema.default("0.6.95"),
    testedHyperframesVersion: SafeTextSchema.default("0.6.95"),
    unsupportedFeatures: z.array(SafeTextSchema).default([]),
    ffmpegAssFallback: z.boolean().default(false),
    smokeRenderer: z.boolean().default(false),
  })
  .strict();

export const HyperframesCreativeAssetRefSchema = z
  .object({
    id: SafeIdSchema,
    kind: z.enum(["font", "music", "sfx", "image", "video"]),
    source: z.enum(["bundled", "tenant_uploaded", "library_selected", "generated"]),
    license: z
      .object({
        name: SafeTextSchema,
        url: z.string().trim().max(2048).optional(),
        attributionRequired: z.boolean().default(false),
      })
      .strict(),
    checksum: z
      .object({
        algorithm: z.literal("sha256"),
        value: z.string().trim().regex(/^[a-f0-9]{16,128}$/i),
      })
      .strict(),
    owner: z
      .object({
        type: z.enum(["platform", "tenant", "user", "third_party"]),
        id: SafeIdSchema.optional(),
      })
      .strict(),
  })
  .strict();

export type HyperframesCreativeAssetRef = z.infer<
  typeof HyperframesCreativeAssetRefSchema
>;

export const HyperframesCreativePresetSchema = z
  .object({
    id: SafeIdSchema,
    version: z.number().int().positive(),
    category: HyperframesCreativePresetCategorySchema,
    lifecycleState: HyperframesCreativePresetLifecycleStateSchema,
    capabilityState: HyperframesCreativePresetCapabilityStateSchema,
    labels: z
      .object({
        en: SafeTextSchema,
        th: SafeTextSchema,
      })
      .strict(),
    description: SafeTextSchema,
    promptPack: SafeTextSchema,
    variables: z.array(HyperframesPresetVariableSchema).default([]),
    timingPolicy: HyperframesPresetTimingPolicySchema,
    safeAreaPolicy: HyperframesPresetSafeAreaPolicySchema,
    supportedPlatformPresets: z.array(HyperframesPlatformPresetIdSchema).min(1),
    runtimeSupport: HyperframesCreativeRuntimeSupportSchema,
    productCategories: z.array(SafeIdSchema).default([]),
    qaChecklist: z.array(SafeTextSchema).default([]),
    assetRefs: z.array(HyperframesCreativeAssetRefSchema).default([]),
    audioAssetPolicy: z
      .object({
        source: z.enum(["none", "bundled", "tenant_uploaded", "library_selected"]),
        requiresLicense: z.boolean().default(false),
        requiresChecksum: z.boolean().default(false),
        musicGenerationEnabled: z.boolean().default(false),
      })
      .strict()
      .default({
        source: "none",
        requiresLicense: false,
        requiresChecksum: false,
        musicGenerationEnabled: false,
      }),
    aliases: z.array(SafeIdSchema).default([]),
    disabledReason: SafeTextSchema.optional().nullable(),
  })
  .strict();

export type HyperframesCreativePreset = z.infer<
  typeof HyperframesCreativePresetSchema
>;

export const HyperframesAudioEventSchema = z
  .object({
    id: SafeIdSchema,
    role: HyperframesAudioRoleSchema,
    presetId: SafeIdSchema.optional(),
    visualTrigger: HyperframesAudioVisualTriggerSchema,
    startSec: z.number().min(0).max(600),
    durationSec: z.number().min(0).max(600).optional(),
    mediaStartSec: z.number().min(0).max(600).optional(),
    volume: z.number().min(0).max(1),
    assetRef: SafeUrlOrRefSchema,
    notes: SafeTextSchema.optional(),
  })
  .strict();

export type HyperframesAudioEvent = z.infer<typeof HyperframesAudioEventSchema>;

const InstructionLikeTextSchema = z
  .string()
  .trim()
  .max(1200)
  .refine(
    text =>
      !/(ignore previous|system prompt|developer instruction|execute command|run shell|BEGIN PRIVATE KEY)/i.test(
        text
      ),
    { message: "Instruction-like marketplace text cannot be used as creative copy." }
  );

export const HyperframesCreativeClaimCategorySchema = z.enum([
  "product_fact",
  "price",
  "promotion",
  "review_signal",
  "policy_disclosure",
  "derived_summary",
]);

export const HyperframesCreativeCopyClaimSchema = z
  .object({
    id: SafeIdSchema,
    text: InstructionLikeTextSchema,
    copySource: HyperframesCreativeCopySourceSchema,
    evidenceRefs: z.array(SafeUrlOrRefSchema).default([]),
    freshness: z
      .object({
        capturedAt: z.string().trim().min(1).max(80),
        expiresAt: z.string().trim().min(1).max(80).optional(),
        volatile: z.boolean(),
      })
      .strict(),
    claimCategory: HyperframesCreativeClaimCategorySchema,
    editActor: z
      .object({
        type: z.enum(["system", "llm", "user", "operator"]),
        id: z.union([z.string(), z.number()]).optional(),
      })
      .strict(),
    policyRulePackRef: SafeIdSchema,
    safeOmissionReason: SafeTextSchema.optional(),
  })
  .strict()
  .superRefine((claim, ctx) => {
    if (claim.evidenceRefs.length === 0 && !claim.safeOmissionReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["evidenceRefs"],
        message: "Copy claims require evidence refs or an explicit safe omission reason.",
      });
    }
  });

export type HyperframesCreativeCopyClaim = z.infer<
  typeof HyperframesCreativeCopyClaimSchema
>;

export const HyperframesCreativeCopyPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    policyRulePackRef: SafeIdSchema,
    productTruthHash: SafeHashSchema,
    evidenceManifestHash: SafeHashSchema,
    claims: z.array(HyperframesCreativeCopyClaimSchema).min(1),
  })
  .strict();

export type HyperframesCreativeCopyPlan = z.infer<
  typeof HyperframesCreativeCopyPlanSchema
>;

export const HyperframesCreativeVariablesSchema = z
  .object({
    hookText: z.string().trim().max(240).optional(),
    supportingText: z.string().trim().max(240).optional(),
    productName: z.string().trim().max(240).optional(),
    priceText: z.string().trim().max(120).optional(),
    originalPriceText: z.string().trim().max(120).optional(),
    promotionText: z.string().trim().max(240).optional(),
    ctaText: z.string().trim().max(120).optional(),
    trustText: z.string().trim().max(240).optional(),
    specLines: z.array(z.string().trim().max(160)).max(20).optional(),
    benefitLines: z.array(z.string().trim().max(160)).max(20).optional(),
    reviewQuote: z.string().trim().max(360).optional(),
    styleBrief: z.string().trim().max(HYPERFRAMES_FINAL_RENDER_PROMPT_MAX_CHARS).optional(),
    subtitleCues: z
      .array(
        z
          .object({
            startSec: z.number().min(0).max(600),
            endSec: z.number().min(0).max(600),
            text: z.string().trim().max(360),
          })
          .strict()
          .refine(cue => cue.endSec > cue.startSec, {
            message: "Subtitle cue endSec must be greater than startSec.",
          })
      )
      .max(200)
      .optional(),
    perShotText: z
      .array(
        z
          .object({
            shotId: SafeIdSchema,
            overlayText: z.string().trim().max(360).optional(),
            subtitleText: z.string().trim().max(360).optional(),
            voiceoverText: z.string().trim().max(720).optional(),
          })
          .strict()
      )
      .max(40)
      .optional(),
  })
  .strict();

export type HyperframesCreativeVariables = z.infer<
  typeof HyperframesCreativeVariablesSchema
>;

export const HyperframesCreativePlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    tenantId: SafeIdSchema,
    userId: z.union([z.string(), z.number()]),
    productId: SafeIdSchema,
    runId: SafeIdSchema,
    storyboardReviewProjectId: z.union([z.string(), z.number()]).optional(),
    renderIntent: HyperframesRenderIntentSchema,
    compositionMode: MarketplaceAutoReviewCompositionModeSchema,
    templateId: SafeIdSchema,
    templateVersion: SafeIdSchema,
    templateContentHash: SafeHashSchema,
    platformProfileId: HyperframesPlatformPresetIdSchema,
    platformPresetVersion: SafeIdSchema,
    overlayPresetId: SafeIdSchema,
    subtitlePresetId: SafeIdSchema,
    audioPackPresetId: SafeIdSchema.optional(),
    musicPresetId: SafeIdSchema.optional(),
    sfxPresetIds: z.array(SafeIdSchema).default([]),
    presetVersions: z.record(z.number().int().positive()),
    fontFamily: HyperframesThaiFontFamilySchema,
    burnInSubtitles: z.boolean(),
    preserveNativeAudio: z.boolean(),
    variables: HyperframesCreativeVariablesSchema,
    audioEvents: z.array(HyperframesAudioEventSchema).default([]),
    sourceRefs: z.array(SafeUrlOrRefSchema).default([]),
    legacyFinalCompositeConfigHash: SafeHashSchema.optional(),
    copyPlanHash: SafeHashSchema.optional(),
    productTruthHash: SafeHashSchema.optional(),
    evidenceManifestHash: SafeHashSchema.optional(),
    claimEvidenceMapHash: SafeHashSchema.optional(),
    policyRulePackRef: SafeIdSchema.optional(),
  })
  .strict();

export type HyperframesCreativePlan = z.infer<
  typeof HyperframesCreativePlanSchema
>;

export const HyperframesCreativeQaResultSchema = z
  .object({
    passed: z.boolean(),
    blockingIssues: z.array(SafeTextSchema).default([]),
    warnings: z.array(SafeTextSchema).default([]),
    textOverflow: z.boolean().default(false),
    clippedThaiGlyphs: z.boolean().default(false),
    hasAudio: z.boolean().default(false),
    durationDriftSec: z.number().min(0).max(60).default(0),
  })
  .strict();

export type HyperframesCreativeQaResult = z.infer<
  typeof HyperframesCreativeQaResultSchema
>;

export const HyperframesCreativeRenderManifestSchema = z
  .object({
    renderJobId: SafeIdSchema,
    tenantId: SafeIdSchema,
    userId: z.union([z.string(), z.number()]),
    productId: SafeIdSchema,
    runId: SafeIdSchema,
    storyboardReviewProjectId: z.union([z.string(), z.number()]).optional(),
    renderIntent: HyperframesRenderIntentSchema,
    compositionMode: MarketplaceAutoReviewCompositionModeSchema,
    templateId: SafeIdSchema,
    templateVersion: SafeIdSchema,
    templateContentHash: SafeHashSchema,
    platformPresetId: HyperframesPlatformPresetIdSchema,
    platformPresetVersion: SafeIdSchema,
    presetIds: z.array(SafeIdSchema).min(1),
    presetVersions: z.record(z.number().int().positive()),
    creativePlanHash: SafeHashSchema,
    compositionInputHash: SafeHashSchema,
    compositionHtmlHash: SafeHashSchema,
    outputHash: SafeHashSchema.optional(),
    mediaInputHashes: z.record(SafeHashSchema),
    audioEventMapHash: SafeHashSchema.optional(),
    durationSec: z.number().min(0).max(600),
    width: z.number().int().min(320).max(4096),
    height: z.number().int().min(320).max(4096),
    fps: z.number().int().min(12).max(60),
    hasAudio: z.boolean(),
    hasNativeAudio: z.boolean(),
    audioPolicy: z
      .object({
        preserveNativeAudio: z.boolean(),
        burnInSubtitles: z.boolean(),
        musicEnabled: z.boolean(),
        sfxEnabled: z.boolean(),
      })
      .strict(),
    outputStorageKey: SafeUrlOrRefSchema,
    outputUrl: z.string().trim().max(2048).optional(),
    libraryItemId: z.union([z.string(), z.number()]).nullable().optional(),
    featureAccessSnapshotHash: SafeHashSchema.optional(),
    fallbackQuality: z.enum(["full", "partial", "not_supported"]),
    qa: HyperframesCreativeQaResultSchema,
  })
  .strict();

export type HyperframesCreativeRenderManifest = z.infer<
  typeof HyperframesCreativeRenderManifestSchema
>;

export const HyperframesCreativeLibraryMetadataSchema =
  HyperframesLibraryFinalizeMetadataSchema.extend({
    creativePlanHash: SafeHashSchema,
    presetIds: z.array(SafeIdSchema).min(1),
    presetVersions: z.record(z.number().int().positive()),
    overlayPresetId: SafeIdSchema,
    subtitlePresetId: SafeIdSchema,
    audioPackPresetId: SafeIdSchema.optional(),
    musicPresetId: SafeIdSchema.optional(),
    sfxPresetIds: z.array(SafeIdSchema).default([]),
    audioEventMapHash: SafeHashSchema.optional(),
    hasAudio: z.boolean(),
    hasNativeAudio: z.boolean(),
    fallbackQuality: z.enum(["full", "partial", "not_supported"]),
  }).strict();

export type HyperframesCreativeLibraryMetadata = z.infer<
  typeof HyperframesCreativeLibraryMetadataSchema
>;

export const HyperframesShotMediaAssignmentSchema = z
  .object({
    storyboardReviewProjectId: z.union([z.string(), z.number()]),
    shotId: SafeIdSchema,
    sourceShotId: SafeIdSchema.optional(),
    shotIndex: z.number().int().min(0).max(99),
    source: z.enum([
      "storyboard_generated_clip",
      "media_library",
      "history_gallery",
      "manual_upload",
      "video_editor_render",
    ]),
    mediaKind: z.literal("video"),
    mediaId: z.union([z.string(), z.number()]).optional(),
    artifactId: SafeIdSchema.optional(),
    libraryItemId: z.union([z.string(), z.number()]).optional(),
    sourceUrl: z.string().trim().max(2048).optional(),
    storageRef: z.string().trim().max(1024).optional(),
    contentHash: SafeHashSchema.optional(),
    mediaStartSec: z.number().min(0).max(600).optional(),
    durationSec: z.number().min(0).max(600).optional(),
    width: z.number().int().min(1).max(8192).optional(),
    height: z.number().int().min(1).max(8192).optional(),
    hasAudio: z.boolean().optional(),
    assignedByUserId: z.union([z.string(), z.number()]),
    assignedAt: z.string().trim().min(1).max(80),
  })
  .strict();

export type HyperframesShotMediaAssignment = z.infer<
  typeof HyperframesShotMediaAssignmentSchema
>;

export type HyperframesArtifactRef = z.infer<typeof HyperframesArtifactRefSchema>;
export type HyperframesOutputRef = z.infer<typeof HyperframesOutputRefSchema>;

const commonRuntimeSupport = {
  minRuntimeProfile: "feature_120_runtime_v1",
  testedRuntimeProfileHash: "hf_runtime_feature_120_v1",
} as const;

type HyperframesCreativePresetInput = z.input<typeof HyperframesCreativePresetSchema>;

function preset(input: Omit<HyperframesCreativePresetInput, "version"> & {
  version?: number;
}): HyperframesCreativePreset {
  return HyperframesCreativePresetSchema.parse({
    version: 1,
    ...input,
  });
}

const overlayPrompt =
  "Using /hyperframes, create Thai ecommerce motion typography with deterministic CSS/GSAP, safe area, staged assets, and window.__timelines.";

const subtitlePrompt =
  "Using /hyperframes, create burn-in Thai subtitles with readable mobile safe-area placement and deterministic cue timing.";

const audioPrompt =
  "Using /hyperframes, create deterministic audio events from staged assets with explicit role, visual trigger, timing, volume, and license metadata.";

const overlaySafeArea = {
  placement: "top",
  maxLines: 3,
  maxCharsPerLine: 24,
  avoidProduct: true,
  avoidFace: true,
  avoidPrice: true,
} as const;

const subtitleSafeArea = {
  placement: "bottom",
  maxLines: 2,
  maxCharsPerLine: 30,
  avoidProduct: true,
  avoidFace: true,
  avoidPrice: true,
} as const;

const defaultTiming = {
  minDurationSec: 0.5,
  maxDurationSec: 8,
  supportsWordTiming: false,
  supportsPhraseFallback: true,
  requiresVisualTrigger: false,
} as const;

const producerSupport = {
  ...commonRuntimeSupport,
  diagnosticFallbackOnly: false,
  hyperframesCli: true,
  hyperframesProducer: true,
  minHyperframesVersion: "0.6.95",
  testedHyperframesVersion: "0.6.95",
  ffmpegAssFallback: false,
  smokeRenderer: false,
  unsupportedFeatures: [] as string[],
};

const fallbackSupport = {
  ...commonRuntimeSupport,
  diagnosticFallbackOnly: true,
  hyperframesCli: false,
  hyperframesProducer: false,
  minHyperframesVersion: "0.6.95",
  testedHyperframesVersion: "0.6.95",
  ffmpegAssFallback: true,
  smokeRenderer: false,
  unsupportedFeatures: ["rich_gsap_timeline"],
};

const allVerticalPlatforms = [
  "generic_vertical_9_16",
  "tiktok_reels_shorts_9_16",
] as const;

export const HYPERFRAMES_CREATIVE_PRESETS = [
  preset({
    id: "hf_text_hook_kinetic_slam_ecommerce_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "producer_ready",
    labels: { en: "Kinetic Slam Hook", th: "Hook ทีละจังหวะ" },
    description: "Large staggered ecommerce hook for the first three seconds.",
    promptPack: overlayPrompt,
    variables: [
      { key: "hookText", label: "Hook text", type: "text", required: true },
      { key: "supportingText", label: "Supporting text", type: "text" },
    ],
    timingPolicy: defaultTiming,
    safeAreaPolicy: overlaySafeArea,
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["ecommerce"],
    qaChecklist: ["safe_area", "thai_glyphs", "product_avoidance"],
    aliases: ["kinetic_bold_hook", "hook_sequence"],
  }),
  preset({
    id: "hf_text_title_gradient_product_pop_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "producer_ready",
    labels: { en: "Gradient Product Pop", th: "ชื่อสินค้าเด้งไล่สี" },
    description: "Elastic gradient title for product benefit moments.",
    promptPack: overlayPrompt,
    variables: [{ key: "productName", label: "Product name", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: overlaySafeArea,
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["ecommerce"],
    qaChecklist: ["contrast", "thai_glyphs"],
    aliases: ["premium_product_hero"],
  }),
  preset({
    id: "hf_text_spec_electronics_stack_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "producer_ready",
    labels: { en: "Electronics Spec Stack", th: "สเปกสินค้าอิเล็กทรอนิกส์" },
    description: "Stacked specification cards for electronics.",
    promptPack: overlayPrompt,
    variables: [{ key: "specLines", label: "Spec lines", type: "string_array" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: { ...overlaySafeArea, placement: "center" },
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["electronics", "phone", "tablet", "camera", "notebook"],
    qaChecklist: ["evidence_bound_specs", "safe_area"],
    aliases: ["spec_highlight", "electronics_spec_stack", "split_product_specs"],
  }),
  preset({
    id: "hf_text_price_badge_pop_ecommerce_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "fallback_only",
    labels: { en: "Price Badge Pop", th: "ป้ายราคาเด้ง" },
    description: "Readable marketplace price and promotion badge.",
    promptPack: overlayPrompt,
    variables: [
      { key: "priceText", label: "Price", type: "text", copySource: "marketplace_capture_field" },
      { key: "promotionText", label: "Promotion", type: "text" },
    ],
    timingPolicy: defaultTiming,
    safeAreaPolicy: { ...overlaySafeArea, placement: "lower_third", avoidPrice: false },
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: fallbackSupport,
    productCategories: ["ecommerce", "deal"],
    qaChecklist: ["stale_price_policy", "disclosure"],
    aliases: ["price_impact", "hero_price_billboard"],
  }),
  preset({
    id: "hf_text_price_particle_burst_deal_v1",
    category: "overlay",
    lifecycleState: "candidate",
    capabilityState: "producer_ready",
    labels: { en: "Deal Particle Burst", th: "ราคาโปรเอฟเฟกต์แตก" },
    description: "Flash-sale price burst with particles.",
    promptPack: overlayPrompt,
    variables: [{ key: "priceText", label: "Deal price", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: { ...overlaySafeArea, placement: "lower_third", avoidPrice: false },
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["deal"],
    qaChecklist: ["stale_price_policy", "motion_safe"],
    aliases: [],
  }),
  preset({
    id: "hf_text_social_review_card_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "fallback_only",
    labels: { en: "Social Review Card", th: "การ์ดรีวิว" },
    description: "Review and rating proof card.",
    promptPack: overlayPrompt,
    variables: [{ key: "reviewQuote", label: "Review quote", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: { ...overlaySafeArea, placement: "lower_third" },
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: fallbackSupport,
    productCategories: ["review", "social_proof"],
    qaChecklist: ["evidence_bound_review"],
    aliases: ["lower_third_review"],
  }),
  preset({
    id: "hf_text_lower_third_creator_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "fallback_only",
    labels: { en: "Creator Lower Third", th: "แถบชื่อผู้รีวิว" },
    description: "Creator or product category lower-third strip.",
    promptPack: overlayPrompt,
    variables: [{ key: "trustText", label: "Trust text", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: { ...overlaySafeArea, placement: "lower_third" },
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: fallbackSupport,
    productCategories: ["review"],
    qaChecklist: ["safe_area"],
    aliases: [],
  }),
  preset({
    id: "hf_text_marker_highlight_sweep_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "producer_ready",
    labels: { en: "Marker Highlight Sweep", th: "ไฮไลต์ปากกา" },
    description: "Marker sweep over key proof phrases.",
    promptPack: overlayPrompt,
    variables: [{ key: "benefitLines", label: "Benefit lines", type: "string_array" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: overlaySafeArea,
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["explainer"],
    qaChecklist: ["contrast", "text_overflow"],
    aliases: ["badge_cascade"],
  }),
  preset({
    id: "hf_text_title_texture_mask_premium_v1",
    category: "overlay",
    lifecycleState: "candidate",
    capabilityState: "producer_ready",
    labels: { en: "Texture Mask Premium", th: "ตัวอักษรพื้นผิวพรีเมียม" },
    description: "Large material-mask title for premium products.",
    promptPack: overlayPrompt,
    variables: [{ key: "hookText", label: "Title", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: overlaySafeArea,
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["premium"],
    qaChecklist: ["contrast", "safe_area"],
    aliases: [],
  }),
  preset({
    id: "hf_text_title_parallax_behind_product_v1",
    category: "overlay",
    lifecycleState: "candidate",
    capabilityState: "producer_ready",
    labels: { en: "Parallax Behind Product", th: "ตัวอักษรพารัลแลกซ์หลังสินค้า" },
    description: "Depth text behind product hero.",
    promptPack: overlayPrompt,
    variables: [{ key: "productName", label: "Product name", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: { ...overlaySafeArea, avoidProduct: false },
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["product_hero"],
    qaChecklist: ["product_masking"],
    aliases: [],
  }),
  preset({
    id: "hf_text_title_blend_difference_auto_contrast_v1",
    category: "overlay",
    lifecycleState: "candidate",
    capabilityState: "producer_ready",
    labels: { en: "Auto Contrast Blend", th: "ตัวอักษรตัดพื้นหลังอัตโนมัติ" },
    description: "Difference-blend title for moving backgrounds.",
    promptPack: overlayPrompt,
    variables: [{ key: "hookText", label: "Title", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: overlaySafeArea,
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["product_hero"],
    qaChecklist: ["contrast"],
    aliases: [],
  }),
  preset({
    id: "hf_text_title_morph_word_chain_v1",
    category: "overlay",
    lifecycleState: "candidate",
    capabilityState: "producer_ready",
    labels: { en: "Morph Word Chain", th: "คำเปลี่ยนจากปัญหาเป็นทางออก" },
    description: "Problem-to-solution word morph.",
    promptPack: overlayPrompt,
    variables: [{ key: "benefitLines", label: "Word chain", type: "string_array" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: overlaySafeArea,
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["problem_solution"],
    qaChecklist: ["motion_safe"],
    aliases: [],
  }),
  preset({
    id: "hf_text_caption_emoji_pop_family_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "producer_ready",
    labels: { en: "Family Emoji Pop", th: "ข้อความน่ารักสำหรับครอบครัว" },
    description: "Friendly emoji-accented caption for family products.",
    promptPack: overlayPrompt,
    variables: [{ key: "hookText", label: "Friendly text", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: overlaySafeArea,
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["mother_baby", "family"],
    qaChecklist: ["thai_glyphs", "safe_area"],
    aliases: [],
  }),
  preset({
    id: "hf_text_process_website_scan_label_v1",
    category: "overlay",
    lifecycleState: "candidate",
    capabilityState: "fallback_only",
    labels: { en: "Website Scan Label", th: "ป้ายสถานะสแกนเว็บ" },
    description: "Small process labels for SaaS or AI workflows.",
    promptPack: overlayPrompt,
    variables: [{ key: "supportingText", label: "Process label", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: { ...overlaySafeArea, placement: "top" },
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: fallbackSupport,
    productCategories: ["saas", "ai"],
    qaChecklist: ["safe_area"],
    aliases: [],
  }),
  preset({
    id: "hf_text_cta_terminal_command_v1",
    category: "overlay",
    lifecycleState: "candidate",
    capabilityState: "producer_ready",
    labels: { en: "Terminal CTA", th: "CTA แบบเทอร์มินัล" },
    description: "Developer-tool CTA with command styling.",
    promptPack: overlayPrompt,
    variables: [{ key: "ctaText", label: "CTA", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: { ...overlaySafeArea, placement: "end_card" },
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["developer_tool", "saas"],
    qaChecklist: ["contrast"],
    aliases: [],
  }),
  preset({
    id: "hf_text_hook_comic_hype_word_v1",
    category: "overlay",
    lifecycleState: "active",
    capabilityState: "producer_ready",
    labels: { en: "Comic Hype Word", th: "คำฮิตแบบสติกเกอร์" },
    description: "Sticker/comic hype word for viral moments.",
    promptPack: overlayPrompt,
    variables: [{ key: "hookText", label: "Hype word", type: "text" }],
    timingPolicy: defaultTiming,
    safeAreaPolicy: overlaySafeArea,
    supportedPlatformPresets: [...allVerticalPlatforms],
    runtimeSupport: producerSupport,
    productCategories: ["viral"],
    qaChecklist: ["motion_safe"],
    aliases: [],
  }),
  ...[
    ["hf_subtitle_classic_box_v1", "Classic Box", "กล่องซับอ่านง่าย", "classic_box"],
    ["hf_subtitle_minimal_shadow_v1", "Minimal Shadow", "ซับเงาเรียบ", "minimal_shadow"],
    ["hf_subtitle_creator_pop_v1", "Creator Pop", "ซับเด้งสไตล์ครีเอเตอร์", "creator_pop"],
    ["hf_subtitle_karaoke_word_highlight_v1", "Karaoke Word Highlight", "คาราโอเกะไฮไลต์คำ", "karaoke_word"],
    ["hf_subtitle_tiktok_red_sweep_v1", "TikTok Red Sweep", "แดงปาดคำแบบสั้น", "highlight_bar"],
    ["hf_subtitle_pill_karaoke_v1", "Pill Karaoke", "แคปชันแคปซูล", ""],
    ["hf_subtitle_marker_highlight_sweep_v1", "Marker Subtitle Sweep", "ซับไฮไลต์ปากกา", ""],
    ["hf_subtitle_lower_third_v1", "Lower Third", "ซับล่างแบบผู้รีวิว", "lower_third"],
    ["hf_subtitle_cinematic_wide_v1", "Cinematic Wide", "ซับภาพยนตร์", "cinematic_wide"],
    ["hf_subtitle_neon_glow_v1", "Neon Glow", "ซับนีออน", "neon_glow"],
    ["hf_subtitle_review_bubble_v1", "Review Bubble", "ซับกล่องรีวิว", "review_bubble"],
    ["hf_subtitle_none_v1", "No Burned Subtitle", "ไม่ใส่ซับฝัง", "no_subtitle_style"],
  ].map(([id, en, th, alias]) =>
    preset({
      id,
      category: "subtitle",
      lifecycleState: "active",
      capabilityState: id.includes("karaoke") ? "producer_ready" : "fallback_only",
      labels: { en, th },
      description: `${en} subtitle preset.`,
      promptPack: subtitlePrompt,
      variables: [{ key: "subtitleCues", label: "Subtitle cues", type: "cue_array" }],
      timingPolicy: {
        ...defaultTiming,
        supportsWordTiming: id.includes("karaoke"),
        supportsPhraseFallback: true,
      },
      safeAreaPolicy: subtitleSafeArea,
      supportedPlatformPresets: [...allVerticalPlatforms],
      runtimeSupport: id.includes("karaoke") ? producerSupport : fallbackSupport,
      productCategories: ["ecommerce", "review"],
      qaChecklist: ["subtitle_safe_area", "thai_glyphs"],
      aliases: alias ? [alias] : [],
    })
  ),
  ...[
    ["hf_audio_music_tense_cinematic_opener_v1", "Tense Cinematic Opener"],
    ["hf_audio_music_lofi_tutorial_bed_v1", "Lofi Tutorial Bed"],
    ["hf_audio_music_upbeat_ecommerce_social_v1", "Upbeat Ecommerce Social"],
    ["hf_audio_music_premium_luxury_minimal_v1", "Premium Luxury Minimal"],
    ["hf_audio_music_warm_mother_baby_v1", "Warm Mother Baby"],
    ["hf_audio_music_ai_tech_momentum_v1", "AI Tech Momentum"],
  ].map(([id, en]) =>
    preset({
      id,
      category: "music",
      lifecycleState: "candidate",
      capabilityState: "producer_ready",
      labels: { en, th: en },
      description: `${en} music bed.`,
      promptPack: audioPrompt,
      variables: [],
      timingPolicy: { ...defaultTiming, minDurationSec: 1, maxDurationSec: 120 },
      safeAreaPolicy: { ...subtitleSafeArea, placement: "bottom" },
      supportedPlatformPresets: [...allVerticalPlatforms],
      runtimeSupport: producerSupport,
      productCategories: ["ecommerce"],
      qaChecklist: ["audio_license", "audio_ducking"],
      audioAssetPolicy: {
        source: "library_selected",
        requiresLicense: true,
        requiresChecksum: true,
        musicGenerationEnabled: false,
      },
      aliases: [],
    })
  ),
  ...[
    ["hf_audio_sfx_whoosh_scene_transition_v1", "Whoosh Scene Transition"],
    ["hf_audio_sfx_button_click_tap_v1", "Button Click Tap"],
    ["hf_audio_sfx_notification_message_pop_v1", "Notification Message Pop"],
    ["hf_audio_sfx_cash_register_sales_moment_v1", "Cash Register Sales Moment"],
    ["hf_audio_sfx_riser_impact_reveal_v1", "Riser Impact Reveal"],
    ["hf_audio_sfx_extraction_ping_data_detect_v1", "Extraction Ping Data Detect"],
    ["hf_audio_sfx_keyboard_typing_loop_v1", "Keyboard Typing Loop"],
    ["hf_audio_sfx_soft_shutter_capture_pulse_v1", "Soft Shutter Capture Pulse"],
    ["hf_audio_sfx_completion_chime_v1", "Completion Chime"],
    ["hf_audio_sfx_error_warning_buzz_v1", "Error Warning Buzz"],
  ].map(([id, en]) =>
    preset({
      id,
      category: "sfx",
      lifecycleState: "candidate",
      capabilityState: "producer_ready",
      labels: { en, th: en },
      description: `${en} sound effect.`,
      promptPack: audioPrompt,
      variables: [],
      timingPolicy: { ...defaultTiming, requiresVisualTrigger: true },
      safeAreaPolicy: subtitleSafeArea,
      supportedPlatformPresets: [...allVerticalPlatforms],
      runtimeSupport: producerSupport,
      productCategories: ["ecommerce"],
      qaChecklist: ["visual_trigger", "audio_license"],
      audioAssetPolicy: {
        source: "library_selected",
        requiresLicense: true,
        requiresChecksum: true,
        musicGenerationEnabled: false,
      },
      aliases: [],
    })
  ),
  ...[
    ["hf_audio_pack_ecommerce_fast_cut_v1", "Ecommerce Fast Cut"],
    ["hf_audio_pack_tutorial_calm_v1", "Tutorial Calm"],
    ["hf_audio_pack_ai_tech_launch_v1", "AI Tech Launch"],
    ["hf_audio_pack_premium_product_luxury_v1", "Premium Product Luxury"],
    ["hf_audio_pack_mother_baby_friendly_v1", "Mother Baby Friendly"],
    ["hf_audio_pack_sales_revenue_proof_v1", "Sales Revenue Proof"],
  ].map(([id, en]) =>
    preset({
      id,
      category: "audio_pack",
      lifecycleState: "candidate",
      capabilityState: "producer_ready",
      labels: { en, th: en },
      description: `${en} audio pack.`,
      promptPack: audioPrompt,
      variables: [],
      timingPolicy: { ...defaultTiming, minDurationSec: 1, maxDurationSec: 120 },
      safeAreaPolicy: subtitleSafeArea,
      supportedPlatformPresets: [...allVerticalPlatforms],
      runtimeSupport: producerSupport,
      productCategories: ["ecommerce"],
      qaChecklist: ["audio_license", "sfx_policy"],
      audioAssetPolicy: {
        source: "library_selected",
        requiresLicense: true,
        requiresChecksum: true,
        musicGenerationEnabled: false,
      },
      aliases: [],
    })
  ),
] as const satisfies readonly HyperframesCreativePreset[];

export const HYPERFRAMES_CREATIVE_PRESET_ALIASES = Object.freeze(
  HYPERFRAMES_CREATIVE_PRESETS.reduce<Record<string, string>>((aliases, preset) => {
    for (const alias of preset.aliases) {
      aliases[alias] = preset.id;
    }
    return aliases;
  }, {})
);

export function listHyperframesCreativePresets(options: {
  includeDisabled?: boolean;
  includeCandidate?: boolean;
  category?: HyperframesCreativePreset["category"];
} = {}): HyperframesCreativePreset[] {
  return HYPERFRAMES_CREATIVE_PRESETS.map(item =>
    HyperframesCreativePresetSchema.parse(item)
  ).filter(item => {
    if (options.category && item.category !== options.category) {
      return false;
    }
    if (!options.includeDisabled && ["disabled", "archived"].includes(item.lifecycleState)) {
      return false;
    }
    if (!options.includeCandidate && item.lifecycleState === "candidate") {
      return false;
    }
    return true;
  });
}

export function resolveHyperframesCreativePresetId(id: string): string | null {
  if (HYPERFRAMES_CREATIVE_PRESETS.some(preset => preset.id === id)) {
    return id;
  }
  return HYPERFRAMES_CREATIVE_PRESET_ALIASES[id] ?? null;
}

export function getHyperframesCreativePreset(id: string): HyperframesCreativePreset | null {
  const resolved = resolveHyperframesCreativePresetId(id);
  if (!resolved) {
    return null;
  }
  return (
    listHyperframesCreativePresets({
      includeCandidate: true,
      includeDisabled: true,
    }).find(preset => preset.id === resolved) ?? null
  );
}

export function assertHyperframesCreativeRegistry(): void {
  const seen = new Set<string>();
  for (const preset of HYPERFRAMES_CREATIVE_PRESETS) {
    HyperframesCreativePresetSchema.parse(preset);
    if (seen.has(preset.id)) {
      throw new Error(`Duplicate HyperFrames creative preset id: ${preset.id}`);
    }
    seen.add(preset.id);
  }
  for (const [alias, target] of Object.entries(HYPERFRAMES_CREATIVE_PRESET_ALIASES)) {
    if (!seen.has(target)) {
      throw new Error(`HyperFrames creative alias ${alias} points to missing ${target}`);
    }
  }
}

export const HYPERFRAMES_CREATIVE_CONTRACT_VERSION =
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION;

function stableJsonStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(item => stableJsonStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJsonStringify(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

export function createHyperframesCreativePlanHash(
  plan: HyperframesCreativePlan
): string {
  const parsed = HyperframesCreativePlanSchema.parse(plan);
  return `hfcp_${fnv1a64Hex(stableJsonStringify(parsed))}`;
}
