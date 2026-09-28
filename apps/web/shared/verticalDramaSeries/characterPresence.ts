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
  /** Base character key for an outfit/age-stage variant of the same person. */
  parentCharacterKey?: string | null;
};

export type VerticalDramaCharacterPresenceClassification = {
  sceneCharacterRefs: string[];
  screenCallerCharacterRefs: string[];
};

export type VerticalDramaVisualCastResolution =
  VerticalDramaCharacterPresenceClassification & {
    /** Storyboard refs that are context-only because they were not selected for this frame. */
    narrativeOnlyCharacterRefs: string[];
  };

const normalizeCharacterRefs = (
  refs: readonly string[] | undefined
): string[] =>
  Array.from(
    new Set((refs ?? []).map(ref => String(ref).trim()).filter(Boolean))
  );

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
    explicitCallerRefs.has(characterKey)
  );
  const sourceByKey = new Map(
    params.characters.map(source => [source.characterKey, source])
  );
  const familyKey = (characterKey: string): string =>
    sourceByKey.get(characterKey)?.parentCharacterKey?.trim() || characterKey;
  const screenCallerFamilyKeys = new Set(
    screenCallerCharacterRefs.map(familyKey)
  );
  return {
    sceneCharacterRefs: allCharacterRefs.filter(
      characterKey => !screenCallerFamilyKeys.has(familyKey(characterKey))
    ),
    screenCallerCharacterRefs,
  };
}

/**
 * Resolve the visual cast contract for a shot.
 *
 * When the frame has an explicit user selection, that selection is the only
 * physical-cast authority. Storyboard refs remain useful as narrative
 * context, but any ref absent from the selected cast is returned as
 * `narrativeOnlyCharacterRefs` and must not be rendered. Without an explicit
 * frame selection this keeps the older storyboard fallback intact.
 */
export function resolveVerticalDramaVisualCast(params: {
  selectedCharacterRefs?: readonly string[];
  selectedCallerCharacterRefs?: readonly string[];
  storyboardCharacterRefs?: readonly string[];
  storyboardCallerCharacterRefs?: readonly string[];
  characterSelectionIsAuthoritative?: boolean;
  characters?: readonly VerticalDramaCharacterPresenceSource[];
}): VerticalDramaVisualCastResolution {
  const storyboardCharacterRefs = normalizeCharacterRefs(
    params.storyboardCharacterRefs
  );
  const storyboardCallerCharacterRefs = normalizeCharacterRefs(
    params.storyboardCallerCharacterRefs
  );
  const selectedCharacterRefs = normalizeCharacterRefs(
    params.selectedCharacterRefs
  );
  const selectedCallerCharacterRefs = normalizeCharacterRefs(
    params.selectedCallerCharacterRefs
  );
  const useSelectedCast = params.characterSelectionIsAuthoritative === true;
  const classification = classifyDeviceMediatedCharacterRefs({
    characterRefs: useSelectedCast
      ? selectedCharacterRefs
      : storyboardCharacterRefs.length > 0
        ? storyboardCharacterRefs
        : selectedCharacterRefs,
    screenCallerCharacterRefs: useSelectedCast
      ? selectedCallerCharacterRefs
      : storyboardCallerCharacterRefs.length > 0
        ? storyboardCallerCharacterRefs
        : selectedCallerCharacterRefs,
    characters: params.characters ?? [],
  });
  const visibleRefs = new Set([
    ...classification.sceneCharacterRefs,
    ...classification.screenCallerCharacterRefs,
  ]);
  return {
    ...classification,
    narrativeOnlyCharacterRefs: storyboardCharacterRefs.filter(
      characterKey => !visibleRefs.has(characterKey)
    ),
  };
}
