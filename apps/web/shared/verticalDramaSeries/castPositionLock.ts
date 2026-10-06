export const VERTICAL_DRAMA_VIEWER_POSITIONS = [
  "viewer-left",
  "viewer-center-left",
  "viewer-center",
  "viewer-center-right",
  "viewer-right",
] as const;

export type VerticalDramaViewerPosition =
  | (typeof VERTICAL_DRAMA_VIEWER_POSITIONS)[number]
  | "viewer-far-left"
  | "viewer-far-right";

export const VERTICAL_DRAMA_MAX_CAST_POSITION_LOCK_CHARACTERS = 6;

export type VerticalDramaCastPositionLock = {
  /** Exact approved/video-safe frame the user inspected. */
  assetId: string;
  /** Stable character keys ordered from the viewer's left to right. */
  orderedCharacterRefs: string[];
  confirmedAt: string;
};

/**
 * Optional, user-authored identity cues for a character in one shot. These
 * cues are deliberately shot-local: a crowded frame may contain several
 * people who are not part of the series roster, so a concise wardrobe/role
 * description can identify the speaking person more reliably than a
 * left/right coordinate.
 */
export type VerticalDramaCharacterDescriptionOverrides = Record<string, string>;

export const VERTICAL_DRAMA_CHARACTER_DESCRIPTION_MAX_LENGTH = 240;

/** Normalize a persisted/UI-provided description map and optionally scope it
 * to the shot's known character refs. Empty descriptions are omitted so an
 * empty object cleanly means "no override". */
export function normalizeVerticalDramaCharacterDescriptionOverrides(
  value: unknown,
  allowedCharacterRefs?: readonly string[]
): VerticalDramaCharacterDescriptionOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = allowedCharacterRefs
    ? new Set(allowedCharacterRefs.map(key => key.trim()).filter(Boolean))
    : undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  const normalized: VerticalDramaCharacterDescriptionOverrides = {};
  for (const [rawKey, rawDescription] of entries) {
    const key = rawKey.trim();
    const description =
      typeof rawDescription === "string"
        ? rawDescription
            .trim()
            .slice(0, VERTICAL_DRAMA_CHARACTER_DESCRIPTION_MAX_LENGTH)
        : "";
    if (!key || !description || (allowed && !allowed.has(key))) continue;
    normalized[key] = description;
  }
  return normalized;
}

export type VerticalDramaCharacterRefIdentity = {
  characterKey: string;
  characterId: string;
  parentCharacterId?: string;
};

/** Map a dialogue variant to its base cast key when only the base character
 * is physically present in the shot. Unknown refs are preserved so callers
 * can surface a useful validation error instead of silently hiding them. */
export function resolveVerticalDramaCharacterDescriptionKeys(args: {
  dialogueCharacterKeys: readonly string[];
  requiredCharacterRefs: readonly string[];
  characters: readonly VerticalDramaCharacterRefIdentity[];
}): string[] {
  const required = new Set(args.requiredCharacterRefs.map(key => key.trim()));
  const keyById = new Map(
    args.characters.map(character => [
      character.characterId,
      character.characterKey,
    ])
  );
  const characterByKey = new Map(
    args.characters.map(character => [character.characterKey, character])
  );
  const resolved = new Set<string>();
  for (const rawKey of args.dialogueCharacterKeys) {
    const key = rawKey.trim();
    if (!key) continue;
    if (required.has(key)) {
      resolved.add(key);
      continue;
    }
    const character = characterByKey.get(key);
    const parentKey = character?.parentCharacterId
      ? keyById.get(character.parentCharacterId)
      : undefined;
    resolved.add(parentKey && required.has(parentKey) ? parentKey : key);
  }
  return [...resolved];
}

/** Canonicalize variant-keyed form data to a base cast key when that base
 * character is present in the frame. This keeps writes correct even if an
 * older browser still submits the variant key. */
export function canonicalizeVerticalDramaCharacterDescriptionOverrideKeys(
  overrides: VerticalDramaCharacterDescriptionOverrides,
  requiredCharacterRefs: readonly string[],
  characters: readonly VerticalDramaCharacterRefIdentity[]
): VerticalDramaCharacterDescriptionOverrides {
  const required = new Set(requiredCharacterRefs.map(key => key.trim()));
  const keyById = new Map(
    characters.map(character => [character.characterId, character.characterKey])
  );
  const characterByKey = new Map(
    characters.map(character => [character.characterKey, character])
  );
  const result: VerticalDramaCharacterDescriptionOverrides = {};
  for (const [rawKey, description] of Object.entries(overrides)) {
    const key = rawKey.trim();
    if (required.has(key)) {
      result[key] = description;
      continue;
    }
    const character = characterByKey.get(key);
    const parentKey = character?.parentCharacterId
      ? keyById.get(character.parentCharacterId)
      : undefined;
    if (
      parentKey &&
      required.has(parentKey) &&
      !Object.hasOwn(result, parentKey)
    ) {
      result[parentKey] = description;
    } else {
      result[key] = description;
    }
  }
  return result;
}

/** Add variant speaker aliases for prompt generation while keeping persisted
 * overrides scoped to the physical frame's base cast refs. */
export function addVerticalDramaVariantCharacterDescriptionAliases(
  overrides: VerticalDramaCharacterDescriptionOverrides,
  characters: readonly VerticalDramaCharacterRefIdentity[]
): VerticalDramaCharacterDescriptionOverrides {
  const result = { ...overrides };
  const keyById = new Map(
    characters.map(character => [character.characterId, character.characterKey])
  );
  for (const character of characters) {
    if (
      !character.parentCharacterId ||
      Object.hasOwn(result, character.characterKey)
    )
      continue;
    const parentKey = keyById.get(character.parentCharacterId);
    const description = parentKey ? result[parentKey] : undefined;
    if (description) result[character.characterKey] = description;
  }
  return result;
}

export type VerticalDramaVerifiedCastPosition = {
  characterKey: string;
  name: string;
  position: VerticalDramaViewerPosition;
};

export type VerticalDramaCastPositionLockValidation =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "missing"
        | "asset_mismatch"
        | "duplicate_character"
        | "cast_mismatch"
        | "too_many_characters";
    };

const POSITION_LAYOUTS: Record<number, readonly VerticalDramaViewerPosition[]> =
  {
    1: ["viewer-center"],
    2: ["viewer-left", "viewer-right"],
    3: ["viewer-left", "viewer-center", "viewer-right"],
    4: [
      "viewer-left",
      "viewer-center-left",
      "viewer-center-right",
      "viewer-right",
    ],
    5: VERTICAL_DRAMA_VIEWER_POSITIONS,
    6: [
      "viewer-far-left",
      "viewer-left",
      "viewer-center-left",
      "viewer-center-right",
      "viewer-right",
      "viewer-far-right",
    ],
  };

export function viewerPositionsForCastCount(
  count: number
): readonly VerticalDramaViewerPosition[] {
  return POSITION_LAYOUTS[count] ?? [];
}

function uniqueTrimmed(values: readonly string[]): string[] {
  return Array.from(
    new Set(
      values
        .map(value => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );
}

export function validateVerticalDramaCastPositionLock(args: {
  lock?: VerticalDramaCastPositionLock | null;
  activeAssetId?: string | null;
  requiredCharacterRefs: readonly string[];
}): VerticalDramaCastPositionLockValidation {
  const required = uniqueTrimmed(args.requiredCharacterRefs);
  if (required.length > VERTICAL_DRAMA_MAX_CAST_POSITION_LOCK_CHARACTERS) {
    return { valid: false, reason: "too_many_characters" };
  }
  if (
    !args.lock ||
    typeof args.lock.assetId !== "string" ||
    !Array.isArray(args.lock.orderedCharacterRefs)
  ) {
    return { valid: false, reason: "missing" };
  }
  if (
    !args.activeAssetId ||
    args.lock.assetId.trim() !== String(args.activeAssetId).trim()
  ) {
    return { valid: false, reason: "asset_mismatch" };
  }
  const ordered = args.lock.orderedCharacterRefs.map(value =>
    typeof value === "string" ? value.trim() : ""
  );
  if (
    ordered.some((value, index) => !value || ordered.indexOf(value) !== index)
  ) {
    return { valid: false, reason: "duplicate_character" };
  }
  if (
    ordered.length !== required.length ||
    ordered.some(value => !required.includes(value))
  ) {
    return { valid: false, reason: "cast_mismatch" };
  }
  return { valid: true };
}

export function buildVerticalDramaVerifiedCastPositions(args: {
  lock: VerticalDramaCastPositionLock;
  characterNameByKey: ReadonlyMap<string, string>;
}): VerticalDramaVerifiedCastPosition[] {
  const positions = viewerPositionsForCastCount(
    args.lock.orderedCharacterRefs.length
  );
  if (positions.length !== args.lock.orderedCharacterRefs.length) return [];
  return args.lock.orderedCharacterRefs.map((characterKey, index) => ({
    characterKey,
    name: args.characterNameByKey.get(characterKey) ?? characterKey,
    position: positions[index],
  }));
}

function normalizeSpeakerIdentity(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

export type VerticalDramaSpeakerIdentityCandidate = {
  characterKey: string;
  name?: string | null;
};

export type VerticalDramaSpeakerIdentityResolution =
  | { status: "resolved"; characterKey: string }
  | { status: "missing" | "ambiguous" };

/**
 * Resolve an authored speaker label to a stable roster key. Stable keys win;
 * display names are accepted only when they identify exactly one candidate.
 */
export function resolveVerticalDramaSpeakerIdentity(
  speaker: string | null | undefined,
  candidates: readonly VerticalDramaSpeakerIdentityCandidate[]
): VerticalDramaSpeakerIdentityResolution {
  if (!speaker?.trim()) return { status: "missing" };
  const normalized = normalizeSpeakerIdentity(speaker);
  const exactKey = candidates.find(
    candidate => normalizeSpeakerIdentity(candidate.characterKey) === normalized
  );
  if (exactKey) {
    return { status: "resolved", characterKey: exactKey.characterKey };
  }
  const nameMatches = candidates.filter(
    candidate =>
      candidate.name && normalizeSpeakerIdentity(candidate.name) === normalized
  );
  return nameMatches.length === 1
    ? { status: "resolved", characterKey: nameMatches[0].characterKey }
    : { status: nameMatches.length > 1 ? "ambiguous" : "missing" };
}

export function requiresVerticalDramaCastPositionLock(args: {
  requiredCharacterRefs: readonly string[];
  dialogueLines: ReadonlyArray<{ characterKey?: string; lineTh?: string }>;
}): boolean {
  return (
    uniqueTrimmed(args.requiredCharacterRefs).length >= 2 &&
    args.dialogueLines.some(line => Boolean(line.lineTh?.trim()))
  );
}
