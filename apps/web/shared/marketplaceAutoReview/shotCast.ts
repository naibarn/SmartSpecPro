/**
 * Per-shot cast selection for Marketplace Auto Review staged runs
 * (`planning/marketplace-four-character-cast/plan.md` §2/§4/§5).
 *
 * Before this, every active character in the run's reference manifest was sent
 * to EVERY shot's start frame — `castInShot` existed in the contract but was
 * only ever written as the whole cast and was never read by image generation.
 * With a 4-person roster that is the difference between "a scene" and "all four
 * people standing in every frame".
 *
 * This module is the ONE place that answers "which character reference images
 * does shot N get, in what order". Three call sites must agree exactly or the
 * `@ImageN` tags in the prompt stop pointing at the images actually sent:
 *   1. the skill-first prompt builder (`buildStagedSingleShotRefreshInput`),
 *   2. the deterministic prompt fallback (`buildStagedImagePrompt`),
 *   3. the dispatch itself (`handleImageProvider`).
 * Keeping it pure and shared is what makes that agreement checkable.
 */

/** A cast member's per-shot look override — mirrors `StagedCastLookV1Schema`. */
export interface ShotCastLook {
  url?: string;
  portraitAssetId?: string;
  vdCharacterId?: string;
  variantLabel?: string;
}

/**
 * `castId` for the Nth character entry in the manifest.
 *
 * Cast ids are positional (`cast-1` .. `cast-4`) and are minted by
 * `deriveStagedCastFromManifest` over exactly the same
 * active-character-items list this module filters, so index alignment is the
 * contract between them.
 */
export function castIdForCharacterIndex(index: number): string {
  return `cast-${index + 1}`;
}

/**
 * The character reference items for one shot, in manifest order.
 *
 * - `castInShot` absent/empty -> every character (the legacy meaning, and what
 *   every pre-existing run's persisted state says). Never treat "no list" as
 *   "nobody": that would silently strip characters out of old runs.
 * - otherwise -> only the listed cast members, order preserved.
 * - a `castLooks` entry with a usable `url` replaces that character's image for
 *   this shot only; anything else about the entry is untouched, because a look
 *   is an outfit, not a different person.
 */
export function selectShotCharacterReferenceItems<
  T extends { url?: unknown },
>(params: {
  characterItems: readonly T[];
  castInShot?: readonly string[] | null;
  castLooks?: Record<string, ShotCastLook> | null;
}): T[] {
  const present = new Set(
    (params.castInShot ?? []).filter(
      (castId): castId is string => typeof castId === "string" && castId !== "",
    ),
  );
  const selected: T[] = [];
  params.characterItems.forEach((item, index) => {
    const castId = castIdForCharacterIndex(index);
    if (present.size > 0 && !present.has(castId)) return;
    const lookUrl = params.castLooks?.[castId]?.url;
    if (typeof lookUrl === "string" && lookUrl.trim()) {
      selected.push({ ...item, url: lookUrl.trim() });
      return;
    }
    selected.push(item);
  });
  return selected;
}

/**
 * The full ordered reference list for a shot: products first (so `@Image1..N`
 * keeps meaning "the product"), then that shot's characters.
 *
 * Product-first ordering is load-bearing — the prompt's character tags are
 * computed as `@Image{productCount + i + 1}`.
 */
export function buildShotOrderedReferenceItems<
  T extends { url?: unknown },
>(params: {
  productItems: readonly T[];
  characterItems: readonly T[];
  castInShot?: readonly string[] | null;
  castLooks?: Record<string, ShotCastLook> | null;
}): { ordered: T[]; shotCharacterItems: T[] } {
  const shotCharacterItems = selectShotCharacterReferenceItems({
    characterItems: params.characterItems,
    castInShot: params.castInShot,
    castLooks: params.castLooks,
  });
  return {
    ordered: [...params.productItems, ...shotCharacterItems],
    shotCharacterItems,
  };
}
