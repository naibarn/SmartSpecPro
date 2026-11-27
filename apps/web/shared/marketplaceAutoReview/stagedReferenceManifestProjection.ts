export type StagedReferenceManifestProjectionInput = {
  index: number;
  url: string;
  role: string;
  label?: unknown;
  active: boolean;
  characterName?: unknown;
  characterRole?: unknown;
  vdCharacterId?: unknown;
  vdSeriesId?: unknown;
  portraitAssetId?: unknown;
  ageRange?: unknown;
  depictsMinor?: unknown;
};

/** Keep the safe, client-visible character identity and safety fields intact. */
export function projectStagedReferenceManifestEntry(
  entry: StagedReferenceManifestProjectionInput
) {
  return {
    index: entry.index,
    url: entry.url.trim(),
    role: entry.role,
    label: entry.label ? String(entry.label).trim() : undefined,
    active: entry.active,
    characterName: entry.characterName
      ? String(entry.characterName).trim()
      : undefined,
    characterRole:
      entry.characterRole === "host" || entry.characterRole === "guest"
        ? entry.characterRole
        : undefined,
    vdCharacterId: entry.vdCharacterId
      ? String(entry.vdCharacterId).trim()
      : undefined,
    vdSeriesId: entry.vdSeriesId ? String(entry.vdSeriesId).trim() : undefined,
    portraitAssetId: entry.portraitAssetId
      ? String(entry.portraitAssetId).trim()
      : undefined,
    ageRange:
      entry.ageRange === null
        ? null
        : entry.ageRange
          ? String(entry.ageRange).trim()
          : undefined,
    // Preserve explicit false too: it is materially different from unknown.
    depictsMinor:
      typeof entry.depictsMinor === "boolean" ? entry.depictsMinor : undefined,
  };
}
