import {
  HyperframesPlatformPresetSchema,
  HyperframesTemplateDescriptorSchema,
  type HyperframesPlatformPreset,
  type HyperframesPlatformPresetId,
  type HyperframesRenderIntent,
  type HyperframesTemplateDescriptor,
  type MarketplaceAutoReviewCompositionMode,
  type MarketplaceAutoReviewLaunchMode,
} from "./contracts";

export const HYPERFRAMES_TEMPLATE_COMPATIBILITY_VERSION =
  "hyperframes_template_compat_v1";

export const HYPERFRAMES_BUILT_IN_PLATFORM_PRESETS = [
  {
    presetId: "generic_vertical_9_16",
    platformPresetVersion: "1.0.0",
    label: "Generic vertical 9:16",
    width: 1080,
    height: 1920,
    fps: 24,
    durationSeconds: 15,
    maxDurationSeconds: 60,
    safeArea: { top: 160, right: 80, bottom: 260, left: 80 },
    avoidZones: [{ top: 0, right: 0, bottom: 150, left: 0 }],
    subtitlePolicy: {
      maxLines: 2,
      placement: "bottom",
      maxCharsPerLine: 32,
    },
    disclosurePolicy: {
      requiredWhenClaimed: true,
      placement: "lower_third",
      minimumVisibleSeconds: 3,
    },
    thumbnailPolicy: "optional",
    publishableCandidate: false,
    enabled: true,
    rolloutState: "enabled",
  },
  {
    presetId: "tiktok_reels_shorts_9_16",
    platformPresetVersion: "1.0.0",
    label: "TikTok/Reels/Shorts 9:16",
    width: 1080,
    height: 1920,
    fps: 24,
    durationSeconds: 15,
    maxDurationSeconds: 60,
    safeArea: { top: 180, right: 90, bottom: 320, left: 90 },
    avoidZones: [{ top: 0, right: 0, bottom: 310, left: 0 }],
    subtitlePolicy: {
      maxLines: 2,
      placement: "bottom",
      maxCharsPerLine: 30,
    },
    disclosurePolicy: {
      requiredWhenClaimed: true,
      placement: "lower_third",
      minimumVisibleSeconds: 3,
    },
    thumbnailPolicy: "required",
    publishableCandidate: true,
    enabled: true,
    rolloutState: "allowlist",
  },
  {
    presetId: "instagram_feed_square_1_1",
    platformPresetVersion: "1.0.0",
    label: "Instagram feed square 1:1",
    width: 1080,
    height: 1080,
    fps: 24,
    durationSeconds: 15,
    maxDurationSeconds: 45,
    safeArea: { top: 80, right: 80, bottom: 150, left: 80 },
    avoidZones: [],
    subtitlePolicy: {
      maxLines: 2,
      placement: "bottom",
      maxCharsPerLine: 28,
    },
    disclosurePolicy: {
      requiredWhenClaimed: true,
      placement: "bottom",
      minimumVisibleSeconds: 3,
    },
    thumbnailPolicy: "required",
    publishableCandidate: true,
    enabled: false,
    rolloutState: "disabled",
  },
  {
    presetId: "youtube_landscape_16_9",
    platformPresetVersion: "1.0.0",
    label: "YouTube landscape 16:9",
    width: 1920,
    height: 1080,
    fps: 30,
    durationSeconds: 30,
    maxDurationSeconds: 60,
    safeArea: { top: 80, right: 120, bottom: 130, left: 120 },
    avoidZones: [],
    subtitlePolicy: {
      maxLines: 2,
      placement: "lower_third",
      maxCharsPerLine: 48,
    },
    disclosurePolicy: {
      requiredWhenClaimed: true,
      placement: "end_card",
      minimumVisibleSeconds: 3,
    },
    thumbnailPolicy: "required",
    publishableCandidate: true,
    enabled: false,
    rolloutState: "disabled",
  },
] as const satisfies HyperframesPlatformPreset[];

export const HYPERFRAMES_BUILT_IN_TEMPLATES = [
  {
    templateId: "marketplace_storyboard_motion_9x9_v1",
    templateVersion: "1.0.0",
    templateContentHash: "hf_template_storyboard_motion_9x9_v1",
    label: "Storyboard motion preview",
    category: "storyboard_preview",
    lifecycleState: "active",
    enabled: true,
    supportedLaunchModes: ["auto_storyboard_review"],
    supportedCompositionModes: ["storyboard_motion_preview"],
    supportedRenderIntents: ["preview", "draft", "snapshot"],
    supportedPlatformPresets: [
      "generic_vertical_9_16",
      "tiktok_reels_shorts_9_16",
    ],
    requiredAssetSlots: ["product_image"],
    requiredCopySlots: ["product_title", "hook", "cta"],
    maxAssets: 18,
    minShots: 7,
    maxShots: 9,
    durationRangeSeconds: [7, 30],
    safeAreaRequired: true,
    disclosureRequiredWhenClaimed: true,
    compatibilitySchemaVersion: HYPERFRAMES_TEMPLATE_COMPATIBILITY_VERSION,
    approval: {
      status: "approved",
      approvedBy: "system",
      approvedAt: "2026-06-04",
      snapshotFixtureRef: "hyperframes/fixtures/storyboard-motion-9x9",
    },
    disabledReason: null,
  },
  {
    templateId: "marketplace_product_card_explainer_9_16_v1",
    templateVersion: "1.0.0",
    templateContentHash: "hf_template_product_card_explainer_9_16_v1",
    label: "Product card explainer",
    category: "product_explainer",
    lifecycleState: "active",
    enabled: true,
    supportedLaunchModes: ["auto_storyboard_review"],
    supportedCompositionModes: ["product_card_explainer"],
    supportedRenderIntents: ["draft", "final", "snapshot"],
    supportedPlatformPresets: [
      "generic_vertical_9_16",
      "tiktok_reels_shorts_9_16",
    ],
    requiredAssetSlots: ["product_image"],
    requiredCopySlots: ["product_title", "evidence_claim", "cta", "disclosure"],
    maxAssets: 12,
    minShots: 0,
    maxShots: 9,
    durationRangeSeconds: [15, 45],
    safeAreaRequired: true,
    disclosureRequiredWhenClaimed: true,
    compatibilitySchemaVersion: HYPERFRAMES_TEMPLATE_COMPATIBILITY_VERSION,
    approval: {
      status: "approved",
      approvedBy: "system",
      approvedAt: "2026-06-04",
      snapshotFixtureRef: "hyperframes/fixtures/product-card-explainer",
    },
    disabledReason: null,
  },
  {
    templateId: "marketplace_captioned_final_composite_9_16_v1",
    templateVersion: "1.0.0",
    templateContentHash: "hf_template_captioned_final_composite_9_16_v1",
    label: "Captioned final composite",
    category: "final_composite",
    lifecycleState: "active",
    enabled: true,
    supportedLaunchModes: ["auto_storyboard_review", "standard_order"],
    supportedCompositionModes: ["captioned_final_composite"],
    supportedRenderIntents: ["final", "variant", "snapshot"],
    supportedPlatformPresets: [
      "generic_vertical_9_16",
      "tiktok_reels_shorts_9_16",
    ],
    requiredAssetSlots: ["generated_clip", "audio", "subtitle"],
    requiredCopySlots: ["caption", "cta", "disclosure"],
    maxAssets: 24,
    minShots: 0,
    maxShots: 9,
    durationRangeSeconds: [15, 120],
    safeAreaRequired: true,
    disclosureRequiredWhenClaimed: true,
    compatibilitySchemaVersion: HYPERFRAMES_TEMPLATE_COMPATIBILITY_VERSION,
    approval: {
      status: "approved",
      approvedBy: "system",
      approvedAt: "2026-06-04",
      snapshotFixtureRef: "hyperframes/fixtures/captioned-final-composite",
    },
    disabledReason: null,
  },
  {
    templateId: "marketplace_social_variant_square_v1",
    templateVersion: "1.0.0",
    templateContentHash: "hf_template_social_variant_square_v1",
    label: "Square social variant",
    category: "social_variant",
    lifecycleState: "active",
    enabled: true,
    supportedLaunchModes: ["auto_storyboard_review", "standard_order"],
    supportedCompositionModes: ["product_card_explainer", "captioned_final_composite"],
    supportedRenderIntents: ["variant", "snapshot"],
    supportedPlatformPresets: ["instagram_feed_square_1_1"],
    requiredAssetSlots: ["product_image"],
    requiredCopySlots: ["product_title", "cta"],
    maxAssets: 12,
    minShots: 0,
    maxShots: 9,
    durationRangeSeconds: [8, 30],
    safeAreaRequired: true,
    disclosureRequiredWhenClaimed: true,
    compatibilitySchemaVersion: HYPERFRAMES_TEMPLATE_COMPATIBILITY_VERSION,
    approval: {
      status: "approved",
      approvedBy: "system",
      approvedAt: "2026-06-04",
      snapshotFixtureRef: "hyperframes/fixtures/social-square",
    },
    disabledReason: null,
  },
] as const satisfies HyperframesTemplateDescriptor[];

export function listHyperframesPlatformPresets(options: {
  includeDisabled?: boolean;
} = {}): HyperframesPlatformPreset[] {
  return HYPERFRAMES_BUILT_IN_PLATFORM_PRESETS.map(preset =>
    HyperframesPlatformPresetSchema.parse(preset)
  ).filter(preset => options.includeDisabled || preset.enabled);
}

export function listHyperframesBuiltInTemplates(options: {
  includeDisabled?: boolean;
  launchMode?: MarketplaceAutoReviewLaunchMode;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
  platformPresetId?: HyperframesPlatformPresetId;
} = {}): HyperframesTemplateDescriptor[] {
  return HYPERFRAMES_BUILT_IN_TEMPLATES.map(template =>
    HyperframesTemplateDescriptorSchema.parse(template)
  ).filter(template => {
    if (!options.includeDisabled) {
      if (!template.enabled || template.lifecycleState !== "active") return false;
    }
    if (
      options.launchMode &&
      !template.supportedLaunchModes.includes(options.launchMode)
    ) {
      return false;
    }
    if (
      options.compositionMode &&
      !template.supportedCompositionModes.includes(options.compositionMode)
    ) {
      return false;
    }
    if (
      options.renderIntent &&
      !template.supportedRenderIntents.includes(options.renderIntent)
    ) {
      return false;
    }
    if (
      options.platformPresetId &&
      !template.supportedPlatformPresets.includes(options.platformPresetId)
    ) {
      return false;
    }
    return true;
  });
}

export function getHyperframesPlatformPreset(
  presetId: HyperframesPlatformPresetId
): HyperframesPlatformPreset {
  const preset = HYPERFRAMES_BUILT_IN_PLATFORM_PRESETS.find(
    item => item.presetId === presetId
  );
  if (!preset) throw new Error(`Unknown HyperFrames platform preset: ${presetId}`);
  return HyperframesPlatformPresetSchema.parse(preset);
}

export function getDefaultHyperframesTemplate(input: {
  launchMode?: MarketplaceAutoReviewLaunchMode;
  compositionMode?: MarketplaceAutoReviewCompositionMode;
  renderIntent?: HyperframesRenderIntent;
  platformPresetId?: HyperframesPlatformPresetId;
} = {}): HyperframesTemplateDescriptor {
  const template = listHyperframesBuiltInTemplates({
    launchMode: input.launchMode ?? "auto_storyboard_review",
    compositionMode: input.compositionMode ?? "storyboard_motion_preview",
    renderIntent: input.renderIntent ?? "preview",
    platformPresetId: input.platformPresetId ?? "generic_vertical_9_16",
  })[0];
  if (!template) {
    throw new Error("No compatible HyperFrames template is available");
  }
  return template;
}

export function isHyperframesTemplateCompatible(input: {
  template: HyperframesTemplateDescriptor;
  launchMode: MarketplaceAutoReviewLaunchMode;
  compositionMode: MarketplaceAutoReviewCompositionMode;
  renderIntent: HyperframesRenderIntent;
  platformPresetId: HyperframesPlatformPresetId;
}): boolean {
  return (
    input.template.enabled &&
    input.template.lifecycleState === "active" &&
    input.template.supportedLaunchModes.includes(input.launchMode) &&
    input.template.supportedCompositionModes.includes(input.compositionMode) &&
    input.template.supportedRenderIntents.includes(input.renderIntent) &&
    input.template.supportedPlatformPresets.includes(input.platformPresetId)
  );
}
