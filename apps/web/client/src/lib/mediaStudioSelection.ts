import {
  isMediaStudioSkillCompatible,
  sortMediaStudioSkillsForTab,
  type MediaStudioSkillLike,
  type MediaStudioTab,
} from "./mediaStudioSkillMatching";

export interface MediaStudioSelectableSkill extends MediaStudioSkillLike {
  id: string;
}

export function pickMediaStudioSkillForTab<T extends MediaStudioSelectableSkill>(
  tab: MediaStudioTab,
  skills: T[],
  savedSkillId?: string | null,
): string {
  const normalizedSavedSkillId = String(savedSkillId || "").trim();
  if (normalizedSavedSkillId) {
    const savedSkill = skills.find((skill) => skill.id === normalizedSavedSkillId);
    if (savedSkill && isMediaStudioSkillCompatible(tab, savedSkill)) {
      return savedSkill.id;
    }
  }

  return sortMediaStudioSkillsForTab(tab, skills)[0]?.id || "";
}

export function canGenerateInMediaStudio(input: {
  prompt?: string | null;
  enhancedPrompt?: string | null;
  advancedRequest?: string | null;
  isGenerating: boolean;
  credits: number;
  modelCost: number;
}): boolean {
  const combinedPrompt = String(
    input.enhancedPrompt || input.prompt || input.advancedRequest || "",
  ).trim();

  return combinedPrompt.length > 0
    && !input.isGenerating
    && input.credits >= input.modelCost;
}
