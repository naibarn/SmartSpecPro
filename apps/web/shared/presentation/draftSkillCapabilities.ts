export type DraftSkillCapability =
  | "article"
  | "prompt"
  | "image"
  | "video"
  | "unknown";

export interface DraftSkillDescriptor {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
  category?: string | null;
  executionMode?: string | null;
  type?: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

function looksLikeLegacyArticleSkill(skill?: DraftSkillDescriptor | null): boolean {
  if (!skill) return false;
  const haystack = [
    normalizeText(skill.id),
    normalizeText(skill.slug),
    normalizeText(skill.name),
  ].join(" ");
  return /\b(article|writer|copywriter|blog|content-writer|presentation-writer)\b/.test(haystack);
}

export function classifyDraftSkillCapability(
  skill?: DraftSkillDescriptor | null,
): DraftSkillCapability {
  if (!skill) return "unknown";

  const category = normalizeText(skill.category);
  const executionMode = normalizeText(skill.executionMode);
  const type = normalizeText(skill.type);

  if (category === "article_generation") return "article";
  if (
    category === "prompt_enhancement"
    || category === "image_prompt_generation"
    || category === "video_prompt_generation"
    || executionMode === "enhance-prompt"
    || type === "prompt-enhancement"
  ) {
    return "prompt";
  }
  if (
    category === "video_generation"
    || category === "image_video_generation"
    || type === "video-generation"
    || type === "image-video-generation"
  ) {
    return "video";
  }
  if (category === "image_generation" || type === "image-generation") {
    return "image";
  }
  if (looksLikeLegacyArticleSkill(skill)) {
    return "article";
  }
  if (executionMode === "media-generate") {
    return "image";
  }
  return "unknown";
}

export function isSupportedDraftSkill(skill?: DraftSkillDescriptor | null): boolean {
  return classifyDraftSkillCapability(skill) !== "unknown";
}

export function isArticleDraftSkill(skill?: DraftSkillDescriptor | null): boolean {
  return classifyDraftSkillCapability(skill) === "article";
}

export function shouldUseDraftSkillForMedia(skill?: DraftSkillDescriptor | null): boolean {
  const capability = classifyDraftSkillCapability(skill);
  return capability === "prompt" || capability === "image" || capability === "video";
}

export function getDraftSkillMediaType(
  skill?: DraftSkillDescriptor | null,
): "image" | "video" {
  const category = normalizeText(skill?.category);
  if (category === "video_prompt_generation") return "video";
  if (category === "image_prompt_generation") return "image";
  return classifyDraftSkillCapability(skill) === "video" ? "video" : "image";
}

export function getDraftSkillModeLabel(skill?: DraftSkillDescriptor | null): string {
  const category = normalizeText(skill?.category);
  if (category === "image_prompt_generation") {
    return "Create Prompt for Image Generation";
  }
  if (category === "video_prompt_generation") {
    return "Create Prompt for Video Generation";
  }
  switch (classifyDraftSkillCapability(skill)) {
    case "article":
      return "Article Generation";
    case "prompt":
      return "Prompt Enhancement";
    case "image":
      return "Image Generation";
    case "video":
      return "Video Generation";
    default:
      return "Unsupported";
  }
}
