export type EmergencyAlertPolygon = {
  type: "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

type Position = [number, number];
type Ring = Position[];
type PolygonCoordinates = Ring[];

const PUBLIC_GRID_DEGREES = 0.05;
const MAX_POLYGONS = 8;
const MAX_RINGS_PER_POLYGON = 16;
const MAX_POSITIONS_PER_RING = 256;

function roundToGrid(value: number): number {
  return Number((Math.round(value / PUBLIC_GRID_DEGREES) * PUBLIC_GRID_DEGREES).toFixed(4));
}

function parsePosition(value: unknown): Position | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const [longitude, latitude] = value;
  if (typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  return [roundToGrid(longitude), roundToGrid(latitude)];
}

function parseRing(value: unknown): Ring | null {
  if (!Array.isArray(value) || value.length < 4 || value.length > MAX_POSITIONS_PER_RING) return null;
  const positions = value.map(parsePosition);
  if (positions.some(position => position === null)) return null;
  const ring = positions as Ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return null;
  // Grid snapping can collapse a small source polygon; never publish invalid GeoJSON.
  if (new Set(ring.slice(0, -1).map(position => `${position[0]},${position[1]}`)).size < 3) return null;
  return ring;
}

function parsePolygon(value: unknown): PolygonCoordinates | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_RINGS_PER_POLYGON) return null;
  const rings = value.map(parseRing);
  return rings.some(ring => ring === null) ? null : rings as PolygonCoordinates;
}

/** Validate and privacy-generalize an operator-authored public alert area. */
export function normalizeEmergencyAlertGeometry(value: unknown): EmergencyAlertPolygon | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const geometry = value as Record<string, unknown>;
  if (geometry.type === "Polygon") {
    const coordinates = parsePolygon(geometry.coordinates);
    return coordinates ? { type: "Polygon", coordinates } : null;
  }
  if (geometry.type === "MultiPolygon") {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 1 || geometry.coordinates.length > MAX_POLYGONS) return null;
    const polygons = geometry.coordinates.map(parsePolygon);
    return polygons.some(polygon => polygon === null) ? null : { type: "MultiPolygon", coordinates: polygons };
  }
  return null;
}

export function emergencyAlertGeometryIntersectsBounds(
  value: unknown,
  bounds: readonly [west: number, south: number, east: number, north: number],
): boolean {
  const geometry = normalizeEmergencyAlertGeometry(value);
  if (!geometry) return false;
  const positions: Position[] = [];
  const collect = (input: unknown): void => {
    if (!Array.isArray(input)) return;
    if (input.length === 2 && input.every(value => typeof value === "number")) {
      positions.push(input as Position);
      return;
    }
    input.forEach(collect);
  };
  collect(geometry.coordinates);
  if (positions.length === 0) return false;
  const extent = positions.reduce((current, position) => ({
    west: Math.min(current.west, position[0]),
    east: Math.max(current.east, position[0]),
    south: Math.min(current.south, position[1]),
    north: Math.max(current.north, position[1]),
  }), { west: Infinity, east: -Infinity, south: Infinity, north: -Infinity });
  const [queryWest, querySouth, queryEast, queryNorth] = bounds;
  return extent.east >= queryWest && extent.west <= queryEast && extent.north >= querySouth && extent.south <= queryNorth;
}
