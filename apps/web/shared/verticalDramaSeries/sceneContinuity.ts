/**
 * Feature 138 P1 scene-continuity primitives.
 *
 * Scenes are keyed only by locationKey and every function tolerates no scene.
 * This zero-import module never judges or describes a scene: it groups shots,
 * validates state identity, selects proven anchors, and renders only facts the
 * authoring skill explicitly locked.
 */

export type VdSceneShotGroup = { locationKey: string; shotNumbers: number[] };

export const VD_SLEEP_SURFACE_TYPES = [
  "long_bed",
  "single_bed",
  "crib_bassinet",
  "sofa",
  "floor_mattress",
  "other",
] as const;
export type VdSleepSurfaceType = (typeof VD_SLEEP_SURFACE_TYPES)[number];
export type VdSceneSleepSurface = {
  type: VdSleepSurfaceType;
  name: string;
  occupant?: string;
  placement: string;
};

export type VdSceneActiveProp = {
  name: string;
  placement: string;
  fromShot?: number;
  /** Optional visual identity facts for a distinctive recurring prop. */
  identityLock?: string;
};

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
  sleepSurface?: VdSceneSleepSurface;
  wardrobeInScene: Array<{ character: string; wardrobe: string }>;
  activeProps: VdSceneActiveProp[];
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

function boundedString(value: unknown, maxLength: number): string {
  const cleaned = cleanString(value);
  return cleaned.length <= maxLength ? cleaned : "";
}

/** Replace an older persisted scene lock with the current canonical lock. */
export function replaceSceneContinuityLockBlock(
  prompt: string,
  currentBlock: string,
): string {
  const lines = prompt.split("\n");
  const output: string[] = [];
  let replacing = false;
  for (const line of lines) {
    if (line.trim() === VD_SCENE_CONTINUITY_LOCK_HEADER) {
      replacing = true;
      continue;
    }
    if (replacing) {
      if (/^\s*-\s+/.test(line) || !line.trim()) continue;
      replacing = false;
    }
    output.push(line);
  }
  const base = output.join("\n").trim();
  return base ? `${base}\n\n${currentBlock.trim()}` : currentBlock.trim();
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

/**
 * Split a generate-all request into scene-aware lanes. Shots in one scene are
 * ordered so a completed earlier shot can become the next shot's anchor;
 * shots in different scenes remain independently parallelizable. A shot that
 * is not assigned to a scene gets its own lane because it cannot contribute a
 * same-scene anchor.
 */
export function planSceneOrderedBatch(input: {
  shotNumbers: readonly number[];
  groups: readonly VdSceneShotGroup[];
}): number[][] {
  const requested = Array.from(
    new Set(
      input.shotNumbers.filter(
        shotNumber => Number.isInteger(shotNumber) && shotNumber > 0,
      ),
    ),
  ).sort((a, b) => a - b);
  if (requested.length === 0) return [];

  const requestedSet = new Set(requested);
  const groupIndexByShot = new Map<number, number>();
  const lanesByGroup = new Map<number, number[]>();
  input.groups.forEach((group, groupIndex) => {
    for (const shotNumber of group.shotNumbers) {
      if (!requestedSet.has(shotNumber) || groupIndexByShot.has(shotNumber)) {
        continue;
      }
      groupIndexByShot.set(shotNumber, groupIndex);
      const lane = lanesByGroup.get(groupIndex) ?? [];
      lane.push(shotNumber);
      lanesByGroup.set(groupIndex, lane);
    }
  });

  const lanes: number[][] = Array.from(lanesByGroup.values()).map(lane =>
    lane.slice().sort((a, b) => a - b),
  );
  for (const shotNumber of requested) {
    if (!groupIndexByShot.has(shotNumber)) lanes.push([shotNumber]);
  }
  return lanes.sort((a, b) => a[0] - b[0]);
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

function resolveSleepSurface(raw: unknown): VdSceneSleepSurface | undefined {
  if (!isRecord(raw)) return undefined;
  const type = cleanString(raw.type);
  if (!(VD_SLEEP_SURFACE_TYPES as readonly string[]).includes(type)) {
    return undefined;
  }
  const name = boundedString(raw.name, 300);
  const placement = boundedString(raw.placement, 500);
  if (!name || !placement) return undefined;
  const occupant = boundedString(raw.occupant, 300);
  return {
    type: type as VdSleepSurfaceType,
    name,
    placement,
    ...(occupant ? { occupant } : {}),
  };
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
          const identityLock = boundedString(
            entry.identityLock ?? entry.identity_lock,
            500,
          );
          return [{
            name,
            placement,
            ...(fromShot ? { fromShot } : {}),
            ...(identityLock ? { identityLock } : {}),
          }];
        })
      : [];
    const coverageRaw = raw.coverageGaps ?? raw.coverage_gaps;
    const coverageGaps = Array.isArray(coverageRaw)
      ? coverageRaw.map(cleanString).filter(Boolean)
      : [];
    const sleepSurface = resolveSleepSurface(
      raw.sleepSurface ?? raw.sleep_surface,
    );
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
      ...(sleepSurface ? { sleepSurface } : {}),
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
  currentShotNumber?: number,
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
  const shotNumber = positiveInteger(currentShotNumber);
  const props = Array.isArray(state.activeProps)
    ? state.activeProps.flatMap(entry => {
        if (!isRecord(entry)) return [];
        const name = cleanString(entry.name);
        const placement = cleanString(entry.placement);
        if (!name || !placement) return [];
        const fromShot = positiveInteger(entry.fromShot);
        if (
          fromShot !== undefined &&
          shotNumber !== undefined &&
          fromShot > shotNumber
        ) {
          return [];
        }
        return [`${name} — ${placement}${fromShot ? ` (from shot ${fromShot})` : ""}`];
      }).join("; ")
      : "";
  const propIdentityLocks = Array.isArray(state.activeProps)
    ? state.activeProps.flatMap(entry => {
        if (!isRecord(entry)) return [];
        const name = cleanString(entry.name);
        const placement = cleanString(entry.placement);
        if (!name || !placement) return [];
        const fromShot = positiveInteger(entry.fromShot);
        if (
          fromShot !== undefined &&
          shotNumber !== undefined &&
          fromShot > shotNumber
        ) {
          return [];
        }
        const identityLock = boundedString(
          entry.identityLock,
          500,
        );
        const isBoxLike = /กล่อง|หีบ|box|chest|trunk|case/i.test(name);
        if (!identityLock && !isBoxLike) return [];
        return [`- Persistent prop identity lock: ${name} — ${
          identityLock ||
          "วัตถุชิ้นเดิมตลอดฉาก: คงรูปทรงและสัดส่วนเดิม วัสดุและโทนสีเดิม (ถ้าเป็นไม้ให้คงลายไม้เดิม) รอย/ตำหนิ ตำแหน่งฝา บานพับ และตัวล็อกเดิม ห้ามเปลี่ยนเป็นกล่องใบอื่น ห้ามออกแบบใหม่หรือรวมกับกล่องอื่น; หากเห็นเพียงบางส่วนให้คงรายละเอียดส่วนที่มองเห็นให้ตรงเดิม"
        }`];
      })
    : [];
  const sleepSurfaceLine = state.sleepSurface
    ? `- Primary sleep surface (authoritative): ${state.sleepSurface.type} — ${state.sleepSurface.name}${state.sleepSurface.occupant ? ` — occupied by ${state.sleepSurface.occupant}` : ""} — ${state.sleepSurface.placement}. Do not replace this with a different sleep surface based on the location image.`
    : "";
  const sceneFactLines = [
    cleanString(state.lightingState) ? `- Lighting: ${cleanString(state.lightingState)}` : "",
    sleepSurfaceLine,
    fixed ? `- Fixed elements: ${fixed}` : "",
    cleanString(state.spatialLayout) ? `- Spatial layout: ${cleanString(state.spatialLayout)}` : "",
    cleanString(state.stagingAxis) ? `- Staging axis: ${cleanString(state.stagingAxis)}` : "",
    wardrobe ? `- Wardrobe: ${wardrobe}` : "",
    props ? `- Continuity prop candidates (not all visible): ${props}` : "",
    ...propIdentityLocks,
    props
      ? "- Current-shot prop visibility rule: show only props explicitly required by the current shot synopsis/composition; omit unrelated prior props and never duplicate handheld devices."
      : "",
    cleanString(state.paletteMood) ? `- Palette and mood: ${cleanString(state.paletteMood)}` : "",
  ].filter(Boolean);
  if (sceneFactLines.length === 0) return undefined;
  return [
    VD_SCENE_CONTINUITY_LOCK_HEADER,
    "- Authority: this Scene Visual State is the authoritative source for scene-level visual facts; ignore conflicting furniture, layout, lighting, prop, or sleep-surface details from location descriptions, reference images, or older prompts. Preserve the shot action, but apply it to these locked scene facts.",
    ...sceneFactLines,
  ].join("\n");
}

/**
 * Removes future-dated active props from a previously rendered continuity
 * block. This is intentionally text-based because persisted episode plans
 * contain the rendered block rather than the original typed scene state.
 * Props without a `(from shot N)` marker remain global for backward
 * compatibility, while a prop only becomes eligible on its declared shot.
 */
export function filterSceneContinuityLockBlockForShot(
  block: string | undefined,
  currentShotNumber?: number,
): string | undefined {
  const normalized = block?.trim();
  if (!normalized) return undefined;
  const shotNumber = positiveInteger(currentShotNumber);
  if (shotNumber === undefined) {
    return normalized;
  }

  const filtered = normalized
    .split("\n")
    .flatMap(line => {
      const match = line.match(
        /^(\s*-\s*(?:Active props|Continuity prop candidates(?: \(not all visible\))?)\s*:\s*)(.*)$/i
      );
      if (!match) return [line];
      const visibleProps = match[2]
        .split(/\s*;\s*/)
        .map(prop => prop.trim())
        .filter(Boolean)
        .filter(prop => {
          const fromShotMatch = prop.match(/\(\s*from\s+shot\s+(\d+)\s*\)\s*$/i);
          return (
            !fromShotMatch ||
            Number(fromShotMatch[1]) <= shotNumber
          );
        });
      return visibleProps.length > 0
        ? [`${match[1]}${visibleProps.join("; ")}`]
        : [];
    })
    .join("\n")
    .trim();

  return filtered || undefined;
}
