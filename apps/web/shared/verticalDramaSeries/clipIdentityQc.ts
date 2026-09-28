/** Pure Feature 137 P3 clip-identity-QC helpers. */

export const VD_CLIP_IDENTITY_VERDICTS = [
  "consistent",
  "minor_drift",
  "identity_break",
] as const;

export type VdClipIdentityVerdict = (typeof VD_CLIP_IDENTITY_VERDICTS)[number];
export type VdClipIdentityDriftKind =
  | "face"
  | "hair"
  | "age"
  | "wardrobe"
  | "character_swap";

export type VdClipIdentityCharacterResult = {
  characterKey?: string;
  name?: string;
  verdict: VdClipIdentityVerdict;
  driftKind?: VdClipIdentityDriftKind;
  worstFrameIndex?: number;
  note?: string;
};

export type VdClipIdentityQcAnalysis = {
  characters: VdClipIdentityCharacterResult[];
};

export function resolveClipIdentityQcStatus(
  analysis: VdClipIdentityQcAnalysis | undefined,
): "pass" | "warn" | "fail" {
  const verdicts = analysis?.characters?.map(character => character.verdict) ?? [];
  if (verdicts.includes("identity_break")) return "fail";
  if (verdicts.includes("minor_drift")) return "warn";
  return "pass";
}

export function normalizeClipIdentityQcAnalysis(
  value: unknown,
  expectedCharacters: Array<{ characterKey: string; name: string }> = [],
): VdClipIdentityQcAnalysis {
  const rawCharacters =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).characters
      : undefined;
  const rows = Array.isArray(rawCharacters) ? rawCharacters : [];
  const allowedDriftKinds = new Set<VdClipIdentityDriftKind>([
    "face",
    "hair",
    "age",
    "wardrobe",
    "character_swap",
  ]);
  const normalized = rows
    .map(row => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const record = row as Record<string, unknown>;
      const verdict = record.verdict;
      if (!VD_CLIP_IDENTITY_VERDICTS.includes(verdict as VdClipIdentityVerdict)) return null;
      const characterKey = typeof record.character_key === "string"
        ? record.character_key.trim().slice(0, 120)
        : typeof record.characterKey === "string"
          ? record.characterKey.trim().slice(0, 120)
          : undefined;
      const name = typeof record.name === "string" ? record.name.trim().slice(0, 120) : undefined;
      const rawDriftKind = typeof record.drift_kind === "string"
        ? record.drift_kind
        : record.driftKind;
      const driftKind = allowedDriftKinds.has(rawDriftKind as VdClipIdentityDriftKind)
        ? rawDriftKind as VdClipIdentityDriftKind
        : undefined;
      const worstFrameIndex = Number(record.worst_frame_index ?? record.worstFrameIndex);
      const note = typeof record.note === "string" ? record.note.trim().slice(0, 500) : undefined;
      return {
        ...(characterKey ? { characterKey } : {}),
        ...(name ? { name } : {}),
        verdict: verdict as VdClipIdentityVerdict,
        ...(driftKind ? { driftKind } : {}),
        ...(Number.isInteger(worstFrameIndex) && worstFrameIndex >= 0
          ? { worstFrameIndex }
          : {}),
        ...(note ? { note } : {}),
      } satisfies VdClipIdentityCharacterResult;
    })
    .filter((row): row is VdClipIdentityCharacterResult => Boolean(row))
    .slice(0, 20);

  // Preserve the roster order and make missing model rows explicit as a
  // conservative identity break. The vision call is advisory, but silently
  // dropping a required character would make the badge falsely green.
  const byIdentifier = new Map<string, VdClipIdentityCharacterResult>();
  for (const row of normalized) {
    if (row.characterKey) byIdentifier.set(`key:${row.characterKey}`, row);
    if (row.name) byIdentifier.set(`name:${row.name.trim().toLowerCase()}`, row);
  }
  const completed = expectedCharacters.map(character =>
    byIdentifier.get(`key:${character.characterKey}`) ??
    byIdentifier.get(`name:${character.name.trim().toLowerCase()}`) ?? {
      characterKey: character.characterKey,
      name: character.name,
      verdict: "identity_break" as const,
      note: "Vision QA did not return a verdict for this required character.",
    },
  );
  const extras = normalized.filter(row => !completed.some(item =>
    (item.characterKey && row.characterKey && item.characterKey === row.characterKey) ||
    (item.name && row.name && item.name.trim().toLowerCase() === row.name.trim().toLowerCase()),
  ));
  return { characters: [...completed, ...extras].slice(0, 20) };
}
