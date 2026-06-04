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

export const HyperframesAutoPlanDefaultsSchema = z
  .object({
    outputMode: z.enum(["storyboard_images", "full_video"]),
    frameStrategy: z.enum(["auto", "storyboard_3x3_split", "video_shot_start_stop"]),
    audioStrategy: z.enum([
      "auto",
      "native_video_audio",
      "separate_tts_voiceover",
      "silent",
    ]),
    shotCount: z.number().int().min(7).max(9),
    overlayTextMode: z.enum(["no_text", "allow_text"]),
    imageModel: z.enum(["google-nano-banana-pro", "google-banana-2"]),
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

export function buildDefaultHyperframesAutoPlanDefaults(input: {
  compositionMode?: HyperframesAutoPlanDefaults["compositionMode"];
  renderIntent?: HyperframesAutoPlanDefaults["renderIntent"];
  platformPresetId?: HyperframesAutoPlanDefaults["platformPreset"]["presetId"];
} = {}): HyperframesAutoPlanDefaults {
  const compositionMode = input.compositionMode ?? "storyboard_motion_preview";
  const renderIntent = input.renderIntent ?? "preview";
  const platformPresetId = input.platformPresetId ?? "generic_vertical_9_16";
  const template = getDefaultHyperframesTemplate({
    compositionMode,
    renderIntent,
    platformPresetId,
  });
  return HyperframesAutoPlanDefaultsSchema.parse({
    outputMode: "storyboard_images",
    frameStrategy: "storyboard_3x3_split",
    audioStrategy: "native_video_audio",
    shotCount: 9,
    overlayTextMode: "no_text",
    imageModel: "google-nano-banana-pro",
    qualityMode: "balanced",
    renderEngine: "hyperframes_composition",
    compositionMode,
    renderIntent,
    platformPreset: getHyperframesPlatformPreset(platformPresetId),
    templateId: template.templateId,
    templateVersion: template.templateVersion,
  });
}

export function buildHyperframesAutoOverrideDiff(input: {
  defaults: HyperframesAutoPlanDefaults;
  overrides?: Record<string, unknown> | null;
}): HyperframesAutoOverrideDiff {
  const overrides = input.overrides ?? {};
  const defaultFields = new Set(Object.keys(input.defaults));
  const fields = Object.keys(overrides).filter(key => {
    if (!defaultFields.has(key)) return false;
    const current = (input.defaults as unknown as Record<string, unknown>)[key];
    return JSON.stringify(current) !== JSON.stringify(overrides[key]);
  });
  return HyperframesAutoOverrideDiffSchema.parse({
    active: fields.length > 0,
    fields,
    values: Object.fromEntries(fields.map(field => [field, overrides[field]])),
    blockerCodes: [],
  });
}

export function buildHyperframesAutoStoryboardReviewPlan(input: {
  productId: string;
  tenantId?: string | null;
  userId?: string | number | null;
  access: z.infer<typeof HyperframesFeatureAccessProjectionSchema>;
  defaults?: HyperframesAutoPlanDefaults;
  overrides?: Record<string, unknown> | null;
  blockers?: HyperframesAutoStoryboardReviewPlan["blockers"];
  warnings?: HyperframesAutoStoryboardReviewPlan["warnings"];
  activeRunId?: string | null;
  now?: Date;
}): HyperframesAutoStoryboardReviewPlan {
  const now = input.now ?? new Date();
  const defaults = input.defaults ?? buildDefaultHyperframesAutoPlanDefaults();
  const blockers = [...(input.access.blockers ?? []), ...(input.blockers ?? [])];
  const warnings = [...(input.access.warnings ?? []), ...(input.warnings ?? [])];
  const overrideDiff = buildHyperframesAutoOverrideDiff({
    defaults,
    overrides: input.overrides,
  });
  const canStart = input.access.capabilities.canStartAuto && blockers.length === 0;
  const primaryAction = input.activeRunId
    ? {
        actionId: "resume_auto_storyboard_review" as const,
        label: "Resume Auto Storyboard Review",
        disabled: false,
        copyId: "hyperframes.action.resume_auto_storyboard_review",
      }
    : canStart
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
    primaryAction,
    blockers,
    warnings,
    creditEstimate: input.access.creditAndQuota.estimate ?? null,
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
      summary: "Backend-selected template, platform, render engine, and defaults.",
      statusCopyId:
        blockers.length > 0
          ? "hyperframes.status.blocked_needs_user"
          : "hyperframes.status.ready_for_review",
    },
  });
}
