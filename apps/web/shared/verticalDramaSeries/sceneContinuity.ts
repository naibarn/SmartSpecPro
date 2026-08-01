/**
 * Feature 138 P1 scene-continuity primitives.
 *
 * Scenes are keyed only by locationKey and every function tolerates no scene.
 * This zero-import module never judges or describes a scene: it groups shots,
 * validates state identity, selects proven anchors, and renders only facts the
 * authoring skill explicitly locked.
 */

export type VdSceneShotGroup = { locationKey: string; shotNumbers: number[] };

export const VD_SCENE_ANCHOR_SOURCES = ["approved", "latest_generated"] as const;
export type VdSceneAnchorSource = (typeof VD_SCENE_ANCHOR_SOURCES)[number];
export type VdSceneAnchor = {
  anchorShotNumber: number;
  mediaAssetId: number;
  source: VdSceneAnchorSource;
};

export type VdLatestGeneratedSceneAsset = {
  mediaAssetId: number;
  status: "succeeded" | "failed";
  locationKey: string;
  planRevision: string | number;
  rejected?: boolean;
  stale?: boolean;
};

export type VdSceneVisualState = {
  locationKey: string;
  membershipHash: string;
  revision: number;
  lightingState: string;
  fixedElements: Array<{ name: string; placement: string }>;
  spatialLayout: string;
  stagingAxis: string;
  wardrobeInScene: Array<{ character: string; wardrobe: string }>;
  activeProps: Array<{ name: string; placement: string; fromShot?: number }>;
  paletteMood: string;
  timeJumpSuspected: boolean;
  coverageGaps: string[];
  memberShotNumbers: number[];
  plannedAt: string;
  skillVersion?: string;
  manualEdit?: boolean;
  stale?: boolean;
};

export const VD_SCENE_CONTINUITY_LOCK_HEADER = "SCENE CONTINUITY LOCK";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : undefined;
}

function normalizedShots(values: readonly unknown[] | undefined): number[] {
  return Array.from(
    new Set((values ?? []).map(positiveInteger).filter((value): value is number => value !== undefined)),
  ).sort((a, b) => a - b);
}

export function buildSceneShotGroups(input: {
  distinctLocations?: unknown;
  overridesByShotNumber?: ReadonlyMap<number, string | null | undefined>;
}): VdSceneShotGroup[] {
  try {
    const shotsByKey = new Map<string, Set<number>>();
    const assignedKeyByShot = new Map<number, string>();

    if (Array.isArray(input.distinctLocations)) {
      for (const rawEntry of input.distinctLocations) {
        if (!isRecord(rawEntry)) continue;
        const locationKey = cleanString(rawEntry.location_key);
        if (!locationKey || !Array.isArray(rawEntry.shot_numbers)) continue;
        const bucket = shotsByKey.get(locationKey) ?? new Set<number>();
        shotsByKey.set(locationKey, bucket);
        for (const shotNumber of normalizedShots(rawEntry.shot_numbers)) {
          const assigned = assignedKeyByShot.get(shotNumber);
          if (assigned && assigned !== locationKey) continue;
          assignedKeyByShot.set(shotNumber, locationKey);
          bucket.add(shotNumber);
        }
      }
    }

    for (const [rawShotNumber, rawOverride] of input.overridesByShotNumber ?? []) {
      const shotNumber = positiveInteger(rawShotNumber);
      const overrideKey = cleanString(rawOverride);
      if (shotNumber === undefined || !overrideKey) continue;
      const previousKey = assignedKeyByShot.get(shotNumber);
      if (previousKey) shotsByKey.get(previousKey)?.delete(shotNumber);
      const bucket = shotsByKey.get(overrideKey) ?? new Set<number>();
      shotsByKey.set(overrideKey, bucket);
      bucket.add(shotNumber);
      assignedKeyByShot.set(shotNumber, overrideKey);
    }

    return Array.from(shotsByKey, ([locationKey, shots]) => ({
      locationKey,
      shotNumbers: Array.from(shots).sort((a, b) => a - b),
    }))
      .filter(group => group.shotNumbers.length > 0)
      .sort(
        (a, b) =>
          a.shotNumbers[0] - b.shotNumbers[0] || a.locationKey.localeCompare(b.locationKey),
      );
  } catch {
    return [];
  }
}

export function findSceneShotGroupForShot(
  groups: readonly VdSceneShotGroup[],
  shotNumber: number,
): VdSceneShotGroup | undefined {
  return groups.find(group => group.shotNumbers.includes(shotNumber));
}

export function isSameSceneMembership(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined,
): boolean {
  const left = normalizedShots(a);
  const right = normalizedShots(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export type VdSceneMembershipHashInput = {
  episodeId: string | number;
  locationKey: string;
  memberShotNumbers: readonly number[];
  locationAssetId?: string | number | null;
  canonicalSummariesByShotNumber?:
    | ReadonlyMap<number, string | null | undefined>
    | Readonly<Record<string, string | null | undefined>>;
};

function summaryForShot(
  source: VdSceneMembershipHashInput["canonicalSummariesByShotNumber"],
  shotNumber: number,
): string {
  if (!source) return "";
  const value = source instanceof Map
    ? source.get(shotNumber)
    : (source as Readonly<Record<string, string | null | undefined>>)[String(shotNumber)];
  return cleanString(value);
}

/** Stable, order-insensitive identity hash for one authored scene state. */
export function computeSceneMembershipHash(input: VdSceneMembershipHashInput): string {
  const shots = normalizedShots(input.memberShotNumbers);
  const parts = [
    cleanString(String(input.episodeId)),
    cleanString(input.locationKey),
    shots.join(","),
    input.locationAssetId === null || input.locationAssetId === undefined
      ? ""
      : cleanString(String(input.locationAssetId)),
    ...shots.map(shot => `${shot}:${summaryForShot(input.canonicalSummariesByShotNumber, shot)}`),
  ];
  const canonical = parts.map(part => `${part.length}:${part}`).join("|");
  let hash = 0xcbf29ce484222325n;
  for (const char of canonical) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `vd-scene-v1-${hash.toString(16).padStart(16, "0")}`;
}

function sameRevision(a: string | number, b: string | number): boolean {
  return String(a) === String(b);
}

export function selectSceneContinuityAnchor(input: {
  shotNumber: number;
  group: VdSceneShotGroup | undefined;
  currentPlanRevision: string | number;
  approvedAssetIdByShotNumber: ReadonlyMap<number, number | null | undefined>;
  latestGeneratedAssetByShotNumber: ReadonlyMap<
    number,
    VdLatestGeneratedSceneAsset | null | undefined
  >;
}): VdSceneAnchor | undefined {
  if (!input.group) return undefined;
  const candidates = input.group.shotNumbers
    .filter(shot => shot < input.shotNumber)
    .sort((a, b) => b - a);

  for (const anchorShotNumber of candidates) {
    const approvedId = positiveInteger(
      input.approvedAssetIdByShotNumber.get(anchorShotNumber),
    );
    if (approvedId !== undefined) {
      return { anchorShotNumber, mediaAssetId: approvedId, source: "approved" };
    }

    const generated = input.latestGeneratedAssetByShotNumber.get(anchorShotNumber);
    const generatedId = positiveInteger(generated?.mediaAssetId);
    if (
      generated &&
      generatedId !== undefined &&
      generated.status === "succeeded" &&
      cleanString(generated.locationKey) === input.group.locationKey &&
      sameRevision(generated.planRevision, input.currentPlanRevision) &&
      generated.rejected !== true &&
      generated.stale !== true
    ) {
      return {
        anchorShotNumber,
        mediaAssetId: generatedId,
        source: "latest_generated",
      };
    }
  }
  return undefined;
}

function resolvePairs(
  value: unknown,
  firstKey: string,
  secondKey: string,
): Array<Record<string, string>> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => {
    if (!isRecord(entry)) return [];
    const first = cleanString(entry[firstKey]);
    const second = cleanString(entry[secondKey]);
    return first && second ? [{ [firstKey]: first, [secondKey]: second }] : [];
  });
}

export function resolveSceneVisualState(raw: unknown): VdSceneVisualState | undefined {
  try {
    if (!isRecord(raw)) return undefined;
    const locationKey = cleanString(raw.locationKey ?? raw.location_key);
    if (!locationKey) return undefined;
    const fixedElements = resolvePairs(
      raw.fixedElements ?? raw.fixed_elements,
      "name",
      "placement",
    ) as Array<{ name: string; placement: string }>;
    const wardrobeInScene = resolvePairs(
      raw.wardrobeInScene ?? raw.wardrobe_in_scene,
      "character",
      "wardrobe",
    ) as Array<{ character: string; wardrobe: string }>;
    const activePropsRaw = raw.activeProps ?? raw.active_props;
    const activeProps = Array.isArray(activePropsRaw)
      ? activePropsRaw.flatMap(entry => {
          if (!isRecord(entry)) return [];
          const name = cleanString(entry.name);
          const placement = cleanString(entry.placement);
          if (!name || !placement) return [];
          const fromShot = positiveInteger(entry.fromShot ?? entry.from_shot);
          return [{ name, placement, ...(fromShot ? { fromShot } : {}) }];
        })
      : [];
    const coverageRaw = raw.coverageGaps ?? raw.coverage_gaps;
    const coverageGaps = Array.isArray(coverageRaw)
      ? coverageRaw.map(cleanString).filter(Boolean)
      : [];
    const manualEdit = typeof raw.manualEdit === "boolean" ? raw.manualEdit : undefined;
    const stale = typeof raw.stale === "boolean" ? raw.stale : undefined;
    return {
      locationKey,
      membershipHash: cleanString(raw.membershipHash ?? raw.membership_hash),
      revision: positiveInteger(raw.revision) ?? 0,
      lightingState: cleanString(raw.lightingState ?? raw.lighting_state),
      fixedElements,
      spatialLayout: cleanString(raw.spatialLayout ?? raw.spatial_layout),
      stagingAxis: cleanString(raw.stagingAxis ?? raw.staging_axis),
      wardrobeInScene,
      activeProps,
      paletteMood: cleanString(raw.paletteMood ?? raw.palette_mood),
      timeJumpSuspected:
        typeof (raw.timeJumpSuspected ?? raw.time_jump_suspected) === "boolean"
          ? Boolean(raw.timeJumpSuspected ?? raw.time_jump_suspected)
          : false,
      coverageGaps,
      memberShotNumbers: normalizedShots(
        Array.isArray(raw.memberShotNumbers ?? raw.member_shot_numbers)
          ? (raw.memberShotNumbers ?? raw.member_shot_numbers) as unknown[]
          : [],
      ),
      plannedAt: cleanString(raw.plannedAt ?? raw.planned_at),
      ...(cleanString(raw.skillVersion ?? raw.skill_version)
        ? { skillVersion: cleanString(raw.skillVersion ?? raw.skill_version) }
        : {}),
      ...(manualEdit !== undefined ? { manualEdit } : {}),
      ...(stale !== undefined ? { stale } : {}),
    };
  } catch {
    return undefined;
  }
}

function renderPairs(
  entries: unknown,
  firstKey: string,
  secondKey: string,
  separator: string,
): string {
  return resolvePairs(entries, firstKey, secondKey)
    .map(entry => `${entry[firstKey]}${separator}${entry[secondKey]}`)
    .join("; ");
}

export function renderSceneContinuityLockBlock(
  state: VdSceneVisualState | undefined,
  currentMembershipHash: string,
): string | undefined {
  if (
    !state ||
    state.stale === true ||
    !cleanString(state.membershipHash) ||
    state.membershipHash !== currentMembershipHash
  ) {
    return undefined;
  }

  const fixed = renderPairs(state.fixedElements, "name", "placement", " — ");
  const wardrobe = renderPairs(
    state.wardrobeInScene,
    "character",
    "wardrobe",
    ": ",
  );
  const props = Array.isArray(state.activeProps)
    ? state.activeProps.flatMap(entry => {
        if (!isRecord(entry)) return [];
        const name = cleanString(entry.name);
        const placement = cleanString(entry.placement);
        if (!name || !placement) return [];
        const fromShot = positiveInteger(entry.fromShot);
        return [`${name} — ${placement}${fromShot ? ` (from shot ${fromShot})` : ""}`];
      }).join("; ")
    : "";
  const lines = [
    cleanString(state.lightingState) ? `- Lighting: ${cleanString(state.lightingState)}` : "",
    fixed ? `- Fixed elements: ${fixed}` : "",
    cleanString(state.spatialLayout) ? `- Spatial layout: ${cleanString(state.spatialLayout)}` : "",
    cleanString(state.stagingAxis) ? `- Staging axis: ${cleanString(state.stagingAxis)}` : "",
    wardrobe ? `- Wardrobe: ${wardrobe}` : "",
    props ? `- Active props: ${props}` : "",
    cleanString(state.paletteMood) ? `- Palette and mood: ${cleanString(state.paletteMood)}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? [VD_SCENE_CONTINUITY_LOCK_HEADER, ...lines].join("\n") : undefined;
}
