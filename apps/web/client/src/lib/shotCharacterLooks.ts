/**
 * Per-shot LOOK switching, shared by Vertical Drama's storyboard shot card and
 * Marketplace Auto Review's staged shot card
 * (`planning/marketplace-four-character-cast/plan.md` §6).
 *
 * Both surfaces answer the same two questions — "which looks can this character
 * chip switch to?" and "how do I swap one character key for another in a shot's
 * cast list?" — over different portrait shapes. The logic is generic over the
 * shape so neither surface carries a copy that can drift from the other.
 *
 * Extracted from `VerticalDramaStoryboardPanel.tsx`, which re-exports these so
 * its own suite keeps exercising the exact same functions.
 */

/** Minimum shape a character entry needs to participate in look switching. */
export interface ShotLookCharacterFields {
  /** This row's own id. For a LOOK this is the variant row, not the base. */
  characterId: string;
  /** The look family's root; absent/null means this row IS a base character. */
  parentCharacterId?: string | null;
  name?: string;
  /** The look's own label ("ชุดลำลอง"). Absent for a base character. */
  variantLabel?: string | null;
  variantType?: "outfit" | "age_stage";
  portraitUrl?: string | null;
}

/** One switchable option for a character chip. */
export interface ShotCharacterLookOption {
  /** The key the shot's cast list stores for this option. */
  key: string;
  characterId: string;
  /** The look's own label, or the character name for the base entry. */
  label: string;
  portraitUrl: string | null;
  isBase: boolean;
  variantType?: "outfit" | "age_stage";
}

/**
 * Every look the chip keyed by `chipKey` can switch to — the family's base
 * character plus all of its variants.
 *
 * Rooted at the base character (`parentCharacterId` when the chip is already a
 * look, else the chip's own id), so switching works identically whether the
 * shot currently references the base or one of its looks.
 *
 * Returns an EMPTY list when the family has nothing to switch between, which is
 * the caller's signal to hide the affordance entirely — a plain character with
 * no looks, or an uploaded photo with no family at all.
 */
export function buildShotCharacterLookOptionsFromEntries(
  entries: ReadonlyArray<readonly [key: string, character: ShotLookCharacterFields]>,
  chipKey: string
): ShotCharacterLookOption[] {
  const byKey = new Map(entries);
  const self = byKey.get(chipKey);
  if (!self) return [];
  const rootCharacterId = self.parentCharacterId ?? self.characterId;
  const options: ShotCharacterLookOption[] = [];
  const rootEntry = entries.find(
    ([, character]) =>
      character.characterId === rootCharacterId && !character.parentCharacterId
  );
  if (rootEntry) {
    options.push({
      key: rootEntry[0],
      characterId: rootEntry[1].characterId,
      label: rootEntry[1].name ?? rootEntry[1].characterId,
      portraitUrl: rootEntry[1].portraitUrl ?? null,
      isBase: true,
    });
  }
  for (const [key, character] of entries) {
    if (character.parentCharacterId !== rootCharacterId) continue;
    options.push({
      key,
      characterId: character.characterId,
      label: character.variantLabel ?? character.name ?? key,
      portraitUrl: character.portraitUrl ?? null,
      isBase: false,
      ...(character.variantType ? { variantType: character.variantType } : {}),
    });
  }
  return options.length > 1 ? options : [];
}

/**
 * Replace ONE character key in a shot's reference list with another, in place.
 *
 * Switching a look is a REPLACE, never an add: leaving both the base and the
 * look selected would put the same person in the frame twice. Order is
 * preserved (the chip stays where it was) and any pre-existing occurrence of
 * the target elsewhere in the list is dropped, so the result can never contain
 * duplicates. Selecting the key already in use returns the list unchanged.
 */
export function swapShotCharacterRefKey(
  keys: readonly string[],
  fromKey: string,
  toKey: string
): string[] {
  if (fromKey === toKey) return [...keys];
  const swapped = keys.map(key => (key === fromKey ? toKey : key));
  return swapped.filter((key, index) => swapped.indexOf(key) === index);
}
