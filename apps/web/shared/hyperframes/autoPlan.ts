import { z } from "zod";
import {
  HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
  HyperframesBlockerSchema,
  HyperframesCreditEstimateSchema,
  HyperframesPlatformPresetSchema,
  HyperframesRenderIntentSchema,
  MarketplaceAutoReviewCompositionModeSchema,
  MarketplaceAutoReviewLaunchModeSchema,
  MarketplaceAutoReviewRenderEngineSchema,
  stableHash,
} from "./contracts";
import { HyperframesFeatureAccessProjectionSchema } from "./featureAccess";
import {
  getDefaultHyperframesTemplate,
  getHyperframesPlatformPreset,
} from "./templates";

export const HyperframesSpokenLanguageSchema = z.enum([
  "en",
  "th",
  "zh",
  "ja",
  "ko",
  "es",
  "fr",
  "de",
  "vi",
  "id",
  "ms",
  "hi",
  "ar",
  "pt",
  "it",
]);

export type HyperframesSpokenLanguage = z.infer<
  typeof HyperframesSpokenLanguageSchema
>;

export const HyperframesAutoPlanDefaultsSchema = z
  .object({
    outputMode: z.enum(["storyboard_images", "full_video"]),
    frameStrategy: z.enum([
      "auto",
      "storyboard_3x3_split",
      "video_shot_start_stop",
    ]),
    audioStrategy: z.enum([
      "auto",
      "native_video_audio",
      "separate_tts_voiceover",
      "silent",
    ]),
    shotCount: z.number().int().min(7).max(9),
    overlayTextMode: z.enum(["no_text", "allow_text"]),
    imageModel: z.string().min(1).max(120),
    videoModel: z.string().min(1).max(120),
    videoStructureMode: z
      .enum([
        "per_shot",
        "adaptive_multi_shot",
        "compact_multi_shot",
        "manual_group_size",
      ])
      .default("per_shot"),
    manualVideoGroupSize: z.number().int().min(1).max(12).optional(),
    speechLanguage: HyperframesSpokenLanguageSchema.default("en"),
    creativeBrief: z.string().trim().max(2000).optional().default(""),
    qualityMode: z.enum(["fast", "balanced", "high"]),
    renderEngine: MarketplaceAutoReviewRenderEngineSchema,
    compositionMode: MarketplaceAutoReviewCompositionModeSchema,
    renderIntent: HyperframesRenderIntentSchema,
    platformPreset: HyperframesPlatformPresetSchema,
    templateId: z.string().min(1),
    templateVersion: z.string().min(1),
  })
  .strict();

export const HyperframesAutoOverrideDiffSchema = z
  .object({
    active: z.boolean(),
    fields: z.array(z.string().min(1)).default([]),
    values: z.record(z.unknown()).default({}),
    blockerCodes: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const HyperframesAutoStoryboardReviewPlanSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    contractVersion: z.literal(HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION),
    launchMode: MarketplaceAutoReviewLaunchModeSchema,
    productId: z.string().min(1),
    tenantId: z.string().min(1),
    userId: z.union([z.string(), z.number()]).optional(),
    access: HyperframesFeatureAccessProjectionSchema,
    defaults: HyperframesAutoPlanDefaultsSchema,
    canStart: z.boolean(),
    canPreview: z.boolean(),
    canSaveToLibrary: z.boolean(),
    activeRunId: z.string().min(1).nullable().optional(),
    primaryAction: z
      .object({
        actionId: z.enum([
          "start_auto_storyboard_review",
          "resume_auto_storyboard_review",
          "review_blockers",
          "use_standard_order",
        ]),
        label: z.string().min(1).max(160),
        disabled: z.boolean(),
        copyId: z.string().min(1),
      })
      .strict(),
    blockers: z.array(HyperframesBlockerSchema).default([]),
    warnings: z.array(HyperframesBlockerSchema).default([]),
    creditEstimate: HyperframesCreditEstimateSchema.nullable().optional(),
    quotaDecision: z.enum([
      "allowed",
      "free_preview_allowed",
      "needs_authorization",
      "quota_blocked",
      "credit_blocked",
      "no_charge",
    ]),
    freePreviewAvailable: z.boolean(),
    overrideDiff: HyperframesAutoOverrideDiffSchema,
    resetToAutoAvailable: z.boolean(),
    standardOrderAvailable: z.boolean(),
    planHash: z.string().min(6).max(128),
    staleAfterMs: z.number().int().min(1_000).max(300_000),
    expiresAt: z.string().min(1),
    display: z
      .object({
        title: z.string().max(160),
        summary: z.string().max(600),
        statusCopyId: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export type HyperframesAutoPlanDefaults = z.infer<
  typeof HyperframesAutoPlanDefaultsSchema
>;
export type HyperframesAutoStoryboardReviewPlan = z.infer<
  typeof HyperframesAutoStoryboardReviewPlanSchema
>;
export type HyperframesAutoOverrideDiff = z.infer<
  typeof HyperframesAutoOverrideDiffSchema
>;

const HyperframesAutoPlanOverrideFieldSchemas = {
  frameStrategy: z
    .enum(["storyboard_3x3_split", "video_shot_start_stop"])
    .optional(),
  audioStrategy: z
    .enum(["auto", "native_video_audio", "separate_tts_voiceover", "silent"])
    .optional(),
  shotCount: z.number().int().min(7).max(9).optional(),
  overlayTextMode: z.enum(["no_text", "allow_text"]).optional(),
  imageModel: z.string().min(1).max(120).optional(),
  videoModel: z.string().min(1).max(120).optional(),
  videoStructureMode: z
    .enum([
      "per_shot",
      "adaptive_multi_shot",
      "compact_multi_shot",
      "manual_group_size",
    ])
    .optional(),
  manualVideoGroupSize: z.number().int().min(1).max(12).optional(),
  speechLanguage: HyperframesSpokenLanguageSchema.optional(),
  creativeBrief: z.string().trim().max(2000).optional(),
  qualityMode: z.enum(["fast", "balanced", "high"]).optional(),
  platformPresetId: z
    .enum(["generic_vertical_9_16", "tiktok_reels_shorts_9_16"])
    .optional(),
};

export const HyperframesAutoPlanOverrideInputSchema = z
  .object(HyperframesAutoPlanOverrideFieldSchemas)
  .strict();

export type HyperframesAutoPlanOverrideInput = z.infer<
  typeof HyperframesAutoPlanOverrideInputSchema
>;

export const HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES = {
  platformPresetId: "generic_vertical_9_16",
  frameStrategy: "storyboard_3x3_split",
  audioStrategy: "native_video_audio",
  shotCount: "9",
  overlayTextMode: "no_text",
  imageModel: "google-banana-2",
  videoModel: "veo3/generate-veo-3-video-lite",
  videoStructureMode: "per_shot",
  manualVideoGroupSize: "3",
  speechLanguage: "en",
  creativeBrief: "",
  qualityMode: "balanced",
} as const satisfies Record<keyof HyperframesAutoPlanOverrideInput, string>;

export function buildDefaultHyperframesAutoPlanDefaults(
  input: {
    compositionMode?: HyperframesAutoPlanDefaults["compositionMode"];
    renderIntent?: HyperframesAutoPlanDefaults["renderIntent"];
    platformPresetId?: HyperframesAutoPlanDefaults["platformPreset"]["presetId"];
  } = {}
): HyperframesAutoPlanDefaults {
  const compositionMode = input.compositionMode ?? "storyboard_motion_preview";
  const renderIntent = input.renderIntent ?? "preview";
  const platformPresetId =
    input.platformPresetId ??
    HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.platformPresetId;
  const template = getDefaultHyperframesTemplate({
    compositionMode,
    renderIntent,
    platformPresetId,
  });
  return HyperframesAutoPlanDefaultsSchema.parse({
    outputMode: "storyboard_images",
    frameStrategy: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.frameStrategy,
    audioStrategy: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.audioStrategy,
    shotCount: Number(HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.shotCount),
    overlayTextMode: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.overlayTextMode,
    imageModel: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.imageModel,
    videoModel: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.videoModel,
    videoStructureMode:
      HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.videoStructureMode,
    manualVideoGroupSize: Number(
      HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.manualVideoGroupSize
    ),
    speechLanguage: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.speechLanguage,
    creativeBrief: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.creativeBrief,
    qualityMode: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.qualityMode,
    renderEngine: "hyperframes_composition",
    compositionMode,
    renderIntent,
    platformPreset: getHyperframesPlatformPreset(platformPresetId),
    templateId: template.templateId,
    templateVersion: template.templateVersion,
  });
}

export function normalizeHyperframesAutoPlanOverrides(
  overrides?: Record<string, unknown> | null
): Partial<HyperframesAutoPlanDefaults> {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    return {};
  }
  const normalized: Partial<HyperframesAutoPlanDefaults> = {};
  const frameStrategy =
    HyperframesAutoPlanOverrideFieldSchemas.frameStrategy.safeParse(
      overrides.frameStrategy
    );
  if (frameStrategy.success && frameStrategy.data) {
    normalized.frameStrategy = frameStrategy.data;
  }
  const audioStrategy =
    HyperframesAutoPlanOverrideFieldSchemas.audioStrategy.safeParse(
      overrides.audioStrategy
    );
  if (audioStrategy.success && audioStrategy.data) {
    normalized.audioStrategy = audioStrategy.data;
  }
  const shotCount = HyperframesAutoPlanOverrideFieldSchemas.shotCount.safeParse(
    overrides.shotCount
  );
  if (shotCount.success && shotCount.data)
    normalized.shotCount = shotCount.data;
  const overlayTextMode =
    HyperframesAutoPlanOverrideFieldSchemas.overlayTextMode.safeParse(
      overrides.overlayTextMode
    );
  if (overlayTextMode.success && overlayTextMode.data) {
    normalized.overlayTextMode = overlayTextMode.data;
  }
  const imageModel =
    HyperframesAutoPlanOverrideFieldSchemas.imageModel.safeParse(
      overrides.imageModel
    );
  if (imageModel.success && imageModel.data) {
    normalized.imageModel = imageModel.data;
  }
  const videoModel =
    HyperframesAutoPlanOverrideFieldSchemas.videoModel.safeParse(
      overrides.videoModel
    );
  if (videoModel.success && videoModel.data) {
    normalized.videoModel = videoModel.data;
  }
  const videoStructureMode =
    HyperframesAutoPlanOverrideFieldSchemas.videoStructureMode.safeParse(
      overrides.videoStructureMode
    );
  if (videoStructureMode.success && videoStructureMode.data) {
    normalized.videoStructureMode = videoStructureMode.data;
  }
  const manualVideoGroupSize =
    HyperframesAutoPlanOverrideFieldSchemas.manualVideoGroupSize.safeParse(
      overrides.manualVideoGroupSize
    );
  if (manualVideoGroupSize.success && manualVideoGroupSize.data) {
    normalized.manualVideoGroupSize = manualVideoGroupSize.data;
  }
  const speechLanguage =
    HyperframesAutoPlanOverrideFieldSchemas.speechLanguage.safeParse(
      overrides.speechLanguage
    );
  if (speechLanguage.success && speechLanguage.data) {
    normalized.speechLanguage = speechLanguage.data;
  }
  const creativeBrief =
    HyperframesAutoPlanOverrideFieldSchemas.creativeBrief.safeParse(
      overrides.creativeBrief
    );
  if (creativeBrief.success && creativeBrief.data !== undefined) {
    normalized.creativeBrief = creativeBrief.data;
  }
  const qualityMode =
    HyperframesAutoPlanOverrideFieldSchemas.qualityMode.safeParse(
      overrides.qualityMode
    );
  if (qualityMode.success && qualityMode.data) {
    normalized.qualityMode = qualityMode.data;
  }
  const platformPresetId =
    HyperframesAutoPlanOverrideFieldSchemas.platformPresetId.safeParse(
      overrides.platformPresetId
    );
  if (platformPresetId.success && platformPresetId.data) {
    normalized.platformPreset = getHyperframesPlatformPreset(
      platformPresetId.data
    );
  }
  return normalized;
}

export function applyHyperframesAutoPlanOverrides(input: {
  defaults: HyperframesAutoPlanDefaults;
  overrides?: Record<string, unknown> | null;
}): HyperframesAutoPlanDefaults {
  const normalized = normalizeHyperframesAutoPlanOverrides(input.overrides);
  const next = { ...input.defaults, ...normalized };
  const template = getDefaultHyperframesTemplate({
    compositionMode: next.compositionMode,
    renderIntent: next.renderIntent,
    platformPresetId: next.platformPreset.presetId,
  });
  return HyperframesAutoPlanDefaultsSchema.parse({
    ...next,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
  });
}

export function buildHyperframesAutoOverrideDiff(input: {
  defaults: HyperframesAutoPlanDefaults;
  overrides?: Record<string, unknown> | null;
}): HyperframesAutoOverrideDiff {
  const overrides = normalizeHyperframesAutoPlanOverrides(input.overrides);
  const defaultFields = new Set(Object.keys(input.defaults));
  const fields = Object.keys(overrides).filter(key => {
    if (!defaultFields.has(key)) return false;
    const current = (input.defaults as unknown as Record<string, unknown>)[key];
    const overrideValue = (overrides as Record<string, unknown>)[key];
    return JSON.stringify(current) !== JSON.stringify(overrideValue);
  });
  return HyperframesAutoOverrideDiffSchema.parse({
    active: fields.length > 0,
    fields,
    values: Object.fromEntries(
      fields.map(field => [
        field,
        (overrides as Record<string, unknown>)[field],
      ])
    ),
    blockerCodes: [],
  });
}

function dedupeHyperframesBlockers<T extends { code: string; copyId: string }>(
  items: T[]
): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = `${item.code}:${item.copyId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildHyperframesAutoStoryboardReviewPlan(input: {
  productId: string;
  tenantId?: string | null;
  userId?: string | number | null;
  access: z.infer<typeof HyperframesFeatureAccessProjectionSchema>;
  defaults?: HyperframesAutoPlanDefaults;
  overrides?: Record<string, unknown> | null;
  creditEstimate?: HyperframesAutoStoryboardReviewPlan["creditEstimate"];
  blockers?: HyperframesAutoStoryboardReviewPlan["blockers"];
  warnings?: HyperframesAutoStoryboardReviewPlan["warnings"];
  activeRunId?: string | null;
  now?: Date;
}): HyperframesAutoStoryboardReviewPlan {
  const now = input.now ?? new Date();
  const autoDefaults =
    input.defaults ?? buildDefaultHyperframesAutoPlanDefaults();
  const defaults = applyHyperframesAutoPlanOverrides({
    defaults: autoDefaults,
    overrides: input.overrides,
  });
  const blockers = dedupeHyperframesBlockers([
    ...(input.access.blockers ?? []),
    ...(input.blockers ?? []),
  ]);
  const warnings = dedupeHyperframesBlockers([
    ...(input.access.warnings ?? []),
    ...(input.warnings ?? []),
  ]);
  const overrideDiff = buildHyperframesAutoOverrideDiff({
    defaults: autoDefaults,
    overrides: input.overrides,
  });
  const canStart =
    input.access.capabilities.canStartAuto && blockers.length === 0;
  const primaryAction = canStart
    ? {
        actionId: "start_auto_storyboard_review" as const,
        label: "Create Auto Storyboard Review",
        disabled: false,
        copyId: "hyperframes.action.start_auto_storyboard_review",
      }
    : {
        actionId: input.access.standardOrderAvailable
          ? ("use_standard_order" as const)
          : ("review_blockers" as const),
        label: input.access.standardOrderAvailable
          ? "Use Standard Order"
          : "Review blockers",
        disabled: false,
        copyId: input.access.standardOrderAvailable
          ? "hyperframes.action.use_standard_order"
          : "hyperframes.action.review_blockers",
      };
  const planFingerprint = {
    productId: input.productId,
    tenantId: input.tenantId || "default",
    defaults,
    blockers: blockers.map(blocker => blocker.code).sort(),
    overrides: overrideDiff.values,
    activeRunId: input.activeRunId || null,
  };
  return HyperframesAutoStoryboardReviewPlanSchema.parse({
    contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
    launchMode: "auto_storyboard_review",
    productId: input.productId,
    tenantId: input.tenantId || "default",
    userId: input.userId ?? undefined,
    access: input.access,
    defaults,
    canStart,
    canPreview: canStart && input.access.capabilities.canPreview,
    canSaveToLibrary: input.access.capabilities.canSaveToLibrary,
    activeRunId: input.activeRunId || null,
    primaryAction,
    blockers,
    warnings,
    creditEstimate:
      input.creditEstimate ?? input.access.creditAndQuota.estimate ?? null,
    quotaDecision: input.access.creditAndQuota.quotaDecision,
    freePreviewAvailable: input.access.creditAndQuota.freePreviewAvailable,
    overrideDiff,
    resetToAutoAvailable: overrideDiff.active,
    standardOrderAvailable: input.access.standardOrderAvailable,
    planHash: stableHash(planFingerprint),
    staleAfterMs: 60_000,
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    display: {
      title: "Auto Storyboard Review",
      summary:
        "Backend-selected template, platform, render engine, and defaults.",
      statusCopyId:
        blockers.length > 0
          ? "hyperframes.status.blocked_needs_user"
          : "hyperframes.status.ready_for_review",
    },
  });
}
