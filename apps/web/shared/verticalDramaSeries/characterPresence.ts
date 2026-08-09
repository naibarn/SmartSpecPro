/**
 * Small, conservative helpers for separating a character mentioned in a shot
 * from a character who is physically visible in that shot.
 *
 * `requiredCharacterRefs` is the physical-cast contract used by the image
 * pipeline. This module only preserves an explicit role selected by the user
 * or emitted by the storyboard skill; it never infers a role from prose.
 */

export type VerticalDramaCharacterPresenceSource = {
  characterKey: string;
  name?: string | null;
};

export type VerticalDramaCharacterPresenceClassification = {
  sceneCharacterRefs: string[];
  screenCallerCharacterRefs: string[];
};

/**
 * Compatibility helper: return physical refs after honoring only explicit
 * caller refs. The synopsis arguments remain accepted for old callers but are
 * intentionally ignored so prose cannot rewrite a user/skill decision.
 */
export function filterDeviceMediatedCharacterRefs(params: {
  characterRefs: readonly string[];
  characters: readonly VerticalDramaCharacterPresenceSource[];
  synopsis?: string | null;
}): string[] {
  return classifyDeviceMediatedCharacterRefs(params).sceneCharacterRefs;
}

/**
 * Partition one shot's references using only the explicit caller list. This is
 * a structural partition, not an LLM replacement or synopsis classifier.
 */
export function classifyDeviceMediatedCharacterRefs(params: {
  characterRefs: readonly string[];
  characters: readonly VerticalDramaCharacterPresenceSource[];
  synopsis?: string | null;
  screenCallerCharacterRefs?: readonly string[];
}): VerticalDramaCharacterPresenceClassification {
  const allCharacterRefs = Array.from(
    new Set([
      ...params.characterRefs,
      ...(params.screenCallerCharacterRefs ?? []),
    ])
  );
  const explicitCallerRefs = new Set(params.screenCallerCharacterRefs ?? []);
  const screenCallerCharacterRefs = allCharacterRefs.filter(characterKey =>
    explicitCallerRefs.has(characterKey),
  );
  const screenCallerSet = new Set(screenCallerCharacterRefs);
  return {
    sceneCharacterRefs: allCharacterRefs.filter(
      characterKey => !screenCallerSet.has(characterKey)
    ),
    screenCallerCharacterRefs,
  };
}
