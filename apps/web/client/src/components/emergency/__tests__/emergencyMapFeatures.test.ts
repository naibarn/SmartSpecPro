import { describe, expect, it } from "vitest";
import { getEmergencyMapCoordinates, isEmergencyMapItemSelectable, toEmergencyAlertAreaFeatureCollection, toMapContextReference, toPublicMapFeatureCollection } from "../emergencyMapFeatures";

describe("public emergency map features", () => {
  it("maps only valid public coordinates and allowlisted marker properties", () => {
    const item = { kind: "situation", publicRef: "EVT-123", title: "Flood response", status: "active", freshness: "current",
      location: { latitude: 14.1234, longitude: 100.4321 }, privateLocation: { latitude: 14.1, longitude: 100.4 } };
    const collection = toPublicMapFeatureCollection([
      item,
      { kind: "facility", title: "Invalid", location: { latitude: 91, longitude: 0 } },
    ]);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]).toMatchObject({
      geometry: { type: "Point", coordinates: [100.4321, 14.1234] },
      properties: { kind: "situation", publicRef: "EVT-123", title: "Flood response", status: "active", freshness: "current" },
    });
    expect(collection.features[0].properties).not.toHaveProperty("privateLocation");
  });

  it("rejects malformed and out-of-range point coordinates", () => {
    expect(getEmergencyMapCoordinates({ location: null })).toBeNull();
    expect(getEmergencyMapCoordinates({ location: { latitude: 0, longitude: Infinity } })).toBeNull();
    expect(getEmergencyMapCoordinates({ location: { latitude: -91, longitude: 0 } })).toBeNull();
    expect(getEmergencyMapCoordinates({ location: { latitude: "10", longitude: "10" } })).toBeNull();
  });

  it("creates a chat context reference only from a canonical public ref and real revision", () => {
    expect(toMapContextReference({ kind: "situation", publicRef: "EVT-123", revision: 4 }))
      .toEqual({ type: "incident", id: "EVT-123", revision: 4 });
    expect(toMapContextReference({ kind: "facility", publicRef: "clinic-1" })).toBeNull();
    expect(toMapContextReference({ kind: "alert", publicRef: "ALT-1", revision: 0 })).toBeNull();
    expect(toMapContextReference({ kind: "unknown", publicRef: "item-1", revision: 1 })).toBeNull();
  });

  it("projects only active, normalized alert polygons as area features", () => {
    const area = { type: "Polygon", coordinates: [[[100.01, 13.01], [100.11, 13.01], [100.11, 13.11], [100.01, 13.11], [100.01, 13.01]]] };
    const collection = toEmergencyAlertAreaFeatureCollection([
      { kind: "alert", status: "published", publicRef: "ALT-1", publicGeometry: area },
      { kind: "alert", status: "cancelled", publicGeometry: area },
      { kind: "situation", status: "active", publicGeometry: area },
    ]);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.geometry).toEqual({ type: "Polygon", coordinates: [[[100, 13], [100.1, 13], [100.1, 13.1], [100, 13.1], [100, 13]]] });
  });

  it("keeps public alert areas keyboard-selectable even when they have no point coordinate", () => {
    const polygon = { type: "Polygon", coordinates: [[[100, 13], [100.1, 13], [100.1, 13.1], [100, 13.1], [100, 13]]] };
    expect(isEmergencyMapItemSelectable({ kind: "alert", publicGeometry: polygon })).toBe(true);
    expect(isEmergencyMapItemSelectable({ kind: "alert", publicGeometry: { type: "Point", coordinates: [999, 999] } })).toBe(false);
    expect(isEmergencyMapItemSelectable({ kind: "situation", location: null })).toBe(false);
  });
});
