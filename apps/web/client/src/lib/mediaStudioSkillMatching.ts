export type MediaStudioTab = "image" | "video" | "audio";

export interface MediaStudioSkillLike {
  type?: string | null;
  priority?: number | null;
}

const TAB_TYPE_PRIORITY: Record<MediaStudioTab, string[]> = {
  image: [
    "image-prompt-generation",
  ],
  video: [
    "video-prompt-generation",
  ],
  audio: [
    "audio-generation",
    "sound-effects",
  ],
};

export function getMediaStudioSkillTypePriority(
  tab: MediaStudioTab,
  type: string | null | undefined,
): number | null {
  const normalizedType = String(type || "").trim().toLowerCase();
  if (!normalizedType) return null;
  const index = TAB_TYPE_PRIORITY[tab].indexOf(normalizedType);
  return index === -1 ? null : index;
}

export function isMediaStudioSkillCompatible(
  tab: MediaStudioTab,
  skill: MediaStudioSkillLike,
): boolean {
  return getMediaStudioSkillTypePriority(tab, skill.type) !== null;
}

export function sortMediaStudioSkillsForTab<T extends MediaStudioSkillLike>(
  tab: MediaStudioTab,
  skills: T[],
): T[] {
  return [...skills]
    .filter((skill) => isMediaStudioSkillCompatible(tab, skill))
    .sort((a, b) => {
      const typePriorityA = getMediaStudioSkillTypePriority(tab, a.type) ?? Number.MAX_SAFE_INTEGER;
      const typePriorityB = getMediaStudioSkillTypePriority(tab, b.type) ?? Number.MAX_SAFE_INTEGER;
      if (typePriorityA !== typePriorityB) {
        return typePriorityA - typePriorityB;
      }
      return (b.priority ?? 50) - (a.priority ?? 50);
    });
}
