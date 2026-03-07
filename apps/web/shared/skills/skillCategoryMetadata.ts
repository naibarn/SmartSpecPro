export type SkillExecutionMode =
  | "llm-only"
  | "media-generate"
  | "enhance-prompt"
  | "python";

export type SkillMediaModelType = "image" | "video" | "audio" | "image-video";

function normalize(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

const CATEGORY_ALLOWED_EXECUTION_MODES: Partial<Record<string, SkillExecutionMode[]>> = {
  article_generation: ["llm-only"],
  prompt_enhancement: ["llm-only", "enhance-prompt"],
  image_prompt_generation: ["llm-only", "enhance-prompt"],
  video_prompt_generation: ["llm-only", "enhance-prompt"],
  image_generation: ["media-generate"],
  video_generation: ["media-generate"],
  image_video_generation: ["media-generate"],
  audio_generation: ["media-generate"],
  sound_effects: ["media-generate"],
};

const CATEGORY_MEDIA_MODEL_TYPE: Partial<Record<string, SkillMediaModelType>> = {
  image_generation: "image",
  video_generation: "video",
  image_video_generation: "image-video",
  audio_generation: "audio",
  sound_effects: "audio",
};

export function getAllowedExecutionModesForSkillCategory(
  category: string | null | undefined,
): SkillExecutionMode[] {
  const normalizedCategory = normalize(category);
  return CATEGORY_ALLOWED_EXECUTION_MODES[normalizedCategory] || [
    "llm-only",
    "media-generate",
    "enhance-prompt",
    "python",
  ];
}

export function getRecommendedExecutionModeForSkillCategory(
  category: string | null | undefined,
): SkillExecutionMode | null {
  const allowedModes = getAllowedExecutionModesForSkillCategory(category);
  return allowedModes[0] ?? null;
}

export function isExecutionModeCompatibleWithSkillCategory(
  category: string | null | undefined,
  executionMode: string | null | undefined,
): boolean {
  const normalizedExecutionMode = normalize(executionMode);
  if (!normalizedExecutionMode) return true;
  return getAllowedExecutionModesForSkillCategory(category).includes(
    normalizedExecutionMode as SkillExecutionMode,
  );
}

export function isPromptGenerationSkillCategory(
  category: string | null | undefined,
): boolean {
  const normalizedCategory = normalize(category);
  return normalizedCategory === "image_prompt_generation"
    || normalizedCategory === "video_prompt_generation"
    || normalizedCategory === "prompt_enhancement";
}

export function isImagePromptSkillCategory(
  category: string | null | undefined,
): boolean {
  return normalize(category) === "image_prompt_generation";
}

export function isVideoPromptSkillCategory(
  category: string | null | undefined,
): boolean {
  return normalize(category) === "video_prompt_generation";
}

export function getMediaModelTypeForSkillCategory(
  category: string | null | undefined,
): SkillMediaModelType | null {
  return CATEGORY_MEDIA_MODEL_TYPE[normalize(category)] || null;
}
