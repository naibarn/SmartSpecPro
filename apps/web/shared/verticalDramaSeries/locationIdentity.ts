export type VerticalDramaLocationIdentity = {
  locationKey: string;
  name: string;
};

export function normalizeVerticalDramaLocationName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
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
