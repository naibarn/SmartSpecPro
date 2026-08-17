export const VERTICAL_DRAMA_VIEWER_POSITIONS = [
  "viewer-left",
  "viewer-center-left",
  "viewer-center",
  "viewer-center-right",
  "viewer-right",
] as const;

export type VerticalDramaViewerPosition =
  (typeof VERTICAL_DRAMA_VIEWER_POSITIONS)[number];

export type VerticalDramaCastPositionLock = {
  /** Exact approved/video-safe frame the user inspected. */
  assetId: string;
  /** Stable character keys ordered from the viewer's left to right. */
  orderedCharacterRefs: string[];
  confirmedAt: string;
};

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
  if (required.length > VERTICAL_DRAMA_VIEWER_POSITIONS.length) {
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
