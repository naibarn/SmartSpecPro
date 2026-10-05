import { parseGeometryContract, type GeoJSONGeometry, type GeoJSONPosition, type GeometryContract } from "./geometry";

export type SpatialPointRelation = "inside" | "outside" | "boundary";

export interface SpatialJoinMatch {
  readonly pointGeometryId: string;
  readonly areaGeometryId: string;
  readonly relation: Exclude<SpatialPointRelation, "outside">;
}

export interface NearestPoint {
  readonly geometryId: string;
  readonly distanceMeters: number;
}

const EARTH_RADIUS_METERS = 6_371_008.8;
const MAX_INPUT_ITEMS = 10_000;
const MAX_JOIN_PAIRS = 100_000;
const MAX_NEAREST_RESULTS = 100;
const MAX_AREA_POSITIONS = 100_000;
const EPSILON = 1e-12;

type PolygonRings = readonly (readonly GeoJSONPosition[])[];
interface PlanarPosition { readonly x: number; readonly y: number }

function fail(code: "SPATIAL_INPUT_INVALID" | "SPATIAL_CRS_UNSUPPORTED" | "SPATIAL_GEOMETRY_UNSUPPORTED" | "SPATIAL_OPERATION_LIMIT"): never {
  throw new Error(code);
}

function isDenseArray(value: unknown, maximum: number): value is readonly unknown[] {
  if (!Array.isArray(value)) return false;
  if (value.length > maximum) fail("SPATIAL_OPERATION_LIMIT");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function assertCoordinate(value: unknown): asserts value is GeoJSONPosition {
  if (!Array.isArray(value) || (value.length !== 2 && value.length !== 3)) {
    fail("SPATIAL_INPUT_INVALID");
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index) || typeof value[index] !== "number" || !Number.isFinite(value[index])) fail("SPATIAL_INPUT_INVALID");
  }
  if (value[0]! < -180 || value[0]! > 180 || value[1]! < -90 || value[1]! > 90) fail("SPATIAL_INPUT_INVALID");
}

function assertContract(contract: GeometryContract): GeometryContract {
  const parsed = parseGeometryContract(contract);
  if (!parsed.ok) fail(parsed.code === "GEOMETRY_CRS_UNSUPPORTED" ? "SPATIAL_CRS_UNSUPPORTED" : "SPATIAL_INPUT_INVALID");
  return parsed.value;
}

function pointFromContract(contract: GeometryContract): GeoJSONPosition {
  const parsed = assertContract(contract);
  const geometry = parsed.geometry as GeoJSONGeometry;
  if (!geometry || geometry.type !== "Point") fail("SPATIAL_GEOMETRY_UNSUPPORTED");
  assertCoordinate(geometry.coordinates);
  return geometry.coordinates;
}

function ringFromUnknown(value: unknown, budget: { positions: number }): readonly GeoJSONPosition[] {
  if (!isDenseArray(value, MAX_AREA_POSITIONS) || value.length < 4) fail("SPATIAL_INPUT_INVALID");
  const ring: GeoJSONPosition[] = [];
  for (const coordinate of value) {
    budget.positions += 1;
    if (budget.positions > MAX_AREA_POSITIONS) fail("SPATIAL_OPERATION_LIMIT");
    assertCoordinate(coordinate);
    ring.push(coordinate);
  }
  const first = ring[0]!;
  const last = ring[ring.length - 1]!;
  if (first.length !== last.length || first.some((coordinate, index) => coordinate !== last[index])) fail("SPATIAL_INPUT_INVALID");
  return ring;
}

function polygonFromUnknown(value: unknown, budget: { positions: number }): PolygonRings {
  if (!isDenseArray(value, MAX_AREA_POSITIONS) || value.length === 0) fail("SPATIAL_INPUT_INVALID");
  return value.map(ring => ringFromUnknown(ring, budget));
}

function polygonsFromContract(contract: GeometryContract): readonly PolygonRings[] {
  const parsed = assertContract(contract);
  const budget = { positions: 0 };
  const geometry = parsed.geometry as GeoJSONGeometry;
  if (!geometry) fail("SPATIAL_GEOMETRY_UNSUPPORTED");
  if (geometry.type === "Polygon") return [polygonFromUnknown(geometry.coordinates, budget)];
  if (geometry.type === "MultiPolygon") {
    if (!isDenseArray(geometry.coordinates, MAX_AREA_POSITIONS) || geometry.coordinates.length === 0) fail("SPATIAL_INPUT_INVALID");
    return geometry.coordinates.map(polygon => polygonFromUnknown(polygon, budget));
  }
  fail("SPATIAL_GEOMETRY_UNSUPPORTED");
}

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function unwrapLongitude(longitude: number, referenceLongitude: number): number {
  let delta = longitude - referenceLongitude;
  while (delta > 180) delta -= 360;
  while (delta <= -180) delta += 360;
  return referenceLongitude + delta;
}

function planarRingAroundPoint(point: GeoJSONPosition, ring: readonly GeoJSONPosition[]): { readonly point: PlanarPosition; readonly ring: readonly PlanarPosition[] } {
  const planarRing: PlanarPosition[] = [];
  let previousLongitude = ring[0]![0]!;
  let minimumLongitude = previousLongitude;
  let maximumLongitude = previousLongitude;
  for (const position of ring) {
    const longitude = planarRing.length === 0 ? position[0]! : unwrapLongitude(position[0]!, previousLongitude);
    previousLongitude = longitude;
    minimumLongitude = Math.min(minimumLongitude, longitude);
    maximumLongitude = Math.max(maximumLongitude, longitude);
    planarRing.push({ x: longitude, y: position[1]! });
  }
  const centerLongitude = (minimumLongitude + maximumLongitude) / 2;
  return { point: { x: unwrapLongitude(point[0]!, centerLongitude), y: point[1]! }, ring: planarRing };
}

function pointOnSegment(point: PlanarPosition, start: PlanarPosition, end: PlanarPosition): boolean {
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  if (Math.abs(cross) > EPSILON) return false;
  return point.x >= Math.min(start.x, end.x) - EPSILON && point.x <= Math.max(start.x, end.x) + EPSILON &&
    point.y >= Math.min(start.y, end.y) - EPSILON && point.y <= Math.max(start.y, end.y) + EPSILON;
}

function classifyPointInRing(point: GeoJSONPosition, ring: readonly GeoJSONPosition[]): SpatialPointRelation {
  const planar = planarRingAroundPoint(point, ring);
  let inside = false;
  for (let index = 1; index < planar.ring.length; index += 1) {
    const start = planar.ring[index - 1]!;
    const end = planar.ring[index]!;
    if (pointOnSegment(planar.point, start, end)) return "boundary";
    if ((start.y > planar.point.y) !== (end.y > planar.point.y)) {
      const crossingX = (end.x - start.x) * (planar.point.y - start.y) / (end.y - start.y) + start.x;
      if (planar.point.x < crossingX) inside = !inside;
    }
  }
  return inside ? "inside" : "outside";
}

function classifyPointInPolygon(point: GeoJSONPosition, rings: PolygonRings): SpatialPointRelation {
  const exterior = classifyPointInRing(point, rings[0]!);
  if (exterior !== "inside") return exterior;
  for (let index = 1; index < rings.length; index += 1) {
    const hole = classifyPointInRing(point, rings[index]!);
    if (hole === "boundary") return "boundary";
    if (hole === "inside") return "outside";
  }
  return "inside";
}

/**
 * Calculates a great-circle distance in metres for validated CRS84 longitude-latitude points.
 * This is geometric proximity only; it does not model a route, travel time, or accessibility.
 */
export function geodesicDistanceMeters(left: GeoJSONPosition, right: GeoJSONPosition): number {
  assertCoordinate(left);
  assertCoordinate(right);
  const latitudeDelta = radians(right[1]! - left[1]!);
  const longitudeDelta = radians(unwrapLongitude(right[0]!, left[0]!) - left[0]!);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(left[1]!)) * Math.cos(radians(right[1]!)) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Classifies one point against a Polygon or MultiPolygon without CRS conversion or topology repair. */
export function classifyPointInArea(point: GeometryContract, area: GeometryContract): SpatialPointRelation {
  const position = pointFromContract(point);
  let foundBoundary = false;
  for (const polygon of polygonsFromContract(area)) {
    const relation = classifyPointInPolygon(position, polygon);
    if (relation === "inside") return "inside";
    if (relation === "boundary") foundBoundary = true;
  }
  return foundBoundary ? "boundary" : "outside";
}

/** Performs a bounded point-to-area spatial join. It does not infer access or service reachability. */
export function joinPointsToAreas(points: readonly GeometryContract[], areas: readonly GeometryContract[]): readonly SpatialJoinMatch[] {
  if (!isDenseArray(points, MAX_INPUT_ITEMS) || !isDenseArray(areas, MAX_INPUT_ITEMS)) fail("SPATIAL_INPUT_INVALID");
  if (points.length * areas.length > MAX_JOIN_PAIRS) fail("SPATIAL_OPERATION_LIMIT");
  const pointIds = new Set<string>();
  const preparedPoints = points.map(point => {
    const position = pointFromContract(point);
    if (pointIds.has(point.geometryId)) fail("SPATIAL_INPUT_INVALID");
    pointIds.add(point.geometryId);
    return { geometryId: point.geometryId, position };
  });
  const areaIds = new Set<string>();
  const preparedAreas = areas.map(area => {
    const polygons = polygonsFromContract(area);
    if (areaIds.has(area.geometryId)) fail("SPATIAL_INPUT_INVALID");
    areaIds.add(area.geometryId);
    return { geometryId: area.geometryId, polygons };
  });
  const matches: SpatialJoinMatch[] = [];
  for (const point of preparedPoints) {
    for (const area of preparedAreas) {
      let relation: SpatialPointRelation = "outside";
      for (const polygon of area.polygons) {
        const candidate = classifyPointInPolygon(point.position, polygon);
        if (candidate === "inside") {
          relation = "inside";
          break;
        }
        if (candidate === "boundary") relation = "boundary";
      }
      if (relation !== "outside") matches.push({ pointGeometryId: point.geometryId, areaGeometryId: area.geometryId, relation });
    }
  }
  return matches;
}

/** Returns a bounded deterministic nearest-N order by geometric distance then geometry ID. */
export function findNearestPoints(target: GeometryContract, candidates: readonly GeometryContract[], limit: number): readonly NearestPoint[] {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_NEAREST_RESULTS) fail("SPATIAL_OPERATION_LIMIT");
  if (!isDenseArray(candidates, MAX_INPUT_ITEMS)) fail("SPATIAL_INPUT_INVALID");
  const targetPosition = pointFromContract(target);
  const seen = new Set<string>();
  const nearest = candidates.map(candidate => {
    const position = pointFromContract(candidate);
    if (seen.has(candidate.geometryId)) fail("SPATIAL_INPUT_INVALID");
    seen.add(candidate.geometryId);
    return { geometryId: candidate.geometryId, distanceMeters: geodesicDistanceMeters(targetPosition, position) };
  });
  nearest.sort((left, right) => left.distanceMeters - right.distanceMeters || left.geometryId.localeCompare(right.geometryId));
  return nearest.slice(0, limit);
}
