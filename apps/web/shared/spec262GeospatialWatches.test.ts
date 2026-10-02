import { describe, expect, it } from "vitest";
import { evaluateGeospatialWatchTransition, parseGeospatialWatch, type GeospatialWatch } from "../../packages/shared/src/emergency/geospatialWatches";

const base = {
  schemaVersion: 1,
  id: "watch-01",
  ownerId: "user-01",
  tenantId: "tenant-01",
  revision: 1,
  scope: { type: "area", geometry: { type: "Polygon", coordinates: [[[100, 13], [101, 13], [101, 14], [100, 14], [100, 13]]] } },
  condition: { kind: "river-level-above", stationRef: { type: "station", id: "station-01", revision: 2 }, threshold: 3.2, unit: "m" },
  status: "active",
  createdAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-10-02T00:00:00Z",
  notifyOn: ["enter", "material-update"],
} as const;

describe("geospatial watches", () => {
  it("accepts bounded owner-scoped watch definitions and rejects invalid or unclosed geometry", () => {
    expect(parseGeospatialWatch(base)).toMatchObject({ id: "watch-01", status: "active" });
    expect(parseGeospatialWatch({ ...base, ownerId: "" })).toBeUndefined();
    expect(parseGeospatialWatch({ ...base, scope: { type: "area", geometry: { type: "Polygon", coordinates: [[[100, 13], [101, 13], [101, 14], [100, 14]]] } } })).toBeUndefined();
    expect(parseGeospatialWatch({ ...base, expiresAt: "2026-09-30T00:00:00Z" })).toBeUndefined();
  });

  it("rejects area watches whose polygon edges cross the antimeridian", () => {
    const crossing = {
      ...base,
      scope: { type: "area", geometry: { type: "Polygon", coordinates: [[[179, 10], [-179, 10], [-179, 11], [179, 11], [179, 10]]] } },
    };
    expect(parseGeospatialWatch(crossing)).toBeUndefined();
  });

  it("makes stale/unknown inputs non-clear and creates one stable transition intent", () => {
    const watch = parseGeospatialWatch(base) as GeospatialWatch;
    expect(evaluateGeospatialWatchTransition(watch, { state: "clear", observedAt: "2026-10-01T00:10:00Z", sourceFresh: false, eventRef: "evt-1" }, "2026-10-01T00:11:00Z").kind).toBe("unknown");
    const signal = { state: "triggered" as const, observedAt: "2026-10-01T00:10:00Z", sourceFresh: true, eventRef: "evt-1", changeKind: "enter" as const };
    const first = evaluateGeospatialWatchTransition(watch, signal, "2026-10-01T00:11:00Z");
    const retry = evaluateGeospatialWatchTransition(watch, signal, "2026-10-01T00:11:00Z");
    expect(first.kind).toBe("notify");
    expect(retry).toEqual(first);
    expect(evaluateGeospatialWatchTransition(watch, signal, "2026-10-03T00:00:00Z").kind).toBe("expired");
  });
});
