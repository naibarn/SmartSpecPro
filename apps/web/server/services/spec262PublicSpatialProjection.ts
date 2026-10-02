import { projectSpec262SpatialLocation, type Spec262SpatialEntityClass } from "../../../../packages/shared/src/emergency/geospatialPrivacy";
import { normalizeEmergencyAlertGeometry } from "../../../../packages/shared/src/emergency/alertGeometry";

const spatialEntityClasses = new Set<Spec262SpatialEntityClass>([
  "ordinary-public-feature", "protected-household", "sensitive-facility", "critical-infrastructure", "responder-journey",
]);
const disclosureRank: Readonly<Record<Spec262SpatialEntityClass, number>> = {
  "ordinary-public-feature": 0,
  "protected-household": 1,
  "sensitive-facility": 2,
  "critical-infrastructure": 3,
  "responder-journey": 3,
};

function parseSpatialClass(value: unknown): Spec262SpatialEntityClass | undefined {
  return typeof value === "string" && spatialEntityClasses.has(value as Spec262SpatialEntityClass)
    ? value as Spec262SpatialEntityClass
    : undefined;
}

/** An inherited disclosure policy can only become stricter, never looser. */
export function resolveSpec262PublicSpatialClass(...values: unknown[]): Spec262SpatialEntityClass | undefined {
  return values.reduce<Spec262SpatialEntityClass | undefined>((current, value) => {
    const candidate = parseSpatialClass(value);
    if (!candidate || (current && disclosureRank[candidate] <= disclosureRank[current])) return current;
    return candidate;
  }, undefined);
}

/** Missing classification suppresses location at the public serialization boundary. */
export function projectSpec260PublicLocation(
  location: { readonly latitude: number; readonly longitude: number } | null | undefined,
  spatialDisclosureClass: unknown,
): { readonly latitude: number; readonly longitude: number } | null {
  const entityClass = parseSpatialClass(spatialDisclosureClass);
  if (!location || !entityClass) return null;
  const projection = projectSpec262SpatialLocation({
    policyVersion: "spec262-spatial-v1",
    audience: "public",
    entityClass,
    geometry: { type: "Point", coordinates: [location.longitude, location.latitude] },
    crs: "EPSG:4326",
  });
  return projection.geometry
    ? { latitude: projection.geometry.coordinates[1], longitude: projection.geometry.coordinates[0] }
    : null;
}

/** Alert polygons may only be disclosed for explicitly ordinary public features. */
export function projectSpec260PublicAlertGeometry(geometry: unknown, spatialDisclosureClass: unknown) {
  return parseSpatialClass(spatialDisclosureClass) === "ordinary-public-feature"
    ? normalizeEmergencyAlertGeometry(geometry)
    : null;
}
