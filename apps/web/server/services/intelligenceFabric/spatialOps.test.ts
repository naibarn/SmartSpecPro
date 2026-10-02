import { describe, expect, it } from "vitest";

import {
  classifyPointInArea,
  findNearestPoints,
  geodesicDistanceMeters,
  joinPointsToAreas,
} from "./spatialOps";
import type { GeometryContract } from "./geometry";

const point = (geometryId: string, coordinates: readonly [number, number]): GeometryContract => ({
  contractVersion: "spec266-geometry-v1",
  geometryId,
  geometryVersion: "v1",
  sourceGeometryId: `source-${geometryId}`,
  crs: "OGC:CRS84",
  precisionClass: "standard",
  geometry: { type: "Point", coordinates },
});

const polygon = (geometryId: string, coordinates: readonly (readonly (readonly [number, number])[])[]): GeometryContract => ({
  contractVersion: "spec266-geometry-v1",
  geometryId,
  geometryVersion: "v1",
  sourceGeometryId: `source-${geometryId}`,
  crs: "OGC:CRS84",
  precisionClass: "standard",
  geometry: { type: "Polygon", coordinates },
});

describe("Spec 266 bounded spatial operations", () => {
  it("calculates deterministic great-circle distances from CRS84 longitude-latitude coordinates", () => {
    expect(geodesicDistanceMeters([0, 0], [1, 0])).toBeCloseTo(111_195.08, 1);
    expect(geodesicDistanceMeters([100.5, 13.7], [100.5, 13.7])).toBe(0);
  });

  it("distinguishes inside, boundary, outside, and polygon holes without claiming accessibility", () => {
    const area = polygon("area-1", [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]],
    ]);

    expect(classifyPointInArea(point("inside", [2, 2]), area)).toBe("inside");
    expect(classifyPointInArea(point("boundary", [0, 5]), area)).toBe("boundary");
    expect(classifyPointInArea(point("hole", [5, 5]), area)).toBe("outside");
    expect(classifyPointInArea(point("outside", [11, 5]), area)).toBe("outside");
  });

  it("handles a CRS84 polygon that crosses the antimeridian without enclosing the opposite side of the world", () => {
    const dateLineArea = polygon("dateline-area", [[[179, 0], [-179, 0], [-179, 10], [179, 10], [179, 0]]]);

    expect(classifyPointInArea(point("dateline-inside", [180, 5]), dateLineArea)).toBe("inside");
    expect(classifyPointInArea(point("world-center", [0, 5]), dateLineArea)).toBe("outside");
  });

  it("joins points to containing areas in input order and preserves boundary relations", () => {
    const area = polygon("area-1", [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]);
    expect(joinPointsToAreas([point("point-2", [0, 5]), point("point-1", [5, 5]), point("point-3", [20, 20])], [area])).toEqual([
      { pointGeometryId: "point-2", areaGeometryId: "area-1", relation: "boundary" },
      { pointGeometryId: "point-1", areaGeometryId: "area-1", relation: "inside" },
    ]);
  });

  it("returns nearest points by distance and geometry id for deterministic ties", () => {
    expect(findNearestPoints(point("target", [0, 0]), [
      point("z-point", [1, 0]),
      point("a-point", [-1, 0]),
      point("far", [2, 0]),
    ], 2)).toEqual([
      { geometryId: "a-point", distanceMeters: expect.any(Number) },
      { geometryId: "z-point", distanceMeters: expect.any(Number) },
    ]);
  });

  it("rejects sparse, unsupported, unbounded, and non-CRS84 inputs instead of guessing", () => {
    const sparse = new Array<GeometryContract>(2);
    sparse[0] = point("first", [0, 0]);
    const line = { ...point("line", [0, 0]), geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] } } as unknown as GeometryContract;
    const unsupportedCrs = { ...point("wrong-crs", [0, 0]), crs: "EPSG:3857" } as unknown as GeometryContract;

    expect(() => findNearestPoints(point("target", [0, 0]), sparse, 1)).toThrow("SPATIAL_INPUT_INVALID");
    expect(() => classifyPointInArea(line, polygon("area", [[[0, 0], [1, 0], [1, 1], [0, 0]]]))).toThrow("SPATIAL_GEOMETRY_UNSUPPORTED");
    expect(() => findNearestPoints(unsupportedCrs, [point("other", [0, 0])], 1)).toThrow("SPATIAL_CRS_UNSUPPORTED");
    expect(() => geodesicDistanceMeters([0, 0, 0, 0] as unknown as readonly [number, number], [0, 0])).toThrow("SPATIAL_INPUT_INVALID");
    expect(() => findNearestPoints(point("target", [0, 0]), [point("other", [0, 0])], 101)).toThrow("SPATIAL_OPERATION_LIMIT");
  });

  it("fails closed at the runtime boundary for malformed and duplicate join inputs", () => {
    const area = polygon("area", [[[0, 0], [1, 0], [1, 1], [0, 0]]]);
    expect(() => joinPointsToAreas([null as unknown as GeometryContract], [area])).toThrow("SPATIAL_INPUT_INVALID");
    expect(() => joinPointsToAreas([point("duplicate", [0, 0]), point("duplicate", [0.5, 0.5])], [area])).toThrow("SPATIAL_INPUT_INVALID");
  });
});
