/**
 * Cross-episode wardrobe continuity for normal Vertical Drama episodes.
 *
 * This module is deliberately provider- and database-free. The pipeline owns
 * loading the previous episode and roster, while this file owns the stable
 * handoff shape, prompt rendering, and deterministic validation.
 */

export const VD_CROSS_EPISODE_WARDROBE_MISMATCH =
  "VD_CROSS_EPISODE_WARDROBE_MISMATCH" as const;

export type CrossEpisodeWardrobeCatalogEntry = {
  characterKey: string;
  familyKey: string;
  variantType?: "outfit" | "age_stage" | null;
  variantLabel?: string | null;
  description?: string | null;
};

export type CrossEpisodeWardrobeLook = {
  characterKey: string;
  familyKey: string;
  lookKey: string;
  lookLabel: string;
  wardrobe: string;
};

export type CrossEpisodeWardrobeHandoff = {
  schemaVersion: "1.0";
  continuityMode: "continue";
  sourceEpisodeId: number;
  sourceEpisodeNumber: number;
  sourceShotNumber: number;
  characterLooks: CrossEpisodeWardrobeLook[];
};

export type CrossEpisodeWardrobeShot = {
  shotNumber: number;
  text?: string | null;
  characterKeys: string[];
};

export type CrossEpisodeWardrobeMismatch = {
  shotNumber: number;
  characterKey: string;
  familyKey: string;
  expectedLookKey: string;
  actualLookKey: string;
  expectedWardrobe: string;
  actualWardrobe: string;
};

type PreviousEpisodeInput = {
  id: number;
  episodeNumber: number;
  episodeKind?: string | null;
  storyboard?: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function storyboardShots(storyboard: unknown): Array<Record<string, unknown>> {
  const root = record(storyboard);
  return Array.isArray(root?.shots)
    ? root.shots
        .map(record)
        .filter((shot): shot is Record<string, unknown> => Boolean(shot))
    : [];
}

function shotNumber(shot: Record<string, unknown>): number | undefined {
  return positiveInteger(shot.shot_number ?? shot.shotNumber);
}

function wardrobeForEntry(entry: CrossEpisodeWardrobeCatalogEntry): string {
  return (
    clean(entry.description) || clean(entry.variantLabel) || entry.characterKey
  );
}

function isWardrobeEntry(entry: CrossEpisodeWardrobeCatalogEntry): boolean {
  return entry.variantType === "outfit" || entry.variantType == null;
}

/**
 * Find the last shot that contains a resolvable outfit/base look. A final shot
 * with no relevant character does not erase the last known wardrobe state.
 */
export function buildCrossEpisodeWardrobeHandoff(params: {
  previousEpisode: PreviousEpisodeInput;
  catalog: readonly CrossEpisodeWardrobeCatalogEntry[];
}): CrossEpisodeWardrobeHandoff | undefined {
  if (params.previousEpisode.episodeKind === "special_tie_in") return undefined;

  const catalogByKey = new Map(
    params.catalog.map(entry => [entry.characterKey, entry])
  );
  const shots = storyboardShots(params.previousEpisode.storyboard)
    .map(shot => ({ shot, number: shotNumber(shot) }))
    .filter(
      (item): item is { shot: Record<string, unknown>; number: number } =>
        item.number !== undefined
    )
    .sort((a, b) => b.number - a.number);

  for (const item of shots) {
    const refs = stringArray(
      item.shot.required_character_refs ?? item.shot.characters
    );
    const characterLooks: CrossEpisodeWardrobeLook[] = [];
    const seenFamilies = new Set<string>();
    const entries = refs
      .map(key => catalogByKey.get(key))
      .filter((entry): entry is CrossEpisodeWardrobeCatalogEntry =>
        Boolean(entry)
      )
      .sort(
        (a, b) =>
          Number(b.variantType === "outfit") -
          Number(a.variantType === "outfit")
      );
    for (const entry of entries) {
      if (!isWardrobeEntry(entry) || seenFamilies.has(entry.familyKey))
        continue;
      seenFamilies.add(entry.familyKey);
      characterLooks.push({
        characterKey: entry.characterKey,
        familyKey: entry.familyKey,
        lookKey: entry.characterKey,
        lookLabel: clean(entry.variantLabel) || entry.characterKey,
        wardrobe: wardrobeForEntry(entry),
      });
    }
    if (characterLooks.length === 0) continue;
    return {
      schemaVersion: "1.0",
      continuityMode: "continue",
      sourceEpisodeId: params.previousEpisode.id,
      sourceEpisodeNumber: params.previousEpisode.episodeNumber,
      sourceShotNumber: item.number,
      characterLooks,
    };
  }
  return undefined;
}

/** Explicit cues that establish a deliberate wardrobe transition. */
export function hasExplicitWardrobeChangeCue(text: unknown): boolean {
  const value = clean(text).toLocaleLowerCase();
  if (!value) return false;
  return [
    /เปลี่ยน(?:ชุด|เสื้อผ้า)/u,
    /เปลี่ยนเป็น(?:ชุด|เสื้อ|เสื้อผ้า)/u,
    /ชุดใหม่/u,
    /ถอด.{0,30}(?:สวม|ใส่)/u,
    /(?:สวม|ใส่).{0,30}(?:หลังจาก|แทนชุดเดิม)/u,
    /วันถัดมา/u,
    /เช้าวันรุ่งขึ้น/u,
    /เวลาผ่านไป/u,
    /หลายชั่วโมงต่อมา/u,
    /after changing(?: clothes| outfit)?/u,
    /changes into (?:a |her |his )?(?:new )?outfit/u,
    /the next day/u,
    /hours later/u,
  ].some(pattern => pattern.test(value));
}

function mismatchForShot(
  shot: CrossEpisodeWardrobeShot,
  expectedByFamily: Map<string, CrossEpisodeWardrobeLook>,
  catalogByKey: Map<string, CrossEpisodeWardrobeCatalogEntry>
): CrossEpisodeWardrobeMismatch[] {
  const issues: CrossEpisodeWardrobeMismatch[] = [];
  for (const key of shot.characterKeys) {
    const actual = catalogByKey.get(key);
    if (!actual || !isWardrobeEntry(actual)) continue;
    const expected = expectedByFamily.get(actual.familyKey);
    if (!expected || expected.lookKey === actual.characterKey) continue;
    issues.push({
      shotNumber: shot.shotNumber,
      characterKey: actual.characterKey,
      familyKey: actual.familyKey,
      expectedLookKey: expected.lookKey,
      actualLookKey: actual.characterKey,
      expectedWardrobe: expected.wardrobe,
      actualWardrobe: wardrobeForEntry(actual),
    });
  }
  return issues;
}

/**
 * Validate the inherited wardrobe through the current episode. A change cue
 * updates the expected look for all currently visible outfit families; absent
 * such a cue, every visible family must retain its inherited/current look.
 */
export function findCrossEpisodeWardrobeMismatches(params: {
  handoff?: CrossEpisodeWardrobeHandoff;
  shots: readonly CrossEpisodeWardrobeShot[];
  catalog: readonly CrossEpisodeWardrobeCatalogEntry[];
}): CrossEpisodeWardrobeMismatch[] {
  if (!params.handoff?.characterLooks.length) return [];
  const catalogByKey = new Map(
    params.catalog.map(entry => [entry.characterKey, entry])
  );
  const expectedByFamily = new Map(
    params.handoff.characterLooks.map(look => [look.familyKey, look])
  );
  const issues: CrossEpisodeWardrobeMismatch[] = [];

  for (const shot of [...params.shots].sort(
    (a, b) => a.shotNumber - b.shotNumber
  )) {
    const visibleEntries = shot.characterKeys
      .map(key => catalogByKey.get(key))
      .filter(
        (entry): entry is CrossEpisodeWardrobeCatalogEntry =>
          Boolean(entry) && isWardrobeEntry(entry)
      )
      .sort(
        (a, b) =>
          Number(b.variantType === "outfit") -
          Number(a.variantType === "outfit")
      );
    const hasChangeCue = hasExplicitWardrobeChangeCue(shot.text);
    if (!hasChangeCue) {
      issues.push(...mismatchForShot(shot, expectedByFamily, catalogByKey));
    }
    if (hasChangeCue) {
      const changedFamilies = new Set<string>();
      for (const entry of visibleEntries) {
        if (changedFamilies.has(entry.familyKey)) continue;
        changedFamilies.add(entry.familyKey);
        expectedByFamily.set(entry.familyKey, {
          characterKey: entry.characterKey,
          familyKey: entry.familyKey,
          lookKey: entry.characterKey,
          lookLabel: clean(entry.variantLabel) || entry.characterKey,
          wardrobe: wardrobeForEntry(entry),
        });
      }
    }
  }
  return issues;
}

export function renderCrossEpisodeWardrobeHandoff(
  handoff?: CrossEpisodeWardrobeHandoff
): string | null {
  if (!handoff?.characterLooks.length) return null;
  const lines = handoff.characterLooks.map(
    look =>
      `- ${look.familyKey}: use ${look.lookKey} (${look.lookLabel}) — ${look.wardrobe}`
  );
  return [
    "CROSS-EPISODE WARDROBE CONTINUITY (MANDATORY):",
    `This episode continues episode ${handoff.sourceEpisodeNumber}, source shot ${handoff.sourceShotNumber}. The listed look is the authoritative opening wardrobe for each visible character family. Keep it unchanged from shot 1 onward unless the episode text explicitly describes changing clothes or a clear time jump. A descriptive garment word alone is not permission to change the inherited look. Use the exact look key when that character appears:`,
    ...lines,
  ].join("\n");
}
