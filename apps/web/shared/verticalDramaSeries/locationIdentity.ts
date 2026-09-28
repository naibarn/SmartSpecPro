export type VerticalDramaLocationIdentity = {
  locationKey: string;
  name: string;
};

export function normalizeVerticalDramaLocationName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function similarityText(name: string): string {
  return normalizeVerticalDramaLocationName(name)
    .replace(/[\p{P}\p{S}]+/gu, "")
    .replace(/\s+/g, "");
}

function characterNgrams(value: string, size = 2): Set<string> {
  const chars = Array.from(value);
  if (chars.length <= size) return new Set(chars.length ? [value] : []);
  return new Set(
    Array.from({ length: chars.length - size + 1 }, (_, index) =>
      chars.slice(index, index + size).join("")
    )
  );
}

function longestCommonSubstringLength(left: string, right: string): number {
  const previous = Array(right.length + 1).fill(0) as number[];
  let longest = 0;
  for (const leftChar of left) {
    const current = Array(right.length + 1).fill(0) as number[];
    for (let index = 1; index <= right.length; index += 1) {
      if (leftChar === right[index - 1]) {
        current[index] = previous[index - 1] + 1;
        longest = Math.max(longest, current[index]);
      }
    }
    previous.splice(0, previous.length, ...current);
  }
  return longest;
}

/**
 * Returns a deterministic advisory score in [0, 1]. This is intentionally
 * not used as an automatic merge decision: Thai scene labels often share a
 * room name while referring to different zones, so callers must present the
 * result for user confirmation.
 */
export function scoreVerticalDramaLocationNameSimilarity(
  leftName: string,
  rightName: string
): number {
  const left = similarityText(leftName);
  const right = similarityText(rightName);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftNgrams = characterNgrams(left);
  const rightNgrams = characterNgrams(right);
  const intersection = Array.from(leftNgrams).filter(ngram =>
    rightNgrams.has(ngram)
  ).length;
  const dice =
    (2 * intersection) / Math.max(1, leftNgrams.size + rightNgrams.size);
  const commonSubstringCoverage =
    longestCommonSubstringLength(left, right) / Math.max(left.length, right.length);
  return Number(Math.max(dice, commonSubstringCoverage).toFixed(4));
}

export type VerticalDramaLocationSimilarityCandidate<T> = {
  location: T;
  score: number;
};

/**
 * Finds likely near-duplicate scene names for a review UI. Exact identity is
 * handled by `resolveStoryboardLocationRoster`; this helper only returns
 * bounded advisory candidates and never mutates or chooses a canonical row.
 */
export function findSimilarVerticalDramaLocationCandidates<
  T extends VerticalDramaLocationIdentity,
>(
  roster: readonly T[],
  incomingName: string,
  options: { threshold?: number; limit?: number } = {}
): Array<VerticalDramaLocationSimilarityCandidate<T>> {
  const threshold = options.threshold ?? 0.5;
  const limit = options.limit ?? 3;
  return roster
    .map(location => ({
      location,
      score: scoreVerticalDramaLocationNameSimilarity(
        incomingName,
        location.name
      ),
    }))
    .filter(candidate => candidate.score >= threshold)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.location.locationKey.localeCompare(right.location.locationKey)
    )
    .slice(0, limit);
}

export function stripOneTrailingVerticalDramaLocationQualifier(
  name: string
): string {
  return name.replace(/\s*[(（][^)）]*[)）]\s*$/, "");
}

/**
 * Deterministic location identity resolution shared by browser display and
 * server-side generation consumers. Exact key is authoritative; legacy
 * fallback allows only exact normalized-name equality, optionally after
 * removing one trailing parenthetical situation qualifier.
 */
export function resolveStoryboardLocationRoster<
  T extends VerticalDramaLocationIdentity,
>(
  roster: readonly T[],
  incomingLocationKey: string,
  incomingLocationName?: string
): T | undefined {
  const keyMatch = roster.find(row => row.locationKey === incomingLocationKey);
  if (keyMatch || !incomingLocationName) return keyMatch;

  const normalizedIncomingName =
    normalizeVerticalDramaLocationName(incomingLocationName);
  const exactNameMatch = roster.find(
    row =>
      normalizeVerticalDramaLocationName(row.name) === normalizedIncomingName
  );
  if (exactNameMatch) return exactNameMatch;

  const strippedName =
    stripOneTrailingVerticalDramaLocationQualifier(incomingLocationName);
  if (strippedName === incomingLocationName) return undefined;
  const normalizedStrippedName =
    normalizeVerticalDramaLocationName(strippedName);
  return roster.find(
    row =>
      normalizeVerticalDramaLocationName(row.name) === normalizedStrippedName
  );
}
