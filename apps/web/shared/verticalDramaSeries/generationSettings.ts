import { z } from "zod";

export const VERTICAL_DRAMA_REASONING_EFFORTS = [
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

/**
 * The only quality control exposed to users for LLM work.  Task-specific
 * effort is resolved server-side so the UI does not make users understand
 * OpenRouter's provider-specific vocabulary.
 */
export const VERTICAL_DRAMA_LLM_QUALITY_PROFILES = [
  "balanced",
  "high",
  "maximum",
] as const;

export const verticalDramaLlmQualityProfileSchema = z.enum(
  VERTICAL_DRAMA_LLM_QUALITY_PROFILES,
);
export type VerticalDramaLlmQualityProfile =
  (typeof VERTICAL_DRAMA_LLM_QUALITY_PROFILES)[number];

export const VERTICAL_DRAMA_LLM_TASK_CLASSES = [
  "story_architecture",
  "script_generation",
  "character_design",
  "storyboard_planning",
  "semantic_quality_review",
  "visual_bible",
  "start_frame_prompt",
  "dialogue_audio",
  "video_motion",
  "location_design",
  "clip_dialogue",
  "ad_banner",
  "data_extraction",
] as const;

export const verticalDramaLlmTaskClassSchema = z.enum(
  VERTICAL_DRAMA_LLM_TASK_CLASSES,
);
export type VerticalDramaLlmTaskClass =
  (typeof VERTICAL_DRAMA_LLM_TASK_CLASSES)[number];

export const verticalDramaReasoningEffortSchema = z.enum(
  VERTICAL_DRAMA_REASONING_EFFORTS
);
export type VerticalDramaReasoningEffort =
  (typeof VERTICAL_DRAMA_REASONING_EFFORTS)[number];

export const verticalDramaEpisodeGenerationSettingsSchema = z
  .object({
    image: z
      .object({
        quality: z.string().trim().min(1).max(64).nullable().optional(),
        modelId: z.string().trim().min(1).max(256).nullable().optional(),
      })
      .optional(),
    llm: z
      .object({
        qualityProfile: verticalDramaLlmQualityProfileSchema.optional(),
        reasoning: z
          .object({
            mode: z.enum(["auto", "effort"]),
            effort: verticalDramaReasoningEffortSchema.optional(),
            modelId: z.string().trim().min(1).max(256).nullable().optional(),
          })
          .optional(),
      })
      .optional(),
  })
  .strict();

export type VerticalDramaEpisodeGenerationSettings = z.infer<
  typeof verticalDramaEpisodeGenerationSettingsSchema
>;

export function normalizeVerticalDramaEpisodeGenerationSettings(
  value: unknown
): VerticalDramaEpisodeGenerationSettings {
  const parsed = verticalDramaEpisodeGenerationSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function isVerticalDramaReasoningEffort(
  value: unknown
): value is (typeof VERTICAL_DRAMA_REASONING_EFFORTS)[number] {
  return (
    typeof value === "string" &&
    (VERTICAL_DRAMA_REASONING_EFFORTS as readonly string[]).includes(value)
  );
}

export function resolveVerticalDramaLlmQualityProfile(
  value: unknown,
): VerticalDramaLlmQualityProfile {
  const settings = normalizeVerticalDramaEpisodeGenerationSettings(value);
  const explicit = settings.llm?.qualityProfile;
  if (explicit) return explicit;

  // Existing series may only have the pre-profile effort setting. Preserve
  // its intent while migrating them to the simpler user-facing control.
  const legacyEffort = settings.llm?.reasoning?.effort;
  if (legacyEffort === "max" || legacyEffort === "xhigh") return "maximum";
  if (legacyEffort === "high") return "high";
  return "balanced";
}
