import { describe, expect, it } from "vitest";
import { normalizeGeoSourceRecord } from "./normalize";

const context = { providerId: "th-water-department", contractVersion: "1.0", sourceRef: "rid-river-levels", sourceRevision: 3, captureRef: "capture-001" };
const record = { itemRef: "station-001", observedAt: "2026-10-01T00:00:00.000Z", latitude: 13.7563, longitude: 100.5018, crs: "EPSG:4326", value: 1.25, unit: "m", originalValue: "1.25" };

describe("geo source normalization", () => {
  it("normalizes a strict WGS84 record while retaining its original value and provenance", () => {
    const result = normalizeGeoSourceRecord(context, record);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.geometry.coordinates).toEqual([100.5018, 13.7563]);
    expect(result.value.measurement).toMatchObject({ value: 1.25, unit: "m", originalValue: "1.25" });
    expect(result.value.provenance).toEqual(context);
  });

  it("quarantines malformed coordinates, timestamp, CRS, units, and oversized properties without coercion", () => {
    expect(normalizeGeoSourceRecord(context, { ...record, latitude: "13.7563" }).ok).toBe(false);
    expect(normalizeGeoSourceRecord(context, { ...record, observedAt: "yesterday" }).ok).toBe(false);
    expect(normalizeGeoSourceRecord(context, { ...record, observedAt: "2026-02-31T00:00:00.000Z" }).ok).toBe(false);
    expect(normalizeGeoSourceRecord(context, { ...record, crs: "EPSG:3857" }).ok).toBe(false);
    expect(normalizeGeoSourceRecord(context, { ...record, unit: "metres" }).ok).toBe(false);
    expect(normalizeGeoSourceRecord(context, { ...record, properties: { note: "x".repeat(4097) } }).ok).toBe(false);
  });

  it("does not convert or infer units and keeps bounded safe properties only", () => {
    const result = normalizeGeoSourceRecord(context, { ...record, properties: { stationName: "Bangkok river gauge", upstreamToken: "secret" } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.measurement.unit).toBe("m");
    expect(result.value.properties).toEqual({ stationName: "Bangkok river gauge" });
  });

  it("rejects unsupported or malformed provenance context and does not accept undeclared record fields", () => {
    expect(normalizeGeoSourceRecord({ ...context, sourceRevision: Number.MAX_SAFE_INTEGER + 1 }, record).ok).toBe(false);
    expect(normalizeGeoSourceRecord({ ...context, contractVersion: "" }, record).ok).toBe(false);
    expect(normalizeGeoSourceRecord(context, { ...record, accessToken: "must-not-be-ignored" }).ok).toBe(false);
  });
});
