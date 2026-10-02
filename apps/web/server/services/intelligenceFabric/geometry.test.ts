import { describe, expect, it } from "vitest";

import { parseGeometryContract } from "./geometry";

const contract = (geometry: unknown, overrides: Record<string, unknown> = {}) => ({
  contractVersion: "spec266-geometry-v1",
  geometryId: "geometry-1",
  geometryVersion: "boundary-v1",
  sourceGeometryId: "source-geometry-1",
  crs: "OGC:CRS84",
  precisionClass: "standard",
  geometry,
  ...overrides,
});

describe("Spec 266 canonical geometry contract", () => {
  it("accepts GeoJSON positions in explicit CRS84 longitude-latitude order", () => {
    expect(parseGeometryContract(contract({ type: "Point", coordinates: [100.5, 13.7] }))).toMatchObject({
      ok: true,
      value: { crs: "OGC:CRS84", geometry: { type: "Point", coordinates: [100.5, 13.7] } },
    });
  });

  it("accepts bounded polygons only when every ring is closed and has four positions", () => {
    const polygon = { type: "Polygon", coordinates: [[[100, 13], [101, 13], [101, 14], [100, 13]]] };
    expect(parseGeometryContract(contract(polygon)).ok).toBe(true);
    expect(parseGeometryContract(contract({ type: "Polygon", coordinates: [[[100, 13], [101, 13], [101, 14], [100, 14]]] })).ok).toBe(false);
  });

  it("rejects unsupported CRS instead of silently relabeling untransformed coordinates", () => {
    expect(parseGeometryContract(contract({ type: "Point", coordinates: [100, 13] }, { crs: "EPSG:3857" }))).toMatchObject({
      ok: false,
      code: "GEOMETRY_CRS_UNSUPPORTED",
    });
  });

  it("rejects out-of-range, non-finite, and malformed coordinate values", () => {
    for (const geometry of [
      { type: "Point", coordinates: [181, 13] },
      { type: "Point", coordinates: [100, Number.NaN] },
      { type: "LineString", coordinates: [[100, 13]] },
      { type: "MultiPolygon", coordinates: "not-coordinates" },
    ]) {
      expect(parseGeometryContract(contract(geometry)).ok).toBe(false);
    }
  });

  it("rejects sparse coordinate and geometry arrays that would skip validation callbacks", () => {
    const sparsePosition = new Array(2);
    sparsePosition[0] = 100;
    const sparseLine = [[100, 13], , [101, 14]];
    const sparseRing = [[100, 13], [101, 13], , [100, 13]];
    const sparseCollection = [{ type: "Point", coordinates: [100, 13] }, , { type: "Point", coordinates: [101, 14] }];
    const hugeSparse = new Array(100_001);

    expect(parseGeometryContract(contract({ type: "Point", coordinates: sparsePosition })).ok).toBe(false);
    expect(parseGeometryContract(contract({ type: "LineString", coordinates: sparseLine })).ok).toBe(false);
    expect(parseGeometryContract(contract({ type: "Polygon", coordinates: [sparseRing] })).ok).toBe(false);
    expect(parseGeometryContract(contract({ type: "GeometryCollection", geometries: sparseCollection })).ok).toBe(false);
    expect(parseGeometryContract(contract({ type: "GeometryCollection", geometries: hugeSparse }))).toMatchObject({ ok: false, code: "GEOMETRY_COMPLEXITY_LIMIT" });
  });

  it("rejects sparse MultiPoint, MultiLineString, and MultiPolygon arrays at every nesting level", () => {
    const sparseMultiPoint = new Array(2);
    sparseMultiPoint[0] = [100, 13];

    const sparseMultiLineOuter = new Array(2);
    sparseMultiLineOuter[0] = [[100, 13], [101, 14]];
    const sparseMultiLineInner = [[100, 13], , [101, 14]];

    const ring = [[100, 13], [101, 13], [101, 14], [100, 13]];
    const sparseMultiPolygonOuter = new Array(2);
    sparseMultiPolygonOuter[0] = [ring];
    const sparseMultiPolygonRings = new Array(2);
    sparseMultiPolygonRings[0] = ring;

    expect(parseGeometryContract(contract({ type: "MultiPoint", coordinates: sparseMultiPoint })).ok).toBe(false);
    expect(parseGeometryContract(contract({ type: "MultiLineString", coordinates: sparseMultiLineOuter })).ok).toBe(false);
    expect(parseGeometryContract(contract({ type: "MultiLineString", coordinates: [sparseMultiLineInner] })).ok).toBe(false);
    expect(parseGeometryContract(contract({ type: "MultiPolygon", coordinates: sparseMultiPolygonOuter })).ok).toBe(false);
    expect(parseGeometryContract(contract({ type: "MultiPolygon", coordinates: [sparseMultiPolygonRings] })).ok).toBe(false);
  });

  it("enforces coordinate and nesting budgets before returning geometry", () => {
    const tooManyPoints = { type: "LineString", coordinates: Array.from({ length: 100_001 }, () => [100, 13]) };
    expect(parseGeometryContract(contract(tooManyPoints))).toMatchObject({ ok: false, code: "GEOMETRY_COMPLEXITY_LIMIT" });
    let nested: unknown = { type: "GeometryCollection", geometries: [] };
    for (let index = 0; index < 10; index += 1) nested = { type: "GeometryCollection", geometries: [nested] };
    expect(parseGeometryContract(contract(nested))).toMatchObject({ ok: false, code: "GEOMETRY_INVALID" });
  });
});
