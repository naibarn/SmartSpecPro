export type GeometryPrecisionClass = "coarse" | "standard" | "survey_grade" | "unknown";

export type GeoJSONPosition = readonly [longitude: number, latitude: number, altitude?: number];
export type GeoJSONGeometry =
  | { readonly type: "Point"; readonly coordinates: GeoJSONPosition }
  | { readonly type: "MultiPoint"; readonly coordinates: readonly GeoJSONPosition[] }
  | { readonly type: "LineString"; readonly coordinates: readonly GeoJSONPosition[] }
  | { readonly type: "MultiLineString"; readonly coordinates: readonly (readonly GeoJSONPosition[])[] }
  | { readonly type: "Polygon"; readonly coordinates: readonly (readonly GeoJSONPosition[])[] }
  | { readonly type: "MultiPolygon"; readonly coordinates: readonly (readonly (readonly GeoJSONPosition[])[])[] }
  | { readonly type: "GeometryCollection"; readonly geometries: readonly GeoJSONGeometry[] };

export interface GeometryContract {
  readonly contractVersion: "spec266-geometry-v1";
  readonly geometryId: string;
  readonly geometryVersion: string;
  readonly sourceGeometryId: string;
  /** RFC 7946 axis order: longitude, latitude. No implicit CRS transform occurs here. */
  readonly crs: "OGC:CRS84";
  readonly precisionClass: GeometryPrecisionClass;
  readonly geometry: GeoJSONGeometry;
}

export type GeometryContractResult =
  | { readonly ok: true; readonly value: GeometryContract }
  | { readonly ok: false; readonly code: "GEOMETRY_INVALID" | "GEOMETRY_UNKNOWN_FIELD" | "GEOMETRY_CRS_UNSUPPORTED" | "GEOMETRY_COMPLEXITY_LIMIT" };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const PRECISION = new Set<GeometryPrecisionClass>(["coarse", "standard", "survey_grade", "unknown"]);
const MAX_POSITIONS = 100_000;
const MAX_GEOMETRIES = 10_000;
const MAX_GEOMETRY_DEPTH = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key) && !allowed.has(key)) return false;
  }
  return true;
}

const GEOMETRY_FIELDS = new Set(["type", "coordinates"]);
const COLLECTION_FIELDS = new Set(["type", "geometries"]);
const CONTRACT_FIELDS = new Set(["contractVersion", "geometryId", "geometryVersion", "sourceGeometryId", "crs", "precisionClass", "geometry"]);

function isBoundedDenseArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value)) return false;
  if (value.length > maximum) throw new Error("GEOMETRY_COMPLEXITY_LIMIT");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
  }
  return true;
}

function isPosition(value: unknown, budget: { positions: number }): value is GeoJSONPosition {
  budget.positions += 1;
  if (budget.positions > MAX_POSITIONS) throw new Error("GEOMETRY_COMPLEXITY_LIMIT");
  return isBoundedDenseArray(value, 3) && (value.length === 2 || value.length === 3) &&
    value.every(coordinate => typeof coordinate === "number" && Number.isFinite(coordinate)) &&
    value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90;
}

function parseLine(value: unknown, budget: { positions: number }): value is GeoJSONPosition[] {
  return isBoundedDenseArray(value, MAX_POSITIONS) && value.length >= 2 && value.every(position => isPosition(position, budget));
}

function samePosition(left: GeoJSONPosition, right: GeoJSONPosition): boolean {
  return left.length === right.length && left.every((coordinate, index) => coordinate === right[index]);
}

function copyPosition(position: GeoJSONPosition): GeoJSONPosition {
  return [...position] as unknown as GeoJSONPosition;
}

function parseRing(value: unknown, budget: { positions: number }): value is GeoJSONPosition[] {
  if (!isBoundedDenseArray(value, MAX_POSITIONS) || value.length < 4 || !value.every(position => isPosition(position, budget))) return false;
  return samePosition(value[0]!, value[value.length - 1]!);
}

function parseGeometry(value: unknown, budget: { positions: number; geometries: number }, depth: number): GeoJSONGeometry | undefined {
  budget.geometries += 1;
  if (budget.geometries > MAX_GEOMETRIES) throw new Error("GEOMETRY_COMPLEXITY_LIMIT");
  if (depth > MAX_GEOMETRY_DEPTH) return undefined;
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  switch (value.type) {
    case "Point":
      if (!hasOnlyFields(value, GEOMETRY_FIELDS) || !isPosition(value.coordinates, budget)) return undefined;
      return { type: "Point", coordinates: copyPosition(value.coordinates) };
    case "MultiPoint":
      if (!hasOnlyFields(value, GEOMETRY_FIELDS) || !isBoundedDenseArray(value.coordinates, MAX_POSITIONS) || !value.coordinates.every(position => isPosition(position, budget))) return undefined;
      return { type: "MultiPoint", coordinates: value.coordinates.map(copyPosition) };
    case "LineString":
      if (!hasOnlyFields(value, GEOMETRY_FIELDS) || !parseLine(value.coordinates, budget)) return undefined;
      return { type: "LineString", coordinates: value.coordinates.map(copyPosition) };
    case "MultiLineString":
      if (!hasOnlyFields(value, GEOMETRY_FIELDS) || !isBoundedDenseArray(value.coordinates, MAX_GEOMETRIES) || !value.coordinates.every(line => parseLine(line, budget))) return undefined;
      return { type: "MultiLineString", coordinates: value.coordinates.map(line => line.map(copyPosition)) };
    case "Polygon":
      if (!hasOnlyFields(value, GEOMETRY_FIELDS) || !isBoundedDenseArray(value.coordinates, MAX_GEOMETRIES) || value.coordinates.length === 0 || !value.coordinates.every(ring => parseRing(ring, budget))) return undefined;
      return { type: "Polygon", coordinates: value.coordinates.map(ring => ring.map(copyPosition)) };
    case "MultiPolygon":
      if (!hasOnlyFields(value, GEOMETRY_FIELDS) || !isBoundedDenseArray(value.coordinates, MAX_GEOMETRIES) || !value.coordinates.every(polygon => isBoundedDenseArray(polygon, MAX_GEOMETRIES) && polygon.length > 0 && polygon.every(ring => parseRing(ring, budget)))) return undefined;
      return { type: "MultiPolygon", coordinates: value.coordinates.map(polygon => polygon.map(ring => ring.map(copyPosition))) };
    case "GeometryCollection": {
      if (!hasOnlyFields(value, COLLECTION_FIELDS) || !isBoundedDenseArray(value.geometries, MAX_GEOMETRIES)) return undefined;
      const geometries = value.geometries.map(geometry => parseGeometry(geometry, budget, depth + 1));
      if (geometries.some(geometry => geometry === undefined)) return undefined;
      return { type: "GeometryCollection", geometries: geometries as GeoJSONGeometry[] };
    }
    default:
      return undefined;
  }
}

/** Validates bounded RFC 7946 geometry and explicit source/version metadata without relabeling CRS. */
export function parseGeometryContract(value: unknown): GeometryContractResult {
  if (!isRecord(value)) return { ok: false, code: "GEOMETRY_INVALID" };
  if (!hasOnlyFields(value, CONTRACT_FIELDS)) return { ok: false, code: "GEOMETRY_UNKNOWN_FIELD" };
  if (value.crs !== "OGC:CRS84") return { ok: false, code: "GEOMETRY_CRS_UNSUPPORTED" };
  if (value.contractVersion !== "spec266-geometry-v1" ||
    ![value.geometryId, value.geometryVersion, value.sourceGeometryId].every(item => typeof item === "string" && ID.test(item)) ||
    typeof value.precisionClass !== "string" || !PRECISION.has(value.precisionClass as GeometryPrecisionClass)) return { ok: false, code: "GEOMETRY_INVALID" };
  const budget = { positions: 0, geometries: 0 };
  try {
    const geometry = parseGeometry(value.geometry, budget, 0);
    if (!geometry) return { ok: false, code: "GEOMETRY_INVALID" };
    return {
      ok: true,
      value: {
        contractVersion: "spec266-geometry-v1",
        geometryId: value.geometryId as string,
        geometryVersion: value.geometryVersion as string,
        sourceGeometryId: value.sourceGeometryId as string,
        crs: "OGC:CRS84",
        precisionClass: value.precisionClass as GeometryPrecisionClass,
        geometry,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.message === "GEOMETRY_COMPLEXITY_LIMIT") return { ok: false, code: "GEOMETRY_COMPLEXITY_LIMIT" };
    return { ok: false, code: "GEOMETRY_INVALID" };
  }
}
