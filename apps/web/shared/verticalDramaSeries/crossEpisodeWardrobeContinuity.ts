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

export type CrossEpisodeWardrobeContext = {
  locationKey?: string;
  locationLabel?: string;
  timeMarker?: string;
  text?: string;
};

export type CrossEpisodeWardrobeHandoff = {
  schemaVersion: "1.0";
  continuityMode: "continue";
  sourceEpisodeId: number;
  sourceEpisodeNumber: number;
  sourceShotNumber: number;
  sourceContext?: CrossEpisodeWardrobeContext;
  characterLooks: CrossEpisodeWardrobeLook[];
};

export type CrossEpisodeWardrobeShot = {
  shotNumber: number;
  text?: string | null;
  characterKeys: string[];
  context?: CrossEpisodeWardrobeContext;
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

function storyboardLocationContexts(
  storyboard: unknown
): Map<number, { locationKey?: string; locationLabel?: string }> {
  const root = record(storyboard);
  const locations = Array.isArray(root?.distinct_locations)
    ? root.distinct_locations
    : [];
  const byShot = new Map<
    number,
    { locationKey?: string; locationLabel?: string }
  >();
  for (const raw of locations) {
    const group = record(raw);
    if (!group || !Array.isArray(group.shot_numbers)) continue;
    const locationKey = clean(group.location_key ?? group.locationKey);
    const locationLabel = clean(
      group.location_name ?? group.locationName ?? group.description
    );
    for (const rawShotNumber of group.shot_numbers) {
      const number = positiveInteger(rawShotNumber);
      if (number === undefined) continue;
      byShot.set(number, {
        ...(locationKey ? { locationKey } : {}),
        ...(locationLabel ? { locationLabel } : {}),
      });
    }
  }
  return byShot;
}

function shotContext(
  shot: Record<string, unknown>,
  locationFallback?: { locationKey?: string; locationLabel?: string }
): CrossEpisodeWardrobeContext {
  const location = record(shot.location);
  const locationKey = clean(
    shot.location_key ??
      shot.locationKey ??
      location?.location_key ??
      location?.key ??
      locationFallback?.locationKey
  );
  const locationLabel = clean(
    shot.location_name ??
      shot.locationName ??
      (location?.name as unknown) ??
      (location?.description as unknown) ??
      (typeof shot.location === "string" ? shot.location : undefined) ??
      locationFallback?.locationLabel
  );
  const timeMarker = clean(
    shot.time_of_day ??
      shot.timeOfDay ??
      shot.time_marker ??
      shot.timeMarker ??
      shot.day_marker ??
      shot.dayMarker
  );
  const text = [
    shot.narrative_purpose,
    shot.visual_description,
    shot.description,
    shot.action,
    shot.scene_summary,
    shot.story_summary,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .trim();
  return {
    ...(locationKey ? { locationKey } : {}),
    ...(locationLabel ? { locationLabel } : {}),
    ...(timeMarker ? { timeMarker } : {}),
    ...(text ? { text } : {}),
  };
}

function hasTimeBoundaryCue(text: unknown): boolean {
  const value = clean(text).toLocaleLowerCase();
  return [
    /วันถัดไป/u,
    /วันรุ่งขึ้น/u,
    /เช้าวันใหม่/u,
    /หลายวันต่อมา/u,
    /หลายสัปดาห์ต่อมา/u,
    /เวลาผ่านไป/u,
    /the next day/u,
    /the following day/u,
    /days later/u,
    /weeks later/u,
    /time passes/u,
  ].some(pattern => pattern.test(value));
}

function hasTravelContinuationCue(text: unknown): boolean {
  const value = clean(text).toLocaleLowerCase();
  return [
    /เดินทางต่อ/u,
    /ต่อเนื่อง/u,
    /ขึ้นรถ/u,
    /นั่งรถ/u,
    /ลงจาก(?:เครื่องบิน|รถ)/u,
    /ออกจากสนามบิน/u,
    /กำลังไป/u,
    /ระหว่างทาง/u,
    /ต่อรถ/u,
    /มาถึง/u,
    /continues? (?:the )?journey/u,
    /gets? into the car/u,
    /travels? on/u,
    /arrives? at/u,
    /on the way/u,
    /after leaving the airport/u,
  ].some(pattern => pattern.test(value));
}

function shouldContinueAcrossEpisodeBoundary(
  handoff: CrossEpisodeWardrobeHandoff,
  shot: CrossEpisodeWardrobeShot
): boolean {
  const source = handoff.sourceContext;
  const current = shot.context;
  const combinedText = `${source?.text ?? ""} ${shot.text ?? ""} ${current?.text ?? ""}`;
  if (hasTimeBoundaryCue(combinedText)) return false;

  const sourceLocation = source?.locationKey ?? source?.locationLabel;
  const currentLocation = current?.locationKey ?? current?.locationLabel;
  const locationChanged = Boolean(
    sourceLocation && currentLocation && sourceLocation !== currentLocation
  );
  if (locationChanged && !hasTravelContinuationCue(combinedText)) return false;

  const timeChanged = Boolean(
    source?.timeMarker &&
    current?.timeMarker &&
    source.timeMarker.toLocaleLowerCase() !==
      current.timeMarker.toLocaleLowerCase()
  );
  if (timeChanged && !hasTravelContinuationCue(combinedText)) return false;

  return true;
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
  const shots = storyboardShots(params.previousEpisode.storyboard);
  const locationByShotNumber = storyboardLocationContexts(
    params.previousEpisode.storyboard
  );
  const sortedShots = shots
    .map(shot => ({ shot, number: shotNumber(shot) }))
    .filter(
      (item): item is { shot: Record<string, unknown>; number: number } =>
        item.number !== undefined
    )
    .sort((a, b) => b.number - a.number);

  for (const item of sortedShots) {
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
      sourceContext: shotContext(
        item.shot,
        locationByShotNumber.get(item.number)
      ),
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
  let continuityActive = true;

  for (const shot of [...params.shots].sort(
    (a, b) => a.shotNumber - b.shotNumber
  )) {
    if (!continuityActive) continue;
    if (!shouldContinueAcrossEpisodeBoundary(params.handoff, shot)) {
      continuityActive = false;
      continue;
    }
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
    "CROSS-EPISODE WARDROBE CONTINUITY (CONTEXT-AWARE):",
    `This episode follows episode ${handoff.sourceEpisodeNumber}, source shot ${handoff.sourceShotNumber}. First inspect the episode synopsis, scene summaries, locations, time markers, and action flow to decide whether shot 1 is the same continuous event. Keep the inherited look when the event continues directly (including travel such as leaving an airport and getting into a car). If this is a new day/time, unrelated event, or a separate location/event without a travel continuation, choose the appropriate look for the new context and do not force the inherited wardrobe. A descriptive garment word alone is not permission to change the inherited look. When continuity applies, use the exact look key when that character appears:`,
    ...(handoff.sourceContext?.locationLabel
      ? [`Previous scene location: ${handoff.sourceContext.locationLabel}`]
      : []),
    ...(handoff.sourceContext?.timeMarker
      ? [`Previous scene time marker: ${handoff.sourceContext.timeMarker}`]
      : []),
    ...lines,
  ].join("\n");
}
