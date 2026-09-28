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
import {
  DEFAULT_MARKETPLACE_START_FRAME_PROMPT_STYLE,
  MARKETPLACE_START_FRAME_PROMPT_STYLES,
} from "../marketplaceCapture/startFramePromptStyle";
import { MarketplaceCharacterCastInputSchema } from "./characterCast";

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

/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 01 §5.3.2. Five new optional override fields shared between the defaults
 * schema and the override-input schema. Deliberately `.optional()` with NO
 * `.default()` on either side (binding decision §3.4): an unconditional
 * default would inject new keys into every `getAutoStoryboardReviewPlan`
 * response and break byte-identical output for flag-off tenants. Bounds are
 * binding for cross-section consistency (spec §5.3.2).
 */
const feature136AutoPlanOverrideFieldSchemas = {
  confirmedAttributes: z
    .record(z.string().trim().min(1).max(120), z.string().trim().max(500))
    .refine(value => Object.keys(value).length <= 40, {
      message: "confirmedAttributes cannot exceed 40 entries",
    })
    .optional(),
  forbiddenClaims: z
    .array(z.string().trim().min(1).max(200))
    .max(50)
    .optional(),
  targetAudience: z.string().trim().min(1).max(500).optional(),
  userRequirements: z.string().trim().min(1).max(2000).optional(),
  sequentialImagePromptMaxChars: z.number().int().min(1000).max(4000).optional(),
  /**
   * Feature 136 section 13 (§4 deliverable 2) — optional cinematic-prompt
   * style layer for the sequential storyboard's start-frame/video prompts.
   * `.optional()` with NO `.default()`, same rationale as the five fields
   * above: an unconditional default would inject a new key into every
   * `getAutoStoryboardReviewPlan` response and break byte-identical output
   * for tenants/runs that never ask for it. Default value materializes only
   * inside `productReviewSequentialStoryboardSkillRunner.ts` (section 13
   * §5), never here.
   */
  startFramePromptStyle: z.enum(MARKETPLACE_START_FRAME_PROMPT_STYLES).optional(),
  /**
   * Creation-time drama casting (planning/marketplace-flexible-shots-and-
   * creation-casting/plan.md, W2). Same "optional, no `.default()`"
   * rationale as the fields above — an unconditional default would inject a
   * new key into every `getAutoStoryboardReviewPlan` response and break
   * byte-identical output for every request that never asks for a cast.
   */
  characterCast: MarketplaceCharacterCastInputSchema,
};

export const HyperframesAutoPlanDefaultsSchema = z
  .object({
    outputMode: z.enum(["storyboard_images", "full_video"]),
    frameStrategy: z.enum([
      "auto",
      "storyboard_3x3_split",
      "video_shot_start_stop",
      "sequential_shot_storyboard",
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
    motionDirection: z.string().trim().max(2000).optional().default(""),
    characterPresenceMode: z
      .enum(["auto", "every_frame", "most_frames"])
      .default("auto"),
    qualityMode: z.enum(["fast", "balanced", "high"]),
    visionQaModel: z.string().min(1).max(120).nullable().optional().default(null),
    // LLM that authors the story plan / runs the storyboard skill. Absent =
    // "อัตโนมัติ", which resolves from the admin-curated RECOMMENDED set
    // (`planning/marketplace-four-character-cast/plan.md`).
    storyPlanningModel: z.string().min(1).max(120).optional(),
    renderEngine: MarketplaceAutoReviewRenderEngineSchema,
    compositionMode: MarketplaceAutoReviewCompositionModeSchema,
    renderIntent: HyperframesRenderIntentSchema,
    platformPreset: HyperframesPlatformPresetSchema,
    templateId: z.string().min(1),
    templateVersion: z.string().min(1),
    ...feature136AutoPlanOverrideFieldSchemas,
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
  // Feature 136 section 09 (§5.2) — added so a caller can request
  // `full_video` at plan time (needed for the start-frame capability
  // blocker below to ever be reachable; `outputMode` was previously
  // hardcoded to `"storyboard_images"` with no override path at all).
  // `.optional()`, defaults unchanged ⇒ byte-identical for every existing
  // caller that never mentions it.
  outputMode: z.enum(["storyboard_images", "full_video"]).optional(),
  frameStrategy: z
    .enum([
      "storyboard_3x3_split",
      "video_shot_start_stop",
      "sequential_shot_storyboard",
    ])
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
  motionDirection: z.string().trim().min(1).max(2000).optional(),
  characterPresenceMode: z
    .enum(["auto", "every_frame", "most_frames"])
    .optional(),
  qualityMode: z.enum(["fast", "balanced", "high"]).optional(),
  visionQaModel: z.string().min(1).max(120).optional().nullable(),
  storyPlanningModel: z.string().min(1).max(120).optional().nullable(),
  platformPresetId: z
    .enum(["generic_vertical_9_16", "tiktok_reels_shorts_9_16"])
    .optional(),
  ...feature136AutoPlanOverrideFieldSchemas,
};

export const HyperframesAutoPlanOverrideInputSchema = z
  .object(HyperframesAutoPlanOverrideFieldSchemas)
  .strict();

export type HyperframesAutoPlanOverrideInput = z.infer<
  typeof HyperframesAutoPlanOverrideInputSchema
>;

export const HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES = {
  // Feature 136 section 09 (§5.2) — see the schema comment above.
  outputMode: "storyboard_images",
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
  motionDirection: "",
  characterPresenceMode: "auto",
  qualityMode: "balanced",
  visionQaModel: "",
  storyPlanningModel: "",
  // Feature 136 — decorative string entries only, required by the
  // `satisfies Record<...>` compile-time constraint below.
  // `buildDefaultHyperframesAutoPlanDefaults` must NOT read these: the five
  // new override fields stay absent-by-default (binding decision §3.4).
  confirmedAttributes: "",
  forbiddenClaims: "",
  targetAudience: "",
  userRequirements: "",
  sequentialImagePromptMaxChars: "4000",
  // Feature 136 section 13 — decorative string entry only, required by the
  // `satisfies Record<...>` compile-time constraint below.
  // `buildDefaultHyperframesAutoPlanDefaults` must NOT read this: the field
  // stays absent-by-default (same rationale as the five fields above).
  startFramePromptStyle: DEFAULT_MARKETPLACE_START_FRAME_PROMPT_STYLE,
  // Creation-time drama casting — decorative string entry only, required by
  // the `satisfies Record<...>` compile-time constraint below.
  // `buildDefaultHyperframesAutoPlanDefaults` must NOT read this: the field
  // stays absent-by-default (same rationale as the fields above).
  characterCast: "",
} as const satisfies Record<keyof HyperframesAutoPlanOverrideInput, string>;

/**
 * Feature 136 (section 10, §5.1) — shared source of truth for the sequential
 * storyboard's fixed image job count and worker-complexity factor. No server
 * imports here (client-safe); the server estimate call site and the client
 * plan-summary component both read from this module.
 */
/** Fixed sequential unit count (spec §5 v1: shot_count = 9, MAX_SHOT_COUNT). */
export const HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT = 9;

/** Sequential worker-complexity factor (spec §22; tune here, not via env/DB). */
export const HYPERFRAMES_SEQUENTIAL_STORYBOARD_COMPLEXITY_FACTOR = 1.1;

/**
 * Image jobs a run of this strategy submits, for estimate display only
 * (binding decision §3.1 — never multiplies `estimatedCredits`). Reads only
 * `frameStrategy`; the result never depends on `shotCount` (binding decision
 * §3.3). `video_shot_start_stop` actually submits `shots.length × 2` jobs but
 * that correction is deliberately deferred (section-10 spec §9) to avoid
 * changing an existing strategy's byte-identical plan output.
 */
export function resolveHyperframesAutoPlanImageJobCount(
  defaults: Pick<HyperframesAutoPlanDefaults, "frameStrategy">
): number {
  return defaults.frameStrategy === "sequential_shot_storyboard"
    ? HYPERFRAMES_SEQUENTIAL_STORYBOARD_IMAGE_JOB_COUNT
    : 1;
}

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
    // Feature 136 section 09 (§5.2) — was hardcoded; now single-sourced from
    // the same base-values constant every other overridable field reads
    // from, so `applyHyperframesAutoPlanOverrides` can actually change it.
    outputMode: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.outputMode,
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
    motionDirection: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.motionDirection,
    characterPresenceMode:
      HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.characterPresenceMode,
    qualityMode: HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.qualityMode,
    visionQaModel: null,
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
  // Feature 136 section 09 (§5.2) — see the schema comment above.
  const outputMode = HyperframesAutoPlanOverrideFieldSchemas.outputMode.safeParse(
    overrides.outputMode
  );
  if (outputMode.success && outputMode.data) {
    normalized.outputMode = outputMode.data;
  }
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
  const motionDirection =
    HyperframesAutoPlanOverrideFieldSchemas.motionDirection.safeParse(
      overrides.motionDirection
    );
  if (motionDirection.success && motionDirection.data !== undefined) {
    normalized.motionDirection = motionDirection.data;
  }
  const characterPresenceMode =
    HyperframesAutoPlanOverrideFieldSchemas.characterPresenceMode.safeParse(
      overrides.characterPresenceMode
    );
  if (characterPresenceMode.success && characterPresenceMode.data) {
    normalized.characterPresenceMode = characterPresenceMode.data;
  }
  const qualityMode =
    HyperframesAutoPlanOverrideFieldSchemas.qualityMode.safeParse(
      overrides.qualityMode
    );
  if (qualityMode.success && qualityMode.data) {
    normalized.qualityMode = qualityMode.data;
  }
  const visionQaModel =
    HyperframesAutoPlanOverrideFieldSchemas.visionQaModel.safeParse(
      overrides.visionQaModel
    );
  if (visionQaModel.success && visionQaModel.data) {
    normalized.visionQaModel = visionQaModel.data;
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
  // Feature 136 (section 01, §5.3.4) — five new optional override fields.
  // Each drops silently on validation failure (out-of-bounds values,
  // non-integers, or empty-after-trim strings via `.min(1)`), mirroring the
  // existing field patterns above. None of these inject a default value.
  const confirmedAttributes =
    HyperframesAutoPlanOverrideFieldSchemas.confirmedAttributes.safeParse(
      overrides.confirmedAttributes
    );
  if (confirmedAttributes.success && confirmedAttributes.data !== undefined) {
    normalized.confirmedAttributes = confirmedAttributes.data;
  }
  const forbiddenClaims =
    HyperframesAutoPlanOverrideFieldSchemas.forbiddenClaims.safeParse(
      overrides.forbiddenClaims
    );
  if (forbiddenClaims.success && forbiddenClaims.data !== undefined) {
    normalized.forbiddenClaims = forbiddenClaims.data;
  }
  const targetAudience =
    HyperframesAutoPlanOverrideFieldSchemas.targetAudience.safeParse(
      overrides.targetAudience
    );
  if (targetAudience.success && targetAudience.data) {
    normalized.targetAudience = targetAudience.data;
  }
  const userRequirements =
    HyperframesAutoPlanOverrideFieldSchemas.userRequirements.safeParse(
      overrides.userRequirements
    );
  if (userRequirements.success && userRequirements.data) {
    normalized.userRequirements = userRequirements.data;
  }
  const sequentialImagePromptMaxChars =
    HyperframesAutoPlanOverrideFieldSchemas.sequentialImagePromptMaxChars.safeParse(
      overrides.sequentialImagePromptMaxChars
    );
  if (
    sequentialImagePromptMaxChars.success &&
    sequentialImagePromptMaxChars.data
  ) {
    normalized.sequentialImagePromptMaxChars =
      sequentialImagePromptMaxChars.data;
  }
  // Feature 136 section 13 (§4 deliverable 2) — same "safeParse, assign only
  // on success with a present value, never inject a default" convention as
  // the five fields above.
  const startFramePromptStyle =
    HyperframesAutoPlanOverrideFieldSchemas.startFramePromptStyle.safeParse(
      overrides.startFramePromptStyle
    );
  if (startFramePromptStyle.success && startFramePromptStyle.data) {
    normalized.startFramePromptStyle = startFramePromptStyle.data;
  }
  // Creation-time drama casting (W2) — array field, same "assign only when
  // present" convention as `forbiddenClaims`/`confirmedAttributes` above (an
  // explicit empty array is still a meaningful override: "no cast").
  const characterCast =
    HyperframesAutoPlanOverrideFieldSchemas.characterCast.safeParse(
      overrides.characterCast
    );
  if (characterCast.success && characterCast.data !== undefined) {
    normalized.characterCast = characterCast.data;
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
