import type { VerticalDramaStoryboardLocationGroup } from "./storyboardLocations";
import { normalizeVerticalDramaLocationName } from "./locationIdentity";

/**
 * Prefixes that describe where the camera is relative to a place rather than
 * naming a new physical place. Keep this list deliberately small: broad
 * similarity/fuzzy matching can merge genuinely different rooms or branches.
 */
const PARKING_VIEW_PREFIXES = [
  /^(?:ลานจอดรถ|ที่จอดรถ)(?:ด้านหน้า|หน้า)?\s*/u,
  /^(?:parking\s+lot|car\s+park)(?:\s+(?:in\s+front\s+of|outside))?\s+/iu,
] as const;

const FRONT_VIEW_PREFIXES = [
  /^(?:ด้านหน้า|หน้าทางเข้า|ทางเข้าด้านหน้า|ทางเข้า|หน้าประตู|หน้า)\s*/u,
  /^(?:front\s+entrance|entrance|front\s+of|outside|exterior\s+of)\s+/iu,
] as const;

function locationAnchor(name: string): string {
  let value = normalizeVerticalDramaLocationName(name);
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of [...PARKING_VIEW_PREFIXES, ...FRONT_VIEW_PREFIXES]) {
      const next = value.replace(prefix, "").trim();
      if (next !== value) {
        value = next;
        changed = true;
        break;
      }
    }
  }
  return value;
}

function isParkingViewLabel(name: string): boolean {
  const normalized = normalizeVerticalDramaLocationName(name);
  return PARKING_VIEW_PREFIXES.some(prefix => prefix.test(normalized));
}

export type CanonicalizeLocationGroupsOptions = {
  /** Existing roster keys are authoritative and must never be merged together. */
  knownLocationKeys?: ReadonlySet<string>;
};

/**
 * Canonicalize storyboard location groups before they become durable roster
 * rows. Location identity is the physical place; camera distance/approach is
 * represented by the shot camera or a location asset coverage role.
 *
 * Safe rules only:
 * - groups with the same key are always folded;
 * - explicit existing roster keys remain authoritative;
 * - a small, structural set of view-only prefixes may fold newly-authored
 *   names such as "หน้าคลินิก" + "ลานจอดรถหน้าคลินิก". Structural merging
 *   requires an explicit parking/vehicle-area label so "หน้าห้องตรวจ" and
 *   "ห้องตรวจ" are not silently treated as the same interior space;
 * - no edit-distance or broad fuzzy matching.
 */
export function canonicalizeStoryboardLocationGroups(
  groups: readonly VerticalDramaStoryboardLocationGroup[],
  options: CanonicalizeLocationGroupsOptions = {}
): VerticalDramaStoryboardLocationGroup[] {
  const knownKeys = options.knownLocationKeys ?? new Set<string>();
  const output: VerticalDramaStoryboardLocationGroup[] = [];
  const indexByKey = new Map<string, number>();
  const keysByAnchor = new Map<string, Set<string>>();

  for (const group of groups) {
    const key = group.locationKey.trim();
    const name = group.locationName.trim();
    if (!key || !name) continue;

    const anchor = locationAnchor(name);
    const knownKeyConflict =
      anchor.length > 0 &&
      Array.from(keysByAnchor.get(anchor) ?? []).some(
        existingKey =>
          existingKey !== key &&
          knownKeys.has(existingKey) &&
          knownKeys.has(key)
      );
    const existingIndex =
      indexByKey.get(key) ??
      (!knownKeyConflict && anchor
        ? output.findIndex(
            existing =>
              locationAnchor(existing.locationName) === anchor &&
              (isParkingViewLabel(existing.locationName) ||
                isParkingViewLabel(name))
          )
        : -1);

    if (existingIndex == null || existingIndex < 0) {
      indexByKey.set(key, output.length);
      output.push({
        ...group,
        locationKey: key,
        locationName: name,
        shotNumbers: Array.from(new Set(group.shotNumbers)).sort(
          (a, b) => a - b
        ),
      });
    } else {
      const existing = output[existingIndex];
      output[existingIndex] = {
        ...existing,
        ...(knownKeys.has(key) && !knownKeys.has(existing.locationKey)
          ? { locationKey: key }
          : {}),
        shotNumbers: Array.from(
          new Set([...existing.shotNumbers, ...group.shotNumbers])
        ).sort((a, b) => a - b),
        description: [existing.description, group.description]
          .map(value => value.trim())
          .filter(Boolean)
          .filter((value, index, values) => values.indexOf(value) === index)
          .join(" "),
      };
      indexByKey.set(key, existingIndex);
    }

    const anchorKeys = keysByAnchor.get(anchor) ?? new Set<string>();
    anchorKeys.add(key);
    keysByAnchor.set(anchor, anchorKeys);
  }

  return output;
}
